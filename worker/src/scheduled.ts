/**
 * Sending on a schedule, with nobody logged in.
 *
 * Until now the app's "due work" ran on a heartbeat inside the browser. That
 * worked while somebody had a tab open and did nothing at all otherwise — a
 * campaign scheduled for 9am Tuesday went out only if that customer happened
 * to be looking at the app at 9am Tuesday. For a product whose whole point is
 * scheduled follow-up, that is the feature not existing.
 *
 * Two things had to be true before this could move to the server, and now both
 * are: the workspace's mail credentials live in D1 rather than a browser, and
 * the app syncs its sequences, enrolments and contacts up through data.php.
 * So this reads what is due, sends it with that workspace's own mail server,
 * and writes the enrolments back.
 *
 * It is deliberately conservative. A cron that double-sends is worse than one
 * that misses a tick — the recipient sees the mistake either way, but only
 * one of them is embarrassing twice.
 */
import type { Env } from './lib/db';
import { dataGet, dataPut } from './lib/db';
import { loadMailbox } from './routes/mailbox';
import { smtpSend } from './lib/smtp';
import { buildMime } from './lib/mime';

/* Keys the browser syncs up. Same names it uses locally. */
const ENROLL_KEY = 'crm_sequence_enrollments';
const SEQ_KEY = 'crm_sequences';
const CONTACTS_KEY = 'crm_contacts';
const EMAILS_KEY = 'crm_contact_emails';

interface Enrollment {
  id: string;
  contactId: string;
  sequenceId: string;
  sequenceName: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  currentStep: number;
  totalSteps: number;
  enrolledAt: string;
  nextSendAt?: string;
  history: { step: number; at: string; action: string }[];
}

interface Step { id: string; day: number; waitUnit: 'hours' | 'days'; subject: string; body: string }
interface Sequence { id: string; name: string; status: string; steps: Step[] }
interface Contact { id: string; name?: string; firstName?: string; lastName?: string; email?: string; company?: string; jobTitle?: string }

/** The per-run ceiling. A workspace with a huge backlog is spread over ticks
 *  rather than being allowed to exhaust the Worker's time budget in one go. */
const MAX_SENDS_PER_ACCOUNT = 25;

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/** The same merge fields the browser fills in, so a server-sent step reads
 *  identically to one sent from an open tab. */
function personalise(text: string, c: Contact): string {
  const first = c.firstName || (c.name ?? '').split(' ')[0] || '';
  const map: Record<string, string> = {
    firstName: first,
    lastName: c.lastName ?? '',
    name: c.name ?? first,
    email: c.email ?? '',
    company: c.company ?? '',
    jobTitle: c.jobTitle ?? '',
  };
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(map, key) ? map[key] : whole);
}

function nextSendFor(amount: number, unit: 'hours' | 'days'): string {
  const ms = unit === 'hours' ? amount * 3_600_000 : amount * 86_400_000;
  return new Date(Date.now() + ms).toISOString();
}

export interface TickReport { accounts: number; sent: number; failed: number; notes: string[] }

/**
 * One account's due work.
 *
 * Everything is read once, mutated in memory, and written back once — a
 * partial write halfway through a batch would leave enrolments pointing at
 * steps that had already gone out.
 */
