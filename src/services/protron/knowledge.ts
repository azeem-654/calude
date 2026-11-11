/**
 * What Protron knows about Protected Central — read from the product, not
 * written beside it.
 *
 * ── Why most of it is derived ──
 *
 * The module list, each module's one-line purpose and who may see it come
 * from `navModel.ts`, the same list the top bar and the command palette read.
 * A second, hand-kept catalogue for the assistant would drift the first time a
 * module was renamed, and an assistant describing a screen that is no longer
 * there is worse than one that says it does not know.
 *
 * The notes below are the few things the nav cannot say: what a module needs
 * connected before it works, and the commonest reasons it refuses. Each is
 * true of the code today (see docs/claude/*.md for the area); when a module
 * changes what it needs, change its note here in the same commit.
 *
 * ── Why it is not retrieval ──
 *
 * The whole thing is a few kilobytes. Sending it with every question costs
 * less than an embedding index would to keep, cannot return a stale chunk,
 * and needs no new infrastructure. If it grows past ~20 KB, that is the time
 * to split it by module and send only the current screen's part.
 */
import { modulesFor, SETTINGS_TABS, settingsTabsFor, type Who } from './actions';

/** Per module: what it needs and what usually goes wrong. Keyed by path. */
export const MODULE_NOTES: Record<string, string> = {
  '/autopilot': 'AI Autopilot runs business workspaces in the cloud every five minutes, browser closed or not. New business workspace: describe the result (or start from a ready-made solution); it asks only what it still needs, shows a blueprint you can edit by sentence or voice, then builds. Workflows that email or text are built as drafts and stay off until you switch them on; content workflows run once approved.',
  '/prospecting': 'Say who and where ("roofing companies in Dallas"). It searches business directories and maps, reads each website for a published email, and checks the address. Results can be saved to a contact list or used in a new AI Autopilot business workspace. Each search counts against the plan\'s prospect searches.',
  '/contacts': 'Everyone you know, with history, tags and one folder of lists per business workspace. Import a CSV from the Import button; export from the list menu.',
  '/pipelines': 'Deals moves opportunities through stages to won. Create a pipeline, name its stages, drag deals between them; a stage can carry a checklist (playbook).',
  '/marketing': 'Email campaigns and sequences. Sending needs a connected mailbox or provider (Settings → Email & SMS). Every email carries an unsubscribe link; bounced addresses are skipped.',
  '/conversations': 'Unified Inbox: every connected mailbox plus SMS and chat in one thread list. Nothing arrives until a mailbox is connected in Settings → Email & SMS.',
  '/engagement': 'Customer Engagement: an AI chat assistant, forms, tickets and a widget you paste on any website. Voice calls need a voice provider chosen by the install owner.',
  '/video-studio': 'Upload or record a video; edit, clean the sound, cut Shorts with captions, music and thumbnails, and repurpose it into posts and articles.',
  '/social-creator': 'Graphics Designer & Editor: design social posts and thumbnails from templates, with AI-written copy.',
  '/websites': 'Build a website from a template, edit it, and publish it on your own domain.',
  '/funnels': 'Landing pages built to capture a lead; connect every form block to a list before launch.',
  '/scheduling': 'Booking pages: set days and hours, share the link; Google Calendar is optional (Settings → Integrations).',
  '/calendar': 'Meetings, bookings and your own time on one grid.',
  '/reputation': 'Watch reviews and answer them; AI drafts a reply you can edit.',
  '/sell': 'Online shop: products, orders, discounts, shipping and a storefront. Taking payment needs a processor connected in Settings → Billing.',
  '/blog-automation': 'A planned blog that drafts articles for your own pages; publishing to WordPress is optional.',
  '/billing': 'Your plan, invoices and what you have used of each allowance this month.',
  '/settings': 'Profile, Email & SMS, integrations, team, security and domains.',
  '/analytics': 'Reports on how each module is performing.',
  '/jobs': 'Every inquiry followed to the job and the money collected.',
};

/** The commonest stuck points, with the real way out. */
export const TROUBLESHOOTING: string[] = [
  'Email will not send → Settings → Email & SMS: connect a mailbox (SMTP) or a provider; then Settings → Email Deliverability checks SPF/DKIM/DMARC.',
  '"The AI is not available on this install right now" → the install\'s AI key is not set up; this is the operator\'s to fix, not the customer\'s. Use the Help button to tell support.',
  '"…limit reached" or "your plan allows…" → that allowance is used up for this month; Plan & billing shows usage and upgrades.',
  'A prospect search found nothing → widen the place (a region instead of a suburb) or describe the business differently ("plumbers" rather than "emergency drain specialists").',
  'A form says a box is missing → the box it names is highlighted; fill it and save again.',
  'Something failed with a server error → try once more; if it repeats, the Help button reaches a person who can see which screen you were on.',
];

/** Short starters for the screen somebody is on. Each is something Protron can really do or answer. */
export const STARTERS: Record<string, string[]> = {
  '/': ['What should I set up first?', 'Find roofing companies in Dallas', 'Start an AI Autopilot business workspace'],
  '/autopilot': ['Help me plan a new business workspace', 'What does a blueprint include?', 'Why is my workflow a draft?'],
  '/prospecting': ['Find dentists in Austin, TX', 'How do I save results to a list?', 'Use these leads in AI Autopilot'],
  '/contacts': ['Add a contact', 'How do I import a CSV?', 'How many contacts do I have?'],
  '/pipelines': ['Create a sales pipeline for real estate', 'How do stage checklists work?'],
  '/marketing': ['Where do I connect my email?', 'Write a follow-up email for estimates'],
  '/video-studio': ['How do I make Shorts from a video?', 'Write a hook for a roofing video'],
  '/social-creator': ['Write a post about our spring offer', 'How do I change the template colours?'],
  '/settings': ['Where do I connect my email?', 'How do I turn on 2-step sign-in?'],
};

export function startersFor(path: string): string[] {
  return STARTERS[path] ?? ['What can you do here?', 'Where do I configure my email settings?', 'Find prospects for my business'];
}

/** The screen somebody is on, as the model is told it: label and purpose only — never the screen's data. */
export function screenContext(path: string, who: Who): { label: string; desc: string; note: string } {
  const mods = modulesFor(who);
  const hit = mods.filter(m => m.path === '/' ? path === '/' : path === m.path || path.startsWith(`${m.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return {
    label: hit?.label ?? 'this screen',
    desc: hit?.desc ?? '',
    note: hit ? MODULE_NOTES[hit.path] ?? '' : '',
  };
}

/** Everything this login may use, as the model reads it. */
export function productKnowledge(who: Who): string {
  const mods = modulesFor(who).map(m => `- ${m.label} (${m.path}): ${m.desc}.${MODULE_NOTES[m.path] ? ` ${MODULE_NOTES[m.path]}` : ''}`);
  const tabs = SETTINGS_TABS.filter(t => settingsTabsFor(who).includes(t.id)).map(t => `- ${t.id}: ${t.label} — ${t.what}`);
  return [
    'MODULES this customer can open:', ...mods,
    '', 'SETTINGS tabs:', ...tabs,
    '', 'TROUBLESHOOTING:', ...TROUBLESHOOTING.map(t => `- ${t}`),
  ].join('\n');
}
