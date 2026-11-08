/**
 * The cover email to AppSumo's partner team, with the reviewer logins the
 * owner just made filled in (AppSumoPage → Logins for AppSumo's reviewers).
 * docs/appsumo/EMAIL-TO-APPSUMO.md is the same text for reading; this is the
 * one that carries real logins, built in the owner's browser and never stored.
 *
 * Every sentence is true of the product as shipped. No customer numbers,
 * revenue or reviews: AppSumo checks, and an invented one is a rejection.
 */
import { FOUNDER, SUPPORT_EMAIL } from '../Site/company';

export const APPSUMO_PARTNERS = 'partners@appsumo.com';
const SITE = 'https://protectedcentral.com';
const APP = 'https://app.protectedcentral.com';

export function reviewerEmail(logins: { email: string; password: string }[]): { subject: string; body: string } {
  const access = logins.length
    ? logins.map((l, i) => `  Login ${i + 1}: ${l.email}  /  password: ${l.password}`).join('\n')
    : '  (make the reviewer logins on /appsumo first)';
  return {
    subject: 'Protected Central — application submitted, reviewer access ready',
    body: `Hi AppSumo team,

I'm ${FOUNDER}, founder of Protected Central (${SITE}). I've just submitted our listing through the Partner Portal and wanted to make your review as easy as possible.

What it is, in one line: a CRM and marketing-automation platform where you describe the result you want, and AI Autopilot builds the workflows, shows you the blueprint for approval, and then runs them on the server.

What it does beyond the AI. We know you're careful about AI wrappers, so here is what the product itself does:
- CRM, pipeline and contacts, with email and SMS sequences sent from the customer's own mailbox and domain. Nothing sends until they approve it.
- AI Prospecting: "dentists in Austin with a website" becomes a list of businesses. It searches our business contacts database first, then live business directories, and each lead carries the email it publishes, checked before sending, with where it was found.
- Booking pages, websites and funnels, Google reviews, a support widget with chat and tickets, and an AI Video Studio.
- Agency mode: a workspace per client under the agency's own brand. Protected Central itself is our own software, built in-house. It is not a rebranded platform.

Ready for your review:

- Test access. Sign in at ${APP}/login. Each login is its own workspace on our top AppSumo tier, for the whole of your review:
${access}

- Demo / output URL: ${SITE}/book/strategy-call. It's our own booking page, built and run with Protected Central's booking pages.

- A 5-minute path:
  1. AI Autopilot → New business workspace → type one sentence → approve the blueprint.
  2. AI Prospecting → "dentists in Austin, Texas with a website".
  3. Connect a Gmail or Microsoft 365 mailbox and see a sequence step wait as a draft.
  4. Press the help button in the corner: chat, a ticket, or book a strategy call.

- Redemption: both models are built and tested. Codes are at ${APP}/appsumo, with up to 3 stacking; we'll upload our code file at your Redemption step. AppSumo Licensing v2 (webhooks plus the OAuth Activate button) is also built: purchase, activate, upgrade, downgrade and deactivate are all handled. We'll use whichever you prefer.

- We ship continuously: ${SITE}/changelog lists every release with its date.

- Support: ${SUPPORT_EMAIL}, plus in-app chat and tickets. I'm personally involved in support and onboarding calls.

- Security and privacy: ${SITE}/security, which says what we do and what we don't claim. The Privacy Policy and Terms are at ${SITE}/privacy and ${SITE}/terms-of-service.

Lifetime buyers get every future update on their tier at no extra cost. The deal tiers are kept below our monthly plans for the same allowances.

If anything doesn't work for your testers, reply here and I'll fix it the same day.

Thanks for considering us,

${FOUNDER}
Founder, Protected Central
${SUPPORT_EMAIL} · ${SITE}
`,
  };
}
