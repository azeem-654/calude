/**
 * Where Video Studio's files live, and who may touch them.
 *
 * Everything is in R2 under `v/<workspace>/<project>/…` — the source (never
 * changed once uploaded), the editor's proxy, transcript pieces, renders,
 * captions, thumbnails. A browser or the engine reaches a file only through a
 * **signed, short-lived token** naming the workspace, the exact key (or a
 * key prefix, for an engine job's outputs) and what it may do with it. The
 * token is issued only after the session's workspace check, and
 * /api/video-file.php refuses any key outside the workspace it names — so a
 * leaked link reaches one file for an hour or two, and never another
 * workspace's.
 *
 * Tokens are HMACs with an install secret (`installSecret`, wrapped like the
 * rest), not R2 presigned URLs: there are no S3 keys anywhere.
 */
import type { Env } from '../db';
import { installSecret } from '../db';

/** `listen`: a royalty-free track heard before it is chosen, by its library id (`u`). */
export type Mode = 'get' | 'put' | 'up' | 'poke' | 'listen';

export interface Grant {
  /** Workspace. */
  a: string;
  /** Exact key (get, up) or prefix ending in '/' (put). */
  k: string;
  m: Mode;
  /** Expiry, Unix seconds. */
  x: number;
  /** Upload row (up), job (poke) or library track (listen). */
  u?: string;
  /** Download file name (get). */
  d?: string;
  /** Project (poke). */
  p?: string;
}

const enc = new TextEncoder();
const b64url = (b: ArrayBuffer | Uint8Array) => {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s: string) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '==='.slice((t.length + 3) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};

let keyCache: { hex: string; key: CryptoKey } | null = null;
async function hmacKey(env: Env): Promise<CryptoKey> {
  const hex = await installSecret(env.DB, 'video_url');
  if (keyCache?.hex === hex) return keyCache.key;
  const raw = Uint8Array.from(hex.match(/../g) ?? [], h => parseInt(h, 16));
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  keyCache = { hex, key };
  return key;
}

export async function sign(env: Env, g: Omit<Grant, 'x'>, seconds: number): Promise<string> {
  /* The workspace as keys spell it (`safe`), so a link always matches its own path. */
  /* The expiry is rounded up to the hour, so the same file asked for again in
     the same hour gets the same link. A link that changed on every poll made
     the editor's <video> reload its source every few seconds — the preview
     played three seconds and stopped. */
  const x = Math.ceil((Math.floor(Date.now() / 1000) + seconds) / 3600) * 3600;
  const body = b64url(enc.encode(JSON.stringify({ ...g, a: safe(g.a), x })));
  const sig = b64url(await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(body))).slice(0, 43);
  return `${body}.${sig}`;
}

export async function verify(env: Env, token: string | null): Promise<Grant | null> {
  if (!token || token.length > 2000) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = b64url(await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(body))).slice(0, 43);
  if (want.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff) return null;
  let g: Grant;
  try { g = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Grant; } catch { return null; }
  if (!g || typeof g.a !== 'string' || typeof g.k !== 'string' || !(g.x > Date.now() / 1000)) return null;
  /* The key must sit inside the workspace the token names — belt and braces
     on top of the signature, so a bug that signed a wrong key still cannot
     reach across workspaces. */
  if (!g.k.startsWith(`v/${g.a}/`) || g.k.includes('..')) return null;
  return g;
}

const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '');
export const projectPrefix = (accountId: string, projectId: string) => `v/${safe(accountId)}/${safe(projectId)}/`;
export const workspacePrefix = (accountId: string) => `v/${safe(accountId)}/`;

export async function fileUrl(env: Env, origin: string, accountId: string, key: string, seconds = 7200, download = ''): Promise<string> {
  const t = await sign(env, { a: safe(accountId), k: key, m: 'get', ...(download ? { d: download.replace(/[^\w. -]/g, '').slice(0, 80) } : {}) }, seconds);
  return `${origin}/api/video-file.php?t=${t}`;
}

export async function uploadPrefixUrl(env: Env, origin: string, accountId: string, prefix: string, seconds = 6 * 3600): Promise<string> {
  return `${origin}/api/video-file.php?t=${await sign(env, { a: safe(accountId), k: prefix, m: 'put' }, seconds)}`;
}

export async function pokeUrl(env: Env, origin: string, accountId: string, projectId: string, jobId: string): Promise<string> {
  return `${origin}/api/video-file.php?t=${await sign(env, { a: safe(accountId), k: projectPrefix(accountId, projectId), m: 'poke', u: jobId, p: projectId }, 8 * 3600)}`;
}

/** Everything under a prefix, deleted a thousand at a time (R2's list page). */
export async function deletePrefix(env: Env, prefix: string): Promise<number> {
  if (!env.VIDEO || !prefix.startsWith('v/')) return 0;
  let n = 0, cursor: string | undefined;
  for (let i = 0; i < 50; i++) {
    const page = await env.VIDEO.list({ prefix, cursor, limit: 1000 });
    if (page.objects.length) { await env.VIDEO.delete(page.objects.map(o => o.key)); n += page.objects.length; }
    if (!page.truncated) break;
    cursor = page.cursor;
  }
  return n;
}

/** Bytes a workspace keeps in Video Studio — for its storage allowance. */
export async function storedBytes(env: Env, accountId: string): Promise<number> {
  if (!env.VIDEO) return 0;
  let n = 0, cursor: string | undefined;
  for (let i = 0; i < 20; i++) {
    const page = await env.VIDEO.list({ prefix: workspacePrefix(accountId), cursor, limit: 1000 });
    for (const o of page.objects) n += o.size;
    if (!page.truncated) break;
    cursor = page.cursor;
  }
  return n;
}
