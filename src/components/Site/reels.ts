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
 * the step — shown one at a time, with the caption changing with the picture,
 * and every one of them a screen of the module its section is about.
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
   * The module the screen belongs to, as its feature block under the reel
   * names it ("Contacts", "Pipelines"). A chapter's reel runs through several
   * modules, so each slide says whose screen it is and the block it belongs
   * to is lit while it shows (FeatureStage). Left out where the whole reel is
   * one module (AI Autopilot, AI Prospecting).
   */
  module?: string;
  /**
   * How it works and what it brings in, a line at a time, shown over the
   * screen one after another while the page travels. Each line says what is
   * on this screen — never a result the screen does not show.
   */
  notes?: string[];
}

/*
 * ── One section, its own screens ──
 *
 * The owner found the sections showing each other's screens: a chapter about
 * Contacts opened on a list full of AI Autopilot prospects, AI Prospecting's
 * reel ended on two AI Autopilot boards, "Your mailbox" and "Your domain"
 * both showed the campaigns list, and the agents section showed a missed-call
 * workflow. So every reel here is screens of the module its section is about
 * and nothing else, several different screens each — and each recipe in
 * scripts/site-reels.mts checks that it landed on that module's own address
 * and heading before it may take the picture, so a redirect to the dashboard
 * can never be photographed as somebody else's module again.
 */
