/**
 * What the support bot on the owner's own help button knows about Protected
 * Central — the product, its plans and offers, and how to get help.
 *
 * ── Why it is code and not a knowledge article ──
 *
 * The owner asked (2026-11-07) for the live-chat bot to be "trained on all of
 * the features and offers". Typed into the knowledge base it would be a copy
 * of the prices and allowances, and the day a plan changed in allowances.ts
 * the bot would quote the old one — to a buyer, as a commitment (agentBrain.ts
 * rule 1 exists because of exactly that). So the plan and tier lines are built
 * here from the same table the pricing page draws (effectivePlans +
 * featureLines, with the owner's overrides), the service prices from offers.ts,
 * and the prose describes only what ships. The owner's own knowledge articles
 * and agent, when they set them up, still apply on top.
 *
 * ── Why the services depend on the host ──
 *
 * The managed services are off the live site while they are tested
 * (industryPages.ts servicesPublic). A bot describing them there would publish
 * what the site hides, so they are included only where the site shows them.
 *
 * Nothing here may be invented: no customer counts, reviews, uptime figures or
 * guarantees. If it is not true of the product today, it does not go in.
 */
import type { Env } from './db';
import type { AgentConfig } from './agentBrain';
import { effectivePlans, featureLines, type PlanDef } from './allowances';
import { loadOverrides } from './allowanceStore';
import { ECOMMERCE_OFFER, MEDICAL_BILLING_OFFER, TRADE_GROWTH_OFFER, dollars, ecommerceLine, growthLine, medicalLine } from './offers';
import { servicesPublic } from './industryPages';

const SITE = 'https://protectedcentral.com';
const APP = 'https://app.protectedcentral.com';
const SUPPORT_EMAIL = 'support@protectedcentral.com';

/**
 * The assistant used on the owner's help button when no AI agent has been
 * attached to it in Customer Engagement. Without one every chat was answered
 * "a colleague will pick this up" — a support bot that never answers. With
 * one attached, theirs is used instead (and still gets the facts below).
 */
export const HOUSE_AGENT: AgentConfig = {
  id: 'house',
  name: 'the Protected Central assistant',
  purpose: 'support',
  personality: 'Friendly, plain-spoken and brief; British or American spelling to match the customer',
  greeting: '',
  instructions: 'Answer questions about Protected Central from the product facts. When someone is ready to buy or wants advice, point them to the 7-day free trial or a strategy call. For a problem with their own account, collect what happened and offer a ticket or a colleague.',
  business_info: 'Protected Central — a CRM and marketing-automation platform, built and run by its founder, Azeem Sattar.',
  qualifying: '[]',
  tools: '["createTicket","captureContact","handoffToHuman"]',
  fallback: `Sorry — I can't answer that right now. Write to ${SUPPORT_EMAIL} or leave your email here and a person will reply.`,
  escalation: '',
  hours_from: '00:00',
  hours_to: '23:59',
  hours_days: '',
  timezone: 'America/New_York',
};

const money = (cents: number) => dollars(cents);

function planBlock(p: PlanDef): string {
  const price = p.kind === 'self'
    ? `${money(p.monthlyCents)} a month${p.annualCents ? `, or ${money(p.annualCents)} a year (two months free)` : ''}`
    : p.kind === 'custom' ? 'priced with you on a strategy call' : 'a one-time purchase on AppSumo';
  const lines = p.kind === 'custom' ? [] : featureLines(p);
  return [`${p.name} — ${price}. ${p.tagline}`, ...lines.map(l => `  - ${l}`), `  - Support: ${p.support}`].join('\n');
}

