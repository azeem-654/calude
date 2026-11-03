#!/usr/bin/env node
/**
 * Screen Recorder benchmark — reproducible before/after numbers for the
 * recording engine (docs/claude/video-studio.md, "Recording engine, 2026-11").
 *
 *   node test/recorderBench.e2e.mjs fx
 *     The camera background through CameraFx (test/recorderBench/main.ts):
 *     how much of a moving person is drawn as background (the blurred face),
 *     of the head alone, how much room is kept as person, and the page
 *     thread's cost. BASE_SRC=<an older src/ tree> runs it on that too, side
 *     by side (e.g. `git worktree add /tmp/old <commit>` → /tmp/old/src).
 *
 *   node test/recorderBench.e2e.mjs app
 *     The real recorder in the real app: needs `VITE_BASE=/ npm run build`
 *     and `npx wrangler dev --port 8787 --local` running. A fake camera
 *     playing the moving portrait, a browser tab shared as the screen; seven
 *     scenarios (camera, + screen, + blur, + own picture, + tab sound, a long
 *     one); each recording's frame intervals read by ffprobe — bursts (<10 ms)
 *     and stalls (>50 ms) are the "stacked scenes" — plus the diagnostics
 *     panel's own figures and the script heap over time.
 *
 * Env: SECS (fx seconds), THROTTLE (CPU slowdown — 2 is a weaker laptop),
 * ONLY=1,2 (app scenarios), LONG (seconds of the long one, default 120), TAG.
 * The portrait and its expected mask are MediaPipe's own test assets, fetched
 * once into .recbench/; the fake camera is made from them with ffmpeg.
 * Without a graphics chip (a CI container) every number is software
 * rendering: compare runs on one machine, never across machines.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '..'), DIR = resolve(REPO, '.recbench');
const MODE = process.argv[2] || 'fx', TAG = process.env.TAG || 'run', THROTTLE = Number(process.env.THROTTLE || 1);
mkdirSync(DIR, { recursive: true });

async function fetchOnce(url, file) {
  if (existsSync(file)) return;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`could not fetch ${url}: ${r.status}`);
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}
await fetchOnce('https://storage.googleapis.com/mediapipe-assets/portrait.jpg', `${DIR}/portrait.jpg`);
await fetchOnce('https://storage.googleapis.com/mediapipe-assets/portrait_selfie_segmentation_expected_confidence_mask.jpg', `${DIR}/mask.jpg`);
const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);

if (MODE === 'fx') {
  const pub = `${DIR}/public`; mkdirSync(pub, { recursive: true });
  copyFileSync(`${DIR}/portrait.jpg`, `${pub}/portrait.jpg`); copyFileSync(`${DIR}/mask.jpg`, `${pub}/mask.jpg`);
  const trees = { new: resolve(REPO, 'src'), ...(process.env.BASE_SRC ? { base: process.env.BASE_SRC } : {}) };
  const ports = {}; const servers = [];
  let port = 8911;
  for (const [k, src] of Object.entries(trees)) {
    const out = `${DIR}/fx-${k}`;
    execFileSync('node', [resolve(REPO, 'node_modules/vite/bin/vite.js'), 'build', '--config', resolve(REPO, 'test/recorderBench/vite.config.mjs')], { env: { ...process.env, SRC: src, OUT: out, PUBLIC: pub }, stdio: 'inherit' });
    ports[k] = port; servers.push(spawn('python3', ['-m', 'http.server', String(port), '-d', out], { stdio: 'ignore' })); port++;
  }
  await new Promise(r => setTimeout(r, 1200));
  const b = await pw.chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const res = {};
  try {
    for (const k of Object.keys(trees)) for (const c of ['move=0&bg=remove', 'move=1&bg=remove', 'move=1&bg=remove&tune=perf', 'move=1&bg=blur']) {
      const p = await b.newPage({ viewport: { width: 1000, height: 600 } });
      const cdp = await p.context().newCDPSession(p);
      if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
      await p.goto(`http://127.0.0.1:${ports[k]}/?${c}&secs=${process.env.SECS || 12}`);
      await p.waitForFunction(() => window.__result, null, { timeout: 180000 });
      const r = await p.evaluate(() => window.__result);
      res[`${k} ${c}`] = r;
      const f = n => (typeof n === 'number' ? n.toFixed(2) : n);
      console.log(`${k.padEnd(4)} ${c.padEnd(24)} person→bg ${f(r.lostPct)}% (p95 ${f(r.lostP95)}%) · head ${f(r.headLostPct)}% · bleed ${f(r.bleedPct)}% · paired ${f(r.pairedShare)} · draw ${f(r.drawAvg)} ms (p95 ${f(r.drawP95)}) · stalls>50ms ${r.longGaps}`);
      await p.close();
    }
  } finally { await b.close(); servers.forEach(s => s.kill()); }
  writeFileSync(`${DIR}/fx-${TAG}.json`, JSON.stringify(res, null, 1));
  process.exit(0);
}

/* ── app ── */
const S = DIR, B = process.env.BASE_URL || 'http://localhost:8787';
if (!existsSync(`${DIR}/cam.mjpeg`)) ff('-loop', '1', '-i', `${DIR}/portrait.jpg`, '-vf', "scale=1100:-1,crop=960:540:'70+70*sin(2*PI*t/1.5)':0,format=yuvj420p", '-r', '30', '-t', '12', '-q:v', '3', `${DIR}/cam.mjpeg`);
if (!existsSync(`${DIR}/office.jpg`)) ff('-f', 'lavfi', '-i', 'gradients=s=1280x720:c0=0x2a6f97:c1=0xf2c14e:x0=0:y0=0:x1=1280:y1=720', '-frames:v', '1', `${DIR}/office.jpg`);
const ACCOUNT = { email: `recbench+${Date.now()}@test.dev`, pw: 'Sup3rSecret!23' };
const reg = await fetch(`${B}/api/auth.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'register', email: ACCOUNT.email, password: ACCOUNT.pw, name: 'Rec Bench', businessName: 'Rec Bench' }) }).then(r => r.json()).catch(e => ({ error: String(e) }));
if (!reg.success) { console.error('Could not register a test account — is wrangler dev running on', B, reg); process.exit(1); }
const only = (process.env.ONLY || '').split(',').filter(Boolean);
const SCEN = [
  { id: 1, name: 'cam only', mode: 'cam', bg: 'none', secs: 15 },
  { id: 2, name: 'cam + screen', mode: 'screen-cam', bg: 'none', secs: 15 },
  { id: 3, name: 'cam + blur', mode: 'cam', bg: 'blur', secs: 15 },
  { id: 4, name: 'cam + screen + blur', mode: 'screen-cam', bg: 'blur', secs: 15 },
  { id: 5, name: 'cam + screen + own picture', mode: 'screen-cam', bg: 'image', secs: 15 },
  { id: 6, name: 'cam + screen + own picture + tab sound', mode: 'screen-cam', bg: 'image', sys: true, secs: 15 },
  { id: 7, name: 'long: cam + screen + blur', mode: 'screen-cam', bg: 'blur', secs: Number(process.env.LONG || 120) },
].filter(s => !only.length || only.includes(String(s.id)));
const INIT = () => {
  const W = window;
  W.__rf = []; W.__lt = []; W.__age = []; W.__chunks = [];
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) W.__lt.push(e.duration); }).observe({ type: 'longtask' }); } catch {}
  const rf = CanvasCaptureMediaStreamTrack.prototype.requestFrame;
  CanvasCaptureMediaStreamTrack.prototype.requestFrame = function () { W.__rf.push(performance.now()); return rf.call(this); };
  const recv = new WeakMap();
  const rd = ReadableStreamDefaultReader.prototype.read;
  ReadableStreamDefaultReader.prototype.read = function () { return rd.call(this).then(r => { if (r && r.value && typeof VideoFrame !== 'undefined' && r.value instanceof VideoFrame) recv.set(r.value, performance.now()); return r; }); };
  for (const C of [CanvasRenderingContext2D, typeof OffscreenCanvasRenderingContext2D !== 'undefined' ? OffscreenCanvasRenderingContext2D : null]) {
    if (!C) continue;
    const di = C.prototype.drawImage;
    C.prototype.drawImage = function (img, ...a) { if (typeof VideoFrame !== 'undefined' && img instanceof VideoFrame && img.displayWidth === 960 && recv.has(img)) W.__age.push(performance.now() - recv.get(img)); return di.call(this, img, ...a); };
  }
  const st = MediaRecorder.prototype.start;
  MediaRecorder.prototype.start = function (...a) { W.__chunks = []; this.addEventListener('dataavailable', e => { if (e.data.size) W.__chunks.push(e.data); }); return st.apply(this, a); };
};
const b = await pw.chromium.launch({ args: [
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${DIR}/cam.mjpeg`,
  '--auto-select-tab-capture-source-by-title=BenchScreen', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader',
] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['camera', 'microphone'] });
const scr = await ctx.newPage();
await scr.setContent(`<title>BenchScreen</title><body style="margin:0;background:#fff"><canvas id=c width=1280 height=720></canvas><script>
const c=document.getElementById('c').getContext('2d');let n=0;
(function f(){n++;c.fillStyle='#fff';c.fillRect(0,0,1280,720);c.fillStyle='#123';c.font='48px sans-serif';c.fillText('Slide '+Math.floor(n/120)+'  frame '+n,60,100);
c.fillStyle='#e33';c.fillRect(100+((n*8)%1000),300,80,80);requestAnimationFrame(f)})();
try{const a=new AudioContext();const o=a.createOscillator();o.frequency.value=440;o.connect(a.destination);o.start();}catch(e){}
</script></body>`);
const results = {};
for (const sc of SCEN) {
  const p = await ctx.newPage();
  try {
  await p.addInitScript(INIT);
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error' && !/XNNPACK|favicon/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  await p.goto(`${B}/login`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1000);
  if (await p.getByLabel('Email or username').count()) {
    await p.getByLabel('Email or username').fill(ACCOUNT.email);
    await p.fill('input[type="password"]', ACCOUNT.pw);
    await p.getByRole('button', { name: 'Sign in' }).click();
    await p.waitForTimeout(2500);
  }
  await p.evaluate(([bg]) => localStorage.setItem('crm_rec_prefs', JSON.stringify({ fps: 30, res: '720', quality: 'standard', camRes: '720', float: false, layout: 'bubble', fx: { bg: bg === 'image' ? 'none' : bg, blur: 60 } })), [sc.bg]);
  await p.goto(`${B}/video-studio?tab=media&record=1&recdiag=1`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid="rec-dialog"]', { timeout: 30000 });
  await p.click(`[data-testid="rec-mode-${sc.mode}"]`);
  await p.waitForTimeout(1500);
  /* Set through the page, not storage: the app restores an account's settings from the server on load, over anything seeded. */
  for (const id of ['rec-fps-30', 'rec-res-720', 'rec-q-standard', 'rec-camres-720']) { const el = p.locator(`[data-testid="${id}"]`); if (await el.count()) await el.click(); }
  const fl = p.locator('[data-testid="rec-float-pref"]'); if (await fl.count() && await fl.isChecked()) await fl.uncheck();
  await p.click(`[data-testid="rec-fx-bg-${sc.bg === 'blur' ? 'blur' : 'none'}"]`);
  if (sc.bg === 'image') await p.setInputFiles('[data-testid="rec-fx-bg-file"]', `${DIR}/office.jpg`);
  if (sc.sys) { const box = p.locator('[data-testid="rec-sys"]'); if (await box.count()) await box.check().catch(() => {}); }
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Performance.enable');
  if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await p.waitForTimeout(4000);
  const heap0 = (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'JSHeapUsedSize').value;
  await p.evaluate(() => { window.__lt = []; window.__age = []; });
  await p.click('[data-testid="rec-start"]');
  await p.waitForSelector('[data-testid="rec-stop"]', { timeout: 30000 });
  await p.evaluate(() => { window.__rf = []; window.__lt = []; window.__age = []; });
  const heaps = [];
  let diag = null;
  for (let t = 0; t < sc.secs; t += 5) {
    await p.waitForTimeout(5000);
    heaps.push((await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'JSHeapUsedSize').value / 1048576);
    diag = await p.evaluate(() => document.querySelector('[data-testid="rec-diag"]')?.getAttribute('data-json') ?? null);
  }
  const live = await p.evaluate(() => ({ rf: window.__rf, lt: window.__lt, age: window.__age }));
  await p.click('[data-testid="rec-stop"]', { timeout: 60000 });
  await p.waitForSelector('[data-testid="rec-review"]', { timeout: 60000 });
  if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const b64 = await p.evaluate(async () => { const bl = new Blob(window.__chunks, { type: 'video/webm' }); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode(...u.subarray(i, i + 32768)); return btoa(s); });
  const file = `${DIR}/${TAG}-${sc.id}.webm`;
  writeFileSync(file, Buffer.from(b64, 'base64'));
  const pts = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', file]).toString().trim().split('\n').map(Number).filter(Number.isFinite).sort((a, c) => a - c);
  const aud = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', file]).toString().trim();
  const iv = pts.slice(1).map((v, i) => (v - pts[i]) * 1000);
  const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * f))] ?? 0; };
  const avg = a => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
  const rfi = live.rf.slice(1).map((v, i) => v - live.rf[i]);
  const ds = diag ? JSON.parse(diag) : null;
  const r = {
    name: sc.name, secs: sc.secs, frames: pts.length, fps: pts.length / Math.max(0.001, pts[pts.length - 1] - pts[0]),
    burstPct: iv.filter(x => x < 10).length / iv.length * 100, stallPct: iv.filter(x => x > 50).length / iv.length * 100,
    ivP95: q(iv, 0.95), ivMax: Math.max(...iv), ivSd: Math.sqrt(avg(iv.map(x => (x - avg(iv)) ** 2))),
    rfBurst: rfi.filter(x => x < 10).length, longTasks: live.lt.length, longMax: Math.max(0, ...live.lt),
    camAgeAvg: avg(live.age), camAgeP95: q(live.age, 0.95),
    diag: ds ? { camAge: ds.s.camAge, camAgeP95: ds.s.camAgeP95, drawAvg: ds.s.drawAvg, drawP95: ds.s.drawP95, dropped: ds.s.dropped, camFps: ds.s.camFps, scrFps: ds.s.scrFps, bottleneck: ds.s.bottleneck, fx: ds.c.fx, audio: ds.c.audio, rec: ds.c.rec && { mime: ds.c.rec.mime, gap: ds.c.rec.chunkGapMax } } : null,
    heap0: heap0 / 1048576, heaps, audio: aud, errs,
  };
  results[sc.id] = r;
  console.log(JSON.stringify({ id: sc.id, ...r, heaps: r.heaps.map(h => +h.toFixed(1)) }));
  } catch (e) {
    /* A scenario that hangs (the page stopped answering) is a result too, not the end of the run. */
    results[sc.id] = { name: sc.name, failed: String(e).split('\n')[0].slice(0, 200) };
    console.log(JSON.stringify({ id: sc.id, ...results[sc.id] }));
  }
  await p.close().catch(() => {});
}
writeFileSync(`${DIR}/app-${TAG}.json`, JSON.stringify(results, null, 1));
await b.close();
