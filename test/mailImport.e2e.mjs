/**
 * "Paste your mail settings", end to end: lookups, a screenshot, and
 * "Connect and test all" against a real SMTP and IMAP conversation.
 *
 *   VITE_BASE=/ npm run build
 *   npm run test:mailimport
 *
 * Self-contained, like test:aikeys. There are no real mailbox credentials, so
 * a small SMTP + IMAP stand-in runs here on plain sockets (SMTP :8957, IMAP
 * :8958) and knows three logins:
 *   ok@stand.test / Right-pass-1     — both directions accept it
 *   half@stand.test / Half-pass-1    — SMTP accepts it, IMAP refuses it
 *   ui1@stand.test / Right-pass-1    — for the screen
 * An HTTP mock (:8956) stands in for Mozilla's ISPDB, DNS-over-HTTPS and
 * Gemini. A fresh D1; `wrangler dev` on :8955 (inspector :9355).
 *
 * What it proves:
 *  - lookups say where settings came from — known provider, ISPDB, MX — and
 *    a DNS lookup that could not run says so instead of "nothing found";
 *  - with no AI key a screenshot is refused in plain words, at its button;
 *    with one, the picture reaches the AI and comes back as records;
 *  - a batch is saved through the normal save path (encrypted, scoped) and
 *    each row answers for itself: connected / wrong password / partial /
 *    unreachable; the same address again updates rather than duplicates;
 *  - the screen at 1280 and 390: paste, review table, connect, results,
 *    no sideways scroll, no page errors.
 */
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const PORT = Number(process.env.PORT ?? 8955), MOCK = Number(process.env.MOCK_PORT ?? 8956);
const SMTP = Number(process.env.SMTP_PORT ?? 8957), IMAP = Number(process.env.IMAP_PORT ?? 8958), INSPECT = Number(process.env.INSPECT_PORT ?? 9355);
const B = `http://localhost:${PORT}`;
const M = `http://127.0.0.1:${MOCK}`;
let fail = 0, pass = 0;
const ok = (name, cond, detail = '') => { if (cond) pass++; else fail++; console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ` — ${String(detail).slice(0, 600)}`}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!fs.existsSync('dist/index.html')) { console.log('Build first: VITE_BASE=/ npm run build'); process.exit(2); }

/* ── The mail stand-in ── */
const SMTP_OK = new Map([['ok@stand.test', 'Right-pass-1'], ['half@stand.test', 'Half-pass-1'], ['ui1@stand.test', 'Right-pass-1'], ['pic@stand.test', 'Pic-pass-1']]);
const IMAP_OK = new Map([['ok@stand.test', 'Right-pass-1'], ['ui1@stand.test', 'Right-pass-1'], ['pic@stand.test', 'Pic-pass-1']]);
const seen = { smtpAuth: [], imapLogin: [] };
const b64d = s => Buffer.from(s, 'base64').toString('utf8');

const smtpServer = net.createServer(sock => {
  sock.on('error', () => {});
  let pending = '', step = 0, user = '';
  const w = s => sock.write(`${s}\r\n`);
  const judge = (u, p) => { seen.smtpAuth.push(u); w(SMTP_OK.get(u) === p ? '235 2.7.0 Authentication successful' : '535 5.7.8 Authentication credentials invalid'); };
  w('220 stand-in ESMTP');
  sock.on('data', chunk => {
    pending += chunk.toString('utf8');
    let i;
    while ((i = pending.indexOf('\r\n')) >= 0) {
      const line = pending.slice(0, i); pending = pending.slice(i + 2);
      if (step === 1) { user = b64d(line); step = 2; w('334 UGFzc3dvcmQ6'); continue; }
      if (step === 2) { step = 0; judge(user, b64d(line)); continue; }
      const up = line.toUpperCase();
      if (up.startsWith('EHLO') || up.startsWith('HELO')) sock.write('250-stand-in\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n');
      else if (up === 'AUTH LOGIN') { step = 1; w('334 VXNlcm5hbWU6'); }
      else if (up.startsWith('AUTH PLAIN ')) { const [, u, p] = b64d(line.slice(11)).split('\0'); judge(u, p); }
      else if (up === 'QUIT') { w('221 bye'); sock.end(); }
      else w('250 ok');
    }
  });
});

