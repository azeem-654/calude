/** The affiliate program's API (worker/src/routes/affiliate.ts). */
import { sessionToken } from './auth';

export type Totals = Record<string, { pending: number; payable: number; paid: number }>;
export interface Commission {
  id: string; customer: string; affiliate?: string; base: number; amount: number; rate?: number; currency: string;
  status: 'pending' | 'payable' | 'paid' | 'void'; createdAt: string; payableAt: string; paidAt: string | null;
}
export interface Program {
  joined: boolean; rate: number; holdDays: number; termsVersion: string;
  code?: string; status?: string; payoutNote?: string;
  stats?: { clicks: number; signups: number; paying: number };
  totals?: Totals;
  referrals?: { customer: string; at: string; paying: boolean }[];
  commissions?: Commission[];
}
export interface AdminView {
  rate: number; totals: Totals;
  affiliates: { email: string; name: string; code: string; status: string; clicks: number; signups: number; payoutNote: string; createdAt: string; totals: Totals }[];
  commissions: Commission[];
}

async function call<T>(action: string, extra: Record<string, unknown> = {}): Promise<T & { success: boolean; error?: string }> {
  const r = await fetch('/api/affiliate.php', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: sessionToken(), action, ...extra }),
  });
  return r.json();
}

export const affiliateStatus = () => call<{ program: Program }>('status');
export const joinAffiliate = (payoutNote: string, agree: boolean) => call<{ program: Program }>('join', { payoutNote, agree });
export const savePayoutNote = (payoutNote: string) => call<{ program: Program }>('payout', { payoutNote });
export const affiliateAdmin = () => call<AdminView>('admin');
export const markCommission = (id: string, status: 'paid' | 'void' | 'pending') => call<object>('admin_mark', { id, status });

export const money = (cents: number, currency = 'USD') => {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100); }
  catch { return `${(cents / 100).toFixed(2)} ${currency}`; }
};
