/**
 * AlertsAndHelp.tsx — the alert feed with its delivery preferences, and the
 * help centre for the deliverability module.
 *
 * The help is written to be read by someone who does not know what SPF is and
 * should not have to. Each entry says what the thing is, why it matters, and
 * what to do — in that order.
 */
import { useMemo, useState } from 'react';
import {
  Bell, BellOff, Check, Trash2, AlertTriangle, BookOpen, ChevronRight, Mail, MessageSquare,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  loadAlerts, loadPrefs, savePrefs, markRead, markAllRead, dismissAlert,
  runAlertCheck, checkBlacklistAlert, evaluateRules, SEVERITY_META,
  type Alert, type AlertPrefs, type Severity,
} from '../../services/deliverabilityAlerts';

const INK = '#17191c';

/* ── Help content ────────────────────────────────────────────────────────── */

interface Guide { id: string; title: string; blurb: string; body: string[] }

const GUIDES: Guide[] = [
  {
    id: 'start',
    title: 'Start here: what actually decides whether email arrives',
    blurb: 'The three things that matter, in the order they matter.',
    body: [
      'Reaching an inbox comes down to three things, and they are not equally important.',
      '**1. Authentication.** SPF, DKIM and DMARC are DNS records that prove mail claiming to be from your domain really is. Without them most of what you send goes to spam no matter how good it is. This is the first thing to fix and it is a one-off job.',
      '**2. List quality.** Sending to addresses that do not exist, or to people who did not ask, is what destroys a sending reputation. Providers watch bounces and complaints closely. Verify your list, and never send to anything that has bounced.',
      '**3. Content.** Matters least, but still matters. Filters weight certain phrases, all-capitals subjects and link-heavy messages with little text.',
      'Work down that list in order. Improving content while your authentication is broken changes nothing.',
    ],
  },
  {
    id: 'auth',
    title: 'Setting up SPF, DKIM and DMARC',
    blurb: 'The one-off job that has the biggest effect.',
    body: [
      'Go to **Settings → Email Deliverability → Reputation & authentication**, enter your sending domain and press **Check records**. Whatever is missing or wrong is explained there.',
      '**SPF** lists which servers may send as your domain. You may publish only one SPF record — if you already have one, merge in the new mechanisms rather than adding a second, because two records is a permanent failure that receivers act on.',
      '**DKIM** signs each message with a key. The key comes from whoever sends your mail (your SMTP provider); copy the selector and public key from their dashboard. A DKIM record with an empty `p=` means the key has been revoked and every signature will fail.',
      '**DMARC** tells receivers what to do when SPF or DKIM fails, and sends you reports. Start at `p=none` — that reports without affecting delivery. After a couple of weeks of clean reports, move to `p=quarantine`.',
      'The **Records to publish** section generates exactly what to add, matched to the provider you actually send through, with instructions for Cloudflare, GoDaddy, Namecheap and Google Domains. DNS changes usually appear within minutes; re-run the check afterwards.',
    ],
  },
  {
    id: 'hygiene',
    title: 'Keeping the list clean',
    blurb: 'Where bounces come from, and how to stop them.',
    body: [
      'Every contact carries an **email health** status — Valid, Risky, Invalid or Unchecked — shown as a column on the Contacts screen that sorts and filters.',
      '**Invalid** means the address cannot receive mail: no mail server, a disposable domain, or it has already bounced. These are removed from any send automatically.',
      '**Risky** usually means a role address like `info@` or `sales@`. They generally deliver, but they are read by several people and are marked as spam more often. You can choose to block them in the settings.',
      'To check addresses, use **Verification & placement → Verify unchecked**. It runs in the background, survives closing the tab, and can be paused. Results are written as you go, so stopping half way keeps the work done so far.',
      '**One-click clean** on the Contacts screen deletes everything undeliverable in one step. It asks first, and it cannot be undone.',
    ],
  },
  {
    id: 'suppression',
    title: 'The suppression list',
    blurb: 'Addresses that will never be emailed again, and why that is a feature.',
    body: [
      'When a message is permanently rejected — the mailbox does not exist — the address goes on the suppression list immediately and is never sent to again.',
      'This is deliberate and it is not optional. Repeatedly emailing addresses that bounce is the single clearest signal to a provider that a sender is not maintaining their list, and it is the fastest way to have all of your mail filtered.',
      'Suppression is enforced at the point every outbound email passes through, so it applies to single sends, sequences and campaigns alike. A blocked send is recorded in the contact history with the reason.',
      'You can view, add to and remove from the list in **Settings → Email Deliverability**. Removing an address is occasionally right — a mailbox that was full and is now fixed — but treat it as an exception.',
    ],
  },
  {
    id: 'warmup',
    title: 'Warming up a new domain or address',
    blurb: 'Why a new sender cannot start at full volume.',
    body: [
      'A domain that has never sent email has no reputation. Sending a thousand messages on day one looks exactly like what a spammer does, and providers treat it accordingly.',
      'The warmup engine enforces a daily ceiling that rises over time — roughly doubling every four days — and halves it automatically if bounces or complaints climb. Sends past the day\'s allowance are refused, including sequence steps and scheduled mail.',
      'It also throttles per provider. If Microsoft starts greylisting while Google is fine, the cap for Microsoft comes down on its own.',
      '**What this does not do:** it is not a warmup *network*. Services like Mailreach and Warmbox maintain pools of real mailboxes that send, open and reply to each other to manufacture engagement. That cannot be built into this app, and pretending otherwise would be dishonest. What is real here is the ramp, the ceiling and the feedback that drives them.',
    ],
  },
  {
    id: 'placement',
    title: 'Inbox placement testing',
    blurb: 'The only measurement that says where your mail ended up.',
    body: [
      'Delivery rate tells you the receiving server accepted your message. It does not tell you whether it went to the inbox or straight to spam — and that difference is the whole game.',
      'Placement testing sends a uniquely marked message to seed mailboxes you control, then reads those mailboxes to find where it landed.',
      'Add seed addresses in **Warmup & providers** — one each at Gmail, Outlook and Yahoo gives you a reading across the providers most contacts use. Then give the server read access in **Verification & placement**, using an **app password**, never your real one.',
      'If your host does not have the PHP IMAP extension, the screen says so and you check each mailbox yourself, recording the result. That is less convenient but no less accurate.',
    ],
  },
  {
    id: 'campaigns',
    title: 'Sending a campaign safely',
    blurb: 'What the pre-send check does and why it can stop you.',
    body: [
      'Launching an immediate campaign opens a **pre-send check** rather than sending straight away.',
      'It removes suppressed and undeliverable addresses from the audience automatically — that is not a warning you can dismiss, because sending to them is what causes the damage.',
      'It also flags anything advisory: a bounce or complaint rate above your thresholds, a send larger than the day\'s safe volume, and a content spam score with the specific phrases and what to do about them.',
      'Use **Send seed test** first on anything important. It sends the exact message to your seed mailboxes so you can see where it lands before committing to the full audience.',
      'Blocking issues can be overridden, but the tick box names the consequence rather than asking a vague "are you sure".',
    ],
  },
  {
    id: 'alerts',
    title: 'Alerts',
    blurb: 'What gets raised, and how to be told.',
    body: [
      'Alerts fire when a number crosses a line that matters: complaints above 0.3%, bounces above 5%, sender score below your minimum, a blacklist listing, or inbox placement below 60%.',
      'Each alert says what to do, not just what is wrong. A reading is not an alert.',
      'A condition raises one alert per day. A standing problem is one problem, not one per page load.',
      'In-app alerts always record. Email and SMS are optional and default to critical-only, because an alert channel that cries wolf is one people stop reading.',
    ],
  },
];

