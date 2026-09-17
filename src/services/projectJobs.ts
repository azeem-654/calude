/**
 * The problem somebody arrived with, and what that implies.
 *
 * ── Why this asks about a problem and not a feature ──
 *
 * The wizard once opened on six capabilities — "Find people worth contacting",
 * "Write and send the emails", "Text them as well" — and asked a plumber to
 * tick the right ones. That is the *implementation* asking to be configured.
 *
 * It then opened on the job: "Win new customers", "Get more from the customers
 * you have". Better, but still the language of a marketing department. Nobody
 * wakes up having decided to Win New Customers. They wake up because they were
 * under a sink until seven and the phone did not ring, or because they sent
 * four hundred emails last month and got two replies, or because they spend
 * every evening answering "are you free Tuesday?" one message at a time.
 *
 * So each option below opens with the situation, in the words somebody would
 * use about their own week. `label` is the complaint. `blurb` names who says
 * it. The job is still there — it is what `caps` are derived from — but it is
 * the answer rather than the question.
 *
 * ── `alsoKnownAs` ──
 *
 * The things people type into a search box when they have this problem:
 * "automatic appointment booking", "cold email that doesn't go to spam". It is
 * shown under the option because somebody scanning five cards for the words
 * they already have in their head will find them faster than they will read
 * five paragraphs — and because a product that never uses the customer's own
 * vocabulary feels like it was built for somebody else.
 *
 * ── Why each one carries a fortnight ──
 *
 * `firstFortnight` is the teaching part, and it is the reason this file is
 * data rather than a switch statement. Somebody choosing between five abstract
 * options is guessing; somebody reading "week one it writes the emails and
 * shows them to you, week two it starts sending the approved ones" is making a
 * decision. It is also a promise, so it says what actually happens — including
 * that the first send waits for them.
 *
 * ── `advanced` ──
 *
 * The six switches are not gone, they are the last option. Somebody who knows
 * exactly what they want should not have to pick a problem that approximates
 * it, and a product that hides its own model from the people who understand it
 * reads as condescending.
 */
import { ALL_CAPABILITIES, CAPABILITIES, type Capability } from './projects';

