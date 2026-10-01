/**
 * Revenue by project — which project earned an order, and the report built on it.
 *
 * Pure: everything here takes rows already read and returns numbers, so the
 * arithmetic the owner will make decisions on can be checked without a
 * database, and the checkout and the report share one rule instead of two
 * that drift.
 *
 * ── The attribution rule ──
 *
 * An order is credited to at most one project, on the first of these that
 * holds. Every candidate must be a project *of the order's own workspace* —
 * an id that is not is ignored, never trusted:
 *
 *   (a) `link`     — the buyer arrived on the project's own shop link
 *                    (`/shop/<slug>?pj=<projectId>`), stamped at checkout;
 *   (b) `shop`     — the shop it was bought in belongs to the project;
 *   (c) `products` — every line names a product, and every one of those
 *                    products belongs to the same project.
 *
 * Otherwise it is **Unattributed**, and shown as that. Splitting an order
 * across projects by line, or guessing from timing ("the campaign went out
 * that morning"), would produce a number that looks precise and is not; an
 * honest "we cannot say" row is worth more than a confident wrong one.
 *
 * Only money that arrived counts: orders `paid` or `fulfilled`, dated by
 * `paid_at`. Refunded orders are reported beside revenue, never inside it.
 * Won deals are reported beside it too — a deal's value carries no currency,
 * so adding it to order money would be adding two different things.
 */

export type Via = 'link' | 'shop' | 'products' | 'none';

export interface Lookups {
  /** The workspace's own projects. Nothing outside this set can be credited. */
  projects: Set<string>;
  /** shop id → the project it belongs to ('' when none). */
  shopProject: Map<string, string>;
  /** product id → the project it belongs to ('' when none). */
  productProject: Map<string, string>;
}

export interface OrderForAttribution {
  /** What checkout stamped, if anything. */
  projectId: string;
  via: string;
  shopId: string;
  productIds: string[];
}

export function attribute(o: OrderForAttribution, look: Lookups): { projectId: string; via: Via } {
  /* A stamp is believed only while the project still exists in this
     workspace. A deleted project's sales fall through to the next rule rather
     than being credited to a name nobody can open. */
  if (o.projectId && look.projects.has(o.projectId)) {
    const via: Via = o.via === 'shop' || o.via === 'products' ? o.via : 'link';
    return { projectId: o.projectId, via };
  }
  const fromShop = o.shopId ? look.shopProject.get(o.shopId) ?? '' : '';
  if (fromShop && look.projects.has(fromShop)) return { projectId: fromShop, via: 'shop' };

  /* Every line, not most of them. An order of one product from project A and
     one from project B belongs to neither — crediting it to whichever came
     first is a coin toss with a ledger attached. */
  if (o.productIds.length) {
    let only = '';
    for (const id of o.productIds) {
      const pj = look.productProject.get(id) ?? '';
      if (!pj || !look.projects.has(pj)) return { projectId: '', via: 'none' };
      if (only && pj !== only) return { projectId: '', via: 'none' };
      only = pj;
    }
    if (only) return { projectId: only, via: 'products' };
  }
  return { projectId: '', via: 'none' };
}

/** Product ids named by an order's stored `items` JSON, without trusting its shape. */
export function productIdsOf(itemsJson: string): string[] {
  try {
    const items = JSON.parse(itemsJson || '[]') as unknown;
    if (!Array.isArray(items)) return [];
    return items.map(i => String((i as { productId?: unknown })?.productId ?? '')).filter(Boolean);
  } catch { return []; }
}

/* ── The window and its buckets ─────────────────────────────────────────── */

export type Days = 30 | 90 | 365;

export interface Bucket { start: string; end: string }

const DAY = 86_400_000;

/**
 * Days ending today, in UTC, and the buckets they are drawn in.
 *
 * Daily for 30 days; weekly for 90 and 365, because 365 daily bars at phone
 * width are thinner than a pixel and a small shop's day-to-day is noise. UTC
 * rather than the viewer's zone because the same report is read by people in
 * different places and must say the same thing to each; the screen says so.
 * The last weekly bucket can be short — it ends today, not on a Sunday.
 */
export function windowFor(days: Days, now = new Date()): { since: string; buckets: Bucket[] } {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start = today - (days - 1) * DAY;
  const end = today + DAY;
  const step = days === 30 ? DAY : 7 * DAY;
  const buckets: Bucket[] = [];
  for (let t = start; t < end; t += step) {
    buckets.push({ start: new Date(t).toISOString(), end: new Date(Math.min(t + step, end)).toISOString() });
  }
  return { since: new Date(start).toISOString(), buckets };
}

