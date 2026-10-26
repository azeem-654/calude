/**
 * The strategy call and the industry microsites, end to end, on the real
 * Worker and a fresh D1.
 *
 *   VITE_BASE=/ npm run build
 *   npm run test:strategycalle2e
 *
 * Self-contained: migrates a fresh D1 into a temporary directory, runs
 * `wrangler dev` on :8871 (inspector :9371), drives the API and then the
 * screens at 1280 and 390, and stops what it started. No mailbox is connected,
 * so every email is honestly "not_configured" — which is itself checked.
 *
 * What it covers:
 *  - only the install owner can read or change the settings or the bookings,
 *    by direct API call as well as on screen;
 *  - the public page works with no account, refuses while switched off, and
 *    never shows the owner's private settings or notes;
 *  - fields are refused at their box; a double-submitted booking is stored
 *    once; five visitors racing for one slot get one booking; the daily limit
 *    and closed dates hold; the guest's link (and only it) moves or cancels;
 *  - the source site and campaign tags survive to the owner's list;
 *  - the four sites link to the booking page with their own source, and the
 *    three microsites never link home or to each other, with a working phone
 *    menu and no sideways scroll at 390.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const PORT = Number(process.env.PORT ?? 8871), INSPECT = Number(process.env.INSPECT_PORT ?? 9371);
const B = `http://localhost:${PORT}`;
let fail = 0, pass = 0;
const ok = (name, cond, detail = '') => { if (cond) pass++; else fail++; console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ` — ${String(detail).slice(0, 500)}`}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!fs.existsSync('dist/index.html')) { console.log('Build first: VITE_BASE=/ npm run build'); process.exit(2); }

const persist = process.env.PERSIST || fs.mkdtempSync(path.join(os.tmpdir(), 'strategy-d1-'));
const sql = q => JSON.parse(execSync(`npx wrangler d1 execute crmpro --local --persist-to ${persist} --json --command ${JSON.stringify(q)}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
const wr = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--inspector-port', String(INSPECT), '--persist-to', persist, '--var', `APP_ORIGIN:${B}`], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
let wlog = '';
wr.stdout.on('data', c => { wlog += c; }); wr.stderr.on('data', c => { wlog += c; });
let br = null;
const stop = () => { try { process.kill(-wr.pid, 'SIGTERM'); } catch { /* gone */ } };
process.on('exit', stop);
process.on('uncaughtException', async e => { console.log(e); console.log(wlog.slice(-3000)); stop(); process.exit(1); });
for (let i = 0; i < 90; i++) { try { const r = await fetch(`${B}/api/data.php`, { method: 'POST', headers: { Connection: 'close' }, body: '{"action":"ping"}' }); if (r.ok) break; } catch { /* starting */ } await sleep(1000); }

let ipN = 1;
const raw = (p, body, ip) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': ip ?? `10.7.1.${ipN++ % 250}` }, body: JSON.stringify(body) });
const apiS = (p, body, ip) => raw(p, body, ip).then(async r => ({ status: r.status, d: await r.json().catch(() => ({})) }));
const sc = (body, ip) => apiS('strategy-call.php', body, ip);

console.log('\nStrategy call — access');
const OWNER = 'owner@strategy.test', PW = 'Tq9!vX2#pLm7wZ-strat';
const boot = await apiS('auth.php', { action: 'bootstrap', email: OWNER, password: PW, name: 'Owner' });
if (!boot.d.success) { console.log('bootstrap failed', boot, wlog.slice(-2000)); stop(); process.exit(2); }
const T = (await apiS('auth.php', { action: 'login', email: OWNER, password: PW })).d.token;
const CUST = { email: 'cara@cust.test', password: 'Another-horse-7cara' };
const reg = await apiS('auth.php', { action: 'register', email: CUST.email, password: CUST.password, name: 'Cara' });
CUST.token = reg.d.token ?? (await apiS('auth.php', { action: 'login', ...CUST })).d.token;
ok('owner and a customer exist', !!(T && CUST.token));

