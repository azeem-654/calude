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

/** 'free': OpenStreetMap's data through Geoapify (or Overpass when it cannot); 'auto' asks for that first. */
export type ProspectSource = 'free' | 'google' | 'osm';

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
  /** Named people Hunter saw published on the web for this site's domain (`findPeople`). */
  people?: FoundPerson[];
}

/** One address Hunter found published on a page — never one it inferred. */
export interface FoundPerson {
  email: string;
  name: string;
  position: string;
  type: 'personal' | 'generic';
  sources: number;
  confidence: number;
}

/**
 * How far an address was checked, and what that found.
 *
 * `domain_ok` is the free checks' best answer — the domain takes mail; the
 * mailbox itself was not asked. Only a connected verifier says `valid`.
 */
export type CheckStatus = 'valid' | 'domain_ok' | 'risky' | 'invalid' | 'unknown';
export interface Verdict {
  email: string;
  status: CheckStatus;
  reason: string;
  level: 'basic' | 'mailbox';
  provider: string;
  role: boolean;
  free: boolean;
  disposable: boolean;
  checkedAt: string;
}

export interface VerifierAvailability {
  available: boolean;
  provider: string;
  providerName?: string;
  /** Hunter can also search the web for published addresses. */
  finds: boolean;
  /** `no_verifier` or `trial_ended` when not available. */
  code: string;
  left?: { verify: number; find: number };
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
  /** Whether the owner has set the Geoapify key the free directory reads first. */
  geoapify: boolean;
  /** `no_key` (the owner has not set one) or `trial_ended`; empty when available or unknown. */
  code: string;
  error: string;
  verifier: VerifierAvailability;
}

/** Can this workspace search Google Maps right now? Spends nothing. */
export async function googleAvailability(): Promise<GoogleAvailability | null> {
  const d = await call('status', {});
  if (d.success !== true) return null;
  const g = (d.google ?? {}) as { available?: boolean; code?: string; error?: string };
  const f = (d.free ?? {}) as { geoapify?: boolean };
  const v = (d.verifier ?? {}) as Partial<VerifierAvailability>;
  return {
    available: g.available === true, geoapify: f.geoapify === true, code: String(g.code ?? ''), error: String(g.error ?? ''),
    verifier: { available: v.available === true, provider: String(v.provider ?? ''), providerName: v.providerName, finds: v.finds === true, code: String(v.code ?? ''), left: v.left },
  };
}

export interface SearchResult {
  /** Which map answered — the free directory can answer from OpenStreetMap's own servers. */
  source: ProspectSource | '';
  prospects: Prospect[];
  cached: boolean;
  attribution: string;
  nextPageToken: string;
  error: string;
  /** The server's name for the refusal — `no_key`, `trial_ended`, `places_budget`, … */
  code: string;
}

export async function searchProspects(
  q: { source: ProspectSource | 'auto'; trade?: string; place?: string; query?: string; pageToken?: string },
): Promise<SearchResult> {
  const d = await call('search', q);
  return {
    source: (['free', 'google', 'osm'].includes(String(d.source)) ? d.source : '') as ProspectSource | '',
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

export interface VerifyResult {
  verdicts: Record<string, Verdict>;
  deep: { asked: boolean; ran: number; provider: string; skipped: number; code: string; error: string };
  error: string;
}

/** Twenty at a time; the server caps it too. `deep` asks the owner's verifier as well. */
export async function verifyEmails(emails: string[], deep: boolean): Promise<VerifyResult> {
  const d = await call('verify', { emails: emails.slice(0, 20), deep });
  return {
    verdicts: (d.verdicts as Record<string, Verdict>) ?? {},
    deep: (d.deep as VerifyResult['deep']) ?? { asked: deep, ran: 0, provider: '', skipped: 0, code: '', error: '' },
    error: d.success === true ? '' : String(d.error ?? 'The check failed.'),
  };
}

export interface PeopleResult {
  people: Record<string, FoundPerson[]>;
  searched: number;
  skipped: number;
  code: string;
  error: string;
}

/** Hunter's domain search for up to five sites. Spends the owner's credits, so it is only ever asked for. */
export async function findPeople(websites: string[]): Promise<PeopleResult> {
  const d = await call('people', { websites: websites.slice(0, 5) });
  if (d.success !== true) return { people: {}, searched: 0, skipped: websites.length, code: String(d.code ?? ''), error: String(d.error ?? 'The search failed.') };
  return {
    people: (d.people as Record<string, FoundPerson[]>) ?? {},
    searched: Number(d.searched ?? 0), skipped: Number(d.skipped ?? 0), code: String(d.code ?? ''), error: String(d.error ?? ''),
  };
}
