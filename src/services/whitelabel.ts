/**
 * White label: a reseller's own address, and what it paints.
 *
 * ── The resolved host is cached, and why that is safe ──
 *
 * Resolving a hostname is a network round trip, and it has to finish before the
 * login screen can paint the right logo. Waiting for it on every load would put
 * a blank screen in front of every visitor for as long as the request takes.
 *
 * So the answer is remembered in sessionStorage, keyed by hostname. Session
 * rather than local: a reseller who changes their logo should see it on the next
 * visit, not whenever a browser decides to forget. And keyed by hostname because
 * one browser can legitimately visit two resellers' addresses.
 *
 * Nothing security-relevant rests on it. The resolved value decides which logo
 * and which workspace id the login form suggests; the server decides everything
 * that matters after that, and it does not ask this file.
 */
import { API_BASE } from './apiBase';
import { sessionToken } from './auth';
import { RESOLVED_HOST_KEY, activeAccount, getActiveAccountId, updateSubAccount, type Branding } from './tenancy';

export interface ResolvedHost {
  accountId: string;
  kind: string;
  status: string;
  appName: string;
  logoUrl: string;
  accent: string;
  loginHeadline: string;
}

export interface CustomDomain {
  hostname: string;
  kind: 'subdomain' | 'custom';
  status: 'pending' | 'verifying' | 'active' | 'failed';
  dnsTarget: string;
  dnsTxtName: string;
  dnsTxtValue: string;
  lastError: string;
  checkedAt: string | null;
  createdAt: string;
}

export interface DomainList {
  domains: CustomDomain[];
  customAvailable: boolean;
  cnameTarget: string;
  subdomainSuffix: string;
}

export interface SaasState {
  connected: boolean;
  zoneId: string;
  cnameTarget: string;
  hasToken: boolean;
  subdomainSuffix: string;
  /** Cloudflare answered yes to the stored credentials; only then are resellers offered their own domain. */
  verified: boolean;
  /** Cloudflare's own words when it said no. */
  lastError: string;
  checkedAt: string;
}

/** Suffixes under which the registrable name has three labels (example.co.uk). */
const TWO_PART = /\.(co|com|org|net|gov|ac|edu|ltd|plc|me)\.[a-z]{2}$/;

/**
 * Whether a hostname is the bare root of a domain (abccompany.com), not a
 * name under it (sales.abccompany.com).
 *
 * It matters because a root cannot hold a CNAME at most DNS hosts — GoDaddy
 * and Namecheap among them — so the one record we tell everybody else to add
 * is one these customers cannot add. A heuristic, not the public-suffix list:
 * a wrong guess only changes which advice is shown, never what is served.
 */
export function isRootDomain(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, '');
  const labels = h.split('.').filter(Boolean);
  if (labels.length < 2) return false;
  return labels.length === (TWO_PART.test(h) ? 3 : 2);
}

/** The registrable domain a hostname sits under — where its DNS is managed. */
export function domainOf(host: string): string {
  const labels = host.toLowerCase().split('.').filter(Boolean);
  return labels.slice(TWO_PART.test(host.toLowerCase()) ? -3 : -2).join('.');
}

interface Reply { success: boolean; error?: string; code?: string; [k: string]: unknown }

async function call(action: string, extra: Record<string, unknown> = {}): Promise<Reply> {
  try {
    const r = await fetch(`${API_BASE}/api/whitelabel.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), accountId: getActiveAccountId(), action, ...extra }),
    });
    return await r.json() as Reply;
  } catch (e) {
    return { success: false, error: `Could not reach the server: ${e instanceof Error ? e.message : String(e)}` };
  }
}

const CACHE_KEY = RESOLVED_HOST_KEY;

/** What was resolved for this hostname, if anything, without asking again. */
export function cachedHost(): ResolvedHost | null {
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as { hostname: string; match: ResolvedHost | null };
    return c.hostname === window.location.hostname.toLowerCase() ? c.match : null;
  } catch { return null; }
}

/**
 * Ask whose address this is.
 *
 * Deliberately not authenticated — it runs before anybody has signed in. A
 * hostname nobody has claimed resolves to null, which is the ordinary answer on
 * the app's own address and is not an error.
 */
export async function resolveHost(): Promise<ResolvedHost | null> {
  const hostname = window.location.hostname.toLowerCase();
  const cached = cachedHost();
  if (cached) return cached;

  let match: ResolvedHost | null = null;
  try {
    const r = await fetch(`${API_BASE}/api/whitelabel.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resolve', hostname }),
    });
    const data = await r.json() as { match?: ResolvedHost | null };
    match = data.match ?? null;
  } catch {
    /* Unreachable is not "unbranded" — but there is nothing else to show, and
       the default branding is the honest fallback rather than a blank page. */
    return null;
  }

  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ hostname, match }));
  } catch { /* a private window simply asks again */ }
  return match;
}

