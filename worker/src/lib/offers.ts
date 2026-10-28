/**
 * The services sold by conversation — not by checkout — and what each costs.
 *
 * Three offers, kept apart on purpose:
 *
 *   - the **growth service** for HVAC and roofing contractors: a one-time
 *     setup fee, a monthly fee, and a performance fee on *eligible, attributed
 *     collections* — money a customer actually received for a job the service
 *     brought in, under that customer's own agreement. Never their whole
 *     turnover, never a quote or a won-job value;
 *   - **medical billing / RCM** (published 2026-10-28 at the owner's
 *     instruction, subject to legal and compliance review): the same setup and
 *     monthly figures, and a percentage of *eligible net collections on claims
 *     handled under the signed agreement*. It is its own constant with its own
 *     basis, exclusions and terms — it does not inherit the trade offer, whose
 *     "qualifying job" attribution means nothing for a practice's claims;
 *   - **e-commerce business setup and growth management**: a flat monthly fee
 *     for a written scope of managed work, with no performance fee and every
 *     platform, ad and inventory cost the client's own.
 *
 * The software plans (Growth / Scale / Custom) are a fourth thing and live in
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
  /** The home page's heading, sub-heading and paragraph about the service. */
  headline: string;
  subhead: string;
  summary: string;
  /** What each of the three figures is, said the same way on every page. */
  labels: { setup: string; monthly: string; performance: string };
  /** The two disclosures every page that quotes the price carries, word for word. */
  costDisclosure: string;
  feeDisclosure: string;
  /** The worked example's eligible collected amount; the fee is computed by feeOn, never typed. */
  exampleCents: number;
  /** Paid by the customer, never part of our fees. */
  separate: { title: string; body: string }[];
  /** What the service covers, by the delivery that exists. */
  includes: string[];
  /** What stays the contractor's job unless a contract says otherwise. */
  contractorDuties: string[];
  /** The service's limits are agreed in writing, not unlimited. */
  limits: string;
  /** What one month's fee covers, item by item — the written terms quote this list. */
  monthlyScope: string[];
  /** Explicit in every customer agreement — the site says they will be. */
  agreementTerms: string[];
  /**
   * The fixed numbers of the written terms (/growth-service-terms). Chosen to
   * protect the operator without being terms a contractor would refuse or a
   * court would strike: each is the common middle of what service agreements
   * like this use, not the most aggressive end. The agreement screen and the
   * terms page read them from here, so the two cannot disagree.
   */
  rules: {
    /** Days from first contact to the job being won for it still to count. */
    attributionDays: number;
    /** Days the contractor has to flag a lead as an existing customer after it is recorded (or until it is won, if later). */
    existingCustomerDays: number;
    /** How far back a contact must appear in the contractor's records to count as an existing customer, in months. */
    existingLookbackMonths: number;
    /** Days to record a payment received from a qualifying job. */
    reportDays: number;
    /** Days to query a statement line before it is accepted. */
    queryDays: number;
    /** Days an invoice is payable in. */
    paymentDays: number;
    /** Monthly interest on overdue invoices, in basis points (100 = 1%), or the legal maximum if lower. */
    lateBpsMonthly: number;
    /** Minimum term from the start date, in months. */
    minimumMonths: number;
    /** Written notice to end after the minimum term, in days. */
    noticeDays: number;
    /** Our total liability is capped at the fees paid in this many months before a claim. */
    liabilityMonths: number;
    /** Years the contractor keeps job and payment records. */
    recordYears: number;
  };
}

export interface MedicalBillingOffer {
  id: 'medical_billing';
  name: string;
  currency: 'USD';
  setupCents: number;
  monthlyCents: number;
  /** Basis points of eligible net collections on claims handled under the agreement: 500 = 5%. */
  collectionsBps: number;
  labels: { setup: string; monthly: string; collections: string };
  /** What the percentage is taken of, in plain words. */
  feeBasis: string;
  /** What is never counted. */
  excluded: string[];
  /** How the eligible amount is worked out, step by step — the statement follows this order. */
  calculation: string[];
  /** Paid by the practice, never part of our fees. */
  separate: string[];
  /** How billing works. */
  billing: string[];
  /** Said beside every quote of the price. */
  review: string;
  /** The worked example's eligible net collections; the fee is computed by feeOn. */
  exampleCents: number;
}

/**
 * E-commerce Business Setup & Growth Management — a managed service at one
 * monthly price. No performance fee, no quotas: what a month covers is agreed
 * in a written scope, because catalogue size, channels and ad accounts differ
 * too much between stores for one list to be honest.
 */
