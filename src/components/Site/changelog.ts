/**
 * What shipped, for /changelog (Site/Changelog.tsx).
 *
 * Every entry is a release that is in the repository's history on that date —
 * written from the commits, in a customer's words. Nothing planned, nothing
 * "coming soon": a promise on a public page is a feature somebody buys and
 * then finds missing. Add the newest entry at the top when a release lands on
 * live, in the same commit when that is practical.
 *
 * Why the page exists: buyers (and marketplaces such as AppSumo, which asks
 * for "active roadmaps, changelogs, and responsive teams") judge whether a
 * product is alive by whether it visibly ships.
 */
export interface Release {
  /** ISO date the work landed. */
  date: string;
  title: string;
  /** Which part of the product, as the menu names it. */
  area: string;
  points: string[];
  /** Points about the managed services: shown only where they are public (servicesPublic). */
  servicePoints?: string[];
}

export const RELEASES: Release[] = [
  {
    date: '2026-11-04', area: 'AI Prospecting', title: 'Our business contacts database comes first',
    points: [
      'When our business contacts database is available, every AI Prospecting search asks it first and goes to live business directories only when it has nobody who matches.',
      'Daily prospecting works the same way: it takes matching people from the database before searching the web, each address checked and never anybody already in your Contacts.',
    ],
  },
  {
    date: '2026-11-04', area: 'Plans', title: 'AppSumo lifetime deal',
    points: [
      'A redemption page at /appsumo: create an account or sign in, and the code is added — up to three codes stack to a higher tier.',
      'AppSumo’s own Activate button is supported too: a buyer arrives signed up with the tier they bought, with nothing to copy.',
      'Plan & billing names the deal, and refunds or tier changes on AppSumo follow through by themselves.',
    ],
  },
  {
    date: '2026-11-03', area: 'Email', title: 'Email on your own domain, and many mailboxes at once',
    points: [
      'Email addresses on your own domain, set up and hosted from here.',
      'Paste or screenshot the settings for several mailboxes, review them, then connect and test them all in one go — each row says whether sending and receiving were proven.',
      'A usage dashboard with caps, and a choice of AI model for each part of the product.',
    ],
  },
  {
    date: '2026-11-02', area: 'AI', title: 'Backup AI keys and better video thumbnails',
    points: [
      'Backup AI keys, OpenRouter among them, so one busy or exhausted key does not stop the work.',
      'Video thumbnails are made only when you ask, from an example you like or a new “modern” layout.',
      'Sound fixes in the video editor are heard live in the player, each one a named step you can undo.',
    ],
  },
  {
    date: '2026-11-01', area: 'Video Studio', title: 'Video processing in the cloud',
    points: [
      'Video Studio processes in the cloud, so a long render no longer depends on your browser staying open.',
      'Cleaner sound, and Shorts with the camera below the screen recording.',
    ],
  },
  {
    date: '2026-10-30', area: 'Video Studio', title: 'Screen Recorder and editor upgrades',
    points: [
      'Screen Recorder: camera on by itself, frames and rings, scenes, an automatic look and your logo anywhere on the picture.',
      'The editor undoes one press at a time, shows progress beside your work, and exports from its own dialog.',
    ],
  },
  {
    date: '2026-10-29', area: 'Graphics & Video', title: 'Screen Recorder, social templates and the Media Center',
    points: [
      'Record your screen and camera from the Media Library, with backgrounds, auto zoom and switching screens while recording.',
      'A template library for social graphics, drawn in your brand from your own business profile.',
      'The Media Center keeps your graphics and uploads in one place.',
    ],
  },
  {
    date: '2026-10-28', area: 'Plans', title: 'New plans and industry snapshots',
    points: [
      'The Growth, Scale and Custom software plans, each with its allowances enforced on the server.',
    ],
    servicePoints: [
      'Ready-made pipelines for an online store and for a medical practice, installed for you.',
    ],
  },
  {
    date: '2026-10-26', area: 'Sales', title: 'Jobs & revenue, and industry pages',
    points: [
      'Jobs & revenue: follow a lead from first contact to estimate, quote, invoice and money collected — only what you confirm counts.',
    ],
    servicePoints: [
      'Pages for HVAC, roofing, medical billing and e-commerce businesses, each showing the real screens.',
      'Medical billing (claims, remittances, denials and A/R) — on synthetic test data until a practice’s launch checklist is signed off.',
    ],
  },
  {
    date: '2026-10-21', area: 'Video Studio', title: 'Edit video by editing its transcript',
    points: [
      'Delete words in the transcript to cut them from the video; restore them just as easily.',
      'Studio Sound: noise reduction, de-essing, EQ, compression and loudness evened out to −16 LUFS.',
      'Smarter clean-up: retakes keep the best take and say why; filler words and long gaps are found for you.',
    ],
  },
  {
    date: '2026-10-16', area: 'Video Studio', title: 'Start a video from a YouTube link',
    points: [
      'Paste a YouTube link to start a project, and plan its thumbnails with the Graphics Designer & Editor.',
      'Contact lists sit beside the contacts table instead of on a screen of their own.',
    ],
  },
  {
    date: '2026-10-15', area: 'AI Prospecting', title: 'Say who to sell to, in one sentence',
    points: [
      'A new search starts from one sentence — no tabs of sources to choose between.',
      'Load a whole folder of lead files at once, including ZIP files inside ZIP files.',
      'Every “are you sure?” is the app’s own dialog, never the browser’s.',
    ],
  },
  {
    date: '2026-10-14', area: 'AI Autopilot', title: 'Allowances you can see, and a booking page that fills itself in',
    points: [
      'Each plan’s allowances are shown on the blueprint and checked before anything is built.',
      'The booking page fills itself in from your website, with six colour themes.',
      '“Let AI decide” on every choice in the Autopilot wizard.',
    ],
  },
  {
    date: '2026-10-10', area: 'Bookings', title: 'Your own booking page',
    points: [
      'A public booking page with its editor beside it; your hours are shown in each visitor’s own time zone and checked on the server.',
      'The Autopilot wizard writes researched emails for each prospect and finds the first leads while you answer.',
      'Speak instead of typing, with bars that move with your voice.',
    ],
  },
  {
    date: '2026-10-09', area: 'Video Studio', title: 'AI Video Studio',
    points: [
      'An editor, transcription, Shorts and a content library, connected to AI Autopilot.',
      '“Find my solution” on the website: see the plan before you sign up, and it is built when you arrive.',
    ],
  },
];
