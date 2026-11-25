/**
 * Customer Support → Customers — the install owner's own customers.
 *
 * Owner only (Engagement.tsx shows the tab to the install owner alone; every
 * action is refused on the server for anybody else). Three parts:
 *
 *  Customers   who they are, which plan, who is online now; message one,
 *              offer them a live call, ask to open their account, or look at
 *              it read-only.
 *  Email       one email to everybody on trial, paid, AppSumo… — an update
 *              (about their account, to all of them) or marketing (with an
 *              unsubscribe, skipping those who said no). Sent in batches by
 *              the cron; progress is shown, partial failure said as partial.
 *  Access      every permission asked for, given, ended, and every read-only
 *              review with its reason.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Eye, KeyRound, Loader, Mail, MessageSquare, RefreshCw, Search, Send, ShieldCheck, Video, X } from 'lucide-react';
import {
  desk, deskError, SEGMENT_LABEL, SUPPORT_VISIT_KEY,
  type AccessRow, type Broadcast, type DeskCustomer, type Segment, type SupportVisit,
} from '../../services/supportDesk';
import { getActiveAccountId, loadSubAccounts, saveSubAccounts, switchAccount, type SubAccount } from '../../services/tenancy';
import { useApp } from '../../context/AppContext';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';
const SEG_TONE: Record<Segment, [string, string]> = {
  trial: ['#eef2ff', '#3e3aa8'], ended: ['#fdf2f2', '#b42318'], paid: ['#e9f7ef', '#0f7b3d'], appsumo: ['#fff7e6', '#9a5b00'], other: ['#f1f5f9', '#475569'],
};

type Sub = 'customers' | 'email' | 'access';
type Filter = 'all' | 'online' | Segment;
type Sheet = { mode: 'message' | 'call' | 'access' | 'review'; c: DeskCustomer } | null;

function ago(iso: string | null): string {
  if (!iso) return 'never';
  const s = Math.floor((Date.now() - Date.parse(iso)) / 1000);
  if (s < 90) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

export default function EngageCustomers() {
  const [sub, setSub] = useState<Sub>('customers');
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {([['customers', 'Customers'], ['email', 'Email customers'], ['access', 'Access & reviews']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={sub === id} onClick={() => setSub(id)} style={chipBtn(sub === id)}>{label}</button>
        ))}
      </div>
      {sub === 'customers' && <CustomerList />}
      {sub === 'email' && <EmailCustomers />}
      {sub === 'access' && <AccessLog />}
    </div>
  );
}

/* ── Customers ────────────────────────────────────────────────────────────── */

