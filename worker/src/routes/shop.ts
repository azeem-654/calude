/**
 * A public shop: what is for sale, and taking money for it.
 *
 * ── The part that makes this different from every other route here ──
 *
 * Half of it answers to nobody. A visitor who has never heard of this app opens
 * /shop/<slug>, sees a catalogue and pays — so `get` and `buy` take no session
 * token, which means every assumption the signed-in routes make has to be
 * re-earned here:
 *
 *  - **The price is never taken from the caller.** It is read from the product
 *    row by id. A checkout that trusts an amount in the request body is a shop
 *    that sells a £400 boiler service for a penny, and the first person to open
 *    developer tools finds it.
 *  - **A draft shop 404s.** Not "renders empty" — a half-built shop with a
 *    working buy button on it is worse than no shop.
 *  - **Only active products are listed or sellable.** A draft product is one the
 *    customer has not agreed to sell yet, and Autopilot files imported ones as
 *    drafts precisely so nobody sells a supplier's catalogue by accident.
 *  - **Orders are rate-limited per address.** The endpoint creates rows for
 *    anonymous callers, and a shop's orders list is worthless once anybody can
 *    fill it.
 */
import { addr, body, fail, json } from '../lib/http';
import { canAccess, nowIso, userFromToken, type Env } from '../lib/db';
import { createPayLink } from './storefront';

interface Req {
  token?: string;
  action?: string;
  accountId?: string;
  /* Public */
  slug?: string;
  productId?: string;
  qty?: number;
  email?: string;
  /* Owner */
  id?: string;
  projectId?: string;
  name?: string;
  headline?: string;
  about?: string;
  accent?: string;
  status?: string;
  productIds?: string[];
}

interface ShopRow {
  id: string; account_id: string; project_id: string; slug: string;
  name: string; headline: string; about: string; accent: string; status: string;
}

