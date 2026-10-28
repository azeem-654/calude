/**
 * The operator's own strategy call — the rules, shared by the Worker and the
 * public page.
 *
 * A customer's booking page (routes/booking.ts) belongs to a workspace. This
 * one belongs to the install: prospects arriving from protectedcentral.com,
 * /hvac, /roofing or /medical-billing book a call with the owner. So its
 * settings live in their own table, are read and written only by the install
 * owner, and never appear in any workspace.
 *
 * The clock is bookingTime.ts — the same DST-safe conversion every booking
 * page uses — with what this page adds on top: several windows a day, dates
 * closed or opened differently, a choice of length, and the source a visitor
 * came from.
 *
 * Pure and import-free apart from bookingTime.ts (itself pure), because the
 * browser compiles this file too: the times a visitor is offered and the check
 * the server makes on the one they pick are one implementation.
 * `npm run test:strategycall`.
 */
import { addDays, DAY_KEYS, isZone, ownerDaySlots, utcToWall, wallToUtc, weekdayOf, type Busy, type DayKey, type SlotRules } from './bookingTime';

export const STRATEGY_CALL_SLUG = 'strategy-call';
export const STRATEGY_CALL_PATH = `/book/${STRATEGY_CALL_SLUG}`;

/** Where a visitor can come from. Anything else is recorded as "main". */
export const SITE_SOURCES = ['main', 'hvac', 'roofing', 'medical-billing', 'ecommerce'] as const;
export type SiteSource = typeof SITE_SOURCES[number];
export const SOURCE_LABEL: Record<SiteSource, string> = {
  main: 'Protected Central website', hvac: 'HVAC site', roofing: 'Roofing site', 'medical-billing': 'Medical billing site', ecommerce: 'E-commerce services page',
};
/** Where "back" goes from the booking page — the site the visitor came from, never another one. */
export const SOURCE_HOME: Record<SiteSource, string> = { main: '/', hvac: '/hvac', roofing: '/roofing', 'medical-billing': '/medical-billing', ecommerce: '/ecommerce-management-services' };

export const DURATION_CHOICES = [15, 30, 45, 60] as const;
export const MEETING_TYPES = ['video_link', 'phone', 'in_person'] as const;
export type MeetingType = typeof MEETING_TYPES[number];

export interface Window { from: string; to: string }
export interface Question { id: string; label: string; required: boolean; long: boolean }

export interface StrategySettings {
  enabled: boolean;
  title: string;
  description: string;
  hostName: string;
  hostRole: string;
  durations: number[];
  defaultDuration: number;
  timezone: string;
  /** Closed days have no windows. */
  weekly: Record<DayKey, Window[]>;
  minNoticeMin: number;
  windowDays: number;
  bufferBefore: number;
  bufferAfter: number;
  /** 0 = no limit. */
  dailyLimit: number;
  /** Owner dates with no bookings at all. */
  blackoutDates: string[];
  /** Owner dates with their own hours instead of the week's. */
  overrides: { date: string; windows: Window[] }[];
  questions: Question[];
  meetingType: MeetingType;
  /** A video room link, a phone instruction, an address — shown after booking. */
  meetingDetails: string;
  confirmEmail: boolean;
  /** Hours before the call a reminder goes; 0 = none. */
  reminderHours: number;
  notifyOnBook: boolean;
  notifyEmail: string;
}

const W = (from: string, to: string): Window[] => [{ from, to }];

export const DEFAULT_SETTINGS: StrategySettings = {
  /* On (since 2026-10-26, when the owner asked for it switched on): every
     "Book a strategy call" button on the sites leads here, and switched off
     they all fell back to "Write to us". The hours below are the ones the
     owner was told about — weekdays 9–5 New York time, a day's notice — and
     migration 0078 turns on a row already saved switched off. */
  enabled: true,
  title: 'Strategy call',
  description: 'A conversation about your business, how enquiries reach you now and whether our service is a fit. No obligation.',
  hostName: '',
  hostRole: '',
  durations: [30],
  defaultDuration: 30,
  timezone: 'America/New_York',
  weekly: { sun: [], mon: W('09:00', '17:00'), tue: W('09:00', '17:00'), wed: W('09:00', '17:00'), thu: W('09:00', '17:00'), fri: W('09:00', '17:00'), sat: [] },
  minNoticeMin: 24 * 60,
  windowDays: 30,
  bufferBefore: 0,
  bufferAfter: 15,
  dailyLimit: 6,
  blackoutDates: [],
  overrides: [],
  questions: [
    { id: 'q1', label: 'What would you like to get out of the call?', required: true, long: true },
    { id: 'q2', label: 'How do new enquiries reach you today?', required: false, long: false },
  ],
  meetingType: 'video_link',
  meetingDetails: '',
  confirmEmail: true,
  reminderHours: 24,
  notifyOnBook: true,
  notifyEmail: '',
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const EMAIL_RE = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z]{2,}$/i;
const toMin = (t: string) => (t === '24:00' ? 1440 : Number(t.slice(0, 2)) * 60 + Number(t.slice(3)));

