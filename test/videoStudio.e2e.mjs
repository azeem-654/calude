/**
 * AI Video Studio, end to end, against the real Worker, a real local D1 and
 * R2, the real media engine (FFmpeg) and mocks for Whisper and Gemini.
 *
 *   npm run test:videoe2e   (self-contained: engine :8873, Whisper mock :8874,
 *                            Gemini mock :8875, wrangler :8953, fresh state in
 *                            .wrangler-video; needs ffmpeg and a VITE_BASE=/ build)
 *
 * The owner's twenty steps (docs/VIDEO-STUDIO.md), in a browser at 1280:
 *  1 open AI Video Studio              11 every thumbnail is really a PNG
 *  2 upload a 20-minute recording       12 metadata belongs to each video
 *  3 "clean it, one long + four Shorts" 13 the long video exports (real MP4)
 *  4 the upload completes               14 the Shorts export (1080×1920)
 *  5 the transcript appears             15 they appear in the Content Library
 *  6 cleanup is suggested               16 …and in the Autopilot project's Assets
 *  7 four distinct Shorts               17 Autopilot's activity names them
 *  8 one Short is edited                18 reopening keeps every edit
 *  9 captions stay in sync              19 another workspace sees none of it
 * 10 PNG thumbnails are made            20 a failed step retries with no second
 *                                          charge and no second file
 * and: a non-video refused, an upload resumed, an Autopilot workflow's own
 * settings, Shorts and words chosen honestly without AI, the assistant, undo,
 * and a phone. Since the editor's redesign, also: the welcome wizard (goal →
 * choices → upload), the player holding its video across polls and playing
 * through the cuts, noise reduction and royalty-free music (an Openverse
 * mock on :8876 — a NonCommercial track must never be offered — and the
 * music really in the rendered sound), the timeline, Repurposing and a quiz
 * from the recording, and AI Shorts / Repurposing inside the studio.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { execSync, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { makeRecording, makeTwoFaces, startWhisperMock, startGeminiMock, startOpenverseMock } from './videoStudioMock.mjs';

const PORT = 8953, INSPECT = 9353, ENG = 8873, WH = 8874, GM = 8875, OV = 8876;
const B = `http://localhost:${PORT}`;
const SECRET = 'engine-test-secret-7f3a';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = [];
let failures = 0;
const ok = (n, p, d = '') => { if (!p) failures++; out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 500)}`}`); console.log(out[out.length - 1]); };

const state = path.resolve('.wrangler-video');
fs.mkdirSync(path.join(state, 'fixtures'), { recursive: true });
const fixture = (min) => {
  const file = path.join(state, 'fixtures', `talk-${min}.mp4`);
  if (fs.existsSync(file) && fs.existsSync(`${file}.json`)) return { file, script: JSON.parse(fs.readFileSync(`${file}.json`, 'utf8')) };
  console.log(`(making a ${min}-minute recording…)`);
  const script = makeRecording(file, min);
  fs.writeFileSync(`${file}.json`, JSON.stringify(script));
  return { file, script };
};
const LONG = fixture(Number(process.env.VIDEO_MINUTES || 20));
const SHORT = fixture(6);

/* The Whisper mock follows one recording's script at a time: pieces of the
   next recording start its clock again. */
let whisper = await startWhisperMock(WH, LONG.script);
const gemini = await startGeminiMock(GM);
const openverse = await startOpenverseMock(OV, path.join(state, 'fixtures', 'music'));

let engine;
/* The face detector the engine image carries (YuNet), fetched once for the
   local engine; without it track.py falls back to OpenCV's Haar cascade. */
