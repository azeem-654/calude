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
  awaiting?: number;
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
    awaiting: r.awaiting ?? 0,
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
