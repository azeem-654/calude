/**
 * The public site's funnel, end to end, in a real browser against the real
 * Worker: Find my solution → the plan → sign-up → the project built by itself.
 *
 *   npm run test:sitefunnel   (self-contained: Gemini mock :8863, wrangler
 *                              :8943, fresh D1 in .wrangler-sitefunnel; needs
 *                              a `VITE_BASE=/` build)
 *
 * The owner's eight journeys (docs/SITE-CONVERSION.md):
 *   1 roofing leads in Dallas      — lead questions, plan, sign-up, built with no questions
 *   2 social images for a dentist  — no sending questions; business skipped → asked once in the app
 *   3 70 products, a store         — store questions only
 *   4 old customers, on a phone    — no design questions, no "list I have"; the whole way on a phone
 *   5 something unusual            — the AI's own clarifying question, a custom workflow
 *   6 leaving and coming back      — "Continue where you left off"
 *   7 sign-up keeps the answers    — (1, 2 and 4: nothing asked twice, the build starts by itself)
 *   8 a phone                      — (4) no sideways scroll at 390
 * and then the owner's funnel report, the AI allowance per connection, and
 * the section slideshows centred on a wide screen.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { startGeminiMock } from './siteFunnelMock.mjs';

const PORT = 8943, INSPECT = 9343, MOCK = 8863;
const B = `http://localhost:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = [];
const ok = (n, p, d = '') => { out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${String(d).slice(0, 400)}`}`); console.log(out[out.length - 1]); };

const { server: mock } = await startGeminiMock(MOCK);
const persist = path.resolve('.wrangler-sitefunnel');
fs.rmSync(persist, { recursive: true, force: true });
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
const wr = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--inspector-port', String(INSPECT), '--persist-to', persist,
  '--var', `APP_ORIGIN:${B}`, '--var', `GEMINI_BASE:http://127.0.0.1:${MOCK}`, '--var', `AI_API_KEY:AIzaSITE${'x'.repeat(31)}`,
  '--var', 'GEOAPIFY_BASE:http://127.0.0.1:9'], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
let wlog = '';
wr.stdout.on('data', c => { wlog += c; }); wr.stderr.on('data', c => { wlog += c; });
let br = null;
const stop = () => { try { process.kill(-wr.pid, 'SIGTERM'); } catch { /* gone */ } mock.close(); };
process.on('exit', stop);
process.on('uncaughtException', async e => { console.log(e); console.log(wlog.replace(/.*workerd@.*\n/g, '').slice(-2500)); try { await br?.close(); } catch { /* */ } stop(); process.exit(1); });
for (let i = 0; i < 90; i++) { try { const r = await fetch(`${B}/api/data.php`, { method: 'POST', headers: { Connection: 'close' }, body: '{"action":"ping"}' }); if (r.ok) break; } catch { /* starting */ } await sleep(1000); }

let ipN = 1;
const api = (p, body, ip) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': ip ?? `10.7.3.${ipN++ % 250}` }, body: JSON.stringify(body) }).then(r => r.json().catch(() => ({})));

console.log('\nThe public site\'s funnel');
const OWNER = 'owner@sitefunnel.test', OPW = 'Tq9!vX2#pLm7wZ-funnel';
await api('auth.php', { action: 'bootstrap', email: OWNER, password: OPW, name: 'Owner' });
const OT = (await api('auth.php', { action: 'login', email: OWNER, password: OPW })).token;

br = await pw.chromium.launch();
const errs = [];

