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
    'Say what you want, answer a few questions, read the blueprint — and AI Autopilot builds the business workspace.',
    'AI Autopilot: a request typed, a ready-made solution picked, the questions answered, the blueprint approved and the business workspace built with its workflow switched on'),
  prospecting: C('clip-prospecting', 'AI Prospecting',
    'One sentence, and AI Prospecting searches live, reads the websites and checks every address it finds.',
    'AI Prospecting: a search typed for real estate agents in Richmond, Virginia, the stages running and the results arriving with checked addresses'),
  contacts: C('clip-contacts', 'Contacts',
    'Lists for every business workspace, smart filters, checked addresses, contacts sent to AI Autopilot and new prospects found without leaving Contacts.',
    'Contacts: a contact added at speed; a business workspace’s daily-finder list opened; filtered by email health and source; the address checks; three contacts ticked and sent to an AI Autopilot business workspace; dentists in Leeds found and added to a new list; a profile opened with its health score, a note added and its deals'),
  websites: C('clip-websites', 'Websites & funnels',
    'A website started from a template, its headline changed in the builder, and published.',
    'Websites: a new website made from a template, opened in the builder, its headline changed and the site published'),
  graphics: C('clip-graphics', 'Graphics Designer & Editor',
    'A template from the library in your brand, its words changed, its format and layout switched.',
    'Graphics Designer & Editor: a social template picked, a design created, its supporting line typed, then the square format and another layout chosen'),
  engagement: C('clip-engagement', 'Customer Engagement',
    'Tickets, forms and live help in one place — a ticket opened, then a question added to a form.',
    'Customer Engagement: a support ticket opened, then the Get a quote form opened and a question added'),
  pipelines: C('clip-pipelines', 'Pipelines',
    'A pipeline for every business workspace, website enquiries arriving as deals by themselves, and automations that work the board.',
    'Pipelines: two business workspaces’ own pipelines with their starter tasks; a quote form filled in on the business’s website and the deal appearing on the board; the flag-stale-deals automation switched on and marking idle deals; a deal dragged on and opened; the list, table, funnel and timeline views'),
  campaigns: C('clip-campaigns', 'Email campaigns',
    'A campaign started from a template: named, its goal and tone picked and its brief written.',
    'Email campaigns: a new campaign from a template, its name typed, the re-engage goal picked, its brief written and the friendly tone chosen'),
  booking: C('clip-booking', 'Booking pages',
    'Your booking page edited beside the real thing — it changes as you type.',
    'Booking pages: the booking page editor with the live page beside it, its tagline typed and a day picked'),
  inbox: C('clip-inbox', 'Unified Inbox',
    'Every inbox in one list: a message opened and a reply written without leaving it.',
    'Unified Inbox: the demo inbox, a message opened and a reply typed under it'),
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
