/**
 * /api/prospects.php — finding businesses, and reading their published contacts.
 *
 * ── Two maps, one door ──
 *
 * `search` reads **Google Maps** by default (Places API (New), lib/googlePlaces.ts)
 * on the workspace's own key or, far more often, the one the install owner set
 * in Settings → Platform services; `source: 'osm'` reads OpenStreetMap instead.
 * The AI Sales Agent's lead search comes through here too (one line of text,
 * `query`), so there is one place that decides whose key is spent and whether
 * it may be.
 *
 * ── Why the fetching happens here ──
 *
 * Because a browser must not hold the key, and cannot read Overpass or most
 * business websites anyway (no CORS). One server, one budget, one meter.
 *
 * ── What protects the owner's key ──
 *
 * A session and a workspace the caller may touch (`workspaceAccess`), always.
 * The key is never taken from the request. When the owner's key is the one
 * being spent: an ended trial stops it, and `placesBudget` caps each workspace.
 * Each refusal says which by name (`no_key`, `trial_ended`, `places_budget`).
 *
 * ── What this endpoint will not do ──
 *
 * Guess an address. It would be easy to turn a name and a domain into
 * `firstname@company.com` and it is what the paid tools do — and it is how a
 * sending domain earns a bounce rate that gets its mail filed as spam
 * everywhere. Only addresses a business chose to publish come back from here.
 */
import { body, fail, json } from '../lib/http';
import { userFromToken, workspaceAccess, type Env } from '../lib/db';
import { findContacts, searchProspects } from '../lib/prospects';
import { rateLimit } from '../lib/rateLimit';
import { GEOAPIFY_ATTRIBUTION, installGeoKey, markGeoKey, searchGeoapify } from '../lib/geoapify';
import {
  KEY_FAULT, NO_KEY_PROSPECTS, PAGE_TOKEN_RE, markInstallKey, meterPlaces, placesBudget, placesKeyFor, searchBusinesses,
} from '../lib/googlePlaces';

interface Req {
  token?: string;
  accountId?: string;
  action?: string;
  source?: string;
  trade?: string;
  place?: string;
  /** One line, as typed into Maps — the AI Sales Agent's search. */
  query?: string;
  pageToken?: string;
  websites?: string[];
}

