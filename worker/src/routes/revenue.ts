/**
 * /api/revenue.php — how much each project brought in, over time.
 *
 * Read-only, and read from the workspace's own rows only: paid orders, the
 * Autopilot chases that preceded some of them, and won deals in the project's
 * own pipeline. Which project an order belongs to is decided by `attribute`
 * in lib/revenue.ts — the same function the shop's checkout uses to stamp it,
 * so the report cannot disagree with what was recorded at the sale.
 *
 * Nothing here estimates. A workspace with no paid orders gets zeros and an
 * explanation, not a projection.
 */
import { body, fail, json } from '../lib/http';
import { canAccess, dataGet, userFromToken, type Env } from '../lib/db';
import {
  attribute, productIdsOf, summarise, windowFor,
  type Days, type DealWin, type Lookups, type OrderRow, type ProjectFigures, type Via,
} from '../lib/revenue';
import { storefrontCurrency } from './storefront';

interface Req {
  token?: string;
  action?: string;
  accountId?: string;
  days?: number;
  currency?: string;
  projectId?: string;
}

/* A ceiling on rows read for one report. A workspace past it is told the
   figures are partial rather than shown a total that quietly stopped. */
const MAX_ORDERS = 50_000;

/** The lookups attribution needs, for one workspace. Shared with the shop's checkout. */
export async function attributionLookups(env: Env, accountId: string): Promise<Lookups> {
  const [pj, shops, products] = await Promise.all([
    env.DB.prepare('SELECT id FROM crm_projects WHERE account_id = ?').bind(accountId).all<{ id: string }>(),
    env.DB.prepare('SELECT id, project_id FROM crm_shops WHERE account_id = ?').bind(accountId).all<{ id: string; project_id: string }>(),
    env.DB.prepare("SELECT id, project_id FROM crm_products WHERE account_id = ? AND project_id != ''")
      .bind(accountId).all<{ id: string; project_id: string }>(),
  ]);
  return {
    projects: new Set((pj.results ?? []).map(r => r.id)),
    shopProject: new Map((shops.results ?? []).map(r => [r.id, r.project_id])),
    productProject: new Map((products.results ?? []).map(r => [r.id, r.project_id])),
  };
}

/**
 * The project a shop order is credited to, decided at checkout and frozen.
 *
 * Narrow lookups rather than `attributionLookups`: this runs on an anonymous
 * buy, and reading a workspace's whole catalogue for each one is a cost a
 * stranger could make the shop pay at will. `requested` is the `?pj=` the page
 * carried — unauthenticated, so it is only a candidate, accepted if and only
 * if it names a project of this shop's own workspace; anything else is
 * dropped without a word, because telling a caller which ids exist elsewhere
 * would be the leak.
 */
export async function checkoutAttribution(
  env: Env, accountId: string, requested: string, shop: { id: string; project_id: string }, productIds: string[],
): Promise<{ projectId: string; via: Via }> {
  const pjWanted = /^[A-Za-z0-9_.\-]{1,80}$/.test(requested) ? requested : '';
  const products = productIds.length
    ? (await env.DB.prepare(
      `SELECT id, project_id FROM crm_products WHERE account_id = ? AND id IN (${productIds.map(() => '?').join(',')})`,
    ).bind(accountId, ...productIds).all<{ id: string; project_id: string }>()).results ?? []
    : [];
  const candidates = [...new Set([pjWanted, shop.project_id, ...products.map(p => p.project_id)].filter(Boolean))];
  const known = candidates.length
    ? (await env.DB.prepare(
      `SELECT id FROM crm_projects WHERE account_id = ? AND id IN (${candidates.map(() => '?').join(',')})`,
    ).bind(accountId, ...candidates).all<{ id: string }>()).results ?? []
    : [];
  const look: Lookups = {
    projects: new Set(known.map(k => k.id)),
    shopProject: new Map([[shop.id, shop.project_id]]),
    productProject: new Map(products.map(p => [p.id, p.project_id])),
  };
  /* A requested id that passed is a `link` stamp; `attribute` treats a stamp
     it can verify as the strongest evidence and falls through otherwise. */
  return attribute({ projectId: pjWanted, via: 'link', shopId: shop.id, productIds }, look);
}

