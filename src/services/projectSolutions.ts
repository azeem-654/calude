/**
 * The project solutions a new project can start from, and the questions each
 * one genuinely needs.
 *
 * ── Why this replaced `projectJobs.ts` as the wizard's front door ──
 *
 * The old wizard opened on seven complaints, six of them about sales, and every
 * path ran through a sending-setup screen. Somebody who typed "one image post a
 * day" was asked what kind of trade they were and how many mailboxes they
 * wanted. The shape was fixed, so the only way to vary it was to add steps to
 * everybody.
 *
 * This file is the other way round. A *solution* is a business outcome ("Social
 * Media Growth", "E-commerce Store") that names:
 *
 *   - the words people use when they want it (`keywords`), so a sentence can
 *     find it without anybody choosing a card;
 *   - the questions it cannot be built without, drawn from one shared bank,
 *     so "how often?" is asked the same way for a blog and for posts, and asked
 *     once when a project is both;
 *   - the workflows it builds from the answers — existing gallery templates
 *     where one fits, generated agent graphs where one does not.
 *
 * Nothing here is a questionnaire. `projectIntake.ts` decides which questions
 * actually get asked, and drops every one already answered by the prompt, the
 * attachments, or the business profile the workspace already has.
 *
 * ── The rule every builder follows ──
 *
 * A workflow in a blueprint must be something this product can run *today*.
 * The engine can read a profile, a page, a web search, a feed or a YouTube
 * channel, and write social designs, blog drafts or an email campaign — or it
 * can walk a contact through waits, conditions, sends, tags and tasks. Anything
 * a customer asks for beyond that (posting straight to Instagram, importing
 * from Shopify) is said as a manual action or a limitation, never drawn as a
 * workflow that will quietly do nothing.
 */
import type { WorkflowNode } from './autopilot';
import { TEMPLATES } from '../components/Autopilot/workflowTemplates';

/* ── Vocabulary ────────────────────────────────────────────────────────────── */

/**
 * What a project works in.
 *
 * Wider than the planner's own list (`worker/src/lib/projectBrief.ts`) because
 * the blueprint also names things only a workflow does — `support`, `tasks`.
 * `plannerChannelsFor` narrows it to what the planner understands.
 */
export type Channel =
  | 'social' | 'blog' | 'email' | 'sms' | 'shop' | 'book' | 'site' | 'video'
  | 'contacts' | 'sales' | 'reviews' | 'support' | 'tasks';

export type QuestionType = 'single' | 'multi' | 'text' | 'number' | 'business' | 'inspiration';

/**
 * Screens group questions so no screen is a form.
 *
 * One group per screen, at most three questions on it. The group's title is
 * what the screen is called, so it says what is being decided rather than
 * "Step 3".
 */
export type QuestionGroup =
  | 'business' | 'deliverable' | 'schedule' | 'style' | 'audience' | 'contacts'
  | 'offer' | 'sending' | 'catalogue' | 'store' | 'booking' | 'handoff' | 'custom';

export const GROUP_TITLE: Record<QuestionGroup, string> = {
  business: 'Your business',
  deliverable: 'What it should make',
  schedule: 'When it runs',
  style: 'How it should look and sound',
  audience: 'Who it is for',
  contacts: 'The people it works with',
  offer: 'What you are offering',
  sending: 'Who it sends from',
  catalogue: 'Your products',
  store: 'Your store',
  booking: 'Appointments',
  handoff: 'What happens to the result',
  custom: 'A few details',
};

/** The order screens appear in, whichever solutions contributed them. */
export const GROUP_ORDER: QuestionGroup[] = [
  'business', 'deliverable', 'catalogue', 'audience', 'contacts', 'offer',
  'schedule', 'booking', 'style', 'store', 'sending', 'handoff', 'custom',
];

export interface QuestionOption {
  value: string;
  label: string;
  hint?: string;
}

export interface Question {
  id: string;
  group: QuestionGroup;
  prompt: string;
  help?: string;
  type: QuestionType;
  options?: QuestionOption[];
  /**
   * `required` — the project cannot be built reliably without it.
   * `optional` — it improves the result; skipping is fine.
   *
   * Most `required` questions still offer "Let AI decide", because a required
   * decision is not the same thing as a decision the customer must make.
   */
  need: 'required' | 'optional';
  /**
   * What "Let AI decide" resolves to.
   *
   * A concrete value rather than a flag, so the blueprint can say what it
   * decided ("Weekdays — chosen for you") and the customer can see it and
   * change it. Absent means the question has no safe default and the AI option
   * is not offered.
   */
  aiDecides?: string | string[];
  placeholder?: string;
  /** Only asked when another answer is one of these. Declarative, so a question
   *  written by the AI can carry one too. */
  showIf?: { id: string; in: string[] };
}

/* ── The question bank ────────────────────────────────────────────────────── */

/*
 * One bank, many solutions.
 *
 * Every question lives here once. Two solutions that both need "how often?"
 * share an id, so a project that is both a blog and social posts asks it once
 * — and answering it once is what the customer expected.
 */
