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
