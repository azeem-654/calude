/**
 * Signed click links.
 *
 * ── Why ──
 *
 * A tracked link is `/api/track.php?c=<email>&a=<workspace>&u=<destination>`,
 * and the tracker used to redirect to whatever `u` said. That made every
 * address on app.protectedcentral.com an open redirect: a phisher could send
 * people a link on our domain that landed on theirs, and anyone could write
 * fake clicks into any workspace — which start `link_clicked` automations.
 *
 * The links are written in the browser, which holds no secret, so they are
 * signed here instead, on the way out: every send that carries customer HTML
 * passes it through `signTrackedLinks`, which appends `s=` — an HMAC over the
 * workspace, the email id and the destination. The tracker only redirects, and
 * only records, when that matches. A link without one (an email sent before
 * this change, or one somebody made up) gets a page naming where it goes and
 * a button, never an automatic hop.
 */
import { installSecret, type Env } from './db';

async function key(env: Env): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(await installSecret(env.DB, 'track_link')),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
}

async function sig(k: CryptoKey, a: string, c: string, u: string): Promise<string> {
  const mac = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${a}\n${c}\n${u}`));
  return [...new Uint8Array(mac)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}

const decodeEntities = (s: string) => s.replace(/&amp;/g, '&');

/** Add a signature to every tracked click link in this HTML. */
export async function signTrackedLinks(env: Env, html: string): Promise<string> {
  if (!html || !html.includes('/api/track.php?')) return html;
  const k = await key(env);
  const re = /href="([^"]*\/api\/track\.php\?c=[^"]*)"/gi;
  const found = [...html.matchAll(re)];
  let out = html;
  for (const m of found) {
    const raw = m[1];
    if (/[?&]s=/.test(raw)) continue;
    let url: URL;
    try { url = new URL(decodeEntities(raw)); } catch { continue; }
    const a = url.searchParams.get('a') ?? '';
    const c = url.searchParams.get('c') ?? '';
    const u = url.searchParams.get('u') ?? '';
    if (!c || !u) continue;
    url.searchParams.set('s', await sig(k, a, c, u));
    out = out.replace(`href="${raw}"`, `href="${url.toString()}"`);
  }
  /* The open pixel, the same way: a forged open would start an
     "email opened" automation as surely as a forged click. */
  for (const m of [...out.matchAll(/src="([^"]*\/api\/track\.php\?o=[^"]*)"/gi)]) {
    const raw = m[1];
    if (/[?&]s=/.test(raw)) continue;
    let url: URL;
    try { url = new URL(decodeEntities(raw)); } catch { continue; }
    const o = url.searchParams.get('o') ?? '';
    if (!o) continue;
    url.searchParams.set('s', await sig(k, url.searchParams.get('a') ?? '', `open:${o}`, ''));
    out = out.replace(`src="${raw}"`, `src="${url.toString()}"`);
  }
  return out;
}

export async function trackedLinkValid(env: Env, a: string, c: string, u: string, s: string): Promise<boolean> {
  if (!s) return false;
  const want = await sig(await key(env), a, c, u);
  if (want.length !== s.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ s.charCodeAt(i);
  return diff === 0;
}
