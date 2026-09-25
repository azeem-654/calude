/**
 * Sign-up proves the address, and sign-in codes never travel through a
 * customer's mailbox.
 *
 * Needs a fresh database, because it creates the install owner:
 *
 *   npx wrangler d1 migrations apply crmpro --local --persist-to /tmp/pc-signup
 *   npx wrangler dev --local --persist-to /tmp/pc-signup     (another terminal)
 *   npm run test:signup
 *
 * It runs its own SMTP sink on 127.0.0.1:2525, so the code that is mailed can
 * be read back — the only honest way to test "the right code works" is to use
 * the code that was really sent.
 *
 * The case that matters most is the tenant one. Codes used to go out through
 * the first mailbox on the install, whoever owned it; a customer on Gmail would
 * have had everybody's sign-in codes, the owner's included, in their Sent
 * folder.
 */
import net from 'node:net';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';
let passes = 0;
let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passes++; console.log(`  ✓ ${name}`); }
  else { failures++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

/* ── A mail server that accepts anything and remembers it ── */
const mail = [];
/* AUTH LOGIN sends two base64 lines after the command; the step counter
   answers each in turn. */
const sink = net.createServer();
sink.on('connection', sock => {
  let data = false; let buf = []; let pending = ''; let loginStep = 0;
  const w = s => sock.write(`${s}\r\n`);
  w('220 sink');
  sock.on('data', chunk => {
    pending += chunk.toString('utf8');
    let i;
    while ((i = pending.indexOf('\r\n')) >= 0) {
      const line = pending.slice(0, i);
      pending = pending.slice(i + 2);
      if (data) {
        if (line === '.') { data = false; mail.push(buf.join('\n')); buf = []; w('250 queued'); } else buf.push(line);
        continue;
      }
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
await new Promise(r => sink.listen(2525, '127.0.0.1', r));

async function api(path, body, ip = '10.7.0.1') {
  const r = await fetch(`${BASE}/api/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(body),
  });
  return r.json().catch(() => ({}));
}
const SMTP = { host: '127.0.0.1', port: 2525, encryption: 'none', username: 'u', password: 'p' };

console.log('\nSign-up');
const status = await api('auth.php', { action: 'status' });
if (status.hasOwner) {
  console.log('  This database already has an owner. Run it against a fresh --persist-to directory (see the top of this file).');
  process.exit(2);
}
const ownerPw = 'Tq9!vX2#pLm7wZ';
await api('auth.php', { action: 'bootstrap', email: 'owner@signup.test', password: ownerPw, name: 'Owner' });
const owner = await api('auth.php', { action: 'login', email: 'owner@signup.test', password: ownerPw });
check('the owner signs in', !!owner.token, JSON.stringify(owner));

let r = await api('auth.php', { action: 'register', email: 'early@signup.test', password: 'Rb4%kW8@nHs3qY', name: 'Early' }, '10.7.1.1');
check('with no owner mailbox, sign-up still works — unproved, as before', r.success && !r.needsCode && !!r.token, JSON.stringify(r));
const customer = r;

r = await api('mailbox.php', { token: customer.token, accountId: customer.user.accountId, action: 'save', smtp: SMTP, from: { email: 'shop@customer.test', name: 'Customer' } });
check('a customer connects a mailbox of their own', r.success, JSON.stringify(r));

mail.length = 0;
r = await api('auth.php', { action: 'register', email: 'second@signup.test', password: 'Jc6^mD1*zFt5uP', name: 'Second' }, '10.7.1.2');
check("a customer's mailbox is never used to send a sign-up code", r.success && !r.needsCode && mail.length === 0, JSON.stringify(r));
r = await api('auth.php', { action: 'request_code', email: 'owner@signup.test' }, '10.7.1.3');
check("…nor the owner's sign-in code", !r.success && mail.length === 0, JSON.stringify(r));

r = await api('mailbox.php', { token: owner.token, accountId: 'acct-owner-signup', action: 'save', smtp: SMTP, from: { email: 'hello@owner.test', name: 'Owner Co' } });
check("the owner connects a mailbox in their own workspace", r.success, JSON.stringify(r));

mail.length = 0;
const pw = 'Gv7&hN2!cXe9rK';
r = await api('auth.php', { action: 'register', email: 'new@signup.test', password: pw, name: 'Newbie' }, '10.7.1.4');
check('sign-up now posts a code and creates nothing', r.success && r.needsCode && !r.token, JSON.stringify(r));
r = await api('auth.php', { action: 'login', email: 'new@signup.test', password: pw }, '10.7.1.4');
check('…so the password does not sign in yet', !r.success);
await new Promise(res => setTimeout(res, 300));
const sent = mail.join('\n');
const code = (sent.match(/(\d{6}) is your sign-in code/) ?? [])[1];
check("the code went out from the owner's mailbox", !!code && sent.includes('hello@owner.test') && !sent.includes('shop@customer.test'), sent.slice(0, 200));
r = await api('auth.php', { action: 'register', email: 'new@signup.test', password: pw, name: 'Newbie', code: code === '000000' ? '111111' : '000000' }, '10.7.1.4');
check('a wrong code is refused', !r.success);
r = await api('auth.php', { action: 'register', email: 'new@signup.test', password: pw, name: 'Newbie', code }, '10.7.1.4');
check('the right code creates the account', r.success && !!r.token, JSON.stringify(r));
r = await api('auth.php', { action: 'register', email: 'new@signup.test', password: pw, name: 'Newbie', code }, '10.7.1.4');
check('and cannot be used twice', !r.success);
r = await api('auth.php', { action: 'login', email: 'new@signup.test', password: pw }, '10.7.1.4');
check('the new account signs in with its password', r.success);

console.log('\nLogos');
const res = await fetch(`${BASE}/api/logo.php?p=pf-anything&s=0000`);
check('an unsigned logo address is a 404, not a lookup', res.status === 404);
r = await api('projects.php', { token: customer.token, accountId: customer.user.accountId, action: 'read_logo', url: 'http://127.0.0.1:2525/' });
check('logo import refuses a private address', !r.success && /IP address|private|this server/i.test(r.error ?? ''), JSON.stringify(r));
r = await api('projects.php', { token: customer.token, accountId: 'somebody-elses-workspace', action: 'read_logo', url: 'https://example.com' });
check("logo import needs a workspace you may open", !r.success);

sink.close();
console.log(`\n${passes} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);
