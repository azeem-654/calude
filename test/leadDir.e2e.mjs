/**
 * The owner's lead directory, end to end (routes/leaddir.ts, lib/leadDir.ts,
 * services/leadImport.ts, Settings → Platform services → Lead directory,
 * Customers → Lead Directory).
 *
 *   VITE_BASE=/ npm run build
 *   npm run test:leaddir         (starts its own wrangler on :8938, fresh D1 in .wrangler-leaddir)
 *
 * Everybody in the files is made up here and lives on `.example`.
 *  - the owner drops a ZIP of two CSVs on the card; it is read in the
 *    browser and loaded, duplicates once;
 *  - a load cut off part-way carries on from the row after the last one sent;
 *  - customers cannot load, cannot change settings, and see nothing until the
 *    owner opens it — which needs the owner's statement that they may;
 *  - a search masks addresses; showing someone spends the allowance once,
 *    stops at the day's limit, and never for another workspace;
 *  - a person removed on request stays out when the same file is loaded again;
 *  - a load can be undone;
 *  - a customer finds people and adds them to Contacts on a cold list, at
 *    1280px and 390px, with no page errors and no sideways scroll.
 */
import fs from 'node:fs';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const PORT = Number(process.env.PORT ?? 8938), INSPECT = Number(process.env.INSPECT_PORT ?? 9338);
const B = `http://localhost:${PORT}`;
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

/* ── A fresh database and the real Worker ── */
const persist = path.resolve('.wrangler-leaddir');
fs.rmSync(persist, { recursive: true, force: true });
const { execSync } = await import('node:child_process');
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
const wr = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--inspector-port', String(INSPECT), '--persist-to', persist, '--var', `APP_ORIGIN:${B}`], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
let wlog = '';
wr.stdout.on('data', c => { wlog += c; }); wr.stderr.on('data', c => { wlog += c; });
let br = null;
const stop = () => { try { process.kill(-wr.pid, 'SIGTERM'); } catch { /* gone */ } };
process.on('exit', stop);
process.on('uncaughtException', async e => { console.log(e); console.log(wlog.replace(/.*workerd@.*\n/g, '').slice(-2500)); try { await br?.close(); } catch { /* */ } stop(); process.exit(1); });
for (let i = 0; i < 90; i++) { try { const r = await fetch(`${B}/api/data.php`, { method: 'POST', headers: { Connection: 'close' }, body: '{"action":"ping"}' }); if (r.ok) break; } catch { /* starting */ } await sleep(1000); }

