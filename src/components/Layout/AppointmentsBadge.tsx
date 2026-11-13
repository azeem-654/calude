/**
 * Appointments, in a tray of their own in the top bar (owner's brief,
 * 2026-11-13): a booking on the customer's booking page is the news they most
 * want, and in the general bell it sat between "Saved" toasts.
 *
 * Reads the real bookings (booking.php `list`, the same the Booking pages
 * screen shows); "new" is anything booked since this person last opened the
 * tray — a per-browser convenience, so a cleared browser only means every
 * recent booking reads as new once. Polls every two minutes while the tab is
 * visible. Shows nothing until there is a booking to show.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, ArrowRight } from 'lucide-react';
import { listRemoteBookings } from '../../services/booking';
import { getSession } from '../../services/auth';
import type { Booking } from '../../types';

const SEEN = 'crm_appointments_seen_at';
const POLL_MS = 2 * 60 * 1000;

const when = (b: Booking) => {
  const d = new Date(`${b.slotDate}T${b.slotTime || '00:00'}`);
  return Number.isNaN(d.getTime()) ? `${b.slotDate} ${b.slotTime}` : d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export default function AppointmentsBadge({ style }: { style: React.CSSProperties }) {
  const navigate = useNavigate();
  const [list, setList] = useState<Booking[]>([]);
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem(SEEN) ?? ''; } catch { return ''; } });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const token = getSession()?.token;
    if (!token || document.hidden) return;
    const all = await listRemoteBookings(token);
    if (!all) return;
    setList(all.filter(b => b.status !== 'cancelled').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 30));
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => { void load(); }, POLL_MS);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!list.length) return null;
  const fresh = list.filter(b => (b.createdAt || '') > seen).length;

  const toggle = () => setOpen(v => {
    if (!v) {
      const now = new Date().toISOString();
      try { localStorage.setItem(SEEN, now); } catch { /* storage off: the count shows again next load */ }
      /* Kept until it closes, so what was new is still marked while it is read. */
      window.setTimeout(() => setSeen(now), 0);
    }
    return !v;
  });

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" title="Appointments booked on your booking pages"
        aria-label={fresh ? `Appointments, ${fresh} new` : 'Appointments'} aria-haspopup="true" aria-expanded={open}
        onClick={toggle} className="icon-btn" style={{ ...style, position: 'relative' }}>
        <CalendarCheck size={18} strokeWidth={1.8} />
        {fresh > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -4, minWidth: 18, height: 18, padding: '0 4px', boxSizing: 'border-box',
            borderRadius: 999, background: '#16a34a', color: '#fff', fontSize: 11, fontWeight: 800,
            display: 'grid', placeItems: 'center', border: '2px solid #1c1c22', lineHeight: 1,
          }}>{fresh > 99 ? '99+' : fresh}</span>
        )}
      </button>
      {open && (
        <div role="menu" aria-label="Appointments" style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 300, width: 340, maxWidth: 'calc(100vw - 24px)',
          background: '#fff', borderRadius: 18, padding: 8, boxShadow: '0 16px 40px -8px rgba(23,25,28,0.22)',
        }}>
          <div style={{ padding: '6px 10px 8px' }}>
            <b style={{ fontSize: 13, color: '#17191c' }}>Appointments</b>
            <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 2 }}>{fresh ? `${fresh} new since you last looked` : 'Booked on your booking pages, newest first'}</div>
          </div>
          <div style={{ display: 'grid', maxHeight: 320, overflowY: 'auto' }}>
            {list.slice(0, 10).map(b => {
              const isNew = (b.createdAt || '') > seen;
              return (
                <button key={b.id} type="button" role="menuitem" onClick={() => { setOpen(false); navigate('/calendar'); }}
                  style={{ display: 'grid', gap: 2, textAlign: 'left', padding: '9px 10px', borderRadius: 11, border: 0, background: isNew ? '#f0fdf4' : 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <span style={{ fontSize: 13, fontWeight: 650, color: '#17191c', lineHeight: 1.35 }}>{b.guestName || b.guestEmail}{b.eventTypeName ? ` · ${b.eventTypeName}` : ''}</span>
                  <span style={{ fontSize: 11.5, color: '#6b7280' }}><b style={{ color: isNew ? '#15803d' : '#6b7280' }}>{isNew ? 'New · ' : ''}{when(b)}</b>{b.status === 'rescheduled' ? ' · moved' : ''}</span>
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => { setOpen(false); navigate('/calendar'); }}
            style={{ width: '100%', marginTop: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, padding: '9px 10px', borderRadius: 11, border: '1px solid #eceef1', background: '#fff', fontSize: 12.5, fontWeight: 700, color: '#17191c', cursor: 'pointer', fontFamily: 'inherit' }}>
            Open calendar <ArrowRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
