/**
 * Blog Automation → WordPress (`/api/blog-publish.php`, audit C-1), end to
 * end: the real Worker on a fresh D1 and a stand-in WordPress REST API.
 *
 * The site is `https://myblog.test`. wrangler runs with
 * `--var SITE_TEST_ORIGIN:<mock>`, which sends `*.test` hosts to the mock
 * (lib/readSite.ts `wireUrl`) — the https rule is still checked on the address
 * as typed, so an http:// address is refused here exactly as in production.
 *
 * Covers: connect (refusals by box, a wrong password said plainly, a site that
 * is not WordPress), the password stored encrypted and never returned, status
 * asking WordPress, publish / update in place / schedule / withdraw with the
 * stored credential, a revoked password, disconnect, and another workspace
 * refused on both the target id and the workspace id.
 *
 *   npm run test:blogpublish      (self-contained: wrangler :8896, mock :8897)
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';

const PORT = 8896, INSPECT = 9396, MOCK = 8897;
const B = `http://localhost:${PORT}`, M = `http://127.0.0.1:${MOCK}`;
const SITE = 'https://myblog.test';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0, passed = 0;
const ok = (name, cond, detail = '') => { if (cond) passed++; else failed++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 600)}`}`); };

/* ── WordPress, as far as publishing talks to it ── */
const wp = { user: 'editor', pass: 'abcd efgh ijkl mnop qrst uvwx', posts: {}, next: 100, auths: [] };
const mock = http.createServer((req, res) => {
  let b = '';
  req.on('data', c => { b += c; });
  req.on('end', () => {
    const u = new URL(req.url, M);
    const send = (s, j) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(j)); };
    const auth = req.headers.authorization ?? '';
    wp.auths.push(auth);
    const authed = auth === 'Basic ' + Buffer.from(`${wp.user}:${wp.pass}`).toString('base64');
    /* A sub-folder that is not WordPress: an HTML 404, like a plain site. */
    if (u.pathname.startsWith('/notwp/')) { res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end('<h1>Not found</h1>'); }
    if (!u.pathname.startsWith('/wp-json/')) return send(404, { code: 'rest_no_route' });
    if (!authed) return send(401, { code: 'incorrect_password', message: 'The provided password is an invalid application password.' });
    const p = u.pathname.slice('/wp-json'.length), body = b ? JSON.parse(b) : {};
    if (p === '/wp/v2/users/me' && req.method === 'GET') return send(200, { id: 7, name: 'Ed Itor', slug: 'editor' });
    if (p === '/wp/v2/posts' && req.method === 'POST') {
      const id = wp.next++;
      wp.posts[id] = { id, ...body, link: `${SITE}/${body.slug ?? id}/` };
      return send(201, wp.posts[id]);
    }
    const m = /^\/wp\/v2\/posts\/(\d+)$/.exec(p);
    if (m && req.method === 'POST') {
      if (!wp.posts[m[1]]) return send(404, { code: 'rest_post_invalid_id', message: 'Invalid post ID.' });
      Object.assign(wp.posts[m[1]], body);
      return send(200, wp.posts[m[1]]);
    }
    send(404, { code: 'rest_no_route', message: `mock has no ${req.method} ${p}` });
  });
});
await new Promise(r => mock.listen(MOCK, '127.0.0.1', r));

const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'blogpub-d1-'));
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
const vars = [`APP_ORIGIN:${B}`, `SITE_TEST_ORIGIN:${M}`];
const wr = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--inspector-port', String(INSPECT), '--persist-to', persist, ...vars.flatMap(v => ['--var', v])], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
let wlog = '';
wr.stdout.on('data', c => { wlog += c; }); wr.stderr.on('data', c => { wlog += c; });
const stop = () => { try { process.kill(-wr.pid, 'SIGTERM'); } catch { /* gone */ } mock.close(); };
process.on('exit', stop);
for (let i = 0; i < 90; i++) { try { const r = await fetch(`${B}/api/data.php`, { method: 'POST', headers: { Connection: 'close' }, body: '{"action":"ping"}' }); if (r.ok) break; } catch { /* starting */ } await sleep(1000); }

