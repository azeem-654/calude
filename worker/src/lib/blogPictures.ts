/**
 * Real photographs in the posts Autopilot writes, without paying for them.
 *
 * ── Why stock photos and not generated ones ──
 *
 * A generated picture per post costs the operator on every run, and the owner
 * ruled it out. Openverse indexes CC0 and public-domain photographs, needs no
 * key and is already what the Media Center searches (lib/freePhotos.ts), so a
 * post's pictures come from there: the writer suggests two or three concrete
 * searches ("plumber fixing sink"), this runs them, and nothing here calls a
 * model. If the library is down or finds nothing the post is still saved,
 * without pictures, and the run's detail says which — a post that silently
 * lost its pictures looks like a writer that forgot them.
 *
 * Pictures are referenced through this Worker (`/api/media.php?photo=<id>`),
 * which re-checks the licence by id before serving. A scheduled run has no
 * origin, so the address is built from `APP_ORIGIN`.
 *
 * Also here: the Markdown → HTML step a post takes on its way to WordPress,
 * and reading a picture's bytes back for an upload.
 */
import type { Env } from './db';
import { fetchFreePhoto, MAX_PHOTO_BYTES, searchFreePhotos, type FreePhoto } from './freePhotos';

export interface ImageQuery { query: string; alt: string }

export interface PostPicture {
  /** The Openverse id — the picture is re-fetched by it, never by a stored URL. */
  id: string;
  role: 'cover' | 'inline';
  url: string;
  alt: string;
  creator: string;
  license: string;
  licenseUrl: string;
  /** The page the photo came from, for the credit line. */
  landing: string;
  provider: string;
  width: number;
  height: number;
}