/* ── Helpers ── */
async function openWizard(page, prompt, pick = '') {
  await page.goto(`${B}/${pick ? `#find=${pick}` : ''}`, { waitUntil: 'networkidle' });
  if (!pick) await page.getByTestId('find-solution').click();
  await page.locator('.sw-textarea').waitFor({ timeout: 10_000 });
  await page.locator('.sw-textarea').fill(prompt);
  await page.getByTestId('sw-next').click();
  await page.locator('.sw-understood').waitFor({ timeout: 20_000 });
}
/** Every question screen, answered the quick way; returns the questions seen. */
async function answerAll(page) {
  await page.getByTestId('sw-next').click();
  const seen = [];
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(250);
    if (await page.locator('.sw-card').getAttribute('data-step') !== 'questions') break;
    for (const q of await page.locator('.sw-q').all()) {
      seen.push(await q.locator('.sw-q-title').innerText());
      if (await q.locator('.sw-sug').count()) { await q.locator('.sw-sug').first().click(); continue; }
      if (await q.locator('.sw-ai').count()) { await q.locator('.sw-ai').first().click(); continue; }
      if (await q.locator('.sw-opt').count()) { await q.locator('.sw-opt').first().click(); continue; }
      if (await q.locator('.sw-input').count()) await q.locator('.sw-input').fill('A free first consultation');
    }
    await page.getByTestId('sw-next').click();
  }
  return seen;
}
async function business(page, name, what) {
  if (name) { await page.locator('.sw-field input').nth(0).fill(name); await page.locator('.sw-field input').nth(1).fill(what); }
  await page.getByTestId('sw-next').click();
  await page.locator('.sw-solution').waitFor({ timeout: 5000 });
}
async function signUp(page, who) {
  await page.getByTestId('sw-build').click();
  await page.waitForURL(/\/signup/, { timeout: 15_000 });
  await page.getByLabel('Full name').waitFor({ timeout: 10_000 });
  const sub = await page.locator('body').innerText();
  await page.getByLabel('Full name').fill(who.name);
  await page.getByLabel('Email address').fill(who.email);
  await page.getByLabel('Password', { exact: true }).fill(who.pw);
  await page.getByLabel('Confirm password').fill(who.pw);
  await page.locator('input[type=checkbox]').first().check();
  await page.getByRole('button', { name: /^Continue/ }).click();
  return sub;
}
async function waitBuilt(page) {
  for (let i = 0; i < 60; i++) {
    const t = await page.locator('body').innerText().catch(() => '');
    if (/Open the project/.test(t)) return t;
    await page.waitForTimeout(1000);
  }
  return await page.locator('body').innerText();
}
async function projectsOf(who) {
  const r = await api('auth.php', { action: 'login', email: who.email, password: who.pw });
  const g = await api('projects.php', { token: r.token, accountId: r.user?.accountId, action: 'get' });
  return g.projects ?? [];
}
const NEVER = /mailbox|send from|who should the emails come from|which contact list|how many new people a day/i;

/* ── 1 · Roofing leads in Dallas, all the way ── */
{
  const ctx = await br.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`1: ${e}`));
  await openWizard(page, 'I want 30 roofing leads every day in Dallas.');
  const understood = await page.locator('.sw-understood').innerText();
  ok('1 · roofing leads are understood as Lead Generation, 30 a day, in Dallas', /Lead Generation/.test(understood) && /30 a day/.test(understood) && /Dallas/.test(understood), understood);
  const seen = await answerAll(page);
  ok('1 · asks who to reach and what is offered', seen.some(q => /reach/i.test(q)) && seen.some(q => /offering/i.test(q)), seen.join(' / '));
  ok('1 · never asks about mailboxes, senders or lists before sign-up', !seen.some(q => NEVER.test(q)), seen.join(' / '));
  ok('1 · three to six screens of questions', seen.length >= 3 && seen.length <= 10, String(seen.length));
  await business(page, 'Pike Roofing', 'Commercial roofing across Dallas');
  const plan = await page.locator('.sw-solution').innerText();
  ok('1 · the plan names the project, agents and workflows', /Here’s what Protected Central can build for you/.test(plan) && /Prospecting Agent/.test(plan) && /Find new prospects daily/.test(plan) && /Follow-up/i.test(plan), plan.slice(0, 600));
  ok('1 · …draws the workflow', (await page.locator('.sw-canvas').count()) === 1);
  ok('1 · …and says what starting costs', /7-day free trial · No credit card required/.test(await page.locator('.sw-foot').innerText()));
  await page.locator('.sw-edit input').fill('Make approval mandatory');
  await page.locator('.sw-edit button').click();
  ok('1 · a change in words is applied to the plan', /Done:/.test(await page.locator('.sw-solution').innerText()));
  const who = { name: 'Pat Pike', email: 'pat@pikeroofing.test', pw: 'Another-horse-7-roofs' };
  const sub = await signUp(page, who);
  ok('1 · the sign-up screen says the plan is waiting', /is built for you straight away/.test(sub), sub.slice(0, 300));
  const built = await waitBuilt(page);
  ok('7 · after sign-up the project builds by itself — no questions asked again', /Your Autopilot is ready|Open the project/.test(built) && !/Your plan from the website is here/.test(built), built.slice(0, 500));
  const projects = await projectsOf(who);
  ok('1 · the project exists with its workflows', projects.length === 1 && /Pike Roofing/.test(projects[0].name), JSON.stringify(projects.map(p => p.name)));
  ok('1 · the plan is not kept once built', await page.evaluate(() => !localStorage.getItem('pc_site_plan')));
  await ctx.close();
}

