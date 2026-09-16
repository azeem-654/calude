/**
 * The arithmetic that debits a stranger's card.
 *
 * Run with `npm run test:checkout`. No database, no network — every number is
 * passed in, which is the point: the order of operations can be argued with
 * rather than trusted.
 *
 * The cases worth having are the ones where a plausible implementation is
 * wrong and looks right — a percentage that quietly discounts the courier, a
 * free-over threshold measured against the pre-discount total, a fixed code
 * larger than the basket.
 */
import {
  discountAmount, discountProblem, goodsTotal, priceBasket, rateFor, shippingCost,
  type Discount, type ShippingRate,
} from '../src/lib/checkout';

const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);

const code = (over: Partial<Discount> = {}): Discount => ({
  code: 'SAVE10', kind: 'percent', value: 10, minSpendCents: 0,
  startsAt: null, endsAt: null, usageLimit: 0, usedCount: 0, status: 'active', ...over,
});
const rate = (over: Partial<ShippingRate> = {}): ShippingRate => ({
  id: 'r1', name: 'Standard', countries: '', kind: 'flat',
  amountCents: 500, thresholdCents: 0, status: 'active', position: 0, ...over,
});

/* ── Goods ── */
{
  ok('lines add up', goodsTotal([{ name: 'a', qty: 2, priceCents: 1000 }, { name: 'b', qty: 1, priceCents: 250 }]) === 2250);
  ok('a negative quantity cannot credit the basket',
    goodsTotal([{ name: 'a', qty: -3, priceCents: 1000 }]) === 0,
    String(goodsTotal([{ name: 'a', qty: -3, priceCents: 1000 }])));
}

/* ── The discount applies to goods, never to shipping ── */
{
  const t = priceBasket({
    lines: [{ name: 'a', qty: 1, priceCents: 10000 }],
    discount: code({ value: 20 }), codeTyped: 'SAVE10',
    rates: [rate({ amountCents: 1000 })], country: 'GB',
  });
  ok('20% off £100 of goods is £20', t.discountCents === 2000, String(t.discountCents));
  ok('shipping is untouched by the code', t.shippingCents === 1000, String(t.shippingCents));
  ok('the total is goods − discount + shipping', t.totalCents === 10000 - 2000 + 1000, String(t.totalCents));
  ok('and not a fifth off the courier as well', t.totalCents !== Math.round((10000 + 1000) * 0.8),
    'the code would have paid part of the delivery');
}

/* ── Free over a threshold is judged on what is actually paid ── */
{
  const t = priceBasket({
    lines: [{ name: 'a', qty: 1, priceCents: 6000 }],
    discount: code({ kind: 'percent', value: 50 }), codeTyped: 'HALF',
    rates: [rate({ kind: 'free_over', amountCents: 500, thresholdCents: 5000 })],
    country: 'GB',
  });
  ok('a £60 basket halved no longer clears a £50 free-shipping threshold',
    t.shippingCents === 500, `${t.shippingCents}`);
  ok('and the total reflects it', t.totalCents === 3000 + 500, String(t.totalCents));

  const clears = priceBasket({
    lines: [{ name: 'a', qty: 1, priceCents: 12000 }],
    discount: code({ kind: 'percent', value: 50 }), codeTyped: 'HALF',
    rates: [rate({ kind: 'free_over', amountCents: 500, thresholdCents: 5000 })],
    country: 'GB',
  });
  ok('but a £120 basket halved still clears it', clears.shippingCents === 0, String(clears.shippingCents));
}

/* ── A fixed code cannot exceed the basket ── */
{
  const d = code({ kind: 'fixed', value: 2000 });
  ok('a £20 code on a £5 basket takes off £5, not £20', discountAmount(d, 500) === 500, String(discountAmount(d, 500)));
  const t = priceBasket({
    lines: [{ name: 'a', qty: 1, priceCents: 500 }],
    discount: d, codeTyped: 'TWENTY', rates: [], country: 'GB',
  });
  ok('so the total never goes negative', t.totalCents === 0, String(t.totalCents));
}

/* ── Why a code did not apply, rather than a shrug ── */
{
  const goods = 3000;
  ok('an unknown code says so', discountProblem(null, goods) === 'That code was not recognised.');
  ok('an expired one says expired',
    /expired/.test(discountProblem(code({ endsAt: '2020-01-01T00:00:00Z' }), goods)));
  ok('one that has not started says so',
    /not live yet/.test(discountProblem(code({ startsAt: '2999-01-01T00:00:00Z' }), goods)));
  ok('a used-up one says so',
    /fully used/.test(discountProblem(code({ usageLimit: 5, usedCount: 5 }), goods)));
  ok('zero usage limit means unlimited, not exhausted',
    discountProblem(code({ usageLimit: 0, usedCount: 999 }), goods) === '');
  ok('a minimum spend names the number',
    /at least 50\.00/.test(discountProblem(code({ minSpendCents: 5000 }), goods)),
    discountProblem(code({ minSpendCents: 5000 }), goods));
  ok('a disabled code is not usable', /no longer available/.test(discountProblem(code({ status: 'off' }), goods)));

  const t = priceBasket({
    lines: [{ name: 'a', qty: 1, priceCents: 3000 }],
    discount: code({ minSpendCents: 5000 }), codeTyped: 'SAVE10', rates: [], country: 'GB',
  });
  ok('a code that does not apply is reported, not silently dropped',
    t.discountCents === 0 && t.discountProblem.length > 0, JSON.stringify(t));
  ok('and no code typed is not a problem to report',
    priceBasket({ lines: [], discount: null, codeTyped: '', rates: [], country: 'GB' }).discountProblem === '');
}

/* ── Which rate applies ── */
{
  const rates = [
    rate({ id: 'uk', name: 'UK', countries: 'GB', amountCents: 300, position: 1 }),
    rate({ id: 'row', name: 'Rest of world', countries: '', amountCents: 1200, position: 2 }),
    rate({ id: 'off', name: 'Old', countries: 'GB', amountCents: 1, status: 'off', position: 0 }),
  ];
  ok('a named country beats the catch-all', rateFor(rates, 'GB')?.id === 'uk', rateFor(rates, 'GB')?.id);
  ok('a country nobody listed falls to the catch-all', rateFor(rates, 'JP')?.id === 'row', rateFor(rates, 'JP')?.id);
  ok('a switched-off rate is never chosen', rateFor(rates, 'gb')?.id !== 'off');
  ok('the country is matched case-insensitively', rateFor(rates, 'gb')?.id === 'uk');
  ok('a shop with no rates ships free rather than failing',
    shippingCost(rateFor([], 'GB'), 5000) === 0);
}

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
if (failed) process.exit(1);
