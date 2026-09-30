/**
 * Sign-ups & trials — the install owner's view of who arrived.
 *
 * The question it answers every morning: who signed up, did they get going,
 * who is about to run out of trial — and then lets the owner do something
 * about it without leaving the screen: a message inside their app, the same
 * message by email, and an invitation to a kickoff call.
 *
 * The signals are deliberately coarse — a project made, a mailbox connected,
 * a request for help, when they were last here. They are counts the install
 * already holds; nothing on this screen reads inside a customer's workspace.
 *
 * Owner only. The server refuses everybody else (routes/customers.ts); the
 * check here only turns a stale bookmark into a sentence.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck, CheckCircle2, Clock, LifeBuoy, Loader, Mail, RefreshCw, Rocket, Send, ShieldAlert,
  Sparkles, UserPlus, Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { isInstallOwner } from '../../services/moderation';
import {
  loadSignups, messageCustomers, saveCustomerSettings, type CustomerSettings, type Signup,
} from '../../services/customers';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const DAY = 86_400_000;

type Filter = 'all' | 'week' | 'trial' | 'ending' | 'ended' | 'paid' | 'stalled';

const FILTERS: { id: Filter; label: string; test: (s: Signup) => boolean }[] = [
  { id: 'all', label: 'Everyone', test: () => true },
  { id: 'week', label: 'New this week', test: s => Date.now() - Date.parse(s.createdAt) < 7 * DAY },
  { id: 'trial', label: 'On trial', test: s => s.trial.kind === 'trial' },
  { id: 'ending', label: 'Ending in 2 days', test: s => s.trial.kind === 'trial' && s.trial.daysLeft <= 2 },
  { id: 'stalled', label: 'Not started', test: s => !s.projects && !s.mailboxes },
  { id: 'ended', label: 'Trial ended', test: s => s.trial.kind === 'ended' },
  { id: 'paid', label: 'Paying', test: s => s.trial.kind === 'paid' },
];

/* Ready-made messages. Every one is a starting point the owner edits — none
   is sent without being read on the way. */
const TEMPLATES = (kickoff: string) => [
  {
    id: 'kickoff', label: 'Kickoff call invite',
    title: 'Can I help you set up your first project?',
    body: 'Thanks for starting your trial. Book a free 20-minute kickoff call and I will set up your first Autopilot project with you, on your screen — you leave with something already running.',
    link: kickoff, linkLabel: 'Book my kickoff call',
  },
  {
    id: 'checkin', label: 'Checking in',
    title: 'How is it going so far?',
    body: 'Just checking in. If anything was confusing or did not work the way you expected, reply to this or press the help button in the corner of any screen — you can chat, share your screen, or book a call.',
    link: kickoff, linkLabel: 'Book a call',
  },
  {
    id: 'ending', label: 'Trial ending soon',
    title: 'Your free trial ends soon',
    body: 'Your 7-day trial ends in a couple of days. Everything you have built stays where it is — choose a plan under Plan & billing to keep Autopilot running. If you are not sure which plan fits, book a quick call and we will work it out together.',
    link: kickoff, linkLabel: 'Talk it through',
  },
];

function ago(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < DAY) return `${Math.floor(ms / 3_600_000)} h ago`;
  const d = Math.floor(ms / DAY);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

