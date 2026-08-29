/**
 * Stripe: what the agency configures, what a client subscribes through, and
 * what Stripe posts back.
 *
 * One change of substance from the PHP. There, the secret key could arrive in
 * the request body from an agency's browser, and was also written to a
 * config.php on disk. Here it lives in one place — a Worker secret, set with
 * `wrangler secret put STRIPE_SECRET_KEY` — and is never accepted from a
 * request and never returned. A key that can charge cards should not be
 * something an endpoint will take somebody's word for.
 */
import { addr, body, fail, json } from '../lib/http';
import { canAccess, dataPut, nowIso, userFromToken, type Env } from '../lib/db';
import { timingSafeEqual } from '../lib/crypto';

const STRIPE = 'https://api.stripe.com/v1';

async function stripePost(env: Env, path: string, params: URLSearchParams): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const r = await fetch(`${STRIPE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
  const data = await r.json<Record<string, unknown>>().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

function stripeError(data: Record<string, unknown>): string {
  const err = data.error as { message?: string } | undefined;
  return err?.message ?? 'Stripe refused that request.';
}

/** Whether Stripe is set up at all — the UI asks before offering to charge. */
export async function handleStripeConfig(req: Request, env: Env): Promise<Response> {
  const d = await body<{ token?: string }>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });

  const configured = !!env.STRIPE_SECRET_KEY;
  return json({
    success: true,
    configured,
    /* Live and test keys behave differently enough that saying which is in use
       is worth more than hiding it — and the prefix is not a secret. */
    mode: configured ? (env.STRIPE_SECRET_KEY!.startsWith('sk_live') ? 'live' : 'test') : null,
    message: configured
      ? undefined
      : 'Stripe is not set up on this deployment yet. Run: wrangler secret put STRIPE_SECRET_KEY',
  });
}

interface CheckoutBody {
  token?: string;
  accountId?: string;
  productName?: string;
  amount?: number;
  currency?: string;
  priceId?: string;
  customerEmail?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export async function handleStripeCheckout(req: Request, env: Env): Promise<Response> {
  const d = await body<CheckoutBody>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });
  if (!env.STRIPE_SECRET_KEY) {
    return fail('Stripe is not set up on this deployment. Run: wrangler secret put STRIPE_SECRET_KEY');
  }

  const accountId = String(d.accountId ?? '').trim();
  if (accountId && !canAccess(user, accountId)) return fail('That workspace is not yours to bill.', 403);

  const origin = new URL(req.url).origin;
  /* Return URLs are forced back onto this deployment's own origin. Taking one
     from the request would let a crafted link send a paying customer somewhere
     else after they had entered their card. */
  const safeReturn = (given: string | undefined, fallbackPath: string): string => {
    try {
      const u = new URL(String(given ?? ''), origin);
      return u.origin === origin ? u.toString() : origin + fallbackPath;
    } catch { return origin + fallbackPath; }
  };

  const params = new URLSearchParams({
    mode: 'subscription',
    success_url: safeReturn(d.successUrl, '/billing?checkout=success'),
    cancel_url: safeReturn(d.cancelUrl, '/billing?checkout=cancelled'),
  });

  const email = addr(d.customerEmail);
  if (email) params.set('customer_email', email);
  if (accountId) params.set('client_reference_id', accountId);
  if (accountId) params.set('metadata[accountId]', accountId);

  if (d.priceId) {
    params.set('line_items[0][price]', String(d.priceId));
    params.set('line_items[0][quantity]', '1');
  } else {
    const amount = Number(d.amount);
    if (!Number.isFinite(amount) || amount <= 0) return fail('A subscription needs a price above zero.');
    params.set('line_items[0][quantity]', '1');
    params.set('line_items[0][price_data][currency]', (d.currency ?? 'usd').toLowerCase());
    params.set('line_items[0][price_data][product_data][name]', String(d.productName ?? 'Subscription').slice(0, 250));
    params.set('line_items[0][price_data][unit_amount]', String(Math.round(amount * 100)));
    params.set('line_items[0][price_data][recurring][interval]', 'month');
  }

  const r = await stripePost(env, '/checkout/sessions', params);
  if (!r.ok) return fail(stripeError(r.data));
  return json({ success: true, url: r.data.url, id: r.data.id });
}

/** The customer-facing portal, for changing card or cancelling. */
export async function handleStripePortal(req: Request, env: Env): Promise<Response> {
  const d = await body<{ token?: string; customerId?: string; returnUrl?: string }>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });
  if (!env.STRIPE_SECRET_KEY) return fail('Stripe is not set up on this deployment.');

  const customerId = String(d.customerId ?? '').trim();
  if (!/^cus_[A-Za-z0-9]+$/.test(customerId)) return fail('No Stripe customer is linked to this account yet.');

  const origin = new URL(req.url).origin;
  const params = new URLSearchParams({ customer: customerId, return_url: `${origin}/billing` });
  const r = await stripePost(env, '/billing_portal/sessions', params);
  if (!r.ok) return fail(stripeError(r.data));
  return json({ success: true, url: r.data.url });
}

/**
 * Stripe's callback.
 *
 * The signature check is the whole security model: without it, anyone who
 * knows the URL can post "subscription paid" for any account. Verified with
 * WebCrypto HMAC and compared in constant time, and the timestamp is checked
 * so a captured-and-replayed event does not stay valid forever.
 */
export async function handleStripeWebhook(req: Request, env: Env): Promise<Response> {
  const payload = await req.text();
  const header = req.headers.get('Stripe-Signature') ?? '';
  const secret = env.STRIPE_WEBHOOK_SECRET;

  if (!secret) return new Response('webhook secret not configured', { status: 500 });

  const parts = Object.fromEntries(
    header.split(',').map(p => p.split('=', 2)).filter(p => p.length === 2) as [string, string][],
  );
  const timestamp = parts.t ?? '';
  const given = parts.v1 ?? '';
  if (!timestamp || !given) return new Response('bad-signature', { status: 400 });

  /* Five minutes, the tolerance Stripe's own libraries use. */
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return new Response('stale-signature', { status: 400 });

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  if (!timingSafeEqual(given, expected)) return new Response('bad-signature', { status: 400 });

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try { event = JSON.parse(payload); } catch { return new Response('bad-json', { status: 400 }); }

  const obj = event.data?.object ?? {};
  const meta = (obj.metadata ?? {}) as Record<string, string>;
  const accountId = meta.accountId || String(obj.client_reference_id ?? '');

  if (accountId) {
    const status =
      event.type === 'checkout.session.completed' ? 'active'
        : event.type === 'customer.subscription.deleted' ? 'cancelled'
          : event.type === 'invoice.payment_failed' ? 'past_due'
            : String((obj as { status?: string }).status ?? 'active');

    /* Billing state is kept under the agency's own namespace, the same place
       the dashboard reads it from, so a client cannot rewrite their own. */
    await dataPut(env.DB, '__agency__', `crm_billing_status_${accountId}`, JSON.stringify({
      status,
      customerId: obj.customer ?? null,
      subscriptionId: obj.subscription ?? obj.id ?? null,
      updatedAt: nowIso(),
      lastEvent: event.type ?? '',
    }));
  }

  /* 200 for anything correctly signed, including events not acted on — a
     non-2xx makes Stripe retry an event that was never going to matter. */
  return new Response('ok', { status: 200 });
}
