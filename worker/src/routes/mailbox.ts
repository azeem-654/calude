/**
 * Each workspace's own mail server.
 *
 * This is the endpoint a customer arriving with their own SMTP details talks
 * to. It saves them on the server, encrypted, so that:
 *
 *   - the password stops travelling with every send,
 *   - clearing a browser no longer loses the mailbox,
 *   - and, most importantly, the server can send on its own — a scheduled
 *     campaign no longer depends on somebody having a tab open.
 *
 * The password is never returned. `get` reports whether one is set and what
 * the last connection test found, which is everything the settings screen
 * needs to show a truthful state without handing the secret back to a browser.
 */
import { addr, body, fail, headerSafe, json, ok } from '../lib/http';
import { canAccess, installSecret, nowIso, userFromToken, type Env } from '../lib/db';
import { decryptSecret, encryptSecret } from '../lib/crypto';
import { smtpVerify, type Encryption } from '../lib/smtp';
import { imapFetch } from '../lib/imap';

const SECRET_KEY = 'mailbox_key';

export interface Mailbox {
  accountId: string;
  smtp: { host: string; port: number; encryption: Encryption; username: string; password: string };
  from: { name: string; email: string; replyTo: string };
  imap: { host: string; port: number; encryption: Encryption; username: string; password: string; folder: string };
  provider: { name: string; key: string; secret: string; domain: string; url: string };
}

interface Row {
  account_id: string;
  smtp_host: string; smtp_port: number; smtp_encryption: string; smtp_username: string; smtp_password: string;
  from_name: string; from_email: string; reply_to: string;
  imap_host: string; imap_port: number; imap_encryption: string; imap_username: string; imap_password: string; imap_folder: string;
  provider: string; provider_key: string; provider_secret: string; provider_domain: string; provider_url: string;
  verified_at: string | null; verified_port: number | null; last_error: string;
}

const encOf = (v: unknown, fallback: Encryption = 'tls'): Encryption =>
  v === 'ssl' ? 'ssl' : v === 'none' ? 'none' : v === 'tls' ? 'tls' : fallback;

const HOST_OK = /^[a-z0-9.\-]+$/i;

/**
 * The account's mailbox, decrypted and ready to use.
 *
 * Exported because the send and receive endpoints resolve credentials through
 * this rather than taking them from the request — that indirection is the
 * whole point of storing them.
 */
export async function loadMailbox(env: Env, accountId: string): Promise<Mailbox | null> {
  const row = await env.DB.prepare('SELECT * FROM crm_mailboxes WHERE account_id = ?')
    .bind(accountId).first<Row>();
  if (!row) return null;

  const key = await installSecret(env.DB, SECRET_KEY);
  return {
    accountId,
    smtp: {
      host: row.smtp_host, port: row.smtp_port, encryption: encOf(row.smtp_encryption),
      username: row.smtp_username, password: await decryptSecret(key, row.smtp_password),
    },
    from: { name: row.from_name, email: row.from_email, replyTo: row.reply_to },
    imap: {
      host: row.imap_host, port: row.imap_port, encryption: encOf(row.imap_encryption, 'ssl'),
      username: row.imap_username, password: await decryptSecret(key, row.imap_password),
      folder: row.imap_folder || 'INBOX',
    },
    provider: {
      name: row.provider || 'smtp',
      key: await decryptSecret(key, row.provider_key),
      secret: await decryptSecret(key, row.provider_secret),
      domain: row.provider_domain,
      url: row.provider_url,
    },
  };
}

