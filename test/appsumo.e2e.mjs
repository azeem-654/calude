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
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const PORT = Number(process.env.PORT ?? 8995), INSPECT = Number(process.env.INSPECT_PORT ?? 9395);
const B = `http://localhost:${PORT}`;
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c ? '' : ` — ${String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 600)}`}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (!fs.existsSync('dist/index.html')) { console.log('Build first: VITE_BASE=/ npm run build'); process.exit(2); }

const persist = path.resolve('.wrangler-appsumo');
fs.rmSync(persist, { recursive: true, force: true });
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
const wr = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--inspector-port', String(INSPECT), '--persist-to', persist,
  '--var', `APP_ORIGIN:${B}`], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
let wlog = '';
wr.stdout.on('data', c => { wlog += c; }); wr.stderr.on('data', c => { wlog += c; });
let br = null;
const stop = () => { try { process.kill(-wr.pid, 'SIGTERM'); } catch { /* gone */ } };
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
  await ctx.close();
}
await br.close();

console.log(`\n${pass} passed, ${fail} failed`);
stop();
process.exit(fail ? 1 : 0);
