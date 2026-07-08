import { useState } from 'react';
import {
  Calendar, Clock, Link, Settings, Check, X, Copy, Trash2,
  ChevronLeft, ChevronRight, User, Globe, Edit2, Plus,
} from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import type { DayAvailability } from '../../types';

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
  borderRadius: 14,
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
  const [tab, setTab] = useState<'bookings' | 'availability' | 'settings'>('bookings');
  const [copiedLink, setCopiedLink] = useState(false);
  const [bookingFilter, setBookingFilter] = useState<'all' | 'confirmed' | 'cancelled' | 'completed'>('all');

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

  const filteredBookings = bookings.filter(b => bookingFilter === 'all' || b.status === bookingFilter);
  const upcomingCount = bookings.filter(b => b.status === 'confirmed' && b.slotDate >= new Date().toISOString().split('T')[0]).length;

  return (
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100%' }}>
      <Header title="Scheduling" subtitle="Calendly-style booking management" />
      <div style={{ padding: 28 }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Upcoming Meetings', value: upcomingCount, color: '#6366f1' },
            { label: 'Total Bookings', value: bookings.length, color: '#3b82f6' },
            { label: 'Completed', value: bookings.filter(b => b.status === 'completed').length, color: '#22c55e' },
            { label: 'Cancelled', value: bookings.filter(b => b.status === 'cancelled').length, color: '#f59e0b' },
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
        <div style={{ ...CARD, padding: '20px 24px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(99,102,241,0.25)' }}>
              <Link size={19} color="white" />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 3 }}>Your Booking Page</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6366f1', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', backgroundColor: '#eef2ff', padding: '3px 10px', borderRadius: 999, display: 'inline-block' }}>{publicUrl}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={copyLink}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', border: `1px solid ${copiedLink ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 9, backgroundColor: copiedLink ? '#f0fdf4' : 'white', color: copiedLink ? '#16a34a' : '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
              {copiedLink ? <Check size={14} /> : <Copy size={14} />} {copiedLink ? 'Copied!' : 'Copy Link'}
            </button>
            <a href={publicUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', border: 'none', borderRadius: 9, backgroundColor: '#6366f1', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', boxShadow: '0 1px 2px rgba(16,24,40,0.08)' }}>
              Open Page
            </a>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'inline-flex', backgroundColor: '#f1f5f9', borderRadius: 10, padding: 4, gap: 2, marginBottom: 20 }}>
          {([['bookings', 'Bookings', <Calendar size={14} />], ['availability', 'Availability', <Clock size={14} />], ['settings', 'Settings', <Settings size={14} />]] as const).map(([id, label, icon]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: 'none', borderRadius: 8, backgroundColor: tab === id ? 'white' : 'transparent', color: tab === id ? '#6366f1' : '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: tab === id ? '0 1px 3px rgba(16,24,40,0.08)' : 'none', transition: 'all 0.15s' }}>
              {icon} {label}
            </button>
          ))}
        </div>

        {/* ── Bookings Tab ── */}
        {tab === 'bookings' && (
          <div style={{ ...CARD, overflow: 'hidden' }}>
            <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['all', 'confirmed', 'completed', 'cancelled'] as const).map(f => (
                  <button key={f} onClick={() => setBookingFilter(f)}
                    style={{ padding: '5px 14px', borderRadius: 999, border: `1px solid ${bookingFilter === f ? '#6366f1' : '#e2e8f0'}`, backgroundColor: bookingFilter === f ? '#6366f1' : 'white', color: bookingFilter === f ? 'white' : '#64748b', fontSize: 12, cursor: 'pointer', textTransform: 'capitalize', fontWeight: 600, transition: 'all 0.12s' }}>
                    {f}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>{filteredBookings.length} bookings</span>
            </div>

            {filteredBookings.length === 0 ? (
              <div style={{ padding: '56px 20px', textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <Calendar size={28} color="#6366f1" />
                </div>
                <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>No bookings yet</p>
                <p style={{ margin: '0 0 18px', fontSize: 13, color: '#94a3b8' }}>Share your booking page to start receiving meetings.</p>
                <button onClick={copyLink}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
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
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 15, fontWeight: 700, flexShrink: 0, boxShadow: '0 2px 6px rgba(99,102,241,0.25)' }}>
                        {booking.guestName.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>{booking.guestName}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>{booking.guestEmail}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>{fmtBookingTime(booking.slotDate, booking.slotTime)}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{schedule.duration} min · {booking.timezone}</div>
                      </div>
                      <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, backgroundColor: sc.bg, color: sc.color, textTransform: 'capitalize' }}>{booking.status}</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {booking.status === 'confirmed' && (
                          <button onClick={() => updateBooking(booking.id, { status: 'completed' })}
                            style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, border: '1px solid #bbf7d0', borderRadius: 9, backgroundColor: '#f0fdf4', color: '#16a34a', cursor: 'pointer' }}>
                            Complete
                          </button>
                        )}
                        {booking.status !== 'cancelled' && (
                          <button onClick={() => updateBooking(booking.id, { status: 'cancelled' })}
                            style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, border: '1px solid #fecaca', borderRadius: 9, backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>
                            Cancel
                          </button>
                        )}
                        <button onClick={() => deleteBooking(booking.id)}
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

        {/* ── Availability Tab ── */}
        {tab === 'availability' && (
          <div style={{ ...CARD, padding: 24 }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.2px' }}>Weekly Availability</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {DAYS.map(day => {
                const avail = schedule.weekly[day];
                return (
                  <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', backgroundColor: 'white', borderRadius: 12, border: `1px solid ${avail.enabled ? '#c7d2fe' : '#e6e9f0'}`, boxShadow: avail.enabled ? '0 1px 2px rgba(99,102,241,0.06)' : '0 1px 2px rgba(16,24,40,0.03)', transition: 'all 0.15s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: 140 }}>
                      <button onClick={() => updateDay(day, { enabled: !avail.enabled })}
                        style={{ width: 36, height: 20, borderRadius: 999, backgroundColor: avail.enabled ? '#6366f1' : '#e2e8f0', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0, padding: 0 }}>
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

            <div style={{ marginTop: 24, padding: '16px 20px', backgroundColor: '#eef2ff', borderRadius: 12, border: '1px solid #c7d2fe', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Globe size={16} color="#6366f1" style={{ flexShrink: 0, marginTop: 1 }} />
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
                <input type="number" min="1" max="20" value={schedule.dailyLimit} onChange={e => updateSchedule({ dailyLimit: Number(e.target.value) })}
                  style={INPUT} />
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
