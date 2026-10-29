/**
 * /api/media.php — pictures in the Media Center.
 *
 * Finished graphics are exported in the browser (the Graphics Designer draws
 * them) and saved here; pictures a customer uploads to design with are kept
 * here too, so a design can carry `media:<id>` instead of megabytes of data
 * URL in the synced list of posts. Bytes never pass through this route: it
 * hands out a signed, short-lived upload link to /api/video-file.php under
 * the workspace's own prefix — the same store and signing Video Studio uses
 * (lib/video/store.ts) — and `commit` reads the file back and checks it is
 * the picture it claims to be before a row is written. Saved is said only
 * after that.
 *
 * Also the free photo search: Openverse, limited to CC0 and public-domain
 * pictures, each re-checked by id before it is served, with its creator and
 * licence returned so the editor can record them. The picture is served
 * through this Worker (`GET ?photo=<id>`) so the browser may draw it into an
 * export — most of the hosts Openverse indexes do not allow that.
 *
 * Every row is read `WHERE account_id = ?`; a foreign id is "not found".
 */
import { nowIso, userFromToken, workspaceAccess, type Env } from '../lib/db';
import { body, fail, json } from '../lib/http';
import { rateLimit } from '../lib/rateLimit';
import { fileUrl, sign, workspacePrefix } from '../lib/video/store';
import { checkPng } from '../lib/video/png';
import { refusal } from '../lib/video/usage';
import { originOf } from '../lib/video/pipeline';

interface Req {
  token?: string; accountId?: string; action?: string;
  id?: string; ids?: string[]; key?: string; kind?: string; name?: string; mime?: string; bytes?: number;
  width?: number; height?: number; designId?: string; source?: Record<string, unknown>; q?: string; page?: number;
}

interface Row { id: string; kind: string; name: string; r2_key: string; mime: string; bytes: number; width: number; height: number; design_id: string; source: string; created_at: string }

const MAX_BYTES = 15 * 1024 * 1024;
const s = (v: unknown, n: number) => String(v ?? '').replace(/\p{Cc}/gu, ' ').trim().slice(0, n);
const ext = (mime: string) => (mime === 'image/jpeg' ? 'jpg' : 'png');

/** A JPEG starts with FF D8 FF and ends with FF D9. */
function looksLikeJpeg(b: Uint8Array): boolean {
  return b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9;
}

const ovBase = (env: Env) => ((env as Env & { OPENVERSE_BASE?: string }).OPENVERSE_BASE ?? '').trim().replace(/\/$/, '') || 'https://api.openverse.org';
const UA = 'ProtectedCentral-Designer/1.0 (+https://protectedcentral.com)';
/* Only licences that allow commercial use and changes with no conditions —
   CC BY would need a credit on every post, which a graphic cannot promise. */
const FREE = new Set(['cc0', 'pdm']);

interface OvImage { id?: string; title?: string; creator?: string; license?: string; license_version?: string; license_url?: string; foreign_landing_url?: string; url?: string; thumbnail?: string; width?: number; height?: number; source?: string; provider?: string; mature?: boolean; filetype?: string }

function cleanPhoto(o: OvImage) {
  const code = String(o.license ?? '').toLowerCase();
  if (!o.id || !o.url || !FREE.has(code) || o.mature) return null;
  return {
    id: String(o.id), title: s(o.title, 120) || 'Untitled', creator: s(o.creator, 120),
    license: code === 'cc0' ? 'CC0 1.0 (public domain dedication)' : 'Public Domain Mark',
    licenseUrl: s(o.license_url, 300), landing: s(o.foreign_landing_url, 400),
    width: Number(o.width) || 0, height: Number(o.height) || 0, provider: s(o.source ?? o.provider, 60),
  };
}

