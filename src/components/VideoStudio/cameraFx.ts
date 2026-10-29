/**
 * The camera's look, drawn by the recorder's compositor: brightness,
 * contrast, colour, warmth, a night view, soft focus for skin, and the
 * background behind the person — blurred (by how much), removed, or a
 * picture. All of it is live, before and during a recording.
 *
 * Kept light: the grade is the canvas's own `filter` (one pass, on the
 * graphics chip); soft focus and blur are a shrunken copy stretched back up —
 * the cheapest blur there is — never a filter blur; the person-finder looks
 * at a 256-pixel copy at most 15 times a second, and less often on a slow
 * computer (never more than a quarter of the time: four times what a look
 * costs between looks), its outline reused in between. It starts on the
 * graphics chip and moves to the processor when looks there prove slow — on
 * a computer whose graphics are emulated a look took 267 ms against 17 ms.
 * Only the camera's own box is ever worked on.
 */
import type { ImageSegmenter, Delegate } from './segmenter';

export type CamBg = 'none' | 'blur' | 'remove' | 'image';
export interface CamFx {
  /** −50…50 each; 0 is the camera as it is. */
  bright: number; contrast: number; sat: number; warmth: number;
  /** 0–100: soft focus laid over the picture, for skin. */
  soften: number;
  /** Lifts a dark room. */
  night: boolean;
  bg: CamBg;
  /** 0–100, for 'blur'. */
  blur: number;
  /** Behind the person for 'remove' in camera-only recordings (in a bubble a removed background is see-through). */
  bgColor: string;
}
export const NO_FX: CamFx = { bright: 0, contrast: 0, sat: 0, warmth: 0, soften: 0, night: false, bg: 'none', blur: 60, bgColor: '#e5e7eb' };

/** Safari before 18 has no canvas filter: the grade is then not offered rather than silently ignored. */
export const canGrade = () => typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

export function gradeOf(fx: CamFx): string {
  const b = 1 + fx.bright / 100 + (fx.night ? 0.45 : 0);
  const c = 1 + fx.contrast / 100 + (fx.night ? 0.12 : 0);
  const s = 1 + fx.sat / 100 - (fx.night ? 0.1 : 0);
  const parts: string[] = [];
  if (Math.abs(b - 1) > 0.005) parts.push(`brightness(${b.toFixed(3)})`);
  if (Math.abs(c - 1) > 0.005) parts.push(`contrast(${c.toFixed(3)})`);
  if (Math.abs(s - 1) > 0.005) parts.push(`saturate(${s.toFixed(3)})`);
  /* Warm is a touch of sepia; cool turns the hue toward blue. */
  if (fx.warmth > 0) parts.push(`sepia(${(fx.warmth / 160).toFixed(3)})`);
  if (fx.warmth < 0) parts.push(`hue-rotate(${(fx.warmth / 5).toFixed(1)}deg)`);
  return parts.length ? parts.join(' ') : 'none';
}

export const isPlain = (fx: CamFx) => gradeOf(fx) === 'none' && fx.soften <= 0 && fx.bg === 'none';

type C2 = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Cv = HTMLCanvasElement | OffscreenCanvas;
const mk = (w: number, h: number): Cv => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
};
const sized = (c: Cv | null, w: number, h: number): Cv => {
  if (c && c.width === w && c.height === h) return c;
  if (c) { c.width = w; c.height = h; return c; }
  return mk(w, h);
};
const ctxOf = (c: Cv) => c.getContext('2d') as C2;

export interface Box { x: number; y: number; w: number; h: number }

/** The part of a w×h source that covers a box (object-fit: cover). */
export function coverSrc(vw: number, vh: number, r: Box): Box {
  const s = Math.max(r.w / vw, r.h / vh);
  const sw = r.w / s, sh = r.h / s;
  return { x: (vw - sw) / 2, y: (vh - sh) / 2, w: sw, h: sh };
}

type SegState = 'off' | 'loading' | 'ready' | 'failed';

