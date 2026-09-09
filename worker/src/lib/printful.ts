/**
 * Printful: the supplier that makes and posts the thing.
 *
 * ── Why this one ──
 *
 * A dropshipping integration is only worth having if a beginner can actually
 * start with it. Printful has no minimum order, no stock to buy up front, a
 * documented API and a token you can create in a dashboard in a minute. The
 * alternatives worth naming — CJ, Spocket — gate their API behind an approval
 * process, which makes them a bad first supplier for somebody who signed up an
 * hour ago.
 *
 * ── The v1 API, on purpose ──
 *
 * v1 is the one whose shapes have been stable for years and whose errors are
 * predictable: `{code, result, error: {reason, message}}`. v2 exists and is
 * still moving. Nothing here needs what v2 added.
 *
 * ── Draft first, always ──
 *
 * `submitOrder` creates a draft and does not confirm it. Confirming is what
 * charges the customer's Printful account and starts a garment being printed,
 * and it is a separate, deliberate act — the same rule domains and phone
 * numbers follow here. A guess that costs somebody a printed shirt is not a
 * guess worth making on their behalf.
 */

const BASE = 'https://api.printful.com';

export interface PfResult<T> { ok: boolean; data?: T; error: string }

interface Envelope<T> {
  code?: number;
  result?: T;
  error?: { reason?: string; message?: string };
}

export interface PfCreds { token: string; storeId: string }

async function call<T>(
  creds: PfCreds, path: string, init: RequestInit = {},
): Promise<PfResult<T>> {
  try {
    const r = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${creds.token}`,
        'Content-Type': 'application/json',
        /* Only sent when they gave one. An account-level token needs it; a
           store-level token is already scoped and Printful rejects the header
           naming a store the token cannot see. */
        ...(creds.storeId ? { 'X-PF-Store-Id': creds.storeId } : {}),
        ...(init.headers ?? {}),
      },
    });
    const j = await r.json<Envelope<T>>().catch(() => ({} as Envelope<T>));
    if (!r.ok) {
      return { ok: false, error: j.error?.message || `Printful answered HTTP ${r.status}.` };
    }
    return { ok: true, data: j.result, error: '' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Printful could not be reached.' };
  }
}

/* ── Who this token belongs to ────────────────────────────────────────────── */

export interface PfStore { id: number; name: string; type?: string }

/**
 * Verify a token by listing the stores it can see.
 *
 * Reads rather than writes, so pressing Test leaves nothing behind in the
 * customer's Printful account.
 */
export async function verify(creds: PfCreds): Promise<PfResult<PfStore[]>> {
  const r = await call<PfStore[] | PfStore>(creds, '/stores');
  if (!r.ok) return { ok: false, error: r.error };
  /* A store-level token answers with one store, not a list. */
  const d = r.data;
  const stores = Array.isArray(d) ? d : d ? [d] : [];
  if (!stores.length) {
    return { ok: false, error: 'The token works but no store is attached to it. Create a store in Printful first.' };
  }
  return { ok: true, data: stores, error: '' };
}

/* ── What they already sell ───────────────────────────────────────────────── */

export interface PfSyncProduct {
  id: number;
  external_id?: string;
  name: string;
  variants?: number;
  synced?: number;
  thumbnail_url?: string;
  is_ignored?: boolean;
}

export interface PfSyncVariant {
  id: number;
  name: string;
  sku?: string;
  retail_price?: string;
  currency?: string;
  variant_id?: number;
}

export function listProducts(creds: PfCreds, limit = 100): Promise<PfResult<PfSyncProduct[]>> {
  return call<PfSyncProduct[]>(creds, `/store/products?limit=${Math.min(Math.max(limit, 1), 100)}`);
}

export function getProduct(creds: PfCreds, id: number): Promise<PfResult<{
  sync_product: PfSyncProduct;
  sync_variants: PfSyncVariant[];
}>> {
  return call(creds, `/store/products/${id}`);
}

/* ── Sending an order to be made ──────────────────────────────────────────── */

export interface PfRecipient {
  name: string;
  address1: string;
  address2?: string;
  city: string;
  state_code?: string;
  country_code: string;
  zip: string;
  phone?: string;
  email?: string;
}

export interface PfItem { sync_variant_id: number; quantity: number }

export interface PfOrder { id: number; status?: string; dashboard_url?: string }

/**
 * Countries where Printful refuses an order without a state or province code.
 *
 * Checked here rather than left to the API, because the failure it produces
 * — "recipient.state_code: The state code is not valid" — arrives after the
 * seller has already told a buyer their order is on its way.
 */
const STATE_REQUIRED = new Set(['US', 'CA', 'AU', 'JP']);

/** Everything wrong with this address, in words the seller can act on. */
export function addressProblems(r: PfRecipient): string[] {
  const out: string[] = [];
  if (!r.name.trim()) out.push('No name to address the parcel to.');
  if (!r.address1.trim()) out.push('No street address.');
  if (!r.city.trim()) out.push('No town or city.');
  if (!/^[A-Za-z]{2}$/.test(r.country_code)) out.push('No country.');
  if (!r.zip.trim()) out.push('No postcode or ZIP.');
  if (STATE_REQUIRED.has(r.country_code.toUpperCase()) && !(r.state_code ?? '').trim()) {
    out.push(`${r.country_code.toUpperCase()} addresses need a state or province code — Printful refuses them without one.`);
  }
  return out;
}

/**
 * Create the order as a draft.
 *
 * `external_id` is the app's own order id, which makes the submission
 * idempotent from Printful's side: a retry after a timeout finds the existing
 * draft instead of printing the order twice.
 */
export function submitOrder(
  creds: PfCreds, externalId: string, recipient: PfRecipient, items: PfItem[],
): Promise<PfResult<PfOrder>> {
  return call<PfOrder>(creds, '/orders', {
    method: 'POST',
    body: JSON.stringify({ external_id: externalId, recipient, items }),
  });
}

/** Confirm a draft for fulfilment. This is the call that spends money. */
export function confirmOrder(creds: PfCreds, id: number): Promise<PfResult<PfOrder>> {
  return call<PfOrder>(creds, `/orders/${id}/confirm`, { method: 'POST' });
}

export function getOrder(creds: PfCreds, id: number): Promise<PfResult<PfOrder>> {
  return call<PfOrder>(creds, `/orders/${id}`);
}