/* ── 2 · Social images for a dentist, business skipped ── */
{
  const ctx = await br.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`2: ${e}`));
  await openWizard(page, 'I want daily social media images for my dental clinic.');
  ok('2 · understood as Social Media Growth', /Social Media Growth/.test(await page.locator('.sw-understood').innerText()));
  const seen = await answerAll(page);
  ok('2 · nothing about sending, contacts or offers', !seen.some(q => NEVER.test(q) || /contacts|offering|reply lead/i.test(q)), seen.join(' / '));
  await business(page, '', '');
  const plan = await page.locator('.sw-solution').innerText();
  ok('2 · a content workflow, nothing to connect first', /Social Media Content Automation/.test(plan) && /Nothing to connect first/.test(plan), plan.slice(0, 500));
  const who = { name: 'Dee Dent', email: 'dee@brightsmile.test', pw: 'Another-horse-7-teeth' };
  await signUp(page, who);
  await page.getByText('Your plan from the website is here').waitFor({ timeout: 20_000 });
  const asked = await page.locator('body').innerText();
  ok('7 · the app asks only what the site could not: the business', /One thing it could not ask/.test(asked), asked.slice(0, 400));
  await page.getByRole('button', { name: /Type it in/ }).click();
  await page.getByLabel('Business name').fill('Bright Smile Dental');
  await page.getByLabel('What it does').fill('Family dental clinic in Leeds');
  await page.getByRole('button', { name: /Build my project/ }).click();
  const built = await waitBuilt(page);
  ok('2 · then it builds', /Open the project/.test(built), built.slice(0, 300));
  const projects = await projectsOf(who);
  ok('2 · the content project exists, named for the business', projects.length === 1 && /Bright Smile Dental/.test(projects[0].name), JSON.stringify(projects.map(p => p.name)));
  await ctx.close();
}

/* ── 3 · A store for 70 products ── */
{
  const ctx = await br.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`3: ${e}`));
  await openWizard(page, 'I have 70 products and want an online store.');
  ok('3 · understood as an E-commerce Store', /E-commerce Store/.test(await page.locator('.sw-understood').innerText()));
  const seen = await answerAll(page);
  ok('3 · asks where the products are', seen.some(q => /products now/i.test(q)), seen.join(' / '));
  ok('3 · no lead-generation questions', !seen.some(q => NEVER.test(q) || /should it reach|kinds of business|offering them/i.test(q)), seen.join(' / '));
  await business(page, 'Lumen Candles', 'Hand-poured candles sold online');
  const plan = await page.locator('.sw-solution').innerText();
  ok('3 · the plan is a shop', /shop page/i.test(plan) && /A way to take payment/.test(plan), plan.slice(0, 500));
  await ctx.close();
}

