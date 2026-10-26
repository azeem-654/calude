/**
 * Settings → Platform services → Strategy Call Booking.
 *
 * The install owner's own booking page for prospects from the public sites
 * (routes/strategyCall.ts). It is not a workspace's booking page — those live
 * under Booking pages — and nothing here is stored in a workspace. The server
 * refuses every call on this panel from anybody but the install owner; the
 * tab being hidden from customers is only a courtesy.
 *
 * What it says about integrations is what the server reports: the install
 * mailbox, if one is validated, sends confirmations; there is no calendar or
 * video connection, and the panel says so rather than implying one.
 */
import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, Check, Copy, Loader, Plus, Trash2 } from 'lucide-react';
import { API_BASE } from '../../services/apiBase';
import { sessionToken } from '../../services/auth';
import { allZones } from '../../services/bookingTime';
import type { DayKey } from '../../../worker/src/lib/bookingTime';
import {
  DURATION_CHOICES, SOURCE_LABEL, STRATEGY_CALL_PATH, type Question, type StrategySettings, type Window,
} from '../../../worker/src/lib/strategyCall';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';
const DAY_NAME: Record<DayKey, string> = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' };
const ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

interface Integration { state: string; from?: string; detail?: string }
interface Booking {
  id: string; status: string; startsAt: string; duration: number; ownerDate: string; ownerTime: string; hostTimezone: string; visitorTimezone: string;
  name: string; email: string; company: string; website: string; industry: string; phone: string;
  answers: Record<string, string> & { _asked?: Record<string, string> }; sourceSite: string;
  source: { utm?: Record<string, string>; clickIds?: Record<string, string>; referrer?: string };
  note: string; history: { at: string; by: string; what: string }[]; notify: Record<string, string>; createdAt: string;
}

const api = async <T,>(action: string, extra: Record<string, unknown> = {}) => {
  const r = await fetch(`${API_BASE}/api/strategy-call.php`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: sessionToken(), action, ...extra }),
  });
  return r.json() as Promise<T & { success?: boolean; error?: string; field?: string }>;
};

const box: React.CSSProperties = { background: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, padding: 'clamp(16px, 3vw, 24px)', minWidth: 0 };
const input: React.CSSProperties = { width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '8px 10px', borderRadius: 9, border: `1px solid ${LINE}`, fontSize: 13, fontFamily: 'inherit', color: INK, background: '#fff' };
const label: React.CSSProperties = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: '#334155', minWidth: 0 };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: `1px solid ${LINE}`, background: '#fff', color: INK, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const primary: React.CSSProperties = { ...btn, background: INK, color: '#fff', border: `1px solid ${INK}` };
const h4: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: INK, margin: '18px 0 8px' };
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 10 };

function when(b: Booking): string {
  const d = new Date(b.startsAt);
  return `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: b.hostTimezone })}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: b.hostTimezone })} (${b.hostTimezone})`;
}

