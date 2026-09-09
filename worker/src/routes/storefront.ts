/**
 * Taking money for a customer's own products.
 *
 * ── Why this does not use the Stripe key that already exists ──
 *
 * `routes/stripe.ts` charges cards with `env.STRIPE_SECRET_KEY` — a Worker
 * secret, the *operator's* account — and it bills customers for their
 * subscription to this app. Reaching for it here would be the obvious shortcut
 * and a serious error: a plumber's buyer paying for a £400 boiler service would
 * be paying into the operator's Stripe balance. That is somebody else's money
 * held without agreement, and in most places it is money transmission.
 *
 * So the storefront charges on a key the customer connects themselves. Their
 * buyer pays them, directly, and nothing touches the operator's account. Stripe
 * Connect is the other honest answer; it needs a platform agreement and an
 * onboarding flow that do not exist, and this does not pretend to be it.
 *
 * ── What this is, exactly ──
 *
 * A payment link against an order that already exists. There is no public
 * storefront page in this app, and inventing one here would be a second website
 * builder. What a small business actually needs first is the thing this does:
 * record the order, send the buyer a link, know when it is paid without asking.
 */
import { addr, body, fail, json } from '../lib/http';
import { canAccess, installSecret, nowIso, userFromToken, type Env } from '../lib/db';
import { decryptSecret, encryptSecret, timingSafeEqual } from '../lib/crypto';

const SECRET_KEY = 'mailbox_key';
const STRIPE = 'https://api.stripe.com/v1';

interface Row {
  account_id: string;
  stripe_key: string;
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
  stripeKey?: string;
  webhookSecret?: string;
  successUrl?: string;
  cancelUrl?: string;
  currency?: string;
  orderId?: string;
}

/* Stripe secret keys, and the restricted keys a cautious customer should
   prefer. Checked so a pasted publishable key — pk_live_..., which is the one
   on screen in their dashboard and the easy mistake — is refused here with an
   explanation rather than by Stripe with "Invalid API Key provided". */
const KEY_OK = /^(sk|rk)_(live|test)_[A-Za-z0-9]{8,}$/;

