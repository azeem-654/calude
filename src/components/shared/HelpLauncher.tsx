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
 * No such widget yet: customers see nothing — a button that opens onto nothing
 * is worse than no button — and the install owner sees a placeholder that says
 * what to switch on. Not on a reseller's own address, where the product is
 * somebody else's brand and "contact Protected Central" would be the wrong
 * company.
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LifeBuoy, Monitor } from 'lucide-react';
import { API_BASE } from '../../services/apiBase';
import { getSession } from '../../services/auth';
import { getActiveAccountId } from '../../services/tenancy';
import { isWhiteLabelHost } from '../../services/hosts';
import { liveWaiting } from '../../services/engagement';

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
  s.setAttribute('data-pc-compact', '');
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
      {signedIn && <WaitingAlert />}
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
 * "Somebody is waiting to share their screen", wherever you are in the app.
 *
 * The Live help tab shows it within seconds, but nobody sits on that tab. A
 * person in front of "waiting for somebody to join" is the most time-sensitive
 * thing this product holds, so the alert follows the person answering round
 * the app. It asks once, and stops asking for good if the workspace has no
 * widget offering screen sharing — most never will, and they should not pay a
 * request every thirty seconds for a feature they have not switched on.
 */
function WaitingAlert() {
  const [waiting, setWaiting] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  const onTab = location.pathname === '/engagement' && location.search.includes('tab=live');

  useEffect(() => {
    let alive = true;
    let timer = 0;
    const ask = async () => {
      const r = await liveWaiting();
      if (!alive) return;
      if (r.success && !r.enabled) { setWaiting(0); return; }
      setWaiting(r.success ? Number(r.waiting ?? 0) : 0);
      timer = window.setTimeout(() => void ask(), 30_000);
    };
    void ask();
    return () => { alive = false; window.clearTimeout(timer); };
  }, []);

  if (!waiting || onTab) return null;
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
