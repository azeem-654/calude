/**
 * Prospecting, end to end: the page, the free directory, imports into contact
 * lists, and those lists as audiences for a campaign and an Autopilot project.
 *
 *   VITE_BASE=/ npm run build
 *   npm run test:prospecting
 *
 * Self-contained: a Geoapify mock on 127.0.0.1:8838, a fresh D1 in
 * .wrangler-audit (wiped first), `wrangler dev` on :8908 (inspector :9308)
 * with GEOAPIFY_BASE pointed at the mock, a real browser at 1280 and 390,
 * and everything it started stopped at the end. Ports are overridable
 * (PORT, MOCK_PORT, INSPECT_PORT) because several sessions share a machine.
 *
 * What it proves:
 *  - Prospecting is in the nav under Customers, and opens;
 *  - a free search shows results, and "More results" fetches the next page;
 *  - importing into a NEW list creates the list and the contacts; a second
 *    import into the same list adds only the new ones and says so;
 *  - the list is offered as a campaign audience (preselected from the
 *    shortcut, with the strangers warning) and as an Autopilot project's
 *    audience — and the project built from it stores the list on its brief;
 *  - the list and its contacts come back in a fresh browser (server sync);
 *  - no sideways scroll and no page errors at 1280 or 390.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const PORT = Number(process.env.PORT ?? 8908), MOCK = Number(process.env.MOCK_PORT ?? 8838), INSPECT = Number(process.env.INSPECT_PORT ?? 9308);
const B = `http://localhost:${PORT}`;
const G = `http://127.0.0.1:${MOCK}`;
let fail = 0, pass = 0;
const ok = (name, cond, detail = '') => { if (cond) pass++; else fail++; console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ` — ${String(detail).slice(0, 600)}`}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!fs.existsSync('dist/index.html')) { console.log('Build first: VITE_BASE=/ npm run build'); process.exit(2); }

/* ── The Geoapify mock: 60 dentists in Leeds on the first page, 3 on the second ── */
const GEOKEY = 'c3'.repeat(16);
const dentist = n => ({ type: 'Feature', properties: {
  place_id: `geo-dent-${n}`, name: `Leeds Dental ${n}`, formatted: `Leeds Dental ${n}, ${n} Park Row, Leeds LS1 5HD, United Kingdom`,
  categories: ['healthcare', 'healthcare.dentist'], lat: 53.79, lon: -1.54,
  datasource: { sourcename: 'openstreetmap', raw: {
    phone: `0113 555 ${String(1000 + n)}`, website: `https://leedsdental${n}.example/`,
    /* Some publish an address on the map, most do not — as in life. */
    email: n % 3 === 1 ? `hello@leedsdental${n}.example` : undefined,
  } },
} });
const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
/* AI Prospecting's checks: DNS over HTTPS and Hunter, on the same mock. */
const HKEY = 'ab'.repeat(20);
const CHKEY = '0f3c1a2b-4d5e-4f60-8a71-92b3c4d5e6f7';
const chCalls = [];
const hunterCalls = { verify: 0, find: 0 };
const mock = http.createServer((req, res) => {
  const u = new URL(req.url, G);
  if (u.pathname === '/dns-query') {
    const name = u.searchParams.get('name') ?? '';
    if (name === 'dead.example') return send(res, 200, { Status: 3 });
    if (/^leedsdental\d+\.example$/.test(name) && u.searchParams.get('type') === 'MX') return send(res, 200, { Status: 0, Answer: [{ type: 15, data: `10 mx.${name}.` }] });
    return send(res, 200, { Status: 0, Answer: [] });
  }
  if (['/v2/account', '/v2/email-verifier', '/v2/domain-search'].includes(u.pathname)) {
    if (u.searchParams.get('api_key') !== HKEY) return send(res, 401, { errors: [{ id: 'authentication_failed', details: 'No user found for the API key supplied' }] });
    if (u.pathname === '/v2/account') return send(res, 200, { data: { requests: { searches: { used: 0, available: 25 }, verifications: { used: 0, available: 50 } } } });
    if (u.pathname === '/v2/email-verifier') {
      hunterCalls.verify++;
      const e = u.searchParams.get('email') ?? '';
      if (e === 'hello@leedsdental1.example') return send(res, 200, { data: { status: 'valid', result: 'deliverable' } });
      if (e === 'hello@leedsdental4.example') return send(res, 200, { data: { status: 'invalid', result: 'undeliverable' } });
      return send(res, 200, { data: { status: 'accept_all', result: 'risky', accept_all: true } });
    }
    if (u.pathname === '/v2/domain-search') {
      hunterCalls.find++;
      const d = u.searchParams.get('domain');
      if (d === 'leedsdental2.example') return send(res, 200, { data: { emails: [
        { value: 'sarah.chen@leedsdental2.example', type: 'personal', confidence: 92, sources: [{ uri: 'https://leedsdental2.example/team' }], first_name: 'Sarah', last_name: 'Chen', position: 'Practice Manager' },
        { value: 'guess@leedsdental2.example', type: 'personal', confidence: 40, sources: [], first_name: 'Gus', last_name: 'Ess' },
      ] } });
      return send(res, 200, { data: { emails: [] } });
    }
  }
  /* Companies House: the key is the Basic-auth username. */
  if (u.pathname === '/search/companies' || u.pathname === '/advanced-search/companies' || u.pathname.startsWith('/company/')) {
    if (req.headers.authorization !== `Basic ${Buffer.from(`${CHKEY}:`).toString('base64')}`) return send(res, 401, { error: 'Invalid Authorization' });
    if (u.pathname === '/search/companies') return send(res, 200, { items: [] });
    if (u.pathname === '/advanced-search/companies') {
      chCalls.push(u.search);
      if (u.searchParams.getAll('sic_codes').join(',') !== '69201,69202,69203' || u.searchParams.get('company_status') !== 'active' || u.searchParams.get('location') !== 'Leeds') return send(res, 404, {});
      return send(res, 200, { hits: 2, items: [
        { company_name: 'PARK ROW ACCOUNTANTS LTD', company_number: '01234567', company_status: 'active', date_of_creation: '2015-04-01', registered_office_address: { address_line_1: '9 Park Row', locality: 'Leeds', postal_code: 'LS1 5HD' }, sic_codes: ['69201'] },
        { company_name: 'KIRKGATE TAX LLP', company_number: 'OC765432', company_status: 'active', registered_office_address: { address_line_1: '2 Kirkgate', locality: 'Leeds' }, sic_codes: ['69203'] },
      ] });
    }
    const m = /^\/company\/([^/]+)\/officers$/.exec(u.pathname);
    if (m && m[1] === '01234567') return send(res, 200, { items: [
      { name: 'SHAH, Priya', officer_role: 'director' },
      { name: 'OLD, Gone', officer_role: 'director', resigned_on: '2020-01-01' },
    ] });
    if (m) return send(res, 200, { items: [] });
  }
  if (u.searchParams.get('apiKey') !== GEOKEY) return send(res, 401, { statusCode: 401, message: 'Invalid apiKey' });
  if (u.pathname === '/v1/geocode/search') {
    const t = (u.searchParams.get('text') ?? '').toLowerCase();
    if (t === 'london' || t === 'leeds') return send(res, 200, { results: [{ place_id: `p-${t}`, lon: -1.55, lat: 53.8, result_type: 'city' }] });
    return send(res, 200, { results: [] });
  }
  if (u.pathname === '/v2/places') {
    if (u.searchParams.get('categories') === 'healthcare.dentist' && u.searchParams.get('filter') === 'place:p-leeds') {
      const offset = Number(u.searchParams.get('offset') ?? 0);
      const ns = offset === 0 ? Array.from({ length: 60 }, (_, i) => i + 1) : offset === 60 ? [61, 62, 63] : [];
      return send(res, 200, { type: 'FeatureCollection', features: ns.map(dentist) });
    }
    return send(res, 200, { type: 'FeatureCollection', features: [] });
  }
  send(res, 404, { message: 'no such path in the mock' });
});
await new Promise(r => mock.listen(MOCK, '127.0.0.1', r));