const rid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** A slug that can live in a URL and cannot be mistaken for a route. */
export function cleanSlug(v: unknown): string {
  return String(v ?? '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

const RESERVED = new Set(['api', 'app', 'admin', 'shop', 'book', 'preview', 'login', 'signup', 'settings']);

/**
 * How many orders one address may place in an hour.
 *
 * Generous for a real buyer — nobody legitimately orders thirty times in an
 * hour — and low enough that filling a customer's orders list with rubbish is
 * tedious. Counted against crm_orders directly rather than a new table: the
 * rows are the thing being protected.
 */
const MAX_ORDERS_PER_HOUR = 30;

export async function handleShop(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const act = d.action ?? 'get';

  /* ── Public: what is for sale ── */
  if (act === 'get') {
    const slug = cleanSlug(d.slug);
    if (!slug) return fail('No shop was named.', 404, { notFound: true });

    const shop = await env.DB.prepare(
      "SELECT * FROM crm_shops WHERE slug = ? AND status = 'published'",
    ).bind(slug).first<ShopRow>();
    /* One answer for "no such shop" and "not published yet", so the address bar
       cannot be used to discover which shops exist but are unfinished. */
    if (!shop) return fail('There is no shop at this address.', 404, { notFound: true });

    const { results } = await env.DB.prepare(
      `SELECT id, name, description, price_cents AS priceCents, currency, sku
       FROM crm_products
       WHERE account_id = ? AND status = 'active'
         AND (project_id = ? OR project_id = '')
       ORDER BY created_at DESC LIMIT 100`,
    ).bind(shop.account_id, shop.project_id).all();

    /* The storefront's own currency decides, because that is what the checkout
       will actually charge in. */
    const sf = await env.DB.prepare('SELECT currency, verified_at FROM crm_storefront WHERE account_id = ?')
      .bind(shop.account_id).first<{ currency: string; verified_at: string | null }>();

    return json({
      success: true,
      shop: {
        slug: shop.slug, name: shop.name, headline: shop.headline,
        about: shop.about, accent: shop.accent,
      },
      products: results ?? [],
      currency: sf?.currency ?? 'USD',
      /* Said plainly rather than discovered at the buy button: a shop whose
         owner has not connected a processor cannot take money, and a visitor
         should not fill in their email to find that out. */
      canBuy: !!sf?.verified_at,
    });
  }

  /* ── Public: buy one thing ── */
  if (act === 'buy') {
    const slug = cleanSlug(d.slug);
    const shop = await env.DB.prepare(
      "SELECT * FROM crm_shops WHERE slug = ? AND status = 'published'",
    ).bind(slug).first<ShopRow>();
    if (!shop) return fail('There is no shop at this address.', 404, { notFound: true });

    const email = addr(d.email);
    if (!email) return fail('Enter the email address your receipt should go to.');

    const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const recent = await env.DB.prepare(
      "SELECT count(*) AS n FROM crm_orders WHERE account_id = ? AND placed_at > ? AND contact_id = ?",
    ).bind(shop.account_id, since, `ip:${ip}`).first<{ n: number }>();
    if ((recent?.n ?? 0) >= MAX_ORDERS_PER_HOUR) {
      return fail('Too many orders from this connection in the last hour. Try again shortly.', 429);
    }

    /* The price comes from the row, never from the request. */
    const product = await env.DB.prepare(
      "SELECT id, name, price_cents, currency FROM crm_products WHERE id = ? AND account_id = ? AND status = 'active'",
    ).bind(String(d.productId ?? ''), shop.account_id)
      .first<{ id: string; name: string; price_cents: number; currency: string }>();
    if (!product) return fail('That item is not for sale.');
    if (product.price_cents <= 0) return fail('That item has no price set, so it cannot be bought yet.');

    /* One currency for the workspace, and it is the storefront's — the same one
       `get` puts on the page and the one createPayLink will actually charge in.
       Taking the product's instead meant a catalogue stamped USD quietly
       overriding a shop that had since moved to GBP: the page said one thing
       and the card was debited in the other. */
    const sf = await env.DB.prepare('SELECT currency FROM crm_storefront WHERE account_id = ?')
      .bind(shop.account_id).first<{ currency: string }>();
    const currency = (sf?.currency || product.currency || 'USD').toUpperCase();

    const qty = Math.min(Math.max(Math.round(Number(d.qty) || 1), 1), 50);
    const items = [{ productId: product.id, name: product.name, qty, priceCents: product.price_cents }];
    const total = qty * product.price_cents;

    const now = nowIso();
    const orderId = rid('ord');
    await env.DB.prepare(
      `INSERT INTO crm_orders
       (id, account_id, contact_id, email, items, total_cents, currency, status, channel,
        shop_id, placed_at, updated_at)
       VALUES (?,?,?,?,?,?,?, 'pending', 'shop', ?,?,?)`,
    ).bind(
      orderId, shop.account_id, `ip:${ip}`, email, JSON.stringify(items), total,
      currency, shop.id, now, now,
    ).run();

    const origin = new URL(req.url).origin;
    const link = await createPayLink(env, shop.account_id, orderId, origin);
    if (!link.ok) {
      /* The order stays, marked as it is. A visitor who could not pay is still
         somebody who tried to buy, and the shop's owner should see that rather
         than have the evidence deleted to keep a list tidy. */
      await env.DB.prepare("UPDATE crm_orders SET status = 'pending', updated_at = ? WHERE id = ?")
        .bind(nowIso(), orderId).run();
      return fail(link.error || 'This shop cannot take payment right now.');
    }
    return json({ success: true, url: link.url, orderId });
  }

  /* ── Everything below is the owner's ── */
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });
  const accountId = String(d.accountId ?? '').trim();
  if (!/^[A-Za-z0-9_.\-]{1,64}$/.test(accountId)) return fail('A valid workspace is required.');
  if (!(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours.', 403);

  const list = async () => {
    const { results } = await env.DB.prepare(
      `SELECT s.id, s.project_id AS projectId, s.slug, s.name, s.headline, s.about,
              s.accent, s.status, s.created_at AS createdAt,
              COALESCE(j.name, '') AS projectName,
              (SELECT count(*) FROM crm_products p
                WHERE p.account_id = s.account_id AND p.status = 'active'
                  AND (p.project_id = s.project_id OR p.project_id = '')) AS products,
              (SELECT count(*) FROM crm_orders o WHERE o.shop_id = s.id) AS orders
       FROM crm_shops s
       LEFT JOIN crm_projects j ON j.id = s.project_id
       WHERE s.account_id = ? ORDER BY s.created_at DESC LIMIT 50`,
    ).bind(accountId).all();
    return results ?? [];
  };

  if (act === 'list') return json({ success: true, shops: await list() });

  if (act === 'save') {
    const id = String(d.id ?? '').trim() || rid('shop');
    const name = String(d.name ?? '').trim();
    if (!name) return fail('Give the shop a name.');

    let slug = cleanSlug(d.slug) || cleanSlug(name);
    if (!slug) return fail('That name cannot be turned into a web address — use some letters or numbers.');
    if (RESERVED.has(slug)) return fail(`"${slug}" is reserved. Pick another address.`);

    const clash = await env.DB.prepare('SELECT id FROM crm_shops WHERE slug = ? AND id != ?')
      .bind(slug, id).first<{ id: string }>();
    if (clash) return fail(`The address /shop/${slug} is already taken. Try another.`);

    const status = d.status === 'published' ? 'published' : 'draft';
    if (status === 'published') {
      /* Refused rather than published broken: a live shop whose owner cannot be
         paid takes email addresses and gives nothing back. */
      const sf = await env.DB.prepare('SELECT verified_at FROM crm_storefront WHERE account_id = ?')
        .bind(accountId).first<{ verified_at: string | null }>();
      if (!sf?.verified_at) {
        return fail('Connect and test a payment processor under “Getting paid” before publishing — a shop that cannot take money should not be open.');
      }
    }

    const now = nowIso();
    const existing = await env.DB.prepare('SELECT created_at FROM crm_shops WHERE id = ? AND account_id = ?')
      .bind(id, accountId).first<{ created_at: string }>();

    await env.DB.prepare(
      `INSERT INTO crm_shops (id, account_id, project_id, slug, name, headline, about, accent, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         project_id=excluded.project_id, slug=excluded.slug, name=excluded.name,
         headline=excluded.headline, about=excluded.about, accent=excluded.accent,
         status=excluded.status, updated_at=excluded.updated_at`,
    ).bind(
      id, accountId, String(d.projectId ?? '').slice(0, 80), slug, name.slice(0, 120),
      String(d.headline ?? '').slice(0, 200), String(d.about ?? '').slice(0, 2000),
      String(d.accent ?? '#17191c').slice(0, 16), status,
      existing?.created_at ?? now, now,
    ).run();

    return json({ success: true, id, slug, shops: await list() });
  }

  if (act === 'delete') {
    await env.DB.prepare('DELETE FROM crm_shops WHERE id = ? AND account_id = ?')
      .bind(String(d.id ?? ''), accountId).run();
    return json({ success: true, shops: await list() });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}
