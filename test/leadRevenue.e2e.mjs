/**
 * Lead-to-revenue and the performance fee, end to end, on the real Worker and
 * a fresh D1.
 *
 *   VITE_BASE=/ npm run build
 *   npm run test:leadrevenuee2e
 *
 * Self-contained: migrates a fresh D1 into a temporary directory, runs
 * `wrangler dev` on :8873 (inspector :9373), and stops what it started.
 *
 * What it covers:
 *  - who may do what: a second customer cannot read or write the first's
 *    ledger; customers are refused the owner's actions; the service team
 *    (owner) cannot confirm completion or payments on a customer's behalf;
 *  - the agreement: drafted from the terms in force, signed once, and its
 *    terms fixed by the database itself;
 *  - the fee walk-through: reported → confirmed, $6,500 with $500 excluded →
 *    $6,000 → $300; a referral and an unconfirmed payment left out with
 *    reasons; review, a question, a stale approval refused, approval, the
 *    payments stamped and then fixed; a later refund carried forward;
 *  - calls: no script, no call; approved script, in hours, logged; "do not
 *    call" lands on the list and blocks the next one;
 *  - both screens at 1280 and 390: no sideways scroll, no page errors, a
 *    refusal that names a box on screen.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const PORT = Number(process.env.PORT ?? 8873), INSPECT = Number(process.env.INSPECT_PORT ?? 9373);
const B = `http://localhost:${PORT}`;
let fail = 0, pass = 0;
const ok = (name, cond, detail = '') => { if (cond) pass++; else fail++; console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ` — ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500)}`}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!fs.existsSync('dist/index.html')) { console.log('Build first: VITE_BASE=/ npm run build'); process.exit(2); }

const persist = process.env.PERSIST || fs.mkdtempSync(path.join(os.tmpdir(), 'leadrev-d1-'));
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
const api = (p, body) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.8.1.${ipN++ % 250}` }, body: JSON.stringify(body) })
  .then(async r => ({ status: r.status, d: await r.json().catch(() => ({})) }));
const lr = body => api('lead-revenue.php', body);
const today = new Date().toISOString().slice(0, 10);

console.log('\nAccounts');
const OWNER = 'owner@leadrev.test', PW = 'Tq9!vX2#pLm7wZ-leadrev';
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
ok('owner and two contractors exist, each with a workspace', !!(T && CARA.token && BEN.token && CARA.acct && BEN.acct && CARA.acct !== BEN.acct), [CARA.acct, BEN.acct]);
/* The workspaces exist as their owners' (as the app's first sync would make them). */
for (const u of [CARA, BEN]) await lr({ action: 'overview', token: u.token, accountId: u.acct });

console.log('\nWho may do what');
let r = await lr({ action: 'overview', accountId: CARA.acct });
ok('nobody at all is refused', r.status === 401, r);
r = await lr({ action: 'overview', token: BEN.token, accountId: CARA.acct });
ok('another customer cannot read the ledger', r.status === 403 && !r.d.leads, r);
r = await lr({ action: 'lead_create', token: BEN.token, accountId: CARA.acct, lead: { name: 'Sneaky', channel: 'service_ads' } });
ok('…or write to it', r.status === 403, r);
for (const action of ['customers', 'terms_list', 'terms_add']) {
  r = await lr({ action, token: CARA.token, accountId: CARA.acct });
  ok(`a customer is refused ${action}`, r.status === 403 && r.d.code === 'not_owner', r);
}
for (const action of ['agreement_draft', 'statement_compute', 'attribution_fix', 'approval_request', 'call_log']) {
  r = await lr({ action, token: CARA.token, accountId: CARA.acct });
  ok(`a customer is refused ${action} on their own workspace`, r.status === 403 && r.d.code === 'not_owner', r);
}
r = await lr({ action: 'overview', token: T, accountId: 'no-such-workspace' });
ok('the owner cannot open a workspace that does not exist', r.status === 404, r);
ok('nothing was written by refused calls', sql('SELECT COUNT(*) AS n FROM crm_rev_leads')[0].n === 0 && sql('SELECT COUNT(*) AS n FROM crm_growth_agreements')[0].n === 0);

/* The agency's own bucket is one name, stored per person. */
await lr({ action: 'lead_create', token: CARA.token, accountId: '__agency__', lead: { name: 'Own bucket lead', channel: 'own_other' } });
r = await lr({ action: 'overview', token: BEN.token, accountId: '__agency__' });
ok('two agencies naming "__agency__" get separate ledgers', r.d.success && r.d.leads.length === 0, r.d.leads?.length);
r = await lr({ action: 'overview', token: BEN.token, accountId: `__agency__:${CARA.email}` });
ok('…and the suffixed name of another agency’s bucket is refused', r.status === 403, r);