export interface FieldError { field: string; message: string }

const str = (v: unknown, max: number) => String(v ?? '').replace(/\p{Cc}/gu, ' ').trim().slice(0, max);
const int = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

function cleanWindows(v: unknown, field: string, errors: FieldError[]): Window[] {
  if (!Array.isArray(v)) return [];
  const out: Window[] = [];
  for (const w of v.slice(0, 4)) {
    const from = str((w as Window)?.from, 5), to = str((w as Window)?.to, 5);
    if (!TIME_RE.test(from) || !TIME_RE.test(to) || toMin(to) <= toMin(from)) {
      errors.push({ field, message: `Each window needs a start before its end (got ${from || '?'}–${to || '?'}).` });
      continue;
    }
    out.push({ from, to });
  }
  out.sort((a, b) => toMin(a.from) - toMin(b.from));
  for (let i = 1; i < out.length; i++) {
    if (toMin(out[i].from) < toMin(out[i - 1].to)) errors.push({ field, message: 'Two windows on one day overlap. Join them or move one.' });
  }
  return out;
}

/**
 * Settings as typed → settings the server will keep, or the boxes that are
 * wrong. Every number is clamped, every list capped, a zone Intl does not know
 * is refused rather than becoming UTC, and nothing the visitor will read can
 * carry a link but the meeting room.
 */
export function cleanSettings(input: unknown): { settings: StrategySettings; errors: FieldError[] } {
  const d = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const errors: FieldError[] = [];
  const s: StrategySettings = { ...DEFAULT_SETTINGS };

  s.enabled = d.enabled === true;
  s.title = str(d.title, 80) || DEFAULT_SETTINGS.title;
  s.description = str(d.description, 600);
  s.hostName = str(d.hostName, 80);
  s.hostRole = str(d.hostRole, 80);

  const durs = Array.isArray(d.durations) ? d.durations.map(Number).filter(n => (DURATION_CHOICES as readonly number[]).includes(n)) : [];
  s.durations = [...new Set(durs)].sort((a, b) => a - b);
  if (!s.durations.length) { errors.push({ field: 'strategy.durations', message: 'Offer at least one meeting length.' }); s.durations = [30]; }
  s.defaultDuration = s.durations.includes(Number(d.defaultDuration)) ? Number(d.defaultDuration) : s.durations[0];

  if (!isZone(d.timezone)) errors.push({ field: 'strategy.timezone', message: 'Pick a time zone from the list.' });
  else s.timezone = d.timezone;

  const weekly = (d.weekly && typeof d.weekly === 'object' ? d.weekly : {}) as Record<string, unknown>;
  s.weekly = Object.fromEntries(DAY_KEYS.map(k => [k, cleanWindows(weekly[k], `strategy.weekly.${k}`, errors)])) as Record<DayKey, Window[]>;

  s.minNoticeMin = int(d.minNoticeMin, 0, 14 * 24 * 60, DEFAULT_SETTINGS.minNoticeMin);
  s.windowDays = int(d.windowDays, 1, 180, DEFAULT_SETTINGS.windowDays);
  s.bufferBefore = int(d.bufferBefore, 0, 120, 0);
  s.bufferAfter = int(d.bufferAfter, 0, 120, 0);
  s.dailyLimit = int(d.dailyLimit, 0, 48, 0);

  const blackout = Array.isArray(d.blackoutDates) ? d.blackoutDates.map(x => str(x, 10)) : [];
  if (blackout.some(x => !DATE_RE.test(x))) errors.push({ field: 'strategy.blackoutDates', message: 'Dates are written YYYY-MM-DD.' });
  s.blackoutDates = [...new Set(blackout.filter(x => DATE_RE.test(x)))].sort().slice(0, 200);

  const ov = Array.isArray(d.overrides) ? d.overrides.slice(0, 100) : [];
  const seen = new Set<string>();
  s.overrides = [];
  for (const o of ov) {
    const date = str((o as { date?: unknown })?.date, 10);
    if (!DATE_RE.test(date)) { errors.push({ field: 'strategy.overrides', message: 'Each special date is written YYYY-MM-DD.' }); continue; }
    if (seen.has(date)) { errors.push({ field: 'strategy.overrides', message: `${date} has two sets of special hours.` }); continue; }
    seen.add(date);
    s.overrides.push({ date, windows: cleanWindows((o as { windows?: unknown }).windows, 'strategy.overrides', errors) });
  }
  s.overrides.sort((a, b) => a.date.localeCompare(b.date));

  const qs = Array.isArray(d.questions) ? d.questions.slice(0, 6) : [];
  s.questions = qs
    .map((q, i) => ({ id: `q${i + 1}`, label: str((q as Question)?.label, 160), required: (q as Question)?.required === true, long: (q as Question)?.long === true }))
    .filter(q => q.label);

  s.meetingType = (MEETING_TYPES as readonly string[]).includes(String(d.meetingType)) ? d.meetingType as MeetingType : 'video_link';
  s.meetingDetails = str(d.meetingDetails, 300);
  if (s.meetingType === 'video_link' && s.meetingDetails && !/^https:\/\/[^\s]+$/.test(s.meetingDetails)) {
    errors.push({ field: 'strategy.meetingDetails', message: 'A video room is an https:// link — or leave it empty and send the link yourself before the call.' });
  }
  if (s.meetingType === 'phone' && /https?:\/\//i.test(s.meetingDetails)) {
    errors.push({ field: 'strategy.meetingDetails', message: 'A phone call has no link. Say how the call happens instead.' });
  }

  s.confirmEmail = d.confirmEmail !== false;
  s.reminderHours = int(d.reminderHours, 0, 72, 0);
  s.notifyOnBook = d.notifyOnBook === true;
  s.notifyEmail = str(d.notifyEmail, 254);
  if (s.notifyEmail && !EMAIL_RE.test(s.notifyEmail)) errors.push({ field: 'strategy.notifyEmail', message: 'That is not an email address.' });

  if (s.enabled && !DAY_KEYS.some(k => s.weekly[k].length) && !s.overrides.some(o => o.windows.length)) {
    errors.push({ field: 'strategy.weekly', message: 'Bookings are switched on but no day has any hours.' });
  }
  return { settings: s, errors };
}

