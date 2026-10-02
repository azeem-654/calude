/**
 * Pictures in a chat — a screenshot from a visitor, one back from the business.
 *
 * Both sides of the chat store and serve through here, so the rules cannot
 * drift between them:
 *
 *  - **Images only, decided by the bytes.** The browser's declared type is
 *    whatever the sender says it is; the first bytes of the file are not. An
 *    SVG is refused outright — it is a document that can carry script, not a
 *    picture.
 *  - **Never served as a page.** A file comes back to a POST, as the sniffed
 *    image type, with `nosniff`, a sandboxing CSP and `inline` — so even a
 *    file that somehow was not what it claimed could not be run in either
 *    origin. Nothing links to it by address; the page fetches it and draws it.
 *  - **Small.** The browser shrinks a picture before sending (longest side
 *    1600 px, JPEG); what arrives over 1.5 MB is refused rather than stored.
 *
 * Who may read a given file is decided by the caller — the visitor by
 * conversation and key, the business by workspace — and every query below is
 * already narrowed by that before it touches a row.
 */
import type { Env } from './db';

export const MAX_IMAGE_BYTES = 1_572_864;

export interface Attachment { id: string; mime: string; size: number; w: number; h: number }

type Sniffed = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

/** The image type the bytes say they are, or null. */
export function sniffImage(b: Uint8Array): Sniffed | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
    && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

/**
 * A picture from a request body — a data URL or bare base64 — or the reason
 * it was refused.
 *
 * The length is checked on the text before anything is decoded: a body of
 * forty megabytes of base64 should cost a string comparison, not an
 * allocation.
 */
export function decodeImage(data: unknown): { ok: true; bytes: Uint8Array; mime: Sniffed } | { ok: false; message: string; code: string } {
  let text = typeof data === 'string' ? data : '';
  const comma = text.startsWith('data:') ? text.indexOf(',') : -1;
  if (comma >= 0) text = text.slice(comma + 1);
  text = text.replace(/\s+/g, '');
  if (!text) return { ok: false, message: 'Choose a picture to send.', code: 'no_image' };
  if (text.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4) {
    return { ok: false, message: 'That picture is too large — 1.5 MB at most once it has been shrunk.', code: 'too_large' };
  }
  let bin: string;
  try { bin = atob(text); } catch { return { ok: false, message: 'That picture could not be read.', code: 'not_image' }; }
  if (bin.length > MAX_IMAGE_BYTES) {
    return { ok: false, message: 'That picture is too large — 1.5 MB at most once it has been shrunk.', code: 'too_large' };
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const mime = sniffImage(bytes);
  if (!mime) return { ok: false, message: 'Only pictures can be sent here — JPEG, PNG, GIF or WebP.', code: 'not_image' };
  return { ok: true, bytes, mime };
}

const dim = (v: unknown) => Math.min(Math.max(Math.round(Number(v) || 0), 0), 20_000);

/** Store one, and say what the message should carry about it. */
export async function storeChatFile(env: Env, f: {
  accountId: string; conversationId: string; messageId: string; uploadedBy: 'visitor' | 'agent';
  bytes: Uint8Array; mime: string; w?: unknown; h?: unknown; now: string;
}): Promise<Attachment> {
  /* Random rather than `rid`'s timestamp: reading one still needs the
     conversation's key or the workspace, but an id that cannot be guessed
     is one fewer thing for that check to carry alone. */
  const id = `file-${[...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('')}`;
  const a: Attachment = { id, mime: f.mime, size: f.bytes.length, w: dim(f.w), h: dim(f.h) };
  await env.DB.prepare(
    `INSERT INTO crm_chat_files (id, account_id, conversation_id, message_id, uploaded_by, mime, size, width, height, bytes, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    id, f.accountId, f.conversationId, f.messageId, f.uploadedBy, a.mime, a.size, a.w, a.h,
    f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength), f.now,
  ).run();
  return a;
}

/** What a message's `attachments` column holds, or nothing — never a throw. */
export function parseAttachments(v: unknown): Attachment[] {
  try {
    const list = JSON.parse(String(v ?? '[]'));
    return Array.isArray(list) ? list.filter(a => a && typeof a.id === 'string').slice(0, 4) : [];
  } catch { return []; }
}

/**
 * The bytes of a stored file as a response.
 *
 * D1 hands a BLOB back as an ArrayBuffer or, on older runtimes, as an array
 * of numbers; both are accepted. The type is sniffed again on the way out
 * rather than trusted from the row, so a row written some other way still
 * cannot come back as anything but a picture.
 */
export function fileResponse(raw: unknown, extra: Record<string, string> = {}): Response | null {
  const bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw)
    : ArrayBuffer.isView(raw) ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
      : Array.isArray(raw) ? Uint8Array.from(raw as number[]) : null;
  if (!bytes) return null;
  const mime = sniffImage(bytes);
  if (!mime) return null;
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(bytes.length),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': `inline; filename="picture.${mime.split('/')[1]}"`,
      /* Private: it is somebody's screenshot. Not cached by anything between. */
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      ...extra,
    },
  });
}
