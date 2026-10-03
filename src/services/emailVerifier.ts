/**
 * The install owner's email finder & verifier key — mailbox checks (and, with
 * Hunter, web searches for published addresses) behind AI Prospecting
 * (worker/src/lib/emailVerify.ts, routes/emailVerifier.ts). The key is sent
 * once, to be stored; it never comes back.
 */
import { sessionToken } from './auth';
import { API_BASE } from './apiBase';

export interface VerifierState {
  success: boolean;
  error?: string;
  field?: string;
  set?: boolean;
  provider?: string;
  finds?: boolean;
  status?: string;
  lastError?: string;
  updatedAt?: string | null;
  month?: { verify: number; find: number };
  budget?: { verify: { day: number; month: number }; find: { day: number; month: number } };
  providers?: { id: string; name: string; finds: boolean; where: string }[];
  tested?: { ok: boolean; error: string; credits: string };
}

async function call(action: string, extra: Record<string, unknown> = {}): Promise<VerifierState> {
  try {
    const r = await fetch(`${API_BASE}/api/email-verifier.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), action, ...extra }),
    });
    return await r.json() as VerifierState;
  } catch {
    return { success: false, error: 'Could not reach the server.' };
  }
}

export const verifierStatus = () => call('status');
export const saveVerifier = (provider: string, apiKey: string) => call('save', { provider, apiKey });
export const testVerifier = () => call('test');
export const removeVerifier = () => call('remove');
