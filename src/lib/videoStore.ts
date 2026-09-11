/**
 * Keeping an uploaded video across a reload.
 *
 * ── The defect this exists for ──
 *
 * A project stores `sourceBlobUrl`, made by `URL.createObjectURL(file)`, and
 * the project is persisted to localStorage. A blob URL is only valid for the
 * life of the document that created it: reload the page and the string is still
 * in storage, still looks like a URL, and points at nothing.
 *
 * What that looked like: the shorts kept their previews, because those are data
 * URLs, while the source video showed an empty player. It also quietly broke
 * re-downloading a clip and retrying a failed analysis — both fetch that same
 * dead URL — so the damage was wider than the missing thumbnail that made
 * somebody notice.
 *
 * ── Why IndexedDB ──
 *
 * localStorage holds strings and caps out around 5MB; a phone video is tens or
 * hundreds of megabytes. IndexedDB stores the Blob itself, with no base64
 * inflation, and is the only browser store that will take one. The server is
 * the wrong home for this — nothing else about a video needs to leave the
 * machine, and uploading hundreds of megabytes to make a thumbnail work would
 * be a poor trade for the customer's data allowance.
 */

const DB_NAME = 'crm_video_sources';
const STORE = 'sources';
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('No IndexedDB here.')); return; }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open the video store.'));
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  let db: IDBDatabase;
  try { db = await open(); } catch { return null; }
  return new Promise<T | null>(resolve => {
    let out: T | null = null;
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => { out = req.result; };
    t.oncomplete = () => { db.close(); resolve(out); };
    /* A failure here is never fatal: the caller falls back to "not available",
       which is the honest answer and better than a thrown error on a page
       somebody is only trying to look at. */
    t.onerror = () => { db.close(); resolve(null); };
    t.onabort = () => { db.close(); resolve(null); };
  });
}

/** Keep the file, so the project still works tomorrow. */
export async function putSourceVideo(projectId: string, file: Blob): Promise<boolean> {
  const r = await tx<IDBValidKey>('readwrite', s => s.put(file, projectId));
  return r !== null;
}

export async function getSourceVideo(projectId: string): Promise<Blob | null> {
  const r = await tx<Blob>('readonly', s => s.get(projectId));
  return r instanceof Blob ? r : null;
}

export async function deleteSourceVideo(projectId: string): Promise<void> {
  await tx<undefined>('readwrite', s => s.delete(projectId));
}

/**
 * A usable blob URL for a project's source, or null.
 *
 * Cached per project for the life of the document, because every caller that
 * wants one — the preview, the exporter, a retry — would otherwise mint its own
 * and leak it. Revoked together on unload.
 */
const urls = new Map<string, string>();

export async function sourceVideoUrl(projectId: string): Promise<string | null> {
  const held = urls.get(projectId);
  if (held) return held;
  const blob = await getSourceVideo(projectId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(projectId, url);
  return url;
}

export function releaseSourceVideoUrl(projectId: string): void {
  const held = urls.get(projectId);
  if (held) { URL.revokeObjectURL(held); urls.delete(projectId); }
}

/**
 * Is this string a blob URL from a previous visit?
 *
 * A dead one cannot be told apart by looking at it, so it is fetched. This is
 * the check that stops the app presenting an empty player as though the video
 * were merely slow to load.
 */
export async function blobUrlAlive(url: string | undefined): Promise<boolean> {
  if (!url || !url.startsWith('blob:')) return false;
  try {
    const r = await fetch(url, { method: 'GET' });
    return r.ok;
  } catch {
    return false;
  }
}
