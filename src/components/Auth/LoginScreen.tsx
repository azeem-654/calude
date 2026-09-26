import { useEffect, useRef, useState } from 'react';
import { Mail, ArrowRight, ArrowLeft, Loader, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { login, bootstrap, register, hasAnyUser, authStatus, requestLoginCode, verifyLoginCode, googleStart, lastSignIn, forgetSignIn, SIGNED_OUT_REASON, type LastSignIn } from '../../services/auth';
import { activeBranding } from '../../services/tenancy';
import { passwordProblem, passwordStrength } from '../../services/password';
import { LogoMark } from '../shared/Logo';
import TwoStepPrompt from './TwoStepPrompt';
import AutopilotScene from '../shared/AutopilotScene';
import WorksWith from '../shared/WorksWith';
import './auth.css';

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
  /* Open until the server says otherwise — the same fail-towards-working
     default the Worker itself uses, so a status call that never lands leaves a
     working sign-up on every deployment but the one that closed it. */
  const [signupsOpen, setSignupsOpen] = useState(true);
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
  /* A session the server ended arrives here with its reason (checkSession in
     auth.ts), said once, so nobody wonders whether they did something wrong. */
  const [notice, setNotice] = useState(() => {
    try {
      const why = sessionStorage.getItem(SIGNED_OUT_REASON) ?? '';
      sessionStorage.removeItem(SIGNED_OUT_REASON);
      return why;
    } catch { return ''; }
  });
  const [checking, setChecking] = useState(true);
  const [testLogin, setTestLogin] = useState<{ username: string } | null>(null);

  /*
   * Signing in with a code is its own view, with its own email box.
   *
   * It used to be a button under the password form that read the address out
   * of the box above it — so pressing it with that box empty said "enter your
   * email address first" about a field somewhere else on the screen. The
   * address still carries over (it is the same state), so somebody who typed
   * it and then gave up on remembering a password does not type it twice.
   */
  const [view, setView] = useState<'form' | 'code'>('form');
  const [codeStep, setCodeStep] = useState<'off' | 'sent'>('off');
  const [code, setCode] = useState('');
  /* Set when the first step was right and the account has 2-step sign-in on. */
  const [ticket, setTicket] = useState('');

  /*
   * Whether Google is on offer, decided by the server rather than assumed.
   *
   * It is false until `status` answers, so the button never flashes in and out
   * on an install that has not configured it — and false is also what an older
   * Worker's silence means, which is the correct answer.
   */
  const [google, setGoogle] = useState(false);

  /*
   * Sign-up proves the address before the account exists: the first press
   * posts a code, the second brings it back. The fields above stay filled and
   * locked, so a typo in the address is fixed with "Change the address"
   * rather than by starting again.
   */
  const [regStep, setRegStep] = useState<'form' | 'code'>('form');
  const [regCode, setRegCode] = useState('');
  const locked = mode === 'register' && regStep === 'code';

  /* The account this browser last signed in with, offered as one button. */
  const [remembered, setRemembered] = useState<LastSignIn | null>(() => lastSignIn());
  const [showPw, setShowPw] = useState(false);
  const pwRef = useRef<HTMLInputElement>(null);

  /** Hand the browser to Google. The URL is signed server-side. */
  const goToGoogle = async (hint = '') => {
    setBusy(true); setError('');
    const r = await googleStart(hint);
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
    if (!to.includes('@')) { setError('Enter your email address.'); return; }
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
    if (r.mfaTicket) { setTicket(r.mfaTicket); return; }
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
        /* A deployment with signups closed has one account, so there is
           nothing for "sign up" to mean — sending somebody to a form that is
           going to refuse them is worse than not offering it. */
        const open = st.signupsOpen !== false;
        setMode(intent === 'signup' && open ? 'register' : 'login');
        if (intent === 'signup' && !open) {
          setNotice('This is the testing site and it has one account. The live app is at app.protectedcentral.com.');
        }
      }
      setSignupsOpen(st.signupsOpen !== false);
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
        if (locked && regCode.length !== 6) { setError('Enter the six-digit code from your email.'); return; }
        const res = await register(email.trim(), password, name.trim(), regCode);
        if (res.needsCode) { setRegStep('code'); setNotice(res.message || 'Check your email for a six-digit code.'); return; }
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
      if (res.mfaTicket) setTicket(res.mfaTicket);
      else if (res.ok) onAuthed();
      else setError(res.error || 'Something went wrong.');
    } finally { setBusy(false); }
  };

  /** "Continue as …": straight to Google for a Google account, otherwise the
      address filled in and the cursor in the next box. */
  const continueAs = (r: LastSignIn) => {
    setEmail(r.email); setError(''); setNotice('');
    if (r.method === 'google' && google) { void goToGoogle(r.email); return; }
    if (r.method === 'code') { setView('code'); return; }
    setTimeout(() => pwRef.current?.focus(), 0);
  };
  const leaveCode = () => { setView('form'); setCodeStep('off'); setCode(''); setError(''); setNotice(''); };

  const creating = mode !== 'login';
  const title = view === 'code'
    ? (mode === 'register' ? 'Sign up with a code' : 'Sign in with a code')
    : mode === 'setup' ? 'Create your owner account'
      : mode === 'register' ? `Create your ${brand.appName} account`
        : `Welcome back to ${brand.appName}`;
  const sub = view === 'code'
    ? 'We will email you a six-digit code — no password needed. A new address gets its own workspace.'
    : mode === 'setup' ? 'Set up the agency owner login to get started.'
      : mode === 'register' ? 'Your own workspace, free to start. No card needed.'
        : brand.loginHeadline;

  const noticeBox = notice && (
    <div className="au-notice"><AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} /><span>{notice}</span></div>
  );
  const errorBox = error && <div className="au-error" role="alert">{error}</div>;
  /* The passwordless paths have no checkbox — that is the point of them — so
     the agreement is stated next to the buttons that act on it. The server
     writes down the version when the account is created. */
  const agreeLine = (
    <p className="au-fine">
      By continuing you agree to the{' '}
      <a href="/terms-of-service" target="_blank" rel="noopener noreferrer">terms of service</a> and{' '}
      <a href="/terms" target="_blank" rel="noopener noreferrer">acceptable use policy</a>, and have read the{' '}
      <a href="/privacy" target="_blank" rel="noopener noreferrer">privacy policy</a>.
    </p>
  );

  const shell = (children: React.ReactNode) => (
    <div className="au">
      <div className="au-bg" aria-hidden="true"><i /><i /><i /></div>
      <div className="au-card">
        <div className="au-form">
          <div className="au-brand">
            {brand.logoUrl
              ? <img src={brand.logoUrl} alt={brand.appName} style={{ height: 30, maxWidth: 170, objectFit: 'contain' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              : <><LogoMark size={30} /><b>{brand.appName}</b></>}
          </div>
          {children}
          <div className="au-mobile-strip"><WorksWith title="" compact /></div>
        </div>
        {/* Decoration and a claim about what the software connects to; the
            form is complete without it, so screen readers skip the scene. */}
        <aside className="au-visual">
          <div className="au-visual-scene" aria-hidden="true"><AutopilotScene /></div>
          <div className="au-visual-brand" aria-hidden="true"><LogoMark size={24} tile={false} /> AI Autopilot</div>
          <p className="au-visual-head">
            {mode === 'login'
              ? 'Your projects kept running while you were away — posts written, leads followed up, replies caught.'
              : 'Describe your business once. Autopilot builds the workflows, writes the posts and follows up every lead.'}
          </p>
          <div className="au-visual-gap" />
          <div className="au-visual-foot"><WorksWith compact /></div>
        </aside>
      </div>
    </div>
  );

  if (ticket) {
    return shell(
      <TwoStepPrompt ticket={ticket} onDone={onAuthed} onCancel={() => { setTicket(''); setPassword(''); setCode(''); setCodeStep('off'); }} />,
    );
  }

  /* ── Signing in (or up) with an emailed code ── */
  if (view === 'code') {
    return shell(
      <>
        <h1>{title}</h1>
        <p className="au-sub">{sub}</p>
        <div style={{ display: 'grid', gap: 16 }}>
          {codeStep === 'off' ? (
            <form onSubmit={e => { e.preventDefault(); void sendCode(); }} style={{ display: 'grid', gap: 16 }}>
              <label className="au-field">
                <span className="au-lbl">Email address</span>
                <input type="email" required autoFocus autoComplete="email" value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
              </label>
              {noticeBox}{errorBox}
              <button type="submit" className="au-primary" disabled={busy}>
                {busy ? <Loader size={16} className="spin" /> : <><Mail size={15} /> Email me a code</>}
              </button>
            </form>
          ) : (
            <form onSubmit={e => { e.preventDefault(); if (code.length === 6) void enterCode(); }} style={{ display: 'grid', gap: 16 }}>
              {noticeBox}
              <label className="au-field au-code">
                <span className="au-lbl">The code sent to {email.trim()}</span>
                <input value={code} inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} placeholder="000000"
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
              </label>
              {errorBox}
              <button type="submit" className="au-primary" disabled={busy || code.length !== 6}>
                {busy ? <Loader size={16} className="spin" /> : <>Sign in <ArrowRight size={15} /></>}
              </button>
              <span style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', fontSize: 12.5 }}>
                <button type="button" className="au-link" onClick={() => { setCodeStep('off'); setCode(''); setNotice(''); setError(''); }}>Use a different address</button>
                <button type="button" className="au-link" disabled={busy} onClick={() => void sendCode()}>Send a new code</button>
              </span>
            </form>
          )}
          {agreeLine}
          <button type="button" className="au-soft" onClick={leaveCode}>
            <ArrowLeft size={15} /> {mode === 'register' ? 'Back to sign-up' : 'Use a password instead'}
          </button>
        </div>
      </>,
    );
  }

  const offerLast = mode === 'login' && remembered;

  return shell(
    <>
      <h1>{title}</h1>
      <p className="au-sub">{sub}</p>

      {offerLast && (
        <div style={{ marginBottom: 4 }}>
          <button type="button" className="au-last" disabled={busy} onClick={() => continueAs(remembered)}>
            <span className="au-avatar" aria-hidden="true">{(remembered.name || remembered.email).trim().charAt(0).toUpperCase()}</span>
            <span className="au-last-who">
              <b>Continue as {remembered.name.split(' ')[0] || remembered.email.split('@')[0]}</b>
              <small>{remembered.email}</small>
            </span>
            {remembered.method === 'google' && google ? <GoogleG /> : <ArrowRight size={16} color="#6b7280" />}
          </button>
          <button type="button" className="au-forget" onClick={() => { forgetSignIn(); setRemembered(null); setEmail(''); }}>
            Not you? Use another account
          </button>
          <div className="au-or">or</div>
        </div>
      )}

      <form onSubmit={submit} style={{ display: 'grid', gap: 18 }}>
        {creating && (
          <label className="au-field">
            <span className="au-lbl">Full name</span>
            <input value={name} disabled={locked} autoComplete="name" onChange={e => setName(e.target.value)} placeholder="Your full name" />
          </label>
        )}
        <label className="au-field">
          <span className="au-lbl">{creating ? 'Email address' : 'Email or username'}</span>
          <input disabled={locked} type={creating ? 'email' : 'text'} required autoComplete={creating ? 'email' : 'username'}
            value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
        </label>
        <div className="au-field">
          <label>
            <span className="au-lbl">Password</span>
            <input ref={pwRef} disabled={locked} type={showPw ? 'text' : 'password'} required
              autoComplete={creating ? 'new-password' : 'current-password'}
              value={password} onChange={e => setPassword(e.target.value)} placeholder={creating ? 'At least 8 characters' : 'Your password'} />
          </label>
          {/* No reset-by-link: a code proves the mailbox the same way and signs
              them in, and Settings → Security then sets the new password. */}
          {mode === 'login' && (
            <button type="button" className="au-aside" onClick={() => { setView('code'); setError(''); setNotice('Forgot it? Sign in with a code, then set a new password in Settings → Security.'); }}>
              Forgot password?
            </button>
          )}
          <button type="button" className="au-eye" aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw(v => !v)}>
            {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>

        {creating && password.length > 0 && (
          <div style={{ marginTop: -8 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < strength.score ? strength.color : '#e6e9f0' }} />
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: strength.color, fontWeight: 700, marginTop: 5 }}>
              {strength.label}
              <span style={{ color: '#8a8f98', fontWeight: 500 }}> — {strength.hint}</span>
            </div>
          </div>
        )}

        {creating && (
          <label className="au-field">
            <span className="au-lbl">Confirm password</span>
            <input disabled={locked} type={showPw ? 'text' : 'password'} required autoComplete="new-password" value={confirm}
              onChange={e => setConfirm(e.target.value)} placeholder="The same again" />
            {confirm.length > 0 && confirm !== password && (
              <span style={{ display: 'block', fontSize: 11.5, color: '#e5484d', margin: '5px 0 0 18px' }}>The two passwords do not match.</span>
            )}
          </label>
        )}

        {creating && (
          <label className="au-check">
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
            <span>
              {mode === 'register'
                ? 'I accept responsibility for the customer data I put in this workspace, confirm I am allowed to contact the people I load into it, and agree to the '
                : 'I am the owner of this workspace, accept responsibility for the customer data stored in it, and agree to the '}
              {/* A new tab, deliberately. Navigating away from a half-filled
                  sign-up form to read the terms loses the form, which is how
                  a terms link becomes a link nobody follows. */}
              <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>terms of service</a> and{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>acceptable use policy</a>, and have read the{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>privacy policy</a>.
            </span>
          </label>
        )}

        {locked && (
          <div style={{ display: 'grid', gap: 10 }}>
            <label className="au-field au-code">
              <span className="au-lbl">The code from your email</span>
              <input id="reg-code" value={regCode} inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} placeholder="000000"
                onChange={e => setRegCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            </label>
            <span style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', fontSize: 12.5 }}>
              <button type="button" className="au-link" onClick={() => { setRegStep('form'); setRegCode(''); setNotice(''); setError(''); }}>
                Change the address
              </button>
              <button type="button" className="au-link" disabled={busy} onClick={async () => {
                setBusy(true); setError('');
                const r = await register(email.trim(), password, name.trim());
                setBusy(false);
                if (r.needsCode) setNotice(r.message || 'A new code is on its way.'); else if (r.error) setError(r.error);
              }}>
                Send a new code
              </button>
            </span>
          </div>
        )}

        {noticeBox}
        {errorBox}

        <button type="submit" className="au-primary" disabled={busy}>
          {busy || checking ? <Loader size={16} className="spin" /> : <>{mode === 'login' ? 'Sign in' : locked ? 'Confirm and create account' : mode === 'register' ? 'Continue' : 'Create account'} <ArrowRight size={15} /></>}
        </button>
      </form>

      {/* ── Or: Google, or a code and no password at all ──
          Offered on both sign-in and sign-up, because the code proves the same
          thing either way — that they hold the mailbox — and a new address
          becomes an account on the spot. */}
      {mode !== 'setup' && !locked && (
        <>
          <div className="au-or">Or continue with</div>
          <div className="au-alt">
            {/* Only when the server says it will work. See AuthStatus.google. */}
            {google && (
              <button type="button" className="au-soft" disabled={busy} onClick={() => void goToGoogle()}>
                <GoogleG /> {mode === 'register' ? 'Sign up with Google' : 'Continue with Google'}
              </button>
            )}
            <button type="button" className="au-soft" disabled={busy} onClick={() => { setView('code'); setError(''); setNotice(''); }}>
              <Mail size={16} /> {mode === 'register' ? 'Sign up with a code' : 'Email me a code'}
            </button>
          </div>
          {agreeLine}
        </>
      )}

      {/* Whichever form is showing, the other one is a click away. Arriving at
          the wrong door is the commonest thing that happens here. */}
      {mode !== 'setup' && (signupsOpen || mode === 'register') && (
        <p className="au-switch">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button type="button" className="au-link"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setNotice(''); setRegStep('form'); setRegCode(''); }}>
            {mode === 'login' ? 'Create one' : 'Sign in'}
          </button>
        </p>
      )}

      {mode !== 'login' && (
        <p className="au-fine">
          {mode === 'register'
            ? 'Your workspace is yours alone. Nobody else who signs up can see it.'
            : 'You can add client logins later from the Agency dashboard.'}
        </p>
      )}

      {testLogin && mode === 'login' && (
        <div style={{ marginTop: 14, border: '1px dashed #d5d8dd', borderRadius: 16, padding: '12px 14px' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700 }}>Demo account</div>
          <p style={{ fontSize: 11.5, color: '#6b7280', margin: '4px 0 0', lineHeight: 1.5 }}>
            This install has no owner yet, so the demo login{' '}
            <code style={{ fontWeight: 700 }}>{testLogin.username}</code> still works for trying
            things out. It closes itself automatically the moment you create your real account below —
            after that only your own login opens the app.
          </p>
        </div>
      )}
    </>,
  );
}