function CustomerList() {
  const { addNotification } = useApp();
  const [rows, setRows] = useState<DeskCustomer[]>([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [calendar, setCalendar] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'denied'));

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setBusy(true);
    const r = await desk('customers');
    if (r.success) { setRows((r.customers as DeskCustomer[]) ?? []); setCalendar(!!r.calendar); setErr(''); }
    else setErr(deskError(r, 'Could not load your customers.'));
    setBusy(false);
  }, []);
  useEffect(() => {
    void load();
    /* Online changes by the minute; the list follows while it is on screen. */
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void load(true); }, 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, online: rows.filter(r => r.online).length };
    for (const r of rows) c[r.segment] = (c[r.segment] ?? 0) + 1;
    return c;
  }, [rows]);
  const shown = rows
    .filter(r => filter === 'all' || (filter === 'online' ? r.online : r.segment === filter))
    .filter(r => !q.trim() || `${r.name} ${r.email}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => Number(b.online) - Number(a.online));

  const openWorkspace = async (c: DeskCustomer) => {
    if (!c.access) return;
    const r = await desk('access_open', { id: c.access.id });
    if (!r.success) { addNotification(deskError(r, 'That permission is not active.'), 'error'); return; }
    const accountId = String(r.mainAccountId || (r.workspaces as string[])?.[0] || '');
    if (!accountId) { addNotification('That customer has no workspace to open.', 'error'); return; }
    const visit: SupportVisit = {
      accessId: c.access.id, accountId, customerEmail: c.email, customerName: String(r.customerName || c.name || ''),
      expiresAt: String(r.expiresAt), returnTo: getActiveAccountId() ?? '',
    };
    const list = loadSubAccounts();
    if (!list.some(a => a.id === accountId)) {
      const entry: SubAccount = {
        id: accountId, parentId: null, name: `${visit.customerName || c.email} (support visit)`, businessName: '',
        contactName: visit.customerName, contactEmail: c.email, phone: '', industry: '', color: '#b45309',
        plan: 'starter', price: 0, status: 'active', createdAt: new Date().toISOString(),
      };
      saveSubAccounts([...list, entry]);
    }
    try { localStorage.setItem(SUPPORT_VISIT_KEY, JSON.stringify(visit)); } catch { /* storage off */ }
    switchAccount(accountId);
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['all', 'online', 'trial', 'ended', 'paid', 'appsumo'] as Filter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={chipBtn(filter === f)}>
            {f === 'all' ? 'All' : f === 'online' ? 'Online now' : SEGMENT_LABEL[f as Segment]} <span style={{ opacity: 0.65 }}>{counts[f] ?? 0}</span>
          </button>
        ))}
        <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 150 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or email" style={{ ...input, paddingLeft: 30 }} />
        </div>
        <button onClick={() => void load()} style={ghost} aria-label="Refresh"><RefreshCw size={13} /> Refresh</button>
        {perm !== 'granted' && 'Notification' in window && (
          <button style={ghost} onClick={async () => setPerm(await Notification.requestPermission())}>
            <Bell size={13} /> Desktop alerts
          </button>
        )}
      </div>
      <p style={{ margin: 0, fontSize: 12.5, color: MUTED }}>
        {perm === 'granted' ? 'Desktop alerts are on: you hear when a customer comes online, replies, joins your call or approves access, while the app is open. ' : ''}
        Your phone gets the same alerts through the app once push is set up.
      </p>
      {err && <div role="alert" style={alertBox}>{err}</div>}
      {busy && !rows.length && <div style={{ color: MUTED, fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}><Loader size={14} className="spin" /> Loading customers…</div>}
      {!busy && !shown.length && !err && <div style={{ color: MUTED, fontSize: 13 }}>Nobody here yet.</div>}

      <div style={{ display: 'grid', gap: 8 }}>
        {shown.map(c => {
          const [bg, fg] = SEG_TONE[c.segment];
          const active = c.access?.status === 'active' && c.access.expiresAt && Date.parse(c.access.expiresAt) > Date.now();
          return (
            <div key={c.email} data-testid="desk-customer" style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: '12px 14px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span title={c.online ? 'Online now' : 'Offline'} style={{ width: 9, height: 9, borderRadius: 99, background: c.online ? '#22c55e' : '#cbd5e1', flexShrink: 0 }} />
                  <b style={{ fontSize: 14, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{c.name || c.email}</b>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: bg, color: fg }}>
                    {SEGMENT_LABEL[c.segment]}{c.segment === 'trial' && c.trial?.daysLeft ? ` · ${c.trial.daysLeft} d left` : ''}
                  </span>
                  {active && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#fff7e6', color: '#9a5b00' }}>Access until {new Date(c.access!.expiresAt!).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>}
                  {c.access?.status === 'pending' && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#f1f5f9', color: '#475569' }}>Access asked — waiting</span>}
                </div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.email} · {c.online ? `online now${c.onlinePath ? ` on ${c.onlinePath}` : ''}${c.onlineApp === 'phone' ? ' (phone app)' : ''}` : `last seen ${ago(c.lastSeen)}`}
                  {' '}· {c.projects} business workspace{c.projects === 1 ? '' : 's'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button style={ghost} onClick={() => setSheet({ mode: 'message', c })}><MessageSquare size={13} /> Message</button>
                <button style={c.online ? primarySm : ghost} onClick={() => setSheet({ mode: 'call', c })} title={calendar ? '' : 'Connect Google Calendar under Meetings first'}><Video size={13} /> Offer a call</button>
                {active
                  ? <button style={primarySm} onClick={() => void openWorkspace(c)}><KeyRound size={13} /> Open their account</button>
                  : <button style={ghost} disabled={c.access?.status === 'pending'} onClick={() => setSheet({ mode: 'access', c })}><ShieldCheck size={13} /> Ask for access</button>}
                <button style={ghost} onClick={() => setSheet({ mode: 'review', c })}><Eye size={13} /> Review</button>
              </div>
            </div>
          );
        })}
      </div>
      {sheet && <ActionSheet sheet={sheet} calendar={calendar} onClose={() => setSheet(null)} onDone={() => void load(true)} />}
    </div>
  );
}

function ActionSheet({ sheet, calendar, onClose, onDone }: { sheet: NonNullable<Sheet>; calendar: boolean; onClose: () => void; onDone: () => void }) {
  const { addNotification } = useApp();
  const { mode, c } = sheet;
  const [text, setText] = useState('');
  const [emailToo, setEmailToo] = useState(!c.online);
  const [hours, setHours] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field: string; text: string }>({ field: '', text: '' });
  const [meet, setMeet] = useState('');
  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null);
  const who = c.name || c.email;
  const title = { message: `Message ${who}`, call: `Offer ${who} a live call`, access: `Ask ${who} for access`, review: `Review ${who}'s account (read-only)` }[mode];

  const go = async () => {
    setBusy(true); setErr({ field: '', text: '' });
    const r = mode === 'message' ? await desk('direct', { email: c.email, message: text, emailToo })
      : mode === 'call' ? await desk('offer_call', { email: c.email, message: text, emailToo })
        : mode === 'access' ? await desk('access_request', { email: c.email, hours, reason: text })
          : await desk('review', { email: c.email, reason: text });
    setBusy(false);
    if (!r.success) { setErr({ field: String(r.field ?? ''), text: deskError(r, 'That did not go through.') }); return; }
    const mailNote = typeof r.emailed === 'string' && r.emailed && r.emailed !== 'sent' ? ` The email did not go: ${r.emailed}` : '';
    if (mode === 'message') { addNotification(`Message sent to ${who}.${mailNote}`, mailNote ? 'info' : 'success'); onDone(); onClose(); }
    if (mode === 'call') { setMeet(String(r.meetUrl ?? '')); addNotification(`Call offered to ${who}.${mailNote}`, mailNote ? 'info' : 'success'); onDone(); }
    if (mode === 'access') { addNotification(`Asked ${who} for ${hours} h of access — you will hear when they answer.${mailNote}`, mailNote ? 'info' : 'success'); onDone(); onClose(); }
    if (mode === 'review') setSnapshot((r.snapshot as Record<string, unknown>) ?? null);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(0px, 3vw, 24px)' }}>
      <div style={{ width: '100%', maxWidth: snapshot ? 900 : 560, maxHeight: '100%', background: '#fff', borderRadius: 'clamp(0px, 2vw, 18px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${LINE}` }}>
          <h3 style={{ margin: 0, fontSize: 15, color: INK }}>{title}</h3>
          <button onClick={onClose} disabled={busy} aria-label="Close" style={{ ...ghost, padding: 6 }}><X size={15} /></button>
        </div>
        <div style={{ padding: '14px 18px', overflowY: 'auto', display: 'grid', gap: 10 }}>
          {snapshot ? <ReviewView snapshot={snapshot} /> : meet ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 14, color: INK }}>The offer is in the corner of {who}&rsquo;s app{emailToo ? ' and in their inbox' : ''}. You will hear when they join. Open the call now so you are there first:</p>
              <a href={meet} target="_blank" rel="noopener noreferrer" style={{ ...primarySm, justifySelf: 'start', textDecoration: 'none', padding: '10px 16px' }}><Video size={14} /> Join the call</a>
            </div>
          ) : (
            <>
              {mode === 'call' && !calendar && <div role="alert" style={alertBox}>The call is a Google Meet made from your calendar — connect Google Calendar under Customer Support → Meetings first.</div>}
              {mode === 'access' && (
                <>
                  <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.55 }}>They get an email and a message in their app, and nothing changes until they approve. Access ends by itself when the time is up, and they are emailed when it starts and when it ends.</p>
                  <label style={label}>How long
                    <select value={hours} onChange={e => setHours(Number(e.target.value))} data-field="ac.hours" style={{ ...input, marginTop: 4 }}>
                      {[1, 2, 4, 8].map(h => <option key={h} value={h}>{h} hour{h === 1 ? '' : 's'}</option>)}
                    </select>
                  </label>
                </>
              )}
              {mode === 'review' && <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.55 }}>A read-only look to check the account is used within the rules. Nothing can be changed from here, nothing is sent to the customer, and the review is recorded with your reason under Access &amp; reviews. The Terms tell customers Protected Central may review accounts for misuse.</p>}
              <label style={label}>
                {mode === 'message' ? 'Message' : mode === 'call' ? 'Message with the offer (optional)' : mode === 'access' ? 'What you need it for — they read this before deciding' : 'Why you are looking'}
                <textarea value={text} onChange={e => setText(e.target.value)} rows={mode === 'message' ? 6 : 3}
                  data-field={mode === 'message' ? 'dm.message' : mode === 'access' ? 'ac.reason' : mode === 'review' ? 'rv.reason' : 'call.message'}
                  placeholder={mode === 'call' ? 'Leave blank for: “I can see you are setting things up. Would a quick video or voice call help?”' : ''}
                  style={{ ...input, marginTop: 4, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, borderColor: err.field.endsWith('message') || err.field.endsWith('reason') ? '#e5484d' : LINE }} />
              </label>
              {(mode === 'message' || mode === 'call') && (
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: INK }}>
                  <input type="checkbox" checked={emailToo} onChange={e => setEmailToo(e.target.checked)} />
                  Also email it now {c.online ? '(they are online — the app shows it straight away)' : '(they are offline)'}
                </label>
              )}
              {err.text && <div role="alert" style={alertBox}>{err.text}</div>}
            </>
          )}
        </div>
        {!snapshot && !meet && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: `1px solid ${LINE}` }}>
            <button onClick={onClose} disabled={busy} style={ghost}>Cancel</button>
            <button onClick={() => void go()} disabled={busy || (mode === 'call' && !calendar)} style={primarySm}>
              {busy ? <Loader size={13} className="spin" /> : mode === 'review' ? <Eye size={13} /> : <Send size={13} />}
              {mode === 'message' ? 'Send' : mode === 'call' ? 'Make the call and offer it' : mode === 'access' ? `Ask for ${hours} h` : 'Open read-only'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** What a read-only review found, laid out to scan. Only reads what the server sent. */
function ReviewView({ snapshot }: { snapshot: Record<string, unknown> }) {
  const ws = (snapshot.workspaces as Record<string, unknown>[]) ?? [];
  const table = (rows: Record<string, unknown>[], cols?: string[]) => {
    if (!rows?.length) return <div style={{ fontSize: 12.5, color: MUTED }}>None.</div>;
    const keys = cols ?? Object.keys(rows[0]).slice(0, 7);
    return (
      <div style={{ overflowX: 'auto', border: `1px solid ${LINE}`, borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr>{keys.map(k => <th key={k} style={{ textAlign: 'left', padding: '6px 8px', background: '#f8fafc', color: MUTED, fontWeight: 700, whiteSpace: 'nowrap' }}>{k}</th>)}</tr></thead>
          <tbody>{rows.slice(0, 40).map((r, i) => <tr key={i}>{keys.map(k => <td key={k} style={{ padding: '6px 8px', borderTop: `1px solid ${LINE}`, color: INK, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{typeof r[k] === 'object' ? JSON.stringify(r[k]) : String(r[k] ?? '')}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  };
  return (
    <div style={{ display: 'grid', gap: 14 }} data-testid="review-view">
      <div style={{ fontSize: 12.5, color: MUTED }}>Read-only snapshot of {String(snapshot.customerEmail)} at {time(String(snapshot.readAt))}. Recorded under Access &amp; reviews.</div>
      {!ws.length && <div style={{ fontSize: 13 }}>This customer has no workspace yet.</div>}
      {ws.map(w => (
        <div key={String(w.accountId)} style={{ display: 'grid', gap: 10, border: `1px solid ${LINE}`, borderRadius: 12, padding: 12 }}>
          <b style={{ fontSize: 13, color: INK }}>Workspace {String(w.accountId)}</b>
          <Section title="Sent in the last 7 days">{table(w.sends7d as Record<string, unknown>[], ['channel', 'status', 'n'])}</Section>
          <Section title="Recent sends">{table(w.recentSends as Record<string, unknown>[])}</Section>
          <Section title="Business workspaces">{table(w.projects as Record<string, unknown>[])}</Section>
          <Section title="Mailboxes (no passwords or keys)">{table(w.mailboxes as Record<string, unknown>[])}</Section>
          <Section title="Pages and domains">{table([...(w.pages as Record<string, unknown>[] ?? []), ...(w.domains as Record<string, unknown>[] ?? [])])}</Section>
          <Section title="Stored lists (contacts, campaigns…)">
            {table(((w.data as { key: string; count: number | null; bytes: number }[]) ?? []).map(d => ({ list: d.key.replace(/^crm_/, ''), items: d.count ?? '—', size: `${Math.round(d.bytes / 1024)} KB` })), ['list', 'items', 'size'])}
          </Section>
          {((w.data as { key: string; sample: Record<string, unknown>[] }[]) ?? []).filter(d => d.sample?.length).slice(0, 8).map(d => (
            <Section key={d.key} title={`${d.key.replace(/^crm_/, '')} — first ${d.sample.length}`}>{table(d.sample)}</Section>
          ))}
        </div>
      ))}
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ display: 'grid', gap: 6 }}><div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.04em' }}>{title}</div>{children}</div>;
}

/* ── Email customers ──────────────────────────────────────────────────────── */

function EmailCustomers() {
  const { addNotification } = useApp();
  const [kind, setKind] = useState<'update' | 'marketing'>('update');
  const [aud, setAud] = useState<Segment[]>(['trial']);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [inApp, setInApp] = useState(true);
  const [count, setCount] = useState<{ count: number; optedOut: number } | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState<{ field: string; text: string }>({ field: '', text: '' });
  const [history, setHistory] = useState<Broadcast[]>([]);

  const loadHistory = useCallback(async () => {
    const r = await desk('broadcasts');
    if (r.success) setHistory((r.broadcasts as Broadcast[]) ?? []);
  }, []);
  useEffect(() => {
    void loadHistory();
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void loadHistory(); }, 20_000);
    return () => window.clearInterval(t);
  }, [loadHistory]);
  useEffect(() => {
    let alive = true;
    void desk('broadcast_count', { audience: aud, kind }).then(r => { if (alive && r.success) setCount({ count: Number(r.count ?? 0), optedOut: Number(r.optedOut ?? 0) }); });
    return () => { alive = false; };
  }, [aud, kind]);

  const payload = { kind, subject, body, link, linkLabel, audience: aud, inApp };
  const send = async (test: boolean) => {
    setBusy(test ? 'test' : 'send'); setErr({ field: '', text: '' });
    const r = await desk(test ? 'broadcast_test' : 'broadcast_send', payload);
    setBusy('');
    if (!r.success) { setErr({ field: String(r.field ?? ''), text: deskError(r, 'That did not go through.') }); return; }
    if (test) addNotification(`Test sent to ${String(r.to)}.`, 'success');
    else {
      addNotification(`Queued for ${Number(r.total)} customer${Number(r.total) === 1 ? '' : 's'} — it goes out in batches over the next minutes.`, 'success');
      setSubject(''); setBody(''); setLink(''); setLinkLabel('');
      void loadHistory();
    }
  };
  const bad = (f: string) => (err.field === f ? '#e5484d' : LINE);
  const willSend = count ? count.count - (kind === 'marketing' ? count.optedOut : 0) : 0;

  return (
    <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 16, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setKind('update')} style={chipBtn(kind === 'update')}>Update about their account</button>
          <button onClick={() => setKind('marketing')} style={chipBtn(kind === 'marketing')}>Marketing / offer</button>
        </div>
        <p style={{ margin: 0, fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
          {kind === 'update'
            ? 'For news customers need about their account or the service (changes, outages, new features they use). It goes to everybody chosen.'
            : 'Offers and promotions. It carries an unsubscribe link, as the law requires, and skips anybody who has unsubscribed.'}
        </p>
        <div>
          <div style={{ ...label, marginBottom: 6 }}>Send to</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} data-field="bc.audience">
            {(['trial', 'ended', 'paid', 'appsumo', 'other'] as Segment[]).map(sg => (
              <label key={sg} style={{ ...chipBtn(aud.includes(sg)), display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={aud.includes(sg)} onChange={e => setAud(a => e.target.checked ? [...a, sg] : a.filter(x => x !== sg))} style={{ margin: 0 }} />
                {SEGMENT_LABEL[sg]}
              </label>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6 }}>
            {count ? `${count.count} customer${count.count === 1 ? '' : 's'}${kind === 'marketing' && count.optedOut ? ` — ${count.optedOut} unsubscribed and will be skipped` : ''}` : 'Counting…'}
          </div>
        </div>
        <label style={label}>Subject
          <input value={subject} onChange={e => setSubject(e.target.value)} data-field="bc.subject" maxLength={200} style={{ ...input, marginTop: 4, borderColor: bad('bc.subject') }} />
        </label>
        <label style={label}>Message <span style={{ fontWeight: 500 }}>— {'{name}'} becomes their first name; a blank line starts a new paragraph</span>
          <textarea value={body} onChange={e => setBody(e.target.value)} data-field="bc.body" rows={8} style={{ ...input, marginTop: 4, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, borderColor: bad('bc.body') }} />
        </label>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <label style={label}>Button link (optional)
            <input value={link} onChange={e => setLink(e.target.value)} data-field="bc.link" placeholder="https://" style={{ ...input, marginTop: 4, borderColor: bad('bc.link') }} />
          </label>
          <label style={label}>Button text
            <input value={linkLabel} onChange={e => setLinkLabel(e.target.value)} placeholder="Open" maxLength={60} style={{ ...input, marginTop: 4 }} />
          </label>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: INK }}>
          <input type="checkbox" checked={inApp} onChange={e => setInApp(e.target.checked)} /> Also show it in the corner of their app
        </label>
        {err.text && <div role="alert" style={alertBox}>{err.text}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={() => void send(true)} disabled={!!busy} style={ghost}>{busy === 'test' ? <Loader size={13} className="spin" /> : <Mail size={13} />} Send a test to me</button>
          <button onClick={() => void send(false)} disabled={!!busy || !willSend} style={primarySm}>{busy === 'send' ? <Loader size={13} className="spin" /> : <Send size={13} />} Send to {willSend} customer{willSend === 1 ? '' : 's'}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <b style={{ fontSize: 13, color: INK }}>Sent before</b>
        {!history.length && <div style={{ fontSize: 13, color: MUTED }}>Nothing yet.</div>}
        {history.map(b => (
          <div key={b.id} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: '10px 12px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.subject}</div>
              <div style={{ fontSize: 12, color: MUTED }}>
                {b.kind === 'marketing' ? 'Marketing' : 'Update'} · {(() => { try { return (JSON.parse(b.audience) as Segment[]).map(x => SEGMENT_LABEL[x]).join(', '); } catch { return ''; } })()} · {time(b.createdAt)}
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: INK }}>
              {b.sent} of {b.total} sent{b.failed ? <span style={{ color: '#b42318' }}> · {b.failed} failed</span> : null}{b.skipped ? ` · ${b.skipped} skipped` : ''}
              {' '}· <b>{b.status === 'done' ? (b.failed ? 'finished with failures' : 'done') : b.status === 'cancelled' ? 'cancelled' : `sending (${b.queued} to go)`}</b>
            </div>
            {(b.status === 'queued' || b.status === 'sending') && (
              <button style={ghost} onClick={async () => { await desk('broadcast_cancel', { id: b.id }); void loadHistory(); }}>Stop</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Access & reviews ─────────────────────────────────────────────────────── */

function AccessLog() {
  const { addNotification } = useApp();
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [busy, setBusy] = useState(true);
  const load = useCallback(async () => {
    setBusy(true);
    const r = await desk('access_list');
    setRows((r.access as AccessRow[]) ?? []);
    setBusy(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const STATUS: Record<string, string> = {
    pending: 'Waiting for their answer', active: 'Active', declined: 'Declined', expired: 'Ended — time ran out',
    ended: 'Ended by you', revoked: 'Ended by the customer', lapsed: 'Not answered in 48 h',
  };
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: MUTED }}>Every request to open a customer&rsquo;s account and every read-only review, with its reason.</p>
      {busy && <div style={{ color: MUTED, fontSize: 13 }}><Loader size={14} className="spin" /> Loading…</div>}
      {!busy && !rows.length && <div style={{ color: MUTED, fontSize: 13 }}>Nothing yet.</div>}
      {rows.map(r => {
        const live = r.status === 'active' && r.expiresAt && Date.parse(r.expiresAt) > Date.now();
        return (
          <div key={r.id} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: '10px 12px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>
                {r.mode === 'review' ? 'Read-only review' : `Access for ${r.hours} h`} · {r.customerEmail}
              </div>
              <div style={{ fontSize: 12, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {time(r.requestedAt)} · {r.mode === 'review' ? 'recorded' : (live ? `Active until ${time(r.expiresAt)}` : STATUS[r.status] ?? r.status)} · {r.reason}
              </div>
            </div>
            {live && <button style={ghost} onClick={async () => { const x = await desk('access_end', { id: r.id }); addNotification(x.success ? 'Access ended — they have been emailed.' : deskError(x, 'Could not end it.'), x.success ? 'success' : 'error'); void load(); }}>End now</button>}
          </div>
        );
      })}
    </div>
  );
}

/* ── styles ── */
function chipBtn(on: boolean): React.CSSProperties {
  return { padding: '7px 12px', borderRadius: 999, border: `1px solid ${on ? INK : LINE}`, background: on ? INK : '#fff', color: on ? '#fff' : INK, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' };
}
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 10, fontSize: 13.5, outline: 'none', background: '#fff', color: INK };
const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: MUTED };
const ghost: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 10, border: `1px solid ${LINE}`, background: '#fff', color: INK, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' };
const primarySm: React.CSSProperties = { ...ghost, background: ACCENT, borderColor: ACCENT, color: '#fff' };
const alertBox: React.CSSProperties = { padding: '9px 12px', background: '#fdf2f2', color: '#b42318', borderRadius: 10, fontSize: 12.5, fontWeight: 600 };
