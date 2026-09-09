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

export interface Product {
  id: string;
  name: string;
  description: string;
  sku: string;
  /** Minor units. A float price eventually shows 19.989999999999998. */
  priceCents: number;
  costCents: number;
  currency: string;
  source: string;
  supplierRef: string;
  status: 'draft' | 'active' | 'archived';
  createdAt: string;
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
  };
}

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
