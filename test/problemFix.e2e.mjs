/**
 * Report a problem → a fix by Claude Code, end to end, against the real
 * Worker, a fresh D1, an SMTP sink and a stand-in for Claude Code's
 * scheduled-task API (2026-11-25, lib/problemFix.ts):
 *
 *  - a customer's report (screenshot + voice note) is a ticket and a fix
 *    waiting for the owner; the owner is alerted and emailed "Should I start
 *    fixing this?" with a reply code; the customer sees "we have your report";
 *  - the connection: a wrong trigger address names its box, the token is
 *    never returned, a blank token keeps the stored one;
 *  - the email link's GET changes nothing; its POST starts ONE session with
 *    the bearer token and the report's own key; a second press starts none;
 *  - only then is the customer told "working on it, 10–15 minutes" (in the
 *    app and by email);
 *  - the session: a wrong key is refused, the right one reads the report, its
 *    picture and its voice note, and "fixed" tells the customer (email + in
 *    the app) and shuts the key;
 *  - a refused token: the owner is told why and the customer is NOT told
 *    anybody is working on it;
 *  - starts by itself (2026-11-28): once connected, a report starts on the
 *    testing site without a yes, the owner is told; switched off, refused or
 *    past the per-workspace cap, it waits for the owner as before.
 *  - testing first (2026-11-28): a feature request goes to the testing site;
 *    "ready" needs the write-up and test steps, which reach the owner by
 *    email with a Push it live button (its own signature); the customer is
 *    told it is being tested; Push it live starts ONE promoting session, a
 *    failed promotion goes back to testing without telling the customer, and
 *    "fixed" tells them by email, in the app and on a resolved ticket;
 *  - twice a day: the reports nobody answered are emailed to the owner, and
 *    with "look into them" on, one read-only DIAGNOSE session is started;
 *  - everything the owner does is refused to a customer.
 *
 *   npm run test:problemfix
 *
 * Self-contained: SMTP sink :8873, Claude Code stand-in :8875, wrangler dev
 * --test-scheduled on :8871 over a temporary D1. API only — no build needed.
 */
import net from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';

const PORT = 8871, SINK = 8873, CLAUDE = 8875;
const B = `http://localhost:${PORT}`;
let fail = 0;
const ok = (name, cond, detail = '') => { if (!cond) fail++; console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ` — ${String(detail).slice(0, 400)}`}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readable = m => m.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  + Buffer.from((m.split(/\r?\n\r?\n/).slice(1).join('\n').match(/^[A-Za-z0-9+/=]+$/gm) ?? []).join(''), 'base64').toString('utf8');

/* ── SMTP sink ── */
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

/* ── Claude Code's scheduled-task API, standing in ── */
const fires = [];
let refuse = false;
const claude = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    fires.push({ path: req.url, auth: req.headers.authorization, beta: req.headers['anthropic-beta'], version: req.headers['anthropic-version'], body: JSON.parse(body || '{}') });
    res.setHeader('Content-Type', 'application/json');
    if (refuse) { res.statusCode = 401; res.end('{"type":"error","error":{"type":"authentication_error","message":"bad token"}}'); return; }
    res.end(JSON.stringify({ type: 'routine_fire', claude_code_session_id: `session_t${fires.length}`, claude_code_session_url: `https://claude.ai/code/session_t${fires.length}` }));
  });
});
await new Promise(r => claude.listen(CLAUDE, '127.0.0.1', r));

