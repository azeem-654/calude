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
import { verifyProvider } from '../lib/providerApi';
import { sendsViaApi } from '../lib/deliver';
import { aiBudget, askGeminiParts, extractJson, loadAiKey } from '../lib/ai';
import { rateLimit } from '../lib/rateLimit';
import { lookupDomain, lookupDomainOk, lookupSummary } from '../lib/mailLookup';
import { SCREENSHOT_PROMPT, providerForDomain, providerForMx, recordsFromAi, type AiMailboxes } from '../lib/mailParse';

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

type Saved = { ok: true; id: string } | { ok: false; error: string; field?: string };

/**
 * Create or update one mailbox in a workspace the caller was already proved to
 * own. One function for the form's Save and for "Connect and test all", so a
 * bulk import gets exactly the same checks, encryption and verified-stamp
 * clearing as a mailbox typed in by hand.
 */
async function saveOne(env: Env, accountId: string, key: string, d: SaveBody): Promise<Saved> {
  const smtp = d.smtp ?? {};
  const host = String(smtp.host ?? '').trim();
  if (host && !HOST_OK.test(host)) return { ok: false, error: `"${host}" is not a valid mail server name.`, field: 'smtp.host' };

  const fromEmail = String(d.from?.email ?? '').trim();
  if (fromEmail && !addr(fromEmail)) return { ok: false, error: `"${fromEmail}" is not a valid sending address.`, field: 'from.email' };
  const replyTo = String(d.from?.replyTo ?? '').trim();
  if (replyTo && !addr(replyTo)) return { ok: false, error: `"${replyTo}" is not a valid reply-to address.`, field: 'from.replyTo' };

  const imap = d.imap ?? {};
  const imapHost = String(imap.host ?? '').trim();
  if (imapHost && !HOST_OK.test(imapHost)) return { ok: false, error: `"${imapHost}" is not a valid mailbox host.`, field: 'imap.host' };

  const wantedId = String(d.id ?? '').trim();
  const existing = wantedId
    ? await env.DB.prepare(`SELECT * FROM ${TABLE} WHERE account_id = ? AND id = ?`)
        .bind(accountId, wantedId).first<Row>()
    : null;
  if (wantedId && !existing) return { ok: false, error: 'That mailbox is not in this workspace.' };

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

  return { ok: true, id };
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
    const r = await saveOne(env, accountId, key, d);
    if (!r.ok) return fail(r.error, 200, r.field ? { field: r.field } : {});
    return json({ success: true, id: r.id, mailboxes: await listAll() });
  }

  /* ── Prove it works, and remember the answer ── */
  const OUTGOING = new Set(['test_outgoing', 'test']);
  const INCOMING = new Set(['test_incoming', 'test_imap']);

  if (OUTGOING.has(d.action ?? '') || INCOMING.has(d.action ?? '')) {
    const id = String(d.id ?? '').trim();
    const mb = id ? await loadMailboxById(env, accountId, id) : await loadMailbox(env, accountId);
    if (!mb) return fail('Save your mail server details first, then validate them.');

    const incoming = INCOMING.has(d.action ?? '');
    const p = incoming ? await proveIncoming(env, mb) : await proveOutgoing(env, mb);
    /* A precondition (no host yet) is a refusal about a box, not a test result. */
    if (p.refused) return fail(p.message, 200, { field: p.field });
    /* A provider's refusal names its box too (verifyProvider), and keeps that shape. */
    if (!p.ok && p.viaApi) return fail(p.message, 200, { direction: 'outgoing', field: p.field, mailboxes: await listAll() });
    return json({
      success: p.ok,
      direction: incoming ? 'incoming' : 'outgoing',
      ...(p.port !== undefined || p.attempts ? { port: p.port, attempts: p.attempts } : {}),
      message: p.message,
      error: p.ok ? undefined : p.error,
      warning: p.warning,
      diagnosis: p.diagnosis,
      mailboxes: await listAll(),
    });
  }

  /* ── Paste-and-connect: fill in what a paste left out ── */
  if (d.action === 'lookup') return lookupAction(env, accountId, d as LookupBody);
  if (d.action === 'read_picture') return readPicture(env, accountId, d as PictureBody);
  if (d.action === 'bulk_connect') return bulkConnect(env, accountId, key, d as BulkBody);

  return fail(`"${d.action ?? ''}" is not something this endpoint does.`);
}

