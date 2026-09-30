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
const ownerBox = r.id;

/* Saved is not proved. Sign-up waits on this mailbox, so one that has never
   passed "Save & validate" must not be able to stop every new customer. */
r = await api('auth.php', { action: 'register', email: 'unproved@signup.test', password: 'Hq4#vL8!mTz2wE', name: 'Unproved' }, '10.7.1.5');
check('an owner mailbox not yet validated does not gate sign-up', r.success && !r.needsCode && !!r.token, JSON.stringify(r));
r = await api('mailbox.php', { token: owner.token, accountId: 'acct-owner-signup', action: 'test_outgoing', id: ownerBox });
check('the owner validates it', r.success, JSON.stringify(r));

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

console.log('\nInstant code, the 7-day trial, and the owner\'s view');
mail.length = 0;
r = await api('auth.php', { action: 'request_code', email: 'quick@signup.test' }, '10.7.2.1');
check('a new address can ask for an instant code', r.success, JSON.stringify(r));
await new Promise(res => setTimeout(res, 300));
/* The body is base64 (lib/mime.ts); the subject line is not. */
const qraw = mail.join('\n');
const qbody = qraw.split(/\r?\n\r?\n/).slice(1).join('\n').replace(/\s+/g, '');
let qmail = qraw;
try { qmail += Buffer.from(qbody, 'base64').toString('utf8').replace(/&amp;/g, '&'); } catch { /* not base64 */ }
const qcode = (qmail.match(/(\d{6}) is your sign-in code/) ?? [])[1];
check('the email carries a one-tap sign-in link with the same code', !!qcode && qmail.includes('Sign in instantly') && qmail.includes(`code=${qcode}`), qmail.slice(0, 300));
r = await api('auth.php', { action: 'verify_code', email: 'quick@signup.test', code: qcode }, '10.7.2.1');
check('the code makes the account and signs in', r.success && !!r.token, JSON.stringify(r));
const quick = r;

r = await api('customers.php', { token: quick.token, action: 'mine' });
check('a new account is on a 7-day trial', r.success && r.trial?.kind === 'trial' && r.trial.daysLeft === 7, JSON.stringify(r.trial));
check('and finds the welcome waiting', (r.notices ?? []).some(n => /trial has started/i.test(n.title)), JSON.stringify(r.notices));
r = await api('customers.php', { token: owner.token, action: 'mine' });
check('the owner has no trial', r.trial?.kind === 'owner', JSON.stringify(r.trial));
r = await api('customers.php', { token: customer.token, action: 'mine' });
check('accounts made by sign-up earlier are on it too', r.trial?.kind === 'trial', JSON.stringify(r.trial));

r = await api('customers.php', { token: quick.token, action: 'signups' });
check("a customer cannot read the owner's sign-up list", !r.success);
r = await api('customers.php', { token: owner.token, action: 'settings_save', settings: { kickoffUrl: 'javascript:alert(1)' } });
check('a booking link that is not https is refused', !r.success && r.field === 'kickoffUrl', JSON.stringify(r));
r = await api('customers.php', { token: owner.token, action: 'settings_save', settings: { kickoffUrl: 'https://cal.example/kickoff' } });
check('an https booking link is kept', r.success && r.settings.kickoffUrl === 'https://cal.example/kickoff', JSON.stringify(r));
r = await api('customers.php', { token: owner.token, action: 'signups' });
const row = (r.signups ?? []).find(x => x.email === 'quick@signup.test');
check('the owner sees the new sign-up and its trial', r.success && row?.trial?.kind === 'trial', JSON.stringify(row));
check('…but not themselves', !(r.signups ?? []).some(x => x.email === 'owner@signup.test'));

mail.length = 0;
r = await api('customers.php', { token: owner.token, action: 'message', to: ['quick@signup.test', 'stranger@nowhere.test'], title: 'Kickoff?', body: 'Book a call.', link: 'https://cal.example/kickoff', linkLabel: 'Book', email: true });
check('a message reaches customers only, in the app and by email', r.success && r.delivered === 1 && r.dropped === 1 && r.emailed === 1, JSON.stringify(r));
await new Promise(res => setTimeout(res, 300));
check('…and the email went to the customer', mail.join('\n').includes('quick@signup.test') && !mail.join('\n').includes('stranger@nowhere.test'));
r = await api('customers.php', { token: quick.token, action: 'mine' });
const note = (r.notices ?? []).find(n => n.title === 'Kickoff?');
check('the customer sees it with its button', note?.link === 'https://cal.example/kickoff', JSON.stringify(r.notices));
r = await api('customers.php', { token: customer.token, action: 'read', id: note?.id });
r = await api('customers.php', { token: quick.token, action: 'mine' });
check("somebody else cannot close it", (r.notices ?? []).some(n => n.id === note?.id));
await api('customers.php', { token: quick.token, action: 'read', id: note?.id });
r = await api('customers.php', { token: quick.token, action: 'mine' });
check('its reader can', !(r.notices ?? []).some(n => n.id === note?.id));

/* The end of a trial, without waiting a week. The database is local and the
   test owns it, so the clock is moved in the row. */
const { execSync } = await import('node:child_process');
const persist = process.env.PERSIST ? ` --persist-to ${process.env.PERSIST}` : '';
try {
  execSync(`npx wrangler d1 execute crmpro --local${persist} --command "UPDATE crm_users SET trial_ends_at = '2020-01-01T00:00:00.000Z' WHERE email = 'quick@signup.test'"`, { stdio: 'ignore' });
  r = await api('customers.php', { token: quick.token, action: 'mine' });
  check('an ended trial says so', r.trial?.kind === 'ended', JSON.stringify(r.trial));
  r = await api('ai.php', { token: quick.token, accountId: quick.user.accountId, action: 'generate', request: { contents: [{ role: 'user', parts: [{ text: 'hi' }] }] } });
  check("…and the operator's AI is refused by name", !r.success && r.code === 'trial_ended', JSON.stringify(r));
} catch {
  console.log('  (skipped the ended-trial checks: set PERSIST to the --persist-to directory to run them)');
}

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
