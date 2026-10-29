/**
 * The Screen Recorder's plumbing that is not React: what this browser can
 * record, frame rate and quality, the camera bubble's geometry, the frame
 * (background, padding, roundness, shadow) and its compositor, automatic
 * zoom, plain-language errors and the clock that keeps drawing while the tab
 * is in the background.
 *
 * Everything here runs in the browser and only after the person presses a
 * button: nothing asks for a camera, a microphone or a screen on its own.
 */
import { fixWebmDuration } from '../../lib/webmDuration';
import ClockWorker from './recorderClock.worker.ts?worker';

export type RecMode = 'screen' | 'screen-cam' | 'cam';
export type BubbleSize = 'S' | 'M' | 'L';
export interface Bubble { x: number; y: number; size: BubbleSize; shape: 'circle' | 'rounded'; mirror: boolean }
export const CORNERS = { tl: { x: 0, y: 0 }, tr: { x: 1, y: 0 }, bl: { x: 0, y: 1 }, br: { x: 1, y: 1 } } as const;
export type Corner = keyof typeof CORNERS;

/** What this browser offers, asked once. */
export interface Support { secure: boolean; devices: boolean; display: boolean; recorder: boolean; mime: Mime | null; cursor: boolean; pip: boolean }
export interface Mime { mime: string; type: 'video/webm' | 'video/mp4'; ext: 'webm' | 'mp4' }

/*
 * WebM first: Chrome, Edge and Firefox write it, and its duration header is
 * the one we know how to repair. MP4 is what Safari writes (fragmented, so the
 * server's `ftyp` sniff still accepts it). The bare type comes after the
 * codec-named ones so a browser that only understands the plain name still
 * records.
 *
 * H.264 leads because Chrome and Edge hand it to the graphics chip's encoder
 * where there is one; VP9 is encoded on the processor and was what made a
 * small laptop drop frames (the picture stuttered while the fan ran). VP8 is
 * the lighter software fallback. The engine accepts all three.
 */
const CANDIDATES: Mime[] = [
  { mime: 'video/webm;codecs=h264,opus', type: 'video/webm', ext: 'webm' },
  { mime: 'video/webm;codecs=vp8,opus', type: 'video/webm', ext: 'webm' },
  { mime: 'video/webm;codecs=vp9,opus', type: 'video/webm', ext: 'webm' },
  { mime: 'video/webm', type: 'video/webm', ext: 'webm' },
  { mime: 'video/mp4;codecs=avc1,mp4a', type: 'video/mp4', ext: 'mp4' },
  { mime: 'video/mp4', type: 'video/mp4', ext: 'mp4' },
];

export function support(): Support {
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  const recorder = typeof MediaRecorder !== 'undefined';
  let mime: Mime | null = null;
  if (recorder) {
    for (const c of CANDIDATES) {
      try { if (MediaRecorder.isTypeSupported(c.mime)) { mime = c; break; } } catch { /* an old engine throws on unknown types */ }
    }
  }
  let cursor = false;
  try { cursor = !!(md?.getSupportedConstraints?.() as Record<string, boolean> | undefined)?.cursor; } catch { /* not offered */ }
  return {
    secure: typeof window === 'undefined' || window.isSecureContext !== false,
    devices: !!md?.getUserMedia,
    display: !!md && typeof md.getDisplayMedia === 'function',
    recorder, mime, cursor,
    /* Chrome and Edge's always-on-top window, for the controls while another window is in front. */
    pip: typeof window !== 'undefined' && 'documentPictureInPicture' in window,
  };
}

/* ── Frame rate, resolution, quality ───────────────────────────────────── */