export async function handleProspects(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });

  const accountId = String(d.accountId ?? '').trim();
  if (!accountId) return fail('A valid workspace is required.');
  const access = await workspaceAccess(env.DB, user, accountId);
  if (!access.ok) return fail(access.message ?? 'That workspace is not yours.', 403, { code: access.code });

  const act = String(d.action ?? '').trim();

  /*
   * Can this workspace search Google right now, and if not, why.
   *
   * Asked by the screen before anybody types, so "the owner has not set the
   * key" is said up front rather than after a search. Spends nothing.
   */
  if (act === 'status') {
    const key = await placesKeyFor(env, accountId, NO_KEY_PROSPECTS);
    return json({
      success: true,
      google: key.ok ? { available: true, whose: key.whose } : { available: false, code: key.code, error: key.error },
      /* The free directory is always there — Geoapify when the owner has set
         its key, OpenStreetMap's own servers when not. Said so the screen
         can name which. */
      free: { available: true, geoapify: !!(await installGeoKey(env)) },
    });
  }

  if (act === 'search') {
    /* 'auto' is the AI Sales Agent's: the free directory, which costs the
       owner nothing — Google only when it is asked for by name. */
    const asked = String(d.source ?? 'google');
    const source = asked === 'osm' ? 'osm' : asked === 'free' || asked === 'auto' ? 'free' : 'google';
    let line = String(d.query ?? '').trim().slice(0, 200);
    let trade = String(d.trade ?? '').trim().slice(0, 80);
    let place = String(d.place ?? '').trim().slice(0, 80);
    /* The free directory searches a kind of business inside a place, so one
       line ("dentists in Leeds") is split at its last "in", "near" or
       "around"; a line with none is refused below, by name. */
    if (source === 'free' && line) {
      const m = /^(.+?)\s+(?:in|near|around)\s+(.+)$/i.exec(line);
      if (m) { trade = m[1].trim().slice(0, 80); place = m[2].trim().slice(0, 80); line = ''; }
    }

    /* The boxes first, by name, before any key or budget is looked at: an empty
       box is the customer's to fix and costs nobody anything. */
    if (!line) {
      if (trade.replace(/[^\p{L}\p{N}]/gu, '').length < 2) return fail('Say what kind of business to look for.', 200, { field: 'prospects.trade' });
      if (place.replace(/[^\p{L}\p{N}]/gu, '').length < 2) return fail('Say where to look — a town or a city.', 200, { field: 'prospects.place' });
    } else if (line.length < 3) {
      return fail('Say what kind of business to look for, and where.');
    }

    if (source === 'free') {
      if (line) return fail('Say the kind of business and the place, like "dentists in Leeds".');
      for (const b of [{ what: 'free-prospects-hour', max: 40, windowSeconds: 3600 }, { what: 'free-prospects-day', max: 200, windowSeconds: 86_400 }]) {
        const v = await rateLimit(env, { ...b, who: accountId });
        if (!v.allowed) return fail(`That is a lot of searches — try again in ${Math.max(1, Math.ceil(v.retryAfter / 60))} minutes.`, 429, { code: 'rate_limited' });
      }
      const geo = await installGeoKey(env);
      if (geo) {
        const r = await searchGeoapify(env, geo.key, trade, place, String(d.pageToken ?? ''));
        if (r.ok) {
          if (geo.status !== 'ok' && !r.cached) await markGeoKey(env, true);
          return json({ success: true, source: 'free', prospects: r.prospects, cached: r.cached, nextPageToken: r.next, attribution: GEOAPIFY_ATTRIBUTION });
        }
        if (r.code === 'not_found') return fail(r.error, 200, { field: 'prospects.place' });
        /* A refused key is the owner's to fix and Platform services says so;
           the customer is not made to wait for that — nor for a spent day's
           credits, nor an outage. OpenStreetMap's own servers answer instead,
           and trades Geoapify has no category for (plumbers, roofers) were
           always going to be asked there. */
        if (r.code === 'bad_key') await markGeoKey(env, false, r.error);
      }
      /* Overpass matches a word against OSM's tags, and they are singular:
         "plumbers" finds nothing tagged craft=plumber. */
      const word = trade.toLowerCase().split(/\s+/).map(w => w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w).join(' ');
      const r = await searchProspects(env, word, place);
      if (r.error) return fail(r.error);
      return json({ success: true, source: 'osm', prospects: r.prospects, cached: r.cached, nextPageToken: '', attribution: '© OpenStreetMap contributors' });
    }

    if (source === 'osm') {
      /* Overpass is asked for a trade inside a named boundary, so it needs the
         two apart; one line of text is a Google search. */
      if (line) return fail('OpenStreetMap needs the kind of business and the place separately.');
      const r = await searchProspects(env, trade, place);
      if (r.error) return fail(r.error);
      return json({
        success: true,
        source: 'osm',
        prospects: r.prospects,
        cached: r.cached,
        nextPageToken: '',
        /* Required by the licence, and returned rather than hardcoded in the
           bundle so it travels with the data it belongs to. */
        attribution: '© OpenStreetMap contributors',
      });
    }

    const pageToken = String(d.pageToken ?? '');
    if (pageToken && !PAGE_TOKEN_RE.test(pageToken)) return fail('That page of results has expired — search again.');

    const key = await placesKeyFor(env, accountId, NO_KEY_PROSPECTS);
    if (!key.ok) return fail(key.error, 200, { code: key.code });
    if (key.whose === 'install') {
      const over = await placesBudget(env, accountId);
      if (over) return fail(over, 429, { code: 'places_budget' });
    }

    const r = await searchBusinesses(env, key.key, line || `${trade} in ${place}`, pageToken);
    if (!r.ok || !r.data) {
      /* A key Google refuses is the owner's to fix, and Platform services
         should say so before the next customer finds out the same way. */
      if (key.whose === 'install' && KEY_FAULT.test(r.code ?? '')) await markInstallKey(env, false, r.error ?? '');
      const own = key.whose === 'install'
        ? ' This search uses the Google Maps key the owner of this app provides — they have been told on their Platform services screen.'
        : '';
      return fail(`${r.error ?? 'Google Maps could not search.'}${KEY_FAULT.test(r.code ?? '') ? own : ''}`, 200, { code: r.code });
    }
    await meterPlaces(env, accountId, 'prospects', key.whose);
    return json({
      success: true,
      source: 'google',
      prospects: r.data.prospects,
      cached: false,
      nextPageToken: r.data.nextPageToken,
      /* Google's terms ask for its name wherever its results are shown off a
         Google map. */
      attribution: 'Google Maps',
    });
  }

  /*
   * Contact details for a handful at a time.
   *
   * Capped at eight because each one is up to three page fetches plus a DNS
   * lookup, and a Worker has a subrequest budget and a wall clock. The screen
   * asks for the rows somebody actually selected rather than the whole result
   * set, which is both faster and a smaller imposition on the sites being read.
   */
  if (act === 'contacts') {
    const sites = (Array.isArray(d.websites) ? d.websites : []).slice(0, 8).map(String);
    if (!sites.length) return fail('Nothing to look up.');
    const found: Record<string, { emails: string[]; mx: boolean | null }> = {};
    for (const site of sites) {
      found[site] = await findContacts(env, site);
    }
    return json({ success: true, contacts: found });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}
