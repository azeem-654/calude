/**
 * The Screen Recorder's plumbing that is not React: what this browser can
 * record, frame rate and quality, the layouts (where the screen and the
 * camera sit), the camera's frame (shape and ring), the background, padding,
 * roundness and shadow, and the compositor that draws them; the pointer log
 * (where the pointer went and clicked, read from the picture), plain-language
 * errors and the clock that keeps drawing while the tab is in the background.
 *
 * Everything here runs in the browser. Opening the recorder (a press) asks
 * for the camera and microphone it needs straight away, so the preview shows
 * the person before they start (the owner's call, 2026-10); the screen is
 * only ever asked for by Start.
 */
import { fixWebmDuration } from '../../lib/webmDuration';
import ClockWorker from './recorderClock.worker.ts?worker';
import { CameraFx, NO_FX, sceneOr, type CamFx, type CamBg } from './cameraFx';
import { sceneLayer, isScene, type SceneId } from './scenes';
import { pic, type Feed } from './trackFeed';
import type { ScreenMeta, ScreenSeg, NBox } from '../../services/videoStudio';

export type RecMode = 'screen' | 'screen-cam' | 'cam';
export type BubbleSize = 'S' | 'M' | 'L';
/** Where the bubble sits (0–1 across the room left for it) and how big; its shape and ring are the camera's frame (`CamFrame`). */
export interface Bubble { x: number; y: number; size: BubbleSize; mirror: boolean }
export const CORNERS = { tl: { x: 0, y: 0 }, tr: { x: 1, y: 0 }, bl: { x: 0, y: 1 }, br: { x: 1, y: 1 } } as const;
export type Corner = keyof typeof CORNERS;

/** What this browser offers, asked once. */
export interface Support { secure: boolean; devices: boolean; display: boolean; recorder: boolean; mime: Mime | null; cursor: boolean; isolate: boolean; pip: boolean }
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
  let cursor = false, isolate = false;
  try {
    const c = md?.getSupportedConstraints?.() as Record<string, boolean> | undefined;
    cursor = !!c?.cursor; isolate = !!c?.voiceIsolation;
  } catch { /* not offered */ }
  return {
    secure: typeof window === 'undefined' || window.isSecureContext !== false,
    devices: !!md?.getUserMedia,
    display: !!md && typeof md.getDisplayMedia === 'function',
    recorder, mime, cursor, isolate,
    /* Chrome and Edge's always-on-top window, for the controls while another window is in front. */
    pip: typeof window !== 'undefined' && 'documentPictureInPicture' in window,
  };
}

/* ── Frame rate, resolution, quality ───────────────────────────────────── */

/* 15 and 20 are for a slow computer or a talk over slides, where nothing moves fast and every frame saved is work saved. */
export const FPS = [15, 20, 24, 25, 30, 50, 60] as const;
export type Fps = typeof FPS[number];
/** The recording's long side at most — the screen's own size when it is smaller. Below 720p for a slow computer or a small file. */
export const RES = { '360': 640, '480': 854, '540': 960, '720': 1280, '1080': 1920, '1440': 2560, '2160': 3840 } as const;
export type Res = keyof typeof RES;
export const RES_LABEL: Record<Res, string> = { '360': '360p', '480': '480p', '540': '540p', '720': '720p', '1080': '1080p', '1440': '1440p', '2160': '4K' };
/* Bits a pixel at 30 fps, the ceiling and the floor: text on a screen needs about 0.07 to stay sharp; Data saver keeps the file smallest and lets fine text soften. */
export const QUALITY = {
  saver: { bpp: 0.03, max: 1.5e6, min: 0.35e6 }, light: { bpp: 0.045, max: 4e6, min: 1e6 }, standard: { bpp: 0.07, max: 8e6, min: 1e6 },
  high: { bpp: 0.11, max: 16e6, min: 1e6 }, best: { bpp: 0.16, max: 25e6, min: 2e6 },
} as const;
export type Quality = keyof typeof QUALITY;
export const CAM_RES = {
  '240': { width: 320, height: 240 }, '360': { width: 640, height: 360 }, '480': { width: 640, height: 480 }, '540': { width: 960, height: 540 },
  '720': { width: 1280, height: 720 }, '1080': { width: 1920, height: 1080 },
} as const;
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

export type Backdrop = { kind: 'none' } | { kind: 'color'; color: string } | { kind: 'gradient'; id: GradientId } | { kind: 'image' } | { kind: 'scene'; id: SceneId };
/** padding, radius: percent of the frame's short side; shadow 0–100. */
export interface Look { bg: Backdrop; padding: number; radius: number; shadow: number }
export const FRAMED = { padding: 7, radius: 2.2, shadow: 60 };
/* No background, but the frame's numbers ready: picking a background frames the screen at once. */
export const PLAIN_LOOK: Look = { bg: { kind: 'none' }, ...FRAMED };
/* What switching the background on brings back when nothing was chosen before. */
export const DEFAULT_BG: Backdrop = { kind: 'gradient', id: 'sequoia' };
export const COLORS = ['#ffffff', '#e5e7eb', '#0b0c10', '#6d4aff', '#0f766e', '#f59e0b'];
/* With the background off, what shows round side-by-side panels: a neutral near-black, not a colour nobody chose. */
const NO_BG_FILL = '#0b0c10';

interface Gradient { angle: number; stops: string[]; glows: [x: number, y: number, r: number, color: string][] }
/* Each drawn by the same numbers on the canvas and as the swatch's CSS, so the swatch is what is recorded. */
export const GRADIENTS = {
  sequoia: { angle: 135, stops: ['#7c3aed', '#1d4ed8', '#0ea5e9'], glows: [[0.12, 0.05, 0.55, '#fb923c'], [0.95, 0.9, 0.45, '#f97316']] },
  sunset: { angle: 135, stops: ['#f97316', '#db2777', '#6d28d9'], glows: [] },
  mint: { angle: 160, stops: ['#d1fae5', '#6ee7b7', '#10b981'], glows: [] },
  ocean: { angle: 145, stops: ['#38bdf8', '#2563eb', '#1e3a8a'], glows: [] },
  peach: { angle: 120, stops: ['#fde68a', '#fca5a5', '#f9a8d4'], glows: [] },
  night: { angle: 150, stops: ['#1e293b', '#312e81', '#0f172a'], glows: [[0.8, 0.15, 0.5, '#7c3aed']] },
  aurora: { angle: 160, stops: ['#0f172a', '#134e4a', '#0f172a'], glows: [[0.25, 0.2, 0.55, '#22d3ee'], [0.8, 0.75, 0.5, '#a855f7']] },
  candy: { angle: 120, stops: ['#f0abfc', '#c4b5fd', '#93c5fd'], glows: [[0.9, 0.1, 0.4, '#fbcfe8']] },
  forest: { angle: 150, stops: ['#14532d', '#166534', '#052e16'], glows: [[0.15, 0.1, 0.5, '#84cc16']] },
  dusk: { angle: 180, stops: ['#1e1b4b', '#9d174d', '#f97316'], glows: [] },
  lavender: { angle: 135, stops: ['#ede9fe', '#ddd6fe', '#c7d2fe'], glows: [[0.85, 0.85, 0.45, '#fbcfe8']] },
  sky: { angle: 180, stops: ['#bae6fd', '#e0f2fe', '#f8fafc'], glows: [[0.8, 0.15, 0.35, '#fef3c7']] },
  graphite: { angle: 145, stops: ['#3f3f46', '#18181b', '#09090b'], glows: [[0.1, 0.1, 0.5, '#52525b']] },
  coral: { angle: 125, stops: ['#fb7185', '#fb923c', '#fde047'], glows: [] },
  lime: { angle: 140, stops: ['#ecfccb', '#a3e635', '#4d7c0f'], glows: [] },
  royal: { angle: 135, stops: ['#1e40af', '#6d28d9', '#be185d'], glows: [[0.2, 0.85, 0.45, '#0ea5e9']] },
  ember: { angle: 160, stops: ['#1c1917', '#7c2d12', '#1c1917'], glows: [[0.75, 0.25, 0.5, '#f59e0b']] },
  mist: { angle: 135, stops: ['#f1f5f9', '#e2e8f0', '#cbd5e1'], glows: [[0.2, 0.2, 0.5, '#ffffff']] },
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
  if (bg.kind === 'scene') { ctx.drawImage(sceneLayer(bg.id, W, H), 0, 0); return; }
  if (bg.kind !== 'gradient') { ctx.fillStyle = NO_BG_FILL; ctx.fillRect(0, 0, W, H); return; }
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
  return fitIn({ x: pad, y: pad, w: Math.max(2, W - 2 * pad), h: Math.max(2, H - 2 * pad) }, aspect);
}