console.log('\nTerms and the agreement');
r = await lr({ action: 'customers', token: T });
ok('the owner lists customers', r.d.success && r.d.customers.some(c => c.email === CARA.email), r);
r = await lr({ action: 'terms_add', token: T, effectiveFrom: today, terms: { setupCents: 30000, monthlyCents: 8700, performanceBps: 9000, attributionDays: 180 } });
ok('terms: a 90% fee is refused at its box', !r.d.success && r.d.field === 'terms.bps', r.d);
r = await lr({ action: 'terms_add', token: T, effectiveFrom: '2020-01-01', terms: { setupCents: 30000, monthlyCents: 8700, performanceBps: 500, attributionDays: 180 } });
ok('terms cannot be backdated', !r.d.success && r.d.field === 'terms.from', r.d);
r = await lr({ action: 'terms_add', token: T, effectiveFrom: today, terms: { setupCents: 30000, monthlyCents: 8700, performanceBps: 500, attributionDays: 180, exclusions: ['tax', 'permits'] }, note: 'Launch terms' });
ok('the owner writes terms from today', r.d.success, r.d);
r = await lr({ action: 'agreement_draft', token: T, accountId: CARA.acct, customerName: 'Cara Cooling LLC' });
const AG = r.d.agreement;
ok('an agreement is drafted from the terms in force', r.d.success && AG.status === 'draft' && AG.setupCents === 30000 && AG.monthlyCents === 8700 && AG.performanceBps === 500, r.d);
r = await lr({ action: 'overview', token: CARA.token, accountId: CARA.acct });
ok('the customer does not see a draft', r.d.agreements.length === 0 && r.d.agreement === null, r.d.agreements);
r = await lr({ action: 'agreement_activate', token: T, accountId: CARA.acct, id: AG.id, signedBy: '', signedOn: today, startsOn: today });
ok('signing needs a name, at its box', !r.d.success && r.d.field === 'agreement.signedBy', r.d);
r = await lr({ action: 'agreement_activate', token: T, accountId: CARA.acct, id: AG.id, signedBy: 'Cara Diaz', signedOn: today, startsOn: today });
ok('the owner records it signed', r.d.success && r.d.agreement.status === 'active', r.d);
r = await lr({ action: 'agreement_terms', token: T, accountId: CARA.acct, id: AG.id, terms: { setupCents: 1, monthlyCents: 1, performanceBps: 2000, attributionDays: 365 } });
ok('a signed agreement’s terms are refused by the route', !r.d.success, r.d);
const trig = sqlFails(`UPDATE crm_growth_agreements SET performance_bps = 2000 WHERE id = '${AG.id}'`);
ok('…and by the database itself', /fixed/.test(trig) && sql(`SELECT performance_bps FROM crm_growth_agreements WHERE id = '${AG.id}'`)[0].performance_bps === 500, trig.slice(0, 200));
r = await lr({ action: 'agreement_draft', token: T, accountId: CARA.acct });
const AG2 = r.d.agreement;
r = await lr({ action: 'agreement_activate', token: T, accountId: CARA.acct, id: AG2.id, signedBy: 'X', signedOn: today, startsOn: today });
ok('a second agreement cannot be in force at once', !r.d.success, r.d);

