/**
 * The Reports overview, computed from what is actually in the account.
 *
 * Every number on that screen used to be a literal in the JSX: $895K revenue,
 * 2,847 new contacts, a conversion funnel starting at 12,400 visitors, and a
 * team leaderboard of four people — "John Smith", "Jane Doe", "Mike Chen",
 * "Sarah Lee" — who exist in no account anywhere. A customer who signed up an
 * hour ago and had added nothing yet was shown a thriving business with
 * $895K in revenue and four sales reps.
 *
 * The period selector was decorative too: it set state nothing ever read, so
 * clicking 7d / 30d / 90d / 12m changed nothing at all.
 *
 * This computes the same figures from real deals, contacts and campaigns, and
 * honours the period. Where there is nothing to show it returns zeroes, which
 * the screen renders as an honest empty state — the sibling Deliverability
 * tab has always done this correctly, so it is the pattern being matched.
 */
import type { Contact, Pipeline, Deal, Campaign } from '../../types';

export type Period = '7d' | '30d' | '90d' | '12m';

export const PERIOD_DAYS: Record<Period, number> = { '7d': 7, '30d': 30, '90d': 90, '12m': 365 };

/** Milliseconds back from now that this period covers. */
function windowStart(period: Period): number {
  return Date.now() - PERIOD_DAYS[period] * 86_400_000;
}

function parseDate(value?: string): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Every deal across every pipeline stage, flattened once. */
export function allDeals(pipelines: Pipeline[]): Deal[] {
  return pipelines.flatMap(p => p.stages.flatMap(s => s.deals));
}

export interface Kpi {
  label: string;
  value: string;
  /** Percentage change against the preceding window of the same length, or
   *  null when there is no earlier activity to compare against — better than
   *  inventing "+23%" for an account with no history. */
  change: number | null;
  hint: string;
}

