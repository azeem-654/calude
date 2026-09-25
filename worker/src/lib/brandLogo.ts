/**
 * A client's logo: found on their website, and served to the places that
 * cannot carry it inline.
 *
 * ── Finding it ──
 *
 * There is no standard for "this is the logo", so the page is asked in order
 * of how often each answer is right:
 *
 *   1. schema.org `"logo"` in JSON-LD — the site saying so on purpose;
 *   2. an `<img>` whose class, id, alt or file name says "logo", nearest the
 *      top of the page (the header's, not a partner strip in the footer);
 *   3. `apple-touch-icon` — square, usually 180px, usually the mark itself;
 *   4. a PNG or SVG `rel="icon"` with a size of 96 or more.
 *
 * `og:image` is deliberately not on the list. It is the picture a link preview
 * shows — a hero photograph far more often than a logo — and a photograph set
 * in the corner of every post is worse than the business's name.
 *
 * The image is fetched the way a page is: every hop checked by `urlProblem`,
 * the body read to a cap, and only image types accepted. SVG is accepted from
 * the site but never served back from ours (see `handleLogo`); the browser
 * turns it into a PNG before it is stored.
 *
 * ── Serving it ──
 *
 * The logo is kept as a data URL on the portfolio, which is right for the
 * screens and wrong for two places: an email (Gmail and Outlook drop data URLs)
 * and a post saved into a workspace blob hundreds of times over. Those get a
 * signed address on this Worker instead. Signed because portfolio ids are made
 * from a timestamp and a few random characters, and "any logo anybody has
 * uploaded, by guessing" is not something to publish even when most logos are
 * already public.
 */
import { installSecret, type Env } from './db';
import { readCapped, urlProblem } from './readSite';

const IMAGE_CAP = 400_000;
const TYPES = /^image\/(png|jpeg|jpg|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon)$/i;

const attr = (tag: string, name: string): string => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return (m?.[2] ?? m?.[3] ?? m?.[4] ?? '').trim();
};

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** Candidate logo addresses on a page, best first, absolute. */
export function findLogoCandidates(html: string, base: string): string[] {
  const out: string[] = [];
  const add = (raw: string) => {
    const v = decode(raw).trim();
    if (!v || v.startsWith('data:')) return;
    try {
      const u = new URL(v, base);
      if (u.protocol === 'https:' || u.protocol === 'http:') out.push(u.toString());
    } catch { /* not an address */ }
  };

  /* 1 · JSON-LD. The value is a string or an ImageObject with a url. */
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const l of m[1].matchAll(/"logo"\s*:\s*(?:"([^"]+)"|\{[^}]*?"(?:url|contentUrl)"\s*:\s*"([^"]+)")/g)) add(l[1] ?? l[2] ?? '');
  }

  /* 2 · An <img> that names itself a logo, in page order. */
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const hay = `${attr(tag, 'class')} ${attr(tag, 'id')} ${attr(tag, 'alt')} ${attr(tag, 'src')}`.toLowerCase();
    if (!/logo|brand/.test(hay)) continue;
    const src = attr(tag, 'src') || attr(tag, 'data-src') || (attr(tag, 'srcset').split(/\s+/)[0] ?? '');
    add(src);
  }

  /* 3 and 4 · Icons the site declares. */
  const icons: { href: string; rank: number }[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = attr(tag, 'rel').toLowerCase();
    const href = attr(tag, 'href');
    if (!href) continue;
    if (rel.includes('apple-touch-icon')) icons.push({ href, rank: 1 });
    else if (/\bicon\b/.test(rel)) {
      const size = Number((attr(tag, 'sizes').match(/(\d+)x\d+/) ?? [])[1] ?? 0);
      const svg = /\.svg(\?|$)/i.test(href) || /svg/i.test(attr(tag, 'type'));
      if (svg || size >= 96) icons.push({ href, rank: 2 });
    }
  }
  for (const i of icons.sort((a, b) => a.rank - b.rank)) add(i.href);

  return [...new Set(out)].slice(0, 6);
}

export interface FetchedLogo {
  ok: boolean;
  dataUrl: string;
  url: string;
  error: string;
}

