/**
 * The supplier who makes and posts the goods.
 *
 * The token never comes back from the server, so nothing here holds one: the
 * form sends it and afterwards knows only whether one is connected and whether
 * it last tested clean.
 */
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';
import { API_BASE } from './apiBase';
import type { Diagnosis } from './storefront';

export interface SupplierState {
  provider: string;
  connected: boolean;
  storeId: string;
  verifiedAt: string | null;
  lastError: string;
}

export const EMPTY_SUPPLIER: SupplierState = {
  provider: 'printful', connected: false, storeId: '', verifiedAt: null, lastError: '',
};

interface Reply {
  success: boolean;
  error?: string;
  supplier?: SupplierState;
  diagnosis?: Diagnosis;
  stores?: { id: number; name: string }[];
  needsStoreId?: boolean;
  added?: number;
  updated?: number;
  skipped?: string[];
  note?: string;
  supplierRef?: string;
  status?: string;
  partial?: string[];
}

async function call(action: string, extra: Record<string, unknown> = {}): Promise<Reply> {
  const accountId = getActiveAccountId();
  if (!accountId) return { success: false, error: 'No workspace is active yet.' };
  try {
    const r = await fetch(`${API_BASE}/api/supplier.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), accountId, action, ...extra }),
    });
    return await r.json() as Reply;
  } catch (e) {
    return { success: false, error: `Could not reach the server: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export const fetchSupplier = () => call('get');
export const saveSupplier = (supplierToken: string, storeId: string) => call('save', { supplierToken, storeId });
export const testSupplier = () => call('test');
export const disconnectSupplier = () => call('disconnect');
export const importProducts = () => call('import');

/** First press creates a draft at the supplier; `confirm` is what spends money. */
export const fulfilOrder = (orderId: string, confirm = false) => call('fulfil', { orderId, confirm });
