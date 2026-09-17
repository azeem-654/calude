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
import { priceBasket, type Discount, type ShippingRate, type TaxRate } from '../lib/checkout';
import { createPayLink } from './storefront';
import { rateLimit } from '../lib/rateLimit';

interface Req {
  token?: string;
  action?: string;
  accountId?: string;
  /* Public */
  slug?: string;
  productId?: string;
  /** Which option the buyer chose. Looked up, never trusted for its price. */
  variantId?: string;
  /** The whole basket. Prices are never taken from it — only what and how many. */
  items?: Array<{ productId?: string; variantId?: string; qty?: number }>;
  qty?: number;
  email?: string;
  discountCode?: string;
  /** Two-letter code, to pick a delivery rate. */
  shipCountry?: string;
  /** The reference on the receipt, for looking an order up again. */
  reference?: string;
  country?: string;
  /* Owner */
  id?: string;
  projectId?: string;
  name?: string;
  headline?: string;
  about?: string;
  accent?: string;
  status?: string;
  productIds?: string[];
  template?: string;
  heroImage?: string;
  shippingNote?: string;
  returnsNote?: string;
  contactEmail?: string;
}

interface ShopRow {
  id: string; account_id: string; project_id: string; slug: string;
  name: string; headline: string; about: string; accent: string; status: string;
  template: string; hero_image: string;
  shipping_note: string; returns_note: string; contact_email: string;
}

/** The looks a shop can wear. Must match src/components/Shop/themes.ts. */
const TEMPLATES = new Set(['classic', 'bold', 'editorial', 'minimal', 'market']);

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


/**
 * What a basket costs, from the rules this shop actually has.
 *
 * Shared by `quote` and `buy` so the number on the page and the number on the
 * card cannot disagree. The browser never does this arithmetic — a total
 * assembled in a browser is a total somebody can edit.
 */
