/**
 * A workspace's mail servers — more than one of them.
 *
 * This is the endpoint a customer arriving with their own SMTP details talks
 * to. It saves them on the server, encrypted, so that:
 *
 *   - the password stops travelling with every send,
 *   - clearing a browser no longer loses the mailbox,
 *   - and, most importantly, the server can send on its own — a scheduled
 *     campaign no longer depends on somebody having a tab open.
 *
 * Until 0007 there was exactly one mailbox per workspace, because the table was
 * keyed `account_id PRIMARY KEY`. A support address and a sales address could
 * not both exist. They can now, and the two directions are tested and recorded
 * separately: sending through Resend while receiving over IMAP somewhere else
 * is ordinary, and either half can break on its own.
 *
 * Passwords are never returned. `list` reports whether one is set and what the
 * last test found, which is everything a settings screen needs to show a
 * truthful state without handing the secret back to a browser.
 */
import { addr, body, fail, headerSafe, json } from '../lib/http';
import { canAccess, installSecret, nowIso, userFromToken, type Env } from '../lib/db';
import { decryptSecret, encryptSecret } from '../lib/crypto';
import { smtpVerify, type Encryption } from '../lib/smtp';
import { imapFetch } from '../lib/imap';
import { diagnose } from '../lib/mailDiagnosis';

const SECRET_KEY = 'mailbox_key';

export interface Mailbox {
  id: string;
  accountId: string;
  label: string;
  isPrimary: boolean;
  smtp: { host: string; port: number; encryption: Encryption; username: string; password: string };
  from: { name: string; email: string; replyTo: string };
  imap: { host: string; port: number; encryption: Encryption; username: string; password: string; folder: string };
  provider: { name: string; key: string; secret: string; domain: string; url: string };
}

interface Row {
  id: string;
  account_id: string;
  label: string;
  is_primary: number;
  smtp_host: string; smtp_port: number; smtp_encryption: string; smtp_username: string; smtp_password: string;
  from_name: string; from_email: string; reply_to: string;
  imap_host: string; imap_port: number; imap_encryption: string; imap_username: string; imap_password: string; imap_folder: string;
  provider: string; provider_key: string; provider_secret: string; provider_domain: string; provider_url: string;
  out_verified_at: string | null; out_verified_port: number | null; out_last_error: string;
  in_verified_at: string | null; in_last_error: string;
  created_at: string; updated_at: string;
}

const encOf = (v: unknown, fallback: Encryption = 'tls'): Encryption =>
  v === 'ssl' ? 'ssl' : v === 'none' ? 'none' : v === 'tls' ? 'tls' : fallback;

const HOST_OK = /^[a-z0-9.\-]+$/i;

const TABLE = 'crm_mailbox_accounts';