function TrialChip({ s }: { s: Signup }) {
  const t = s.trial;
  const [bg, fg, text] = t.kind === 'trial'
    ? (t.daysLeft <= 2 ? ['#fff7ed', '#9a3412', `${t.daysLeft}d left`] : ['#f3f8e6', '#3f4a1d', `${t.daysLeft}d left`])
    : t.kind === 'ended' ? ['#fef2f2', '#991b1b', 'Trial ended']
      : t.kind === 'paid' ? ['#ecfdf5', '#065f46', 'Paying']
        : ['#f3f4f6', '#374151', 'Before trials'];
  return <span style={{ background: bg, color: fg, borderRadius: 999, padding: '3px 9px', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{text}</span>;
}

export default function Signups() {
  const { addNotification } = useApp();
  const owner = isInstallOwner();
  const [rows, setRows] = useState<Signup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [canEmail, setCanEmail] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const [settings, setSettings] = useState<CustomerSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const [composeOpen, setComposeOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [alsoEmail, setAlsoEmail] = useState(true);
  const [sending, setSending] = useState(false);

  const apply = useCallback((r: Awaited<ReturnType<typeof loadSignups>>) => {
    setLoading(false);
    if (!r.ok) { setError(r.error || 'Could not load sign-ups.'); return; }
    setError('');
    setRows(r.signups);
    setCanEmail(r.canEmail);
    if (r.settings) setSettings(r.settings);
  }, []);
  const refresh = useCallback(async () => { setLoading(true); apply(await loadSignups()); }, [apply]);

  useEffect(() => { if (owner) void loadSignups().then(apply); }, [owner, apply]);

  const shown = useMemo(() => rows.filter(FILTERS.find(f => f.id === filter)!.test), [rows, filter]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(f => [f.id, rows.filter(f.test).length])) as Record<Filter, number>, [rows]);

  if (!owner) {
    return (
      <div style={{ maxWidth: 560, margin: '60px auto', textAlign: 'center', padding: 24 }}>
        <ShieldAlert size={22} color={MUTED} />
        <h1 style={{ fontSize: 17, fontWeight: 800, color: INK, margin: '10px 0 6px' }}>Not your screen</h1>
        <p style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.6, margin: 0 }}>
          Sign-ups belong to whoever runs this installation.
        </p>
      </div>
    );
  }

  const togglePick = (email: string) => setPicked(p => {
    const n = new Set(p);
    if (n.has(email)) n.delete(email); else n.add(email);
    return n;
  });
  const allShownPicked = shown.length > 0 && shown.every(s => picked.has(s.email));

  const applyTemplate = (id: string) => {
    const t = TEMPLATES(settings?.kickoffUrl ?? '').find(x => x.id === id);
    if (!t) return;
    setTitle(t.title); setBody(t.body); setLink(t.link); setLinkLabel(t.link ? t.linkLabel : '');
  };

  const openCompose = (emails: string[], template = 'kickoff') => {
    setPicked(new Set(emails));
    applyTemplate(template);
    setAlsoEmail(canEmail);
    setComposeOpen(true);
    setTimeout(() => document.getElementById('su-compose')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const send = async () => {
    setSending(true);
    const r = await messageCustomers({ to: [...picked], title, body, link, linkLabel, email: alsoEmail && canEmail });
    setSending(false);
    if (!r.ok) { addNotification(r.error || 'Could not send.', 'error'); return; }
    const parts = [`Shown in the app to ${r.delivered}`];
    if (alsoEmail && canEmail) parts.push(r.emailFailed ? `emailed ${r.emailed}, ${r.emailFailed} email(s) failed` : `emailed ${r.emailed}`);
    addNotification(`${parts.join('; ')}.`, r.emailFailed ? 'error' : 'success');
    setComposeOpen(false);
    setPicked(new Set());
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSavingSettings(true);
    const r = await saveCustomerSettings(settings);
    setSavingSettings(false);
    if (!r.ok) { addNotification(r.error || 'Could not save.', 'error'); return; }
    if (r.settings) setSettings(r.settings);
    addNotification('Saved.', 'success');
  };

  const stat = (icon: typeof Users, label: string, n: number, tone = INK) => {
    const Icon = icon;
    return (
      <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: '12px 14px', display: 'grid', gap: 4 }}>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, color: MUTED, fontWeight: 600 }}><Icon size={13} /> {label}</span>
        <b style={{ fontSize: 22, color: tone }}>{n}</b>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: 'clamp(16px, 3vw, 28px) clamp(12px, 3vw, 0px) 60px', display: 'grid', gap: 18 }}>
      <header style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(20px, 3.4vw, 26px)', fontWeight: 800, color: INK, letterSpacing: '-0.025em' }}>
            Sign-ups &amp; trials
          </h1>
          <p style={{ margin: '5px 0 0', fontSize: 13.5, color: MUTED, lineHeight: 1.6 }}>
            Everyone who signed up, how far they got, and when their 7-day trial ends. Reach the ones who are
            stuck before day seven — that is when a trial is won or lost.
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} style={GHOST} disabled={loading}>
          {loading ? <Loader size={14} className="spin" /> : <RefreshCw size={14} />} Refresh
        </button>
      </header>

      {error && <div role="alert" style={{ background: '#fef2f2', color: '#991b1b', borderRadius: 12, padding: '10px 14px', fontSize: 13.5 }}>{error}</div>}

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {stat(UserPlus, 'New this week', counts.week ?? 0)}
        {stat(Clock, 'On trial', counts.trial ?? 0)}
        {stat(Sparkles, 'Ending in 2 days', counts.ending ?? 0, '#9a3412')}
        {stat(Rocket, 'Not started', counts.stalled ?? 0, '#9a3412')}
        {stat(CheckCircle2, 'Paying', counts.paid ?? 0, '#065f46')}
      </div>

      {/* ── Kickoff call and the welcome ── */}
      {settings && (
        <section style={PANEL}>
          <h2 style={H2}><CalendarCheck size={16} /> Kickoff call &amp; welcome</h2>
          <p style={{ margin: '4px 0 12px', fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
            Your booking link goes on every trial customer&rsquo;s trial bar, their help card, and the welcome
            they find when they first sign in. Use one of your own booking pages (Booking pages → copy link) or any
            calendar link.
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={LABEL}>
              <span>Kickoff call booking link</span>
              <input data-field="kickoffUrl" style={INPUT} placeholder="https://app.protectedcentral.com/book/kickoff"
                value={settings.kickoffUrl} onChange={e => setSettings({ ...settings, kickoffUrl: e.target.value })} />
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
              <input type="checkbox" checked={settings.welcomeOn} onChange={e => setSettings({ ...settings, welcomeOn: e.target.checked })} />
              Show every new sign-up a welcome message inside the app
            </label>
            {settings.welcomeOn && (
              <>
                <label style={LABEL}>
                  <span>Welcome headline</span>
                  <input style={INPUT} value={settings.welcomeTitle} onChange={e => setSettings({ ...settings, welcomeTitle: e.target.value })} />
                </label>
                <label style={LABEL}>
                  <span>Welcome message</span>
                  <textarea style={{ ...INPUT, minHeight: 70, resize: 'vertical' }} value={settings.welcomeBody}
                    onChange={e => setSettings({ ...settings, welcomeBody: e.target.value })} />
                </label>
              </>
            )}
            <div><button type="button" style={SOLID} disabled={savingSettings} onClick={() => void saveSettings()}>
              {savingSettings ? <Loader size={14} className="spin" /> : null} Save
            </button></div>
          </div>
        </section>
      )}

      {/* ── Compose ── */}
      {composeOpen && (
        <section id="su-compose" style={PANEL}>
          <h2 style={H2}><Send size={16} /> Message {picked.size} {picked.size === 1 ? 'person' : 'people'}</h2>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0 12px' }}>
            {TEMPLATES('').map(t => <button key={t.id} type="button" style={GHOST} onClick={() => applyTemplate(t.id)}>{t.label}</button>)}
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={LABEL}><span>Headline</span>
              <input data-field="title" style={INPUT} value={title} onChange={e => setTitle(e.target.value)} />
            </label>
            <label style={LABEL}><span>Message</span>
              <textarea style={{ ...INPUT, minHeight: 110, resize: 'vertical' }} value={body} onChange={e => setBody(e.target.value)} />
            </label>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <label style={LABEL}><span>Button link (optional)</span>
                <input data-field="link" style={INPUT} value={link} placeholder="https://…" onChange={e => setLink(e.target.value)} />
              </label>
              <label style={LABEL}><span>Button text</span>
                <input style={INPUT} value={linkLabel} placeholder="Book my kickoff call" onChange={e => setLinkLabel(e.target.value)} />
              </label>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5, color: canEmail ? INK : MUTED }}>
              <input type="checkbox" disabled={!canEmail} checked={alsoEmail && canEmail} onChange={e => setAlsoEmail(e.target.checked)} style={{ marginTop: 3 }} />
              <span>
                Also send it by email
                {!canEmail && <><br /><small>Connect and validate a mailbox in your own workspace (Settings → Email &amp; SMS) to email as well. The in-app message still goes.</small></>}
              </span>
            </label>
            <p style={{ margin: 0, fontSize: 12.5, color: MUTED }}>
              It appears in a card in the corner of their app until they close it.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={SOLID} disabled={sending || !title.trim() || !picked.size} onClick={() => void send()}>
                {sending ? <Loader size={14} className="spin" /> : <Send size={14} />} Send
              </button>
              <button type="button" style={GHOST} onClick={() => setComposeOpen(false)}>Cancel</button>
            </div>
          </div>
        </section>
      )}

      {/* ── The list ── */}
      <section style={{ ...PANEL, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: 12, borderBottom: `1px solid ${LINE}`, alignItems: 'center' }}>
          {FILTERS.map(f => (
            <button key={f.id} type="button" onClick={() => setFilter(f.id)} style={{
              ...GHOST, background: filter === f.id ? INK : '#fff', color: filter === f.id ? '#fff' : INK, borderColor: filter === f.id ? INK : LINE,
            }}>
              {f.label} <span style={{ opacity: 0.7 }}>{counts[f.id] ?? 0}</span>
            </button>
          ))}
          <span style={{ marginLeft: 'auto' }} />
          <button type="button" style={SOLID} disabled={!picked.size} onClick={() => openCompose([...picked])}>
            <Mail size={14} /> Message {picked.size || ''}
          </button>
        </div>

        {loading && !rows.length ? (
          <div style={{ padding: 30, textAlign: 'center', color: MUTED }}><Loader size={18} className="spin" /></div>
        ) : !shown.length ? (
          <div style={{ padding: 30, textAlign: 'center', color: MUTED, fontSize: 13.5 }}>
            {rows.length ? 'Nobody matches this filter.' : 'Nobody has signed up yet. They will appear here the moment they do.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: MUTED, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={TH}><input type="checkbox" aria-label="Select everyone shown" checked={allShownPicked}
                    onChange={() => setPicked(p => { const n = new Set(p); shown.forEach(s => (allShownPicked ? n.delete(s.email) : n.add(s.email))); return n; })} /></th>
                  <th style={TH}>Who</th>
                  <th style={TH}>Signed up</th>
                  <th style={TH}>Trial</th>
                  <th style={TH}>Last here</th>
                  <th style={TH}>Got going</th>
                  <th style={TH} />
                </tr>
              </thead>
              <tbody>
                {shown.map(s => (
                  <tr key={s.email} style={{ borderTop: `1px solid ${LINE}` }}>
                    <td style={TD}><input type="checkbox" aria-label={`Select ${s.email}`} checked={picked.has(s.email)} onChange={() => togglePick(s.email)} /></td>
                    <td style={TD}>
                      <b style={{ display: 'block', color: INK }}>{s.name || s.email.split('@')[0]}</b>
                      <a href={`mailto:${s.email}`} style={{ color: MUTED, textDecoration: 'none' }}>{s.email}</a>
                    </td>
                    <td style={TD} title={new Date(s.createdAt).toLocaleString()}>{ago(s.createdAt)}</td>
                    <td style={TD}><TrialChip s={s} /></td>
                    <td style={TD}>{ago(s.lastSeen)}</td>
                    <td style={TD}>
                      <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                        <Signal on={s.projects > 0} label={s.projects ? `${s.projects} project${s.projects === 1 ? '' : 's'}` : 'No project'} />
                        <Signal on={s.mailboxes > 0} label={s.mailboxes ? 'Mailbox' : 'No mailbox'} />
                        {s.helpAsked > 0 && <span style={{ ...PILL, background: '#eef2ff', color: '#3730a3' }}><LifeBuoy size={11} /> Asked for help</span>}
                      </span>
                    </td>
                    <td style={{ ...TD, textAlign: 'right' }}>
                      <button type="button" style={GHOST} onClick={() => openCompose([s.email], s.trial.kind === 'trial' && s.trial.daysLeft <= 2 ? 'ending' : 'kickoff')}>
                        <Send size={12} /> Message
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Signal({ on, label }: { on: boolean; label: string }) {
  return (
    <span style={{ ...PILL, background: on ? '#ecfdf5' : '#f3f4f6', color: on ? '#065f46' : '#6b7280' }}>
      {on ? <CheckCircle2 size={11} /> : null}{label}
    </span>
  );
}

const PANEL: React.CSSProperties = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: 'clamp(14px, 2.5vw, 20px)' };
const H2: React.CSSProperties = { margin: 0, fontSize: 15.5, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 8 };
const LABEL: React.CSSProperties = { display: 'grid', gap: 5, fontSize: 12.5, fontWeight: 700, color: INK };
const INPUT: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', border: `1px solid ${LINE}`, borderRadius: 10, padding: '9px 11px',
  fontSize: 13.5, fontFamily: 'inherit', color: INK, fontWeight: 500, background: '#fff',
};
const SOLID: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 999, padding: '8px 14px',
  background: INK, color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
};
const GHOST: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '6px 12px', border: `1px solid ${LINE}`,
  background: '#fff', color: INK, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
};
const PILL: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 999, padding: '2px 8px', fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap' };
const TH: React.CSSProperties = { padding: '10px 12px', fontWeight: 700 };
const TD: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'top' };
