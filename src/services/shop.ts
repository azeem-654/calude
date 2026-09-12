/**
 * The public shop, from the owner's side.
 *
 * The visitor-facing half of /api/shop.php takes no token and is called
 * directly by ShopPage — it has no session to read. Everything here is the
 * other half: listing, saving and deleting the shops a workspace owns.
 */
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';
import { API_BASE } from './apiBase';

export interface Shop {
  id: string;
  projectId: string;
  projectName: string;
  slug: string;
  name: string;
  headline: string;
  about: string;
  accent: string;
  /** Which look. See src/components/Shop/themes.ts. */
  template: string;
  heroImage: string;
  /** What a buyer asks before paying, and after. Empty hides the section
   *  entirely rather than showing placeholder text nobody wrote. */
  shippingNote: string;
  returnsNote: string;
  contactEmail: string;
  status: 'draft' | 'published';
  /** How many active products this shop would show, and how many orders it took. */
  products: number;
  orders: number;
  createdAt: string;
}

interface Res { success: boolean; shops?: Shop[]; error?: string; slug?: string; id?: string }

async function call(payload: Record<string, unknown>): Promise<Res> {
  try {
    const r = await fetch(`${API_BASE}/api/shop.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, token: sessionToken(), accountId: getActiveAccountId() }),
    });
    const d = await r.json() as { success?: boolean; shops?: Shop[]; message?: string; slug?: string; id?: string };
    return { success: !!d.success, shops: d.shops, error: d.message, slug: d.slug, id: d.id };
  } catch {
    return { success: false, error: 'Could not reach the server.' };
  }
}

export const listShops = () => call({ action: 'list' });

export const saveShop = (s: Partial<Shop>) => call({
  action: 'save',
  id: s.id, projectId: s.projectId ?? '', slug: s.slug, name: s.name,
  headline: s.headline ?? '', about: s.about ?? '', accent: s.accent ?? '#17191c',
  status: s.status ?? 'draft',
  template: s.template ?? 'classic', heroImage: s.heroImage ?? '',
  shippingNote: s.shippingNote ?? '', returnsNote: s.returnsNote ?? '',
  contactEmail: s.contactEmail ?? '',
});

export const deleteShop = (id: string) => call({ action: 'delete', id });

/** The address a visitor actually types. Absolute, because it gets shared. */
export function shopUrl(slug: string): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${window.location.origin}${base}/shop/${slug}`;
}
