/**
 * Running the automations somebody drew.
 *
 * ── What this closes ──
 *
 * `crm_automations` — the node graph in Marketing → Automations, with a
 * trigger, waits, conditions, "send email", "send SMS", tags and tasks — has
 * been buildable for a long time and has never once run. No runner existed in
 * the Worker and none in the browser. The customer drew a follow-up, made it
 * Active, and nothing happened, for ever, silently.
 *
 * This is the runner. It is deliberately built the same way the sequence tick
 * is, because that one works and has been argued with in production:
 *
 *  - the graph is **read** from the browser-owned blob and never written back;
 *  - the position of each person in it is **server state**, in `crm_automation_runs`;
 *  - one node per person per tick, so a graph cannot monopolise the Worker;
 *  - a hard ceiling on steps, so a graph pointing at itself stops rather than
 *    sending for ever;
 *  - anything that edits the contact is *proposed* to the browser rather than
 *    written, because the contact list is the browser's document.
 *
 * ── One node a tick, and why that is not slow ──
 *
 * A node either has an effect (send, tag) or is a wait. Doing one per tick
 * means a three-step graph takes fifteen minutes end to end, which sounds bad
 * until you notice that every graph anybody draws has a wait between its steps
 * measured in hours or days. The case it protects against is real: a graph with
 * forty tagging nodes and no waits, enrolled by a busy form, executed in full
 * inside one 30-second invocation.
 *
 * Waits are honoured exactly: `due_at` moves forward and the run is simply not
 * selected again until then. Nothing sleeps.
 */
import { businessFor, personalise, textToHtml, type Business } from './mergeFields';
import { signTrackedLinks } from './trackSign';
import type { Env } from './db';
import { dataGet } from './db';
import { logDelivery } from './deliveryLog';
import { loadMailbox } from '../routes/mailbox';
import { loadSmsConfig, sendSms } from './sms';
import { smtpSend } from './smtp';
import { buildMime } from './mime';

const AUTOMATIONS_KEY = 'crm_automations';
const CONTACTS_KEY = 'crm_contacts';

/**
 * How many nodes one enrolment may ever pass through.
 *
 * Not a performance limit — a brake on a graph that loops. `nextId` is drawn by
 * hand in the builder and nothing stops somebody pointing the last node back at
 * the first. Without this that graph sends one email a tick, for ever, to a
 * real person. Two hundred is far more than any honest automation needs and far
 * fewer than the number of emails it takes to get a domain blocked.
 */
const MAX_STEPS = 200;

/** Runs advanced per tick. The rest wait; they are due and stay due. */
const MAX_RUNS_PER_TICK = 120;

/* ── The graph, as the browser stores it ── */

export interface AutomationNode {
  id: string;
  type: string;
  label: string;
  config: Record<string, string>;
  nextId: string | null;
  yesId?: string | null;
  noId?: string | null;
}

export interface Automation {
  id: string;
  name: string;
  description?: string;
  status: string;
  nodes: AutomationNode[];
  /** Set when a project owns this graph, so a project can show only its own. */
  projectId?: string;
  /**
   * Which list it came from.
   *
   * `marketing` is the workspace-wide list in Marketing → Automations, kept in
   * the browser-owned blob. `project` is an AI Autopilot project's own, in
   * `crm_project_workflows` on the server. They are separate lists on separate
   * screens and neither writes the other's rows.
   *
   * The engine runs both, identically. Two executors would be two
   * implementations of wait, condition and send, and they would drift the first
   * time either was fixed.
   */
  source?: 'marketing' | 'project';
}

/**
 * Every live graph in a workspace, from both lists.
 *
 * One function so the tick and the enrolment path can never disagree about
 * what exists — a graph visible to one and not the other is a workflow that
 * enrols people and then reports itself deleted on the next pass.
 */
