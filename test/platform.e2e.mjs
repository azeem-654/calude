/**
 * Platform services and prospect search on the owner's Google Maps key, end to
 * end: a local mock of Places API (New) reads the requests this app sends, so
 * what is proved is the key header, the field mask and the body Google would
 * see — and that nothing reaches Google when it must not.
 *
 *   VITE_BASE=/ npm run build
 *   npm run test:platform
 *
 * Self-contained: it starts the mock on 127.0.0.1:8833, migrates a fresh D1
 * into a temporary directory, runs `wrangler dev` on :8822 (inspector :9322)
 * with GOOGLE_PLACES_BASE pointed at the mock, drives the API and the screens
 * at 1280 and 390 wide, and stops everything it started.
 *
 * What it covers, in the order the owner asked:
 *  - the owner sets the install key; it is never returned and is encrypted;
 *  - a customer's search uses it and reaches Google with the right request;
 *  - no key, an exhausted budget and an ended trial are each refused by name,
 *    and none of the three reaches Google;
 *  - a key Google refuses shows as refused on Platform services;
 *  - a customer cannot see or use Platform services (server and tab), nor
 *    search through a workspace that is not theirs.
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

/* Overridable because several sessions share this machine; the defaults are this test's own. */
const PORT = Number(process.env.PORT ?? 8822), MOCK = Number(process.env.MOCK_PORT ?? 8833), INSPECT = Number(process.env.INSPECT_PORT ?? 9322);
const B = `http://localhost:${PORT}`;
const G = `http://127.0.0.1:${MOCK}`;
let fail = 0, pass = 0;
const ok = (name, cond, detail = '') => { if (cond) pass++; else fail++; console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ` — ${String(detail).slice(0, 500)}`}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!fs.existsSync('dist/index.html')) { console.log('Build first: VITE_BASE=/ npm run build'); process.exit(2); }

/* ── The Places mock ── */
const K = c => `AIza${c.repeat(35)}`;
const IKEY = K('I'), BADKEY = K('X'), INJECTED = K('Z');
const VALID = new Set([IKEY, INJECTED]);
const PAGE2 = 'page2token-abcdefghijklmnop';
const seen = [];
const place = (id, name, extra = {}) => ({
  id, displayName: { text: name }, formattedAddress: `${id.slice(-2)} Oxford Rd, Manchester, UK`,
  location: { latitude: 53.47, longitude: -2.23 }, primaryTypeDisplayName: { text: 'Plumber' },
  businessStatus: 'OPERATIONAL', googleMapsUri: `https://maps.google.com/?cid=${id.slice(-2)}`,
  nationalPhoneNumber: '0161 555 0100', websiteUri: 'https://bobtheplumber.example/', rating: 4.7, userRatingCount: 88, ...extra,
});
const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const mock = http.createServer((req, res) => {
  let raw = '';
  req.on('data', c => { raw += c; });
  req.on('end', () => {
    const u = new URL(req.url, G);
    const key = String(req.headers['x-goog-api-key'] ?? '');
    seen.push({ method: req.method, path: u.pathname, key, mask: String(req.headers['x-goog-fieldmask'] ?? ''), body: raw });
    if (!VALID.has(key)) {
      return send(res, 400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.', details: [{ reason: 'API_KEY_INVALID' }] } });
    }
    if (u.pathname === '/v1/places:searchText' && req.method === 'POST') {
      const b = JSON.parse(raw || '{}');
      if (b.pageToken === PAGE2) return send(res, 200, { places: [place('ChIJplumber00004', 'Dee Drains')] });
      return send(res, 200, {
        places: [
          place('ChIJplumber00001', 'Bob the Plumber'),
          place('ChIJplumber00002', 'Closed Pipes Ltd', { businessStatus: 'CLOSED_PERMANENTLY' }),
          place('ChIJplumber00003', 'Cara Heating', { businessStatus: 'CLOSED_TEMPORARILY', websiteUri: undefined }),
        ],
        nextPageToken: PAGE2,
      });
    }
    send(res, 404, { error: { code: 404, message: `mock has no ${req.method} ${u.pathname}` } });
  });
});
await new Promise(r => mock.listen(MOCK, '127.0.0.1', r));

/* ── A fresh database and the real Worker ── */
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-d1-'));
const sql = q => JSON.parse(execSync(`npx wrangler d1 execute crmpro --local --persist-to ${persist} --json --command ${JSON.stringify(q)}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
const vars = [`APP_ORIGIN:${B}`, `GOOGLE_PLACES_BASE:${G}`];
/* Its own process group (detached), so stopping it stops workerd as well. */
const wr = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--inspector-port', String(INSPECT), '--persist-to', persist, ...vars.flatMap(v => ['--var', v])], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
let wlog = '';
wr.stdout.on('data', c => { wlog += c; }); wr.stderr.on('data', c => { wlog += c; });
let br = null;
const stop = () => { try { process.kill(-wr.pid, 'SIGTERM'); } catch { /* gone */ } mock.close(); };
process.on('exit', stop);
process.on('uncaughtException', async e => { console.log(e); await sleep(3000); console.log(wlog.slice(-3000)); stop(); process.exit(1); });
for (let i = 0; i < 90; i++) { try { const r = await fetch(`${B}/api/data.php`, { method: 'POST', headers: { Connection: 'close' }, body: '{"action":"ping"}' }); if (r.ok) break; } catch { /* starting */ } await sleep(1000); }

let ipN = 1;
/* `Connection: close`, because `sql()` blocks this process for seconds while
   wrangler runs: a kept-alive socket the Worker closed meanwhile would be
   reused afterwards and fail as "other side closed", which is not the app. */
const raw = (p, body) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.9.4.${ipN++ % 250}` }, body: JSON.stringify(body) });
const api = (p, body) => raw(p, body).then(r => r.json().catch(() => ({})));
const apiS = (p, body) => raw(p, body).then(async r => ({ status: r.status, d: await r.json().catch(() => ({})) }));

