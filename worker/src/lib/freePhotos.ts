/**
 * Free photos from Openverse, for anything that needs a real picture without
 * paying a generator for one.
 *
 * Two callers: the Media Center's photo search (routes/media.ts), where a
 * person picks, and the blog writer's picture step (lib/blogPictures.ts),
 * where nobody does. Both must apply the same licence rule, so the rule lives
 * here once — a second copy in the blog step would be the one that drifts and
 * starts putting CC BY pictures on posts with no credit.
 *
 * `OPENVERSE_BASE` (a `--var`) points both at a stand-in in tests.
 */
import type { Env } from './db';

export const ovBase = (env: Env) => ((env as Env & { OPENVERSE_BASE?: string }).OPENVERSE_BASE ?? '').trim().replace(/\/$/, '') || 'https://api.openverse.org';
export const OV_UA = 'ProtectedCentral-Designer/1.0 (+https://protectedcentral.com)';
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

/* Only licences that allow commercial use and changes with no conditions —
   CC BY would need a credit on every post, which a graphic cannot promise. */
const FREE = new Set(['cc0', 'pdm']);

const s = (v: unknown, n: number) => String(v ?? '').replace(/\p{Cc}/gu, ' ').trim().slice(0, n);

export interface OvImage { id?: string; title?: string; creator?: string; license?: string; license_version?: string; license_url?: string; foreign_landing_url?: string; url?: string; thumbnail?: string; width?: number; height?: number; source?: string; provider?: string; mature?: boolean; filetype?: string }

export interface FreePhoto {
  id: string; title: string; creator: string; license: string; licenseUrl: string;
  landing: string; width: number; height: number; provider: string;
}

export function cleanPhoto(o: OvImage): FreePhoto | null {
  const code = String(o.license ?? '').toLowerCase();
  if (!o.id || !o.url || !FREE.has(code) || o.mature) return null;
  return {
    id: String(o.id), title: s(o.title, 120) || 'Untitled', creator: s(o.creator, 120),
    license: code === 'cc0' ? 'CC0 1.0 (public domain dedication)' : 'Public Domain Mark',
    licenseUrl: s(o.license_url, 300), landing: s(o.foreign_landing_url, 400),
    width: Number(o.width) || 0, height: Number(o.height) || 0, provider: s(o.source ?? o.provider, 60),
  };
}

/**
 * One page of free pictures for a phrase.
 *
 * `ok: false` means Openverse did not answer — distinct from an empty list,
 * because "the library is down" and "nothing matched" need different words
 * on the screen and in a run's detail.
 */
export async function searchFreePhotos(
  env: Env, q: string, opts: { page?: number; pageSize?: number; wide?: boolean } = {},
): Promise<{ ok: true; photos: FreePhoto[] } | { ok: false }> {
  const page = Math.max(1, Math.min(5, opts.page ?? 1));
  const size = Math.max(1, Math.min(50, opts.pageSize ?? 24));
  const extra = opts.wide ? '&aspect_ratio=wide&category=photograph' : '';
  const r = await fetch(`${ovBase(env)}/v1/images/?q=${encodeURIComponent(q)}&license=cc0,pdm&mature=false&page_size=${size}&page=${page}${extra}`, { headers: { 'user-agent': OV_UA, accept: 'application/json' }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!r?.ok) return { ok: false };
  const data = await r.json<{ results?: OvImage[] }>().catch(() => ({ results: [] as OvImage[] }));
  return { ok: true, photos: (data.results ?? []).map(cleanPhoto).filter((p): p is FreePhoto => !!p) };
}

/**
 * The picture itself, re-checked by id first.
 *
 * Re-checked because an id in a stored post or a URL is a claim: the licence
 * is read again from Openverse rather than trusted from whoever wrote the id.
 * The caller decides whether to stream `res.body` or read the bytes.
 */
export async function fetchFreePhoto(env: Env, id: string):
  Promise<{ ok: true; res: Response; type: string; photo: FreePhoto } | { ok: false; status: number; reason: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, status: 400, reason: 'bad id' };
  const meta = await fetch(`${ovBase(env)}/v1/images/${id}/`, { headers: { 'user-agent': OV_UA, accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
    .then(r => (r.ok ? r.json<OvImage>() : null)).catch(() => null);
  const p = meta ? cleanPhoto(meta) : null;
  if (!p || !meta?.url) return { ok: false, status: 404, reason: 'not a free picture' };
  const img = await fetch(meta.url, { headers: { 'user-agent': OV_UA }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  const type = img?.headers.get('content-type') ?? '';
  if (!img?.ok || !/^image\/(jpeg|png|webp|gif)/.test(type)) return { ok: false, status: 502, reason: 'the picture could not be fetched' };
  const len = Number(img.headers.get('content-length') ?? 0);
  if (len > MAX_PHOTO_BYTES) return { ok: false, status: 413, reason: 'too large' };
  return { ok: true, res: img, type, photo: p };
}
