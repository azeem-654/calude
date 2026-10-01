/**
 * Reviews, read from Google.
 *
 * ── What this replaced ──
 *
 * The Reviews screen seeded eight invented reviews, invented another every
 * twenty to forty seconds while it was open, compared the business with three
 * invented competitors, and "posted" replies by flipping a flag in the
 * browser. The Google key it asked for sat in plain text in crm_data and was
 * never used. Everything here is a real call, made from the Worker, and every
 * one that cannot be made says why by name.
 *
 * ── Two ways in, and what each can do ──
 *
 * **Places API (New)** reads a public place: its rating, its review count and
 * at most **five** reviews, chosen by Google. It needs only a key — the
 * workspace's own, or the one the install owner set once — so it works for
 * any business on day one. It cannot reply: Google lets only the verified
 * owner answer a review, and only through Business Profile.
 *
 * **Business Profile** (OAuth, `business.manage`) reads every review of a
 * location the signed-in Google user manages, and posts replies. Google gates
 * the API behind an access request; until it is approved every call answers
 * 403 or a quota of zero, and `NOT_APPROVED` below is the sentence the
 * customer is shown instead of a generic failure.
 *
 * ── Why every base URL is overridable ──
 *
 * So test/reputation.e2e.mjs can point the whole module at a local mock and
 * prove the requests this sends, rather than proving only that a mock of this
 * module returns what the mock was told to. Production sets none of them.
 */
import { decryptSecret, encryptSecret, newToken } from './crypto';
import { dataGet, installSecret, nowIso, type Env } from './db';
import { googleCreds } from './googleAuth';
import { aiBudget, askGemini, extractJson, loadAiKey } from './ai';
import {
  KEY_FAULT, PLACE_ID_RE, httpsOnly, markInstallKey, meterPlaces, placesBase, placesError, placesKeyFor,
  type GResult, type GoogleError,
} from './googlePlaces';

export const GBP_SCOPE = 'https://www.googleapis.com/auth/business.manage';

/** Said whenever Google refuses Business Profile because the app is not let in yet. */
export const NOT_APPROVED = 'Google has not approved Business Profile API access for this app yet.';

const SECRET_KEY = 'mailbox_key';

const base = (v: string | undefined, dflt: string) => (v || dflt).replace(/\/+$/, '');
export const urls = (env: Env) => ({
  places: placesBase(env),
  accounts: base(env.GOOGLE_GBP_ACCOUNTS_BASE, 'https://mybusinessaccountmanagement.googleapis.com'),
  info: base(env.GOOGLE_GBP_INFO_BASE, 'https://mybusinessbusinessinformation.googleapis.com'),
  v4: base(env.GOOGLE_GBP_V4_BASE, 'https://mybusiness.googleapis.com'),
  token: env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
});

/*
 * The key, its resolution (own, then the owner's, never past an ended trial),
 * Google's refusals and the usage meter are shared with prospect search and
 * live in lib/googlePlaces.ts. Re-exported so this module's callers keep one
 * import.
 */
export {
  NO_KEY, PLACE_ID_RE, encryptKey, installPlacesKey, markInstallKey, placesKeyFor, saveInstallPlacesKey,
  type GResult,
} from './googlePlaces';

async function gfetch(url: string, init: RequestInit): Promise<{ res: Response | null; body: Record<string, unknown>; netError?: string }> {
  try {
    const res = await fetch(url, init);
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    return { res, body };
  } catch (e) {
    return { res: null, body: {}, netError: e instanceof Error ? e.message : String(e) };
  }
}

export interface PlaceSummary { placeId: string; name: string; address: string; rating: number | null; count: number | null; mapsUrl: string }
export interface IncomingReview {
  source: 'google_places' | 'google_business';
  extId: string; author: string; authorPhoto: string; rating: number; content: string;
  time: string | null; link: string; reply: string; replyTime: string | null;
}