/** A picture of `aspect` as large as fits in `area`, centred. */
function fitIn(area: Rect, aspect: number): Rect {
  const s = Math.min(area.w / aspect, area.h);
  const w = Math.max(2, Math.round(s * aspect)), h = Math.max(2, Math.round(s));
  return { x: Math.round(area.x + (area.w - w) / 2), y: Math.round(area.y + (area.h - h) / 2), w, h };
}

/* ── The camera: bubble, shape, ring ───────────────────────────────────── */

const SIZE: Record<BubbleSize, number> = { S: 0.2, M: 0.28, L: 0.38 };
export interface Rect { x: number; y: number; w: number; h: number }

export type CamShape = 'circle' | 'square' | 'rounded';
export const SHAPES: readonly CamShape[] = ['circle', 'square', 'rounded'];
/**
 * Round the camera. Still: none, the thin white line, a solid line, a double
 * line, dashes, neon. Moving: a turning gradient, a breathing neon, a turning
 * rainbow, a comet running round, dots and dashes marching round, and a ring
 * that swells with the voice (the microphone's level).
 */
export const RINGS_STILL = ['none', 'white', 'solid', 'double', 'dashed', 'neon'] as const;
export const RINGS_MOVING = ['gradient', 'pulse', 'rainbow', 'comet', 'dots', 'march', 'voice'] as const;
export type Ring = typeof RINGS_STILL[number] | typeof RINGS_MOVING[number];
export const RINGS: readonly Ring[] = [...RINGS_STILL, ...RINGS_MOVING];
/* The first five are the turning gradient's neighbours (ringStops) — keep their order. */
export const RING_COLORS: readonly string[] = [
  '#22d3ee', '#a855f7', '#f472b6', '#facc15', '#4ade80', '#ffffff',
  '#ef4444', '#f97316', '#fbbf24', '#84cc16', '#14b8a6', '#0ea5e9', '#3b82f6', '#6366f1', '#e11d48', '#000000',
];
/** Gradient colourings for any ring, chosen as `g:<id>` in place of a colour. */
export const RING_GRADIENTS = {
  sunset: ['#f97316', '#db2777', '#7c3aed'], ocean: ['#22d3ee', '#3b82f6', '#1e3a8a'], aurora: ['#22d3ee', '#a855f7', '#4ade80'],
  candy: ['#f0abfc', '#93c5fd', '#fbcfe8'], fire: ['#fde047', '#f97316', '#dc2626'], mint: ['#a7f3d0', '#10b981', '#0ea5e9'],
  gold: ['#fef08a', '#f59e0b', '#b45309'], neon: ['#f472b6', '#22d3ee', '#a3e635'], royal: ['#1e40af', '#7c3aed', '#db2777'],
  ice: ['#ffffff', '#bae6fd', '#60a5fa'], peach: ['#fde68a', '#fca5a5', '#f9a8d4'], forest: ['#bef264', '#16a34a', '#14532d'],
} as const;
export type RingGradient = keyof typeof RING_GRADIENTS;
const RAINBOW = ['#ef4444', '#f97316', '#facc15', '#4ade80', '#22d3ee', '#3b82f6', '#a855f7', '#ef4444'];
/** A ring colour as chosen: a `#rrggbb` (any, from the swatches or the picker) or `g:<gradient>`. */
export const okRingColor = (v: unknown): v is string => typeof v === 'string' && (/^#[0-9a-f]{6}$/i.test(v) || (v.startsWith('g:') && v.slice(2) in RING_GRADIENTS));
const gradOf = (c: string): readonly string[] | null => c.startsWith('g:') ? RING_GRADIENTS[c.slice(2) as RingGradient] ?? null : null;
/** One colour standing for the choice (a glow's colour, a swatch's): the gradient's first. */
export const ringSolid = (c: string) => gradOf(c)?.[0] ?? c;
/** The CSS for a ring colour's swatch. */
export const ringCss = (c: string) => { const g = gradOf(c); return g ? `conic-gradient(${[...g, g[0]].join(', ')})` : c; };
export interface CamFrame { shape: CamShape; ring: Ring; ringColor: string }
export const DEFAULT_FRAME: CamFrame = { shape: 'circle', ring: 'white', ringColor: '#22d3ee' };

/**
 * Where the bubble sits on a W×H frame. `x`/`y` are 0–1 across the room left
 * once the bubble and a margin are taken out, so the corners are exactly
 * 0 and 1 and dragging can never push it off the picture. Every shape is a
 * square box the same size (the camera is cover-cropped into it); `wide` is
 * the cut-out (background removed), which keeps the camera's own shape.
 */
export function bubbleRect(W: number, H: number, b: Bubble, camAspect: number, wide = false): Rect {
  const short = Math.min(W, H);
  const h = Math.round(short * SIZE[b.size]);
  const w = wide ? Math.round(Math.min(W * 0.5, h * Math.min(16 / 9, Math.max(1, camAspect || 4 / 3)))) : h;
  const m = Math.round(short * 0.03);
  return { x: Math.round(m + b.x * Math.max(0, W - 2 * m - w)), y: Math.round(m + b.y * Math.max(0, H - 2 * m - h)), w, h };
}

/** The bubble centred on a point (frame pixels), clamped onto the picture. */
export function bubbleAt(W: number, H: number, b: Bubble, camAspect: number, px: number, py: number, wide = false): Pick<Bubble, 'x' | 'y'> {
  const r = bubbleRect(W, H, b, camAspect, wide);
  const m = Math.round(Math.min(W, H) * 0.03);
  const roomX = Math.max(1, W - 2 * m - r.w), roomY = Math.max(1, H - 2 * m - r.h);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { x: clamp((px - r.w / 2 - m) / roomX), y: clamp((py - r.h / 2 - m) / roomY) };
}

/**
 * How round the camera's corners are. A bubble can be a circle; a tall panel
 * cannot, so a circle there is drawn as a rounded panel — and a big panel's
 * corners are capped so they read as the bubble's, not as a pill.
 */
export function camRadius(r: Rect, shape: CamShape, panel: boolean, short: number): number {
  if (shape === 'square') return 0;
  const side = Math.min(r.w, r.h);
  if (!panel) return shape === 'circle' ? side / 2 : Math.round(side * 0.18);
  return Math.round(Math.min(side * 0.16, short * 0.045));
}

/** The ring's line, glow and how far past the camera's edge it reaches (what must be put back each frame). */
export function ringSize(r: Rect, ring: Ring, short: number): { lw: number; glow: number; ext: number } {
  if (ring === 'none') return { lw: 0, glow: 0, ext: 0 };
  /* A big panel's ring is as thick as a large bubble's, not a third of the screen's width. */
  const base = Math.min(r.w, r.h, short * 0.3);
  const div = ring === 'white' ? 45 : ring === 'double' ? 44 : ring === 'neon' || ring === 'pulse' ? 36 : ring === 'voice' ? 32 : 24;
  const lw = Math.max(2, Math.round(base / div));
  const glow = ring === 'neon' || ring === 'pulse' ? Math.max(4, Math.round(base / 10)) : 0;
  /* How far past the edge it can reach: the double's outer line, the voice ring at its loudest, a dot's round end. */
  const ext = ring === 'double' ? lw * 4 : ring === 'voice' ? lw * 6 : ring === 'dots' ? lw * 2 : glow * 2 + lw;
  return { lw, glow, ext };
}

/** The length round a camera's edge (where the moving dashes, dots and comet travel). */
function perimeter(r: Rect, k: number, circle: boolean): number {
  if (circle) return Math.PI * Math.min(r.w, r.h);
  const kk = Math.min(k, r.w / 2, r.h / 2);
  return 2 * (r.w + r.h) - (8 - 2 * Math.PI) * kk;
}

/* The turning ring's colours: the chosen one and its two neighbours on the swatch row, back to the chosen one. */
function ringStops(c: string): string[] {
  const vivid = RING_COLORS.slice(0, 5), i = vivid.indexOf(c);
  if (i < 0) return [c, '#22d3ee', '#a855f7', '#f472b6', c];
  return [c, vivid[(i + 1) % 5], vivid[(i + 2) % 5], c];
}

/* ── Layouts: where the screen and the camera sit ──────────────────────── */

/**
 * Screen + camera layouts. 'bubble' is the camera over the screen, moved by
 * dragging; the others place the camera as a fixed panel: beside the screen
 * (about a third of the width, full height), the camera large with the
 * screen as an inset ('presenter'), or half and half.
 */
export const LAYOUTS = ['bubble', 'speaker-left', 'speaker-right', 'presenter', 'split'] as const;
export type Layout = typeof LAYOUTS[number];

/**
 * Where the screen and the camera are drawn on a W×H frame — pure, so the
 * compositor, the layout picker's little previews and the recorded layout
 * log all read the same boxes. `camAspect` null means no camera is shown:
 * the screen then sits as it would alone, whatever the layout. `panel` says
 * the camera is a fixed box (painted with the background) rather than a
 * bubble moving over the screen. The output size never changes with the
 * layout; a screen beside a panel is letterboxed inside its share.
 */
export function layoutRects(W: number, H: number, layout: Layout, look: Look, screenAspect: number, camAspect: number | null, bubble: Bubble, cutout = false): { screen: Rect; cam: Rect | null; panel: boolean } {
  if (camAspect === null || layout === 'bubble') {
    return { screen: screenRect(W, H, screenAspect, look), cam: camAspect === null ? null : bubbleRect(W, H, bubble, camAspect, cutout), panel: false };
  }
  const short = Math.min(W, H), framed = look.bg.kind !== 'none';
  /* With the background off there is no padding to speak of — only a small gap, so the panels read as two. */
  const gap = Math.max(4, Math.round(short * 0.025));
  const pad = framed ? Math.round(short * look.padding / 100) : gap;
  const inner: Rect = { x: pad, y: pad, w: Math.max(8, W - 2 * pad), h: Math.max(8, H - 2 * pad) };
  if (layout === 'presenter') {
    const cam = framed ? inner : { x: 0, y: 0, w: W, h: H };
    const m = Math.round(short * 0.045);
    let w = Math.round(cam.w * 0.45), h = Math.round(w / screenAspect);
    const maxH = Math.round(cam.h * 0.6);
    if (h > maxH) { h = maxH; w = Math.round(h * screenAspect); }
    return { screen: { x: cam.x + cam.w - m - w, y: cam.y + m, w: Math.max(2, w), h: Math.max(2, h) }, cam, panel: true };
  }
  if (layout === 'split') {
    const half = Math.floor((inner.w - gap) / 2);
    const fit = fitIn({ x: 0, y: inner.y, w: half, h: inner.h }, screenAspect);
    /* The pair is centred together, the camera as tall as the screen beside it, so the two halves match. */
    const x0 = Math.round(inner.x + (inner.w - (half + gap + fit.w)) / 2);
    return { screen: { ...fit, x: x0 + half + gap }, cam: { x: x0, y: fit.y, w: half, h: fit.h }, panel: true };
  }
  const cw = Math.round((inner.w - gap) / 3), left = layout === 'speaker-left';
  const fit = fitIn({ x: 0, y: inner.y, w: inner.w - cw - gap, h: inner.h }, screenAspect);
  const x0 = Math.round(inner.x + (inner.w - (cw + gap + fit.w)) / 2);
  return left
    ? { screen: { ...fit, x: x0 + cw + gap }, cam: { x: x0, y: inner.y, w: cw, h: inner.h }, panel: true }
    : { screen: { ...fit, x: x0 }, cam: { x: x0 + fit.w + gap, y: inner.y, w: cw, h: inner.h }, panel: true };
}

/* ── Drawing ───────────────────────────────────────────────────────────── */

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Cv = HTMLCanvasElement | OffscreenCanvas;
const layerCanvas = (w: number, h: number): Cv => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
};
const sizedLayer = (c: Cv | null, w: number, h: number): Cv => {
  if (c && c.width === w && c.height === h) return c;
  if (c) { c.width = w; c.height = h; return c; }
  return layerCanvas(w, h);
};

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

