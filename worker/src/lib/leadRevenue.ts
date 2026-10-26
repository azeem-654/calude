/**
 * Lead-to-revenue: the rules behind the growth service's performance fee.
 *
 * A contractor's inquiries are followed to the job and the money collected
 * (routes/leadRevenue.ts keeps the ledger in crm_rev_*). This file decides,
 * without touching a database, three things a customer can hold us to:
 *
 *   1. which stages a lead may move between, and who may make the moves that
 *      decide a fee (only the contractor confirms a job complete or a payment
 *      received — the service team that earns the fee cannot);
 *   2. which payments count toward a fee, and why each that does not is held
 *      back or left out — every one is listed, never silently dropped;
 *   3. whether a call may be made: do-not-call, consent, calling hours in the
 *      called person's own zone, and an approved script.
 *
 * Fees are computed in integer cents on the statement's total (`feeOn`, half
 * up once), never per payment. A statement is a proposal until the install
 * owner approves it after the contractor has seen it; nothing here charges
 * anybody.
 *
 * Pure: the browser imports it too, so a screen explains a figure with the
 * same rule that made it. `npm run test:leadrevenue`.
 */
import { feeOn, TRADE_GROWTH_OFFER } from './offers';
import { isZone, utcToWall } from './bookingTime';

/* ── Stages ─────────────────────────────────────────────────────────────── */

export const STAGES = ['inquiry', 'qualified', 'appointment', 'quoted', 'won', 'in_progress', 'completed', 'lost'] as const;
export type Stage = typeof STAGES[number];

/** What each stage means, shown beside every count so nobody reads a quote as money. */
export const STAGE_INFO: Record<Stage, { label: string; means: string }> = {
  inquiry: { label: 'Inquiry', means: 'Somebody got in touch, or answered outreach.' },
  qualified: { label: 'Qualified', means: 'In your area, needs the work and can decide.' },
  appointment: { label: 'Appointment', means: 'A visit, inspection or call is booked.' },
  quoted: { label: 'Quoted', means: 'A quote or estimate was sent. Not money, and never counted toward a fee.' },
  won: { label: 'Job won', means: 'The customer accepted the quote.' },
  in_progress: { label: 'In progress', means: 'The work has started.' },
  completed: { label: 'Completed', means: 'You confirmed the work is done and its final amount.' },
  lost: { label: 'Lost', means: 'Did not go ahead, or the quote was turned down.' },
};

const ORDER: Record<Stage, number> = Object.fromEntries(STAGES.map((s, i) => [s, i])) as Record<Stage, number>;
export const isStage = (v: unknown): v is Stage => typeof v === 'string' && (STAGES as readonly string[]).includes(v);

/**
 * Whether a stage move is allowed with `move`. Completion has its own action
 * (`confirm_completion`, the contractor's alone) and so cannot be reached
 * here; moving back from completed undoes a confirmation and is refused too —
 * money already counted on it stays counted. Going backwards otherwise needs a
 * reason, written to the log.
 */
export function stageMoveProblem(from: Stage, to: Stage, reason: string): string | null {
  if (from === to) return 'The lead is already at that stage.';
  if (to === 'completed') return 'Only the contractor confirms a job complete, with its final amount.';
  if (from === 'completed') return 'A completed job stays completed. Record a refund if money went back.';
  if (to === 'lost' || from === 'lost') return reason.trim().length >= 3 ? null : 'Say why, in a few words.';
  if (ORDER[to] < ORDER[from] && reason.trim().length < 3) return 'Moving a lead back needs a reason, in a few words.';
  if (to === 'in_progress' && ORDER[from] < ORDER.won) return 'Mark the job won before it is in progress.';
  return null;
}

/* ── Sources ────────────────────────────────────────────────────────────── */

/**
 * Where a lead first came from. The first four are the agreed service's own
 * work and are the only ones a fee can ever be taken on; the rest are the
 * contractor's, recorded so the reports are whole.
 */
