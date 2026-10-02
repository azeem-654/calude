/**
 * Reputation, end to end: Google is read for real (a local mock of Places API
 * (New), Google's token endpoint and the three Business Profile APIs), and the
 * requests this app sends are checked, not just its answers.
 *
 *   VITE_BASE=/ npm run build
 *   npm run test:reputation
 *
 * Self-contained: it starts the mock on 127.0.0.1:8833 (which also speaks
 * SMTP, so the cron's review request can be read back), migrates a fresh D1
 * into a temporary directory, runs `wrangler dev --test-scheduled` on :8822
 * with every Google base URL pointed at the mock, drives the API and the
 * screen, and stops everything it started.
 */
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const PORT = 8822, MOCK = 8833;
const B = `http://localhost:${PORT}`;
const G = `http://127.0.0.1:${MOCK}`;
let fail = 0;
const ok = (name, cond, detail = '') => { if (!cond) fail++; console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ` — ${String(detail).slice(0, 400)}`}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* A message as a person would read it: quoted-printable unwrapped, base64 parts decoded. */
const readable = m => {
  const qp = m.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const b64 = (m.match(/^[A-Za-z0-9+/=]{40,}$/gm) ?? []).map(l => Buffer.from(l, 'base64').toString('utf8')).join('');
  return `${qp}\n${b64}`;
};

if (!fs.existsSync('dist/index.html')) { console.log('Build first: VITE_BASE=/ npm run build'); process.exit(2); }

/* ── The Google mock ── */
const K = c => `AIza${c.repeat(35)}`;
const WKEY = K('W'), IKEY = K('I'), WKEY2 = K('M');
/* Keys Google refuses in the two ways a customer meets most: the API not
   switched on in their project, and a quota run dry. */
const DKEY = K('D'), QKEY = K('Q');
const VALID = new Set([WKEY, IKEY, WKEY2]);
const PLACE = 'ChIJplaceAAAA0001', COMP = 'ChIJcompetitor01', ZERO = 'ChIJzeroReviews0001';
const T0 = '2026-09-20T10:00:00.000000Z';
const seen = [];
const mock = {
  compRating: 4.1, gbpDenied: false, refreshDenied: false, replies: [],
  /* A business that opened last week: Google has no rating and no count for it yet. */
  zero: { rating: undefined, count: undefined, reviews: [] },
  placesReviews: [
    { name: `places/${PLACE}/reviews/r1`, rating: 5, text: { text: 'Lovely bread and very friendly staff.' }, authorAttribution: { displayName: 'Ann Baker', photoUri: 'https://lh3.example/a.png', uri: 'https://maps.google.com/contrib/1' }, publishTime: T0, googleMapsUri: 'https://maps.google.com/review/r1' },
    { name: `places/${PLACE}/reviews/r2`, rating: 2, text: { text: 'Slow service and cold coffee.' }, authorAttribution: { displayName: 'Bob Critic' }, publishTime: '2026-09-18T09:00:00Z', googleMapsUri: 'https://maps.google.com/review/r2' },
    { name: `places/${PLACE}/reviews/r3`, rating: 4, text: { text: 'Good cakes.' }, authorAttribution: { displayName: 'Cara Cake' }, publishTime: '2026-09-15T09:00:00Z', googleMapsUri: 'https://maps.google.com/review/r3' },
  ],
  gbpReviews: [
    { name: 'accounts/111/locations/222/reviews/g1', reviewId: 'g1', reviewer: { displayName: 'Ann Baker' }, starRating: 'FIVE', comment: 'Lovely bread and very friendly staff.', createTime: '2026-09-20T10:00:00.000Z', updateTime: '2026-09-20T10:00:00Z' },
    { name: 'accounts/111/locations/222/reviews/g2', reviewId: 'g2', reviewer: { displayName: 'Dan Donut' }, starRating: 'THREE', comment: 'Fine, a bit pricey.', createTime: '2026-09-25T10:00:00Z', updateTime: '2026-09-25T10:00:00Z' },
    { name: 'accounts/111/locations/222/reviews/g3', reviewId: 'g3', reviewer: { displayName: 'Eve Eclair' }, starRating: 'FIVE', comment: 'Best eclairs.', createTime: '2026-09-26T10:00:00Z', updateTime: '2026-09-27T10:00:00Z', reviewReply: { comment: 'Thanks Eve!', updateTime: '2026-09-27T10:00:00Z' } },
    { name: 'accounts/111/locations/222/reviews/g4', reviewId: 'g4', reviewer: { displayName: 'Fay Flan' }, starRating: 'FOUR', comment: 'Nice tarts.', createTime: '2026-09-27T10:00:00Z', updateTime: '2026-09-27T10:00:00Z' },
  ],
};
const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const notApproved = res => send(res, 429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: "Quota exceeded for quota metric 'Requests' and limit 'Requests per minute' of service 'mybusinessaccountmanagement.googleapis.com'" } });
const place = (id) => id === PLACE
  ? { id: PLACE, displayName: { text: 'Acme Bakery' }, formattedAddress: '1 High St, Town', rating: 4.6, userRatingCount: 120, googleMapsUri: 'https://maps.google.com/?cid=1', reviews: mock.placesReviews }
  : id === COMP ? { id: COMP, displayName: { text: 'Rival Rolls' }, formattedAddress: '9 Low St, Town', rating: mock.compRating, userRatingCount: 50, googleMapsUri: 'https://maps.google.com/?cid=2' }
  : id === ZERO ? { id: ZERO, displayName: { text: 'New Nook' }, formattedAddress: '3 New St, Town', googleMapsUri: 'https://maps.google.com/?cid=3', ...(mock.zero.rating != null ? { rating: mock.zero.rating, userRatingCount: mock.zero.count } : {}), reviews: mock.zero.reviews }
  : null;
/* Google's shorteners, as GOOGLE_LINK_BASE asks them: `/<host><path>`. */
const SHORT = {
  '/maps.app.goo.gl/acme1': 'https://maps.google.com/?q=Acme%20Bakery,%201%20High%20St&ftid=0x48761b:0x1&entry=gps&g_ep=CAE',
  '/g.page/r/acmeRev/review': 'https://g.page/r/acmeRev/review/',
  '/g.page/r/acmeRev/review/': `https://search.google.com/local/writereview?placeid=${PLACE}&source=g.page.m.rc._`,
  '/share.google/elsewhere': 'https://www.example.com/not-google',
};

