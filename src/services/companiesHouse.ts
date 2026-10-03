/**
 * The install owner's Companies House key — "Verified business directories"
 * in AI Prospecting (worker/src/lib/companiesHouse.ts). Sent once, to be
 * stored; it never comes back.
 */
import { sessionToken } from './auth';
import { API_BASE } from './apiBase';

export interface RegisterState {
  success: boolean;
  error?: string;
  set?: boolean;
  status?: string;
  lastError?: string;
  updatedAt?: string | null;
  tested?: { ok: boolean; error: string };
}

async function call(action: string, extra: Record<string, unknown> = {}): Promise<RegisterState> {
  try {
    const r = await fetch(`${API_BASE}/api/companies-house.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), action, ...extra }),
    });
    return await r.json() as RegisterState;
  } catch {
    return { success: false, error: 'Could not reach the server.' };
  }
}

export const registerStatus = () => call('status');
export const saveRegisterKey = (apiKey: string) => call('save', { apiKey });
export const testRegisterKey = () => call('test');
