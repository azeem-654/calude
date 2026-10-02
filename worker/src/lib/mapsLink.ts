/**
 * A Google Maps link (or a bare place ID), read into what Places can look up.
 *
 * Customers do not search for their own business — they paste what they have:
 * the "Share" link from the Maps app (maps.app.goo.gl, share.google), the long
 * /maps/place/… address from a desktop browser, the g.page "ask for reviews"
 * link Google gave them, a ?cid= link from an old listing, or the place ID a
 * developer once sent. Each carries a different piece of the place:
 *
 *   place ID   ?placeid= / ?place_id= / ?query_place_id= / q=place_id:… /
 *              !19s… or !1sChIJ… in the data segment, or the bare ID itself.
 *              Places looks it up directly.
 *   CID        ?cid=, or the second half of a feature id (ftid=0x…:0x…, or
 *              !1s0x…:0x… in the data segment). Places cannot look a CID up,
 *              but every place it returns carries its CID in googleMapsUri,
 *              so a name search is narrowed to the one that matches.
 *   name       /maps/place/<name>/, /maps/search/<query>/, or ?q=<text>.
 *   position   !3d…!4d… (the pin) before @lat,lng (the camera), to bias the
 *              search towards the right branch of a chain.
 *
 * A link that carries only a CID — no name, no ID — cannot be resolved by
 * Places, and says so rather than guessing.
 *
 * Short links are the only thing ever fetched, and only on Google's own
 * shorteners: a redirect is followed hop by hop (never automatically), at most
 * six times, and stops the moment it would leave them. Everything else is read
 * from the address alone. Pure apart from `followShortLink`, so
 * worker/test/mapsLink.test.mts can argue with every shape without a network.
 */
import { PLACE_ID_RE } from './googlePlaces';

export interface MapsLink {
  placeId?: string;
  cid?: string;
  /** A business name or free text to search for. */
  query?: string;
  lat?: number;
  lng?: number;
  /** A Google shortener whose address carries nothing yet: it must be followed. */
  short?: boolean;
  /** A URL that is not Google's at all. */
  notGoogle?: boolean;
}

/** Hosts whose links are redirects and nothing else. */
export const SHORT_HOSTS = /^(maps\.app\.goo\.gl|goo\.gl|g\.page|www\.g\.page|g\.co|share\.google)$/i;
const GOOGLE_HOST = /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/i;
const isGoogle = (h: string) => SHORT_HOSTS.test(h) || GOOGLE_HOST.test(h);

/*
 * A bare place ID, told apart from a one-word business name. Google's IDs
 * start with one of a handful of prefixes (ChIJ for almost every business) and
 * are long; "BakeryOnTheCorner" is neither.
 */
const BARE_PLACE_ID = /^((ChIJ|GhIJ)[A-Za-z0-9_-]{10,280}|(EiI|Ei[A-Za-z0-9]|IhoS|Eh[A-Za-z0-9]|Ej[A-Za-z0-9])[A-Za-z0-9_-]{16,280})$/;

/** `0x47e66e2964e34e2d:0x8ddca9ee380ef7e0` → the decimal CID Maps shows as ?cid=. */
export function cidFromFtid(ftid: string): string {
  const m = /^0x[0-9a-f]{1,16}:0x([0-9a-f]{1,16})$/i.exec(ftid.trim());
  if (!m) return '';
  try { return BigInt(`0x${m[1]}`).toString(); } catch { return ''; }
}

/** The CID in a googleMapsUri as Places (New) returns it: `https://maps.google.com/?cid=123…`. */
export function cidOfMapsUri(u: string): string {
  return /[?&]cid=(\d{1,25})(?:&|$)/.exec(u)?.[1] ?? '';
}

const asPlaceId = (v: string | null | undefined): string => {
  const s = String(v ?? '').trim();
  return PLACE_ID_RE.test(s) && s.length >= 16 ? s : '';
};

const num = (v: string | undefined): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= 180 ? n : undefined;
};

/**
 * Read a pasted string. `null` means it is neither a link nor a place ID —
 * plain words, to be searched for as they are.
 */
