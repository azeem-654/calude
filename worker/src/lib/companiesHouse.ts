/**
 * "Verified business directories" — the official company register, searched
 * by trade and town. Today that is the UK's Companies House.
 *
 * ── Why a register, and what "verified" means here ──
 *
 * A map listing is somebody's say-so: a business that closed in spring is
 * still on it in autumn. A company on the register filed its own details with
 * the state, under a legal duty to keep them current, and the search here asks
 * for `active` companies only. So "verified" means exactly that — registered,
 * active, and with the directors it declared — and nothing more. It does not
 * mean the company has a website or an email address; the register holds
 * neither, and the screen says so rather than leaving the column blank.
 *
 * ── Why this source and not another ──
 *
 * It is free (a key from the government, no card), its data is published
 * under the Open Government Licence — it may be kept and used commercially —
 * and its directors' names are public by law. Foursquare, TomTom and HERE have
 * free tiers whose terms restrict keeping what they return; Yelp's is no longer
 * free; OpenCorporates is free only for open-data projects. A source whose
 * terms forbid "Add to Contacts" would make that button a breach.
 *
 * ── How a trade becomes a search ──
 *
 * The register classifies companies by SIC code, not by words, so a trade is
 * mapped to codes (`sicFor`). A trade with no mapping is refused by name, on
 * the trade box — the register cannot search for words, and a guess at a code
 * would return a confident list of the wrong businesses.
 *
 * The key is the install owner's (Settings → Platform services); the API is
 * 600 requests per five minutes per key, so each workspace has an hourly and
 * daily allowance, and searches and officer lists are cached a fortnight.
 */
import { decryptSecret, encryptSecret } from './crypto';
import { installSecret, nowIso, type Env } from './db';
import type { Prospect } from './prospects';

const KIND = 'companies_house';
const SECRET_KEY = 'mailbox_key';
const BASE = 'https://api.company-information.service.gov.uk';
const base = (env: Env) => ((env.COMPANIES_HOUSE_BASE ?? '').trim() || BASE).replace(/\/+$/, '');
const CACHE_SECONDS = 14 * 24 * 3600;
export const PAGE = 40;
/** Directors are looked up for this many of each page — one request each. */
export const OFFICERS_FOR = 20;
export const REGISTER_ATTRIBUTION = 'Companies House — contains public sector information licensed under the Open Government Licence v3.0';

/* ── Trades → SIC 2007 codes ── */

const SIC: [RegExp, string[]][] = [
  [/dentist|dental|orthodont/, ['86230']],
  [/doctor|gp\b|medical practice|clinic/, ['86210', '86220']],
  [/physio|chiropract|osteopath|therap/, ['86900']],
  [/\bvets?\b|veterinar/, ['75000']],
  [/optician|optometr/, ['47782']],
  [/pharmac|chemist/, ['47730']],
  [/care home|nursing home/, ['87100', '87300']],
  [/nurser(y|ies)|childcare|child care|creche/, ['88910']],
  [/accountan|bookkeep|tax advis/, ['69201', '69202', '69203']],
  [/solicitor|lawyer|law firm|legal/, ['69101', '69102', '69109']],
  [/estate agent|letting|property manag/, ['68310', '68320']],
  [/architect/, ['71111']],
  [/engineer/, ['71121', '71122', '71129']],
  [/plumb|heating engineer|gas engineer/, ['43220']],
  [/electrician|electrical contract/, ['43210']],
  [/builder|construction|building contract/, ['41201', '41202', '43999']],
  [/roof/, ['43910']],
  [/painter|decorat/, ['43341']],
  [/joiner|carpent/, ['43320']],
  [/plaster/, ['43310']],
  [/landscap|gardener|garden maint|tree surgeon/, ['81300']],
  [/clean/, ['81210', '81222', '81299']],
  [/restaurant/, ['56101']],
  [/caf[eé]|coffee/, ['56102']],
  [/takeaway|take-away|fast food/, ['56103']],
  [/\bpubs?\b|\bbars?\b/, ['56302']],
  [/hotel/, ['55100']],
  [/hair|barber|salon|beaut|nail/, ['96020']],
  [/gym|fitness|personal train|yoga|pilates/, ['93130', '93199']],
  [/florist/, ['47760']],
  [/baker/, ['10710', '47240']],
  [/butcher/, ['47220']],
  [/garage|mechanic|car repair|mot\b/, ['45200']],
  [/car deal|used car/, ['45111', '45112']],
  [/taxi|minicab/, ['49320']],
  [/removal/, ['49420']],
  [/marketing|advertising|digital agenc/, ['73110', '73120']],
  [/web design|software|app develop/, ['62012']],
  [/\bit\b|it support|managed service|computer/, ['62020', '62090']],
  [/photograph/, ['74201', '74202', '74209']],
  [/print/, ['18129']],
  [/recruit|staffing/, ['78109', '78200']],
  [/insurance/, ['66220']],
  [/financial advis|mortgage|wealth manag/, ['66190']],
  [/consultan/, ['70229']],
  [/tutor|training provider/, ['85590']],
  [/driving school|driving instruct/, ['85530']],
  [/wedding|event plan/, ['96090', '82302']],
  [/travel agen/, ['79110']],
];

