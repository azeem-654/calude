/**
 * The 7-day trial, as the customer sees it.
 *
 * While it runs: one thin bar with the days left, a way to choose a plan, and
 * — when the owner has set one — the kickoff call. Closable for the session,
 * because a bar that cannot be closed on day one is a bar people learn to hate
 * by day three; it comes back on the next load, and on the last two days it
 * cannot be closed at all.
 *
 * When it has ended: a screen over the app with the plans on it. The server has
 * already stopped spending the operator's AI on the workspace (lib/trial.ts),
 * so this is the explanation for that as much as it is a paywall. It is not
 * drawn over Plan & billing, where they pay, or Settings, where they can export
 * everything they made — a trial ending is not a reason to hold anyone's data.
 *
 * Nothing is shown for the owner, a paying account, an account older than
 * trials, or when the server could not be asked. Locking somebody out because
 * a request failed would be the worst way for this to be wrong.
 */
import { canBuyPlans } from '../../services/nativeApp';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarCheck, Check, Clock, Loader, Lock, X } from 'lucide-react';
import { myAccount, onMyAccount, type MyAccount } from '../../services/customers';
import { PLANS } from '../../services/tenancy';
import { createCheckout } from '../../services/billing';
import { getSession, logout } from '../../services/auth';

const CLOSED_KEY = 'pc_trial_bar_closed';