/** The fields a login screen paints. Pass the workspace's own branding, not
 *  activeBranding(): that falls back to our name, and on a reseller's address
 *  it is the address's copy, which is what is being updated. */
export function brandingPayload(b: Branding = activeAccount()?.branding ?? {}) {
  return {
    appName: b.appName ?? '',
    logoUrl: b.logoUrl ?? '',
    loginHeadline: b.loginHeadline ?? '',
  };
}

/**
 * Save the active workspace's branding on the server, which re-copies it to
 * every address the workspace owns. Settings → Branding calls this; until
 * 2026-11-18 the name and logo stayed in the one browser that set them.
 */
export async function saveBranding(b: Branding): Promise<{ error: string; field: string; addresses: number }> {
  const r = await call('save_branding', { branding: brandingPayload(b) });
  return { error: r.success ? '' : (r.error ?? 'Could not save the branding.'), field: String(r.field ?? ''), addresses: Number(r.addresses ?? 0) };
}

/** Bring the server's branding into this browser's copy of the workspace, so
 *  a second device shows the same name and logo. Quiet on any failure: the
 *  local copy (or our default) is still a correct thing to paint. */
export async function pullBranding(): Promise<void> {
  const id = getActiveAccountId();
  if (!id || !sessionToken()) return;
  const r = await call('get_branding');
  const b = r.success ? r.branding as Branding | null : null;
  if (!b) return;
  const cur = activeAccount()?.branding ?? {};
  if (cur.appName === b.appName && cur.logoUrl === b.logoUrl && cur.loginHeadline === b.loginHeadline) return;
  updateSubAccount(id, { branding: { appName: b.appName ?? '', logoUrl: b.logoUrl ?? '', loginHeadline: b.loginHeadline ?? '' } });
}

export async function listDomains(): Promise<DomainList> {
  const r = await call('list');
  return {
    domains: (r.domains as CustomDomain[]) ?? [],
    customAvailable: !!r.customAvailable,
    cnameTarget: String(r.cnameTarget ?? ''),
    subdomainSuffix: String(r.subdomainSuffix ?? ''),
  };
}

export async function addDomain(input: {
  kind: 'subdomain' | 'custom'; slug?: string; hostname?: string;
  branding: ReturnType<typeof brandingPayload>;
}): Promise<{ domains: CustomDomain[]; error: string; code: string }> {
  const r = await call('add', input);
  return {
    domains: (r.domains as CustomDomain[]) ?? [],
    error: r.success ? '' : (r.error ?? 'Could not add that address.'),
    code: String(r.code ?? ''),
  };
}

export async function checkDomain(hostname: string, branding: ReturnType<typeof brandingPayload>): Promise<{ domains: CustomDomain[]; error: string }> {
  const r = await call('check', { hostname, branding });
  return { domains: (r.domains as CustomDomain[]) ?? [], error: r.success ? '' : (r.error ?? 'Could not check that address.') };
}

export async function removeDomain(hostname: string): Promise<{ domains: CustomDomain[]; error: string }> {
  const r = await call('remove', { hostname });
  return { domains: (r.domains as CustomDomain[]) ?? [], error: r.success ? '' : (r.error ?? 'Could not remove that address.') };
}


/* ── Owner only ── */

export async function saasState(recheck = false): Promise<SaasState | null> {
  const r = await call('provider_get', recheck ? { recheck: true } : {});
  return r.success ? (r.saas as SaasState) : null;
}

export async function saveSaas(input: { zoneId: string; apiToken: string; cnameTarget: string }): Promise<{ state: SaasState | null; error: string }> {
  const r = await call('provider_save', input);
  return { state: r.success ? (r.saas as SaasState) : null, error: r.success ? '' : (r.error ?? 'Could not save that.') };
}
