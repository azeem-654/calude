/**
 * Open and click tracking.
 *
 * A single-page app has no server of its own, so an open can never be detected
 * from the browser: the recipient is in their mail client, not on the site.
 * Outbound messages embed a 1×1 pixel and wrap their links, both pointing
 * here, and the app polls `events` to fold the results back into each
 * contact's history.
 *
 *   GET ?o=<emailId>&a=<accountId>          → 1×1 GIF, records an open
 *   GET ?c=<emailId>&a=<accountId>&u=<url>  → 302 to url, records a click
 *   GET ?events=1&a=<accountId>&since=<iso> → JSON, for syncing
 *
 * Everything except `events` is fetched by a mail client or a recipient's
 * browser, so it cannot require a session. That is not a hole — the worst an
 * anonymous caller can do is record a fake open on an id they would have to
 * guess. Reading the events back is what needs the session, and does.
 */
import { corsHeaders, fail, json } from '../lib/http';
import { canAccess, nowIso, userFromToken, type Env } from '../lib/db';

/* The smallest transparent GIF there is. Served with no-store so a mail
   client's proxy cache does not swallow the second open of the same message. */
const PIXEL = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
  0x44, 0x01, 0x00, 0x3b,
]);

const ID_OK = /^[A-Za-z0-9_.\-:]{1,120}$/;

function pixel(): Response {
  return new Response(PIXEL, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
    },
  });
}

async function record(
  env: Env, accountId: string, emailId: string, kind: 'open' | 'click', url: string, ua: string,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO crm_track (account_id, kind, email_id, url, at, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(accountId, kind, emailId, url.slice(0, 2000), nowIso(), ua.slice(0, 180)).run();
}

export async function handleTrack(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const account = (url.searchParams.get('a') ?? '').slice(0, 64);
  const ua = req.headers.get('User-Agent') ?? '';

  /* ── Sync: the only branch that reads anything back, so the only one that
        needs to prove who is asking. ── */
  if (url.searchParams.get('events')) {
    const token = url.searchParams.get('token') ?? undefined;
    const user = await userFromToken(env.DB, token);
    if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });
    if (!canAccess(user, account)) return fail('That workspace is not yours to read.', 403);

    const since = url.searchParams.get('since') || '1970-01-01T00:00:00.000Z';
    const { results } = await env.DB.prepare(
      `SELECT kind, email_id AS emailId, url, at
         FROM crm_track
        WHERE account_id = ? AND at > ?
        ORDER BY at
        LIMIT 5000`,
    ).bind(account, since).all();
    return json({ success: true, events: results ?? [] });
  }

  /* ── An open ── */
  const openId = url.searchParams.get('o');
  if (openId) {
    /* A malformed id is dropped rather than stored: this endpoint is public,
       and the pixel still has to be returned either way so the message does
       not render with a broken image. */
    if (ID_OK.test(openId) && account) {
      await record(env, account, openId, 'open', '', ua).catch(() => {});
    }
    return pixel();
  }

  /* ── A click ── */
  const clickId = url.searchParams.get('c');
  const target = url.searchParams.get('u') ?? '';
  if (clickId) {
    let dest: URL | null = null;
    try {
      const parsed = new URL(target);
      /* Only http(s) is followed. Redirecting to whatever arrives in a query
         string turns every tracked link in every campaign into an open
         redirect — a phisher borrows the customer's domain for free. */
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') dest = parsed;
    } catch { /* not a URL */ }

    if (ID_OK.test(clickId) && account && dest) {
      await record(env, account, clickId, 'click', dest.toString(), ua).catch(() => {});
    }
    if (!dest) {
      return new Response('That link is not one this tracker can follow.', {
        status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    return Response.redirect(dest.toString(), 302);
  }

  return new Response(JSON.stringify({ success: false, error: 'Nothing to track in that request.' }), {
    status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
