/**
 * "Where is my order?", driven the way a buyer would.
 *
 * Needs a built bundle, `npx wrangler dev --local`, and the seeded shop at
 * /shop/tees with at least one order on it:
 *   node test/orderLookup.e2e.mjs <order-reference> <the-email-it-used>
 *
 * The assertions that matter are the two that are easy to get wrong and look
 * right: that a wrong email does not reveal the order, and that the receipt is
 * the frozen one rather than a recomputation against today's settings.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const B = 'http://localhost:8787/shop/tees';
const [REF, EMAIL] = process.argv.slice(2);
const out = [];
const ok = (n, p, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);
const b = await pw.chromium.launch();

for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 950 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));

  /* The footer route in: a shop that has filled in none of its notes must
     still offer this, which is why it is not inside the optional block. */
  await p.goto(B, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'Track an order' }).click();
  await p.waitForTimeout(400);
  const dlg = p.getByRole('dialog', { name: 'Track an order' });
  ok(`${width}px · the tracker opens from the shop`, await dlg.isVisible());

  /* The reference alone must not do it. */
  await dlg.getByLabel('Order reference').fill(REF);
  await dlg.getByLabel('Order email').fill('not-the-buyer@example.com');
  await dlg.getByRole('button', { name: /Find my order/ }).click();
  await p.waitForTimeout(900);
  const wrong = await dlg.textContent();
  ok(`${width}px · a real reference with the wrong email reveals nothing`,
    /could not find an order/.test(wrong ?? '') && !/Paid|Not paid yet/.test(wrong ?? ''),
    (wrong ?? '').slice(0, 120));
  ok(`${width}px · and does not say which half was wrong`,
    !/reference/i.test((wrong ?? '').replace(/Order reference/g, '').replace(/reference and email/g, '')),
    'the message named one of the two');

  /* Both halves. */
  await dlg.getByLabel('Order email').fill(EMAIL);
  await dlg.getByRole('button', { name: /Find my order/ }).click();
  await p.waitForTimeout(900);
  const found = await dlg.textContent();
  ok(`${width}px · the right pair finds the order`, /T-shirt/.test(found ?? ''), (found ?? '').slice(0, 160));
  ok(`${width}px · the status is said in words a buyer understands`,
    /Not paid yet|Paid|Sent|Refunded|Cancelled/.test(found ?? ''));
  ok(`${width}px · the reference is shown to quote back`, found?.includes(REF) ?? false);
  ok(`${width}px · and the total is on it`, /£35\.99/.test(found ?? ''),
    (found ?? '').match(/£[\d.]+/g)?.join(' ') ?? 'no money');

  /* The one this design turns on. That order was placed while the shop added
     tax at the till; the shop has since switched to tax-inclusive prices. A
     receipt recomputed against today's setting would print "Includes VAT" and
     a total £6 adrift. The frozen one must not. */
  ok(`${width}px · the receipt is the frozen one, not today's settings`,
    /\+£6\.00/.test(found ?? '') && !/Includes VAT/.test(found ?? ''),
    (found ?? '').match(/(Includes )?VAT[^£]*£[\d.]+/)?.[0] ?? 'no tax line');

  await ctx.close();
}

/* A link from a receipt arrives with the reference already in it. */
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${B}?order=${encodeURIComponent(REF)}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  const dlg = p.getByRole('dialog', { name: 'Track an order' });
  ok('a link from a receipt opens the tracker', await dlg.isVisible());
  ok('with the reference already filled in',
    (await dlg.getByLabel('Order reference').inputValue()) === REF);
  ok('and leaves only the email to type',
    (await dlg.getByLabel('Order email').inputValue()) === '');

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('no horizontal overflow', over <= 0, `${over}px`);
  ok('nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

await b.close();
console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
if (failed) process.exit(1);
