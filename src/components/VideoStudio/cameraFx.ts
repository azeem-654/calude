/**
 * The camera's look, drawn by the recorder's compositor: brightness,
 * contrast, colour, warmth, a night view, soft focus for skin, and the
 * background behind the person — blurred (by how much), removed, or a
 * picture. All of it is live, before and during a recording.
 *
 * Kept light: the grade is the canvas's own `filter` (one pass, on the
 * graphics chip); soft focus is a shrunken copy stretched back up — never a
 * filter blur at full size. The person-finder runs in a worker
 * (segmenter.ts says why it left this thread), one look at a time, once per
 * new camera frame (Performance: at most 15 a second), on a 256×144 copy
 * with the landscape model for a wide camera. Where no worker can start it
 * runs here, never more than a quarter of the time. Only the camera's own
 * box is ever worked on.
 *
 * ── Since 2026-11 (the face still blurred when moving; a halo round the hair) ──
 *
 * The outline is drawn on the frame it was found on (`pending` / `pair`),
 * not on a newer one the head had moved in; and the blur behind the person
 * is made from the room alone (`bgBlur`), so the person's colours are no
 * longer smeared round them.
 *
 * ── The outline (blur that kept blurring part of the face) ──
 *
 * The finder's raw answer is a confidence per pixel, and the old cut-off
 * (solid only above 0.65) plus looks at 15 a second left holes: a cheek in
 * shadow, glasses, the forehead under a bright window came out "not a
 * person" and were blurred, and a head that moved was a sixtieth of a second
 * ahead of its outline. Now each look is (1) blended with the last one so a
 * pixel that *was* the person fades out over two looks rather than
 * flickering, (2) cut at a lower confidence (solid from 0.6, clear below
 * 0.25 — a little background kept sharp at the edge reads far better than a
 * blurred eye), (3) holes inside the person filled (background not reachable
 * from the picture's edge, smaller than a fortieth of it), (4) grown by a
 * pixel of the finder's 256 (maskOutline.ts, shared with the worker), and
 * the looks run up to 30 a second.
 *
 * ── Auto look ──
 *
 * Twice a second a 48-pixel copy of the camera is measured — the middle
 * (where a face is) counted three times over — and the light, contrast,
 * colour and colour balance are eased toward a well-lit picture: exposure
 * lifted toward a mid grey, a grey-world white balance (a light's yellow or
 * blue cast taken out, two thirds of the way), contrast and colour only
 * where the picture is flat. Eased, so a hand passing does not pump it.
 * The person's own sliders apply on top.
 */
import type { ImageSegmenter, Delegate, SegWorkerClient } from './segmenter';
import { sceneLayer, isScene, type SceneId } from './scenes';
import { pic, TrackFeed, type Feed } from './trackFeed';
import { outline, outlineState, alphaInto, lookSize, modelFor, type OutlineState, type SegModel } from './maskOutline';

export type CamBg = 'none' | 'blur' | 'remove' | 'image' | 'scene';
export interface CamFx {
  /** −50…50 each; 0 is the camera as it is. Hue turns every colour (±30°). */
  bright: number; contrast: number; sat: number; warmth: number; hue: number;
  /** The camera's light and colour corrected for it, continuously (applied under the sliders). */
  auto: boolean;
  /** 0–100: soft focus laid over the picture, for skin. */
  soften: number;
  /** Lifts a dark room. */
  night: boolean;
  bg: CamBg;
  /** 0–100, for 'blur'. */
  blur: number;
  /** Behind the person for 'remove' in camera-only recordings (in a bubble a removed background is see-through). */
  bgColor: string;
  /** The ready-made picture behind the person, for 'scene'. */
  scene: SceneId;
}
export const NO_FX: CamFx = { bright: 0, contrast: 0, sat: 0, warmth: 0, hue: 0, auto: false, soften: 0, night: false, bg: 'none', blur: 60, bgColor: '#e5e7eb', scene: 'office' };
export const sceneOr = (v: unknown): SceneId => isScene(v) ? v : NO_FX.scene;

/** What the auto look is doing now: factors for exposure, contrast, colour, and a per-channel balance. */
export interface AutoLook { bright: number; contrast: number; sat: number; gain: [number, number, number] }
export const NO_AUTO: AutoLook = { bright: 1, contrast: 1, sat: 1, gain: [1, 1, 1] };