const unq = s => s.replace(/\\(.)/g, '$1');
const imapServer = net.createServer(sock => {
  sock.on('error', () => {});
  let pending = '';
  const w = s => sock.write(`${s}\r\n`);
  w('* OK [CAPABILITY IMAP4rev1] stand-in ready');
  sock.on('data', chunk => {
    pending += chunk.toString('utf8');
    let i;
    while ((i = pending.indexOf('\r\n')) >= 0) {
      const line = pending.slice(0, i); pending = pending.slice(i + 2);
      const [tag, cmd] = [line.split(' ')[0], line.split(' ').slice(1).join(' ')];
      const login = cmd.match(/^LOGIN\s+"((?:[^"\\]|\\.)*)"\s+"((?:[^"\\]|\\.)*)"$/i);
      if (login) {
        const [u, p] = [unq(login[1]), unq(login[2])];
        seen.imapLogin.push(u);
        w(IMAP_OK.get(u) === p ? `${tag} OK LOGIN completed` : `${tag} NO [AUTHENTICATIONFAILED] Invalid credentials (Failure)`);
      } else if (/^SELECT/i.test(cmd)) { w('* 0 EXISTS'); w(`${tag} OK [READ-WRITE] SELECT completed`); }
      else if (/^UID SEARCH/i.test(cmd)) { w('* SEARCH'); w(`${tag} OK SEARCH completed`); }
      else if (/^LOGOUT/i.test(cmd)) { w('* BYE'); w(`${tag} OK LOGOUT completed`); sock.end(); }
      else w(`${tag} BAD unknown command`);
    }
  });
});
await new Promise(r => smtpServer.listen(SMTP, '127.0.0.1', r));
await new Promise(r => imapServer.listen(IMAP, '127.0.0.1', r));

/* ── ISPDB, DNS-over-HTTPS and Gemini ── */
const GKEY = `AIza${'PICTURE'}${'x'.repeat(28)}`;
const aiCalls = [];
const ISPDB_XML = `<?xml version="1.0"?><clientConfig version="1.1"><emailProvider id="ispdb-hit.test"><domain>ispdb-hit.test</domain><displayShortName>HitMail</displayShortName>
<incomingServer type="imap"><hostname>imap.ispdb-hit.test</hostname><port>993</port><socketType>SSL</socketType><username>%EMAILADDRESS%</username></incomingServer>
<outgoingServer type="smtp"><hostname>smtp.ispdb-hit.test</hostname><port>587</port><socketType>STARTTLS</socketType><username>%EMAILADDRESS%</username></outgoingServer></emailProvider></clientConfig>`;
const send = (res, status, body, type = 'application/json') => { res.writeHead(status, { 'Content-Type': type }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
const mock = http.createServer((req, res) => {
  let raw = '';
  req.on('data', c => { raw += c; });
  req.on('end', () => {
    const u = new URL(req.url, M);
    if (u.pathname.startsWith('/ispdb/')) {
      const d = decodeURIComponent(u.pathname.slice(7));
      return d === 'ispdb-hit.test' ? send(res, 200, ISPDB_XML, 'application/xml') : send(res, 404, 'not found', 'text/plain');
    }
    if (u.pathname === '/dns') {
      const name = u.searchParams.get('name');
      if (name === 'mx-google.test') return send(res, 200, { Status: 0, Answer: [{ type: 15, data: '10 alt1.aspmx.l.google.com.' }, { type: 15, data: '1 aspmx.l.google.com.' }] });
      if (name === 'dnsdown.test') return send(res, 503, 'down', 'text/plain');
      return send(res, 200, { Status: 3 });
    }
    if (req.method === 'GET' && u.pathname === '/v1beta/models') {
      return u.searchParams.get('key') === GKEY ? send(res, 200, { models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] })
        : send(res, 400, { error: { code: 400, message: 'API key not valid.', details: [{ reason: 'API_KEY_INVALID' }] } });
    }
    if (req.method === 'POST' && /:generateContent$/.test(u.pathname)) {
      const q = JSON.parse(raw || '{}');
      const parts = q.contents?.[0]?.parts ?? [];
      aiCalls.push({ hasPicture: parts.some(p => p.inlineData?.mimeType?.startsWith('image/')), prompt: parts[0]?.text ?? '' });
      const text = JSON.stringify({
        text: `Incoming server: 127.0.0.1\nPort: ${IMAP}\nSecurity: none`,
        mailboxes: [{ email: 'Pic@Stand.test', password: 'Pic-pass-1', smtp: { host: '127.0.0.1', port: SMTP, security: 'none' }, imap: { host: '', port: 0, security: '' } }],
      });
      return send(res, 200, { candidates: [{ content: { parts: [{ text }] } }] });
    }
    if (u.pathname.startsWith('/or/')) return send(res, 401, { error: { code: 401, message: 'No auth credentials found' } });
    send(res, 404, { error: `mock has no ${req.method} ${u.pathname}` });
  });
});
await new Promise(r => mock.listen(MOCK, '127.0.0.1', r));

/* ── A fresh database and the real Worker ── */
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'mailimport-d1-'));
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
const sql = q => JSON.parse(execSync(`npx wrangler d1 execute crmpro --local --persist-to ${persist} --json --command ${JSON.stringify(q)}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
const vars = [`APP_ORIGIN:${B}`, `GEMINI_BASE:${M}`, `OPENROUTER_BASE:${M}/or`, `AUTOCONFIG_BASE:${M}/ispdb`, `DOH_BASE:${M}/dns`];
const wr = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--inspector-port', String(INSPECT), '--persist-to', persist, ...vars.flatMap(v => ['--var', v])], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
let wlog = '';
wr.stdout.on('data', c => { wlog += c; }); wr.stderr.on('data', c => { wlog += c; });
const stop = () => { try { process.kill(-wr.pid, 'SIGTERM'); } catch { /* gone */ } mock.close(); smtpServer.close(); imapServer.close(); };
process.on('exit', stop);
process.on('uncaughtException', async e => { console.log(e); await sleep(2000); console.log(wlog.slice(-3000)); stop(); process.exit(1); });
for (let i = 0; i < 90; i++) { try { const r = await fetch(`${B}/api/data.php`, { method: 'POST', headers: { Connection: 'close' }, body: '{"action":"ping"}' }); if (r.ok) break; } catch { /* starting */ } await sleep(1000); }

let ipN = 1;
const raw = (p, body) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.9.7.${ipN++ % 250}` }, body: JSON.stringify(body) });
const api = (p, body) => raw(p, body).then(r => r.json().catch(() => ({})));

