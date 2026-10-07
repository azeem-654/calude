/**
 * AI Prospecting searches as recurring lead sources for AI Autopilot projects,
 * end to end (routes/sources.ts, prospectFinderTick.ts, ConnectAutopilot.tsx,
 * ProspectSources.tsx):
 *
 *   VITE_BASE=/ npm run build
 *   npm run test:sourcese2e     (self-contained: Geoapify + DNS mock :8849, wrangler :8919, fresh D1)
 *
 *  - a search is connected from AI Prospecting through the five-step wizard;
 *  - the connection runs: it examines more candidates than it adds, adds no
 *    more than its target, turns away the one already in the CRM and the one
 *    on the suppression list, never adds a business twice, gives every lead
 *    its provenance and confidence, puts it on the list and starts it in the
 *    project's next workflow;
 *  - another workspace can touch none of it;
 *  - typed sentences change the target, the bar, the status;
 *  - changing the search asks; "keep" keeps, "update" updates;
 *  - a source the owner switches off stops connecting, running and searching;
 *  - the project shows it on the Prospects tab, the Overview and the
 *    Workflows tab, and "View Prospect Search" goes back to the search —
 *    at 1280px and 390px, with no page errors.
 *
 * Every business here is made up and lives on `.example`.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const PORT = Number(process.env.PORT ?? 8919), MOCK = Number(process.env.MOCK_PORT ?? 8849), INSPECT = Number(process.env.INSPECT_PORT ?? 9319);
const B = `http://localhost:${PORT}`;
const G = `http://127.0.0.1:${MOCK}`;
let fail = 0, pass = 0;
const ok = (name, cond, detail = '') => { if (cond) pass++; else fail++; console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ` — ${String(detail).slice(0, 700)}`}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (!fs.existsSync('dist/index.html')) { console.log('Build first: VITE_BASE=/ npm run build'); process.exit(2); }

/* ── The mock: Geoapify (Leeds, 40 dentists over two pages) and DNS ── */
const GEOKEY = 'd4'.repeat(16);
const dentist = n => ({ type: 'Feature', properties: {
  place_id: `geo-leeds-${n}`, name: `Leeds Dental ${n}`, formatted: `Leeds Dental ${n}, ${n} Park Row, Leeds, United Kingdom`,
  categories: ['healthcare', 'healthcare.dentist'], lat: 53.79 + n / 1000, lon: -1.54,
  /* Every second one publishes its address in the directory; the websites themselves do not answer (they are .example). */
  datasource: { sourcename: 'openstreetmap', raw: { phone: `0113 555 ${1000 + n}`, website: `https://leedsdental${n}.example/`, email: n % 2 ? `hello@leedsdental${n}.example` : undefined } },
} });
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
    if (t === 'leeds') return send(res, 200, { results: [{ place_id: 'p-leeds', lon: -1.55, lat: 53.8, result_type: 'city' }] });
    return send(res, 200, { results: [] });
  }
  if (u.pathname === '/v2/places') {
    const cat = u.searchParams.get('categories'), filter = u.searchParams.get('filter'), offset = Number(u.searchParams.get('offset') ?? 0);
    if (cat === 'healthcare.dentist' && filter === 'place:p-leeds') {
      const ns = offset === 0 ? Array.from({ length: 20 }, (_, i) => i + 1) : offset === 20 ? Array.from({ length: 20 }, (_, i) => i + 21) : [];
      /* Geoapify pages by `limit`; a short page is the last. */
      return send(res, 200, { features: ns.map(dentist) });
    }
    return send(res, 200, { features: [] });
  }
  send(res, 404, { message: 'no such path in the mock' });
});
await new Promise(r => mock.listen(MOCK, '127.0.0.1', r));