/** Safari before 18 has no canvas filter: the grade is then not offered rather than silently ignored. */
export const canGrade = () => typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

/**
 * The colour balance as a colour to multiply by (warmth and the auto
 * balance), each channel at most 1 — or null when it is plain. Warmth used
 * to be a touch of sepia, which greyed the picture; a multiply takes blue out
 * (warm) or red (cool) and leaves the rest as it was.
 */
export function tintOf(fx: CamFx, auto: AutoLook | null): [number, number, number] | null {
  const w = fx.warmth / 50;
  let r = w < 0 ? 1 + w * 0.28 : 1, g = 1 - Math.abs(w) * 0.06, b = w > 0 ? 1 - w * 0.3 : 1;
  if (auto) { r *= auto.gain[0]; g *= auto.gain[1]; b *= auto.gain[2]; }
  const m = Math.max(r, g, b);
  r /= m; g /= m; b /= m;
  return r > 0.995 && g > 0.995 && b > 0.995 ? null : [r, g, b];
}
const tintCss = (t: [number, number, number]) => `rgb(${Math.round(t[0] * 255)},${Math.round(t[1] * 255)},${Math.round(t[2] * 255)})`;

export function gradeOf(fx: CamFx, auto: AutoLook | null = null): string {
  const a = auto ?? NO_AUTO, t = tintOf(fx, auto);
  /* A multiply darkens: lifted back by what it took from a grey, at most a third. */
  const lift = t ? Math.min(1.35, 1 / (0.3 * t[0] + 0.59 * t[1] + 0.11 * t[2])) : 1;
  const b = (1 + fx.bright / 100 + (fx.night ? 0.45 : 0)) * a.bright * lift;
  const c = (1 + fx.contrast / 100 + (fx.night ? 0.12 : 0)) * a.contrast;
  const s = (1 + fx.sat / 100 - (fx.night ? 0.1 : 0)) * a.sat;
  const parts: string[] = [];
  if (Math.abs(b - 1) > 0.005) parts.push(`brightness(${b.toFixed(3)})`);
  if (Math.abs(c - 1) > 0.005) parts.push(`contrast(${c.toFixed(3)})`);
  if (Math.abs(s - 1) > 0.005) parts.push(`saturate(${s.toFixed(3)})`);
  if (Math.abs(fx.hue) >= 1) parts.push(`hue-rotate(${(fx.hue * 0.6).toFixed(1)}deg)`);
  return parts.length ? parts.join(' ') : 'none';
}

export const isPlain = (fx: CamFx) => gradeOf(fx) === 'none' && !tintOf(fx, null) && !fx.auto && fx.soften <= 0 && fx.bg === 'none';

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

/**
 * How the background effect trades smoothness against exactness (the
 * recorder's Performance / Balanced / Quality). `pair` draws the camera frame
 * the outline was found on, not a newer one (below); `maxRate` caps looks a
 * second.
 */
export interface FxTuning { pair: boolean; maxRate: number }
export const FX_TUNING = {
  performance: { pair: false, maxRate: 15 },
  balanced: { pair: true, maxRate: 30 },
  quality: { pair: true, maxRate: 30 },
} as const satisfies Record<string, FxTuning>;

/** What the diagnostics panel shows of the person-finder. */
export interface FxStats { runs: 'off' | 'worker' | 'page'; delegate: Delegate; model: SegModel | ''; cost: number; roundTrip: number; looksPerSec: number; paired: boolean; maskAge: number }

/* An outline older than this is not paired with its frame any more: the camera must never freeze behind a stalled finder. */
const PAIR_STALE_MS = 150;

