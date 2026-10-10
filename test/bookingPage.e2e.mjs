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
 *   VITE_BASE=/ npm run build
 *   npx wrangler d1 migrations apply crmpro --local --persist-to <dir>
 *   npx wrangler dev --local --port 8971 --persist-to <dir>
 *   BASE=http://127.0.0.1:8971 PERSIST=<dir> npm run test:bookingpage
 */
import { execSync } from 'node:child_process';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';
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
  bullets: ['A plan for the next 90 days', '  ', 'Answers about pricing'], duration: 30, location: 'Video call', timezone: 'America/New_York', weekly,
  bufferBefore: 0, bufferAfter: 0, dailyLimit: 20, minNoticeMin: 0, windowDays: 60, photoUrl: photo.data.url, logoUrl: logo.data.url,
  videoFileUrl: vid.data.url ?? '', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', imageUrl: 'javascript:alert(1)',
} });
ok('A publishes the page', publishA.ok, publishA.data);
const cfgA = (await api('booking.php', { action: 'config', slug: slugA })).data.config ?? {};
ok('the page keeps its own uploads and drops blank points', cfgA.photoUrl === photo.data.url && cfgA.logoUrl === logo.data.url && cfgA.bullets?.length === 2, cfgA);
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
async function firstSlots(timezoneId) {
  const ctx = await browser.newContext({ timezoneId, locale: 'en-US', viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/book/${slugA}`, { waitUntil: 'networkidle' });
  await p.locator('.bkp-day[data-on]').waitFor({ timeout: 10000 });
  const day = await p.locator('.bkp-day[data-on]').innerText();
  const times = await p.locator('.bkp-times .bkp-slot').allInnerTexts();
  await ctx.close();
  return { day, times };
}
const nyView = await firstSlots('America/New_York');
const bkkView = await firstSlots('Asia/Bangkok');
const mondayDay = String(Number(monday.slice(8, 10)));
ok('New York sees Monday 9:00 am first', nyView.day === mondayDay && nyView.times[0] === '9:00 am', nyView);
const toMin = t => { const m = /^(\d+):(\d\d) (am|pm)$/.exec(t); return m ? ((Number(m[1]) % 12) + (m[3] === 'pm' ? 12 : 0)) * 60 + Number(m[2]) : NaN; };
/* New York is UTC−4 until 1 November, UTC−5 after: Bangkok (UTC+7) is 11 or 12 hours ahead. */
const gap = ((toMin(bkkView.times[0]) - toMin(nyView.times[0])) / 60 + 24) % 24;
const expectGap = 7 - (new Date(`${monday}T12:00:00Z`).toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).includes('EDT') ? -4 : -5);
ok(`Bangkok's first time is ${expectGap} hours after New York's (${bkkView.times[0]} vs ${nyView.times[0]})`, gap === expectGap, { ny: nyView.times.slice(0, 3), bkk: bkkView.times.slice(0, 3) });
ok('Bangkok sees the evening part of Monday (8 pm or 9 pm first)', /^(8|9):00 pm$/.test(bkkView.times[0]), bkkView.times);

/* Book it from Bangkok, at both widths, checking the page as it goes. */
for (const [w, h] of [[390, 844], [1280, 900]]) {
  const ctx = await browser.newContext({ timezoneId: 'Asia/Bangkok', locale: 'en-US', viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${BASE}/book/${slugA}`, { waitUntil: 'networkidle' });
  await p.locator('.bkp-day[data-on]').waitFor({ timeout: 10000 });
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`${w}px · no horizontal overflow on the calendar`, over <= 0, `${over}px`);
  const info = await p.locator('.bkp-info').innerText();
  ok(`${w}px · the left side says who, what, the points and the zone`, /Dr Amira Lee/.test(info) && /Strategy call/.test(info) && /90 days/.test(info) && /Bangkok time \(GMT\+7\)/.test(info), info);
  ok(`${w}px · the photo and logo are on the page`, await p.locator('.bkp-avatar[src*="booking-media"]').count() === 1 && await p.locator('.bkp-logo').count() === 1);
  ok(`${w}px · the zone picker starts on the visitor's zone`, (await p.locator('#bkp-zone').inputValue()) === 'Asia/Bangkok');
  if (w === 1280) {
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
  const ctx = await browser.newContext({ timezoneId: 'America/New_York', locale: 'en-US', viewport: { width: 1280, height: 950 } });
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
  await p.locator('.bks-preview iframe[src*="player.vimeo.com"]').waitFor({ timeout: 5000 });
  ok('a Vimeo link plays in the preview', true);
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

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
