/**
 * The shared wizard look, and — more importantly — its loops stopping.
 *
 * Needs a built bundle and `npx wrangler dev --local`, then:
 *   node test/wizardLook.e2e.mjs <session-token> <account-id>
 *
 * The decorative loops are the risk here, not the colours. A `style={{
 * animation: … }}` written in JSX is unreachable by any media query, and that
 * exact mistake once left a "live" dot pulsing forever for somebody who had
 * asked their whole machine to stop moving things. So this drives a browser
 * that asks for reduced motion and asserts every loop is actually still —
 * which is a thing a screenshot cannot tell you.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const B = 'http://localhost:8787';
const [TOK, ACCT] = process.argv.slice(2);
const out = [];
const ok = (n, p, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);
const b = await pw.chromium.launch();

/** Every element in the page that a browser considers to be animating. */
const running = (p) => p.evaluate(() =>
  document.getAnimations()
    .filter(a => a.playState === 'running')
    .map(a => (a.effect?.target?.className ?? '').toString())
    .filter(c => /\b(wz|np|vc)-/.test(c)));

const seed = (ctx) => ctx.addInitScript(([token, acct]) => {
  localStorage.setItem('crm_session', JSON.stringify({ token, backend: 'php', user: { email: 'other@test.dev', name: 'S', role: 'agency', accountId: acct } }));
  localStorage.setItem('crm_active_account', acct);
  localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: acct, name: 'S', plan: 'starter', status: 'active', price: 0 }]));
}, [TOK, ACCT]);

const openAutopilot = async (ctx) => {
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${B}/autopilot`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /New project|Start your first project/i }).first().click();
  await p.getByRole('dialog', { name: 'New project' }).waitFor({ timeout: 8000 });
  await p.waitForTimeout(900);
  return { p, errs };
};

/* ── A machine that allows motion: the loops should be running ── */
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, reducedMotion: 'no-preference' });
  await seed(ctx);
  const { p, errs } = await openAutopilot(ctx);

  const t = await p.textContent('body');
  ok('the wizard opens on the shared card', await p.locator('.wz-card').first().isVisible());
  ok('the backdrop carries the two washes',
    (await p.locator('.wz-wash').count()) === 2, `${await p.locator('.wz-wash').count()} washes`);
  ok('the headline carries an accent phrase',
    (await p.locator('.wz-accent').first().textContent()) === 'Autopilot',
    await p.locator('.wz-accent').first().textContent() ?? 'none');
  ok('and the words around it are still there', /What would you like[\s\S]*to do\?/.test(t ?? ''));
  ok('the primary action is the shared pill', await p.locator('.wz-cta').first().count() === 1);

  const live = await running(p);
  ok('the washes are actually looping', live.some(c => c.includes('wz-wash')), live.join(' | ') || 'nothing running');

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('no horizontal overflow', over <= 0, `${over}px`);
  ok('nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── A machine asking for reduced motion: every loop must be still ── */
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, reducedMotion: 'reduce' });
  await seed(ctx);
  const { p, errs } = await openAutopilot(ctx);

  const live = await running(p);
  ok('under reduced motion nothing in the wizard loops', live.length === 0,
    `still running: ${live.join(' | ')}`);
  /* Still *there*, just still. Removing the decoration under reduced motion
     would change the layout, which is a different promise from not moving. */
  ok('but the washes are still drawn', (await p.locator('.wz-wash').count()) === 2);
  ok('and the accent phrase is still legible, not transparent',
    await p.locator('.wz-accent').first().isVisible());
  ok('nothing threw under reduced motion',
    errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── The campaign wizard uses the same pieces, which is the point of them ── */
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, reducedMotion: 'no-preference' });
  await seed(ctx);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${B}/marketing`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: /New campaign|Create campaign/i }).first().click();
  await p.waitForTimeout(1100);

  ok('the campaign wizard is on the same card', await p.locator('.wz-card').first().isVisible());
  ok('with the same backdrop', (await p.locator('.wz-wash').count()) === 2);
  ok('and the same accent headline',
    (await p.locator('.wz-accent').first().textContent()) === 'start?',
    await p.locator('.wz-accent').first().textContent() ?? 'none');
  ok('it is still announced as a dialog',
    await p.getByRole('dialog', { name: /Create campaign/ }).isVisible());

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('no horizontal overflow on the campaign wizard', over <= 0, `${over}px`);
  ok('nothing threw on the campaign wizard',
    errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

await b.close();
console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
if (failed) process.exit(1);
