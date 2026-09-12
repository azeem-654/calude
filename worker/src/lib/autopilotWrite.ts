/**
 * Autopilot writing things: a landing page, a blog post, social posts.
 *
 * The app already writes all of this well — blogWriter, businessFlow,
 * SocialCreator — and every one of them runs in the browser against a key in
 * localStorage. That is the same wall the replies hit, and the same answer:
 * the prompts move to where the cron can reach them.
 *
 * ── What is deliberately not copied over ──
 *
 * The client writers are richer than these: keyword research, SEO scoring, tone
 * profiles built from a portfolio. Reimplementing that here would be a second
 * copy of a large body of work that would drift from the first.
 *
 * So this writes the *first draft only*, marks it a draft, and stamps it as
 * Autopilot's. A customer who wants the full treatment opens the module and
 * gets the real writer. What this removes is the blank page, which is the thing
 * that actually stops a plumber ever publishing anything.
 */
import { askGemini } from './ai';

export interface Brand {
  companyName: string;
  industry: string;
  description: string;
  products: string;
  audience: string;
  tone: string;
  website: string;
  objective: string;
}

function brandBlock(b: Brand): string {
  return `Company: ${b.companyName || '(unnamed)'}
Industry: ${b.industry || '(unstated)'}
What they do: ${b.description || '(unstated)'}
What they sell: ${b.products || '(unstated)'}
Who buys it: ${b.audience || '(unstated)'}
Tone of voice: ${b.tone || 'plain, warm, no jargon'}
Website: ${b.website || '(none yet)'}
What they are trying to achieve: ${b.objective || '(unstated)'}`;
}

/**
 * The rule every prompt below repeats.
 *
 * A model writing marketing copy for a business it knows six lines about will
 * invent awards, years in business, team sizes and guarantees — and the
 * customer will not notice until somebody holds them to one. So each prompt
 * forbids it explicitly and says what to do instead.
 */
const NO_INVENTING =
  'Do NOT invent facts about the business: no awards, no "family run since 1994", no team sizes, no guarantees, no prices, no statistics, and no client names, unless they appear above. If you need a specific you do not have, write around it rather than making it up.';

export interface Written<T> { ok: boolean; value?: T; error: string }

async function ask<T>(apiKey: string, prompt: string, temperature: number): Promise<Written<T>> {
  const r = await askGemini(apiKey, prompt, temperature);
  if (!r.ok) return { ok: false, error: r.error };
  try {
    return { ok: true, value: JSON.parse(r.text) as T, error: '' };
  } catch {
    return { ok: false, error: 'The model\'s answer was not readable JSON.' };
  }
}

/* ── A landing page ──────────────────────────────────────────────────────── */

export interface WrittenPage {
  headline: string;
  subhead: string;
  bullets: string[];
  cta: string;
  sections: { heading: string; body: string }[];
}

export function writeLandingPage(apiKey: string, b: Brand): Promise<Written<WrittenPage>> {
  return ask<WrittenPage>(apiKey, `Write the copy for a one-page website for this business.

=== THE BUSINESS ===
${brandBlock(b)}

Rules:
- Write for the person buying, not about the company. "Your boiler fixed today" beats "We are a leading heating company".
- ${NO_INVENTING}
- Plain words. No "leverage", "solutions", "bespoke", "passionate", "cutting-edge".
- Three bullets, each a concrete thing the customer gets.
- Two short sections underneath, each two or three sentences.

Return ONLY valid JSON, no fences:
{
  "headline": "under 60 characters",
  "subhead": "one sentence saying who it is for",
  "bullets": ["", "", ""],
  "cta": "the button text, 2-4 words",
  "sections": [{"heading": "", "body": ""}, {"heading": "", "body": ""}]
}`, 0.7);
}

/* ── A blog post ─────────────────────────────────────────────────────────── */

export interface WrittenPost {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  keywords: string[];
}

export function writeBlogPost(apiKey: string, b: Brand, topic = ''): Promise<Written<WrittenPost>> {
  return ask<WrittenPost>(apiKey, `Write a blog post for this business.

=== THE BUSINESS ===
${brandBlock(b)}

${topic ? `Topic: ${topic}` : 'Choose a topic their customers actually search for before buying — a question they ask, or a decision they are trying to make.'}

Rules:
- Genuinely useful to somebody who never buys anything. A post that is only an advert does not get read or ranked.
- ${NO_INVENTING}
- 500-700 words, in markdown, with two or three subheadings.
- No introduction about what the article will cover. Start with the substance.

Return ONLY valid JSON, no fences:
{
  "title": "",
  "slug": "lowercase-hyphenated",
  "excerpt": "one sentence",
  "body": "markdown",
  "keywords": ["", "", ""]
}`, 0.7);
}