/** Which bucket an ISO time falls in, or -1. Buckets are contiguous and ordered. */
export function bucketOf(at: string, buckets: Bucket[]): number {
  if (!buckets.length || at < buckets[0].start || at >= buckets[buckets.length - 1].end) return -1;
  const t = Date.parse(at);
  const step = Date.parse(buckets[0].end) - Date.parse(buckets[0].start);
  const i = Math.floor((t - Date.parse(buckets[0].start)) / step);
  return Math.min(Math.max(i, 0), buckets.length - 1);
}

/* ── The report ─────────────────────────────────────────────────────────── */

export interface OrderRow {
  id: string;
  status: string;
  totalCents: number;
  currency: string;
  paidAt: string;
  chasedAt: string | null;
  projectId: string;
  via: Via;
}

export interface DealWin { projectId: string; value: number }

export interface ProjectFigures {
  revenueCents: number;
  paidOrders: number;
  averageCents: number;
  refundedCents: number;
  refundedOrders: number;
  recoveredCents: number;
  recoveredOrders: number;
  wonDeals: number;
  wonDealValue: number;
  /** Revenue per bucket, in the report's currency. */
  series: number[];
}

const blank = (n: number): ProjectFigures => ({
  revenueCents: 0, paidOrders: 0, averageCents: 0, refundedCents: 0, refundedOrders: 0,
  recoveredCents: 0, recoveredOrders: 0, wonDeals: 0, wonDealValue: 0, series: new Array(n).fill(0),
});

/**
 * Every figure, in one currency.
 *
 * Orders in other currencies are not converted: there is no rate here that the
 * owner agreed to, and a converted total would be a number nobody was paid.
 * They are counted in `currencies` instead, so the screen can offer a switch.
 *
 * `recovered` is keyed by order id → the project whose Autopilot chased it.
 * An order counts as recovered only if its chase was actually sent (`chasedAt`
 * — stamped only after the mail was accepted) and the money arrived after it.
 * It is credited to the project that chased, which need not be the project the
 * sale is attributed to: one says who sold it, the other who rescued it.
 */
export function summarise(input: {
  orders: OrderRow[];
  currency: string;
  buckets: Bucket[];
  projectIds: string[];
  recovered: Map<string, string>;
  wins: DealWin[];
}): { byProject: Map<string, ProjectFigures>; unattributed: ProjectFigures; currencies: Array<{ code: string; revenueCents: number; paidOrders: number }>; attribution: Record<Via, number> } {
  const n = input.buckets.length;
  const byProject = new Map<string, ProjectFigures>(input.projectIds.map(id => [id, blank(n)]));
  const unattributed = blank(n);
  const row = (id: string) => (id && byProject.get(id)) || unattributed;
  const currencies = new Map<string, { revenueCents: number; paidOrders: number }>();
  const attribution: Record<Via, number> = { link: 0, shop: 0, products: 0, none: 0 };

  for (const o of input.orders) {
    const earned = o.status === 'paid' || o.status === 'fulfilled';
    if (earned) {
      const c = currencies.get(o.currency) ?? { revenueCents: 0, paidOrders: 0 };
      c.revenueCents += o.totalCents; c.paidOrders++;
      currencies.set(o.currency, c);
    }
    if (o.currency !== input.currency) continue;

    const r = row(o.projectId);
    if (earned) {
      r.revenueCents += o.totalCents;
      r.paidOrders++;
      attribution[r === unattributed ? 'none' : o.via] += o.totalCents;
      const b = bucketOf(o.paidAt, input.buckets);
      if (b >= 0) r.series[b] += o.totalCents;

      const chaser = input.recovered.get(o.id);
      if (chaser !== undefined && o.chasedAt && o.paidAt >= o.chasedAt) {
        const rc = row(chaser);
        rc.recoveredCents += o.totalCents;
        rc.recoveredOrders++;
      }
    } else if (o.status === 'refunded') {
      r.refundedCents += o.totalCents;
      r.refundedOrders++;
    }
  }

  for (const w of input.wins) {
    const r = row(w.projectId);
    r.wonDeals++;
    r.wonDealValue += w.value;
  }

  for (const r of [...byProject.values(), unattributed]) {
    r.averageCents = r.paidOrders ? Math.round(r.revenueCents / r.paidOrders) : 0;
  }

  return {
    byProject, unattributed, attribution,
    currencies: [...currencies.entries()]
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.revenueCents - a.revenueCents || a.code.localeCompare(b.code)),
  };
}