export function sicFor(trade: string): string[] | null {
  const t = trade.toLowerCase();
  for (const [re, codes] of SIC) if (re.test(t)) return codes;
  return null;
}

/* ── The owner's key ── */

export interface RegisterKey { key: string; status: string; lastError: string; updatedAt: string }

export async function installRegisterKey(env: Env): Promise<RegisterKey | null> {
  const row = await env.DB.prepare('SELECT credentials, status, last_error AS lastError, updated_at AS updatedAt FROM crm_install_providers WHERE kind = ?')
    .bind(KIND).first<{ credentials: string; status: string; lastError: string; updatedAt: string }>().catch(() => null);
  if (!row?.credentials) return null;
  try {
    const c = JSON.parse(await decryptSecret(await installSecret(env.DB, SECRET_KEY), row.credentials)) as { apiKey?: string };
    return c.apiKey ? { key: c.apiKey, status: row.status, lastError: row.lastError, updatedAt: row.updatedAt } : null;
  } catch { return null; }
}

export async function saveRegisterKey(env: Env, apiKey: string): Promise<void> {
  const blob = await encryptSecret(await installSecret(env.DB, SECRET_KEY), JSON.stringify({ apiKey }));
  await env.DB.prepare(
    `INSERT INTO crm_install_providers (kind, provider, credentials, status, last_error, updated_at)
     VALUES (?, 'companies_house', ?, 'unknown', '', ?)
     ON CONFLICT(kind) DO UPDATE SET credentials = excluded.credentials, status = 'unknown', last_error = '', updated_at = excluded.updated_at`,
  ).bind(KIND, blob, nowIso()).run();
}

export async function markRegisterKey(env: Env, ok: boolean, error = ''): Promise<void> {
  await env.DB.prepare('UPDATE crm_install_providers SET status = ?, last_error = ?, updated_at = ? WHERE kind = ?')
    .bind(ok ? 'ok' : 'error', error.slice(0, 300), nowIso(), KIND).run().catch(() => undefined);
}

/** The key is the username of HTTP Basic auth, with no password. */
const auth = (key: string) => ({ Authorization: `Basic ${btoa(`${key}:`)}`, accept: 'application/json' });

