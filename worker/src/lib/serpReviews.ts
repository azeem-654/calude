/**
 * Google reviews read through SerpApi, for an install with no Google Maps key.
 *
 * Why it exists: Places API (New) needs a Google Cloud billing account, and in
 * some countries Google asks for a prepayment before it will open one. Until
 * the owner can do that, the Reviews screen would otherwise say "no key" to
 * every customer. SerpApi reads the same public Google Maps listing and its
 * free plan (250 searches a month, no card — serpapi.com/pricing) is enough
 * for a small install.
 *
 * It is a fallback, never a preference: `reviewKeyFor` asks for a Places key
 * first (the workspace's own, then the owner's), and only with neither uses
 * SerpApi. Place ids are Google's own (`ChIJ…`) either way, so a source found
 * here keeps working unchanged the day the owner adds the Maps key.
 *
 * The free plan is small, so every request is counted against an install-wide
 * monthly budget (SERPAPI_MONTHLY, default 230 — a margin under SerpApi's 250
 * for the owner's own tests) and a per-workspace daily one, and refused by
 * name past either. The cron reads a SerpApi-backed workspace every three days
 * rather than every six hours (reputationTick.ts).
 *
 * Replies cannot be posted this way — only Business Profile accepts them, as
 * before (docs/claude/reputation-booking.md).
 */
import { decryptSecret, encryptSecret } from './crypto';
import { installSecret, nowIso, type Env } from './db';
import { rateLimit } from './rateLimit';
import { trialForWorkspace } from './trial';
import { NO_KEY, PLACE_ID_RE, PLACES_TRIAL_ENDED, SECRET_KEY, httpsOnly, placesKeyFor, type GResult, type PlacesKey } from './googlePlaces';

const KIND = 'serpapi';
/** Carried in the key string so the existing Places calls can tell which service to ask. */
export const SERP_PREFIX = 'serpapi:';
export const SERP_KEY_RE = /^[a-f0-9]{64}$/i;

const base = (env: Env) => (env.SERPAPI_BASE || 'https://serpapi.com').replace(/\/+$/, '');
const monthlyCap = (env: Env) => Math.max(1, Number(env.SERPAPI_MONTHLY) || 230);
const PER_WORKSPACE_DAY = 15;

export interface InstallSerpKey { key: string; status: string; lastError: string; updatedAt: string }

export async function installSerpKey(env: Env): Promise<InstallSerpKey | null> {
  const row = await env.DB.prepare('SELECT credentials, status, last_error AS lastError, updated_at AS updatedAt FROM crm_install_providers WHERE kind = ?')
    .bind(KIND).first<{ credentials: string; status: string; lastError: string; updatedAt: string }>().catch(() => null);
  if (!row?.credentials) return null;
  try {
    const c = JSON.parse(await decryptSecret(await installSecret(env.DB, SECRET_KEY), row.credentials)) as { apiKey?: string };
    return c.apiKey ? { key: c.apiKey, status: row.status, lastError: row.lastError, updatedAt: row.updatedAt } : null;
  } catch { return null; }
}

/** A new key starts unverified, like the Places key. */
export async function saveInstallSerpKey(env: Env, apiKey: string): Promise<void> {
  const blob = await encryptSecret(await installSecret(env.DB, SECRET_KEY), JSON.stringify({ apiKey }));
  await env.DB.prepare(
    `INSERT INTO crm_install_providers (kind, provider, credentials, status, last_error, updated_at)
     VALUES (?, 'serpapi', ?, 'unknown', '', ?)
     ON CONFLICT(kind) DO UPDATE SET credentials = excluded.credentials, status = 'unknown', last_error = '', updated_at = excluded.updated_at`,
  ).bind(KIND, blob, nowIso()).run();
}

export async function clearInstallSerpKey(env: Env): Promise<void> {
  await env.DB.prepare('DELETE FROM crm_install_providers WHERE kind = ?').bind(KIND).run();
}

export async function markSerpKey(env: Env, ok: boolean, error = ''): Promise<void> {
  await env.DB.prepare('UPDATE crm_install_providers SET status = ?, last_error = ?, updated_at = ? WHERE kind = ?')
    .bind(ok ? 'ok' : 'error', error.slice(0, 300), nowIso(), KIND).run().catch(() => {});
}