/** Every fact the house bot may state, as one block of text for the prompt. */
export async function houseFacts(env: Env): Promise<string> {
  const plans = effectivePlans(await loadOverrides(env).catch(() => ({})));
  const sold = plans.filter(p => p.kind === 'self' || p.kind === 'custom');
  const deal = plans.filter(p => p.kind === 'deal');
  const host = (() => { try { return new URL(env.APP_ORIGIN ?? APP).hostname; } catch { return 'app.protectedcentral.com'; } })();
  const services = servicesPublic(host);

  return `WHAT IT IS
Protected Central is a CRM and marketing-automation platform where you describe the result you want and AI builds the system to get it. It is our own software, written and run by us, not a rebranded platform. Website: ${SITE}. Sign in: ${APP}.

MAIN FEATURES
- AI Autopilot: describe an outcome in a sentence (typed, spoken, or by handing over your website and files). It asks only what it could not work out, then shows a blueprint — every workflow and step — which you can change in a sentence and must approve before anything exists. It then runs on the server every five minutes, whether or not you are logged in, and its board shows what it did and what is waiting for approval. One "business workspace" per business.
- AI Prospecting: say who you sell to (for example "dentists in Austin, Texas with a website"). It searches business directories, company registers and Google Maps, reads the email address each business publishes on its own website (never a guessed address), and checks the format, domain and mail server before you send. Every lead records where and when it was found. A business workspace can repeat a search daily.
- CRM and pipeline: contacts, lists, deals and a pipeline board; import and de-duplicate contacts.
- Email and SMS: campaigns and sequences sent from your own mailbox and domain (Gmail, Microsoft 365, or a sending service such as Brevo, Resend, SendGrid, Mailgun, Mailjet or Postmark), stopping when someone replies; Twilio for texts; a Unified Inbox for every mailbox, SMS and chat.
- Nothing sends unasked: every email or text starts as a draft until you approve it, and you choose what each business workspace may do on its own.
- Content: social posts with images in your brand colours (Facebook, Instagram, LinkedIn, X, TikTok, Pinterest, YouTube) and SEO blog articles published to WordPress on a schedule, each waiting for approval. AI Video Studio for short videos and editing recordings by their transcript.
- Booking pages with reminders and rebooking for no-shows; a calendar.
- Websites and funnels whose forms put leads straight into the CRM; an online shop.
- Reviews: keep track of what people say about you on Google.
- Customer Engagement: an AI chat widget, forms and tickets for your own website.
- Agencies: a workspace per client (sub-accounts) under your own brand and login address (white-label), and reports clients open without a login.
- Works in a phone browser.

PLANS (self-serve software)
Every new account starts with a 7-day free trial, no card required. Plans are billed monthly or yearly in US dollars and renew until cancelled. Plans are changed in the app under Workspace → Plan & billing. Full comparison: ${SITE}/pricing.
${sold.map(planBlock).join('\n')}

APPSUMO LIFETIME DEAL
Bought on AppSumo, redeemed at ${APP}/appsumo: create an account (or sign in) and the code is added. One code is Tier 1; a second and third code on the same account move it up, up to three. AppSumo's own Activate button also works. Every feature is included on every tier; tiers differ only in how much. Allowances marked "a month" start again on the 1st. Refunds are handled by AppSumo under its policy; a refunded code stops counting. More than Tier 3: the monthly plans can be added on top.
${deal.map(planBlock).join('\n')}
${services ? `
MANAGED SERVICES (our team does the work, separate from the software plans, each with written terms)
- ${ECOMMERCE_OFFER.name}: ${ecommerceLine()}. ${SITE}/ecommerce-management-services
- ${TRADE_GROWTH_OFFER.name}: ${growthLine()}. ${SITE}/hvac and ${SITE}/roofing; terms at ${SITE}/growth-service-terms
- ${MEDICAL_BILLING_OFFER.name}: ${medicalLine()}. ${SITE}/medical-billing
` : ''}
GETTING HELP
- This chat; tickets from the same help button (we reply by email); email ${SUPPORT_EMAIL}.
- A strategy call with the founder: ${SITE}/book/strategy-call (pick a time there; never state times yourself).
- Security and privacy: ${SITE}/security. Privacy policy: ${SITE}/privacy. Terms: ${SITE}/terms-of-service. What's new: ${SITE}/changelog.

WHAT YOU DO NOT KNOW
Anything about a specific person's account, billing history, data or an outage; dates for future features; discounts or custom prices. For those, offer a ticket or a colleague.`;
}
