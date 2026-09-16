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
 *   4. Total = goods − discount + shipping.
 *
 * Step two is the one that is easy to get wrong. A percentage taken off the
 * total *including* shipping means a 20% code quietly pays a fifth of the
 * courier as well, which is a discount nobody agreed to give. And free-over-X
 * is measured against what the buyer actually pays for goods — otherwise a
 * £60 basket with a 50% code still ships free against a £50 threshold it no
 * longer meets.
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

export interface Totals {
  goodsCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
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
export function rateFor(rates: ShippingRate[], country: string): ShippingRate | null {
  const iso = country.trim().toUpperCase();
  const live = rates.filter(r => r.status === 'active');

  const named = live
    .filter(r => r.countries.split(',').map(c => c.trim().toUpperCase()).filter(Boolean).includes(iso))
    .sort((a, b) => a.position - b.position);
  if (named.length) return named[0];

  const anywhere = live
    .filter(r => !r.countries.trim())
    .sort((a, b) => a.position - b.position);
  return anywhere[0] ?? null;
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

  return {
    goodsCents,
    discountCents,
    shippingCents,
    totalCents: payableGoods + shippingCents,
    shippingLabel: rate?.name ?? '',
    discountCode,
    discountProblem: problem,
  };
}
