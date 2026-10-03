/**
 * The photo on a widget — the face beside "Azeem from Protected Central".
 *
 * ── Why it is checked by its bytes ──
 *
 * The owner's browser shrinks the picture to at most 256 pixels and sends it
 * as a data URL, and a data URL says what type it is — which proves nothing:
 * anybody can send `data:image/png;base64,` followed by an HTML page. What is
 * stored is decided by the first bytes of the file (PNG's eight-byte
 * signature, JPEG's FF D8 FF), the size the file says it is, and a byte cap.
 * SVG is refused outright: served from this origin and opened directly it is a
 * document that runs here.
 *
 * ── Why the address is a random key ──
 *
 * It is drawn on somebody else's website, so it cannot need a session. The key
 * is random and stored only against the picture, so the address says nothing
 * about which widget or workspace it belongs to and cannot be walked by
 * counting. A new picture gets a new key; the old address stops answering.
 */
import { nowIso, type Env } from './db';
import { publicKey } from './engagement';

/** Plenty for 256 × 256 JPEG; a PNG photograph that size runs nearer 150 KB. */
export const AVATAR_MAX_BYTES = 200_000;
export const AVATAR_MAX_SIDE = 256;

export interface Sniffed { mime: 'image/png' | 'image/jpeg'; width: number; height: number }

/** What an image file really is, from its bytes, or null for anything else. */
export function sniffImage(b: Uint8Array): Sniffed | null {
  /* PNG: the signature, then IHDR is always the first chunk, width and height
     big-endian at 16 and 20. */
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length > 24 && png.every((x, i) => b[i] === x)) {
    if (String.fromCharCode(b[12], b[13], b[14], b[15]) !== 'IHDR') return null;
    const u32 = (o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
    return { mime: 'image/png', width: u32(16), height: u32(20) };
  }
  /* JPEG: FF D8 FF, then walk the segments to the frame header (any SOFn but
     the DHT/JPG/DAC markers that share the range), which holds the size. */
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) return null;
      const m = b[o + 1];
      if (m === 0xff) { o += 1; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { o += 2; continue; }
      const len = (b[o + 2] << 8) | b[o + 3];
      if (len < 2) return null;
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { mime: 'image/jpeg', height: (b[o + 5] << 8) | b[o + 6], width: (b[o + 7] << 8) | b[o + 8] };
      }
      if (m === 0xda || m === 0xd9) return null;
      o += 2 + len;
    }
    return null;
  }
  return null;
}

/** A data URL's bytes, or null when it is not base64 data. */
export function bytesOfDataUrl(v: unknown): Uint8Array | null {
  const s = String(v ?? '');
  const m = /^data:[a-z0-9.+/-]*;base64,([a-z0-9+/=\s]+)$/i.exec(s);
  if (!m) return null;
  try {
    const bin = atob(m[1].replace(/\s+/g, ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export type AvatarResult = { ok: true; key: string } | { ok: false; message: string };

/**
 * Store a widget's photo, replacing any earlier one. The caller has already
 * checked the widget is in `accountId`.
 */
export async function saveAvatar(env: Env, accountId: string, widgetId: string, dataUrl: unknown): Promise<AvatarResult> {
  const bytes = bytesOfDataUrl(dataUrl);
  if (!bytes || !bytes.length) return { ok: false, message: 'That is not a picture file.' };
  if (bytes.length > AVATAR_MAX_BYTES) return { ok: false, message: 'That picture is too large — choose a smaller one.' };
  const img = sniffImage(bytes);
  if (!img) return { ok: false, message: 'Only a PNG or JPEG photo can be used.' };
  if (!img.width || !img.height || img.width > AVATAR_MAX_SIDE || img.height > AVATAR_MAX_SIDE) {
    return { ok: false, message: `The picture must be at most ${AVATAR_MAX_SIDE} pixels a side.` };
  }

  const key = publicKey();
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  await env.DB.prepare('DELETE FROM crm_widget_avatars WHERE account_id = ? AND widget_id = ?').bind(accountId, widgetId).run();
  await env.DB.prepare(
    'INSERT INTO crm_widget_avatars (key, account_id, widget_id, mime, data, created_at) VALUES (?,?,?,?,?,?)',
  ).bind(key, accountId, widgetId, img.mime, btoa(bin), nowIso()).run();
  await env.DB.prepare('UPDATE crm_widgets SET agent_avatar_key = ?, updated_at = ? WHERE id = ? AND account_id = ?')
    .bind(key, nowIso(), widgetId, accountId).run();
  return { ok: true, key };
}

export async function clearAvatar(env: Env, accountId: string, widgetId: string): Promise<void> {
  await env.DB.prepare('DELETE FROM crm_widget_avatars WHERE account_id = ? AND widget_id = ?').bind(accountId, widgetId).run();
  await env.DB.prepare("UPDATE crm_widgets SET agent_avatar_key = '', updated_at = ? WHERE id = ? AND account_id = ?")
    .bind(nowIso(), widgetId, accountId).run();
}

/** The public address of a photo, absolute — it is drawn on other websites. */
export const avatarUrl = (origin: string, key: string): string =>
  key ? `${origin.replace(/\/$/, '')}/api/widget-avatar.php?k=${key}` : '';

/** GET /api/widget-avatar.php?k=<key>. */
export async function handleWidgetAvatar(req: Request, env: Env): Promise<Response> {
  const k = new URL(req.url).searchParams.get('k') ?? '';
  const nope = () => new Response('Not found', {
    status: 404, headers: { 'Content-Type': 'text/plain', 'X-Content-Type-Options': 'nosniff' },
  });
  if (!/^[a-f0-9]{36}$/.test(k)) return nope();
  const row = await env.DB.prepare('SELECT mime, data FROM crm_widget_avatars WHERE key = ?')
    .bind(k).first<{ mime: string; data: string }>().catch(() => null);
  if (!row || (row.mime !== 'image/png' && row.mime !== 'image/jpeg')) return nope();
  const bin = atob(row.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, {
    headers: {
      'Content-Type': row.mime,
      /* The key changes with the picture, so the address can be cached hard. */
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  });
}
