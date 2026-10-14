/**
 * Plan allowances against the real Worker and D1.
 *
 *   VITE_BASE=/ npm run build
 *   npm run test:allowancese2e    (self-contained: wrangler :8991, fresh D1 in .wrangler-allowances)
 *
 *  - A trial customer makes two AI Autopilot projects; the third is refused by
 *    name (code 'allowance', used 2 of 2, the plan that raises it), and so is a
 *    seventh workflow in one project.
 *  - Plan & billing's Usage card and the board's meter strip say 2 of 2, at
 *    1280 and 390, with nothing wider than the window.
 *  - The install owner raises the trial's projects on Sign-ups & trials →
 *    Plans & allowances, and the third project is then made.
 *  - The public site's pricing shows the four packages from the server's own
 *    table — an owner's change included — monthly and yearly, at 1440 and 390.
 *  - Nobody but the owner may change a plan; nobody reads another workspace's usage.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const PORT = Number(process.env.PORT ?? 8991), INSPECT = Number(process.env.INSPECT_PORT ?? 9391);
const B = `http://localhost:${PORT}`;
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c ? '' : ` — ${String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 600)}`}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (!fs.existsSync('dist/index.html')) { console.log('Build first: VITE_BASE=/ npm run build'); process.exit(2); }

const persist = path.resolve('.wrangler-allowances');
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
const api = (p, body) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.9.7.${ipN++ % 250}` }, body: JSON.stringify(body) })
  .then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));

console.log('\nPlan allowances');
const OWNER = { email: 'owner@allow.test', pw: 'Tq9!vX2#pLm7wZ-allow' };
await api('auth.php', { action: 'bootstrap', email: OWNER.email, password: OWNER.pw, name: 'Azeem Owner' });
const OT = (await api('auth.php', { action: 'login', email: OWNER.email, password: OWNER.pw })).token;
const CUST = { email: 'tara@allow.test', pw: 'Another-horse-7-allow', name: 'Tara Trial', biz: 'Tara Tiles' };
const reg = await api('auth.php', { action: 'register', email: CUST.email, password: CUST.pw, name: CUST.name, businessName: CUST.biz });
const ACCT = reg.user?.accountId;
const CT = (await api('auth.php', { action: 'login', email: CUST.email, password: CUST.pw })).token;
const OTHER = await api('auth.php', { action: 'register', email: 'mal@allow.test', password: 'Third-horse-8-allow', name: 'Mal', businessName: 'Mal Co' });
const MT = (await api('auth.php', { action: 'login', email: 'mal@allow.test', password: 'Third-horse-8-allow' })).token;
ok('(an owner and two trial customers)', !!OT && !!CT && !!ACCT && !!MT, reg);

const pf = await api('projects.php', { token: CT, accountId: ACCT, action: 'save_portfolio', name: CUST.biz, profile: { description: 'Tiles for kitchens and bathrooms' } });
const mk = n => api('projects.php', { token: CT, accountId: ACCT, action: 'save_project', name: n, objective: 'Sell tiles to kitchen fitters in Leeds', portfolioId: pf.id, kind: 'leadgen' });
const p1 = await mk('Kitchen fitters'), p2 = await mk('Bathroom fitters');
ok('two projects are made on the trial', p1.success && p2.success, [p1, p2]);
const p3 = await mk('Architects');
ok('the third is refused by name', p3.success === false && p3.code === 'allowance' && p3.meter === 'autopilot_projects' && p3.used === 2 && p3.limit === 2 && p3.status === 402, p3);
ok('…saying the plan and the plan that raises it', /Free trial includes 2 AI Autopilot projects and 2 exist/.test(p3.error) && p3.upgrade?.id === 'starter' && /Starter includes 3/.test(p3.error), p3.error);
ok('…and nothing was written', (await api('projects.php', { token: CT, accountId: ACCT, action: 'get' })).projects?.length === 2);
const asked = await api('allowances.php', { token: CT, accountId: ACCT, action: 'check', meter: 'autopilot_projects' });
ok('`check` answers the same before anything is tried', asked.success && asked.ok === false && asked.code === 'allowance' && asked.limit === 2, asked);
ok('…and yes for a meter with room', (await api('allowances.php', { token: CT, accountId: ACCT, action: 'check', meter: 'ai_shorts', need: 3 })).ok === true);

const PJ = p1.id;
const wfs = [];
for (let i = 1; i <= 6; i++) wfs.push(await api('autopilot.php', { token: CT, accountId: ACCT, action: 'save_workflow', projectId: PJ, record: { name: `Flow ${i}`, nodes: [] } }));
ok('six workflows go into one project', wfs.every(r => r.success), wfs.filter(r => !r.success));
const wf7 = await api('autopilot.php', { token: CT, accountId: ACCT, action: 'save_workflow', projectId: PJ, record: { name: 'Flow 7', nodes: [] } });
ok('a seventh is refused by name', wf7.success === false && wf7.code === 'allowance' && wf7.meter === 'workflows_per_project' && /6 of the 6 workflows/.test(wf7.error), wf7);
ok('editing one already there is not', (await api('autopilot.php', { token: CT, accountId: ACCT, action: 'save_workflow', projectId: PJ, record: { id: wfs[0].id, name: 'Flow 1 renamed', nodes: [] } })).success);
ok('another project has its own room', (await api('autopilot.php', { token: CT, accountId: ACCT, action: 'save_workflow', projectId: p2.id, record: { name: 'Elsewhere', nodes: [] } })).success);

const st = await api('allowances.php', { token: CT, accountId: ACCT, action: 'status' });
const m = id => st.allowances?.meters?.find(x => x.id === id);
ok('status reads every meter', st.success && st.allowances.planName === 'Free trial' && m('autopilot_projects')?.used === 2 && m('autopilot_projects')?.limit === 2 && m('workflows_per_project')?.used === 6, st);

/* ── Who may ask and change ── */
ok('nobody reads another workspace\'s usage', (await api('allowances.php', { token: MT, accountId: ACCT, action: 'status' })).status === 403);
ok('a customer cannot change a plan', (await api('allowances.php', { token: CT, action: 'set_limits', planId: 'trial', limits: { autopilot_projects: 99 } })).code === 'not_owner');
ok('a bad number is refused by its box', (await api('allowances.php', { token: OT, action: 'set_limits', planId: 'growth', limits: { ai_shorts: 'lots' } })).field === 'plans.ai_shorts');
/* The owner's workspace is claimed on first touch, as the app does. */
const own = await api('allowances.php', { token: OT, accountId: 'acct-owner-allow', action: 'status' });
ok('the owner is never limited', own.success && own.allowances.kind === 'owner' && own.allowances.meters.every(x => x.limit === -1), own);