/** What a visitor may read. Notification addresses and reminder settings stay private. */
export function publicSettings(s: StrategySettings) {
  return {
    enabled: s.enabled, title: s.title, description: s.description, hostName: s.hostName, hostRole: s.hostRole,
    durations: s.durations, defaultDuration: s.defaultDuration, timezone: s.timezone,
    minNoticeMin: s.minNoticeMin, windowDays: s.windowDays, questions: s.questions, meetingType: s.meetingType,
  };
}
export type PublicSettings = ReturnType<typeof publicSettings>;

/** The windows open on one of the owner's dates. */
export function windowsOn(ownerDate: string, s: Pick<StrategySettings, 'weekly' | 'blackoutDates' | 'overrides'>): Window[] {
  if (s.blackoutDates.includes(ownerDate)) return [];
  const o = s.overrides.find(x => x.date === ownerDate);
  if (o) return o.windows;
  return s.weekly[DAY_KEYS[weekdayOf(ownerDate)]] ?? [];
}

type SlotSettings = Pick<StrategySettings, 'weekly' | 'blackoutDates' | 'overrides' | 'timezone' | 'bufferBefore' | 'bufferAfter' | 'dailyLimit' | 'minNoticeMin' | 'windowDays'>;

/** The free start times on one owner date, owner wall-clock, every window joined. */
export function ownerSlots(ownerDate: string, s: SlotSettings, duration: number, busy: Busy[]): string[] {
  const dk = DAY_KEYS[weekdayOf(ownerDate)];
  const out: string[] = [];
  for (const w of windowsOn(ownerDate, s)) {
    const rules: SlotRules = {
      timezone: s.timezone, duration, bufferBefore: s.bufferBefore, bufferAfter: s.bufferAfter,
      dailyLimit: s.dailyLimit || undefined, weekly: { [dk]: { enabled: true, from: w.from, to: w.to } },
    };
    for (const t of ownerDaySlots(ownerDate, rules, busy)) if (!out.includes(t)) out.push(t);
  }
  return out.sort();
}

