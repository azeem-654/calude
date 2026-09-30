/**
 * System email: the owner chooses which of their mailboxes the install writes
 * from, and nothing else can.
 *
 * Needs a fresh database (it creates the install owner), like test:signup:
 *   npx wrangler dev --local --port 8799 --persist-to <empty dir> --var APP_ORIGIN:http://localhost:8799
 *   BASE=http://localhost:8799 node test/systemMail.e2e.mjs
 *
 * Runs its own SMTP sink on 127.0.0.1:2526 so what was really sent, and from
 * which address, can be read back.
 */
import net from 'node:net';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const B = process.env.BASE ?? 'http://localhost:8799';
let fail = 0;
const ok = (name, cond, detail = '') => { if (!cond) fail++; console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ` — ${detail}`}`); };

const mail = [];
const sink = net.createServer(sock => {
  let data = false; let buf = []; let pending = ''; let loginStep = 0;
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
      const u = line.toUpperCase();
      if (u.startsWith('EHLO') || u.startsWith('HELO')) sock.write('250-sink\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n');
      else if (u.startsWith('AUTH LOGIN')) { loginStep = 1; w('334 VXNlcm5hbWU6'); }
      else if (u.startsWith('AUTH PLAIN')) w('235 ok');
      else if (u === 'DATA') { data = true; w('354 go'); }
      else if (u === 'QUIT') { w('221 bye'); sock.end(); }
      else w('250 ok');
    }
  });
  sock.on('error', () => {});
});
await new Promise(r => sink.listen(2526, '127.0.0.1', r));

let ipN = 1;
const api = (path, body) => fetch(`${B}/api/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.8.0.${ipN++}` }, body: JSON.stringify(body),
}).then(r => r.json().catch(() => ({})));
const SMTP = { host: '127.0.0.1', port: 2526, encryption: 'none', username: 'u', password: 'p' };

const OWNER = 'owner@system.test';
const PW = 'Tq9!vX2#pLm7wZ-sys';
const boot = await api('auth.php', { action: 'bootstrap', email: OWNER, password: PW, name: 'Owner' });
if (!boot.success) { console.log('bootstrap failed — this needs a fresh database', boot); process.exit(2); }
const owner = await api('auth.php', { action: 'login', email: OWNER, password: PW });
const T = owner.token;
const acct = owner.user?.accountId ?? 'acct-system-owner';
const sys = (action, extra = {}) => api('system-mail.php', { token: T, action, ...extra });

console.log('\nSystem email');
let s = await sys('status');
ok('with no mailbox, it says so and nothing is in use', s.success && !s.inUse && /not connected a mailbox/.test(s.why), JSON.stringify(s));

const a = await api('mailbox.php', { token: T, accountId: acct, action: 'save', label: 'Support', smtp: SMTP, from: { email: 'support@system.test', name: 'Support' } });
const b = await api('mailbox.php', { token: T, accountId: acct, action: 'save', label: 'Hello', smtp: SMTP, from: { email: 'hello@system.test', name: 'Hello' } });
ok('the owner connects two mailboxes', a.success && b.success, JSON.stringify([a.error, b.error]));
s = await sys('status');
ok('unvalidated mailboxes are listed but not used', s.candidates?.length === 2 && !s.inUse && /passed "Save & validate"/.test(s.why), JSON.stringify(s));

await api('mailbox.php', { token: T, accountId: acct, action: 'test_outgoing', id: b.id });
s = await sys('status');
ok('the first validated mailbox is used automatically', s.inUse?.id === b.id && /automatically/.test(s.why), JSON.stringify(s));

s = await sys('choose', { id: a.id });
ok('choosing one that is not validated falls back, and says why', s.success && s.inUse?.id === b.id && /not passed validation/.test(s.why), JSON.stringify(s));

await api('mailbox.php', { token: T, accountId: acct, action: 'test_outgoing', id: a.id });
s = await sys('status');
ok('once it validates, the chosen one is used', s.inUse?.id === a.id && s.why === 'The mailbox you chose.', JSON.stringify(s));

mail.length = 0;
const t = await sys('test');
await new Promise(r => setTimeout(r, 300));
ok('the test is sent to the owner from the chosen address', t.success && mail.some(m => m.includes('support@system.test') && m.includes(OWNER)), JSON.stringify(t) + ' | ' + mail.join('\n').slice(0, 200));

mail.length = 0;
const code = await api('auth.php', { action: 'request_code', email: OWNER });
await new Promise(r => setTimeout(r, 300));
ok('sign-in codes go out from the chosen mailbox', code.success !== false && mail.some(m => /is your sign-in code/.test(m) && m.includes('support@system.test')), JSON.stringify(code) + ' | ' + mail.join('\n').slice(0, 200));

s = await sys('choose', { id: '' });
ok('"choose automatically" goes back to the first validated one', s.success && !s.chosenId, JSON.stringify(s));

/* A customer: cannot read or change it, and cannot point it at their own mailbox. */
const CUST = `cust-${Date.now()}@system.test`;
mail.length = 0;
const cust = await api('auth.php', { action: 'register', email: CUST, password: 'Another-horse-7x', name: 'Customer' });
let custToken = cust.token;
if (!custToken && cust.needsCode) {
  await new Promise(r => setTimeout(r, 300));
  const c = (mail.join('\n').match(/(\d{6}) is your sign-in code/g) ?? []).pop()?.slice(0, 6);
  const done = await api('auth.php', { action: 'register', email: CUST, password: 'Another-horse-7x', name: 'Customer', code: c });
  custToken = done.token;
}
ok('a customer can sign up (with the code from the system mailbox)', !!custToken, JSON.stringify(cust));
if (custToken) {
  const r1 = await api('system-mail.php', { token: custToken, action: 'status' });
  ok('a customer cannot see the system mailbox', !r1.success, JSON.stringify(r1));
  const r2 = await api('system-mail.php', { token: custToken, action: 'choose', id: a.id });
  ok('…nor choose it', !r2.success, JSON.stringify(r2));
}
const foreign = await sys('choose', { id: 'mb-not-mine' });
ok('the owner cannot choose a mailbox outside their workspaces', !foreign.success && foreign.field === 'system.mailbox', JSON.stringify(foreign));

/* The card, as the owner sees it. */
const br = await pw.chromium.launch();
const p = await br.newPage({ viewport: { width: 1280, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto(`${B}/login`, { waitUntil: 'networkidle' });
await p.getByLabel('Email or username').fill(OWNER);
await p.getByLabel('Password', { exact: true }).fill(PW);
await p.getByRole('button', { name: 'Sign in', exact: true }).click();
await p.waitForTimeout(2500);
await p.goto(`${B}/settings`, { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
ok('the owner sees the System email card', await p.getByRole('heading', { name: /System email/ }).count() > 0);
ok('…naming the mailbox in use', await p.getByText(/System emails go out from/).count() > 0);
await p.setViewportSize({ width: 390, height: 844 });
await p.waitForTimeout(400);
ok('no sideways scroll at 390px', (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
ok('no page errors', !errs.length, errs.join(' | '));
await br.close();

sink.close();
console.log(fail ? `\n${fail} failed` : '\nall passed');
process.exit(fail ? 1 : 0);
