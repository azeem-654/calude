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
  taxOn, taxRateFor,
  type Discount, type ShippingRate, type TaxRate,
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
const tax = (over: Partial<TaxRate> = {}): TaxRate => ({
  id: 't1', name: 'VAT', countries: 'GB', percentBp: 2000, status: 'active', position: 0, ...over,
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


/* ── Tax: included is bookkeeping, excluded is a charge ── */
{
  /* The case that decides whether a UK shop can use this at all. £120 on the
     shelf is £120 at the till, of which £20 is VAT. If the total moves, every
     buyer has been overcharged by the rate and the page still looks right. */
  const inc = priceBasket({
    lines: [{ name: 'a', qty: 1, priceCents: 12000 }],
    discount: null, codeTyped: '', rates: [], country: 'GB',
    taxRates: [tax()], pricesIncludeTax: true,
  });
  ok('an inclusive price does not move the total', inc.totalCents === 12000, String(inc.totalCents));
  ok('and the VAT inside £120 at 20% is £20', inc.taxCents === 2000, String(inc.taxCents));
  ok('the net plus the tax adds back to exactly the shelf price',
    (inc.totalCents - inc.taxCents) + inc.taxCents === 12000);
  ok('an inclusive receipt says it is inclusive', inc.taxIncluded === true);
  ok('and names the tax so a receipt can print it', inc.taxLabel === 'VAT', inc.taxLabel);

  const exc = priceBasket({
    lines: [{ name: 'a', qty: 1, priceCents: 10000 }],
    discount: null, codeTyped: '', rates: [], country: 'GB',
    taxRates: [tax()], pricesIncludeTax: false,
  });
  ok('an exclusive price adds the tax on top', exc.totalCents === 12000, String(exc.totalCents));
  ok('and the tax on £100 at 20% is £20', exc.taxCents === 2000, String(exc.taxCents));
  ok('the two modes are not the same sum',
    inc.totalCents !== exc.totalCents || inc.goodsCents !== exc.goodsCents);

  /* Applying the rate to the gross instead of deriving it would give £24 here
     — the tax on the tax — and a VAT return £4 out on every order. */
  ok('inclusive tax is derived from the gross, not applied to it',
    taxOn(tax(), 12000, true) === 2000 && taxOn(tax(), 12000, false) === 2400,
    `${taxOn(tax(), 12000, true)} / ${taxOn(tax(), 12000, false)}`);
}

/* ── Tax follows the delivery and the discount ── */
{
  const t = priceBasket({
    lines: [{ name: 'a', qty: 1, priceCents: 10000 }],
    discount: null, codeTyped: '',
    rates: [rate({ amountCents: 1000 })], country: 'GB',
    taxRates: [tax()], pricesIncludeTax: false,
  });
  ok('the carriage takes the rate of what is carried',
    t.taxCents === 2200, String(t.taxCents));

  const d = priceBasket({
    lines: [{ name: 'a', qty: 1, priceCents: 10000 }],
    discount: code({ value: 50 }), codeTyped: 'HALF',
    rates: [], country: 'GB',
    taxRates: [tax()], pricesIncludeTax: false,
  });
  ok('a discount reduces the tax with the price', d.taxCents === 1000, String(d.taxCents));
}

/* ── Which tax rate, and when there is none ── */
{
  const rates = [
    tax({ id: 'gb', name: 'VAT', countries: 'GB', percentBp: 2000, position: 1 }),
    tax({ id: 'ny', name: 'Sales tax', countries: 'US', percentBp: 888, position: 2 }),
  ];
  ok('a country with a rate gets it', taxRateFor(rates, 'US')?.id === 'ny', taxRateFor(rates, 'US')?.id);
  ok('a country with no rate and no catch-all is untaxed', taxRateFor(rates, 'JP') === null);

  /* 8.875% is why the column is basis points. Rounded to 888bp on storage, it
     is still 8.88% of $100 — a whole-percent column could only say 9%. */
  ok('a fractional rate is expressible', taxOn(tax({ percentBp: 888 }), 10000, false) === 888,
    String(taxOn(tax({ percentBp: 888 }), 10000, false)));

  const none = priceBasket({
    lines: [{ name: 'a', qty: 1, priceCents: 5000 }],
    discount: null, codeTyped: '', rates: [], country: 'JP',
    taxRates: rates, pricesIncludeTax: true,
  });
  ok('a shop that has set no rate for a country charges no tax rather than guessing',
    none.taxCents === 0 && none.totalCents === 5000, JSON.stringify(none));
  ok('and does not name a tax it did not charge', none.taxLabel === '', none.taxLabel);

  ok('a shop with no tax rates at all is unaffected',
    priceBasket({ lines: [{ name: 'a', qty: 1, priceCents: 5000 }], discount: null,
      codeTyped: '', rates: [], country: 'GB' }).totalCents === 5000);
  ok('a zero rate is not a tax line', taxOn(tax({ percentBp: 0 }), 10000, false) === 0);
  ok('a switched-off rate is never chosen', taxRateFor([tax({ status: 'off' })], 'GB') === null);
}

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
if (failed) process.exit(1);
