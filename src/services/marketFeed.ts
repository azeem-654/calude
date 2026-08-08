/**
 * Market feed — turns the CRM's own records into exchange-style instruments.
 *
 * Every series here is reconstructed from timestamps that already exist on the
 * records (deal createdAt/closedAt, contact createdAt, email sentAt, …), so the
 * candles are a real replay of how the business moved, not decoration. Each
 * instrument is expressed as a stream of dated deltas; prefix-summing that
 * stream gives the exact value at any instant, which is what lets us derive a
 * true open/high/low/close for any bucket size.
 *
 * The only non-real part is the intraday tick jitter used by the trading board,
 * and it is opt-out, badged in the UI, and never allowed to change a candle's
 * close — see `applyTick`.
 */
import type { Contact, Deal, Pipeline, Appointment } from '../types';
import { loadEmails } from './contactEmail';

/* ── Shapes ── */

export type Unit = 'usd' | 'pct' | 'count';

export interface Instrument {
  symbol: string;
  name: string;
  unit: Unit;
  /** Where the "trade" button sends you in the app. */
  route: string;
  /** Name of that destination, for the button label. */
  dest: string;
  /** One-line explanation of what the number actually counts. */
  basis: string;
}

export interface Candle {
  /** Bucket start, epoch ms. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  /** Number of underlying records that changed inside the bucket. */
  v: number;
}

export interface Quote {
  instrument: Instrument;
  candles: Candle[];
  /** True current value, straight from the records. */
  truth: number;
  /** What the board displays — truth, plus tick jitter when simulation is on. */
  last: number;
  /** Close of the bucket before the live one. */
  prevClose: number;
  change: number;
  changePct: number;
  /** Total records that moved this instrument inside the visible window. */
  volume: number;
  /** Direction of the most recent tick, for the flash animation. */
  tickDir: 'up' | 'down' | 'flat';
}

export type Timeframe = '1H' | '4H' | '1D' | '1W';

export interface TimeframeSpec {
  key: Timeframe;
  label: string;
  /** Bucket width in ms. */
  step: number;
  /** How many buckets to render. */
  buckets: number;
}

export const TIMEFRAMES: TimeframeSpec[] = [
  { key: '1H', label: '1H', step: 3_600_000, buckets: 72 },
  { key: '4H', label: '4H', step: 14_400_000, buckets: 72 },
  { key: '1D', label: '1D', step: 86_400_000, buckets: 60 },
  { key: '1W', label: '1W', step: 604_800_000, buckets: 52 },
];

export const INSTRUMENTS: Instrument[] = [
  { symbol: 'PIPE/USD', name: 'Open Pipeline', unit: 'usd', route: '/pipelines', dest: 'Pipelines', basis: 'Value of every deal that is open right now' },
  { symbol: 'WON/USD', name: 'Won Revenue', unit: 'usd', route: '/pipelines', dest: 'Pipelines', basis: 'Cumulative value of deals marked won' },
  { symbol: 'WIN/RATE', name: 'Win Rate', unit: 'pct', route: '/pipelines', dest: 'Pipelines', basis: 'Won ÷ (won + lost), as a running figure' },
  { symbol: 'DEAL/CT', name: 'Active Deals', unit: 'count', route: '/pipelines', dest: 'Pipelines', basis: 'Deals open at each point in time' },
  { symbol: 'CONT/CT', name: 'Contacts', unit: 'count', route: '/contacts', dest: 'Contacts', basis: 'Contacts on the books, cumulative' },
  { symbol: 'LEAD/7D', name: 'Lead Velocity', unit: 'count', route: '/contacts', dest: 'Contacts', basis: 'Contacts added in the trailing 7 days' },
  { symbol: 'MAIL/DLV', name: 'Delivery Rate', unit: 'pct', route: '/settings', dest: 'Email settings', basis: 'Delivered ÷ sent across all outbound email' },
  { symbol: 'MEET/CT', name: 'Meetings Booked', unit: 'count', route: '/calendar', dest: 'Calendar', basis: 'Appointments booked, cumulative' },
];

