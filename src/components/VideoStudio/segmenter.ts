/**
 * The person-finder behind the camera background (blur, remove, a picture):
 * MediaPipe's selfie segmenter, run in this browser on WebAssembly. Its own
 * module so the 11 MB engine and the models are fetched only when somebody
 * picks a camera background — never with the recorder, never with the app.
 *
 * ── Off the page's thread (2026-11) ──
 *
 * A look used to run on the page's own thread, between frames: the model,
 * then reading its answer back from the graphics chip (which waits for the
 * chip), then the outline. 15–30 ms at a time, every few frames, on the same
 * thread that draws every frame — so the frame clock's ticks queued behind
 * it and came out in a burst: the camera stood still, then jumped ("scenes
 * stacking up"), and the bursts were recorded too. Now it runs in a worker
 * (`segmenter.worker.ts`): the page hands over a 256-pixel copy (an
 * ImageBitmap, transferred, not copied) and gets the outline back as one.
 * The page's share of a look is two small copies. Where a worker cannot start
 * (an old browser, or the module worker of `vite dev`), it runs here as
 * before.
 *
 * Every file is ours, served from the app's own address (the page's script
 * policy allows only 'self'; 'wasm-unsafe-eval' in public/_headers is what
 * lets the engine compile). The models are MediaPipe's selfie segmenters
 * (Apache-2.0) under src/assets/models: the square one (256×256) and the
 * landscape one (144×256, for a 16:9 webcam — maskOutline.ts `modelFor`).
 */
import { ImageSegmenter } from '@mediapipe/tasks-vision';
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import squarePath from '../../assets/models/selfie_segmenter.tflite?url';
import landscapePath from '../../assets/models/selfie_segmenter_landscape.tflite?url';
import SegWorker from './segmenter.worker.ts?worker';
import type { SegModel } from './maskOutline';

export type { ImageSegmenter };

export type Delegate = 'GPU' | 'CPU';

/* The graphics chip first (a few milliseconds a look); the processor when WebGL 2 is not there. */
export async function createSegmenter(prefer: Delegate = 'GPU', model: SegModel = 'square'): Promise<{ seg: ImageSegmenter; delegate: Delegate }> {
  const files = { wasmLoaderPath, wasmBinaryPath };
  const make = (delegate: Delegate) => ImageSegmenter.createFromOptions(files, {
    baseOptions: { modelAssetPath: model === 'landscape' ? landscapePath : squarePath, delegate },
    runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true,
  }).then(seg => ({ seg, delegate }));
  if (prefer === 'CPU') return make('CPU');
  try { return await make('GPU'); } catch { return await make('CPU'); }
}

/** The finder in its worker, as the camera's look sees it. */
export interface SegWorkerClient {
  delegate: Delegate;
  /** Hands a small copy over (transferred — the bitmap is gone from here); the outline comes to `onMask`. */
  look(bmp: ImageBitmap, model: SegModel, ts: number, grow: number): void;
  onMask: ((mask: ImageBitmap | null, took: number, delegate: Delegate) => void) | null;
  onFail: ((error: string) => void) | null;
  close(): void;
}

/**
 * Starts the worker and waits until its finder is ready. Rejects — so the
 * caller runs the finder on the page instead — if the worker cannot be made,
 * its script fails to load, or it is not ready in 25 s.
 */
export function startSegWorker(model: SegModel): Promise<SegWorkerClient> {
  return new Promise((resolve, reject) => {
    let w: Worker;
    try { w = new SegWorker(); } catch (e) { reject(e); return; }
    let ready = false, id = 0;
    const client: SegWorkerClient = {
      delegate: 'GPU',
      look(bmp, m, ts, grow) { w.postMessage({ type: 'look', id: ++id, bmp, model: m, ts, grow }, [bmp]); },
      onMask: null, onFail: null,
      close() { w.terminate(); },
    };
    const timer = setTimeout(() => { if (!ready) { w.terminate(); reject(new Error('the background finder took too long to start')); } }, 25_000);
    w.onerror = ev => {
      ev.preventDefault?.();
      if (!ready) { clearTimeout(timer); w.terminate(); reject(new Error(ev.message || 'the background finder could not start')); }
      else client.onFail?.(ev.message || 'the background finder stopped');
    };
    w.onmessage = (ev: MessageEvent) => {
      const m = ev.data as { type: string; delegate?: Delegate; error?: string; mask?: ImageBitmap | null; took?: number };
      if (m.type === 'ready') { ready = true; clearTimeout(timer); client.delegate = m.delegate ?? 'GPU'; resolve(client); return; }
      if (m.type === 'failed') {
        if (!ready) { clearTimeout(timer); w.terminate(); reject(new Error(m.error || 'the background finder could not start')); }
        else client.onFail?.(m.error || 'a look failed');
        return;
      }
      if (m.type === 'mask') {
        if (m.delegate) client.delegate = m.delegate;
        if (client.onMask) client.onMask(m.mask ?? null, m.took ?? 0, client.delegate);
        else m.mask?.close();
      }
    };
    w.postMessage({ type: 'init', model });
  });
}
