/**
 * The New Project wizard, driven end to end in a real browser.
 *
 * Needs a built bundle (`VITE_BASE=/ npm run build`) and a running
 * `npx wrangler dev --local --port 8787`, then:
 *
 *   node test/newProject.e2e.mjs
 *
 * It registers a fresh workspace per scenario against the local D1, so the
 * "what I already know" logic sees the state it would see for a new customer.
 * Locally there is no AI key, so this exercises the path every install falls
 * back to when the model is unavailable — which is the path that has to be
 * right without anybody noticing.
 *
 * The assertions that matter are the negative ones: a social project is never
 * asked about mailboxes; a shop is never asked about posting schedules.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { execSync } from 'node:child_process';

const B = process.env.BASE ?? 'http://localhost:8787';
const out = [];
const ok = (n, p, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);
const b = await pw.chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

async function register(tag) {
  /* Sign-up allows five an hour per connection, and this makes eight. The
     local database only — this never runs against a deployed one. */
  if (!/localhost|127\.0\.0\.1/.test(B)) throw new Error('Refusing to clear sign-up limits on a non-local address.');
  execSync('npx wrangler d1 execute crmpro --local --command "DELETE FROM crm_signup_attempts"', { stdio: 'ignore' });
  const email = `np-${tag}-${Date.now()}@test.dev`;
  const r = await fetch(`${B}/api/auth.php`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'register', email, password: 'Sup3rSecret!23', name: 'Tester', businessName: 'Pike Plumbing' }),
  }).then(x => x.json());
  if (!r.success) throw new Error(`register: ${r.error}`);
  return { token: r.token, acct: r.user.accountId, email };
}

async function open(width, tag, reducedMotion = 'no-preference') {
  const { token, acct, email } = await register(tag);
  lastSession = { token, acct };
  const ctx = await b.newContext({ viewport: { width, height: 900 }, permissions: ['microphone'], reducedMotion });
  await ctx.addInitScript(([t, a, e]) => {
    localStorage.setItem('crm_session', JSON.stringify({ token: t, backend: 'php', user: { email: e, name: 'T', role: 'agency', accountId: a } }));
    localStorage.setItem('crm_active_account', a);
    localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: a, name: 'Pike Plumbing', plan: 'agency', status: 'active', price: 0 }]));
  }, [token, acct, email]);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.goto(`${B}/autopilot`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /New project|Start your first project/i }).first().click();
  const d = p.getByRole('dialog', { name: 'New project' });
  await d.waitFor({ timeout: 8000 });
  return { ctx, p, d, errs };
}

let lastSession = { token: '', acct: '' };

/** The workspace's deals pipelines, read back from the API the board reads. */
const pipelines = (p, s) => p.evaluate(async ([acct, token]) => {
  const r = await fetch('/api/data.php', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'get', token, accountId: acct, key: 'crm_pipelines' }),
  });
  const j = await r.json();
  try { return JSON.parse(j.value || '[]'); } catch { return []; }
}, [s.acct, s.token]);

const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const cta = d => d.locator('footer .wz-cta');

/** Answer whatever is on screen as a customer in a hurry would. */
async function answerScreen(d, overrides = []) {
  for (const [question, option] of overrides) {
    const q = d.locator('.np-q').filter({ hasText: question });
    if (await q.count()) await q.getByRole('button', { name: option }).first().click();
  }
  const typeIt = d.getByRole('button', { name: /Type it in/ });
  if (await typeIt.count() && (await typeIt.getAttribute('aria-pressed')) !== 'true') {
    await typeIt.click();
    await d.getByPlaceholder('Pike Plumbing & Heating').fill('Pike Plumbing & Heating');
    await d.getByPlaceholder(/Boiler repairs and installations/).fill('Boiler repairs and installations across Leeds');
  }
  for (const q of await d.locator('.np-q').all()) {
    if (await q.locator('.np-sol').count()) continue;
    const pressed = await q.locator('[aria-pressed="true"]').count();
    if (pressed) continue;
    const ai = q.locator('[data-ai="1"]');
    if (await ai.count()) { await ai.first().click(); continue; }
    const opt = q.locator('.np-opt');
    if (await opt.count()) { await opt.first().click(); continue; }
    const input = q.locator('input.np-input');
    if (await input.count() && !(await input.first().inputValue())) await input.first().fill('Landlords in Leeds with 2–40 properties');
  }
}

