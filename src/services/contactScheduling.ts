/**
 * contactScheduling.ts — booking, rescheduling and cancelling meetings from
 * the contact profile, using the same availability rules the public booking
 * page enforces so the two can never disagree about what is free.
 *
 * Times are stored as owner-timezone wall clock (`date` + `time`), which is
 * how the rest of the CRM already records appointments. Everything that needs
 * a real instant goes through `ownerInstant()`, so a contact in another zone
 * sees their own clock without the stored record changing meaning.
 */

import type {
  Appointment, AppointmentReminder, Booking, Contact, ScheduleAvailability, Pipeline,
} from '../types';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

const pad = (n: number) => String(n).padStart(2, '0');

/* ── Time helpers ── */

/** Interpret `date time` as wall clock in `tz` and return the real instant. */
export function ownerInstant(dateStr: string, time: string, tz: string): Date {
  const utcGuess = new Date(`${dateStr}T${normaliseTime(time)}:00Z`);
  if (Number.isNaN(utcGuess.getTime())) return new Date(NaN);
  try {
    const tzAsUtc = new Date(utcGuess.toLocaleString('en-US', { timeZone: tz }));
    return new Date(utcGuess.getTime() + (utcGuess.getTime() - tzAsUtc.getTime()));
  } catch {
    return new Date(`${dateStr}T${normaliseTime(time)}:00`);
  }
}

/** Accept "14:30", "2:30 PM" or "2 PM" and return 24h "HH:MM". */
export function normaliseTime(time: string): string {
  const t = (time || '').trim();
  const m12 = t.match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?[Mm]\.?$/);
  if (m12) {
    let h = Number(m12[1]) % 12;
    if (m12[3].toLowerCase() === 'p') h += 12;
    return `${pad(h)}:${pad(Number(m12[2] ?? 0))}`;
  }
  const m24 = t.match(/^(\d{1,2}):(\d{2})/);
  if (m24) return `${pad(Number(m24[1]))}:${pad(Number(m24[2]))}`;
  return t;
}