const OWNER = 'owner@mailimport.test', PW = 'Tq9!vX2#pLm7wZ-mail';
const boot = await api('auth.php', { action: 'bootstrap', email: OWNER, password: PW, name: 'Owner' });
if (!boot.success) { console.log('bootstrap failed', boot, wlog.slice(-2000)); stop(); process.exit(2); }
const T = (await api('auth.php', { action: 'login', email: OWNER, password: PW })).token;
const CPW = 'Another-horse-7dana';
const reg = await api('auth.php', { action: 'register', email: 'dana@cust.test', password: CPW, name: 'Dana' });
const C = { token: reg.token, acct: reg.user?.accountId };
if (!C.token) { console.log('register failed', reg); stop(); process.exit(2); }
const mb = (action, extra = {}) => api('mailbox.php', { token: C.token, accountId: C.acct, action, ...extra });

/* ── Lookups ── */
console.log('\nLooking settings up');
let r = await mb('lookup', { domains: [
  { domain: 'gmail.com', email: 'a@gmail.com' }, { domain: 'ispdb-hit.test', email: 'b@ispdb-hit.test' },
  { domain: 'mx-google.test', email: 'c@mx-google.test' }, { domain: 'nothing.test', email: 'd@nothing.test' }, { domain: 'dnsdown.test', email: 'e@dnsdown.test' },
] });
const L = d => r.lookups?.find(l => l.domain === d);
ok('gmail.com from the known table, no network', L('gmail.com')?.found?.smtp?.host === 'smtp.gmail.com' && /Gmail/.test(L('gmail.com')?.summary ?? ''), JSON.stringify(L('gmail.com')));
ok('a custom domain from the ISPDB, named as such', L('ispdb-hit.test')?.found?.imap?.host === 'imap.ispdb-hit.test' && L('ispdb-hit.test')?.found?.smtp?.security === 'tls' && L('ispdb-hit.test')?.summary === 'Mozilla ISPDB', JSON.stringify(L('ispdb-hit.test')));
ok('a custom domain whose MX is Google → Google Workspace, after ISPDB and its own autoconfig were tried', L('mx-google.test')?.found?.provider === 'Google Workspace' && /MX records/.test(L('mx-google.test')?.summary ?? '')
  && L('mx-google.test')?.steps?.some(s => s.source === 'autoconfig.mx-google.test' && s.outcome === 'failed'), JSON.stringify(L('mx-google.test')));