function keyMode(key: string): 'live' | 'test' {
  return key.includes('_live_') ? 'live' : 'test';
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

/** The decrypted key, or '' when none is connected. Never leaves the Worker. */
async function loadKey(env: Env, accountId: string): Promise<string> {
  const row = await loadRow(env, accountId);
  if (!row?.stripe_key) return '';
  try {
    return await decryptSecret(await installSecret(env.DB, SECRET_KEY), row.stripe_key);
  } catch {
    return '';
  }
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

/** Whether this workspace can be paid through — read by other modules. */
export async function storefrontReady(env: Env, accountId: string): Promise<boolean> {
  const row = await loadRow(env, accountId);
  return !!row?.stripe_key && !!row.verified_at;
}

async function stripeCall(
  key: string, path: string, params?: URLSearchParams,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  try {
    const r = await fetch(`${STRIPE}${path}`, {
      method: params ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: params,
    });
    const data = await r.json<Record<string, unknown>>().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return {
      ok: false, status: 0,
      data: { error: { message: e instanceof Error ? e.message : 'Stripe could not be reached.' } },
    };
  }
}

function stripeError(data: Record<string, unknown>): string {
  const err = data.error as { message?: string } | undefined;
  return err?.message ?? 'Stripe refused that request.';
}

/**
 * What a specific Stripe refusal means, and what to do about it.
 *
 * Stripe's own messages are written for a developer reading a stack trace. The
 * customer connecting this is a plumber who pasted something out of a
 * dashboard, and "No such customer" tells them nothing they can act on.
 */
function remedy(data: Record<string, unknown>): string[] {
  const msg = (((data.error as { message?: string } | undefined)?.message) ?? '').toLowerCase();
  if (msg.includes('invalid api key') || msg.includes('no api key')) {
    return [
      'Open dashboard.stripe.com and sign in.',
      'Go to Developers → API keys.',
      'Copy the **Secret key** — it starts sk_ and you may have to click "Reveal". The one starting pk_ is the publishable key and will not work here.',
      'Paste it above and press Test again.',
    ];
  }
  if (msg.includes('expired')) {
    return [
      'This key has been rolled or revoked in Stripe, so it can no longer charge anything.',
      'In Stripe: Developers → API keys → create a new secret key.',
      'Paste the new one above. Nothing else here needs changing.',
    ];
  }
  if (msg.includes('permission') || msg.includes('does not have the required')) {
    return [
      'This looks like a restricted key without enough access.',
      'In Stripe: Developers → API keys → your restricted key → Edit.',
      'Give it **Write** on Checkout Sessions and **Read** on Charges and Payment Intents.',
      'Save, then press Test again.',
    ];
  }
  if (msg.includes('test mode') || msg.includes('live mode')) {
    return [
      'The key and the thing it is being used on are in different modes.',
      'A test key (sk_test_) can only make test payments; a live key (sk_live_) only real ones.',
      'Use the live key once you are ready to take real money.',
    ];
  }
  return [
    'Check the key was copied whole, with no spaces at either end.',
    'Confirm the Stripe account it belongs to is activated and able to accept payments.',
    'If Stripe is reporting an outage, wait and test again — nothing here is saved as broken.',
  ];
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
    /* Live and test keys behave differently enough that saying which is in use
       is worth more than hiding it, and the prefix is not the secret part. */
    const mode = row?.stripe_key ? keyMode(await loadKey(env, accountId)) : null;
    return {
      connected: !!row?.stripe_key,
      mode,
      webhookSet: !!row?.webhook_secret,
      verifiedAt: row?.verified_at ?? null,
      lastError: row?.last_error ?? '',
      successUrl: row?.success_url ?? '',
      cancelUrl: row?.cancel_url ?? '',
      currency: row?.currency ?? 'USD',
      /* Given to them to paste into Stripe. The workspace is in the query
         string because one deployment serves every workspace and Stripe signs
         each endpoint with its own secret — without it there is no way to know
         which secret to check a delivery against. */
      webhookUrl: `${origin}/api/storefront-webhook.php?ws=${encodeURIComponent(accountId)}`,
    };
  };

  if (act === 'get') return json({ success: true, storefront: await state() });

  if (act === 'save') {
    const key = await installSecret(env.DB, SECRET_KEY);
    const existing = await loadRow(env, accountId);

    /* Blank means "keep the stored one", the same rule as mailbox passwords —
       the form shows dots and cannot send back what it was never given, so
       treating blank as a deliberate erasure would disconnect a working Stripe
       account every time somebody edited a return URL. */
    const given = String(d.stripeKey ?? '').trim();
    if (given && !KEY_OK.test(given)) {
      return fail(
        given.startsWith('pk_')
          ? 'That is a publishable key. It cannot take payments — copy the secret key, which starts sk_, from Developers → API keys.'
          : 'That does not look like a Stripe secret key. They start sk_test_, sk_live_, or rk_ for a restricted key.',
      );
    }
    const stripeKey = given ? await encryptSecret(key, given) : (existing?.stripe_key ?? '');

    const wh = String(d.webhookSecret ?? '').trim();
    if (wh && !wh.startsWith('whsec_')) {
      return fail('A Stripe endpoint signing secret starts whsec_. It is shown once, when you add the endpoint in Stripe.');
    }
    const webhookSecret = wh ? await encryptSecret(key, wh) : (existing?.webhook_secret ?? '');

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

    /* A changed key has not been tested, whatever the last test said. Carrying
       a green tick across a key change shows a state the customer would trust
       and only discover at the moment a buyer tries to pay. */
    const verified = given ? null : (existing?.verified_at ?? null);

    await env.DB.prepare(
      `INSERT INTO crm_storefront
       (account_id, stripe_key, webhook_secret, success_url, cancel_url, currency, verified_at, last_error, updated_at)
       VALUES (?,?,?,?,?,?,?,'',?)
       ON CONFLICT(account_id) DO UPDATE SET
         stripe_key=excluded.stripe_key, webhook_secret=excluded.webhook_secret,
         success_url=excluded.success_url, cancel_url=excluded.cancel_url,
         currency=excluded.currency, verified_at=excluded.verified_at,
         last_error=excluded.last_error, updated_at=excluded.updated_at`,
    ).bind(accountId, stripeKey, webhookSecret, success, cancel, currency, verified, nowIso()).run();

    return json({ success: true, storefront: await state() });
  }

  if (act === 'test') {
    const key = await loadKey(env, accountId);
    if (!key) return fail('Connect a Stripe secret key first.');

    /* Reading the account proves the key works without creating anything. A
       test that made a real object would leave debris in the customer's Stripe
       every time they pressed the button. */
    const r = await stripeCall(key, '/account');
    if (!r.ok) {
      const message = stripeError(r.data);
      await env.DB.prepare('UPDATE crm_storefront SET verified_at = NULL, last_error = ?, updated_at = ? WHERE account_id = ?')
        .bind(message.slice(0, 500), nowIso(), accountId).run();
      return json({
        success: false, error: message, message,
        diagnosis: { summary: message, steps: remedy(r.data) },
        storefront: await state(),
      });
    }

    const acct = r.data as { business_profile?: { name?: string }; charges_enabled?: boolean; id?: string };
    await env.DB.prepare("UPDATE crm_storefront SET verified_at = ?, last_error = '', updated_at = ? WHERE account_id = ?")
      .bind(nowIso(), nowIso(), accountId).run();

    return json({
      success: true,
      account: {
        name: acct.business_profile?.name ?? '',
        mode: keyMode(key),
        /* Said plainly. A key that works but whose account cannot yet take
           money will produce a checkout page that fails at the last step, and
           the customer should hear that now rather than from their buyer. */
        chargesEnabled: acct.charges_enabled !== false,
      },
      storefront: await state(),
    });
  }

  if (act === 'disconnect') {
    await env.DB.prepare(
      "UPDATE crm_storefront SET stripe_key = '', webhook_secret = '', verified_at = NULL, last_error = '', updated_at = ? WHERE account_id = ?",
    ).bind(nowIso(), accountId).run();
    return json({ success: true, storefront: await state() });
  }

  /* ── A link to pay an order ── */
  if (act === 'pay_link') {
    const key = await loadKey(env, accountId);
    if (!key) return fail('Connect a Stripe secret key under “Getting paid” before asking a buyer to pay.');

    const orderId = String(d.orderId ?? '').trim();
    const order = await env.DB.prepare(
      'SELECT id, email, items, total_cents, currency, status FROM crm_orders WHERE id = ? AND account_id = ?',
    ).bind(orderId, accountId).first<{
      id: string; email: string; items: string; total_cents: number; currency: string; status: string;
    }>();
    if (!order) return fail('That order is not in this workspace.');
    if (order.status === 'paid' || order.status === 'fulfilled') return fail('That order is already paid.');
    if (order.status === 'cancelled' || order.status === 'refunded') return fail('That order is cancelled — record a new one.');
    if (order.total_cents <= 0) return fail('An order worth nothing cannot be paid for.');

    let lines: { name?: string; qty?: number; priceCents?: number }[] = [];
    try { lines = JSON.parse(order.items) as typeof lines; } catch { lines = []; }
    if (!lines.length) return fail('That order has no lines to charge for.');

    const row = await loadRow(env, accountId);
    const cur = (order.currency || row?.currency || 'USD').toLowerCase();
    const params = new URLSearchParams({ mode: 'payment' });

    /* Stripe requires both, and the customer's own site is the right
       destination — unlike the subscription checkout, where the only correct
       answer is this deployment. Falling back to our own origin means a
       customer who has not set them still gets a working checkout. */
    params.set('success_url', row?.success_url || `${origin}/commerce?paid=1`);
    params.set('cancel_url', row?.cancel_url || `${origin}/commerce?paid=0`);

    lines.forEach((l, i) => {
      const qty = Math.min(Math.max(Math.round(Number(l.qty) || 1), 1), 100_000);
      const unit = Math.min(Math.max(Math.round(Number(l.priceCents) || 0), 0), 100_000_000);
      params.set(`line_items[${i}][quantity]`, String(qty));
      params.set(`line_items[${i}][price_data][currency]`, cur);
      params.set(`line_items[${i}][price_data][product_data][name]`, String(l.name ?? 'Item').slice(0, 250) || 'Item');
      params.set(`line_items[${i}][price_data][unit_amount]`, String(unit));
    });

    const email = addr(order.email);
    if (email) params.set('customer_email', email);
    /* Both, because the webhook has to find this order again and Stripe's own
       docs disagree with themselves about which field survives which flow. */
    params.set('client_reference_id', order.id);
    params.set('metadata[orderId]', order.id);
    params.set('metadata[accountId]', accountId);

    const r = await stripeCall(key, '/checkout/sessions', params);
    if (!r.ok) {
      const message = stripeError(r.data);
      return json({ success: false, error: message, message, diagnosis: { summary: message, steps: remedy(r.data) } });
    }

    const sessionId = String(r.data.id ?? '');
    await env.DB.prepare('UPDATE crm_orders SET stripe_session = ?, updated_at = ? WHERE id = ? AND account_id = ?')
      .bind(sessionId, nowIso(), order.id, accountId).run();

    return json({
      success: true,
      url: r.data.url,
      sessionId,
      /* Stripe expires a Checkout Session after 24 hours. Said here so the
         screen can say it, rather than a buyer clicking a dead link. */
      expiresNote: 'This link stops working after 24 hours. Generate another if the buyer has not paid by then.',
    });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}

/**
 * Stripe's callback, for the customer's own account.
 *
 * ── Choosing the key from an unverified payload ──
 *
 * The workspace comes from the query string, which nobody has signed. That is
 * safe, and worth saying why: it only chooses *which* signing secret to check
 * against. An attacker naming any workspace they like still has to produce a
 * valid HMAC under that workspace's secret, which they do not have. What would
 * be unsafe is trusting the body's own claim about what was paid — so nothing
 * here is believed until the signature verifies.
 */
export async function handleStorefrontWebhook(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const accountId = String(url.searchParams.get('ws') ?? '').trim();
  if (!/^[A-Za-z0-9_.\-]{1,64}$/.test(accountId)) return new Response('no-workspace', { status: 400 });

  const row = await loadRow(env, accountId);
  if (!row?.webhook_secret) return new Response('webhook-not-configured', { status: 400 });

  let secret = '';
  try {
    secret = await decryptSecret(await installSecret(env.DB, SECRET_KEY), row.webhook_secret);
  } catch {
    return new Response('webhook-not-configured', { status: 400 });
  }
  if (!secret) return new Response('webhook-not-configured', { status: 400 });

  const payload = await req.text();
  const parts = Object.fromEntries(
    (req.headers.get('Stripe-Signature') ?? '').split(',')
      .map(p => p.split('=', 2)).filter(p => p.length === 2) as [string, string][],
  );
  const timestamp = parts.t ?? '';
  const given = parts.v1 ?? '';
  if (!timestamp || !given) return new Response('bad-signature', { status: 400 });

  /* Five minutes, the tolerance Stripe's own libraries use — so a captured
     delivery cannot be replayed indefinitely. */
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return new Response('stale-signature', { status: 400 });

  const hmacKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  if (!timingSafeEqual(given, expected)) return new Response('bad-signature', { status: 400 });

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try { event = JSON.parse(payload); } catch { return new Response('bad-json', { status: 400 }); }

  const obj = event.data?.object ?? {};
  const meta = (obj.metadata ?? {}) as Record<string, string>;
  const orderId = meta.orderId || String(obj.client_reference_id ?? '');
  const sessionId = String(obj.id ?? '');

  /* Matched on the session this Worker stored when it made the link, and on the
     workspace the signature just proved. Never on amount or email: the first
     time somebody buys the same thing twice, that marks the wrong order. */
  const where = orderId
    ? { sql: 'id = ? AND account_id = ?', args: [orderId, accountId] }
    : { sql: 'stripe_session = ? AND account_id = ?', args: [sessionId, accountId] };

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    /* Only a pending order moves. An order already fulfilled must not be walked
       backwards to 'paid' by a redelivered event, and Stripe redelivers. */
    await env.DB.prepare(
      `UPDATE crm_orders SET status = 'paid', channel = 'stripe', stripe_session = ?, updated_at = ?
       WHERE ${where.sql} AND status = 'pending'`,
    ).bind(sessionId, nowIso(), ...where.args).run();
  } else if (event.type === 'checkout.session.async_payment_failed' || event.type === 'checkout.session.expired') {
    /* Left pending rather than cancelled — the buyer's card failing is not the
       seller deciding the order is off, and they will often try again. */
    await env.DB.prepare(`UPDATE crm_orders SET updated_at = ? WHERE ${where.sql}`)
      .bind(nowIso(), ...where.args).run();
  }

  /* 200 for anything correctly signed, including events not acted on. A non-2xx
     makes Stripe retry an event that was never going to matter. */
  return new Response('ok', { status: 200 });
}