const BY_SYMBOL = new Map(INSTRUMENTS.map(i => [i.symbol, i]));

/* ── Delta streams ── */

/** A dated change to a running total. */
interface Delta { ts: number; d: number }

/** A prefix-summed delta stream that can be evaluated at any instant. */
interface Series {
  ts: number[];
  cum: number[];
}

function buildSeries(deltas: Delta[]): Series {
  const sorted = deltas.filter(x => Number.isFinite(x.ts) && Number.isFinite(x.d)).sort((a, b) => a.ts - b.ts);
  const ts: number[] = [];
  const cum: number[] = [];
  let running = 0;
  for (const x of sorted) {
    running += x.d;
    // Collapse events that share a timestamp so the lookup stays unambiguous.
    if (ts.length > 0 && ts[ts.length - 1] === x.ts) cum[cum.length - 1] = running;
    else { ts.push(x.ts); cum.push(running); }
  }
  return { ts, cum };
}

/** Value of the series at `at` — the sum of every delta dated at or before it. */
function valueAt(s: Series, at: number): number {
  if (s.ts.length === 0 || at < s.ts[0]) return 0;
  let lo = 0, hi = s.ts.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s.ts[mid] <= at) { ans = mid + 1; lo = mid + 1; } else hi = mid - 1;
  }
  return ans === 0 ? 0 : s.cum[ans - 1];
}

/** Timestamps of every change inside [from, to), used for true intraday range. */
function eventsIn(s: Series, from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.ts.length; i++) {
    if (s.ts[i] >= to) break;
    if (s.ts[i] >= from) out.push(s.ts[i]);
  }
  return out;
}

/* ── Turning records into deltas ── */

const ms = (iso?: string): number => {
  if (!iso) return NaN;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
};

/** Appointments store a calendar date plus a wall-clock time. */
function apptMs(a: Appointment): number {
  const direct = ms(a.createdAt);
  if (Number.isFinite(direct)) return direct;
  const t = Date.parse(`${a.date}T${(a.time || '09:00').padStart(5, '0')}:00`);
  return Number.isFinite(t) ? t : NaN;
}

export interface FeedInput {
  contacts: Contact[];
  pipelines: Pipeline[];
  appointments: Appointment[];
}

interface Streams {
  /** Additive series keyed by instrument symbol. */
  main: Map<string, Series>;
  /** Denominator series for the ratio instruments. */
  denom: Map<string, Series>;
}