function renderBody(line: string) {
  // Minimal emphasis so guides can highlight a term without a markdown library.
  const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i} style={{ color: INK }}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i} style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 4, fontSize: '0.95em' }}>{p.slice(1, -1)}</code>;
    return <span key={i}>{p}</span>;
  });
}

/* ── Component ───────────────────────────────────────────────────────────── */

export default function AlertsAndHelp() {
  const { addNotification, contacts } = useApp();
  const [alerts, setAlerts] = useState<Alert[]>(() => loadAlerts());
  const [prefs, setPrefs] = useState<AlertPrefs>(() => loadPrefs());
  const [checking, setChecking] = useState(false);
  const [openGuide, setOpenGuide] = useState<string | null>('start');

  const pending = useMemo(() => evaluateRules(contacts), [contacts, alerts.length]);

  const persist = (patch: Partial<AlertPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePrefs(next);
  };

  const card: React.CSSProperties = { background: '#fff', borderRadius: 18, border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: 20, marginBottom: 18 };
  const inp: React.CSSProperties = { padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' };
  const h3: React.CSSProperties = { margin: 0, fontSize: 15, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 7 };
  const sub: React.CSSProperties = { margin: '3px 0 0', fontSize: 12, color: '#94a3b8', lineHeight: 1.5 };
  const btn = (primary = false): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6, padding: primary ? '9px 15px' : '8px 13px',
    border: primary ? 'none' : '1px solid #e2e8f0', borderRadius: 9,
    background: primary ? INK : '#fff', color: primary ? '#fff' : '#475569',
    fontSize: 12.5, fontWeight: primary ? 700 : 600, cursor: 'pointer',
  });

  const unread = alerts.filter(a => !a.read).length;

  return (
    <div>
      {/* Alerts */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={h3}>
              <Bell size={15} /> Alerts
              {unread > 0 && (
                <span style={{ padding: '2px 8px', borderRadius: 999, background: '#fef2f2', color: '#dc2626', fontSize: 10, fontWeight: 800 }}>{unread} unread</span>
              )}
            </h3>
            <p style={sub}>
              Raised when a number crosses a line that matters. Each one says what to do about it, and a
              standing problem is raised once a day rather than every time you look.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <button disabled={checking} style={btn(true)} title="Evaluate every rule now"
              onClick={async () => {
                setChecking(true);
                const res = await runAlertCheck(contacts);
                await checkBlacklistAlert();
                setAlerts(loadAlerts());
                setChecking(false);
                addNotification(res.raised.length
                  ? `${res.raised.length} alert${res.raised.length === 1 ? '' : 's'} raised${res.emailed ? `, ${res.emailed} emailed` : ''}`
                  : 'Nothing new — either everything is fine, or today\'s alerts have already been raised.',
                  res.raised.some(a => a.severity === 'critical') ? 'error' : 'info');
              }}>
              {checking ? 'Checking…' : 'Run checks now'}
            </button>
            {unread > 0 && (
              <button onClick={() => { markAllRead(); setAlerts(loadAlerts()); }} title="Mark every alert read" style={btn()}>
                <Check size={12} /> Mark all read
              </button>
            )}
          </div>
        </div>

        {pending.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 11.5, color: '#94a3b8' }}>
            {pending.length} condition{pending.length === 1 ? '' : 's'} currently met. Any not already raised today will appear when you run the checks.
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          {!alerts.length && (
            <p style={{ ...sub, margin: 0 }}>
              No alerts. Either nothing has crossed a threshold, or not enough has been sent yet to judge —
              rules that need history stay quiet rather than guessing.
            </p>
          )}
          {alerts.slice(0, 40).map(a => {
            const m = SEVERITY_META[a.severity];
            return (
              <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 12px', borderRadius: 11, background: a.read ? '#f8fafc' : m.bg, border: `1px solid ${a.read ? '#eef0f3' : m.color + '33'}`, marginBottom: 8 }}>
                <AlertTriangle size={14} color={a.read ? '#94a3b8' : m.color} style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: a.read ? '#64748b' : m.color }}>{a.title}</span>
                    <span style={{ fontSize: 9.5, fontWeight: 800, color: m.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#475569', marginTop: 3, lineHeight: 1.5 }}>{a.detail}</div>
                  <div style={{ fontSize: 11.5, color: INK, marginTop: 4, lineHeight: 1.5, fontWeight: 600 }}>→ {a.action}</div>
                  <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 4 }}>{new Date(a.at).toLocaleString()}</div>
                </div>
                <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                  {!a.read && (
                    <button onClick={() => { markRead(a.id); setAlerts(loadAlerts()); }} title="Mark read"
                      style={{ padding: 6, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', display: 'flex', color: '#475569' }}>
                      <Check size={12} />
                    </button>
                  )}
                  <button onClick={() => { dismissAlert(a.id); setAlerts(loadAlerts()); }} title="Dismiss"
                    style={{ padding: 6, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', display: 'flex', color: '#94a3b8' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Delivery preferences */}
      <div style={card}>
        <h3 style={h3}><BellOff size={15} /> How you are told</h3>
        <p style={sub}>
          In-app alerts always record. Email and SMS default to critical only — a channel that cries wolf
          is one people stop reading.
        </p>

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', gap: 9, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={prefs.email} onChange={e => persist({ email: e.target.checked })}
              style={{ accentColor: INK, cursor: 'pointer' }} />
            <Mail size={13} color="#64748b" />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>Email me</span>
          </label>
          {prefs.email && (
            <input value={prefs.emailTo} onChange={e => persist({ emailTo: e.target.value })}
              placeholder="alerts@yourcompany.com" title="Where alert emails go" style={{ ...inp, maxWidth: 320 }} />
          )}

          <label style={{ display: 'flex', gap: 9, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={prefs.sms} onChange={e => persist({ sms: e.target.checked })}
              style={{ accentColor: INK, cursor: 'pointer' }} />
            <MessageSquare size={13} color="#64748b" />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>Text me</span>
          </label>
          {prefs.sms && (
            <>
              <input value={prefs.smsTo} onChange={e => persist({ smsTo: e.target.value })}
                placeholder="+1 555 0100" title="Where alert texts go" style={{ ...inp, maxWidth: 220 }} />
              <p style={{ ...sub, margin: 0 }}>
                Texts are queued and sent by the SMS provider configured in Settings → Email &amp; SMS.
                The browser cannot reach Twilio directly without exposing your token, so queueing is the safe route.
              </p>
            </>
          )}

          <div>
            <label style={{ fontSize: 11.5, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>
              Send email and SMS for
            </label>
            <select value={prefs.minSeverity} onChange={e => persist({ minSeverity: e.target.value as Severity })}
              title="Minimum severity for email and SMS" style={{ ...inp, cursor: 'pointer', maxWidth: 320 }}>
              <option value="critical">Critical only — things actively harming delivery</option>
              <option value="warning">Warnings and above</option>
              <option value="info">Everything, including suggestions</option>
            </select>
          </div>
        </div>
      </div>

      {/* Help centre */}
      <div style={card}>
        <h3 style={h3}><BookOpen size={15} /> Help centre</h3>
        <p style={sub}>Written for someone who does not know what SPF is and should not have to.</p>

        <div style={{ marginTop: 14 }}>
          {GUIDES.map(g => {
            const open = openGuide === g.id;
            return (
              <div key={g.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                <button onClick={() => setOpenGuide(open ? null : g.id)} title={g.blurb}
                  style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 9, padding: '12px 0', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                  <ChevronRight size={14} color="#94a3b8" style={{ flexShrink: 0, marginTop: 2, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: INK }}>{g.title}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>{g.blurb}</span>
                  </span>
                </button>
                {open && (
                  <div style={{ padding: '0 0 14px 23px' }}>
                    {g.body.map((line, i) => (
                      <p key={i} style={{ margin: '0 0 9px', fontSize: 12.5, color: '#475569', lineHeight: 1.7 }}>
                        {renderBody(line)}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
