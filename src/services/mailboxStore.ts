/**
 * The workspace's mail server, kept on the server.
 *
 * These settings used to live only in the browser. That meant they vanished
 * when somebody cleared their history, the password travelled with every send,
 * and — the reason this exists — nothing could send while the tab was closed,
 * because the server never held the credentials. Scheduled campaigns were a
 * feature that only worked if you happened to be watching.
 *
 * localStorage stays as a fast local cache so the settings screen fills in
 * instantly and the existing readers keep working. The server is the durable
 * copy and the one the scheduler uses.
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

/**
 * Fill the local cache from the server.
 *
 * Called when the settings screen opens on a device that has never seen this
 * workspace — a second computer, a new browser — so the mailbox appears
 * already configured rather than blank. The passwords are not in the reply, so
 * the cached copy carries empty ones; sending does not need them any more,
 * since the server resolves its own.
 */
export async function hydrateLocalCache(): Promise<StoredMailbox | null> {
  const mb = await fetchMailbox();
  if (!mb?.smtp.host) return mb;
  try {
    const localRaw = window.localStorage.getItem('crm_smtp');
    const local = localRaw ? JSON.parse(localRaw) as { host?: string } : null;
    /* Only when the browser has nothing. A local copy may hold a password the
       server will not hand back, and overwriting it would lose that. */
    if (!local?.host) {
      window.localStorage.setItem('crm_smtp', JSON.stringify({
        host: mb.smtp.host, port: String(mb.smtp.port), user: mb.smtp.username, pass: '',
        fromName: mb.from.name, fromEmail: mb.from.email, encryption: mb.smtp.encryption,
      }));
    }
    const imapRaw = window.localStorage.getItem('crm_imap');
    const imapLocal = imapRaw ? JSON.parse(imapRaw) as { host?: string } : null;
    if (!imapLocal?.host && mb.imap.host) {
      window.localStorage.setItem('crm_imap', JSON.stringify({
        host: mb.imap.host, port: String(mb.imap.port), user: mb.imap.username, pass: '', folder: mb.imap.folder,
      }));
    }
  } catch { /* a browser refusing storage is not a reason to fail the load */ }
  return mb;
}

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
