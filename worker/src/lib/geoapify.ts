/**
 * Prospect search on Geoapify — OpenStreetMap's businesses, served by a
 * company that answers fast and lets the results be kept.
 *
 * ── Why this exists ──
 *
 * The owner asked for prospect search that costs them nothing. Google Places
 * bills the search this screen makes (phone and website are its Enterprise
 * fields: 1,000 free a month for the whole install, then $35 per 1,000), and
 * its terms forbid saving business names and addresses — which is what
 * "Add to Contacts" does. The public Overpass servers are free and keepable,
 * but their policy asks commercial apps not to lean on them. Geoapify's free
 * plan is 3,000 credits a day (one credit per 20 places), allows commercial
 * use, and its terms allow storing what it returns, so results may be cached
 * and imported. Attribution — "Powered by Geoapify" and "© OpenStreetMap
 * contributors" — is returned with every answer for the screen to show.
 *
 * ── What it cannot find ──
 *
 * Geoapify searches by category, and its categories stop short of most
 * trades: there is service.electrician but no plumber, roofer, builder or
 * painter. A trade with no category is not forced into one — prospects.ts
 * sends it to Overpass, which matches OSM's own `craft` tags by word. Both
 * are free; the screen calls them one "free directory".
 *
 * ── Never past the free plan ──
 *
 * The install's credits are counted per UTC day (`crm_meta`) and the search
 * stops at DAILY_CREDIT_CAP, short of 3,000, so a busy day ends in the
 * Overpass fallback rather than in Geoapify refusing every search. Each
 * search and each geocoded place is cached for a fortnight, which their
 * terms allow, so a repeated search spends nothing.
 */
import { decryptSecret, encryptSecret } from './crypto';
import { installSecret, metaGet, metaPut, nowIso, type Env } from './db';
import type { Prospect } from './prospects';

const KIND = 'geoapify';
const SECRET_KEY = 'mailbox_key';
const GEO = 'https://api.geoapify.com';
const base = (env: Env) => (env.GEOAPIFY_BASE ?? '').trim() || GEO;
export const DAILY_CREDIT_CAP = 2_800;
const PAGE = 60;
const CACHE_SECONDS = 14 * 24 * 3600;
export const GEOAPIFY_ATTRIBUTION = 'Powered by Geoapify · © OpenStreetMap contributors';

/* ── The owner's key ── */

export interface GeoKey { key: string; status: string; lastError: string; updatedAt: string }

export async function installGeoKey(env: Env): Promise<GeoKey | null> {
  const row = await env.DB.prepare('SELECT credentials, status, last_error AS lastError, updated_at AS updatedAt FROM crm_install_providers WHERE kind = ?')
    .bind(KIND).first<{ credentials: string; status: string; lastError: string; updatedAt: string }>().catch(() => null);
  if (!row?.credentials) return null;
  try {
    const c = JSON.parse(await decryptSecret(await installSecret(env.DB, SECRET_KEY), row.credentials)) as { apiKey?: string };
    return c.apiKey ? { key: c.apiKey, status: row.status, lastError: row.lastError, updatedAt: row.updatedAt } : null;
  } catch { return null; }
}

/** A new key starts unproved — a tick carried across an edit vouches for a key nobody tried. */
export async function saveGeoKey(env: Env, apiKey: string): Promise<void> {
  const blob = await encryptSecret(await installSecret(env.DB, SECRET_KEY), JSON.stringify({ apiKey }));
  await env.DB.prepare(
    `INSERT INTO crm_install_providers (kind, provider, credentials, status, last_error, updated_at)
     VALUES (?, 'geoapify', ?, 'unknown', '', ?)
     ON CONFLICT(kind) DO UPDATE SET credentials = excluded.credentials, status = 'unknown', last_error = '', updated_at = excluded.updated_at`,
  ).bind(KIND, blob, nowIso()).run();
}

export async function markGeoKey(env: Env, ok: boolean, error = ''): Promise<void> {
  await env.DB.prepare('UPDATE crm_install_providers SET status = ?, last_error = ?, updated_at = ? WHERE kind = ?')
    .bind(ok ? 'ok' : 'error', error.slice(0, 300), nowIso(), KIND).run().catch(() => undefined);
}

/* ── Credits, per UTC day ── */