ok('a domain that does not exist: nothing found, and why', !L('nothing.test')?.found && /does not exist/.test(JSON.stringify(L('nothing.test')?.steps)), JSON.stringify(L('nothing.test')));
ok('DNS that could not be asked says so — never "no MX"', !L('dnsdown.test')?.found && /could not run|answered 503/.test(L('dnsdown.test')?.summary ?? ''), JSON.stringify(L('dnsdown.test')));
r = await mb('lookup', { domains: [{ domain: 'not a domain' }] });
ok('a bad domain is refused at the paste box', !r.success && r.field === 'mailimport.text', JSON.stringify(r));

/* ── A screenshot ── */
console.log('\nA screenshot');
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
r = await mb('read_picture', { mime: 'image/png', data: PNG });
ok('with no AI key, the picture is refused in plain words, at its button', !r.success && r.code === 'no_ai' && r.field === 'mailimport.picture' && /cannot be read/.test(r.error), JSON.stringify(r));
r = await mb('read_picture', { mime: 'application/pdf', data: PNG });
ok('not a picture: refused at its button', !r.success && r.field === 'mailimport.picture', JSON.stringify(r));
const added = await api('aikeys.php', { token: T, action: 'add', apiKey: GKEY, label: 'Main' });
ok('the owner adds an AI key', added.success, JSON.stringify(added));
r = await mb('read_picture', { mime: 'image/png', data: PNG });
const pic = r.records?.[0];
ok('the picture went to the AI with the prompt', aiCalls.length === 1 && aiCalls[0].hasPicture && /Do not invent/.test(aiCalls[0].prompt), JSON.stringify(aiCalls));
ok('…and came back as a record to check: address, SMTP from the JSON, IMAP from the transcript', r.success && pic?.email === 'pic@stand.test' && pic.smtp.port === SMTP && pic.imap.host === '127.0.0.1' && pic.imap.port === IMAP && pic.smtp.source === 'screenshot', JSON.stringify(r));

/* ── Connect and test all ── */
console.log('\nConnect and test all');
const row = (email, password, smtpPort = SMTP, imapPort = IMAP) => ({ email, name: '', password, smtp: { host: '127.0.0.1', port: smtpPort, security: 'none', username: email, password: '' }, imap: { host: '127.0.0.1', port: imapPort, security: 'none', username: email, password: '' } });
r = await mb('bulk_connect', { rows: [row('a@x.test', 'p'), row('b@x.test', 'p'), row('c@x.test', 'p'), row('d@x.test', 'p')] });
ok('more than a batch in one request is refused (the page sends batches)', !r.success && /At most 3/.test(r.error), JSON.stringify(r));
r = await mb('bulk_connect', { rows: [row('ok@stand.test', 'Right-pass-1'), row('wrong@stand.test', 'Bad-guess-1'), row('half@stand.test', 'Half-pass-1')] });
const R = e => r.results?.find(x => x.email === e);
ok('the right password: connected both ways', R('ok@stand.test')?.status === 'connected' && R('ok@stand.test')?.outgoing?.kind === 'connected' && R('ok@stand.test')?.incoming?.kind === 'connected', JSON.stringify(R('ok@stand.test')));
ok('a wrong password: "wrong password" on each side, nothing connected', R('wrong@stand.test')?.status === 'failed' && R('wrong@stand.test')?.outgoing?.kind === 'wrong_password' && R('wrong@stand.test')?.incoming?.kind === 'wrong_password', JSON.stringify(R('wrong@stand.test')));
ok('sending works, receiving refused: reported as partial, with which side', R('half@stand.test')?.status === 'partial' && R('half@stand.test')?.outgoing?.ok && R('half@stand.test')?.incoming?.kind === 'wrong_password', JSON.stringify(R('half@stand.test')));
ok('the stand-in saw real logins on both protocols', seen.smtpAuth.includes('ok@stand.test') && seen.imapLogin.includes('ok@stand.test') && seen.imapLogin.includes('half@stand.test'), JSON.stringify(seen));
r = await mb('bulk_connect', { rows: [row('gone@stand.test', 'x', 1, 1), { ...row('', 'x') }, row('nopw@stand.test', '')] });
ok('nothing listening: "server unreachable"', r.results?.[0]?.status === 'failed' && r.results[0].outgoing?.kind === 'host_unreachable' && r.results[0].incoming?.kind === 'host_unreachable', JSON.stringify(r.results?.[0]?.incoming));
ok('a row with no address, and one with no password, each say so in their row', r.results?.[1]?.field === 'bulk.email' && r.results?.[2]?.field === 'bulk.password' && /No password/.test(r.results[2].message), JSON.stringify(r.results?.slice(1)));
const list = await mb('list');
const okBox = list.mailboxes?.find(m => m.from.email === 'ok@stand.test');
ok('each tested mailbox is saved with its verification stamps', okBox?.outgoing.verifiedAt && okBox?.incoming.verifiedAt && list.mailboxes.find(m => m.from.email === 'half@stand.test')?.incoming.lastError, JSON.stringify(list.mailboxes?.map(m => [m.from.email, !!m.outgoing.verifiedAt, !!m.incoming.verifiedAt])));
ok('the first one is the primary', list.mailboxes?.[0]?.isPrimary === true);
const before = list.mailboxes?.length;
r = await mb('bulk_connect', { rows: [row('OK@stand.test', 'Right-pass-1')] });
const after = (await mb('list')).mailboxes;
ok('the same address again updates its mailbox — no twin', r.results?.[0]?.updated === true && after?.length === before, `${before} → ${after?.length}`);
const stored = sql("SELECT smtp_password, imap_password FROM crm_mailbox_accounts WHERE from_email = 'ok@stand.test'")[0];
ok('passwords are stored encrypted', stored && !JSON.stringify(stored).includes('Right-pass-1') && stored.smtp_password.length > 20, JSON.stringify(stored));
ok('no answer carried a password back', !JSON.stringify([list, r]).match(/Right-pass-1|Half-pass-1|Bad-guess-1/));