export default function StrategyCallSettings() {
  const [s, setS] = useState<StrategySettings | null>(null);
  const [integrations, setIntegrations] = useState<Record<string, Integration>>({});
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [newClosed, setNewClosed] = useState('');

  useEffect(() => {
    void api<{ settings: StrategySettings; integrations: Record<string, Integration> }>('settings_get').then(d => {
      if (d.success) { setS(d.settings); setIntegrations(d.integrations); } else setError({ text: d.error ?? 'Could not read the settings.' });
    }).catch(() => setError({ text: 'Could not reach the server.' }));
  }, []);

  if (!s) return <div style={box}><h3 style={{ margin: 0, fontSize: 16, color: INK }}>Strategy Call Booking</h3>{error ? <p style={{ color: '#b42318', fontSize: 13 }}>{error.text}</p> : <p style={{ color: MUTED, fontSize: 13 }}><Loader size={12} className="spin" /> Reading…</p>}</div>;

  const set = <K extends keyof StrategySettings>(k: K, v: StrategySettings[K]) => { setS({ ...s, [k]: v }); setSaved(''); };
  const setWin = (day: DayKey, i: number, k: keyof Window, v: string) => set('weekly', { ...s.weekly, [day]: s.weekly[day].map((w, n) => (n === i ? { ...w, [k]: v } : w)) });
  const bad = (f: string) => (error?.field === f || error?.field?.startsWith(`${f}.`) ? { ...input, borderColor: '#f04438' } : input);
  const publicUrl = `${window.location.origin.replace('//app.', '//')}${STRATEGY_CALL_PATH}`;

  const save = async () => {
    setBusy(true); setError(null); setSaved('');
    try {
      const d = await api<{ settings: StrategySettings }>('settings_save', { settings: s });
      if (d.success) { setS(d.settings); setSaved('Saved.'); } else setError({ text: d.error ?? 'Not saved.', field: d.field });
    } catch { setError({ text: 'Could not reach the server.' }); } finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'grid', gap: 16, minWidth: 0 }} data-testid="strategy-settings">
      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <CalendarCheck size={18} color={INK} />
          <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0, flex: 1, minWidth: 180 }}>Strategy Call Booking</h3>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: INK, cursor: 'pointer' }}>
            <input type="checkbox" checked={s.enabled} onChange={e => set('enabled', e.target.checked)} data-field="strategy.enabled" data-testid="strategy-enabled" />
            Taking bookings
          </label>
        </div>
        <p style={{ fontSize: 13, color: MUTED, margin: '6px 0 12px', lineHeight: 1.6 }}>
          Your own call with prospects from the home page and the HVAC, roofing and medical billing sites — every booking button
          on those sites opens this page. Only you can see or change this; it is not one of your workspaces’ booking pages.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
          <code style={{ background: '#f1f5f9', padding: '6px 10px', borderRadius: 8, overflowWrap: 'anywhere', minWidth: 0 }} data-testid="strategy-url">{publicUrl}</code>
          <button style={btn} onClick={() => { void navigator.clipboard?.writeText(publicUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy link'}
          </button>
          <a style={btn} href={STRATEGY_CALL_PATH} target="_blank" rel="noopener">Open the page</a>
        </div>
        <div style={{ display: 'grid', gap: 4, marginTop: 12, fontSize: 12.5, color: '#334155', lineHeight: 1.55 }} data-testid="strategy-integrations">
          <div><b>Email:</b> {integrations.email?.state === 'connected' ? `confirmations and reminders send from ${integrations.email.from}.` : 'no validated system mailbox — bookings are saved, but no confirmation, reminder or notice is emailed. Set one in Settings → Email & SMS → System email.'}</div>
          <div><b>Calendar:</b> not connected. {integrations.calendar?.detail}</div>
          <div><b>Video:</b> {integrations.video?.detail}</div>
        </div>
      </div>

      <div style={box}>
        <h4 style={{ ...h4, marginTop: 0 }}>The meeting</h4>
        <div style={grid2}>
          <label style={label}>Title<input style={bad('strategy.title')} data-field="strategy.title" value={s.title} onChange={e => set('title', e.target.value)} /></label>
          <label style={label}>Your name, as visitors see it<input style={input} data-field="strategy.hostName" value={s.hostName} onChange={e => set('hostName', e.target.value)} /></label>
          <label style={label}>Your role<input style={input} data-field="strategy.hostRole" value={s.hostRole} onChange={e => set('hostRole', e.target.value)} /></label>
        </div>
        <label style={{ ...label, marginTop: 10 }}>Description<textarea style={{ ...input, minHeight: 64 }} data-field="strategy.description" value={s.description} onChange={e => set('description', e.target.value)} /></label>
        <div style={{ ...grid2, marginTop: 10 }}>
          <div style={label}>
            Lengths offered
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }} data-field="strategy.durations">
              {DURATION_CHOICES.map(n => (
                <label key={n} style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontWeight: 600 }}>
                  <input type="checkbox" checked={s.durations.includes(n)} onChange={e => set('durations', e.target.checked ? [...s.durations, n].sort((a, b) => a - b) : s.durations.filter(x => x !== n))} /> {n} min
                </label>
              ))}
            </div>
          </div>
          <label style={label}>Meeting type
            <select style={input} data-field="strategy.meetingType" value={s.meetingType} onChange={e => set('meetingType', e.target.value as StrategySettings['meetingType'])}>
              <option value="video_link">Video call</option><option value="phone">Phone call</option><option value="in_person">In person</option>
            </select>
          </label>
          <label style={label}>{s.meetingType === 'video_link' ? 'Video room link (optional)' : s.meetingType === 'phone' ? 'How the call happens' : 'Address'}
            <input style={bad('strategy.meetingDetails')} data-field="strategy.meetingDetails" value={s.meetingDetails} placeholder={s.meetingType === 'video_link' ? 'https://… — or leave empty and send each guest a link' : ''} onChange={e => set('meetingDetails', e.target.value)} />
          </label>
        </div>

        <h4 style={h4}>When you can be booked</h4>
        <label style={{ ...label, maxWidth: 360 }}>Your time zone
          <select style={bad('strategy.timezone')} data-field="strategy.timezone" value={s.timezone} onChange={e => set('timezone', e.target.value)}>
            {allZones(s.timezone).map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </label>
        <div style={{ display: 'grid', gap: 6, marginTop: 10 }} data-field="strategy.weekly">
          {ORDER.map(day => (
            <div key={day} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }} data-field={`strategy.weekly.${day}`}>
              <span style={{ width: 92, fontWeight: 700, color: INK }}>{DAY_NAME[day]}</span>
              {!s.weekly[day].length && <span style={{ color: MUTED }}>Closed</span>}
              {s.weekly[day].map((w, i) => (
                <span key={i} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  <input type="time" style={{ ...bad(`strategy.weekly.${day}`), width: 110 }} value={w.from} onChange={e => setWin(day, i, 'from', e.target.value)} aria-label={`${DAY_NAME[day]} from`} />
                  –
                  <input type="time" style={{ ...bad(`strategy.weekly.${day}`), width: 110 }} value={w.to} onChange={e => setWin(day, i, 'to', e.target.value)} aria-label={`${DAY_NAME[day]} to`} />
                  <button style={{ ...btn, padding: 6 }} aria-label="Remove window" onClick={() => set('weekly', { ...s.weekly, [day]: s.weekly[day].filter((_, n) => n !== i) })}><Trash2 size={12} /></button>
                </span>
              ))}
              {s.weekly[day].length < 4 && (
                <button style={{ ...btn, padding: '5px 9px' }} onClick={() => set('weekly', { ...s.weekly, [day]: [...s.weekly[day], s.weekly[day].length ? { from: '13:00', to: '17:00' } : { from: '09:00', to: '12:00' }] })}>
                  <Plus size={12} /> {s.weekly[day].length ? 'Window' : 'Open'}
                </button>
              )}
            </div>
          ))}
        </div>
        <div style={{ ...grid2, marginTop: 12 }}>
          <label style={label}>Minimum notice (hours)<input style={input} type="number" min={0} max={336} value={Math.round(s.minNoticeMin / 60)} onChange={e => set('minNoticeMin', Number(e.target.value) * 60)} data-field="strategy.minNoticeMin" /></label>
          <label style={label}>Bookable up to (days ahead)<input style={input} type="number" min={1} max={180} value={s.windowDays} onChange={e => set('windowDays', Number(e.target.value))} data-field="strategy.windowDays" /></label>
          <label style={label}>Buffer before (minutes)<input style={input} type="number" min={0} max={120} value={s.bufferBefore} onChange={e => set('bufferBefore', Number(e.target.value))} data-field="strategy.bufferBefore" /></label>
          <label style={label}>Buffer after (minutes)<input style={input} type="number" min={0} max={120} value={s.bufferAfter} onChange={e => set('bufferAfter', Number(e.target.value))} data-field="strategy.bufferAfter" /></label>
          <label style={label}>Most calls a day (0 = no limit)<input style={input} type="number" min={0} max={48} value={s.dailyLimit} onChange={e => set('dailyLimit', Number(e.target.value))} data-field="strategy.dailyLimit" /></label>
        </div>

        <h4 style={h4}>Closed dates</h4>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }} data-field="strategy.blackoutDates">
          {s.blackoutDates.map(d => (
            <span key={d} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 12.5, background: '#f1f5f9', borderRadius: 999, padding: '4px 6px 4px 10px' }}>
              {d}<button style={{ border: 0, background: 'none', cursor: 'pointer', padding: 2 }} aria-label={`Open ${d} again`} onClick={() => set('blackoutDates', s.blackoutDates.filter(x => x !== d))}><Trash2 size={11} /></button>
            </span>
          ))}
          <input type="date" style={{ ...input, width: 160 }} value={newClosed} onChange={e => setNewClosed(e.target.value)} aria-label="Date to close" />
          <button style={btn} disabled={!newClosed} onClick={() => { set('blackoutDates', [...new Set([...s.blackoutDates, newClosed])].sort()); setNewClosed(''); }}><Plus size={12} /> Close this date</button>
        </div>

        <h4 style={h4}>Special hours on a date</h4>
        <div style={{ display: 'grid', gap: 6 }} data-field="strategy.overrides">
          {s.overrides.map((o, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
              <input type="date" style={{ ...bad('strategy.overrides'), width: 160 }} value={o.date} onChange={e => set('overrides', s.overrides.map((x, n) => (n === i ? { ...x, date: e.target.value } : x)))} aria-label="Special date" />
              <input type="time" style={{ ...input, width: 110 }} value={o.windows[0]?.from ?? '09:00'} onChange={e => set('overrides', s.overrides.map((x, n) => (n === i ? { ...x, windows: [{ from: e.target.value, to: x.windows[0]?.to ?? '12:00' }] } : x)))} aria-label="From" />
              –
              <input type="time" style={{ ...input, width: 110 }} value={o.windows[0]?.to ?? '12:00'} onChange={e => set('overrides', s.overrides.map((x, n) => (n === i ? { ...x, windows: [{ from: x.windows[0]?.from ?? '09:00', to: e.target.value }] } : x)))} aria-label="To" />
              <button style={{ ...btn, padding: 6 }} aria-label="Remove special hours" onClick={() => set('overrides', s.overrides.filter((_, n) => n !== i))}><Trash2 size={12} /></button>
            </div>
          ))}
          <div><button style={btn} onClick={() => set('overrides', [...s.overrides, { date: '', windows: [{ from: '09:00', to: '12:00' }] }])}><Plus size={12} /> Add special hours</button></div>
        </div>

        <h4 style={h4}>Questions for the visitor (up to 6)</h4>
        <div style={{ display: 'grid', gap: 6 }}>
          {s.questions.map((q, i) => {
            const setQ = (patch: Partial<Question>) => set('questions', s.questions.map((x, n) => (n === i ? { ...x, ...patch } : x)));
            return (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5 }}>
                <input style={{ ...input, flex: '1 1 260px' }} value={q.label} onChange={e => setQ({ label: e.target.value })} aria-label={`Question ${i + 1}`} />
                <label style={{ display: 'inline-flex', gap: 4 }}><input type="checkbox" checked={q.required} onChange={e => setQ({ required: e.target.checked })} /> Required</label>
                <label style={{ display: 'inline-flex', gap: 4 }}><input type="checkbox" checked={q.long} onChange={e => setQ({ long: e.target.checked })} /> Long answer</label>
                <button style={{ ...btn, padding: 6 }} aria-label="Remove question" onClick={() => set('questions', s.questions.filter((_, n) => n !== i))}><Trash2 size={12} /></button>
              </div>
            );
          })}
          {s.questions.length < 6 && <div><button style={btn} onClick={() => set('questions', [...s.questions, { id: '', label: '', required: false, long: false }])}><Plus size={12} /> Add a question</button></div>}
        </div>

        <h4 style={h4}>Confirmations and notices</h4>
        <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
          <label style={{ display: 'inline-flex', gap: 6 }}><input type="checkbox" checked={s.confirmEmail} onChange={e => set('confirmEmail', e.target.checked)} /> Email the visitor a confirmation (with a link to move or cancel)</label>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>Remind the visitor
            <input type="number" min={0} max={72} style={{ ...input, width: 70 }} value={s.reminderHours} onChange={e => set('reminderHours', Number(e.target.value))} data-field="strategy.reminderHours" /> hours before (0 = no reminder)</label>
          <label style={{ display: 'inline-flex', gap: 6 }}><input type="checkbox" checked={s.notifyOnBook} onChange={e => set('notifyOnBook', e.target.checked)} /> Email me when somebody books, moves or cancels</label>
          <label style={{ ...label, maxWidth: 360 }}>Send my notices to (empty = your sign-in address)<input style={bad('strategy.notifyEmail')} data-field="strategy.notifyEmail" type="email" value={s.notifyEmail} onChange={e => set('notifyEmail', e.target.value)} /></label>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 18, flexWrap: 'wrap' }}>
          <button style={primary} disabled={busy} onClick={() => void save()} data-testid="strategy-save">{busy ? <Loader size={12} className="spin" /> : <Check size={12} />} Save</button>
          {saved && <span style={{ fontSize: 12.5, color: '#0f7b3d', fontWeight: 700 }}>{saved}</span>}
          {error && <span role="alert" style={{ fontSize: 12.5, color: '#b42318' }}>{error.text}</span>}
        </div>
      </div>

      <Bookings />
    </div>
  );
}

