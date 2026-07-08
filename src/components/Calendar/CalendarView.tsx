import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Clock, Video, X, CalendarDays } from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import type { Appointment } from '../../types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const statusColors: Record<string, string> = {
  scheduled: '#6366f1', completed: '#22c55e', cancelled: '#ef4444', 'no-show': '#f59e0b',
};

const INPUT: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 9,
  fontSize: 13, color: '#0f172a', outline: 'none', boxSizing: 'border-box',
  backgroundColor: 'white', fontFamily: 'inherit',
};

const LABEL: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6,
};

function BookModal({ onClose, onBook }: { onClose: () => void; onBook: (a: Omit<Appointment, 'id'>) => void }) {
  const { contacts } = useApp();
  const [form, setForm] = useState({ title: '', contactId: contacts[0]?.id || '', date: '2024-05-22', time: '10:00 AM', duration: 30, type: 'Video Call', notes: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const contact = contacts.find(c => c.id === form.contactId);
    onBook({ ...form, contactName: contact?.name || '', status: 'scheduled', duration: Number(form.duration) });
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, width: 460, boxShadow: '0 24px 48px -12px rgba(16,24,40,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.2px' }}>Book Appointment</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, display: 'flex' }}><X size={18} color="#94a3b8" /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={LABEL}>Title</label>
            <input required value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Discovery Call" style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Contact</label>
            <select value={form.contactId} onChange={e => setForm(p => ({ ...p, contactId: e.target.value }))} style={{ ...INPUT, cursor: 'pointer' }}>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={LABEL}>Date</label>
              <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Time</label>
              <input value={form.time} onChange={e => setForm(p => ({ ...p, time: e.target.value }))} placeholder="10:00 AM" style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Duration (min)</label>
              <select value={form.duration} onChange={e => setForm(p => ({ ...p, duration: Number(e.target.value) }))} style={{ ...INPUT, cursor: 'pointer' }}>
                {[15, 30, 45, 60, 90, 120].map(d => <option key={d} value={d}>{d} minutes</option>)}
              </select>
            </div>
            <div>
              <label style={LABEL}>Type</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={{ ...INPUT, cursor: 'pointer' }}>
                {['Video Call', 'Phone Call', 'In Person', 'Screen Share'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={LABEL}>Notes</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any notes..." rows={2} style={{ ...INPUT, resize: 'none' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 16px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', backgroundColor: 'white', color: '#374151' }}>Cancel</button>
            <button type="submit" style={{ padding: '9px 16px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 2px rgba(16,24,40,0.08)' }}>Book Appointment</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CalendarView() {
  const { appointments, addAppointment, updateAppointment } = useApp();
  const [currentDate, setCurrentDate] = useState(new Date(2024, 4, 1));
  const [showModal, setShowModal] = useState(false);
  const [view, setView] = useState<'month' | 'week' | 'list'>('month');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, i) => {
    const day = i - firstDay + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });

  const getApptForDay = (day: number | null) => {
    if (!day) return [];
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return appointments.filter(a => a.date === dateStr);
  };

  return (
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100%' }}>
      <Header title="Calendar" subtitle="Manage your appointments and schedule" />
      <div style={{ padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
              style={{ padding: 8, border: '1px solid #e2e8f0', borderRadius: 9, cursor: 'pointer', backgroundColor: 'white', display: 'flex', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'white'; }}>
              <ChevronLeft size={16} color="#64748b" />
            </button>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', minWidth: 170, textAlign: 'center', margin: 0, letterSpacing: '-0.3px' }}>{MONTHS[month]} {year}</h2>
            <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
              style={{ padding: 8, border: '1px solid #e2e8f0', borderRadius: 9, cursor: 'pointer', backgroundColor: 'white', display: 'flex', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'white'; }}>
              <ChevronRight size={16} color="#64748b" />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: 10, padding: 4, gap: 2 }}>
              {(['month', 'week', 'list'] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  style={{ padding: '7px 14px', borderRadius: 8, border: 'none', backgroundColor: view === v ? 'white' : 'transparent', color: view === v ? '#6366f1' : '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize', boxShadow: view === v ? '0 1px 3px rgba(16,24,40,0.08)' : 'none', transition: 'all 0.15s' }}>
                  {v}
                </button>
              ))}
            </div>
            <button onClick={() => setShowModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 2px rgba(16,24,40,0.08)' }}>
              <Plus size={15} /> Book
            </button>
          </div>
        </div>

        {view === 'list' ? (
          <div style={{ backgroundColor: 'white', borderRadius: 14, border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', overflow: 'hidden' }}>
            {appointments.length === 0 && (
              <div style={{ padding: '56px 20px', textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <CalendarDays size={28} color="#6366f1" />
                </div>
                <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>No appointments yet</p>
                <p style={{ margin: '0 0 18px', fontSize: 13, color: '#94a3b8' }}>Book your first appointment to see it here.</p>
                <button onClick={() => setShowModal(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <Plus size={14} /> Book Appointment
                </button>
              </div>
            )}
            {appointments.sort((a, b) => a.date.localeCompare(b.date)).map((appt, i) => (
              <div key={appt.id}
                style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 22px', borderBottom: i < appointments.length - 1 ? '1px solid #f1f5f9' : 'none', transition: 'background 0.12s' }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
                <div style={{ textAlign: 'center', minWidth: 60, padding: '10px 8px', borderRadius: 12, backgroundColor: '#eef2ff', border: '1px solid #e0e7ff' }}>
                  <p style={{ fontSize: 20, fontWeight: 700, color: '#6366f1', margin: 0, lineHeight: 1.1 }}>{appt.date.split('-')[2]}</p>
                  <p style={{ fontSize: 10, fontWeight: 600, color: '#818cf8', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{MONTHS[parseInt(appt.date.split('-')[1]) - 1].slice(0, 3)}</p>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: 0 }}>{appt.title}</p>
                  <div style={{ display: 'flex', gap: 12, marginTop: 5 }}>
                    <span style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={12} /> {appt.time} · {appt.duration}min
                    </span>
                    <span style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Video size={12} /> {appt.type}
                    </span>
                  </div>
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#475569', margin: 0 }}>{appt.contactName}</p>
                </div>
                <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, backgroundColor: `${statusColors[appt.status]}15`, color: statusColors[appt.status], textTransform: 'capitalize' }}>
                  {appt.status}
                </span>
                {appt.status === 'scheduled' && (
                  <button onClick={() => updateAppointment(appt.id, { status: 'completed' })}
                    style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 9, cursor: 'pointer' }}>
                    Mark Done
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ backgroundColor: 'white', borderRadius: 14, border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #e6e9f0', backgroundColor: '#f8fafc' }}>
              {DAYS.map(d => (
                <div key={d} style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {cells.map((day, i) => {
                const appts = getApptForDay(day);
                const isToday = day === 21 && month === 4;
                return (
                  <div key={i}
                    style={{ minHeight: 104, padding: 8, borderRight: i % 7 !== 6 ? '1px solid #f1f5f9' : 'none', borderBottom: i < 35 ? '1px solid #f1f5f9' : 'none', backgroundColor: day ? (isToday ? '#f5f6ff' : 'white') : '#f8fafc', boxShadow: isToday ? 'inset 0 0 0 2px #6366f1' : 'none', transition: 'background 0.12s', position: 'relative' }}
                    onMouseEnter={e => { if (day && !isToday) e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                    onMouseLeave={e => { if (day && !isToday) e.currentTarget.style.backgroundColor = 'white'; }}>
                    {day && (
                      <>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? 'white' : '#475569', backgroundColor: isToday ? '#6366f1' : 'transparent', marginBottom: 6, boxShadow: isToday ? '0 2px 6px rgba(99,102,241,0.35)' : 'none' }}>
                          {day}
                        </div>
                        {appts.slice(0, 2).map(a => (
                          <div key={a.id} style={{ fontSize: 11, padding: '3px 7px', borderRadius: 6, backgroundColor: `${statusColors[a.status]}14`, borderLeft: `3px solid ${statusColors[a.status]}`, color: statusColors[a.status], fontWeight: 600, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.time.split(':')[0]}{a.time.includes('AM') ? 'a' : 'p'} {a.title}
                          </div>
                        ))}
                        {appts.length > 2 && <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', paddingLeft: 2 }}>+{appts.length - 2} more</div>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {showModal && <BookModal onClose={() => setShowModal(false)} onBook={addAppointment} />}
    </div>
  );
}