export interface ManagedServiceOffer {
  id: 'ecommerce_management';
  name: string;
  currency: 'USD';
  monthlyCents: number;
  /** What the monthly fee is for, in one sentence. */
  feeBasis: string;
  /** Paid by the client, never part of our fee unless a signed agreement says otherwise. */
  separate: string[];
  /** What a written scope settles before the first month. */
  scopeCovers: string[];
  /** What stays the client's. */
  clientDuties: string[];
  /** Said wherever the price is. */
  noGuarantee: string;
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
  headline: 'Turn More Leads Into Paying Customers',
  subhead: 'Your business growth system, with pricing aligned to measurable results.',
  summary: 'Protected Central helps businesses generate and qualify leads through agreed marketing campaigns and prospect outreach, manage opportunities, track quotations, and measure results from initial inquiry through completed job and collected payment.',
  labels: {
    setup: 'One-time setup fee',
    monthly: 'Recurring platform and agreed service fee',
    performance: 'Performance fee on eligible revenue collected from qualifying jobs',
  },
  costDisclosure: 'You are responsible for your advertising budget and any approved third-party expenses. These costs are not included in the setup fee or the monthly fee.',
  feeDisclosure: 'The performance fee applies only to eligible collections from qualifying jobs attributable to Protected Central, according to your agreement. It does not apply automatically to your entire business revenue, existing unrelated customers, unaccepted quotations, or amounts that have not been collected.',
  exampleCents: 600_000,
  separate: [
    { title: 'Advertising budget', body: 'Paid by you, straight to the ad platform, and set by you. It is never part of our fees and we never mark it up.' },
    { title: 'Approved third-party charges', body: 'Services you approve in advance — an SMS provider, a call-tracking number, a directory listing — are billed to you by that provider at their price.' },
  ],
  /* The approved scope, in the owner's words. The pages say beside the list
     that it is subject to the service scope actually agreed. */
  includes: [
    'Business-specific CRM and pipeline setup',
    'Lead capture and source tracking',
    'Agreed marketing and prospect outreach workflows',
    'Lead qualification and handoff',
    'Quote and opportunity tracking',
    'Completed-job and payment tracking',
    'Lead-to-revenue reporting',
    'Performance-fee calculations based on qualifying collected revenue',
  ],
  contractorDuties: [
    'Preparing and approving quotes and estimates',
    'Agreeing the work with the customer and doing the job',
    'Confirming the job is complete and issuing the final invoice',
    'Confirming what was paid, and when',
  ],
  limits: 'Each month includes up to 3 hours of service-team time and up to 2 active campaigns; anything more is quoted in writing and starts only once you approve it. The service does not include unlimited advertising, unlimited calling, custom development or unlimited manual work.',
  /* Small on purpose: $87 a month buys a few hours of people's time, and an
     open-ended "we'll handle your marketing" is the promise that costs the
     operator money on every customer. More is sold, never absorbed. */
  monthlyScope: [
    'Up to 3 hours of service-team time a month — campaign changes, lead follow-up, outbound calls and reporting combined. Unused hours do not carry over',
    'Up to 2 active campaigns or outreach workflows at a time',
    'Outbound calls made by people, within those hours, only to numbers that pass the do-not-call, consent and calling-hour checks, on scripts you have approved',
    'Your CRM, pipeline, lead capture and lead-to-revenue ledger kept running',
    'One lead-to-revenue report and one fee statement a month',
  ],
  agreementTerms: [
    'How long after first contact a job still counts (the attribution window)',
    'Whether taxes, permits, materials passed through at cost or discounts are excluded',
    'How refunds, cancellations, chargebacks and disputed payments reduce the fee',
    'That existing customers and work from your other sources are excluded',
    'When fees are calculated, reviewed with you and invoiced',
  ],
  rules: {
    attributionDays: 180,
    existingCustomerDays: 14,
    existingLookbackMonths: 24,
    reportDays: 10,
    queryDays: 10,
    paymentDays: 15,
    lateBpsMonthly: 100,
    minimumMonths: 3,
    noticeDays: 30,
    liabilityMonths: 3,
    recordYears: 2,
  },
};

/** Where the written terms are published, on every host that speaks as Protected Central. */
export const GROWTH_TERMS_PATH = '/growth-service-terms';

export const MEDICAL_BILLING_OFFER: MedicalBillingOffer = {
  id: 'medical_billing',
  name: 'Medical billing and revenue-cycle management',
  currency: 'USD',
  setupCents: 30_000,
  monthlyCents: 8_700,
  collectionsBps: 500,
  labels: {
    setup: 'One-time practice setup fee',
    monthly: 'Recurring platform and billing-service fee',
    collections: 'Of eligible net collections on claims we handle under your signed agreement',
  },
  feeBasis: 'Payer payments actually received on claims we submitted or worked under your signed agreement, after refunds, recoupments, take-backs and any other amounts your agreement excludes. It is not a percentage of your practice’s total revenue, and not of collections on claims we did not handle.',
  excluded: [
    'Claims we did not prepare, submit or work under the agreement',
    'Patient payments, co-pays and self-pay balances, unless your agreement includes them',
    'Payments received before the agreement started, and balances it excludes',
    'Amounts billed but not yet paid, and expected or estimated payments',
    'Refunds, recoupments, overpayment take-backs and chargebacks — deducted when they happen',
  ],
  calculation: [
    'Start from payer payments posted from remittances on claims handled under the agreement in the month',
    'Take off refunds, recoupments and take-backs on those claims in the same month',
    'Leave out anything your agreement excludes',
    'Apply the agreed percentage to what remains — the eligible net collections',
    'Send you the statement with every claim and payment behind it, for review before it is invoiced',
  ],
  separate: [
    'Clearinghouse, practice-management and EHR subscriptions',
    'Payer enrollment or credentialing fees charged by third parties',
    'Any third-party service you approve in advance',
  ],
  billing: [
    'The setup fee is invoiced when the agreement is signed',
    'The monthly fee is invoiced each month in advance',
    'The collections percentage is invoiced monthly in arrears, after you have reviewed the statement',
    'Nothing is charged to a card automatically',
  ],
  review: 'Published pricing, subject to legal and compliance review and to the terms of your signed agreement and business associate agreement. Percentage-of-collections billing is regulated in some states and some payer contracts; where it is not permitted, we agree a different basis with you in writing.',
  exampleCents: 2_000_000,
};

