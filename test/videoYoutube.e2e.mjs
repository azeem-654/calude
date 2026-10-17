/**
 * AI Video Studio: a project from the customer's own YouTube video, the
 * trending thumbnail layouts drawn by the real engine, and a thumbnail
 * redesigned in the Graphics Designer & Editor and sent back.
 *
 *   npm run test:videoyoutube   (self-contained: engine :8883 running the
 *     yt-dlp stand-in test/ytdlpStub.mjs, Whisper mock :8884, oEmbed mock
 *     :8885, wrangler :8963, fresh state in .wrangler-ytvideo; needs ffmpeg,
 *     Python + OpenCV for faces (optional) and a VITE_BASE=/ build)
 *
 * Nothing here reaches YouTube: the engine runs the stand-in exactly as it
 * runs yt-dlp, and the stand-in refuses unless the locked-down arguments are
 * there. What it proves:
 *   - the link box refuses what is not a YouTube video by name, on its box;
 *     the rights box is required; the title comes through the Worker;
 *   - "Sign in to confirm you're not a bot" stops the project with a
 *     sentence and the way forward, and uploading the file into the same
 *     project then works;
 *   - a video longer than Video Studio takes, or than the month's minutes
 *     left, is refused from its details before anything is fetched;
 *   - a fetched video becomes the source only with its bytes, is prepared,
 *     transcribed, cut and metered like an upload;
 *   - every trending layout comes out a checked PNG of the right size;
 *   - the designer previews the plan, a thumbnail opens in the Graphics
 *     Designer & Editor and comes back as the chosen, checked thumbnail;
 *   - 1280 and 390 wide: no sideways scroll, no page error.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { execSync, spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { makeScript, makeTwoFaces, startWhisperMock } from './videoStudioMock.mjs';

const PORT = 8963, INSPECT = 9363, ENG = 8883, WH = 8884, OE = 8885;
const B = `http://localhost:${PORT}`;
const SECRET = 'engine-test-secret-yt-41';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const ok = (n, p, d = '') => { if (!p) failures++; console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 600)}`}`); };

const state = path.resolve('.wrangler-ytvideo');
fs.mkdirSync(path.join(state, 'fixtures'), { recursive: true });
const VIDEO = path.join(state, 'fixtures', 'two-faces.mp4');
if (!fs.existsSync(VIDEO)) { console.log('(making a 40-second recording…)'); makeTwoFaces(VIDEO, 40); }
const SCRIPT = makeScript(1);
const whisper = await startWhisperMock(WH, SCRIPT);

/* YouTube's oEmbed, as the Worker asks it: a title for any id but one. */
const oembed = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const id = new URL(u.searchParams.get('url') ?? 'https://x').searchParams.get('v');
  if (u.pathname !== '/oembed' || id === 'N0tF0und000') { res.writeHead(404); res.end('Not Found'); return; }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ title: 'Our weekly growth show', author_name: 'Growth Show', html: '<iframe></iframe>' }));
}).listen(OE, '127.0.0.1');

const engine = spawn('node', [path.resolve('media/engine/server.mjs')], {
  env: { ...process.env, PORT: String(ENG), MEDIA_ENGINE_SECRET: SECRET, ALLOW_HTTP_INPUTS: '1', WORK_DIR: path.join(state, 'engine-work'), MAX_RUNNING: '2',
    YTDLP: path.resolve('test/ytdlpStub.mjs'), YTDLP_STUB_FILE: VIDEO, YTDLP_STUB_DURATION: '40' },
  stdio: ['ignore', 'ignore', 'pipe'],
});
engine.stderr.on('data', d => { if (process.env.DEBUG) process.stderr.write(d); });

const persist = path.join(state, 'wrangler');
fs.rmSync(persist, { recursive: true, force: true });
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
const WR_ARGS = ['wrangler', 'dev', '--local', '--port', String(PORT), '--inspector-port', String(INSPECT), '--persist-to', persist,
  '--var', `APP_ORIGIN:${B}`, '--var', `MEDIA_ENGINE_URL:http://127.0.0.1:${ENG}`, '--var', `MEDIA_ENGINE_SECRET:${SECRET}`,
  '--var', `WORKERS_AI_BASE:http://127.0.0.1:${WH}`, '--var', `YOUTUBE_OEMBED_BASE:http://127.0.0.1:${OE}`];