function buildStreams(input: FeedInput): Streams {
  const deals: Deal[] = input.pipelines.flatMap(p => p.stages.flatMap(s => s.deals));

  const pipe: Delta[] = [];
  const won: Delta[] = [];
  const wonCt: Delta[] = [];
  const lostCt: Delta[] = [];
  const dealCt: Delta[] = [];

  for (const d of deals) {
    const born = ms(d.createdAt);
    if (!Number.isFinite(born)) continue;
    const status = d.status ?? 'active';
    const closed = ms(d.closedAt);
    pipe.push({ ts: born, d: d.value });
    dealCt.push({ ts: born, d: 1 });
    if (status !== 'active' && Number.isFinite(closed)) {
      // A closed deal leaves the open pipeline on the day it closed.
      pipe.push({ ts: closed, d: -d.value });
      dealCt.push({ ts: closed, d: -1 });
      if (status === 'won') { won.push({ ts: closed, d: d.value }); wonCt.push({ ts: closed, d: 1 }); }
      else lostCt.push({ ts: closed, d: 1 });
    }
  }

  const contCt: Delta[] = [];
  const lead7: Delta[] = [];
  for (const c of input.contacts) {
    const born = ms(c.createdAt);
    if (!Number.isFinite(born)) continue;
    contCt.push({ ts: born, d: 1 });
    // A rolling 7-day window is just the arrival plus a matching departure.
    lead7.push({ ts: born, d: 1 });
    lead7.push({ ts: born + 7 * 86_400_000, d: -1 });
  }

  const meetCt: Delta[] = [];
  for (const a of input.appointments) {
    if (a.status === 'cancelled') continue;
    const t = apptMs(a);
    if (Number.isFinite(t)) meetCt.push({ ts: t, d: 1 });
  }

  const delivered: Delta[] = [];
  const sentAll: Delta[] = [];
  for (const e of loadEmails()) {
    if (e.direction !== 'outbound') continue;
    const t = ms(e.sentAt);
    if (!Number.isFinite(t)) continue;
    sentAll.push({ ts: t, d: 1 });
    if (e.status !== 'bounced' && e.status !== 'failed') delivered.push({ ts: t, d: 1 });
  }

  const main = new Map<string, Series>([
    ['PIPE/USD', buildSeries(pipe)],
    ['WON/USD', buildSeries(won)],
    ['WIN/RATE', buildSeries(wonCt)],
    ['DEAL/CT', buildSeries(dealCt)],
    ['CONT/CT', buildSeries(contCt)],
    ['LEAD/7D', buildSeries(lead7)],
    ['MAIL/DLV', buildSeries(delivered)],
    ['MEET/CT', buildSeries(meetCt)],
  ]);

  // Win rate is won/(won+lost); delivery rate is delivered/sent. Both need the
  // denominator replayed on the same clock as the numerator.
  const denom = new Map<string, Series>([
    ['WIN/RATE', buildSeries([...wonCt, ...lostCt])],
    ['MAIL/DLV', buildSeries(sentAll)],
  ]);

  return { main, denom };
}

/** Evaluate an instrument at an instant, ratios included. */
function evaluate(streams: Streams, symbol: string, at: number): number {
  const main = streams.main.get(symbol);
  if (!main) return 0;
  const num = valueAt(main, at);
  const den = streams.denom.get(symbol);
  if (!den) return num;
  const total = valueAt(den, at);
  return total > 0 ? (num / total) * 100 : 0;
}

/* ── Candles ── */