export async function searchPlaces(env: Env, key: string, query: string): Promise<GResult<PlaceSummary[]>> {
  const { res, body, netError } = await gfetch(`${urls(env).places}/v1/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri',
    },
    body: JSON.stringify({ textQuery: query, pageSize: 8 }),
  });
  if (!res) return { ok: false, code: 'network', error: `Could not reach Google Places: ${netError}` };
  if (!res.ok) return { ok: false, ...placesError(res.status, body as GoogleError) };
  const places = (body.places ?? []) as Record<string, unknown>[];
  return {
    ok: true,
    data: places.slice(0, 8).map(p => ({
      placeId: String(p.id ?? ''),
      name: String((p.displayName as { text?: string } | undefined)?.text ?? ''),
      address: String(p.formattedAddress ?? ''),
      rating: typeof p.rating === 'number' ? p.rating : null,
      count: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
      mapsUrl: httpsOnly(p.googleMapsUri),
    })).filter(p => PLACE_ID_RE.test(p.placeId)),
  };
}

/**
 * One place's numbers, and its reviews when asked for.
 *
 * Reviews are asked for only when they will be read: they move the request to
 * Google's dearer SKU, and a competitor's rating does not need them.
 */
export async function placeDetails(env: Env, key: string, placeId: string, withReviews: boolean): Promise<GResult<PlaceSummary & { reviews: IncomingReview[] }>> {
  if (!PLACE_ID_RE.test(placeId)) return { ok: false, code: 'bad_place', error: 'That is not a Google place ID.' };
  const mask = 'id,displayName,rating,userRatingCount,googleMapsUri,formattedAddress' + (withReviews ? ',reviews' : '');
  const { res, body, netError } = await gfetch(`${urls(env).places}/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': mask },
  });
  if (!res) return { ok: false, code: 'network', error: `Could not reach Google Places: ${netError}` };
  if (!res.ok) return { ok: false, ...placesError(res.status, body as GoogleError) };
  const reviews = ((body.reviews ?? []) as Record<string, unknown>[]).map(r => {
    const author = (r.authorAttribution ?? {}) as { displayName?: string; photoUri?: string; uri?: string };
    const text = (r.originalText as { text?: string } | undefined)?.text ?? (r.text as { text?: string } | undefined)?.text ?? '';
    return {
      source: 'google_places' as const,
      extId: String(r.name ?? ''),
      author: String(author.displayName ?? 'A Google user').slice(0, 200),
      authorPhoto: httpsOnly(author.photoUri),
      rating: Math.max(0, Math.min(5, Math.round(Number(r.rating) || 0))),
      content: String(text).slice(0, 5000),
      time: typeof r.publishTime === 'string' ? r.publishTime : null,
      link: httpsOnly(r.googleMapsUri) || httpsOnly(author.uri),
      reply: '', replyTime: null,
    };
  }).filter(r => r.extId);
  return {
    ok: true,
    data: {
      placeId: String(body.id ?? placeId),
      name: String((body.displayName as { text?: string } | undefined)?.text ?? ''),
      address: String(body.formattedAddress ?? ''),
      rating: typeof body.rating === 'number' ? body.rating : null,
      count: typeof body.userRatingCount === 'number' ? body.userRatingCount : null,
      mapsUrl: httpsOnly(body.googleMapsUri),
      reviews,
    },
  };
}

/* ── Business Profile: OAuth ───────────────────────────────────────────── */

export const gbpAuthUrl = (clientId: string, redirect: string, state: string): string =>
  `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: GBP_SCOPE,
    /* Both are needed to be handed a refresh token at all (googleCalendar.ts
       says why): without one the connection dies after an hour. */
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  }).toString()}`;

/** Swap the code for tokens and store them encrypted. The location is chosen afterwards. */
export async function gbpConnect(env: Env, accountId: string, ownerEmail: string, code: string, redirect: string): Promise<GResult<true>> {
  const c = await googleCreds(env);
  if (!c) return { ok: false, error: 'No Google client is configured for this installation.' };
  const { res, body, netError } = await gfetch(urls(env).token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: redirect, grant_type: 'authorization_code' }),
  });
  if (!res) return { ok: false, error: `Could not reach Google: ${netError}` };
  if (!res.ok || !body.access_token) return { ok: false, error: String(body.error_description ?? body.error ?? 'Google refused the connection.') };
  if (!body.refresh_token) {
    return { ok: false, error: 'Google did not return a refresh token. Remove this app at myaccount.google.com/permissions and connect again.' };
  }
  if (typeof body.scope === 'string' && !body.scope.split(' ').includes(GBP_SCOPE)) {
    /* The consent screen lets somebody untick a scope. Stored anyway, every
       call would fail with a permission error that names nothing. */
    return { ok: false, error: 'Google did not grant access to Business Profile. Connect again and leave "manage your business" ticked.' };
  }
  const key = await installSecret(env.DB, SECRET_KEY);
  const now = nowIso();
  await env.DB.prepare(
    `UPDATE crm_gbp_connections SET owner_email = ?, refresh_token = ?, access_token = ?, expires_at = ?,
       account_name = '', location_name = '', location_title = '',
       status = 'connected', last_error = '', pending_state = '', pending_email = '', pending_at = NULL, updated_at = ?
     WHERE account_id = ?`,
  ).bind(
    ownerEmail,
    await encryptSecret(key, String(body.refresh_token)),
    await encryptSecret(key, String(body.access_token)),
    new Date(Date.now() + (Number(body.expires_in) || 3600) * 1000).toISOString(),
    now, accountId,
  ).run();
  return { ok: true, data: true };
}

