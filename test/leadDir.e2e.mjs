/**
 * The owner's lead library, end to end (routes/leaddir.ts, lib/leadDir.ts,
 * services/leadImport.ts, Settings → Platform services → the library card,
 * Workspace → Lead library), what it gives a project's daily prospecting
 * (prospectFinderTick.ts `libraryStep`), and Customers → Lead lists.
 *
 *   VITE_BASE=/ npm run build
 *   npm run test:leaddir         (self-contained: Geoapify + DNS mock on :8978,
 *                                 wrangler on :8938, fresh D1 in .wrangler-leaddir)
 *
 * Everybody in the files is made up here and lives on `.example`.
 *  - the owner drops a ZIP of two CSVs on the card; it is read in the
 *    browser and loaded, duplicates once;
 *  - a load cut off part-way carries on from the row after the last one sent;
 *  - customers cannot load, cannot change settings, and never search it or
 *    see a person in it — opened or not (403 `not_owner`); a customer's
 *    status says only whether it is open; the old address sends them to
 *    their own Lead lists;
 *  - opening it needs the owner's statement that they may share it;
 *  - the owner searches it, in full, on the Lead library screen and adds
 *    people to their own Contacts as "Licensed business data";
 *  - opened, it feeds a project's daily finder: a few a step, half the day at
 *    most, each address checked, never somebody suppressed or already in
 *    Contacts, never the same person twice, labelled "Licensed business data"
 *    with the date on every contact — and the owner's removal says which
 *    workspaces were given that person;
 *  - closed, the finder takes nobody from it;
 *  - a person removed on request stays out when the same file is loaded again;
 *  - a load can be undone;
 *  - the customer's Lead lists show the project's folder, its list and its
 *    leads with their source, search them and export them, at 1280px and
 *    390px, with no page errors, no sideways scroll and no "directory".
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { deflateRawSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const PORT = Number(process.env.PORT ?? 8938), INSPECT = Number(process.env.INSPECT_PORT ?? 9338), MOCK = Number(process.env.MOCK_PORT ?? 8978);
const B = `http://localhost:${PORT}`;
const G = `http://127.0.0.1:${MOCK}`;
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c ? '' : ` — ${String(d).slice(0, 600)}`}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (!fs.existsSync('dist/index.html')) { console.log('Build first: VITE_BASE=/ npm run build'); process.exit(2); }

/* ── Made-up people: 1,200 in Florida and Texas, a few hundred duplicated across the two files ── */
const HEADER = 'name,title,managementlevel,industry,city,state,country,linkedin,email,phone,cphone,website,company,companysize,description';
const person = i => [
  `Pat Example${i}`, i % 6 === 0 ? 'Chief Executive Officer' : i % 6 === 1 ? 'Owner' : 'Sales Agent', i % 6 < 2 ? 'Owner' : 'Entry',
  i % 10 === 9 ? 'Commercial real estate' : 'Real estate', i % 3 ? 'Tampa' : 'Austin', i % 3 ? 'Florida' : 'TX', 'United States',
  `http://www.linkedin.com/in/pat-example-${i}`, i % 5 === 4 ? '' : `pat${i}@realty${i % 40}.example`, '', `(813) 555-${String(1000 + i).slice(-4)}`,
  `http://www.realty${i % 40}.example`, `Realty ${i % 40}, "Group"`, 'Small Team', 'Long, "quoted" text\nwith a line break',
];
const q = v => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csv = rows => '﻿' + [HEADER, ...rows.map(r => r.map(q).join(','))].join('\r\n') + '\r\n';
const A = Array.from({ length: 800 }, (_, i) => person(i));
const Bp = Array.from({ length: 600 }, (_, i) => person(i + 600)); // 600–799 repeat
function zip(files) {
  const parts = [], cds = []; let off = 0;
  for (const f of files) {
    const data = Buffer.from(f.data), comp = deflateRawSync(data), name = Buffer.from(f.name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    parts.push(lh, name, comp);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(off, 42);
    cds.push(cd, name); off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(cds);
  const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}
const ZIP = zip([{ name: 'leads/florida-texas-1.csv', data: csv(A) }, { name: 'leads/florida-texas-2.csv', data: csv(Bp) }]);
const UNIQUE = 1400 - 200;

/* ── The mock: Geoapify finding nothing (so the finder's live search is a
   quiet no), and DNS saying every realty*.example takes mail ── */
const GEOKEY = 'd4'.repeat(16);
const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const mock = http.createServer((req, res) => {
  const u = new URL(req.url, G);
  if (u.pathname === '/dns-query') {
    const name = u.searchParams.get('name') ?? '';
    if (/^realty\d+\.example$/.test(name) && u.searchParams.get('type') === 'MX') return send(res, 200, { Status: 0, Answer: [{ type: 15, data: `10 mx.${name}.` }] });
    return send(res, 200, { Status: 0, Answer: [] });
  }
  if (u.searchParams.get('apiKey') !== GEOKEY) return send(res, 401, { message: 'Invalid apiKey' });
  if (u.pathname === '/v1/geocode/search') return send(res, 200, { results: [{ place_id: 'p-any', lon: -82.46, lat: 27.95, result_type: 'city' }] });
  if (u.pathname === '/v2/places') return send(res, 200, { features: [] });
  send(res, 404, { message: 'no such path in the mock' });
});
await new Promise(r => mock.listen(MOCK, '127.0.0.1', r));

/* ── A fresh database and the real Worker ── */
const persist = path.resolve('.wrangler-leaddir');
fs.rmSync(persist, { recursive: true, force: true });
const { execSync } = await import('node:child_process');
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
const sql = q => JSON.parse(execSync(`npx wrangler d1 execute crmpro --local --persist-to ${persist} --json --command ${JSON.stringify(q)}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
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
const api = (p, body) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.9.8.${ipN++ % 250}` }, body: JSON.stringify(body) }).then(r => r.json().catch(() => ({ status: r.status })));
const dir = (token, action, extra = {}) => api('leaddir.php', { token, action, ...extra });

console.log('\nLead library');
const OWNER = 'owner@leaddir.test', OPW = 'Tq9!vX2#pLm7wZ-ld';
await api('auth.php', { action: 'bootstrap', email: OWNER, password: OPW, name: 'Owner' });
const OL = await api('auth.php', { action: 'login', email: OWNER, password: OPW });
const T = OL.token, OACCT = OL.workspaces?.[0]?.accountId ?? OL.user?.accountId ?? 'acct-ld-owner-1';
await api('geoapify.php', { token: T, action: 'save', apiKey: GEOKEY });
const CE = 'dana@leaddir.test', CPW = 'Another-horse-7-ferns';
const ACCT = (await api('auth.php', { action: 'register', email: CE, password: CPW, name: 'Dana', businessName: 'Bright Supplies' })).user?.accountId;
const CT = (await api('auth.php', { action: 'login', email: CE, password: CPW })).token;
const XE = 'mallory@leaddir.test', XPW = 'Third-horse-8-quill';
const XACCT = (await api('auth.php', { action: 'register', email: XE, password: XPW, name: 'Mallory', businessName: 'Other Co' })).user?.accountId;
const XT = (await api('auth.php', { action: 'login', email: XE, password: XPW })).token;
ok('(an owner and two customers)', !!T && !!CT && !!XT && !!ACCT && !!XACCT);

/* ── Before anything is loaded ── */
const a0 = await dir(T, 'admin');
ok('the owner sees an empty directory', a0.success && a0.total === 0, JSON.stringify(a0));
ok('a customer cannot read the owner\'s side', (await dir(CT, 'admin')).code === 'not_owner');
ok('a customer cannot load rows', (await dir(CT, 'import_start', { fileKey: 'x' })).code === 'not_owner');
ok('a customer cannot open the directory', (await dir(CT, 'settings', { shared: true, attest: true })).code === 'not_owner');
ok('a customer cannot search it', (await dir(CT, 'search', { accountId: ACCT, industry: 'real estate' })).code === 'not_owner');

/* ── The owner loads the ZIP through the card, in a real browser ── */
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
{
  const { page, done } = await signIn(OWNER, OPW, 1280);
  await page.goto(`${B}/settings?tab=platform`, { waitUntil: 'networkidle' });
  const card = page.getByTestId('lead-directory-admin');
  await card.waitFor({ timeout: 15_000 });
  ok('Platform services lists the directory', (await page.locator('[data-service="lead_directory"]').count()) === 1);
  await card.locator('[data-field="leaddir.label"]').fill('Test file — Florida and Texas');
  await card.locator('[data-field="leaddir.file"]').setInputFiles({ name: 'florida-texas.zip', mimeType: 'application/zip', buffer: ZIP });
  /* The owner sees what was detected before anything loads. */
  await card.getByTestId('lead-preview-go').waitFor({ timeout: 15000 });
  ok('the preview names the columns it matched', /matched a field/.test(await card.getByTestId('lead-preview').innerText()));
  await card.getByTestId('lead-preview-go').click();
  await card.getByText(/^Finished/).waitFor({ timeout: 90_000 }).catch(() => {});
  const text = await card.innerText();
  ok('the card says the load finished', /Finished/.test(text), text.slice(0, 800));
  ok(`…with ${UNIQUE.toLocaleString('en-US')} people in the directory (the 200 in both files once)`, text.includes(UNIQUE.toLocaleString('en-US')), text.slice(0, 600));
  ok('…and lists the load with its label', /Test file — Florida and Texas/.test(text) && /done/.test(text));
  await page.screenshot({ path: 'test-results/leaddir-admin.png', fullPage: true });
  await done();
}
const a1 = await dir(T, 'admin');
ok('the server agrees on the count', a1.total === UNIQUE, a1.total);
ok('industries and states are counted', a1.industries.some(f => f.label === 'Real estate') && a1.states.some(f => f.label === 'Texas'), JSON.stringify(a1.states));
const firstLoad = a1.imports[0];
ok('the load counted every row it read', firstLoad.rows_seen === 1400 && firstLoad.rows_added === UNIQUE && firstLoad.rows_dup === 200, JSON.stringify(firstLoad));

/* ── A load cut off part-way resumes after the last row sent ── */
{
  const rows = Array.from({ length: 30 }, (_, i) => ({ name: `Resume Person${i}`, email: `resume${i}@carry.example`, industry: 'Insurance', state: 'Ohio', country: 'United States' }));
  const s1 = await dir(T, 'import_start', { fileKey: 'resume.csv|123|1', name: 'resume.csv', size: 123 });
  await dir(T, 'import_rows', { importId: s1.import.id, rows: rows.slice(0, 12), bytesDone: 40 });
  const s2 = await dir(T, 'import_start', { fileKey: 'resume.csv|123|1', name: 'resume.csv', size: 123 });
  ok('starting the same file again resumes it, at the row after the last one sent', s2.resumed === true && s2.import.id === s1.import.id && s2.import.rows_seen === 12, JSON.stringify(s2));
  await dir(T, 'import_rows', { importId: s1.import.id, rows: rows.slice(12), bytesDone: 123 });
  await dir(T, 'import_finish', { importId: s1.import.id, bytesDone: 123 });
  ok('…and finishes with everybody once', (await dir(T, 'admin')).total === UNIQUE + 30);
  const big = await dir(T, 'import_rows', { importId: s1.import.id, rows: Array.from({ length: 501 }, () => rows[0]) });
  ok('more than 500 rows in one request is refused', big.success === false);
}

/* ── Opening it ── */
const noAttest = await dir(T, 'settings', { shared: true });
ok('opening it needs the owner\'s statement, asked on its box', noAttest.success === false && noAttest.field === 'leaddir.attest', JSON.stringify(noAttest));
const opened = await dir(T, 'settings', { shared: true, attest: true });
ok('…and with it, it is open', opened.success && opened.shared === true && !!opened.attestedAt, JSON.stringify(opened));

/* ── Opened or not, a customer never searches it ── */
const st = await dir(CT, 'status', { accountId: ACCT });
ok('a customer\'s status says only that it is open — not its size, not what is in it', st.success && st.shared === true && st.total === undefined && st.industries === undefined && st.label === undefined, JSON.stringify(st).slice(0, 300));
ok('another workspace\'s id is refused', (await dir(CT, 'status', { accountId: XACCT })).success === false);
for (const action of ['facets', 'search', 'reveal']) {
  const r = await dir(CT, action, { accountId: ACCT, industry: 'real estate', place: 'Florida', ids: [1, 2, 3] });
  ok(`a customer's "${action}" is refused: not_owner`, r.success !== true && r.code === 'not_owner' && !r.people && !r.industries, JSON.stringify(r).slice(0, 200));
}

/* ── The owner searches it, in full ── */
ok('a search with no industry or place is refused on its box', (await dir(T, 'search', { accountId: OACCT, title: 'CEO' })).field === 'leaddir.industry');
const fl = await dir(T, 'search', { accountId: OACCT, industry: 'real estate', place: 'Florida' });
const flCount = Array.from({ length: 1200 }, (_, i) => i).filter(i => i % 3).length;
ok(`"real estate" in Florida finds the ${flCount} there (commercial included)`, fl.success && fl.total === flCount, JSON.stringify({ total: fl.total, err: fl.error }));
ok('…50 to a page, with the next page offered', fl.people.length === 50 && fl.more === true);
ok('…shown in full to the owner', fl.people.every(p => !/•/.test(p.email) && !/•/.test(p.phone) && p.revealed === true), JSON.stringify(fl.people[0]));
const fl2 = await dir(T, 'search', { accountId: OACCT, industry: 'real estate', place: 'Florida', after: fl.after });
ok('the next page follows on with nobody repeated', fl2.people.length === 50 && !fl2.people.some(p => fl.people.some(x => x.id === p.id)));
const tx = await dir(T, 'search', { accountId: OACCT, industry: 'real estate', place: 'Austin, TX' });
ok('"Austin, TX" is a town in a state written as its code', tx.total === 400, tx.total);
const ceo = await dir(T, 'search', { accountId: OACCT, industry: 'real estate', place: 'Texas', title: 'CEO' });
ok('"CEO" finds Chief Executive Officers', ceo.total === 200 && ceo.people.every(p => /Chief Executive/.test(p.title)), JSON.stringify(ceo.people?.[0]));
const em = await dir(T, 'search', { accountId: OACCT, industry: 'real estate', place: 'Florida', hasEmail: true });
ok('"only with an email" leaves out those without', em.total > 0 && em.total < flCount && em.people.every(p => p.email));
const none = await dir(T, 'search', { accountId: OACCT, industry: 'dentists' });
ok('an industry nobody is filed under says so', none.success && none.total === 0 && /industry like/.test(none.note ?? ''), JSON.stringify(none));
const rv = await dir(T, 'reveal', { accountId: OACCT, ids: fl.people.slice(0, 3).map(p => p.id) });
ok('the owner\'s own data costs nothing to show', rv.success && rv.people.length === 3 && rv.spent === 0, JSON.stringify(rv).slice(0, 200));

/* ── What it gives a project's daily prospecting ── */
const pf = await api('projects.php', { token: CT, accountId: ACCT, action: 'save_portfolio', name: 'Bright Supplies', profile: { description: 'Office supplies for estate agents' } });
const pj = await api('projects.php', { token: CT, accountId: ACCT, action: 'save_project', name: 'Tampa realtors', objective: 'Sell office supplies to real estate agents in Tampa', portfolioId: pf.id, kind: 'leadgen' });
const PID = pj.id;
const LIST = 'list-leaddir-tampa';
const now = new Date().toISOString();
/* Somebody already in Contacts, and somebody who asked not to be written to. */
await api('data.php', { action: 'bulk_set', token: CT, accountId: ACCT, items: {
  crm_contacts: JSON.stringify([{ id: 'c-known', name: 'Pat Example5', email: 'pat5@realty5.example', phone: '', status: 'customer', tags: [], source: 'manual', createdAt: now, lastActivity: now, value: 0 }]),
  crm_contact_lists: JSON.stringify([{ id: LIST, name: 'Tampa realtors — prospects', type: 'static', rules: [], match: 'all', memberIds: [], color: '', createdAt: now, createdBy: 'Dana', kind: 'cold', origin: 'prospecting' }]),
  crm_suppression_list: JSON.stringify([{ email: 'pat2@realty2.example' }]),
} });
const saved = await api('finders.php', { token: CT, accountId: ACCT, action: 'save', projectId: PID, trades: ['real estate agents'], places: ['Tampa, Florida'], perDay: 10, listId: LIST, listName: 'Tampa realtors — prospects' });
const FID = saved.finderId;
ok('(a project with a daily finder for real estate agents in Tampa)', !!PID && !!FID, JSON.stringify(saved).slice(0, 200));
const step = () => api('finders.php', { token: CT, accountId: ACCT, action: 'run_step', projectId: PID, finderId: FID });
const s1 = await step();
const pp = () => sql(`SELECT ref, status, source, reject_reason, email FROM crm_project_prospects WHERE project_id = '${PID}' ORDER BY ref`);
const rows1 = pp();
ok('a step takes five from the library — half of the day of ten, at most five a step', s1.success && s1.added === 5 && rows1.filter(r => r.status === 'added' && r.source === 'library').length === 5, JSON.stringify({ s1, rows1 }).slice(0, 600));
ok('…turning away the suppressed address, and the person already in Contacts', rows1.some(r => r.email === 'pat2@realty2.example' && r.status === 'rejected' && r.reject_reason === 'suppressed')
  && rows1.some(r => r.email === 'pat5@realty5.example' && r.status === 'known'), JSON.stringify(rows1));
ok('…each recorded as ld:<id> for this project', rows1.every(r => /^ld:\d+$/.test(r.ref)));
const contactsOf = async () => JSON.parse((await api('data.php', { action: 'get', token: CT, accountId: ACCT, key: 'crm_contacts' })).value || '[]');
let dana = await contactsOf();
const given = dana.filter(c => String(c.id).startsWith('pf-'));
const today = new Date().toISOString().slice(0, 10);
ok('they join Contacts named "Licensed business data", with the date — never "found on the web"', given.length === 5 && given.every(c =>
  c.source === 'AI Autopilot · licensed business data' && c.customFields?.dataSource === 'Licensed business data'
  && c.customFields?.provenance?.startsWith('Licensed business data') && c.customFields.provenance.includes(today)
  && c.tags.includes('licensed business data') && !c.tags.includes('prospect search') && !/web|website|directory/i.test(c.customFields.provenance)), JSON.stringify(given[0]).slice(0, 600));
ok('…each address checked first, with who and where they are', given.every(c => c.customFields?.emailStatus === 'domain_ok' && c.firstName === 'Pat' && c.jobTitle && /Tampa, Florida/.test(c.customFields?.foundBy ?? '')), JSON.stringify(given[0]?.customFields));
ok('…nobody suppressed, nobody twice', !given.some(c => c.email === 'pat2@realty2.example' || c.email === 'pat5@realty5.example') && new Set(given.map(c => c.email)).size === 5);
const lists1 = JSON.parse((await api('data.php', { action: 'get', token: CT, accountId: ACCT, key: 'crm_contact_lists' })).value || '[]');
ok('…and onto the project\'s list', lists1.find(l => l.id === LIST)?.memberIds?.length === 5);
ok('the finder\'s log says where they came from', sql(`SELECT detail FROM crm_finder_runs WHERE finder_id = '${FID}' AND kind = 'library'`).some(r => /^Licensed business data: 5 matched and checked/.test(r.detail)));
const s2 = await step();
ok('half of today is the library\'s limit: the next step takes nobody from it', s2.success && pp().filter(r => r.source === 'library').length === rows1.length, JSON.stringify(s2));
/* The next day. */
sql(`UPDATE crm_project_prospects SET found_at = '2020-01-01T00:00:00Z' WHERE project_id = '${PID}'`);
sql(`UPDATE crm_prospect_finders SET day = '2020-01-01', status = 'active' WHERE id = '${FID}'`);
const s3 = await step();
const rows3 = pp();
ok('the next day, five more — none of them anybody it was given before', s3.added === 5 && rows3.filter(r => r.status === 'added').length === 10 && new Set(rows3.map(r => r.ref)).size === rows3.length, JSON.stringify(s3));
dana = await contactsOf();
ok('…ten different people in Contacts', new Set(dana.filter(c => String(c.id).startsWith('pf-')).map(c => c.email)).size === 10);
/* Closed: nothing more. */
await dir(T, 'settings', { shared: false });
sql(`UPDATE crm_project_prospects SET found_at = '2020-01-01T00:00:00Z' WHERE project_id = '${PID}'`);
sql(`UPDATE crm_prospect_finders SET day = '2020-01-02', status = 'active' WHERE id = '${FID}'`);
const s4 = await step();
ok('closed again, the finder takes nobody from it', s4.success && pp().length === rows3.length, JSON.stringify(s4));
await dir(T, 'settings', { shared: true });
ok('the other customer\'s projects were given nobody', sql(`SELECT COUNT(*) AS n FROM crm_project_prospects WHERE account_id = '${XACCT}'`)[0].n === 0);

/* ── Removed on request, and kept out ── */
const told = await dir(T, 'remove', { email: 'pat1@realty1.example' });
ok('removing somebody a project was given names the workspace to tell', told.success && told.removed === 1 && told.passedTo?.includes(ACCT), JSON.stringify(told));
const gone = 'pat3@realty3.example';
const rm = await dir(T, 'remove', { email: gone });
ok('the owner removes a person', rm.success && rm.removed === 1 && rm.passedTo?.length === 0, JSON.stringify(rm));
const s3i = await dir(T, 'import_start', { fileKey: 'again|1|1', name: 'again.csv', size: 1 });
const re = await dir(T, 'import_rows', { importId: s3i.import.id, rows: [{ name: 'Pat Example3', email: gone, industry: 'Real estate' }, { name: 'New Person', email: 'new@fresh.example', industry: 'Real estate', state: 'Florida', country: 'USA' }] });
ok('a later load does not bring a removed person back', re.added === 1, JSON.stringify(re));
const rmBad = await dir(T, 'remove', {});
ok('remove with no address asks on its box', rmBad.field === 'leaddir.remove');

/* ── Undoing a load ── */
let u;
for (let k = 0; k < 10; k++) { u = await dir(T, 'import_undo', { importId: s3i.import.id }); if (u.done) break; }
const a2 = await dir(T, 'admin');
ok('undoing a load takes its people back out', u.done && a2.total === UNIQUE + 30 - 2, a2.total);
ok('…and the load says so', a2.imports.find(i => i.id === s3i.import.id)?.status === 'undone');

/* ── The owner loads a whole folder: sub-folders, a ZIP inside, a file that is not leads ── */
{
  const root = path.resolve('test-results/lead-folder');
  fs.rmSync(root, { recursive: true, force: true });
  const put = (rel, body) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); };
  const ohio = (from, n) => 'name,email,industry,state,country\n' + Array.from({ length: n }, (_, i) => `Dee Ohio ${from + i},dee${from + i}@dental${(from + i) % 7}.example,Dentistry,Ohio,United States`).join('\n') + '\n';
  put('Leads/2025/ohio-a.csv', ohio(0, 40));
  put('Leads/2026/q1/ohio-b.csv', ohio(40, 30));
  put('Leads/2026/archive.zip', zip([{ name: 'deep/ohio-c.csv', data: ohio(70, 25) }, { name: 'deep/again.csv', data: ohio(0, 5) }]));
  put('Leads/2026/notes.txt', 'just some notes\nnothing here\n');
  put('Leads/photo.jpg', 'not a picture');
  const before = (await dir(T, 'admin')).total;
  const { page, done } = await signIn(OWNER, OPW, 1280);
  await page.goto(`${B}/settings?tab=platform`, { waitUntil: 'networkidle' });
  const card = page.getByTestId('lead-directory-admin');
  await card.waitFor({ timeout: 15_000 });
  await card.locator('[data-field="leaddir.label"]').fill('Folder test');
  await card.locator('[data-field="leaddir.folder"]').setInputFiles(path.join(root, 'Leads'));
  await card.getByTestId('lead-preview-go').waitFor({ timeout: 15000 });
  const pv = await card.getByTestId('lead-preview').innerText();
  ok('a chosen folder lists its lead files, sub-folders included', /4 lead files/.test(pv), pv.slice(0, 300));
  ok('…and names what it left out', /Left out, not lead files: Leads\/photo\.jpg/.test(pv), pv.slice(0, 400));
  await card.getByTestId('lead-preview-go').click();
  await card.getByText(/^Finished/).waitFor({ timeout: 90_000 }).catch(() => {});
  let t = await card.innerText();
  ok('every file of the folder goes in, and the one with nobody in it is passed over by name', /3 files loaded/.test(t) && /1 passed over/.test(t) && /notes\.txt[\s\S]{0,40}passed over/.test(t), t.slice(0, 900));
  const after = (await dir(T, 'admin')).total;
  ok('…the people in all of them, the ZIP inside included, each once', after - before === 95, [before, after]);
  ok('…each file is its own load', ['Leads/2025/ohio-a.csv', 'Leads/2026/q1/ohio-b.csv', 'Leads/2026/archive.zip'].every(n => t.includes(n)), t.slice(0, 900));
  await page.screenshot({ path: 'test-results/leaddir-folder.png', fullPage: true });
  /* The same folder again: what is in already is not read twice. */
  await card.locator('[data-field="leaddir.folder"]').setInputFiles(path.join(root, 'Leads'));
  await card.getByTestId('lead-preview-go').waitFor({ timeout: 15000 });
  await card.getByTestId('lead-preview-go').click();
  await card.getByText(/^Finished/).waitFor({ timeout: 60_000 }).catch(() => {});
  t = await card.innerText();
  ok('choosing the folder again skips the files already in', /4 already in from before/.test(t) && (await dir(T, 'admin')).total === after, t.slice(0, 600));
  await done();
  /* Out again, so the rest of the run counts what it always did. */
  const loads = (await dir(T, 'admin')).imports.filter(i => i.label === 'Folder test' && i.rows_added > 0);
  for (const l of loads) for (let k = 0; k < 20; k++) { const u = await dir(T, 'import_undo', { importId: l.id }); if (u.done) break; }
}