/** Align a timestamp down to the start of its bucket. */
function bucketStart(t: number, step: number): number {
  if (step >= 604_800_000) {
    // Weeks anchor to Monday local time rather than the epoch.
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  }
  if (step >= 86_400_000) {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  const d = new Date(t);
  d.setMinutes(0, 0, 0);
  const hours = step / 3_600_000;
  d.setHours(Math.floor(d.getHours() / hours) * hours);
  return d.getTime();
}

function buildCandles(streams: Streams, symbol: string, spec: TimeframeSpec, now: number): Candle[] {
  const main = streams.main.get(symbol);
  if (!main) return [];
  const liveStart = bucketStart(now, spec.step);
  const out: Candle[] = [];

  for (let i = spec.buckets - 1; i >= 0; i--) {
    // Walk back bucket by bucket so daily/weekly buckets follow the calendar
    // (and survive DST) instead of drifting on fixed millisecond arithmetic.
    const start = i === 0 ? liveStart : bucketStart(liveStart - i * spec.step, spec.step);
    const end = i === 0 ? now : bucketStart(liveStart - (i - 1) * spec.step, spec.step);

    const open = evaluate(streams, symbol, start);
    const samples = [open];
    for (const ts of eventsIn(main, start, end)) samples.push(evaluate(streams, symbol, ts));
    const denomSeries = streams.denom.get(symbol);
    if (denomSeries) for (const ts of eventsIn(denomSeries, start, end)) samples.push(evaluate(streams, symbol, ts));
    const close = evaluate(streams, symbol, end);
    samples.push(close);

    const vol = eventsIn(main, start, end).length + (denomSeries ? eventsIn(denomSeries, start, end).length : 0);
    out.push({
      t: start,
      o: open,
      h: Math.max(...samples),
      l: Math.min(...samples),
      c: close,
      v: vol,
    });
  }

  // A business that started three weeks ago should not be drawn against two
  // empty months. Drop the dead run at the front, keeping one bar of lead-in
  // so the first move still reads as a move.
  const first = out.findIndex(k => k.v > 0 || k.c !== 0 || k.o !== 0);
  return first > 1 ? out.slice(first - 1) : out;
}

/* ── Demo book, for accounts with nothing to replay yet ── */

/** Deterministic noise so the demo book is stable across renders. */
function hashNoise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const DEMO_BASE: Record<string, { start: number; drift: number; vol: number }> = {
  'PIPE/USD': { start: 186_000, drift: 0.0075, vol: 0.030 },
  'WON/USD': { start: 41_000, drift: 0.0110, vol: 0.016 },
  'WIN/RATE': { start: 38, drift: 0.0022, vol: 0.028 },
  'DEAL/CT': { start: 18, drift: 0.0040, vol: 0.030 },
  'CONT/CT': { start: 214, drift: 0.0048, vol: 0.010 },
  'LEAD/7D': { start: 11, drift: 0.0025, vol: 0.075 },
  'MAIL/DLV': { start: 94, drift: 0.0006, vol: 0.009 },
  'MEET/CT': { start: 62, drift: 0.0055, vol: 0.014 },
};

function demoCandles(symbol: string, spec: TimeframeSpec, now: number): Candle[] {
  const base = DEMO_BASE[symbol] ?? { start: 100, drift: 0.005, vol: 0.02 };
  const liveStart = bucketStart(now, spec.step);
  const out: Candle[] = [];
  let price = base.start;
  const seedOffset = symbol.length * 37;

  for (let i = spec.buckets - 1; i >= 0; i--) {
    const start = bucketStart(liveStart - i * spec.step, spec.step);
    const n = spec.buckets - i;
    const o = price;
    const shock = (hashNoise(seedOffset + n * 1.7) - 0.5) * 2 * base.vol;
    const c = Math.max(o * (1 + base.drift + shock), base.start * 0.25);
    const wick = base.vol * 0.55;
    const h = Math.max(o, c) * (1 + hashNoise(seedOffset + n * 3.1) * wick);
    const l = Math.min(o, c) * (1 - hashNoise(seedOffset + n * 5.3) * wick);
    out.push({
      t: start, o, h, l, c,
      v: Math.round(4 + hashNoise(seedOffset + n * 7.9) * 22),
    });
    price = c;
  }
  // Percentages are bounded; let the walk breathe but never leave the scale.
  if (symbol === 'MAIL/DLV' || symbol === 'WIN/RATE') {
    return out.map(k => ({
      ...k,
      o: Math.min(k.o, 99.4), h: Math.min(k.h, 99.6),
      l: Math.min(k.l, 99.2), c: Math.min(k.c, 99.4),
    }));
  }
  return out;
}

/* ── Tick simulation ── */

/**
 * Mean-reverting offset per symbol. It decays toward zero on every advance, so
 * the displayed price is always pulled back to the record-derived truth rather
 * than wandering away from it.
 *
 * Advancing and reading are deliberately separate calls: the offsets live here
 * as one shared state, so every panel on screen renders the same price for the
 * same symbol no matter how many of them are mounted.
 */
const offsets = new Map<string, number>();

const TICK_AMPLITUDE: Record<Unit, number> = {
  usd: 0.0026,
  pct: 0.0016,
  // Counts are whole records; nudging them would render a fractional contact.
  count: 0,
};

/** Step every instrument's offset one tick forward. Call this once per tick. */
export function advanceOffsets(): void {
  for (const ins of INSTRUMENTS) {
    const amp = TICK_AMPLITUDE[ins.unit];
    if (amp === 0) continue;
    const prev = offsets.get(ins.symbol) ?? 0;
    // Sum of three uniforms — a cheap bell curve, so big jumps stay rare.
    const shock = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    const next = Math.max(-amp * 3, Math.min(amp * 3, prev * 0.84 + shock * amp));
    offsets.set(ins.symbol, next);
  }
}

export function resetTicks(): void {
  offsets.clear();
}

/* ── Public book ── */

export interface Book {
  quotes: Quote[];
  /** True when the series were replayed from real records. */
  real: boolean;
  /** Records that fed the replay, shown so the badge can be justified. */
  recordCount: number;
}

/** Enough history to draw a chart that means something. */
const MIN_REAL_EVENTS = 8;

export function buildBook(input: FeedInput, timeframe: Timeframe, now = Date.now()): Book {
  const spec = TIMEFRAMES.find(t => t.key === timeframe) ?? TIMEFRAMES[2];
  const streams = buildStreams(input);
  const recordCount = [...streams.main.values()].reduce((s, x) => s + x.ts.length, 0);
  const real = recordCount >= MIN_REAL_EVENTS;

  const quotes = INSTRUMENTS.map(instrument => {
    const candles = real
      ? buildCandles(streams, instrument.symbol, spec, now)
      : demoCandles(instrument.symbol, spec, now);
    const live = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const truth = live ? live.c : 0;
    const prevClose = prev ? prev.c : (live ? live.o : 0);
    return {
      instrument,
      candles,
      truth,
      last: truth,
      prevClose,
      change: truth - prevClose,
      changePct: prevClose !== 0 ? ((truth - prevClose) / Math.abs(prevClose)) * 100 : 0,
      volume: candles.reduce((s, k) => s + k.v, 0),
      tickDir: 'flat' as const,
    };
  });

  return { quotes, real, recordCount };
}

/**
 * Advance the board by one tick. With simulation off this only re-reads the
 * truth, so prices move when — and only when — the underlying records move.
 * Either way the live candle's close is the truth: jitter is allowed to shape
 * the wick and the displayed last, never the figure the candle settles on.
 */
export function applyTick(book: Book, simulate: boolean): Book {
  const quotes = book.quotes.map(q => {
    const truth = q.truth;
    const shown = simulate ? truth * (1 + (offsets.get(q.instrument.symbol) ?? 0)) : truth;
    // Compare against this book's own previous reading, so two panels showing
    // the same symbol each flash on their own render rather than racing over
    // one piece of shared state.
    const before = q.last;
    const dir: Quote['tickDir'] =
      Math.abs(shown - before) < Math.abs(truth || 1) * 1e-6 ? 'flat'
        : shown > before ? 'up' : 'down';

    const candles = q.candles.slice();
    const live = candles[candles.length - 1];
    if (live) {
      candles[candles.length - 1] = {
        ...live,
        h: Math.max(live.h, shown),
        l: Math.min(live.l, shown),
        c: truth,
      };
    }
    // Change is quoted against the previous close and follows the displayed
    // price, the way a terminal does — so it moves with the tick instead of
    // sitting frozen until a record changes.
    const change = shown - q.prevClose;
    const changePct = q.prevClose !== 0 ? (change / Math.abs(q.prevClose)) * 100 : 0;
    return { ...q, candles, last: shown, change, changePct, tickDir: dir };
  });
  return { ...book, quotes };
}

/* ── Pipeline depth ladder ── */

export interface DepthLevel {
  stage: string;
  color: string;
  deals: number;
  value: number;
  /** Share of the largest level, for the depth bar. */
  share: number;
}

/**
 * The pipeline read as a depth ladder: near-term stages sit at the top the way
 * the inside of the book does, with open value stacked behind each one.
 */
export function pipelineDepth(pipelines: Pipeline[]): DepthLevel[] {
  const stages = pipelines[0]?.stages ?? [];
  const rows = stages.map(s => {
    const open = s.deals.filter(d => (d.status ?? 'active') === 'active');
    return {
      stage: s.name,
      color: s.color || '#8b949e',
      deals: open.length,
      value: open.reduce((sum, d) => sum + d.value, 0),
      share: 0,
    };
  });
  const peak = Math.max(...rows.map(r => r.value), 1);
  return rows.map(r => ({ ...r, share: r.value / peak })).reverse();
}

/* ── Time & sales tape ── */

export interface TapeRow {
  id: string;
  ts: number;
  symbol: string;
  side: 'buy' | 'sell';
  label: string;
  /** Signed impact on the instrument, formatted by the caller. */
  size: number;
  unit: Unit;
}

/**
 * The tape is the real audit trail: deals opening and closing, contacts
 * arriving, meetings booked, email going out. Newest first.
 */
export function buildTape(input: FeedInput, limit = 40): TapeRow[] {
  const rows: TapeRow[] = [];
  const deals: Deal[] = input.pipelines.flatMap(p => p.stages.flatMap(s => s.deals));

  for (const d of deals) {
    const born = ms(d.createdAt);
    if (Number.isFinite(born)) {
      rows.push({
        id: `deal-open-${d.id}`, ts: born, symbol: 'PIPE/USD', side: 'buy',
        label: `${d.title} opened`, size: d.value, unit: 'usd',
      });
    }
    const closed = ms(d.closedAt);
    if ((d.status === 'won' || d.status === 'lost') && Number.isFinite(closed)) {
      rows.push({
        id: `deal-close-${d.id}`, ts: closed,
        symbol: d.status === 'won' ? 'WON/USD' : 'PIPE/USD',
        side: d.status === 'won' ? 'buy' : 'sell',
        label: `${d.title} ${d.status}`, size: d.status === 'won' ? d.value : -d.value, unit: 'usd',
      });
    }
  }

  for (const c of input.contacts) {
    const born = ms(c.createdAt);
    if (Number.isFinite(born)) {
      rows.push({
        id: `contact-${c.id}`, ts: born, symbol: 'CONT/CT', side: 'buy',
        label: `${c.name} added`, size: 1, unit: 'count',
      });
    }
    for (const a of c.activities ?? []) {
      const t = ms(a.timestamp);
      if (!Number.isFinite(t)) continue;
      const isSell = a.type === 'email_sent';
      rows.push({
        id: `act-${a.id}`, ts: t,
        symbol: isSell ? 'MAIL/DLV' : 'CONT/CT',
        side: isSell ? 'sell' : 'buy',
        label: `${c.name} — ${a.description}`, size: 1, unit: 'count',
      });
    }
  }

  for (const a of input.appointments) {
    if (a.status === 'cancelled') continue;
    const t = apptMs(a);
    if (Number.isFinite(t)) {
      rows.push({
        id: `appt-${a.id}`, ts: t, symbol: 'MEET/CT', side: 'buy',
        label: `${a.title} booked`, size: 1, unit: 'count',
      });
    }
  }

  return rows.sort((a, b) => b.ts - a.ts).slice(0, limit);
}

/* ── Formatting ── */

export function formatValue(v: number, unit: Unit): string {
  if (!Number.isFinite(v)) return '—';
  if (unit === 'usd') {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(3)}M`;
    if (abs >= 1_000) return `${(v / 1_000).toFixed(2)}k`;
    return v.toFixed(2);
  }
  if (unit === 'pct') return `${v.toFixed(2)}%`;
  return Math.round(v).toLocaleString();
}

export function formatAxis(v: number, unit: Unit): string {
  if (unit === 'usd') {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${Math.round(v / 1_000)}k`;
    return String(Math.round(v));
  }
  if (unit === 'pct') return `${v.toFixed(0)}%`;
  return String(Math.round(v));
}

export function formatBucket(t: number, tf: Timeframe): string {
  const d = new Date(t);
  if (tf === '1H' || tf === '4H') {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatClock(t: number): string {
  return new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function instrumentFor(symbol: string): Instrument | undefined {
  return BY_SYMBOL.get(symbol);
}

/** Milliseconds until the live bucket rolls over, for the countdown. */
export function untilNextBucket(timeframe: Timeframe, now = Date.now()): number {
  const spec = TIMEFRAMES.find(t => t.key === timeframe) ?? TIMEFRAMES[2];
  const start = bucketStart(now, spec.step);
  const next = bucketStart(start + spec.step + spec.step / 2, spec.step);
  return Math.max(0, next - now);
}

export function formatCountdown(msLeft: number): string {
  const total = Math.floor(msLeft / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
