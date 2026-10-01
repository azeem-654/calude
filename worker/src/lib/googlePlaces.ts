/**
 * The one Google Maps key, and everything that spends it.
 *
 * Reviews (lib/reputation.ts) and prospect search (routes/prospects.ts) both
 * read Google through Places API (New), and both used to be on their way to
 * owning a copy of "which key do I use". Two copies drift the first time one
 * of them learns a rule — the trial, the budget — and the owner then has a
 * key that is protected on one screen and not on the other. So the key, its
 * resolution, the refusals and the meter live here, once.
 *
 * ── Whose key ──
 *
 * The workspace's own (Reputation → Settings → Review sources), then the
 * install owner's (Settings → Platform services). Own first for the same
 * reason as the AI key: somebody who brought one expects their quota to be
 * the one spent.
 *
 * ── What protects the owner's key ──
 *
 * Two things, and only when it is the owner's key being spent:
 *  - an ended trial (lib/trial.ts) stops the fallback, exactly as `loadAiKey`
 *    does for the AI key — a customer who has stopped paying stops costing;
 *  - a per-workspace budget on searches (`placesBudget`), because one Text
 *    Search with phone and website is Google's dearer SKU and a loop in one
 *    browser tab could otherwise run the owner's bill up overnight.
 *
 * ── Why the base URL is overridable ──
 *
 * `GOOGLE_PLACES_BASE` points the whole thing at a local mock, so the tests
 * prove the requests this sends (key header, field mask, body) rather than
 * that a mock of this module returns what it was told to.
 */
import { decryptSecret, encryptSecret } from './crypto';
import { installSecret, nowIso, type Env } from './db';
import { rateLimit } from './rateLimit';
import { trialForWorkspace } from './trial';
import type { Prospect } from './prospects';

const SECRET_KEY = 'mailbox_key';
const INSTALL_KIND = 'google_places';

export const placesBase = (env: Env): string => (env.GOOGLE_PLACES_BASE || 'https://places.googleapis.com').replace(/\/+$/, '');

/* Google's API keys are "AIza" and 35 more characters. Checked before saving,
   so a pasted client secret or a truncated key is refused at the box rather
   than discovered at the next check. */
export const KEY_RE = /^AIza[0-9A-Za-z_-]{35}$/;

export interface GResult<T> { ok: boolean; data?: T; error?: string; code?: string }

/* ── Keys ──────────────────────────────────────────────────────────────── */

export interface InstallPlacesKey { key: string; status: string; lastError: string; updatedAt: string }

/** The install owner's Places key, decrypted. Null when none is set. */
export async function installPlacesKey(env: Env): Promise<InstallPlacesKey | null> {
  const row = await env.DB.prepare('SELECT credentials, status, last_error AS lastError, updated_at AS updatedAt FROM crm_install_providers WHERE kind = ?')
    .bind(INSTALL_KIND).first<{ credentials: string; status: string; lastError: string; updatedAt: string }>();
  if (!row?.credentials) return null;
  try {
    const c = JSON.parse(await decryptSecret(await installSecret(env.DB, SECRET_KEY), row.credentials)) as { apiKey?: string };
    return c.apiKey ? { key: c.apiKey, status: row.status, lastError: row.lastError, updatedAt: row.updatedAt } : null;
  } catch { return null; }
}

/**
 * Store the install key. A new key starts unverified: carrying a green tick
 * across an edit would vouch for a key nobody has tried.
 */
export async function saveInstallPlacesKey(env: Env, apiKey: string): Promise<void> {
  const blob = await encryptSecret(await installSecret(env.DB, SECRET_KEY), JSON.stringify({ apiKey }));
  await env.DB.prepare(
    `INSERT INTO crm_install_providers (kind, provider, credentials, status, last_error, updated_at)
     VALUES (?, 'google', ?, 'unknown', '', ?)
     ON CONFLICT(kind) DO UPDATE SET credentials = excluded.credentials, status = 'unknown', last_error = '', updated_at = excluded.updated_at`,
  ).bind(INSTALL_KIND, blob, nowIso()).run();
}

export async function markInstallKey(env: Env, ok: boolean, error = ''): Promise<void> {
  await env.DB.prepare('UPDATE crm_install_providers SET status = ?, last_error = ?, updated_at = ? WHERE kind = ?')
    .bind(ok ? 'ok' : 'error', error.slice(0, 300), nowIso(), INSTALL_KIND).run();
}

export const encryptKey = async (env: Env, plain: string) => encryptSecret(await installSecret(env.DB, SECRET_KEY), plain);

