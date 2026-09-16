import { useEffect, useState } from 'react';
import { Mail, Lock, ArrowRight, Loader, UserPlus, AlertTriangle } from 'lucide-react';
import { login, bootstrap, register, hasAnyUser, authStatus, requestLoginCode, verifyLoginCode, googleStart } from '../../services/auth';
import { activeBranding } from '../../services/tenancy';
import { passwordProblem, passwordStrength } from '../../services/password';
import { LogoMark } from '../shared/Logo';

const INK = '#17191c';

/**
 * The signup form's own rules. The password checks themselves live in
 * services/password.ts so that Settings → Security enforces exactly the same
 * ones — a change-password form that accepts what signup refuses just moves a
 * weak password one screen over.
 */
function signupProblem(name: string, email: string, password: string, confirm: string, agreed: boolean): string {
  if (name.trim().length < 2) return 'Enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email.trim())) return 'Enter a valid email address.';
  const pw = passwordProblem(password, { name, email });
  if (pw) return pw;
  if (password !== confirm) return 'The two passwords do not match.';
  if (!agreed) return 'Please confirm you accept the terms.';
  return '';
}

const MUTED = '#8a8f98';

/**
 * Google's own mark, inline.
 *
 * Their branding guidelines require the four-colour G exactly as issued — not
 * recoloured to match a theme and not swapped for a generic icon — so it is
 * drawn here rather than taken from the icon set the rest of the app uses. It
 * is inline rather than fetched from Google's CDN because a sign-in button that
 * renders blank when a network blocks that host is a button nobody presses.
 */
function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * Which form the visitor asked for.
 *
 * The marketing site has two doors and they have to lead somewhere different.
 * Before this the screen worked the mode out entirely from the server and the
 * visitor's own choice was discarded, so "Sign in" and "Sign up" opened the
 * same form and one of the two was always the wrong one.
 *
 * The server still has the final say on what is *possible* — you cannot create
 * an owner on an install that has one, and you cannot sign in to one that does
 * not — but where both are possible the intent wins.
 */
export type AuthIntent = 'signin' | 'signup';