/** What the settings screen is allowed to see: everything except the secrets. */
function redact(row: Row): Record<string, unknown> {
  return {
    accountId: row.account_id,
    smtp: {
      host: row.smtp_host, port: row.smtp_port, encryption: row.smtp_encryption,
      username: row.smtp_username,
      /* Not the password — only whether there is one. A settings form can show
         "••••••" and leave it alone; sending the real thing back to a browser
         would undo the reason it moved to the server. */
      hasPassword: !!row.smtp_password,
    },
    from: { name: row.from_name, email: row.from_email, replyTo: row.reply_to },
    imap: {
      host: row.imap_host, port: row.imap_port, encryption: row.imap_encryption,
      username: row.imap_username, folder: row.imap_folder, hasPassword: !!row.imap_password,
    },
    provider: {
      name: row.provider, domain: row.provider_domain, url: row.provider_url,
      hasKey: !!row.provider_key, hasSecret: !!row.provider_secret,
    },
    verifiedAt: row.verified_at,
    verifiedPort: row.verified_port,
    lastError: row.last_error,
  };
}

interface SaveBody {
  token?: string;
  action?: string;
  accountId?: string;
  smtp?: { host?: string; port?: number; encryption?: string; username?: string; password?: string };
  from?: { name?: string; email?: string; replyTo?: string };
  imap?: { host?: string; port?: number; encryption?: string; username?: string; password?: string; folder?: string };
  provider?: { name?: string; key?: string; secret?: string; domain?: string; url?: string };
}

