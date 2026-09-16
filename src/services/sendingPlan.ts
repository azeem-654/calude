/**
 * How much sending infrastructure a target actually needs, and what it might
 * plausibly return.
 *
 * ── The distinction everything here turns on ──
 *
 * "I want to send 15,000 marketing emails a month" means two completely
 * different jobs depending on who the 15,000 are.
 *
 * To **people who asked to hear from you** — customers, subscribers, past
 * buyers — it is one domain and one sending identity. Volume is not the
 * constraint; the relationship is. Spreading that across nine lookalike domains
 * would actively harm it: the brand people recognise is the one they opened
 * last time.
 *
 * To **strangers**, it is a sending pool. One mailbox sending five hundred cold
 * emails a day is a mailbox that stops being delivered within a week, so the
 * volume is spread thin across many mailboxes on several domains, none of them
 * the real company domain — because a blocked domain you bought for £9 is an
 * inconvenience and a blocked company domain is a business continuity event.
 *
 * Recommending a nine-mailbox pool to somebody emailing their own customer list
 * would be selling them nine things they do not need. So `listKind` is the
 * first thing this function asks, and the industry decides its default.
 *
 * ── Why every outcome is a range ──
 *
 * Because every honest source gives one. Reply rates to cold B2B email are
 * commonly reported between 1% and 5%, with well-targeted campaigns higher; the
 * spread between a good list and a bad one is larger than the spread between a
 * good tool and a bad one. A single number here would be a forecast, and a
 * forecast is the thing this codebase is least allowed to invent.
 *
 * So the ranges are wide, they are labelled as assumptions, and every one of
 * them is adjustable. What the customer gets is arithmetic they can check,
 * not a promise.
 */

export type ListKind = 'cold' | 'owned';

export interface Industry {
  id: string;
  label: string;
  /** What a project here usually is, which decides the default list kind. */
  listKind: ListKind;
  /** Reply rate to a cold approach, low and high, as fractions. */
  replyRate: [number, number];
  /** Of the people who reply, how many are interested rather than "no thanks". */
  positiveShare: [number, number];
  /** Of the interested, how many become a booked conversation. */
  meetingShare: [number, number];
  /** Of the meetings, how many become customers. */
  closeShare: [number, number];
  /** What one closed customer is worth, first order, in whole currency units. */
  dealValue: [number, number];
  /** The plain-English reason this industry is set up the way it is. */
  note: string;
}

/**
 * A small set, chosen because the numbers genuinely differ between them.
 *
 * Adding twenty industries would look thorough and change nothing: what moves
 * these numbers is whether the buyer is a business or a consumer, how
 * considered the purchase is, and what one sale is worth. Six points on that
 * space cover most of what walks in.
 */
export const INDUSTRIES: Industry[] = [
  {
    id: 'local-services', label: 'Trades and local services',
    listKind: 'cold',
    replyRate: [0.03, 0.08], positiveShare: [0.25, 0.4], meetingShare: [0.5, 0.7], closeShare: [0.25, 0.4],
    dealValue: [250, 2000],
    note: 'Local, urgent and not much shopped around — so replies are higher and the gap between reply and job is short.',
  },
  {
    id: 'b2b-services', label: 'Agencies, consultants and B2B services',
    listKind: 'cold',
    replyRate: [0.02, 0.05], positiveShare: [0.2, 0.35], meetingShare: [0.4, 0.6], closeShare: [0.15, 0.25],
    dealValue: [2000, 15000],
    note: 'Fewer replies, much bigger deals, and a longer road between the first email and the signature.',
  },
  {
    id: 'real-estate', label: 'Property and real estate',
    listKind: 'cold',
    replyRate: [0.02, 0.06], positiveShare: [0.2, 0.35], meetingShare: [0.4, 0.6], closeShare: [0.1, 0.2],
    dealValue: [2000, 10000],
    note: 'Timing is everything — most people are simply not moving this month, which is why the follow-up matters more than the first email.',
  },
  {
    id: 'recruitment', label: 'Recruitment and staffing',
    listKind: 'cold',
    replyRate: [0.03, 0.07], positiveShare: [0.2, 0.35], meetingShare: [0.5, 0.7], closeShare: [0.15, 0.3],
    dealValue: [3000, 12000],
    note: 'Two audiences and two inboxes: the company with the vacancy and the person who might fill it.',
  },
  {
    id: 'saas', label: 'Software and SaaS',
    listKind: 'cold',
    replyRate: [0.01, 0.04], positiveShare: [0.2, 0.3], meetingShare: [0.4, 0.6], closeShare: [0.1, 0.2],
    dealValue: [1000, 8000],
    note: 'The most emailed inboxes on earth. Volume alone does nothing here — the list and the first line do the work.',
  },
  {
    id: 'ecommerce', label: 'Online shop',
    listKind: 'owned',
    replyRate: [0.0, 0.0], positiveShare: [0, 0], meetingShare: [0, 0], closeShare: [0.01, 0.04],
    dealValue: [30, 150],
    note: 'Cold email is the wrong tool for a shop. The money is in the people who already bought — abandoned baskets, post-purchase and win-backs.',
  },
];

