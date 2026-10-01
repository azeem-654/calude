/**
 * Finding businesses to approach, from the browser's side.
 *
 * Everything real happens on the Worker (/api/prospects.php): the Google Maps
 * key is the install owner's and never comes near a page, and Overpass and
 * most business websites send no CORS headers anyway.
 */
import { API_BASE } from './apiBase';
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';

export type ProspectSource = 'google' | 'osm';

export interface Prospect {
  ref: string;
  source?: ProspectSource;
  /** Google's place id — the one part of a Google answer that may be kept. */
  placeId?: string;
  name: string;
  phone: string;
  website: string;
  email: string;
  address: string;
  category: string;
  lat: number;
  lon: number;
  rating?: number | null;
  ratingCount?: number | null;
  mapsUrl?: string;
  temporarilyClosed?: boolean;
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

export interface GoogleAvailability {
  available: boolean;
  /** `no_key` (the owner has not set one) or `trial_ended`; empty when available or unknown. */
  code: string;
  error: string;
}

/** Can this workspace search Google Maps right now? Spends nothing. */
export async function googleAvailability(): Promise<GoogleAvailability | null> {
  const d = await call('status', {});
  if (d.success !== true) return null;
  const g = (d.google ?? {}) as { available?: boolean; code?: string; error?: string };
  return { available: g.available === true, code: String(g.code ?? ''), error: String(g.error ?? '') };
}

export interface SearchResult {
  prospects: Prospect[];
  cached: boolean;
  attribution: string;
  nextPageToken: string;
  error: string;
  /** The server's name for the refusal — `no_key`, `trial_ended`, `places_budget`, … */
  code: string;
}

export async function searchProspects(
  q: { source: ProspectSource; trade?: string; place?: string; query?: string; pageToken?: string },
): Promise<SearchResult> {
  const d = await call('search', q);
  return {
    prospects: (d.prospects as Prospect[]) ?? [],
    cached: d.cached === true,
    attribution: String(d.attribution ?? ''),
    nextPageToken: String(d.nextPageToken ?? ''),
    error: d.success === true ? '' : String(d.error ?? 'Search failed.'),
    code: String(d.code ?? ''),
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