/** From the describe screen to the blueprint, recording every question asked. */
async function toBlueprint(p, d, prompt, overrides = []) {
  await d.getByLabel('What would you like Autopilot to do?').fill(prompt);
  await cta(d).click();
  await d.getByText(/Here.s what I understood/).waitFor({ timeout: 20000 });
  const understood = await d.innerText();
  await cta(d).click();
  const asked = [];
  for (let i = 0; i < 12; i++) {
    await p.waitForTimeout(250);
    if (await d.getByText(/Here.s what Autopilot/).count()) break;
    for (const t of await d.locator('.np-q-head > span:first-child').allInnerTexts()) asked.push(t);
    await answerScreen(d, overrides);
    await p.waitForTimeout(150);
    if (await cta(d).isDisabled()) { asked.push(`STUCK: ${await cta(d).innerText()}`); break; }
    await cta(d).click();
  }
  return { asked, understood };
}

async function buildIt(p, d) {
  await cta(d).click(); // blueprint → connections
  await p.waitForTimeout(400);
  const connections = await d.innerText();
  await cta(d).click(); // → review
  await p.waitForTimeout(300);
  await d.getByRole('button', { name: /Build My Autopilot/ }).click();
  await d.getByRole('heading', { name: /Your Autopilot is ready|The build stopped/ }).waitFor({ timeout: 60000 });
  const built = await d.innerText();
  return { connections, built };
}

const MAILBOX_Q = /email address to send from|Who should the emails come from|How many new people a day/;

/* ── TEST 1: social, 1280 and 390 ── */
for (const width of [1280, 390]) {
  const { ctx, p, d, errs } = await open(width, `t1-${width}`);
  const { asked, understood } = await toBlueprint(p, d, 'Study my company website pikeplumbing.example and create one social image post every weekday.');
  ok(`T1@${width} understood it as social`, /Social Media Growth/.test(understood), understood.slice(0, 300));
  ok(`T1@${width} said it matched words without the AI`, /matched your words/.test(understood));
  ok(`T1@${width} asked no mailbox/sending question`, !asked.some(q => MAILBOX_Q.test(q)), asked.join(' | '));
  ok(`T1@${width} asked which platforms`, asked.some(q => /platforms/.test(q)), asked.join(' | '));
  ok(`T1@${width} did not re-ask how often`, !asked.some(q => /^How often\?$/.test(q)), asked.join(' | '));
  const bp = await d.innerText();
  ok(`T1@${width} blueprint names the social workflow`, /Social Media Content Automation/.test(bp));
  ok(`T1@${width} blueprint says publishing is manual`, /does not post to social networks/.test(bp));
  ok(`T1@${width} blueprint runs every weekday`, /Every weekday/.test(bp));
  ok(`T1@${width} no horizontal overflow on the blueprint`, (await overflow(p)) === 0, String(await overflow(p)));
  if (width === 1280) {
    /* Edit with AI, without the AI: the deterministic edits. */
    const panel = d.locator('.np-side');
    await panel.getByLabel('What should change?').fill('Make this three posts per week');
    await panel.getByRole('button', { name: /Update/ }).click();
    await p.waitForTimeout(900);
    ok('T1 edit: three a week applied', /Monday, Wednesday and Friday/.test(await d.innerText()));
    await panel.getByLabel('What should change?').fill('Add a blog every Friday');
    await panel.getByRole('button', { name: /Update/ }).click();
    await p.waitForTimeout(900);
    ok('T1 edit: Friday blog added', /SEO Blog Content Automation/.test(await d.innerText()) && /Every Friday/.test(await d.innerText()));
  }
  const { connections, built } = await buildIt(p, d);
  ok(`T1@${width} connections list no mailbox`, !/email mailbox/i.test(connections), connections.slice(0, 400));
  ok(`T1@${width} connections list the Social Creator`, /Social Creator/.test(connections));
  ok(`T1@${width} build reached 100%`, /100%/.test(built), built.slice(0, 500));
  ok(`T1@${width} build created the workflows`, /Created [1-9] workflow/.test(built), built.slice(-400));
  await d.getByRole('button', { name: /Open the project/ }).click();
  await p.waitForTimeout(1500);
  const page = await p.innerText('body');
  ok(`T1@${width} lands on the project Overview`, /Overview/.test(page) && /latest outputs/i.test(page), page.slice(0, 300));
  ok(`T1@${width} Create workflow is visible on a new project`, (await p.getByRole('button', { name: /Create workflow/ }).count()) > 0);
  await p.getByRole('tab', { name: /Schedule/ }).first().click();
  await p.waitForTimeout(300);
  ok(`T1@${width} schedule tab names the cadence`, /weekday|Mon, Wed, Fri/i.test(await p.innerText('body')));
  ok(`T1@${width} no overflow on the project page`, (await overflow(p)) === 0, String(await overflow(p)));
  ok(`T1@${width} no page errors`, !errs.length, errs.join(' | '));
  await ctx.close();
}