export const industryById = (id: string): Industry | null =>
  INDUSTRIES.find(i => i.id === id) ?? null;

/* ── What it takes to send that much ───────────────────────────────────────── */

export interface PlanInput {
  emailsPerMonth: number;
  listKind: ListKind;
  /** Per mailbox, per sending day. Conservative for cold; ignored for owned. */
  perMailboxPerDay: number;
  mailboxesPerDomain: number;
  /** Weekdays only, which is what everybody actually does. */
  sendingDaysPerMonth: number;
}

export const DEFAULTS: Omit<PlanInput, 'emailsPerMonth' | 'listKind'> = {
  /*
   * Ten a day, per mailbox.
   *
   * Deliberately below what a warmed mailbox can carry. The number that gets
   * people blocked is not the monthly total, it is the daily rate from one
   * address — and the cost of going slightly too slow is a few more mailboxes,
   * while the cost of going too fast is a domain nobody can send from again.
   */
  perMailboxPerDay: 10,
  /*
   * Three mailboxes per domain.
   *
   * Not a technical limit — it is risk spreading. A domain that gets filtered
   * takes every mailbox on it down at once, so three means losing a ninth of
   * the pool rather than half of it.
   */
  mailboxesPerDomain: 3,
  sendingDaysPerMonth: 22,
};

export interface Infrastructure {
  mailboxes: number;
  domains: number;
  /** What the pool can carry a month, which is usually a little over target. */
  capacityPerMonth: number;
  emailsPerDay: number;
  /** Days of ramping before the pool runs at full rate. */
  warmupDays: number;
  /** Set when the maths was overruled by a floor or a ceiling. */
  note: string;
}

const clampInt = (n: number, lo: number, hi: number) =>
  Math.min(Math.max(Math.round(Number.isFinite(n) ? n : lo), lo), hi);

/**
 * Turn a monthly target into mailboxes and domains.
 *
 * Owned lists get one of each whatever the volume: the answer to "how do I send
 * more to my own customers" is never "buy more domains".
 */
export function infrastructureFor(input: PlanInput): Infrastructure {
  const perDay = clampInt(input.perMailboxPerDay, 1, 200);
  const perDomain = clampInt(input.mailboxesPerDomain, 1, 10);
  const days = clampInt(input.sendingDaysPerMonth, 1, 31);
  const target = clampInt(input.emailsPerMonth, 0, 5_000_000);

  if (input.listKind === 'owned') {
    return {
      mailboxes: 1, domains: 1,
      capacityPerMonth: target,
      emailsPerDay: Math.ceil(target / days),
      /* A domain that already sends to these people is already trusted. */
      warmupDays: 0,
      note: 'Sending to people who asked to hear from you needs one address on the domain they already recognise — not a pool.',
    };
  }

  const emailsPerDay = Math.ceil(target / days);
  const mailboxes = Math.max(1, Math.ceil(emailsPerDay / perDay));
  const domains = Math.max(1, Math.ceil(mailboxes / perDomain));

  return {
    mailboxes,
    domains,
    /* What the pool can actually carry, which is the honest number — rounding
       mailboxes up means capacity is usually a little above target. */
    capacityPerMonth: mailboxes * perDay * days,
    emailsPerDay,
    /*
     * Three weeks before full rate, and it is not optional.
     *
     * A brand-new domain sending at full volume on day one is the single most
     * reliable way to be filtered. The ramp is why the first month produces
     * less than the maths above, and saying so here stops that being a
     * disappointment later.
     */
    warmupDays: 21,
    note: '',
  };
}

