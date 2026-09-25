/**
 * A logo, made small and safe enough to keep on a client's profile.
 *
 * ── Why every logo goes through a canvas ──
 *
 * Two reasons, and either would be enough. A logo lives inline on the profile
 * (ProjectLogo.tsx explains why there is no file store), and the profile rides
 * along with every board load — so 320px on the long side, which is sharp in
 * the corner of a 1080px post and in an email header. And an SVG from a
 * stranger's website is a document, not a picture; drawn onto a canvas it
 * becomes pixels, which is the only form the server will serve back
 * (`handleLogo` refuses SVG outright).
 *
 * PNG rather than JPEG, because logos are mostly flat colour on transparency
 * and a JPEG puts a white box round them on every coloured background.
 */
import { LOGO_MAX_BYTES, LOGO_MAX_SIDE } from '../../../services/designOptions';

export async function shrinkLogo(src: string): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('This browser could not open that image.'));
      i.src = src;
    });
    /* An SVG without width and height reports 0×0 in some browsers — give it
       a size to be drawn at rather than a blank canvas. */
    const nw = img.naturalWidth || LOGO_MAX_SIDE;
    const nh = img.naturalHeight || LOGO_MAX_SIDE;
    const scale = Math.min(1, LOGO_MAX_SIDE / Math.max(nw, nh));
    const w = Math.max(1, Math.round(nw * scale));
    const h = Math.max(1, Math.round(nh * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (!g) return { ok: false, error: 'This browser cannot resize images.' };
    g.drawImage(img, 0, 0, w, h);
    let out = c.toDataURL('image/png');
    /* A photograph posing as a logo can stay large as a PNG; WebP keeps it
       under the cap and still keeps the transparency. */
    if (out.length > LOGO_MAX_BYTES) out = c.toDataURL('image/webp', 0.9);
    if (out.length > LOGO_MAX_BYTES) return { ok: false, error: 'That image is too detailed to use as a logo. Try a simpler version, ideally a PNG with a transparent background.' };
    return { ok: true, dataUrl: out };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'That image could not be read.' };
  }
}

/** A file somebody picked, as a shrunk logo. */
export async function logoFromFile(file: File): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  if (!/^image\//.test(file.type) && !/\.(png|jpe?g|webp|gif|svg)$/i.test(file.name)) {
    return { ok: false, error: 'Choose an image — PNG, SVG, JPG or WebP.' };
  }
  if (file.size > 8_000_000) return { ok: false, error: 'That file is over 8 MB. A logo is usually well under 1 MB.' };
  const url = URL.createObjectURL(file);
  try { return await shrinkLogo(url); } finally { URL.revokeObjectURL(url); }
}