export async function loadGraphs(env: Env, accountId: string): Promise<Automation[]> {
  /* Marketing's, from the blob the Worker may read and must never write. */
  const fromBlob = parseJson<Automation[]>(await dataGet(env.DB, accountId, AUTOMATIONS_KEY), [])
    .filter(a => a && typeof a === 'object')
    .map(a => ({ ...a, source: 'marketing' as const }));

  /* The projects' own, from the server. Defended rather than trusted: a row
     whose JSON cannot be read is skipped with its name intact rather than
     taking the whole tick down. */
  let fromProjects: Automation[] = [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, project_id AS projectId, name, description, status, nodes
       FROM crm_project_workflows WHERE account_id = ? ORDER BY position, created_at`,
    ).bind(accountId).all<{ id: string; projectId: string; name: string; description: string; status: string; nodes: string }>();
    fromProjects = (results ?? []).map(r => ({
      id: r.id, name: r.name, description: r.description, status: r.status,
      nodes: parseJson<AutomationNode[]>(r.nodes, []),
      projectId: r.projectId,
      source: 'project' as const,
    }));
  } catch { fromProjects = []; }

  return [...fromProjects, ...fromBlob];
}

interface Contact {
  id: string;
  name?: string; firstName?: string; lastName?: string;
  email?: string; phone?: string; company?: string; jobTitle?: string;
  status?: string; tags?: string[];
}

export interface AutomationReport {
  advanced: number;
  sent: number;
  failed: number;
  finished: number;
  notes: string[];
}

const nowIso = () => new Date().toISOString();
const rid = (p: string) => `${p}-${crypto.randomUUID()}`;

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { const v = JSON.parse(raw); return (v ?? fallback) as T; } catch { return fallback; }
}

/** Merge tags into one lower-cased set, so "VIP" and "vip" are one tag. */
const tagSet = (c: Contact): Set<string> =>
  new Set((c.tags ?? []).map(t => String(t).toLowerCase().trim()).filter(Boolean));

/* `{{firstName}}` and friends — and the business's own fields — live in
   lib/mergeFields.ts, shared with the sequence tick. */

/* ── Enrolment ─────────────────────────────────────────────────────────────
 *
 * Called at the moment something happens, not polled. An event that has to wait
 * up to five minutes to be noticed is an event that cannot drive an instant
 * acknowledgement, which is the single most useful thing an automation does.
 */

export { triggerMatches, type TriggerEvent } from './triggers';
import { triggerMatches, type TriggerEvent } from './triggers';

/**
 * Put somebody into every live automation whose trigger fits.
 *
 * Never throws. This runs inside a public form submission: a broken graph must
 * not be the reason a stranger's enquiry is refused.
 */
export async function enrolOnEvent(env: Env, accountId: string, ev: TriggerEvent): Promise<number> {
  if (!ev.contactId) return 0;
  try {
    const automations = await loadGraphs(env, accountId);
    const live = automations.filter(a => a.status === 'active' && Array.isArray(a.nodes) && a.nodes.length);
    if (!live.length) return 0;

    let started = 0;
    for (const a of live) {
      const trigger = a.nodes.find(n => n.type === 'trigger');
      if (!triggerMatches(trigger, ev)) continue;

      /* The first node *after* the trigger. The trigger itself is a label for
         the condition that got us here, not a step to carry out. */
      const firstId = trigger?.nextId ?? a.nodes.find(n => n.id !== trigger?.id)?.id ?? '';
      if (!firstId) continue;

      /* `INSERT OR IGNORE` against the unique index rather than a SELECT then an
         INSERT: two form submissions landing in the same second would both pass
         a check-then-write and enrol the same person twice. */
      const r = await env.DB.prepare(
        `INSERT OR IGNORE INTO crm_automation_runs
           (id, account_id, automation_id, automation_name, contact_id, contact_name, contact_email, contact_phone,
            node_id, due_at, status, trigger_kind, trigger_ref, workflow_source, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?,?)`,
      ).bind(
        rid('ar'), accountId, a.id, String(a.name ?? '').slice(0, 160),
        ev.contactId, (ev.contactName ?? '').slice(0, 120),
        (ev.contactEmail ?? '').slice(0, 190), (ev.contactPhone ?? '').slice(0, 40),
        firstId, nowIso(), ev.kind, (ev.ref ?? '').slice(0, 160),
        a.source ?? 'marketing', nowIso(), nowIso(),
      ).run();
      if (r.meta?.changes) started += 1;
    }
    return started;
  } catch {
    /* Deliberately silent to the caller. The submission is the thing that must
       not fail; a missed enrolment is recoverable and a refused enquiry is not. */
    return 0;
  }
}

/* ── The tick ─────────────────────────────────────────────────────────────── */

interface RunRow {
  id: string; account_id: string; automation_id: string; automation_name: string;
  contact_id: string; contact_name: string; contact_email: string; contact_phone: string;
  node_id: string; steps_taken: number;
}

async function log(env: Env, accountId: string, runId: string, nodeId: string, nodeType: string, status: string, detail: string) {
  try {
    await env.DB.prepare(
      `INSERT INTO crm_automation_log (id, account_id, run_id, node_id, node_type, status, detail, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).bind(rid('al'), accountId, runId, nodeId, nodeType, status, detail.slice(0, 600), nowIso()).run();
  } catch { /* a log line must never be the reason a run stops */ }
}

