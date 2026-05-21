import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Clock, Video, X } from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import type { Appointment } from '../../types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const statusColors: Record<string, string> = {
  scheduled: '#6366f1', completed: '#22c55e', cancelled: '#ef4444', 'no-show': '#f59e0b',
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
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Book Appointment</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={20} color="#94a3b8" /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Title</label>
            <input required value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Discovery Call" style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Contact</label>
            <select value={form.contactId} onChange={e => setForm(p => ({ ...p, contactId: e.target.value }))} style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Date</label>
              <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Time</label>
              <input value={form.time} onChange={e => setForm(p => ({ ...p, time: e.target.value }))} placeholder="10:00 AM" style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Duration (min)</label>
              <select value={form.duration} onChange={e => setForm(p => ({ ...p, duration: Number(e.target.value) }))} style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}>
                {[15, 30, 45, 60, 90, 120].map(d => <option key={d} value={d}>{d} minutes</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Type</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}>
                {['Video Call', 'Phone Call', 'In Person', 'Screen Share'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Notes</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any notes..." rows={2} style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', backgroundColor: 'white', color: '#374151' }}>Cancel</button>
            <button type="submit" style={{ padding: '9px 18px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Book Appointment</button>
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
    <div>
      <Header title="Calendar" subtitle="Manage your appointments and schedule" />
      <div style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} style={{ padding: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', backgroundColor: 'white', display: 'flex' }}>
              <ChevronLeft size={16} color="#64748b" />
            </button>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', minWidth: '160px', textAlign: 'center' }}>{MONTHS[month]} {year}</h2>
            <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} style={{ padding: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', backgroundColor: 'white', display: 'flex' }}>
              <ChevronRight size={16} color="#64748b" />
            </button>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {(['month', 'week', 'list'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{ padding: '7px 14px', borderRadius: '8px', border: `1px solid ${view === v ? '#6366f1' : '#e2e8f0'}`, backgroundColor: view === v ? '#6366f1' : 'white', color: view === v ? 'white' : '#64748b', fontSize: '13px', fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize' }}>
                {v}
              </button>
            ))}
            <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={15} /> Book
            </button>
          </div>
        </div>

        {view === 'list' ? (
          <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            {appointments.sort((a, b) => a.date.localeCompare(b.date)).map((appt, i) => (
              <div key={appt.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 20px', borderBottom: i < appointments.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                <div style={{ textAlign: 'center', minWidth: '60px', padding: '10px', borderRadius: '10px', backgroundColor: '#f8fafc' }}>
                  <p style={{ fontSize: '20px', fontWeight: 700, color: '#6366f1', margin: 0 }}>{appt.date.split('-')[2]}</p>
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>{MONTHS[parseInt(appt.date.split('-')[1]) - 1].slice(0, 3)}</p>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', margin: 0 }}>{appt.title}</p>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                    <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} /> {appt.time} · {appt.duration}min
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Video size={12} /> {appt.type}
                    </span>
                  </div>
                </div>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 500, color: '#374151', margin: 0 }}>{appt.contactName}</p>
                </div>
                <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, backgroundColor: `${statusColors[appt.status]}15`, color: statusColors[appt.status] }}>
                  {appt.status}
                </span>
                {appt.status === 'scheduled' && (
                  <button onClick={() => updateAppointment(appt.id, { status: 'completed' })}
                    style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 600, backgroundColor: '#ecfdf5', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '6px', cursor: 'pointer' }}>
                    Mark Done
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #e2e8f0' }}>
              {DAYS.map(d => (
                <div key={d} style={{ padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {cells.map((day, i) => {
                const appts = getApptForDay(day);
                const isToday = day === 21 && month === 4;
                return (
                  <div key={i} style={{ minHeight: '100px', padding: '8px', borderRight: i % 7 !== 6 ? '1px solid #f1f5f9' : 'none', borderBottom: i < 35 ? '1px solid #f1f5f9' : 'none', backgroundColor: day ? 'white' : '#f8fafc' }}>
                    {day && (
                      <>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: isToday ? 700 : 400, color: isToday ? 'white' : '#374151', backgroundColor: isToday ? '#6366f1' : 'transparent', marginBottom: '6px' }}>
                          {day}
                        </div>
                        {appts.slice(0, 2).map(a => (
                          <div key={a.id} style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', backgroundColor: `${statusColors[a.status]}20`, color: statusColors[a.status], fontWeight: 600, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.time.split(':')[0]}{a.time.includes('AM') ? 'a' : 'p'} {a.title}
                          </div>
                        ))}
                        {appts.length > 2 && <div style={{ fontSize: '11px', color: '#94a3b8' }}>+{appts.length - 2} more</div>}
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