async function get<T>(env: Env, key: string, path: string): Promise<{ status: number; body: T | null }> {
  try {
    const r = await fetch(`${base(env)}${path}`, { headers: auth(key) });
    let body: T | null = null;
    try { body = await r.json<T>(); } catch { body = null; }
    return { status: r.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

export async function testRegisterKey(env: Env, key: string): Promise<{ ok: boolean; error: string }> {
  const r = await get(env, key, '/search/companies?q=bakery&items_per_page=1');
  if (r.status === 200) return { ok: true, error: '' };
  if (r.status === 0) return { ok: false, error: 'Companies House could not be reached.' };
  if (r.status === 401) return { ok: false, error: 'Companies House refused the key (401). Copy the REST API key from developer.company-information.service.gov.uk → your application.' };
  return { ok: false, error: `Companies House answered ${r.status}.` };
}

/* ── Mapping ── */

interface ChAddress { address_line_1?: string; address_line_2?: string; locality?: string; region?: string; postal_code?: string; country?: string }
export interface ChCompany {
  company_name?: string; company_number?: string; company_status?: string; date_of_creation?: string;
  registered_office_address?: ChAddress; sic_codes?: string[];
}
interface ChOfficer { name?: string; officer_role?: string; resigned_on?: string }

const title = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase()).replace(/\b(Ltd|Llp|Plc)\b/g, w => w.toUpperCase());

/** "SMITH, John Andrew" → "John Andrew Smith". */
export function officerName(raw: string): string {
  const [last, first] = raw.split(',').map(x => x.trim());
  return title(first ? `${first} ${last}` : last ?? '').replace(/\s+/g, ' ').trim();
}

export function toRegisterProspect(c: ChCompany, trade: string): Prospect | null {
  if (!c.company_name || !c.company_number) return null;
  const a = c.registered_office_address ?? {};
  return {
    ref: `ch:${c.company_number}`,
    source: 'register',
    name: title(c.company_name),
    phone: '',
    website: '',
    email: '',
    address: [a.address_line_1, a.address_line_2, a.locality, a.postal_code].filter(Boolean).join(', '),
    category: trade,
    lat: 0,
    lon: 0,
    companyNumber: c.company_number,
    registerUrl: `https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(c.company_number)}`,
    incorporated: c.date_of_creation ?? '',
  };
}

/** Serving directors only — a resigned one is not somebody to write to. */
export function activeOfficers(items: ChOfficer[] | undefined): { name: string; role: string }[] {
  return (items ?? [])
    .filter(o => o.name && !o.resigned_on && /director|member|partner|secretary/i.test(o.officer_role ?? ''))
    .sort((a, b) => Number(/director/i.test(b.officer_role ?? '')) - Number(/director/i.test(a.officer_role ?? '')))
    .slice(0, 4)
    .map(o => ({ name: officerName(o.name!), role: title((o.officer_role ?? '').replace(/-/g, ' ')) }));
}

/* ── Searching ── */

export interface RegisterSearch { ok: boolean; prospects: Prospect[]; next: string; cached: boolean; error: string; code: string }

async function cachedJson<T>(env: Env, key: string): Promise<T | null> {
  const now = Math.floor(Date.now() / 1000);
  const hit = await env.DB.prepare('SELECT payload FROM crm_prospect_cache WHERE q = ? AND expires_at > ?').bind(key, now).first<{ payload: string }>().catch(() => null);
  if (!hit) return null;
  try { return JSON.parse(hit.payload) as T; } catch { return null; }
}
async function keep(env: Env, key: string, value: unknown): Promise<void> {
  await env.DB.prepare('INSERT OR REPLACE INTO crm_prospect_cache (q, payload, expires_at, created_at) VALUES (?,?,?,?)')
    .bind(key, JSON.stringify(value), Math.floor(Date.now() / 1000) + CACHE_SECONDS, nowIso()).run().catch(() => undefined);
}

export async function searchRegister(env: Env, key: string, trade: string, place: string, pageToken = '', fresh = false): Promise<RegisterSearch> {
  const codes = sicFor(trade);
  if (!codes) {
    return { ok: false, prospects: [], next: '', cached: false, code: 'no_category',
      error: `The company register files businesses by type, and it has no type for "${trade}". Try a broader word — "accountants", "builders", "dentists", "cafés" — or search business directories instead.` };
  }
  const start = Math.max(0, Number(pageToken) || 0);
  const ck = `ch|${codes.join(',')}|${place.toLowerCase()}|${start}`;
  const hit = fresh ? null : await cachedJson<{ prospects: Prospect[]; next: string }>(env, ck);
  if (hit) return { ok: true, prospects: hit.prospects, next: hit.next, cached: true, error: '', code: '' };

  const q = new URLSearchParams({ company_status: 'active', location: place, size: String(PAGE), start_index: String(start) });
  for (const c of codes) q.append('sic_codes', c);
  const r = await get<{ items?: ChCompany[]; hits?: number }>(env, key, `/advanced-search/companies?${q}`);
  if (r.status === 401) return { ok: false, prospects: [], next: '', cached: false, code: 'bad_key', error: 'Companies House refused the owner\'s key.' };
  if (r.status === 404) return { ok: true, prospects: [], next: '', cached: false, error: '', code: '' };
  if (r.status === 429) return { ok: false, prospects: [], next: '', cached: false, code: 'busy', error: 'The company register is busy right now — try again in a few minutes.' };
  if (r.status !== 200 || !r.body) return { ok: false, prospects: [], next: '', cached: false, code: 'unreachable', error: `The company register could not be searched just now (${r.status || 'no answer'}).` };

  const prospects = (r.body.items ?? []).map(c => toRegisterProspect(c, trade)).filter((p): p is Prospect => !!p);
  /* Directors for the first of the page, in parallel; each list is cached. */
  await Promise.all(prospects.slice(0, OFFICERS_FOR).map(async p => {
    p.officers = await officersOf(env, key, p.companyNumber!, fresh);
  }));
  const total = Number(r.body.hits ?? 0);
  const next = start + PAGE < total && prospects.length === PAGE ? String(start + PAGE) : '';
  await keep(env, ck, { prospects, next });
  return { ok: true, prospects, next, cached: false, error: '', code: '' };
}

export async function officersOf(env: Env, key: string, number: string, fresh = false): Promise<{ name: string; role: string }[]> {
  const ck = `ch-officers|${number}`;
  const hit = fresh ? null : await cachedJson<{ name: string; role: string }[]>(env, ck);
  if (hit) return hit;
  const r = await get<{ items?: ChOfficer[] }>(env, key, `/company/${encodeURIComponent(number)}/officers?items_per_page=20`);
  if (r.status !== 200) return [];
  const list = activeOfficers(r.body?.items);
  await keep(env, ck, list);
  return list;
}