console.log('\nPlatform services and prospect search');
const OWNER = 'owner@platform.test', PW = 'Tq9!vX2#pLm7wZ-plat';
const boot = await api('auth.php', { action: 'bootstrap', email: OWNER, password: PW, name: 'Owner' });
if (!boot.success) { console.log('bootstrap failed', boot, wlog.slice(-2000)); stop(); process.exit(2); }
const T = (await api('auth.php', { action: 'login', email: OWNER, password: PW })).token;

const customer = async (tag) => {
  const email = `${tag}@cust.test`, password = `Another-horse-7${tag}`;
  const r = await api('auth.php', { action: 'register', email, password, name: tag });
  const tok = r.token ?? (await api('auth.php', { action: 'login', email, password })).token;
  return { email, password, token: tok, acct: r.user?.accountId };
};
const C = await customer('cara');
const D = await customer('dan');
const E = await customer('eve');
ok('three customers sign up, each with a workspace', !!(C.token && C.acct && D.acct && E.acct), JSON.stringify([C.acct, D.acct, E.acct]));
const pros = (who, action, extra = {}, acct = who.acct) => apiS('prospects.php', { token: who.token, accountId: acct, action, ...extra });

/* ── No key at all ── */
let r = await pros(C, 'status');
ok('status: Google is unavailable, by name, before anybody searches',
  r.d.success && r.d.google?.available === false && r.d.google.code === 'no_key'
  && r.d.google.error === 'Prospect search needs the Google Maps key — the owner sets it in Settings → Platform services.', JSON.stringify(r.d));
seen.length = 0;
r = await pros(C, 'search', { trade: 'plumber', place: 'Manchester' });
ok('a search with no key is refused by name', !r.d.success && r.d.code === 'no_key' && /needs the Google Maps key/.test(r.d.error), JSON.stringify(r.d));
ok('…and reached nothing', seen.length === 0, JSON.stringify(seen));
r = await pros(C, 'search', { trade: '', place: 'Manchester' });
ok('an empty trade is refused at its box', !r.d.success && r.d.field === 'prospects.trade', JSON.stringify(r.d));
r = await pros(C, 'search', { trade: 'plumber', place: '' });
ok('an empty place is refused at its box', !r.d.success && r.d.field === 'prospects.place', JSON.stringify(r.d));

