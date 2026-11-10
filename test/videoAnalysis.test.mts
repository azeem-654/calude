/**
 * The recording analysis (media/engine/track.py `Analyser`) on recordings
 * made for the purpose, and the framing planner (reframe.ts) on what it
 * found — the test behind "New short composition no longer crops the
 * middle". Needs ffmpeg and Python 3 with OpenCV; the YuNet model (the
 * engine's own, `FACE_MODEL`, or the e2e's cached copy) is used when it is
 * there — without it the face-bearing clips are skipped, said so.
 *
 *   npm run test:videoanalysis
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { framePlan, knownOf, resolveFraming } from '../worker/src/lib/video/reframe';
import type { TrackFile } from '../worker/src/lib/video/motion';

let pass = 0, failN = 0;
const ok = (name: string, cond: unknown, detail?: unknown) => { if (cond) { pass++; console.log(`PASS  ${name}`); } else { failN++; console.log(`FAIL  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); } };
const has = (cmd: string, args: string[]) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;
if (!has('ffmpeg', ['-version']) || !has('python3', ['-c', 'import cv2, numpy'])) { console.log('SKIP  needs ffmpeg and python3 with OpenCV'); process.exit(0); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-analysis-'));
const FACE = path.resolve('test/fixtures/faces/lincoln-1863.jpg');
const model = [process.env.FACE_MODEL, path.join(os.tmpdir(), 'claude-0/e2e-run/.wrangler-video/fixtures/face_detection_yunet.onnx'), path.resolve('.wrangler-video/fixtures/face_detection_yunet.onnx')].find(p => p && fs.existsSync(p));
const ff = (args: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'ignore' });
const enc = ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24', '-pix_fmt', 'yuv420p'];

/* A pointer: 12×18, white with a black rim. */
const cursor = path.join(dir, 'cursor.png');
ff(['-f', 'lavfi', '-i', 'color=c=white:s=12x18:d=1', '-vf', 'drawbox=x=0:y=0:w=12:h=18:color=black:t=2', '-frames:v', '1', cursor]);
const ui = 'drawbox=x=0:y=0:w=220:h=720:color=0x1f2937:t=fill,drawbox=x=260:y=60:w=960:h=70:color=0xffffff:t=fill,drawbox=x=260:y=160:w=600:h=400:color=0xdbeafe:t=fill,drawbox=x=300:y=200:w=300:h=24:color=0x111827:t=fill,drawbox=x=300:y=250:w=420:h=24:color=0x374151:t=fill';
const CX = (t: number) => 300 + 600 * Math.abs(Math.sin(t / 4)) + 6, CY = (t: number) => 150 + 400 * Math.abs(Math.cos(t / 5)) + 9;
const screen = path.join(dir, 'screen.mp4');
ff(['-f', 'lavfi', '-i', 'color=c=0xf3f4f6:s=1280x720:r=30:d=20', '-i', cursor, '-filter_complex', `[0:v]${ui}[bg];[bg][1:v]overlay=x='300+600*abs(sin(t/4))':y='150+400*abs(cos(t/5))'[v]`, '-map', '[v]', ...enc, screen]);
const slides = path.join(dir, 'slides.mp4');
ff(['-f', 'lavfi', '-i', 'color=c=0xffffff:s=1280x720:r=30:d=20', '-filter_complex', `[0:v]drawbox=x=100:y=80:w=1080:h=60:color=0x111827:t=fill,drawbox=x=100:y=200:w=800:h=30:color=0x374151:t=fill,drawbox=x=100:y=320:w=900:h=30:color=0x374151:t=fill:enable='lt(t,10)',drawbox=x=100:y=320:w=500:h=200:color=0x2563eb:t=fill:enable='gte(t,10)'[v]`, '-map', '[v]', ...enc, slides]);
const camera = path.join(dir, 'camera.mp4');
ff(['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=12', ...enc, camera]);
const talking = path.join(dir, 'talking.mp4'), screencam = path.join(dir, 'screencam.mp4');
if (model) {
  ff(['-loop', '1', '-i', FACE, '-f', 'lavfi', '-i', 'color=c=0x6b5b4a:s=1280x720:r=30:d=12,noise=alls=28:allf=t+u', '-filter_complex', `[0:v]scale=360:360[f];[1:v][f]overlay=x='460+12*sin(t)':y='120+6*sin(t/2)':shortest=1[v]`, '-map', '[v]', '-t', '12', ...enc, talking]);
  ff(['-f', 'lavfi', '-i', 'color=c=0xf3f4f6:s=1280x720:r=30:d=12', '-i', cursor, '-loop', '1', '-i', FACE, '-filter_complex', `[0:v]${ui}[bg];[2:v]scale=130:130[f];[bg][1:v]overlay=x='300+500*abs(sin(t/4))':y='150+350*abs(cos(t/5))'[b2];[b2][f]overlay=x=1130:y=575:shortest=1[v]`, '-map', '[v]', '-t', '12', ...enc, screencam]);
}