/**
 * The key Reputation reads Google with: Places first, SerpApi only when there
 * is no Places key anywhere. Prospect search keeps `placesKeyFor` — SerpApi's
 * small free plan is kept for reviews.
 */
export async function reviewKeyFor(env: Env, accountId: string): Promise<PlacesKey> {
  const k = await placesKeyFor(env, accountId);
  if (k.ok || k.code !== 'no_key') return k;
  const serp = await installSerpKey(env);
  if (!serp) return k;
  if ((await trialForWorkspace(env, accountId).catch(() => null))?.kind === 'ended') {
    return { ok: false, code: 'trial_ended', error: PLACES_TRIAL_ENDED };
  }
  return { ok: true, key: SERP_PREFIX + serp.key, whose: 'install' };
}

/** True when this workspace's reviews come through SerpApi (the cron reads those less often). */
export async function readsThroughSerp(env: Env, accountId: string): Promise<boolean> {
  const k = await reviewKeyFor(env, accountId);
  return k.ok && k.key.startsWith(SERP_PREFIX);
}

export const isSerpKey = (key: string) => key.startsWith(SERP_PREFIX);

const month = () => new Date().toISOString().slice(0, 7);

/** Spend one search, or say why not. `accountId` '' is the owner's own test. */
async function spend(env: Env, accountId: string): Promise<string | null> {
  const m = await rateLimit(env, { what: `serpapi-${month()}`, who: 'install', max: monthlyCap(env), windowSeconds: 32 * 86_400 });
  if (!m.allowed) {
    return `Google reviews are read through SerpApi's free plan until the owner adds the Google Maps key, and this month's ${monthlyCap(env)} reads are used up. New reviews are read again next month — or open the listing on Google Maps.`;
  }
  if (accountId) {
    const d = await rateLimit(env, { what: 'serpapi-day', who: accountId, max: PER_WORKSPACE_DAY, windowSeconds: 86_400 });
    if (!d.allowed) return `That is the most Google review reads one workspace can make in a day (${PER_WORKSPACE_DAY}). Try again tomorrow.`;
  }
  return null;
}

/** How many SerpApi reads the install has spent this month, for Platform services. */
export async function serpUsedThisMonth(env: Env): Promise<{ used: number; cap: number }> {
  const row = await env.DB.prepare('SELECT hits FROM crm_rate_limits WHERE bucket = ?')
    .bind(`serpapi-${month()}:install`).first<{ hits: number }>().catch(() => null);
  return { used: Math.min(Number(row?.hits ?? 0), monthlyCap(env)), cap: monthlyCap(env) };
}

