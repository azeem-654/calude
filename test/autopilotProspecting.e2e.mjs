/**
 * AI Prospecting inside AI Autopilot, end to end: the daily prospect finder,
 * the project's Prospects tab, the wizard that sets one up, "Search this every
 * day", and texting only those who opt in.
 *
 *   VITE_BASE=/ npm run build
 *   npm run test:autoprospects
 *
 * Self-contained: a Geoapify + DNS mock on 127.0.0.1:8848, a fresh D1 in
 * .wrangler-autoprospects, `wrangler dev --test-scheduled` on :8918, a real
 * browser. Ports overridable (PORT, MOCK_PORT, INSPECT_PORT).
 *
 * What it proves, against the real Worker and database:
 *  - a finder searches, reads, checks and adds up to its daily number, into
 *    Contacts (as prospects) and onto the project's list — and then rests;
 *  - a business already in Contacts is not added twice;
 *  - a stale browser save that drops found contacts is repaired, and a
 *    contact the customer deleted on purpose stays deleted;
 *  - pausing stops it (its workflow with it); the cron runs it; a rotation run
 *    to its end says so; another workspace can neither read nor drive it;
 *  - "Virginia" becomes its towns, largest first;
 *  - the opt-in page refuses a forged link, records a real yes, puts the
 *    number and the tag on the contact and starts the workflow waiting for it;
 *  - the Prospects tab shows it; the wizard sets one up from a sentence with a
 *    live sample; AI Prospecting adds a search to a project's daily rotation.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync, spawn } from 'node:child_process';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const PORT = Number(process.env.PORT ?? 8918), MOCK = Number(process.env.MOCK_PORT ?? 8848), INSPECT = Number(process.env.INSPECT_PORT ?? 9318);
const B = `http://localhost:${PORT}`;
const G = `http://127.0.0.1:${MOCK}`;
let fail = 0, pass = 0;
const ok = (name, cond, detail = '') => { if (cond) pass++; else fail++; console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ` — ${String(detail).slice(0, 700)}`}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* SHOTS=<dir> keeps a picture of each new wizard screen, at the width it is checked at. */
const shot = async (page, name) => { if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); await page.screenshot({ path: path.join(process.env.SHOTS, `${name}.png`), fullPage: false }); } };
if (!fs.existsSync('dist/index.html')) { console.log('Build first: VITE_BASE=/ npm run build'); process.exit(2); }

/* ── The mock: Geoapify (Leeds 63 dentists, York 5, Virginia's towns) and DNS ── */
const GEOKEY = 'c3'.repeat(16);
const dentist = (n, town = 'Leeds') => ({ type: 'Feature', properties: {
  place_id: `geo-${town}-${n}`, name: `${town} Dental ${n}`, formatted: `${town} Dental ${n}, ${n} Park Row, ${town}, United Kingdom`,
  categories: ['healthcare', 'healthcare.dentist'], lat: 53.79 + n / 1000, lon: -1.54,
  datasource: { sourcename: 'openstreetmap', raw: { phone: `0113 555 ${1000 + n}`, website: `https://${town.toLowerCase()}dental${n}.example/`, email: n % 3 === 1 ? `hello@${town.toLowerCase()}dental${n}.example` : undefined } },
} });
const towns = [['Norfolk', 238000], ['Virginia Beach', 459000], ['Richmond', 226000], ['Roanoke', 100000]];
const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const mock = http.createServer((req, res) => {
  const u = new URL(req.url, G);
  if (u.pathname === '/dns-query') {
    const name = u.searchParams.get('name') ?? '';
    if (/dental\d+\.example$/.test(name) && u.searchParams.get('type') === 'MX') return send(res, 200, { Status: 0, Answer: [{ type: 15, data: `10 mx.${name}.` }] });
    return send(res, 200, { Status: 0, Answer: [] });
  }
  if (u.searchParams.get('apiKey') !== GEOKEY) return send(res, 401, { message: 'Invalid apiKey' });
  if (u.pathname === '/v1/geocode/search') {
    const t = (u.searchParams.get('text') ?? '').toLowerCase();
    if (t === 'leeds' || t === 'york') return send(res, 200, { results: [{ place_id: `p-${t}`, lon: -1.55, lat: 53.8, result_type: 'city' }] });
    if (t === 'virginia') return send(res, 200, { results: [{ place_id: 'p-va', lon: -78.6, lat: 37.5, result_type: 'state', state: 'Virginia' }] });
    return send(res, 200, { results: [] });
  }
  if (u.pathname === '/v2/places') {
    const cat = u.searchParams.get('categories'), filter = u.searchParams.get('filter'), offset = Number(u.searchParams.get('offset') ?? 0);
    if (cat === 'populated_place.city,populated_place.town' && filter === 'place:p-va') {
      return send(res, 200, { features: towns.map(([name, pop]) => ({ properties: { name, datasource: { raw: { population: pop } } } })) });
    }
    if (cat === 'healthcare.dentist' && filter === 'place:p-leeds') {
      const ns = offset === 0 ? Array.from({ length: 60 }, (_, i) => i + 1) : offset === 60 ? [61, 62, 63] : [];
      return send(res, 200, { features: ns.map(n => dentist(n)) });
    }
    if (cat === 'healthcare.dentist' && filter === 'place:p-york') return send(res, 200, { features: [1, 2, 3, 4, 5].map(n => dentist(n, 'York')) });
    return send(res, 200, { features: [] });
  }
  send(res, 404, { message: 'no such path in the mock' });
});
await new Promise(r => mock.listen(MOCK, '127.0.0.1', r));

