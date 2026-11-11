/**
 * Quick Shorts analyses an uploaded file on the server (AI-1).
 *
 *   npm run test:quickshorts   (self-contained: Gemini mock :8895 with the
 *     Files API, wrangler :8973, fresh state in .wrangler-quickshorts; needs
 *     ffmpeg for the one-minute recording and a VITE_BASE=/ build)
 *
 * It used to upload from the page straight to Google with a key from
 * localStorage, empty for every customer, so Google answered 403. What this
 * proves:
 *   - a customer with no key of their own, anywhere, gets clips from their
 *     file: it goes up through Video Studio's upload, and the Worker hands it
 *     to Google on the install's key, waits for it to be processed, asks
 *     about it on that same key and deletes it after;
 *   - the bytes Google received are exactly the file's;
 *   - nothing is analysed before the file is uploaded, and another
 *     workspace's project is "not found";
 *   - in a browser, at 1280 and 390 wide: the page sends nothing to Google
 *     (or to the stand-in), keeps no key in localStorage, shows the clips,
 *     and has no sideways scroll or page error.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { execSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { makeRecording, startGeminiMock } from './videoStudioMock.mjs';

const PORT = 8973, INSPECT = 9373, GM = 8895;
const B = `http://localhost:${PORT}`;
const AI_KEY = `AIzaQUICK${'q'.repeat(30)}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const ok = (n, p, d = '') => { if (!p) failures++; console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 600)}`}`); };

if (!fs.existsSync('dist/index.html')) { console.log('Build first: VITE_BASE=/ npm run build'); process.exit(1); }
const state = path.resolve('.wrangler-quickshorts');
fs.mkdirSync(path.join(state, 'fixtures'), { recursive: true });
const VIDEO = path.join(state, 'fixtures', 'talk-1min.mp4');
if (!fs.existsSync(VIDEO)) { console.log('(making a one-minute recording…)'); makeRecording(VIDEO, 1); }
const BYTES = fs.readFileSync(VIDEO);
const SHA = crypto.createHash('sha256').update(BYTES).digest('hex');
const gemini = await startGeminiMock(GM);

const persist = path.join(state, 'wrangler');
fs.rmSync(persist, { recursive: true, force: true });
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
const wr = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--inspector-port', String(INSPECT), '--persist-to', persist,
  '--var', `APP_ORIGIN:${B}`, '--var', `GEMINI_BASE:http://127.0.0.1:${GM}`, '--var', `AI_API_KEY:${AI_KEY}`],
{ detached: true, stdio: ['ignore', 'ignore', process.env.DEBUG ? 'inherit' : 'ignore'] });
let br = null;
const stop = () => { try { process.kill(-wr.pid, 'SIGTERM'); } catch { /* gone */ } gemini.server.close(); };
process.on('exit', stop);
process.on('uncaughtException', async e => { console.log(e); try { await br?.close(); } catch { /* */ } stop(); process.exit(1); });
for (let i = 0; i < 90; i++) { try { const r = await fetch(`${B}/api/data.php`, { method: 'POST', headers: { Connection: 'close' }, body: '{"action":"ping"}' }); if (r.ok) break; } catch { /* starting */ } await sleep(1000); }

let ipN = 1;
const api = (p, body) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.9.6.${ipN++ % 250}` }, body: JSON.stringify(body) }).then(r => r.json().catch(() => ({})));
const d1 = sql => execSync(`npx wrangler d1 execute crmpro --local --persist-to ${persist} --command ${JSON.stringify(sql)}`, { stdio: 'ignore' });
const d1rows = sql => JSON.parse(execSync(`npx wrangler d1 execute crmpro --local --persist-to ${persist} --json --command ${JSON.stringify(sql)}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString())[0]?.results ?? [];

