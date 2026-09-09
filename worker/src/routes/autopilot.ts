/**
 * Autopilot — what it is doing, what it did, and what is waiting on a person.
 *
 * The modules in this app all work and all have to be operated by hand. This is
 * the layer that drives them: a customer states an outcome, and the run builds
 * the site, writes the campaigns, schedules the follow-ups and books the
 * appointments, reporting every action with a link to the real record.
 *
 * This endpoint is the ledger's front door. It does not decide anything — the
 * planning tick in scheduled.ts does that — it reads the account Autopilot
 * gives of itself, and takes the two decisions that are a person's to take:
 * approving an action that a guardrail held back, and pausing the whole thing.
 *
 * Nothing here is stored in the workspace's synced records, deliberately. The
 * cron has to write this log while nobody is signed in, and a scheduler has no
 * browser to sync from — the same reason the mailbox lives server-side.
 */
import { body, fail, json } from '../lib/http';
import { canAccess, nowIso, userFromToken, type Env } from '../lib/db';

/** Kept in step with AIGuardrails in src/types/aiSalesAgent.ts. */
const DEFAULT_GUARDRAILS = {
  dailyNewProspects: 100,
  maxEmailsPerDay: 50,
  maxSmsPerDay: 20,
  createWorkflows: 'on',
  activateWorkflows: 'approval',
  sendEmail: 'approval',
  sendSms: 'approval',
  bookAppointments: 'on',
};

type Status = 'off' | 'learning' | 'running' | 'paused';
const STATUSES = new Set<Status>(['off', 'learning', 'running', 'paused']);

interface RunRow {
  account_id: string;
  status: string;
  objective: string;
  guardrails: string;
  plan: string;
  last_planned_at: string | null;
  last_acted_at: string | null;
  last_error: string;
  created_at: string;
  updated_at: string;
}

interface ActionRow {
  id: string;
  kind: string;
  status: string;
  summary: string;
  because: string;
  link_kind: string | null;
  link_id: string | null;
  link_label: string | null;
  link_route: string | null;
  counts: string;
  detail: string;
  due_at: string | null;
  created_at: string;
  acted_at: string | null;
}

