/**
 * The booking page's clock: the owner's hours, shown in the visitor's zone.
 *
 * ── The contract ──
 *
 * A booking is stored as `slot_date` + `slot_time`, a wall-clock time in the
 * **owner's** zone (the schedule's `timezone`). The reminder pass reads it that
 * way (autopilotTick `bookingsTomorrow`), the owner's diary reads it that way,
 * and so does the Google event. Nothing about that changes here. What this file
 * adds is the step in between: an owner in New York open 9–5 is, for a visitor
 * in Bangkok, open 8 pm to 4 am — across two of the visitor's days — and the
 * page has to show the visitor *their* day, with *their* times, and still file
 * the booking under the owner's date and hour.
 *
 * ── Why not offsets ──
 *
 * An offset is true for one instant. New York is UTC−4 in October and UTC−5 in
 * November, so a slot computed with today's offset is an hour wrong for every
 * date across the change — which is exactly the date somebody books two weeks
 * out. Every conversion here asks Intl for the zone's rules *at that instant*.
 *
 * ── The two awkward hours a year ──
 *
 * Spring forward: 02:30 on that night does not exist in the owner's zone.
 * `wallToUtc` answers null and the slot is not offered — the alternative is
 * offering a time that silently becomes 03:30. Fall back: 01:30 happens twice;
 * the earlier one is taken, consistently, so the server and every browser file
 * it the same way.
 *
 * Pure and import-free: the browser imports this file too (services/
 * bookingTime.ts), so the page a visitor sees and the check the server makes
 * on their booking are one implementation. `npm run test:bookingtz`.
 */

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type DayKey = typeof DAY_KEYS[number];

export interface DayHours { enabled: boolean; from: string; to: string }

/** What decides when the owner can be booked. Every time is owner wall-clock. */
export interface SlotRules {
  timezone: string;
  weekly: Partial<Record<DayKey, DayHours>>;
  duration: number;
  bufferBefore?: number;
  bufferAfter?: number;
  dailyLimit?: number;
  minNoticeMin?: number;
  windowDays?: number;
}

/** Something already in the owner's day: a booking, a meeting, blocked time. */
export interface Busy { date: string; time: string; duration: number }

/** One bookable time, said both ways. */
export interface Slot {
  /** The real instant, ms since the epoch. */
  utc: number;
  ownerDate: string;
  ownerTime: string;
  visitorDate: string;
  visitorTime: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const pad = (n: number) => String(n).padStart(2, '0');

/* Intl formatters are slow to build and a month view asks thousands of
   questions, so one per zone is kept. */
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsFmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Whether Intl knows this zone. A typo must not become UTC without anybody saying so. */
export function isZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try { partsFmt(tz); return true; } catch { return false; }
}

/** The wall clock in `tz` at an instant. */
export function utcToWall(ms: number, tz: string): { date: string; time: string; weekday: number; minutes: number } {
  const p: Record<string, string> = {};
  for (const x of partsFmt(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
  const h = Number(p.hour) % 24;
  const date = `${p.year}-${p.month}-${p.day}`;
  const time = `${pad(h)}:${p.minute}`;
  const weekday = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day))).getUTCDay();
  return { date, time, weekday, minutes: h * 60 + Number(p.minute) };
}