/* ── The owner's Lead library screen ── */
{
  const { page, done } = await signIn(OWNER, OPW, 1280);
  await page.goto(`${B}/lead-directory`, { waitUntil: 'networkidle' });
  const root = page.getByTestId('lead-directory');
  await root.waitFor({ timeout: 15_000 });
  ok('the owner\'s screen is the Lead library', /Lead library/.test(await root.locator('h1').innerText()) && /Only you see this screen/.test(await root.innerText()));
  await root.locator('[data-field="leaddir.industry"]').fill('Real estate');
  await root.locator('[data-field="leaddir.place"]').fill('Florida');
  await root.locator('[data-field="leaddir.title"]').fill('owner');
  await root.getByRole('button', { name: /^Search$/ }).click();
  await root.getByTestId('ld-count').waitFor({ timeout: 15_000 });
  ok('the search shows people in full', (await root.locator('tbody tr').count()) > 0 && !/•/.test(await root.locator('tbody').innerText()));
  await root.getByRole('checkbox', { name: /^Tick / }).nth(0).check();
  await root.getByRole('checkbox', { name: /^Tick / }).nth(1).check();
  ok('ticking costs nothing to say', /^2 ticked$/m.test(await root.getByTestId('ld-actions').innerText()), await root.getByTestId('ld-actions').innerText());
  await root.getByRole('button', { name: /Add to Contacts/ }).click();
  await root.getByText(/new, \d+ already in Contacts/).waitFor({ timeout: 15_000 }).catch(() => {});
  ok('they are added to the owner\'s Contacts on a list', /on “owner · Real estate · Florida”/.test(await root.innerText()), (await root.innerText()).slice(0, 400));
  ok('@1280: nothing scrolls sideways', (await overflow(page)) <= 1, await overflow(page));
  await page.screenshot({ path: 'test-results/leadlibrary-1280.png', fullPage: true });
  const acct = await page.evaluate(() => localStorage.getItem('crm_active_account'));
  for (let k = 0; k < 30 && !JSON.parse((await api('data.php', { action: 'get', token: T, accountId: acct, key: 'crm_contacts' })).value || '[]').length; k++) await sleep(500);
  const mine = JSON.parse((await api('data.php', { action: 'get', token: T, accountId: acct, key: 'crm_contacts' })).value || '[]');
  ok('…named as licensed business data, with where they came from', mine.length >= 2 && mine.every(c => c.source === 'Licensed business data' && c.tags.includes('licensed business data') && c.customFields?.directoryId && c.customFields?.provenance), JSON.stringify(mine[0] ?? {}).slice(0, 400));
  await done();
}