export const FPS = [24, 30, 50, 60] as const;
export type Fps = typeof FPS[number];
/** The recording's long side at most — the screen's own size when it is smaller. */
export const RES = { '720': 1280, '1080': 1920, '1440': 2560, '2160': 3840 } as const;
export type Res = keyof typeof RES;
export const RES_LABEL: Record<Res, string> = { '720': '720p', '1080': '1080p', '1440': '1440p', '2160': '4K' };
/* Bits a pixel at 30 fps, and the ceiling: text on a screen needs about 0.07 to stay sharp. */
export const QUALITY = { light: { bpp: 0.045, max: 4e6 }, standard: { bpp: 0.07, max: 8e6 }, high: { bpp: 0.11, max: 16e6 } } as const;
export type Quality = keyof typeof QUALITY;
export const CAM_RES = { '480': { width: 640, height: 480 }, '720': { width: 1280, height: 720 }, '1080': { width: 1920, height: 1080 } } as const;
export type CamRes = keyof typeof CAM_RES;
export type CursorMode = 'always' | 'motion' | 'never';

/**
 * A computer that will struggle: four cores or fewer, or four GB or less
 * (Chrome reports memory, others do not). Such a computer starts at 720p,
 * 30 fps, Light — it can still choose more.
 */
export function slowComputer(): boolean {
  if (typeof navigator === 'undefined') return false;
  const cores = navigator.hardwareConcurrency || 8;
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
  return cores <= 4 || mem <= 4;
}

