/**
 * Industry snapshots and provisioning, end to end, on the real Worker and a
 * fresh D1.
 *
 *   VITE_BASE=/ npm run build
 *   npm run test:snapshotse2e
 *
 * Self-contained: migrates a fresh D1 into a temporary directory, runs
 * `wrangler dev` on :8875 (inspector :9375), and stops what it started.
 *
 * What it covers:
 *  - the sign-up claim: the industry a new account arrived with is *recorded*
 *    on its own workspace once — nothing installed — and never for an old
 *    account, the owner, or twice;
 *  - only the install owner reaches the marketplace (2026-10-28): every
 *    action, the catalogue included, answers 403 to a customer — on their own
 *    workspace as much as anybody else's — and nobody signed out gets in;
 *  - the owner installs the matching snapshot into the matching customer's
 *    workspace (roofing, e-commerce, the medical practice) without claiming
 *    it, and nothing reaches any other workspace;
 *  - installing twice changes nothing and writes no second history row;
 *  - in the browser: `/signup?industry=roofing` → sign in → the industry is
 *    recorded, no snapshot installed; a customer typing /snapshots is sent
 *    away and has no menu entry for it; the owner's screen picks workspaces at
 *    390 with no sideways scroll and no page errors.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const PORT = Number(process.env.PORT ?? 8875), INSPECT = Number(process.env.INSPECT_PORT ?? 9375);
const B = `http://localhost:${PORT}`;
let fail = 0, pass = 0;
const ok = (name, cond, detail = '') => { if (cond) pass++; else fail++; console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ` — ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500)}`}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!fs.existsSync('dist/index.html')) { console.log('Build first: VITE_BASE=/ npm run build'); process.exit(2); }

const persist = process.env.PERSIST || fs.mkdtempSync(path.join(os.tmpdir(), 'snapshots-d1-'));
const d1 = cmd => execSync(`npx wrangler d1 execute crmpro --local --persist-to ${persist} --json --command ${JSON.stringify(cmd)}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const sql = q => JSON.parse(d1(q))[0].results;
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
const wr = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--inspector-port', String(INSPECT), '--persist-to', persist, '--var', `APP_ORIGIN:${B}`], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
let wlog = '';
wr.stdout.on('data', c => { wlog += c; }); wr.stderr.on('data', c => { wlog += c; });
let br = null;
const stop = () => { try { process.kill(-wr.pid, 'SIGTERM'); } catch { /* gone */ } };
process.on('exit', stop);
process.on('uncaughtException', async e => { console.log(e); console.log(wlog.slice(-3000)); stop(); process.exit(1); });
for (let i = 0; i < 90; i++) { try { const r = await fetch(`${B}/api/data.php`, { method: 'POST', headers: { Connection: 'close' }, body: '{"action":"ping"}' }); if (r.ok) break; } catch { /* starting */ } await sleep(1000); }

