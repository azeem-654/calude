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
for (const a of ['list', 'decide', 'mark_fixed', 'config', 'config_save']) {
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

console.log('\nThe owner says yes from the email');
let res = await fetch(`${link}&a=live`, { headers: { Connection: 'close' } });
let page = await res.text();
ok('the link\'s GET shows the report and changes nothing', /Start fixing this problem/.test(page) && sql(`SELECT status FROM crm_problem_fixes WHERE id = '${F1}'`)[0].status === 'waiting' && fires.length === 0, page.slice(0, 200));
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
ok('the customer is told the team is working on it — 10–15 minutes', /working on your problem/.test(r.reports?.[0]?.title ?? '') && /10–15 minutes/.test(r.reports[0].body), JSON.stringify(r.reports?.[0]));
let notices = await api('customers.php', { token: C.token, action: 'mine' });
ok('in the app\'s corner card', (notices.notices ?? []).some(n => /working on your problem/.test(n.title)), JSON.stringify(notices.notices));
ok('and by email', !!(await waitMail(m => /To: .*cara@cust\.test/i.test(m) && /working on it right now/.test(m))));

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

console.log('\nA refused token');
r = await api('support-report.php', { token: C.token, accountId: C.acct, description: 'The calendar page is blank for me.' });
const F2 = r.fixId;
refuse = true;
r = await fix(T, 'decide', { id: F2, answer: 'testing' });
ok('the owner is told no session started, and why', !r.success && r.status === 'failed' && /refused the token/.test(r.error ?? ''), JSON.stringify(r));
r = await fix(C.token, 'mine');
const f2 = r.reports?.find(x => x.id === F2);
ok('and the customer is NOT told anybody is working on it', f2 && !/working on your problem/.test(f2.title), JSON.stringify(f2));
r = await fix(T, 'config');
ok('the connection shows the refusal', r.status === 'error' && /refused the token/.test(r.lastError), JSON.stringify(r).slice(0, 300));

console.log('\nTwice a day');
refuse = false;
r = await api('support-report.php', { token: C.token, accountId: C.acct, description: 'Exports download an empty file.' });
const F3 = r.fixId;
const hour = new Date().getUTCHours();
await fix(T, 'config_save', { url: TRIG, tokenValue: '', digestHours: [hour], diagnose: true });
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

console.log('\nNo');
r = await fix(T, 'decide', { id: F3, answer: 'decline' });
ok('the owner leaves one for a person', r.success && r.status === 'declined', JSON.stringify(r));
r = await fix(T, 'list');
ok('the owner\'s list shows all three, never a key', r.reports?.length === 3 && !JSON.stringify(r).includes('agent_hash') && !JSON.stringify(r).includes(KEY ?? 'nokey'), JSON.stringify(r).slice(0, 200));

console.log(fail ? `\n${fail} failed` : '\nall passed');
stop();
process.exit(fail ? 1 : 0);
