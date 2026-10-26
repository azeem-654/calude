/**
 * /book/strategy-call — a prospect books a call with the operator.
 *
 * No account, no session: the page asks /api/strategy-call.php for the public
 * settings and the free times, and the server re-checks the chosen time at the
 * moment it writes (routes/strategyCall.ts). It says "booked" only when the
 * server answered with a stored booking, and "a confirmation is on its way"
 * only when the server says the email was accepted.
 *
 * It keeps the visitor inside the site they came from: the logo and "back"
 * lead to that microsite (`src`), never to the general home page from /hvac.
 *
 * `?manage=<id>.<key>` is the guest's own link from their email: it shows the
 * booking and lets them move or cancel it, proven by the key alone.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CalendarCheck, Check, ChevronLeft, ChevronRight, Clock, Globe, Loader, MapPin, Phone, Video } from 'lucide-react';
import { API_BASE } from '../../services/apiBase';
import { usePageTitle } from '../../services/pageTitle';
import { allZones, browserZone, clockLabel, dayWords, addDays, weekdayOf } from '../../services/bookingTime';
import { rememberArrival, sourceFromLocation } from '../../services/strategyCall';
import { SITE_SOURCES, SOURCE_HOME, SOURCE_LABEL, type PublicSettings, type SiteSource } from '../../../worker/src/lib/strategyCall';
import { LogoMark } from '../shared/Logo';
import '../Site/site.css';
import './strategyCall.css';

interface Slot { utc: number; ownerDate: string; ownerTime: string; visitorTime: string }
interface Notify { guest?: string; owner?: string }
interface Booked { id: string; key?: string; startsAt: string; hostTimezone: string; notify?: Notify; meeting?: string; replayed?: boolean }
interface ManagedBooking { id: string; status: string; startsAt: string; duration: number; hostTimezone: string; visitorTimezone: string; name: string; email: string; title: string; meeting: string }

const call = async <T,>(action: string, extra: Record<string, unknown> = {}): Promise<T & { success?: boolean; error?: string; field?: string; code?: string; closed?: boolean }> => {
  const r = await fetch(`${API_BASE}/api/strategy-call.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
  return r.json();
};

const INDUSTRY_OF: Record<SiteSource, string> = { main: '', hvac: 'HVAC', roofing: 'Roofing', 'medical-billing': 'Medical practice' };
/* Where "write to us instead" goes on each site — its own form, never another site's. */
const WRITE_TO: Record<SiteSource, string> = { main: '/#enquire', hvac: '/hvac#talk', roofing: '/roofing#talk', 'medical-billing': '/medical-billing#request' };

