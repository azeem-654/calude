/**
 * The browser's side of /api/appsumo.php (worker/src/routes/appsumo.ts):
 * redeeming AppSumo codes, claiming a license activated on AppSumo, and the
 * owner's tools for making codes.
 */
import { API_BASE } from './apiBase';
import { sessionToken } from './auth';

export type AppsumoAnswer = Record<string, unknown> & { success?: boolean; error?: string; field?: string };

export async function appsumoCall(action: string, extra: Record<string, unknown> = {}): Promise<AppsumoAnswer> {
  try {
    const r = await fetch(`${API_BASE}/api/appsumo.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token: sessionToken(), ...extra }),
    });
    return await r.json() as AppsumoAnswer;
  } catch {
    return { success: false, error: 'Could not reach the server.' };
  }
}

export interface AppsumoTier { id: string; name: string; lines: string[]; support: string }
export interface AppsumoStanding {
  codes: number;
  max: number;
  tier: AppsumoTier | null;
  /** Activated through AppSumo's own button (Licensing v2): the tier follows the AppSumo purchase, so codes do not stack on it. */
  license: { tier: number } | null;
  /** The subscriber's plan row as it stands: `source` is 'appsumo', a processor, 'manual' or 'default'. */
  activePlan: { id: string; source: string } | null;
}

/** What this subscriber holds. null for the install owner, a client login, or no answer. */
export async function appsumoStanding(): Promise<AppsumoStanding | null> {
  const r = await appsumoCall('status');
  return r.success && typeof r.codes === 'number' ? r as unknown as AppsumoStanding : null;
}