console.log('\nLeads and the job');
const idem = 'lead-idem-1';
r = await lr({ action: 'lead_create', token: T, accountId: CARA.acct, idem, lead: { name: 'Dana Homeowner', phone: '(212) 555-0100', email: 'dana@home.test', service: 'AC replacement', channel: 'service_ads', channelDetail: 'Spring AC campaign', consent: 'inquiry', timezone: 'America/New_York' } });
const L1 = r.d.lead;
ok('the service team logs an inquiry from its own ads, under the agreement', r.d.success && L1.byService && L1.agreementId === AG.id && L1.stage === 'inquiry', r.d);
r = await lr({ action: 'lead_create', token: T, accountId: CARA.acct, idem, lead: { name: 'Dana Homeowner', channel: 'service_ads' } });
ok('a double submit stores one lead', r.d.repeated && r.d.lead.id === L1.id && sql(`SELECT COUNT(*) AS n FROM crm_rev_leads WHERE account_id = '${CARA.acct}'`)[0].n === 1);
r = await lr({ action: 'lead_create', token: CARA.token, accountId: CARA.acct, lead: { name: 'Neighbour Ref', email: 'not-an-email', channel: 'own_referral' } });
ok('a bad email is refused at its box', !r.d.success && r.d.field === 'lead.email', r.d);
r = await lr({ action: 'lead_create', token: CARA.token, accountId: CARA.acct, lead: { name: 'Neighbour Ref', channel: 'own_referral' } });
const L2 = r.d.lead;
ok('the contractor logs a referral of their own — no fee possible', r.d.success && !L2.byService, r.d);
r = await lr({ action: 'lead_create', token: T, accountId: CARA.acct, lead: { name: 'Old', channel: 'service_ads', firstTouchOn: '2020-01-01' } });
ok('attribution is not decided after the fact (no backdating months)', !r.d.success && r.d.field === 'lead.firstTouchOn', r.d);
for (const to of ['qualified', 'appointment', 'quoted']) await lr({ action: 'stage', token: T, accountId: CARA.acct, id: L1.id, to });
r = await lr({ action: 'lead_update', token: T, accountId: CARA.acct, id: L1.id, patch: { quote: '6,500' } });
ok('a quote is recorded, as a quote', r.d.lead?.quoteCents === 650000 && r.d.lead.stage === 'quoted', r.d);
r = await lr({ action: 'stage', token: T, accountId: CARA.acct, id: L1.id, to: 'in_progress' });
ok('not in progress before it is won', !r.d.success, r.d);
r = await lr({ action: 'stage', token: T, accountId: CARA.acct, id: L1.id, to: 'won' });
ok('the job is won, and stamped', r.d.lead?.stage === 'won' && !!r.d.lead.wonAt, r.d);
r = await lr({ action: 'confirm_completion', token: T, accountId: CARA.acct, id: L1.id, finalAmount: '6500' });
ok('the service team cannot confirm the job complete', r.status === 403 && r.d.code === 'contractor_only', r);
r = await lr({ action: 'stage', token: T, accountId: CARA.acct, id: L1.id, to: 'completed' });
ok('…nor reach completed by a stage move', !r.d.success, r.d);
r = await lr({ action: 'confirm_completion', token: CARA.token, accountId: CARA.acct, id: L1.id, finalAmount: '' });
ok('completion needs the final amount, at its box', !r.d.success && r.d.field === 'lead.final', r.d);
r = await lr({ action: 'confirm_completion', token: CARA.token, accountId: CARA.acct, id: L1.id, finalAmount: '6,500' });
ok('the contractor confirms it complete', r.d.lead?.stage === 'completed' && r.d.lead.finalCents === 650000 && r.d.lead.completedBy === CARA.email, r.d);
r = await lr({ action: 'existing_customer', token: T, accountId: CARA.acct, id: L1.id, value: true, reason: 'test' });
ok('the service team cannot mark a job an existing customer for them', r.status === 403, r);

