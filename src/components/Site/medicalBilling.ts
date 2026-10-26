/**
 * What the medical billing microsite says — protectedcentral.com/medical-billing.
 *
 * A different business from the trade sites, written separately: a
 * professional revenue-cycle service for medical practices, priced only after
 * an assessment (lib/offers.ts → MEDICAL_BILLING_OFFER, which has no figure).
 *
 * What it must never say, because nothing supports it: a recovery amount, a
 * denial rate, a collection percentage, a customer, a testimonial, a payer
 * partnership, a certification, "HIPAA compliant" or "HIPAA certified" (there
 * is no such certification), or a live clearinghouse / EHR / payer connection.
 * `npm run test:industry` fails on percentages, multipliers and those words.
 */
import type { ReactNode } from 'react';
import {
  FileX, FileWarning, Scale, Hourglass, CalendarClock, ShieldQuestion, ClipboardList, Eye, Banknote, SearchCheck,
  Stethoscope, Users, Building2, Activity, Sparkles, HeartPulse, ListChecks, Gavel, Wallet, Lock, KeyRound,
  FileSearch, Handshake, Database, UserCheck,
} from 'lucide-react';
import type { MicrositeConfig } from './micrositeContext';

type Icon = (p: { size?: number }) => ReactNode;

export const MEDICAL_SITE: MicrositeConfig = {
  id: 'medical-billing',
  root: '/medical-billing',
  tag: 'Medical Billing',
  nav: [
    { href: '#audit', label: 'Audit' },
    { href: '#claims', label: 'Claims' },
    { href: '#ar', label: 'Payments & A/R' },
    { href: '#reporting', label: 'Reporting' },
    { href: '#security', label: 'Security' },
    { href: '#process', label: 'Process' },
    { href: '#pricing', label: 'Pricing' },
    { href: '#faq', label: 'FAQ' },
  ],
  bookLabel: 'Book a Medical Billing Assessment',
  bookShort: 'Book an assessment',
  writeHref: '#request',
  writeLabel: 'Request an assessment in writing',
  footerLine: 'Medical billing and revenue-cycle management for outpatient practices.',
  signIn: false,
};

export const MED_HERO = {
  eyebrow: 'Medical billing and revenue-cycle management',
  lead: 'Every claim followed',
  emph: 'through to payment',
  sub: 'A billing team and an RCM workspace for medical practices: claims tracked from charge to payment, rejections and denials worked to an outcome, remittances reconciled, A/R followed up before deadlines pass — and a report that shows what was done and what is still open.',
};

export const MED_AUDIENCE: { icon: Icon; label: string }[] = [
  { icon: Stethoscope, label: 'Independent physicians' },
  { icon: Users, label: 'Multi-provider practices' },
  { icon: Activity, label: 'Physical therapy and rehabilitation' },
  { icon: Sparkles, label: 'Medical spas' },
  { icon: HeartPulse, label: 'Dermatology' },
  { icon: Building2, label: 'Other outpatient practices' },
];

export const MED_PROBLEMS: { icon: Icon; title: string; body: string }[] = [
  { icon: FileX, title: 'Claims never sent, or never resolved', body: 'Encounters with no claim behind them, and claims submitted once and never followed to an answer.' },
  { icon: FileWarning, title: 'Rejections and denials', body: 'Clearinghouse rejections that sit uncorrected, and payer denials with no appeal before the window closes.' },
  { icon: Scale, title: 'Underpayments and unmatched payments', body: 'Payments below what your contract says, and deposits nobody has matched to a claim.' },
  { icon: Hourglass, title: 'A/R getting older', body: 'Balances drifting past 60, 90 and 120 days because nobody owns the follow-up.' },
  { icon: CalendarClock, title: 'Filing and appeal deadlines', body: 'Timely-filing and appeal limits that differ by payer and are tracked, if at all, in somebody’s head.' },
  { icon: ShieldQuestion, title: 'Eligibility and prior authorization', body: 'Services delivered before coverage or an authorization was confirmed, then denied for it.' },
  { icon: ClipboardList, title: 'Manual follow-up', body: 'Payer calls, portal checks and resubmissions done by hand between everything else.' },
  { icon: Eye, title: 'No view of claims or cash', body: 'No single place that says what was billed, what was paid, what is pending and why.' },
  { icon: Banknote, title: 'Reports that do not reconcile', body: 'Practice-management reports and payer remittances that never quite agree.' },
  { icon: SearchCheck, title: 'Leakage you cannot see', body: 'Charges that were never captured, and small adjustments that add up unnoticed.' },
];

