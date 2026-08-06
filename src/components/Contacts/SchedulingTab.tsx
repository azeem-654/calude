/**
 * SchedulingTab.tsx — book, reschedule and cancel meetings without leaving the
 * contact, with both clocks visible at once so nobody has to do timezone
 * arithmetic in their head.
 */
import { useMemo, useState } from 'react';
import {
  Calendar, Clock, Globe, Plus, Check, X, RotateCcw, Ban, UserX,
  Download, ExternalLink, ChevronRight, Zap, ToggleLeft, ToggleRight, MapPin,
} from 'lucide-react';
import type { Appointment, Booking, Contact, ScheduleAvailability } from '../../types';
import {
  contactZone, COMMON_TIMEZONES, slotsForDate, nextAvailableDates, validateSlot,
  buildAppointment, rescheduleUpdates, cancelUpdates, completeUpdates,
  splitAppointments, scheduleStats, ownerInstant, inZone, clockInZone, fmt12,
  zoneOffsetMinutes, offsetLabel, appointmentIcs, googleCalendarLink,
  loadFollowUpRules, saveFollowUpRules,
  type BookInput, type DatedAppointment,
} from '../../services/contactScheduling';

const INK = '#17191c';

const STATUS_META = {
  scheduled: { label: 'Scheduled', color: '#6366f1', bg: '#eef2ff' },
  completed: { label: 'Completed', color: '#16a34a', bg: '#dcfce7' },
  cancelled: { label: 'Cancelled', color: '#dc2626', bg: '#fef2f2' },
  'no-show':  { label: 'No-show',  color: '#f59e0b', bg: '#fef3c7' },
} as const;

interface Props {
  contact: Contact;
  appointments: Appointment[];
  allAppointments: Appointment[];
  bookings: Booking[];
  schedule: ScheduleAvailability;
  onBook: (appt: Omit<Appointment, 'id'>) => Appointment;
  onUpdate: (id: string, updates: Partial<Appointment>) => void;
  onContactUpdate: (updates: Partial<Contact>) => void;
  onActivity: (text: string) => void;
  onNotify: (text: string, kind?: 'success' | 'error' | 'info') => void;
}

