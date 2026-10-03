/**
 * The round help button in the corner — Protected Central answering its own
 * customers.
 *
 * ── Why it is the ordinary widget, not a component of its own ──
 *
 * Protected Central is the first tenant of its own engagement platform. The
 * button is `public/widget.js` — the same file every customer puts on their
 * own website — pointed at whichever of the install owner's widgets is ticked
 * "Use as the help button inside Protected Central". So chat, tickets, booking
 * and screen sharing work here exactly as they do for a customer's customers,
 * and a fix to one is a fix to both. A second, in-app support system would be
 * two things to keep honest.
 *
 * On this origin the widget sends the cookie placeholder, so a request from a
 * signed-in customer arrives already proved: the person answering sees who it
 * is and which workspace they were in.
 *
 * ── When there is nothing to show ──
 *
 * The button reads "Help" with a green dot when somebody here has the app
 * open (the widget draws it; see public/widget.js) rather than a bare round
 * icon nobody recognised as more than chat. On the marketing site, where
 * nobody is signed in, the widget may also show a one-time teaser naming
 * the ways in.
 *
 * No such widget yet: customers see nothing — a button that opens onto nothing
 * is worse than no button — and the install owner sees a placeholder that says
 * what to switch on. Not on a reseller's own address, where the product is
 * somebody else's brand and "contact Protected Central" would be the wrong
 * company.
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LifeBuoy, Monitor, Phone, PhoneOff } from 'lucide-react';
import { API_BASE } from '../../services/apiBase';
import { getSession } from '../../services/auth';
import { getActiveAccountId } from '../../services/tenancy';
import { isWhiteLabelHost } from '../../services/hosts';
import { liveDecline, liveWaiting, type RingingCall } from '../../services/engagement';
import { useRinger } from '../Engagement/liveSound';

const ACCENT = '#5b46e5';

/* One request per page load, shared: the answer changes when the owner edits a
   widget, not while somebody is reading the page. */
