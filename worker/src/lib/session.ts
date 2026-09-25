/**
 * The session in an HttpOnly cookie, where page scripts cannot read it.
 *
 * ── Why ──
 *
 * The session token lived in localStorage and was sent in every request body,
 * so any script that ever ran on the page — an injected one, a compromised
 * extension — could read it and sign in as the user from anywhere. The CSP and
 * DOMPurify make injection much harder; this makes it pointless for sessions.
 *
 * ── How, without touching sixty call sites ──
 *
 * The browser app now keeps the literal placeholder `"cookie"` where the token
 * used to be. Here, before any route runs, a JSON request carrying
 * `"token":"cookie"` has the placeholder swapped for the cookie's value, as
 * raw text, so the body is otherwise byte-for-byte what was sent. Routes keep
 * reading `d.token` exactly as before; scripts and tests that send a real
 * token keep working unchanged.
 *
 * ── CSRF ──
 *
 * A cookie is sent by the browser on its own, which a token in a body never
 * was. Two things stop another site using it: the cookie is `SameSite=Lax`,
 * so a cross-site POST does not carry it; and the swap only happens when the
 * request's Origin, if it has one, is this site. Webhooks are never touched.
 */

export const COOKIE = 'pc_session';
/* The cookie outlives any session it can carry — 400 days is the most a
   browser will keep one. When a session ends is the server's decision (30
   days after last use, lib/db.ts); a cookie that expired first would sign an
   active person out on a date fixed at sign-in, which is what the sliding
   session exists to stop. */
const MAX_AGE = 400 * 86_400;
const PLACEHOLDER = '"token":"cookie"';

export function cookieToken(req: Request): string {
  const raw = req.headers.get('Cookie') ?? '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) {
      const val = decodeURIComponent(v.join('='));
      return /^[a-f0-9]{48}$/.test(val) ? val : '';
    }
  }
  return '';
}

/** Is this request from this site's own pages (or from no page at all)? */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('Origin');
  if (!origin || origin === 'null') return !origin;
  try { return new URL(origin).host === new URL(req.url).host; } catch { return false; }
}

/** The request with `"token":"cookie"` replaced by the cookie's token. */
export async function withCookieToken(req: Request): Promise<Request> {
  if (req.method !== 'POST') return req;
  if (!/application\/json/i.test(req.headers.get('Content-Type') ?? '')) return req;
  const token = cookieToken(req);
  if (!token) return req;
  const text = await req.clone().text();
  if (!text.includes(PLACEHOLDER)) return req;
  if (!sameOrigin(req)) return new Request(req, { body: text });
  const body = text.split(PLACEHOLDER).join(`"token":${JSON.stringify(token)}`);
  return new Request(req, { body });
}

export function setCookieHeader(token: string, secure: boolean): string {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function clearCookieHeader(secure: boolean): string {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/**
 * After an auth.php answer: a response that issued a session sets the cookie;
 * a logout clears it. The JSON still carries the token for API clients and
 * tests; the browser app does not store it (src/services/auth.ts).
 */
export async function withSessionCookie(req: Request, res: Response, action: string): Promise<Response> {
  const secure = new URL(req.url).protocol === 'https:';
  if (action === 'logout') {
    const out = new Response(res.body, res);
    out.headers.append('Set-Cookie', clearCookieHeader(secure));
    return out;
  }
  if (!(res.headers.get('Content-Type') ?? '').includes('application/json')) return res;
  let data: { success?: boolean; token?: string } = {};
  try { data = await res.clone().json(); } catch { return res; }
  if (!data.success || typeof data.token !== 'string' || !data.token || data.token === 'cookie') return res;
  const out = new Response(res.body, res);
  out.headers.append('Set-Cookie', setCookieHeader(data.token, secure));
  return out;
}