async function propose(env: Env, accountId: string, contactId: string, kind: string, field: string, value: string, sourceId: string) {
  try {
    await env.DB.prepare(
      `INSERT INTO crm_contact_changes (id, account_id, contact_id, kind, field, value, source, source_id, created_at)
       VALUES (?,?,?,?,?,?,'automation',?,?)`,
    ).bind(rid('cc'), accountId, contactId, kind, field.slice(0, 60), value.slice(0, 400), sourceId, nowIso()).run();
  } catch { /* see above */ }
}

/**
 * End a run, and count the step that ended it.
 *
 * `steps` is not optional decoration. The last node of a graph has no `nextId`,
 * so it used to be carried out and then written down by `finish`, which did not
 * touch `steps_taken` — leaving every completed run reporting one step fewer
 * than it took. A three-step follow-up said "2 steps" on the screen, and the
 * loop brake counted low by one on every path that ended.
 *
 * Left undefined by the callers that end a run *without* carrying anything out
 * — a deleted automation, a contact with no address — because those genuinely
 * took no step.
 */
const finish = (env: Env, id: string, status: string, detail: string, steps?: number) =>
  (steps === undefined
    ? env.DB.prepare('UPDATE crm_automation_runs SET status = ?, detail = ?, node_id = \'\', updated_at = ? WHERE id = ?')
        .bind(status, detail.slice(0, 400), nowIso(), id)
    : env.DB.prepare('UPDATE crm_automation_runs SET status = ?, detail = ?, node_id = \'\', steps_taken = ?, updated_at = ? WHERE id = ?')
        .bind(status, detail.slice(0, 400), steps, nowIso(), id)
  ).run();

const advance = (env: Env, id: string, nodeId: string, dueAt: string, steps: number) =>
  env.DB.prepare('UPDATE crm_automation_runs SET node_id = ?, due_at = ?, steps_taken = ?, updated_at = ? WHERE id = ?')
    .bind(nodeId, dueAt, steps, nowIso(), id).run();

/**
 * Is this condition true of this contact?
 *
 * Only over what the Worker can actually see: the contact's own fields and its
 * tags. Conditions the builder offers that depend on behaviour nothing records
 * yet — "opened the email" — are answered `null`, meaning *unknown*, and an
 * unknown takes the **no** branch while saying so in the log.
 *
 * That choice is deliberate and it is the conservative one. The yes branch of
 * an "opened?" condition is where the harder sell lives; treating "we cannot
 * tell" as "yes" would send the pushy follow-up to somebody who never opened
 * anything.
 */
export function evaluate(node: AutomationNode, c: Contact): boolean | null {
  const cfg = node.config ?? {};
  const field = String(cfg.field ?? '').trim();
  const op = String(cfg.operator ?? 'equals').trim();
  const want = String(cfg.value ?? '').trim().toLowerCase();

  let have: string | null = null;
  if (field === 'tag' || field === 'tags') {
    have = Array.from(tagSet(c)).join(',');
    if (op === 'contains' || op === 'equals') return tagSet(c).has(want);
  } else if (field === 'status') have = String(c.status ?? '').toLowerCase();
  else if (field === 'email') have = String(c.email ?? '').toLowerCase();
  else if (field === 'phone') have = String(c.phone ?? '').toLowerCase();
  else if (field === 'company') have = String(c.company ?? '').toLowerCase();
  else if (field === 'name') have = String(c.name ?? '').toLowerCase();
  else return null;   // email_opened, link_clicked and friends: nothing records these yet

  if (have === null) return null;
  if (op === 'contains') return have.includes(want);
  if (op === 'not_equals') return have !== want;
  if (op === 'is_set') return have.length > 0;
  if (op === 'is_empty') return have.length === 0;
  return have === want;
}

