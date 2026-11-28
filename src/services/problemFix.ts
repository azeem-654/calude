/**
 * Reported problems and their fixes (worker/src/routes/problemFix.ts,
 * /api/problem-fix.php): the customer's own reports for the Report a problem
 * button, and the owner's Problem fixes tab.
 */
import { API_BASE } from './apiBase';
import { sessionToken } from './auth';

export type FixStatus = 'waiting' | 'fixing' | 'ready' | 'promoting' | 'fixed' | 'declined' | 'failed';

/** What the customer sent: a bug, an improvement to a feature, or a new feature. */
export type FixKind = 'bug' | 'improvement' | 'feature';
export const KIND_LABEL: Record<FixKind, string> = { bug: 'Bug', improvement: 'Improvement', feature: 'New feature' };

/** One of the customer's reports, with the words to show them. */
export interface MyReport { id: string; reference: string; status: FixStatus; kind: FixKind; description: string; createdAt: string; updatedAt: string; title: string; body: string }

export interface OwnerReport {
  id: string; ticketId: string; reference: string; email: string; name: string; accountId: string; page: string;
  description: string; pictures: number; hasAudio: boolean; status: FixStatus; ship: string; kind: FixKind; sessionUrl: string;
  note: string; error: string; changed: string; customerSees: string; improved: string; testSteps: string; commitSha: string;
  testingUrl: string; createdAt: string; decidedAt: string | null; sentAt: string | null; readyAt: string | null;
  promotedAt: string | null; fixedAt: string | null; toldAt: string | null; updatedAt: string;
}

export interface FixConfigView {
  connected: boolean; url: string; tokenSet: boolean; status: string; lastError: string; checkedAt: string | null;
  digestHours: number[]; diagnose: boolean; prompt: string; host: string; testingHost: string;
}

export type FixAnswer = Record<string, unknown> & { success?: boolean; error?: string; message?: string; field?: string };

export async function fixApi(action: string, extra: Record<string, unknown> = {}): Promise<FixAnswer> {
  try {
    const r = await fetch(`${API_BASE}/api/problem-fix.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ action, token: sessionToken(), ...extra }),
    });
    return await r.json() as FixAnswer;
  } catch {
    return { success: false, error: 'Could not reach the server.' };
  }
}

/** Shared by the button and the report sheet, so a report just sent shows at once. */
export const FIX_EVENT = 'pc-problem-reported';

export async function myReports(): Promise<{ reports: MyReport[]; strategyCall: string }> {
  const r = await fixApi('mine');
  return r.success ? { reports: (r.reports as MyReport[]) ?? [], strategyCall: String(r.strategyCall ?? '') } : { reports: [], strategyCall: '' };
}

/** Still something the customer is waiting on (the button shows it). */
export const isOpen = (s: FixStatus) => s === 'waiting' || s === 'fixing' || s === 'ready' || s === 'promoting';
/** Built and on the testing site, not live yet. */
export const isTesting = (s: FixStatus) => s === 'ready' || s === 'promoting';
