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
const VALID = new Set([WKEY, IKEY, WKEY2]);
const PLACE = 'ChIJplaceAAAA0001', COMP = 'ChIJcompetitor01';
const T0 = '2026-09-20T10:00:00.000000Z';
const seen = [];
const mock = {
  compRating: 4.1, gbpDenied: false, replies: [],
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
  : id === COMP ? { id: COMP, displayName: { text: 'Rival Rolls' }, formattedAddress: '9 Low St, Town', rating: mock.compRating, userRatingCount: 50, googleMapsUri: 'https://maps.google.com/?cid=2' } : null;

const httpSrv = http.createServer((req, res) => {
  let raw = '';
  req.on('data', c => { raw += c; });
  req.on('end', () => {
    const u = new URL(req.url, G);
    seen.push({ method: req.method, path: u.pathname, search: u.search, key: req.headers['x-goog-api-key'] ?? '', mask: req.headers['x-goog-fieldmask'] ?? '', auth: req.headers.authorization ?? '', body: raw });
    if (u.pathname.startsWith('/v1/places')) {
      const key = String(req.headers['x-goog-api-key'] ?? '');
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
      if (f.get('grant_type') === 'refresh_token' && f.get('refresh_token') === 'rt-1') return send(res, 200, { access_token: 'at-2', expires_in: 3600 });
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
const vars = [`APP_ORIGIN:${B}`, `GOOGLE_PLACES_BASE:${G}`, `GOOGLE_GBP_ACCOUNTS_BASE:${G}`, `GOOGLE_GBP_INFO_BASE:${G}`, `GOOGLE_GBP_V4_BASE:${G}`, `GOOGLE_TOKEN_URL:${G}/token`];
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
await page.getByRole('button', { name: 'Reputation settings' }).click();
await page.getByRole('dialog').getByRole('button', { name: /Review Sources/ }).click();
await page.waitForTimeout(400);
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

stop();
console.log(fail ? `\n${fail} failed` : '\nall passed');
process.exit(fail ? 1 : 0);
