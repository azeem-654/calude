/**
 * The four numbers the dashboard opens with.
 *
 * Every one of them is counted from records this workspace actually holds —
 * deals, contacts and appointments — over the last fourteen days, split into
 * the week just gone and the week before it so the change is a measurement and
 * not a guess.
 *
 * Two rules are kept throughout:
 *
 *  - A flow (contacts added, meetings booked, revenue won) is counted per day
 *    and summed over the window. A level (the value sitting in open deals) is
 *    reconstructed for the end of each day, because "pipeline went up 12%"
 *    means the level moved, not that twelve percent more days happened.
 *  - When there is nothing to compare against, the change is `null` and the
 *    card shows a dash. Rendering that as 0% would say "no change" about a week
 *    that was never measured.
 */
import type { Appointment, Contact, Pipeline } from '../../types';

export type KpiFormat = 'money' | 'count';

export interface Kpi {
  id: string;
  label: string;
  value: number;
  format: KpiFormat;
  /** The window the headline value covers, said on the card. */
  window: string;
  /** Fraction, e.g. 0.12 for +12%. Null when the earlier window holds nothing. */
  delta: number | null;
  /** 14 daily points, oldest first. */
  series: number[];
  /** Said in full, so the number can be checked. */
  note: string;
  /** The module that owns the underlying records. */
  path: string;
  linkLabel: string;
}

export const KPI_DAYS = 14;
export const KPI_WINDOW = 7;

/** Local calendar day, so "today" means the user's today and not UTC's. */
function dayKey(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The last KPI_DAYS local dates, oldest first, ending today. */
export function recentDays(now = new Date()): string[] {
  const out: string[] = [];
  for (let i = KPI_DAYS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push(dayKey(d));
  }
  return out;
}

/** End of a local day as a timestamp, for reconstructing levels. */
function endOfDay(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

function sum(list: number[]): number {
  return list.reduce((a, b) => a + b, 0);
}

/** Change between the two halves of a flow series, or null when unmeasurable. */
function flowDelta(series: number[]): { value: number; delta: number | null } {
  const recent = sum(series.slice(KPI_WINDOW));
  const before = sum(series.slice(0, KPI_WINDOW));
  return { value: recent, delta: before > 0 ? (recent - before) / before : null };
}

/** Change in a level series between a week ago and now. */
function levelDelta(series: number[]): { value: number; delta: number | null } {
  const nowValue = series[series.length - 1] ?? 0;
  const then = series[KPI_WINDOW - 1] ?? 0;
  return { value: nowValue, delta: then > 0 ? (nowValue - then) / then : null };
}

export interface KpiInput {
  pipelines: Pipeline[];
  contacts: Contact[];
  appointments: Appointment[];
  now?: Date;
}

export function buildKpis({ pipelines, contacts, appointments, now = new Date() }: KpiInput): Kpi[] {
  const days = recentDays(now);
  const index = new Map(days.map((k, i) => [k, i]));
  const deals = pipelines.flatMap(p => p.stages.flatMap(s => s.deals));

  /* ── Open pipeline value: a level, rebuilt for the end of each day ── */
  const openSeries = days.map(key => {
    const cut = endOfDay(key);
    let total = 0;
    for (const d of deals) {
      const born = new Date(d.createdAt).getTime();
      if (Number.isNaN(born) || born > cut) continue;
      const closed = d.closedAt ? new Date(d.closedAt).getTime() : NaN;
      /* A deal marked won or lost with no closing date has always been closed
         as far as history is concerned — better than pretending it is still
         open on every day of the chart. */
      if (d.status === 'won' || d.status === 'lost') {
        if (Number.isNaN(closed) || closed <= cut) continue;
      }
      total += d.value || 0;
    }
    return total;
  });
  const open = levelDelta(openSeries);

  /* ── Revenue won: a flow, by the day the deal closed ── */
  const wonSeries = new Array(KPI_DAYS).fill(0) as number[];
  for (const d of deals) {
    if (d.status !== 'won') continue;
    const at = index.get(dayKey(d.closedAt || d.createdAt));
    if (at !== undefined) wonSeries[at] += d.value || 0;
  }
  const won = flowDelta(wonSeries);

  /* ── Contacts added ── */
  const contactSeries = new Array(KPI_DAYS).fill(0) as number[];
  for (const c of contacts) {
    const at = index.get(dayKey(c.createdAt));
    if (at !== undefined) contactSeries[at] += 1;
  }
  const added = flowDelta(contactSeries);

  /* ── Meetings: by the day they are held, cancellations excluded ── */
  const meetingSeries = new Array(KPI_DAYS).fill(0) as number[];
  for (const a of appointments) {
    if (a.status === 'cancelled') continue;
    const at = index.get(a.date);
    if (at !== undefined) meetingSeries[at] += 1;
  }
  const meetings = flowDelta(meetingSeries);

  return [
    {
      id: 'pipeline',
      label: 'Open pipeline',
      value: open.value,
      format: 'money',
      window: 'Right now',
      delta: open.delta,
      series: openSeries,
      note: 'Everything sitting in deals that are neither won nor lost, added up today and compared with the same figure seven days ago.',
      path: '/pipelines',
      linkLabel: 'Open pipelines',
    },
    {
      id: 'won',
      label: 'Revenue won',
      value: won.value,
      format: 'money',
      window: 'In last 7 days',
      delta: won.delta,
      series: wonSeries,
      note: 'Deals marked won in the last seven days, by their closing date, against the seven days before that.',
      path: '/pipelines',
      linkLabel: 'Open pipelines',
    },
    {
      id: 'contacts',
      label: 'Contacts added',
      value: added.value,
      format: 'count',
      window: 'In last 7 days',
      delta: added.delta,
      series: contactSeries,
      note: 'People added to the CRM in the last seven days, whatever brought them in, against the seven days before that.',
      path: '/contacts',
      linkLabel: 'Open contacts',
    },
    {
      id: 'meetings',
      label: 'Meetings held',
      value: meetings.value,
      format: 'count',
      window: 'In last 7 days',
      delta: meetings.delta,
      series: meetingSeries,
      note: 'Appointments in the last seven days that were not cancelled, against the seven days before that.',
      path: '/calendar',
      linkLabel: 'Open calendar',
    },
  ];
}

/** Compact money that stays readable at 30px: 48000 → $48k, 1_240_000 → $1.24m */
export function shortMoney(n: number): string {
  const sign = n < 0 ? '-' : '';
  const v = Math.abs(n);
  if (v >= 1_000_000) return `${sign}$${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 2)}m`;
  if (v >= 10_000) return `${sign}$${Math.round(v / 1000)}k`;
  if (v >= 1000) return `${sign}$${(v / 1000).toFixed(1)}k`;
  return `${sign}$${v.toLocaleString()}`;
}

export function formatKpi(value: number, format: KpiFormat): string {
  return format === 'money' ? shortMoney(value) : value.toLocaleString();
}

export function formatDelta(delta: number | null): string {
  if (delta === null) return '—';
  const pct = Math.round(delta * 100);
  return `${pct > 0 ? '+' : ''}${pct}%`;
}
