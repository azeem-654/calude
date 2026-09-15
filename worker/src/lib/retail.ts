/**
 * What the customer pays, and the wall wholesale never gets past.
 *
 * ── The one rule ──
 *
 * A `Quote` is the only shape allowed to leave the Worker on a customer's
 * behalf, and it has no field for cost. That is the enforcement: not a
 * convention that every route has to remember, but a type that cannot express
 * the mistake. Cost is carried separately in `Costed`, which the setup engine
 * uses to write the owner's ledger and which no route ever serialises.
 *
 * ── Why prices are copied onto an order ──
 *
 * The operator can change a markup at any moment, and somebody is always
 * halfway through a checkout when they do. A quote is therefore frozen onto the
 * order at the moment of payment; the price list decides what a *new* quote
 * says and never what an agreed one costs.
 */
import { nowIso, type Env } from './db';
import type { Money } from './registrars';

/** One line a customer sees. No cost, by construction. */
export interface QuoteLine {
  /** domain | email | hosting | crm | content */
  kind: string;
  label: string;
  /** Charged once a year, or every month. */
  period: 'year' | 'month' | 'once';
  quantity: number;
  unitCents: number;
  totalCents: number;
}

export interface Quote {
  lines: QuoteLine[];
  /** Everything billed yearly — today's payment. */
  dueTodayCents: number;
  /** Everything billed monthly, from next month. */
  monthlyCents: number;
  currency: string;
}

/** The same quote, plus what it costs us. Never serialised to a browser. */
export interface Costed {
  quote: Quote;
  wholesaleCents: number;
}

export interface PriceRow {
  kind: string;
  code: string;
  retailCents: number;
  currency: string;
  markupPct: number;
  label: string;
}

/**
 * The currency the whole app quotes in.
 *
 * One currency rather than each provider's own: a basket adding a euro domain
 * to a dollar mailbox has no honest total, and converting at an exchange rate
 * we do not have would invent one. The operator prices in this and the provider
 * charges them in whatever it likes.
 */
export const RETAIL_CURRENCY = 'USD';