/* ── A customer's Lead lists ── */
for (const width of [1280, 390]) {
  const { page, done } = await signIn(CE, CPW, width);
  await page.goto(`${B}/lead-directory?industry=real%20estate&place=Florida`, { waitUntil: 'networkidle' });
  await page.getByTestId('lead-lists').waitFor({ timeout: 15_000 }).catch(() => {});
  ok(`@${width}: the old Lead Directory address lands on the customer's own Lead lists`, /\/lead-lists$/.test(page.url()), page.url());
  const root = page.getByTestId('lead-lists');
  const folder = root.getByTestId('ll-folder').filter({ hasText: 'Tampa realtors' });
  await folder.waitFor({ timeout: 15_000 });
  ok(`@${width}: a folder for the project, counting its leads`, /\b10\b/.test(await folder.innerText()) && /AI Autopilot project/.test(await folder.innerText()), await folder.innerText());
  ok(`@${width}: no "directory" anywhere on the page`, !/directory/i.test(await root.innerText()), (await root.innerText()).slice(0, 300));
  ok(`@${width}: nothing scrolls sideways (folders)`, (await overflow(page)) <= 1, await overflow(page));
  await page.screenshot({ path: `test-results/leadlists-${width}.png`, fullPage: true });
  /* Searching the customer's own leads, from the top. */
  await root.getByTestId('ll-search').fill('pat8@');
  await root.getByTestId('ll-results').waitFor({ timeout: 5000 });
  ok(`@${width}: searching finds their own lead`, (await root.getByTestId('ll-row').count()) === 1 && /pat8@realty8\.example/.test(await root.getByTestId('ll-results').innerText()));
  await root.getByTestId('ll-search').fill('');
  await folder.click();
  await root.getByTestId('ll-folder-view').waitFor({ timeout: 5000 });
  const listCard = root.getByTestId('ll-list').filter({ hasText: 'Tampa realtors — prospects' });
  ok(`@${width}: the folder holds the project's list`, (await listCard.count()) === 1 && /10 leads/.test(await listCard.innerText()), await root.getByTestId('ll-folder-view').innerText());
  await listCard.click();
  await root.getByTestId('ll-list-view').waitFor({ timeout: 5000 });
  ok(`@${width}: the list shows its ten leads`, (await root.getByTestId('ll-row').count()) === 10);
  const sources = await root.getByTestId('ll-source').allInnerTexts();
  ok(`@${width}: each one says it is licensed business data`, sources.length === 10 && sources.every(t => t.trim() === 'Licensed business data'), sources.join(' | '));
  ok(`@${width}: with its email check`, (await root.getByTestId('ll-list-view').innerText()).includes('Domain takes mail'));
  ok(`@${width}: the list can be emailed`, (await root.getByTestId('ll-campaign').count()) === 1);
  ok(`@${width}: nothing scrolls sideways (a list)`, (await overflow(page)) <= 1, await overflow(page));
  await page.screenshot({ path: `test-results/leadlists-list-${width}.png`, fullPage: true });
  await root.getByTestId('ll-list-search').fill('Example7');
  ok(`@${width}: searching within the list`, (await root.getByTestId('ll-row').count()) === 1);
  await root.getByTestId('ll-list-search').fill('');
  const [dl] = await Promise.all([page.waitForEvent('download'), root.getByTestId('ll-export').click()]);
  const csvText = fs.readFileSync(await dl.path(), 'utf8');
  ok(`@${width}: the export says where every lead came from`, /Where it came from/.test(csvText.split('\r\n')[0]) && csvText.split('\r\n').filter(l => /Licensed business data/.test(l)).length === 10, csvText.slice(0, 300));
  await page.goBack();
  await root.getByTestId('ll-folder-view').waitFor({ timeout: 5000 }).catch(() => {});
  ok(`@${width}: Back goes up a level`, (await root.getByTestId('ll-folder-view').count()) === 1);
  await done();
}
ok('no page errors', errs.length === 0, errs.join(' | '));

await br.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