/** The engine's own way: frames at 5 fps, 480 wide, raw BGR on stdin; no speech (no sound in these clips). */
function analyse(file: string): TrackFile {
  const speech = path.join(dir, 'speech.json');
  fs.writeFileSync(speech, '[]');
  const raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-an', '-vf', 'fps=5,scale=480:270', '-f', 'rawvideo', '-pix_fmt', 'bgr24', 'pipe:1'], { maxBuffer: 1 << 30 });
  const r = spawnSync('python3', [path.resolve('media/engine/track.py'), '--w', '480', '--h', '270', '--fps', '5', '--speech', speech, ...(model ? ['--model', model] : [])], { input: raw, maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`track.py failed: ${r.stderr.toString().split('\n').slice(-4).join(' | ')}`);
  return JSON.parse(r.stdout.toString()) as TrackFile;
}

const S = analyse(screen), an = S.analysis!;
ok('a screen recording with a moving pointer is read as one, from the picture alone', an?.v === 2 && an.kind === 'screen' && an.cursorSeen > 0.8 && an.flat > 0.8, { kind: an?.kind, why: an?.why, cursorSeen: an?.cursorSeen });
const errs = an.cursor.map(([t, x, y]) => Math.hypot(x * 1280 - CX(t), y * 720 - CY(t))).sort((a, b) => a - b);
ok('…the pointer is followed to within 12 px (median) and 30 px (worst) at 1280 wide', errs.length > 60 && errs[errs.length >> 1] < 12 && errs[errs.length - 1] < 30, { rows: errs.length, median: errs[errs.length >> 1], max: errs[errs.length - 1] });
ok('…the content box starts at the dark sidebar\'s edge and covers the pointer\'s whole range', an.content[0] >= 0.1 && an.content[0] <= 0.2 && an.content[0] + an.content[2] >= 0.7, an.content);
const rS = resolveFraming(undefined, knownOf(S));
const fp = framePlan(rS, S, 1280, 720, 1080, 1920, [[0, 20]])!;
const inside = fp.path.filter(([t, x, y]) => { const px = CX(t), py = CY(t); return px >= x && px <= x + fp.plan.crop[0] && py >= y && py <= y + fp.plan.crop[1]; }).length;
ok('a 9:16 Short of it follows the pointer: inside the window in over 90% of the steps (a centre crop had it in under half)', rS.strategy === 'cursor' && inside / fp.path.length > 0.9, { inside, steps: fp.path.length, crop: fp.plan.crop });
const centreIn = fp.path.filter(([t]) => { const px = CX(t); return px >= (1280 - fp.plan.crop[0]) / 2 && px <= (1280 + fp.plan.crop[0]) / 2; }).length;
ok('…(for the record: the centre crop of the same size would have had it in a minority of steps)', centreIn / fp.path.length < 0.6, { centreIn, steps: fp.path.length });

const L = analyse(slides).analysis!;
ok('a slide deck is read as slides: flat, still, no pointer; its Short shows the slide whole', L.kind === 'slides' && resolveFraming(undefined, knownOf({ analysis: L } as TrackFile)).strategy === 'whole', { kind: L.kind, why: L.why });
const C = analyse(camera).analysis!;
ok('camera footage is not a screen', C.kind === 'camera' && C.still < 0.2, { kind: C.kind, why: C.why });

if (model) {
  const T = analyse(talking);
  ok('one large face is a talking head, followed as the speaker', T.analysis!.kind === 'talking' && T.faces >= 1 && resolveFraming(undefined, knownOf(T)).strategy === 'speaker', { kind: T.analysis!.kind, why: T.analysis!.why, people: T.people });
  const SC = analyse(screencam);
  const rSC = resolveFraming(undefined, knownOf(SC));
  const fpSC = framePlan(rSC, SC, 1280, 720, 1080, 1920, [[0, 12]]);
  const cam = fpSC?.plan.cam;
  ok('a screen with a small camera picture in the corner is screencam: the camera (round the face at 1195, 640) in its own band, the screen following the pointer', SC.analysis!.kind === 'screencam' && rSC.strategy === 'screencam' && !!fpSC && fpSC.plan.kind === 'screencam' && !!cam && cam[0] <= 1195 && cam[0] + cam[2] >= 1195 && cam[1] <= 640 && cam[1] + cam[3] >= 640 && fpSC.plan.top > 0, { kind: SC.analysis!.kind, why: SC.analysis!.why, cam });
} else console.log('SKIP  talking head and screencam clips (no YuNet model — set FACE_MODEL)');

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