let r = await sc({ action: 'settings_get', token: CUST.token });
ok('a customer is refused the settings by the server', r.status === 403 && r.d.code === 'not_owner', JSON.stringify(r));
r = await sc({ action: 'settings_save', token: CUST.token, settings: { enabled: true, timezone: 'UTC' } });
ok('…and cannot change them', r.status === 403 && !r.d.success, JSON.stringify(r));
r = await sc({ action: 'list', token: CUST.token });
ok('…or read the bookings', r.status === 403, JSON.stringify(r));
r = await sc({ action: 'settings_get' });
ok('nobody at all is refused', r.status === 401, JSON.stringify(r));
ok('no settings row was written by those attempts', sql("SELECT COUNT(*) AS n FROM crm_strategy_settings")[0].n === 0);

console.log('\nStrategy call — switched off, then set up');
r = await sc({ action: 'config' });
ok('the public page loads with no account, switched off by default', r.d.success && r.d.settings.enabled === false, JSON.stringify(r.d));
r = await sc({ action: 'slots', from: '2030-01-01', to: '2030-01-07' });
ok('switched off, it offers no times', r.d.closed === true, JSON.stringify(r.d));

const tz = 'America/New_York';
const W = [{ from: '09:00', to: '17:00' }];
const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
const addDays = (d, n) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const weekday = d => new Date(`${d}T12:00:00Z`).getUTCDay();
const weekdaysAhead = []; for (let i = 2; weekdaysAhead.length < 6; i++) { const d = addDays(today, i); if (weekday(d) > 0 && weekday(d) < 6) weekdaysAhead.push(d); }
const [D1, D2, D3, CLOSED] = weekdaysAhead;
const settings = {
  enabled: true, title: 'Strategy call', description: 'A talk about your business.', hostName: 'Azeem', hostRole: 'Founder',
  durations: [30, 45], defaultDuration: 30, timezone: tz,
  weekly: { sun: [], mon: W, tue: W, wed: W, thu: W, fri: W, sat: [] },
  minNoticeMin: 0, windowDays: 60, bufferBefore: 0, bufferAfter: 15, dailyLimit: 3,
  blackoutDates: [CLOSED], overrides: [],
  questions: [{ label: 'What would you like to get out of the call?', required: true, long: true }],
  meetingType: 'video_link', meetingDetails: '', confirmEmail: true, reminderHours: 24, notifyOnBook: true, notifyEmail: 'private-notices@strategy.test',
};
r = await sc({ action: 'settings_save', token: T, settings: { ...settings, timezone: 'Mars/Olympus' } });
ok('an unknown zone is refused at its box', !r.d.success && r.d.field === 'strategy.timezone', JSON.stringify(r.d));
r = await sc({ action: 'settings_save', token: T, settings });
ok('the owner saves the settings', r.d.success && r.d.settings.enabled === true, JSON.stringify(r.d));
r = await sc({ action: 'settings_get', token: T });
ok('the owner reads them back, with honest integration states', r.d.success && r.d.integrations.email.state === 'not_configured' && r.d.integrations.calendar.state === 'not_connected', JSON.stringify(r.d.integrations));
r = await sc({ action: 'config' });
ok('the public config carries no notice address or reminder setting', r.d.success && !JSON.stringify(r.d).includes('private-notices') && !('reminderHours' in r.d.settings), JSON.stringify(r.d));
ok('…and promises no confirmation email, because none can go', r.d.delivery.confirms === false);

r = await sc({ action: 'slots', from: D1, to: addDays(D1, 20), timezone: tz, duration: 30 });
ok('it offers times on open weekdays', r.d.success && (r.d.days[D1] ?? []).length > 0, JSON.stringify(r.d).slice(0, 300));
ok('a closed date offers nothing', !r.d.days[CLOSED], CLOSED);
ok('weekends offer nothing', Object.keys(r.d.days).every(d => weekday(d) > 0 && weekday(d) < 6));
const slotsD1 = r.d.days[D1];

