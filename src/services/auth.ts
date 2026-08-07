/**
 * auth.ts — client portal authentication with roles.
 *
 * Roles:
 *   'agency'  — the reseller/owner: sees the Agency dashboard, all workspaces,
 *               the account switcher, and can provision client logins.
 *   'client'  — a customer: locked to their own sub-account, no agency access.
 *
 * Backed by public/api/auth.php when reachable (real bcrypt server auth);
 * falls back to a local store so the app is usable in dev/demo. The local
 * fallback is a soft gate — production security comes from the PHP backend.
 */

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';
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
function setSession(s: Session | null) {
  if (s) window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else window.localStorage.removeItem(SESSION_KEY);
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
  /** The demo credentials the server will accept, when it offers any. */
  testLogin?: { username: string; password: string } | null;
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
    return {
      initialised: !!res.data.initialised,
      writable: res.data.writable !== false,
      backend: 'php',
      testLogin: (res.data.testLogin as AuthStatus['testLogin']) ?? null,
    };
  }
  return { initialised: hasAnyUser(), writable: true, backend: 'local', testLogin: null };
}

async function php(action: string, body: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> } | null> {
  try {
    const r = await fetch(`${API_BASE}/api/auth.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
    const data = await r.json();
    return { ok: !!data.success, data };
  } catch { return null; }  // endpoint unreachable → caller uses local fallback
}

/* ── Bootstrap: create the first (agency) owner ── */
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

export async function login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const res = await php('login', { email, password });
  if (res) {
    if (res.ok) { setSession({ token: res.data.token as string, user: res.data.user as AuthUser, backend: 'php' }); return { ok: true }; }
    return { ok: false, error: (res.data.error as string) || 'Login failed.' };
  }
  // local fallback
  const u = loadLocalUsers().find(x => x.email === email.toLowerCase() && x.password === password);
  if (!u) return { ok: false, error: 'Invalid email or password.' };
  setSession({ token: `local-${Date.now()}`, user: pub(u), backend: 'local' });
  return { ok: true };
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
export async function setUserPassword(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  if (password.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
  const s = getSession();
  const res = await php('set_password', { token: s?.token, email, password });
  if (res) return res.ok ? { ok: true } : { ok: false, error: (res.data.error as string) || 'Could not set the password.' };
  const users = loadLocalUsers();
  const idx = users.findIndex(u => u.email === email.toLowerCase());
  if (idx < 0) return { ok: false, error: 'User not found.' };
  users[idx] = { ...users[idx], password };
  saveLocalUsers(users);
  return { ok: true };
}