function edgePath(ctx: Ctx2D, r: Rect, k: number, circle: boolean) {
  if (circle) { ctx.beginPath(); ctx.arc(r.x + r.w / 2, r.y + r.h / 2, Math.min(r.w, r.h) / 2, 0, Math.PI * 2); return; }
  roundPath(ctx, r, k);
}

/**
 * The frame round a box's edge, `out` beyond it and `inn` inside it, as four
 * strips — what a ring and its glow cover. Copying four thin strips instead
 * of the whole box is what keeps a big panel's glowing ring cheap.
 */
function bandRects(r: Rect, out: number, inn: number): Rect[] {
  const X0 = r.x - out, Y0 = r.y - out, X1 = r.x + r.w + out, Y1 = r.y + r.h + out;
  const x0 = r.x + inn, y0 = r.y + inn, x1 = r.x + r.w - inn, y1 = r.y + r.h - inn;
  if (x1 - x0 < 8 || y1 - y0 < 8) return [{ x: X0, y: Y0, w: X1 - X0, h: Y1 - Y0 }];
  return [
    { x: X0, y: Y0, w: X1 - X0, h: y0 - Y0 }, { x: X0, y: y1, w: X1 - X0, h: Y1 - y1 },
    { x: X0, y: y0, w: x0 - X0, h: y1 - y0 }, { x: x1, y: y0, w: X1 - x1, h: y1 - y0 },
  ];
}

/** Words cut to fit `max` pixels, at most `lines` lines, the last ending "…" if it had to be cut. */
function wrap(c: Ctx2D, text: string, max: number, lines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean), out: string[] = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const t = line ? `${line} ${words[i]}` : words[i];
    if (c.measureText(t).width <= max || !line) { line = t; continue; }
    out.push(line); line = words[i];
    if (out.length === lines) { line = ''; break; }
  }
  if (line && out.length < lines) out.push(line);
  const cut = out.join(' ').split(/\s+/).length < words.length;
  if (cut && out.length) {
    let last = out[out.length - 1];
    while (last && c.measureText(`${last}…`).width > max) last = last.slice(0, -1);
    out[out.length - 1] = `${last.trimEnd()}…`;
  }
  return out.map(l => { let x = l; while (x.length > 1 && c.measureText(x).width > max) x = x.slice(0, -2) + '…'; return x; });
}

function paintCard(W: number, H: number, title: string, desc: string, scale = 1): Cv {
  const short = Math.min(W, H) * scale, pad = Math.round(short * 0.022), ts = Math.round(short * 0.036), ds = Math.round(short * 0.025);
  const maxText = Math.round(Math.min(W * 0.8, W * 0.42 * scale));
  const font = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const probe = layerCanvas(4, 4).getContext('2d') as Ctx2D;
  probe.font = `700 ${ts}px ${font}`;
  const tl = title ? wrap(probe, title, maxText, 1) : [];
  const tw = tl.length ? probe.measureText(tl[0]).width : 0;
  probe.font = `500 ${ds}px ${font}`;
  const dl = desc ? wrap(probe, desc, maxText, 2) : [];
  const dw = Math.max(0, ...dl.map(l => probe.measureText(l).width));
  const bar = Math.max(3, Math.round(short * 0.006));
  const w = Math.ceil(Math.max(tw, dw) + pad * 2 + bar * 2), h = Math.ceil(pad * 2 + tl.length * ts * 1.2 + (tl.length && dl.length ? ds * 0.35 : 0) + dl.length * ds * 1.3);
  const c = layerCanvas(w, h), g = c.getContext('2d') as Ctx2D;
  roundPath(g, { x: 0, y: 0, w, h }, Math.round(pad * 0.8));
  g.fillStyle = 'rgba(12,12,20,.78)'; g.fill();
  g.fillStyle = '#8b6cff'; g.fillRect(pad * 0.6, pad, bar, h - pad * 2);
  let y = pad;
  g.textBaseline = 'top';
  g.fillStyle = '#ffffff'; g.font = `700 ${ts}px ${font}`;
  for (const l of tl) { g.fillText(l, pad + bar * 2, y); y += ts * 1.2; }
  if (tl.length && dl.length) y += ds * 0.35;
  g.fillStyle = 'rgba(255,255,255,.82)'; g.font = `500 ${ds}px ${font}`;
  for (const l of dl) { g.fillText(l, pad + bar * 2, y); y += ds * 1.3; }
  return c;
}

/**
 * The title card and the logo. Both sit anywhere: x/y are 0–1 across the
 * room left once the box and a margin are taken out (0,0 top left, 1,1
 * bottom right), like the bubble — dragged on the preview or nudged.
 */
