/**
 * The workspace's mailboxes. One system, and this is it.
 *
 * These settings used to live only in the browser — which meant they vanished
 * when somebody cleared their history, the password travelled with every send,
 * and nothing could send while the tab was closed, because the server never
 * held the credentials. Scheduled campaigns only worked if you happened to be
 * watching.
 *
 * They live on the server now, encrypted, and this is the only way to reach
 * them. What is left in the browser is `crm_mailbox_cache`: hosts, from
 * addresses and whether each direction has been validated, with no secret in
 * it. Code that has to decide something during a render reads that; nothing
 * can send from it.
 */
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';

const API_BASE = import.meta.env.DEV ? 'http://localhost:8787' : '';

export interface StoredMailbox {
  smtp: { host: string; port: number; encryption: string; username: string; hasPassword: boolean };
  from: { name: string; email: string; replyTo: string };
  imap: { host: string; port: number; encryption: string; username: string; folder: string; hasPassword: boolean };
  verifiedAt: string | null;
  verifiedPort: number | null;
  lastError: string;
}

/**
 * One connected mailbox, as the server describes it.
 *
 * The two directions carry their own verification. A single "verified" flag
 * could not answer the question people actually ask — *can I send?* and *can I
 * receive?* — separately, and sending through one provider while collecting
 * replies from another is ordinary.
 */
export interface MailboxRecord {
  id: string;
  label: string;
  isPrimary: boolean;
  smtp: { host: string; port: number; encryption: string; username: string; hasPassword: boolean };
  from: { name: string; email: string; replyTo: string };
  imap: { host: string; port: number; encryption: string; username: string; folder: string; hasPassword: boolean };
  provider: { name: string; domain: string; url: string; hasKey: boolean; hasSecret: boolean };
  outgoing: { verifiedAt: string | null; verifiedPort: number | null; lastError: string };
  incoming: { verifiedAt: string | null; lastError: string };
  createdAt: string;
  updatedAt: string;
}

/** What broke, and what to do about it. Built on the Worker, where the real
 *  wire text is — see worker/src/lib/mailDiagnosis.ts. */
export interface Diagnosis {
  summary: string;
  steps: string[];
  raw: string;
}

interface Reply {
  success: boolean;
  message?: string;
  error?: string;
  mailbox?: StoredMailbox | null;
  mailboxes?: MailboxRecord[];
  diagnosis?: Diagnosis;
  direction?: 'outgoing' | 'incoming';
  id?: string;
  port?: number;
}

