/**
 * Plan allowances on the server: whose they are, what is used, and the refusal.
 *
 * The numbers and the words are lib/allowances.ts (pure, shared with the
 * browser). This file answers three questions at the moment something is made:
 *
 *   standingOf   whose allowance this workspace draws on, and on what plan
 *   check        may `need` more of a meter be used — or the refusal, by name
 *   record       count one thing made, once (keyed by the thing)
 *
 * and `readAll` for the Usage card.
 *
 * ── Callers ──
 *
 * A route refuses with `fail(r.message, 402, refusalBody(r))` — `code:
 * 'allowance'`, the meter, used, limit, the plan, and the plan that raises it.
 * A cron path (an agent's step, a finder, a render) does not throw: it skips,
 * and writes the same sentence where the customer reads that step's outcome.
 *
 * ── The race it accepts ──
 *
 * Check-then-record is two statements, so two requests arriving together at
 * the last place can both pass and go one over. Locking every generation
 * behind a transaction D1 does not offer would cost more than one extra post;
 * the next request sees the true total and is refused.
 */
import { nowIso, planFor, resellLimitFor, type Env } from './db';
import { trialFor, type TrialState } from './trial';
import {
  METERS, OWNER_LIMITS, TRIAL_NAME, UNLIMITED, cleanLimit, effectivePlans, isPlanKey, limitsFor, meterOf, periodEnd, periodOf,
  refusalText, upgradeFor, verdict, type Limits, type MeterId, type MeterReading, type Overrides, type PlanDef, type StandingKind,
} from './allowances';

export interface Standing {
  kind: StandingKind;
  planId: string;
  planName: string;
  /** Who pays: the owner's email, or `ws:<id>` for a workspace with no recorded owner. */
  subscriber: string;
  /** The subscriber's email when there is one. */
  email: string | null;
  limits: Limits;
  plans: PlanDef[];
  trial: TrialState | null;
}

/* ── The owner's changes to plan numbers ── */

export async function loadOverrides(env: Env): Promise<Overrides> {
  const out: Overrides = {};
  const { results } = await env.DB.prepare('SELECT plan_id, meter, value FROM crm_plan_limits')
    .all<{ plan_id: string; meter: string; value: number }>().catch(() => ({ results: [] as { plan_id: string; meter: string; value: number }[] }));
  for (const r of results ?? []) {
    if (!(isPlanKey(r.plan_id) || r.plan_id === 'trial') || !meterOf(r.meter)) continue;
    const v = cleanLimit(r.value);
    if (v === null) continue;
    (out[r.plan_id as keyof Overrides] ??= {})[r.meter as MeterId] = v;
  }
  return out;
}

/** The trial's numbers, with the owner's changes. */
export async function trialLimits(env: Env): Promise<Limits> {
  return limitsFor('trial', '', await loadOverrides(env));
}

/* ── Whose allowance ── */

async function ownerEmailOf(env: Env, accountId: string): Promise<string | null> {
  const ws = await env.DB.prepare('SELECT owner_email AS e FROM crm_workspaces WHERE account_id = ?')
    .bind(accountId).first<{ e: string }>().catch(() => null);
  if (ws?.e) return ws.e;
  /* A workspace from before ownership was recorded: the agency it was issued to. */
  const u = await env.DB.prepare("SELECT email FROM crm_users WHERE account_id = ? AND role = 'agency' LIMIT 1")
    .bind(accountId).first<{ email: string }>().catch(() => null);
  return u?.email ?? null;
}