/** A file name from what the person called the recording. */
export function fileSlug(name: string): string {
  return name.normalize('NFKD').replace(/[^\p{L}\p{N} _-]+/gu, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'recording';
}

/** Words for a capture error — what happened and what to do, never a DOMException name. */
export function mediaError(e: unknown, what: 'screen' | 'camera' | 'microphone' | 'camera and microphone'): string {
  const name = (e as { name?: string } | null)?.name ?? '';
  const device = what === 'screen' ? 'screen' : what;
  switch (name) {
    case 'NotAllowedError': case 'PermissionDeniedError':
      return what === 'screen'
        ? 'Screen sharing was cancelled or blocked. Press Start again and choose a screen, window or tab, then press Share.'
        : `Your browser is not allowed to use the ${device}. Click the camera or lock icon in the address bar, allow the ${device}, then try again.`;
    case 'NotFoundError': case 'DevicesNotFoundError': case 'OverconstrainedError':
      return what === 'screen' ? 'There was nothing to share.' : `No ${device} was found. Plug one in (or pick another in the list) and try again.`;
    case 'NotReadableError': case 'TrackStartError': case 'AbortError':
      return what === 'screen'
        ? 'The screen could not be captured. Close other apps that are recording or sharing your screen and try again.'
        : `The ${device} ${what === 'camera and microphone' ? 'are' : 'is'} in use by another app or tab (a video call, perhaps). Close it there and try again.`;
    case 'SecurityError':
      return `This page is not allowed to use the ${device}. Recording needs the app open on its own secure (https) address.`;
    case 'TypeError': case 'NotSupportedError':
      return what === 'screen' ? 'This browser cannot share its screen.' : `This browser cannot use the ${device}.`;
    default:
      return `The ${device} could not be started${(e as Error | null)?.message ? ` (${(e as Error).message})` : ''}.`;
  }
}

/* ── The frame: background, padding, roundness, shadow ─────────────────── */

export type Backdrop = { kind: 'none' } | { kind: 'color'; color: string } | { kind: 'gradient'; id: GradientId } | { kind: 'image' };
/** padding, radius: percent of the frame's short side; shadow 0–100. */
export interface Look { bg: Backdrop; padding: number; radius: number; shadow: number }
export const FRAMED = { padding: 7, radius: 2.2, shadow: 60 };
/* No background, but the frame's numbers ready: picking a background frames the screen at once. */
export const PLAIN_LOOK: Look = { bg: { kind: 'none' }, ...FRAMED };
export const COLORS = ['#ffffff', '#e5e7eb', '#0b0c10', '#6d4aff', '#0f766e', '#f59e0b'];

interface Gradient { angle: number; stops: string[]; glows: [x: number, y: number, r: number, color: string][] }
/* Each drawn by the same numbers on the canvas and as the swatch's CSS, so the swatch is what is recorded. */
export const GRADIENTS = {
  sequoia: { angle: 135, stops: ['#7c3aed', '#1d4ed8', '#0ea5e9'], glows: [[0.12, 0.05, 0.55, '#fb923c'], [0.95, 0.9, 0.45, '#f97316']] },
  sunset: { angle: 135, stops: ['#f97316', '#db2777', '#6d28d9'], glows: [] },
  mint: { angle: 160, stops: ['#d1fae5', '#6ee7b7', '#10b981'], glows: [] },
  ocean: { angle: 145, stops: ['#38bdf8', '#2563eb', '#1e3a8a'], glows: [] },
  peach: { angle: 120, stops: ['#fde68a', '#fca5a5', '#f9a8d4'], glows: [] },
  night: { angle: 150, stops: ['#1e293b', '#312e81', '#0f172a'], glows: [[0.8, 0.15, 0.5, '#7c3aed']] },
} satisfies Record<string, Gradient>;
export type GradientId = keyof typeof GRADIENTS;

export function gradientCss(id: GradientId): string {
  const g: Gradient = GRADIENTS[id];
  const glows = g.glows.map(([x, y, r, c]) => `radial-gradient(circle at ${x * 100}% ${y * 100}%, ${c} 0, ${c}00 ${r * 100}%)`);
  return [...glows, `linear-gradient(${g.angle}deg, ${g.stops.join(', ')})`].join(', ');
}

function paintBackdrop(ctx: Ctx2D, W: number, H: number, bg: Backdrop, image: ImageBitmap | null) {
  if (bg.kind === 'color') { ctx.fillStyle = bg.color; ctx.fillRect(0, 0, W, H); return; }
  if (bg.kind === 'image' && image) { coverImage(ctx, image, W, H); return; }
  if (bg.kind !== 'gradient') { ctx.fillStyle = '#101117'; ctx.fillRect(0, 0, W, H); return; }
  const g: Gradient = GRADIENTS[bg.id];
  /* CSS angles: 0deg points up, clockwise; the line is long enough to reach the corners, as CSS's is. */
  const a = g.angle * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a);
  const half = (Math.abs(W * dx) + Math.abs(H * dy)) / 2;
  const lin = ctx.createLinearGradient(W / 2 - dx * half, H / 2 - dy * half, W / 2 + dx * half, H / 2 + dy * half);
  g.stops.forEach((c, i) => lin.addColorStop(i / Math.max(1, g.stops.length - 1), c));
  ctx.fillStyle = lin; ctx.fillRect(0, 0, W, H);
  for (const [x, y, r, c] of g.glows) {
    const R = r * Math.hypot(W, H) / Math.SQRT2;
    const rad = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, R);
    rad.addColorStop(0, c); rad.addColorStop(1, `${c}00`);
    ctx.fillStyle = rad; ctx.fillRect(0, 0, W, H);
  }
}

function coverImage(ctx: Ctx2D, im: ImageBitmap, W: number, H: number) {
  const s = Math.max(W / im.width, H / im.height);
  const sw = W / s, sh = H / s;
  ctx.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, 0, 0, W, H);
}

/**
 * A background picture, read in this browser only (it is never uploaded) and
 * held at most 2560 wide: a phone photo at full size is ~100 MB of pixels.
 */
export async function loadBackdrop(file: File): Promise<ImageBitmap> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 2560 / Math.max(bmp.width, bmp.height));
  if (s === 1) return bmp;
  const small = await createImageBitmap(bmp, { resizeWidth: Math.round(bmp.width * s), resizeHeight: Math.round(bmp.height * s), resizeQuality: 'high' });
  bmp.close();
  return small;
}

