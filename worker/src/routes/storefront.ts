/**
 * Taking money for a customer's own products.
 *
 * ── Whose account, always ──
 *
 * `routes/stripe.ts` charges with `env.STRIPE_SECRET_KEY` — a Worker secret,
 * the *operator's* account — and it bills customers for their subscription to
 * this app. Reaching for it here would be the obvious shortcut and a serious
 * error: a plumber's buyer paying for a £400 boiler service would be paying
 * into the operator's balance. That is somebody else's money held without
 * agreement, and in most places it is money transmission.
 *
 * So the storefront charges on an account the customer connects themselves,
 * whichever processor they use.
 *
 * ── Which processor ──
 *
 * Stripe or Creem, per workspace, and nothing here knows the difference —
 * `lib/payments` does. The two are genuinely unalike: Stripe is a gateway that
 * charges a card for any amount in most currencies; Creem is a merchant of
 * record that sells the thing for you, in dollars or euros, against a product
 * that has to exist. Those differences are surfaced rather than hidden, because
 * a screen that hides them tells a customer their order will go through when it
 * will not.
 *
 * ── What this is, exactly ──
 *
 * A payment link against an order that already exists. There is no public
 * storefront page in this app, and inventing one here would be a second website
 * builder. What a small business actually needs first is this: record the
 * order, send the buyer a link, know when it is paid without asking.
 */
import { addr, body, fail, json } from '../lib/http';
import { canAccess, installSecret, nowIso, userFromToken, type Env } from '../lib/db';
import { decryptSecret, encryptSecret } from '../lib/crypto';
import { DEFAULT_PROVIDER, providerChoices, providerFor, type ProviderContext } from '../lib/payments';

const SECRET_KEY = 'mailbox_key';

interface Row {
  account_id: string;
  provider: string;
  api_key: string;
  provider_ref: string;
  webhook_secret: string;
  success_url: string;
  cancel_url: string;
  currency: string;
  verified_at: string | null;
  last_error: string;
}

interface Req {
  token?: string;
  action?: string;
  accountId?: string;
  provider?: string;
  /** The processor's secret. `stripeKey` is still read so an older bundle in
   *  somebody's open tab keeps working through a deploy. */
  apiKey?: string;
  stripeKey?: string;
  webhookSecret?: string;
  successUrl?: string;
  cancelUrl?: string;
  currency?: string;
  orderId?: string;
}

/** An absolute URL a buyer can be sent to. Their own site, not ours. */
function returnUrl(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    if (u.username || u.password) return '';
    return u.toString().slice(0, 500);
  } catch { return ''; }
}

async function loadRow(env: Env, accountId: string): Promise<Row | null> {
  return env.DB.prepare('SELECT * FROM crm_storefront WHERE account_id = ?')
    .bind(accountId).first<Row>();
}

/** The decrypted key, or ''. Never leaves the Worker. */
async function loadKey(env: Env, row: Row | null): Promise<string> {
  if (!row?.api_key) return '';
  try {
    return await decryptSecret(await installSecret(env.DB, SECRET_KEY), row.api_key);
  } catch {
    return '';
  }
}

/** Whether this workspace can be paid through — read by other modules. */
export async function storefrontReady(env: Env, accountId: string): Promise<boolean> {
  const row = await loadRow(env, accountId);
  return !!row?.api_key && !!row.verified_at;
}

/** What the connected processor is called, for anything that mentions it. */
export async function storefrontLabel(env: Env, accountId: string): Promise<string> {
  const row = await loadRow(env, accountId);
  const id = row?.provider || DEFAULT_PROVIDER;
  return providerFor(id)?.label ?? id;
}

/**
 * The currency this workspace trades in.
 *
 * Lives here rather than in commerce because it is the same setting the
 * checkout charges in — two copies of that number is a product priced in
 * pounds and billed in dollars.
 */
export async function storefrontCurrency(env: Env, accountId: string): Promise<string> {
  const row = await loadRow(env, accountId);
  return row?.currency || 'USD';
}

/**
 * Does anything on this order have to be posted?
 *
 * A line is physical if the product it names comes from a supplier. An 'own'
 * product might be either, and guessing wrong in that direction costs a buyer
 * an address form they did not need — guessing wrong in the other costs a
 * parcel that cannot be sent, so the supplier flag is the one that decides.
 */