export function parseMapsLink(raw: string, depth = 0): MapsLink | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (BARE_PLACE_ID.test(s)) return { placeId: s };
  if (/^place_id:/i.test(s)) { const p = asPlaceId(s.slice(9)); return p ? { placeId: p } : null; }

  /* What people copy from a phone often lacks the scheme. */
  const withScheme = /^https?:\/\//i.test(s) ? s
    : /^(www\.)?(maps\.app\.goo\.gl|goo\.gl|g\.page|g\.co|share\.google|maps\.google\.|google\.[a-z.]+\/maps|search\.google\.)/i.test(s) ? `https://${s}` : '';
  if (!withScheme) return null;
  let u: URL;
  try { u = new URL(withScheme); } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (!isGoogle(host)) return { notGoogle: true };

  const q = u.searchParams;
  const out: MapsLink = {};

  /* A consent or sign-in page wraps the real address in `continue`. */
  const cont = q.get('continue');
  if (cont && depth < 3) {
    const inner = parseMapsLink(cont, depth + 1);
    if (inner && !inner.notGoogle && (inner.placeId || inner.cid || inner.query)) return inner;
  }

  out.placeId = asPlaceId(q.get('placeid')) || asPlaceId(q.get('place_id')) || asPlaceId(q.get('query_place_id')) || undefined;
  const qText = (q.get('q') ?? q.get('query') ?? '').trim();
  if (/^place_id:/i.test(qText)) out.placeId = out.placeId || asPlaceId(qText.slice(9)) || undefined;
  else if (qText && !/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(qText)) out.query = qText;

  const cidParam = (q.get('cid') ?? '').trim();
  if (/^\d{1,25}$/.test(cidParam)) out.cid = cidParam;
  const ftid = q.get('ftid');
  if (ftid && !out.cid) out.cid = cidFromFtid(ftid) || undefined;

  let path = u.pathname;
  try { path = decodeURIComponent(u.pathname); } catch { /* keep it raw */ }
  const place = /\/maps\/place\/([^/@]+)/.exec(path);
  const search = /\/maps\/search\/([^/@]+)/.exec(path);
  const name = (place?.[1] ?? search?.[1] ?? '').replace(/\+/g, ' ').trim();
  if (name && !/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(name)) out.query = out.query || name;

  /* The data segment: `!1s<feature id or place id>`, `!19s<place id>`, `!3d<lat>!4d<lng>`. */
  const data = `${path}${u.search}`;
  const pid19 = /!19s([A-Za-z0-9_-]{16,300})/.exec(data)?.[1];
  const pid1 = /!1s(ChIJ[A-Za-z0-9_-]{12,300})/.exec(data)?.[1];
  out.placeId = out.placeId || asPlaceId(pid19) || asPlaceId(pid1) || undefined;
  const feature = /!1s(0x[0-9a-f]{1,16}:0x[0-9a-f]{1,16})/i.exec(data)?.[1];
  if (feature && !out.cid) out.cid = cidFromFtid(feature) || undefined;
  const pin = /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/.exec(data);
  const cam = /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/.exec(data);
  const pos = pin ?? cam;
  if (pos) { out.lat = num(pos[1]); out.lng = num(pos[2]); }

  if (!out.placeId && !out.cid && !out.query && SHORT_HOSTS.test(host)) return { short: true };
  for (const k of Object.keys(out) as (keyof MapsLink)[]) if (out[k] === undefined) delete out[k];
  return out;
}

/*
 * Not a browser's. Asked by a browser, g.page answers with a Maps page that
 * carries only the feature id — a CID, which Places cannot look up; asked by
 * anything else it answers with the review form's address, which names the
 * place ID. Checked against a live g.page link on 2026-10-02.
 */
const UA = 'ProtectedCentral-link-reader/1.0';

export interface FollowResult { link: MapsLink | null; hops: number; error?: string }

/**
 * Follow a Google short link to the address it stands for, and read that.
 *
 * `base`, when set, is where the shortener is asked instead of the real host
 * (`<base>/<host><path>`) — the same seam as GOOGLE_PLACES_BASE, so
 * test/reputation.e2e.mjs proves the hops rather than a stub of this function.
 * Production leaves it unset.
 */
export async function followShortLink(start: string, base = ''): Promise<FollowResult> {
  let current = /^https?:\/\//i.test(start) ? start : `https://${start}`;
  for (let hop = 0; hop < 6; hop++) {
    let u: URL;
    try { u = new URL(current); } catch { return { link: null, hops: hop, error: 'bad_url' }; }
    if (!SHORT_HOSTS.test(u.hostname)) return { link: parseMapsLink(current), hops: hop };
    const target = base ? `${base.replace(/\/+$/, '')}/${u.hostname}${u.pathname}${u.search}` : current;
    let res: Response;
    try {
      res = await fetch(target, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': UA } });
    } catch (e) {
      return { link: null, hops: hop, error: e instanceof Error ? e.message : String(e) };
    }
    const loc = res.headers.get('Location');
    /* The body is never needed; not reading it lets the connection go. */
    try { await res.body?.cancel(); } catch { /* already closed */ }
    if (!loc || res.status < 300 || res.status > 399) {
      return { link: null, hops: hop + 1, error: res.status === 404 ? 'not_found' : `status_${res.status}` };
    }
    const next = new URL(loc, current).toString();
    const read = parseMapsLink(next);
    if (read && !read.short && (read.placeId || read.cid || read.query || read.notGoogle)) return { link: read, hops: hop + 1 };
    current = next;
  }
  return { link: null, hops: 6, error: 'too_many_redirects' };
}
