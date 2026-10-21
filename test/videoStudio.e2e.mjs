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
import crypto from 'node:crypto';
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
/* The RNNoise model Studio Sound uses — the same pinned file the engine image carries (media/Dockerfile). Without it the engine uses its FFT denoiser and says so. */
const RNN = path.join(state, 'fixtures', 'rnnoise-std.rnnn');
if (!fs.existsSync(RNN)) { try { execFileSync('curl', ['-fsSL', '-o', RNN, 'https://raw.githubusercontent.com/richardpl/arnndn-models/0fda24c46d78f0207d820bb970fbe85c1971b39c/std.rnnn'], { stdio: 'ignore' }); } catch { /* FFT then */ } }
const startEngine = () => {
  engine = spawn('node', [path.resolve('media/engine/server.mjs')], {
    env: { ...process.env, PORT: String(ENG), MEDIA_ENGINE_SECRET: SECRET, ALLOW_HTTP_INPUTS: '1', WORK_DIR: path.join(state, 'engine-work'), MAX_RUNNING: '2', FACE_MODEL: MODEL, RNNOISE_MODEL: RNN },
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
/* This journey makes more recordings and Shorts than the trial's allowance
   (lib/allowances.ts); the owner raises the trial's counts, as Sign-ups &
   trials → Plans & allowances would. Minutes stay the trial's own. */
execSync(`npx wrangler d1 execute crmpro --local --persist-to ${persist} --command ${JSON.stringify("INSERT OR REPLACE INTO crm_plan_limits (plan_id, meter, value, updated_at) VALUES ('trial','long_videos',50,'t'),('trial','ai_shorts',200,'t'),('trial','ai_requests',5000,'t'),('trial','social_posts',200,'t'),('trial','blog_articles',50,'t'),('trial','ai_emails',500,'t')")}`, { stdio: 'ignore' });
const empty = await api('video.php', { token: T, accountId: '', action: 'list' });
ok('a request naming no workspace is refused before anything is looked up', empty.code === 'no_workspace', empty);
/* Local workerd now and then drops a request outright ("Network connection
   lost", no response at all) and keeps serving. A read is asked again; a
   write is not, because it may have landed. */
const READS = new Set(['status', 'get', 'list', 'capabilities']);
const v = async (action, extra = {}, who = { T, A }) => {
  for (let i = 0; ; i++) {
    try {
      const r = await api('video.php', { token: who.T, accountId: who.A, action, ...extra });
      /* No JSON at all (an error page from the dev proxy) is the same dropped request. */
      if (r.success !== undefined || !READS.has(action) || i >= 30) return r;
      await sleep(2000);
    }
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
ok('…and says honestly what works: transcription working, eye contact and publishing unavailable', /Transcription with word timings\s*Whisper[\s\S]*?Working/.test(caps) && /Eye-contact correction\s*Provider setup required\.[^\n]*\s*Unavailable/.test(caps) && /Direct publishing[\s\S]*?Unavailable/.test(caps), caps.slice(0, 800));
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
ok('the editor opens on the transcript — the main way to edit — beside the player, inspector, assistant and timeline', (await page.getByTestId('vs-transcript').count()) === 1 && (await page.getByTestId('vs-preview').count()) === 1 && (await page.getByTestId('vs-assistant').count()) === 1 && (await page.getByTestId('vs-timeline').count()) === 1);
await page.locator('[data-panel="media"]').click();
ok('…the media list holds the long video and every Short', (await page.locator('[data-media]').count()) >= 5, await page.getByTestId('vs-media').innerText());
ok('…the timeline shows the picture as a filmstrip, the words, the Shorts and the music', (await page.locator('.vse-frame').count()) > 5 && (await page.locator('.vse-block.cap').count()) > 20 && (await page.locator('.vse-block.short').count()) === 4 && (await page.locator('.vse-block.music').count()) >= 1);

/* ── The player: holds its video across polls and plays through the cuts ── */
{
  S = await v('get', { projectId: PID });
  const again = await v('status', { projectId: PID, knownVersion: -1 });
  ok('the proxy\'s link is the same from one poll to the next (it used to change every few seconds and restart the player)', S.source.proxyUrl === again.source.proxyUrl);
  /* This Chromium cannot decode H.264, so the proxy's bytes in R2 are
     replaced by the first two minutes of the same proxy as VP9 — same clock,
     same cuts — written the way the engine writes an output (a signed `put`
     link). The browser then reads it through the real Worker, with its
     range answers, exactly as in production; the old check served it from
     the test itself and so could never see the Worker's part in a stop. */
  const proxyFile = (await download(S.source.proxyUrl, 'proxy.mp4')).file;
  const webm = path.join(state, 'proxy-head-v2.webm');
  if (!fs.existsSync(webm)) execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', proxyFile, '-t', '120', '-vf', 'scale=480:-2', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '1200k', '-g', '30', '-c:a', 'libopus', '-b:a', '64k', webm]);
  const proxyKey = JSON.parse(Buffer.from(new URL(S.source.proxyUrl).searchParams.get('t').split('.')[0], 'base64url').toString()).k;
  const secret = JSON.parse(execSync(`npx wrangler d1 execute crmpro --local --persist-to ${persist} --json --command ${JSON.stringify("SELECT v FROM crm_meta WHERE k = 'video_url'")}`, { env: { ...process.env, CI: '1' } }).toString())[0].results[0].v;
  const putLink = prefix => {
    const body = Buffer.from(JSON.stringify({ a: proxyKey.split('/')[1], k: prefix, m: 'put', x: Math.ceil(Date.now() / 3_600_000 + 2) * 3600 })).toString('base64url');
    return `${B}/api/video-file.php?t=${body}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(body).digest('base64url').slice(0, 43)}`;
  };
  /* As the engine does: one PUT up to 16 MB, R2 multipart above. */
  const putProxy = async (buf, type) => {
    const u = `${putLink(proxyKey.slice(0, proxyKey.lastIndexOf('/') + 1))}&name=${proxyKey.slice(proxyKey.lastIndexOf('/') + 1)}&type=${encodeURIComponent(type)}`;
    const PART = 16 * 1024 * 1024;
    if (buf.length <= PART) return (await fetch(u, { method: 'PUT', body: buf, headers: { Connection: 'close' } })).ok;
    const { uploadId } = await (await fetch(`${u}&op=mpu-start`, { method: 'POST' })).json();
    const parts = [];
    for (let n = 1, off = 0; off < buf.length; n++, off += PART) parts.push({ partNumber: n, etag: (await (await fetch(`${u}&op=mpu-part&uploadId=${encodeURIComponent(uploadId)}&part=${n}`, { method: 'PUT', body: buf.subarray(off, off + PART) })).json()).etag });
    return (await fetch(`${u}&op=mpu-complete&uploadId=${encodeURIComponent(uploadId)}`, { method: 'POST', body: JSON.stringify({ parts }) })).ok;
  };
  ok('(the proxy in R2 is now the same picture as VP9, written through the Worker like an engine output)', await putProxy(fs.readFileSync(webm), 'video/webm'));
  const src0 = await page.getByTestId('vs-video').getAttribute('data-src');
  /* What the Worker answered for the proxy while it played. */
  const answers = [];
  page.on('response', r => { if (r.url() === src0 && r.request().headers().range) answers.push({ status: r.status(), range: r.headers()['content-range'] ?? '' }); });
  /* A cleaned recording has a cut every few seconds. Twenty more — the
     second word of every sentence in the first minute and a half — so the
     preview has to cross well over ten cuts while it is watched. */
  const base0 = await v('get', { projectId: PID });
  const extra = LONG.script.sentences.filter(x => x.s > 5 && x.s < 95).map(x => LONG.script.words.find(w => w.s > x.s + 0.05 && w.s < x.e)).filter(Boolean)
    .map(w => ({ op: 'cut.add', s: Math.round((w.s - 0.04) * 100) / 100, e: Math.round((w.e + 0.04) * 100) / 100, reason: 'Many cuts (test)' }));
  const many = await v('edit', { projectId: PID, baseVersion: base0.docVersion, ops: extra, note: 'many cuts' });
  ok('(twenty more cuts in the first minute and a half)', many.success && extra.length >= 15, { n: extra.length, many: many.error });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('vs-play').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  /* What a viewer would notice: the element on screen waiting for data, or
     a gap between two frames it presented, while it is meant to be playing. */
  await page.evaluate(() => {
    const vids = [...document.querySelectorAll('[data-testid="vs-video"] video, video[data-testid="vs-video"]')];
    const shown = el => vids.length === 1 || el.classList.contains('on');
    const m = window.__vsm = { waiting: 0, frames: [], on: false };
    for (const el of vids) {
      el.addEventListener('waiting', () => { if (m.on && shown(el)) m.waiting++; });
      const cb = (now, meta) => { if (m.on && shown(el)) m.frames.push([now, meta.mediaTime]); el.requestVideoFrameCallback(cb); };
      el.requestVideoFrameCallback(cb);
    }
  });
  const shownTime = () => page.evaluate(() => { const d = document.querySelector('[data-testid="vs-video"]'); const e = d.matches('video') ? d : d.querySelector('video.on'); return { t: e.currentTime, paused: e.paused, src: d.dataset.src }; });
  await page.evaluate(() => { window.__vsm.on = true; window.__vsm.t0 = performance.now(); });
  await page.getByTestId('vs-play').click();
  const cuts = (await v('get', { projectId: PID })).doc.cuts.filter(c => c.state === 'approved');
  const samples = [];
  for (let i = 0; i < 160; i++) { samples.push(await shownTime()); await sleep(250); }
  const meter = await page.evaluate(() => { const m = window.__vsm; m.on = false; const d = document.querySelector('[data-testid="vs-video"]'); return { waiting: m.waiting, frames: m.frames, swaps: d.dataset.swaps ?? '-', waits: d.dataset.waits ?? '-' }; });
  const last = samples[samples.length - 1];
  const inCut = samples.filter(x => !x.paused && cuts.some(c => x.t > c.s + 0.2 && x.t < c.e - 0.2));
  const crossed = cuts.filter(c => c.s > samples[0].t && c.e < last.t).length;
  const gaps = meter.frames.slice(1).map((f, i) => f[0] - meter.frames[i][0]);
  const long = gaps.filter(g => g > 250);
  /* Measured on the old one-element player (a seek at every cut), the same
     forty seconds: 11 cuts, 10 `waiting` events — a stall at nearly every cut. */
  console.log(`  (player: ${crossed} cuts crossed in ${(last.t - samples[0].t).toFixed(1)} s of source, ${meter.frames.length} frames, ${meter.waiting} waiting, gaps over 100 ms: ${gaps.filter(g => g > 100).length}, longest ${Math.round(Math.max(0, ...gaps))} ms, swaps ${meter.swaps}, held for a standby ${meter.waits})`);
  ok('the preview plays on for forty seconds — through many polls — without stopping', !last.paused && last.t > 35 && samples.every(x => x.src === src0), { t: last.t, paused: last.paused, srcs: new Set(samples.map(x => x.src)).size });
  /* The owner's report: "plays three or four seconds and stops". Every quarter
     second of the forty, the picture's clock has moved on — not one stop. */
  const still = samples.slice(4).map((x, i) => [i + 4, x.t - samples[i + 3].t]).filter(([, d]) => d < 0.05);
  ok('…its clock moves on in every quarter second of the forty (never a stop, never a freeze)', still.length === 0, still.slice(0, 6));
  const capped = answers.filter(a => a.status === 206 && /^bytes \d+-\d+\/\d+$/.test(a.range));
  const sizes = capped.map(a => { const [, x, y] = /bytes (\d+)-(\d+)/.exec(a.range); return Number(y) - Number(x) + 1; });
  ok('…read through the real Worker in short range answers (206, at most 4 MB each, never the whole file held open)', capped.length >= 2 && sizes.every(n => n <= 4 * 1024 * 1024) && answers.every(a => a.status === 206), answers.slice(0, 8));
  ok('…crossing more than ten cuts', crossed >= 10, crossed);
  ok('…without a stall: the picture never waits for data and no two frames are more than 250 ms apart', meter.waiting === 0 && long.length === 0 && meter.frames.length > 400, { waiting: meter.waiting, long: long.map(Math.round).slice(0, 8), frames: meter.frames.length });
  ok('…and never shows what was cut (the opening silence, the fillers, the twenty words)', inCut.length === 0 && samples[2].t > 2, { inCut: inCut.slice(0, 3), first: samples.slice(0, 3) });
  const label = await page.getByTestId('vs-time').innerText();
  ok('…with the edited video\'s clock on the controls', /^\d+:\d\d \/ \d+:\d\d$/.test(label.trim()), label);
  await page.getByTestId('vs-play').click();
  ok('(the proxy is put back as it was)', await putProxy(fs.readFileSync(proxyFile), 'video/mp4'));
  await v('goto_version', { projectId: PID, version: base0.docVersion });
  await page.reload({ waitUntil: 'networkidle' });
}
if (process.env.STOP_AFTER === 'player') { await br.close(); console.log(`\n${out.filter(l => l.startsWith('PASS')).length} passed, ${failures} failed`); stop(); process.exit(failures ? 1 : 0); }
await page.locator('[data-panel="transcript"]').click();
await page.getByTestId('vs-transcript').waitFor({ timeout: 20_000 });
const words = await page.locator('.vs-w').count();
ok('5 · the transcript appears, word by word', words > 1500, String(words));
await page.getByTestId('vs-search').fill('pipeline');
await page.waitForTimeout(400);
ok('…and can be searched', (await page.locator('.vs-w.hit').count()) > 3);
await page.getByTestId('vs-search').fill('');

/* ── Editing the video by editing the text ── */
{
  const at = async () => (await v('get', { projectId: PID }));
  const before = await at();
  const word = page.locator('.vs-w:not(.cut):not(.prop)').nth(40);
  const wi = Number(await word.getAttribute('data-i'));
  await word.click();
  await page.keyboard.press('Delete');
  let d1;
  for (let i = 0; i < 20; i++) { d1 = await at(); if (d1.docVersion > before.docVersion) break; await sleep(300); }
  let w = '';
  for (let i = 0; i < 20 && !/\bcut\b/.test(w); i++) { w = (await page.locator(`.vs-w[data-i="${wi}"]`).getAttribute('class')) ?? ''; await sleep(200); }
  const cut = d1.doc.cuts.find(c => c.by === 'you' && c.state === 'approved' && c.reason.startsWith('Removed'));
  ok('click a word, press Delete: it is cut from the video — still on the page, struck through', !!cut && d1.docVersion === before.docVersion + 1 && /\bcut\b/.test(w), { cut, w, v: [before.docVersion, d1.docVersion] });
  ok('…and the timeline shades what is cut on the filmstrip', (await page.locator('.vse-cutzone.video').count()) > 0);
  await page.locator(`.vs-w[data-i="${wi}"]`).click();
  await page.keyboard.press('r');
  let d2;
  for (let i = 0; i < 20; i++) { d2 = await at(); if (d2.docVersion > d1.docVersion) break; await sleep(300); }
  ok('select the struck word, press R: it is restored', !d2.doc.cuts.some(c => c.state === 'approved' && c.s < cut.e && c.e > cut.s && c.by === 'you'), d2.doc.cuts.filter(c => c.by === 'you').slice(-3));
  /* Keyboard: Shift + → twice selects three words, Backspace cuts them as one. */
  await page.locator(`.vs-w[data-i="${wi + 2}"]`).click();
  await page.keyboard.down('Shift'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.up('Shift');
  const selected = await page.locator('.vs-w.sel').count();
  await page.keyboard.press('Backspace');
  let d3;
  for (let i = 0; i < 20; i++) { d3 = await at(); if (d3.docVersion > d2.docVersion) break; await sleep(300); }
  const three = d3.doc.cuts.find(c => c.by === 'you' && c.state === 'approved' && /^Removed “.+ .+ .+”/.test(c.reason));
  ok('Shift + arrows select words, Backspace cuts them as one cut', selected === 3 && !!three, { selected, three });
  /* Only once the page shows the three words struck has it the new version; an undo pressed while the save is on its way goes back from the one before. */
  for (let i = 0; i < 150 && (!/\bcut\b/.test((await page.locator(`.vs-w[data-i="${wi + 4}"]`).getAttribute('class')) ?? '') || (await page.locator('.vse-top .spin').count()) > 0); i++) await sleep(200);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  let d4;
  for (let i = 0; i < 20; i++) { d4 = await at(); if (d4.docVersion < d3.docVersion) break; await sleep(300); }
  ok('…and Ctrl+Z undoes it through the version history', d4.docVersion === d3.docVersion - 1 && !d4.doc.cuts.some(c => c.id === three?.id), [d3.docVersion, d4.docVersion]);
  ok('the text cursor stands in the transcript (the word it is at is marked)', (await page.locator('.vs-w.caret').count()) === 1);
  const chips = page.locator('.vs-chipin.prop');
  const nChips = await chips.count();
  const chipId = await chips.first().getAttribute('data-chip');
  await chips.first().locator('[data-act="chip-ignore"]').click();
  let d5;
  for (let i = 0; i < 20; i++) { d5 = await at(); if (d5.doc.cuts.find(c => c.id === chipId)?.state === 'rejected') break; await sleep(300); }
  ok('suggestions sit in the text as chips — ignoring one keeps it', nChips > 0 && d5.doc.cuts.find(c => c.id === chipId)?.state === 'rejected', { nChips, chipId });
  await v('edit', { projectId: PID, baseVersion: d5.docVersion, ops: [{ op: 'cut.set', id: chipId, state: 'proposed' }], note: 'test: back to proposed' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-panel="transcript"]').click();
  await page.getByTestId('vs-transcript').waitFor({ timeout: 20_000 });
}

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
{
  await page.locator('[data-act="cleanup-options"]').click();
  const opts = page.getByTestId('vs-filler-options');
  const kinds = await opts.locator('[data-filler]').count();
  const umCount = Number(await opts.locator('[data-filler="um"] .vs-count').innerText());
  ok('cleanup options: eight kinds of filler to tick, each with how many there are, and "shorten word gaps"', kinds === 8 && umCount > 5 && (await opts.locator('[data-field="video.maxPause"]').count()) === 1, { kinds, umCount });
  const v0 = (await v('get', { projectId: PID })).docVersion;
  await opts.locator('[data-field="video.maxPause"]').click();
  let g;
  for (let i = 0; i < 30; i++) { g = await v('get', { projectId: PID }); if (g.docVersion > v0) break; await sleep(400); }
  ok('…ticking "shorten word gaps" re-reads the recording with every quiet pause cut down to the chosen length', g.doc.cleanup.maxPause > 0 && g.doc.cuts.some(c => c.kind === 'gap' && c.state === 'approved'), g.doc.cleanup);
  await page.waitForTimeout(800);
  await opts.locator('[data-field="video.maxPause"]').click();
  for (let i = 0; i < 30; i++) { g = await v('get', { projectId: PID }); if (!g.doc.cleanup.maxPause) break; await sleep(400); }
  ok('…and unticking it puts the level\'s own pauses back, decisions kept', !g.doc.cleanup.maxPause && g.doc.cuts.find(c => c.id === propId)?.state === 'approved');
}

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
  ok('…with Audio effects as rows: Studio Sound, and "Lower audio of other layers" (the music is ducked under speech)', /Studio Sound/.test(audio) && /Lower audio of other layers/.test(audio) && (await page.locator('[data-effect="duck"] [role="switch"]').getAttribute('aria-checked')) === 'true', audio.slice(0, 400));
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
  ok('the inspector is an icon rail: Video, Adjust, Effects, Animation, Tracking, Text, Audio, Music, Captions, Reuse, Export', (await page.locator('.vse-rail-btn').count()) === 11);
  await page.locator('[data-panel="effects"]').click();
  const fxText = await page.getByTestId('vs-effects-panel').innerText();
  ok('Effects lists the visual effects as rows: Color adjustments, Shadow, Green screen, Improve appearance — each with a switch', /Color adjustments[\s\S]*Shadow[\s\S]*Green screen[\s\S]*Improve appearance/.test(fxText) && (await page.locator('[data-testid="vs-effects-panel"] [role="switch"]').count()) === 4, fxText.slice(0, 300));
  await page.locator('[data-effect="color"] [data-act="fx-settings"]').click();
  ok('…a row\'s settings open with its sliders (Temperature in kelvin) and "Remove effect"', /Temperature[\s\S]*6,500 K/.test(await page.getByTestId('vs-fx-pop-color').innerText()) && (await page.locator('[data-effect="color"] [data-act="fx-remove"]').count()) === 1);
  await page.locator('[data-effect="color"] [role="switch"]').click();
  await page.waitForTimeout(1500);
  ok('…and its switch turns it on in the edit', (await v('get', { projectId: PID })).doc.effects?.short?.color?.on === true || (await v('get', { projectId: PID })).doc.effects?.long?.color?.on === true);
  await page.locator('[data-panel="adjust"]').click();
  ok('Adjust offers ten filters and the colour sliders', (await page.locator('.vs-filter').count()) === 10 && /Temperature[\s\S]*Exposure[\s\S]*Vignette/.test(await page.getByTestId('vs-adjust-panel').innerText()));
  await page.locator('[data-panel="tracking"]').click();
  ok('Tracking says what it found in this recording — no faces in a test picture, so nothing to follow', /No faces found/.test(await page.getByTestId('vs-tracking-panel').innerText()), await page.getByTestId('vs-tracking-panel').innerText());
  await page.locator('[data-panel="text"]').click();
  ok('Text lists the words on screen with their times', /Watch this/.test(await page.getByTestId('vs-text-panel').innerHTML()));
  await page.locator('[data-panel="media"]').click();
  await page.locator('[data-media="' + target.id + '"]').click();
  await page.waitForTimeout(500);
  ok('the preview shows the look (black and white) and the speed on the Short', (await page.getByTestId('vs-video').getAttribute('data-look')) === 'bw' && /1\.25×/.test(await page.getByTestId('vs-preview').innerText()));
  const before = (await v('get', { projectId: PID })).doc.clips.find(c => c.id === target.id);
  await page.locator(`[data-clip-block="${target.id}"].on`).waitFor({ timeout: 5000 });
  const handle = page.locator(`[data-clip-block="${target.id}"] [data-edge="e"]`);
  /* The board under the editor makes the page taller than the window: bring the Short's edge into view first. */
  await handle.scrollIntoViewIfNeeded();
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
let TWO_PID = '';
{
  const TWO = path.join(state, 'fixtures', 'two-faces.mp4');
  const two = fs.existsSync(TWO) ? { turns: [[0, 14, 'L'], [14, 28, 'R'], [28, 40, 'L']] } : makeTwoFaces(TWO, 40);
  void two;
  const c = await v('create', { name: 'Two speakers', prompt: 'Clean this recording and make one 30-40 second Short' });
  TWO_PID = c.id;
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

/* ── Helpers for the projects below: upload a file as a new project, render one output ── */
const uploadProject = async (name, prompt, file) => {
  const c = await v('create', { name, prompt });
  const buf = fs.readFileSync(file);
  const st = await v('upload_start', { projectId: c.id, name: path.basename(file), size: buf.length, type: 'video/mp4', fileKey: `${name}|${buf.length}` });
  for (let n = 1; n <= st.parts; n++) await fetch(`${st.partUrl}&part=${n}`, { method: 'PUT', body: buf.subarray((n - 1) * st.partSize, n * st.partSize), headers: { Connection: 'close' } });
  await v('upload_complete', { projectId: c.id, uploadId: st.uploadId });
  return c.id;
};
const renderOut = async (pid, outId, maxS = 900) => {
  const t0 = Date.now();
  let R, o;
  for (;;) {
    R = await v('status', { projectId: pid, knownVersion: -1 });
    o = R.outputs.find(x => x.id === outId);
    if (o?.stale && !R.jobs.some(j => j.target === o.id && (j.state === 'queued' || j.state === 'running'))) await v('render', { projectId: pid, outputIds: [o.id] });
    if (o?.rendered && !o.stale && !R.jobs.some(j => j.target === o.id && (j.state === 'queued' || j.state === 'running'))) return { R, o };
    if ((Date.now() - t0) / 1000 > maxS) return { R, o };
    await sleep(2500);
  }
};
const waitTrack = async pid => { let s; for (let i = 0; i < 200; i++) { s = await v('status', { projectId: pid, knownVersion: -1 }); if (s.source.track?.ready || s.source.track?.error) break; await sleep(2000); } return s; };
/* The loudness of the quiet and the loud tenths of a file, 100 ms at a time: the noise floor and the speech. */
const soundOf = file => {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { maxBuffer: 1 << 28 });
  const n = raw.length / 2, win = 800, dbs = [];
  for (let i = 0; i + win <= n; i += win) { let sum = 0; for (let k = 0; k < win; k++) { const x = raw.readInt16LE((i + k) * 2) / 32768; sum += x * x; } dbs.push(10 * Math.log10(sum / win + 1e-12)); }
  dbs.sort((a, b) => a - b);
  const q = p => dbs[Math.floor(p * (dbs.length - 1))];
  const lufs = Number(String(execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -i "${file}" -af ebur128 -f null - 2>&1 | grep -E "^ +I:" | tail -1`])).trim().split(/\s+/)[1]);
  return { floor: +q(0.1).toFixed(1), speech: +q(0.9).toFixed(1), snr: +(q(0.9) - q(0.1)).toFixed(1), lufs };
};
/* One frame, cropped: its faces (the engine's own detector), and its mean colour. */
const facesAt = (file, t, crop) => {
  const png = path.join(state, `face-${Math.random().toString(36).slice(2, 8)}.png`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(t), '-i', file, '-frames:v', '1', ...(crop ? ['-vf', `crop=${crop}`] : []), png]);
  return JSON.parse(String(execFileSync('python3', ['media/engine/track.py', '--image', png, ...(fs.existsSync(MODEL) ? ['--model', MODEL] : [])]))).faces.filter(f => f.score >= 0.6);
};
const meanRgb = (file, t, crop) => [...execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `crop=${crop},scale=1:1:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])];
/* How different the two halves are pixel by pixel (mean absolute difference of luma, 0–255) — two crops of the same portrait have the same average colour, but not the same pixels. */
const halvesDiffer = (file, t) => Number(String(execFileSync('sh', ['-c',
  `ffmpeg -hide_banner -ss ${t} -i "${file}" -frames:v 1 -filter_complex "[0:v]split[x][y];[x]crop=iw:ih/2:0:0[a];[y]crop=iw:ih/2:0:ih/2[b];[a][b]blend=all_mode=difference,signalstats,metadata=print" -f null - 2>&1 | grep YAVG | head -1`])).split('=').pop());

/* ── Studio Sound: a noisy room, cleaned in the render, measured ── */
{
  const NOISY = path.join(state, 'fixtures', 'noisy-room.mp4');
  if (!fs.existsSync(NOISY)) execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', SHORT.file, '-f', 'lavfi', '-i', 'anoisesrc=c=pink:a=0.05:seed=7', '-t', '30',
    '-filter_complex', '[0:a]volume=0.6[s];[s][1:a]amix=inputs=2:duration=first:normalize=0[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', NOISY]);
  const pid = await uploadProject('Noisy room', 'Clean this recording', NOISY);
  const R = await waitReady(pid, { T, A }, 'noisy', 600);
  const longOut = R.outputs.find(o => o.kind === 'long');
  const ed = await v('edit', { projectId: pid, baseVersion: R.docVersion, ops: [{ op: 'audio.set', patch: { studio: true, strength: 60 } }, { op: 'effects.set', target: 'long', effect: 'color', patch: { on: true, kelvin: 3200 } }], note: 'Studio Sound, warmer' });
  const after = await v('get', { projectId: pid });
  ok('Studio Sound is switched on in the edit, and the long video says it needs rendering again', ed.success && ed.doc.audio.studio === true && after.outputs.find(o => o.id === longOut.id)?.stale === true, { ok: ed.success, stale: after.outputs.map(o => o.stale) });
  const { o } = await renderOut(pid, longOut.id);
  const f = await download(o.downloadUrl, 'studio-sound.mp4');
  const before = soundOf(NOISY), made = soundOf(f.file);
  const rnn = fs.existsSync(RNN);
  console.log(`  (Studio Sound: before ${JSON.stringify(before)} → after ${JSON.stringify(made)}, ${rnn ? 'RNNoise' : 'FFT denoiser'})`);
  ok(`Studio Sound takes the room noise down: speech stands ${rnn ? '8' : '2'}+ dB further above the noise floor (measured, ${rnn ? 'RNNoise' : 'the FFT fallback'})`, made.snr - before.snr >= (rnn ? 8 : 2), { before, made });
  ok('…and the render is at −16 LUFS (EBU R128, ±1 LU), from two-pass loudness normalisation', Math.abs(made.lufs + 16) <= 1, { lufs: made.lufs, source: before.lufs });
  const [sr, , sb] = meanRgb(NOISY, 10, 'iw:ih:0:0'), [or, , ob] = meanRgb(f.file, 10, 'iw:ih:0:0');
  ok('Color adjustments at 3,200 K render warmer light: red up against blue', (or - ob) - (sr - sb) > 10, { source: [sr, sb], render: [or, ob] });
}

/* ── Shorts layouts: a screen recording with a webcam bubble, and two people ── */
{
  const SCREEN = path.join(state, 'fixtures', 'screen-webcam.mp4');
  if (!fs.existsSync(SCREEN)) {
    /* A "screen" (the test picture, moving) with the same public-domain portrait the two-faces fixture uses, small, in a round-cornered bubble bottom right, mouth moving while a tone plays. */
    const face = path.resolve('test/fixtures/faces/lincoln-1863.jpg');
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=24', '-loop', '1', '-i', face,
      '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=24',
      '-filter_complex', '[1:v]scale=220:220,split=2[f0][fs];[fs]crop=58:30:76:110[fm];[f0][fm]overlay=76:\'110+4*sin(t*15)\'[fb];[0:v][fb]overlay=1030:470:shortest=1[v]',
      '-map', '[v]', '-map', '2:a', '-t', '24', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', SCREEN]);
  }
  const pid = await uploadProject('Screen with webcam', 'Clean this recording and make one Short', SCREEN);
  const S1 = await waitTrack(pid);
  ok('a screen recording with a webcam: one small face, near the corner', S1.source.track?.ready && S1.source.track.summary?.faces === 1, S1.source.track);
  const R1 = await waitReady(pid, { T, A }, 'screen', 600);
  const e1 = await v('edit', { projectId: pid, baseVersion: R1.docVersion, ops: [{ op: 'clip.add', s: 1, e: 21, title: 'Screen and camera' }] });
  const clip = e1.doc.clips[e1.doc.clips.length - 1];
  /* The picker, on screen: what this recording can carry, and why not the rest. */
  await page.goto(`${B}/video-studio/${pid}`, { waitUntil: 'networkidle' });
  await page.locator('[data-panel="media"]').click();
  await page.locator(`[data-media="${clip.id}"]`).click();
  await page.locator('[data-panel="video"]').first().click();
  await page.getByTestId('vs-layouts').waitFor({ timeout: 15_000 });
  const opts = Object.fromEntries(await Promise.all(['speaker', 'screen', 'split', 'two', 'pip'].map(async k => [k, await page.locator(`[data-layout-opt="${k}"]`).isEnabled()])));
  const whyTwo = await page.locator('[data-layout-opt="two"]').innerText();
  ok('the layout picker offers split and picture-in-picture for it — not "both people", saying why', opts.split && opts.pip && opts.screen && !opts.two && /one person/i.test(whyTwo), { opts, whyTwo });
  await page.locator('[data-layout-opt="split"]').click();
  await page.getByTestId('vs-layout-preview').waitFor({ timeout: 10_000 });
  ok('…choosing "split" shows it in the preview', (await page.getByTestId('vs-layout-preview').getAttribute('data-layout')) === 'split');
  let D = await v('get', { projectId: pid });
  ok('…and saves it on the Short', D.doc.clips.find(c => c.id === clip.id)?.layout === 'split');
  const out1 = D.outputs.find(o => o.clipId === clip.id);
  const r1 = await renderOut(pid, out1.id);
  const f1 = await download(r1.o.downloadUrl, 'layout-split.mp4');
  const p1 = probe(f1.file).streams.find(x => x.codec_type === 'video');
  const below = facesAt(f1.file, 8, 'iw:ih/2:0:ih/2'), diff1 = halvesDiffer(f1.file, 8);
  ok('the split Short renders at 1080×1920: the screen above, the camera — a face, big — below', p1.width === 1080 && p1.height === 1920 && below.length >= 1 && below[0].h > 0.25 && diff1 > 20, { w: p1.width, h: p1.height, below, diff1 });

  /* Two people taking turns, one above the other. */
  const T2 = await v('get', { projectId: TWO_PID });
  const short2 = T2.doc.clips[T2.doc.clips.length - 1];
  const e2 = await v('edit', { projectId: TWO_PID, baseVersion: T2.docVersion, ops: [
    { op: 'clip.update', id: short2.id, patch: { layout: 'two' } },
    { op: 'effects.set', target: 'short', effect: 'appearance', patch: { on: true, amount: 60 } },
  ], note: 'two people, improved' });
  ok('two people: the "both people" layout and Improve appearance (skin smoothed in the face boxes) are saved together', e2.success && e2.doc.clips.find(c => c.id === short2.id)?.layout === 'two' && e2.doc.effects?.short?.appearance?.on === true, e2.error);
  const out2 = (await v('get', { projectId: TWO_PID })).outputs.find(o => o.clipId === short2.id);
  const r2 = await renderOut(TWO_PID, out2.id);
  const f2 = await download(r2.o.downloadUrl, 'layout-two.mp4');
  const p2 = probe(f2.file).streams.find(x => x.codec_type === 'video');
  const top = facesAt(f2.file, 5, 'iw:ih/2:0:0'), bottom = facesAt(f2.file, 5, 'iw:ih/2:0:ih/2'), diff2 = halvesDiffer(f2.file, 5);
  ok('the two-person Short renders at 1080×1920 with a face in each half — the two halves differ', p2.width === 1080 && p2.height === 1920 && top.length >= 1 && bottom.length >= 1 && diff2 > 8, { w: p2.width, h: p2.height, top: top.length, bottom: bottom.length, diff2 });
}

/* ── Green screen: a real key ── */
{
  const GREEN = path.join(state, 'fixtures', 'green-screen.mp4');
  if (!fs.existsSync(GREEN)) execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x00ff00:s=640x360:r=30:d=12', '-f', 'lavfi', '-i', 'testsrc2=s=240x240:r=30:d=12',
    '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=12', '-filter_complex', '[0:v][1:v]overlay=200:60:shortest=1[v]', '-map', '[v]', '-map', '2:a', '-t', '12',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', GREEN]);
  const pid = await uploadProject('Green screen', 'Clean this recording', GREEN);
  const R = await waitReady(pid, { T, A }, 'green', 600);
  const longOut = R.outputs.find(o => o.kind === 'long');
  await v('edit', { projectId: pid, baseVersion: R.docVersion, ops: [{ op: 'effects.set', target: 'long', effect: 'green', patch: { on: true, color: '#00ff00', similarity: 20, bg: '#ff00ff' } }], note: 'green screen' });
  const { o } = await renderOut(pid, longOut.id);
  const f = await download(o.downloadUrl, 'green.mp4');
  const corner = meanRgb(f.file, 4, 'iw/8:ih/8:0:0'), middle = meanRgb(f.file, 4, 'iw/8:ih/8:iw*7/16:ih*7/16');
  ok('green screen: the green is keyed out and the colour chosen is behind (magenta in the corner), the subject kept', corner[0] > 200 && corner[1] < 60 && corner[2] > 200 && !(middle[0] > 200 && middle[1] < 60 && middle[2] > 200), { corner, middle });
}

/* ── A phone ── */
{
  const m = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = steady(await m.newPage());
  mp.on('pageerror', e => errs.push(`phone: ${e}`));
  await signIn(mp, OWNER);
  for (const url of [`/video-studio`, `/video-studio/${PID}`, `/video-studio/${PID}?tab=shorts`, `/video-studio/${PID}?tab=exports`, `/video-studio/${PID}?tab=music`, `/video-studio/${PID}?tab=effects`, `/video-studio/${PID}?tab=transcript`, `/video-studio/${PID}?tab=cleanup`, `/video-studio?new=1`, `/video-studio?tab=quick-shorts`, `/video-studio?tab=repurpose`]) {
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
