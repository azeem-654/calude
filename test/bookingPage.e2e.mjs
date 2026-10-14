/**
 * The booking page, end to end: an owner in New York, a visitor in Bangkok.
 *
 * Proves the times a visitor sees are the owner's hours moved into the
 * visitor's zone, that the booking lands at the right instant (and is filed
 * under the owner's date and hour), that the server refuses a time the page
 * would never offer, the address check across workspaces, the photo/logo/clip
 * uploads (bytes checked, not names), the editor on the Scheduling screen's
 * Booking page tab, and the page at 390 and 1280 with nothing overflowing.
 *
 * And the page filled in from a website: a mock site (logo, a photo captioned
 * as the founder, an unlabelled preview picture, a YouTube link) read with no
 * AI on the install — the readable parts filled, the AI said not to have been
 * used — by the action itself and by the editor opening on an empty page;
 * points with icons, topics and the colour published; the page as the
 * visitor gets it, with no platform name, trial offer or testimonial on it.
 *
 *   VITE_BASE=/ npm run build
 *   npx wrangler d1 migrations apply crmpro --local --persist-to <dir>
 *   npx wrangler dev --local --port 8971 --persist-to <dir> --var SITE_TEST_ORIGIN:http://127.0.0.1:8982
 *   BASE=http://127.0.0.1:8971 PERSIST=<dir> [SITE_PORT=8982] [SHOTS=<dir>] npm run test:bookingpage
 *
 * With no AI key on that wrangler (no AI_API_KEY, no owner key): the
 * website section proves the no-AI path. SHOTS saves screenshots.
 */
