/**
 * One outcome in, every channel out.
 *
 * The app has an email module, an SMS module, a social creator, a blog planner,
 * a shorts editor and a funnel builder, and until now each one started from an
 * empty page. The company portfolio — what this business sells, to whom, in
 * what voice — was collected once by the onboarding wizard and then read by
 * almost nothing.
 *
 * This is the chain between the two. You pick an outcome you actually want
 * ("book more consultations", "win back customers who went quiet"), and it
 * writes the whole campaign from the portfolio: the emails, the texts, the
 * posts, the blog angle, the short's script and the landing page. Nothing is
 * created yet at this stage — planFlow() returns a plan, the launcher shows it,
 * and only then does flowRun.ts write it into the modules.
 *
 * The planner works with no API key at all. Every line below is built from the
 * portfolio, so a business that filled in four fields gets copy about its own
 * industry and audience rather than "Dear valued customer". With a Gemini key
 * the same structure is written by the model instead; the shape is identical,
 * so everything downstream is unaffected by which one ran.
 */
import type { OnboardingProfile } from '../types/onboarding';
import { loadOnboarding } from './onboarding';
import { activeAccount } from './tenancy';
import { generateBusinessFlow, hasGeminiKey } from '../lib/gemini';

/* ── The outcomes on offer ───────────────────────────────────────────────── */

export interface BusinessFlow {
  id: string;
  /** The outcome, in the customer's words. */
  label: string;
  /** One line on who it goes to and what it does. */
  blurb: string;
  /** Who should receive it — becomes the campaign's audience. */
  audience: string;
  /** The single action every piece of the campaign asks for. */
  cta: string;
  /** How the copy should feel: what the reader is being moved from and to. */
  arc: string;
}

export const FLOWS: BusinessFlow[] = [
  {
    id: 'book-consults',
    label: 'Book more consultations',
    blurb: 'For people who have shown interest but never picked a time.',
    audience: 'Leads and prospects who have not booked',
    cta: 'book a time',
    arc: 'from curious to on the calendar',
  },
  {
    id: 'new-offer',
    label: 'Launch a new offer',
    blurb: 'Announce something new to everybody who already knows you.',
    audience: 'Everyone on the list',
    cta: 'see the offer',
    arc: 'from unaware to first to know',
  },
  {
    id: 'win-back',
    label: 'Win back customers who went quiet',
    blurb: 'For past customers who have not been in touch for a while.',
    audience: 'Customers with no recent activity',
    cta: 'come back',
    arc: 'from lapsed to back in the door',
  },
  {
    id: 'nurture',
    label: 'Stay in mind until they are ready',
    blurb: 'A slower sequence for people who are not buying yet.',
    audience: 'Leads not ready to buy',
    cta: 'read this',
    arc: 'from a name on a list to somebody who trusts you',
  },
  {
    id: 'reviews',
    label: 'Ask happy customers for reviews',
    blurb: 'The people most likely to say something good, asked properly.',
    audience: 'Recent, satisfied customers',
    cta: 'leave a review',
    arc: 'from quietly happy to publicly so',
  },
  {
    id: 'referrals',
    label: 'Turn customers into referrals',
    blurb: 'Ask the people who already chose you to bring somebody with them.',
    audience: 'Existing customers',
    cta: 'introduce someone',
    arc: 'from one customer to two',
  },
];

export const flowById = (id: string): BusinessFlow | undefined => FLOWS.find(f => f.id === id);

/* ── What a plan looks like ──────────────────────────────────────────────── */

export interface PlannedEmail { day: number; subject: string; body: string }
export interface PlannedSms { day: number; body: string }
export interface PlannedPost { day: number; platform: 'instagram' | 'facebook' | 'linkedin'; headline: string; caption: string; hashtags: string[] }
export interface PlannedBlog { title: string; angle: string; outline: string[]; keywords: string[] }
export interface PlannedShort { title: string; hook: string; script: string[] }
export interface PlannedLanding { title: string; subhead: string; bullets: string[]; cta: string }

/** Every channel this chain can produce, and what it is called on screen. */
export type ChannelId = 'email' | 'sms' | 'social' | 'blog' | 'short' | 'landing';