console.log('\nMoney and the statement');
r = await lr({ action: 'payment_add', token: T, accountId: CARA.acct, leadId: L1.id, kind: 'payment', amount: '6500', excluded: '500', receivedOn: today, method: 'card', idem: 'p1' });
const P1 = r.d.payment;
ok('the service team reports a payment — it waits for the contractor', r.d.success && P1.verification === 'reported', r.d);
r = await lr({ action: 'payment_add', token: T, accountId: CARA.acct, leadId: L1.id, kind: 'payment', amount: '6500', receivedOn: today, idem: 'p1' });
ok('a double submit stores one payment', r.d.repeated && r.d.payment.id === P1.id);
r = await lr({ action: 'payment_add', token: CARA.token, accountId: CARA.acct, leadId: L1.id, kind: 'payment', amount: '100', excluded: '200', receivedOn: today });
ok('an exclusion bigger than the payment is refused at its box', !r.d.success && r.d.field === 'pay.excluded', r.d);
r = await lr({ action: 'payment_add', token: CARA.token, accountId: CARA.acct, leadId: L2.id, kind: 'payment', amount: '1000', receivedOn: today });
ok('the contractor records their referral’s payment — confirmed by them', r.d.payment?.verification === 'contractor_confirmed', r.d);
r = await lr({ action: 'payment_confirm', token: T, accountId: CARA.acct, id: P1.id });
ok('the service team cannot confirm a payment', r.status === 403 && r.d.code === 'contractor_only', r);
r = await lr({ action: 'statement_compute', token: T, accountId: CARA.acct, periodEnd: today });
ok('before confirmation, nothing counts: the payment is held, with its reason', r.d.statement?.feeCents === 0 && r.d.statement.notCounted.some(x => x.paymentId === P1.id && x.held && /confirmation/.test(x.why)), r.d.statement);
r = await lr({ action: 'payment_confirm', token: CARA.token, accountId: CARA.acct, id: P1.id });
ok('the contractor confirms it', r.d.payment?.verification === 'contractor_confirmed', r.d);
r = await lr({ action: 'statement_compute', token: T, accountId: CARA.acct, periodEnd: today });
let S = r.d.statement;
ok('$6,500 collected, $500 tax excluded → $6,000 net → $300 fee', S.grossCents === 650000 && S.excludedCents === 50000 && S.netCents === 600000 && S.feeCents === 30000 && S.lines.length === 1, S);
ok('the referral’s payment is not counted on this statement', !S.lines.some(x => x.leadId === L2.id));
r = await lr({ action: 'overview', token: CARA.token, accountId: CARA.acct });
ok('the customer does not see a draft statement', r.d.statements.length === 0 && r.d.metrics.feePendingCents === 0, r.d.statements);
ok('the dashboard: collected $7,500, eligible $6,000, quoted $6,500 kept apart', r.d.metrics.collectedCents === 750000 && r.d.metrics.eligibleCents === 600000 && r.d.metrics.quotedCents === 650000, r.d.metrics);
r = await lr({ action: 'statement_approve', token: T, accountId: CARA.acct, id: S.id });
ok('a statement the contractor has not seen cannot be approved', !r.d.success, r.d);
r = await lr({ action: 'statement_send', token: T, accountId: CARA.acct, id: S.id });
ok('the owner sends it for review', r.d.statement?.status === 'review', r.d);
r = await lr({ action: 'query_add', token: CARA.token, accountId: CARA.acct, statementId: S.id, lineRef: P1.id, body: 'Was the permit fee left out too?' });
ok('the contractor asks about a line', r.d.success, r.d);
r = await lr({ action: 'statement_approve', token: T, accountId: CARA.acct, id: S.id });
ok('not approved while a question is open', !r.d.success && r.d.code === 'open_queries', r.d);
const qid = sql(`SELECT id FROM crm_rev_queries WHERE statement_id = '${S.id}'`)[0].id;
r = await lr({ action: 'query_answer', token: T, accountId: CARA.acct, id: qid, body: 'Only the tax was on that payment; no permit was charged.' });
ok('the owner answers', r.d.success, r.d);
r = await lr({ action: 'payment_dispute', token: CARA.token, accountId: CARA.acct, id: P1.id, value: true, reason: 'Card company query' });
r = await lr({ action: 'statement_approve', token: T, accountId: CARA.acct, id: S.id });
ok('a payment changed since calculation: approval refused as stale', !r.d.success && r.d.code === 'stale', r.d);
await lr({ action: 'payment_dispute', token: CARA.token, accountId: CARA.acct, id: P1.id, value: false, reason: 'Resolved with the bank' });
r = await lr({ action: 'statement_approve', token: T, accountId: CARA.acct, id: S.id });
ok('once true again, the owner approves the $300', r.d.statement?.status === 'approved' && r.d.statement.feeCents === 30000, r.d);
ok('the payment is stamped as counted', sql(`SELECT statement_id FROM crm_rev_payments WHERE id = '${P1.id}'`)[0].statement_id === S.id);
r = await lr({ action: 'payment_void', token: CARA.token, accountId: CARA.acct, id: P1.id, reason: 'try' });
ok('a counted payment cannot be voided', !r.d.success, r.d);
const trig2 = sqlFails(`UPDATE crm_rev_payments SET amount_cents = 1 WHERE id = '${P1.id}'`);
ok('…or rewritten, even in the database', /approved statement/.test(trig2), trig2.slice(0, 200));
r = await lr({ action: 'statement_compute', token: T, accountId: CARA.acct, periodEnd: today });
ok('a new statement does not count it twice', r.d.statement?.lines.length === 0 && r.d.statement.feeCents === 0, r.d.statement);
await lr({ action: 'statement_void', token: T, accountId: CARA.acct, id: r.d.statement.id });
r = await lr({ action: 'payment_add', token: CARA.token, accountId: CARA.acct, leadId: L1.id, kind: 'refund', amount: '1000', receivedOn: today });
r = await lr({ action: 'statement_compute', token: T, accountId: CARA.acct, periodEnd: today });
ok('a later refund: no fee, and the −$1,000 carried to the next statement', r.d.statement?.netCents === -100000 && r.d.statement.feeCents === 0 && r.d.statement.carryOutCents === -100000, r.d.statement);
const S2 = r.d.statement;
r = await lr({ action: 'overview', token: CARA.token, accountId: CARA.acct });
ok('the customer sees the approved fee', r.d.metrics.feeApprovedCents === 30000 && r.d.statements.some(s => s.id === S.id), r.d.metrics);

