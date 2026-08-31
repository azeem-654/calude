/**
 * tenancy.ts — GoHighLevel-style sub-account (multi-tenant) layer.
 *
 * An AGENCY owns many SUB-ACCOUNTS (client workspaces). Each sub-account is a
 * fully isolated CRM: its own contacts, pipelines, conversations, reviews, etc.
 *
 * Isolation is achieved by transparently prefixing every `crm_*` localStorage
 * key with the active sub-account id — so ALL existing modules/services become
 * tenant-scoped without any per-module changes. A small allowlist of keys stays
 * global (the sub-account registry, active pointer, agency profile, UI prefs).
 *
 * installTenantStorage() MUST run before any module reads storage (see main.tsx).
 */

export type PlanId = 'starter' | 'pro' | 'agency' | 'custom';
export type AccountStatus = 'active' | 'trial' | 'paused' | 'cancelled';

export interface Plan {
  id: PlanId;
  name: string;
  price: number;          // monthly, what the agency charges the client
  color: string;
  features: string[];
  /** -1 = unlimited. `resell` is how many sub-accounts this plan may create. */
  limits: { contacts: number; users: number; resell: number };
}

/*
 * The three plans, and what each one lets a workspace resell.
 *
 * `resell` is the number of sub-accounts the holder of the plan may create
 * underneath itself: 2, 12, or no limit. It is what makes the hierarchy more
 * than one level deep — a sub-account on Studio is itself an agency to the two
 * workspaces it opens, sets their price, and puts its own name on them.
 *
 * -1 means no limit throughout, matching how `contacts` and `users` already
 * read here.
 */
export const PLANS: Plan[] = [
  {
    id: 'starter', name: 'Studio', price: 49, color: '#3e63dd',
    features: ['CRM & Pipelines', 'Conversations inbox', 'Resell to 2 sub-accounts', 'White-label your own name', 'Up to 2,500 contacts'],
    limits: { contacts: 2500, users: 2, resell: 2 },
  },
  {
    id: 'pro', name: 'Agency', price: 97, color: '#8b5cf6',
    features: ['Everything in Studio', 'Marketing & Funnels', 'AI auto-replies', 'Resell to 12 sub-accounts', 'Up to 25,000 contacts'],
    limits: { contacts: 25000, users: 10, resell: 12 },
  },
  {
    id: 'agency', name: 'Network', price: 149, color: '#17191c',
    features: ['Everything in Agency', 'AI Shorts & Social Creator', 'Unlimited sub-accounts', 'Unlimited contacts', 'Priority support'],
    limits: { contacts: -1, users: -1, resell: -1 },
  },
];
export function planById(id: PlanId): Plan { return PLANS.find(p => p.id === id) ?? PLANS[0]; }

export interface Branding {
  appName?: string;         // white-label product name shown in the nav/login
  logoUrl?: string;         // optional logo image
  loginHeadline?: string;   // headline on the client login screen
}

export interface SubAccount {
  id: string;
  /**
   * Who opened this workspace.
   *
   * `null` is the master account's own children — the top level. Anything else
   * is the id of the sub-account that resold it, which is what makes the tree
   * more than two deep. A workspace is only ever visible to its own line of
   * ancestors; see `descendantsOf` and the server's crm_workspaces table.
   */
  parentId?: string | null;
  name: string;             // workspace / location name
  businessName: string;
  contactName: string;
  contactEmail: string;
  phone: string;
  industry: string;
  color: string;            // branding accent
  plan: PlanId;
  price: number;            // actual charged price (defaults to plan price, overridable)
  status: AccountStatus;
  createdAt: string;
  trialEndsAt?: string;
  branding?: Branding;
}

export interface AgencyProfile {
  name: string;
  ownerEmail: string;
}

/* ── Global (un-scoped) keys ── */
const GLOBAL_KEYS = new Set([
  'crm_subaccounts', 'crm_active_account', 'crm_agency', 'crm_sidebar_mode',
  'crm_anthropic_key', 'crm_openai_key', 'crm_gemini_key', 'crm_theme',
  // How the dashboard board is displayed, not what it shows — a viewing
  // preference that belongs with the theme, following the user across accounts.
  'crm_market_sim',
  // Server-issued capability matrix: a local cache, never account data to sync.
  'crm_server_caps', 'crm_cloud_status',
  // The signed-in session itself. auth.ts documents this as global, but it was
  // missing here — so switching into a sub-account, or any client logging in
  // whose browser's active account didn't already match their own, silently
  // rewrote the session to a per-account key nothing had ever populated, and
  // the app reloaded to the logged-out marketing page. A session belongs to
  // the person, not to whichever workspace they happen to be looking at.
  'crm_session',
  // Same story for the agency's Stripe setup and its clients' billing status —
  // both explicitly commented "agency-global" in billing.ts, both left off
  // this list. Scoped, a key an agency owner set once while looking at one
  // workspace would appear to "vanish" the moment they opened another.
  'crm_stripe_config', 'crm_billing_records',
]);
export const ACCT_PREFIX = 'crm_acct_';
const PREFIX = ACCT_PREFIX;

