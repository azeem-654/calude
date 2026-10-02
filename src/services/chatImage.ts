/**
 * Pictures in a chat, on the business side — the twin of `shrink` in
 * public/widget.js, which cannot import this (it runs on strangers' pages
 * with no bundle).
 *
 * Shrunk in the browser before it is sent: the longest side to 1600 px, JPEG
 * at 0.8, then lower quality, then smaller, until it is under 1.5 MB — the cap
 * the server refuses above (worker/src/lib/chatFiles.ts). A screenshot is
 * mostly text and reads perfectly well at that size; a phone photo is several
 * megabytes that nobody needs in a support thread.
 */

export const MAX_SIDE = 1600;
export const MAX_BYTES = 1_572_864;

export interface ShrunkImage { data: string; w: number; h: number }

export interface ChatAttachment { id: string; mime?: string; size?: number; w?: number; h?: number }

export function shrinkImage(file: Blob): Promise<ShrunkImage> {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type || '')) { reject(new Error('Only pictures can be sent here.')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      if (!nw || !nh) { reject(new Error('That file could not be read as a picture.')); return; }
      let scale = Math.min(1, MAX_SIDE / Math.max(nw, nh));
      let q = 0.8;
      for (let i = 0; i < 8; i++) {
        const w = Math.max(1, Math.round(nw * scale));
        const h = Math.max(1, Math.round(nh * scale));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        if (!g) { reject(new Error('This browser cannot prepare a picture.')); return; }
        /* White under a transparent screenshot, or JPEG turns it black. */
        g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
        g.drawImage(img, 0, 0, w, h);
        const data = c.toDataURL('image/jpeg', q);
        const bytes = Math.floor((data.length - data.indexOf(',') - 1) * 3 / 4);
        if (bytes <= MAX_BYTES) { resolve({ data, w, h }); return; }
        if (q > 0.6) q -= 0.1; else scale *= 0.75;
      }
      reject(new Error('That picture is too large to send, even made smaller.'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as a picture.')); };
    img.src = url;
  });
}

/** A message's `attachments` column, or nothing — never a throw. */
export function parseAttachments(v: unknown): ChatAttachment[] {
  if (Array.isArray(v)) return v.filter(a => a && typeof a.id === 'string') as ChatAttachment[];
  try {
    const list = JSON.parse(String(v ?? '[]'));
    return Array.isArray(list) ? list.filter(a => a && typeof a.id === 'string') : [];
  } catch { return []; }
}

/** The first picture on a paste, if there is one. */
export function pastedImage(e: { clipboardData: DataTransfer | null }): File | null {
  const items = e.clipboardData?.items;
  if (!items) return null;
  for (let i = 0; i < items.length; i++) {
    if (items[i].kind === 'file' && /^image\//.test(items[i].type)) return items[i].getAsFile();
  }
  return null;
}