const Q: Record<string, Question> = {
  business: {
    id: 'business', group: 'business', type: 'business', need: 'required',
    prompt: 'How should Autopilot learn about the business?',
    help: 'Everything it writes starts from this. A profile that says what you sell and who buys it writes very differently from one that says "services".',
  },
  website: {
    id: 'website', group: 'business', type: 'text', need: 'required',
    prompt: 'The business website',
    placeholder: 'https://yourcompany.com',
    help: 'Read once now, so the profile says what the site says.',
    showIf: { id: 'business', in: ['website'] },
  },

  /* ── Social ── */
  socialOutputs: {
    id: 'socialOutputs', group: 'deliverable', type: 'multi', need: 'required',
    prompt: 'What should each post include?',
    options: [
      { value: 'image', label: 'A branded image', hint: 'Your headline set on a design in your colours — not a stock photo' },
      { value: 'caption', label: 'A caption' },
      { value: 'hashtags', label: 'Hashtags' },
      { value: 'variants', label: 'A version per platform', hint: 'Square for Instagram and Facebook, wide for LinkedIn and X' },
    ],
    aiDecides: ['image', 'caption', 'hashtags', 'variants'],
  },
  frequency: {
    id: 'frequency', group: 'schedule', type: 'single', need: 'required',
    prompt: 'How often?',
    options: [
      { value: 'daily', label: 'Every day' },
      { value: 'weekdays', label: 'Weekdays' },
      { value: '3-week', label: '3 times a week', hint: 'Monday, Wednesday and Friday' },
      { value: 'weekly', label: 'Once a week' },
    ],
    aiDecides: 'weekdays',
  },
  platforms: {
    id: 'platforms', group: 'deliverable', type: 'multi', need: 'required',
    prompt: 'Which platforms should it prepare posts for?',
    help: 'Autopilot makes the posts. Publishing them is done by you — it does not post to social networks itself.',
    options: [
      { value: 'instagram', label: 'Instagram' },
      { value: 'facebook', label: 'Facebook' },
      { value: 'linkedin', label: 'LinkedIn' },
      { value: 'twitter', label: 'X' },
    ],
    aiDecides: ['instagram', 'facebook'],
  },
  postsPerRun: {
    id: 'postsPerRun', group: 'deliverable', type: 'single', need: 'optional',
    prompt: 'How many versions each time?',
    options: [
      { value: '1', label: 'One' },
      { value: '2', label: 'Two to choose from' },
      { value: '3', label: 'Three' },
    ],
    aiDecides: '1',
  },
  inspiration: {
    id: 'inspiration', group: 'style', type: 'inspiration', need: 'optional',
    prompt: 'Do you have examples of the style you like?',
    help: 'An image, a post you admire, a brand guide or a link. Skip it and Autopilot works from your brand colours, industry and audience.',
  },
  brandColor: {
    id: 'brandColor', group: 'style', type: 'text', need: 'optional',
    prompt: 'Your main brand colour',
    placeholder: '#5b7cfa',
    help: 'Used as the background of every design. Leave blank and it uses the one on your profile.',
  },
  approval: {
    id: 'approval', group: 'handoff', type: 'single', need: 'required',
    prompt: 'When something is finished, what should happen?',
    options: [
      { value: 'review', label: 'Wait for me to review it', hint: 'Marked "needs review" until you look' },
      { value: 'ready', label: 'Mark it ready to publish', hint: 'You still publish it yourself' },
    ],
    aiDecides: 'review',
  },

  /* ── Blog ── */
  topics: {
    id: 'topics', group: 'deliverable', type: 'text', need: 'optional',
    prompt: 'Topics or keywords to write about',
    placeholder: 'boiler servicing, landlord gas safety, heat pumps',
    help: 'Leave it and Autopilot picks from what the business sells and what its customers search for.',
  },
  blogSource: {
    id: 'blogSource', group: 'deliverable', type: 'single', need: 'required',
    prompt: 'What should each article be written from?',
    options: [
      { value: 'portfolio', label: 'What the business does', hint: 'Evergreen articles from the profile' },
      { value: 'web', label: 'Fresh research each time', hint: 'A Google search on your topic, cited' },
      { value: 'rss', label: 'A news feed I follow' },
      { value: 'youtube', label: 'My YouTube videos' },
    ],
    aiDecides: 'portfolio',
  },
  sourceUrl: {
    id: 'sourceUrl', group: 'deliverable', type: 'text', need: 'required',
    prompt: 'The feed address or YouTube channel ID',
    placeholder: 'https://example.com/feed  or  UCxxxxxxxx',
    showIf: { id: 'blogSource', in: ['rss', 'youtube'] },
  },
  blogFrequency: {
    id: 'blogFrequency', group: 'schedule', type: 'single', need: 'required',
    prompt: 'How often should a new article be drafted?',
    options: [
      { value: 'weekly', label: 'Once a week' },
      { value: '2-week', label: 'Twice a week', hint: 'Tuesday and Friday' },
      { value: 'daily', label: 'Every day' },
      { value: 'monthly', label: 'Once a month' },
    ],
    aiDecides: 'weekly',
  },
  blogDestination: {
    id: 'blogDestination', group: 'handoff', type: 'single', need: 'optional',
    prompt: 'Where should finished articles go?',
    options: [
      { value: 'drafts', label: 'Drafts in the Blog', hint: 'You publish when happy' },
      { value: 'publish', label: 'My website, after I approve each one', hint: 'Needs a connected WordPress site' },
    ],
    aiDecides: 'drafts',
  },

  /* ── Video ── */
  videoSource: {
    id: 'videoSource', group: 'deliverable', type: 'single', need: 'required',
    prompt: 'Where do the videos come from?',
    options: [
      { value: 'youtube', label: 'My YouTube channel', hint: 'New uploads become posts and articles' },
      { value: 'scripts', label: 'I need scripts to film', hint: 'Short-video scripts, written for you' },
    ],
    aiDecides: 'scripts',
  },
  channelId: {
    id: 'channelId', group: 'deliverable', type: 'text', need: 'required',
    prompt: 'The YouTube channel ID',
    placeholder: 'UCxxxxxxxxxxxxxxxxxxxxxx',
    help: 'It starts with UC. A handle (@name) will not work — YouTube only publishes a feed for the ID.',
    showIf: { id: 'videoSource', in: ['youtube'] },
  },

  /* ── Catalogue and store ── */
  productSource: {
    id: 'productSource', group: 'catalogue', type: 'single', need: 'required',
    prompt: 'Where are the products now?',
    options: [
      { value: 'upload', label: 'A spreadsheet (CSV)', hint: 'Attach it on the first screen, or here' },
      { value: 'catalogue', label: 'A catalogue or PDF' },
      { value: 'website', label: 'On an existing website' },
      { value: 'existing', label: 'Already in Protected Central' },
      { value: 'manual', label: 'I will add them by hand' },
    ],
  },
  productCount: {
    id: 'productCount', group: 'catalogue', type: 'single', need: 'optional',
    prompt: 'Roughly how many products?',
    options: [
      { value: '1-10', label: '1–10' },
      { value: '11-50', label: '11–50' },
      { value: '51-100', label: '51–100' },
      { value: '100+', label: 'More than 100' },
    ],
    aiDecides: 'detect',
  },
  variants: {
    id: 'variants', group: 'catalogue', type: 'multi', need: 'optional',
    prompt: 'Do products come in variations?',
    options: [
      { value: 'none', label: 'No — each is one thing' },
      { value: 'colour', label: 'Colours' },
      { value: 'size', label: 'Sizes' },
      { value: 'pack', label: 'Pack sizes' },
      { value: 'capacity', label: 'Capacities' },
      { value: 'other', label: 'Something else' },
    ],
    aiDecides: ['none'],
  },
  productFields: {
    id: 'productFields', group: 'catalogue', type: 'multi', need: 'optional',
    prompt: 'What do you already have for each product?',
    help: 'Anything missing — descriptions especially — Autopilot can write.',
    options: [
      { value: 'title', label: 'Names' },
      { value: 'sku', label: 'SKUs' },
      { value: 'description', label: 'Descriptions' },
      { value: 'price', label: 'Prices' },
      { value: 'salePrice', label: 'Sale prices' },
      { value: 'images', label: 'Images' },
      { value: 'category', label: 'Categories' },
      { value: 'inventory', label: 'Stock levels' },
    ],
    aiDecides: ['title', 'price', 'images'],
  },
  storeDesign: {
    id: 'storeDesign', group: 'store', type: 'single', need: 'optional',
    prompt: 'What should the store feel like?',
    options: [
      { value: 'minimal', label: 'Minimal' },
      { value: 'premium', label: 'Premium' },
      { value: 'fashion', label: 'Fashion' },
      { value: 'technology', label: 'Technology' },
      { value: 'family', label: 'Kids and family' },
      { value: 'luxury', label: 'Luxury' },
      { value: 'colourful', label: 'Colourful' },
    ],
    aiDecides: 'minimal',
  },
  shipping: {
    id: 'shipping', group: 'store', type: 'single', need: 'optional',
    prompt: 'How do orders reach buyers?',
    options: [
      { value: 'post', label: 'Posted or couriered' },
      { value: 'local', label: 'Local delivery or collection' },
      { value: 'digital', label: 'Digital — nothing to ship' },
      { value: 'later', label: 'Decide later' },
    ],
    aiDecides: 'later',
  },

  /* ── Audience and contacts ── */
  audience: {
    id: 'audience', group: 'audience', type: 'text', need: 'required',
    prompt: 'Who exactly should it reach?',
    placeholder: 'Amazon sellers doing over £20k a month in the UK',
    help: 'The more specific, the better the list and the writing.',
  },
  location: {
    id: 'location', group: 'audience', type: 'text', need: 'optional',
    prompt: 'Where are they?',
    placeholder: 'Leeds and 20 miles around',
  },
  contactSource: {
    id: 'contactSource', group: 'contacts', type: 'single', need: 'required',
    prompt: 'Where are the contacts?',
    options: [
      { value: 'crm', label: 'Already in Protected Central' },
      { value: 'upload', label: 'A spreadsheet I will import', hint: 'Contacts → Import takes a CSV' },
      { value: 'find', label: 'Find new ones for me', hint: 'Researched and added as leads, with your approval' },
    ],
  },
  contactCount: {
    id: 'contactCount', group: 'contacts', type: 'single', need: 'optional',
    prompt: 'Roughly how many people?',
    options: [
      { value: '<500', label: 'Under 500' },
      { value: '500-2000', label: '500–2,000' },
      { value: '2000-10000', label: '2,000–10,000' },
      { value: '10000+', label: 'More than 10,000' },
    ],
  },

  /* ── Offer ── */
  emailGoal: {
    id: 'emailGoal', group: 'offer', type: 'single', need: 'required',
    prompt: 'What should a reply lead to?',
    options: [
      { value: 'purchase', label: 'A purchase' },
      { value: 'booking', label: 'A booked call or appointment' },
      { value: 'consultation', label: 'A consultation' },
      { value: 'renewal', label: 'A renewal' },
      { value: 'reactivation', label: 'Coming back as a customer' },
    ],
    aiDecides: 'booking',
  },
  offer: {
    id: 'offer', group: 'offer', type: 'text', need: 'required',
    prompt: 'What are you offering them?',
    placeholder: 'A free 20-minute listing audit',
    help: 'One concrete thing. "Our services" gives the writing nothing to say.',
  },
  sequenceLength: {
    id: 'sequenceLength', group: 'offer', type: 'single', need: 'optional',
    prompt: 'How many emails in the sequence?',
    options: [
      { value: '3', label: '3' },
      { value: '5', label: '5' },
      { value: '7', label: '7' },
    ],
    aiDecides: '5',
  },

  /* ── Sending — asked only by projects that send ── */
  sender: {
    id: 'sender', group: 'sending', type: 'text', need: 'optional',
    prompt: 'Who should the emails come from?',
    placeholder: 'Sarah at Pike Plumbing',
    help: 'A person gets more replies than a company name.',
  },
  mailbox: {
    id: 'mailbox', group: 'sending', type: 'single', need: 'required',
    prompt: 'Do you have an email address to send from?',
    options: [
      { value: 'have', label: 'Yes — I will connect my mailbox' },
      { value: 'buy', label: 'No — set one up for me', hint: 'Domains and mailboxes, bought and configured' },
      { value: 'later', label: 'Not sure yet', hint: 'The project starts; nothing sends until this is sorted' },
    ],
  },
  dailyVolume: {
    id: 'dailyVolume', group: 'sending', type: 'single', need: 'optional',
    prompt: 'How many new people a day?',
    help: 'What gets an address blocked is the daily rate from one mailbox, so this sizes the setup.',
    options: [
      { value: '50', label: 'Around 50' },
      { value: '150', label: 'Around 150' },
      { value: '400', label: 'Around 400' },
    ],
    aiDecides: '50',
    showIf: { id: 'contactSource', in: ['find', 'upload'] },
  },
  replyHandling: {
    id: 'replyHandling', group: 'handoff', type: 'single', need: 'optional',
    prompt: 'When somebody replies?',
    options: [
      { value: 'draft', label: 'Draft an answer for me to send' },
      { value: 'notify', label: 'Just tell me' },
    ],
    aiDecides: 'draft',
  },
  booking: {
    id: 'booking', group: 'booking', type: 'single', need: 'optional',
    prompt: 'How should interested people book?',
    options: [
      { value: 'page', label: 'A Protected Central booking page' },
      { value: 'own', label: 'My own booking link' },
      { value: 'none', label: 'No booking — they reply' },
    ],
    aiDecides: 'page',
  },
  bookingUrl: {
    id: 'bookingUrl', group: 'booking', type: 'text', need: 'required',
    prompt: 'Your booking link',
    placeholder: 'https://calendly.com/you',
    showIf: { id: 'booking', in: ['own'] },
  },

  /* ── Appointments ── */
  calendar: {
    id: 'calendar', group: 'booking', type: 'single', need: 'required',
    prompt: 'Where do appointments live?',
    options: [
      { value: 'pc', label: 'Protected Central calendar and booking pages' },
      { value: 'google', label: 'Google Calendar', hint: 'Connected in Settings' },
      { value: 'other', label: 'Somewhere else', hint: 'Autopilot works from what reaches the CRM' },
    ],
    aiDecides: 'pc',
  },
  apptChannels: {
    id: 'apptChannels', group: 'booking', type: 'multi', need: 'required',
    prompt: 'How should it contact people?',
    options: [
      { value: 'email', label: 'Email' },
      { value: 'sms', label: 'Text message', hint: 'Needs an SMS provider' },
    ],
    aiDecides: ['email'],
  },
  apptFocus: {
    id: 'apptFocus', group: 'booking', type: 'multi', need: 'required',
    prompt: 'What should it handle?',
    options: [
      { value: 'reminders', label: 'Reminders before the appointment' },
      { value: 'noshow', label: 'Rebooking people who miss it' },
      { value: 'enquiries', label: 'Answering new enquiries fast' },
    ],
    aiDecides: ['reminders', 'noshow'],
  },

  /* ── Reviews ── */
  reviewPlatform: {
    id: 'reviewPlatform', group: 'deliverable', type: 'single', need: 'required',
    prompt: 'Where do you want reviews?',
    options: [
      { value: 'google', label: 'Google' },
      { value: 'facebook', label: 'Facebook' },
      { value: 'trustpilot', label: 'Trustpilot' },
      { value: 'other', label: 'Somewhere else' },
    ],
    aiDecides: 'google',
  },
  catchUnhappy: {
    id: 'catchUnhappy', group: 'handoff', type: 'single', need: 'optional',
    prompt: 'Check how they felt before asking?',
    options: [
      { value: 'yes', label: 'Yes — unhappy customers come to me first' },
      { value: 'no', label: 'No — ask everybody' },
    ],
    aiDecides: 'yes',
  },

  /* ── Support, onboarding, operations ── */
  supportChannels: {
    id: 'supportChannels', group: 'deliverable', type: 'multi', need: 'required',
    prompt: 'Where do support requests arrive?',
    options: [
      { value: 'chat', label: 'Website chat' },
      { value: 'email', label: 'Email' },
      { value: 'form', label: 'A contact form' },
    ],
    aiDecides: ['chat', 'form'],
  },
  escalation: {
    id: 'escalation', group: 'handoff', type: 'text', need: 'optional',
    prompt: 'Who handles what the AI cannot?',
    placeholder: 'support@yourcompany.com, or a team member',
  },
  onboardingSteps: {
    id: 'onboardingSteps', group: 'deliverable', type: 'multi', need: 'required',
    prompt: 'What should a new client go through?',
    options: [
      { value: 'welcome', label: 'A welcome email' },
      { value: 'intake', label: 'An intake form or questionnaire' },
      { value: 'kickoff', label: 'Booking a kickoff call' },
      { value: 'tasks', label: 'Tasks for my team' },
      { value: 'referral', label: 'A referral ask, later on' },
    ],
    aiDecides: ['welcome', 'kickoff', 'tasks'],
  },
  opsFocus: {
    id: 'opsFocus', group: 'deliverable', type: 'multi', need: 'required',
    prompt: 'Which parts of running the agency should it take on?',
    options: [
      { value: 'onboarding', label: 'Onboarding new clients' },
      { value: 'pipeline', label: 'Chasing deals and proposals' },
      { value: 'support', label: 'Sorting client requests' },
      { value: 'content', label: 'Content for clients' },
    ],
    aiDecides: ['onboarding', 'pipeline'],
  },
  followupFocus: {
    id: 'followupFocus', group: 'deliverable', type: 'multi', need: 'required',
    prompt: 'What needs following up?',
    options: [
      { value: 'enquiries', label: 'New enquiries' },
      { value: 'quotes', label: 'Quotes that went quiet' },
      { value: 'proposals', label: 'Proposals sent' },
      { value: 'stalled', label: 'Deals that stopped moving' },
    ],
    aiDecides: ['quotes', 'proposals'],
  },

  /* ── Recruitment and property ── */
  recruitSide: {
    id: 'recruitSide', group: 'audience', type: 'single', need: 'required',
    prompt: 'Who are you looking for?',
    options: [
      { value: 'candidates', label: 'Candidates for roles' },
      { value: 'clients', label: 'Companies that are hiring' },
      { value: 'both', label: 'Both' },
    ],
  },
  roles: {
    id: 'roles', group: 'audience', type: 'text', need: 'optional',
    prompt: 'Which roles or sectors?',
    placeholder: 'Warehouse and logistics, West Midlands',
  },
  propertySide: {
    id: 'propertySide', group: 'audience', type: 'multi', need: 'required',
    prompt: 'Who do you want to hear from?',
    options: [
      { value: 'sellers', label: 'Sellers' },
      { value: 'buyers', label: 'Buyers' },
      { value: 'landlords', label: 'Landlords' },
      { value: 'tenants', label: 'Tenants' },
    ],
  },

  /* ── Local and launch ── */
  localPriorities: {
    id: 'localPriorities', group: 'deliverable', type: 'multi', need: 'required',
    prompt: 'What would help most?',
    options: [
      { value: 'reviews', label: 'More reviews' },
      { value: 'missed', label: 'Answering missed calls' },
      { value: 'enquiries', label: 'Replying to enquiries fast' },
      { value: 'posts', label: 'Posting regularly' },
      { value: 'search', label: 'Being found on Google' },
    ],
    aiDecides: ['reviews', 'enquiries', 'posts'],
  },
  product: {
    id: 'product', group: 'offer', type: 'text', need: 'required',
    prompt: 'What are you launching?',
    placeholder: 'A new online course for first-time landlords',
  },
  launchChannels: {
    id: 'launchChannels', group: 'deliverable', type: 'multi', need: 'required',
    prompt: 'Where should the launch show up?',
    options: [
      { value: 'page', label: 'A launch page' },
      { value: 'email', label: 'An email to existing customers' },
      { value: 'social', label: 'Social posts' },
      { value: 'blog', label: 'An article' },
    ],
    aiDecides: ['page', 'email', 'social'],
  },

  /* ── Something different ── */
  customOutput: {
    id: 'customOutput', group: 'custom', type: 'multi', need: 'required',
    prompt: 'What should it produce?',
    options: [
      { value: 'social', label: 'Social posts' },
      { value: 'blog', label: 'Articles' },
      { value: 'email', label: 'Emails to a list' },
      { value: 'tasks', label: 'Tasks and reminders for my team' },
      { value: 'page', label: 'A web page' },
    ],
  },
  customTrigger: {
    id: 'customTrigger', group: 'custom', type: 'single', need: 'required',
    prompt: 'What should set it off?',
    options: [
      { value: 'schedule', label: 'A schedule' },
      { value: 'contact', label: 'A new contact or enquiry' },
      { value: 'form', label: 'A form being filled in' },
      { value: 'deal', label: 'A deal changing stage' },
      { value: 'appointment', label: 'An appointment being booked' },
    ],
    aiDecides: 'schedule',
  },
  customDetail: {
    id: 'customDetail', group: 'custom', type: 'text', need: 'optional',
    prompt: 'Anything it must do, or must never do?',
    placeholder: 'Always mention our 24-hour guarantee. Never discount.',
  },
};