export class CameraFx {
  /** The finder on this page (only where its worker could not start). */
  private seg: ImageSegmenter | null = null;
  private segModel: SegModel = 'square';
  /** The finder in its worker (segmenter.ts says why). */
  private wseg: SegWorkerClient | null = null;
  private loading: Promise<void> | null = null;
  state: SegState = 'off';
  error = '';
  tuning: FxTuning = FX_TUNING.balanced;
  private small: Cv | null = null;
  private small2: Cv | null = null;
  private tiny: Cv | null = null;
  private feed: Cv | null = null;
  /** The outline, its alpha the person: a bitmap from the worker, or a canvas when the finder runs here. */
  private mask: CanvasImageSource & { width: number; height: number } | null = null;
  private maskCanvas: Cv | null = null;
  private work: Cv | null = null;
  private person: Cv | null = null;
  private lastSeg = 0;
  private hasMask = false;
  private delegate: Delegate = 'GPU';
  /** What a look costs (the finder's own time), smoothed; and how many have been timed on this delegate. */
  private cost = 0;
  private looks = 0;
  private triedCpu = false;
  private outlineSt: OutlineState | null = null;
  /*
   * Pairing. The outline comes back a few milliseconds after the frame it was
   * found on; drawn over the newest frame, a head that moved in between
   * sticks out of it and that strip is blurred — the face "sometimes
   * blurred". So the frame sent is also copied here (`pending`), and when its
   * outline arrives the two are drawn together (`pair`): the person always
   * matches their outline, at the cost of the look's few milliseconds of
   * delay. Only while looks come back within about a frame and a quarter —
   * slower than that, the newest frame and the last outline are drawn, so the
   * camera stays live (and the outline is grown a little more).
   */
  private pending: Cv | null = null;
  private pair: Cv | null = null;
  private pairOk = false;
  private pairAt = 0;
  private inflight = false;
  private sentAt = 0;
  private sentFrame: number = -1;
  private roundTrip = 0;
  private maskAt = 0;
  private paired = false;
  private lookTimes: number[] = [];
  private camGap = 1000 / 30;
  private lastFrameId = -1;
  /** How old the camera picture last drawn was (ms since it arrived from the camera; NaN where that is not known) — the diagnostics and the sound's delay read it. */
  shownAge = NaN;
  private sentAge = 0;
  private pairAge = 0;
  /** How much of the camera's own size its box needs (cover-scaled, at most 1) — the paired copy is made at that size. */
  private boxScale = 1;
  private lastFrameAt = 0;
  /** The auto look, eased toward what the camera needs; and the small copy it is measured on. */
  auto: AutoLook = { ...NO_AUTO, gain: [1, 1, 1] };
  private probe: Cv | null = null;
  private probeCtx: C2 | null = null;
  private lastProbe = 0;
  /** Told when the person-finder is ready or failed, so the page can say so. */
  onState: (() => void) | null = null;

  /** Starts the person-finder (once): in its worker, else on this page; drawing goes on without it meanwhile. */
  want(model: SegModel = 'landscape') {
    if (this.loading) return;
    this.state = 'loading'; this.onState?.();
    this.loading = import('./segmenter').then(async m => {
      try {
        this.useWorker(await m.startSegWorker(model));
      } catch {
        const r = await m.createSegmenter('GPU', model);
        this.seg = r.seg; this.delegate = r.delegate; this.segModel = model;
      }
      this.state = 'ready'; this.onState?.();
    }).catch(e => {
      this.state = 'failed';
      this.error = (e as Error)?.message || 'it could not start';
      this.onState?.();
    });
  }

