/**
 * Ideas, products and orders.
 *
 * There is no checkout behind any of this yet, and the endpoint says so in its
 * own payload rather than leaving the screen to guess — an empty orders list
 * that looks like nobody has bought anything is worse than one that explains
 * why it is empty.
 */
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';
import { API_BASE } from './apiBase';

export interface BusinessIdea {
  id: string;
  title: string;
  summary: string;
  audience: string;
  problem: string;
  /** The model's rough figures. Labelled as estimates wherever shown. */
  estStartup: number;
  estMonthly: number;
  currency: string;
  status: 'suggested' | 'shortlisted' | 'chosen' | 'dismissed';
  because: string;
  createdAt: string;
}

export interface Variant {
  id: string;
  title: string;
  sku: string;
  priceCents: number;
  compareAtCents: number;
  inventory: number;
  imageUrl: string;
  position: number;
}

/**
 * A code a buyer types at the checkout.
 *
 * `usedCount` is incremented when an order is *paid*, not when the code is
 * typed — otherwise ten abandoned payment pages exhaust a ten-use code and the
 * eleventh person, the one who actually paid, is refused.
 */
export interface Discount {
  id: string;
  code: string;
  kind: 'percent' | 'fixed';
  /** Whole percentage points, or minor units. */
  value: number;
  minSpendCents: number;
  startsAt: string | null;
  endsAt: string | null;
  /** 0 means unlimited, which has to be expressible. */
  usageLimit: number;
  usedCount: number;
  status: 'active' | 'off';
}

/**
 * What delivery costs, and where.
 *
 * Deliberately not live carrier rates: those need weights, dimensions and a
 * carrier contract, and getting one wrong charges a real buyer the wrong
 * amount. This is what a small shop actually uses.
 */
export interface ShippingRate {
  id: string;
  name: string;
  /** Comma-separated ISO codes. Empty is the catch-all, so every country has
   *  an answer rather than shipping free by accident. */
  countries: string;
  kind: 'flat' | 'free_over';
  amountCents: number;
  thresholdCents: number;
  position: number;
  status: 'active' | 'off';
}

export interface Product {
  id: string;
  name: string;
  description: string;
  sku: string;
  /** Minor units. A float price eventually shows 19.989999999999998. */
  priceCents: number;
  costCents: number;
  /** What it used to be. Shown struck through, and only when above the price. */
  compareAtCents: number;
  currency: string;
  source: string;
  supplierRef: string;
  status: 'draft' | 'active' | 'archived';
  createdAt: string;
  /** A URL or a data: URI. Images do not live in D1 rows. */
  imageUrl: string;
  category: string;
  inventory: number;
  /** 0 or 1 from SQLite. Off by default: most of what this app sells is a
   *  service with no stock, and "out of stock" because nobody typed a number
   *  is worse than never mentioning stock at all. */
  trackInventory: number;
  /** Which project's catalogue this belongs to. Empty means the workspace's. */
  projectId: string;
  /** Lowest first in the shop, so the thing worth selling can go at the top. */
  sortOrder: number;
  /** Empty when this product sells as itself, which is most of them. */
  variants?: Variant[];
  /** Extra pictures beyond `imageUrl`, as a JSON array of URLs. */
  images?: string;
}

export interface OrderLine { productId: string; name: string; qty: number; priceCents: number }

export interface Order {
  id: string;
  contactId: string;
  email: string;
  items: OrderLine[];
  totalCents: number;
  currency: string;
  status: 'pending' | 'paid' | 'fulfilled' | 'cancelled' | 'refunded';
  channel: string;
  placedAt: string;
  /* Collected by Stripe at checkout, when the order has something to post. */
  shipName: string;
  shipCity: string;
  shipCountry: string;
  /* Empty until it has actually reached a supplier. '' | 'draft' | 'submitted'
     | 'failed' — draft means sent and not yet charged or made. */
  supplierProvider: string;
  supplierRef: string;
  supplierStatus: string;
  supplierError: string;
  /** How many lines a supplier could actually make. Zero means don't offer it. */
  supplierLines: number;
}

interface Reply {
  success: boolean;
  error?: string;
  id?: string;
  ideas?: BusinessIdea[];
  products?: Product[];
  orders?: Order[];
  storefront?: { available: boolean; note: string };
  supplierConnected?: boolean;
  discounts?: Discount[];
  shipping?: ShippingRate[];
}

async function call(action: string, extra: Record<string, unknown> = {}): Promise<Reply> {
  const accountId = getActiveAccountId();
  if (!accountId) return { success: false, error: 'No workspace is active yet.' };
  try {
    const r = await fetch(`${API_BASE}/api/commerce.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), accountId, action, ...extra }),
    });
    return await r.json() as Reply;
  } catch (e) {
    return { success: false, error: `Could not reach the server: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function fetchCommerce() {
  const r = await call('get');
  return {
    ideas: r.ideas ?? [],
    products: r.products ?? [],
    orders: r.orders ?? [],
    storefront: r.storefront ?? { available: false, note: '' },
    supplierConnected: !!r.supplierConnected,
    discounts: (r.discounts ?? []) as Discount[],
    shipping: (r.shipping ?? []) as ShippingRate[],
  };
}

/**
 * Replace a product's whole set of options at once.
 *
 * Wholesale rather than merged: the form edits them together — adding a colour
 * re-titles every variant — so a merge would have to guess which old row each
 * new one meant, and guess wrong on a rename.
 */
export async function saveVariants(
  productId: string, variants: Partial<Variant>[], options: { name: string; values: string[] }[],
): Promise<Reply> {
  return call('save_variants', { id: productId, variants, options });
}

export async function saveDiscount(d: Partial<Discount>): Promise<Reply> { return call('save_discount', d); }
export async function deleteDiscount(id: string): Promise<Reply> { return call('delete_discount', { id }); }
export async function saveShipping(r: Partial<ShippingRate>): Promise<Reply> { return call('save_shipping', r); }
export async function deleteShipping(id: string): Promise<Reply> { return call('delete_shipping', { id }); }

export async function suggestIdeas(about: string, budget: number): Promise<Reply> {
  return call('suggest_ideas', { about, budget });
}
export async function setIdeaStatus(id: string, status: BusinessIdea['status']): Promise<Reply> {
  return call('set_idea_status', { id, status });
}
export async function saveProduct(p: Partial<Product>): Promise<Reply> {
  return call('save_product', p);
}
export async function deleteProduct(id: string): Promise<Reply> { return call('delete_product', { id }); }

/** The total is worked out on the server; sending one here would be ignored. */
export async function recordOrder(email: string, items: OrderLine[], status = 'pending'): Promise<Reply> {
  return call('record_order', { email, items, status });
}
export async function setOrderStatus(id: string, status: Order['status']): Promise<Reply> {
  return call('set_order_status', { id, status });
}

/** Minor units to something a person reads. */
export const money = (cents: number, currency = 'USD') =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format((cents || 0) / 100);