export function fmt12(time: string): string {
  const [h, m] = normaliseTime(time).split(':').map(Number);
  if (Number.isNaN(h)) return time;
  return `${h % 12 || 12}:${pad(m || 0)} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** The same instant rendered in another zone, e.g. "Tue 12 Aug, 9:30 AM". */
export function inZone(instant: Date, tz: string): string {
  if (Number.isNaN(instant.getTime())) return '—';
  try {
    return instant.toLocaleString('en-US', {
      timeZone: tz, weekday: 'short', day: 'numeric', month: 'short',
      hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return instant.toLocaleString();
  }
}

/** Just the clock part in another zone, e.g. "9:30 AM". */
export function clockInZone(instant: Date, tz: string): string {
  if (Number.isNaN(instant.getTime())) return '—';
  try { return instant.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }); }
  catch { return instant.toLocaleTimeString(); }
}

/** Current UTC offset of a zone in minutes, for showing the gap between two people. */
export function zoneOffsetMinutes(tz: string, at: Date = new Date()): number {
  try {
    const asUtc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }));
    const asTz = new Date(at.toLocaleString('en-US', { timeZone: tz }));
    return Math.round((asTz.getTime() - asUtc.getTime()) / 60000);
  } catch { return 0; }
}

export function offsetLabel(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${pad(abs % 60)}` : ''}h`;
}

/* ── Contact timezone ── */

/** Zones offered in the picker — broad coverage without an unusable list. */
export const COMMON_TIMEZONES = [
  'Pacific/Auckland', 'Australia/Sydney', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore',
  'Asia/Kolkata', 'Asia/Dubai', 'Europe/Moscow', 'Africa/Johannesburg', 'Europe/Berlin',
  'Europe/Paris', 'Europe/London', 'Atlantic/Reykjavik', 'America/Sao_Paulo', 'America/New_York',
  'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
];

/** Dialling code → representative zone, used only when nothing better is known. */
const DIAL_ZONES: [RegExp, string][] = [
  [/^\+?1/, 'America/New_York'],
  [/^\+?44/, 'Europe/London'],
  [/^\+?353/, 'Europe/Dublin'],
  [/^\+?61/, 'Australia/Sydney'],
  [/^\+?64/, 'Pacific/Auckland'],
  [/^\+?91/, 'Asia/Kolkata'],
  [/^\+?92/, 'Asia/Karachi'],
  [/^\+?971/, 'Asia/Dubai'],
  [/^\+?65/, 'Asia/Singapore'],
  [/^\+?81/, 'Asia/Tokyo'],
  [/^\+?86/, 'Asia/Shanghai'],
  [/^\+?49/, 'Europe/Berlin'],
  [/^\+?33/, 'Europe/Paris'],
  [/^\+?34/, 'Europe/Madrid'],
  [/^\+?39/, 'Europe/Rome'],
  [/^\+?55/, 'America/Sao_Paulo'],
  [/^\+?27/, 'Africa/Johannesburg'],
];

export interface ResolvedZone { zone: string; source: 'explicit' | 'phone' | 'default'; }

/**
 * The contact's timezone: what they told you, else a guess from their dialling
 * code, else the owner's. The source is returned so the UI can be honest about
 * a guess rather than presenting it as fact.
 */
export function contactZone(contact: Contact, ownerTz: string): ResolvedZone {
  if (contact.timezone) return { zone: contact.timezone, source: 'explicit' };
  const phone = (contact.phone || '').replace(/[\s()-]/g, '');
  if (phone) {
    for (const [re, zone] of DIAL_ZONES) {
      if (re.test(phone)) return { zone, source: 'phone' };
    }
  }
  return { zone: ownerTz, source: 'default' };
}

/* ── Availability ── */

function slotGrid(from: string, to: string, duration: number, bufferAfter: number): string[] {
  const out: string[] = [];
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  if ([fh, fm, th, tm].some(Number.isNaN)) return out;
  let cur = fh * 60 + fm;
  const end = th * 60 + tm;
  const step = Math.max(5, duration + bufferAfter);
  while (cur + duration <= end) {
    out.push(`${pad(Math.floor(cur / 60))}:${pad(cur % 60)}`);
    cur += step;
  }
  return out;
}

export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export interface SlotContext {
  schedule: ScheduleAvailability;
  bookings: Booking[];
  appointments: Appointment[];
  /** Ignore this appointment when checking conflicts (used when rescheduling). */
  excludeAppointmentId?: string;
}

/** Everything already taking up the calendar on a date, in owner wall clock. */
function takenOn(dateStr: string, ctx: SlotContext): { time: string; duration: number }[] {
  const fromBookings = ctx.bookings
    .filter(b => b.slotDate === dateStr && b.status !== 'cancelled')
    .map(b => ({ time: normaliseTime(b.slotTime), duration: b.duration ?? ctx.schedule.duration }));
  const fromAppts = ctx.appointments
    .filter(a => a.date === dateStr && a.status === 'scheduled' && a.id !== ctx.excludeAppointmentId)
    .map(a => ({ time: normaliseTime(a.time), duration: a.duration || ctx.schedule.duration }));
  return [...fromBookings, ...fromAppts];
}

const minutesOf = (t: string) => {
  const [h, m] = normaliseTime(t).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

function overlaps(aStart: string, aLen: number, bStart: string, bLen: number, buffer: number): boolean {
  const a0 = minutesOf(aStart), a1 = a0 + aLen + buffer;
  const b0 = minutesOf(bStart), b1 = b0 + bLen + buffer;
  return a0 < b1 && b0 < a1;
}

export interface DayAvailabilityResult {
  slots: string[];
  /** Why there is nothing bookable, when that is the case. */
  reason?: string;
}

/**
 * Bookable owner-timezone start times for a date. Applies the weekly working
 * hours, the daily limit, buffers, minimum notice and the booking window —
 * the same constraints the public page uses, so the profile can never
 * double-book against a public booking.
 */
export function slotsForDate(dateStr: string, duration: number, ctx: SlotContext): DayAvailabilityResult {
  const { schedule } = ctx;
  const day = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(day.getTime())) return { slots: [], reason: 'That is not a valid date.' };

  const avail = schedule.weekly[DAY_KEYS[day.getDay()]];
  if (!avail?.enabled) return { slots: [], reason: 'You are not available on this weekday.' };

  const taken = takenOn(dateStr, ctx);
  if (taken.length >= (schedule.dailyLimit || 99)) {
    return { slots: [], reason: `Daily limit of ${schedule.dailyLimit} meetings is already reached.` };
  }

  const buffer = (schedule.bufferBefore || 0) + (schedule.bufferAfter || 0);
  const grid = slotGrid(avail.from, avail.to, duration, schedule.bufferAfter || 0);
  const notice = (schedule.minNoticeMin ?? 0) * 60000;
  const now = Date.now();

  const free = grid.filter(t => {
    if (taken.some(b => overlaps(t, duration, b.time, b.duration, buffer))) return false;
    const instant = ownerInstant(dateStr, t, schedule.timezone);
    return instant.getTime() - now >= notice;
  });

  if (!free.length) {
    return { slots: [], reason: taken.length ? 'Every slot on this day is taken.' : 'No slots left today — try a later date.' };
  }
  return { slots: free };
}

/** The next N dates that have at least one free slot. */
export function nextAvailableDates(duration: number, ctx: SlotContext, count = 14): string[] {
  const out: string[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  const windowDays = ctx.schedule.windowDays ?? 365;
  for (let i = 0; i <= windowDays && out.length < count; i++) {
    const ds = dateKey(cursor);
    if (slotsForDate(ds, duration, ctx).slots.length) out.push(ds);
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/* ── Reminders ── */

/** Reminder schedule derived from the scheduling automations settings. */
export function buildReminders(dateStr: string, time: string, ownerTz: string, schedule: ScheduleAvailability): AppointmentReminder[] {
  const auto = schedule.automations;
  if (!auto?.reminderEmail) return [];
  const minutes = Math.max(5, auto.reminderMinutes || 60);
  const start = ownerInstant(dateStr, time, ownerTz);
  if (Number.isNaN(start.getTime())) return [];
  return [{
    at: new Date(start.getTime() - minutes * 60000).toISOString(),
    channel: 'email',
    minutesBefore: minutes,
  }];
}

/* ── Booking, rescheduling, cancelling ── */

export interface BookInput {
  date: string;
  /** Owner-timezone 24h start time. */
  time: string;
  duration: number;
  title: string;
  type: string;
  location?: string;
  notes?: string;
  eventTypeId?: string;
}

export interface BookCheck { ok: boolean; error?: string; }

/** Validate a proposed slot against the live availability rules. */
export function validateSlot(input: BookInput, ctx: SlotContext): BookCheck {
  if (!input.date || !input.time) return { ok: false, error: 'Pick a date and a time.' };
  if (!input.title.trim()) return { ok: false, error: 'Give the meeting a title.' };
  if (!(input.duration > 0)) return { ok: false, error: 'Duration must be more than zero.' };
  const instant = ownerInstant(input.date, input.time, ctx.schedule.timezone);
  if (Number.isNaN(instant.getTime())) return { ok: false, error: 'That date and time could not be read.' };
  if (instant.getTime() < Date.now()) return { ok: false, error: 'That time is in the past.' };
  const { slots, reason } = slotsForDate(input.date, input.duration, ctx);
  if (!slots.includes(normaliseTime(input.time))) {
    return { ok: false, error: reason || 'That slot is no longer free.' };
  }
  return { ok: true };
}

/** Build the appointment record for a validated slot. */
export function buildAppointment(contact: Contact, input: BookInput, ctx: SlotContext, ownerTz: string): Omit<Appointment, 'id'> {
  const zone = contactZone(contact, ownerTz);
  return {
    title: input.title.trim(),
    contactId: contact.id,
    contactName: contact.name,
    date: input.date,
    time: normaliseTime(input.time),
    duration: input.duration,
    status: 'scheduled',
    type: input.type || 'Meeting',
    notes: input.notes?.trim() || undefined,
    ownerTimezone: ownerTz,
    contactTimezone: zone.zone,
    location: input.location?.trim() || ctx.schedule.location || undefined,
    eventTypeId: input.eventTypeId,
    reminders: buildReminders(input.date, input.time, ownerTz, ctx.schedule),
    createdAt: new Date().toISOString(),
  };
}

/** Changes needed to move an appointment, with fresh reminders for the new time. */
export function rescheduleUpdates(appt: Appointment, date: string, time: string, schedule: ScheduleAvailability): Partial<Appointment> {
  const ownerTz = appt.ownerTimezone || schedule.timezone;
  return {
    date,
    time: normaliseTime(time),
    status: 'scheduled',
    rescheduledFrom: { date: appt.date, time: appt.time },
    reminders: buildReminders(date, time, ownerTz, schedule),
    followUpDone: false,
  };
}

export function cancelUpdates(reason: string): Partial<Appointment> {
  return { status: 'cancelled', cancelReason: reason.trim() || 'No reason given', reminders: [] };
}

export function completeUpdates(outcome: string): Partial<Appointment> {
  return { status: 'completed', outcome: outcome.trim() || 'Meeting held', reminders: [] };
}

/* ── Appointment queries ── */

export interface DatedAppointment extends Appointment {
  instant: Date;
  endInstant: Date;
  /** True once the meeting's end time has passed. */
  past: boolean;
}

export function withInstants(appointments: Appointment[], ownerTz: string): DatedAppointment[] {
  const now = Date.now();
  return appointments.map(a => {
    const tz = a.ownerTimezone || ownerTz;
    const instant = ownerInstant(a.date, a.time, tz);
    const endInstant = new Date(instant.getTime() + (a.duration || 30) * 60000);
    return { ...a, instant, endInstant, past: endInstant.getTime() < now };
  });
}

export function splitAppointments(appointments: Appointment[], ownerTz: string) {
  const all = withInstants(appointments, ownerTz)
    .sort((a, b) => a.instant.getTime() - b.instant.getTime());
  return {
    upcoming: all.filter(a => a.status === 'scheduled' && !a.past),
    /** Scheduled but the end time has passed — waiting to be closed out. */
    awaitingOutcome: all.filter(a => a.status === 'scheduled' && a.past).reverse(),
    history: all.filter(a => a.status !== 'scheduled').reverse(),
  };
}

export interface ScheduleStats {
  total: number;
  completed: number;
  cancelled: number;
  noShow: number;
  showRate: number;
}

export function scheduleStats(appointments: Appointment[]): ScheduleStats {
  const closed = appointments.filter(a => a.status !== 'scheduled');
  const completed = closed.filter(a => a.status === 'completed').length;
  const cancelled = closed.filter(a => a.status === 'cancelled').length;
  const noShow = closed.filter(a => a.status === 'no-show').length;
  const attendable = completed + noShow;
  return {
    total: appointments.length,
    completed, cancelled, noShow,
    showRate: attendable ? Math.round((completed / attendable) * 100) : 0,
  };
}

/* ── Calendar export ── */

const icsEscape = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
const icsStamp = (d: Date) => `${d.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;

/** A real .ics file for the meeting — importable by any calendar app. */
export function appointmentIcs(appt: Appointment, ownerTz: string): string {
  const start = ownerInstant(appt.date, appt.time, appt.ownerTimezone || ownerTz);
  const end = new Date(start.getTime() + (appt.duration || 30) * 60000);
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CRM//Scheduling//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${appt.id}@crm.local`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsEscape(appt.title)}`,
    appt.location ? `LOCATION:${icsEscape(appt.location)}` : '',
    appt.notes ? `DESCRIPTION:${icsEscape(appt.notes)}` : '',
    `STATUS:${appt.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

/** Google Calendar "add event" link, for one-click calendar sync without OAuth. */
export function googleCalendarLink(appt: Appointment, ownerTz: string): string {
  const start = ownerInstant(appt.date, appt.time, appt.ownerTimezone || ownerTz);
  const end = new Date(start.getTime() + (appt.duration || 30) * 60000);
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: appt.title,
    dates: `${icsStamp(start)}/${icsStamp(end)}`,
    details: appt.notes || '',
    location: appt.location || '',
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/* ── Post-appointment follow-up ── */

export interface FollowUpRule {
  id: string;
  label: string;
  enabled: boolean;
}

export const DEFAULT_FOLLOWUP_RULES: FollowUpRule[] = [
  { id: 'fu-email', label: 'Send a thank-you email after a completed meeting', enabled: true },
  { id: 'fu-task', label: 'Create a follow-up task two days after the meeting', enabled: true },
  { id: 'fu-deal', label: 'Advance the contact’s open deal one stage after a completed meeting', enabled: false },
  { id: 'fu-noshow', label: 'Create a re-book task when a contact does not show', enabled: true },
];

const FOLLOWUP_KEY = 'crm_appointment_followups';

export function loadFollowUpRules(): FollowUpRule[] {
  try {
    const raw = JSON.parse(localStorage.getItem(FOLLOWUP_KEY) || 'null');
    if (!Array.isArray(raw)) return DEFAULT_FOLLOWUP_RULES;
    return DEFAULT_FOLLOWUP_RULES.map(d => {
      const saved = raw.find((r: FollowUpRule) => r.id === d.id);
      return saved ? { ...d, enabled: !!saved.enabled } : d;
    });
  } catch { return DEFAULT_FOLLOWUP_RULES; }
}

export function saveFollowUpRules(rules: FollowUpRule[]) {
  try { localStorage.setItem(FOLLOWUP_KEY, JSON.stringify(rules.map(r => ({ id: r.id, enabled: r.enabled })))); } catch { /* storage full or blocked */ }
}

export interface FollowUpPlan {
  /** Emails to send, already personalised. */
  emails: { contact: Contact; subject: string; body: string }[];
  /** Tasks to create against a contact. */
  tasks: { contactId: string; title: string; dueDate: string }[];
  /** Deals to advance one stage. */
  dealAdvances: { dealId: string }[];
  /** Appointments that have now been handled. */
  handled: string[];
  /** Lines for the notification tray. */
  notes: string[];
}

const emptyPlan = (): FollowUpPlan => ({ emails: [], tasks: [], dealAdvances: [], handled: [], notes: [] });

/**
 * Work out what should happen after meetings that have been closed out but not
 * followed up. Returns a plan rather than performing it, so the caller owns
 * every write and the whole thing stays testable.
 */
export function planFollowUps(
  appointments: Appointment[],
  contacts: Contact[],
  pipelines: Pipeline[],
  ownerTz: string,
  followUpText?: string,
): FollowUpPlan {
  const rules = loadFollowUpRules();
  const on = (id: string) => rules.find(r => r.id === id)?.enabled;
  const plan = emptyPlan();

  for (const appt of withInstants(appointments, ownerTz)) {
    if (appt.followUpDone) continue;
    if (appt.status !== 'completed' && appt.status !== 'no-show') continue;
    const contact = contacts.find(c => c.id === appt.contactId);
    if (!contact) { plan.handled.push(appt.id); continue; }

    if (appt.status === 'completed') {
      if (on('fu-email') && contact.email) {
        plan.emails.push({
          contact,
          subject: `Thanks for your time — ${appt.title}`,
          body: followUpText?.trim()
            || `Hi {{firstName}},\n\nThanks for making time today. Here is a quick recap of what we covered:\n\n${appt.outcome || appt.title}\n\nIf anything needs clarifying, just reply to this email.`,
        });
        plan.notes.push(`Follow-up email queued for ${contact.name}`);
      }
      if (on('fu-task')) {
        plan.tasks.push({
          contactId: contact.id,
          title: `Follow up after "${appt.title}"`,
          dueDate: new Date(appt.endInstant.getTime() + 2 * 86_400_000).toISOString().slice(0, 10),
        });
        plan.notes.push(`Follow-up task created for ${contact.name}`);
      }
      if (on('fu-deal')) {
        const deal = openDealFor(contact, pipelines);
        if (deal) {
          plan.dealAdvances.push({ dealId: deal.id });
          plan.notes.push(`"${deal.title}" advanced after the meeting`);
        }
      }
    } else if (on('fu-noshow')) {
      plan.tasks.push({
        contactId: contact.id,
        title: `Re-book ${contact.name} — no-show for "${appt.title}"`,
        dueDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
      });
      plan.notes.push(`Re-book task created for ${contact.name}`);
    }

    plan.handled.push(appt.id);
  }

  return plan;
}

function openDealFor(contact: Contact, pipelines: Pipeline[]) {
  for (const p of pipelines) {
    for (const st of p.stages) {
      for (const d of st.deals) {
        const mine = d.contactId === contact.id
          || (!!contact.email && d.contactEmail?.toLowerCase() === contact.email.toLowerCase());
        if (mine && (d.status ?? 'active') === 'active') return d;
      }
    }
  }
  return null;
}

/* ── Due reminders ── */

export interface DueReminder {
  appointmentId: string;
  contact: Contact;
  appointment: Appointment;
  subject: string;
  body: string;
  reminderIndex: number;
}

/** Reminders whose time has arrived and that have not been sent yet. */
export function dueReminders(appointments: Appointment[], contacts: Contact[], ownerTz: string): DueReminder[] {
  const now = Date.now();
  const out: DueReminder[] = [];
  for (const appt of appointments) {
    if (appt.status !== 'scheduled' || !appt.reminders?.length) continue;
    const contact = contacts.find(c => c.id === appt.contactId);
    if (!contact?.email) continue;
    appt.reminders.forEach((r, i) => {
      if (r.sentAt || new Date(r.at).getTime() > now) return;
      const tz = appt.contactTimezone || ownerTz;
      const start = ownerInstant(appt.date, appt.time, appt.ownerTimezone || ownerTz);
      // Don't send a "reminder" for a meeting that already started.
      if (start.getTime() < now) return;
      out.push({
        appointmentId: appt.id, contact, appointment: appt, reminderIndex: i,
        subject: `Reminder: ${appt.title}`,
        body: `Hi {{firstName}},\n\nThis is a reminder about "${appt.title}".\n\nWhen: ${inZone(start, tz)} (${tz})\n${appt.location ? `Where: ${appt.location}\n` : ''}\nSee you then.`,
      });
    });
  }
  return out;
}
