/**
 * What a project's daily prospect finder does next — pure, so the rotation,
 * the allowances and the dedupe can be tested without a database or a network
 * (`npm run test:finder`).
 *
 * ── The shape of a day ──
 *
 * A finder has trades ("real estate agents", "property managers") and places
 * ("Richmond, Virginia", "Norfolk, Virginia"). Its rotation is every trade in
 * every place, place by place, so a state is covered town by town rather than
 * one trade being run dry everywhere first. Each cron tick does one small,
 * bounded step for one finder — read a few websites, or run one search page —
 * because a tick has a fixed budget of outbound requests and Autopilot's own
 * work shares it. Over a day those steps add up to the finder's `perDay`.
 *
 * ── "More every day" has a ceiling, and the screen says so ──
 *
 * A place has a finite number of listed businesses. When a trade|place search
 * has no further pages it is done, and when every one is done the finder is
 * `exhausted` — it stops and asks for more places or trades rather than
 * spending the owner's credits finding the same businesses again.
 */

export interface FinderState {
  trades: string[];
  places: string[];
  perDay: number;
  cursor: number;
  pageToken: string;
  doneKeys: string[];
  day: string;
  dayAdded: number;
  daySearches: number;
  dayReads: number;
}

/** Hard ceilings per finder per day, whatever `perDay` says — the owner's credits are shared. */
export const DAY_LIMITS = { searches: 12, reads: 150 } as const;
/** Websites read in one tick: each is up to three page fetches and a DNS lookup. */
export const READS_PER_TICK = 6;
export const PER_DAY_MAX = 100;

export const keyOf = (trade: string, place: string) => `${trade.trim().toLowerCase()}|${place.trim().toLowerCase()}`;

/** Every trade in every place, place by place. */
export function rotation(trades: string[], places: string[]): { trade: string; place: string; key: string }[] {
  const out: { trade: string; place: string; key: string }[] = [];
  const seen = new Set<string>();
  for (const place of places) {
    for (const trade of trades) {
      const t = trade.trim(), p = place.trim();
      if (!t || !p) continue;
      const key = keyOf(t, p);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ trade: t, place: p, key });
    }
  }
  return out;
}

/** The counters for `today`, reset when the day has turned. */
export function forDay(s: FinderState, today: string): FinderState {
  return s.day === today ? s : { ...s, day: today, dayAdded: 0, daySearches: 0, dayReads: 0 };
}

export type Job =
  | { kind: 'rest'; why: 'quota' | 'limits' }
  | { kind: 'read' }
  | { kind: 'search'; trade: string; place: string; key: string; pageToken: string; cursor: number }
  | { kind: 'exhausted' };

/**
 * The next step. Reading what was already found comes before searching for
 * more — a pile of unread candidates is work already paid for — and nothing is
 * searched once today's leads are in.
 */
export function nextJob(s: FinderState, pendingCandidates: number, readyWaiting: number, limits: { searches: number; reads: number } = DAY_LIMITS): Job {
  if (s.dayAdded >= s.perDay) return { kind: 'rest', why: 'quota' };
  /* Enough ready to fill today's allowance: add them, search for nothing. */
  if (readyWaiting >= s.perDay - s.dayAdded) return { kind: 'rest', why: 'quota' };
  if (pendingCandidates > 0) return s.dayReads >= limits.reads ? { kind: 'rest', why: 'limits' } : { kind: 'read' };
  if (s.daySearches >= limits.searches) return { kind: 'rest', why: 'limits' };
  const queue = rotation(s.trades, s.places);
  if (!queue.length) return { kind: 'exhausted' };
  const done = new Set(s.doneKeys);
  for (let i = 0; i < queue.length; i++) {
    const at = (s.cursor + i) % queue.length;
    const q = queue[at];
    if (done.has(q.key)) continue;
    return { kind: 'search', trade: q.trade, place: q.place, key: q.key, pageToken: at === s.cursor ? s.pageToken : '', cursor: at };
  }
  return { kind: 'exhausted' };
}

/** After a search page: the next page, or this search is done and the rotation moves on. */
export function afterSearch(s: FinderState, job: Extract<Job, { kind: 'search' }>, nextPage: string): FinderState {
  const queueLen = rotation(s.trades, s.places).length || 1;
  if (nextPage) return { ...s, cursor: job.cursor, pageToken: nextPage, daySearches: s.daySearches + 1 };
  return {
    ...s,
    cursor: (job.cursor + 1) % queueLen,
    pageToken: '',
    doneKeys: [...new Set([...s.doneKeys, job.key])],
    daySearches: s.daySearches + 1,
  };
}

/** How the rotation stands, for the Prospects tab: done, next, waiting. */
export function rotationState(s: FinderState): { trade: string; place: string; state: 'done' | 'next' | 'waiting' }[] {
  const queue = rotation(s.trades, s.places);
  const done = new Set(s.doneKeys);
  const next = nextJob({ ...s, dayAdded: 0, daySearches: 0, dayReads: 0, perDay: Math.max(1, s.perDay) }, 0, 0);
  return queue.map(q => ({
    trade: q.trade, place: q.place,
    state: done.has(q.key) ? 'done' : next.kind === 'search' && next.key === q.key ? 'next' : 'waiting',
  }));
}

/* ── Is this business somebody we already have? ── */

const norm = (s?: string) => String(s ?? '').toLowerCase().replace(/&/g, 'and').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const digits = (s?: string) => { const d = String(s ?? '').replace(/\D/g, ''); return d.length >= 7 ? d.slice(-9) : ''; };
const host = (s?: string) => {
  const t = String(s ?? '').trim().toLowerCase();
  if (!t) return '';
  try { return new URL(/^https?:\/\//.test(t) ? t : `https://${t}`).hostname.replace(/^www\./, ''); } catch { return ''; }
};

export interface Known { emails: Set<string>; namePhone: Set<string>; nameHost: Set<string> }

/** An index of a workspace's contacts, built once per step — the same rules as the browser's `sameBusiness`. */
export function knownIndex(contacts: { name?: string; company?: string; email?: string; phone?: string; website?: string }[]): Known {
  const k: Known = { emails: new Set(), namePhone: new Set(), nameHost: new Set() };
  for (const c of contacts) {
    const e = String(c.email ?? '').trim().toLowerCase();
    if (e) k.emails.add(e);
    const n = norm(c.name || c.company);
    if (!n) continue;
    const ph = digits(c.phone); if (ph) k.namePhone.add(`${n}|${ph}`);
    const h = host(c.website); if (h) k.nameHost.add(`${n}|${h}`);
  }
  return k;
}

export function isKnown(k: Known, b: { name: string; email?: string; phone?: string; website?: string }): boolean {
  const e = String(b.email ?? '').trim().toLowerCase();
  if (e && k.emails.has(e)) return true;
  const n = norm(b.name);
  if (!n) return false;
  const ph = digits(b.phone); if (ph && k.namePhone.has(`${n}|${ph}`)) return true;
  const h = host(b.website); return !!h && k.nameHost.has(`${n}|${h}`);
}

/** The next run: the next tick while there is work today; the start of tomorrow (UTC) otherwise. */
export function nextRunAt(now: Date, job: Job): string {
  if (job.kind === 'rest' || job.kind === 'exhausted') {
    const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 10));
    return t.toISOString();
  }
  return new Date(now.getTime() + 4 * 60_000).toISOString();
}
