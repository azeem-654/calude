/**
 * Booking reminders and the owner's cancel, end to end, against the real
 * Worker and an SMTP sink (2026-11-23):
 *
 *  - the cron sends the guest the "Reminder before the meeting" email when its
 *    time comes, once, with the reschedule/cancel link;
 *  - a booking made inside the reminder window is not reminded;
 *  - the owner switching reminders off stops them;
 *  - a reschedule clears the reminder so the new time is reminded;
 *  - the owner cancelling an upcoming booking emails the guest.
 *
 *   npm run test:bookingreminders
 *
 * Self-contained: an SMTP sink on 127.0.0.1:8843, a fresh D1 in a temporary
 * directory, `wrangler dev --test-scheduled` on :8841. API only — no build
 * needed. Google Calendar's busy times are covered by `test:bookingtz` (pure);
 * Google's API has no local mock here.
 */
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';

const PORT = 8841, SINK = 8843;
const B = `http://localhost:${PORT}`;
let fail = 0;
const ok = (name, cond, detail = '') => { if (!cond) fail++; console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ` — ${String(detail).slice(0, 400)}`}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readable = m => m.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  + Buffer.from((m.split(/\r?\n\r?\n/).slice(1).join('\n').match(/^[A-Za-z0-9+/=]+$/gm) ?? []).join(''), 'base64').toString('utf8');

/* ── The SMTP sink ── */
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

/* ── A fresh database and the real Worker ── */
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'bkr-d1-'));
const sql = q => JSON.parse(execSync(`npx wrangler d1 execute crmpro --local --persist-to ${persist} --json --command ${JSON.stringify(q)}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
const wr = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--persist-to', persist, '--test-scheduled', '--var', `APP_ORIGIN:${B}`], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
let wlog = '';
wr.stdout.on('data', c => { wlog += c; }); wr.stderr.on('data', c => { wlog += c; });
const stop = () => { try { process.kill(-wr.pid, 'SIGTERM'); } catch { /* gone */ } sink.close(); };
process.on('exit', stop);
process.on('uncaughtException', e => { console.log(e, wlog.slice(-1500)); stop(); process.exit(1); });
for (let i = 0; i < 90; i++) { try { const r = await fetch(`${B}/api/data.php`, { method: 'POST', headers: { Connection: 'close' }, body: '{"action":"ping"}' }); if (r.ok) break; } catch { /* starting */ } await sleep(1000); }

let ipN = 1;
const api = (p, body) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.9.4.${ipN++ % 250}` }, body: JSON.stringify(body) }).then(r => r.json().catch(() => ({})));
/* The cron answers at once and works in waitUntil, so the mail is waited for. */
const tick = async () => { for (let i = 0; i < 3; i++) { try { await fetch(`${B}/cdn-cgi/handler/scheduled`, { headers: { Connection: 'close' } }); break; } catch { await sleep(1000); } } };
const waitMail = async (test, ms = 20_000) => { const end = Date.now() + ms; while (Date.now() < end) { const m = mail.find(test); if (m) return m; await sleep(500); } return null; };

console.log('\nBooking reminders');
const OWNER = 'owner@bkr.test', PW = 'Tq9!vX2#pLm7wZ-bkr';
const boot = await api('auth.php', { action: 'bootstrap', email: OWNER, password: PW, name: 'Owner' });
if (!boot.success) { console.log('bootstrap failed', boot, wlog.slice(-2000)); stop(); process.exit(2); }
const A = 'acct-bkr-owner';
sql(`INSERT INTO crm_workspaces (account_id, owner_email, created_at) VALUES ('${A}', '${OWNER}', '2026-11-01T00:00:00Z')`);
const T = (await api('auth.php', { action: 'login', email: OWNER, password: PW })).token;
ok('signed in', !!T);

let r = await api('mailbox.php', { token: T, accountId: A, action: 'save', label: 'Clinic', smtp: { host: '127.0.0.1', port: SINK, encryption: 'none', username: 'u', password: 'p' }, from: { email: 'hello@clinic.test', name: 'Bright Clinic' } });
ok('a mailbox is connected', r.success, JSON.stringify(r));

const allDay = { enabled: true, from: '00:00', to: '24:00' };
const weekly = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(k => [k, allDay]));
const publish = automations => api('booking.php', {
  token: T, accountId: A, action: 'publish',
  public: { slug: 'bright-clinic', title: 'Consultation', timezone: 'UTC', duration: 30, weekly, minNoticeMin: 0, windowDays: 60 },
  private: { automations },
});
r = await publish({ confirmEmail: true, ownerNotify: false, reminderEmail: true, reminderMinutes: 60 });
ok('the page is published with a 60-minute reminder', r.success, JSON.stringify(r));

/* A slot on the 30-minute grid, 40–70 minutes ahead: inside the 60-minute window. */
const slotAt = minsAhead => {
  const t = new Date(Math.ceil((Date.now() + minsAhead * 60000) / 1_800_000) * 1_800_000);
  return { slotDate: t.toISOString().slice(0, 10), slotTime: t.toISOString().slice(11, 16) };
};
const book = (email, slot) => api('booking.php', { action: 'create', accountId: A, guestName: 'Gina Guest', guestEmail: email, timezone: 'Asia/Bangkok', ...slot });