/* ── The Worker ── */
const persist = process.env.PERSIST || fs.mkdtempSync(path.join(os.tmpdir(), 'fix-d1-'));
const sql = q => JSON.parse(execSync(`npx wrangler d1 execute crmpro --local --persist-to ${persist} --json --command ${JSON.stringify(q.replace(/\s+/g, ' '))}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
const wr = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--persist-to', persist, '--test-scheduled',
  '--var', `APP_ORIGIN:${B}`, '--var', `ROUTINE_API_BASE:http://127.0.0.1:${CLAUDE}`], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
let wlog = '';
wr.stdout.on('data', c => { wlog += c; }); wr.stderr.on('data', c => { wlog += c; });
const stop = () => { try { process.kill(-wr.pid, 'SIGTERM'); } catch { /* gone */ } sink.close(); claude.close(); };
process.on('exit', stop);
process.on('uncaughtException', e => { console.log(e, wlog.slice(-1500)); stop(); process.exit(1); });
for (let i = 0; i < 90; i++) { try { const r = await fetch(`${B}/api/data.php`, { method: 'POST', headers: { Connection: 'close' }, body: '{"action":"ping"}' }); if (r.ok) break; } catch { /* starting */ } await sleep(1000); }

let ipN = 1;
const api = (p, body) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.9.7.${ipN++ % 250}` }, body: JSON.stringify(body) }).then(r => r.json().catch(() => ({})));
const fix = (token, action, extra = {}) => api('problem-fix.php', { token, action, ...extra });
const raw = (body) => fetch(`${B}/api/problem-fix.php`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close' }, body: JSON.stringify(body) });
const tick = async () => { for (let i = 0; i < 3; i++) { try { await fetch(`${B}/cdn-cgi/handler/scheduled`, { headers: { Connection: 'close' } }); break; } catch { await sleep(1000); } } await sleep(3500); };
const waitMail = async (test, ms = 20_000) => { const end = Date.now() + ms; while (Date.now() < end) { const m = mail.find(test); if (m) return m; await sleep(400); } return null; };

const OWNER = 'owner@fix.test', PW = 'Tq9!vX2#pLm7wZ-fix';
const boot = await api('auth.php', { action: 'bootstrap', email: OWNER, password: PW, name: 'Olive Owner' });
if (!boot.success) { console.log('bootstrap failed', boot, wlog.slice(-2000)); stop(); process.exit(2); }
const A = 'acct-fix-owner';
sql(`INSERT INTO crm_workspaces (account_id, owner_email, created_at) VALUES ('${A}', '${OWNER}', '2026-11-01T00:00:00Z')`);
sql(`INSERT INTO crm_widgets (id, account_id, name, public_key, title, features, status, in_app, created_at, updated_at) VALUES ('w-fix-house', '${A}', 'Help', 'f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1', 'Help', '["chat","ticket"]', 'live', 1, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`);
const T = (await api('auth.php', { action: 'login', email: OWNER, password: PW })).token;

const signUp = async (tag) => {
  const email = `${tag}@cust.test`;
  const r = await api('auth.php', { action: 'register', email, name: `Cara ${tag}`, password: `Zx8#${tag}-Plm-2026q` });
  if (!r.success) throw new Error(`sign up ${tag}: ${JSON.stringify(r)}`);
  return { email, token: r.token, acct: r.user.accountId };
};
const C = await signUp('cara');

let r = await api('mailbox.php', { token: T, accountId: A, action: 'save', label: 'Support', smtp: { host: '127.0.0.1', port: SINK, encryption: 'none', username: 'u', password: 'p' }, from: { email: 'support@fix.test', name: 'Protected Central' } });
ok('the owner connects a mailbox', r.success, JSON.stringify(r));
sql(`UPDATE crm_mailbox_accounts SET out_verified_at = '${new Date().toISOString()}' WHERE account_id = '${A}'`);

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const VOICE = Buffer.alloc(4000, 7).toString('base64');

console.log('\nOwner only');
for (const a of ['list', 'decide', 'promote', 'mark_fixed', 'config', 'config_save']) {
  r = await fix(C.token, a, { id: 'fx_x', answer: 'live' });
  ok(`a customer cannot ${a}`, !r.success && r.code === 'not_owner', JSON.stringify(r));
}

console.log('\nA report arrives');
r = await api('support-report.php', { token: C.token, accountId: C.acct, description: 'Saving a contact does nothing when I press Save.', screenshot: PNG, audio: VOICE, audioMime: 'audio/webm', path: '/contacts', pageTitle: 'Contacts' });
ok('the customer sends a report with a screenshot and a voice note', r.success && /^fx_/.test(r.fixId ?? '') && /technical team/.test(r.message), JSON.stringify(r));
const F1 = r.fixId;
r = await api('support-report.php', { token: C.token, accountId: C.acct, description: 'Another thing broke here.', audio: VOICE, audioMime: 'text/html' });
ok('a "voice note" that is not audio names its box', !r.success && r.field === 'report.voice', JSON.stringify(r));
let row = sql(`SELECT status, has_audio AS a, pictures AS p, reply_code AS code, ticket_id AS t FROM crm_problem_fixes WHERE id = '${F1}'`)[0];
ok('it waits for the owner, with its picture, voice note and ticket', row?.status === 'waiting' && row.a === 1 && row.p === 1 && !!row.t, JSON.stringify(row));
const ask = await waitMail(m => /To: .*owner@fix\.test/i.test(m) && /Should I start fixing this/.test(m));
ok('the owner is emailed "Should I start fixing this?" with the reply code', !!ask && ask.includes(`[Fix ${row.code}]`), ask?.slice(0, 300));
const link = (ask ?? '').match(/https?:\/\/localhost:8871\/api\/problem-fix\.php\?id=[^"&\s]+&(?:amp;)?s=[0-9a-f]+/)?.[0]?.replace(/&amp;/g, '&');
ok('with a link to answer', !!link, ask?.slice(0, 600));
r = await api('support-desk.php', { token: T, action: 'pulse' });
r = sql("SELECT kind, route FROM crm_owner_alerts WHERE kind = 'problem.reported'");
ok('and alerted in the app (and on the phone) with a route to the report', r.some(a => a.route.includes(F1)), JSON.stringify(r));
r = await fix(C.token, 'mine');
ok('the customer sees "we have your report"', r.success && r.reports?.[0]?.id === F1 && r.reports[0].status === 'waiting' && /We have your report/.test(r.reports[0].title), JSON.stringify(r));

console.log('\nThe connection');
r = await fix(T, 'config_save', { url: 'https://evil.example/fire', tokenValue: 'sk-ant-oat01-abcdefghijkl' });
ok('a trigger address that is not Claude Code\'s names its box', !r.success && r.field === 'fix.url', JSON.stringify(r));
const TRIG = 'https://api.anthropic.com/v1/claude_code/routines/trig_01TestTrigger/fire';
r = await fix(T, 'config_save', { url: TRIG, tokenValue: '' });
ok('a first save needs the token', !r.success && r.field === 'fix.token', JSON.stringify(r));
r = await fix(T, 'config_save', { url: TRIG, tokenValue: 'sk-ant-oat01-SECRETtokenVALUE', digestHours: [9, 17] });
ok('the owner connects Claude Code', r.success, JSON.stringify(r));
r = await fix(T, 'config');
ok('the token is never returned', r.success && r.connected && r.tokenSet && !JSON.stringify(r).includes('SECRETtoken'), JSON.stringify(r).slice(0, 300));
ok('the prompt to save on the task is offered', /routine-fire-payload/.test(r.prompt ?? ''), r.prompt);
r = await fix(T, 'config_save', { url: TRIG, tokenValue: '', digestHours: [9, 17] });
ok('a blank token keeps the stored one', r.success && (await fix(T, 'config')).tokenSet, JSON.stringify(r));
ok('reports start by themselves unless the owner switches it off', (await fix(T, 'config')).autoStart === true);

console.log('\nThe owner says yes from the email');
let res = await fetch(`${link}&a=live`, { headers: { Connection: 'close' } });
let page = await res.text();
ok('the link\'s GET shows the report and changes nothing', /Start on this\?/.test(page) && sql(`SELECT status FROM crm_problem_fixes WHERE id = '${F1}'`)[0].status === 'waiting' && fires.length === 0, page.slice(0, 200));
res = await fetch(link.replace(/s=[0-9a-f]+/, 's=00000000000000000000000000000000'), { headers: { Connection: 'close' } });
ok('a forged link is not valid', /not valid/.test(await res.text()));
res = await fetch(link, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Connection: 'close' }, body: 'go=live' });
page = await res.text();
ok('its button starts fixing', /Fixing has started/.test(page) && /session_t1/.test(page), page.slice(0, 400));
ok('one session was started, with the token and the beta header', fires.length === 1 && fires[0].auth === 'Bearer sk-ant-oat01-SECRETtokenVALUE' && fires[0].beta === 'experimental-cc-routine-2026-04-01' && fires[0].path === '/v1/claude_code/routines/trig_01TestTrigger/fire', JSON.stringify(fires[0]).slice(0, 300));
const text = fires[0]?.body?.text ?? '';
ok('the session is handed the report, its id and its key, to put live', text.includes(F1) && /Saving a contact does nothing/.test(text) && /ship: LIVE/.test(text) && /agent_update/.test(text), text.slice(0, 300));
const KEY = text.match(/"key":"([0-9a-f]{48})"/)?.[1];
ok('with a key of its own', !!KEY);
res = await fetch(link, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Connection: 'close' }, body: 'go=live' });
ok('pressing it again starts nothing', /Already answered/.test(await res.text()) && fires.length === 1, `fires=${fires.length}`);
row = sql(`SELECT status, ship, session_url AS u FROM crm_problem_fixes WHERE id = '${F1}'`)[0];
ok('the report is being fixed, with its session', row.status === 'fixing' && row.ship === 'live' && row.u === 'https://claude.ai/code/session_t1', JSON.stringify(row));
r = await fix(C.token, 'mine');
ok('the customer is told the team is working on it — about half an hour', /working on your problem/.test(r.reports?.[0]?.title ?? '') && /about half an hour \(an hour or two at most\)/.test(r.reports[0].body), JSON.stringify(r.reports?.[0]));
let notices = await api('customers.php', { token: C.token, action: 'mine' });
ok('in the app\'s corner card', (notices.notices ?? []).some(n => /working on your problem/.test(n.title)), JSON.stringify(notices.notices));
ok('and by email', !!(await waitMail(m => /To: .*cara@cust\.test/i.test(m) && /fixing it right now/.test(m))));
let tk = sql(`SELECT t.status, (SELECT count(*) FROM crm_ticket_messages m WHERE m.ticket_id = t.id AND m.internal = 0) AS n FROM crm_tickets t WHERE t.id = (SELECT ticket_id FROM crm_problem_fixes WHERE id = '${F1}')`)[0];
ok('and on their ticket, which is now in progress', tk?.status === 'in_progress' && tk.n === 1, JSON.stringify(tk));

