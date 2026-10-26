/**
 * Two customers on one install, and the second one trying everything.
 *
 * Every request B makes here is one that used to succeed. The audit that
 * found them is in docs/SECURITY.md; this is the proof they stay shut. It
 * talks to a real Worker and a real local D1, because the bugs were in SQL
 * and in who a route believed — nothing a unit test of one function catches.
 *
 *   npx wrangler d1 migrations apply crmpro --local
 *   npx wrangler dev --local            (in another terminal)
 *   node test/security.e2e.mjs
 *
 * It also checks the failure side of the new protections: brute force is cut
 * off, a session is stored hashed, logout ends it, a password change needs
 * the current password, an unsigned tracked link does not redirect, and 2-step
 * sign-in refuses a wrong code.
 */
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';
const run = Date.now().toString(36);
let failures = 0;
let passes = 0;

const check = (name, cond, detail = '') => {
  if (cond) { passes++; console.log(`  ✓ ${name}`); }
  else { failures++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

/* `Connection: close`: `d1rows` blocks this process while wrangler runs, and a
   kept-alive socket the Worker closed in the meantime would be reused after
   it and fail as "other side closed" — a fault of the test, not the app. */
async function api(path, body, init = {}) {
  const r = await fetch(`${BASE}/api/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': init.ip ?? '10.0.0.1' },
    body: JSON.stringify(body), redirect: 'manual',
  });
  let data = {};
  try { data = await r.json(); } catch { /* not json */ }
  return { status: r.status, data, ok: !!data.success };
}

/* PERSIST: the --persist-to directory `wrangler dev` was started with, when it
   is not the default — otherwise these reads look at a different database. */
const persist = process.env.PERSIST ? ` --persist-to ${process.env.PERSIST}` : '';
const d1 = sql => execSync(`npx wrangler d1 execute crmpro --local${persist} --json --command ${JSON.stringify(sql.replace(/\s+/g, ' '))}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const d1rows = sql => { try { return JSON.parse(d1(sql))[0]?.results ?? []; } catch (e) { console.log(String(e.stdout ?? e)); return []; } };

/* Sign-up is limited per network; a test run is not an attack. */
d1rows('DELETE FROM crm_signup_attempts');
d1rows("DELETE FROM crm_rate_limits WHERE bucket LIKE 'login%' OR bucket LIKE 'mfa%' OR bucket LIKE 'booking%'");

const pw = 'Correct-horse-9';
async function signUp(tag) {
  const email = `${tag}-${run}@example.test`;
  const r = await api('auth.php', { action: 'register', email, name: `User ${tag}`, password: pw }, { ip: `10.1.${tag === 'a' ? 1 : 2}.1` });
  if (!r.ok) throw new Error(`could not sign up ${tag}: ${JSON.stringify(r.data)}`);
  return { email, token: r.data.token, acct: r.data.user.accountId };
}

console.log('\nSigning up two customers…');
const A = await signUp('a');
const B = await signUp('b');
const OWNER = d1rows("SELECT email FROM crm_users WHERE account_id IS NULL AND role = 'agency' LIMIT 1")[0]?.email;

/* A's things, for B to reach for. */
const pf = await api('projects.php', { action: 'save_portfolio', token: A.token, accountId: A.acct, name: 'A Plumbing', profile: { description: 'Boilers' } });
const pj = await api('projects.php', { action: 'save_project', token: A.token, accountId: A.acct, name: 'A project', objective: 'Get more boiler installs', portfolioId: pf.data.id });
const pr = await api('commerce.php', { action: 'save_product', token: A.token, accountId: A.acct, name: 'A boiler', priceCents: 150000, status: 'active' });
check('A can create its own portfolio, project and product', pf.ok && pj.ok && pr.ok, JSON.stringify([pf.data.error, pj.data.error, pr.data.error]));
const productId = pr.data.id ?? pr.data.product?.id ?? d1rows(`SELECT id FROM crm_products WHERE account_id = '${A.acct}' LIMIT 1`)[0]?.id;

console.log('\nAccounts — B against A and the owner');
const list = await api('auth.php', { action: 'list_users', token: B.token });
check('list_users does not show B other customers', list.ok && !(list.data.users ?? []).some(u => u.email === A.email || u.email === OWNER), JSON.stringify(list.data.users?.map(u => u.email)));
const sp = await api('auth.php', { action: 'set_password', token: B.token, email: A.email, password: 'Hijacked-pass-1' });
check("B cannot set A's password", !sp.ok && sp.status === 403, JSON.stringify(sp.data));
if (OWNER) {
  const so = await api('auth.php', { action: 'set_password', token: B.token, email: OWNER, password: 'Hijacked-pass-1' });
  check("B cannot set the install owner's password", !so.ok, JSON.stringify(so.data));
  const del = await api('auth.php', { action: 'delete_user', token: B.token, email: OWNER });
  check('B cannot delete the install owner', !del.ok, JSON.stringify(del.data));
}
const dl = await api('auth.php', { action: 'delete_user', token: B.token, email: A.email });
check('B cannot delete A', !dl.ok, JSON.stringify(dl.data));
const cu = await api('auth.php', { action: 'create_user', token: B.token, email: `mole-${run}@example.test`, password: 'Mole-password-1', name: 'Mole', role: 'client', accountId: A.acct });
check("B cannot create a login inside A's workspace", !cu.ok && cu.status === 403, JSON.stringify(cu.data));
const ca = await api('auth.php', { action: 'create_user', token: B.token, email: `agent-${run}@example.test`, password: 'Mole-password-1', name: 'Mole', role: 'agency', accountId: B.acct });
check('B cannot mint an agency login', !ca.ok, JSON.stringify(ca.data));

console.log('\nSign-ups and messages — the owner\'s alone');
const su = await api('customers.php', { action: 'signups', token: B.token });
check("B cannot read the owner's list of sign-ups", !su.ok, JSON.stringify(su.data).slice(0, 120));
const msg = await api('customers.php', { action: 'message', token: B.token, to: [A.email], title: 'Phish', body: 'x', link: 'https://evil.example' });
check('B cannot message other customers as the owner', !msg.ok, JSON.stringify(msg.data).slice(0, 120));
const aMine = await api('customers.php', { action: 'mine', token: A.token });
const aNote = (aMine.data.notices ?? [])[0];
if (aNote) {
  await api('customers.php', { action: 'read', token: B.token, id: aNote.id });
  const again = await api('customers.php', { action: 'mine', token: A.token });
  check("B cannot close A's message by id", (again.data.notices ?? []).some(n => n.id === aNote.id));
}
const setg = await api('customers.php', { action: 'settings_save', token: B.token, settings: { kickoffUrl: 'https://evil.example' } });
check("B cannot change the owner's kickoff link", !setg.ok, JSON.stringify(setg.data).slice(0, 120));

console.log("\nThe owner's lead library — never a customer's to search");
/* Searching and revealing people are the owner's alone, open or not, with or
   without a database behind it (routes/leaddir.ts). B names its own workspace:
   being allowed in the workspace is not being allowed into the library. */
for (const action of ['facets', 'search', 'reveal']) {
  const r = await api('leaddir.php', { action, token: B.token, accountId: B.acct, industry: 'real estate', place: 'Florida', ids: [1, 2, 3] });
  /* Since 95dd1be a customer's search of the closed library is answered "nobody, closed" so
     AI Prospecting falls through to the directories; it must still return nobody. */
  const closedEmpty = action === 'search' && r.data.closed === true && Array.isArray(r.data.people) && r.data.people.length === 0;
  check(`B cannot ${action} the lead library (403 not_owner, or nobody while closed)`, closedEmpty || (r.status === 403 && r.data.code === 'not_owner' && !r.data.people), JSON.stringify(r.data).slice(0, 160));
}
const ldStatus = await api('leaddir.php', { action: 'status', token: B.token, accountId: B.acct });
check("B's status says nothing of what is in the library", ldStatus.data.total === undefined && ldStatus.data.industries === undefined && ldStatus.data.states === undefined, JSON.stringify(ldStatus.data).slice(0, 160));
const ldOpen = await api('leaddir.php', { action: 'settings', token: B.token, shared: true, attest: true });
check('B cannot open the library to everybody', ldOpen.status === 403 && ldOpen.data.code === 'not_owner', JSON.stringify(ldOpen.data).slice(0, 160));
const ldFolders = await api('finders.php', { action: 'folders', token: B.token, accountId: A.acct });
check("B cannot read which lists A's projects fill", !ldFolders.ok && ldFolders.status === 403, JSON.stringify(ldFolders.data).slice(0, 160));

console.log("\nWorkspace data — B naming A's workspace");
const all = await api('data.php', { action: 'get_all', token: B.token, accountId: A.acct });
check("B cannot read A's workspace data", !all.ok, JSON.stringify(all.data).slice(0, 120));
const imap = await api('imap-fetch.php', { token: B.token, accountId: A.acct });
check("B cannot read A's inbox", !imap.ok && imap.status === 403, JSON.stringify(imap.data));
const smtp = await api('smtp-send.php', { token: B.token, accountId: A.acct, to: 'x@example.test', subject: 'hi', html: 'hi' });
check("B cannot send through A's mailbox", !smtp.ok && smtp.status === 403, JSON.stringify(smtp.data));
const prov = await api('provider-send.php', { token: B.token, accountId: A.acct, to: 'x@example.test', subject: 'hi', html: 'hi' });
check("B cannot send through A's provider key", !prov.ok && prov.status === 403, JSON.stringify(prov.data));
const blog = await api('blog-publish.php', { token: B.token, accountId: A.acct, title: 't', content: 'c' });
check("B cannot publish as A", !blog.ok && blog.status === 403, JSON.stringify(blog.data));
const rev = await api('revenue.php', { action: 'summary', token: B.token, accountId: A.acct, days: 30 });
check("B cannot read A's revenue", !rev.ok, JSON.stringify(rev.data).slice(0, 120));
const revPj = await api('revenue.php', { action: 'summary', token: B.token, accountId: B.acct, days: 30, projectId: pj.data.id });
check("B cannot scope a report to A's project", !revPj.ok, JSON.stringify(revPj.data).slice(0, 120));
const fOv = await api('finders.php', { action: 'overview', token: B.token, accountId: A.acct, projectId: pj.data.id });
check("B cannot read A's daily prospecting", !fOv.ok, JSON.stringify(fOv.data).slice(0, 120));
const fLeads = await api('finders.php', { action: 'prospects', token: B.token, accountId: B.acct, projectId: pj.data.id });
check("B cannot list A's project's leads from B's workspace", !fLeads.ok && !fLeads.data?.rows, JSON.stringify(fLeads.data).slice(0, 120));
const fLeadsA = await api('finders.php', { action: 'prospects', token: B.token, accountId: A.acct, projectId: pj.data.id, status: 'all' });
check("B cannot list A's project's leads naming A's workspace", !fLeadsA.ok && fLeadsA.status === 403, JSON.stringify(fLeadsA.data).slice(0, 120));
const fSave = await api('finders.php', { action: 'save', token: B.token, accountId: B.acct, projectId: pj.data.id, trades: ['dentists'], places: ['Leeds'], perDay: 10 });
check("B cannot start a finder on A's project from B's workspace", !fSave.ok, JSON.stringify(fSave.data).slice(0, 120));
const fRec = await api('finders.php', { action: 'record', token: B.token, accountId: B.acct, projectId: pj.data.id, rows: [{ ref: 'x', name: 'x' }] });
check("B cannot add prospects to A's project", !fRec.ok, JSON.stringify(fRec.data).slice(0, 120));
/* The owner's strategy call (routes/strategyCall.ts) is the install's, not a
   workspace's: a customer reads none of it and changes none of it by id. */
const scList = await api('strategy-call.php', { action: 'list', token: B.token, view: 'upcoming' });
check("B cannot list the owner's strategy calls", scList.status === 403 && !scList.ok, JSON.stringify(scList.data).slice(0, 120));
const scSet = await api('strategy-call.php', { action: 'settings_save', token: B.token, settings: { enabled: true, timezone: 'UTC', notifyEmail: 'b@evil.example' } });
check("B cannot change the strategy call settings", scSet.status === 403 && !scSet.ok, JSON.stringify(scSet.data).slice(0, 120));
const scGet = await api('strategy-call.php', { action: 'settings_get', token: B.token });
check("B cannot read the strategy call settings", scGet.status === 403 && !scGet.ok, JSON.stringify(scGet.data).slice(0, 120));
for (const act of ['note', 'cancel', 'reschedule', 'set_status']) {
  const r = await api('strategy-call.php', { action: act, token: B.token, id: 'sc_anything', note: 'x', status: 'completed', ownerDate: '2030-01-07', ownerTime: '09:00' });
  check(`B cannot ${act} a strategy call by id`, r.status === 403 && !r.ok, JSON.stringify(r.data).slice(0, 120));
}
const scGuest = await api('strategy-call.php', { action: 'manage_get', id: 'sc_anything', key: 'guess' });
check('a guessed strategy-call id and key show nothing', !scGuest.ok && !scGuest.data.booking, JSON.stringify(scGuest.data).slice(0, 120));
/* The lead-to-revenue ledger (routes/leadRevenue.ts): B reaches nothing of A's by naming
   A's workspace or by naming A's ids from B's own; and no customer acts as the owner. */
const lrLead = await api('lead-revenue.php', { action: 'lead_create', token: A.token, accountId: A.acct, lead: { name: 'A homeowner', channel: 'service_ads' } });
const lrPay = await api('lead-revenue.php', { action: 'payment_add', token: A.token, accountId: A.acct, leadId: lrLead.data.lead?.id, kind: 'payment', amount: '100', receivedOn: new Date().toISOString().slice(0, 10) });
check('A can keep its own lead-to-revenue ledger', lrLead.ok && lrPay.ok, JSON.stringify([lrLead.data.error, lrPay.data.error]));
const lrO = await api('lead-revenue.php', { action: 'overview', token: B.token, accountId: A.acct });
check("B cannot read A's jobs and revenue", lrO.status === 403 && !lrO.data.leads, JSON.stringify(lrO.data).slice(0, 120));
for (const [act, extra] of [['lead_get', { id: lrLead.data.lead?.id }], ['lead_update', { id: lrLead.data.lead?.id, patch: { name: 'Forged' } }], ['stage', { id: lrLead.data.lead?.id, to: 'qualified' }],
  ['confirm_completion', { id: lrLead.data.lead?.id, finalAmount: '1' }], ['payment_confirm', { id: lrPay.data.payment?.id }], ['payment_void', { id: lrPay.data.payment?.id, reason: 'forged' }],
  ['payment_add', { leadId: lrLead.data.lead?.id, kind: 'payment', amount: '1', receivedOn: '2026-01-01' }]]) {
  const viaA = await api('lead-revenue.php', { action: act, token: B.token, accountId: A.acct, ...extra });
  const viaB = await api('lead-revenue.php', { action: act, token: B.token, accountId: B.acct, ...extra });
  check(`B cannot ${act} A's ledger by id`, !viaA.ok && viaA.status === 403 && !viaB.ok, JSON.stringify([viaA.data, viaB.data]).slice(0, 160));
}
for (const act of ['customers', 'terms_add', 'agreement_draft', 'statement_compute', 'statement_approve', 'attribution_fix', 'approval_request', 'call_log']) {
  const r = await api('lead-revenue.php', { action: act, token: B.token, accountId: B.acct, id: 'x', effectiveFrom: '2030-01-01', terms: {} });
  check(`B cannot ${act} (owner only)`, r.status === 403 && !r.ok, JSON.stringify(r.data).slice(0, 120));
}
check("A's lead is untouched", d1rows(`SELECT name, stage FROM crm_rev_leads WHERE id = '${lrLead.data.lead?.id}'`)[0]?.name === 'A homeowner');
/* Industry snapshots (routes/snapshots.ts): B installs nothing into A's workspace, reads
   none of A's history, lists nobody's workspaces, and cannot claim A's industry. */
for (const act of ['preview', 'install', 'history']) {
  const r = await api('snapshots.php', { action: act, token: B.token, accountId: A.acct, snapshotId: 'hvac', restore: true });
  check(`B cannot ${act} a snapshot on A's workspace`, r.status === 403 && !r.ok, JSON.stringify(r.data).slice(0, 120));
}
const snW = await api('snapshots.php', { action: 'workspaces', token: B.token });
check('B cannot list every workspace (owner only)', snW.status === 403 && !snW.data.workspaces, JSON.stringify(snW.data).slice(0, 120));
const snBucket = await api('snapshots.php', { action: 'install', token: B.token, accountId: '__agency__', snapshotId: 'hvac' });
check('no snapshot installs into an agency bucket', !snBucket.ok && snBucket.status === 400, JSON.stringify(snBucket.data).slice(0, 120));
check("A's pipelines carry no snapshot B tried to install", !(d1rows(`SELECT v FROM crm_data WHERE account_id = '${A.acct}' AND k = 'crm_pipelines'`)[0]?.v ?? '').includes('snap-hvac'));
/* Medical billing (routes/rcm.ts): a practice's claims, remittances, notes and access log are
   its own and the billing team's; B reaches none of it by naming A's workspace or A's ids, a
   practice login does no billing work, and no customer touches the owner's launch checklist. */
const rcmClaim = `rc_sec_${run}`, rcmNote = `rn_sec_${run}`;
d1rows(`INSERT INTO crm_rcm_claims (id, account_id, claim_no, practice_id, provider_id, payer_id, patient_ref, service_from, service_to, work_status, created_by, created_at, updated_at)
  VALUES ('${rcmClaim}', '${A.acct}', 'C900001', 'p', 'v', 'y', 'SYN-SEC', '2026-10-01', '2026-10-01', 'draft', 'test', '2026-10-01', '2026-10-01')`);
d1rows(`INSERT INTO crm_rcm_notes (id, account_id, claim_id, visibility, kind, body, by_email, by_role, at) VALUES ('${rcmNote}', '${A.acct}', '${rcmClaim}', 'internal', 'note', 'SECRET-INTERNAL', 'owner', 'biller', '2026-10-01')`);
const rcmO = await api('rcm.php', { action: 'overview', token: B.token, accountId: A.acct });
check("B cannot open A's medical billing", rcmO.status === 403 && !rcmO.data.claims, JSON.stringify(rcmO.data).slice(0, 120));
for (const [act, extra] of [['claim_get', { id: rcmClaim }], ['audit', {}], ['remit_get', { id: 'rr_x' }], ['note_add', { claimId: rcmClaim, body: 'forged' }]]) {
  const viaA = await api('rcm.php', { action: act, token: B.token, accountId: A.acct, ...extra });
  const viaB = await api('rcm.php', { action: act, token: B.token, accountId: B.acct, ...extra });
  /* From B's own workspace, B may read B's own (empty) log — but nothing of A's. */
  check(`B cannot ${act} on A's medical billing`, !viaA.ok && viaA.status === 403 && (!viaB.ok || (act === 'audit' && !JSON.stringify(viaB.data).includes(rcmClaim))), JSON.stringify([viaA.data, viaB.data]).slice(0, 160));
}
const rcmOwnA = await api('rcm.php', { action: 'overview', token: A.token, accountId: A.acct });
check("A's own practice portal never carries an internal note", rcmOwnA.ok && !JSON.stringify(rcmOwnA.data).includes('SECRET-INTERNAL'), JSON.stringify(rcmOwnA.data).slice(0, 120));
for (const act of ['claim_update', 'ch_record', 'payer_record', 'remit_import', 'synthetic_purge', 'go_live']) {
  const r = await api('rcm.php', { action: act, token: A.token, accountId: A.acct, id: rcmClaim, to: 'submitted', csv: 'claim_no,code,paid\nC900001,99213,1', claim: {} });
  check(`a practice login cannot ${act} (billing team only)`, r.status === 403 && !r.ok, JSON.stringify(r.data).slice(0, 120));
}
for (const act of ['blockers', 'blocker_set', 'practices_all']) {
  const r = await api('rcm.php', { action: act, token: B.token, key: 'baa_template', done: true, note: 'forged' });
  check(`B cannot ${act} (owner only)`, r.status === 403 && !r.ok, JSON.stringify(r.data).slice(0, 120));
}
check('no launch blocker was signed off by a customer', d1rows("SELECT COUNT(*) AS n FROM crm_rcm_blockers WHERE note = 'forged'")[0]?.n === 0);
const repS = await api('reputation.php', { action: 'status', token: B.token, accountId: A.acct });
check("B cannot read A's review source", !repS.ok, JSON.stringify(repS.data).slice(0, 120));
const repR = await api('reputation.php', { action: 'reviews', token: B.token, accountId: A.acct });
check("B cannot read A's reviews", !repR.ok, JSON.stringify(repR.data).slice(0, 120));
const repSave = await api('reputation.php', { action: 'save_source', token: B.token, accountId: A.acct, placeId: 'ChIJforged', placeName: 'Forged' });
check("B cannot point A's reviews at another business", !repSave.ok, JSON.stringify(repSave.data).slice(0, 120));
/* A pasted link makes the server fetch Google's shortener and spend a Places
   call; on A's workspace that is A's key and A's rate limit. */
const repFind = await api('reputation.php', { action: 'find_place', token: B.token, accountId: A.acct, query: 'https://maps.app.goo.gl/abc' });
check("B cannot resolve a Maps link (or search) on A's workspace", !repFind.ok && repFind.status === 403, JSON.stringify(repFind.data).slice(0, 120));
const repCheck = await api('reputation.php', { action: 'check_now', token: B.token, accountId: A.acct });
check("B cannot make A's workspace read Google", !repCheck.ok && repCheck.status === 403, JSON.stringify(repCheck.data).slice(0, 120));
/* Prospect search spends the owner's Google Maps key on the named workspace's
   budget, so naming A's workspace must be refused before anything is spent. */
const proS = await api('prospects.php', { action: 'search', token: B.token, accountId: A.acct, trade: 'plumber', place: 'Manchester' });
check("B cannot search for prospects on A's workspace (and A's budget)", !proS.ok && proS.status === 403, JSON.stringify(proS.data).slice(0, 120));
const proQ = await api('prospects.php', { action: 'search', token: B.token, accountId: A.acct, query: 'plumber in Leeds' });
check("…nor through the AI Sales Agent's one-line search", !proQ.ok && proQ.status === 403, JSON.stringify(proQ.data).slice(0, 120));
const proSt = await api('prospects.php', { action: 'status', token: B.token, accountId: A.acct });
check("…nor read whether A can search", !proSt.ok && proSt.status === 403, JSON.stringify(proSt.data).slice(0, 120));
const proC = await api('prospects.php', { action: 'contacts', token: B.token, accountId: A.acct, websites: ['https://example.com'] });
check("…nor read websites on A's workspace", !proC.ok && proC.status === 403, JSON.stringify(proC.data).slice(0, 120));
const oldPlaces = await api('places-search.php', { token: B.token, apiKey: 'AIzaFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAK', query: 'plumber' });
check('the old Places proxy that took a key in the body is gone', !oldPlaces.ok && oldPlaces.status === 410, JSON.stringify(oldPlaces.data).slice(0, 120));
const plat = await api('platform.php', { action: 'status', token: B.token });
check("B cannot read the owner's Platform services", !plat.ok && plat.status === 403, JSON.stringify(plat.data).slice(0, 120));

console.log('\nSMS credentials — never in plain text, never back to a browser');
{
  /* A token that is unmistakable in any dump, so a grep for it is the test. */
  const TOKEN = `tok${run}secret0123456789abcdef`;
  const sB = await api('sms-send.php', { action: 'save', token: B.token, accountId: A.acct, accountSid: 'AC' + 'f'.repeat(32), authToken: 'hijack', from: '+15550000000' });
  check("B cannot set A's SMS sender", !sB.ok && sB.status === 403, JSON.stringify(sB.data));
  const gB = await api('sms-send.php', { action: 'get', token: B.token, accountId: A.acct });
  check("B cannot read whether A has an SMS sender", !gB.ok && gB.status === 403, JSON.stringify(gB.data));

  const save = await api('sms-send.php', { action: 'save', token: A.token, accountId: A.acct, accountSid: 'AC' + 'a'.repeat(32), authToken: TOKEN, from: '+15551234567' });
  const got = await api('sms-send.php', { action: 'get', token: A.token, accountId: A.acct });
  check('A saving a sender is answered with "set", never the token', save.ok && got.data.sms?.hasCredentials === true && !JSON.stringify(got.data).includes(TOKEN) && !JSON.stringify(got.data).includes('aaaaaaaa'), JSON.stringify(got.data));
  const stored = d1rows(`SELECT auth_token AS t, verified_at AS v FROM crm_sms_config WHERE account_id = '${A.acct}'`)[0];
  check('…and it is stored encrypted, unverified', !!stored && stored.t.startsWith('v1.') && !stored.t.includes(TOKEN) && stored.v === null, JSON.stringify(stored));
  const badFrom = await api('sms-send.php', { action: 'save', token: A.token, accountId: A.acct, from: '555' });
  check('A bad sending number is refused by name (sms.from)', !badFrom.ok && badFrom.data.field === 'sms.from', JSON.stringify(badFrom.data));

  /* The old client wrote the token into the synced schedule and into the
     booking page's private blob. Both doors take it out now. */
  const LEGACY = `legacy${run}tokenABCDEF`;
  const sched = { title: 'Meet', automations: { confirmEmail: true, twilioSid: 'AC' + 'b'.repeat(32), twilioToken: LEGACY, twilioFrom: '+15557654321' } };
  await api('data.php', { action: 'bulk_set', token: B.token, accountId: B.acct, items: { crm_schedule: JSON.stringify(sched), crm_sms: JSON.stringify({ accountSid: 'AC1', authToken: LEGACY, fromNumber: '' }) } });
  const back = await api('data.php', { action: 'get_all', token: B.token, accountId: B.acct });
  check('A schedule synced with a Twilio token is stored without it', back.ok && !JSON.stringify(back.data).includes(LEGACY) && !('crm_sms' in (back.data.data ?? {})) && JSON.parse(back.data.data?.crm_schedule ?? '{}').automations?.confirmEmail === true, JSON.stringify(back.data).slice(0, 200));
  const adopted = d1rows(`SELECT auth_token AS t, from_number AS f FROM crm_sms_config WHERE account_id = '${B.acct}'`)[0];
  check('…and kept, encrypted, as the sender of a workspace that had none', !!adopted && adopted.t.startsWith('v1.') && adopted.f === '+15557654321', JSON.stringify(adopted));
  const anyPlain = d1rows(`SELECT count(*) AS n FROM crm_data WHERE v LIKE '%${LEGACY}%'`)[0];
  check('…and appears nowhere in crm_data', anyPlain?.n === 0, JSON.stringify(anyPlain));

  /* B's workspace, not A's: "Public surfaces" below needs A to have no booking page. */
  const pub = await api('booking.php', { action: 'publish', token: B.token, accountId: B.acct, public: { slug: `b-${run}`, title: 'B' }, private: { twilio: { sid: 'AC' + 'c'.repeat(32), token: LEGACY, from: '+15550001111' }, automations: { twilioToken: LEGACY, reminderEmail: true } } });
  const priv = d1rows(`SELECT private FROM crm_booking_config WHERE account_id = '${B.acct}'`)[0]?.private ?? '';
  check('Publishing a booking page never stores a Twilio credential', pub.ok && !priv.includes(LEGACY) && !priv.includes('twilio') && priv.includes('reminderEmail'), priv);
  const bStill = d1rows(`SELECT auth_token AS t FROM crm_sms_config WHERE account_id = '${B.acct}'`)[0];
  check('…and an older copy does not replace a sender the workspace already has', !!bStill && bStill.t === adopted?.t, 'sender was overwritten');
  const cfg = await api('booking.php', { action: 'config', slug: `b-${run}` });
  check('…and the public page config carries none of it', cfg.ok && !JSON.stringify(cfg.data).includes(LEGACY), JSON.stringify(cfg.data).slice(0, 160));
}

console.log('\nForms — consent is the visitor\'s to give');
{
  const fr = await api('engagement.php', { action: 'save_form', token: A.token, accountId: A.acct, record: {
    name: `Consent form ${run}`, consentText: 'I agree to be contacted about my enquiry.', status: 'live',
    fields: [{ key: 'email', label: 'Email', type: 'email', required: true }],
  } });
  const slug = fr.data.item?.slug;
  const meta = await api('engage.php', { action: 'form', formSlug: slug });
  check('A form with consent wording says so to the page that renders it', meta.ok && /agree/.test(meta.data.form?.consentText ?? ''), JSON.stringify(meta.data).slice(0, 160));
  const none = await api('engage.php', { action: 'submit', formSlug: slug, answers: { email: `c1-${run}@example.test` } }, { ip: '10.8.0.1' });
  check('A submission without the tick is refused, naming the consent box', !none.ok && none.status === 422 && none.data.code === 'consent' && none.data.field === 'consent', JSON.stringify(none.data));
  const truthy = await api('engage.php', { action: 'submit', formSlug: slug, answers: { email: `c2-${run}@example.test` }, consent: 'yes' }, { ip: '10.8.0.2' });
  check('…and so is anything but a literal true', !truthy.ok && truthy.data.code === 'consent', JSON.stringify(truthy.data));
  const given = await api('engage.php', { action: 'submit', formSlug: slug, answers: { email: `c3-${run}@example.test` }, consent: true }, { ip: '10.8.0.3' });
  check('…and one with it is taken', given.ok, JSON.stringify(given.data));
}

console.log("\nOverwriting A's records by id");
const bpf = await api('projects.php', { action: 'save_portfolio', token: B.token, accountId: B.acct, name: 'B Co', profile: {} });
const hijackProject = await api('projects.php', {
  action: 'save_project', token: B.token, accountId: B.acct, id: pj.data.id, name: 'pwned', objective: 'take over their guardrails', portfolioId: bpf.data.id,
  guardrails: { sending: 'on' },
});
const stillA = d1rows(`SELECT name, account_id AS a FROM crm_projects WHERE id = '${pj.data.id}'`)[0];
check("B cannot overwrite A's project by id", !hijackProject.ok && stillA?.name === 'A project' && stillA?.a === A.acct, JSON.stringify([hijackProject.data, stillA]));
{
  /* The board's order is a list of ids: one of A's in B's list is refused
     whole, and A's project keeps its place. */
  const posBefore = d1rows(`SELECT position FROM crm_projects WHERE id = '${pj.data.id}'`)[0]?.position;
  const reorder = await api('projects.php', { action: 'reorder_projects', token: B.token, accountId: B.acct, ids: [pj.data.id] });
  const posAfter = d1rows(`SELECT position, account_id AS a FROM crm_projects WHERE id = '${pj.data.id}'`)[0];
  check("B cannot reorder A's project into its own list", !reorder.ok && reorder.status === 403 && posAfter?.position === posBefore && posAfter?.a === A.acct, JSON.stringify([reorder.data, posBefore, posAfter]));
  const reorderA = await api('projects.php', { action: 'reorder_projects', token: B.token, accountId: A.acct, ids: [pj.data.id] });
  check("B cannot reorder A's workspace", !reorderA.ok, JSON.stringify(reorderA.data));
}
{
  /* Plan allowances (routes/allowances.ts): a project id is checked against
     the workspace named, a workspace against the session, and only the
     install owner changes what a plan allows. */
  const peek = await api('allowances.php', { action: 'check', token: B.token, accountId: B.acct, meter: 'workflows_per_project', projectId: pj.data.id });
  check("B cannot ask about A's project by id", !peek.ok && peek.data.code === 'not_found', JSON.stringify(peek.data));
  const usage = await api('allowances.php', { action: 'status', token: B.token, accountId: A.acct });
  check("B cannot read A's usage", !usage.ok && usage.status === 403, JSON.stringify(usage.data));
  const raise = await api('allowances.php', { action: 'set_limits', token: B.token, planId: 'trial', limits: { autopilot_projects: -1 } });
  const raised = d1rows("SELECT COUNT(*) AS n FROM crm_plan_limits WHERE plan_id = 'trial' AND meter = 'autopilot_projects' AND value = -1")[0];
  const grantSelf = await api('allowances.php', { action: 'grant_plan', token: B.token, email: B.email ?? '', planId: 'custom' });
  const reads = await api('allowances.php', { action: 'enquiries', token: B.token });
  check('A customer cannot give themselves a plan or read enquiries', !grantSelf.ok && grantSelf.data.code === 'not_owner' && !reads.ok && reads.data.code === 'not_owner', JSON.stringify([grantSelf.data, reads.data]));
  check('A customer cannot change what a plan allows', !raise.ok && raise.data.code === 'not_owner' && Number(raised?.n) === 0, JSON.stringify([raise.data, raised]));
}
if (productId) {
  const hijackProduct = await api('commerce.php', { action: 'save_product', token: B.token, accountId: B.acct, id: productId, name: 'defaced', priceCents: 1, status: 'active' });
  const p = d1rows(`SELECT name, price_cents AS price FROM crm_products WHERE id = '${productId}'`)[0];
  check("B cannot reprice A's product by id", !hijackProduct.ok && p?.name === 'A boiler', JSON.stringify([hijackProduct.data, p]));
}
const hijackPortfolio = await api('projects.php', { action: 'save_portfolio', token: B.token, accountId: B.acct, id: pf.data.id, name: 'pwned', profile: {} });
check("B cannot overwrite A's portfolio by id", !hijackPortfolio.ok, JSON.stringify(hijackPortfolio.data));

/* The booking page's photo, logo and clip (routes/bookingMedia.ts). */
{
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const put = (tok, acct, kind, bytes) => fetch(`${BASE}/api/booking-media.php?action=upload&kind=${kind}&accountId=${acct}`, {
    method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/octet-stream', Connection: 'close' }, body: bytes,
  }).then(r => r.json().then(j => ({ status: r.status, data: j })));
  const intoA = await put(B.token, A.acct, 'photo', PNG);
  check("B cannot upload a picture into A's booking page", !intoA.data.success && intoA.status === 403, JSON.stringify(intoA.data));
  const clearA = await api('booking-media.php', { action: 'clear', token: B.token, accountId: A.acct, kind: 'photo' });
  check("B cannot remove A's booking picture", !clearA.ok && clearA.status === 403, JSON.stringify(clearA.data));
  const slugA = await api('booking.php', { action: 'slug_check', token: B.token, accountId: A.acct, slug: 'anything-here' });
  check("B cannot ask about addresses as A's workspace", !slugA.ok && slugA.status === 403, JSON.stringify(slugA.data));
  const svg = await put(B.token, B.acct, 'logo', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
  check('An SVG cannot be uploaded as a booking logo', !svg.data.success, JSON.stringify(svg.data));
  /* A's own upload, which B then names in B's own page: the address is dropped. */
  const mine = await put(A.token, A.acct, 'photo', PNG);
  const borrow = await api('booking.php', { action: 'publish', token: B.token, accountId: B.acct, public: { slug: `b-${run}`, title: 'B', photoUrl: mine.data.url } });
  const bCfg = await api('booking.php', { action: 'config', slug: `b-${run}` });
  check("B's page cannot show A's uploaded photo", mine.data.success && borrow.ok && !bCfg.data.config?.photoUrl, JSON.stringify([mine.data, bCfg.data.config?.photoUrl]));
  if (mine.data.url) await api('booking-media.php', { action: 'clear', token: A.token, accountId: A.acct, kind: 'photo' });
  /* Filling a page in from a website: a server-side read, so it is the workspace's and fenced. */
  const fillA = await api('booking.php', { action: 'autofill', token: B.token, accountId: A.acct, url: 'https://example.com/' });
  check("B cannot read a website into A's booking page", !fillA.ok && fillA.status === 403, JSON.stringify(fillA.data));
  const anon = await api('booking.php', { action: 'autofill', accountId: B.acct, url: 'https://example.com/' });
  check('Reading a website for a booking page needs a session', !anon.ok && anon.status === 401, JSON.stringify(anon.data));
  for (const inside of ['http://127.0.0.1:8787/', 'http://169.254.169.254/latest/meta-data/', 'http://localhost/', 'file:///etc/passwd']) {
    const r = await api('booking.php', { action: 'autofill', token: B.token, accountId: B.acct, url: inside });
    check(`The booking page's website read refuses ${inside}`, !r.ok && r.data.field === 'booking.website', JSON.stringify(r.data));
  }
  /* What a page says is cleaned on publish: points' icons from the list, the colour a hex. */
  await api('booking.php', { action: 'publish', token: B.token, accountId: B.acct, public: { slug: `b-${run}`, title: 'B', accent: 'red;background:url(//x)', points: [{ icon: '"><script>', title: '<b>x</b>' }] } });
  const bClean = (await api('booking.php', { action: 'config', slug: `b-${run}` })).data.config ?? {};
  check('A booking page keeps only a hex colour and a listed icon', bClean.accent === '' && bClean.points?.[0]?.icon === 'check', JSON.stringify([bClean.accent, bClean.points]));
  /* A testimonial's photo is an upload like the others: B cannot put A's on B's page, nor upload into A's. */
  const aQuote = await put(A.token, A.acct, 'testimonial', PNG);
  const bQuote = await put(B.token, A.acct, 'testimonial', PNG);
  check("B cannot upload a testimonial photo into A's booking page", !bQuote.data.success && bQuote.status === 403, JSON.stringify(bQuote.data));
  await api('booking.php', { action: 'publish', token: B.token, accountId: B.acct, public: { slug: `b-${run}`, title: 'B', theme: '</style><script>', testimonial: { quote: 'Great work', name: 'Pat', photoUrl: aQuote.data.url } } });
  const bQ = (await api('booking.php', { action: 'config', slug: `b-${run}` })).data.config ?? {};
  check("B's page cannot show A's testimonial photo, and keeps only a known theme", aQuote.data.success && bQ.testimonial?.name === 'Pat' && bQ.testimonial?.photoUrl === '' && bQ.theme === '', JSON.stringify([bQ.testimonial, bQ.theme]));
  if (aQuote.data.url) await api('booking-media.php', { action: 'clear', token: A.token, accountId: A.acct, kind: 'testimonial' });
}

console.log('\nPublic surfaces');
const book =await api('booking.php', { action: 'create', accountId: A.acct, slotDate: '2031-01-02', slotTime: '10:00', guestEmail: 'v@example.test', guestName: 'Spam' });
check('Anyone cannot book into a workspace with no booking page', !book.ok, JSON.stringify(book.data));
const co = await api('stripe-checkout.php', { token: B.token, accountId: B.acct, amount: 0.01 });
check('Legacy checkout no longer takes a price from the request', !co.ok, JSON.stringify(co.data));
const portal = await api('stripe-portal.php', { token: B.token, accountId: A.acct, customerId: 'cus_abc' });
check("B cannot open A's billing portal", !portal.ok, JSON.stringify(portal.data));
const diag = await api('diagnostics.php', { token: B.token });
check('A customer cannot read install-wide diagnostics', !diag.ok && diag.status === 403, JSON.stringify(diag.data).slice(0, 100));
const unsub = await fetch(`${BASE}/api/unsubscribe.php?sign=1&a=${A.acct}&e=x@example.test`, { headers: { Authorization: `Bearer ${B.token}` } });
check("B cannot sign opt-outs for A's contacts", unsub.status === 403, String(unsub.status));
const click = await fetch(`${BASE}/api/track.php?c=e1&a=${A.acct}&u=${encodeURIComponent('https://evil.example/login')}`, { redirect: 'manual' });
check('An unsigned tracked link does not redirect', click.status === 200 && !click.headers.get('location'), `${click.status} ${click.headers.get('location')}`);

console.log("\nLive help — B against A's screen-sharing sessions");
{
  const w = await api('engagement.php', { action: 'save_widget', token: A.token, accountId: A.acct, record: { name: 'A help', features: ['screen'], status: 'live', inApp: true } });
  const key = w.data.item?.public_key;
  const st = await api('engage.php', { action: 'live_start', widgetKey: key, name: 'Visitor' }, { ip: '10.7.0.1' });
  const sid = st.data.sessionId;
  await api('engage.php', { action: 'live_offer', sessionId: sid, shareKey: st.data.shareKey, sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n' }, { ip: '10.7.0.1' });
  const peek = await api('engagement.php', { action: 'live_session', token: B.token, accountId: B.acct, id: sid });
  check("B cannot read A's live session by id", !peek.ok && peek.status === 404, JSON.stringify(peek.data));
  const join = await api('engagement.php', { action: 'live_answer', token: B.token, accountId: B.acct, id: sid, sdp: 'v=0\r\no=- 9 2 IN IP4 127.0.0.1\r\ns=-\r\n' });
  const after = d1rows(`SELECT status, answer FROM crm_live_sessions WHERE id = '${sid}'`)[0];
  check("B cannot join A's live session by id", !join.ok && after?.status === 'waiting' && after?.answer === '', JSON.stringify([join.data, after]));
  const named = await api('engagement.php', { action: 'live_sessions', token: B.token, accountId: A.acct });
  check("B cannot list A's live sessions by naming the workspace", !named.ok && named.status === 403, JSON.stringify(named.data).slice(0, 120));
  const poll = await api('engage.php', { action: 'live_poll', sessionId: sid, shareKey: 'a'.repeat(36) }, { ip: '10.7.0.2' });
  check('A session id without its share key reads nothing', poll.status === 404, JSON.stringify(poll.data));
  const house = await api('engage.php', { action: 'house' });
  check("A customer's widget cannot become the app's own help button", house.data.widgetKey !== key, 'house key is a tenant widget');
  await api('engagement.php', { action: 'live_end', token: A.token, accountId: A.acct, id: sid });

  /* "Call us now": the same table, and Decline is a new route taking an id. */
  const cw = await api('engagement.php', { action: 'save_widget', token: A.token, accountId: A.acct, record: { name: 'A calls', features: ['voice'], status: 'live' } });
  const cs = await api('engage.php', { action: 'live_start', kind: 'voice', widgetKey: cw.data.item?.public_key, name: 'Caller' }, { ip: '10.7.0.3' });
  const decline = await api('engagement.php', { action: 'live_decline', token: B.token, accountId: B.acct, id: cs.data.sessionId });
  const ringing = d1rows(`SELECT status FROM crm_live_sessions WHERE id = '${cs.data.sessionId}'`)[0];
  check("B cannot decline A's incoming call by id", !decline.ok && ringing?.status === 'waiting', JSON.stringify([decline.data, ringing]));
  const calls = await api('engagement.php', { action: 'live_waiting', token: B.token, accountId: B.acct });
  check("B's incoming-call check never lists A's calls", !JSON.stringify(calls.data).includes(cs.data.sessionId), JSON.stringify(calls.data).slice(0, 160));
  await api('engagement.php', { action: 'live_decline', token: A.token, accountId: A.acct, id: cs.data.sessionId });

  /* The widget's photo: set by id, served by a random key. */
  const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
  const setB = await api('engagement.php', { action: 'widget_avatar', token: B.token, accountId: B.acct, id: cw.data.item?.id, image: tiny });
  const keyRow = d1rows(`SELECT agent_avatar_key AS k FROM crm_widgets WHERE id = '${cw.data.item?.id}'`)[0];
  check("B cannot set the photo on A's widget by id", !setB.ok && setB.status === 404 && !keyRow?.k, JSON.stringify([setB.data, keyRow]));
  const setA = await api('engagement.php', { action: 'widget_avatar', token: A.token, accountId: A.acct, id: cw.data.item?.id, image: tiny });
  const clearB = await api('engagement.php', { action: 'widget_avatar', token: B.token, accountId: B.acct, id: cw.data.item?.id, image: '' });
  const stillThere = await fetch(`${BASE}/api/widget-avatar.php?k=${setA.data.key}`);
  check("B cannot remove the photo on A's widget by id", setA.ok && !clearB.ok && stillThere.status === 200, JSON.stringify([setA.data, clearB.data, stillThere.status]));
  const html = await api('engagement.php', { action: 'widget_avatar', token: A.token, accountId: A.acct, id: cw.data.item?.id, image: `data:image/png;base64,${Buffer.from('<html><script>alert(1)</script>').toString('base64')}` });
  check('A page posing as a PNG is never stored as a photo', !html.ok && html.status === 422, JSON.stringify(html.data));
  await api('engagement.php', { action: 'delete_widget', token: A.token, accountId: A.acct, id: cw.data.item?.id });
  const afterDelete = await fetch(`${BASE}/api/widget-avatar.php?k=${setA.data.key}`);
  check("A deleted widget's photo stops being served", afterDelete.status === 404, String(afterDelete.status));
}

console.log("\nChat — B against A's conversations and the pictures in them");
{
  const w = await api('engagement.php', { action: 'save_widget', token: A.token, accountId: A.acct, record: { name: 'A chat', features: ['chat'], status: 'live' } });
  const key = w.data.item?.public_key;
  const st = await api('engage.php', { action: 'start', widgetKey: key }, { ip: '10.6.0.1' });
  const conv = st.data.conversationId;
  /* A real (tiny) PNG: the server sniffs the bytes, not the label. */
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const att = await api('engage.php', { action: 'attach', conversationId: conv, visitorKey: st.data.visitorKey, image: png }, { ip: '10.6.0.1' });
  const fileId = att.data.message?.attachments?.[0]?.id;
  check('A visitor can attach a picture to their own conversation', att.ok && !!fileId, JSON.stringify(att.data).slice(0, 120));
  const own = await fetch(`${BASE}/api/engagement.php`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close' }, body: JSON.stringify({ action: 'file', token: A.token, accountId: A.acct, fileId }) });
  check("A reads the picture in A's own inbox", own.status === 200 && (own.headers.get('content-type') ?? '').startsWith('image/png'), String(own.status));
  const peek = await api('engagement.php', { action: 'file', token: B.token, accountId: B.acct, fileId });
  check("B cannot read A's chat picture by id", peek.status === 404, `${peek.status} ${JSON.stringify(peek.data).slice(0, 80)}`);
  const named = await api('engagement.php', { action: 'file', token: B.token, accountId: A.acct, fileId });
  check("B cannot read it by naming A's workspace", named.status === 403, String(named.status));
  const st2 = await api('engage.php', { action: 'start', widgetKey: key }, { ip: '10.6.0.2' });
  const viaOther = await api('engage.php', { action: 'file', conversationId: st2.data.conversationId, visitorKey: st2.data.visitorKey, fileId }, { ip: '10.6.0.2' });
  check("Another visitor, with their own valid key, cannot fetch it", viaOther.status === 404, String(viaOther.status));
  const wrong = await api('engage.php', { action: 'file', conversationId: conv, visitorKey: st2.data.visitorKey, fileId }, { ip: '10.6.0.2' });
  check('Nor by pairing the conversation with somebody else\'s key', wrong.status === 404, String(wrong.status));
  const into = await api('engage.php', { action: 'attach', conversationId: conv, visitorKey: st2.data.visitorKey, image: png }, { ip: '10.6.0.2' });
  check("Nor put a picture into A's visitor's conversation", into.status === 404, String(into.status));
  const sync = await api('engagement.php', { action: 'inbox_sync', token: B.token, accountId: B.acct, since: '2000-01-01T00:00:00Z', conversationId: conv, msgSince: '2000-01-01T00:00:00Z' });
  check("B's inbox sync sees none of A's conversations or messages by id",
    sync.ok && sync.data.conversations.length === 0 && sync.data.messages.length === 0 && !sync.data.thread, JSON.stringify(sync.data).slice(0, 120));
  const syncNamed = await api('engagement.php', { action: 'inbox_sync', token: B.token, accountId: A.acct, since: '2000-01-01T00:00:00Z' });
  check("B cannot sync A's inbox by naming the workspace", syncNamed.status === 403, String(syncNamed.status));
  const reply = await api('engagement.php', { action: 'reply', token: B.token, accountId: B.acct, conversationId: conv, message: 'hi', image: png });
  check("B cannot reply (with a picture) into A's conversation", reply.status === 404 && d1rows(`SELECT count(*) AS n FROM crm_chat_files WHERE conversation_id = '${conv}'`)[0]?.n === 1, String(reply.status));
  const waiting = await api('engagement.php', { action: 'support_waiting', token: B.token, accountId: A.acct });
  check("B cannot read A's support queue", waiting.status === 403, String(waiting.status));
}

console.log('\nSessions and passwords');
const row = d1rows(`SELECT token FROM crm_sessions WHERE email = '${A.email}' ORDER BY created_at DESC LIMIT 1`)[0];
check('Sessions are stored as a hash, not the token', !!row && row.token.startsWith('h:') && row.token !== A.token, row?.token?.slice(0, 6));
const noCurrent = await api('auth.php', { action: 'set_password', token: A.token, email: A.email, password: 'Another-pass-22' });
check('Changing your own password needs the current one', !noCurrent.ok, JSON.stringify(noCurrent.data));
const withCurrent = await api('auth.php', { action: 'set_password', token: A.token, email: A.email, password: 'Another-pass-22', currentPassword: pw });
check('…and works with it', withCurrent.ok, JSON.stringify(withCurrent.data));

let blocked = false;
for (let i = 0; i < 12; i++) {
  const r = await api('auth.php', { action: 'login', email: B.email, password: `wrong-${i}` }, { ip: `10.9.${i}.1` });
  if (r.status === 429) { blocked = true; break; }
}
check('Repeated wrong passwords for one account are cut off', blocked);
const right = await api('auth.php', { action: 'login', email: B.email, password: pw }, { ip: '10.9.99.1' });
check('…including the right one, until the window passes', right.status === 429, String(right.status));

const events = d1rows(`SELECT kind FROM crm_audit_events WHERE actor_email = '${B.email}'`).map(e => e.kind);
check('Failed sign-ins are in the audit log', events.includes('login_failed'), events.join(','));

const out = await api('auth.php', { action: 'logout', token: A.token });
const after = await api('auth.php', { action: 'me', token: A.token });
check('Logout ends the session', out.ok && !after.ok, JSON.stringify(after.data));

console.log('\nTwo-step sign-in');
const A2 = await api('auth.php', { action: 'login', email: A.email, password: 'Another-pass-22' }, { ip: '10.3.0.1' });
const t = A2.data.token;
const begin = await api('security.php', { action: 'mfa_begin', token: t });
if (begin.ok) {
  const secret = begin.data.secret;
  const code = totp(secret);
  const on = await api('security.php', { action: 'mfa_enable', token: t, code });
  check('2-step can be switched on with a correct code', on.ok, JSON.stringify(on.data));
  const first = await api('auth.php', { action: 'login', email: A.email, password: 'Another-pass-22' }, { ip: '10.3.0.2' });
  check('A correct password then asks for the code, with no session yet', first.data.mfaRequired && !first.data.token, JSON.stringify(first.data).slice(0, 120));
  const wrong = await api('auth.php', { action: 'login_mfa', ticket: first.data.ticket, code: '000000' });
  check('A wrong code is refused', !wrong.ok, JSON.stringify(wrong.data));
  const good = await api('auth.php', { action: 'login_mfa', ticket: first.data.ticket, code: totp(secret) });
  check('The right code signs in', good.ok && !!good.data.token, JSON.stringify(good.data).slice(0, 120));
} else {
  check('security.php mfa_begin answers', false, JSON.stringify(begin.data));
}

console.log(`\n${passes} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);

/* RFC 6238, as an authenticator app computes it. */
function totp(secret, at = Date.now()) {
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0; let value = 0; const bytes = [];
  for (const ch of secret.replace(/=+$/, '')) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const mac = crypto.createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const off = mac[mac.length - 1] & 15;
  const n = ((mac[off] & 127) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(n % 1_000_000).padStart(6, '0');
}