/* ── Social posts ────────────────────────────────────────────────────────── */

export interface WrittenSocial {
  posts: { platform: string; body: string; hashtags: string[] }[];
}

export function writeSocialPosts(apiKey: string, b: Brand, count = 5): Promise<Written<WrittenSocial>> {
  return ask<WrittenSocial>(apiKey, `Write ${Math.min(Math.max(count, 1), 10)} social posts for this business.

=== THE BUSINESS ===
${brandBlock(b)}

Rules:
- Each post must stand alone and be about one thing. Not five posts saying "we do heating".
- Mix them: one useful tip, one behind-the-scenes, one common mistake customers make, one seasonal, one offer.
- ${NO_INVENTING}
- No "🚀", no "Let that sink in", no engagement-bait questions.
- Under 280 characters each so any platform can take it.

Return ONLY valid JSON, no fences:
{
  "posts": [{"platform": "facebook|instagram|linkedin|x", "body": "", "hashtags": ["", ""]}]
}`, 0.85);
}

/* ── A short video script ────────────────────────────────────────────────── */

export interface WrittenShort {
  title: string;
  hook: string;
  script: { at: string; say: string; show: string }[];
  caption: string;
}

export function writeShortScript(apiKey: string, b: Brand): Promise<Written<WrittenShort>> {
  return ask<WrittenShort>(apiKey, `Write a 30-second vertical video script for this business.

=== THE BUSINESS ===
${brandBlock(b)}

Rules:
- The first three seconds decide whether anybody watches. Open on the problem, not on a greeting.
- ${NO_INVENTING}
- Shootable on a phone by one person with no crew, no actors and no props they do not already own.
- Say what to point the camera at, in plain terms.

Return ONLY valid JSON, no fences:
{
  "title": "",
  "hook": "the first line, said in the first 3 seconds",
  "script": [{"at": "0-3s", "say": "", "show": ""}],
  "caption": "the caption to post it with"
}`, 0.8);
}

/* ── An email sequence ───────────────────────────────────────────────────── */

export interface WrittenSequence {
  name: string;
  steps: { day: number; subject: string; body: string }[];
}

/**
 * The first follow-up sequence.
 *
 * This is the one that unblocks everything else. Every enrolment play needs
 * somewhere to put people, so a workspace with no sequence could only ever be
 * told "there are contacts and nowhere to put them" — true, unhelpful, and the
 * opposite of hands-off.
 *
 * Three steps, because a small business that has never run a sequence will
 * read three and edit them. Twelve is a wall of text they will abandon, and
 * abandoning it is worse than not having it: the contacts sit enrolled in
 * something nobody has read.
 */
export function writeSequence(apiKey: string, b: Brand): Promise<Written<WrittenSequence>> {
  return ask<WrittenSequence>(apiKey, `Write a three-email follow-up sequence for this business, for somebody who has just enquired and not yet bought.

=== THE BUSINESS ===
${brandBlock(b)}

Rules:
- Written to one person who has just got in touch. Not a newsletter, not an announcement.
- ${NO_INVENTING}
- Each email does one job: the first answers them and says what happens next; the second is genuinely useful whether or not they buy; the third asks plainly whether they still want to go ahead, and accepts no for an answer.
- Short. Under 150 words each. A tradesperson's customer reads these on a phone between jobs.
- No "I hope this email finds you well", no "just circling back", no "touching base".
- Plain text with line breaks. No HTML, no images, no merge tags except {{firstName}}.
- Day 0, then a couple of days apart. Nobody wants three emails in a morning.

Return ONLY valid JSON, no fences:
{
  "name": "short name for the sequence, e.g. \\"New enquiry follow-up\\"",
  "steps": [
    {"day": 0, "subject": "", "body": ""},
    {"day": 2, "subject": "", "body": ""},
    {"day": 5, "subject": "", "body": ""}
  ]
}`, 0.7);
}