console.log('\nThe session');
let a = await raw({ action: 'agent_report', id: F1, key: '0'.repeat(48) });
ok('a wrong key reads nothing', a.status === 403);
a = await raw({ action: 'agent_report', id: F1, key: KEY });
let aj = await a.json();
ok('the right key reads the report', aj.success && /Saving a contact/.test(aj.report?.description) && aj.report.pictures.length === 1 && aj.report.hasAudio, JSON.stringify(aj).slice(0, 300));
a = await raw({ action: 'agent_picture', id: F1, key: KEY, n: 0 });
ok('and its screenshot', a.status === 200 && a.headers.get('content-type') === 'image/png');
a = await raw({ action: 'agent_audio', id: F1, key: KEY });
ok('and its voice note', a.status === 200 && a.headers.get('content-type') === 'audio/webm' && (await a.arrayBuffer()).byteLength === 4000);
aj = await (await raw({ action: 'agent_update', id: F1, key: KEY, status: 'working', note: 'Reproducing.', sessionUrl: 'https://claude.ai/code/session_t1' })).json();
ok('it says it is working', aj.success, JSON.stringify(aj));
aj = await (await raw({ action: 'agent_update', id: F1, key: KEY, status: 'fixed', note: 'The Save button now saves the contact.' })).json();
ok('and that it is fixed and live', aj.success && sql(`SELECT status FROM crm_problem_fixes WHERE id = '${F1}'`)[0].status === 'fixed', JSON.stringify(aj));
ok('the customer is emailed to refresh and check', !!(await waitMail(m => /To: .*cara@cust\.test/i.test(m) && /Fixed: the problem you reported/.test(m) && /refresh the app/.test(m))));
notices = await api('customers.php', { token: C.token, action: 'mine' });
ok('and told in the app', (notices.notices ?? []).some(n => /has been fixed/.test(n.title)), JSON.stringify(notices.notices));
r = await fix(C.token, 'mine');
ok('their button reads fixed', r.reports?.[0]?.status === 'fixed', JSON.stringify(r.reports?.[0]));
a = await raw({ action: 'agent_report', id: F1, key: KEY });
ok('the key stops working once it is fixed', a.status === 403);
ok('the owner hears it is fixed', sql("SELECT count(*) AS n FROM crm_owner_alerts WHERE kind = 'problem.fixed'")[0].n === 1);
tk = sql(`SELECT status FROM crm_tickets WHERE id = (SELECT ticket_id FROM crm_problem_fixes WHERE id = '${F1}')`)[0];
ok('and their ticket is resolved', tk?.status === 'resolved', JSON.stringify(tk));