export async function handleMailbox(req: Request, env: Env): Promise<Response> {
  const d = await body<SaveBody>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });

  const accountId = String(d.accountId ?? '').trim();
  if (!/^[A-Za-z0-9_.\-]{1,64}$/.test(accountId)) return fail('A valid workspace is required.');
  if (!canAccess(user, accountId)) return fail('That workspace is not yours.', 403);

  const key = await installSecret(env.DB, SECRET_KEY);

  /* ── Read it back, without the secrets ── */
  if (d.action === 'get') {
    const row = await env.DB.prepare('SELECT * FROM crm_mailboxes WHERE account_id = ?').bind(accountId).first<Row>();
    return json({ success: true, mailbox: row ? redact(row) : null });
  }

  if (d.action === 'delete') {
    await env.DB.prepare('DELETE FROM crm_mailboxes WHERE account_id = ?').bind(accountId).run();
    return ok();
  }

  /* ── Save ── */
  if (d.action === 'save') {
    const smtp = d.smtp ?? {};
    const host = String(smtp.host ?? '').trim();
    if (host && !HOST_OK.test(host)) return fail(`"${host}" is not a valid mail server name.`);

    const fromEmail = String(d.from?.email ?? '').trim();
    if (fromEmail && !addr(fromEmail)) return fail(`"${fromEmail}" is not a valid sending address.`);
    const replyTo = String(d.from?.replyTo ?? '').trim();
    if (replyTo && !addr(replyTo)) return fail(`"${replyTo}" is not a valid reply-to address.`);

    const imap = d.imap ?? {};
    const imapHost = String(imap.host ?? '').trim();
    if (imapHost && !HOST_OK.test(imapHost)) return fail(`"${imapHost}" is not a valid mailbox host.`);

    const existing = await env.DB.prepare('SELECT * FROM crm_mailboxes WHERE account_id = ?').bind(accountId).first<Row>();

    /**
     * An omitted password means "leave the one you have", not "clear it".
     *
     * The settings form shows dots rather than the real password — it cannot
     * send back what it was never given — so treating a blank field as a
     * deliberate erasure would wipe a working mailbox every time somebody
     * edited the port number.
     */
    const keepOrSet = async (given: unknown, current: string | undefined): Promise<string> => {
      const v = typeof given === 'string' ? given : '';
      if (v === '') return current ?? '';
      return encryptSecret(key, v);
    };

    const prov = d.provider ?? {};
    await env.DB.prepare(
      `INSERT INTO crm_mailboxes (
         account_id, smtp_host, smtp_port, smtp_encryption, smtp_username, smtp_password,
         from_name, from_email, reply_to,
         imap_host, imap_port, imap_encryption, imap_username, imap_password, imap_folder,
         provider, provider_key, provider_secret, provider_domain, provider_url,
         verified_at, verified_port, last_error, updated_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(account_id) DO UPDATE SET
         smtp_host=excluded.smtp_host, smtp_port=excluded.smtp_port,
         smtp_encryption=excluded.smtp_encryption, smtp_username=excluded.smtp_username,
         smtp_password=excluded.smtp_password,
         from_name=excluded.from_name, from_email=excluded.from_email, reply_to=excluded.reply_to,
         imap_host=excluded.imap_host, imap_port=excluded.imap_port,
         imap_encryption=excluded.imap_encryption, imap_username=excluded.imap_username,
         imap_password=excluded.imap_password, imap_folder=excluded.imap_folder,
         provider=excluded.provider, provider_key=excluded.provider_key,
         provider_secret=excluded.provider_secret, provider_domain=excluded.provider_domain,
         provider_url=excluded.provider_url,
         updated_at=excluded.updated_at`,
    ).bind(
      accountId,
      host, Number(smtp.port) || 587, encOf(smtp.encryption), String(smtp.username ?? '').trim(),
      await keepOrSet(smtp.password, existing?.smtp_password),
      headerSafe(d.from?.name, 120), fromEmail, replyTo,
      imapHost, Number(imap.port) || 993, encOf(imap.encryption, 'ssl'), String(imap.username ?? '').trim(),
      await keepOrSet(imap.password, existing?.imap_password),
      String(imap.folder ?? 'INBOX').slice(0, 64) || 'INBOX',
      String(prov.name ?? 'smtp').toLowerCase().slice(0, 32) || 'smtp',
      await keepOrSet(prov.key, existing?.provider_key),
      await keepOrSet(prov.secret, existing?.provider_secret),
      String(prov.domain ?? '').trim().slice(0, 253),
      String(prov.url ?? '').trim().slice(0, 253),
      existing?.verified_at ?? null, existing?.verified_port ?? null, existing?.last_error ?? '',
      nowIso(),
    ).run();

    const row = await env.DB.prepare('SELECT * FROM crm_mailboxes WHERE account_id = ?').bind(accountId).first<Row>();
    return json({ success: true, mailbox: row ? redact(row) : null });
  }

  /* ── Prove it works, and remember the answer ── */
  if (d.action === 'test' || d.action === 'test_imap') {
    const mb = await loadMailbox(env, accountId);
    if (!mb) return fail('Save your mail server details first, then test them.');

    if (d.action === 'test_imap') {
      if (!mb.imap.host || !mb.imap.username) {
        return fail('Add your incoming mail server (IMAP) details first — host and username at least.');
      }
      const r = await imapFetch({ ...mb.imap, folder: mb.imap.folder }, 1);
      await env.DB.prepare('UPDATE crm_mailboxes SET last_error = ?, updated_at = ? WHERE account_id = ?')
        .bind(r.ok ? '' : r.error, nowIso(), accountId).run();
      return json({
        success: r.ok,
        message: r.ok
          ? `Connected to ${mb.imap.host} and opened ${mb.imap.folder}. Replies will appear in Conversations.`
          : r.error,
        error: r.ok ? undefined : r.error,
      });
    }

    if (!mb.smtp.host) return fail('Add your outgoing mail server (SMTP) host first.');
    if (mb.smtp.username && !mb.smtp.password) {
      return fail('The saved password could not be read back. Enter it again and save.');
    }

    const r = await smtpVerify(mb.smtp);
    await env.DB.prepare('UPDATE crm_mailboxes SET verified_at = ?, verified_port = ?, last_error = ?, updated_at = ? WHERE account_id = ?')
      .bind(r.ok ? nowIso() : null, r.ok ? (r.port ?? null) : null, r.ok ? '' : r.error, nowIso(), accountId).run();

    return json({
      success: r.ok, port: r.port, attempts: r.attempts,
      message: r.ok
        ? `Signed in to ${mb.smtp.host}:${r.port} successfully. This workspace can send mail.`
        : r.error,
      error: r.ok ? undefined : r.error,
    });
  }

  return fail(`"${d.action ?? ''}" is not something this endpoint does.`);
}