/** A usable access token, refreshed when the stored one is about to expire. */
async function gbpToken(env: Env, accountId: string): Promise<GResult<string>> {
  const row = await env.DB.prepare(
    "SELECT refresh_token AS refresh, access_token AS access, expires_at AS expires FROM crm_gbp_connections WHERE account_id = ? AND status IN ('connected', 'error') AND refresh_token != ''",
  ).bind(accountId).first<{ refresh: string; access: string; expires: string | null }>();
  if (!row) return { ok: false, code: 'gbp_none', error: 'Google Business Profile is not connected for this workspace.' };
  const key = await installSecret(env.DB, SECRET_KEY);
  if (row.access && row.expires && Date.parse(row.expires) - 60_000 > Date.now()) {
    try { return { ok: true, data: await decryptSecret(key, row.access) }; } catch { /* re-mint below */ }
  }
  const c = await googleCreds(env);
  if (!c) return { ok: false, code: 'no_client', error: 'No Google client is configured for this installation.' };
  let refresh: string;
  try { refresh = await decryptSecret(key, row.refresh); }
  catch { return { ok: false, code: 'gbp_unreadable', error: 'The stored Business Profile credential could not be read. Connect it again.' }; }
  const { res, body } = await gfetch(urls(env).token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: refresh, grant_type: 'refresh_token' }),
  });
  if (!res?.ok || !body.access_token) {
    const why = String(body.error_description ?? body.error ?? 'Google refused to refresh the connection.');
    /* Marked, so the screen says "connect again" rather than failing every
       check from now on with the same opaque error. */
    await env.DB.prepare("UPDATE crm_gbp_connections SET status = 'error', last_error = ?, updated_at = ? WHERE account_id = ?")
      .bind(`Google refused the stored connection (${why}). Connect Business Profile again.`.slice(0, 300), nowIso(), accountId).run();
    return { ok: false, code: 'gbp_expired', error: `Google refused the stored Business Profile connection (${why}). Connect it again.` };
  }
  await env.DB.prepare("UPDATE crm_gbp_connections SET access_token = ?, expires_at = ?, status = 'connected', last_error = '', updated_at = ? WHERE account_id = ?")
    .bind(await encryptSecret(key, String(body.access_token)), new Date(Date.now() + (Number(body.expires_in) || 3600) * 1000).toISOString(), nowIso(), accountId).run();
  return { ok: true, data: String(body.access_token) };
}

/**
 * Google's refusal of a Business Profile call, by name.
 *
 * An app whose API access request has not been approved gets a quota of zero
 * (429) or a 403 on every call — including on an account that is otherwise
 * perfectly connected. "Something went wrong" would send the customer looking
 * for a fault on their side that does not exist.
 */
function gbpError(status: number, body: GoogleError): { error: string; code: string } {
  const e = body.error ?? {};
  const msg = e.message ?? '';
  const reasons = (e.details ?? []).map(d => d.reason ?? '').join(' ');
  const quotaZero = status === 429 && (/quota/i.test(msg) || e.status === 'RESOURCE_EXHAUSTED');
  if (status === 403 || quotaZero || /SERVICE_DISABLED/.test(reasons)) {
    return { code: 'gbp_not_approved', error: `${NOT_APPROVED} Until it is, reviews are read through Places and replies are posted on Google by hand.${msg ? ` (Google said: ${msg.slice(0, 200)})` : ''}` };
  }
  if (status === 401) return { code: 'gbp_expired', error: 'Google no longer accepts this Business Profile connection. Connect it again.' };
  if (status === 404) return { code: 'not_found', error: 'Google could not find that location or review — it may have been removed.' };
  return { code: 'google', error: `Google Business Profile answered ${status}${msg ? `: ${msg.slice(0, 200)}` : ''}` };
}