/** Money, in the compact form the tiles use. */
function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function pctChange(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

export function kpis(contacts: Contact[], pipelines: Pipeline[], period: Period): Kpi[] {
  const deals = allDeals(pipelines);
  const from = windowStart(period);
  const span = PERIOD_DAYS[period] * 86_400_000;
  const prevFrom = from - span;

  const wonIn = (a: number, b: number) => deals.filter(d => {
    if (d.status !== 'won') return false;
    const t = parseDate(d.closedAt) ?? parseDate(d.createdAt);
    return t !== null && t >= a && t < b;
  });

  const wonNow = wonIn(from, Date.now());
  const wonPrev = wonIn(prevFrom, from);
  const revenue = wonNow.reduce((s, d) => s + (d.value || 0), 0);
  const revenuePrev = wonPrev.reduce((s, d) => s + (d.value || 0), 0);

  const newIn = (a: number, b: number) => contacts.filter(c => {
    const t = parseDate(c.createdAt);
    return t !== null && t >= a && t < b;
  }).length;
  const newNow = newIn(from, Date.now());
  const newPrev = newIn(prevFrom, from);

  /* Conversion is measured against the contacts created in the window, not
     against every contact ever — otherwise a long-lived account's rate only
     ever falls. */
  const customersNow = contacts.filter(c => {
    const t = parseDate(c.createdAt);
    return c.status === 'customer' && t !== null && t >= from;
  }).length;
  const convRate = newNow > 0 ? (customersNow / newNow) * 100 : 0;

  const avgDeal = wonNow.length ? revenue / wonNow.length : 0;
  const avgDealPrev = wonPrev.length ? revenuePrev / wonPrev.length : 0;

  return [
    { label: 'Revenue won', value: money(revenue), change: pctChange(revenue, revenuePrev), hint: `${wonNow.length} deal${wonNow.length === 1 ? '' : 's'} closed won` },
    { label: 'New contacts', value: newNow.toLocaleString(), change: pctChange(newNow, newPrev), hint: `${contacts.length.toLocaleString()} on the books in total` },
    { label: 'Conversion rate', value: `${convRate.toFixed(1)}%`, change: null, hint: `${customersNow} of ${newNow} new contacts became customers` },
    { label: 'Average deal', value: money(avgDeal), change: pctChange(avgDeal, avgDealPrev), hint: wonNow.length ? 'Across deals won in this period' : 'No deals won in this period yet' },
  ];
}

export interface TrendPoint { label: string; revenue: number; leads: number }

/**
 * Revenue and new contacts over the period, bucketed so the line has a
 * sensible number of points however long the window is.
 */
export function trend(contacts: Contact[], pipelines: Pipeline[], period: Period): TrendPoint[] {
  const deals = allDeals(pipelines);
  const buckets = period === '7d' ? 7 : period === '30d' ? 10 : period === '90d' ? 12 : 12;
  const span = PERIOD_DAYS[period] * 86_400_000;
  const size = span / buckets;
  const start = Date.now() - span;

  const out: TrendPoint[] = [];
  for (let i = 0; i < buckets; i++) {
    const a = start + i * size;
    const b = a + size;
    const revenue = deals
      .filter(d => { if (d.status !== 'won') return false; const t = parseDate(d.closedAt) ?? parseDate(d.createdAt); return t !== null && t >= a && t < b; })
      .reduce((s, d) => s + (d.value || 0), 0);
    const leads = contacts.filter(c => { const t = parseDate(c.createdAt); return t !== null && t >= a && t < b; }).length;
    const d = new Date(a);
    const label = period === '7d' || period === '30d'
      ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : d.toLocaleDateString(undefined, { month: 'short' });
    out.push({ label, revenue, leads });
  }
  return out;
}

export interface SourceSlice { name: string; value: number; count: number }

/** Where contacts actually came from, as a share of the total. */
export function sources(contacts: Contact[], period: Period): SourceSlice[] {
  const from = windowStart(period);
  const inWindow = contacts.filter(c => { const t = parseDate(c.createdAt); return t !== null && t >= from; });
  const pool = inWindow.length ? inWindow : [];
  if (!pool.length) return [];

  const counts = new Map<string, number>();
  for (const c of pool) {
    const key = (c.source || 'unknown').trim() || 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), count, value: Math.round((count / pool.length) * 100) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

export interface FunnelStage { stage: string; count: number }

/**
 * The real funnel: the account's own pipeline stages, with how many deals sit
 * in each. The old one started at "12,400 visitors" — a number this app has
 * no way to know, since it does not measure website traffic.
 */
export function funnel(pipelines: Pipeline[]): FunnelStage[] {
  const first = pipelines[0];
  if (!first) return [];
  return first.stages.map(s => ({ stage: s.name, count: s.deals.length }));
}

export interface OwnerRow { name: string; deals: number; won: number; revenue: number }

/** Who is actually working the deals, from `assignedTo` on real records. */
export function owners(pipelines: Pipeline[], period: Period): OwnerRow[] {
  const from = windowStart(period);
  const rows = new Map<string, OwnerRow>();
  for (const d of allDeals(pipelines)) {
    const name = (d.assignedTo || '').trim();
    if (!name) continue;
    const t = parseDate(d.closedAt) ?? parseDate(d.createdAt);
    if (t === null || t < from) continue;
    const row = rows.get(name) ?? { name, deals: 0, won: 0, revenue: 0 };
    row.deals += 1;
    if (d.status === 'won') { row.won += 1; row.revenue += d.value || 0; }
    rows.set(name, row);
  }
  return [...rows.values()].sort((a, b) => b.revenue - a.revenue || b.deals - a.deals).slice(0, 6);
}

export interface CampaignRow { name: string; sent: number; opened: number; clicked: number }

/** Campaign performance, straight off the campaign records. */
export function campaignRows(campaigns: Campaign[]): CampaignRow[] {
  return campaigns
    .filter(c => c.sent > 0)
    .map(c => ({ name: c.name, sent: c.sent, opened: c.opened || 0, clicked: c.clicked || 0 }))
    .sort((a, b) => b.sent - a.sent)
    .slice(0, 6);
}

/** True when the account has nothing to report on yet. */
export function isEmpty(contacts: Contact[], pipelines: Pipeline[]): boolean {
  return contacts.length === 0 && allDeals(pipelines).length === 0;
}
