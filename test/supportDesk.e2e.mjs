/**
 * The owner's support desk, end to end, against the real Worker, a fresh D1
 * and an SMTP sink (2026-11-25):
 *
 *  - who is online (heartbeat) and the owner's alert for it;
 *  - a direct message both ways: owner → customer's corner card (+ email),
 *    customer's reply → the owner's support inbox, owner's inbox reply → card;
 *  - access to a customer's workspace ONLY with their permission: refused
 *    before, the email link's GET changes nothing, its POST approves, the gate
 *    opens, the customer ends it, the gate shuts, "access has ended" is emailed
 *    once; approved in the app and then run out by the clock shuts the gate
 *    before the cron has marked it; nobody else can answer the request;
 *  - a read-only review needs a reason, is recorded, and returns a snapshot;
 *  - emails to customers by plan: queued, sent by the cron with an
 *    unsubscribe on marketing, the unsubscribe holds for the next one;
 *  - the unread-reply reminder: two hours after a person's reply nobody read,
 *    one email with a preview; not again; not when it was seen;
 *  - every owner action is refused to a customer.
 *
 *   npm run test:supportdesk
 *
 * Self-contained: SMTP sink on 127.0.0.1:8863, wrangler dev --test-scheduled
 * on :8861 over a temporary D1. API only — no build needed.
 */
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';

const PORT = 8861, SINK = 8863;
const B = `http://localhost:${PORT}`;
let fail = 0;
const ok = (name, cond, detail = '') => { if (!cond) fail++; console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ` — ${String(detail).slice(0, 400)}`}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readable = m => m.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  + Buffer.from((m.split(/\r?\n\r?\n/).slice(1).join('\n').match(/^[A-Za-z0-9+/=]+$/gm) ?? []).join(''), 'base64').toString('utf8');

const mail = [];
const sink = net.createServer(sock => {
  sock.on('error', () => {});
  let data = false, buf = [], pending = '', loginStep = 0;
  const w = s => sock.write(`${s}\r\n`);
  w('220 sink');
  sock.on('data', chunk => {
    pending += chunk.toString('utf8');
    let i;
    while ((i = pending.indexOf('\r\n')) >= 0) {
      const line = pending.slice(0, i); pending = pending.slice(i + 2);
      if (data) { if (line === '.') { data = false; mail.push(readable(buf.join('\n'))); buf = []; w('250 queued'); } else buf.push(line); continue; }
      if (loginStep === 1) { loginStep = 2; w('334 UGFzc3dvcmQ6'); continue; }
      if (loginStep === 2) { loginStep = 0; w('235 ok'); continue; }
      const up = line.toUpperCase();
      if (up.startsWith('EHLO') || up.startsWith('HELO')) sock.write('250-sink\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n');
      else if (up.startsWith('AUTH LOGIN')) { loginStep = 1; w('334 VXNlcm5hbWU6'); }
      else if (up.startsWith('AUTH PLAIN')) w('235 ok');
      else if (up === 'DATA') { data = true; w('354 go'); }
      else if (up === 'QUIT') { w('221 bye'); sock.end(); }
      else w('250 ok');
    }
  });
});
await new Promise(r => sink.listen(SINK, '127.0.0.1', r));

const persist = process.env.PERSIST || fs.mkdtempSync(path.join(os.tmpdir(), 'desk-d1-'));
const sql = q => JSON.parse(execSync(`npx wrangler d1 execute crmpro --local --persist-to ${persist} --json --command ${JSON.stringify(q.replace(/\s+/g, ' '))}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
const wr = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--persist-to', persist, '--test-scheduled', '--var', `APP_ORIGIN:${B}`], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
let wlog = '';
wr.stdout.on('data', c => { wlog += c; }); wr.stderr.on('data', c => { wlog += c; });
const stop = () => { try { process.kill(-wr.pid, 'SIGTERM'); } catch { /* gone */ } sink.close(); };
process.on('exit', stop);
process.on('uncaughtException', e => { console.log(e, wlog.slice(-1500)); stop(); process.exit(1); });
for (let i = 0; i < 90; i++) { try { const r = await fetch(`${B}/api/data.php`, { method: 'POST', headers: { Connection: 'close' }, body: '{"action":"ping"}' }); if (r.ok) break; } catch { /* starting */ } await sleep(1000); }

let ipN = 1;
const api = (p, body) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.9.6.${ipN++ % 250}` }, body: JSON.stringify(body) }).then(r => r.json().catch(() => ({})));
const desk = (token, action, extra = {}) => api('support-desk.php', { token, action, ...extra });
const tick = async () => { for (let i = 0; i < 3; i++) { try { await fetch(`${B}/cdn-cgi/handler/scheduled`, { headers: { Connection: 'close' } }); break; } catch { await sleep(1000); } } await sleep(3500); };
const waitMail = async (test, ms = 20_000) => { const end = Date.now() + ms; while (Date.now() < end) { const m = mail.find(test); if (m) return m; await sleep(400); } return null; };

