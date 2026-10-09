/**
 * Background music — tracks that may really be used, and a record of why.
 *
 * Searched in **Openverse** (openverse.org, run by WordPress.org), which
 * indexes openly licensed audio from Jamendo, Freesound, Wikimedia Commons and
 * others and says the licence of every track. Only three licences are asked
 * for, because only these allow a business to put the track under its own
 * video and post it:
 *   - CC0 and Public Domain Mark — no conditions;
 *   - CC BY — credit the artist, which is done for the customer: the credit
 *     line goes into every affected video's description.
 * Never NonCommercial (a business video is commercial), NoDerivatives
 * (setting music to video is an adaptation) or ShareAlike (it would bind the
 * customer's own video to the same licence).
 *
 * A chosen track is fetched by the Worker (never trusted from the browser —
 * its details are read again from Openverse by id) and kept in the
 * workspace's own corner of R2, so the render does not depend on somebody
 * else's server and the licence travels with the file. A customer's own
 * upload is recorded as theirs, with the rights confirmation they ticked.
 */
import type { Env } from '../db';
import { workspacePrefix } from './store';

const ALLOWED = new Set(['cc0', 'pdm', 'by']);
const MAX_BYTES = 25 * 1024 * 1024;

export interface FoundTrack {
  id: string;
  title: string;
  artist: string;
  license: string;
  licenseCode: string;
  licenseUrl: string;
  attribution: string;
  duration: number;
  previewUrl: string;
  pageUrl: string;
  provider: string;
  genres: string[];
}

interface OvAudio {
  id?: string; title?: string; creator?: string; url?: string; license?: string; license_version?: string; license_url?: string;
  attribution?: string; duration?: number | null; filetype?: string | null; filesize?: number | null; foreign_landing_url?: string;
  provider?: string; source?: string; genres?: string[] | null; mature?: boolean;
}

const base = (env: Env) => ((env as Env & { OPENVERSE_BASE?: string }).OPENVERSE_BASE ?? '').trim().replace(/\/$/, '') || 'https://api.openverse.org';
const UA = 'ProtectedCentral-VideoStudio/1.0 (+https://protectedcentral.com)';

export function licenseLabel(code: string, version = ''): string {
  if (code === 'cc0') return 'CC0 (public domain)';
  if (code === 'pdm') return 'Public domain';
  return `CC BY${version ? ` ${version}` : ''}`;
}

function toTrack(a: OvAudio): FoundTrack | null {
  const code = String(a.license ?? '').toLowerCase();
  if (!a.id || !a.url || !ALLOWED.has(code) || a.mature) return null;
  const type = String(a.filetype ?? '').toLowerCase();
  if (type && !['mp3', 'ogg', 'oga', 'm4a', 'aac', 'wav', 'flac'].includes(type)) return null;
  if (a.filesize && a.filesize > MAX_BYTES) return null;
  const seconds = a.duration ? a.duration / 1000 : 0;
  if (seconds && (seconds < 20 || seconds > 20 * 60)) return null;
  const title = String(a.title ?? 'Untitled').slice(0, 120);
  const artist = String(a.creator ?? 'Unknown artist').slice(0, 120);
  const license = licenseLabel(code, String(a.license_version ?? ''));
  return {
    id: a.id, title, artist, license, licenseCode: code, licenseUrl: String(a.license_url ?? ''),
    /* CC BY needs a credit; the other two do not, and none is invented for them. */
    attribution: code === 'by' ? `Music: “${title}” by ${artist} — ${license}${a.foreign_landing_url ? ` (${a.foreign_landing_url})` : ''}` : '',
    duration: Math.round(seconds), previewUrl: a.url, pageUrl: String(a.foreign_landing_url ?? ''),
    provider: String(a.source ?? a.provider ?? ''), genres: (a.genres ?? []).slice(0, 4).map(String),
  };
}

const cache = new Map<string, { at: number; tracks: FoundTrack[] }>();

