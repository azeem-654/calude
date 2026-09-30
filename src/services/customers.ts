/**
 * The 7-day trial, the owner's messages, and the owner's list of sign-ups.
 *
 * `myAccount()` is the one reader of "my trial and my unread messages" on the
 * client. The trial bar, the corner message card and the help prompt all want
 * it on the same load; like autopilotPulse.ts, one shared promise stops that
 * being three requests for one answer. It is refreshed every ten minutes at
 * most — a trial counts in days.
 *
 * The server decides everything here (worker/src/routes/customers.ts,
 * lib/trial.ts). A trial that the browser could extend by editing storage
 * would not be a trial.
 */
import { API_BASE } from './apiBase';
import { sessionToken } from './auth';

export type TrialKind = 'owner' | 'paid' | 'trial' | 'ended' | 'legacy';

export interface TrialState { kind: TrialKind; endsAt: string | null; daysLeft: number }

export interface Notice {
  id: string;
  title: string;
  body: string;
  link: string;
  linkLabel: string;
  createdAt: string;
}

export interface MyAccount {
  trial: TrialState;
  notices: Notice[];
  kickoffUrl: string;
}

export interface CustomerSettings {
  kickoffUrl: string;
  welcomeOn: boolean;
  welcomeTitle: string;
  welcomeBody: string;
}

export interface Signup {
  email: string;
  name: string;
  createdAt: string;
  accountId: string;
  verifiedAt: string | null;
  hasPassword: number;
  lastSeen: string | null;
  sessions: number;
  projects: number;
  mailboxes: number;
  helpAsked: number;
  workspaces: number;
  trial: TrialState;
}

async function call(action: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  try {
    const r = await fetch(`${API_BASE}/api/customers.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token: sessionToken(), ...extra }),
    });
    return await r.json() as Record<string, unknown>;
  } catch {
    return { success: false, error: 'Could not reach the server.' };
  }
}

/* ── Mine ─────────────────────────────────────────────────────────────── */

const FRESH_MS = 10 * 60_000;
let cached: { at: number; value: Promise<MyAccount | null> } | null = null;
const listeners = new Set<(a: MyAccount | null) => void>();

/**
 * My trial and my unread messages. `null` means the server could not be asked
 * — which is not the same as "no trial", and nothing locks on it.
 */
export function myAccount(force = false): Promise<MyAccount | null> {
  if (!force && cached && Date.now() - cached.at < FRESH_MS) return cached.value;
  const value = call('mine').then(d => (d.success
    ? { trial: d.trial as TrialState, notices: (d.notices as Notice[]) ?? [], kickoffUrl: String(d.kickoffUrl ?? '') }
    : null));
  cached = { at: Date.now(), value };
  void value.then(v => listeners.forEach(fn => fn(v)));
  return value;
}

/** Told whenever `myAccount` is re-read, so every reader moves together. */
export function onMyAccount(fn: (a: MyAccount | null) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export async function readNotice(id: string): Promise<void> {
  await call('read', { id });
  void myAccount(true);
}

/* ── The owner's ──────────────────────────────────────────────────────── */

export async function loadSignups(): Promise<{ ok: boolean; error?: string; signups: Signup[]; canEmail: boolean; settings: CustomerSettings | null }> {
  const d = await call('signups');
  return {
    ok: !!d.success,
    error: d.success ? undefined : String(d.error ?? d.message ?? 'Could not load sign-ups.'),
    signups: (d.signups as Signup[]) ?? [],
    canEmail: !!d.canEmail,
    settings: (d.settings as CustomerSettings) ?? null,
  };
}

export async function saveCustomerSettings(settings: Partial<CustomerSettings>): Promise<{ ok: boolean; error?: string; settings?: CustomerSettings }> {
  const d = await call('settings_save', { settings });
  return d.success
    ? { ok: true, settings: d.settings as CustomerSettings }
    : { ok: false, error: String(d.error ?? d.message ?? 'Could not save.') };
}

export async function messageCustomers(msg: {
  to: string[]; title: string; body: string; link?: string; linkLabel?: string; email: boolean;
}): Promise<{ ok: boolean; error?: string; delivered?: number; emailed?: number; emailFailed?: number; dropped?: number }> {
  const d = await call('message', msg);
  if (!d.success) return { ok: false, error: String(d.error ?? d.message ?? 'Could not send.') };
  return {
    ok: true, delivered: Number(d.delivered ?? 0), emailed: Number(d.emailed ?? 0),
    emailFailed: Number(d.emailFailed ?? 0), dropped: Number(d.dropped ?? 0),
  };
}