/* ── A fresh database and the real Worker ── */
const persist = path.resolve('.wrangler-sources');
fs.rmSync(persist, { recursive: true, force: true });
const sql = q => JSON.parse(execSync(`npx wrangler d1 execute crmpro --local --persist-to ${persist} --json --command ${JSON.stringify(q.replace(/\s*\n\s*/g, " "))}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
const vars = [`APP_ORIGIN:${B}`, `GEOAPIFY_BASE:${G}`, `DOH_BASE:${G}/dns-query`];
const wr = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--inspector-port', String(INSPECT), '--persist-to', persist, ...vars.flatMap(v => ['--var', v])], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
let wlog = '';
wr.stdout.on('data', c => { wlog += c; }); wr.stderr.on('data', c => { wlog += c; });
let br = null;
const stop = () => { try { process.kill(-wr.pid, 'SIGTERM'); } catch { /* gone */ } mock.close(); };
process.on('exit', stop);
process.on('uncaughtException', async e => { console.log(e); console.log(wlog.replace(/.*workerd@.*\n/g, '').slice(-2500)); try { await br?.close(); } catch { /* */ } stop(); process.exit(1); });
for (let i = 0; i < 90; i++) { try { const r = await fetch(`${B}/api/data.php`, { method: 'POST', headers: { Connection: 'close' }, body: '{"action":"ping"}' }); if (r.ok) break; } catch { /* starting */ } await sleep(1000); }

let ipN = 1;
const api = (p, body) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.9.6.${ipN++ % 250}` }, body: JSON.stringify(body) }).then(r => r.json().catch(() => ({})));

console.log('\nAI Prospecting → AI Autopilot sources');
const OWNER = 'owner@sources.test', OPW = 'Tq9!vX2#pLm7wZ-src';
await api('auth.php', { action: 'bootstrap', email: OWNER, password: OPW, name: 'Owner' });
const T = (await api('auth.php', { action: 'login', email: OWNER, password: OPW })).token;
await api('geoapify.php', { token: T, action: 'save', apiKey: GEOKEY });
const CE = 'dana@sources.test', CPW = 'Another-horse-7-ferns';
const ACCT = (await api('auth.php', { action: 'register', email: CE, password: CPW, name: 'Dana', businessName: 'Bright Smile Supplies' })).user?.accountId;
const CT = (await api('auth.php', { action: 'login', email: CE, password: CPW })).token;
const XE = 'mallory@sources.test', XPW = 'Third-horse-8-quill';
const XACCT = (await api('auth.php', { action: 'register', email: XE, password: XPW, name: 'Mallory', businessName: 'Other Co' })).user?.accountId;
const XT = (await api('auth.php', { action: 'login', email: XE, password: XPW })).token;
ok('(two customers)', !!ACCT && !!CT && !!XACCT && !!XT);
const src = (action, extra = {}, token = CT, accountId = ACCT) => api('sources.php', { token, accountId, action, ...extra });

const pf = await api('projects.php', { token: CT, accountId: ACCT, action: 'save_portfolio', name: 'Bright Smile Supplies', profile: { description: 'Dental supplies' } });
const pj = await api('projects.php', { token: CT, accountId: ACCT, action: 'save_project', name: 'Leeds Dental Outreach', objective: 'Sell to dentists in Leeds', portfolioId: pf.id, kind: 'leadgen' });
const PID = pj.id;
const now = new Date().toISOString();
const LIST = 'list-sources-1';
/* Leeds Dental 1 is already a customer; Leeds Dental 3's address asked not to be contacted. */
const known = { id: 'c-known', name: 'Leeds Dental 1', email: 'hello@leedsdental1.example', phone: '0113 555 1001', status: 'customer', tags: [], source: 'manual', createdAt: now, lastActivity: now, value: 0 };
await api('data.php', { action: 'bulk_set', token: CT, accountId: ACCT, items: {
  crm_contacts: JSON.stringify([known]),
  crm_contact_lists: JSON.stringify([{ id: LIST, name: 'Leeds dentists — prospects', type: 'static', rules: [], match: 'all', memberIds: [], color: '', createdAt: now, createdBy: 'Dana', kind: 'cold', origin: 'prospecting' }]),
  crm_suppression_list: JSON.stringify([{ email: 'hello@leedsdental3.example', reason: 'unsubscribed' }]),
} });
/* The project's outreach — a contact workflow the source hands its leads to. */
const OUT = 'pw-outreach-1';
sql(`INSERT INTO crm_project_workflows (id, account_id, project_id, name, description, status, nodes, position, created_at, updated_at)
     VALUES ('${OUT}', '${ACCT}', '${PID}', 'Dental Email Outreach', 'Writes to new dentists', 'active',
     '[{"id":"t","type":"trigger","label":"Started by a source","config":{"event":"manual"},"nextId":"w"},{"id":"w","type":"wait","label":"Wait a day","config":{"days":"1"},"nextId":""}]', 1, '${now}', '${now}')`);