async function gbpGet(env: Env, accountId: string, url: string): Promise<GResult<Record<string, unknown>>> {
  const t = await gbpToken(env, accountId);
  if (!t.ok || !t.data) return { ok: false, error: t.error, code: t.code };
  const { res, body, netError } = await gfetch(url, { headers: { Authorization: `Bearer ${t.data}` } });
  if (!res) return { ok: false, code: 'network', error: `Could not reach Google: ${netError}` };
  if (!res.ok) return { ok: false, ...gbpError(res.status, body as GoogleError) };
  return { ok: true, data: body };
}

export interface GbpLocation { id: string; account: string; location: string; title: string; address: string; placeId: string; mapsUrl: string }

/** Every location the connected Google user manages, across their accounts. */
export async function gbpLocations(env: Env, accountId: string): Promise<GResult<GbpLocation[]>> {
  const u = urls(env);
  const acc = await gbpGet(env, accountId, `${u.accounts}/v1/accounts`);
  if (!acc.ok) return { ok: false, error: acc.error, code: acc.code };
  const accounts = ((acc.data?.accounts ?? []) as { name?: string }[])
    .map(a => String(a.name ?? '')).filter(n => /^accounts\/[\w-]+$/.test(n)).slice(0, 20);
  const out: GbpLocation[] = [];
  for (const account of accounts) {
    const r = await gbpGet(env, accountId, `${u.info}/v1/${account}/locations?readMask=name,title,storefrontAddress,metadata&pageSize=100`);
    if (!r.ok) return { ok: false, error: r.error, code: r.code };
    for (const l of (r.data?.locations ?? []) as Record<string, unknown>[]) {
      const location = String(l.name ?? '');
      if (!/^locations\/[\w-]+$/.test(location)) continue;
      const addr = (l.storefrontAddress ?? {}) as { addressLines?: string[]; locality?: string; postalCode?: string };
      const meta = (l.metadata ?? {}) as { placeId?: string; mapsUri?: string };
      out.push({
        id: `${account}/${location}`, account, location,
        title: String(l.title ?? location).slice(0, 200),
        address: [...(addr.addressLines ?? []), addr.locality, addr.postalCode].filter(Boolean).join(', ').slice(0, 300),
        placeId: PLACE_ID_RE.test(String(meta.placeId ?? '')) ? String(meta.placeId) : '',
        mapsUrl: httpsOnly(meta.mapsUri),
      });
    }
  }
  return { ok: true, data: out };
}

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

