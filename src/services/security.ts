/**
 * Settings → Security & Privacy, on the client.
 *
 * A thin wrapper over /api/security.php. Nothing here is decided in the
 * browser: sessions, 2-step, the activity log and what is connected are all
 * the server's answer about the signed-in account, so the page cannot show a
 * protection that is not really there.
 */
import { API_BASE } from './apiBase';
import { getSession } from './auth';
import { getActiveAccountId } from './tenancy';

export interface SecuritySession {
  id: string;
  current: boolean;
  device: string;
  network: string;
  method: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface SecurityEvent {
  at: string;
  kind: string;
  detail: string;
  device: string;
  network: string;
}

export interface SecurityOverview {
  account: {
    email: string;
    name: string;
    isInstallOwner: boolean;
    passwordSet: boolean;
    mfaEnabled: boolean;
    emailVerified: boolean;
    createdAt: string;
  };
  sessions: SecuritySession[];
  events: SecurityEvent[];
  workspace: {
    accountId: string;
    yourRole: string;
    members: { email: string; role: string }[];
    integrations: { key: string; label: string; connected: number }[];
  } | null;
  supportAccess: { enabled: boolean; note: string };
  /** Install owner only: is CREDENTIAL_WRAP_KEY set, and how many install secrets it protects. */
  install?: { wrapKeySet: boolean; wrapped: number } | null;
}

async function call<T = Record<string, unknown>>(action: string, extra: Record<string, unknown> = {}): Promise<{ ok: boolean; data: T & { error?: string; message?: string } }> {
  try {
    const r = await fetch(`${API_BASE}/api/security.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token: getSession()?.token, accountId: getActiveAccountId(), ...extra }),
    });
    const data = await r.json() as T & { success?: boolean; error?: string };
    return { ok: !!data.success, data };
  } catch {
    return { ok: false, data: { error: 'Could not reach the server.' } as T & { error?: string } };
  }
}

export async function fetchSecurity(): Promise<{ ok: boolean; overview?: SecurityOverview; error?: string }> {
  const r = await call<SecurityOverview>('overview');
  return r.ok ? { ok: true, overview: r.data } : { ok: false, error: r.data.error ?? 'Could not load your security settings.' };
}

export const revokeSession = (id: string) => call('revoke_session', { id });
export const revokeOtherSessions = () => call<{ ended: number }>('revoke_others');
export const beginTwoStep = () => call<{ secret: string; url: string }>('mfa_begin');
export const enableTwoStep = (code: string) => call('mfa_enable', { code });
export const disableTwoStep = (code: string, password: string) => call('mfa_disable', { code, password });
export const exportWorkspace = () => call<{ export: unknown }>('export');
export const deleteAccount = (password: string, code: string) => call('delete_account', { confirm: 'DELETE', password, code });

/** What each audit kind says to a person. */
export const EVENT_LABEL: Record<string, string> = {
  login: 'Signed in',
  login_failed: 'Failed sign-in attempt',
  logout: 'Signed out',
  session_revoked: 'Signed a device out',
  sessions_revoked: 'Signed out other devices',
  password_changed: 'Changed password',
  password_reset_by_admin: 'Password set by an administrator',
  mfa_enabled: 'Turned on 2-step sign-in',
  mfa_disabled: 'Turned off 2-step sign-in',
  mfa_failed: 'Wrong 2-step code entered',
  user_created: 'Added a user',
  user_removed: 'Removed a user',
  integration_connected: 'Connected a service',
  integration_removed: 'Disconnected a service',
  data_exported: 'Exported workspace data',
  account_deleted: 'Deleted the account',
  workspace_closed: 'Closed a workspace',
};
