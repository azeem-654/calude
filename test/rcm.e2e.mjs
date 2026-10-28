/**
 * Medical billing / RCM, end to end, on the real Worker and a fresh D1.
 *
 *   VITE_BASE=/ npm run build
 *   npm run test:rcme2e
 *
 * Self-contained: migrates a fresh D1 into a temporary directory, runs
 * `wrangler dev` on :8875 (inspector :9375), and stops what it started.
 *
 * What it covers:
 *  - who may do what: nobody signed out; another customer reads nothing of a
 *    practice's; the practice is refused every billing action and the owner's
 *    checklist; synthetic data never goes into a practice's workspace;
 *  - the synthetic practice: claims in every state, a posted remittance, a
 *    denial, A/R in buckets and the leakage audit's findings, one per line;
 *  - remittances: preview writes nothing, import posts, the same file twice is
 *    refused, the same payments in a new file are recorded as duplicates and
 *    not posted, a deposit reconciles, an unmatched row is matched by hand;
 *  - a claim's life in a practice's workspace: guard rails (NPI, SYN-, SSN),
 *    coding review with warnings, the two statuses kept apart, "paid" never
 *    set by hand, an underpayment found, a denial appealed and won;
 *  - the practice portal: no internal note in anything it is sent, a request
 *    answered, the access log showing the billing team's views;
 *  - the database itself: the access log and posted payments cannot be
 *    rewritten, and a live workspace cannot go back to synthetic;
 *  - going live: refused until every blocker, the BAA date, no synthetic data
 *    and the owner's 2-step sign-in; then a practice login without 2-step
 *    sign-in is refused;
 *  - both screens at 1280 and 390: no sideways scroll, no page errors, a
 *    refusal that names a box on screen.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const PORT = Number(process.env.PORT ?? 8875), INSPECT = Number(process.env.INSPECT_PORT ?? 9375);
const B = `http://localhost:${PORT}`;
let fail = 0, pass = 0;
const ok = (name, cond, detail = '') => { if (cond) pass++; else fail++; console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ` — ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600)}`}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!fs.existsSync('dist/index.html')) { console.log('Build first: VITE_BASE=/ npm run build'); process.exit(2); }

const persist = process.env.PERSIST || fs.mkdtempSync(path.join(os.tmpdir(), 'rcm-d1-'));
const d1 = cmd => execSync(`npx wrangler d1 execute crmpro --local --persist-to ${persist} --json --command ${JSON.stringify(cmd)}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const sql = q => JSON.parse(d1(q))[0].results;
const sqlFails = q => { try { d1(q); return ''; } catch (e) { return String(e.stdout ?? '') + String(e.stderr ?? '') + String(e.message); } };
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
const rcm = body => api('rcm.php', body);
const today = new Date().toISOString().slice(0, 10);
const ago = n => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

console.log('\nAccounts');
const OWNER = 'owner@rcm.test', PW = 'Tq9!vX2#pLm7wZ-rcm-desk';
const boot = await api('auth.php', { action: 'bootstrap', email: OWNER, password: PW, name: 'Owner' });
if (!boot.d.success) { console.log('bootstrap failed', boot, wlog.slice(-2000)); stop(); process.exit(2); }
const T = (await api('auth.php', { action: 'login', email: OWNER, password: PW })).d.token;
const mkUser = async (email, password, name) => {
  const reg = await api('auth.php', { action: 'register', email, password, name });
  const token = reg.d.token ?? (await api('auth.php', { action: 'login', email, password })).d.token;
  const acct = sql(`SELECT account_id FROM crm_users WHERE email = '${email}'`)[0]?.account_id;
  return { email, password, token, acct };
};
const PAM = await mkUser('pam@practice.test', 'Another-horse-7pam', 'Pam Practice');
const EVE = await mkUser('eve@other.test', 'Battery-staple-9eve', 'Eve Other');
ok('owner and two customers exist, each with a workspace', !!(T && PAM.token && EVE.token && PAM.acct && EVE.acct && PAM.acct !== EVE.acct), [PAM.acct, EVE.acct]);
for (const u of [PAM, EVE]) await rcm({ action: 'overview', token: u.token, accountId: u.acct });

console.log('\nWho may do what');
let r = await rcm({ action: 'overview', accountId: PAM.acct });
ok('nobody at all is refused', r.status === 401, r);
r = await rcm({ action: 'overview', token: EVE.token, accountId: PAM.acct });
ok("another customer cannot open the practice's billing", r.status === 403 && !r.d.claims, r);
r = await rcm({ action: 'fee_statement', token: EVE.token, accountId: PAM.acct, month: '2026-10' });
ok("another customer cannot read the practice's fee statement", r.status === 403 && !r.d.statement, r);
r = await rcm({ action: 'fee_statement', token: PAM.token, accountId: PAM.acct, month: '2026-10' });
ok('the practice reads its own fee statement — a calculation for review, nothing charged', r.d.success && r.d.statement.month === '2026-10' && /not invoiced/.test(r.d.status) && r.d.statement.bps === 500, r.d);
r = await rcm({ action: 'fee_statement', token: PAM.token, accountId: PAM.acct, month: 'October' });
ok('a malformed month is refused at its box', !r.d.success && r.d.field === 'rcm.fee.month', r.d);
for (const act of ['blockers', 'blocker_set', 'practices_all']) {
  r = await rcm({ action: act, token: PAM.token, key: 'baa_template', done: true, note: 'forged' });
  ok(`a customer cannot ${act} (owner only)`, r.status === 403, r);
}
for (const act of ['practice_save', 'claim_create', 'ch_record', 'remit_import', 'auth_create', 'settings_save', 'go_live', 'synthetic_seed', 'denial_add', 'appeal_set']) {
  r = await rcm({ action: act, token: PAM.token, accountId: PAM.acct, practice: { name: 'Forged' }, csv: 'claim_no,code,paid\nC1,99213,1', id: 'x' });
  ok(`the practice cannot ${act} (billing team only)`, r.status === 403 && r.d.code === 'biller_only', r);
}
r = await rcm({ action: 'synthetic_seed', token: T, accountId: PAM.acct });
ok("synthetic data never goes into a practice's workspace", r.status === 403 && !r.d.success, r);

console.log('\nThe synthetic practice');
r = await rcm({ action: 'synthetic_seed', token: T, accountId: '__agency__' });
ok('the owner loads it into their own workspace', r.d.success && Object.keys(r.d.claimNos ?? {}).length === 10, r);
const nos = r.d.claimNos;
r = await rcm({ action: 'synthetic_seed', token: T, accountId: '__agency__' });
ok('loading it twice adds nothing', r.d.success && r.d.already === true, r);
let o = (await rcm({ action: 'overview', token: T, accountId: '__agency__' })).d;
const cl = ref => o.claims.find(c => c.patientRef === ref);
ok('ten claims, every one synthetic', o.claims.length === 10 && o.claims.every(c => c.synthetic && c.patientRef.startsWith('SYN-')));
ok('a paid claim: paid by the posted remittance, statuses kept apart', cl('SYN-1001')?.payer === 'paid' && cl('SYN-1001')?.ch === 'accepted' && cl('SYN-1001')?.paidCents > 0, cl('SYN-1001'));
ok('a denied line arrives as a denial, medical necessity', o.denials.some(d => d.claimId === cl('SYN-1003')?.id && d.carc === '50' && d.category === 'medical_necessity' && d.status === 'open'), o.denials);
ok('…and that claim is partly paid', cl('SYN-1003')?.payer === 'partial');
ok('a rejected claim is back in draft, never reached the payer', cl('SYN-1008')?.ch === 'rejected' && cl('SYN-1008')?.work === 'draft' && cl('SYN-1008')?.payer === 'none');
ok('A/R has money in more than one bucket', Object.values(o.aging.buckets).filter(b => b.cents > 0).length >= 2, o.aging);
ok('unbilled is kept apart from A/R', o.aging.unbilledClaims >= 3, o.aging);
const kinds = new Set(o.leakage.findings.map(f => f.kind));
ok('the audit finds the five planted kinds of leakage', ['timely_filing', 'filing_soon', 'underpaid', 'rejected_unresolved', 'no_response', 'denied_unworked'].every(k => kinds.has(k)), [...kinds]);
ok('…each line once', new Set(o.leakage.findings.map(f => f.key)).size === o.leakage.findings.length);
ok('…and its total is the sum of its findings', o.leakage.totalCents === o.leakage.findings.reduce((t, f) => t + f.cents, 0));
ok('no clearinghouse is pretended', o.integrations.clearinghouse === 'none');

console.log('\nRemittances');
const sample = (await rcm({ action: 'synthetic_remit', token: T, accountId: '__agency__' })).d;
ok('a synthetic sample remittance is offered', sample.success && /SYNCHK-2002/.test(sample.csv), sample);
const before = sql('SELECT COUNT(*) AS n FROM crm_rcm_remit_rows')[0].n;
r = await rcm({ action: 'remit_preview', token: T, accountId: '__agency__', csv: sample.csv, fileName: sample.fileName });
ok('preview reads every row and writes nothing', r.d.success && r.d.rows.length === 2 && r.d.rows.every(x => x.outcome === 'posted') && sql('SELECT COUNT(*) AS n FROM crm_rcm_remit_rows')[0].n === before, r.d);
r = await rcm({ action: 'remit_import', token: T, accountId: '__agency__', csv: sample.csv, fileName: sample.fileName });
ok('import posts both rows', r.d.success && r.d.posted === 2 && r.d.unmatched === 0, r.d);
const remitId = r.d.id;
o = (await rcm({ action: 'overview', token: T, accountId: '__agency__' })).d;
ok('the waiting claim is now paid (70.40 of 88.00, 17.60 to the patient)', cl('SYN-1004')?.payer === 'paid' && cl('SYN-1004')?.paidCents === 7040 && cl('SYN-1004')?.patientRespCents === 1760, cl('SYN-1004'));
ok('the other is denied for missing information (CARC 16)', cl('SYN-1005')?.payer === 'denied' && o.denials.some(d => d.claimId === cl('SYN-1005')?.id && d.carc === '16' && d.category === 'documentation'));
r = await rcm({ action: 'remit_import', token: T, accountId: '__agency__', csv: sample.csv, fileName: 'again.csv' });
ok('the same file twice is refused, naming when', !r.d.success && r.d.code === 'duplicate_file' && r.d.field === 'remit.file', r.d);
r = await rcm({ action: 'remit_import', token: T, accountId: '__agency__', csv: sample.csv.replace('claim_no,', 'claim_no ,').trim() + '\n\n', fileName: 'resent.csv' });
ok('the same payments in a different file are recorded, not posted again', r.d.success && r.d.posted === 0 && r.d.duplicate === 2, r.d);
o = (await rcm({ action: 'overview', token: T, accountId: '__agency__' })).d;
ok('…so the claim was paid once', cl('SYN-1004')?.paidCents === 7040, cl('SYN-1004'));
r = await rcm({ action: 'remit_deposit', token: T, accountId: '__agency__', id: remitId, deposit: '70.00' });
let g = (await rcm({ action: 'remit_get', token: T, accountId: '__agency__', id: remitId })).d;
ok('a deposit that differs leaves it unreconciled, naming the difference', g.reconciliation.status === 'unreconciled' && /differ by -0.40/.test(g.reconciliation.problems.join()), g.reconciliation);
await rcm({ action: 'remit_deposit', token: T, accountId: '__agency__', id: remitId, deposit: '70.40' });
g = (await rcm({ action: 'remit_get', token: T, accountId: '__agency__', id: remitId })).d;
ok('the right deposit reconciles it', g.reconciliation.status === 'reconciled' && g.remit.status === 'reconciled', g);
const orphan = `claim_no,code,billed,allowed,paid,patient_resp,adj_group,carc,check_no,paid_date\nC999999,99213,135.00,88.00,70.40,17.60,CO,45,SYNCHK-3003,${today}\n`;
r = await rcm({ action: 'remit_import', token: T, accountId: '__agency__', csv: orphan, fileName: 'orphan.csv' });
ok('a row for a claim that is not here is unmatched, never guessed', r.d.success && r.d.unmatched === 1 && r.d.posted === 0, r.d);
const orphanRow = sql(`SELECT id FROM crm_rcm_remit_rows WHERE remit_id = '${r.d.id}'`)[0].id;
r = await rcm({ action: 'remit_row_match', token: T, accountId: '__agency__', rowId: orphanRow, claimNo: nos['SYN-1006'] });
ok('matched by hand to the right claim, it posts', r.d.success, r.d);
ok('…and that claim now shows the payment', sql(`SELECT paid_cents FROM crm_rcm_claims WHERE claim_no = '${nos['SYN-1006']}' AND account_id LIKE '__agency__%'`)[0]?.paid_cents === 7040);
ok('a posted payment cannot be rewritten in the database', /fixed/.test(sqlFails(`UPDATE crm_rcm_remit_rows SET paid_cents = 1 WHERE id = '${orphanRow}'`)));

console.log("\nA claim's life in a practice's workspace");
const P = PAM.acct;
r = await rcm({ action: 'practice_save', token: T, accountId: P, practice: { name: 'Pam Family Practice', npi: '1234567890' } });
ok('a bad NPI is refused at its box', !r.d.success && r.d.field === 'practice.npi', r.d);
const pid = (await rcm({ action: 'practice_save', token: T, accountId: P, practice: { name: 'Pam Family Practice', npi: '1234567893', specialty: 'Family medicine' } })).d.id;
const vid = (await rcm({ action: 'provider_save', token: T, accountId: P, provider: { practiceId: pid, name: 'Dr. Synthetic', npi: '1245319599' } })).d.id;
const yid = (await rcm({ action: 'payer_save', token: T, accountId: P, payer: { name: 'Test Commercial', kind: 'commercial', code: 'TST01', timelyFilingDays: 90, fees: { '99214': '131.00', '36415': '9.00' } } })).d.id;
ok('practice, provider and payer set up', !!(pid && vid && yid));
const claimBody = ref => ({ practiceId: pid, providerId: vid, payerId: yid, patientRef: ref, serviceFrom: ago(5), diagnoses: 'E11.9, I10', lines: [{ code: '99214', units: 1, charge: '180.00', dxPointers: '1,2' }, { code: '36415', units: 1, charge: '25.00', dxPointers: '1' }] });
r = await rcm({ action: 'claim_create', token: T, accountId: P, claim: claimBody('MRN48213') });
ok('a real-looking patient reference is refused in synthetic mode', !r.d.success && r.d.field === 'claim.patientRef' && /SYN-/.test(r.d.error), r.d);
r = await rcm({ action: 'note_add', token: T, accountId: P, body: 'Patient SSN is 123-45-6789' });
ok('an SSN is refused anywhere', !r.d.success && /Social Security/.test(r.d.error), r.d);
const idem = `idem-${Date.now()}`;
r = await rcm({ action: 'claim_create', token: T, accountId: P, claim: claimBody('SYN-77'), idem });
const r2 = await rcm({ action: 'claim_create', token: T, accountId: P, claim: claimBody('SYN-77'), idem });
ok('a double-submitted claim is one claim', r.d.success && r2.d.success && r.d.id === r2.d.id && sql(`SELECT COUNT(*) AS n FROM crm_rcm_claims WHERE account_id = '${P}'`)[0].n === 1, [r.d, r2.d]);
const K = r.d.id, KNO = r.d.claimNo;
r = await rcm({ action: 'ch_record', token: T, accountId: P, id: K, to: 'submitted' });
ok('a draft cannot be submitted', !r.d.success && /coding review/.test(r.d.error), r.d);
r = await rcm({ action: 'claim_review', token: T, accountId: P, id: K });
ok('it goes to coding review', r.d.success && r.d.to === 'coding_review', r.d);
r = await rcm({ action: 'coding_approve', token: T, accountId: P, id: K });
ok('approval asks for its warnings to be read (visit with a procedure, no 25)', !r.d.success && r.d.code === 'warnings' && r.d.checks.some(c => c.key === 'line_1_no25'), r.d);
r = await rcm({ action: 'coding_approve', token: T, accountId: P, id: K, acceptWarnings: true });
ok('approved with the warnings accepted', r.d.success, r.d);
r = await rcm({ action: 'ch_record', token: T, accountId: P, id: K, to: 'submitted' });
r = await rcm({ action: 'payer_record', token: T, accountId: P, id: K, to: 'in_process' });
ok('the payer cannot answer before the clearinghouse accepts', !r.d.success && /clearinghouse/.test(r.d.error), r.d);
r = await rcm({ action: 'ch_record', token: T, accountId: P, id: K, to: 'accepted', payerClaimNo: 'TSTICN1' });
ok('the clearinghouse accepts it', r.d.success, r.d);
let c = (await rcm({ action: 'claim_get', token: T, accountId: P, id: K })).d.claim;
ok('accepted is not paid: the payer status is still its own', c.ch === 'accepted' && c.payer === 'none' && c.paidCents === 0, c);
r = await rcm({ action: 'payer_record', token: T, accountId: P, id: K, to: 'paid' });
ok('"paid" is never set by hand', !r.d.success && /remittance/.test(r.d.error), r.d);
r = await rcm({ action: 'payer_record', token: T, accountId: P, id: K, to: 'in_process' });
ok('in process, recorded', r.d.success);
const remit = `claim_no,service_date,code,billed,allowed,paid,patient_resp,adj_group,carc,rarc,check_no,paid_date
${KNO},${ago(5)},99214,180.00,118.00,94.40,23.60,CO,45,,TSTCHK-1,${today}
${KNO},${ago(5)},36415,25.00,0,0,0,CO,97,,TSTCHK-1,${today}
`;
r = await rcm({ action: 'remit_import', token: T, accountId: P, csv: remit, fileName: 'tst-835.csv' });
ok('its remittance posts', r.d.success && r.d.posted === 2, r.d);
o = (await rcm({ action: 'overview', token: T, accountId: P })).d;
c = o.claims.find(x => x.id === K);
ok('one line paid, one bundled away: partly paid', c.payer === 'partial' && c.paidCents === 9440, c);
ok('the bundling denial is recorded', o.denials.some(d => d.claimId === K && d.carc === '97' && d.category === 'bundling'));
ok('the 99214 is found underpaid against the fee schedule ($131 contracted, $118 allowed)', o.leakage.findings.some(f => f.claimId === K && f.kind === 'underpaid' && f.cents === 1300), o.leakage.findings);
ok('the bundled line is a denial not worked — not also an underpayment', o.leakage.findings.filter(f => f.claimId === K && f.code === '36415').map(f => f.kind).join() === 'denied_unworked');
const den = o.denials.find(d => d.claimId === K);
r = await rcm({ action: 'appeal_create', token: T, accountId: P, denialId: den.id, summary: 'Venipuncture was separate from the visit; records enclosed.' });
const apId = r.d.id;
await rcm({ action: 'appeal_set', token: T, accountId: P, id: apId, to: 'submitted' });
c = (await rcm({ action: 'claim_get', token: T, accountId: P, id: K })).d.claim;
ok('an appeal sent puts the claim in appealed', c.payer === 'appealed', c);
r = await rcm({ action: 'appeal_set', token: T, accountId: P, id: apId, to: 'won', recovered: '7.20' });
ok('the appeal is won and the denial overturned', r.d.success && sql(`SELECT status FROM crm_rcm_denials WHERE id = '${den.id}'`)[0].status === 'won', r.d);

console.log('\nThe practice portal');
await rcm({ action: 'note_add', token: T, accountId: P, claimId: K, body: 'INTERNAL: payer rep was rude, escalate', visibility: 'internal' });
await rcm({ action: 'note_add', token: T, accountId: P, claimId: K, body: 'Please send the lab order for this visit.', visibility: 'practice', kind: 'request' });
const po = await rcm({ action: 'overview', token: PAM.token, accountId: P });
ok('the practice opens its own billing', po.d.success && po.d.as.practice && !po.d.as.biller && po.d.claims.length === 1, po.d);
ok('no internal note is in anything the practice is sent', !JSON.stringify(po.d).includes('INTERNAL') && !JSON.stringify((await rcm({ action: 'claim_get', token: PAM.token, accountId: P, id: K })).d).includes('INTERNAL'));
const req = po.d.notes.find(n => n.kind === 'request');
r = await rcm({ action: 'note_add', token: PAM.token, accountId: P, claimId: K, body: 'Lab order attached in the portal.', answers: req.id, visibility: 'internal', kind: 'request' });
const mine = sql(`SELECT visibility, kind FROM crm_rcm_notes WHERE body = 'Lab order attached in the portal.'`)[0];
ok('the practice answers a request; its note is shared, never internal, never a request', r.d.success && mine.visibility === 'practice' && mine.kind === 'note' && !!sql(`SELECT answered_at FROM crm_rcm_notes WHERE id = '${req.id}'`)[0].answered_at, mine);
r = await rcm({ action: 'claim_get', token: EVE.token, accountId: EVE.acct, id: K });
ok('another customer naming the claim from their own workspace gets nothing', r.status === 404, r);
const log = (await rcm({ action: 'audit', token: PAM.token, accountId: P })).d.events;
ok('the access log shows the billing team viewing the claim', log.some(e => e.kind === 'viewed' && e.byEmail === OWNER && e.claimNo === KNO), log.slice(0, 5));
ok('the access log cannot be edited or deleted', /append-only/.test(sqlFails('UPDATE crm_rcm_events SET by_email = \'x\'')) && /append-only/.test(sqlFails('DELETE FROM crm_rcm_events')));

console.log('\nThe screens');
br = await pw.chromium.launch();
const errs = [];
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
fs.mkdirSync('test-results', { recursive: true });
const signIn = async (email, password, width) => {
  const ctx = await br.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`${email}@${width}: ${e}`));
  await page.goto(`${B}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email or username').fill(email, { timeout: 10_000 });
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(2500);
  return { ctx, page };
};
for (const width of [1280, 390]) {
  const { ctx, page } = await signIn(OWNER, PW, width);
  await page.goto(`${B}/rcm`, { waitUntil: 'networkidle' });
  /* The owner's own workspace as the app chose it: the synthetic practice goes there too, as the owner would load it from Set-up. */
  const own = await page.evaluate(() => localStorage.getItem('crm_active_account')) || '__agency__';
  const seeded = await rcm({ action: 'synthetic_seed', token: T, accountId: own });
  if (width === 1280) ok('the owner loads the synthetic practice into the workspace the app opened', seeded.d.success, seeded);
  const ownNos = seeded.d.claimNos ?? nos;
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="rcm"]', { timeout: 15_000 });
  ok(`owner @${width}: the synthetic banner says not to enter real patients`, /Synthetic test data only/.test(await page.getByTestId('rcm-mode').innerText()));
  await page.waitForSelector('[data-claim]', { timeout: 15_000 }).catch(() => null);
  ok(`owner @${width}: claims listed with both statuses`, (await page.locator('[data-claim]').count()) === 10 && /Clearinghouse: .*Payer: /s.test(await page.locator(`[data-claim="${ownNos['SYN-1001']}"]`).innerText()), (await page.locator('main').innerText()).slice(0, 800));
  await page.locator(`[data-claim="${ownNos['SYN-1003']}"] > button`).click();
  await page.waitForSelector('[data-testid="claim-detail"]');
  ok(`owner @${width}: a claim opens with its lines and its denial`, /Medical necessity/.test(await page.getByTestId('claim-detail').innerText()));
  await page.getByTestId('rcm-tab-review').click();
  await page.waitForSelector('[data-review]');
  ok(`owner @${width}: coding review holds the waiting claim`, (await page.locator('[data-review]').count()) === 1);
  await page.getByTestId('rcm-tab-remits').click();
  ok(`owner @${width}: remittances listed`, (await page.locator('[data-remit]').count()) >= 1);
  await page.getByTestId('rcm-tab-aging').click();
  ok(`owner @${width}: A/R aging in buckets`, /Over 120/.test(await page.getByTestId('aging').innerText()));
  await page.getByTestId('rcm-tab-leakage').click();
  ok(`owner @${width}: the leakage audit shows evidence`, /Evidence/.test(await page.getByTestId('leakage').innerText()));
  await page.getByTestId('rcm-tab-fee').click();
  await page.waitForSelector('[data-testid="rcm-fee"] [data-testid="rcm-fee-fee"]', { timeout: 10_000 });
  const feeText = await page.getByTestId('rcm-fee').innerText();
  ok(`owner @${width}: the fee statement shows its arithmetic, for review and not invoiced`, /Eligible net collections/.test(feeText) && /for review, not invoiced/.test(feeText) && /Synthetic test data only/.test(feeText), feeText.slice(0, 300));
  ok(`owner @${width}: no sideways scroll on the fee statement`, (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  await page.getByTestId('rcm-tab-audit').click();
  await page.waitForSelector('[data-testid="audit"] tbody tr');
  ok(`owner @${width}: the access log is there`, (await page.locator('[data-testid="audit"] tbody tr').count()) > 3);
  await page.getByTestId('rcm-checklist-open').click();
  await page.waitForSelector('[data-blocker]');
  ok(`owner @${width}: the launch checklist lists every blocker`, (await page.locator('[data-blocker]').count()) === 10);
  await page.getByTestId('rcm-tab-setup').click();
  await page.getByTestId('practice-save').click();
  await page.waitForTimeout(800);
  ok(`owner @${width}: an empty practice is refused at its box, on screen`, /practice’s name/.test(await page.locator('main').innerText()) && (await page.evaluate(() => (window.__deadEnds ?? []).length)) === 0, await page.evaluate(() => window.__deadEnds ?? []));
  ok(`owner @${width}: no sideways scroll`, (await overflow(page)) <= 0, String(await overflow(page)));
  await page.getByTestId('rcm-tab-claims').click();
  await page.screenshot({ path: `test-results/rcm-owner-${width}.png`, fullPage: true });
  await ctx.close();
}
for (const width of [1280, 390]) {
  const { ctx, page } = await signIn(PAM.email, PAM.password, width);
  await page.evaluate(a => localStorage.setItem('crm_active_account', a), PAM.acct);
  await page.goto(`${B}/rcm`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="rcm"]', { timeout: 15_000 });
  const tabs = await page.locator('[role="tab"]').allInnerTexts();
  ok(`practice @${width}: no set-up or coding review — a portal, not the workbench`, !tabs.some(t => /Set-up|Coding review/.test(t)) && tabs.some(t => /Messages/.test(t)), tabs);
  ok(`practice @${width}: its claim is there and no internal note is on the page`, (await page.locator('[data-claim]').count()) === 1 && !(await page.locator('main').innerText()).includes('INTERNAL'));
  await page.getByTestId('rcm-tab-messages').click();
  ok(`practice @${width}: the request and its answer are in Messages`, /lab order/i.test(await page.locator('main').innerText()));
  ok(`practice @${width}: no sideways scroll`, (await overflow(page)) <= 0, String(await overflow(page)));
  await page.screenshot({ path: `test-results/rcm-practice-${width}.png`, fullPage: true });
  await ctx.close();
}
ok('no page errors anywhere', errs.length === 0, errs.join('\n'));
await br.close();

console.log('\nGoing live');
r = await rcm({ action: 'go_live', token: T, accountId: P, confirm: 'LIVE' });
ok('refused while launch blockers are open', !r.d.success && r.d.code === 'blockers_open', r.d);
r = await rcm({ action: 'blocker_set', token: T, key: 'baa_template', done: true, note: '' });
ok('a blocker is signed off only with a note saying how', !r.d.success && r.d.field === 'blocker.note', r.d);
const keys = (await rcm({ action: 'blockers', token: T })).d.blockers.map(b => b.key);
for (const k of keys) await rcm({ action: 'blocker_set', token: T, key: k, done: true, note: `Done for the test (${k})` });
ok('every blocker signed off', (await rcm({ action: 'blockers', token: T })).d.cleared === true);
r = await rcm({ action: 'go_live', token: T, accountId: P, confirm: 'LIVE' });
ok('refused without the practice’s BAA date', !r.d.success && r.d.field === 'settings.baaSignedOn', r.d);
await rcm({ action: 'settings_save', token: T, accountId: P, settings: { baaSignedOn: today } });
r = await rcm({ action: 'go_live', token: T, accountId: P, confirm: 'LIVE' });
ok('refused without the owner’s own 2-step sign-in', !r.d.success && r.d.code === 'needs_2fa', r.d);
d1(`UPDATE crm_users SET totp_enabled_at = '${new Date().toISOString()}' WHERE email = '${OWNER}'`);
r = await rcm({ action: 'go_live', token: T, accountId: P, confirm: 'LIVE' });
ok('refused while synthetic data is left in the workspace', !r.d.success && r.d.code === 'synthetic_left', r.d);
r = await rcm({ action: 'synthetic_purge', token: T, accountId: P });
ok('synthetic data removed', r.d.success && sql(`SELECT COUNT(*) AS n FROM crm_rcm_claims WHERE account_id = '${P}'`)[0].n === 0, r.d);
ok('…but its access log stays', sql(`SELECT COUNT(*) AS n FROM crm_rcm_events WHERE account_id = '${P}'`)[0].n > 10);
r = await rcm({ action: 'go_live', token: T, accountId: P, confirm: 'yes' });
ok('refused without typing LIVE', !r.d.success && r.d.field === 'golive.confirm', r.d);
r = await rcm({ action: 'go_live', token: T, accountId: P, confirm: 'LIVE' });
ok('then it goes live', r.d.success && sql(`SELECT data_mode FROM crm_rcm_settings WHERE account_id = '${P}'`)[0].data_mode === 'live', r.d);
r = await rcm({ action: 'overview', token: PAM.token, accountId: P });
ok('a practice login without 2-step sign-in is refused', r.status === 403 && r.d.code === 'needs_2fa', r);
ok('a live workspace cannot be made synthetic again, even in the database', /one way|cannot go back/.test(sqlFails(`UPDATE crm_rcm_settings SET data_mode = 'synthetic' WHERE account_id = '${P}'`)));
const pid2 = (await rcm({ action: 'practice_save', token: T, accountId: P, practice: { name: 'Pam Family Practice' } })).d.id;
const yid2 = (await rcm({ action: 'payer_save', token: T, accountId: P, payer: { name: 'Real Commercial', kind: 'commercial' } })).d.id;
r = await rcm({ action: 'auth_create', token: T, accountId: P, auth: { practiceId: pid2, payerId: yid2, patientRef: 'MRN48213', code: '72148' } });
ok('in live mode the practice’s own reference is accepted', r.d.success && sql(`SELECT synthetic FROM crm_rcm_auths WHERE id = '${r.d.id}'`)[0].synthetic === 0, r.d);
stop();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
