/**
 * serverData.ts — cloud sync for CRM data (MySQL via public/api/data.php).
 *
 * localStorage stays the fast local cache; the server is the source of truth
 * that makes each workspace's data follow the login across devices.
 *
 *  • init(): health-check the backend; if configured, pull the active account's
 *    data into localStorage, then register a write listener so every subsequent
 *    change is pushed back (debounced, batched).
 *  • Falls back to local-only (current behaviour) when the backend isn't set up.
 */
import { onScopedWrite, rawSetScoped, getActiveAccountId } from './tenancy';
import { getSession } from './auth';
import { updateBilling } from './billing';
import type { BillingRecord } from './billing';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';
const STATUS_KEY = 'crm_cloud_status';   // global: 'cloud' | 'local'

export function cloudStatus(): 'cloud' | 'local' {
  return (window.localStorage.getItem(STATUS_KEY) as 'cloud' | 'local') || 'local';
}

async function call(action: string, body: Record<string, unknown> = {}): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${API_BASE}/api/data.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
    return await r.json();
  } catch { return null; }
}

export async function isConfigured(): Promise<boolean> {
  const res = await call('ping');
  return !!(res && res.configured);
}

/* ── Push queue (debounced batch) ── */
let pending: Record<string, string | null> = {};
let flushTimer: number | undefined;
let pushAccount = '';
let pushToken = '';

function queue(accountId: string, key: string, value: string | null) {
  if (accountId !== pushAccount) return;
  pending[key] = value;
  window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(flush, 900);
}

async function flush() {
  const items = pending;
  pending = {};
  if (Object.keys(items).length === 0) return;
  await call('bulk_set', { token: pushToken, accountId: pushAccount, items });
}

/* ── Pull the account's data down into localStorage ── */
async function pull(accountId: string, token: string): Promise<boolean> {
  const res = await call('get_all', { token, accountId });
  if (!res || !res.success) return false;
  const rows = (res.rows ?? {}) as Record<string, string>;
  for (const [key, value] of Object.entries(rows)) {
    if (typeof value === 'string') rawSetScoped(accountId, key, value);
  }
  return true;
}

/** Agency-only: pull Stripe-webhook-updated billing statuses and apply them locally. */
export async function syncBillingStatuses(token: string): Promise<void> {
  const res = await call('get_all', { token, accountId: '__agency__' });
  if (!res || !res.success) return;
  const rows = (res.rows ?? {}) as Record<string, string>;
  for (const [key, value] of Object.entries(rows)) {
    if (!key.startsWith('crm_billing_status_')) continue;
    try {
      const rec = JSON.parse(value) as { accountId: string; status: BillingRecord['status']; customer?: string };
      if (rec.accountId && rec.status) updateBilling(rec.accountId, { status: rec.status, ...(rec.customer ? { customerId: rec.customer } : {}) });
    } catch { /* ignore */ }
  }
}

/**
 * Initialise cloud sync. Returns quickly with a status. Safe to call once at
 * startup after auth. Never throws — degrades to local-only on any failure.
 */
export async function initCloudSync(timeoutMs = 6000): Promise<'cloud' | 'local'> {
  const session = getSession();
  const accountId = getActiveAccountId();
  if (!session || !accountId) { window.localStorage.setItem(STATUS_KEY, 'local'); return 'local'; }

  const done = (async (): Promise<'cloud' | 'local'> => {
    const configured = await isConfigured();
    if (!configured) { window.localStorage.setItem(STATUS_KEY, 'local'); return 'local'; }
    pushAccount = accountId;
    pushToken = session.token;
    await pull(accountId, session.token);
    // agency owners: apply any Stripe-webhook billing status updates
    if (session.user.role === 'agency') await syncBillingStatuses(session.token);
    // register the write listener so future changes sync up
    onScopedWrite((a, key, value) => queue(a, key, value));
    window.localStorage.setItem(STATUS_KEY, 'cloud');
    return 'cloud';
  })();

  // don't block startup forever if the host is slow/unreachable
  const timeout = new Promise<'cloud' | 'local'>(res => setTimeout(() => res('local'), timeoutMs));
  return Promise.race([done, timeout]);
}
