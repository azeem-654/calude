/**
 * Something to sell: ideas, products, and orders.
 *
 * The first half of the commerce track. Ideas are generated from what the
 * customer tells us about themselves and kept so they can be come back to;
 * products and orders are the model a storefront will need, with a manual path
 * that works today because most small businesses take their first orders over
 * the phone anyway.
 *
 * No route *here* takes money — routes/storefront.ts does, on the customer's
 * own Stripe account. This endpoint only reports whether that is connected, so
 * a screen never offers a payment link it cannot produce. An order a customer
 * thinks was paid and was not is worse than having no storefront at all.
 */
import { body, fail, json } from '../lib/http';
import { canAccess, foreignId, nowIso, userFromToken, type Env } from '../lib/db';
import { gate as contentGate } from '../lib/contentGate';
import { askGemini, loadAiKey, aiBudget } from '../lib/ai';
import { storefrontCurrency, storefrontLabel, storefrontReady } from './storefront';
import { supplierReady } from './supplier';
import { cleanSlug } from './shop';

interface Req {
  token?: string;
  action?: string;
  accountId?: string;
  id?: string;
  status?: string;
  /* Idea generation */
  about?: string;
  budget?: number;
  /* Products */
  name?: string;
  description?: string;
  sku?: string;
  priceCents?: number;
  costCents?: number;
  source?: string;
  supplierRef?: string;
  imageUrl?: string;
  compareAtCents?: number;
  inventory?: number;
  trackInventory?: boolean;
  category?: string;
  sortOrder?: number;
  projectId?: string;
  /* Variants, options and extra pictures */
  options?: unknown;
  images?: unknown;
  variants?: unknown;
  /* Discounts */
  code?: string;
  kind?: string;
  value?: number;
  minSpendCents?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  usageLimit?: number;
  /* Shipping */
  countries?: string;
  amountCents?: number;
  thresholdCents?: number;
  /* Tax */
  percentBp?: number;
  pricesIncludeTax?: boolean;
  /* Collections */
  slug?: string;
  collectionIds?: string[];
  productIds?: string[];
  /* Orders */
  contactId?: string;
  email?: string;
  items?: { productId?: string; name?: string; qty?: number; priceCents?: number }[];
}

const rid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const clampInt = (v: unknown, lo: number, hi: number) =>
  Math.min(Math.max(Math.round(Number(v) || 0), lo), hi);

/**
 * The prompt.
 *
 * Asks for the audience and the problem separately, because "a candle shop" is
 * not a business idea and a model left to itself will produce a list of them.
 * The startup and monthly figures are asked for as rough and stored as
 * estimates; they are labelled as such wherever they appear, since a number a
 * language model invented and a screen presents like a forecast is how somebody
 * commits money they do not have.
 */
function ideaPrompt(about: string, budget: number): string {
  return `You are advising somebody who wants to start a small business and does not yet know what to sell.

=== WHAT THEY TOLD US ABOUT THEMSELVES ===
${about || '(they said very little — suggest broadly, and prefer ideas that need few specialist skills)'}

Budget they can put in up front: ${budget > 0 ? `${budget}` : 'unstated — assume it is small'}

Suggest 5 businesses they could realistically start. Rules:
- Each must name a specific audience and a specific problem. "A candle shop" is not an idea; "candles for people who react badly to synthetic fragrance" is.
- Prefer things that can be started alone, from home, without stock they must buy up front, unless their budget clearly allows otherwise.
- Be honest about what it costs to start. Do not flatter.
- No cryptocurrency, no dropshipping-get-rich schemes, nothing requiring a licence they are unlikely to hold.

Return ONLY valid JSON, no markdown fences:
{
  "ideas": [
    {
      "title": "short name",
      "summary": "two sentences on what the business actually does",
      "audience": "who exactly buys this",
      "problem": "the specific problem it solves for them",
      "estStartup": <rough cost to start, a number>,
      "estMonthly": <rough monthly revenue after a few months, a number>,
      "because": "why this suits what they told us — one sentence, referring to something they actually said"
    }
  ]
}`;
}

