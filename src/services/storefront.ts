/**
 * Connecting the customer's own Stripe account, and asking a buyer to pay.
 *
 * The key never comes back from the server — not masked, not truncated. So
 * nothing here holds one: the form sends a key and afterwards knows only
 * whether one is connected and whether it last tested clean.
 */
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';
import { API_BASE } from './apiBase';

export interface ProviderChoice {
  id: string;
  label: string;
  /** Empty means the processor takes most currencies. */
  currencies: string[];
  keyHint: string;
}

export interface StorefrontState {
  /** Which processor this workspace is connected to. */
  provider: string;
  providerLabel: string;
  /** 'live' or 'test'. Null when nothing is connected. */
  mode: 'live' | 'test' | null;
  connected: boolean;
  webhookSet: boolean;
  /** False when the workspace's currency is one the processor will not take —
   *  known before a buyer meets it rather than after. */
  currencySupported: boolean;
  /** What this app can connect to, for the picker. */
  choices: ProviderChoice[];
  verifiedAt: string | null;
  lastError: string;
  successUrl: string;
  cancelUrl: string;
  currency: string;
  /** The address to paste into Stripe when adding the endpoint. */
  webhookUrl: string;
}

export interface Diagnosis { summary: string; steps: string[] }

interface Reply {
  success: boolean;
  error?: string;
  storefront?: StorefrontState;
  diagnosis?: Diagnosis;
  account?: { name: string; mode: 'live' | 'test'; chargesEnabled: boolean };
  url?: string;
  sessionId?: string;
  expiresNote?: string;
}

export const EMPTY_STOREFRONT: StorefrontState = {
  provider: 'stripe', providerLabel: 'Stripe', mode: null, connected: false, webhookSet: false,
  currencySupported: true, choices: [], verifiedAt: null, lastError: '',
  successUrl: '', cancelUrl: '', currency: 'USD', webhookUrl: '',
};

async function call(action: string, extra: Record<string, unknown> = {}): Promise<Reply> {
  const accountId = getActiveAccountId();
  if (!accountId) return { success: false, error: 'No workspace is active yet.' };
  try {
    const r = await fetch(`${API_BASE}/api/storefront.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), accountId, action, ...extra }),
    });
    return await r.json() as Reply;
  } catch (e) {
    return { success: false, error: `Could not reach the server: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export const fetchStorefront = () => call('get');

export interface StorefrontDraft {
  provider?: string;
  /** The processor's secret, whichever processor it is. */
  apiKey?: string;
  webhookSecret?: string;
  successUrl?: string;
  cancelUrl?: string;
  currency?: string;
}
export const saveStorefront = (d: StorefrontDraft) => call('save', d as Record<string, unknown>);
export const testStorefront = () => call('test');
export const disconnectStorefront = () => call('disconnect');

/** A Checkout Session on the customer's own account, for an order they took. */
export const payLink = (orderId: string) => call('pay_link', { orderId });
