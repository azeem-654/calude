/* Builds the camera-background harness (main.ts) against a source tree: SRC (default: this repo's src/), into OUT. */
import { resolve } from 'node:path';
const here = import.meta.dirname, repo = resolve(here, '../..'), mp = resolve(repo, 'node_modules/@mediapipe/tasks-vision');
export default {
  root: here, base: '/', publicDir: process.env.PUBLIC,
  resolve: { alias: [
    { find: 'SRC', replacement: process.env.SRC || resolve(repo, 'src') },
    { find: /^@mediapipe\/tasks-vision\/(vision_wasm_internal\.(js|wasm))/, replacement: `${mp}/wasm/$1` },
    { find: /^@mediapipe\/tasks-vision$/, replacement: `${mp}/vision_bundle.mjs` },
  ] },
  build: { outDir: process.env.OUT, emptyOutDir: true, rollupOptions: { input: resolve(here, 'index.html') } },
  logLevel: 'warn',
};
