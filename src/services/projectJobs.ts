/**
 * What somebody is actually trying to do, and what that implies.
 *
 * ── Why this replaces six switches ──
 *
 * The wizard used to open on six capabilities — "Find people worth
 * contacting", "Write and send the emails", "Text them as well" — and ask a
 * plumber to tick the right ones. That is the *implementation* asking to be
 * configured. Nobody arrives at a marketing tool having decided they want
 * capability three and five; they arrive because the phone is not ringing, or
 * because they are launching something, or because they have four hundred old
 * customers and no reason to email them.
 *
 * So the first question is the job. Capabilities are derived from it, which is
 * the same direction `kindFor` already works in: the server's contract is
 * computed from the answer rather than being the question.
 *
 * ── Why each one carries a fortnight ──
 *
 * `firstFortnight` is the teaching part, and it is the reason this file is
 * data rather than a switch statement. Somebody choosing between six abstract
 * options is guessing; somebody reading "week one it writes the emails and
 * shows them to you, week two it starts sending the approved ones" is making a
 * decision. It is also a promise, so it says what actually happens — including
 * that the first send waits for them.
 *
 * ── `advanced` ──
 *
 * The six switches are not gone, they are the last option. Somebody who knows
 * exactly what they want should not have to pick a job that approximates it,
 * and a product that hides its own model from the people who understand it
 * reads as condescending.
 */
import { ALL_CAPABILITIES, CAPABILITIES, type Capability } from './projects';

export interface Job {
  id: string;
  /** What they would say they are trying to do, in their words. */
  label: string;
  /** One line under it. Concrete, not a benefit statement. */
  blurb: string;
  /** Derived, never asked. */
  caps: Capability[];
  /** The teaching part: what the first two weeks look like if they pick this. */
  firstFortnight: string[];
  /** When this is the wrong choice. Saying so is what makes the rest credible. */
  notFor: string;
}

export const JOBS: Job[] = [
  {
    id: 'new-customers',
    label: 'Win new customers',
    blurb: 'Find businesses who plausibly need this, start the conversation, book the call.',
    caps: ['find', 'email', 'content', 'book'],
    firstFortnight: [
      'Builds a list of businesses that fit, from their trade and where they are.',
      'Writes a first email and two follow-ups from the client’s own profile — and shows you all three before anything sends.',
      'Puts up a page for the offer, so the email has somewhere to point.',
      'Turns a reply into a slot in the diary instead of an email chain.',
    ],
    notFor: 'A list you already have — "Get more from the customers you have" does that without the searching.',
  },
  {
    id: 'existing-customers',
    label: 'Get more from the customers you have',
    blurb: 'The people already in your contacts, contacted properly instead of never.',
    caps: ['email', 'content', 'book'],
    firstFortnight: [
      'Reads the contacts already in the workspace — it does not go looking for more.',
      'Writes a reason to get back in touch that is not "just checking in".',
      'Sends to a small group first, and waits for you before the rest.',
      'Books whoever replies.',
    ],
    notFor: 'An empty contact list. Start with "Win new customers" and come back to this.',
  },
  {
    id: 'launch',
    label: 'Launch something new',
    blurb: 'A product, a service or a location — told to the people who should hear it first.',
    caps: ['find', 'email', 'content', 'book'],
    firstFortnight: [
      'Writes the page the launch points at, before anything is sent.',
      'Tells the existing customers first, because they are the ones most likely to say yes.',
      'Then goes looking for people who fit the new thing specifically.',
      'Keeps the two lists apart, so the second email does not land on somebody who already bought.',
    ],
    notFor: 'Steady ongoing demand — the other two are better at the long game.',
  },
  {
    id: 'shop',
    label: 'Sell products online',
    blurb: 'A catalogue and a checkout, plus the chasing and thanking around it.',
    caps: ['shop', 'email', 'content'],
    firstFortnight: [
      'Puts the products on a page a stranger can buy from, with no login.',
      'Chases the orders that stall at the checkout.',
      'Thanks the people who bought, once, rather than every tick.',
      'Writes the product copy and the posts that point at it.',
    ],
    notFor: 'Services and quoted work. Those are "Win new customers" — there is nothing to add to a basket.',
  },
  {
    id: 'be-found',
    label: 'Be found in the first place',
    blurb: 'Pages and posts about the things their customers actually search for.',
    caps: ['content'],
    firstFortnight: [
      'Works out what people search for before they buy this, and writes for that.',
      'Publishes on a schedule rather than in one burst.',
      'Sends nothing to anybody — this one is entirely about being there when they look.',
    ],
    notFor: 'Needing the phone to ring this month. This is the slow one, and it is honest about that.',
  },
];

/** The escape hatch: the six switches, for somebody who already knows. */
export const ADVANCED_JOB: Job = {
  id: 'advanced',
  label: 'Choose it myself',
  blurb: 'The six things it can do, switched on one at a time.',
  caps: [],
  firstFortnight: [],
  notFor: '',
};

export const jobById = (id: string): Job | null =>
  id === ADVANCED_JOB.id ? ADVANCED_JOB : JOBS.find(j => j.id === id) ?? null;

/* ── What a set of capabilities cannot run without ─────────────────────────── */

/*
 * No `ai` here.
 *
 * The operator holds an AI key for the whole install, so writing is something
 * the product supplies rather than something a customer has to go and arrange.
 * A workspace that brings its own still uses it — `loadAiKey` prefers it — but
 * nobody is stopped for the want of one, and so nobody is asked.
 */
export type Requirement = 'mailbox' | 'sms' | 'payments';

export interface RequirementInfo {
  id: Requirement;
  label: string;
  /** Why this job needs it. Not what it is — why *this* cannot start without it. */
  why: string;
  /** Where it gets sorted, when it is not sorted here. */
  settingsTab: string;
}

export const REQUIREMENTS: Record<Requirement, RequirementInfo> = {
  mailbox: {
    id: 'mailbox', label: 'An address to send from',
    why: 'Email goes out through a real mailbox, not ours — so replies come back to you and the sending reputation is yours.',
    settingsTab: 'email-sms',
  },
  sms: {
    id: 'sms', label: 'An SMS provider',
    why: 'Text messages need a number that is licensed to send them where your customers are.',
    settingsTab: 'email-sms',
  },
  payments: {
    id: 'payments', label: 'A way to take money',
    why: 'The shop cannot publish until somebody can pay — a live shop that takes an email address and gives nothing back is worse than no shop.',
    settingsTab: 'billing',
  },
};

/**
 * What a chosen set of capabilities needs before it can do anything.
 *
 * Derived from `CAPABILITIES[].needs`, which is the string already shown on the
 * capability itself — so the wizard and the capability list cannot drift into
 * disagreeing about what is required.
 */
export function requirementsFor(caps: Capability[]): Requirement[] {
  const out = new Set<Requirement>();
  for (const cap of caps) {
    const info = CAPABILITIES.find(c => c.id === cap);
    const needs = info?.needs ?? '';
    if (needs.includes('address to send from')) out.add('mailbox');
    if (needs.includes('SMS')) out.add('sms');
    if (needs.includes('payment')) out.add('payments');
  }
  return [...out];
}

/** Every capability, for the advanced path and for "run the whole thing". */
export const EVERYTHING: Capability[] = ALL_CAPABILITIES;