/* ── People ── */
const OWNER = 'owner@desk.test', PW = 'Tq9!vX2#pLm7wZ-desk';
const boot = await api('auth.php', { action: 'bootstrap', email: OWNER, password: PW, name: 'Olive Owner' });
if (!boot.success) { console.log('bootstrap failed', boot, wlog.slice(-2000)); stop(); process.exit(2); }
const A = 'acct-desk-owner';
sql(`INSERT INTO crm_workspaces (account_id, owner_email, created_at) VALUES ('${A}', '${OWNER}', '2026-11-01T00:00:00Z')`);
const T = (await api('auth.php', { action: 'login', email: OWNER, password: PW })).token;

/* Customers sign up before the owner's mailbox exists, so no code is needed. */
const signUp = async (tag) => {
  const email = `${tag}@cust.test`;
  const r = await api('auth.php', { action: 'register', email, name: `Cara ${tag}`, password: `Zx8#${tag}-Plm-2026q` });
  if (!r.success) throw new Error(`sign up ${tag}: ${JSON.stringify(r)}`);
  return { email, token: r.token, acct: r.user.accountId };
};
const C = await signUp('cara');
const D = await signUp('dan');
/* The customer's workspace holds something, as a real one does. */
await api('data.php', { token: C.token, accountId: C.acct, action: 'put', key: 'crm_contacts', value: JSON.stringify([{ name: 'Pat Lead', email: 'pat@lead.test', status: 'new' }]) });

let r = await api('mailbox.php', { token: T, accountId: A, action: 'save', label: 'Support', smtp: { host: '127.0.0.1', port: SINK, encryption: 'none', username: 'u', password: 'p' }, from: { email: 'support@desk.test', name: 'Protected Central' } });
ok('the owner connects a mailbox', r.success, JSON.stringify(r));
/* As if "Save & validate" passed: the install mailbox is only one that has. */
sql(`UPDATE crm_mailbox_accounts SET out_verified_at = '${new Date().toISOString()}' WHERE account_id = '${A}'`);

console.log('\nOwner only');
for (const a of ['customers', 'broadcast_send', 'direct', 'access_request', 'review', 'access_list', 'pulse']) {
  r = await desk(C.token, a, { email: D.email, reason: 'x', message: 'x', subject: 'x', body: 'x', audience: ['trial'], hours: 1 });
  ok(`a customer cannot ${a}`, !r.success && /install owner/.test(r.error ?? ''), JSON.stringify(r));
}

console.log('\nOnline');
r = await desk(T, 'pulse');
const cursor = r.cursor;
r = await desk(T, 'customers');
let cara = r.customers?.find(x => x.email === C.email);
ok('the owner sees the customer, on trial, offline', cara && cara.segment === 'trial' && cara.online === false, JSON.stringify(cara));
r = await desk(C.token, 'heartbeat', { path: '/autopilot', app: 'web' });
ok('the customer\'s page beats', r.success, JSON.stringify(r));
r = await desk(T, 'customers');
cara = r.customers?.find(x => x.email === C.email);
ok('and now shows online, on the screen they are on', cara?.online === true && cara.onlinePath === '/autopilot', JSON.stringify(cara));
r = await desk(T, 'pulse', { since: cursor });
ok('the owner is alerted that they came online', (r.alerts ?? []).some(a => a.kind === 'customer.online' && a.email === C.email), JSON.stringify(r));
await desk(C.token, 'heartbeat', { path: '/contacts' });
r = await desk(T, 'pulse', { since: cursor });
ok('once per visit, not per beat', (r.alerts ?? []).filter(a => a.kind === 'customer.online').length === 1, JSON.stringify(r.alerts));

