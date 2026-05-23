import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Clock, MapPin, Check, Calendar } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { sendEmail, loadEmailConfig } from '../../services/emailService';

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

function fmt12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${pad(m)} ${ampm}`;
}

type Step = 'calendar' | 'form' | 'confirmed';

export default function BookingPage() {
  const { schedule, bookings, addBooking, addAppointment, contacts, addContact, addContactActivity } = useApp();

  const [today] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('calendar');
  const [guestForm, setGuestForm] = useState({ name: '', email: '', phone: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<{ date: string; time: string; name: string } | null>(null);

  const visitorTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

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

  const isDayAvailable = (date: Date): boolean => {
    if (date < today) return false;
    const dayKey = DAY_KEYS[date.getDay()];
    const avail = schedule.weekly[dayKey];
    if (!avail.enabled) return false;
    const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const bookedToday = bookings.filter(b => b.slotDate === dateStr && b.status !== 'cancelled').length;
    return bookedToday < schedule.dailyLimit;
  };

  const getAvailableSlots = (date: Date): string[] => {
    const dayKey = DAY_KEYS[date.getDay()];
    const avail = schedule.weekly[dayKey];
    if (!avail.enabled) return [];
    const all = generateTimeSlots(avail.from, avail.to, schedule.duration, schedule.bufferAfter);
    const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const bookedTimes = bookings.filter(b => b.slotDate === dateStr && b.status !== 'cancelled').map(b => b.slotTime);
    return all.filter(t => !bookedTimes.includes(t));
  };

  const slots = selectedDate ? getAvailableSlots(selectedDate) : [];

  const handleDateClick = (date: Date) => {
    if (!isDayAvailable(date)) return;
    setSelectedDate(date);
    setSelectedTime(null);
  };

  const handleBook = async () => {
    if (!selectedDate || !selectedTime || !guestForm.name.trim() || !guestForm.email.trim()) return;
    setSubmitting(true);

    const dateStr = `${selectedDate.getFullYear()}-${pad(selectedDate.getMonth() + 1)}-${pad(selectedDate.getDate())}`;

    // Create booking
    const bookingData = {
      slotDate: dateStr,
      slotTime: selectedTime,
      guestName: guestForm.name.trim(),
      guestEmail: guestForm.email.trim(),
      guestPhone: guestForm.phone.trim(),
      notes: guestForm.notes.trim(),
      status: 'confirmed' as const,
      timezone: visitorTz,
      createdAt: new Date().toISOString(),
    };
    addBooking(bookingData);

    // Create appointment
    addAppointment({
      title: `${schedule.title} — ${guestForm.name}`,
      contactId: '',
      contactName: guestForm.name.trim(),
      date: dateStr,
      time: fmt12(selectedTime),
      duration: schedule.duration,
      status: 'scheduled',
      type: 'Video Call',
      notes: `Booked via scheduling page. ${guestForm.notes}`.trim(),
    });

    // Create/update contact
    const existingContact = contacts.find(c => c.email.toLowerCase() === guestForm.email.toLowerCase());
    if (!existingContact) {
      addContact({
        name: guestForm.name.trim(),
        email: guestForm.email.trim(),
        phone: guestForm.phone.trim(),
        status: 'lead',
        tags: ['Booked Meeting'],
        source: 'Booking Page',
        createdAt: new Date().toISOString().split('T')[0],
        lastActivity: new Date().toISOString().split('T')[0],
        value: 0,
      });
    } else {
      addContactActivity(existingContact.id, {
        type: 'meeting',
        description: `Meeting booked: ${schedule.title} on ${dateStr} at ${fmt12(selectedTime)}`,
        timestamp: new Date().toISOString(),
      });
    }

    // Send confirmation email
    const cfg = loadEmailConfig();
    if (cfg.provider !== 'none') {
      const confirmHtml = `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
          <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:12px;padding:24px;color:white;text-align:center;margin-bottom:24px">
            <div style="font-size:32px;margin-bottom:8px">✅</div>
            <h1 style="margin:0;font-size:22px">Meeting Confirmed!</h1>
          </div>
          <p style="font-size:16px;color:#374151">Hi <strong>${guestForm.name}</strong>,</p>
          <p style="color:#374151">Your meeting has been confirmed. Here are the details:</p>
          <div style="background:#f8fafc;border-radius:10px;padding:20px;border:1px solid #e2e8f0;margin:20px 0">
            <div style="margin-bottom:12px"><strong style="color:#64748b;font-size:12px;text-transform:uppercase">Meeting</strong><br><span style="font-size:15px;color:#0f172a">${schedule.title}</span></div>
            <div style="margin-bottom:12px"><strong style="color:#64748b;font-size:12px;text-transform:uppercase">Date & Time</strong><br><span style="font-size:15px;color:#0f172a">${new Date(dateStr+'T12:00:00').toLocaleDateString([],{weekday:'long',month:'long',day:'numeric',year:'numeric'})} at ${fmt12(selectedTime)}</span></div>
            <div style="margin-bottom:12px"><strong style="color:#64748b;font-size:12px;text-transform:uppercase">Duration</strong><br><span style="font-size:15px;color:#0f172a">${schedule.duration} minutes</span></div>
            ${schedule.location ? `<div><strong style="color:#64748b;font-size:12px;text-transform:uppercase">Location</strong><br><span style="font-size:15px;color:#0f172a">${schedule.location}</span></div>` : ''}
          </div>
          <p style="color:#64748b;font-size:13px">You'll receive a calendar invite shortly. If you need to reschedule or have questions, please reply to this email.</p>
        </div>`;

      await sendEmail(cfg, {
        to: guestForm.email.trim(),
        toName: guestForm.name.trim(),
        subject: `Meeting Confirmed: ${schedule.title}`,
        html: confirmHtml,
      }).catch(() => {/* silent fail */});
    }

    setSubmitting(false);
    setConfirmedBooking({ date: dateStr, time: selectedTime, name: guestForm.name });
    setStep('confirmed');
  };

  // Confirmed screen
  if (step === 'confirmed' && confirmedBooking) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ backgroundColor: 'white', borderRadius: 20, padding: '48px 40px', maxWidth: 480, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.1)', textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, #22c55e, #16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Check size={36} color="white" />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>You're booked!</h1>
          <p style={{ fontSize: 15, color: '#64748b', margin: '0 0 28px' }}>A confirmation email has been sent to you.</p>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: '20px', border: '1px solid #e2e8f0', marginBottom: 24, textAlign: 'left' }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Meeting</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{schedule.title}</div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Date & Time</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>
                {new Date(confirmedBooking.date + 'T12:00:00').toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })} at {fmt12(confirmedBooking.time)}
              </div>
            </div>
            {schedule.location && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Location</div>
                <div style={{ fontSize: 14, color: '#374151' }}>{schedule.location}</div>
              </div>
            )}
          </div>
          <button onClick={() => { setStep('calendar'); setSelectedDate(null); setSelectedTime(null); setGuestForm({ name: '', email: '', phone: '', notes: '' }); }}
            style={{ padding: '12px 28px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Book Another Meeting
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ backgroundColor: 'white', borderRadius: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.12)', overflow: 'hidden', width: '100%', maxWidth: step === 'form' ? 540 : 820, display: 'flex', flexDirection: step === 'form' ? 'column' : 'row', minHeight: 560 }}>

        {/* Left panel */}
        <div style={{ padding: '36px 28px', width: step === 'form' ? '100%' : 260, borderRight: step === 'form' ? 'none' : '1px solid #e2e8f0', borderBottom: step === 'form' ? '1px solid #e2e8f0' : 'none', backgroundColor: '#fafafa', flexShrink: 0 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Calendar size={22} color="white" />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>{schedule.title}</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px', lineHeight: 1.5 }}>{schedule.description}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151' }}>
              <Clock size={14} color="#6366f1" /> {schedule.duration} minutes
            </div>
            {schedule.location && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151' }}>
                <MapPin size={14} color="#6366f1" /> {schedule.location}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#94a3b8' }}>
              <span>🌍</span> {visitorTz}
            </div>
          </div>
          {selectedDate && selectedTime && step === 'form' && (
            <div style={{ marginTop: 20, padding: '12px 14px', backgroundColor: '#eef2ff', borderRadius: 10, border: '1px solid #c7d2fe' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', marginBottom: 4 }}>Selected Time</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#4338ca' }}>
                {new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
              <div style={{ fontSize: 13, color: '#4338ca' }}>{fmt12(selectedTime)}</div>
            </div>
          )}
        </div>

        {/* Right panel — calendar */}
        {step === 'calendar' && (
          <div style={{ flex: 1, padding: '32px 28px', display: 'flex', gap: 24 }}>
            {/* Calendar grid */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
                  {MONTHS[month]} {year}
                </h2>
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

              {/* Day headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
                {DAYS_SHORT.map(d => (
                  <div key={d} style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', textAlign: 'center', padding: '4px 0' }}>{d}</div>
                ))}
              </div>

              {/* Calendar cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
                {cells.map((date, i) => {
                  if (!date) return <div key={i} />;
                  const available = isDayAvailable(date);
                  const isSelected = selectedDate?.getTime() === date.getTime();
                  const isToday = date.getTime() === today.getTime();
                  return (
                    <button key={i} onClick={() => handleDateClick(date)} disabled={!available}
                      style={{
                        padding: '8px 4px', borderRadius: 8, border: isSelected ? '2px solid #6366f1' : '1px solid transparent',
                        backgroundColor: isSelected ? '#6366f1' : (available ? '#f8faff' : 'transparent'),
                        color: isSelected ? 'white' : (available ? '#0f172a' : '#d1d5db'),
                        fontSize: 13, fontWeight: isToday ? 700 : 400, cursor: available ? 'pointer' : 'default',
                        transition: 'all 0.1s',
                      }}
                      onMouseEnter={e => { if (available && !isSelected) e.currentTarget.style.backgroundColor = '#eef2ff'; }}
                      onMouseLeave={e => { if (available && !isSelected) e.currentTarget.style.backgroundColor = '#f8faff'; }}>
                      {date.getDate()}
                      {isToday && !isSelected && <div style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#6366f1', margin: '2px auto 0' }} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time slots */}
            {selectedDate && (
              <div style={{ width: 160, flexShrink: 0 }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#374151' }}>
                  {selectedDate.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
                  {slots.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>No slots available</div>
                  ) : (
                    slots.map(slot => (
                      <button key={slot} onClick={() => { setSelectedTime(slot); setStep('form'); }}
                        style={{ padding: '10px 8px', border: `1.5px solid ${selectedTime === slot ? '#6366f1' : '#e2e8f0'}`, borderRadius: 8, backgroundColor: selectedTime === slot ? '#6366f1' : 'white', color: selectedTime === slot ? 'white' : '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.1s', textAlign: 'center' }}>
                        {fmt12(slot)}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Right panel — booking form */}
        {step === 'form' && (
          <div style={{ flex: 1, padding: '32px 28px', display: 'flex', flexDirection: 'column' }}>
            <button onClick={() => setStep('calendar')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', cursor: 'pointer', color: '#6366f1', fontSize: 13, fontWeight: 600, padding: '0 0 16px', width: 'fit-content' }}>
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
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Phone (optional)</label>
                <input value={guestForm.phone} onChange={e => setGuestForm(p => ({ ...p, phone: e.target.value }))} placeholder="+1 (555) 000-0000"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Notes (optional)</label>
                <textarea value={guestForm.notes} onChange={e => setGuestForm(p => ({ ...p, notes: e.target.value }))} placeholder="Anything you'd like to discuss..."
                  rows={3} style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              <button onClick={handleBook} disabled={submitting || !guestForm.name.trim() || !guestForm.email.trim()}
                style={{ padding: '13px 24px', backgroundColor: (submitting || !guestForm.name.trim() || !guestForm.email.trim()) ? '#c7d2fe' : '#6366f1', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: (submitting || !guestForm.name.trim() || !guestForm.email.trim()) ? 'default' : 'pointer', marginTop: 4 }}>
                {submitting ? 'Booking...' : 'Confirm Booking'}
              </button>
              <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
                By confirming, you agree to receive a confirmation email.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
