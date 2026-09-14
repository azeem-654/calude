/**
 * The registry, and the one place credentials are read.
 *
 * Adding a provider is a file beside this one and a line in `PROVIDERS`. No
 * call site anywhere else in the app names a provider, which is the property
 * that makes swapping one a day's work instead of a rewrite.
 */
import { decryptSecret, encryptSecret } from '../crypto';
import { installSecret, nowIso, type Env } from '../db';
import { openprovider } from './openprovider';
import type { Provider, ProviderCreds } from './types';

export * from './types';
export { splitDomain } from './openprovider';

const PROVIDERS: Record<string, Provider> = {
  [openprovider.id]: openprovider,
};

/** The kind used in crm_install_providers. One per install, owner-only. */
export const SETUP_KIND = 'digital_setup';
const SECRET_KEY = 'mailbox_key';

export function providerById(id: string): Provider | null {
  return PROVIDERS[id] ?? null;
}

/** For the owner's settings screen: what may be connected. */
export function providerChoices(): Array<{ id: string; label: string }> {
  return Object.values(PROVIDERS).map(p => ({ id: p.id, label: p.label }));
}

export interface Connected {
  provider: Provider;
  creds: ProviderCreds;
}

/**
 * The install's own provider account, decrypted.
 *
 * Install-level rather than per-workspace on purpose: this is the operator's
 * reseller agreement, and the whole point of the feature is that a customer
 * never has one. Null when nothing is connected, so every caller has to decide
 * what to say rather than discovering it at the moment of a purchase.
 */
export async function connectedProvider(env: Env): Promise<Connected | null> {
  const row = await env.DB.prepare(
    'SELECT provider, credentials FROM crm_install_providers WHERE kind = ?',
  ).bind(SETUP_KIND).first<{ provider: string; credentials: string }>();
  if (!row?.credentials) return null;

  const provider = providerById(row.provider);
  if (!provider) return null;

  try {
    const key = await installSecret(env.DB, SECRET_KEY);
    const creds = JSON.parse(await decryptSecret(key, row.credentials)) as ProviderCreds;
    if (!creds.username || !creds.password) return null;
    return { provider, creds };
  } catch {
    return null;
  }
}

/**
 * Store them, encrypted.
 *
 * A blank password means "keep the stored one", as everywhere else in this app
 * — the form shows dots and cannot send back what it was never given.
 */
export async function saveProviderCreds(
  env: Env, providerId: string, patch: Partial<ProviderCreds>,
): Promise<{ ok: boolean; error: string }> {
  if (!providerById(providerId)) return { ok: false, error: `"${providerId}" is not a provider this app supports.` };

  const existing = await connectedProvider(env);
  const merged: ProviderCreds = {
    username: (patch.username ?? '').trim() || existing?.creds.username || '',
    password: (patch.password ?? '').trim() || existing?.creds.password || '',
    resellerId: (patch.resellerId ?? '').trim() || existing?.creds.resellerId || '',
    sandbox: patch.sandbox ?? existing?.creds.sandbox ?? false,
    mailHost: (patch.mailHost ?? '').trim() || existing?.creds.mailHost || '',
  };
  if (!merged.username || !merged.password) {
    return { ok: false, error: 'Both the username and the password are needed.' };
  }

  const key = await installSecret(env.DB, SECRET_KEY);
  const blob = await encryptSecret(key, JSON.stringify(merged));
  await env.DB.prepare(
    `INSERT INTO crm_install_providers (kind, provider, credentials, status, last_error, updated_at)
     VALUES (?,?,?, 'unknown', '', ?)
     ON CONFLICT(kind) DO UPDATE SET
       provider = excluded.provider, credentials = excluded.credentials,
       /* Changing a credential clears its verified stamp. Carrying a green tick
          across an edit shows a state somebody would trust and only discover
          was wrong at the moment it mattered. */
       status = 'unknown', last_error = '', updated_at = excluded.updated_at`,
  ).bind(SETUP_KIND, providerId, blob, nowIso()).run();
  return { ok: true, error: '' };
}

/** Record what a connection test said, so a screen need not re-test to render. */
export async function recordProviderStatus(env: Env, ok: boolean, error: string): Promise<void> {
  await env.DB.prepare(
    'UPDATE crm_install_providers SET status = ?, last_error = ?, updated_at = ? WHERE kind = ?',
  ).bind(ok ? 'ok' : 'failed', error.slice(0, 500), nowIso(), SETUP_KIND).run();
}