const today = () => new Date().toISOString().slice(0, 10);
export async function creditsToday(env: Env): Promise<number> {
  return Number(await metaGet(env.DB, `geoapify_credits_${today()}`).catch(() => null)) || 0;
}
async function spend(env: Env, n: number): Promise<void> {
  if (n <= 0) return;
  const k = `geoapify_credits_${today()}`;
  /* Read-then-write races under load, by a credit or two; the cap sits 200
     short of the plan's 3,000 for that and for anything else uncounted. */
  await metaPut(env.DB, k, String((Number(await metaGet(env.DB, k).catch(() => null)) || 0) + n)).catch(() => undefined);
}

/* ── From a trade to Geoapify's categories ── */

/*
 * Matched as words at the start of a word, so "dentists" and "dental" both
 * find the dentist entry and "bar" does not match "barber". Only category
 * keys Geoapify publishes (apidocs.geoapify.com/docs/places, checked
 * 2026-10-02) — an unknown key fails the whole request.
 */
const TRADES: [RegExp, string][] = [
  [/\b(dentist|dental|orthodont)/, 'healthcare.dentist'],
  [/\b(doctor|gp\b|clinic|physio|chiropract|osteopath|medical|surgery)/, 'healthcare.clinic_or_praxis'],
  [/\b(pharmac|chemist)/, 'healthcare.pharmacy,commercial.health_and_beauty.pharmacy'],
  [/\bhospital/, 'healthcare.hospital'],
  [/\b(vet\b|vets\b|veterinar)/, 'pet.veterinary'],
  [/\b(pet shop|pet store|pet supplies)/, 'pet.shop,commercial.pet'],
  [/\b(dog groom|pet groom|kennel|cattery|animal boarding)/, 'pet.service,pet.animal_boarding'],
  [/\b(barber|hair)/, 'service.beauty.hairdresser'],
  [/\b(beauty|nail|spa\b|spas\b|massage|tanning|tattoo|aesthetic)/, 'service.beauty'],
  [/\b(cafe|café|coffee)/, 'catering.cafe'],
  [/\b(restaurant|takeaway|take away|pizza|burger|fast food|diner|bistro)/, 'catering.restaurant,catering.fast_food'],
  [/\b(pubs?|bars?)\b/, 'catering.bar,catering.pub'],
  [/\b(hotel|b&b|bed and breakfast|guest ?house|hostel|motel)/, 'accommodation'],
  [/\b(lawyer|solicitor|attorney|legal|law firm)/, 'office.lawyer'],
  [/\bnotar/, 'office.notary'],
  [/\b(accountant|accounting|bookkeep|tax)/, 'office.accountant,office.tax_advisor'],
  [/\b(estate agent|real estate|realtor|realty|letting|propert)/, 'office.estate_agent,service.estate_agent'],
  [/\binsurance/, 'office.insurance'],
  [/\barchitect/, 'office.architect'],
  [/\b(marketing|advertising|creative agency|design agency)/, 'office.advertising_agency'],
  [/\b(it support|it company|software|web design|web developer|tech company)/, 'office.it'],
  [/\bconsult/, 'office.consulting'],
  [/\b(financial advis|mortgage|broker|wealth)/, 'office.financial_advisor,office.financial'],
  [/\b(recruit|employment agency|staffing)/, 'office.employment_agency'],
  [/\bcowork/, 'office.coworking'],
  [/\b(charity|non.?profit)/, 'office.charity,office.non_profit'],
  [/\belectrician/, 'service.electrician'],
  [/\b(carpenter|joiner)/, 'service.carpenter'],
  [/\blocksmith/, 'service.locksmith'],
  [/\b(dry clean|laundr|launderette)/, 'service.cleaning.dry_cleaning,service.cleaning.laundry'],
  [/\bphotograph/, 'service.photographer'],
  [/\b(taxi|cab\b|cabs\b|minicab)/, 'service.taxi'],
  [/\btravel agen/, 'service.travel_agency,office.travel_agent'],
  [/\bfuneral/, 'service.funeral_directors'],
  [/\b(tailor|alteration)/, 'service.tailor'],
  [/\b(car repair|garage|mechanic|auto repair|mot\b|tyre|tire)/, 'service.vehicle.repair'],
  [/\bcar wash/, 'service.vehicle.car_wash'],
  [/\b(car dealer|car sales|used cars)/, 'commercial.vehicle'],
  [/\bbaker/, 'commercial.food_and_drink.bakery'],
  [/\bbutcher/, 'commercial.food_and_drink.butcher'],
  [/\b(florist|flower)/, 'commercial.florist'],
  [/\bjewel/, 'commercial.jewelry'],
  [/\b(clothing|clothes|fashion|boutique)/, 'commercial.clothing'],
  [/\bshoe/, 'commercial.clothing.shoes'],
  [/\bfurniture/, 'commercial.furniture_and_interior'],
  [/\b(hardware|diy|building supplies|builders merchant)/, 'commercial.houseware_and_hardware'],
  [/\b(optician|optometrist|eye test)/, 'commercial.health_and_beauty.optician'],
  [/\b(electronics|phone shop|mobile phone)/, 'commercial.elektronics'],
  [/\b(bike|bicycle|cycle shop)/, 'commercial.outdoor_and_sport.bicycle'],
  [/\bbook ?shop|\bbookstore/, 'commercial.books'],
  [/\b(supermarket|grocer|convenience)/, 'commercial.supermarket,commercial.convenience'],
  [/\b(gym|fitness|personal train)/, 'sport.fitness'],
  [/\b(yoga|pilates|dance studio|martial art|dojo)/, 'sport.dojo,sport.fitness,activity.sport_club'],
  [/\bdriving (school|instructor)/, 'education.driving_school'],
  [/\b(language school|music school|tutor)/, 'education.language_school,education.music_school'],
  [/\b(school|college)/, 'education.school,education.college'],
  [/\b(nursery|daycare|day care|childcare|kindergarten)/, 'childcare'],
  [/\b(wedding venue|event venue|events venue)/, 'activity.events_venue'],
  [/\b(storage|self storage)/, 'rental.storage'],
  [/\b(car hire|car rental)/, 'rental.car'],
  [/\b(brewer|distiller|winer|vineyard)/, 'production.brewery,production.distillery,production.winery'],
];

