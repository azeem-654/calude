/**
 * The AI key pool, end to end: when one key fails for a reason that is the
 * key's, the customer is answered on the next one and never sees the error.
 *
 *   VITE_BASE=/ npm run build
 *   npm run test:aikeys
 *
 * Self-contained, like test:platform: a mock of Gemini on 127.0.0.1:8833 that
 * answers per key, a fresh D1, `wrangler dev` on :8822 (inspector :9322) with
 * GEMINI_BASE pointed at the mock. Keys in the mock:
 *   QUOTA — 429, daily quota spent      SPARE — answers ("from SPARE")
 *   DEAD  — 403 PERMISSION_DENIED        THIRD — answers ("from THIRD")
 *   anything else — ListModels says API_KEY_INVALID
 *
 * What it proves:
 *  - only the owner manages the keys; a key is proved before it is kept,
 *    refused at its box when it is wrong, and never returned;
 *  - a customer's request through /api/ai.php and a server-side call
 *    (intake transcribe → askGeminiParts) both fail over QUOTA → SPARE and
 *    succeed; the failed key then rests and is not asked first next time;
 *  - a request Google rejects for its own content is not repeated on every key;
 *  - with every key dead the customer gets one plain message, not a crash;
 *  - the card on Platform services at 1280 and 390, no key on the page.
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const PORT = Number(process.env.PORT ?? 8822), MOCK = Number(process.env.MOCK_PORT ?? 8833), INSPECT = Number(process.env.INSPECT_PORT ?? 9322);
const B = `http://localhost:${PORT}`;
const G = `http://127.0.0.1:${MOCK}`;
let fail = 0, pass = 0;
const ok = (name, cond, detail = '') => { if (cond) pass++; else fail++; console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ` — ${String(detail).slice(0, 500)}`}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!fs.existsSync('dist/index.html')) { console.log('Build first: VITE_BASE=/ npm run build'); process.exit(2); }

/* ── The Gemini mock ── */
const K = tag => `AIza${tag}${'x'.repeat(35 - tag.length)}`;
const QUOTA = K('QUOTA'), SPARE = K('SPARE'), DEAD = K('DEAD'), THIRD = K('THIRD'), WRONG = K('WRONG');
const KNOWN = new Set([QUOTA, SPARE, DEAD, THIRD]);
const name = k => (k === QUOTA ? 'QUOTA' : k === SPARE ? 'SPARE' : k === DEAD ? 'DEAD' : k === THIRD ? 'THIRD' : 'other');
let calls = [];
const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const mock = http.createServer((req, res) => {
  let raw = '';
  req.on('data', c => { raw += c; });
  req.on('end', () => {
    const u = new URL(req.url, G);
    const key = u.searchParams.get('key') ?? '';
    if (req.method === 'GET' && u.pathname === '/v1beta/models') {
      if (!KNOWN.has(key)) return send(res, 400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.', details: [{ reason: 'API_KEY_INVALID' }] } });
      return send(res, 200, { models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] });
    }
    if (req.method === 'POST' && /:generateContent$/.test(u.pathname)) {
      calls.push(name(key));
      if (key === QUOTA) return send(res, 429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 250, per day' } });
      if (key === DEAD) return send(res, 403, { error: { code: 403, status: 'PERMISSION_DENIED', message: 'Your API key was reported as leaked. Please use another API key.' } });
      if (!KNOWN.has(key)) return send(res, 400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid.', details: [{ reason: 'API_KEY_INVALID' }] } });
      if (raw.includes('BADREQUEST')) return send(res, 400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Request contains an invalid argument.' } });
      const text = raw.includes('Transcribe') ? JSON.stringify({ text: `hello from ${name(key)}`, language: 'en', clarity: 'clear' }) : `answer from ${name(key)}`;
      return send(res, 200, { candidates: [{ content: { parts: [{ text }] } }] });
    }
    send(res, 404, { error: { code: 404, message: `mock has no ${req.method} ${u.pathname}` } });
  });
});
await new Promise(r => mock.listen(MOCK, '127.0.0.1', r));

/* ── A fresh database and the real Worker ── */
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'aikeys-d1-'));
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
const vars = [`APP_ORIGIN:${B}`, `GEMINI_BASE:${G}`];
const wr = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--inspector-port', String(INSPECT), '--persist-to', persist, ...vars.flatMap(v => ['--var', v])], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
let wlog = '';
wr.stdout.on('data', c => { wlog += c; }); wr.stderr.on('data', c => { wlog += c; });
let br = null;
const stop = () => { try { process.kill(-wr.pid, 'SIGTERM'); } catch { /* gone */ } mock.close(); };
process.on('exit', stop);
process.on('uncaughtException', async e => { console.log(e); await sleep(3000); console.log(wlog.slice(-3000)); stop(); process.exit(1); });
for (let i = 0; i < 90; i++) { try { const r = await fetch(`${B}/api/data.php`, { method: 'POST', headers: { Connection: 'close' }, body: '{"action":"ping"}' }); if (r.ok) break; } catch { /* starting */ } await sleep(1000); }

let ipN = 1;
const raw = (p, body) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.9.6.${ipN++ % 250}` }, body: JSON.stringify(body) });
const api = (p, body) => raw(p, body).then(r => r.json().catch(() => ({})));
const apiS = (p, body) => raw(p, body).then(async r => ({ status: r.status, text: await r.clone().text(), d: await r.json().catch(() => ({})) }));

console.log('\nAI keys — main and backups');
const OWNER = 'owner@aikeys.test', PW = 'Tq9!vX2#pLm7wZ-keys';
const boot = await api('auth.php', { action: 'bootstrap', email: OWNER, password: PW, name: 'Owner' });
if (!boot.success) { console.log('bootstrap failed', boot, wlog.slice(-2000)); stop(); process.exit(2); }
const T = (await api('auth.php', { action: 'login', email: OWNER, password: PW })).token;
const reg = await api('auth.php', { action: 'register', email: 'cara@cust.test', password: 'Another-horse-7cara', name: 'Cara' });
const C = { token: reg.token, acct: reg.user?.accountId };
ok('a customer signs up', !!(C.token && C.acct), JSON.stringify(reg).slice(0, 200));
const keys = (who = T, action = 'status', extra = {}) => apiS('aikeys.php', { token: who, action, ...extra });

/* ── Only the owner, and only good keys ── */
let r = await keys(C.token);
ok('a customer is refused the AI keys', r.status === 403 && r.d.code === 'not_owner', JSON.stringify(r.d));
r = await keys(T);
ok('the owner starts with no keys', r.d.success && r.d.keys?.length === 0, JSON.stringify(r.d));
let ai = await apiS('ai.php', { token: C.token, accountId: C.acct, action: 'generate', request: { contents: [{ parts: [{ text: 'hi' }] }] } });
ok('with no key at all, the customer is told AI is unavailable, by code', ai.d.code === 'no_ai', JSON.stringify(ai.d));
r = await keys(T, 'add', { apiKey: 'sk-not-google', label: 'x' });
ok('a key that is not a Google key is refused at its box', !r.d.success && r.d.field === 'aikeys.key', JSON.stringify(r.d));
r = await keys(T, 'add', { apiKey: WRONG, label: 'x' });
ok('a key Google refuses is not kept', !r.d.success && /Google refused/.test(r.d.error) && r.d.field === 'aikeys.key', JSON.stringify(r.d));
r = await keys(T, 'add', { apiKey: QUOTA, label: 'Project one' });
ok('a working key is added', r.d.success && r.d.keys?.length === 1, JSON.stringify(r.d));
r = await keys(T, 'add', { apiKey: SPARE, label: 'Project two' });
ok('…and a second, after it', r.d.success && r.d.keys?.map(k => k.label).join() === 'Project one,Project two', JSON.stringify(r.d));
r = await keys(T, 'add', { apiKey: QUOTA, label: 'again' });
ok('the same key twice is refused', !r.d.success && /already/.test(r.d.error), JSON.stringify(r.d));
r = await keys(T);
ok('no key comes back, whole or in part', ![QUOTA, SPARE].some(k => r.text.includes(k) || r.text.includes(k.slice(-6))), r.text.slice(0, 300));

/* ── A customer's request through /api/ai.php ── */
calls = [];
ai = await apiS('ai.php', { token: C.token, accountId: C.acct, action: 'generate', request: { contents: [{ parts: [{ text: 'Write a line' }] }] } });
const answered = ai.d.response?.candidates?.[0]?.content?.parts?.[0]?.text;
ok('the customer is answered although the first key is out of quota', ai.d.success && answered === 'answer from SPARE', JSON.stringify(ai.d).slice(0, 300));
ok('…because the request moved from the first key to the second', calls[0] === 'QUOTA' && calls[calls.length - 1] === 'SPARE', calls.join(' → '));
r = await keys(T);
const [q, s] = r.d.keys ?? [];
ok('the spent key is resting, with Google\'s reason', !!q?.restingUntil && /429/.test(q.lastError) && /per day/.test(q.lastError), JSON.stringify(q));
ok('…for about an hour (a daily quota)', q?.restingUntil && Date.parse(q.restingUntil) - Date.now() > 50 * 60_000, q?.restingUntil);
ok('the second key is recorded as working', !!s?.lastOkAt && !s.restingUntil, JSON.stringify(s));

calls = [];
ai = await apiS('ai.php', { token: C.token, accountId: C.acct, action: 'generate', request: { contents: [{ parts: [{ text: 'Another' }] }] } });
ok('the next request goes to the working key first, not the resting one', ai.d.success && calls.join() === 'SPARE', calls.join(' → '));

calls = [];
ai = await apiS('ai.php', { token: C.token, accountId: C.acct, action: 'generate', request: { contents: [{ parts: [{ text: 'BADREQUEST' }] }] } });
ok('a request Google rejects for itself is not repeated on every key', !ai.d.success && calls.length === 1, `${calls.join(' → ')} ${JSON.stringify(ai.d)}`);

/* ── A server-side call: the wizard's transcription (askGeminiParts) ── */
r = await keys(T, 'move', { id: (await keys(T)).d.keys[1].id, dir: 'up' });
ok('the owner can change the order', r.d.keys?.map(k => k.label).join() === 'Project two,Project one', JSON.stringify(r.d.keys?.map(k => k.label)));
r = await keys(T, 'add', { apiKey: DEAD, label: 'Leaked one' });
await keys(T, 'move', { id: r.d.keys.find(k => k.label === 'Leaked one').id, dir: 'up' });
await keys(T, 'move', { id: (await keys(T)).d.keys.find(k => k.label === 'Leaked one').id, dir: 'up' });
r = await keys(T);
ok('a third key moved to the front', r.d.keys?.[0]?.label === 'Leaked one', JSON.stringify(r.d.keys?.map(k => k.label)));
calls = [];
const tr = await api('intake.php', { token: C.token, accountId: C.acct, action: 'transcribe', mime: 'audio/wav', audio: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=' });
ok('a server-side call fails over too: the refused key, then the working one', tr.success && tr.text === 'hello from SPARE' && calls[0] === 'DEAD' && calls.includes('SPARE'), `${calls.join(' → ')} ${JSON.stringify(tr)}`);
r = await keys(T);
ok('the refused key rests for half an hour', (Date.parse(r.d.keys[0].restingUntil) - Date.now()) > 25 * 60_000 && /403/.test(r.d.keys[0].lastError), JSON.stringify(r.d.keys[0]));

/* ── Test, remove, and every key gone bad ── */
r = await keys(T, 'test', { index: 1 });
ok('"Test" asks Google on exactly that key and says it works', r.d.tested?.ok === true, JSON.stringify(r.d.tested));
r = await keys(T, 'test', { index: 2 });
ok('…and says when one does not', r.d.tested?.ok === false && /limit|quota/i.test(r.d.tested.error), JSON.stringify(r.d.tested));
for (const k of (await keys(T)).d.keys.filter(k => k.label !== 'Leaked one')) await keys(T, 'remove', { id: k.id });
r = await keys(T);
ok('keys can be removed', r.d.keys?.length === 1, JSON.stringify(r.d.keys?.map(k => k.label)));
ai = await apiS('ai.php', { token: C.token, accountId: C.acct, action: 'generate', request: { contents: [{ parts: [{ text: 'hi' }] }] } });
ok('with every key refused, the customer gets one plain message', !ai.d.success && typeof ai.d.error === 'string' && ai.status < 500, JSON.stringify(ai.d));
await keys(T, 'add', { apiKey: THIRD, label: 'Fresh project' });

/* ── The card ── */
br = await pw.chromium.launch();
const errs = [];
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
fs.mkdirSync('test-results', { recursive: true });
for (const width of [1280, 390]) {
  const ctx = await br.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(`${B}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email or username').fill(OWNER);
  await page.getByLabel('Password', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(2500);
  await page.goto(`${B}/settings?tab=platform`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const card = page.locator('#platform-ai-keys');
  const text = await card.innerText().catch(() => '');
  ok(`owner @${width}: the AI keys card lists the keys in order with their state`, /AI keys — main and backups/.test(text) && /Leaked one/.test(text) && /Fresh project/.test(text) && /Resting until/.test(text), text.slice(0, 400));
  const html = await page.content();
  ok(`owner @${width}: no key on the page`, ![QUOTA, SPARE, DEAD, THIRD].some(k => html.includes(k)));
  ok(`owner @${width}: no sideways scroll`, (await overflow(page)) <= 0, String(await overflow(page)));
  if (width === 1280) {
    await card.locator('[data-field="aikeys.key"]').fill(WRONG);
    await card.getByRole('button', { name: /Add backup key/ }).click();
    await card.getByRole('status').waitFor({ timeout: 10_000 }).catch(() => {});
    ok('owner: a refused key is said on the card', /Google refused/.test(await card.innerText()), (await card.innerText()).slice(-300));
    const dead = await page.evaluate(() => (window).__deadEnds ?? []);
    ok('owner: no dead end — the refusal names a box on screen', !dead.length, JSON.stringify(dead));
  }
  await page.screenshot({ path: `test-results/aikeys-${width}.png`, fullPage: false });
  await ctx.close();
}
ok('no page errors', !errs.length, errs.join(' | '));

await br.close();
console.log(`\n${pass} passed, ${fail} failed`);
stop();
process.exit(fail ? 1 : 0);