let ipN = 1;
const api = (p, body) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.9.8.${ipN++ % 250}` }, body: JSON.stringify(body) }).then(r => r.json().catch(() => ({ status: r.status })));
const dir = (token, action, extra = {}) => api('leaddir.php', { token, action, ...extra });

console.log('\nLead directory');
const OWNER = 'owner@leaddir.test', OPW = 'Tq9!vX2#pLm7wZ-ld';
await api('auth.php', { action: 'bootstrap', email: OWNER, password: OPW, name: 'Owner' });
const OL = await api('auth.php', { action: 'login', email: OWNER, password: OPW });
const T = OL.token, OACCT = OL.user?.accountId;
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
ok('customers see nothing until the owner opens it', (await dir(CT, 'search', { accountId: ACCT, industry: 'real estate' })).code === 'not_shared');

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
  await card.getByText(/^Finished\./).waitFor({ timeout: 90_000 }).catch(() => {});
  const text = await card.innerText();
  ok('the card says the load finished', /Finished\./.test(text), text.slice(0, 800));
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

/* ── Opening it to customers ── */
const noAttest = await dir(T, 'settings', { shared: true });
ok('opening it needs the owner\'s statement, asked on its box', noAttest.success === false && noAttest.field === 'leaddir.attest', JSON.stringify(noAttest));
const opened = await dir(T, 'settings', { shared: true, attest: true });
ok('…and with it, customers can search', opened.success && opened.shared === true && !!opened.attestedAt, JSON.stringify(opened));

/* ── Searching ── */
const st = await dir(CT, 'status', { accountId: ACCT });
ok('a customer sees the size and the allowance', st.success && st.total === UNIQUE + 30 && st.left.day === 200 && st.left.month === 2000, JSON.stringify(st).slice(0, 300));
ok('another workspace\'s id is refused', (await dir(CT, 'status', { accountId: XACCT })).success === false);
ok('a search with no industry or place is refused on its box', (await dir(CT, 'search', { accountId: ACCT, title: 'CEO' })).field === 'leaddir.industry');
const fl = await dir(CT, 'search', { accountId: ACCT, industry: 'real estate', place: 'Florida' });
const flCount = Array.from({ length: 1200 }, (_, i) => i).filter(i => i % 3).length;
ok(`"real estate" in Florida finds the ${flCount} there (commercial included)`, fl.success && fl.total === flCount, JSON.stringify({ total: fl.total, err: fl.error }));
ok('…50 to a page, with the next page offered', fl.people.length === 50 && fl.more === true);
ok('…with addresses and phones masked, and the profile hidden', fl.people.every(p => !p.email || /•/.test(p.email)) && fl.people.every(p => /•/.test(p.phone)) && fl.people.every(p => p.linkedin === 'hidden' || p.linkedin === '') && fl.people.every(p => p.revealed === false), JSON.stringify(fl.people[0]));
const fl2 = await dir(CT, 'search', { accountId: ACCT, industry: 'real estate', place: 'Florida', after: fl.after });
ok('the next page follows on with nobody repeated', fl2.people.length === 50 && !fl2.people.some(p => fl.people.some(x => x.id === p.id)));
const tx = await dir(CT, 'search', { accountId: ACCT, industry: 'real estate', place: 'Austin, TX' });
ok('"Austin, TX" is a town in a state written as its code', tx.total === 400, tx.total);
const ceo = await dir(CT, 'search', { accountId: ACCT, industry: 'real estate', place: 'Texas', title: 'CEO' });
ok('"CEO" finds Chief Executive Officers', ceo.total === 200 && ceo.people.every(p => /Chief Executive/.test(p.title)), JSON.stringify(ceo.people?.[0]));
const em = await dir(CT, 'search', { accountId: ACCT, industry: 'real estate', place: 'Florida', hasEmail: true });
ok('"only with an email" leaves out those without', em.total > 0 && em.total < flCount && em.people.every(p => p.email));
const none = await dir(CT, 'search', { accountId: ACCT, industry: 'dentists' });
ok('an industry nobody is filed under says so', none.success && none.total === 0 && /industry like/.test(none.note ?? ''), JSON.stringify(none));

/* ── Showing people spends the allowance, once each ── */
const three = fl.people.slice(0, 3).map(p => p.id);
const r1 = await dir(CT, 'reveal', { accountId: ACCT, ids: three });
ok('showing three people shows them in full', r1.success && r1.people.length === 3 && r1.people.every(p => !/•/.test(p.phone) && p.revealed && /linkedin\.com/.test(p.linkedin)), JSON.stringify(r1).slice(0, 300));
ok('…and spends three', r1.spent === 3 && r1.left.day === 197, JSON.stringify(r1.left));
const r2 = await dir(CT, 'reveal', { accountId: ACCT, ids: three });
ok('showing them again is free', r2.spent === 0 && r2.left.day === 197);
const again = await dir(CT, 'search', { accountId: ACCT, industry: 'real estate', place: 'Florida' });
ok('a later search shows the ones already seen in full', again.people.slice(0, 3).every(p => p.revealed) && !again.people[3].revealed);
ok('another workspace cannot spend this one\'s allowance', (await dir(XT, 'reveal', { accountId: ACCT, ids: three })).success === false);
ok('…and its own search sees them masked', (await dir(XT, 'search', { accountId: XACCT, industry: 'real estate', place: 'Florida' })).people.slice(0, 3).every(p => !p.revealed));
/* Spend the rest of the day. */
let after = again.after, pages = [];
while (pages.flat().length < 260) { const p = await dir(CT, 'search', { accountId: ACCT, industry: 'real estate', place: 'Florida', after }); pages.push(p.people.map(x => x.id)); after = p.after; }
const ids = pages.flat();
for (let k = 0; k < 197; k += 50) await dir(CT, 'reveal', { accountId: ACCT, ids: ids.slice(k, Math.min(k + 50, 197)) });
const over = await dir(CT, 'reveal', { accountId: ACCT, ids: ids.slice(197, 200) });
ok('past the day\'s allowance it stops, and says when it refills', over.success === false && over.code === 'reveal_budget' && /tomorrow/.test(over.error), JSON.stringify(over));

/* ── Removed on request, and kept out ── */
const gone = 'pat3@realty3.example';
const rm = await dir(T, 'remove', { email: gone });
ok('the owner removes a person', rm.success && rm.removed === 1, JSON.stringify(rm));
const s3 = await dir(T, 'import_start', { fileKey: 'again|1|1', name: 'again.csv', size: 1 });
const re = await dir(T, 'import_rows', { importId: s3.import.id, rows: [{ name: 'Pat Example3', email: gone, industry: 'Real estate' }, { name: 'New Person', email: 'new@fresh.example', industry: 'Real estate', state: 'Florida', country: 'USA' }] });
ok('a later load does not bring a removed person back', re.added === 1, JSON.stringify(re));
const rmBad = await dir(T, 'remove', {});
ok('remove with no address asks on its box', rmBad.field === 'leaddir.remove');

/* ── Undoing a load ── */
let u;
for (let k = 0; k < 10; k++) { u = await dir(T, 'import_undo', { importId: s3.import.id }); if (u.done) break; }
const a2 = await dir(T, 'admin');
ok('undoing a load takes its people back out', u.done && a2.total === UNIQUE + 30 - 1, a2.total);
ok('…and the load says so', a2.imports.find(i => i.id === s3.import.id)?.status === 'undone');

/* ── A customer's screen ── */
for (const width of [1280, 390]) {
  const { page, done } = await signIn(XE, XPW, width);
  await page.goto(`${B}/lead-directory`, { waitUntil: 'networkidle' });
  const root = page.getByTestId('lead-directory');
  await root.waitFor({ timeout: 15_000 });
  await root.locator('[data-field="leaddir.industry"]').fill('Real estate');
  await root.locator('[data-field="leaddir.place"]').fill('Florida');
  await root.locator('[data-field="leaddir.title"]').fill('owner');
  await root.getByRole('button', { name: /^Search$/ }).click();
  await root.getByTestId('ld-count').waitFor({ timeout: 15_000 });
  ok(`@${width}: the search shows people, masked`, (await root.locator('tbody tr').count()) > 0 && /•/.test(await root.locator('tbody').innerText()));
  await root.getByRole('checkbox', { name: /^Tick / }).nth(0).check();
  await root.getByRole('checkbox', { name: /^Tick / }).nth(1).check();
  /* At 390 the same customer ticks the same two again: already seen, so free. */
  ok(`@${width}: ticking says what it will cost`, (width === 1280 ? /2 ticked · 2 not seen before \(uses 2/ : /^2 ticked$/m).test(await root.getByTestId('ld-actions').innerText()), await root.getByTestId('ld-actions').innerText());
  await root.getByRole('button', { name: /Add to Contacts/ }).click();
  await root.getByText(/new, \d+ already in Contacts/).waitFor({ timeout: 15_000 }).catch(() => {});
  const out = await root.innerText();
  ok(`@${width}: they are added to Contacts on a list`, /2 on “owner · Real estate · Florida” — 2 new/.test(out) || (width === 390 && /2 on “owner · Real estate · Florida” — 0 new, 2 already/.test(out)) || /on “owner · Real estate · Florida”/.test(out), out.slice(0, 400));
  ok(`@${width}: nothing scrolls sideways`, (await overflow(page)) <= 1, await overflow(page));
  await page.screenshot({ path: `test-results/leaddir-${width}.png`, fullPage: true });
  /* The browser saves Contacts to the server on its own schedule; wait for it before leaving. */
  for (let k = 0; k < 30 && !JSON.parse((await api('data.php', { action: 'get', token: XT, accountId: XACCT, key: 'crm_contacts' })).value || '[]').length; k++) await sleep(500);
  await done();
}
const data = await api('data.php', { action: 'get', token: XT, accountId: XACCT, key: 'crm_contacts' });
const contacts = JSON.parse(data.value || '[]');
const lists = JSON.parse((await api('data.php', { action: 'get', token: XT, accountId: XACCT, key: 'crm_contact_lists' })).value || '[]');
ok('the contacts carry who they are, where they came from, and the tag', contacts.length >= 2 && contacts.every(c => c.source === 'Lead directory' && c.tags.includes('lead directory') && c.jobTitle && c.company && c.customFields?.directoryId && !/•/.test(c.email)), JSON.stringify(contacts[0] ?? data).slice(0, 400));
ok('the list is marked cold', lists.some(l => l.kind === 'cold' && l.memberIds.length >= 2), JSON.stringify(lists).slice(0, 300));
ok('no page errors', errs.length === 0, errs.join(' | '));

await br.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