/* ── A fresh database and the real Worker ── */
const persist = path.resolve('.wrangler-autoprospects');
fs.rmSync(persist, { recursive: true, force: true });
const sql = q => JSON.parse(execSync(`npx wrangler d1 execute crmpro --local --persist-to ${persist} --json --command ${JSON.stringify(q)}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
/* The test's own opt-in signing secret, planted before the Worker first makes one, so the
   test can sign a real link without reading anything the install keeps (it may be wrapped). */
const OPTIN_SECRET = crypto.randomBytes(32).toString('hex');
sql(`INSERT INTO crm_meta (k, v, updated_at) VALUES ('sms_optin', '${OPTIN_SECRET}', '2026-01-01T00:00:00Z')`);
const vars = [`APP_ORIGIN:${B}`, `GEOAPIFY_BASE:${G}`, `DOH_BASE:${G}/dns-query`];
const wr = spawn('npx', ['wrangler', 'dev', '--local', '--test-scheduled', '--port', String(PORT), '--inspector-port', String(INSPECT), '--persist-to', persist, ...vars.flatMap(v => ['--var', v])], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
let wlog = '';
wr.stdout.on('data', c => { wlog += c; }); wr.stderr.on('data', c => { wlog += c; });
let br = null;
const stop = () => { try { process.kill(-wr.pid, 'SIGTERM'); } catch { /* gone */ } mock.close(); };
process.on('exit', stop);
process.on('uncaughtException', async e => { console.log(e); console.log(wlog.replace(/.*workerd@.*\n/g, '').slice(-2500)); try { await br?.close(); } catch { /* */ } stop(); process.exit(1); });
for (let i = 0; i < 90; i++) { try { const r = await fetch(`${B}/api/data.php`, { method: 'POST', headers: { Connection: 'close' }, body: '{"action":"ping"}' }); if (r.ok) break; } catch { /* starting */ } await sleep(1000); }

let ipN = 1;
const api = (p, body) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.9.7.${ipN++ % 250}` }, body: JSON.stringify(body) }).then(r => r.json().catch(() => ({})));