export const MED_AUDIT = {
  lead: 'Start with a revenue-leakage audit,',
  emph: 'built on evidence.',
  body: 'Before anything changes, we compare what your records say happened with what was billed, answered and paid. Every finding names the records it rests on and how sure it is — and nothing is called a missed claim until we have checked that the source data is complete.',
  checks: [
    'Encounters with no matching claim',
    'Claims prepared but never submitted',
    'Clearinghouse rejections left unresolved',
    'Denials with no documented follow-up',
    'Claims close to their timely-filing limit',
    'Payments below the expected amount, where your contract data allows the comparison',
    'Remittances with no matching claim, and claims with no remittance',
    'Duplicate or inconsistent records',
    'Eligibility or authorization gaps, where that data is available',
    'Unresolved balances and unusual adjustments',
  ],
  kinds: [
    { title: 'Confirmed unpaid', body: 'A balance the records show is owed and unpaid.' },
    { title: 'Potential recovery', body: 'Likely recoverable, pending payer review or more information.' },
    { title: 'Estimated exposure', body: 'An estimate, shown with how it was calculated and what it assumes.' },
    { title: 'Recovered', body: 'Only money that has actually arrived. Counted once, never twice across findings.' },
  ],
};

export const MED_CLAIMS = {
  lead: 'Claims and denials,',
  emph: 'worked to an outcome.',
  body: 'Each claim moves through stated statuses — and “accepted by the clearinghouse” is never mistaken for “paid by the payer”.',
  statuses: ['Charge captured', 'Ready for review', 'Submitted', 'Clearinghouse accepted', 'Rejected', 'Pending payer', 'Paid', 'Partially paid', 'Denied', 'Appeal or correction', 'Closed'],
  features: [
    { icon: ListChecks, title: 'One work queue', body: 'Filter by payer, provider, value, age, status and deadline; every claim has an owner and a next action.' },
    { icon: Gavel, title: 'Denials and appeals', body: 'Each denial classified, its root cause written down, its correction or appeal tracked to the outcome and any amount recovered.' },
    { icon: CalendarClock, title: 'Deadlines in view', body: 'Filing and appeal dates per claim, with alerts before they pass — only where the payer’s rule is known.' },
  ],
};

export const MED_AR = {
  lead: 'Payments and A/R,',
  emph: 'reconciled line by line.',
  body: 'Remittances are matched to claims and to the payments you record. What does not match becomes an exception somebody owns, not a number that quietly disappears.',
  features: [
    { icon: Wallet, title: 'Remittance matching', body: 'Payer remittance data imported and matched to claims; duplicates detected before they count twice.' },
    { icon: Hourglass, title: 'A/R aging you can check', body: 'Balances by age bucket, with the rule stated: counted from the date of service unless agreed otherwise.' },
    { icon: FileSearch, title: 'Follow-up lists', body: 'Denied balances, claims pending a payer answer, unmatched payments and claims with no recent activity.' },
  ],
};

export const MED_REPORTING = {
  lead: 'Reporting that says',
  emph: 'how each number was counted.',
  body: 'A practice portal shows claims submitted, rejected, denied, pending and paid; billed amounts and recorded payments; A/R and its aging; denial reasons; deadlines; amounts under review and amounts recovered — each with its definition, its source and when that source was last updated.',
  points: [
    'Every rate states its denominator and the period it covers',
    'Sources that are not connected are named, so a partial report never looks complete',
    'Work done this period, open issues and anything waiting on your practice',
    'Our internal working notes stay internal; the portal shows what is meant for you',
  ],
};