/* ── A fresh database and the real Worker ── */
const persist = path.resolve('.wrangler-audit');
fs.rmSync(persist, { recursive: true, force: true });
const sql = q => JSON.parse(execSync(`npx wrangler d1 execute crmpro --local --persist-to ${persist} --json --command ${JSON.stringify(q)}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
const vars = [`APP_ORIGIN:${B}`, `GEOAPIFY_BASE:${G}`, `DOH_BASE:${G}/dns-query`, `EMAIL_VERIFIER_BASE:${G}`, `COMPANIES_HOUSE_BASE:${G}`];
const wr = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--inspector-port', String(INSPECT), '--persist-to', persist, ...vars.flatMap(v => ['--var', v])], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
let wlog = '';
wr.stdout.on('data', c => { wlog += c; }); wr.stderr.on('data', c => { wlog += c; });
let br = null;
const stop = () => { try { process.kill(-wr.pid, 'SIGTERM'); } catch { /* gone */ } mock.close(); };
process.on('exit', stop);
process.on('uncaughtException', async e => { console.log(e); console.log(wlog.slice(-2000)); try { await br?.close(); } catch { /* */ } stop(); process.exit(1); });
for (let i = 0; i < 90; i++) { try { const r = await fetch(`${B}/api/data.php`, { method: 'POST', headers: { Connection: 'close' }, body: '{"action":"ping"}' }); if (r.ok) break; } catch { /* starting */ } await sleep(1000); }

let ipN = 1;
const api = (p, body) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.9.8.${ipN++ % 250}` }, body: JSON.stringify(body) }).then(r => r.json().catch(() => ({})));

console.log('\nProspecting');
const OWNER = 'owner@prospecting.test', OPW = 'Tq9!vX2#pLm7wZ-pros';
const boot = await api('auth.php', { action: 'bootstrap', email: OWNER, password: OPW, name: 'Owner' });
if (!boot.success) { console.log('bootstrap failed', boot, wlog.slice(-2000)); stop(); process.exit(2); }
const T = (await api('auth.php', { action: 'login', email: OWNER, password: OPW })).token;
const geo = await api('geoapify.php', { token: T, action: 'save', apiKey: GEOKEY });
ok('the owner sets the free directory\'s key', geo.success && geo.tested?.ok === true, JSON.stringify(geo));
const CE = 'dana@prospecting.test', CPW = 'Another-horse-7-dana';
const reg = await api('auth.php', { action: 'register', email: CE, password: CPW, name: 'Dana', businessName: 'Bright Smile Supplies' });
const ACCT = reg.user?.accountId;
ok('a customer signs up with a workspace', !!ACCT, JSON.stringify(reg).slice(0, 300));

