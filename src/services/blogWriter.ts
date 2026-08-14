/**
 * Turning a planned post into an article.
 *
 * Two things here matter more than the prose.
 *
 * The first is the sanitiser. Everything this file produces is destined to
 * become a page on the customer's own domain, and some of it comes back from a
 * language model. A model that has read the whole internet will occasionally
 * return a `<script>` or an `onerror=` if the source material contained one, and
 * a blog module that publishes that has handed an attacker a stored XSS on a
 * business's live site. So nothing reaches the store un-sanitised: the allowlist
 * is small, it is applied to model output and to hand-edited HTML alike, and it
 * strips rather than escapes, because an escaped `<script>` shown as text is
 * still a bug.
 *
 * The second is that the SEO checks are measured, not asserted. Word count,
 * keyword density, heading count, internal links, meta lengths — all counted
 * from the finished HTML rather than from what the generator intended to write.
 * A generator that believes it put the keyword in the first paragraph and did
 * not is exactly the failure the checks exist to catch.
 */
import { getGeminiKey } from '../lib/gemini';
import type {
  Article, ArticleSeo, BlogProject, MonthPlan, PlannedPost, SeoCheck,
} from '../types/blogAutomation';

/* ── Sanitising ── */

/** Everything an article legitimately needs, and nothing else. */
const ALLOWED_TAGS = new Set([
  'p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'em', 'blockquote',
  'a', 'br', 'figure', 'figcaption', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'rel', 'target']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading']),
};

/** Schemes a link or image may use. `javascript:` is the whole point of this list. */
const SAFE_SCHEME = /^(https?:|mailto:|tel:|\/|#)/i;

/**
 * The one exception: a base64 raster image, on an `img` element only.
 *
 * Generated cover art is a `data:` URL, so blocking the scheme outright would
 * strip every picture this module makes. The allowance is drawn as narrowly as
 * it can be — an explicit list of raster media types, base64 only, and never on
 * an `href`. `data:text/html` remains blocked, which is the case that matters:
 * it is a whole document, and a link to one runs script in the site's origin.
 */
const SAFE_IMAGE_DATA = /^data:image\/(png|jpe?g|gif|webp|avif);base64,[A-Za-z0-9+/=\s]+$/i;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Strip anything not on the allowlist.
 *
 * Strips rather than escapes: an escaped `<script>` rendered as visible text in
 * the middle of an article is still a defect, just a less dangerous one.
 *
 * Falls back to a text-only reduction where DOMParser does not exist, so the
 * function is safe to call from a test runner or any later server-side pass
 * rather than throwing — and the fallback fails closed, keeping only text.
 */
export function sanitizeHtml(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return escapeHtml(
      html
        .replace(/<(script|style|iframe|object|embed|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    );
  }

  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html');
  const root = doc.getElementById('root');
  if (!root) return '';

  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const tag = child.tagName.toLowerCase();

      if (!ALLOWED_TAGS.has(tag)) {
        // Keep the words, drop the element. A disallowed wrapper should not
        // take a paragraph of real content down with it — except for the ones
        // whose *content* is the danger.
        if (['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'svg', 'template'].includes(tag)) {
          child.remove();
        } else {
          const text = doc.createTextNode(child.textContent ?? '');
          child.replaceWith(text);
        }
        continue;
      }

      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();
        const allowed = ALLOWED_ATTRS[tag];
        // Every on* handler goes, whether or not the tag is allowed.
        if (!allowed || !allowed.has(name) || name.startsWith('on')) {
          child.removeAttribute(attr.name);
          continue;
        }
        if (name === 'href' || name === 'src') {
          const value = attr.value.trim();
          const allowedHere = SAFE_SCHEME.test(value)
            || (name === 'src' && tag === 'img' && SAFE_IMAGE_DATA.test(value));
          if (!allowedHere) child.removeAttribute(attr.name);
        }
      }

      // Anything leaving the site opens in a new tab and does not leak the
      // referrer window — standard practice, and it is easier to enforce here
      // than to remember on every link.
      if (tag === 'a') {
        const href = child.getAttribute('href') ?? '';
        if (/^https?:/i.test(href)) child.setAttribute('rel', 'noopener noreferrer');
      }
      if (tag === 'img' && !child.getAttribute('alt')) {
        // An image with no alt is an accessibility failure and an SEO one. It
        // gets an empty alt rather than none, which at least marks it decorative.
        child.setAttribute('alt', '');
      }

      walk(child);
    }
  };
  walk(root);
  return root.innerHTML.trim();
}

