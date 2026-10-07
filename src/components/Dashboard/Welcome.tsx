/**
 * The dashboard's welcome: one full-width band across the top.
 *
 * The owner's references — a dark car-dashboard welcome ("Good morning,
 * Nick", a face in a ring in the middle) and a glass calendar card ("Wed
 * March 9 · 6 events today", times in pills, "in 53m"). So: the greeting with
 * the name lit, what today holds in words, the person's face in a sunburst
 * ring (their photo, or until they add one the animated orb —
 * shared/UserFace.tsx), and a glass card of today's real appointments.
 *
 * Every figure here is counted from the workspace's own records; a day with
 * nothing booked says so rather than showing sample meetings.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ArrowRight, Camera } from 'lucide-react';
import type { Appointment } from '../../types';
import { useMyAvatar } from '../../services/userAvatar';
import UserFace from '../shared/UserFace';

/** "14:30" or older "2:30 PM" → minutes past midnight, or null. */
function minutesOf(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(t.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h * 60 + Number(m[2]);
}
const clock = (mins: number) => {
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
};
const until = (mins: number) => (mins < 60 ? `in ${mins}m` : `in ${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}`);

/** The ring round the face: a sunburst of fine teeth, drawn once. */
const TEETH = (() => {
  const n = 72, r1 = 50, r2 = 46.5;
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, b = ((i + 0.5) / n) * Math.PI * 2;
    d += `${i ? 'L' : 'M'}${(50 + r1 * Math.cos(a)).toFixed(2)} ${(50 + r1 * Math.sin(a)).toFixed(2)}L${(50 + r2 * Math.cos(b)).toFixed(2)} ${(50 + r2 * Math.sin(b)).toFixed(2)}`;
  }
  return `${d}Z`;
})();

export default function Welcome({ greeting, firstName, appointments, openDeals, contacts }: {
  greeting: string;
  firstName: string;
  appointments: Appointment[];
  openDeals: number;
  contacts: number;
}) {
  const navigate = useNavigate();
  const me = useMyAvatar();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(t); }, []);

  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const today = appointments
    .filter(a => a.date === todayKey && a.status === 'scheduled')
    .map(a => ({ a, at: minutesOf(a.time) }))
    .sort((x, y) => (x.at ?? 0) - (y.at ?? 0));
  const ahead = today.filter(x => x.at === null || x.at >= nowMins - 5);
  const next = ahead[0];

  const weekday = now.toLocaleDateString(undefined, { weekday: 'short' });
  const dayMonth = now.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  const line = [
    today.length === 0 ? 'Nothing in the diary today' : `You have ${today.length} meeting${today.length === 1 ? '' : 's'} today`,
    `${openDeals} deal${openDeals === 1 ? '' : 's'} in motion`,
    `${contacts} contact${contacts === 1 ? '' : 's'} on the books`,
  ];

  return (
    <section className="dw" aria-label="Welcome" data-noinvert>
      <div className="dw-copy">
        <span className="dw-date">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <h1 className="dw-hello">
          {greeting},{firstName && <><br /><em>{firstName}</em></>}
        </h1>
        <p className="dw-line">{line.map((l, i) => <span key={i}>{l}</span>)}</p>
      </div>

      <div className="dw-face">
        <svg className="dw-ring" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <linearGradient id="dw-ring-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#7dd3fc" /><stop offset=".5" stopColor="#c4b5fd" /><stop offset="1" stopColor="#f9a8d4" />
            </linearGradient>
          </defs>
          <path d={TEETH} fill="url(#dw-ring-g)" opacity=".55" />
        </svg>
        <UserFace size={112} className="dw-avatar" testId="welcome-avatar" />
        <span className="dw-online" aria-hidden="true" />
        {!me.photo && (
          <button type="button" className="dw-photo" onClick={() => navigate('/settings?tab=profile')}>
            <Camera size={11} /> Add your photo
          </button>
        )}
      </div>

      <div className="dw-today" aria-label="Today">
        <div className="dw-today-head">
          <div>
            <b>{weekday}</b> <span>{dayMonth}</span>
            <small>{today.length === 0 ? 'No events today' : `${today.length} event${today.length === 1 ? '' : 's'} today`}</small>
          </div>
          <span className="dw-cal"><CalendarDays size={16} /></span>
        </div>
        {next ? (
          <div className="dw-next">
            <span className="dw-next-time">{next.at !== null ? clock(next.at) : next.a.time}</span>
            <span className="dw-next-what">
              <b>{next.a.title || next.a.type}</b>
              <small>{next.a.contactName}{next.a.location ? ` · ${next.a.location}` : ''}</small>
            </span>
            {next.at !== null && next.at >= nowMins && <span className="dw-in">{until(next.at - nowMins)}</span>}
          </div>
        ) : (
          <p className="dw-empty">{today.length ? 'That was the last one today.' : 'Nothing booked — a good day to find new customers.'}</p>
        )}
        {ahead.slice(1, 3).map(x => (
          <div key={x.a.id} className="dw-row">
            <span className="dw-pill">{x.at !== null ? clock(x.at) : x.a.time}</span>
            <span>{x.a.title || x.a.type}</span>
          </div>
        ))}
        <button type="button" className="dw-open" onClick={() => navigate('/calendar')}>Open calendar <ArrowRight size={12} /></button>
      </div>
    </section>
  );
}