export default function TrialBar() {
  const [acct, setAcct] = useState<MyAccount | null>(null);
  const [closed, setClosed] = useState(() => { try { return sessionStorage.getItem(CLOSED_KEY) === '1'; } catch { return false; } });
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => {
    let alive = true;
    void myAccount().then(a => { if (alive) setAcct(a); });
    const off = onMyAccount(a => { if (alive) setAcct(a); });
    return () => { alive = false; off(); };
  }, []);

  /* Coming back from checkout: ask again rather than wait ten minutes to find
     out it worked. */
  useEffect(() => {
    if (/billing=success|checkout=success/.test(loc.search)) void myAccount(true);
  }, [loc.search]);

  const t = acct?.trial;
  if (!t) return null;

  if (t.kind === 'ended') {
    if (loc.pathname.startsWith('/billing') || loc.pathname.startsWith('/settings')) {
      return (
        <div role="status" style={{ ...BAR, background: '#fef2f2', color: '#991b1b', borderColor: '#fecaca' }}>
          <Lock size={14} /> <b>Your free trial has ended.</b>
          <span>{canBuyPlans() ? 'Choose a plan to switch the AI back on — everything you made is still here.' : 'Everything you made is still here.'}</span>
        </div>
      );
    }
    return <TrialEnded kickoffUrl={acct?.kickoffUrl ?? ''} onBilling={() => nav('/billing')} onExport={() => nav('/settings?tab=security')} />;
  }

  if (t.kind !== 'trial') return null;
  const lastDays = t.daysLeft <= 2;
  if (closed && !lastDays) return null;

  return (
    <div role="status" style={{ ...BAR, ...(lastDays ? { background: '#fff7ed', color: '#9a3412', borderColor: '#fed7aa' } : {}) }}>
      <Clock size={14} />
      <b>{t.daysLeft === 1 ? 'Last day' : `${t.daysLeft} days left`} in your free trial.</b>
      {canBuyPlans() && <span style={{ color: 'inherit', opacity: 0.8 }}>No card needed until you choose a plan.</span>}
      <span style={{ display: 'inline-flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
        {acct?.kickoffUrl && (
          <a href={acct.kickoffUrl} target="_blank" rel="noopener noreferrer" style={GHOST}>
            <CalendarCheck size={13} /> Book a free kickoff call
          </a>
        )}
        {canBuyPlans() && <button type="button" style={SOLID} onClick={() => nav('/billing')}>Choose a plan <ArrowRight size={13} /></button>}
        {!lastDays && (
          <button type="button" aria-label="Hide for now" style={{ ...GHOST, padding: 6 }}
            onClick={() => { setClosed(true); try { sessionStorage.setItem(CLOSED_KEY, '1'); } catch { /* private mode */ } }}>
            <X size={13} />
          </button>
        )}
      </span>
    </div>
  );
}

function TrialEnded({ kickoffUrl, onBilling, onExport }: { kickoffUrl: string; onBilling: () => void; onExport: () => void }) {
  const session = getSession();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const choose = async (planId: string, name: string) => {
    const accountId = session?.user.accountId;
    if (!accountId) { onBilling(); return; }
    setBusy(planId); setError('');
    const r = await createCheckout({ accountId, planId, productName: name, customerEmail: session?.user.email ?? '' });
    setBusy('');
    if (r.ok && r.url) { window.location.assign(r.url); return; }
    setError(r.error || 'Checkout could not be started. Open Plan & billing, or ask us using the help button.');
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="trial-ended-h" style={{
      position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(15,18,16,0.72)', backdropFilter: 'blur(6px)',
      display: 'grid', placeItems: 'center', padding: 16, overflowY: 'auto',
    }}>
      <div style={{ background: '#fff', borderRadius: 22, maxWidth: 860, width: '100%', padding: 'clamp(20px, 4vw, 34px)', boxShadow: '0 30px 80px rgba(0,0,0,0.35)' }}>
        <h2 id="trial-ended-h" style={{ margin: 0, fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
          Your 7-day free trial has ended
        </h2>
        <p style={{ margin: '8px 0 20px', color: '#5b6270', fontSize: 14.5, lineHeight: 1.6 }}>
          Everything you built is still here.{canBuyPlans() ? ' Choose a plan to keep Autopilot, the AI writing and your workflows running.' : ' Plans are not available in the app.'}
          You can still download all of it, at any time, from Settings → Security &amp; Privacy.
        </p>
        <div style={{ display: canBuyPlans() ? 'grid' : 'none', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
          {canBuyPlans() && PLANS.map((p, i) => (
            <div key={p.id} style={{ border: i === 1 ? '2px solid #17191c' : '1px solid #e3e6ea', borderRadius: 16, padding: 16, display: 'grid', gap: 10, alignContent: 'start' }}>
              <div style={{ fontWeight: 800 }}>{p.name}</div>
              <div style={{ fontSize: 26, fontWeight: 800 }}>${p.price}<small style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>/month</small></div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 5, fontSize: 13, color: '#374151' }}>
                {p.features.slice(0, 4).map(f => <li key={f} style={{ display: 'flex', gap: 6 }}><Check size={13} style={{ flexShrink: 0, marginTop: 2 }} /> {f}</li>)}
              </ul>
              <button type="button" disabled={!!busy} onClick={() => void choose(p.id, p.name)}
                style={{ ...SOLID, justifyContent: 'center', padding: '10px 14px', background: i === 1 ? '#17191c' : '#fff', color: i === 1 ? '#c8f24d' : '#17191c', border: '1px solid #17191c' }}>
                {busy === p.id ? <Loader size={14} className="spin" /> : <>Choose {p.name}</>}
              </button>
            </div>
          ))}
        </div>
        {error && <p role="alert" style={{ color: '#b91c1c', fontSize: 13.5, margin: '14px 0 0' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20, alignItems: 'center' }}>
          {kickoffUrl && (
            <a href={kickoffUrl} target="_blank" rel="noopener noreferrer" style={{ ...GHOST, padding: '9px 14px' }}>
              <CalendarCheck size={14} /> Talk to us first
            </a>
          )}
          <button type="button" style={{ ...GHOST, padding: '9px 14px' }} onClick={onBilling}>Plan &amp; billing</button>
          {/* The export is the one thing promised above that this dialog does
              not cover; a sentence naming a tab is a hunt, a button is not. */}
          <button type="button" style={{ ...GHOST, padding: '9px 14px' }} onClick={onExport}>Download my data</button>
          <button type="button" style={{ ...GHOST, padding: '9px 14px', marginLeft: 'auto' }}
            onClick={() => { void logout().then(() => window.location.reload()); }}>
            <X size={14} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

/* Positioned, so it paints above screens that pull their own backdrop up
   under the nav (the dashboard does); still below the nav itself (z 100). */
const BAR: React.CSSProperties = {
  position: 'relative', zIndex: 60,
  display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
  padding: '8px clamp(14px, 3vw, 22px)', fontSize: 13,
  background: '#f3f8e6', color: '#3f4a1d', borderBottom: '1px solid #dfe9c3',
};
const SOLID: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 999,
  padding: '6px 12px', background: '#17191c', color: '#c8f24d', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
};
const GHOST: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '6px 12px',
  background: 'transparent', color: 'inherit', border: '1px solid currentColor', fontWeight: 600, fontSize: 12.5,
  cursor: 'pointer', textDecoration: 'none',
};
