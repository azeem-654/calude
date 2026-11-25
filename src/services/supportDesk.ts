/**
 * The owner's support desk and the customer's side of it
 * (worker/src/routes/supportDesk.ts, /api/support-desk.php).
 */
import { API_BASE } from './apiBase';
import { sessionToken } from './auth';
import type { TrialState } from './customers';
import { getSession } from './auth';
import { keepOnlyWorkspaces, loadSubAccounts, switchAccount } from './tenancy';
import { flushNow } from './serverData';

export type Segment = 'trial' | 'ended' | 'paid' | 'appsumo' | 'other';
export const SEGMENT_LABEL: Record<Segment, string> = {
  trial: 'On trial', ended: 'Trial ended', paid: 'Paid', appsumo: 'AppSumo', other: 'No plan',
};

export interface DeskCustomer {
  email: string; name: string; createdAt: string; accountId: string; trial: TrialState;
  segment: Segment; lastSeen: string | null; online: boolean; onlinePath: string; onlineApp: string;
  projects: number; mailboxes: number; optedOut: boolean;
  access: { id: string; status: 'pending' | 'active'; expiresAt: string | null; hours: number } | null;
}

export interface AccessRow {
  id: string; customerEmail: string; accountId: string; mode: 'assist' | 'review'; hours: number; reason: string;
  status: string; requestedBy: string; requestedAt: string; decidedAt: string | null; expiresAt: string | null; endedAt: string | null;
}

export interface Broadcast {
  id: string; kind: 'update' | 'marketing'; subject: string; audience: string; inApp: number; status: string;
  total: number; sent: number; failed: number; skipped: number; queued: number; createdAt: string; finishedAt: string | null;
}

export interface OwnerAlert { id: string; kind: string; email: string; summary: string; route: string; createdAt: string }

export type DeskAnswer = Record<string, unknown> & { success?: boolean; error?: string; message?: string; field?: string };

export async function desk(action: string, extra: Record<string, unknown> = {}): Promise<DeskAnswer> {
  try {
    const r = await fetch(`${API_BASE}/api/support-desk.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token: sessionToken(), ...extra }),
    });
    return await r.json() as DeskAnswer;
  } catch {
    return { success: false, error: 'Could not reach the server.' };
  }
}

export const deskError = (d: DeskAnswer, fallback: string) => String(d.error ?? d.message ?? fallback);

/* ── Opening a customer's workspace on their permission ──
 * The switcher entry is marked, so the banner knows whose it is and when it
 * ends, and so leaving removes it and every key of theirs from this browser. */
export const SUPPORT_VISIT_KEY = 'pc_support_visit';
export interface SupportVisit { accessId: string; accountId: string; customerEmail: string; customerName: string; expiresAt: string; returnTo: string }

export function currentVisit(): SupportVisit | null {
  try {
    const v = JSON.parse(localStorage.getItem(SUPPORT_VISIT_KEY) || 'null') as SupportVisit | null;
    return v && v.accountId && v.expiresAt ? v : null;
  } catch { return null; }
}

/** Leave a customer's workspace: save what is pending while it is still allowed, then forget it here. */
export async function leaveVisit(): Promise<void> {
  const v = currentVisit();
  if (!v) return;
  if (Date.parse(v.expiresAt) > Date.now()) await Promise.race([flushNow().catch(() => false), new Promise(r => setTimeout(r, 3000))]);
  const email = getSession()?.user.email ?? '';
  const keep = loadSubAccounts().map(a => a.id).filter(id => id !== v.accountId);
  try { keepOnlyWorkspaces(keep, email); } catch { /* storage off */ }
  try { localStorage.removeItem(SUPPORT_VISIT_KEY); } catch { /* storage off */ }
  switchAccount(v.returnTo && v.returnTo !== v.accountId ? v.returnTo : (keep[0] ?? ''));
}

