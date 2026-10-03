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
      caption: '"Search this every day" hands a search to an AI Autopilot project.',
      alt: 'The Search this every day panel, choosing a project and how many new prospects a day',
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

/** Every distinct file, for the capture script. */
export const REEL_FILES: string[] = [...new Set(Object.values(REELS).flat().map(s => s.file))];