export interface Brand {
  card: boolean; title: string; desc: string;
  cardX: number; cardY: number;
  /** The card's size, 50–200 % of the standard. */
  cardScale: number;
  logoX: number; logoY: number;
  /** The logo's height as a percentage of the video's short side (3–40). */
  logoScale: number;
  /** 0 square … 50 a circle or pill. */
  logoRadius: number;
  /** 10–100 %. */
  logoOpacity: number;
  /** The logo's plain background taken out (done in this browser). */
  logoCut: boolean;
}
export const NO_BRAND: Brand = { card: false, title: '', desc: '', cardX: 0, cardY: 1, cardScale: 100, logoX: 1, logoY: 0, logoScale: 10, logoRadius: 0, logoOpacity: 100, logoCut: false };
/** The margin round the title card and the logo. */
const brandMargin = (W: number, H: number) => Math.round(Math.min(W, H) * 0.035);
/** A w×h box placed at fractions x/y of the room left inside the margin. */
export function placeBox(W: number, H: number, w: number, h: number, x: number, y: number): Rect {
  const m = brandMargin(W, H);
  return { x: Math.round(m + x * Math.max(0, W - 2 * m - w)), y: Math.round(m + y * Math.max(0, H - 2 * m - h)), w, h };
}
/** The fractions that put a w×h box's top-left at (left, top) — the inverse of placeBox, clamped onto the picture. */
export function placeAt(W: number, H: number, w: number, h: number, left: number, top: number): { x: number; y: number } {
  const m = brandMargin(W, H), c = (v: number) => Math.min(1, Math.max(0, v));
  return { x: c((left - m) / Math.max(1, W - 2 * m - w)), y: c((top - m) / Math.max(1, H - 2 * m - h)) };
}

/** Everything one frame is drawn from. */
export interface Scene {
  screen: Feed | null;
  cam: Feed | null;
  /** Camera only: the camera fills the frame, no bubble and no screen frame. */
  camOnly: boolean;
  look: Look; image: ImageBitmap | null;
  /** Where the screen and the camera sit (only 'bubble' matters without a camera). */
  layout: Layout;
  bubble: Bubble; frame: CamFrame;
  fx: CamFx; camBg: ImageBitmap | null;
  brand: Brand; logo: ImageBitmap | null;
  /** The microphone's level, 0–1 (the voice ring). */
  level: number;
  now: number;
}

/** A box that does not change from frame to frame, painted with the background: its shadow, and its rounded corners cut out of the patch layer. */
interface Hole { r: Rect; k: number }

/**
 * Draws the recorded frame: background, the screen in its rounded frame, the
 * camera as a bubble or a panel. Built for slow computers. A canvas keeps its
 * pixels between frames, and nothing outside the screen and the camera moves,
 * so the background (gradient, picture scaled to cover, the boxes' shadows)
 * is painted onto the canvas only when a setting, the layout or a box's shape
 * changes. A frame is then: the screen copied into its box, small corner
 * patches cut from the background (rounded corners without a clip — for a
 * camera panel too), the bubble's box or a ring's thin strips put back from
 * the background, and the camera drawn. A full-frame copy or a shadow blur
 * every frame cost a software-drawn canvas 4–5 ms a frame — the difference
 * between 60 fps and a stutter on a small laptop — so glows and shadows are
 * blurred once into sprites and only copied.
 */
export class Compositor {
  private layer: Cv | null = null;
  private holed: Cv | null = null;
  private layerKey = '';
  /** The bubble's shadow. */
  private sprite: Cv | null = null;
  private spriteKey = '';
  /** A neon ring's glow. */
  private glow: Cv | null = null;
  private glowKey = '';
  /** The presenter layout's screen shadow. */
  private inset: Cv | null = null;
  private insetKey = '';
  private card: Cv | null = null;
  private cardKey = '';
  /** The logo at its size, rounded and see-through as chosen. */
  private logoSprite: Cv | null = null;
  private logoKey = '';
  private dirty: Rect[] = [];
  /* A replaced picture of the same size must still repaint the layer. */
  private ids = new WeakMap<ImageBitmap, number>();
  private nextId = 1;
  /** The camera's look, and the person-finder behind a camera background. */
  readonly fx = new CameraFx();
  /** Where the screen was last drawn, in canvas pixels. */
  box: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** Where the camera was last drawn, in canvas pixels (null when it was not). */
  camBox: Rect | null = null;
  /** Where the title card and the logo were last drawn (what dragging them on the preview grabs). */
  cardBox: Rect | null = null;
  logoBox: Rect | null = null;

  /** The canvas was resized (which clears it): paint the background again on the next frame. */
  invalidate() { this.layerKey = ''; }

  draw(ctx: CanvasRenderingContext2D, sc: Scene) {
    const W = ctx.canvas.width, H = ctx.canvas.height, short = Math.min(W, H);
    const cam = sc.cam && sc.cam.videoWidth && (!('frame' in sc.cam) || sc.cam.frame) ? sc.cam : null;
    if (sc.camOnly) {
      const r: Rect = { x: 0, y: 0, w: W, h: H };
      this.box = r; this.camBox = cam ? r : null;
      this.background(ctx, W, H, 'cam', [], PLAIN_LOOK, null);
      if (cam) this.fx.draw(ctx, cam, r, sc.bubble.mirror, sc.fx, sc.camBg, false, sc.now);
      else { ctx.fillStyle = '#101117'; ctx.fillRect(0, 0, W, H); }
      this.drawBrand(ctx, W, H, sc);
      return;
    }
    const look = sc.look, framed = look.bg.kind !== 'none';
    const sv = sc.screen && sc.screen.videoWidth && (!('frame' in sc.screen) || sc.screen.frame) ? sc.screen : null;
    const cutout = sc.fx.bg === 'remove';
    const L = layoutRects(W, H, sc.layout, look, sv ? sv.videoWidth / sv.videoHeight : W / H, cam ? cam.videoWidth / cam.videoHeight : null, sc.bubble, cutout);
    const presenter = L.panel && sc.layout === 'presenter';
    /* Beside a panel the screen is rounded even with the background off: two boxes on a dark fill. */
    const kS = framed || L.panel ? Math.min(Math.round(short * look.radius / 100), L.screen.w / 2, L.screen.h / 2) : 0;
    const camFull = !!L.cam && L.cam.w >= W && L.cam.h >= H;
    const kC = L.panel && L.cam && !camFull ? camRadius(L.cam, sc.frame.shape, true, short) : 0;
    const holes: Hole[] = [];
    if (!presenter) holes.push({ r: L.screen, k: kS });
    if (L.panel && L.cam) holes.push({ r: L.cam, k: kC });
    this.box = L.screen; this.camBox = L.cam;
    this.background(ctx, W, H, L.panel ? sc.layout : 'bubble', holes, look, sc.image);
    if (!presenter) this.drawScreen(ctx, sv, L.screen, kS, framed);
    if (cam && L.cam) {
      if (L.panel) {
        /* A panel is a solid box: a removed background gets its colour behind the person, never see-through — nothing under a panel is put back each frame. */
        this.fx.draw(ctx, cam, L.cam, sc.bubble.mirror, sc.fx, sc.camBg, false, sc.now);
        /* Filling the whole frame (presenter, background off) it has no corners and no ring. */
        if (!camFull) { this.patches(ctx, L.cam, kC); this.drawRing(ctx, L.cam, kC, false, sc.frame, sc.now, true, sc.level); }
      } else this.drawBubble(ctx, W, H, cam, L.cam, sc, cutout);
    }
    if (presenter) this.drawInset(ctx, sv, L.screen, kS, short);
    this.drawBrand(ctx, W, H, sc);
  }

  /** The background layer: painted when its key changes, otherwise only last frame's dirty boxes are put back. */
  private background(ctx: CanvasRenderingContext2D, W: number, H: number, tag: string, holes: Hole[], look: Look, image: ImageBitmap | null) {
    const framed = look.bg.kind !== 'none';
    const key = `${W}x${H}|${tag}|${holes.map(h => `${h.r.x},${h.r.y},${h.r.w},${h.r.h},${h.k}`).join(';')}|${JSON.stringify(look)}|${image && framed ? this.idOf(image) : ''}`;
    if (key !== this.layerKey || !this.layer) {
      this.paintLayer(W, H, holes, look, image);
      this.layerKey = key;
      ctx.drawImage(this.layer!, 0, 0);
    } else {
      /* Where the bubble, rings, card and logo were last frame: back to background before anything is drawn over them again. */
      for (const d of this.dirty) ctx.drawImage(this.layer, d.x, d.y, d.w, d.h, d.x, d.y, d.w, d.h);
    }
    this.dirty = [];
  }

  /** A box to put back from the background next frame, kept on the canvas (a copy from outside the layer would fail). */
  private dirtyRect(r: Rect, W: number, H: number) {
    const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
    const x1 = Math.min(W, Math.ceil(r.x + r.w)), y1 = Math.min(H, Math.ceil(r.y + r.h));
    if (x1 > x0 && y1 > y0) this.dirty.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }

  private drawScreen(ctx: CanvasRenderingContext2D, sv: Feed | null, r: Rect, k: number, framed: boolean) {
    if (sv) ctx.drawImage(pic(sv), r.x, r.y, r.w, r.h);
    else { ctx.fillStyle = framed ? '#1b1d26' : '#101117'; ctx.fillRect(r.x, r.y, r.w, r.h); }
    this.patches(ctx, r, k);
  }

