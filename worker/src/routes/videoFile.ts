/**
 * /api/video-file.php — Video Studio's files, by signed token only.
 *
 *   GET  ?t=<get>                       a file from R2, with Range (the editor seeks the proxy)
 *   PUT  ?t=<up>&part=N                 one part of a browser upload (R2 multipart)
 *   PUT  ?t=<put>&name=&type=           an engine output, in one piece (≤ 16 MB)
 *   POST ?t=<put>&name=&op=mpu-start    … or in parts: start,
 *   PUT  ?t=<put>&name=&op=mpu-part&uploadId=&part=N   each part,
 *   POST ?t=<put>&name=&op=mpu-complete&uploadId=      and finish
 *   POST ?t=<poke>                      the engine saying "look now"
 *   GET  ?t=<listen>                    a library track heard before it is chosen
 *
 * No session here: the token is the permission, issued by /api/video.php
 * after the workspace check (lib/video/store.ts). Every key is checked to be
 * inside the workspace the token names.
 *
 * ── A video is a video ──
 *
 * The first part of every upload is sniffed before it is stored: an MP4/MOV
 * (`ftyp` box) or a Matroska/WebM file (EBML header), nothing else. A file
 * whose name says .mp4 and whose bytes say otherwise is refused there, and
 * the engine's probe then checks codec, duration and size before any
 * processing is spent on it.
 */
import type { Env } from '../lib/db';
import { nowIso } from '../lib/db';
import { json } from '../lib/http';
import { verify } from '../lib/video/store';
import { advanceProject, originOf } from '../lib/video/pipeline';
import { listenTo } from '../lib/video/music';