const newRequestId = () => {
  try { return crypto.randomUUID(); } catch { return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`; }
};

function monthOf(date: string) { return date.slice(0, 7); }
function monthDays(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

/** A month grid with the days that have times lit, and the times of the chosen day. */
function Picker({ settings, duration, tz, onPick, picked, testid }: {
  settings: PublicSettings; duration: number; tz: string; picked: Slot | null; onPick: (s: Slot | null) => void; testid?: string;
}) {
  const today = useMemo(() => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()), [tz]);
  const [month, setMonth] = useState(monthOf(today));
  /* Answers are kept with the question they answer, so a stale one is never shown for a new month. */
  const ask = `${month}|${tz}|${duration}`;
  const [res, setRes] = useState<{ ask: string; days: Record<string, Slot[]> | null; err: string }>({ ask: '', days: null, err: '' });
  const [day, setDay] = useState('');
  const days = res.ask === ask ? res.days : null;
  const err = res.ask === ask ? res.err : '';
  const lastMonth = monthOf(addDays(today, settings.windowDays + 1));

  useEffect(() => {
    let live = true;
    const all = monthDays(month);
    const from = all[0] < today ? today : all[0];
    const to = all[all.length - 1];
    void call<{ days?: Record<string, Slot[]> }>('slots', { from, to, timezone: tz, duration }).then(d => {
      if (!live) return;
      if (d.success) {
        setRes({ ask, days: d.days ?? {}, err: '' });
        /* Open on the first day with a time, so the visitor sees times without hunting. */
        const first = Object.keys(d.days ?? {}).sort()[0];
        setDay(cur => (cur && d.days?.[cur] ? cur : first ?? ''));
      } else setRes({ ask, days: null, err: d.error ?? 'Could not read the free times.' });
    }).catch(() => { if (live) setRes({ ask, days: null, err: 'Could not reach the server. Check your connection and try again.' }); });
    return () => { live = false; };
  }, [ask, month, tz, duration, today]);

  const all = monthDays(month);
  const lead = weekdayOf(all[0]);
  const shift = (n: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    onPick(null);
  };
  const monthName = new Date(`${month}-15T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const times = (days && day && days[day]) || [];

  return (
    <div className="sc-picker" data-testid={testid}>
      <div className="sc-month">
        <div className="sc-month-head">
          <button type="button" aria-label="Previous month" disabled={month <= monthOf(today)} onClick={() => shift(-1)}><ChevronLeft size={18} /></button>
          <b>{monthName}</b>
          <button type="button" aria-label="Next month" disabled={month >= lastMonth} onClick={() => shift(1)}><ChevronRight size={18} /></button>
        </div>
        <div className="sc-week" aria-hidden="true">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => <span key={i}>{w}</span>)}</div>
        <div className="sc-days" role="grid" aria-label={monthName}>
          {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
          {all.map(dt => {
            const open = !!days?.[dt]?.length;
            return (
              <button key={dt} type="button" role="gridcell" className={`sc-day${open ? ' open' : ''}${dt === day ? ' on' : ''}`} disabled={!open}
                aria-label={`${dayWords(Date.parse(`${dt}T12:00:00Z`), 'UTC')}${open ? '' : ', no times'}`} aria-pressed={dt === day}
                onClick={() => { setDay(dt); onPick(null); }}>
                {Number(dt.slice(8))}
              </button>
            );
          })}
        </div>
        {!days && !err && <p className="sc-muted"><Loader size={13} className="spin" /> Reading free times…</p>}
        {days && !Object.keys(days).length && <p className="sc-muted">No free times this month{month < lastMonth ? ' — try the next one.' : '.'}</p>}
        {err && <p className="sc-error" role="alert">{err}</p>}
      </div>
      <div className="sc-times" aria-label="Times">
        {day ? <b>{dayWords(Date.parse(`${day}T12:00:00Z`), 'UTC')}</b> : <b>Pick a day</b>}
        <div className="sc-time-list">
          {times.map(s => (
            <button key={s.utc} type="button" className={`sc-time${picked?.utc === s.utc ? ' on' : ''}`} aria-pressed={picked?.utc === s.utc} onClick={() => onPick(s)} data-testid="slot">
              {clockLabel(s.visitorTime)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Frame({ site, children }: { site: SiteSource; children: React.ReactNode }) {
  const home = SOURCE_HOME[site];
  return (
    <div className="dc sc" data-source={site}>
      <header className="sc-top">
        <a className="dc-brand" href={home} data-testid="sc-logo"><LogoMark size={24} /><span>Protected Central</span></a>
        <a className="sc-back" href={home} data-testid="sc-back"><ArrowLeft size={14} /> Back to the {SOURCE_LABEL[site].replace('Protected Central website', 'website')}</a>
      </header>
      <main className="sc-main">{children}</main>
    </div>
  );
}

function EmailLine({ notify, email }: { notify?: Notify; email: string }) {
  const g = notify?.guest ?? '';
  if (g === 'sent') return <p className="sc-ok"><Check size={14} /> A confirmation is on its way to {email}.</p>;
  if (g === 'off' || !g) return null;
  return <p className="sc-warn">We could not send a confirmation email{g === 'not_configured' ? '' : ' just now'}. Your booking is saved — please keep the time and the link below.</p>;
}

function MeetingIcon({ type }: { type: string }) {
  return type === 'phone' ? <Phone size={15} /> : type === 'in_person' ? <MapPin size={15} /> : <Video size={15} />;
}

export default function StrategyCallPage() {
  const q = new URLSearchParams(window.location.search);
  const src = (SITE_SOURCES as readonly string[]).includes(q.get('src') ?? '') ? q.get('src') as SiteSource : 'main';
  const manage = q.get('manage') ?? '';
  useEffect(() => { rememberArrival(); }, []);

  const [cfg, setCfg] = useState<{ settings: PublicSettings; delivery: { confirms: boolean } } | null>(null);
  const [loadErr, setLoadErr] = useState('');
  usePageTitle(cfg ? `${cfg.settings.title} — Protected Central` : 'Book a call — Protected Central');

  useEffect(() => {
    void call<{ settings: PublicSettings; delivery: { confirms: boolean } }>('config')
      .then(d => (d.success ? setCfg({ settings: d.settings, delivery: d.delivery }) : setLoadErr(d.error ?? 'Could not load the booking page.')))
      .catch(() => setLoadErr('Could not reach the server. Check your connection and try again.'));
  }, []);

  if (loadErr) return <Frame site={src}><div className="sc-card"><p className="sc-error" role="alert">{loadErr}</p></div></Frame>;
  if (!cfg) return <Frame site={src}><div className="sc-card"><p className="sc-muted"><Loader size={14} className="spin" /> Loading…</p></div></Frame>;
  if (manage) return <Frame site={src}><Manage token={manage} settings={cfg.settings} /></Frame>;
  if (!cfg.settings.enabled) {
    return (
      <Frame site={src}>
        <div className="sc-card sc-closed" data-testid="sc-closed">
          <h1>{cfg.settings.title}</h1>
          <p>Bookings are not open at the moment.</p>
          <p className="sc-muted">You can <a href={WRITE_TO[src]}>write to us instead</a> and a person will reply by email.</p>
        </div>
      </Frame>
    );
  }
  return <Frame site={src}><Book settings={cfg.settings} confirms={cfg.delivery.confirms} src={src} /></Frame>;
}

function Book({ settings, confirms, src }: { settings: PublicSettings; confirms: boolean; src: SiteSource }) {
  const [tz, setTz] = useState(browserZone());
  const [duration, setDuration] = useState(settings.defaultDuration);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [f, setF] = useState({ name: '', email: '', company: '', website: '', industry: INDUSTRY_OF[src], phone: '' });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [done, setDone] = useState<Booked | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  /* One id per attempt at one slot: a retry after a lost answer finds the booking it made. */
  const requestId = useRef(newRequestId());
  const zones = useMemo(() => allZones(tz, settings.timezone), [tz, settings.timezone]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(x => ({ ...x, [k]: e.target.value }));

  const pick = useCallback((s: Slot | null) => { setSlot(s); requestId.current = newRequestId(); setError(null); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!slot || busy) return;
    setBusy(true); setError(null);
    try {
      const d = await call<Booked>('create', {
        requestId: requestId.current, ownerDate: slot.ownerDate, ownerTime: slot.ownerTime, duration, timezone: tz,
        ...f, answers, source: sourceFromLocation(),
      });
      if (d.success) setDone(d);
      else {
        setError({ text: d.error ?? 'The booking was not saved.', field: d.field });
        /* The time went while they typed: show the calendar again, fresh. */
        if (d.code === 'slot') { setSlot(null); setPickerKey(k => k + 1); }
      }
    } catch {
      setError({ text: 'Could not reach the server. Your booking may not be saved — press Confirm again; it will not book twice.' });
    } finally { setBusy(false); }
  }

  if (done) {
    const ms = Date.parse(done.startsAt);
    const link = done.key ? `${window.location.origin}${window.location.pathname}?src=${src}&manage=${encodeURIComponent(done.id)}.${encodeURIComponent(done.key)}` : '';
    return (
      <div className="sc-card sc-done" data-testid="sc-done" role="status">
        <span className="sc-done-mark"><CalendarCheck size={22} /></span>
        <h1>You’re booked.</h1>
        <p className="sc-when">{dayWords(ms, tz, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, {clockLabel(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms)))} <small>({tz})</small></p>
        {done.meeting && <p className="sc-meet"><MeetingIcon type={settings.meetingType} /> <span>{done.meeting}</span></p>}
        <EmailLine notify={done.notify} email={f.email} />
        {done.replayed && <p className="sc-muted">This booking was already saved from your earlier press — nothing was booked twice.</p>}
        {link && <p className="sc-muted">To move or cancel it later, keep this link: <a href={link} data-testid="sc-manage-link">manage your booking</a>.</p>}
      </div>
    );
  }

  const field = (name: string) => (error?.field === name ? ' sc-bad' : '');
  return (
    <div className="sc-layout">
      <aside className="sc-card sc-about">
        <span className="dc-eyebrow">{SOURCE_LABEL[src] === SOURCE_LABEL.main ? 'Protected Central' : SOURCE_LABEL[src]}</span>
        <h1>{settings.title}</h1>
        {settings.description && <p>{settings.description}</p>}
        <ul className="sc-facts">
          {settings.hostName && <li><span className="sc-ico">{settings.hostName.slice(0, 1)}</span> With {settings.hostName}{settings.hostRole ? `, ${settings.hostRole}` : ''}</li>}
          <li><Clock size={15} /> {settings.durations.length > 1 ? `${settings.durations.join(', ')} minutes` : `${duration} minutes`}</li>
          <li><MeetingIcon type={settings.meetingType} /> {settings.meetingType === 'phone' ? 'Phone call' : settings.meetingType === 'in_person' ? 'In person' : 'Video call'}</li>
          <li><Globe size={15} /> Times shown in {tz}</li>
        </ul>
        {settings.durations.length > 1 && (
          <div className="sc-durations" role="radiogroup" aria-label="Length">
            {settings.durations.map(n => (
              <button key={n} type="button" role="radio" aria-checked={n === duration} className={n === duration ? 'on' : ''} onClick={() => { setDuration(n); pick(null); }}>{n} min</button>
            ))}
          </div>
        )}
        <label className="sc-zone">Your time zone
          <select value={tz} onChange={e => { setTz(e.target.value); pick(null); }} data-testid="sc-zone">
            {zones.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </label>
      </aside>

      <section className="sc-card sc-pick">
        <h2>Select a date and time</h2>
        <Picker key={pickerKey} settings={settings} duration={duration} tz={tz} picked={slot} onPick={pick} testid="sc-picker" />

        {slot && (
          <form className="sc-form" onSubmit={submit} noValidate>
            <h2>Your details</h2>
            <div className="sc-row">
              <label>Name<input className={field('strategy.name')} data-field="strategy.name" value={f.name} onChange={set('name')} autoComplete="name" required /></label>
              <label>Email<input className={field('strategy.email')} data-field="strategy.email" type="email" value={f.email} onChange={set('email')} autoComplete="email" required /></label>
            </div>
            <div className="sc-row">
              <label>Business name<input className={field('strategy.company')} data-field="strategy.company" value={f.company} onChange={set('company')} autoComplete="organization" required /></label>
              <label>Website <small>(optional)</small><input className={field('strategy.website')} data-field="strategy.website" value={f.website} onChange={set('website')} placeholder="example.com" inputMode="url" /></label>
            </div>
            <div className="sc-row">
              <label>Industry <small>(optional)</small><input data-field="strategy.industry" value={f.industry} onChange={set('industry')} /></label>
              <label>Phone <small>(optional)</small><input data-field="strategy.phone" value={f.phone} onChange={set('phone')} autoComplete="tel" inputMode="tel" /></label>
            </div>
            {settings.questions.map(qn => (
              <label key={qn.id}>{qn.label}{!qn.required && <small> (optional)</small>}
                {qn.long
                  ? <textarea className={field(`strategy.answer.${qn.id}`)} data-field={`strategy.answer.${qn.id}`} rows={3} value={answers[qn.id] ?? ''} onChange={e => setAnswers(a => ({ ...a, [qn.id]: e.target.value }))} />
                  : <input className={field(`strategy.answer.${qn.id}`)} data-field={`strategy.answer.${qn.id}`} value={answers[qn.id] ?? ''} onChange={e => setAnswers(a => ({ ...a, [qn.id]: e.target.value }))} />}
              </label>
            ))}

            <div className="sc-summary" data-testid="sc-summary">
              <b>{settings.title}, {duration} minutes</b>
              <span>{dayWords(slot.utc, tz, { weekday: 'long', day: 'numeric', month: 'long' })}, {clockLabel(slot.visitorTime)} ({tz})</span>
              {tz !== settings.timezone && <small>That is {clockLabel(slot.ownerTime)} for us in {settings.timezone}.</small>}
              <small>{confirms ? 'A confirmation email follows once it is booked.' : 'You will see the confirmation on this page.'}</small>
            </div>
            {error && <p className="sc-error" role="alert">{error.text}</p>}
            <button className="dc-btn dc-btn-primary dc-btn-lg" type="submit" disabled={busy} data-testid="sc-confirm">
              {busy ? <><Loader size={15} className="spin" /> Booking…</> : <>Confirm booking</>}
            </button>
          </form>
        )}
        {!slot && error && <p className="sc-error" role="alert">{error.text}</p>}
      </section>
    </div>
  );
}

function Manage({ token, settings }: { token: string; settings: PublicSettings }) {
  const [id, key] = [token.slice(0, token.indexOf('.')), token.slice(token.indexOf('.') + 1)];
  const [b, setB] = useState<ManagedBooking | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [moving, setMoving] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);
  const tz = b?.visitorTimezone || browserZone();

  const load = useCallback(() => {
    void call<{ booking: ManagedBooking }>('manage_get', { id, key }).then(d => (d.success ? setB(d.booking) : setError(d.error ?? 'Booking not found.')))
      .catch(() => setError('Could not reach the server.'));
  }, [id, key]);
  useEffect(load, [load]);

  if (error && !b) return <div className="sc-card"><p className="sc-error" role="alert">{error}</p></div>;
  if (!b) return <div className="sc-card"><p className="sc-muted"><Loader size={14} className="spin" /> Loading…</p></div>;
  const ms = Date.parse(b.startsAt);
  const words = `${dayWords(ms, tz, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${clockLabel(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms)))} (${tz})`;

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true); setError(''); setMsg('');
    try {
      const d = await call<{ notify?: Notify }>(action, { id, key, ...extra });
      if (!d.success) { setError(d.error ?? 'That did not work.'); return; }
      setMsg(action === 'manage_cancel' ? 'Your call is cancelled.' : 'Your call has moved.');
      setMoving(false); setSlot(null); load();
    } catch { setError('Could not reach the server.'); } finally { setBusy(false); }
  };

  return (
    <div className="sc-card sc-manage" data-testid="sc-manage">
      <h1>{b.title}</h1>
      <p className="sc-when">{words}</p>
      <p>Status: <b data-testid="sc-status">{b.status === 'confirmed' ? 'Booked' : b.status === 'cancelled' ? 'Cancelled' : b.status}</b></p>
      {b.meeting && <p className="sc-meet"><MeetingIcon type={settings.meetingType} /> <span>{b.meeting}</span></p>}
      {msg && <p className="sc-ok" role="status"><Check size={14} /> {msg}</p>}
      {error && <p className="sc-error" role="alert">{error}</p>}
      {b.status === 'confirmed' && !moving && (
        <div className="sc-actions">
          <button className="dc-btn dc-btn-outline" disabled={busy || !settings.enabled} onClick={() => setMoving(true)}>Reschedule</button>
          <button className="dc-btn dc-btn-ghost" disabled={busy} onClick={() => { if (window.confirm('Cancel this call?')) void act('manage_cancel'); }} data-testid="sc-cancel">Cancel the call</button>
        </div>
      )}
      {moving && (
        <>
          <Picker settings={settings} duration={b.duration} tz={tz} picked={slot} onPick={setSlot} />
          <div className="sc-actions">
            <button className="dc-btn dc-btn-primary" disabled={!slot || busy} onClick={() => slot && void act('manage_reschedule', { ownerDate: slot.ownerDate, ownerTime: slot.ownerTime })}>Move it here</button>
            <button className="dc-btn dc-btn-ghost" onClick={() => { setMoving(false); setSlot(null); }}>Keep the current time</button>
          </div>
        </>
      )}
    </div>
  );
}