/** Where the screen sits: inside the padding, its own shape, centred. With no background it fills the frame as before. */
export function screenRect(W: number, H: number, aspect: number, look: Look): Rect {
  const pad = look.bg.kind === 'none' ? 0 : Math.round(Math.min(W, H) * look.padding / 100);
  const bw = Math.max(2, W - 2 * pad), bh = Math.max(2, H - 2 * pad);
  const s = Math.min(bw / aspect, bh);
  const w = Math.round(s * aspect), h = Math.round(s);
  return { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h };
}

/* ── The camera bubble ─────────────────────────────────────────────────── */

const SIZE: Record<BubbleSize, number> = { S: 0.2, M: 0.28, L: 0.38 };
export interface Rect { x: number; y: number; w: number; h: number }

/**
 * Where the bubble sits on a W×H frame. `x`/`y` are 0–1 across the room left
 * once the bubble and a margin are taken out, so the corners are exactly
 * 0 and 1 and dragging can never push it off the picture.
 */
export function bubbleRect(W: number, H: number, b: Bubble, camAspect: number): Rect {
  const short = Math.min(W, H);
  const h = Math.round(short * SIZE[b.size]);
  const w = b.shape === 'circle' ? h : Math.round(Math.min(W * 0.5, h * Math.min(16 / 9, Math.max(1, camAspect || 4 / 3))));
  const m = Math.round(short * 0.03);
  return { x: Math.round(m + b.x * Math.max(0, W - 2 * m - w)), y: Math.round(m + b.y * Math.max(0, H - 2 * m - h)), w, h };
}

/** The bubble centred on a point (frame pixels), clamped onto the picture. */
export function bubbleAt(W: number, H: number, b: Bubble, camAspect: number, px: number, py: number): Pick<Bubble, 'x' | 'y'> {
  const r = bubbleRect(W, H, b, camAspect);
  const m = Math.round(Math.min(W, H) * 0.03);
  const roomX = Math.max(1, W - 2 * m - r.w), roomY = Math.max(1, H - 2 * m - r.h);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { x: clamp((px - r.w / 2 - m) / roomX), y: clamp((py - r.h / 2 - m) / roomY) };
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
const layerCanvas = (w: number, h: number): HTMLCanvasElement | OffscreenCanvas => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
};

/** A video drawn to fill a box (cropped, like object-fit: cover). */
function drawCover(ctx: Ctx2D, v: HTMLVideoElement, r: Rect, mirror: boolean) {
  const vw = v.videoWidth, vh = v.videoHeight;
  if (!vw || !vh) return;
  const s = Math.max(r.w / vw, r.h / vh);
  const sw = r.w / s, sh = r.h / s;
  ctx.save();
  if (mirror) { ctx.translate(r.x + r.w, r.y); ctx.scale(-1, 1); ctx.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, r.w, r.h); }
  else ctx.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, r.x, r.y, r.w, r.h);
  ctx.restore();
}

function roundPath(ctx: Ctx2D, r: Rect, k: number) {
  ctx.beginPath();
  if (k <= 0) { ctx.rect(r.x, r.y, r.w, r.h); return; }
  k = Math.min(k, r.w / 2, r.h / 2);
  ctx.moveTo(r.x + k, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, k);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, k);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, k);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, k);
  ctx.closePath();
}

function shapePath(ctx: Ctx2D, r: Rect, shape: Bubble['shape']) {
  if (shape === 'circle') { ctx.beginPath(); ctx.arc(r.x + r.w / 2, r.y + r.h / 2, Math.min(r.w, r.h) / 2, 0, Math.PI * 2); return; }
  roundPath(ctx, r, Math.min(r.w, r.h) * 0.16);
}

/** The part of the screen shown, 0–1 of its width and height (auto zoom crops it). */
export interface View { x: number; y: number; w: number; h: number }
const WHOLE: View = { x: 0, y: 0, w: 1, h: 1 };

