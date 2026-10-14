/**
 * /api/booking-media.php — the booking page's photo, logo and short clip.
 *
 *   GET  ?k=<key>                                    the file (public: the key is random)
 *   POST ?action=upload&kind=photo|logo|video&accountId=<ws>
 *        Authorization: Bearer <token | "cookie">, body = the raw file
 *   POST { action: 'clear', token, accountId, kind }
 *
 * ── Why the bytes decide, not the browser ──
 *
 * The page is public and served from this origin, so whatever is stored here
 * is something this origin hands to strangers. A picture is a PNG or a JPEG by
 * its own signature and the size its header states (lib/widgetAvatar.ts
 * `sniffImage`) — never by a Content-Type or a file name, and never SVG, which
 * opened directly is a document that runs here. A clip is an MP4/MOV (`ftyp`
 * at byte 4) or a WebM (the EBML magic). Every answer carries `nosniff` and a
 * CSP that runs nothing.
 *
 * ── Where it is kept ──
 *
 * Pictures are small (the browser shrinks them first) and go in D1 like every
 * other picture this install serves. A clip does not fit a D1 row, so it needs
 * the R2 bucket bound as VIDEO — optional at deploy (scripts/
 * video-bindings.mjs). Without it the upload is refused by name and the
 * editor offers a YouTube, Vimeo or Loom link instead, which always works.
 *
 * The raw body is sent as-is rather than as a data URL in JSON: base64 adds a
 * third, and a 25 MB clip parsed as a JSON string would hold three copies of
 * itself in a 128 MB isolate.
 */
import { bearer, body, fail, json } from '../lib/http';
import { canAccess, nowIso, userFromToken, type Env } from '../lib/db';
import { publicKey } from '../lib/engagement';
import { sniffImage } from '../lib/widgetAvatar';
import { rateLimit } from '../lib/rateLimit';

export const BOOKING_IMAGE_MAX_BYTES = 400_000;
export const BOOKING_IMAGE_MAX_SIDE = 800;
/* About a minute of phone video at a sensible bitrate — "a small video", and
   small enough that every visitor opening the page is not made to wait. */
export const BOOKING_VIDEO_MAX_BYTES = 25 * 1024 * 1024;

/* `testimonial`: the photo of the customer the owner quotes — a picture like the others. */
type Kind = 'photo' | 'logo' | 'video' | 'testimonial';
const KINDS: Kind[] = ['photo', 'logo', 'video', 'testimonial'];
const FIELD: Record<Kind, string> = { photo: 'booking.photo', logo: 'booking.logo', video: 'booking.video', testimonial: 'booking.testimonialPhoto' };

/** The public address of a file. Relative: the page that shows it is on this origin. */
export const bookingMediaUrl = (key: string): string => `/api/booking-media.php?k=${key}`;
export const MEDIA_URL_RE = /^\/api\/booking-media\.php\?k=([a-f0-9]{36})$/;

/** What a clip really is, from its first bytes, or null. */
export function sniffVideo(b: Uint8Array): 'video/mp4' | 'video/webm' | null {
  if (b.length < 16) return null;
  /* ISO base media (MP4, and QuickTime MOV, which is the same box structure):
     a box size, then 'ftyp'. MOV is served as video/mp4 because that is the
     type every browser will try; the container is the same. */
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'video/mp4';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm';
  return null;
}

const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain', 'X-Content-Type-Options': 'nosniff' } });

async function removeKind(env: Env, accountId: string, kind: Kind): Promise<void> {
  const old = await env.DB.prepare('SELECT key, r2_key FROM crm_booking_media WHERE account_id = ? AND kind = ?')
    .bind(accountId, kind).first<{ key: string; r2_key: string | null }>();
  if (!old) return;
  if (old.r2_key && env.VIDEO) {
    try { await env.VIDEO.delete(old.r2_key); } catch { /* the row goes either way: an orphan object costs pennies, a dangling row breaks the page */ }
  }
  await env.DB.prepare('DELETE FROM crm_booking_media WHERE key = ?').bind(old.key).run();
}

