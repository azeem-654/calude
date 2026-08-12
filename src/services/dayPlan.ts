/**
 * Today, as a timeline.
 *
 * The arithmetic lives here rather than in the component because the awkward
 * part is not the drawing, it is the times: appointments are stored as a
 * wall-clock string and the type warns that older records may hold a 12-hour
 * one. A bar that silently plots "2:00 PM" at two in the morning would look
 * perfectly fine and be wrong all day.
 */
import type { Appointment } from '../types';

/** Local calendar date as YYYY-MM-DD — never toISOString, which is UTC. */
export function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Minutes past midnight, accepting both the current 24-hour form and the 12-hour
 * one older records were written in. Returns null rather than a guess when the
 * string is not a time at all.
 */
export function minutesOf(raw: string): number | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || min > 59) return null;
  const suffix = m[3]?.toLowerCase();
  if (suffix) {
    if (h < 1 || h > 12) return null;
    if (suffix === 'pm' && h !== 12) h += 12;
    if (suffix === 'am' && h === 12) h = 0;
  } else if (h > 23) return null;
  return h * 60 + min;
}

/** "2:00 pm" — the label the cards and the timeline both use. */
export function clockLabel(totalMin: number): string {
  const h24 = Math.floor(totalMin / 60) % 24;
  const min = totalMin % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min).padStart(2, '0')} ${h24 < 12 ? 'am' : 'pm'}`;
}

export interface DaySlot {
  appt: Appointment;
  startMin: number;
  endMin: number;
}

/** Today's meetings, in order, with anything unparseable left out. */
export function slotsForDay(appointments: Appointment[], day: string): DaySlot[] {
  return appointments
    .filter(a => a.date === day && a.status !== 'cancelled')
    .map(a => {
      const startMin = minutesOf(a.time);
      if (startMin === null) return null;
      const dur = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : 30;
      return { appt: a, startMin, endMin: Math.min(startMin + dur, 24 * 60) };
    })
    .filter((s): s is DaySlot => s !== null)
    .sort((a, b) => a.startMin - b.startMin);
}

export interface DayWindow {
  startMin: number;
  endMin: number;
}

/**
 * The span the bar covers. A working day by default, widened to whatever the
 * meetings and the current time actually need — a 7am call must not be drawn
 * off the left edge, and the bar must not start after "now" either.
 */
export function dayWindow(slots: DaySlot[], nowMin: number, from = 8 * 60, to = 20 * 60): DayWindow {
  let start = from;
  let end = to;
  for (const s of slots) {
    start = Math.min(start, s.startMin);
    end = Math.max(end, s.endMin);
  }
  start = Math.min(start, nowMin);
  end = Math.max(end, nowMin);
  // Round out to whole hours so the tick labels land on the hour.
  start = Math.max(0, Math.floor(start / 60) * 60);
  end = Math.min(24 * 60, Math.ceil(end / 60) * 60);
  // Never let it collapse to nothing.
  if (end - start < 120) end = Math.min(24 * 60, start + 120);
  return { startMin: start, endMin: end };
}

/** Where a minute sits in the window, 0–100. */
export function positionIn(win: DayWindow, minute: number): number {
  const span = win.endMin - win.startMin;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(100, ((minute - win.startMin) / span) * 100));
}

/** Whole-hour ticks across the window, thinned so labels never collide. */
export function hourTicks(win: DayWindow, max = 8): number[] {
  const hours: number[] = [];
  for (let m = win.startMin; m <= win.endMin; m += 60) hours.push(m);
  if (hours.length <= max) return hours;
  const step = Math.ceil(hours.length / max);
  return hours.filter((_, i) => i % step === 0 || i === hours.length - 1);
}

export interface DayProgress {
  /** Meetings whose end time has passed. */
  done: number;
  total: number;
  /** The one happening now, if any. */
  current?: DaySlot;
  /** The next one that has not started. */
  next?: DaySlot;
  percent: number;
}

export function dayProgress(slots: DaySlot[], nowMin: number): DayProgress {
  const done = slots.filter(s => s.endMin <= nowMin).length;
  const current = slots.find(s => s.startMin <= nowMin && nowMin < s.endMin);
  const next = slots.find(s => s.startMin > nowMin);
  return {
    done,
    total: slots.length,
    current,
    next,
    percent: slots.length ? Math.round((done / slots.length) * 100) : 0,
  };
}