/** One image, fetched through the same fence as a page. */
export async function fetchImage(raw: string): Promise<FetchedLogo> {
  const none = (error: string): FetchedLogo => ({ ok: false, dataUrl: '', url: raw, error });
  let url = raw;
  for (let hop = 0; hop <= 3; hop++) {
    const problem = urlProblem(url);
    if (problem) return none(problem);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        headers: { 'User-Agent': 'ProtectedCentral-SiteReader/1.0 (+https://protectedcentral.com)', Accept: 'image/*' },
      });
    } catch (e) {
      return none(`That image could not be reached: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      if (!next) return none('That image redirects to nowhere.');
      url = new URL(next, url).toString();
      continue;
    }
    if (!res.ok) return none(`That image answered ${res.status}.`);
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!TYPES.test(type)) return none(`That address is ${type || 'not an image'}.`);
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > IMAGE_CAP) return none('That logo file is too large to use.');
    const buf = await readCapped(res, IMAGE_CAP + 1);
    if (!buf || !buf.length) return none('That image was empty.');
    if (buf.length > IMAGE_CAP) return none('That logo file is too large to use.');
    if (type === 'image/svg+xml') {
      /* Refused rather than cleaned. It is only ever drawn through an <img>,
         where script does not run, but a file with script in it is not a logo
         anybody meant to publish. */
      const text = new TextDecoder().decode(buf);
      if (/<script|<foreignObject|\bon\w+\s*=|javascript:/i.test(text)) return none('That logo file contains script, so it was not used.');
    }
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    const mime = type === 'image/jpg' ? 'image/jpeg' : type === 'image/vnd.microsoft.icon' ? 'image/x-icon' : type;
    return { ok: true, dataUrl: `data:${mime};base64,${btoa(bin)}`, url, error: '' };
  }
  return none('That image redirects too many times.');
}

/** The first candidate that turns out to be a usable image. */
export async function logoFromPage(html: string, base: string): Promise<FetchedLogo & { tried: number }> {
  const candidates = findLogoCandidates(html, base);
  let last = 'No logo was marked on that page.';
  for (const c of candidates.slice(0, 4)) {
    const r = await fetchImage(c);
    if (r.ok) return { ...r, tried: candidates.length };
    last = r.error;
  }
  return { ok: false, dataUrl: '', url: '', error: candidates.length ? last : 'No logo was marked on that page.', tried: candidates.length };
}

/* ── The signed public address ────────────────────────────────────────────── */

async function sign(env: Env, portfolioId: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(await installSecret(env.DB, 'logo_link')),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`logo\n${portfolioId}`));
  return [...new Uint8Array(mac)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * A path that serves this portfolio's logo, or '' when it has none that can be
 * served. `origin` empty gives a path for pages on this host; an email needs
 * the absolute form, and a scheduled run takes it from `APP_ORIGIN`.
 */
export async function logoAddress(env: Env, portfolioId: string, logoUrl: string, origin = ''): Promise<string> {
  if (!portfolioId || !SERVABLE.test(logoUrl)) return '';
  const version = logoUrl.length.toString(36);
  return `${origin.replace(/\/$/, '')}/api/logo.php?p=${encodeURIComponent(portfolioId)}&v=${version}&s=${await sign(env, portfolioId)}`;
}

/*
 * Raster only. An SVG served from our own origin and opened directly is a
 * document that runs in our origin; the browser rasterises before storing, so
 * a stored SVG is an old or hand-made one and is simply not served.
 */
const SERVABLE = /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i;

export async function handleLogo(req: Request, env: Env): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const id = (q.get('p') ?? '').slice(0, 80);
  const s = q.get('s') ?? '';
  const nope = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain', 'X-Content-Type-Options': 'nosniff' } });
  if (!id || !s) return nope();
  const want = await sign(env, id);
  let diff = want.length ^ s.length;
  for (let i = 0; i < Math.min(want.length, s.length); i++) diff |= want.charCodeAt(i) ^ s.charCodeAt(i);
  if (diff !== 0) return nope();

  const row = await env.DB.prepare('SELECT profile FROM crm_portfolios WHERE id = ?').bind(id).first<{ profile: string }>().catch(() => null);
  let logo = '';
  try { logo = String((JSON.parse(row?.profile ?? '{}') as { logoUrl?: string }).logoUrl ?? ''); } catch { logo = ''; }
  if (!SERVABLE.test(logo)) return nope();
  const comma = logo.indexOf(',');
  const type = logo.slice(5, logo.indexOf(';'));
  const bin = atob(logo.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, {
    headers: {
      'Content-Type': type,
      /* A day, not forever: `v` changes when the logo does, but an old email
         still names the old `v` and should get today's logo, not a 404. */
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  });
}