import { execSync } from 'node:child_process';
import http from 'node:http';
import zlib from 'node:zlib';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';
const SHOTS = process.env.SHOTS ?? '';
const run = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c ? '' : ` — ${String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 400)}`}`); };

async function api(path, body, ip = '10.9.0.1') {
  const r = await fetch(`${BASE}/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': ip }, body: JSON.stringify(body) });
  let data = {}; try { data = await r.json(); } catch { /* not json */ }
  return { status: r.status, data, ok: !!data.success, field: r.headers.get('X-Refused-Field') };
}
const persist = process.env.PERSIST ? ` --persist-to ${process.env.PERSIST}` : '';
const d1rows = sql => { try { return JSON.parse(execSync(`npx wrangler d1 execute crmpro --local${persist} --json --command ${JSON.stringify(sql)}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))[0]?.results ?? []; } catch (e) { console.log(String(e.stdout ?? e)); return []; } };
d1rows('DELETE FROM crm_signup_attempts');
d1rows("DELETE FROM crm_rate_limits WHERE bucket LIKE 'booking%' OR bucket LIKE 'signup%'");

async function signUp(tag, i) {
  const email = `bk-${tag}-${run}@example.test`;
  const r = await api('auth.php', { action: 'register', email, name: `Owner ${tag}`, password: 'Correct-horse-9' }, `10.9.${i}.1`);
  if (!r.ok) throw new Error(`sign-up ${tag}: ${JSON.stringify(r.data)}`);
  return { email, token: r.data.token, acct: r.data.user.accountId };
}
/* ── A business's website, for "Fill it in from my website" ──
   Served on SITE_PORT; wrangler dev must run with
   --var SITE_TEST_ORIGIN:http://127.0.0.1:<SITE_PORT>, which sends every
   `*.test` host there (lib/readSite.ts `wireUrl`). It has a logo, a photo the
   site captions as its founder, an unlabelled link-preview picture, a
   YouTube link and enough words to read. */
const SITE_PORT = Number(process.env.SITE_PORT ?? 8982);
const SITE = 'https://brightco.test/';
function solidPng(w, h, [r, g, b]) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3).map((_, i) => [r, g, b][i % 3])]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}
const words = 'We help plumbers, electricians and roofers win more local jobs with honest marketing. '.repeat(6);
const siteHtml = `<!doctype html><html><head><title>Bright &amp; Co — Marketing for local trades</title>
<meta name="description" content="Marketing for local trades. We help plumbers and electricians win more local jobs.">
<meta property="og:image" content="/img/hero.png">
<link rel="apple-touch-icon" href="/apple.png"></head><body>
<header><img class="site-logo" src="/logo.png" alt="Bright and Co logo"></header>
<h1>Bright &amp; Co</h1><p>${words}</p>
<img src="/team/jane.png" alt="Jane Bright, founder">
<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>
</body></html>`;
const siteFiles = { '/logo.png': solidPng(240, 80, [15, 107, 76]), '/team/jane.png': solidPng(300, 300, [200, 150, 120]), '/img/hero.png': solidPng(400, 200, [30, 60, 90]), '/apple.png': solidPng(180, 180, [15, 107, 76]) };
const site = http.createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (path === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(siteHtml); return; }
  if (siteFiles[path]) { res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': siteFiles[path].length }); res.end(siteFiles[path]); return; }
  res.writeHead(404); res.end('no');
});
await new Promise(r => site.listen(SITE_PORT, '127.0.0.1', r));

const A = await signUp('a', 1);
const B = await signUp('b', 2);

/* The owner's week, New York, 9–5 weekdays, half-hour meetings. */
const open = { enabled: true, from: '09:00', to: '17:00' };
const shut = { enabled: false, from: '09:00', to: '17:00' };
const weekly = { mon: open, tue: open, wed: open, thu: open, fri: open, sat: shut, sun: shut };
const slugA = `amira-lee-${run}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const upload = (who, kind, bytes) => fetch(`${BASE}/api/booking-media.php?action=upload&kind=${kind}&accountId=${who.acct}`, {
  method: 'POST', headers: { Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/octet-stream', Connection: 'close' }, body: bytes,
}).then(async r => ({ status: r.status, data: await r.json().catch(() => ({})), field: r.headers.get('X-Refused-Field') }));

console.log('\nUploads — what a file is comes from its bytes');
const photo = await upload(A, 'photo', PNG);
ok('a PNG photo is taken', photo.data.success && /^\/api\/booking-media\.php\?k=[a-f0-9]{36}$/.test(photo.data.url), photo.data);
const logo = await upload(A, 'logo', PNG);
ok('a PNG logo is taken', logo.data.success, logo.data);
const html = await upload(A, 'photo', Buffer.from('<html><script>alert(1)</script></html>'));
ok('an HTML page called a photo is refused, on the photo box', !html.data.success && html.field === 'booking.photo', html);
const got = await fetch(`${BASE}${photo.data.url}`);
ok('the photo is served as image/png, nosniff, running nothing', got.status === 200 && got.headers.get('content-type') === 'image/png'
  && got.headers.get('x-content-type-options') === 'nosniff' && /default-src 'none'/.test(got.headers.get('content-security-policy') ?? ''), [...got.headers]);
const clip = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(200, 7)]);
const vid = await upload(A, 'video', clip);
if (vid.data.code === 'no_storage') {
  ok('without the VIDEO bucket a clip is refused by name, on the video box', vid.field === 'booking.video', vid);
} else {
  ok('a clip (MP4 by its ftyp box) is taken', vid.data.success, vid.data);
  const part = await fetch(`${BASE}${vid.data.url}`, { headers: { Range: 'bytes=0-9' } });
  ok('the clip answers a range, as a video element asks', part.status === 206 && (await part.arrayBuffer()).byteLength === 10 && part.headers.get('content-type') === 'video/mp4', part.status);
}
const notClip = await upload(A, 'video', Buffer.from('this is not a video at all, just words'));
ok('words called a clip are refused', !notClip.data.success, notClip.data);

console.log('\nPublishing and the address');
const publishA = await api('booking.php', { action: 'publish', token: A.token, accountId: A.acct, public: {
  slug: slugA, title: 'Strategy call', hostName: 'Dr Amira Lee', businessName: 'Lee Clinic', description: 'Thirty minutes on what to do next.\nNo slides.',
  bullets: ['A plan for the next 90 days', '  ', 'Answers about pricing'], hostRole: 'Founder', tagline: 'Family clinic, Brooklyn',
  tags: ['Health', 'Nutrition', '', 'Sleep', 'Stress', 'Fifth'], discuss: ['Your goals', 'Your diet'], accent: 'red; background:url(x)', duration: 30, location: 'Video call', timezone: 'America/New_York', weekly,
  bufferBefore: 0, bufferAfter: 0, dailyLimit: 20, minNoticeMin: 0, windowDays: 60, photoUrl: photo.data.url, logoUrl: logo.data.url,
  videoFileUrl: vid.data.url ?? '', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', imageUrl: 'javascript:alert(1)',
} });
ok('A publishes the page', publishA.ok, publishA.data);
const cfgA = (await api('booking.php', { action: 'config', slug: slugA })).data.config ?? {};
ok('the page keeps its own uploads and drops blank points', cfgA.photoUrl === photo.data.url && cfgA.logoUrl === logo.data.url && cfgA.bullets?.length === 2, cfgA);
ok('plain lines from an older editor become points with ticks', cfgA.points?.length === 2 && cfgA.points.every(pt => pt.icon === 'check') && cfgA.points[0].title === 'A plan for the next 90 days', cfgA.points);
ok('topics are four at most, blanks gone; a colour that is not a hex is dropped', cfgA.tags?.length === 4 && !cfgA.tags.includes('') && cfgA.accent === '' && cfgA.hostRole === 'Founder', cfgA);
ok('a javascript: picture address is dropped', cfgA.imageUrl === '', cfgA.imageUrl);
const taken = await api('booking.php', { action: 'slug_check', token: B.token, accountId: B.acct, slug: slugA });
ok("B is told A's address is taken", taken.ok && taken.data.available === false && /Another workspace/.test(taken.data.reason), taken.data);
const free = await api('booking.php', { action: 'slug_check', token: B.token, accountId: B.acct, slug: `b-${run}-page` });
ok('a free address is free', free.ok && free.data.available === true, free.data);
const bad = await api('booking.php', { action: 'slug_check', token: B.token, accountId: B.acct, slug: '-x' });
ok('a malformed address says why', bad.ok && bad.data.available === false && !!bad.data.reason, bad.data);
const steal = await api('booking.php', { action: 'publish', token: B.token, accountId: B.acct, public: { slug: slugA, title: 'B', timezone: 'Europe/London', weekly } });
ok("B's publish under A's address is refused, on the address box", !steal.ok && steal.field === 'booking.slug', steal);
const badZone = await api('booking.php', { action: 'publish', token: B.token, accountId: B.acct, public: { slug: `b-${run}-page`, timezone: 'Mars/Olympus', weekly } });
ok('a time zone Intl does not know is refused, on the zone box', !badZone.ok && badZone.field === 'booking.timezone', badZone);

console.log('\nFill it in from the website — with no AI on this install');
{
  const r = await api('booking.php', { action: 'autofill', token: A.token, accountId: A.acct, url: SITE, business: 'Bright & Co' });
  ok('the site is read', r.ok, r.data);
  const d = r.data;
  ok('it says the AI was not used, and why', d.ai && d.ai.used === false && /No AI/.test(d.ai.why), d.ai);
  ok('the YouTube link on the page is found, as a watch link', d.fill?.videoUrl === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', d.fill);
  ok('the description is the site\'s own, its first sentence the tagline', /win more local jobs/.test(d.fill?.description ?? '') && d.fill?.tagline === 'Marketing for local trades.', d.fill);
  ok('no AI words: no points, no title, no host invented', !d.fill?.points?.length && !d.fill?.title && !d.fill?.hostName, d.fill);
  ok('the logo the site marks comes back as a PNG to shrink', /^data:image\/png;base64,/.test(d.logo?.dataUrl ?? '') && /logo\.png$/.test(d.logo?.from ?? ''), d.logo && d.logo.from);
  ok('the photo is the one captioned as the founder, said so', /^data:image\/png;base64,/.test(d.photo?.dataUrl ?? '') && /Jane Bright, founder/.test(d.photo?.what ?? ''), d.photo && d.photo.what);
  const intoA = await api('booking.php', { action: 'autofill', token: B.token, accountId: A.acct, url: SITE });
  ok("B cannot read a website into A's page", !intoA.ok && intoA.status === 403, intoA);
  const inside = await api('booking.php', { action: 'autofill', token: A.token, accountId: A.acct, url: 'http://127.0.0.1:8981/' });
  ok('an address inside the network is refused, on the website box', !inside.ok && inside.field === 'booking.website', inside);
}

console.log('\nThe server checks the time');
/* The next Monday in New York, at least two days out. */
const ny = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
let monday = '';
for (let i = 2; i < 12 && !monday; i++) { const d = new Date(Date.now() + i * 86400000); if (new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(d) === 'Mon') monday = ny(d); }
const offGrid = await api('booking.php', { action: 'create', accountId: A.acct, slotDate: monday, slotTime: '03:00', guestName: 'Night', guestEmail: 'n@example.test' }, '10.9.5.1');
ok('03:00 on a working day is refused', !offGrid.ok && /not one this page offers/.test(offGrid.data.error), offGrid.data);
const between = await api('booking.php', { action: 'create', accountId: A.acct, slotDate: monday, slotTime: '09:10', guestName: 'Odd', guestEmail: 'o@example.test' }, '10.9.5.1');
ok('09:10 (off the half-hour grid) is refused', !between.ok, between.data);

console.log('\nA visitor in Bangkok, the owner in New York');
const browser = await pw.chromium.launch();
/*
 * The clip's own bytes are not fetched by the pages here: the test clip is a
 * 200-byte stand-in no player can decode, and a context closed while the
 * browser is still streaming it makes `wrangler dev`'s proxy exit (a local
 * tooling fault — the range answer itself is checked above).
 */
async function newContext(opts) {
  const ctx = await browser.newContext(opts);
  await ctx.route(/\/api\/booking-media\.php\?k=/, r => (r.request().resourceType() === 'media' ? r.abort() : r.continue()));
  return ctx;
}
const mondayDay = String(Number(monday.slice(8, 10)));
/* The page opens on the first day with a time — today, on a weekday — so the
   Monday the test is about is picked, a month on when it falls in the next. */
async function openMonday(p) {
  await p.locator('.bkp-day[data-on]').waitFor({ timeout: 10000 });
  const shown = await p.locator('.bkp-month b').innerText();
  const want = new Date(`${monday}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  if (!shown.includes(want)) await p.getByRole('button', { name: 'Next month' }).click();
  await p.locator('.bkp-day[data-open]').filter({ hasText: new RegExp(`^${mondayDay}$`) }).click();
  await p.locator('.bkp-day[data-on]').filter({ hasText: new RegExp(`^${mondayDay}$`) }).waitFor({ timeout: 5000 });
}
async function firstSlots(timezoneId) {
  const ctx = await newContext({ timezoneId, locale: 'en-US', viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/book/${slugA}`, { waitUntil: 'networkidle' });
  await openMonday(p);
  const day = await p.locator('.bkp-day[data-on]').innerText();
  const times = await p.locator('.bkp-times .bkp-slot').allInnerTexts();
  await ctx.close();
  return { day, times };
}
const nyView = await firstSlots('America/New_York');
const bkkView = await firstSlots('Asia/Bangkok');
ok('New York sees Monday 9:00 am first', nyView.day === mondayDay && nyView.times[0] === '9:00 am', nyView);
const toMin = t => { const m = /^(\d+):(\d\d) (am|pm)$/.exec(t); return m ? ((Number(m[1]) % 12) + (m[3] === 'pm' ? 12 : 0)) * 60 + Number(m[2]) : NaN; };
/* New York is UTC−4 until 1 November, UTC−5 after: Bangkok (UTC+7) is 11 or 12 hours ahead. */
const gap = ((toMin(bkkView.times[0]) - toMin(nyView.times[0])) / 60 + 24) % 24;
const expectGap = 7 - (new Date(`${monday}T12:00:00Z`).toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).includes('EDT') ? -4 : -5);
ok(`Bangkok's first time is ${expectGap} hours after New York's (${bkkView.times[0]} vs ${nyView.times[0]})`, gap === expectGap, { ny: nyView.times.slice(0, 3), bkk: bkkView.times.slice(0, 3) });
ok('Bangkok sees the evening part of Monday (8 pm or 9 pm first)', /^(8|9):00 pm$/.test(bkkView.times[0]), bkkView.times);

/* Book it from Bangkok, at both widths, checking the page as it goes. */
for (const [w, h] of [[390, 844], [1280, 900]]) {
  const ctx = await newContext({ timezoneId: 'Asia/Bangkok', locale: 'en-US', viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${BASE}/book/${slugA}`, { waitUntil: 'networkidle' });
  await p.locator('.bkp-day[data-on]').waitFor({ timeout: 10000 });
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`${w}px · no horizontal overflow on the calendar`, over <= 0, `${over}px`);
  const info = await p.locator('.bkp-info').innerText();
  ok(`${w}px · the left side says who, what, the points and the zone`, /Dr Amira Lee/.test(info) && /Strategy call/.test(info) && /90 days/.test(info) && /Bangkok time \(GMT\+7\)/.test(info), info);
  ok(`${w}px · the band, the role, the topics and what to discuss are there`, /Lee Clinic/.test(info) && /Family clinic, Brooklyn/.test(info) && /Founder/.test(info) && /Nutrition/.test(info) && /Your diet/.test(info) && /One-to-one with Dr Amira Lee/.test(info), info);
  ok(`${w}px · the photo and logo are on the page`, await p.locator('.bkp-avatar[src*="booking-media"]').count() === 1 && await p.locator('.bkp-logo').count() === 1);
  ok(`${w}px · the zone picker starts on the visitor's zone`, (await p.locator('#bkp-zone').inputValue()) === 'Asia/Bangkok');
  if (w === 1280) {
    await openMonday(p);
    await p.locator('.bkp-slot').first().click();
    await p.getByRole('button', { name: 'Next', exact: true }).click();
    const note = await p.locator('.bkp-ownertime').innerText();
    ok('the details step says the owner\'s time too', /9:00 am/.test(note) && /New York/.test(note), note);
    await p.locator('[data-field="booking.guestName"]').fill('Somchai P');
    await p.locator('[data-field="booking.guestEmail"]').fill(`somchai-${run}@example.test`);
    await p.getByRole('button', { name: 'Schedule meeting' }).click();
    await p.locator('[data-testid="booking-summary"]').waitFor({ timeout: 10000 });
    const sum = await p.locator('[data-testid="booking-summary"]').innerText();
    ok('the confirmation is in Bangkok time, with New York beside it', new RegExp(bkkView.times[0].replace(' ', ' ')).test(sum) && /Bangkok time/.test(sum) && /9:00 am in New York/.test(sum), sum);
    const overDone = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok('1280px · no overflow on the confirmation', overDone <= 0, `${overDone}px`);
    const row = d1rows(`SELECT slot_date, slot_time, data FROM crm_bookings WHERE account_id = '${A.acct}' ORDER BY created_at DESC LIMIT 1`)[0];
    const data = row ? JSON.parse(row.data) : {};
    const expectUtc = new Date(Date.parse(`${monday}T09:00:00Z`) - (expectGap === 11 ? -4 : -5) * 3600000).toISOString();
    ok('filed under the owner\'s Monday 09:00', row?.slot_date === monday && row?.slot_time === '09:00', row);
    ok(`at the instant ${expectUtc}, with both zones kept`, data.startsAt === expectUtc && data.timezone === 'Asia/Bangkok' && data.ownerTimezone === 'America/New_York' && data.duration === 30, data);
  } else {
    await p.locator('.bkp-slot').first().click();
    const overSel = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok('390px · no overflow with a time picked', overSel <= 0, `${overSel}px`);
  }
  ok(`${w}px · nothing threw`, errs.length === 0, errs.join(' | '));
  await ctx.close();
}
const again = await firstSlots('America/New_York');
ok('the booked 9:00 am is gone for the next visitor', again.times[0] !== '9:00 am' || again.day !== mondayDay, again);
const twice = await api('booking.php', { action: 'create', accountId: A.acct, slotDate: monday, slotTime: '09:00', guestName: 'Late', guestEmail: 'late@example.test' }, '10.9.6.1');
ok('booking the same time again is refused as taken', !twice.ok && /just booked/.test(twice.data.error), twice.data);

console.log('\nThe editor — Scheduling → Booking page (the same one the AI Autopilot wizard shows)');
{
  const ctx = await newContext({ timezoneId: 'America/New_York', locale: 'en-US', viewport: { width: 1280, height: 950 } });
  await ctx.addInitScript(([token, acct]) => {
    /* Init scripts run in every frame — the Vimeo player in the preview too, whose storage is not ours. */
    if (window.top !== window) return;
    localStorage.setItem('crm_session', JSON.stringify({ token, backend: 'php', user: { email: 'b@example.test', name: 'B', role: 'agency', accountId: acct } }));
    localStorage.setItem('crm_active_account', acct);
    localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: acct, name: 'B Studio', plan: 'starter', status: 'active', price: 0 }]));
  }, [B.token, B.acct]);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(`${String(e)} @ ${(e.stack ?? '').split('\n').slice(1, 3).join(' ')}`));
  await p.goto(`${BASE}/scheduling`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Booking page' }).first().click();
  await p.locator('.bks').waitFor({ timeout: 10000 });
  ok('the editor and the live preview are on screen', await p.locator('.bks .bkp-card').isVisible());
  await p.locator('[data-field="booking.slug"]').first().fill(slugA);
  await p.locator('.bks .bks-bad').first().waitFor({ timeout: 8000 });
  ok("typing A's address says it is taken, under the box", /Another workspace/.test(await p.locator('.bks .bks-bad').first().innerText()));
  await p.locator('[data-field="booking.slug"]').first().fill(`b-studio-${run}`);
  await p.locator('.bks .bks-good').first().waitFor({ timeout: 8000 });
  ok('a free one is accepted', /Available/.test(await p.locator('.bks .bks-good').first().innerText()));
  await p.locator('[data-field="booking.title"]').fill('Discovery session');
  await p.getByRole('button', { name: 'Add a point' }).click();
  await p.getByLabel('Point 1', { exact: true }).fill('A written summary afterwards');
  await p.locator('input[aria-label="Upload your photo"]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });
  await p.locator('.bks-preview .bkp-avatar[src*="booking-media"]').waitFor({ timeout: 10000 });
  const prev = await p.locator('.bks-preview').innerText();
  ok('the preview follows the edits: title, point and photo', /Discovery session/.test(prev) && /written summary/.test(prev), prev.slice(0, 300));
  await p.locator('[data-field="booking.videoUrl"]').fill('https://example.com/not-a-video');
  ok('a link that is not YouTube, Vimeo or Loom is said not to show', /will not show/.test(await p.locator('.bks').innerText()));
  await p.locator('[data-field="booking.videoUrl"]').fill('https://vimeo.com/76979871');
  await p.locator('.bks-preview .bkp-play[data-provider="vimeo"]').click();
  await p.locator('.bks-preview iframe[src*="player.vimeo.com"]').waitFor({ timeout: 5000 });
  ok('a Vimeo link plays in the preview once its play button is pressed', true);
  await p.waitForTimeout(2500); // the screen publishes a moment after the last change
  const cfgB = (await api('booking.php', { action: 'config', slug: `b-studio-${run}` })).data.config ?? {};
  ok('the Scheduling screen published it under the new address', cfgB.title === 'Discovery session' && /booking-media/.test(cfgB.photoUrl ?? '') && cfgB.bullets?.[0] === 'A written summary afterwards', cfgB);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('1280px · the editor does not overflow', over <= 0, `${over}px`);
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(400);
  const over390 = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('390px · the editor does not overflow', over390 <= 0, `${over390}px`);
  ok('the editor threw nothing', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('\nThe editor fills itself in from the website, once, on an empty page');
{
  const C = await signUp('c', 3);
  const ctx = await newContext({ timezoneId: 'Europe/London', locale: 'en-GB', viewport: { width: 1280, height: 950 } });
  await ctx.addInitScript(([token, acct, site]) => {
    if (window.top !== window) return;
    localStorage.setItem('crm_session', JSON.stringify({ token, backend: 'php', user: { email: 'c@example.test', name: 'C', role: 'agency', accountId: acct } }));
    localStorage.setItem('crm_active_account', acct);
    localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: acct, name: 'Bright & Co', businessName: 'Bright & Co', plan: 'starter', status: 'active', price: 0 }]));
    /* The workspace profile knows the website — what the wizard would have read. */
    if (!localStorage.getItem(`crm_acct_${acct}_crm_onboarding`)) {
      localStorage.setItem(`crm_acct_${acct}_crm_onboarding`, JSON.stringify({ version: 1, profile: { companyName: 'Bright & Co', website: site, brandColor: '#7c3aed' } }));
    }
  }, [C.token, C.acct, SITE]);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(`${String(e)} @ ${(e.stack ?? '').split('\n').slice(1, 3).join(' ')}`));
  await p.goto(`${BASE}/scheduling`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Booking page' }).first().click();
  await p.locator('[data-testid="booking-autofill"]').waitFor({ timeout: 20000 });
  const panel = await p.locator('[data-testid="booking-autofill"]').innerText();
  ok('it filled itself in from brightco.test and said what', /Filled in from brightco\.test/.test(panel) && /logo/.test(panel) && /photo \(the picture captioned “Jane Bright, founder”\)/.test(panel) && /video link/.test(panel), panel);
  ok('…and that the AI was not used, and why', /AI not used: No AI is available/.test(panel), panel);
  ok('the website box holds the address it read', (await p.locator('[data-field="booking.website"]').inputValue()) === SITE);
  const prev = p.locator('.bks-preview');
  await prev.locator('.bkp-logo[src*="booking-media"]').waitFor({ timeout: 10000 });
  ok('the preview shows the logo and the photo, both uploaded here', await prev.locator('.bkp-avatar[src*="booking-media"]').count() === 1);
  ok('…the video as a YouTube still with a play button', await prev.locator('.bkp-play[data-provider="youtube"]').count() === 1);
  ok('…and the tagline in the band', /Marketing for local trades\./.test(await prev.locator('.bkp-band').innerText()));
  ok('the preview is the desktop layout: two cards side by side', await p.evaluate(() => {
    const [a, b] = [...document.querySelectorAll('.bks-preview .bkp-panel')].map(e => e.getBoundingClientRect());
    return !!a && !!b && Math.abs(a.top - b.top) < 4 && b.left > a.right - 1;
  }));

  /* Points with icons, a topic, the colour. */
  await p.getByRole('button', { name: 'Add a point' }).click();
  await p.getByLabel('Point 1', { exact: true }).fill('Win more local jobs');
  await p.getByLabel('Point 1 detail').fill('From search and maps');
  await p.getByRole('button', { name: /^Icon for point 1/ }).click();
  await p.getByRole('group', { name: 'Choose an icon for point 1' }).getByRole('button', { name: 'Launch' }).click();
  await p.getByLabel('Add a topic').fill('Local SEO');
  await p.getByLabel('Add a topic').press('Enter');
  await p.getByRole('button', { name: 'Add something to discuss' }).click();
  await p.getByLabel('Topic to discuss 1', { exact: true }).fill('Your Google profile');
  await p.getByRole('button', { name: 'Your brand colour #7c3aed' }).click();
  const card = await prev.locator('.bkp-info').innerText();
  ok('the preview follows: the point, its detail, the topic, what to discuss', /Win more local jobs/.test(card) && /From search and maps/.test(card) && /Local SEO/.test(card) && /Your Google profile/.test(card), card.slice(0, 600));
  ok('the band is in the brand colour picked', /rgb\(124, 58, 237\)/.test(await prev.locator('.bkp-band').evaluate(e => getComputedStyle(e).backgroundImage)));
  await p.locator('[data-field="booking.slug"]').first().fill(`bright-${run}`);
  await p.locator('.bks .bks-good').first().waitFor({ timeout: 8000 });
  /* The Scheduling screen publishes every change itself. */
  let cfgC = {};
  for (let i = 0; i < 20 && !(cfgC.points?.[0]?.icon === 'rocket' && cfgC.accent); i++) {
    await p.waitForTimeout(500);
    cfgC = (await api('booking.php', { action: 'config', slug: `bright-${run}` })).data.config ?? {};
  }
  ok('published: the point with its icon, the topic, the colour, the media', cfgC.points?.[0]?.icon === 'rocket' && cfgC.points?.[0]?.detail === 'From search and maps'
    && cfgC.tags?.[0] === 'Local SEO' && cfgC.discuss?.[0] === 'Your Google profile' && cfgC.accent === '#7c3aed' && /booking-media/.test(cfgC.logoUrl ?? '') && /booking-media/.test(cfgC.photoUrl ?? '')
    && cfgC.videoUrl === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', cfgC);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/editor-1280.png`, fullPage: true });
  await p.getByRole('group', { name: 'Preview width' }).getByRole('button', { name: 'Phone' }).click();
  await p.waitForTimeout(300);
  ok('the phone preview stacks the cards', await p.evaluate(() => {
    const [a, b] = [...document.querySelectorAll('.bks-preview .bkp-panel')].map(e => e.getBoundingClientRect());
    return !!a && !!b && b.top >= a.bottom - 1;
  }));
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('1280px · the editor does not overflow', over <= 0, `${over}px`);
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(400);
  const over390 = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('390px · the editor does not overflow', over390 <= 0, `${over390}px`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/editor-390.png`, fullPage: true });

  /* Opened again: not read again by itself. */
  await p.setViewportSize({ width: 1280, height: 950 });
  await p.reload({ waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Booking page' }).first().click();
  await p.locator('.bks').waitFor();
  await p.waitForTimeout(1500);
  ok('opened again, it does not read the site by itself again', await p.locator('[data-testid="booking-autofill"]').count() === 0);
  ok('the editor threw nothing', errs.length === 0, errs.join(' | '));
  await ctx.close();

  /* The public page, as the visitor gets it, both widths and both themes. */
  for (const [w, h, scheme] of [[1280, 900, 'light'], [390, 844, 'light'], [1280, 900, 'dark']]) {
    const v = await newContext({ timezoneId: 'Europe/London', locale: 'en-GB', viewport: { width: w, height: h }, colorScheme: scheme });
    const vp = await v.newPage();
    const verr = [];
    vp.on('pageerror', e => verr.push(String(e)));
    await vp.goto(`${BASE}/book/bright-${run}`, { waitUntil: 'networkidle' });
    await vp.locator('.bkp-day[data-on]').waitFor({ timeout: 10000 });
    const body = await vp.locator('body').innerText();
    ok(`${w}px ${scheme} · no platform name, trial offer or testimonial on the page`, !/Protected Central|free 7-day trial|7 days free|testimonial/i.test(body), body.slice(0, 300));
    ok(`${w}px ${scheme} · the point is drawn with its icon`, await vp.locator('.bkp-points li .bkp-point-icon svg').count() === 1);
    ok(`${w}px ${scheme} · the header says Select a Date & Time, with the zone picker in it`, await vp.locator('.bkp-pick-head #bkp-zone').count() === 1);
    ok(`${w}px ${scheme} · the first time is highlighted`, await vp.locator('.bkp-slot[data-first]').count() === 1);
    const o = await vp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`${w}px ${scheme} · no horizontal overflow`, o <= 0, `${o}px`);
    if (w === 1280 && scheme === 'light') {
      ok('1280px · the two cards sit side by side', await vp.evaluate(() => {
        const [a, b] = [...document.querySelectorAll('.bkp-panel')].map(e => e.getBoundingClientRect());
        return Math.abs(a.top - b.top) < 4 && b.left > a.right - 1;
      }));
    }
    if (SHOTS) await vp.screenshot({ path: `${SHOTS}/page-${w}-${scheme}.png`, fullPage: true });
    ok(`${w}px ${scheme} · nothing threw`, verr.length === 0, verr.join(' | '));
    await v.close();
  }
}

await browser.close();
site.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
