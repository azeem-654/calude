/**
 * E-7: a hard bounce or a complaint suppresses the address; a temporary
 * failure does not. Provider webhooks (Resend, Brevo) and bounce messages
 * read by the reply cron. `npm run test:bounces`
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { handleMailWebhook, mailWebhookUrl, parseDsn, svixOk } from '../worker/src/lib/bounces';
import { isSuppressed } from '../worker/src/lib/suppression';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d: unknown = '') => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c ? '' : ` — ${JSON.stringify(d).slice(0, 300)}`}`); };

const sql = new DatabaseSync(':memory:');
const dir = new URL('../worker/migrations/', import.meta.url);
for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) sql.exec(readFileSync(new URL(f, dir), 'utf8'));
const norm = (a: unknown[]) => a.map(v => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v)) as (string | number | null)[];
class Stmt {
  constructor(private q: string, private a: unknown[] = []) {}
  bind(...a: unknown[]) { return new Stmt(this.q, a); }
  async first<T>() { return (sql.prepare(this.q).get(...norm(this.a)) ?? null) as T | null; }
  async all<T>() { return { results: sql.prepare(this.q).all(...norm(this.a)) as T[] }; }
  async run() { const r = sql.prepare(this.q).run(...norm(this.a)); return { meta: { changes: Number(r.changes) } }; }
}
const env = { DB: { prepare: (q: string) => new Stmt(q), batch: async (x: Stmt[]) => Promise.all(x.map(y => y.run())) } } as never;
const now = new Date().toISOString();
sql.prepare("INSERT INTO crm_hosted_domains (id, account_id, domain, zone_id, created_at) VALUES ('d1', 'acct-a', 'alpha.test', 'z1', ?)").run(now);
sql.prepare("INSERT INTO crm_hosted_domains (id, account_id, domain, zone_id, created_at) VALUES ('d2', 'acct-b', 'beta.test', 'z2', ?)").run(now);
sql.prepare("INSERT INTO crm_delivery_log (id, account_id, channel, recipient, status, sent_from, created_at) VALUES ('l1', 'acct-b', 'email', 'gone@x.test', 'sent', 'hi@beta.test', ?)").run(now);

console.log('Bounce messages');
const dsn = parseDsn({ from: 'MAILER-DAEMON@mx.example', subject: 'Undelivered Mail Returned to Sender', body: 'Reporting-MTA: dns; mx\nFinal-Recipient: rfc822; nobody@x.test\nAction: failed\nStatus: 5.1.1\n\nFinal-Recipient: rfc822; full@x.test\nAction: delayed\nStatus: 4.2.2\n' });
ok('a DSN names the permanently failed address', dsn.isDsn && dsn.hard.join() === 'nobody@x.test', dsn);
const gmail = parseDsn({ from: 'mailer-daemon@googlemail.com', fromName: 'Mail Delivery Subsystem', subject: 'Delivery Status Notification (Failure)', body: "Address not found\nYour message wasn't delivered to lost@x.test because the address couldn't be found.\nThe response was: 550 5.1.1 The email account that you tried to reach does not exist." });
ok('…and the wording when the report part is missing', gmail.isDsn && gmail.hard.includes('lost@x.test'), gmail);
const temp = parseDsn({ from: 'mailer-daemon@mx.example', subject: 'Delivery Status Notification (Delay)', body: 'Final-Recipient: rfc822; slow@x.test\nAction: delayed\nStatus: 4.4.1\n' });
ok('a delay is a bounce message but suppresses nothing', temp.isDsn && temp.hard.length === 0, temp);
ok('an ordinary reply is not a bounce', !parseDsn({ from: 'ann@x.test', subject: 'Re: quote', body: 'Error 550 on my side, call me' }).isDsn);

console.log('Provider webhooks');
const url = await mailWebhookUrl(env, 'https://app.test', 'resend');
const post = (u: string, b: unknown, h: Record<string, string> = {}) => handleMailWebhook(new Request(u, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) }), env);
ok('the wrong token is refused', (await post(url.replace(/t=[^&]+/, 't=nope'), {})).status === 403);
await post(url, { type: 'email.bounced', data: { from: 'Alpha <hi@alpha.test>', to: ['dead@x.test'], bounce: { type: 'Permanent', message: '550 no such user' } } });
ok('a Resend hard bounce suppresses the address for the sending workspace', await isSuppressed(env, 'acct-a', 'dead@x.test'));
ok('…and only that workspace', !(await isSuppressed(env, 'acct-b', 'dead@x.test')));
await post(url, { type: 'email.bounced', data: { from: 'hi@alpha.test', to: ['busy@x.test'], bounce: { type: 'Transient' } } });
ok('a transient bounce suppresses nothing', !(await isSuppressed(env, 'acct-a', 'busy@x.test')));
await post(url, { type: 'email.complained', data: { from: 'hi@alpha.test', to: ['angry@x.test'] } });
ok('a complaint suppresses', await isSuppressed(env, 'acct-a', 'angry@x.test'));
await post(url, { type: 'email.bounced', data: { from: 'spoof@unknown.test', to: ['who@x.test'], bounce: { type: 'Permanent' } } });
ok('a From on no hosted domain suppresses nowhere', (sql.prepare("SELECT COUNT(*) AS n FROM crm_unsubscribes WHERE email = 'who@x.test'").get() as { n: number }).n === 0);
const brevo = url.replace('p=resend', 'p=brevo');
await post(brevo, { event: 'hard_bounce', email: 'gone@x.test', reason: 'unknown user' });
ok('a Brevo hard bounce with no sender finds who last mailed it from a hosted domain', await isSuppressed(env, 'acct-b', 'gone@x.test'));
ok('…and marks that delivery bounced', (sql.prepare("SELECT status FROM crm_delivery_log WHERE id = 'l1'").get() as { status: string }).status === 'bounced');
await post(brevo, { event: 'soft_bounce', email: 'soft@x.test', sender_email: 'hi@beta.test' });
ok('a Brevo soft bounce suppresses nothing', !(await isSuppressed(env, 'acct-b', 'soft@x.test')));

console.log('Resend signatures');
const secret = 'whsec_' + Buffer.from('a-test-signing-secret-32-bytes!!').toString('base64');
const body = '{"type":"email.bounced"}', id = 'msg_1', ts = String(Math.floor(Date.now() / 1000));
const sig = createHmac('sha256', Buffer.from(secret.slice(6), 'base64')).update(`${id}.${ts}.${body}`).digest('base64');
ok('a correctly signed delivery verifies', await svixOk(secret, new Headers({ 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` }), body));
ok('a tampered body does not', !(await svixOk(secret, new Headers({ 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` }), body + ' ')));
ok('an old timestamp does not', !(await svixOk(secret, new Headers({ 'svix-id': id, 'svix-timestamp': String(Number(ts) - 3600), 'svix-signature': `v1,${sig}` }), body)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