br = await pw.chromium.launch();
const errs = [];
const signIn = async (page, who) => {
  await page.goto(`${B}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email or username').fill(who.email, { timeout: 10_000 });
  await page.getByLabel('Password', { exact: true }).fill(who.pw);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(2500);
};
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/* ── The customer's Usage card and the board's strip ── */
for (const width of [1280, 390]) {
  const ctx = await br.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`${width}: ${e}`));
  await signIn(page, CUST);
  await page.goto(`${B}/billing`, { waitUntil: 'networkidle' });
  const card = page.locator('[data-usage-card]');
  await card.locator('[data-meter="autopilot_projects"]').waitFor({ timeout: 15_000 });
  const row = await card.locator('[data-meter="autopilot_projects"]').innerText();
  ok(`${width}: the Usage card says 2 of 2 projects`, /AI Autopilot projects/.test(row) && /2 of 2/.test(row), row);
  const shorts = await card.locator('[data-meter="ai_shorts"]').innerText();
  ok(`${width}: …and every other meter, used and allowed`, /0 of 10/.test(shorts) && (await card.locator('[data-meter]').count()) === 13, shorts);
  ok(`${width}: …on the free trial`, /Free trial/.test(await card.innerText()));
  ok(`${width}: Plan & billing offers the four plans with their numbers`, (await page.locator('[data-plan]').count()) === 4 && /30 AI Shorts/.test(await page.locator('[data-plan="starter"]').innerText()));
  await page.getByRole('radio', { name: /Yearly/ }).click();
  ok(`${width}: …and yearly prices`, /\$490\/year/.test(await page.locator('[data-plan="starter"]').innerText()));
  ok(`${width}: nothing is wider than the window on Plan & billing`, (await overflow(page)) <= 0, await overflow(page));
  if (width === 1280) await page.screenshot({ path: '.wrangler-allowances/billing-1280.png', fullPage: true });
  await page.goto(`${B}/autopilot`, { waitUntil: 'networkidle' });
  const strip = page.locator('[data-meter-strip]');
  await strip.waitFor({ timeout: 15_000 }).catch(() => {});
  const s = await strip.innerText().catch(() => '');
  ok(`${width}: the board's strip says 2/2 projects`, /Projects\s*2\/2/.test(s.replace(/\n/g, ' ')), s);
  ok(`${width}: nothing is wider than the window on the board`, (await overflow(page)) <= 0, await overflow(page));
  await ctx.close();
}

/* ── The owner raises the trial's projects ── */
{
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`owner: ${e}`));
  await signIn(page, OWNER);
  await page.goto(`${B}/signups`, { waitUntil: 'networkidle' });
  const ed = page.locator('[data-plan-limits]');
  await ed.waitFor({ timeout: 15_000 });
  await ed.getByLabel('Free trial: AI Autopilot projects').fill('3');
  await ed.getByLabel('Growth: AI Shorts').fill('150');
  await ed.getByRole('button', { name: 'Save allowances' }).click();
  await ed.getByText('Saved.').waitFor({ timeout: 10_000 }).catch(() => {});
  ok('the owner saves new numbers on Plans & allowances', /Saved\./.test(await ed.innerText()));
  await ctx.close();
}
const p3b = await mk('Architects');
ok('the third project is made once the owner allows three', p3b.success === true, p3b);
ok('…and a fourth is refused at the new number', (await mk('Developers')).limit === 3);

