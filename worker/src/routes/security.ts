/**
 * Settings → Security & Privacy: what a person can see and control about
 * their own account and the workspace they are in.
 *
 * Everything here answers about the caller, or about a workspace the caller
 * may open (`workspaceAccess`) — never about anyone else. Integrations are
 * reported as connected or not, never with a credential or a tail of one.
 *
 *   overview          account status, signed-in devices, recent activity,
 *                     workspace members, what is connected, what AI receives
 *   revoke_session    sign one device out
 *   revoke_others     sign every other device out
 *   mfa_begin         a new authenticator secret, not yet switched on
 *   mfa_enable        switch it on with a code that proves the app has it
 *   mfa_disable       switch it off, with a current code or the password
 *   export            the workspace's data as JSON, without credentials
 *   delete_account    close the caller's own account and every workspace it owns
 */
import { body, fail, json, ok } from '../lib/http';
import {
  canAccess, installSecret, nowIso, sessionKeys, userFromToken, type Env, type SessionUser,
} from '../lib/db';
import { decryptSecret, encryptSecret, verifyPassword } from '../lib/crypto';
import { newTotpSecret, otpauthUrl, verifyTotp } from '../lib/totp';
import { origin, recordAuthEvent } from '../lib/audit';
import { closeWorkspace } from '../lib/closeWorkspace';

interface SecBody {
  token?: string;
  action?: string;
  accountId?: string;
  id?: string;
  code?: string;
  password?: string;
  confirm?: string;
}

const SECRET_KEY = 'mailbox_key';
const isOwner = (u: SessionUser) => u.role === 'agency' && !u.accountId;

/** "Chrome on Windows" from a user-agent string. Enough to recognise a device. */
function device(ua: string): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'A browser';
  const os = /iPhone|iPad/.test(ua) ? 'iPhone or iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'an unknown system';
  return `${browser} on ${os}`;
}

/* The network, not the address: enough to tell "my office" from "somewhere
   else", without the list becoming a precise location record. */