/** A wait node's config, in milliseconds. Defaults to a day, as the label says. */
export function waitMs(cfg: Record<string, string>): number {
  const days = Number(cfg.days);
  const hours = Number(cfg.hours);
  const minutes = Number(cfg.minutes);
  let ms = 0;
  if (Number.isFinite(days) && days > 0) ms += days * 86_400_000;
  if (Number.isFinite(hours) && hours > 0) ms += hours * 3_600_000;
  if (Number.isFinite(minutes) && minutes > 0) ms += minutes * 60_000;
  /* Clamped at 180 days. A wait longer than that is almost always a typo —
     "wait 365" meaning hours — and the cost of the typo is a person sitting in
     an automation for a year. */
  return Math.min(ms || 86_400_000, 180 * 86_400_000);
}

/**
 * Advance every run that is due.
 *
 * Grouped by workspace so the mailbox, the SMS credentials and the graph are
 * each loaded once rather than once per person.
 */
export async function runAutomations(env: Env): Promise<AutomationReport> {
  const report: AutomationReport = { advanced: 0, sent: 0, failed: 0, finished: 0, notes: [] };

  const { results } = await env.DB.prepare(
    `SELECT id, account_id, automation_id, automation_name, contact_id, contact_name, contact_email, contact_phone,
            node_id, steps_taken
     FROM crm_automation_runs
     WHERE status = 'active' AND due_at <= ?
     ORDER BY due_at ASC LIMIT ?`,
  ).bind(nowIso(), MAX_RUNS_PER_TICK).all<RunRow>();

  const rows = results ?? [];
  if (!rows.length) return report;

  const byAccount = new Map<string, RunRow[]>();
  for (const r of rows) {
    const list = byAccount.get(r.account_id) ?? [];
    list.push(r);
    byAccount.set(r.account_id, list);
  }

  for (const [accountId, runs] of byAccount) {
    const automations = await loadGraphs(env, accountId);
    const contacts = parseJson<Contact[]>(await dataGet(env.DB, accountId, CONTACTS_KEY), []);

    /* Loaded lazily: a workspace whose runs are all waits and tags should not
       pay for a mailbox lookup, and a workspace with no mail server should
       still run everything that is not an email. */
    let mailbox: Awaited<ReturnType<typeof loadMailbox>> | undefined;
    let smsCfg: Awaited<ReturnType<typeof loadSmsConfig>> | undefined;
    let mailboxLoaded = false;
    const bizCache = new Map<string, Business>();
    let smsLoaded = false;

    for (const run of runs) {
      const a = automations.find(x => x.id === run.automation_id);
      if (!a) {
        await finish(env, run.id, 'stopped', 'The automation no longer exists.');
        report.finished += 1;
        continue;
      }
      /* Paused mid-flight stops where it is rather than being thrown away — a
         customer who pauses to fix a typo expects to un-pause, not to re-enrol
         everybody. `due_at` is left alone, so it resumes on the next tick. */
      if (a.status !== 'active') {
        await log(env, accountId, run.id, run.node_id, '', 'skipped', `"${a.name}" is ${a.status}.`);
        continue;
      }

      const node = a.nodes.find(n => n.id === run.node_id);
      if (!node || node.type === 'end') {
        await finish(env, run.id, 'done', node ? 'Reached the end.' : 'The next step was removed from the automation.');
        report.finished += 1;
        continue;
      }

      if (run.steps_taken >= MAX_STEPS) {
        await finish(env, run.id, 'failed', `Stopped after ${MAX_STEPS} steps — this automation loops back on itself.`, run.steps_taken);
        await log(env, accountId, run.id, node.id, node.type, 'failed', 'Step ceiling reached; the graph has a cycle.');
        report.failed += 1;
        report.notes.push(`"${a.name}" stopped after ${MAX_STEPS} steps. Its steps point back at each other.`);
        continue;
      }

      /*
       * Who this run is about — from the CRM if it is there, from the run row
       * if it is not yet.
       *
       * A lead enrolled by a form half a minute ago is *not* in `crm_contacts`:
       * that list is the browser's document, and nothing writes to it until
       * somebody opens the app and the capture is merged. Stopping the run for
       * a missing contact would mean every automation triggered by a form did
       * nothing unless its owner happened to be logged in at the time — which
       * is the whole failure this engine exists to end.
       *
       * So the run carries the name, address and number it was enrolled with,
       * and `mark_merged` swaps in the real CRM id the moment one exists. From
       * then on this finds the full record and personalises from that.
       */
      const contact: Contact = contacts.find(c => c.id === run.contact_id) ?? {
        id: run.contact_id,
        name: run.contact_name,
        email: run.contact_email,
        phone: run.contact_phone,
      };
      if (!contact.email && !contact.phone) {
        await finish(env, run.id, 'stopped', 'No address or number is known for this person.');
        report.finished += 1;
        continue;
      }

      const steps = run.steps_taken + 1;
      let nextId: string | null = node.nextId ?? null;
      let dueAt = nowIso();

      if (node.type === 'wait') {
        dueAt = new Date(Date.now() + waitMs(node.config ?? {})).toISOString();
        await log(env, accountId, run.id, node.id, node.type, 'ok', `Waiting until ${dueAt}.`);

      } else if (node.type === 'condition') {
        const verdict = evaluate(node, contact);
        nextId = verdict ? (node.yesId ?? node.nextId ?? null) : (node.noId ?? node.nextId ?? null);
        await log(env, accountId, run.id, node.id, node.type, 'ok',
          verdict === null
            ? `Nothing records "${node.config?.field ?? 'that'}" yet, so this took the No branch.`
            : `${verdict ? 'Yes' : 'No'} — took that branch.`);

      } else if (node.type === 'send_email') {
        if (!mailboxLoaded) { mailbox = await loadMailbox(env, accountId); mailboxLoaded = true; }
        const to = (contact.email ?? '').trim();
        const canEmail = !!mailbox?.smtp.host && !(mailbox.smtp.username && !mailbox.smtp.password);
        if (!to) {
          await log(env, accountId, run.id, node.id, node.type, 'skipped', `${contact.name ?? contact.id} has no email address.`);
        } else if (!canEmail) {
          /* Not a failure of the automation, and said as what it is. The run
             carries on: the tags and tasks after this step are still worth
             doing, and stopping would make one missing setting look like a
             broken automation. */
          await log(env, accountId, run.id, node.id, node.type, 'skipped', 'No mail server is connected to this workspace.');
          report.notes.push(`"${a.name}" wanted to send an email but no mail server is connected.`);
        } else {
          /* The business fields are read once per graph per tick, not per
             email: the same project, the same booking page. */
          const bizKey = a.projectId ?? '';
          if (!bizCache.has(bizKey)) bizCache.set(bizKey, await businessFor(env, accountId, a.projectId, mailbox!.from.name || ''));
          const biz = bizCache.get(bizKey)!;
          const subject = personalise(String(node.config?.subject ?? '') || `A message from ${mailbox!.from.name || 'us'}`, contact, biz);
          const html = textToHtml(personalise(String(node.config?.body ?? node.config?.preview ?? ''), contact, biz));
          const fromEmail = mailbox!.from.email || mailbox!.smtp.username;
          const mime = buildMime({
            fromName: mailbox!.from.name || 'CRM', fromEmail, to, subject, html: await signTrackedLinks(env, html),
            replyTo: mailbox!.from.replyTo || undefined,
          }, mailbox!.smtp.host);
          const r = await smtpSend(mailbox!.smtp, { from: fromEmail, to, mime });
          /* The same per-recipient row every other send writes, so "did that
             reach them" is answered in one place whatever produced it. */
          await logDelivery(env, accountId, {
            channel: 'email', source: 'automation', sourceId: a.id, sourceName: a.name,
            stepIndex: steps, contactId: contact.id, recipient: to, subject,
            status: r.ok ? 'sent' : 'failed', detail: r.error ?? '', sentFrom: fromEmail,
          });
          await log(env, accountId, run.id, node.id, node.type, r.ok ? 'ok' : 'failed',
            r.ok ? `Emailed ${to}.` : `Could not email ${to}: ${r.error}`);
          if (r.ok) report.sent += 1; else report.failed += 1;
        }

      } else if (node.type === 'send_sms') {
        if (!smsLoaded) { smsCfg = await loadSmsConfig(env, accountId); smsLoaded = true; }
        const to = (contact.phone ?? '').trim();
        const canSms = !!smsCfg?.accountSid && !!smsCfg.fromNumber;
        if (!to) {
          await log(env, accountId, run.id, node.id, node.type, 'skipped', `${contact.name ?? contact.id} has no phone number.`);
        } else if (!canSms) {
          await log(env, accountId, run.id, node.id, node.type, 'skipped', 'No SMS sender is connected to this workspace.');
          report.notes.push(`"${a.name}" wanted to send a text but no SMS sender is connected.`);
        } else {
          /* Plain text, always. An SMS node whose body was pasted from an email
             step would otherwise post markup to somebody's phone. */
          const text = personalise(String(node.config?.message ?? node.config?.body ?? ''), contact)
            .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
          const r = await sendSms(env, smsCfg!, to, text, accountId);
          await logDelivery(env, accountId, {
            channel: 'sms', source: 'automation', sourceId: a.id, sourceName: a.name,
            stepIndex: steps, contactId: contact.id, recipient: to, subject: '',
            status: r.suppressed ? 'suppressed' : r.ok ? 'sent' : 'failed',
            detail: r.error ?? '', sentFrom: '',
          });
          await log(env, accountId, run.id, node.id, node.type,
            r.suppressed ? 'skipped' : r.ok ? 'ok' : 'failed',
            r.suppressed ? `${to} has opted out of texts.` : r.ok ? `Texted ${to}.` : `Could not text ${to}: ${r.error}`);
          if (r.ok && !r.suppressed) report.sent += 1; else if (!r.ok) report.failed += 1;
        }

      } else if (node.type === 'add_tag' || node.type === 'remove_tag') {
        const tag = String(node.config?.tag ?? '').trim();
        if (!tag) {
          await log(env, accountId, run.id, node.id, node.type, 'skipped', 'No tag was named on this step.');
        } else {
          await propose(env, accountId, contact.id, node.type, 'tags', tag, a.id);
          await log(env, accountId, run.id, node.id, node.type, 'ok',
            `${node.type === 'add_tag' ? 'Adding' : 'Removing'} "${tag}" — applied next time the app is open.`);
        }

      } else if (node.type === 'update_field') {
        const field = String(node.config?.field ?? '').trim();
        if (!field) {
          await log(env, accountId, run.id, node.id, node.type, 'skipped', 'No field was named on this step.');
        } else {
          await propose(env, accountId, contact.id, 'set_field', field, String(node.config?.value ?? ''), a.id);
          await log(env, accountId, run.id, node.id, node.type, 'ok', `Setting ${field} — applied next time the app is open.`);
        }

      } else if (node.type === 'assign_to') {
        const who = String(node.config?.user ?? node.config?.assignee ?? '').trim();
        if (!who) {
          await log(env, accountId, run.id, node.id, node.type, 'skipped', 'Nobody was named on this step.');
        } else {
          await propose(env, accountId, contact.id, 'assign', 'assignedTo', who, a.id);
          await log(env, accountId, run.id, node.id, node.type, 'ok', `Assigning to ${who}.`);
        }

      } else if (node.type === 'create_task') {
        await propose(env, accountId, contact.id, 'set_field', 'automationTask',
          String(node.config?.title ?? node.config?.text ?? node.label ?? 'Follow up'), a.id);
        await log(env, accountId, run.id, node.id, node.type, 'ok', 'Task queued for the contact.');

      } else {
        /* An unknown node type is stepped over and named, rather than stopping
           the run. A graph written by a newer version of the builder must not
           strand everybody standing in it. */
        await log(env, accountId, run.id, node.id, node.type, 'skipped', `"${node.type}" is not a step this version can carry out.`);
      }

      report.advanced += 1;

      if (!nextId) {
        await finish(env, run.id, 'done', 'Reached the end.', steps);
        report.finished += 1;
      } else {
        await advance(env, run.id, nextId, dueAt, steps);
      }
    }
  }

  return report;
}

/** Keep the log readable rather than unbounded. Same idea as the delivery log. */
export async function pruneAutomationLog(env: Env): Promise<void> {
  try {
    await env.DB.prepare(
      `DELETE FROM crm_automation_log WHERE id NOT IN (
         SELECT id FROM crm_automation_log ORDER BY created_at DESC LIMIT 10000)`,
    ).run();
  } catch { /* housekeeping only */ }
}