/* ── Proving a mailbox, shared by the form's Validate and "Connect and test all" ── */

interface Proof {
  ok: boolean;
  /** A precondition, not a test: no host yet, a password that will not decrypt. */
  refused?: boolean;
  /** Proved through a provider's API rather than SMTP. */
  viaApi?: boolean;
  message: string;
  error?: string;
  field?: string;
  warning?: string;
  port?: number;
  attempts?: unknown;
  diagnosis?: ReturnType<typeof diagnose>;
}

/** Log in over IMAP and open the folder; the answer is recorded on the row. */
async function proveIncoming(env: Env, mb: Mailbox): Promise<Proof> {
  if (!mb.imap.host || !mb.imap.username) {
    return { ok: false, refused: true, message: 'Add your incoming mail server (IMAP) details first — host and username at least.', field: mb.imap.host ? 'imap.username' : 'imap.host' };
  }
  const r = await imapFetch({ ...mb.imap, folder: mb.imap.folder }, 1);
  await env.DB.prepare(
    `UPDATE ${TABLE} SET in_verified_at = ?, in_last_error = ?, updated_at = ? WHERE id = ?`,
  ).bind(r.ok ? nowIso() : null, r.ok ? '' : r.error, nowIso(), mb.id).run();
  return {
    ok: r.ok,
    message: r.ok
      ? `Connected to ${mb.imap.host} and opened ${mb.imap.folder}. Replies to this mailbox will appear in your inbox.`
      : r.error,
    error: r.ok ? undefined : r.error,
    /* Not just what broke — what to do about it. A customer setting up a
       mailbox is not a mail administrator, and "NO [AUTHENTICATIONFAILED]"
       tells them nothing they can act on. */
    diagnosis: r.ok ? undefined : diagnose('incoming', r.error),
  };
}

/** Sign in over SMTP (or prove the provider key); the answer is recorded on the row. */
async function proveOutgoing(env: Env, mb: Mailbox): Promise<Proof> {
  /* A provider mailbox has no SMTP server — the form does not even show
     the field — so it is proved through the provider's own API. This used
     to fall through to the SMTP check below and demand a host nobody could
     type in. */
  if (sendsViaApi(mb)) {
    const v = await verifyProvider(mb.provider, mb.from.email);
    await env.DB.prepare(
      `UPDATE ${TABLE} SET out_verified_at = ?, out_verified_port = NULL, out_last_error = ?, updated_at = ? WHERE id = ?`,
    ).bind(v.ok ? nowIso() : null, v.ok ? (v.warning ?? '') : v.message, nowIso(), mb.id).run();
    if (!v.ok) return { ok: false, viaApi: true, message: v.message, error: v.message, field: v.field };
    return { ok: true, viaApi: true, message: `${v.message}${v.warning ? ` ${v.warning}` : ' This mailbox can send.'}`, warning: v.warning };
  }

  if (!mb.smtp.host) return { ok: false, refused: true, message: 'Add your outgoing mail server (SMTP) host first.', field: 'smtp.host' };
  if (mb.smtp.username && !mb.smtp.password) {
    return { ok: false, refused: true, message: 'The saved password could not be read back. Enter it again and save.', field: 'smtp.password' };
  }

  const r = await smtpVerify(mb.smtp);
  await env.DB.prepare(
    `UPDATE ${TABLE} SET out_verified_at = ?, out_verified_port = ?, out_last_error = ?, updated_at = ? WHERE id = ?`,
  ).bind(r.ok ? nowIso() : null, r.ok ? (r.port ?? null) : null, r.ok ? '' : r.error, nowIso(), mb.id).run();
  return {
    ok: r.ok,
    port: r.port,
    attempts: r.attempts,
    message: r.ok ? `Signed in to ${mb.smtp.host}:${r.port} successfully. This mailbox can send.` : r.error,
    error: r.ok ? undefined : r.error,
    diagnosis: r.ok ? undefined : diagnose('outgoing', r.error),
  };
}

