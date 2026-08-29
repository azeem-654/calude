/**
 * Settings → Security.
 *
 * This tab was the words "Coming Soon" over a placeholder icon. A CRM holds
 * every customer record a business has, plus its mailbox password and its
 * sending keys, and the one screen named after protecting all of that did
 * nothing at all.
 *
 * It does three real things now: changes the signed-in user's password
 * (through the same server endpoint the agency's own reset uses, and the same
 * strength rules the signup form applies), shows what the session actually
 * is, and ends it. Nothing here is a mock — if it says the password changed,
 * the next sign-in needs the new one.
 */
import { useState } from 'react';
import { Shield, Check, AlertTriangle, LogOut, Loader, KeyRound } from 'lucide-react';
import { getSession, setUserPassword, logout, login } from '../../services/auth';
import { passwordProblem, passwordStrength } from '../../services/password';

const CARD: React.CSSProperties = {
  backgroundColor: 'white', borderRadius: 18, border: '1px solid #e6e9f0',
  boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: 24, marginBottom: 20,
};
const LABEL: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 5 };
const INPUT: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 9,
  fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};

export default function SecurityPanel() {
  const session = getSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const strength = passwordStrength(next);

  const submit = async () => {
    setMsg(null);
    const email = session?.user.email;
    if (!email) { setMsg({ ok: false, text: 'You are not signed in.' }); return; }
    if (!current) { setMsg({ ok: false, text: 'Enter your current password.' }); return; }

    const problem = passwordProblem(next, { name: session.user.name, email });
    if (problem) { setMsg({ ok: false, text: problem }); return; }
    if (next !== confirm) { setMsg({ ok: false, text: 'The two new passwords do not match.' }); return; }
    if (next === current) { setMsg({ ok: false, text: 'That is already your password.' }); return; }

    setBusy(true);
    /* The current password is verified by actually signing in with it, rather
       than taken on trust. Without this, anyone who walked up to an unlocked
       screen could change the password without knowing the old one. */
    const check = await login(email, current);
    if (!check.ok) {
      setBusy(false);
      setMsg({ ok: false, text: 'Your current password is not right.' });
      return;
    }

    const res = await setUserPassword(email, next);
    setBusy(false);
    if (res.ok) {
      setCurrent(''); setNext(''); setConfirm('');
      setMsg({ ok: true, text: 'Password changed. Your next sign-in will need the new one.' });
    } else {
      setMsg({ ok: false, text: res.error || 'Could not change the password.' });
    }
  };

  return (
    <div>
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: '#f0f1f3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <KeyRound size={19} color="#17191c" />
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>Change your password</h3>
            <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0', lineHeight: 1.5 }}>
              Your current password is checked before anything changes.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={LABEL} htmlFor="pw-current">Current password</label>
            <input id="pw-current" type="password" autoComplete="current-password" value={current}
              onChange={e => setCurrent(e.target.value)} style={INPUT} placeholder="••••••••" />
          </div>
          <div>
            <label style={LABEL} htmlFor="pw-new">New password</label>
            <input id="pw-new" type="password" autoComplete="new-password" value={next}
              onChange={e => setNext(e.target.value)} style={INPUT} placeholder="At least 8 characters" />
          </div>
          <div>
            <label style={LABEL} htmlFor="pw-confirm">Confirm new password</label>
            <input id="pw-confirm" type="password" autoComplete="new-password" value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !busy) void submit(); }}
              style={INPUT} placeholder="Type it again" />
          </div>
        </div>

        {next && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ flex: 1, height: 4, borderRadius: 999, backgroundColor: i < strength.score ? strength.color : '#e8eaee' }} />
              ))}
            </div>
            <p style={{ fontSize: 11.5, color: '#64748b', margin: 0 }}>
              <span style={{ fontWeight: 700, color: strength.color }}>{strength.label}</span> · {strength.hint}
            </p>
          </div>
        )}

        {msg && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, padding: '10px 12px', borderRadius: 9,
            backgroundColor: msg.ok ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${msg.ok ? '#bbf7d0' : '#fecaca'}`,
          }}>
            {msg.ok ? <Check size={14} color="#16a34a" style={{ marginTop: 2, flexShrink: 0 }} />
                    : <AlertTriangle size={14} color="#dc2626" style={{ marginTop: 2, flexShrink: 0 }} />}
            <p style={{ fontSize: 12.5, color: msg.ok ? '#166534' : '#991b1b', margin: 0, lineHeight: 1.5 }}>{msg.text}</p>
          </div>
        )}

        <button onClick={submit} disabled={busy || !current || !next || !confirm}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, marginTop: 16, padding: '9px 18px',
            border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            backgroundColor: (busy || !current || !next || !confirm) ? '#e2e8f0' : '#17191c',
            color: (busy || !current || !next || !confirm) ? '#94a3b8' : 'white',
            cursor: (busy || !current || !next || !confirm) ? 'not-allowed' : 'pointer',
          }}>
          {busy ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Changing…</> : <>Change password</>}
        </button>
      </div>

      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: '#f0f1f3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Shield size={19} color="#17191c" />
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>This session</h3>
            <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0', lineHeight: 1.5 }}>Who you are signed in as, and how.</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            ['Signed in as', session?.user.email ?? '—'],
            ['Name', session?.user.name ?? '—'],
            ['Role', session?.user.role === 'agency' ? 'Agency owner — full access' : 'Client — this workspace only'],
            /* Named honestly: "local" means the account lives in this browser
               because no server backend answered, which is a real difference
               in where the password is checked. */
            ['Account stored', session?.backend === 'local' ? 'In this browser (no server backend configured)' : 'On your server'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12.5 }}>
              <span style={{ color: '#94a3b8', minWidth: 118 }}>{k}</span>
              <span style={{ color: '#0f172a', fontWeight: 600, wordBreak: 'break-word' }}>{v}</span>
            </div>
          ))}
        </div>

        <button
          onClick={() => { logout(); window.location.href = import.meta.env.BASE_URL || '/'; }}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, marginTop: 18, padding: '9px 16px',
            border: '1px solid #fecaca', borderRadius: 9, backgroundColor: '#fff',
            color: '#dc2626', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </div>
  );
}
