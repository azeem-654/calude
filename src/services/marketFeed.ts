/**
 * Market feed — the CRM's own modules, quoted like an exchange.
 *
 * Each department (CRM, Sales, Marketing, …) carries a progress score out of
 * 100, built from components that are themselves computed from timestamps
 * already on the records: deal createdAt/closedAt, contact createdAt, activity
 * timestamps, email sentAt, review dates. Every component is expressed as a
 * stream of dated deltas, so prefix-summing gives the exact value at any
 * instant — which is what makes a true open/high/low/close per bucket possible
 * rather than one flat point per day.
 *
 * The headline instrument is BIZ/IDX: the mean of the module scores. That is
 * the "average ongoing progress" the main chart tracks.
 *
 * The only non-real part is the intraday tick jitter used by the board, and it
 * is opt-out, badged in the UI, and never allowed to change a candle's close —
 * see `applyTick`.
 */
import type { Appointment, Campaign, Contact, Conversation, Deal, Funnel, Pipeline, Review, Website } from '../types';
import { loadEmails } from './contactEmail';

/* ── Shapes ── */

export type Unit = 'score';

export interface Component {
  label: string;
  weight: number;
  /** What it measures, for the breakdown strip under the chart. */
  hint: string;
}

/**
 * A component either grows toward 100 as work accumulates (`saturate`, where
 * `half` is the count that scores 50), or is a ratio of two counts.
 *
 * `scale` multiplies the raw quotient num/den. The default of 100 turns a plain
 * proportion into a percentage; other values exist for quotients that are not
 * proportions — an average star rating out of 5 needs 20 to reach 100, and a
 * reply rate needs far more, because 12% replies is already excellent.
 */
type CompSpec =
  | (Component & { kind: 'saturate'; key: string; half: number })
  | (Component & { kind: 'ratio'; num: string; den: string; scale?: number });

