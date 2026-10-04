/**
 * "It keeps running with your computer off" — the two passes that used to wait
 * for a browser, and the read behind the blinking cloud, driven with nobody
 * signed in.
 *
 * Self-contained: an SMTP sink on :8858, wrangler on :8928 with
 * `--test-scheduled`, a fresh D1 in a temporary directory.
 *   node test/cloudRun.e2e.mjs
 *
 *  - /api/cloud.php says "not live" before the cron has ever run and "live"
 *    after one tick, and refuses another tenant's workspace;
 *  - an email scheduled for one contact is sent by the tick once it is ten
 *    minutes overdue — and not before, so an open browser sends it first;
 *  - a send that fails is marked failed with the reason, not sent;
 *  - a tag an automation asked for lands on the synced contact list, the
 *    browser's own `applied_at` left for it to re-apply.
 */
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';

const PORT = Number(process.env.PORT ?? 8928), SMTP = Number(process.env.SMTP_PORT ?? 8858);
const B = `http://127.0.0.1:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = [];
const ok = (n, p, d = '') => { out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`); };

/* An SMTP sink that accepts everything except a recipient with "reject" in it. */
const mail = [];
const server = net.createServer(sock => {
  sock.on('error', () => {});
  let data = false, buf = [], pending = '', loginStep = 0;
  const w = s => sock.write(`${s}\r\n`);
  w('220 sink');
  sock.on('data', chunk => {
    pending += chunk.toString('utf8');
    let i;
    while ((i = pending.indexOf('\r\n')) >= 0) {
      const line = pending.slice(0, i); pending = pending.slice(i + 2);
      if (data) { if (line === '.') { data = false; mail.push(buf.join('\n')); buf = []; w('250 queued'); } else buf.push(line); continue; }
      if (loginStep === 1) { loginStep = 2; w('334 UGFzc3dvcmQ6'); continue; }
      if (loginStep === 2) { loginStep = 0; w('235 ok'); continue; }
      const up = line.toUpperCase();
      if (up.startsWith('EHLO') || up.startsWith('HELO')) sock.write('250-sink\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n');
      else if (up.startsWith('AUTH LOGIN')) { loginStep = 1; w('334 VXNlcm5hbWU6'); }
      else if (up.startsWith('AUTH PLAIN')) w('235 ok');
      else if (up.startsWith('RCPT TO') && /reject/i.test(line)) w('550 5.1.1 No such user here');
      else if (up === 'DATA') { data = true; w('354 go'); }
      else if (up === 'QUIT') { w('221 bye'); sock.end(); }
      else w('250 ok');
    }
  });
});
await new Promise(r => server.listen(SMTP, '127.0.0.1', r));

const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-d1-'));
const sql = q => JSON.parse(execSync(`npx wrangler d1 execute crmpro --local --persist-to ${persist} --json --command ${JSON.stringify(q)}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
const wr = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--inspector-port', String(PORT + 1000), '--persist-to', persist, '--test-scheduled', '--var', `APP_ORIGIN:${B}`], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
let wlog = '';
wr.stdout.on('data', c => { wlog += c; }); wr.stderr.on('data', c => { wlog += c; });
const stop = () => { try { process.kill(-wr.pid, 'SIGTERM'); } catch { /* gone */ } server.close(); };
process.on('exit', stop);
process.on('uncaughtException', e => { console.log(e, wlog.slice(-1500)); stop(); process.exit(1); });
for (let i = 0; i < 90; i++) { try { const r = await fetch(`${B}/api/data.php`, { method: 'POST', headers: { Connection: 'close' }, body: '{"action":"ping"}' }); if (r.ok) break; } catch { /* starting */ } await sleep(1000); }
const tick = async () => { for (let i = 0; i < 3; i++) { try { return await fetch(`${B}/cdn-cgi/handler/scheduled`, { headers: { Connection: 'close' } }); } catch { await sleep(1000); } } return null; };

let ipN = 1;
const api = (p, body) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.8.4.${ipN++ % 250}` }, body: JSON.stringify(body) }).then(r => r.json().catch(() => ({})));

console.log('\nLive in the cloud');
const OWNER = 'owner@cloud.test', PW = 'Tq9!vX2#pLm7wZ-cld';
const boot = await api('auth.php', { action: 'bootstrap', email: OWNER, password: PW, name: 'Owner' });
if (!boot.success) { console.log('bootstrap failed', boot, wlog.slice(-2000)); stop(); process.exit(2); }
const T = (await api('auth.php', { action: 'login', email: OWNER, password: PW })).token;
const A = 'acct-cloud-a', A2 = 'acct-cloud-b';
const other = await api('auth.php', { action: 'register', email: 'bea@cloud.test', password: 'Another-horse-7x', name: 'Bea' });
const TB = other.token ?? (await api('auth.php', { action: 'login', email: 'bea@cloud.test', password: 'Another-horse-7x' })).token;

/* ── The read behind the cloud ── */
let st = await api('cloud.php', { token: T, accountId: A, action: 'status' });
ok('before any tick the cloud is not called live', st.success && st.live === false && st.lastRunAt === null, JSON.stringify(st));