const httpSrv = http.createServer((req, res) => {
  let raw = '';
  req.on('data', c => { raw += c; });
  req.on('end', () => {
    const u = new URL(req.url, G);
    seen.push({ method: req.method, path: u.pathname, search: u.search, key: req.headers['x-goog-api-key'] ?? '', mask: req.headers['x-goog-fieldmask'] ?? '', auth: req.headers.authorization ?? '', body: raw, ua: req.headers['user-agent'] ?? '' });
    if (/^\/(maps\.app\.goo\.gl|g\.page|share\.google|goo\.gl)\//.test(u.pathname)) {
      const to = SHORT[u.pathname];
      if (!to) { res.writeHead(404); return res.end('Dynamic Link Not Found'); }
      res.writeHead(302, { Location: to }); return res.end();
    }
    if (u.pathname.startsWith('/v1/places')) {
      const key = String(req.headers['x-goog-api-key'] ?? '');
      if (key === DKEY) return send(res, 403, { error: { code: 403, status: 'PERMISSION_DENIED', message: 'Places API (New) has not been used in project 123 before or it is disabled.', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED' }] } });
      if (key === QKEY) return send(res, 429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: "Quota exceeded for quota metric 'Place Details requests'." } });
      if (!VALID.has(key)) return send(res, 400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.', details: [{ reason: 'API_KEY_INVALID' }] } });
      if (u.pathname === '/v1/places:searchText') {
        return send(res, 200, { places: [place(PLACE), place(COMP)].map(({ reviews, ...p }) => p) });
      }
      const p = place(decodeURIComponent(u.pathname.split('/').pop()));
      if (!p) return send(res, 404, { error: { code: 404, status: 'NOT_FOUND', message: 'Not found' } });
      const fields = String(req.headers['x-goog-fieldmask'] ?? '').split(',');
      const { reviews, ...rest } = p;
      return send(res, 200, fields.includes('reviews') ? { ...rest, reviews } : rest);
    }
    if (u.pathname === '/token') {
      const f = new URLSearchParams(raw);
      if (f.get('grant_type') === 'authorization_code' && f.get('code') === 'good-code' && f.get('client_secret') === 'test-secret') {
        return send(res, 200, { access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600, scope: 'https://www.googleapis.com/auth/business.manage', token_type: 'Bearer' });
      }
      if (f.get('grant_type') === 'refresh_token' && f.get('refresh_token') === 'rt-1' && !mock.refreshDenied) return send(res, 200, { access_token: 'at-2', expires_in: 3600 });
      if (f.get('grant_type') === 'refresh_token') return send(res, 400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
      return send(res, 400, { error: 'invalid_grant', error_description: 'Bad code.' });
    }
    if (!/^Bearer at-[12]$/.test(String(req.headers.authorization ?? ''))) return send(res, 401, { error: { code: 401, message: 'Request had invalid authentication credentials.' } });
    if (mock.gbpDenied && req.method === 'PUT') return send(res, 403, { error: { code: 403, status: 'PERMISSION_DENIED', message: 'The caller does not have permission' } });
    if (mock.gbpDenied) return notApproved(res);
    if (u.pathname === '/v1/accounts') return send(res, 200, { accounts: [{ name: 'accounts/111', accountName: 'Acme', type: 'PERSONAL' }] });
    if (u.pathname === '/v1/accounts/111/locations') {
      return send(res, 200, { locations: [{ name: 'locations/222', title: 'Acme Bakery', storefrontAddress: { addressLines: ['1 High St'], locality: 'Town' }, metadata: { placeId: PLACE, mapsUri: 'https://maps.google.com/?cid=1' } }] });
    }
    if (u.pathname === '/v4/accounts/111/locations/222/reviews') return send(res, 200, { reviews: mock.gbpReviews, averageRating: 4.5, totalReviewCount: 130 });
    const m = u.pathname.match(/^\/v4\/(accounts\/111\/locations\/222\/reviews\/(\w+))\/reply$/);
    if (m && req.method === 'PUT') {
      const body = JSON.parse(raw || '{}');
      mock.replies.push({ review: m[1], body });
      const r = mock.gbpReviews.find(x => x.name === m[1]);
      if (r) r.reviewReply = { comment: body.comment, updateTime: new Date().toISOString() };
      return send(res, 200, { comment: body.comment, updateTime: new Date().toISOString() });
    }
    send(res, 404, { error: { code: 404, message: `mock has no ${req.method} ${u.pathname}` } });
  });
});

/* One port, two protocols: HTTP clients speak first, SMTP clients wait for a greeting. */
const mail = [];
function smtp(sock) {
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
}
const server = net.createServer(sock => {
  sock.on('error', () => {});
  let decided = false;
  const timer = setTimeout(() => { decided = true; smtp(sock); }, 250);
  sock.once('data', chunk => {
    if (decided) return;
    clearTimeout(timer); decided = true;
    sock.pause(); sock.unshift(chunk);
    httpSrv.emit('connection', sock);
    sock.resume();
  });
});
await new Promise(r => server.listen(MOCK, '127.0.0.1', r));

/* ── A fresh database and the real Worker ── */
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'rep-d1-'));
const sql = q => JSON.parse(execSync(`npx wrangler d1 execute crmpro --local --persist-to ${persist} --json --command ${JSON.stringify(q)}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
const vars = [`APP_ORIGIN:${B}`, `GOOGLE_LINK_BASE:${G}`, `GOOGLE_PLACES_BASE:${G}`, `GOOGLE_GBP_ACCOUNTS_BASE:${G}`, `GOOGLE_GBP_INFO_BASE:${G}`, `GOOGLE_GBP_V4_BASE:${G}`, `GOOGLE_TOKEN_URL:${G}/token`];
/* Its own process group (detached), so stopping it stops workerd as well. */
const wr = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--persist-to', persist, '--test-scheduled', ...vars.flatMap(v => ['--var', v])], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
let wlog = '';
wr.stdout.on('data', c => { wlog += c; }); wr.stderr.on('data', c => { wlog += c; });
const stop = () => { try { process.kill(-wr.pid, 'SIGTERM'); } catch { /* gone */ } server.close(); };
process.on('exit', stop);
process.on('uncaughtException', e => { console.log(e, wlog.slice(-1500)); stop(); process.exit(1); });
const scheduled = async () => { for (let i = 0; i < 3; i++) { try { return await fetch(`${B}/cdn-cgi/handler/scheduled`, { headers: { Connection: 'close' } }); } catch { await sleep(1000); } } return null; };
for (let i = 0; i < 90; i++) { try { const r = await fetch(`${B}/api/data.php`, { method: 'POST', headers: { Connection: 'close' }, body: '{"action":"ping"}' }); if (r.ok) break; } catch { /* starting */ } await sleep(1000); }

let ipN = 1;
/* `Connection: close`: `sql()` blocks this process while wrangler runs, and a
   kept-alive socket the Worker closed meanwhile would be reused after it and
   fail as "other side closed". */
const api = (p, body) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.7.3.${ipN++ % 250}` }, body: JSON.stringify(body) }).then(r => r.json().catch(() => ({})));