console.log('\nStrategy call — booking');
const base = { action: 'create', duration: 30, timezone: 'Asia/Bangkok', name: 'Pat Prospect', email: 'pat@prospect.test', company: 'Pat HVAC', website: 'pat-hvac.test', industry: 'HVAC', answers: { q1: 'More estimates followed up.' }, source: { site: 'hvac', utm: { source: 'google', campaign: 'spring' }, clickIds: { gclid: 'g-123' }, referrer: 'https://www.google.com/search?q=x' } };
const at = (s) => ({ ownerDate: s.ownerDate, ownerTime: s.ownerTime });
const rid = n => `req-${n}-${Math.random().toString(36).slice(2)}-xxxxxxxx`;
r = await sc({ ...base, ...at(slotsD1[0]), requestId: rid(0), name: '' });
ok('no name is refused at its box', r.d.field === 'strategy.name', JSON.stringify(r.d));
r = await sc({ ...base, ...at(slotsD1[0]), requestId: rid(0), email: 'nope' });
ok('a bad email is refused at its box', r.d.field === 'strategy.email', JSON.stringify(r.d));
r = await sc({ ...base, ...at(slotsD1[0]), requestId: rid(0), company: '' });
ok('no business name is refused at its box', r.d.field === 'strategy.company', JSON.stringify(r.d));
r = await sc({ ...base, ...at(slotsD1[0]), requestId: rid(0), answers: {} });
ok('a required question left empty is refused at its box', r.d.field === 'strategy.answer.q1', JSON.stringify(r.d));
r = await sc({ ...base, ownerDate: D1, ownerTime: '09:07', requestId: rid(0) });
ok('a time the page never offered is refused', !r.d.success && /not offered/.test(r.d.error), JSON.stringify(r.d));

const R1 = rid(1);
const first = await sc({ ...base, ...at(slotsD1[0]), requestId: R1 });
ok('a visitor books with no account', first.d.success && /^sc_/.test(first.d.id) && first.d.key, JSON.stringify(first.d));
ok('the email is reported as not configured, never as sent', first.d.notify?.guest === 'not_configured' && first.d.notify?.owner === 'not_configured', JSON.stringify(first.d.notify));
const again = await sc({ ...base, ...at(slotsD1[0]), requestId: R1 });
ok('the same submit again finds the same booking', again.d.success && again.d.replayed && again.d.id === first.d.id && !again.d.key, JSON.stringify(again.d));
ok('…and only one row exists', sql(`SELECT COUNT(*) AS n FROM crm_strategy_calls WHERE email = 'pat@prospect.test'`)[0].n === 1);
r = await sc({ ...base, ...at(slotsD1[0]), requestId: rid(2), email: 'other@prospect.test' });
ok('a second visitor cannot take the same time', !r.d.success && /just booked/.test(r.d.error), JSON.stringify(r.d));
ok('the key is stored only as a hash', sql(`SELECT key_hash FROM crm_strategy_calls WHERE id = '${first.d.id}'`)[0].key_hash !== first.d.key);

/* Five visitors racing for one slot on another day. */
const race = (await sc({ action: 'slots', from: D2, to: D2, timezone: tz, duration: 30 })).d.days[D2][0];
const results = await Promise.all([1, 2, 3, 4, 5].map(n => sc({ ...base, ...at(race), requestId: rid(`race${n}`), email: `racer${n}@prospect.test` }, `10.8.0.${n}`)));
ok('five racing for one slot: exactly one wins', results.filter(x => x.d.success).length === 1, JSON.stringify(results.map(x => x.d.error ?? x.d.id)));
ok('…and the database holds one booking at that instant', sql(`SELECT COUNT(*) AS n FROM crm_strategy_calls WHERE slot_date = '${D2}' AND slot_time = '${race.ownerTime}' AND status = 'confirmed'`)[0].n === 1);