export async function handleBookingMedia(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);

  /* ── Public: the file ── */
  if (req.method === 'GET' || req.method === 'HEAD') {
    const k = url.searchParams.get('k') ?? '';
    if (!/^[a-f0-9]{36}$/.test(k)) return notFound();
    const row = await env.DB.prepare('SELECT kind, mime, data, r2_key FROM crm_booking_media WHERE key = ?')
      .bind(k).first<{ kind: string; mime: string; data: string | null; r2_key: string | null }>().catch(() => null);
    if (!row) return notFound();
    const headers = new Headers({
      'Content-Type': row.mime,
      /* A new upload gets a new key, so an address never changes what it shows. */
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-site',
    });
    if (row.kind !== 'video') {
      if ((row.mime !== 'image/png' && row.mime !== 'image/jpeg') || !row.data) return notFound();
      const bin = atob(row.data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Response(req.method === 'HEAD' ? null : bytes, { headers });
    }
    if (!env.VIDEO || !row.r2_key || (row.mime !== 'video/mp4' && row.mime !== 'video/webm')) return notFound();
    /* Ranges, because a video element seeks by asking for them — and Safari
       will not play a clip at all from a server that does not answer one. */
    const obj = await env.VIDEO.get(row.r2_key, { range: req.headers });
    if (!obj) return notFound();
    headers.set('Accept-Ranges', 'bytes');
    const r = obj.range as { offset?: number; length?: number } | undefined;
    if (r && req.headers.get('range')) {
      const start = r.offset ?? 0;
      const length = r.length ?? obj.size - start;
      headers.set('Content-Range', `bytes ${start}-${start + length - 1}/${obj.size}`);
      headers.set('Content-Length', String(length));
      return new Response(req.method === 'HEAD' ? null : obj.body, { status: 206, headers });
    }
    headers.set('Content-Length', String(obj.size));
    return new Response(req.method === 'HEAD' ? null : obj.body, { headers });
  }

  if (req.method !== 'POST') return fail('GET or POST only.', 405);

  /* ── Owner: upload, the raw file as the body ── */
  if (url.searchParams.get('action') === 'upload') {
    const kind = String(url.searchParams.get('kind') ?? '') as Kind;
    if (!KINDS.includes(kind)) return fail('Upload a photo, a logo, a testimonial photo or a video.');
    const field = FIELD[kind];
    const user = await userFromToken(env.DB, bearer(req, url));
    if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });
    const accountId = String(url.searchParams.get('accountId') ?? '').trim();
    if (!accountId) return fail('A workspace is required.', 200, { field });
    if (!(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours to change.', 403);

    const v = await rateLimit(env, { what: 'booking-media', who: accountId, max: 40, windowSeconds: 3600 });
    if (!v.allowed) return fail('Too many uploads in the last hour — try again later.', 429, { field });

    const max = kind === 'video' ? BOOKING_VIDEO_MAX_BYTES : BOOKING_IMAGE_MAX_BYTES;
    const declared = Number(req.headers.get('Content-Length') ?? '0');
    if (declared > max) {
      return fail(kind === 'video'
        ? `That clip is ${(declared / 1048576).toFixed(1)} MB. Keep it under ${BOOKING_VIDEO_MAX_BYTES / 1048576} MB — about a minute — or paste a YouTube, Vimeo or Loom link instead.`
        : 'That picture is too large — choose a smaller one.', 200, { field });
    }
    if (kind === 'video' && !env.VIDEO) {
      return fail('Uploading a clip needs file storage, which is not switched on for this install. Paste a YouTube, Vimeo or Loom link instead — that always works.', 200, { field, code: 'no_storage' });
    }

    const buf = new Uint8Array(await req.arrayBuffer());
    /* Checked again on what arrived: the header is the sender's word. */
    if (!buf.length) return fail('That file is empty.', 200, { field });
    if (buf.length > max) return fail(kind === 'video' ? `Keep the clip under ${BOOKING_VIDEO_MAX_BYTES / 1048576} MB.` : 'That picture is too large — choose a smaller one.', 200, { field });

    if (kind === 'video') {
      const mime = sniffVideo(buf);
      if (!mime) return fail('Only an MP4, MOV or WebM clip can be used.', 200, { field });
      const key = publicKey();
      const r2Key = `booking/${accountId}/${key}`;
      await env.VIDEO!.put(r2Key, buf, { httpMetadata: { contentType: mime } });
      await removeKind(env, accountId, 'video');
      await env.DB.prepare(
        'INSERT INTO crm_booking_media (key, account_id, kind, mime, data, r2_key, bytes, created_at) VALUES (?,?,?,?,?,?,?,?)',
      ).bind(key, accountId, 'video', mime, null, r2Key, buf.length, nowIso()).run();
      return json({ success: true, key, url: bookingMediaUrl(key), bytes: buf.length });
    }

    const img = sniffImage(buf);
    if (!img) return fail('Only a PNG or JPEG picture can be used.', 200, { field });
    if (!img.width || !img.height || img.width > BOOKING_IMAGE_MAX_SIDE || img.height > BOOKING_IMAGE_MAX_SIDE) {
      return fail(`The picture must be at most ${BOOKING_IMAGE_MAX_SIDE} pixels a side.`, 200, { field });
    }
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    const key = publicKey();
    await removeKind(env, accountId, kind);
    await env.DB.prepare(
      'INSERT INTO crm_booking_media (key, account_id, kind, mime, data, r2_key, bytes, width, height, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).bind(key, accountId, kind, img.mime, btoa(bin), null, buf.length, img.width, img.height, nowIso()).run();
    return json({ success: true, key, url: bookingMediaUrl(key), width: img.width, height: img.height });
  }

  /* ── Owner: take one away ── */
  const d = await body<{ action?: string; token?: string; accountId?: string; kind?: string }>(req);
  if (d.action === 'clear') {
    const user = await userFromToken(env.DB, d.token);
    if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });
    const accountId = String(d.accountId ?? '').trim();
    const kind = String(d.kind ?? '') as Kind;
    if (!accountId || !KINDS.includes(kind)) return fail('A workspace and what to remove are required.');
    if (!(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours to change.', 403);
    await removeKind(env, accountId, kind);
    return json({ success: true });
  }
  return fail(`"${String(d.action ?? '')}" is not something this endpoint does.`);
}

/**
 * The address of this workspace's file of a kind, when the given address is
 * one. Publishing keeps a media address only if it names a file this
 * workspace holds, so a page cannot be made to show somebody else's upload.
 */
export async function ownMediaUrl(env: Env, accountId: string, kind: Kind, v: unknown): Promise<string> {
  const m = MEDIA_URL_RE.exec(String(v ?? ''));
  if (!m) return '';
  const row = await env.DB.prepare('SELECT 1 AS n FROM crm_booking_media WHERE key = ? AND account_id = ? AND kind = ?')
    .bind(m[1], accountId, kind).first().catch(() => null);
  return row ? bookingMediaUrl(m[1]) : '';
}
