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
import { agencyBucketFor, canAccess, dataGet, userFromToken, type Env } from '../lib/db';
import { providerFor } from '../lib/payments';
import { billingProcessor } from './billing';


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
  if (accountId && !(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours to bill.', 403);

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

  /*
   * The price used to come from the request — `amount`, or any `priceId` on
   * the operator's Stripe account — so a one-cent "subscription" could be
   * bought and the webhook would then mark the workspace active. The live app
   * pays through billing.php, which prices from its own table; nothing in the
   * app calls this path any more, so it is closed rather than repaired.
   */
  void params; void email;
  return fail('This checkout has moved. Open Billing in the app to subscribe.', 410);
}

/** The customer-facing portal, for changing card or cancelling. */
export async function handleStripePortal(req: Request, env: Env): Promise<Response> {
  const d = await body<{ token?: string; accountId?: string; returnUrl?: string }>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });
  /* Whatever processor billing actually runs on — the one connected in
     Platform services, else the old STRIPE_SECRET_KEY. Reading only the old
     setting told every subscriber on a connected processor "Stripe is not set
     up", the one moment they wanted to change a card or cancel. */
  const current = await billingProcessor(env);
  const provider = current ? providerFor(current.id) : null;
  if (!current || !provider) return fail('Subscriptions are not set up on this deployment yet.');

  /* The customer is the one the webhook recorded for a workspace this caller
     may open — never an id from the request, which let anyone holding a
     `cus_…` open that customer's portal, cancel, or change the card. */
  const accountId = String(d.accountId ?? '').trim();
  if (!accountId || !(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours.', 403);
  let customerId = '';
  try {
    const raw = await dataGet(env.DB, await agencyBucketFor(env.DB, accountId), `crm_billing_status_${accountId}`);
    customerId = String((JSON.parse(raw ?? '{}') as { customerId?: string }).customerId ?? '');
  } catch { customerId = ''; }
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(customerId)) {
    return fail(`No ${provider.label} customer is linked to this workspace yet — it appears after the first payment.`);
  }

  const origin = new URL(req.url).origin;
  const r = await provider.portal(current.key, customerId, `${origin}/billing`);
  if (!r.ok) return json({ success: false, error: r.error, message: r.error, ...(r.steps.length ? { diagnosis: { summary: r.error, steps: r.steps } } : {}) });
  return json({ success: true, url: r.url });
}

/**
 * The retired Stripe callback (M-6).
 *
 * It wrote `crm_billing_status_*` from any signed event's own `status` field —
 * no plan check, no currency check, no expired-session rule — beside the real
 * billing webhook (`/api/billing-webhook.php`, routes/billing.ts) that has all
 * three. A Stripe endpoint still pointed here could flip a workspace to
 * "active" on an event the real one would refuse. Nothing is read or written;
 * the 410 tells Stripe's dashboard the endpoint is gone and to stop retrying.
 */
export async function handleStripeWebhook(_req: Request, _env: Env): Promise<Response> {
  return new Response('gone: point Stripe at /api/billing-webhook.php', { status: 410 });
}