console.log('\nAutopilot prospecting — the finder');
const OWNER = 'owner@autoprospects.test', OPW = 'Tq9!vX2#pLm7wZ-ap';
await api('auth.php', { action: 'bootstrap', email: OWNER, password: OPW, name: 'Owner' });
const T = (await api('auth.php', { action: 'login', email: OWNER, password: OPW })).token;
await api('geoapify.php', { token: T, action: 'save', apiKey: GEOKEY });
const CE = 'dana@autoprospects.test', CPW = 'Another-horse-7-ferns';
const ACCT = (await api('auth.php', { action: 'register', email: CE, password: CPW, name: 'Dana', businessName: 'Bright Smile Supplies' })).user?.accountId;
const CT = (await api('auth.php', { action: 'login', email: CE, password: CPW })).token;
const XE = 'mallory@autoprospects.test', XPW = 'Third-horse-8-quill';
const XACCT = (await api('auth.php', { action: 'register', email: XE, password: XPW, name: 'Mallory', businessName: 'Other Co' })).user?.accountId;
const XT = (await api('auth.php', { action: 'login', email: XE, password: XPW })).token;
ok('(two customers signed up)', !!ACCT && !!CT && !!XACCT && !!XT);

const pf = await api('projects.php', { token: CT, accountId: ACCT, action: 'save_portfolio', name: 'Bright Smile Supplies', profile: { description: 'Dental supplies for practices' } });
const pj = await api('projects.php', { token: CT, accountId: ACCT, action: 'save_project', name: 'Leeds dentists', objective: 'Sell dental supplies to practices in Leeds', portfolioId: pf.id, kind: 'leadgen' });
const PID = pj.id;
ok('(a project exists)', !!PID, JSON.stringify(pj).slice(0, 300));
const now = new Date().toISOString();
const LIST = 'list-autoprospects-1';
const known = { id: 'c-known', name: 'Leeds Dental 4', email: 'hello@leedsdental4.example', phone: '0113 555 1004', status: 'customer', tags: [], source: 'manual', createdAt: now, lastActivity: now, value: 0 };
await api('data.php', { action: 'bulk_set', token: CT, accountId: ACCT, items: {
  crm_contacts: JSON.stringify([known]),
  crm_contact_lists: JSON.stringify([{ id: LIST, name: 'Leeds dentists — prospects', type: 'static', rules: [], match: 'all', memberIds: [], color: '', createdAt: now, createdBy: 'Dana', kind: 'cold', origin: 'prospecting' }]),
  crm_automations: JSON.stringify([{ id: 'auto-sms', name: 'Text the prospects who opt in', status: 'active', createdAt: now, enrolledCount: 0, completedCount: 0,
    nodes: [{ id: 't', type: 'trigger', label: 'Opted in', config: { event: 'tag_added', tag: 'sms opt-in' }, nextId: 'w' }, { id: 'w', type: 'wait', label: 'Wait', config: { days: '1' }, nextId: '' }] }]),
} });

const saved = await api('finders.php', { token: CT, accountId: ACCT, action: 'save', projectId: PID, trades: ['dentists'], places: ['Leeds'], perDay: 5, listId: LIST, listName: 'Leeds dentists — prospects' });
const FID = saved.finderId;
ok('a finder is set up, with its workflow switched on', !!FID && sql(`SELECT status, nodes FROM crm_project_workflows WHERE id = '${saved.workflowId}'`).some(r => r.status === 'active' && /"produces":"prospects"/.test(r.nodes)), JSON.stringify(saved));
ok('…and the project now writes to its list', /list-autoprospects-1/.test(sql(`SELECT brief FROM crm_projects WHERE id = '${PID}'`)[0]?.brief ?? ''));
const refused = await api('finders.php', { token: CT, accountId: ACCT, action: 'save', projectId: PID, trades: [], places: ['Leeds'], listId: LIST });
ok('a finder with nothing to look for is refused on its box', refused.success === false && refused.field === 'finder.trades', JSON.stringify(refused));

