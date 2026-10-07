/**
 * Somebody else's workspace never reaches a new account, the top bar never
 * tangles, and AI Prospecting shows the owner's Lead Directory.
 *
 *   VITE_BASE=/ npm run build
 *   npm run test:isolation      (self-contained: wrangler :8939, fresh D1 in .wrangler-isolation)
 *
 *  - Dana works in a browser and signs out; Erin signs up in the same browser:
 *    Erin's switcher holds her workspace only, none of Dana's cached records
 *    are left on the machine, and her AI Autopilot board is empty with no count.
 *  - The same with Dana never signing out — Erin signing in over her.
 *  - A workspace that holds records but has no owner on file cannot be claimed
 *    by an ordinary account (the owner may, for their own old ones).
 *  - The top bar at 1280, 1440, 1655 and 1900px, as the owner (the widest bar):
 *    no pill runs under the icons on its right, and AI Prospecting has a lit
 *    pill of its own.
 *  - A search for "business owners in Australia" shows the owner's Lead
 *    Directory matches even when the map search itself fails.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const PORT = Number(process.env.PORT ?? 8939), INSPECT = Number(process.env.INSPECT_PORT ?? 9339);
const B = `http://localhost:${PORT}`;
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c ? '' : ` — ${String(d).slice(0, 600)}`}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (!fs.existsSync('dist/index.html')) { console.log('Build first: VITE_BASE=/ npm run build'); process.exit(2); }

const persist = path.resolve('.wrangler-isolation');
fs.rmSync(persist, { recursive: true, force: true });
const sql = q => JSON.parse(execSync(`npx wrangler d1 execute crmpro --local --persist-to ${persist} --json --command ${JSON.stringify(q.replace(/\s*\n\s*/g, ' '))}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
/* The map search has nowhere to go here, so it fails — which is the case the directory card must survive. */
const wr = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--inspector-port', String(INSPECT), '--persist-to', persist,
  '--var', `APP_ORIGIN:${B}`, '--var', 'GEOAPIFY_BASE:http://127.0.0.1:9'], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
let wlog = '';
wr.stdout.on('data', c => { wlog += c; }); wr.stderr.on('data', c => { wlog += c; });
let br = null;
const stop = () => { try { process.kill(-wr.pid, 'SIGTERM'); } catch { /* gone */ } };
process.on('exit', stop);
process.on('uncaughtException', async e => { console.log(e); console.log(wlog.replace(/.*workerd@.*\n/g, '').slice(-2500)); try { await br?.close(); } catch { /* */ } stop(); process.exit(1); });
for (let i = 0; i < 90; i++) { try { const r = await fetch(`${B}/api/data.php`, { method: 'POST', headers: { Connection: 'close' }, body: '{"action":"ping"}' }); if (r.ok) break; } catch { /* starting */ } await sleep(1000); }

let ipN = 1;
const api = (p, body) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.9.5.${ipN++ % 250}` }, body: JSON.stringify(body) }).then(r => r.json().catch(() => ({})));

console.log('\nIsolation, the top bar, and the directory in AI Prospecting');
const OWNER = 'owner@isolation.test', OPW = 'Tq9!vX2#pLm7wZ-iso';
await api('auth.php', { action: 'bootstrap', email: OWNER, password: OPW, name: 'Azeem Owner' });
const T = (await api('auth.php', { action: 'login', email: OWNER, password: OPW })).token;
const DANA = { email: 'dana@isolation.test', pw: 'Another-horse-7-ferns', name: 'Dana Smith', biz: 'Dana Dental Supplies' };
const ERIN = { email: 'erin@isolation.test', pw: 'Third-horse-8-quill', name: 'Erin Brown', biz: 'Erin Roofing' };
const FAYE = { email: 'faye@isolation.test', pw: 'Fourth-horse-9-quill', name: 'Faye Green', biz: 'Faye Florists' };
const dReg = await api('auth.php', { action: 'register', email: DANA.email, password: DANA.pw, name: DANA.name, businessName: DANA.biz });
const DACCT = dReg.user?.accountId, DT = (await api('auth.php', { action: 'login', email: DANA.email, password: DANA.pw })).token;
const pf = await api('projects.php', { token: DT, accountId: DACCT, action: 'save_portfolio', name: DANA.biz, profile: { description: 'Supplies' } });
for (const n of ['Dana project one', 'Dana project two']) { const r = await api('projects.php', { token: DT, accountId: DACCT, action: 'save_project', name: n, objective: 'Sell dental supplies to practices in Leeds', portfolioId: pf.id, kind: 'leadgen' }); if (!r.success) console.log('save_project:', JSON.stringify(r), JSON.stringify(pf)); }
ok('(Dana has two projects)', (await api('projects.php', { token: DT, accountId: DACCT, action: 'get' })).projects?.length === 2);

br = await pw.chromium.launch();
const errs = [];
const signIn = async (page, who) => {
  await page.goto(`${B}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email or username').fill(who.email, { timeout: 10_000 });
  await page.getByLabel('Password', { exact: true }).fill(who.pw);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(2500);
};
const local = page => page.evaluate(() => {
  const keys = []; for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  return { keys, subs: JSON.parse(localStorage.getItem('crm_subaccounts') || '[]').map(a => a.id), active: localStorage.getItem('crm_active_account') };
});

