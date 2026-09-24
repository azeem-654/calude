/**
 * Files somebody drops on the request box, read in the browser.
 *
 * ── Why nothing is uploaded here ──
 *
 * There is no file store in this deployment (see docs/AUTOPILOT-NEW-PROJECT.md).
 * So a file is read once, here, into whatever the next step needs: a small
 * image for the model to look at and for a product to show, a PDF for the model
 * to read, the text of a spreadsheet for the importer. Nothing is kept after the
 * wizard closes except what the build writes into real records.
 *
 * ── Why images are shrunk ──
 *
 * A phone photo is 4 MB; the model needs to see what a product *is*, and a shop
 * listing needs something that loads on a phone. 1000 px on the long side at
 * JPEG 0.82 is typically 100–200 KB — small enough that eighty of them can be
 * imported as product images without any one row being refused for size.
 */
import type { Attachment, AttachmentKind } from '../../../services/projectIntake';

export const MAX_FILES = 120;
const MAX_PDF_BYTES = 3_000_000;
const MAX_TEXT_BYTES = 2_000_000;
const MAX_IMAGE_SOURCE_BYTES = 25_000_000;

export function kindOf(file: File): AttachmentKind {
  const n = file.name.toLowerCase();
  if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|heic)$/.test(n)) return 'image';
  if (file.type === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (/\.(csv|tsv)$/.test(n) || file.type === 'text/csv') return 'sheet';
  if (/\.(txt|md|markdown|json)$/.test(n) || file.type.startsWith('text/')) return 'text';
  return 'other';
}

const readAs = (file: File, how: 'dataUrl' | 'text') => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result ?? ''));
  r.onerror = () => rej(r.error ?? new Error('unreadable'));
  if (how === 'dataUrl') r.readAsDataURL(file); else r.readAsText(file);
});

async function shrink(file: File, maxSide = 1000, quality = 0.82): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('not an image this browser can open'));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (!g) throw new Error('no canvas');
    /* White under transparent PNGs, or they turn black as JPEGs. */
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, h);
    g.drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Read one file into an attachment, or say why not.
 *
 * Refusals are reasons, not codes: somebody who dropped a Word document needs
 * to be told to save it as a PDF, not that "the type is unsupported".
 */
export async function readAttachment(file: File): Promise<{ ok: true; att: Attachment } | { ok: false; error: string }> {
  const kind = kindOf(file);
  const base = { id: `att-${Math.random().toString(36).slice(2, 9)}`, name: file.name.slice(0, 160), mime: file.type || 'application/octet-stream', size: file.size, kind };
  try {
    if (kind === 'image') {
      if (file.size > MAX_IMAGE_SOURCE_BYTES) return { ok: false, error: `${file.name} is larger than 25 MB.` };
      return { ok: true, att: { ...base, mime: 'image/jpeg', dataUrl: await shrink(file) } };
    }
    if (kind === 'pdf') {
      if (file.size > MAX_PDF_BYTES) return { ok: false, error: `${file.name} is over 3 MB — attach a shorter PDF, or the pages that describe the business.` };
      return { ok: true, att: { ...base, mime: 'application/pdf', dataUrl: await readAs(file, 'dataUrl') } };
    }
    if (kind === 'sheet' || kind === 'text') {
      if (file.size > MAX_TEXT_BYTES) return { ok: false, error: `${file.name} is over 2 MB.` };
      return { ok: true, att: { ...base, text: await readAs(file, 'text') } };
    }
    if (/\.(xlsx?|numbers)$/i.test(file.name)) {
      return { ok: false, error: `${file.name} is a spreadsheet file this cannot open — save it as CSV (File → Save as → CSV) and attach that.` };
    }
    if (/\.(docx?|pages|pptx?)$/i.test(file.name)) {
      return { ok: false, error: `${file.name} cannot be read here — save it as a PDF and attach that.` };
    }
    return { ok: false, error: `${file.name} is not an image, PDF, CSV or text file.` };
  } catch (e) {
    return { ok: false, error: `${file.name} could not be read: ${e instanceof Error ? e.message : String(e)}` };
  }
}