function windowEnd(s: SlotSettings, nowMs: number): number {
  const last = addDays(utcToWall(nowMs, s.timezone).date, s.windowDays + 1);
  return wallToUtc(last, '00:00', s.timezone) ?? wallToUtc(last, '01:00', s.timezone) ?? Infinity;
}

export interface OfferedSlot { utc: number; ownerDate: string; ownerTime: string; visitorTime: string }

/** What a visitor in `visitorTz` can pick on their own date. */
export function visitorSlots(visitorDate: string, visitorTz: string, s: SlotSettings, duration: number, busy: Busy[], nowMs: number): OfferedSlot[] {
  const earliest = nowMs + s.minNoticeMin * 60000;
  const latest = windowEnd(s, nowMs);
  const out: OfferedSlot[] = [];
  for (const ownerDate of [addDays(visitorDate, -1), visitorDate, addDays(visitorDate, 1)]) {
    for (const ownerTime of ownerSlots(ownerDate, s, duration, busy)) {
      const utc = wallToUtc(ownerDate, ownerTime, s.timezone);
      if (utc === null || utc < earliest || utc >= latest) continue;
      const v = utcToWall(utc, visitorTz);
      if (v.date === visitorDate) out.push({ utc, ownerDate, ownerTime, visitorTime: v.time });
    }
  }
  return out.sort((a, b) => a.utc - b.utc);
}

/** Why a picked time cannot be booked, or null. The server asks this immediately before writing. */
export function slotRefusal(ownerDate: string, ownerTime: string, s: SlotSettings, duration: number, busy: Busy[], nowMs: number): string | null {
  if (!DATE_RE.test(ownerDate) || !/^\d{2}:\d{2}$/.test(ownerTime)) return 'Pick a date and a time.';
  const utc = wallToUtc(ownerDate, ownerTime, s.timezone);
  if (utc === null) return 'That time does not exist on that day (the clocks change). Pick another.';
  if (utc < nowMs + s.minNoticeMin * 60000) return 'That time is too soon to book — pick a later one.';
  if (utc >= windowEnd(s, nowMs)) return 'That date is too far ahead to book yet.';
  if (ownerSlots(ownerDate, s, duration, busy).includes(ownerTime)) return null;
  return ownerSlots(ownerDate, s, duration, []).includes(ownerTime)
    ? 'That time was just booked — please pick another.'
    : 'That time is not offered. Pick one from the calendar.';
}

/* ── Where the visitor came from ── */

export interface BookingSource {
  site: SiteSource;
  utm: Partial<Record<'source' | 'medium' | 'campaign' | 'content' | 'term', string>>;
  /** Click ids the ad platform put on the link — kept as given, never looked up. */
  clickIds: Partial<Record<'gclid' | 'fbclid' | 'msclkid', string>>;
  referrer: string;
}

/** A source from untrusted input: known site names only, short plain values only. */
export function cleanSource(v: unknown): BookingSource {
  const d = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const val = (x: unknown) => String(x ?? '').replace(/[^\w.\-+~ /:]/g, '').slice(0, 120);
  const pick = <K extends string>(o: unknown, keys: readonly K[]) => {
    const src = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>;
    const out: Partial<Record<K, string>> = {};
    for (const k of keys) { const x = val(src[k]); if (x) out[k] = x; }
    return out;
  };
  const site = (SITE_SOURCES as readonly string[]).includes(String(d.site)) ? d.site as SiteSource : 'main';
  let referrer = '';
  try { const u = new URL(String(d.referrer ?? '')); if (/^https?:$/.test(u.protocol)) referrer = `${u.origin}${u.pathname}`.slice(0, 200); } catch { /* none */ }
  return {
    site,
    utm: pick(d.utm, ['source', 'medium', 'campaign', 'content', 'term'] as const),
    clickIds: pick(d.clickIds, ['gclid', 'fbclid', 'msclkid'] as const),
    referrer,
  };
}

/** Answers to the owner's questions, by id; a required one left empty is named. */
export function cleanAnswers(questions: Question[], v: unknown): { answers: Record<string, string>; error: FieldError | null } {
  const d = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const answers: Record<string, string> = {};
  for (const q of questions) {
    const a = String(d[q.id] ?? '').replace(/\p{Cc}/gu, c => (c === '\n' || c === '\t' ? c : '')).trim().slice(0, q.long ? 2000 : 300);
    if (!a && q.required) return { answers, error: { field: `strategy.answer.${q.id}`, message: `Please answer: ${q.label}` } };
    if (a) answers[q.id] = a;
  }
  return { answers, error: null };
}