console.log('\nA refused token');
refuse = true;
let nf = fires.length;
r = await api('support-report.php', { token: C.token, accountId: C.acct, description: 'The calendar page is blank for me.' });
const F2 = r.fixId;
let row2 = sql(`SELECT status, auto_started AS a, reply_code AS code, error FROM crm_problem_fixes WHERE id = '${F2}'`)[0];
ok('a new report tries to start by itself, and the refusal is kept', fires.length === nf + 1 && row2?.a === 1 && row2.status === 'failed' && /refused the token/.test(row2.error), JSON.stringify(row2));
ok('so the owner is asked instead, with why', !!(await waitMail(m => /To: .*owner@fix\.test/i.test(m) && m.includes(`[Fix ${row2.code}]`) && /Should I start fixing this/.test(m) && /could not start on it by itself/.test(m))));
r = await fix(T, 'decide', { id: F2, answer: 'testing' });
ok('the owner is told no session started, and why', !r.success && r.status === 'failed' && /refused the token/.test(r.error ?? ''), JSON.stringify(r));
r = await fix(C.token, 'mine');
const f2 = r.reports?.find(x => x.id === F2);
ok('and the customer is NOT told anybody is working on it', f2 && !/working on your problem/.test(f2.title), JSON.stringify(f2));
r = await fix(T, 'config');
ok('the connection shows the refusal', r.status === 'error' && /refused the token/.test(r.lastError), JSON.stringify(r).slice(0, 300));

