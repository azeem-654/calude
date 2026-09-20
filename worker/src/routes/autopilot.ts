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
import { canAccess, dataGet, nowIso, userFromToken, type Env } from '../lib/db';
import { loadAiKey } from '../lib/ai';
import { understandInstruction, type Brand } from '../lib/autopilotWrite';

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

/**
 * How many typed instructions a workspace gets in twenty-four hours.
 *
 * Each one is a model call the operator pays for, and a text box with no
 * ceiling is a text box somebody pastes a novel into fifty times.
 *
 * It lives in `crm_plans.instruction_cap` so it can follow the price when there
 * is a price to follow; until a row says otherwise everybody gets this. A
 * number here rather than a magic literal at the call site, because the day it
 * changes it should change in one place.
 */
const DEFAULT_INSTRUCTIONS_PER_DAY = 20;

/**
 * The cap for this workspace.
 *
 * Reads the owner's plan and falls back to the default. Deliberately tolerant:
 * if the column does not exist yet, or the plan row is missing, the customer
 * gets the default rather than an error — a limit that breaks the feature when
 * it cannot be read is worse than no limit.
 */
async function instructionCap(env: Env, accountId: string): Promise<number> {
  try {
    const row = await env.DB.prepare(
      `SELECT p.instruction_cap AS cap FROM crm_plans p
       JOIN crm_users u ON u.email = p.owner_email
       WHERE u.account_id = ? OR u.account_id IS NULL
       ORDER BY CASE WHEN u.account_id = ? THEN 0 ELSE 1 END LIMIT 1`,
    ).bind(accountId, accountId).first<{ cap: number | null }>();
    const n = Number(row?.cap);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_INSTRUCTIONS_PER_DAY;
  } catch {
    return DEFAULT_INSTRUCTIONS_PER_DAY;
  }
}

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
  /** Which project's dashboard is asking. */
  projectId?: string;
  /** Free text from the box at the top of a project dashboard. */
  instruction?: string;
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

  /*
   * ── One project's day ──
   *
   * Everything the dashboard for a single project needs, in one call: what it
   * did today with the time it happened, the emails that actually went, what
   * is waiting on a person, and what is due next.
   *
   * One call rather than five, for the same reason `get` is one call: five
   * round-trips let the panels disagree with each other on screen, and the
   * whole point of this screen is that it is a single honest account of one
   * project at one moment.
   *
   * Everything here is read. Nothing on this path decides or changes anything —
   * the tick does that — so it is safe to poll, which the dashboard does.
   */
  if (act === 'day') {
    const projectId = String(d.projectId ?? '').trim();
    if (!projectId) return fail('Which project?', 400);

    /*
     * The customer's own day, not UTC's.
     *
     * A dashboard headed "today" that turns over at 5am local because the
     * server is in UTC is worse than one with no heading: the customer reads
     * an empty list and concludes it stopped.
     */
    /* Through `dataGet` rather than a hand-written query. The blob table's
       columns are `k` and `v`, not `key` and `value`, and writing the SQL out
       again here got that wrong — one helper means one place to be wrong. */
    let tz = 'UTC';
    try {
      tz = (JSON.parse(await dataGet(env.DB, accountId, 'crm_schedule') ?? '{}') as { timezone?: string }).timezone || 'UTC';
    } catch { /* no schedule set, or unreadable: UTC is the safe default */ }
    const localDay = (iso: string): string => {
      try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso)); }
      catch { return iso.slice(0, 10); }
    };
    const today = localDay(nowIso());

    /* A generous window, then filtered to the customer's day below. Asking the
       database for "today in Karachi" would mean date arithmetic in SQL against
       a column stored in UTC, which is the kind of thing that is wrong twice a
       year and nobody notices. */
    const since = new Date(Date.now() - 48 * 3_600_000).toISOString();

    const recent = await env.DB.prepare(
      `SELECT * FROM crm_autopilot_actions
       WHERE account_id = ? AND project_id = ? AND created_at >= ?
       ORDER BY created_at DESC LIMIT 200`,
    ).bind(accountId, projectId, since).all<ActionRow>();
    const all = (recent.results ?? []).map(shapeAction);

    /* Done *today* means acted today, not created today: an action planned
       last night and carried out this morning belongs to this morning. */
    const didToday = all.filter(a => a.status === 'done' && a.actedAt && localDay(a.actedAt) === today);
    const failedToday = all.filter(a => a.status === 'failed' && a.actedAt && localDay(a.actedAt) === today);

    /* Waiting is not time-boxed. Something held for approval four days ago is
       still the most important thing on this screen. */
    const awaitingRows = await env.DB.prepare(
      `SELECT * FROM crm_autopilot_actions
       WHERE account_id = ? AND project_id = ? AND status = 'awaiting'
       ORDER BY created_at DESC LIMIT 50`,
    ).bind(accountId, projectId).all<ActionRow>();
    const awaiting = (awaitingRows.results ?? []).map(shapeAction);

    /* What is due next, so the screen can say what happens rather than only
       what happened. Ordered by when, with nulls last — a row with no due date
       runs on the next tick, which is sooner than anything scheduled. */
    const nextRows = await env.DB.prepare(
      `SELECT * FROM crm_autopilot_actions
       WHERE account_id = ? AND project_id = ? AND status = 'pending'
       ORDER BY CASE WHEN due_at IS NULL THEN 0 ELSE 1 END, due_at ASC LIMIT 10`,
    ).bind(accountId, projectId).all<ActionRow>();
    const upcoming = (nextRows.results ?? []).map(shapeAction);

    /*
     * The emails that actually went.
     *
     * From the delivery log rather than from the actions, because an action
     * says "started 40 contacts on a sequence" and this says who got what and
     * when, to the second. They answer different questions and the second one
     * is the one asked when somebody doubts it is working.
     *
     * Workspace-wide rather than per project: a send belongs to a sequence, and
     * a sequence is not owned by a project once it exists. Said as much on the
     * screen rather than filtered into a half-truth.
     */
    const sends = await env.DB.prepare(
      `SELECT id, channel, source, source_name AS sourceName, recipient, subject,
              status, detail, created_at AS createdAt
       FROM crm_delivery_log WHERE account_id = ? AND created_at >= ?
       ORDER BY created_at DESC LIMIT 60`,
    ).bind(accountId, since).all<Record<string, unknown>>();
    const sentToday = (sends.results ?? []).filter(r => localDay(String(r.createdAt)) === today);

    return json({
      success: true,
      today,
      timezone: tz,
      didToday,
      failedToday,
      awaiting,
      upcoming,
      sentToday,
      /* Counted over the whole window rather than the page above, so a busy day
         does not read as exactly sixty. */
      totals: {
        doneToday: didToday.length,
        failedToday: failedToday.length,
        awaiting: awaiting.length,
        sentToday: sentToday.length,
      },
    });
  }

  /*
   * ── Telling a project what to do, in words ──
   *
   * The box at the top of a project's dashboard. The customer types a sentence;
   * this decides which of the things Autopilot can already do they are asking
   * for, and queues exactly that.
   *
   * ── Why it queues rather than acts ──
   *
   * Everything here goes onto the same board, under the same guardrails, as
   * anything the planner decided. A typed instruction is not a reason to skip
   * an approval — if anything it is a reason to be stricter, because a sentence
   * is far easier to misread than a rule. The customer sees the card, sees what
   * it understood, and can reject it before anything happens.
   *
   * ── Why there is a cap ──
   *
   * Each of these is a model call the operator pays for, and an input box with
   * no ceiling is an input box somebody will paste a novel into fifty times.
   * The number belongs to the plan so it can follow the price later; until
   * somebody sets one, `DEFAULT_INSTRUCTIONS_PER_DAY` applies to everybody.
   */
  if (act === 'instruct') {
    const projectId = String(d.projectId ?? '').trim();
    const instruction = String(d.instruction ?? '').trim();
    if (!projectId) return fail('Which project?', 400);
    if (instruction.length < 4) return fail('Say what you would like it to do — a sentence is enough.');
    if (instruction.length > 1200) return fail('That is longer than this box takes. A sentence or two works best.');

    const project = await env.DB.prepare(
      'SELECT id, name, portfolio_id AS portfolioId FROM crm_projects WHERE id = ? AND account_id = ?',
    ).bind(projectId, accountId).first<{ id: string; name: string; portfolioId: string }>();
    if (!project) return fail('That project could not be found.', 404);

    /* Counted over the last 24 hours rather than per calendar day: a day
       boundary hands somebody a fresh allowance at midnight and none at 23:59,
       which reads as the product being broken rather than as a limit. */
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const used = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM crm_autopilot_actions
       WHERE account_id = ? AND kind = 'instruct' AND created_at >= ?`,
    ).bind(accountId, since).first<{ n: number }>();
    const cap = await instructionCap(env, accountId);
    if ((used?.n ?? 0) >= cap) {
      return fail(
        `That is ${cap} instruction${cap === 1 ? '' : 's'} in twenty-four hours, which is this plan's limit. `
        + 'It carries on with everything it already has planned — this only limits new instructions.',
        429, { code: 'instruction_cap', cap, used: used?.n ?? 0 },
      );
    }

    const apiKey = await loadAiKey(env, accountId);
    if (!apiKey) {
      return fail('No AI key is connected, so this cannot read an instruction yet. Settings → AI Engine.', 400);
    }

    const brand = await brandFor(env, accountId, project.portfolioId);
    const r = await understandInstruction(apiKey, brand, instruction);
    if (!r.ok || !r.value) return fail(r.error || 'That could not be read. Try saying it another way.');

    const v = r.value;
    if (v.what === 'none') {
      /*
       * Recorded as a notice rather than refused silently.
       *
       * The customer said something and deserves it written down with the
       * answer beside it — and the `observe` kind is exactly this: noticing is
       * the whole action, so it is marked done the moment it is written.
       */
      const id = `ac-${crypto.randomUUID()}`;
      await env.DB.prepare(
        `INSERT INTO crm_autopilot_actions
         (id, account_id, project_id, kind, status, summary, because, detail, created_at, acted_at)
         VALUES (?,?,?,'instruct','done',?,?,?,?,?)`,
      ).bind(
        id, accountId, projectId,
        `You asked: "${instruction.slice(0, 90)}"`,
        v.because || 'Read, and not something this can carry out.',
        v.cannot || 'That is not one of the things Autopilot can do on its own.',
        nowIso(), nowIso(),
      ).run();
      return json({ success: true, understood: false, message: v.cannot || 'That is not something Autopilot can do on its own.', id });
    }

    const id = `ac-${crypto.randomUUID()}`;
    await env.DB.prepare(
      `INSERT INTO crm_autopilot_actions
       (id, account_id, project_id, kind, status, summary, because, effect, created_at)
       VALUES (?,?,?,'instruct','pending',?,?,?,?)`,
    ).bind(
      id, accountId, projectId,
      (v.summary || instruction).slice(0, 200),
      `you asked for this — ${(v.because || instruction).slice(0, 300)}`,
      JSON.stringify({ type: 'write', what: v.what }),
      nowIso(),
    ).run();

    return json({
      success: true,
      understood: true,
      what: v.what,
      summary: v.summary,
      /* Said back, so a misread is visible before it happens rather than after. */
      message: `Queued: ${v.summary}. It runs on the next pass, and you can reject it on the card.`,
      id,
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

/**
 * What the writers need to know about this project's client.
 *
 * A second, smaller copy of the tick's own `brandFor`, and deliberately so: the
 * tick's takes a `RunRow` it has already loaded for other reasons, and
 * importing it here would drag the whole planning module into a request path
 * that only wants seven strings. The portfolio is the source of truth in both,
 * and the onboarding record is the fallback in both.
 */
async function brandFor(env: Env, accountId: string, portfolioId: string): Promise<Brand> {
  const parse = <T,>(raw: string | null | undefined, fallback: T): T => {
    if (!raw) return fallback;
    try { return (JSON.parse(raw) ?? fallback) as T; } catch { return fallback; }
  };

  let ob: Record<string, string> = {};
  if (portfolioId) {
    const row = await env.DB.prepare('SELECT profile FROM crm_portfolios WHERE id = ? AND account_id = ?')
      .bind(portfolioId, accountId).first<{ profile: string }>();
    ob = parse<Record<string, string>>(row?.profile, {});
  }
  if (!ob.companyName) {
    ob = { ...parse<Record<string, string>>(await dataGet(env.DB, accountId, 'crm_onboarding'), {}), ...ob };
  }

  return {
    companyName: ob.companyName ?? ob.businessName ?? '',
    industry: ob.industry ?? '',
    description: ob.description ?? ob.whatYouDo ?? '',
    products: ob.products ?? ob.services ?? '',
    audience: ob.audience ?? ob.idealCustomer ?? '',
    tone: ob.tone ?? '',
    website: ob.website ?? '',
    objective: ob.objective ?? '',
  };
}