export interface Module {
  symbol: string;
  name: string;
  /** The department this stands for, shown under the symbol. */
  dept: string;
  route: string;
  dest: string;
  basis: string;
  comps: CompSpec[];
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

export interface Breakdown {
  label: string;
  score: number;
  hint: string;
}

export interface Quote {
  module: Module;
  candles: Candle[];
  /** True current score, straight from the records. */
  truth: number;
  /** What the board displays — truth, plus tick jitter when simulation is on. */
  last: number;
  /** Close of the bucket before the live one. */
  prevClose: number;
  change: number;
  changePct: number;
  /** Records that moved this module inside the visible window. */
  volume: number;
  /** Per-component scores, so the headline number can be explained. */
  breakdown: Breakdown[];
  /** Direction of the most recent tick, for the flash animation. */
  tickDir: 'up' | 'down' | 'flat';
}

export type Timeframe = '1H' | '4H' | '1D' | '1W';

export interface TimeframeSpec {
  key: Timeframe;
  label: string;
  step: number;
  buckets: number;
}

export const TIMEFRAMES: TimeframeSpec[] = [
  { key: '1H', label: '1H', step: 3_600_000, buckets: 72 },
  { key: '4H', label: '4H', step: 14_400_000, buckets: 72 },
  { key: '1D', label: '1D', step: 86_400_000, buckets: 60 },
  { key: '1W', label: '1W', step: 604_800_000, buckets: 52 },
];

/** The composite. Its score is the mean of every module below. */
export const INDEX_SYMBOL = 'BIZ/IDX';

export const INDEX: Module = {
  symbol: INDEX_SYMBOL,
  name: 'Business Progress Index',
  dept: 'All departments',
  route: '/analytics',
  dest: 'Analytics',
  basis: 'The average progress score across all eight modules',
  comps: [],
};

export const MODULES: Module[] = [
  {
    symbol: 'CRM', name: 'Contacts & CRM', dept: 'Customer data',
    route: '/contacts', dest: 'Contacts',
    basis: 'How far the contact database has been built out and worked',
    comps: [
      { kind: 'saturate', key: 'contacts', half: 150, weight: 2, label: 'Database', hint: 'Contacts on the books' },
      { kind: 'saturate', key: 'activities', half: 200, weight: 1, label: 'Engagement', hint: 'Logged activity against contacts' },
      { kind: 'ratio', num: 'tagged', den: 'contacts', weight: 1, label: 'Segmented', hint: 'Share of contacts carrying a tag' },
    ],
  },
  {
    symbol: 'SALES', name: 'Sales Pipeline', dept: 'Revenue',
    route: '/pipelines', dest: 'Pipelines',
    basis: 'Deal flow created, closed, and the rate it closes at',
    comps: [
      { kind: 'saturate', key: 'dealsOpened', half: 40, weight: 1, label: 'Deal flow', hint: 'Deals ever opened' },
      { kind: 'saturate', key: 'dealsWon', half: 15, weight: 1.5, label: 'Closing', hint: 'Deals marked won' },
      { kind: 'ratio', num: 'dealsWon', den: 'dealsClosed', weight: 1.5, label: 'Win rate', hint: 'Won ÷ (won + lost)' },
    ],
  },
  {
    symbol: 'MKTG', name: 'Marketing', dept: 'Demand',
    route: '/marketing', dest: 'Marketing',
    basis: 'Campaigns built, mail actually sent, and whether it gets opened',
    comps: [
      { kind: 'saturate', key: 'campaigns', half: 8, weight: 1, label: 'Campaigns', hint: 'Campaigns created' },
      { kind: 'saturate', key: 'emailsSent', half: 400, weight: 1, label: 'Reach', hint: 'Outbound emails sent' },
      { kind: 'ratio', num: 'emailsOpened', den: 'emailsSent', weight: 1.5, label: 'Open rate', hint: 'Opened ÷ sent' },
    ],
  },
  {
    symbol: 'INBOX', name: 'Conversations', dept: 'Service',
    route: '/conversations', dest: 'Conversations',
    basis: 'Two-way conversation volume and how much of it your team answers',
    comps: [
      { kind: 'saturate', key: 'convos', half: 40, weight: 1, label: 'Threads', hint: 'Conversations opened' },
      { kind: 'saturate', key: 'messages', half: 250, weight: 1, label: 'Volume', hint: 'Messages exchanged' },
      { kind: 'ratio', num: 'agentMsgs', den: 'messages', weight: 1.5, label: 'Response', hint: 'Share of messages sent by your team' },
    ],
  },
  {
    symbol: 'SCHED', name: 'Scheduling', dept: 'Operations',
    route: '/calendar', dest: 'Calendar',
    basis: 'Meetings booked and how many of them actually happen',
    comps: [
      { kind: 'saturate', key: 'appts', half: 30, weight: 1.5, label: 'Bookings', hint: 'Appointments booked' },
      { kind: 'ratio', num: 'apptsDone', den: 'apptsPast', weight: 1.5, label: 'Show rate', hint: 'Completed ÷ meetings whose time has passed' },
    ],
  },
  {
    symbol: 'REP', name: 'Reputation', dept: 'Brand',
    route: '/reputation', dest: 'Reputation',
    basis: 'Review volume, how fast you answer, and the score they leave',
    comps: [
      { kind: 'saturate', key: 'reviews', half: 25, weight: 1, label: 'Volume', hint: 'Reviews received' },
      { kind: 'ratio', num: 'reviewsReplied', den: 'reviews', weight: 1.5, label: 'Reply rate', hint: 'Reviews you answered' },
      { kind: 'ratio', num: 'ratingSum', den: 'reviews', scale: 20, weight: 1.5, label: 'Rating', hint: 'Average stars, scaled to 100' },
    ],
  },
  {
    symbol: 'WEB', name: 'Web & Funnels', dept: 'Acquisition',
    route: '/funnels', dest: 'Funnels',
    basis: 'Funnels and sites built, and how much of it is actually published',
    comps: [
      { kind: 'saturate', key: 'funnels', half: 5, weight: 1, label: 'Funnels', hint: 'Funnels created' },
      { kind: 'saturate', key: 'websites', half: 3, weight: 1, label: 'Sites', hint: 'Websites created' },
      { kind: 'ratio', num: 'webLive', den: 'webAssets', weight: 1, label: 'Published', hint: 'Live ÷ total funnels and sites' },
    ],
  },
  {
    symbol: 'DLVR', name: 'Deliverability', dept: 'Email health',
    route: '/settings', dest: 'Email settings',
    basis: 'Whether the mail you send is reaching inboxes at all',
    comps: [
      { kind: 'ratio', num: 'emailsDelivered', den: 'emailsSent', weight: 2, label: 'Delivery', hint: 'Delivered ÷ sent' },
      { kind: 'saturate', key: 'emailsSent', half: 200, weight: 1, label: 'Track record', hint: 'Volume sent — reputation needs history' },
      // 12.5% replies is an excellent rate, so that is where this reaches 100.
      { kind: 'ratio', num: 'emailsReplied', den: 'emailsSent', scale: 800, weight: 1, label: 'Replies', hint: 'Reply rate — the strongest inbox signal there is' },
    ],
  },
];

export const ALL_INSTRUMENTS: Module[] = [INDEX, ...MODULES];
const BY_SYMBOL = new Map(ALL_INSTRUMENTS.map(m => [m.symbol, m]));

/* ── Delta streams ── */

interface Delta { ts: number; d: number }

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
    if (ts.length > 0 && ts[ts.length - 1] === x.ts) cum[cum.length - 1] = running;
    else { ts.push(x.ts); cum.push(running); }
  }
  return { ts, cum };
}