interface DealShape { status?: string; closedAt?: string; value?: unknown }
interface PipelineShape { projectId?: string; stages?: Array<{ deals?: DealShape[] }> }

export async function handleRevenue(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });

  const accountId = String(d.accountId ?? '').trim();
  if (!/^[A-Za-z0-9_.\-]{1,64}$/.test(accountId)) return fail('A valid workspace is required.');
  if (!(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours.', 403);

  const act = d.action ?? 'summary';
  if (act !== 'summary') return fail(`"${act}" is not something this endpoint does.`);

  const days: Days = d.days === undefined ? 30 : (Number(d.days) as Days);
  if (![30, 90, 365].includes(days)) return fail('A report covers 30, 90 or 365 days.');

  const { results: projectRows } = await env.DB.prepare(
    'SELECT id, name, status FROM crm_projects WHERE account_id = ? ORDER BY created_at',
  ).bind(accountId).all<{ id: string; name: string; status: string }>();
  const projects = projectRows ?? [];

  /* Scoped to one project only after proving it is this workspace's. A
     foreign id is refused rather than answered with zeros — zeros would say
     "that project earned nothing", which is a claim about somebody else's. */
  const only = String(d.projectId ?? '').trim();
  if (only && !projects.some(p => p.id === only)) return fail('That project is not in this workspace.', 403);

  const { since, buckets } = windowFor(days);
  const look = await attributionLookups(env, accountId);

  const { results: orderRows } = await env.DB.prepare(
    `SELECT id, status, total_cents, currency, paid_at, chased_at, project_id, project_via, shop_id, items
       FROM crm_orders
      WHERE account_id = ? AND paid_at >= ? AND status IN ('paid', 'fulfilled', 'refunded')
      ORDER BY paid_at LIMIT ?`,
  ).bind(accountId, since, MAX_ORDERS + 1).all<{
    id: string; status: string; total_cents: number; currency: string; paid_at: string;
    chased_at: string | null; project_id: string; project_via: string; shop_id: string; items: string;
  }>();
  const rows = orderRows ?? [];
  const truncated = rows.length > MAX_ORDERS;

  const orders: OrderRow[] = rows.slice(0, MAX_ORDERS).map(o => {
    const a = attribute({
      projectId: o.project_id, via: o.project_via, shopId: o.shop_id, productIds: productIdsOf(o.items),
    }, look);
    return {
      id: o.id, status: o.status, totalCents: Number(o.total_cents) || 0,
      currency: (o.currency || 'USD').toUpperCase(), paidAt: o.paid_at, chasedAt: o.chased_at,
      projectId: a.projectId, via: a.via,
    };
  });

  /*
   * Which project's Autopilot chased which order.
   *
   * A chase can precede its payment by days, so actions are read from a month
   * before the window as well. The first action to name an order wins — an
   * order is chased once (`chased_at` stops a second), so a later action that
   * lists it again was skipped for it.
   */
  const chaseSince = new Date(Date.parse(since) - 30 * 86_400_000).toISOString();
  const { results: chaseRows } = await env.DB.prepare(
    `SELECT project_id, effect FROM crm_autopilot_actions
      WHERE account_id = ? AND created_at >= ? AND effect LIKE '%chase_payment%'
      ORDER BY created_at`,
  ).bind(accountId, chaseSince).all<{ project_id: string; effect: string }>();
  const recovered = new Map<string, string>();
  for (const a of chaseRows ?? []) {
    try {
      const e = JSON.parse(a.effect) as { type?: string; orderIds?: unknown };
      if (e.type !== 'chase_payment' || !Array.isArray(e.orderIds)) continue;
      for (const id of e.orderIds) {
        const k = String(id);
        if (!recovered.has(k)) recovered.set(k, look.projects.has(a.project_id) ? a.project_id : '');
      }
    } catch { /* an unreadable effect recovered nothing */ }
  }

  /* Won deals, from each project's own pipeline — matched on `projectId`, the
     marker lib/projectPipeline.ts writes, which survives a rename. */
  const wins: DealWin[] = [];
  let pipelines: PipelineShape[] = [];
  try { pipelines = JSON.parse((await dataGet(env.DB, accountId, 'crm_pipelines')) || '[]') as PipelineShape[]; } catch { pipelines = []; }
  for (const p of Array.isArray(pipelines) ? pipelines : []) {
    const pj = String(p?.projectId ?? '');
    if (!pj || !look.projects.has(pj)) continue;
    for (const s of p.stages ?? []) {
      for (const deal of s.deals ?? []) {
        if (deal?.status !== 'won' || !deal.closedAt) continue;
        const at = new Date(deal.closedAt);
        if (Number.isNaN(at.getTime()) || at.toISOString() < since) continue;
        wins.push({ projectId: pj, value: Math.max(0, Number(deal.value) || 0) });
      }
    }
  }

  /* The currency every figure is in. The one asked for, if the window has
     any of it; otherwise the one with the most money; otherwise the shop's. */
  const firstPass = summarise({ orders, currency: '', buckets, projectIds: [], recovered, wins: [] });
  const asked = String(d.currency ?? '').toUpperCase();
  const currency = firstPass.currencies.some(c => c.code === asked)
    ? asked
    : firstPass.currencies[0]?.code ?? (await storefrontCurrency(env, accountId)).toUpperCase();

  const report = summarise({
    orders, currency, buckets, projectIds: projects.map(p => p.id), recovered, wins,
  });

  const { results: shopRows } = await env.DB.prepare(
    "SELECT slug, status, project_id FROM crm_shops WHERE account_id = ? AND project_id != '' ORDER BY created_at",
  ).bind(accountId).all<{ slug: string; status: string; project_id: string }>();

  const shown = only ? projects.filter(p => p.id === only) : projects;
  const projectOut = shown.map(p => ({
    id: p.id, name: p.name, status: p.status,
    shops: (shopRows ?? []).filter(s => s.project_id === p.id).map(s => ({ slug: s.slug, status: s.status })),
    ...report.byProject.get(p.id)!,
  }));

  const sumOf = (list: ProjectFigures[]): ProjectFigures => {
    const t: ProjectFigures = {
      revenueCents: 0, paidOrders: 0, averageCents: 0, refundedCents: 0, refundedOrders: 0,
      recoveredCents: 0, recoveredOrders: 0, wonDeals: 0, wonDealValue: 0, series: buckets.map(() => 0),
    };
    for (const f of list) {
      t.revenueCents += f.revenueCents; t.paidOrders += f.paidOrders;
      t.refundedCents += f.refundedCents; t.refundedOrders += f.refundedOrders;
      t.recoveredCents += f.recoveredCents; t.recoveredOrders += f.recoveredOrders;
      t.wonDeals += f.wonDeals; t.wonDealValue += f.wonDealValue;
      f.series.forEach((v, i) => { t.series[i] += v; });
    }
    t.averageCents = t.paidOrders ? Math.round(t.revenueCents / t.paidOrders) : 0;
    return t;
  };
  const totals = sumOf(only ? projectOut : [...projectOut, report.unattributed]);

  return json({
    success: true,
    days, currency, since, timezone: 'UTC', truncated,
    currencies: report.currencies,
    buckets: buckets.map(b => ({ start: b.start, end: b.end })),
    bucket: days === 30 ? 'day' : 'week',
    totals,
    projects: projectOut,
    unattributed: only ? null : report.unattributed,
    attribution: report.attribution as Record<Via, number>,
  });
}