console.log('\nReputation');
const OWNER = 'owner@rep.test', PW = 'Tq9!vX2#pLm7wZ-rep';
const boot = await api('auth.php', { action: 'bootstrap', email: OWNER, password: PW, name: 'Owner' });
if (!boot.success) { console.log('bootstrap failed', boot, wlog.slice(-2000)); stop(); process.exit(2); }

/* Sign in in a browser first: the screen's own workspace is the one tested. */
const br = await pw.chromium.launch();
const page = await br.newPage({ viewport: { width: 1280, height: 900 } });
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto(`${B}/login`, { waitUntil: 'networkidle' });
await page.getByLabel('Email or username').fill(OWNER);
await page.getByLabel('Password', { exact: true }).fill(PW);
await page.getByRole('button', { name: 'Sign in', exact: true }).click();
await page.waitForTimeout(2500);
const A = await page.evaluate(() => localStorage.getItem('crm_active_account'));
const T = (await api('auth.php', { action: 'login', email: OWNER, password: PW })).token;
const rep = (action, extra = {}, acct = A, tok = T) => api('reputation.php', { token: tok, accountId: acct, action, ...extra });
ok('the owner has a workspace to test in', !!A && !!T, `${A} ${!!T}`);

/* A second tenant. */
const cust = await api('auth.php', { action: 'register', email: 'bea@other.test', password: 'Another-horse-7x', name: 'Bea' });
const TB = cust.token ?? (await api('auth.php', { action: 'login', email: 'bea@other.test', password: 'Another-horse-7x' })).token;
const BACCT = 'acct-rep-bea';
ok('a second customer signs up', !!TB, JSON.stringify(cust).slice(0, 200));

/* ── Places ── */
let r = await rep('status');
ok('status: nothing set up, no install key', r.success && r.source === null && r.installKey === false, JSON.stringify(r));
r = await rep('find_place', { query: 'Acme Bakery' });
ok('a missing key is reported by name', !r.success && r.code === 'no_key' && /No Google Places key/.test(r.error), JSON.stringify(r));
r = await rep('save_source', { placesKey: 'not-a-key' });
ok('a key of the wrong shape is refused at its box', !r.success && r.field === 'rep.placesKey', JSON.stringify(r));
r = await rep('save_source', { placesKey: WKEY });
ok('the workspace saves its own key', r.success && r.source?.ownKey === true && r.source.ownKeyVerified === false, JSON.stringify(r));
ok('…and it never comes back', !JSON.stringify(r).includes(WKEY) && !JSON.stringify(await rep('status')).includes(WKEY));
ok('…and is encrypted at rest', !JSON.stringify(sql(`SELECT places_key FROM crm_review_sources WHERE account_id = '${A}'`)).includes(WKEY));
seen.length = 0;
r = await rep('find_place', { query: 'Acme Bakery Town' });
ok('find_place returns Google\'s places', r.success && r.places?.some(p => p.placeId === PLACE && p.rating === 4.6), JSON.stringify(r));
ok('…asked Places (New) searchText with the workspace key and a field mask', seen.some(s => s.path === '/v1/places:searchText' && s.key === WKEY && /places\.id/.test(s.mask) && JSON.parse(s.body).textQuery === 'Acme Bakery Town'), JSON.stringify(seen));
r = await rep('save_source', { placeId: PLACE, placeName: 'Acme Bakery' });
ok('save_source keeps the place, and a blank key keeps the stored key', r.success && r.source?.placeId === PLACE && r.source.ownKey === true, JSON.stringify(r));
seen.length = 0;
r = await rep('check_now');
ok('check_now ingests the reviews Google returns', r.success && r.added === 3 && r.via === 'google_places' && r.source?.rating === 4.6 && r.source.reviewCount === 120, JSON.stringify(r));
ok('…from GET /v1/places/{id} asking for reviews', seen.some(s => s.method === 'GET' && s.path === `/v1/places/${PLACE}` && s.mask.split(',').includes('reviews') && s.key === WKEY), JSON.stringify(seen));
ok('…and the workspace key is now marked as having worked', (await rep('status')).source?.ownKeyVerified === true);
r = await rep('check_now');
ok('a second check adds nothing', r.success && r.added === 0, JSON.stringify(r));
let list = (await rep('reviews')).reviews ?? [];
ok('three reviews, none answered', list.length === 3 && list.every(x => x.replyState === 'none' && !x.canPost), JSON.stringify(list).slice(0, 300));
const r2 = list.find(x => x.author === 'Bob Critic');
r = await rep('reply', { reviewId: r2.id, text: 'Sorry Bob.' });
ok('a Places review cannot be posted to, and says why with its Google link', !r.success && r.code === 'cannot_post' && /Business Profile/.test(r.error) && r.link === 'https://maps.google.com/review/r2', JSON.stringify(r));
r = await rep('reply', { reviewId: r2.id, text: '' });
ok('an empty reply is refused at its box', !r.success && r.field === 'rep.reply');
r = await rep('mark_replied', { reviewId: r2.id, text: 'Sorry Bob.' });
list = (await rep('reviews')).reviews;
ok('"Mark as replied" records it as posted elsewhere', r.success && list.find(x => x.id === r2.id)?.replyState === 'posted_elsewhere');
r = await rep('draft_reply', { reviewId: list[0].id });
ok('with no AI key, drafting says so by name', !r.success && r.code === 'no_ai' && /No AI key/.test(r.error), JSON.stringify(r));

