/**
 * The support desk's always-on part, mounted once for anybody signed in.
 *
 *  customer  a heartbeat every minute while a page is visible — that is what
 *            "online" means on the owner's Customers list — and when the owner
 *            sends something, the corner card (CornerHelp) is refreshed at
 *            once instead of on its ten-minute cache. While the customer has
 *            given support access, a banner says so with a button to end it.
 *  owner     every 30 s while visible, the alerts since last time (a customer
 *            came online, replied, is joining a call, approved access) as a
 *            toast and, if allowed, a desktop notification. Phones get the same
 *            through push (lib/supportDesk.ts ownerAlert).
 *  visiting  the owner inside a customer's workspace on their permission: a
 *            banner with the time left and the way back. At the end of the time
 *            it leaves by itself, and leaving removes that workspace and every
 *            key of it from this browser.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck, LogOut } from 'lucide-react';
import { getSession } from '../../services/auth';
import { myAccount } from '../../services/customers';
import { desk, currentVisit, leaveVisit, SUPPORT_VISIT_KEY, type OwnerAlert } from '../../services/supportDesk';
import { getActiveAccountId } from '../../services/tenancy';
import { useApp } from '../../context/AppContext';

const BEAT_MS = 60_000;
const PULSE_MS = 30_000;

function left(ms: number): string {
  if (ms <= 0) return 'ending';
  const m = Math.ceil(ms / 60_000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min left` : `${m} min left`;
}

function clock(iso: string): string {
  try { return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); } catch { return iso; }
}

export default function SupportDesk() {
  const session = getSession();
  const { addNotification } = useApp();
  const isOwner = !!session && session.user.accountId == null && session.user.role === 'agency';
  const [access, setAccess] = useState<{ id: string; status: string; expiresAt: string | null } | null>(null);
  const [visit, setVisit] = useState(currentVisit);
  const [now, setNow] = useState(Date.now());
  const latest = useRef('');
  const cursor = useRef('');

  /* Customer: the heartbeat. */
  const beat = useCallback(async () => {
    if (!session || isOwner || document.visibilityState !== 'visible') return;
    const app = /ProtectedCentralApp/.test(navigator.userAgent) ? 'phone' : 'web';
    const r = await desk('heartbeat', { path: window.location.pathname, app });
    if (!r.success) return;
    const l = String(r.latest ?? '');
    if (l && l !== latest.current) { if (latest.current) void myAccount(true); latest.current = l; }
    const a = r.access as { id: string; status: string; expiresAt: string | null } | null;
    setAccess(a && a.status === 'active' ? a : null);
  }, [session, isOwner]);

  useEffect(() => {
    if (!session || isOwner) return;
    void beat();
    const t = window.setInterval(() => void beat(), BEAT_MS);
    const vis = () => { if (document.visibilityState === 'visible') void beat(); };
    document.addEventListener('visibilitychange', vis);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [session, isOwner, beat]);

  /* Owner: the alerts. */
  useEffect(() => {
    if (!isOwner) return;
    let alive = true;
    const pulse = async () => {
      if (document.visibilityState !== 'visible') return;
      const r = await desk('pulse', { since: cursor.current || undefined });
      if (!alive || !r.success) return;
      const first = !cursor.current;
      cursor.current = String(r.cursor ?? '');
      if (first) return; /* nothing from before this page opened */
      for (const a of (r.alerts as OwnerAlert[]) ?? []) {
        addNotification(a.summary, a.kind === 'call.accepted' || a.kind === 'access.approved' ? 'success' : 'info');
        try {
          if ('Notification' in window && Notification.permission === 'granted') {
            const n = new Notification('Protected Central', { body: a.summary, tag: a.id });
            n.onclick = () => { window.focus(); if (a.route) window.location.href = a.route; };
          }
        } catch { /* not allowed here */ }
      }
    };
    void pulse();
    const t = window.setInterval(() => void pulse(), PULSE_MS);
    return () => { alive = false; window.clearInterval(t); };
  }, [isOwner, addNotification]);

  /* Visiting: the clock, and leaving when it runs out or the visit is not this workspace. */
  useEffect(() => {
    if (!visit) return;
    if (getActiveAccountId() !== visit.accountId) { try { localStorage.removeItem(SUPPORT_VISIT_KEY); } catch { /* */ } setVisit(null); return; }
    const t = window.setInterval(() => {
      setNow(Date.now());
      if (Date.parse(visit.expiresAt) <= Date.now()) {
        window.clearInterval(t);
        addNotification(`Your access to ${visit.customerName || visit.customerEmail}'s account has ended.`, 'info');
        void leaveVisit();
      }
    }, 15_000);
    return () => window.clearInterval(t);
  }, [visit, addNotification]);

  if (visit && isOwner) {
    return (
      <div role="status" data-testid="support-visit-banner" style={BANNER}>
        <ShieldCheck size={15} style={{ flexShrink: 0 }} />
        <span style={{ minWidth: 0 }}>
          In <b>{visit.customerName || visit.customerEmail}</b>&rsquo;s account with their permission · {left(Date.parse(visit.expiresAt) - now)}
        </span>
        <button type="button" onClick={() => { setVisit(null); void leaveVisit(); }} style={BTN}>
          <LogOut size={13} /> Return to mine
        </button>
      </div>
    );
  }

  if (access?.expiresAt && !isOwner) {
    return (
      <div role="status" data-testid="support-access-banner" style={{ ...BANNER, background: '#fff7e6', color: '#7a4b00', borderColor: '#f3d38b' }}>
        <ShieldCheck size={15} style={{ flexShrink: 0 }} />
        <span style={{ minWidth: 0 }}>Protected Central support can open your account until <b>{clock(access.expiresAt)}</b>.</span>
        <button type="button" style={{ ...BTN, background: '#7a4b00', color: '#fff' }} onClick={async () => {
          const r = await desk('access_revoke', { id: access.id });
          if (r.success) { setAccess(null); addNotification('Support access ended. Nobody from Protected Central can open your account now.', 'success'); }
          else addNotification(String(r.error ?? 'Could not end it — try again.'), 'error');
        }}>End access now</button>
      </div>
    );
  }
  return null;
}

const BANNER: React.CSSProperties = {
  position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 950,
  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center',
  maxWidth: 'calc(100vw - 24px)', boxSizing: 'border-box', padding: '8px 10px 8px 14px', borderRadius: 14,
  background: '#17191c', color: '#fff', border: '1px solid #17191c', fontSize: 12.5, lineHeight: 1.4,
  boxShadow: '0 12px 30px -12px rgba(15,23,42,.45)',
};
const BTN: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 9, border: 'none',
  background: '#c8f24d', color: '#17191c', fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0,
};
