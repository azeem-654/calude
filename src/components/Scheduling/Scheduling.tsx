import { useState, useEffect, useRef } from 'react';
import {
  Calendar, Clock, Link, Settings, Check, Copy, Trash2,
  Globe, Plus, Zap, Layers, CloudUpload, Mail, MessageSquare,
} from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import type { DayAvailability, EventType, SchedulingAutomations, Booking } from '../../types';
import { getSession } from '../../services/auth';
import { publishBookingConfig, listRemoteBookings, setRemoteBookingStatus } from '../../services/booking';

const ET_COLORS = ['#17191c', '#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#0ea5e9'];

const DEFAULT_AUTOMATIONS: SchedulingAutomations = {
  confirmEmail: true, ownerNotify: false, ownerEmail: '',
  reminderEmail: true, reminderMinutes: 60, reminderSms: false,
  twilioSid: '', twilioToken: '', twilioFrom: '',
  followupEmail: false, followupText: '',
};

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type DayKey = typeof DAYS[number];
const DAY_LABELS: Record<DayKey, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    TIME_OPTIONS.push(`${hh}:${mm}`);
  }
}

const DURATION_OPTIONS = [15, 20, 30, 45, 60, 90, 120];
const BUFFER_OPTIONS = [0, 5, 10, 15, 30, 45, 60];

function fmtBookingTime(date: string, time: string) {
  return `${new Date(date + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} at ${time}`;
}

const statusColors: Record<string, { bg: string; color: string }> = {
  confirmed: { bg: '#dcfce7', color: '#16a34a' },
  cancelled: { bg: '#fee2e2', color: '#dc2626' },
  completed: { bg: '#f0f9ff', color: '#0369a1' },
  rescheduled: { bg: '#fef3c7', color: '#d97706' },
};

const CARD: React.CSSProperties = {
  backgroundColor: 'white',
  borderRadius: 18,
  border: '1px solid #e6e9f0',
  boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
};

const INPUT: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 9,
  fontSize: 13, color: '#0f172a', outline: 'none', boxSizing: 'border-box',
  backgroundColor: 'white', fontFamily: 'inherit',
};

const LABEL: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6,
};