/** Said by Reputation when neither key exists. test:reputation reads its opening words. */
export const NO_KEY = 'No Google Places key is set up: this workspace has none of its own and the installation has none either. '
  + 'Add your own under Reputation → Settings → Review sources, or ask the owner of this app to add the Google Maps key in Settings → Platform services.';

/** Said by prospect search when neither key exists — the sentence the owner asked for, word for word. */
export const NO_KEY_PROSPECTS = 'Prospect search needs the Google Maps key — the owner sets it in Settings → Platform services.';

export const PLACES_TRIAL_ENDED =
  'Your 7-day free trial has ended, so searches and checks on Google Maps have stopped. Choose a plan under Plan & billing to carry on — everything you found is still in Contacts.';

export type PlacesKey =
  | { ok: true; key: string; whose: 'workspace' | 'install' }
  | { ok: false; code: 'no_key' | 'trial_ended'; error: string };

/**
 * Which key a workspace reads Google with, or why there is none.
 *
 * The trial is asked only after the workspace's own key has been looked for:
 * a customer's own key costs the owner nothing, and ending somebody's access
 * to a key they pay for themselves is not the trial's business.
 */
export async function placesKeyFor(env: Env, accountId: string, noKey = NO_KEY): Promise<PlacesKey> {
  const row = await env.DB.prepare('SELECT places_key AS k FROM crm_review_sources WHERE account_id = ?')
    .bind(accountId).first<{ k: string }>().catch(() => null);
  if (row?.k) {
    try {
      const plain = await decryptSecret(await installSecret(env.DB, SECRET_KEY), row.k);
      if (plain) return { ok: true, key: plain, whose: 'workspace' };
    } catch { /* unreadable: fall through to the install's rather than fail */ }
  }
  const inst = await installPlacesKey(env);
  if (!inst) return { ok: false, code: 'no_key', error: noKey };
  if ((await trialForWorkspace(env, accountId).catch(() => null))?.kind === 'ended') {
    return { ok: false, code: 'trial_ended', error: PLACES_TRIAL_ENDED };
  }
  return { ok: true, key: inst.key, whose: 'install' };
}

/* ── Spending it ───────────────────────────────────────────────────────── */

/**
 * The per-workspace allowance on the owner's key, for searches.
 *
 * Generous for a person (a search returns twenty businesses, so sixty a day
 * is twelve hundred leads), a wall for a script. At Google's 2025 price for a
 * Text Search that returns phone and website — about $35 per thousand after a
 * free thousand a month across the whole install — the worst one workspace
 * can cost in a month is roughly $10.
 */
export const PLACES_BUDGET = [
  { what: 'places-hour', max: 20, windowSeconds: 3600, label: '20 an hour' },
  { what: 'places-day', max: 60, windowSeconds: 86_400, label: '60 a day' },
  { what: 'places-month', max: 300, windowSeconds: 30 * 86_400, label: '300 a month' },
] as const;

/** `null` means go ahead; otherwise the sentence to show. Counts the attempt. */
export async function placesBudget(env: Env, accountId: string): Promise<string | null> {
  for (const b of PLACES_BUDGET) {
    const v = await rateLimit(env, { what: b.what, who: accountId, max: b.max, windowSeconds: b.windowSeconds });
    if (!v.allowed) {
      const mins = Math.max(1, Math.ceil(v.retryAfter / 60));
      const wait = mins >= 120 ? `${Math.ceil(mins / 60)} hours` : `${mins} minutes`;
      return `That is the most Google Maps searches one workspace can run on the included key (${PLACES_BUDGET.map(x => x.label).join(', ')}). Try again in ${wait}.`;
    }
  }
  return null;
}

export type PlacesUse = 'prospects' | 'reviews';

const month = (d = new Date()) => d.toISOString().slice(0, 7);

/**
 * Write down one call that reached Google, by workspace and whose key.
 *
 * Its own small table rather than a count of rate-limit rows: those windows
 * slide and are pruned daily, and "how many this month, on my key" is the
 * question the owner's bill asks. Never allowed to fail the request it counts.
 */
export async function meterPlaces(env: Env, accountId: string, use: PlacesUse, whose: 'workspace' | 'install', n = 1): Promise<void> {
  if (n <= 0) return;
  try {
    await env.DB.prepare(
      `INSERT INTO crm_places_usage (month, account_id, kind, whose, calls, updated_at) VALUES (?,?,?,?,?,?)
       ON CONFLICT(month, account_id, kind, whose) DO UPDATE SET calls = crm_places_usage.calls + excluded.calls, updated_at = excluded.updated_at`,
    ).bind(month(), accountId, use, whose, n, nowIso()).run();
  } catch { /* a database before 0058 simply does not count */ }
}