async function runAccount(env: Env, accountId: string, report: TickReport): Promise<void> {
  const enrolments = parseJson<Enrollment[]>(await dataGet(env.DB, accountId, ENROLL_KEY), []);
  if (!enrolments.length) return;

  const due = enrolments.filter(e =>
    e.status === 'active' && e.nextSendAt && new Date(e.nextSendAt).getTime() <= Date.now());
  if (!due.length) return;

  const sequences = parseJson<Sequence[]>(await dataGet(env.DB, accountId, SEQ_KEY), []);
  const contacts = parseJson<Contact[]>(await dataGet(env.DB, accountId, CONTACTS_KEY), []);

  const mailbox = await loadMailbox(env, accountId);
  if (!mailbox?.smtp.host) {
    /* Nothing to send with. Said out loud in the log rather than silently
       skipped, because "my scheduled campaign never went" with no explanation
       is the worst possible version of this. */
    report.notes.push(`${accountId}: ${due.length} message(s) due but no mail server is set up`);
    return;
  }
  if (mailbox.smtp.username && !mailbox.smtp.password) {
    report.notes.push(`${accountId}: stored mailbox password could not be decrypted — it needs re-entering`);
    return;
  }

  let touched = false;
  let sentHere = 0;

  for (const enr of due) {
    if (sentHere >= MAX_SENDS_PER_ACCOUNT) {
      report.notes.push(`${accountId}: reached the per-run limit; the rest will go on the next tick`);
      break;
    }

    const seq = sequences.find(s => s.id === enr.sequenceId);
    const contact = contacts.find(c => c.id === enr.contactId);
    const step = seq?.steps[enr.currentStep];
    if (!seq || !contact || !step || !contact.email) continue;
    /* A sequence someone paused mid-flight must not keep sending. */
    if (seq.status === 'paused') continue;

    const html = personalise(step.body ?? '', contact);
    const subject = personalise(step.subject ?? '', contact);
    const fromEmail = mailbox.from.email || mailbox.smtp.username;

    const mime = buildMime({
      fromName: mailbox.from.name || 'CRM',
      fromEmail,
      to: contact.email,
      subject,
      html,
      replyTo: mailbox.from.replyTo || undefined,
    }, mailbox.smtp.host);

    const out = await smtpSend(mailbox.smtp, { from: fromEmail, to: contact.email, mime });

    /* Advance whether or not the send succeeded.
       Leaving currentStep where it was means the next tick — a minute later —
       tries the same message again, and again, writing a failed row each time.
       A permanent failure would become a loop. The failure is recorded on the
       enrolment instead so it can be seen. */
    enr.history.push({
      step: enr.currentStep,
      at: new Date().toISOString(),
      action: out.ok ? 'sent' : 'failed',
    });
    enr.currentStep += 1;
    if (enr.currentStep >= enr.totalSteps) {
      enr.status = 'completed';
      enr.nextSendAt = undefined;
    } else {
      const next = seq.steps[enr.currentStep];
      enr.nextSendAt = nextSendFor(next?.day ?? 1, next?.waitUnit ?? 'days');
    }

    touched = true;
    if (out.ok) { report.sent++; sentHere++; }
    else { report.failed++; report.notes.push(`${accountId}: ${contact.email} — ${out.error.slice(0, 120)}`); }

    /* A record of the send, in the same shape the app keeps locally, so the
       contact's history shows server-sent mail alongside everything else. */
    const emails = parseJson<Record<string, unknown>[]>(await dataGet(env.DB, accountId, EMAILS_KEY), []);
    emails.unshift({
      id: `em-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      contactId: contact.id, subject, body: html,
      status: out.ok ? 'sent' : 'failed',
      direction: 'outbound',
      createdAt: new Date().toISOString(),
      sentAt: out.ok ? new Date().toISOString() : undefined,
      opens: 0, clicks: 0, clickedUrls: [], attachments: [],
      threadId: `th-${enr.id}`, toEmail: contact.email,
      sequenceId: seq.id,
      error: out.ok ? undefined : out.error,
    });
    await dataPut(env.DB, accountId, EMAILS_KEY, JSON.stringify(emails.slice(0, 2000)));
  }

  if (touched) await dataPut(env.DB, accountId, ENROLL_KEY, JSON.stringify(enrolments));
}

/**
 * Every workspace that has a mailbox, once per tick.
 *
 * Driven off crm_mailboxes rather than off every account that exists: an
 * account with no mail server configured has nothing this can do for it, and
 * scanning them all would grow the tick's cost with the customer list.
 */
export async function runScheduledSends(env: Env): Promise<TickReport> {
  const report: TickReport = { accounts: 0, sent: 0, failed: 0, notes: [] };

  const { results } = await env.DB.prepare(
    "SELECT account_id FROM crm_mailboxes WHERE smtp_host != '' LIMIT 500",
  ).all<{ account_id: string }>();

  for (const row of results ?? []) {
    report.accounts++;
    try {
      await runAccount(env, row.account_id, report);
    } catch (e) {
      /* One workspace's bad data must not stop every other workspace's mail. */
      report.notes.push(`${row.account_id}: tick failed — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return report;
}