const network = (ip: string) => {
  if (!ip) return '';
  if (ip.includes(':')) return `${ip.split(':').slice(0, 3).join(':')}:…`;
  const p = ip.split('.');
  return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.x` : ip;
};

async function sid(stored: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`sid:${stored}`));
  return [...new Uint8Array(buf)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function one<T>(env: Env, sql: string, ...args: unknown[]): Promise<T | null> {
  try { return await env.DB.prepare(sql).bind(...args).first<T>(); } catch { return null; }
}

export async function handleSecurity(req: Request, env: Env): Promise<Response> {
  const d = await body<SecBody>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });
  const action = String(d.action ?? '');
  const where = origin(req);

  /* ── What the page shows ── */
  if (action === 'overview') {
    const me = await one<{ hash: string; totp: string | null; verified: string | null; created: string }>(env,
      'SELECT hash, totp_enabled_at AS totp, email_verified_at AS verified, created_at AS created FROM crm_users WHERE email = ?', user.email);
    const [current] = await sessionKeys(String(d.token));
    const { results: rows } = await env.DB.prepare(
      'SELECT token, ip, ua, method, created_at AS createdAt, last_seen_at AS lastSeenAt FROM crm_sessions WHERE email = ? AND expires_at > ? ORDER BY COALESCE(last_seen_at, created_at) DESC LIMIT 20',
    ).bind(user.email, Math.floor(Date.now() / 1000)).all<{ token: string; ip: string; ua: string; method: string; createdAt: string; lastSeenAt: string | null }>();
    const sessions = await Promise.all((rows ?? []).map(async r => ({
      id: await sid(r.token),
      current: r.token === current || r.token === String(d.token),
      device: device(r.ua ?? ''),
      network: network(r.ip ?? ''),
      method: r.method || 'password',
      createdAt: r.createdAt,
      lastSeenAt: r.lastSeenAt ?? r.createdAt,
    })));

    const { results: ev } = await env.DB.prepare(
      'SELECT at, kind, detail, ip, ua FROM crm_audit_events WHERE actor_email = ? ORDER BY at DESC LIMIT 40',
    ).bind(user.email).all<{ at: string; kind: string; detail: string; ip: string; ua: string }>()
      .catch(() => ({ results: [] as { at: string; kind: string; detail: string; ip: string; ua: string }[] }));
    const events = (ev ?? []).map(e => ({ at: e.at, kind: e.kind, detail: e.detail, device: device(e.ua), network: network(e.ip) }));

    /* The workspace the caller is looking at, if they may. */
    const acct = String(d.accountId ?? '').trim();
    let workspace: Record<string, unknown> | null = null;
    if (acct && await canAccess(env.DB, user, acct)) {
      const ownerRow = await one<{ owner: string }>(env, 'SELECT owner_email AS owner FROM crm_workspaces WHERE account_id = ?', acct);
      const { results: clients } = await env.DB.prepare(
        "SELECT email, name, role FROM crm_users WHERE account_id = ? AND role = 'client' ORDER BY created_at",
      ).bind(acct).all<{ email: string; name: string; role: string }>();
      const members = [
        ...(ownerRow?.owner ? [{ email: ownerRow.owner, role: 'Owner' }] : []),
        ...(clients ?? []).map(c => ({ email: c.email, role: 'Member' })),
      ];
      const count = async (sql: string) => Number((await one<{ n: number }>(env, sql, acct))?.n ?? 0);
      const integrations = [
        { key: 'mailbox', label: 'Mailboxes', connected: await count('SELECT COUNT(*) AS n FROM crm_mailbox_accounts WHERE account_id = ?') },
        { key: 'payments', label: 'Payments for your shop', connected: await count("SELECT COUNT(*) AS n FROM crm_storefront WHERE account_id = ? AND (COALESCE(stripe_key,'') != '' OR COALESCE(api_key,'') != '')") },
        { key: 'calendar', label: 'Google Calendar', connected: await count("SELECT COUNT(*) AS n FROM crm_calendar_connections WHERE account_id = ? AND COALESCE(refresh_token,'') != ''") },
        { key: 'sms', label: 'SMS', connected: await count("SELECT COUNT(*) AS n FROM crm_sms_config WHERE account_id = ? AND COALESCE(auth_token,'') != ''") },
        { key: 'wordpress', label: 'WordPress publishing', connected: await count('SELECT COUNT(*) AS n FROM crm_publish_targets WHERE account_id = ?') },
        { key: 'supplier', label: 'Product supplier', connected: await count("SELECT COUNT(*) AS n FROM crm_suppliers WHERE account_id = ? AND COALESCE(credentials,'') != ''") },
        { key: 'ai', label: 'Your own AI key', connected: await count("SELECT COUNT(*) AS n FROM crm_ai_config WHERE account_id = ? AND COALESCE(api_key,'') != ''") },
      ];
      workspace = {
        accountId: acct,
        yourRole: ownerRow?.owner === user.email ? 'Owner' : isOwner(user) ? 'Install owner' : user.role === 'client' ? 'Member' : 'Owner',
        members,
        integrations,
      };
    }

    return json({
      success: true,
      account: {
        email: user.email,
        name: user.name,
        isInstallOwner: isOwner(user),
        passwordSet: !!me?.hash,
        mfaEnabled: !!me?.totp,
        emailVerified: !!me?.verified,
        createdAt: me?.created ?? '',
      },
      sessions,
      events,
      workspace,
      /* Said by the server so the page cannot drift from what is true. */
      supportAccess: {
        enabled: false,
        note: 'Protected Central has no support login and no way to open your workspace as you. If we ever add one, it will be off until you switch it on here, time-limited, and every use will appear in your activity log.',
      },
    });
  }

  /* ── Signing devices out ── */
  if (action === 'revoke_session') {
    const target = String(d.id ?? '');
    const { results } = await env.DB.prepare('SELECT token FROM crm_sessions WHERE email = ?').bind(user.email).all<{ token: string }>();
    for (const r of results ?? []) {
      if (await sid(r.token) === target) {
        await env.DB.prepare('DELETE FROM crm_sessions WHERE token = ? AND email = ?').bind(r.token, user.email).run();
        await recordAuthEvent(env, { email: user.email, kind: 'session_revoked', detail: 'Signed out one device', ...where });
        return ok();
      }
    }
    return fail('That device is no longer signed in.');
  }

  if (action === 'revoke_others') {
    const [h, raw] = await sessionKeys(String(d.token));
    const r = await env.DB.prepare('DELETE FROM crm_sessions WHERE email = ? AND token NOT IN (?, ?)').bind(user.email, h, raw).run();
    await recordAuthEvent(env, { email: user.email, kind: 'sessions_revoked', detail: `Signed out ${r.meta.changes ?? 0} other device(s)`, ...where });
    return json({ success: true, ended: r.meta.changes ?? 0 });
  }

  /* ── 2-step sign-in ── */
  if (action === 'mfa_begin') {
    const secret = newTotpSecret();
    const sealed = await encryptSecret(await installSecret(env.DB, SECRET_KEY), secret);
    /* Stored but not switched on: `totp_enabled_at` stays as it was. A person
       who closes the page half way keeps signing in exactly as before. */
    await env.DB.prepare('UPDATE crm_users SET totp_secret = ? WHERE email = ? AND totp_enabled_at IS NULL').bind(sealed, user.email).run();
    const on = await one<{ enabled: string | null }>(env, 'SELECT totp_enabled_at AS enabled FROM crm_users WHERE email = ?', user.email);
    if (on?.enabled) return fail('2-step sign-in is already on. Switch it off first to move it to a new phone.');
    return json({ success: true, secret, url: otpauthUrl(secret, user.email) });
  }

  if (action === 'mfa_enable') {
    const row = await one<{ secret: string; enabled: string | null }>(env, 'SELECT totp_secret AS secret, totp_enabled_at AS enabled FROM crm_users WHERE email = ?', user.email);
    if (!row?.secret) return fail('Start the set-up again — there is no code waiting to be confirmed.');
    if (row.enabled) return ok({ message: '2-step sign-in is already on.' });
    const secret = await decryptSecret(await installSecret(env.DB, SECRET_KEY), row.secret).catch(() => '');
    if (!(await verifyTotp(secret, String(d.code ?? '')))) return fail('That code is not right. Enter the newest one your app shows.');
    await env.DB.prepare('UPDATE crm_users SET totp_enabled_at = ? WHERE email = ?').bind(nowIso(), user.email).run();
    await recordAuthEvent(env, { email: user.email, kind: 'mfa_enabled', detail: '2-step sign-in switched on', ...where });
    return ok({ message: '2-step sign-in is on. You will be asked for a code each time you sign in.' });
  }

  if (action === 'mfa_disable') {
    const row = await one<{ secret: string; hash: string; enabled: string | null }>(env, 'SELECT totp_secret AS secret, hash, totp_enabled_at AS enabled FROM crm_users WHERE email = ?', user.email);
    if (!row?.enabled) return ok({ message: '2-step sign-in was already off.' });
    const secret = await decryptSecret(await installSecret(env.DB, SECRET_KEY), row.secret).catch(() => '');
    const byCode = await verifyTotp(secret, String(d.code ?? ''));
    const byPassword = !byCode && !!row.hash && await verifyPassword(String(d.password ?? ''), row.hash);
    if (!byCode && !byPassword) return fail('Enter a current code from your app (or your password) to switch this off.', 403);
    await env.DB.prepare("UPDATE crm_users SET totp_enabled_at = NULL, totp_secret = '' WHERE email = ?").bind(user.email).run();
    await recordAuthEvent(env, { email: user.email, kind: 'mfa_disabled', detail: '2-step sign-in switched off', ...where });
    return ok({ message: '2-step sign-in is off.' });
  }

  /* ── Your data ── */
  if (action === 'export') {
    const acct = String(d.accountId ?? '').trim();
    if (!acct || !(await canAccess(env.DB, user, acct))) return fail('That workspace is not yours.', 403);
    /* Everything the customer made, and none of what they connected: the
       credential tables are left out entirely rather than filtered, so a new
       secret column can never slip into an export. */
    const tables = ['crm_projects', 'crm_portfolios', 'crm_project_workflows', 'crm_products', 'crm_orders', 'crm_tickets',
      'crm_ticket_messages', 'crm_forms', 'crm_form_submissions', 'crm_bookings', 'crm_shops', 'crm_agent_runs'];
    const out: Record<string, unknown> = { exportedAt: nowIso(), workspace: acct };
    const { results: blob } = await env.DB.prepare('SELECT k, v FROM crm_data WHERE account_id = ?').bind(acct).all<{ k: string; v: string }>();
    const data: Record<string, unknown> = {};
    for (const r of blob ?? []) {
      if (/password|secret|api_?key|token/i.test(r.k)) continue;
      try { data[r.k] = JSON.parse(r.v); } catch { data[r.k] = r.v; }
    }
    out.data = data;
    for (const t of tables) {
      try {
        const { results } = await env.DB.prepare(`SELECT * FROM ${t} WHERE account_id = ? LIMIT 20000`).bind(acct).all();
        out[t.replace(/^crm_/, '')] = results ?? [];
      } catch { /* a table this install does not have */ }
    }
    await recordAuthEvent(env, { email: user.email, kind: 'data_exported', accountId: acct, detail: 'Exported workspace data', ...where });
    return json({ success: true, export: out });
  }

  if (action === 'delete_account') {
    if (isOwner(user)) return fail('The install owner account cannot be deleted from here — it runs the platform for everyone else.', 403);
    if (String(d.confirm ?? '') !== 'DELETE') return fail('Type DELETE to confirm.');
    const row = await one<{ hash: string; totp: string | null; secret: string }>(env, 'SELECT hash, totp_enabled_at AS totp, totp_secret AS secret FROM crm_users WHERE email = ?', user.email);
    if (row?.hash && !(await verifyPassword(String(d.password ?? ''), row.hash))) return fail('Your password is not right.', 403);
    if (row?.totp) {
      const secret = await decryptSecret(await installSecret(env.DB, SECRET_KEY), row.secret).catch(() => '');
      if (!(await verifyTotp(secret, String(d.code ?? '')))) return fail('Enter a current code from your authenticator app.', 403);
    }
    if (user.role === 'client') {
      /* A member leaves; the workspace belongs to somebody else and stays. */
      await env.DB.batch([
        env.DB.prepare('DELETE FROM crm_sessions WHERE email = ?').bind(user.email),
        env.DB.prepare('DELETE FROM crm_users WHERE email = ?').bind(user.email),
      ]);
    } else {
      const { results } = await env.DB.prepare('SELECT account_id AS id FROM crm_workspaces WHERE owner_email = ?').bind(user.email).all<{ id: string }>();
      for (const w of results ?? []) await closeWorkspace(env, w.id);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM crm_sessions WHERE email = ?').bind(user.email),
        env.DB.prepare('DELETE FROM crm_users WHERE email = ?').bind(user.email),
      ]);
    }
    await recordAuthEvent(env, { email: user.email, kind: 'account_deleted', detail: 'Deleted their account and its workspaces', ...where });
    return ok({ message: 'Your account has been deleted.' });
  }

  return fail(`"${action}" is not something this endpoint does.`);
}
