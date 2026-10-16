/**
 * "Edit in Graphics Designer & Editor": one of a video's thumbnails, opened as
 * a new design so it can be redesigned with the designer's own tools.
 *
 * The narrowest door there is: the PNG's bytes are fetched now (its signed
 * link expires on the hour, so a link handed to the designer would stop
 * working in a saved design), drawn at the video's size and kept on the
 * design as its background — a JPEG data URL, because designs live in
 * `crm_social_posts`, which is synced whole and refused over 2 MB; a
 * 1280×720 JPEG is a few hundred KB where the PNG would be well over one.
 * The canvas is half the video's size and the designer exports at twice its
 * canvas, so Export PNG and "Use as this video's thumbnail" come out at
 * exactly 1280×720 (or 1080×1920 for a Short's cover).
 */
import type { DesignPost } from '../SocialCreator/types';
import type { OutputView, ThumbView } from '../../services/videoStudio';
import { getActiveAccountId } from '../../services/tenancy';

export async function thumbAsDesign(o: OutputView, t: ThumbView, projectId: string): Promise<{ ok: true; post: DesignPost } | { ok: false; error: string }> {
  const W = t.width || (o.kind === 'short' ? 1080 : 1280), H = t.height || (o.kind === 'short' ? 1920 : 720);
  if (!((W === 1280 && H === 720) || (W === 1080 && H === 1920))) return { ok: false, error: 'Only 1280×720 thumbnails and 1080×1920 covers can be opened in the designer.' };
  let dataUrl = '';
  try {
    const r = await fetch(t.url);
    if (!r.ok) return { ok: false, error: 'The thumbnail could not be read — refresh the page and try again.' };
    const bmp = await createImageBitmap(await r.blob());
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    c.getContext('2d')!.drawImage(bmp, 0, 0, W, H);
    dataUrl = c.toDataURL('image/jpeg', 0.9);
  } catch {
    return { ok: false, error: 'The thumbnail could not be read — refresh the page and try again.' };
  }
  const now = new Date().toISOString();
  const title = ((o.meta as { titles?: string[] }).titles?.[0] ?? o.title ?? '').slice(0, 80);
  const post: DesignPost = {
    id: `post-${Date.now()}`,
    name: `Thumbnail · ${title || 'video'}`.slice(0, 90),
    platform: 'youtube',
    aspectRatio: W > H ? '16:9' : '9:16',
    canvasWidth: W / 2, canvasHeight: H / 2,
    background: { type: 'image', imageUrl: dataUrl, imageFit: 'cover', color: '#000000', gradientStart: '#6366f1', gradientEnd: '#a855f7', gradientAngle: 135 },
    elements: [],
    status: 'draft',
    tags: ['thumbnail', 'video studio'],
    videoThumb: { projectId, outputId: o.id, accountId: getActiveAccountId() ?? '', width: W, height: H, title },
    createdAt: now, updatedAt: now,
  };
  return { ok: true, post };
}
