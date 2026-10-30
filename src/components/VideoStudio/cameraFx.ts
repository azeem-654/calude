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
 * pixel of the finder's 256, and the looks run up to 30 a second where they
 * are cheap.
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
import type { ImageSegmenter, Delegate } from './segmenter';
import { sceneLayer, isScene, type SceneId } from './scenes';
import { pic, type Feed } from './trackFeed';

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
  /** The last look's confidence, blended into the next (no flicker), and the work arrays for the outline. */
  private conf: Float32Array | null = null;
  private alpha: Float32Array | null = null;
  private grow: Float32Array | null = null;
  private reach: Uint8Array | null = null;
  private queue: Int32Array | null = null;
  /** The auto look, eased toward what the camera needs; and the small copy it is measured on. */
  auto: AutoLook = { ...NO_AUTO, gain: [1, 1, 1] };
  private probe: Cv | null = null;
  private probeCtx: C2 | null = null;
  private lastProbe = 0;
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

  /** Looks for the person, up to 30 times a second where a look is cheap (never more than a quarter of the time), on a copy at most 256 wide. */
  private segment(cam: Feed, now: number) {
    if (!this.seg || now - this.lastSeg < Math.max(33, this.cost * 4)) return;
    this.lastSeg = now;
    const t0 = performance.now();
    const vw = cam.videoWidth, vh = cam.videoHeight;
    const w = Math.min(256, vw), h = Math.max(2, Math.round(w * vh / vw));
    this.feed = sized(this.feed, w, h);
    ctxOf(this.feed).drawImage(pic(cam), 0, 0, w, h);
    let res;
    try { res = this.seg.segmentForVideo(this.feed as HTMLCanvasElement, now); } catch (e) { this.state = 'failed'; this.error = (e as Error)?.message ?? ''; this.onState?.(); return; }
    try {
      const m = res.confidenceMasks?.[0];
      if (!m) return;
      const f = m.getAsFloat32Array(), mw = m.width, mh = m.height;
      const a = this.outline(f, mw, mh);
      this.mask = sized(this.mask, mw, mh);
      const mc = ctxOf(this.mask);
      const img = mc.createImageData(mw, mh);
      for (let i = 0; i < a.length; i++) img.data[i * 4 + 3] = a[i] * 255;
      mc.putImageData(img, 0, 0);
      this.hasMask = true;
    } finally { res.close(); }
    const took = performance.now() - t0;
    this.cost = this.looks ? this.cost * 0.7 + took * 0.3 : took;
    if (++this.looks >= 3 && this.delegate === 'GPU' && this.cost > 30 && !this.triedCpu) this.tryCpu();
  }

  /** The finder's confidence → the person's outline (the header says why each step). About a millisecond at 256². */
  private outline(f: Float32Array, w: number, h: number): Float32Array {
    const n = w * h;
    if (!this.conf || this.conf.length !== n) {
      this.conf = new Float32Array(f); this.alpha = new Float32Array(n); this.grow = new Float32Array(n); this.reach = new Uint8Array(n); this.queue = new Int32Array(n);
    }
    const c = this.conf, a = this.alpha!, seen = this.reach!, q = this.queue!;
    /* Up at once, down over two looks: a moving head is never behind its outline for long, and an edge does not flicker. */
    for (let i = 0; i < n; i++) c[i] = f[i] >= c[i] ? f[i] : c[i] * 0.45 + f[i] * 0.55;
    /* Background reachable from the picture's edge; whatever low part is not reached is a hole inside the person. */
    seen.fill(0);
    let head = 0, tail = 0;
    const low = (i: number) => c[i] < 0.5;
    const push = (i: number) => { if (!seen[i] && low(i)) { seen[i] = 1; q[tail++] = i; } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (head < tail) {
      const i = q[head++], x = i % w;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (i >= w) push(i - w);
      if (i < n - w) push(i + w);
    }
    for (let i = 0; i < n; i++) a[i] = Math.min(1, Math.max(0, (c[i] - 0.25) / 0.35));
    /* Holes: each unreached low patch, filled if it is small (a gap between an arm and the body is left alone). */
    const maxHole = n / 40;
    for (let s0 = 0; s0 < n; s0++) {
      if (seen[s0] || !low(s0)) continue;
      head = tail = 0; seen[s0] = 2; q[tail++] = s0;
      while (head < tail) {
        const i = q[head++], x = i % w;
        const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < n - w ? i + w : -1];
        for (const j of nb) if (j >= 0 && !seen[j] && low(j)) { seen[j] = 2; q[tail++] = j; }
      }
      if (tail <= maxHole) for (let k = 0; k < tail; k++) a[q[k]] = 1;
    }
    /* Grown by one pixel: the most of each pixel and its four neighbours, read from a copy. The blend above keeps the finder's own answer, never the grown one (or it would grow every look). */
    const t = this.grow!;
    t.set(a);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = t[i];
      if (x > 0 && t[i - 1] > v) v = t[i - 1];
      if (x < w - 1 && t[i + 1] > v) v = t[i + 1];
      if (y > 0 && t[i - w] > v) v = t[i - w];
      if (y < h - 1 && t[i + w] > v) v = t[i + w];
      a[i] = v;
    }
    return a;
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
  draw(ctx: CanvasRenderingContext2D, cam: Feed, r: Box, mirror: boolean, fx: CamFx, bgImage: ImageBitmap | null, seeThrough: boolean, now: number) {
    const vw = cam.videoWidth, vh = cam.videoHeight;
    if (!vw || !vh) return;
    const src = coverSrc(vw, vh, r);
    if (fx.auto) this.measure(cam, now);
    const auto = fx.auto ? this.auto : null;
    const grade = canGrade() ? gradeOf(fx, auto) : 'none';
    const tint = canGrade() ? tintOf(fx, auto) : null;
    const w = Math.max(2, Math.round(r.w)), h = Math.max(2, Math.round(r.h));
    if (fx.bg !== 'none') { if (this.state === 'off') this.want(); this.segment(cam, now); }
    const cut = fx.bg !== 'none' && this.hasMask && this.state === 'ready';
    const look = { grade, tint: tint ? tintCss(tint) : '' };

    /* Plain camera: one copy, as fast as before effects existed. */
    if (grade === 'none' && !tint && fx.soften <= 0 && !cut) { this.blit(ctx, pic(cam), src, r, mirror); return; }

    this.work = sized(this.work, w, h);
    const wc = ctxOf(this.work);
    wc.clearRect(0, 0, w, h);
    if (cut) {
      /* Behind the person. */
      if (fx.bg === 'blur') this.softCopy(wc, cam, src, w, h, 2 + fx.blur / 6, 1, look);
      else if (fx.bg === 'image' && bgImage) { const s = coverSrc(bgImage.width, bgImage.height, { x: 0, y: 0, w, h }); wc.drawImage(bgImage, s.x, s.y, s.w, s.h, 0, 0, w, h); }
      else if (fx.bg === 'scene') wc.drawImage(sceneLayer(fx.scene, w, h), 0, 0);
      else if (fx.bg === 'remove' && !seeThrough) { wc.fillStyle = fx.bgColor; wc.fillRect(0, 0, w, h); }
      else if (fx.bg === 'image') { wc.fillStyle = fx.bgColor; wc.fillRect(0, 0, w, h); }
      /* The person: the camera, softened, cut out by the outline (the same crop of it). */
      this.person = sized(this.person, w, h);
      const pc = ctxOf(this.person);
      pc.globalCompositeOperation = 'source-over';
      pc.clearRect(0, 0, w, h);
      this.graded(pc, cam, src, w, h, look, fx.soften);
      const m = this.mask!, ms = { x: src.x * m.width / vw, y: src.y * m.height / vh, w: src.w * m.width / vw, h: src.h * m.height / vh };
      pc.globalCompositeOperation = 'destination-in';
      /* The outline is 256 across, stretched to the box: smoothed, so its edge is a soft few pixels, not steps. */
      pc.imageSmoothingEnabled = true; pc.imageSmoothingQuality = 'medium';
      pc.drawImage(m, ms.x, ms.y, ms.w, ms.h, 0, 0, w, h);
      pc.globalCompositeOperation = 'source-over';
      wc.drawImage(this.person, 0, 0);
    } else this.graded(wc, cam, src, w, h, look, fx.soften);
    this.blit(ctx, this.work, { x: 0, y: 0, w, h }, r, mirror);
  }

  private graded(c: C2, cam: Feed, src: Box, w: number, h: number, look: { grade: string; tint: string }, soften: number) {
    c.filter = look.grade;
    c.drawImage(pic(cam), src.x, src.y, src.w, src.h, 0, 0, w, h);
    c.filter = 'none';
    this.tinted(c, w, h, look.tint);
    if (soften > 0) this.softCopy(c, cam, src, w, h, 3, Math.min(0.75, soften / 100 * 0.75), look);
  }

  /** The colour balance: one multiply over what was just drawn (the box is opaque there, so nothing outside it is coloured). */
  private tinted(c: C2, w: number, h: number, tint: string) {
    if (!tint) return;
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = tint; c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'source-over';
  }

  /** A blur that costs almost nothing: the picture shrunk by `factor` and stretched back, drawn at `alpha`. */
  private softCopy(c: C2, cam: Feed, src: Box, w: number, h: number, factor: number, alpha: number, look: { grade: string; tint: string }) {
    const sw = Math.max(2, Math.round(w / factor)), sh = Math.max(2, Math.round(h / factor));
    this.small = sized(this.small, sw, sh);
    const sc = ctxOf(this.small);
    sc.filter = look.grade;
    sc.drawImage(pic(cam), src.x, src.y, src.w, src.h, 0, 0, sw, sh);
    sc.filter = 'none';
    this.tinted(sc, sw, sh, look.tint);
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
