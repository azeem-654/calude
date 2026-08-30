/**
 * serverData.ts — cloud sync for CRM data (D1, via the Worker's api/data.php).
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
import { API_BASE } from './apiBase';

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

/** Listeners told when the server refuses a write, so the UI can say so. */
type RejectionHandler = (message: string, keys: string[]) => void;
let onRejected: RejectionHandler | null = null;
export function onServerRejection(fn: RejectionHandler | null) { onRejected = fn; }

async function flush() {
  const items = pending;
  pending = {};
  if (Object.keys(items).length === 0) return;
  const res = await call('bulk_set', { token: pushToken, accountId: pushAccount, items });
  if (!res) return;   // offline — the next flush will retry

  // The server enforces the permission model in api/data.php. When it refuses a
  // change, take its version back rather than leaving the browser showing an
  // edit that was never saved.
  const rejected = (res.rejected ?? []) as string[];
  if (!rejected.length) return;
  const authoritative = (res.authoritative ?? {}) as Record<string, string | null>;
  for (const key of rejected) {
    const value = authoritative[key];
    if (typeof value === 'string') rawSetScoped(pushAccount, key, value);
  }
  onRejected?.(String(res.error || 'That change was refused by the server.'), rejected);
}

/* ── Server-enforced capabilities ── */

export interface ServerCapabilities {
  role: string;
  email: string;
  name: string;
  capabilities: Record<string, boolean>;
  ownerOnly: string[];
  enforced: boolean;
}

const CAPS_KEY = 'crm_server_caps';   // global (see tenancy GLOBAL_KEYS): a cache, not account data

/** What the server says this user may do. Cached for synchronous UI reads. */
export async function fetchCapabilities(): Promise<ServerCapabilities | null> {
  const session = getSession();
  const accountId = getActiveAccountId();
  if (!session || !accountId) return null;
  const res = await call('caps', { token: session.token, accountId });
  if (!res?.success || !res.matrix) return null;
  const matrix = res.matrix as unknown as ServerCapabilities;
  try { window.localStorage.setItem(CAPS_KEY, JSON.stringify(matrix)); } catch { /* storage blocked */ }
  return matrix;
}

/** The last capability matrix the server sent, or null if it never answered. */
export function cachedCapabilities(): ServerCapabilities | null {
  try {
    const raw = window.localStorage.getItem(CAPS_KEY);
    return raw ? JSON.parse(raw) as ServerCapabilities : null;
  } catch { return null; }
}

export function clearCachedCapabilities() {
  try { window.localStorage.removeItem(CAPS_KEY); } catch { /* storage blocked */ }
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
  if (!session || !accountId) { window.localStorage.setItem(STATUS_KEY, 'local'); clearCachedCapabilities(); return 'local'; }

  const done = (async (): Promise<'cloud' | 'local'> => {
    const configured = await isConfigured();
    if (!configured) { window.localStorage.setItem(STATUS_KEY, 'local'); clearCachedCapabilities(); return 'local'; }
    pushAccount = accountId;
    pushToken = session.token;
    await pull(accountId, session.token);
    await fetchCapabilities();
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
