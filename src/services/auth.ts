/**
 * auth.ts — client portal authentication with roles.
 *
 * Roles:
 *   'agency'  — the reseller/owner: sees the Agency dashboard, all workspaces,
 *               the account switcher, and can provision client logins.
 *   'client'  — a customer: locked to their own sub-account, no agency access.
 *
 * Backed by the Worker's api/auth.php when reachable (PBKDF2-HMAC-SHA256, with
 * sessions in D1); falls back to a local store so the app is usable offline.
 * The local fallback is a soft gate — production security comes from the server.
 */
import { API_BASE } from './apiBase';


const SESSION_KEY = 'crm_session';        // global (not scoped): { token, user, backend }
const LOCAL_USERS_KEY = 'crm_local_users'; // fallback user store (global)

export type Role = 'agency' | 'client';
export interface AuthUser {
  email: string;
  name: string;
  role: Role;
  accountId: string | null;   // clients are bound to one sub-account
}
export interface Session {
  token: string;
  user: AuthUser;
  backend: 'php' | 'local';
}

interface LocalUser extends AuthUser { password: string; }

/* ── Session (global storage — survives account switches) ── */
export function getSession(): Session | null {
  try { return JSON.parse(window.localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
/**
 * The token to send with any request the server authenticates — notably the
 * endpoints that open an outbound socket (SMTP send/test, IMAP fetch,
 * diagnostics), which refuse anonymous callers once an owner account exists.
 */
export function sessionToken(): string {
  return getSession()?.token ?? '';
}

/**
 * The token itself is not kept here any more.
 *
 * The server sets it as an HttpOnly cookie that no script on this page can
 * read (worker/src/lib/session.ts), and every request that used to carry the
 * token now carries the placeholder "cookie", which the Worker swaps for the
 * cookie on its way in. So a script that got onto the page — the thing the CSP
 * and the sanitiser exist to stop — finds nothing worth stealing here.
 *
 * Two exceptions keep the real token: the Vite dev server, which is a
 * different origin from the Worker and so never sees its cookie; and the
 * offline "local" backend, which has no server at all.
 */
export const COOKIE_TOKEN = 'cookie';
const keepsToken = () => import.meta.env.DEV;

function setSession(s: Session | null) {
  if (s) {
    const stored = s.backend === 'php' && !keepsToken() ? { ...s, token: COOKIE_TOKEN } : s;
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(stored));
  } else window.localStorage.removeItem(SESSION_KEY);
}

/**
 * A browser signed in before sessions moved to the cookie still has the real
 * token in storage. Hand it to the server once — the answer sets the cookie —
 * then forget it. Run at start-up; does nothing for anyone already moved.
 */
export async function moveSessionToCookie(): Promise<void> {
  const s = getSession();
  if (!s || s.backend !== 'php' || !s.token || s.token === COOKIE_TOKEN || keepsToken()) return;
  const res = await php('adopt_cookie', { token: s.token });
  if (res?.ok) setSession(s);
}

/* ── Local fallback store ── */
function loadLocalUsers(): LocalUser[] {
  try { return JSON.parse(window.localStorage.getItem(LOCAL_USERS_KEY) || '[]'); } catch { return []; }
}
function saveLocalUsers(u: LocalUser[]) { window.localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(u)); }

export function hasAnyUser(): boolean {
  return loadLocalUsers().length > 0;
}

export interface AuthStatus {
  /** True when an owner account already exists on the server. */
  initialised: boolean;
  /** False when api/data/ cannot be written — setup would fail silently. */
  writable: boolean;
  /** Null when the PHP backend is unreachable and we are running local-only. */
  backend: 'php' | 'local';
  /**
   * The demo username, when the server is still offering one. The password is
   * deliberately not part of this — the status endpoint is unauthenticated, so
   * anything it returns is public.
   */
  testLogin?: { username: string } | null;
  /**
   * Whether a stranger may make themselves an account on this deployment.
   *
   * False on the testing site, which has one person on it. The sign-up link is
   * then not drawn at all rather than drawn and refused — a link that cannot
   * work is worse than no link, which is the same rule the Google button
   * below already follows.
   */
  signupsOpen?: boolean;
  /**
   * Which deployment the *server* believes this is, from its own config.
   *
   * Cross-checked against the hostname, because the hostname alone cannot
   * detect a routing mistake that points one site's address at the other's
   * Worker — and that mistake wears the wrong banner while behaving normally.
   */
  appOrigin?: string;
  /**
   * Whether "Continue with Google" is worth drawing. The server decides, and it
   * says yes only when the application is configured *and* this is the host
   * Google will redirect back to — a button that lands on Google's own error
   * page is worse than no button.
   */
  google: boolean;
}

/**
 * Ask the server whether setup has already happened. The browser cannot know
 * this on its own — it only sees its own storage — and assuming it could meant
 * a fresh browser was shown a setup screen that could never succeed against a
 * server that already had an owner.
 */
export async function authStatus(): Promise<AuthStatus> {
  const res = await php('status', {});
  if (res?.ok) {
    /*
     * Two names for one fact. This asked for `initialised`; the Worker answers
     * `hasOwner`, and has since the PHP backend was replaced. Neither side was
     * wrong on its own and nothing failed loudly — the field simply read as
     * undefined, every visitor was told the product had never been set up, and
     * the sign-in link opened the create-the-owner form on an install that
     * already had an owner. Read both, so the screen is right whichever name
     * the server on the other end happens to use.
     */
    const data = res.data as { initialised?: unknown; hasOwner?: unknown; writable?: unknown; testLogin?: unknown; google?: unknown; signupsOpen?: unknown; appOrigin?: unknown };
    return {
      initialised: !!(data.initialised ?? data.hasOwner),
      writable: data.writable !== false,
      /* Absent on an older Worker means open, which is what every deployment
         but the testing one is — the same fail-towards-working default the
         server itself uses. */
      signupsOpen: data.signupsOpen !== false,
      /* Empty on an older Worker, which the check below treats as "cannot
         tell" rather than as a mismatch — accusing a correct deployment of
         being the wrong one would be its own false alarm. */
      appOrigin: typeof data.appOrigin === 'string' ? data.appOrigin : '',
      backend: 'php',
      testLogin: (data.testLogin as AuthStatus['testLogin']) ?? null,
      /* Absent on an older Worker, which means no Google — the right answer, and
         the reason this is read as a positive rather than defaulted to true. */
      google: data.google === true,
    };
  }
  return { initialised: hasAnyUser(), writable: true, backend: 'local', testLogin: null, google: false };
}

async function php(action: string, body: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown>; status: number } | null> {
  try {
    const r = await fetch(`${API_BASE}/api/auth.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
    const data = await r.json();
    return { ok: !!data.success, data, status: r.status };
  } catch { return null; }  // endpoint unreachable → caller uses local fallback
}

/**
 * Is the session this page believes in still a session?
 *
 * The page used to take a stored session on trust. When the server's had
 * ended — thirty days idle, signed out on another device, a password change —
 * the app kept drawing itself as signed in while every request was refused,
 * which looks like a broken product rather than "please sign in again".
 *
 * Asked at start-up and when the tab comes back into view. Only a definite
 * "not authorised" from the server signs the page out; a network failure or a
 * server error leaves the session alone, because being offline is not being
 * signed out. The reason is left for the sign-in screen to say.
 */
export const SIGNED_OUT_REASON = 'crm_signed_out_reason';
export async function checkSession(): Promise<'ok' | 'ended' | 'unknown'> {
  const s = getSession();
  if (!s || s.backend !== 'php') return 'unknown';
  const res = await php('me', { token: s.token });
  if (!res) return 'unknown';
  if (res.ok && res.data.user) {
    /* The name or role may have been changed elsewhere; the token stays. */
    const user = res.data.user as AuthUser;
    if (JSON.stringify(user) !== JSON.stringify(s.user)) setSession({ ...s, user });
    return 'ok';
  }
  if (res.status === 401) {
    setSession(null);
    try { sessionStorage.setItem(SIGNED_OUT_REASON, 'Your session ended — sign in again to carry on where you left off.'); } catch { /* storage off */ }
    return 'ended';
  }
  return 'unknown';
}

/* ── Bootstrap: create the first (agency) owner ── */
/**
 * Create an ordinary account on an install that already has an owner.
 *
 * `bootstrap` is the first-run path and the server refuses it once anybody
 * exists; this is the one the public sign-up form uses. There is no local
 * fallback on purpose — an account that exists only in this browser's storage
 * is not an account, and offering one would leave somebody believing they had
 * signed up for a product they cannot sign in to from anywhere else.
 */
export async function register(
  email: string, password: string, name: string, emailCode = '',
): Promise<{ ok: boolean; error?: string; code?: string; needsCode?: boolean; message?: string }> {
  const res = await php('register', { email, password, name, ...(emailCode ? { code: emailCode } : {}) });
  if (!res) return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
  /* The server posted a code to prove the address; nothing exists yet. The
     form asks for the code and calls this again with it. */
  if (res.ok && res.data.needsCode) return { ok: false, needsCode: true, message: String(res.data.message ?? '') };
  if (res.ok) return login(email, password);
  return {
    ok: false,
    error: (res.data.error as string) || 'Could not create the account.',
    code: (res.data.code as string) || undefined,
  };
}

export async function bootstrap(email: string, password: string, name: string): Promise<{ ok: boolean; error?: string; code?: string }> {
  const res = await php('bootstrap', { email, password, name });
  if (res) {
    if (res.ok) return login(email, password);
    // Surface the server's actual reason. Previously any refusal fell through
    // to a login attempt, so "an owner already exists" was reported to the user
    // as "Invalid email or password" — which sent them looking for the wrong
    // problem entirely.
    return {
      ok: false,
      error: (res.data.error as string) || 'Could not create the account.',
      code: (res.data.code as string) || undefined,
    };
  }
  // local fallback
  const users = loadLocalUsers();
  if (users.length) return { ok: false, error: 'Already set up.' };
  const u: LocalUser = { email: email.toLowerCase(), name, role: 'agency', accountId: null, password };
  saveLocalUsers([u]);
  setSession({ token: `local-${Date.now()}`, user: pub(u), backend: 'local' });
  return { ok: true };
}

function pub(u: LocalUser): AuthUser { return { email: u.email, name: u.name, role: u.role, accountId: u.accountId }; }

/**
 * Written directly rather than through services/tenancy, which imports this
 * module — going the other way as well would be a cycle.
 */
function setActiveWorkspace(id: string) {
  try { window.localStorage.setItem('crm_active_account', id); } catch { /* private mode */ }
}

/**
 * 2-step sign-in. A correct password (or code, or Google) on an account with
 * it switched on comes back as a ticket, not a session; the screen then asks
 * for the six digits and `finishTwoStep` exchanges both for the session.
 */
export async function finishTwoStep(ticket: string, code: string): Promise<{ ok: boolean; error: string }> {
  const res = await php('login_mfa', { ticket, code });
  if (!res) return { ok: false, error: 'Could not reach the server.' };
  if (!res.ok) return { ok: false, error: String(res.data.error ?? 'That code did not work.') };
  adoptSession(res.data);
  return { ok: true, error: '' };
}

const ticketOf = (data: Record<string, unknown>): string | undefined =>
  data.mfaRequired ? String(data.ticket ?? '') : undefined;

export async function login(email: string, password: string): Promise<{ ok: boolean; error?: string; mfaTicket?: string }> {
  const res = await php('login', { email, password });
  if (res) {
    const mfaTicket = ticketOf(res.data);
    if (mfaTicket) return { ok: false, mfaTicket, error: String(res.data.error ?? '') };
    if (res.ok) {
      const user = res.data.user as AuthUser;
      setSession({ token: res.data.token as string, user, backend: 'php' });
      /*
       * Point this browser at the workspace the server says is theirs.
       *
       * The tenancy layer seeds a local sub-account named `acct-<timestamp>` the
       * first time it is asked for one, and that had already been made active by
       * the time a newly registered account arrived here — so a new customer
       * synced into an id their browser invented rather than the one the server
       * issued them. Two people registering in the same millisecond would have
       * generated the same one, and the name is guessable besides, which is not
       * something a tenant boundary should be.
       *
       * Set on sign-in rather than on every render: an agency moves between its
       * own client sub-accounts while it works, and this must not drag them home
       * every time the app re-renders.
       */
      if (user.accountId) {
        setActiveWorkspace(user.accountId);
      } else {
        /*
         * An owner is not bound to one workspace, so the server sends the list.
         *
         * Using `accountId` alone left the install owner — whose `account_id`
         * is NULL by design — pointing at nothing on any machine that had not
         * stored a choice, and the tenancy layer then invented
         * `acct-<timestamp>`. They got an empty workspace, and their real one
         * kept its invented id with nothing pointing at it.
         *
         * A stored choice is honoured as long as it is genuinely theirs: an
         * agency moves between its own client sub-accounts while it works, and
         * signing in again must not drag them home. It is only replaced when it
         * is missing, or names a workspace this account does not own.
         */
        const owned = (res.data.workspaces as { accountId?: string }[] | undefined) ?? [];
        const ids = owned.map(w => String(w.accountId ?? '')).filter(Boolean);
        if (ids.length) {
          let current = '';
          try { current = window.localStorage.getItem('crm_active_account') ?? ''; } catch { current = ''; }
          if (!current || !ids.includes(current)) setActiveWorkspace(ids[0]);
        }
      }
      return { ok: true };
    }
    return { ok: false, error: (res.data.error as string) || 'Login failed.' };
  }
  // local fallback
  const u = loadLocalUsers().find(x => x.email === email.toLowerCase() && x.password === password);
  if (!u) return { ok: false, error: 'Invalid email or password.' };
  setSession({ token: `local-${Date.now()}`, user: pub(u), backend: 'local' });
  return { ok: true };
}

/**
 * Adopt a session the server just issued, and point the browser at the right
 * workspace.
 *
 * Lifted out of `login` unchanged rather than copied, because the two paths
 * ending up with different workspace-selection rules is exactly how the install
 * owner once landed in an invented workspace. One rule, two callers.
 */
function adoptSession(data: Record<string, unknown>): void {
  const user = data.user as AuthUser;
  setSession({ token: data.token as string, user, backend: 'php' });

  if (user.accountId) {
    setActiveWorkspace(user.accountId);
    return;
  }
  const owned = (data.workspaces as { accountId?: string }[] | undefined) ?? [];
  const ids = owned.map(w => String(w.accountId ?? '')).filter(Boolean);
  if (!ids.length) return;
  let current = '';
  try { current = window.localStorage.getItem('crm_active_account') ?? ''; } catch { current = ''; }
  if (!current || !ids.includes(current)) setActiveWorkspace(ids[0]);
}

/**
 * Ask for a sign-in code.
 *
 * Deliberately says the same thing whether or not the address has an account —
 * a form that answers differently is a way to find out who is registered.
 */
export async function requestLoginCode(email: string): Promise<{ ok: boolean; message: string; error: string }> {
  const res = await php('request_code', { email });
  if (!res) return { ok: false, message: '', error: 'Could not reach the server.' };
  return res.ok
    ? { ok: true, message: String(res.data.message ?? 'Check your email.'), error: '' }
    : { ok: false, message: '', error: String(res.data.error ?? 'Could not send a code.') };
}

/** Exchange the six digits for a session. Creates the account if it is new. */
export async function verifyLoginCode(email: string, code: string): Promise<{ ok: boolean; error: string; mfaTicket?: string }> {
  const res = await php('verify_code', { email, code });
  if (!res) return { ok: false, error: 'Could not reach the server.' };
  const mfaTicket = ticketOf(res.data);
  if (mfaTicket) return { ok: false, mfaTicket, error: String(res.data.error ?? '') };
  if (!res.ok) return { ok: false, error: String(res.data.error ?? 'That code did not work.') };
  adoptSession(res.data);
  return { ok: true, error: '' };
}

/* ── Sign in with Google ─────────────────────────────────────────────────── */

/**
 * Where to send them. The URL is built server-side because it carries a signed
 * state the browser must not be able to mint, and the client id, which the
 * browser has no other reason to hold.
 */
export async function googleStart(): Promise<{ ok: boolean; url: string; error: string }> {
  const res = await php('google_start', {});
  if (!res) return { ok: false, url: '', error: 'Could not reach the server.' };
  if (!res.ok) return { ok: false, url: '', error: String(res.data.error ?? 'Google sign-in is not available.') };
  const url = String(res.data.url ?? '');
  /* Remembered in this tab so the callback can check the answer is to a
     sign-in *this browser* started. The server's signature proves the state
     is genuine, not whose it is — without this, somebody could send you a
     link carrying their own Google answer and sign you into their account. */
  try { sessionStorage.setItem('crm_google_state', new URL(url).searchParams.get('state') ?? ''); } catch { /* storage off */ }
  return { ok: true, url, error: '' };
}

/** Was this Google answer to a sign-in started in this tab? */
export function googleStateIsOurs(state: string): boolean {
  try {
    const mine = sessionStorage.getItem('crm_google_state') ?? '';
    sessionStorage.removeItem('crm_google_state');
    return !!mine && mine === state;
  } catch { return false; }
}

/** Hand Google's code back to the Worker, which swaps it and issues a session. */
export async function googleFinish(code: string, state: string): Promise<{ ok: boolean; error: string; mfaTicket?: string }> {
  const res = await php('google_finish', { code, state });
  if (!res) return { ok: false, error: 'Could not reach the server.' };
  const mfaTicket = ticketOf(res.data);
  if (mfaTicket) return { ok: false, mfaTicket, error: String(res.data.error ?? '') };
  if (!res.ok) return { ok: false, error: String(res.data.error ?? 'That sign-in did not work.') };
  adoptSession(res.data);
  return { ok: true, error: '' };
}

export interface GoogleConfig {
  connected: boolean;
  clientId: string;
  /** The exact string to paste into Google's console. */
  redirectUri: string;
  origin: string;
}

const EMPTY_GOOGLE: GoogleConfig = { connected: false, clientId: '', redirectUri: '', origin: '' };

export async function googleConfig(): Promise<GoogleConfig> {
  const res = await php('google_get', { token: sessionToken() });
  if (!res?.ok) return EMPTY_GOOGLE;
  const d = res.data as Partial<GoogleConfig>;
  return {
    connected: d.connected === true,
    clientId: String(d.clientId ?? ''),
    redirectUri: String(d.redirectUri ?? ''),
    origin: String(d.origin ?? ''),
  };
}

/** A blank secret keeps the stored one, as everywhere else credentials are saved. */
export async function saveGoogleConfig(
  clientId: string, clientSecret: string,
): Promise<{ ok: boolean; error: string; config: GoogleConfig }> {
  const res = await php('google_save', { token: sessionToken(), clientId, clientSecret });
  if (!res) return { ok: false, error: 'Could not reach the server.', config: EMPTY_GOOGLE };
  if (!res.ok) return { ok: false, error: String(res.data.error ?? 'Could not save.'), config: EMPTY_GOOGLE };
  const d = res.data as Partial<GoogleConfig>;
  return {
    ok: true,
    error: '',
    config: {
      connected: d.connected === true,
      clientId: String(d.clientId ?? ''),
      redirectUri: String(d.redirectUri ?? ''),
      origin: String(d.origin ?? ''),
    },
  };
}

export async function logout() {
  const s = getSession();
  if (s?.backend === 'php') await php('logout', { token: s.token });
  setSession(null);
}

/* ── Agency: provision & manage client logins ── */
export async function createUser(u: { email: string; password: string; name: string; role: Role; accountId: string | null }): Promise<{ ok: boolean; error?: string }> {
  const s = getSession();
  const res = await php('create_user', { token: s?.token, ...u });
  if (res) return res.ok ? { ok: true } : { ok: false, error: res.data.error as string };
  const users = loadLocalUsers();
  if (users.some(x => x.email === u.email.toLowerCase())) return { ok: false, error: 'Email already exists.' };
  saveLocalUsers([...users, { ...u, email: u.email.toLowerCase() }]);
  return { ok: true };
}
export async function listUsers(): Promise<AuthUser[]> {
  const s = getSession();
  const res = await php('list_users', { token: s?.token });
  if (res && res.ok) return res.data.users as AuthUser[];
  return loadLocalUsers().map(pub);
}
export async function deleteUser(email: string): Promise<{ ok: boolean; error?: string }> {
  const s = getSession();
  const res = await php('delete_user', { token: s?.token, email });
  if (res) return res.ok ? { ok: true } : { ok: false, error: (res.data.error as string) || 'Could not remove that user.' };
  saveLocalUsers(loadLocalUsers().filter(u => u.email !== email.toLowerCase()));
  return { ok: true };
}

/** Agency: reset another member's password (or your own). */
export async function setUserPassword(email: string, password: string, currentPassword?: string): Promise<{ ok: boolean; error?: string }> {
  if (password.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
  const s = getSession();
  /* Changing your own needs your current one; the server checks it. */
  const res = await php('set_password', { token: s?.token, email, password, currentPassword });
  if (res) return res.ok ? { ok: true } : { ok: false, error: (res.data.error as string) || 'Could not set the password.' };
  const users = loadLocalUsers();
  const idx = users.findIndex(u => u.email === email.toLowerCase());
  if (idx < 0) return { ok: false, error: 'User not found.' };
  users[idx] = { ...users[idx], password };
  saveLocalUsers(users);
  return { ok: true };
}
