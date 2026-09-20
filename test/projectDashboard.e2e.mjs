/**
 * A project's own dashboard, driven in a real browser.
 *
 * Needs a built bundle and `npx wrangler dev --local --test-scheduled`:
 *   node test/projectDashboard.e2e.mjs <token> <accountId> <projectId>
 *
 * ── What is worth checking here ──
 *
 * This screen's whole job is to be believable: a customer paying monthly wants
 * to know the thing is alive, and the work happens on a cron somewhere they
 * cannot see. So the checks are about honesty rather than layout — that a
 * brand-new project says "nothing yet" instead of looking busy, that a paused
 * one is visibly still, that a real failure is named rather than counted, and
 * that the instruction box says what it will do *before* somebody types in it.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const B = 'http://localhost:8787';
const [TOK, ACCT, PROJ] = process.argv.slice(2);
if (!TOK || !ACCT) { console.error('usage: node test/projectDashboard.e2e.mjs <token> <accountId> [projectId]'); process.exit(2); }

const out = [];
const ok = (n, p, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);
const b = await pw.chromium.launch();

const open = async (width, reduce = false) => {
  const ctx = await b.newContext({ viewport: { width, height: 1000 }, reducedMotion: reduce ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(([token, acct]) => {
    localStorage.setItem('crm_session', JSON.stringify({ token, backend: 'php', user: { email: 'dash@test.dev', name: 'D', role: 'agency', accountId: acct } }));
    localStorage.setItem('crm_active_account', acct);
    localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: acct, name: 'D', plan: 'starter', status: 'active', price: 0 }]));
  }, [TOK, ACCT]);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${B}/autopilot`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2200);
  return { ctx, p, errs };
};

/* ── The dashboard itself ── */
for (const width of [390, 1280]) {
  const { ctx, p, errs } = await open(width);
  const t = (await p.textContent('body')) ?? '';

  ok(`${width}px · the project has its own dashboard`, /Leeds plumbing/.test(t), t.slice(0, 260));
  ok(`${width}px · with a box to tell it what to do`, /Tell it what to do/.test(t));

  /* Said before somebody types, not after something has happened. An
     instruction box that acts silently is the worst version of this feature. */
  ok(`${width}px · which says up front that nothing sends because you typed it`,
    /nothing is sent because\s*you typed it|queued as a card you can read and reject/.test(t.replace(/\s+/g, ' ')),
    'the warning before the box is missing');

  ok(`${width}px · the working day is drawn as stages`,
    /Reads the business/.test(t) && /Writes the campaigns/.test(t), t.slice(0, 300));
  ok(`${width}px · and it says what happens next rather than only what happened`, /Next/.test(t));

  /* The one real thing this workspace has to act on: no mailbox. It must be on
     the screen without opening anything — a problem hidden behind a toggle is
     a problem nobody fixes. */
  ok(`${width}px · a real problem is named in words, without opening anything`,
    /no mailbox is connected/i.test(t), 'the mailbox notice is missing');

  /* And it must not be counted as work done. `observe` and `error` actions are
     written straight to `done` because noticing is the whole action, so a naive
     count reads "1 done today" on a project whose only event was "nothing can
     be sent". */
  ok(`${width}px · and a notice is not counted as an achievement`,
    /0 done today/.test(t), (t.match(/\d+ done today/) ?? ['no count'])[0]);

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`${width}px · no horizontal overflow`, over <= 0, `${over}px`);
  ok(`${width}px · nothing threw`, errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── The signs of life are real, and honour the motion preference ── */
{
  const { ctx, p, errs } = await open(1280);
  const moving = await p.evaluate(() => Array.from(document.querySelectorAll('*'))
    .filter(el => { const a = getComputedStyle(el).animationName; return a && a !== 'none'; }).length);
  ok('a running project shows something moving', moving > 0, `${moving} animated elements`);

  /* The travelling light is what says "still going", so it has to be a real
     rule — an inline animation could never be switched off. */
  const named = await p.evaluate(() => Array.from(document.querySelectorAll('*'))
    .map(el => getComputedStyle(el).animationName).filter(a => a && a !== 'none'));
  ok('and it is the dashboard\'s own loop animations', named.some(n => n.startsWith('ap-')), named.join(','));
  ok('nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

{
  const { ctx, p, errs } = await open(1280, true);
  const moving = await p.evaluate(() => Array.from(document.querySelectorAll('*'))
    .filter(el => { const a = getComputedStyle(el).animationName; return a && a !== 'none'; }).length);
  /* The point of the whole motion rule: asked to reduce, the page is still.
     A dashboard is exactly where somebody would be tempted to make an
     exception, and an exception is what makes the setting worthless. */
  ok('asked for reduced motion, the dashboard is completely still', moving === 0, `${moving} animated elements`);
  ok('nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── The instruction box refuses honestly with no AI key ── */
{
  const { ctx, p, errs } = await open(1280);
  await p.getByPlaceholder(/getting ready for winter/i).fill('Write a post about winter boiler checks');
  await p.getByRole('button', { name: 'Ask' }).click();
  await p.waitForTimeout(1800);
  const t = (await p.textContent('body')) ?? '';
  /* No key is connected on a fresh install, so the honest answer is to say so
     and name the screen that fixes it — never to queue work it cannot do. */
  ok('with no AI key it says so and names where to fix it',
    /No AI key is connected/.test(t) && /AI Engine/.test(t), t.slice(0, 300));
  ok('nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── The old column is still reachable, not deleted ── */
{
  const { ctx, p, errs } = await open(1280);
  await p.getByRole('button', { name: /Settings, workflows and everything/ }).click();
  await p.waitForTimeout(900);
  const t = (await p.textContent('body')) ?? '';
  ok('the settings and history panel opens', /Workflows|No domains|sending/i.test(t), t.slice(0, 300));
  ok('nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

void PROJ;
await b.close();
for (const line of out) console.log(line);
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
