/**
 * Scheduled starts, the schedule's own health, and what the plan really allows.
 *
 * All three answers come from the server, and that is the point of the file.
 * A start date that only exists in a browser is a reminder, not a schedule; a
 * health readout assembled locally cannot say whether the cron ran while the
 * tab was shut; and an allowance checked in the browser is a courtesy the
 * customer can edit. Nothing here is cached for the same reason.
 */
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';
import { API_BASE } from './apiBase';

export interface Audience {
  status?: string[];
  tags?: string[];
  limit?: number;
}

export interface Schedule {
  id: string;
  kind: 'sequence_start';
  refId: string;
  label: string;
  startAt: string;
  audience: Audience;
  status: 'pending' | 'done' | 'failed' | 'cancelled';
  detail: string;
  createdAt: string;
  ranAt: string | null;
}

export interface Tick {
  at: string;
  ms: number;
  sent: number;
  failed: number;
  started: number;
  /** This workspace's share of what the tick had to say. */
  notes: { text: string; kind: 'info' | 'problem' }[];
}

export interface Health {
  healthy: boolean;
  lastTickAt: string | null;
  note: string;
  ticks: Tick[];
  pending: Schedule[];
  recent: Schedule[];
}

export interface PlanUsage {
  planId: string;
  source: string;
  /** -1 is unlimited. */
  limit: number;
  used: number;
  remaining: number;
  note: string;
}

interface Reply { success: boolean; message?: string; error?: string; code?: string; [k: string]: unknown }

async function call<T extends Reply>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const accountId = getActiveAccountId();
  if (!accountId) return { success: false, error: 'No workspace is active yet.' } as T;
  try {
    const r = await fetch(`${API_BASE}/api/automation.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), accountId, action, ...extra }),
    });
    return await r.json() as T;
  } catch (e) {
    return { success: false, error: `Could not reach the server: ${e instanceof Error ? e.message : String(e)}` } as T;
  }
}

/* ── Scheduling ──────────────────────────────────────────────────────────── */

/**
 * Tell a campaign to start on a date.
 *
 * `refId` is a sequence the server can already see, which means the app has to
 * have synced it — the endpoint checks rather than assuming, so a schedule can
 * never point at a campaign that is not there.
 */
export function scheduleStart(refId: string, startAt: Date, label: string, audience: Audience = {}) {
  return call<Reply & { schedule?: Schedule }>('create', {
    kind: 'sequence_start',
    refId,
    label,
    startAt: startAt.toISOString(),
    audience,
  });
}

export function cancelSchedule(id: string) {
  return call('cancel', { id });
}

export async function listSchedules(): Promise<Schedule[]> {
  const r = await call<Reply & { schedules?: Schedule[] }>('list');
  return r.schedules ?? [];
}

/* ── Health ──────────────────────────────────────────────────────────────── */

export async function automationHealth(): Promise<Health & { error?: string }> {
  const r = await call<Reply & Partial<Health>>('health');
  return {
    healthy: !!r.healthy,
    lastTickAt: r.lastTickAt ?? null,
    note: r.note ?? '',
    ticks: r.ticks ?? [],
    pending: r.pending ?? [],
    recent: r.recent ?? [],
    error: r.success ? undefined : (r.error ?? 'The schedule could not be checked.'),
  };
}

/* ── Plan ────────────────────────────────────────────────────────────────── */

/**
 * Close a sub-account on the server, freeing the slot it holds.
 *
 * The allowance is counted from the server's list of workspaces, so deleting
 * one in the browser is only half the job: without this the slot stays taken,
 * and somebody who closed both of their two clients would still be told they
 * were full.
 */
export function releaseWorkspace(target: string) {
  return call('release', { target });
}

/**
 * What the server will actually allow.
 *
 * The client's own PLANS list stays where it is — it is what prices and
 * describes the tiers — but this is the number the boundary is drawn at, and
 * when the two disagree this one wins, because it is the one that refuses.
 */
export async function planUsage(): Promise<PlanUsage | null> {
  const r = await call<Reply & Partial<PlanUsage>>('plan');
  if (!r.success) return null;
  return {
    planId: r.planId ?? 'starter',
    source: r.source ?? 'default',
    limit: r.limit ?? 0,
    used: r.used ?? 0,
    remaining: r.remaining ?? 0,
    note: r.note ?? '',
  };
}
