/**
 * The heartbeat: Autopilot deciding, and Autopilot doing.
 *
 * Two passes, run from the same five-minute cron as the sends.
 *
 *   plan     once a day per workspace. Reads the real records, works out what
 *            should happen, writes it to the ledger — and stops there.
 *   execute  every tick. Takes what is due and carries it out.
 *
 * They are separate on purpose. Planning is cheap and wants to happen rarely;
 * executing is the part that touches the customer's data and wants to happen
 * promptly. Fusing them would mean either re-planning every five minutes — which
 * would produce the same suggestions over and over — or acting only once a day,
 * which makes a queue that a person just approved sit until tomorrow.
 *
 * ── Why an approved action is not carried out by the endpoint ──
 *
 * Approving marks it `pending` and this pass performs it. The endpoint could do
 * it inline and save a few minutes, but then two code paths could send the same
 * email, and the failure mode of that is a customer receiving it twice.
 */
import { dataGet, dataPut, nowIso, type Env } from './lib/db';
import { loadMailbox } from './routes/mailbox';
import { loadSmsConfig } from './lib/sms';
import { planNext, type PlannedAction, type Workspace, type Contact, type Sequence, type Enrolment, type Pipeline } from './lib/autopilotPlan';

const CONTACTS_KEY = 'crm_contacts';
const SEQ_KEY = 'crm_sequences';
const ENROLL_KEY = 'crm_sequence_enrollments';
const PIPELINES_KEY = 'crm_pipelines';
const REVIEW_REQ_KEY = 'crm_reputation_requests';

/** A day between plans. Anything shorter and the same advice repeats. */
const PLAN_EVERY_MS = 20 * 60 * 60 * 1000;

/** The ceiling on actions carried out per workspace per tick, so one busy
 *  workspace cannot exhaust the Worker's time budget for everyone else. */
const MAX_ACTIONS_PER_TICK = 10;

export interface AutopilotReport {
  planned: number;
  carried: number;
  awaiting: number;
  failed: number;
  notes: string[];
}

function parse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

interface RunRow {
  account_id: string;
  status: string;
  guardrails: string;
  last_planned_at: string | null;
}