/** Geoapify's categories for a trade, or null when it has none for it. */
export function categoriesFor(trade: string): string | null {
  const t = ` ${trade.toLowerCase().replace(/\s+/g, ' ').trim()} `;
  const hit = TRADES.find(([re]) => re.test(t));
  return hit ? hit[1] : null;
}

/* ── The search ── */

interface GeoFeature {
  properties?: {
    place_id?: string; name?: string; formatted?: string; address_line1?: string; address_line2?: string;
    categories?: string[]; lat?: number; lon?: number; website?: string;
    contact?: { phone?: string; email?: string };
    datasource?: { raw?: Record<string, string | number> };
  };
}

const first = (...v: unknown[]) => String(v.find(x => typeof x === 'string' && x.trim()) ?? '').split(';')[0].trim();

export function toGeoProspect(f: GeoFeature, wanted: string): Prospect | null {
  const p = f.properties ?? {};
  const raw = p.datasource?.raw ?? {};
  const name = String(p.name ?? raw.name ?? '').trim();
  if (!name) return null;
  /* The most specific of its categories that is one we asked for, in words. */
  const asked = wanted.split(',');
  const cat = (p.categories ?? []).filter(c => asked.some(a => c === a || c.startsWith(`${a}.`)))
    .sort((a, b) => b.length - a.length)[0] ?? asked[0];
  const address = (p.formatted ?? [p.address_line1, p.address_line2].filter(Boolean).join(', ')).replace(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},\\s*`), '');
  return {
    ref: `geoapify:${p.place_id ?? `${p.lat},${p.lon}`}`,
    source: 'free',
    name: name.slice(0, 160),
    phone: first(p.contact?.phone, raw.phone, raw['contact:phone'], raw['contact:mobile']).slice(0, 40),
    website: first(p.website, raw.website, raw['contact:website'], raw.url).slice(0, 300),
    email: first(p.contact?.email, raw.email, raw['contact:email']).toLowerCase().slice(0, 160),
    address: address.slice(0, 200),
    category: (cat.split('.').pop() ?? '').replace(/_/g, ' ').slice(0, 60),
    lat: Number(p.lat ?? 0),
    lon: Number(p.lon ?? 0),
  };
}

export interface GeoSearch {
  ok: boolean;
  prospects: Prospect[];
  cached: boolean;
  /** Offset of the next page, as a token; '' when there is none. */
  next: string;
  error: string;
  /** `no_category` (send it to Overpass), `geo_cap` (today's credits), `bad_key`, `quota`, `not_found`, `unreachable`. */
  code: string;
}

const fail = (code: string, error: string): GeoSearch => ({ ok: false, prospects: [], cached: false, next: '', error, code });

async function cached<T>(env: Env, q: string): Promise<T | null> {
  const hit = await env.DB.prepare('SELECT payload FROM crm_prospect_cache WHERE q = ? AND expires_at > ?')
    .bind(q, Math.floor(Date.now() / 1000)).first<{ payload: string }>().catch(() => null);
  if (!hit) return null;
  try { return JSON.parse(hit.payload) as T; } catch { return null; }
}
async function keep(env: Env, q: string, value: unknown): Promise<void> {
  await env.DB.prepare('INSERT OR REPLACE INTO crm_prospect_cache (q, payload, expires_at, created_at) VALUES (?,?,?,?)')
    .bind(q, JSON.stringify(value), Math.floor(Date.now() / 1000) + CACHE_SECONDS, nowIso()).run().catch(() => undefined);
}

async function geoFetch(env: Env, path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    const r = await fetch(`${base(env)}${path}`, { signal: AbortSignal.timeout(12_000), headers: { Accept: 'application/json' } });
    return { status: r.status, body: await r.json<Record<string, unknown>>().catch(() => ({})) };
  } catch {
    return { status: 0, body: {} };
  }
}

/** Geoapify's refusal, in words that name the fix. */
function refusal(status: number, body: Record<string, unknown>): { code: string; error: string } {
  const msg = String(body.message ?? body.error ?? '');
  if (status === 401 || status === 403) return { code: 'bad_key', error: `Geoapify refused the key${msg ? `: ${msg}` : ''}.` };
  if (status === 429) return { code: 'quota', error: 'Geoapify\'s free searches for today are used up.' };
  if (status === 0) return { code: 'unreachable', error: 'Geoapify could not be reached.' };
  return { code: 'error', error: `Geoapify answered ${status}${msg ? `: ${msg}` : ''}.` };
}

export async function searchGeoapify(env: Env, key: string, trade: string, place: string, pageToken = '', fresh = false): Promise<GeoSearch> {
  const cats = categoriesFor(trade);
  if (!cats) return fail('no_category', '');
  const offset = /^geo:\d{1,4}$/.test(pageToken) ? Number(pageToken.slice(4)) : 0;
  const p = place.toLowerCase().replace(/[^\p{L}\p{N} ,-]/gu, '').trim().slice(0, 80);
  const q = `geoapify|${cats}|${p}|${offset}`;

  /* `fresh` (AI Prospecting) asks Geoapify again; the place's boundary below
     is still taken from the cache — a town does not move, a business might. */
  const hit = fresh ? null : await cached<{ prospects: Prospect[]; next: string }>(env, q);
  if (hit) return { ok: true, prospects: hit.prospects, cached: true, next: hit.next, error: '', code: '' };

  if ((await creditsToday(env)) >= DAILY_CREDIT_CAP) {
    return fail('geo_cap', 'The free directory has used today\'s searches.');
  }

  /* The place: a city or town's own boundary when Geoapify has one, so
     "Leeds" means Leeds and not everything within some radius of a point. */
  let where = await cached<{ id: string; lon: number; lat: number; kind: string }>(env, `geoapify-place|${p}`);
  if (!where) {
    const g = await geoFetch(env, `/v1/geocode/search?text=${encodeURIComponent(place)}&limit=1&format=json&apiKey=${encodeURIComponent(key)}`);
    await spend(env, 1);
    if (g.status !== 200) return { ...fail('', ''), ...refusal(g.status, g.body) };
    const r = ((g.body.results ?? []) as { place_id?: string; lon?: number; lat?: number; result_type?: string }[])[0];
    if (!r?.place_id) return fail('not_found', `Could not find a place called "${place}". Try the town or city name.`);
    where = { id: r.place_id, lon: Number(r.lon), lat: Number(r.lat), kind: String(r.result_type ?? '') };
    await keep(env, `geoapify-place|${p}`, where);
  }
  /* An area has a boundary to search inside; a street or a point does not,
     so it gets 15 km around it instead. */
  const area = ['city', 'county', 'state', 'postcode', 'district', 'suburb', 'country'].includes(where.kind);
  const filter = area ? `place:${where.id}` : `circle:${where.lon},${where.lat},15000`;
  const r = await geoFetch(env,
    `/v2/places?categories=${encodeURIComponent(cats)}&filter=${encodeURIComponent(filter)}&bias=${encodeURIComponent(`proximity:${where.lon},${where.lat}`)}`
    + `&limit=${PAGE}&offset=${offset}&apiKey=${encodeURIComponent(key)}`);
  await spend(env, Math.ceil(PAGE / 20));
  if (r.status !== 200) return { ...fail('', ''), ...refusal(r.status, r.body) };

  const seen = new Set<string>();
  const prospects: Prospect[] = [];
  const features = (r.body.features ?? []) as GeoFeature[];
  for (const f of features) {
    const pr = toGeoProspect(f, cats);
    if (!pr) continue;
    const k = `${pr.name.toLowerCase()}|${pr.address.toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    prospects.push(pr);
  }
  const next = features.length >= PAGE && offset + PAGE < 500 ? `geo:${offset + PAGE}` : '';
  await keep(env, q, { prospects, next });
  return { ok: true, prospects, cached: false, next, error: '', code: '' };
}

