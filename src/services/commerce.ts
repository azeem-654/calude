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

/**
 * A tax rate per country — and firmly not a tax engine.
 *
 * It does not know about US state and city nexus, about which states tax
 * delivery, about digital place-of-supply, or about EU OSS thresholds. Saying
 * otherwise would be the worst kind of wrong here: under-collecting quietly for
 * a year is a bill with interest on it, and nothing on the screen would have
 * prompted a second look. So the panel says so, in as many words.
 */
export interface TaxRate {
  id: string;
  /** What the receipt calls it: VAT, Sales tax, GST. */
  name: string;
  /** Comma-separated ISO codes. Empty taxes everywhere — see the panel's note. */
  countries: string;
  /** Hundredths of a percent, so 8.875% is 888 rather than an impossible 8.875. */
  percentBp: number;
  position: number;
  status: 'active' | 'off';
}

/**
 * A rate as a percentage for a person to read or type. 2000 → "20", 888 → "8.88".
 *
 * No trailing-zero trimming: JavaScript's own number formatting never produces
 * any, and a regex that strips them turns 20% into 2%.
 */
export const bpToPercent = (bp: number): string => String(Math.round(bp) / 100);

/** And back. "8.875" → 888 (hundredths of a percent, rounded to what fits). */
export const percentToBp = (pct: string): number => {
  const n = Number(String(pct).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.min(10_000, Math.max(0, Math.round(n * 100)));
};

/**
 * A group a shopkeeper merchandises with.
 *
 * Not the same thing as `Product.category`, and deliberately not a replacement
 * for it. A category files a candle under Candles and nowhere else; a
 * collection puts the same candle in "New in", "Under £20" and "Gifts" at
 * once, or in none of them. One is how stock is organised and the other is how
 * it is sold, and a shop should not have to choose.
 */
export interface Collection {
  id: string;
  name: string;
  /** For the address it can be linked at. Derived from the name when not given. */
  slug: string;
  description: string;
  /** In the order the shopkeeper put them in — the point of a hand-built one. */
  productIds: string[];
  position: number;
  status: 'active' | 'off';
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
  tax?: TaxRate[];
  pricesIncludeTax?: boolean;
  collections?: Collection[];
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
    tax: (r.tax ?? []) as TaxRate[],
    collections: (r.collections ?? []) as Collection[],
    /* Defaults to true when the server said nothing, matching the column — a
       shop that has never opened the panel is treated as listing tax-inclusive
       prices, which is the norm where most of this install's customers are. */
    pricesIncludeTax: r.pricesIncludeTax !== false,
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
export async function saveTax(r: Partial<TaxRate>): Promise<Reply> { return call('save_tax', r); }
export async function deleteTax(id: string): Promise<Reply> { return call('delete_tax', { id }); }
export async function saveTaxSettings(pricesIncludeTax: boolean): Promise<Reply> {
  return call('save_tax_settings', { pricesIncludeTax });
}

/**
 * Save a collection, and optionally what is in it.
 *
 * `productIds` absent means "I was not editing the contents" and leaves them
 * alone; `[]` means "take everything out". Collapsing the two would empty a
 * collection every time somebody renamed one.
 */
export async function saveCollection(c: Partial<Collection>): Promise<Reply> { return call('save_collection', c); }
export async function deleteCollection(id: string): Promise<Reply> { return call('delete_collection', { id }); }

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