export const QUESTIONS = Q;
export const questionById = (id: string): Question | null => Q[id] ?? null;

/* ── What a solution builds ───────────────────────────────────────────────── */

export interface Agent {
  name: string;
  role: string;
}

export interface WorkflowSpec {
  /** Stable within a blueprint so an edit can name it. */
  key: string;
  name: string;
  purpose: string;
  /**
   * `template` — an existing gallery template, personalised.
   * `generated` — a graph assembled here from agent steps.
   * `ai` — written by the AI on the server from `instruction` during the build.
   */
  origin: 'template' | 'generated' | 'ai';
  templateKey?: string;
  nodes?: WorkflowNode[];
  instruction?: string;
  /** In words: "Every weekday", "When a contact is tagged no-show". */
  schedule: string;
  agents: Agent[];
  output?: { label: string; route: string };
  /** Contains a step that emails or texts a person. Those stay drafts. */
  sends: boolean;
  channel: Channel;
}

export interface SetupStep {
  key: string;
  label: string;
  /** Who does it: Autopilot during the build, or the customer afterwards. */
  by: 'autopilot' | 'you';
  route?: string;
}

/** What a solution contributes to a blueprint, from the answers. */
export interface Contribution {
  workflows: WorkflowSpec[];
  setup: SetupStep[];
  outputs: string[];
  destinations: { label: string; route: string }[];
  approvals: string[];
  manual: string[];
  /** Channels the planner looks after for this project, beyond the workflows. */
  planner: Channel[];
  requirements: RequirementId[];
  /** Honest limits worth saying on the blueprint. */
  limits: string[];
}

export type Answers = Record<string, string | string[]>;

export interface Solution {
  key: string;
  label: string;
  blurb: string;
  /** What the prompt box is pre-filled with when the card is picked. */
  example: string;
  /** Phrases and their weight. A phrase is matched on word boundaries. */
  keywords: [string, number][];
  channels: Channel[];
  questions: string[];
  build: (a: Answers, ctx: BuildContext) => Contribution;
}

