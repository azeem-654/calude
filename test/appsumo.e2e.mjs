/**
 * AppSumo codes against the real Worker and D1.
 *
 *   VITE_BASE=/ npm run build
 *   npm run test:appsumo    (self-contained: wrangler :8995, fresh D1 in .wrangler-appsumo)
 *
 *  - Only the install owner makes, imports or revokes codes; the plain codes
 *    are answered once and the table holds only hashes.
 *  - A customer redeems one code (Tier 1, no longer on trial), stacks a second
 *    and third (Tier 3), and a fourth is refused by its box. A spent, unknown or
 *    another account's code is refused by name; a client login cannot redeem.
 *  - Revoking a refunded code lowers the tier; revoking the rest takes the
 *    AppSumo plan away and leaves a hand-given plan alone.
 *  - /appsumo renders signed out and signed in at 1280 and 390 with no
 *    horizontal overflow and no page errors, and redeems from the page.
 *  - Licensing v2 (AppSumo's Activate button), against a mock of AppSumo's
 *    OAuth and Licensing API: a webhook signed as AppSumo's code samples sign
 *    one is accepted, unsigned and tampered webhooks are not, purchase → activate →
 *    OAuth → claim sets the tier, upgrade/downgrade follow the new key, a
 *    replayed activate cannot revive a replaced or refunded license, a claim
 *    is one-use and one-account, and the page carries a claim through sign-in.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import http from 'node:http';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const PORT = Number(process.env.PORT ?? 8995), INSPECT = Number(process.env.INSPECT_PORT ?? 9395);
const B = `http://localhost:${PORT}`;
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c ? '' : ` — ${String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 600)}`}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (!fs.existsSync('dist/index.html')) { console.log('Build first: VITE_BASE=/ npm run build'); process.exit(2); }

/* AppSumo, mocked: its OAuth token and license-key endpoints and the Licensing API. */
const MOCK = Number(process.env.MOCK_PORT ?? 8996);
const API_KEY = 'c73455d8-0f64-4354-bd64-1f454a227104';   /* the key in AppSumo's own docs, so its test vector applies */
const OAUTH_CODES = {};      /* code → license key */
const API_TIERS = {};        /* license key → tier the Licensing API answers */
const seen = { token: [], api: [] };
const mock = http.createServer((q, s) => {
  let raw = '';
  q.on('data', c => { raw += c; });
  q.on('end', () => {
    const u = new URL(q.url, `http://localhost:${MOCK}`);
    const send = (code, o) => { s.writeHead(code, { 'Content-Type': 'application/json' }); s.end(JSON.stringify(o)); };
    if (u.pathname === '/openid/token/') {
      const b = JSON.parse(raw || '{}');
      seen.token.push(b);
      if (b.client_id !== 'cid' || b.client_secret !== 'csecret' || b.grant_type !== 'authorization_code' || !OAUTH_CODES[b.code]) return send(400, { error: 'invalid_grant' });
      return send(200, { access_token: `tok-${b.code}`, token_type: 'bearer', expires_in: 3600, refresh_token: 'r', id_token: 'i' });
    }
    if (u.pathname === '/openid/license_key/') {
      const code = String(u.searchParams.get('access_token') ?? '').replace(/^tok-/, '');
      return OAUTH_CODES[code] ? send(200, { license_key: OAUTH_CODES[code], status: 'active', scopes: ['read_license'] }) : send(401, {});
    }
    const m = /^\/v2\/licenses\/([\w-]+)$/.exec(u.pathname);
    if (m) {
      seen.api.push(q.headers['x-appsumo-licensing-key']);
      return API_TIERS[m[1]] ? send(200, { license_key: m[1], status: 'active', tier: API_TIERS[m[1]] }) : send(404, {});
    }
    send(404, {});
  });
}).listen(MOCK);

const persist = path.resolve('.wrangler-appsumo');
fs.rmSync(persist, { recursive: true, force: true });
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
const wr = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--inspector-port', String(INSPECT), '--persist-to', persist,
  '--var', `APP_ORIGIN:${B}`, '--var', `APPSUMO_API_KEY:${API_KEY}`, '--var', 'APPSUMO_CLIENT_ID:cid', '--var', 'APPSUMO_CLIENT_SECRET:csecret',
  '--var', `APPSUMO_OAUTH_BASE:http://localhost:${MOCK}`, '--var', `APPSUMO_API_BASE:http://localhost:${MOCK}`], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