console.log('\nDirect messages');
r = await desk(T, 'direct', { email: C.email, message: 'Hi Cara — want a hand connecting your mailbox?', emailToo: true });
ok('the owner messages the customer', r.success && r.emailed === 'sent', JSON.stringify(r));
const convId = r.conversationId;
let mine = await api('customers.php', { token: C.token, action: 'mine' });
const dn = (mine.notices ?? []).find(n => n.kind === 'direct');
ok('it is in the customer\'s corner card', !!dn && /connecting your mailbox/.test(dn.body), JSON.stringify(mine.notices));
ok('and in their inbox', !!(await waitMail(m => /To: .*cara@cust\.test/i.test(m) && /sent you a message/.test(m))));
r = await desk(C.token, 'notice_reply', { id: dn.id, message: 'Yes please, I am stuck on the password' });
ok('the customer answers from the card', r.success, JSON.stringify(r));
let conv = sql(`SELECT channel, needs_human_since AS w, account_id AS a FROM crm_conversations WHERE id = '${convId}'`)[0];
ok('the answer waits in the owner\'s support inbox', conv?.channel === 'direct' && !!conv.w && conv.a === A, JSON.stringify(conv));
r = await desk(D.token, 'notice_reply', { id: dn.id, message: 'not mine' });
ok('another customer cannot answer it', !r.success, JSON.stringify(r));
r = await api('engagement.php', { token: T, accountId: A, action: 'reply', conversationId: convId, message: 'Use an app password — I will show you.' });
mine = await api('customers.php', { token: C.token, action: 'mine' });
ok('the owner\'s inbox reply reaches the customer\'s card', r.success && (mine.notices ?? []).some(n => n.kind === 'direct' && /app password/.test(n.body)), JSON.stringify([r, mine.notices]));
r = await desk(T, 'offer_call', { email: C.email });
ok('a call offer without a connected calendar says so', !r.success && r.code === 'no-calendar', JSON.stringify(r));