export const REELS: Record<string, ReelShot[]> = {
  /*
   * The hero: the whole platform, a whole window at a time.
   *
   * The owner found the first section showing "half a picture" — close crops
   * of one diagram, zoomed to the window's width and panned, so no moment ever
   * showed a whole screen. These are full app windows of a busy sample agency
   * — five clients in five trades, branching workflows, thirty days of
   * prospects — and the hero shows each one entire (ShotReel `strip`). It is
   * the one reel that is meant to cross modules: it is the platform.
   */
  hero: [
    {
      file: 'hero-board',
      caption: 'AI Autopilot runs every client\'s project on the server — what it did, and what waits for you.',
      alt: 'The AI Autopilot board: a client project\'s overview with its workflows, what it made and what waits for approval',
    },
    {
      file: 'hero-flow',
      caption: 'Workflows that branch: email, wait, check for a reply, create the task, text the ones who opted in.',
      alt: 'A branching outreach workflow with emails, two conditions, a task and a text message',
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
      caption: 'The day at a glance — meetings, deals in motion and what AI Autopilot did overnight.',
      alt: 'The dashboard with the day\'s meetings and AI Autopilot activity',
    },
    {
      file: 'hero-pipeline',
      caption: 'Every deal across six stages, valued and weighted, for every client in every trade.',
      alt: 'The pipeline board with deals in six stages',
    },
  ],

  /* AI Autopilot's own section: describe, see the workflows, change a step,
     start from a template, approve what it wants to send. */
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
      file: 'ap-activity',
      caption: 'What each project did, what its agents made, and what is coming up next.',
      alt: 'A project\'s Activity tab: actions carried out, posts its agents made, and what is planned',
    },
  ],

  /* AI Prospecting's own section — searches in different trades and towns,
     and turning one into a project's lead source. Only AI Prospecting's own
     screen: the daily finder underneath is drawn by the section itself. */
  prospecting: [
    {
      file: 'hero-prospecting',
      caption: 'Realtors in Richmond, Virginia: found live, their own websites read, every address checked.',
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
      file: 'pr-addto',
      caption: 'Tick the ones you want and add them to a list, a workflow, a project or a campaign.',
      alt: 'AI Prospecting results for accountants in Manchester with rows ticked and the Add to menu open',
    },
    {
      file: 'pr-every-day',
      caption: '"Connect to AI Autopilot" makes a tested search a project\'s recurring lead source.',
      alt: 'The Connect to AI Autopilot wizard: the linked search, its criteria, and how many verified leads a run',
    },
  ],

  /* ── The chapters. Each tile names its module's screens; the chapter's reel
     runs through them in the order the tiles are listed. ── */
  contacts: [
    { file: 'contacts-list', module: 'Contacts', caption: 'Everyone you have spoken to, with health, stage, deals and value on every row.', alt: 'The contact list sorted by value' },
    { file: 'contacts-profile', module: 'Contacts', caption: 'One person on one page — lifecycle, open deals, meetings and the next best action.', alt: 'A contact profile with lifecycle stage, open deals, appointments and contact details' },
    { file: 'contacts-deals', module: 'Contacts', caption: 'Their deals, from the same page — what is open, at what value, in which stage.', alt: 'A contact profile on its Deals tab' },
  ],
  funnels: [
    { file: 'funnels-list', module: 'Funnels', caption: 'Funnels with visitors, conversions and revenue per funnel.', alt: 'The funnels list' },
    { file: 'funnels-builder', module: 'Funnels', caption: 'Each step of a funnel, its numbers, its split test and its page.', alt: 'A funnel opened in the builder on its first step' },
  ],
  websites: [
    { file: 'sites-list', module: 'Websites', caption: 'Whole websites, built and published from the same login.', alt: 'The websites list' },
    { file: 'sites-builder', module: 'Websites', caption: 'Every page built from blocks you drag in and edit in place.', alt: 'A website open in the drag-and-drop builder' },
  ],
  social: [
    { file: 'social-gallery', module: 'Social creator', caption: 'Posts on the right canvas for each platform, written for you by your projects.', alt: 'The social creator with templates and the designs made so far' },
    { file: 'social-editor', module: 'Social creator', caption: 'Every post is a real design you can change before it goes out.', alt: 'The social post editor' },
  ],
  blog: [
    { file: 'blog-projects', module: 'Blog automation', caption: 'A blog project per site: its clusters, keywords and the pages it has to lift.', alt: 'Blog automation projects' },
    { file: 'blog-strategy', module: 'Blog automation', caption: 'The ranking strategy: what you sell, how you write, the pages to rank and the topic clusters.', alt: 'A blog project\'s ranking strategy' },
  ],
  pipelines: [
    { file: 'pipe-board', module: 'Pipelines', caption: 'Deals by stage, with open and weighted value counted from your records.', alt: 'The pipeline board' },
    { file: 'pipe-deal', module: 'Pipelines', caption: 'A deal opened: its deadline, owners, labels, sub-tasks and history.', alt: 'A deal opened from the pipeline board' },
    { file: 'pipe-table', module: 'Pipelines', caption: 'The same deals as a table, sorted however you need them.', alt: 'The pipeline as a table' },
  ],
  marketing: [
    { file: 'mkt-campaigns', module: 'Email & sequences', caption: 'Campaigns, with what was sent, opened, clicked and replied to.', alt: 'The campaigns list with performance figures' },
    { file: 'mkt-sequences', module: 'Email & sequences', caption: 'Multi-step sequences, written with AI, that stop the moment somebody answers.', alt: 'The sequence editor' },
  ],
  engagement: [
    { file: 'eng-forms', module: 'Forms & tickets', caption: 'A form built in place: its questions, what it says after sending, who is told.', alt: 'A form open in the form editor' },
    { file: 'eng-tickets', module: 'Forms & tickets', caption: 'Support tickets with a reference, a status and a reply thread.', alt: 'A support ticket opened' },
  ],
  calendar: [
    { file: 'cal-week', module: 'Calendar', caption: 'The week on one grid, with who booked what and who to call next.', alt: 'The calendar week view' },
    { file: 'cal-booking', module: 'Calendar', caption: 'Your public booking page, edited beside the real thing.', alt: 'The booking page editor with the live page beside it' },
  ],
  agency: [
    { file: 'agency', module: 'Agency & sub-accounts', caption: 'A workspace per client, each with its own plan and price.', alt: 'The agency dashboard listing client sub-accounts' },
    { file: 'agency-brand', module: 'Agency & sub-accounts', caption: 'White-label: your product name and sign-in screen, previewed as you type.', alt: 'Settings, Branding: the white-label form and its preview' },
  ],
  analytics: [
    { file: 'analytics', module: 'Analytics', caption: 'Revenue, leads and where they came from, read live from the modules.', alt: 'The reports overview' },
    { file: 'analytics-revenue', module: 'Analytics', caption: 'Revenue by project: paid orders credited to the project that brought them in.', alt: 'Reports, Revenue by project' },
  ],

  /* "Your sources in. Every channel out." — the agents, not the workflows. */
  agents: [
    { file: 'agent-list', caption: 'A project\'s agents on their schedule: what each reads, what it makes and where it lands.', alt: 'A project\'s AI Agents tab listing its scheduled agents' },
    { file: 'agent-flow', caption: 'An agent is a step in a workflow: every day, write a post from the client\'s portfolio.', alt: 'A content workflow: a daily trigger and an AI agent step' },
  ],

  /* The four "Yours, not ours" tabs, each its own screen. */
  mailbox: [
    { file: 'own-mailbox', caption: 'Your own mailboxes — each checked by actually connecting, before anything sends.', alt: 'Settings, Email & SMS: the workspace\'s connected mailboxes' },
  ],
  domain: [
    { file: 'own-domain', caption: 'Sender reputation from your own sending, and the SPF, DKIM and DMARC records for your domain.', alt: 'Settings, Email Deliverability: sender reputation and the records to publish' },
  ],
  brand: [
    { file: 'agency-brand', caption: 'Your product name and sign-in headline, previewed in the top bar and on the sign-in screen.', alt: 'Settings, Branding: the white-label form and its preview' },
  ],
  data: [
    { file: 'own-data', caption: 'A protected workspace: who can open it, every signed-in device and every sign-in.', alt: 'Settings, Security & Privacy' },
  ],

  /* The closing call: the product's home, where the day starts. */
  dashboard: [
    { file: 'hero-dashboard', caption: 'The day at a glance: what AI Autopilot did, and what to do next.', alt: 'The dashboard' },
  ],
};