/* ── Paste-and-connect (components/Settings/MailboxImport.tsx) ──────────────
 *
 * The browser parses the paste itself (lib/mailParse.ts is shared) and fills
 * what the known-providers table knows. What needs the network comes here:
 * looking a custom domain up, reading a screenshot, and saving + testing a
 * batch. Every one of them is behind the same workspace check as the rest of
 * this endpoint (handleMailbox, above).
 * ─────────────────────────────────────────────────────────────────────────── */

/** Domains per lookup call — each can take four fetches, and a request has a subrequest budget. */
const LOOKUP_BATCH = 8;
/**
 * Mailboxes per "Connect and test all" call. Three: each runs an SMTP login
 * then an IMAP login on its own socket, a Worker may hold six connections at
 * once, and a host that never answers costs up to a minute of port ladder —
 * three of those still finish inside one request.
 */
const BULK_BATCH = 3;

interface LookupBody { domains?: { domain?: string; email?: string }[] }

async function lookupAction(env: Env, accountId: string, d: LookupBody): Promise<Response> {
  const asked = (Array.isArray(d.domains) ? d.domains : [])
    .map(x => ({ domain: String(x?.domain ?? '').toLowerCase().trim(), email: String(x?.email ?? '').toLowerCase().trim() }))
    .filter((x, i, a) => x.domain && a.findIndex(y => y.domain === x.domain) === i);
  if (!asked.length) return fail('Paste some mail settings or addresses first.', 200, { field: 'mailimport.text' });
  if (asked.length > LOOKUP_BATCH) return fail(`At most ${LOOKUP_BATCH} domains at a time.`, 200, { field: 'mailimport.text' });
  const bad = asked.find(x => !lookupDomainOk(x.domain));
  if (bad) return fail(`"${bad.domain}" is not a domain name.`, 200, { field: 'mailimport.text' });
  /* Each lookup is several fetches to somebody else's servers; a loop must not turn this into a scanner. */
  const v = await rateLimit(env, { what: 'mailbox-lookup', who: accountId, max: 300, windowSeconds: 3600 });
  if (!v.allowed) return fail(`That is a lot of lookups in an hour — try again in ${Math.ceil(v.retryAfter / 60)} minutes.`, 429, { code: 'rate_limited' });
  const lookups = await Promise.all(asked.map(async x => {
    const l = await lookupDomain(env, x.domain, x.email && x.email.endsWith(`@${x.domain}`) ? x.email : `info@${x.domain}`);
    return { ...l, summary: lookupSummary(l) };
  }));
  return json({ success: true, lookups });
}

interface PictureBody { mime?: string; data?: string }

const PICTURE_TYPES = /^image\/(png|jpe?g|webp|gif)$/i;
/** Base64 characters — about 3 MB of picture; the browser shrinks screenshots well under it. */
const PICTURE_MAX = 4_000_000;

async function readPicture(env: Env, accountId: string, d: PictureBody): Promise<Response> {
  const mime = String(d.mime ?? '').toLowerCase();
  const data = String(d.data ?? '').replace(/^data:[^,]*,/, '');
  if (!PICTURE_TYPES.test(mime)) return fail('That is not a picture this can read — use a PNG, JPEG, WebP or GIF screenshot.', 200, { field: 'mailimport.picture' });
  if (!data || data.length > PICTURE_MAX || !/^[A-Za-z0-9+/=\s]+$/.test(data.slice(0, 2000))) {
    return fail('That picture is empty or too large. Crop it to the settings and try again.', 200, { field: 'mailimport.picture' });
  }
  const key = await loadAiKey(env, accountId);
  if (!key) {
    return fail('No AI service is connected on this install, so screenshots cannot be read. Paste the settings as text instead.', 200, { code: 'no_ai', field: 'mailimport.picture' });
  }
  const budget = await aiBudget(env, accountId);
  if (budget) return fail(budget, 200, { code: 'ai_budget', field: 'mailimport.picture' });

  const ai = await askGeminiParts(key, [{ text: SCREENSHOT_PROMPT }, { inlineData: { mimeType: mime, data } }], 0, { json: true, timeoutMs: 60_000 });
  if (!ai.ok) {
    /* A pool whose only keys have no model that reads pictures answers with nothing to say. */
    const why = /could not answer:\s*$/.test(ai.error) || !ai.error.trim()
      ? 'none of the AI keys on this install can read pictures right now.'
      : ai.error;
    return fail(`The screenshot could not be read: ${why} Paste the settings as text instead.`, 200, { code: 'ai_failed', field: 'mailimport.picture' });
  }
  const parsed = extractJson<AiMailboxes>(ai.text);
  if (!parsed) return fail('The AI answered, but not with settings that could be read. Paste the settings as text instead.', 200, { code: 'ai_unreadable', field: 'mailimport.picture' });
  const records = recordsFromAi(parsed);
  return json({
    success: true,
    records,
    message: records.length
      ? `Read ${records.length} mailbox${records.length === 1 ? '' : 'es'} from the picture — check every field before connecting.`
      : 'No mail settings could be seen in that picture.',
  });
}