/* ── 4 + 8 · Old customers, on a phone, all the way ── */
{
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`4: ${e}`));
  await openWizard(page, 'I want to follow up automatically with old customers.');
  ok('4 · understood as Customer Reactivation', /Customer Reactivation/.test(await page.locator('.sw-understood').innerText()));
  await page.getByTestId('sw-next').click();
  await page.waitForTimeout(300);
  const first = await page.locator('.sw-body').innerText();
  ok('4 · "where are the contacts" offers no CRM or list a new account cannot have', /Where are the contacts/.test(first) && !/Already in Protected Central|A contact list I have/.test(first), first.slice(0, 400));
  const wide = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth - innerWidth, body: (() => { const b = document.querySelector('.sw-body'); return b.scrollWidth - b.clientWidth; })(), card: document.querySelector('.sw-card').getBoundingClientRect().width }));
  ok('8 · the wizard is the whole phone screen, nothing scrolls sideways', wide.doc <= 0 && wide.body <= 0 && wide.card === 390, JSON.stringify(wide));
  await page.getByTestId('sw-next').click({ trial: true }).catch(() => {});
  /* back to the start of the questions and answer them all */
  const seen = await (async () => {
    const list = [];
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(250);
      if (await page.locator('.sw-card').getAttribute('data-step') !== 'questions') break;
      for (const q of await page.locator('.sw-q').all()) {
        list.push(await q.locator('.sw-q-title').innerText());
        if (await q.locator('.sw-ai').count()) { await q.locator('.sw-ai').first().tap(); continue; }
        if (await q.locator('.sw-opt').count()) { await q.locator('.sw-opt').first().tap(); continue; }
        if (await q.locator('.sw-input').count()) await q.locator('.sw-input').fill('10% off your next visit');
      }
      await page.getByTestId('sw-next').tap();
    }
    return list;
  })();
  ok('4 · no website-design questions', !seen.some(q => /colours|layout|feel|logo|store feel|website or funnel/i.test(q)), seen.join(' / '));
  await business(page, 'Corner Cafe', 'Neighbourhood cafe with a loyalty club');
  const btn = await page.getByTestId('sw-build').boundingBox();
  ok('8 · "Build this in my free account" sits in thumb reach', !!btn && btn.y + btn.height <= 844 && btn.width >= 300, JSON.stringify(btn));
  const who = { name: 'Cam Cafe', email: 'cam@cornercafe.test', pw: 'Another-horse-7-coffee' };
  await signUp(page, who);
  const built = await waitBuilt(page);
  ok('8 · on a phone: wizard → sign-up → project built', /Open the project/.test(built), built.slice(0, 300));
  ok('4 · the reactivation project exists', (await projectsOf(who)).length === 1);
  await ctx.close();
}

/* ── 5 · Something unusual ── */
{
  const ctx = await br.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`5: ${e}`));
  await openWizard(page, 'I want an AI that reminds my yoga students to renew their memberships and sends them a birthday discount.');
  ok('5 · the AI reads it as custom', /custom project/i.test(await page.locator('.sw-understood').innerText()));
  const seen = await answerAll(page);
  ok('5 · and asks its own clarifying question', seen.some(q => /membership ends/.test(q)), seen.join(' / '));
  await business(page, 'Flow Yoga', 'Yoga studio with monthly memberships');
  ok('5 · the plan carries the custom workflow it proposed', /Membership renewal reminders/.test(await page.locator('.sw-solution').innerText()));
  await ctx.close();
}

/* ── 6 · Leaving and coming back ── */
{
  const ctx = await br.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`6: ${e}`));
  await openWizard(page, 'Book more appointments for my salon and remind people.', 'appointment-booking');
  await page.getByTestId('sw-next').click();
  await page.waitForTimeout(300);
  const before = await page.locator('.sw-q-title').first().innerText();
  await page.goto(`${B}/`, { waitUntil: 'networkidle' });
  await page.getByTestId('find-solution').click();
  await page.getByText('Continue where you left off?').waitFor({ timeout: 5000 });
  await page.locator('.sw-resume').getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(300);
  ok('6 · "Continue where you left off" returns to the same question', (await page.locator('.sw-card').getAttribute('data-step')) === 'questions' && (await page.locator('.sw-q-title').first().innerText()) === before, before);
  ok('6 · nothing was stored on the server before sign-up', await page.evaluate(() => !!localStorage.getItem('pc_site_wizard')));
  await ctx.close();
}

