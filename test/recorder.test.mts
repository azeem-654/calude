/**
 * The Screen Recorder's pure judgements (npm run test:recorder): the person's
 * outline (maskOutline.ts — what decides whether a face is blurred), which
 * segmentation model fits a camera, the frame clock's stale-tick rule
 * (frameClock.ts — the "stacked scenes"), and the diagnostics' verdict on
 * where the time goes (recDiag.ts). The browser side — worker, pairing,
 * real frames — is measured by the benchmark described in
 * docs/claude/video-studio.md, not here.
 */
import { outline, outlineState, alphaInto, lookSize, modelFor } from '../src/components/VideoStudio/maskOutline';
import { keepTick, MAX_SKIPS } from '../src/components/VideoStudio/frameClock';
import { Ring, judge } from '../src/components/VideoStudio/recDiag';

let failed = 0, passed = 0;
const ok = (name: string, cond: boolean, detail?: unknown) => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}`, detail ?? ''); }
};

/* ── The outline ── */
{
  const w = 40, h = 30, n = w * h;
  /* A person: a filled block in the middle, with a dark "glasses" hole inside it and a patch of low confidence (a cheek in shadow). */
  const f = new Float32Array(n);
  for (let y = 5; y < 28; y++) for (let x = 10; x < 30; x++) f[y * w + x] = 0.95;
  for (let y = 10; y < 12; y++) for (let x = 15; x < 18; x++) f[y * w + x] = 0.05;
  const st = outlineState(null, n, f);
  const a = outline(st, f, w, h);
  ok('inside the person is solid', a[20 * w + 20] === 1);
  ok('a small hole inside the person (glasses, a shadowed cheek) is filled, not treated as background', a[10 * w + 16] === 1, a[10 * w + 16]);
  ok('background reachable from the edge stays background', a[2 * w + 2] === 0);
  ok('the outline is grown by a pixel (the edge keeps a little room, never an eye)', a[20 * w + 9] === 1 && a[20 * w + 8] === 0, [a[20 * w + 9], a[20 * w + 8]]);
  /* The person moves right by 3: the new place is the person at once; the old place fades over looks. */
  const g = new Float32Array(n);
  for (let y = 5; y < 28; y++) for (let x = 13; x < 33; x++) g[y * w + x] = 0.95;
  const b = outline(st, g, w, h);
  ok('where the person moved to is theirs at once (a moving head is never behind its outline)', b[20 * w + 32] === 1);
  ok('where they left fades rather than flickering (still partly kept one look later)', b[20 * w + 10] > 0 && b[20 * w + 10] < 1, b[20 * w + 10]);
  outline(st, g, w, h); const c3 = outline(st, g, w, h);
  ok('…and is gone within three looks', c3[20 * w + 10] === 0, c3[20 * w + 10]);
  /* A gap bigger than a fortieth of the picture (between an arm and the body) is left alone. */
  const big = new Float32Array(n).fill(0);
  for (let y = 2; y < 28; y++) for (let x = 2; x < 38; x++) big[y * w + x] = 0.95;
  for (let y = 8; y < 20; y++) for (let x = 12; x < 24; x++) big[y * w + x] = 0.05;
  const bb = outline(outlineState(null, n, big), big, w, h);
  ok('a large enclosed gap (arm and body) is not filled', bb[14 * w + 18] === 0, bb[14 * w + 18]);
  const g3 = outline(outlineState(null, n, f), f, w, h, 3);
  ok('drawn on newer frames the outline is grown by three (room for a head that moved)', g3[20 * w + 7] === 1 && g3[20 * w + 6] === 0, [g3[20 * w + 7], g3[20 * w + 6]]);
  const rgba = new Uint8ClampedArray(n * 4);
  alphaInto(a, rgba);
  ok('the outline becomes the alpha of a mask', rgba[(20 * w + 20) * 4 + 3] === 255 && rgba[(2 * w + 2) * 4 + 3] === 0);
}

/* ── The model for a camera ── */
ok('a 16:9 webcam uses the landscape model at its own 256×144', JSON.stringify(lookSize(1280, 720)) === JSON.stringify({ w: 256, h: 144, model: 'landscape' }));
ok('a 4:3 webcam uses the landscape model too (closer than square)', modelFor(640, 480) === 'landscape');
ok('a portrait or square camera keeps the square model', modelFor(720, 1280) === 'square' && modelFor(720, 720) === 'square');
ok('a tiny camera is never upscaled for the square model', lookSize(160, 160).w === 160);

/* ── The frame clock ── */
ok('a tick on time is drawn', keepTick(3, 33.3, 0));
ok('a tick that waited longer than a frame (a newer one behind it) is skipped', !keepTick(40, 33.3, 0));
ok(`never more than ${MAX_SKIPS} skipped in a row`, keepTick(500, 33.3, MAX_SKIPS));
ok('a tick a few milliseconds after the last drawn is skipped (no frame recorded twice back to back)', !keepTick(2, 33.3, 0, 3));
ok('a tick a whole frame after the last drawn is drawn', keepTick(2, 33.3, 0, 33));
ok('a tick a little after a slow draw finished is still drawn (a slow draw costs one frame, not two)', keepTick(2, 33.3, 0, 9));

/* ── Diagnostics ── */
{
  const r = new Ring(4);
  [1, 2, 3, 4, 100].forEach(v => r.push(v));
  ok('a ring keeps only the last n', r.count === 4 && r.max() === 100 && Math.abs(r.avg() - 27.25) < 1e-9);
  r.push(NaN);
  ok('a ring ignores what was not measured', r.count === 4);
  const base = { fps: 30, target: 30, drawP95: 4, dropped: 0, longTasks: 0, longTaskMax: 0, camFps: 30, scrFps: 30, gaps: 0 };
  ok('keeping up says so', judge(base, null, null, 30, 30)[0] === 'none');
  ok('a long task is the page being busy', judge({ ...base, longTasks: 2, longTaskMax: 180 }, null, null, 30, 30)[0] === 'main-thread');
  ok('slow drawing is rendering', judge({ ...base, drawP95: 25 }, null, null, 30, 30)[0] === 'rendering');
  ok('a slow background finder is named', judge(base, { runs: 'worker', delegate: 'CPU', model: 'landscape', cost: 50, roundTrip: 60, looksPerSec: 15, paired: false, maskAge: 60 }, null, 30, 30)[0] === 'segmentation');
  ok('a camera delivering 15 of 30 is capture', judge({ ...base, camFps: 15 }, null, null, 30, 30)[0] === 'capture');
  ok('late recorder chunks are encoding', judge(base, null, { state: 'recording', mime: 'video/webm', bitrate: 4e6, chunks: 5, bytes: 1, chunkGapMax: 4000 }, 30, 30)[0] === 'encoding');
  ok('a still screen sending few frames is normal, not a fault', judge({ ...base, scrFps: 1 }, null, null, 30, 30)[0] === 'none');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