export const MED_SOFTWARE = {
  lead: 'The RCM workspace',
  emph: 'our billing team works in.',
  body: 'Practices, providers and payers; a claims workbench; denial and appeal tracking; the leakage audit; remittance reconciliation; eligibility and prior-authorization tracking; and a coding review queue. Kept apart from any marketing or CRM data, and from every other practice.',
  points: [
    { icon: Database, title: 'Imports first', body: 'Claims, encounters and remittances arrive as validated file imports from your systems. Standard electronic transactions are planned as each connection is set up and tested — none is live until it is.' },
    { icon: UserCheck, title: 'People decide', body: 'Software can classify and summarise. Coding changes, resubmissions, appeals and write-offs are decided by qualified, authorized people.' },
    { icon: ListChecks, title: 'Everything recorded', body: 'Who changed what, and when, on every claim and finding.' },
  ],
};

export const MED_SECURITY = {
  lead: 'Patient data handled',
  emph: 'as little and as carefully as possible.',
  body: 'We do not start handling protected health information until a business associate agreement is signed and the safeguards for your account have been reviewed with you.',
  points: [
    { icon: Lock, title: 'Minimum necessary', body: 'Claims carry a patient reference, not a full chart. We ask only for the data the work needs.' },
    { icon: KeyRound, title: 'Access by role', body: 'Practice users see their own practice only; billing staff see what they are assigned. Access is checked on the server.' },
    { icon: FileSearch, title: 'Audit trail', body: 'Access to and changes of sensitive records are logged.' },
    { icon: Handshake, title: 'Agreements first', body: 'A BAA and a review of each service that would touch the data come before any patient data does.' },
  ],
  note: 'We do not describe ourselves as “HIPAA certified” — no such certification exists — and security is something we review with you, not a badge.',
};

export const MED_PROCESS: { title: string; body: string }[] = [
  { title: '1. Assessment call', body: 'Specialties, payers, providers, locations, claim volume, your current workflow and any backlog.' },
  { title: '2. Proposal and agreement', body: 'The services in scope, the price, the reporting, and a business associate agreement.' },
  { title: '3. Access set up', body: 'Least-privilege access to the systems and reports we need, named per person on our side.' },
  { title: '4. Data and baseline', body: 'Your claims, remittance and A/R exports imported and checked for completeness.' },
  { title: '5. Leakage audit', body: 'Findings with their evidence and confidence, prioritised with you.' },
  { title: '6. Ongoing billing', body: 'The work queue, denials, reconciliation and follow-up, with a regular report and review.' },
];

export const MED_FAQ: { q: string; a: string }[] = [
  { q: 'Which specialties do you work with?', a: 'Independent and multi-provider outpatient practices — physicians, physical therapy and rehabilitation, dermatology, medical spas and others. Coding, payer and documentation rules differ by specialty and payer, so we confirm during the assessment whether we can support yours well.' },
  { q: 'Do you guarantee a recovery amount or a lower denial rate?', a: 'No. The audit says what the evidence shows, how confident each finding is, and what was actually recovered once payers answer. We do not promise amounts or rates.' },
  { q: 'Are you HIPAA compliant?', a: 'There is no official HIPAA certification, and we do not claim one. We sign a business associate agreement before handling any patient data, use minimum-necessary data, restrict and log access, and review the safeguards for your account with you before we start.' },
  { q: 'Will you change our codes?', a: 'Not on our own. Missing information and inconsistencies are flagged in a review queue; coding decisions are made by qualified, authorized people, and consequential changes are confirmed with your practice.' },
  { q: 'Do you connect to our EHR, practice-management system or clearinghouse?', a: 'We start with validated exports and reports from your systems. A live connection to a clearinghouse, EHR or payer is set up only after it is configured and tested with authorized access — we will tell you which, if any, are live for your practice.' },
  { q: 'How is it priced?', a: 'After an assessment of your specialty, payer mix, providers and locations, claim volume, backlog, the services you need, integrations and reporting. There is no standard percentage or monthly price, and our HVAC and roofing pricing does not apply.' },
  { q: 'What do you need from us to start?', a: 'An assessment call, a signed agreement and BAA, the access we agree, and recent exports of claims, remittances and A/R. We tell you exactly which reports during the assessment.' },
];

/** The microsite's mark in its eyebrow. */
export const MED_SITE_ICON: Icon = Stethoscope;