  /** Four corner patches from the background with the box's rounded shape cut out: rounded corners with no clip. */
  private patches(ctx: CanvasRenderingContext2D, r: Rect, k: number) {
    if (k <= 0 || !this.holed) return;
    const c = Math.ceil(k) + 1;
    for (const [x, y] of [[r.x, r.y], [r.x + r.w - c, r.y], [r.x, r.y + r.h - c], [r.x + r.w - c, r.y + r.h - c]]) ctx.drawImage(this.holed, x, y, c, c, x, y, c, c);
  }

  private drawBubble(ctx: CanvasRenderingContext2D, W: number, H: number, cam: Feed, br: Rect, sc: Scene, cutout: boolean) {
    const b = sc.bubble;
    /* A removed background in a bubble is a cut-out: the person stands over the screen, no frame or ring round them. */
    if (cutout) {
      this.dirtyRect(br, W, H);
      this.fx.draw(ctx, cam, br, b.mirror, sc.fx, sc.camBg, true, sc.now);
      return;
    }
    const f = sc.frame, circle = f.shape === 'circle', short = Math.min(W, H);
    const k = camRadius(br, f.shape, false, short);
    const blur = Math.round(br.h / 14);
    /* The box put back next frame reaches as far as the shadow or the ring's glow, whichever is further. */
    const E = Math.max(blur * 2, ringSize(br, f.ring, short).ext);
    const sk = `${br.w}x${br.h}|${f.shape}`;
    if (sk !== this.spriteKey || !this.sprite) {
      this.sprite = layerCanvas(br.w + blur * 4, br.h + blur * 4);
      const spc = this.sprite.getContext('2d') as Ctx2D;
      spc.shadowColor = 'rgba(0,0,0,.45)'; spc.shadowBlur = blur;
      edgePath(spc, { x: blur * 2, y: blur * 2, w: br.w, h: br.h }, k, circle);
      spc.fillStyle = '#000'; spc.fill();
      this.spriteKey = sk;
    }
    this.dirtyRect({ x: br.x - E, y: br.y - E, w: br.w + 2 * E, h: br.h + 2 * E }, W, H);
    ctx.drawImage(this.sprite, br.x - blur * 2, br.y - blur * 2);
    ctx.save();
    edgePath(ctx, br, k, circle);
    ctx.clip();
    this.fx.draw(ctx, cam, br, b.mirror, sc.fx, sc.camBg, false, sc.now);
    ctx.restore();
    this.drawRing(ctx, br, k, circle, f, sc.now, false, sc.level);
  }

