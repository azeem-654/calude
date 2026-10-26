/**
 * The services sold by conversation — not by checkout — and what each costs.
 *
 * Two offers, kept apart on purpose:
 *
 *   - the **growth service** for HVAC and roofing contractors: a one-time
 *     setup fee, a monthly fee, and a performance fee on *eligible, attributed
 *     collections* — money a customer actually received for a job the service
 *     brought in, under that customer's own agreement. Never their whole
 *     turnover, never a quote or a won-job value;
 *   - **medical billing / RCM**, priced only after an assessment. It has no
 *     figure here because none is approved, and it must never inherit the
 *     trade offer's percentage — contingency pricing on healthcare collections
 *     needs its own legal review.
 *
 * The software plans (Starter / Growth / Pro) are a third thing and live in
 * allowances.ts; nothing here is charged by checkout. Every page, the
 * structured data a search engine reads, and (from phase 2) the defaults of a
 * new customer agreement read these constants, so the site cannot quote a
 * number the agreement does not hold.
 *
 * Pure and import-free: the browser's build compiles it too.
 */

export interface GrowthOffer {
  id: 'trade_growth';
  name: string;
  /** Which microsites sell it. */
  industries: ('hvac' | 'roofing')[];
  currency: 'USD';
  setupCents: number;
  monthlyCents: number;
  /** Basis points of net eligible collections: 500 = 5%. Integers, so a fee is never a float. */
  performanceBps: number;
  /** What the percentage is taken of, in one sentence a customer can hold us to. */
  feeBasis: string;
  /** Paid by the customer, never part of our fees. */
  separate: { title: string; body: string }[];
  /** What the service covers, by the delivery that exists. */
  includes: string[];
  /** What stays the contractor's job unless a contract says otherwise. */
  contractorDuties: string[];
  /** The service's limits are agreed in writing, not unlimited. */
  limits: string;
  /** Explicit in every customer agreement — the site says they will be. */
  agreementTerms: string[];
}

export interface AssessmentOffer {
  id: 'medical_billing';
  name: string;
  pricing: 'assessment';
  /** What the price depends on. */
  factors: string[];
  note: string;
}

export const TRADE_GROWTH_OFFER: GrowthOffer = {
  id: 'trade_growth',
  name: 'Growth service for HVAC and roofing',
  industries: ['hvac', 'roofing'],
  currency: 'USD',
  setupCents: 30_000,
  monthlyCents: 8_700,
  performanceBps: 500,
  feeBasis: 'Payments you actually collect for completed jobs that came from the agreed service, after refunds, credits and any amounts your agreement excludes (such as sales tax). Not your existing customers, not your other work, and not quotes or unpaid invoices.',
  separate: [
    { title: 'Advertising budget', body: 'Paid by you, straight to the ad platform, and set by you. It is never part of our fees and we never mark it up.' },
    { title: 'Approved third-party charges', body: 'Services you approve in advance — an SMS provider, a call-tracking number, a directory listing — are billed to you by that provider at their price.' },
  ],
  includes: [
    'An industry-specific CRM and pipeline, set up for you',
    'Lead capture with the source of every inquiry recorded',
    'Marketing campaign setup or management, within the agreed scope',
    'Prospecting and outbound calling by people, with approved scripts and do-not-call screening, within agreed limits',
    'Lead qualification, and qualified opportunities handed to your team',
    'Quote, estimate and opportunity tracking',
    'Completed-job, invoice and payment tracking that you confirm',
    'Revenue attribution and a monthly performance report',
    'Agreed workflow monitoring and adjustments',
  ],
  contractorDuties: [
    'Preparing and approving quotes and estimates',
    'Agreeing the work with the customer and doing the job',
    'Confirming the job is complete and issuing the final invoice',
    'Confirming what was paid, and when',
  ],
  limits: 'Calls, campaigns and hours each month are agreed in writing before work starts. The service does not include unlimited advertising, unlimited calling, custom development or unlimited manual work.',
  agreementTerms: [
    'How long after first contact a job still counts (the attribution window)',
    'Whether taxes, permits, materials passed through at cost or discounts are excluded',
    'How refunds, cancellations, chargebacks and disputed payments reduce the fee',
    'That existing customers and work from your other sources are excluded',
    'When fees are calculated, reviewed with you and invoiced',
  ],
};

export const MEDICAL_BILLING_OFFER: AssessmentOffer = {
  id: 'medical_billing',
  name: 'Medical billing and revenue-cycle management',
  pricing: 'assessment',
  factors: [
    'Specialty and payer mix',
    'Number of providers and locations',
    'Monthly claim volume',
    'Your current billing workflow and any backlog',
    'Which billing and denial-management services you need',
    'Integrations and onboarding complexity',
    'Reporting and client-support requirements',
  ],
  note: 'We quote after an assessment of your practice. There is no standard percentage or monthly price, and the HVAC and roofing performance fee does not apply to medical billing.',
};

/** "$300", "$87", "$1,250.50" — whole dollars without cents. */
export function dollars(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** "5%", "2.5%". */
export function percent(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}

/** The offer in one line, the same on every page. */
export function growthLine(o: GrowthOffer = TRADE_GROWTH_OFFER): string {
  return `${dollars(o.setupCents)} setup + ${dollars(o.monthlyCents)}/month + ${percent(o.performanceBps)} performance fee on eligible attributed collections`;
}

/**
 * The performance fee on an amount of net eligible collections, in cents.
 *
 * Rounded half-up to the cent, once, on the total for a period — never per
 * payment and summed, which drifts by a cent per line. $8,000 at 500 bps is
 * $400; $3,000 is $150.
 */
export function feeOn(netEligibleCents: number, bps: number): number {
  if (!Number.isFinite(netEligibleCents) || netEligibleCents <= 0 || bps <= 0) return 0;
  return Math.floor((Math.round(netEligibleCents) * Math.round(bps) + 5_000) / 10_000);
}

/** Questions every trade page answers about the price, written from the offer itself. */
export function growthFaq(o: GrowthOffer = TRADE_GROWTH_OFFER): { q: string; a: string }[] {
  const pct = percent(o.performanceBps);
  return [
    {
      q: `What does the ${pct} performance fee apply to?`,
      a: `${o.feeBasis} For example, if an eligible job brings in $8,000 that you collect, the fee is ${dollars(feeOn(800_000, o.performanceBps))}. If you have collected $3,000 of it so far, the fee so far is ${dollars(feeOn(300_000, o.performanceBps))}, and the rest follows as you are paid.`,
    },
    {
      q: 'Is the advertising budget included?',
      a: 'No. You set and pay your advertising budget directly to the ad platform, and approved third-party services bill you directly. Neither is part of our fees.',
    },
    {
      q: 'Do you charge the fee automatically?',
      a: 'No. Each period we show you the jobs and payments behind the fee, you can query any line, and the fee is invoiced only after that review. Nothing is taken from a card without your agreement.',
    },
    {
      q: 'What is in the agreement?',
      a: `Your own written agreement states: ${o.agreementTerms.map(t => t.charAt(0).toLowerCase() + t.slice(1)).join('; ')}. A change to our public prices never changes a signed agreement.`,
    },
  ];
}
