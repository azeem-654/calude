/**
 * The shop a stranger buys from, driven for real.
 *
 * Needs a built bundle, `npx wrangler dev --local`, and a published shop at
 * /shop/tees with a variant in stock, one sold out, a SAVE20 code, a UK
 * delivery rate and a 20% GB VAT rate with the storefront set to
 * tax-inclusive. Then: node test/shopPage.e2e.mjs
 *
 * The assertions that matter are the arithmetic ones. Everything else can look
 * right while the total is wrong, and the total is what gets charged.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const B = 'http://localhost:8787/shop/tees';
const out = [];
const ok = (n, p, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);
const b = await pw.chromium.launch();

for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 950 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(B, { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);

  const t = await p.textContent('body');
  ok(`${width}px · the size buttons are drawn`, /Large/.test(t ?? '') && /Small/.test(t ?? ''), (t ?? '').slice(0, 140));

  /* Small has no stock — it must be visible and unusable, not hidden. */
  const small = p.getByRole('button', { name: 'Small', exact: true });
  ok(`${width}px · a sold-out size is shown, not hidden`, await small.isVisible());
  ok(`${width}px · and cannot be chosen`, await small.isDisabled());

  /* The card opens on the size that is actually in stock. */
  ok(`${width}px · the price shown is the chosen variant's`, /£25\.00/.test(t ?? ''), (t ?? '').match(/£[\d.]+/g)?.join(' ') ?? '');

  await p.getByRole('button', { name: /Add to basket/ }).first().click();
  await p.waitForTimeout(400);
  await p.getByRole('button', { name: /Basket|1 ·/ }).first().click();
  await p.waitForTimeout(900);

  const basket = await p.textContent('body');
  ok(`${width}px · the basket names the variant`, /T-shirt — Large/.test(basket ?? ''), (basket ?? '').slice(0, 0) || 'not found');
  ok(`${width}px · there is a discount box`, await p.getByLabel('Discount code').isVisible());
  ok(`${width}px · and a country box`, await p.getByLabel('Country code').isVisible());

  /* A bad code must say why, not silently do nothing. */
  await p.getByLabel('Discount code').fill('NOPE');
  await p.waitForTimeout(1100);
  ok(`${width}px · a bad code says why`, /not recognised/.test((await p.textContent('body')) ?? ''));

  /* A good one must land, and delivery must price. */
  await p.getByLabel('Discount code').fill('SAVE20');
  await p.getByLabel('Country code').fill('GB');
  await p.waitForTimeout(1200);
  const priced = await p.textContent('body');
  ok(`${width}px · the code comes off`, /−£5\.00/.test(priced ?? ''), (priced ?? '').match(/−£[\d.]+/)?.[0] ?? 'no discount line');
  ok(`${width}px · delivery is named and priced`, /UK standard/.test(priced ?? '') && /£4\.99/.test(priced ?? ''));
  ok(`${width}px · and the total is goods − code + delivery`, /£24\.99/.test(priced ?? ''),
    (priced ?? '').match(/Total[^£]*£[\d.]+/)?.[0] ?? 'no total');

  /* The assertion this whole tax feature turns on: a shop whose prices already
     include VAT charges exactly the number it showed. If the total moves here,
     every buyer has been overcharged by the rate and the page still looks
     right — which is why it is asserted rather than eyeballed. */
  ok(`${width}px · an included tax does not move the total`,
    /£24\.99/.test(priced ?? '') && !/£29\.99/.test(priced ?? ''),
    (priced ?? '').match(/Total[^£]*£[\d.]+/)?.[0] ?? 'no total');
  ok(`${width}px · and is shown as contained, not as an addition`,
    /Includes VAT/.test(priced ?? ''), (priced ?? '').match(/Includes[^£]*/)?.[0] ?? 'no tax line');
  ok(`${width}px · the VAT inside £24.99 at 20% is £4.16`,
    /£4\.16/.test(priced ?? ''), (priced ?? '').match(/Includes VAT[^£]*£[\d.]+/)?.[0] ?? 'not shown');

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`${width}px · no horizontal overflow`, over <= 0, `${over}px`);
  ok(`${width}px · nothing threw`, errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  if (width === 1280) await p.screenshot({ path: '/tmp/claude-0/shop-basket.png' });
  await ctx.close();
}
await b.close();
console.log(out.join('\n'));
process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0);
