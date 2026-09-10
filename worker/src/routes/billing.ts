/**
 * How this app charges its own subscribers.
 *
 * ── Why this exists next to routes/stripe.ts ──
 *
 * That file bills with `env.STRIPE_SECRET_KEY`: one Worker secret, set once,
 * naming Stripe. It works, and it decides on the operator's behalf which
 * company they are allowed to be paid through — a strange thing for a
 * white-label product to insist on, and it made changing processor a code
 * change rather than a setting.
 *
 * So the processor moves into `crm_install_providers`, the table that already
 * holds the operator's own accounts for registrars and mailboxes. A payment
 * processor is another kind of account they own.
 *
 * ── The distinction this file must never blur ──
 *
 * There are two completely separate pots of money here:
 *
 *   this file          the operator charging their subscribers for the app
 *   routes/storefront  a subscriber charging *their* buyers for boilers
 *
 * They use different keys, different tables and different webhooks, and the
 * only thing they share is the provider code that talks to Stripe and Creem.
 * Crossing them would put a customer's trading revenue in the operator's
 * account, which is somebody else's money.
 *
 * ── Who may connect it ──
 *
 * Only the install owner — the single account with no workspace of its own.
 * A sub-account connecting the *install's* processor would be choosing who
 * gets paid for everybody.
 */
import { addr, body, fail, json } from '../lib/http';
import {
  agencyBucketFor, dataPut, installSecret, nowIso, userFromToken, type Env, type SessionUser,
} from '../lib/db';
import { decryptSecret, encryptSecret } from '../lib/crypto';
import { DEFAULT_PROVIDER, providerChoices, providerFor, type ProviderContext } from '../lib/payments';

const SECRET_KEY = 'mailbox_key';
const KIND = 'payments';

interface Row { provider: string; credentials: string; provider_ref: string; status: string; last_error: string }

interface Req {
  token?: string;
  action?: string;
  provider?: string;
  apiKey?: string;
  webhookSecret?: string;
  /* Starting a subscription. */
  accountId?: string;
  planName?: string;
  amount?: number;
  currency?: string;
  priceId?: string;
  customerEmail?: string;
  successUrl?: string;
  cancelUrl?: string;
}

/** The install owner, and nobody else. */
const isOwner = (user: SessionUser) => user.accountId === null && user.role === 'agency';

async function loadRow(env: Env): Promise<Row | null> {
  return env.DB.prepare('SELECT provider, credentials, provider_ref, status, last_error FROM crm_install_providers WHERE kind = ?')
    .bind(KIND).first<Row>();
}

/** {key, webhookSecret}, decrypted. Never leaves the Worker. */
async function loadCreds(env: Env, row: Row | null): Promise<{ key: string; webhookSecret: string }> {
  if (!row?.credentials) return { key: '', webhookSecret: '' };
  try {
    const secret = await installSecret(env.DB, SECRET_KEY);
    const c = JSON.parse(await decryptSecret(secret, row.credentials)) as { key?: string; webhookSecret?: string };
    return { key: c.key ?? '', webhookSecret: c.webhookSecret ?? '' };
  } catch {
    return { key: '', webhookSecret: '' };
  }
}

function contextFor(env: Env, row: Row | null): ProviderContext {
  return {
    providerRef: row?.provider_ref ?? '',
    companyName: 'Protected Central',
    remember: async (ref: string) => {
      await env.DB.prepare('UPDATE crm_install_providers SET provider_ref = ?, updated_at = ? WHERE kind = ?')
        .bind(ref.slice(0, 4000), nowIso(), KIND).run();
    },
  };
}

/**
 * What the app is set up to charge with.
 *
 * Falls back to the Worker secret so an install that was billing through
 * `STRIPE_SECRET_KEY` before any of this keeps billing, untouched, until
 * somebody connects a processor deliberately.
 */