const clip = (v: unknown, n: number) => String(v ?? '').replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
/* Characters that would end a Markdown image or link early, or start emphasis. */
const mdSafe = (v: string) => v.replace(/[[\]()*_`|<>]/g, '').trim();

/**
 * The writer's suggested searches, cleaned to what the photo search accepts.
 *
 * Falls back to the post's first keyword: a model that left the field out is
 * common enough that "no pictures" would be the usual result otherwise.
 */
export function cleanQueries(raw: unknown, fallback: { title: string; keywords?: string[] }): ImageQuery[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: ImageQuery[] = [];
  for (const it of list) {
    const o = (typeof it === 'string' ? { query: it } : it ?? {}) as Record<string, unknown>;
    const query = clip(o.query ?? o.q, 60).replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (!query || out.some(q => q.query.toLowerCase() === query.toLowerCase())) continue;
    out.push({ query, alt: mdSafe(clip(o.alt, 125)) });
    if (out.length === 3) break;
  }
  if (!out.length) {
    const k = clip(fallback.keywords?.[0], 60).replace(/[^\p{L}\p{N}\s-]/gu, ' ').trim();
    if (k) out.push({ query: k, alt: mdSafe(clip(fallback.title, 125)) });
  }
  return out;
}

/* Landscape and big enough for a content column first; unknown sizes after,
   because Openverse often omits them and an unknown-size photo is still a photo. */
function rank(photos: FreePhoto[]): FreePhoto[] {
  const score = (p: FreePhoto) => (!p.width || !p.height ? 1 : p.width >= p.height && p.width >= 800 ? 2 : 0);
  return photos.map((p, i) => ({ p, i })).sort((a, b) => score(b.p) - score(a.p) || a.i - b.i).map(x => x.p);
}

/**
 * A cover and up to two pictures for the body, one search per suggestion.
 *
 * `note` is empty only when a cover and at least one inline picture were
 * found; otherwise it says what happened, in words a run's detail can carry.
 */
export async function pickPostPictures(
  env: Env, queries: ImageQuery[], origin: string,
): Promise<{ cover: PostPicture | null; inline: PostPicture[]; note: string }> {
  if (!queries.length) return { cover: null, inline: [], note: 'No picture search was suggested, so it has no pictures — add one in the Media Center.' };
  const base = origin.replace(/\/$/, '');
  const used = new Set<string>();
  const as = (p: FreePhoto, role: PostPicture['role'], alt: string): PostPicture => {
    used.add(p.id);
    return {
      id: p.id, role, url: `${base}/api/media.php?photo=${p.id}`,
      alt: alt || mdSafe(p.title) || 'Photograph', creator: mdSafe(p.creator), license: p.license,
      licenseUrl: p.licenseUrl, landing: p.landing, provider: p.provider, width: p.width, height: p.height,
    };
  };

  const results = await Promise.all(queries.map(q => searchFreePhotos(env, q.query, { pageSize: 12, wide: true })));
  const down = results.every(r => !r.ok);
  if (down) return { cover: null, inline: [], note: 'The free photo library (Openverse) did not answer, so it has no pictures yet.' };
  const pools = results.map(r => (r.ok ? rank(r.photos) : []));
  const next = (i: number) => pools[i]?.find(p => !used.has(p.id));

  let cover: PostPicture | null = null;
  const firstPool = pools.findIndex(p => p.length);
  if (firstPool >= 0) cover = as(next(firstPool)!, 'cover', queries[firstPool].alt);

  const inline: PostPicture[] = [];
  /* One per later suggestion, so the body's pictures show different things;
     with a single suggestion its next-best results stand in. */
  const order = queries.length > 1 ? queries.map((_, i) => i).slice(1) : [0, 0];
  for (const i of order) {
    if (inline.length === 2) break;
    const p = next(i);
    if (p) inline.push(as(p, 'inline', queries[i].alt));
  }

  const missing = results.filter(r => !r.ok).length;
  const note = !cover
    ? `No free pictures matched “${queries.map(q => q.query).join('”, “')}”, so it has no pictures — pick one in the Media Center.`
    : !inline.length
      ? 'Only a cover picture was found; the body has none.'
      : missing ? `Openverse did not answer ${missing} of ${queries.length} picture searches, so it has fewer pictures.` : '';
  return { cover, inline, note };
}

/* Headings a picture should not sit under: the summary, the questions and the
   closing ask are read as lists, and a photo there breaks the snippet. */
const NO_PICTURE = /takeaway|faq|frequently asked|summary|next step|get in touch|contact|book |call us/i;

export function creditLine(p: PostPicture): string {
  const who = p.creator ? `Photo by ${p.creator}` : 'Photo';
  const where = p.landing && /^https?:\/\//.test(p.landing) ? `[${p.provider || 'source'}](${p.landing})` : (p.provider || 'Openverse');
  return `*${who} · ${p.license} · via ${where}*`;
}

/**
 * The body pictures, each placed after the first paragraph under an H2.
 *
 * After the paragraph rather than straight under the heading: the sentence
 * right after a question heading is the one a search engine lifts as the
 * answer, and a picture in between pushes it down. Spread across the eligible
 * headings; a picture with nowhere to go is dropped (and so is not reported as
 * placed), rather than piled under the same heading as another.
 */
export function placePictures(markdown: string, inline: PostPicture[]): { body: string; placed: PostPicture[] } {
  if (!inline.length) return { body: markdown, placed: [] };
  const lines = markdown.split('\n');
  const h2 = lines.map((l, i) => (/^##\s+/.test(l) && !NO_PICTURE.test(l) ? i : -1)).filter(i => i >= 0);
  const spots: number[] = [];
  if (h2.length) {
    for (let k = 0; k < inline.length; k++) {
      const at = h2[Math.min(h2.length - 1, Math.floor(((k + 1) * h2.length) / (inline.length + 1)))];
      if (!spots.includes(at)) spots.push(at);
    }
  } else spots.push(-1);

  const placed = inline.slice(0, spots.length);
  /* Bottom up, so an insertion does not move the lines still to be found. */
  const pairs = spots.map((s, k) => ({ s, p: placed[k] })).sort((a, b) => b.s - a.s);
  for (const { s, p } of pairs) {
    let j = s + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    const isParagraph = (l: string) => !!l.trim() && !/^(#|[-*+]\s|\d+[.)]\s|>|!\[)/.test(l.trim());
    if (j < lines.length && isParagraph(lines[j])) { while (j < lines.length && isParagraph(lines[j])) j++; }
    else if (s < 0) j = 0;
    lines.splice(j, 0, '', `![${p.alt}](${p.url})`, creditLine(p), '');
  }
  return { body: lines.join('\n').replace(/\n{3,}/g, '\n\n'), placed };
}

/**
 * Pictures for one written post: searched, chosen and placed.
 *
 * Never throws and never fails the post — the caller saves `body` whatever
 * happens here and appends `note` to the run's detail when it is not empty.
 */
export async function illustratePost(
  env: Env, post: { title: string; body: string; keywords?: string[]; imageQueries?: unknown },
): Promise<{ body: string; images: PostPicture[]; note: string }> {
  try {
    const queries = cleanQueries(post.imageQueries, post);
    const origin = (env.APP_ORIGIN ?? '').replace(/\/$/, '');
    const { cover, inline, note } = await pickPostPictures(env, queries, origin);
    const { body, placed } = placePictures(post.body, inline);
    return { body, images: [...(cover ? [cover] : []), ...placed], note };
  } catch (e) {
    return { body: post.body, images: [], note: `The picture step failed (${e instanceof Error ? e.message : String(e)}), so it has no pictures.` };
  }
}

/* ── Markdown → HTML, for WordPress ─────────────────────────────────────── */

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string));
const safeHref = (u: string) => /^(https?:\/\/|\/)/i.test(u);

function inlineMd(text: string): string {
  return esc(text)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t, u) => (safeHref(u) ? `<a href="${u}">${t}</a>` : t))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
}

/**
 * The post's Markdown as the HTML WordPress stores.
 *
 * The writer's structure — H2 and H3, lists, a takeaways list, pictures with a
 * credit — is what makes the post scannable, and the old two-rule converter
 * (headings and paragraphs) turned every list into a paragraph of dashes and
 * every picture into literal `![…]` text. `#` and `##` both become `<h2>`:
 * WordPress prints the post title as the page's only `<h1>`.
 *
 * Every piece of text is escaped before any tag is added, so a model writing
 * `<script>` produces the characters, not the element.
 */
export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
  const flushPara = () => { if (para.length) out.push(`<p>${inlineMd(para.join(' '))}</p>`); para = []; };
  const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map(i => `<li>${inlineMd(i)}</li>`).join('')}</${list.tag}>`); list = null; };
  const flush = () => { flushPara(); flushList(); };

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) { flush(); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) { flush(); const lv = Math.min(Math.max(h[1].length, 2), 4); out.push(`<h${lv}>${inlineMd(h[2])}</h${lv}>`); continue; }
    const img = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(t);
    if (img) {
      flush();
      if (!safeHref(img[2])) continue;
      const cap = /^\*(.+)\*$/.exec((lines[i + 1] ?? '').trim());
      if (cap) i++;
      out.push(`<figure><img src="${esc(img[2])}" alt="${esc(img[1])}" loading="lazy" />${cap ? `<figcaption>${inlineMd(cap[1])}</figcaption>` : ''}</figure>`);
      continue;
    }
    const ul = /^[-*+]\s+(.*)$/.exec(t);
    const ol = /^\d+[.)]\s+(.*)$/.exec(t);
    if (ul || ol) {
      flushPara();
      const tag = ul ? 'ul' : 'ol';
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push((ul ?? ol)![1]);
      continue;
    }
    if (t.startsWith('>')) { flush(); out.push(`<blockquote><p>${inlineMd(t.replace(/^>\s?/, ''))}</p></blockquote>`); continue; }
    /* A line after a list item with no blank between is the item continuing. */
    if (list) { list.items[list.items.length - 1] += ` ${t}`; continue; }
    para.push(t);
  }
  flush();
  return out.join('\n');
}

/* ── A picture's bytes, for an upload ───────────────────────────────────── */

export type PictureBytes =
  | { ok: true; bytes: Uint8Array; type: string; ext: string }
  | { ok: false; reason: string };

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

/**
 * The bytes behind an `<img src>` this app put there, or null for any other
 * address.
 *
 * Two kinds are ours: a data URL (a cover drawn in Blog Automation) and a free
 * photo served through `/api/media.php?photo=<id>` — read from Openverse by id
 * rather than by fetching our own address, which a Worker cannot reliably do
 * and which would re-check nothing a direct read does not. Anything else is
 * somebody's hosted picture and is left where it is.
 */
export async function pictureBytes(env: Env, src: string): Promise<PictureBytes | null> {
  const data = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(src);
  if (data) {
    try {
      const bin = atob(data[2].replace(/\s+/g, ''));
      if (bin.length > MAX_PHOTO_BYTES) return { ok: false, reason: 'the picture is over 15 MB' };
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { ok: true, bytes, type: data[1], ext: EXT[data[1]] };
    } catch { return { ok: false, reason: 'the picture could not be read' }; }
  }
  let u: URL;
  try { u = new URL(src.replace(/&amp;/g, '&'), 'https://app.invalid'); } catch { return null; }
  const id = u.searchParams.get('photo') ?? '';
  if (!u.pathname.endsWith('/api/media.php') || !id) return null;
  const got = await fetchFreePhoto(env, id);
  if (!got.ok) return { ok: false, reason: got.reason };
  const buf = new Uint8Array(await got.res.arrayBuffer());
  if (buf.length > MAX_PHOTO_BYTES) return { ok: false, reason: 'too large' };
  const type = got.type.split(';')[0].trim();
  return { ok: true, bytes: buf, type, ext: EXT[type] ?? 'jpg' };
}

/** What a run's detail says about the pictures: how many, or why there are none. */
export function picturesDetail(p: { images: PostPicture[]; note: string }): string {
  const n = p.images.length;
  const has = n ? ` It has ${n} free photo${n === 1 ? '' : 's'} (CC0 or public domain, from Openverse) — swap any that do not fit.` : '';
  return `${has}${p.note ? ` ${p.note}` : ''}`;
}