// Raw (un-patched) accessors + a write listener the cloud-sync layer registers.
let _rawGetFn: (k: string) => string | null = (k) => window.localStorage.getItem(k);
let _rawSetFn: (k: string, v: string) => void = (k, v) => window.localStorage.setItem(k, v);
type ScopedWrite = (accountId: string, key: string, value: string | null) => void;
let scopedWriteListener: ScopedWrite | null = null;
/** The cloud-sync layer registers here to be told of every scoped write. */
export function onScopedWrite(fn: ScopedWrite | null) { scopedWriteListener = fn; }
/** Write a scoped value WITHOUT notifying the listener (used when pulling from server). */
export function rawSetScoped(accountId: string, key: string, value: string) { _rawSetFn(`${PREFIX}${accountId}_${key}`, value); }

let installed = false;
/** Monkey-patch localStorage so every non-global crm_* key is scoped to the active account. */
export function installTenantStorage() {
  if (installed) return;
  installed = true;
  const ls = window.localStorage;
  const _get = ls.getItem.bind(ls);
  const _set = ls.setItem.bind(ls);
  const _remove = ls.removeItem.bind(ls);
  _rawGetFn = _get; _rawSetFn = _set;

  const activeId = () => _get('crm_active_account');
  const isScopable = (key: string) => key.startsWith('crm_') && !GLOBAL_KEYS.has(key) && !key.startsWith(PREFIX);
  const scoped = (key: string): string => {
    if (!isScopable(key)) return key;
    const active = activeId();
    if (!active) return key;   // no account yet → leave un-prefixed (pre-migration)
    return `${PREFIX}${active}_${key}`;
  };

  Storage.prototype.getItem = function (key: string) {
    return this === ls ? _get(scoped(key)) : Storage.prototype.getItem.call(this, key);
  };
  Storage.prototype.setItem = function (key: string, value: string) {
    if (this === ls) {
      _set(scoped(key), value);
      const a = activeId();
      if (scopedWriteListener && a && isScopable(key)) scopedWriteListener(a, key, value);
      return;
    }
    return Storage.prototype.setItem.call(this, key, value);
  };
  Storage.prototype.removeItem = function (key: string) {
    if (this === ls) {
      _remove(scoped(key));
      const a = activeId();
      if (scopedWriteListener && a && isScopable(key)) scopedWriteListener(a, key, null);
      return;
    }
    return Storage.prototype.removeItem.call(this, key);
  };

  ensureDefaultAccount(_get, _set);
}

/** Raw (un-patched) access for reading another account's data in the agency view. */
function rawGet(id: string, key: string): string | null {
  return window.localStorage.getItem(`${PREFIX}${id}_${key}`);
}

/* ── Registry (global) ── */
export function loadSubAccounts(): SubAccount[] {
  try { return JSON.parse(window.localStorage.getItem('crm_subaccounts') || '[]'); } catch { return []; }
}
export function saveSubAccounts(list: SubAccount[]) {
  try { window.localStorage.setItem('crm_subaccounts', JSON.stringify(list)); } catch { /* ignore */ }
}
export function getActiveAccountId(): string | null {
  return window.localStorage.getItem('crm_active_account');
}
export function setActiveAccountId(id: string) {
  window.localStorage.setItem('crm_active_account', id);
}
export function activeAccount(): SubAccount | null {
  const id = getActiveAccountId();
  return loadSubAccounts().find(a => a.id === id) ?? null;
}
/** White-label branding for the active account (falls back to defaults). */
export function activeBranding(): Required<Branding> {
  const a = activeAccount();
  return {
    appName: a?.branding?.appName || 'Protected Central',
    logoUrl: a?.branding?.logoUrl || '',
    loginHeadline: a?.branding?.loginHeadline || 'Sign in to your workspace',
  };
}