let steps = [];
for (let i = 0; i < 14; i++) {
  const r = await api('finders.php', { token: CT, accountId: ACCT, action: 'run_step', projectId: PID, finderId: FID });
  steps.push(r.job);
  if (r.job === 'rest') break;
}
ok('it searches, then reads, then rests once today\'s five are in', steps[0] === 'search' && steps.includes('read') && steps.at(-1) === 'rest', steps.join(','));
const contacts = () => JSON.parse(sql(`SELECT v FROM crm_data WHERE account_id = '${ACCT}' AND k = 'crm_contacts'`)[0]?.v ?? '[]');
const listOf = () => JSON.parse(sql(`SELECT v FROM crm_data WHERE account_id = '${ACCT}' AND k = 'crm_contact_lists'`)[0]?.v ?? '[]').find(l => l.id === LIST);
let found = contacts().filter(c => String(c.id).startsWith('pf-'));
ok('five prospects in Contacts, as prospects, with a checked address and when they were found',
  found.length === 5 && found.every(c => c.status === 'prospect' && c.email && c.customFields?.foundAt && c.customFields?.emailStatus && c.tags.includes('autopilot')), JSON.stringify(found[0]));
ok('…and on the project\'s list', found.every(c => listOf()?.memberIds.includes(c.id)), JSON.stringify(listOf()?.memberIds));
ok('the business already in Contacts was not added again', sql(`SELECT status FROM crm_project_prospects WHERE finder_id = '${FID}' AND name = 'Leeds Dental 4'`)[0]?.status === 'known'
  && contacts().filter(c => c.name === 'Leeds Dental 4').length === 1);

/* A browser with an older copy saves over Contacts: the next step puts them back. */
await api('data.php', { action: 'bulk_set', token: CT, accountId: ACCT, items: { crm_contacts: JSON.stringify([known]) } });
await api('finders.php', { token: CT, accountId: ACCT, action: 'run_step', projectId: PID, finderId: FID });
ok('a stale browser save that dropped them is repaired', contacts().filter(c => String(c.id).startsWith('pf-')).length === 5);
/* Deleted on purpose: stays deleted. */
const gone = contacts().find(c => String(c.id).startsWith('pf-')).id;
await api('finders.php', { token: CT, accountId: ACCT, action: 'removed', contactIds: [gone] });
await api('data.php', { action: 'bulk_set', token: CT, accountId: ACCT, items: { crm_contacts: JSON.stringify(contacts().filter(c => c.id !== gone)) } });
await api('finders.php', { token: CT, accountId: ACCT, action: 'run_step', projectId: PID, finderId: FID });
ok('a found contact the customer deleted is not put back', !contacts().some(c => c.id === gone));

const ov = await api('finders.php', { token: CT, accountId: ACCT, action: 'overview', projectId: PID });
ok('the overview counts today, the rotation and the log', ov.finder?.today?.added === 5 && ov.finder.rotation?.[0]?.state && ov.days?.length >= 1 && ov.runs?.length > 0 && ov.totals?.added === 4, JSON.stringify(ov).slice(0, 500));

/* Another workspace. */
const x1 = await api('finders.php', { token: XT, accountId: XACCT, action: 'overview', projectId: PID });
const x2 = await api('finders.php', { token: XT, accountId: ACCT, action: 'overview', projectId: PID });
const x3 = await api('finders.php', { token: XT, accountId: XACCT, action: 'run_step', projectId: PID, finderId: FID });
ok('another workspace can neither read nor drive it', x1.success === false && x2.success === false && x3.success === false, JSON.stringify([x1, x2, x3]));

/* Pause, and the workflow with it. */
await api('finders.php', { token: CT, accountId: ACCT, action: 'set_status', projectId: PID, finderId: FID, status: 'paused' });
const paused = await api('finders.php', { token: CT, accountId: ACCT, action: 'run_step', projectId: PID, finderId: FID });
ok('pausing stops it, and switches its workflow off', paused.success === false && sql(`SELECT status FROM crm_project_workflows WHERE id = '${saved.workflowId}'`)[0]?.status === 'paused', JSON.stringify(paused));
await api('finders.php', { token: CT, accountId: ACCT, action: 'set_status', projectId: PID, finderId: FID, status: 'active' });

