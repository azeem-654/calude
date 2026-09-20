/**
 * Autopilot, from the browser's side.
 *
 * Everything real happens on the server — the planning tick decides, the cron
 * carries it out, the ledger records it. This is the reader, plus the two
 * things a person does: release an action a guardrail held back, and pause.
 *
 * Nothing here executes anything. Approving marks an action pending and the
 * next tick performs it; if this file could also perform it, there would be two
 * places that can send the same email.
 */
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';
import { API_BASE } from './apiBase';
import type { AIGuardrails, LinkKind } from '../types/aiSalesAgent';

export type AutopilotStatus = 'off' | 'learning' | 'running' | 'paused';

/** pending: planned. awaiting: needs a click. done/failed/skipped: over. */
export type ActionStatus = 'pending' | 'awaiting' | 'done' | 'failed' | 'skipped';

export interface AutopilotLink {
  kind: LinkKind;
  id: string;
  label: string;
  route: string;
}

export interface AutopilotAction {
  id: string;
  kind: string;
  status: ActionStatus;
  summary: string;
  /** Why it decided to. The column that makes the log worth reading. */
  because: string;
  link: AutopilotLink | null;
  counts: Record<string, number>;
  detail: string;
  dueAt: string | null;
  createdAt: string;
  actedAt: string | null;
}

export interface AutopilotRun {
  status: AutopilotStatus;
  objective: string;
  guardrails: AIGuardrails;
  plan: Record<string, unknown>;
  lastPlannedAt: string | null;
  lastActedAt: string | null;
  lastError: string;
  createdAt: string;
  updatedAt: string;
}

interface Reply {
  success: boolean;
  error?: string;
  message?: string;
  autopilot?: AutopilotRun | null;
  actions?: AutopilotAction[];
  /* `awaiting` is a count on `get` and a list on `day`, because the two screens
     want different things from the same fact — a badge and a queue. Typed as
     both rather than given two names, which would be two things to keep in
     step. */
  awaiting?: number | AutopilotAction[];
  /* The day feed. */
  today?: string;
  timezone?: string;
  didToday?: AutopilotAction[];
  failedToday?: AutopilotAction[];
  upcoming?: AutopilotAction[];
  sentToday?: unknown[];
  totals?: Record<string, number>;
  /* A typed instruction, and the cap that may have refused it. */
  understood?: boolean;
  what?: string;
  cap?: number;
  used?: number;
}

async function call(action: string, extra: Record<string, unknown> = {}): Promise<Reply> {
  const accountId = getActiveAccountId();
  if (!accountId) return { success: false, error: 'No workspace is active yet.' };
  try {
    const r = await fetch(`${API_BASE}/api/autopilot.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), accountId, action, ...extra }),
    });
    return await r.json() as Reply;
  } catch (e) {
    return { success: false, error: `Could not reach the server: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** The run, the log and the approval queue together — one call, so they cannot
 *  disagree with each other on screen. */
export async function fetchAutopilot(limit = 100): Promise<{ run: AutopilotRun | null; actions: AutopilotAction[]; awaiting: number }> {
  const r = await call('get', { limit });
  return {
    run: r.success ? (r.autopilot ?? null) : null,
    actions: r.actions ?? [],
    /* `get` answers a count; the day feed answers a list under the same name.
       Narrowed here rather than renaming one of them, because both are the
       right word for the screen that asks. */
    awaiting: typeof r.awaiting === 'number' ? r.awaiting : (r.awaiting?.length ?? 0),
  };
}

export async function startAutopilot(objective: string): Promise<Reply> {
  return call('start', { objective });
}

export async function setAutopilotStatus(status: AutopilotStatus): Promise<Reply> {
  return call('set_status', { status });
}

export async function setGuardrails(guardrails: Partial<AIGuardrails>): Promise<Reply> {
  return call('set_guardrails', { guardrails });
}

/** Release a held-back action. The next tick carries it out. */
export async function approveAction(actionId: string): Promise<Reply> {
  return call('approve', { actionId });
}

export async function rejectAction(actionId: string): Promise<Reply> {
  return call('reject', { actionId });
}

/* ── One project's day ────────────────────────────────────────────────────── */

/** A send as the delivery log recorded it, for the previews on a dashboard. */
export interface DaySend {
  id: string;
  channel: string;
  source: string;
  sourceName: string;
  recipient: string;
  subject: string;
  status: string;
  detail: string;
  createdAt: string;
}

export interface ProjectDay {
  /** The customer's own calendar date, which is what "today" means here. */
  today: string;
  timezone: string;
  didToday: AutopilotAction[];
  failedToday: AutopilotAction[];
  awaiting: AutopilotAction[];
  upcoming: AutopilotAction[];
  sentToday: DaySend[];
  totals: { doneToday: number; failedToday: number; awaiting: number; sentToday: number };
}

/**
 * Everything one project's dashboard shows, in one call.
 *
 * One rather than five, because five let the panels disagree with each other on
 * screen — and the whole point of the screen is that it is a single honest
 * account of one project at one moment. Read-only, so it is safe to poll.
 */
export async function fetchProjectDay(projectId: string): Promise<{ day: ProjectDay | null; error: string }> {
  const r = await call('day', { projectId });
  if (!r.success) return { day: null, error: String(r.error ?? 'Could not read what this project has done.') };
  return {
    day: {
      today: String(r.today ?? ''),
      timezone: String(r.timezone ?? 'UTC'),
      didToday: (r.didToday ?? []) as AutopilotAction[],
      failedToday: (r.failedToday ?? []) as AutopilotAction[],
      awaiting: (Array.isArray(r.awaiting) ? r.awaiting : []) as AutopilotAction[],
      upcoming: (r.upcoming ?? []) as AutopilotAction[],
      sentToday: (r.sentToday ?? []) as DaySend[],
      totals: (r.totals ?? { doneToday: 0, failedToday: 0, awaiting: 0, sentToday: 0 }) as ProjectDay['totals'],
    },
    error: '',
  };
}

export interface InstructionResult {
  ok: boolean;
  understood: boolean;
  message: string;
  /** Set when the cap was hit, so the box can say how many and when. */
  cap?: number;
  used?: number;
}

/**
 * Tell a project what to do, in words.
 *
 * Whatever it understands is *queued*, never carried out here: it goes onto the
 * same board under the same guardrails as anything the planner decided. A typed
 * sentence is easier to misread than a rule, so if anything it deserves more
 * scrutiny, not less — the customer sees the card and can reject it.
 */
export async function instructProject(projectId: string, instruction: string): Promise<InstructionResult> {
  const r = await call('instruct', { projectId, instruction });
  if (!r.success) {
    return {
      ok: false, understood: false,
      message: String(r.error ?? 'That could not be sent.'),
      cap: typeof r.cap === 'number' ? r.cap : undefined,
      used: typeof r.used === 'number' ? r.used : undefined,
    };
  }
  return { ok: true, understood: r.understood === true, message: String(r.message ?? '') };
}