/* ── Platform services is the owner's ── */
r = await apiS('platform.php', { token: C.token, action: 'status' });
ok('a customer is refused Platform services by the server', r.status === 403 && !r.d.success && r.d.code === 'not_owner', JSON.stringify(r));
r = await apiS('platform.php', { action: 'status' });
ok('…and so is nobody at all', r.status === 401, JSON.stringify(r));
r = await apiS('reputation.php', { token: C.token, action: 'save_install_key', apiKey: INJECTED });
ok('a customer cannot set the Google Maps key', r.status === 403 && !r.d.success, JSON.stringify(r.d));
r = await apiS('platform.php', { token: T, action: 'status' });
const svc = id => (r.d.services ?? []).find(s => s.id === id);
ok('the owner reads every service', r.d.success && ['ai', 'google_places', 'google_oauth', 'payments', 'system_mail', 'digital_setup', 'turn', 'voice', 'wrap'].every(id => !!svc(id)), JSON.stringify(r.d).slice(0, 400));
ok('…and the Google Maps key is "off" with what it powers', svc('google_places')?.state === 'off' && /Prospect search/.test(svc('google_places').powers), JSON.stringify(svc('google_places')));

/* ── The owner sets the key ── */
r = await apiS('reputation.php', { token: T, action: 'save_install_key', apiKey: IKEY });
ok('the owner saves the install key, and it is not echoed', r.d.success && r.d.set && r.d.status === 'unknown' && !JSON.stringify(r.d).includes(IKEY), JSON.stringify(r.d));
ok('…and it is encrypted at rest', !JSON.stringify(sql("SELECT credentials FROM crm_install_providers WHERE kind = 'google_places'")).includes(IKEY));
r = await apiS('reputation.php', { token: T, action: 'test_install_key' });
ok('Test connection proves it with Google', r.d.success && r.d.status === 'ok' && !!r.d.checkedAt, JSON.stringify(r.d));
r = await apiS('platform.php', { token: T, action: 'status' });
ok('Platform services: Google Maps "ok", with when it was proved', svc('google_places')?.state === 'ok' && !!svc('google_places').checkedAt, JSON.stringify(svc('google_places')));
ok('…and no key in the answer', !JSON.stringify(r.d).includes('AIza'), JSON.stringify(r.d).slice(0, 200));

/* ── A customer searches on it ── */
r = await pros(C, 'status');
ok('status: now available, on the install key', r.d.google?.available === true && r.d.google.whose === 'install', JSON.stringify(r.d));
seen.length = 0;
r = await pros(C, 'search', { trade: 'plumber', place: 'Manchester', apiKey: INJECTED, key: INJECTED });
const firstPage = r.d;
ok('the customer\'s search succeeds with Google\'s results', r.d.success && r.d.source === 'google' && r.d.prospects?.some(p => p.name === 'Bob the Plumber'), JSON.stringify(r.d).slice(0, 400));
const req1 = seen.find(s => s.path === '/v1/places:searchText');
ok('…POST /v1/places:searchText reached the mock', !!req1 && req1.method === 'POST', JSON.stringify(seen));
ok('…with the owner\'s key in X-Goog-Api-Key — never one from the request body', req1?.key === IKEY, req1?.key);
ok('…with a field mask asking for phone, website and the next page, and no reviews',
  /places\.nationalPhoneNumber/.test(req1?.mask) && /places\.websiteUri/.test(req1?.mask) && /nextPageToken/.test(req1?.mask) && !/reviews/.test(req1?.mask), req1?.mask);
ok('…and the body Google expects', (() => { const b = JSON.parse(req1?.body || '{}'); return b.textQuery === 'plumber in Manchester' && b.pageSize === 20 && !b.pageToken; })(), req1?.body);
ok('a permanently closed business is left out', !firstPage.prospects?.some(p => p.name === 'Closed Pipes Ltd'));
ok('a temporarily closed one is kept and marked', firstPage.prospects?.find(p => p.name === 'Cara Heating')?.temporarilyClosed === true);
ok('each lead carries its place id, phone, rating and Maps link, and no invented email',
  (() => { const p = firstPage.prospects?.find(x => x.name === 'Bob the Plumber'); return p?.placeId === 'ChIJplumber00001' && p.phone === '0161 555 0100' && p.rating === 4.7 && p.mapsUrl?.startsWith('https://') && p.email === ''; })(), JSON.stringify(firstPage.prospects?.[0]));