/* ── 1. Dana signs out, Erin signs up in the same browser ── */
{
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`1: ${e}`));
  await signIn(page, DANA);
  await page.goto(`${B}/autopilot`, { waitUntil: 'networkidle' });
  await page.getByText('Dana project one').first().waitFor({ timeout: 15_000 }).catch(() => {});
  const before = await local(page);
  ok('(Dana\'s browser holds her workspace)', before.keys.some(k => k.includes(DACCT)) && before.subs.includes(DACCT), JSON.stringify(before.subs));
  /* Sign out the way the menu does: the avatar, then Sign out. */
  await page.locator('header button:has(+ div), header div[style*="relative"] > button').last().click().catch(() => {});
  await page.getByRole('button', { name: /^Sign out$/ }).first().click({ timeout: 5000 }).catch(async () => {
    await page.locator('header').locator('button').last().click();
    await page.getByRole('button', { name: /^Sign out$/ }).first().click({ timeout: 5000 });
  });
  await page.waitForTimeout(3500);
  const after = await local(page);
  ok('signing out leaves none of Dana\'s workspaces or records in the browser', !after.keys.some(k => k.includes(DACCT)) && !after.subs.includes(DACCT) && after.active !== DACCT, JSON.stringify(after).slice(0, 400));
  /* Erin signs up here. */
  await page.goto(`${B}/signup`, { waitUntil: 'networkidle' });
  const r = await api('auth.php', { action: 'register', email: ERIN.email, password: ERIN.pw, name: ERIN.name, businessName: ERIN.biz });
  ERIN.acct = r.user?.accountId;
  await signIn(page, ERIN);
  await page.goto(`${B}/autopilot`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const erin = await local(page);
  ok('Erin\'s switcher holds her own workspace only', JSON.stringify(erin.subs) === JSON.stringify([ERIN.acct]) && erin.active === ERIN.acct, JSON.stringify(erin));
  const body = await page.innerText('body');
  ok('Erin sees none of Dana\'s projects', !/Dana project/.test(body), body.slice(0, 300));
  ok('…and AI Autopilot carries no count', (await page.locator('.nav-hero-count').count()) === 0);
  await page.goto('about:blank'); await ctx.close();
}

