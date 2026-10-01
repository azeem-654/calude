/**
 * Revenue by project, from /api/revenue.php.
 *
 * The server decides everything — which orders count, which project earned
 * them, which currency the figures are in. This file only carries the answer
 * and formats money, so the Analytics section and a project's Overview strip
 * cannot come to different totals for the same thing.
 */
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';
import { API_BASE } from './apiBase';

export type RevenueDays = 30 | 90 | 365;

export interface RevenueFigures {
  revenueCents: number;
  paidOrders: number;
  averageCents: number;
  refundedCents: number;
  refundedOrders: number;
  /** Orders a project's Autopilot chased that were paid afterwards. */
  recoveredCents: number;
  recoveredOrders: number;
  wonDeals: number;
  /** As typed on the deals. A deal carries no currency, so this is never added to order money. */
  wonDealValue: number;
  /** Revenue per bucket, in the report's currency. */
  series: number[];
}

export interface ProjectRevenue extends RevenueFigures {
  id: string;
  name: string;
  status: string;
  shops: Array<{ slug: string; status: string }>;
}

export interface RevenueReport {
  days: RevenueDays;
  currency: string;
  since: string;
  timezone: string;
  truncated: boolean;
  currencies: Array<{ code: string; revenueCents: number; paidOrders: number }>;
  buckets: Array<{ start: string; end: string }>;
  bucket: 'day' | 'week';
  totals: RevenueFigures;
  projects: ProjectRevenue[];
  unattributed: RevenueFigures | null;
  /** Revenue cents by the evidence that credited it. */
  attribution: { link: number; shop: number; products: number; none: number };
}

export async function loadRevenue(opts: { days: RevenueDays; currency?: string; projectId?: string }):
  Promise<{ ok: true; report: RevenueReport } | { ok: false; error: string }> {
  try {
    const r = await fetch(`${API_BASE}/api/revenue.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'summary', token: sessionToken(), accountId: getActiveAccountId(),
        days: opts.days, currency: opts.currency || undefined, projectId: opts.projectId || undefined,
      }),
    });
    const d = await r.json() as RevenueReport & { success?: boolean; message?: string };
    if (!d.success) return { ok: false, error: d.message || `The report could not be read (${r.status}).` };
    return { ok: true, report: d };
  } catch {
    /* Said as what it is. "No revenue" and "could not ask" look identical as a
       zero, and only one of them means the project earned nothing. */
    return { ok: false, error: 'Could not reach the server, so there are no figures to show.' };
  }
}

/** Whole units when the amount is whole, cents when it is not — "$1,200", "$19.99". */
export function money(cents: number, currency: string): string {
  const whole = cents % 100 === 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency,
      minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(whole ? 0 : 2)} ${currency}`;
  }
}

/** Compact, for axis ticks and small tiles: "$12.9K". */
export function moneyShort(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1,
    }).format(cents / 100);
  } catch {
    return money(cents, currency);
  }
}

/**
 * The address a project's posts and emails should carry: its shop, with the
 * project named, so a sale from that link is credited to it even when the shop
 * serves several projects. The shop page remembers `pj` for the visit.
 */
export function projectShopLink(shopUrl: string, projectId: string): string {
  return `${shopUrl}?pj=${encodeURIComponent(projectId)}`;
}