/* ── Measuring ── */

/**
 * Tags that end a line of text.
 *
 * This list is the whole reason this function is not a one-line `textContent`.
 * `textContent` concatenates without separators, so `<p>one</p><h2>two</h2>`
 * comes back as `onetwo` — one word instead of two. Every measurement below
 * counts words, so that single missing space would understate length, inflate
 * density, and let a keyword phrase appear to match across a paragraph break
 * where no reader would ever see it.
 */
const BLOCK_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'br',
  'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'div', 'section', 'article', 'header', 'footer', 'aside', 'main', 'hr', 'pre',
]);

export function htmlToPlain(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: string[] = [];
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        out.push(child.textContent ?? '');
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = (child as Element).tagName.toLowerCase();
        const block = BLOCK_TAGS.has(tag);
        if (block) out.push(' ');
        walk(child);
        if (block) out.push(' ');
      }
    }
  };
  walk(doc.body);
  return out.join('').replace(/\s+/g, ' ').trim();
}

export const countWords = (text: string): number =>
  text.trim() ? text.trim().split(/\s+/).length : 0;

/** 220 words a minute, the usual figure for online reading. */
export const readingMinutes = (words: number): number => Math.max(1, Math.round(words / 220));

/**
 * How often the keyphrase appears, as a percentage of the article's words.
 *
 * Occurrences of the whole phrase over total word count — the definition Yoast
 * and the rest of the tooling use, and deliberately *not* one that weights the
 * count by how many words the phrase has. Weighting it would make a four-word
 * long-tail phrase look four times as stuffed as a one-word head term for the
 * same number of mentions, which would fire the stuffing warning hardest at
 * precisely the long-tail phrases this module's whole strategy is built on.
 *
 * Above roughly 3% reads as spam to a reader and to a search engine; 0 means
 * the phrase is not in the article at all, which is its own failure.
 */
export function keywordDensity(text: string, keyword: string): number {
  const words = countWords(text);
  const needle = keyword.trim().toLowerCase();
  if (!words || !needle) return 0;
  const hay = text.toLowerCase();
  let hits = 0;
  let at = 0;
  while ((at = hay.indexOf(needle, at)) !== -1) { hits += 1; at += needle.length; }
  return Math.round((hits / words) * 1000) / 10;
}

export function slugify(term: string): string {
  return term
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'post';
}

/* ── The checks ── */

/**
 * Everything is measured from the finished HTML.
 *
 * A generator that believes it put the keyword in the opening paragraph and did
 * not is exactly the failure worth catching, so nothing here trusts what the
 * writer meant to do.
 */