/* ── 2. Faye signs in over Dana without Dana signing out ── */
{
  await api('auth.php', { action: 'register', email: FAYE.email, password: FAYE.pw, name: FAYE.name, businessName: FAYE.biz });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`2: ${e}`));
  await signIn(page, DANA);
  await page.goto(`${B}/autopilot`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  /* Dana's session runs out (the cookie and the stored session go), her
     records still cached in this browser; Faye signs in on the screen that follows. */
  await ctx.clearCookies();
  await page.evaluate(() => localStorage.removeItem('crm_session'));
  await signIn(page, FAYE);
  await page.goto(`${B}/autopilot`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const faye = await local(page);
  ok('signing in over somebody else removes their workspaces and records', !faye.keys.some(k => k.includes(DACCT)) && !faye.subs.includes(DACCT), JSON.stringify(faye.subs));
  ok('…and Faye sees none of Dana\'s projects', !/Dana project/.test(await page.innerText('body')));
  await page.goto('about:blank'); await ctx.close();
}

/* ── 3. An unowned workspace that holds records ── */
{
  const now = new Date().toISOString();
  sql(`INSERT INTO crm_data (account_id, k, v, updated_at) VALUES ('acct-1700000000000', 'crm_contacts', '[{"id":"c1","name":"Somebody"}]', '${now}')`);
  const erinT = (await api('auth.php', { action: 'login', email: ERIN.email, password: ERIN.pw })).token;
  const grab = await api('data.php', { action: 'get', token: erinT, accountId: 'acct-1700000000000', key: 'crm_contacts' });
  ok('an ordinary account cannot claim a workspace that already holds records', grab.success !== true && !/Somebody/.test(JSON.stringify(grab)), JSON.stringify(grab));
  ok('…and it stays unowned', sql("SELECT owner_email FROM crm_workspaces WHERE account_id = 'acct-1700000000000'").length === 0);
  const fresh = await api('data.php', { action: 'get', token: erinT, accountId: 'acct-1700000000999', key: 'crm_contacts' });
  ok('an empty new workspace (a sub-account) can still be opened', fresh.success === true, JSON.stringify(fresh));
  const mine = await api('data.php', { action: 'get', token: T, accountId: 'acct-1700000000000', key: 'crm_contacts' });
  ok('the install owner can recover an old one of their own', mine.success === true && /Somebody/.test(JSON.stringify(mine)), JSON.stringify(mine));
}

/* ── 4. The top bar ── */
for (const width of [1280, 1440, 1655, 1900]) {
  const ctx = await br.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`bar@${width}: ${e}`));
  await signIn(page, { email: OWNER, pw: OPW });
  await page.goto(`${B}/analytics`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const geo = await page.evaluate(() => {
    const header = document.querySelector('header.app-header');
    const nav = header.querySelector('nav.nav-pills');
    const right = nav.nextElementSibling;
    const r = right.getBoundingClientRect();
    const pills = [...nav.querySelectorAll('a, button')].map(p => p.getBoundingClientRect());
    const hits = pills.filter(p => p.right > r.left + 1 && p.left < r.right && p.bottom > r.top && p.top < r.bottom).length;
    const outside = pills.filter(p => p.right > nav.getBoundingClientRect().right + 1).length;
    return { hits, outside, wrapped: header.classList.contains('nav-wrapped'), docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  ok(`@${width}: no pill runs under the icons, none outside its row`, geo.hits === 0 && geo.outside === 0 && geo.docOverflow <= 1, JSON.stringify(geo));
  const pros = page.locator('header a.nav-hero-prospect');
  ok(`@${width}: AI Prospecting has a lit pill of its own`, (await pros.count()) === 1 && /AI Prospecting/.test(await pros.innerText()));
  await page.screenshot({ path: `test-results/topbar-${width}.png`, clip: { x: 0, y: 0, width, height: 140 } });
  await page.goto('about:blank'); await ctx.close();
}

/* ── 5. The Lead Directory in AI Prospecting ── */
{
  const rows = Array.from({ length: 30 }, (_, i) => ({
    name: `Owner Person${i}`, title: i % 3 ? 'Owner' : 'Managing Director', level: i % 3 ? 'Owner' : 'Director', industry: 'Construction',
    company: `Aussie Build ${i}`, email: `owner${i}@aussiebuild${i}.example`, city: i % 2 ? 'Sydney' : 'Melbourne', state: i % 2 ? 'New South Wales' : 'Victoria', country: 'Australia',
  }));
  const st = await api('leaddir.php', { token: T, action: 'import_start', fileKey: 'au|1|1', name: 'au.csv', size: 1 });
  await api('leaddir.php', { token: T, action: 'import_rows', importId: st.import.id, rows });
  await api('leaddir.php', { token: T, action: 'import_finish', importId: st.import.id });
  await api('leaddir.php', { token: T, action: 'settings', shared: true, attest: true });
  const s1 = await api('leaddir.php', { token: (await api('auth.php', { action: 'login', email: ERIN.email, password: ERIN.pw })).token, accountId: ERIN.acct, action: 'search', industry: 'business owners', place: 'australia' });
  ok('"business owners" in "australia" finds the owners in the directory', s1.success && s1.total === 20, JSON.stringify(s1).slice(0, 300));
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`5: ${e}`));
  await signIn(page, ERIN);
  await page.goto(`${B}/prospecting`, { waitUntil: 'networkidle' });
  await page.getByLabel('Who to look for').fill('business owners in australia');
  await page.keyboard.press('Enter');
  await page.getByTestId('directory-matches').waitFor({ timeout: 30_000 }).catch(() => {});
  const card = await page.getByTestId('directory-matches').innerText().catch(() => '');
  ok('AI Prospecting shows the directory\'s matches beside the search', /20 people match/.test(card) && /Owner Person/.test(card) && /•/.test(card), card.slice(0, 300));
  await page.getByTestId('directory-matches').getByRole('button', { name: /See them all/ }).click();
  await page.getByTestId('ld-count').waitFor({ timeout: 15_000 }).catch(() => {});
  ok('"See them all" opens the Lead Directory on the same search', /\/lead-directory/.test(page.url()) && /20 people/.test(await page.getByTestId('ld-count').innerText().catch(() => '')), page.url());
  await page.screenshot({ path: 'test-results/isolation-directory.png' });
  await page.goto('about:blank'); await ctx.close();
}

ok('no page errors', errs.length === 0, errs.join(' | '));
await br.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