/**
 * The customer's own business name, for signing mail they send.
 *
 * Deliberately not activeBranding().appName. That is the white-label *product*
 * name and it falls back to "Protected Central", so a dental practice's cold outreach went
 * out signed with the name of the CRM it was written in. Better unsigned than
 * signed by somebody else: an empty string here leaves the sign-off off
 * entirely, which every caller already handles.
 */
export function customerBusinessName(): string {
  const account = activeAccount();
  const fromAccount = (account?.businessName || '').trim();
  /* "My Business" is the placeholder a new sub-account is created with. */
  if (fromAccount && fromAccount.toLowerCase() !== 'my business') return fromAccount;

  try {
    const onboarding = JSON.parse(window.localStorage.getItem('crm_onboarding') || 'null');
    const company = String(onboarding?.profile?.companyName || '').trim();
    if (company) return company;
  } catch { /* nothing stored, or not readable */ }

  /* A branding name that was actually set is the customer's own; the default
     is the product's, and signing with it would be the original mistake. */
  const branded = (account?.branding?.appName || '').trim();
  const generic = ['crmpro', 'protected central'];
  return branded && !generic.includes(branded.toLowerCase()) ? branded : '';
}

export function loadAgency(): AgencyProfile {
  try { const a = JSON.parse(window.localStorage.getItem('crm_agency') || 'null'); if (a) return a; } catch { /* ignore */ }
  return { name: 'My Agency', ownerEmail: '' };
}
export function saveAgency(a: AgencyProfile) { window.localStorage.setItem('crm_agency', JSON.stringify(a)); }

export function blankSubAccount(): SubAccount {
  return {
    id: `acct-${Date.now()}`, name: '', businessName: '', contactName: '', contactEmail: '', phone: '', industry: '',
    color: '#3e63dd', plan: 'pro', price: planById('pro').price, status: 'trial',
    createdAt: new Date().toISOString(), trialEndsAt: new Date(Date.now() + 14 * 86400000).toISOString(),
  };
}

/* ── The tree ─────────────────────────────────────────────────────────── */

/**
 * The workspaces one account opened directly.
 *
 * `null` means the master account's own children. Passing a sub-account's id
 * gives the ones it resold, which is the same question one level down — the
 * hierarchy is the same shape at every level, and so is the code that reads it.
 */
export function childrenOf(parentId: string | null): SubAccount[] {
  return loadSubAccounts().filter(a => (a.parentId ?? null) === parentId);
}

/**
 * Everything below an account, at any depth.
 *
 * Iterative rather than recursive, and it remembers where it has been: a
 * `parentId` that somehow points at an ancestor would otherwise be an infinite
 * loop in the middle of rendering the agency dashboard. Bad data should draw a
 * short tree, not hang the tab.
 */
export function descendantsOf(parentId: string | null): SubAccount[] {
  const all = loadSubAccounts();
  const out: SubAccount[] = [];
  const seen = new Set<string>();
  let frontier = all.filter(a => (a.parentId ?? null) === parentId);
  while (frontier.length) {
    const next: SubAccount[] = [];
    for (const a of frontier) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
      next.push(...all.filter(c => c.parentId === a.id));
    }
    frontier = next;
  }
  return out;
}

/** How deep a workspace sits. The master account's own children are 1. */
export function depthOf(id: string): number {
  const all = loadSubAccounts();
  let depth = 0;
  let at: string | null | undefined = id;
  const seen = new Set<string>();
  while (at && !seen.has(at)) {
    seen.add(at);
    depth += 1;
    at = all.find(a => a.id === at)?.parentId ?? null;
  }
  return depth;
}

export interface ResellAllowance {
  /** How many this account may have open at once. -1 is unlimited. */
  allowed: number;
  used: number;
  /** What is left, or -1 when there is no ceiling. */
  remaining: number;
  canCreate: boolean;
  reason: string;
}

/**
 * May this account open another workspace, and how many has it left?
 *
 * `null` is the master account, which sells the plans rather than holding one
 * and is not limited by them. Everyone else is bounded by the plan they are on,
 * counted against the workspaces they have actually opened.
 */