/* ── The screen ── */
console.log('\nThe screen');
const br = await pw.chromium.launch();
const errs = [];
fs.mkdirSync('test-results', { recursive: true });
const PASTE = `SMTP server: 127.0.0.1  Port: ${SMTP}  Security: none
IMAP server: 127.0.0.1  Port: ${IMAP}  Security: none
ui1@stand.test Right-pass-1
ui2@stand.test Wrong-pass-2

pat@gmail.com abcd-efgh-ijkl-mnop`;
for (const width of [1280, 390]) {
  const ctx = await br.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(`${B}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email or username').fill('dana@cust.test');
  await page.getByLabel('Password', { exact: true }).fill(CPW);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(2500);
  await page.goto(`${B}/settings`, { waitUntil: 'networkidle' });
  const box = page.locator('#mailbox-import');
  await box.waitFor({ timeout: 15000 });
  await box.locator('[data-field="mailimport.text"]').fill(PASTE);
  await box.getByRole('button', { name: 'Read settings' }).click();
  await box.locator('[data-field="bulk.email"]').nth(2).waitFor({ timeout: 10000 }).catch(() => {});
  const emails = await box.locator('[data-field="bulk.email"]').evaluateAll(els => els.map(e => e.value));
  ok(`@${width}: one row per address`, emails.join() === 'ui1@stand.test,ui2@stand.test,pat@gmail.com', emails.join());
  const text = await box.innerText();
  ok(`@${width}: Gmail filled from known settings, with the app-password rule`, /Gmail \(known settings\)/.test(text) && /app password/i.test(text), text.slice(0, 800));
  ok(`@${width}: no sideways scroll with the table open`, (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, String(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)));
  await box.getByRole('button', { name: 'Remove pat@gmail.com' }).click();
  await box.getByRole('button', { name: /Connect and test all/ }).click();
  await box.getByText(/fully connected|All \d+ connected/).waitFor({ timeout: 60000 }).catch(() => {});
  const done = await box.innerText();
  ok(`@${width}: each row reports its own result; the partial run is said as partial`, /1 of 2 fully connected/.test(done) && /Connected/.test(done) && /Wrong password/.test(done), done.slice(-700));
  ok(`@${width}: the connected mailbox appears in the list above`, (await page.locator('body').innerText()).includes('ui1@stand.test'));
  ok(`@${width}: no sideways scroll after the results`, (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
  await box.screenshot({ path: `test-results/mailimport-${width}.png` });
  await ctx.close();
}
ok('no page errors', !errs.length, errs.join(' | '));
await br.close();

console.log(`\n${pass} passed, ${fail} failed`);
stop();
process.exit(fail ? 1 : 0);