/**
 * Draws the recorded frame: background, the screen in its rounded frame, the
 * camera bubble. Built for slow computers. A canvas keeps its pixels between
 * frames, and nothing outside the screen moves except the bubble, so the
 * background (gradient, picture scaled to cover, the screen's shadow) is
 * painted onto the canvas only when a setting or the screen's shape changes.
 * A frame is then: the screen copied into its box, four small corner patches
 * cut from the background (rounded corners without a clip), the bubble's box
 * put back from the background and the bubble drawn. A full-frame copy or a
 * shadow blur every frame cost a software-drawn canvas 4–5 ms a frame — the
 * difference between 60 fps and a stutter on a small laptop.
 */
export class Compositor {
  private layer: HTMLCanvasElement | OffscreenCanvas | null = null;
  private holed: HTMLCanvasElement | OffscreenCanvas | null = null;
  private layerKey = '';
  private sprite: HTMLCanvasElement | OffscreenCanvas | null = null;
  private spriteKey = '';
  private dirty: Rect | null = null;
  /* A replaced picture of the same size must still repaint the layer. */
  private ids = new WeakMap<ImageBitmap, number>();
  private nextId = 1;

  /** Where the screen was last drawn, in canvas pixels. */
  box: Rect = { x: 0, y: 0, w: 0, h: 0 };

  /** The canvas was resized (which clears it): paint the background again on the next frame. */
  invalidate() { this.layerKey = ''; }

  draw(ctx: CanvasRenderingContext2D, screen: HTMLVideoElement | null, cam: HTMLVideoElement | null, look: Look, image: ImageBitmap | null, b: Bubble, view: View = WHOLE) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const sv = screen && screen.videoWidth ? screen : null;
    const aspect = sv ? (sv.videoWidth * view.w) / (sv.videoHeight * view.h) : W / H;
    const r = screenRect(W, H, aspect, look);
    this.box = r;
    const framed = look.bg.kind !== 'none';
    const k = framed ? Math.min(Math.round(Math.min(W, H) * look.radius / 100), r.w / 2, r.h / 2) : 0;
    const key = `${W}x${H}|${r.x},${r.y},${r.w},${r.h}|${k}|${JSON.stringify(look)}|${image ? this.idOf(image) : ''}`;
    if (key !== this.layerKey || !this.layer) {
      this.paintLayer(W, H, r, k, look, image);
      this.layerKey = key;
      ctx.drawImage(this.layer!, 0, 0);
      this.dirty = null;
    } else if (this.dirty) {
      /* Where the bubble was last frame: back to background before anything is drawn over it again. */
      const d = this.dirty;
      ctx.drawImage(this.layer, d.x, d.y, d.w, d.h, d.x, d.y, d.w, d.h);
      this.dirty = null;
    }

    if (sv) {
      const vw = sv.videoWidth, vh = sv.videoHeight;
      ctx.drawImage(sv, view.x * vw, view.y * vh, view.w * vw, view.h * vh, r.x, r.y, r.w, r.h);
    } else { ctx.fillStyle = framed ? '#1b1d26' : '#101117'; ctx.fillRect(r.x, r.y, r.w, r.h); }
    if (k > 0 && this.holed) {
      const c = k + 1;
      for (const [x, y] of [[r.x, r.y], [r.x + r.w - c, r.y], [r.x, r.y + r.h - c], [r.x + r.w - c, r.y + r.h - c]]) ctx.drawImage(this.holed, x, y, c, c, x, y, c, c);
    }

