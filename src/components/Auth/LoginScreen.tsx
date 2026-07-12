import { useState } from 'react';
import { Layers, Mail, Lock, ArrowRight, Loader, UserPlus } from 'lucide-react';
import { login, bootstrap, hasAnyUser } from '../../services/auth';
import { activeBranding } from '../../services/tenancy';

const INK = '#17191c';
const MUTED = '#8a8f98';

export default function LoginScreen({ onAuthed }: { onAuthed: () => void }) {
  const brand = activeBranding();
  const [mode, setMode] = useState<'login' | 'setup'>(hasAnyUser() ? 'login' : 'setup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const res = mode === 'setup'
        ? await bootstrap(email.trim(), password, name.trim() || 'Owner')
        : await login(email.trim(), password);
      if (res.ok) onAuthed();
      else setError(res.error || 'Something went wrong.');
    } finally { setBusy(false); }
  };

  const inp: React.CSSProperties = { width: '100%', padding: '12px 12px 12px 40px', border: '1px solid #e6e9f0', borderRadius: 12, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' };

  return (
    <div style={{ minHeight: '100vh', background: '#e9ebee', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 22 }}>
          {brand.logoUrl
            ? <img src={brand.logoUrl} alt="" style={{ height: 34, maxWidth: 180, objectFit: 'contain' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            : <><Layers size={26} color={INK} strokeWidth={2.4} /><span style={{ fontSize: 22, fontWeight: 800, color: INK, letterSpacing: '-0.03em' }}>{brand.appName}</span></>}
        </div>

        <div style={{ background: '#fff', borderRadius: 22, padding: '32px 30px', boxShadow: '0 12px 40px -12px rgba(16,24,40,0.18)' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: INK, margin: '0 0 4px', letterSpacing: '-0.02em', textAlign: 'center' }}>
            {mode === 'setup' ? 'Create your owner account' : brand.loginHeadline}
          </h1>
          <p style={{ fontSize: 13, color: MUTED, margin: '0 0 24px', textAlign: 'center' }}>
            {mode === 'setup' ? 'Set up the agency owner login to get started.' : 'Enter your credentials to continue.'}
          </p>

          <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
            {mode === 'setup' && (
              <div style={{ position: 'relative' }}>
                <UserPlus size={16} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
                <input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
              <input style={inp} type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" />
            </div>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
              <input style={inp} type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
            </div>

            {error && <div style={{ fontSize: 12.5, color: '#e5484d', fontWeight: 600, textAlign: 'center' }}>{error}</div>}

            <button type="submit" disabled={busy} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px', background: INK, color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer', marginTop: 4 }}>
              {busy ? <Loader size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> : <>{mode === 'setup' ? 'Create account' : 'Sign in'} <ArrowRight size={15} /></>}
            </button>
          </form>
        </div>

        <p style={{ fontSize: 11.5, color: MUTED, textAlign: 'center', marginTop: 18 }}>
          {mode === 'login' ? 'Contact your account manager if you need access.' : 'You can add client logins later from the Agency dashboard.'}
        </p>
      </div>
    </div>
  );
}
