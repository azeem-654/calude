/**
 * billing.ts — Stripe subscription billing for sub-accounts.
 *
 * The agency stores its Stripe keys once (agency-global). For each sub-account
 * we can spin up a real Stripe Checkout Session (via public/api/stripe-checkout.php)
 * and track the resulting subscription status. Payment Links are also supported
 * as a zero-backend option.
 *
 * Keys live only in this browser + are sent per-request to your own PHP proxy;
 * they are never stored server-side.
 */

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

export interface StripeConfig {
  secretKey: string;       // sk_… (agency)
  publishableKey: string;  // pk_… (optional, for reference)
  connected: boolean;
}
export interface BillingRecord {
  accountId: string;
  status: 'none' | 'checkout_sent' | 'active' | 'past_due' | 'cancelled';
  checkoutUrl?: string;
  paymentLink?: string;    // optional manual Stripe Payment Link
  lastCheckoutAt?: string;
  priceId?: string;        // optional pre-made Stripe price
  customerId?: string;     // Stripe customer id (from webhook) — enables the portal
}

const CFG_KEY = 'crm_stripe_config';      // agency-global
const BILL_KEY = 'crm_billing_records';   // agency-global

export function loadStripeConfig(): StripeConfig {
  try { const c = JSON.parse(window.localStorage.getItem(CFG_KEY) || 'null'); if (c) return c; } catch { /* ignore */ }
  return { secretKey: '', publishableKey: '', connected: false };
}
export function saveStripeConfig(c: StripeConfig) {
  window.localStorage.setItem(CFG_KEY, JSON.stringify({ ...c, connected: !!c.secretKey }));
}

export function loadBilling(): BillingRecord[] {
  try { return JSON.parse(window.localStorage.getItem(BILL_KEY) || '[]'); } catch { return []; }
}
function saveBilling(list: BillingRecord[]) { window.localStorage.setItem(BILL_KEY, JSON.stringify(list)); }
export function billingFor(accountId: string): BillingRecord {
  return loadBilling().find(b => b.accountId === accountId) ?? { accountId, status: 'none' };
}
export function updateBilling(accountId: string, patch: Partial<BillingRecord>) {
  const list = loadBilling();
  const idx = list.findIndex(b => b.accountId === accountId);
  if (idx >= 0) list[idx] = { ...list[idx], ...patch };
  else list.push({ accountId, status: 'none', ...patch });
  saveBilling(list);
}

/** Create a real Stripe Checkout Session (subscription) for a client. */
export async function createCheckout(opts: {
  accountId: string; productName: string; amount: number; customerEmail: string; priceId?: string;
}): Promise<{ ok: boolean; url?: string; error?: string }> {
  const cfg = loadStripeConfig();
  if (!cfg.secretKey) return { ok: false, error: 'Add your Stripe secret key in Billing settings first.' };
  const base = window.location.origin + (import.meta.env.BASE_URL || '/');
  try {
    const r = await fetch(`${API_BASE}/api/stripe-checkout.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secretKey: cfg.secretKey, mode: 'subscription',
        priceId: opts.priceId || '', amount: opts.amount, currency: 'usd',
        productName: opts.productName, customerEmail: opts.customerEmail,
        successUrl: `${base}?billing=success`, cancelUrl: `${base}?billing=cancel`,
        accountId: opts.accountId,
      }),
    });
    const data = await r.json() as { success: boolean; url?: string; error?: string };
    if (data.success && data.url) {
      updateBilling(opts.accountId, { status: 'checkout_sent', checkoutUrl: data.url, lastCheckoutAt: new Date().toISOString() });
      return { ok: true, url: data.url };
    }
    return { ok: false, error: data.error || 'Stripe did not return a checkout URL.' };
  } catch {
    return { ok: false, error: 'Checkout endpoint unreachable. Deploy stripe-checkout.php and ensure PHP curl is enabled.' };
  }
}

/**
 * Client self-service checkout — uses the server-side Stripe secret (saved once
 * by the agency) authorised by the caller's session token, so the client never
 * holds the key.
 */
export async function createClientCheckout(opts: {
  accountId: string; token: string; productName: string; amount: number; customerEmail: string; priceId?: string;
}): Promise<{ ok: boolean; url?: string; error?: string }> {
  const base = window.location.origin + (import.meta.env.BASE_URL || '/');
  try {
    const r = await fetch(`${API_BASE}/api/stripe-checkout.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: opts.token, mode: 'subscription',
        priceId: opts.priceId || '', amount: opts.amount, currency: 'usd',
        productName: opts.productName, customerEmail: opts.customerEmail,
        successUrl: `${base}?billing=success`, cancelUrl: `${base}?billing=cancel`,
        accountId: opts.accountId,
      }),
    });
    const data = await r.json() as { success: boolean; url?: string; error?: string };
    if (data.success && data.url) {
      updateBilling(opts.accountId, { status: 'checkout_sent', checkoutUrl: data.url, lastCheckoutAt: new Date().toISOString() });
      return { ok: true, url: data.url };
    }
    return { ok: false, error: data.error || 'Stripe did not return a checkout URL.' };
  } catch {
    return { ok: false, error: 'Checkout endpoint unreachable. The workspace owner must enable billing first.' };
  }
}

/**
 * Open the Stripe Customer Portal so a client can manage their subscription &
 * payment method. Needs the server-side secret + a stored customer id (set by
 * the webhook after the first successful checkout).
 */
export async function openBillingPortal(accountId: string, token: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  const base = window.location.origin + (import.meta.env.BASE_URL || '/');
  try {
    const r = await fetch(`${API_BASE}/api/stripe-portal.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, accountId, returnUrl: `${base}billing` }),
    });
    const data = await r.json() as { success: boolean; url?: string; error?: string };
    if (data.success && data.url) return { ok: true, url: data.url };
    return { ok: false, error: data.error || 'Could not open the billing portal.' };
  } catch {
    return { ok: false, error: 'Billing portal unreachable. The workspace owner must enable billing first.' };
  }
}

/** Agency: save the Stripe secret (+ optional webhook secret) server-side so clients can self-serve. */
export async function saveStripeSecretToServer(token: string, secretKey: string, webhookSecret?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${API_BASE}/api/stripe-config.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', token, secretKey, webhookSecret: webhookSecret || '' }),
    });
    const data = await r.json() as { success: boolean; error?: string };
    return data.success ? { ok: true } : { ok: false, error: data.error || 'Could not save.' };
  } catch {
    return { ok: false, error: 'Config endpoint unreachable. Deploy stripe-config.php and set up the Cloud Database first.' };
  }
}

/** Fetch the caller's own billing record from the server (works for clients too). */
export async function fetchBillingRecord(accountId: string, token: string): Promise<{ status: BillingRecord['status']; hasCustomer: boolean } | null> {
  try {
    const r = await fetch(`${API_BASE}/api/stripe-config.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'record', token, accountId }),
    });
    const data = await r.json() as { success: boolean; status?: BillingRecord['status']; hasCustomer?: boolean };
    if (!data.success) return null;
    return { status: data.status || 'none', hasCustomer: !!data.hasCustomer };
  } catch { return null; }
}

/** Whether the server holds a Stripe secret (i.e. client self-service is enabled). */
export async function serverBillingEnabled(): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/api/stripe-config.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status' }),
    });
    const data = await r.json() as { success: boolean; hasSecret?: boolean };
    return !!(data.success && data.hasSecret);
  } catch { return false; }
}