  private useWorker(c: SegWorkerClient) {
    this.wseg = c; this.delegate = c.delegate;
    c.onMask = (mask, took, delegate) => {
      const now = performance.now();
      this.inflight = false;
      /* Moved to the other chip: what looks cost there starts afresh (an emulated graphics chip's second-long looks must not hold the new rate down). */
      if (delegate !== this.delegate) { this.looks = 0; this.cost = 0; this.roundTrip = 0; this.lookTimes = []; }
      this.delegate = delegate;
      if (!mask) return;
      const rt = now - this.sentAt;
      this.roundTrip = this.looks ? this.roundTrip * 0.7 + rt * 0.3 : rt;
      this.cost = this.looks ? this.cost * 0.7 + took * 0.3 : took;
      this.looks++;
      this.lookTimes.push(now); if (this.lookTimes.length > 40) this.lookTimes.shift();
      (this.mask as ImageBitmap | null)?.close?.();
      this.mask = mask; this.hasMask = true; this.maskAt = this.sentAt;
      if (this.pending) { const p = this.pair; this.pair = this.pending; this.pending = p; this.pairOk = true; this.pairAt = this.sentAt; this.pairAge = this.sentAge; }
      else this.pairOk = false;
      /*
       * Paired only while a look comes back within about a frame and a
       * quarter and the finder looks at least every other camera frame (the
       * header of `pending` says why) — otherwise the camera would move only
       * as often as the finder answers; then the newest frame is drawn with a
       * wider outline. Measured: pairing keeps 99.9 % of a moving person
       * sharp; the wider outline alone 98 %; the old way 88 %.
       */
      const lt = this.lookTimes, every = lt.length > 4 ? (lt[lt.length - 1] - lt[0]) / (lt.length - 1) : 0;
      this.paired = this.tuning.pair && this.roundTrip <= Math.max(40, this.camGap * 1.25) && every <= this.camGap * 2.2;
    };
    /* A look failed after the start: the camera goes on as it is (said), the recording is never stopped by it. */
    c.onFail = err => {
      this.inflight = false;
      this.state = 'failed'; this.error = err; this.hasMask = false;
      try { c.close(); } catch { /* gone */ }
      this.wseg = null;
      this.onState?.();
    };
  }

  /** The worker let go (the recorder closed). */
  dispose() {
    try { this.wseg?.close(); } catch { /* gone */ }
    try { this.seg?.close(); } catch { /* gone */ }
    this.wseg = null; this.seg = null; this.loading = null; this.state = 'off'; this.hasMask = false;
    (this.mask as ImageBitmap | null)?.close?.(); this.mask = null;
  }

  stats(): FxStats {
    const now = performance.now(), recent = this.lookTimes.filter(t => now - t < 2000);
    return {
      runs: this.wseg ? 'worker' : this.seg ? 'page' : 'off', delegate: this.delegate,
      model: this.wseg ? this.lastModel : this.seg ? this.segModel : '',
      cost: this.cost, roundTrip: this.wseg ? this.roundTrip : this.cost, looksPerSec: recent.length / 2,
      paired: !!this.wseg && this.paired && this.pairOk, maskAge: this.hasMask ? now - this.maskAt : 0,
    };
  }
  /** The model of the last look (for the stats). */
  lastModel: SegModel = 'landscape';

  /** A number that changes with each new camera frame, and the gap between frames (what "about a frame" means above). */
  private frameId(cam: Feed, now: number): number {
    const id = cam instanceof TrackFeed ? cam.count : Math.round(cam.currentTime * 1000);
    if (id !== this.lastFrameId) {
      if (this.lastFrameAt) this.camGap = this.camGap * 0.9 + Math.min(200, now - this.lastFrameAt) * 0.1;
      this.lastFrameId = id; this.lastFrameAt = now;
    }
    return id;
  }

  /** Whether the last frame drawn wanted the person found (a background effect on). */
  private active = false;
  /**
   * A camera frame just arrived (TrackFeed.onFrame): sent to the finder at
   * once rather than at the next draw, so its outline is usually back before
   * that draw and the paired frame shown is the newest one.
   */
  frameArrived(cam: Feed) {
    if (this.active && this.wseg && this.state === 'ready') this.lookInWorker(this.wseg, cam, performance.now());
  }

  /** Looks for the person: in the worker, once per new camera frame, one look at a time (so a slow look lowers the rate instead of queueing). */
  private segment(cam: Feed, now: number) {
    if (this.wseg) { this.lookInWorker(this.wseg, cam, now); return; }
    this.lookHere(cam, now);
  }

