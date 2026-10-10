/**
 * booking.ts — client for api/booking.php: server-side bookings so the
 * public booking page works for real visitors (cross-device), plus the
 * publish/list endpoints the owner app uses. Every call degrades gracefully
 * when the backend isn't reachable (local/dev mode).
 */
import type { Booking, ScheduleAvailability } from '../types';
import { API_BASE } from './apiBase';
import { customerBusinessName, getActiveAccountId } from './tenancy';
import { getSession } from './auth';
import { withoutTwilio } from './legacyTwilio';


async function call(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${API_BASE}/api/booking.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return await r.json();
  } catch { return null; }
}

/** An untouched default slug ('meeting' — whoever published first holds it) becomes the business's own name with a short tail. */
export function bookingSlugFor(s: ScheduleAvailability, name = ''): string {
  if (s.slug && s.slug !== 'meeting') return s.slug;
  const base = (name || customerBusinessName()).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'meet';
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Owner: publish the schedule so visitors (and the reminder engine) can use it.
 *
 * The workspace and the slug are what the server files the page under, and
 * neither was ever sent: every publish was refused with "a workspace is
 * required", so no booking page on the install had ever gone live and every
 * /book/<slug> link answered "this booking link does not exist". The refusal
 * comes back with it, because "taken by another workspace" is something the
 * owner can act on and "could not publish" is not.
 */
export async function publishBookingConfig(token: string, schedule: ScheduleAvailability): Promise<{ ok: boolean; error?: string; field?: string }> {
  const a = withoutTwilio(schedule).automations;
  const res = await call({
    action: 'publish',
    token,
    accountId: getActiveAccountId() ?? '',
    public: {
      slug: schedule.slug,
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
      /* Sent with the rest of the public config. A field the editor saves and
         publish forgets is one the visitor never sees, which reads as the
         setting not working. */
      imageUrl: schedule.imageUrl ?? '',
      photoUrl: schedule.photoUrl ?? '',
      logoUrl: schedule.logoUrl ?? '',
      videoFileUrl: schedule.videoFileUrl ?? '',
      hostName: schedule.hostName ?? '',
      /* Said on the page beside the photo when no host name is set. */
      businessName: customerBusinessName(),
      bullets: (schedule.bullets ?? []).map(b => b.trim()).filter(Boolean),
      eventTypes: schedule.eventTypes ?? [],
    },
    private: {
      /* The SMTP blob that used to be sent here is gone. worker/src/routes/
         booking.ts never read it — reminders resolve the workspace's own
         mailbox server-side — so it was a copy of the credentials travelling
         for no reason at all. */
      /* The Twilio SID and token that followed here are gone the same way:
         nothing on the server read them, and a credential has no business in
         a blob stored as plain text. Texts are sent from the workspace's
         encrypted sender (services/smsStore.ts). */
      automations: a ?? {},
    },
  });
  if (!res) return { ok: false, error: 'The server could not be reached.' };
  return res.success ? { ok: true } : {
    ok: false, error: String(res.error ?? res.message ?? 'The booking page could not be published.'),
    field: typeof res.field === 'string' ? res.field : undefined,
  };
}

/**
 * Owner: is this address free? Asked as they type, so "taken" is said on the
 * box rather than discovered when a save is refused. `null` when the server
 * could not be asked — which the box says, rather than calling it free.
 */
export async function checkBookingSlug(token: string, slug: string): Promise<{ available: boolean; reason?: string; yours?: boolean } | null> {
  const res = await call({ action: 'slug_check', token, accountId: getActiveAccountId() ?? '', slug });
  if (!res || !res.success) return null;
  return { available: res.available === true, reason: res.reason as string | undefined, yours: res.yours === true };
}

export type BookingMediaKind = 'photo' | 'logo' | 'video';

/**
 * Owner: upload the page's photo, logo or clip as its raw bytes. The server
 * decides what it is from those bytes (routes/bookingMedia.ts); the session
 * travels as the cookie, named by the `Bearer cookie` placeholder.
 */
export async function uploadBookingMedia(kind: BookingMediaKind, file: Blob): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const q = new URLSearchParams({ action: 'upload', kind, accountId: getActiveAccountId() ?? '' });
    const r = await fetch(`${API_BASE}/api/booking-media.php?${q}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', Authorization: `Bearer ${getSession()?.token || 'cookie'}` },
      body: file,
    });
    const j = await r.json().catch(() => null) as Record<string, unknown> | null;
    if (j?.success && typeof j.url === 'string') return { ok: true, url: j.url };
    return { ok: false, error: String(j?.error ?? (r.status === 413 ? 'That file is too large.' : 'The upload did not go through.')) };
  } catch {
    return { ok: false, error: 'The server could not be reached, so nothing was uploaded.' };
  }
}

export async function clearBookingMedia(kind: BookingMediaKind): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/api/booking-media.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear', token: getSession()?.token || 'cookie', accountId: getActiveAccountId() ?? '', kind }),
    });
    const j = await r.json().catch(() => null) as { success?: boolean } | null;
    return !!j?.success;
  } catch { return false; }
}

/**
 * Visitor: fetch the published schedule.
 *
 * The slug matters. `/book/:slug` used to be routed but never read, so every
 * link — a real one, a typo, another workspace's — rendered the same booking
 * page. On a multi-tenant install that means a visitor could book the wrong
 * business entirely. Returns `notFound` so the page can say so rather than
 * showing somebody else's availability.
 */
export async function fetchPublicConfig(slug?: string, accountId?: string): Promise<
  { config: Partial<ScheduleAvailability> & { weekly?: ScheduleAvailability['weekly'] }; accountId?: string } | { notFound: true } | null
> {
  /* By workspace only for a guest's manage link, which names its booking and
     so its workspace; a visitor arriving cold is found by slug. */
  const res = await call(slug ? { action: 'config', slug } : accountId ? { action: 'config', accountId } : { action: 'config' });
  if (!res) return null;
  if (res.notFound) return { notFound: true };
  if (!res.success || !res.config) return null;
  return {
    config: res.config as Partial<ScheduleAvailability> & { weekly?: ScheduleAvailability['weekly'] },
    accountId: res.accountId as string | undefined,
  };
}

/** Visitor: booked slots for a given date, in the workspace whose page this is. */
export async function fetchBookedSlots(accountId: string, date: string): Promise<{ time: string; duration: number }[] | null> {
  const res = await call({ action: 'slots', accountId, date });
  if (!res || !res.success) return null;
  return (res.booked as { time: string; duration: number }[]) ?? [];
}

/** Visitor: everything booked across a range of the owner's dates (at most two months). */
export async function fetchBookedRange(accountId: string, from: string, to: string): Promise<{ date: string; time: string; duration: number }[] | null> {
  const res = await call({ action: 'slots', accountId, from, to });
  if (!res || !res.success) return null;
  return (res.booked as { date: string; time: string; duration: number }[]) ?? [];
}

export async function createRemoteBooking(payload: {
  accountId: string; eventTypeId?: string; slotDate: string; slotTime: string;
  guestName: string; guestEmail: string; guestPhone?: string; notes?: string; timezone?: string;
}): Promise<{ ok: boolean; id?: string; key?: string; error?: string; emailed?: boolean; startsAt?: string }> {
  const res = await call({ action: 'create', ...payload });
  if (!res) return { ok: false, error: 'unreachable' };
  if (res.success) return { ok: true, id: res.id as string, key: res.key as string, emailed: res.emailed === true, startsAt: res.startsAt as string | undefined };
  return { ok: false, error: (res.error as string) || 'Booking failed.' };
}

export async function getRemoteBooking(id: string, key: string): Promise<Booking | null> {
  const res = await call({ action: 'get', id, key });
  return res && res.success ? (res.booking as Booking) : null;
}

/* `emailed` is whether the server's mail was accepted — the page says "emailed
   to you" only then, rather than promising a message that never left. */
export async function cancelRemoteBooking(id: string, key: string): Promise<{ ok: boolean; emailed: boolean }> {
  const res = await call({ action: 'cancel', id, key });
  return { ok: !!(res && res.success), emailed: res?.emailed === true };
}

export async function rescheduleRemoteBooking(id: string, key: string, slotDate: string, slotTime: string): Promise<{ ok: boolean; error?: string; emailed?: boolean }> {
  const res = await call({ action: 'reschedule', id, key, slotDate, slotTime });
  if (!res) return { ok: false, error: 'unreachable' };
  return res.success ? { ok: true, emailed: res.emailed === true } : { ok: false, error: (res.error as string) || 'Reschedule failed.' };
}

/** Owner: all server-side bookings. */
export async function listRemoteBookings(token: string): Promise<Booking[] | null> {
  const res = await call({ action: 'list', token, accountId: getActiveAccountId() ?? '' });
  if (!res || !res.success) return null;
  return ((res.bookings as Booking[]) ?? []).map(b => ({ ...b, remote: true }));
}

export async function setRemoteBookingStatus(token: string, id: string, status: 'confirmed' | 'cancelled' | 'completed'): Promise<boolean> {
  const res = await call({ action: 'set_status', token, accountId: getActiveAccountId() ?? '', id, status });
  return !!(res && res.success);
}

/* ── Calendar helpers (confirmation screen) ── */

/*
 * Both calendar helpers take the meeting's real instant when there is one
 * (`startUtc`) and write it in UTC with a Z. They used to build a floating
 * local time from the owner's date and hour, so a guest in Bangkok adding a
 * 09:00 New York meeting got it at 09:00 Bangkok — eleven hours early.
 */
type CalOpts = { title: string; description?: string; location?: string; date: string; time: string; durationMin: number; startUtc?: number };
const zStamp = (dt: Date) => dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const startOf = (opts: CalOpts): Date => {
  if (typeof opts.startUtc === 'number' && Number.isFinite(opts.startUtc)) return new Date(opts.startUtc);
  const [y, mo, da] = opts.date.split('-').map(Number);
  const [h, mi] = opts.time.split(':').map(Number);
  return new Date(y, mo - 1, da, h, mi);
};

/** Build an .ics file for a booking and return it as a data blob. */
export function buildIcs(opts: CalOpts): Blob {
  const start = startOf(opts);
  const end = new Date(start.getTime() + opts.durationMin * 60000);
  const local = (dt: Date) =>
    `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}${String(dt.getMinutes()).padStart(2, '0')}00`;
  const stamp = (dt: Date) => (opts.startUtc !== undefined ? zStamp(dt) : local(dt));
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Protected Central//Booking//EN',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@crmpro-booking`,
    `DTSTAMP:${zStamp(new Date())}`,
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
export function googleCalendarUrl(opts: CalOpts): string {
  const start = startOf(opts);
  const end = new Date(start.getTime() + opts.durationMin * 60000);
  const s = (dt: Date) => (opts.startUtc !== undefined ? zStamp(dt)
    : `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}${String(dt.getMinutes()).padStart(2, '0')}00`);
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: opts.title,
    dates: `${s(start)}/${s(end)}`,
    details: opts.description ?? '',
    location: opts.location ?? '',
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