export async function standingOf(env: Env, accountId: string): Promise<Standing> {
  const over = await loadOverrides(env);
  const plans = effectivePlans(over);
  const email = await ownerEmailOf(env, accountId);
  const trial = email ? await trialFor(env, email).catch(() => null) : null;
  const kind: StandingKind = trial?.kind === 'owner' ? 'owner'
    : trial?.kind === 'trial' ? 'trial'
      : trial?.kind === 'ended' ? 'ended'
        : 'plan';
  /* planFor's default for anybody without a row is the entry plan — the safe
     direction for a default to be wrong in. */
  const p = email ? await planFor(env.DB, email).catch(() => ({ planId: 'starter' })) : { planId: 'starter' };
  const planId = isPlanKey(p.planId) ? p.planId : 'starter';
  const planName = kind === 'owner' ? 'Install owner'
    : kind === 'trial' || kind === 'ended' ? TRIAL_NAME
      : plans.find(x => x.id === planId)?.name ?? 'Starter';
  return {
    kind, planId, planName, email, trial,
    subscriber: email ?? `ws:${accountId}`,
    limits: kind === 'owner' ? OWNER_LIMITS : limitsFor(kind, planId, over),
    plans,
  };
}

/**
 * Every workspace whose usage counts against this subscriber, as SQL — a
 * subquery rather than a list of ids, because an agency's list can be longer
 * than D1 will bind.
 */
const IN_WORKSPACES = `(account_id IN (SELECT account_id FROM crm_workspaces WHERE owner_email = ?1) OR account_id = ?2)`;

/* ── How much is used ── */

async function monthly(env: Env, subscriber: string, meter: MeterId, period = periodOf()): Promise<number> {
  const r = await env.DB.prepare('SELECT COALESCE(SUM(units), 0) AS n FROM crm_usage WHERE subscriber = ? AND meter = ? AND period = ?')
    .bind(subscriber, meter, period).first<{ n: number }>().catch(() => null);
  return Number(r?.n ?? 0);
}

async function videoMinutes(env: Env, st: Standing, accountId: string, unit: 'source_min' | 'render_min'): Promise<number> {
  const r = await env.DB.prepare(`SELECT COALESCE(SUM(units), 0) AS n FROM crm_video_usage WHERE ${IN_WORKSPACES} AND period = ?3 AND unit = ?4`)
    .bind(st.email ?? '', accountId, periodOf(), unit).first<{ n: number }>().catch(() => null);
  return Math.round(Number(r?.n ?? 0) * 10) / 10;
}