async function needsShipping(
  env: Env, accountId: string, lines: { productId?: string }[],
): Promise<boolean> {
  for (const l of lines) {
    const id = String(l.productId ?? '');
    if (!id) continue;
    const p = await env.DB.prepare(
      "SELECT 1 AS n FROM crm_products WHERE id = ? AND account_id = ? AND source != 'own' AND supplier_ref != ''",
    ).bind(id, accountId).first();
    if (p) return true;
  }
  return false;
}

/** What the provider is allowed to remember between calls. */
function contextFor(env: Env, accountId: string, row: Row | null, companyName: string): ProviderContext {
  return {
    providerRef: row?.provider_ref ?? '',
    companyName,
    remember: async (ref: string) => {
      await env.DB.prepare('UPDATE crm_storefront SET provider_ref = ?, updated_at = ? WHERE account_id = ?')
        .bind(ref.slice(0, 200), nowIso(), accountId).run();
    },
  };
}

async function companyFor(env: Env, accountId: string): Promise<string> {
  const row = await env.DB.prepare("SELECT v FROM crm_data WHERE account_id = ? AND k = 'crm_onboarding'")
    .bind(accountId).first<{ v: string }>();
  try {
    return String((JSON.parse(row?.v ?? '{}') as { companyName?: string }).companyName ?? '');
  } catch { return ''; }
}

/**
 * A checkout link for one order, on the workspace's own processor.
 *
 * Exported because Autopilot chases unpaid orders from the cron, where there is
 * no request to run a route handler from — and a second implementation of *take
 * somebody's money* is the last thing in this codebase worth duplicating.
 * `origin` is passed rather than read, because a scheduled run has no incoming
 * URL to take it from.
 */
export async function createPayLink(
  env: Env, accountId: string, orderId: string, origin: string,
): Promise<{ ok: boolean; url: string; sessionId: string; error: string; steps: string[]; expiresNote: string }> {
  const no = (error: string, steps: string[] = []) =>
    ({ ok: false, url: '', sessionId: '', error, steps, expiresNote: '' });

  const row = await loadRow(env, accountId);
  const provider = providerFor(row?.provider || DEFAULT_PROVIDER);
  if (!provider) return no('This workspace is connected to a payment processor this app no longer supports.');

  const key = await loadKey(env, row);
  if (!key) return no(`Connect ${provider.label} under “Getting paid” before asking a buyer to pay.`);

  const order = await env.DB.prepare(
    'SELECT id, email, items, total_cents, currency, status FROM crm_orders WHERE id = ? AND account_id = ?',
  ).bind(orderId, accountId).first<{
    id: string; email: string; items: string; total_cents: number; currency: string; status: string;
  }>();
  if (!order) return no('That order is not in this workspace.');
  if (order.status === 'paid' || order.status === 'fulfilled') return no('That order is already paid.');
  if (order.status === 'cancelled' || order.status === 'refunded') return no('That order is cancelled — record a new one.');
  if (order.total_cents <= 0) return no('An order worth nothing cannot be paid for.');

  let lines: { productId?: string; name?: string; qty?: number; priceCents?: number }[] = [];
  try { lines = JSON.parse(order.items) as typeof lines; } catch { lines = []; }
  if (!lines.length) return no('That order has no lines to charge for.');

  const currency = (order.currency || row?.currency || 'USD').toUpperCase();
  /* Refused here, by name, rather than by the processor in front of a buyer.
     An empty `currencies` means the processor takes most of them. */
  if (provider.currencies.length && !provider.currencies.includes(currency)) {
    return no(
      `${provider.label} cannot take payments in ${currency}.`,
      [
        `${provider.label} accepts ${provider.currencies.join(' and ')}.`,
        'Change this workspace’s currency under “Getting paid”, or connect a processor that takes it.',
      ],
    );
  }

  const description = lines.length === 1
    ? String(lines[0].name ?? 'Order').slice(0, 200)
    : `${lines.length} items`;

  const r = await provider.checkout(key, {
    reference: order.id,
    amountCents: order.total_cents,
    currency,
    description,
    email: addr(order.email) ?? '',
    /* Stripe requires both, and the customer's own site is the right
       destination — unlike the subscription checkout, where the only correct
       answer is this deployment. Falling back to our own origin means a
       customer who has not set them still gets a working checkout. */
    successUrl: row?.success_url || `${origin}/sell?paid=1`,
    cancelUrl: row?.cancel_url || `${origin}/sell?paid=0`,
    needsShipping: await needsShipping(env, accountId, lines),
  }, contextFor(env, accountId, row, await companyFor(env, accountId)));

  if (!r.ok) return no(r.error, r.steps);

  await env.DB.prepare('UPDATE crm_orders SET stripe_session = ?, updated_at = ? WHERE id = ? AND account_id = ?')
    .bind(r.sessionId, nowIso(), order.id, accountId).run();

  return { ok: true, url: r.url, sessionId: r.sessionId, error: '', steps: [], expiresNote: r.expiresNote };
}