export interface FlowPlan {
  flowId: string;
  /** What the whole campaign is called wherever it lands. */
  name: string;
  /** The promise the campaign makes, in one line. */
  promise: string;
  audience: string;
  /** Which engine wrote it, so the screen can say so rather than implying AI. */
  writtenBy: 'ai' | 'portfolio';
  emails: PlannedEmail[];
  sms: PlannedSms[];
  social: PlannedPost[];
  blog: PlannedBlog;
  short: PlannedShort;
  landing: PlannedLanding;
}

/* ── Reading the portfolio ───────────────────────────────────────────────── */

interface Ctx {
  company: string;
  industry: string;
  what: string;
  who: string;
  voice: string;
  website: string;
}

/**
 * What the copy has to work with.
 *
 * Every fallback here is a phrase that still reads as English in a sentence —
 * "our team", "people like you" — because the alternative is copy with a hole
 * in it, and a hole is worse than a generality. `readiness` says how much of
 * the portfolio was real, so the launcher can tell somebody their campaign will
 * be better after two more minutes in the wizard.
 */
function context(profile?: OnboardingProfile): { ctx: Ctx; readiness: number } {
  const p = profile ?? loadOnboarding().profile;
  const account = activeAccount();
  const placeholder = /^(my business|main workspace)$/i;
  const accountName = (account?.businessName ?? '').trim();

  const company = (p.companyName ?? '').trim()
    || (accountName && !placeholder.test(accountName) ? accountName : '')
    || 'our team';
  const industry = (p.industry ?? '').trim().toLowerCase() || 'local business';
  const what = (p.description ?? '').trim();
  const who = (p.audience ?? '').trim();

  const filled = [p.companyName, p.industry, p.description, p.audience]
    .filter(v => (v ?? '').trim().length > 1).length;

  return {
    ctx: {
      company,
      industry,
      /* Empty stays empty. A fallback that reads like a real answer —
         "what our team does" — makes copy that quotes it back sound broken, so
         the writer checks for the blank instead of being handed a fake. */
      what: what,
      who: who || 'people like you',
      voice: (p.brandVoice ?? '').trim() || 'Friendly & approachable',
      website: (p.website ?? '').trim(),
    },
    readiness: filled / 4,
  };
}

/** The first clause of a long answer — a whole paragraph does not fit in a subject line. */
const clause = (s: string, max = 60): string => {
  const first = s.split(/[.,;\n]/)[0].trim();
  return (first.length > 4 ? first : s).trim().slice(0, max).replace(/\s+\S*$/, m => (m.length > 12 ? '' : m)).trim();
};

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** The first n whole words, so nothing ends in a half-written one. */
const words = (s: string, n: number): string =>
  s.trim().split(/\s+/).slice(0, n).join(' ').replace(/[,;.]$/, '');

/* ── The offline writer ──────────────────────────────────────────────────── */

/**
 * A campaign written from the portfolio and nothing else.
 *
 * Not a placeholder for the AI path — it is what runs for every customer
 * without a Gemini key, which is most of them on day one, so it has to be
 * sendable as written. Each email has its own job (open, teach, prove, ask)
 * rather than four variations of the same paragraph, because a sequence where
 * every message says the same thing is what makes people unsubscribe.
 */
