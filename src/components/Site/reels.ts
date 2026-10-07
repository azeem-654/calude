/**
 * What the site shows of each module: a few real screens, each with a line
 * saying what it does.
 *
 * ── Why a reel of stills, not a scrolling video ──
 *
 * Each module used to be a looping clip of its page being scrolled top to
 * bottom. That shows that a screen is long. It does not show what the module is
 * *for* — the useful part went past in half a second, at a size nobody could
 * read, between two stretches of blank table. A visitor deciding whether this
 * does the thing they are looking for needs the thing, held still long enough
 * to read, and named.
 *
 * So each module is two to five photographs of the moments that carry its
 * argument — the branch drawn on the workflow, the form made without leaving
 * the step — shown one at a time, with the caption changing with the picture.
 *
 * ── One list, two readers ──
 *
 * The site reads this for captions and alt text. `scripts/site-reels.mts` reads
 * it for which files to produce, and refuses to run if a file here has no
 * capture recipe — so a caption can never sit under a picture of something
 * else, and a new shot cannot be added to the page without being photographed.
 *
 * Every picture is of the running application against a seeded workspace.
 * Nothing is a mock-up; when a screen changes, the picture is retaken.
 */

import { TEMPLATES } from '../Autopilot/workflowTemplates';

export interface ReelShot {
  /** File name under public/site/reel/, without extension. */
  file: string;
  /** What this screen shows, in one line. Shown under the picture. */
  caption: string;
  /** For somebody who cannot see the picture. Says what is on it. */
  alt: string;
  /**
   * The part of the screen worth reading, as fractions of the whole picture —
   * [left, top, width, height]. On a wide screen the slide opens whole, zooms
   * into this and back out (ShotReel). Absent, the slide stays whole.
   */
  focus?: [number, number, number, number];
}