/* ── The install key ── */
r = await api('reputation.php', { token: TB, action: 'save_install_key', apiKey: IKEY });
ok('a customer cannot set the install key', !r.success);
r = await api('reputation.php', { token: T, action: 'save_install_key', apiKey: 'AIzaTooShort' });
ok('the owner card refuses a malformed key at its box', !r.success && r.field === 'places.installKey');
r = await api('reputation.php', { token: T, action: 'save_install_key', apiKey: IKEY });
ok('the owner saves the install key (never echoed)', r.success && r.set && r.status === 'unknown' && !JSON.stringify(r).includes(IKEY), JSON.stringify(r));
r = await api('reputation.php', { token: T, action: 'test_install_key' });
ok('…and the test proves it with Google', r.success && r.status === 'ok', JSON.stringify(r));
await rep('save_source', { clearKey: true });
seen.length = 0;
r = await rep('check_now');
ok('with its own key removed, the workspace falls back to the install key', r.success && seen.some(s => s.key === IKEY) && !seen.some(s => s.key === WKEY), JSON.stringify(seen.map(s => s.key)));

/* ── Another tenant ── */
const aReview = list[0].id;
r = await rep('status', {}, A, TB);
ok('B cannot read A\'s source', !r.success, JSON.stringify(r));
r = await rep('reviews', {}, A, TB);
ok('B cannot list A\'s reviews', !r.success);
r = await rep('reply', { reviewId: aReview, text: 'hijack' }, BACCT, TB);
ok('B cannot reply to A\'s review through B\'s own workspace', !r.success && /could not be found/.test(r.error), JSON.stringify(r));
r = await rep('draft_reply', { reviewId: aReview }, BACCT, TB);
ok('…nor draft on it', !r.success && /could not be found/.test(r.error));
r = await rep('mark_replied', { reviewId: aReview, text: 'x' }, BACCT, TB);
ok('…nor mark it', !r.success);
r = await rep('save_source', { placeId: COMP }, A, TB);
ok('B cannot change A\'s source', !r.success);
r = await rep('status', {}, BACCT, TB);
ok('B\'s own workspace shows none of it', r.success && r.source === null && r.counts.total === 0, JSON.stringify(r));

/* ── Every shape of link a customer pastes (A's workspace, install key now) ── */
const one = x => x.success && x.places?.length === 1 && x.places[0].placeId === PLACE;
seen.length = 0;
r = await rep('find_place', { query: 'https://www.google.com/maps/place/Acme+Bakery/@51.5,-0.12,17z/data=!3m1!4b1!4m6!3m5!1s0x48761b:0x1!8m2!3d51.501!4d-0.121!16s%2Fg%2F11abc?entry=ttu' });
ok('a desktop /maps/place/ link finds exactly that business (name searched, narrowed by its cid)', one(r) && r.fromLink === true, JSON.stringify(r));
const textReq = seen.find(x => x.path === '/v1/places:searchText');
ok('…searching its name near the pin', !!textReq && JSON.parse(textReq.body).textQuery === 'Acme Bakery' && JSON.parse(textReq.body).locationBias?.circle?.center?.latitude === 51.501, JSON.stringify(seen.map(x => x.body)));
r = await rep('find_place', { query: `https://search.google.com/local/writereview?placeid=${PLACE}` });
ok('the review-form link (place id) finds it directly', one(r), JSON.stringify(r));
r = await rep('find_place', { query: PLACE });
ok('a bare place id finds it', one(r), JSON.stringify(r));
r = await rep('find_place', { query: `https://www.google.com/maps/place/?q=place_id:${PLACE}` });
ok('a ?q=place_id: link finds it', one(r), JSON.stringify(r));
seen.length = 0;
r = await rep('find_place', { query: 'https://maps.app.goo.gl/acme1' });
ok('a maps.app.goo.gl share link is followed to the business', one(r), JSON.stringify(r));
ok('…asking the shortener without a browser\'s user agent, and never following on its own', seen.some(x => x.path === '/maps.app.goo.gl/acme1' && !/Mozilla/.test(x.ua)), JSON.stringify(seen.map(x => [x.path, x.ua])));
r = await rep('find_place', { query: 'g.page/r/acmeRev/review' });
ok('a g.page review link (no scheme, two hops) is followed to its place id', one(r), JSON.stringify(r));
r = await rep('find_place', { query: 'https://maps.app.goo.gl/gone404' });
ok('a dead short link is reported by name, at the box', !r.success && r.code === 'link_dead' && r.field === 'rep.search', JSON.stringify(r));
r = await rep('find_place', { query: 'https://share.google/elsewhere' });
ok('a short link that leads away from Google is refused', !r.success && r.code === 'not_google', JSON.stringify(r));
r = await rep('find_place', { query: 'https://maps.google.com/?cid=10281119596374313554' });
ok('a bare ?cid= link says why Places cannot use it, and what to paste instead', !r.success && r.code === 'link_cid_only' && /Share/.test(r.error), JSON.stringify(r));
r = await rep('find_place', { query: 'https://www.yelp.com/biz/acme-bakery', field: 'rep.competitorSearch' });
ok('a link that is not Google\'s is refused at the competitor box', !r.success && r.code === 'not_google' && r.field === 'rep.competitorSearch', JSON.stringify(r));
r = await rep('find_place', { query: 'https://www.google.com/maps/place/?q=place_id:ChIJnoSuchPlace0000' });
ok('a place id Google does not know is reported, not shown as found', !r.success && /no business with the place ID/.test(r.error), JSON.stringify(r));

