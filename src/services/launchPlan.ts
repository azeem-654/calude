/**
 * The order things get built in, and it is not the same order for everybody.
 *
 * ── Why this is not one list ──
 *
 * "Set up the domain, write the emails, start sending" is the right first
 * fortnight for an agency chasing new business and completely wrong for a shop.
 * A shop has nothing to send *about* until the catalogue exists and somebody
 * can pay; its most valuable email is the one that goes to a person who left a
 * full basket, and that email cannot be written before there is a basket to
 * leave. Starting a shop with cold outreach is starting at step four.
 *
 * So the build order comes from the trade. Each step names the module it
 * happens in, because a plan that cannot be clicked on is a leaflet.
 *
 * ── Why it is deterministic ──
 *
 * The AI writes the *tasks inside* each stage of the board, and that is the
 * right job for it — those depend on the client, the offer and the objective.
 * This is different: it is the order of operations, it is the same for every
 * plumber, and it is the thing somebody is deciding whether to buy. Generating
 * it would mean the wizard could not show it until a model answered, and would
 * show something slightly different each time. Neither is acceptable for a
 * screen whose job is to say what you are getting.
 *
 * ── It is sent to the server, not recomputed there ──
 *
 * `saveProject` carries these steps and they become the checklist on the
 * project's first card. One source of truth, and the customer's board says
 * exactly what the screen they agreed to said it would.
 */
import type { Capability } from './projects';

export interface LaunchStep {
  /** Imperative, and short enough to be a checklist line. */
  label: string;
  /** Why it is *here* in the order, rather than what it is. */
  why: string;
  /** Where it happens. Empty when Autopilot does it without anybody going anywhere. */
  route: string;
}

interface StepDef extends LaunchStep {
  /** Only include this step when the project may do one of these. */
  needs?: Capability[];
}

/** The steps every project shares, wherever they sit in the order. */
const COMMON: Record<string, StepDef> = {
  sending: {
    label: 'Get the sending addresses working',
    why: 'Nothing else matters until mail arrives. The domains warm up while the rest of this is built, which is why it is first and not last.',
    route: '/settings?tab=email-sms',
  },
  audience: {
    label: 'Build the list to contact',
    why: 'Written from the client profile: who fits, where they are, and what makes them worth an email.',
    route: '/contacts',
    needs: ['find'],
  },
  book: {
    label: 'Put up a booking page',
    why: 'A reply that turns into a slot beats a reply that turns into four more emails.',
    route: '/scheduling',
    needs: ['book'],
  },
  sms: {
    label: 'Add the text messages',
    why: 'For the people who never open email. Added after the email sequence works, so there is something proven to say.',
    route: '/settings?tab=email-sms',
    needs: ['sms'],
  },
};

