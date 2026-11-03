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
import { providerLabel, verifyProvider } from '../lib/providerApi';
import { sendsViaApi } from '../lib/deliver';
import { aiBudget, askGeminiParts, extractJson, loadAiKey } from '../lib/ai';
import { rateLimit } from '../lib/rateLimit';
import { lookupDomain, lookupDomainOk, lookupSummary } from '../lib/mailLookup';
import { sendCredsFor } from '../lib/hostedMail';
import {
  KNOWN_PROVIDERS, SCREENSHOT_PROMPT, domainOf, knownAsFound, providerForDomain, providerForMx, recordsFromAi,
  type AiMailboxes, type FoundSettings,
} from '../lib/mailParse';

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
  /**
   * The incoming side's last answer, as loaded — so a sync can skip a mailbox
   * whose login was refused and record what it finds (`noteIncomingSync`).
   * `updatedAt` guards that write against an edit made while it ran.
   */
  incomingCheck?: { verifiedAt: string | null; lastError: string; updatedAt: string };
  /**
   * An address on the workspace's own domain, hosted here (lib/hostedMail.ts):
   * it receives into crm_hosted_messages, and sends with the platform's key
   * only once its domain is verified — `hostedWhy` says why not, otherwise.
   */
  hosted?: boolean;
  hostedWhy?: string;
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

/** Hosted addresses are managed with their domain, not on the mailbox form. */
const HOSTED_EDIT = 'This address is hosted on your own domain — change or remove it under Email & SMS → Your own domain.';
const TABLE = 'crm_mailbox_accounts';