const d1 = sql => { try { return JSON.parse(execSync(`npx wrangler d1 execute crmpro --local --persist-to ${persist} --json --command ${JSON.stringify(sql)}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))[0]?.results ?? []; } catch (e) { console.log(String(e.stdout ?? e)); return []; } };

let ipN = 1;
const api = (p, body) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.8.4.${ipN++ % 250}` }, body: JSON.stringify(body) })
  .then(async r => ({ status: r.status, field: r.headers.get('X-Refused-Field'), ...(await r.json().catch(() => ({}))) }));

const boot = await api('auth.php', { action: 'bootstrap', email: 'owner@blogpub.test', password: 'Tq9!vX2#pLm7wZ-blog', name: 'Owner' });
if (!boot.success) { console.log('bootstrap failed', boot, wlog.slice(-2000)); stop(); process.exit(2); }
const reg = await api('auth.php', { action: 'register', email: 'cara@cust.test', password: 'Another-horse-7cara', name: 'Cara' });
const C = { token: reg.token, acct: reg.user?.accountId };
const reg2 = await api('auth.php', { action: 'register', email: 'dan@other.test', password: 'Another-horse-7dan', name: 'Dan' });
const D = { token: reg2.token, acct: reg2.user?.accountId };
ok('two customer workspaces', !!C.acct && !!D.acct && C.acct !== D.acct, [reg, reg2]);
const P = (who, action, extra = {}) => api('blog-publish.php', { token: who.token, accountId: who.acct, action, ...extra });
const T = 'tgt-e2e-cara';
const leaks = r => JSON.stringify(r).includes(wp.pass) || JSON.stringify(r).includes('abcd');

console.log('\nConnect — refused at the right box');
let r = await P(C, 'connect', { targetId: T, siteUrl: 'http://myblog.test', username: wp.user, password: wp.pass });
ok('an http:// address is refused at the site box', !r.success && r.field === 'blog.siteUrl' && /https/.test(r.error), r);
r = await P(C, 'connect', { targetId: T, siteUrl: SITE, username: '', password: wp.pass });
ok('a missing username is refused at its box', !r.success && r.field === 'blog.username', r);
r = await P(C, 'connect', { targetId: T, siteUrl: SITE, username: wp.user, password: '' });
ok('no password the first time is refused at its box', !r.success && r.field === 'blog.password', r);
r = await P(C, 'connect', { targetId: T, siteUrl: SITE, username: wp.user, password: 'wrong wrong wrong' });
ok('a wrong password says so plainly, at the password box', !r.success && r.field === 'blog.password' && /Wrong username or application password/.test(r.error), r);
r = await P(C, 'connect', { targetId: T, siteUrl: `${SITE}/notwp`, username: wp.user, password: wp.pass });
ok('an address that is not WordPress is refused at the site box', !r.success && r.field === 'blog.siteUrl' && /WordPress/.test(r.error), r);
r = await P(C, 'status', { targetId: T });
ok('…and none of those stored anything', r.success && r.connected === false && r.stored === false, r);

console.log('\nConnect — stored encrypted, never returned');
r = await P(C, 'connect', { targetId: T, siteUrl: `${SITE}/`, username: wp.user, password: wp.pass });
ok('connects and says who as', r.success && r.connected && r.connectedAs === 'Ed Itor' && !!r.verifiedAt && r.siteUrl === SITE, r);
ok('…and the answer carries no password', !leaks(r), r);
const row = d1(`SELECT account_id, app_password, verified_at FROM crm_blog_publish_targets WHERE id = '${T}'`)[0];
ok('stored against the target and the workspace, encrypted', row?.account_id === C.acct && !!row.app_password && !row.app_password.includes('abcd') && !!row.verified_at, row);
r = await P(C, 'status', { targetId: T });
ok('status asks WordPress and says connected', r.success && r.connected && r.stored && r.connectedAs === 'Ed Itor' && r.username === wp.user, r);
ok('…without the password', !leaks(r), r);
r = await P(C, 'connect', { targetId: T, siteUrl: SITE, username: wp.user, password: '' });
ok('reconnecting with the password left blank keeps the stored one', r.success && r.connected, r);

console.log('\nPublish with the stored credential');
const auths0 = wp.auths.length;
r = await P(C, 'publish', { targetId: T, title: 'Boiler care in winter', html: '<p>Bleed the radiators.</p>', excerpt: 'Winter boiler tips', slug: 'boiler-care', status: 'publish' });
const id1 = r.remoteId;
ok('published: remote id and live URL come back', r.success && id1 && r.url === `${SITE}/boiler-care/` && r.state === 'live', r);
ok('…WordPress got the post with the stored password (the browser sent none)', wp.posts[id1]?.title === 'Boiler care in winter' && wp.posts[id1].status === 'publish' && wp.auths.slice(auths0).every(a => a.startsWith('Basic ')), wp.posts[id1]);
r = await P(C, 'publish', { targetId: T, title: 'Boiler care in winter (updated)', html: '<p>Bleed them twice.</p>', slug: 'boiler-care', status: 'publish', remoteId: String(id1) });
ok('publishing again with the remote id updates the same post', r.success && String(r.remoteId) === String(id1) && Object.keys(wp.posts).length === 1 && wp.posts[id1].title.includes('updated'), [r, Object.keys(wp.posts)]);
const when = new Date(Date.now() + 3 * 864e5).toISOString();
r = await P(C, 'publish', { targetId: T, title: 'Spring checks', html: '<p>Service it.</p>', slug: 'spring', status: 'future', date: when });
ok('a future post is handed to WordPress as scheduled', r.success && r.state === 'scheduled' && wp.posts[r.remoteId]?.status === 'future' && wp.posts[r.remoteId].date_gmt === when.slice(0, 19), [r, wp.posts[r.remoteId]]);
r = await P(C, 'withdraw', { targetId: T, remoteId: String(id1) });
ok('withdraw sets the post back to draft, never deletes', r.success && wp.posts[id1]?.status === 'draft', [r, wp.posts[id1]]);
r = await P(C, 'publish', { targetId: T, title: '', html: '<p>x</p>' });
ok('a post with no title is refused', !r.success && /title/.test(r.error), r);
r = await api('blog-publish.php', { token: C.token, accountId: C.acct, title: 't', content: 'c' });
ok('the old shape (no target, no action) is refused, not published', !r.success && Object.keys(wp.posts).length === 2, r);

console.log('\nAnother workspace');
r = await P(D, 'status', { targetId: T });
ok("D cannot read C's target", !r.success && r.status === 403, r);
r = await P(D, 'publish', { targetId: T, title: 'Hijack', html: '<p>x</p>' });
ok("D cannot publish through C's target", !r.success && r.status === 403 && !Object.values(wp.posts).some(p => p.title === 'Hijack'), r);
r = await P(D, 'withdraw', { targetId: T, remoteId: String(id1) });
ok("D cannot withdraw from C's target", !r.success && r.status === 403, r);
r = await P(D, 'connect', { targetId: T, siteUrl: SITE, username: wp.user, password: wp.pass });
ok("D cannot overwrite C's target", !r.success && r.status === 403, r);
r = await P(D, 'disconnect', { targetId: T });
ok("D cannot disconnect C's target", !r.success && r.status === 403 && d1(`SELECT COUNT(*) AS n FROM crm_blog_publish_targets WHERE id = '${T}'`)[0]?.n === 1, r);
r = await api('blog-publish.php', { token: D.token, accountId: C.acct, action: 'status', targetId: T });
ok("D cannot name C's workspace", !r.success && r.status === 403, r);

console.log('\nA revoked password');
wp.pass = 'zzzz zzzz zzzz zzzz zzzz zzzz';
r = await P(C, 'status', { targetId: T });
ok('status says it no longer works, plainly, and that one is still stored', r.success && r.connected === false && r.stored === true && /Wrong username or application password/.test(r.error), r);
r = await P(C, 'publish', { targetId: T, title: 'After revoke', html: '<p>x</p>' });
ok('publish says the password is wrong', !r.success && /Wrong username or application password/.test(r.error), r);

console.log('\nDisconnect');
r = await P(C, 'disconnect', { targetId: T });
ok('disconnect deletes the stored password', r.success && d1(`SELECT COUNT(*) AS n FROM crm_blog_publish_targets WHERE id = '${T}'`)[0]?.n === 0, r);
r = await P(C, 'publish', { targetId: T, title: 'After disconnect', html: '<p>x</p>' });
ok('publishing afterwards asks for a connection', !r.success && /Connect this WordPress site first/.test(r.error), r);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) console.log(wlog.slice(-1500));
stop();
process.exit(failed ? 1 : 0);