  /**
   * The ring round the camera. The lines are one or two strokes a frame
   * (a gradient's angle read from the clock, a turn every four seconds);
   * the moving dashes, dots and comet are the same stroke with a dash pattern
   * whose offset moves round the edge — any shape, no per-dot drawing. Neon's
   * glow is blurred once into a sprite and copied — a shadow blur each frame
   * is what slow computers cannot afford — and a breathing ring is the same
   * sprite drawn fainter and brighter. Round a panel only the strips the ring
   * covers are copied, and put back next frame.
   */
  private drawRing(ctx: CanvasRenderingContext2D, r: Rect, k: number, circle: boolean, f: CamFrame, now: number, panel: boolean, level = 0) {
    if (f.ring === 'none') return;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const { lw, glow, ext } = ringSize(r, f.ring, Math.min(W, H));
    if (panel) for (const b of bandRects(r, ext, 0)) this.dirtyRect(b, W, H);
    const turn = (now / 4000 % 1) * Math.PI * 2;
    const stroke = (paint: string | CanvasGradient, width: number, rr: Rect = r, kk = k) => { edgePath(ctx, rr, kk, circle); ctx.lineWidth = width; ctx.strokeStyle = paint; ctx.stroke(); };
    ctx.save();
    switch (f.ring) {
      case 'white': stroke('rgba(255,255,255,.9)', lw); break;
      case 'solid': stroke(this.paint(ctx, r, f.ringColor, 0), lw); break;
      case 'double': {
        const d = lw * 2.2;
        stroke(this.paint(ctx, r, f.ringColor, 0), lw);
        stroke(this.paint(ctx, r, f.ringColor, Math.PI), lw, { x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d }, k > 0 ? k + d : 0);
        break;
      }
      case 'dashed': case 'march': {
        const P = perimeter(r, k, circle), n = Math.max(8, Math.round(P / (lw * 4.2)));
        ctx.setLineDash([P / n * 0.62, P / n * 0.38]);
        if (f.ring === 'march') ctx.lineDashOffset = -(now / 1000) * (P / 6);
        stroke(this.paint(ctx, r, f.ringColor, f.ring === 'march' ? turn : 0), lw);
        break;
      }
      case 'dots': {
        const P = perimeter(r, k, circle), n = Math.max(10, Math.round(P / (lw * 3.4)));
        ctx.setLineDash([0.001, P / n]); ctx.lineCap = 'round';
        ctx.lineDashOffset = -(now / 1000) * (P / 8);
        stroke(this.paint(ctx, r, f.ringColor, turn), lw * 1.5);
        break;
      }
      case 'comet': {
        /* A faint track, and a bright head with a tail fading behind it — three dashes ending at the same point. */
        const P = perimeter(r, k, circle), head = ((now / 2200) % 1) * P;
        ctx.globalAlpha = 0.22; stroke(this.paint(ctx, r, f.ringColor, 0), lw * 0.7);
        ctx.lineCap = 'round';
        for (const [len, a, wk] of [[0.3, 0.25, 0.8], [0.18, 0.55, 1], [0.07, 1, 1.25]] as const) {
          ctx.globalAlpha = a;
          ctx.setLineDash([P * len, P * (1 - len)]);
          ctx.lineDashOffset = -(head - P * len);
          stroke(this.paint(ctx, r, f.ringColor, turn), lw * wk);
        }
        break;
      }
      case 'gradient': case 'rainbow': {
        const stops = f.ring === 'rainbow' ? RAINBOW : gradOf(f.ringColor) ? [...gradOf(f.ringColor)!, gradOf(f.ringColor)![0]] : ringStops(f.ringColor);
        stroke(this.conic(ctx, r, stops, turn), lw);
        break;
      }
      case 'voice': {
        /* Thicker and brighter as the voice rises; a faint second ring swells out on the loudest moments. */
        const v = Math.min(1, Math.max(0, level));
        const paint = this.paint(ctx, r, f.ringColor, turn);
        stroke(paint, lw * (1 + v * 1.6));
        if (v > 0.08) {
          const d = lw * (1.5 + v * 3);
          ctx.globalAlpha = 0.15 + v * 0.5;
          stroke(paint, Math.max(1, lw * 0.6), { x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d }, k > 0 ? k + d : 0);
        }
        break;
      }
      default: {
        /* neon and pulse */
        const P = ext, color = ringSolid(f.ringColor);
        const key = `${r.w}x${r.h}|${k}|${circle}|${f.ringColor}|${glow}|${lw}`;
        if (key !== this.glowKey || !this.glow) {
          this.glow = sizedLayer(this.glow, r.w + 2 * P, r.h + 2 * P);
          const gc = this.glow.getContext('2d') as Ctx2D;
          gc.clearRect(0, 0, this.glow.width, this.glow.height);
          gc.shadowColor = color; gc.shadowBlur = glow;
          gc.strokeStyle = this.paint(gc, { x: P, y: P, w: r.w, h: r.h }, f.ringColor, 0); gc.lineWidth = lw;
          edgePath(gc, { x: P, y: P, w: r.w, h: r.h }, k, circle);
          gc.stroke(); gc.stroke();
          gc.shadowBlur = 0; gc.shadowColor = 'transparent';
          this.glowKey = key;
        }
        ctx.globalAlpha = f.ring === 'pulse' ? 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(now / 1700 * Math.PI * 2)) : 1;
        const ox = r.x - P, oy = r.y - P;
        if (panel) { for (const b of bandRects(r, P, P + k)) if (b.w > 0 && b.h > 0) ctx.drawImage(this.glow, b.x - ox, b.y - oy, b.w, b.h, b.x, b.y, b.w, b.h); }
        else ctx.drawImage(this.glow, ox, oy);
        ctx.globalAlpha = 1;
        /* The tube itself stays lit while its glow breathes: the colour, with a paler core. */
        stroke(this.paint(ctx, r, f.ringColor, 0), lw);
        stroke('rgba(255,255,255,.6)', Math.max(1, lw * 0.4));
      }
    }
    ctx.restore();
  }

  /** A ring colour's paint: the colour itself, or its gradient turned by `angle` round the box's middle. */
  private paint(ctx: Ctx2D, r: Rect, color: string, angle: number): string | CanvasGradient {
    const g = gradOf(color);
    return g ? this.conic(ctx, r, [...g, g[0]], angle) : color;
  }

  private conic(ctx: Ctx2D, r: Rect, stops: readonly string[], angle: number): CanvasGradient {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    let g: CanvasGradient;
    /* Conic gradients arrived in Chrome 99, Safari 16.4 and Firefox 112; before that a turning linear one. */
    if (typeof ctx.createConicGradient === 'function') g = ctx.createConicGradient(angle, cx, cy);
    else { const dx = Math.cos(angle) * r.w / 2, dy = Math.sin(angle) * r.h / 2; g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy); }
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    return g;
  }

  /**
   * Presenter: the screen as an inset over the camera. The camera under it is
   * drawn whole every frame, so nothing needs putting back; the inset is
   * clipped to its roundness (corner patches would cut from the background,
   * not from the camera) and its shadow is a sprite copied as four strips.
   */
  private drawInset(ctx: CanvasRenderingContext2D, sv: Feed | null, r: Rect, k: number, short: number) {
    const blur = Math.max(2, Math.round(short * 0.012)), P = blur * 2;
    const key = `${r.w}x${r.h}|${k}|${blur}`;
    if (key !== this.insetKey || !this.inset) {
      this.inset = sizedLayer(this.inset, r.w + 2 * P, r.h + 2 * P);
      const ic = this.inset.getContext('2d') as Ctx2D;
      ic.clearRect(0, 0, this.inset.width, this.inset.height);
      ic.shadowColor = 'rgba(0,0,0,.5)'; ic.shadowBlur = blur;
      roundPath(ic, { x: P, y: P, w: r.w, h: r.h }, k); ic.fillStyle = '#000'; ic.fill();
      ic.shadowBlur = 0; ic.shadowColor = 'transparent';
      this.insetKey = key;
    }
    const ox = r.x - P, oy = r.y - P;
    for (const b of bandRects(r, P, 0)) if (b.w > 0 && b.h > 0) ctx.drawImage(this.inset, b.x - ox, b.y - oy, b.w, b.h, b.x, b.y, b.w, b.h);
    ctx.save();
    if (k > 0) { roundPath(ctx, r, k); ctx.clip(); }
    if (sv) ctx.drawImage(pic(sv), r.x, r.y, r.w, r.h);
    else { ctx.fillStyle = '#1b1d26'; ctx.fillRect(r.x, r.y, r.w, r.h); }
    ctx.restore();
  }

  private drawBrand(ctx: CanvasRenderingContext2D, W: number, H: number, sc: Scene) {
    this.drawCard(ctx, W, H, sc.brand);
    this.logoBox = null;
    if (!sc.logo) return;
    const br = sc.brand, L = sc.logo, short = Math.min(W, H);
    /* The height chosen; a wide logo is held to most of the width. */
    let lh = Math.max(4, Math.round(short * br.logoScale / 100));
    let lw = Math.round(lh * L.width / L.height);
    if (lw > W * 0.8) { lw = Math.round(W * 0.8); lh = Math.round(lw * L.height / L.width); }
    const box = placeBox(W, H, lw, lh, br.logoX, br.logoY);
    /* Rounded and see-through once into a sprite per size: a clip and alpha each frame is what a slow computer cannot spare. */
    const key = `${this.idOf(L)}|${lw}x${lh}|${br.logoRadius}|${br.logoOpacity}`;
    if (key !== this.logoKey || !this.logoSprite) {
      this.logoSprite = sizedLayer(this.logoSprite, lw, lh);
      const g = this.logoSprite.getContext('2d') as Ctx2D;
      g.clearRect(0, 0, lw, lh);
      g.save();
      if (br.logoRadius > 0) { roundPath(g, { x: 0, y: 0, w: lw, h: lh }, Math.min(lw, lh) * br.logoRadius / 100); g.clip(); }
      g.globalAlpha = br.logoOpacity / 100;
      g.imageSmoothingQuality = 'high';
      g.drawImage(L, 0, 0, lw, lh);
      g.restore();
      this.logoKey = key;
    }
    ctx.drawImage(this.logoSprite, box.x, box.y);
    this.logoBox = box;
    this.dirtyRect(box, W, H);
  }

  /** The title card, drawn once into a sprite per wording and size, then copied each frame. */
  private drawCard(ctx: CanvasRenderingContext2D, W: number, H: number, br: Brand) {
    const title = br.title.trim(), desc = br.desc.trim();
    this.cardBox = null;
    if (!br.card || (!title && !desc)) return;
    const key = `${W}x${H}|${title}|${desc}|${br.cardScale}`;
    if (key !== this.cardKey || !this.card) { this.card = paintCard(W, H, title, desc, br.cardScale / 100); this.cardKey = key; }
    const box = placeBox(W, H, this.card.width, this.card.height, br.cardX, br.cardY);
    ctx.drawImage(this.card, box.x, box.y);
    this.cardBox = box;
    this.dirtyRect(box, W, H);
  }

  private idOf(im: ImageBitmap) {
    let id = this.ids.get(im);
    if (!id) { id = this.nextId++; this.ids.set(im, id); }
    return id;
  }

  /** The background with the fixed boxes' shadows, and a copy with their rounded shapes cut out (the corner patches). */
  private paintLayer(W: number, H: number, holes: Hole[], look: Look, image: ImageBitmap | null) {
    const c = sizedLayer(this.layer, W, H);
    const lc = c.getContext('2d') as Ctx2D;
    lc.clearRect(0, 0, W, H);
    paintBackdrop(lc, W, H, look.bg, image);
    if (look.bg.kind !== 'none' && look.shadow > 0) {
      const s = look.shadow / 100, short = Math.min(W, H);
      lc.save();
      lc.shadowColor = `rgba(0,0,0,${(0.55 * s).toFixed(3)})`;
      lc.shadowBlur = Math.round(short * 0.05 * s); lc.shadowOffsetY = Math.round(short * 0.015 * s);
      for (const h of holes) { roundPath(lc, h.r, h.k); lc.fillStyle = '#000'; lc.fill(); }
      lc.restore();
    }
    this.layer = c;
    if (!holes.some(h => h.k > 0)) { this.holed = null; return; }
    const hd = sizedLayer(this.holed, W, H);
    const hc = hd.getContext('2d') as Ctx2D;
    hc.globalCompositeOperation = 'source-over';
    hc.clearRect(0, 0, W, H);
    hc.drawImage(c, 0, 0);
    hc.globalCompositeOperation = 'destination-out';
    for (const h of holes) if (h.k > 0) { roundPath(hc, h.r, h.k); hc.fill(); }
    hc.globalCompositeOperation = 'source-over';
    this.holed = hd;
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
  return Math.round(Math.min(q.max, Math.max(q.min, w * h * 30 * q.bpp * Math.pow(fps / 30, 0.6))));
}

/* ── Where the pointer went ────────────────────────────────────────────── */

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const GW = 16, GH = 9;

/**
 * Where the pointer goes and clicks, noted while recording. Nothing is
 * zoomed or followed live — the owner wants that decided afterwards: the
 * editor proposes moments from this and from what was said
 * (worker/src/lib/video/pointer.ts) and the person chooses.
 *
 * A browser is never told where the pointer is over other windows, so it is
 * read from the picture: eight times a second the shared screen is copied at
 * 320 pixels wide in grey and compared with the last look. The pointer is
 * the small thing that changed; a fifth of the picture changing at once is a
 * scroll or a new page, and no pointer is read from it. A likely click is the
 * pointer coming to rest and then the screen answering near it — a button
 * lighting, a menu opening, a page changing. Close, not exact: a playing
 * video or a busy page can mislead it, which is why it only proposes.
 *
 * Light on purpose: the buffers are made once per size and reused, and a
 * look is one pass over 57,600 pixels (grey, compare and count together) —
 * well under a millisecond — plus the browser's own copy of the frame.
 */
export class PointerLog {
  private c: Ctx2D | null = null;
  private SW = 0; private SH = 0;
  /**
   * The last three looks, rotated. Two back is what tells where the pointer
   * arrived from where it left: where it left, the picture is back to what it
   * was two looks ago; where it arrived, it differs from both. Without it the
   * estimate sat halfway between the two and lagged where the pointer stopped.
   */
  private cur = new Uint8Array(0); private prev = new Uint8Array(0); private prev2 = new Uint8Array(0);
  /** Pixel column / row → grid cell, worked out once per size. */
  private col = new Uint8Array(0); private row = new Uint8Array(0);
  /** Looks since a reset (0: nothing to compare with; 1: no look two back yet). */
  private looks = 0;
  private cellN = new Uint32Array(GW * GH); private cellX = new Float64Array(GW * GH); private cellY = new Float64Array(GW * GH);
  private seen = new Uint8Array(GW * GH); private stack = new Int16Array(GW * GH);
  private last = -1e9;
  /** The pointer estimate (0–1 of the screen). */
  private hasEst = false; private ex = 0; private ey = 0;
  /** Where it came to rest, since when (clock ms and recording seconds), and whether that rest already gave a click. */
  private sx = 0; private sy = 0; private since = 0; private sinceT = 0; private clicked = true;
  private lastAnswer = -1e9; private lastClick = -1e9;
  private bx = 0; private by = 0;
  /** [t, x, y]: t in seconds of the recording (pauses left out), x/y 0–1 of the shared screen's own picture. Only while it moves. */
  path: [number, number, number][] = [];
  /** Likely clicks, as above. */
  clicks: [number, number, number][] = [];
  /** When a scroll or page change happened (seconds of the recording). */
  big: number[] = [];