export interface PlacesUsage {
  month: string;
  /** Calls on the owner's key this month. */
  install: { prospects: number; reviews: number };
  /** Calls workspaces made on keys of their own — not the owner's bill, shown so the split is visible. */
  own: { prospects: number; reviews: number };
  /** Workspaces that spent the owner's key this month. */
  workspaces: number;
}

export async function placesUsage(env: Env): Promise<PlacesUsage> {
  const m = month();
  const out: PlacesUsage = { month: m, install: { prospects: 0, reviews: 0 }, own: { prospects: 0, reviews: 0 }, workspaces: 0 };
  try {
    const { results } = await env.DB.prepare('SELECT kind, whose, SUM(calls) AS n FROM crm_places_usage WHERE month = ? GROUP BY kind, whose')
      .bind(m).all<{ kind: string; whose: string; n: number }>();
    for (const r of results ?? []) {
      const side = r.whose === 'install' ? out.install : out.own;
      if (r.kind === 'prospects' || r.kind === 'reviews') side[r.kind] += Number(r.n) || 0;
    }
    const w = await env.DB.prepare("SELECT COUNT(DISTINCT account_id) AS n FROM crm_places_usage WHERE month = ? AND whose = 'install'")
      .bind(m).first<{ n: number }>();
    out.workspaces = w?.n ?? 0;
  } catch { /* no table yet: zeros are the truth */ }
  return out;
}

/* ── Places API (New) ──────────────────────────────────────────────────── */

export interface GoogleError { error?: { code?: number; message?: string; status?: string; details?: { reason?: string; '@type'?: string }[] } }

/** Google's refusal, in words that name the fix. */
export function placesError(status: number, body: GoogleError): { error: string; code: string } {
  const e = body.error ?? {};
  const reasons = (e.details ?? []).map(d => d.reason ?? '').join(' ');
  const msg = e.message ?? '';
  if (/API_KEY_INVALID/.test(reasons) || /API key not valid/i.test(msg)) {
    return { code: 'bad_key', error: 'Google refused the Places API key — it is not a valid key. Check it was copied whole.' };
  }
  if (/SERVICE_DISABLED/.test(reasons) || /has not been used|is disabled/i.test(msg)) {
    return { code: 'api_disabled', error: '"Places API (New)" is not enabled in the Google Cloud project this key belongs to. Enable it in the Google Cloud console and try again.' };
  }
  if (/API_KEY_SERVICE_BLOCKED|API_KEY_HTTP_REFERRER_BLOCKED|API_KEY_IP_ADDRESS_BLOCKED/.test(reasons) || /blocked/i.test(msg)) {
    return { code: 'key_restricted', error: 'This key is restricted in a way that blocks Places API (New) from a server. Allow "Places API (New)" for the key, with no website (referrer) restriction.' };
  }
  if (/BILLING_DISABLED/.test(reasons) || /billing/i.test(msg)) {
    return { code: 'billing', error: 'Google needs a billing account on the Cloud project this key belongs to before Places API (New) will answer. Add one under Billing in the Google Cloud console.' };
  }
  if (status === 404 || e.status === 'NOT_FOUND') return { code: 'not_found', error: 'Google has no place with that ID. Search for the business again.' };
  if (status === 429) return { code: 'quota', error: 'Google says this key is over its Places quota. Try again later or raise the quota in Google Cloud.' };
  if (status === 403) return { code: 'denied', error: `Google refused the request: ${msg || 'permission denied'}` };
  return { code: 'google', error: `Google Places answered ${status}${msg ? `: ${msg}` : ''}` };
}

/** Codes that mean the key itself is wrong, so its status should say so. */
export const KEY_FAULT = /^(bad_key|api_disabled|key_restricted|billing)$/;

export const httpsOnly = (u: unknown): string => {
  const s = String(u ?? '');
  return /^https:\/\//i.test(s) ? s.slice(0, 600) : '';
};

/** A Places id is base64url-ish; anything else is refused before it becomes part of a URL. */
export const PLACE_ID_RE = /^[A-Za-z0-9_-]{6,300}$/;
/* Google's next-page token is opaque, but it is base64url-ish too; anything
   else is not something Google gave out and is not forwarded. */
export const PAGE_TOKEN_RE = /^[A-Za-z0-9_\-=.]{10,2000}$/;