console.log('\nAccess with permission');
const getAll = () => api('data.php', { token: T, accountId: C.acct, action: 'get_all' });
r = await getAll();
ok('the owner cannot open a customer\'s workspace without permission', !r.success, JSON.stringify(r).slice(0, 160));
r = await desk(T, 'access_request', { email: C.email, hours: 2 });
ok('a request needs a reason', !r.success && r.field === 'ac.reason', JSON.stringify(r));
r = await desk(T, 'access_request', { email: C.email, hours: 3, reason: 'x' });
ok('and an allowed length', !r.success && r.field === 'ac.hours', JSON.stringify(r));
r = await desk(T, 'access_request', { email: C.email, hours: 2, reason: 'Connect your mailbox and build the first campaign' });
ok('the owner asks for two hours', r.success && r.emailed === 'sent', JSON.stringify(r));
const reqId = r.id;
const ask = await waitMail(m => /asking for access to your account/.test(m) && /cara@cust\.test/i.test(m));
const link = ask?.match(/https?:\/\/[^\s"<]+support-consent\.php\?t=[a-f0-9]{64}/)?.[0];
ok('the customer is emailed a link', !!link, ask?.slice(0, 400));
r = await getAll();
ok('still refused while it waits', !r.success);
let page = await fetch(`${link}&a=approve`, { headers: { Connection: 'close' } }).then(x => x.text());
ok('opening the link only shows a page', /Approve for 2 hours/.test(page) && sql(`SELECT status FROM crm_support_access WHERE id = '${reqId}'`)[0].status === 'pending', page.slice(0, 300));
r = await desk(D.token, 'access_decide', { id: reqId, approve: true });
ok('another customer cannot approve it', !r.success, JSON.stringify(r));
page = await fetch(link, { method: 'POST', headers: { Connection: 'close', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'go=approve' }).then(x => x.text());
ok('pressing Approve approves', /Access approved/.test(page), page.slice(0, 300));
r = await getAll();
ok('now the owner can open it', r.success && JSON.stringify(r.data).includes('Pat Lead'), JSON.stringify(r).slice(0, 200));
ok('the customer is emailed that access started, with a way to end it', !!(await waitMail(m => /Support now has access/.test(m) && /End access now/.test(m))));
r = await desk(C.token, 'heartbeat', { path: '/' });
ok('the customer\'s app knows access is on', r.access?.status === 'active' && !!r.access.expiresAt, JSON.stringify(r));
r = await desk(T, 'access_open', { id: reqId });
ok('the owner is given the workspace to switch into', r.success && r.mainAccountId === C.acct, JSON.stringify(r));
r = await api('data.php', { token: T, accountId: D.acct, action: 'get_all' });
ok('but not anybody else\'s', !r.success);
page = await fetch(link, { method: 'POST', headers: { Connection: 'close', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'go=approve' }).then(x => x.text());
ok('the link cannot be used twice', /already been answered/.test(page));
r = await desk(C.token, 'access_revoke', { id: reqId });
ok('the customer ends it', r.success, JSON.stringify(r));
r = await getAll();
ok('and the gate shuts at once', !r.success);
await tick();
const ended = mail.filter(m => /Support access has ended/.test(m) && /cara@cust\.test/i.test(m));
ok('"access has ended" is emailed once', ended.length === 1 && /You ended it/.test(ended[0]), ended.length);

r = await desk(T, 'access_request', { email: C.email, hours: 1, reason: 'Check the campaign' });
const req2 = r.id;
mine = await api('customers.php', { token: C.token, action: 'mine' });
const an = (mine.notices ?? []).find(n => n.kind === 'access' && n.ref === req2);
ok('the request is in the customer\'s app too', !!an, JSON.stringify(mine.notices));
r = await desk(C.token, 'access_decide', { id: req2, approve: true });
ok('they approve it there', r.success && r.status === 'active', JSON.stringify(r));
ok('the owner can open it', (await getAll()).success);
sql(`UPDATE crm_support_access SET expires_at = '${new Date(Date.now() - 1000).toISOString()}' WHERE id = '${req2}'`);
ok('when the time is up the gate shuts before any cron has run', !(await getAll()).success);
await tick();
ok('the cron marks it expired and emails', sql(`SELECT status FROM crm_support_access WHERE id = '${req2}'`)[0].status === 'expired'
  && !!(await waitMail(m => /Support access has ended/.test(m) && /time you gave ran out/.test(m))));

console.log('\nRead-only review');
r = await desk(T, 'review', { email: C.email });
ok('a review needs a reason', !r.success && r.field === 'rv.reason', JSON.stringify(r));
r = await desk(T, 'review', { email: C.email, reason: 'Spam complaint about this sender' });
const w0 = r.snapshot?.workspaces?.[0];
ok('a review returns what the workspace holds', r.success && w0?.data?.some(d => d.key === 'crm_contacts' && d.count === 1), JSON.stringify(r).slice(0, 300));
ok('and never a mailbox password', !JSON.stringify(r).includes('A-secret') && !/"(password|smtp_password|pass)"/.test(JSON.stringify(r)));
ok('it is recorded with its reason', sql(`SELECT reason FROM crm_support_access WHERE mode = 'review' AND customer_email = '${C.email}'`)[0]?.reason === 'Spam complaint about this sender');
ok('and it opened nothing', !(await getAll()).success);

console.log('\nEmails to customers');
r = await desk(T, 'broadcast_count', { audience: ['trial'], kind: 'marketing' });
ok('the owner sees how many are on trial', r.success && r.count === 2, JSON.stringify(r));
r = await desk(T, 'broadcast_send', { kind: 'marketing', audience: ['trial'], subject: 'Black Friday: 40% off', body: 'Hi {name},\n\nForty percent off any plan.', link: 'javascript:alert(1)' });
ok('a button link must be https', !r.success && r.field === 'bc.link', JSON.stringify(r));
r = await desk(T, 'broadcast_send', { kind: 'marketing', audience: ['trial'], subject: 'Black Friday: 40% off', body: 'Hi {name},\n\nForty percent off any plan.', link: 'https://protectedcentral.com/pricing', linkLabel: 'See plans', inApp: true });
ok('a marketing email is queued for both', r.success && r.total === 2, JSON.stringify(r));
await tick();
const bf = await waitMail(m => /Black Friday/.test(m) && /cara@cust\.test/i.test(m));
ok('the cron sends it, first name filled in', !!bf && /Hi Cara/.test(bf), bf?.slice(0, 300));
ok('with an unsubscribe link and the one-click header', !!bf && /support-unsub\.php/.test(bf) && /List-Unsubscribe/i.test(bf));
r = await desk(T, 'broadcasts');
ok('it is shown as done, 2 of 2', r.broadcasts?.[0]?.status === 'done' && r.broadcasts[0].sent === 2, JSON.stringify(r.broadcasts?.[0]));
const unsub = bf?.match(/https?:\/\/[^\s"<>]+support-unsub\.php\?[^\s"<>]+/)?.[0]?.replace(/&amp;/g, '&');
page = await fetch(unsub, { method: 'POST', headers: { Connection: 'close' } }).then(x => x.text());
ok('unsubscribing works', /not get our news/.test(page), page.slice(0, 200));
await desk(T, 'broadcast_send', { kind: 'marketing', audience: ['trial'], subject: 'Cyber Monday', body: 'More offers.' });
await desk(T, 'broadcast_send', { kind: 'update', audience: ['trial'], subject: 'Scheduled maintenance Sunday', body: 'A short note.' });
await tick();
ok('the next marketing email skips them', !(await waitMail(m => /Cyber Monday/.test(m) && /cara@cust\.test/i.test(m), 4000)) && !!mail.find(m => /Cyber Monday/.test(m) && /dan@cust\.test/i.test(m)));
ok('but an account update still reaches them', !!(await waitMail(m => /Scheduled maintenance/.test(m) && /cara@cust\.test/i.test(m))));

console.log('\nUnread reply reminder');
const ago = h => new Date(Date.now() - h * 3_600_000).toISOString();
sql(`INSERT INTO crm_engage_people (id, account_id, email, name, created_at, updated_at) VALUES ('per-v1', '${A}', 'vera@visitor.test', 'Vera Visitor', '${ago(4)}', '${ago(4)}'), ('per-v2', '${A}', 'will@visitor.test', 'Will', '${ago(4)}', '${ago(4)}')`);
sql(`INSERT INTO crm_conversations (id, account_id, person_id, channel, status, handled_by, page_url, last_at, created_at, updated_at, last_visitor_at, visitor_seen_at) VALUES
  ('conv-v1', '${A}', 'per-v1', 'chat', 'open', 'human', 'https://protectedcentral.com/pricing', '${ago(3)}', '${ago(4)}', '${ago(3)}', '${ago(3.5)}', '${ago(3.5)}'),
  ('conv-v2', '${A}', 'per-v2', 'chat', 'open', 'human', 'https://protectedcentral.com/', '${ago(3)}', '${ago(4)}', '${ago(3)}', '${ago(3.5)}', '${ago(1)}')`);
sql(`INSERT INTO crm_conversation_messages (id, conversation_id, account_id, role, author, body, internal, created_at) VALUES
  ('m-v1', 'conv-v1', '${A}', 'agent', '${OWNER}', 'Yes, the Advanced plan includes five business workspaces and you can add more at any time from Plan and billing.', 0, '${ago(3)}'),
  ('m-v2', 'conv-v2', '${A}', 'agent', '${OWNER}', 'Seen already.', 0, '${ago(3)}')`);
sql("DELETE FROM crm_meta WHERE k = 'unread_nudge_at'");
await tick();
const nudge = await waitMail(m => /unread reply/i.test(m) && /vera@visitor\.test/i.test(m));
ok('a reply nobody read gets one reminder with a preview', !!nudge && /Advanced plan includes five/.test(nudge) && /#pc-chat/.test(nudge), nudge?.slice(0, 500));
ok('one they saw gets none', !mail.some(m => /unread reply/i.test(m) && /will@visitor\.test/i.test(m)));
sql("DELETE FROM crm_meta WHERE k = 'unread_nudge_at'");
await tick();
ok('and the reminder is not sent twice', mail.filter(m => /unread reply/i.test(m) && /vera@visitor\.test/i.test(m)).length === 1);
r = await api('engage.php', { action: 'poll', conversationId: 'conv-v2', visitorKey: '', seen: true });
ok('the widget poll with seen is accepted only for its own conversation', !r.success);

stop();
console.log(fail ? `\n${fail} failed` : '\nall passed');
process.exit(fail ? 1 : 0);