function parse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function shapeRun(row: RunRow | null) {
  if (!row) return null;
  return {
    status: row.status,
    objective: row.objective,
    guardrails: parse(row.guardrails, DEFAULT_GUARDRAILS),
    plan: parse<Record<string, unknown>>(row.plan, {}),
    lastPlannedAt: row.last_planned_at,
    lastActedAt: row.last_acted_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function shapeAction(r: ActionRow) {
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    summary: r.summary,
    because: r.because,
    /* The link is the whole point: an action says what it produced and where to
       go and read the real thing, rather than describing it. */
    link: r.link_kind && r.link_id
      ? { kind: r.link_kind, id: r.link_id, label: r.link_label ?? '', route: r.link_route ?? '' }
      : null,
    counts: parse<Record<string, number>>(r.counts, {}),
    detail: r.detail,
    dueAt: r.due_at,
    createdAt: r.created_at,
    actedAt: r.acted_at,
  };
}

interface Body {
  token?: string;
  action?: string;
  accountId?: string;
  actionId?: string;
  objective?: string;
  status?: string;
  guardrails?: Record<string, unknown>;
  limit?: number;
}

export async function handleAutopilot(req: Request, env: Env): Promise<Response> {
  const d = await body<Body>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });

  const accountId = String(d.accountId ?? '').trim();
  if (!/^[A-Za-z0-9_.\-]{1,64}$/.test(accountId)) return fail('A valid workspace is required.');
  if (!(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours.', 403);

  const getRun = () => env.DB.prepare('SELECT * FROM crm_autopilot WHERE account_id = ?')
    .bind(accountId).first<RunRow>();

  const listActions = async (limit = 100) => {
    const rows = await env.DB.prepare(
      `SELECT * FROM crm_autopilot_actions WHERE account_id = ?
       ORDER BY created_at DESC LIMIT ?`,
    ).bind(accountId, Math.min(Math.max(limit, 1), 500)).all<ActionRow>();
    return (rows.results ?? []).map(shapeAction);
  };

  const act = d.action ?? 'get';

  /* ── The whole picture, in one call ──
     The activity screen needs the run, the log and the approval queue together;
     three round-trips would let them disagree with each other on screen. */
  if (act === 'get') {
    const run = await getRun();
    const actions = await listActions(Number(d.limit) || 100);
    return json({
      success: true,
      autopilot: shapeRun(run ?? null),
      actions,
      awaiting: actions.filter(a => a.status === 'awaiting').length,
    });
  }

  /* ── Turn it on ── */
  if (act === 'start') {
    const objective = String(d.objective ?? '').trim();
    if (objective.length < 8) {
      return fail('Say what you want Autopilot to achieve — a sentence is enough, in your own words.');
    }
    const now = nowIso();
    const existing = await getRun();
    await env.DB.prepare(
      `INSERT INTO crm_autopilot (account_id, status, objective, guardrails, plan, created_at, updated_at)
       VALUES (?,?,?,?,'{}',?,?)
       ON CONFLICT(account_id) DO UPDATE SET
         status=excluded.status, objective=excluded.objective,
         guardrails=excluded.guardrails, last_error='', updated_at=excluded.updated_at`,
    ).bind(
      accountId, 'learning', objective.slice(0, 2000),
      /* Guardrails survive a restart. Somebody who opened sending up once
         should not be asked again because they re-stated the objective. */
      JSON.stringify(existing ? parse(existing.guardrails, DEFAULT_GUARDRAILS) : DEFAULT_GUARDRAILS),
      existing?.created_at ?? now, now,
    ).run();
    return json({ success: true, autopilot: shapeRun(await getRun() ?? null) });
  }

  /* ── Pause, resume, switch off ──
     Pause keeps the plan and the history; off is a decision to stop, and the
     difference matters because resuming from pause must not re-do work. */
  if (act === 'set_status') {
    const status = String(d.status ?? '') as Status;
    if (!STATUSES.has(status)) return fail(`"${d.status}" is not a state Autopilot can be in.`);
    const res = await env.DB.prepare('UPDATE crm_autopilot SET status = ?, updated_at = ? WHERE account_id = ?')
      .bind(status, nowIso(), accountId).run();
    if (!res.meta.changes) return fail('Autopilot has not been set up for this workspace yet.');
    return json({ success: true, autopilot: shapeRun(await getRun() ?? null) });
  }

  if (act === 'set_guardrails') {
    const run = await getRun();
    if (!run) return fail('Autopilot has not been set up for this workspace yet.');
    const merged = { ...parse(run.guardrails, DEFAULT_GUARDRAILS), ...(d.guardrails ?? {}) };
    await env.DB.prepare('UPDATE crm_autopilot SET guardrails = ?, updated_at = ? WHERE account_id = ?')
      .bind(JSON.stringify(merged), nowIso(), accountId).run();
    return json({ success: true, autopilot: shapeRun(await getRun() ?? null) });
  }

  /* ── The two decisions that belong to a person ──
     An action held back by a guardrail is released here, or refused here.
     Approving moves it to pending so the next tick carries it out — it is not
     performed inline, because the thing that does the work is the tick and
     having two places that can send is how something gets sent twice. */
  if (act === 'approve' || act === 'reject') {
    const id = String(d.actionId ?? '').trim();
    if (!id) return fail('Which action?');
    const row = await env.DB.prepare(
      'SELECT status FROM crm_autopilot_actions WHERE id = ? AND account_id = ?',
    ).bind(id, accountId).first<{ status: string }>();
    if (!row) return fail('That action is not in this workspace.');
    if (row.status !== 'awaiting') {
      return fail(`That action is already "${row.status}" — it is not waiting for anybody.`);
    }
    await env.DB.prepare(
      `UPDATE crm_autopilot_actions SET status = ?, detail = ?, acted_at = ? WHERE id = ?`,
    ).bind(
      act === 'approve' ? 'pending' : 'skipped',
      act === 'approve' ? '' : 'You decided not to do this.',
      act === 'approve' ? null : nowIso(),
      id,
    ).run();
    return json({ success: true, actions: await listActions(Number(d.limit) || 100) });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}
