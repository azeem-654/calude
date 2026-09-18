/**
 * The self-test in Settings → Profile → Animation, driven under both systems.
 *
 * Needs a built bundle and `npx wrangler dev --local`, then:
 *   node test/motionDiag.e2e.mjs <session-token> <account-id>
 *
 * The point of the panel is to tell somebody *where* their animations are being
 * stopped, so the check is that it reports different things in situations that
 * look identical on screen — a machine asking for reduced motion, and one that
 * is not. A diagnostic that says the same thing either way is worse than none,
 * because it ends the investigation with the wrong answer.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const B = 'http://localhost:8787';
const [TOK, ACCT] = process.argv.slice(2);
const out = [];
const ok = (n, p, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);
const b = await pw.chromium.launch();

/**
 * Is this element actually moving?
 *
 * The spread across several samples, not the difference between two. The test
 * squares alternate on a 1.1s ease-in-out, so two samples 420ms apart can land
 * either side of the turn at the same x and report a moving square as still —
 * which is exactly the false negative this helper reported the first time it
 * was written. Sampling across more than a full cycle cannot miss the travel.
 */
const moving = (p, cls) => p.evaluate(async (sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const seen = [];
  for (let i = 0; i < 12; i += 1) {
    seen.push(el.getBoundingClientRect().x);
    await new Promise(r => setTimeout(r, 110));
  }
  return Math.max(...seen) - Math.min(...seen) > 1;
}, `.${cls}`);

const openPanel = async (ctx) => {
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${B}/settings`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /^Profile$/ }).first().click();
  await p.waitForTimeout(500);
  await p.getByRole('heading', { name: 'Animation' }).waitFor({ timeout: 8000 });
  await p.getByRole('button', { name: /Run the test/ }).click();
  await p.waitForTimeout(500);
  return { p, errs };
};

const seed = (ctx) => ctx.addInitScript(([token, acct]) => {
  localStorage.setItem('crm_session', JSON.stringify({ token, backend: 'php', user: { email: 'other@test.dev', name: 'S', role: 'agency', accountId: acct } }));
  localStorage.setItem('crm_active_account', acct);
  localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: acct, name: 'S', plan: 'starter', status: 'active', price: 0 }]));
}, [TOK, ACCT]);

/* ── A machine asking for reduced motion, which is the owner's own case ── */
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, reducedMotion: 'reduce' });
  await seed(ctx);
  const { p, errs } = await openPanel(ctx);

  const t = await p.textContent('body');
  ok('it names what the system is asking for', /asking for\s*reduced motion/i.test(t ?? ''));
  ok('and reports the page is running reduced', /Page is running as[\s\S]{0,40}reduced/.test(t ?? ''),
    (t ?? '').match(/Page is running as[\s\S]{0,40}/)?.[0] ?? 'not reported');

  /* The decisive pair. Under a reduce system the gated square must stop and the
     ungated one must not — which is what tells somebody the gate is the cause
     rather than their whole browser. */
  ok('the always-animated square moves', (await moving(p, 'crm-motion-test-dot')) === true);
  ok('and the gated one does not', (await moving(p, 'crm-motion-test-gated')) === false,
    'the gated square ignored the system preference');

  /* Zero would mean the setting can never work, and the panel says so loudly. */
  const found = Number((t ?? '').match(/Animation rules found\s*(\d+)/)?.[1] ?? '0');
  ok('it can see the app’s own animation rules', found > 0, `found ${found}`);
  ok('so it does not show the cannot-read warning', !/not letting the page read/.test(t ?? ''));

  /* Overrule it, the way somebody in this situation would. */
  await p.getByRole('button', { name: /Always animate/ }).click();
  await p.waitForTimeout(700);
  ok('choosing Always animate starts the gated square', (await moving(p, 'crm-motion-test-gated')) === true,
    'the override did not reach the gated rule');
  const t2 = await p.textContent('body');
  ok('and the readout says the page is running full', /Page is running as[\s\S]{0,30}full/.test(t2 ?? ''),
    (t2 ?? '').match(/Page is running as[\s\S]{0,30}/)?.[0] ?? 'not reported');
  ok('and reports rules being overridden', /of those, overridden[\s\S]{0,20}[1-9]/.test(t2 ?? ''),
    (t2 ?? '').match(/of those, overridden[\s\S]{0,20}/)?.[0] ?? 'none overridden');

  ok('nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── A machine that is not asking for it: both squares must move ── */
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, reducedMotion: 'no-preference' });
  await seed(ctx);
  const { p, errs } = await openPanel(ctx);

  ok('with no system preference the always-animated square moves',
    (await moving(p, 'crm-motion-test-dot')) === true);
  ok('and so does the gated one', (await moving(p, 'crm-motion-test-gated')) === true,
    'the gated square was still held');
  ok('nothing threw on the permissive machine',
    errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

await b.close();
console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
if (failed) process.exit(1);