/*
 * What a prospect search asks Google for.
 *
 * Phone and website are why anybody searches; they also move the request to
 * Google's "Enterprise" Text Search price. Reviews, photos and opening hours
 * are left out: nothing on the screen uses them, and each would cost more.
 */
export const PROSPECT_FIELDS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.location',
  'places.primaryTypeDisplayName', 'places.businessStatus', 'places.googleMapsUri',
  'places.nationalPhoneNumber', 'places.internationalPhoneNumber', 'places.websiteUri',
  'places.rating', 'places.userRatingCount', 'nextPageToken',
].join(',');

export interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryTypeDisplayName?: { text?: string };
  businessStatus?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
}

/**
 * One Google place as a lead, or null when it is not one.
 *
 * A business Google marks permanently closed is not somebody to approach, and
 * a place with no id or no name cannot be told apart from the next one. Pure,
 * so test:prospects can argue with it without a network.
 */
export function fromPlace(p: GooglePlace): Prospect | null {
  const id = String(p.id ?? '');
  const name = String(p.displayName?.text ?? '').trim();
  if (!PLACE_ID_RE.test(id) || !name) return null;
  if (p.businessStatus === 'CLOSED_PERMANENTLY') return null;
  const site = httpsOnly(p.websiteUri) || (/^http:\/\//i.test(String(p.websiteUri ?? '')) ? String(p.websiteUri).slice(0, 300) : '');
  return {
    ref: `google:${id}`,
    source: 'google',
    placeId: id,
    name: name.slice(0, 160),
    /* The national form reads as people write it locally; the international
       one is kept only when there is nothing else. */
    phone: String(p.nationalPhoneNumber || p.internationalPhoneNumber || '').trim().slice(0, 40),
    website: site.slice(0, 300),
    /* Google never publishes one. The site read fills it in, as for OSM. */
    email: '',
    address: String(p.formattedAddress ?? '').trim().slice(0, 200),
    category: String(p.primaryTypeDisplayName?.text ?? '').trim().slice(0, 60),
    lat: typeof p.location?.latitude === 'number' ? p.location.latitude : 0,
    lon: typeof p.location?.longitude === 'number' ? p.location.longitude : 0,
    rating: typeof p.rating === 'number' ? p.rating : null,
    ratingCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
    mapsUrl: httpsOnly(p.googleMapsUri),
    temporarilyClosed: p.businessStatus === 'CLOSED_TEMPORARILY',
  };
}

async function gfetch(url: string, init: RequestInit): Promise<{ res: Response | null; body: Record<string, unknown>; netError?: string }> {
  try {
    const res = await fetch(url, init);
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    return { res, body };
  } catch (e) {
    return { res: null, body: {}, netError: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Text Search for businesses: "plumber in Manchester", as somebody would type
 * it into Maps. Twenty a page; `pageToken` asks for the next twenty.
 *
 * Nothing here is cached. Google's terms let a place id be kept indefinitely
 * and restrict keeping the rest of what Places returns, so the shared
 * fortnight-long cache the OpenStreetMap search keeps would be exactly what
 * they forbid; this server keeps nothing of a search. What a customer then
 * adds to their own Contacts is their act, and docs/OWNER-CHECKLIST.md (16)
 * says plainly what that means for the owner's key.
 */
export async function searchBusinesses(env: Env, key: string, textQuery: string, pageToken = ''):
Promise<GResult<{ prospects: Prospect[]; nextPageToken: string }>> {
  const body: Record<string, unknown> = { textQuery: textQuery.slice(0, 200), pageSize: 20 };
  if (pageToken) body.pageToken = pageToken;
  const { res, body: data, netError } = await gfetch(`${placesBase(env)}/v1/places:searchText`, {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': PROSPECT_FIELDS },
    body: JSON.stringify(body),
  });
  if (!res) return { ok: false, code: 'network', error: `Could not reach Google Maps: ${netError}` };
  if (!res.ok) return { ok: false, ...placesError(res.status, data as GoogleError) };
  const seen = new Set<string>();
  const prospects: Prospect[] = [];
  for (const p of (data.places ?? []) as GooglePlace[]) {
    const pr = fromPlace(p);
    if (!pr || seen.has(pr.ref)) continue;
    seen.add(pr.ref);
    prospects.push(pr);
  }
  const next = String(data.nextPageToken ?? '');
  return { ok: true, data: { prospects, nextPageToken: PAGE_TOKEN_RE.test(next) ? next : '' } };
}