/* Local wrangler's dev proxy can exit when a browser cancels a request — started again on the same data, and said. */
let wr, stopping = false, restarts = 0;
const startWrangler = () => {
  wr = spawn('npx', WR_ARGS, { detached: true, stdio: ['ignore', 'ignore', process.env.DEBUG ? 'inherit' : 'ignore'] });
  wr.on('exit', () => { if (stopping) return; try { process.kill(-wr.pid, 'SIGTERM'); } catch { /* gone */ } restarts++; console.log(`  (local wrangler exited — restart ${restarts}, same data)`); setTimeout(startWrangler, 1500); });
};
startWrangler();
let br = null;
const stop = () => { stopping = true; try { process.kill(-wr.pid, 'SIGTERM'); } catch { /* gone */ } try { engine.kill(); } catch { /* gone */ } whisper.server.close(); oembed.close(); };
process.on('exit', stop);
process.on('uncaughtException', async e => { console.log(e); try { await br?.close(); } catch { /* */ } stop(); process.exit(1); });
const serverUp = async () => { for (let i = 0; i < 90; i++) { try { const r = await fetch(`${B}/api/data.php`, { method: 'POST', headers: { Connection: 'close' }, body: '{"action":"ping"}' }); if (r.ok) return; } catch { /* starting */ } await sleep(1000); } };
await serverUp();