export interface BuildContext {
  companyName: string;
  website: string;
}

/* ── Requirements — only the ones a blueprint actually names ──────────────── */

export type RequirementId =
  | 'ai' | 'profile' | 'socialCreator' | 'blog' | 'contacts' | 'mailbox' | 'sms'
  | 'calendar' | 'bookingPage' | 'products' | 'store' | 'payments' | 'shipping'
  | 'engagement' | 'pipeline' | 'wordpress' | 'shorts' | 'websites';

export interface RequirementInfo {
  label: string;
  why: string;
  /**
   * `included` — part of Protected Central, nothing to connect.
   * `check`    — something the customer connects; the wizard asks the server.
   * `optional` — improves it, not needed to start.
   */
  kind: 'included' | 'check' | 'optional';
  route: string;
}

export const REQUIREMENT_INFO: Record<RequirementId, RequirementInfo> = {
  ai: { label: 'Protected Central AI', why: 'Writes, researches and designs. Included — no key of your own needed.', kind: 'included', route: '' },
  profile: { label: 'Business profile', why: 'What every piece of writing starts from.', kind: 'included', route: '/autopilot' },
  socialCreator: { label: 'Content Studio — Social Creator', why: 'Where finished posts are saved, ready for you to publish.', kind: 'included', route: '/social-creator' },
  blog: { label: 'Blog', why: 'Where drafted articles are kept.', kind: 'included', route: '/blog-automation' },
  shorts: { label: 'AI Shorts', why: 'Where video scripts are kept.', kind: 'included', route: '/ai-shorts' },
  websites: { label: 'Websites and funnels', why: 'Where launch and offer pages are built.', kind: 'included', route: '/websites' },
  contacts: { label: 'Contacts', why: 'The people this project works with.', kind: 'included', route: '/contacts' },
  pipeline: { label: 'Deals pipeline', why: 'Tracks where each person is.', kind: 'included', route: '/pipelines' },
  mailbox: { label: 'An email mailbox', why: 'Email goes out through a real mailbox, so replies come back to you.', kind: 'check', route: '/settings?tab=email-sms' },
  sms: { label: 'An SMS provider', why: 'Texts need a number licensed to send them.', kind: 'check', route: '/settings?tab=email-sms' },
  calendar: { label: 'Google Calendar', why: 'Only if your appointments live there.', kind: 'optional', route: '/settings?tab=integrations' },
  bookingPage: { label: 'Booking page', why: 'Lets people pick a time without an email chain.', kind: 'included', route: '/scheduling' },
  products: { label: 'Products', why: 'The catalogue the store sells from.', kind: 'included', route: '/sell' },
  store: { label: 'Shop page', why: 'One address a stranger can buy from.', kind: 'included', route: '/sell' },
  payments: { label: 'A way to take payment', why: 'The shop will not publish until somebody can pay.', kind: 'check', route: '/settings?tab=billing' },
  shipping: { label: 'Shipping rates', why: 'Needed before a physical order can be charged correctly.', kind: 'optional', route: '/sell' },
  engagement: { label: 'Customer Engagement', why: 'The chat assistant, knowledge articles and forms.', kind: 'included', route: '/engagement' },
  wordpress: { label: 'Your WordPress site', why: 'Only to publish articles to your own website.', kind: 'optional', route: '/blog-automation' },
};

/* ── Building blocks ──────────────────────────────────────────────────────── */

const template = (key: string) => TEMPLATES.find(t => t.key === key) ?? null;

/** Whether a graph emails or texts somebody. */
export const sendsSomething = (nodes: WorkflowNode[]): boolean =>
  nodes.some(n => n.type === 'send_email' || n.type === 'send_sms');

const PLATFORM_LABEL: Record<string, string> = {
  instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', twitter: 'X',
};

/** A schedule answer as the trigger's config, and in words. */
export function cadenceOf(freq: string): { cadence: string; days?: string; words: string } {
  switch (freq) {
    case 'daily': return { cadence: 'daily', words: 'Every day' };
    case 'weekdays': return { cadence: 'weekdays', words: 'Every weekday' };
    case '3-week': return { cadence: 'daily', days: 'mon,wed,fri', words: 'Monday, Wednesday and Friday' };
    case '2-week': return { cadence: 'daily', days: 'tue,fri', words: 'Tuesday and Friday' };
    case 'weekly': return { cadence: 'weekly', words: 'Once a week' };
    case 'monthly': return { cadence: 'monthly', words: 'Once a month' };
    default: {
      /* A single named day — what "a blog every Friday" edits to. */
      const day = /^(mon|tue|wed|thu|fri|sat|sun)/i.exec(freq)?.[1]?.toLowerCase();
      if (day) {
        const full: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
        return { cadence: 'daily', days: day, words: `Every ${full[day]}` };
      }
      return { cadence: 'daily', words: 'Every day' };
    }
  }
}

const one = (v: string | string[] | undefined, fallback = ''): string =>
  Array.isArray(v) ? (v[0] ?? fallback) : (v ?? fallback);
const many = (v: string | string[] | undefined): string[] =>
  Array.isArray(v) ? v : v ? [v] : [];

let seq = 0;
const nid = () => `n${++seq}`;

/**
 * A scheduled graph of agent steps — the shape `projectAgents.ts` runs.
 *
 * One trigger, then each agent in turn. Every agent writes a draft into the
 * module that owns it; none of them sends anything, which is why a workflow
 * made only of these may be switched on when the customer approves it.
 */
export function agentGraph(
  freq: string,
  agents: { label: string; config: Record<string, string> }[],
): WorkflowNode[] {
  seq = 0;
  const c = cadenceOf(freq);
  const trigger: WorkflowNode = {
    id: 'n0', type: 'trigger', label: c.words,
    config: { event: 'schedule', cadence: c.cadence, ...(c.days ? { days: c.days } : {}) },
    nextId: null,
  };
  const steps: WorkflowNode[] = agents.map(a => ({ id: nid(), type: 'ai', label: a.label, config: a.config, nextId: null }));
  trigger.nextId = steps[0]?.id ?? null;
  steps.forEach((s, i) => { s.nextId = steps[i + 1]?.id ?? null; });
  return [trigger, ...steps];
}

/** A gallery template, personalised by a function over its nodes. */
function fromTemplate(
  key: string, specKey: string, channel: Channel,
  opts: { purpose?: string; tweak?: (nodes: WorkflowNode[]) => WorkflowNode[]; agents?: Agent[]; output?: WorkflowSpec['output'] } = {},
): WorkflowSpec | null {
  const t = template(key);
  if (!t) return null;
  const nodes = (opts.tweak ?? (n => n))(t.nodes.map(n => ({ ...n, config: { ...n.config } })));
  const trigger = nodes.find(n => n.type === 'trigger');
  return {
    key: specKey,
    name: t.name,
    purpose: opts.purpose ?? t.description,
    origin: 'template',
    templateKey: t.key,
    nodes,
    schedule: trigger ? trigger.label : '',
    agents: opts.agents ?? [],
    output: opts.output,
    sends: sendsSomething(nodes),
    channel,
  };
}

const empty = (): Contribution => ({
  workflows: [], setup: [], outputs: [], destinations: [], approvals: [], manual: [],
  planner: [], requirements: ['ai', 'profile'], limits: [],
});

const merge = (base: Contribution, add: Partial<Contribution>): Contribution => ({
  workflows: [...base.workflows, ...(add.workflows ?? [])],
  setup: [...base.setup, ...(add.setup ?? [])],
  outputs: [...base.outputs, ...(add.outputs ?? [])],
  destinations: [...base.destinations, ...(add.destinations ?? [])],
  approvals: [...base.approvals, ...(add.approvals ?? [])],
  manual: [...base.manual, ...(add.manual ?? [])],
  planner: [...base.planner, ...(add.planner ?? [])],
  requirements: [...base.requirements, ...(add.requirements ?? [])],
  limits: [...base.limits, ...(add.limits ?? [])],
});

/* ── The reusable parts, shared by several solutions ── */

function socialPart(a: Answers): Partial<Contribution> {
  const platforms = many(a.platforms).filter(p => PLATFORM_LABEL[p]);
  const list = platforms.length ? platforms : ['instagram'];
  const freq = one(a.frequency, 'weekdays');
  const count = one(a.postsPerRun, '1');
  const ready = one(a.approval, 'review') === 'ready';
  const outputs = many(a.socialOutputs);
  const nodes = agentGraph(freq, list.map(p => ({
    label: `Make the ${PLATFORM_LABEL[p]} post`,
    config: {
      source: 'portfolio', produces: 'social', platform: p, count,
      handoff: ready ? 'ready' : 'review',
      ...(one(a.brandColor) ? { brandColor: one(a.brandColor) } : {}),
      ...(one(a.topics) ? { topic: one(a.topics) } : {}),
    },
  })));
  const words = cadenceOf(freq).words;
  return {
    workflows: [{
      key: 'social',
      name: 'Social Media Content Automation',
      /* The gallery's own social template, personalised: its schedule, its
         platforms and its handoff come from the answers. Attributed so the
         gallery's usage count stays a count. */
      templateKey: list.length > 1 ? 'multi-platform-social' : 'daily-posts',
      purpose: `${words}, a finished post for ${list.map(p => PLATFORM_LABEL[p]).join(', ')}${Number(count) > 1 ? ` — ${count} versions to choose from` : ''}.`,
      origin: 'template',
      nodes,
      schedule: words,
      agents: [{
        name: 'Creative Agent',
        role: 'Reads the business profile, picks a topic, writes the caption and hashtags, and sets the headline on a branded design.',
      }],
      output: { label: 'Social posts', route: '/social-creator' },
      sends: false,
      channel: 'social',
    }],
    outputs: [
      outputs.includes('image') || !outputs.length ? 'A branded image for each post' : '',
      outputs.includes('caption') || !outputs.length ? 'A caption' : '',
      outputs.includes('hashtags') ? 'Hashtags' : '',
      list.length > 1 ? `A version for each of ${list.map(p => PLATFORM_LABEL[p]).join(', ')}` : '',
    ].filter(Boolean),
    destinations: [{ label: 'Content Studio → Social Creator', route: '/social-creator' }],
    approvals: [ready ? 'None needed — each post is marked ready to publish' : 'You review each post in the Social Creator'],
    manual: ['Publish each finished post to your social accounts — Autopilot prepares them but does not post to social networks'],
    requirements: ['socialCreator'],
    limits: ['The image is a branded design with the headline on it, not a photograph.'],
  };
}