/* ── The public site's pricing ── */
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await br.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`site ${w}: ${e}`));
  await page.goto(`${B}/`, { waitUntil: 'networkidle' });
  const sec = page.locator('#pricing');
  await sec.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  const cards = sec.locator('[data-plan]');
  ok(`site ${w}: four packages`, (await cards.count()) === 4);
  const text = await sec.innerText();
  ok(`site ${w}: monthly prices`, ['$49', '$97', '$197', '$297'].every(p => text.replace(/\$\s*\n?/g, '$').includes(p)), text.slice(0, 400));
  ok(`site ${w}: the owner's change is on the card`, /150 AI Shorts/.test(await sec.locator('[data-plan="growth"]').innerText()));
  ok(`site ${w}: 7 days free · No card required`, /7 days free · No card required/.test(text));
  await sec.getByRole('radio', { name: /Yearly/ }).click();
  ok(`site ${w}: yearly prices`, /490/.test(await sec.locator('[data-plan="starter"]').innerText()) && /2,?970|2970/.test(await sec.locator('[data-plan="agency"]').innerText()));
  ok(`site ${w}: nothing is wider than the window`, (await overflow(page)) <= 0, await overflow(page));
  const outside = await cards.evaluateAll(els => els.filter(e => { const r = e.getBoundingClientRect(); return r.left < -1 || r.right > window.innerWidth + 1; }).length);
  ok(`site ${w}: every card inside the window`, outside === 0, outside);
  await sec.screenshot({ path: `.wrangler-allowances/pricing-${w}.png` });
  await ctx.close();
}

ok('no page errors', errs.length === 0, errs.join('\n'));
await br.close();
console.log(`\n${pass} passed, ${fail} failed`);
stop();
process.exit(fail ? 1 : 0);