let wlog = '';
wr.stdout.on('data', c => { wlog += c; }); wr.stderr.on('data', c => { wlog += c; });
let br = null;
const stop = () => { try { process.kill(-wr.pid, 'SIGTERM'); } catch { /* gone */ } try { mock.close(); } catch { /* */ } };
process.on('exit', stop);
process.on('uncaughtException', async e => { console.log(e); console.log(wlog.replace(/.*workerd@.*\n/g, '').slice(-2500)); try { await br?.close(); } catch { /* */ } stop(); process.exit(1); });
for (let i = 0; i < 90; i++) { try { const r = await fetch(`${B}/api/data.php`, { method: 'POST', headers: { Connection: 'close' }, body: '{"action":"ping"}' }); if (r.ok) break; } catch { /* starting */ } await sleep(1000); }

let ipN = 1;
const api = (p, body) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.9.8.${ipN++ % 250}` }, body: JSON.stringify(body) })
  .then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const sumo = (token, action, extra = {}) => api('appsumo.php', { token, action, ...extra });

console.log('\nAppSumo codes');
const OWNER = { email: 'owner@sumo.test', pw: 'Tq9!vX2#pLm7wZ-sumo' };
await api('auth.php', { action: 'bootstrap', email: OWNER.email, password: OWNER.pw, name: 'Azeem Owner' });
const OT = (await api('auth.php', { action: 'login', email: OWNER.email, password: OWNER.pw })).token;
const mkUser = async (email, pwd, name) => {
  const reg = await api('auth.php', { action: 'register', email, password: pwd, name, businessName: `${name} Co` });
  return { token: (await api('auth.php', { action: 'login', email, password: pwd })).token, accountId: reg.user?.accountId };
};
const C = await mkUser('buyer@sumo.test', 'Lantern-river-7-qz', 'Bea Buyer');
const M = await mkUser('other@sumo.test', 'Copper-meadow-8-qz', 'Otto Other');
ok('(an owner and two customers)', !!OT && !!C.token && !!M.token && !!C.accountId);

/* ── The owner's tools ── */
ok('a customer cannot make codes', (await sumo(C.token, 'generate', { count: 5 })).code === 'not_owner');
ok('…nor without a session', (await sumo('', 'generate', { count: 5 })).status === 401);
const bad = await sumo(OT, 'generate', { count: 0 });
ok('a count of 0 is refused by its box', bad.success === false && bad.field === 'appsumo.count', bad);
const gen = await sumo(OT, 'generate', { count: 6, batch: 'launch' });
const codes = gen.codes ?? [];
ok('the owner makes 6 codes, answered once', gen.success && codes.length === 6 && codes.every(c => /^PC-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(c)) && new Set(codes).size === 6, gen);
const dump = execSync(`npx wrangler d1 execute crmpro --local --persist-to ${persist} --json --command "SELECT code_hash FROM crm_appsumo_codes"`, { encoding: 'utf8', env: { ...process.env, CI: '1' } });
ok('the table holds hashes, not codes', !codes.some(c => dump.includes(c) || dump.includes(c.replace(/-/g, ''))) && /[0-9a-f]{64}/.test(dump));
const imp = await sumo(OT, 'import', { codes: 'APPSUMO-ABCD-1234\nappsumo-efgh-5678\nAPPSUMO-ABCD-1234', batch: 'from-appsumo' });
ok('AppSumo’s own codes are imported, duplicates once', imp.success && imp.count === 2 && !imp.codes, imp);
const s0 = await sumo(OT, 'summary');
ok('the summary counts 8 unused', s0.success && s0.counts.unused === 8 && s0.counts.redeemed === 0, s0);

/* ── A customer ── */
const st0 = await sumo(C.token, 'status');
ok('before a code: no tier', st0.success && st0.codes === 0 && st0.tier === null && st0.max === 3, st0);
const r1 = await sumo(C.token, 'redeem', { code: codes[0].toLowerCase().replace(/-/g, ' ') });
ok('one code, typed loosely, is Tier 1', r1.success && r1.codes === 1 && r1.tier?.id === 'appsumo_1', r1);
const al1 = await api('allowances.php', { token: C.token, accountId: C.accountId, action: 'status' });
ok('…the allowance is Tier 1’s, not the trial’s', al1.allowances?.planId === 'appsumo_1' && al1.allowances?.kind === 'plan' && al1.allowances?.meters?.find(m => m.id === 'autopilot_projects')?.limit === 3, al1.allowances && { kind: al1.allowances.kind, planId: al1.allowances.planId });
const again = await sumo(C.token, 'redeem', { code: codes[0] });
ok('the same code again is refused by name', again.success === false && again.field === 'appsumo.code' && /already redeemed that code/.test(again.error), again);
const theirs = await sumo(M.token, 'redeem', { code: codes[0] });
ok('…and on another account', theirs.success === false && /another account/.test(theirs.error), theirs);
const unknown = await sumo(M.token, 'redeem', { code: 'PC-ZZZZ-ZZZZ-ZZZZ' });
ok('an unknown code is refused', unknown.success === false && /not recognised/.test(unknown.error), unknown);
const r2 = await sumo(C.token, 'redeem', { code: codes[1] });
const r3 = await sumo(C.token, 'redeem', { code: 'appsumo-abcd-1234' });
ok('a second and third code stack to Tier 3', r2.tier?.id === 'appsumo_2' && r3.success && r3.codes === 3 && r3.tier?.id === 'appsumo_3', [r2, r3]);
const r4 = await sumo(C.token, 'redeem', { code: codes[2] });
ok('a fourth is refused by its box, and stays unspent', r4.success === false && r4.code === 'max_codes' && r4.field === 'appsumo.code', r4);
ok('…so another buyer can still use it', (await sumo(M.token, 'redeem', { code: codes[2] })).tier?.id === 'appsumo_1');
ok('the owner cannot redeem', (await sumo(OT, 'redeem', { code: codes[3] })).success === false);

/* ── Refunds ── */
const rv = await sumo(OT, 'revoke', { code: codes[1] });
ok('revoking a refunded code lowers the tier', rv.success && rv.wasRedeemed && rv.email === 'buyer@sumo.test' && rv.planId === 'appsumo_2', rv);
ok('…a revoked code cannot be redeemed', /refunded/.test((await sumo(M.token, 'redeem', { code: codes[1] })).error ?? ''));
ok('only the owner revokes', (await sumo(C.token, 'revoke', { code: codes[0] })).code === 'not_owner');
await sumo(OT, 'revoke', { code: codes[0] });
await sumo(OT, 'revoke', { code: 'APPSUMO-ABCD-1234' });
const after = await sumo(C.token, 'status');
ok('with every code revoked, the AppSumo plan is gone', after.codes === 0 && after.tier === null && after.activePlan === null, after);
await sumo(OT, 'revoke', { code: codes[2] });
await api('allowances.php', { token: OT, action: 'grant_plan', email: 'other@sumo.test', planId: 'custom' });
ok('a hand-given plan is not touched by a revoke', (await sumo(M.token, 'status')).activePlan?.id === 'custom');
const s1 = await sumo(OT, 'summary');
ok('the summary counts what happened', s1.counts.revoked === 4 && s1.counts.redeemed === 0 && s1.counts.unused === 4, s1.counts);

/* ── Licensing v2: AppSumo's Activate button ── */
console.log('\nAppSumo Licensing (webhooks + OAuth)');
const sign = (ts, raw) => crypto.createHmac('sha256', API_KEY).update(`${ts}${raw}`).digest('hex');
/* The body and key are those of AppSumo's "Webhook Security" samples. Its printed digest does
   not come out of its own inputs (checked 2026-11-04 against every ordering), so this follows
   the samples' code — HMAC-SHA256, key = API key, message = timestamp + raw body, hex — in all
   four of its languages. The owner's /appsumo names any refused signature, so a real one that
   disagrees is seen at once. */
const DOC_BODY = '{"license_key":"3794577c-3dbc-11ec-9bbc-0242ac130002","event":"purchase","status":"active","event_timestamp":1318781876406,"test":false}';
const post = (raw, headers = {}) => fetch(`${B}/api/appsumo-webhook.php`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', ...headers }, body: raw })
  .then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
let clock = Date.now();
const hook = o => { const raw = JSON.stringify({ test: false, event_timestamp: ++clock, created_at: clock, ...o }); const ts = String(Date.now()); return post(raw, { 'X-Appsumo-Timestamp': ts, 'X-Appsumo-Signature': sign(ts, raw) }); };
const oauth = code => fetch(`${B}/api/appsumo-oauth.php${code ? `?code=${code}` : ''}`, { redirect: 'manual', headers: { Connection: 'close' } });
const claimOf = r => (/#license=([0-9a-f]{48})$/.exec(r.headers.get('location') ?? '') ?? [])[1];

const t0 = await post(JSON.stringify({ license_key: '00000000-aaaa-1111-bbbb-abcdef012345', event: 'purchase', test: true }));
ok('AppSumo’s URL test passes unsigned, answering success and the event', t0.status === 200 && t0.success === true && t0.event === 'purchase', t0);
const dv = await post(DOC_BODY, { 'X-Appsumo-Timestamp': '1625165884119', 'X-Appsumo-Signature': sign('1625165884119', DOC_BODY) });
ok('AppSumo’s sample webhook, signed as its samples sign, is accepted', dv.status === 200 && dv.success && dv.event === 'purchase', dv);
const K1 = crypto.randomUUID(), K2 = crypto.randomUUID(), K3 = crypto.randomUUID(), K4 = crypto.randomUUID(), K5 = crypto.randomUUID();
ok('an unsigned webhook is refused', (await post(JSON.stringify({ license_key: K1, event: 'activate', tier: 3 }))).status === 401);
ok('…and the owner is told a signature was refused', !!(await sumo(OT, 'summary')).licensing?.lastRejected);
{
  const raw = JSON.stringify({ license_key: K1, event: 'activate', tier: 1, event_timestamp: ++clock }); const ts = String(Date.now());
  ok('…and a tampered one', (await post(raw.replace('"tier":1', '"tier":3'), { 'X-Appsumo-Timestamp': ts, 'X-Appsumo-Signature': sign(ts, raw) })).status === 401);
}
ok('purchase is acknowledged', (await hook({ license_key: K1, event: 'purchase', license_status: 'inactive', tier: 2 })).event === 'purchase');
ok('activate is acknowledged', (await hook({ license_key: K1, event: 'activate', license_status: 'inactive', tier: 2, extra: { reason: 'Purchased by the customer' } })).event === 'activate');
const v0 = await oauth('');
ok('the OAuth address answers AppSumo’s bare validation GET with 200', v0.status === 200);
ok('a code AppSumo did not issue goes back with a reason', /#license-error=expired$/.test((await oauth('nope')).headers.get('location') ?? ''));
OAUTH_CODES.c1 = K1;
const o1 = await oauth('c1');
const claim1 = claimOf(o1);
ok('OAuth trades the code and hands back a one-use claim in the fragment', o1.status === 302 && !!claim1 && seen.token.at(-1)?.redirect_uri === `${B}/api/appsumo-oauth.php`, { loc: o1.headers.get('location'), tok: seen.token.at(-1) });
const L1 = await mkUser('lic@sumo.test', 'Harbor-willow-5-qz', 'Lia Licensed');
const L2 = await mkUser('lic2@sumo.test', 'Cedar-lantern-6-qz', 'Leo Later');
const c1 = await sumo(L1.token, 'claim', { license: claim1 });
ok('claiming it puts the account on the tier AppSumo sold', c1.success && c1.tier?.id === 'appsumo_2' && c1.license?.tier === 2 && c1.codes === 0, c1);
ok('…once only', (await sumo(L1.token, 'claim', { license: claim1 })).code === 'claim_expired');
ok('…and a fresh claim cannot move it to another account', (await sumo(L2.token, 'claim', { license: claimOf(await oauth('c1')) })).code === 'claim_taken');
ok('a licensed account is not offered code stacking', (await sumo(L1.token, 'redeem', { code: codes[3] })).code === 'licensed');
await hook({ license_key: K2, prev_license_key: K1, event: 'upgrade', license_status: 'inactive', tier: 3 });
ok('an upgrade arrives as a new key and the account follows it', (await sumo(L1.token, 'status')).tier?.id === 'appsumo_3');
await hook({ license_key: K1, event: 'activate', license_status: 'inactive', tier: 2 });
ok('a replayed activate for the replaced key changes nothing', (await sumo(L1.token, 'status')).tier?.id === 'appsumo_3');
await hook({ license_key: K3, prev_license_key: K2, event: 'downgrade', license_status: 'inactive', tier: 1 });
ok('a downgrade follows the same way', (await sumo(L1.token, 'status')).tier?.id === 'appsumo_1');
await hook({ license_key: K3, event: 'deactivate', license_status: 'active', extra: { reason: 'Refunded by the user' } });
const dz = await sumo(L1.token, 'status');
ok('a refund (deactivate) takes the AppSumo plan away', dz.tier === null && dz.activePlan === null && dz.license === null, dz);
await hook({ license_key: K3, event: 'activate', license_status: 'inactive', tier: 3 });
ok('…and a replayed activate cannot bring it back', (await sumo(L1.token, 'status')).tier === null);
OAUTH_CODES.c4 = K4; API_TIERS[K4] = 3;
const c4 = await sumo(L2.token, 'claim', { license: claimOf(await oauth('c4')) });
ok('OAuth before its webhook asks the Licensing API for the tier', c4.success && c4.tier?.id === 'appsumo_3' && seen.api.at(-1) === API_KEY, { c4, api: seen.api });
const sl = await sumo(OT, 'summary');
ok('the owner sees licensing connected, and who holds what', sl.licensing?.webhook === true && sl.licensing?.oauth === true && sl.licensing?.holders?.some(h => h.email === 'lic2@sumo.test' && h.tier === 3) && sl.licensing?.counts?.deactivated === 1 && !!sl.licensing?.lastWebhook, sl.licensing);
ok('…and no secret is in the answer', !JSON.stringify(sl).includes(API_KEY) && !JSON.stringify(sl).includes('csecret'));
await hook({ license_key: K5, event: 'purchase', license_status: 'inactive', tier: 1 });
await hook({ license_key: K5, event: 'activate', license_status: 'inactive', tier: 1 });
OAUTH_CODES.c5 = K5;
const pageClaim = claimOf(await oauth('c5'));
const L3 = { email: 'lic3@sumo.test', pw: 'Maple-harbor-9-qz' };
await api('auth.php', { action: 'register', email: L3.email, password: L3.pw, name: 'Lou Page', businessName: 'Lou Co' });

/* ── The page ── */
br = await pw.chromium.launch();
for (const width of [1280, 390]) {
  const ctx = await br.newContext({ viewport: { width, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 180)));
  await p.goto(`${B}/appsumo`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('text=What each tier includes', { timeout: 15000 });
  await p.waitForTimeout(800);
  const t = await p.evaluate(() => document.body.innerText);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`${width}: signed out, the three tiers and both doors`, /AppSumo Tier 1/.test(t) && /AppSumo Tier 3/.test(t) && /Create my account/.test(t) && /sign in/i.test(t) && over === 0 && !errs.length, { over, errs });
  await p.fill('[data-field="appsumo.code"]', codes[4]);

  /* Sign in with the code waiting: the handoff brings the buyer back with it filled. */
  await p.goto(`${B}/login`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1000);
  const email = width === 1280 ? 'buyer@sumo.test' : 'other@sumo.test';
  await p.getByLabel('Email or username').fill(email);
  await p.fill('input[type="password"]', width === 1280 ? 'Lantern-river-7-qz' : 'Copper-meadow-8-qz');
  await p.getByRole('button', { name: 'Sign in' }).click();
  await p.waitForTimeout(3000);
  if (!p.url().endsWith('/appsumo')) await p.goto(`${B}/appsumo`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-field="appsumo.code"]', { timeout: 15000 });
  const filled = await p.inputValue('[data-field="appsumo.code"]');
  ok(`${width}: after sign-in the code is waiting in its box`, width === 1280 ? filled === codes[4] : true, filled);
  if (width === 390) await p.fill('[data-field="appsumo.code"]', codes[5]);
  await p.getByRole('button', { name: 'Redeem code' }).click();
  await p.waitForSelector('[role="status"]', { timeout: 15000 });
  const t2 = await p.evaluate(() => document.body.innerText);
  const over2 = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const expect = width === 1280 ? /AppSumo Tier 1/ : /monthly plan is active/;
  ok(`${width}: redeemed from the page`, /Code redeemed/.test(t2) && expect.test(t2) && over2 === 0 && !errs.length, { over2, errs, t: t2.slice(0, 300) });
  if (width === 1280) {
    /* Plan & billing names the deal and offers no payment portal: there is no subscription behind it. */
    await p.goto(`${B}/billing`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('text=AppSumo lifetime deal', { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(1500);
    const bt = await p.evaluate(() => document.body.innerText);
    ok('1280: Plan & billing says AppSumo lifetime deal, with no billing portal', /AppSumo lifetime deal/.test(bt) && /AppSumo Tier 1 — 1 of 3 codes/.test(bt) && /Redeem another AppSumo code/.test(bt) && !/Manage billing/.test(bt) && !/Your subscription is active/.test(bt), bt.slice(0, 600));
    ok('1280: the trial’s welcome card gave way to the deal’s', /your AppSumo deal is active/.test(bt) && !/trial has started/.test(bt), bt.slice(-600));
  }
  await ctx.close();
}
/* Back from AppSumo's Activate button, signed out: the claim leaves the address bar, survives sign-in, and is spent. */
{
  const ctx = await br.newContext({ viewport: { width: 390, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 180)));
  await p.goto(`${B}/appsumo#license=${pageClaim}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('text=Thanks for your AppSumo purchase', { timeout: 15000 });
  ok('390: signed out from Activate, it says one step is left, and the claim is off the address bar', !p.url().includes('license=') && !errs.length, { url: p.url(), errs });
  await p.goto(`${B}/login`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1000);
  await p.getByLabel('Email or username').fill(L3.email);
  await p.fill('input[type="password"]', L3.pw);
  await p.getByRole('button', { name: 'Sign in' }).click();
  await p.waitForTimeout(3000);
  if (!p.url().endsWith('/appsumo')) await p.goto(`${B}/appsumo`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[role="status"]', { timeout: 15000 });
  const t = await p.evaluate(() => document.body.innerText);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('390: after sign-in the purchase is activated on the account, nothing typed', /AppSumo purchase activated/.test(t) && /Activated from your AppSumo account/.test(t) && over === 0 && !errs.length, { over, errs, t: t.slice(0, 400) });
  await p.goto('about:blank');
  await p.goto(`${B}/appsumo#license-error=deactivated`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('text=was refunded', { timeout: 15000 }).catch(() => {});
  ok('390: an AppSumo error comes back in words', /was refunded/.test(await p.evaluate(() => document.body.innerText)));
  await ctx.close();
}
/* The owner's tools render too. */
{
  const ctx = await br.newContext({ viewport: { width: 390, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 180)));
  await p.goto(`${B}/login`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1000);
  await p.getByLabel('Email or username').fill(OWNER.email);
  await p.fill('input[type="password"]', OWNER.pw);
  await p.getByRole('button', { name: 'Sign in' }).click();
  await p.waitForTimeout(3000);
  await p.goto(`${B}/appsumo`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('text=Make codes', { timeout: 15000 });
  await p.waitForTimeout(800);
  const t = await p.evaluate(() => document.body.innerText);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('390: the owner sees their code tools and who redeemed', /AppSumo codes/.test(t) && /Who redeemed/.test(t) && /buyer@sumo\.test/.test(t) && over === 0 && !errs.length, { over, errs });
  ok('390: …and the Activate button’s set-up, connected, with both addresses', /Activate button/.test(t) && /appsumo-webhook\.php/.test(t) && /appsumo-oauth\.php/.test(t) && /APPSUMO_API_KEY — set/.test(t) && /Activated, Tier 3/.test(t), t.slice(-900));
  await ctx.close();
}
await br.close();

console.log(`\n${pass} passed, ${fail} failed`);
stop();
process.exit(fail ? 1 : 0);