export async function handleCommerce(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });

  const accountId = String(d.accountId ?? '').trim();
  if (!/^[A-Za-z0-9_.\-]{1,64}$/.test(accountId)) return fail('A valid workspace is required.');
  if (!(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours.', 403);

  const act = d.action ?? 'get';

  const listIdeas = async () => {
    const { results } = await env.DB.prepare(
      `SELECT id, title, summary, audience, problem, est_startup AS estStartup,
              est_monthly AS estMonthly, currency, status, because, created_at AS createdAt
       FROM crm_business_ideas WHERE account_id = ? AND status != 'dismissed'
       ORDER BY created_at DESC LIMIT 50`,
    ).bind(accountId).all();
    return results ?? [];
  };
  const listProducts = async () => {
    const { results } = await env.DB.prepare(
      `SELECT id, name, description, sku, price_cents AS priceCents, cost_cents AS costCents,
              compare_at_cents AS compareAtCents, currency, source, supplier_ref AS supplierRef,
              image_url AS imageUrl, images, options, inventory, track_inventory AS trackInventory,
              category, sort_order AS sortOrder, project_id AS projectId,
              status, created_at AS createdAt
       FROM crm_products WHERE account_id = ?
       /* The shopkeeper's own order first — a shop shows what they chose to put
          at the front, not what they happened to type most recently. */
       ORDER BY sort_order ASC, created_at DESC LIMIT 200`,
    ).bind(accountId).all<Record<string, unknown>>();
    const products = results ?? [];

    /*
     * Variants in one query for the whole catalogue, then grouped.
     *
     * A query per product is two hundred round trips to draw one screen. D1
     * charges for each and the page waits for all of them.
     */
    const { results: vars } = await env.DB.prepare(
      `SELECT id, product_id AS productId, title, sku, price_cents AS priceCents,
              compare_at_cents AS compareAtCents, inventory, image_url AS imageUrl, position
       FROM crm_product_variants WHERE account_id = ? ORDER BY position ASC LIMIT 2000`,
    ).bind(accountId).all<{ productId: string }>();

    const byProduct = new Map<string, unknown[]>();
    for (const v of vars ?? []) {
      const list = byProduct.get(v.productId) ?? [];
      list.push(v);
      byProduct.set(v.productId, list);
    }
    return products.map(p => ({ ...p, variants: byProduct.get(String(p.id)) ?? [] }));
  };

  const listDiscounts = async () => {
    const { results } = await env.DB.prepare(
      `SELECT id, code, kind, value, min_spend_cents AS minSpendCents,
              starts_at AS startsAt, ends_at AS endsAt,
              usage_limit AS usageLimit, used_count AS usedCount, status
       FROM crm_discounts WHERE account_id = ? ORDER BY created_at DESC LIMIT 200`,
    ).bind(accountId).all();
    return results ?? [];
  };

  const listShipping = async () => {
    const { results } = await env.DB.prepare(
      `SELECT id, name, countries, kind, amount_cents AS amountCents,
              threshold_cents AS thresholdCents, position, status
       FROM crm_shipping_rates WHERE account_id = ? ORDER BY position ASC, created_at ASC LIMIT 100`,
    ).bind(accountId).all();
    return results ?? [];
  };
  const listTax = async () => {
    const { results } = await env.DB.prepare(
      `SELECT id, name, countries, percent_bp AS percentBp, position, status
       FROM crm_tax_rates WHERE account_id = ? ORDER BY position ASC, created_at ASC LIMIT 100`,
    ).bind(accountId).all();
    return results ?? [];
  };

  /* Whether the listed prices already contain the tax. Defaults to true for a
     shop that has never opened the panel, matching the column default and the
     norm where most of this install's customers are — and the mistake it can
     cause (a total that does not move) is one somebody sees. */
  const pricesIncludeTax = async () => {
    const row = await env.DB.prepare(
      'SELECT prices_include_tax AS inc FROM crm_storefront WHERE account_id = ?',
    ).bind(accountId).first<{ inc: number }>();
    return row ? row.inc !== 0 : true;
  };

  /**
   * Collections, each with the ids it holds in the order the shopkeeper put
   * them in.
   *
   * Two queries and a join in memory rather than one query with a GROUP_BY:
   * a shop with forty collections and four hundred products is small, and the
   * alternative is a comma-joined string that has to be split and trusted.
   */
  const listCollections = async () => {
    const { results } = await env.DB.prepare(
      `SELECT id, name, slug, description, position, status
       FROM crm_collections WHERE account_id = ? ORDER BY position ASC, created_at ASC LIMIT 200`,
    ).bind(accountId).all();
    const { results: links } = await env.DB.prepare(
      `SELECT collection_id AS collectionId, product_id AS productId
       FROM crm_collection_products WHERE account_id = ? ORDER BY position ASC`,
    ).bind(accountId).all<{ collectionId: string; productId: string }>();

    const held = new Map<string, string[]>();
    for (const l of links ?? []) {
      const list = held.get(l.collectionId) ?? [];
      list.push(l.productId);
      held.set(l.collectionId, list);
    }
    return (results ?? []).map(r => {
      const row = r as Record<string, unknown>;
      return { ...row, productIds: held.get(String(row.id)) ?? [] };
    });
  };

  const listOrders = async () => {
    const { results } = await env.DB.prepare(
      `SELECT id, contact_id AS contactId, email, items, total_cents AS totalCents,
              currency, status, channel, placed_at AS placedAt,
              ship_name AS shipName, ship_city AS shipCity, ship_country AS shipCountry,
              supplier_provider AS supplierProvider, supplier_ref AS supplierRef,
              supplier_status AS supplierStatus, supplier_error AS supplierError
       FROM crm_orders WHERE account_id = ? ORDER BY placed_at DESC LIMIT 200`,
    ).bind(accountId).all();
    /* Which products a supplier could actually make, loaded once rather than
       per order. Without it the screen offers "send to Printful" on a plumber's
       callout, and the only way to find out is to press it. */
    const { results: prods } = await env.DB.prepare(
      "SELECT id, source, supplier_ref FROM crm_products WHERE account_id = ? AND source != 'own' AND supplier_ref != ''",
    ).bind(accountId).all();
    const supplied = new Set((prods ?? []).map(p => String((p as Record<string, unknown>).id)));

    return (results ?? []).map(r => {
      const row = r as Record<string, unknown>;
      let items: { productId?: string }[] = [];
      try { items = JSON.parse(String(row.items ?? '[]')) as typeof items; } catch { items = []; }
      return {
        ...row,
        items,
        supplierLines: items.filter(i => supplied.has(String(i.productId ?? ''))).length,
      };
    });
  };

  if (act === 'get') {
    const ready = await storefrontReady(env, accountId);
    /* Named rather than assumed: the note used to say "Stripe" to a workspace
       being paid through Creem. */
    const label = await storefrontLabel(env, accountId);
    return json({
      success: true,
      /* So a screen can offer "send to the supplier" only where it would work. */
      supplierConnected: await supplierReady(env, accountId),
      ideas: await listIdeas(),
      products: await listProducts(),
      orders: await listOrders(),
      discounts: await listDiscounts(),
      shipping: await listShipping(),
      tax: await listTax(),
      pricesIncludeTax: await pricesIncludeTax(),
      collections: await listCollections(),
      /* Said in the payload, not only in a comment. A screen that cannot take
         money can say why instead of showing an empty orders list that looks
         like nobody has bought anything. */
      storefront: ready
        ? {
            available: true,
            note: `${label} is connected. Record an order and send the buyer its payment link — it is marked paid here as soon as ${label} says so.`,
          }
        : {
            available: false,
            note: 'Connect your own Stripe or Creem account under “Getting paid” above to send buyers a payment link. Orders taken by phone or in person can be recorded here either way, and they count towards everything else the app does.',
          },
    });
  }

  /* ── Ideas ── */
  if (act === 'suggest_ideas') {
    const overBudget = await aiBudget(env, accountId);
    if (overBudget) return fail(overBudget, 429, { code: 'rate_limited' });
    const apiKey = await loadAiKey(env, accountId);
    if (!apiKey) {
      return fail('Writing is unavailable on this installation at the moment, so the ideas cannot be written. This is not something you need a key for.');
    }
    const about = String(d.about ?? '').trim().slice(0, 4000);
    const budget = clampInt(d.budget, 0, 10_000_000);

    const ai = await askGemini(apiKey, ideaPrompt(about, budget), 0.9);
    if (!ai.ok) return fail(ai.error);

    let ideas: Record<string, unknown>[] = [];
    try {
      const parsed = JSON.parse(ai.text) as { ideas?: Record<string, unknown>[] };
      ideas = Array.isArray(parsed.ideas) ? parsed.ideas.slice(0, 8) : [];
    } catch {
      return fail('The model\'s answer could not be read. Try again.');
    }
    if (!ideas.length) return fail('The model returned no ideas. Try saying a little more about yourself.');

    const now = nowIso();
    for (const i of ideas) {
      await env.DB.prepare(
        `INSERT INTO crm_business_ideas
         (id, account_id, title, summary, audience, problem, est_startup, est_monthly,
          currency, status, because, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,'USD','suggested',?,?,?)`,
      ).bind(
        rid('idea'), accountId,
        String(i.title ?? 'Untitled').slice(0, 160),
        String(i.summary ?? '').slice(0, 1200),
        String(i.audience ?? '').slice(0, 400),
        String(i.problem ?? '').slice(0, 600),
        Number(i.estStartup) || 0, Number(i.estMonthly) || 0,
        String(i.because ?? '').slice(0, 600),
        now, now,
      ).run();
    }
    return json({ success: true, ideas: await listIdeas() });
  }

  if (act === 'set_idea_status') {
    const id = String(d.id ?? '').trim();
    const status = String(d.status ?? '');
    if (!['suggested', 'shortlisted', 'chosen', 'dismissed'].includes(status)) {
      return fail(`"${status}" is not something an idea can be.`);
    }
    const res = await env.DB.prepare(
      'UPDATE crm_business_ideas SET status = ?, updated_at = ? WHERE id = ? AND account_id = ?',
    ).bind(status, nowIso(), id, accountId).run();
    if (!res.meta.changes) return fail('That idea is not in this workspace.');
    return json({ success: true, ideas: await listIdeas() });
  }

  /* ── Products ── */
  if (act === 'save_product') {
    const id = String(d.id ?? '').trim() || rid('prod');
    if (d.id && await foreignId(env, 'crm_products', id, accountId)) return fail('That product is not in this workspace.', 403);
    const name = String(d.name ?? '').trim();
    if (!name) return fail('A product needs a name.');
    /* Prices in minor units, clamped. A float price eventually shows
       19.989999999999998 on somebody's invoice. */
    const price = clampInt(d.priceCents, 0, 100_000_000);
    const cost = clampInt(d.costCents, 0, 100_000_000);
    const now = nowIso();
    const existing = await env.DB.prepare('SELECT created_at FROM crm_products WHERE id = ? AND account_id = ?')
      .bind(id, accountId).first<{ created_at: string }>();

    /* Refused rather than shown struck through. A "was £120" that was never
       charged is the oldest trick in retail and unlawful in a good many
       places, so the shop will not display one it cannot stand behind. */
    const compareAt = clampInt(d.compareAtCents, 0, 100_000_000);

    /*
     * A product is a public listing, so it is screened as one.
     *
     * Held means it saves as a draft rather than being refused. A draft does
     * not appear on `/shop/<slug>`, which is the only place it could reach
     * anybody — so the customer keeps their work, the shop stays clean, and the
     * one thing they cannot do is publish it past a review.
     */
    const wanted = ['draft', 'active', 'archived'].includes(String(d.status)) ? String(d.status) : 'draft';
    let status = wanted;
    let held = '';
    if (wanted === 'active') {
      const verdict = await contentGate(env, accountId, 'product', `${name}\n\n${String(d.description ?? '')}`);
      if (!verdict.ok) { status = 'draft'; held = verdict.message; }
    }

    await env.DB.prepare(
      `INSERT INTO crm_products
       (id, account_id, name, description, sku, price_cents, cost_cents, currency,
        source, supplier_ref, status, created_at, updated_at,
        image_url, images, compare_at_cents, inventory, track_inventory, category, sort_order, project_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, description=excluded.description, sku=excluded.sku,
         price_cents=excluded.price_cents, cost_cents=excluded.cost_cents,
         source=excluded.source, supplier_ref=excluded.supplier_ref,
         status=excluded.status, updated_at=excluded.updated_at,
         image_url=excluded.image_url, images=excluded.images,
         compare_at_cents=excluded.compare_at_cents,
         inventory=excluded.inventory, track_inventory=excluded.track_inventory,
         category=excluded.category, sort_order=excluded.sort_order,
         project_id=excluded.project_id
       WHERE crm_products.account_id = excluded.account_id`,
    ).bind(
      id, accountId, name.slice(0, 200), String(d.description ?? '').slice(0, 4000),
      String(d.sku ?? '').slice(0, 80), price, cost,
      /* The currency the storefront is set to charge in. Hardcoding USD here
         priced a British plumber's boiler service in dollars and then charged
         it in dollars too. */
      await storefrontCurrency(env, accountId),
      String(d.source ?? 'own').slice(0, 40), String(d.supplierRef ?? '').slice(0, 200),
      status,
      existing?.created_at ?? now, now,
      /* Capped rather than rejected: a data: URI for a photo is legitimate and
         large, and a row that will not fit is better trimmed than refused with
         a message about bytes. */
      String(d.imageUrl ?? '').slice(0, 800_000),
      /* The rest of the pictures. Capped hard: these are often data: URIs and
         a row that will not fit is worse than a gallery that is four long. */
      JSON.stringify(Array.isArray(d.images) ? (d.images as unknown[]).slice(0, 5).map(String) : [])
        .slice(0, 2_000_000),
      compareAt > price ? compareAt : 0,
      clampInt(d.inventory, 0, 10_000_000),
      d.trackInventory ? 1 : 0,
      String(d.category ?? '').slice(0, 80),
      clampInt(d.sortOrder, 0, 100_000),
      String(d.projectId ?? '').slice(0, 80),
    ).run();
    /* Told, not silently demoted. A product that says "active" on the form and
       is a draft in the database is the exact shape of lie this codebase is
       written to avoid. */
    return json({ success: true, id, products: await listProducts(), held: !!held, heldMessage: held });
  }

  /* ── Variants, discounts and shipping ───────────────────────────────────
   *
   * All three are what every shop platform treats as the floor rather than the
   * advanced tier, and none of them existed here. They are grouped because
   * they share one rule: the shop page and the checkout read them, so a change
   * made on these screens is a change a buyer sees, not a note in an admin.
   */

  if (act === 'save_variants') {
    const productId = String(d.id ?? '').trim();
    if (!productId) return fail('Which product?');
    const owns = await env.DB.prepare('SELECT 1 AS n FROM crm_products WHERE id = ? AND account_id = ?')
      .bind(productId, accountId).first();
    if (!owns) return fail('That product is not yours.', 403);

    const rows = (Array.isArray(d.variants) ? d.variants : []).slice(0, 100) as Array<Record<string, unknown>>;
    const now = nowIso();

    /*
     * Replaced wholesale rather than merged.
     *
     * The form edits the whole set at once — adding a colour re-titles every
     * variant — so a merge would need to guess which old row each new one
     * corresponds to, and guess wrong on a rename. Deleting and reinserting is
     * both simpler and correct; the cost is that variant ids are not stable
     * across an edit, which nothing depends on.
     */
    await env.DB.prepare('DELETE FROM crm_product_variants WHERE product_id = ? AND account_id = ?')
      .bind(productId, accountId).run();

    let position = 0;
    for (const raw of rows) {
      const title = String(raw.title ?? '').trim().slice(0, 120);
      if (!title) continue;
      await env.DB.prepare(
        `INSERT INTO crm_product_variants
         (id, product_id, account_id, title, sku, price_cents, compare_at_cents,
          inventory, image_url, position, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        rid('var'), productId, accountId, title,
        String(raw.sku ?? '').slice(0, 80),
        clampInt(raw.priceCents, 0, 100_000_000),
        clampInt(raw.compareAtCents, 0, 100_000_000),
        clampInt(raw.inventory, 0, 10_000_000),
        String(raw.imageUrl ?? '').slice(0, 800_000),
        position++, now, now,
      ).run();
    }

    /* The option names live on the product, so a shop page can draw the
       pickers without reading every variant to work out what they are. */
    await env.DB.prepare('UPDATE crm_products SET options = ?, updated_at = ? WHERE id = ? AND account_id = ?')
      .bind(JSON.stringify(d.options ?? []).slice(0, 4000), now, productId, accountId).run();

    return json({ success: true, products: await listProducts() });
  }

  if (act === 'list_discounts') {
    return json({ success: true, discounts: await listDiscounts() });
  }

  if (act === 'save_discount') {
    const code = String(d.code ?? '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
    if (code.length < 3) return fail('A code needs at least three letters or numbers.');

    const kind = d.kind === 'fixed' ? 'fixed' : 'percent';
    const value = kind === 'percent'
      ? clampInt(d.value, 1, 100)
      : clampInt(d.value, 1, 100_000_000);

    const now = nowIso();
    const id = String(d.id ?? '').trim() || rid('disc');
    if (d.id && await foreignId(env, 'crm_discounts', id, accountId)) return fail('That discount is not in this workspace.', 403);
    const existing = await env.DB.prepare('SELECT created_at, used_count FROM crm_discounts WHERE id = ? AND account_id = ?')
      .bind(id, accountId).first<{ created_at: string; used_count: number }>();

    /* Two workspaces both wanting SAVE10 is the normal case, so the uniqueness
       is per account — but one workspace with two SAVE10s is a checkout that
       has to pick, so that is refused with the reason. */
    const clash = await env.DB.prepare('SELECT id FROM crm_discounts WHERE account_id = ? AND code = ? AND id != ?')
      .bind(accountId, code, id).first();
    if (clash) return fail(`You already have a code called ${code}.`);

    await env.DB.prepare(
      `INSERT INTO crm_discounts
       (id, account_id, code, kind, value, min_spend_cents, starts_at, ends_at,
        usage_limit, used_count, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         code=excluded.code, kind=excluded.kind, value=excluded.value,
         min_spend_cents=excluded.min_spend_cents, starts_at=excluded.starts_at,
         ends_at=excluded.ends_at, usage_limit=excluded.usage_limit,
         status=excluded.status, updated_at=excluded.updated_at
       WHERE crm_discounts.account_id = excluded.account_id`,
    ).bind(
      id, accountId, code, kind, value,
      clampInt(d.minSpendCents, 0, 100_000_000),
      d.startsAt ? String(d.startsAt).slice(0, 40) : null,
      d.endsAt ? String(d.endsAt).slice(0, 40) : null,
      clampInt(d.usageLimit, 0, 1_000_000),
      /* Never reset by an edit. Changing the expiry on a code that has been
         used fifty times must not hand out fifty more. */
      existing?.used_count ?? 0,
      d.status === 'off' ? 'off' : 'active',
      existing?.created_at ?? now, now,
    ).run();

    return json({ success: true, id, discounts: await listDiscounts() });
  }

  if (act === 'delete_discount') {
    await env.DB.prepare('DELETE FROM crm_discounts WHERE id = ? AND account_id = ?')
      .bind(String(d.id ?? ''), accountId).run();
    return json({ success: true, discounts: await listDiscounts() });
  }

  if (act === 'list_shipping') {
    return json({ success: true, shipping: await listShipping() });
  }

  if (act === 'save_shipping') {
    const name = String(d.name ?? '').trim().slice(0, 80);
    if (!name) return fail('Give the rate a name — the buyer sees it at the checkout.');
    const now = nowIso();
    const id = String(d.id ?? '').trim() || rid('ship');
    if (d.id && await foreignId(env, 'crm_shipping_rates', id, accountId)) return fail('That shipping rate is not in this workspace.', 403);
    const existing = await env.DB.prepare('SELECT created_at FROM crm_shipping_rates WHERE id = ? AND account_id = ?')
      .bind(id, accountId).first<{ created_at: string }>();

    /* Uppercased two-letter codes only. A country list somebody typed as
       "UK, Ireland" would silently match nothing at the checkout. */
    const countries = String(d.countries ?? '')
      .toUpperCase().split(/[^A-Z]+/).filter(c => c.length === 2).slice(0, 60).join(',');

    await env.DB.prepare(
      `INSERT INTO crm_shipping_rates
       (id, account_id, name, countries, kind, amount_cents, threshold_cents,
        position, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, countries=excluded.countries, kind=excluded.kind,
         amount_cents=excluded.amount_cents, threshold_cents=excluded.threshold_cents,
         position=excluded.position, status=excluded.status, updated_at=excluded.updated_at
       WHERE crm_shipping_rates.account_id = excluded.account_id`,
    ).bind(
      id, accountId, name, countries,
      d.kind === 'free_over' ? 'free_over' : 'flat',
      clampInt(d.amountCents, 0, 100_000_000),
      clampInt(d.thresholdCents, 0, 100_000_000),
      clampInt(d.sortOrder, 0, 1000),
      d.status === 'off' ? 'off' : 'active',
      existing?.created_at ?? now, now,
    ).run();

    return json({ success: true, id, shipping: await listShipping() });
  }

  if (act === 'delete_shipping') {
    await env.DB.prepare('DELETE FROM crm_shipping_rates WHERE id = ? AND account_id = ?')
      .bind(String(d.id ?? ''), accountId).run();
    return json({ success: true, shipping: await listShipping() });
  }

  /* ── Tax ──────────────────────────────────────────────────────────────────
     A rate per country, not a tax engine. See the note on migration 0035: no
     US nexus, no EU OSS thresholds, no digital place-of-supply. The screen
     says as much, because under-collecting quietly for a year is a bill with
     interest on it and nothing on screen would have prompted a second look. */

  if (act === 'list_tax') {
    return json({ success: true, tax: await listTax(), pricesIncludeTax: await pricesIncludeTax() });
  }

  if (act === 'save_tax') {
    const name = String(d.name ?? '').trim().slice(0, 40);
    if (!name) return fail('Give the tax a name — it is what the buyer sees on the receipt. “VAT”, “Sales tax”, “GST”.');
    const now = nowIso();
    const id = String(d.id ?? '').trim() || rid('tax');
    if (d.id && await foreignId(env, 'crm_tax_rates', id, accountId)) return fail('That tax rate is not in this workspace.', 403);
    const existing = await env.DB.prepare('SELECT created_at FROM crm_tax_rates WHERE id = ? AND account_id = ?')
      .bind(id, accountId).first<{ created_at: string }>();

    /* Same parsing as the shipping rates, deliberately — "UK, Ireland" matches
       nothing at a checkout and does so silently. */
    const countries = String(d.countries ?? '')
      .toUpperCase().split(/[^A-Z]+/).filter(c => c.length === 2).slice(0, 60).join(',');

    /* Taken as basis points from the client, which sends whatever the person
       typed as a percentage multiplied by 100. Capped at 100% — a rate above
       that is a typo, and charging it would be a card debited several times
       the price of the goods. */
    const percentBp = clampInt(d.percentBp, 0, 10_000);

    await env.DB.prepare(
      `INSERT INTO crm_tax_rates
       (id, account_id, name, countries, percent_bp, position, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, countries=excluded.countries, percent_bp=excluded.percent_bp,
         position=excluded.position, status=excluded.status, updated_at=excluded.updated_at
       WHERE crm_tax_rates.account_id = excluded.account_id`,
    ).bind(
      id, accountId, name, countries, percentBp,
      clampInt(d.sortOrder, 0, 1000),
      d.status === 'off' ? 'off' : 'active',
      existing?.created_at ?? now, now,
    ).run();

    return json({ success: true, id, tax: await listTax() });
  }

  if (act === 'delete_tax') {
    await env.DB.prepare('DELETE FROM crm_tax_rates WHERE id = ? AND account_id = ?')
      .bind(String(d.id ?? ''), accountId).run();
    return json({ success: true, tax: await listTax() });
  }

  /* ── Collections ──────────────────────────────────────────────────────────
     A category files a product; a collection sells it. See migration 0037 for
     why both exist rather than one replacing the other. */

  if (act === 'list_collections') {
    return json({ success: true, collections: await listCollections() });
  }

  if (act === 'save_collection') {
    const name = String(d.name ?? '').trim().slice(0, 80);
    if (!name) return fail('Give the collection a name — buyers see it as a heading on your shop.');

    const now = nowIso();
    const id = String(d.id ?? '').trim() || rid('col');
    if (d.id && await foreignId(env, 'crm_collections', id, accountId)) return fail('That collection is not in this workspace.', 403);
    const existing = await env.DB.prepare('SELECT created_at FROM crm_collections WHERE id = ? AND account_id = ?')
      .bind(id, accountId).first<{ created_at: string }>();

    /* Derived from the name when none is given, because a shopkeeper should
       not have to know what a slug is to make a collection. */
    let slug = cleanSlug(d.slug) || cleanSlug(name);
    if (!slug) return fail('That name cannot be turned into a web address — use some letters or numbers.');
    /* Suffixed rather than refused: two collections called "Gifts" in
       different years is an ordinary thing to want, and a unique index would
       otherwise turn it into an error the shopkeeper cannot act on. */
    const clash = await env.DB.prepare(
      'SELECT id FROM crm_collections WHERE account_id = ? AND slug = ? AND id != ?',
    ).bind(accountId, slug, id).first<{ id: string }>();
    if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

    await env.DB.prepare(
      `INSERT INTO crm_collections
       (id, account_id, name, slug, description, position, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, slug=excluded.slug, description=excluded.description,
         position=excluded.position, status=excluded.status, updated_at=excluded.updated_at
       WHERE crm_collections.account_id = excluded.account_id`,
    ).bind(
      id, accountId, name, slug, String(d.description ?? '').slice(0, 500),
      clampInt(d.sortOrder, 0, 1000),
      d.status === 'off' ? 'off' : 'active',
      existing?.created_at ?? now, now,
    ).run();

    /* Membership is replaced wholesale when it is sent, and left alone when it
       is not. The screen edits the whole list at once — dragging one product
       above another changes every position after it — so merging would mean
       guessing which of the old rows each new one meant.
       Absent is different from empty: `undefined` means "I was not editing
       that", and `[]` means "take everything out". Treating them the same
       would empty a collection every time somebody renamed it. */
    if (Array.isArray(d.productIds)) {
      await env.DB.prepare('DELETE FROM crm_collection_products WHERE collection_id = ? AND account_id = ?')
        .bind(id, accountId).run();

      /* Scoped to this workspace, so an id from somebody else's shop cannot be
         posted in and quietly given a home here. */
      const wanted = d.productIds.map(x => String(x)).filter(Boolean).slice(0, 500);
      for (const [n, productId] of wanted.entries()) {
        const mine = await env.DB.prepare('SELECT id FROM crm_products WHERE id = ? AND account_id = ?')
          .bind(productId, accountId).first<{ id: string }>();
        if (!mine) continue;
        await env.DB.prepare(
          `INSERT INTO crm_collection_products (collection_id, product_id, account_id, position)
           VALUES (?,?,?,?)
           ON CONFLICT(collection_id, product_id) DO UPDATE SET position = excluded.position`,
        ).bind(id, productId, accountId, n).run();
      }
    }

    return json({ success: true, id, collections: await listCollections() });
  }

  if (act === 'delete_collection') {
    const id = String(d.id ?? '').trim();
    /* The memberships go, the products stay. Deleting a collection is a
       merchandising decision, not a decision to stop selling the things in
       it — and a shop that lost its stock to a tidy-up would be unforgivable. */
    await env.DB.prepare('DELETE FROM crm_collection_products WHERE collection_id = ? AND account_id = ?')
      .bind(id, accountId).run();
    await env.DB.prepare('DELETE FROM crm_collections WHERE id = ? AND account_id = ?')
      .bind(id, accountId).run();
    return json({ success: true, collections: await listCollections() });
  }

  if (act === 'save_tax_settings') {
    /* Upserts the storefront row. A shop can be setting its VAT position before
       it has connected a processor, and refusing to remember that until it has
       would be an order of operations nobody would guess. Every other column
       keeps its default, so this cannot disturb a connected processor. */
    const inc = d.pricesIncludeTax === false ? 0 : 1;
    await env.DB.prepare(
      `INSERT INTO crm_storefront (account_id, updated_at, prices_include_tax)
       VALUES (?,?,?)
       ON CONFLICT(account_id) DO UPDATE SET
         prices_include_tax=excluded.prices_include_tax, updated_at=excluded.updated_at`,
    ).bind(accountId, nowIso(), inc).run();
    return json({ success: true, pricesIncludeTax: inc === 1 });
  }

  if (act === 'delete_product') {
    const id = String(d.id ?? '').trim();
    /* Memberships first. A row pointing at a product that no longer exists
       would make every collection holding it one shorter than it counts, and
       the shop page would render a gap nobody could explain or remove. */
    await env.DB.prepare('DELETE FROM crm_collection_products WHERE product_id = ? AND account_id = ?')
      .bind(id, accountId).run();
    await env.DB.prepare('DELETE FROM crm_products WHERE id = ? AND account_id = ?').bind(id, accountId).run();
    return json({ success: true, products: await listProducts(), collections: await listCollections() });
  }

  /* ── Orders ── */
  if (act === 'record_order') {
    const items = (d.items ?? []).slice(0, 100).map(i => ({
      productId: String(i.productId ?? ''),
      name: String(i.name ?? '').slice(0, 200),
      qty: clampInt(i.qty, 1, 100_000),
      priceCents: clampInt(i.priceCents, 0, 100_000_000),
    }));
    if (!items.length) return fail('An order needs at least one line.');
    /* Totalled here, not taken from the client. A total that arrives with the
       request is a total anybody can send. */
    const total = items.reduce((n, i) => n + i.qty * i.priceCents, 0);
    const now = nowIso();
    const id = rid('ord');
    await env.DB.prepare(
      `INSERT INTO crm_orders
       (id, account_id, contact_id, email, items, total_cents, currency, status, channel, placed_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?, 'manual', ?, ?)`,
    ).bind(
      id, accountId, String(d.contactId ?? '').slice(0, 80), String(d.email ?? '').slice(0, 200),
      JSON.stringify(items), total,
      await storefrontCurrency(env, accountId),
      ['pending', 'paid', 'fulfilled', 'cancelled', 'refunded'].includes(String(d.status)) ? String(d.status) : 'pending',
      now, now,
    ).run();
    return json({ success: true, id, orders: await listOrders() });
  }

  if (act === 'set_order_status') {
    const id = String(d.id ?? '').trim();
    const status = String(d.status ?? '');
    if (!['pending', 'paid', 'fulfilled', 'cancelled', 'refunded'].includes(status)) {
      return fail(`"${status}" is not something an order can be.`);
    }
    const res = await env.DB.prepare('UPDATE crm_orders SET status = ?, updated_at = ? WHERE id = ? AND account_id = ?')
      .bind(status, nowIso(), id, accountId).run();
    if (!res.meta.changes) return fail('That order is not in this workspace.');
    return json({ success: true, orders: await listOrders() });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}