  private lookInWorker(c: SegWorkerClient, cam: Feed, now: number) {
    const id = this.frameId(cam, now);
    if (this.inflight) {
      /* A look lost in the worker (never answered): asked again rather than waiting for ever. */
      if (now - this.sentAt < 1000) return;
      this.inflight = false;
    }
    /* At most half the finder's thread: on a computer with no graphics chip to spare, the encoder and the drawing need the rest. */
    if (id === this.sentFrame || now - this.sentAt < Math.max(1000 / this.tuning.maxRate, Math.min(250, this.cost * 2)) - 2) return;
    const vw = cam.videoWidth, vh = cam.videoHeight;
    const { w, h, model } = lookSize(vw, vh);
    this.lastModel = model;
    this.feed = sized(this.feed, w, h);
    const fc = ctxOf(this.feed);
    fc.drawImage(pic(cam), 0, 0, w, h);
    /*
     * The frame as it was sent, kept to be drawn with its outline — at the
     * size the camera's box needs (a 200-pixel bubble does not need a 1080p
     * copy every frame; a software-drawn canvas paid for every pixel), at most
     * 1280 across.
     */
    if (this.tuning.pair) {
      const s = Math.min(1, 1280 / Math.max(vw, vh), this.boxScale), pw = Math.max(2, Math.round(vw * s)), ph = Math.max(2, Math.round(vh * s));
      this.pending = sized(this.pending, pw, ph);
      ctxOf(this.pending).drawImage(pic(cam), 0, 0, pw, ph);
    } else this.pending = null;
    this.inflight = true; this.sentAt = now; this.sentFrame = id;
    this.sentAge = cam instanceof TrackFeed ? Math.max(0, now - cam.at) : 0;
    const f = this.feed;
    const grow = this.paired ? 1 : 3;
    if (typeof OffscreenCanvas !== 'undefined' && f instanceof OffscreenCanvas) c.look(f.transferToImageBitmap(), model, now, grow);
    else void createImageBitmap(f).then(b => c.look(b, model, now, grow), () => { this.inflight = false; });
  }

  /** The finder on this page (no worker): never more than a quarter of the time — four times what a look costs between looks. */
  private lookHere(cam: Feed, now: number) {
    if (!this.seg || now - this.lastSeg < Math.max(1000 / this.tuning.maxRate, this.cost * 4)) return;
    this.lastSeg = now;
    const t0 = performance.now();
    const vw = cam.videoWidth, vh = cam.videoHeight;
    const { w, h } = lookSize(vw, vh);
    this.feed = sized(this.feed, w, h);
    ctxOf(this.feed).drawImage(pic(cam), 0, 0, w, h);
    let res;
    try { res = this.seg.segmentForVideo(this.feed as HTMLCanvasElement, now); } catch (e) { this.state = 'failed'; this.error = (e as Error)?.message ?? ''; this.onState?.(); return; }
    try {
      const m = res.confidenceMasks?.[0];
      if (!m) return;
      const f = m.getAsFloat32Array(), mw = m.width, mh = m.height;
      this.outlineSt = outlineState(this.outlineSt, mw * mh, f);
      const a = outline(this.outlineSt, f, mw, mh);
      this.maskCanvas = sized(this.maskCanvas, mw, mh);
      const mc = ctxOf(this.maskCanvas);
      const img = mc.createImageData(mw, mh);
      alphaInto(a, img.data);
      mc.putImageData(img, 0, 0);
      this.mask = this.maskCanvas; this.hasMask = true; this.maskAt = now;
    } finally { res.close(); }
    const took = performance.now() - t0;
    this.cost = this.looks ? this.cost * 0.7 + took * 0.3 : took;
    this.lookTimes.push(now); if (this.lookTimes.length > 40) this.lookTimes.shift();
    if (++this.looks >= 3 && this.delegate === 'GPU' && this.cost > 30 && !this.triedCpu) this.tryCpu();
  }