export async function loadPrices(env: Env): Promise<PriceRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT kind, code, retail_cents AS retailCents, currency, markup_pct AS markupPct, label
     FROM crm_retail_prices ORDER BY kind, code`,
  ).all<PriceRow>();
  return results ?? [];
}

export async function savePrice(
  env: Env, kind: string, code: string, patch: { retailCents?: number; markupPct?: number; label?: string },
): Promise<{ ok: boolean; error: string }> {
  const k = kind.trim().toLowerCase();
  const c = code.trim().toLowerCase().replace(/^\./, '');
  if (k !== 'domain' && k !== 'service') return { ok: false, error: 'A price is either for a domain extension or for a service.' };
  if (!/^[a-z0-9.-]{1,32}$/.test(c)) return { ok: false, error: 'That is not an extension or service this can price.' };

  /*
   * Rejected, not coerced.
   *
   * This used to be `Math.round(patch.retailCents ?? 0)`, and `Number("abc")`
   * is NaN, and `Math.round(NaN)` clamps to 0. So a price that arrived as
   * anything non-numeric silently *wiped* the one that was configured, and the
   * screen said "saved". Zero is a legitimate price — the content engine ships
   * at it — so it cannot be used as the sentinel for "nothing sensible
   * arrived"; the only honest check is whether the number is a number.
   */
  const rawRetail = patch.retailCents;
  const rawMarkup = patch.markupPct;
  if (rawRetail !== undefined && !Number.isFinite(rawRetail)) {
    return { ok: false, error: 'That is not a price. Enter an amount in numbers.' };
  }
  if (rawMarkup !== undefined && !Number.isFinite(rawMarkup)) {
    return { ok: false, error: 'That is not a percentage. Enter a number.' };
  }

  /* Clamped rather than trusted. A negative price is a refund on every sale and
     a markup in the thousands is a typo somebody would only find in a support
     ticket. */
  const retail = Math.min(Math.max(Math.round(rawRetail ?? 0), 0), 10_000_00);
  const markup = Math.min(Math.max(Math.round(rawMarkup ?? 100), 0), 1000);

  await env.DB.prepare(
    `INSERT INTO crm_retail_prices (kind, code, retail_cents, currency, markup_pct, label, updated_at)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(kind, code) DO UPDATE SET
       retail_cents = excluded.retail_cents, markup_pct = excluded.markup_pct,
       label = excluded.label, updated_at = excluded.updated_at`,
  ).bind(k, c, retail, RETAIL_CURRENCY, markup, (patch.label ?? '').slice(0, 120), nowIso()).run();
  return { ok: true, error: '' };
}

/** The extension of a domain, as the price list codes it. `co.uk` → `co.uk`. */
export const extensionOf = (domain: string): string => {
  const dot = domain.indexOf('.');
  return dot === -1 ? '' : domain.slice(dot + 1).toLowerCase();
};

/**
 * What one domain sells for.
 *
 * Two ways round, in this order:
 *
 * 1. A price the operator typed for that extension. Always wins — a number
 *    somebody chose beats a number a formula produced.
 * 2. A markup on what the provider quoted. This is the fallback for the long
 *    tail: there are over a thousand extensions and nobody is going to price
 *    them one at a time, but a `.plumbing` somebody searches for still has to
 *    have a price rather than being quietly unavailable.
 *
 * When neither is possible — no typed price and the provider did not quote —
 * the answer is null, and the caller must say the domain cannot be priced right
 * now rather than showing a zero somebody would try to pay.
 */
export function retailForDomain(
  prices: PriceRow[], domain: string, cost: Money | null, premium: boolean,
): number | null {
  const ext = extensionOf(domain);
  const row = prices.find(p => p.kind === 'domain' && p.code === ext);

  /*
   * A premium domain is never sold at the list price.
   *
   * Premiums cost tens to thousands rather than the usual few pounds, and the
   * flat `.com` price would sell a five-thousand-dollar name for nineteen. They
   * are priced from cost or not at all.
   */
  if (premium) {
    if (!cost) return null;
    const pct = row?.markupPct ?? 100;
    return Math.round(cost.cents * (1 + pct / 100));
  }

  if (row && row.retailCents > 0) return row.retailCents;
  if (cost) return Math.round(cost.cents * (1 + (row?.markupPct ?? 100) / 100));
  return null;
}

export function serviceRow(prices: PriceRow[], code: string): PriceRow | null {
  return prices.find(p => p.kind === 'service' && p.code === code) ?? null;
}

export interface BasketInput {
  domain: string;
  domainCost: Money | null;
  domainPremium: boolean;
  /** How many business mailboxes. Zero means none. */
  mailboxes: number;
  hosting: boolean;
  crm: boolean;
}

/**
 * Turn a basket into the two numbers a checkout page needs.
 *
 * Split into "due today" and "then monthly" because a single blended figure is
 * the thing customers dispute: a domain is a yearly charge and a mailbox is a
 * monthly one, and adding them produces a number that is true of no month.
 */
export function quoteBasket(prices: PriceRow[], input: BasketInput): Costed | null {
  const lines: QuoteLine[] = [];
  let wholesale = 0;

  const domainRetail = retailForDomain(prices, input.domain, input.domainCost, input.domainPremium);
  if (domainRetail === null) return null;
  wholesale += input.domainCost?.cents ?? 0;
  lines.push({
    kind: 'domain',
    label: `${input.domain} — registered for one year`,
    period: 'year',
    quantity: 1,
    unitCents: domainRetail,
    totalCents: domainRetail,
  });

  const email = serviceRow(prices, 'email');
  const boxes = Math.min(Math.max(Math.round(input.mailboxes) || 0, 0), 20);
  if (boxes > 0 && email) {
    lines.push({
      kind: 'email',
      label: `Business email — ${boxes} ${boxes === 1 ? 'mailbox' : 'mailboxes'}`,
      period: 'month',
      quantity: boxes,
      unitCents: email.retailCents,
      totalCents: email.retailCents * boxes,
    });
  }

  const hosting = serviceRow(prices, 'hosting');
  if (input.hosting && hosting) {
    lines.push({
      kind: 'hosting', label: 'Website hosting', period: 'month',
      quantity: 1, unitCents: hosting.retailCents, totalCents: hosting.retailCents,
    });
  }

  const crm = serviceRow(prices, 'crm');
  if (input.crm && crm) {
    lines.push({
      kind: 'crm', label: 'CRM workspace', period: 'month',
      quantity: 1, unitCents: crm.retailCents, totalCents: crm.retailCents,
    });
  }

  /*
   * The content engine is on every basket, at whatever the operator priced it —
   * zero by default, and shown anyway.
   *
   * A line reading "included" is worth more than a line that is absent: it is
   * the thing the whole product is for, and leaving it off the receipt makes
   * the purchase look like a domain with extras rather than a marketing system
   * with a domain attached.
   */
  const content = serviceRow(prices, 'content');
  if (content) {
    lines.push({
      kind: 'content', label: 'AI Autopilot Content Engine', period: 'month',
      quantity: 1, unitCents: content.retailCents, totalCents: content.retailCents,
    });
  }

  const dueToday = lines.filter(l => l.period !== 'month').reduce((n, l) => n + l.totalCents, 0);
  const monthly = lines.filter(l => l.period === 'month').reduce((n, l) => n + l.totalCents, 0);

  return {
    quote: { lines, dueTodayCents: dueToday, monthlyCents: monthly, currency: RETAIL_CURRENCY },
    wholesaleCents: wholesale,
  };
}
