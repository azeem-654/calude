/**
 * Sign-in, sign-up and the small amount of user administration an agency does.
 *
 * A port of auth.php, minus two things that belonged to shared hosting and
 * should not survive the move: a hardcoded demo login, and the instruction on
 * the login screen to "delete api/data/users.php on your host" to recover a
 * locked-out account. Neither has a meaning here.
 */
import { addr, body, fail, json, ok } from '../lib/http';
import { hashPassword, newToken, timingSafeEqual, verifyPassword } from '../lib/crypto';
import { hasAnyUser, hasInstallOwner, nowIso, sweepSessions, userFromToken, type Env, type SessionUser } from '../lib/db';

const SESSION_DAYS = 30;

interface AuthBody {
  action?: string;
  /** The six digits from a sign-in email. */
  code?: string;
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

  /* ── Sign in with a code, no password ─────────────────────────────────── */

  /*
   * ── Why this and not "Sign in with Google" ──
   *
   * Google's own rule: an app in Production publishing status requires OAuth
   * verification, and an unverified one carries a permanent hundred-user
   * lifetime cap that cannot be reset. Review takes weeks. Facebook wants App
   * Review and business verification; Apple wants a paid developer account.
   *
   * A code emailed to whatever address somebody typed needs none of that — no
   * third-party account, no client id, no consent screen, no cap — and it works
   * for a Gmail address, an Outlook one, or their own domain, which a Google
   * button does not.
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

    let user = await env.DB.prepare(
      'SELECT email, name, role, account_id AS accountId FROM crm_users WHERE email = ?',
    ).bind(email).first<{ email: string; name: string; role: string; accountId: string | null }>();

    /*
     * A first-time address becomes an account here.
     *
     * The code proves they hold the mailbox, which is the same thing a password
     * reset proves and more than a password proves on its own. Refusing them
     * and sending them to a sign-up form to type the address again would be
     * ceremony, not security.
     *
     * `hasInstallOwner` still governs who owns the install: this creates an
     * ordinary workspace-owning account, never a second owner.
     */
    if (!user) {
      const accountId = crypto.randomUUID();
      const name = email.split('@')[0];
      await env.DB.prepare(
        'INSERT INTO crm_users (email, name, role, account_id, hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).bind(email, name, 'agency', accountId, '', nowIso()).run();
      await env.DB.prepare(
        'INSERT OR IGNORE INTO crm_workspaces (account_id, owner_email, created_at) VALUES (?, ?, ?)',
      ).bind(accountId, email, nowIso()).run();
      user = { email: email, name, role: 'agency', accountId };
    }

    await sweepSessions(env.DB);
    const token = await issueSession(env, user.email);

    const { results: owned } = await env.DB.prepare(
      `SELECT w.account_id AS accountId,
              REPLACE(COALESCE((SELECT MAX(dd.updated_at) FROM crm_data dd WHERE dd.account_id = w.account_id), w.created_at), ' ', 'T') AS lastUsed
       FROM crm_workspaces w WHERE w.owner_email = ? ORDER BY lastUsed DESC LIMIT 50`,
    ).bind(user.email).all<{ accountId: string; lastUsed: string }>();

    return json({ success: true, token, user: publicUser(user), workspaces: owned ?? [] });
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
    const { results: owned } = await env.DB.prepare(
      `SELECT w.account_id AS accountId,
              REPLACE(COALESCE((SELECT MAX(d.updated_at) FROM crm_data d WHERE d.account_id = w.account_id), w.created_at), ' ', 'T') AS lastUsed
       FROM crm_workspaces w
       WHERE w.owner_email = ?
       ORDER BY lastUsed DESC
       LIMIT 50`,
    ).bind(row.email).all<{ accountId: string; lastUsed: string }>();

    return json({ success: true, token, user: publicUser(row), workspaces: owned ?? [] });
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

    await env.DB.prepare(
      'INSERT INTO crm_users (email, name, role, account_id, hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(
      email.toLowerCase(), String(d.name ?? '').slice(0, 120),
      d.role === 'agency' ? 'agency' : 'client', accountId,
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
