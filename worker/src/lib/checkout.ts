/**
 * What a basket costs, in one place.
 *
 * ── Why this is pure, and why that matters more here than anywhere else ──
 *
 * This is the arithmetic that debits a stranger's card. A rounding error in the
 * digest is embarrassing; a rounding error here is somebody charged the wrong
 * amount, and a discount applied to the shipping is a shop that quietly sells
 * below cost until it notices.
 *
 * Nothing in this file reads a database or a request. Every number it works
 * from is passed in — which is what lets `npm run test:checkout` argue with the
 * order of operations rather than trusting a comment about it.
 *
 * ── The order of operations, stated once ──
 *
 *   1. The line items, at the price on the row.
 *   2. The discount, against the *goods* only.
 *   3. Shipping, chosen from the rules, against the discounted goods total.
 *   4. Tax, on the discounted goods *and* the shipping.
 *   5. Total = goods − discount + shipping, plus tax if the prices excluded it.
 *
 * Step two is the one that is easy to get wrong. A percentage taken off the
 * total *including* shipping means a 20% code quietly pays a fifth of the
 * courier as well, which is a discount nobody agreed to give. And free-over-X
 * is measured against what the buyer actually pays for goods — otherwise a
 * £60 basket with a 50% code still ships free against a £50 threshold it no
 * longer meets.
 *
 * Step four is the one that is easy to get *backwards*. Tax is either already
 * inside the listed price or added at the till, and which of the two is a
 * property of the shop, not of the basket. Both produce a plausible-looking
 * receipt, and getting it wrong either overcharges every buyer by the rate or
 * pays the rate out of the margin. It is stated once, on the storefront, and
 * every price passes through here.
 *
 * Tax applies to the delivery as well as the goods. That is the rule in the UK
 * and the EU — the carriage takes the rate of what is being carried — and it is
 * the common case in US states too. A shop where it is not true has a situation
 * this file does not model, which is what the caveat on the screen is for.
 */

export interface Line {
  name: string;
  qty: number;
  priceCents: number;
}

export interface Discount {
  code: string;
  kind: string;          // percent | fixed
  value: number;         // whole percent, or minor units
  minSpendCents: number;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number;
  usedCount: number;
  status: string;
}

export interface ShippingRate {
  id: string;
  name: string;
  countries: string;     // comma-separated ISO codes, '' = everywhere else
  kind: string;          // flat | free_over
  amountCents: number;
  thresholdCents: number;
  status: string;
  position: number;
}

export interface TaxRate {
  id: string;
  name: string;          // what the receipt calls it: VAT, Sales tax, GST
  countries: string;     // comma-separated ISO codes, '' = everywhere else
  /** Hundredths of a percent, so 8.875% is 888 rather than an unrepresentable 8.875. */
  percentBp: number;
  status: string;
  position: number;
}

export interface Totals {
  goodsCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  /** What the receipt calls the tax. Empty when no rate applied. */
  taxLabel: string;
  /**
   * Whether `taxCents` is already inside `totalCents` or was added to it.
   *
   * A receipt has to say which. "Total £120 (includes £20 VAT)" and "Total £120
   * + £20 VAT" are different amounts of money, and the number alone cannot tell
   * them apart.
   */
  taxIncluded: boolean;
  /** The rate that was applied, so a receipt can name it. */
  shippingLabel: string;
  /** Empty when no code was used or it did not apply. */
  discountCode: string;
  /** Why a code did not apply, for the buyer. Empty when it did, or none given. */
  discountProblem: string;
}

const round = (n: number) => Math.max(0, Math.round(n));

export const goodsTotal = (lines: Line[]): number =>
  lines.reduce((n, l) => n + round(l.qty) * round(l.priceCents), 0);

/**
 * Whether a code may be used right now, and why not.
 *
 * Returns the reason rather than a boolean: "that code has expired" and "that
 * code needs £50 of goods" send a buyer to completely different actions, and
 * "invalid code" sends them to neither.
 */
export function discountProblem(d: Discount | null, goodsCents: number, now = new Date()): string {
  if (!d) return 'That code was not recognised.';
  if (d.status !== 'active') return 'That code is no longer available.';

  if (d.startsAt) {
    const from = new Date(d.startsAt);
    if (!Number.isNaN(from.getTime()) && now < from) return 'That code is not live yet.';
  }
  if (d.endsAt) {
    const to = new Date(d.endsAt);
    if (!Number.isNaN(to.getTime()) && now > to) return 'That code has expired.';
  }
  /* Zero means unlimited, which has to be expressible — otherwise a code
     without a limit is a code that has already run out. */
  if (d.usageLimit > 0 && d.usedCount >= d.usageLimit) return 'That code has been fully used.';
  if (d.minSpendCents > 0 && goodsCents < d.minSpendCents) {
    return `That code needs a basket of at least ${(d.minSpendCents / 100).toFixed(2)}.`;
  }
  return '';
}

/** What the code takes off, never more than the goods are worth. */
export function discountAmount(d: Discount, goodsCents: number): number {
  const goods = round(goodsCents);
  if (d.kind === 'fixed') {
    /* Capped at the goods total. A £20 code on a £5 basket takes off £5, not
       £20 — the alternative is a negative total and a refund nobody asked for. */
    return Math.min(round(d.value), goods);
  }
  const pct = Math.min(Math.max(round(d.value), 0), 100);
  return Math.min(Math.round((goods * pct) / 100), goods);
}