  /** Slow on the graphics chip: the processor instead, kept only if it is faster. */
  private tryCpu() {
    this.triedCpu = true;
    const gpuCost = this.cost;
    void import('./segmenter').then(m => m.createSegmenter('CPU', this.segModel)).then(({ seg }) => {
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
   * The auto look's measurement (the header says what it aims at), at most
   * twice a second on a 48-pixel copy; eased a third of the way each time.
   */
  private measure(cam: Feed, now: number) {
    if (now - this.lastProbe < 500) return;
    this.lastProbe = now;
    const vw = cam.videoWidth, vh = cam.videoHeight;
    const w = 48, h = Math.max(8, Math.round(48 * vh / vw));
    if (!this.probe || this.probe.width !== w || this.probe.height !== h) {
      this.probe = mk(w, h);
      this.probeCtx = this.probe.getContext('2d', { willReadFrequently: true }) as C2 | null;
    }
    const g = this.probeCtx;
    if (!g) return;
    let d: Uint8ClampedArray;
    try { g.drawImage(pic(cam), 0, 0, w, h); d = g.getImageData(0, 0, w, h).data; } catch { return; }
    let W = 0, Y = 0, Y2 = 0, R = 0, G = 0, B = 0, S = 0, gw = 0;
    for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
      const dx = x / w - 0.5, dy = y / h - 0.45;
      const k = 1 + 2 * Math.exp(-(dx * dx + dy * dy) / 0.045);
      const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
      const l = 0.299 * r + 0.587 * gg + 0.114 * b;
      W += k; Y += l * k; Y2 += l * l * k;
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      S += (mx > 0 ? (mx - mn) / mx : 0) * k;
      /* Only the mid-tones judge the balance: black and blown-out white have no colour to read. */
      if (l > 0.08 && l < 0.92) { R += r * k; G += gg * k; B += b * k; gw += k; }
    }
    if (!W) return;
    const mean = Y / W, sd = Math.sqrt(Math.max(0, Y2 / W - mean * mean)), sat = S / W;
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const want: AutoLook = {
      bright: clamp(Math.pow(0.48 / Math.max(0.04, mean), 0.65), 0.8, 1.8),
      contrast: clamp(Math.pow(0.2 / Math.max(0.03, sd), 0.4), 0.9, 1.3),
      sat: sat < 0.28 ? clamp(Math.pow(0.3 / Math.max(0.05, sat), 0.5), 1, 1.3) : 1,
      gain: [1, 1, 1],
    };
    if (gw) {
      const r = R / gw, gg = G / gw, b = B / gw, grey = (r + gg + b) / 3;
      want.gain = [r, gg, b].map(c => clamp(1 + (grey / Math.max(0.02, c) - 1) * 0.66, 0.78, 1.28)) as [number, number, number];
    }
    const e = (a: number, b: number) => a + (b - a) * 0.35;
    const A = this.auto;
    this.auto = { bright: e(A.bright, want.bright), contrast: e(A.contrast, want.contrast), sat: e(A.sat, want.sat), gain: [e(A.gain[0], want.gain[0]), e(A.gain[1], want.gain[1]), e(A.gain[2], want.gain[2])] };
  }

  /** What the auto look is doing, in words: "lighter +24% · warmer · more contrast". */
  autoSummary(): string {
    const a = this.auto, out: string[] = [];
    const pct = (v: number) => `${v > 1 ? '+' : '−'}${Math.round(Math.abs(v - 1) * 100)}%`;
    if (Math.abs(a.bright - 1) >= 0.03) out.push(`${a.bright > 1 ? 'lighter' : 'darker'} ${pct(a.bright)}`);
    const t = tintOf({ ...NO_FX }, a);
    if (t) out.push(t[2] < t[0] - 0.03 ? 'warmer (a blue cast taken out)' : t[0] < t[2] - 0.03 ? 'cooler (a yellow cast taken out)' : t[1] < 0.97 ? 'a green cast taken out' : 'colours balanced');
    if (a.contrast >= 1.03) out.push(`more contrast ${pct(a.contrast)}`);
    if (a.sat >= 1.03) out.push(`richer colour ${pct(a.sat)}`);
    return out.length ? out.join(' · ') : 'the camera already looks right — nothing to change';
  }

  /**
   * The camera drawn into box `r` of `ctx` with its look. `clip` is already
   * set by the caller (a bubble's circle). `seeThrough` leaves a removed
   * background empty (a cut-out over the screen) instead of `fx.bgColor`.
   */
  draw(ctx: CanvasRenderingContext2D, cam: Feed, r: Box, mirror: boolean, fx: CamFx, bgImage: ImageBitmap | null, seeThrough: boolean, now: number) {
    const vw = cam.videoWidth, vh = cam.videoHeight;
    if (!vw || !vh) return;
    this.boxScale = Math.min(1, Math.max(r.w / vw, r.h / vh) * 1.1);
    if (fx.auto) this.measure(cam, now);
    const auto = fx.auto ? this.auto : null;
    const grade = canGrade() ? gradeOf(fx, auto) : 'none';
    const tint = canGrade() ? tintOf(fx, auto) : null;
    const w = Math.max(2, Math.round(r.w)), h = Math.max(2, Math.round(r.h));
    this.active = fx.bg !== 'none';
    if (this.active) { if (this.state === 'off') this.want(modelFor(vw, vh)); this.segment(cam, now); }
    const cut = fx.bg !== 'none' && this.hasMask && this.state === 'ready' && !!this.mask;
    const look = { grade, tint: tint ? tintCss(tint) : '' };
    /* With the background effect on, the frame drawn is the one its outline was found on, while that is fresh (`pending` says why). */
    const usePair = cut && this.paired && this.pairOk && !!this.pair && now - this.pairAt < PAIR_STALE_MS;
    const img: CanvasImageSource = usePair ? this.pair! : pic(cam);
    const iw = usePair ? this.pair!.width : vw, ih = usePair ? this.pair!.height : vh;
    const src = coverSrc(iw, ih, r);
    this.shownAge = usePair ? now - this.pairAt + this.pairAge : cam instanceof TrackFeed ? now - cam.at : NaN;

    /* Plain camera: one copy, as fast as before effects existed. */
    if (grade === 'none' && !tint && fx.soften <= 0 && !cut) { this.blit(ctx, img, src, r, mirror); return; }

    this.work = sized(this.work, w, h);
    const wc = ctxOf(this.work);
    wc.clearRect(0, 0, w, h);
    if (cut) {
      const m = this.mask!, ms = { x: src.x * m.width / iw, y: src.y * m.height / ih, w: src.w * m.width / iw, h: src.h * m.height / ih };
      /* Behind the person. */
      if (fx.bg === 'blur') this.bgBlur(wc, img, src, w, h, fx.blur, look, m, ms);
      else if (fx.bg === 'image' && bgImage) { const s = coverSrc(bgImage.width, bgImage.height, { x: 0, y: 0, w, h }); wc.drawImage(bgImage, s.x, s.y, s.w, s.h, 0, 0, w, h); }
      else if (fx.bg === 'scene') wc.drawImage(sceneLayer(fx.scene, w, h), 0, 0);
      else if (fx.bg === 'remove' && !seeThrough) { wc.fillStyle = fx.bgColor; wc.fillRect(0, 0, w, h); }
      else if (fx.bg === 'image') { wc.fillStyle = fx.bgColor; wc.fillRect(0, 0, w, h); }
      /* The person: the camera, softened, cut out by the outline (the same crop of it). */
      this.person = sized(this.person, w, h);
      const pc = ctxOf(this.person);
      pc.globalCompositeOperation = 'source-over';
      pc.clearRect(0, 0, w, h);
      this.graded(pc, img, src, w, h, look, fx.soften);
      pc.globalCompositeOperation = 'destination-in';
      /* The outline is 256 across, stretched to the box: smoothed, so its edge is a soft few pixels, not steps. */
      pc.imageSmoothingEnabled = true; pc.imageSmoothingQuality = 'medium';
      pc.drawImage(m, ms.x, ms.y, ms.w, ms.h, 0, 0, w, h);
      pc.globalCompositeOperation = 'source-over';
      wc.drawImage(this.person, 0, 0);
    } else this.graded(wc, img, src, w, h, look, fx.soften);
    this.blit(ctx, this.work, { x: 0, y: 0, w, h }, r, mirror);
  }

  private graded(c: C2, img: CanvasImageSource, src: Box, w: number, h: number, look: { grade: string; tint: string }, soften: number) {
    c.filter = look.grade;
    c.drawImage(img, src.x, src.y, src.w, src.h, 0, 0, w, h);
    c.filter = 'none';
    this.tinted(c, w, h, look.tint);
    if (soften > 0) this.softCopy(c, img, src, w, h, 3, Math.min(0.75, soften / 100 * 0.75), look);
  }

  /** The colour balance: one multiply over what was just drawn (the box is opaque there, so nothing outside it is coloured). */
  private tinted(c: C2, w: number, h: number, tint: string) {
    if (!tint) return;
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = tint; c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'source-over';
  }

  /** A blur that costs almost nothing: the picture shrunk by `factor` and stretched back, drawn at `alpha`. */
  private softCopy(c: C2, img: CanvasImageSource, src: Box, w: number, h: number, factor: number, alpha: number, look: { grade: string; tint: string }) {
    const sw = Math.max(2, Math.round(w / factor)), sh = Math.max(2, Math.round(h / factor));
    this.small = sized(this.small, sw, sh);
    const sc = ctxOf(this.small);
    sc.globalCompositeOperation = 'source-over';
    sc.filter = look.grade;
    sc.drawImage(img, src.x, src.y, src.w, src.h, 0, 0, sw, sh);
    sc.filter = 'none';
    this.tinted(sc, sw, sh, look.tint);
    c.save();
    c.globalAlpha = alpha;
    /* Plain bilinear: the stretch is the blur, and a 'high' resample cost a software canvas double. */
    c.imageSmoothingQuality = 'low';
    c.drawImage(this.small, 0, 0, sw, sh, 0, 0, w, h);
    c.restore();
  }

  /**
   * The blurred room behind the person, made from the room only. It used to
   * be the whole picture blurred — the person too — so their colours were
   * smeared round them (a halo round the hair and shoulders) and showed
   * through wherever the outline was soft. Now, on a small copy: the person
   * is taken out by the outline; the hole is filled from round it (a quarter
   * copy made opaque wherever any room reached it, laid underneath — the
   * room's own colours carried in); a light blur at that size where the
   * browser has canvas filters (smoother than the stretch alone); then
   * stretched to the box. All of it at a sixth of the box's size or less.
   */
  private bgBlur(c: C2, img: CanvasImageSource, src: Box, w: number, h: number, amount: number, look: { grade: string; tint: string }, mask: CanvasImageSource, ms: Box) {
    const factor = 2 + amount / 6;
    const sw = Math.max(4, Math.round(w / factor)), sh = Math.max(4, Math.round(h / factor));
    this.small = sized(this.small, sw, sh);
    const sc = ctxOf(this.small);
    sc.globalCompositeOperation = 'source-over';
    sc.clearRect(0, 0, sw, sh);
    sc.filter = look.grade;
    sc.drawImage(img, src.x, src.y, src.w, src.h, 0, 0, sw, sh);
    sc.filter = 'none';
    this.tinted(sc, sw, sh, look.tint);
    sc.globalCompositeOperation = 'destination-out';
    sc.imageSmoothingEnabled = true;
    sc.drawImage(mask, ms.x, ms.y, ms.w, ms.h, 0, 0, sw, sh);
    /* The hole filled from round it: averaging a see-through copy keeps the room's colour (weighted by how much room there was); drawing it over itself three times makes it opaque without changing that colour. */
    const tw = Math.max(2, Math.round(sw / 4)), th = Math.max(2, Math.round(sh / 4));
    this.tiny = sized(this.tiny, tw, th);
    const tc = ctxOf(this.tiny);
    tc.globalCompositeOperation = 'source-over';
    tc.clearRect(0, 0, tw, th);
    tc.drawImage(this.small, 0, 0, tw, th);
    for (let k = 0; k < 3; k++) tc.drawImage(this.tiny, 0, 0);
    sc.globalCompositeOperation = 'destination-over';
    sc.drawImage(this.tiny, 0, 0, sw, sh);
    /* Where no room reached at all (the person fills the picture): the plain copy, so nothing is ever see-through. */
    sc.filter = look.grade;
    sc.drawImage(img, src.x, src.y, src.w, src.h, 0, 0, sw, sh);
    sc.filter = 'none';
    sc.globalCompositeOperation = 'source-over';
    let out: Cv = this.small;
    if (canGrade()) {
      const px = Math.max(1, Math.round(Math.min(sw, sh) / 60)), pad = px * 2;
      this.small2 = sized(this.small2, sw, sh);
      const bc = ctxOf(this.small2);
      bc.filter = `blur(${px}px)`;
      /* Drawn a little larger than the box so the blur reads room, not the empty border, at the edges. */
      bc.drawImage(this.small, -pad, -pad, sw + 2 * pad, sh + 2 * pad);
      bc.filter = 'none';
      out = this.small2;
    }
    c.save();
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'low';
    c.drawImage(out, 0, 0, sw, sh, 0, 0, w, h);
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
