/**
 * The Media Center's pictures, from the browser (routes/media.ts).
 *
 * Saving is three steps and says "saved" only after the third: a signed
 * upload link, the bytes, and `commit`, where the server reads the file back
 * and checks it really is the PNG or JPEG it claims to be.
 */
import { API_BASE } from '../../../services/apiBase';
import { sessionToken } from '../../../services/auth';
import { getActiveAccountId } from '../../../services/tenancy';

export interface MediaItem {
  id: string; kind: 'graphic' | 'upload'; name: string; mime: string; bytes: number; width: number; height: number;
  designId: string; source: Record<string, string>; createdAt: string; url: string; downloadUrl: string;
}
export interface FoundPhoto { id: string; title: string; creator: string; license: string; licenseUrl: string; landing: string; width: number; height: number; provider: string; src: string }

type Answer<T> = ({ success: true } & T) | { success: false; error?: string; code?: string };

async function call<T>(action: string, extra: Record<string, unknown> = {}): Promise<Answer<T>> {
  try {
    const r = await fetch(`${API_BASE}/api/media.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token: sessionToken(), accountId: getActiveAccountId(), ...extra }),
    });
    return await r.json().catch(() => ({ success: false, error: `The server answered ${r.status}.` })) as Answer<T>;
  } catch {
    return { success: false, error: 'Could not reach the server — check your connection.' };
  }
}

export const listMedia = (kind?: 'graphic' | 'upload') => call<{ items: MediaItem[] }>('list', { kind: kind ?? '' });
export const deleteMedia = (id: string) => call<Record<string, never>>('delete', { id });
export const renameMedia = (id: string, name: string) => call<Record<string, never>>('rename', { id, name });
export const searchPhotos = (q: string, page = 1) => call<{ photos: FoundPhoto[]; note: string }>('photo_search', { q, page });

/** Put a picture in the Media Center. Resolves only once the server has checked and kept it. */
export async function saveToMedia(blob: Blob, meta: { name: string; kind: 'graphic' | 'upload'; designId?: string; width?: number; height?: number; source?: Record<string, string> }): Promise<{ ok: true; item: MediaItem } | { ok: false; error: string }> {
  const mime = blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  const u = await call<{ id: string; url: string; name: string; key: string }>('upload_url', { mime, bytes: blob.size });
  if (!u.success) return { ok: false, error: u.error ?? 'The upload could not start.' };
  const put = await fetch(`${u.url}&name=${u.name}&type=${encodeURIComponent(mime)}`, { method: 'PUT', body: blob })
    .then(r => r.json()).catch(() => ({ success: false })) as { success?: boolean; error?: string };
  if (!put.success) return { ok: false, error: `The picture did not upload${put.error ? ` (${put.error})` : ''} — try again.` };
  const c = await call<{ item: MediaItem | null }>('commit', { id: u.id, key: u.key, ...meta });
  if (!c.success) return { ok: false, error: c.error ?? 'The picture was not accepted.' };
  if (!c.item) return { ok: false, error: 'The picture was stored but could not be read back — refresh the Media Center to check.' };
  return { ok: true, item: c.item };
}

/* `media:<id>` → a signed address, kept for the hour it is good for. */
const cache = new Map<string, { url: string; at: number }>();
const waiting = new Map<string, Promise<string | null>>();
export function resolveMedia(id: string): Promise<string | null> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < 50 * 60_000) return Promise.resolve(hit.url);
  const had = waiting.get(id);
  if (had) return had;
  const p = call<{ urls: Record<string, string> }>('url', { ids: [id] }).then(r => {
    waiting.delete(id);
    const url = r.success ? r.urls[id] ?? null : null;
    if (url) cache.set(id, { url, at: Date.now() });
    return url;
  });
  waiting.set(id, p);
  return p;
}

/**
 * A picture from the customer's computer, made ready to design with: never
 * wider than 2000px (a phone photo is often 4000), as a JPEG unless it has
 * transparency worth keeping (a logo).
 */
export async function preparePicture(file: File, maxSide = 2000): Promise<{ blob: Blob; width: number; height: number }> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Choose a PNG, JPEG or WebP picture.');
  if (file.size > 25 * 1024 * 1024) throw new Error('That picture is over 25 MB — choose a smaller one.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That file could not be read as a picture.')); i.src = url; });
    const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const png = file.type === 'image/png' || file.type === 'image/gif';
    const blob = await new Promise<Blob | null>(res => c.toBlob(res, png ? 'image/png' : 'image/jpeg', 0.88));
    if (!blob) throw new Error('The picture could not be prepared.');
    return { blob, width: c.width, height: c.height };
  } finally { URL.revokeObjectURL(url); }
}

/** The same picture as a data URL — kept in the design itself when Media storage is not set up. */
export const asDataUrl = (blob: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Could not read the picture.')); r.readAsDataURL(blob); });