/* ── TEST 2: reactivation ── */
{
  const { ctx, p, d, errs } = await open(1280, 't2');
  const { asked, understood } = await toBlueprint(p, d, 'I have 10,000 previous customers. Create an email reactivation campaign.');
  ok('T2 understood it as reactivation', /Customer Reactivation/.test(understood), understood.slice(0, 300));
  ok('T2 asked where the contacts are', asked.some(q => /Where are the contacts/.test(q)), asked.join(' | '));
  ok('T2 asked about a mailbox', asked.some(q => /email address to send from/.test(q)), asked.join(' | '));
  ok('T2 asked what is on offer', asked.some(q => /offering/.test(q)), asked.join(' | '));
  ok('T2 asked nothing about platforms', !asked.some(q => /platforms/.test(q)), asked.join(' | '));
  const { connections } = await buildIt(p, d);
  ok('T2 connections include a mailbox', /email mailbox/i.test(connections));
  ok('T2 no page errors', !errs.length, errs.join(' | '));
  await ctx.close();
}

/* ── TEST 2b: asked for mailboxes to be set up → the domain shop, next ── */
{
  const { ctx, p, d, errs } = await open(1280, 't2b');
  await toBlueprint(p, d, 'Send a five-email outreach sequence to Amazon sellers and book interested prospects.',
    [['email address to send from', /set one up for me/]]);
  const { built } = await buildIt(p, d);
  ok('T2b built', /Created [1-9] workflow/.test(built), built.slice(-300));
  await d.getByRole('button', { name: /Choose domains and mailboxes/ }).click();
  await p.waitForTimeout(3500);
  const buying = await d.innerText();
  ok('T2b the next screen is the domain purchase', /domains? and (mailboxes|email)/i.test(buying) && /register a domain|domain/i.test(buying), buying.slice(0, 300));
  ok('T2b not held for a project that does not exist', !/Finish creating the project first/.test(buying));
  ok('T2b no page errors', !errs.length, errs.join(' | '));
  await ctx.close();
}

