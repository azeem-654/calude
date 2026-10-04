/**
 * The booking page, set up where it is chosen.
 *
 * "A Protected Central booking page" used to be a radio button and nothing
 * else: the page itself was whatever the Scheduling screen last had — "30
 * Minute Meeting, schedule a meeting with me" — and it was only published when
 * somebody opened Scheduling. Until then `{{bookingLink}}` had no page to point
 * at (lib/mergeFields.ts reads the published slug), so every email's booking
 * line was dropped. So the choice now shows the page, lets the basics be
 * changed on the spot, and publishes it as it is edited — the same schedule and
 * the same publish the Scheduling screen uses (`crm_schedule`,
 * `publishBookingConfig`), so the two can never disagree.
 *
 * The preview is drawn from the schedule, not a picture of one: the days are
 * the days it takes bookings, the times are the slots its hours and length
 * make. It is labelled a preview, and links to the real page once it is live.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Clock, ExternalLink, Loader, MapPin, Video, Phone, Building2, Check, AlertTriangle } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { getSession } from '../../../services/auth';
import { customerBusinessName } from '../../../services/tenancy';
import { bookingSlugFor, publishBookingConfig } from '../../../services/booking';

const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']] as const;
type DayKey = typeof DAYS[number][0];
const JS_DAY: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const LENGTHS = [15, 30, 45, 60];
const PLACES = [
  { value: 'Video call', icon: Video },
  { value: 'Phone call', icon: Phone },
  { value: 'In person', icon: Building2 },
];

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const label = (min: number) => { const h = Math.floor(min / 60); const m = min % 60; return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`; };

export default function BookingSetup({ business }: { business?: string }) {
  const { schedule, updateSchedule } = useApp();
  const [pub, setPub] = useState<'idle' | 'saving' | 'live' | 'refused' | 'local'>('idle');
  const [pubError, setPubError] = useState('');
  const timer = useRef<number | undefined>(undefined);

  /* A page needs its own address before anything else: the shared default 'meeting' belongs to whoever published first. */
  useEffect(() => {
    if (!schedule.slug || schedule.slug === 'meeting') updateSchedule({ slug: bookingSlugFor(schedule, business) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule.slug]);

  /* Published as it is edited, a moment after the last change — the link in the emails points at this page. */
  useEffect(() => {
    const token = getSession()?.token;
    if (!token) { setPub('local'); return; }
    if (!schedule.slug || schedule.slug === 'meeting') return;
    setPub('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const r = await publishBookingConfig(token, schedule);
      setPubError(r.error ?? '');
      setPub(r.ok ? 'live' : 'refused');
    }, 900);
    return () => window.clearTimeout(timer.current);
  }, [schedule]);

  const hours = schedule.weekly.mon.enabled ? schedule.weekly.mon : (Object.values(schedule.weekly).find(d => d.enabled) ?? schedule.weekly.mon);
  const setDays = (key: DayKey) => updateSchedule({ weekly: { ...schedule.weekly, [key]: { ...schedule.weekly[key], enabled: !schedule.weekly[key].enabled } } });
  /* One set of hours for every open day — the basics. Different hours per day are on the Scheduling screen. */
  const setHours = (patch: { from?: string; to?: string }) => {
    const weekly = { ...schedule.weekly };
    for (const [k] of DAYS) weekly[k] = { ...weekly[k], ...patch };
    updateSchedule({ weekly });
  };

  /* The next fortnight's open days, and the first one's times, as the visitor would see them. */
  const preview = useMemo(() => {
    const days: { date: Date; open: boolean }[] = [];
    const start = new Date(); start.setHours(0, 0, 0, 0);
    for (let i = 1; i <= 14; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      days.push({ date: d, open: !!schedule.weekly[JS_DAY[d.getDay()]]?.enabled });
    }
    const first = days.find(d => d.open);
    const slots: string[] = [];
    if (first) {
      const day = schedule.weekly[JS_DAY[first.date.getDay()]];
      const step = Math.max(15, schedule.duration) + (schedule.bufferAfter || 0);
      for (let m = toMin(day.from); m + schedule.duration <= toMin(day.to) && slots.length < 9; m += step) slots.push(label(m));
    }
    return { days, first, slots };
  }, [schedule]);

  const name = business || customerBusinessName() || 'Your business';
  const url = `${window.location.origin}/book/${schedule.slug}`;
  const noDays = !DAYS.some(([k]) => schedule.weekly[k].enabled);
  const badHours = toMin(hours.to) - toMin(hours.from) < schedule.duration;

  return (
    <section className="np-book" aria-label="Your booking page">
      <div className="np-book-form">
        <b style={{ fontSize: 14 }}>Your booking page</b>
        <span style={{ fontSize: 12.5, color: '#6b7280', lineHeight: 1.5 }}>The basics, here. Change anything and the preview — and the live page — follow.</span>

        <label className="np-book-field">
          <span>What it is called</span>
          <input className="np-input" data-field="booking.title" value={schedule.title} maxLength={80}
            onChange={e => updateSchedule({ title: e.target.value })} placeholder="Intro call" />
        </label>

        <div className="np-book-field">
          <span>How long</span>
          <div className="np-opts">
            {LENGTHS.map(m => (
              <button key={m} type="button" className="np-opt np-opt-sm" aria-pressed={schedule.duration === m} onClick={() => updateSchedule({ duration: m })}>{m} min</button>
            ))}
          </div>
        </div>

        <div className="np-book-field">
          <span>Where</span>
          <div className="np-opts">
            {PLACES.map(p => (
              <button key={p.value} type="button" className="np-opt np-opt-sm" aria-pressed={(schedule.location || 'Video call').toLowerCase() === p.value.toLowerCase()} onClick={() => updateSchedule({ location: p.value })}>
                <p.icon size={12} /> {p.value}
              </button>
            ))}
          </div>
        </div>

        <div className="np-book-field" data-field="booking.days">
          <span>Days it takes bookings</span>
          <div className="np-opts">
            {DAYS.map(([k, l]) => (
              <button key={k} type="button" className="np-opt np-opt-sm" aria-pressed={schedule.weekly[k].enabled} onClick={() => setDays(k)}>{l}</button>
            ))}
          </div>
          {noDays && <small className="np-book-warn"><AlertTriangle size={12} /> No days open — nobody could book.</small>}
        </div>

        <div className="np-book-field">
          <span>Hours</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="time" className="np-input np-book-time" data-field="booking.from" value={hours.from} onChange={e => setHours({ from: e.target.value })} aria-label="From" />
            <span style={{ color: '#6b7280', fontSize: 13 }}>to</span>
            <input type="time" className="np-input np-book-time" data-field="booking.to" value={hours.to} onChange={e => setHours({ to: e.target.value })} aria-label="To" />
            <span style={{ fontSize: 12, color: '#6b7280' }}>{schedule.timezone}</span>
          </div>
          {badHours && <small className="np-book-warn"><AlertTriangle size={12} /> Those hours are shorter than one {schedule.duration}-minute meeting.</small>}
        </div>

        <label className="np-book-field">
          <span>A line for visitors</span>
          <textarea className="np-input" rows={2} maxLength={240} value={schedule.description}
            onChange={e => updateSchedule({ description: e.target.value })} placeholder="A quick call to see whether we are a fit." />
        </label>

        <span className="np-book-status" data-state={pub}>
          {pub === 'saving' && <><Loader size={12} className="spin" /> Saving…</>}
          {pub === 'live' && <><Check size={12} /> Live at <a href={url} target="_blank" rel="noopener noreferrer">{url.replace(/^https?:\/\//, '')} <ExternalLink size={11} /></a></>}
          {pub === 'refused' && <><AlertTriangle size={12} /> Not published: {pubError || 'the server refused it.'} Change the page on the Scheduling screen.</>}
          {pub === 'local' && 'Saved here — it is published when you are signed in.'}
        </span>
        <span style={{ fontSize: 12, color: '#6b7280' }}>Per-day hours, meeting types, reminders and a photo are on the Scheduling screen.</span>
      </div>

      <figure className="np-book-preview" aria-label="Preview of the booking page">
        <div className="np-book-card">
          <div className="np-book-card-head">
            <small>{name}</small>
            <b>{schedule.title || 'Intro call'}</b>
            <span><Clock size={12} /> {schedule.duration} min</span>
            <span><MapPin size={12} /> {schedule.location || 'Video call'}</span>
            {schedule.description && <p>{schedule.description}</p>}
          </div>
          <div className="np-book-card-body">
            <span className="np-book-card-label"><CalendarDays size={12} /> Pick a day</span>
            <div className="np-book-days">
              {preview.days.map(d => (
                <span key={d.date.toISOString()} data-open={d.open ? '1' : undefined} data-on={preview.first && d.date.getTime() === preview.first.date.getTime() ? '1' : undefined}>
                  <small>{d.date.toLocaleDateString(undefined, { weekday: 'short' })}</small>{d.date.getDate()}
                </span>
              ))}
            </div>
            {preview.first && preview.slots.length > 0 ? (
              <>
                <span className="np-book-card-label">{preview.first.date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                <div className="np-book-slots">{preview.slots.map(t => <span key={t}>{t}</span>)}</div>
              </>
            ) : <span style={{ fontSize: 12, color: '#92400e' }}>No times to offer yet — open a day and set hours.</span>}
          </div>
        </div>
        <figcaption>Preview — the page visitors see{pub === 'live' ? ', and the link in your emails' : ''}.</figcaption>
      </figure>
    </section>
  );
}