/* The daily limit (3) on D3. */
const d3 = (await sc({ action: 'slots', from: D3, to: D3, timezone: tz, duration: 30 })).d.days[D3];
for (let i = 0; i < 3; i++) await sc({ ...base, ...at(d3[i * 3]), requestId: rid(`d3-${i}`), email: `limit${i}@prospect.test` }, `10.8.1.${i}`);
r = await sc({ action: 'slots', from: D3, to: D3, timezone: tz, duration: 30 });
ok('once the daily limit is reached, the day offers nothing', !r.d.days[D3], JSON.stringify(r.d.days));
r = await sc({ ...base, ...at(d3[1]), requestId: rid('d3-x'), email: 'late@prospect.test' }, '10.8.1.9');
ok('…and a booking that day is refused', !r.d.success, JSON.stringify(r.d));

/* The buffer after: 30 minutes + 15 means the next slot is 45 minutes on. */
ok('the buffer after spaces the grid', slotsD1.length > 1 && (Date.parse(`2000-01-01T${slotsD1[1].ownerTime}:00Z`) - Date.parse(`2000-01-01T${slotsD1[0].ownerTime}:00Z`)) === 45 * 60000, JSON.stringify(slotsD1.slice(0, 3)));

console.log('\nStrategy call — the guest\'s link and the owner\'s list');
r = await sc({ action: 'manage_get', id: first.d.id, key: 'wrong-key' });
ok('a wrong key shows nothing', !r.d.success && !r.d.booking, JSON.stringify(r.d));
r = await sc({ action: 'manage_get', id: first.d.id.replace(/.$/, 'x'), key: first.d.key });
ok('a guessed id shows nothing', !r.d.success, JSON.stringify(r.d));
await sc({ action: 'note', token: T, id: first.d.id, note: 'PRIVATE: warm lead, call Tuesday' });
r = await sc({ action: 'note', token: CUST.token, id: first.d.id, note: 'hijack' });
ok('a customer cannot write the owner\'s note', r.status === 403);
r = await sc({ action: 'cancel', token: CUST.token, id: first.d.id });
ok('…or cancel a booking by id', r.status === 403);
r = await sc({ action: 'manage_get', id: first.d.id, key: first.d.key });
ok('the guest\'s link shows their booking', r.d.success && r.d.booking.status === 'confirmed' && r.d.booking.visitorTimezone === 'Asia/Bangkok', JSON.stringify(r.d));
ok('…without the owner\'s note or the source', !JSON.stringify(r.d).includes('PRIVATE') && !JSON.stringify(r.d).includes('spring') && !JSON.stringify(r.d).includes('g-123'));
r = await sc({ action: 'list', token: T, view: 'upcoming' });
const mine = (r.d.bookings ?? []).find(b => b.id === first.d.id);
ok('the owner sees the booking with its source, campaign and click id', mine?.sourceSite === 'hvac' && mine.source.utm.campaign === 'spring' && mine.source.clickIds.gclid === 'g-123' && mine.note.startsWith('PRIVATE'), JSON.stringify(mine));
ok('…and the answers with the question asked', mine?.answers.q1 === 'More estimates followed up.' && /get out of the call/.test(mine.answers._asked.q1));
ok('…and the website tidied', mine?.website === 'https://pat-hvac.test', mine?.website);

const target = slotsD1[2];
r = await sc({ action: 'manage_reschedule', id: first.d.id, key: first.d.key, ...at(target) });
ok('the guest moves their call', r.d.success && r.d.booking.ownerTime === target.ownerTime, JSON.stringify(r.d));
r = await sc({ action: 'slots', from: D1, to: D1, timezone: tz, duration: 30 });
ok('…the old time is free again and the new one taken', r.d.days[D1].some(s => s.ownerTime === slotsD1[0].ownerTime) && !r.d.days[D1].some(s => s.ownerTime === target.ownerTime));
r = await sc({ action: 'manage_cancel', id: first.d.id, key: 'nope' });
ok('cancelling needs the key', !r.d.success);
r = await sc({ action: 'manage_cancel', id: first.d.id, key: first.d.key });
ok('the guest cancels', r.d.success, JSON.stringify(r.d));
r = await sc({ action: 'list', token: T, view: 'cancelled' });
const gone = (r.d.bookings ?? []).find(b => b.id === first.d.id);
ok('the owner sees it cancelled, with the history', gone?.status === 'cancelled' && gone.history.map(h => h.what).join() === 'booked,rescheduled,cancelled', JSON.stringify(gone?.history));
r = await sc({ action: 'manage_reschedule', id: first.d.id, key: first.d.key, ...at(slotsD1[0]) });
ok('a cancelled call cannot be moved back', !r.d.success, JSON.stringify(r.d));