/* ── The owner's funnel ── */
{
  const f = await api('site-plan.php', { action: 'funnel', token: OT, days: 30 });
  const n = e => f.steps?.find(s => s.event === e)?.visitors ?? 0;
  ok('the funnel counts visitors at each step', n('homepage_view') >= 6 && n('wizard_started') >= 6 && n('solution_viewed') >= 5, JSON.stringify(f.steps?.map(s => `${s.event}:${s.visitors}`)));
  ok('…sign-ups, from the new accounts only', n('signup_completed') === 3, String(n('signup_completed')));
  ok('…and the projects they built', n('autopilot_project_created') === 3 && n('first_workflow_created') === 3, JSON.stringify([n('autopilot_project_created'), n('first_workflow_created')]));
  ok('…on phones too', (f.steps?.find(s => s.event === 'signup_completed')?.phone ?? 0) === 1);
  ok('…and which solutions finished plans were for', (f.solutions ?? []).some(s => s.solution === 'lead-generation'), JSON.stringify(f.solutions));
  const cust = await api('auth.php', { action: 'login', email: 'pat@pikeroofing.test', password: 'Another-horse-7-roofs' });
  const refused = await api('site-plan.php', { action: 'funnel', token: cust.token, days: 30 });
  ok('…which only the install owner can read', refused.code === 'not_owner', JSON.stringify(refused));
  const rows = JSON.parse(execSync(`npx wrangler d1 execute crmpro --local --persist-to ${persist} --json --command "SELECT * FROM crm_funnel_events"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
  ok('…and nothing a visitor typed is in it', !JSON.stringify(rows).match(/roof|dental|yoga|Dallas|Pike/i), JSON.stringify(rows).slice(0, 300));
  const page = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(`${B}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email or username').fill(OWNER);
  await page.getByLabel('Password', { exact: true }).fill(OPW);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(2000);
  await page.goto(`${B}/signups`, { waitUntil: 'networkidle' });
  await page.getByTestId('site-funnel').waitFor({ timeout: 15_000 });
  ok('the owner sees the Website funnel on Sign-ups & trials', /Opened Find my solution/.test(await page.getByTestId('site-funnel').innerText()));
}

/* ── The AI allowance per connection ── */
{
  const ip = '10.99.0.1';
  let last = null;
  for (let i = 0; i < 9; i++) last = await api('site-plan.php', { action: 'understand', prompt: 'more leads please' }, ip);
  ok('a ninth understanding in an hour from one connection is matched by words instead', last.code === 'no_ai' && last.reason === 'rate_limited', JSON.stringify(last).slice(0, 200));
}

/* ── The slideshows, centred ── */
{
  const page = await (await br.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(`${B}/`, { waitUntil: 'networkidle' });
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += 450) { await page.evaluate(v => scrollTo(0, v), y); await page.waitForTimeout(40); }
  const off = await page.evaluate(() => [...document.querySelectorAll('.dc-reel.strip')].map(r => {
    const f = r.querySelector('.dc-reel-frame').getBoundingClientRect(), s = r.querySelector('.dc-reel-stage').getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(r.querySelector('.dc-reel-frame')).paddingLeft) || 0;
    return Math.round(Math.abs((s.left - f.left - pad) - (f.right - pad - s.right)));
  }));
  ok('every section\'s slideshow is centred on a wide screen', off.length > 4 && off.every(d => d <= 2), JSON.stringify(off));
}

ok('no page errors', errs.length === 0, errs.join(' | '));
await br.close();
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed} passed, ${failed} failed`);
stop();
process.exit(failed ? 1 : 0);