await api('auth.php', { action: 'bootstrap', email: 'owner@quickshorts.test', password: 'Tq9!vX2#pLm7wZ-quick', name: 'Olu Owner' });
const customer = async (email, pw, name, biz) => {
  const reg = await api('auth.php', { action: 'register', email, password: pw, name, businessName: biz });
  const login = await api('auth.php', { action: 'login', email, password: pw });
  return { T: login.token, A: reg.user?.accountId ?? login.user?.accountId, email, pw };
};
const ME = await customer('quinn@quickshorts.test', 'Creator-horse-7-quick', 'Quinn Quick', 'Quick Clips Ltd');
const OTHER = await customer('otto@quickshorts.test', 'Other-zebra-4-quick', 'Otto Other', 'Other Co');
ok('(two customers, each with a workspace of their own)', !!ME.T && !!ME.A && !!OTHER.T && !!OTHER.A && ME.A !== OTHER.A, [ME.A, OTHER.A]);
d1("INSERT OR REPLACE INTO crm_plan_limits (plan_id, meter, value, updated_at) VALUES ('trial','long_videos',50,'t'),('trial','ai_shorts',200,'t'),('trial','ai_requests',500,'t')");
ok('the customer has no AI key of their own on the server', d1rows(`SELECT COUNT(*) AS n FROM crm_ai_config WHERE account_id = '${ME.A}' AND api_key != ''`)[0]?.n === 0);

const v = (who, action, extra = {}) => api('video.php', { token: who.T, accountId: who.A, action, ...extra });
/* Video Studio's own upload, as services/videoStudio.ts uploadVideo makes it. */
const upload = async (who, pid) => {
  const st = await v(who, 'upload_start', { projectId: pid, name: 'talk-1min.mp4', size: BYTES.length, type: 'video/mp4', fileKey: `talk|${BYTES.length}|1` });
  if (!st.success) return st;
  for (let n = 1; n <= st.parts; n++) {
    const part = BYTES.subarray((n - 1) * st.partSize, n * st.partSize);
    const r = await fetch(`${st.partUrl}&part=${n}`, { method: 'PUT', body: part, headers: { Connection: 'close' } }).then(x => x.json());
    if (!r.success) return r;
  }
  return v(who, 'upload_complete', { projectId: pid, uploadId: st.uploadId });
};

console.log('\nThe server path');
let PID = '';
{
  const made = await v(ME, 'create', { name: 'Quick Shorts — talk', prompt: '', settings: { long: false, shorts: 0 } });
  PID = made.id;
  ok('a Video Studio project is made for the file (no long video, no Shorts of its own)', made.success && !!PID && made.request?.long === false && made.request?.shorts === 0, made);
  const early = await v(ME, 'quick_analyze', { projectId: PID, quick: { maxClipDuration: 30, focus: 'all' } });
  ok('nothing is analysed before the file is uploaded, said so', !early.success && early.code === 'no_source', early);
  ok('…and Google was asked nothing', gemini.state.files.size === 0 && gemini.state.watched.length === 0);
  const up = await upload(ME, PID);
  ok('the file goes up through Video Studio\'s upload', up.success, up);
  const foreign = await v(OTHER, 'quick_analyze', { projectId: PID, quick: { maxClipDuration: 30, focus: 'all' } });
  ok('another workspace\'s project is "not found"', !foreign.success && foreign.code === 'not_found', foreign);
  const intoMine = await api('video.php', { token: OTHER.T, accountId: ME.A, action: 'quick_analyze', projectId: PID });
  ok('…and naming this workspace from another is refused', !intoMine.success && /not yours|workspace/i.test(intoMine.error ?? ''), intoMine);
  ok('…neither reached Google', gemini.state.files.size === 0);

  const r = await v(ME, 'quick_analyze', { projectId: PID, quick: { maxClipDuration: 30, focus: 'educational' } });
  ok('a workspace with no key of its own gets clips from its file', r.success && Array.isArray(r.analysis?.clips) && r.analysis.clips.length === 2, r);
  ok('…the clip length and focus asked for are the ones used', r.settings?.maxClipDuration === 30 && r.settings?.focus === 'educational' && /best 30-second/.test(gemini.state.watched[0]?.prompt ?? ''), [r.settings, gemini.state.watched[0]?.prompt]);
  const files = [...gemini.state.files.values()];
  ok('Google received the file once, exactly its bytes, on the install\'s key', files.length === 1 && files[0].bytes === BYTES.length && files[0].sha === SHA && files[0].key === AI_KEY && files[0].mime === 'video/mp4', files.map(f => ({ ...f, sha: f.sha.slice(0, 8) })));
  ok('…was asked about it only once it was processed, on the same key', gemini.state.watched.length === 1 && gemini.state.watched[0].key === AI_KEY && files[0].polls >= 2, [gemini.state.watched, files[0]?.polls]);
  ok('…and the file was deleted from Google afterwards', files[0]?.deleted === true);
  const metered = d1rows(`SELECT COUNT(*) AS n FROM crm_video_usage WHERE account_id = '${ME.A}' AND kind = 'ai-quick-shorts'`)[0]?.n;
  ok('the analysis is metered against the workspace', metered === 1, metered);

  /* A key Google refuses for the upload is not the end: said, not faked. */
  gemini.state.refuseUploadFor.add(AI_KEY);
  const refused = await v(ME, 'quick_analyze', { projectId: PID, quick: { maxClipDuration: 30, focus: 'all' } });
  ok('when Google refuses the install\'s key, the customer is told — no clips are invented', !refused.success && refused.code === 'ai_failed' && !refused.analysis, refused);
  gemini.state.refuseUploadFor.clear();
}