interface BulkSide { host?: string; port?: number | string; security?: string; username?: string; password?: string }
interface BulkRow { email?: string; name?: string; password?: string; smtp?: BulkSide; imap?: BulkSide }
interface BulkBody { rows?: BulkRow[] }

/** One direction's result, in words the review table can show as they are. */
interface SideResult {
  ok: boolean;
  kind: 'connected' | 'wrong_password' | 'needs_app_password' | 'host_not_found' | 'host_unreachable'
    | 'encryption_mismatch' | 'account_locked' | 'folder_missing' | 'not_set' | 'failed';
  message: string;
  steps?: string[];
}

const KIND_BY_RULE: Record<string, SideResult['kind']> = {
  r3: 'needs_app_password', r4: 'account_locked', r5: 'wrong_password', r6: 'host_not_found',
  r7: 'host_unreachable', r8: 'host_unreachable', r9: 'encryption_mismatch', r10: 'encryption_mismatch', r11: 'folder_missing',
};

function sideResult(p: Proof, appPassword: boolean): SideResult {
  if (p.ok) return { ok: true, kind: 'connected', message: p.message };
  if (p.refused) return { ok: false, kind: 'not_set', message: p.message };
  let kind = KIND_BY_RULE[p.diagnosis?.id ?? ''] ?? 'failed';
  /* "Wrong password" at a provider that refuses account passwords is nearly always this. */
  if (kind === 'wrong_password' && appPassword) kind = 'needs_app_password';
  return {
    ok: false, kind, message: p.diagnosis?.summary ?? p.message,
    steps: p.diagnosis ? [...p.diagnosis.steps.slice(0, 3), `Server said: ${p.diagnosis.raw}`.slice(0, 400)] : undefined,
  };
}

const enc3 = (v: unknown, side: 'smtp' | 'imap'): Encryption => {
  const t = String(v ?? '').toLowerCase();
  return t === 'ssl' ? 'ssl' : t === 'tls' || t === 'starttls' ? 'tls' : t === 'none' ? 'none' : side === 'smtp' ? 'tls' : 'ssl';
};

