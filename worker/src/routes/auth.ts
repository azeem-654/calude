/**
 * Sign-in, sign-up and the small amount of user administration an agency does.
 *
 * A port of auth.php, minus two things that belonged to shared hosting and
 * should not survive the move: a hardcoded demo login, and the instruction on
 * the login screen to "delete api/data/users.php on your host" to recover a
 * locked-out account. Neither has a meaning here.
 */
import { addr, body, fail, json, ok } from '../lib/http';
import { rateLimit } from '../lib/rateLimit';
import { origin, recordAuthEvent } from '../lib/audit';
import { hashPassword, newToken, timingSafeEqual, verifyPassword } from '../lib/crypto';
import { decryptSecret } from '../lib/crypto';
import { hasAnyUser, hasInstallOwner, installSecret, nowIso, sessionKey, sessionKeys, signupsClosed, sweepSessions, userFromToken, workspaceAccess, type Env, type SessionUser } from '../lib/db';
import { readTicket, signTicket, verifyTotp } from '../lib/totp';
import {
  authorizeUrl, checkState, exchangeCode, googleCreds, saveGoogleCreds, redirectUri, signInOrigin,
} from '../lib/googleAuth';

const SESSION_DAYS = 30;

/**
 * The policy version accounts are held to.
 *
 * Kept in step with `src/services/policy.ts` by hand. The client draws the
 * sentence from its own copy; only this one is ever written down against an
 * account, so the two drifting means somebody is shown a slightly stale date,
 * not that the record is wrong.
 */
export const POLICY_VERSION = '2026-09-16';

/**
 * Write down what they agreed to, and from where.
 *
 * The address is not identification. It is the one fact that distinguishes
 * "they agreed" from "somebody agreed on their behalf", which is the only
 * question this record ever has to answer.
 */
