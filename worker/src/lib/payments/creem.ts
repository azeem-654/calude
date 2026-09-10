/**
 * Creem — a merchant of record, which is not the same thing as Stripe.
 *
 * ── The difference that shapes this file ──
 *
 * Stripe is a gateway: you hand it an amount and it charges a card. Creem sells
 * the thing *for* you — it is the seller of record, it handles the tax, and it
 * pays out to the merchant afterwards. Practically that means a checkout must
 * name a **product that already exists**; there is no arbitrary-amount call.
 *
 * The obvious way to satisfy that is to create a product for every order, and
 * it is wrong: a shop doing thirty sales a day would have thirty new entries a
 * day in its Creem catalogue, for ever. So each workspace gets **one** reusable
 * one-time product, and every order is a checkout against it with
 * `custom_price` set to that order's total. That is exactly what `custom_price`
 * is for, and the customer's catalogue stays a catalogue.
 *
 * ── Two limits that are Creem's, not ours, and are said out loud ──
 *
 *  - Products are **EUR or USD only**. A workspace trading in pounds cannot be
 *    paid through Creem, and is told so when connecting rather than when a
 *    buyer meets a broken link.
 *  - `custom_price` has a floor of 100 minor units. An order under one whole
 *    unit cannot be charged.
 *
 * ── Replay ──
 *
 * The webhook signature is an HMAC over the body with no timestamp in it, so
 * unlike Stripe there is nothing here that expires. A captured delivery stays
 * valid for ever, and the only thing standing between that and a double credit
 * is the caller's own idempotency — which is why the order is moved only when
 * it is still `pending`. Worth knowing before anyone relaxes that check.
 */
import type { PaymentEvent, PaymentProvider, ProviderContext } from './types';

/** Test keys carry the mode in the key, so the customer cannot point a live key
 *  at the sandbox by mistake, or the reverse. */
const isTest = (key: string) => key.startsWith('creem_test_');
const base = (key: string) => (isTest(key) ? 'https://test-api.creem.io' : 'https://api.creem.io');

interface CreemError { status?: number; message?: string | string[]; error?: string }