/*
 * The lines that come up over each screen while it is read, one at a time:
 * what you do, what it does for you, and what comes out of it.
 */
const NOTES: Record<string, string[]> = {
  'hero-board': ['Each client gets a project that runs on the server, every five minutes', 'Its workflows, what it has made and what it is set up to do', 'You approve what matters — the rest runs itself'],
  'hero-flow': ['A workflow emails, waits and checks for a reply', 'Replies become tasks; the quiet ones get a follow-up', 'Texts go only to people who said yes'],
  'hero-prospecting': ['Type who you want and where', 'It searches live, reads each business\'s own website and finds its address', 'Every address is checked before it reaches your list'],
  'hero-daily': ['Set the trades, the towns and how many a day', 'The project finds new businesses every day on its own', 'Only reachable prospects join the audience — then the outreach starts'],
  'hero-dashboard': ['Your day at a glance', 'Meetings, deals in motion and what AI Autopilot did', 'And what is waiting on you, ready to press'],
  'hero-pipeline': ['Every deal in its stage, for every client', 'Values weighted by stage, so the forecast is honest', 'Drag a deal forward the moment it moves'],
  'ap-describe': ['Say what you want in one sentence — or speak it', 'Add your website or files for the rest', 'Or start from a ready-made solution'],
  'ap-diagram': ['Every step drawn as it runs', 'Each fork labelled: Yes or No', 'Change any step in place with the pen'],
  'ap-step': ['Open just the step you want to change', 'Pick from your real forms, tags and stages', 'Test it before it goes live'],
  'ap-gallery': ['Ready-made workflows, filed by the problem they solve', 'Preview the whole flow before you use it', 'One press adds it to a project'],
  'ap-activity': ['What the project carried out, and when', 'What its agents made, with a link to each', 'And what it plans next'],
  'pr-start': ['One sentence starts a search: a trade and a town', 'Every search is kept, with its results and checks', 'Saved lists sit beside them'],
  'pr-dentists': ['The same sentence works for any trade, in any town', 'Websites read live, addresses found where the business published them', 'Each address checked as it goes'],
  'pr-lawyers': ['Firms found with the address each one publishes', 'Whether that address takes mail, checked as it goes', 'Every row says when it was found'],
  'pr-addto': ['Tick the businesses you want', 'Save them to a list, or add them to a workflow, a project or a campaign', 'They are imported once, never twice'],
  'pr-every-day': ['Connect a search you tested to an AI Autopilot project', 'Pick the schedule and how many verified leads a run', 'Duplicates and opt-outs are turned away automatically'],
  'contacts-list': ['Everyone you have spoken to, in one list', 'Health, stage, deals and value on every row', 'Sort, filter, tag and export in a couple of clicks'],
  'contacts-profile': ['One person, on one page', 'Lifecycle stage, open deals and meetings at the top', 'The next best action, suggested'],
  'contacts-deals': ['Every deal with this person', 'Its stage and its value', 'Without leaving their page'],
  'funnels-list': ['Every funnel with its visitors and conversions', 'Revenue counted where it was made', 'Open any one in the builder'],
  'funnels-builder': ['Each step of the funnel in order', 'Its visitors, conversions and rate', 'Split-test a page, or edit it'],
  'sites-list': ['Whole websites, built from the same login', 'Published or still in draft', 'Visitors and views on each'],
  'sites-builder': ['Pages built from ready blocks', 'Drag a block in, then edit it in place', 'Preview on desktop, tablet and phone'],
  'social-gallery': ['Posts on the right canvas for each platform', 'Start from a template or from what your projects wrote', 'Every design kept in one place'],
  'social-editor': ['Every post is a real design', 'Change the words, colours and picture before it goes out', 'Export it as a PNG'],
  'blog-projects': ['A blog project for each site', 'Its clusters, keywords and the pages it must lift', 'Portfolio, strategy, plan, write and publish'],
  'blog-strategy': ['What you sell and who to', 'How you write, measured from your own writing', 'Topic clusters pointed at the pages that earn'],
  'pipe-board': ['Deals by stage, with open and weighted value', 'Owners, dates and priority on every card', 'Won deals count straight into revenue'],
  'pipe-deal': ['Open any deal', 'Its deadline, owners, labels and sub-tasks', 'Comments and history in one place'],
  'pipe-table': ['The same deals as a sortable table', 'Owners, values and close dates side by side', 'Spot what is stuck at a glance'],
  'mkt-campaigns': ['Every campaign with what was sent and opened', 'Clicks and replies counted per send', 'See what works, and send more of it'],
  'mkt-sequences': ['Multi-step sequences written with AI', 'They stop the moment somebody answers', 'Each step with its own timing'],
  'eng-forms': ['Build a form in place', 'Its questions, its thank-you line and its consent wording', 'Every submission becomes a contact'],
  'eng-tickets': ['Every request gets a reference', 'Reply in the thread, or leave an internal note', 'Move it from open to resolved'],
  'cal-week': ['The week on one grid', 'Who booked what, from your booking page', 'And who to call next'],
  'cal-booking': ['Your public booking page', 'Edit it on the left, see it on the right', 'Visitors pick a time in their own time zone'],
  'agency': ['A workspace for every client', 'Each with its own plan and price', 'Open any of them in one click'],
  'agency-brand': ['Your product name, not ours', 'Your logo and your sign-in headline', 'Previewed before you save'],
  'analytics': ['Revenue, leads and where they came from', 'Read live from every module', 'Deals by stage and by owner'],
  'analytics-revenue': ['Paid orders, credited to the project that brought them', 'Refunds beside revenue, never inside it', 'What AI Autopilot recovered, counted'],
  'agent-list': ['Agents that run on a schedule', 'What each one reads and what it makes', 'Everything it makes is a draft until you publish'],
  'agent-flow': ['An agent is one step in a workflow', 'Every day it reads the client\'s portfolio', 'And writes the post into the Social creator'],
  'own-mailbox': ['Your own mailboxes, as many as you need', 'Each checked by connecting, sending and receiving', 'Passwords kept on the server, never shown again'],
  'own-domain': ['A reputation score from your own sending', 'SPF, DKIM and DMARC written for your domain', 'Copy each record to your DNS'],
  'own-data': ['Your workspace is access-controlled on the server', 'Every signed-in device, and every sign-in', 'Who can open it, and nobody else'],
};
for (const list of Object.values(REELS)) for (const shot of list) {
  shot.notes ??= NOTES[shot.file];
}

/** Every distinct file, for the capture script. */
export const REEL_FILES: string[] = [...new Set(Object.values(REELS).flat().map(s => s.file))];