/** Value of the series at `at` — the sum of every delta dated at or before it. */
function valueAt(s: Series | undefined, at: number): number {
  if (!s || s.ts.length === 0 || at < s.ts[0]) return 0;
  let lo = 0, hi = s.ts.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s.ts[mid] <= at) { ans = mid + 1; lo = mid + 1; } else hi = mid - 1;
  }
  return ans === 0 ? 0 : s.cum[ans - 1];
}

function eventsIn(s: Series | undefined, from: number, to: number): number[] {
  if (!s) return [];
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
function apptTime(a: Appointment): number {
  const t = Date.parse(`${a.date}T${(a.time || '09:00').padStart(5, '0')}:00`);
  return Number.isFinite(t) ? t : NaN;
}

function apptBooked(a: Appointment): number {
  const direct = ms(a.createdAt);
  return Number.isFinite(direct) ? direct : apptTime(a);
}

export interface FeedInput {
  contacts: Contact[];
  pipelines: Pipeline[];
  appointments: Appointment[];
  conversations: Conversation[];
  campaigns: Campaign[];
  reviews: Review[];
  funnels: Funnel[];
  websites: Website[];
}

type Streams = Map<string, Series>;

function buildStreams(input: FeedInput): Streams {
  const raw = new Map<string, Delta[]>();
  const push = (key: string, ts: number, d = 1) => {
    if (!Number.isFinite(ts)) return;
    const arr = raw.get(key);
    if (arr) arr.push({ ts, d });
    else raw.set(key, [{ ts, d }]);
  };

  /* Contacts */
  let earliest = Infinity;
  for (const c of input.contacts) {
    const born = ms(c.createdAt);
    if (!Number.isFinite(born)) continue;
    earliest = Math.min(earliest, born);
    push('contacts', born);
    // Tags carry no date of their own, so a tagged contact counts from the day
    // it was created. That understates when tagging happened, never overstates.
    if (c.tags.length > 0) push('tagged', born);
    for (const a of c.activities ?? []) push('activities', ms(a.timestamp));
  }

  /* Deals */
  const deals: Deal[] = input.pipelines.flatMap(p => p.stages.flatMap(s => s.deals));
  for (const d of deals) {
    const born = ms(d.createdAt);
    if (!Number.isFinite(born)) continue;
    earliest = Math.min(earliest, born);
    push('dealsOpened', born);
    const status = d.status ?? 'active';
    const closed = ms(d.closedAt);
    if (status !== 'active' && Number.isFinite(closed)) {
      push('dealsClosed', closed);
      if (status === 'won') push('dealsWon', closed);
    }
  }

  /* Campaigns */
  for (const c of input.campaigns) {
    const born = ms(c.createdAt);
    if (Number.isFinite(born)) { earliest = Math.min(earliest, born); push('campaigns', born); }
  }

  /* Email — the real per-message record, which carries its own send time */
  for (const e of loadEmails()) {
    if (e.direction !== 'outbound') continue;
    const t = ms(e.sentAt);
    if (!Number.isFinite(t)) continue;
    earliest = Math.min(earliest, t);
    push('emailsSent', t);
    if (e.status !== 'bounced' && e.status !== 'failed') push('emailsDelivered', t);
    if (e.opens > 0 || e.status === 'opened' || e.status === 'clicked' || e.status === 'replied') {
      push('emailsOpened', ms(e.firstOpenAt) || t);
    }
    if (e.status === 'replied') push('emailsReplied', ms(e.repliedAt) || t);
  }

  /* Conversations */
  for (const conv of input.conversations) {
    const msgs = conv.messages ?? [];
    const first = msgs.length ? ms(msgs[0].timestamp) : ms(conv.lastMessageTime);
    if (Number.isFinite(first)) { earliest = Math.min(earliest, first); push('convos', first); }
    for (const m of msgs) {
      const t = ms(m.timestamp);
      push('messages', t);
      if (m.sender === 'agent') push('agentMsgs', t);
    }
  }

  /* Appointments */
  for (const a of input.appointments) {
    if (a.status === 'cancelled') continue;
    const booked = apptBooked(a);
    if (Number.isFinite(booked)) { earliest = Math.min(earliest, booked); push('appts', booked); }
    // The show rate is only meaningful once a meeting's slot has passed, so
    // both sides of the ratio start counting at the meeting time.
    const when = apptTime(a);
    if (Number.isFinite(when)) {
      push('apptsPast', when);
      if (a.status === 'completed') push('apptsDone', when);
    }
  }

  /* Reviews */
  for (const r of input.reviews) {
    const t = ms(r.date);
    if (!Number.isFinite(t)) continue;
    earliest = Math.min(earliest, t);
    push('reviews', t);
    push('ratingSum', t, r.rating);
    // Replies carry no timestamp either; same conservative treatment as tags.
    if (r.replied) push('reviewsReplied', t);
  }

  /* Funnels and websites. Both may predate the createdAt field, so anything
     undated is treated as having existed since the account's first record —
     which keeps it out of recent history instead of faking a fresh launch. */
  const floor = Number.isFinite(earliest) ? earliest : Date.now();
  for (const f of input.funnels) {
    const t = Number.isFinite(ms(f.createdAt)) ? ms(f.createdAt) : floor;
    push('funnels', t); push('webAssets', t);
    if (f.status === 'active') push('webLive', t);
  }
  for (const w of input.websites) {
    const t = Number.isFinite(ms(w.createdAt)) ? ms(w.createdAt) : floor;
    push('websites', t); push('webAssets', t);
    if (w.status === 'published') push('webLive', t);
  }

  const out: Streams = new Map();
  for (const [k, v] of raw) out.set(k, buildSeries(v));
  return out;
}

/* ── Scoring ── */

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function compScore(streams: Streams, c: CompSpec, at: number): number {
  if (c.kind === 'saturate') {
    const n = valueAt(streams.get(c.key), at);
    // n/(n+half) is 0 at nothing, 50 at `half`, and approaches 100 — progress
    // that never quite finishes, which is the honest shape for "how built out
    // is this module".
    return n <= 0 ? 0 : clamp((100 * n) / (n + c.half), 0, 100);
  }
  const den = valueAt(streams.get(c.den), at);
  if (den <= 0) return 0;
  const num = valueAt(streams.get(c.num), at);
  return clamp((num / den) * (c.scale ?? 100), 0, 100);
}

function moduleScore(streams: Streams, m: Module, at: number): number {
  let total = 0, weight = 0;
  for (const c of m.comps) {
    total += compScore(streams, c, at) * c.weight;
    weight += c.weight;
  }
  return weight > 0 ? total / weight : 0;
}

function indexScore(streams: Streams, at: number): number {
  let total = 0;
  for (const m of MODULES) total += moduleScore(streams, m, at);
  return total / MODULES.length;
}

function scoreAt(streams: Streams, m: Module, at: number): number {
  return m.symbol === INDEX_SYMBOL ? indexScore(streams, at) : moduleScore(streams, m, at);
}

/** Every stream a module reads, so its candles can sample the right instants. */
function keysFor(m: Module): string[] {
  if (m.symbol === INDEX_SYMBOL) return MODULES.flatMap(keysFor);
  return m.comps.flatMap(c => (c.kind === 'saturate' ? [c.key] : [c.num, c.den]));
}

export function breakdownFor(streams: Streams, m: Module, at: number): Breakdown[] {
  if (m.symbol === INDEX_SYMBOL) {
    return MODULES.map(x => ({
      label: x.symbol,
      score: moduleScore(streams, x, at),
      hint: `${x.name} — ${x.dept}`,
    }));
  }
  return m.comps.map(c => ({ label: c.label, score: compScore(streams, c, at), hint: c.hint }));
}

/* ── Candles ── */

function bucketStart(t: number, step: number): number {
  if (step >= 604_800_000) {
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

function buildCandles(streams: Streams, m: Module, spec: TimeframeSpec, now: number): Candle[] {
  const keys = [...new Set(keysFor(m))];
  const liveStart = bucketStart(now, spec.step);
  const out: Candle[] = [];

  for (let i = spec.buckets - 1; i >= 0; i--) {
    // Walk back bucket by bucket so daily/weekly buckets follow the calendar
    // (and survive DST) instead of drifting on fixed millisecond arithmetic.
    const start = i === 0 ? liveStart : bucketStart(liveStart - i * spec.step, spec.step);
    const end = i === 0 ? now : bucketStart(liveStart - (i - 1) * spec.step, spec.step);

    const open = scoreAt(streams, m, start);
    const samples = [open];
    let vol = 0;
    for (const k of keys) {
      const evs = eventsIn(streams.get(k), start, end);
      vol += evs.length;
      for (const ts of evs) samples.push(scoreAt(streams, m, ts));
    }
    const close = scoreAt(streams, m, end);
    samples.push(close);

    out.push({ t: start, o: open, h: Math.max(...samples), l: Math.min(...samples), c: close, v: vol });
  }

  // A business that started three weeks ago should not be drawn against two
  // empty months. Drop the dead run at the front, keeping one bar of lead-in.
  const first = out.findIndex(k => k.v > 0 || k.c !== 0 || k.o !== 0);
  return first > 1 ? out.slice(first - 1) : out;
}

/* ── Demo book, for accounts with nothing to replay yet ── */

function hashNoise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Where each module's worked example starts, and how fast it climbs. */
const DEMO_BASE: Record<string, { start: number; drift: number; vol: number }> = {
  'BIZ/IDX': { start: 34, drift: 0.0062, vol: 0.014 },
  CRM: { start: 46, drift: 0.0058, vol: 0.020 },
  SALES: { start: 38, drift: 0.0075, vol: 0.032 },
  MKTG: { start: 29, drift: 0.0080, vol: 0.030 },
  INBOX: { start: 41, drift: 0.0045, vol: 0.024 },
  SCHED: { start: 33, drift: 0.0060, vol: 0.028 },
  REP: { start: 52, drift: 0.0035, vol: 0.018 },
  WEB: { start: 24, drift: 0.0090, vol: 0.036 },
  DLVR: { start: 58, drift: 0.0030, vol: 0.016 },
};

function demoCandles(symbol: string, spec: TimeframeSpec, now: number): Candle[] {
  const base = DEMO_BASE[symbol] ?? { start: 40, drift: 0.005, vol: 0.02 };
  const liveStart = bucketStart(now, spec.step);
  const out: Candle[] = [];
  let price = base.start;
  const seedOffset = symbol.length * 37 + symbol.charCodeAt(0);

  for (let i = spec.buckets - 1; i >= 0; i--) {
    const start = bucketStart(liveStart - i * spec.step, spec.step);
    const n = spec.buckets - i;
    const o = price;
    const shock = (hashNoise(seedOffset + n * 1.7) - 0.5) * 2 * base.vol;
    const c = clamp(o * (1 + base.drift + shock), 4, 97);
    const wick = base.vol * 0.55;
    out.push({
      t: start, o, c,
      h: clamp(Math.max(o, c) * (1 + hashNoise(seedOffset + n * 3.1) * wick), 4, 99),
      l: clamp(Math.min(o, c) * (1 - hashNoise(seedOffset + n * 5.3) * wick), 1, 99),
      v: Math.round(3 + hashNoise(seedOffset + n * 7.9) * 20),
    });
    price = c;
  }
  return out;
}

function demoBreakdown(m: Module, score: number): Breakdown[] {
  const parts = m.symbol === INDEX_SYMBOL
    ? MODULES.map(x => ({ label: x.symbol, hint: `${x.name} — ${x.dept}` }))
    : m.comps.map(c => ({ label: c.label, hint: c.hint }));
  return parts.map((p, i) => ({
    ...p,
    score: clamp(score * (0.72 + hashNoise(m.symbol.length + i * 4.3) * 0.55), 0, 100),
  }));
}

/* ── Tick simulation ── */

const offsets = new Map<string, number>();

/** Progress scores are bounded, so the nudge stays small. */
const TICK_AMPLITUDE = 0.0016;

/** Step every instrument's offset one tick forward. Call this once per tick. */
export function advanceOffsets(): void {
  for (const m of ALL_INSTRUMENTS) {
    const prev = offsets.get(m.symbol) ?? 0;
    // Sum of three uniforms — a cheap bell curve, so big jumps stay rare.
    const shock = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    const next = clamp(prev * 0.84 + shock * TICK_AMPLITUDE, -TICK_AMPLITUDE * 3, TICK_AMPLITUDE * 3);
    offsets.set(m.symbol, next);
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
  let recordCount = 0;
  for (const s of streams.values()) recordCount += s.ts.length;
  const real = recordCount >= MIN_REAL_EVENTS;

  const quotes = ALL_INSTRUMENTS.map(module => {
    const candles = real ? buildCandles(streams, module, spec, now) : demoCandles(module.symbol, spec, now);
    const live = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const truth = live ? live.c : 0;
    const prevClose = prev ? prev.c : (live ? live.o : 0);
    return {
      module,
      candles,
      truth,
      last: truth,
      prevClose,
      change: truth - prevClose,
      changePct: prevClose !== 0 ? ((truth - prevClose) / Math.abs(prevClose)) * 100 : 0,
      volume: candles.reduce((s, k) => s + k.v, 0),
      breakdown: real ? breakdownFor(streams, module, now) : demoBreakdown(module, truth),
      tickDir: 'flat' as const,
    };
  });

  return { quotes, real, recordCount };
}

/**
 * Advance the board by one tick. With simulation off this only re-reads the
 * truth, so scores move when — and only when — the underlying records move.
 * Either way the live candle's close is the truth: jitter is allowed to shape
 * the wick and the displayed last, never the figure the candle settles on.
 */
export function applyTick(book: Book, simulate: boolean): Book {
  const quotes = book.quotes.map(q => {
    const truth = q.truth;
    const shown = simulate
      ? clamp(truth * (1 + (offsets.get(q.module.symbol) ?? 0)), 0, 100)
      : truth;
    const before = q.last;
    const dir: Quote['tickDir'] =
      Math.abs(shown - before) < 1e-4 ? 'flat' : shown > before ? 'up' : 'down';

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
    // score, the way a terminal does — so it moves with the tick instead of
    // sitting frozen until a record changes.
    const change = shown - q.prevClose;
    const changePct = q.prevClose !== 0 ? (change / Math.abs(q.prevClose)) * 100 : 0;
    return { ...q, candles, last: shown, change, changePct, tickDir: dir };
  });
  return { ...book, quotes };
}

/* ── Index composition ladder ── */

export interface CompositionRow {
  symbol: string;
  name: string;
  dept: string;
  score: number;
  /** Distance from the index average — who is carrying it, who is dragging. */
  delta: number;
  share: number;
}

/**
 * The index read as a ladder: every module against the average it feeds, so the
 * departments carrying the business and the ones holding it back are one glance
 * apart.
 */
export function indexComposition(book: Book): CompositionRow[] {
  const rows = book.quotes.filter(q => q.module.symbol !== INDEX_SYMBOL);
  if (rows.length === 0) return [];
  const avg = rows.reduce((s, q) => s + q.truth, 0) / rows.length;
  const peak = Math.max(...rows.map(q => q.truth), 1);
  return rows
    .map(q => ({
      symbol: q.module.symbol,
      name: q.module.name,
      dept: q.module.dept,
      score: q.truth,
      delta: q.truth - avg,
      share: q.truth / peak,
    }))
    .sort((a, b) => b.score - a.score);
}

/* ── Time & sales tape ── */

export interface TapeRow {
  id: string;
  ts: number;
  symbol: string;
  side: 'buy' | 'sell';
  label: string;
}

/**
 * The tape is the real audit trail: what each department actually did, newest
 * first. `sell` marks the events that pull a score down.
 */
export function buildTape(input: FeedInput, limit = 40): TapeRow[] {
  const rows: TapeRow[] = [];
  const add = (id: string, ts: number, symbol: string, side: 'buy' | 'sell', label: string) => {
    if (Number.isFinite(ts)) rows.push({ id, ts, symbol, side, label });
  };

  const deals: Deal[] = input.pipelines.flatMap(p => p.stages.flatMap(s => s.deals));
  for (const d of deals) {
    add(`deal-open-${d.id}`, ms(d.createdAt), 'SALES', 'buy', `${d.title} opened`);
    if (d.status === 'won') add(`deal-won-${d.id}`, ms(d.closedAt), 'SALES', 'buy', `${d.title} won`);
    if (d.status === 'lost') add(`deal-lost-${d.id}`, ms(d.closedAt), 'SALES', 'sell', `${d.title} lost`);
  }
  for (const c of input.contacts) {
    add(`contact-${c.id}`, ms(c.createdAt), 'CRM', 'buy', `${c.name} added`);
    for (const a of c.activities ?? []) {
      add(`act-${a.id}`, ms(a.timestamp), a.type === 'email_sent' ? 'MKTG' : 'CRM', 'buy', `${c.name} — ${a.description}`);
    }
  }
  for (const a of input.appointments) {
    if (a.status === 'cancelled') continue;
    add(`appt-${a.id}`, apptBooked(a), 'SCHED', 'buy', `${a.title} booked`);
    if (a.status === 'no-show') add(`appt-ns-${a.id}`, apptTime(a), 'SCHED', 'sell', `${a.title} — no show`);
  }
  for (const r of input.reviews) {
    add(`rev-${r.id}`, ms(r.date), 'REP', r.rating >= 4 ? 'buy' : 'sell', `${r.rating}★ from ${r.author}`);
  }
  for (const c of input.campaigns) {
    add(`camp-${c.id}`, ms(c.createdAt), 'MKTG', 'buy', `Campaign "${c.name}" created`);
  }
  for (const conv of input.conversations) {
    const first = conv.messages?.[0];
    if (first) add(`conv-${conv.id}`, ms(first.timestamp), 'INBOX', 'buy', `${conv.contactName} — thread opened`);
  }

  return rows.sort((a, b) => b.ts - a.ts).slice(0, limit);
}

/* ── Formatting ── */

export function formatValue(v: number): string {
  return Number.isFinite(v) ? v.toFixed(2) : '—';
}

export function formatAxis(v: number): string {
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

export function instrumentFor(symbol: string): Module | undefined {
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
