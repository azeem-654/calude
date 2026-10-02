/**
 * /api/reputation.php — reviews, read from Google and answered from here.
 *
 * POST is the JSON API; every action names a workspace and is checked with
 * `workspaceAccess`, and every review id is looked up together with that
 * workspace, so naming another tenant's id finds nothing. GET is Google's OAuth
 * redirect for Business Profile landing on a browser, so it answers with a
 * page — the same arrangement as routes/calendar.ts, and for the same reason:
 * only `/api/*` reaches the Worker at all.
 *
 * What may be read and what may be posted, and why, is in lib/reputation.ts.
 * The one rule worth repeating here: a key is never sent back. `status` says
 * whether one is set, and nothing more.
 */
import { body, fail, json } from '../lib/http';
import { dataGet, dataPut, nowIso, userFromToken, workspaceAccess, type Env, type SessionUser } from '../lib/db';
import { newToken, timingSafeEqual } from '../lib/crypto';
import { googleCreds } from '../lib/googleAuth';
import { rateLimit } from '../lib/rateLimit';
import { canSend, cannotSendReason } from '../lib/deliver';
import { loadMailbox } from './mailbox';
import {
  PLACE_ID_RE, checkWorkspace, resolvePlaceLink, draftReply, encryptKey, gbpAuthUrl, gbpConnect, gbpLive, gbpLocations, gbpReply,
  installPlacesKey, loadProfile, markInstallKey, placeDetails, placesKeyFor, refreshCompetitors, saveInstallPlacesKey, searchPlaces,
} from '../lib/reputation';
import { KEY_RE, meterPlaces, placesUsage } from '../lib/googlePlaces';
import { REQ_KEY, reviewLinkFor, sendReviewRequest } from '../lib/reputationTick';

interface Req {
  token?: string; accountId?: string; action?: string;
  query?: string; placeId?: string; placeName?: string; placesKey?: string; clearKey?: boolean; autoCheck?: boolean;
  reviewId?: string; instruction?: string; text?: string; location?: string; apiKey?: string;
  recipients?: { name?: string; email?: string }[]; platform?: string; refresh?: boolean; field?: string;
}

/** Where Google is told to come back to. Registered once in the Google console. */
const redirectFor = (origin: string) => `${origin}/api/reputation.php`;
const isOwner = (u: SessionUser) => u.role === 'agency' && !u.accountId;
const PENDING_TTL_MS = 30 * 60_000;