export async function handleStorefront(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });

  const accountId = String(d.accountId ?? '').trim();
  if (!/^[A-Za-z0-9_.\-]{1,64}$/.test(accountId)) return fail('A valid workspace is required.');
  if (!(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours.', 403);

  const act = d.action ?? 'get';
  const origin = new URL(req.url).origin;

  /**
   * What the settings screen is allowed to know.
   *
   * The key itself is never in here, in any form — not truncated, not masked
   * with its last four characters. A secret key's tail is enough to confirm a
   * guess, and no screen needs it to say "connected".
   */
  const state = async () => {
    const row = await loadRow(env, accountId);
    const id = row?.provider || DEFAULT_PROVIDER;
    const provider = providerFor(id);
    /* Read from the key's own prefix, never from the network, so this is
       cheap enough to answer on every load. The prefix is not the secret. */
    const key = row?.api_key ? await loadKey(env, row) : '';
    return {
      provider: id,
      providerLabel: provider?.label ?? id,
      mode: key && provider ? provider.modeOf(key) : null,
      connected: !!row?.api_key,
      webhookSet: !!row?.webhook_secret,
      verifiedAt: row?.verified_at ?? null,
      lastError: row?.last_error ?? '',
      successUrl: row?.success_url ?? '',
      cancelUrl: row?.cancel_url ?? '',
      currency: row?.currency ?? 'USD',
      /* So the screen can warn before a buyer meets it, not after. */
      currencySupported: !provider?.currencies.length
        || provider.currencies.includes((row?.currency ?? 'USD').toUpperCase()),
      /* Given to them to paste into the processor. The workspace is in the
         query string because one deployment serves every workspace and each
         endpoint is signed with its own secret — without it there is no way to
         know which secret to check a delivery against. */
      webhookUrl: `${origin}/api/storefront-webhook.php?ws=${encodeURIComponent(accountId)}`,
      choices: providerChoices(),
    };
  };

  if (act === 'get') return json({ success: true, storefront: await state() });

  if (act === 'save') {
    const key = await installSecret(env.DB, SECRET_KEY);
    const existing = await loadRow(env, accountId);

    const wantedProvider = String(d.provider ?? existing?.provider ?? DEFAULT_PROVIDER);
    const provider = providerFor(wantedProvider);
    if (!provider) return fail(`"${wantedProvider}" is not a payment processor this app supports.`);

    /* Switching processor cannot keep the old secret: a Stripe key is not a
       Creem key, and carrying one across would be a connected-looking workspace
       that fails on the first charge. */
    const switching = !!existing?.provider && existing.provider !== wantedProvider;
    const given = String(d.apiKey ?? d.stripeKey ?? '').trim();
    if (switching && !given) {
      return fail(`Paste your ${provider.label} key — the key you had is for ${providerFor(existing.provider)?.label ?? existing.provider} and cannot be used with ${provider.label}.`);
    }
    if (given) {
      const complaint = provider.validateKey(given);
      if (complaint) return fail(complaint);
    }

    /* Blank means "keep the stored one", the same rule as mailbox passwords —
       the form shows dots and cannot send back what it was never given. */
    const apiKey = given ? await encryptSecret(key, given) : (switching ? '' : (existing?.api_key ?? ''));

    const wh = String(d.webhookSecret ?? '').trim();
    const webhookSecret = wh
      ? await encryptSecret(key, wh)
      : (switching ? '' : (existing?.webhook_secret ?? ''));

    const success = d.successUrl === undefined ? (existing?.success_url ?? '') : returnUrl(d.successUrl);
    const cancel = d.cancelUrl === undefined ? (existing?.cancel_url ?? '') : returnUrl(d.cancelUrl);
    if (d.successUrl !== undefined && String(d.successUrl).trim() && !success) {
      return fail('The "after paying" address must be a full web address, starting https://.');
    }
    if (d.cancelUrl !== undefined && String(d.cancelUrl).trim() && !cancel) {
      return fail('The "if they cancel" address must be a full web address, starting https://.');
    }

    const currency = /^[A-Za-z]{3}$/.test(String(d.currency ?? ''))
      ? String(d.currency).toUpperCase()
      : (existing?.currency ?? 'USD');
    if (provider.currencies.length && !provider.currencies.includes(currency)) {
      return fail(
        `${provider.label} cannot take payments in ${currency} — it accepts ${provider.currencies.join(' and ')}.`,
      );
    }

    /* A changed key, or a changed processor, has not been tested whatever the
       last test said. Carrying a green tick across shows a state somebody would
       trust and only discover at the moment a buyer tries to pay. */
    const verified = (given || switching) ? null : (existing?.verified_at ?? null);
    /* Anything the old processor had us remember is meaningless to the new one. */
    const providerRef = switching ? '' : (existing?.provider_ref ?? '');

    await env.DB.prepare(
      `INSERT INTO crm_storefront
       (account_id, provider, api_key, provider_ref, webhook_secret, success_url, cancel_url,
        currency, verified_at, last_error, updated_at, stripe_key)
       VALUES (?,?,?,?,?,?,?,?,?,'',?,'')
       ON CONFLICT(account_id) DO UPDATE SET
         provider=excluded.provider, api_key=excluded.api_key, provider_ref=excluded.provider_ref,
         webhook_secret=excluded.webhook_secret, success_url=excluded.success_url,
         cancel_url=excluded.cancel_url, currency=excluded.currency,
         verified_at=excluded.verified_at, last_error=excluded.last_error,
         updated_at=excluded.updated_at`,
    ).bind(
      accountId, wantedProvider, apiKey, providerRef, webhookSecret,
      success, cancel, currency, verified, nowIso(),
    ).run();

    return json({ success: true, storefront: await state() });
  }

  if (act === 'test') {
    const row = await loadRow(env, accountId);
    const provider = providerFor(row?.provider || DEFAULT_PROVIDER);
    if (!provider) return fail('This workspace is connected to a processor this app no longer supports.');
    const key = await loadKey(env, row);
    if (!key) return fail(`Connect a ${provider.label} key first.`);

    const r = await provider.verify(key);
    if (!r.ok) {
      await env.DB.prepare('UPDATE crm_storefront SET verified_at = NULL, last_error = ?, updated_at = ? WHERE account_id = ?')
        .bind(r.error.slice(0, 500), nowIso(), accountId).run();
      return json({
        success: false, error: r.error, message: r.error,
        diagnosis: { summary: r.error, steps: r.steps },
        storefront: await state(),
      });
    }

    await env.DB.prepare("UPDATE crm_storefront SET verified_at = ?, last_error = '', updated_at = ? WHERE account_id = ?")
      .bind(nowIso(), nowIso(), accountId).run();
    return json({
      success: true,
      account: { name: r.name, mode: r.mode, chargesEnabled: r.chargesEnabled },
      storefront: await state(),
    });
  }

  if (act === 'disconnect') {
    await env.DB.prepare(
      "UPDATE crm_storefront SET api_key = '', webhook_secret = '', provider_ref = '', verified_at = NULL, last_error = '', updated_at = ? WHERE account_id = ?",
    ).bind(nowIso(), accountId).run();
    return json({ success: true, storefront: await state() });
  }

  /* ── A link to pay an order ── */
  if (act === 'pay_link') {
    const r = await createPayLink(env, accountId, String(d.orderId ?? '').trim(), origin);
    if (!r.ok) {
      return json({
        success: false, error: r.error, message: r.error,
        ...(r.steps.length ? { diagnosis: { summary: r.error, steps: r.steps } } : {}),
      });
    }
    return json({ success: true, url: r.url, sessionId: r.sessionId, expiresNote: r.expiresNote });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}

/**
 * The processor's callback.
 *
 * ── Choosing the key from an unverified payload ──
 *
 * The workspace comes from the query string, which nobody has signed. That is
 * safe, and worth saying why: it only chooses *which* signing secret to check
 * against. An attacker naming any workspace they like still has to produce a
 * valid signature under that workspace's secret, which they do not have. What
 * would be unsafe is trusting the body's own claim about what was paid — so
 * nothing here is believed until the signature verifies.
 *
 * ── Replay ──
 *
 * Stripe's signature carries a timestamp and is refused after five minutes.
 * Creem's does not, so a captured delivery stays valid indefinitely and the
 * only protection is that an order moves only while it is still `pending`.
 * That check is load-bearing; it is not tidiness.
 */
export async function handleStorefrontWebhook(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const accountId = String(url.searchParams.get('ws') ?? '').trim();
  if (!/^[A-Za-z0-9_.\-]{1,64}$/.test(accountId)) return new Response('no-workspace', { status: 400 });

  const row = await loadRow(env, accountId);
  if (!row?.webhook_secret) return new Response('webhook-not-configured', { status: 400 });

  const provider = providerFor(row.provider || DEFAULT_PROVIDER);
  if (!provider) return new Response('unknown-provider', { status: 400 });

  let secret = '';
  try {
    secret = await decryptSecret(await installSecret(env.DB, SECRET_KEY), row.webhook_secret);
  } catch {
    return new Response('webhook-not-configured', { status: 400 });
  }
  if (!secret) return new Response('webhook-not-configured', { status: 400 });

  const payload = await req.text();
  if (!(await provider.verifySignature(secret, payload, req.headers))) {
    return new Response('bad-signature', { status: 400 });
  }

  const event = provider.readEvent(payload);
  if (!event) return new Response('bad-json', { status: 400 });

  /* Matched on the order id the processor gave back, or on the session this
     Worker stored when it made the link. Never on amount or email: the first
     time somebody buys the same thing twice, that marks the wrong order. */
  const where = event.reference
    ? { sql: 'id = ? AND account_id = ?', args: [event.reference, accountId] }
    : { sql: 'stripe_session = ? AND account_id = ?', args: [event.sessionId, accountId] };

  if (event.kind === 'paid') {
    /* Only a pending order moves. An order already fulfilled must not be walked
       backwards to 'paid' by a redelivered event, and processors redeliver. */
    await env.DB.prepare(
      `UPDATE crm_orders SET status = 'paid', channel = ?, stripe_session = ?, updated_at = ?
       WHERE ${where.sql} AND status = 'pending'`,
    ).bind(provider.id, event.sessionId, nowIso(), ...where.args).run();

    /* Written separately, and only when there is something to write. A session
       with no address collected must not blank an address already recorded —
       that is how a redelivery erases the only copy of where a parcel goes. */
    const s = event.shipping;
    if (s?.line1) {
      await env.DB.prepare(
        `UPDATE crm_orders SET ship_name = ?, ship_address1 = ?, ship_address2 = ?, ship_city = ?,
                ship_state = ?, ship_zip = ?, ship_country = ?, ship_phone = ?, updated_at = ?
         WHERE ${where.sql}`,
      ).bind(
        s.name.slice(0, 120), s.line1.slice(0, 200), s.line2.slice(0, 200),
        s.city.slice(0, 120), s.state.slice(0, 60), s.postcode.slice(0, 40),
        s.country.slice(0, 2), s.phone.slice(0, 40), nowIso(), ...where.args,
      ).run();
    }
  } else if (event.kind === 'refunded') {
    await env.DB.prepare(
      `UPDATE crm_orders SET status = 'refunded', updated_at = ? WHERE ${where.sql} AND status IN ('paid','fulfilled')`,
    ).bind(nowIso(), ...where.args).run();
  }

  /* 200 for anything correctly signed, including events not acted on. A non-2xx
     makes the processor retry an event that was never going to matter. */
  return new Response('ok', { status: 200 });
}