export default function SchedulingTab({
  contact, appointments, allAppointments, bookings, schedule,
  onBook, onUpdate, onContactUpdate, onActivity, onNotify,
}: Props) {
  const ownerTz = schedule.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zone = useMemo(() => contactZone(contact, ownerTz), [contact, ownerTz]);
  const [booking, setBooking] = useState(false);
  const [reschedule, setReschedule] = useState<string | null>(null);

  const split = useMemo(() => splitAppointments(appointments, ownerTz), [appointments, ownerTz]);
  const stats = useMemo(() => scheduleStats(appointments), [appointments]);

  const gap = zoneOffsetMinutes(zone.zone) - zoneOffsetMinutes(ownerTz);

  const download = (appt: Appointment) => {
    const blob = new Blob([appointmentIcs(appt, ownerTz)], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${appt.title.replace(/[^\w-]+/g, '-').toLowerCase()}.ics`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const close = (appt: DatedAppointment, kind: 'completed' | 'no-show') => {
    if (kind === 'completed') {
      const outcome = window.prompt(`What came out of "${appt.title}"?`, 'Good conversation — sending a proposal');
      if (outcome === null) return;
      onUpdate(appt.id, completeUpdates(outcome));
      onActivity(`Meeting completed: ${appt.title} — ${outcome.trim() || 'Meeting held'}`);
    } else {
      onUpdate(appt.id, { status: 'no-show', reminders: [] });
      onActivity(`No-show: ${appt.title}`);
    }
  };

  const cancel = (appt: DatedAppointment) => {
    const reason = window.prompt(`Why is "${appt.title}" being cancelled?`, 'Contact asked to reschedule');
    if (reason === null) return;
    onUpdate(appt.id, cancelUpdates(reason));
    onActivity(`Meeting cancelled: ${appt.title} — ${reason.trim() || 'No reason given'}`);
    onNotify(`"${appt.title}" cancelled`);
  };

  return (
    <div>
      {/* Timezone bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 13px', background: '#f8fafc', border: '1px solid #eef0f3', borderRadius: 12, marginBottom: 16 }}>
        <Globe size={13} color="#64748b" />
        <span style={{ fontSize: 12, color: '#475569' }}>
          You are in <strong style={{ color: INK }}>{ownerTz}</strong> · {contact.name.split(' ')[0]} is in
        </span>
        <select value={zone.zone} title="The contact's timezone"
          onChange={e => { onContactUpdate({ timezone: e.target.value }); onNotify(`${contact.name}'s timezone set to ${e.target.value}`); }}
          style={{ padding: '5px 9px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, background: '#fff', color: INK, fontWeight: 600, cursor: 'pointer' }}>
          {[...new Set([zone.zone, ...COMMON_TIMEZONES])].map(tz => <option key={tz} value={tz}>{tz}</option>)}
        </select>
        {gap !== 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', background: '#eef2ff', padding: '3px 9px', borderRadius: 999 }}>
            {offsetLabel(gap)} from you
          </span>
        )}
        {zone.source !== 'explicit' && (
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            {zone.source === 'phone' ? 'Guessed from their phone number — set it if that is wrong.' : 'Defaulting to your timezone.'}
          </span>
        )}
      </div>

      <StatsStrip stats={stats} upcoming={split.upcoming.length} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 0 10px' }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Calendar size={13} /> Meetings ({appointments.length})
        </span>
        <button onClick={() => { setBooking(v => !v); setReschedule(null); }} title="Book a meeting with this contact"
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 9, border: 'none', background: INK, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={12} /> Book a meeting
        </button>
      </div>

      {booking && (
        <SlotPicker
          contact={contact} schedule={schedule} bookings={bookings} appointments={allAppointments}
          contactTz={zone.zone} ownerTz={ownerTz}
          onCancel={() => setBooking(false)}
          onConfirm={input => {
            const ctx = { schedule, bookings, appointments: allAppointments };
            const check = validateSlot(input, ctx);
            if (!check.ok) { onNotify(check.error!, 'error'); return false; }
            const appt = onBook(buildAppointment(contact, input, ctx, ownerTz));
            onActivity(`Meeting booked: ${input.title} on ${input.date} at ${fmt12(input.time)} (${ownerTz})`);
            setBooking(false);
            if (appt.reminders?.length) onNotify(`Reminder set for ${appt.reminders[0].minutesBefore} minutes before`);
            return true;
          }}
        />
      )}

      {!appointments.length && !booking && (
        <div style={{ padding: '30px 20px', textAlign: 'center', border: '1px dashed #e2e8f0', borderRadius: 14, color: '#94a3b8' }}>
          <Calendar size={22} style={{ opacity: 0.4 }} />
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8, color: '#64748b' }}>No meetings yet</div>
          <div style={{ fontSize: 11.5, marginTop: 3 }}>Book one and it lands on your calendar and theirs.</div>
        </div>
      )}

      {split.awaitingOutcome.length > 0 && (
        <Section title="Needs closing out" hint="These have already happened — record what came of them.">
          {split.awaitingOutcome.map(a => (
            <ApptCard key={a.id} appt={a} ownerTz={ownerTz} contactTz={zone.zone}
              onDownload={() => download(a)}
              actions={
                <>
                  <button onClick={() => close(a, 'completed')} title="Mark this meeting completed" style={btn('#16a34a', '#dcfce7', '#bbf7d0')}><Check size={11} /> Completed</button>
                  <button onClick={() => close(a, 'no-show')} title="Mark the contact as a no-show" style={btn('#f59e0b', '#fffbeb', '#fde68a')}><UserX size={11} /> No-show</button>
                </>
              } />
          ))}
        </Section>
      )}

      {split.upcoming.length > 0 && (
        <Section title="Upcoming">
          {split.upcoming.map(a => (
            <div key={a.id}>
              <ApptCard appt={a} ownerTz={ownerTz} contactTz={zone.zone}
                onDownload={() => download(a)}
                actions={
                  <>
                    <button onClick={() => { setReschedule(reschedule === a.id ? null : a.id); setBooking(false); }} title="Reschedule this meeting" style={btn('#4f46e5', '#eef2ff', '#c7d2fe')}><RotateCcw size={11} /> Reschedule</button>
                    <button onClick={() => cancel(a)} title="Cancel this meeting" style={btn('#dc2626', '#fef2f2', '#fecaca')}><Ban size={11} /> Cancel</button>
                    <a href={googleCalendarLink(a, ownerTz)} target="_blank" rel="noreferrer" title="Add to Google Calendar"
                      style={{ ...btn('#475569', '#fff', '#e2e8f0'), textDecoration: 'none' }}><ExternalLink size={11} /> Google</a>
                  </>
                } />
              {reschedule === a.id && (
                <SlotPicker
                  contact={contact} schedule={schedule} bookings={bookings} appointments={allAppointments}
                  contactTz={zone.zone} ownerTz={ownerTz} excludeAppointmentId={a.id}
                  initial={{ title: a.title, duration: a.duration, type: a.type, location: a.location, notes: a.notes }}
                  confirmLabel="Move meeting" mode="reschedule"
                  onCancel={() => setReschedule(null)}
                  onConfirm={input => {
                    const ctx = { schedule, bookings, appointments: allAppointments, excludeAppointmentId: a.id };
                    const check = validateSlot(input, ctx);
                    if (!check.ok) { onNotify(check.error!, 'error'); return false; }
                    onUpdate(a.id, rescheduleUpdates(a, input.date, input.time, schedule));
                    onActivity(`Meeting moved: ${a.title} from ${a.date} ${fmt12(a.time)} to ${input.date} ${fmt12(input.time)}`);
                    setReschedule(null);
                    return true;
                  }}
                />
              )}
            </div>
          ))}
        </Section>
      )}

      {split.history.length > 0 && (
        <Section title="History">
          {split.history.map(a => (
            <ApptCard key={a.id} appt={a} ownerTz={ownerTz} contactTz={zone.zone} onDownload={() => download(a)} />
          ))}
        </Section>
      )}

      <FollowUpRules />
    </div>
  );
}

