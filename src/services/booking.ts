/**
 * booking.ts — client for public/api/booking.php: server-side bookings so the
 * public booking page works for real visitors (cross-device), plus the
 * publish/list endpoints the owner app uses. Every call degrades gracefully
 * when the backend isn't reachable (local/dev mode).
 */
import type { Booking, ScheduleAvailability } from '../types';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

async function call(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${API_BASE}/api/booking.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return await r.json();
  } catch { return null; }
}

/** Owner: publish the schedule so visitors (and the reminder engine) can use it. */
export async function publishBookingConfig(token: string, schedule: ScheduleAvailability): Promise<boolean> {
  const a = schedule.automations;
  let smtp: Record<string, unknown> = {};
  try { smtp = JSON.parse(window.localStorage.getItem('crm_smtp') || '{}') || {}; } catch { /* ignore */ }
  const res = await call({
    action: 'publish',
    token,
    public: {
      title: schedule.title,
      description: schedule.description,
      duration: schedule.duration,
      location: schedule.location,
      timezone: schedule.timezone,
      weekly: schedule.weekly,
      bufferBefore: schedule.bufferBefore,
      bufferAfter: schedule.bufferAfter,
      dailyLimit: schedule.dailyLimit,
      minNoticeMin: schedule.minNoticeMin ?? 120,
      windowDays: schedule.windowDays ?? 60,
      videoUrl: schedule.videoUrl ?? '',
      eventTypes: schedule.eventTypes ?? [],
    },
    private: {
      smtp,
      twilio: a ? { sid: a.twilioSid, token: a.twilioToken, from: a.twilioFrom } : {},
      automations: a ?? {},
    },
  });
  return !!(res && res.success);
}

/** Visitor: fetch the published schedule (null when backend/config missing). */
export async function fetchPublicConfig(): Promise<(Partial<ScheduleAvailability> & { weekly?: ScheduleAvailability['weekly'] }) | null> {
  const res = await call({ action: 'config' });
  if (!res || !res.success || !res.config) return null;
  return res.config as Partial<ScheduleAvailability> & { weekly?: ScheduleAvailability['weekly'] };
}

/** Visitor: booked slots for a given date. */
export async function fetchBookedSlots(date: string): Promise<{ time: string; duration: number }[] | null> {
  const res = await call({ action: 'slots', date });
  if (!res || !res.success) return null;
  return (res.booked as { time: string; duration: number }[]) ?? [];
}

export async function createRemoteBooking(payload: {
  eventTypeId?: string; slotDate: string; slotTime: string;
  guestName: string; guestEmail: string; guestPhone?: string; notes?: string; timezone?: string;
}): Promise<{ ok: boolean; id?: string; key?: string; error?: string }> {
  const res = await call({ action: 'create', ...payload });
  if (!res) return { ok: false, error: 'unreachable' };
  if (res.success) return { ok: true, id: res.id as string, key: res.key as string };
  return { ok: false, error: (res.error as string) || 'Booking failed.' };
}

export async function getRemoteBooking(id: string, key: string): Promise<Booking | null> {
  const res = await call({ action: 'get', id, key });
  return res && res.success ? (res.booking as Booking) : null;
}

export async function cancelRemoteBooking(id: string, key: string): Promise<boolean> {
  const res = await call({ action: 'cancel', id, key });
  return !!(res && res.success);
}

export async function rescheduleRemoteBooking(id: string, key: string, slotDate: string, slotTime: string): Promise<{ ok: boolean; error?: string }> {
  const res = await call({ action: 'reschedule', id, key, slotDate, slotTime });
  if (!res) return { ok: false, error: 'unreachable' };
  return res.success ? { ok: true } : { ok: false, error: (res.error as string) || 'Reschedule failed.' };
}

/** Owner: all server-side bookings. */
export async function listRemoteBookings(token: string): Promise<Booking[] | null> {
  const res = await call({ action: 'list', token });
  if (!res || !res.success) return null;
  return ((res.bookings as Booking[]) ?? []).map(b => ({ ...b, remote: true }));
}

export async function setRemoteBookingStatus(token: string, id: string, status: 'confirmed' | 'cancelled' | 'completed'): Promise<boolean> {
  const res = await call({ action: 'set_status', token, id, status });
  return !!(res && res.success);
}

/* ── Calendar helpers (confirmation screen) ── */

/** Build an .ics file for a booking and return it as a data blob. */
export function buildIcs(opts: { title: string; description?: string; location?: string; date: string; time: string; durationMin: number }): Blob {
  const [y, mo, da] = opts.date.split('-').map(Number);
  const [h, mi] = opts.time.split(':').map(Number);
  const start = new Date(y, mo - 1, da, h, mi);
  const end = new Date(start.getTime() + opts.durationMin * 60000);
  const stamp = (dt: Date) =>
    `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}${String(dt.getMinutes()).padStart(2, '0')}00`;
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CRMPro//Booking//EN',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@crmpro-booking`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(opts.title)}`,
    opts.description ? `DESCRIPTION:${esc(opts.description)}` : '',
    opts.location ? `LOCATION:${esc(opts.location)}` : '',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
  return new Blob([ics], { type: 'text/calendar' });
}

/** Google Calendar "add event" URL. */
export function googleCalendarUrl(opts: { title: string; description?: string; location?: string; date: string; time: string; durationMin: number }): string {
  const [y, mo, da] = opts.date.split('-').map(Number);
  const [h, mi] = opts.time.split(':').map(Number);
  const start = new Date(y, mo - 1, da, h, mi);
  const end = new Date(start.getTime() + opts.durationMin * 60000);
  const s = (dt: Date) =>
    `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}${String(dt.getMinutes()).padStart(2, '0')}00`;
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: opts.title,
    dates: `${s(start)}/${s(end)}`,
    details: opts.description ?? '',
    location: opts.location ?? '',
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
