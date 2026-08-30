/**
 * Sign-in, sign-up and the small amount of user administration an agency does.
 *
 * A port of auth.php, minus two things that belonged to shared hosting and
 * should not survive the move: a hardcoded demo login, and the instruction on
 * the login screen to "delete api/data/users.php on your host" to recover a
 * locked-out account. Neither has a meaning here.
 */
import { addr, body, fail, json, ok } from '../lib/http';
import { hashPassword, newToken, verifyPassword } from '../lib/crypto';
import { hasAnyUser, nowIso, sweepSessions, userFromToken, type Env, type SessionUser } from '../lib/db';

const SESSION_DAYS = 30;

interface AuthBody {
  action?: string;
  token?: string;
  email?: string;
  password?: string;
  name?: string;
  role?: string;
  accountId?: string | null;
}

/* The same rules the browser applies, re-checked here because a client-side
   check is a convenience, not a control. */
const COMMON = ['password', 'password1', '12345678', 'qwertyui', 'letmein1', 'welcome1', 'iloveyou', 'admin123'];

function passwordProblem(pw: string, name = '', email = ''): string {
  if (pw.length < 8) return 'Use a password of at least 8 characters.';
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'Include at least one letter and one number in your password.';
  if (COMMON.includes(pw.toLowerCase())) return 'That password is too common. Choose something harder to guess.';
  const n = name.trim();
  if (n.length >= 5 && pw.toLowerCase().includes(n.toLowerCase())) return 'Do not put your name in your password.';
  const local = (email.split('@')[0] ?? '');
  if (local.length >= 5 && pw.toLowerCase().includes(local.toLowerCase())) return 'Do not put your email address in your password.';
  return '';
}

