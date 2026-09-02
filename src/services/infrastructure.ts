/**
 * Domains, DNS and mailboxes — the browser's half.
 *
 * Deliberately thin. Every provider credential lives on the server and every
 * call to a provider is made there, so this file holds no keys and makes no
 * third-party requests; it asks `/api/infra.php` for an outcome and hands back
 * what it said. That is why there is no caching here either — "is SPF live on
 * this domain" is a question about the world, and a stale yes is worse than a
 * slow one.
 */
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';
import { API_BASE } from './apiBase';

export type ProviderKind = 'registrar' | 'dns' | 'mailbox';

export interface ProviderField {
  key: string;
  label: string;
  secret?: boolean;
  hint?: string;
  optional?: boolean;
}

export interface ProviderSpec {
  id: string;
  kind: ProviderKind;
  name: string;
  blurb: string;
  can: string[];
  fields: ProviderField[];
  docs: string;
}

export interface ConnectedProvider {
  kind: ProviderKind;
  provider: string;
  name: string;
  status: 'ok' | 'failed' | 'untested';
  note: string;
  checkedAt: string | null;
  updatedAt: string;
  /** Which credential fields already have a value saved. */
  filled: string[];
}

export interface DnsRecord {
  purpose: 'spf' | 'dkim' | 'dmarc' | 'mx' | 'site';
  type: 'TXT' | 'MX' | 'CNAME';
  name: string;
  value: string;
  priority?: number;
  why: string;
  /** False when the lookup itself could not run — not the same as "missing". */
  checked: boolean;
  why_not_checked: string;
  present: boolean;
  current: string;
  matches: boolean;
}

export interface DomainResult {
  domain: string;
  available: boolean;
  price: number | null;
  note: string;
}

interface Reply { success: boolean; message?: string; error?: string; code?: string; [k: string]: unknown }

async function call<T extends Reply>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const accountId = getActiveAccountId();
  if (!accountId) return { success: false, error: 'No workspace is active yet.' } as T;
  try {
    const r = await fetch(`${API_BASE}/api/infra.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), accountId, action, ...extra }),
    });
    return await r.json() as T;
  } catch (e) {
    return { success: false, error: `Could not reach the server: ${e instanceof Error ? e.message : String(e)}` } as T;
  }
}

/* ── Providers ───────────────────────────────────────────────────────────── */

export async function loadProviders(): Promise<{ providers: ConnectedProvider[]; catalogue: ProviderSpec[]; error?: string }> {
  const r = await call<Reply & { providers?: ConnectedProvider[]; catalogue?: ProviderSpec[] }>('providers');
  return { providers: r.providers ?? [], catalogue: r.catalogue ?? [], error: r.success ? undefined : (r.error ?? 'Could not load your providers.') };
}

/**
 * Save credentials and test them in the same round trip.
 *
 * One action rather than two because a saved-but-untested credential is a state
 * nobody wants: the screen would show a provider as connected while the first
 * real use of it fails. Leave a secret field blank to keep the stored one.
 *
 * `success` is what the provider said, not whether the row was written — the
 * credentials are kept either way so a single wrong character can be corrected
 * rather than retyped.
 */
export function connectProvider(kind: ProviderKind, provider: string, credentials: Record<string, string>) {
  return call('connect', { kind, provider, credentials });
}

export function disconnectProvider(kind: ProviderKind) {
  return call('disconnect', { kind });
}

export function testProvider(kind: ProviderKind) {
  return call('test', { kind });
}

/* ── DNS ─────────────────────────────────────────────────────────────────── */

export interface DnsPlanInput {
  domain: string;
  selector?: string;
  spfInclude?: string;
  dmarcMailto?: string;
  dkimValue?: string;
  mx?: { host: string; priority: number }[];
  siteTarget?: string;
}

export async function dnsRecords(input: DnsPlanInput): Promise<{
  records: DnsRecord[]; canApply: boolean; provider: string | null; error?: string;
}> {
  const r = await call<Reply & { records?: DnsRecord[]; canApply?: boolean; provider?: string | null }>('dns_records', { ...input });
  return {
    records: r.records ?? [],
    canApply: !!r.canApply,
    provider: r.provider ?? null,
    error: r.success ? undefined : (r.error ?? 'The records could not be checked.'),
  };
}

/** Write the chosen records. Omit `purposes` to apply the whole plan. */
export function dnsApply(input: DnsPlanInput & { purposes?: string[] }) {
  return call<Reply & { applied?: { name: string; type: string; ok: boolean; note: string }[] }>('dns_apply', { ...input });
}

/* ── Domains ─────────────────────────────────────────────────────────────── */

export async function searchDomains(query: string): Promise<{
  results: DomainResult[]; owned: { domain: string; expiresAt: string | null }[];
  provider: string | null; message: string; error?: string; notConnected: boolean;
}> {
  const r = await call<Reply & {
    results?: DomainResult[]; owned?: { domain: string; expiresAt: string | null }[]; provider?: string;
  }>('domain_search', { query });
  return {
    results: r.results ?? [],
    owned: r.owned ?? [],
    provider: r.provider ?? null,
    message: r.message ?? '',
    error: r.success ? undefined : (r.error ?? 'The search failed.'),
    notConnected: r.code === 'not_connected',
  };
}

/** Spends money. `confirm` is the second ask, and the server refuses without it. */
export function registerDomain(domain: string, years = 1, confirm = false) {
  return call('domain_register', { domain, years, confirm });
}

/* ── Mailboxes ───────────────────────────────────────────────────────────── */

export interface CreatedMailbox extends Reply {
  address?: string;
  password?: string;
  smtp?: { host: string; port: number; encryption: string; username: string };
  imap?: { host: string; port: number; encryption: string; username: string; folder: string };
}

/**
 * Create a mailbox on the connected mail provider.
 *
 * `code: 'manual'` on the reply is not an error — it is the answer for Google
 * Workspace, Microsoft 365 and anything else without an API this app can drive.
 * The address it wants is returned so the screen can show what to go and make.
 */
export function createMailbox(domain: string, localPart: string, displayName?: string) {
  return call<CreatedMailbox>('mailbox_create', { domain, localPart, displayName });
}

export async function provisionHistory(): Promise<{
  kind: string; subject: string; provider: string; outcome: string; detail: string; created_at: string;
}[]> {
  const r = await call<Reply & { history?: { kind: string; subject: string; provider: string; outcome: string; detail: string; created_at: string }[] }>('history');
  return r.history ?? [];
}
