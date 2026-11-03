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
import { keepTick, MAX_SKIPS, drawNow, leadOf } from '../src/components/VideoStudio/frameClock';
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

/* ── Frames drawn as they arrive (frameClock.ts drawNow / leadOf) ── */
{
  const F = 1000 / 30;
  ok('a camera frame is drawn the moment it arrives when the camera leads', drawNow('cam', 'cam', F, F));
  ok('…but not a few milliseconds after the last draw (left for the next)', !drawNow('cam', 'cam', 4, F));
  ok('a tick does not draw while the camera leads and drew a frame ago', !drawNow('tick', 'cam', F, F));
  ok('a tick draws once the lead has been quiet over a frame and a quarter (a camera hiccup, a still screen)', drawNow('tick', 'cam', F * 1.3, F));
  ok('the screen does not draw while the camera leads (the camera\'s next draw takes it)', !drawNow('screen', 'cam', F, F));
  ok('a camera frame waits for its outline while frames are paired', !drawNow('cam', 'pair', F, F) && drawNow('pair', 'pair', F, F));
  ok('with the clock leading, every tick draws and arrivals wait', drawNow('tick', 'clock', 1, F) && !drawNow('cam', 'clock', F, F));
  ok('a frame that costs 60 ms is not drawn again 40 ms later (the page keeps a fifth of its time)', !drawNow('cam', 'cam', 40, F, 60) && !drawNow('tick', 'clock', 40, F, 60) && drawNow('cam', 'cam', 76, F, 60));
  ok('a frame that costs 10 ms changes nothing at 30 fps', drawNow('cam', 'cam', F, F, 10) && drawNow('tick', 'clock', F, F, 10));
  ok('a shown camera read frame by frame leads at 30 fps', leadOf({ cam: true, camFeed: true, camMs: 33, pairing: false, screenFeed: true, fps: 30 }) === 'cam');
  ok('…its outline leads when paired', leadOf({ cam: true, camFeed: true, camMs: 33, pairing: true, screenFeed: true, fps: 30 }) === 'pair');
  ok('…a slow camera still leads at 30 fps (the heartbeat fills the gaps)', leadOf({ cam: true, camFeed: true, camMs: 66, pairing: false, screenFeed: true, fps: 30 }) === 'cam');
  ok('a 30 fps camera cannot pace a 60 fps recording: the clock leads', leadOf({ cam: true, camFeed: true, camMs: 33, pairing: false, screenFeed: true, fps: 60 }) === 'clock');
  ok('a 60 fps camera paces a 60 fps recording', leadOf({ cam: true, camFeed: true, camMs: 16.7, pairing: false, screenFeed: false, fps: 60 }) === 'cam');
  ok('a camera drawn from an element (Firefox, Safari) cannot lead', leadOf({ cam: true, camFeed: false, camMs: 33, pairing: false, screenFeed: false, fps: 30 }) === 'clock');
  ok('no camera: the shared screen leads', leadOf({ cam: false, camFeed: false, camMs: 0, pairing: false, screenFeed: true, fps: 30 }) === 'screen');
  /* The beat, simulated: a 30.3 fps camera against a 30 fps clock for 20 s. Drawn on the clock, frames are shown twice or never and wait up to a frame; drawn as they arrive, neither. */
  const sim = (lead: 'cam' | 'clock') => {
    const camMs = 1000 / 30.3, events: [number, 'cam' | 'tick'][] = [];
    for (let t = 5; t < 20000; t += camMs) events.push([t, 'cam']);
    for (let t = 0; t < 20000; t += F) events.push([t, 'tick']);
    events.sort((a, b) => a[0] - b[0]);
    let last = -Infinity, newest = -1, arrivedAt = 0, shown = -1, waits: number[] = [], rep = 0, skip = 0, n = -1;
    for (const [t, k] of events) {
      if (k === 'cam') { n++; newest = n; arrivedAt = t; }
      if (newest < 0 || !drawNow(k, lead, t - last, F)) continue;
      last = t;
      if (newest === shown) rep++; else { if (shown >= 0) skip += newest - shown - 1; waits.push(t - arrivedAt); }
      shown = newest;
    }
    return { rep, skip, wait: waits.reduce((a, b) => a + b, 0) / waits.length };
  };
  const a = sim('clock'), b = sim('cam');
  console.log('    beat simulation, clock-led:', JSON.stringify(a), ' arrival-led:', JSON.stringify(b));
  ok('drawn on the clock, a camera beating against it repeats and skips frames and waits ~half a frame', a.rep + a.skip > 0 && a.wait > 8, a);
  ok('drawn as it arrives: no camera frame repeated or skipped, and no wait', b.rep === 0 && b.skip === 0 && b.wait < 1, b);
}

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