export interface Job {
  id: string;
  /** The situation, in the words somebody would use about their own week. */
  label: string;
  /** Who says it. Named trades, so somebody recognises themselves in one line. */
  blurb: string;
  /**
   * What somebody with this problem types into a search box.
   *
   * Their vocabulary, not ours — "automatic appointment booking" rather than
   * "calendar integration". Somebody scanning for words they already have in
   * their head finds them faster than they read five paragraphs.
   */
  alsoKnownAs: string[];
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
    label: 'The work is good but the phone has gone quiet',
    blurb: 'A plumber, an electrician, a builder, a cleaner — out on jobs all day, with nobody doing the finding. You are booked this week and you have no idea about next month.',
    alsoKnownAs: ['get more leads', 'find new clients', 'cold email that lands', 'lead generation on autopilot'],
    caps: ['find', 'email', 'content', 'book'],
    firstFortnight: [
      'Builds a list of businesses that fit, from their trade and where they are.',
      'Writes a first email and two follow-ups from the client\u2019s own profile — and shows you all three before anything sends.',
      'Puts up a page for the offer, so the email has somewhere to point.',
      'Turns a reply into a slot in the diary instead of an email chain.',
    ],
    notFor: 'A list you already have — "You are sitting on a list you never contact" does that without the searching.',
  },
  {
    id: 'existing-customers',
    label: 'You are sitting on a list you never contact',
    blurb: 'Hundreds of past customers, quotes that went cold, enquiries from two years ago. Everybody says "you should email them" and nobody has the evening free to write it.',
    alsoKnownAs: ['email my old customers', 're-engage past clients', 'follow up on old quotes', 'win back lapsed customers'],
    caps: ['email', 'content', 'book'],
    firstFortnight: [
      'Reads the contacts already in the workspace — it does not go looking for more.',
      'Writes a reason to get back in touch that is not "just checking in".',
      'Sends to a small group first, and waits for you before the rest.',
      'Books whoever replies.',
    ],
    notFor: 'An empty contact list. Start with "The work is good but the phone has gone quiet" and come back to this.',
  },
  {
    id: 'poor-results',
    label: 'You are already sending and barely anyone replies',
    blurb: 'You bought a tool, you send the emails, and the open rate is embarrassing. Usually it is one address sending too much, no follow-up, and a template that reads like a template.',
    alsoKnownAs: ['low reply rate', 'emails going to spam', 'improve open rates', 'email warm-up and deliverability'],
    caps: ['email', 'content', 'book'],
    firstFortnight: [
      'Spreads the sending across several addresses instead of hammering one, which is the usual reason mail stops arriving.',
      'Warms them up slowly before volume goes anywhere near them.',
      'Rewrites the sequence from the client\u2019s own profile, and shows you all of it before a single send.',
      'Follows up more than once, because almost nobody answers the first one.',
    ],
    notFor: 'Having nobody to write to yet. Sort the list first.',
  },
  {
    id: 'diary',
    label: 'You lose half your evening booking people in',
    blurb: 'A trainer, a tutor, a clinic, a consultant. The enquiries come in and every one turns into six messages about whether Tuesday works.',
    alsoKnownAs: ['automatic appointment booking', 'online booking page', 'stop the back and forth', 'appointment reminders'],
    caps: ['email', 'book', 'content'],
    firstFortnight: [
      'Puts up a booking page with your real availability on it, so "are you free Tuesday?" answers itself.',
      'Answers an enquiry and offers the times, rather than leaving it in your inbox until nine.',
      'Reminds people before the appointment, which is what stops the no-shows.',
      'Follows up with whoever went quiet without you having to remember them.',
    ],
    notFor: 'Work that is quoted rather than booked — a roof is not a 40-minute slot.',
  },
  {
    id: 'launch',
    label: 'You have something new and nobody knows yet',
    blurb: 'A new service, a second location, a course, a listing. The people most likely to say yes are the ones who already know you, and they have not been told.',
    alsoKnownAs: ['launch announcement', 'promote a new service', 'new product marketing', 'tell my customers first'],
    caps: ['find', 'email', 'content', 'book'],
    firstFortnight: [
      'Writes the page the launch points at, before anything is sent.',
      'Tells the existing customers first, because they are the ones most likely to say yes.',
      'Then goes looking for people who fit the new thing specifically.',
      'Keeps the two lists apart, so the second email does not land on somebody who already bought.',
    ],
    notFor: 'Steady ongoing demand — the first two are better at the long game.',
  },
  {
    id: 'shop',
    label: 'You want to sell it online without building a shop',
    blurb: 'You make or resell something and the whole thing stalls at "I need a website with a checkout". Plus the baskets people abandon and the thank-yous nobody sends.',
    alsoKnownAs: ['sell products online', 'online store with checkout', 'abandoned cart emails', 'accept card payments'],
    caps: ['shop', 'email', 'content'],
    firstFortnight: [
      'Puts the products on a page a stranger can buy from, with no login.',
      'Chases the orders that stall at the checkout.',
      'Thanks the people who bought, once, rather than every tick.',
      'Writes the product copy and the posts that point at it.',
    ],
    notFor: 'Services and quoted work. Those are the first option — there is nothing to add to a basket.',
  },
  {
    id: 'be-found',
    label: 'Nobody finds you when they go looking',
    blurb: 'An estate agent, a clinic, an accountant, a school. People in your area search for exactly what you do, and what they find is somebody else.',
    alsoKnownAs: ['show up on Google', 'SEO for small business', 'content marketing', 'blog posts that rank'],
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
  label: 'I know exactly what I want it to do',
  blurb: 'The six things it can do, switched on one at a time. No guessing on our part.',
  alsoKnownAs: [],
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