export const ECOMMERCE_OFFER: ManagedServiceOffer = {
  id: 'ecommerce_management',
  name: 'E-commerce Business Setup & Growth Management',
  currency: 'USD',
  monthlyCents: 220_000,
  feeBasis: 'The monthly fee pays for the managed-service work in your written scope — setting up and running your store and marketplace accounts, advertising management, and your Protected Central CRM and marketing automation. It is not a share of your sales.',
  separate: [
    'Advertising spend, paid by you straight to each ad platform',
    'Inventory and product purchasing',
    'Marketplace commissions, referral and selling fees',
    'Shipping, fulfilment and payment-processing fees',
    'Paid themes, apps, subscriptions and other third-party services',
  ],
  scopeCovers: [
    'Which platforms and marketplaces are in scope, and the access you give us to each',
    'How many products and listings we set up and maintain each month',
    'Which advertising channels we manage, and the monthly ad budget you set',
    'How many email and SMS campaigns and automations we build and run',
    'How much social and blog content we prepare, and who approves it',
    'Customer-support and ticket handling: hours, channels and what is escalated to you',
    'The monthly report: what it measures and when you receive it',
  ],
  clientDuties: [
    'Owning your seller, store and ad accounts, and keeping them in good standing',
    'Giving us the access each platform allows, and approving payment methods yourself',
    'Supplying products, inventory, pricing, images and accurate product information',
    'Fulfilment and shipping, unless your scope says otherwise',
    'Approving campaigns, ad budgets and content before they go out',
    'Keeping to each marketplace’s rules and the laws that apply to your products',
  ],
  noGuarantee: 'We do not guarantee revenue, sales volume, return on ad spend, profit or how soon a store becomes profitable. Marketplaces decide seller approval, listing approval and ad eligibility.',
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

/** The medical offer in one line: "$300 setup + $87/month + 5% of eligible net collections". */
export function medicalLine(o: MedicalBillingOffer = MEDICAL_BILLING_OFFER): string {
  return `${dollars(o.setupCents)} setup + ${dollars(o.monthlyCents)}/month + ${percent(o.collectionsBps)} of eligible net collections`;
}

/** The medical worked example, its fee computed rather than typed. */
export function medicalExample(o: MedicalBillingOffer = MEDICAL_BILLING_OFFER): string {
  return `For example, if payers paid ${dollars(o.exampleCents)} in a month on claims handled under your agreement and nothing was refunded or excluded, the collections fee at ${percent(o.collectionsBps)} would be ${dollars(feeOn(o.exampleCents, o.collectionsBps))}. Payments on claims we did not handle add nothing.`;
}

/** "$2,200/month". */
export function ecommerceLine(o: ManagedServiceOffer = ECOMMERCE_OFFER): string {
  return `${dollars(o.monthlyCents)}/month`;
}

/** The offer in one line, the same on every page: "$300 setup + $87/month + 5% performance fee". */
export function growthLine(o: GrowthOffer = TRADE_GROWTH_OFFER): string {
  return `${dollars(o.setupCents)} setup + ${dollars(o.monthlyCents)}/month + ${percent(o.performanceBps)} performance fee`;
}

/** The worked example in one sentence, its fee computed rather than typed. */
export function growthExample(o: GrowthOffer = TRADE_GROWTH_OFFER): string {
  return `For example, if a qualifying job generates ${dollars(o.exampleCents)} in eligible collected revenue, the illustrative performance fee at ${percent(o.performanceBps)} is ${dollars(feeOn(o.exampleCents, o.performanceBps))}, subject to the agreed calculation rules.`;
}

/**
 * The performance fee on an amount of net eligible collections, in cents.
 *
 * Rounded half-up to the cent, once, on the total for a period — never per
 * payment and summed, which drifts by a cent per line. $6,000 at 500 bps is
 * $300; $3,000 is $150.
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
      a: `${o.feeDisclosure} ${growthExample(o)} If only part of that job has been collected so far, the fee so far is ${percent(o.performanceBps)} of the part collected, and the rest follows as you are paid.`,
    },
    {
      q: 'Is the advertising budget included?',
      a: `No. ${o.costDisclosure} You set and pay your advertising budget directly to the ad platform, and approved third-party services bill you directly.`,
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
