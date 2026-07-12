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
  limits: { contacts: number; users: number };   // -1 = unlimited
}

export const PLANS: Plan[] = [
  { id: 'starter', name: 'Starter', price: 97, color: '#3e63dd', features: ['CRM & Pipelines', 'Conversations inbox', '2 team members', 'Up to 2,500 contacts'], limits: { contacts: 2500, users: 2 } },
  { id: 'pro', name: 'Pro', price: 297, color: '#8b5cf6', features: ['Everything in Starter', 'Marketing & Funnels', 'AI auto-replies', 'Reputation management', '10 team members', 'Up to 25,000 contacts'], limits: { contacts: 25000, users: 10 } },
  { id: 'agency', name: 'Agency', price: 497, color: '#17191c', features: ['Everything in Pro', 'AI Shorts & Social Creator', 'Unlimited team members', 'Unlimited contacts', 'Priority support'], limits: { contacts: -1, users: -1 } },
];
export function planById(id: PlanId): Plan { return PLANS.find(p => p.id === id) ?? PLANS[0]; }

export interface SubAccount {
  id: string;
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
}

export interface AgencyProfile {
  name: string;
  ownerEmail: string;
}

/* ── Global (un-scoped) keys ── */
const GLOBAL_KEYS = new Set([
  'crm_subaccounts', 'crm_active_account', 'crm_agency', 'crm_sidebar_mode',
  'crm_anthropic_key', 'crm_openai_key',
]);
const PREFIX = 'crm_acct_';

let installed = false;
/** Monkey-patch localStorage so every non-global crm_* key is scoped to the active account. */
export function installTenantStorage() {
  if (installed) return;
  installed = true;
  const ls = window.localStorage;
  const _get = ls.getItem.bind(ls);
  const _set = ls.setItem.bind(ls);
  const _remove = ls.removeItem.bind(ls);

  const scoped = (key: string): string => {
    if (!key.startsWith('crm_') || GLOBAL_KEYS.has(key) || key.startsWith(PREFIX)) return key;
    const active = _get('crm_active_account');
    if (!active) return key;   // no account yet → leave un-prefixed (pre-migration)
    return `${PREFIX}${active}_${key}`;
  };

  Storage.prototype.getItem = function (key: string) {
    return this === ls ? _get(scoped(key)) : Storage.prototype.getItem.call(this, key);
  };
  Storage.prototype.setItem = function (key: string, value: string) {
    if (this === ls) return _set(scoped(key), value);
    return Storage.prototype.setItem.call(this, key, value);
  };
  Storage.prototype.removeItem = function (key: string) {
    if (this === ls) return _remove(scoped(key));
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

export function createSubAccount(partial: SubAccount): SubAccount {
  const list = loadSubAccounts();
  saveSubAccounts([...list, partial]);
  return partial;
}
export function updateSubAccount(id: string, patch: Partial<SubAccount>) {
  saveSubAccounts(loadSubAccounts().map(a => a.id === id ? { ...a, ...patch } : a));
}
export function deleteSubAccount(id: string) {
  saveSubAccounts(loadSubAccounts().filter(a => a.id !== id));
  // wipe its scoped data
  const toDelete: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith(`${PREFIX}${id}_`)) toDelete.push(k);
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
    id, name: 'Main Workspace', businessName: 'My Business', contactName: 'John Doe', contactEmail: 'aiautomationapp@gmail.com',
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
