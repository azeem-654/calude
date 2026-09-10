/**
 * Stripe, behind the same interface as everything else.
 *
 * This is a move, not a rewrite. The logic — the publishable-key trap, the
 * remediation steps, reading the account rather than creating anything on a
 * Test, the two shapes a shipping address arrives in — was written and tested
 * against a real Stripe against real refusals, and it is the same code. What is
 * new is only that a caller no longer has to know it is Stripe.
 *
 * On the customer's own key, always: `env.STRIPE_SECRET_KEY` is the operator's
 * account and charging a buyer through it would put the merchant's takings in
 * somebody else's balance. See routes/storefront.ts for the full argument.
 */
import type { PaymentEvent, PaymentProvider } from './types';

const API = 'https://api.stripe.com/v1';

/* Secret keys, and the restricted keys a cautious customer should prefer. */
const KEY_OK = /^(sk|rk)_(live|test)_[A-Za-z0-9]{8,}$/;

async function call(
  key: string, path: string, params?: URLSearchParams,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  try {
    const r = await fetch(`${API}${path}`, {
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

const errorOf = (data: Record<string, unknown>): string =>
  (data.error as { message?: string } | undefined)?.message ?? 'Stripe refused that request.';

function remedy(message: string): string[] {
  const m = message.toLowerCase();
  if (m.includes('invalid api key') || m.includes('no api key')) {
    return [
      'Open dashboard.stripe.com and sign in.',
      'Go to Developers → API keys.',
      'Copy the **Secret key** — it starts sk_ and you may have to click "Reveal". The one starting pk_ is the publishable key and will not work here.',
      'Paste it above and press Test again.',
    ];
  }
  if (m.includes('expired')) {
    return [
      'This key has been rolled or revoked in Stripe, so it can no longer charge anything.',
      'In Stripe: Developers → API keys → create a new secret key.',
      'Paste the new one above. Nothing else here needs changing.',
    ];
  }
  if (m.includes('permission') || m.includes('does not have the required')) {
    return [
      'This looks like a restricted key without enough access.',
      'In Stripe: Developers → API keys → your restricted key → Edit.',
      'Give it **Write** on Checkout Sessions and **Read** on Charges and Payment Intents.',
      'Save, then press Test again.',
    ];
  }
  if (m.includes('test mode') || m.includes('live mode')) {
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

/* Stripe's own parameter cannot be "anywhere", so this is where a
   print-on-demand supplier actually posts to. A seller who needs more can be
   given more; a seller quietly unable to sell to their own country would never
   know why. */
const SHIP_TO = ['GB', 'US', 'CA', 'AU', 'NZ', 'IE', 'FR', 'DE', 'ES', 'IT', 'NL', 'SE', 'PL', 'JP'];

export const stripe: PaymentProvider = {
  id: 'stripe',
  label: 'Stripe',
  /* Empty means "most" — Stripe's list is long and changes, and a stale copy of
     it here would refuse a currency Stripe would have taken. */
  currencies: [],
  keyHint: 'dashboard.stripe.com → Developers → API keys',

  validateKey(key) {
    const k = key.trim();
    if (!k) return 'Paste your Stripe secret key.';
    if (k.startsWith('pk_')) {
      return 'That is a publishable key. It cannot take payments — copy the secret key, which starts sk_, from Developers → API keys.';
    }
    if (!KEY_OK.test(k)) {
      return 'That does not look like a Stripe secret key. They start sk_test_, sk_live_, or rk_ for a restricted key.';
    }
    return '';
  },

  modeOf(key) {
    return key.includes('_live_') ? 'live' : 'test';
  },

  async verify(key) {
    /* Reading the account proves the key works without creating anything, so
       pressing Test leaves no debris in the customer's Stripe. */
    const r = await call(key, '/account');
    const mode: 'live' | 'test' = this.modeOf(key);
    if (!r.ok) {
      const error = errorOf(r.data);
      return { ok: false, error, steps: remedy(error), name: '', mode, chargesEnabled: false };
    }
    const acct = r.data as { business_profile?: { name?: string }; charges_enabled?: boolean };
    return {
      ok: true, error: '', steps: [],
      name: acct.business_profile?.name || 'your Stripe account',
      mode,
      /* Said plainly. A key that works but whose account cannot yet take money
         produces a checkout that fails at the last step, and the customer
         should hear it now rather than from their buyer. */
      chargesEnabled: acct.charges_enabled !== false,
    };
  },

  async checkout(key, req) {
    const params = new URLSearchParams({ mode: 'payment' });
    params.set('success_url', req.successUrl);
    params.set('cancel_url', req.cancelUrl);
    params.set('line_items[0][quantity]', '1');
    params.set('line_items[0][price_data][currency]', req.currency.toLowerCase());
    params.set('line_items[0][price_data][product_data][name]', req.description.slice(0, 250) || 'Order');
    params.set('line_items[0][price_data][unit_amount]', String(req.amountCents));

    if (req.needsShipping) {
      SHIP_TO.forEach((c, i) => params.set(`shipping_address_collection[allowed_countries][${i}]`, c));
    }
    if (req.email) params.set('customer_email', req.email);
    /* Both, because the webhook has to find this order again and Stripe's own
       docs disagree with themselves about which field survives which flow. */
    params.set('client_reference_id', req.reference);
    params.set('metadata[orderId]', req.reference);

    const r = await call(key, '/checkout/sessions', params);
    if (!r.ok) {
      const error = errorOf(r.data);
      return { ok: false, url: '', sessionId: '', expiresNote: '', error, steps: remedy(error) };
    }
    return {
      ok: true, error: '', steps: [],
      url: String(r.data.url ?? ''),
      sessionId: String(r.data.id ?? ''),
      expiresNote: 'This link stops working after 24 hours. Generate another if the buyer has not paid by then.',
    };
  },

  async verifySignature(secret, rawBody, headers) {
    const parts = Object.fromEntries(
      (headers.get('Stripe-Signature') ?? '').split(',')
        .map(p => p.split('=', 2)).filter(p => p.length === 2) as [string, string][],
    );
    const timestamp = parts.t ?? '';
    const given = parts.v1 ?? '';
    if (!timestamp || !given || !secret) return false;

    /* Five minutes, the tolerance Stripe's own libraries use — so a captured
       delivery cannot be replayed indefinitely. Creem has no equivalent; see
       the note in creem.ts. */
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (!Number.isFinite(age) || age > 300) return false;

    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
    const expected = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
    if (given.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  },

  readEvent(rawBody) {
    let event: { type?: string; data?: { object?: Record<string, unknown> } };
    try { event = JSON.parse(rawBody); } catch { return null; }
    const obj = event.data?.object ?? {};
    const meta = (obj.metadata ?? {}) as Record<string, string>;
    const type = String(event.type ?? '');

    const kind: PaymentEvent['kind'] =
      type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded' ? 'paid'
        : type === 'checkout.session.async_payment_failed' || type === 'checkout.session.expired' ? 'failed'
          : type === 'charge.refunded' ? 'refunded'
            : 'other';

    /**
     * The address, if one was collected.
     *
     * Stripe has moved this across versions — `shipping_details` in older API
     * versions, `collected_information.shipping_details` in newer ones — so
     * both are read. An account on the one we did not read would silently ship
     * nowhere, and nobody would see it until a parcel failed to arrive.
     */
    const collected = (obj.collected_information ?? {}) as { shipping_details?: unknown };
    const ship = (collected.shipping_details ?? obj.shipping_details ?? obj.shipping ?? {}) as {
      name?: string; phone?: string;
      address?: { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string };
    };
    const a = ship.address ?? {};
    const cd = (obj.customer_details ?? {}) as { name?: string; phone?: string };

    return {
      kind,
      reference: meta.orderId || String(obj.client_reference_id ?? ''),
      sessionId: String(obj.id ?? ''),
      shipping: a.line1 ? {
        name: String(ship.name ?? cd.name ?? ''),
        line1: String(a.line1 ?? ''), line2: String(a.line2 ?? ''),
        city: String(a.city ?? ''), state: String(a.state ?? ''),
        postcode: String(a.postal_code ?? ''), country: String(a.country ?? '').toUpperCase(),
        phone: String(ship.phone ?? cd.phone ?? ''),
      } : undefined,
    };
  },
};