export default function Scheduling() {
  const { schedule, updateSchedule, bookings, updateBooking, deleteBooking, addNotification } = useApp();
  const [tab, setTab] = useState<'bookings' | 'types' | 'availability' | 'automations' | 'settings'>('bookings');
  const [copiedLink, setCopiedLink] = useState(false);
  const [bookingFilter, setBookingFilter] = useState<'all' | 'confirmed' | 'cancelled' | 'completed'>('all');
  const [remoteBookings, setRemoteBookings] = useState<Booking[]>([]);
  const [pubState, setPubState] = useState<'idle' | 'saving' | 'published' | 'local'>('idle');
  const pubTimer = useRef<number | undefined>(undefined);

  const auto: SchedulingAutomations = { ...DEFAULT_AUTOMATIONS, ...(schedule.automations ?? {}) };
  const eventTypes: EventType[] = schedule.eventTypes ?? [];
  const setAuto = (patch: Partial<SchedulingAutomations>) => updateSchedule({ automations: { ...auto, ...patch } });

  /* Pull server-side bookings (real visitor bookings live there). */
  useEffect(() => {
    const token = getSession()?.token;
    if (!token) return;
    listRemoteBookings(token).then(list => { if (list) setRemoteBookings(list); });
  }, []);

  /* Auto-publish the schedule so the public page + reminder engine stay in sync. */
  useEffect(() => {
    const token = getSession()?.token;
    if (!token) { setPubState('local'); return; }
    setPubState('saving');
    window.clearTimeout(pubTimer.current);
    pubTimer.current = window.setTimeout(async () => {
      const ok = await publishBookingConfig(token, schedule);
      setPubState(ok ? 'published' : 'local');
    }, 1200);
    return () => window.clearTimeout(pubTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule]);

  /* Event type helpers */
  const addEventType = () => {
    const et: EventType = { id: `et-${Date.now()}`, name: 'New meeting', duration: 30, description: '', location: schedule.location, color: ET_COLORS[eventTypes.length % ET_COLORS.length] };
    updateSchedule({ eventTypes: [...eventTypes, et] });
  };
  const patchEventType = (id: string, patch: Partial<EventType>) =>
    updateSchedule({ eventTypes: eventTypes.map(e => e.id === id ? { ...e, ...patch } : e) });
  const removeEventType = (id: string) =>
    updateSchedule({ eventTypes: eventTypes.filter(e => e.id !== id) });

  const publicUrl = `${window.location.origin}${import.meta.env.BASE_URL}book`;

  const copyLink = () => {
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      addNotification('Booking link copied to clipboard!');
    });
  };

  const updateDay = (day: DayKey, updates: Partial<DayAvailability>) => {
    updateSchedule({ weekly: { ...schedule.weekly, [day]: { ...schedule.weekly[day], ...updates } } });
  };

  // Merge server bookings (visitors) with local ones (owner previews), de-duplicated.
  const localKeys = new Set(bookings.map(b => `${b.slotDate}|${b.slotTime}|${b.guestEmail.toLowerCase()}`));
  const merged: Booking[] = [
    ...remoteBookings.filter(r => !localKeys.has(`${r.slotDate}|${r.slotTime}|${r.guestEmail.toLowerCase()}`)),
    ...bookings,
  ].sort((a, b) => (b.slotDate + b.slotTime).localeCompare(a.slotDate + a.slotTime));

  const setBookingStatus = (b: Booking, status: 'confirmed' | 'cancelled' | 'completed') => {
    if (b.remote) {
      const token = getSession()?.token;
      if (token) setRemoteBookingStatus(token, b.id, status);
      setRemoteBookings(prev => prev.map(x => x.id === b.id ? { ...x, status } : x));
    } else {
      updateBooking(b.id, { status });
    }
  };

  const filteredBookings = merged.filter(b => bookingFilter === 'all' || b.status === bookingFilter);
  const upcomingCount = merged.filter(b => b.status === 'confirmed' && b.slotDate >= new Date().toISOString().split('T')[0]).length;

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header title="Booking pages" subtitle="Let people book you without the email chain" />
      <div style={{ padding: 28 }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Upcoming Meetings', value: upcomingCount, color: '#17191c' },
            { label: 'Total Bookings', value: merged.length, color: '#3b82f6' },
            { label: 'Completed', value: merged.filter(b => b.status === 'completed').length, color: '#22c55e' },
            { label: 'Cancelled', value: merged.filter(b => b.status === 'cancelled').length, color: '#f59e0b' },
          ].map(s => (
            <div key={s.label} style={{ ...CARD, padding: '20px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '0 0 8px' }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: s.color, flexShrink: 0 }} />
                <p style={{ fontSize: 12, color: '#475569', fontWeight: 600, margin: 0, letterSpacing: '0.2px' }}>{s.label}</p>
              </div>
              <p style={{ fontSize: 26, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Booking link card */}
        <div style={{ ...CARD, padding: '20px 24px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: '#17191c', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(23,25,28,0.25)' }}>
              <Link size={19} color="white" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 3 }}>Your Booking Page</div>
              {/* An address has no spaces in it, so it has to be told it may
                  break — otherwise one long URL widens the whole page. */}
              <div style={{ fontSize: 12, fontWeight: 600, color: '#17191c', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', backgroundColor: '#eceef1', padding: '3px 10px', borderRadius: 999, display: 'inline-block', maxWidth: '100%', overflowWrap: 'anywhere' }}>{publicUrl}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={copyLink}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', border: `1px solid ${copiedLink ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 9, backgroundColor: copiedLink ? '#f0fdf4' : 'white', color: copiedLink ? '#16a34a' : '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
              {copiedLink ? <Check size={14} /> : <Copy size={14} />} {copiedLink ? 'Copied!' : 'Copy Link'}
            </button>
            <a href={publicUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', border: 'none', borderRadius: 9, backgroundColor: '#17191c', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', boxShadow: '0 1px 2px rgba(16,24,40,0.08)' }}>
              Open Page
            </a>
          </div>
        </div>

        {/* Publish state */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, fontSize: 12.5, fontWeight: 600, color: pubState === 'published' ? '#16a34a' : pubState === 'local' ? '#b45309' : '#64748b' }}>
          <CloudUpload size={14} />
          {pubState === 'saving' ? 'Publishing booking page…'
            : pubState === 'published' ? 'Booking page live — visitors see your latest settings, and their bookings appear here automatically.'
            : pubState === 'local' ? "Couldn't publish the booking page — make sure you're signed in and the site is deployed, then reopen this page."
            : ''}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', backgroundColor: '#f1f5f9', borderRadius: 10, padding: 4, gap: 2, marginBottom: 20 }}>
          {([['bookings', 'Bookings', <Calendar size={14} />], ['types', 'Event Types', <Layers size={14} />], ['availability', 'Availability', <Clock size={14} />], ['automations', 'Automations', <Zap size={14} />], ['settings', 'Settings', <Settings size={14} />]] as const).map(([id, label, icon]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: 'none', borderRadius: 8, backgroundColor: tab === id ? 'white' : 'transparent', color: tab === id ? '#17191c' : '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: tab === id ? '0 1px 3px rgba(16,24,40,0.08)' : 'none', transition: 'all 0.15s' }}>
              {icon} {label}
            </button>
          ))}
        </div>

        {/* ── Bookings Tab ── */}
        {tab === 'bookings' && (
          <div style={{ ...CARD, overflow: 'hidden' }}>
            <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(['all', 'confirmed', 'completed', 'cancelled'] as const).map(f => (
                  <button key={f} onClick={() => setBookingFilter(f)}
                    style={{ padding: '5px 14px', borderRadius: 999, border: `1px solid ${bookingFilter === f ? '#17191c' : '#e2e8f0'}`, backgroundColor: bookingFilter === f ? '#17191c' : 'white', color: bookingFilter === f ? 'white' : '#64748b', fontSize: 12, cursor: 'pointer', textTransform: 'capitalize', fontWeight: 600, transition: 'all 0.12s' }}>
                    {f}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>{filteredBookings.length} bookings</span>
            </div>

            {filteredBookings.length === 0 ? (
              <div style={{ padding: '56px 20px', textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: '#eceef1', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <Calendar size={28} color="#17191c" />
                </div>
                <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>No bookings yet</p>
                <p style={{ margin: '0 0 18px', fontSize: 13, color: '#94a3b8' }}>Share your booking page to start receiving meetings.</p>
                <button onClick={copyLink}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', backgroundColor: '#17191c', color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <Copy size={14} /> Copy Booking Link
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {filteredBookings.map((booking, i) => {
                  const sc = statusColors[booking.status] ?? { bg: '#f8fafc', color: '#64748b' };
                  const isPast = booking.slotDate < new Date().toISOString().split('T')[0];
                  return (
                    <div key={booking.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 22px', borderBottom: i < filteredBookings.length - 1 ? '1px solid #f1f5f9' : 'none', opacity: isPast && booking.status === 'confirmed' ? 0.6 : 1, transition: 'background 0.12s' }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#17191c', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 15, fontWeight: 700, flexShrink: 0, boxShadow: '0 2px 6px rgba(23,25,28,0.25)' }}>
                        {booking.guestName.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>{booking.guestName}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>{booking.guestEmail}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>{fmtBookingTime(booking.slotDate, booking.slotTime)}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{booking.eventTypeName ? `${booking.eventTypeName} · ` : ''}{booking.duration ?? schedule.duration} min{booking.remote ? ' · 🌐 via booking page' : ''}</div>
                      </div>
                      <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, backgroundColor: sc.bg, color: sc.color, textTransform: 'capitalize' }}>{booking.status}</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {booking.status === 'confirmed' && (
                          <button onClick={() => setBookingStatus(booking, 'completed')}
                            style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, border: '1px solid #bbf7d0', borderRadius: 9, backgroundColor: '#f0fdf4', color: '#16a34a', cursor: 'pointer' }}>
                            Complete
                          </button>
                        )}
                        {booking.status !== 'cancelled' && (
                          <button onClick={() => setBookingStatus(booking, 'cancelled')}
                            style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, border: '1px solid #fecaca', borderRadius: 9, backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>
                            Cancel
                          </button>
                        )}
                        <button onClick={() => booking.remote ? setBookingStatus(booking, 'cancelled') : deleteBooking(booking.id)}
                          style={{ padding: 7, border: '1px solid #e2e8f0', borderRadius: 9, backgroundColor: 'white', cursor: 'pointer', display: 'flex' }}>
                          <Trash2 size={13} color="#94a3b8" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Event Types Tab ── */}
        {tab === 'types' && (
          <div style={{ ...CARD, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Event Types</h3>
              <button onClick={addEventType} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', backgroundColor: '#17191c', color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <Plus size={14} /> New Event Type
              </button>
            </div>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: '#64748b' }}>Different meetings visitors can book — like Calendly. With 2+ types, the booking page shows a picker first.</p>
            {eventTypes.length === 0 && (
              <div style={{ padding: '32px 20px', textAlign: 'center', border: '2px dashed #e2e8f0', borderRadius: 12, color: '#94a3b8', fontSize: 13.5 }}>
                No event types yet — visitors book your default "{schedule.title}" ({schedule.duration} min). Add types like "15-min intro" or "60-min strategy call".
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {eventTypes.map(et => (
                <div key={et.id} style={{ border: '1px solid #e6e9f0', borderRadius: 14, padding: 18 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))', gap: 12, alignItems: 'end', marginBottom: 12 }}>
                    <div>
                      <label style={LABEL}>Name</label>
                      <input value={et.name} onChange={e => patchEventType(et.id, { name: e.target.value })} style={INPUT} />
                    </div>
                    <div>
                      <label style={LABEL}>Duration</label>
                      <select value={et.duration} onChange={e => patchEventType(et.id, { duration: Number(e.target.value) })} style={{ ...INPUT, cursor: 'pointer' }}>
                        {DURATION_OPTIONS.map(d => <option key={d} value={d}>{d} min</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={LABEL}>Color</label>
                      <div style={{ display: 'flex', gap: 5 }}>
                        {ET_COLORS.map(c => (
                          <button key={c} onClick={() => patchEventType(et.id, { color: c })}
                            style={{ width: 24, height: 24, borderRadius: 999, background: c, border: et.color === c ? '3px solid #94a3b8' : '3px solid transparent', cursor: 'pointer', padding: 0 }} />
                        ))}
                      </div>
                    </div>
                    <button onClick={() => removeEventType(et.id)} title="Delete" style={{ padding: 9, border: '1px solid #fecaca', borderRadius: 9, backgroundColor: '#fef2f2', cursor: 'pointer', display: 'flex' }}>
                      <Trash2 size={14} color="#dc2626" />
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={LABEL}>Description (shown on booking page)</label>
                      <input value={et.description} onChange={e => patchEventType(et.id, { description: e.target.value })} placeholder="Quick intro call to see if we're a fit" style={INPUT} />
                    </div>
                    <div>
                      <label style={LABEL}>Location / meeting link</label>
                      <input value={et.location} onChange={e => patchEventType(et.id, { location: e.target.value })} placeholder="Zoom / Google Meet link" style={INPUT} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Automations Tab ── */}
        {tab === 'automations' && (
          <div style={{ ...CARD, padding: 24 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Automations</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b' }}>Calendly-style workflows — emails send through your SMTP settings (Settings → Email); SMS uses your Twilio account.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Confirmation */}
              <div style={{ border: '1px solid #e6e9f0', borderRadius: 14, padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
                <Mail size={18} color="#16a34a" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>Booking confirmation email</div>
                  <div style={{ fontSize: 12.5, color: '#64748b' }}>Sent to the guest immediately, with reschedule & cancel links.</div>
                </div>
                <button onClick={() => setAuto({ confirmEmail: !auto.confirmEmail })}
                  style={{ width: 40, height: 22, borderRadius: 999, backgroundColor: auto.confirmEmail ? '#17191c' : '#e2e8f0', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, padding: 0 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: 2, left: auto.confirmEmail ? 20 : 2, transition: 'left 0.2s' }} />
                </button>
              </div>

              {/* Owner notify */}
              <div style={{ border: '1px solid #e6e9f0', borderRadius: 14, padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: auto.ownerNotify ? 12 : 0 }}>
                  <Mail size={18} color="#0ea5e9" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>Notify me of new bookings & cancellations</div>
                    <div style={{ fontSize: 12.5, color: '#64748b' }}>An email lands in your inbox the moment a visitor books.</div>
                  </div>
                  <button onClick={() => setAuto({ ownerNotify: !auto.ownerNotify })}
                    style={{ width: 40, height: 22, borderRadius: 999, backgroundColor: auto.ownerNotify ? '#17191c' : '#e2e8f0', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, padding: 0 }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: 2, left: auto.ownerNotify ? 20 : 2, transition: 'left 0.2s' }} />
                  </button>
                </div>
                {auto.ownerNotify && (
                  <input value={auto.ownerEmail} onChange={e => setAuto({ ownerEmail: e.target.value })} placeholder="you@yourbusiness.com" style={{ ...INPUT, maxWidth: 320 }} />
                )}
              </div>

              {/* Reminder */}
              <div style={{ border: '1px solid #e6e9f0', borderRadius: 14, padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: auto.reminderEmail ? 12 : 0 }}>
                  <Clock size={18} color="#f59e0b" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>Reminder before the meeting</div>
                    <div style={{ fontSize: 12.5, color: '#64748b' }}>Email (and optional SMS) so guests actually show up.</div>
                  </div>
                  <button onClick={() => setAuto({ reminderEmail: !auto.reminderEmail })}
                    style={{ width: 40, height: 22, borderRadius: 999, backgroundColor: auto.reminderEmail ? '#17191c' : '#e2e8f0', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, padding: 0 }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: 2, left: auto.reminderEmail ? 20 : 2, transition: 'left 0.2s' }} />
                  </button>
                </div>
                {auto.reminderEmail && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <div>
                      <label style={LABEL}>Send reminder</label>
                      <select value={auto.reminderMinutes} onChange={e => setAuto({ reminderMinutes: Number(e.target.value) })} style={{ ...INPUT, width: 200, cursor: 'pointer' }}>
                        {[15, 30, 60, 120, 240, 1440].map(m => <option key={m} value={m}>{m < 60 ? `${m} minutes` : m === 1440 ? '24 hours' : `${m / 60} hours`} before</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 18 }}>
                      <button onClick={() => setAuto({ reminderSms: !auto.reminderSms })}
                        style={{ width: 40, height: 22, borderRadius: 999, backgroundColor: auto.reminderSms ? '#17191c' : '#e2e8f0', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, padding: 0 }}>
                        <div style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: 2, left: auto.reminderSms ? 20 : 2, transition: 'left 0.2s' }} />
                      </button>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 5 }}><MessageSquare size={13} /> Also send SMS</span>
                    </div>
                  </div>
                )}
                {auto.reminderEmail && auto.reminderSms && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(170px, 100%), 1fr))', gap: 10, marginTop: 12 }}>
                    <div><label style={LABEL}>Twilio Account SID</label><input value={auto.twilioSid} onChange={e => setAuto({ twilioSid: e.target.value })} placeholder="AC…" style={INPUT} /></div>
                    <div><label style={LABEL}>Auth Token</label><input type="password" value={auto.twilioToken} onChange={e => setAuto({ twilioToken: e.target.value })} style={INPUT} /></div>
                    <div><label style={LABEL}>From number</label><input value={auto.twilioFrom} onChange={e => setAuto({ twilioFrom: e.target.value })} placeholder="+15551234567" style={INPUT} /></div>
                  </div>
                )}
              </div>

              {/* Follow-up */}
              <div style={{ border: '1px solid #e6e9f0', borderRadius: 14, padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: auto.followupEmail ? 12 : 0 }}>
                  <Check size={18} color="#8b5cf6" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>Follow-up email after the meeting</div>
                    <div style={{ fontSize: 12.5, color: '#64748b' }}>A thank-you note sent automatically once the meeting ends.</div>
                  </div>
                  <button onClick={() => setAuto({ followupEmail: !auto.followupEmail })}
                    style={{ width: 40, height: 22, borderRadius: 999, backgroundColor: auto.followupEmail ? '#17191c' : '#e2e8f0', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, padding: 0 }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: 2, left: auto.followupEmail ? 20 : 2, transition: 'left 0.2s' }} />
                  </button>
                </div>
                {auto.followupEmail && (
                  <textarea value={auto.followupText} onChange={e => setAuto({ followupText: e.target.value })} rows={3}
                    placeholder="Thanks for meeting with us! If you have any questions or want to book a follow-up, just reply to this email."
                    style={{ ...INPUT, resize: 'vertical' }} />
                )}
              </div>

              <div style={{ padding: '13px 18px', backgroundColor: '#eceef1', borderRadius: 12, border: '1px solid #d5d8dd', fontSize: 12.5, color: '#475569', lineHeight: 1.55 }}>
                Reminders and follow-ups are processed server-side whenever the booking page or your CRM is opened. Emails use the SMTP settings from <strong>Settings → Email</strong>; make sure they're configured.
              </div>
            </div>
          </div>
        )}

        {/* ── Availability Tab ── */}
        {tab === 'availability' && (
          <div style={{ ...CARD, padding: 24 }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.2px' }}>Weekly Availability</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {DAYS.map(day => {
                const avail = schedule.weekly[day];
                return (
                  <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', backgroundColor: 'white', borderRadius: 12, border: `1px solid ${avail.enabled ? '#d5d8dd' : '#e6e9f0'}`, boxShadow: avail.enabled ? '0 1px 2px rgba(23,25,28,0.06)' : '0 1px 2px rgba(16,24,40,0.03)', transition: 'all 0.15s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: 140 }}>
                      <button onClick={() => updateDay(day, { enabled: !avail.enabled })}
                        style={{ width: 36, height: 20, borderRadius: 999, backgroundColor: avail.enabled ? '#17191c' : '#e2e8f0', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0, padding: 0 }}>
                        <div style={{ width: 16, height: 16, borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: 2, left: avail.enabled ? 18 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(16,24,40,0.25)' }} />
                      </button>
                      <span style={{ fontSize: 13, fontWeight: 600, color: avail.enabled ? '#0f172a' : '#94a3b8' }}>{DAY_LABELS[day]}</span>
                    </div>
                    {avail.enabled ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <select value={avail.from} onChange={e => updateDay(day, { from: e.target.value })}
                          style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13, color: '#475569', outline: 'none', cursor: 'pointer', backgroundColor: 'white', fontWeight: 500 }}>
                          {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>to</span>
                        <select value={avail.to} onChange={e => updateDay(day, { to: e.target.value })}
                          style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13, color: '#475569', outline: 'none', cursor: 'pointer', backgroundColor: 'white', fontWeight: 500 }}>
                          {TIME_OPTIONS.filter(t => t > avail.from).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', backgroundColor: '#f1f5f9', padding: '3px 10px', borderRadius: 999 }}>Unavailable</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 24, padding: '16px 20px', backgroundColor: '#eceef1', borderRadius: 12, border: '1px solid #d5d8dd', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Globe size={16} color="#17191c" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600, marginBottom: 3 }}>Timezone</div>
                <div style={{ fontSize: 13, color: '#475569' }}>{schedule.timezone} — visitors see times in their local timezone automatically.</div>
              </div>
            </div>
          </div>
        )}

        {/* ── Settings Tab ── */}
        {tab === 'settings' && (
          <div style={{ ...CARD, padding: 24 }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.2px' }}>Meeting Settings</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

              <div>
                <label style={LABEL}>Meeting Title</label>
                <input value={schedule.title} onChange={e => updateSchedule({ title: e.target.value })}
                  style={INPUT} />
              </div>

              <div>
                <label style={LABEL}>Booking URL Slug</label>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: 9, overflow: 'hidden', backgroundColor: 'white' }}>
                  <span style={{ padding: '9px 10px', backgroundColor: '#f8fafc', fontSize: 12, color: '#94a3b8', borderRight: '1px solid #e2e8f0', whiteSpace: 'nowrap', fontWeight: 500 }}>/book/</span>
                  <input value={schedule.slug} onChange={e => updateSchedule({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                    style={{ flex: 1, padding: '9px 12px', border: 'none', fontSize: 13, outline: 'none', color: '#0f172a', fontFamily: 'inherit' }} />
                </div>
              </div>

              <div>
                <label style={LABEL}>Meeting Duration</label>
                <select value={schedule.duration} onChange={e => updateSchedule({ duration: Number(e.target.value) })}
                  style={{ ...INPUT, cursor: 'pointer' }}>
                  {DURATION_OPTIONS.map(d => <option key={d} value={d}>{d} minutes</option>)}
                </select>
              </div>

              <div>
                <label style={LABEL}>Daily Booking Limit</label>
                {/* Clamped, not merely advised. min/max on the element are a hint the
                    browser can ignore; a negative value here made isDayAvailable
                    compare `0 < -5` for every date, so the public booking page
                    silently showed no availability at all. */}
                <input type="number" min="1" max="50" value={schedule.dailyLimit}
                  onChange={e => {
                    const n = Math.floor(Number(e.target.value));
                    updateSchedule({ dailyLimit: Number.isFinite(n) ? Math.min(50, Math.max(1, n)) : 1 });
                  }}
                  style={INPUT} />
              </div>

              <div>
                <label style={LABEL}>Minimum Notice</label>
                <select value={schedule.minNoticeMin ?? 120} onChange={e => updateSchedule({ minNoticeMin: Number(e.target.value) })}
                  style={{ ...INPUT, cursor: 'pointer' }}>
                  {[0, 30, 60, 120, 240, 480, 1440].map(m => <option key={m} value={m}>{m === 0 ? 'No minimum' : m < 60 ? `${m} minutes` : m === 1440 ? '24 hours' : `${m / 60} hours`}</option>)}
                </select>
              </div>

              <div>
                <label style={LABEL}>Booking Window (days ahead)</label>
                <select value={schedule.windowDays ?? 60} onChange={e => updateSchedule({ windowDays: Number(e.target.value) })}
                  style={{ ...INPUT, cursor: 'pointer' }}>
                  {[7, 14, 30, 60, 90, 180, 365].map(d => <option key={d} value={d}>{d} days</option>)}
                </select>
              </div>

              <div>
                <label style={LABEL}>Buffer Before (min)</label>
                <select value={schedule.bufferBefore} onChange={e => updateSchedule({ bufferBefore: Number(e.target.value) })}
                  style={{ ...INPUT, cursor: 'pointer' }}>
                  {BUFFER_OPTIONS.map(b => <option key={b} value={b}>{b === 0 ? 'No buffer' : `${b} minutes`}</option>)}
                </select>
              </div>

              <div>
                <label style={LABEL}>Buffer After (min)</label>
                <select value={schedule.bufferAfter} onChange={e => updateSchedule({ bufferAfter: Number(e.target.value) })}
                  style={{ ...INPUT, cursor: 'pointer' }}>
                  {BUFFER_OPTIONS.map(b => <option key={b} value={b}>{b === 0 ? 'No buffer' : `${b} minutes`}</option>)}
                </select>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LABEL}>Meeting Location / Link</label>
                <input value={schedule.location} onChange={e => updateSchedule({ location: e.target.value })} placeholder="Zoom link, Google Meet, or address..."
                  style={INPUT} />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LABEL}>Intro Video — YouTube URL (shown on booking page)</label>
                <input value={schedule.videoUrl ?? ''} onChange={e => updateSchedule({ videoUrl: e.target.value })} placeholder="https://www.youtube.com/watch?v=…  (a short welcome video builds trust)"
                  style={INPUT} />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LABEL}>Description (shown on booking page)</label>
                <textarea value={schedule.description} onChange={e => updateSchedule({ description: e.target.value })} rows={3}
                  style={{ ...INPUT, resize: 'vertical' }} />
              </div>
            </div>

            <div style={{ marginTop: 20, padding: '13px 18px', backgroundColor: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check size={15} color="#16a34a" style={{ flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: 13, color: '#16a34a', fontWeight: 600 }}>Settings auto-save as you type</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
