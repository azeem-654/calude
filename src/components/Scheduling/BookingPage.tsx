import { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Clock, MapPin, Check, Calendar, Globe, Download, X, CalendarPlus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Booking, EventType, ScheduleAvailability } from '../../types';
import {
  fetchPublicConfig, fetchBookedSlots, createRemoteBooking,
  getRemoteBooking, cancelRemoteBooking, rescheduleRemoteBooking,
  buildIcs, googleCalendarUrl,
} from '../../services/booking';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAY_KEYS = ['sun','mon','tue','wed','thu','fri','sat'] as const;

function pad(n: number) { return String(n).padStart(2, '0'); }

function generateTimeSlots(from: string, to: string, duration: number, bufferAfter: number): string[] {
  const slots: string[] = [];
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  let cur = fh * 60 + fm;
  const end = th * 60 + tm;
  const step = duration + bufferAfter;
  while (cur + duration <= end) {
    slots.push(`${pad(Math.floor(cur / 60))}:${pad(cur % 60)}`);
    cur += step;
  }
  return slots;
}

/** Interpret `date time` as wall-clock in ownerTz and return the real instant. */
function ownerInstant(dateStr: string, time: string, ownerTz: string): Date {
  const utcGuess = new Date(`${dateStr}T${time}:00Z`);
  try {
    const tzAsUtc = new Date(utcGuess.toLocaleString('en-US', { timeZone: ownerTz }));
    return new Date(utcGuess.getTime() + (utcGuess.getTime() - tzAsUtc.getTime()));
  } catch { return new Date(`${dateStr}T${time}:00`); }
}

function ytIdFrom(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function fmt12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
}

type Step = 'event' | 'calendar' | 'form' | 'confirmed' | 'manage' | 'cancelled';