export const REELS: Record<string, ReelShot[]> = {
  /*
   * The hero: the whole platform, a whole window at a time.
   *
   * The owner found the first section showing "half a picture" — close crops
   * of one diagram, zoomed to the window's width and panned, so no moment ever
   * showed a whole screen. These are full app windows (1600×1000) of a busy
   * sample agency — five clients in five trades, branching workflows, thirty
   * days of prospects — and the hero shows each one entire (ShotReel `strip`).
   */
  hero: [
    {
      file: 'hero-board',
      caption: 'AI Autopilot runs every client\'s project on the server — workflows, agents and approvals in one place.',
      alt: 'The AI Autopilot board with five client projects, each with its active workflows',
    },
    {
      file: 'hero-flow',
      caption: 'Workflows that branch: email, wait, check for a reply, create the task, text the ones who opted in.',
      alt: 'A branching outreach workflow with emails, waits, two conditions, a task, a stage change and a text message',
    },
    {
      file: 'hero-prospecting',
      caption: 'AI Prospecting: "real estate agents in Richmond, Virginia" — found live, websites read, every address checked.',
      alt: 'AI Prospecting results for real estate agents in Richmond, Virginia, with checked email addresses on every row',
    },
    {
      file: 'hero-daily',
      caption: 'A project that finds its own prospects every day, and adds the reachable ones to its audience.',
      alt: 'A project\'s Prospects tab: finding every day, today\'s count, a 30-day chart and the latest prospects',
    },
    {
      file: 'hero-dashboard',
      caption: 'The day at a glance — pipeline, revenue won, replies and what Autopilot did overnight.',
      alt: 'The dashboard with the week\'s figures and Autopilot activity',
    },
    {
      file: 'hero-pipeline',
      caption: 'Every deal across six stages, valued and weighted, for every client in every trade.',
      alt: 'The pipeline board with deals in six stages',
    },
  ],
  /* AI Prospecting's own section — searches in different trades and towns,
     and the daily finder that keeps a project's audience growing. */
  prospecting: [
    {
      file: 'hero-prospecting',
      caption: 'Realtors in Richmond, Virginia: 48 found live, their own websites read, every address checked.',
      alt: 'AI Prospecting results for real estate agents in Richmond, Virginia',
    },
    {
      file: 'pr-dentists',
      caption: 'Dentists in Leeds — the same sentence works for any trade, in any town.',
      alt: 'AI Prospecting results for dentists in Leeds',
    },
    {
      file: 'pr-lawyers',
      caption: 'Law firms in Denver, with the address each one publishes and whether it takes mail.',
      alt: 'AI Prospecting results for law firms in Denver',
    },
    {
      file: 'pr-start',
      caption: 'Every search kept: realtors, dentists, law firms, gyms, restaurants, salons, garages, vets…',
      alt: 'The AI Prospecting start screen with recent searches across many trades and saved lead lists',
    },
    {
      file: 'pr-every-day',
      caption: '"Connect to AI Autopilot" makes a tested search a project\'s recurring lead source.',
      alt: 'The Connect to AI Autopilot wizard: the linked search, its criteria, and how many verified leads a run',
    },
    {
      file: 'hero-daily',
      caption: 'The project finds up to your number of new, reachable prospects a day — and shows its work.',
      alt: 'A project\'s Prospects tab with today\'s count, a 30-day chart and the latest prospects',
    },
    {
      file: 'pr-daily-chart',
      caption: 'Thirty days at a glance: added each day, the searches in its rotation, and every prospect with its check.',
      alt: 'The daily chart of prospects added, the rotation of searches, and the latest prospects table',
    },
  ],
  autopilot: [
    {
      file: 'ap-describe',
      caption: 'Describe what you want in a sentence — typed, spoken, or with files and a website.',
      alt: 'The new project screen with a box asking what the project should do',
    },
    {
      file: 'ap-diagram',
      caption: 'Every workflow drawn as it runs, each fork labelled and every branch joined up.',
      alt: 'A workflow drawn as connected steps, with a Yes and a No branch leaving a condition',
    },
    {
      file: 'ap-step',
      caption: 'The pen on any step opens just that step — guided, with your real forms, tags and stages.',
      alt: 'A side panel editing one step, listing the ways a workflow can start',
    },
    {
      file: 'ap-gallery',
      /* Counted from the library, so the number cannot go stale when a
         template is added. */
      caption: `${TEMPLATES.length} ready-made workflows, filed by the problem they solve, previewed in full.`,
      alt: 'The template gallery with a workflow preview on each row',
    },
    {
      file: 'ap-board',
      caption: 'Each project with its own agents, permissions, schedule and what it has made.',
      alt: 'The AI Autopilot board showing a project and its AI assistant column',
    },
  ],
  contacts: [
    { file: 'contacts-list', caption: 'Everyone you have spoken to, with health, stage and value on every row.', alt: 'The contact list' },
    { file: 'contacts-profile', caption: 'One person, with every email, deal, task and note — and the next best action.', alt: 'A contact profile' },
  ],
  pipelines: [
    { file: 'pipe-board', caption: 'Deals by stage, with open and weighted value counted from your records.', alt: 'The pipeline board' },
    { file: 'pipe-table', caption: 'The same deals as a table, sorted however you need them.', alt: 'The pipeline as a table' },
  ],
  marketing: [
    { file: 'mkt-campaigns', caption: 'Campaigns, with what was sent, opened, clicked and replied to.', alt: 'The campaigns list with performance figures' },
    { file: 'mkt-sequences', caption: 'Multi-step sequences, written with AI, that stop the moment somebody answers.', alt: 'The sequence editor' },
  ],
  engagement: [
    { file: 'eng-forms', caption: 'Forms that create the contact and start the follow-up the moment they are sent.', alt: 'The forms list' },
    { file: 'eng-tickets', caption: 'Support tickets with a reference, a priority and a reply thread.', alt: 'A support ticket opened' },
  ],
  funnels: [
    { file: 'funnels-list', caption: 'Funnels with visitors, conversions and revenue per step.', alt: 'The funnels list' },
  ],
  websites: [
    { file: 'sites-list', caption: 'Whole websites, built and published from the same login.', alt: 'The websites list' },
  ],
  social: [
    { file: 'social-gallery', caption: 'Posts on the right canvas for each platform, written for you by your projects.', alt: 'The social creator' },
    { file: 'social-editor', caption: 'Every post is a real design you can change before it goes out.', alt: 'The social post editor' },
  ],
  blog: [
    { file: 'blog-projects', caption: 'A topic plan from your own portfolio, written to what your buyers search for.', alt: 'Blog automation projects' },
  ],
  calendar: [
    { file: 'cal-week', caption: 'The week on one grid, with who booked what and who to call next.', alt: 'The calendar week view' },
  ],
  agency: [
    { file: 'agency', caption: 'A workspace per client, each with its own plan, price and white-label brand.', alt: 'The agency dashboard listing client sub-accounts' },
  ],
  analytics: [
    { file: 'analytics', caption: 'Revenue, leads and where they came from, read live from the modules.', alt: 'The reports screen' },
  ],
  dashboard: [
    { file: 'dashboard', caption: 'The day at a glance: what Autopilot did, and what to do next.', alt: 'The dashboard' },
    { file: 'ap-board', caption: 'AI Autopilot running your projects on the server, every five minutes.', alt: 'The AI Autopilot board' },
    { file: 'ap-diagram', caption: 'Every workflow drawn as it runs, with each branch joined up.', alt: 'A branching workflow' },
    { file: 'pipe-board', caption: 'Every deal on one board.', alt: 'The pipeline board' },
  ],
};