function offlinePlan(flow: BusinessFlow, ctx: Ctx): Omit<FlowPlan, 'writtenBy'> {
  const co = ctx.company;
  const who = lower(clause(ctx.who, 70));
  const described = ctx.what.trim().length > 0;
  const what = described ? lower(clause(ctx.what, 90)) : `what ${co} does`;
  const ind = ctx.industry;

  const name = `${flow.label} — ${co}`;
  /* The "using what we know about X" clause only earns its place when X came
     from the portfolio. With nothing filled in it reads "using what our team
     knows about what our team does", which is a sentence that says nothing. */
  const promise = described
    ? `${flow.label} for ${who}, using what ${co} already knows about ${what}.`
    : `${flow.label} for ${who}.`;

  const emails: PlannedEmail[] = [
    {
      day: 0,
      subject: `A quick question about ${lower(words(clause(ctx.what, 40), 4)) || ind}`,
      body: `Hi {{firstName}},\n\nI'll keep this short. ${co} works with ${who}, and the thing we hear most often is that people put this off until it becomes urgent.\n\nIt does not have to be that way. ${what.charAt(0).toUpperCase() + what.slice(1)} — and the earlier we look at it together, the fewer surprises there are.\n\nIf that sounds useful, ${flow.cta} and we'll take it from there. If the timing is wrong, just say so and I'll leave you be.\n\n— The ${co} team`,
    },
    {
      day: 2,
      subject: `The mistake we see most in ${ind}`,
      body: `Hi {{firstName}},\n\nAfter enough time in ${ind}, the same pattern keeps showing up: people compare options for weeks, then choose on the last day with the least information.\n\nHere is what actually matters, in order:\n\n1. What you want to be true in six months — not this week.\n2. What it costs to do nothing, which is almost never zero.\n3. Who is going to do the work, and whether they have done it before.\n\nThat is the conversation we have with everyone who comes to us. It takes about twenty minutes and there is nothing to buy at the end of it.\n\nReady when you are — ${flow.cta}.\n\n— ${co}`,
    },
    {
      day: 5,
      subject: `What ${who} say afterwards`,
      body: `Hi {{firstName}},\n\nThe thing nobody tells you about choosing help in ${ind} is that the difference is rarely the price. It is whether the people you hire have seen your situation before.\n\nThat is what our customers mention: not the deliverable, but that they stopped having to explain themselves. ${co} works with ${who} every week, so the context is already there.\n\nIf you would like to see what that looks like for you specifically, ${flow.cta} — we'll bring what we already know and you can decide from there.\n\n— The ${co} team`,
    },
    {
      day: 9,
      subject: `Last note from ${co}`,
      body: `Hi {{firstName}},\n\nThis is the last one — I'd rather stop than keep filling your inbox.\n\nIf the timing is not right, that is a completely reasonable answer and the door stays open. If it is, everything you need is one click away: ${flow.cta}, pick whatever slot suits, and we'll do the rest.\n\nEither way, thank you for reading this far.\n\n— ${co}`,
    },
  ];

  const sms: PlannedSms[] = [
    { day: 1, body: `${co}: hi {{firstName}} — sent you an email about ${lower(words(clause(ctx.what, 40), 4)) || ind}. Worth two minutes. Reply YES and we'll ${flow.cta}.` },
    { day: 6, body: `${co}: {{firstName}}, still happy to help with ${lower(words(clause(ctx.what, 40), 4)) || ind}. Reply YES for a time that suits, or STOP and we'll leave it.` },
  ];

  const social: PlannedPost[] = [
    {
      day: 0, platform: 'instagram',
      headline: `The ${ind} question nobody asks first`,
      caption: `Most ${who} start with "how much". The better first question is "what happens if I do nothing". ${co} helps you answer both.`,
      hashtags: ['#' + ind.replace(/[^a-z0-9]+/g, ''), '#smallbusiness', '#' + flow.id.replace(/-/g, '')],
    },
    {
      day: 3, platform: 'linkedin',
      headline: `Three things that decide the outcome`,
      caption: `1. What you want true in six months. 2. The cost of waiting. 3. Whether the people doing the work have done it before. Everything else is detail. — ${co}`,
      hashtags: ['#' + ind.replace(/[^a-z0-9]+/g, ''), '#business'],
    },
    {
      day: 6, platform: 'facebook',
      headline: `What our customers actually say`,
      caption: `The comment we hear most is not about price. It is "I finally stopped having to explain my situation". That is what working with people who know ${who} is like.`,
      hashtags: ['#' + ind.replace(/[^a-z0-9]+/g, ''), '#local'],
    },
    {
      day: 10, platform: 'instagram',
      headline: `Open this week`,
      caption: `A few slots left. If that sounds like you and you have been meaning to sort this out, now is a good week to ${flow.cta}.`,
      hashtags: ['#' + ind.replace(/[^a-z0-9]+/g, ''), '#booknow'],
    },
  ];

  const blog: PlannedBlog = {
    title: `${flow.label}: what ${who} should know first`,
    angle: `The buyer's-guide post that answers the questions people ask ${co} before they commit — written to rank for the searches they make while deciding.`,
    outline: [
      `What ${who} are actually trying to solve`,
      `The three things that decide the outcome`,
      `What it costs to wait`,
      `How ${co} approaches it`,
      `What happens after you ${flow.cta}`,
    ],
    /* Search terms people would actually type, so they are trimmed to whole
       words — a phrase cut mid-word ("…in North London w") is not a search
       anybody makes, and it would go straight into the blog module's cluster. */
    keywords: [
      words(`${ind} for ${who}`, 7),
      words(clause(ctx.what, 60), 6),
      flow.label.toLowerCase(),
    ].filter(k => k.length > 3),
  };

  const short: PlannedShort = {
    title: `${flow.label} — 30 seconds`,
    hook: `Most ${who} get this wrong on the first try.`,
    script: [
      `Most ${who} get this wrong on the first try.`,
      `They start by asking what it costs.`,
      `The better question is what it costs to wait.`,
      `Because the answer is almost never zero.`,
      `We do this every week at ${co}.`,
      `Link's in the bio — ${flow.cta}.`,
    ],
  };

  const landing: PlannedLanding = {
    title: flow.label,
    subhead: `For ${who}. ${what.charAt(0).toUpperCase() + what.slice(1)}.`,
    bullets: [
      `Twenty minutes, nothing to buy at the end of it`,
      `Straight answers about what it costs and how long it takes`,
      `Run by people who work with ${who} every week`,
    ],
    cta: flow.cta.charAt(0).toUpperCase() + flow.cta.slice(1),
  };

  return { flowId: flow.id, name, promise, audience: flow.audience, emails, sms, social, blog, short, landing };
}

