/**
 * Plan allowances from the browser's side — /api/allowances.php
 * (worker/src/routes/allowances.ts). The rules and the package table are the
 * Worker's own file, imported here so the site's price cards, Plan & billing
 * and the server's refusals read one table.
 *
 * ── For a screen about to make something ──
 *
 * `checkAllowance(meter, need, projectId?)` asks before starting something
 * long; every route that makes a counted thing also refuses on its own with
 * `code: 'allowance'` (`isAllowanceRefusal` reads that), so the check is a
 * courtesy, never the boundary.
 */
import { API_BASE } from './apiBase';
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';
import {
  INCLUDED, PLAN_DEFS, TRIAL_LIMITS, type Limits, type MeterId, type MeterReading, type PlanDef, type StandingKind,
} from '../../worker/src/lib/allowances';

export * from '../../worker/src/lib/allowances';

type Answer<T> = T & { success?: boolean; error?: string; message?: string; field?: string; code?: string };

async function call<T = Record<string, unknown>>(action: string, extra: Record<string, unknown> = {}, signedIn = true): Promise<Answer<T>> {
  try {
    const r = await fetch(`${API_BASE}/api/allowances.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signedIn ? { action, token: sessionToken(), accountId: getActiveAccountId(), ...extra } : { action, ...extra }),
    });
    return await r.json() as Answer<T>;
  } catch {
    return { success: false, error: 'Could not reach the server.' } as Answer<T>;
  }
}

/* ── The packages ── */

export interface PlanTable { plans: PlanDef[]; trial: { name: string; limits: Limits }; included: string[]; changed: string[] }

/** What the table says before the server has answered — the same numbers unless the owner changed some. */
export const DEFAULT_TABLE: PlanTable = { plans: PLAN_DEFS, trial: { name: 'Free trial', limits: TRIAL_LIMITS }, included: INCLUDED, changed: [] };

let table: Promise<PlanTable | null> | null = null;

/**
 * The packages as the server holds them, with the owner's changes. No session
 * needed — the public site reads it. null when the server could not be asked.
 */
export function fetchPlans(force = false): Promise<PlanTable | null> {
  if (!table || force) {
    table = call<PlanTable>('plans', {}, false).then(r => r.success && Array.isArray(r.plans) ? { plans: r.plans, trial: r.trial, included: r.included ?? INCLUDED, changed: r.changed ?? [] } : null);
    void table.then(t => { if (!t) table = null; });
  }
  return table;
}

/** The install owner changes one plan's numbers. Blank ('' or null) puts the plan's own back. */
export async function saveLimits(planId: string, limits: Partial<Record<MeterId, number | '' | null>>): Promise<Answer<PlanTable>> {
  const r = await call<PlanTable>('set_limits', { planId, limits });
  if (r.success) table = Promise.resolve({ plans: r.plans, trial: r.trial, included: INCLUDED, changed: r.changed ?? [] });
  return r;
}

/* ── A workspace's usage ── */

export interface AllowanceView {
  kind: StandingKind;
  planId: string;
  planName: string;
  period: string;
  resetsAt: string;
  workspaces: number;
  meters: MeterReading[];
  projects: { id: string; name: string; workflows: number }[];
}

let usage: { at: number; account: string; p: Promise<AllowanceView | null> } | null = null;
const listeners = new Set<(v: AllowanceView | null) => void>();

/** Every meter, used and allowed. Shared for half a minute between the screens that ask at once. */
export function fetchAllowances(force = false): Promise<AllowanceView | null> {
  const account = getActiveAccountId() ?? '';
  if (!usage || force || usage.account !== account || Date.now() - usage.at > 30_000) {
    const p = call<{ allowances: AllowanceView }>('status').then(r => r.success && r.allowances ? r.allowances : null);
    usage = { at: Date.now(), account, p };
    void p.then(v => { for (const fn of listeners) fn(v); if (!v) usage = null; });
  }
  return usage.p;
}

/** Called when something was made or removed, so every meter on screen reads again. */
export function refreshAllowances(): void { void fetchAllowances(true); }

export function onAllowances(fn: (v: AllowanceView | null) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/* ── Asking first ── */

export interface AllowanceRefusal {
  ok: false;
  message: string;
  meter: MeterId;
  used: number;
  limit: number;
  plan: { id: string; name: string };
  upgrade: { id: string; name: string; limit: number } | null;
  resetsAt: string;
}

/**
 * May `need` more of `meter` be made in this workspace? `projectId` for
 * workflows_per_project. `{ ok: true }` when the server could not be asked —
 * the making itself still refuses, so a lost check must not block anybody.
 */
export async function checkAllowance(meter: MeterId, need = 1, projectId = ''): Promise<{ ok: true; left: number } | AllowanceRefusal> {
  const r = await call<{ ok?: boolean; left?: number } & Partial<AllowanceRefusal>>('check', { meter, need, projectId });
  if (!r.success || r.ok !== false) return { ok: true, left: typeof r.left === 'number' ? r.left : -1 };
  return {
    ok: false, message: r.message || r.error || 'This plan’s allowance is used.', meter,
    used: r.used ?? 0, limit: r.limit ?? 0, plan: r.plan ?? { id: '', name: '' }, upgrade: r.upgrade ?? null, resetsAt: r.resetsAt ?? '',
  };
}

/** Is this answer from any /api/*.php route a plan-allowance refusal? */
export const isAllowanceRefusal = (r: { success?: boolean; code?: string } | null | undefined): boolean =>
  !!r && r.success === false && r.code === 'allowance';

/* ── The Custom plan: enquiries, and plans given by hand ── */

export type EnquiryNeed = 'limits' | 'setup' | 'integrations' | 'invoice' | 'other';

/** The Custom tier's form. Needs no session — the public pricing page sends it. */
export async function sendEnquiry(e: { name: string; email: string; company: string; needs: EnquiryNeed[]; message: string; url?: string }): Promise<Answer<Record<string, unknown>>> {
  return call('enquire', e, false);
}

export interface Enquiry { id: string; name: string; email: string; company: string; needs: EnquiryNeed[]; message: string; emailed: string; handledAt: string | null; createdAt: string }
export async function fetchEnquiries(): Promise<Enquiry[] | null> {
  const r = await call<{ enquiries: Enquiry[] }>('enquiries');
  return r.success ? r.enquiries : null;
}
export const markEnquiryDone = (id: string) => call('enquiry_done', { id });

export interface Grant { email: string; planId: string; at: string }
export async function fetchGrants(): Promise<Grant[] | null> {
  const r = await call<{ grants: Grant[] }>('grants');
  return r.success ? r.grants : null;
}
/** Give a customer a plan by hand ('' takes a hand-given one away). */
export const grantPlan = (email: string, planId: string) => call('grant_plan', { email, planId });