/* The cron runs it (tomorrow, as far as the finder knows). */
sql(`UPDATE crm_prospect_finders SET day = '2000-01-01', next_run_at = '' WHERE id = '${FID}'`);
const before = sql(`SELECT COUNT(*) AS n FROM crm_finder_runs WHERE finder_id = '${FID}'`)[0].n;
await fetch(`${B}/cdn-cgi/handler/scheduled`, { headers: { Connection: 'close' } }).catch(() => {});
await sleep(4000);
const after = sql(`SELECT COUNT(*) AS n FROM crm_finder_runs WHERE finder_id = '${FID}'`)[0].n;
ok('the cron runs a due finder by itself', after > before, `${before} → ${after}`);

/* Run to its end. */
sql(`UPDATE crm_prospect_finders SET done_keys = '["dentists|leeds"]', page_token = '', day = '2000-01-01' WHERE id = '${FID}'`);
sql(`UPDATE crm_project_prospects SET status = 'no_email' WHERE finder_id = '${FID}' AND status IN ('candidate', 'ready')`);
const ex = await api('finders.php', { token: CT, accountId: ACCT, action: 'run_step', projectId: PID, finderId: FID });
ok('a rotation run to its end says so, and stops', ex.job === 'exhausted' && sql(`SELECT status FROM crm_prospect_finders WHERE id = '${FID}'`)[0].status === 'exhausted', JSON.stringify(ex));
const more = await api('finders.php', { token: CT, accountId: ACCT, action: 'save', projectId: PID, trades: ['dentists'], places: ['Leeds', 'York'], perDay: 5, listId: LIST });
ok('…and adding a place starts it again', more.success && sql(`SELECT status FROM crm_prospect_finders WHERE id = '${FID}'`)[0].status === 'active');

const va = await api('finders.php', { token: CT, accountId: ACCT, action: 'expand_place', place: 'Virginia' });
ok('"Virginia" becomes its towns, largest first', va.places?.join('|') === 'Virginia Beach, Virginia|Norfolk, Virginia|Richmond, Virginia|Roanoke, Virginia', JSON.stringify(va));

console.log('\nTexts only with a yes');
const someone = contacts().find(c => String(c.id).startsWith('pf-'));
const bad = await fetch(`${B}/api/sms-optin.php?a=${ACCT}&c=${someone.id}&s=00`, { headers: { Connection: 'close' } });
ok('a forged opt-in link is refused and changes nothing', bad.status === 400);
const secret = OPTIN_SECRET;
const s = crypto.createHmac('sha256', secret).update(`${ACCT}\n${someone.id}`).digest('hex').slice(0, 24);
const link = `${B}/api/sms-optin.php?a=${encodeURIComponent(ACCT)}&c=${encodeURIComponent(someone.id)}&s=${s}`;
const pageText = await (await fetch(link, { headers: { Connection: 'close' } })).text();
ok('a real link shows a form, and a GET records nothing', /Yes, text me/.test(pageText) && sql(`SELECT COUNT(*) AS n FROM crm_sms_consents WHERE account_id = '${ACCT}'`)[0].n === 0);
const post = body => fetch(link, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Connection: 'close', 'CF-Connecting-IP': '10.1.1.1' }, body: new URLSearchParams(body).toString() }).then(r => r.text());
ok('without the box ticked, nothing is recorded', /Tick the box/.test(await post({ phone: '+1 804 555 0101' })) && sql(`SELECT COUNT(*) AS n FROM crm_sms_consents WHERE account_id = '${ACCT}'`)[0].n === 0);
ok('a number without a country code is refused', /country code/.test(await post({ phone: '804 555 0101', agree: '1' })));
ok('a real yes is recorded', /Thank you/.test(await post({ phone: '+1 (804) 555-0101', agree: '1' })) && sql(`SELECT phone FROM crm_sms_consents WHERE account_id = '${ACCT}'`)[0]?.phone === '+18045550101');
const yes = contacts().find(c => c.id === someone.id);
ok('…their number and the "sms opt-in" tag go on the contact', yes?.phone === '+18045550101' && yes.tags.includes('sms opt-in') && !!yes.customFields?.smsConsentAt, JSON.stringify(yes));
ok('…and the workflow waiting for that tag starts for them', sql(`SELECT trigger_kind FROM crm_automation_runs WHERE automation_id = 'auto-sms' AND contact_id = '${someone.id}'`)[0]?.trigger_kind === 'tag_added');

