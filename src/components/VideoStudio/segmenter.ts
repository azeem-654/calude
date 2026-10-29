/**
 * The person-finder behind the camera background (blur, remove, a picture):
 * MediaPipe's selfie segmenter, run in this browser on WebAssembly. Its own
 * module so the 11 MB engine and the model are fetched only when somebody
 * picks a camera background — never with the recorder, never with the app.
 *
 * Every file is ours, served from the app's own address (the page's script
 * policy allows only 'self'; 'wasm-unsafe-eval' in public/_headers is what
 * lets the engine compile). The model is `selfie_segmenter.tflite`
 * (Apache-2.0, MediaPipe), 250 KB, committed under src/assets/models.
 */
import { ImageSegmenter } from '@mediapipe/tasks-vision';
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import modelAssetPath from '../../assets/models/selfie_segmenter.tflite?url';

export type { ImageSegmenter };

export type Delegate = 'GPU' | 'CPU';

/* The graphics chip first (a few milliseconds a look); the processor when WebGL 2 is not there. */
export async function createSegmenter(prefer: Delegate = 'GPU'): Promise<{ seg: ImageSegmenter; delegate: Delegate }> {
  const files = { wasmLoaderPath, wasmBinaryPath };
  const make = (delegate: Delegate) => ImageSegmenter.createFromOptions(files, {
    baseOptions: { modelAssetPath, delegate },
    runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true,
  }).then(seg => ({ seg, delegate }));
  if (prefer === 'CPU') return make('CPU');
  try { return await make('GPU'); } catch { return await make('CPU'); }
}