export class CameraFx {
  private seg: ImageSegmenter | null = null;
  private loading: Promise<void> | null = null;
  state: SegState = 'off';
  error = '';
  private small: Cv | null = null;
  private feed: Cv | null = null;
  private mask: Cv | null = null;
  private work: Cv | null = null;
  private person: Cv | null = null;
  private lastSeg = 0;
  private hasMask = false;
  private delegate: Delegate = 'GPU';
  /** What a look costs, smoothed; and how many have been timed on this delegate. */
  private cost = 0;
  private looks = 0;
  private triedCpu = false;
  /** Told when the person-finder is ready or failed, so the page can say so. */
  onState: (() => void) | null = null;

  /** Starts loading the person-finder (once); drawing goes on without it meanwhile. */
  want() {
    if (this.loading) return;
    this.state = 'loading'; this.onState?.();
    this.loading = import('./segmenter').then(m => m.createSegmenter()).then(r => { this.seg = r.seg; this.delegate = r.delegate; this.state = 'ready'; this.onState?.(); }, e => {
      this.state = 'failed';
      this.error = (e as Error)?.message || 'it could not start';
      this.onState?.();
    });
  }

  /** Looks for the person, at most 15 times a second, on a copy at most 256 wide. */
  private segment(cam: HTMLVideoElement, now: number) {
    if (!this.seg || now - this.lastSeg < Math.max(66, this.cost * 4)) return;
    this.lastSeg = now;
    const t0 = performance.now();
    const vw = cam.videoWidth, vh = cam.videoHeight;
    const w = Math.min(256, vw), h = Math.max(2, Math.round(w * vh / vw));
    this.feed = sized(this.feed, w, h);
    ctxOf(this.feed).drawImage(cam, 0, 0, w, h);
    let res;
    try { res = this.seg.segmentForVideo(this.feed as HTMLCanvasElement, now); } catch (e) { this.state = 'failed'; this.error = (e as Error)?.message ?? ''; this.onState?.(); return; }
    try {
      const m = res.confidenceMasks?.[0];
      if (!m) return;
      const f = m.getAsFloat32Array(), mw = m.width, mh = m.height;
      this.mask = sized(this.mask, mw, mh);
      const mc = ctxOf(this.mask);
      const img = mc.createImageData(mw, mh);
      /* A soft edge, steepened: 0.35 → clear, 0.65 → solid, so hair does not halo and the outline does not flicker. */
      for (let i = 0; i < f.length; i++) {
        const a = Math.min(1, Math.max(0, (f[i] - 0.35) / 0.3));
        img.data[i * 4 + 3] = a * 255;
      }
      mc.putImageData(img, 0, 0);
      this.hasMask = true;
    } finally { res.close(); }
    const took = performance.now() - t0;
    this.cost = this.looks ? this.cost * 0.7 + took * 0.3 : took;
    if (++this.looks >= 3 && this.delegate === 'GPU' && this.cost > 30 && !this.triedCpu) this.tryCpu();
  }

  /** Slow on the graphics chip: the processor instead, kept only if it is faster. */
  private tryCpu() {
    this.triedCpu = true;
    const gpuCost = this.cost;
    void import('./segmenter').then(m => m.createSegmenter('CPU')).then(({ seg }) => {
      const probe = this.feed;
      if (!probe) { seg.close(); return; }
      const t0 = performance.now();
      try { seg.segmentForVideo(probe as HTMLCanvasElement, performance.now()).close(); } catch { seg.close(); return; }
      if (performance.now() - t0 >= gpuCost) { seg.close(); return; }
      const old = this.seg;
      this.seg = seg; this.delegate = 'CPU'; this.cost = 0; this.looks = 0;
      try { old?.close(); } catch { /* gone */ }
    }, () => { /* stays on the graphics chip */ });
  }