/* ── Two workspaces, each with a mailbox on the sink; the second's sends are refused ── */
for (const acct of [A, A2]) {
  const r = await api('mailbox.php', { token: T, accountId: acct, action: 'save', label: 'Shop', smtp: { host: '127.0.0.1', port: SMTP, encryption: 'none', username: 'u', password: 'p' }, from: { email: 'hello@shop.test', name: 'Shop' } });
  ok(`a mailbox is saved for ${acct}`, r.success !== false, JSON.stringify(r).slice(0, 300));
}
const ago = min => new Date(Date.now() - min * 60_000).toISOString();
const contacts = [{ id: 'c1', name: 'Rita Reader', email: 'rita@buyer.test', tags: [] }, { id: 'c2', name: 'Sam', email: 'sam@buyer.test', tags: ['old'] }];
const row = (id, contactId, to, min) => ({ id, contactId, subject: 'Hello {{firstName}}', body: 'Just checking in, {{firstName}}.', status: 'scheduled', direction: 'outbound', createdAt: ago(60), scheduledFor: ago(min), opens: 0, clicks: 0, clickedUrls: [], attachments: [], threadId: id, toEmail: to });
await api('data.php', { action: 'bulk_set', token: T, accountId: A, items: {
  crm_contacts: JSON.stringify(contacts),
  crm_contact_emails: JSON.stringify([row('em-due', 'c1', 'rita@buyer.test', 20), row('em-soon', 'c2', 'sam@buyer.test', 2)]),
} });
await api('data.php', { action: 'bulk_set', token: T, accountId: A2, items: {
  crm_contacts: JSON.stringify([{ id: 'x1', name: 'Rex', email: 'reject@buyer.test' }]),
  crm_contact_emails: JSON.stringify([row('em-bad', 'x1', 'reject@buyer.test', 30)]),
} });

/* ── An automation's tag, waiting for a browser ── */
sql(`INSERT INTO crm_contact_changes (id, account_id, contact_id, kind, field, value, source, source_id, created_at) VALUES ('chg-1', '${A}', 'c1', 'add_tag', '', 'hot lead', 'automation', 'a1', '${ago(1)}')`);
sql(`INSERT INTO crm_contact_changes (id, account_id, contact_id, kind, field, value, source, source_id, created_at) VALUES ('chg-2', '${A}', 'nobody-yet', 'add_tag', '', 'hot lead', 'automation', 'a1', '${ago(1)}')`);

await tick();
await sleep(1500);

const emails = acct => JSON.parse(sql(`SELECT v FROM crm_data WHERE account_id = '${acct}' AND k = 'crm_contact_emails'`)[0]?.v ?? '[]');
const mine = emails(A);
const due = mine.find(e => e.id === 'em-due'), soon = mine.find(e => e.id === 'em-soon');
ok('an email scheduled for one contact goes out from the cloud once it is overdue', due?.status === 'sent' && !!due.sentAt, JSON.stringify(due));
ok('…personalised, to the right address, through the workspace mailbox', mail.some(m => /rita@buyer\.test/i.test(m) && /Hello Rita/.test(m)), mail.map(m => m.slice(0, 200)).join(' || '));
ok('one only just due is left for an open browser to send', soon?.status === 'scheduled', JSON.stringify(soon));
const bad = emails(A2).find(e => e.id === 'em-bad');
ok('a send the server refuses is marked failed with the reason, never sent', bad?.status === 'failed' && /550|No such user/i.test(bad.error ?? ''), JSON.stringify(bad));
const sentRows = sql(`SELECT status, recipient FROM crm_delivery_log WHERE account_id = '${A}'`);
ok('…and the send is in the delivery log', sentRows.some(r => r.recipient === 'rita@buyer.test' && r.status === 'sent'), JSON.stringify(sentRows));

const listed = JSON.parse(sql(`SELECT v FROM crm_data WHERE account_id = '${A}' AND k = 'crm_contacts'`)[0]?.v ?? '[]');
ok('an automation\'s tag lands on the synced contact with nobody signed in', listed.find(c => c.id === 'c1')?.tags?.includes('hot lead'), JSON.stringify(listed));
const chg = sql("SELECT id, server_applied_at, applied_at FROM crm_contact_changes ORDER BY id");
ok('…stamped as applied in the cloud, and left for the browser to apply to its own copy', !!chg.find(c => c.id === 'chg-1')?.server_applied_at && chg.find(c => c.id === 'chg-1')?.applied_at === null, JSON.stringify(chg));
ok('a change for a contact the list does not hold yet waits', chg.find(c => c.id === 'chg-2')?.server_applied_at === null, JSON.stringify(chg));

await tick();
await sleep(1000);
ok('a second tick does not send the same email again', mail.filter(m => /rita@buyer\.test/i.test(m)).length === 1, String(mail.length));

st = await api('cloud.php', { token: T, accountId: A, action: 'status' });
ok('after a tick the cloud is live, with when it ran', st.success && st.live === true && !!st.lastRunAt && st.everyMinutes === 5, JSON.stringify(st));
const foreign = await api('cloud.php', { token: TB, accountId: A, action: 'status' });
ok('another tenant cannot read this workspace\'s cloud status', foreign.success === false, JSON.stringify(foreign));
const anon = await api('cloud.php', { accountId: A, action: 'status' });
ok('and nobody signed out can', anon.success === false, JSON.stringify(anon));

stop();
console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