export async function handleReputation(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const origin = (env.APP_ORIGIN || url.origin).replace(/\/$/, '');
  if (req.method === 'GET') return callback(env, url, origin);

  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this needs a current session.', 401, { code: 'unauthorised' });
  const act = String(d.action ?? '');

  /* ── The install owner's Places key: install-wide, so no workspace ── */
  if (act === 'install_key_status' || act === 'save_install_key' || act === 'test_install_key') {
    if (!isOwner(user)) return fail('Only the owner of this installation can set this.', 403);
    if (act === 'save_install_key') {
      const k = String(d.apiKey ?? '').trim();
      if (!k) return fail('Paste the API key first.', 200, { field: 'places.installKey' });
      if (!KEY_RE.test(k)) return fail('That does not look like a Google API key — they start with "AIza" and are 39 characters long.', 200, { field: 'places.installKey' });
      await saveInstallPlacesKey(env, k);
    }
    if (act === 'test_install_key') {
      const inst = await installPlacesKey(env);
      if (!inst) return fail('No installation key is saved yet.', 200, { field: 'places.installKey' });
      const r = await searchPlaces(env, inst.key, 'Googleplex Mountain View');
      await markInstallKey(env, r.ok, r.ok ? '' : (r.error ?? ''));
      if (!r.ok) return fail(r.error ?? 'Google refused the key.', 200, { code: r.code });
    }
    const inst = await installPlacesKey(env);
    /* `checkedAt` is when Google last answered for it (the test, or a real
       call marking it); the usage is this month's calls on it, so the owner
       can see the bill coming. Neither says anything about the key itself. */
    return json({
      success: true, set: !!inst, status: inst?.status ?? 'none', lastError: inst?.lastError ?? '',
      checkedAt: inst && inst.status !== 'unknown' ? inst.updatedAt : null,
      usage: await placesUsage(env),
    });
  }

  const accountId = String(d.accountId ?? '').trim();
  const access = await workspaceAccess(env.DB, user, accountId);
  if (!access.ok) return fail(access.message ?? 'That workspace is not yours.', 403);

  /* Every Google call spends somebody's quota; this is generous for a person
     and a wall for a script. */
  if (!['status', 'reviews', 'requests', 'competitors'].includes(act) || d.refresh) {
    const v = await rateLimit(env, { what: 'reputation', who: accountId, max: 120, windowSeconds: 3600 });
    if (!v.allowed) return fail('That is a lot of Google requests for one workspace — try again in a few minutes.', 429);
  }

  if (act === 'status') return json({ success: true, ...(await statusOf(env, accountId)) });

  if (act === 'find_place') {
    /* Long enough for a pasted Maps link (they run to several hundred
       characters); a search itself is cut to 200 where it is sent. */
    const q = String(d.query ?? '').trim().slice(0, 2000);
    const field = d.field === 'rep.competitorSearch' ? 'rep.competitorSearch' : 'rep.search';
    if (q.length < 3) return fail('Type the business name and town, or paste its Google Maps link.', 200, { field });
    const key = await placesKeyFor(env, accountId);
    if (!key.ok) return fail(key.error, 200, { code: key.code });
    const linked = await resolvePlaceLink(env, key.key, q);
    if (linked) {
      await meterPlaces(env, accountId, 'reviews', key.whose, linked.calls);
      if (!linked.ok) return fail(linked.error ?? 'That link could not be read.', 200, { code: linked.code, field });
      return json({ success: true, places: linked.data ?? [], fromLink: true });
    }
    const r = await searchPlaces(env, key.key, q);
    if (r.ok) await meterPlaces(env, accountId, 'reviews', key.whose);
    if (!r.ok) return fail(r.error ?? 'Google could not search.', 200, { code: r.code });
    return json({ success: true, places: r.data ?? [] });
  }

  if (act === 'save_source') {
    const placeId = String(d.placeId ?? '').trim();
    if (placeId && !PLACE_ID_RE.test(placeId)) return fail('That is not a Google place ID — pick your business from the search.', 200, { field: 'rep.search' });
    const k = String(d.placesKey ?? '').trim();
    if (k && !KEY_RE.test(k)) return fail('That does not look like a Google API key — they start with "AIza" and are 39 characters long.', 200, { field: 'rep.placesKey' });
    const now = nowIso();
    await env.DB.prepare(
      `INSERT INTO crm_review_sources (account_id, created_at, updated_at) VALUES (?,?,?) ON CONFLICT(account_id) DO NOTHING`,
    ).bind(accountId, now, now).run();
    if (placeId) {
      const prev = await env.DB.prepare('SELECT place_id AS p FROM crm_review_sources WHERE account_id = ?').bind(accountId).first<{ p: string }>();
      await env.DB.prepare('UPDATE crm_review_sources SET place_id = ?, place_name = ?, updated_at = ? WHERE account_id = ?')
        .bind(placeId, String(d.placeName ?? '').trim().slice(0, 200), now, accountId).run();
      if (prev?.p && prev.p !== placeId) {
        /* A different business: its rating and its reviews are not this one's. */
        await env.DB.prepare("UPDATE crm_review_sources SET rating = NULL, review_count = NULL, last_checked_at = NULL, last_error = '', maps_url = '' WHERE account_id = ?").bind(accountId).run();
        await env.DB.prepare("DELETE FROM crm_reviews WHERE account_id = ? AND source = 'google_places'").bind(accountId).run();
      }
    }
    /* Blank keeps the stored key; only `clearKey` removes it. A new key clears
       the verified stamp — the next successful check sets it again. */
    if (k) {
      await env.DB.prepare('UPDATE crm_review_sources SET places_key = ?, key_verified_at = NULL, updated_at = ? WHERE account_id = ?')
        .bind(await encryptKey(env, k), now, accountId).run();
    } else if (d.clearKey) {
      await env.DB.prepare("UPDATE crm_review_sources SET places_key = '', key_verified_at = NULL, updated_at = ? WHERE account_id = ?").bind(now, accountId).run();
    }
    if (typeof d.autoCheck === 'boolean') {
      await env.DB.prepare('UPDATE crm_review_sources SET auto_check = ?, updated_at = ? WHERE account_id = ?').bind(d.autoCheck ? 1 : 0, now, accountId).run();
    }
    return json({ success: true, ...(await statusOf(env, accountId)) });
  }

  if (act === 'check_now') {
    /* A read with reviews is Google's dearest Places request. On the owner's
       key a person pressing Refresh is welcome; a script is not — the cron
       already reads every workspace on its own. */
    const k = await placesKeyFor(env, accountId);
    if (k.ok && k.whose === 'install' && !(await gbpLive(env, accountId))) {
      const v = await rateLimit(env, { what: 'reputation-check', who: accountId, max: 30, windowSeconds: 3600 });
      if (!v.allowed) return fail('Google has been checked a lot in the last hour for this workspace — new reviews are still read on their own every six hours. Try Refresh again later.', 429, { code: 'check_budget' });
    }
    const r = await checkWorkspace(env, accountId);
    const s = await statusOf(env, accountId);
    if (!r.ok) return fail(r.error, 200, { code: r.code, ...s });
    return json({ success: true, added: r.added, repliesFound: r.repliesFound, via: r.via, notes: r.notes.slice(0, 3), rules: r.rules, ...s });
  }

  if (act === 'reviews') {
    const live = await gbpLive(env, accountId);
    const src = await env.DB.prepare('SELECT maps_url AS m FROM crm_review_sources WHERE account_id = ?').bind(accountId).first<{ m: string }>();
    const { results } = await env.DB.prepare(
      `SELECT id, source, platform, author, author_photo AS authorPhoto, rating, content, review_time AS time, link,
              reply, reply_time AS replyTime, reply_state AS replyState, draft, attention, note, auto
       FROM crm_reviews WHERE account_id = ? ORDER BY COALESCE(review_time, created_at) DESC LIMIT 300`,
    ).bind(accountId).all<Record<string, unknown>>();
    return json({
      success: true,
      reviews: (results ?? []).map(r => ({
        ...r,
        link: r.link || src?.m || '',
        attention: !!r.attention, auto: !!r.auto,
        canPost: r.source === 'google_business' && !!live,
      })),
    });
  }

  /* ── One review: always found together with its workspace ── */
  const review = async () => env.DB.prepare(
    'SELECT id, source, ext_id AS extId, author, rating, content, link, reply_state AS replyState, draft FROM crm_reviews WHERE id = ? AND account_id = ?',
  ).bind(String(d.reviewId ?? ''), accountId).first<{ id: string; source: string; extId: string; author: string; rating: number; content: string; link: string; replyState: string; draft: string }>();
  const linkOf = async (r: { link: string }) => r.link || (await env.DB.prepare('SELECT maps_url AS m FROM crm_review_sources WHERE account_id = ?').bind(accountId).first<{ m: string }>())?.m || '';

  if (act === 'draft_reply') {
    const r = await review();
    if (!r) return fail('That review could not be found.', 404);
    const d2 = await draftReply(env, accountId, await loadProfile(env, accountId), r, String(d.instruction ?? ''));
    if (!d2.ok || !d2.data) return fail(d2.error ?? 'The reply could not be drafted.', 200, { code: d2.code });
    await env.DB.prepare(
      "UPDATE crm_reviews SET draft = ?, reply_state = CASE WHEN reply_state IN ('posted', 'posted_elsewhere') THEN reply_state ELSE 'draft' END, updated_at = ? WHERE id = ? AND account_id = ?",
    ).bind(d2.data, nowIso(), r.id, accountId).run();
    return json({ success: true, draft: d2.data });
  }

  if (act === 'reply') {
    const r = await review();
    if (!r) return fail('That review could not be found.', 404);
    const text = String(d.text ?? '').trim();
    if (!text) return fail('Write a reply first.', 200, { field: 'rep.reply' });
    if (text.length > 4000) return fail('Google takes replies of up to about 4,000 characters. Shorten this one.', 200, { field: 'rep.reply' });
    /* Kept whatever happens next, so a refusal never loses what was written. */
    await env.DB.prepare("UPDATE crm_reviews SET draft = ?, reply_state = CASE WHEN reply_state = 'none' THEN 'draft' ELSE reply_state END, updated_at = ? WHERE id = ? AND account_id = ?")
      .bind(text, nowIso(), r.id, accountId).run();
    const live = await gbpLive(env, accountId);
    if (r.source !== 'google_business' || !live) {
      return fail(
        'Google only accepts a reply from the business owner through Business Profile, which is not connected here. '
        + 'Copy your reply, open the review on Google, post it there, then press "Mark as replied".',
        200, { code: 'cannot_post', link: await linkOf(r) },
      );
    }
    const p = await gbpReply(env, accountId, r.extId, text);
    if (!p.ok) return fail(p.error ?? 'Google did not accept the reply.', 200, { code: p.code, link: await linkOf(r) });
    await env.DB.prepare(
      "UPDATE crm_reviews SET reply = ?, reply_time = ?, reply_state = 'posted', draft = '', attention = 0, note = '', updated_at = ? WHERE id = ? AND account_id = ?",
    ).bind(text, nowIso(), nowIso(), r.id, accountId).run();
    return json({ success: true, replyState: 'posted' });
  }

  if (act === 'mark_replied') {
    const r = await review();
    if (!r) return fail('That review could not be found.', 404);
    const text = (String(d.text ?? '').trim() || r.draft).slice(0, 4000);
    await env.DB.prepare(
      "UPDATE crm_reviews SET reply = ?, reply_time = ?, reply_state = 'posted_elsewhere', draft = '', attention = 0, note = '', updated_at = ? WHERE id = ? AND account_id = ?",
    ).bind(text, nowIso(), nowIso(), r.id, accountId).run();
    return json({ success: true, replyState: 'posted_elsewhere' });
  }

  if (act === 'dismiss') {
    const r = await review();
    if (!r) return fail('That review could not be found.', 404);
    await env.DB.prepare("UPDATE crm_reviews SET attention = 0, note = '', updated_at = ? WHERE id = ? AND account_id = ?").bind(nowIso(), r.id, accountId).run();
    return json({ success: true });
  }

  /* ── Competitors ── */
  if (act === 'competitors') {
    if (d.refresh) {
      const r = await refreshCompetitors(env, accountId);
      if (!r.ok) return fail(r.error ?? 'Could not refresh.', 200, { code: r.code, competitors: await competitorsOf(env, accountId) });
    }
    return json({ success: true, competitors: await competitorsOf(env, accountId) });
  }
  if (act === 'add_competitor') {
    const placeId = String(d.placeId ?? '').trim();
    if (!PLACE_ID_RE.test(placeId)) return fail('Pick the business from the search results.', 200, { field: 'rep.competitorSearch' });
    const have = await env.DB.prepare('SELECT COUNT(*) AS n FROM crm_review_competitors WHERE account_id = ?').bind(accountId).first<{ n: number }>();
    if ((have?.n ?? 0) >= 5) return fail('Up to five competitors can be compared. Remove one first.');
    const key = await placesKeyFor(env, accountId);
    if (!key.ok) return fail(key.error, 200, { code: key.code });
    const p = await placeDetails(env, key.key, placeId, false);
    if (p.ok) await meterPlaces(env, accountId, 'reviews', key.whose);
    if (!p.ok || !p.data) return fail(p.error ?? 'Google could not find that business.', 200, { code: p.code });
    await env.DB.prepare(
      `INSERT INTO crm_review_competitors (account_id, place_id, name, rating, review_count, maps_url, updated_at) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(account_id, place_id) DO UPDATE SET name = excluded.name, rating = excluded.rating, review_count = excluded.review_count, maps_url = excluded.maps_url, last_error = '', updated_at = excluded.updated_at`,
    ).bind(accountId, placeId, p.data.name, p.data.rating, p.data.count, p.data.mapsUrl, nowIso()).run();
    return json({ success: true, competitors: await competitorsOf(env, accountId) });
  }
  if (act === 'remove_competitor') {
    await env.DB.prepare('DELETE FROM crm_review_competitors WHERE account_id = ? AND place_id = ?').bind(accountId, String(d.placeId ?? '')).run();
    return json({ success: true, competitors: await competitorsOf(env, accountId) });
  }

  /* ── Business Profile ── */
  if (act === 'gbp_connect') {
    const creds = await googleCreds(env);
    if (!creds) return fail('No Google client is configured for this installation, so Business Profile cannot be connected yet. The owner of this app sets it up in Settings → Platform services.', 200, { code: 'no-client' });
    const ownerEmail = user.email.toLowerCase();
    const nonce = newToken();
    const sig = newToken().slice(0, 24);
    const now = nowIso();
    await env.DB.prepare(
      `INSERT INTO crm_gbp_connections (account_id, pending_email, pending_state, pending_at, created_at, updated_at) VALUES (?,?,?,?,?,?)
       ON CONFLICT(account_id) DO UPDATE SET pending_email = excluded.pending_email, pending_state = excluded.pending_state, pending_at = excluded.pending_at, updated_at = excluded.updated_at`,
    ).bind(accountId, ownerEmail, `${nonce}|${sig}`, now, now, now).run();
    return json({ success: true, url: gbpAuthUrl(creds.clientId, redirectFor(origin), `${accountId}|${ownerEmail}|${nonce}|${sig}`) });
  }
  if (act === 'gbp_locations') {
    const r = await gbpLocations(env, accountId);
    if (!r.ok) return fail(r.error ?? 'Google could not list your locations.', 200, { code: r.code });
    return json({ success: true, locations: r.data ?? [] });
  }
  if (act === 'gbp_choose') {
    const want = String(d.location ?? '').trim();
    const r = await gbpLocations(env, accountId);
    if (!r.ok) return fail(r.error ?? 'Google could not list your locations.', 200, { code: r.code });
    /* Chosen from what Google says this person manages — never a name taken
       on trust from the request. */
    const loc = (r.data ?? []).find(l => l.id === want);
    if (!loc) return fail('Pick one of the locations Google listed for your account.', 200, { field: 'rep.gbpLocation' });
    const now = nowIso();
    await env.DB.prepare('UPDATE crm_gbp_connections SET account_name = ?, location_name = ?, location_title = ?, last_error = \'\', updated_at = ? WHERE account_id = ?')
      .bind(loc.account, loc.location, loc.title, now, accountId).run();
    await env.DB.prepare(
      `INSERT INTO crm_review_sources (account_id, place_id, place_name, maps_url, created_at, updated_at) VALUES (?,?,?,?,?,?)
       ON CONFLICT(account_id) DO UPDATE SET
         place_id = CASE WHEN crm_review_sources.place_id = '' THEN excluded.place_id ELSE crm_review_sources.place_id END,
         place_name = CASE WHEN crm_review_sources.place_name = '' THEN excluded.place_name ELSE crm_review_sources.place_name END,
         maps_url = CASE WHEN excluded.maps_url != '' THEN excluded.maps_url ELSE crm_review_sources.maps_url END,
         updated_at = excluded.updated_at`,
    ).bind(accountId, loc.placeId, loc.title, loc.mapsUrl, now, now).run();
    return json({ success: true, ...(await statusOf(env, accountId)) });
  }
  if (act === 'gbp_disconnect') {
    await env.DB.prepare('DELETE FROM crm_gbp_connections WHERE account_id = ?').bind(accountId).run();
    return json({ success: true, ...(await statusOf(env, accountId)) });
  }

  /* ── Review requests ── */
  if (act === 'requests') {
    let list: unknown[];
    try { list = JSON.parse(await dataGet(env.DB, accountId, REQ_KEY) ?? '[]') as unknown[]; } catch { list = []; }
    return json({ success: true, requests: Array.isArray(list) ? list.slice(-300).reverse() : [] });
  }
  if (act === 'send_requests') {
    const recipients = (Array.isArray(d.recipients) ? d.recipients : []).slice(0, 50);
    if (!recipients.length) return fail('Select at least one contact.');
    const profile = await loadProfile(env, accountId);
    const platform = String(d.platform ?? 'google');
    const target = reviewLinkFor(profile, platform);
    if (!target || target.platform !== platform) return fail(`Add a ${platform} review link (starting https://) in Reputation → Settings → Review sources first.`, 200, { code: 'no_link' });
    const mb = await loadMailbox(env, accountId);
    if (!canSend(mb)) return fail(cannotSendReason(mb), 200, { code: 'no_mailbox' });
    const v = await rateLimit(env, { what: 'review-requests', who: accountId, max: 20, windowSeconds: 3600 });
    if (!v.allowed) return fail('That is a lot of review requests in an hour — try again later.', 429);
    let list: Record<string, unknown>[];
    try { list = JSON.parse(await dataGet(env.DB, accountId, REQ_KEY) ?? '[]') as Record<string, unknown>[]; } catch { list = []; }
    if (!Array.isArray(list)) list = [];
    let sent = 0;
    const failures: string[] = [];
    for (const r of recipients) {
      const name = String(r?.name ?? '').slice(0, 120);
      const email = String(r?.email ?? '').trim();
      const res = await sendReviewRequest(env, accountId, mb, profile, { name, email }, target.link, origin);
      if (res.ok) sent++; else failures.push(`${email || name}: ${res.error}`);
      list.push({
        id: `req-${newToken().slice(0, 16)}`, contactName: name, email, platform,
        status: res.ok ? 'sent' : 'failed', sentAt: nowIso(), error: res.ok ? '' : res.error.slice(0, 300),
        source: { origin: 'user', title: 'Request reviews', at: nowIso() },
      });
    }
    await dataPut(env.DB, accountId, REQ_KEY, JSON.stringify(list.slice(-1000)));
    return json({ success: sent > 0, sent, failed: failures.length, failures: failures.slice(0, 5), ...(sent ? {} : { error: failures[0] ?? 'Nothing was sent.', message: failures[0] ?? 'Nothing was sent.' }) });
  }

  return fail('Unknown action.', 400);
}