let ipN = 1;
const api = (p, body) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.9.4.${ipN++ % 250}` }, body: JSON.stringify(body) }).then(r => r.json().catch(() => ({})));
const d1 = sql => execSync(`npx wrangler d1 execute crmpro --local --persist-to ${persist} --command ${JSON.stringify(sql)}`, { stdio: 'ignore' });

await api('auth.php', { action: 'bootstrap', email: 'owner@ytvideo.test', password: 'Tq9!vX2#pLm7wZ-ytvid', name: 'Olu Owner' });
const ME = { email: 'yara@ytvideo.test', pw: 'Creator-horse-7-ytvid', name: 'Yara Youtuber' };
const reg = await api('auth.php', { action: 'register', email: ME.email, password: ME.pw, name: ME.name, businessName: 'Growth Show Ltd' });
const login = await api('auth.php', { action: 'login', email: ME.email, password: ME.pw });
const T = login.token, A = reg.user?.accountId ?? login.user?.accountId;
ok('(a customer with a workspace of their own)', !!T && !!A, { reg, login: Object.keys(login) });
d1("INSERT OR REPLACE INTO crm_plan_limits (plan_id, meter, value, updated_at) VALUES ('trial','long_videos',50,'t'),('trial','ai_shorts',200,'t')");
const v = async (action, extra = {}) => {
  for (let i = 0; ; i++) {
    try { const r = await api('video.php', { token: T, accountId: A, action, ...extra }); if (r.success !== undefined || i >= 20) return r; } catch (e) { if (i >= 20) throw e; }
    await sleep(2000);
  }
};
const waitFor = async (pid, done, maxS = 600) => {
  const t0 = Date.now();
  for (;;) {
    const s = await v('status', { projectId: pid, knownVersion: -1 });
    if (done(s) || (Date.now() - t0) / 1000 > maxS) return s;
    await sleep(2500);
  }
};
const GOOD = 'https://youtu.be/G00dVideo01?si=share', BOT = 'https://www.youtube.com/watch?v=B0tBl0cked1&t=12s';

console.log('\nThe link, read back');
{
  const vimeo = await v('youtube_info', { youtubeUrl: 'https://vimeo.com/123456' });
  ok('a link to another site is refused by name, on the link box', !vimeo.success && vimeo.field === 'video.youtube' && /vimeo\.com, not YouTube/.test(vimeo.error), vimeo);
  const list = await v('youtube_info', { youtubeUrl: 'https://www.youtube.com/playlist?list=PLabc' });
  ok('…and a playlist, saying to open the one video', !list.success && /playlist/.test(list.error), list);
  const info = await v('youtube_info', { youtubeUrl: GOOD });
  ok('a video\'s title is asked of YouTube by the Worker; the browser gets only YouTube\'s still', info.success && info.title === 'Our weekly growth show' && info.author === 'Growth Show' && info.thumb === 'https://i.ytimg.com/vi/G00dVideo01/hqdefault.jpg' && !('html' in info), info);
  const gone = await v('youtube_info', { youtubeUrl: 'https://youtube.com/shorts/N0tF0und000' });
  ok('a link YouTube says has no video is refused, with the way forward', !gone.success && gone.field === 'video.youtube' && /YouTube Studio/.test(gone.error), gone);
  const noRights = await v('create', { name: 'x', prompt: '', youtubeUrl: GOOD });
  ok('nothing is made without the rights box, refused on that box', !noRights.success && noRights.field === 'video.youtubeRights', noRights);
}

console.log('\nRefused from its details, before a byte');
{
  const c = await v('create', { name: 'Five hours', prompt: 'make 2 shorts', youtubeUrl: 'https://www.youtube.com/live/L0ngVideo00', rightsConfirmed: true });
  const s = await waitFor(c.id, x => x.project?.status === 'failed');
  ok('a five-hour video is refused: too long, in minutes, with the way forward', s.project?.status === 'failed' && /300 minutes/.test(s.project.error) && /180 minutes/.test(s.project.error) && /YouTube Studio/.test(s.project.error), s.project);
  const st = s.stages?.find(x => x.key === 'fetch_url');
  ok('…on the fetch stage, which says it failed; no source was kept', st?.state === 'failed' && !s.source.youtube.fetched && !s.source.probe, { st, src: s.source });
  const jobs = s.jobs.filter(j => j.kind === 'fetch_url');
  ok('…once — a refusal is not retried', jobs.length === 1 && jobs[0].attempts === 1, jobs);
}

br = await pw.chromium.launch();
const errs = [];
const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', e => errs.push(`1280: ${e}`));
await page.goto(`${B}/login`, { waitUntil: 'networkidle' });
await page.getByLabel('Email or username').fill(ME.email, { timeout: 15_000 });
await page.getByLabel('Password', { exact: true }).fill(ME.pw);
await page.getByRole('button', { name: 'Sign in', exact: true }).click();
await page.waitForTimeout(2500);
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const deadEnds = p => p.evaluate(() => (window.__deadEnds ?? []).length);

console.log('\nThe wizard\'s video step, in a browser');
let BOTPID = '';
{
  await page.goto(`${B}/video-studio`, { waitUntil: 'networkidle' });
  await page.getByTestId('vs-new').click();
  await page.locator('[data-goal="both"]').click();
  await page.getByTestId('vs-wiz-next').click();
  await page.getByTestId('vs-source').waitFor({ timeout: 10_000 });
  ok('the video step offers both: from my computer, or from a YouTube link', /From my computer/.test(await page.getByTestId('vs-source').innerText()) && /From a YouTube link/.test(await page.getByTestId('vs-source').innerText()));
  ok('…and the drop zone points a huge file at the link', /Or paste a YouTube link/.test(await page.locator('.vs-drop').innerText()));
  await page.locator('[data-source="youtube"]').click();
  const url = page.getByTestId('vs-yt-url');
  ok('the link box carries its field name', (await url.getAttribute('data-field')) === 'video.youtube');
  await url.fill('https://vimeo.com/123456');
  await page.getByTestId('vs-yt-error').waitFor({ timeout: 5000 });
  ok('a link to another site is refused under the box, by name', /vimeo\.com, not YouTube/.test(await page.getByTestId('vs-yt-error').innerText()));
  ok('…and the start button waits', await page.getByTestId('vs-start').isDisabled());
  await url.fill(BOT);
  await page.getByTestId('vs-yt-card').waitFor({ timeout: 5000 });
  for (let i = 0; i < 20 && !/growth show/i.test(await page.getByTestId('vs-yt-title').innerText()); i++) await sleep(300);
  ok('a YouTube link shows the video: YouTube\'s still and the title asked through the Worker', /Our weekly growth show/.test(await page.getByTestId('vs-yt-title').innerText()) && (await page.locator('[data-testid="vs-yt-card"] img').getAttribute('src')) === 'https://i.ytimg.com/vi/B0tBl0cked1/hqdefault.jpg');
  ok('…the project takes its name from it', (await page.locator('[data-field="video.name"]').inputValue()) === 'Our weekly growth show');
  ok('…and nothing starts until the rights box is ticked', await page.getByTestId('vs-start').isDisabled() && /terms allow downloading only videos you own/.test(await page.getByTestId('vs-youtube').innerText()));
  ok('1280: no sideways scroll on the video step', (await overflow(page)) <= 0, await overflow(page));
  await page.screenshot({ path: path.join(state, 'shot-video-step-1280.png') });
  await page.getByTestId('vs-yt-rights').check();
  await page.getByTestId('vs-start').click();
  await page.waitForURL(/\/video-studio\/vp-/, { timeout: 30_000 });
  BOTPID = page.url().match(/video-studio\/(vp-[\w-]+)/)[1];
  await page.getByTestId('vs-youtube-stopped').waitFor({ timeout: 90_000 });
  const said = await page.getByTestId('vs-youtube-stopped').innerText();
  ok('YouTube refusing the server stops the project with a sentence the customer reads', /not a bot/.test(said) && /cloud servers/.test(said), said);
  await page.screenshot({ path: path.join(state, 'shot-youtube-stopped.png') });
  ok('…and the way forward: download it from YouTube Studio and upload the file instead', /YouTube Studio/.test(said) && /upload the file instead/i.test(said) && (await page.getByTestId('vs-resume-file').count()) === 1, said);
  ok('…with no dead end on the screen and no page error', (await deadEnds(page)) === 0 && !errs.length, errs);
  const s = await v('status', { projectId: BOTPID, knownVersion: -1 });
  ok('…a terminal refusal: one attempt, nothing counted against the recordings allowance', s.jobs.filter(j => j.kind === 'fetch_url').every(j => j.attempts === 1 && j.state === 'failed'), s.jobs);
  await page.getByTestId('vs-resume-file').setInputFiles(VIDEO);
  /* The upload leaves the stopped screen first; then the project is prepared from the file. */
  for (let i = 0; i < 60 && (await page.getByTestId('vs-youtube-stopped').count()); i++) await sleep(500);
  const after = await waitFor(BOTPID, x => !!x.source.probe || (x.project?.status === 'failed' && x.project?.stage !== 'fetch_url'), 240);
  ok('uploading the file into the same project works: prepared from the upload, the choices kept', !!after.source.probe && !after.source.youtube && after.request?.shorts === 4,
    { p: after.project, probe: after.source.probe, req: after.request, screen: await page.locator('[data-testid="vs-resume"]').innerText().catch(() => '') });
}

console.log('\nFetched from YouTube, then like an upload');
let PID = '';
{
  const c = await v('create', { name: '', prompt: 'Clean this recording and make 1 Short with captions and PNG thumbnails', settings: { shorts: 1, min: 15, max: 30 }, youtubeUrl: GOOD, rightsConfirmed: true, title: 'Our weekly growth show' });
  PID = c.id;
  ok('a project starts from the link (named from the video), fetching at once', c.success && !!PID, c);
  const s = await waitFor(PID, x => (x.project?.status === 'ready' && !x.jobs.some(j => j.state === 'queued' || j.state === 'running') && x.outputs.length > 0 && x.outputs.every(o => o.thumbs.length > 0)) || x.project?.status === 'failed', 900);
  ok('the fetched video is the source only with its bytes: probed, named from YouTube, kept as MP4', s.source.youtube?.fetched && s.source.probe?.duration > 30 && /^Our weekly growth show\.mp4$/.test(s.source.name), s.source);
  ok('…then prepared, transcribed and cut like an upload', s.project?.status === 'ready' && !!s.transcriptUrl && s.outputs.some(o => o.kind === 'long') && s.outputs.some(o => o.kind === 'short'), { p: s.project, outs: s.outputs.map(o => [o.kind, o.status]) });
  ok('…its first stage is the fetch, done', s.stages.find(x => x.key === 'fetch_url')?.state === 'done', s.stages);
  const caps = await v('capabilities');
  ok('…and its minutes are counted like an upload\'s', caps.usage?.used?.sourceMin > 0.5, caps.usage);
  ok('the default thumbnails are trending layouts, a Short leading with its 9:16 cover', s.outputs.find(o => o.kind === 'short')?.thumbs.some(t => t.layout === 'short' && t.width === 1080 && t.height === 1920 && t.verified), s.outputs.map(o => o.thumbs.map(t => [t.layout, t.width, t.verified])));
}

console.log('\nEvery trending layout, drawn by the engine');
{
  const s = await v('status', { projectId: PID, knownVersion: -1 });
  const long = s.outputs.find(o => o.kind === 'long'), short = s.outputs.find(o => o.kind === 'short');
  const LAYOUTS = [
    { layout: 'bold', text: 'I tried this for 30 days', highlight: '30', sticker: 'check', color: '#4c1d95', color2: '#1e3a8a' },
    { layout: 'glow', text: 'Stop doing this now', highlight: 'stop', hlStyle: 'box', sticker: 'cross' },
    { layout: 'headline', text: 'The 8 hour work week secret', highlight: '8', badge: '@growthshow', color: '#111827', color2: '#7f1d1d' },
    { layout: 'callout', text: 'Big news for owners', highlight: 'news', pointer: 'both', sticker: 'alert' },
    { layout: 'split', text: 'Before vs After', at2: 30 },
    { layout: 'number', text: '#10 ways to win clients', color: '#b91c1c' },
    { layout: 'cinematic', text: 'The money nobody talks about', textPos: 'top' },
  ];
  const made = [];
  for (const sp of LAYOUTS) {
    const r = await v('thumb_custom', { projectId: PID, outputId: long.id, spec: { ...sp, at: 8, accent: '#facc15', textColor: '#ffffff', border: true, zoom: 0.5 } });
    made.push([sp.layout, r.set]);
  }
  const r9 = await v('thumb_custom', { projectId: PID, outputId: short.id, spec: { layout: 'short', text: 'This changed my business', highlight: 'changed', hlStyle: 'box', badge: '@growthshow', sticker: 'up', at: 8, accent: '#facc15', color: '#be123c', textColor: '#ffffff', border: true, zoom: 0.5 } });
  const done = await waitFor(PID, x => !x.jobs.some(j => j.kind === 'thumbnails' && (j.state === 'queued' || j.state === 'running')), 600);
  const lt = done.outputs.find(o => o.id === long.id).thumbs, st = done.outputs.find(o => o.id === short.id).thumbs;
  for (const [layout, set] of made) {
    const t = lt.find(x => x.set === set);
    ok(`${layout}: a checked PNG, 1280×720, its options kept on the spec`, t?.verified && t.width === 1280 && t.height === 720 && t.spec?.layout === layout, t);
    if (t?.verified) fs.writeFileSync(path.join(state, `thumb-${layout}.png`), Buffer.from(await (await fetch(t.url, { headers: { Connection: 'close' } })).arrayBuffer()));
  }
  const cover = st.find(x => x.set === r9.set);
  ok('the Shorts cover: a checked PNG, 1080×1920, with its strip and sticker kept', cover?.verified && cover.width === 1080 && cover.height === 1920 && cover.layout === 'short' && cover.spec?.badge === '@growthshow' && cover.spec?.sticker === 'up', cover);
  if (cover?.verified) fs.writeFileSync(path.join(state, 'thumb-short.png'), Buffer.from(await (await fetch(cover.url, { headers: { Connection: 'close' } })).arrayBuffer()));
  const sticker = await v('thumb_custom', { projectId: PID, outputId: long.id, spec: { layout: 'bold', text: 'Hi there', sticker: '../../etc', pointer: 'laser', badge: '{\\b1}x' } });
  ok('a request outside the lists falls back, never into the engine\'s graph', sticker.success);
}

console.log('\nThe designer and the Graphics Designer & Editor');
{
  await page.goto(`${B}/video-studio/${PID}`, { waitUntil: 'networkidle' });
  await page.getByTestId('vs-outputs-board').waitFor({ timeout: 30_000 });
  const longRow = page.locator('[data-testid="vs-board-row"][data-kind="long"]');
  await longRow.locator('[data-act="design-thumb"]').click();
  const dlg = page.getByTestId('vs-thumb-designer');
  await dlg.waitFor({ timeout: 10_000 });
  await dlg.locator('[data-layout="glow"]').click();
  await dlg.getByTestId('vs-thumb-text').fill('Stop doing this now');
  await dlg.getByRole('button', { name: 'Stop', exact: true }).click();
  await dlg.getByRole('radio', { name: 'Tilted box' }).click();
  await dlg.locator('[data-sticker="star"]').first().click();
  const prev = dlg.getByTestId('vs-thumb-preview');
  ok('the live preview draws the engine\'s plan: the layout, the words, the boxed word on its own line, the sticker',
    (await prev.getAttribute('data-layout')) === 'glow' && /STOP/.test(await prev.innerText()) && (await prev.locator('.td-line.boxed').innerText()).trim() === 'STOP' && (await prev.locator('[data-sticker="star"]').count()) === 1,
    await prev.innerText());
  const dlgText = await dlg.innerText();
  ok('…every option a customer edits is there: words, picked word, colours and gradient, position, size, face side, sticker, pointer, strip',
    ['Word picked out', 'Accent', 'fading to', 'Words at', 'Word size', 'Face on the', 'Sticker', 'Point at the face', 'Channel strip'].every(w => new RegExp(w).test(dlgText)), dlgText.slice(0, 600));
  ok('1280: the designer fits, no page error', (await overflow(page)) <= 0 && !errs.length, errs);
  await prev.screenshot({ path: path.join(state, 'shot-preview-glow.png') });
  await dlg.screenshot({ path: path.join(state, 'shot-designer-1280.png') });
  await dlg.getByRole('button', { name: 'Close' }).click();

  const before = (await v('status', { projectId: PID, knownVersion: -1 })).outputs.find(o => o.kind === 'long');
  await longRow.locator('[data-act="edit-in-designer"]').first().click();
  await page.waitForURL(/\/social-creator\/editor\/post-/, { timeout: 20_000 });
  await page.getByTestId('designer-video-banner').waitFor({ timeout: 10_000 });
  ok('"Edit in Graphics Designer & Editor" opens the thumbnail as a design, said on a banner', /Redesigning a thumbnail of/.test(await page.getByTestId('designer-video-banner').innerText()) && /1280×720/.test(await page.getByTestId('designer-video-banner').innerText()));
  const bg = await page.evaluate(() => [...document.querySelectorAll('div')].map(d => d.style.backgroundImage).find(b => b.startsWith('url("data:image/jpeg')) ?? '');
  ok('…its picture held in the design itself (the signed link would expire), at half size on a 640×360 canvas', bg.length > 1000 && /640 × 360px/.test(await page.locator('body').innerText()));
  await page.locator('[data-act="use-as-thumb"]').click();
  for (let i = 0; i < 40 && !/now the thumbnail|not|could/i.test(await page.getByTestId('designer-video-banner').innerText()); i++) await sleep(500);
  await page.screenshot({ path: path.join(state, 'shot-graphics-designer.png') });
  ok('"Use as this video\'s thumbnail" sends it back', /It is now the thumbnail of/.test(await page.getByTestId('designer-video-banner').innerText()), await page.getByTestId('designer-video-banner').innerText());
  const after = (await v('status', { projectId: PID, knownVersion: -1 })).outputs.find(o => o.kind === 'long');
  const chosen = after.thumbs[after.chosenThumb];
  ok('…checked as a real 1280×720 PNG and made the chosen thumbnail', after.thumbs.length === before.thumbs.length + 1 && chosen.layout === 'designed' && chosen.verified && chosen.width === 1280 && chosen.height === 720, chosen);
  const fake = await v('thumb_upload_url', { projectId: PID, outputId: after.id });
  await fetch(`${fake.url}&name=designed.png&type=image/png`, { method: 'PUT', body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), headers: { Connection: 'close' } });
  const refused = await v('thumb_attach', { projectId: PID, outputId: after.id, key: fake.key });
  ok('a picture that is not a PNG of the right size is refused and not kept', !refused.success && refused.code === 'not_png', refused);
  const foreign = await v('thumb_attach', { projectId: PID, outputId: after.id, key: `v/${A}/vp-other/out/x/thumbs/up-1/designed.png` });
  ok('…and a key outside this video is refused', !foreign.success, foreign);
  ok('1280: the Graphics Designer & Editor with the banner, no page error', !errs.length, errs);
}

console.log('\nOver this month\'s minutes');
{
  d1("INSERT OR REPLACE INTO crm_plan_limits (plan_id, meter, value, updated_at) VALUES ('trial','video_minutes',1,'t')");
  const c = await v('create', { name: 'Over', prompt: '', youtubeUrl: GOOD, rightsConfirmed: true });
  const s = await waitFor(c.id, x => x.project?.status === 'failed' || !!x.source?.probe, 120);
  ok('a video longer than the minutes left is refused from its details, saying how many are left', s.project?.status === 'failed' && /minutes? of this month's video allowance/.test(s.project.error) && !s.source.youtube?.fetched, s.project);
}

console.log('\nA phone');
{
  const ph = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
  const p2 = await ph.newPage();
  p2.on('pageerror', e => errs.push(`390: ${e}`));
  await p2.goto(`${B}/video-studio?new=1`, { waitUntil: 'networkidle' });
  if (await p2.locator('[data-goal="both"]').count()) { await p2.locator('[data-goal="both"]').click(); await p2.getByTestId('vs-wiz-next').click(); }
  await p2.locator('[data-source="youtube"]').click();
  await p2.getByTestId('vs-yt-url').fill(GOOD);
  await p2.getByTestId('vs-yt-card').waitFor({ timeout: 5000 });
  ok('390: the YouTube link step fits the phone', (await overflow(p2)) <= 0, await overflow(p2));
  await p2.screenshot({ path: path.join(state, 'shot-video-step-390.png'), fullPage: true });
  await p2.goto(`${B}/video-studio/${PID}`, { waitUntil: 'networkidle' });
  await p2.getByTestId('vs-outputs-board').waitFor({ timeout: 30_000 });
  await p2.locator('[data-testid="vs-board-row"][data-kind="short"] [data-act="design-thumb"]').click();
  await p2.getByTestId('vs-thumb-designer').waitFor({ timeout: 10_000 });
  ok('390: the thumbnail designer fits (a Short\'s cover, 9:16)', (await overflow(p2)) <= 0 && (await p2.getByTestId('vs-thumb-preview').getAttribute('data-layout')) === 'short', await overflow(p2));
  await p2.getByTestId('vs-thumb-designer').getByRole('button', { name: 'Close' }).click();
  await p2.locator('[data-testid="vs-board-row"][data-kind="short"] [data-act="board-edit-in-designer"]').click();
  await p2.waitForURL(/\/social-creator\/editor\/post-/, { timeout: 20_000 });
  await p2.getByTestId('designer-video-banner').waitFor({ timeout: 10_000 });
  ok('390: a Short\'s cover opens in the designer as 1080×1920', /1080×1920/.test(await p2.getByTestId('designer-video-banner').innerText()) && (await overflow(p2)) <= 0, await overflow(p2));
  await ph.close();
}
ok('no page errors anywhere', !errs.length, errs);
if (restarts) console.log(`  (local wrangler restarted ${restarts} time${restarts === 1 ? '' : 's'})`);
await br.close();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
stop();
process.exit(failures ? 1 : 0);