  /** A new recording. */
  clear() {
    this.reset();
    this.path = []; this.clicks = []; this.big = [];
    this.hasEst = false; this.clicked = true; this.lastAnswer = this.lastClick = -1e9;
  }
  /** Another screen shared, or a pause ended: the next look starts afresh rather than comparing two different pictures. */
  reset() { this.looks = 0; this.last = -1e9; }

  /** One look, at most eight a second; `now` is the clock (ms), `t` the recording's time (s). */
  look(v: Feed, now: number, t: number) {
    if (now - this.last < 125) return;
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) return;
    this.last = now;
    const SW = 320, SH = Math.max(60, Math.min(320, Math.round(SW * vh / vw)));
    if (SW !== this.SW || SH !== this.SH || !this.c) {
      this.c = layerCanvas(SW, SH).getContext('2d', { willReadFrequently: true }) as Ctx2D | null;
      this.SW = SW; this.SH = SH;
      this.cur = new Uint8Array(SW * SH); this.prev = new Uint8Array(SW * SH); this.prev2 = new Uint8Array(SW * SH);
      this.col = new Uint8Array(SW); this.row = new Uint8Array(SH);
      for (let x = 0; x < SW; x++) this.col[x] = Math.min(GW - 1, Math.floor(x * GW / SW));
      for (let y = 0; y < SH; y++) this.row[y] = Math.min(GH - 1, Math.floor(y * GH / SH));
      this.looks = 0;
    }
    const c = this.c;
    if (!c) return;
    let px: Uint8ClampedArray;
    try { c.drawImage(pic(v), 0, 0, SW, SH); px = c.getImageData(0, 0, SW, SH).data; } catch { return; }
    /* The new look goes into the oldest buffer; the last look is what it is compared with. */
    const old = this.cur, older = this.prev, g = this.prev2;
    this.cur = g; this.prev = old; this.prev2 = older;
    const first = this.looks === 0, two = this.looks >= 2;
    this.looks = Math.min(2, this.looks + 1);
    const { cellN, cellX, cellY, col, row } = this;
    cellN.fill(0); cellX.fill(0); cellY.fill(0);
    let n = 0, sx = 0, sy = 0, x0 = SW, y0 = SH, x1 = -1, y1 = -1, an = 0, ax = 0, ay = 0;
    for (let y = 0, i = 0, j = 0; y < SH; y++) {
      const rb = row[y] * GW;
      for (let x = 0; x < SW; x++, i++, j += 4) {
        const lum = (px[j] * 77 + px[j + 1] * 150 + px[j + 2] * 29) >> 8;
        const d = lum - old[i];
        g[i] = lum;
        if (first || (d < 24 && d > -24)) continue;
        n++; sx += x; sy += y;
        const d2 = lum - older[i];
        if (!two || d2 >= 24 || d2 <= -24) { an++; ax += x; ay += y; }
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        const ci = rb + col[x];
        cellN[ci]++; cellX[ci] += x; cellY[ci] += y;
      }
    }
    /* Nothing changed, or a few pixels (a blinking caret): the pointer, if anywhere, is resting. */
    if (first || n < 4) return;
    const N = SW * SH, asp = SH / SW;
    const bw = (x1 - x0 + 1) / SW, bh = (y1 - y0 + 1) / SH;
    const big = n > N * 0.2;
    /* The screen answering: a page change, or a change bigger than a pointer could make. */
    const answer = big || (n > N * 0.003 && (bw >= 0.08 || bh >= 0.08));
    if (answer) {
      /*
       * A click: the pointer has rested at least 200 ms, the screen was quiet
       * just before, and it answers near the pointer (anywhere, for a page
       * change). The window runs to 1.2 s of rest — a click lands a moment
       * after the pointer stops, and the screen answers a moment after that.
       * One click per rest, and never two within 350 ms. A playing video keeps
       * the screen from ever being quiet, so it cannot fake clicks.
       */
      const rest = now - this.since;
      if (this.hasEst && !this.clicked && rest >= 200 && rest <= 1200 && now - this.lastAnswer >= 400 && now - this.lastClick >= 350) {
        const dx = Math.max(x0 / SW - this.sx, 0, this.sx - (x1 + 1) / SW), dy = Math.max(y0 / SH - this.sy, 0, this.sy - (y1 + 1) / SH);
        if (big || Math.hypot(dx, dy * asp) <= 0.12) {
          if (this.clicks.length < 5000) this.clicks.push([r2(Math.max(this.sinceT, t - 0.15)), r3(this.sx), r3(this.sy)]);
          this.clicked = true; this.lastClick = now;
        }
      }
      this.lastAnswer = now;
    }
    if (big) { if (this.big.length < 5000) this.big.push(r2(t)); return; }
    let cx: number, cy: number;
    if (bw < 0.08 && bh < 0.08) {
      /* Where it arrived, when that can be told apart; otherwise the middle of what changed. */
      if (an >= 3) { cx = (ax / an + 0.5) / SW; cy = (ay / an + 0.5) / SH; } else { cx = (sx / n + 0.5) / SW; cy = (sy / n + 0.5) / SH; }
    }
    else if (this.blob(N)) { cx = this.bx; cy = this.by; }
    else return;
    /* The screen answering (a menu opening) is not the pointer moving: then only a blob right by the estimate moves it. */
    if (answer && this.hasEst && Math.hypot(cx - this.ex, (cy - this.ey) * asp) > 0.06) return;
    this.move(cx, cy, now, t, asp);
  }

  /** The small group of changed cells nearest the last estimate (before there is one, the smallest). */
  private blob(N: number): boolean {
    const { cellN, cellX, cellY, seen, stack } = this;
    seen.fill(0);
    let best = Infinity, found = false;
    for (let s = 0; s < GW * GH; s++) {
      if (seen[s] || cellN[s] < 2) continue;
      let top = 0, pn = 0, ax = 0, ay = 0, c0 = GW, c1 = -1, r0 = GH, r1 = -1;
      stack[top++] = s; seen[s] = 1;
      while (top) {
        const q = stack[--top], qx = q % GW, qy = (q / GW) | 0;
        pn += cellN[q]; ax += cellX[q]; ay += cellY[q];
        if (qx < c0) c0 = qx;
        if (qx > c1) c1 = qx;
        if (qy < r0) r0 = qy;
        if (qy > r1) r1 = qy;
        /* Each cell is pushed once (marked as it is pushed), so the stack never outgrows the grid. */
        if (qx > 0 && !seen[q - 1] && cellN[q - 1] >= 2) { seen[q - 1] = 1; stack[top++] = q - 1; }
        if (qx < GW - 1 && !seen[q + 1] && cellN[q + 1] >= 2) { seen[q + 1] = 1; stack[top++] = q + 1; }
        if (qy > 0 && !seen[q - GW] && cellN[q - GW] >= 2) { seen[q - GW] = 1; stack[top++] = q - GW; }
        if (qy < GH - 1 && !seen[q + GW] && cellN[q + GW] >= 2) { seen[q + GW] = 1; stack[top++] = q + GW; }
      }
      /* A pointer covers a cell or two; a bigger group is the page doing something. */
      if (c1 - c0 > 1 || r1 - r0 > 1 || pn > N * 0.006) continue;
      const x = (ax / pn + 0.5) / this.SW, y = (ay / pn + 0.5) / this.SH;
      const score = this.hasEst ? Math.hypot(x - this.ex, (y - this.ey) * this.SH / this.SW) : pn;
      if (score < best) { best = score; this.bx = x; this.by = y; found = true; }
    }
    return found;
  }

  private move(cx: number, cy: number, now: number, t: number, asp: number) {
    /* Lightly smoothed; a long jump is taken at once rather than dragged across the screen. */
    if (!this.hasEst || Math.abs(cx - this.ex) > 0.25 || Math.abs(cy - this.ey) > 0.25) { this.ex = cx; this.ey = cy; }
    else { this.ex += (cx - this.ex) * 0.75; this.ey += (cy - this.ey) * 0.75; }
    const firstEst = !this.hasEst;
    this.hasEst = true;
    /* Moving is more than 1% of the width from where it last rested; less is the estimate settling. */
    if (firstEst || Math.hypot(this.ex - this.sx, (this.ey - this.sy) * asp) > 0.01) {
      this.sx = this.ex; this.sy = this.ey; this.since = now; this.sinceT = t; this.clicked = false;
    }
    const p: [number, number, number] = [r2(t), r3(this.ex), r3(this.ey)];
    const l = this.path[this.path.length - 1];
    if ((!l || l[1] !== p[1] || l[2] !== p[2]) && this.path.length < 60_000) this.path.push(p);
  }
}