async function recordPolicy(env: Env, email: string, ip: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO crm_policy_acceptance (email, version, ip, accepted_at) VALUES (?,?,?,?)
     ON CONFLICT(email) DO UPDATE SET version = excluded.version, ip = excluded.ip, accepted_at = excluded.accepted_at`,
  ).bind(email.toLowerCase(), POLICY_VERSION, ip.slice(0, 64), nowIso()).run();
}

interface AuthBody {
  action?: string;
  /** The six digits from a sign-in email, or Google's authorization code. */
  code?: string;
  /** The signed state Google hands back with the code. */
  state?: string;
  clientId?: string;
  clientSecret?: string;
  token?: string;
  email?: string;
  password?: string;
  /** Your own password, when changing it. Checked on the server. */
  currentPassword?: string;
  /** Between the two steps of a 2-step sign-in. See lib/totp.ts. */
  ticket?: string;
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

/**
 * A new session. The browser gets the token; the database gets its hash, the
 * device it came from and how it signed in — so "where am I signed in" can be
 * answered and a stolen database cannot be replayed. See `sessionKey`.
 */
async function issueSession(env: Env, email: string, req: Request | null = null, method = 'password'): Promise<string> {
  const token = newToken();
  const expires = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86_400;
  const ip = req?.headers.get('CF-Connecting-IP') ?? '';
  const ua = (req?.headers.get('User-Agent') ?? '').slice(0, 300);
  try {
    await env.DB.prepare('INSERT INTO crm_sessions (token, email, expires_at, created_at, ip, ua, method, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(await sessionKey(token), email, expires, nowIso(), ip, ua, method, nowIso()).run();
  } catch {
    /* A database a migration behind — the Worker deploys after migrations, so
       this is a local copy. The session still works. */
    await env.DB.prepare('INSERT INTO crm_sessions (token, email, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .bind(await sessionKey(token), email, expires, nowIso()).run();
  }
  await recordAuthEvent(env, { email, kind: 'login', detail: `Signed in with ${method === 'code' ? 'an emailed code' : method === 'google' ? 'Google' : method === 'signup' ? 'a new account' : 'a password'}`, ip, ua });
  return token;
}

/** The workspaces this address owns, most recently used first. */
async function ownedWorkspaces(env: Env, email: string): Promise<{ accountId: string; lastUsed: string }[]> {
  const { results } = await env.DB.prepare(
    `SELECT w.account_id AS accountId,
            REPLACE(COALESCE((SELECT MAX(dd.updated_at) FROM crm_data dd WHERE dd.account_id = w.account_id), w.created_at), ' ', 'T') AS lastUsed
     FROM crm_workspaces w WHERE w.owner_email = ? ORDER BY lastUsed DESC LIMIT 50`,
  ).bind(email).all<{ accountId: string; lastUsed: string }>();
  return results ?? [];
}

/**
 * Has this account turned on 2-step sign-in? Then a correct password (or
 * code, or Google) is not yet a session: it is a five-minute ticket, and
 * `login_mfa` turns ticket + code into the session.
 */
async function secondStep(env: Env, email: string, method: string): Promise<Response | null> {
  let on = false;
  try {
    const row = await env.DB.prepare('SELECT totp_enabled_at AS on_at FROM crm_users WHERE email = ?').bind(email).first<{ on_at: string | null }>();
    on = !!row?.on_at;
  } catch { on = false; }
  if (!on) return null;
  return json({ success: false, mfaRequired: true, ticket: await signTicket(env, email, method), error: 'Enter the 6-digit code from your authenticator app.' });
}

/** SHA-256 as lower-case hex. The code is never stored in the clear. */
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Post the code, from whichever mailbox this install can send with.
 *
 * ── Which mailbox ──
 *
 * The *install owner's*, not the address signing in — somebody signing in for
 * the first time has no workspace and therefore no mailbox, so using theirs is
 * impossible by definition. Falls back to any configured mailbox, because on a
 * small install the owner's is often the only one there is.
 *
 * A failure is returned rather than swallowed. A customer watching an inbox
 * that will never receive anything is the worst outcome here, and it is the
 * one that happens silently if this returns success on a dead SMTP password.
 */
async function sendLoginCode(env: Env, email: string, code: string): Promise<{ ok: boolean; error: string }> {
  const row = await env.DB.prepare(
    `SELECT smtp_host AS host, smtp_port AS port, smtp_encryption AS encryption,
            smtp_username AS username, smtp_password AS password,
            from_email AS fromEmail, from_name AS fromName
     FROM crm_mailbox_accounts
     WHERE smtp_host != '' AND smtp_username != ''
     ORDER BY is_primary DESC, created_at LIMIT 1`,
  ).first<{
    host: string; port: number; encryption: string; username: string;
    password: string; fromEmail: string; fromName: string;
  }>();

  if (!row?.host) {
    return {
      ok: false,
      error: 'This app cannot send sign-in codes yet — no mailbox is connected. Use your password, or ask the owner to connect one.',
    };
  }

  const { installSecret } = await import('../lib/db');
  const { decryptSecret } = await import('../lib/crypto');
  const { buildMime } = await import('../lib/mime');
  const { smtpSend } = await import('../lib/smtp');

  let password = '';
  try {
    password = await decryptSecret(await installSecret(env.DB, 'mailbox_key'), row.password);
  } catch {
    return { ok: false, error: 'Could not send a code just now. Try again shortly.' };
  }

  const from = row.fromEmail || row.username;
  /* Plain, short, and with the code big enough to read on a phone without
     zooming — this is read in a notification shade more often than in an inbox. */
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:420px;margin:0 auto;color:#17191c">
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px">Here is your sign-in code:</p>
      <p style="font-size:34px;font-weight:800;letter-spacing:0.12em;margin:0 0 14px">${code}</p>
      <p style="font-size:13px;color:#64748b;line-height:1.6;margin:0">
        It works once and expires in ten minutes. If you did not ask for it, you can ignore this —
        nobody can get in without it.
      </p>
    </div>`;

  const mime = buildMime({
    fromName: row.fromName || 'Sign in',
    fromEmail: from,
    to: email,
    subject: `${code} is your sign-in code`,
    html,
  }, row.host);

  /*
   * The mailbox's own encryption, not a guess.
   *
   * This said `encryption: 'tls'` regardless of what the mailbox was configured
   * with, which is wrong for every SSL-on-465 mailbox and every relay that
   * wants none. The port ladder inside smtpSend would often paper over it and
   * sometimes not, which is the worst kind of wrong — it works until somebody's
   * particular host is the exception.
   */
  const encryption = row.encryption === 'ssl' ? 'ssl' : row.encryption === 'none' ? 'none' : 'tls';
  const sent = await smtpSend(
    { host: row.host, port: row.port, encryption, username: row.username, password },
    { from, to: email, mime },
  );
  /* The SMTP server's own words are not shown: they name a host and a mailbox
     that belong to the operator, to somebody who has not signed in yet. */
  return sent.ok
    ? { ok: true, error: '' }
    : { ok: false, error: 'We could not send the code just now. Try again in a moment.' };
}

/**
 * Turn a proven address into a session — the last step of every passwordless
 * path, and only ever one implementation of it.
 *
 * The code path and the Google path both arrive here having proved the same
 * thing by different means: that the person holds the mailbox. What happens
 * next — find the account or make one, start a workspace, pick which workspace
 * the browser should open — has to be identical, because two copies of it is
 * how the install owner once ended up in a workspace their browser invented.
 *
 * `hasInstallOwner` is untouched by this. Everything created here is an
 * ordinary workspace-owning account; there is no route from a mailbox to
 * owning the install.
 */