export function auditArticle(html: string, post: PlannedPost, meta: { metaTitle: string; metaDescription: string }): SeoCheck[] {
  const plain = htmlToPlain(html);
  const words = countWords(plain);
  const keyword = post.primaryKeyword.trim().toLowerCase();
  const lower = plain.toLowerCase();
  const opening = lower.split(/\s+/).slice(0, 100).join(' ');
  const density = keywordDensity(plain, keyword);
  const headings = (html.match(/<h[234]\b/gi) ?? []).length;
  const internal = (html.match(/<a\b[^>]*href=/gi) ?? []).length;

  const check = (id: string, label: string, ok: boolean, detail: string, why: string): SeoCheck =>
    ({ id, label, ok, detail, why });

  return [
    check('length', 'Long enough to be worth indexing',
      words >= Math.min(500, post.targetWords * 0.6),
      `${words} words (aiming for ${post.targetWords})`,
      'Thin pages rarely rank for anything competitive. A short answer to a long question loses to the page that answered it properly.'),
    check('keyword-title', 'The keyword is in the title',
      keyword ? meta.metaTitle.toLowerCase().includes(keyword) : false,
      meta.metaTitle || '—',
      'The title is the strongest on-page signal there is, and it is the line a searcher reads before deciding to click.'),
    check('keyword-opening', 'The keyword appears early',
      keyword ? opening.includes(keyword) : false,
      keyword ? (opening.includes(keyword) ? 'found in the first 100 words' : 'not in the first 100 words') : '—',
      'A reader who does not see their own words in the opening lines assumes they are on the wrong page and leaves.'),
    check('keyword-heading', 'The keyword is in a heading',
      keyword ? html.toLowerCase().replace(/<[^>]+>/g, ' ').includes(keyword) && new RegExp(`<h[234][^>]*>[^<]*${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(html) : false,
      headings ? `${headings} headings` : 'no headings',
      'Headings tell a search engine what the sections are about, and they are how a reader skims.'),
    check('density', 'Not stuffed',
      density > 0 && density <= 3,
      `${density}% of the words`,
      'Repeating the phrase past about 3% reads as spam to a person and to a search engine. Under 0% means it is not in there at all.'),
    check('internal-link', 'Links to a page that earns',
      internal > 0 && !!post.moneyPageId,
      internal ? `${internal} link${internal === 1 ? '' : 's'}` : 'no links',
      'The internal link is the mechanism. Without it the post ranks for itself and moves no revenue.'),
    check('meta-title-length', 'Title fits in a search result',
      meta.metaTitle.length > 0 && meta.metaTitle.length <= 60,
      `${meta.metaTitle.length} characters`,
      'Past about 60 characters Google truncates it, and the part it cuts is usually the part that would have earned the click.'),
    check('meta-description', 'Description fits and sells',
      meta.metaDescription.length >= 70 && meta.metaDescription.length <= 155,
      `${meta.metaDescription.length} characters`,
      'It is the two lines under the title. Too short wastes the space; past 155 it is cut off mid-sentence.'),
    check('headings', 'Broken into sections',
      headings >= 3,
      `${headings} headings`,
      'A wall of text is abandoned. Sections are how a reader finds the bit they came for.'),
  ];
}

/* ── Composing without a model ── */

const sentenceCase = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Meta title: the keyword, then the brand, inside 60 characters. */
export function buildMetaTitle(post: PlannedPost, project: BlogProject): string {
  const brand = project.name.trim();
  const base = post.title.trim() || sentenceCase(post.primaryKeyword);
  const withBrand = brand ? `${base} | ${brand}` : base;
  if (withBrand.length <= 60) return withBrand;
  if (base.length <= 60) return base;
  return `${base.slice(0, 57).trimEnd()}…`;
}

/** Meta description: what the post answers and what to do next, inside 155. */
export function buildMetaDescription(post: PlannedPost, project: BlogProject): string {
  const kw = post.primaryKeyword.trim();
  const where = project.seo.location.trim();
  const base = `${sentenceCase(kw)}${where ? ` in ${where}` : ''} — a straight answer${
    project.seo.offering.trim() ? `, from a team that does this every week` : ''
  }. What it depends on, what it costs, and what to do next.`;
  if (base.length <= 155) return base;
  return `${base.slice(0, 152).trimEnd()}…`;
}

/* ── The portfolio as source material ── */

const SENTENCE_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'this', 'that', 'as', 'at',
  'by', 'from', 'we', 'our', 'you', 'your', 'i', 'my', 'they', 'their', 'how',
  'what', 'why', 'when', 'which', 'do', 'does', 'can', 'not', 'so', 'if',
]);

const terms = (s: string): string[] =>
  s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !SENTENCE_STOPWORDS.has(w));

/**
 * The customer's own sentences, which is the only material here that is
 * actually true about their business.
 *
 * Everything the deterministic writer says about the business comes from this
 * pool. It never invents a price, a guarantee or a credential, because a blog
 * that fabricates one on a customer's live domain is worse than no blog — the
 * same rule the AI prompt is given, enforced here by having nothing else to say.
 */
function portfolioSentences(project: BlogProject): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of project.portfolio) {
    for (const raw of item.text.split(/(?<=[.!?])\s+|\n+/)) {
      const s = raw.replace(/\s+/g, ' ').trim();
      if (s.length < 40 || s.length > 320) continue;
      if (!/[a-z]/i.test(s)) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(/[.!?]$/.test(s) ? s : `${s}.`);
    }
  }
  return out;
}

/** The unused sentences that best match a heading, most relevant first. */
function matchSentences(pool: string[], used: Set<string>, want: string, limit: number): string[] {
  const wanted = terms(want);
  if (!wanted.length) return [];
  return pool
    .filter(s => !used.has(s))
    .map(s => {
      const words = new Set(terms(s));
      return { s, score: wanted.reduce((n, w) => n + (words.has(w) ? 1 : 0), 0) };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.s.length - b.s.length)
    .slice(0, limit)
    .map(x => x.s);
}

/**
 * The article, written from the plan and the customer's own words.
 *
 * This is the draft you get with no AI key configured, and it is a real
 * article rather than an outline with gaps: an opening that states what the
 * page answers, a section per planned heading filled with the most relevant
 * things the portfolio actually says, one section whose heading carries the
 * target phrase, one internal link with descriptive anchor text, and an FAQ
 * built from the cluster's other questions.
 *
 * Where the portfolio has nothing to say about a section, the paragraph is
 * editorial connective prose — what the section covers and what determines the
 * answer — never an assertion about the business. The alternative would be
 * inventing facts, and the length check will honestly report a draft that came
 * out thin because the portfolio was thin.
 */
/**
 * A profile field is only usable inline if it reads as a phrase.
 *
 * `audience` is meant to hold something like "homeowners in Bristol", but it is
 * distilled from prose and can come back as a whole sentence with a colon in
 * it. Splicing that into "written for …" produces the kind of sentence that
 * tells a reader immediately that nothing here was written by a person, so a
 * value that is not phrase-shaped is dropped rather than used badly.
 */
export function inlinePhrase(value: string, maxWords = 9): string {
  const s = value.trim().replace(/[.,;:]+$/, '');
  if (!s || s.length > 70 || /[:;]/.test(s)) return '';
  if (s.split(/\s+/).length > maxWords) return '';
  if (/[.!?]\s/.test(s)) return '';
  return s;
}

/** Join two fragments into one sentence without doubling the full stop. */
const sentence = (s: string) => `${s.trim().replace(/[.\s]+$/, '')}.`;

/**
 * Connective paragraphs for sections the portfolio says nothing about.
 *
 * Several variants rather than one, chosen by position, because the same
 * paragraph repeated under four headings is the single most obvious tell that
 * a page was generated — and a reader who spots it stops believing the rest.
 * None of these asserts anything about the business; they frame the section,
 * which is the only thing that can honestly be written without knowing more.
 */
const CONNECTIVE = [
  'The honest answer is that it depends, and this section covers the things that change it most. If you already know your own situation you can skip ahead — the detail below is for the cases that are not obvious.',
  'This is the part that catches people out. It interacts with the section above, and it is usually the second decision rather than the first that settles the outcome.',
  'There is a rule of thumb here and there is the reality, and they part company more often than the rule of thumb suggests. What follows is the reality.',
  'Most of the cost and most of the regret in this area come from getting this one thing wrong early. It is worth a minute even if you think it does not apply to you.',
  'Two things decide this, and they pull in opposite directions. Knowing which one matters more in your case is most of the answer.',
  'The short version is that there is no single number, and anyone who gives you one without asking a question first is guessing. Here is what the answer actually turns on.',
];

const FAQ_FALLBACK = [
  'This comes up often enough to be worth answering here rather than sending you back to search. The answer turns on the same factors as the sections above, and it changes if your situation is unusual — worth asking before assuming.',
  'The short answer is that it varies, and the variation is not random: it follows the same few factors covered above. If none of them describe your case, ask rather than guess.',
  'People ask this expecting a yes or no, and the truthful answer is a "depends" with two or three conditions attached. Those conditions are the ones set out earlier on this page.',
  'It is a fair question and the answer is less fixed than most pages imply. Read it alongside the section above, because the two are really the same question asked twice.',
];

export interface ComposeResult {
  html: string;
  /** Sections filled with the customer's own sentences. */
  sourced: number;
  /** Sections the portfolio had nothing to say about. */
  unsourced: number;
}

export function composeArticle(post: PlannedPost, project: BlogProject): string {
  return composeArticleWithStats(post, project).html;
}

export function composeArticleWithStats(post: PlannedPost, project: BlogProject): ComposeResult {
  const kw = post.primaryKeyword.trim();
  const page = project.moneyPages.find(m => m.id === post.moneyPageId);
  const who = inlinePhrase(project.seo.audience);
  const where = inlinePhrase(project.seo.location, 5);
  const offering = inlinePhrase(project.seo.offering, 12);
  const we = project.voice.person === 'i' ? 'I' : 'We';
  const us = project.voice.person === 'i' ? 'me' : 'us';

  const pool = portfolioSentences(project);
  const used = new Set<string>();
  const take = (want: string, limit: number) => {
    const picked = matchSentences(pool, used, want, limit);
    picked.forEach(s => used.add(s));
    return picked;
  };

  const parts: string[] = [];
  const p = (text: string) => parts.push(`<p>${escapeHtml(text)}</p>`);

  /* Headings are deduplicated across the whole article. The outline is planned
     independently of the sections added here, so without this the same heading
     can appear twice — which reads as a mistake and splits the section's own
     ranking signal in two. */
  const headingsUsed = new Set<string>();
  const h2 = (text: string): boolean => {
    const key = text.trim().toLowerCase();
    if (!key || headingsUsed.has(key)) return false;
    headingsUsed.add(key);
    parts.push(`<h2>${escapeHtml(text)}</h2>`);
    return true;
  };

  /* Opening — the phrase in the first sentence, stated once. */
  const angle = post.angle.trim();
  p(sentence(`${sentenceCase(kw)} is what this page is about${who ? `, written for ${who}` : ''}`)
    + ` ${angle ? sentence(angle) : 'Here is the short version first, then the detail behind it.'}`);

  const opener = take(`${kw} ${offering}`, 2);
  if (opener.length) p(opener.join(' '));
  else if (offering) {
    p(sentence(`${we} ${offering.replace(/^(we|i)\s+/i, '')}${where ? `, working across ${where}` : ''}`)
      + ' Everything below is written from that, so it should read as practical rather than general.');
  }

  if (where) {
    p(`${we} work in ${where}, so the detail below reflects what actually happens here — prices, timings and rules vary more by area than most guides admit.`);
  }

  /* The planned sections. */
  const headings = post.outline.length ? post.outline : ['The short answer', 'What it depends on', 'What to do next'];
  let filler = 0;
  let sourced = 0;
  for (const heading of headings) {
    if (!h2(heading)) continue;
    const found = take(heading, 3);
    if (found.length) { p(found.join(' ')); sourced++; }
    else p(CONNECTIVE[filler++ % CONNECTIVE.length]);
    const more = take(`${heading} ${kw}`, 2);
    if (more.length) p(more.join(' '));
  }

  /* One section whose heading carries the phrase. The keyword in a heading is
     a real ranking signal, and leaving it to chance in the outline means it is
     missing about half the time — but if the outline already covered it, adding
     a near-duplicate section is worse than adding nothing. */
  const kwInHeading = [...headingsUsed].some(h => h.includes(kw.toLowerCase()));
  if (!kwInHeading && h2(`What ${kw} really comes down to`)) {
    const core = take(kw, 3);
    if (core.length) p(core.join(' '));
    else p('Strip away the detail and it is a small number of decisions, made in order. Get the first one right and the rest follow; get it wrong and no amount of care later recovers it. That is the whole reason this page exists rather than a one-line answer.');
  }

  /* The internal link, with anchor text that describes the destination.
     "Click here" tells a search engine nothing about what it points at. */
  if (page?.url) {
    const anchor = page.primaryKeyword.trim() || page.title.trim() || 'our service page';
    h2('When to bring someone in');
    parts.push(`<p>${escapeHtml(
      `There is a point where doing it yourself costs more than it saves${where ? `, and in ${where} that point comes sooner than people expect` : ''}. If you have reached it, this is what ${project.name || us} does: `,
    )}<a href="${escapeHtml(page.url)}">${escapeHtml(anchor)}</a>.</p>`);
    const purpose = page.purpose.trim();
    if (purpose) p(sentence(purpose));
  }

  /* An FAQ from the cluster's other questions. Question headings are what a
     search engine lifts into a "people also ask" result. */
  const cluster = project.clusters.find(c => c.id === post.clusterId);
  const questions = (cluster?.keywords ?? [])
    .filter(k => k.term !== post.primaryKeyword && /^(how|what|why|when|which|is|do|does|can)\b/i.test(k.term))
    .slice(0, 4);
  if (questions.length) {
    h2('Common questions');
    let unanswered = 0;
    for (const q of questions) {
      parts.push(`<h3>${escapeHtml(`${sentenceCase(q.term)}?`)}</h3>`);
      const answer = take(q.term, 2);
      if (answer.length) p(answer.join(' '));
      else p(FAQ_FALLBACK[unanswered++ % FAQ_FALLBACK.length]);
    }
  }

  /* Close — the phrase once more, and a next step. */
  p(`That is the practical version of ${kw}. If your situation does not match any of the cases above, it is worth asking rather than guessing — the wrong assumption here is expensive to undo.`);

  return { html: sanitizeHtml(parts.join('\n')), sourced, unsourced: filler };
}

/* ── Assembling ── */

export function articleFrom(html: string, post: PlannedPost, project: BlogProject, source: Article['source'], note?: string): Article {
  const clean = sanitizeHtml(html);
  const plain = htmlToPlain(clean);
  const words = countWords(plain);
  const metaTitle = buildMetaTitle(post, project);
  const metaDescription = buildMetaDescription(post, project);

  const seo: ArticleSeo = {
    metaTitle,
    metaDescription,
    slug: slugify(post.primaryKeyword || post.title),
    words,
    readingMinutes: readingMinutes(words),
    density: keywordDensity(plain, post.primaryKeyword),
    internalLinks: (clean.match(/<a\b[^>]*href=/gi) ?? []).length,
    headings: (clean.match(/<h[234]\b/gi) ?? []).length,
    checks: auditArticle(clean, post, { metaTitle, metaDescription }),
  };

  return { html: clean, seo, writtenAt: new Date().toISOString(), source, note };
}

/**
 * The deterministic draft, with a note that says what it is and why.
 *
 * The note names the real limit rather than a generic one. "No key configured"
 * explains why it is not an AI draft; how many sections found nothing in the
 * portfolio explains why it may be thin — and that second one is the actionable
 * half, because adding two pages of source material fixes it without spending
 * anything.
 */
function composed(post: PlannedPost, project: BlogProject, prefix = ''): Article {
  const { html, sourced, unsourced } = composeArticleWithStats(post, project);
  const bits = [prefix || 'No Gemini key configured — written from your portfolio and the outline. Add a key in Settings → AI for a full draft.'];
  if (unsourced) {
    bits.push(
      `${unsourced} of ${sourced + unsourced} sections found nothing about "${post.primaryKeyword}" in the portfolio, so they are framing rather than detail — adding writing on this subject to the portfolio is what fills them.`,
    );
  }
  return articleFrom(html, post, project, 'heuristic', bits.join(' '));
}

/* ── The AI pass ── */

const MODEL = 'gemini-2.0-flash';

/**
 * Write one post.
 *
 * Whatever comes back is sanitised before it is looked at, let alone stored.
 * The model is given the voice profile, the outline and the internal link it
 * must include, and is told plainly not to invent facts about the business —
 * a blog that fabricates a price or a guarantee is worse than no blog.
 */
export async function writeWithAI(post: PlannedPost, project: BlogProject): Promise<Article> {
  const key = getGeminiKey();
  if (!key) return composed(post, project);

  const page = project.moneyPages.find(m => m.id === post.moneyPageId);
  const v = project.voice;

  const prompt = `Write one blog article as HTML. Return HTML only — no markdown, no <html> or <body> wrapper.

The business: ${project.seo.offering || 'not stated'}
Its audience: ${project.seo.audience || 'not stated'}
${project.seo.location ? `Where it works: ${project.seo.location}` : ''}

Voice: ${v.tone || 'plain'}, ${v.readingLevel} reading level, written as "${v.person}".
Average sentence around ${v.averageSentenceWords} words.
${v.signaturePhrases.length ? `Phrases they use: ${v.signaturePhrases.join(', ')}.` : ''}
${v.avoid.length ? `Never use: ${v.avoid.join(', ')}.` : ''}

Title: ${post.title}
The one phrase this must rank for: "${post.primaryKeyword}"
Angle: ${post.angle}
Sections (use these as <h2>): ${post.outline.join(' | ')}
Length: about ${post.targetWords} words.

Rules:
- Put "${post.primaryKeyword}" in the first 100 words and in at least one heading, naturally. Do not repeat it more than about 8 times in total.
${page?.url ? `- Include exactly one link to ${page.url}, with anchor text describing what is there — never "click here".` : ''}
- Finish with an FAQ of 3 question headings and short answers.
- Allowed tags: p, h2, h3, ul, ol, li, strong, em, blockquote, a. Nothing else.
- Do not invent prices, guarantees, statistics, awards or customer names. If a
  specific fact would be needed, write the sentence so the reader is told to ask.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7 },
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini returned ${res.status}`);
    const data = await res.json();
    const raw = String(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '')
      // Models wrap HTML in a fence often enough to be worth handling.
      .replace(/^\s*```(?:html)?\s*/i, '')
      .replace(/\s*```\s*$/, '');

    if (htmlToPlain(sanitizeHtml(raw)).length < 200) {
      throw new Error('the model returned almost nothing');
    }
    return articleFrom(raw, post, project, 'ai');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return composed(post, project, `The AI write failed (${message.slice(0, 140)}). Written from your portfolio and the outline instead.`);
  }
}

/** Re-measure after a human edit, so the checks describe what is now there. */
export function remeasure(article: Article, post: PlannedPost, project: BlogProject): Article {
  const next = articleFrom(article.html, post, project, article.source, article.note);
  return { ...next, writtenAt: article.writtenAt, edited: true };
}

/** Everything in a plan that still needs writing. */
export const unwritten = (plan: MonthPlan): PlannedPost[] =>
  plan.posts.filter(p => !p.article);