async function serpGet(env: Env, accountId: string, params: Record<string, string>, apiKey: string): Promise<GResult<Record<string, unknown>>> {
  const refused = await spend(env, accountId);
  if (refused) return { ok: false, code: 'serp_budget', error: refused };
  const q = new URLSearchParams({ ...params, api_key: apiKey, hl: 'en' });
  let res: Response;
  try {
    res = await fetch(`${base(env)}/search.json?${q}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(25_000) });
  } catch (e) {
    return { ok: false, code: 'network', error: `Could not reach SerpApi: ${e instanceof Error ? e.message : String(e)}` };
  }
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  const err = typeof body.error === 'string' ? body.error : '';
  if (res.status === 401 || /invalid api key/i.test(err)) return { ok: false, code: 'bad_key', error: 'SerpApi refused the key — check it in Settings → Platform services.' };
  if (res.status === 429 || /run out of searches|plan.*limit/i.test(err)) return { ok: false, code: 'billing', error: 'SerpApi says this month\'s searches on its plan are used up.' };
  if (!res.ok || err) {
    /* "Google hasn't returned any results" is an empty answer, not a fault. */
    if (/hasn't returned any results/i.test(err)) return { ok: true, data: {} };
    return { ok: false, code: 'google', error: `SerpApi could not read Google: ${err || `HTTP ${res.status}`}` };
  }
  return { ok: true, data: body };
}

const mapsUrlFor = (placeId: string) => `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;

interface Summary { placeId: string; name: string; address: string; rating: number | null; count: number | null; mapsUrl: string }
const summaryOf = (p: Record<string, unknown>, fallbackId = ''): Summary => {
  const placeId = String(p.place_id ?? fallbackId);
  return {
    placeId,
    name: String(p.title ?? '').slice(0, 200),
    address: String(p.address ?? '').slice(0, 300),
    rating: typeof p.rating === 'number' ? p.rating : null,
    count: typeof p.reviews === 'number' ? p.reviews : null,
    mapsUrl: placeId ? mapsUrlFor(placeId) : '',
  };
};

export async function serpSearchPlaces(env: Env, accountId: string, apiKey: string, query: string): Promise<GResult<Summary[]>> {
  const r = await serpGet(env, accountId, { engine: 'google_maps', type: 'search', q: query.slice(0, 200) }, apiKey);
  if (!r.ok || !r.data) return { ok: false, code: r.code, error: r.error };
  const list = Array.isArray(r.data.local_results) ? r.data.local_results as Record<string, unknown>[]
    : r.data.place_results ? [r.data.place_results as Record<string, unknown>] : [];
  return { ok: true, data: list.slice(0, 8).map(p => summaryOf(p)).filter(p => PLACE_ID_RE.test(p.placeId)) };
}

export interface SerpReview {
  source: 'google_places'; extId: string; author: string; authorPhoto: string; rating: number; content: string;
  time: string | null; link: string; reply: string; replyTime: string | null;
}

/**
 * One place's numbers, and its newest reviews when asked for. With reviews it
 * is one request (google_maps_reviews carries the place's rating and count);
 * without, one google_maps place request.
 */
export async function serpPlaceDetails(env: Env, accountId: string, apiKey: string, placeId: string, withReviews: boolean): Promise<GResult<Summary & { reviews: SerpReview[] }>> {
  if (!PLACE_ID_RE.test(placeId)) return { ok: false, code: 'bad_place', error: 'That is not a Google place ID.' };
  if (!withReviews) {
    const r = await serpGet(env, accountId, { engine: 'google_maps', type: 'place', place_id: placeId }, apiKey);
    if (!r.ok || !r.data) return { ok: false, code: r.code, error: r.error };
    const p = r.data.place_results as Record<string, unknown> | undefined;
    if (!p) return { ok: false, code: 'not_found', error: 'Google has no business with that place ID.' };
    return { ok: true, data: { ...summaryOf(p, placeId), placeId, reviews: [] } };
  }
  const r = await serpGet(env, accountId, { engine: 'google_maps_reviews', place_id: placeId, sort_by: 'newestFirst' }, apiKey);
  if (!r.ok || !r.data) return { ok: false, code: r.code, error: r.error };
  const info = (r.data.place_info ?? {}) as Record<string, unknown>;
  const reviews = ((r.data.reviews ?? []) as Record<string, unknown>[]).map(v => {
    const user = (v.user ?? {}) as { name?: string; thumbnail?: string; link?: string };
    const reply = (v.response ?? {}) as { snippet?: string; iso_date?: string };
    const text = (v.extracted_snippet as { original?: string } | undefined)?.original ?? v.snippet ?? '';
    return {
      source: 'google_places' as const,
      /* Prefixed so a review read here and the same review read later through
         Places are never confused with each other's ids. */
      extId: v.review_id ? `serp:${String(v.review_id)}`.slice(0, 300) : '',
      author: String(user.name ?? 'A Google user').slice(0, 200),
      authorPhoto: httpsOnly(user.thumbnail),
      rating: Math.max(0, Math.min(5, Math.round(Number(v.rating) || 0))),
      content: String(text).slice(0, 5000),
      time: typeof v.iso_date === 'string' ? v.iso_date : null,
      link: httpsOnly(v.link) || httpsOnly(user.link),
      reply: String(reply.snippet ?? '').slice(0, 5000),
      replyTime: typeof reply.iso_date === 'string' ? reply.iso_date : null,
    };
  }).filter(v => v.extId);
  return { ok: true, data: { ...summaryOf(info, placeId), placeId, reviews } };
}

/** The owner's Test button: one cheap search, not charged to any workspace. */
export async function testSerpKey(env: Env, apiKey: string): Promise<GResult<number>> {
  const r = await serpSearchPlaces(env, '', apiKey, 'Googleplex Mountain View');
  return r.ok ? { ok: true, data: r.data?.length ?? 0 } : { ok: false, code: r.code, error: r.error };
}

export { NO_KEY };