/** Turn a row into the decrypted, ready-to-use shape. */
async function hydrate(env: Env, row: Row): Promise<Mailbox> {
  const key = await installSecret(env.DB, SECRET_KEY);
  /* A hosted address never stores a key: the platform's is handed over here, only for its own verified domain. */
  const hosted = row.provider === 'hosted' ? await sendCredsFor(env, row.account_id, row.from_email) : null;
  return {
    ...(hosted ? { hosted: true, hostedWhy: 'why' in hosted ? hosted.why : '' } : {}),
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
    provider: hosted ? { name: 'key' in hosted ? hosted.name : 'hosted', key: 'key' in hosted ? hosted.key : '', secret: '', domain: '', url: '' } : {
      name: row.provider || 'smtp',
      key: await decryptSecret(key, row.provider_key),
      secret: await decryptSecret(key, row.provider_secret),
      domain: row.provider_domain,
      url: row.provider_url,
    },
    incomingCheck: { verifiedAt: row.in_verified_at, lastError: row.in_last_error ?? '', updatedAt: row.updated_at },
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
      ...sideStatus('outgoing', row),
    },
    incoming: {
      verifiedAt: row.in_verified_at,
      lastError: row.in_last_error,
      ...sideStatus('incoming', row),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type SideState = 'connected' | 'warning' | 'failed' | 'untested' | 'not_set_up' | 'send_only';

/**
 * One direction's state in a word, and what is wrong in plain words — so the
 * mailbox list can say "Receiving: the password was refused" on the row
 * instead of a red chip somebody has to open the mailbox to explain.
 *
 * Read only from what was recorded (the stamps and the last error), never from
 * whether fields are filled in: a host typed in is not a connection.
 * `warning` is a side that passed and has since said something: a provider's
 * caveat on the From address, or a sync that failed after validation.
 */
function sideStatus(direction: 'outgoing' | 'incoming', row: Row): { state: SideState; problem?: { summary: string; fix: string } } {
  const out = direction === 'outgoing';
  /* Hosted on the workspace's own domain: the stamps and words are its domain's (lib/hostedMail.ts stampMailboxes) — waiting, not broken. */
  if (row.provider === 'hosted') {
    const verified = out ? row.out_verified_at : row.in_verified_at;
    const err = String((out ? row.out_last_error : row.in_last_error) ?? '');
    return verified ? { state: 'connected' } : { state: 'not_set_up', ...(err ? { problem: { summary: err, fix: 'Email & SMS → Your own domain → Check again.' } } : {}) };
  }
  const viaApi = !!row.provider && row.provider !== 'smtp';
  const verified = out ? row.out_verified_at : row.in_verified_at;
  const err = String((out ? row.out_last_error : row.in_last_error) ?? '');
  const configured = out ? (viaApi ? !!row.provider_key : !!row.smtp_host) : !!row.imap_host && !!row.imap_username;
  const state: SideState = verified ? (err ? 'warning' : 'connected')
    : err ? 'failed'
    : configured ? 'untested'
    /* A provider API (Brevo, Resend…) only sends; with no IMAP of its own this is a sending-only mailbox, not a broken one. */
    : !out && viaApi ? 'send_only' : 'not_set_up';
  if (!err) return { state };
  /* A provider's caveat is stored as it was said, and is not a fault to diagnose. */
  if (out && verified && viaApi) return { state, problem: { summary: err, fix: '' } };
  const d = diagnose(direction, err);
  return { state, problem: { summary: d.summary, fix: d.steps[0] ?? '' } };
}

/** Every mailbox in a workspace as the settings screen may see it. */
async function listRedacted(env: Env, accountId: string): Promise<Record<string, unknown>[]> {
  const rows = await env.DB.prepare(
    `SELECT * FROM ${TABLE} WHERE account_id = ? ORDER BY is_primary DESC, created_at ASC`,
  ).bind(accountId).all<Row>();
  return (rows.results ?? []).map(redact);
}

/** Diagnoses that mean the login itself was refused, not that the server was away. */
const LOGIN_REFUSED = new Set(['r3', 'r4', 'r5']);

/**
 * What a sync (the reply cron, the inbox page) found, recorded on the row so
 * the mailbox list shows it. A mailbox whose IMAP kept failing used to fail
 * only into a cron note nobody reads, while Settings went on showing the green
 * tick from the day it was validated.
 *
 * A refused login also clears the stamp, which stops the cron: trying a wrong
 * password every five minutes is how a provider locks the account. A server
 * that did not answer keeps its stamp — it is tried again next tick, and the
 * row says the last attempt failed. A success clears the error and stamps a
 * mailbox that was never validated, because it has just been proved.
 *
 * Guarded by `updated_at`: a customer who saved new settings while this ran
 * must not have them stamped with the old settings' result.
 */
export async function noteIncomingSync(env: Env, mb: Mailbox, r: { ok: boolean; error: string }): Promise<void> {
  const c = mb.incomingCheck;
  if (!c) return;
  if (r.ok) {
    if (c.verifiedAt && !c.lastError) return; /* nothing new — no write every tick */
    await env.DB.prepare(
      `UPDATE ${TABLE} SET in_verified_at = COALESCE(in_verified_at, ?), in_last_error = '' WHERE id = ? AND updated_at = ?`,
    ).bind(nowIso(), mb.id, c.updatedAt).run();
    return;
  }
  const refused = LOGIN_REFUSED.has(diagnose('incoming', r.error).id);
  if (c.lastError === r.error && (!refused || !c.verifiedAt)) return;
  await env.DB.prepare(
    `UPDATE ${TABLE} SET in_last_error = ?, in_verified_at = ${refused ? 'NULL' : 'in_verified_at'} WHERE id = ? AND updated_at = ?`,
  ).bind(r.error.slice(0, 500), mb.id, c.updatedAt).run();
}

/**
 * Should a sync read this mailbox? Every mailbox with IMAP settings — not just
 * the primary — except one whose last check failed and has not been proved
 * since: that is a wrong password or a dead host waiting for the customer, and
 * retrying it unattended only risks a lockout. "Check and turn on all
 * mailboxes" (or Validate) brings it back.
 */
export const incomingReady = (mb: Mailbox): boolean =>
  !!mb.imap.host && !!mb.imap.username && !(mb.incomingCheck && !mb.incomingCheck.verifiedAt && mb.incomingCheck.lastError);

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
  if (existing?.provider === 'hosted') return { ok: false, error: HOSTED_EDIT };

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
    const isHosted = await env.DB.prepare(`SELECT 1 AS n FROM ${TABLE} WHERE account_id = ? AND id = ? AND provider = 'hosted'`).bind(accountId, id).first();
    if (isHosted) return fail(HOSTED_EDIT);
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
    /* A hosted address has no server to log in to: its state is its domain's (refreshed by "Check again" there). */
    if (mb.hosted) {
      const row = await env.DB.prepare(`SELECT in_last_error, out_last_error FROM ${TABLE} WHERE id = ?`).bind(mb.id).first<{ in_last_error: string; out_last_error: string }>();
      const why = (incoming ? row?.in_last_error : row?.out_last_error) || (incoming ? '' : mb.hostedWhy) || '';
      return json({ success: !why, direction: incoming ? 'incoming' : 'outgoing', message: why || (incoming ? 'Receiving on your own domain is on.' : 'Sending from your own domain is verified.'), error: why || undefined, mailboxes: await listAll() });
    }
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
  /* ── Every saved mailbox: fill what is missing, then prove both sides ── */
  if (d.action === 'activate_all') return activateAll(env, accountId, key, d as ActivateBody);

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
    | 'encryption_mismatch' | 'account_locked' | 'folder_missing' | 'not_set' | 'failed'
    /* activate_all only: nothing to test yet / a provider API that only sends. */
    | 'not_set_up' | 'send_only';
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

  return json({ success: true, results, mailboxes: await listRedacted(env, accountId) });

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

/* ── "Check and turn on all mailboxes" (MailboxesPanel.tsx) ─────────────────
 *
 * For every saved mailbox: work out which side is missing, fill it where it
 * can be derived honestly, then prove both sides with the form's own
 * Validate. The page sends the workspace's ids in batches of BULK_BATCH, for
 * the same reason bulk_connect does.
 * ─────────────────────────────────────────────────────────────────────────── */

interface ActivateBody { ids?: unknown }

interface Gaps {
  /** The full save body when something was filled; null when nothing was. */
  body: SaveBody | null;
  /** What was filled and where it came from, in words the results can show. */
  notes: string[];
  /** Why a missing side could not be filled — the lookup's own answer. */
  outWhy: string;
  inWhy: string;
  /**
   * The lookup reached DNS and found nothing to receive on: 'no_mx' when the
   * domain lists no mail server, 'unknown' when its mail server publishes no
   * settings we can read. Empty when the lookup could not run, or found some.
   */
  noMailHost: '' | 'no_mx' | 'unknown';
  /** For the app-password rule when a login is refused. */
  appPassword: boolean;
}

/** The address a mailbox is for: its From, else whichever login is an address. */
function addressOf(mb: Mailbox): string {
  const cands = [mb.from.email, mb.smtp.username, mb.imap.username].map(x => String(x ?? '').trim().toLowerCase());
  return cands.find(x => !!addr(x)) ?? '';
}

/**
 * Fill what is missing, and only that. Never overwrites a host, port or login
 * somebody typed — a filled field the customer did not want is a wrong answer
 * that looks like theirs.
 *
 *   - A side with no server: the provider the other side's host names, else
 *     the address's domain through `lookupDomain` (known providers, ISPDB,
 *     autoconfig, MX) — the same steps the paste import uses.
 *   - A side with a server but no username: the address.
 *   - A side with no password, when both logins are this address (or its
 *     local part): the other side's password. A mail host uses one login for
 *     both; a relay login ("apikey", "resend") is never copied anywhere.
 *   - A provider API sender has no IMAP: the address's own mail host is
 *     looked up for receiving. Its API key is not a mailbox password and is
 *     never copied, so that side still needs the customer's password.
 */
async function fillGaps(env: Env, accountId: string, row: Row, mb: Mailbox, email: string): Promise<Gaps> {
  const notes: string[] = [];
  const viaApi = sendsViaApi(mb);
  const needOut = !viaApi && !row.smtp_host;
  const needIn = !row.imap_host;
  const local = email.split('@')[0] ?? '';
  const own = (u: string) => !!email && (u.toLowerCase() === email || (!!local && u.toLowerCase() === local.toLowerCase()));

  let found: FoundSettings | null = null;
  let why = '';
  let noMailHost: Gaps['noMailHost'] = '';
  if ((needOut || needIn) && !email) why = 'this mailbox has no address, so its servers cannot be looked up';
  else if (needOut || needIn) {
    /* The other side's server names the provider more surely than a custom domain does. */
    const host = (needOut ? row.imap_host : viaApi ? '' : row.smtp_host).toLowerCase();
    const byHost = host
      ? providerForMx([host]) ?? Object.values(KNOWN_PROVIDERS).find(k => k.smtp.host === host || k.imap.host === host) ?? null
      : null;
    if (byHost && !byHost.unsupported) found = knownAsFound(byHost, `known settings for ${host}`);
    else {
      const v = await rateLimit(env, { what: 'mailbox-lookup', who: accountId, max: 300, windowSeconds: 3600 });
      if (!v.allowed) why = `the lookup limit for this hour was reached — try again in ${Math.ceil(v.retryAfter / 60)} minutes`;
      else {
        const l = await lookupDomain(env, domainOf(email), email);
        found = l.found;
        if (!found) {
          /* DNS's own answer when it gave one ("this domain has no MX records") — the clearest reason there is. */
          why = l.noMx ? l.steps.find(s => s.source === 'MX records')?.detail ?? lookupSummary(l) : lookupSummary(l);
          /* A lookup that could not reach DNS proves nothing, so says nothing here. */
          noMailHost = l.noMx ? 'no_mx' : l.steps.some(s => s.source === 'MX records' && s.outcome !== 'failed') ? 'unknown' : '';
        }
      }
    }
    if (found?.unsupported) {
      why = found.note ?? `${found.provider} cannot be connected from a cloud service`;
      found = null;
    }
  }

  const smtp = { host: row.smtp_host, port: row.smtp_port, encryption: row.smtp_encryption, username: row.smtp_username, password: '' };
  const imap = { host: row.imap_host, port: row.imap_port, encryption: row.imap_encryption, username: row.imap_username, password: '', folder: row.imap_folder };
  let changed = false;
  const login = (u?: 'email' | 'local') => (u === 'local' ? local : email);

  if (needOut && found?.smtp) {
    Object.assign(smtp, { host: found.smtp.host, port: found.smtp.port, encryption: found.smtp.security });
    if (!smtp.username) smtp.username = login(found.smtp.username);
    notes.push(`Outgoing: ${smtp.host}:${smtp.port} filled in from ${found.source}.`);
    changed = true;
  }
  if (needIn && found?.imap) {
    Object.assign(imap, { host: found.imap.host, port: found.imap.port, encryption: found.imap.security });
    if (!imap.username) imap.username = login(found.imap.username);
    notes.push(viaApi
      ? `Incoming: ${imap.host}:${imap.port} filled in from ${found.source} — ${providerLabel(mb.provider.name)} only sends, so replies are collected from this address's own mail host.`
      : `Incoming: ${imap.host}:${imap.port} filled in from ${found.source}.`);
    changed = true;
  }
  if (imap.host && !imap.username && email) { imap.username = email; changed = true; notes.push('Incoming: no login was saved, so the address is used.'); }

  /* One login for both directions — copied only between this address's own logins. */
  if (!viaApi && smtp.host && !row.smtp_password && mb.imap.password && own(smtp.username) && own(imap.username)) {
    smtp.password = mb.imap.password; changed = true;
    notes.push('Outgoing: signs in with the incoming password — a mail host uses one login for both.');
  }
  if (!viaApi && imap.host && !row.imap_password && mb.smtp.password && own(smtp.username) && own(imap.username)) {
    imap.password = mb.smtp.password; changed = true;
    notes.push('Incoming: signs in with the outgoing password — a mail host uses one login for both.');
  }

  const known = providerForDomain(domainOf(email)) ?? providerForMx([smtp.host, imap.host].filter(Boolean));
  return {
    body: changed ? {
      id: row.id, label: row.label, smtp, imap,
      from: { name: row.from_name, email: row.from_email, replyTo: row.reply_to },
      /* No key or secret: blank keeps the stored ones (saveOne's keepOrSet). */
      provider: { name: row.provider, domain: row.provider_domain, url: row.provider_url },
    } : null,
    notes,
    outWhy: needOut && !found?.smtp ? why : '',
    inWhy: needIn && !found?.imap ? why : '',
    noMailHost,
    appPassword: !!(known?.appPassword || found?.appPassword),
  };
}

async function activateOne(env: Env, accountId: string, key: string, id: string): Promise<Record<string, unknown>> {
  const read = () => env.DB.prepare(`SELECT * FROM ${TABLE} WHERE account_id = ? AND id = ?`).bind(accountId, id).first<Row>();
  let row = await read();
  if (!row) return { id, ok: false, status: 'failed', message: 'That mailbox is not in this workspace.' };
  /* Hosted on the workspace's own domain: nothing to fill in or log in to; its domain's state is the answer. */
  if (row.provider === 'hosted') {
    const inOk = !!row.in_verified_at, outOk = !!row.out_verified_at;
    return { id, email: row.from_email, label: row.label, ok: inOk && outOk, status: inOk && outOk ? 'connected' : inOk || outOk ? 'partial' : 'failed',
      message: [row.in_last_error, row.out_last_error].filter(Boolean).join(' ') || 'Hosted on your own domain.', filled: [] };
  }
  let mb = await hydrate(env, row);
  const email = addressOf(mb);
  const base = { id, email, label: row.label };

  /* The same hourly budget as "Connect and test all": both log in to somebody else's server. */
  const v = await rateLimit(env, { what: 'mailbox-bulk', who: accountId, max: 150, windowSeconds: 3600 });
  if (!v.allowed) return { ...base, ok: false, status: 'failed', message: `Too many mailbox tests this hour — try again in ${Math.ceil(v.retryAfter / 60)} minutes.` };

  const gaps = await fillGaps(env, accountId, row, mb, email);
  const filled = [...gaps.notes];
  if (gaps.body) {
    const saved = await saveOne(env, accountId, key, gaps.body);
    if (!saved.ok) filled.push(`What was found could not be saved: ${saved.error}`);
    else {
      row = (await read()) ?? row;
      mb = await hydrate(env, row);
    }
  }
  const viaApi = sendsViaApi(mb);
  const label = providerLabel(mb.provider.name);

  /* Each side is either not ready (said why, nothing tried) or proved — one after the other, as in bulk_connect. */
  let outgoing: SideResult;
  if (viaApi && !row.provider_key) {
    outgoing = { ok: false, kind: 'not_set_up', message: `Add the ${label} API key under Outgoing mail.` };
  } else if (!viaApi && !row.smtp_host) {
    outgoing = { ok: false, kind: 'not_set_up', message: `No outgoing server is set${gaps.outWhy ? `, and none could be found: ${gaps.outWhy}` : ''}. Add one under Outgoing mail.` };
  } else if (!viaApi && row.smtp_username && !row.smtp_password) {
    outgoing = { ok: false, kind: 'not_set_up', message: `Outgoing server ${row.smtp_host} is set — add this mailbox's password under Outgoing mail to send.` };
  } else {
    outgoing = sideResult(await proveOutgoing(env, mb), gaps.appPassword);
  }

  let incoming: SideResult;
  if (!row.imap_host) {
    const where = domainOf(email) || 'this address';
    incoming = viaApi && gaps.noMailHost
      ? { ok: false, kind: 'send_only', message: `${label} only sends mail, and ${gaps.noMailHost === 'no_mx' ? `${where} lists no mail server in DNS, so nothing receives mail for it` : `no incoming settings could be found for ${where} (${gaps.inWhy})`}. This mailbox sends only — add an incoming server under Incoming mail if replies should be collected here.` }
      : { ok: false, kind: 'not_set_up', message: `No incoming server is set${gaps.inWhy ? `, and none could be found: ${gaps.inWhy}` : ''}. Add one under Incoming mail.` };
  } else if (!row.imap_password) {
    incoming = { ok: false, kind: 'not_set_up', message: `Incoming server ${row.imap_host} is set — add this mailbox's password under Incoming mail to collect replies.` };
  } else {
    incoming = sideResult(await proveIncoming(env, mb), gaps.appPassword);
  }
  for (const s of [outgoing, incoming]) if (s.kind === 'not_set') s.kind = 'not_set_up';

  const status = outgoing.ok && incoming.ok ? 'connected'
    : outgoing.ok && incoming.kind === 'send_only' ? 'send_only'
    : outgoing.ok || incoming.ok ? 'partial' : 'failed';
  return { ...base, ok: status === 'connected' || status === 'send_only', status, filled, outgoing, incoming };
}

async function activateAll(env: Env, accountId: string, key: string, d: ActivateBody): Promise<Response> {
  const ids = (Array.isArray(d.ids) ? d.ids : []).map(x => String(x ?? '').trim()).filter((x, i, a) => x && a.indexOf(x) === i);
  if (!ids.length) return fail('Which mailboxes? The page sends their ids in batches.');
  if (ids.length > BULK_BATCH) return fail(`At most ${BULK_BATCH} mailboxes per request; the page sends them in batches.`);
  const results = await Promise.all(ids.map(id => activateOne(env, accountId, key, id)));
  return json({ success: true, results, mailboxes: await listRedacted(env, accountId) });
}