export default function BookingPage() {
  const { schedule, bookings, addBooking, addAppointment, contacts, addContact, addContactActivity } = useApp();

  const [today] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [remoteCfg, setRemoteCfg] = useState<(Partial<ScheduleAvailability>) | null | 'loading'>('loading');
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [eventType, setEventType] = useState<EventType | null>(null);
  const [step, setStep] = useState<Step>('calendar');
  const [guestForm, setGuestForm] = useState({ name: '', email: '', phone: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [bookedRemote, setBookedRemote] = useState<Record<string, { time: string; duration: number }[]>>({});
  const [confirmed, setConfirmed] = useState<{ date: string; time: string; name: string; manageUrl?: string } | null>(null);

  // Guest manage mode (?manage=<id>.<key>)
  const [manage, setManage] = useState<{ id: string; key: string; booking: Booking | null } | null>(null);
  const [rescheduling, setRescheduling] = useState(false);

  const visitorTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  /* Load the published config; fall back to this browser's local schedule. */
  useEffect(() => {
    let alive = true;
    fetchPublicConfig().then(cfg => { if (alive) setRemoteCfg(cfg); });
    const params = new URLSearchParams(window.location.search);
    const m = params.get('manage');
    if (m && m.includes('.')) {
      const [id, key] = m.split('.');
      getRemoteBooking(id, key).then(b => {
        if (!alive) return;
        setManage({ id, key, booking: b });
        setStep('manage');
      });
    }
    return () => { alive = false; };
  }, []);

  // Effective schedule = published config when available, else local (dev/preview).
  const cfg: ScheduleAvailability = useMemo(() => {
    if (remoteCfg && remoteCfg !== 'loading') return { ...schedule, ...remoteCfg } as ScheduleAvailability;
    return schedule;
  }, [remoteCfg, schedule]);

  const eventTypes = (cfg.eventTypes ?? []).length > 0 ? cfg.eventTypes! : [];
  const activeDuration = eventType?.duration ?? cfg.duration;
  const activeLocation = eventType?.location || cfg.location;
  const activeTitle = eventType?.name ?? cfg.title;
  const minNoticeMin = cfg.minNoticeMin ?? 0;
  const windowDays = cfg.windowDays ?? 365;
  const usingServer = !!(remoteCfg && remoteCfg !== 'loading');

  /* First step: event picker only when there are 2+ event types. */
  useEffect(() => {
    if (step === 'calendar' && eventTypes.length > 1 && !eventType) setStep('event');
    if (eventTypes.length === 1 && !eventType) setEventType(eventTypes[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventTypes.length, step]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = useMemo(() => {
    const arr: (Date | null)[] = Array(firstDayOfWeek).fill(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(year, month, d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [year, month, firstDayOfWeek, daysInMonth]);

  const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

  /* Booked slots for a date: server (real) + local fallback. */
  const bookedFor = (dateStr: string): { time: string; duration: number }[] => {
    const local = bookings.filter(b => b.slotDate === dateStr && b.status !== 'cancelled')
      .map(b => ({ time: b.slotTime, duration: b.duration ?? cfg.duration }));
    return [...(bookedRemote[dateStr] ?? []), ...local];
  };

  const isDayAvailable = (date: Date): boolean => {
    if (date < today) return false;
    const daysAhead = Math.round((date.getTime() - today.getTime()) / 86400000);
    if (daysAhead > windowDays) return false;
    const avail = cfg.weekly[DAY_KEYS[date.getDay()]];
    if (!avail.enabled) return false;
    return bookedFor(dateKey(date)).length < cfg.dailyLimit;
  };

  const getAvailableSlots = (date: Date): string[] => {
    const avail = cfg.weekly[DAY_KEYS[date.getDay()]];
    if (!avail.enabled) return [];
    const dateStr = dateKey(date);
    const all = generateTimeSlots(avail.from, avail.to, activeDuration, cfg.bufferAfter);
    const booked = bookedFor(dateStr).map(b => b.time);
    const now = Date.now();
    return all.filter(t => {
      if (booked.includes(t)) return false;
      // Minimum notice, computed against the real instant in the owner's timezone
      const instant = ownerInstant(dateStr, t, cfg.timezone);
      return instant.getTime() - now >= minNoticeMin * 60000;
    });
  };

  const handleDateClick = async (date: Date) => {
    if (!isDayAvailable(date)) return;
    setSelectedDate(date);
    setSelectedTime(null);
    if (usingServer) {
      const ds = dateKey(date);
      const booked = await fetchBookedSlots(ds);
      if (booked) setBookedRemote(prev => ({ ...prev, [ds]: booked }));
    }
  };

  const slots = selectedDate ? getAvailableSlots(selectedDate) : [];

  /** Visitor-local display for a slot (converted from the owner's timezone). */
  const slotLabel = (dateStr: string, t: string) => {
    try {
      return ownerInstant(dateStr, t, cfg.timezone).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch { return fmt12(t); }
  };

  const finalizeLocalRecords = (dateStr: string, time: string) => {
    // Also record locally (owner previewing / dev). Harmless for real visitors.
    addBooking({
      slotDate: dateStr, slotTime: time,
      guestName: guestForm.name.trim(), guestEmail: guestForm.email.trim(),
      guestPhone: guestForm.phone.trim(), notes: guestForm.notes.trim(),
      status: 'confirmed', timezone: visitorTz, createdAt: new Date().toISOString(),
      eventTypeId: eventType?.id, eventTypeName: activeTitle, duration: activeDuration, location: activeLocation,
    });
    addAppointment({
      title: `${activeTitle} — ${guestForm.name}`,
      contactId: '', contactName: guestForm.name.trim(),
      date: dateStr, time: fmt12(time), duration: activeDuration,
      status: 'scheduled', type: 'Video Call',
      notes: `Booked via scheduling page. ${guestForm.notes}`.trim(),
    });
    const existing = contacts.find(c => c.email.toLowerCase() === guestForm.email.toLowerCase());
    if (!existing) {
      addContact({
        name: guestForm.name.trim(), email: guestForm.email.trim(), phone: guestForm.phone.trim(),
        status: 'lead', tags: ['Booked Meeting'], source: 'Booking Page',
        createdAt: new Date().toISOString().split('T')[0], lastActivity: new Date().toISOString().split('T')[0], value: 0,
      });
    } else {
      addContactActivity(existing.id, {
        type: 'meeting',
        description: `Meeting booked: ${activeTitle} on ${dateStr} at ${fmt12(time)}`,
        timestamp: new Date().toISOString(),
      });
    }
  };

  const handleBook = async () => {
    if (!selectedDate || !selectedTime || !guestForm.name.trim() || !guestForm.email.trim()) return;
    setSubmitting(true);
    setError('');
    const dateStr = dateKey(selectedDate);

    if (rescheduling && manage) {
      const res = await rescheduleRemoteBooking(manage.id, manage.key, dateStr, selectedTime);
      setSubmitting(false);
      if (!res.ok) { setError(res.error || 'Reschedule failed.'); return; }
      setConfirmed({ date: dateStr, time: selectedTime, name: manage.booking?.guestName ?? '', manageUrl: `${window.location.origin}/book?manage=${manage.id}.${manage.key}` });
      setStep('confirmed');
      return;
    }

    // Server first (real cross-device booking + emails), local fallback.
    const res = await createRemoteBooking({
      eventTypeId: eventType?.id,
      slotDate: dateStr, slotTime: selectedTime,
      guestName: guestForm.name.trim(), guestEmail: guestForm.email.trim(),
      guestPhone: guestForm.phone.trim(), notes: guestForm.notes.trim(), timezone: visitorTz,
    });
    if (!res.ok && res.error !== 'unreachable') {
      setSubmitting(false);
      setError(res.error || 'Booking failed — please pick another slot.');
      return;
    }
    finalizeLocalRecords(dateStr, selectedTime);
    setSubmitting(false);
    setConfirmed({
      date: dateStr, time: selectedTime, name: guestForm.name,
      manageUrl: res.ok && res.id ? `${window.location.origin}/book?manage=${res.id}.${res.key}` : undefined,
    });
    setStep('confirmed');
  };

  const downloadIcs = (date: string, time: string) => {
    const blob = buildIcs({ title: activeTitle, description: cfg.description, location: activeLocation, date, time, durationMin: activeDuration });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'meeting.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 800);
  };

  /* ── Manage screen (guest cancel / reschedule) ── */
  if (step === 'manage') {
    const b = manage?.booking ?? null;
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ backgroundColor: 'white', borderRadius: 20, padding: '40px 36px', maxWidth: 480, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.1)' }}>
          {!b ? (
            <div style={{ textAlign: 'center' }}>
              <X size={40} color="#ef4444" style={{ margin: '0 auto 12px' }} />
              <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>Booking not found</h1>
              <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>This link is invalid or the booking no longer exists.</p>
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>Manage your booking</h1>
              <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 20px' }}>Hi {b.guestName} — here are your meeting details.</p>
              <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 18, border: '1px solid #e2e8f0', marginBottom: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>{b.eventTypeName ?? cfg.title}</div>
                <div style={{ fontSize: 14, color: '#374151', marginBottom: 4 }}>
                  {new Date(b.slotDate + 'T12:00:00').toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at {fmt12(b.slotTime)}
                </div>
                <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Status: <strong style={{ color: b.status === 'confirmed' ? '#16a34a' : '#ef4444', textTransform: 'capitalize' }}>{b.status}</strong></div>
              </div>
              {b.status === 'confirmed' && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setRescheduling(true); setStep(eventTypes.length > 1 ? 'calendar' : 'calendar'); }}
                    style={{ flex: 1, padding: '12px', backgroundColor: '#17191c', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    Reschedule
                  </button>
                  <button onClick={async () => {
                    if (manage && await cancelRemoteBooking(manage.id, manage.key)) setStep('cancelled');
                  }}
                    style={{ flex: 1, padding: '12px', backgroundColor: 'white', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    Cancel booking
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  if (step === 'cancelled') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ backgroundColor: 'white', borderRadius: 20, padding: '48px 40px', maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.1)', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
            <X size={30} color="#dc2626" />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>Booking cancelled</h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>A cancellation confirmation has been emailed to you. You can book a new time any time.</p>
        </div>
      </div>
    );
  }

  /* ── Confirmed screen ── */
  if (step === 'confirmed' && confirmed) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ backgroundColor: 'white', borderRadius: 20, padding: '48px 40px', maxWidth: 500, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.1)', textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, #22c55e, #16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Check size={36} color="white" />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>{rescheduling ? 'Rescheduled!' : "You're booked!"}</h1>
          <p style={{ fontSize: 15, color: '#64748b', margin: '0 0 24px' }}>A confirmation email is on its way to you.</p>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0', marginBottom: 20, textAlign: 'left' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>{activeTitle}</div>
            <div style={{ fontSize: 14, color: '#374151', marginBottom: 4 }}>
              {new Date(confirmed.date + 'T12:00:00').toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })} at {fmt12(confirmed.time)}
            </div>
            {activeLocation && <div style={{ fontSize: 13, color: '#64748b' }}>{activeLocation}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button onClick={() => downloadIcs(confirmed.date, confirmed.time)}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px', backgroundColor: 'white', color: '#17191c', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              <Download size={14} /> Download .ics
            </button>
            <a href={googleCalendarUrl({ title: activeTitle, description: cfg.description, location: activeLocation, date: confirmed.date, time: confirmed.time, durationMin: activeDuration })}
              target="_blank" rel="noopener noreferrer"
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px', backgroundColor: 'white', color: '#17191c', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', textDecoration: 'none' }}>
              <CalendarPlus size={14} /> Google Calendar
            </a>
          </div>
          {confirmed.manageUrl && (
            <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#94a3b8' }}>
              Need changes? <a href={confirmed.manageUrl} style={{ color: '#17191c', fontWeight: 700 }}>Reschedule or cancel</a>
            </p>
          )}
          <button onClick={() => { setStep(eventTypes.length > 1 ? 'event' : 'calendar'); setSelectedDate(null); setSelectedTime(null); setRescheduling(false); setGuestForm({ name: '', email: '', phone: '', notes: '' }); }}
            style={{ padding: '12px 28px', backgroundColor: '#17191c', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Book Another Meeting
          </button>
        </div>
      </div>
    );
  }

  /* ── Event type picker ── */
  if (step === 'event') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ backgroundColor: 'white', borderRadius: 20, padding: '40px 36px', maxWidth: 520, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.12)' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#17191c', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Calendar size={22} color="white" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>{cfg.title}</h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 22px' }}>{cfg.description || 'Pick the type of meeting you need.'}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {eventTypes.map(et => (
              <button key={et.id} onClick={() => { setEventType(et); setStep('calendar'); }}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', border: '1px solid #e2e8f0', borderRadius: 14, backgroundColor: 'white', cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#17191c'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(16,24,40,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none'; }}>
                <span style={{ width: 12, height: 44, borderRadius: 6, background: et.color || '#17191c', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{et.name}</span>
                  {et.description && <span style={{ display: 'block', fontSize: 13, color: '#64748b', marginTop: 2 }}>{et.description}</span>}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#64748b', fontWeight: 600, flexShrink: 0 }}>
                  <Clock size={14} /> {et.duration} min
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── Calendar + form ── */
  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(1200px 600px at 80% -10%, #e6e9f2 0%, transparent 60%), radial-gradient(900px 500px at -10% 110%, #e9e6f2 0%, transparent 55%), #f4f5f8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ backgroundColor: 'white', borderRadius: 26, boxShadow: '0 30px 80px -20px rgba(16,24,40,0.25)', overflow: 'hidden', width: '100%', maxWidth: step === 'form' ? 560 : 900, display: 'flex', flexDirection: step === 'form' ? 'column' : 'row', minHeight: 580 }}>

        {/* Left panel — brand side */}
        <div style={{ padding: '34px 28px', width: step === 'form' ? '100%' : 300, background: 'linear-gradient(160deg, #17191c 0%, #23262c 70%, #2b2333 100%)', color: 'white', flexShrink: 0, boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
          {eventTypes.length > 1 && (
            <button onClick={() => { setEventType(null); setStep('event'); setSelectedDate(null); setSelectedTime(null); }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.65)', fontSize: 12.5, fontWeight: 600, padding: '0 0 14px' }}>
              <ChevronLeft size={14} /> All meeting types
            </button>
          )}
          <div style={{ width: 52, height: 52, borderRadius: 16, background: eventType?.color || 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
            <Calendar size={24} color="white" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.02em' }}>{rescheduling ? `Reschedule: ${manage?.booking?.eventTypeName ?? activeTitle}` : activeTitle}</h1>
          <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.65)', margin: '0 0 18px', lineHeight: 1.55 }}>{eventType?.description || cfg.description}</p>

          {/* Short intro video */}
          {ytIdFrom(cfg.videoUrl) && step !== 'form' && (
            <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', marginBottom: 18, boxShadow: '0 12px 32px rgba(0,0,0,0.4)', aspectRatio: '16/9', background: '#000' }}>
              <iframe
                src={`https://www.youtube.com/embed/${ytIdFrom(cfg.videoUrl)}?rel=0&modestbranding=1`}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="Intro video"
              />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>
              <span style={{ width: 28, height: 28, borderRadius: 9, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Clock size={14} /></span>
              {activeDuration} minutes
            </div>
            {activeLocation && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>
                <span style={{ width: 28, height: 28, borderRadius: 9, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MapPin size={14} /></span>
                {activeLocation}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: 'rgba(255,255,255,0.55)' }}>
              <span style={{ width: 28, height: 28, borderRadius: 9, background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Globe size={13} /></span>
              Times shown in {visitorTz}
            </div>
          </div>

          {selectedDate && selectedTime && step === 'form' && (
            <div style={{ marginTop: 20, padding: '13px 15px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Selected Time</div>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>
                {selectedDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>{slotLabel(dateKey(selectedDate), selectedTime)}</div>
            </div>
          )}

          {/* Step indicator */}
          {step !== 'form' && (
            <div style={{ marginTop: 'auto', paddingTop: 22, display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>
              <span style={{ width: 22, height: 4, borderRadius: 99, background: '#8b8ff5' }} />
              <span style={{ width: 22, height: 4, borderRadius: 99, background: selectedDate ? '#8b8ff5' : 'rgba(255,255,255,0.15)' }} />
              <span style={{ width: 22, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.15)' }} />
              <span style={{ marginLeft: 6 }}>{selectedDate ? 'Pick a time' : 'Pick a date'}</span>
            </div>
          )}
        </div>

        {/* Calendar step */}
        {step === 'calendar' && (
          <div style={{ flex: 1, padding: '32px 28px', display: 'flex', gap: 24 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>{MONTHS[month]} {year}</h2>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => setViewDate(new Date(year, month - 1, 1))}
                    style={{ width: 32, height: 32, border: '1px solid #e2e8f0', borderRadius: 8, backgroundColor: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ChevronLeft size={15} color="#374151" />
                  </button>
                  <button onClick={() => setViewDate(new Date(year, month + 1, 1))}
                    style={{ width: 32, height: 32, border: '1px solid #e2e8f0', borderRadius: 8, backgroundColor: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ChevronRight size={15} color="#374151" />
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
                {DAYS_SHORT.map(d => (
                  <div key={d} style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', textAlign: 'center', padding: '4px 0' }}>{d}</div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
                {cells.map((date, i) => {
                  if (!date) return <div key={i} />;
                  const available = isDayAvailable(date);
                  const isSelected = selectedDate?.getTime() === date.getTime();
                  const isToday = date.getTime() === today.getTime();
                  return (
                    <button key={i} onClick={() => handleDateClick(date)} disabled={!available}
                      style={{
                        padding: '9px 4px', borderRadius: 8, border: isSelected ? '2px solid #17191c' : '1px solid transparent',
                        backgroundColor: isSelected ? '#17191c' : (available ? '#f8faff' : 'transparent'),
                        color: isSelected ? 'white' : (available ? '#0f172a' : '#d1d5db'),
                        fontSize: 13, fontWeight: isToday ? 700 : 400, cursor: available ? 'pointer' : 'default',
                        transition: 'all 0.1s',
                      }}
                      onMouseEnter={e => { if (available && !isSelected) e.currentTarget.style.backgroundColor = '#eceef1'; }}
                      onMouseLeave={e => { if (available && !isSelected) e.currentTarget.style.backgroundColor = '#f8faff'; }}>
                      {date.getDate()}
                      {isToday && !isSelected && <div style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#17191c', margin: '2px auto 0' }} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedDate && (
              <div style={{ width: 170, flexShrink: 0 }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#374151' }}>
                  {selectedDate.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 390, overflowY: 'auto', paddingRight: 4 }}>
                  {slots.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>No slots available</div>
                  ) : (
                    slots.map(slot => (
                      <button key={slot} onClick={() => { setSelectedTime(slot); if (rescheduling) { handleBookReschedule(slot); } else { setStep('form'); } }}
                        style={{ padding: '11px 8px', border: `1.5px solid ${selectedTime === slot ? '#17191c' : '#e6e9f0'}`, borderRadius: 11, backgroundColor: selectedTime === slot ? '#17191c' : 'white', color: selectedTime === slot ? 'white' : '#17191c', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', transition: 'all 0.12s', textAlign: 'center' }}
                        onMouseEnter={e => { if (selectedTime !== slot) { e.currentTarget.style.borderColor = '#17191c'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
                        onMouseLeave={e => { if (selectedTime !== slot) { e.currentTarget.style.borderColor = '#e6e9f0'; e.currentTarget.style.transform = 'none'; } }}>
                        {slotLabel(dateKey(selectedDate), slot)}
                      </button>
                    ))
                  )}
                </div>
                {error && <p style={{ marginTop: 10, fontSize: 12, color: '#dc2626', fontWeight: 600 }}>{error}</p>}
              </div>
            )}
          </div>
        )}

        {/* Form step */}
        {step === 'form' && (
          <div style={{ flex: 1, padding: '32px 28px', display: 'flex', flexDirection: 'column' }}>
            <button onClick={() => setStep('calendar')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', cursor: 'pointer', color: '#17191c', fontSize: 13, fontWeight: 600, padding: '0 0 16px', width: 'fit-content' }}>
              <ChevronLeft size={15} /> Back to calendar
            </button>

            <h2 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Your Information</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Full Name *</label>
                <input value={guestForm.name} onChange={e => setGuestForm(p => ({ ...p, name: e.target.value }))} placeholder="John Smith"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Email Address *</label>
                <input type="email" value={guestForm.email} onChange={e => setGuestForm(p => ({ ...p, email: e.target.value }))} placeholder="john@example.com"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Phone (for SMS reminders)</label>
                <input value={guestForm.phone} onChange={e => setGuestForm(p => ({ ...p, phone: e.target.value }))} placeholder="+1 (555) 000-0000"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Notes (optional)</label>
                <textarea value={guestForm.notes} onChange={e => setGuestForm(p => ({ ...p, notes: e.target.value }))} placeholder="Anything you'd like to discuss..."
                  rows={3} style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              {error && <p style={{ margin: 0, fontSize: 13, color: '#dc2626', fontWeight: 600 }}>{error}</p>}
              <button onClick={handleBook} disabled={submitting || !guestForm.name.trim() || !guestForm.email.trim()}
                style={{ padding: '13px 24px', backgroundColor: (submitting || !guestForm.name.trim() || !guestForm.email.trim()) ? '#d5d8dd' : '#17191c', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: (submitting || !guestForm.name.trim() || !guestForm.email.trim()) ? 'default' : 'pointer', marginTop: 4 }}>
                {submitting ? 'Booking...' : 'Confirm Booking'}
              </button>
              <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
                You'll get a confirmation email with reschedule & cancel links.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  /* Reschedule shortcut: picking a slot in reschedule mode confirms immediately. */
  async function handleBookReschedule(slot: string) {
    if (!selectedDate || !manage) return;
    setSubmitting(true);
    setError('');
    const dateStr = dateKey(selectedDate);
    const res = await rescheduleRemoteBooking(manage.id, manage.key, dateStr, slot);
    setSubmitting(false);
    if (!res.ok) { setError(res.error || 'Reschedule failed.'); return; }
    setConfirmed({ date: dateStr, time: slot, name: manage.booking?.guestName ?? '', manageUrl: `${window.location.origin}/book?manage=${manage.id}.${manage.key}` });
    setStep('confirmed');
  }
}