async function competitorsOf(env: Env, accountId: string) {
  const { results } = await env.DB.prepare(
    'SELECT place_id AS placeId, name, rating, review_count AS reviewCount, maps_url AS mapsUrl, last_error AS lastError, updated_at AS updatedAt FROM crm_review_competitors WHERE account_id = ? ORDER BY name',
  ).bind(accountId).all();
  return results ?? [];
}

/** What the screen needs to draw itself. Never a key — whether one is set, and that is all. */
async function statusOf(env: Env, accountId: string) {
  const src = await env.DB.prepare(
    `SELECT place_id AS placeId, place_name AS placeName, maps_url AS mapsUrl, places_key != '' AS ownKey, key_verified_at AS keyVerifiedAt,
            auto_check AS autoCheck, last_checked_at AS lastCheckedAt, last_error AS lastError, rating, review_count AS reviewCount
     FROM crm_review_sources WHERE account_id = ?`,
  ).bind(accountId).first<Record<string, unknown>>();
  const gbp = await env.DB.prepare(
    'SELECT owner_email AS ownerEmail, status, location_name AS location, account_name AS account, location_title AS title, last_error AS lastError FROM crm_gbp_connections WHERE account_id = ?',
  ).bind(accountId).first<{ ownerEmail: string; status: string; location: string; account: string; title: string; lastError: string }>();
  const counts = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN reply_state IN ('none', 'draft') THEN 1 ELSE 0 END) AS unanswered,
            SUM(attention) AS attention
     FROM crm_reviews WHERE account_id = ?`,
  ).bind(accountId).first<{ total: number; unanswered: number | null; attention: number | null }>();
  return {
    source: src ? {
      placeId: String(src.placeId ?? ''), placeName: String(src.placeName ?? ''), mapsUrl: String(src.mapsUrl ?? ''),
      ownKey: !!src.ownKey, ownKeyVerified: !!src.keyVerifiedAt, autoCheck: !!src.autoCheck,
      lastCheckedAt: (src.lastCheckedAt as string | null) ?? null, lastError: String(src.lastError ?? ''),
      rating: (src.rating as number | null) ?? null, reviewCount: (src.reviewCount as number | null) ?? null,
    } : null,
    installKey: !!(await installPlacesKey(env)),
    gbp: {
      configured: !!(await googleCreds(env)),
      status: gbp?.status ?? 'none',
      ownerEmail: gbp?.status === 'connected' || gbp?.status === 'error' ? gbp.ownerEmail : '',
      location: gbp?.location ? { id: `${gbp.account}/${gbp.location}`, title: gbp.title } : null,
      lastError: gbp?.lastError ?? '',
    },
    counts: { total: counts?.total ?? 0, unanswered: counts?.unanswered ?? 0, attention: counts?.attention ?? 0 },
    placesReviewLimit: 5,
  };
}

/** Google's redirect back after Business Profile consent. Mirrors routes/calendar.ts. */
async function callback(env: Env, url: URL, origin: string): Promise<Response> {
  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';
  const denied = url.searchParams.get('error');
  const esc = (x: string) => x.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));
  const page = (title: string, detail: string) => new Response(
    `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>`
    + '<body style="font-family:system-ui;padding:48px;max-width:32rem;margin:0 auto;color:#0f172a">'
    + `<h1 style="font-size:20px">${esc(title)}</h1>`
    + `<p style="color:#64748b;line-height:1.6">${esc(detail)}</p>`
    + `<p><a href="${esc(origin)}/reputation" style="color:#5b46e5">Back to Reviews</a></p>`
    + '</body>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'", 'X-Content-Type-Options': 'nosniff' } },
  );
  if (denied) return page('Business Profile not connected', 'Google was not given permission, so nothing was changed.');

  /* The state carries who asked, and a nonce the server stored when they did;
     a stray or replayed callback cannot attach a Google account to a workspace
     that never asked. */
  const [accountId, ownerEmail, nonce, sig] = state.split('|');
  if (!accountId || !ownerEmail || !nonce || !sig || !code) return page('Business Profile not connected', 'That link was incomplete.');
  const row = await env.DB.prepare(
    "SELECT pending_state AS p, pending_at AS at FROM crm_gbp_connections WHERE account_id = ? AND pending_email = ? AND pending_state != ''",
  ).bind(accountId, ownerEmail).first<{ p: string; at: string | null }>();
  if (!row || !timingSafeEqual(row.p, `${nonce}|${sig}`) || !row.at || Date.now() - Date.parse(row.at) > PENDING_TTL_MS) {
    return page('Business Profile not connected', 'That connection request could not be matched, or it is too old. Start again from the app.');
  }
  /* Spent before the exchange, so the same callback cannot be used twice. */
  await env.DB.prepare("UPDATE crm_gbp_connections SET pending_state = '', pending_at = NULL WHERE account_id = ?").bind(accountId).run();
  const res = await gbpConnect(env, accountId, ownerEmail, code, redirectFor(origin));
  return res.ok
    ? page('Business Profile connected', 'Go back to Reviews and choose which of your locations this workspace is.')
    : page('Business Profile not connected', res.error ?? 'Google refused the connection.');
}
