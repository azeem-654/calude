/**
 * Email on the customer's own domain (worker/src/lib/hostedMail.ts), end to
 * end: the real Worker on a fresh D1, with stand-ins for Cloudflare and Resend
 * (HOSTED_CF_BASE / HOSTED_RESEND_BASE). The owner switches it on; a customer
 * adds a domain and is shown the nameservers; once Cloudflare says the zone
 * is active, "Check again" switches on Email Routing with the catch-all to
 * this Worker and writes Resend's records into the zone; an address becomes a
 * mailbox; a real message posted to wrangler's local email handler lands in
 * the inbox read (imap-fetch.php); mail to an address that does not exist is
 * refused; another workspace can touch none of it; secrets never come back.
 *
 * Needs `npm run build` with VITE_BASE=/ is NOT required (API only).
 *   node test/hostedMail.e2e.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';

const PORT = 8841, INSPECT = 9341, MOCK = 8842;
const B = `http://localhost:${PORT}`, M = `http://127.0.0.1:${MOCK}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0, passed = 0;
const ok = (name, cond, detail = '') => { if (cond) passed++; else failed++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 600)}`}`); };

/* ── Cloudflare and Resend, as far as this feature talks to them ── */
const st = { zoneActive: false, zones: {}, records: [], catchAll: null, routing: false, resendVerified: false, verifyCalls: 0, deleted: [], rules: [], patched: [] };
const mock = http.createServer((req, res) => {
  let b = '';
  req.on('data', c => { b += c; });
  req.on('end', () => {
    const u = new URL(req.url, M);
    const send = (s, j) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(j)); };
    const okc = result => send(200, { success: true, result, errors: [] });
    const p = u.pathname, body = b ? JSON.parse(b) : {};
    let m;
    if (/^\/cf\/accounts\/\w+\/tokens\/verify$/.test(p)) return send(401, { success: false, errors: [{ message: 'Invalid API Token' }] });
    if (p === '/cf/user/tokens/verify') return req.headers.authorization === 'Bearer cf-good' ? okc({ status: 'active' }) : send(401, { success: false, errors: [{ message: 'Invalid API Token' }] });
    if (p === '/cf/zones' && req.method === 'GET') return okc(Object.values(st.zones).filter(z => z.name === u.searchParams.get('name')));
    if (p === '/cf/zones' && req.method === 'POST') { const z = { id: `z${Object.keys(st.zones).length + 1}`, name: body.name, jump: body.jump_start }; st.zones[z.id] = z; return okc({ ...z, status: 'pending', name_servers: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'] }); }
    if ((m = /^\/cf\/zones\/(\w+)$/.exec(p))) {
      if (req.method === 'DELETE') { st.deleted.push(m[1]); delete st.zones[m[1]]; return okc({ id: m[1] }); }
      return okc({ id: m[1], status: st.zoneActive ? 'active' : 'pending', name_servers: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'] });
    }
    if (/\/email\/routing\/enable$/.test(p)) { st.routing = true; return okc({ enabled: true }); }
    if (/\/email\/routing\/rules\/catch_all$/.test(p)) { st.catchAll = body; return okc(body); }
    /* The owner's own address: one literal rule per address. */
    if (/\/email\/routing\/rules$/.test(p) && req.method === 'GET') return okc(st.rules);
    if (/\/email\/routing\/rules$/.test(p) && req.method === 'POST') { const r = { id: `rule${st.rules.length + 1}`, ...body }; st.rules.push(r); return okc(r); }
    if ((m = /\/email\/routing\/rules\/(\w+)$/.exec(p)) && req.method === 'DELETE') { st.rules = st.rules.filter(r => r.id !== m[1]); return okc({ id: m[1] }); }
    if ((m = /\/dns_records\/(\w+)$/.exec(p)) && req.method === 'PATCH') { const r = st.records.find(x => x.id === m[1]); if (r) Object.assign(r, body); st.patched.push(body); return okc(r); }
    if (/\/email\/routing$/.test(p)) return okc({ enabled: st.routing, status: 'ready' });
    if (/\/dns_records$/.test(p) && req.method === 'GET') return okc(st.records.filter(r => r.type === u.searchParams.get('type') && r.name === u.searchParams.get('name')));
    if (/\/dns_records$/.test(p) && req.method === 'POST') { st.records.push(body); return okc({ id: `r${st.records.length}`, ...body }); }
    /* Resend */
    if (p === '/rs/domains' && req.method === 'POST') return send(200, { id: 'rd1', name: body.name, status: 'not_started', records: [
      { record: 'DKIM', name: 'resend._domainkey', type: 'TXT', value: 'p=MIGfMA0' },
      { record: 'SPF', name: 'send', type: 'MX', value: 'feedback-smtp.eu-west-1.amazonses.com', priority: 10 },
      { record: 'SPF', name: 'send', type: 'TXT', value: 'v=spf1 include:amazonses.com ~all' },
    ] });
    if (p === '/rs/domains/rd1/verify') { st.verifyCalls++; st.resendVerified = true; return send(200, { object: 'domain', id: 'rd1' }); }
    if (p === '/rs/domains/rd1') return send(200, { id: 'rd1', status: st.resendVerified ? 'verified' : 'pending', records: [] });
    send(404, { success: false, errors: [{ message: `mock has no ${req.method} ${p}` }] });
  });
});
await new Promise(r => mock.listen(MOCK, '127.0.0.1', r));

const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'hosted-d1-'));
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
const vars = [`APP_ORIGIN:${B}`, `HOSTED_CF_BASE:${M}/cf`, `HOSTED_RESEND_BASE:${M}/rs`];
const wr = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--inspector-port', String(INSPECT), '--persist-to', persist, ...vars.flatMap(v => ['--var', v])], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
let wlog = '';
wr.stdout.on('data', c => { wlog += c; }); wr.stderr.on('data', c => { wlog += c; });
const stop = () => { try { process.kill(-wr.pid, 'SIGTERM'); } catch { /* gone */ } mock.close(); };
process.on('exit', stop);
for (let i = 0; i < 90; i++) { try { const r = await fetch(`${B}/api/data.php`, { method: 'POST', headers: { Connection: 'close' }, body: '{"action":"ping"}' }); if (r.ok) break; } catch { /* starting */ } await sleep(1000); }

let ipN = 1;
const api = (p, body) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.7.3.${ipN++ % 250}` }, body: JSON.stringify(body) }).then(r => r.json().catch(() => ({})));

const boot = await api('auth.php', { action: 'bootstrap', email: 'owner@hosted.test', password: 'Tq9!vX2#pLm7wZ-host', name: 'Owner' });
if (!boot.success) { console.log('bootstrap failed', boot, wlog.slice(-2000)); stop(); process.exit(2); }
const O = boot.token;
const reg = await api('auth.php', { action: 'register', email: 'cara@cust.test', password: 'Another-horse-7cara', name: 'Cara' });
const C = { token: reg.token, acct: reg.user?.accountId };
const reg2 = await api('auth.php', { action: 'register', email: 'dan@other.test', password: 'Another-horse-7dan', name: 'Dan' });
const D = { token: reg2.token, acct: reg2.user?.accountId };
ok('two customer workspaces', !!C.acct && !!D.acct && C.acct !== D.acct, [reg, reg2]);
const H = (who, action, extra = {}) => api('hosted-mail.php', { token: who.token, accountId: who.acct, action, ...extra });

console.log('\nNot switched on yet');
let s = await H(C, 'status');
ok('a customer is told it is not available', s.success && s.available === false, s);
let r = await H(C, 'add_domain', { domain: 'cara-bakes.com' });
ok('…and cannot add a domain', !r.success && /not switched on/.test(r.error), r);

console.log('\nThe owner switches it on');
r = await api('hosted-mail.php', { token: C.token, action: 'save_config', cfToken: 'cf-good', cfAccountId: 'a'.repeat(32) });
ok('a customer cannot set the platform keys', !r.success && r.code === 'not_owner', r);
r = await api('hosted-mail.php', { token: O, action: 'save_config', cfToken: 'cf-bad', cfAccountId: 'a'.repeat(32), sendProvider: 'resend', sendKey: 're_secret_123' });
ok('a token Cloudflare refuses is refused at its box', !r.success && r.field === 'hosted.cfToken', r);
r = await api('hosted-mail.php', { token: O, action: 'save_config', cfToken: 'cf-good', cfAccountId: 'nope' });
ok('a malformed account id is refused at its box', !r.success && r.field === 'hosted.cfAccountId', r);
r = await api('hosted-mail.php', { token: O, action: 'save_config', cfToken: 'cf-good', cfAccountId: 'a'.repeat(32), workerName: 'crmpro', sendProvider: 'resend', sendKey: 're_secret_123' });
ok('saved, and the answer carries no secret', r.success && r.config?.configured && r.config.hasToken && r.config.hasSendKey && !JSON.stringify(r).includes('cf-good') && !JSON.stringify(r).includes('re_secret_123'), r);
const view = await api('hosted-mail.php', { token: O, action: 'config' });
ok('…and reading it back never shows them either', view.success && !JSON.stringify(view).includes('cf-good') && !JSON.stringify(view).includes('re_secret'), view);

console.log('\nA customer adds their domain');
r = await H(C, 'add_domain', { domain: 'gmail.com' });
ok('a mail provider\'s domain is refused at its box', !r.success && r.field === 'hosted.domain', r);
r = await H(C, 'add_domain', { domain: 'https://www.Cara-Bakes.com/' });
const dom = r.domains?.[0];
ok('added as a zone on the operator\'s account, records copied across, nameservers shown', r.success && dom?.domain === 'cara-bakes.com' && dom.zone === 'pending' && dom.nameservers.length === 2 && Object.values(st.zones)[0]?.jump === true, r);
ok('…receiving and sending wait for the nameservers', dom?.receiving === 'off' && st.catchAll === null, dom);
r = await H(D, 'add_domain', { domain: 'cara-bakes.com' });
ok('another workspace cannot claim the same domain', !r.success && /another account/.test(r.error), r);
r = await H(C, 'add_address', { domainId: dom.id, local: 'hello', name: 'Cara Bakes' });
ok('an address can be added while waiting', r.success && r.address === 'hello@cara-bakes.com', r);
r = await H(C, 'add_address', { domainId: dom.id, local: 'bad local!' });
ok('a bad address is refused at its box', !r.success && r.field === 'hosted.local', r);
r = await H(D, 'add_address', { domainId: dom.id, local: 'steal' });
ok('another workspace cannot add an address to it', !r.success && /not in this workspace/.test(r.error), r);
let mbs = await api('mailbox.php', { token: C.token, accountId: C.acct, action: 'list' });
let mb = (mbs.mailboxes ?? []).find(x => x.from?.email === 'hello@cara-bakes.com');
ok('the address is a mailbox, not yet able to send or receive, and says why', !!mb && mb.provider.name === 'hosted' && !mb.provider.hasKey && mb.incoming.state === 'not_set_up' && /nameservers/.test(mb.incoming.problem?.summary ?? '') && mb.outgoing.state === 'not_set_up', mb);

console.log('\nThe nameservers change');
st.zoneActive = true;
r = await H(C, 'refresh', { domainId: dom.id });
const d2 = r.domains?.[0];
ok('receiving on: routing enabled and every message sent to this Worker', r.success && d2?.zone === 'active' && d2.receiving === 'on' && st.catchAll?.actions?.[0]?.value?.[0] === 'crmpro' && st.catchAll.matchers?.[0]?.type === 'all', [d2, st.catchAll]);
ok('sending: Resend\'s records written into the zone (DKIM, the bounce MX and SPF) plus a DMARC policy', ['resend._domainkey.cara-bakes.com', 'send.cara-bakes.com', '_dmarc.cara-bakes.com'].every(n => st.records.some(x => x.name === n)) && st.records.some(x => x.type === 'MX' && x.priority === 10), st.records);
ok('…and verification asked for, said as still pending', st.verifyCalls >= 1 && d2?.sending === 'pending', d2);
r = await H(C, 'refresh', { domainId: dom.id });
ok('"Check again" once the provider has verified it: verified', r.domains?.[0]?.sending === 'verified', r.domains?.[0]);
r = await H(D, 'refresh', { domainId: dom.id });
ok('another workspace cannot refresh it', !r.success, r);
mbs = await api('mailbox.php', { token: C.token, accountId: C.acct, action: 'list' });
mb = (mbs.mailboxes ?? []).find(x => x.from?.email === 'hello@cara-bakes.com');
ok('the mailbox now sends and receives', mb?.incoming.state === 'connected' && mb?.outgoing.state === 'connected', mb);
r = await api('mailbox.php', { token: C.token, accountId: C.acct, action: 'test_outgoing', id: mb.id });
ok('Validate answers from the domain\'s state, not by logging in anywhere', r.success && /verified/.test(r.message), r);
r = await api('mailbox.php', { token: C.token, accountId: C.acct, action: 'save', id: mb.id, from: { email: 'ceo@other-company.com' } });
ok('the mailbox form cannot repoint a hosted address at another domain', !r.success && /own domain/.test(r.error), r);
r = await api('mailbox.php', { token: C.token, accountId: C.acct, action: 'delete', id: mb.id });
ok('…nor delete it behind the domain\'s back', !r.success, r);

console.log('\nMail arrives');
const eml = (to, subject) => [
  'From: "Pat Customer" <pat@example.org>', `To: ${to}`, `Subject: ${subject}`, 'Date: Tue, 03 Nov 2026 09:00:00 +0000',
  'Message-ID: <abc123@example.org>', 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', '', 'Do you make wedding cakes?', '',
].join('\r\n');
const deliver = (to, subject) => fetch(`${B}/cdn-cgi/handler/email?from=pat@example.org&to=${encodeURIComponent(to)}`, { method: 'POST', headers: { 'Content-Type': 'message/rfc822' }, body: eml(to, subject) });
let er = await deliver('hello@cara-bakes.com', 'Wedding cake');
ok('a message to the address is accepted', er.status < 400, `${er.status} ${await er.text().catch(() => '')}`);
await sleep(500);
const inbox = await api('imap-fetch.php', { token: C.token, accountId: C.acct, mailboxId: mb.id });
ok('…and is in the inbox, read as the inbox reads any mailbox', inbox.success && inbox.messages?.[0]?.subject === 'Wedding cake' && inbox.messages[0].from === 'pat@example.org' && /wedding cakes/.test(inbox.messages[0].body), inbox);
const other = await api('imap-fetch.php', { token: D.token, accountId: D.acct, mailboxId: mb.id });
ok('another workspace cannot read it', !(other.messages ?? []).length, other);
er = await deliver('nobody@cara-bakes.com', 'Lost');
const rejText = await er.text().catch(() => '');
s = await H(C, 'status');
ok('mail to an address that does not exist is refused, not stored', /No such address/i.test(rejText + wlog) && s.addresses?.[0]?.messages === 1, [er.status, rejText.slice(0, 200), s.addresses]);

console.log('\nSending as somebody else\'s domain (E-1)');
/* Dan gets his own verified hosted domain, then tries to send as Cara's.
   The platform's key has every hosted domain verified on it, so the From
   must be the mailbox's own — never the request's. */
r = await H(D, 'add_domain', { domain: 'dan-shop.com' });
const dd = (r.domains ?? []).find(x => x.domain === 'dan-shop.com');
r = await H(D, 'add_address', { domainId: dd?.id, local: 'sales', name: 'Dan' });
await H(D, 'refresh', { domainId: dd?.id });
r = await H(D, 'refresh', { domainId: dd?.id });
ok('the other workspace has its own verified hosted address', r.domains?.find(x => x.domain === 'dan-shop.com')?.sending === 'verified', r.domains);
const spoof = { token: D.token, accountId: D.acct, fromEmail: 'hello@cara-bakes.com', fromName: 'Cara', to: 'victim@example.org', subject: 'Invoice', html: '<p>Pay here</p>' };
r = await api('provider-send.php', spoof);
ok('provider-send refuses a From on another workspace\'s hosted domain, naming both', !r.success && /sends only as sales@dan-shop\.com/.test(r.error ?? r.message) && /hello@cara-bakes\.com/.test(r.error ?? r.message), r);
r = await api('smtp-send.php', spoof);
ok('…and so does smtp-send', !r.success && /sends only as sales@dan-shop\.com/.test(r.error ?? r.message), r);
r = await api('provider-send.php', { ...spoof, fromEmail: 'ceo@dan-shop.com' });
ok('…as does another address on its own domain that is not this mailbox', !r.success && /sends only as/.test(r.error ?? r.message), r);
r = await api('provider-send.php', { ...spoof, fromEmail: 'Sales@Dan-Shop.com', to: 'nobody@invalid.invalid' });
ok('its own address is not refused for its From', !/sends only as/.test(r.error ?? r.message ?? ''), r);

console.log('\nThe owner\'s own address, received here');
/* owner-site.com is already the owner's zone (as protectedcentral.com is);
   support@ there is a send-only mailbox in the owner's workspace. */
st.zones.zown = { id: 'zown', name: 'owner-site.com', status: 'active' };
st.zones.zmx = { id: 'zmx', name: 'gmail-hosted.com', status: 'active' };
st.records.push({ id: 'spf1', type: 'TXT', name: 'owner-site.com', content: '"v=spf1 include:spf.brevo.com ~all"' });
st.records.push({ id: 'mx1', type: 'MX', name: 'gmail-hosted.com', content: 'aspmx.l.google.com' });
const OW = 'ownerws1';
const saveOwn = email => api('mailbox.php', { token: O, accountId: OW, action: 'save', label: email, from: { email, name: 'Support' }, provider: { name: 'brevo', key: 'xkeysib-owner-test' } });
await saveOwn('support@owner-site.com');
await saveOwn('help@gmail-hosted.com');
r = await api('hosted-mail.php', { token: C.token, action: 'own_status' });
ok('a customer cannot see or change the owner\'s own addresses', !r.success && r.code === 'not_owner', r);
r = await api('hosted-mail.php', { token: O, action: 'own_status' });
const sup = (r.own ?? []).find(x => x.address === 'support@owner-site.com');
const gh = (r.own ?? []).find(x => x.address === 'help@gmail-hosted.com');
ok('the owner\'s send-only mailboxes are listed, not receiving', r.success && sup && !sup.receiving && gh, r);
r = await api('hosted-mail.php', { token: O, action: 'own_receive', mailboxId: gh?.id });
ok('a domain whose mail already goes to a mail host is refused, and nothing is changed', !r.success && /aspmx\.l\.google\.com/.test(r.error) && r.field === 'hosted.ownMailbox' && !st.rules.length, r);
const cMb = (await api('mailbox.php', { token: C.token, accountId: C.acct, action: 'list' })).mailboxes?.[0];
r = await api('hosted-mail.php', { token: O, action: 'own_receive', mailboxId: cMb?.id ?? 'x' });
ok('a mailbox outside the owner\'s workspaces is refused', !r.success, r);
r = await api('hosted-mail.php', { token: O, action: 'own_receive', mailboxId: sup?.id });
const rule = st.rules[0];
ok('receiving on: one rule for that address to this Worker, not the catch-all', r.success && r.receiving === true && st.rules.length === 1 && rule.matchers?.[0]?.type === 'literal' && rule.matchers[0].value === 'support@owner-site.com' && rule.actions?.[0]?.value?.[0] === 'crmpro', [r, st.rules]);
ok('…and Cloudflare added to the one SPF record, keeping what was there', /^"v=spf1 include:spf\.brevo\.com include:_spf\.mx\.cloudflare\.net ~all"$/.test(st.records.find(x => x.id === 'spf1')?.content ?? ''), st.records.find(x => x.id === 'spf1'));
r = await api('hosted-mail.php', { token: O, action: 'own_receive', mailboxId: sup?.id });
ok('"Check again" changes nothing twice', r.success && st.rules.length === 1 && st.patched.length === 1, [st.rules.length, st.patched]);
let ombs = await api('mailbox.php', { token: O, accountId: OW, action: 'list' });
let omb = (ombs.mailboxes ?? []).find(x => x.from?.email === 'support@owner-site.com');
ok('the mailbox keeps sending through Brevo and now shows receiving as connected', omb?.provider?.name === 'brevo' && omb.incoming.state === 'connected', omb);
er = await deliver('support@owner-site.com', 'Where is my invoice?');
ok('a message to support@ is accepted', er.status < 400, `${er.status}`);
await sleep(500);
const oin = await api('imap-fetch.php', { token: O, accountId: OW, mailboxId: omb?.id });
ok('…and is in that mailbox\'s inbox in the app', oin.success && oin.messages?.[0]?.subject === 'Where is my invoice?', oin);
r = await api('mailbox.php', { token: O, accountId: OW, action: 'test_incoming', id: omb?.id });
ombs = await api('mailbox.php', { token: O, accountId: OW, action: 'list' });
omb = (ombs.mailboxes ?? []).find(x => x.from?.email === 'support@owner-site.com');
ok('Validate does not try to log in anywhere and keeps it connected', omb?.incoming.state === 'connected', [r, omb?.incoming]);
s = await H(C, 'status');
ok('the customer\'s own-domain panel never lists the owner\'s address', !(s.addresses ?? []).some(a => a.address === 'support@owner-site.com'), s.addresses);
r = await api('hosted-mail.php', { token: O, action: 'own_stop', mailboxId: sup?.id });
ombs = await api('mailbox.php', { token: O, accountId: OW, action: 'list' });
omb = (ombs.mailboxes ?? []).find(x => x.from?.email === 'support@owner-site.com');
ok('Stop removes the rule and the link, leaving the zone alone', r.success && !st.rules.length && !(r.own ?? []).find(x => x.address === 'support@owner-site.com')?.receiving && !st.deleted.includes('zown') && omb?.incoming.state !== 'connected', [r, st.rules, omb?.incoming]);

console.log('\nRemoving');
r = await H(D, 'remove_domain', { domainId: dom.id });
ok('another workspace cannot remove it', !r.success, r);
r = await H(C, 'remove_domain', { domainId: dom.id });
mbs = await api('mailbox.php', { token: C.token, accountId: C.acct, action: 'list' });
ok('removing the domain removes its addresses, mailboxes, mail and the zone', r.success && !r.domains.length && !(mbs.mailboxes ?? []).some(x => x.provider?.name === 'hosted') && st.deleted.length === 1, [r, st.deleted]);

console.log(`\n${passed} passed, ${failed} failed`);
stop();
process.exit(failed ? 1 : 0);
