/**
 * The home page's module demos: one short, looping recording per module of
 * the real app in dark mode, a pointer moving, clicking and typing.
 *
 * ── Why a clip per module, and not the reels of stills ──
 *
 * The owner's brief (2026-11-18): show the current app, dark, and show each
 * module *being used* — a contact added, a business workspace set up and
 * built, a search run, a site published — "GIF-like", instead of photographs
 * of its pages. A still shows that a screen exists; the clip shows what a
 * person does on it, which is the question a visitor is asking.
 *
 * ── One list, two readers ──
 *
 * The site reads this for the player, its tabs and captions
 * (`ClipPlayer.tsx`). `scripts/site-clips.mts` reads it for what to record,
 * and refuses to run if a clip here has no recipe — so a caption can never
 * describe a recording of something else. The platform film
 * (`scripts/site-film.mts`, LaunchFilm) is cut from the same recordings, so
 * the film and the sections cannot disagree.
 *
 * ── Honest by construction ──
 *
 * Every clip is the running app against the seeded sample agency (invented
 * businesses on `.example` addresses — scripts/site-seed.mjs), recorded on a
 * host where the incubator is off, so no clip shows a module the live app
 * holds back (docs/INCUBATOR.md). Captions say what the clip shows and
 * nothing it does not: no results, no figures.
 */

export interface ModuleClip {
  /** File stem under public/site/clips/ (.webm, .mp4, -poster.webp). */
  id: string;
  /** The module, as its feature block names it ("Contacts"). */
  module: string;
  /** What happens in the clip, in one line. Shown under the player. */
  caption: string;
  /** For somebody who cannot see it: what the recording shows. */
  alt: string;
}

const C = (id: string, module: string, caption: string, alt: string): ModuleClip => ({ id, module, caption, alt });

export const CLIPS = {
  autopilot: C('clip-autopilot', 'AI Autopilot',
    'Business workspaces that run by themselves: workflows walked node by node, guardrails you set, agents, a daily finder — and a new one built from a sentence.',
    'AI Autopilot: the board of business workspaces; a branching workflow on its canvas, scrolled; each step opened in turn, one dry-run against a sample contact; the whole workflow opened for editing with the step menu; the guardrails of what it may do by itself; its AI agents and activity; Brightline Realty’s daily search and the leads it found; then a new business workspace described, its blueprint read and built'),
  prospecting: C('clip-prospecting', 'AI Prospecting',
    'One sentence: it searches live, reads the websites, checks every address — then runs the search every day for a business workspace.',
    'AI Prospecting: dentists in Richmond, Virginia typed and searched, the stages running, the step-by-step log and totals, the results filtered to addresses that take mail, then the search connected to the Parkway Dental business workspace in five steps — every day, what counts as a lead, the checks, where prospects go — and shown connected'),
  contacts: C('clip-contacts', 'Contacts',
    'Lists for every business workspace, smart filters, checked addresses, contacts sent to AI Autopilot and new prospects found without leaving Contacts.',
    'Contacts: a contact added at speed; a business workspace’s daily-finder list opened; filtered by email health and source; the address checks; three contacts ticked and sent to an AI Autopilot business workspace; dentists in Leeds found and added to a new list; a profile opened with its health score, a note added and its deals'),
  websites: C('clip-websites', 'Websites & funnels',
    'Whole sites to start from, edited on the page itself, a section in a click, every page and screen, then published.',
    'Websites: the funnels and websites lists; a multi-page template previewed and used; the headline and button words changed in the panel; an FAQ section added; the pages, tablet and phone views; the search title typed; and the site published to its public link'),
  graphics: C('clip-graphics', 'Graphics Designer & Editor',
    'Templates drawn in your client’s name and colours: words that fit, every format re-laid, brand, picture and variation in a click.',
    'Graphics Designer & Editor: templates filtered by what is being posted; one picked and named; its supporting line typed; the square, story, landscape and portrait formats; the Editorial and Friendly font styles; another library picture; a different variation; hashtags typed and the download button'),
  engagement: C('clip-engagement', 'Customer Engagement',
    'A ticket worked with a private note, a form changed and filled in on the business’s page, an AI agent set up, and the chat widget’s one line.',
    'Customer Engagement: a ticket set in progress with an internal note; the Book a consultation form given a new question and made live; that form filled in on its public page and the answers shown in Submissions; an AI agent named, described and allowed to offer booking times and hand over to a person; a chat widget made and its embed code shown'),
  pipelines: C('clip-pipelines', 'Pipelines',
    'A pipeline for every business workspace, website enquiries arriving as deals by themselves, and automations that work the board.',
    'Pipelines: two business workspaces’ own pipelines with their starter tasks; a quote form filled in on the business’s website and the deal appearing on the board; the flag-stale-deals automation switched on and marking idle deals; a deal dragged on and opened; the list, table, funnel and timeline views'),
  campaigns: C('clip-campaigns', 'Email campaigns',
    'Results counted from real sends, sequences that stop when somebody answers, A/B steps and every email read as one contact will get it.',
    'Email campaigns: the campaign list and one campaign’s opens, clicks, replies and bounces; a sequence’s second step, three days after the first, set to go only if there is no reply; an A/B test switched on; the step previewed for two different contacts; the sequence’s activity log; and the list import screen'),
  booking: C('clip-booking', 'Booking pages',
    'Your booking page edited beside the real thing — words, look, length and place — shown in each visitor’s time zone, on a phone too.',
    'Booking pages: the list of bookings; the page’s title and tagline typed with the live page beside it; four colour themes; 45 minutes and in person chosen; the visitor’s time zone set to New York and a day picked; the phone view; the weekly hours and the automatic confirmation emails'),
  inbox: C('clip-inbox', 'Unified Inbox',
    'Every mailbox in one list, the urgent and unhappy first, answered in place, tagged, noted for the team and closed.',
    'Unified Inbox: the sales, campaigns and support mailboxes; the urgent filter and an urgent, negative message; a pricing question answered with a ready reply and a line typed; a tag, an internal note and the conversation marked resolved; then a search for invoice'),
  agency: C('clip-agency', 'Agency & white-label',
    'Your own product name on it: the top bar and the sign-in screen change as you type.',
    'Settings, Branding: a product name and sign-in headline typed, the preview changing with them'),
  reports: C('clip-reports', 'Reports',
    'Reports read live from the modules that own the numbers, over the period you choose.',
    'Reports: the overview, the period changed to 90 days and the deliverability tab opened'),
} satisfies Record<string, ModuleClip>;

export type ClipKey = keyof typeof CLIPS;

/** Every recording the site uses, for the capture script. */
export const CLIP_IDS: string[] = Object.values(CLIPS).map(c => c.id);

/** Where the files are served from. */
export const clipBase = (): string => `${(import.meta.env?.BASE_URL || '/').replace(/\/$/, '')}/site/clips`;
