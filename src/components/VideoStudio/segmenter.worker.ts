/*
 * The person-finder, off the page's thread (segmenter.ts says why).
 *
 * In: { type: 'init', model } once, then { type: 'look', id, bmp, ts, model } — a
 * small ImageBitmap of the camera, transferred (no copy). Out: { type:
 * 'ready' | 'failed' }, then { type: 'mask', id, mask, took, delegate } — the
 * outline as an ImageBitmap whose alpha is the person, transferred back. The
 * page sends the next look only when the last mask is back, so nothing ever
 * queues here and a slow look lowers the rate instead of adding delay.
 *
 * Built as a classic worker (Vite's default for production): MediaPipe loads
 * its WebAssembly glue with importScripts, which module workers refuse.
 */
import { ImageSegmenter } from '@mediapipe/tasks-vision';
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import squarePath from '../../assets/models/selfie_segmenter.tflite?url';
import landscapePath from '../../assets/models/selfie_segmenter_landscape.tflite?url';
import { outline, outlineState, alphaInto, type OutlineState, type SegModel } from './maskOutline';

type Delegate = 'GPU' | 'CPU';
const files = { wasmLoaderPath, wasmBinaryPath };
const segs = new Map<string, ImageSegmenter>();
let delegate: Delegate = 'GPU';
let cost = 0, looks = 0, triedCpu = false;
let st: OutlineState | null = null;
let lastModel: SegModel | null = null;
let out: OffscreenCanvas | null = null;
let img: ImageData | null = null;

const post = (m: unknown, t: Transferable[] = []) => (self as unknown as Worker).postMessage(m, t);

async function make(model: SegModel, d: Delegate) {
  return ImageSegmenter.createFromOptions(files, {
    baseOptions: { modelAssetPath: model === 'landscape' ? landscapePath : squarePath, delegate: d },
    runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true,
  });
}

/** One segmenter per model, made on first use, on the chip that is working (GPU first, the processor if WebGL is not there). */
async function segFor(model: SegModel): Promise<ImageSegmenter> {
  const k = `${model}|${delegate}`;
  let s = segs.get(k);
  if (s) return s;
  try { s = await make(model, delegate); } catch (e) { if (delegate === 'CPU') throw e; delegate = 'CPU'; s = await make(model, 'CPU'); }
  segs.set(`${model}|${delegate}`, s);
  return s;
}

/* Slow on the graphics chip (emulated graphics: 267 ms against 17 ms): the processor instead, kept only if it is faster. */
async function tryCpu(model: SegModel, probe: ImageBitmap | OffscreenCanvas) {
  triedCpu = true;
  try {
    const cpu = await make(model, 'CPU');
    const t0 = performance.now();
    cpu.segmentForVideo(probe, nextTs()).close();
    if (performance.now() - t0 >= cost) { cpu.close(); return; }
    for (const s of segs.values()) try { s.close(); } catch { /* gone */ }
    segs.clear();
    delegate = 'CPU'; cost = 0; looks = 0;
    segs.set(`${model}|CPU`, cpu);
  } catch { /* stays on the graphics chip */ }
}

/* Timestamps must rise for every VIDEO-mode graph — across a switch of model or delegate too — so one clock, this worker's, for every call (the page's clock runs ahead of or behind it). */
let lastTs = 0;
const nextTs = () => (lastTs = Math.max(lastTs + 1, performance.now()));
self.onmessage = async (e: MessageEvent) => {
  const m = e.data as { type: string; id?: number; bmp?: ImageBitmap; ts?: number; model?: SegModel; grow?: number };
  if (m.type === 'init') {
    try { await segFor(m.model ?? 'landscape'); post({ type: 'ready', delegate }); }
    catch (err) { post({ type: 'failed', error: (err as Error)?.message || 'it could not start' }); }
    return;
  }
  if (m.type !== 'look' || !m.bmp) return;
  const bmp = m.bmp, model = m.model ?? 'square';
  const t0 = performance.now();
  try {
    const seg = await segFor(model);
    const res = seg.segmentForVideo(bmp, nextTs());
    let mask: ImageBitmap | null = null;
    try {
      const cm = res.confidenceMasks?.[0];
      if (cm) {
        const f = cm.getAsFloat32Array(), w = cm.width, h = cm.height;
        if (model !== lastModel) { st = null; lastModel = model; }
        st = outlineState(st, w * h, f);
        const a = outline(st, f, w, h, Math.min(4, Math.max(1, m.grow ?? 1)));
        if (!out || out.width !== w || out.height !== h) { out = new OffscreenCanvas(w, h); img = new ImageData(w, h); }
        alphaInto(a, img!.data);
        (out.getContext('2d') as OffscreenCanvasRenderingContext2D).putImageData(img!, 0, 0);
        mask = out.transferToImageBitmap();
      }
    } finally { res.close(); }
    const took = performance.now() - t0;
    cost = looks ? cost * 0.7 + took * 0.3 : took;
    looks++;
    post({ type: 'mask', id: m.id, mask, took, delegate }, mask ? [mask] : []);
    /* Three slow looks — or one plainly emulated (well over 100 ms) — and the processor is tried. */
    if (delegate === 'GPU' && !triedCpu && ((looks >= 3 && cost > 30) || took > 150)) await tryCpu(model, bmp);
  } catch (err) {
    post({ type: 'failed', error: (err as Error)?.message || 'a look failed' });
  } finally { bmp.close(); }
};