console.log('\nIn a browser');
br = await pw.chromium.launch();
const errs = [];
const toGoogle = [];
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
for (const width of [1280, 390]) {
  const ctx = await br.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`${width}: ${e}`));
  page.on('request', q => { if (/generativelanguage\.googleapis\.com|:8895\b/.test(q.url())) toGoogle.push(`${width}: ${q.method()} ${q.url()}`); });
  /* What an older build left behind: removed on load, never read. */
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('crm_gemini_key', 'AIzaLEFTOVERKEY'); sessionStorage.setItem('seeded', '1'); } } catch { /* */ } });
  await page.goto(`${B}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email or username').fill(ME.email, { timeout: 15_000 });
  await page.getByLabel('Password', { exact: true }).fill(ME.pw);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(2500);
  await page.goto(`${B}/video-studio?tab=quick-shorts`, { waitUntil: 'networkidle' });
  const before = gemini.state.files.size;
  /* The first-day welcome card sits over the bottom of a phone screen — closed, as a person would. */
  const welcome = page.getByText('Welcome — your 7-day trial has started');
  if (await welcome.isVisible().catch(() => false)) await welcome.locator('xpath=..').getByRole('button').first().click().catch(() => undefined);
  await page.getByTestId('vs-embed-quick-shorts').getByRole('button', { name: /New video|Add a video/ }).first().click();
  await page.getByTestId('qs-file').setInputFiles(VIDEO);
  await page.screenshot({ path: path.join(state, `shot-quick-upload-${width}.png`) });
  await page.getByTestId('qs-generate').click({ timeout: 10_000 });
  let done = false;
  for (let i = 0; i < 90 && !done; i++) {
    done = await page.getByText('How AI Prospecting finds 30 businesses a day').first().isVisible().catch(() => false);
    if (!done) await sleep(1000);
  }
  ok(`${width}: Quick Shorts shows clips from the uploaded file`, done, (await page.locator('body').innerText()).slice(0, 400));
  const f = [...gemini.state.files.values()].slice(before);
  ok(`${width}: …analysed by the Worker on the install's key, the file deleted after`, f.length === 1 && f[0].sha === SHA && f[0].key === AI_KEY && f[0].deleted, f.map(x => ({ key: x.key.slice(0, 9), deleted: x.deleted })));
  const stored = await page.evaluate(() => Object.keys(localStorage).filter(k => /gemini/i.test(k)));
  ok(`${width}: no Gemini key is kept in the browser (a leftover one is removed)`, stored.length === 0, stored);
  ok(`${width}: no sideways scroll`, (await overflow(page)) <= 0, await overflow(page));
  await page.screenshot({ path: path.join(state, `shot-quick-shorts-${width}.png`) });
  await ctx.close();
}
ok('the browser sent nothing to Google (or to its stand-in)', toGoogle.length === 0, toGoogle);
ok('no page errors', errs.length === 0, errs);
await br.close();

console.log(`\n${failures ? `${failures} FAILED` : 'All passed'}`);
stop();
process.exit(failures ? 1 : 0);