async function priceFor(
  env: Env,
  accountId: string,
  items: Array<{ name: string; qty: number; priceCents: number }>,
  d: Req,
) {
  const { results: rateRows } = await env.DB.prepare(
    `SELECT id, name, countries, kind, amount_cents AS amountCents,
            threshold_cents AS thresholdCents, position, status
     FROM crm_shipping_rates WHERE account_id = ? LIMIT 50`,
  ).bind(accountId).all<ShippingRate>();

  const typedCode = String(d.discountCode ?? '').trim().toUpperCase().slice(0, 40);
  let discountRow: Discount | null = null;
  if (typedCode) {
    discountRow = await env.DB.prepare(
      `SELECT code, kind, value, min_spend_cents AS minSpendCents,
              starts_at AS startsAt, ends_at AS endsAt,
              usage_limit AS usageLimit, used_count AS usedCount, status
       FROM crm_discounts WHERE account_id = ? AND code = ?`,
    ).bind(accountId, typedCode).first<Discount>();
  }

  const { results: taxRows } = await env.DB.prepare(
    `SELECT id, name, countries, percent_bp AS percentBp, position, status
     FROM crm_tax_rates WHERE account_id = ? LIMIT 50`,
  ).bind(accountId).all<TaxRate>();

  /* Missing row means the shop has never opened the panel, and the column
     default is "included" — so a shop that has set no tax at all is unaffected
     either way, because there is no rate to apply. */
  const sf = await env.DB.prepare(
    'SELECT prices_include_tax AS inc FROM crm_storefront WHERE account_id = ?',
  ).bind(accountId).first<{ inc: number }>();

  return priceBasket({
    lines: items.map(i => ({ name: i.name, qty: i.qty, priceCents: i.priceCents })),
    discount: discountRow,
    codeTyped: typedCode,
    rates: rateRows ?? [],
    country: String(d.shipCountry ?? d.country ?? '').trim(),
    taxRates: taxRows ?? [],
    pricesIncludeTax: sf ? sf.inc !== 0 : true,
  });
}

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
      `SELECT id, name, description, price_cents AS priceCents, currency, sku,
              image_url AS imageUrl, images, options, compare_at_cents AS compareAtCents,
              category, inventory, track_inventory AS trackInventory
       FROM crm_products
       WHERE account_id = ? AND status = 'active'
         AND (project_id = ? OR project_id = '')
       ORDER BY sort_order ASC, created_at DESC LIMIT 200`,
    ).bind(shop.account_id, shop.project_id).all<Record<string, unknown>>();

    /*
     * Variants for the whole catalogue in one query, then grouped.
     *
     * A query per product is two hundred round trips on a page a stranger is
     * waiting for. Only the ones on this shop's products, so a workspace with
     * several shops does not leak another one's range onto this page.
     */
    const ids = (results ?? []).map(p => String(p.id));
    const byProduct = new Map<string, unknown[]>();
    if (ids.length) {
      const { results: vars } = await env.DB.prepare(
        `SELECT id, product_id AS productId, title, price_cents AS priceCents,
                compare_at_cents AS compareAtCents, inventory, image_url AS imageUrl, sku
         FROM crm_product_variants
         WHERE account_id = ? AND product_id IN (${ids.map(() => '?').join(',')})
         ORDER BY position ASC LIMIT 2000`,
      ).bind(shop.account_id, ...ids).all<{ productId: string }>();
      for (const v of vars ?? []) {
        const list = byProduct.get(v.productId) ?? [];
        list.push(v);
        byProduct.set(v.productId, list);
      }
    }
    const products = (results ?? []).map(p => ({ ...p, variants: byProduct.get(String(p.id)) ?? [] }));

    /* What delivery will cost, so the page can say it before the buyer commits
       rather than at the last screen. */
    const { results: rates } = await env.DB.prepare(
      `SELECT id, name, countries, kind, amount_cents AS amountCents,
              threshold_cents AS thresholdCents, position, status
       FROM crm_shipping_rates WHERE account_id = ? AND status = 'active'
       ORDER BY position ASC LIMIT 50`,
    ).bind(shop.account_id).all();

    /* The storefront's own currency decides, because that is what the checkout
       will actually charge in. */
    const sf = await env.DB.prepare(
      'SELECT currency, verified_at, prices_include_tax AS inc FROM crm_storefront WHERE account_id = ?',
    ).bind(shop.account_id).first<{ currency: string; verified_at: string | null; inc: number }>();

    /* Only worth saying when there is a rate that could apply. A shop with no
       tax set up printing "prices include tax" would be claiming a VAT
       position it does not have. */
    const anyTax = await env.DB.prepare(
      "SELECT count(*) AS n FROM crm_tax_rates WHERE account_id = ? AND status = 'active' AND percent_bp > 0",
    ).bind(shop.account_id).first<{ n: number }>();

    return json({
      success: true,
      shop: {
        slug: shop.slug, name: shop.name, headline: shop.headline,
        about: shop.about, accent: shop.accent,
        template: TEMPLATES.has(shop.template) ? shop.template : 'classic',
        heroImage: shop.hero_image,
        shippingNote: shop.shipping_note,
        returnsNote: shop.returns_note,
        contactEmail: shop.contact_email,
      },
      products,
      /* The rules, not a computed price — the page has no country until the
         buyer says, and quoting one before they do would be a guess. */
      shippingRates: rates ?? [],
      currency: sf?.currency ?? 'USD',
      /* Null when the shop charges no tax, so the page prints nothing rather
         than a reassurance nobody is entitled to. */
      pricesIncludeTax: (anyTax?.n ?? 0) > 0 ? (sf ? sf.inc !== 0 : true) : null,
      /* Said plainly rather than discovered at the buy button: a shop whose
         owner has not connected a processor cannot take money, and a visitor
         should not fill in their email to find that out. */
      canBuy: !!sf?.verified_at,
    });
  }

  /*
   * ── Where is my order? ────────────────────────────────────────────────────
   *
   * The commonest email a small shop gets, and until now there was nowhere to
   * send somebody. Buying here needs no account, so looking up must not need
   * one either — inventing a password for a shop you used once is the reason
   * people give up and email instead.
   *
   * ── Both halves, and one error ──
   *
   * The reference alone is not enough and neither is the email. They are both
   * on the receipt, so a buyer has both, and an attacker with one of them has
   * nothing.
   *
   * When it does not match, the message never says *which* half was wrong.
   * "No order with that reference" plus "that is not the email on it" is an
   * oracle: given one forwarded receipt, somebody could sit and guess who else
   * bought. One sentence for both is slightly less helpful to the honest buyer
   * and much less useful to everybody else.
   *
   * ── What comes back ──
   *
   * Only what the buyer already had or paid: the items, the totals as they
   * were frozen at the till, the address they typed, the status, and how to
   * reach the shop. Never the shop's internal notes, never the supplier, never
   * the margin. The order belongs to the shop; this is the buyer's copy of it.
   */
  if (act === 'order') {
    /* Cloudflare sets this on everything that reaches the edge, so 'unknown'
       means local development, where one shared budget is the right answer
       anyway. If it ever went missing in production every buyer would share
       twenty lookups per ten minutes — degraded, but still open, which is the
       side to fail on for a page whose whole job is answering a question. */
    const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
    const verdict = await rateLimit(env, {
      what: 'order-lookup', who: ip, max: 20, windowSeconds: 600,
    });
    if (!verdict.allowed) {
      return fail(
        'Too many lookups from this connection. Try again in a few minutes.',
        429, { retryAfter: verdict.retryAfter },
      );
    }

    const shop = await env.DB.prepare(
      "SELECT id, account_id, contact_email FROM crm_shops WHERE slug = ? AND status = 'published'",
    ).bind(cleanSlug(d.slug)).first<{ id: string; account_id: string; contact_email: string }>();
    if (!shop) return fail('There is no shop at this address.', 404, { notFound: true });

    const reference = String(d.reference ?? '').trim().toLowerCase().slice(0, 64);
    const email = addr(d.email);
    /* One sentence, whichever half is missing or wrong — see the note above. */
    const noMatch = 'We could not find an order with that reference and email address. Both are on your receipt.';
    if (!reference || !email) return fail(noMatch, 200, { code: 'no-match' });

    /* Scoped to this shop as well as to the pair. A reference from one shop
       must not resolve on another's page, or the page would be reporting on an
       order its owner cannot see. */
    const row = await env.DB.prepare(
      `SELECT id, email, items, total_cents AS totalCents, currency, status, placed_at AS placedAt,
              discount_code AS discountCode, discount_cents AS discountCents,
              shipping_cents AS shippingCents, tax_cents AS taxCents, tax_label AS taxLabel,
              ship_name AS shipName, ship_address1 AS shipAddress1, ship_address2 AS shipAddress2,
              ship_city AS shipCity, ship_state AS shipState, ship_zip AS shipZip,
              ship_country AS shipCountry
       FROM crm_orders
       WHERE lower(id) = ? AND account_id = ? AND shop_id = ? AND lower(email) = ?`,
    ).bind(reference, shop.account_id, shop.id, email.toLowerCase()).first<Record<string, unknown>>();
    if (!row) return fail(noMatch, 200, { code: 'no-match' });

    let items: Array<{ name?: string; qty?: number; priceCents?: number }> = [];
    try { items = JSON.parse(String(row.items ?? '[]')) as typeof items; } catch { items = []; }

    /* Every number on this receipt comes from the order row and the lines
       frozen onto it — never from today's settings. The shop's tax position,
       its rates and its codes can all have changed since; a receipt that
       restates itself when they do is a receipt nobody can rely on in an
       argument, which is the only time anybody reads one.
       That is also why "was the tax inside the price" is worked out from the
       frozen figures rather than looked up: if the total already contains the
       tax, goods − discount + delivery comes to the total on its own. */
    const goodsCents = items.reduce(
      (n, i) => n + Math.max(0, Math.round(Number(i.qty) || 0)) * Math.max(0, Math.round(Number(i.priceCents) || 0)),
      0,
    );
    const total = Number(row.totalCents ?? 0);
    const taxCents = Number(row.taxCents ?? 0);
    const beforeTax = goodsCents - Number(row.discountCents ?? 0) + Number(row.shippingCents ?? 0);
    const taxIncluded = taxCents === 0 || total === beforeTax;

    return json({
      success: true,
      order: {
        reference: row.id,
        status: row.status,
        placedAt: row.placedAt,
        items,
        currency: row.currency,
        goodsCents,
        discountCode: row.discountCode,
        discountCents: row.discountCents,
        shippingCents: row.shippingCents,
        taxCents,
        taxLabel: row.taxLabel,
        taxIncluded,
        totalCents: total,
        shipName: row.shipName,
        shipAddress1: row.shipAddress1,
        shipAddress2: row.shipAddress2,
        shipCity: row.shipCity,
        shipState: row.shipState,
        shipZip: row.shipZip,
        shipCountry: row.shipCountry,
      },
      /* So a buyer whose question this page cannot answer is not left guessing
         where to ask it. */
      contactEmail: shop.contact_email ?? '',
    });
  }

  /* ── Public: buy one thing ── */
  /*
   * ── What this basket would cost ───────────────────────────────────────────
   *
   * A preview, so the page can show a discount landing and a delivery price
   * before somebody commits — and so the browser never has to do the
   * arithmetic itself. `buy` recomputes from the same helper, so the quote can
   * never be the number that gets charged; it can only ever agree with it.
   */
  if (act === 'quote') {
    const shop = await env.DB.prepare(
      "SELECT id, account_id, project_id FROM crm_shops WHERE slug = ? AND status = 'published'",
    ).bind(cleanSlug(d.slug)).first<{ id: string; account_id: string; project_id: string }>();
    if (!shop) return fail('There is no shop at this address.', 404, { notFound: true });

    const raw = (Array.isArray(d.items) ? d.items : []).slice(0, 20);
    if (!raw.length) return fail('Nothing in the basket.');

    const lines: Array<{ name: string; qty: number; priceCents: number }> = [];
    for (const entry of raw) {
      const qty = Math.min(Math.max(Math.round(Number(entry.qty) || 1), 1), 50);
      const product = await env.DB.prepare(
        `SELECT id, name, price_cents FROM crm_products
         WHERE id = ? AND account_id = ? AND status = 'active'`,
      ).bind(String(entry.productId ?? ''), shop.account_id)
        .first<{ id: string; name: string; price_cents: number }>();
      if (!product) continue;

      let unit = product.price_cents;
      let name = product.name;
      const variantId = String(entry.variantId ?? '').trim();
      if (variantId) {
        const v = await env.DB.prepare(
          'SELECT title, price_cents FROM crm_product_variants WHERE id = ? AND product_id = ? AND account_id = ?',
        ).bind(variantId, product.id, shop.account_id).first<{ title: string; price_cents: number }>();
        if (!v) continue;
        unit = v.price_cents;
        name = `${product.name} — ${v.title}`;
      }
      lines.push({ name, qty, priceCents: unit });
    }
    if (!lines.length) return fail('Nothing in the basket is for sale.');

    const sf = await env.DB.prepare('SELECT currency FROM crm_storefront WHERE account_id = ?')
      .bind(shop.account_id).first<{ currency: string }>();

    const totals = await priceFor(env, shop.account_id, lines, d);
    return json({ success: true, totals, currency: (sf?.currency || 'USD').toUpperCase() });
  }

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

    /*
     * Every line in the basket, priced from the rows.
     *
     * This used to take one product id and charge for that alone, while the
     * page showed a total for the whole basket — survivable when the total was
     * just a sum the buyer could check, and not survivable next to a discount
     * code, because the page would show 20% off three items and the card would
     * be debited for one.
     *
     * `items` is the basket. The older single-product shape is still accepted
     * so a cached page mid-session does not start failing.
     */
    const raw = Array.isArray(d.items) && d.items.length
      ? d.items
      : [{ productId: String(d.productId ?? ''), variantId: String(d.variantId ?? ''), qty: Number(d.qty) || 1 }];

    if (raw.length > 20) return fail('That is too many different items for one order.');

    /* One currency for the workspace, and it is the storefront's — the same one
       `get` puts on the page and the one createPayLink will actually charge in.
       Taking the product's instead meant a catalogue stamped USD quietly
       overriding a shop that had since moved to GBP: the page said one thing
       and the card was debited in the other. */
    const sf = await env.DB.prepare('SELECT currency FROM crm_storefront WHERE account_id = ?')
      .bind(shop.account_id).first<{ currency: string }>();

    const items: Array<{ productId: string; variantId: string; name: string; qty: number; priceCents: number }> = [];
    let fallbackCurrency = '';

    for (const entry of raw) {
      const qty = Math.min(Math.max(Math.round(Number(entry.qty) || 1), 1), 50);

      /* The price comes from the row, never from the request. */
      const product = await env.DB.prepare(
        `SELECT id, name, price_cents, currency, inventory, track_inventory
         FROM crm_products WHERE id = ? AND account_id = ? AND status = 'active'`,
      ).bind(String(entry.productId ?? ''), shop.account_id)
        .first<{ id: string; name: string; price_cents: number; currency: string; inventory: number; track_inventory: number }>();
      if (!product) return fail('One of those items is not for sale.');
      fallbackCurrency = fallbackCurrency || product.currency;

      /*
       * A variant, when one was chosen — and its price, not the product's.
       *
       * Looked up rather than trusted, exactly like the price: the whole point
       * of reading from the row is defeated if *which row* comes from the
       * request unchecked. It must belong to this product and this account, or
       * it is not a variant of anything the buyer is looking at.
       */
      const variantId = String(entry.variantId ?? '').trim();
      let variant: { id: string; title: string; price_cents: number; inventory: number } | null = null;
      if (variantId) {
        variant = await env.DB.prepare(
          `SELECT id, title, price_cents, inventory FROM crm_product_variants
           WHERE id = ? AND product_id = ? AND account_id = ?`,
        ).bind(variantId, product.id, shop.account_id)
          .first<{ id: string; title: string; price_cents: number; inventory: number }>();
        if (!variant) return fail('That option is not available.');
        if (variant.price_cents <= 0) return fail('That option has no price set, so it cannot be bought yet.');
      }

      const unitCents = variant ? variant.price_cents : product.price_cents;
      if (unitCents <= 0) return fail(`${product.name} has no price set, so it cannot be bought yet.`);

      /* Checked at the buy, not only hidden in the listing: two people can have
         the last one on screen at the same moment, and the second should be
         told rather than charged for something that has gone. Only when the
         shopkeeper asked for stock to be tracked — most of what this app's
         customers sell is a service with none, and "out of stock" on a boiler
         service because nobody typed a number is worse than never mentioning
         stock. */
      if (product.track_inventory) {
        const left = variant ? variant.inventory : product.inventory;
        const label = variant ? `${product.name} — ${variant.title}` : product.name;
        if (left <= 0) return fail(`${label} is out of stock.`);
        if (qty > left) return fail(`Only ${left} left of ${label} — reduce the quantity.`);
      }

      items.push({
        productId: product.id,
        variantId: variant?.id ?? '',
        name: variant ? `${product.name} — ${variant.title}` : product.name,
        qty,
        priceCents: unitCents,
      });
    }

    const currency = (sf?.currency || fallbackCurrency || 'USD').toUpperCase();

    const totals = await priceFor(env, shop.account_id, items, d);
    /* A code that does not apply stops the order rather than quietly charging
       the full price. Somebody who typed one and was billed without it would
       find out on the receipt, which is the worst moment. */
    if (totals.discountProblem) return fail(totals.discountProblem, 200, { code: 'discount' });
    const total = totals.totalCents;

    const now = nowIso();
    const orderId = rid('ord');
    await env.DB.prepare(
      `INSERT INTO crm_orders
       (id, account_id, contact_id, email, items, total_cents, currency, status, channel,
        shop_id, discount_code, discount_cents, shipping_cents, tax_cents, tax_label,
        placed_at, updated_at)
       VALUES (?,?,?,?,?,?,?, 'pending', 'shop', ?,?,?,?,?,?,?,?)`,
    ).bind(
      orderId, shop.account_id, `ip:${ip}`, email, JSON.stringify(items), total,
      currency, shop.id,
      /* Frozen onto the order. A code edited next week must not change what
         this receipt says it charged — the same rule as the price. The tax is
         frozen for a harder reason: a rate changed next April must not restate
         what was filed for last year. */
      totals.discountCode, totals.discountCents, totals.shippingCents,
      totals.taxCents, totals.taxLabel,
      now, now,
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
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(accountId)) return fail('A valid workspace is required.');
  if (!(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours.', 403);

  const list = async () => {
    const { results } = await env.DB.prepare(
      `SELECT s.id, s.project_id AS projectId, s.slug, s.name, s.headline, s.about,
              s.accent, s.status, s.created_at AS createdAt,
              s.template, s.hero_image AS heroImage, s.shipping_note AS shippingNote,
              s.returns_note AS returnsNote, s.contact_email AS contactEmail,
              s.template, s.hero_image AS heroImage, s.shipping_note AS shippingNote,
              s.returns_note AS returnsNote, s.contact_email AS contactEmail,
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

    const slug = cleanSlug(d.slug) || cleanSlug(name);
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
      `INSERT INTO crm_shops (id, account_id, project_id, slug, name, headline, about, accent, status,
        created_at, updated_at, template, hero_image, shipping_note, returns_note, contact_email)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         project_id=excluded.project_id, slug=excluded.slug, name=excluded.name,
         headline=excluded.headline, about=excluded.about, accent=excluded.accent,
         status=excluded.status, updated_at=excluded.updated_at,
         template=excluded.template, hero_image=excluded.hero_image,
         shipping_note=excluded.shipping_note, returns_note=excluded.returns_note,
         contact_email=excluded.contact_email`,
    ).bind(
      id, accountId, String(d.projectId ?? '').slice(0, 80), slug, name.slice(0, 120),
      String(d.headline ?? '').slice(0, 200), String(d.about ?? '').slice(0, 2000),
      String(d.accent ?? '#17191c').slice(0, 16), status,
      existing?.created_at ?? now, now,
      TEMPLATES.has(String(d.template)) ? String(d.template) : 'classic',
      String(d.heroImage ?? '').slice(0, 800_000),
      String(d.shippingNote ?? '').slice(0, 1000),
      String(d.returnsNote ?? '').slice(0, 1000),
      addr(d.contactEmail) ?? '',
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
