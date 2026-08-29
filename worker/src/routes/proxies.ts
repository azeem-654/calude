/**
 * The three narrow proxies.
 *
 * None of these is a general-purpose fetcher, and each one's input validation
 * is the thing that keeps it from becoming one. A proxy that will fetch any
 * URL a caller names is a way to reach private addresses from inside the
 * platform's network and to borrow the customer's domain for someone else's
 * traffic — so every one of these can only ever build a URL on one host from
 * a strictly-shaped fragment.
 *
 * They exist at all because the app draws these images onto a <canvas>, and a
 * cross-origin image loaded directly taints it.
 */
import { fail, json } from '../lib/http';
import { requireSessionForSocket, type Env } from '../lib/db';

const DAY = 'public, max-age=86400';

/** A YouTube thumbnail. Ids are exactly 11 characters of a known alphabet. */
export async function handleYtThumb(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const id = q.get('id') ?? '';
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) {
    return new Response('bad id', { status: 400, headers: { 'Content-Type': 'text/plain' } });
  }

  const allowed = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault', 'hq1', 'hq2', 'hq3', 'sd1', 'sd2', 'sd3'];
  const frame = q.get('f') ?? '';
  /* YouTube generates several frames per video, so different clips of the same
     source can use different stills rather than repeating one image. */
  const candidates = allowed.includes(frame)
    ? [frame, 'hqdefault', 'mqdefault']
    : ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault'];

  for (const name of candidates) {
    try {
      const r = await fetch(`https://i.ytimg.com/vi/${id}/${name}.jpg`, { redirect: 'follow' });
      if (!r.ok) continue;
      const buf = await r.arrayBuffer();
      /* YouTube answers 200 with a tiny placeholder for a frame that does not
         exist, so size is what distinguishes a real thumbnail from a miss. */
      if (buf.byteLength < 1200) continue;
      return new Response(buf, {
        headers: {
          'Content-Type': r.headers.get('Content-Type') ?? 'image/jpeg',
          'Cache-Control': DAY,
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch { /* try the next frame */ }
  }
  return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
}

/** A keyword stock image, from one host, for B-roll and scene backgrounds. */
export async function handleImgProxy(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const keyword = (q.get('q') ?? '').trim();
  if (!/^[a-zA-Z0-9 ,\-]{2,40}$/.test(keyword)) {
    return new Response('bad keyword', { status: 400, headers: { 'Content-Type': 'text/plain' } });
  }
  const sig = Number(q.get('sig') ?? 0) || 0;
  const kw = encodeURIComponent(keyword.toLowerCase().replace(/ /g, ','));

  try {
    const r = await fetch(`https://loremflickr.com/800/450/${kw}?lock=${sig}`, { redirect: 'follow' });
    const buf = await r.arrayBuffer();
    if (r.ok && buf.byteLength > 500) {
      return new Response(buf, {
        headers: {
          'Content-Type': r.headers.get('Content-Type') ?? 'image/jpeg',
          'Cache-Control': DAY,
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  } catch { /* fall through */ }
  return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
}

/**
 * Google Places search, for the prospecting tool.
 *
 * Session-gated even though it only reads: it spends the customer's own Places
 * quota, and an open endpoint would let anyone else spend it.
 */
export async function handlePlacesSearch(req: Request, env: Env): Promise<Response> {
  const d = await req.json<{ token?: string; apiKey?: string; query?: string; pageToken?: string }>().catch(() => ({}) as Record<string, string>);
  const gate = await requireSessionForSocket(env.DB, d.token);
  if ('denied' in gate) return gate.denied;

  const apiKey = String(d.apiKey ?? '').trim();
  const query = String(d.query ?? '').trim();
  if (!apiKey) return fail('Add a Google Places API key in Settings → AI Engine to search for businesses.');
  if (query.length < 2) return fail('Enter something to search for.');

  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
  url.searchParams.set('query', query);
  url.searchParams.set('key', apiKey);
  if (d.pageToken) url.searchParams.set('pagetoken', String(d.pageToken));

  try {
    const r = await fetch(url.toString());
    const data = await r.json<{ status?: string; error_message?: string; results?: unknown[]; next_page_token?: string }>();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return fail(`Google Places: ${data.status ?? 'unknown error'} ${data.error_message ?? ''}`.trim());
    }
    return json({ success: true, results: data.results ?? [], nextPageToken: data.next_page_token ?? null });
  } catch (e) {
    return fail(`Could not reach Google Places: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Live Google reviews for the Reputation module.
 *
 * The PHP for this existed and worked but was never called from anywhere in
 * the app — the whole "live review sync" panel was decorative. Wired up here.
 */
export async function handleReviewsFetch(req: Request, env: Env): Promise<Response> {
  const d = await req.json<{ token?: string; googleApiKey?: string; placeId?: string }>().catch(() => ({}) as Record<string, string>);
  const gate = await requireSessionForSocket(env.DB, d.token);
  if ('denied' in gate) return gate.denied;

  const key = String(d.googleApiKey ?? '').trim();
  const placeId = String(d.placeId ?? '').trim();
  if (!key || !placeId) return fail('Google API key and Place ID are required.');

  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('fields', 'reviews,rating,user_ratings_total,name');
  url.searchParams.set('reviews_sort', 'newest');
  url.searchParams.set('key', key);

  try {
    const r = await fetch(url.toString());
    const data = await r.json<{
      status?: string; error_message?: string;
      result?: { name?: string; rating?: number; user_ratings_total?: number;
                 reviews?: { author_name?: string; rating?: number; text?: string; time?: number }[] };
    }>();
    if (data.status !== 'OK') {
      return fail(`Google API: ${data.status ?? 'unknown'} ${data.error_message ?? ''}`.trim());
    }
    const result = data.result ?? {};
    return json({
      success: true,
      name: result.name ?? '',
      rating: result.rating ?? 0,
      total: result.user_ratings_total ?? 0,
      reviews: (result.reviews ?? []).map(rv => ({
        author: rv.author_name ?? 'Anonymous',
        rating: Number(rv.rating ?? 0),
        content: rv.text ?? '',
        time: new Date((rv.time ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      })),
    });
  } catch (e) {
    return fail(`Could not reach Google: ${e instanceof Error ? e.message : String(e)}`);
  }
}