/** The location's reviews, newest-updated first. `pages` caps how far back a first read goes. */
export async function gbpReviews(env: Env, accountId: string, accountName: string, locationName: string, pages: number): Promise<GResult<{ reviews: IncomingReview[]; rating: number | null; count: number | null }>> {
  const u = urls(env);
  const reviews: IncomingReview[] = [];
  let rating: number | null = null, count: number | null = null, pageToken = '';
  for (let i = 0; i < pages; i++) {
    const r = await gbpGet(env, accountId, `${u.v4}/v4/${accountName}/${locationName}/reviews?pageSize=50&orderBy=updateTime%20desc${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
    if (!r.ok) return { ok: false, error: r.error, code: r.code };
    const d = r.data ?? {};
    if (typeof d.averageRating === 'number') rating = d.averageRating;
    if (typeof d.totalReviewCount === 'number') count = d.totalReviewCount;
    for (const rv of (d.reviews ?? []) as Record<string, unknown>[]) {
      const reviewer = (rv.reviewer ?? {}) as { displayName?: string; profilePhotoUrl?: string; isAnonymous?: boolean };
      const reply = (rv.reviewReply ?? null) as { comment?: string; updateTime?: string } | null;
      const name = String(rv.name ?? '');
      if (!/^accounts\/[\w-]+\/locations\/[\w-]+\/reviews\/[\w-]+$/.test(name)) continue;
      reviews.push({
        source: 'google_business', extId: name,
        author: String(reviewer.displayName ?? 'A Google user').slice(0, 200),
        authorPhoto: httpsOnly(reviewer.profilePhotoUrl),
        rating: STARS[String(rv.starRating ?? '')] ?? 0,
        content: String(rv.comment ?? '').slice(0, 5000),
        time: typeof rv.createTime === 'string' ? rv.createTime : null,
        link: '',
        reply: String(reply?.comment ?? '').slice(0, 4096),
        replyTime: reply?.updateTime ?? null,
      });
    }
    pageToken = String(d.nextPageToken ?? '');
    if (!pageToken) break;
  }
  return { ok: true, data: { reviews, rating, count } };
}

/** Post (or replace) the owner's public reply to one review. */
export async function gbpReply(env: Env, accountId: string, reviewName: string, comment: string): Promise<GResult<true>> {
  if (!/^accounts\/[\w-]+\/locations\/[\w-]+\/reviews\/[\w-]+$/.test(reviewName)) return { ok: false, error: 'That review cannot be answered through Business Profile.' };
  const t = await gbpToken(env, accountId);
  if (!t.ok || !t.data) return { ok: false, error: t.error, code: t.code };
  const { res, body, netError } = await gfetch(`${urls(env).v4}/v4/${reviewName}/reply`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${t.data}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment }),
  });
  if (!res) return { ok: false, code: 'network', error: `Could not reach Google: ${netError}` };
  if (!res.ok) return { ok: false, ...gbpError(res.status, body as GoogleError) };
  return { ok: true, data: true };
}

/** Is there a live connection with a location chosen? */
export async function gbpLive(env: Env, accountId: string): Promise<{ account: string; location: string } | null> {
  const row = await env.DB.prepare(
    "SELECT account_name AS account, location_name AS location FROM crm_gbp_connections WHERE account_id = ? AND status = 'connected' AND location_name != '' AND account_name != ''",
  ).bind(accountId).first<{ account: string; location: string }>();
  return row ?? null;
}

/* ── Storing what was read ─────────────────────────────────────────────── */

export const reviewId = () => `rev-${newToken().slice(0, 24)}`;

/**
 * Store what Google returned. Returns the reviews that were new.
 *
 * `INSERT OR IGNORE` on (account, source, ext_id) is what makes a check safe to
 * run twice. A reply that appeared on Google since the last read — written
 * there by hand, or by a colleague — moves the review to `posted`, so it stops
 * being shown as waiting for an answer it already has.
 */
export async function storeReviews(env: Env, accountId: string, list: IncomingReview[]): Promise<{ added: (IncomingReview & { id: string })[]; repliesFound: number }> {
  const added: (IncomingReview & { id: string })[] = [];
  let repliesFound = 0;
  const now = nowIso();
  for (const r of list) {
    /*
     * The same review read first through Places and later through Business
     * Profile has two different ids. Google gives both the same author, stars
     * and timestamp, so the older row is adopted rather than shown twice.
     */
    if (r.source === 'google_business') {
      await env.DB.prepare(
        `UPDATE crm_reviews SET source = 'google_business', ext_id = ?, updated_at = ?
         WHERE id = (SELECT id FROM crm_reviews WHERE account_id = ? AND source = 'google_places' AND author = ? AND rating = ?
                     AND substr(COALESCE(review_time, ''), 1, 16) = substr(?, 1, 16) LIMIT 1)
           AND account_id = ?
           AND NOT EXISTS (SELECT 1 FROM crm_reviews WHERE account_id = ? AND source = 'google_business' AND ext_id = ?)`,
      ).bind(r.extId, now, accountId, r.author, r.rating, r.time ?? '', accountId, accountId, r.extId).run();
    }
    const id = reviewId();
    const ins = await env.DB.prepare(
      `INSERT OR IGNORE INTO crm_reviews
       (id, account_id, source, ext_id, platform, author, author_photo, rating, content, review_time, link, reply, reply_time, reply_state, created_at, updated_at)
       VALUES (?,?,?,?, 'google', ?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(id, accountId, r.source, r.extId, r.author, r.authorPhoto, r.rating, r.content, r.time, r.link,
      r.reply, r.replyTime, r.reply ? 'posted' : 'none', now, now).run();
    if ((ins.meta?.changes ?? 0) > 0) { added.push({ ...r, id }); continue; }
    if (r.reply) {
      const up = await env.DB.prepare(
        `UPDATE crm_reviews SET reply = ?, reply_time = ?, reply_state = 'posted', attention = 0, draft = '', note = '', updated_at = ?
         WHERE account_id = ? AND source = ? AND ext_id = ? AND (reply_state != 'posted' OR reply != ?)`,
      ).bind(r.reply, r.replyTime, now, accountId, r.source, r.extId, r.reply).run();
      if ((up.meta?.changes ?? 0) > 0) repliesFound++;
    }
  }
  return { added, repliesFound };
}

/* ── Drafting a reply ──────────────────────────────────────────────────── */

export interface Profile { name?: string; category?: string; description?: string; tone?: string; signature?: string; knowledge?: string; reviewLinks?: Record<string, string> }
export interface Rule { id?: string; enabled?: boolean; minRating?: number; maxRating?: number; mode?: 'auto_send' | 'draft' | 'alert'; instruction?: string }

const parse = <T>(raw: string | null, fallback: T): T => { try { return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; } };
export const loadProfile = async (env: Env, accountId: string) => parse<Profile>(await dataGet(env.DB, accountId, 'crm_reputation_profile'), {});
/**
 * The rules the customer saved — and none if they never saved any.
 *
 * The screen shows suggested rules before the first save; they are not the
 * customer's until they press Save, and a rule that posts publicly in their
 * name must not run on a suggestion they may never have read.
 */
export const loadRules = async (env: Env, accountId: string) => {
  const r = parse<Rule[]>(await dataGet(env.DB, accountId, 'crm_reputation_rules'), []);
  return Array.isArray(r) ? r : [];
};
export const matchRule = (rules: Rule[], rating: number): Rule | null =>
  rules.find(r => r.enabled && rating >= Number(r.minRating ?? 1) && rating <= Number(r.maxRating ?? 5)) ?? null;

/** An AI reply on the operator's (or the workspace's) key, on the server. */
export async function draftReply(env: Env, accountId: string, profile: Profile, review: { author: string; rating: number; content: string }, instruction: string): Promise<GResult<string>> {
  const refused = await aiBudget(env, accountId);
  if (refused) return { ok: false, code: 'ai_budget', error: refused };
  const key = await loadAiKey(env, accountId);
  if (!key) return { ok: false, code: 'no_ai', error: 'No AI key is available to this workspace, so a reply cannot be drafted. Write it yourself, or add a key in Settings → AI Engine.' };
  const prompt = `You are the owner/manager of a business replying publicly to a customer review on Google. Write a short, sincere public reply.

=== BUSINESS ===
Name: ${profile.name || '(unspecified)'}
Category: ${profile.category || '(unspecified)'}
About: ${profile.description || '(unspecified)'}
Facts/policies you may reference: ${profile.knowledge || '(none)'}

=== STYLE ===
Tone: ${profile.tone || 'warm'}. 2-4 sentences. Address the reviewer by first name. Sound human, not templated.
- 4-5 stars: thank them specifically, reference something from their review, invite them back.
- 3 stars: thank them, acknowledge the mixed experience, show you want to improve.
- 1-2 stars: apologize sincerely, do NOT be defensive, take it offline (invite them to contact you), promise to make it right. Never argue or blame the customer.
Do not invent specifics not supported by the business facts above.
${instruction ? `Extra instruction: ${instruction.slice(0, 500)}` : ''}
${profile.signature ? `End with: ${profile.signature}` : ''}

=== REVIEW ===
${review.author} · ${review.rating}★
"${review.content.slice(0, 3000) || '(a star rating with no words)'}"

Return ONLY JSON: {"reply": "the public reply text"}`;
  const r = await askGemini(key, prompt, 0.6);
  if (!r.ok) return { ok: false, code: 'ai', error: r.error || 'The AI could not draft a reply.' };
  const reply = extractJson<{ reply?: string }>(r.text)?.reply?.trim() ?? '';
  return reply ? { ok: true, data: reply.slice(0, 4000) } : { ok: false, code: 'ai', error: 'The AI answered without a reply in it. Try again.' };
}

/**
 * Apply the customer's rules to reviews that just arrived.
 *
 * At most `maxAi` drafts per call: a location that gathered forty reviews
 * overnight should not spend forty AI calls on one tick, and the rest are
 * flagged rather than silently skipped.
 */
export async function applyRules(env: Env, accountId: string, added: (IncomingReview & { id: string })[], maxAi = 8): Promise<{ alerted: number; drafted: number; posted: number; notes: string[] }> {
  const out = { alerted: 0, drafted: 0, posted: 0, notes: [] as string[] };
  const fresh = added.filter(r => !r.reply && r.rating > 0);
  if (!fresh.length) return out;
  const rules = await loadRules(env, accountId);
  if (!rules.length) return out;
  const profile = await loadProfile(env, accountId);
  const live = await gbpLive(env, accountId);
  let aiLeft = maxAi;
  const set = (id: string, cols: string, ...vals: unknown[]) =>
    env.DB.prepare(`UPDATE crm_reviews SET ${cols}, updated_at = ? WHERE id = ? AND account_id = ?`).bind(...vals, nowIso(), id, accountId).run();

  for (const r of fresh) {
    const rule = matchRule(rules, r.rating);
    if (!rule) continue;
    if (rule.mode === 'alert') {
      await set(r.id, 'attention = 1, note = ?', `Flagged by your rule for ${r.rating}★ reviews.`);
      out.alerted++;
      continue;
    }
    if (aiLeft <= 0) {
      await set(r.id, 'attention = 1, note = ?', 'Too many new reviews arrived at once to draft them all — press "AI reply" to draft this one.');
      continue;
    }
    aiLeft--;
    const d = await draftReply(env, accountId, profile, r, String(rule.instruction ?? ''));
    if (!d.ok || !d.data) {
      await set(r.id, 'attention = 1, note = ?', `Your rule asked for a draft, but it could not be written: ${d.error}`);
      out.notes.push(d.error ?? 'AI draft failed');
      continue;
    }
    if (rule.mode === 'draft') {
      await set(r.id, "draft = ?, reply_state = 'draft', note = ?", d.data, 'Drafted by your rule — read it, then post.');
      out.drafted++;
      continue;
    }
    /* auto_send: only Business Profile can post, and only for a review read through it. */
    if (r.source === 'google_business' && live) {
      const p = await gbpReply(env, accountId, r.extId, d.data);
      if (p.ok) {
        await set(r.id, "reply = ?, reply_time = ?, reply_state = 'posted', draft = '', auto = 1, attention = 0, note = ''", d.data, nowIso());
        out.posted++;
        continue;
      }
      await set(r.id, "draft = ?, reply_state = 'draft', attention = 1, note = ?", d.data, `Not posted automatically: ${p.error}`);
      out.notes.push(p.error ?? 'Reply not posted');
      continue;
    }
    await set(r.id, "draft = ?, reply_state = 'draft', attention = 1, note = ?", d.data,
      'Not posted automatically: Google only accepts replies through a connected Business Profile. Copy the draft and post it on Google.');
    out.drafted++;
  }
  return out;
}

/* ── One check ─────────────────────────────────────────────────────────── */

export interface CheckResult {
  ok: boolean; via: 'google_business' | 'google_places' | null;
  added: number; repliesFound: number; error: string; code: string; notes: string[];
  rules?: { alerted: number; drafted: number; posted: number };
}

/**
 * Read the workspace's reviews from wherever they can be read, now.
 *
 * Business Profile first when a location is chosen — it has every review and
 * the replies. If Google refuses it (most often: access not approved yet) and
 * a place is set, Places is read as well, so the screen still moves; the
 * refusal is reported, not swallowed.
 *
 * Rules run only on reviews that arrived after the first read of that source.
 * The first read of a location brings in years of history, and auto-replying
 * to a review from 2019 the moment somebody connects is not what anybody set a
 * rule for.
 */
export async function checkWorkspace(env: Env, accountId: string): Promise<CheckResult> {
  const out: CheckResult = { ok: false, via: null, added: 0, repliesFound: 0, error: '', code: '', notes: [] };
  const src = await env.DB.prepare('SELECT place_id AS placeId, place_name AS placeName, places_key AS ownKey FROM crm_review_sources WHERE account_id = ?')
    .bind(accountId).first<{ placeId: string; placeName: string; ownKey: string }>();
  const live = await gbpLive(env, accountId);
  if (!src && !live) return { ...out, code: 'no_source', error: 'No review source is set up yet. Find your business on Google in Reputation → Settings → Review sources.' };

  const hadAny = async (source: string) => !!(await env.DB.prepare('SELECT 1 AS n FROM crm_reviews WHERE account_id = ? AND source = ? LIMIT 1').bind(accountId, source).first());
  let rating: number | null = null, count: number | null = null, mapsUrl = '';
  const ruleTotals = { alerted: 0, drafted: 0, posted: 0 };
  const ingest = async (list: IncomingReview[], initial: boolean) => {
    const s = await storeReviews(env, accountId, list);
    out.added += s.added.length;
    out.repliesFound += s.repliesFound;
    if (!initial) {
      const r = await applyRules(env, accountId, s.added);
      ruleTotals.alerted += r.alerted; ruleTotals.drafted += r.drafted; ruleTotals.posted += r.posted;
      out.notes.push(...r.notes);
    }
  };

  let gbpError = '';
  if (live) {
    const initial = !(await hadAny('google_business'));
    const g = await gbpReviews(env, accountId, live.account, live.location, initial ? 3 : 1);
    if (g.ok && g.data) {
      out.ok = true; out.via = 'google_business';
      rating = g.data.rating; count = g.data.count;
      await ingest(g.data.reviews, initial);
      await env.DB.prepare("UPDATE crm_gbp_connections SET last_error = '', updated_at = ? WHERE account_id = ?").bind(nowIso(), accountId).run();
    } else {
      gbpError = g.error ?? 'Business Profile could not be read.';
      out.code = g.code ?? 'gbp';
      await env.DB.prepare('UPDATE crm_gbp_connections SET last_error = ?, updated_at = ? WHERE account_id = ?').bind(gbpError.slice(0, 300), nowIso(), accountId).run();
    }
  }

  if (!out.ok && src?.placeId) {
    const key = await placesKeyFor(env, accountId);
    if (!key.ok) {
      out.code = out.code || key.code;
      out.error = gbpError ? `${gbpError} ${key.error}` : key.error;
    } else {
      const initial = !(await hadAny('google_places'));
      const p = await placeDetails(env, key.key, src.placeId, true);
      if (p.ok) await meterPlaces(env, accountId, 'reviews', key.whose);
      if (p.ok && p.data) {
        out.ok = true; out.via = 'google_places';
        rating = p.data.rating; count = p.data.count; mapsUrl = p.data.mapsUrl;
        await ingest(p.data.reviews, initial);
        if (gbpError) out.notes.push(gbpError);
        if (key.whose === 'workspace') {
          await env.DB.prepare('UPDATE crm_review_sources SET key_verified_at = COALESCE(key_verified_at, ?) WHERE account_id = ?').bind(nowIso(), accountId).run();
        } else {
          await markInstallKey(env, true);
        }
      } else {
        out.code = p.code ?? 'google';
        out.error = gbpError ? `${gbpError} Places also failed: ${p.error}` : (p.error ?? 'Google Places could not be read.');
        if (key.whose === 'install' && KEY_FAULT.test(out.code)) await markInstallKey(env, false, p.error ?? '');
      }
    }
  } else if (!out.ok) {
    out.error = gbpError || 'No review source is set up yet.';
  }

  if (out.ok) out.rules = ruleTotals;
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO crm_review_sources (account_id, last_checked_at, last_error, rating, review_count, maps_url, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(account_id) DO UPDATE SET last_checked_at = excluded.last_checked_at, last_error = excluded.last_error,
       rating = COALESCE(excluded.rating, crm_review_sources.rating),
       review_count = COALESCE(excluded.review_count, crm_review_sources.review_count),
       maps_url = CASE WHEN excluded.maps_url != '' THEN excluded.maps_url ELSE crm_review_sources.maps_url END,
       updated_at = excluded.updated_at`,
  ).bind(accountId, now, out.ok ? (gbpError ? gbpError.slice(0, 300) : '') : out.error.slice(0, 300), rating, count, mapsUrl, now, now).run();
  return out;
}

/** Refresh every competitor's rating and count. One request each, no reviews. */
export async function refreshCompetitors(env: Env, accountId: string): Promise<GResult<number>> {
  const key = await placesKeyFor(env, accountId);
  if (!key.ok) return { ok: false, code: key.code, error: key.error };
  const { results } = await env.DB.prepare('SELECT place_id AS placeId FROM crm_review_competitors WHERE account_id = ? LIMIT 10').bind(accountId).all<{ placeId: string }>();
  let n = 0;
  for (const c of results ?? []) {
    const d = await placeDetails(env, key.key, c.placeId, false);
    if (d.ok) await meterPlaces(env, accountId, 'reviews', key.whose);
    if (d.ok && d.data) {
      await env.DB.prepare('UPDATE crm_review_competitors SET name = ?, rating = ?, review_count = ?, maps_url = ?, last_error = \'\', updated_at = ? WHERE account_id = ? AND place_id = ?')
        .bind(d.data.name, d.data.rating, d.data.count, d.data.mapsUrl, nowIso(), accountId, c.placeId).run();
      n++;
    } else {
      await env.DB.prepare('UPDATE crm_review_competitors SET last_error = ?, updated_at = ? WHERE account_id = ? AND place_id = ?')
        .bind((d.error ?? '').slice(0, 300), nowIso(), accountId, c.placeId).run();
    }
  }
  await env.DB.prepare('UPDATE crm_review_sources SET competitors_at = ? WHERE account_id = ?').bind(nowIso(), accountId).run();
  return { ok: true, data: n };
}