/* ── Building blocks ── */

function btn(color: string, bg: string, border: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 9,
    border: `1px solid ${border}`, background: bg, color, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
  };
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</div>
      {hint && <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>{hint}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>{children}</div>
    </div>
  );
}

function StatsStrip({ stats, upcoming }: { stats: ReturnType<typeof scheduleStats>; upcoming: number }) {
  const cell = (label: string, value: string, sub?: string) => (
    <div key={label} style={{ flex: 1, padding: '10px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #eef0f3' }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: INK, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{sub}</div>}
    </div>
  );
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {cell('Upcoming', String(upcoming))}
      {cell('Completed', String(stats.completed))}
      {cell('Show rate', stats.completed + stats.noShow ? `${stats.showRate}%` : '—', `${stats.noShow} no-show${stats.noShow === 1 ? '' : 's'}`)}
      {cell('Cancelled', String(stats.cancelled))}
    </div>
  );
}

function ApptCard({ appt, ownerTz, contactTz, actions, onDownload }: {
  appt: DatedAppointment;
  ownerTz: string;
  contactTz: string;
  actions?: React.ReactNode;
  onDownload: () => void;
}) {
  const meta = STATUS_META[appt.status];
  const tzDiffers = contactTz !== (appt.ownerTimezone || ownerTz);
  return (
    <div style={{ border: '1px solid #e6e9f0', borderRadius: 14, padding: 13, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>{appt.title}</span>
            <span style={{ padding: '2px 8px', borderRadius: 999, background: meta.bg, color: meta.color, fontSize: 10, fontWeight: 800 }}>{meta.label}</span>
            {appt.rescheduledFrom && (
              <span style={{ padding: '2px 8px', borderRadius: 999, background: '#f1f5f9', color: '#64748b', fontSize: 10, fontWeight: 700 }}>
                moved from {appt.rescheduledFrom.date}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Clock size={11} color="#94a3b8" />
            <span><strong>{inZone(appt.instant, appt.ownerTimezone || ownerTz)}</strong> your time</span>
            {tzDiffers && <span style={{ color: '#94a3b8' }}>· {clockInZone(appt.instant, contactTz)} theirs</span>}
            <span style={{ color: '#94a3b8' }}>· {appt.duration} min</span>
          </div>
          {appt.location && (
            <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
              <MapPin size={10} /> {appt.location}
            </div>
          )}
          {appt.notes && <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 5 }}>{appt.notes}</div>}
          {appt.outcome && (
            <div style={{ fontSize: 11.5, color: '#16a34a', marginTop: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '6px 9px' }}>
              Outcome: {appt.outcome}
            </div>
          )}
          {appt.cancelReason && (
            <div style={{ fontSize: 11.5, color: '#dc2626', marginTop: 6, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '6px 9px' }}>
              Cancelled: {appt.cancelReason}
            </div>
          )}
          {appt.status === 'scheduled' && !!appt.reminders?.length && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
              {appt.reminders[0].sentAt
                ? `Reminder sent ${new Date(appt.reminders[0].sentAt).toLocaleString()}`
                : `Reminder ${appt.reminders[0].minutesBefore} min before`}
            </div>
          )}
        </div>
        <button onClick={onDownload} title="Download a calendar invite (.ics)"
          style={{ padding: 7, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', flexShrink: 0, color: '#475569' }}>
          <Download size={13} />
        </button>
      </div>
      {actions && <div style={{ display: 'flex', gap: 7, marginTop: 11, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

/* ── Slot picker ── */

function SlotPicker({
  contact, schedule, bookings, appointments, contactTz, ownerTz,
  excludeAppointmentId, initial, confirmLabel = 'Book meeting', mode = 'book', onConfirm, onCancel,
}: {
  contact: Contact;
  schedule: ScheduleAvailability;
  bookings: Booking[];
  appointments: Appointment[];
  contactTz: string;
  ownerTz: string;
  excludeAppointmentId?: string;
  initial?: Partial<BookInput>;
  confirmLabel?: string;
  mode?: 'book' | 'reschedule';
  onConfirm: (input: BookInput) => boolean;
  onCancel: () => void;
}) {
  const types = schedule.eventTypes ?? [];
  const [title, setTitle] = useState(initial?.title ?? `${schedule.title || 'Meeting'} with ${contact.name.split(' ')[0]}`);
  const [duration, setDuration] = useState(initial?.duration ?? schedule.duration ?? 30);
  const [eventTypeId, setEventTypeId] = useState(types[0]?.id ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [err, setErr] = useState('');

  const ctx = useMemo(
    () => ({ schedule, bookings, appointments, excludeAppointmentId }),
    [schedule, bookings, appointments, excludeAppointmentId],
  );
  const dates = useMemo(() => nextAvailableDates(duration, ctx, 10), [duration, ctx]);
  const day = useMemo(() => (date ? slotsForDate(date, duration, ctx) : { slots: [] as string[] }), [date, duration, ctx]);

  const inp: React.CSSProperties = { width: '100%', padding: '8px 11px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 12.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
  const tzDiffers = contactTz !== ownerTz;

  const dayLabel = (ds: string) => {
    const d = new Date(`${ds}T12:00:00`);
    return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  return (
    <div data-picker={mode} style={{ border: '1px solid #e6e9f0', borderRadius: 14, padding: 14, background: '#fff', marginBottom: 12 }}>
      <div style={{ display: 'grid', gap: 9 }}>
        <input value={title} onChange={e => { setTitle(e.target.value); setErr(''); }} placeholder="Meeting title" style={inp} />
        <div style={{ display: 'flex', gap: 9 }}>
          {types.length > 0 && (
            <select value={eventTypeId} title="Meeting type"
              onChange={e => {
                setEventTypeId(e.target.value);
                const t = types.find(x => x.id === e.target.value);
                if (t) { setDuration(t.duration); setTime(''); }
              }}
              style={{ ...inp, cursor: 'pointer' }}>
              {types.map(t => <option key={t.id} value={t.id}>{t.name} ({t.duration} min)</option>)}
            </select>
          )}
          <select value={duration} title="Duration"
            onChange={e => { setDuration(Number(e.target.value)); setTime(''); }}
            style={{ ...inp, cursor: 'pointer' }}>
            {[15, 20, 30, 45, 60, 90].map(m => <option key={m} value={m}>{m} minutes</option>)}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Pick a day</div>
          {dates.length === 0 ? (
            <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9, padding: '8px 11px' }}>
              Nothing is bookable in your availability window. Open Scheduling → Availability to widen your hours.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {dates.map(ds => (
                <button key={ds} onClick={() => { setDate(ds); setTime(''); setErr(''); }} title={`Show slots on ${ds}`}
                  style={{
                    padding: '6px 11px', borderRadius: 9, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                    border: `1px solid ${date === ds ? INK : '#e2e8f0'}`,
                    background: date === ds ? INK : '#fff', color: date === ds ? '#fff' : '#475569',
                  }}>
                  {dayLabel(ds)}
                </button>
              ))}
            </div>
          )}
        </div>

        {date && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Pick a time {tzDiffers && <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>— their clock in brackets</span>}
            </div>
            {day.slots.length === 0 ? (
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{('reason' in day && day.reason) || 'No slots left on this day.'}</div>
            ) : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {day.slots.map(t => {
                  const instant = ownerInstant(date, t, ownerTz);
                  return (
                    <button key={t} onClick={() => { setTime(t); setErr(''); }} title={`Book ${fmt12(t)} ${ownerTz}`}
                      style={{
                        padding: '6px 11px', borderRadius: 9, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                        border: `1px solid ${time === t ? INK : '#e2e8f0'}`,
                        background: time === t ? INK : '#fff', color: time === t ? '#fff' : '#475569',
                      }}>
                      {fmt12(t)}
                      {tzDiffers && <span style={{ opacity: 0.65, marginLeft: 5 }}>({clockInZone(instant, contactTz)})</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Agenda or notes (optional)" rows={2}
          style={{ ...inp, resize: 'vertical' }} />
      </div>

      {err && <div style={{ fontSize: 11.5, color: '#dc2626', marginTop: 8 }}>{err}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} title="Close this form without saving" style={btn('#64748b', '#fff', '#e2e8f0')}><X size={11} /> Cancel</button>
        <button title={confirmLabel}
          onClick={() => {
            if (!date || !time) { setErr('Pick a day and a time first.'); return; }
            const type = types.find(t => t.id === eventTypeId);
            const ok = onConfirm({
              date, time, duration, title, notes,
              type: type?.name || 'Meeting',
              location: type?.location,
              eventTypeId: eventTypeId || undefined,
            });
            if (!ok) setErr('That slot is no longer available — pick another.');
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 15px', borderRadius: 9, border: 'none', background: INK, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          <Check size={12} /> {confirmLabel}
        </button>
      </div>
    </div>
  );
}

/* ── Post-meeting follow-up rules ── */

function FollowUpRules() {
  const [rules, setRules] = useState(() => loadFollowUpRules());
  const [open, setOpen] = useState(false);
  const active = rules.filter(r => r.enabled).length;

  const toggle = (id: string) => {
    const next = rules.map(r => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    setRules(next);
    saveFollowUpRules(next);
  };

  return (
    <div style={{ marginTop: 18, border: '1px solid #e6e9f0', borderRadius: 14, background: '#fff', overflow: 'hidden' }}>
      <button onClick={() => setOpen(v => !v)} title="What happens after a meeting is closed out"
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', border: 'none', background: 'transparent', cursor: 'pointer' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 800, color: INK }}>
          <Zap size={13} /> After a meeting
          <span style={{ padding: '2px 8px', borderRadius: 999, background: '#eef2ff', color: '#4f46e5', fontSize: 10, fontWeight: 800 }}>{active} on</span>
        </span>
        <ChevronRight size={14} color="#94a3b8" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div style={{ padding: '0 14px 14px' }}>
          <p style={{ margin: '0 0 10px', fontSize: 11.5, color: '#64748b', lineHeight: 1.5 }}>
            These run once per meeting, in the background, after you mark it completed or a no-show.
          </p>
          {rules.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #f1f5f9' }}>
              <button onClick={() => toggle(r.id)} title={r.enabled ? 'Turn this rule off' : 'Turn this rule on'}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', color: r.enabled ? '#16a34a' : '#cbd5e1', padding: 0 }}>
                {r.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
              </button>
              <span style={{ fontSize: 12, color: r.enabled ? INK : '#94a3b8', fontWeight: r.enabled ? 600 : 500 }}>{r.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
