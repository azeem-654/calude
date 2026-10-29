/**
 * The Screen Recorder's plumbing that is not React: what this browser can
 * record, the camera bubble's geometry, drawing it, plain-language errors and
 * the clock that keeps drawing while the tab is in the background.
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
export interface Support { secure: boolean; devices: boolean; display: boolean; recorder: boolean; mime: Mime | null }
export interface Mime { mime: string; type: 'video/webm' | 'video/mp4'; ext: 'webm' | 'mp4' }

/*
 * WebM first: Chrome, Edge and Firefox write it, and its duration header is
 * the one we know how to repair. MP4 is what Safari writes (fragmented, so the
 * server's `ftyp` sniff still accepts it). The bare type comes after the
 * codec-named ones so a browser that only understands the plain name still
 * records.
 */
const CANDIDATES: Mime[] = [
  { mime: 'video/webm;codecs=vp9,opus', type: 'video/webm', ext: 'webm' },
  { mime: 'video/webm;codecs=vp8,opus', type: 'video/webm', ext: 'webm' },
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
  return {
    secure: typeof window === 'undefined' || window.isSecureContext !== false,
    devices: !!md?.getUserMedia,
    display: !!md && typeof md.getDisplayMedia === 'function',
    recorder, mime,
  };
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

/** A video drawn to fill a box (cropped, like object-fit: cover). */
function drawCover(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, r: Rect, mirror: boolean) {
  const vw = v.videoWidth, vh = v.videoHeight;
  if (!vw || !vh) return;
  const s = Math.max(r.w / vw, r.h / vh);
  const sw = r.w / s, sh = r.h / s;
  ctx.save();
  if (mirror) { ctx.translate(r.x + r.w, r.y); ctx.scale(-1, 1); ctx.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, r.w, r.h); }
  else ctx.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, r.x, r.y, r.w, r.h);
  ctx.restore();
}

/** A video drawn whole inside a box (letterboxed), for a screen whose shape changed mid-recording. */
function drawContain(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, W: number, H: number) {
  const vw = v.videoWidth, vh = v.videoHeight;
  if (!vw || !vh) return;
  const s = Math.min(W / vw, H / vh);
  const w = vw * s, h = vh * s;
  ctx.drawImage(v, (W - w) / 2, (H - h) / 2, w, h);
}

function shapePath(ctx: CanvasRenderingContext2D, r: Rect, shape: Bubble['shape']) {
  ctx.beginPath();
  if (shape === 'circle') { ctx.arc(r.x + r.w / 2, r.y + r.h / 2, Math.min(r.w, r.h) / 2, 0, Math.PI * 2); return; }
  const k = Math.min(r.w, r.h) * 0.16;
  ctx.moveTo(r.x + k, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, k);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, k);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, k);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, k);
  ctx.closePath();
}

/**
 * One frame of "screen + camera": the screen whole, the camera in its bubble
 * on top. Before a screen is shared (choosing where the bubble goes) the
 * frame is plain and the page says where the screen will be — words drawn
 * here would be unreadable on a phone, and recording only starts once the
 * screen is there anyway.
 */
export function drawComposite(ctx: CanvasRenderingContext2D, screen: HTMLVideoElement | null, cam: HTMLVideoElement | null, b: Bubble) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.fillStyle = '#101117';
  ctx.fillRect(0, 0, W, H);
  if (screen && screen.videoWidth) drawContain(ctx, screen, W, H);
  if (!cam || !cam.videoWidth) return;
  const r = bubbleRect(W, H, b, cam.videoWidth / cam.videoHeight);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = Math.round(r.h / 14);
  shapePath(ctx, r, b.shape);
  ctx.fillStyle = '#000'; ctx.fill();
  ctx.restore();
  ctx.save();
  shapePath(ctx, r, b.shape);
  ctx.clip();
  drawCover(ctx, cam, r, b.mirror);
  ctx.restore();
  ctx.save();
  shapePath(ctx, r, b.shape);
  ctx.lineWidth = Math.max(2, Math.round(r.h / 45)); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke();
  ctx.restore();
}

/** The recording's frame size: the screen's own, at most 1920 on its long side, even numbers (encoders want them). */
export function frameSize(w: number, h: number): { w: number; h: number } {
  if (!w || !h) return { w: 1280, h: 720 };
  const s = Math.min(1, 1920 / Math.max(w, h));
  const even = (n: number) => Math.max(2, Math.round(n * s / 2) * 2);
  return { w: even(w), h: even(h) };
}

/** About 0.07 bits a pixel at 30 fps — sharp text on a screen without a huge file. */
export const bitrateFor = (w: number, h: number) => Math.round(Math.min(6e6, Math.max(1.5e6, w * h * 30 * 0.07)));

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
  const ms = Math.round(1000 / fps);
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