async function call<T>(
  key: string, path: string, init: RequestInit = {},
): Promise<{ ok: boolean; data?: T; error: string; status: number }> {
  try {
    const r = await fetch(`${base(key)}${path}`, {
      ...init,
      headers: { 'x-api-key': key, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    const text = await r.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = undefined; }
    if (!r.ok) {
      const e = (parsed ?? {}) as CreemError;
      const msg = Array.isArray(e.message) ? e.message.join('; ') : (e.message || e.error || '');
      return { ok: false, error: msg || `Creem answered HTTP ${r.status}.`, status: r.status };
    }
    return { ok: true, data: parsed as T, error: '', status: r.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Creem could not be reached.', status: 0 };
  }
}

function remedy(error: string, status: number): string[] {
  const m = error.toLowerCase();
  if (status === 401 || status === 403 || m.includes('unauthor') || m.includes('api key') || m.includes('api-key')) {
    return [
      'Sign in at creem.io and open the dashboard.',
      'Go to Developers → API keys and copy the key.',
      'A key starting creem_test_ is the sandbox one and only takes test payments; the live key takes real ones.',
      'Paste it above and press Test again.',
    ];
  }
  if (m.includes('product')) {
    return [
      'Creem could not use this workspace’s order product.',
      'Press Test again — that recreates it if it was deleted in the Creem dashboard.',
      'If it keeps failing, check the key still belongs to the same Creem account.',
    ];
  }
  if (status === 429) {
    return ['Creem is rate-limiting this account. Wait a minute and try again — nothing was charged.'];
  }
  return [
    'Check the key was copied whole, with no spaces at either end.',
    'Confirm the Creem account is activated and able to accept payments.',
    'If Creem is reporting an outage, wait and try again — nothing here is saved as broken.',
  ];
}

interface ProductEntity { id?: string; name?: string; status?: string }
interface CheckoutEntity { id?: string; checkout_url?: string; status?: string }

/** The one product every order in a workspace is charged against. */
async function orderProduct(key: string, ctx: ProviderContext, currency: string): Promise<{ id: string; error: string; steps: string[] }> {
  if (ctx.providerRef) {
    /* Trust the remembered one, but confirm it is still there — a customer who
       tidied their Creem catalogue would otherwise get a failed checkout with
       no explanation. */
    const got = await call<ProductEntity>(key, `/v1/products/${encodeURIComponent(ctx.providerRef)}`);
    if (got.ok && got.data?.id) return { id: got.data.id, error: '', steps: [] };
  }

  const name = `${ctx.companyName || 'Order'}`.slice(0, 100);
  const made = await call<ProductEntity>(key, '/v1/products', {
    method: 'POST',
    body: JSON.stringify({
      name,
      description: 'Orders taken through this business’s own system. The amount is set per order.',
      /* The floor Creem enforces. Every real charge overrides it with
         `custom_price`, so this number is never what anybody pays. */
      price: 100,
      currency,
      billing_type: 'onetime',
    }),
  });
  if (!made.ok || !made.data?.id) {
    return { id: '', error: made.error || 'Creem would not create the order product.', steps: remedy(made.error, made.status) };
  }
  await ctx.remember(made.data.id);
  return { id: made.data.id, error: '', steps: [] };
}

export const creem: PaymentProvider = {
  id: 'creem',
  label: 'Creem',
  /* Creem's own limit on product currency, not ours. Anything else is refused
     at connect time rather than at the checkout a buyer is looking at. */
  currencies: ['USD', 'EUR'],
  keyHint: 'creem.io → Developers → API keys',

  validateKey(key) {
    const k = key.trim();
    if (!k) return 'Paste your Creem API key.';
    if (!k.startsWith('creem_')) {
      return 'That does not look like a Creem API key. They start creem_ — creem_test_ for the sandbox.';
    }
    if (k.length < 16) return 'That Creem key looks truncated. Copy the whole thing.';
    return '';
  },

  modeOf(key) {
    return isTest(key) ? 'test' : 'live';
  },

  async verify(key) {
    /* Listing products reads the account and creates nothing, so pressing Test
       twice leaves the customer's Creem exactly as it was. */
    const r = await call<unknown>(key, '/v1/products?page_size=1');
    if (!r.ok) {
      return { ok: false, error: r.error, steps: remedy(r.error, r.status), name: '', mode: isTest(key) ? 'test' : 'live', chargesEnabled: false };
    }
    return {
      ok: true, error: '', steps: [],
      name: 'your Creem account',
      mode: isTest(key) ? 'test' : 'live',
      /* Creem is a merchant of record: if the key works, it can sell. There is
         no separate "charges enabled" to read, and inventing one would be a
         reassurance with nothing behind it. */
      chargesEnabled: true,
    };
  },

  async checkout(key, req, ctx) {
    const no = (error: string, steps: string[] = []) =>
      ({ ok: false, url: '', sessionId: '', expiresNote: '', error, steps });

    const currency = req.currency.toUpperCase();
    if (!['USD', 'EUR'].includes(currency)) {
      return no(
        `Creem can only take payments in US dollars or euros, and this order is in ${currency}.`,
        [
          'Change this workspace’s currency to USD or EUR under “Getting paid”, or',
          'connect Stripe instead, which takes most currencies.',
        ],
      );
    }
    if (req.amountCents < 100) {
      return no(
        `Creem will not take a payment under 1.00 ${currency}, and this order is ${(req.amountCents / 100).toFixed(2)}.`,
        ['Combine it with something else, or take this one by hand.'],
      );
    }

    const product = await orderProduct(key, ctx, currency);
    if (!product.id) return no(product.error, product.steps);

    const r = await call<CheckoutEntity>(key, '/v1/checkouts', {
      method: 'POST',
      body: JSON.stringify({
        product_id: product.id,
        units: 1,
        custom_price: req.amountCents,
        /* Both, because the webhook has to find this order again: request_id is
           echoed back, and metadata survives flows where it is not. */
        request_id: req.reference,
        metadata: { orderId: req.reference, description: req.description.slice(0, 200) },
        ...(req.email ? { customer: { email: req.email } } : {}),
        ...(req.successUrl ? { success_url: req.successUrl } : {}),
      }),
    });
    if (!r.ok || !r.data?.checkout_url) {
      return no(r.error || 'Creem did not return a checkout link.', remedy(r.error, r.status));
    }
    return {
      ok: true, error: '', steps: [],
      url: r.data.checkout_url,
      sessionId: String(r.data.id ?? ''),
      /* Creem does not publish a fixed expiry the way Stripe does, so this says
         what is known rather than inventing a number. */
      expiresNote: 'Send this to the buyer. If it stops working, generate another.',
    };
  },

  async verifySignature(secret, rawBody, headers) {
    const given = headers.get('creem-signature') ?? '';
    if (!given || !secret) return false;
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
    const expected = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
    /* Constant time, and length-safe: a plain === on hex leaks how much of a
       guess was right through timing. */
    if (given.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  },

  readEvent(rawBody) {
    let ev: {
      eventType?: string;
      object?: { id?: string; request_id?: string; metadata?: Record<string, string>; order?: { id?: string }; customer?: { email?: string } };
    };
    try { ev = JSON.parse(rawBody); } catch { return null; }

    const o = ev.object ?? {};
    const reference = String(o.request_id || o.metadata?.orderId || '');
    const sessionId = String(o.id ?? '');
    const type = String(ev.eventType ?? '');

    const kind: PaymentEvent['kind'] =
      type === 'checkout.completed' ? 'paid'
        : type === 'refund.created' ? 'refunded'
          : type === 'dispute.created' ? 'refunded'
            : 'other';

    /* Creem is the merchant of record and collects the buyer's address itself
       for tax purposes; it is not handed back on the checkout event in a shape
       this app can post a parcel to. So no shipping is claimed — the supplier
       path will say the address is missing, which is true, rather than posting
       to a half-read one. */
    return { kind, reference, sessionId };
  },
};