console.log('\nApprovals and calls');
const zone = ['America/New_York', 'America/Los_Angeles', 'Pacific/Honolulu', 'Europe/London', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland']
  .find(z => { const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: z }).format(new Date())); return h >= 9 && h <= 19; });
const night = ['America/New_York', 'America/Los_Angeles', 'Pacific/Honolulu', 'Europe/London', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland']
  .find(z => { const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: z }).format(new Date())); return h <= 6 || h >= 22; });
await lr({ action: 'lead_update', token: T, accountId: CARA.acct, id: L1.id, patch: { timezone: zone } });
r = await lr({ action: 'call_check', token: T, accountId: CARA.acct, leadId: L1.id });
ok('no approved script: the call check refuses, and says why', r.d.success && !r.d.allowed && r.d.checks.some(c => c.key === 'script' && !c.ok), r.d);
r = await lr({ action: 'call_log', token: T, accountId: CARA.acct, leadId: L1.id, outcome: 'spoke', scriptId: 'x' });
ok('…and a call cannot be logged', !r.d.success && r.d.code === 'call_blocked', r.d);
r = await lr({ action: 'approval_request', token: T, accountId: CARA.acct, kind: 'call_script', title: 'Spring tune-up script', body: 'Hi, this is Sam calling for Cara Cooling about the tune-up you asked about…' });
const APR = r.d.id;
r = await lr({ action: 'approval_request', token: T, accountId: CARA.acct, kind: 'ad_budget', title: 'May ads', body: 'Search ads' });
ok('an ad budget needs its amount, at its box', !r.d.success && r.d.field === 'approval.amount', r.d);
r = await lr({ action: 'approval_decide', token: T, accountId: CARA.acct, id: APR, decision: 'approved' });
ok('the service team cannot approve its own script', r.status === 403, r);
r = await lr({ action: 'approval_decide', token: CARA.token, accountId: CARA.acct, id: APR, decision: 'approved', note: 'Fine' });
ok('the contractor approves it', r.d.status === 'approved', r.d);
r = await lr({ action: 'call_check', token: T, accountId: CARA.acct, leadId: L1.id });
ok(`with a script, consent and ${zone} in hours, the call is allowed`, r.d.allowed && r.d.scripts.length === 1, r.d.checks);
if (night) {
  r = await lr({ action: 'call_check', token: T, accountId: CARA.acct, phone: '3105550199', timezone: night, consent: 'written' });
  ok(`at night in ${night}, it is refused`, !r.d.allowed && r.d.checks.some(c => c.key === 'hours' && !c.ok), r.d.checks);
}
r = await lr({ action: 'call_check', token: T, accountId: CARA.acct, phone: '3105550199', timezone: zone });
ok('a number with no consent is refused, and the registry is said to be unconnected', !r.d.allowed && r.d.checks.some(c => c.key === 'consent' && /not connected/.test(c.says)), r.d.checks);
r = await lr({ action: 'call_log', token: T, accountId: CARA.acct, leadId: L1.id, outcome: 'do_not_call', scriptId: r.d.scripts[0].id, notes: 'Asked not to be called' });
ok('the call is logged', r.d.success, r.d);
ok('"do not call" put the number on the list', sql(`SELECT COUNT(*) AS n FROM crm_rev_dnc WHERE account_id = '${CARA.acct}' AND phone = '2125550100'`)[0].n === 1);
r = await lr({ action: 'call_check', token: T, accountId: CARA.acct, leadId: L1.id });
ok('…and the next call is refused', !r.d.allowed && r.d.checks.some(c => c.key === 'dnc' && !c.ok), r.d.checks);
r = await lr({ action: 'dnc_remove', token: T, accountId: CARA.acct, phone: '2125550100', reason: 'x' });
ok('the service team cannot take a number off the list', r.status === 403, r);
r = await lr({ action: 'dnc_remove', token: CARA.token, accountId: CARA.acct, phone: '2125550100', reason: '' });
ok('the contractor must say why, at its box', !r.d.success && r.d.field === 'dnc.reason', r.d);
r = await lr({ action: 'lead_get', token: T, accountId: CARA.acct, id: L1.id });
const kinds = r.d.events.map(e => e.kind);
ok('the lead’s history has every step, with who did it', ['created', 'stage', 'edited', 'completed', 'payment', 'payment_confirmed', 'payment_disputed', 'refund', 'call'].every(k => kinds.includes(k)) && r.d.events.every(e => e.byEmail && e.byRole), kinds);
r = await lr({ action: 'lead_get', token: BEN.token, accountId: BEN.acct, id: L1.id });
ok('another customer naming the lead from their own workspace gets nothing', r.status === 404, r);

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
  const { ctx, page } = await signIn(CARA.email, CARA.password, width);
  await page.evaluate(a => localStorage.setItem('crm_active_account', a), CARA.acct);
  await page.goto(`${B}/jobs`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="ledger"]', { timeout: 15_000 });
  const text = await page.getByTestId('ledger').innerText();
  ok(`contractor @${width}: the agreement says its three fees and that ad budget is separate`, /\$300 setup · \$87\/month · 5% performance fee/.test(text) && /advertising budget/.test(text), text.slice(0, 400));
  ok(`contractor @${width}: the leads are listed, the quote not shown as money`, /Dana Homeowner/.test(text) && /Quoted \(not money\)/.test(text));
  await page.locator(`[data-lead="${L1.id}"] > button`).click();
  await page.waitForSelector('[data-testid="lead-history"]');
  ok(`contractor @${width}: a lead opens with its history`, /Confirmed complete/.test(await page.getByTestId('lead-history').innerText()));
  await page.getByTestId('tab-statements').click();
  await page.waitForTimeout(400);
  ok(`contractor @${width}: the approved $300 statement is there`, (await page.locator('[data-statement]').count()) >= 1 && /\$300/.test(await page.locator('[data-statement]').last().innerText()));
  await page.getByTestId('tab-leads').click();
  await page.getByTestId('lead-add-open').click();
  await page.getByTestId('lead-save').click();
  await page.waitForTimeout(800);
  ok(`contractor @${width}: an empty inquiry is refused at the name box, on screen`, /name/i.test(await page.getByTestId('lead-form').innerText()) && (await page.evaluate(() => (window.__deadEnds ?? []).length)) === 0, await page.evaluate(() => window.__deadEnds ?? []));
  ok(`contractor @${width}: no sideways scroll`, (await overflow(page)) <= 0, String(await overflow(page)));
  await page.screenshot({ path: `test-results/jobs-${width}.png`, fullPage: true });
  await page.goto(`${B}/growth`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  ok(`contractor @${width}: the owner's desk is not theirs`, /run by the install owner/.test(await page.locator('main').innerText()));
  await ctx.close();
}
for (const width of [1280, 390]) {
  const { ctx, page } = await signIn(OWNER, PW, width);
  await page.goto(`${B}/growth`, { waitUntil: 'networkidle' });
  await page.waitForSelector(`[data-customer="${CARA.email}"]`, { timeout: 15_000 });
  ok(`owner @${width}: customers listed with their agreement`, /Agreement in force/.test(await page.locator(`[data-customer="${CARA.email}"]`).innerText()));
  await page.locator(`[data-customer="${CARA.email}"]`).click();
  await page.waitForSelector('[data-testid="agreement-admin"]', { timeout: 15_000 });
  ok(`owner @${width}: the agreement in force, its terms fixed`, /In force/.test(await page.getByTestId('agreement-admin').innerText()));
  await page.getByTestId('tab-statements').click();
  await page.waitForSelector(`[data-statement="${S2.id}"]`);
  ok(`owner @${width}: the open statement can be sent`, await page.getByTestId('stmt-send').isVisible());
  await page.getByTestId('tab-calls').click();
  ok(`owner @${width}: calls tab says the software places none`, /places none/.test(await page.getByTestId('ledger').innerText()));
  ok(`owner @${width}: no sideways scroll`, (await overflow(page)) <= 0, String(await overflow(page)));
  await page.screenshot({ path: `test-results/growth-${width}.png`, fullPage: true });
  await ctx.close();
}
ok('no page errors anywhere', errs.length === 0, errs.join('\n'));
await br.close();
stop();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