function blogPart(a: Answers): Partial<Contribution> {
  const src = one(a.blogSource, 'portfolio');
  const freq = one(a.blogFrequency, 'weekly');
  const url = one(a.sourceUrl).trim();
  const topic = one(a.topics).trim();
  const config: Record<string, string> = { source: src, produces: 'blog' };
  if (src === 'rss' || src === 'youtube') config.sourceUrl = url;
  if (src === 'web') config.sourcePrompt = topic || 'What is new this week in our industry that our customers would want explained';
  if (topic) config.topic = topic;
  const words = cadenceOf(freq).words;
  const publish = one(a.blogDestination, 'drafts') === 'publish';
  return {
    workflows: [{
      key: 'blog',
      name: 'SEO Blog Content Automation',
      templateKey: src === 'rss' ? 'feed-blog' : src === 'youtube' ? 'youtube-blog' : 'seo-blog-pipeline',
      purpose: `${words}, a new article drafted ${src === 'web' ? 'from fresh research' : src === 'rss' ? 'from what is new in your feed' : src === 'youtube' ? 'from each new video' : 'from what the business does'}${topic ? `, around ${topic}` : ''}.`,
      origin: 'template',
      nodes: agentGraph(freq, [{ label: 'Draft the article', config }]),
      schedule: words,
      agents: [{
        name: src === 'web' ? 'Research and Writing Agent' : 'Blog Writer Agent',
        role: src === 'web'
          ? 'Searches Google for the topic, reads what it finds, and writes an article that cites it.'
          : 'Writes an SEO article with a title, excerpt and keywords from the business profile.',
      }],
      output: { label: 'Blog drafts', route: '/blog-automation' },
      sends: false,
      channel: 'blog',
    }],
    outputs: ['A drafted article with title, excerpt and keywords'],
    destinations: [{ label: 'Blog', route: '/blog-automation' }],
    approvals: [publish ? 'You approve each article before it goes on your website' : 'Articles stay drafts until you publish them'],
    manual: publish ? [] : ['Publish the articles you are happy with'],
    requirements: publish ? ['blog', 'wordpress'] : ['blog'],
  };
}

function outreachPart(a: Answers, opts: { page?: boolean } = {}): Partial<Contribution> {
  const source = one(a.contactSource, 'crm');
  const booking = one(a.booking, 'page');
  const reply = one(a.replyHandling, 'draft');
  const setup: SetupStep[] = [];
  if (source === 'upload') setup.push({ key: 'import', label: 'Import your contact list', by: 'you', route: '/contacts' });
  if (booking === 'page') setup.push({ key: 'booking', label: 'Publish a booking page with your real availability', by: 'you', route: '/scheduling' });
  const mailbox = one(a.mailbox, 'later');
  setup.push({
    key: 'mailbox',
    label: mailbox === 'buy' ? 'Buy and set up the sending domains and mailboxes' : 'Connect the mailbox the emails come from',
    by: 'you', route: '/settings?tab=email-sms',
  });
  const wfs: WorkflowSpec[] = [];
  const lead = fromTemplate('speed-to-lead', 'reply', 'email', {
    purpose: 'Answers a new enquiry within minutes, so interested people hear back while they are still interested.',
  });
  if (lead) wfs.push(lead);
  const stale = fromTemplate('sales-followup', 'followup', 'email', {
    purpose: 'Follows up with people who showed interest and then went quiet.',
  });
  if (stale) wfs.push(stale);
  return {
    workflows: wfs,
    setup,
    outputs: [
      `A ${one(a.sequenceLength, '5')}-email sequence written from your offer`,
      source === 'find' ? 'New leads matching your audience, added to Contacts' : '',
      reply === 'draft' ? 'Drafted answers to replies' : '',
      booking !== 'none' ? 'Booked calls from interested people' : '',
    ].filter(Boolean),
    destinations: [
      { label: 'Marketing → Sequences', route: '/marketing?tab=sequences' },
      { label: 'Contacts', route: '/contacts' },
    ],
    approvals: [
      'You approve the sequence before the first email sends',
      source === 'find' ? 'You approve each batch of new leads before they are added' : '',
      reply === 'draft' ? 'You send each drafted reply' : '',
    ].filter(Boolean),
    manual: booking === 'own' ? ['Take the calls booked through your own link'] : ['Take the calls people book'],
    planner: ['email', ...(source === 'find' ? ['contacts' as Channel] : []), ...(opts.page ? ['site' as Channel] : []), ...(booking !== 'none' ? ['book' as Channel] : [])],
    requirements: ['contacts', 'mailbox', 'pipeline', ...(booking === 'page' ? ['bookingPage' as RequirementId] : [])],
    limits: source === 'upload' ? ['The list is imported in Contacts — Autopilot works from what is there.'] : [],
  };
}

/* ── The catalogue ────────────────────────────────────────────────────────── */