/* ── TEST 3: e-commerce with a CSV ── */
{
  const { ctx, p, d, errs } = await open(1280, 't3');
  const csv = 'Title,SKU,Price,Description,Category\nRed Mug,MUG-R,12.50,A red mug,Mugs\nBlue Mug,MUG-B,13.00,,Mugs\nTea Towel,TT-1,8.00,Cotton,Linen\n';
  await d.locator('input[type=file]').first().setInputFiles({ name: 'products.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await p.waitForTimeout(400);
  const { asked, understood } = await toBlueprint(p, d, 'I have 80 products with images and prices. Build an e-commerce store.');
  ok('T3 understood it as a store', /E-commerce Store/.test(understood), understood.slice(0, 300));
  ok('T3 knew the products were in the spreadsheet', /products\.csv/.test(understood));
  ok('T3 asked about the catalogue or store', asked.some(q => /variations|store feel|already have for each product/.test(q)), asked.join(' | '));
  ok('T3 asked nothing about posting or sending', !asked.some(q => MAILBOX_Q.test(q) || /platforms|How often/.test(q)), asked.join(' | '));
  const { connections, built } = await buildIt(p, d);
  ok('T3 connections include payments', /way to take payment/i.test(connections));
  ok('T3 imported the three products', /3 imported as drafts/.test(built), built.slice(-600));
  /* The set-up the blueprint showed becomes the first card on the project's
     board — the check the old launch-order test made, kept. */
  const board = await pipelines(p, lastSession);
  /* The project's own pipeline, not the workspace's starter one. */
  const setupCard = board.flatMap(x => x.stages?.[0]?.deals ?? []).find(dl => /^Get .* live$/.test(dl.title ?? ''));
  const checklist = (setupCard?.checklist ?? []).map(c => c.text);
  ok('T3 the board carries the agreed set-up', checklist.some(c => /take payment/i.test(c)) && checklist.some(c => /Import the products/i.test(c)), JSON.stringify(checklist));
  ok('T3 no page errors', !errs.length, errs.join(' | '));
  await ctx.close();
}

/* ── TEST 4: missed appointments ── */
{
  const { ctx, p, d, errs } = await open(1280, 't4');
  const { asked, understood } = await toBlueprint(p, d, 'Follow up with customers who miss appointments and try to rebook them.');
  ok('T4 understood appointments', /Appointment Booking/.test(understood), understood.slice(0, 300));
  ok('T4 asked where appointments live', asked.some(q => /appointments live/.test(q)), asked.join(' | '));
  ok('T4 blueprint has no-show recovery', /No-Show Recovery/.test(await d.innerText()));
  ok('T4 no page errors', !errs.length, errs.join(' | '));
  await ctx.close();
}

/* ── TEST 5: SEO blog ── */
{
  const { ctx, p, d, errs } = await open(390, 't5');
  const { asked, understood } = await toBlueprint(p, d, 'Create SEO blog content every week.');
  ok('T5 understood blog', /Blog & SEO/.test(understood), understood.slice(0, 300));
  ok('T5 asked about topics or sources', asked.some(q => /Topics|written from/.test(q)), asked.join(' | '));
  ok('T5 asked nothing about sending', !asked.some(q => MAILBOX_Q.test(q)), asked.join(' | '));
  ok('T5 no overflow at 390', (await overflow(p)) === 0, String(await overflow(p)));
  ok('T5 no page errors', !errs.length, errs.join(' | '));
  await ctx.close();
}

/* ── TEST 6: something unusual ── */
{
  const { ctx, p, d, errs } = await open(1280, 't6');
  const { asked, understood } = await toBlueprint(p, d, 'Every month, turn our volunteer rota changes into a friendly note for the team.');
  ok('T6 falls through to a custom project', /built from scratch/i.test(understood), understood.slice(0, 300));
  ok('T6 asked what it should produce', asked.some(q => /produce/.test(q)), asked.join(' | '));
  ok('T6 reached a blueprint rather than failing', /Here.s what Autopilot/.test(await d.innerText()));
  ok('T6 no page errors', !errs.length, errs.join(' | '));
  await ctx.close();
}

/* ── TEST 7: voice — the states, and that nothing is submitted ── */
{
  const { ctx, p, d, errs } = await open(1280, 't7');
  const mic = d.getByRole('button', { name: 'Speak instead of typing' });
  ok('T7 microphone is offered', (await mic.count()) === 1);
  await mic.click();
  await d.getByText(/Listening…/).first().waitFor({ timeout: 6000 });
  ok('T7 says Listening…', true);
  ok('T7 the box is locked while listening', await d.getByLabel('What would you like Autopilot to do?').evaluate(el => el.readOnly));
  await p.waitForTimeout(2200);
  await d.getByRole('button', { name: 'Stop listening' }).click();
  await d.getByText(/Transcribing|Voice input stopped|I heard this|check it/).first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(3000);
  const txt = await d.innerText();
  ok('T7 an unusable take is reported, not submitted', /couldn.t|could not|check it/i.test(txt), txt.slice(0, 400));
  ok('T7 still on the describe screen', /What would you like/.test(txt));
  ok('T7 no page errors', !errs.length, errs.join(' | '));
  await ctx.close();
}

/* ── TEST 7b: listening, with motion reduced — the states in words, nothing looping ── */
{
  const { ctx, p, d, errs } = await open(1280, 't7b', 'reduce');
  await d.getByRole('button', { name: 'Speak instead of typing' }).click();
  await d.getByText(/Listening…/).first().waitFor({ timeout: 6000 });
  await p.waitForTimeout(600);
  const moving = await p.evaluate(() => document.getAnimations()
    .filter(a => a.playState === 'running')
    .map(a => String(a.effect?.target?.className ?? ''))
    .filter(c => /\b(vc|np|wz)-/.test(c)));
  ok('T7b nothing loops while listening under reduced motion', !moving.length, moving.join(' | '));
  ok('T7b still says it is listening', /Listening…/.test(await d.innerText()));
  await d.getByRole('button', { name: 'Stop listening' }).click();
  await p.waitForTimeout(2500);
  ok('T7b no page errors', !errs.length, errs.join(' | '));
  await ctx.close();
}

/* ── TEST 8: a website that cannot be fully read is answered where it is given ──
   The build used to read the site, get no name back, and stop at 35% with
   "A portfolio needs the client's name" — on a screen with nowhere to type it.
   Locally there is no AI key, so the site cannot be read at all: the business
   screen must say so, offer to take the details, and hold Continue until the
   name and what the business does are there. */
{
  const { ctx, p, d, errs } = await open(1280, 't8');
  await d.getByLabel('What would you like Autopilot to do?').fill('Post one social image every weekday.');
  await cta(d).click();
  await d.getByText(/Here.s what I understood/).waitFor({ timeout: 20000 });
  await cta(d).click();
  let reached = false;
  for (let i = 0; i < 8 && !reached; i++) {
    await p.waitForTimeout(250);
    const biz = d.locator('.np-q').filter({ hasText: 'How should Autopilot learn about the business?' });
    if (await biz.count()) { reached = true; break; }
    await answerScreen(d);
    await cta(d).click();
  }
  ok('T8 the business screen is asked', reached);
  await d.getByRole('button', { name: /Read my website/ }).click();
  await d.locator('.np-q').filter({ hasText: 'The business website' }).locator('input').fill('https://pikeplumbing-test.example');
  await d.getByText(/Could not read that site|What I found/).first().waitFor({ timeout: 25000 });
  const said = await d.innerText();
  ok('T8 the site is read on this screen, before moving on', /Could not read that site|What I found/.test(said), said.slice(0, 200));
  ok('T8 Continue is held until the business is known', await cta(d).isDisabled(), await cta(d).innerText());
  const typeIn = d.getByRole('button', { name: 'Type it in instead' });
  if (await typeIn.count()) await typeIn.click();
  ok('T8 the missing answer is asked for by name', /Business name — needed/.test(await d.innerText()), (await d.innerText()).slice(0, 300));
  await d.getByLabel(/Business name/).fill('Pike Plumbing & Heating');
  ok('T8 still held until it says what the business does', await cta(d).isDisabled(), await cta(d).innerText());
  await d.getByLabel(/What it does/).fill('Boiler repairs and installations across Leeds');
  await p.waitForTimeout(200);
  ok('T8 then it can continue', !(await cta(d).isDisabled()), await cta(d).innerText());
  for (let i = 0; i < 10; i++) {
    await p.waitForTimeout(250);
    if (await d.getByText(/Here.s what Autopilot/).count()) break;
    await answerScreen(d);
    await p.waitForTimeout(150);
    if (await cta(d).isDisabled()) break;
    await cta(d).click();
  }
  const { built } = await buildIt(p, d);
  ok('T8 the build does not stop for a missing name', !/needs the client/.test(built) && /Your Autopilot is ready/.test(built), built.slice(0, 300));
  const name = execSync(`npx wrangler d1 execute crmpro --local --json --command "SELECT name FROM crm_portfolios WHERE account_id = '${lastSession.acct}'"`, { encoding: 'utf8' });
  ok('T8 the profile is saved under the name they typed', /Pike Plumbing & Heating/.test(name), name.slice(-200));
  ok('T8 no page errors', !errs.length, errs.join(' | '));
  await ctx.close();
}

await b.close();
console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