/** One geocode of a known city: proves the key for the owner's "Test connection". One credit. */
export async function testGeoKey(env: Env, key: string): Promise<{ ok: boolean; error: string }> {
  const g = await geoFetch(env, `/v1/geocode/search?text=London&limit=1&format=json&apiKey=${encodeURIComponent(key)}`);
  await spend(env, 1);
  if (g.status === 200) return { ok: true, error: '' };
  return { ok: false, error: refusal(g.status, g.body).error };
}

/* ── A region, as its towns ── */

export interface PlaceExpansion { kind: string; places: string[]; error: string }

/**
 * "Virginia" → its cities and towns, largest first — for a daily finder that
 * works a state town by town rather than as one search capped at 500.
 *
 * A place that is already a town comes back as itself. A state, county or
 * country is asked for the populated places inside its own boundary, sorted by
 * the population OpenStreetMap records where it has one. Cached a fortnight:
 * towns do not move. Costs a geocode and a page of places (about six credits).
 */
export async function citiesIn(env: Env, key: string, place: string, max = 20): Promise<PlaceExpansion> {
  const p = place.toLowerCase().replace(/[^\p{L}\p{N} ,-]/gu, '').trim().slice(0, 80);
  if (!p) return { kind: '', places: [], error: 'Say where.' };
  const hit = await cached<PlaceExpansion>(env, `geoapify-cities|${p}|${max}`);
  if (hit) return hit;
  const g = await geoFetch(env, `/v1/geocode/search?text=${encodeURIComponent(place)}&limit=1&format=json&apiKey=${encodeURIComponent(key)}`);
  await spend(env, 1);
  if (g.status !== 200) return { kind: '', places: [], error: refusal(g.status, g.body).error };
  const r = ((g.body.results ?? []) as { place_id?: string; result_type?: string; state?: string; county?: string; country?: string; city?: string; formatted?: string }[])[0];
  if (!r?.place_id) return { kind: '', places: [], error: `Could not find a place called "${place}".` };
  const kind = String(r.result_type ?? '');
  if (!['state', 'county', 'country'].includes(kind)) return { kind, places: [place.trim()], error: '' };
  const region = r.state || r.county || r.country || place.trim();
  const q = await geoFetch(env, `/v2/places?categories=${encodeURIComponent('populated_place.city,populated_place.town')}&filter=${encodeURIComponent(`place:${r.place_id}`)}&limit=100&apiKey=${encodeURIComponent(key)}`);
  await spend(env, 5);
  if (q.status !== 200) return { kind, places: [place.trim()], error: refusal(q.status, q.body).error };
  const towns = ((q.body.features ?? []) as { properties?: { name?: string; datasource?: { raw?: { population?: string | number } } } }[])
    .map(f => ({ name: String(f.properties?.name ?? '').trim(), pop: Number(f.properties?.datasource?.raw?.population ?? 0) || 0 }))
    .filter(t => t.name && t.name.length < 60);
  const seen = new Set<string>();
  const places = towns.sort((a, b) => b.pop - a.pop)
    .filter(t => { const k = t.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, max).map(t => `${t.name}, ${region}`);
  const out = { kind, places: places.length ? places : [place.trim()], error: '' };
  await keep(env, `geoapify-cities|${p}|${max}`, out);
  return out;
}
