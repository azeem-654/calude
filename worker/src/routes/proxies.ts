/**
 * The two narrow proxies. (The third, a Google Places search that took a key in
 * the request body, is gone: prospect search is /api/prospects.php now.)
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