ok('Google is named as the source', firstPage.attribution === 'Google Maps' && firstPage.nextPageToken === PAGE2, JSON.stringify([firstPage.attribution, firstPage.nextPageToken]));
seen.length = 0;
r = await pros(C, 'search', { trade: 'plumber', place: 'Manchester', pageToken: PAGE2 });
ok('"More results" asks for the next page with Google\'s token', r.d.success && r.d.prospects?.[0]?.name === 'Dee Drains' && JSON.parse(seen[0]?.body || '{}').pageToken === PAGE2, JSON.stringify(r.d).slice(0, 300));
r = await pros(C, 'search', { trade: 'plumber', place: 'Manchester', pageToken: 'not a token"; drop' });
ok('a page token Google never gave out is refused', !r.d.success, JSON.stringify(r.d));
seen.length = 0;
r = await pros(C, 'search', { query: 'dentist in Leeds' });
ok('the AI Sales Agent\'s one-line search goes through the same door', r.d.success && JSON.parse(seen[0]?.body || '{}').textQuery === 'dentist in Leeds', JSON.stringify(seen));
r = await apiS('places-search.php', { token: C.token, apiKey: INJECTED, query: 'plumber' });
ok('the old proxy that took a key in the body is gone', r.status === 410, JSON.stringify(r));

/* ── Not somebody else's workspace ── */
seen.length = 0;
r = await pros(C, 'search', { trade: 'plumber', place: 'Manchester' }, D.acct);
ok('C cannot search through D\'s workspace', r.status === 403 && !r.d.success, JSON.stringify(r));
r = await pros(C, 'status', {}, D.acct);
ok('…nor read its status', r.status === 403, JSON.stringify(r));
ok('…and nothing reached Google', seen.length === 0, JSON.stringify(seen));
r = await apiS('prospects.php', { action: 'search', accountId: C.acct, trade: 'plumber', place: 'Manchester' });
ok('no session, no search', r.status === 401, JSON.stringify(r));

/* ── The meter ── */
r = await apiS('reputation.php', { token: T, action: 'install_key_status' });
ok('the owner sees this month\'s searches on their key', r.d.usage?.install.prospects === 3 && r.d.usage.workspaces === 1, JSON.stringify(r.d.usage));

/* ── An ended trial stops the owner's key ── */
sql(`UPDATE crm_users SET trial_ends_at = '2020-01-01T00:00:00.000Z' WHERE email = '${D.email}'`);
seen.length = 0;
r = await pros(D, 'search', { trade: 'plumber', place: 'Manchester' });
ok('after the trial ends, a search is refused by name', !r.d.success && r.d.code === 'trial_ended' && /trial has ended/.test(r.d.error), JSON.stringify(r.d));
ok('…and reached nothing', seen.length === 0, JSON.stringify(seen));
r = await pros(D, 'status');
ok('…and the screen is told before anybody types', r.d.google?.available === false && r.d.google.code === 'trial_ended', JSON.stringify(r.d));

/* ── The budget ── */
let refused = null, served = 0;
for (let i = 0; i < 24 && !refused; i++) {
  const x = await pros(E, 'search', { trade: 'cafe', place: 'York' });
  if (x.d.success) served++; else refused = x;
}
ok('a workspace gets 20 searches an hour on the owner\'s key', served === 20, String(served));
ok('…and the 21st is refused by name', refused?.status === 429 && refused.d.code === 'places_budget' && /20 an hour/.test(refused.d.error), JSON.stringify(refused?.d));
seen.length = 0;
r = await pros(E, 'search', { trade: 'cafe', place: 'York' });
ok('…without reaching Google', !r.d.success && seen.length === 0, JSON.stringify(seen));
r = await pros(C, 'search', { trade: 'cafe', place: 'York' });
ok('another workspace\'s budget is its own', r.d.success, JSON.stringify(r.d).slice(0, 200));

/* ── A key Google refuses is shown as refused ── */
await api('reputation.php', { token: T, action: 'save_install_key', apiKey: BADKEY });
r = await pros(C, 'search', { trade: 'plumber', place: 'Leeds' });
ok('a refused key is reported to the customer by name', !r.d.success && r.d.code === 'bad_key' && /not a valid key/.test(r.d.error), JSON.stringify(r.d));
r = await apiS('platform.php', { token: T, action: 'status' });
ok('…and Platform services shows it needs attention, with Google\'s reason', svc('google_places')?.state === 'error' && /not a valid key/.test(svc('google_places').lastError), JSON.stringify(svc('google_places')));
await api('reputation.php', { token: T, action: 'save_install_key', apiKey: IKEY });
await api('reputation.php', { token: T, action: 'test_install_key' });