/**
 * Which rate applies to a country.
 *
 * A rate naming the country beats the catch-all, so a shop can say "£3 in the
 * UK, £12 everywhere else" in the obvious way. Among equals, the lower
 * `position` wins, because that is the order the shopkeeper arranged them in.
 */
interface Territorial { countries: string; status: string; position: number }

function pickForCountry<T extends Territorial>(rules: T[], country: string): T | null {
  const iso = country.trim().toUpperCase();
  const live = rules.filter(r => r.status === 'active');

  const named = live
    .filter(r => r.countries.split(',').map(c => c.trim().toUpperCase()).filter(Boolean).includes(iso))
    .sort((a, b) => a.position - b.position);
  if (named.length) return named[0];

  const anywhere = live
    .filter(r => !r.countries.trim())
    .sort((a, b) => a.position - b.position);
  return anywhere[0] ?? null;
}

export const rateFor = (rates: ShippingRate[], country: string): ShippingRate | null =>
  pickForCountry(rates, country);

/**
 * Which tax rate applies to a country.
 *
 * Deliberately the same rule as the shipping rates, down to the catch-all — a
 * shopkeeper who has worked out one table has worked out both, and a second
 * matching rule to learn is a second one to get wrong.
 *
 * The catch-all is worth a thought, though: an empty `countries` on a tax rate
 * means "tax everybody at this rate", which is right for a shop selling only at
 * home and wrong for one shipping worldwide. The screen says so, because the
 * data cannot.
 */
export const taxRateFor = (rates: TaxRate[], country: string): TaxRate | null =>
  pickForCountry(rates, country);

/**
 * What the tax comes to on a base, and what the base does in response.
 *
 * Two genuinely different sums:
 *
 *  - **Included** (UK, EU, most of the world's shelf prices). The £120 already
 *    contains the VAT. The tax is `base − base / (1 + r)`, and the total does
 *    not move — the buyer pays exactly the number they were shown. This is
 *    bookkeeping, not a charge.
 *  - **Excluded** (US sales tax, and B2B pricing everywhere). The $100 is the
 *    price and the tax is `base × r` on top, so the total goes up.
 *
 * Returned as a pair rather than folded into the total, because a receipt has
 * to print the tax line either way and the caller needs to know which of the
 * two it is holding.
 */
export function taxOn(rate: TaxRate | null, baseCents: number, pricesIncludeTax: boolean): number {
  if (!rate) return 0;
  const bp = Math.max(0, Math.round(rate.percentBp));
  if (!bp) return 0;
  const base = round(baseCents);
  if (!base) return 0;

  /* 10_000 because percent_bp is hundredths of a percent: 2000bp = 20% = 0.2. */
  if (pricesIncludeTax) {
    /* Derived from the gross rather than applied to the net, so the contained
       tax plus the net always adds back to exactly the price shown. Taking
       `base × r` here would over-state it by the tax on the tax. */
    return base - Math.round((base * 10_000) / (10_000 + bp));
  }
  return Math.round((base * bp) / 10_000);
}

/** What that rate charges on this basket. */
export function shippingCost(rate: ShippingRate | null, payableGoodsCents: number): number {
  if (!rate) return 0;
  if (rate.kind === 'free_over') {
    return payableGoodsCents >= round(rate.thresholdCents) ? 0 : round(rate.amountCents);
  }
  return round(rate.amountCents);
}

/**
 * The whole sum.
 *
 * A code that does not apply is *reported*, not silently dropped: a buyer who
 * typed one and saw the total not move would assume the shop was broken, and
 * a buyer who is told "that code needs £50 of goods" adds another item.
 */
export function priceBasket(input: {
  lines: Line[];
  discount: Discount | null;
  codeTyped: string;
  rates: ShippingRate[];
  country: string;
  /* Optional so every existing caller keeps working untaxed, which is what a
     shop that has set no rates should get — not a crash, and not a guess. */
  taxRates?: TaxRate[];
  pricesIncludeTax?: boolean;
  now?: Date;
}): Totals {
  const goodsCents = goodsTotal(input.lines);

  let discountCents = 0;
  let discountCode = '';
  let problem = '';

  if (input.codeTyped.trim()) {
    problem = discountProblem(input.discount, goodsCents, input.now ?? new Date());
    if (!problem && input.discount) {
      discountCents = discountAmount(input.discount, goodsCents);
      discountCode = input.discount.code;
    }
  }

  /* Shipping is judged on what they actually pay for goods — see the note at
     the top about free-over-X and a half-price basket. */
  const payableGoods = Math.max(0, goodsCents - discountCents);
  const rate = rateFor(input.rates, input.country);
  const shippingCents = shippingCost(rate, payableGoods);

  /* Taxed on what is actually payable, delivery included — see the header. A
     discount reduces the tax with the price, which is the point of a discount. */
  const included = input.pricesIncludeTax !== false;
  const tax = taxRateFor(input.taxRates ?? [], input.country);
  const taxCents = taxOn(tax, payableGoods + shippingCents, included);

  return {
    goodsCents,
    discountCents,
    shippingCents,
    taxCents,
    totalCents: payableGoods + shippingCents + (included ? 0 : taxCents),
    shippingLabel: rate?.name ?? '',
    taxLabel: taxCents > 0 ? (tax?.name ?? '') : '',
    taxIncluded: included,
    discountCode,
    discountProblem: problem,
  };
}