const ORDERS: Record<string, StepDef[]> = {
  /* ── A shop builds the thing before it talks about it ── */
  ecommerce: [
    {
      label: 'Put the catalogue up',
      why: 'The products come first. Every email below names one of them, and none of them can be written until they exist.',
      route: '/sell',
      needs: ['shop'],
    },
    {
      label: 'Connect a way to take money',
      why: 'A shop that cannot be paid takes an email address and gives nothing back. It will not publish until this is done.',
      route: '/settings?tab=billing',
      needs: ['shop'],
    },
    {
      label: 'Open the shop page',
      why: 'One address a stranger can buy from with no login. This is what everything else points at.',
      route: '/websites',
      needs: ['shop'],
    },
    {
      label: 'Write the product pages and posts',
      why: 'The words that get somebody from a search to the basket, named per product rather than in general.',
      route: '/blog-automation',
      needs: ['content'],
    },
    COMMON.sending,
    {
      label: 'Chase the abandoned baskets',
      why: 'The highest-returning email a shop sends, and it needs a real basket to exist first — which is why it is here and not at the top.',
      route: '/marketing',
      needs: ['email'],
    },
    {
      label: 'Thank the buyers, then bring them back',
      why: 'A second order costs a fraction of a first. Post-purchase, then a win-back for the ones who go quiet.',
      route: '/marketing',
      needs: ['email'],
    },
  ],

  /* ── Property: the listing is the product, and timing decides everything ── */
  'real-estate': [
    COMMON.sending,
    {
      label: 'Put the properties and areas up',
      why: 'People search a street before they search an agent. The area pages are what they land on.',
      route: '/websites',
      needs: ['content'],
    },
    COMMON.audience,
    {
      label: 'Write the two approaches',
      why: 'A seller and a buyer want opposite things from the same email. They are written separately or they are written badly.',
      route: '/marketing',
      needs: ['email'],
    },
    COMMON.book,
    {
      label: 'Set the long follow-up',
      why: 'Most people are simply not moving this month. The money here is in still being there in nine months, not in the first email.',
      route: '/marketing',
      needs: ['email'],
    },
    COMMON.sms,
  ],

  /* ── Trades: short road from reply to job, so the road is what gets built ── */
  'local-services': [
    COMMON.sending,
    {
      label: 'Put up the page the offer points at',
      why: 'One page about one job, so the email has somewhere to send people that is not a homepage.',
      route: '/funnels',
      needs: ['content'],
    },
    COMMON.audience,
    {
      label: 'Write the first email and two follow-ups',
      why: 'Most replies come from the second and third, so all three are written before any of them sends.',
      route: '/marketing',
      needs: ['email'],
    },
    COMMON.book,
    COMMON.sms,
  ],

  /* ── B2B services: the list is the whole game ── */
  'b2b-services': [
    COMMON.sending,
    COMMON.audience,
    {
      label: 'Write the case for this client specifically',
      why: 'A page that says what they do for whom, so the outreach is not the only thing carrying the argument.',
      route: '/websites',
      needs: ['content'],
    },
    {
      label: 'Write the sequence',
      why: 'Fewer replies and much bigger deals than the trades, so the sequence is longer and more patient by design.',
      route: '/marketing',
      needs: ['email'],
    },
    COMMON.book,
  ],

  recruitment: [
    COMMON.sending,
    COMMON.audience,
    {
      label: 'Split the two audiences',
      why: 'The company with the vacancy and the person who might fill it are different lists with different emails. Mixing them is how both get ignored.',
      route: '/contacts',
      needs: ['email'],
    },
    {
      label: 'Write both sequences',
      why: 'One sells a shortlist, the other sells a job. Neither works in the other’s words.',
      route: '/marketing',
      needs: ['email'],
    },
    COMMON.book,
    COMMON.sms,
  ],

  saas: [
    COMMON.sending,
    COMMON.audience,
    {
      label: 'Write the content that gets found',
      why: 'These are the most emailed inboxes on earth. Being findable does more than another send does.',
      route: '/blog-automation',
      needs: ['content'],
    },
    {
      label: 'Write the sequence',
      why: 'Short, specific and about one problem. Volume alone does nothing in this market.',
      route: '/marketing',
      needs: ['email'],
    },
    COMMON.book,
  ],
};

/** The order used when the trade is not one of the named ones. */
const FALLBACK: StepDef[] = [
  COMMON.sending,
  COMMON.audience,
  {
    label: 'Write the pages the outreach points at',
    why: 'An email with nowhere to send people is half an email.',
    route: '/websites',
    needs: ['content'],
  },
  {
    label: 'Write the sequence',
    why: 'The first email and the follow-ups, written together and shown to you before any of them sends.',
    route: '/marketing',
    needs: ['email'],
  },
  COMMON.book,
  COMMON.sms,
];

/**
 * The build order for one project.
 *
 * Steps whose capability is switched off are dropped rather than greyed out —
 * a plan listing work that will never happen is a plan somebody stops trusting
 * on the second read.
 */
export function launchPlan(industryId: string, caps: Capability[]): LaunchStep[] {
  const order = ORDERS[industryId] ?? FALLBACK;
  const out: LaunchStep[] = [];
  for (const step of order) {
    if (step.needs && !step.needs.some(c => caps.includes(c))) continue;
    /* The same shared step can appear in two orders; never twice in one. */
    if (out.some(s => s.label === step.label)) continue;
    out.push({ label: step.label, why: step.why, route: step.route });
  }
  return out;
}