export const CHANNELS = {
  service_ads: { label: 'Ads run by the service', service: true },
  service_outreach: { label: 'Prospecting and outreach by the service', service: true },
  service_calls: { label: 'Calls made by the service', service: true },
  service_web: { label: 'A page or form the service set up', service: true },
  own_referral: { label: 'Referral to you', service: false },
  own_repeat: { label: 'Your existing customer', service: false },
  own_other: { label: 'Your own marketing or another source', service: false },
} as const;
export type Channel = keyof typeof CHANNELS;
export const isChannel = (v: unknown): v is Channel => typeof v === 'string' && v in CHANNELS;

export const CONSENTS = {
  inquiry: 'They contacted you or asked to be called',
  written: 'Written consent on file',
  registry_checked: 'Business number, checked against the do-not-call registry',
  none: 'No consent recorded',
} as const;
export type Consent = keyof typeof CONSENTS;
export const isConsent = (v: unknown): v is Consent => typeof v === 'string' && v in CONSENTS;

/* ── Terms ──────────────────────────────────────────────────────────────── */

/** Amounts a contractor may leave out of a payment's eligible part. Each agreement names which apply. */
export const EXCLUSION_KINDS = {
  tax: 'Sales tax',
  permits: 'Permit fees',
  materials_at_cost: 'Materials passed through at cost',
  discounts: 'Discounts and credits',
} as const;
export type ExclusionKind = keyof typeof EXCLUSION_KINDS;

export interface Terms {
  currency: string;
  setupCents: number;
  monthlyCents: number;
  performanceBps: number;
  attributionDays: number;
  exclusions: ExclusionKind[];
}

/** The public offer as a starting point, when the owner has written no terms of their own. */
export const DEFAULT_TERMS: Terms = {
  currency: TRADE_GROWTH_OFFER.currency,
  setupCents: TRADE_GROWTH_OFFER.setupCents,
  monthlyCents: TRADE_GROWTH_OFFER.monthlyCents,
  performanceBps: TRADE_GROWTH_OFFER.performanceBps,
  attributionDays: 180,
  exclusions: ['tax', 'permits'],
};

/** Cleans terms from a form; `field` names the box that is wrong. */
export function cleanTerms(v: Record<string, unknown>): { terms?: Terms; error?: string; field?: string } {
  const int = (x: unknown) => (typeof x === 'number' && Number.isInteger(x) ? x : typeof x === 'string' && /^\d+$/.test(x) ? Number(x) : NaN);
  const setup = int(v.setupCents), monthly = int(v.monthlyCents), bps = int(v.performanceBps), days = int(v.attributionDays);
  if (!(setup >= 0 && setup <= 10_000_000)) return { error: 'Enter the setup fee in dollars.', field: 'terms.setup' };
  if (!(monthly >= 0 && monthly <= 10_000_000)) return { error: 'Enter the monthly fee in dollars.', field: 'terms.monthly' };
  if (!(bps >= 0 && bps <= 5_000)) return { error: 'The performance fee is a percentage from 0 to 50.', field: 'terms.bps' };
  if (!(days >= 7 && days <= 730)) return { error: 'The attribution window is between 7 and 730 days.', field: 'terms.days' };
  const ex = Array.isArray(v.exclusions) ? v.exclusions.filter((k): k is ExclusionKind => typeof k === 'string' && k in EXCLUSION_KINDS) : [];
  return { terms: { currency: 'USD', setupCents: setup, monthlyCents: monthly, performanceBps: bps, attributionDays: days, exclusions: [...new Set(ex)] } };
}

/* ── Money ──────────────────────────────────────────────────────────────── */

export const PAYMENT_KINDS = ['payment', 'refund', 'chargeback'] as const;
export type PaymentKind = typeof PAYMENT_KINDS[number];
export const METHODS = ['card', 'bank', 'check', 'cash', 'financing', 'other'] as const;
export type Verification = 'reported' | 'contractor_confirmed' | 'integration_verified';

export const VERIFICATION_INFO: Record<Verification, string> = {
  reported: 'Reported by the service team — waits for your confirmation and is not counted until then',
  contractor_confirmed: 'Confirmed by you',
  integration_verified: 'Verified by a connected payment integration',
};

