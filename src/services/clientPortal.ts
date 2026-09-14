/**
 * Report links a reseller hands to their own clients.
 *
 * The token in these types is the *whole credential* for a read-only report.
 * It is safe for the reseller's own screen to hold — they are the one giving it
 * out — and it is never sent anywhere else by this file.
 */
import { API_BASE } from './apiBase';
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';

export interface Portal {
  token: string;
  portfolioId: string;
  label: string;
  enabled: number;
  expiresAt: string | null;
  views: number;
  lastViewedAt: string | null;
  createdAt: string;
  clientName: string;
}

interface Reply { success: boolean; error?: string; [k: string]: unknown }

async function call(action: string, extra: Record<string, unknown> = {}): Promise<Reply> {
  try {
    const r = await fetch(`${API_BASE}/api/portal.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), accountId: getActiveAccountId(), action, ...extra }),
    });
    return await r.json() as Reply;
  } catch (e) {
    return { success: false, error: `Could not reach the server: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function listPortals(): Promise<Portal[]> {
  const r = await call('list');
  return (r.portals as Portal[]) ?? [];
}

export async function createPortal(portfolioId: string): Promise<{ token: string; portals: Portal[]; error: string }> {
  const r = await call('create', { portfolioId });
  return {
    token: String(r.token ?? ''),
    portals: (r.portals as Portal[]) ?? [],
    error: r.success ? '' : (r.error ?? 'Could not create that link.'),
  };
}

export async function setPortalEnabled(portalToken: string, on: boolean): Promise<{ portals: Portal[]; error: string }> {
  const r = await call(on ? 'enable' : 'revoke', { portalToken });
  return { portals: (r.portals as Portal[]) ?? [], error: r.success ? '' : (r.error ?? 'Could not change that link.') };
}

/** The address to hand over. Built here so no screen has to know the shape. */
export function portalUrl(token: string): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${window.location.origin}${base}/p/${token}`;
}