  /**
   * The camera drawn into box `r` of `ctx` with its look. `clip` is already
   * set by the caller (a bubble's circle). `seeThrough` leaves a removed
   * background empty (a cut-out over the screen) instead of `fx.bgColor`.
   */
  draw(ctx: CanvasRenderingContext2D, cam: HTMLVideoElement, r: Box, mirror: boolean, fx: CamFx, bgImage: ImageBitmap | null, seeThrough: boolean, now: number) {
    const vw = cam.videoWidth, vh = cam.videoHeight;
    if (!vw || !vh) return;
    const src = coverSrc(vw, vh, r);
    const grade = canGrade() ? gradeOf(fx) : 'none';
    const w = Math.max(2, Math.round(r.w)), h = Math.max(2, Math.round(r.h));
    if (fx.bg !== 'none') { if (this.state === 'off') this.want(); this.segment(cam, now); }
    const cut = fx.bg !== 'none' && this.hasMask && this.state === 'ready';

    /* Plain camera: one copy, as fast as before effects existed. */
    if (grade === 'none' && fx.soften <= 0 && !cut) { this.blit(ctx, cam, src, r, mirror); return; }

    this.work = sized(this.work, w, h);
    const wc = ctxOf(this.work);
    wc.clearRect(0, 0, w, h);
    if (cut) {
      /* Behind the person. */
      if (fx.bg === 'blur') this.softCopy(wc, cam, src, w, h, 2 + fx.blur / 6, 1, grade);
      else if (fx.bg === 'image' && bgImage) { const s = coverSrc(bgImage.width, bgImage.height, { x: 0, y: 0, w, h }); wc.drawImage(bgImage, s.x, s.y, s.w, s.h, 0, 0, w, h); }
      else if (fx.bg === 'remove' && !seeThrough) { wc.fillStyle = fx.bgColor; wc.fillRect(0, 0, w, h); }
      else if (fx.bg === 'image') { wc.fillStyle = fx.bgColor; wc.fillRect(0, 0, w, h); }
      /* The person: the camera, softened, cut out by the outline (the same crop of it). */
      this.person = sized(this.person, w, h);
      const pc = ctxOf(this.person);
      pc.globalCompositeOperation = 'source-over';
      pc.clearRect(0, 0, w, h);
      this.graded(pc, cam, src, w, h, grade, fx.soften);
      const m = this.mask!, ms = { x: src.x * m.width / vw, y: src.y * m.height / vh, w: src.w * m.width / vw, h: src.h * m.height / vh };
      pc.globalCompositeOperation = 'destination-in';
      pc.drawImage(m, ms.x, ms.y, ms.w, ms.h, 0, 0, w, h);
      pc.globalCompositeOperation = 'source-over';
      wc.drawImage(this.person, 0, 0);
    } else this.graded(wc, cam, src, w, h, grade, fx.soften);
    this.blit(ctx, this.work, { x: 0, y: 0, w, h }, r, mirror);
  }

  private graded(c: C2, cam: HTMLVideoElement, src: Box, w: number, h: number, grade: string, soften: number) {
    c.filter = grade;
    c.drawImage(cam, src.x, src.y, src.w, src.h, 0, 0, w, h);
    c.filter = 'none';
    if (soften > 0) this.softCopy(c, cam, src, w, h, 3, Math.min(0.75, soften / 100 * 0.75), grade);
  }

  /** A blur that costs almost nothing: the picture shrunk by `factor` and stretched back, drawn at `alpha`. */
  private softCopy(c: C2, cam: HTMLVideoElement, src: Box, w: number, h: number, factor: number, alpha: number, grade: string) {
    const sw = Math.max(2, Math.round(w / factor)), sh = Math.max(2, Math.round(h / factor));
    this.small = sized(this.small, sw, sh);
    const sc = ctxOf(this.small);
    sc.filter = grade;
    sc.drawImage(cam, src.x, src.y, src.w, src.h, 0, 0, sw, sh);
    sc.filter = 'none';
    c.save();
    c.globalAlpha = alpha;
    /* Plain bilinear: the stretch is the blur, and a 'high' resample cost a software canvas double. */
    c.imageSmoothingQuality = 'low';
    c.drawImage(this.small, 0, 0, sw, sh, 0, 0, w, h);
    c.restore();
  }

  private blit(ctx: CanvasRenderingContext2D, from: CanvasImageSource, s: Box, r: Box, mirror: boolean) {
    if (!mirror) { ctx.drawImage(from, s.x, s.y, s.w, s.h, r.x, r.y, r.w, r.h); return; }
    ctx.save();
    ctx.translate(r.x + r.w, r.y); ctx.scale(-1, 1);
    ctx.drawImage(from, s.x, s.y, s.w, s.h, 0, 0, r.w, r.h);
    ctx.restore();
  }
}