let houseKey: Promise<string> | null = null;
function loadHouseKey(): Promise<string> {
  if (!houseKey) {
    houseKey = fetch(`${API_BASE}/api/engage.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'house' }),
    }).then(r => r.json()).then((r: { widgetKey?: string }) => String(r.widgetKey ?? ''))
      .catch(() => '');
  }
  return houseKey;
}

function inject(key: string, who: { name: string; email: string; workspace: string } | null) {
  if (document.querySelector('script[data-pc-widget]')) return;
  const s = document.createElement('script');
  s.src = `${API_BASE || window.location.origin}/widget.js`;
  s.async = true;
  s.setAttribute('data-pc-widget', key);
  /* Signed out is the marketing site: there, and only there, the widget may
     offer its teaser card once a visit. Inside the app it would be one more
     thing in the corner of somebody who is working. */
  if (!who) s.setAttribute('data-pc-teaser', '');
  if (who) {
    s.setAttribute('data-pc-name', who.name);
    s.setAttribute('data-pc-email', who.email);
    s.setAttribute('data-pc-workspace', who.workspace);
  }
  document.body.appendChild(s);
}

export default function HelpLauncher({ signedIn = true }: { signedIn?: boolean }) {
  const [state, setState] = useState<'loading' | 'widget' | 'none'>('loading');
  const navigate = useNavigate();
  const session = signedIn ? getSession() : null;
  const isOwner = !!session && session.user.accountId == null && session.user.role === 'agency';

  useEffect(() => {
    if (isWhiteLabelHost()) { setState('none'); return; }
    let alive = true;
    void loadHouseKey().then(key => {
      if (!alive) return;
      if (!key) { setState('none'); return; }
      const s = getSession();
      inject(key, signedIn && s ? {
        name: s.user.name || '', email: s.user.email || '', workspace: getActiveAccountId() || '',
      } : null);
      setState('widget');
    });
    return () => { alive = false; };
  }, [signedIn]);

  return (
    <>
      {signedIn && <LiveAlert />}
      {state === 'none' && isOwner && !isWhiteLabelHost() && (
        <button
          type="button"
          onClick={() => navigate('/engagement?tab=widgets')}
          title="Your help button is not set up. Make a widget in Customer Engagement → Widgets, tick “Use as the help button inside Protected Central”, and make it live. Only you see this."
          aria-label="Set up the help button your customers see"
          style={{
            position: 'fixed', right: 20, bottom: 20, zIndex: 900, width: 52, height: 52, borderRadius: '50%',
            border: `2px dashed ${ACCENT}`, background: '#fff', color: ACCENT, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 10px 26px -8px rgba(15,23,42,.35)',
          }}
        >
          <LifeBuoy size={22} />
        </button>
      )}
    </>
  );
}

/**
 * "Somebody is calling" and "somebody is waiting to share their screen",
 * wherever you are in the app.
 *
 * The Live help tab shows both within seconds, but nobody sits on that tab. A
 * person in front of "waiting for somebody to join" is the most time-sensitive
 * thing this product holds — and a call rings for barely a minute — so the
 * alert follows the person answering round the app, and a call rings here.
 *
 * It asks only while the page is visible (a hidden tab cannot answer, and its
 * asking is also what lights the widget's "online" dot, which must mean
 * somebody is looking): every five seconds when the workspace takes calls,
 * every thirty when it only takes screen shares, and never again once the
 * server says neither is switched on — most workspaces never will, and they
 * should not pay a request a minute for a feature they have not chosen.
 */
function LiveAlert() {
  const [waiting, setWaiting] = useState(0);
  const [calls, setCalls] = useState<RingingCall[]>([]);
  const [busy, setBusy] = useState('');
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const location = useLocation();
  const navigate = useNavigate();
  const onTab = location.pathname === '/engagement' && location.search.includes('tab=live');

  useEffect(() => {
    let alive = true;
    let timer = 0;
    let off = false;
    const ask = async () => {
      window.clearTimeout(timer);
      if (!alive || off) return;
      if (document.visibilityState !== 'visible') return;
      const r = await liveWaiting();
      if (!alive) return;
      if (r.success && !r.enabled) { off = true; setWaiting(0); setCalls([]); return; }
      setWaiting(r.success ? Number(r.waiting ?? 0) : 0);
      setCalls(r.success ? (r.calls ?? []) as RingingCall[] : []);
      timer = window.setTimeout(() => void ask(), r.success && r.voice ? 5_000 : 30_000);
    };
    const seen = () => { if (document.visibilityState === 'visible') void ask(); };
    void ask();
    document.addEventListener('visibilitychange', seen);
    return () => { alive = false; window.clearTimeout(timer); document.removeEventListener('visibilitychange', seen); };
  }, []);

  const ringing = calls.filter(c => !gone.has(c.id));
  useRinger(!onTab && ringing.some(c => !!c.ready));

  const decline = async (c: RingingCall) => {
    setBusy(c.id);
    await liveDecline(c.id);
    setBusy('');
    setGone(g => new Set(g).add(c.id));
  };

  if (onTab) return null;
  if (ringing.length) {
    const c = ringing[0];
    const who = c.name || c.verifiedEmail || c.email || 'A website visitor';
    return (
      <div role="alert" aria-label="Incoming call" style={{
        position: 'fixed', right: 20, bottom: 84, zIndex: 901, width: 'min(340px, calc(100vw - 40px))', boxSizing: 'border-box',
        padding: '14px 14px 12px', borderRadius: 16, background: '#0f172a', color: '#fff', fontFamily: 'inherit',
        boxShadow: '0 18px 44px -14px rgba(15,23,42,.6)',
      }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ width: 36, height: 36, borderRadius: '50%', background: '#16a34a', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Phone size={17} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.06em', color: '#a5b4fc' }}>
              INCOMING CALL{ringing.length > 1 ? ` · ${ringing.length} WAITING` : ''}
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{who}</div>
            {c.verifiedEmail
              ? <div style={{ fontSize: 11.5, color: '#86efac' }}>Signed in as {c.verifiedEmail}</div>
              : c.email ? <div style={{ fontSize: 11.5, color: '#cbd5e1' }}>{c.email} (typed, not proved)</div> : null}
          </div>
        </div>
        {c.topic && <div style={{ fontSize: 12.5, color: '#e2e8f0', marginTop: 8, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{c.topic}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
          <button type="button" disabled={!c.ready || !!busy} onClick={() => navigate(`/engagement?tab=live&answer=${encodeURIComponent(c.id)}`)}
            style={{ ...ALERT_BTN, background: '#16a34a', color: '#fff', flex: 1 }}>
            <Phone size={14} /> {c.ready ? 'Answer' : 'Connecting…'}
          </button>
          <button type="button" disabled={!!busy} onClick={() => void decline(c)}
            style={{ ...ALERT_BTN, background: '#fff', color: '#b42318', flex: 1 }}>
            <PhoneOff size={14} /> Decline
          </button>
        </div>
      </div>
    );
  }
  if (!waiting) return null;
  return (
    <button
      type="button"
      onClick={() => navigate('/engagement?tab=live')}
      style={{
        position: 'fixed', right: 20, bottom: 84, zIndex: 900, maxWidth: 'calc(100vw - 40px)',
        display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 999,
        border: 'none', background: '#0f172a', color: '#fff', fontSize: 13, fontWeight: 700,
        cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 12px 30px -10px rgba(15,23,42,.55)',
      }}
    >
      <Monitor size={15} />
      {waiting === 1 ? 'Somebody is waiting to share their screen' : `${waiting} people are waiting to share their screen`}
      <span style={{ color: '#c7d2fe' }}>Join →</span>
    </button>
  );
}

const ALERT_BTN: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 12px',
  border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
};
