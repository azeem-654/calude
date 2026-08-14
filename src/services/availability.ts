/**
 * One answer to "is the owner free then?".
 *
 * Three different things can occupy the same hour and until now none of them
 * knew about the others:
 *
 *   • appointments — meetings, online or in person, made inside the CRM
 *   • bookings     — the same thing, made by a visitor on the public page
 *   • events       — what the owner puts in their own calendar to work around
 *
 * The booking page decided availability from bookings alone, so a visitor could
 * book straight over a meeting already in the calendar. It also compared start
 * times for equality, which means a 60-minute booking at 09:00 left 09:30 look-
 * ing free. Both are fixed here by turning everything into intervals and asking
 * whether they intersect, which is the only question that has ever mattered.
 *
 * Everything below works in owner-local minutes-from-midnight. Times arrive in
 * a mix of 24h and 12h from older records, so they go through one parser.
 */
import { minutesOf } from './dayPlan';
import type { Appointment, Booking, CalendarEvent, ScheduleAvailability } from '../types';

export type BusyKind = 'appointment' | 'booking' | 'event';

/** One occupied interval on one day, whatever produced it. */
export interface BusyBlock {
  id: string;
  kind: BusyKind;
  title: string;
  /** Owner-timezone calendar date, YYYY-MM-DD. */
  date: string;
  /** Minutes from midnight, owner-local. */
  startMin: number;
  endMin: number;
  /**
   * Whether this actually stops a slot being booked.
   *
   * A calendar event can be marked free — "reminder: send the quote" does not
   * mean the hour is gone — so the calendar shows it and availability ignores it.
   */
  blocking: boolean;
  contactName?: string;
  status?: string;
  /** The record this came from, for opening it from the calendar. */
  sourceId: string;
}

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export const dateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "09:30" from minutes. 24h, because that is what every record now stores. */
export const hhmm = (min: number): string =>
  `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.round(min) % 60).padStart(2, '0')}`;

/** "9:30 am" — for anything a person reads. */
export function clock12(min: number): string {
  const h24 = Math.floor(min / 60) % 24;
  const m = Math.round(min) % 60;
  const suffix = h24 >= 12 ? 'pm' : 'am';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Half-open intervals: [aStart, aEnd) against [bStart, bEnd). */
export const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number): boolean =>
  aStart < bEnd && bStart < aEnd;

/* ── Turning records into intervals ── */

/**
 * These statuses free the slot again.
 *
 * A cancelled meeting that still blocked its hour would quietly shrink the
 * owner's availability every time somebody cancelled.
 */
const DEAD_APPOINTMENT = new Set(['cancelled', 'no-show']);
const DEAD_BOOKING = new Set(['cancelled', 'rescheduled']);

function block(
  kind: BusyKind, id: string, title: string, date: string,
  time: string, durationMin: number, extra: Partial<BusyBlock> = {},
): BusyBlock | null {
  const start = minutesOf(time);
  if (start === null || !date) return null;
  const dur = Number.isFinite(durationMin) && durationMin > 0 ? durationMin : 30;
  return {
    id: `${kind}-${id}`,
    kind,
    title,
    date,
    startMin: start,
    endMin: start + dur,
    blocking: true,
    sourceId: id,
    ...extra,
  };
}

export interface Sources {
  appointments: Appointment[];
  bookings: Booking[];
  events: CalendarEvent[];
}

/**
 * Everything occupying the owner's calendar, as intervals.
 *
 * A booking that was turned into an appointment is counted once: the two
 * records describe one meeting, and double-counting would make the day look
 * twice as full as it is.
 */
export function busyBlocks(sources: Sources): BusyBlock[] {
  const out: BusyBlock[] = [];

  for (const a of sources.appointments) {
    if (DEAD_APPOINTMENT.has(a.status)) continue;
    const b = block('appointment', a.id, a.title || a.type || 'Meeting', a.date, a.time, a.duration, {
      contactName: a.contactName,
      status: a.status,
    });
    if (b) out.push(b);
  }

  const linked = new Set(sources.appointments.map(a => a.id));
  for (const bk of sources.bookings) {
    if (DEAD_BOOKING.has(bk.status)) continue;
    // Already represented by its appointment.
    if (bk.appointmentId && linked.has(bk.appointmentId)) continue;
    const b = block('booking', bk.id, bk.eventTypeName || 'Booked meeting', bk.slotDate, bk.slotTime, bk.duration ?? 30, {
      contactName: bk.guestName,
      status: bk.status,
    });
    if (b) out.push(b);
  }

  for (const e of sources.events) {
    if (e.status === 'cancelled') continue;
    const b = block('event', e.id, e.title, e.date, e.time, e.duration, {
      contactName: e.contactName,
      status: e.status,
      blocking: e.busy !== false,
    });
    if (b) out.push(b);
  }

  return out.sort((x, y) => x.date.localeCompare(y.date) || x.startMin - y.startMin);
}

export const blocksOn = (blocks: BusyBlock[], date: string): BusyBlock[] =>
  blocks.filter(b => b.date === date);

/* ── Conflicts ── */