const rid = () => `ap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Read everything a plan needs, in one go. */
async function readWorkspace(env: Env, accountId: string): Promise<Workspace> {
  const [contacts, sequences, enrolments, pipelines, reviewRequests] = await Promise.all([
    dataGet(env.DB, accountId, CONTACTS_KEY),
    dataGet(env.DB, accountId, SEQ_KEY),
    dataGet(env.DB, accountId, ENROLL_KEY),
    dataGet(env.DB, accountId, PIPELINES_KEY),
    dataGet(env.DB, accountId, REVIEW_REQ_KEY),
  ]);
  const mailbox = await loadMailbox(env, accountId);
  const sms = await loadSmsConfig(env, accountId);

  return {
    contacts: parse<Contact[]>(contacts, []),
    sequences: parse<Sequence[]>(sequences, []),
    enrolments: parse<Enrolment[]>(enrolments, []),
    pipelines: parse<Pipeline[]>(pipelines, []),
    reviewRequests: parse(reviewRequests, []),
    /* "Can send" means validated, not filled in. Planning a campaign around a
       host somebody typed is how a workspace ends up with a queue of messages
       that will never leave. */
    canEmail: !!mailbox?.smtp.host,
    canSms: !!sms?.accountSid && !!sms.fromNumber,
  };
}

/**
 * Decide, and write the decisions down.
 *
 * An action whose `key` already has an open row is skipped rather than added
 * again — otherwise every daily plan would stack another copy of "start 12 new
 * contacts" on top of yesterday's, and the queue would grow for ever while
 * nothing new was actually true.
 */
async function planFor(env: Env, run: RunRow, report: AutopilotReport): Promise<void> {
  const accountId = run.account_id;
  const ws = await readWorkspace(env, accountId);
  const planned = planNext(ws);
  if (!planned.length) return;

  const openRows = await env.DB.prepare(
    `SELECT summary FROM crm_autopilot_actions
     WHERE account_id = ? AND status IN ('pending','awaiting')`,
  ).bind(accountId).all<{ summary: string }>();
  const open = new Set((openRows.results ?? []).map(r => r.summary));

  const guardrails = parse<Record<string, string>>(run.guardrails, {});
  const now = nowIso();

  for (const a of planned) {
    if (open.has(a.summary)) continue;

    /*
     * The guardrail decides whether this waits for a person.
     *
     * 'approval' is the default for sending, so the first campaign of each kind
     * is seen by a human before it goes anywhere. Once they open that channel
     * up, everything after runs without asking — which is the difference
     * between supervised and interrogative.
     */
    const permission = a.permission ? (guardrails[a.permission] ?? 'approval') : 'on';
    if (permission === 'off') continue;

    /*
     * A finding is not a task.
     *
     * `observe` and `error` have nothing to carry out — noticing is the whole
     * action. Sending them through the execution pass marked them "Done", which
     * reads as though Autopilot fixed the thing it was warning about. They are
     * recorded as they are, once, and the pass never sees them.
     */
    const informational = a.effect.type === 'none';
    const status = informational ? 'done'
      : permission === 'approval' ? 'awaiting'
      : 'pending';

    const rowId = rid();
    await env.DB.prepare(
      `INSERT INTO crm_autopilot_actions
       (id, account_id, kind, status, summary, because, counts, effect, due_at, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      rowId, accountId, a.kind, status, a.summary, a.because,
      JSON.stringify(a.counts ?? {}),
      /* Its own column, not `detail`. `detail` is what happened, written at the
         end; putting both in one place meant approving an action erased what it
         was supposed to do — and the tick then reported success having sent
         nothing. */
      JSON.stringify(a.effect),
      null, now,
    ).run();

    if (informational) {
      await env.DB.prepare('UPDATE crm_autopilot_actions SET acted_at = ? WHERE id = ?')
        .bind(now, rowId).run();
    }

    report.planned++;
    if (status === 'awaiting') report.awaiting++;
  }

  await env.DB.prepare('UPDATE crm_autopilot SET last_planned_at = ?, status = ?, updated_at = ? WHERE account_id = ?')
    .bind(now, run.status === 'learning' ? 'running' : run.status, now, accountId).run();
}

/** Carry out one action. Returns what to record against it. */
async function carryOut(
  env: Env,
  accountId: string,
  effect: PlannedAction['effect'],
): Promise<{ ok: boolean; detail: string; link?: { kind: string; id: string; label: string; route: string } }> {
  if (effect.type === 'enrol') {
    const seqs = parse<Sequence[]>(await dataGet(env.DB, accountId, SEQ_KEY), []);
    const seq = seqs.find(s => s.id === effect.sequenceId);
    if (!seq) return { ok: false, detail: 'That sequence no longer exists.' };

    const enrolments = parse<Record<string, unknown>[]>(await dataGet(env.DB, accountId, ENROLL_KEY), []);
    const already = new Set(enrolments.map(e => `${e.contactId}:${e.sequenceId}`));
    const now = nowIso();
    let added = 0;

    for (const contactId of effect.contactIds) {
      if (already.has(`${contactId}:${seq.id}`)) continue;
      enrolments.push({
        id: `enr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        contactId, sequenceId: seq.id, sequenceName: seq.name,
        status: 'active', currentStep: 0, totalSteps: seq.steps?.length ?? 0,
        enrolledAt: now,
        /* Due immediately: the send pass in the same tick picks these up, so a
           lead added this morning is contacted this morning. */
        nextSendAt: now,
        history: [],
      });
      added++;
    }
    if (added) await dataPut(env.DB, accountId, ENROLL_KEY, JSON.stringify(enrolments));
    return {
      ok: true,
      detail: added ? `${added} enrolled.` : 'They were all already enrolled.',
      link: { kind: 'sequence', id: seq.id, label: seq.name, route: '/marketing?tab=sequences' },
    };
  }

  if (effect.type === 'review_request') {
    const reqs = parse<Record<string, unknown>[]>(await dataGet(env.DB, accountId, REVIEW_REQ_KEY), []);
    const already = new Set(reqs.map(r => String(r.contactId ?? '')));
    const now = nowIso();
    let added = 0;
    for (const contactId of effect.contactIds) {
      if (already.has(contactId)) continue;
      reqs.push({
        id: `rr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        contactId, status: 'queued', channel: 'email', createdAt: now,
        source: { origin: 'autopilot', title: 'Autopilot', at: now },
      });
      added++;
    }
    if (added) await dataPut(env.DB, accountId, REVIEW_REQ_KEY, JSON.stringify(reqs));
    return {
      ok: true,
      detail: added ? `${added} queued in Reviews.` : 'They had all been asked already.',
      link: { kind: 'review-request', id: 'queue', label: 'Review requests', route: '/reputation' },
    };
  }

  if (effect.type === 'flag_stalled') {
    /* Flagged, not chased. What to say to a stalled deal is a judgement about
       that particular customer, and a generic nudge sent automatically is worse
       than the silence it replaces. */
    return {
      ok: true,
      detail: `${effect.dealIds.length} deal(s) worth a look.`,
      link: { kind: 'pipeline', id: 'stalled', label: 'Deals that stopped moving', route: '/pipelines' },
    };
  }

  return { ok: true, detail: '' };
}