async function projectsCount(env: Env, st: Standing, accountId: string): Promise<number> {
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM crm_projects WHERE ${IN_WORKSPACES}`)
    .bind(st.email ?? '', accountId).first<{ n: number }>().catch(() => null);
  return Number(r?.n ?? 0);
}

async function workflowsIn(env: Env, accountId: string, projectId: string): Promise<number> {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM crm_project_workflows WHERE account_id = ? AND project_id = ?')
    .bind(accountId, projectId).first<{ n: number }>().catch(() => null);
  return Number(r?.n ?? 0);
}

async function subAccounts(env: Env, st: Standing): Promise<{ used: number; limit: number }> {
  if (!st.email) return { used: 0, limit: 0 };
  const own = await env.DB.prepare('SELECT account_id AS a FROM crm_users WHERE email = ?').bind(st.email).first<{ a: string | null }>().catch(() => null);
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM crm_workspaces WHERE owner_email = ? AND account_id != ?')
    .bind(st.email, own?.a ?? '').first<{ n: number }>().catch(() => null);
  /* The boundary workspaceAccess actually draws, which is the subscriber's
     stored allowance — not the plan table, which a later change may have moved. */
  return { used: Number(r?.n ?? 0), limit: st.kind === 'owner' ? UNLIMITED : await resellLimitFor(env.DB, st.email) };
}

/** Video storage held across the subscriber's workspaces that have any video. */
async function storageGb(env: Env, st: Standing, accountId: string): Promise<number> {
  if (!env.VIDEO) return 0;
  const { storedBytes } = await import('./video/store');
  const { results } = await env.DB.prepare(`SELECT DISTINCT account_id AS a FROM crm_video_projects WHERE ${IN_WORKSPACES} LIMIT 200`)
    .bind(st.email ?? '', accountId).all<{ a: string }>().catch(() => ({ results: [] as { a: string }[] }));
  let bytes = 0;
  for (const r of results ?? []) bytes += await storedBytes(env, r.a).catch(() => 0);
  return Math.round((bytes / 1e9) * 100) / 100;
}

/** Used so far, for one meter. `projectId` for workflows_per_project. */
export async function usedOf(env: Env, st: Standing, accountId: string, meter: MeterId, projectId = ''): Promise<number> {
  switch (meter) {
    case 'autopilot_projects': return projectsCount(env, st, accountId);
    case 'workflows_per_project': return projectId ? workflowsIn(env, accountId, projectId) : 0;
    case 'sub_accounts': return (await subAccounts(env, st)).used;
    case 'video_minutes': return videoMinutes(env, st, accountId, 'source_min');
    case 'render_minutes': return videoMinutes(env, st, accountId, 'render_min');
    case 'video_storage_gb': return storageGb(env, st, accountId);
    default: return monthly(env, st.subscriber, meter);
  }
}

/* ── The check ── */

export interface Allowed { ok: true; left: number; standing: Standing }
export interface Refused {
  ok: false;
  code: 'allowance';
  meter: MeterId;
  used: number;
  limit: number;
  planId: string;
  planName: string;
  upgrade: { id: string; name: string; limit: number } | null;
  /** When a monthly allowance starts again; '' for counts. */
  resetsAt: string;
  message: string;
  standing: Standing;
}

export async function check(
  env: Env, accountId: string, meter: MeterId, need = 1,
  opts: { projectId?: string; standing?: Standing } = {},
): Promise<Allowed | Refused> {
  const st = opts.standing ?? await standingOf(env, accountId);
  let limit = st.limits[meter];
  if (meter === 'sub_accounts' && st.kind !== 'owner') limit = (await subAccounts(env, st)).limit;
  if (limit === UNLIMITED) return { ok: true, left: UNLIMITED, standing: st };
  const used = await usedOf(env, st, accountId, meter, opts.projectId);
  const v = verdict(used, limit, need);
  if (v.ok) return { ok: true, left: v.left, standing: st };
  const m = meterOf(meter)!;
  const up = upgradeFor(meter, st, st.plans);
  const upgrade = up ? { id: up.id, name: up.name, limit: up.limits[meter] } : null;
  const resetsAt = m.kind === 'monthly' ? periodEnd(periodOf()) : '';
  return {
    ok: false, code: 'allowance', meter, used, limit, planId: st.kind === 'plan' ? st.planId : st.kind,
    planName: st.planName, upgrade, resetsAt, standing: st,
    message: refusalText(m, used, limit, st.planName, upgrade, resetsAt),
  };
}

/**
 * How many more may be made — for a step that makes several at once (six
 * posts, a 52-email campaign, a day's prospects) and should make what fits
 * rather than nothing. `left` is Infinity when unlimited; at 0, `refused` says why.
 */
export async function roomFor(env: Env, accountId: string, meter: MeterId): Promise<{ left: number; refused: Refused | null; standing: Standing }> {
  const r = await check(env, accountId, meter, 1);
  if (!r.ok) return { left: 0, refused: r, standing: r.standing };
  return { left: r.left === UNLIMITED ? Infinity : r.left, refused: null, standing: r.standing };
}

/** What a route puts beside the message. */
export function refusalBody(r: Refused): Record<string, unknown> {
  return {
    code: r.code, meter: r.meter, used: r.used, limit: r.limit,
    plan: { id: r.planId, name: r.planName }, upgrade: r.upgrade, resetsAt: r.resetsAt,
  };
}

/* ── Counting ── */

/**
 * Count one thing made. Idempotent on (meter, workspace, ref): a retry of the
 * same step writes the same key and changes nothing. Returns whether this call
 * counted it. Never throws — a counter failing must not undo the work it counts.
 */
export async function record(
  env: Env, accountId: string, meter: MeterId, ref: string, units = 1, standing?: Standing,
): Promise<boolean> {
  try {
    const subscriber = standing?.subscriber ?? (await ownerEmailOf(env, accountId)) ?? `ws:${accountId}`;
    const r = await env.DB.prepare(
      `INSERT INTO crm_usage (meter, ref, subscriber, account_id, period, units, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(meter, ref) DO NOTHING`,
    ).bind(meter, `${accountId}:${ref}`.slice(0, 300), subscriber, accountId, periodOf(), units, nowIso()).run();
    return (r.meta?.changes ?? 0) > 0;
  } catch { return false; }
}

/** Was this thing already counted? */
export async function counted(env: Env, accountId: string, meter: MeterId, ref: string): Promise<boolean> {
  const r = await env.DB.prepare('SELECT 1 AS x FROM crm_usage WHERE meter = ? AND ref = ?')
    .bind(meter, `${accountId}:${ref}`.slice(0, 300)).first<{ x: number }>().catch(() => null);
  return !!r;
}

/**
 * Check and count one thing in one call — for a thing made the moment it is
 * allowed (an AI request). Something already counted passes without counting
 * again.
 */
export async function take(env: Env, accountId: string, meter: MeterId, ref: string, units = 1): Promise<Allowed | Refused> {
  if (await counted(env, accountId, meter, ref)) return { ok: true, left: UNLIMITED, standing: await standingOf(env, accountId) };
  const r = await check(env, accountId, meter, units);
  if (r.ok) await record(env, accountId, meter, ref, units, r.standing);
  return r;
}

/* ── The Usage card ── */

export interface AllowanceView {
  kind: StandingKind;
  planId: string;
  planName: string;
  period: string;
  resetsAt: string;
  /** Workspaces drawing on this allowance. */
  workspaces: number;
  meters: MeterReading[];
  /** Per project, for workflows_per_project — this workspace's projects. */
  projects: { id: string; name: string; workflows: number }[];
}

export async function readAll(env: Env, accountId: string): Promise<AllowanceView> {
  const st = await standingOf(env, accountId);
  const period = periodOf();
  const { results: projects } = await env.DB.prepare(
    `SELECT p.id, p.name, (SELECT COUNT(*) FROM crm_project_workflows w WHERE w.project_id = p.id AND w.account_id = p.account_id) AS n
       FROM crm_projects p WHERE p.account_id = ? ORDER BY p.position, p.created_at, p.id LIMIT 200`,
  ).bind(accountId).all<{ id: string; name: string; n: number }>().catch(() => ({ results: [] as { id: string; name: string; n: number }[] }));
  const ws = await env.DB.prepare('SELECT COUNT(*) AS n FROM crm_workspaces WHERE owner_email = ?')
    .bind(st.email ?? '').first<{ n: number }>().catch(() => null);
  const subs = await subAccounts(env, st);
  const meters: MeterReading[] = [];
  for (const m of METERS) {
    if (m.id === 'workflows_per_project') {
      const top = [...(projects ?? [])].sort((a, b) => b.n - a.n)[0];
      meters.push({ id: m.id, used: top?.n ?? 0, limit: st.limits[m.id], ...(top ? { note: `Most in one project: ${top.name}` } : {}) });
      continue;
    }
    if (m.id === 'sub_accounts') { meters.push({ id: m.id, used: subs.used, limit: subs.limit }); continue; }
    meters.push({ id: m.id, used: await usedOf(env, st, accountId, m.id), limit: st.limits[m.id] });
  }
  return {
    kind: st.kind, planId: st.kind === 'plan' ? st.planId : st.kind, planName: st.planName,
    period, resetsAt: periodEnd(period), workspaces: Math.max(1, Number(ws?.n ?? 0)),
    meters,
    projects: (projects ?? []).map(p => ({ id: p.id, name: p.name, workflows: Number(p.n) })),
  };
}