/*
 * Where each screen is worth reading — [left, top, width, height] of the
 * desktop picture, read off a 10% grid laid over the captures. ShotReel opens
 * the slide whole, zooms here, holds, and zooms back out. Retake a picture and
 * its region may move: check it on the grid (scripts/site-reels.mts) before
 * shipping new captures.
 */
const FOCUS: Record<string, [number, number, number, number]> = {
  'hero-board': [0.06, 0.47, 0.56, 0.36],
  'hero-flow': [0.06, 0.1, 0.52, 0.36],
  'hero-prospecting': [0.05, 0.37, 0.5, 0.32],
  'hero-daily': [0.05, 0.18, 0.5, 0.34],
  'hero-dashboard': [0.06, 0.14, 0.5, 0.31],
  'hero-pipeline': [0.05, 0.12, 0.5, 0.32],
  'ap-describe': [0.21, 0.14, 0.44, 0.3],
  'ap-diagram': [0.05, 0.1, 0.48, 0.32],
  'ap-step': [0.6, 0, 0.4, 0.4],
  'ap-gallery': [0.05, 0.15, 0.48, 0.34],
  'ap-board': [0.05, 0.15, 0.5, 0.34],
  'pr-start': [0.2, 0.12, 0.5, 0.34],
  'pr-dentists': [0.04, 0.25, 0.5, 0.32],
  'pr-lawyers': [0.04, 0.25, 0.5, 0.32],
  'pr-every-day': [0.03, 0.44, 0.48, 0.3],
  'pr-daily-chart': [0.03, 0, 0.5, 0.32],
  'dashboard': [0.05, 0.08, 0.5, 0.32],
  'contacts-list': [0.03, 0.1, 0.5, 0.32],
  'contacts-profile': [0.56, 0, 0.44, 0.44],
  'pipe-board': [0.05, 0.1, 0.5, 0.34],
  'pipe-table': [0.05, 0.1, 0.5, 0.34],
  'mkt-campaigns': [0.05, 0.08, 0.5, 0.34],
  'mkt-sequences': [0.05, 0.08, 0.5, 0.32],
  'eng-forms': [0.17, 0.08, 0.5, 0.32],
  'eng-tickets': [0.17, 0.08, 0.5, 0.32],
  'funnels-list': [0.05, 0.08, 0.5, 0.34],
  'sites-list': [0.05, 0.08, 0.5, 0.34],
  'social-gallery': [0.15, 0.08, 0.55, 0.38],
  'social-editor': [0.15, 0.2, 0.62, 0.4],
  'blog-projects': [0.05, 0.08, 0.5, 0.34],
  'cal-week': [0.05, 0.08, 0.5, 0.34],
  'agency': [0.05, 0.08, 0.5, 0.34],
  'analytics': [0.05, 0.08, 0.5, 0.34],
};
for (const list of Object.values(REELS)) for (const shot of list) shot.focus ??= FOCUS[shot.file];

/** Every distinct file, for the capture script. */
export const REEL_FILES: string[] = [...new Set(Object.values(REELS).flat().map(s => s.file))];
