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
  PLAN_RESELL, agencyBucketFor, canAccess, dataGet, dataPut, installSecret, nowIso, userFromToken, type Env, type SessionUser,
} from '../lib/db';
import { decryptSecret, encryptSecret } from '../lib/crypto';
import { DEFAULT_PROVIDER, providerChoices, providerFor, type ProviderContext } from '../lib/payments';
import { recordCommission } from '../lib/affiliate';

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
  /** Which published plan. The price comes from the plan, never the request. */
  planId?: string;
}

/** The install owner, and nobody else. */
const isOwner = (user: SessionUser) => user.accountId === null && user.role === 'agency';

/**
 * What a subscription costs, decided here and nowhere else.
 *
 * The price used to come out of the request body. Every signed-in sub-account
 * could therefore post `amount: 0.01` and subscribe itself to the top plan for
 * a penny — the browser was being trusted with the one number it has the
 * strongest possible reason to lie about. A plan id is a choice; a price is
 * not, and the two must not travel together.
 *
 * Mirrors `PLANS` in `src/services/tenancy.ts`, which is what the screens
 * render. If the two ever disagree, this one wins and the customer is charged
 * what it says — so a stale client cannot overcharge either.
 */
const PLAN_CENTS: Record<string, { name: string; cents: number }> = {
  starter: { name: 'Studio', cents: 4900 },
  pro: { name: 'Agency', cents: 9700 },
  agency: { name: 'Network', cents: 14900 },
};

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

  if (act === 'config') {
    /*
     * A sub-account is told whether they can pay, and nothing else.
     *
     * The full answer names the processor, its live-or-test mode, the operator's
     * last error and the webhook address. None of that is a credential, and all
     * of it is the operator's business — the processor's *name* most of all: a
     * reseller running this under their own brand should not have their
     * customers learn whose rails it sits on. That is the whole point of a
     * white label, and it was leaking from an endpoint nobody thought of as
     * sensitive because it holds no keys.
     */
    if (!isOwner(user)) {
      const current = await billingProcessor(env);
      return json({ success: true, billing: { connected: !!current } });
    }
    return json({ success: true, billing: await state() });
  }

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
    /* Your own workspace. Paying for somebody else's, then refunding, flipped
       their billing status to cancelled. */
    if (!user || !(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours to subscribe.', 403);

    /* The plan names the price. `amount` in the request is ignored entirely —
       it is not validated and then used, it is never read. */
    const planId = String(d.planId ?? '').trim();
    const plan = PLAN_CENTS[planId];
    if (!plan) {
      return fail('Choose one of the published plans. Prices are set by this app, not by the browser.');
    }
    const amountCents = plan.cents;
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
      /* The label may come from the caller — it is cosmetic and appears on the
         receipt. The figure beside it may not. */
      planName: String(d.planName ?? plan.name).slice(0, 200),
      amountCents,
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
    /* Which plan this checkout was for, for the webhook — the processor's
       event names the workspace and the amount, and a discounted amount no
       longer names a plan (planFromEvent). */
    await dataPut(env.DB, await agencyBucketFor(env.DB, accountId), `crm_billing_intent_${accountId}`,
      JSON.stringify({ planId, at: nowIso() })).catch(() => undefined);
    return json({ success: true, url: r.url, id: r.sessionId });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}

async function readJson(env: Env, bucket: string, key: string): Promise<Record<string, string | null | undefined>> {
  try { return JSON.parse((await dataGet(env.DB, bucket, key)) ?? '{}'); } catch { return {}; }
}

/**
 * The plan a payment bought: by its amount when that is exactly one plan's
 * price, otherwise the plan the workspace last went to checkout for (a coupon
 * changes the amount, not the plan).
 */
async function planFromEvent(env: Env, bucket: string, accountId: string, amountCents: number | undefined): Promise<string> {
  const byAmount = Object.entries(PLAN_CENTS).find(([, p]) => p.cents === amountCents)?.[0];
  if (byAmount) return byAmount;
  const intent = await readJson(env, bucket, `crm_billing_intent_${accountId}`);
  return PLAN_CENTS[String(intent.planId ?? '')] ? String(intent.planId) : '';
}

/**
 * What the subscription allows follows what was paid for.
 *
 * Nothing wrote `crm_plans` from a payment, so somebody who bought Agency or
 * Network stayed on Studio's two sub-accounts, and somebody who cancelled
 * kept whatever they had. A paid event sets the plan of the person who owns
 * the workspace; a cancellation or refund removes a plan that a processor
 * set. A plan the operator granted by hand (`source = 'manual'`) is theirs,
 * and a payment or a cancellation never overwrites it.
 */
async function applyPlan(
  env: Env, processor: string, accountId: string, bucket: string,
  event: { kind: string; amountCents?: number }, status: string,
): Promise<void> {
  const owner = await env.DB.prepare('SELECT owner_email FROM crm_workspaces WHERE account_id = ?')
    .bind(accountId).first<{ owner_email: string }>();
  if (!owner?.owner_email) return;
  if (status === 'cancelled') {
    await env.DB.prepare("DELETE FROM crm_plans WHERE owner_email = ? AND source NOT IN ('manual', 'default')")
      .bind(owner.owner_email).run();
    return;
  }
  if (status !== 'active') return;
  const planId = await planFromEvent(env, bucket, accountId, event.amountCents);
  if (!planId) return;
  await env.DB.prepare(
    `INSERT INTO crm_plans (owner_email, plan_id, resell_limit, source, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(owner_email) DO UPDATE SET plan_id = excluded.plan_id, resell_limit = excluded.resell_limit,
       source = excluded.source, updated_at = excluded.updated_at
     WHERE crm_plans.source <> 'manual'`,
  ).bind(owner.owner_email, planId, PLAN_RESELL[planId] ?? PLAN_RESELL.starter, processor, nowIso()).run();
  const st = await readJson(env, bucket, `crm_billing_status_${accountId}`);
  await dataPut(env.DB, bucket, `crm_billing_status_${accountId}`, JSON.stringify({ ...st, planId }));
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

  /*
   * Each delivery counts once.
   *
   * Creem signs the body and nothing else, so a delivery captured once stays
   * valid for ever — and this handler overwrote the billing status with no
   * other guard, so replaying an old "paid" reactivated a cancelled
   * subscription. The body's hash is recorded; the same body again is
   * acknowledged and ignored. (A processor's own retry of an event already
   * handled is exactly that case, so 200 is the right answer to it.)
   */
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
    const id = `billing:${[...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')}`;
    const fresh = await env.DB.prepare('INSERT OR IGNORE INTO crm_webhook_events (id, source, created_at) VALUES (?, ?, ?)')
      .bind(id, provider.id, nowIso()).run();
    if (!fresh.meta.changes) return new Response('ok (already handled)', { status: 200 });
  } catch { /* a database before 0049: carry on as before */ }

  /*
   * Two different things arrive on this endpoint.
   *
   * A subscription payment names a workspace; a Digital Business Setup payment
   * names an order. They are told apart by asking the setup table first, which
   * answers definitively — an order id is only ever an order id — rather than
   * by guessing from the shape of the reference. Only one of the two can be
   * true, so a matched setup order returns here and never falls through to be
   * written as a workspace's billing status.
   */
  if (event.kind === 'paid' && event.reference) {
    const { markSetupPaid } = await import('./setup');
    if (await markSetupPaid(env, event.reference)) return new Response('ok', { status: 200 });
  }

  const accountId = event.reference;
  /* An event this app does not act on says nothing about the subscription.
     It used to be written as "active", so a cancellation (unread) reactivated
     whoever it was about. */
  const status = event.kind === 'paid' ? 'active'
    : event.kind === 'refunded' || event.kind === 'cancelled' ? 'cancelled'
      : event.kind === 'failed' ? 'past_due'
        : '';
  if (accountId && status) {
    /* Billing state is kept under the agency's own namespace, the same place
       the dashboard reads it from, so a client cannot rewrite their own. Which
       agency that is cannot come from the caller here — the processor is the
       caller — so it comes from whoever owns the workspace being billed. */
    const bucket = await agencyBucketFor(env.DB, accountId);
    const before = await readJson(env, bucket, `crm_billing_status_${accountId}`);
    await dataPut(env.DB, bucket, `crm_billing_status_${accountId}`, JSON.stringify({
      status,
      subscriptionId: event.sessionId || null,
      /* Who the processor says paid — what "Manage billing" opens the portal
         for. Kept from before when this event does not name one. */
      customerId: event.customerId || before.customerId || null,
      planId: before.planId ?? null,
      updatedAt: nowIso(),
      lastEvent: event.kind,
      processor: provider.id,
    }));
    await applyPlan(env, provider.id, accountId, bucket, event, status);
  }

  /*
   * The affiliate program: 40% of each subscription payment from a referred
   * account. Only real subscription payments with an amount count, keyed on
   * the processor's event id so a retry cannot pay twice (lib/affiliate.ts).
   */
  if (accountId && event.kind === 'paid' && event.subscriptionPayment && (event.amountCents ?? 0) > 0) {
    await recordCommission(env, {
      accountId, amountCents: event.amountCents ?? 0, currency: event.currency || 'USD',
      eventKey: `${provider.id}:${event.eventId || event.sessionId}`,
    });
  }

  /* 200 for anything correctly signed, including events not acted on — a
     non-2xx makes the processor retry an event that was never going to
     matter. */
  return new Response('ok', { status: 200 });
}
