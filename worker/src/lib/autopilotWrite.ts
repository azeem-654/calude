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