function Bookings() {
  const [view, setView] = useState<'upcoming' | 'past' | 'cancelled'>('upcoming');
  const [res, setRes] = useState<{ view: string; list: Booking[] | null; error: string; n: number }>({ view: '', list: null, error: '', n: 0 });
  const [n, setN] = useState(0);
  const [open, setOpen] = useState('');
  const current = res.view === view && res.n === n;
  const list = current ? res.list : null;
  const error = current ? res.error : '';
  useEffect(() => {
    void api<{ bookings: Booking[] }>('list', { view })
      .then(d => setRes({ view, n, list: d.success ? d.bookings : null, error: d.success ? '' : d.error ?? 'Could not read the bookings.' }))
      .catch(() => setRes({ view, n, list: null, error: 'Could not reach the server.' }));
  }, [view, n]);
  const load = useCallback(() => setN(x => x + 1), []);

  return (
    <div style={box} data-testid="strategy-bookings">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: INK, margin: 0, flex: 1, minWidth: 160 }}>Strategy calls</h3>
        {(['upcoming', 'past', 'cancelled'] as const).map(v => (
          <button key={v} style={v === view ? primary : btn} onClick={() => setView(v)}>{v === 'upcoming' ? 'Upcoming' : v === 'past' ? 'Past' : 'Cancelled'}</button>
        ))}
      </div>
      {error && <p style={{ color: '#b42318', fontSize: 13 }}>{error}</p>}
      {!list && !error && <p style={{ color: MUTED, fontSize: 13 }}><Loader size={12} className="spin" /> Reading…</p>}
      {list && !list.length && <p style={{ color: MUTED, fontSize: 13 }}>None {view === 'upcoming' ? 'booked yet' : 'here'}.</p>}
      <div style={{ display: 'grid', gap: 8 }}>
        {list?.map(b => <Row key={b.id} b={b} open={open === b.id} onToggle={() => setOpen(open === b.id ? '' : b.id)} onChanged={load} />)}
      </div>
    </div>
  );
}