let ipN = 1;
const api = (p, body) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.9.1.${ipN++ % 250}` }, body: JSON.stringify(body) })
  .then(async r => ({ status: r.status, d: await r.json().catch(() => ({})) }));
const sn = body => api('snapshots.php', body);
const pipesOf = acct => JSON.parse(sql(`SELECT v FROM crm_data WHERE account_id = '${acct}' AND k = 'crm_pipelines'`)[0]?.v ?? '[]');

console.log('\nAccounts');
const OWNER = 'owner@snap.test', PW = 'Tq9!vX2#pLm7wZ-snapshots';
const boot = await api('auth.php', { action: 'bootstrap', email: OWNER, password: PW, name: 'Owner' });
if (!boot.d.success) { console.log('bootstrap failed', boot, wlog.slice(-2000)); stop(); process.exit(2); }
const T = (await api('auth.php', { action: 'login', email: OWNER, password: PW })).d.token;
const mkUser = async (email, password, name) => {
  const reg = await api('auth.php', { action: 'register', email, password, name });
  const token = reg.d.token ?? (await api('auth.php', { action: 'login', email, password })).d.token;
  const acct = sql(`SELECT account_id FROM crm_users WHERE email = '${email}'`)[0]?.account_id;
  return { email, password, token, acct };
};
const CARA = await mkUser('cara@hvac.test', 'Another-horse-7cara', 'Cara Cooling');
const BEN = await mkUser('ben@roof.test', 'Battery-staple-9ben', 'Ben Roofing');
const OLD = await mkUser('old@shop.test', 'Correct-pony-4old', 'Old Shop');
sql(`UPDATE crm_users SET created_at = '2025-01-01T00:00:00.000Z' WHERE email = '${OLD.email}'`);
ok('owner and three customers exist', !!(T && CARA.acct && BEN.acct && OLD.acct));

console.log('\nThe sign-up claim');
let r = await sn({ action: 'claim', token: CARA.token, industry: 'hvac' });
ok('a new account’s industry is recorded on its own workspace', r.d.success && r.d.recorded === 'hvac' && r.d.installed === false, r.d);
ok('…and nothing is installed by the customer’s sign-up', !pipesOf(CARA.acct).some(p => p.id === 'snap-hvac-pipeline') && sql(`SELECT COUNT(*) AS n FROM crm_snapshot_installs WHERE account_id = '${CARA.acct}'`)[0].n === 0);
ok('…the industry kept for the owner to act on', sql(`SELECT industry FROM crm_workspaces WHERE account_id = '${CARA.acct}'`)[0].industry === 'hvac');
r = await sn({ action: 'claim', token: CARA.token, industry: 'roofing' });
ok('a second claim does nothing', r.d.success === false && r.d.reason === 'already_set' && !pipesOf(CARA.acct).some(p => p.id === 'snap-roofing-pipeline'), r.d);
r = await sn({ action: 'claim', token: OLD.token, industry: 'roofing' });
ok('an old account is not reshaped by an old link', r.d.success === false && r.d.reason === 'not_a_new_account', r.d);
r = await sn({ action: 'claim', token: T, industry: 'roofing' });
ok('the install owner has no sign-up to claim for', r.d.success === false && r.d.reason === 'not_a_new_account', r.d);
r = await sn({ action: 'claim', token: BEN.token, industry: 'dentist' });
ok('an industry that has no snapshot is refused', r.d.success === false && r.d.reason === 'unknown_industry', r.d);

console.log('\nOnly the platform owner reaches the marketplace');
r = await sn({ action: 'catalogue' });
ok('nobody at all is refused', r.status === 401, r);
r = await sn({ action: 'catalogue', token: BEN.token });
ok('a customer cannot list the catalogue', r.status === 403 && r.d.code === 'not_owner' && !r.d.snapshots, r.d);
for (const action of ['preview', 'install', 'history']) {
  r = await sn({ action, token: BEN.token, accountId: BEN.acct, snapshotId: 'roofing' });
  ok(`a customer is refused ${action} on their own workspace`, r.status === 403 && r.d.code === 'not_owner', r);
  r = await sn({ action, token: BEN.token, accountId: CARA.acct, snapshotId: 'roofing' });
  ok(`a customer is refused ${action} on a workspace not theirs`, r.status === 403, r);
}
r = await sn({ action: 'install', token: BEN.token, accountId: BEN.acct, snapshotId: 'roofing', restore: true });
ok('…restore too', r.status === 403, r);
r = await sn({ action: 'install', token: BEN.token, accountId: '__agency__', snapshotId: 'roofing' });
ok('a customer naming the agency bucket is refused', r.status === 403, r);
r = await sn({ action: 'install', token: T, accountId: '__agency__', snapshotId: 'roofing' });
ok('the agency bucket is not a workspace, even for the owner', r.status === 400 && r.d.code === 'not_a_workspace', r);
r = await sn({ action: 'workspaces', token: BEN.token });
ok('a customer cannot list every workspace', r.status === 403, r);
r = await sn({ action: 'preview', token: T, accountId: BEN.acct, snapshotId: 'plumbing' });
ok('an unknown snapshot is refused at its box', !r.d.success && r.d.field === 'snapshot.id', r.d);
r = await sn({ action: 'install', token: T, accountId: 'acct-nobody', snapshotId: 'roofing' });
ok('a workspace that does not exist is refused', r.status === 404, r);
ok('nothing was written by the refusals', !pipesOf(CARA.acct).some(p => p.id === 'snap-roofing-pipeline') && sql(`SELECT COUNT(*) AS n FROM crm_snapshot_installs`)[0].n === 0);

console.log('\nThe owner installs into a customer’s workspace');
r = await sn({ action: 'workspaces', token: T });
ok('the owner sees every workspace and what it is set up for', r.d.success && r.d.workspaces.some(w => w.accountId === CARA.acct && w.industry === 'hvac'), r.d);
r = await sn({ action: 'preview', token: T, accountId: BEN.acct, snapshotId: 'roofing' });
ok('the preview lists everything to add and writes nothing', r.d.success && r.d.counts.add > 0 && r.d.changes && pipesOf(BEN.acct).length === 0, r.d);
r = await sn({ action: 'install', token: T, accountId: BEN.acct, snapshotId: 'roofing' });
ok('the install adds it', r.d.success && r.d.added === r.d.added && pipesOf(BEN.acct).some(p => p.id === 'snap-roofing-pipeline'), r.d);
ok('…recorded as the owner’s', sql(`SELECT by_role FROM crm_snapshot_installs WHERE account_id = '${BEN.acct}'`)[0]?.by_role === 'owner');
ok('…without claiming the workspace', sql(`SELECT owner_email FROM crm_workspaces WHERE account_id = '${BEN.acct}'`)[0].owner_email === BEN.email);
r = await sn({ action: 'install', token: T, accountId: BEN.acct, snapshotId: 'roofing' });
ok('installing again adds nothing and writes no second row', r.d.success && r.d.added === 0 && sql(`SELECT COUNT(*) AS n FROM crm_snapshot_installs WHERE account_id = '${BEN.acct}'`)[0].n === 1, r.d);
/* The customer renames a stage and deletes another; an install leaves both decisions alone. */
const bp = pipesOf(BEN.acct);
const roof = bp.find(p => p.id === 'snap-roofing-pipeline');
roof.stages[0].name = 'Fresh lead';
roof.stages = roof.stages.filter(s => s.id !== 'snap-roofing-claim');
await api('data.php', { action: 'put', token: BEN.token, accountId: BEN.acct, key: 'crm_pipelines', value: JSON.stringify(bp) });
r = await sn({ action: 'preview', token: T, accountId: BEN.acct, snapshotId: 'roofing' });
ok('the owner’s preview: the customer’s rename kept, their deletion not undone', r.d.success && !r.d.changes && r.d.items.some(i => i.label === 'Fresh lead' && i.status === 'present') && r.d.items.some(i => i.key.endsWith('-claim') && i.status === 'removed'), r.d.items);
r = await sn({ action: 'install', token: T, accountId: BEN.acct, snapshotId: 'roofing', restore: true });
ok('…and restoring puts the deleted stage back, rename untouched', r.d.success && r.d.added === 1 && pipesOf(BEN.acct).find(p => p.id === 'snap-roofing-pipeline').stages.some(s => s.id === 'snap-roofing-claim') && pipesOf(BEN.acct).find(p => p.id === 'snap-roofing-pipeline').stages[0].name === 'Fresh lead', r.d);
r = await sn({ action: 'history', token: T, accountId: BEN.acct });
ok('the history says what happened, newest first, and who did it', r.d.success && r.d.history.length === 2 && r.d.history[0].mode === 'restore' && r.d.history.every(h => h.byEmail === OWNER && h.byRole === 'owner') && r.d.industry === 'roofing', r.d);

console.log('\nThe right snapshot into the right workspace, and nowhere else');
r = await sn({ action: 'install', token: T, accountId: CARA.acct, snapshotId: 'hvac' });
ok('the owner installs HVAC where HVAC was asked for', r.d.success && pipesOf(CARA.acct).some(p => p.id === 'snap-hvac-pipeline'), r.d);
const keysBefore = new Set(sql(`SELECT k FROM crm_data WHERE account_id = '${OLD.acct}'`).map(x => x.k));
r = await sn({ action: 'install', token: T, accountId: OLD.acct, snapshotId: 'ecommerce' });
ok('the owner installs e-commerce into a store’s workspace', r.d.success && pipesOf(OLD.acct).some(p => p.id === 'snap-ecommerce-pipeline'), r.d);
r = await sn({ action: 'install', token: T, accountId: OLD.acct, snapshotId: 'medical_practice' });
ok('…and the medical practice snapshot installs on its own pipeline', r.d.success && pipesOf(OLD.acct).some(p => p.id === 'snap-medical-practice-pipeline'), r.d);
ok('no workspace received another’s snapshot', !pipesOf(CARA.acct).some(p => /ecommerce|roofing|medical/.test(p.id)) && !pipesOf(BEN.acct).some(p => /ecommerce|hvac|medical/.test(p.id)) && !pipesOf(OLD.acct).some(p => /hvac|roofing/.test(p.id)));
const keysAfter = sql(`SELECT k FROM crm_data WHERE account_id = '${OLD.acct}'`).map(x => x.k);
ok('an install writes only pipelines and contact fields — no contacts, messages or settings', keysAfter.every(k => keysBefore.has(k) || k === 'crm_pipelines' || k === 'crm_custom_fields'), keysAfter);

console.log('\nThe screens');
br = await pw.chromium.launch();
const errs = [];
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
fs.mkdirSync('test-results', { recursive: true });
const signIn = async (page, email, password) => {
  await page.goto(`${B}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email or username').fill(email, { timeout: 10_000 });
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(3000);
};