/* ── What it might return ──────────────────────────────────────────────────── */

export interface Range { low: number; high: number }

export interface Projection {
  sent: number;
  delivered: Range;
  replies: Range;
  interested: Range;
  meetings: Range;
  customers: Range;
  revenue: Range;
  /** True when the industry does not work this way, so the funnel is skipped. */
  funnelApplies: boolean;
}

const r = (low: number, high: number): Range => ({ low: Math.floor(low), high: Math.floor(high) });

/**
 * The funnel, as a range at every stage.
 *
 * ── Why delivery is not 100% ──
 *
 * Because it never is. Even a well-warmed pool loses a few per cent to dead
 * addresses and filtering, and a projection that starts from "all of them
 * arrive" is wrong before it does any other arithmetic.
 */
export function project(industry: Industry, sentPerMonth: number): Projection {
  const sent = Math.max(0, Math.round(sentPerMonth));
  const delivered = r(sent * 0.93, sent * 0.98);

  if (industry.listKind === 'owned') {
    /* A shop's list does not reply, it buys. One stage, not five. */
    const customers = r(delivered.low * industry.closeShare[0], delivered.high * industry.closeShare[1]);
    return {
      sent, delivered,
      replies: r(0, 0), interested: r(0, 0), meetings: r(0, 0),
      customers,
      revenue: r(customers.low * industry.dealValue[0], customers.high * industry.dealValue[1]),
      funnelApplies: false,
    };
  }

  const replies = r(delivered.low * industry.replyRate[0], delivered.high * industry.replyRate[1]);
  const interested = r(replies.low * industry.positiveShare[0], replies.high * industry.positiveShare[1]);
  const meetings = r(interested.low * industry.meetingShare[0], interested.high * industry.meetingShare[1]);
  const customers = r(meetings.low * industry.closeShare[0], meetings.high * industry.closeShare[1]);
  const revenue = r(customers.low * industry.dealValue[0], customers.high * industry.dealValue[1]);

  return { sent, delivered, replies, interested, meetings, customers, revenue, funnelApplies: true };
}

/* ── The package somebody is actually offered ──────────────────────────────── */

export interface StarterPackage {
  domains: number;
  mailboxesPerDomain: number;
  mailboxes: number;
  emailsPerMonth: number;
  perMailboxPerDay: number;
}

/**
 * Where a beginner starts, when they have no number in mind.
 *
 * Three domains and nine mailboxes: enough to be a real campaign rather than a
 * trickle, small enough that a first month which does not work has cost the
 * price of three domains. At ten a day over twenty-two days that is just under
 * two thousand emails a month, which is a genuine test of a message — a few
 * hundred is not.
 */
export const BEGINNER: StarterPackage = {
  domains: 3,
  mailboxesPerDomain: 3,
  mailboxes: 9,
  perMailboxPerDay: DEFAULTS.perMailboxPerDay,
  emailsPerMonth: 9 * DEFAULTS.perMailboxPerDay * DEFAULTS.sendingDaysPerMonth,
};

/** The same shape, built backwards from a volume somebody named. */
export function packageFor(emailsPerMonth: number, listKind: ListKind, opts?: Partial<PlanInput>): StarterPackage {
  const input: PlanInput = {
    emailsPerMonth, listKind,
    perMailboxPerDay: opts?.perMailboxPerDay ?? DEFAULTS.perMailboxPerDay,
    mailboxesPerDomain: opts?.mailboxesPerDomain ?? DEFAULTS.mailboxesPerDomain,
    sendingDaysPerMonth: opts?.sendingDaysPerMonth ?? DEFAULTS.sendingDaysPerMonth,
  };
  const infra = infrastructureFor(input);
  return {
    domains: infra.domains,
    mailboxesPerDomain: input.mailboxesPerDomain,
    mailboxes: infra.mailboxes,
    perMailboxPerDay: input.perMailboxPerDay,
    emailsPerMonth: infra.capacityPerMonth,
  };
}

/** What a pool of this size can carry, for a stepper that edits the pool directly. */
export function capacityOf(pkg: StarterPackage, sendingDays = DEFAULTS.sendingDaysPerMonth): number {
  return pkg.domains * pkg.mailboxesPerDomain * pkg.perMailboxPerDay * sendingDays;
}