/* The owner's own actions. */
const winner = results.find(x => x.d.success).d;
r = await sc({ action: 'set_status', token: T, id: winner.id, status: 'completed' });
ok('the owner marks a call held', r.d.success);
r = await sc({ action: 'set_status', token: T, id: winner.id, status: 'deleted' });
ok('…and cannot invent a status', !r.d.success);

console.log('\nThe four sites and the booking page, in a browser');
br = await pw.chromium.launch();
const errs = [];
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
fs.mkdirSync('test-results', { recursive: true });
const MICRO = ['hvac', 'roofing', 'medical-billing'];

for (const width of [1280, 390]) {
  const ctx = await br.newContext({ viewport: { width, height: 860 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`@${width} ${page.url()}: ${e}`));

  await page.goto(`${B}/`, { waitUntil: 'networkidle' });
  const pricing = page.locator('#pricing');
  await pricing.scrollIntoViewIfNeeded();
  const pt = await pricing.innerText();
  ok(`home @${width}: pricing leads with the approved heading and line`, /Turn More Leads Into Paying Customers/i.test(pt) && /pricing aligned to measurable results/.test(pt) && (await page.getByTestId('growth-line').innerText()) === '$300 setup + $87/month + 5% performance fee', pt.slice(0, 300));
  ok(`home @${width}: setup, monthly and performance fees are labelled apart`, /One-time setup fee/i.test(pt) && /Recurring platform and agreed service fee/i.test(pt) && /Performance fee on eligible revenue collected/i.test(pt));
  ok(`home @${width}: the cost and fee disclosures and the $6,000 example`, /advertising budget/.test(pt) && /third-party expenses/.test(pt) && /unaccepted quotations/.test(pt) && /\$6,000 in eligible collected revenue.*is \$300/.test(pt));
  const homeMain = await page.locator('body').innerText();
  ok(`home @${width}: no $49, $97 or $197 software-plan cards`, !/\$49\b|\$97\b|\$197\b/.test(homeMain), (homeMain.match(/.{30}\$(49|97|197)\b.{20}/) ?? [''])[0]);
  const st = await page.locator('#services').innerText();
  ok(`home @${width}: medical billing is by assessment`, /By assessment/.test(st) && /does not apply/.test(st));
  ok(`home @${width}: links to all three microsites`, await page.locator('a[href="/hvac"]').count() > 0 && await page.locator('a[href="/roofing"]').count() > 0 && await page.locator('a[href="/medical-billing"]').count() > 0);
  await page.waitForSelector('[data-testid="home-book"][data-booking="open"]', { timeout: 10_000 });
  ok(`home @${width}: bookings open — the button books, carrying src=main`, /\/book\/strategy-call\?src=main/.test(await page.getByTestId('home-book').getAttribute('href')));
  await page.getByTestId('home-write').click();
  ok(`home @${width}: "Prefer to write?" opens the inquiry form`, await page.getByTestId('home-enquire').isVisible());
  const homeBlock = { line: await page.getByTestId('growth-line').innerText(), cost: await page.getByTestId('cost-disclosure').innerText(), fee: await page.getByTestId('fee-disclosure').innerText(), figs: await page.getByTestId('growth-figures').innerText() };
  ok(`home @${width}: no sideways scroll`, (await overflow(page)) <= 0, String(await overflow(page)));
  await pricing.screenshot({ path: `test-results/home-pricing-${width}.png` });

  for (const id of MICRO) {
    await page.goto(`${B}/${id}?utm_source=newsletter&utm_campaign=autumn`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const hrefs = await page.$$eval('header a, footer a, .ms-menu a', as => as.map(a => a.getAttribute('href') ?? ''));
    const leaks = hrefs.filter(h => h === '/' || MICRO.some(m => m !== id && (h === `/${m}` || h.startsWith(`/${m}#`))) || /^\/#/.test(h) || h === '/pricing');
    ok(`${id} @${width}: no link home or to another industry`, leaks.length === 0, leaks.join());
    ok(`${id} @${width}: the logo stays on the microsite`, (await page.getByTestId('ms-logo').getAttribute('href')) === `/${id}`);
    const book = await page.getByTestId('hero-book').getAttribute('href');
    ok(`${id} @${width}: booking carries the site and the campaign`, book.includes(`src=${id}`) && book.includes('utm_campaign=autumn'), book);
    const body = await page.locator('main').innerText();
    if (id === 'medical-billing') {
      ok(`${id} @${width}: no price, no percentage`, !/\$\s?\d/.test(body) && !/\d\s?%/.test(body), (body.match(/.{30}(\$\s?\d|\d\s?%).{20}/) ?? [''])[0]);
      ok(`${id} @${width}: says it is priced after an assessment`, /after an assessment/.test(body));
    } else {
      ok(`${id} @${width}: the growth offer is shown`, /\$300/.test(body) && /\$87/.test(body) && /5%/.test(body));
      const block = { line: await page.getByTestId('growth-line').innerText(), cost: await page.getByTestId('cost-disclosure').innerText(), fee: await page.getByTestId('fee-disclosure').innerText(), figs: await page.getByTestId('growth-figures').innerText() };
      ok(`${id} @${width}: price, figures and disclosures match the home page word for word`, JSON.stringify(block) === JSON.stringify(homeBlock), JSON.stringify(block).slice(0, 300));
      ok(`${id} @${width}: no $49, $97 or $197 plan`, !/\$49\b|\$97\b|\$197\b/.test(body));
      ok(`${id} @${width}: no $45 or $2,200 offer`, !/\$45\b|\$2,200/.test(body));
    }
    ok(`${id} @${width}: no sideways scroll`, (await overflow(page)) <= 0, String(await overflow(page)));
    if (width === 390) {
      const btn = page.getByRole('button', { name: 'Open menu' });
      ok(`${id} @390: the phone menu button is shown`, await btn.isVisible());
      await btn.click();
      const menu = page.locator('#ms-menu');
      ok(`${id} @390: the menu opens with the site's own sections`, await menu.isVisible() && /Home/.test(await menu.innerText()) && /Pricing/.test(await menu.innerText()));
      await menu.getByRole('link', { name: 'Pricing' }).click();
      await page.waitForTimeout(500);
      ok(`${id} @390: a menu link closes the menu and goes to its section`, !(await menu.isVisible()) && page.url().endsWith('#pricing'));
    }
    await page.screenshot({ path: `test-results/microsite-${id}-${width}.png` });
  }
  const hvacText = await (async () => { await page.goto(`${B}/hvac`, { waitUntil: 'networkidle' }); return page.locator('main').innerText(); })();
  const roofText = await (async () => { await page.goto(`${B}/roofing`, { waitUntil: 'networkidle' }); return page.locator('main').innerText(); })();
  const medText = await (async () => { await page.goto(`${B}/medical-billing`, { waitUntil: 'networkidle' }); return page.locator('main').innerText(); })();
  ok(`@${width}: the three microsites say different things`, hvacText.slice(0, 400) !== roofText.slice(0, 400) && !/Revenue-leakage/.test(hvacText) && /Revenue-leakage/i.test(medText) && !/estimate/i.test(medText.slice(0, 600)));

  /* The booking page from the roofing site: back stays on roofing; book through the screen. */
  await page.goto(`${B}/book/strategy-call?src=roofing&utm_campaign=storm`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="slot"]', { timeout: 15_000 });
  ok(`booking @${width}: back and the logo lead to the roofing site`, (await page.getByTestId('sc-back').getAttribute('href')) === '/roofing' && (await page.getByTestId('sc-logo').getAttribute('href')) === '/roofing');
  ok(`booking @${width}: the time zone is labelled`, /Times shown in/.test(await page.locator('.sc-about').innerText()));
  await page.getByTestId('slot').first().click();
  await page.getByTestId('sc-confirm').click();
  await page.waitForTimeout(800);
  ok(`booking @${width}: an empty form is refused at the name box`, await page.locator('[data-field="strategy.name"].sc-bad').count() === 1, await page.locator('.sc-error').innerText().catch(() => ''));
  ok(`booking @${width}: the refused box is on screen — no dead end (test:forms contract)`, (await page.evaluate(() => (window.__deadEnds ?? []).length)) === 0, JSON.stringify(await page.evaluate(() => window.__deadEnds ?? [])));
  await page.locator('[data-field="strategy.name"]').fill(`Browser ${width}`);
  await page.locator('[data-field="strategy.email"]').fill(`browser${width}@prospect.test`);
  await page.locator('[data-field="strategy.company"]').fill('Roof Co');
  await page.locator('[data-field="strategy.answer.q1"]').fill('Follow up estimates after storms.');
  ok(`booking @${width}: the summary names the time and zone`, /minutes/.test(await page.getByTestId('sc-summary').innerText()));
  await page.getByTestId('sc-confirm').click();
  await page.waitForSelector('[data-testid="sc-done"]', { timeout: 15_000 });
  const done = await page.getByTestId('sc-done').innerText();
  ok(`booking @${width}: confirmed only once stored, with no false email promise`, /You’re booked/.test(done) && /could not send a confirmation/i.test(done) && !/on its way/.test(done), done);
  ok(`booking @${width}: no sideways scroll`, (await overflow(page)) <= 0, String(await overflow(page)));
  await page.screenshot({ path: `test-results/strategy-booked-${width}.png` });
  const row = sql(`SELECT source_site, source FROM crm_strategy_calls WHERE email = 'browser${width}@prospect.test'`)[0];
  ok(`booking @${width}: stored with the roofing source and its campaign`, row?.source_site === 'roofing' && JSON.parse(row.source).utm.campaign === 'storm', JSON.stringify(row));

  /* The manage link from the confirmation. */
  const manage = await page.getByTestId('sc-manage-link').getAttribute('href');
  await page.goto(`${B}${manage.replace(/^https?:\/\/[^/]+/, '')}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="sc-manage"]');
  page.once('dialog', d => d.accept());
  await page.getByTestId('sc-cancel').click();
  await page.waitForTimeout(1000);
  ok(`booking @${width}: the guest cancels from their link`, /Cancelled/.test(await page.getByTestId('sc-status').innerText()));
  await ctx.close();
}

/* Bookings closed: no button promises a booking; each leads to a working inquiry form. */
r = await sc({ action: 'settings_save', token: T, settings: { ...settings, enabled: false } });
ok('the owner closes bookings', r.d.success && r.d.settings.enabled === false, JSON.stringify(r.d));
for (const width of [1280, 390]) {
  const ctx = await br.newContext({ viewport: { width, height: 860 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`closed @${width} ${page.url()}: ${e}`));
  await page.goto(`${B}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="home-book"][data-booking="closed"]', { timeout: 10_000 });
  ok(`closed home @${width}: the button no longer says "Book"`, !/Book/.test(await page.getByTestId('home-book').innerText()));
  ok(`closed home @${width}: the inquiry form is already open and says why`, await page.getByTestId('home-enquire').isVisible() && /not being booked/.test(await page.locator('#pricing').innerText()));
  const form = page.getByTestId('home-enquire');
  await form.locator('[data-field="enquiry.name"]').fill(`Closed ${width}`);
  await form.locator('[data-field="enquiry.email"]').fill(`closed${width}@prospect.test`);
  await form.locator('[data-field="enquiry.message"]').fill('We run four HVAC vans and want more maintenance contracts.');
  await form.getByRole('button', { name: /Send to the team/ }).click();
  await page.waitForSelector('[data-enquiry-sent]', { timeout: 15_000 });
  ok(`closed home @${width}: the inquiry is sent and stored`, sql(`SELECT COUNT(*) AS n FROM crm_enquiries WHERE email = 'closed${width}@prospect.test'`)[0].n === 1);
  ok(`closed home @${width}: no sideways scroll`, (await overflow(page)) <= 0, String(await overflow(page)));
  await page.screenshot({ path: `test-results/home-closed-${width}.png` });
  for (const id of MICRO) {
    await page.goto(`${B}/${id}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="hero-book"][data-booking="closed"]', { timeout: 10_000 });
    const want = id === 'medical-billing' ? '#request' : '#talk';
    const hrefs = await page.$$eval('a', as => as.map(a => a.getAttribute('href') ?? ''));
    ok(`closed ${id} @${width}: buttons go to the page's own form, none to the booking page`, (await page.getByTestId('hero-book').getAttribute('href')) === want && !hrefs.some(h => h.includes('/book/strategy-call')) && await page.locator(want).count() === 1, hrefs.filter(h => h.includes('strategy')).join());
  }
  await page.goto(`${B}/book/strategy-call?src=main`, { waitUntil: 'networkidle' });
  ok(`closed booking page @${width}: "write to us" leads to the home page's form`, (await page.locator('[data-testid="sc-closed"] a').getAttribute('href')) === '/#enquire');
  await ctx.close();
}
r = await sc({ action: 'settings_save', token: T, settings });
ok('…and opens them again', r.d.success && r.d.settings.enabled === true);

/* The owner's screen, and the customer's absence of it. */
const signIn = async (email, password, width) => {
  const ctx = await br.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`${email}@${width}: ${e}`));
  await page.goto(`${B}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email or username').fill(email, { timeout: 10_000 });
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(2500);
  return { ctx, page };
};
for (const width of [1280, 390]) {
  const { ctx, page } = await signIn(OWNER, PW, width);
  await page.goto(`${B}/settings?tab=platform`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="strategy-settings"]', { timeout: 15_000 });
  const panel = await page.getByTestId('strategy-settings').innerText();
  ok(`owner @${width}: Strategy Call Booking is under Platform services`, /Strategy Call Booking/.test(panel) && /book\/strategy-call/.test(panel));
  ok(`owner @${width}: it says email is not set up and no calendar is connected`, /no validated system mailbox/.test(panel) && /Calendar:\s*not connected/.test(panel), panel.slice(0, 600));
  await page.waitForSelector('[data-booking]', { timeout: 10_000 });
  ok(`owner @${width}: upcoming calls are listed`, await page.locator('[data-booking]').count() > 0);
  ok(`owner @${width}: the services list has the booking row`, /Strategy Call Booking/.test(await page.getByTestId('platform-services').innerText()));
  ok(`owner @${width}: no sideways scroll`, (await overflow(page)) <= 0, String(await overflow(page)));
  /* A refusal names its box, and the box is on screen (the test:forms contract). */
  await page.locator('[data-field="strategy.notifyEmail"]').fill('not-an-address');
  await page.getByTestId('strategy-save').click();
  await page.waitForTimeout(800);
  ok(`owner @${width}: a bad notice address is refused, named, with no dead end`, /not an email address/.test(await page.getByTestId('strategy-settings').innerText()) && (await page.evaluate(() => (window.__deadEnds ?? []).length)) === 0, JSON.stringify(await page.evaluate(() => window.__deadEnds ?? [])));
  await page.screenshot({ path: `test-results/strategy-owner-${width}.png` });
  await ctx.close();
}
{
  const { ctx, page } = await signIn(CUST.email, CUST.password, 1280);
  await page.goto(`${B}/settings?tab=platform`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  ok('customer: no strategy call settings on screen', await page.getByTestId('strategy-settings').count() === 0);
  await ctx.close();
}

ok('no page errors anywhere', errs.length === 0, errs.join('\n'));
await br.close();
stop();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