export async function billingProcessor(env: Env): Promise<{
  id: string; key: string; webhookSecret: string; row: Row | null; legacy: boolean;
} | null> {
  const row = await loadRow(env);
  const creds = await loadCreds(env, row);
  if (creds.key) {
    return { id: row?.provider || DEFAULT_PROVIDER, key: creds.key, webhookSecret: creds.webhookSecret, row, legacy: false };
  }
  if (env.STRIPE_SECRET_KEY) {
    return {
      id: 'stripe', key: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? '', row: null, legacy: true,
    };
  }
  return null;
}

export async function handleBilling(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });

  const act = d.action ?? 'config';
  const origin = new URL(req.url).origin;

  const state = async () => {
    const row = await loadRow(env);
    const creds = await loadCreds(env, row);
    const current = await billingProcessor(env);
    const provider = providerFor(current?.id ?? DEFAULT_PROVIDER);
    return {
      provider: current?.id ?? null,
      providerLabel: provider?.label ?? null,
      connected: !!current,
      mode: current && provider ? provider.modeOf(current.key) : null,
      webhookSet: !!creds.webhookSecret,
      /* True while the app is still billing through the old Worker secret.
         Said out loud: it is a working setup that nobody chose, and the screen
         should not present it as a deliberate one. */
      usingDeploymentSecret: !!current?.legacy,
      status: row?.status ?? 'unknown',
      lastError: row?.last_error ?? '',
      webhookUrl: `${origin}/api/billing-webhook.php`,
      choices: providerChoices(),
    };
  };

  if (act === 'config') return json({ success: true, billing: await state() });

  /* ── Connecting it: the owner's decision alone ── */
  if (act === 'connect' || act === 'disconnect' || act === 'test') {
    if (!isOwner(user)) {
      return fail('Only the install owner can change how this app is paid.', 403);
    }

    if (act === 'disconnect') {
      await env.DB.prepare('DELETE FROM crm_install_providers WHERE kind = ?').bind(KIND).run();
      return json({ success: true, billing: await state() });
    }

    if (act === 'test') {
      const current = await billingProcessor(env);
      if (!current) return fail('No payment processor is connected yet.');
      const provider = providerFor(current.id);
      if (!provider) return fail(`"${current.id}" is not a processor this app supports.`);
      const r = await provider.verify(current.key);
      await env.DB.prepare(
        "UPDATE crm_install_providers SET status = ?, last_error = ?, updated_at = ? WHERE kind = ?",
      ).bind(r.ok ? 'ok' : 'failed', r.ok ? '' : r.error.slice(0, 500), nowIso(), KIND).run();
      if (!r.ok) {
        return json({
          success: false, error: r.error, message: r.error,
          diagnosis: { summary: r.error, steps: r.steps }, billing: await state(),
        });
      }
      return json({
        success: true,
        account: { name: r.name, mode: r.mode, chargesEnabled: r.chargesEnabled },
        billing: await state(),
      });
    }

    const wanted = String(d.provider ?? DEFAULT_PROVIDER);
    const provider = providerFor(wanted);
    if (!provider) return fail(`"${wanted}" is not a payment processor this app supports.`);

    const row = await loadRow(env);
    const existing = await loadCreds(env, row);
    const switching = !!row?.provider && row.provider !== wanted;

    const given = String(d.apiKey ?? '').trim();
    if (!given && (switching || !existing.key)) {
      return fail(`Paste your ${provider.label} key.`);
    }
    if (given) {
      const complaint = provider.validateKey(given);
      if (complaint) return fail(complaint);
    }
    const key = given || existing.key;
    const wh = String(d.webhookSecret ?? '').trim() || (switching ? '' : existing.webhookSecret);

    const secret = await installSecret(env.DB, SECRET_KEY);
    await env.DB.prepare(
      `INSERT INTO crm_install_providers (kind, provider, credentials, provider_ref, status, last_error, updated_at)
       VALUES (?,?,?,?, 'unknown', '', ?)
       ON CONFLICT(kind) DO UPDATE SET
         provider=excluded.provider, credentials=excluded.credentials,
         provider_ref=excluded.provider_ref, status='unknown', last_error='', updated_at=excluded.updated_at`,
    ).bind(
      KIND, wanted, await encryptSecret(secret, JSON.stringify({ key, webhookSecret: wh })),
      /* Anything the old processor had us remember means nothing to the new
         one — a Stripe price id is not a Creem product id. */
      switching ? '' : (row?.provider_ref ?? ''),
      nowIso(),
    ).run();

    return json({ success: true, billing: await state() });
  }

  /* ── Starting a subscription ── */
  if (act === 'checkout') {
    const current = await billingProcessor(env);
    if (!current) {
      return fail('This deployment cannot take subscription payments yet — the owner has not connected a payment processor.');
    }
    const provider = providerFor(current.id);
    if (!provider) return fail(`"${current.id}" is not a processor this app supports.`);

    const accountId = String(d.accountId ?? '').trim();
    if (!accountId) return fail('Which workspace is being subscribed?');

    const amount = Number(d.amount);
    if (!Number.isFinite(amount) || amount <= 0) return fail('A subscription needs a price above zero.');
    const currency = (String(d.currency ?? 'USD') || 'USD').toUpperCase();
    if (provider.currencies.length && !provider.currencies.includes(currency)) {
      return fail(`${provider.label} cannot bill in ${currency} — it accepts ${provider.currencies.join(' and ')}.`);
    }

    /* Return addresses are forced onto this deployment's own origin. Taking one
       from the request would let a crafted link send a paying customer
       somewhere else after they had entered their card. */
    const safe = (given: unknown, fallback: string) => {
      try {
        const u = new URL(String(given ?? ''), origin);
        return u.origin === origin ? u.toString() : origin + fallback;
      } catch { return origin + fallback; }
    };

    const r = await provider.subscribe(current.key, {
      reference: accountId,
      planName: String(d.planName ?? 'Subscription').slice(0, 200),
      amountCents: Math.round(amount * 100),
      currency,
      email: addr(d.customerEmail) ?? '',
      successUrl: safe(d.successUrl, '/billing?checkout=success'),
      cancelUrl: safe(d.cancelUrl, '/billing?checkout=cancelled'),
      priceId: String(d.priceId ?? '').trim() || undefined,
    }, contextFor(env, current.row));

    if (!r.ok) {
      return json({
        success: false, error: r.error, message: r.error,
        ...(r.steps.length ? { diagnosis: { summary: r.error, steps: r.steps } } : {}),
      });
    }
    return json({ success: true, url: r.url, id: r.sessionId });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}