async function call(action: string, extra: Record<string, unknown> = {}): Promise<Reply> {
  const accountId = getActiveAccountId();
  if (!accountId) return { success: false, error: 'No workspace is active yet.' };
  try {
    const r = await fetch(`${API_BASE}/api/mailbox.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), accountId, action, ...extra }),
    });
    return await r.json() as Reply;
  } catch (e) {
    return { success: false, error: `Could not reach the server: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export interface MailboxInput {
  smtp: { host: string; port: string | number; user: string; pass: string; encryption: string };
  from: { name: string; email: string; replyTo?: string };
  imap?: { host: string; port: string | number; user: string; pass: string; folder: string };
}

/**
 * Save to the server.
 *
 * An empty password is sent as an empty string on purpose: the endpoint reads
 * that as "keep the one you already have", so re-saving after editing a port
 * does not wipe a working mailbox. The settings form cannot send back a
 * password it was never given.
 */
export async function saveMailbox(input: MailboxInput): Promise<Reply> {
  return call('save', {
    smtp: {
      host: input.smtp.host, port: Number(input.smtp.port) || 587,
      encryption: input.smtp.encryption, username: input.smtp.user, password: input.smtp.pass,
    },
    from: { name: input.from.name, email: input.from.email, replyTo: input.from.replyTo ?? '' },
    imap: input.imap ? {
      host: input.imap.host, port: Number(input.imap.port) || 993,
      encryption: 'ssl', username: input.imap.user, password: input.imap.pass,
      folder: input.imap.folder || 'INBOX',
    } : undefined,
  });
}

/** What the server holds — never the passwords, only whether they are set. */
export async function fetchMailbox(): Promise<StoredMailbox | null> {
  const r = await call('get');
  return r.success ? (r.mailbox ?? null) : null;
}

/** Prove the stored credentials work, and record the answer server-side. */
export async function testStoredSmtp(): Promise<Reply> { return call('test'); }
export async function testStoredImap(): Promise<Reply> { return call('test_imap'); }

export async function deleteMailbox(): Promise<Reply> { return call('delete'); }

/* ── Many mailboxes ────────────────────────────────────────────────────────
 *
 * Everything above this line predates a workspace being allowed more than one
 * mailbox, and is kept because the older settings wizard still calls it. What
 * follows is the real API: a workspace has a list, each entry is validated in
 * each direction on its own, and one of them is the primary that campaigns and
 * the scheduler send from.
 * ─────────────────────────────────────────────────────────────────────────── */

/** What a form hands back for one mailbox. Blank passwords mean "keep". */
export interface MailboxDraft {
  id?: string;
  label: string;
  smtp: { host: string; port: string | number; encryption: string; username: string; password: string };
  from: { name: string; email: string; replyTo?: string };
  imap: { host: string; port: string | number; encryption: string; username: string; password: string; folder: string };
  /*
   * How this mailbox sends: its own SMTP server, or a provider's HTTPS API.
   *
   * These used to be a separate card with its own storage, which made "how does
   * this workspace send mail?" a question with two answers that could disagree.
   * They are one record: an address, and the way messages leave it.
   */
  provider: { name: string; key: string; secret: string; domain: string; url: string };
}

export async function listMailboxes(): Promise<MailboxRecord[]> {
  const r = await call('list');
  return r.success ? (r.mailboxes ?? []) : [];
}

/**
 * Create or update one.
 *
 * Passwords are sent as typed, including empty. The endpoint reads an empty
 * string as "keep the stored one" — the form shows dots and cannot send back a
 * password it was never given, so treating blank as an erasure would wipe a
 * working mailbox every time somebody corrected a port number.
 */
export async function saveMailboxRecord(draft: MailboxDraft): Promise<Reply> {
  return call('save', {
    id: draft.id,
    label: draft.label,
    smtp: {
      host: draft.smtp.host.trim(), port: Number(draft.smtp.port) || 587,
      encryption: draft.smtp.encryption, username: draft.smtp.username.trim(),
      password: draft.smtp.password,
    },
    from: {
      name: draft.from.name, email: draft.from.email.trim(), replyTo: draft.from.replyTo ?? '',
    },
    imap: {
      host: draft.imap.host.trim(), port: Number(draft.imap.port) || 993,
      encryption: draft.imap.encryption, username: draft.imap.username.trim(),
      password: draft.imap.password, folder: draft.imap.folder || 'INBOX',
    },
    provider: {
      name: draft.provider.name || 'smtp',
      key: draft.provider.key, secret: draft.provider.secret,
      domain: draft.provider.domain, url: draft.provider.url,
    },
  });
}

export async function deleteMailboxById(id: string): Promise<Reply> { return call('delete', { id }); }
export async function setPrimaryMailbox(id: string): Promise<Reply> { return call('set_primary', { id }); }

/**
 * Prove one direction works, and record the answer server-side.
 *
 * Two calls rather than one, because they fail independently and a customer
 * fixing their outgoing password should not have to re-prove their inbox. A
 * failure comes back with `diagnosis`: what the server objected to, and the
 * steps that address it.
 */
export async function validateOutgoing(id: string): Promise<Reply> { return call('test_outgoing', { id }); }
export async function validateIncoming(id: string): Promise<Reply> { return call('test_incoming', { id }); }

/* ── A read-only mirror, for code that has to decide something synchronously ──
 *
 * The server is the only place a mailbox lives and the only thing that sends.
 * But plenty of the app needs to answer "is mail set up?" or "what address do
 * we send from?" during a render, and cannot await.
 *
 * Those questions used to be answered from `crm_smtp` — a full copy of the
 * credentials, password included, written by the old setup wizard. This
 * replaces it with a snapshot that has no secrets in it at all: hosts, the from
 * address, and whether each direction has been validated. Nothing can send from
 * it, so a stale or absent cache degrades to "not configured" rather than to a
 * failed send with the wrong credentials.
 */
const CACHE_KEY = 'crm_mailbox_cache';

export interface MailboxSnapshot {
  id: string;
  label: string;
  isPrimary: boolean;
  smtpHost: string;
  /**
   * The address this mailbox signs in as.
   *
   * Not a secret — the password is, and that never leaves the server. This is
   * here because nearly every mail host refuses to send as anything other than
   * the login, and a screen that lets somebody pick a different "from" needs to
   * be able to say so before the send fails with a 553 nobody can read.
   */
  smtpUsername: string;
  fromEmail: string;
  fromName: string;
  imapHost: string;
  canSend: boolean;
  canReceive: boolean;
}

function toSnapshot(m: MailboxRecord): MailboxSnapshot {
  return {
    id: m.id, label: m.label, isPrimary: m.isPrimary,
    smtpHost: m.smtp.host,
    smtpUsername: m.smtp.username,
    fromEmail: m.from.email || m.smtp.username,
    fromName: m.from.name,
    imapHost: m.imap.host,
    /* "Configured" is not the same as "works". These say what the last real
       validation found, so a screen cannot claim a workspace can send on the
       strength of a host name somebody typed. */
    canSend: !!m.outgoing.verifiedAt,
    canReceive: !!m.incoming.verifiedAt,
  };
}

export function cacheMailboxes(list: MailboxRecord[]): void {
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(list.map(toSnapshot))); }
  catch { /* a browser refusing storage is not a reason to fail */ }
}

export function cachedMailboxes(): MailboxSnapshot[] {
  try { return JSON.parse(window.localStorage.getItem(CACHE_KEY) || '[]') as MailboxSnapshot[]; }
  catch { return []; }
}

/** The mailbox campaigns and the scheduler send from. */
export function cachedPrimary(): MailboxSnapshot | null {
  const all = cachedMailboxes();
  return all.find(m => m.isPrimary) ?? all[0] ?? null;
}

/** Fetch and mirror in one go — what a screen calls when it opens. */
export async function refreshMailboxCache(): Promise<MailboxRecord[]> {
  const list = await listMailboxes();
  cacheMailboxes(list);
  return list;
}