export interface Candidate {
  date: string;
  /** 24h HH:MM or 12h; both are parsed. */
  time: string;
  durationMin: number;
  /** When editing, the block this candidate replaces — it cannot clash with itself. */
  ignoreId?: string;
}

/**
 * What a proposed meeting would run into.
 *
 * Returned rather than thrown, because the answer is not always "refuse": the
 * calendar warns and lets a person double-book deliberately, while the public
 * booking page simply never offers the slot.
 */
export function conflictsFor(candidate: Candidate, blocks: BusyBlock[]): BusyBlock[] {
  const start = minutesOf(candidate.time);
  if (start === null) return [];
  const end = start + Math.max(1, candidate.durationMin);
  return blocksOn(blocks, candidate.date).filter(b =>
    b.blocking
    && b.sourceId !== candidate.ignoreId
    && overlaps(start, end, b.startMin, b.endMin));
}

/** A sentence naming the clash, for a warning a person can act on. */
export function describeConflicts(conflicts: BusyBlock[]): string {
  if (!conflicts.length) return '';
  const first = conflicts[0];
  const label = `${first.title}${first.contactName ? ` with ${first.contactName}` : ''} at ${clock12(first.startMin)}`;
  return conflicts.length === 1
    ? `That overlaps ${label}.`
    : `That overlaps ${label}, and ${conflicts.length - 1} other${conflicts.length === 2 ? '' : 's'}.`;
}

/* ── Free slots ── */

export interface SlotOptions {
  /** The bookable window for this weekday. */
  from: string;
  to: string;
  durationMin: number;
  /** Kept clear before and after each meeting. */
  bufferBefore?: number;
  bufferAfter?: number;
  /** How far apart slots start. Defaults to the meeting length. */
  stepMin?: number;
}

/**
 * The slots actually offerable on one day.
 *
 * The buffers are applied to the *candidate*, not to the existing blocks: a
 * 15-minute buffer means nothing else may start within 15 minutes either side
 * of this meeting, which is the same as widening the candidate's interval by
 * the buffer at each end and asking whether that intersects anything.
 */
export function freeSlots(date: string, blocks: BusyBlock[], o: SlotOptions): string[] {
  const from = minutesOf(o.from);
  const to = minutesOf(o.to);
  if (from === null || to === null || to <= from) return [];

  const dur = Math.max(1, o.durationMin);
  const step = Math.max(1, o.stepMin ?? dur);
  const before = Math.max(0, o.bufferBefore ?? 0);
  const after = Math.max(0, o.bufferAfter ?? 0);
  const onDay = blocksOn(blocks, date).filter(b => b.blocking);

  const out: string[] = [];
  for (let start = from; start + dur <= to; start += step) {
    const clashes = onDay.some(b => overlaps(start - before, start + dur + after, b.startMin, b.endMin));
    if (!clashes) out.push(hhmm(start));
  }
  return out;
}

/** Slots for one date, honouring the weekly schedule and any day being off. */
export function slotsForDate(
  date: Date, blocks: BusyBlock[], cfg: Pick<ScheduleAvailability, 'weekly' | 'duration' | 'bufferBefore' | 'bufferAfter'>,
  durationOverride?: number,
): string[] {
  const day = cfg.weekly[DAY_KEYS[date.getDay()]];
  if (!day?.enabled) return [];
  return freeSlots(dateKey(date), blocks, {
    from: day.from,
    to: day.to,
    durationMin: durationOverride ?? cfg.duration,
    bufferBefore: cfg.bufferBefore,
    bufferAfter: cfg.bufferAfter,
  });
}

/* ── Laying a day out ── */

export interface PositionedBlock extends BusyBlock {
  /** 0-based column among blocks that overlap it. */
  column: number;
  /** How many columns the overlapping group needs. */
  columns: number;
}

/**
 * Side-by-side positions for blocks that overlap.
 *
 * Without this, two meetings at the same hour draw on top of each other and one
 * of them is invisible — which on a calendar is the difference between "I have
 * a clash" and "I have no idea I have a clash".
 */
export function layOutDay(blocks: BusyBlock[]): PositionedBlock[] {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const out: PositionedBlock[] = [];

  let group: PositionedBlock[] = [];
  let groupEnd = -1;

  const closeGroup = () => {
    const columns = group.reduce((n, g) => Math.max(n, g.column + 1), 0);
    for (const g of group) g.columns = columns;
    out.push(...group);
    group = [];
    groupEnd = -1;
  };

  for (const b of sorted) {
    if (group.length && b.startMin >= groupEnd) closeGroup();
    // First free column in this group.
    const taken = new Set(group.filter(g => overlaps(b.startMin, b.endMin, g.startMin, g.endMin)).map(g => g.column));
    let column = 0;
    while (taken.has(column)) column += 1;
    group.push({ ...b, column, columns: 1 });
    groupEnd = Math.max(groupEnd, b.endMin);
  }
  if (group.length) closeGroup();

  return out;
}

/** How full a day is, for the small print under a date. */
export function dayLoad(blocks: BusyBlock[], date: string): { count: number; minutes: number } {
  const onDay = blocksOn(blocks, date);
  return {
    count: onDay.length,
    minutes: onDay.filter(b => b.blocking).reduce((n, b) => n + (b.endMin - b.startMin), 0),
  };
}