/** GET ?photo=<openverse id> — the picture itself, re-checked, same-origin. */
export async function handleMediaPhoto(req: Request, env: Env): Promise<Response> {
  const id = new URL(req.url).searchParams.get('photo') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('bad id', { status: 400 });
  const who = req.headers.get('cf-connecting-ip') ?? 'anon';
  const rl = await rateLimit(env, { what: 'media-photo', who, max: 300, windowSeconds: 3600 });
  if (!rl.allowed) return new Response('slow down', { status: 429 });
  const meta = await fetch(`${ovBase(env)}/v1/images/${id}/`, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
    .then(r => (r.ok ? r.json<OvImage>() : null)).catch(() => null);
  const p = meta ? cleanPhoto(meta) : null;
  if (!p || !meta?.url) return new Response('not a free picture', { status: 404 });
  const img = await fetch(meta.url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  const type = img?.headers.get('content-type') ?? '';
  if (!img?.ok || !/^image\/(jpeg|png|webp|gif)/.test(type)) return new Response('the picture could not be fetched', { status: 502 });
  const len = Number(img.headers.get('content-length') ?? 0);
  if (len > MAX_BYTES) return new Response('too large', { status: 413 });
  return new Response(img.body, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' } });
}

export async function handleMedia(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again to use the Media Center.', 401, { code: 'unauthorised' });
  const accountId = String(d.accountId ?? '').trim();
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(accountId)) return fail('A valid workspace is required.', 400, { code: 'no_workspace' });
  const access = await workspaceAccess(env.DB, user, accountId);
  if (!access.ok) return fail(access.message ?? 'That workspace is not yours.', 403, { code: access.code });
  const act = s(d.action, 30);
  const origin = originOf(env, req);
  const base = `${workspacePrefix(accountId)}media/`;

  const view = async (r: Row) => ({
    id: r.id, kind: r.kind, name: r.name, mime: r.mime, bytes: r.bytes, width: r.width, height: r.height,
    designId: r.design_id, source: (() => { try { return JSON.parse(r.source) as Record<string, unknown>; } catch { return {}; } })(), createdAt: r.created_at,
    url: await fileUrl(env, origin, accountId, r.r2_key, 7200),
    downloadUrl: await fileUrl(env, origin, accountId, r.r2_key, 7200, `${(r.name || 'graphic').replace(/[^\w -]/g, '').trim().slice(0, 60) || 'graphic'}.${ext(r.mime)}`),
  });

  if (act === 'photo_search') {
    const q = s(d.q, 60).replace(/[^\p{L}\p{N}\s-]/gu, ' ').trim();
    if (!q) return fail('Type what the picture should show.', 200, { field: 'media.q' });
    const rl = await rateLimit(env, { what: 'media-search', who: accountId, max: 60, windowSeconds: 3600 });
    if (!rl.allowed) return fail('That is a lot of searches — try again in a few minutes.', 429);
    const page = Math.max(1, Math.min(5, Number(d.page) || 1));
    const r = await fetch(`${ovBase(env)}/v1/images/?q=${encodeURIComponent(q)}&license=cc0,pdm&mature=false&page_size=24&page=${page}`, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!r?.ok) return fail('The free photo library (Openverse) did not answer just now — try again shortly, or upload your own picture.', 200, { code: 'openverse_down' });
    const data = await r.json<{ results?: OvImage[] }>().catch(() => ({ results: [] as OvImage[] }));
    const photos = (data.results ?? []).map(cleanPhoto).filter(Boolean).map(p => ({ ...p!, src: `${origin}/api/media.php?photo=${p!.id}` }));
    return json({ success: true, photos, source: 'Openverse', note: 'CC0 and public-domain pictures only — free to use commercially and to change, with no credit required.' });
  }

  if (!env.VIDEO) return fail('Media storage is not set up on this install yet — the owner switches on Cloudflare R2 (owner checklist item 15). You can still download the PNG.', 200, { code: 'no_storage' });

  if (act === 'list') {
    const kind = s(d.kind, 12);
    const { results } = await env.DB.prepare(
      `SELECT * FROM crm_media_assets WHERE account_id = ? ${kind ? 'AND kind = ?' : ''} ORDER BY created_at DESC LIMIT 200`,
    ).bind(...(kind ? [accountId, kind] : [accountId])).all<Row>();
    return json({ success: true, items: await Promise.all((results ?? []).map(view)) });
  }

  if (act === 'url') {
    const ids = (Array.isArray(d.ids) ? d.ids : []).map(x => s(x, 60)).filter(Boolean).slice(0, 50);
    if (!ids.length) return json({ success: true, urls: {} });
    const { results } = await env.DB.prepare(`SELECT id, r2_key FROM crm_media_assets WHERE account_id = ? AND id IN (${ids.map(() => '?').join(',')})`)
      .bind(accountId, ...ids).all<{ id: string; r2_key: string }>();
    const urls: Record<string, string> = {};
    for (const r of results ?? []) urls[r.id] = await fileUrl(env, origin, accountId, r.r2_key, 7200);
    return json({ success: true, urls });
  }

  if (act === 'upload_url') {
    const mime = d.mime === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    const bytes = Math.max(0, Number(d.bytes) || 0);
    if (bytes > MAX_BYTES) return fail('That picture is over 15 MB.', 200, { code: 'too_big' });
    const room = await refusal(env, accountId, { bytes: Math.max(bytes, 1) });
    if (room) return fail(room, 402, { code: 'allowance' });
    const rl = await rateLimit(env, { what: 'media-upload', who: accountId, max: 120, windowSeconds: 3600 });
    if (!rl.allowed) return fail('That is a lot of pictures at once — wait a few minutes.', 429);
    const id = `med_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const prefix = `${base}${id}/`;
    const url = `${origin}/api/video-file.php?t=${await sign(env, { a: accountId, k: prefix, m: 'put' }, 1800)}`;
    return json({ success: true, id, url, name: `file.${ext(mime)}`, key: `${prefix}file.${ext(mime)}`, mime });
  }

  if (act === 'commit') {
    const id = s(d.id, 60);
    const key = s(d.key, 300);
    if (!/^med_[a-f0-9]{20}$/.test(id) || !(key === `${base}${id}/file.png` || key === `${base}${id}/file.jpg`)) return fail('That upload is not part of this workspace.', 403);
    const head = await env.VIDEO.head(key);
    if (!head) return fail('The picture did not arrive — try saving again.', 200, { code: 'not_uploaded' });
    if (head.size > MAX_BYTES) { await env.VIDEO.delete(key).catch(() => null); return fail('That picture is over 15 MB, so it was not kept.', 200, { code: 'too_big' }); }
    const obj = await env.VIDEO.get(key);
    const b = obj ? new Uint8Array(await obj.arrayBuffer()) : new Uint8Array();
    let width: number, height: number;
    const mime = key.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
    if (mime === 'image/png') {
      const chk = checkPng(b);
      if (!chk.ok) { await env.VIDEO.delete(key).catch(() => null); return fail(`That is not a PNG (${chk.reason}), so it was not kept.`, 200, { code: 'not_png' }); }
      width = chk.width; height = chk.height;
    } else if (!looksLikeJpeg(b)) {
      await env.VIDEO.delete(key).catch(() => null);
      return fail('That is not a complete JPEG, so it was not kept.', 200, { code: 'not_jpeg' });
    } else { width = Math.max(0, Number(d.width) || 0); height = Math.max(0, Number(d.height) || 0); }
    const kind = d.kind === 'upload' ? 'upload' : 'graphic';
    const src = d.source && typeof d.source === 'object' ? d.source : {};
    const source = JSON.stringify(Object.fromEntries(['origin', 'credit', 'license', 'licenseUrl', 'templateId', 'format'].map(k => [k, s(src[k], 300)]).filter(([, v]) => v)));
    const now = nowIso();
    await env.DB.prepare(
      `INSERT OR REPLACE INTO crm_media_assets (id, account_id, kind, name, r2_key, mime, bytes, width, height, design_id, source, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(id, accountId, kind, s(d.name, 120) || (kind === 'graphic' ? 'Graphic' : 'Picture'), key, mime, b.length, width, height, s(d.designId, 80), source, user.email ?? '', now).run();
    const row = await env.DB.prepare('SELECT * FROM crm_media_assets WHERE id = ? AND account_id = ?').bind(id, accountId).first<Row>();
    return json({ success: true, item: row ? await view(row) : null });
  }

  if (act === 'rename') {
    const r = await env.DB.prepare('UPDATE crm_media_assets SET name = ? WHERE id = ? AND account_id = ?').bind(s(d.name, 120) || 'Graphic', s(d.id, 60), accountId).run();
    if (!r.meta.changes) return fail('That picture is not in this workspace.', 404);
    return json({ success: true });
  }

  if (act === 'delete') {
    const row = await env.DB.prepare('SELECT * FROM crm_media_assets WHERE id = ? AND account_id = ?').bind(s(d.id, 60), accountId).first<Row>();
    if (!row) return fail('That picture is not in this workspace.', 404);
    await env.VIDEO.delete(row.r2_key).catch(() => null);
    await env.DB.prepare('DELETE FROM crm_media_assets WHERE id = ? AND account_id = ?').bind(row.id, accountId).run();
    return json({ success: true });
  }

  return fail('Unknown action.');
}