async function bulkConnect(env: Env, accountId: string, key: string, d: BulkBody): Promise<Response> {
  const rows = Array.isArray(d.rows) ? d.rows : [];
  if (!rows.length) return fail('There is nothing to connect yet — paste your mail settings first.', 200, { field: 'mailimport.text' });
  if (rows.length > BULK_BATCH) return fail(`At most ${BULK_BATCH} mailboxes per request; the page sends them in batches.`);

  /*
   * Saved one at a time, then tested together. Saving in parallel raced the
   * "first mailbox is the primary" rule: three new rows each saw an empty
   * workspace, each claimed primary, and the unique index refused the batch.
   */
  type Out = Record<string, unknown> & { email: string };
  const prepared: (Out | { email: string; id: string; updated: boolean })[] = [];
  for (const row of rows) prepared.push(await saveRow(row));

  const results = await Promise.all(prepared.map(async p => {
    if (!('id' in p) || 'status' in p) return p;
    const email = p.email;
    const base = { email };
    const mb = await loadMailboxById(env, accountId, p.id as string);
    if (!mb) return { ...base, ok: false, status: 'failed', message: 'Saved, but could not be read back to test it.' };

    const known = providerForDomain(email.split('@')[1] ?? '') ?? providerForMx([mb.smtp.host, mb.imap.host].filter(Boolean));
    const appPw = !!known?.appPassword;
    /* One after the other: the same password tried twice at once is how accounts get locked. */
    const outgoing = sideResult(await proveOutgoing(env, mb), appPw);
    const incoming = sideResult(await proveIncoming(env, mb), appPw);
    const both = outgoing.ok && incoming.ok;
    const status = both ? 'connected' : outgoing.ok || incoming.ok ? 'partial' : 'failed';
    return { ...base, id: p.id, updated: p.updated, ok: both, status, outgoing, incoming };
  }));

  const now = await env.DB.prepare(
    `SELECT * FROM ${TABLE} WHERE account_id = ? ORDER BY is_primary DESC, created_at ASC`,
  ).bind(accountId).all<Row>();
  return json({ success: true, results, mailboxes: (now.results ?? []).map(redact) });

  async function saveRow(row: BulkRow): Promise<Out | { email: string; id: string; updated: boolean }> {
    const email = String(row.email ?? '').trim().toLowerCase();
    const base = { email };
    if (!email || !addr(email)) return { ...base, ok: false, status: 'failed', field: 'bulk.email', message: `"${email || '(blank)'}" is not an email address.` };

    /* Logging in to other people's mail servers with pasted passwords is what a
       credential-stuffing script does; one workspace gets a generous hour's worth, not a firehose. */
    const v = await rateLimit(env, { what: 'mailbox-bulk', who: accountId, max: 150, windowSeconds: 3600 });
    if (!v.allowed) return { ...base, ok: false, status: 'failed', message: `Too many mailbox tests this hour — try again in ${Math.ceil(v.retryAfter / 60)} minutes.` };

    /* The same address again updates its mailbox rather than adding a twin. */
    const existing = await env.DB.prepare(
      `SELECT id, label, reply_to, imap_folder FROM ${TABLE}
        WHERE account_id = ? AND (lower(from_email) = ? OR (from_email = '' AND lower(smtp_username) = ?))
        ORDER BY created_at ASC LIMIT 1`,
    ).bind(accountId, email, email).first<{ id: string; label: string; reply_to: string; imap_folder: string }>();

    const smtp = row.smtp ?? {}, imap = row.imap ?? {};
    const shared = String(row.password ?? '');
    const smtpPw = String(smtp.password ?? '') || shared;
    const imapPw = String(imap.password ?? '') || shared;
    if (!existing && !smtpPw && !imapPw) return { ...base, ok: false, status: 'failed', field: 'bulk.password', message: 'No password for this address — add one in its row.' };

    const saved = await saveOne(env, accountId, key, {
      id: existing?.id,
      label: existing?.label || String(row.name ?? '').trim() || email,
      smtp: { host: String(smtp.host ?? '').trim().toLowerCase(), port: Number(smtp.port) || undefined, encryption: enc3(smtp.security, 'smtp'), username: String(smtp.username ?? '').trim() || email, password: smtpPw },
      from: { name: String(row.name ?? '').trim(), email, replyTo: existing?.reply_to ?? '' },
      imap: { host: String(imap.host ?? '').trim().toLowerCase(), port: Number(imap.port) || undefined, encryption: enc3(imap.security, 'imap'), username: String(imap.username ?? '').trim() || email, password: imapPw, folder: existing?.imap_folder || 'INBOX' },
      provider: { name: 'smtp' },
    });
    if (!saved.ok) {
      const field = saved.field === 'smtp.host' ? 'bulk.smtp.host' : saved.field === 'imap.host' ? 'bulk.imap.host' : 'bulk.email';
      return { ...base, ok: false, status: 'failed', field, message: saved.error };
    }
    return { email, id: saved.id, updated: !!existing };
  }
}
