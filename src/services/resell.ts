/** Reselling at your own price (worker/src/routes/resell.ts). */
import { sessionToken } from './auth';

export interface ResellClient { accountId: string; amountCents: number; currency: string; status: 'none' | 'checkout_sent' | 'active' | 'past_due' | 'cancelled'; lastPaidAt: string | null }
export interface ResellState {
  connected: boolean; provider: string | null; providerLabel: string | null; mode: 'live' | 'test' | null;
  webhookSet: boolean; webhookUrl: string; status: string; lastError: string;
  choices: { id: string; label: string; currencies: string[]; keyHint: string }[];
  clients: ResellClient[];
}
type Res<T> = T & { success: boolean; error?: string; message?: string; field?: string };

async function call<T>(action: string, extra: Record<string, unknown> = {}): Promise<Res<T>> {
  const r = await fetch('/api/resell.php', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: sessionToken(), action, ...extra }),
  });
  return r.json();
}

export const resellStatus = () => call<{ resell: ResellState }>('status');
export const connectResell = (provider: string, apiKey: string, webhookSecret: string) => call<{ resell: ResellState }>('connect', { provider, apiKey, webhookSecret });
export const testResell = () => call<{ resell: ResellState; account?: { name: string; mode: string } }>('test');
export const disconnectResell = () => call<{ resell: ResellState }>('disconnect');
export const setClientPrice = (accountId: string, amount: number, currency: string) => call<{ resell: ResellState }>('set_price', { accountId, amount, currency });
export const clientCheckout = (accountId: string, email: string, label: string) => call<{ url: string; expiresNote: string; resell: ResellState }>('checkout', { accountId, email, label });
