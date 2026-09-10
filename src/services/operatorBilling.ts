/**
 * How this app charges its own subscribers, and who it charges through.
 *
 * Separate from services/storefront.ts on purpose: that one is a *customer*
 * being paid by their buyers. This one is the operator being paid by their
 * subscribers. Different money, different keys, and the only thing they share
 * is that both let you pick a processor.
 *
 * The key is written and never read back — there is no masked value here to
 * re-display.
 */
import { sessionToken } from './auth';
import { API_BASE } from './apiBase';
import type { Diagnosis, ProviderChoice } from './storefront';

export interface OperatorBilling {
  provider: string | null;
  providerLabel: string | null;
  connected: boolean;
  mode: 'live' | 'test' | null;
  webhookSet: boolean;
  /** True while the app is still billing through the old deployment secret —
   *  a working setup that nobody actually chose. */
  usingDeploymentSecret: boolean;
  status: string;
  lastError: string;
  webhookUrl: string;
  choices: ProviderChoice[];
}

export const EMPTY_OPERATOR_BILLING: OperatorBilling = {
  provider: null, providerLabel: null, connected: false, mode: null, webhookSet: false,
  usingDeploymentSecret: false, status: 'unknown', lastError: '', webhookUrl: '', choices: [],
};

interface Reply {
  success: boolean;
  error?: string;
  billing?: OperatorBilling;
  diagnosis?: Diagnosis;
  account?: { name: string; mode: 'live' | 'test'; chargesEnabled: boolean };
}

async function call(action: string, extra: Record<string, unknown> = {}): Promise<Reply> {
  try {
    const r = await fetch(`${API_BASE}/api/billing.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), action, ...extra }),
    });
    return await r.json() as Reply;
  } catch (e) {
    return { success: false, error: `Could not reach the server: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export const fetchOperatorBilling = () => call('config');
export const connectOperatorBilling = (provider: string, apiKey: string, webhookSecret: string) =>
  call('connect', { provider, apiKey, webhookSecret });
export const testOperatorBilling = () => call('test');
export const disconnectOperatorBilling = () => call('disconnect');