/* ── The browser ── */
console.log('\nThe screens');
br = await pw.chromium.launch();
const errs = [];
fs.mkdirSync('test-results', { recursive: true });
const signIn = async width => {
  const ctx = await br.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`${width}: ${e}`));
  await page.goto(`${B}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email or username').fill(CE, { timeout: 15_000 });
  await page.getByLabel('Password', { exact: true }).fill(CPW);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(2500);
  return { ctx, page };
};
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

{
  const { ctx, page } = await signIn(1280);
  await page.goto(`${B}/autopilot?project=${encodeURIComponent(PID)}&tab=prospects`, { waitUntil: 'networkidle' });
  const tab = page.getByLabel('Prospects', { exact: true }).first();
  await page.getByText('Daily prospecting').waitFor({ timeout: 15_000 }).catch(() => {});
  const body = await page.innerText('body');
  const TAB_WANT = [/Daily prospecting/, /Finding every day/, /Added today/, /Added to the audience, day by day/i, /dentists · York/, /Latest prospects/i, /Leeds Dental/];
  ok('the Prospects tab opens from its link: status, today, the chart, the rotation, the latest',
    TAB_WANT.every(r => r.test(body)), `missing ${TAB_WANT.filter(r => !r.test(body)).join(' ')}: ${body.slice(body.indexOf('Daily prospecting'), body.indexOf('Daily prospecting') + 900)}`);
  ok('@1280: no sideways scroll', (await overflow(page)) <= 0, String(await overflow(page)));
  await page.screenshot({ path: 'test-results/autopilot-prospects-1280.png', fullPage: false });
  void tab;

  /* The wizard: a sentence becomes a finder, with a live sample. */
  await page.goto(`${B}/autopilot?new=1`, { waitUntil: 'networkidle' });
  const np = page.getByRole('dialog', { name: 'New project' });
  await np.waitFor({ timeout: 10_000 });
  await np.getByLabel('What would you like Autopilot to do?').fill('I want to sell my dental supplies to dentists in Leeds and find customers by email and SMS.');
  const cta = np.locator('footer .wz-cta');
  await cta.click();
  await np.getByText(/Here.s what I understood/).waitFor({ timeout: 20_000 });
  const understood = await np.innerText();
  ok('the wizard reads who, where and the texts from the sentence', /dentists/.test(understood) && /Leeds/.test(understood), understood.slice(0, 900));
  await cta.click();
  let sawSample = false, sawTrades = false;
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(400);
    if (await np.getByText(/Here.s what Autopilot/).count()) break;
    if (await np.locator('[data-field="project.prospectTrades"]').count()) {
      sawTrades = sawTrades || /dentists/.test(await np.locator('.np-chips').first().innerText());
      await np.getByText('Leeds Dental 1', { exact: true }).waitFor({ timeout: 15_000 }).catch(() => {});
      if (await np.getByRole('region', { name: 'Who it would find today' }).count()) {
        const t = await np.getByRole('region', { name: 'Who it would find today' }).innerText();
        sawSample = sawSample || (/found live at/.test(t) && /Leeds Dental 1/.test(t));
      }
    }
    const typeIt = np.getByRole('button', { name: /Type it in/ });
    if (await typeIt.count() && (await typeIt.getAttribute('aria-pressed')) !== 'true') {
      await typeIt.click();
      await np.getByPlaceholder('Pike Plumbing & Heating').fill('Bright Smile Supplies');
      await np.getByPlaceholder(/Boiler repairs and installations/).fill('Dental supplies for practices in Yorkshire');
    }
    for (const q of await np.locator('.np-q').all()) {
      if (await q.locator('.np-sol').count()) continue;
      if (await q.locator('[aria-pressed="true"]').count()) continue;
      if (await q.locator('.np-chips').count()) continue;
      const ai = q.locator('[data-ai="1"]');
      if (await ai.count()) { await ai.first().click(); continue; }
      const o = q.locator('.np-opt');
      if (await o.count()) { await o.first().click(); continue; }
      const input = q.locator('input.np-input');
      if (await input.count() && !(await input.first().inputValue())) await input.first().fill('A free sample box');
    }
    if (await cta.isDisabled()) { ok('the wizard is not stuck', false, await cta.innerText()); break; }
    await cta.click();
  }
  /* The sentence answered who and where, so they are not asked — the blueprint shows them, with the sample. */
  const finder = np.getByRole('region', { name: 'Who it finds every day' });
  await finder.getByRole('region', { name: 'Who it would find today' }).getByText('Leeds Dental 1', { exact: true }).waitFor({ timeout: 15_000 }).catch(() => {});
  const ft = (await finder.count()) ? await finder.innerText() : '';
  ok('the blueprint shows who it finds every day, from the sentence', sawTrades || (/dentists/.test(ft) && /Leeds/.test(ft)), ft.slice(0, 400));
  ok('…and a live sample of who it would find today', sawSample || (/found live at/.test(ft) && /Leeds Dental 1/.test(ft)), ft.slice(0, 600));
  const bp = await np.innerText();
  ok('the blueprint has the daily finder and the opt-in texting workflow', /Find new prospects daily/.test(bp) && /Text the prospects who opt in/.test(bp), bp.slice(0, 1200));
  /* Our booking page, when the project uses it: a preview and the basics, right here. */
  if (/Booking page/.test(bp) || await np.getByRole('region', { name: 'Your booking page' }).count()) {
    const book = np.getByRole('region', { name: 'Your booking page' }).first();
    ok('the blueprint shows the booking page it will link to, editable in place', (await book.count()) > 0 && /Pick a day/.test(await book.innerText()), bp.slice(0, 400));
    if (await book.count()) {
      await book.locator('[data-field="booking.title"]').fill('Free supply review');
      await book.getByRole('button', { name: '45 min' }).click();
      const pv = await book.getByRole('figure').innerText();
      ok('…and the preview follows an edit at once', /Free supply review/.test(pv) && /45 min/.test(pv), pv.slice(0, 300));
      await book.scrollIntoViewIfNeeded(); await shot(page, 'booking-1280');
      await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
      await book.scrollIntoViewIfNeeded(); await shot(page, 'booking-390');
      ok('@390: the booking editor and preview fit the phone', await page.evaluate(() => [...document.querySelectorAll('.np-book')].every(e => e.scrollWidth <= e.clientWidth + 1)));
      await page.setViewportSize({ width: 1280, height: 860 }); await page.waitForTimeout(300);
      await book.getByText(/Live at/).waitFor({ timeout: 10_000 }).catch(() => {});
      const live = sql(`SELECT slug, public FROM crm_booking_config WHERE account_id = '${ACCT}'`);
      ok('…and it is published as edited, so the emails have a link to give', live.length === 1 && /Free supply review/.test(JSON.stringify(live[0])), JSON.stringify(live).slice(0, 300));
    }
  }
  await cta.click(); await page.waitForTimeout(400);
  /* Connections: contacts the project finds itself are not "not set up yet". */
  await np.getByText('Found by this project').scrollIntoViewIfNeeded().catch(() => {}); await shot(page, 'connections');
  const conn = await np.innerText();
  ok('connections: contacts are found by this project, not missing', /Found by this project/.test(conn) && /searching starts|search starts/i.test(conn) && !/Contacts\s*Not set up yet/.test(conn), conn.slice(0, 900));
  await cta.click(); await page.waitForTimeout(300);
  await shot(page, 'review');
  const review = await np.innerText();
  ok('review: says which prospects it finds and when it starts', /Prospects it finds/i.test(review) && /dentists/.test(review), review.slice(0, 700));
  await np.getByRole('button', { name: /Build My Autopilot/ }).click();
  await np.getByRole('heading', { name: /Your Autopilot is ready|The build stopped/ }).waitFor({ timeout: 60_000 });
  /* The first prospects, found in front of the customer — not "nobody to email yet". */
  const live = np.getByRole('region', { name: 'Finding your first prospects' });
  await live.waitFor({ timeout: 10_000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelector('[aria-label="Finding your first prospects"]')?.getAttribute('aria-busy') === 'false', null, { timeout: 90_000 }).catch(() => {});
  if (await live.count()) { await live.scrollIntoViewIfNeeded(); await page.waitForTimeout(1200); await shot(page, 'build'); }
  const lt = (await live.count()) ? await live.innerText() : await np.innerText();
  ok('the build finds the first prospects while the customer watches', /prospects? added to this project/.test(lt) && /Searched dentists in Leeds|Read \d+ websites/.test(lt) && !/Nobody to email yet/.test(await np.innerText()), lt.slice(0, 900));
  const fresh = sql(`SELECT f.id, f.trades, f.places, f.list_id, p.brief FROM crm_prospect_finders f JOIN crm_projects p ON p.id = f.project_id WHERE f.account_id = '${ACCT}' AND f.project_id != '${PID}'`);
  ok('the build sets up the finder with its own list as the project\'s audience', fresh.length === 1 && /dentists/.test(fresh[0].trades) && /Leeds/.test(fresh[0].places)
    && fresh[0].list_id && fresh[0].brief.includes(fresh[0].list_id), JSON.stringify(fresh).slice(0, 500));
  const sms = sql(`SELECT status, nodes FROM crm_project_workflows WHERE account_id = '${ACCT}' AND name = 'Text the prospects who opt in'`);
  ok('…and the texting workflow waits as a draft, started only by an opt-in', sms[0]?.status === 'draft' && /sms opt-in/.test(sms[0].nodes), JSON.stringify(sms));
  const optEmails = sql(`SELECT nodes FROM crm_project_workflows WHERE account_id = '${ACCT}' AND nodes LIKE '%smsOptInLink%'`);
  ok('…and the outreach emails carry the opt-in link', optEmails.length >= 1);
  await ctx.close();
}

/* AI Prospecting → "Search this every day". */
{
  const { ctx, page } = await signIn(1280);
  await page.goto(`${B}/prospecting`, { waitUntil: 'networkidle' });
  await page.getByLabel('Who to look for').fill('dentists in York');
  await page.keyboard.press('Enter');
  await page.getByText(/Checked \d+ contact|Read \d+ websites/).first().waitFor({ timeout: 60_000 }).catch(() => {});
  await page.getByRole('button', { name: /Search this every day/ }).click();
  const panel = page.getByRole('region', { name: 'Search this every day' });
  await panel.getByRole('radio', { name: /Leeds dentists/ }).check({ timeout: 10_000 });
  await panel.getByRole('button', { name: 'Search it every day' }).click();
  await page.getByText(/is now searched every day for "Leeds dentists"/).waitFor({ timeout: 15_000 }).catch(() => {});
  ok('a search joins a project\'s daily rotation, said plainly', /is now searched every day for "Leeds dentists"/.test(await page.innerText('body')));
  const f = sql(`SELECT places FROM crm_prospect_finders WHERE id = '${FID}'`)[0];
  ok('…added to it, not replacing it', /Leeds/.test(f.places) && /York/.test(f.places), f.places);
  await ctx.close();

  const m = await signIn(390);
  await m.page.goto(`${B}/autopilot?project=${encodeURIComponent(PID)}&tab=prospects`, { waitUntil: 'networkidle' });
  await m.page.getByText('Daily prospecting').waitFor({ timeout: 15_000 }).catch(() => {});
  ok('@390: the Prospects tab fits the phone', (await overflow(m.page)) <= 0 && /Daily prospecting/.test(await m.page.innerText('body')), String(await overflow(m.page)));
  await m.page.screenshot({ path: 'test-results/autopilot-prospects-390.png', fullPage: true });
  await m.ctx.close();
}

ok('no page errors', !errs.length, errs.join(' | '));
await br.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