/** Minutes `tz` is ahead of UTC at an instant (Bangkok +420, New York −240 or −300). */
export function offsetMinutes(ms: number, tz: string): number {
  const p: Record<string, string> = {};
  for (const x of partsFmt(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

/**
 * The instant a wall-clock time in `tz` names, or null when that time does not
 * exist there (the hour skipped when the clocks go forward). Of the two
 * instants an hour repeated in autumn names, the earlier.
 */
export function wallToUtc(date: string, time: string, tz: string): number | null {
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  /* Try the offsets in force a day either side: across a change they differ,
     and one of them — or both, in the repeated hour — maps back to this wall
     time. Checking the round trip is what rejects the skipped hour. */
  const hits = new Set<number>();
  for (const probe of [naive - 86_400_000, naive, naive + 86_400_000]) {
    const t = naive - offsetMinutes(probe, tz) * 60000;
    const w = utcToWall(t, tz);
    if (w.date === date && w.time === time) hits.add(t);
  }
  if (!hits.size) return null;
  return Math.min(...hits);
}

/** "2026-10-11" plus n days, on the calendar alone (no zone, no DST). */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const toMin = (t: string): number | null => {
  if (!TIME_RE.test(t)) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const hhmm = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

/**
 * The free start times on one of the owner's dates, owner wall-clock.
 *
 * The grid starts at the day's opening and steps by the meeting plus the
 * buffer after it — what the booking page has always offered, so a page
 * published before this file reads the same. A slot is taken when the meeting
 * *with its buffers* overlaps anything busy (intervals, not equal start
 * times: a 60-minute booking at 09:00 also takes 09:30). The daily limit
 * closes the whole day once that many bookings are in it.
 */
export function ownerDaySlots(ownerDate: string, rules: SlotRules, busy: Busy[]): string[] {
  const day = rules.weekly[DAY_KEYS[weekdayOf(ownerDate)]];
  if (!day?.enabled) return [];
  const from = toMin(day.from);
  const to = day.to === '24:00' ? 1440 : toMin(day.to);
  if (from === null || to === null || to <= from) return [];
  const dur = Math.max(5, Math.round(rules.duration || 30));
  const before = Math.max(0, rules.bufferBefore ?? 0);
  const after = Math.max(0, rules.bufferAfter ?? 0);
  const onDay = busy.filter(b => b.date === ownerDate);
  if (rules.dailyLimit && rules.dailyLimit > 0 && onDay.length >= rules.dailyLimit) return [];
  const blocks = onDay
    .map(b => { const s = toMin(b.time); return s === null ? null : [s, s + Math.max(1, b.duration || dur)] as const; })
    .filter((x): x is readonly [number, number] => !!x);
  const out: string[] = [];
  for (let s = from; s + dur <= to; s += dur + after) {
    if (!blocks.some(([bs, be]) => s - before < be && bs < s + dur + after)) out.push(hhmm(s));
  }
  return out;
}

/**
 * The latest instant a slot may start: the end of the owner's own date
 * `windowDays` from today. Counted on the owner's calendar so "60 days ahead"
 * means the same days to every visitor.
 */
function windowEnd(rules: SlotRules, nowMs: number): number {
  const days = rules.windowDays ?? 365;
  const today = utcToWall(nowMs, rules.timezone).date;
  const last = addDays(today, days + 1);
  return wallToUtc(last, '00:00', rules.timezone) ?? wallToUtc(last, '01:00', rules.timezone) ?? Infinity;
}

/**
 * What a visitor in `visitorTz` can pick on their own date `visitorDate`.
 *
 * Their day can hold the end of one owner date and the start of the next (or,
 * between zones a full day apart, the one before), so the owner dates either
 * side are walked, every slot is turned into its instant, and the ones that
 * fall on the visitor's date are kept — earliest first, each said in both
 * zones.
 */
export function slotsForVisitorDay(visitorDate: string, visitorTz: string, rules: SlotRules, busy: Busy[], nowMs: number): Slot[] {
  const earliest = nowMs + Math.max(0, rules.minNoticeMin ?? 0) * 60000;
  const latest = windowEnd(rules, nowMs);
  const out: Slot[] = [];
  for (const ownerDate of [addDays(visitorDate, -1), visitorDate, addDays(visitorDate, 1)]) {
    for (const ownerTime of ownerDaySlots(ownerDate, rules, busy)) {
      const utc = wallToUtc(ownerDate, ownerTime, rules.timezone);
      if (utc === null || utc < earliest || utc >= latest) continue;
      const v = utcToWall(utc, visitorTz);
      if (v.date !== visitorDate) continue;
      out.push({ utc, ownerDate, ownerTime, visitorDate: v.date, visitorTime: v.time });
    }
  }
  return out.sort((a, b) => a.utc - b.utc);
}

/** The owner dates a visitor's dates from..to can draw on — what to fetch bookings for. */
export function ownerDatesFor(fromVisitorDate: string, toVisitorDate: string): { from: string; to: string } {
  return { from: addDays(fromVisitorDate, -1), to: addDays(toVisitorDate, 1) };
}

/**
 * Whether a booking for `ownerDate ownerTime` is one the page could have
 * offered: an open day, on the grid, free of everything in `busy`, past the
 * notice and inside the window. Answers the reason when it is not — the
 * server says it to the visitor rather than filing a booking at 03:00.
 */
export function slotProblem(ownerDate: string, ownerTime: string, rules: SlotRules, busy: Busy[], nowMs: number): string | null {
  if (!DATE_RE.test(ownerDate) || !TIME_RE.test(ownerTime)) return 'Pick a date and a time.';
  const utc = wallToUtc(ownerDate, ownerTime, rules.timezone);
  if (utc === null) return 'That time does not exist on that day (the clocks change). Pick another.';
  if (utc < nowMs + Math.max(0, rules.minNoticeMin ?? 0) * 60000) return 'That time is too soon to book — pick a later one.';
  if (utc >= windowEnd(rules, nowMs)) return 'That date is too far ahead to book yet.';
  const free = ownerDaySlots(ownerDate, rules, busy);
  if (free.includes(ownerTime)) return null;
  const open = ownerDaySlots(ownerDate, rules, []);
  return open.includes(ownerTime)
    ? 'That time was just booked — please pick another slot.'
    : 'That time is not one this page offers. Pick a time from the calendar.';
}

/** "GMT+7", "GMT-4" — the zone's offset at an instant, as people read it. */
export function offsetLabel(ms: number, tz: string): string {
  const off = offsetMinutes(ms, tz);
  if (off === 0) return 'GMT';
  const sign = off > 0 ? '+' : '-';
  const a = Math.abs(off);
  return `GMT${sign}${Math.floor(a / 60)}${a % 60 ? `:${pad(a % 60)}` : ''}`;
}

/** "Asia/Bangkok" → "Bangkok"; "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function zoneCity(tz: string): string {
  const last = tz.split('/').pop() ?? tz;
  return last.replace(/_/g, ' ');
}

/** "9:00 am" / "21:00" from "HH:MM". */
export function clockLabel(time: string, h24 = false): string {
  const m = toMin(time);
  if (m === null) return time;
  if (h24) return hhmm(m);
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${pad(m % 60)} ${h >= 12 ? 'pm' : 'am'}`;
}

/** UTC stamp for calendars: 20261012T130000Z. */
export function icsStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/* ── Video links ── */

export type VideoEmbed = { provider: 'youtube' | 'vimeo' | 'loom'; id: string; src: string };

/**
 * A YouTube, Vimeo or Loom link turned into the player address — or null.
 *
 * Only these three, by their id, because the address the page frames is then
 * one this code built: a pasted link is never framed as it was typed.
 */
export function videoEmbedOf(url: unknown): VideoEmbed | null {
  const s = String(url ?? '').trim();
  if (!s || s.length > 400) return null;
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '').toLowerCase();
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
    const id = host === 'youtu.be' ? u.pathname.slice(1).split('/')[0]
      : u.searchParams.get('v') || (u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)?.[1] ?? '');
    return /^[a-zA-Z0-9_-]{11}$/.test(id)
      ? { provider: 'youtube', id, src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1` } : null;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = u.pathname.match(/(?:^|\/)(\d{6,12})(?:\/|$)/);
    return m ? { provider: 'vimeo', id: m[1], src: `https://player.vimeo.com/video/${m[1]}?dnt=1` } : null;
  }
  if (host === 'loom.com') {
    const m = u.pathname.match(/\/(?:share|embed)\/([a-f0-9]{32})(?:\/|$)/i);
    return m ? { provider: 'loom', id: m[1].toLowerCase(), src: `https://www.loom.com/embed/${m[1].toLowerCase()}?hide_owner=true&hide_share=true` } : null;
  }
  return null;
}

/* ── The page's address ── */

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/** What is wrong with a typed address, or null. */
export function slugProblem(slug: string): string | null {
  if (!slug) return 'Give the page an address.';
  if (slug.length < 3) return 'Use at least three characters.';
  if (slug.length > 64) return 'Keep it to 64 characters.';
  if (!SLUG_RE.test(slug)) return 'Use lowercase letters, numbers and hyphens — not at the start or end.';
  if (/--/.test(slug)) return 'One hyphen at a time.';
  /* The operator's own call (lib/strategyCall.ts) is routed at /book/strategy-call
     before any workspace's page, so a workspace given it would never be seen. */
  if (slug === 'strategy-call') return 'That address is reserved. Pick another.';
  return null;
}

/** Typing tidied into an address: "Dr. Lee's Clinic!" → "dr-lee-s-clinic". */
export function slugify(v: string): string {
  return v.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/, '');
}
