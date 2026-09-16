/**
 * Does the animation preference actually work?
 *
 * Needs a built bundle and a running `npx wrangler dev --local`, then:
 *   node test/motion.e2e.mjs <session-token> <account-id>
 *
 * Playwright can tell the browser to ask for reduced motion, which is the one
 * thing that cannot be faked by reading the code — and asserting that the
 * dashboard is *completely* still under it is what found two animations written
 * inline in JSX, where no media query could ever have reached them.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const B = 'http://localhost:8787';
const [TOK, ACCT] = process.argv.slice(2);
const out = [];
const ok = (n, p, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);
const b = await pw.chromium.launch();

/** Does anything on the page actually have a running CSS animation? */
const moving = (page) => page.evaluate(() => {
  let n = 0;
  for (const el of Array.from(document.querySelectorAll('*'))) {
    const a = getComputedStyle(el).animationName;
    if (a && a !== 'none') n++;
  }
  return n;
});

const seed = (page) => page.addInitScript(([token, acct]) => {
  localStorage.setItem('crm_session', JSON.stringify({ token, backend: 'php', user: { email: 'other@test.dev', name: 'Sub', role: 'agency', accountId: acct } }));
  localStorage.setItem('crm_active_account', acct);
  localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: acct, name: 'Sub', plan: 'starter', status: 'active', price: 0 }]));
}, [TOK, ACCT]);

/* ── The situation being fixed: the OS says reduce ── */
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  await seed(ctx);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));

  await p.goto(`${B}/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  const before = await moving(p);
  ok('with the system asking for reduced motion, the dashboard is still', before === 0, `${before} animated elements`);
  ok('and the page says so', (await p.evaluate(() => document.documentElement.dataset.motion)) === 'reduced');

  /* Choose "Always animate" the way a person would. */
  await p.goto(`${B}/settings`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /^Profile$/ }).first().click();
  await p.waitForTimeout(400);
  const panel = p.getByRole('heading', { name: 'Animation' });
  await panel.waitFor({ timeout: 8000 });
  const text = await p.textContent('body');
  ok('the panel names what the system is asking for', /asking for\s*reduced motion/i.test(text ?? ''), (text ?? '').slice(0, 0) || 'not found');
  await p.getByRole('button', { name: /Always animate/ }).click();
  await p.waitForTimeout(400);
  ok('the choice is remembered', (await p.evaluate(() => localStorage.getItem('crm_motion'))) === 'full');

  /* Back to the dashboard — the fresh CSS chunk must be caught by the watcher. */
  await p.goto(`${B}/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  const after = await moving(p);
  ok('after choosing Always animate, the dashboard moves', after > 0, `${after} animated elements`);
  ok('and the page says so', (await p.evaluate(() => document.documentElement.dataset.motion)) === 'full');

  /* The marketing page too — a different stylesheet, loaded later still. */
  await p.goto(`${B}/login`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  ok('the choice survives a route change', (await p.evaluate(() => document.documentElement.dataset.motion)) === 'full');

  ok('nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── The opposite: system allows motion, person wants none ── */
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
  await seed(ctx);
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem('crm_motion', 'reduced'));
  await p.goto(`${B}/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  const n = await moving(p);
  ok('choosing Never animate stops it even when the system allows motion', n === 0, `${n} animated elements`);
  await ctx.close();
}

/* ── And the default is still the system's answer ── */
for (const [mode, expect] of [['reduce', 'reduced'], ['no-preference', 'full']]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: mode });
  await seed(ctx);
  const p = await ctx.newPage();
  await p.goto(`${B}/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  ok(`untouched, the system's "${mode}" is still obeyed`,
    (await p.evaluate(() => document.documentElement.dataset.motion)) === expect);
  await ctx.close();
}

await b.close();
console.log(out.join('\n'));
process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0);