/* ── B's workspace: keys Google refuses, a business with no reviews, unsaved rules, a trial that ended ── */
const repB = (action, extra = {}) => rep(action, extra, BACCT, TB);
await repB('save_source', { placesKey: DKEY });
r = await repB('find_place', { query: 'Acme Bakery' });
ok('a key with the API switched off says so by name', !r.success && r.code === 'api_disabled' && /Places API \(New\)" is not enabled/.test(r.error), JSON.stringify(r));
await repB('save_source', { placesKey: QKEY });
r = await repB('find_place', { query: 'Acme Bakery' });
ok('a key over its quota says so by name', !r.success && r.code === 'quota', JSON.stringify(r));
r = await repB('save_source', { clearKey: true, placeId: ZERO, placeName: 'New Nook' });
ok('B removes its key and picks a new business (the install key is used)', r.success && r.source?.ownKey === false && r.source.placeId === ZERO, JSON.stringify(r));
r = await repB('check_now');
ok('a business with no reviews yet: read, nothing added, a count of 0 and no rating', r.success && r.added === 0 && r.source?.reviewCount === 0 && r.source.rating === null, JSON.stringify(r));
mock.zero = { rating: 5, count: 1, reviews: [
  { name: `places/${ZERO}/reviews/z1`, rating: 5, text: { text: 'Very good bread, friendly service.', languageCode: 'en' }, originalText: { text: 'Très bon pain, accueil chaleureux.', languageCode: 'fr' }, authorAttribution: { displayName: 'Élodie Martin' }, publishTime: '2026-10-01T09:00:00Z', googleMapsUri: 'https://maps.google.com/review/z1' },
] };
r = await repB('check_now');
let listB = (await repB('reviews')).reviews ?? [];
const z1 = listB.find(x => x.author === 'Élodie Martin');
ok('its first review arrives', r.success && r.added === 1 && !!z1, JSON.stringify(r));
ok('…in the words its author wrote (French), not Google\'s translation', z1?.content === 'Très bon pain, accueil chaleureux.', JSON.stringify(z1));
ok('…and with no rules saved, nothing acts on it', z1 && !z1.attention && z1.replyState === 'none' && !z1.note, JSON.stringify(z1));
r = await api('data.php', { token: TB, accountId: BACCT, action: 'bulk_set', items: { crm_reputation_rules: JSON.stringify([{ id: 'x', enabled: true, minRating: 1, maxRating: 3, mode: 'alert', instruction: '', runs: 0 }]) } });
ok('B saves an alert rule for 1–3★', r.success, JSON.stringify(r));
mock.zero = { rating: 3.7, count: 4, reviews: [
  ...mock.zero.reviews,
  { name: `places/${ZERO}/reviews/z2`, rating: 1, text: { text: 'Kalt und unfreundlich.' }, originalText: { text: 'Kalt und unfreundlich.' }, authorAttribution: { displayName: 'Jörg' }, publishTime: '2026-10-02T09:00:00Z', googleMapsUri: 'https://maps.google.com/review/z2' },
] };
r = await repB('check_now');
listB = (await repB('reviews')).reviews ?? [];
const z2 = listB.find(x => x.author === 'Jörg');
ok('the next new review meets the saved rule — even though the business had none at the first read', r.success && r.added === 1 && z2?.attention === true && /Flagged by your rule/.test(z2.note), JSON.stringify(z2));
ok('Google\'s count went up by 3 but Places showed 1: the check says so', r.notes?.some(n => /counts 4 reviews, 3 more than at the last check, but 1 of the 3 new ones are among the five/.test(n)), JSON.stringify(r.notes));
ok('…and the earlier review is untouched by the rule', !listB.find(x => x.author === 'Élodie Martin')?.attention);
sql("UPDATE crm_users SET trial_ends_at = '2026-01-01T00:00:00Z' WHERE email = 'bea@other.test'");
r = await repB('find_place', { query: 'Acme Bakery' });
ok('when the trial has ended, the owner\'s key stops: search says why', !r.success && r.code === 'trial_ended', JSON.stringify(r));
r = await repB('check_now');
ok('…and so does a check, by name', !r.success && r.code === 'trial_ended' && /trial has ended/.test(r.error), JSON.stringify(r).slice(0, 300));
await repB('save_source', { placesKey: WKEY2 });
r = await repB('check_now');
ok('…but a key of the customer\'s own still works after the trial', r.success, JSON.stringify(r).slice(0, 300));
await repB('save_source', { clearKey: true });
sql("UPDATE crm_users SET trial_ends_at = NULL WHERE email = 'bea@other.test'");
await api('reputation.php', { token: T, action: 'save_install_key', apiKey: DKEY });
r = await repB('check_now');
const inst = await api('reputation.php', { token: T, action: 'install_key_status' });
ok('when Google refuses the owner\'s key, the customer is told and the owner\'s card turns to error', !r.success && r.code === 'api_disabled' && inst.status === 'error' && /not enabled/.test(inst.lastError), `${JSON.stringify(r).slice(0, 200)} ${JSON.stringify(inst)}`);
await api('reputation.php', { token: T, action: 'save_install_key', apiKey: IKEY });
r = await api('reputation.php', { token: T, action: 'test_install_key' });
ok('…and a good key, tested, turns it back', r.success && r.status === 'ok', JSON.stringify(r));

/* ── Competitors ── */
r = await rep('add_competitor', { placeId: COMP });
ok('a competitor is added with Google\'s numbers', r.success && r.competitors?.[0]?.rating === 4.1 && r.competitors[0].reviewCount === 50 && r.competitors[0].name === 'Rival Rolls', JSON.stringify(r));
ok('…without asking for reviews', seen.some(s => s.path === `/v1/places/${COMP}` && !s.mask.includes('reviews')));
mock.compRating = 4.3;
r = await rep('competitors', { refresh: true });
ok('refresh reads the new rating', r.success && r.competitors?.[0]?.rating === 4.3, JSON.stringify(r));
r = await rep('add_competitor', { placeId: 'bad id!' });
ok('a bad place id is refused', !r.success && r.field === 'rep.competitorSearch');
ok('B sees no competitors of A', ((await rep('competitors', {}, BACCT, TB)).competitors ?? []).length === 0);

/* ── Business Profile ── */
r = await rep('gbp_connect');
ok('without a Google client, connecting says so', !r.success && r.code === 'no-client', JSON.stringify(r));
await api('auth.php', { token: T, action: 'google_save', clientId: '123-abc.apps.googleusercontent.com', clientSecret: 'test-secret' });
r = await rep('gbp_connect');
const authUrl = new URL(r.url ?? 'http://x');
ok('gbp_connect returns Google\'s consent URL with the business.manage scope and our callback', r.success && authUrl.searchParams.get('scope') === 'https://www.googleapis.com/auth/business.manage' && authUrl.searchParams.get('redirect_uri') === `${B}/api/reputation.php` && authUrl.searchParams.get('access_type') === 'offline', r.url);
const state = authUrl.searchParams.get('state') ?? '';
const cb = async (q) => (await fetch(`${B}/api/reputation.php?${q}`, { headers: { Connection: 'close' } })).text();
let html = await cb(`code=good-code&state=${encodeURIComponent(state.replace(/\|[^|]+$/, '|forgedsig'))}`);
ok('a forged state is refused', /could not be matched/.test(html));
html = await cb(`code=good-code&state=${encodeURIComponent(`${BACCT}|bea@other.test|x|y`)}`);
ok('a state for a workspace that never asked is refused', /could not be matched/.test(html));
html = await cb(`code=good-code&state=${encodeURIComponent(state)}`);
ok('the real callback connects (code exchanged at the token URL)', /Business Profile connected/.test(html) && seen.some(s => s.path === '/token'), html.slice(0, 300));
html = await cb(`code=good-code&state=${encodeURIComponent(state)}`);
ok('…and cannot be replayed', /could not be matched/.test(html));
ok('the tokens are encrypted at rest', !JSON.stringify(sql(`SELECT refresh_token, access_token FROM crm_gbp_connections WHERE account_id = '${A}'`)).includes('rt-1'));
r = await rep('status');
ok('status: connected, no location yet, no token', r.gbp?.status === 'connected' && r.gbp.location === null && r.gbp.ownerEmail === OWNER && !JSON.stringify(r).includes('rt-1'), JSON.stringify(r.gbp));
r = await rep('gbp_locations');
ok('gbp_locations lists the account\'s locations', r.success && r.locations?.length === 1 && r.locations[0].id === 'accounts/111/locations/222' && r.locations[0].title === 'Acme Bakery', JSON.stringify(r));
ok('…through accounts, then locations with the readMask', seen.some(s => s.path === '/v1/accounts' && s.auth === 'Bearer at-1') && seen.some(s => s.path === '/v1/accounts/111/locations' && /readMask=name%2Ctitle%2CstorefrontAddress%2Cmetadata|readMask=name,title,storefrontAddress,metadata/.test(s.search)));
r = await rep('gbp_choose', { location: 'accounts/999/locations/1' });
ok('a location Google did not list is refused', !r.success && r.field === 'rep.gbpLocation');
r = await rep('gbp_choose', { location: 'accounts/111/locations/222' }, A, TB);
ok('B cannot choose A\'s location', !r.success);
r = await rep('gbp_choose', { location: 'accounts/111/locations/222' });
ok('the owner chooses their location', r.success && r.gbp.location?.title === 'Acme Bakery', JSON.stringify(r.gbp));
seen.length = 0;
r = await rep('check_now');
list = (await rep('reviews')).reviews;
ok('check_now reads Business Profile: 3 new, the Places duplicate adopted', r.success && r.via === 'google_business' && r.added === 3 && list.length === 6, `${JSON.stringify(r)} ${list.length}`);
ok('…from the v4 reviews endpoint, newest first', seen.some(s => s.path === '/v4/accounts/111/locations/222/reviews' && /orderBy=updateTime%20desc/.test(s.search) && /pageSize=50/.test(s.search)));
ok('a reply already on Google shows as posted', list.find(x => x.author === 'Eve Eclair')?.replyState === 'posted' && list.find(x => x.author === 'Eve Eclair')?.reply === 'Thanks Eve!');
ok('Google\'s average and count are used', r.source?.rating === 4.5 && r.source.reviewCount === 130, JSON.stringify(r.source));
const dan = list.find(x => x.author === 'Dan Donut');
ok('Business Profile reviews can be posted to', dan?.canPost === true);
r = await rep('reply', { reviewId: dan.id, text: 'Thanks Dan — we hear you on price.' });
ok('reply posts to Google', r.success && r.replyState === 'posted', JSON.stringify(r));
ok('…with a PUT to the review\'s /reply and the right body', mock.replies.some(x => x.review === 'accounts/111/locations/222/reviews/g2' && x.body.comment === 'Thanks Dan — we hear you on price.'), JSON.stringify(mock.replies));
ok('…and the review is posted', (await rep('reviews')).reviews.find(x => x.id === dan.id)?.replyState === 'posted');

mock.gbpDenied = true;
const fay = list.find(x => x.author === 'Fay Flan');
r = await rep('reply', { reviewId: fay.id, text: 'Thanks Fay!' });
ok('a refusal from Google is reported by name', !r.success && /Google has not approved Business Profile API access for this app yet/.test(r.error) && r.code === 'gbp_not_approved', JSON.stringify(r));
ok('…and the text is kept as a draft', (await rep('reviews')).reviews.find(x => x.id === fay.id)?.draft === 'Thanks Fay!');
r = await rep('gbp_locations');
ok('a quota of zero is reported the same way', !r.success && /has not approved Business Profile API access/.test(r.error), JSON.stringify(r));
r = await rep('check_now');
ok('while not approved, the check falls back to Places and says why', r.success && r.via === 'google_places' && r.notes?.some(n => /has not approved/.test(n)) && /has not approved/.test(r.gbp.lastError), JSON.stringify(r).slice(0, 400));
list = (await rep('reviews')).reviews;
ok('…without showing a review Business Profile already read a second time', list.filter(x => x.author === 'Ann Baker').length === 1 && list.length === 6, JSON.stringify(list.map(x => `${x.author}/${x.source}`)));
mock.gbpDenied = false;

/* ── The cron: new reviews meet the rules, and Autopilot's queued request goes out ── */
const items = {
  crm_reputation_rules: JSON.stringify([
    { id: 'a', enabled: true, minRating: 1, maxRating: 2, mode: 'alert', instruction: '', runs: 0 },
    { id: 'b', enabled: true, minRating: 4, maxRating: 5, mode: 'auto_send', instruction: 'Thank them', runs: 0 },
  ]),
  crm_reputation_profile: JSON.stringify({ name: 'Acme Bakery', reviewLinks: { google: 'https://g.page/r/acme/review' }, signature: '— Acme' }),
  crm_contacts: JSON.stringify([{ id: 'c1', name: 'Rita Reviewer', email: 'rita@example.test' }, { id: 'c2', name: 'No Mail', email: '' }]),
  crm_reputation_requests: JSON.stringify([
    { id: 'rr-1', contactId: 'c1', status: 'queued', channel: 'email', createdAt: '2026-10-01T00:00:00Z' },
    { id: 'rr-2', contactId: 'c2', status: 'queued', channel: 'email', createdAt: '2026-10-01T00:00:00Z' },
  ]),
};
r = await api('data.php', { token: T, accountId: A, action: 'bulk_set', items });
ok('rules, profile, contacts and two queued requests are stored', r.success, JSON.stringify(r));
const tick = async () => {
  sql("DELETE FROM crm_meta WHERE k = 'reputation_tick_at'");
  sql(`UPDATE crm_review_sources SET last_checked_at = NULL WHERE account_id = '${A}'`);
  await scheduled();
  await sleep(5000);
};
await tick();
let reqs = (await rep('requests')).requests ?? [];
ok('with no mailbox, queued requests wait and say why', reqs.find(x => x.id === 'rr-1')?.status === 'queued' && /No mailbox|mailbox/i.test(reqs.find(x => x.id === 'rr-1')?.error ?? ''), JSON.stringify(reqs));
r = await api('mailbox.php', { token: T, accountId: A, action: 'save', label: 'Shop', smtp: { host: '127.0.0.1', port: MOCK, encryption: 'none', username: 'u', password: 'p' }, from: { email: 'hello@acme.test', name: 'Acme Bakery' } });
ok('a mailbox is connected', r.success, JSON.stringify(r));
mock.gbpReviews.push(
  { name: 'accounts/111/locations/222/reviews/g5', reviewer: { displayName: 'Gus Grump' }, starRating: 'ONE', comment: 'Rude.', createTime: '2026-09-30T10:00:00Z', updateTime: '2026-09-30T10:00:00Z' },
  { name: 'accounts/111/locations/222/reviews/g6', reviewer: { displayName: 'Hal Happy' }, starRating: 'FIVE', comment: 'Perfect sourdough.', createTime: '2026-09-30T11:00:00Z', updateTime: '2026-09-30T11:00:00Z' },
);
mail.length = 0;
await tick();
list = (await rep('reviews')).reviews;
const gus = list.find(x => x.author === 'Gus Grump'), hal = list.find(x => x.author === 'Hal Happy');
ok('the cron ingested the new reviews', !!gus && !!hal, wlog.slice(-1500));
ok('an alert rule flags the 1★ review', gus?.attention === true && /Flagged by your rule/.test(gus.note), JSON.stringify(gus));
ok('auto-send with no AI keeps it unposted, flagged, and says why', hal?.attention === true && hal.replyState === 'none' && /could not be written/.test(hal.note) && !mock.replies.some(x => x.review.endsWith('/g6')), JSON.stringify(hal));
reqs = (await rep('requests')).requests ?? [];
ok('the queued request is sent', reqs.find(x => x.id === 'rr-1')?.status === 'sent', JSON.stringify(reqs));
ok('…to the contact, with the Google review link', mail.map(readable).some(m => m.includes('rita@example.test') && m.includes('https://g.page/r/acme/review')), mail.join('\n---\n').slice(0, 1500));
ok('a contact with no address fails with the reason', reqs.find(x => x.id === 'rr-2')?.status === 'failed' && /no email/.test(reqs.find(x => x.id === 'rr-2')?.error ?? ''), JSON.stringify(reqs));
const before = mail.length;
await scheduled(); await sleep(2500);
ok('the gate stops a second pass within fifteen minutes', mail.length === before);

/* ── Asking for reviews from the screen: sent, refused, failed — each said ── */
r = await rep('send_requests', { recipients: [{ name: 'Tom', email: 'tom@example.test' }], platform: 'yelp' });
ok('no Yelp link: refused by name before anything is sent', !r.success && r.code === 'no_link', JSON.stringify(r));
r = await rep('send_requests', { recipients: [{ name: 'Tom', email: 'tom@example.test' }] }, BACCT, TB);
ok('a workspace with a link but no mailbox is told so', !r.success && (r.code === 'no_link' || r.code === 'no_mailbox'), JSON.stringify(r));
mail.length = 0;
r = await rep('send_requests', { recipients: [{ name: 'Tom Tester', email: 'tom@example.test' }, { name: 'Ruth', email: 'reject@example.test' }], platform: 'google' });
ok('one sent, one refused by the mail server: reported as partial', r.success === true && r.sent === 1 && r.failed === 1 && /reject@example\.test/.test(r.failures?.[0] ?? ''), JSON.stringify(r));
reqs = (await rep('requests')).requests ?? [];
ok('…and the list says which failed, and why', reqs.some(x => x.email === 'reject@example.test' && x.status === 'failed' && /550|No such user/i.test(x.error)) && reqs.some(x => x.email === 'tom@example.test' && x.status === 'sent'), JSON.stringify(reqs.slice(0, 3)));
/* Read from the raw header: `readable` unwraps quoted-printable, and the
   signature's hex would sometimes be taken for an escape and mangled. */
const tomRaw = mail.find(m => m.includes('tom@example.test')) ?? '';
const unsub = (/^List-Unsubscribe: <([^>]+)>/m.exec(tomRaw) ?? ['', ''])[1];
ok('the request carries a one-click unsubscribe (header and footer link)', !!unsub && /unsubscribe\.php\?/.test(unsub) && Buffer.from(tomRaw.split('\n\n').slice(1).join('').replace(/\s+/g, ''), 'base64').toString('utf8').includes('Unsubscribe</a>'), tomRaw.slice(0, 1500));
const unsubPage = await fetch(unsub, { headers: { Connection: 'close' } });
const unsubHtml = await unsubPage.text();
ok('…which opens a valid page', unsubPage.status === 200 && /Unsubscribe me/.test(unsubHtml), `${unsubPage.status} ${unsub} ${unsubHtml.slice(0, 200)}`);
const u = new URL(unsub);
await fetch(unsub, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Connection: 'close' }, body: u.searchParams.toString() });
r = await rep('send_requests', { recipients: [{ name: 'Tom Tester', email: 'tom@example.test' }], platform: 'google' });
ok('…and once used, that address is not asked again', !r.success && r.sent === 0 && /unsubscribed/.test(r.error), JSON.stringify(r));

