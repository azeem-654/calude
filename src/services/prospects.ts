/**
 * Finding businesses to approach, from the browser's side.
 *
 * Everything real happens on the Worker: Overpass and most business websites
 * send no CORS headers, so a page cannot read either of them, and one shared
 * cache is what keeps a free service free.
 */
import { API_BASE } from './apiBase';
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';

export interface Prospect {
  ref: string;
  name: string;
  phone: string;
  website: string;
  email: string;
  address: string;
  category: string;
  lat: number;
  lon: number;
}

export interface Contactable {
  emails: string[];
  /** true accepts mail, false does not, null the check did not run. */
  mx: boolean | null;
}

async function call(action: string, extra: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const r = await fetch(`${API_BASE}/api/prospects.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token: sessionToken(), accountId: getActiveAccountId(), ...extra }),
    });
    return await r.json() as Record<string, unknown>;
  } catch {
    return { success: false, error: 'Could not reach the server.' };
  }
}

export async function searchProspects(trade: string, place: string):
Promise<{ prospects: Prospect[]; cached: boolean; attribution: string; error: string }> {
  const d = await call('search', { trade, place });
  return {
    prospects: (d.prospects as Prospect[]) ?? [],
    cached: d.cached === true,
    attribution: String(d.attribution ?? ''),
    error: d.success === true ? '' : String(d.error ?? 'Search failed.'),
  };
}

/** Published contact details for up to eight at a time. The server caps it too. */
export async function lookupContacts(websites: string[]):
Promise<{ contacts: Record<string, Contactable>; error: string }> {
  const d = await call('contacts', { websites });
  return {
    contacts: (d.contacts as Record<string, Contactable>) ?? {},
    error: d.success === true ? '' : String(d.error ?? 'Lookup failed.'),
  };
}