const OUT_TYPES = new Set(['video/mp4', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/flac', 'image/png', 'image/jpeg', 'application/json', 'text/plain', 'text/vtt']);
const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const MAX_PART = 16 * 1024 * 1024;

/** Is the start of this file an MP4/MOV or a Matroska/WebM container? */
export function looksLikeVideo(b: Uint8Array): boolean {
  if (b.length < 12) return false;
  const ftyp = b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70;
  const ebml = b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
  return ftyp || ebml;
}

/* A part goes to R2 as a stream of exactly the length it declared — never
   held whole. Reading 16 MB parts into memory, with the browser sending
   several at once and the engine its outputs, put one isolate near its
   128 MB and reset it mid-request ("Network connection lost"). A body that
   is shorter or longer than it said fails the write instead of storing it. */
function sized(req: Request, max: number, want?: number): { body: ReadableStream; len: number } | null {
  const len = Number(req.headers.get('content-length') ?? '');
  if (!req.body || !Number.isInteger(len) || len <= 0 || len > max || (want !== undefined && len !== want)) return null;
  return { body: req.body.pipeThrough(new FixedLengthStream(len)), len };
}

async function bodyBytes(req: Request, max: number): Promise<Uint8Array | null> {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > max) return null;
  const buf = new Uint8Array(await req.arrayBuffer());
  return buf.length > max ? null : buf;
}

export async function handleVideoFile(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const g = await verify(env, url.searchParams.get('t'));
  if (!g) return json({ success: false, error: 'This link has expired or is not valid.' }, 403);
  if (!env.VIDEO) return json({ success: false, error: 'Video storage is not set up.' }, 503);

  /* ── Reading ── */
  if (g.m === 'get') {
    if (req.method !== 'GET' && req.method !== 'HEAD') return json({ success: false, error: 'GET only' }, 405);
    const obj = await env.VIDEO.get(g.k, { range: req.headers, onlyIf: req.headers });
    if (!obj) return new Response('Not found', { status: 404 });
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('etag', obj.httpEtag);
    headers.set('accept-ranges', 'bytes');
    headers.set('cache-control', 'private, max-age=3600');
    headers.set('x-content-type-options', 'nosniff');
    headers.set('content-security-policy', "default-src 'none'; sandbox");
    if (g.d) headers.set('content-disposition', `attachment; filename="${g.d.replace(/"/g, '')}"`);
    if (!('body' in obj) || !obj.body) return new Response(null, { status: 304, headers });
    const r = obj.range as { offset?: number; length?: number } | undefined;
    if (r && req.headers.get('range')) {
      const start = r.offset ?? 0;
      const length = r.length ?? obj.size - start;
      headers.set('content-range', `bytes ${start}-${start + length - 1}/${obj.size}`);
      headers.set('content-length', String(length));
      return new Response(req.method === 'HEAD' ? null : obj.body, { status: 206, headers });
    }
    headers.set('content-length', String(obj.size));
    return new Response(req.method === 'HEAD' ? null : obj.body, { status: 200, headers });
  }

  /* ── A library track, heard before it is chosen ── */
  if (g.m === 'listen') {
    if (req.method !== 'GET' && req.method !== 'HEAD') return json({ success: false, error: 'GET only' }, 405);
    return listenTo(env, g.u ?? '', req.headers.get('range'));
  }

  /* ── The engine saying "look now" ── */
  if (g.m === 'poke') {
    if (g.p) ctx.waitUntil(advanceProject(env, originOf(env, req), g.p, 25_000).catch(() => 0));
    return json({ success: true });
  }

  /* ── A part of a browser upload ── */
  if (g.m === 'up') {
    if (req.method !== 'PUT') return json({ success: false, error: 'PUT only' }, 405);
    const part = Number(url.searchParams.get('part'));
    const row = await env.DB.prepare(`SELECT * FROM crm_video_uploads WHERE id = ? AND account_id = ? AND state = 'open'`)
      .bind(g.u ?? '', g.a).first<{ id: string; r2_key: string; upload_id: string; part_size: number; bytes: number }>();
    if (!row || row.r2_key !== g.k) return json({ success: false, error: 'This upload is finished or was cancelled.' }, 410);
    const parts = Math.ceil(row.bytes / row.part_size);
    if (!Number.isInteger(part) || part < 1 || part > parts) return json({ success: false, error: 'No such part.' }, 400);
    const want = part < parts ? row.part_size : row.bytes - row.part_size * (parts - 1);
    /* The first part is read whole, once, to look at its first bytes;
       every other part streams. */
    let body: Uint8Array | ReadableStream;
    if (part === 1) {
      const bytes = await bodyBytes(req, MAX_PART);
      if (!bytes || bytes.length !== want) return json({ success: false, error: `Part ${part} should be ${want} bytes.` }, 400);
      if (!looksLikeVideo(bytes)) {
        await env.VIDEO.resumeMultipartUpload(row.r2_key, row.upload_id).abort().catch(() => null);
        await env.DB.prepare(`UPDATE crm_video_uploads SET state = 'aborted', updated_at = ? WHERE id = ?`).bind(nowIso(), row.id).run();
        return json({ success: false, error: 'That file is not a video Video Studio can read (MP4, MOV, MKV or WebM).', code: 'not_video' }, 415);
      }
      body = bytes;
    } else {
      const st = sized(req, MAX_PART, want);
      if (!st) return json({ success: false, error: `Part ${part} should be ${want} bytes.` }, 400);
      body = st.body;
    }
    const up = env.VIDEO.resumeMultipartUpload(row.r2_key, row.upload_id);
    const done = await up.uploadPart(part, body).catch(() => null);
    if (!done) return json({ success: false, error: `Part ${part} did not arrive whole — send it again.` }, 400);
    await env.DB.prepare(`UPDATE crm_video_uploads SET parts = json_set(parts, ?, ?), updated_at = ? WHERE id = ?`)
      .bind(`$."${part}"`, done.etag, nowIso(), row.id).run();
    return json({ success: true, part, etag: done.etag });
  }

  /* ── The engine's outputs, under the prefix its job was given ── */
  if (g.m === 'put') {
    const name = url.searchParams.get('name') ?? '';
    if (!NAME.test(name) || !g.k.endsWith('/')) return json({ success: false, error: 'bad name' }, 400);
    const key = g.k + name;
    const op = url.searchParams.get('op') ?? '';
    const type = OUT_TYPES.has(url.searchParams.get('type') ?? '') ? url.searchParams.get('type')! : 'application/octet-stream';
    if (op === 'mpu-start' && req.method === 'POST') {
      const up = await env.VIDEO.createMultipartUpload(key, { httpMetadata: { contentType: type } });
      return json({ success: true, uploadId: up.uploadId });
    }
    if (op === 'mpu-part' && req.method === 'PUT') {
      const part = Number(url.searchParams.get('part'));
      if (!Number.isInteger(part) || part < 1 || part > 10_000) return json({ success: false, error: 'bad part' }, 400);
      const st = sized(req, MAX_PART);
      if (!st) return json({ success: false, error: 'a part needs its length, at most 16 MB' }, 413);
      const done = await env.VIDEO.resumeMultipartUpload(key, url.searchParams.get('uploadId') ?? '').uploadPart(part, st.body).catch(() => null);
      if (!done) return json({ success: false, error: 'the part did not arrive whole' }, 400);
      return json({ success: true, etag: done.etag });
    }
    if (op === 'mpu-complete' && req.method === 'POST') {
      const d = await req.json<{ parts?: { partNumber: number; etag: string }[] }>().catch(() => ({ parts: [] as { partNumber: number; etag: string }[] }));
      await env.VIDEO.resumeMultipartUpload(key, url.searchParams.get('uploadId') ?? '').complete((d.parts ?? []).slice(0, 10_000));
      return json({ success: true });
    }
    if (!op && req.method === 'PUT') {
      if (req.headers.get('content-length') === '0') {
        await env.VIDEO.put(key, new Uint8Array(0), { httpMetadata: { contentType: type } }); // captions of a silent video
        return json({ success: true, bytes: 0 });
      }
      const st = sized(req, MAX_PART);
      if (!st) return json({ success: false, error: 'a file needs its length and, over 16 MB, parts' }, 413);
      const put = await env.VIDEO.put(key, st.body, { httpMetadata: { contentType: type } }).catch(() => null);
      if (!put) return json({ success: false, error: 'the file did not arrive whole' }, 400);
      return json({ success: true, bytes: st.len });
    }
    return json({ success: false, error: 'unknown operation' }, 400);
  }
  return json({ success: false, error: 'not allowed' }, 403);
}
