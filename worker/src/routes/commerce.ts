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
import { canAccess, nowIso, userFromToken, type Env } from '../lib/db';
import { askGemini, loadAiKey } from '../lib/ai';
import { storefrontCurrency, storefrontLabel, storefrontReady } from './storefront';
import { supplierReady } from './supplier';

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
              image_url AS imageUrl, inventory, track_inventory AS trackInventory,
              category, sort_order AS sortOrder, project_id AS projectId,
              status, created_at AS createdAt
       FROM crm_products WHERE account_id = ?
       /* The shopkeeper's own order first — a shop shows what they chose to put
          at the front, not what they happened to type most recently. */
       ORDER BY sort_order ASC, created_at DESC LIMIT 200`,
    ).bind(accountId).all();
    return results ?? [];
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
    const apiKey = await loadAiKey(env, accountId);
    if (!apiKey) {
      return fail('Add your AI key in Settings → AI Engine first — the ideas are written by the model, not picked from a list.');
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

    await env.DB.prepare(
      `INSERT INTO crm_products
       (id, account_id, name, description, sku, price_cents, cost_cents, currency,
        source, supplier_ref, status, created_at, updated_at,
        image_url, compare_at_cents, inventory, track_inventory, category, sort_order, project_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, description=excluded.description, sku=excluded.sku,
         price_cents=excluded.price_cents, cost_cents=excluded.cost_cents,
         source=excluded.source, supplier_ref=excluded.supplier_ref,
         status=excluded.status, updated_at=excluded.updated_at,
         image_url=excluded.image_url, compare_at_cents=excluded.compare_at_cents,
         inventory=excluded.inventory, track_inventory=excluded.track_inventory,
         category=excluded.category, sort_order=excluded.sort_order,
         project_id=excluded.project_id`,
    ).bind(
      id, accountId, name.slice(0, 200), String(d.description ?? '').slice(0, 4000),
      String(d.sku ?? '').slice(0, 80), price, cost,
      /* The currency the storefront is set to charge in. Hardcoding USD here
         priced a British plumber's boiler service in dollars and then charged
         it in dollars too. */
      await storefrontCurrency(env, accountId),
      String(d.source ?? 'own').slice(0, 40), String(d.supplierRef ?? '').slice(0, 200),
      ['draft', 'active', 'archived'].includes(String(d.status)) ? String(d.status) : 'draft',
      existing?.created_at ?? now, now,
      /* Capped rather than rejected: a data: URI for a photo is legitimate and
         large, and a row that will not fit is better trimmed than refused with
         a message about bytes. */
      String(d.imageUrl ?? '').slice(0, 800_000),
      compareAt > price ? compareAt : 0,
      clampInt(d.inventory, 0, 10_000_000),
      d.trackInventory ? 1 : 0,
      String(d.category ?? '').slice(0, 80),
      clampInt(d.sortOrder, 0, 100_000),
      String(d.projectId ?? '').slice(0, 80),
    ).run();
    return json({ success: true, id, products: await listProducts() });
  }

  if (act === 'delete_product') {
    const id = String(d.id ?? '').trim();
    await env.DB.prepare('DELETE FROM crm_products WHERE id = ? AND account_id = ?').bind(id, accountId).run();
    return json({ success: true, products: await listProducts() });
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