/* ── The screens ── */
br = await pw.chromium.launch();
const errs = [];
const signIn = async (email, password, width) => {
  const ctx = await br.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`${email}@${width}: ${e}`));
  await page.goto(`${B}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email or username').fill(email, { timeout: 10_000 }).catch(async e => {
    await page.screenshot({ path: `test-results/signin-${width}.png` });
    console.log((await page.locator('body').innerText()).slice(0, 600));
    throw e;
  });
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(2500);
  return { ctx, page };
};
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
fs.mkdirSync('test-results', { recursive: true });

for (const width of [1280, 390]) {
  const { ctx, page } = await signIn(OWNER, PW, width);
  await page.goto(`${B}/settings?tab=platform`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  ok(`owner @${width}: the Platform services tab is listed`, (await page.getByRole('button', { name: /^Platform services/ }).count()) > 0);
  const list = page.locator('[data-testid="platform-services"]');
  ok(`owner @${width}: the services are listed with their state`, await list.isVisible() && /Google Maps \(Places API\)[\s\S]*Working/.test(await list.innerText()), (await list.innerText().catch(() => '')).slice(0, 300));
  ok(`owner @${width}: the Google Maps key panel is embedded`, await page.locator('[data-field="places.installKey"]').isVisible());
  ok(`owner @${width}: this month's usage is shown`, /prospect search/.test(await page.locator('#platform-google-maps').innerText()));
  ok(`owner @${width}: no key on the page`, !(await page.content()).includes(IKEY));
  ok(`owner @${width}: no sideways scroll`, (await overflow(page)) <= 0, String(await overflow(page)));
  await page.screenshot({ path: `test-results/platform-owner-${width}.png`, fullPage: false });
  await ctx.close();
}

for (const width of [1280, 390]) {
  const { ctx, page } = await signIn(C.email, C.password, width);
  await page.goto(`${B}/settings?tab=platform`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  ok(`customer @${width}: no Platform services tab`, (await page.getByRole('button', { name: /^Platform services/ }).count()) === 0);
  ok(`customer @${width}: ?tab=platform shows nothing of it`, (await page.locator('[data-testid="platform-services"]').count()) === 0 && (await page.locator('[data-field="places.installKey"]').count()) === 0);

  await page.goto(`${B}/contacts`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const findBtn = page.getByRole('button', { name: /Find businesses/ }).first();
  ok(`customer @${width}: Find businesses has no SOON label`, !/SOON/.test(await findBtn.innerText()), await findBtn.innerText());
  await findBtn.click();
  const dlg = page.getByRole('dialog', { name: 'Find businesses' });
  ok(`customer @${width}: the screen says Google Maps, nothing to connect`, /From Google Maps/.test(await dlg.innerText()));
  await dlg.locator('[data-field="prospects.trade"]').fill('plumber');
  await dlg.locator('[data-field="prospects.place"]').fill('Manchester');
  await dlg.getByRole('button', { name: /^Search$/ }).click();
  await dlg.getByText('Bob the Plumber').waitFor({ timeout: 10_000 }).catch(() => {});
  const text = await dlg.innerText();
  ok(`customer @${width}: results from Google appear, named as such`, /Bob the Plumber/.test(text) && /Results from Google Maps/.test(text) && /More results/.test(text), text.slice(0, 400));
  ok(`customer @${width}: no sideways scroll`, (await overflow(page)) <= 0, String(await overflow(page)));
  await page.screenshot({ path: `test-results/prospects-customer-${width}.png`, fullPage: false });
  if (width === 1280) {
    await dlg.getByText('Bob the Plumber').click();
    await dlg.getByText(/Clause 3 of the acceptable use policy/).click();
    await dlg.getByRole('button', { name: /Add 1 to Contacts/ }).click();
    await page.waitForTimeout(800);
    const stored = await page.evaluate(() => {
      const k = Object.keys(localStorage).find(x => /crm_contacts$/.test(x));
      const rows = k ? JSON.parse(localStorage.getItem(k) || '[]') : [];
      return rows.find(c => c.name === 'Bob the Plumber') ?? null;
    });
    ok('an imported lead keeps the place id and says it came from Google Maps',
      stored?.customFields?.googlePlaceId === 'ChIJplumber00001' && /^Google Maps · plumber in Manchester/.test(stored.source ?? '') && stored.status === 'prospect', JSON.stringify(stored));
  }
  await ctx.close();
}
ok('no page errors', !errs.length, errs.join(' | '));

await br.close();
console.log(`\n${pass} passed, ${fail} failed`);
stop();
process.exit(fail ? 1 : 0);