    if (!cam || !cam.videoWidth) return;
    const br = bubbleRect(W, H, b, cam.videoWidth / cam.videoHeight);
    const blur = Math.round(br.h / 14);
    const sk = `${br.w}x${br.h}|${b.shape}`;
    if (sk !== this.spriteKey || !this.sprite) {
      this.sprite = layerCanvas(br.w + blur * 4, br.h + blur * 4);
      const sc = this.sprite.getContext('2d') as Ctx2D;
      sc.shadowColor = 'rgba(0,0,0,.45)'; sc.shadowBlur = blur;
      shapePath(sc, { x: blur * 2, y: blur * 2, w: br.w, h: br.h }, b.shape);
      sc.fillStyle = '#000'; sc.fill();
      this.spriteKey = sk;
    }
    const sx = Math.max(0, br.x - blur * 2), sy = Math.max(0, br.y - blur * 2);
    this.dirty = { x: sx, y: sy, w: Math.min(W, br.x + br.w + blur * 2) - sx, h: Math.min(H, br.y + br.h + blur * 2) - sy };
    ctx.drawImage(this.sprite, br.x - blur * 2, br.y - blur * 2);
    ctx.save();
    shapePath(ctx, br, b.shape);
    ctx.clip();
    drawCover(ctx, cam, br, b.mirror);
    ctx.restore();
    shapePath(ctx, br, b.shape);
    ctx.lineWidth = Math.max(2, Math.round(br.h / 45)); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke();
  }

  private idOf(im: ImageBitmap) {
    let id = this.ids.get(im);
    if (!id) { id = this.nextId++; this.ids.set(im, id); }
    return id;
  }

  /** The background with the screen's shadow, and a copy with the screen's rounded shape cut out (the corner patches). */
  private paintLayer(W: number, H: number, r: Rect, k: number, look: Look, image: ImageBitmap | null) {
    const c = this.layer && this.layer.width === W && this.layer.height === H ? this.layer : layerCanvas(W, H);
    const lc = c.getContext('2d') as Ctx2D;
    lc.clearRect(0, 0, W, H);
    paintBackdrop(lc, W, H, look.bg, image);
    if (look.bg.kind !== 'none' && look.shadow > 0) {
      const s = look.shadow / 100, short = Math.min(W, H);
      lc.save();
      lc.shadowColor = `rgba(0,0,0,${(0.55 * s).toFixed(3)})`;
      lc.shadowBlur = Math.round(short * 0.05 * s); lc.shadowOffsetY = Math.round(short * 0.015 * s);
      roundPath(lc, r, k); lc.fillStyle = '#000'; lc.fill();
      lc.restore();
    }
    this.layer = c;
    this.holed = null;
    if (k <= 0) return;
    const h = layerCanvas(W, H);
    const hc = h.getContext('2d') as Ctx2D;
    hc.drawImage(c, 0, 0);
    hc.globalCompositeOperation = 'destination-out';
    roundPath(hc, r, k); hc.fill();
    this.holed = h;
  }
}

/** The recording's frame size: the screen's own, at most `long` on its long side, even numbers (encoders want them). */
export function frameSize(w: number, h: number, long = 1920): { w: number; h: number } {
  if (!w || !h) return { w: 1280, h: 720 };
  const s = Math.min(1, long / Math.max(w, h));
  const even = (n: number) => Math.max(2, Math.round(n * s / 2) * 2);
  return { w: even(w), h: even(h) };
}

/**
 * Bits a second for a frame. Doubling the frame rate does not need double
 * the bits — consecutive frames of a screen are mostly the same — so it
 * grows by the 0.6 power of the rate.
 */
export function bitrateFor(w: number, h: number, fps = 30, quality: Quality = 'standard'): number {
  const q = QUALITY[quality];
  return Math.round(Math.min(q.max, Math.max(1e6, w * h * 30 * q.bpp * Math.pow(fps / 30, 0.6))));
}

/* ── Automatic zoom ────────────────────────────────────────────────────── */

/**
 * Zooms in on where the screen is changing — the pointer moving, typing, a
 * menu opening — and back out when it goes quiet or the whole page changes
 * (a scroll, a new page). A browser cannot see the pointer over other
 * windows, so this reads the picture: five times a second the screen is
 * shrunk to 96 pixels wide and compared with the last look. That costs well
 * under a millisecond; the zoom itself is eased every frame so it glides.
 */
export class AutoZoom {
  private cv: HTMLCanvasElement | OffscreenCanvas | null = null;
  private prev: Uint8Array | null = null;
  private last = 0; private lastStep = 0; private lastActive = 0; private lastBig = 0; private streak = 0;
  private target = { x: 0.5, y: 0.5, z: 1 };
  private cur = { x: 0.5, y: 0.5, z: 1 };
  depth = 1.8;