/* ── The screen ── */
await page.evaluate(([k]) => {
  localStorage.setItem('crm_reputation_google', JSON.stringify({ apiKey: k, placeId: 'ChIJplaceAAAA0001' }));
  localStorage.setItem('crm_reputation_reviews', JSON.stringify([{ id: 'seed-0', author: 'Amanda Foster', rating: 5, content: 'Outstanding', platform: 'google' }]));
}, [WKEY2]);
await page.waitForTimeout(1800);
ok('(a legacy plaintext key reaches crm_data the old way)', sql(`SELECT COUNT(*) AS n FROM crm_data WHERE account_id = '${A}' AND k = 'crm_reputation_google'`)[0].n === 1);
await page.goto(`${B}/reputation`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const body = await page.locator('body').innerText();
ok('the screen shows real reviews', /Dan Donut/.test(body) && /Hal Happy/.test(body), body.slice(0, 300));
ok('no sample reviews are shown', !/Amanda Foster|Northgate Rivals|Bluepeak|Summit & Co/.test(body));
ok('competitors are real', /Rival Rolls/.test(body));
ok('"Last checked" is shown', /Last checked/.test(body));
ok('the legacy key was moved and removed', await page.evaluate(() => localStorage.getItem('crm_reputation_google')) === null && (await rep('status')).source?.ownKey === true);
await page.waitForTimeout(1500);
ok('…including the plaintext copy on the server', sql(`SELECT COUNT(*) AS n FROM crm_data WHERE account_id = '${A}' AND k = 'crm_reputation_google'`)[0].n === 0);
ok('legacy sample reviews are cleared', await page.evaluate(() => localStorage.getItem('crm_reputation_reviews')) === null);
ok('Business Profile reviews offer "Post to Google"', await page.getByRole('button', { name: /Post to Google/ }).count() > 0);
ok('Places reviews offer "Copy reply & open on Google"', await page.getByRole('button', { name: /Copy reply & open on Google/ }).count() > 0);
ok('no sideways scroll at 1280', (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
const ritaBefore = ((await rep('requests')).requests ?? []).filter(x => x.email === 'rita@example.test' && x.status === 'sent').length;
await page.getByRole('button', { name: /Request Reviews/ }).click();
const reqDlg = page.getByRole('dialog', { name: 'Request reviews' });
await reqDlg.getByRole('button', { name: /Rita Reviewer/ }).click();
await reqDlg.getByRole('button', { name: /^Send 1 request$/ }).click();
await page.waitForTimeout(3000);
ok('Request Reviews on the screen sends through the server, from the workspace mailbox', ((await rep('requests')).requests ?? []).filter(x => x.email === 'rita@example.test' && x.status === 'sent').length === ritaBefore + 1 && await reqDlg.count() === 0);
await page.getByRole('button', { name: 'Reputation settings' }).click();
await page.getByRole('dialog').getByRole('button', { name: /Review Sources/ }).click();
await page.waitForTimeout(400);
await page.locator('[data-field="rep.search"]').fill(`https://search.google.com/local/writereview?placeid=${PLACE}`);
await page.getByRole('dialog').getByRole('button', { name: /^Search$/ }).click();
await page.waitForTimeout(1500);
ok('pasting a Google review link in the search box finds the business it names', /This is the business your link points to/.test(await page.getByRole('dialog').innerText()) && await page.getByRole('dialog').getByRole('button', { name: /Acme Bakery/ }).count() === 1);
ok('Review sources: search, own key, Business Profile, link-only platforms', await page.locator('[data-field="rep.search"]').isVisible() && await page.locator('[data-field="rep.placesKey"]').isVisible() && /not<\/strong> read|are not read/.test(await page.getByRole('dialog').innerHTML()) && /Google Business Profile/.test(await page.getByRole('dialog').innerText()));
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(500);
ok('no sideways scroll at 390 with the dialog open', (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).last().click();
await page.waitForTimeout(400);
ok('no sideways scroll at 390', (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
await page.goto(`${B}/settings`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /^Platform services/ }).first().click();
await page.waitForTimeout(800);
ok('the owner sees the Google Maps key card on Platform services, without the key', /Google Maps key \(Places API\)/.test(await page.locator('body').innerText()) && !(await page.content()).includes(IKEY));
ok('no page errors', !errs.length, errs.join(' | '));
await br.close();

/* ── Business Profile: an hour later, a revoked grant, and disconnecting ── */
sql(`UPDATE crm_gbp_connections SET expires_at = '2000-01-01T00:00:00.000Z' WHERE account_id = '${A}'`);
seen.length = 0;
r = await rep('check_now');
ok('an expired access token is refreshed with the stored refresh token, then used', r.success && r.via === 'google_business'
  && seen.some(x => x.path === '/token' && new URLSearchParams(x.body).get('grant_type') === 'refresh_token')
  && seen.some(x => x.path.startsWith('/v4/') && x.auth === 'Bearer at-2'), JSON.stringify(seen.map(x => [x.path, x.auth])));
mock.refreshDenied = true;
sql(`UPDATE crm_gbp_connections SET expires_at = '2000-01-01T00:00:00.000Z' WHERE account_id = '${A}'`);
r = await rep('check_now');
const revoked = (await rep('status')).gbp;
ok('a grant Google revoked: the connection says "connect again", and the check falls back to Places', r.success && r.via === 'google_places' && revoked?.status === 'error' && /Connect (it|Business Profile) again/.test(revoked.lastError), `${JSON.stringify(revoked)} ${JSON.stringify(r).slice(0, 300)}`);
ok('…and its reviews can no longer be posted to from here', !(await rep('reviews')).reviews.some(x => x.canPost));
mock.refreshDenied = false;
r = await rep('gbp_disconnect');
ok('disconnect removes the connection and keeps the reviews already read', r.success && r.gbp.status === 'none' && r.counts.total >= 6, JSON.stringify(r).slice(0, 300));
ok('…and its tokens', sql(`SELECT COUNT(*) AS n FROM crm_gbp_connections WHERE account_id = '${A}'`)[0].n === 0);

stop();
console.log(fail ? `\n${fail} failed` : '\nall passed');
process.exit(fail ? 1 : 0);
