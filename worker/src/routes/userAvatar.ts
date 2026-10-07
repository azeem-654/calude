/**
 * /api/user-avatar.php — a person's own photo.
 *
 *   GET  ?k=<key>                  the picture (no session: the key is random)
 *   POST { token, action: 'get' }   this person's key, or '' when they have none
 *   POST { token, action: 'set', image }   a PNG/JPEG data URL, ≤256 px a side
 *   POST { token, action: 'clear' }
 *
 * The bytes are checked the way a widget's photo is (lib/widgetAvatar.ts):
 * by their own signature and size, never by what the data URL claims, and
 * SVG is refused because served from this origin it is a document that runs
 * here. Without a photo the browser draws an illustrated avatar from the
 * person's address (services/userAvatar.ts) — nothing is stored for that.
 */
import { body, fail, json } from '../lib/http';
import { nowIso, userFromToken, type Env } from '../lib/db';
import { publicKey } from '../lib/engagement';
import { AVATAR_MAX_BYTES, AVATAR_MAX_SIDE, bytesOfDataUrl, sniffImage } from '../lib/widgetAvatar';
import { rateLimit } from '../lib/rateLimit';

interface Req { action?: string; token?: string; image?: string }

const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain', 'X-Content-Type-Options': 'nosniff' } });

export async function handleUserAvatar(req: Request, env: Env): Promise<Response> {
  if (req.method === 'GET') {
    const k = new URL(req.url).searchParams.get('k') ?? '';
    if (!/^[a-f0-9]{36}$/.test(k)) return notFound();
    const row = await env.DB.prepare('SELECT mime, data FROM crm_user_avatars WHERE key = ?')
      .bind(k).first<{ mime: string; data: string }>().catch(() => null);
    if (!row || (row.mime !== 'image/png' && row.mime !== 'image/jpeg')) return notFound();
    const bin = atob(row.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Response(bytes, {
      headers: {
        'Content-Type': row.mime,
        /* A new picture gets a new key, so an address never changes what it shows. */
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
      },
    });
  }

  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });
  const email = user.email.toLowerCase();
  const act = String(d.action ?? '').slice(0, 10);

  if (act === 'get') {
    const row = await env.DB.prepare('SELECT key FROM crm_user_avatars WHERE user_email = ?').bind(email).first<{ key: string }>().catch(() => null);
    return json({ success: true, key: row?.key ?? '' });
  }
  if (act === 'clear') {
    await env.DB.prepare('DELETE FROM crm_user_avatars WHERE user_email = ?').bind(email).run();
    return json({ success: true, key: '' });
  }
  if (act === 'set') {
    const v = await rateLimit(env, { what: 'user-avatar', who: email, max: 20, windowSeconds: 3600 });
    if (!v.allowed) return fail('Too many changes — try again later.', 429, { field: 'profile.photo' });
    const bytes = bytesOfDataUrl(d.image);
    if (!bytes || !bytes.length) return fail('That is not a picture file.', 200, { field: 'profile.photo' });
    if (bytes.length > AVATAR_MAX_BYTES) return fail('That picture is too large — choose a smaller one.', 200, { field: 'profile.photo' });
    const img = sniffImage(bytes);
    if (!img) return fail('Only a PNG or JPEG photo can be used.', 200, { field: 'profile.photo' });
    if (!img.width || !img.height || img.width > AVATAR_MAX_SIDE || img.height > AVATAR_MAX_SIDE) {
      return fail(`The picture must be at most ${AVATAR_MAX_SIDE} pixels a side.`, 200, { field: 'profile.photo' });
    }
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const key = publicKey();
    await env.DB.prepare('DELETE FROM crm_user_avatars WHERE user_email = ?').bind(email).run();
    await env.DB.prepare('INSERT INTO crm_user_avatars (key, user_email, mime, data, created_at) VALUES (?,?,?,?,?)')
      .bind(key, email, img.mime, btoa(bin), nowIso()).run();
    return json({ success: true, key });
  }
  return fail(`"${act}" is not something this endpoint does.`);
}
