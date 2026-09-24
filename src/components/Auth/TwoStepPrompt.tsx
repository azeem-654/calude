/**
 * The second step of signing in: the six digits from an authenticator app.
 *
 * Shown in place of the sign-in form once the first step (password, emailed
 * code or Google) has been accepted for an account with 2-step sign-in on.
 * The ticket it holds lasts five minutes and names the account, so there is
 * nothing to re-enter but the code.
 */
import { useState } from 'react';
import { ShieldCheck, Loader, ArrowRight } from 'lucide-react';
import { finishTwoStep } from '../../services/auth';

export default function TwoStepPrompt({ ticket, onDone, onCancel }: {
  ticket: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!/^\d{6}$/.test(code.trim())) { setError('Enter the 6 digits from your authenticator app.'); return; }
    setBusy(true); setError('');
    const r = await finishTwoStep(ticket, code.trim());
    setBusy(false);
    if (r.ok) onDone(); else setError(r.error);
  };

  return (
    <form onSubmit={e => { e.preventDefault(); void submit(); }} style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ width: 36, height: 36, borderRadius: 11, background: '#eef7f0', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <ShieldCheck size={18} color="#1f7a4d" />
        </span>
        <div>
          <b style={{ display: 'block', fontSize: 15, color: '#17191c' }}>2-step sign-in</b>
          <span style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
            Open your authenticator app and enter the 6-digit code for Protected Central.
          </span>
        </div>
      </div>
      <input
        value={code}
        onChange={e => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        aria-label="6-digit code"
        placeholder="123456"
        style={{ width: '100%', padding: '12px 14px', border: '1px solid #e6e9f0', borderRadius: 12, fontSize: 20, letterSpacing: '0.3em', textAlign: 'center', fontFamily: 'inherit', boxSizing: 'border-box' }}
      />
      {error && <div role="alert" style={{ fontSize: 13, color: '#b91c1c' }}>{error}</div>}
      <button type="submit" disabled={busy} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 16px', borderRadius: 12,
        border: 0, background: '#17191c', color: '#fff', fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
      }}>
        {busy ? <Loader size={15} className="spin" /> : <ArrowRight size={15} />} Verify and sign in
      </button>
      <button type="button" onClick={onCancel} style={{ background: 'none', border: 0, color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
        Use a different account
      </button>
    </form>
  );
}