  reset() { this.prev = null; this.streak = 0; this.target = { x: 0.5, y: 0.5, z: 1 }; }
  out() { this.target = { ...this.target, z: 1 }; this.streak = 0; }

  sample(v: HTMLVideoElement, now: number) {
    if (now - this.last < 200 || !v.videoWidth) return;
    this.last = now;
    const SW = 96, SH = Math.max(24, Math.min(96, Math.round(96 * v.videoHeight / v.videoWidth)));
    if (!this.cv || this.cv.width !== SW || this.cv.height !== SH) { this.cv = layerCanvas(SW, SH); this.prev = null; }
    const c = this.cv.getContext('2d', { willReadFrequently: true }) as Ctx2D | null;
    if (!c) return;
    c.drawImage(v, 0, 0, SW, SH);
    const px = c.getImageData(0, 0, SW, SH).data;
    const g = new Uint8Array(SW * SH);
    for (let i = 0; i < g.length; i++) g[i] = (px[i * 4] * 3 + px[i * 4 + 1] * 6 + px[i * 4 + 2]) / 10;
    const p = this.prev;
    this.prev = g;
    if (!p) return;
    let n = 0, x0 = SW, y0 = SH, x1 = -1, y1 = -1;
    for (let i = 0; i < g.length; i++) {
      if (Math.abs(g[i] - p[i]) < 18) continue;
      n++;
      const x = i % SW, y = (i / SW) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (!n) { this.streak = 0; return; }
    /* A fifth of the screen changed at once: a scroll or a new page — show all of it. */
    if (n > g.length * 0.2) { this.lastBig = now; this.out(); return; }
    const bw = (x1 - x0 + 1) / SW, bh = (y1 - y0 + 1) / SH;
    if (bw > 0.5 || bh > 0.5) { this.streak = 0; return; }
    const cx = (x0 + x1 + 1) / 2 / SW, cy = (y0 + y1 + 1) / 2 / SH;
    this.lastActive = now;
    /* Two looks in a row, so a blinking text cursor alone never pulls the picture in. */
    if (++this.streak < 2 || now - this.lastBig < 1200) return;
    const t = this.target;
    if (t.z === 1) { this.target = { x: cx, y: cy, z: this.depth }; return; }
    /* Zoomed in: follow only when the action leaves the middle of the view, so the picture does not wobble. */
    const reach = 0.3 / t.z;
    if (Math.abs(cx - t.x) > reach || Math.abs(cy - t.y) > reach) this.target = { x: cx, y: cy, z: this.depth };
  }

  /** Eases toward the target (about a quarter of a second) and says which part of the screen to show. */
  view(now: number): View {
    if (this.target.z > 1 && now - this.lastActive > 3000) this.out();
    const dt = this.lastStep ? Math.min(0.1, (now - this.lastStep) / 1000) : 0;
    this.lastStep = now;
    const k = 1 - Math.exp(-dt / 0.25);
    for (const a of ['x', 'y', 'z'] as const) this.cur[a] += (this.target[a] - this.cur[a]) * k;
    if (this.cur.z < 1.002) return WHOLE;
    const w = 1 / this.cur.z;
    const clamp = (c: number) => Math.min(1 - w, Math.max(0, c - w / 2));
    return { x: clamp(this.cur.x), y: clamp(this.cur.y), w, h: w };
  }
}

/* ── Remembered choices ────────────────────────────────────────────────── */

export interface Prefs { fps: Fps; res: Res; quality: Quality; camRes: CamRes; look: Look; zoom: boolean; depth: number; cursor: CursorMode; float: boolean }
export const defaultPrefs = (slow = slowComputer()): Prefs => ({
  fps: 30, res: slow ? '720' : '1080', quality: slow ? 'light' : 'standard', camRes: slow ? '480' : '720',
  look: PLAIN_LOOK, zoom: false, depth: 1.8, cursor: 'always', float: true,
});

/** Saved choices read back field by field — anything unknown falls back, and a picture is never remembered. */
export function readPrefs(raw: unknown, base: Prefs = defaultPrefs()): Prefs {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = <T,>(v: unknown, ok: readonly T[], d: T): T => ok.includes(v as T) ? v as T : d;
  const num = (v: unknown, lo: number, hi: number, d: number) => typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  const l = (o.look && typeof o.look === 'object' ? o.look : {}) as Record<string, unknown>;
  const b = (l.bg && typeof l.bg === 'object' ? l.bg : {}) as Record<string, unknown>;
  const bg: Backdrop = b.kind === 'color' && typeof b.color === 'string' && /^#[0-9a-f]{6}$/i.test(b.color) ? { kind: 'color', color: b.color }
    : b.kind === 'gradient' && typeof b.id === 'string' && b.id in GRADIENTS ? { kind: 'gradient', id: b.id as GradientId }
      : { kind: 'none' };
  return {
    fps: pick(o.fps, FPS, base.fps),
    res: pick(o.res, Object.keys(RES) as Res[], base.res),
    quality: pick(o.quality, Object.keys(QUALITY) as Quality[], base.quality),
    camRes: pick(o.camRes, Object.keys(CAM_RES) as CamRes[], base.camRes),
    look: { bg, padding: num(l.padding, 0, 16, FRAMED.padding), radius: num(l.radius, 0, 6, FRAMED.radius), shadow: num(l.shadow, 0, 100, FRAMED.shadow) },
    zoom: typeof o.zoom === 'boolean' ? o.zoom : base.zoom,
    depth: num(o.depth, 1.25, 2.5, base.depth),
    cursor: pick(o.cursor, ['always', 'motion', 'never'] as CursorMode[], base.cursor),
    float: typeof o.float === 'boolean' ? o.float : base.float,
  };
}

/**
 * The finished file. Chrome's WebM has no duration, so it cannot be seeked;
 * the duration is written into its header (lib/webmDuration.ts). Only the
 * first megabyte is read for that — the header is a few hundred bytes at the
 * start of a live-written (unknown-size) segment, and reading an hour-long
 * recording whole would double its memory for an eleven-byte edit.
 */
export async function finishFile(chunks: Blob[], mime: Mime, durationMs: number): Promise<Blob> {
  const raw = new Blob(chunks, { type: mime.type });
  if (mime.type !== 'video/webm') return raw;
  const HEAD = 1 << 20;
  if (raw.size <= HEAD) return fixWebmDuration(raw, durationMs);
  const head = await fixWebmDuration(raw.slice(0, HEAD, mime.type), durationMs);
  return new Blob([head, raw.slice(HEAD)], { type: mime.type });
}

/**
 * A steady tick for drawing frames. requestAnimationFrame stops, and page
 * timers slow to once a second, when the tab is in the background — which is
 * exactly when somebody recording their screen is in another window. A
 * dedicated worker's timer is not slowed, so the picture keeps moving. The
 * worker is a file of its own (the site's script policy allows only 'self',
 * not blob: workers); if it cannot start, a page timer is the fallback.
 */
export function startClock(fps: number, tick: () => void): () => void {
  const ms = 1000 / fps;
  try {
    const w = new ClockWorker();
    w.onmessage = () => tick();
    w.postMessage(ms);
    return () => { w.postMessage(0); w.terminate(); };
  } catch {
    const t = setInterval(tick, ms);
    return () => clearInterval(t);
  }
}

/** Every track of every stream, stopped — the browser's recording indicators go out with them. */
export function stopStreams(...streams: (MediaStream | null | undefined)[]) {
  for (const s of streams) s?.getTracks().forEach(t => { try { t.stop(); } catch { /* already gone */ } });
}

export const msClock = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s).padStart(2, '0')}`;
};
