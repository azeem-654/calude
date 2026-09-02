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

const note = (report: TickReport, accountId: string, text: string, kind: 'info' | 'problem' = 'problem') => {
  /* Bounded: a workspace with a thousand bad addresses must not write a
     megabyte of JSON into every tick row. */
  if (report.notes.length < 200) report.notes.push({ accountId, text: text.slice(0, 300), kind });
};

function nextSendFor(amount: number, unit: 'hours' | 'days'): string {
  const ms = unit === 'hours' ? amount * 3_600_000 : amount * 86_400_000;
  return new Date(Date.now() + ms).toISOString();
}

/**
 * Notes carry the workspace they belong to.
 *
 * The tick is shared by every customer on the install, and its account of
 * itself is now read back by them — so "no mail server is set up" has to be
 * attributable to one workspace rather than shown to all of them.
 */
export interface TickNote {
  accountId: string;
  text: string;
  /* 'info' is something that went right and is worth seeing; 'problem' is
     something a person has to act on. Told apart because a health screen that
     files "1 contact enrolled" under things that went wrong teaches people to
     stop reading it. */
  kind: 'info' | 'problem';
}
export interface TickReport { accounts: number; sent: number; failed: number; started: number; notes: TickNote[] }

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
    note(report, accountId, `${due.length} message(s) due, but no mail server is set up for this workspace.`);
    return;
  }
  if (mailbox.smtp.username && !mailbox.smtp.password) {
    note(report, accountId, 'The stored mailbox password could not be read back. Enter it again in Settings → Email.');
    return;
  }

  let touched = false;
  let sentHere = 0;

  for (const enr of due) {
    if (sentHere >= MAX_SENDS_PER_ACCOUNT) {
      note(report, accountId, 'Reached this run\'s limit; the rest go on the next tick.');
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
    else { report.failed++; note(report, accountId, `${contact.email} — ${out.error.slice(0, 140)}`); }

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
  const report: TickReport = { accounts: 0, sent: 0, failed: 0, started: 0, notes: [] };

  /*
   * Starts first, sends second, in that order and in the same tick.
   *
   * A campaign told to begin at nine should go out at nine. Enrolling on one
   * tick and sending on the next would make every scheduled start up to five
   * minutes late for no reason — and the enrolments this creates are due
   * immediately, so the pass below picks them up as it goes.
   */
  await runDueSchedules(env, report);

  const { results } = await env.DB.prepare(
    "SELECT account_id FROM crm_mailboxes WHERE smtp_host != '' LIMIT 500",
  ).all<{ account_id: string }>();

  for (const row of results ?? []) {
    report.accounts++;
    try {
      await runAccount(env, row.account_id, report);
    } catch (e) {
      /* One workspace's bad data must not stop every other workspace's mail. */
      note(report, row.account_id, `This workspace's turn failed — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return report;
}

/* ── Campaigns that start on their own ───────────────────────────────────── */

interface ScheduleRow {
  id: string;
  account_id: string;
  ref_id: string;
  label: string;
  audience: string;
}

interface Audience { status?: string[]; tags?: string[]; limit?: number }

/** Contacts as the app stores them, only the fields the audience filter reads. */
interface AudienceContact { id: string; email?: string; status?: string; tags?: string[] }

/**
 * Who this schedule is for.
 *
 * An empty filter means everybody with an address, which is what somebody who
 * left the fields alone meant. Anything they did name narrows it: statuses are
 * an "any of these" set, tags likewise, and both together is an and.
 */
function matches(c: AudienceContact, a: Audience): boolean {
  if (!c.email) return false;
  if (a.status?.length && !a.status.includes(c.status ?? '')) return false;
  if (a.tags?.length) {
    const tags = c.tags ?? [];
    if (!a.tags.some(t => tags.includes(t))) return false;
  }
  return true;
}

/**
 * Every schedule that has come due, enrolled and switched on.
 *
 * The conservative choices are the interesting ones. A contact already in this
 * sequence is not enrolled twice — somebody who scheduled the same campaign
 * for two dates, or re-ran a flow, would otherwise get their list mailed twice
 * over. And a schedule that finds nobody is marked done with the reason rather
 * than left pending: retrying it every five minutes forever would never find
 * anybody either, and the row would hide the fact that the audience was empty.
 */
async function runDueSchedules(env: Env, report: TickReport): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT id, account_id, ref_id, label, audience FROM crm_schedules
      WHERE status = 'pending' AND kind = 'sequence_start' AND start_at <= ?
      ORDER BY start_at LIMIT 20`,
  ).bind(new Date().toISOString()).all<ScheduleRow>();

  for (const row of results ?? []) {
    try {
      const audience = parseJson<Audience>(row.audience, {});
      const sequences = parseJson<Sequence[]>(await dataGet(env.DB, row.account_id, SEQ_KEY), []);
      const seq = sequences.find(s => s.id === row.ref_id);

      if (!seq || !seq.steps?.length) {
        await finish(env, row.id, 'failed', 'That campaign no longer exists in this workspace.');
        note(report, row.account_id, `"${row.label}" did not start: the campaign is gone.`);
        continue;
      }

      const contacts = parseJson<AudienceContact[]>(await dataGet(env.DB, row.account_id, CONTACTS_KEY), []);
      const enrolments = parseJson<Enrollment[]>(await dataGet(env.DB, row.account_id, ENROLL_KEY), []);
      const already = new Set(
        enrolments.filter(e => e.sequenceId === seq.id && e.status !== 'cancelled').map(e => e.contactId),
      );

      const picked = contacts
        .filter(c => matches(c, audience) && !already.has(c.id))
        .slice(0, audience.limit ?? 2000);

      if (!picked.length) {
        await finish(env, row.id, 'done', 'Nobody matched — either the audience is empty or everyone is already enrolled.');
        note(report, row.account_id, `"${row.label}" started but matched nobody.`);
        continue;
      }

      const now = new Date();
      const first = seq.steps[0];
      /* The first step's own delay is honoured from the start date rather than
         ignored: a sequence whose step one waits two days should wait them. */
      const firstDue = new Date(
        now.getTime()
        + (first?.day ?? 0) * (first?.waitUnit === 'hours' ? 3_600_000 : 86_400_000),
      ).toISOString();

      for (const c of picked) {
        enrolments.push({
          id: `enr-${row.id}-${c.id}`.slice(0, 80),
          contactId: c.id,
          sequenceId: seq.id,
          sequenceName: seq.name,
          status: 'active',
          currentStep: 0,
          totalSteps: seq.steps.length,
          enrolledAt: now.toISOString(),
          nextSendAt: firstDue,
          history: [],
        });
      }

      await dataPut(env.DB, row.account_id, ENROLL_KEY, JSON.stringify(enrolments));

      /* Draft campaigns do not send. The schedule is the act of turning it on,
         so this is what makes a flow written on Friday actually go on Tuesday. */
      if (seq.status !== 'active') {
        const next = sequences.map(s => (s.id === seq.id ? { ...s, status: 'active' } : s));
        await dataPut(env.DB, row.account_id, SEQ_KEY, JSON.stringify(next));
      }

      await finish(env, row.id, 'done', `Enrolled ${picked.length} contact${picked.length === 1 ? '' : 's'} and switched the campaign on.`);
      report.started++;
      note(report, row.account_id, `"${row.label}" started — ${picked.length} contact${picked.length === 1 ? '' : 's'} enrolled.`, 'info');

      /*
       * Said now rather than never.
       *
       * The sending pass only visits workspaces that have a mail server, so a
       * schedule that starts in a workspace without one would enrol everybody
       * and then go quiet with nothing anywhere explaining why. One extra query
       * per started schedule buys the customer the sentence that answers it.
       */
      const hasMail = await env.DB.prepare(
        "SELECT 1 AS n FROM crm_mailboxes WHERE account_id = ? AND smtp_host != ''",
      ).bind(row.account_id).first<{ n: number }>();
      if (!hasMail) {
        note(report, row.account_id, `"${row.label}" is enrolled and on, but nothing can send until a mail server is set up in Settings → Email.`);
      }
    } catch (e) {
      /* One bad schedule must not stop the others, and the row keeps the reason
         so somebody can see it without reading a log. */
      const why = e instanceof Error ? e.message : String(e);
      await finish(env, row.id, 'failed', why.slice(0, 280));
      note(report, row.account_id, `"${row.label}" failed to start — ${why.slice(0, 140)}`);
    }
  }
}

async function finish(env: Env, id: string, status: 'done' | 'failed', detail: string): Promise<void> {
  await env.DB.prepare('UPDATE crm_schedules SET status = ?, detail = ?, ran_at = ? WHERE id = ?')
    .bind(status, detail.slice(0, 300), new Date().toISOString(), id).run();
}

/* ── The tick's own record ───────────────────────────────────────────────── */

/**
 * What this tick did, written where the customer can read it.
 *
 * Pruned in the same statement that writes: a row every five minutes is a
 * hundred thousand a year, and a health readout nobody prunes eventually costs
 * more to store than the thing it is reporting on. Four days is enough to
 * answer "did last night's campaign go out".
 */
export async function recordTick(env: Env, ms: number, report: TickReport): Promise<void> {
  try {
    await env.DB.prepare(
      'INSERT INTO crm_ticks (id, at, ms, accounts, sent, failed, started, notes) VALUES (?,?,?,?,?,?,?,?)',
    ).bind(
      crypto.randomUUID(), new Date().toISOString(), ms,
      report.accounts, report.sent, report.failed, report.started,
      JSON.stringify(report.notes),
    ).run();

    await env.DB.prepare("DELETE FROM crm_ticks WHERE at < datetime('now', '-4 days')").run();
  } catch {
    /* A health readout that cannot be written is not a reason to fail a tick
       that has already sent real mail. */
  }
}