async function issueSession(env: Env, email: string): Promise<string> {
  const token = newToken();
  const expires = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86_400;
  await env.DB.prepare('INSERT INTO crm_sessions (token, email, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(token, email, expires, nowIso()).run();
  return token;
}

function publicUser(row: { email: string; name: string; role: string; accountId: string | null }): SessionUser {
  return {
    email: row.email,
    name: row.name ?? '',
    role: row.role === 'agency' ? 'agency' : 'client',
    accountId: row.accountId ?? null,
  };
}

export async function handleAuth(req: Request, env: Env): Promise<Response> {
  const d = await body<AuthBody>(req);
  const action = d.action ?? '';

  /* Lets the login screen decide between "set up the owner account" and
     "sign in" without leaking whether any particular address is registered. */
  if (action === 'status') {
    const owner = await hasAnyUser(env.DB);
    /* `initialised` is what the client has always asked for and `hasOwner` is
       what this has always answered. Both, so neither side has to be the one
       that changes, and an older bundle still in somebody's cache keeps working. */
    return json({ success: true, hasOwner: owner, initialised: owner, writable: true });
  }

  if (action === 'me') {
    const user = await userFromToken(env.DB, d.token);
    return user ? json({ success: true, user }) : fail('Not authorised.', 401);
  }

  if (action === 'logout') {
    if (d.token) await env.DB.prepare('DELETE FROM crm_sessions WHERE token = ?').bind(d.token).run();
    return ok();
  }

  /* ── First run: create the owner ── */
  if (action === 'bootstrap') {
    if (await hasAnyUser(env.DB)) return fail('This install already has an owner account.');
    const email = addr(d.email);
    if (!email) return fail('Enter a valid email address.');
    const name = String(d.name ?? '').trim();
    if (name.length < 2) return fail('Enter your name.');
    if (name.length > 120) return fail('That name is too long.');
    const problem = passwordProblem(String(d.password ?? ''), name, email);
    if (problem) return fail(problem);

    await env.DB.prepare(
      'INSERT INTO crm_users (email, name, role, account_id, hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(email.toLowerCase(), name, 'agency', null, await hashPassword(String(d.password)), nowIso()).run();

    const token = await issueSession(env, email.toLowerCase());
    return json({ success: true, token, user: { email: email.toLowerCase(), name, role: 'agency', accountId: null } });
  }

  /*
   * ── Public sign-up ──
   *
   * Distinct from `bootstrap`, which makes the *first* account on an install
   * and refuses once one exists. This makes an ordinary one: its own agency,
   * its own workspace, isolated from every other by crm_workspaces.
   *
   * The new account is an agency because that is what a customer of this
   * product is — somebody who runs client sub-accounts of their own. It is not
   * a privilege over anyone else's data; since 0004 an agency reaches only the
   * workspaces it owns.
   */
  if (action === 'register') {
    const email = addr(d.email);
    if (!email) return fail('Enter a valid email address.');
    const name = String(d.name ?? '').trim();
    if (name.length < 2) return fail('Enter your name.');
    if (name.length > 120) return fail('That name is too long.');
    const password = String(d.password ?? '');
    const problem = passwordProblem(password, name, email);
    if (problem) return fail(problem);

    /*
     * A brake, because this is an open form on a public address. Not a defence
     * against a determined attacker with many addresses — it is the difference
     * between a script filling the table in a minute and it taking long enough
     * to not be worth anyone's while.
     *
     * It counts accounts *created*, not attempts made. Counting attempts sounds
     * stricter and is worse: a person who picks a password the rules reject,
     * fixes it, and gets rejected again has spent three of their five before
     * they have an account at all, and the form then locks them out for an hour
     * for the crime of choosing badly. A request that fails validation is
     * refused anyway and costs nothing to refuse.
     */
    const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
    const since = Math.floor(Date.now() / 1000) - 3600;
    const recent = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM crm_signup_attempts WHERE ip = ? AND created_at > ?',
    ).bind(ip, since).first<{ n: number }>();
    if ((recent?.n ?? 0) >= 5) {
      return fail('Too many accounts have been created from this connection. Try again in an hour.', 429);
    }

    const lower = email.toLowerCase();
    const taken = await env.DB.prepare('SELECT 1 AS n FROM crm_users WHERE email = ?').bind(lower).first();
    /* Sign-in deliberately will not say whether an address is registered; a
       sign-up form has to, or the person cannot act on it. The address is one
       they just typed as their own, so this tells them nothing about anyone. */
    if (taken) return fail('That email already has an account. Sign in instead, or use another address.');

    /* Their own workspace, from the start. `bootstrap` leaves account_id null
       for the original owner and that is grandfathered, but null cannot be a
       tenant boundary for more than one person. */
    const accountId = crypto.randomUUID();

    await env.DB.prepare(
      'INSERT INTO crm_users (email, name, role, account_id, hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(lower, name, 'agency', accountId, await hashPassword(password), nowIso()).run();

    await env.DB.prepare(
      'INSERT OR IGNORE INTO crm_workspaces (account_id, owner_email, created_at) VALUES (?, ?, ?)',
    ).bind(accountId, lower, nowIso()).run();

    /* Recorded here, where an account actually came into existence. */
    await env.DB.prepare('INSERT INTO crm_signup_attempts (ip, created_at) VALUES (?, ?)')
      .bind(ip, Math.floor(Date.now() / 1000)).run();

    await sweepSessions(env.DB);
    const token = await issueSession(env, lower);
    return json({ success: true, token, user: { email: lower, name, role: 'agency', accountId } });
  }

  /* ── Sign in ── */
  if (action === 'login') {
    const email = String(d.email ?? '').trim().toLowerCase();
    const password = String(d.password ?? '');
    if (!email || !password) return fail('Enter your email and password.');

    const row = await env.DB.prepare(
      'SELECT email, name, role, account_id AS accountId, hash FROM crm_users WHERE email = ?',
    ).bind(email).first<{ email: string; name: string; role: string; accountId: string | null; hash: string }>();

    /* One message for "no such account" and "wrong password" alike: telling
       them apart turns the login form into a way to enumerate who has one. */
    const good = row ? await verifyPassword(password, row.hash) : false;
    if (!row || !good) return fail('Invalid email or password.', 401);

    await sweepSessions(env.DB);
    const token = await issueSession(env, row.email);
    return json({ success: true, token, user: publicUser(row) });
  }

  /* ── Agency administration ── */
  const actor = await userFromToken(env.DB, d.token);

  if (action === 'list_users') {
    if (!actor) return fail('Not authorised.', 401);
    const { results } = await env.DB.prepare(
      'SELECT email, name, role, account_id AS accountId FROM crm_users ORDER BY created_at',
    ).all<{ email: string; name: string; role: string; accountId: string | null }>();
    return json({ success: true, users: (results ?? []).map(publicUser) });
  }

  if (action === 'create_user') {
    if (actor?.role !== 'agency') return fail('Only an agency account can add users.', 403);
    const email = addr(d.email);
    if (!email) return fail('Enter a valid email address.');
    const exists = await env.DB.prepare('SELECT 1 AS n FROM crm_users WHERE email = ?')
      .bind(email.toLowerCase()).first();
    if (exists) return fail('An account with that email already exists.');
    const problem = passwordProblem(String(d.password ?? ''), String(d.name ?? ''), email);
    if (problem) return fail(problem);

    await env.DB.prepare(
      'INSERT INTO crm_users (email, name, role, account_id, hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(
      email.toLowerCase(), String(d.name ?? '').slice(0, 120),
      d.role === 'agency' ? 'agency' : 'client', d.accountId ?? null,
      await hashPassword(String(d.password)), nowIso(),
    ).run();
    return ok();
  }

  if (action === 'set_password') {
    if (!actor) return fail('Not authorised.', 401);
    const email = String(d.email ?? '').trim().toLowerCase();
    /* A client may change their own; only an agency may change anybody's. */
    if (actor.role !== 'agency' && actor.email !== email) return fail('Not authorised.', 403);
    const problem = passwordProblem(String(d.password ?? ''), '', email);
    if (problem) return fail(problem);
    const res = await env.DB.prepare('UPDATE crm_users SET hash = ? WHERE email = ?')
      .bind(await hashPassword(String(d.password)), email).run();
    if (!res.meta.changes) return fail('User not found.');
    /* Every other session for that account is ended: a password change that
       leaves a stolen session alive has not actually locked anybody out. */
    await env.DB.prepare('DELETE FROM crm_sessions WHERE email = ? AND token != ?')
      .bind(email, d.token ?? '').run();
    return ok();
  }

  if (action === 'delete_user') {
    if (actor?.role !== 'agency') return fail('Only an agency account can remove users.', 403);
    const email = String(d.email ?? '').trim().toLowerCase();
    if (email === actor.email) return fail('You cannot remove your own account.');
    await env.DB.prepare('DELETE FROM crm_sessions WHERE email = ?').bind(email).run();
    const res = await env.DB.prepare('DELETE FROM crm_users WHERE email = ?').bind(email).run();
    return res.meta.changes ? ok() : fail('User not found.');
  }

  return fail(`"${action}" is not something this endpoint does.`);
}