export const SOLUTIONS: Solution[] = [
  {
    key: 'social-growth',
    label: 'Social Media Growth',
    blurb: 'A steady stream of finished posts in your brand, ready for you to publish.',
    example: 'Learn about my company and create one professional image post every weekday.',
    keywords: [['social', 3], ['social media', 3], ['post', 2], ['posts', 2], ['instagram', 3], ['facebook', 2.5], ['linkedin', 2.5], ['tiktok', 2], ['image post', 3], ['caption', 2], ['hashtag', 2], ['feed', 1], ['content calendar', 1.5]],
    channels: ['social'],
    questions: ['business', 'website', 'socialOutputs', 'platforms', 'postsPerRun', 'frequency', 'inspiration', 'brandColor', 'approval'],
    build: a => merge(empty(), socialPart(a)),
  },
  {
    key: 'lead-generation',
    label: 'Lead Generation',
    blurb: 'Find people who fit, start the conversation, and book the interested ones.',
    example: 'Find businesses that need what we sell, email them and book calls with the interested ones.',
    keywords: [['lead', 2.5], ['leads', 2.5], ['lead generation', 3.5], ['prospect', 2.5], ['prospects', 2.5], ['find clients', 3], ['new clients', 2.5], ['new customers', 2.5], ['book calls', 2], ['meetings', 1.5]],
    channels: ['contacts', 'email', 'book', 'site'],
    questions: ['business', 'website', 'audience', 'location', 'contactSource', 'offer', 'emailGoal', 'booking', 'bookingUrl', 'sender', 'mailbox', 'dailyVolume', 'replyHandling'],
    build: a => merge(empty(), {
      ...outreachPart({ ...a, contactSource: a.contactSource ?? 'find' }, { page: true }),
      outputs: ['A page for the offer, so the email has somewhere to point'],
    }),
  },
  {
    key: 'email-outreach',
    label: 'Email Outreach',
    blurb: 'A written sequence to a defined audience, with follow-ups and replies handled.',
    example: 'Send a five-email outreach sequence to Amazon sellers and book interested prospects.',
    keywords: [['outreach', 3.5], ['cold email', 4], ['email sequence', 3.5], ['sequence', 2], ['email campaign', 2], ['emails', 1.5], ['email', 1.5], ['follow-up', 1], ['follow up', 1]],
    channels: ['email', 'contacts', 'book'],
    questions: ['business', 'website', 'audience', 'contactSource', 'offer', 'emailGoal', 'sequenceLength', 'booking', 'bookingUrl', 'sender', 'mailbox', 'dailyVolume', 'replyHandling'],
    build: a => merge(empty(), outreachPart(a)),
  },
  {
    key: 'content-marketing',
    label: 'Content Marketing',
    blurb: 'Articles and the posts that point at them, from one plan.',
    example: 'Write a weekly article about our industry and turn each one into social posts.',
    keywords: [['content marketing', 4], ['content', 1.5], ['articles', 2], ['newsletter', 1.5], ['repurpose', 2]],
    channels: ['blog', 'social'],
    questions: ['business', 'website', 'topics', 'blogSource', 'sourceUrl', 'blogFrequency', 'platforms', 'frequency', 'approval'],
    build: a => {
      let c = merge(empty(), blogPart(a));
      c = merge(c, socialPart(a));
      return c;
    },
  },
  {
    key: 'blog-seo',
    label: 'Blog & SEO',
    blurb: 'Articles that answer what your customers search for, on a schedule.',
    example: 'Create SEO blog content every week from my company website.',
    keywords: [['blog', 3.5], ['seo', 4], ['article', 2.5], ['articles', 2.5], ['rank', 2], ['google', 1.5], ['search', 1], ['keywords', 1.5]],
    channels: ['blog'],
    questions: ['business', 'website', 'topics', 'blogSource', 'sourceUrl', 'blogFrequency', 'audience', 'blogDestination'],
    build: a => merge(empty(), blogPart(a)),
  },
  {
    key: 'ecommerce-store',
    label: 'E-commerce Store',
    blurb: 'Your catalogue imported, written up and on a shop page people can buy from.',
    example: 'I have around 80 products with images and prices. Build an e-commerce store.',
    keywords: [['e-commerce', 4], ['ecommerce', 4], ['online store', 4], ['store', 2.5], ['shop', 2.5], ['products', 3], ['product', 2], ['catalogue', 3], ['catalog', 3], ['checkout', 2], ['sku', 2], ['shopify', 2], ['woocommerce', 2]],
    channels: ['shop'],
    questions: ['business', 'productSource', 'productCount', 'productFields', 'variants', 'storeDesign', 'shipping'],
    build: a => {
      const source = one(a.productSource, 'manual');
      const fields = many(a.productFields);
      const setup: SetupStep[] = [];
      if (source === 'upload') setup.push({ key: 'import', label: 'Import the products from your spreadsheet as drafts', by: 'autopilot', route: '/sell' });
      else if (source === 'existing') setup.push({ key: 'products', label: 'Use the products already in Protected Central', by: 'autopilot', route: '/sell' });
      else setup.push({ key: 'products', label: source === 'catalogue' || source === 'website' ? 'Add the products from your catalogue — or export it as a CSV and Autopilot imports it' : 'Add your products', by: 'you', route: '/sell' });
      if (!fields.includes('description')) setup.push({ key: 'copy', label: 'Write descriptions for products that have none', by: 'you', route: '/sell' });
      setup.push({ key: 'shop', label: `Open the shop page${one(a.storeDesign) ? ` in a ${one(a.storeDesign)} style` : ''}`, by: 'you', route: '/sell' });
      setup.push({ key: 'payments', label: 'Connect a way to take payment', by: 'you', route: '/settings?tab=billing' });
      if (one(a.shipping) === 'post' || one(a.shipping) === 'local') {
        setup.push({ key: 'shipping', label: 'Set your shipping rates', by: 'you', route: '/sell' });
      }
      const wfs: WorkflowSpec[] = [];
      const cart = fromTemplate('unpaid-order', 'cart', 'shop', { purpose: 'Chases orders that were started and never paid for.' });
      if (cart) wfs.push(cart);
      const thanks = fromTemplate('thank-buyer', 'thanks', 'shop', { purpose: 'Thanks each buyer once, then asks for a review.' });
      if (thanks) wfs.push(thanks);
      return merge(empty(), {
        workflows: wfs,
        setup,
        outputs: [
          source === 'upload' ? 'Your products, imported as drafts with their images' : 'Your products in the catalogue',
          'A shop page anyone can buy from, with no login',
        ],
        destinations: [{ label: 'Commerce → Products', route: '/sell' }],
        approvals: ['Every imported product stays a draft until you set it live'],
        manual: ['Check prices and switch products live', 'Connect payments before the shop can take orders'],
        planner: ['shop'],
        requirements: ['products', 'store', 'payments', ...(one(a.shipping) === 'post' ? ['shipping' as RequirementId] : [])],
        limits: [
          'Products are imported from a CSV. Shopify and WooCommerce stores are not connected directly — export a CSV from either.',
          fields.includes('images') ? 'Images are matched to products by file name when you attach them.' : '',
        ].filter(Boolean),
      });
    },
  },
  {
    key: 'customer-support',
    label: 'Customer Support',
    blurb: 'Questions answered from your own knowledge, and the rest routed to a person.',
    example: 'Answer common customer questions on my website and pass anything tricky to my team.',
    keywords: [['support', 3.5], ['customer service', 4], ['questions', 1.5], ['faq', 3], ['ticket', 3], ['tickets', 3], ['helpdesk', 3], ['chat', 2], ['chatbot', 3]],
    channels: ['support', 'tasks'],
    questions: ['business', 'website', 'supportChannels', 'escalation'],
    build: a => {
      const wfs: WorkflowSpec[] = [];
      const triage = fromTemplate('ticket-triage', 'triage', 'support', { purpose: 'Sorts incoming requests and creates a task for the right person.' });
      if (triage) wfs.push(triage);
      const unhappy = fromTemplate('unhappy-first', 'unhappy', 'support', { purpose: 'Catches an unhappy customer and puts them in front of a person.' });
      if (unhappy) wfs.push(unhappy);
      return merge(empty(), {
        workflows: wfs,
        setup: [
          { key: 'agent', label: 'Describe the business to the chat assistant and choose what it may do', by: 'you', route: '/engagement' },
          { key: 'knowledge', label: 'Publish three or four answers to what you are asked most', by: 'you', route: '/engagement' },
          ...(many(a.supportChannels).includes('chat') ? [{ key: 'widget', label: 'Paste the chat widget onto your website', by: 'you' as const, route: '/engagement' }] : []),
        ],
        outputs: ['Answers to common questions', 'Tasks for the requests that need a person'],
        destinations: [{ label: 'Customer Engagement', route: '/engagement' }, { label: 'Conversations', route: '/conversations' }],
        approvals: ['The assistant only uses articles you have published'],
        manual: [one(a.escalation) ? `Escalations go to ${one(a.escalation)}` : 'Handle the requests it passes to a person'],
        requirements: ['engagement', 'contacts'],
      });
    },
  },
  {
    key: 'sales-followup',
    label: 'Sales Follow-up',
    blurb: 'Quotes, proposals and quiet deals chased without anybody remembering to.',
    example: 'Follow up on quotes and proposals that go quiet.',
    keywords: [['sales follow', 4], ['quote', 3], ['quotes', 3], ['proposal', 3], ['proposals', 3], ['deal', 2], ['deals', 2], ['pipeline', 2.5], ['went quiet', 2.5], ['chase', 2]],
    channels: ['email', 'sales'],
    questions: ['business', 'followupFocus', 'apptChannels', 'approval'],
    build: a => {
      const focus = many(a.followupFocus);
      const keys: [string, string, string][] = [
        ['enquiries', 'speed-to-lead', 'reply'],
        ['quotes', 'quote-chase', 'quotes'],
        ['proposals', 'stage-proposal', 'proposals'],
        ['stalled', 'stale-deal', 'stalled'],
      ];
      const wfs = keys.filter(([f]) => focus.includes(f) || !focus.length)
        .map(([, k, s]) => fromTemplate(k, s, 'sales')).filter((w): w is WorkflowSpec => !!w);
      return merge(empty(), {
        workflows: wfs,
        outputs: ['Follow-up emails at the right moment', 'Tasks when a deal needs a person'],
        destinations: [{ label: 'Deals pipeline', route: '/pipelines' }],
        approvals: ['Each follow-up workflow starts as a draft you switch on'],
        manual: ['Move deals between stages so the follow-ups know where each one is'],
        planner: ['sales'],
        requirements: ['pipeline', 'contacts', 'mailbox', ...(many(a.apptChannels).includes('sms') ? ['sms' as RequirementId] : [])],
      });
    },
  },
  {
    key: 'appointment-booking',
    label: 'Appointment Booking',
    blurb: 'Bookings made, reminded and — when missed — rebooked.',
    example: 'Follow up with customers who miss appointments and try to rebook them.',
    keywords: [['appointment', 4], ['appointments', 4], ['booking', 3], ['bookings', 3], ['no-show', 4], ['no show', 4], ['miss appointments', 4], ['missed appointment', 4], ['rebook', 4], ['reminder', 2.5], ['reminders', 2.5], ['calendar', 2], ['diary', 2], ['schedule appointments', 3]],
    channels: ['book', 'email', 'sms'],
    questions: ['business', 'calendar', 'apptFocus', 'apptChannels', 'booking', 'bookingUrl'],
    build: a => {
      const focus = many(a.apptFocus);
      const sms = many(a.apptChannels).includes('sms');
      const wfs: WorkflowSpec[] = [];
      const add = (k: string, s: string, purpose: string) => { const w = fromTemplate(k, s, 'book', { purpose }); if (w) wfs.push(w); };
      if (!focus.length || focus.includes('reminders')) add('appointment-reminders', 'reminders', 'Reminds people before their appointment, which is what stops most no-shows.');
      if (!focus.length || focus.includes('noshow')) add('no-show-recovery', 'noshow', 'When somebody misses an appointment, gets in touch the same day with a way to rebook.');
      if (focus.includes('enquiries')) add('speed-to-lead', 'reply', 'Answers a new enquiry within minutes and offers a time.');
      return merge(empty(), {
        workflows: wfs,
        setup: [
          one(a.calendar) === 'google'
            ? { key: 'calendar', label: 'Connect Google Calendar', by: 'you', route: '/settings?tab=integrations' }
            : { key: 'booking', label: 'Publish a booking page with your real availability', by: 'you', route: '/scheduling' },
          { key: 'noshow-tag', label: 'Mark missed appointments as no-shows in the calendar, so the rebooking starts', by: 'you', route: '/calendar' },
        ],
        outputs: ['Reminders before each appointment', 'A rebooking message after a no-show', 'Rebooked appointments'],
        destinations: [{ label: 'Calendar', route: '/calendar' }],
        approvals: ['The messages start as drafts you read and switch on'],
        manual: ['Mark an appointment as missed when somebody does not show'],
        planner: ['book'],
        requirements: ['bookingPage', 'contacts', 'mailbox', ...(sms ? ['sms' as RequirementId] : []), ...(one(a.calendar) === 'google' ? ['calendar' as RequirementId] : [])],
      });
    },
  },
  {
    key: 'client-onboarding',
    label: 'Client Onboarding',
    blurb: 'Every new client welcomed, set up and handed to the right person.',
    example: 'Create an onboarding system for new clients.',
    keywords: [['onboarding', 4.5], ['onboard', 4], ['new client', 2.5], ['welcome', 2.5], ['kickoff', 3], ['kick-off', 3], ['intake', 2.5]],
    channels: ['email', 'tasks'],
    questions: ['business', 'onboardingSteps', 'booking', 'bookingUrl'],
    build: a => {
      const steps = many(a.onboardingSteps);
      const wfs: WorkflowSpec[] = [];
      const on = fromTemplate('new-customer', 'onboarding', 'tasks', { purpose: 'Welcomes a new client, sets up their first steps and asks for a referral once they are happy.' });
      if (on) wfs.push(on);
      if (steps.includes('tasks') || steps.includes('kickoff')) {
        const ag = fromTemplate('agency-onboarding', 'handover', 'tasks', { purpose: 'Creates the internal tasks and kickoff call for each new client.' });
        if (ag) wfs.push(ag);
      }
      if (steps.includes('referral')) {
        const r = fromTemplate('referral-request', 'referral', 'email');
        if (r) wfs.push(r);
      }
      return merge(empty(), {
        workflows: wfs,
        setup: [{ key: 'trigger', label: 'Tag a contact "customer" when they sign — that is what starts onboarding', by: 'you', route: '/contacts' }],
        outputs: ['A welcome sequence', 'Tasks for your team', ...(steps.includes('kickoff') ? ['A booked kickoff call'] : [])],
        destinations: [{ label: 'Contacts', route: '/contacts' }, { label: 'Tasks on the pipeline', route: '/pipelines' }],
        approvals: ['Each workflow starts as a draft you switch on'],
        manual: ['Run the kickoff call'],
        requirements: ['contacts', 'mailbox', 'pipeline'],
      });
    },
  },
  {
    key: 'customer-reactivation',
    label: 'Customer Reactivation',
    blurb: 'Past customers given a real reason to come back.',
    example: 'I have 10,000 previous customers. Create an email reactivation campaign.',
    keywords: [['reactivat', 4.5], ['re-engage', 4.5], ['reengage', 4.5], ['win back', 4.5], ['winback', 4.5], ['previous customers', 4], ['past customers', 4], ['old customers', 4], ['lapsed', 3.5], ['dormant', 3.5], ['existing customers', 2.5]],
    channels: ['email'],
    questions: ['business', 'contactSource', 'contactCount', 'emailGoal', 'offer', 'sequenceLength', 'sender', 'mailbox', 'booking', 'bookingUrl', 'replyHandling'],
    build: a => {
      const base = outreachPart({ ...a, contactSource: a.contactSource ?? 'crm' });
      const win = fromTemplate('dormant-winback', 'winback', 'email', { purpose: 'Writes to people who have not bought in a while with a reason to come back — not "just checking in".' });
      const big = one(a.contactCount) === '10000+' || one(a.contactCount) === '2000-10000';
      return merge(empty(), {
        ...base,
        workflows: [...(win ? [win] : []), ...(base.workflows ?? []).filter(w => w.key !== 'reply')],
        approvals: [...(base.approvals ?? []), big ? 'It sends to a small group first and waits for you before the rest' : ''].filter(Boolean),
        limits: big ? ['A list this size is sent in batches from your own domain, never all at once — a sudden 10,000 is the surest way to land in spam.'] : [],
      });
    },
  },
  {
    key: 'reputation',
    label: 'Reputation Management',
    blurb: 'Reviews asked for at the right moment, and unhappy customers caught first.',
    example: 'Ask happy customers for Google reviews after every job.',
    keywords: [['review', 3], ['reviews', 3.5], ['reputation', 4], ['google reviews', 4.5], ['trustpilot', 4], ['rating', 2.5], ['testimonial', 2.5], ['nps', 3]],
    channels: ['reviews', 'email'],
    questions: ['business', 'reviewPlatform', 'catchUnhappy', 'apptChannels'],
    build: a => {
      const wfs: WorkflowSpec[] = [];
      const first = one(a.catchUnhappy, 'yes') === 'yes';
      const main = fromTemplate(first ? 'nps-followup' : 'review-request', 'reviews', 'reviews');
      if (main) wfs.push(main);
      if (first) { const u = fromTemplate('unhappy-first', 'unhappy', 'reviews'); if (u) wfs.push(u); }
      return merge(empty(), {
        workflows: wfs,
        setup: [{ key: 'link', label: `Add your ${one(a.reviewPlatform, 'Google')} review link in Reputation`, by: 'you', route: '/reputation' }],
        outputs: ['Review requests after each job or purchase', ...(first ? ['Unhappy customers flagged to you before they post'] : [])],
        destinations: [{ label: 'Reputation', route: '/reputation' }],
        approvals: ['Each workflow starts as a draft you switch on'],
        manual: ['Reply to the reviews you get'],
        planner: ['reviews'],
        requirements: ['contacts', 'mailbox', ...(many(a.apptChannels).includes('sms') ? ['sms' as RequirementId] : [])],
      });
    },
  },
  {
    key: 'real-estate',
    label: 'Real Estate Lead Generation',
    blurb: 'Sellers, buyers and landlords found, followed up and booked for valuations.',
    example: 'Find homeowners thinking of selling in my area and book valuations.',
    keywords: [['real estate', 4.5], ['estate agent', 4.5], ['property', 3.5], ['properties', 3], ['homeowner', 3], ['homeowners', 3], ['valuation', 3.5], ['realtor', 4.5], ['landlord', 2.5], ['listings', 2.5]],
    channels: ['contacts', 'email', 'book', 'site'],
    questions: ['business', 'propertySide', 'location', 'contactSource', 'offer', 'booking', 'bookingUrl', 'mailbox', 'dailyVolume'],
    build: a => {
      const base = outreachPart(a, { page: true });
      const nurture = fromTemplate('dormant-winback', 'nurture', 'email', { purpose: 'Stays in touch with people who are not moving this month — most will, eventually.' });
      return merge(empty(), {
        ...base,
        workflows: [...(base.workflows ?? []), ...(nurture ? [nurture] : [])],
        outputs: [...(base.outputs ?? []), 'Area pages for the places people search'],
      });
    },
  },
  {
    key: 'agency-operations',
    label: 'Agency Operations',
    blurb: 'Onboarding, pipeline and client requests running without anybody chasing.',
    example: 'Automate onboarding, deal follow-up and client requests for my agency.',
    keywords: [['agency', 3.5], ['clients', 1], ['operations', 3], ['internal', 2], ['team', 1.5], ['tasks', 2], ['workload', 2]],
    channels: ['tasks', 'sales', 'support'],
    questions: ['business', 'opsFocus'],
    build: a => {
      const focus = many(a.opsFocus);
      const wfs: WorkflowSpec[] = [];
      const add = (k: string, s: string, c: Channel) => { const w = fromTemplate(k, s, c); if (w) wfs.push(w); };
      if (!focus.length || focus.includes('onboarding')) add('agency-onboarding', 'onboarding', 'tasks');
      if (!focus.length || focus.includes('pipeline')) { add('stage-proposal', 'proposals', 'sales'); add('stale-deal', 'stalled', 'sales'); }
      if (focus.includes('support')) add('ticket-triage', 'triage', 'support');
      let c = merge(empty(), {
        workflows: wfs,
        outputs: ['Tasks created for the right person', 'Proposals chased on time'],
        destinations: [{ label: 'Deals pipeline', route: '/pipelines' }],
        approvals: ['Each workflow starts as a draft you switch on'],
        manual: ['Work the tasks it creates'],
        planner: ['sales'],
        requirements: ['pipeline', 'contacts'],
      });
      if (focus.includes('content')) c = merge(c, socialPart({ frequency: 'weekdays', platforms: ['linkedin'] }));
      return c;
    },
  },
  {
    key: 'recruitment',
    label: 'Recruitment',
    blurb: 'Candidates and hiring companies found and approached — separately.',
    example: 'Find warehouse candidates in the West Midlands and invite them to apply.',
    keywords: [['recruit', 4], ['recruitment', 4.5], ['recruiting', 4], ['candidates', 4], ['candidate', 3.5], ['hiring', 3.5], ['vacancy', 3.5], ['vacancies', 3.5], ['jobs', 2], ['staffing', 4]],
    channels: ['contacts', 'email'],
    questions: ['business', 'recruitSide', 'roles', 'location', 'contactSource', 'offer', 'mailbox', 'dailyVolume'],
    build: a => {
      const base = outreachPart(a);
      const qual = fromTemplate('ai-lead-qualification', 'qualify', 'contacts', { purpose: 'Sorts replies into worth-a-call and not-yet, so you only phone the right ones.' });
      return merge(empty(), {
        ...base,
        workflows: [...(qual ? [qual] : []), ...(base.workflows ?? [])],
        limits: one(a.recruitSide) === 'both' ? ['Candidates and companies get separate lists and separate emails — mixing them is how both get ignored.'] : [],
      });
    },
  },
  {
    key: 'product-marketing',
    label: 'Product Marketing',
    blurb: 'A launch told to the people most likely to say yes, then everybody else.',
    example: 'Launch our new product with a page, an email to customers and social posts.',
    keywords: [['launch', 4.5], ['launching', 4.5], ['new product', 4], ['product launch', 5], ['announce', 3], ['announcement', 3], ['promote', 2]],
    channels: ['site', 'email', 'social', 'blog'],
    questions: ['business', 'product', 'audience', 'launchChannels', 'platforms', 'frequency', 'mailbox'],
    build: a => {
      const ch = many(a.launchChannels);
      let c = merge(empty(), {
        setup: ch.includes('page') ? [{ key: 'page', label: 'Write the launch page', by: 'autopilot', route: '/websites' }] : [],
        outputs: ch.includes('page') ? ['A launch page'] : [],
        destinations: ch.includes('page') ? [{ label: 'Websites and funnels', route: '/websites' }] : [],
        planner: [...(ch.includes('page') ? ['site' as Channel] : []), ...(ch.includes('email') ? ['email' as Channel] : [])],
        requirements: [...(ch.includes('page') ? ['websites' as RequirementId] : []), ...(ch.includes('email') ? ['mailbox' as RequirementId, 'contacts' as RequirementId] : [])],
        approvals: ch.includes('email') ? ['You approve the launch email before it sends'] : [],
      });
      if (ch.includes('email')) {
        const camp = fromTemplate('year-emails', 'launch-email', 'email', {
          purpose: 'Writes the launch emails to existing customers as a draft campaign.',
          tweak: nodes => nodes.map(n => n.type === 'ai' ? { ...n, config: { ...n.config, campaignSteps: '7', everyDays: '3', topic: one(a.product) } } : n),
          agents: [{ name: 'Email Copy Agent', role: 'Writes the launch sequence from what you are launching and who it is for.' }],
          output: { label: 'Launch campaign', route: '/marketing?tab=sequences' },
        });
        if (camp) c = merge(c, { workflows: [camp], outputs: ['A launch email sequence'] });
      }
      if (ch.includes('social')) c = merge(c, socialPart({ ...a, topics: one(a.product) }));
      if (ch.includes('blog')) c = merge(c, blogPart({ ...a, topics: one(a.product), blogFrequency: 'weekly' }));
      return c;
    },
  },
  {
    key: 'video-content',
    label: 'Video Content',
    blurb: 'Short-video scripts to film, or your videos turned into posts and articles.',
    example: 'Turn every new YouTube video into a blog post and social posts.',
    keywords: [['video', 3.5], ['videos', 3.5], ['youtube', 4], ['shorts', 3.5], ['reels', 3.5], ['tiktok', 2.5], ['script', 2.5], ['scripts', 2.5]],
    channels: ['video', 'blog', 'social'],
    questions: ['business', 'videoSource', 'channelId', 'frequency', 'platforms'],
    build: a => {
      const src = one(a.videoSource, 'scripts');
      if (src === 'youtube') {
        const id = one(a.channelId).trim();
        const nodes = agentGraph('daily', [
          { label: 'Write up the new video', config: { source: 'youtube', sourceUrl: id, produces: 'blog' } },
          ...many(a.platforms).slice(0, 3).map(p => ({ label: `Make a ${PLATFORM_LABEL[p] ?? p} post about it`, config: { source: 'youtube', sourceUrl: id, produces: 'social', platform: p, count: '1', handoff: 'review' } })),
        ]);
        return merge(empty(), {
          workflows: [{
            key: 'video', name: 'Video Repurposing Automation',
            purpose: 'Each new video becomes a written article and a post for each platform.',
            origin: 'generated', nodes, schedule: 'Checks every day for a new video',
            agents: [{ name: 'Repurposing Agent', role: 'Reads each new video on the channel and writes it up as an article and posts.' }],
            output: { label: 'Articles and posts', route: '/blog-automation' },
            sends: false, channel: 'video',
          }],
          outputs: ['An article per video', 'Posts pointing at it'],
          destinations: [{ label: 'Blog', route: '/blog-automation' }, { label: 'Social Creator', route: '/social-creator' }],
          approvals: ['Everything is a draft until you publish it'],
          manual: ['Publish the posts and articles'],
          requirements: ['blog', 'socialCreator'],
        });
      }
      return merge(empty(), {
        outputs: ['A short-video script to film'],
        destinations: [{ label: 'AI Shorts', route: '/ai-shorts' }],
        approvals: ['Scripts are drafts'],
        manual: ['Film and post the videos'],
        planner: ['video'],
        requirements: ['shorts'],
        limits: ['Autopilot writes scripts; it does not film or edit video.'],
      });
    },
  },
  {
    key: 'local-business',
    label: 'Local Business Growth',
    blurb: 'Reviews, fast replies, local posts and being found — the basics, done every week.',
    example: 'Help my local business get more reviews and reply to every enquiry fast.',
    keywords: [['local business', 4.5], ['local', 2.5], ['near me', 3.5], ['my area', 2.5], ['missed call', 4], ['missed calls', 4], ['plumber', 2], ['salon', 2], ['dentist', 2], ['restaurant', 2], ['trades', 2]],
    channels: ['reviews', 'social', 'blog', 'sms', 'email'],
    questions: ['business', 'website', 'location', 'localPriorities', 'platforms', 'frequency'],
    build: a => {
      const p = many(a.localPriorities);
      const all = !p.length;
      let c = empty();
      const add = (k: string, s: string, ch: Channel) => { const w = fromTemplate(k, s, ch); if (w) c = merge(c, { workflows: [w] }); };
      if (all || p.includes('missed')) { add('missed-call', 'missed', 'sms'); c = merge(c, { requirements: ['sms'], setup: [{ key: 'sms', label: 'Connect a number for texting back', by: 'you', route: '/settings?tab=email-sms' }] }); }
      if (all || p.includes('enquiries')) add('speed-to-lead', 'reply', 'email');
      if (all || p.includes('reviews')) { add('review-request', 'reviews', 'reviews'); c = merge(c, { planner: ['reviews'], outputs: ['Review requests after each job'] }); }
      if (all || p.includes('posts')) c = merge(c, socialPart(a));
      if (all || p.includes('search')) c = merge(c, blogPart({ ...a, blogFrequency: 'weekly', topics: one(a.location) ? `${one(a.location)} customers` : '' }));
      return merge(c, {
        destinations: [{ label: 'Contacts', route: '/contacts' }],
        approvals: ['Workflows that message people start as drafts you switch on'],
        requirements: ['contacts', 'mailbox'],
      });
    },
  },
  {
    key: 'custom',
    label: 'Create Something Different',
    blurb: 'Describe it in your own words. Autopilot asks what it needs and builds the rest.',
    example: '',
    keywords: [],
    channels: [],
    questions: ['business', 'customOutput', 'customTrigger', 'frequency', 'audience', 'customDetail'],
    build: (a, ctx) => {
      const outs = many(a.customOutput);
      const trig = one(a.customTrigger, 'schedule');
      let c = empty();
      if (outs.includes('social')) c = merge(c, socialPart(a));
      if (outs.includes('blog')) c = merge(c, blogPart({ ...a, blogFrequency: one(a.frequency, 'weekly') }));
      const detail = one(a.customDetail).trim();
      if (outs.includes('email') || outs.includes('tasks')) {
        const what = [
          outs.includes('email') ? 'sends a short personal email' : '',
          outs.includes('tasks') ? 'creates a follow-up task for the team' : '',
        ].filter(Boolean).join(' and ');
        const when = {
          schedule: 'when a contact is tagged "follow-up"', contact: 'when a new contact is added',
          form: 'when a form is submitted', deal: 'when a deal changes stage', appointment: 'when an appointment is booked',
        }[trig] ?? 'when a new contact is added';
        c = merge(c, {
          workflows: [{
            key: 'custom', name: 'Custom Automation',
            purpose: `${when[0].toUpperCase()}${when.slice(1)}, it ${what}.`,
            origin: 'ai',
            instruction: `For ${ctx.companyName || 'this business'}: ${when}, ${what}${one(a.audience) ? ` for ${one(a.audience)}` : ''}.${detail ? ` ${detail}` : ''}`.slice(0, 950),
            schedule: when[0].toUpperCase() + when.slice(1),
            agents: [],
            sends: outs.includes('email'),
            channel: outs.includes('email') ? 'email' : 'tasks',
          }],
          approvals: ['It starts as a draft you read and switch on'],
          requirements: outs.includes('email') ? ['contacts', 'mailbox'] : ['contacts'],
        });
      }
      if (outs.includes('page')) {
        c = merge(c, {
          setup: [{ key: 'page', label: 'Write the page', by: 'autopilot', route: '/websites' }],
          outputs: ['A web page'], planner: ['site'], requirements: ['websites'],
        });
      }
      return c;
    },
  },
];

/** How many gallery templates the matcher searches. */
export const TEMPLATE_COUNT = TEMPLATES.length;

export const solutionByKey = (key: string): Solution | null => SOLUTIONS.find(s => s.key === key) ?? null;
export const CUSTOM = 'custom';
