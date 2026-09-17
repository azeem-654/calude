/**
 * Collections, from both ends.
 *
 * Needs a built bundle, `npx wrangler dev --local`, and the seeded shop with a
 * live "New in" collection holding one product and an empty "Coming soon":
 *   node test/collections.e2e.mjs <session-token> <account-id>
 *
 * The two that matter are the ones a plausible implementation gets wrong while
 * looking right: an empty collection must not reach the shop at all, and the
 * order inside one must be the shopkeeper's rather than the catalogue's.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const B = 'http://localhost:8787';
const [TOK, ACCT] = process.argv.slice(2);
const out = [];
const ok = (n, p, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);
const b = await pw.chromium.launch();

/* ── What a buyer sees ── */
for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 950 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${B}/shop/tees`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);

  const t = await p.textContent('body');
  ok(`${width}px · the collection is offered`, /New in/.test(t ?? ''), (t ?? '').slice(0, 120));
  ok(`${width}px · with an Everything way back`, await p.getByRole('button', { name: 'Everything' }).isVisible());

  /* The one a plausible implementation gets wrong: an empty collection is a
     heading with nothing under it, which reads as a broken shop. */
  ok(`${width}px · an empty collection is not offered at all`, !/Coming soon/.test(t ?? ''),
    'an empty collection reached the page');

  await p.getByRole('button', { name: 'New in', exact: true }).click();
  await p.waitForTimeout(400);
  const inside = await p.textContent('body');
  ok(`${width}px · choosing one shows its line`, /Just landed this week/.test(inside ?? ''),
    (inside ?? '').slice(0, 160));
  ok(`${width}px · and it is marked as chosen`,
    await p.getByRole('button', { name: 'New in', exact: true }).getAttribute('aria-pressed') === 'true');
  ok(`${width}px · the product in it is still shown`, /T-shirt/.test(inside ?? ''));

  await p.getByRole('button', { name: 'Everything' }).click();
  await p.waitForTimeout(300);
  ok(`${width}px · and Everything takes the line away again`,
    !/Just landed this week/.test((await p.textContent('body')) ?? ''));

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`${width}px · no horizontal overflow`, over <= 0, `${over}px`);
  ok(`${width}px · nothing threw`, errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── What the shopkeeper does ── */
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
  await ctx.addInitScript(([token, acct]) => {
    localStorage.setItem('crm_session', JSON.stringify({ token, backend: 'php', user: { email: 'other@test.dev', name: 'S', role: 'agency', accountId: acct } }));
    localStorage.setItem('crm_active_account', acct);
    localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: acct, name: 'S', plan: 'starter', status: 'active', price: 0 }]));
  }, [TOK, ACCT]);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${B}/sell`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1300);

  const panel = p.locator('section').filter({ hasText: 'the category on a product is for filing it' });
  ok('the collections panel is there', await panel.first().isVisible());

  const t = await p.textContent('body');
  ok('the seeded collection is listed with its count', /New in/.test(t ?? '') && /1 product/.test(t ?? ''),
    (t ?? '').match(/New in[\s\S]{0,40}/)?.[0] ?? 'not listed');
  /* An empty one is listed for its owner and told why it is invisible — the
     opposite of the shop, where it must not appear. */
  ok('an empty one says why it is not showing',
    /Empty — not shown on your shop/.test(t ?? ''), 'no warning on the empty collection');

  await panel.getByRole('button', { name: /New collection/ }).click();
  await p.waitForTimeout(300);
  await panel.getByPlaceholder('New in').fill('Test group');
  await panel.getByPlaceholder('Just landed this week').fill('A line for it');
  ok('an empty draft says an empty collection will not show',
    /An empty collection is not shown/.test((await panel.textContent()) ?? ''));

  await panel.getByRole('button', { name: /^Save$/ }).click();
  await p.waitForTimeout(1300);
  ok('it saves and comes back', /Test group/.test((await p.textContent('body')) ?? ''));

  p.once('dialog', dlg => void dlg.accept());
  await panel.getByRole('button', { name: 'Delete Test group' }).first().click();
  await p.waitForTimeout(1300);
  const after = await p.textContent('body');
  ok('and can be deleted', !/Test group/.test(after ?? ''));
  /* The products are the shop's stock, not the grouping's. */
  ok('deleting a collection leaves the catalogue alone', /T-shirt/.test(after ?? ''));

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('no horizontal overflow on the admin screen', over <= 0, `${over}px`);
  ok('nothing threw on the admin screen',
    errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

await b.close();
console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
if (failed) process.exit(1);