/** Do what is due, oldest first, within the per-tick ceiling. */
async function executeFor(env: Env, accountId: string, report: AutopilotReport): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT id, effect FROM crm_autopilot_actions
     WHERE account_id = ? AND status = 'pending'
       AND (due_at IS NULL OR due_at <= ?)
     ORDER BY created_at ASC LIMIT ?`,
  ).bind(accountId, nowIso(), MAX_ACTIONS_PER_TICK).all<{ id: string; effect: string }>();

  for (const row of rows.results ?? []) {
    const effect = parse<PlannedAction['effect']>(row.effect, { type: 'none' });
    let result: Awaited<ReturnType<typeof carryOut>>;
    try {
      result = await carryOut(env, accountId, effect);
    } catch (e) {
      result = { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }

    await env.DB.prepare(
      `UPDATE crm_autopilot_actions
       SET status = ?, detail = ?, acted_at = ?,
           link_kind = ?, link_id = ?, link_label = ?, link_route = ?
       WHERE id = ?`,
    ).bind(
      result.ok ? 'done' : 'failed',
      result.detail,
      nowIso(),
      result.link?.kind ?? null, result.link?.id ?? null,
      result.link?.label ?? null, result.link?.route ?? null,
      row.id,
    ).run();

    if (result.ok) report.carried++;
    else { report.failed++; report.notes.push(`${accountId}: ${result.detail.slice(0, 140)}`); }
  }

  if ((rows.results ?? []).length) {
    await env.DB.prepare('UPDATE crm_autopilot SET last_acted_at = ?, updated_at = ? WHERE account_id = ?')
      .bind(nowIso(), nowIso(), accountId).run();
  }
}

/**
 * One tick of Autopilot, across every workspace that has it on.
 *
 * Paused and off are both skipped, and the difference matters elsewhere: paused
 * keeps its plan and its queue so resuming picks up where it stopped.
 */
export async function runAutopilot(env: Env): Promise<AutopilotReport> {
  const report: AutopilotReport = { planned: 0, carried: 0, awaiting: 0, failed: 0, notes: [] };

  const { results } = await env.DB.prepare(
    `SELECT account_id, status, guardrails, last_planned_at FROM crm_autopilot
     WHERE status IN ('learning','running') LIMIT 200`,
  ).all<RunRow>();

  for (const run of results ?? []) {
    try {
      const due = !run.last_planned_at
        || (Date.now() - new Date(run.last_planned_at).getTime()) >= PLAN_EVERY_MS;
      if (due) await planFor(env, run, report);
      await executeFor(env, run.account_id, report);
    } catch (e) {
      /* One workspace's bad data must not stop Autopilot for everyone else —
         the same rule the send pass follows. */
      const msg = e instanceof Error ? e.message : String(e);
      report.failed++;
      report.notes.push(`${run.account_id}: Autopilot's turn failed — ${msg.slice(0, 140)}`);
      await env.DB.prepare('UPDATE crm_autopilot SET last_error = ?, updated_at = ? WHERE account_id = ?')
        .bind(msg.slice(0, 400), nowIso(), run.account_id).run();
    }
  }

  return report;
}