/* ── The browser ── */
br = await pw.chromium.launch();
const errs = [];
fs.mkdirSync('test-results', { recursive: true });
const signIn = async (width) => {
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
const stored = (page, key) => page.evaluate(k => {
  const name = Object.keys(localStorage).find(x => x.endsWith(`_${k}`) && x.startsWith('crm_acct_'));
  try { return name ? JSON.parse(localStorage.getItem(name) || 'null') : null; } catch { return null; }
}, key);
const LIST = 'Dentists — Leeds test';

let listId = '';
{
  const { ctx, page } = await signIn(1280);

  /* The nav: under Customers. */
  /* Hover, not click: a mouse opens the panel on pointerenter, and a click after it would close it again. */
  await page.locator('[data-nav-group="customers"]').hover();
  const menu = page.getByRole('menu', { name: 'Customers' });
  const item = menu.getByRole('menuitem', { name: /Prospecting/ });
  ok('AI Prospecting is in the nav, under Customers', await item.isVisible() && /AI Prospecting/.test(await item.innerText()), await menu.innerText().catch(() => ''));
  await item.click();
  await page.waitForURL(/\/prospecting$/);
  const h1 = page.getByRole('heading', { level: 1, name: 'AI Prospecting' });
  await h1.waitFor({ timeout: 8000 }).catch(() => {});
  ok('…and opens the page', await h1.isVisible(), (await page.innerText('body')).slice(0, 300));
  const empty = await page.innerText('body');
  ok('the empty page says what to do', /Who do you want to sell to\?/.test(empty) && /None yet/.test(empty) && /never a guessed address/.test(empty), empty.slice(0, 800));

  /* A free search. */
  await page.locator('[data-field="prospects.trade"]').fill('dentists');
  await page.locator('[data-field="prospects.place"]').fill('Leeds');
  await page.getByRole('button', { name: /^Search$/ }).click();
  await page.getByText('Leeds Dental 1', { exact: true }).waitFor({ timeout: 15_000 });
  let body = await page.innerText('body');
  ok('a free search shows results, counted and credited', /60 found/.test(body) && /Powered by Geoapify/.test(body), body.slice(0, 400));
  await page.getByText(/Checked \d+ address/).waitFor({ timeout: 60_000 }).catch(() => {});
  body = await page.innerText('body');
  ok('…and runs as a plan: searched, then every address found given the free check',
    /Searched business directories for dentists in Leeds/.test(body) && /Checked 20 addresses — format, domain and mail server/.test(body), body.slice(0, 1200));
  ok('…the free check says the domain takes mail, never "Verified"',
    await page.locator('tr', { hasText: 'hello@leedsdental1.example' }).locator('.aip-badge[data-s="domain_ok"]').count() === 1
    && await page.locator('.aip-badge[data-s="valid"]').count() === 0);
  ok('…mailbox checks are offered only once the owner connects a verifier',
    await page.getByRole('button', { name: /Verify mailboxes — needs a verifier/ }).isDisabled() && await page.getByRole('button', { name: /Search the web for named people/ }).count() === 0);
  ok('…as a table with phone, website and published email', await page.locator('table[aria-label="Businesses found"] th', { hasText: 'Email' }).count() === 1
    && /0113 555 1001/.test(body) && /hello@leedsdental1\.example/.test(body));
  await page.getByRole('button', { name: /More results/ }).click();
  await page.getByText('Leeds Dental 63', { exact: true }).waitFor({ timeout: 15_000 });
  ok('"More results" fetches the next page', /63 found/.test(await page.innerText('body')));
  ok('the search is remembered', await page.getByRole('button', { name: /dentists in Leeds/ }).count() > 0);
  ok('@1280: no sideways scroll with results', (await overflow(page)) <= 0, String(await overflow(page)));

  /* Import 1..5 into a new list. */
  const tick = async n => page.getByRole('checkbox', { name: `Tick Leeds Dental ${n}`, exact: true }).check();
  for (const n of [1, 2, 3, 4, 5]) await tick(n);
  ok('the new-list choice is offered first, with a suggested name',
    /Dentists — Leeds, [A-Z][a-z]{2}/.test(await page.locator('[data-field="prospects.listName"]').inputValue()), await page.locator('[data-field="prospects.listName"]').inputValue());
  await page.locator('[data-field="prospects.listName"]').fill(LIST);
  const addBtn = page.getByRole('button', { name: /Add 5 to a new list/ });
  ok('importing waits for the acceptable-use confirmation', await addBtn.isDisabled());
  await page.getByRole('checkbox', { name: /Clause 3 of the acceptable use policy/ }).check();
  await addBtn.click();
  await page.getByText(/5 on “Dentists — Leeds test” — 5 new, 0 already in Contacts/).waitFor({ timeout: 5000 }).catch(() => {});
  body = await page.innerText('body');
  ok('a new list is made and the five added, said plainly', /5 on “Dentists — Leeds test” — 5 new, 0 already in Contacts/.test(body), body.slice(0, 500));
  let lists = await stored(page, 'crm_contact_lists');
  const made = (lists ?? []).find(l => l.name === LIST);
  listId = made?.id ?? '';
  ok('…in Contacts\' own lists: static, five members, marked cold, from prospecting',
    made?.type === 'static' && made.memberIds.length === 5 && made.kind === 'cold' && made.origin === 'prospecting', JSON.stringify(made));
  let contacts = await stored(page, 'crm_contacts');
  const dental = (contacts ?? []).filter(c => /^Leeds Dental/.test(c.name));
  ok('…and five contacts, as prospects, stamped with the search, no place id from the free directory',
    dental.length === 5 && dental.every(c => c.status === 'prospect' && /^Business directory .* · dentists in Leeds$/.test(c.source) && !c.customFields?.googlePlaceId), JSON.stringify(dental[0]));

  /* Import 1..7 into the same list: two new, five already there. */
  for (const n of [1, 2, 3, 4, 5, 6, 7]) await tick(n);
  await page.getByRole('radio', { name: /A list you already have/ }).check();
  await page.locator('[data-field="prospects.list"]').selectOption(listId);
  await page.getByRole('checkbox', { name: /Clause 3 of the acceptable use policy/ }).check();
  await page.getByRole('button', { name: /Add 7 to “Dentists — Leeds test”/ }).click();
  await page.getByText(/7 on “Dentists — Leeds test” — 2 new, 5 already in Contacts/).waitFor({ timeout: 5000 }).catch(() => {});
  body = await page.innerText('body');
  ok('a second import into the same list dedupes, and says how many were new', /7 on “Dentists — Leeds test” — 2 new, 5 already in Contacts/.test(body), body.slice(0, 500));
  contacts = await stored(page, 'crm_contacts');
  lists = await stored(page, 'crm_contact_lists');
  ok('…seven contacts, not twelve', (contacts ?? []).filter(c => /^Leeds Dental/.test(c.name)).length === 7);
  ok('…and seven on the list', (lists ?? []).find(l => l.id === listId)?.memberIds.length === 7);
  const side = page.locator(`[data-list="${listId}"]`);
  ok('the list is under "Your prospect lists" with its count', /Dentists — Leeds test/.test(await side.innerText()) && /7 businesses/.test(await side.innerText()), await side.innerText().catch(() => ''));
  await page.screenshot({ path: 'test-results/prospecting-1280.png' });
  await page.waitForTimeout(2500); // the sync's debounce

  /* The campaign shortcut: the wizard opens with the list as the audience. */
  await side.getByRole('button', { name: /Send a campaign to this list/ }).click();
  const wiz = page.getByRole('dialog', { name: 'Create campaign' });
  await wiz.waitFor({ timeout: 8000 });
  ok('the campaign shortcut opens the campaign wizard', await wiz.isVisible());
  await wiz.getByRole('button', { name: /From scratch/ }).click();
  await wiz.getByPlaceholder(/Summer Product Launch/).fill('Leeds dentists intro');
  await wiz.getByRole('button', { name: /Promote Offer/ }).click();
  await wiz.locator('textarea').first().fill('A free staff check-up day for dental practices in Leeds.');
  await wiz.getByRole('button', { name: /^Next/ }).click();
  await wiz.getByRole('button', { name: /Start from a template instead/ }).click({ timeout: 20_000 });
  await wiz.getByRole('button', { name: /^Next/ }).click();
  await wiz.getByRole('button', { name: /^Next/ }).click();
  await wiz.getByText('Who gets this?').waitFor({ timeout: 5000 });
  const opt = wiz.locator(`[data-list="${listId}"]`);
  ok('…and step 4 offers the list as an audience, already chosen, counted',
    (await opt.getAttribute('aria-checked')) === 'true' && /7 contacts/.test(await opt.innerText()) && /strangers/.test(await opt.innerText()), await opt.innerText().catch(() => ''));
  ok('…with the warning that these people never asked', /Nobody on “Dentists — Leeds test” asked to hear from you/.test(await wiz.innerText()));
  ok('…and the audience size is the list\'s', /Audience size\s*7/.test(await wiz.innerText()));
  await wiz.getByRole('button', { name: /^Review/ }).click();
  ok('the review says who it goes to by list', /7 contacts on “Dentists — Leeds test”/.test(await wiz.innerText()));
  await page.keyboard.press('Escape');

  /* The Autopilot shortcut: the wizard opens working from the list. */
  await page.goto(`${B}/prospecting`, { waitUntil: 'networkidle' });
  await page.locator(`[data-list="${listId}"]`).getByRole('button', { name: /Use this list in a new Autopilot project/ }).click();
  const np = page.getByRole('dialog', { name: 'New project' });
  await np.waitFor({ timeout: 8000 });
  const prompt = await np.getByLabel('What would you like Autopilot to do?').inputValue();
  ok('the Autopilot shortcut opens New Project with a starting sentence naming the list', /Dentists — Leeds test/.test(prompt), prompt);
  const cta = np.locator('footer .wz-cta');
  await cta.click();
  await np.getByText(/Here.s what I understood/).waitFor({ timeout: 20_000 });
  const understood = await np.innerText();
  ok('…and what it already knows is the list, by name', /Which contact list:\s*Dentists — Leeds test/.test(understood), understood.slice(0, 800));
  await cta.click();
  let sawPicker = false;
  for (let i = 0; i < 14; i++) {
    await page.waitForTimeout(300);
    if (await np.getByText(/Here.s what Autopilot/).count()) break;
    const picker = np.locator('[data-field="project.contactList"]');
    if (await picker.count()) {
      sawPicker = true;
      const mine = picker.locator(`[data-list="${listId}"]`);
      ok('the contacts question offers the list as the project\'s audience, chosen',
        (await mine.getAttribute('aria-checked')) === 'true' && /7 contacts · 3 with an email · strangers/.test(await mine.innerText()), await mine.innerText().catch(() => ''));
      ok('…and says how a cold list will be sent', /every batch waits for you to approve it/.test(await np.innerText()));
    }
    /* Answer what is on screen as somebody in a hurry would. */
    const typeIt = np.getByRole('button', { name: /Type it in/ });
    if (await typeIt.count() && (await typeIt.getAttribute('aria-pressed')) !== 'true') {
      await typeIt.click();
      await np.getByPlaceholder('Pike Plumbing & Heating').fill('Bright Smile Supplies');
      await np.getByPlaceholder(/Boiler repairs and installations/).fill('Dental supplies and staff check-up days for practices in Yorkshire');
    }
    for (const q of await np.locator('.np-q').all()) {
      if (await q.locator('.np-sol').count()) continue;
      if (await q.locator('[aria-pressed="true"]').count()) continue;
      const ai = q.locator('[data-ai="1"]');
      if (await ai.count()) { await ai.first().click(); continue; }
      const o = q.locator('.np-opt');
      if (await o.count()) { await o.first().click(); continue; }
      const input = q.locator('input.np-input');
      if (await input.count() && !(await input.first().inputValue())) await input.first().fill('A free staff check-up day');
    }
    if (await cta.isDisabled()) { ok('the wizard is not stuck', false, await cta.innerText()); break; }
    await cta.click();
  }
  ok('the list question was shown', sawPicker);
  const bpText = await np.innerText();
  ok('the blueprint says only the list is written to', /Only the people on that list are written to by this project/.test(bpText), bpText.slice(0, 600));
  await cta.click(); // → connections
  await page.waitForTimeout(400);
  await cta.click(); // → review
  await page.waitForTimeout(300);
  await np.getByRole('button', { name: /Build My Autopilot/ }).click();
  await np.getByRole('heading', { name: /Your Autopilot is ready|The build stopped/ }).waitFor({ timeout: 60_000 });
  const rows = sql("SELECT brief FROM crm_projects");
  const brief = rows.map(r => { try { return JSON.parse(r.brief); } catch { return {}; } }).find(b => b.audience);
  ok('the project built from it stores the list as its audience', brief?.audience?.listId === listId && brief.audience.listName === LIST, JSON.stringify(rows).slice(0, 400));
  ok('@1280: no page errors so far', !errs.length, errs.join(' | '));
  await ctx.close();
}

/* ── A fresh browser: everything came back from the server ── */
for (const width of [390, 1280]) {
  const { ctx, page } = await signIn(width);
  await page.goto(`${B}/prospecting`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const side = page.locator(`[data-list="${listId}"]`);
  ok(`fresh browser @${width}: the list is back, with its seven`, (await side.count()) > 0 && /7 businesses/.test(await side.innerText()), (await page.innerText('body')).slice(0, 500));
  const contacts = await stored(page, 'crm_contacts');
  ok(`fresh browser @${width}: so are the contacts, once each`, (contacts ?? []).filter(c => /^Leeds Dental/.test(c.name)).length === 7);
  ok(`fresh browser @${width}: the search history too`, await page.getByRole('button', { name: /dentists in Leeds/ }).count() > 0);
  if (width === 390) {
    await page.getByRole('button', { name: /dentists in Leeds/ }).first().click();
    await page.getByText('Leeds Dental 1', { exact: true }).first().waitFor({ timeout: 15_000 });
    ok('@390: a search from history runs and its results fit the phone', (await overflow(page)) <= 0, String(await overflow(page)));
    await page.getByRole('checkbox', { name: 'Tick Leeds Dental 8', exact: true }).check();
    ok('@390: the import controls are on screen', await page.getByRole('button', { name: /Add 1 to a new list/ }).isVisible());
    await page.getByText('Leeds Dental 1', { exact: true }).first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/prospecting-390-results.png' });
    await page.getByRole('button', { name: /Add 1 to a new list/ }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/prospecting-390-import.png' });
    await page.goto(`${B}/contacts?list=${listId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    ok('@390: "Open in Contacts" lands on the list', /Static list/.test(await page.innerText('body')) && (await overflow(page)) <= 0);
  }
  await ctx.close();
}

/* The dialog in Contacts still works, on the same insides. */
{
  const { ctx, page } = await signIn(1280);
  await page.goto(`${B}/contacts`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Find businesses/ }).first().click();
  const dlg = page.getByRole('dialog', { name: 'Find businesses' });
  await dlg.locator('[data-field="prospects.trade"]').fill('dentists');
  await dlg.locator('[data-field="prospects.place"]').fill('Leeds');
  await dlg.getByRole('button', { name: /^Search$/ }).click();
  await dlg.getByText('Leeds Dental 9', { exact: true }).waitFor({ timeout: 15_000 });
  await dlg.getByRole('checkbox', { name: 'Tick Leeds Dental 9', exact: true }).check();
  await dlg.getByRole('checkbox', { name: /Clause 3 of the acceptable use policy/ }).check();
  await dlg.getByRole('button', { name: /Add 1 to Contacts/ }).click();
  await page.waitForTimeout(600);
  const contacts = await stored(page, 'crm_contacts');
  ok('the Find businesses dialog imports through the same code', (contacts ?? []).filter(c => /^Leeds Dental/.test(c.name)).length === 8);
  await ctx.close();
}

/* ── AI Prospecting: a sentence, mailbox checks, named people, the checker, the dashboard, both themes ── */
console.log('\nAI Prospecting');
{
  const own = await api('email-verifier.php', { token: T, action: 'save', provider: 'hunter', apiKey: 'nope' });
  ok('a malformed verifier key is refused by name, on its box', own.success === false && own.field === 'verifier.key', JSON.stringify(own));
  const cust = await api('email-verifier.php', { token: (await api('auth.php', { action: 'login', email: CE, password: CPW })).token, action: 'status' });
  ok('only the owner may connect the verifier', cust.success === false && cust.code === 'not_owner', JSON.stringify(cust));
  const hv = await api('email-verifier.php', { token: T, action: 'save', provider: 'hunter', apiKey: HKEY });
  ok('the owner connects Hunter, and it is proved on the free credits call', hv.success && hv.tested?.ok === true && /25 searches and 50 verifications/.test(hv.tested.credits) && hunterCalls.verify === 0, JSON.stringify(hv));
  const plat = await api('platform.php', { token: T, action: 'status' });
  const row = (plat.services ?? []).find(x => x.id === 'email_verifier');
  ok('Platform services lists the verifier as working, never its key', row?.state === 'ok' && !JSON.stringify(plat).includes(HKEY), JSON.stringify(row));

  const { ctx, page } = await signIn(1280);
  await page.goto(`${B}/prospecting`, { waitUntil: 'networkidle' });
  await page.getByLabel('Who to look for').fill('Find dentists in Leeds with a website');
  await page.keyboard.press('Enter');
  await page.getByText(/Checked \d+ address/).waitFor({ timeout: 60_000 });
  let body = await page.innerText('body');
  ok('a typed sentence is understood and run — the question shown, the plan under it',
    await page.locator('.aip-bubble', { hasText: 'Find dentists in Leeds with a website' }).count() === 1 && /Searched business directories for dentists in Leeds/.test(body), body.slice(0, 900));
  ok('…the boxes show how it was understood', await page.locator('[data-field="prospects.trade"]').inputValue() === 'dentists' && await page.locator('[data-field="prospects.place"]').inputValue() === 'Leeds');
  ok('…and "with a website" narrows what is shown', (await page.getByRole('group', { name: 'Show' }).getByRole('button', { name: 'With website' }).getAttribute('aria-pressed')) === 'true');

  /* Mailbox checks, on the owner's Hunter. */
  const verifyBtn = page.getByRole('button', { name: /^Verify \d+ mailbox/ });
  ok('with a verifier connected, mailbox checks are offered', await verifyBtn.isEnabled(), await page.locator('.aip-next').innerText().catch(() => ''));
  await verifyBtn.click();
  await page.getByText(/Verified \d+ mailbox/).waitFor({ timeout: 30_000 });
  const rowOf = n => page.locator('tr', { hasText: `hello@leedsdental${n}.example` });
  ok('the mail server confirmed one: Verified', await rowOf(1).locator('.aip-badge[data-s="valid"]').count() === 1);
  ok('…a catch-all domain is Risky, not Verified', await rowOf(7).locator('.aip-badge[data-s="risky"]').count() === 1);
  const r4 = page.getByRole('row').filter({ has: page.getByRole('checkbox', { name: 'Tick Leeds Dental 4', exact: true }) });
  ok('…and the one that would bounce is no longer offered as the address, and says why', await r4.locator('.pp-email').count() === 0
    && await r4.locator('.aip-badge[data-s="invalid"]').count() === 1, await r4.innerText().catch(() => ''));
  const spent = hunterCalls.verify;
  ok('…every address was asked once (20)', spent === 20, String(spent));

  /* Named people Hunter saw published. */
  await page.getByRole('button', { name: /Search the web for named people/ }).click();
  await page.getByText(/Searched the web for addresses/).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
  const r2 = page.getByRole('row').filter({ has: page.getByRole('checkbox', { name: 'Tick Leeds Dental 2', exact: true }) });
  ok('a named person published on the web is found, with their role', /sarah\.chen@leedsdental2\.example/.test(await r2.innerText()) && /Sarah Chen, Practice Manager/.test(await r2.innerText()), await r2.innerText());
  ok('…and Hunter\'s pattern guess is not', !/guess@leedsdental2/.test(await page.innerText('body')));

  /* Import 2 and 4: the person comes with 2; 4 comes without its dead address. */
  for (const n of [2, 4]) await page.getByRole('checkbox', { name: `Tick Leeds Dental ${n}`, exact: true }).check();
  await page.locator('[data-field="prospects.listName"]').fill('AI test list');
  await page.getByRole('checkbox', { name: /Clause 3 of the acceptable use policy/ }).check();
  await page.getByRole('button', { name: /Add 2 to a new list/ }).click();
  await page.waitForTimeout(600);
  const cs = await stored(page, 'crm_contacts');
  const two = (cs ?? []).find(c => c.name === 'Leeds Dental 2');
  const four = (cs ?? []).find(c => c.name === 'Leeds Dental 4');
  ok('the import carries the named person and the check of their address',
    two?.email === 'sarah.chen@leedsdental2.example' && two.firstName === 'Sarah' && two.jobTitle === 'Practice Manager' && two.customFields?.emailStatus === 'domain_ok', JSON.stringify(two));
  /* Leeds Dental 4 was already in Contacts with that address: it is kept (it is
     theirs to change) and marked as bouncing, so a campaign can leave it out. */
  ok('…and marks a known contact\'s address the mail server said would bounce', four?.customFields?.emailStatus === 'invalid' && four.customFields.emailCheck === 'mailbox', JSON.stringify(four));

  /* Export. */
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export', exact: true }).click()]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  ok('Export writes a CSV with the check and the score', /^﻿?Business,Category,Address,Phone,Website,Email,Email check/.test(csv) && /hello@leedsdental1\.example,Verified/.test(csv), csv.slice(0, 300));

  /* The checker for a pasted list — the cached verdict is reused, nothing respent. */
  await page.getByRole('button', { name: /Check email addresses/ }).click();
  await page.getByLabel('Email addresses to check').fill('Hello@LeedsDental1.example, nobody@dead.example\nnot-an-address');
  await page.getByRole('button', { name: /Check \(free\)/ }).click();
  await page.getByText(/Checked 2/).waitFor({ timeout: 15_000 });
  const tool = page.getByRole('table', { name: 'Checked addresses' });
  ok('the checker finds the addresses in pasted text, and reuses a mailbox verdict', /hello@leedsdental1\.example\s*Verified/.test(await tool.innerText()) && hunterCalls.verify === spent, await tool.innerText());
  ok('…and says a domain that does not exist would bounce', /nobody@dead\.example\s*Invalid\s*This domain does not exist/.test(await tool.innerText()), await tool.innerText());
  ok('@1280: no sideways scroll on AI Prospecting', (await overflow(page)) <= 0, String(await overflow(page)));
  await page.screenshot({ path: 'test-results/ai-prospecting-light.png' });

  /* The dashboard's box hands the sentence over. */
  await page.goto(`${B}/`, { waitUntil: 'networkidle' });
  const panel = page.getByTestId('prospecting-panel');
  ok('the dashboard has an AI Prospecting section', await panel.isVisible() && /mailboxes verified/.test(await panel.innerText()), await panel.innerText().catch(() => ''));
  await panel.getByLabel('Who do you want to sell to?').fill('dentists in Leeds');
  await panel.getByRole('button', { name: 'Start prospecting' }).click();
  await page.waitForURL(/\/prospecting$/);
  await page.locator('.aip-bubble', { hasText: 'dentists in Leeds' }).waitFor({ timeout: 15_000 }).catch(() => {});
  ok('…and its box runs the search on AI Prospecting', await page.locator('.aip-bubble', { hasText: 'dentists in Leeds' }).count() === 1);

  /* Dark: drawn, not inverted. */
  await page.evaluate(() => localStorage.setItem('crm_theme', 'dark'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.aip-main').waitFor();
  await page.getByLabel('Who to look for').fill('dentists in Leeds');
  await page.keyboard.press('Enter');
  await page.getByText(/Checked \d+ address/).waitFor({ timeout: 60_000 }).catch(() => {});
  const dark = await page.evaluate(() => ({
    bg: getComputedStyle(document.querySelector('.aip-main')).backgroundColor,
    flt: getComputedStyle(document.querySelector('.aip')).filter,
  }));
  ok('dark mode: the page draws its own dark palette and is not inverted', dark.bg === 'rgb(15, 17, 21)' && /invert/.test(dark.flt), JSON.stringify(dark));
  await page.locator('.aip-bubble', { hasText: 'dentists in Leeds' }).waitFor({ timeout: 15_000 }).catch(() => {});
  await page.screenshot({ path: 'test-results/ai-prospecting-dark.png' });
  await page.goto(`${B}/`, { waitUntil: 'networkidle' });
  await page.getByTestId('prospecting-panel').scrollIntoViewIfNeeded();
  await page.getByTestId('prospecting-panel').screenshot({ path: 'test-results/ai-prospecting-dashboard-dark.png' });
  await page.evaluate(() => localStorage.setItem('crm_theme', 'light'));
  await ctx.close();

  const m = await signIn(390);
  await m.page.goto(`${B}/prospecting`, { waitUntil: 'networkidle' });
  ok('@390: the empty page fits', (await overflow(m.page)) <= 0, String(await overflow(m.page)));
  await m.page.screenshot({ path: 'test-results/ai-prospecting-390.png', fullPage: true });
  await m.page.goto(`${B}/`, { waitUntil: 'networkidle' });
  ok('@390: the dashboard section fits', (await overflow(m.page)) <= 0 && await m.page.getByTestId('prospecting-panel').isVisible(), String(await overflow(m.page)));
  await m.ctx.close();
}

/* ── Sources by name, a new search, every address, the register, and "Add to…" ── */
console.log('\nAI Prospecting — sources, bulk emails, Add to…');
{
  const CT = (await api('auth.php', { action: 'login', email: CE, password: CPW })).token;
  /* A switched-on workflow, a paused one, and a draft campaign, as the app would have saved them. */
  const now = new Date().toISOString();
  const autos = [
    { id: 'auto-intro', name: 'Dentist intro', status: 'active', createdAt: now, enrolledCount: 0, completedCount: 0,
      nodes: [{ id: 't', type: 'trigger', label: 'Start', config: { event: 'form_submitted' }, nextId: 'w' }, { id: 'w', type: 'wait', label: 'Wait', config: { days: '1' }, nextId: '' }] },
    { id: 'auto-paused', name: 'Old nurture', status: 'paused', createdAt: now, enrolledCount: 0, completedCount: 0,
      nodes: [{ id: 't', type: 'trigger', label: 'Start', config: { event: 'form_submitted' }, nextId: 'w' }, { id: 'w', type: 'wait', label: 'Wait', config: { days: '1' }, nextId: '' }] },
  ];
  const camps = [{ id: 'camp-draft', name: 'Leeds dentists intro', type: 'email', status: 'draft', sent: 0, opened: 0, clicked: 0, replied: 0, createdAt: now }];
  const seeded = await api('data.php', { action: 'bulk_set', token: CT, accountId: ACCT, items: { crm_automations: JSON.stringify(autos), crm_campaigns: JSON.stringify(camps) } });
  ok('(seeded a workflow and a draft campaign)', seeded.success !== false, JSON.stringify(seeded));
  const ch = await api('companies-house.php', { token: T, action: 'save', apiKey: CHKEY });
  ok('the owner connects the company register; it is proved with Basic auth', ch.success && ch.tested?.ok === true, JSON.stringify(ch));

  const { ctx, page } = await signIn(1280);
  await page.goto(`${B}/prospecting`, { waitUntil: 'networkidle' });
  const where = page.getByRole('group', { name: 'Where to search' });
  const names = (await where.getByRole('button').allInnerTexts()).map(x => x.trim());
  ok('three sources, named for what they are — none called "free"',
    names.join('|') === 'Business directories|Verified business directories|Google Maps' && !/free/i.test(names.join(' ')), names.join('|'));

  /* Business directories: everything read, every address shown. */
  await page.getByLabel('Who to look for').fill('dentists in Leeds');
  await page.keyboard.press('Enter');
  await page.getByText(/Checked \d+ address/).waitFor({ timeout: 60_000 });
  ok('"Start a new search" is on the bar once there is a search', await page.getByRole('button', { name: 'Start a new search' }).first().isVisible());
  const all = page.getByRole('button', { name: /^Find all emails \(\d+ websites\)/ });
  ok('"Find all emails" offers every website not read yet', await all.isEnabled(), await page.locator('.aip-bulk').innerText().catch(() => ''));
  await all.click();
  await page.getByText(/Read \d+ more websites for the addresses they publish/).waitFor({ timeout: 120_000 });
  ok('…reads them all and says so, then every website is read', await page.getByRole('button', { name: 'All websites read' }).isDisabled());
  ok('…and shows every address, each with its own check', (await page.getByRole('button', { name: /Best address only/ }).count()) === 1
    && /Every email address/i.test(await page.locator('table[aria-label="Businesses found"] thead').innerText()));
  ok('the copy button counts the addresses it would copy, leaving out the one that bounces', /Copy 19 addresses/.test(await page.locator('.aip-bulk').innerText()), await page.locator('.aip-bulk').innerText());
  ok('rows already in Contacts say so', await page.getByRole('row').filter({ has: page.getByRole('checkbox', { name: 'Tick Leeds Dental 1', exact: true }) }).locator('.aip-tag[data-t="known"]').count() === 1);
  ok('a verified address is tagged "Verified email"', /Verified email/.test(await page.getByRole('row').filter({ has: page.getByRole('checkbox', { name: 'Tick Leeds Dental 1', exact: true }) }).innerText()));

  /* Add to a workflow. */
  for (const n of [10, 13]) await page.getByRole('checkbox', { name: `Tick Leeds Dental ${n}`, exact: true }).check();
  const bar = page.getByRole('toolbar', { name: 'With the ticked businesses' });
  ok('ticking shows what can be done with them', /2 ticked/.test(await bar.innerText()) && /Add to a workflow/.test(await bar.innerText()) && /Add to an AI project/.test(await bar.innerText()) && /Add to an email campaign/.test(await bar.innerText()));
  await bar.getByRole('button', { name: /Add to a workflow/ }).click();
  const wf = page.getByRole('region', { name: 'Add to a workflow' });
  ok('a paused workflow is offered but cannot be chosen, and says why', await wf.getByRole('radio', { name: /Old nurture/ }).isDisabled() && /switch it on in Marketing/.test(await wf.innerText()));
  await wf.getByRole('radio', { name: /Dentist intro/ }).check();
  await wf.getByRole('checkbox', { name: /Clause 3 of the acceptable use policy/ }).check();
  await wf.getByRole('button', { name: /Add 2 to “Dentist intro”/ }).click();
  await page.getByText(/2 started “Dentist intro”/).waitFor({ timeout: 15_000 }).catch(() => {});
  ok('…they start the workflow, said plainly', /2 started “Dentist intro”/.test(await page.innerText('body')), (await page.innerText('body')).slice(0, 600));
  const runs = sql("SELECT contact_name, trigger_kind FROM crm_automation_runs WHERE automation_id = 'auto-intro'");
  ok('…two runs on the server, started by hand', runs.length === 2 && runs.every(r => r.trigger_kind === 'manual') && runs.some(r => r.contact_name === 'Leeds Dental 10'), JSON.stringify(runs));
  const forged = await api('engagement.php', { token: CT, accountId: ACCT, action: 'enrol_contacts', automationId: 'auto-paused', contacts: [{ id: 'x' }] });
  ok('the server refuses a workflow that is not on', forged.success === false && /not switched on/.test(forged.error), JSON.stringify(forged));

  /* Add to a draft campaign. */
  await page.getByRole('checkbox', { name: 'Tick Leeds Dental 16', exact: true }).check();
  await bar.getByRole('button', { name: /Add to an email campaign/ }).click();
  const cp = page.getByRole('region', { name: 'Add to an email campaign' });
  await cp.getByRole('radio', { name: /Leeds dentists intro/ }).check();
  await cp.getByRole('checkbox', { name: /Clause 3 of the acceptable use policy/ }).check();
  await cp.getByRole('button', { name: /Add 1 to “Leeds dentists intro”/ }).click();
  await page.waitForTimeout(600);
  const c2 = (await stored(page, 'crm_campaigns') ?? []).find(c => c.id === 'camp-draft');
  const l2 = (await stored(page, 'crm_contact_lists') ?? []).find(l => l.id === c2?.audienceListId);
  ok('a draft campaign is pointed at the list they are now on', c2?.audience === 'list' && !!l2 && l2.memberIds.length >= 1, JSON.stringify({ c2, l2 }));

  /* Add to the AI project built earlier from a list. */
  await page.getByRole('checkbox', { name: 'Tick Leeds Dental 19', exact: true }).check();
  await bar.getByRole('button', { name: /Add to an AI project/ }).click();
  const pj = page.getByRole('region', { name: 'Add to an AI project' });
  await pj.getByRole('radio').first().waitFor({ timeout: 15_000 });
  await pj.getByRole('radio').first().check();
  ok('the project with a list says it adds to that list', /Adds them to its list “Dentists — Leeds test”/.test(await pj.innerText()), await pj.innerText());
  await pj.getByRole('checkbox', { name: /Clause 3 of the acceptable use policy/ }).check();
  await pj.getByRole('button', { name: /^Add 1 to/ }).click();
  await page.getByText(/Autopilot proposes them in batches of 20/).waitFor({ timeout: 15_000 }).catch(() => {});
  const lp = (await stored(page, 'crm_contact_lists') ?? []).find(l => l.id === listId);
  ok('…and the project\'s own list grows by one', lp?.memberIds.length === 8, JSON.stringify(lp?.memberIds.length));

  /* Start a new search clears it all. */
  await page.getByRole('button', { name: 'Start a new search' }).first().click();
  ok('"Start a new search" empties the page and the boxes', /Who do you want to sell to\?/.test(await page.innerText('body'))
    && await page.locator('[data-field="prospects.trade"]').inputValue() === '' && await page.locator('table[aria-label="Businesses found"]').count() === 0);

  /* Verified business directories. */
  await where.getByRole('button', { name: 'Verified business directories' }).click();
  await page.getByLabel('Who to look for').fill('unicorn groomers in Leeds');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  const dead = await page.evaluate(() => (window.__deadEnds ?? []).length);
  ok('a trade the register has no type for is refused on the trade box, not a dead end', dead === 0 && /has no type for "unicorn groomers"/.test(await page.innerText('body')), String(dead));
  await page.getByLabel('Who to look for').fill('accountants in Leeds');
  await page.keyboard.press('Enter');
  await page.getByText('Park Row Accountants LTD', { exact: true }).waitFor({ timeout: 20_000 });
  const body = await page.innerText('body');
  ok('the register answers with active companies, their directors, and why there are no emails',
    /Searched the company register \(Companies House\) for accountants in Leeds/.test(body) && /Priya Shah \(Director\)/.test(body) && !/Gone Old/.test(body)
    && /The register lists no websites or email addresses/.test(body) && /Registered company/.test(body), body.slice(0, 1500));
  ok('…asked for active companies by trade code, with attribution', chCalls.length === 1 && /Open Government Licence/.test(body));
  await page.getByRole('checkbox', { name: 'Tick Park Row Accountants LTD', exact: true }).check();
  await page.locator('[data-field="prospects.listName"]').fill('Leeds accountants');
  await page.getByRole('checkbox', { name: /Clause 3 of the acceptable use policy/ }).check();
  await page.getByRole('button', { name: /Add 1 to a new list/ }).click();
  await page.waitForTimeout(600);
  const acc = (await stored(page, 'crm_contacts') ?? []).find(c => c.name === 'Park Row Accountants LTD');
  ok('a register import names the director, the company number and the source',
    acc?.firstName === 'Priya' && acc.lastName === 'Shah' && acc.jobTitle === 'Director' && acc.customFields?.companyNumber === '01234567'
    && acc.tags.includes('company register') && /^Company register \(Companies House\)/.test(acc.source), JSON.stringify(acc));
  ok('@1280: no sideways scroll', (await overflow(page)) <= 0, String(await overflow(page)));
  await page.screenshot({ path: 'test-results/ai-prospecting-register.png' });
  await ctx.close();

  const m = await signIn(390);
  await m.page.goto(`${B}/prospecting`, { waitUntil: 'networkidle' });
  await m.page.getByLabel('Who to look for').fill('dentists in Leeds');
  await m.page.keyboard.press('Enter');
  await m.page.getByText(/Checked \d+ address/).waitFor({ timeout: 60_000 });
  await m.page.getByRole('checkbox', { name: 'Tick Leeds Dental 1', exact: true }).check();
  ok('@390: the ticked-actions bar is on screen and nothing scrolls sideways',
    await m.page.getByRole('toolbar', { name: 'With the ticked businesses' }).isVisible() && (await overflow(m.page)) <= 0, String(await overflow(m.page)));
  await m.page.screenshot({ path: 'test-results/ai-prospecting-390-actions.png' });
  await m.ctx.close();
}

ok('no page errors', !errs.length, errs.join(' | '));
await br.close();
console.log(`\n${pass} passed, ${fail} failed`);
stop();
process.exit(fail ? 1 : 0);
