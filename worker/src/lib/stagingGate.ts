/**
 * The testing site's lock: a username and password in front of every page,
 * file and API call on the staging Worker, and nothing a search engine may index.
 *
 * ── Why a lock and not only "noindex" ──
 *
 * testing.protectedcentral.com carries unreleased screens, a TESTING banner and
 * the marketing site's copy at its root. A `noindex` keeps it out of search
 * results only for crawlers that honour it, and only after they have been told;
 * anybody with the address still saw everything. A lock answers both: a crawler
 * gets a 401 (never indexed) and a person needs the password.
 *
 * ── Why HTTP Basic, and a cookie after it ──
 *
 * Basic is what a browser understands with no page of ours involved — the lock
 * cannot be broken by a bundle that fails to load, because it runs before the
 * bundle is served (staging sets `run_worker_first: true` in wrangler.jsonc;
 * the live Worker does not, so static files there never reach this code). After
 * the first correct answer a cookie stands in for it, so a phone does not ask
 * again after every browser restart and a WebSocket or beacon that would not
 * repeat the Authorization header still gets through.
 *
 * ── Where the password lives ──
 *
 * Only a hash is committed (`STAGING_GATE_HASH` in the staging vars):
 * `sha256(key)` where `key = sha256("gate:" + user + ":" + password)`. The key
 * is also the cookie, so a browser that answered once holds something only the
 * password produces, and the committed hash — one step further on — cannot be
 * replayed as a cookie. The password is random and long enough that the hash
 * gives nothing away. The owner changes it by adding the Worker secret
 * `STAGING_GATE` = `user:password` on `crmpro-staging`, which wins over the
 * hash; changing either signs every browser out of the lock, because the
 * cookie is derived from it.
 *
 * ── What is let through ──
 *
 * `robots.txt` (so crawlers read "Disallow: /" rather than a 401 they may
 * retry), and signed webhooks: Stripe, Creem and Twilio cannot type a password,
 * and their requests are proved by signature already (index.ts leaves the same
 * paths without the cookie swap).
 */
import type { Env } from './db';

const REALM = 'Protected Central testing site';
const COOKIE = 'pc_gate';

const enc = new TextEncoder();
async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
/** Equal-length hex strings compared without an early exit. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

const keyFor = (pair: string) => sha256Hex(`gate:${pair}`);

/** The hash the lock checks against, or null when this Worker has no lock (live). */
async function expected(env: Env): Promise<string | null> {
  if (env.STAGING_GATE && env.STAGING_GATE.includes(':')) return sha256Hex(await keyFor(env.STAGING_GATE));
  return env.STAGING_GATE_HASH && /^[0-9a-f]{64}$/.test(env.STAGING_GATE_HASH) ? env.STAGING_GATE_HASH : null;
}

export function gateActive(env: Env): boolean {
  return !!(env.STAGING_GATE || env.STAGING_GATE_HASH);
}

const NOINDEX = 'noindex, nofollow, noarchive';

/**
 * Null to carry on (and `setCookie` to add to the answer), or the response
 * that ends the request here.
 */
export async function stagingGate(req: Request, env: Env, url: URL): Promise<{ stop: Response } | { setCookie: string | null } | null> {
  if (!gateActive(env)) return null;
  if (url.pathname === '/robots.txt') {
    return { stop: new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': NOINDEX } }) };
  }
  if (url.pathname.startsWith('/api/') && /webhook|sms-inbound/.test(url.pathname)) return { setCookie: null };

  const want = await expected(env);
  /* A lock with an unreadable setting stays shut: open by mistake is the failure that matters. */
  if (!want) return { stop: refuse('The testing site is locked and its password is not set up correctly.') };

  const cookie = (req.headers.get('Cookie') ?? '').split(/;\s*/).find(c => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? '';
  if (/^[0-9a-f]{64}$/.test(cookie) && same(await sha256Hex(cookie), want)) return { setCookie: null };

  const auth = req.headers.get('Authorization') ?? '';
  if (/^Basic\s+/i.test(auth)) {
    let pair = '';
    try { pair = new TextDecoder().decode(Uint8Array.from(atob(auth.replace(/^Basic\s+/i, '').trim()), c => c.charCodeAt(0))); } catch { pair = ''; }
    const key = pair ? await keyFor(pair) : '';
    if (key && same(await sha256Hex(key), want)) {
      return { setCookie: `${COOKIE}=${key}; Path=/; Max-Age=${30 * 86400}; HttpOnly; Secure; SameSite=Lax` };
    }
  }
  return { stop: refuse('This is a private testing site. Sign in with the testing username and password.') };
}

function refuse(text: string): Response {
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Private</title><p style="font:16px system-ui;margin:3em auto;max-width:32em">${text}</p>`, {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': NOINDEX,
    },
  });
}

/** The answer, marked as not for any index, with the lock's cookie when one was just earned. */
export function markGated(res: Response, setCookie: string | null): Response {
  /* A WebSocket upgrade cannot be re-wrapped, and has nothing to index. */
  if (res.status === 101 || (res as Response & { webSocket?: unknown }).webSocket) return res;
  const out = new Response(res.body, res);
  out.headers.set('X-Robots-Tag', NOINDEX);
  if (setCookie) out.headers.append('Set-Cookie', setCookie);
  return out;
}