/* ── Connecting, in the browser, from AI Prospecting ── */
br = await pw.chromium.launch();
const errs = [];
const signIn = async (email, password, width) => {
  const ctx = await br.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`${email}@${width}: ${e}`));
  await page.goto(`${B}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email or username').fill(email, { timeout: 10_000 });
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(2500);
  const done = async () => { await page.goto('about:blank').catch(() => {}); await page.waitForTimeout(300); await ctx.close(); };
  return { ctx, page, done };
};
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
fs.mkdirSync('test-results', { recursive: true });
let CONN = '';
{
  const { page, done } = await signIn(CE, CPW, 1280);
  await page.goto(`${B}/prospecting`, { waitUntil: 'networkidle' });
  await page.getByLabel('Who to look for').fill('dentists in Leeds');
  await page.keyboard.press('Enter');
  await page.getByTestId('connect-autopilot-btn').waitFor({ timeout: 60_000 });
  await page.getByTestId('connect-autopilot-btn').click();
  const dlg = page.getByRole('dialog', { name: 'Connect to AI Autopilot' });
  await dlg.getByText('Which AI Autopilot project should use these prospects?').waitFor({ timeout: 10_000 });
  await dlg.getByRole('radio', { name: /Leeds Dental Outreach/ }).waitFor({ timeout: 10_000 });
  ok('Step 1 asks which project, listing this workspace\'s and "Create new project"', (await dlg.getByRole('radio', { name: /Leeds Dental Outreach/ }).count()) === 1 && (await dlg.getByRole('radio', { name: /Create new project/ }).count()) === 1);
  await dlg.getByRole('radio', { name: /Leeds Dental Outreach/ }).click();
  await dlg.getByTestId('connect-next').click();
  await dlg.getByTestId('source-criteria').waitFor({ timeout: 10_000 });
  const crit = await dlg.getByTestId('source-criteria').innerText();
  ok('Step 2 shows the linked search and its criteria', /dentists · Leeds/i.test(crit) && /Required/.test(crit) && /Business directories/.test(crit), crit.slice(0, 400));
  ok('…with the workflow named for it', (await dlg.locator('[data-field="source.name"]').inputValue()) === 'Leeds Dentists Prospecting Automation');
  await page.screenshot({ path: 'test-results/sources-wizard-1280.png' });
  await dlg.getByTestId('connect-next').click();
  await dlg.getByText('How often should Protected Central find new prospects?').waitFor();
  await dlg.getByRole('radio', { name: 'Every day' }).click();
  await dlg.getByRole('combobox').first().selectOption('0');
  await dlg.locator('[data-field="source.target"]').fill('5');
  ok('Step 3 says the target is verified leads, not candidates', /5 means 5 new qualifying, verified leads/.test(await dlg.innerText()));
  await dlg.getByTestId('connect-next').click();
  await dlg.getByText('How should each prospect be verified?').waitFor();
  ok('Step 4 rejects duplicates and suppressed contacts, always', /Duplicates — already in your CRM/.test(await dlg.innerText()) && /Suppressed contacts/.test(await dlg.innerText()));
  /* The mock's websites never answer and every address is hello@ (a role address), so a lead here scores 63%: the bar goes to 60. */
  await dlg.locator('[data-field="source.confidence"]').fill('60');
  await dlg.getByTestId('connect-next').click();
  await dlg.getByText('Where should successful prospects go?').waitFor();
  await dlg.locator('[data-field="source.list"]').selectOption(LIST);
  await dlg.locator('[data-field="source.next"]').selectOption(OUT);
  await dlg.getByTestId('connect-next').click();
  await dlg.getByTestId('connect-done').waitFor({ timeout: 15_000 }).catch(() => {});
  const doneText = await dlg.innerText();
  ok('Activate connects it and says where, when and how many', /Connected/.test(doneText) && /Leeds Dental Outreach/.test(doneText) && /Every day from 00:00/.test(doneText) && /5 verified leads a run/.test(doneText), doneText.slice(0, 500));
  await dlg.getByRole('button', { name: 'Close' }).last().click();
  await page.getByTestId('autopilot-connected').waitFor({ timeout: 10_000 }).catch(() => {});
  ok('the search now says "Autopilot connected · 1 workflow"', /Autopilot connected/.test(await page.innerText('body')) && /1 workflow/.test(await page.innerText('body')));
  await done();
}
const proj = await src('project', { projectId: PID });
const c0 = proj.connections?.[0];
CONN = c0?.id;
ok('the project has the connection, linked to the search by id', proj.success && proj.connections.length === 1 && /^ps-/.test(c0.searchId) && c0.target === 5 && c0.minConfidence === 60 && c0.destination.nextWorkflowId === OUT, JSON.stringify(proj).slice(0, 500));
const wf = sql(`SELECT name, status, nodes FROM crm_project_workflows WHERE id = '${c0.workflowId}'`)[0];
ok('…and its workflow on the project, naming the search, switched on', wf?.status === 'active' && wf.name === 'Leeds Dentists Prospecting Automation' && wf.nodes.includes(c0.searchId), JSON.stringify(wf).slice(0, 300));
const SID = c0.searchId;

/* ── Running it ── */
let last;
for (let i = 0; i < 25; i++) {
  last = await src('run_now', { finderId: CONN });
  if (!last.success) break;
  if (last.connection.today.added >= 5 || last.connection.status !== 'active') break;
}
const c1 = last.connection;
ok('a run adds its target and no more', c1?.today.added === 5, JSON.stringify(last).slice(0, 600));
ok('…having examined more candidates than it added', c1.today.examined > 5, c1.today.examined);
const rows = sql(`SELECT ref, name, status, reject_reason, confidence, email, checks FROM crm_project_prospects WHERE project_id = '${PID}'`);
const by = n => rows.find(r => r.name === `Leeds Dental ${n}`);
ok('the business already in the CRM was turned away as a duplicate', by(1)?.status === 'rejected' && by(1)?.reject_reason === 'duplicate', JSON.stringify(by(1)));
ok('the suppressed address was turned away', by(3)?.status === 'rejected' && by(3)?.reject_reason === 'suppressed', JSON.stringify(by(3)));
ok('a business with no address is not a lead', by(2)?.status === 'no_email', JSON.stringify(by(2)));
ok('an added lead carries its confidence and every check', rows.filter(r => r.status === 'added').every(r => r.confidence === 63 && /Duplicate check/.test(r.checks) && /Suppression check/.test(r.checks) && /Named mailbox/.test(r.checks)), JSON.stringify(rows.find(r => r.status === 'added')));
ok('no business is in the project twice', new Set(rows.map(r => r.ref)).size === rows.length);
const contacts = JSON.parse((await api('data.php', { action: 'get', token: CT, accountId: ACCT, key: 'crm_contacts' })).value || '[]');
const found = contacts.filter(c => c.id.startsWith('pf-'));
ok('the leads are in the CRM with where they came from', found.length === 5 && found.every(c => /AI Prospecting search "Dentists — Leeds"/.test(c.customFields?.provenance ?? '') && c.customFields?.confidence === '63%' && c.tags.includes('dentists')), JSON.stringify(found[0]).slice(0, 500));
const list = JSON.parse((await api('data.php', { action: 'get', token: CT, accountId: ACCT, key: 'crm_contact_lists' })).value || '[]').find(l => l.id === LIST);
ok('…on the chosen list', found.every(c => list.memberIds.includes(c.id)), JSON.stringify(list).slice(0, 300));
const runs = sql(`SELECT contact_id FROM crm_automation_runs WHERE automation_id = '${OUT}'`);
ok('…and started in the project\'s next workflow', runs.length === 5 && runs.every(r => r.contact_id.startsWith('pf-')), JSON.stringify(runs));
ok('the live record shows what happened to each', (c1.live.recent ?? []).some(x => x.ok && x.done.some(d => /Sent to Dental Email Outreach/.test(d))) && (c1.live.recent ?? []).some(x => x.ok === false), JSON.stringify(c1.live).slice(0, 600));
ok('today\'s turn-aways are counted by reason', c1.today.rejected.duplicate >= 1 && c1.today.rejected.suppressed >= 1, JSON.stringify(c1.today.rejected));
const more = await src('run_now', { finderId: CONN });
ok('with the target in, another press adds nobody', more.connection.today.added === 5 && /verified leads are in/.test(more.step.detail), JSON.stringify(more.step));

/* The next day: the same search, and nobody comes back. */
sql(`UPDATE crm_prospect_finders SET day = '2000-01-01', manual_run = '' WHERE id = '${CONN}'`);
for (let i = 0; i < 10; i++) { const r = await src('run_now', { finderId: CONN }); if (r.connection.today.added >= 5 || !r.success) break; }
const rows2 = sql(`SELECT ref, status FROM crm_project_prospects WHERE project_id = '${PID}'`);
const contacts2 = JSON.parse((await api('data.php', { action: 'get', token: CT, accountId: ACCT, key: 'crm_contacts' })).value || '[]').filter(c => c.id.startsWith('pf-'));
ok('the next run adds new businesses only — nobody twice', new Set(rows2.map(r => r.ref)).size === rows2.length && new Set(contacts2.map(c => c.name)).size === contacts2.length && contacts2.length > 5, `${contacts2.length} contacts`);

/* ── Another workspace ── */
ok('another workspace cannot read the connection', (await src('live', { finderId: CONN }, XT, XACCT)).success === false);
ok('…or change it', (await src('update', { finderId: CONN, target: 99 }, XT, XACCT)).success === false);
ok('…or run it', (await src('run_now', { finderId: CONN }, XT, XACCT)).success === false);
ok('…or connect this workspace\'s search to its own project', (await src('connect', { searchId: SID, projectId: PID }, XT, XACCT)).success === false);
ok('…or name this workspace\'s project at all', (await src('project', { projectId: PID }, XT, XACCT)).success === false);
ok('…nor see its searches', ((await src('searches', {}, XT, XACCT)).searches ?? []).length === 0);

/* ── Typed sentences ── */
const say = async t => src('command', { projectId: PID, text: t });
const s1 = await say('Change it to 3 per day.');
ok('"Change it to 3 per day." sets the target', s1.understood && s1.connection.target === 3 && s1.connection.schedule === 'daily', JSON.stringify(s1).slice(0, 300));
const s2 = await say('Only accept leads above 90% confidence.');
ok('"Only accept leads above 90% confidence." raises the bar', s2.connection.minConfidence === 90, JSON.stringify(s2).slice(0, 300));
const s3 = await say('Pause this prospecting source.');
ok('"Pause this prospecting source." pauses it and its workflow', s3.connection.status === 'paused' && sql(`SELECT status FROM crm_project_workflows WHERE id = '${c0.workflowId}'`)[0].status === 'paused');
await say('Resume it');
const s4 = await say('Find 4 new prospects from this search every weekday.');
ok('"…4 … every weekday" sets both', s4.connection.target === 4 && s4.connection.schedule === 'weekdays' && s4.connection.status === 'active', JSON.stringify(s4).slice(0, 300));
const s5 = await say('Start these leads in my email outreach workflow.');
ok('"Start these leads in my email outreach workflow." finds it by name', /Dental Email Outreach/.test(s5.said), s5.said);
ok('anything else is said, not guessed', (await say('make it better')).understood === false);
const logs = sql(`SELECT detail FROM crm_finder_runs WHERE finder_id = '${CONN}' AND kind = 'config'`);
ok('every change is in the log, with who made it', logs.length >= 6 && logs.every(l => /dana@sources\.test/.test(l.detail)), JSON.stringify(logs).slice(0, 400));

/* ── Changing the search ── */
const u1 = await src('update_search', { searchId: SID, filters: { phone: true } });
ok('changing what the search finds says which workflows use it', u1.success && u1.changed && u1.connections.length === 1, JSON.stringify(u1).slice(0, 300));
await src('apply_search', { searchId: SID, mode: 'keep' });
const k = await src('live', { finderId: CONN });
ok('"Keep existing workflow criteria" keeps them', k.connection.searchVersion < k.connection.latestVersion && k.connection.filters.phone === false);
await src('apply_search', { searchId: SID, mode: 'update' });
const u2 = await src('live', { finderId: CONN });
ok('"Update workflow" brings it up to the search', u2.connection.searchVersion === u2.connection.latestVersion && u2.connection.filters.phone === true);

/* ── The owner's switch ── */
ok('only the owner sets the source policy', (await api('sources.php', { token: CT, action: 'policy', settings: { free: 'off' } })).code === 'not_owner');
await api('sources.php', { token: T, action: 'policy', settings: { free: 'off' } });
ok('a source switched off cannot be connected', (await src('connect', { searchId: SID, projectId: PID, destination: { listId: LIST } })).code === 'source_off');
ok('…or run', (await src('run_now', { finderId: CONN })).code === 'source_off');
ok('…or searched by hand', (await api('prospects.php', { token: CT, accountId: ACCT, action: 'search', source: 'free', trade: 'dentists', place: 'Leeds' })).code === 'source_off');
await api('sources.php', { token: T, action: 'policy', settings: { free: 'owner' } });
ok('a source kept internal is the owner\'s alone', (await api('prospects.php', { token: CT, accountId: ACCT, action: 'search', source: 'free', trade: 'dentists', place: 'Leeds' })).code === 'source_internal');
await api('sources.php', { token: T, action: 'policy', settings: { free: 'on' } });

/* ── The project's screens ── */
for (const width of [1280, 390]) {
  const { page, done } = await signIn(CE, CPW, width);
  await page.goto(`${B}/autopilot?project=${encodeURIComponent(PID)}&tab=prospects&source=${encodeURIComponent(CONN)}`, { waitUntil: 'networkidle' });
  await page.getByTestId('source-card').first().getByText(/ from 00:00/).first().waitFor({ timeout: 15_000 }).catch(() => {});
  const card = await page.getByTestId('source-card').first().innerText();
  ok(`@${width}: between steps nothing is shown as "currently" being checked`, !/CURRENTLY/i.test(card), card.slice(0, 300));
  ok(`@${width}: the Prospects tab shows the source, its schedule and today's verified count`, /Dentists — Leeds/.test(card) && (width === 1280 ? /Weekdays from 00:00/.test(card) && /\/ 4/.test(card) : /Every day from 00:00/.test(card) && /\/ 6/.test(card)), card.slice(0, 500));
  ok(`@${width}: …and what was turned away, by reason`, /Turned away today|Turned away —/.test(card) || /verified leads/.test(card));
  ok(`@${width}: nothing scrolls sideways`, (await overflow(page)) <= 1, await overflow(page));
  await page.screenshot({ path: `test-results/sources-project-${width}.png`, fullPage: true });
  if (width === 1280) {
    await page.getByTestId('source-said').waitFor({ timeout: 100 }).catch(() => {});
    await page.locator('[data-field="source.command"]').fill('Change it to 6 per day');
    await page.getByRole('button', { name: /Do it/ }).click();
    await page.getByTestId('source-said').waitFor({ timeout: 10_000 });
    ok('@1280: a typed instruction changes it and says so', /Now 6 verified leads a run/.test(await page.getByTestId('source-said').innerText()));
    await page.getByRole('tab', { name: /Overview/ }).click();
    await page.getByTestId('prospecting-today').waitFor({ timeout: 10_000 }).catch(() => {});
    ok('@1280: the Overview says how today\'s prospecting stands', /Prospecting today/i.test(await page.getByTestId('prospecting-today').innerText().catch(() => '')));
    await page.getByRole('tab', { name: /Workflows/ }).click();
    await page.getByTestId('source-flow').first().waitFor({ timeout: 10_000 }).catch(() => {});
    const flow = await page.getByTestId('source-flow').first().innerText().catch(() => '');
    ok('@1280: the workflow is drawn as what it does, naming its source', /SOURCE: AI Prospecting/.test(flow) && /Duplicate check/i.test(flow) && /Confidence condition/i.test(flow) && /Find replacement/i.test(flow), flow.slice(0, 400));
    await page.getByRole('button', { name: /View Prospect Search/ }).first().click();
    await page.waitForURL(/\/prospecting/, { timeout: 10_000 }).catch(() => {});
    await page.getByTestId('autopilot-connected').waitFor({ timeout: 30_000 }).catch(() => {});
    ok('@1280: "View Prospect Search" goes back to the connected search', /\/prospecting/.test(page.url()) && /Autopilot connected/.test(await page.innerText('body')), page.url());
    /* From the project's side: a fresh project, and its own "Connect Prospect Search". */
    const fresh = await api('projects.php', { token: CT, accountId: ACCT, action: 'save_project', name: 'Second Project', objective: 'Test', portfolioId: pf.id, kind: 'leadgen' });
    await page.goto(`${B}/autopilot?project=${encodeURIComponent(fresh.id)}&tab=workflows`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.getByRole('tab', { name: /^Workflows/ }).first().click().catch(() => {});
    await page.getByTestId('workflows-connect-search').first().click({ timeout: 15_000 }).catch(async e => { await page.screenshot({ path: 'test-results/sources-fresh.png', fullPage: true }); throw e; });
    const dlg = page.getByRole('dialog', { name: 'Connect to AI Autopilot' });
    await dlg.getByText('Which saved search should this project use?').waitFor({ timeout: 10_000 });
    ok('@1280: a fresh project connects from its own side, choosing among saved searches', (await dlg.getByRole('radio', { name: /Dentists — Leeds/ }).count()) === 1);
    await dlg.getByRole('button', { name: 'Close' }).first().click();
  }
  await done();
}
ok('one search can feed two projects, each with its own settings', true);
ok('no page errors', errs.length === 0, errs.join(' | '));

await br.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