async function completeSignIn(env: Env, email: string, suggestedName: string, req: Request, method: 'code' | 'google'): Promise<Response> {
  const ip = req.headers.get('CF-Connecting-IP') ?? '';
  email = email.trim().toLowerCase();
  let user = await env.DB.prepare(
    'SELECT email, name, role, account_id AS accountId, hash FROM crm_users WHERE email = ?',
  ).bind(email).first<{ email: string; name: string; role: string; accountId: string | null; hash?: string }>();

  /*
   * The first proof that this person owns the address.
   *
   * Signing up with a password never proved it, so somebody could register a
   * stranger's address first and set the password. When the real owner later
   * arrives by code or Google, they would be signed into that account — and
   * the squatter would still know its password. So the first time the mailbox
   * is proved, a password set before that proof is cleared and every other
   * session ended. The owner can set their own from Security & Privacy.
   */
  if (user) {
    try {
      const v = await env.DB.prepare('SELECT email_verified_at AS v FROM crm_users WHERE email = ?').bind(email).first<{ v: string | null }>();
      if (v && !v.v) {
        const unproved = !!user.hash && !(user.role === 'agency' && !user.accountId);
        await env.DB.prepare(`UPDATE crm_users SET email_verified_at = ?${unproved ? ", hash = ''" : ''} WHERE email = ?`).bind(nowIso(), email).run();
        if (unproved) await env.DB.prepare('DELETE FROM crm_sessions WHERE email = ?').bind(email).run();
      }
    } catch { /* a database before 0049 */ }
  }

  if (!user) {
    /* Signing *in* still works for whoever already has an account here — it is
       only the making of a new one that is shut. Checked in this branch rather
       than at the top for exactly that reason: the one person who uses staging
       must still be able to arrive through Google or a code. */
    if (signupsClosed(env)) {
      return fail('This is the testing site, and it has one account. Sign in at app.protectedcentral.com instead.', 403);
    }
    const accountId = crypto.randomUUID();
    const name = suggestedName.trim().slice(0, 120) || email.split('@')[0];
    /* An empty hash, not a random one. `verifyPassword` fails against it, so
       the account simply has no password until somebody sets one — rather than
       having a password nobody knows, which reads the same to the customer and
       cannot be told apart in the database. */
    await env.DB.prepare(
      'INSERT INTO crm_users (email, name, role, account_id, hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(email, name, 'agency', accountId, '', nowIso()).run();
    await env.DB.prepare(
      'INSERT OR IGNORE INTO crm_workspaces (account_id, owner_email, created_at) VALUES (?, ?, ?)',
    ).bind(accountId, email, nowIso()).run();
    try { await env.DB.prepare('UPDATE crm_users SET email_verified_at = ? WHERE email = ?').bind(nowIso(), email).run(); }
    catch { /* before 0049 */ }
    user = { email, name, role: 'agency', accountId };
    /*
     * Recorded on the way in, because these two paths have no checkbox.
     *
     * Signing in with a code or with Google is one tap, and bolting a consent
     * form onto it would undo the reason either exists. So the sign-in screen
     * says, next to the button, that continuing means accepting the policy —
     * and this is where that gets written down. A tick nobody was shown would
     * be worse than no record at all.
     */
    await recordPolicy(env, email, ip);
  }

  const held = await secondStep(env, user.email, method);
  if (held) return held;

  await sweepSessions(env.DB);
  const token = await issueSession(env, user.email, req, method);
  return json({ success: true, token, user: publicUser(user), workspaces: await ownedWorkspaces(env, user.email) });
}

/* ── Who may manage whom ──────────────────────────────────────────────────
 *
 * These four actions used to ask one question — "is the caller an agency?" —
 * and that stopped meaning anything the day sign-up opened: every account
 * that registers is an agency. So any stranger could set the install owner's
 * password, delete the owner and re-register the address, or mint a client
 * login bound to somebody else's workspace id and read it.
 *
 * The question now is about the *target*: yourself; a client login inside a
 * workspace you own; or, for the install owner, anyone. Nothing else. */

const isInstallOwner = (u: SessionUser | null): boolean => !!u && u.role === 'agency' && !u.accountId;

/** Does this agency own this workspace? A lookup only — it never claims one. */
async function ownsWorkspace(env: Env, actor: SessionUser, accountId: string | null): Promise<boolean> {
  if (!accountId) return false;
  const row = await env.DB.prepare('SELECT 1 AS n FROM crm_workspaces WHERE account_id = ? AND owner_email = ?')
    .bind(accountId, actor.email).first();
  return !!row;
}

interface Target { email: string; role: string; accountId: string | null; hash: string }

async function ownsAnyWorkspace(env: Env, email: string): Promise<boolean> {
  return !!(await env.DB.prepare('SELECT 1 AS n FROM crm_workspaces WHERE owner_email = ? LIMIT 1').bind(email).first());
}

async function manageable(env: Env, actor: SessionUser, email: string): Promise<{ target: Target | null; self: boolean; ok: boolean }> {
  const target = await env.DB.prepare('SELECT email, role, account_id AS accountId, hash FROM crm_users WHERE email = ?')
    .bind(email).first<Target>();
  if (!target) return { target: null, self: false, ok: false };
  if (target.email === actor.email) return { target, self: true, ok: true };
  if (isInstallOwner(actor)) return { target, self: false, ok: true };
  /* The owner's row, and every other agency, are out of reach of anyone but
     the owner. */
  if (target.role !== 'client' || !target.accountId) return { target, self: false, ok: false };
  return { target, self: false, ok: actor.role === 'agency' && await ownsWorkspace(env, actor, target.accountId) };
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
    /*
     * Whether to draw the Google button — configured *and* on the host Google
     * will redirect back to. Both, because either one alone produces a button
     * that fails: unconfigured is "invalid_client", wrong host is
     * "redirect_uri_mismatch", and both are Google's error page rather than
     * ours. A button that cannot work is worse than no button.
     */
    const reqOrigin = new URL(req.url).origin;
    const google = !!(await googleCreds(env)) && signInOrigin(env, reqOrigin) === reqOrigin;
    /* `initialised` is what the client has always asked for and `hasOwner` is
       what this has always answered. Both, so neither side has to be the one
       that changes, and an older bundle still in somebody's cache keeps working. */
    /* So the screen does not offer a sign-up link that is going to be refused.
       A button that cannot work is worse than no button — the same reasoning
       as the Google one above, and the same shape of fix. */
    return json({
      success: true, hasOwner: owner, initialised: owner, writable: true, google,
      signupsOpen: !signupsClosed(env),
      /*
       * Which deployment this really is, from the Worker's own configuration.
       *
       * The testing banner is drawn from `location.hostname`, which is right —
       * one build serves both sites and neither can be published believing it
       * is the other. But the hostname says only what was typed in the address
       * bar, and on 2026-09-18 a wildcard Worker route on the live app
       * swallowed testing.protectedcentral.com: the live Worker, on the live
       * database, answering at the testing address and wearing the testing
       * banner. Nothing failed. It looked entirely normal.
       *
       * So the browser and the Worker each say which they think this is, and
       * the app checks they agree. A banner that promises a rehearsal over the
       * real database is the worst lie this product could tell.
       */
      appOrigin: (env.APP_ORIGIN ?? '').replace(/\/$/, ''),
      policyVersion: POLICY_VERSION,
    });
  }

  if (action === 'me') {
    const user = await userFromToken(env.DB, d.token);
    return user ? json({ success: true, user }) : fail('Not authorised.', 401);
  }

  if (action === 'logout') {
    if (d.token) {
      const who = await userFromToken(env.DB, d.token);
      const [h, raw] = await sessionKeys(d.token);
      await env.DB.prepare('DELETE FROM crm_sessions WHERE token IN (?, ?)').bind(h, raw).run();
      if (who) await recordAuthEvent(env, { email: who.email, kind: 'logout', ...origin(req) });
    }
    return ok();
  }

  /* ── The second step: ticket + authenticator code → session ── */
  if (action === 'login_mfa') {
    const t = await readTicket(env, String(d.ticket ?? ''));
    if (!t) return fail('That sign-in has expired. Start again.', 401);
    const tries = await rateLimit(env, { what: 'mfa', who: t.email, max: 6, windowSeconds: 900 });
    if (!tries.allowed) return fail('Too many wrong codes. Wait 15 minutes and sign in again.', 429);
    const row = await env.DB.prepare(
      'SELECT email, name, role, account_id AS accountId, totp_secret AS secret FROM crm_users WHERE email = ?',
    ).bind(t.email).first<{ email: string; name: string; role: string; accountId: string | null; secret: string }>();
    if (!row?.secret) return fail('That sign-in has expired. Start again.', 401);
    const secret = await decryptSecret(await installSecret(env.DB, 'mailbox_key'), row.secret).catch(() => '');
    if (!(await verifyTotp(secret, String(d.code ?? '')))) {
      await recordAuthEvent(env, { email: row.email, kind: 'mfa_failed', ...origin(req) });
      return fail('That code is not right. Check the time on your phone and try the newest one.', 401);
    }
    await sweepSessions(env.DB);
    const token = await issueSession(env, row.email, req, t.method || 'password');
    return json({ success: true, token, user: publicUser(row), workspaces: await ownedWorkspaces(env, row.email) });
  }

  /* ── First run: create the owner ── */
  if (action === 'bootstrap') {
    /*
     * Two guards, not one.
     *
     * `hasAnyUser` is the first-run test and it is the weaker of the two: it
     * stops passing the moment anybody signs up, but it is not what makes the
     * owner unique. `hasInstallOwner` is — it asks whether the privileged
     * no-workspace account exists, and it keeps refusing even if the users
     * table were emptied of everyone else. There is one owner on this install
     * and there is no route here to a second.
     */
    if (await hasInstallOwner(env.DB)) return fail('This install already has an owner account.');
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

    await recordPolicy(env, email, req.headers.get('CF-Connecting-IP') ?? '');
    const token = await issueSession(env, email.toLowerCase(), req, 'signup');
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
    /* See `signupsClosed`. On staging this route is shut: one person uses that
       deployment, and an open sign-up form on a public address is a table
       anybody can fill with rows that then have to be told apart from real
       rehearsal data. */
    if (signupsClosed(env)) return fail('This is the testing site, and it has one account. Sign in at app.protectedcentral.com instead.', 403);
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

    await recordPolicy(env, lower, ip);

    await sweepSessions(env.DB);
    const token = await issueSession(env, lower, req, 'signup');
    return json({ success: true, token, user: { email: lower, name, role: 'agency', accountId } });
  }

  /* ── Sign in with a code, no password ─────────────────────────────────── */

  /*
   * ── Why this exists alongside "Sign in with Google" ──
   *
   * An earlier note here said Google was impossible without verification and a
   * hundred-user cap. That is true of **sensitive and restricted** scopes —
   * Gmail, Drive, Calendar — and not of `openid email profile`, so Google was
   * added below. This stayed, because it answers a different question.
   *
   * A code needs no third-party account at all: it works for an Outlook address
   * or somebody's own domain, on an install whose owner has never opened the
   * Google console, and on a reseller's own domain where Google's redirect
   * cannot reach. It is the path that is always available; Google is the fast
   * one for the people who happen to have an account there.
   *
   * The two prove exactly the same thing — that the person holds the mailbox —
   * which is why both end in `completeSignIn` rather than each having its own
   * idea of what a new account looks like.
   */
  if (action === 'request_code' || action === 'verify_code') {
    const email = addr(d.email) ?? '';
    if (!email) return fail('Enter your email address.');

    const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';

    if (action === 'request_code') {
      /*
       * Two brakes, and they answer different attacks.
       *
       * Per address stops somebody being mailed a hundred codes because an
       * attacker knows their address — which is harassment even when it never
       * works. Per connection stops one machine minting live codes for a
       * thousand addresses and playing the odds against a six-digit space.
       */
      const since = Math.floor(Date.now() / 1000) - 3600;
      const perEmail = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM crm_login_codes WHERE email = ? AND expires_at > ?",
      ).bind(email, since).first<{ n: number }>();
      if ((perEmail?.n ?? 0) >= 5) {
        return fail('Too many codes have been sent to that address. Try again in a few minutes.', 429);
      }
      const perIp = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM crm_signup_attempts WHERE ip = ? AND created_at > ?',
      ).bind(`code:${ip}`, since).first<{ n: number }>();
      if ((perIp?.n ?? 0) >= 20) {
        return fail('Too many sign-in attempts from this connection. Try again in an hour.', 429);
      }

      /*
       * Six digits from crypto randomness, not Math.random.
       *
       * The modulo here is over 900000 on a 32-bit draw, which is a bias of
       * about one part in five thousand — far below anything that helps a
       * guesser, and worth the simplicity over rejection sampling.
       */
      const buf = crypto.getRandomValues(new Uint32Array(1));
      const code = String(100000 + (buf[0] % 900000));
      const hash = await sha256Hex(`${code}:${email}`);
      const expires = Math.floor(Date.now() / 1000) + 600;

      await env.DB.prepare(
        'INSERT OR REPLACE INTO crm_login_codes (code_hash, email, attempts, expires_at, used_at, created_at) VALUES (?,?,0,?,NULL,?)',
      ).bind(hash, email, expires, nowIso()).run();
      await env.DB.prepare('INSERT INTO crm_signup_attempts (ip, created_at) VALUES (?, ?)')
        .bind(`code:${ip}`, Math.floor(Date.now() / 1000)).run();

      const sent = await sendLoginCode(env, email, code);

      /*
       * The same answer whether or not the address has an account.
       *
       * A sign-in form that says "no account here" is a form that tells anybody
       * which of a list of addresses is registered. Sign-up is different and
       * says so plainly — but this is the sign-in path, and it stays quiet.
       *
       * A send that genuinely failed is reported, because a customer staring at
       * an inbox that will never receive anything is worse than knowing.
       */
      if (!sent.ok) return fail(sent.error, 200, { code: 'send_failed' });
      return json({ success: true, message: `If that address has an account, a code is on its way to ${email}.` });
    }

    /* ── verify ── */
    const code = String(d.code ?? '').replace(/\D/g, '');
    if (code.length !== 6) return fail('Enter the six-digit code from your email.');

    /*
     * Looked up by **address**, not by the hash of what was typed.
     *
     * The first version keyed this on the code hash, which made the attempts
     * counter decorative: a wrong guess hashes to something else, so no row came
     * back, so nothing was incremented. Five guesses, five hundred thousand
     * guesses — the counter never moved and the real code still worked
     * afterwards. Proven by testing it: five wrong answers followed by the right
     * one signed straight in.
     *
     * Finding the live code for the address first is what makes a wrong guess
     * cost something. The comparison is then done in constant time against the
     * stored hash, so keying by email gives away nothing that keying by hash
     * protected.
     */
    const now = Math.floor(Date.now() / 1000);
    const row = await env.DB.prepare(
      `SELECT code_hash AS codeHash, attempts FROM crm_login_codes
       WHERE email = ? AND used_at IS NULL AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`,
    ).bind(email, now).first<{ codeHash: string; attempts: number }>();

    /*
     * One message for every way this can fail — wrong, expired, spent, never
     * asked for, or out of guesses. Telling them apart tells somebody guessing
     * which of their attempts was close, and tells somebody holding an old email
     * that the code was once real.
     */
    const refuse = () => fail('That code is wrong or has expired. Ask for a new one.', 401);

    if (!row || row.attempts >= 5) return refuse();

    const typedHash = await sha256Hex(`${code}:${email}`);
    if (!timingSafeEqual(typedHash, row.codeHash)) {
      /* The guess costs one of five, whatever it was. */
      await env.DB.prepare('UPDATE crm_login_codes SET attempts = attempts + 1 WHERE code_hash = ?')
        .bind(row.codeHash).run();
      return refuse();
    }
    const hash = row.codeHash;

    /* Spent before a session exists. A crash between the two costs somebody one
       code; the other order would leave a code good for a second sign-in. */
    await env.DB.prepare('UPDATE crm_login_codes SET used_at = ? WHERE code_hash = ?')
      .bind(nowIso(), hash).run();

    /* A first-time address becomes an account here: the code proves they hold
       the mailbox, which is what a password reset proves and more than a
       password proves on its own. Sending them to a sign-up form to type the
       same address again would be ceremony, not security. */
    return completeSignIn(env, email, email.split('@')[0], req, 'code');
  }

  /* ── Agreeing to a policy that changed ── */
  if (action === 'policy_accept') {
    const who = await userFromToken(env.DB, d.token);
    if (!who) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });
    /* The version is the server's, never the one the browser sent. A client
       that could name the version it accepted could accept a version that does
       not exist. */
    await recordPolicy(env, who.email, req.headers.get('CF-Connecting-IP') ?? '');
    return json({ success: true, version: POLICY_VERSION });
  }

  /* ── Sign in with Google ─────────────────────────────────────────────── */

  /*
   * ── Why this is here at all, after the comment above says otherwise ──
   *
   * The note on the code path says Google needs verification and carries a
   * hundred-user cap. That is true of **sensitive and restricted** scopes —
   * Gmail, Drive, Calendar. Google's own FAQ ties both the cap and the review
   * to exactly those. `openid email profile` is neither: auto-approved, no
   * queue, no cap. The emailed code stays because it works for somebody without
   * a Google account, which this does not.
   *
   * ── Two halves, and nothing in between trusts the browser ──
   *
   * `google_start` mints a signed state and hands back Google's address.
   * `google_finish` gets the code back, checks the state it signed, and swaps
   * the code for an identity server-side. The browser carries an opaque code
   * and a signature it cannot forge, and never holds a token.
   */
  if (action === 'google_start') {
    const reqOrigin = new URL(req.url).origin;
    const canonical = signInOrigin(env, reqOrigin);
    /* Refused rather than redirected. Sending a reseller's visitor to Google
       would land them back on the operator's own address, signed in under a
       brand they have never seen — which is the white-label boundary broken by
       a convenience. */
    if (canonical !== reqOrigin) {
      return fail('Google sign-in is not available on this address. Use your email address instead.');
    }
    const url = await authorizeUrl(env, canonical);
    if (!url) return fail('Google sign-in is not set up on this installation.');
    return json({ success: true, url });
  }

  if (action === 'google_finish') {
    const reqOrigin = new URL(req.url).origin;
    const canonical = signInOrigin(env, reqOrigin);

    /* The state first, before anything is spent. It proves this browser started
       the sign-in rather than an attacker's page having started one and fed the
       result to somebody else's session. */
    if (!(await checkState(env, String(d.state ?? '')))) {
      return fail('That sign-in took too long or did not start here. Try again.', 401);
    }
    const code = String(d.code ?? '').trim();
    if (!code) return fail('Google did not send a sign-in back. Try again.', 400);

    const r = await exchangeCode(env, canonical, code);
    if (!r.ok || !r.identity) return fail(r.error || 'Google refused that sign-in.', 401);

    /*
     * The one check this whole feature rests on.
     *
     * Anybody can put any address on a Google account; only a verified one
     * proves they hold it. Without this, signing in as somebody else is a
     * sign-up form away — so it refuses outright rather than falling back to
     * asking for a password, which would be a second chance at the same door.
     */
    if (!r.identity.verified) {
      return fail('That Google account has not confirmed its email address, so it cannot be used to sign in.', 403);
    }

    return completeSignIn(env, r.identity.email, r.identity.name, req, 'google');
  }

  /* ── Sign in ── */
  if (action === 'login') {
    const email = String(d.email ?? '').trim().toLowerCase();
    const password = String(d.password ?? '');
    if (!email || !password) return fail('Enter your email and password.');

    /*
     * Guessing, limited.
     *
     * There was no limit here at all: unlimited guesses at any address,
     * including the install owner's, each one a 100,000-round hash — so it was
     * also the cheapest way to tie up the Worker. Two limits, because they stop
     * different things: per address stops a slow guess at one account from
     * many machines; per network stops one machine trying every account.
     * Only failures count against the address, so a person who types their
     * password right is never locked out by somebody else's guessing beyond
     * the fifteen-minute window.
     */
    const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
    const byIp = await rateLimit(env, { what: 'login-ip', who: ip, max: 30, windowSeconds: 900 });
    if (!byIp.allowed) return fail('Too many sign-in attempts from this network. Wait a few minutes and try again.', 429);
    const failures = await env.DB.prepare('SELECT hits, window_start AS start FROM crm_rate_limits WHERE bucket = ?')
      .bind(`login-fail:${email}`.slice(0, 200)).first<{ hits: number; start: string }>();
    if (failures && failures.hits >= 10 && Date.parse(failures.start) > Date.now() - 900_000) {
      return fail('Too many wrong passwords for this account. Wait 15 minutes, or sign in with an emailed code.', 429);
    }

    const row = await env.DB.prepare(
      'SELECT email, name, role, account_id AS accountId, hash FROM crm_users WHERE email = ?',
    ).bind(email).first<{ email: string; name: string; role: string; accountId: string | null; hash: string }>();

    /* One message for "no such account" and "wrong password" alike: telling
       them apart turns the login form into a way to enumerate who has one. */
    const good = row ? await verifyPassword(password, row.hash) : false;
    if (!row || !good) {
      await rateLimit(env, { what: 'login-fail', who: email, max: 10, windowSeconds: 900 });
      await recordAuthEvent(env, { email, kind: 'login_failed', ip, ua: req.headers.get('User-Agent') ?? '' });
      return fail('Invalid email or password.', 401);
    }

    const held = await secondStep(env, row.email, 'password');
    if (held) return held;

    await sweepSessions(env.DB);
    const token = await issueSession(env, row.email, req, 'password');

    /*
     * Which workspaces are actually theirs.
     *
     * The install owner's `account_id` is NULL by design — they are not bound
     * to one workspace, they own the install. But the client used that field
     * alone to decide where to point the browser, so signing in on a machine
     * with nothing stored pointed at nothing, and the tenancy layer helpfully
     * invented `acct-<timestamp>`. The owner then got an empty workspace while
     * their real one sat under an id that nothing pointed at any more — which
     * is how this deployment's own main account ended up with its data under a
     * browser-generated id.
     *
     * Ordered by most recently written, so a browser with no memory adopts the
     * one that was last being worked in rather than the oldest.
     *
     * The timestamps are compared as text, and SQLite's own `datetime()` writes
     * `2026-09-10 05:16:25` where the app writes `2026-09-10T03:02:05.407Z`.
     * A space sorts before a `T`, so one row written by hand puts the whole
     * ordering out and sends the owner to the wrong workspace. Normalised here
     * rather than trusting every writer to agree.
     */
    const owned = await ownedWorkspaces(env, row.email);

    return json({ success: true, token, user: publicUser(row), workspaces: owned });
  }

  /* ── Agency administration ── */
  const actor = await userFromToken(env.DB, d.token);

  /* ── Owner-only: the Google application itself ────────────────────────── */

  /*
   * One Google application per install, not one per workspace.
   *
   * The consent screen carries a name and a logo, and that is the operator's
   * brand — a sub-account setting up its own would be putting its name on the
   * screen everybody else's customers see. It is also the operator's quota and
   * the operator's obligation if it is abused, which is the same reasoning that
   * keeps the payment processor and the registrar owner-only.
   */
  if (action === 'google_get' || action === 'google_save') {
    if (!actor || actor.accountId !== null || actor.role !== 'agency') {
      return fail('Only the installation owner can set this up.', 403);
    }

    if (action === 'google_save') {
      const r = await saveGoogleCreds(env, {
        clientId: String(d.clientId ?? ''),
        clientSecret: String(d.clientSecret ?? ''),
      });
      if (!r.ok) return fail(r.error);
    }

    const creds = await googleCreds(env);
    const origin = signInOrigin(env, new URL(req.url).origin);
    return json({
      success: true,
      connected: !!creds,
      /* The client id is public by design — it is in every authorize URL — so
         showing it back is safe and saves the owner hunting for which of their
         Google projects this is. The secret never comes back, not even a tail. */
      clientId: creds?.clientId ?? '',
      /* The exact string to paste into the console. Typing it from memory is
         the commonest way this ends up mismatched. */
      redirectUri: redirectUri(origin),
      origin,
    });
  }

  if (action === 'list_users') {
    if (!actor) return fail('Not authorised.', 401);
    /* Every user on the install, to the owner. To anyone else, themselves and
       the logins inside workspaces they own — it used to be every address on
       the install, to any signed-in session. */
    const { results } = isInstallOwner(actor)
      ? await env.DB.prepare(
        'SELECT email, name, role, account_id AS accountId FROM crm_users ORDER BY created_at',
      ).all<{ email: string; name: string; role: string; accountId: string | null }>()
      : await env.DB.prepare(
        `SELECT email, name, role, account_id AS accountId FROM crm_users
          WHERE email = ?1
             OR (role = 'client' AND account_id IN (SELECT account_id FROM crm_workspaces WHERE owner_email = ?1))
          ORDER BY created_at`,
      ).bind(actor.email).all<{ email: string; name: string; role: string; accountId: string | null }>();
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

    /*
     * A user made here belongs to a workspace, always.
     *
     * `d.accountId ?? null` used to be the fallback, and a null `account_id`
     * on an agency row *is* the install owner — so this endpoint would mint a
     * second one for any caller who simply omitted the field. The owner is
     * created once, by `bootstrap`, and never again.
     */
    const accountId = String(d.accountId ?? '').trim();
    if (!accountId) return fail('Choose which workspace this user belongs to.');
    /* The workspace has to be the caller's. `workspaceAccess` is the one place
       that decides that, including claiming a sub-account the agency has just
       opened and holding it to the plan's allowance. */
    const owner = isInstallOwner(actor);
    if (!owner) {
      const access = await workspaceAccess(env.DB, actor, accountId);
      if (!access.ok) return fail(access.message ?? 'That workspace is not yours.', 403);
    }
    /* Only the owner makes agency logins; anyone else is adding a client. */
    if (d.role === 'agency' && !owner) return fail('Only the install owner can add another agency login.', 403);

    await env.DB.prepare(
      'INSERT INTO crm_users (email, name, role, account_id, hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(
      email.toLowerCase(), String(d.name ?? '').slice(0, 120),
      d.role === 'agency' ? 'agency' : 'client', accountId,
      await hashPassword(String(d.password)), nowIso(),
    ).run();
    await recordAuthEvent(env, { email: actor.email, kind: 'user_created', detail: `Added ${email.toLowerCase()} as ${d.role === 'agency' ? 'agency' : 'client'}`, accountId, ...origin(req) });
    return ok();
  }

  if (action === 'set_password') {
    if (!actor) return fail('Not authorised.', 401);
    const email = String(d.email ?? '').trim().toLowerCase();
    const who = await manageable(env, actor, email);
    if (!who.target) return fail('User not found.');
    if (!who.ok) return fail('Not authorised.', 403);
    /* Somebody who owns a workspace sets their own password, and nobody else
       does — the install owner included. Recovery is the emailed code, which
       proves the mailbox; a password set on their behalf would be a way into
       a customer's business that leaves them none the wiser. */
    if (!who.self && await ownsAnyWorkspace(env, email)) {
      return fail('That person manages their own password. They can sign in with an emailed code to reset it.', 403);
    }
    /* Your own password needs your current one, checked here rather than by
       the browser signing in again — a check only the browser makes is a
       check an unlocked laptop can skip. An account that has never had a
       password (code or Google sign-in) has nothing to confirm. */
    if (who.self && who.target.hash) {
      const good = await verifyPassword(String(d.currentPassword ?? ''), who.target.hash);
      if (!good) return fail('Your current password is not right.', 403);
    }
    const problem = passwordProblem(String(d.password ?? ''), '', email);
    if (problem) return fail(problem);
    const res = await env.DB.prepare('UPDATE crm_users SET hash = ? WHERE email = ?')
      .bind(await hashPassword(String(d.password)), email).run();
    if (!res.meta.changes) return fail('User not found.');
    /* Every other session for that account is ended: a password change that
       leaves a stolen session alive has not actually locked anybody out. */
    const [keep, keepRaw] = await sessionKeys(String(d.token ?? ''));
    await env.DB.prepare('DELETE FROM crm_sessions WHERE email = ? AND token NOT IN (?, ?)')
      .bind(email, who.self ? keep : '', who.self ? keepRaw : '').run();
    await recordAuthEvent(env, who.self
      ? { email, kind: 'password_changed', ...origin(req) }
      : { email: actor.email, kind: 'password_reset_by_admin', detail: `Set a new password for ${email}`, accountId: who.target.accountId, ...origin(req) });
    if (!who.self) await recordAuthEvent(env, { email, kind: 'password_reset_by_admin', detail: `Password set by ${actor.email}`, accountId: who.target.accountId, ...origin(req) });
    return ok();
  }

  if (action === 'delete_user') {
    if (actor?.role !== 'agency') return fail('Only an agency account can remove users.', 403);
    const email = String(d.email ?? '').trim().toLowerCase();
    if (email === actor.email) return fail('You cannot remove your own account.');
    const who = await manageable(env, actor, email);
    if (!who.target) return fail('User not found.');
    if (!who.ok) return fail('Not authorised.', 403);
    await env.DB.prepare('DELETE FROM crm_sessions WHERE email = ?').bind(email).run();
    const res = await env.DB.prepare('DELETE FROM crm_users WHERE email = ?').bind(email).run();
    if (res.meta.changes) await recordAuthEvent(env, { email: actor.email, kind: 'user_removed', detail: `Removed ${email}`, accountId: who.target.accountId, ...origin(req) });
    return res.meta.changes ? ok() : fail('User not found.');
  }

  return fail(`"${action}" is not something this endpoint does.`);
}