const MODEL = path.join(state, 'fixtures', 'face_detection_yunet.onnx');
if (!fs.existsSync(MODEL)) { try { execFileSync('curl', ['-fsSL', '-o', MODEL, 'https://huggingface.co/opencv/face_detection_yunet/resolve/main/face_detection_yunet_2023mar.onnx'], { stdio: 'ignore' }); } catch { /* Haar then */ } }
const startEngine = () => {
  engine = spawn('node', [path.resolve('media/engine/server.mjs')], {
    env: { ...process.env, PORT: String(ENG), MEDIA_ENGINE_SECRET: SECRET, ALLOW_HTTP_INPUTS: '1', WORK_DIR: path.join(state, 'engine-work'), MAX_RUNNING: '2', FACE_MODEL: MODEL },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  engine.stderr.on('data', d => { if (process.env.DEBUG) process.stderr.write(d); });
};
startEngine();

const persist = path.join(state, 'wrangler');
fs.rmSync(persist, { recursive: true, force: true });
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
/* wrangler dev exits when its dev proxy loses a connection to the Worker
   ("Network connection lost") — which a video element cancelling a range
   request on a seek can cause. Production has no such proxy. So it is
   started again on the same port and the same stored data, and the restart
   is reported, never hidden. */
const WR_ARGS = ['wrangler', 'dev', '--local', '--port', String(PORT), '--inspector-port', String(INSPECT), '--persist-to', persist,
  '--var', `APP_ORIGIN:${B}`, '--var', `GEMINI_BASE:http://127.0.0.1:${GM}`, '--var', `AI_API_KEY:AIzaVIDEO${'x'.repeat(30)}`,
  '--var', `MEDIA_ENGINE_URL:http://127.0.0.1:${ENG}`, '--var', `MEDIA_ENGINE_SECRET:${SECRET}`, '--var', `WORKERS_AI_BASE:http://127.0.0.1:${WH}`, '--var', `OPENVERSE_BASE:http://127.0.0.1:${OV}`];
let wlog = '', stopping = false, restarts = 0;
const wfile = fs.createWriteStream(path.join(state, 'wrangler.log'));
let wr;
const startWrangler = () => {
  wr = spawn('npx', WR_ARGS, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  wr.stdout.on('data', c => { wlog += c; wfile.write(c); }); wr.stderr.on('data', c => { wlog += c; wfile.write(c); });
  wr.on('exit', () => {
    if (stopping) return;
    try { process.kill(-wr.pid, 'SIGTERM'); } catch { /* gone */ }
    restarts++;
    console.log(`  (local wrangler exited — restart ${restarts}, same data)`);
    setTimeout(startWrangler, 1500);
  });
};
startWrangler();
let br = null;
const stop = () => { stopping = true; try { process.kill(-wr.pid, 'SIGTERM'); } catch { /* gone */ } try { engine.kill(); } catch { /* gone */ } whisper.server.close(); gemini.server.close(); openverse.server.close(); };
process.on('exit', stop);
process.on('uncaughtException', async e => { console.log(e); console.log(wlog.replace(/.*workerd@.*\n/g, '').slice(-3000)); try { await br?.close(); } catch { /* */ } stop(); process.exit(1); });
for (let i = 0; i < 90; i++) { try { const r = await fetch(`${B}/api/data.php`, { method: 'POST', headers: { Connection: 'close' }, body: '{"action":"ping"}' }); if (r.ok) break; } catch { /* starting */ } await sleep(1000); }

let ipN = 1;
const api = (p, body) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.8.4.${ipN++ % 250}` }, body: JSON.stringify(body) }).then(r => r.json().catch(() => ({})));
const probe = file => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]).toString());
const download = async (url, name) => { const r = await fetch(url, { headers: { Connection: 'close' } }); const f = path.join(state, name); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); return { file: f, status: r.status, type: r.headers.get('content-type'), disposition: r.headers.get('content-disposition') }; };
const isPng = b => b.length > 57 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && b.subarray(12, 16).toString() === 'IHDR' && b.subarray(b.length - 8, b.length - 4).toString() === 'IEND';
const pngSize = b => [b.readUInt32BE(16), b.readUInt32BE(20)];

console.log('\nAI Video Studio');
/* The install owner first (an install needs one), then the customer whose
   journey this is — a signed-up account, with a workspace of its own. */
await api('auth.php', { action: 'bootstrap', email: 'owner@video.test', password: 'Tq9!vX2#pLm7wZ-video', name: 'Olu Owner' });
const OWNER = { email: 'cara@video.test', pw: 'Creator-horse-7-video', name: 'Cara Creator', biz: 'Growth Show Ltd' };
const reg = await api('auth.php', { action: 'register', email: OWNER.email, password: OWNER.pw, name: OWNER.name, businessName: OWNER.biz });
const login = await api('auth.php', { action: 'login', email: OWNER.email, password: OWNER.pw });
const T = login.token, A = reg.user?.accountId ?? login.user?.accountId;
ok('(a customer account with its own workspace)', !!T && !!A, { reg, login: Object.keys(login) });
const empty = await api('video.php', { token: T, accountId: '', action: 'list' });
ok('a request naming no workspace is refused before anything is looked up', empty.code === 'no_workspace', empty);
/* Local workerd now and then drops a request outright ("Network connection
   lost", no response at all) and keeps serving. A read is asked again; a
   write is not, because it may have landed. */
const READS = new Set(['status', 'get', 'list', 'capabilities']);
const v = async (action, extra = {}, who = { T, A }) => {
  for (let i = 0; ; i++) {
    try { return await api('video.php', { token: who.T, accountId: who.A, action, ...extra }); }
    catch (e) { if (!READS.has(action) || i >= 30) throw e; await sleep(2000); } // a restart takes ~15 s
  }
};

/* An Autopilot project with a portfolio and a "Recording to Shorts" workflow. */
const pf = await api('projects.php', { token: T, accountId: A, action: 'save_portfolio', name: 'Growth Show Ltd', profile: { companyName: 'Growth Show Ltd', description: 'A weekly show about winning customers', website: 'growthshow.example', brandColor: '#e5484d' } });
const proj = await api('projects.php', { token: T, accountId: A, action: 'save_project', name: 'Podcast Growth', objective: 'Turn every weekly podcast into Shorts', portfolioId: pf.id, kind: 'general' });
const AP = proj.id ?? proj.project?.id ?? (await api('projects.php', { token: T, accountId: A, action: 'get' })).projects?.[0]?.id;
const wf = await api('autopilot.php', { token: T, accountId: A, action: 'save_workflow', projectId: AP, record: {
  name: 'Recording to Shorts', status: 'active',
  nodes: [
    { id: 'n0', type: 'trigger', label: 'A recording is uploaded', config: { event: 'video_uploaded' }, nextId: 'n1' },
    { id: 'n1', type: 'ai', label: 'Clean it and make the Shorts', config: { source: 'video', produces: 'video_package', shorts: '3', long: 'false', captions: 'true', thumbnails: 'true', cleanup: 'balanced' }, nextId: null },
  ],
} });
ok('(an Autopilot project with a "Recording to Shorts" workflow)', !!AP && wf.success, JSON.stringify({ proj, wf }).slice(0, 300));

/* ── The workflow's own settings, and Run now ── */
{
  const c = await v('create', { name: 'From the workflow', prompt: '', autopilotProjectId: AP });
  ok('an upload into the project takes the workflow\'s settings: 3 Shorts, no long video', c.success && c.request?.shorts === 3 && c.request?.long === false, c);
  await v('delete', { projectId: c.id });
  const run = await api('autopilot.php', { token: T, accountId: A, action: 'run_agent', projectId: AP, workflowId: wf.id, nodeId: 'n1' });
  ok('"Run now" on it says it runs on upload, and writes no posts', !run.success || /uploaded|upload/i.test(JSON.stringify(run)), JSON.stringify(run).slice(0, 300));
}

/* ── A non-video, and an upload that resumes (API) ── */
{
  const c = await v('create', { name: 'Not a video', prompt: 'make 2 shorts' });
  /* A PNG's first bytes, with a video's name and type. */
  const bytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(4000, 7)]);
  const st = await v('upload_start', { projectId: c.id, name: 'holiday.mp4', size: bytes.length, type: 'video/mp4', fileKey: 'fake' });
  const r = await fetch(`${st.partUrl}&part=1`, { method: 'PUT', body: bytes, headers: { Connection: 'close' } });
  ok('a picture renamed .mp4 is refused from its bytes', r.status === 415, `${r.status} ${await r.text()}`);
  const wrongExt = await v('upload_start', { projectId: c.id, name: 'notes.txt', size: 100, type: 'text/plain', fileKey: 'x' });
  ok('a file that is not a video is refused by name, on the file box', !wrongExt.success && wrongExt.field === 'video.file', wrongExt);
  const buf = fs.readFileSync(SHORT.file);
  const s1 = await v('upload_start', { projectId: c.id, name: 'talk.mp4', size: buf.length, type: 'video/mp4', fileKey: `talk|${buf.length}|1` });
  await fetch(`${s1.partUrl}&part=1`, { method: 'PUT', body: buf.subarray(0, s1.partSize), headers: { Connection: 'close' } });
  const s2 = await v('upload_start', { projectId: c.id, name: 'talk.mp4', size: buf.length, type: 'video/mp4', fileKey: `talk|${buf.length}|1` });
  ok('choosing the same file again resumes: part 1 is already there', s2.uploadId === s1.uploadId && JSON.stringify(s2.done) === '[1]', s2);
  const early = await v('upload_complete', { projectId: c.id, uploadId: s1.uploadId });
  ok('an upload with parts missing is not finished', !early.success && early.missing?.length > 0, early);
  await v('upload_abort', { projectId: c.id });
  await v('delete', { projectId: c.id });
}

br = await pw.chromium.launch();
const errs = [];
const signIn = async (page, who) => {
  await page.goto(`${B}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email or username').fill(who.email, { timeout: 10_000 });
  await page.getByLabel('Password', { exact: true }).fill(who.pw);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(2500);
};

const ctx = await br.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
/* A page load is where a restart of local wrangler hurts: the page comes up
   with its requests refused. So every load waits for the server and loads
   again if wrangler restarted while it was loading. */
const serverUp = async () => { for (let i = 0; i < 60; i++) { try { const r = await fetch(`${B}/api/data.php`, { method: 'POST', headers: { Connection: 'close' }, body: '{"action":"ping"}' }); if (r.ok) return; } catch { /* restarting */ } await sleep(1000); } };
const steady = p => {
  if (p.__steady) return p;
  p.__steady = true;
  for (const name of ['goto', 'reload']) {
    const real = p[name].bind(p);
    p[name] = async (...a) => {
      for (let i = 0; ; i++) {
        await serverUp();
        const r0 = restarts;
        let res, err;
        try { res = await real(...a); } catch (e) { err = e; }
        await sleep(800);
        if (restarts === r0 || i >= 3) { if (err) throw err; return res; }
      }
    };
  }
  return p;
};
ctx.on('page', steady);
const page = steady(await ctx.newPage());
page.on('pageerror', e => errs.push(`desktop: ${e}`));
await signIn(page, OWNER);

/* ── 1 · Open AI Video Studio ── */
await page.goto(`${B}/video-studio`, { waitUntil: 'networkidle' });
await page.getByTestId('video-studio').waitFor({ timeout: 15_000 });
ok('1 · AI Video Studio opens, with its tabs — Quick Shorts and Repurpose among them', /AI Video Studio/.test(await page.innerText('h1')) && (await page.locator('.vs-tab').count()) === 8 && (await page.locator('[data-tab="quick-shorts"]').count()) === 1 && (await page.locator('[data-tab="repurpose"]').count()) === 1);
ok('…and opens on a welcome: what would you like to do?', (await page.getByTestId('vs-welcome').count()) === 1 && (await page.locator('.vs-goal').count()) === 8 && /Quiz from a training video/.test(await page.getByTestId('vs-welcome').innerText()));
await page.getByRole('button', { name: /What works/ }).click();
const caps = await page.getByTestId('vs-capabilities').innerText();
ok('…and says honestly what works: transcription working, eye contact and publishing unavailable', /Transcription with word timings\s*Whisper[\s\S]*?Working/.test(caps) && /Eye-contact correction\s*Provider setup required\.?\s*Unavailable/.test(caps) && /Direct publishing[\s\S]*?Unavailable/.test(caps), caps.slice(0, 800));
await page.keyboard.press('Escape'); await page.locator('.vs-modal-back').click({ position: { x: 5, y: 5 } }).catch(() => {});

/* ── 2–4 · A 20-minute recording, the request, the upload ── */
await page.getByTestId('vs-new').click();
await page.locator('[data-goal="both"]').click();
await page.getByTestId('vs-wizard-options').waitFor({ timeout: 5000 });
const opts = await page.getByTestId('vs-wizard-options').innerText();
ok('the wizard asks only what this goal needs: Shorts, cleanup, sound, music, a quiz', /How many/.test(opts) && /Background noise/.test(opts) && /Background music/.test(opts) && /A quiz/.test(opts), opts.slice(0, 300));
await page.getByTestId('vs-wiz-music').selectOption('calm');
await page.getByTestId('vs-wiz-quiz').check();
await page.getByTestId('vs-wiz-next').click();
const preset = await page.locator('#vs-prompt').inputValue();
ok('…and writes the request out for you to check', /4 Shorts/.test(preset) && /background noise/i.test(preset) && /calm royalty-free/i.test(preset), preset);
const PROMPT = 'Clean this recording, remove filler words and long gaps, create one polished main video and four Shorts, add captions and create PNG thumbnails.';
await page.locator('#vs-prompt').fill(PROMPT);
const understood = await page.getByTestId('vs-understood').innerText();
ok('3 · the request is read back: long video, 4 Shorts, captions, PNG thumbnails, balanced', /one cleaned long video/.test(understood) && /4 Shorts/.test(understood) && /PNG thumbnails/.test(understood) && /balanced cleanup/.test(understood), understood);
ok('…with the wizard\'s choices beside it: noise reduction, a clearer voice, calm music, a quiz', /medium noise reduction/.test(understood) && /clearer voice/.test(understood) && /calm royalty-free music/.test(understood) && /a quiz/.test(understood), understood);
await page.locator('[data-field="video.autopilot"]').selectOption(AP);
await page.getByTestId('vs-file').setInputFiles(LONG.file);
await page.locator('[data-field="video.name"]').fill('Weekly growth show — episode 12');
await page.getByTestId('vs-start').click();
let sawBar = '';
for (let i = 0; i < 80 && !/[\d.]+ (KB|MB) of [\d.]+ MB · \d+%/.test(sawBar); i++) { sawBar = await page.getByTestId('vs-upload-progress').innerText().catch(() => sawBar); await sleep(250); }
ok('2 · the upload shows real bytes sent', /[\d.]+ (KB|MB) of [\d.]+ MB · \d+%/.test(sawBar), sawBar);
await page.waitForURL(/\/video-studio\/vp-/, { timeout: 180_000 });
const PID = page.url().match(/video-studio\/(vp-[\w-]+)/)[1];
ok('4 · the upload completes and the editor opens', !!PID);
await page.getByTestId('vs-stages').waitFor({ timeout: 20_000 });
let sawPct = false, sawStage = '';
for (let i = 0; i < 60 && !sawPct; i++) {
  const t = await page.getByTestId('vs-stages').innerText().catch(() => '');
  if (/\d+%/.test(t)) { sawPct = true; sawStage = t; }
  await sleep(1000);
}
ok('…and shows real stages with a counted percentage', sawPct && /Preparing video/.test(sawStage) && /Transcribing/.test(sawStage), sawStage);

/* Wait for the whole package. The open page polls, which advances the jobs. */
const waitReady = async (pid, who, label, maxS = 1500) => {
  const t0 = Date.now();
  for (;;) {
    const s = await v('status', { projectId: pid, knownVersion: -1 }, who);
    if (s.project?.status === 'ready' && !s.jobs.some(j => j.state === 'queued' || j.state === 'running')) return s;
    if (s.project?.status === 'failed') return s;
    if ((Date.now() - t0) / 1000 > maxS) return s;
    await sleep(3000);
  }
};
const t0 = Date.now();
let S = await waitReady(PID, { T, A }, 'long');
console.log(`  (processed in ${Math.round((Date.now() - t0) / 1000)} s)`);
ok('the project finishes', S.project?.status === 'ready', JSON.stringify(S.project ?? S).slice(0, 400));
ok('the wizard\'s sound choices are on the edit: medium noise reduction, a clearer voice', S.doc.audio.denoise === 'medium' && S.doc.audio.voice === true, S.doc.audio);
ok('…calm music from the open library, with its licence — never the NonCommercial track', S.doc.music?.title === 'Calm Morning' && S.doc.music.license.startsWith('CC0') && S.doc.music.source === 'openverse' && /\/music\/ov-/.test(S.doc.music.key), S.doc.music);
const quiz = S.extras?.quiz?.questions ?? [];
ok('…and a quiz written from what the recording says, each question with the moment it is answered', quiz.length === 5 && quiz.every(q => q.options.length === 4 && q.t > 0) && !quiz.some(q => /planet/i.test(q.q)), quiz.map(q => q.q));

/* ── 5 · The transcript ── */
await page.reload({ waitUntil: 'networkidle' });
ok('the editor is laid out as designed: media, player, inspector, assistant, timeline', (await page.getByTestId('vs-media').count()) === 1 && (await page.getByTestId('vs-preview').count()) === 1 && (await page.getByTestId('vs-assistant').count()) === 1 && (await page.getByTestId('vs-timeline').count()) === 1);
ok('…the media list holds the long video and every Short', (await page.locator('[data-media]').count()) >= 5, await page.getByTestId('vs-media').innerText());
ok('…the timeline shows the picture as a filmstrip, the words, the Shorts and the music', (await page.locator('.vse-frame').count()) > 5 && (await page.locator('.vse-block.cap').count()) > 20 && (await page.locator('.vse-block.short').count()) === 4 && (await page.locator('.vse-block.music').count()) >= 1);

/* ── The player: holds its video across polls and plays through the cuts ── */
{
  S = await v('get', { projectId: PID });
  const again = await v('status', { projectId: PID, knownVersion: -1 });
  ok('the proxy\'s link is the same from one poll to the next (it used to change every few seconds and restart the player)', S.source.proxyUrl === again.source.proxyUrl);
  /* This Chromium cannot decode H.264, so the player is handed the first two
     minutes of the same proxy as VP9 — same clock, same cuts. */
  const proxyFile = (await download(S.source.proxyUrl, 'proxy.mp4')).file;
  const webm = path.join(state, 'proxy-head.webm');
  if (!fs.existsSync(webm)) execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', proxyFile, '-t', '120', '-vf', 'scale=320:-2', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '200k', '-c:a', 'libopus', '-b:a', '48k', webm]);
  const body = fs.readFileSync(webm);
  const src0 = await page.getByTestId('vs-video').getAttribute('data-src');
  await page.route(u => u.href === src0, async route => {
    const range = route.request().headers().range;
    const m = range && /bytes=(\d+)-(\d*)/.exec(range);
    if (!m) return route.fulfill({ status: 200, body, headers: { 'content-type': 'video/webm', 'accept-ranges': 'bytes', 'content-length': String(body.length) } });
    const a = Number(m[1]), b = m[2] ? Math.min(Number(m[2]), body.length - 1) : body.length - 1;
    return route.fulfill({ status: 206, body: body.subarray(a, b + 1), headers: { 'content-type': 'video/webm', 'accept-ranges': 'bytes', 'content-range': `bytes ${a}-${b}/${body.length}`, 'content-length': String(b - a + 1) } });
  });
  await page.evaluate(() => { const vEl = document.querySelector('[data-testid="vs-video"]'); vEl.load(); });
  await page.waitForTimeout(800);
  await page.getByTestId('vs-play').click();
  const cuts = (await v('get', { projectId: PID })).doc.cuts.filter(c => c.state === 'approved');
  const samples = [];
  for (let i = 0; i < 70; i++) { samples.push(await page.evaluate(() => { const e = document.querySelector('[data-testid="vs-video"]'); return { t: e.currentTime, paused: e.paused, src: e.dataset.src }; })); await sleep(250); }
  const last = samples[samples.length - 1];
  const inCut = samples.filter(x => !x.paused && cuts.some(c => x.t > c.s + 0.2 && x.t < c.e - 0.2));
  ok('the preview plays on for seventeen seconds — through more than one poll — without stopping', !last.paused && last.t > 12 && samples.every(x => x.src === src0), { t: last.t, paused: last.paused, srcs: new Set(samples.map(x => x.src)).size });
  ok('…and never shows what was cut (the opening silence, the fillers)', inCut.length === 0 && samples[2].t > 2, { inCut: inCut.slice(0, 3), first: samples.slice(0, 3) });
  const label = await page.getByTestId('vs-time').innerText();
  ok('…with the edited video\'s clock on the controls', /^\d+:\d\d \/ \d+:\d\d$/.test(label.trim()), label);
  await page.getByTestId('vs-play').click();
  await page.unroute(u => u.href === src0);
}
await page.locator('[data-panel="transcript"]').click();
await page.getByTestId('vs-transcript').waitFor({ timeout: 20_000 });
const words = await page.locator('.vs-w').count();
ok('5 · the transcript appears, word by word', words > 1500, String(words));
await page.getByTestId('vs-search').fill('pipeline');
await page.waitForTimeout(400);
ok('…and can be searched', (await page.locator('.vs-w.hit').count()) > 3);
await page.getByTestId('vs-search').fill('');

/* ── 6 · Cleanup suggestions ── */
await page.locator('[data-panel="cleanup"]').click();
const summary = await page.getByTestId('vs-cleanup-summary').innerText();
const doc = S.doc;
ok('6 · cleanup is suggested: fillers, pauses, repeats, each with a reason and confidence', /filler/.test(summary) && /pause/.test(summary) && doc.cuts.some(c => c.kind === 'repeat' && c.state === 'proposed') && doc.cuts.every(c => c.reason && c.conf > 0), summary);
ok('…the opening silence is cut down', doc.cuts.some(c => c.id === 'gap--1' && c.state === 'approved'));
const firstProp = page.locator('.vs-item.prop').first();
const propId = await firstProp.getAttribute('data-cut');
await firstProp.locator('[data-act="approve"]').click();
await page.waitForTimeout(1200);
ok('…a suggestion can be approved', (await v('get', { projectId: PID })).doc.cuts.find(c => c.id === propId)?.state === 'approved');

/* ── 7 · Four distinct Shorts ── */
S = await v('get', { projectId: PID });
const clips = S.doc.clips;
const overlap = (a, b) => Math.max(0, Math.min(a.e, b.e) - Math.max(a.s, b.s));
ok('7 · four Shorts', clips.length === 4, clips.map(c => c.title));
ok('…on four different topics', new Set(clips.map(c => c.topic.toLowerCase())).size === 4, clips.map(c => c.topic));
ok('…sharing no footage', clips.every((a, i) => clips.every((b, j) => i === j || overlap(a, b) <= 1)), clips.map(c => [c.s, c.e]));
ok('…each 30–65 s, with a title, a reason and editorial scores', clips.every(c => c.e - c.s >= 25 && c.e - c.s <= 65 && c.title && c.reason) && clips.filter(c => c.by === 'ai').every(c => c.scores && c.scores.hook >= 1));
await page.locator('[data-panel="shorts"]').click();
ok('…shown with timestamps, topics and reasons', (await page.getByTestId('vs-clip').count()) === 4 && /Topic:/.test(await page.getByTestId('vs-shorts').innerText()));

/* ── 8 · Edit one Short ── */
const target = clips[1];
const outBefore = S.outputs.find(o => o.clipId === target.id);
await page.locator(`[data-clip="${target.id}"] [data-act="start-later"]`).click();
await page.waitForTimeout(1500);
S = await v('get', { projectId: PID });
const edited = S.doc.clips.find(c => c.id === target.id);
const staleOut = S.outputs.find(o => o.clipId === target.id);
ok('8 · a Short is edited (starts a sentence later), and says it needs rendering again', edited.s > target.s && staleOut.stale, { before: target.s, after: edited.s, stale: staleOut.stale });
await page.locator(`[data-clip="${target.id}"] [data-act="rerender"]`).click();
for (let i = 0; i < 120; i++) { S = await v('status', { projectId: PID, knownVersion: -1 }); const o = S.outputs.find(x => x.clipId === target.id); if (!o.stale && o.status === 'needs_review' && o.version > outBefore.version) break; await sleep(2500); }
const reOut = S.outputs.find(o => o.clipId === target.id);
ok('…and renders again', reOut.version > outBefore.version && !reOut.stale, reOut);

/* ── 9 · Captions stay in sync ── */
{
  const srt = await (await fetch(reOut.srtUrl, { headers: { Connection: 'close' } })).text();
  const first = srt.split('\n\n')[0].split('\n');
  const startS = first[1]?.split(' --> ')[0] ?? '';
  const startSec = Number(startS.slice(0, 2)) * 3600 + Number(startS.slice(3, 5)) * 60 + Number(startS.slice(6, 8)) + Number(startS.slice(9)) / 1000;
  const firstWord = LONG.script.words.find(w => w.s >= edited.s - 0.05);
  ok('9 · the edited Short\'s captions start at its new first word, at the start of the video', startSec < 0.6 && first[2]?.split(' ')[0]?.replace(/[^\w]/g, '').toLowerCase() === firstWord.w.replace(/[^\w]/g, '').toLowerCase(), { first, word: firstWord.w });
  const mp4 = await download(reOut.mp4Url, 'short-edited.mp4');
  const d = Number(probe(mp4.file).format.duration);
  const cues = srt.trim().split('\n\n').map(b => b.split('\n')[1]?.split(' --> ')[1]).filter(Boolean);
  const lastEnd = cues.length ? (([h, m, s]) => h * 3600 + m * 60 + s)(cues[cues.length - 1].replace(',', '.').split(':').map(Number)) : 0;
  ok('…and the last caption ends with the video, not after it', lastEnd <= d + 0.5 && lastEnd > d - 3, { lastEnd, d });
}

/* ── 10–11 · PNG thumbnails, really PNG ── */
{
  const all = S.outputs.flatMap(o => o.thumbs.map(t => ({ o, t })));
  ok('10 · three thumbnails for every video', S.outputs.every(o => o.thumbs.length >= 3), S.outputs.map(o => o.thumbs.length));
  let pngs = 0, bad = '';
  for (const { o, t } of all.slice(0, 15)) {
    const r = await fetch(t.downloadUrl, { headers: { Connection: 'close' } });
    const b = Buffer.from(await r.arrayBuffer());
    const [w, h] = isPng(b) ? pngSize(b) : [0, 0];
    const want = o.kind === 'long' ? [1280, 720] : [1080, 1920];
    if (isPng(b) && w === want[0] && h === want[1] && r.headers.get('content-type') === 'image/png' && /\.png"/.test(r.headers.get('content-disposition') ?? '')) pngs++; else bad = `${o.kind} ${w}x${h} ${r.headers.get('content-type')}`;
  }
  ok('11 · every thumbnail downloads as a real PNG (signature, IHDR, IEND, size, type, .png)', pngs === Math.min(15, all.length), bad);
  ok('…and says it was checked', all.every(({ t }) => t.verified && /PNG \d+×\d+/.test(t.check)));
  const decode = path.join(state, 'decoded.png');
  const t0x = await download(all[0].t.downloadUrl, 'thumb.png');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', t0x.file, decode]);
  ok('…and decodes', fs.statSync(decode).size > 1000);
  await page.locator('[data-panel="exports"]').click();
  const long = page.locator('[data-kind="long"][data-testid="vs-board-row"]');
  await long.locator('[data-act="board-more-thumbs"]').click();
  for (let i = 0; i < 60; i++) { S = await v('status', { projectId: PID, knownVersion: -1 }); if (S.outputs.find(o => o.kind === 'long').thumbs.some(t => t.set === 2)) break; await sleep(2000); }
  const set2 = S.outputs.find(o => o.kind === 'long').thumbs.filter(t => t.set === 2);
  ok('…"Create another set" makes three more, also checked PNGs', set2.length === 3 && set2.every(t => t.verified), set2.length);
  const first = S.outputs.find(o => o.kind === 'long').thumbs;
  ok('…genuinely different layouts — the trending ones: face + big words, callout, cinematic', new Set(first.filter(t => t.set === 1).map(t => t.layout)).size === 3 && first.some(t => t.layout === 'bold') && first.some(t => t.layout === 'callout'), first.map(t => t.layout));
  ok('…each made from three to five words, kept with the PNG so it can be edited', first.every(t => t.spec && t.spec.text.split(/\s+/).length <= 5 && t.spec.text.length > 0), first.map(t => t.spec?.text));
}

/* ── 12 · Metadata for each video, from its own words ── */
{
  const metas = S.outputs.map(o => ({ o, m: o.meta }));
  ok('12 · every video has titles, a description, keywords, tags, hashtags, a pinned comment and a CTA', metas.every(({ m }) => m.titles?.length && m.description && m.keywords?.length && m.tags?.length && m.hashtags?.length && m.pinnedComment && m.cta), metas.map(x => Object.keys(x.m)));
  ok('…no two videos share a title or description', new Set(metas.map(x => x.m.titles[0])).size === metas.length && new Set(metas.map(x => x.m.description)).size === metas.length);
  const right = S.outputs.filter(o => o.kind === 'short').every(o => {
    const c = S.doc.clips.find(x => x.id === o.clipId);
    const text = LONG.script.words.filter(w => w.s >= c.s - 0.1 && w.e <= c.e + 0.1).map(w => w.w).join(' ').toLowerCase();
    const topic = (o.meta.titles[0].match(/prospecting|pipeline|follow|cost|\$49|book/i) ?? [''])[0].toLowerCase();
    return topic && text.includes(topic.replace('follow', 'follow').replace('cost', 'cost'));
  });
  ok('…and each Short\'s title is about what that Short says', right, S.outputs.map(o => o.meta.titles?.[0]));
  const longMeta = S.outputs.find(o => o.kind === 'long').meta;
  ok('…the long video has chapters (0:00 first) in its description', longMeta.chapters?.length >= 3 && longMeta.chapters[0].s === 0 && /0:00 /.test(longMeta.description), longMeta.chapters);
  const board = await page.getByTestId('vs-outputs-board').innerText();
  ok('…shown on the board under the editor, each video with its words, keywords, hashtags and timeline', board.includes(S.outputs.find(o => o.kind === 'long').meta.titles[0]) && /Keywords/i.test(board) && /Hashtags/i.test(board) && (await page.getByTestId('vs-board-chapters').count()) === 1, board.slice(0, 400));
}

/* ── 13–14 · Real MP4 exports ── */
{
  const longOut = S.outputs.find(o => o.kind === 'long');
  const lf = await download(longOut.downloadUrl, 'long.mp4');
  const lp = probe(lf.file);
  const ld = Number(lp.format.duration);
  const vs = lp.streams.find(s => s.codec_type === 'video'), as = lp.streams.find(s => s.codec_type === 'audio');
  ok('13 · the long video downloads as a real MP4: H.264 and AAC, as an attachment', lf.status === 200 && vs?.codec_name === 'h264' && as?.codec_name === 'aac' && /attachment; filename=".+\.mp4"/.test(lf.disposition), { v: vs?.codec_name, a: as?.codec_name, disp: lf.disposition });
  ok('…cleaned: shorter than the recording by what was cut', ld < LONG.script.duration - 20 && ld > LONG.script.duration * 0.6, { ld, src: LONG.script.duration });
  /* The music is a 330 Hz tone, the voice 220 Hz: the strength of the sound
     at exactly 330 Hz (Goertzel, first two minutes) is the music, and the
     recording itself has none. A band-pass filter is too wide for this — the
     voice leaks through it. */
  const at330 = f => {
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-t', '120', '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { maxBuffer: 1 << 28 });
    const n = raw.length / 2, k = 2 * Math.cos(2 * Math.PI * 330 / 8000);
    let s1 = 0, s2 = 0;
    for (let i = 0; i < n; i++) { const x = raw.readInt16LE(i * 2) / 32768 + k * s1 - s2; s2 = s1; s1 = x; }
    return Math.sqrt(s1 * s1 + s2 * s2 - k * s1 * s2) / n;
  };
  const withMusic = at330(lf.file), without = at330(LONG.file);
  ok('…with the music really under it (heard at its own pitch, absent from the recording)', withMusic > without * 30, { withMusic, without });
  let shorts = 0;
  for (const o of S.outputs.filter(x => x.kind === 'short')) {
    const f = await download(o.downloadUrl, `${o.id}.mp4`);
    const p = probe(f.file); const vv = p.streams.find(s => s.codec_type === 'video');
    if (vv?.width === 1080 && vv?.height === 1920 && Math.abs(Number(p.format.duration) - o.duration) < 1) shorts++;
  }
  ok('14 · every Short downloads as a 1080×1920 MP4 of the length shown', shorts === 4, shorts);
}

/* ── The board: one row per video, with its preview, thumbnail and files ── */
{
  await page.goto(`${B}/video-studio/${PID}`, { waitUntil: 'networkidle' });
  await page.getByTestId('vs-outputs-board').scrollIntoViewIfNeeded();
  const rows = page.getByTestId('vs-board-row');
  ok('the board under the editor has a row for every video, each with a playable preview and its chosen thumbnail', (await rows.count()) === S.outputs.length && (await page.getByTestId('vs-board-video').count()) === S.outputs.length);
  const dl = page.waitForEvent('download');
  await rows.first().locator('[data-act="export-xml"]').click();
  const xmlFile = path.join(state, 'cuts.xml');
  await (await dl).saveAs(xmlFile);
  const xml = fs.readFileSync(xmlFile, 'utf8');
  ok('Export XML is a Premiere / Resolve timeline of the cuts, pointing at the recording', /<xmeml version="4">/.test(xml) && (xml.match(/<clipitem id="v-/g) ?? []).length >= 2 && xml.includes('talk-20.mp4'), xml.slice(0, 300));
  const short = rows.filter({ has: page.locator('[data-act="duplicate"]') }).first();
  const before = (await v('get', { projectId: PID })).doc.clips.length;
  await short.locator('[data-act="duplicate"]').click();
  await page.waitForTimeout(1500);
  const after = await v('get', { projectId: PID });
  ok('Duplicate makes a copy of a Short beside it, to try another version', after.doc.clips.length === before + 1 && after.doc.clips.some(c => /\(copy\)/.test(c.title)));
  await v('edit', { projectId: PID, baseVersion: after.docVersion, ops: [{ op: 'clip.remove', id: after.doc.clips.find(c => /\(copy\)/.test(c.title)).id }] });
}

/* ── Design a thumbnail, on screen ── */
{
  await page.reload({ waitUntil: 'networkidle' });
  const row = page.getByTestId('vs-board-row').filter({ has: page.locator('[data-act="duplicate"]') }).first();
  const oid = await row.getAttribute('data-output');
  await row.locator('[data-act="design-thumb"]').click();
  await page.getByTestId('vs-thumb-designer').waitFor({ timeout: 10_000 });
  await page.locator('[data-layout="callout"]').click();
  await page.getByTestId('vs-thumb-text').fill('Big news for owners');
  await page.getByTestId('vs-thumb-designer').getByRole('button', { name: 'news', exact: true }).click();
  const preview = await page.getByTestId('vs-thumb-preview').innerText();
  ok('the designer shows the thumbnail as it is being made — layout, words, the highlighted word', /BIG NEWS FOR OWNERS/.test(preview.replace(/\s+/g, ' ')), preview);
  await page.locator('[data-act="make-thumb"]').click();
  await page.getByTestId('vs-thumb-designer').waitFor({ state: 'detached', timeout: 120_000 });
  const o = (await v('get', { projectId: PID })).outputs.find(x => x.id === oid);
  const made = o.thumbs[o.chosenThumb];
  ok('…"Make the PNG" draws it in the engine, checks it, and makes it the chosen thumbnail', made && made.set > 100 && made.verified && made.spec?.layout === 'callout' && made.spec?.text === 'Big news for owners' && made.spec?.highlight.toLowerCase() === 'news', made);
  const png = Buffer.from(await (await fetch(made.downloadUrl, { headers: { Connection: 'close' } })).arrayBuffer());
  ok('…and it is a real 1080×1920 PNG', isPng(png) && pngSize(png).join() === '1080,1920');
}

/* ── Statuses, the calendar ── */
{
  const [o1, o2] = S.outputs.filter(o => o.kind === 'short');
  await v('set_status', { projectId: PID, outputId: o1.id, status: 'approved' });
  const day = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
  await v('set_status', { projectId: PID, outputId: o2.id, status: 'ready_to_publish', publishAt: `${day}T12:00:00Z` });
  await page.goto(`${B}/video-studio?tab=publish`, { waitUntil: 'networkidle' });
  await page.getByTestId('vs-publish').waitFor({ timeout: 10_000 });
  const pub = await page.getByTestId('vs-publish').innerText();
  ok('the Ready to Publish calendar shows the planned Short, "ready to publish manually" — never "published"', /Ready to publish manually/.test(pub) && pub.includes(o2.title.slice(0, 20)) && !/\bPublished\b/.test(pub), pub.slice(0, 400));
}

/* ── 15 · Content Library ── */
await page.goto(`${B}/social-automation`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Content library/i }).first().click().catch(() => {});
await page.getByTestId('content-videos').waitFor({ timeout: 10_000 }).catch(() => {});
const shelf = await page.getByTestId('content-videos').innerText().catch(() => '');
ok('15 · the Shorts and the long video are in the Content Library, with statuses', /Shorts 4/.test(shelf) && /Long videos 1/.test(shelf) && /Approved|Needs review/.test(shelf), shelf.slice(0, 300));

/* ── 16–17 · The Autopilot project ── */
{
  await page.goto(`${B}/autopilot?project=${AP}&tab=assets`, { waitUntil: 'networkidle' });
  await page.getByTestId('project-videos').waitFor({ timeout: 15_000 }).catch(() => {});
  const assets = await page.getByTestId('project-videos').innerText().catch(() => '');
  ok('16 · the Autopilot project\'s Assets tab shows the video and "✨ 4 Shorts created"', /Weekly growth show/.test(assets) && /4 Shorts created/.test(assets), assets.slice(0, 300));
  const runs = await api('autopilot.php', { token: T, accountId: A, action: 'agent_runs', projectId: AP });
  const lines = (runs.runs ?? []).map(r => `${r.detail} → ${r.link?.route ?? ''}`);
  ok('17 · Autopilot\'s activity says "✨ 4 Shorts created", linked to the real Shorts', lines.some(l => /4 Shorts created/.test(l) && l.includes(`/video-studio/${PID}?tab=shorts`)), lines);
  ok('…once, not on every look', lines.filter(l => /Shorts created/.test(l)).length === 1, lines);
}

/* ── The assistant, undo and redo ── */
{
  await page.goto(`${B}/video-studio/${PID}?tab=assistant`, { waitUntil: 'networkidle' });
  await page.getByTestId('vs-command').fill('Make captions smaller');
  await page.getByTestId('vs-command').press('Enter');
  await page.waitForTimeout(2000);
  const chat = await page.getByTestId('vs-assistant').innerText();
  const after = await v('get', { projectId: PID });
  ok('the assistant does what it is asked ("make captions smaller")', /smaller/i.test(chat) && after.doc.captions.short.size < 1, chat.slice(-200));
  await page.getByTestId('vs-command').fill('Make the background music quieter');
  await page.getByTestId('vs-command').press('Enter');
  await page.waitForTimeout(1800);
  const quieter = await v('get', { projectId: PID });
  ok('…"make the background music quieter" turns the music down', quieter.doc.music && quieter.doc.music.volume < after.doc.music.volume, [after.doc.music?.volume, quieter.doc.music?.volume]);
  const before = quieter.docVersion;
  await page.getByRole('button', { name: 'Undo' }).click();
  /* Going to a version also re-credits and re-queues the videos, which takes
     a moment while the engine is busy: wait for it rather than a fixed time. */
  let undone;
  for (let i = 0; i < 40; i++) { undone = await v('get', { projectId: PID }); if (undone.docVersion !== before) break; await sleep(500); }
  ok('undo goes back a version — straight after an assistant command, too', undone.docVersion === before - 1 && undone.doc.music.volume === after.doc.music.volume, { before, undone: undone.docVersion, vol: [after.doc.music?.volume, undone.doc.music?.volume] });
  await page.getByRole('button', { name: 'Redo' }).click();
  let redone;
  for (let i = 0; i < 40; i++) { redone = await v('get', { projectId: PID }); if (redone.docVersion === before) break; await sleep(500); }
  ok('…and redo comes forward again', redone.docVersion === before, redone.docVersion);
}

/* ── Noise and music, asked for in one sentence (the request that was refused) ── */
{
  await page.getByTestId('vs-command').fill('remove the background noise completely and also add upbeat background music to all the videos');
  await page.getByTestId('vs-command').press('Enter');
  await page.waitForTimeout(4000);
  const d = await v('get', { projectId: PID });
  const said = await page.getByTestId('vs-assistant').innerText();
  ok('"remove the background noise … and also add music to all the videos" does both', d.doc.audio.denoise === 'strong' && d.doc.music?.applyTo === 'all' && !/can't|cannot|not able/i.test(said.split('\n').slice(-4).join(' ')), { audio: d.doc.audio, music: d.doc.music?.title, said: said.slice(-300) });
  ok('…and every video says it needs rendering again', d.outputs.every(o => o.stale), d.outputs.map(o => o.stale));
  ok('…by searching the library for that mood', openverse.state.searches.some(q => /upbeat/.test(q)), openverse.state.searches);
}

/* ── The Audio and Music panels ── */
{
  await page.locator('[data-panel="audio"]').click();
  const audio = await page.getByTestId('vs-audio-panel').innerText();
  ok('the Audio panel shows the noise level chosen, voice clarity and loudness — and says they are heard in the render', /Strong/.test(audio) && /Voice clarity/.test(audio) && /Even loudness/.test(audio) && /applied when the videos render/.test(audio));
  await page.locator('[data-denoise="light"]').click();
  await page.waitForTimeout(1200);
  ok('…a level can be picked there', (await v('get', { projectId: PID })).doc.audio.denoise === 'light');
  await page.locator('[data-panel="music"]').click();
  await page.getByTestId('vs-music-q').fill('calm');
  await page.getByTestId('vs-music-search').click();
  await page.getByTestId('vs-music-results').waitFor({ timeout: 10_000 });
  const res = await page.getByTestId('vs-music-results').innerText();
  ok('the royalty-free search lists CC0 and CC BY tracks with their licence — not the NonCommercial one', /Calm Morning/.test(res) && /CC0/.test(res) && /Gentle Steps/.test(res) && /CC BY 4\.0/.test(res) && !/Not For Business/.test(res), res);
  const found = await v('music_search', { projectId: PID, q: 'calm' });
  const listen = await fetch(found.tracks[0].previewUrl, { headers: { Connection: 'close' } });
  ok('…a track is heard through this Worker, never straight from the library', found.tracks[0].previewUrl.startsWith(`${B}/api/video-file.php`) && listen.status === 200 && /audio\//.test(listen.headers.get('content-type') ?? '') && (await listen.arrayBuffer()).byteLength > 10_000, { url: found.tracks[0].previewUrl.slice(0, 60), status: listen.status });
  await page.locator('[data-track="0b1c2d3e-0000-4000-8000-000000000002"] [data-act="use-track"]').click();
  await page.getByTestId('vs-music-current').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  const by = await v('get', { projectId: PID });
  ok('…choosing a CC BY track puts it under the videos and writes its credit into every description', by.doc.music?.title === 'Gentle Steps' && /CC BY/.test(by.doc.music.license) && by.outputs.every(o => /Music: “Gentle Steps” by Ben Keys/.test(o.meta.description ?? '')), by.outputs.map(o => (o.meta.description ?? '').slice(-120)));
  const forged = await v('edit', { projectId: PID, baseVersion: by.docVersion, ops: [{ op: 'music.set', track: { id: 'x', key: 'v/elsewhere/song.mp3', title: 'Pirated hit', license: 'CC0' } }] });
  ok('…a track cannot be set from the browser — only the server chooses one it fetched', (await v('get', { projectId: PID })).doc.music.title === 'Gentle Steps', forged);
  const up = await v('music_upload_url', { projectId: PID });
  const mp3 = fs.readFileSync(path.join(state, 'fixtures', 'music', '0b1c2d3e-0000-4000-8000-000000000001.mp3'));
  await fetch(`${up.url}&name=track.mp3&type=audio%2Fmpeg`, { method: 'PUT', body: mp3, headers: { Connection: 'close' } });
  const noRights = await v('music_attach', { projectId: PID, baseVersion: by.docVersion, key: `${up.prefix}track.mp3`, title: 'My jingle' });
  ok('your own track needs the rights box ticked — refused on that box', !noRights.success && noRights.field === 'video.musicRights', noRights);
  const yes = await v('music_attach', { projectId: PID, baseVersion: by.docVersion, key: `${up.prefix}track.mp3`, title: 'My jingle', rightsConfirmed: true });
  ok('…and with it, the upload is used and recorded as yours', yes.success && yes.doc.music.source === 'upload' && yes.doc.music.license === 'Your own upload', yes);
  const up2 = await v('music_upload_url', { projectId: PID });
  await fetch(`${up2.url}&name=track.mp3&type=audio%2Fmpeg`, { method: 'PUT', body: Buffer.from('<html>not audio</html>'.repeat(10)), headers: { Connection: 'close' } });
  const notAudio = await v('music_attach', { projectId: PID, baseVersion: yes.docVersion, key: `${up2.prefix}track.mp3`, title: 'x', rightsConfirmed: true });
  ok('…a file that is not audio is refused from its bytes', !notAudio.success && notAudio.field === 'video.musicFile', notAudio);
}

/* ── Reuse: posts, an article and emails; the quiz on screen ── */
{
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-panel="reuse"]').click();
  await page.getByTestId('vs-reuse').waitFor({ timeout: 10_000 });
  ok('the quiz is on the Reuse tab, downloadable', (await page.getByTestId('vs-quiz').locator(':scope > li').count()) === 5 && (await page.locator('[data-act="quiz-csv"]').count()) === 1);
  await page.locator('[data-act="repurpose"]').click();
  let R;
  for (let i = 0; i < 60; i++) { R = await v('status', { projectId: PID, knownVersion: -1 }); if (R.extras?.repurposed) break; await sleep(1500); }
  const links = R.extras?.repurposed?.links ?? [];
  ok('Repurpose writes 3 posts, a blog article and an email series from the recording — as drafts', links.map(l => l.kind).sort().join(',') === 'blog-post,sequence,social-post' && /3 posts/.test(links.find(l => l.kind === 'social-post')?.label ?? ''), R.extras?.repurposed);
  await page.getByTestId('vs-repurposed').waitFor({ timeout: 20_000 });
  ok('…linked from the Reuse tab to where each draft lives', (await page.getByTestId('vs-repurposed').locator('a').count()) === 3);
  const runs = await api('autopilot.php', { token: T, accountId: A, action: 'agent_runs', projectId: AP });
  ok('…and recorded on the Autopilot project\'s activity', (runs.runs ?? []).some(r => /From “Weekly growth show/.test(r.detail ?? '')), (runs.runs ?? []).map(r => r.detail).slice(0, 6));
}

/* ── AI Shorts and Repurposing, inside the studio ── */
{
  await page.goto(`${B}/ai-shorts`, { waitUntil: 'networkidle' });
  ok('the old AI Shorts address opens Quick Shorts inside AI Video Studio', /\/video-studio\?tab=quick-shorts/.test(page.url()) && (await page.getByTestId('vs-embed-quick-shorts').count()) === 1, page.url());
  await page.goto(`${B}/social-automation`, { waitUntil: 'networkidle' });
  ok('…and Repurposing opens in its Repurpose tab', /\/video-studio\?tab=repurpose/.test(page.url()) && (await page.getByTestId('vs-embed-repurpose').count()) === 1, page.url());
}

/* ── A Short with every new effect, rendered ── */
{
  let D = await v('get', { projectId: PID });
  const target2 = D.outputs.find(o => o.kind === 'short' && o.clipId === target.id);
  const c2 = D.doc.clips.find(c => c.id === target.id);
  const r = await v('edit', { projectId: PID, baseVersion: D.docVersion, ops: [
    { op: 'look.set', target: 'short', patch: { filter: 'bw', vignette: 20 } },
    { op: 'motion.set', target: 'short', patch: { speed: 1.25, zoom: 'punch', transition: 'flash', fadeIn: 0.5, fadeOut: 0.5, progressBar: true } },
    { op: 'overlay.add', s: c2.s + 1, e: c2.s + 4, text: 'Watch this', style: 'title', anim: 'pop' },
  ], note: 'effects' });
  ok('look, motion and words on screen are saved as one version, and the Short says it needs rendering', r.success && r.doc.look.short.filter === 'bw' && r.doc.motion.short.speed === 1.25 && r.doc.overlays.length === 1);
  const kept = D.outputs.find(o => o.id === target2.id).duration;
  const rq = await v('render', { projectId: PID, outputIds: [target2.id] });
  ok('…and Render queues it', rq.success && rq.queued === 1, rq);
  /* It may wait behind the renders the music change queued for every video, the 15-minute one included. */
  let R2;
  for (let i = 0; i < 480; i++) { R2 = await v('status', { projectId: PID, knownVersion: -1 }); const o = R2.outputs.find(x => x.id === target2.id); if (!o.stale && o.status === 'needs_review' && !R2.jobs.some(j => j.target === o.id && (j.state === 'queued' || j.state === 'running'))) break; await sleep(2500); }
  const o2 = R2.outputs.find(x => x.id === target2.id);
  const f = await download(o2.downloadUrl, 'short-effects.mp4');
  const d = Number(probe(f.file).format.duration);
  ok('…rendered at 1.25×: the Short is that much shorter', Math.abs(d - kept / 1.25) < 0.8, { d, kept, status: o2.status, stale: o2.stale });
  const sat = (() => { const out = String(execFileSync('sh', ['-c', `ffmpeg -hide_banner -ss ${Math.min(5, d / 2)} -i "${f.file}" -frames:v 1 -vf signalstats,metadata=print -f null - 2>&1 | grep SATAVG | head -1`])); return Number(out.split('=').pop()); })();
  ok('…in black and white (no colour left in the picture)', sat < 4, sat);
  const srt = await (await fetch(o2.srtUrl, { headers: { Connection: 'close' } })).text();
  const lastEnd = (([h, m, s2]) => h * 3600 + m * 60 + s2)(srt.trim().split('\n\n').pop().split('\n')[1].split(' --> ')[1].replace(',', '.').split(':').map(Number));
  ok('…and its captions re-timed to the new speed (they end with the video)', lastEnd <= d + 0.5 && lastEnd > d - 3, { lastEnd, d });
  await page.goto(`${B}/video-studio/${PID}`, { waitUntil: 'networkidle' });
  ok('the inspector is an icon rail: Video, Adjust, Animation, Tracking, Text, Audio, Music, Captions, Reuse, Export', (await page.locator('.vse-rail-btn').count()) === 10);
  await page.locator('[data-panel="adjust"]').click();
  ok('Adjust offers ten filters and the colour sliders', (await page.locator('.vs-filter').count()) === 10 && /Temperature[\s\S]*Exposure[\s\S]*Vignette/.test(await page.getByTestId('vs-adjust-panel').innerText()));
  await page.locator('[data-panel="tracking"]').click();
  ok('Tracking says what it found in this recording — no faces in a test picture, so nothing to follow', /No faces found/.test(await page.getByTestId('vs-tracking-panel').innerText()), await page.getByTestId('vs-tracking-panel').innerText());
  await page.locator('[data-panel="text"]').click();
  ok('Text lists the words on screen with their times', /Watch this/.test(await page.getByTestId('vs-text-panel').innerHTML()));
  await page.locator('[data-media="' + target.id + '"]').click();
  await page.waitForTimeout(500);
  ok('the preview shows the look (black and white) and the speed on the Short', (await page.getByTestId('vs-video').getAttribute('data-look')) === 'bw' && /1\.25×/.test(await page.getByTestId('vs-preview').innerText()));
  const before = (await v('get', { projectId: PID })).doc.clips.find(c => c.id === target.id);
  await page.locator(`[data-clip-block="${target.id}"].on`).waitFor({ timeout: 5000 });
  const handle = page.locator(`[data-clip-block="${target.id}"] [data-edge="e"]`);
  const hb = await handle.boundingBox();
  const bb = await page.locator(`[data-clip-block="${target.id}"]`).boundingBox();
  /* Five seconds' worth of pixels at whatever zoom the timeline is on — too
     little snaps back to the sentence it started on, too much (zoomed out, a
     pixel is a second or two) leaves a Short too short to keep. */
  const px = Math.max(2, Math.round(5 * bb.width / (before.e - before.s)));
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 - px, hb.y + hb.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  const trimmed = (await v('get', { projectId: PID })).doc.clips.find(c => c.id === target.id);
  ok('a Short is trimmed by dragging its edge on the timeline', trimmed.e < before.e - 0.3 && trimmed.e - trimmed.s >= 3 && Math.abs(trimmed.s - before.s) < 0.01, { before: [before.s, before.e], after: [trimmed.s, trimmed.e] });
}

/* ── 18 · Reopen ── */
{
  const p2 = await ctx.newPage();
  await p2.goto(`${B}/video-studio/${PID}?tab=shorts`, { waitUntil: 'networkidle' });
  await p2.getByTestId('vs-shorts').waitFor({ timeout: 15_000 });
  const re = await v('get', { projectId: PID });
  ok('18 · reopening keeps every edit: the moved Short, the approved cut, the caption size, the sound and the music', Math.abs(re.doc.clips.find(c => c.id === target.id).s - edited.s) < 0.01 && re.doc.cuts.find(c => c.id === propId)?.state === 'approved' && re.doc.captions.short.size < 1 && re.doc.audio.denoise === 'light' && re.doc.music?.source === 'upload');
  const versions = await v('versions', { projectId: PID });
  ok('…with the history of what changed', versions.versions.length >= 5 && versions.versions.some(x => /Short starts later/.test(x.note)), versions.versions.map(x => x.note).slice(0, 6));
  await p2.close();
}

/* ── 19 · Another workspace ── */
{
  const BEA = { email: 'bea@video.test', pw: 'Another-horse-7-video', name: 'Bea Other', biz: 'Bea Bakes' };
  const reg = await api('auth.php', { action: 'register', email: BEA.email, password: BEA.pw, name: BEA.name, businessName: BEA.biz });
  const bl = await api('auth.php', { action: 'login', email: BEA.email, password: BEA.pw });
  const who = { T: bl.token, A: reg.user?.accountId };
  const list = await v('list', {}, who);
  const lib = await v('library', {}, who);
  const peek = await v('get', { projectId: PID }, who);
  const poke = await v('edit', { projectId: PID, baseVersion: 1, ops: [{ op: 'clip.remove', id: target.id }] }, who);
  const del = await v('delete', { projectId: PID }, who);
  const asA = await api('video.php', { token: who.T, accountId: A, action: 'list' });
  ok('19 · another workspace sees none of the projects, videos or words', list.projects?.length === 0 && lib.items?.length === 0 && peek.code === 'not_found' && poke.code === 'not_found' && del.code === 'not_found', { list: list.projects?.length, lib: lib.items?.length, peek: peek.code, poke: poke.code, del: del.code });
  ok('…and cannot name the other workspace to get in', !asA.success && asA.code === 'not_yours', asA);
  /* A link from now: every video has been rendered again since S was read, and only the latest file is kept. */
  const url = new URL((await v('get', { projectId: PID })).outputs.find(o => o.mp4Url).mp4Url);
  const t = url.searchParams.get('t');
  const [body, sig] = t.split('.');
  const g = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  const forged = Buffer.from(JSON.stringify({ ...g, a: who.A, k: g.k.replace(`v/${g.a}/`, `v/${who.A}/`) })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const r1 = await fetch(`${B}/api/video-file.php?t=${forged}.${sig}`, { headers: { Connection: 'close' } });
  const r2 = await fetch(`${B}/api/video-file.php?t=${body}.${sig.slice(0, -2)}AA`, { headers: { Connection: 'close' } });
  const r3 = await fetch(`${B}/api/video-file.php?t=${t}`, { headers: { Connection: 'close', Range: 'bytes=0-99' } });
  ok('…a file link cannot be altered to reach another file (403), and a real one serves byte ranges', r1.status === 403 && r2.status === 403 && r3.status === 206, [r1.status, r2.status, r3.status]);
}

/* ── 20 · Failures: a transcriber error, the engine dying mid-render, no AI ── */
{
  whisper.server.close();
  whisper = await startWhisperMock(WH, SHORT.script);
  whisper.state.failNext = 1;
  gemini.state.fail = true;
  /* Charged before this project, so its own charges can be read apart from
     the renders the editing above asked for. */
  await waitReady(PID, { T, A }, 'long', 1500);
  const before = (await v('usage')).usage.used;
  const c = await v('create', { name: 'Retry test', prompt: 'Clean it and make two 20–40 second shorts, captions and thumbnails' });
  const buf = fs.readFileSync(SHORT.file);
  const st = await v('upload_start', { projectId: c.id, name: 'retry.mp4', size: buf.length, type: 'video/mp4', fileKey: `retry|${buf.length}` });
  for (let n = 1; n <= st.parts; n++) await fetch(`${st.partUrl}&part=${n}`, { method: 'PUT', body: buf.subarray((n - 1) * st.partSize, n * st.partSize), headers: { Connection: 'close' } });
  await v('upload_complete', { projectId: c.id, uploadId: st.uploadId });
  /* Kill the engine as soon as a render is under way; bring it back. */
  let killed = false;
  for (let i = 0; i < 400 && !killed; i++) {
    const s = await v('status', { projectId: c.id, knownVersion: -1 });
    if (s.jobs.some(j => j.kind === 'render' && j.state === 'running' && (j.progress ?? 0) > 5)) { engine.kill('SIGKILL'); killed = true; await sleep(3000); startEngine(); }
    else await sleep(1500);
  }
  ok('(the engine was killed in the middle of a render)', killed);
  const R = await waitReady(c.id, { T, A }, 'retry', 900);
  ok('20 · the transcriber\'s failure and the engine\'s death were retried to the end', R.project?.status === 'ready' && R.outputs.length === 3 && R.outputs.every(o => o.rendered), { status: R.project?.status, outs: R.outputs?.map(o => [o.kind, o.status, o.rendered]) });
  /* A step run here counts its failures (transcription failed once, then
     finished); an engine step counts its dispatches (a render sent twice). */
  const tj = R.jobs.find(j => j.kind === 'transcribe');
  ok('…by retrying the failed steps', tj?.attempts >= 1 && tj.state === 'done' && R.jobs.some(j => j.kind === 'render' && j.attempts > 1 && j.state === 'done'), R.jobs.map(j => `${j.kind}:${j.attempts}:${j.state}`));
  const used = (await v('usage')).usage.used;
  const outMin = R.outputs.reduce((n, o) => n + o.duration / 60, 0);
  const audio = used.audioMin - before.audioMin, render = used.renderMin - before.renderMin;
  ok('…with no second charge: its audio and render minutes are each counted once', Math.abs(audio - SHORT.script.duration / 60) < 0.5 && Math.abs(render - outMin) < 0.4, { audio, render, outMin, short: SHORT.script.duration / 60 });
  ok('…and no second file: one video per output', R.outputs.every(o => o.mp4Url && o.version === 1), R.outputs.map(o => o.version));
  ok('without AI, the Shorts and words are chosen by rule — and the screen says so', R.doc.clips.every(c => c.by === 'rules' && c.scores === null) && R.outputs.every(o => o.meta.by === 'rules') && /without AI|by rule/i.test(R.project.stageNote), { by: R.doc.clips.map(c => c.by), note: R.project.stageNote });
  gemini.state.fail = false;
}

/* ── Faces and the speaker: two people taking turns ── */
{
  const TWO = path.join(state, 'fixtures', 'two-faces.mp4');
  const two = fs.existsSync(TWO) ? { turns: [[0, 14, 'L'], [14, 28, 'R'], [28, 40, 'L']] } : makeTwoFaces(TWO, 40);
  void two;
  const c = await v('create', { name: 'Two speakers', prompt: 'Clean this recording and make one 30-40 second Short' });
  const buf = fs.readFileSync(TWO);
  const st = await v('upload_start', { projectId: c.id, name: 'two.mp4', size: buf.length, type: 'video/mp4', fileKey: `two|${buf.length}` });
  for (let n = 1; n <= st.parts; n++) await fetch(`${st.partUrl}&part=${n}`, { method: 'PUT', body: buf.subarray((n - 1) * st.partSize, n * st.partSize), headers: { Connection: 'close' } });
  await v('upload_complete', { projectId: c.id, uploadId: st.uploadId });
  let T2;
  for (let i = 0; i < 200; i++) { T2 = await v('status', { projectId: c.id, knownVersion: -1 }); if (T2.source.track?.ready || T2.source.track?.error) break; await sleep(2000); }
  const sum = T2.source.track?.summary;
  ok('faces are found in the recording: two people, the speaker changing twice', sum?.faces === 2 && sum?.switches?.speaker === 2, T2.source.track);
  T2 = await waitReady(c.id, { T, A }, 'two', 600);
  const thumbs = T2.outputs.flatMap(o => o.thumbs);
  ok('…and the thumbnails close in on a face (found in the frame)', thumbs.some(t => t.layout === 'bold' && t.face), thumbs.map(t => [t.layout, t.face]));
  const e1 = await v('edit', { projectId: c.id, baseVersion: T2.docVersion, ops: [{ op: 'clip.add', s: 0.5, e: 39.5, title: 'Who is talking' }, { op: 'tracking.set', target: 'short', mode: 'speaker' }] });
  const clipId = e1.doc.clips[e1.doc.clips.length - 1].id;
  let T3, out3;
  for (let i = 0; i < 200; i++) {
    T3 = await v('status', { projectId: c.id, knownVersion: -1 });
    out3 = T3.outputs.find(o => o.clipId === clipId);
    if (out3?.stale) await v('render', { projectId: c.id, outputIds: [out3.id] });
    if (out3?.rendered && !out3.stale && !T3.jobs.some(j => j.target === out3.id && (j.state === 'queued' || j.state === 'running'))) break;
    await sleep(2500);
  }
  const f = await download(out3.downloadUrl, 'speaker.mp4');
  const faceAt = t => {
    const png = path.join(state, `spk-${t}.png`);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(t), '-i', f.file, '-frames:v', '1', png]);
    return JSON.parse(String(execFileSync('python3', ['media/engine/track.py', '--image', png, ...(fs.existsSync(MODEL) ? ['--model', MODEL] : [])]))).faces[0];
  };
  /* Output time = source − 0.5 (the Short starts at 0.5 s). Left speaks 0–14 and 28–40, right 14–28;
     the right portrait is the larger one (360 px against 320). */
  const a = faceAt(6), b = faceAt(21), d2 = faceAt(34);
  ok('the 9:16 Short follows the speaker: the face is kept in the middle of the frame', [a, b, d2].every(x => x && Math.abs(x.x + x.w / 2 - 0.5) < 0.15), [a, b, d2]);
  ok('…and it is the person talking each time: left, then right (the larger face), then left again', b.h > a.h * 1.06 && b.h > d2.h * 1.06, { a: a?.h, b: b?.h, c: d2?.h });
}

/* ── A phone ── */
{
  const m = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = steady(await m.newPage());
  mp.on('pageerror', e => errs.push(`phone: ${e}`));
  await signIn(mp, OWNER);
  for (const url of [`/video-studio`, `/video-studio/${PID}`, `/video-studio/${PID}?tab=shorts`, `/video-studio/${PID}?tab=exports`, `/video-studio/${PID}?tab=music`, `/video-studio?new=1`, `/video-studio?tab=quick-shorts`, `/video-studio?tab=repurpose`]) {
    await mp.goto(`${B}${url}`, { waitUntil: 'networkidle' });
    await mp.waitForTimeout(1200);
    const over = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`on a phone, ${url} fits the screen (no sideways scroll)`, over <= 1, String(over));
  }
  await m.close();
}

ok('no page errors', !errs.length, errs.join(' | '));
await br.close();
console.log(`\n${out.filter(l => l.startsWith('PASS')).length} passed, ${failures} failed${restarts ? ` (local wrangler restarted ${restarts}×)` : ''}`);
stop();
process.exit(failures ? 1 : 0);