/* ── A campaign somebody briefed ─────────────────────────────────────────────
 *
 * The difference between this and `writeSequence` is who decided what it says.
 * A sequence is Autopilot's own first follow-up, written from the brand alone.
 * A campaign is a person sitting at the wizard saying "we are launching X, the
 * angle is Y, the call to action is Z" — so the brief leads and the brand only
 * supplies the voice.
 *
 * It exists because the wizard did not have this. It assembled the emails from
 * string templates full of `[describe key value]` and labelled the result
 * "AI-generated", which is both the dullest possible copy and a claim the app
 * could not back. Every prompt rule below is aimed at the specific ways that
 * copy was bad: no placeholder brackets, no invented benefits, no filler.
 */

export interface WrittenCampaign {
  steps: { day: number; subject: string; preheader: string; body: string; purpose: string }[];
}

export interface CampaignBrief {
  /** announce | promote | nurture | welcome | reengage | custom */
  goal: string;
  /** What the customer typed about the campaign. The most important input. */
  concept: string;
  cta: string;
  tone: string;
  channel: 'email' | 'sms';
  steps: number;
  /**
   * A link to the sender's own diary, when they chose to offer one.
   *
   * Passed in rather than invented. A model asked to "include a booking link"
   * with no link writes `https://calendly.com/your-name`, which is somebody
   * else's domain and a dead link in a real customer's email.
   */
  bookingUrl?: string;
}

/**
 * When email number `i` goes out.
 *
 * Close together at the start while the reason for writing is still fresh, then
 * spreading out — which is how a person would actually follow something up, and
 * it stops a fifteen-email run landing inside three weeks.
 */
function dayFor(i: number): number {
  const early = [0, 3, 7, 14, 21, 28];
  if (i < early.length) return early[i];
  /* Fortnightly after the first month. */
  return 28 + (i - early.length + 1) * 14;
}

const GOAL_JOB: Record<string, string> = {
  announce: 'tell people about something new and get them to look at it',
  promote: 'get people to take up a specific offer before it ends',
  nurture: 'be useful enough that the reader trusts them when they are ready to buy',
  welcome: 'get somebody who just signed up to their first result quickly',
  reengage: 'restart a conversation with somebody who has gone quiet, without guilt-tripping them',
  custom: 'achieve what the brief below says',
};