const s1 = slotAt(40);
const b1 = await book('gina@guest.test', s1);
ok('a booking is taken', b1.success && b1.emailed === true, JSON.stringify(b1));
/* Booked two hours ago, as if made yesterday: its reminder is due now. */
sql(`UPDATE crm_bookings SET created_at = '${new Date(Date.now() - 7_200_000).toISOString()}' WHERE id = '${b1.id}'`);
const b2 = await book('late@guest.test', slotAt(100));
/* Booked just now for 40 minutes ahead: inside the window, so not reminded. */
const b3 = await book('just@guest.test', slotAt(40 + 30));
ok('two more bookings are taken', b2.success && b3.success, JSON.stringify([b2, b3]));

await tick();
const rem = await waitMail(m => /Subject: Reminder: Consultation/.test(m) && /gina@guest\.test/.test(m));
ok('the cron sends the guest a reminder', !!rem, mail.map(m => m.match(/Subject: .*/)?.[0]).join(' | '));
ok('the reminder carries the reschedule/cancel link on the booking\'s address', !!rem && rem.includes(`${B}/book?manage=${b1.id}.`) && /Reschedule or cancel/.test(rem), rem?.slice(0, 600));
ok('and the guest\'s own time', !!rem && /your time/.test(rem));
let row = sql(`SELECT reminded_at, data FROM crm_bookings WHERE id = '${b1.id}'`)[0];
ok('the booking is marked reminded, and sent', !!row?.reminded_at && JSON.parse(row.data).reminder === 'sent', JSON.stringify(row));
ok('one not yet due is left alone', !sql(`SELECT reminded_at FROM crm_bookings WHERE id = '${b2.id}'`)[0].reminded_at);
ok('one booked inside the window gets no reminder', !mail.some(m => /Subject: Reminder/.test(m) && /just@guest\.test/.test(m)));

await tick(); await sleep(4000);
ok('a second run does not send it again', mail.filter(m => /Subject: Reminder/.test(m) && /gina@guest\.test/.test(m)).length === 1);

/* Rescheduling clears the reminder: the new time is reminded in its turn. */
const key2 = b2.key;
/* 10–40 minutes ahead: the half hour before b1's, free, and inside the window. */
r = await api('booking.php', { action: 'reschedule', id: b2.id, key: key2, ...slotAt(10) });
const moved = sql(`SELECT reminded_at, slot_time FROM crm_bookings WHERE id = '${b2.id}'`)[0];
ok('a guest can reschedule', r.success, JSON.stringify(r));
ok('a moved booking waits to be reminded again', moved && moved.reminded_at === null, JSON.stringify(moved));

/* The owner switches reminders off: nothing more goes. */
await publish({ confirmEmail: true, ownerNotify: false, reminderEmail: false, reminderMinutes: 60 });
sql(`UPDATE crm_bookings SET created_at = '${new Date(Date.now() - 7_200_000).toISOString()}' WHERE id = '${b2.id}'`);
await tick(); await sleep(5000);
ok('with reminders switched off, none is sent', !mail.some(m => /Subject: Reminder/.test(m) && /late@guest\.test/.test(m)));

/* The owner cancels an upcoming booking: the guest is told. */
const before = mail.length;
r = await api('booking.php', { token: T, accountId: A, action: 'set_status', id: b1.id, status: 'cancelled' });
ok('the owner cancels a booking', r.success && r.emailed === true, JSON.stringify(r));
ok('the guest gets the cancellation', !!(await waitMail(m => mail.indexOf(m) >= before && /Subject: Cancelled: Consultation/.test(m) && /gina@guest\.test/.test(m), 8000)));
r = await api('booking.php', { token: T, accountId: A, action: 'set_status', id: b1.id, status: 'cancelled' });
ok('cancelling again does not email again', r.success && r.emailed === false, JSON.stringify(r));

/* Another workspace cannot cancel it (or anyone's). */
r = await api('auth.php', { action: 'register', email: 'eve@other.test', password: 'Another-horse-7x', name: 'Eve' });
const TE = r.token ?? (await api('auth.php', { action: 'login', email: 'eve@other.test', password: 'Another-horse-7x' })).token;
r = await api('booking.php', { token: TE, accountId: A, action: 'set_status', id: b3.id, status: 'cancelled' });
ok('another account cannot cancel this workspace\'s booking', !r.success && sql(`SELECT status FROM crm_bookings WHERE id = '${b3.id}'`)[0].status === 'confirmed', JSON.stringify(r));

/* The public slots answer still works with no calendar connected. */
r = await api('booking.php', { action: 'slots', accountId: A, from: s1.slotDate, to: s1.slotDate });
ok('the public slots answer lists what is booked', r.success && Array.isArray(r.booked) && r.booked.length >= 1, JSON.stringify(r));

stop();
console.log(fail ? `\n${fail} failed` : '\nall passed');
process.exit(fail ? 1 : 0);