/** Turn a row into the decrypted, ready-to-use shape. */
async function hydrate(env: Env, row: Row): Promise<Mailbox> {
  const key = await installSecret(env.DB, SECRET_KEY);
  return {
    id: row.id,
    accountId: row.account_id,
    label: row.label,
    isPrimary: !!row.is_primary,
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

/**
 * The workspace's sending mailbox, decrypted and ready to use.
 *
 * The signature is unchanged from when a workspace had exactly one mailbox, so
 * `smtpSend`, `misc` and the cron in `scheduled.ts` did not have to learn about
 * any of this. What changed is which row it means: the one marked primary.
 *
 * `ORDER BY is_primary DESC` rather than a bare `WHERE is_primary = 1`, so a
 * workspace whose primary flag was somehow lost still sends from *something*
 * instead of silently stopping.
 */
export async function loadMailbox(env: Env, accountId: string): Promise<Mailbox | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM ${TABLE} WHERE account_id = ? ORDER BY is_primary DESC, created_at ASC LIMIT 1`,
  ).bind(accountId).first<Row>();
  return row ? hydrate(env, row) : null;
}

/** One named mailbox — what the unified inbox uses to sync each connection. */
export async function loadMailboxById(env: Env, accountId: string, id: string): Promise<Mailbox | null> {
  const row = await env.DB.prepare(`SELECT * FROM ${TABLE} WHERE account_id = ? AND id = ?`)
    .bind(accountId, id).first<Row>();
  return row ? hydrate(env, row) : null;
}

/** Every mailbox a workspace can receive on. */
export async function loadMailboxes(env: Env, accountId: string): Promise<Mailbox[]> {
  const rows = await env.DB.prepare(
    `SELECT * FROM ${TABLE} WHERE account_id = ? ORDER BY is_primary DESC, created_at ASC`,
  ).bind(accountId).all<Row>();
  return Promise.all((rows.results ?? []).map(r => hydrate(env, r)));
}

/** What the settings screen is allowed to see: everything except the secrets. */
function redact(row: Row): Record<string, unknown> {
  return {
    id: row.id,
    accountId: row.account_id,
    label: row.label,
    isPrimary: !!row.is_primary,
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
    /* Two directions, two answers. A single "verified" could not say whether
       this mailbox can send, receive, both or neither. */
    outgoing: {
      verifiedAt: row.out_verified_at,
      verifiedPort: row.out_verified_port,
      lastError: row.out_last_error,
    },
    incoming: {
      verifiedAt: row.in_verified_at,
      lastError: row.in_last_error,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface SaveBody {
  token?: string;
  action?: string;
  accountId?: string;
  /** Which mailbox. Absent on `save` means "make a new one". */
  id?: string;
  label?: string;
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
  if (!(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours.', 403);

  const key = await installSecret(env.DB, SECRET_KEY);
  const listAll = async () => {
    const rows = await env.DB.prepare(
      `SELECT * FROM ${TABLE} WHERE account_id = ? ORDER BY is_primary DESC, created_at ASC`,
    ).bind(accountId).all<Row>();
    return (rows.results ?? []).map(redact);
  };

  /* ── Read them back, without the secrets ── */
  if (d.action === 'list') {
    return json({ success: true, mailboxes: await listAll() });
  }

  /*
   * `get` predates multiple mailboxes and answers with the primary.
   *
   * Kept because the existing settings wizard still calls it, and a deploy
   * publishes the Worker before anybody reloads the page — an endpoint that
   * stopped answering would break the screen for everyone mid-deploy.
   */
  if (d.action === 'get') {
    const row = await env.DB.prepare(
      `SELECT * FROM ${TABLE} WHERE account_id = ? ORDER BY is_primary DESC, created_at ASC LIMIT 1`,
    ).bind(accountId).first<Row>();
    return json({ success: true, mailbox: row ? redact(row) : null });
  }

  if (d.action === 'delete') {
    const id = String(d.id ?? '').trim();
    if (!id) return fail('Which mailbox?');
    await env.DB.prepare(`DELETE FROM ${TABLE} WHERE account_id = ? AND id = ?`).bind(accountId, id).run();
    /* Deleting the primary must not leave a workspace unable to send. The
       oldest survivor takes over rather than nothing doing so. */
    const stillPrimary = await env.DB.prepare(
      `SELECT 1 AS n FROM ${TABLE} WHERE account_id = ? AND is_primary = 1`,
    ).bind(accountId).first();
    if (!stillPrimary) {
      const next = await env.DB.prepare(
        `SELECT id FROM ${TABLE} WHERE account_id = ? ORDER BY created_at ASC LIMIT 1`,
      ).bind(accountId).first<{ id: string }>();
      if (next) {
        await env.DB.prepare(`UPDATE ${TABLE} SET is_primary = 1, updated_at = ? WHERE id = ?`)
          .bind(nowIso(), next.id).run();
      }
    }
    return json({ success: true, mailboxes: await listAll() });
  }

  if (d.action === 'set_primary') {
    const id = String(d.id ?? '').trim();
    if (!id) return fail('Which mailbox?');
    const mine = await env.DB.prepare(`SELECT 1 AS n FROM ${TABLE} WHERE account_id = ? AND id = ?`)
      .bind(accountId, id).first();
    if (!mine) return fail('That mailbox is not in this workspace.');
    /* Cleared first, then set. The partial unique index in 0007 refuses two
       primaries per workspace, so doing it the other way round fails. */
    await env.DB.batch([
      env.DB.prepare(`UPDATE ${TABLE} SET is_primary = 0, updated_at = ? WHERE account_id = ?`).bind(nowIso(), accountId),
      env.DB.prepare(`UPDATE ${TABLE} SET is_primary = 1, updated_at = ? WHERE id = ?`).bind(nowIso(), id),
    ]);
    return json({ success: true, mailboxes: await listAll() });
  }

  /* ── Save one ── */
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

    const wantedId = String(d.id ?? '').trim();
    const existing = wantedId
      ? await env.DB.prepare(`SELECT * FROM ${TABLE} WHERE account_id = ? AND id = ?`)
          .bind(accountId, wantedId).first<Row>()
      : null;
    if (wantedId && !existing) return fail('That mailbox is not in this workspace.');

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
    const now = nowIso();
    const id = existing?.id ?? `mb-${crypto.randomUUID()}`;

    /* The first mailbox in a workspace is its primary — otherwise a customer
       would connect one, and nothing would send until they noticed a flag they
       had no reason to look for. */
    const anyExisting = await env.DB.prepare(`SELECT 1 AS n FROM ${TABLE} WHERE account_id = ? LIMIT 1`)
      .bind(accountId).first();
    const isPrimary = existing ? existing.is_primary : (anyExisting ? 0 : 1);

    /*
     * Changing what a connection *is* makes its last test meaningless.
     *
     * Carrying a green "verified" tick across a host or password edit shows a
     * state somebody would trust and then discover at send time. So the result
     * is cleared — but only for the direction that actually changed, and only
     * when a connection field moved. Renaming a mailbox, or fixing the outgoing
     * password, must not throw away a perfectly good incoming result: that
     * would be a lie in the other direction, and it trains people to ignore the
     * badge.
     *
     * A supplied password always counts as a change. The form sends an empty
     * string to mean "keep the stored one", so a non-empty value is somebody
     * deliberately typing a new one.
     */
    const smtpPort = Number(smtp.port) || 587;
    const imapPort = Number(imap.port) || 993;
    const imapFolder = String(imap.folder ?? 'INBOX').slice(0, 64) || 'INBOX';
    const providerName = String(prov.name ?? 'smtp').toLowerCase().slice(0, 32) || 'smtp';
    const gave = (v: unknown) => typeof v === 'string' && v !== '';

    const outChanged = !existing
      || existing.smtp_host !== host
      || existing.smtp_port !== smtpPort
      || existing.smtp_encryption !== encOf(smtp.encryption)
      || existing.smtp_username !== String(smtp.username ?? '').trim()
      || existing.provider !== providerName
      || gave(smtp.password) || gave(prov.key) || gave(prov.secret);

    const inChanged = !existing
      || existing.imap_host !== imapHost
      || existing.imap_port !== imapPort
      || existing.imap_encryption !== encOf(imap.encryption, 'ssl')
      || existing.imap_username !== String(imap.username ?? '').trim()
      || existing.imap_folder !== imapFolder
      || gave(imap.password);

    await env.DB.prepare(
      `INSERT INTO ${TABLE} (
         id, account_id, label, is_primary,
         smtp_host, smtp_port, smtp_encryption, smtp_username, smtp_password,
         from_name, from_email, reply_to,
         imap_host, imap_port, imap_encryption, imap_username, imap_password, imap_folder,
         provider, provider_key, provider_secret, provider_domain, provider_url,
         out_verified_at, out_verified_port, out_last_error, in_verified_at, in_last_error,
         created_at, updated_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         label=excluded.label,
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
         out_verified_at=excluded.out_verified_at, out_verified_port=excluded.out_verified_port,
         out_last_error=excluded.out_last_error,
         in_verified_at=excluded.in_verified_at, in_last_error=excluded.in_last_error,
         updated_at=excluded.updated_at`,
    ).bind(
      id, accountId, headerSafe(d.label, 60) ?? '', isPrimary,
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
      /* Verification state — see `outChanged` / `inChanged` above. */
      outChanged ? null : (existing?.out_verified_at ?? null),
      outChanged ? null : (existing?.out_verified_port ?? null),
      outChanged ? '' : (existing?.out_last_error ?? ''),
      inChanged ? null : (existing?.in_verified_at ?? null),
      inChanged ? '' : (existing?.in_last_error ?? ''),
      existing?.created_at ?? now, now,
    ).run();

    return json({ success: true, id, mailboxes: await listAll() });
  }

  /* ── Prove it works, and remember the answer ── */
  const OUTGOING = new Set(['test_outgoing', 'test']);
  const INCOMING = new Set(['test_incoming', 'test_imap']);

  if (OUTGOING.has(d.action ?? '') || INCOMING.has(d.action ?? '')) {
    const id = String(d.id ?? '').trim();
    const mb = id ? await loadMailboxById(env, accountId, id) : await loadMailbox(env, accountId);
    if (!mb) return fail('Save your mail server details first, then validate them.');

    if (INCOMING.has(d.action ?? '')) {
      if (!mb.imap.host || !mb.imap.username) {
        return fail('Add your incoming mail server (IMAP) details first — host and username at least.');
      }
      const r = await imapFetch({ ...mb.imap, folder: mb.imap.folder }, 1);
      await env.DB.prepare(
        `UPDATE ${TABLE} SET in_verified_at = ?, in_last_error = ?, updated_at = ? WHERE id = ?`,
      ).bind(r.ok ? nowIso() : null, r.ok ? '' : r.error, nowIso(), mb.id).run();

      return json({
        success: r.ok,
        direction: 'incoming',
        message: r.ok
          ? `Connected to ${mb.imap.host} and opened ${mb.imap.folder}. Replies to this mailbox will appear in your inbox.`
          : r.error,
        error: r.ok ? undefined : r.error,
        /* Not just what broke — what to do about it. A customer setting up a
           mailbox is not a mail administrator, and "NO [AUTHENTICATIONFAILED]"
           tells them nothing they can act on. */
        diagnosis: r.ok ? undefined : diagnose('incoming', r.error),
        mailboxes: await listAll(),
      });
    }

    if (!mb.smtp.host) return fail('Add your outgoing mail server (SMTP) host first.');
    if (mb.smtp.username && !mb.smtp.password) {
      return fail('The saved password could not be read back. Enter it again and save.');
    }

    const r = await smtpVerify(mb.smtp);
    await env.DB.prepare(
      `UPDATE ${TABLE} SET out_verified_at = ?, out_verified_port = ?, out_last_error = ?, updated_at = ? WHERE id = ?`,
    ).bind(r.ok ? nowIso() : null, r.ok ? (r.port ?? null) : null, r.ok ? '' : r.error, nowIso(), mb.id).run();

    return json({
      success: r.ok,
      direction: 'outgoing',
      port: r.port,
      attempts: r.attempts,
      message: r.ok
        ? `Signed in to ${mb.smtp.host}:${r.port} successfully. This mailbox can send.`
        : r.error,
      error: r.ok ? undefined : r.error,
      diagnosis: r.ok ? undefined : diagnose('outgoing', r.error),
      mailboxes: await listAll(),
    });
  }

  return fail(`"${d.action ?? ''}" is not something this endpoint does.`);
}