console.log('\nTwice a day');
refuse = false;
const hour = new Date().getUTCHours();
await fix(T, 'config_save', { url: TRIG, tokenValue: '', digestHours: [hour], diagnose: true, autoStart: false });
nf = fires.length;
r = await api('support-report.php', { token: C.token, accountId: C.acct, description: 'Exports download an empty file.' });
const F3 = r.fixId;
const row3 = sql(`SELECT status, reply_code AS code FROM crm_problem_fixes WHERE id = '${F3}'`)[0];
ok('with "start by itself" switched off, a report waits for the owner', fires.length === nf && row3?.status === 'waiting', JSON.stringify(row3));
const ask3 = await waitMail(m => /To: .*owner@fix\.test/i.test(m) && m.includes(`[Fix ${row3.code}]`) && /Should I start fixing this/.test(m));
const link3 = (ask3 ?? '').match(/https?:\/\/localhost:8871\/api\/problem-fix\.php\?id=[^"&\s]+&(?:amp;)?s=[0-9a-f]+/)?.[0]?.replace(/&amp;/g, '&');
ok('and the owner is asked', !!link3, ask3?.slice(0, 300));
const before = fires.length;
await tick();
ok('the reports nobody answered are emailed to the owner', !!(await waitMail(m => /To: .*owner@fix\.test/i.test(m) && /waiting for your answer/.test(m) && /empty file/.test(m))));
const diag = fires.slice(before);
ok('one read-only session is started to look into the new one', diag.length === 1 && /DIAGNOSE/.test(diag[0].body.text) && diag[0].body.text.includes(F3) && !diag[0].body.text.includes(F2), JSON.stringify(diag.map(f => f.body.text.slice(0, 120))));
const DKEY = diag[0]?.body.text.match(new RegExp(`"id":"${F3}","key":"([0-9a-f]{48})"`))?.[1];
aj = await (await raw({ action: 'agent_update', id: F3, key: DKEY, status: 'diagnosed', note: 'The export reads the wrong key.' })).json();
ok('its finding is kept beside the report, which still waits for the owner', aj.success && sql(`SELECT status, note FROM crm_problem_fixes WHERE id = '${F3}'`)[0].note === 'The export reads the wrong key.' && sql(`SELECT status FROM crm_problem_fixes WHERE id = '${F3}'`)[0].status === 'waiting', JSON.stringify(aj));
aj = await (await raw({ action: 'agent_update', id: F3, key: DKEY, status: 'fixed', note: 'x' })).json();
ok('a diagnosing session cannot mark it fixed', !aj.success, JSON.stringify(aj));
const again = fires.length;
await tick();
ok('once per hour slot', fires.length === again);

console.log('\nTesting first, then Push it live (a feature request)');
const post = (u, body) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Connection: 'close' }, body });
await fix(T, 'config_save', { url: TRIG, tokenValue: '', digestHours: [hour], diagnose: false, autoStart: true });
let n = fires.length;
r = await api('support-report.php', { token: C.token, accountId: C.acct, kind: 'feature', description: 'Please add a button to export my contacts as a spreadsheet.', path: '/contacts', pageTitle: 'Contacts' });
const F4 = r.fixId;
ok('the customer sends a feature request', r.success && r.kind === 'feature' && /has your request/.test(r.message) && /about half an hour/.test(r.message), JSON.stringify(r));
const row4 = sql(`SELECT kind, status, auto_started AS a, reply_code AS code, ticket_id AS t FROM crm_problem_fixes WHERE id = '${F4}'`)[0];
ok('it is kept as a feature request, with a ticket', row4?.kind === 'feature' && !!row4.t && sql(`SELECT category FROM crm_tickets WHERE id = '${row4.t}'`)[0]?.category === 'feature', JSON.stringify(row4));
ok('it starts on the testing site by itself — no yes needed', fires.length === n + 1 && row4.status === 'fixing' && row4.a === 1, JSON.stringify(row4));
const started4 = await waitMail(m => /To: .*owner@fix\.test/i.test(m) && m.includes(`[Fix ${row4.code}]`) && /Started on the testing site/.test(m));
ok('the owner is told it started, and that nothing goes live without Push it live', !!started4 && /nothing goes live until you press Push it live/.test(started4) && /Open it in Problem fixes/.test(started4) && !/Should I start/.test(started4), started4?.slice(0, 400));
const t4 = fires[n]?.body?.text ?? '';
ok('the session is told: testing site first, a new feature, and the write-up to send', /ship: TESTING SITE FIRST/.test(t4) && /Type: New feature/.test(t4) && /"status":"ready"/.test(t4) && /testSteps/.test(t4) && /testing\.protectedcentral\.com\/contacts/.test(t4), t4.slice(0, 600));
const K4 = t4.match(new RegExp(`"id":"${F4}","key":"([0-9a-f]{48})"`))?.[1];
r = await fix(C.token, 'mine');
let m4 = r.reports?.find(x => x.id === F4);
ok('the customer is told it is being built — the same half hour as a bug', /building your feature request/.test(m4?.title ?? '') && /about half an hour/.test(m4.body) && !/days/.test(m4.body), JSON.stringify(m4));
ok('by email', !!(await waitMail(m => /To: .*cara@cust\.test/i.test(m) && /building your feature request/.test(m) && /about half an hour/.test(m))));
tk = sql(`SELECT status FROM crm_tickets WHERE id = '${row4.t}'`)[0];
ok('and on their ticket', tk?.status === 'in_progress', JSON.stringify(tk));
aj = await (await raw({ action: 'agent_update', id: F4, key: K4, status: 'ready', changed: 'Added an Export button.' })).json();
ok('"ready" without steps for the owner is refused', !aj.success && /testSteps/.test(aj.error ?? ''), JSON.stringify(aj));
aj = await (await raw({ action: 'agent_update', id: F4, key: K4, status: 'ready', changed: 'Added an Export button to Contacts that downloads a CSV.', customerSees: 'An Export button above the contacts list.', improved: 'The list loads a little faster.', testSteps: '1. Open https://testing.protectedcentral.com/contacts\n2. Press Export\n3. A spreadsheet of your contacts downloads.', commit: 'abc1234' })).json();
ok('the session says it is on the testing site', aj.success && sql(`SELECT status FROM crm_problem_fixes WHERE id = '${F4}'`)[0].status === 'ready', JSON.stringify(aj));
const ready = await waitMail(m => /To: .*owner@fix\.test/i.test(m) && /Ready to test on the testing site/.test(m));
ok('the owner is emailed what changed, what the customer sees and how to test it', !!ready && /downloads a CSV/.test(ready) && /An Export button above/.test(ready) && /Press Export/.test(ready) && /loads a little faster/.test(ready), ready?.slice(0, 600));
const plink = (ready ?? '').match(/https?:\/\/localhost:8871\/api\/problem-fix\.php\?id=[^"&\s]+&(?:amp;)?p=[0-9a-f]+/)?.[0]?.replace(/&amp;/g, '&');
ok('with a Push it live button', !!plink && /Push it live/.test(ready ?? ''), ready?.slice(0, 600));
r = await fix(C.token, 'mine');
m4 = r.reports?.find(x => x.id === F4);
ok('the customer is told it is built and being tested', /our developers are testing it/.test(m4?.title ?? '') && m4.status === 'ready', JSON.stringify(m4));
ok('by email', !!(await waitMail(m => /To: .*cara@cust\.test/i.test(m) && /Being tested now/.test(m))));
ok('and on their ticket', sql(`SELECT count(*) AS n FROM crm_ticket_messages WHERE ticket_id = '${row4.t}' AND body LIKE '%developers are testing%'`)[0].n === 1);
n = fires.length;
page = await (await fetch(plink, { headers: { Connection: 'close' } })).text();
ok('the Push it live link\'s GET changes nothing', /Push it live\?/.test(page) && fires.length === n && sql(`SELECT status FROM crm_problem_fixes WHERE id = '${F4}'`)[0].status === 'ready', page.slice(0, 200));
page = await (await fetch(plink.replace(/p=[0-9a-f]+/, 'p=00000000000000000000000000000000'), { headers: { Connection: 'close' } })).text();
ok('a forged Push it live link is not valid', /not valid/.test(page));
page = await (await post(link3.replace(/s=/, 'p='), 'go=promote')).text();
ok('the start-fixing signature cannot push it live', /not valid/.test(page) && fires.length === n, page.slice(0, 200));
page = await (await post(plink, 'go=promote')).text();
ok('its button starts a session to put it live', /Going live/.test(page) && fires.length === n + 1, page.slice(0, 300));
const p4 = fires[n]?.body?.text ?? '';
ok('the session is told to promote, with the fix commit', /^PROMOTE/.test(p4) && p4.includes(F4) && /abc1234/.test(p4) && /Promote testing to live/.test(p4) && /INCUBATOR/.test(p4), p4.slice(0, 400));
page = await (await post(plink, 'go=promote')).text();
ok('pressing it again starts nothing', fires.length === n + 1, page.slice(0, 200));
const PK = p4.match(/"key":"([0-9a-f]{48})"/)?.[1];
ok('the fixing session\'s key no longer works', (await raw({ action: 'agent_report', id: F4, key: K4 })).status === 403);
aj = await (await raw({ action: 'agent_update', id: F4, key: PK, status: 'failed', note: 'The Promote workflow could not be started.' })).json();
row = sql(`SELECT status, error FROM crm_problem_fixes WHERE id = '${F4}'`)[0];
ok('a promotion that fails puts it back on the testing site, with why', aj.success && row.status === 'ready' && /could not be started/.test(row.error), JSON.stringify(row));
r = await fix(C.token, 'mine');
ok('and the customer is told nothing new', /our developers are testing it/.test(r.reports?.find(x => x.id === F4)?.title ?? ''), JSON.stringify(r.reports?.[0]));
n = fires.length;
r = await fix(T, 'promote', { id: F4 });
ok('the owner pushes it live again from the tab', r.success && r.status === 'promoting' && fires.length === n + 1, JSON.stringify(r));
const PK2 = fires[n]?.body?.text?.match(/"key":"([0-9a-f]{48})"/)?.[1];
aj = await (await raw({ action: 'agent_update', id: F4, key: PK2, status: 'fixed', note: 'You can now export your contacts from the Contacts page.' })).json();
ok('the session says it is live', aj.success && sql(`SELECT status FROM crm_problem_fixes WHERE id = '${F4}'`)[0].status === 'fixed', JSON.stringify(aj));
ok('the customer is emailed that it is live', !!(await waitMail(m => /To: .*cara@cust\.test/i.test(m) && /Live now: your feature request/.test(m))));
notices = await api('customers.php', { token: C.token, action: 'mine' });
ok('told in the app', (notices.notices ?? []).some(n => /new feature is live/.test(n.title)), JSON.stringify(notices.notices));
ok('and their ticket is resolved', sql(`SELECT status FROM crm_tickets WHERE id = '${row4.t}'`)[0]?.status === 'resolved');

console.log('\nA cap on reports that start by themselves');
/* The form's own limit (five an hour per person) would refuse these first; the cap under test is per workspace per day. */
sql("DELETE FROM crm_rate_limits WHERE bucket LIKE '%support-report%'");
n = fires.length;
r = await api('support-report.php', { token: C.token, accountId: C.acct, description: 'The invoice page shows the wrong total.' });
const F5 = r.fixId;
ok('a third report from one workspace in a day still starts by itself', fires.length === n + 1 && sql(`SELECT status FROM crm_problem_fixes WHERE id = '${F5}'`)[0]?.status === 'fixing');
r = await api('support-report.php', { token: C.token, accountId: C.acct, description: 'The reports page is slow to open.' });
const row6 = sql(`SELECT status, auto_started AS a, reply_code AS code FROM crm_problem_fixes WHERE id = '${r.fixId}'`)[0];
ok('a fourth waits for the owner', fires.length === n + 1 && row6?.status === 'waiting' && row6.a === 0, JSON.stringify(row6));
const ask6 = await waitMail(m => /To: .*owner@fix\.test/i.test(m) && m.includes(`[Fix ${row6.code}]`) && /Should I start fixing this/.test(m));
ok('who is asked, told why, with "Fix it and put it on the testing site" first', !!ask6 && /3 reports start by themselves/.test(ask6) && ask6.indexOf('Fix it and put it on the testing site') >= 0 && ask6.indexOf('Fix it and put it on the testing site') < ask6.indexOf('Fix it and put it live'), ask6?.slice(0, 400));

console.log('\nNo');
r = await fix(T, 'decide', { id: F3, answer: 'decline' });
ok('the owner leaves one for a person', r.success && r.status === 'declined', JSON.stringify(r));
r = await fix(T, 'list');
ok('the owner\'s list shows all six, never a key', r.reports?.length === 6 && !JSON.stringify(r).includes('agent_hash') && !JSON.stringify(r).includes(KEY ?? 'nokey'), JSON.stringify(r).slice(0, 200));

console.log(fail ? `\n${fail} failed` : '\nall passed');
stop();
process.exit(fail ? 1 : 0);