export default function LoginScreen({ onAuthed, intent = 'signin' }: { onAuthed: () => void; intent?: AuthIntent }) {
  const brand = activeBranding();
  /*
   * setup    the very first account on an install; the server refuses it after
   * register an ordinary account, which anybody may create
   * login    the form for one that exists
   */
  const [mode, setMode] = useState<'login' | 'setup' | 'register'>(
    hasAnyUser() ? (intent === 'signup' ? 'register' : 'login') : 'setup',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checking, setChecking] = useState(true);
  const [testLogin, setTestLogin] = useState<{ username: string } | null>(null);

  /*
   * Signing in with a code, as a state rather than a fourth mode.
   *
   * It shares the email field with the password form — somebody who typed
   * their address and then decided not to remember a password should not have
   * to type it again, which is the whole reason this path exists.
   */
  const [codeStep, setCodeStep] = useState<'off' | 'sent'>('off');
  const [code, setCode] = useState('');

  /*
   * Whether Google is on offer, decided by the server rather than assumed.
   *
   * It is false until `status` answers, so the button never flashes in and out
   * on an install that has not configured it — and false is also what an older
   * Worker's silence means, which is the correct answer.
   */
  const [google, setGoogle] = useState(false);

  /** Hand the browser to Google. The URL is signed server-side. */
  const goToGoogle = async () => {
    setBusy(true); setError('');
    const r = await googleStart();
    if (!r.ok || !r.url) { setBusy(false); setError(r.error || 'Google sign-in is not available right now.'); return; }
    /* `assign`, not `replace`: the browser's Back button is how somebody who
       changed their mind at Google's screen gets back to this form. */
    window.location.assign(r.url);
  };
  /** Ask the server to post a code to whatever is in the email box. */
  const sendCode = async () => {
    const to = email.trim();
    /* Checked here so somebody who pressed the button with an empty box is told
       why, rather than watching a request fail for a reason they cannot see. */
    if (!to.includes('@')) { setError('Enter your email address first.'); return; }
    setBusy(true); setError(''); setNotice('');
    const r = await requestLoginCode(to);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setCodeStep('sent');
    setNotice(r.message);
  };

  const enterCode = async () => {
    setBusy(true); setError('');
    const r = await verifyLoginCode(email.trim(), code);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    onAuthed();
  };

  const strength = passwordStrength(password);

  /* The server is the only thing that knows whether setup already happened.
     Asking it first stops a fresh browser being offered a setup form that the
     backend will always refuse. */
  useEffect(() => {
    let alive = true;
    authStatus().then(st => {
      if (!alive) return;
      /* Whether this install has an owner decides only which *kind* of
         creation is on offer — the first one or an ordinary one. What the
         visitor asked for decides whether they are creating at all. */
      if (!st.initialised) {
        setMode('setup');
        if (intent === 'signin') {
          setNotice('Nobody has set this up yet. The account you create below is the first one, and it is yours.');
        }
      } else {
        setMode(intent === 'signup' ? 'register' : 'login');
      }
      setTestLogin(st.testLogin ?? null);
      setGoogle(st.google);
      if (!st.writable) {
        setError('This server cannot write to api/data/, so accounts cannot be saved. Set that folder to 755 in your host file manager, then reload.');
      }
      setChecking(false);
    });
    return () => { alive = false; };
  }, [intent]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setNotice(''); setBusy(true);
    try {
      if (mode === 'register') {
        const problem = signupProblem(name, email, password, confirm, agreed);
        if (problem) { setError(problem); return; }
        const res = await register(email.trim(), password, name.trim());
        if (res.ok) { onAuthed(); return; }
        setError(res.error || 'Could not create the account.');
        return;
      }

      if (mode === 'setup') {
        // Check here as well as on the server so the answer is instant and the
        // server stays the thing that actually decides.
        const problem = signupProblem(name, email, password, confirm, agreed);
        if (problem) { setError(problem); return; }
        const res = await bootstrap(email.trim(), password, name.trim());
        if (res.ok) { onAuthed(); return; }
        // An owner already exists: switch to sign-in rather than repeating a
        // form that cannot succeed.
        if (res.code === 'already_initialised') {
          setMode('login');
          setPassword('');
          setNotice('An owner account already exists on this server. Sign in with it below.');
          return;
        }
        setError(res.error || 'Something went wrong.');
        return;
      }
      const res = await login(email.trim(), password);
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
            : <><LogoMark size={32} /><span style={{ fontSize: 22, fontWeight: 800, color: INK, letterSpacing: '-0.03em' }}>{brand.appName}</span></>}
        </div>

        <div style={{ background: '#fff', borderRadius: 22, padding: '32px 30px', boxShadow: '0 12px 40px -12px rgba(16,24,40,0.18)' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: INK, margin: '0 0 4px', letterSpacing: '-0.02em', textAlign: 'center' }}>
            {mode === 'setup' ? 'Create your owner account'
              : mode === 'register' ? `Create your ${brand.appName} account`
                : brand.loginHeadline}
          </h1>
          <p style={{ fontSize: 13, color: MUTED, margin: '0 0 24px', textAlign: 'center' }}>
            {mode === 'setup' ? 'Set up the agency owner login to get started.'
              : mode === 'register' ? 'Your own workspace, free to start. No card needed.'
                : 'Enter your credentials to continue.'}
          </p>

          <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
            {mode !== 'login' && (
              <div style={{ position: 'relative' }}>
                <UserPlus size={16} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
                <input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
              <input style={inp} type={mode !== 'login' ? 'email' : 'text'} required autoComplete={mode !== 'login' ? 'email' : 'username'}
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder={mode !== 'login' ? 'Email address' : 'Email or username'} />
            </div>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
              <input style={inp} type="password" required autoComplete={mode !== 'login' ? 'new-password' : 'current-password'}
                value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
            </div>

            {mode !== 'login' && password.length > 0 && (
              <div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < strength.score ? strength.color : '#e6e9f0' }} />
                  ))}
                </div>
                <div style={{ fontSize: 11.5, color: strength.color, fontWeight: 700, marginTop: 5 }}>
                  {strength.label}
                  <span style={{ color: MUTED, fontWeight: 500 }}> — {strength.hint}</span>
                </div>
              </div>
            )}

            {mode !== 'login' && (
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
                <input style={inp} type="password" required autoComplete="new-password" value={confirm}
                  onChange={e => setConfirm(e.target.value)} placeholder="Confirm password" />
                {confirm.length > 0 && confirm !== password && (
                  <div style={{ fontSize: 11.5, color: '#e5484d', marginTop: 5 }}>The two passwords do not match.</div>
                )}
              </div>
            )}

            {mode !== 'login' && (
              <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                  style={{ marginTop: 2, accentColor: INK, cursor: 'pointer' }} />
                <span style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
                  {mode === 'register'
                    ? 'I accept responsibility for the customer data I put in this workspace, and confirm I am allowed to contact the people I load into it.'
                    : 'I am the owner of this workspace and accept responsibility for the customer data stored in it.'}
                </span>
              </label>
            )}

            {notice && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '9px 11px' }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{notice}</span>
              </div>
            )}
            {error && <div style={{ fontSize: 12.5, color: '#e5484d', fontWeight: 600, textAlign: 'center', lineHeight: 1.5 }}>{error}</div>}

            <button type="submit" disabled={busy} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px', background: INK, color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer', marginTop: 4 }}>
              {busy || checking ? <Loader size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> : <>{mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={15} /></>}
            </button>
          </form>

          {/* ── Or: a code, and no password at all ──
              Offered on both sign-in and sign-up, because the code proves the
              same thing either way — that they hold the mailbox — and a new
              address becomes an account on the spot. */}
          {mode !== 'setup' && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
                <span style={{ flex: 1, height: 1, background: '#e6e9f0' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: MUTED }}>OR</span>
                <span style={{ flex: 1, height: 1, background: '#e6e9f0' }} />
              </div>

              {codeStep === 'off' ? (
                <div style={{ display: 'grid', gap: 9 }}>
                  {/* Only when the server says it will work. See AuthStatus.google. */}
                  {google && (
                    <button type="button" disabled={busy} onClick={() => void goToGoogle()} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, width: '100%',
                      padding: '12px', background: '#fff', color: INK, border: '1px solid #e6e9f0',
                      borderRadius: 12, fontSize: 13.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                    }}>
                      <GoogleG /> Continue with Google
                    </button>
                  )}
                  <button type="button" disabled={busy} onClick={() => void sendCode()} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
                    padding: '12px', background: '#fff', color: INK, border: '1px solid #e6e9f0',
                    borderRadius: 12, fontSize: 13.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                  }}>
                    <Mail size={15} /> Email me a sign-in code
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  <input
                    style={{ ...inp, paddingLeft: 13, textAlign: 'center', fontSize: 22, fontWeight: 700, letterSpacing: '0.28em' }}
                    value={code} inputMode="numeric" autoComplete="one-time-code" autoFocus
                    maxLength={6} placeholder="000000"
                    onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={e => { if (e.key === 'Enter' && code.length === 6) { e.preventDefault(); void enterCode(); } }}
                  />
                  <button type="button" disabled={busy || code.length !== 6} onClick={() => void enterCode()} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '13px', background: busy || code.length !== 6 ? '#c7c9d3' : INK, color: '#fff',
                    border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700,
                    cursor: busy || code.length !== 6 ? 'default' : 'pointer', fontFamily: 'inherit',
                  }}>
                    {busy ? <Loader size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> : <>Sign in <ArrowRight size={15} /></>}
                  </button>
                  <button type="button" onClick={() => { setCodeStep('off'); setCode(''); setError(''); setNotice(''); }}
                    style={{ background: 'none', border: 0, padding: 0, font: 'inherit', fontSize: 12, color: MUTED, cursor: 'pointer', textDecoration: 'underline' }}>
                    Use a password instead
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Whichever form is showing, the other one is a click away. Arriving
            at the wrong door is the commonest thing that happens here. */}
        {mode !== 'setup' && (
          <p style={{ fontSize: 12.5, color: MUTED, textAlign: 'center', marginTop: 18 }}>
            {mode === 'login' ? 'No account yet? ' : 'Already have an account? '}
            <button
              type="button"
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setNotice(''); }}
              style={{ background: 'none', border: 0, padding: 0, font: 'inherit', fontWeight: 700, color: INK, cursor: 'pointer', textDecoration: 'underline' }}
            >
              {mode === 'login' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        )}

        <p style={{ fontSize: 11.5, color: MUTED, textAlign: 'center', marginTop: 10 }}>
          {mode === 'login'
            ? 'Locked out? The owner account can be reset from the crmpro D1 database in Cloudflare.'
            : mode === 'register'
              ? 'Your workspace is yours alone. Nobody else who signs up can see it.'
              : 'You can add client logins later from the Agency dashboard.'}
        </p>

        {testLogin && mode === 'login' && (
          <div style={{ marginTop: 12, background: '#fff', border: '1px dashed #d5d8dd', borderRadius: 14, padding: '12px 14px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>Demo account</div>
            <p style={{ fontSize: 11.5, color: MUTED, margin: '4px 0 0', lineHeight: 1.5 }}>
              This install has no owner yet, so the demo login{' '}
              <code style={{ color: INK, fontWeight: 700 }}>{testLogin.username}</code> still works for trying
              things out. It closes itself automatically the moment you create your real account below —
              after that only your own login opens the app.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