export async function searchMusic(env: Env, q: string, page = 1): Promise<{ ok: true; tracks: FoundTrack[] } | { ok: false; error: string }> {
  const query = q.replace(/[^\p{L}\p{N}\s-]/gu, ' ').trim().slice(0, 60) || 'calm instrumental';
  const ck = `${query.toLowerCase()}|${page}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < 15 * 60_000) return { ok: true, tracks: hit.tracks };
  const u = `${base(env)}/v1/audio/?q=${encodeURIComponent(query)}&license=cc0,pdm,by&mature=false&page_size=20&page=${Math.max(1, Math.min(5, page))}`;
  try {
    const r = await fetch(u, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
    if (r.status === 429) return { ok: false, error: 'The music library is busy — try again in a minute.' };
    if (!r.ok) return { ok: false, error: `The music library answered ${r.status}.` };
    const d = await r.json<{ results?: OvAudio[] }>();
    const tracks = (d.results ?? []).map(toTrack).filter((t): t is FoundTrack => !!t);
    cache.set(ck, { at: Date.now(), tracks });
    return { ok: true, tracks };
  } catch (e) {
    return { ok: false, error: `The music library could not be reached (${String((e as Error).message ?? e).slice(0, 80)}).` };
  }
}

/** One track's details, read again from Openverse — what the browser said about it is not used. */
const byId = new Map<string, { at: number; t: FoundTrack & { fileUrl: string } }>();
export async function trackById(env: Env, id: string): Promise<FoundTrack & { fileUrl: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const hit = byId.get(id);
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit.t;
  const r = await fetch(`${base(env)}/v1/audio/${id}/`, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!r?.ok) return null;
  const a = await r.json<OvAudio>();
  const t = toTrack(a);
  if (!t) return null;
  const found = { ...t, fileUrl: String(a.url) };
  if (byId.size > 500) byId.clear();
  byId.set(id, { at: Date.now(), t: found });
  return found;
}

/**
 * A track heard before it is chosen, fetched by the Worker from the address
 * Openverse gives for that id — so the customer's browser never calls the
 * library or its hosts itself, and no address from a request is fetched.
 */
export async function listenTo(env: Env, id: string, range: string | null): Promise<Response> {
  const t = await trackById(env, id);
  if (!t) return new Response('Not found', { status: 404 });
  const r = await fetch(t.fileUrl, { headers: { 'user-agent': UA, ...(range ? { range } : {}) }, redirect: 'follow', signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!r || !(r.ok || r.status === 206)) return new Response('The track could not be fetched.', { status: 502 });
  const h = new Headers();
  for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges']) { const v = r.headers.get(k); if (v) h.set(k, v); }
  if (!/^audio\//.test(h.get('content-type') ?? '')) h.set('content-type', 'audio/mpeg');
  h.set('cache-control', 'private, max-age=3600');
  h.set('x-content-type-options', 'nosniff');
  h.set('content-security-policy', "default-src 'none'; sandbox");
  return new Response(r.body, { status: r.status, headers: h });
}

/** Is this the start of an audio file (MP3, Ogg, WAV, FLAC, M4A)? */
export function looksLikeAudio(b: Uint8Array): string | null {
  if (b.length < 12) return null;
  const s = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
  if (s(0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3';
  if (s(0, 4) === 'OggS') return 'ogg';
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WAVE') return 'wav';
  if (s(0, 4) === 'fLaC') return 'flac';
  if (s(4, 4) === 'ftyp') return 'm4a';
  return null;
}

/** Fetch a licensed track into the workspace's music folder (once) and return its key. */
export async function storeTrack(env: Env, accountId: string, t: FoundTrack & { fileUrl: string }): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  if (!env.VIDEO) return { ok: false, error: 'Video storage is not set up.' };
  const prefix = `${workspacePrefix(accountId)}music/ov-${t.id}`;
  const listed = await env.VIDEO.list({ prefix, limit: 1 });
  if (listed.objects[0]) return { ok: true, key: listed.objects[0].key };
  const r = await fetch(t.fileUrl, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(45_000) }).catch(e => e as Error);
  if (r instanceof Error || !r.ok) return { ok: false, error: `The track could not be downloaded${r instanceof Error ? '' : ` (${r.status})`}.` };
  const len = Number(r.headers.get('content-length') ?? 0);
  if (len > MAX_BYTES) return { ok: false, error: 'That track is too large (over 25 MB).' };
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length > MAX_BYTES) return { ok: false, error: 'That track is too large (over 25 MB).' };
  const kind = looksLikeAudio(bytes);
  if (!kind) return { ok: false, error: 'The file that came back is not audio.' };
  const key = `${prefix}.${kind}`;
  await env.VIDEO.put(key, bytes, { httpMetadata: { contentType: kind === 'mp3' ? 'audio/mpeg' : `audio/${kind}` }, customMetadata: { license: t.license, title: t.title.slice(0, 100) } });
  return { ok: true, key };
}

/** Mood words → a search that finds background music rather than songs with vocals. */
export function musicQuery(words: string): string {
  const w = words.toLowerCase();
  const mood = ['calm', 'upbeat', 'happy', 'corporate', 'inspiring', 'chill', 'ambient', 'energetic', 'cinematic', 'acoustic', 'piano', 'lofi', 'lo-fi', 'jazz', 'electronic', 'motivational', 'relaxing', 'soft', 'dramatic', 'epic', 'funky', 'guitar']
    .filter(m => w.includes(m));
  return `${mood.length ? mood.join(' ') : 'calm'} instrumental`;
}
