/**
 * The person-finder's raw confidence → the outline the camera is cut by.
 * Pure (no canvas, no DOM), so the same code runs in the segmentation worker
 * (`segmenter.worker.ts`), on the page when a worker cannot start, and in
 * `npm run test:recorder`.
 *
 * Why each step (cameraFx.ts has the history — blur used to eat into the
 * face): (1) each look is blended with the last so a pixel that *was* the
 * person fades out over two looks rather than flickering, while a pixel that
 * becomes the person is taken at once (a moving head is never behind its
 * outline); (2) cut at a low confidence (solid from 0.6, clear below 0.25 —
 * a little background kept sharp at the edge reads far better than a
 * blurred eye); (3) holes inside the person filled (background not reachable
 * from the picture's edge, smaller than a fortieth of it — glasses, a cheek
 * in shadow); (4) grown by a pixel of the finder's resolution.
 */
export interface OutlineState {
  conf: Float32Array; alpha: Float32Array; grow: Float32Array; reach: Uint8Array; queue: Int32Array;
}

/** Work arrays for a w×h outline; reused while the size holds (a new size starts the blend afresh). */
export function outlineState(prev: OutlineState | null, n: number, first: Float32Array): OutlineState {
  if (prev && prev.conf.length === n) return prev;
  return { conf: new Float32Array(first), alpha: new Float32Array(n), grow: new Float32Array(n), reach: new Uint8Array(n), queue: new Int32Array(n) };
}

/**
 * About a millisecond at 256×144. Returns the outline (0–1 per pixel) in
 * `st.alpha`. `grow` is how many pixels it is grown: 1 when the outline is
 * drawn on its own frame; 3 when it is drawn on newer frames (cameraFx.ts
 * `pending` — the person may have moved since, and a little room kept sharp
 * beside them reads far better than a blurred cheek).
 */
export function outline(st: OutlineState, f: Float32Array, w: number, h: number, grow = 1): Float32Array {
  const n = w * h;
  const c = st.conf, a = st.alpha, seen = st.reach, q = st.queue;
  for (let i = 0; i < n; i++) c[i] = f[i] >= c[i] ? f[i] : c[i] * 0.45 + f[i] * 0.55;
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
  const maxHole = n / 40;
  for (let s0 = 0; s0 < n; s0++) {
    if (seen[s0] || !low(s0)) continue;
    head = tail = 0; seen[s0] = 2; q[tail++] = s0;
    while (head < tail) {
      const i = q[head++], x = i % w;
      if (x > 0 && !seen[i - 1] && low(i - 1)) { seen[i - 1] = 2; q[tail++] = i - 1; }
      if (x < w - 1 && !seen[i + 1] && low(i + 1)) { seen[i + 1] = 2; q[tail++] = i + 1; }
      if (i >= w && !seen[i - w] && low(i - w)) { seen[i - w] = 2; q[tail++] = i - w; }
      if (i < n - w && !seen[i + w] && low(i + w)) { seen[i + w] = 2; q[tail++] = i + w; }
    }
    if (tail <= maxHole) for (let k = 0; k < tail; k++) a[q[k]] = 1;
  }
  /* Grown a pixel at a time, each read from a copy; the blend above keeps the finder's own answer, never the grown one (or it would grow every look). */
  const t = st.grow;
  for (let g = 0; g < grow; g++) {
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
  }
  return a;
}

/** The outline as the alpha of an RGBA buffer (what a canvas mask is drawn from). */
export function alphaInto(a: Float32Array, rgba: Uint8ClampedArray) {
  for (let i = 0; i < a.length; i++) rgba[i * 4 + 3] = a[i] * 255;
}

/**
 * Which model fits the camera: the landscape selfie segmenter is trained on
 * 256×144 — a 16:9 webcam fed to the square 256×256 model is squashed to fit,
 * and a squashed head is what it gets wrong at the edges; it also has 44 %
 * fewer pixels to look at. A portrait or square camera keeps the square model.
 */
export type SegModel = 'square' | 'landscape';
export const modelFor = (vw: number, vh: number): SegModel => vw >= vh * 1.3 ? 'landscape' : 'square';
/** The size of the copy the finder looks at: its own input size for the landscape model; 256 across otherwise. */
export function lookSize(vw: number, vh: number): { w: number; h: number; model: SegModel } {
  const model = modelFor(vw, vh);
  if (model === 'landscape') return { w: 256, h: 144, model };
  const w = Math.min(256, vw);
  return { w, h: Math.max(2, Math.round(w * vh / vw)), model };
}