export function writeCampaign(apiKey: string, b: Brand, brief: CampaignBrief): Promise<Written<WrittenCampaign>> {
  /* Fifteen, because that is what the wizard offers. More than that is not a
     sequence, it is a grievance — and a model asked for thirty will pad. */
  const n = Math.min(Math.max(brief.steps || 3, 1), 15);
  const job = GOAL_JOB[brief.goal] ?? GOAL_JOB.custom;

  if (brief.channel === 'sms') {
    return ask<WrittenCampaign>(apiKey, `Write a ${n}-message SMS campaign for this business.

=== THE BUSINESS ===
${brandBlock(b)}

=== THE BRIEF ===
The job of this campaign: ${job}.
What it is about (the customer wrote this — it leads, the brand above is only the voice): ${brief.concept || '(they did not say — write something honest and general rather than inventing specifics)'}
What they want people to do: ${brief.cta || '(unstated)'}
Tone: ${brief.tone || 'plain and direct'}

Rules:
- ${NO_INVENTING}
- Under 300 characters each including the opt-out. SMS is charged per segment and read in a queue of messages from real people.
- Every message ends with "Reply STOP to opt out." That is a legal requirement, not a style choice.
- {{firstName}} is the only merge tag. Never invent others.
- Never write a placeholder in brackets. If you do not know a specific, write a sentence that does not need it.
- Later messages reference the first without repeating it word for word.

Return ONLY valid JSON, no fences:
{"steps":[${Array.from({ length: n }, (_, i) =>
      `{"day":${i * 3},"subject":"","preheader":"","body":"","purpose":"one short line on what this message is for"}`).join(',')}]}`, 0.75);
  }

  return ask<WrittenCampaign>(apiKey, `Write a ${n}-email campaign for this business.

=== THE BUSINESS ===
${brandBlock(b)}

=== THE BRIEF ===
The job of this campaign: ${job}.
What it is about (the customer wrote this — it leads, the brand above is only the voice): ${brief.concept || '(they did not say — write something honest and general rather than inventing specifics)'}
What they want people to do: ${brief.cta || '(unstated)'}
Tone: ${brief.tone || 'plain and direct'}
${brief.bookingUrl
    ? `Where to send people: ${brief.bookingUrl}
This is the sender's own booking page. At least two of the emails must link to it as the call to action, written as an ordinary sentence with the link in it — "pick a time that suits you" — not a bare URL on its own line. Use this exact address and never invent another.`
    : 'There is no booking link. Ask people to reply to the email; do not invent a scheduling URL of any kind.'}

Rules:
- ${NO_INVENTING}
- **Never write a placeholder.** No "[describe key value]", no "[Your Name]", no "[Benefit 1]". If you do not know a specific, write a sentence that does not need one. A draft full of brackets is worse than a shorter draft without them, because the customer sends it with the brackets still in.
- Under 160 words each. These are read on a phone. Short paragraphs, one idea each.
- Banned openings: "I hope this email finds you well", "just circling back", "touching base", "quick question", "I wanted to reach out".
- No exclamation marks in subject lines, and no emoji unless the tone is explicitly playful.
- Subject lines under 55 characters so they are not cut off. Each one different in shape — do not write five variations of the same sentence.
- The preheader is the line shown after the subject in an inbox. It must add something, not repeat the subject.
- Each email does a different job and says so in "purpose". Later emails refer back without repeating.
- The last one accepts no for an answer and says how to stop hearing about it.
- Plain HTML only: <p>, <strong>, <em>, <ul>, <li>, <a>. No <style>, no tables, no inline CSS, no images. The app styles it.
- {{firstName}} is the only merge tag. It must work if the name is missing, so never start a sentence with it alone.
- Sign off with the company name, not "[Your Name]".

Return ONLY valid JSON, no fences:
{"steps":[${Array.from({ length: n }, (_, i) =>
    `{"day":${dayFor(i)},"subject":"","preheader":"","body":"","purpose":"one short line on what this email is for"}`).join(',')}]}`, 0.75);
}

/* ── An automation somebody described ───────────────────────────────────────
 *
 * This used to call Anthropic's API **from the browser**, with a key read from
 * `localStorage.crm_anthropic_key` that nothing in the app ever sets. So it was
 * a third-party call from the bundle (which this codebase does not do), against
 * a provider the product does not use, with a key that was always empty — which
 * means it always fell through to a canned four-step fallback. Everybody who
 * pressed "Build with AI" got the same automation.
 */

export interface WrittenAutomation {
  name: string;
  nodes: { type: string; label: string; config: Record<string, string> }[];
}

/** What the builder can actually execute. A model inventing a step type outside
 *  this list produces a node the canvas cannot render or run. */
export const AUTOMATION_NODE_TYPES = [
  'trigger', 'wait', 'condition', 'send_email', 'send_sms',
  'add_tag', 'remove_tag', 'create_task', 'assign_to', 'update_field', 'end',
] as const;

export function writeAutomation(apiKey: string, b: Brand, prompt: string): Promise<Written<WrittenAutomation>> {
  return ask<WrittenAutomation>(apiKey, `Turn this description into a marketing automation for the business below.

=== THE BUSINESS ===
${brandBlock(b)}

=== WHAT THEY ASKED FOR ===
${prompt}

Rules:
- ${NO_INVENTING}
- Between 4 and 8 steps. The first is "trigger", the last is "end".
- Only these step types: ${AUTOMATION_NODE_TYPES.join(', ')}. Anything else cannot be run.
- Config by type:
  trigger: {"event":"..."} — what starts it, e.g. "form_submitted", "tag_added", "deal_stage_changed"
  wait: {"days":"3"}
  condition: {"field":"...","operator":"equals|not_equals|contains|greater_than","value":"..."}
  send_email: {"subject":"...","preview":"..."} — a real subject line for this business, not "Follow up email"
  send_sms: {"body":"... Reply STOP to opt out."}
  add_tag / remove_tag: {"tag":"..."}
  create_task: {"title":"...","dueInDays":"1"}
  assign_to: {"who":"..."}
  update_field: {"field":"...","value":"..."}
  end: {}
- Labels are what a person reads on the canvas: "Wait 3 days", not "wait_node_2".
- Never write a placeholder in brackets.

Return ONLY valid JSON, no fences:
{"name":"short name for this automation","nodes":[{"type":"trigger","label":"","config":{}}]}`, 0.5);
}