export function resellAllowance(parentId: string | null): ResellAllowance {
  if (parentId === null) {
    return { allowed: -1, used: childrenOf(null).length, remaining: -1, canCreate: true, reason: '' };
  }
  const parent = loadSubAccounts().find(a => a.id === parentId);
  if (!parent) {
    return { allowed: 0, used: 0, remaining: 0, canCreate: false, reason: 'That workspace no longer exists.' };
  }
  const allowed = planById(parent.plan).limits.resell;
  const used = childrenOf(parentId).length;
  if (allowed < 0) return { allowed, used, remaining: -1, canCreate: true, reason: '' };
  const remaining = Math.max(0, allowed - used);
  return {
    allowed,
    used,
    remaining,
    canCreate: remaining > 0,
    reason: remaining > 0 ? '' :
      `${planById(parent.plan).name} includes ${allowed} sub-account${allowed === 1 ? '' : 's'} and all ${allowed} are in use. Upgrade the plan to open more.`,
  };
}

/**
 * Open a workspace under another one.
 *
 * The allowance is checked here rather than only in the form, because the form
 * is one of several callers and the limit is what the customer is paying for.
 */
export function createSubAccount(partial: SubAccount): SubAccount {
  const parentId = partial.parentId ?? null;
  const allowance = resellAllowance(parentId);
  if (!allowance.canCreate) throw new Error(allowance.reason);
  const list = loadSubAccounts();
  saveSubAccounts([...list, { ...partial, parentId }]);
  return { ...partial, parentId };
}
export function updateSubAccount(id: string, patch: Partial<SubAccount>) {
  saveSubAccounts(loadSubAccounts().map(a => a.id === id ? { ...a, ...patch } : a));
}
export function deleteSubAccount(id: string) {
  /* Everything the account resold goes with it. Left behind, those rows have a
     parentId pointing at nothing: invisible to every dashboard, still counted
     against nobody's allowance, and still holding their data. */
  const doomed = new Set([id, ...descendantsOf(id).map(a => a.id)]);
  saveSubAccounts(loadSubAccounts().filter(a => !doomed.has(a.id)));
  /* And their data — every one of them, not just the account named. Wiping only
     the parent's keys would leave each resold workspace's contacts and
     campaigns in storage with no account left to reach them by. */
  const toDelete: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (!k) continue;
    for (const gone of doomed) {
      if (k.startsWith(`${PREFIX}${gone}_`)) { toDelete.push(k); break; }
    }
  }
  toDelete.forEach(k => window.localStorage.removeItem(k));
}

/* ── Per-account usage snapshot (for the agency dashboard) ── */
export interface AccountUsage { contacts: number; deals: number; conversations: number; reviews: number; }
export function accountUsage(id: string): AccountUsage {
  const count = (key: string): number => {
    try { const v = JSON.parse(rawGet(id, key) || '[]'); return Array.isArray(v) ? v.length : 0; } catch { return 0; }
  };
  let deals = 0;
  try {
    const pipes = JSON.parse(rawGet(id, 'crm_pipelines') || '[]');
    if (Array.isArray(pipes)) deals = pipes.reduce((s: number, p: { stages?: { deals?: unknown[] }[] }) => s + (p.stages ?? []).reduce((x, st) => x + (st.deals?.length ?? 0), 0), 0);
  } catch { /* ignore */ }
  return {
    contacts: count('crm_contacts'),
    deals,
    conversations: count('crm_mailboxes'),
    reviews: count('crm_reputation_reviews'),
  };
}

/* ── First-run: create a default account and migrate any existing un-scoped data ── */
function ensureDefaultAccount(_get: (k: string) => string | null, _set: (k: string, v: string) => void) {
  const existing = _get('crm_subaccounts');
  if (existing && JSON.parse(existing).length) {
    if (!_get('crm_active_account')) _set('crm_active_account', JSON.parse(existing)[0].id);
    return;
  }
  const id = `acct-${Date.now()}`;
  const def: SubAccount = {
    id, name: 'Main Workspace', businessName: 'My Business', contactName: '', contactEmail: '',
    phone: '', industry: '', color: '#3e63dd', plan: 'agency', price: 0, status: 'active', createdAt: new Date().toISOString(),
  };
  _set('crm_subaccounts', JSON.stringify([def]));
  _set('crm_active_account', id);

  // Migrate: copy pre-existing un-scoped crm_* keys into this account's namespace
  const migrate: [string, string][] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith('crm_') && !GLOBAL_KEYS.has(k) && !k.startsWith(PREFIX)) {
      const val = _get(k);
      if (val != null) migrate.push([`${PREFIX}${id}_${k}`, val]);
    }
  }
  migrate.forEach(([nk, v]) => _set(nk, v));
}

/** Switch active account and hard-reload so every context/service re-reads scoped data. */
export function switchAccount(id: string) {
  setActiveAccountId(id);
  window.location.href = import.meta.env.BASE_URL || '/';
}