/* ── The planner ─────────────────────────────────────────────────────────── */

export interface PlanResult {
  plan: FlowPlan;
  /** 0-1: how much of the portfolio was filled in. */
  readiness: number;
  /** Set when the AI was tried and did not work, so the screen can say why. */
  note?: string;
}

/**
 * Plan a flow. Never throws and never returns nothing.
 *
 * The AI path is tried first when a key exists, and a failure there falls
 * through to the portfolio writer with the reason attached rather than an error
 * screen — somebody whose Gemini quota ran out should still get their campaign,
 * and should be told which one they got.
 */
export async function planFlow(flowId: string, profile?: OnboardingProfile): Promise<PlanResult> {
  const flow = flowById(flowId) ?? FLOWS[0];
  const { ctx, readiness } = context(profile);
  const base = offlinePlan(flow, ctx);

  if (!hasGeminiKey()) {
    return { plan: { ...base, writtenBy: 'portfolio' }, readiness };
  }

  try {
    const ai = await generateBusinessFlow({
      company: ctx.company, industry: ctx.industry, description: ctx.what,
      audience: ctx.who, voice: ctx.voice,
      outcome: flow.label, arc: flow.arc, cta: flow.cta,
    });
    /* Field by field rather than a wholesale swap: a model that returns four
       good emails and no blog should give us its emails and keep the written
       blog, not drop back to the offline version of everything. */
    return {
      plan: {
        ...base,
        writtenBy: 'ai',
        name: ai.name || base.name,
        promise: ai.promise || base.promise,
        emails: ai.emails?.length ? ai.emails : base.emails,
        sms: ai.sms?.length ? ai.sms : base.sms,
        social: ai.social?.length ? ai.social : base.social,
        blog: ai.blog ?? base.blog,
        short: ai.short ?? base.short,
        landing: ai.landing ?? base.landing,
      },
      readiness,
    };
  } catch (e) {
    return {
      plan: { ...base, writtenBy: 'portfolio' },
      readiness,
      note: `Written from your portfolio — the AI could not be reached (${e instanceof Error ? e.message.slice(0, 120) : 'unknown error'}).`,
    };
  }
}

/** Everything a plan would create, counted, for the review screen. */
export function planCounts(plan: FlowPlan): Record<ChannelId, number> {
  return {
    email: plan.emails.length,
    sms: plan.sms.length,
    social: plan.social.length,
    blog: 1,
    short: 1,
    landing: 1,
  };
}