/** A canvas box as fractions of the frame, kept inside it. */
const nbox = (r: Rect, W: number, H: number): NBox => {
  const x = Math.min(1, Math.max(0, r.x / W)), y = Math.min(1, Math.max(0, r.y / H));
  return [r3(x), r3(y), r3(Math.min(1 - x, r.w / W)), r3(Math.min(1 - y, r.h / H))];
};
const sameBox = (a: NBox | null, b: NBox | null) => a === b || (!!a && !!b && a.every((v, i) => v === b[i]));

/**
 * Where the screen and the camera were drawn over a recording — what lets
 * the editor find the pointer in the frame and crop a Short round the screen
 * or the camera. A segment is pushed only when something changed.
 */
export class LayoutLog {
  segs: ScreenSeg[] = [];
  clear() { this.segs = []; }
  note(t: number, layout: string, screen: Rect | null, cam: Rect | null, shape: CamShape, W: number, H: number) {
    if (!W || !H) return;
    const s: ScreenSeg = { t: this.segs.length ? r2(t) : 0, layout, screen: screen ? nbox(screen, W, H) : null, cam: cam ? nbox(cam, W, H) : null, shape };
    const l = this.segs[this.segs.length - 1];
    if (l && l.layout === s.layout && l.shape === s.shape && sameBox(l.screen, s.screen) && sameBox(l.cam, s.cam)) return;
    /* Dragging the bubble moves it every frame: changes within half a second fold into one, so a long drag cannot fill the list (the server keeps 500). */
    if (l && (s.t - l.t < 0.5 || this.segs.length >= 500)) { this.segs[this.segs.length - 1] = { ...s, t: l.t }; return; }
    this.segs.push(s);
  }
}

/** What the recorder saw, for the saved recording — null when nothing was noted (or it was too short to keep). */
export function screenMeta(w: number, h: number, ms: number, log: PointerLog, lay: LayoutLog): ScreenMeta | null {
  const dur = r2(ms / 1000);
  if (!lay.segs.length || dur < 0.5 || !w || !h) return null;
  const inside = (p: [number, number, number]) => p[0] <= dur;
  return { v: 1, w, h, dur, segs: lay.segs.map(s => ({ ...s, t: Math.min(s.t, dur) })), path: log.path.filter(inside), clicks: log.clicks.filter(inside), how: 'picture' };
}

/* ── Remembered choices ────────────────────────────────────────────────── */

export interface Prefs {
  fps: Fps; res: Res; quality: Quality; camRes: CamRes; look: Look;
  /** What switching the background back on brings: the last colour or gradient chosen (a picture is never remembered). */
  lastBg: Backdrop;
  /** Screen + camera: where the two sit. */
  layout: Layout;
  /** The camera's shape and ring. */
  frame: CamFrame;
  cursor: CursorMode; float: boolean;
  fx: CamFx; brand: Brand;
  /** Studio Sound switched on for the saved recording (applied by the engine when it is exported). */
  studio: boolean;
  /** The browser's own voice isolation while recording, where it has one. */
  isolate: boolean;
}
export const defaultPrefs = (slow = slowComputer()): Prefs => ({
  fps: 30, res: slow ? '720' : '1080', quality: slow ? 'light' : 'standard', camRes: slow ? '480' : '720',
  look: PLAIN_LOOK, lastBg: DEFAULT_BG, layout: 'bubble', frame: DEFAULT_FRAME, cursor: 'always', float: true,
  fx: NO_FX, brand: NO_BRAND, studio: true, isolate: true,
});

/**
 * Saved choices read back field by field — anything unknown falls back, and a
 * picture is never remembered. Keys from older versions (auto zoom's `zoom`
 * and `depth`) are simply not read.
 */
export function readPrefs(raw: unknown, base: Prefs = defaultPrefs()): Prefs {
  const obj = (v: unknown) => (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const o = obj(raw);
  const pick = <T,>(v: unknown, ok: readonly T[], d: T): T => ok.includes(v as T) ? v as T : d;
  const num = (v: unknown, lo: number, hi: number, d: number) => typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  const l = obj(o.look), f = obj(o.fx), br = obj(o.brand), fr = obj(o.frame);
  const str = (v: unknown, max: number) => typeof v === 'string' ? v.slice(0, max) : '';
  const bgOf = (b: Record<string, unknown>): Backdrop => b.kind === 'color' && typeof b.color === 'string' && /^#[0-9a-f]{6}$/i.test(b.color) ? { kind: 'color', color: b.color }
    : b.kind === 'gradient' && typeof b.id === 'string' && b.id in GRADIENTS ? { kind: 'gradient', id: b.id as GradientId }
      : b.kind === 'scene' && isScene(b.id) ? { kind: 'scene', id: b.id }
        : { kind: 'none' };
  /* Saved before the logo and card could sit anywhere: a corner and S/M/L, read as the same place and size. */
  const oldCorner = CORNERS[br.logoCorner as Corner] as { x: number; y: number } | undefined;
  const oldSize = ({ S: 7, M: 10, L: 14 } as Record<string, number>)[br.logoSize as string];
  const bg = bgOf(obj(l.bg)), last = bgOf(obj(o.lastBg));
  return {
    fps: pick(o.fps, FPS, base.fps),
    res: pick(o.res, Object.keys(RES) as Res[], base.res),
    quality: pick(o.quality, Object.keys(QUALITY) as Quality[], base.quality),
    camRes: pick(o.camRes, Object.keys(CAM_RES) as CamRes[], base.camRes),
    look: { bg, padding: num(l.padding, 0, 16, FRAMED.padding), radius: num(l.radius, 0, 6, FRAMED.radius), shadow: num(l.shadow, 0, 100, FRAMED.shadow) },
    /* Saved before there was a switch: the background then in use is the one to bring back. */
    lastBg: last.kind !== 'none' ? last : bg.kind !== 'none' ? bg : base.lastBg,
    layout: pick(o.layout, LAYOUTS, base.layout),
    frame: { shape: pick(fr.shape, SHAPES, base.frame.shape), ring: pick(fr.ring, RINGS, base.frame.ring), ringColor: okRingColor(fr.ringColor) ? fr.ringColor : base.frame.ringColor },
    cursor: pick(o.cursor, ['always', 'motion', 'never'] as CursorMode[], base.cursor),
    float: typeof o.float === 'boolean' ? o.float : base.float,
    fx: {
      bright: num(f.bright, -50, 50, 0), contrast: num(f.contrast, -50, 50, 0), sat: num(f.sat, -50, 50, 0), warmth: num(f.warmth, -50, 50, 0),
      hue: num(f.hue, -50, 50, 0), auto: f.auto === true,
      soften: num(f.soften, 0, 100, 0), night: f.night === true,
      /* The person's own picture is never remembered, so neither is choosing one; a ready-made scene is. */
      bg: pick(f.bg, ['none', 'blur', 'remove', 'scene'] as CamBg[], 'none'), blur: num(f.blur, 0, 100, NO_FX.blur),
      bgColor: typeof f.bgColor === 'string' && /^#[0-9a-f]{6}$/i.test(f.bgColor) ? f.bgColor : NO_FX.bgColor,
      scene: sceneOr(f.scene),
    },
    brand: {
      card: br.card === true, title: str(br.title, 60), desc: str(br.desc, 140),
      cardX: num(br.cardX, 0, 1, NO_BRAND.cardX), cardY: num(br.cardY, 0, 1, br.cardPos === 'tl' ? 0 : NO_BRAND.cardY), cardScale: num(br.cardScale, 50, 200, 100),
      logoX: num(br.logoX, 0, 1, oldCorner?.x ?? NO_BRAND.logoX), logoY: num(br.logoY, 0, 1, oldCorner?.y ?? NO_BRAND.logoY),
      logoScale: num(br.logoScale, 3, 40, oldSize ?? NO_BRAND.logoScale), logoRadius: num(br.logoRadius, 0, 50, 0), logoOpacity: num(br.logoOpacity, 10, 100, 100),
      logoCut: br.logoCut === true,
    },
    studio: typeof o.studio === 'boolean' ? o.studio : base.studio,
    isolate: typeof o.isolate === 'boolean' ? o.isolate : base.isolate,
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
