/**
 * thumbnail.ts — composes click-optimized clip thumbnails on a canvas:
 * real footage frame (or gradient fallback) + big stroked headline + emoji,
 * in several visual presets. Output is a JPEG data URL small enough to store
 * on the clip and sync, with an on-demand hi-res render for downloads.
 */

export type ThumbPreset = 'bold' | 'bar' | 'clean' | 'neon';

export const THUMB_PRESETS: { id: ThumbPreset; label: string }[] = [
  { id: 'bold', label: 'Bold Yellow' },
  { id: 'bar', label: 'Title Bars' },
  { id: 'clean', label: 'Clean White' },
  { id: 'neon', label: 'Neon Glow' },
];

export const THUMB_EMOJIS = ['😱', '🔥', '⚠️', '💥', '😳', '🚨', '👀', '🤯'];

export interface ComposeThumbnailOptions {
  /** CORS-safe image URL (yt-thumb.php proxy) or a data/blob URL of a frame. */
  bgImageUrl?: string;
  gradient: string;             // CSS linear-gradient fallback
  headline: string;
  emoji?: string;
  preset: ThumbPreset;
  aspectRatio: '9:16' | '1:1' | '16:9';
  width?: number;               // output width in px (default 360 — small for storage)
  quality?: number;             // JPEG quality (default 0.82)
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Grab a single frame from a local/blob video as a JPEG data URL. */
export function captureVideoFrame(blobUrl: string, timeSec: number, width = 720): Promise<string | null> {
  return new Promise(resolve => {
    const video = document.createElement('video');
    video.src = blobUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    const bail = () => { video.src = ''; resolve(null); };
    video.onerror = bail;
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(timeSec, Math.max(0, video.duration - 0.1));
    };
    video.onseeked = () => {
      try {
        const scale = width / video.videoWidth;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return bail();
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const url = canvas.toDataURL('image/jpeg', 0.85);
        video.src = '';
        resolve(url);
      } catch { bail(); }
    };
    setTimeout(bail, 8000);
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

export async function composeThumbnail(o: ComposeThumbnailOptions): Promise<string> {
  const w = o.width ?? 360;
  const h = Math.round(o.aspectRatio === '9:16' ? w * (16 / 9) : o.aspectRatio === '1:1' ? w : w * (9 / 16));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  /* ── Background: footage frame (cover) or gradient fallback ── */
  const img = o.bgImageUrl ? await loadImage(o.bgImageUrl) : null;
  if (img) {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const srcRatio = iw / ih, dstRatio = w / h;
    let sx = 0, sy = 0, sw = iw, sh = ih;
    if (srcRatio > dstRatio) { sw = ih * dstRatio; sx = (iw - sw) / 2; }
    else { sh = iw / dstRatio; sy = (ih - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  } else {
    const hexes = o.gradient.match(/#[0-9a-fA-F]{3,8}/g) ?? ['#6366f1', '#8b5cf6'];
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, hexes[0]);
    g.addColorStop(1, hexes[1] ?? hexes[0]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  /* ── Scrim: darken bottom two-thirds so the headline pops ── */
  const scrim = ctx.createLinearGradient(0, h * 0.3, 0, h);
  scrim.addColorStop(0, 'rgba(0,0,0,0)');
  scrim.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, w, h);

  /* ── Headline ── */
  const headline = o.headline.toUpperCase();
  const fontSize = Math.round(w * (o.aspectRatio === '16:9' ? 0.085 : 0.115));
  ctx.font = `900 ${fontSize}px Inter, 'Arial Black', Arial, sans-serif`;
  ctx.textAlign = 'center';
  const lines = wrapText(ctx, headline, w * 0.88);
  const lineH = fontSize * 1.12;
  const blockH = lines.length * lineH;
  const baseY = h * 0.9 - blockH + fontSize; // bottom-anchored block

  const accent = (o.gradient.match(/#[0-9a-fA-F]{3,8}/g) ?? ['#8b5cf6'])[0];

  ctx.save();
  if (o.preset === 'bold') {
    // Slight tilt for energy
    ctx.translate(w / 2, baseY + blockH / 2 - fontSize / 2);
    ctx.rotate(-0.03);
    ctx.translate(-w / 2, -(baseY + blockH / 2 - fontSize / 2));
  }
  lines.forEach((ln, i) => {
    const y = baseY + i * lineH;
    if (o.preset === 'bar') {
      const m = ctx.measureText(ln);
      const pad = fontSize * 0.35;
      ctx.fillStyle = '#17191c';
      ctx.fillRect(w / 2 - m.width / 2 - pad, y - fontSize * 0.92, m.width + pad * 2, fontSize * 1.22);
    }
    if (o.preset === 'bold') {
      ctx.lineWidth = Math.max(2, fontSize * 0.16);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000000';
      ctx.strokeText(ln, w / 2, y);
      ctx.fillStyle = '#ffe14d';
    } else if (o.preset === 'clean') {
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = fontSize * 0.35;
      ctx.shadowOffsetY = fontSize * 0.06;
      ctx.fillStyle = '#ffffff';
    } else if (o.preset === 'neon') {
      ctx.shadowColor = accent;
      ctx.shadowBlur = fontSize * 0.55;
      ctx.fillStyle = '#ffffff';
    } else {
      ctx.fillStyle = '#ffffff';
    }
    ctx.fillText(ln, w / 2, y);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  });
  ctx.restore();

  /* ── Emoji sticker (top-right, slight tilt) ── */
  if (o.emoji) {
    const es = Math.round(w * 0.2);
    ctx.save();
    ctx.translate(w * 0.85, h * 0.12);
    ctx.rotate(0.12);
    ctx.font = `${es}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(o.emoji, 0, 0);
    ctx.restore();
  }

  return canvas.toDataURL('image/jpeg', o.quality ?? 0.82);
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