/**
 * The processor telling us a subscriber paid.
 *
 * One endpoint for the whole install, because there is one operator account
 * behind it — unlike the storefront webhook, where every workspace has its own
 * key and the address has to name which.
 */
export async function handleBillingWebhook(req: Request, env: Env): Promise<Response> {
  const current = await billingProcessor(env);
  if (!current?.webhookSecret) return new Response('webhook-not-configured', { status: 500 });
  const provider = providerFor(current.id);
  if (!provider) return new Response('unknown-provider', { status: 400 });

  const payload = await req.text();
  if (!(await provider.verifySignature(current.webhookSecret, payload, req.headers))) {
    return new Response('bad-signature', { status: 400 });
  }

  const event = provider.readEvent(payload);
  if (!event) return new Response('bad-json', { status: 400 });

  const accountId = event.reference;
  if (accountId) {
    const status = event.kind === 'paid' ? 'active'
      : event.kind === 'refunded' ? 'cancelled'
        : event.kind === 'failed' ? 'past_due'
          : 'active';

    /* Billing state is kept under the agency's own namespace, the same place
       the dashboard reads it from, so a client cannot rewrite their own. Which
       agency that is cannot come from the caller here — the processor is the
       caller — so it comes from whoever owns the workspace being billed. */
    await dataPut(env.DB, await agencyBucketFor(env.DB, accountId), `crm_billing_status_${accountId}`, JSON.stringify({
      status,
      subscriptionId: event.sessionId || null,
      updatedAt: nowIso(),
      lastEvent: event.kind,
      processor: provider.id,
    }));
  }

  /* 200 for anything correctly signed, including events not acted on — a
     non-2xx makes the processor retry an event that was never going to
     matter. */
  return new Response('ok', { status: 200 });
}