/* A sign-up from the roofing site: the slug is carried to the first sign-in, and recorded — not installed. */
{
  const DANA = await mkUser('dana@roof.test', 'Purple-kettle-5dana', 'Dana Roofs');
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`dana: ${e}`));
  await page.goto(`${B}/signup?industry=roofing`, { waitUntil: 'networkidle' });
  ok('the sign-up page remembers the industry it was sent with', (await page.evaluate(() => JSON.parse(localStorage.getItem('pc_industry') ?? 'null')?.slug)) === 'roofing');
  await signIn(page, DANA.email, DANA.password);
  ok('signing in records roofing on the workspace', sql(`SELECT industry FROM crm_workspaces WHERE account_id = '${DANA.acct}'`)[0].industry === 'roofing');
  ok('…without installing the roofing snapshot', !pipesOf(DANA.acct).some(p => p.id === 'snap-roofing-pipeline'), pipesOf(DANA.acct).map(p => p.id));
  ok('…and the slug is forgotten once used', (await page.evaluate(() => localStorage.getItem('pc_industry'))) === null);
  await ctx.close();
}

for (const width of [1280, 390]) {
  const ctx = await br.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`cara@${width}: ${e}`));
  await signIn(page, CARA.email, CARA.password);
  await page.goto(`${B}/snapshots`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  ok(`customer @${width}: typing /snapshots sends them away`, !page.url().includes('/snapshots') && (await page.getByTestId('snapshots').count()) === 0, page.url());
  const nav = await page.evaluate(() => [...document.querySelectorAll('a[href]')].some(a => a.getAttribute('href') === '/snapshots'));
  ok(`customer @${width}: no link to the marketplace anywhere on the page`, !nav);
  ok(`customer @${width}: no sideways scroll`, (await overflow(page)) <= 0, String(await overflow(page)));
  await ctx.close();
}
{
  const ctx = await br.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`owner: ${e}`));
  await signIn(page, OWNER, PW);
  await page.goto(`${B}/snapshots`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-field="snapshot.workspace"]', { timeout: 15_000 });
  ok('owner: picks any customer’s workspace', (await page.locator('[data-field="snapshot.workspace"] option').count()) >= 4);
  ok('owner: the catalogue lists every snapshot, each passing its checks', (await page.locator('[data-testid="snapshot-hvac"], [data-testid="snapshot-roofing"], [data-testid="snapshot-medical_billing"], [data-testid="snapshot-medical_practice"], [data-testid="snapshot-ecommerce"]').count()) === 5 && (await page.getByTestId('snapshot-problems').count()) === 0);
  ok('owner: a workspace that signed up from a trade site says it asked for it', /asked for roofing/.test(await page.locator('[data-field="snapshot.workspace"]').innerText()));
  await page.selectOption('[data-field="snapshot.workspace"]', OLD.acct);
  await page.getByTestId('snapshot-preview-ecommerce').click();
  await page.waitForSelector('[data-testid="snapshot-plan"]');
  ok('owner: previewing e-commerce on the store’s workspace offers nothing new (already installed)', /Nothing to add/.test(await page.getByTestId('snapshot-plan').innerText()));
  await page.screenshot({ path: 'test-results/snapshots-owner-390.png', fullPage: true });
  ok('owner @390: no sideways scroll', (await overflow(page)) <= 0, String(await overflow(page)));
  await ctx.close();
}
ok('no page errors anywhere', errs.length === 0, errs.join('\n'));
await br.close();
stop();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