/** "$1,234.50" from integer cents. */
export function money(cents: number, currency = 'USD'): string {
  const neg = cents < 0;
  const v = Math.abs(cents) / 100;
  const s = v.toLocaleString('en-US', { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 });
  return `${neg ? '−' : ''}${currency === 'USD' ? '$' : `${currency} `}${s}`;
}

/** "1,234.50" or "1234.5" typed in a box → cents; null when it is not an amount. */
export function centsFrom(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
  const s = String(v ?? '').replace(/[$,\s]/g, '');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/* ── Eligibility and statements ─────────────────────────────────────────── */

export interface LeadFacts {
  id: string;
  name: string;
  byService: boolean;
  existingCustomer: boolean;
  agreementId: string | null;
  firstTouchAt: string;
  wonAt: string | null;
  completedAt: string | null;
}

export interface PaymentFacts {
  id: string;
  leadId: string;
  kind: PaymentKind;
  amountCents: number;
  excludedCents: number;
  receivedOn: string;
  verification: Verification;
  confirmedAt: string | null;
  disputed: boolean;
  void: boolean;
  statementId: string | null;
}

export interface AgreementFacts {
  id: string;
  performanceBps: number;
  attributionDays: number;
  startsOn: string;
  endsOn: string | null;
  currency: string;
}

/** Why a payment is not on a statement: `held` will count later, `excluded` never will. */
export type Verdict =
  | { counts: true }
  | { counts: false; held: boolean; why: string };

const DAY = 86_400_000;
const dayOf = (iso: string) => iso.slice(0, 10);

/** Whether a lead's job can ever earn a fee under `a`, and if not, why. */
export function leadVerdict(l: LeadFacts, a: AgreementFacts): Verdict {
  if (l.agreementId !== a.id) return { counts: false, held: false, why: 'The lead came in before this agreement was in force.' };
  if (!l.byService) return { counts: false, held: false, why: 'The lead came from your own source, not the agreed service.' };
  if (l.existingCustomer) return { counts: false, held: false, why: 'Marked as your existing customer.' };
  if (!l.wonAt) return { counts: false, held: true, why: 'The job has not been won yet.' };
  const days = (Date.parse(l.wonAt) - Date.parse(l.firstTouchAt)) / DAY;
  if (days > a.attributionDays) return { counts: false, held: false, why: `Won ${Math.floor(days)} days after first contact — outside the ${a.attributionDays}-day attribution window.` };
  if (!l.completedAt) return { counts: false, held: true, why: 'You have not confirmed the job complete yet.' };
  return { counts: true };
}

/** Whether one payment counts on a statement closing at `periodEnd` (YYYY-MM-DD). */
export function paymentVerdict(p: PaymentFacts, l: LeadFacts | undefined, a: AgreementFacts, periodEnd: string): Verdict {
  if (p.void) return { counts: false, held: false, why: 'Voided.' };
  if (p.statementId) return { counts: false, held: false, why: 'Already counted on an approved statement.' };
  if (!l) return { counts: false, held: false, why: 'The lead is not in this workspace.' };
  const lead = leadVerdict(l, a);
  if (!lead.counts) return lead;
  if (p.verification === 'reported' || !p.confirmedAt) return { counts: false, held: true, why: 'Waiting for your confirmation.' };
  if (dayOf(p.confirmedAt) > periodEnd || p.receivedOn > periodEnd) return { counts: false, held: true, why: 'Confirmed after this statement closes; it goes on the next one.' };
  if (p.disputed) return { counts: false, held: true, why: 'Disputed — held until it is resolved.' };
  if (p.receivedOn < a.startsOn) return { counts: false, held: false, why: 'Received before the agreement started.' };
  if (a.endsOn) {
    const tail = new Date(Date.parse(`${a.endsOn}T00:00:00Z`) + a.attributionDays * DAY).toISOString().slice(0, 10);
    if (p.receivedOn > tail) return { counts: false, held: false, why: 'Received after the agreement ended and its attribution window closed.' };
  }
  return { counts: true };
}

export interface StatementLine {
  paymentId: string;
  leadId: string;
  lead: string;
  kind: PaymentKind;
  receivedOn: string;
  amountCents: number;
  excludedCents: number;
  /** What this line adds to (or, for a refund or chargeback, takes from) net eligible collections. */
  netCents: number;
}

export interface Statement {
  currency: string;
  bps: number;
  lines: StatementLine[];
  notCounted: { paymentId: string; leadId: string; lead: string; kind: PaymentKind; amountCents: number; held: boolean; why: string }[];
  grossCents: number;
  excludedCents: number;
  refundsCents: number;
  carriedCents: number;
  netCents: number;
  feeCents: number;
  /** A negative net is not a fee we owe: it is carried to the next statement. */
  carryOutCents: number;
}

/**
 * One statement: every confirmed, eligible payment not yet on an approved
 * statement, less refunds and chargebacks on eligible jobs and the agreed
 * exclusions, plus any negative balance carried from the last one. The fee is
 * the agreement's rate on a positive net, rounded once.
 */
export function buildStatement(a: AgreementFacts, leads: LeadFacts[], payments: PaymentFacts[], periodEnd: string, carriedCents = 0): Statement {
  const byId = new Map(leads.map(l => [l.id, l]));
  const lines: StatementLine[] = [];
  const notCounted: Statement['notCounted'] = [];
  let gross = 0, excluded = 0, refunds = 0;
  for (const p of [...payments].sort((x, y) => x.receivedOn.localeCompare(y.receivedOn) || x.id.localeCompare(y.id))) {
    const l = byId.get(p.leadId);
    const v = paymentVerdict(p, l, a, periodEnd);
    if (!v.counts) {
      if (!p.void && !p.statementId) notCounted.push({ paymentId: p.id, leadId: p.leadId, lead: l?.name ?? '', kind: p.kind, amountCents: p.amountCents, held: v.held, why: v.why });
      continue;
    }
    const ex = Math.min(p.excludedCents, p.amountCents);
    const part = p.amountCents - ex;
    if (p.kind === 'payment') { gross += p.amountCents; excluded += ex; } else { refunds += part; }
    lines.push({ paymentId: p.id, leadId: p.leadId, lead: l?.name ?? '', kind: p.kind, receivedOn: p.receivedOn, amountCents: p.amountCents, excludedCents: ex, netCents: p.kind === 'payment' ? part : -part });
  }
  const net = gross - excluded - refunds + Math.min(0, carriedCents);
  return {
    currency: a.currency,
    bps: a.performanceBps,
    lines,
    notCounted,
    grossCents: gross,
    excludedCents: excluded,
    refundsCents: refunds,
    carriedCents: Math.min(0, carriedCents),
    netCents: net,
    feeCents: net > 0 ? feeOn(net, a.performanceBps) : 0,
    carryOutCents: net < 0 ? net : 0,
  };
}

/** "2026-10" for a statement closing 2026-10-31. */
export const periodLabel = (periodEnd: string) => periodEnd.slice(0, 7);

/** The last day of the month `date` is in. */
export function monthEnd(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/* ── Calls ──────────────────────────────────────────────────────────────── */

/** Digits only, with a leading US country code dropped, so one number is one key. */
export function phoneKey(v: unknown): string {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
}

/** Local hours calls may be made in, in the called person's zone — the federal window, which some states narrow. */
export const CALL_HOURS = { from: 8 * 60, to: 21 * 60 };

export interface CallCheckInput {
  phone: string;
  timezone: string;
  consent: Consent;
  onDnc: boolean;
  approvedScripts: number;
  atMs: number;
}

export interface CallCheck {
  allowed: boolean;
  checks: { key: 'dnc' | 'consent' | 'hours' | 'script' | 'number'; ok: boolean; says: string }[];
}

/**
 * Whether a person on the service team may call this number now. Every check
 * is reported, passed or not, so the screen shows what was looked at. The
 * national registry is not looked up from here — nothing is connected to it —
 * so a number with no consent must be marked as checked by the caller first.
 */
export function callCheck(i: CallCheckInput): CallCheck {
  const checks: CallCheck['checks'] = [];
  const key = phoneKey(i.phone);
  checks.push({ key: 'number', ok: key.length >= 10 && key.length <= 15, says: key.length >= 10 ? 'A full number.' : 'Not a full phone number.' });
  checks.push({ key: 'dnc', ok: !i.onDnc, says: i.onDnc ? 'On this workspace’s do-not-call list.' : 'Not on this workspace’s do-not-call list.' });
  checks.push({
    key: 'consent', ok: i.consent !== 'none',
    says: i.consent === 'none' ? 'No consent recorded, and the national do-not-call registry is not connected here. Record consent, or that you checked the registry, first.' : CONSENTS[i.consent],
  });
  if (!isZone(i.timezone)) {
    checks.push({ key: 'hours', ok: false, says: 'The person’s time zone is not known, so calling hours cannot be checked.' });
  } else {
    const w = utcToWall(i.atMs, i.timezone);
    const inside = w.minutes >= CALL_HOURS.from && w.minutes < CALL_HOURS.to;
    checks.push({ key: 'hours', ok: inside, says: `It is ${w.time} there (${i.timezone}). Calls are made between 08:00 and 21:00 their time.` });
  }
  checks.push({ key: 'script', ok: i.approvedScripts > 0, says: i.approvedScripts > 0 ? 'A call script is approved.' : 'No call script has been approved by the contractor yet.' });
  return { allowed: checks.every(c => c.ok), checks };
}

export const CALL_OUTCOMES = ['no_answer', 'voicemail', 'spoke', 'callback', 'booked', 'not_interested', 'do_not_call', 'wrong_number'] as const;
export const APPROVAL_KINDS = {
  call_script: 'Call script',
  ad_budget: 'Advertising budget',
  third_party_expense: 'Third-party expense',
  campaign: 'Campaign',
} as const;
export type ApprovalKind = keyof typeof APPROVAL_KINDS;

/* ── Report definitions ─────────────────────────────────────────────────── */

/** Every figure on the dashboard, with the one sentence that defines it. */
export const DEFINITIONS = {
  inquiries: 'Leads first recorded in the period, from any source.',
  fromService: 'Of those, leads whose first contact was the agreed service’s own work.',
  won: 'Jobs whose quote was accepted in the period.',
  quoted: 'The total of quotes and estimates sent. A quote is not money and is never counted toward a fee.',
  completed: 'The final amounts of jobs you confirmed complete.',
  collected: 'Payments you confirmed received, less refunds and chargebacks.',
  eligible: 'Collected on qualifying jobs from the agreed service, less agreed exclusions — what the fee is taken of.',
  feeApproved: 'Performance fees on statements the owner approved after your review.',
  feePending: 'The fee on the open statement, still in draft or under your review.',
} as const;

/** The dashboard's figures over leads first recorded since `since` (ISO), each defined in DEFINITIONS. */
export function summarize(leads: (LeadFacts & { quoteCents: number | null; finalCents: number | null; createdAt: string })[], payments: PaymentFacts[], since: string, a: AgreementFacts | null) {
  const inRange = (iso: string | null) => !!iso && iso >= since;
  const byId = new Map(leads.map(l => [l.id, l]));
  let collected = 0, eligible = 0;
  for (const p of payments) {
    if (p.void || p.verification === 'reported' || !inRange(`${p.receivedOn}T23:59:59Z`)) continue;
    const net = p.amountCents - Math.min(p.excludedCents, p.amountCents);
    collected += p.kind === 'payment' ? p.amountCents : -p.amountCents;
    const l = byId.get(p.leadId);
    if (a && l && !p.disputed && leadVerdict(l, a).counts) eligible += p.kind === 'payment' ? net : -net;
  }
  const recent = leads.filter(l => inRange(l.firstTouchAt));
  return {
    inquiries: recent.length,
    fromService: recent.filter(l => l.byService && !l.existingCustomer).length,
    won: leads.filter(l => inRange(l.wonAt)).length,
    quotedCents: recent.reduce((t, l) => t + (l.quoteCents ?? 0), 0),
    completedCents: leads.filter(l => inRange(l.completedAt)).reduce((t, l) => t + (l.finalCents ?? 0), 0),
    collectedCents: collected,
    eligibleCents: eligible,
  };
}