function Row({ b, open, onToggle, onChanged }: { b: Booking; open: boolean; onToggle: () => void; onChanged: () => void }) {
  const [note, setNote] = useState(b.note);
  const [msg, setMsg] = useState('');
  const [date, setDate] = useState(b.ownerDate);
  const [time, setTime] = useState(b.ownerTime);
  const act = async (action: string, extra: Record<string, unknown> = {}, after = true) => {
    setMsg('');
    const d = await api<{ notify?: Record<string, string> }>(action, { id: b.id, ...extra }).catch(() => ({ success: false, error: 'Could not reach the server.' } as { success: boolean; error: string; notify?: Record<string, string> }));
    if (!d.success) { setMsg(d.error ?? 'That did not work.'); return; }
    const g = d.notify?.guest;
    setMsg(g === 'sent' ? 'Done — the guest was emailed.' : g && g !== 'off' ? `Done — but the guest was not emailed (${g}).` : 'Done.');
    if (after) onChanged();
  };
  const asked = b.answers._asked ?? {};
  const src = [SOURCE_LABEL[b.sourceSite as keyof typeof SOURCE_LABEL] ?? b.sourceSite, b.source.utm?.source, b.source.utm?.campaign].filter(Boolean).join(' · ');
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: '10px 12px', minWidth: 0 }} data-booking={b.id}>
      <button onClick={onToggle} style={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: 10, flexWrap: 'wrap', width: '100%', alignItems: 'baseline' }}>
        <b style={{ fontSize: 13.5, color: INK, flex: '1 1 200px', minWidth: 0, overflowWrap: 'anywhere' }}>{b.name}{b.company ? ` — ${b.company}` : ''}</b>
        <span style={{ fontSize: 12.5, color: '#334155' }}>{when(b)}</span>
        <span style={{ fontSize: 11.5, color: MUTED }}>{src}</span>
        {b.status !== 'confirmed' && <span style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase' }}>{b.status.replace('_', '-')}</span>}
      </button>
      {open && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10, fontSize: 12.5, color: '#334155', lineHeight: 1.55 }}>
          <div style={{ overflowWrap: 'anywhere' }}>{b.email}{b.phone ? ` · ${b.phone}` : ''}{b.website ? ` · ${b.website}` : ''}{b.industry ? ` · ${b.industry}` : ''} · {b.duration} min{b.visitorTimezone ? ` · visitor in ${b.visitorTimezone}` : ''}</div>
          {Object.entries(b.answers).filter(([k]) => k !== '_asked').map(([k, v]) => <div key={k}><b>{asked[k] ?? k}</b><br />{String(v)}</div>)}
          <div style={{ color: MUTED }}>Emails: confirmation {b.notify.guest ?? '—'}, your notice {b.notify.owner ?? '—'}{b.notify.reminder ? `, reminder ${b.notify.reminder}` : ''}</div>
          <label style={label}>Private note (never shown to the guest)
            <textarea style={{ ...input, minHeight: 54 }} value={note} onChange={e => setNote(e.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button style={btn} onClick={() => void act('note', { note }, false)}>Save note</button>
            {b.status === 'confirmed' && <>
              <button style={btn} onClick={() => void act('set_status', { status: 'completed' })}>Mark held</button>
              <button style={btn} onClick={() => void act('set_status', { status: 'no_show' })}>No-show</button>
              <button style={btn} onClick={() => { if (window.confirm('Cancel this call and email the guest?')) void act('cancel'); }}>Cancel</button>
              <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="date" style={{ ...input, width: 150 }} value={date} onChange={e => setDate(e.target.value)} aria-label="New date" />
                <input type="time" style={{ ...input, width: 110 }} value={time} onChange={e => setTime(e.target.value)} aria-label="New time" />
                <button style={btn} onClick={() => void act('reschedule', { ownerDate: date, ownerTime: time })}>Move</button>
              </span>
            </>}
          </div>
          {msg && <div role="status" style={{ fontWeight: 700 }}>{msg}</div>}
          <details><summary style={{ cursor: 'pointer', color: MUTED }}>History</summary>
            {b.history.map((h, i) => <div key={i} style={{ color: MUTED }}>{new Date(h.at).toLocaleString()} — {h.what} by {h.by}</div>)}
          </details>
        </div>
      )}
    </div>
  );
}

