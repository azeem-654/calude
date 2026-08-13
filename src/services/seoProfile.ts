/**
 * Reading a portfolio into a ranking strategy.
 *
 * The module's purpose is getting the customer's own pages to rank, so this
 * does not stop at "how do they write". It works out what they sell, to whom,
 * which of their terms are worth chasing, and how those terms group into
 * clusters — a pillar plus the long-tail questions around it — because a set of
 * linked posts pointed at one money page is what actually moves a ranking. A
 * scatter of unrelated articles does not.
 *
 * Two implementations, as elsewhere in this app. With a Gemini key the model
 * reads the portfolio. Without one — most accounts on day one — the same shape
 * is produced by reading the text: phrase extraction, intent classification by
 * the words people actually use, and clustering by shared terms. It is plainly
 * weaker, says so through `source: 'heuristic'`, and every consumer works either
 * way. A module that refuses to start without a key is worse than one that
 * starts with what it has.
 */
import { extractPhrases, extractSentences } from './campaignAnalysis';
import { getGeminiKey } from '../lib/gemini';
import { newId } from './blogAutomation';
import type {
  Keyword, MoneyPage, PortfolioItem, SearchIntent, SeoProfile, TopicCluster, VoiceProfile,
} from '../types/blogAutomation';

export interface DistilledProfile {
  voice: VoiceProfile;
  seo: SeoProfile;
  clusters: TopicCluster[];
  suggestedMoneyPages: MoneyPage[];
  source: 'ai' | 'heuristic';
  note?: string;
}

/* ── Intent ── */

/** Words that give a search away. Order matters: transactional beats commercial. */
const INTENT_MARKERS: [SearchIntent, RegExp][] = [
  ['transactional', /\b(buy|price|pricing|cost|quote|hire|book|order|near me|for sale|cheap|deal)\b/i],
  ['commercial', /\b(best|top|vs|versus|compare|comparison|review|alternative|which)\b/i],
  ['informational', /\b(how|what|why|when|guide|tutorial|tips|ideas|examples|checklist|mistakes)\b/i],
];

export function classifyIntent(term: string): SearchIntent {
  for (const [intent, re] of INTENT_MARKERS) if (re.test(term)) return intent;
  // A bare noun phrase is usually someone researching.
  return 'informational';
}

/**
 * A rough difficulty, from what is visible in the phrase itself.
 *
 * There is no search-volume API behind this and the UI says so. What it does
 * encode is real and useful: short, generic, commercial terms are contested;
 * long, specific, question-shaped ones are where a new site can actually win.
 */
export function estimateDifficulty(term: string): number {
  const words = term.trim().split(/\s+/).length;
  // Calibrated so the scale actually separates things. An earlier version sat
  // almost every two-word phrase at 58, which put every cluster at "0 winnable"
  // — a difficulty column that returns the same number for everything is worse
  // than none, because it looks like information.
  let score = 62;
  // Each extra word narrows the field sharply; that is the whole long-tail idea.
  score -= Math.min((words - 1) * 15, 48);
  const intent = classifyIntent(term);
  if (intent === 'transactional') score += 20;
  if (intent === 'commercial') score += 12;
  // A question is someone looking for an answer, which is what a post is.
  if (/^(how|what|why|when|which|can|do|does|is)\b/i.test(term)) score -= 10;
  // A place name narrows it to one market.
  if (/\b(near me|in |bristol|london|manchester)\b/i.test(term)) score -= 6;
  // Very short single words are the hardest thing on the internet.
  if (words === 1) score += 20;
  return Math.max(5, Math.min(95, Math.round(score)));
}

/* ── The deterministic reader ── */

const ALL_TEXT = (items: PortfolioItem[]) => items.map(i => i.text).join('\n\n');

/** How often a phrase appears, as evidence the business really is about it. */
function weigh(phrase: string, corpus: string): number {
  const needle = phrase.toLowerCase();
  let n = 0;
  let at = 0;
  const hay = corpus.toLowerCase();
  while ((at = hay.indexOf(needle, at)) !== -1) { n += 1; at += needle.length; }
  return n;
}

/** Average words per sentence — the single most legible voice measurement. */
function averageSentenceWords(text: string): number {
  const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 12);
  if (!sentences.length) return 18;
  const total = sentences.reduce((n, s) => n + s.split(/\s+/).length, 0);
  return Math.max(6, Math.min(40, Math.round(total / sentences.length)));
}

function detectPerson(text: string): VoiceProfile['person'] {
  const we = (text.match(/\b(we|our|us)\b/gi) ?? []).length;
  const i = (text.match(/\b(i|my|me)\b/gi) ?? []).length;
  if (we === 0 && i === 0) return 'neutral';
  return we >= i ? 'we' : 'i';
}

function detectReadingLevel(avgWords: number, text: string): VoiceProfile['readingLevel'] {
  const longWords = (text.match(/\b\w{12,}\b/g) ?? []).length;
  const words = Math.max(1, text.split(/\s+/).length);
  const density = longWords / words;
  if (density > 0.035 || avgWords > 26) return 'technical';
  if (avgWords <= 15) return 'plain';
  return 'standard';
}

function detectTone(text: string, avgWords: number): string {
  const bits: string[] = [];
  bits.push(avgWords <= 15 ? 'plain' : avgWords >= 26 ? 'considered' : 'direct');
  if (/\b(you|your)\b/i.test(text)) bits.push('second-person');
  if (/[!]/.test(text)) bits.push('warm');
  else bits.push('measured');
  return bits.slice(0, 3).join(', ');
}

/**
 * Group keywords into pillars.
 *
 * Terms that share a significant word belong to the same conversation, and the
 * heaviest term in each group becomes the pillar. Crude next to an embedding,
 * but it produces the structure the planner needs and it never needs a key.
 */
/** A phrase that trails off — "service without" — is not a topic anyone searches. */
const TRAILING = /\b(without|with|for|from|and|the|of|to|in|on|at|by|as|is|are|that|this|your|our)$/i;

/**
 * A phrase that is really a sentence fragment — "service takes", "boilers
 * running". Nobody searches a verb, so these make terrible pillars even though
 * they are perfectly good evidence of what the business talks about.
 */
const VERBY = /\b\w+(ing|ed|es|takes|goes|runs|helps|makes|gets)$/i;

/** Is this phrase worth putting at the head of a cluster? */
function usablePillar(term: string): boolean {
  const words = term.trim().split(/\s+/);
  // One word is either too broad to win or too vague to plan around.
  if (words.length < 2) return false;
  if (TRAILING.test(term)) return false;
  if (VERBY.test(term)) return false;
  return true;
}

function cluster(keywords: Keyword[], max = 6): TopicCluster[] {
  const STOP = new Set(['the', 'and', 'for', 'with', 'your', 'you', 'our', 'from', 'that', 'this']);
  const used = new Set<string>();
  const clusters: TopicCluster[] = [];

  const heavy = [...keywords].sort((a, b) => b.weight - a.weight || a.difficulty - b.difficulty);

  for (const seed of heavy) {
    if (used.has(seed.term) || clusters.length >= max) continue;
    if (!usablePillar(seed.term)) continue;
    const seedWords = seed.term.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !STOP.has(w));
    if (!seedWords.length) continue;

    const members = heavy.filter(k => {
      if (used.has(k.term)) return false;
      const kw = k.term.toLowerCase().split(/\s+/);
      return seedWords.some(w => kw.includes(w));
    });
    if (members.length < 2) continue;

    members.forEach(m => used.add(m.term));
    clusters.push({
      id: newId('cl'),
      pillar: seed.term,
      // Supporting terms first by how winnable they are — that is the order a
      // planner should schedule them in.
      keywords: members.sort((a, b) => a.difficulty - b.difficulty).slice(0, 12),
    });
  }

  // Anything left over that is still worth writing about gets its own cluster,
  // rather than being dropped silently.
  const orphans = heavy
    .filter(k => !used.has(k.term) && usablePillar(k.term))
    .slice(0, Math.max(0, max - clusters.length));
  for (const o of orphans) {
    clusters.push({ id: newId('cl'), pillar: o.term, keywords: [o] });
  }
  return clusters;
}

/**
 * Long-tail variants of a pillar.
 *
 * The phrase extractor produces one- and two-word terms — the business's own
 * vocabulary — and those are precisely the terms nobody new can rank for. The
 * winnable searches are longer and question-shaped, and they are not in the
 * portfolio because nobody writes "how much does a boiler service cost" in
 * their own about page.
 *
 * So they are derived. These are the standard modifier patterns a search
 * marketer would expand a seed into, and they are labelled in the UI as
 * suggestions rather than as observed data, because that is what they are.
 */
/** "a boiler" / "an oven" — a template that reads wrong is not a search phrase. */
const article = (word: string) => (/^[aeiou]/i.test(word.trim()) ? 'an' : 'a');

/** Plural heads take different templates: "how to choose a radiator problems" is nonsense. */
const isPlural = (phrase: string) => {
  const last = phrase.trim().split(/\s+/).pop() ?? '';
  return /s$/i.test(last) && !/(ss|us|is)$/i.test(last);
};

export function expandLongTail(pillar: string, location = ''): string[] {
  const p = pillar.trim().toLowerCase();
  if (!p) return [];

  const plural = isPlural(p);
  const out = plural
    ? [
      `how to fix ${p}`,
      `${p} explained`,
      `how much do ${p} cost`,
      `best ${p}`,
      `${p} checklist`,
      `common ${p} mistakes`,
    ]
    : [
      `how to choose ${article(p)} ${p}`,
      `what is ${article(p)} ${p}`,
      `how much does ${article(p)} ${p} cost`,
      `best ${p}`,
      `${p} checklist`,
      `common ${p} mistakes`,
    ];

  // Local intent is the single easiest win a small business has, so it is only
  // offered when the business actually said it works somewhere.
  if (location.trim()) {
    const loc = location.trim().toLowerCase();
    out.push(`${p} in ${loc}`, `${p} near me`);
  }
  return out;
}

/** The portfolio read without a model. */
export function distilFromText(items: PortfolioItem[]): DistilledProfile {
  const corpus = ALL_TEXT(items);
  const phrases = extractPhrases(corpus, '', 40);

  const keywords: Keyword[] = phrases.map(term => ({
    term,
    intent: classifyIntent(term),
    difficulty: estimateDifficulty(term),
    weight: weigh(term, corpus),
  })).filter(k => k.weight > 0);

  const avgWords = averageSentenceWords(corpus);
  const sentences = extractSentences(corpus, 40);

  // A "signature phrase" is one the business repeats. Repetition is the signal.
  const signaturePhrases = keywords
    .filter(k => k.weight >= 2 && k.term.includes(' '))
    .slice(0, 6)
    .map(k => k.term);

  const offering = sentences.find(s => /\b(we|our|i)\b.{0,40}\b(help|offer|provide|build|make|sell|specialis|specializ)/i.test(s))
    ?? sentences[0] ?? '';
  const audience = sentences.find(s => /\b(for|clients|customers|businesses|owners|teams|founders)\b/i.test(s)) ?? '';

  // A UK or US postal-ish town reference is the usual giveaway for a local
  // business, and local intent changes every keyword decision downstream.
  const location = (corpus.match(/\b(?:in|near|serving|based in)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/) ?? [])[1] ?? '';

  const clusters = cluster(keywords);

  // Each cluster gets long-tail suggestions alongside the observed terms, so a
  // planner has something winnable to schedule against rather than six
  // two-word phrases nobody can rank for.
  for (const c of clusters) {
    const have = new Set(c.keywords.map(k => k.term.toLowerCase()));
    for (const term of expandLongTail(c.pillar, location)) {
      if (have.has(term)) continue;
      c.keywords.push({
        term,
        intent: classifyIntent(term),
        difficulty: estimateDifficulty(term),
        // Zero weight is the honest marker: this phrase is a suggestion, not
        // something the portfolio said.
        weight: 0,
      });
    }
    c.keywords.sort((a, b) => a.difficulty - b.difficulty);
  }

  return {
    voice: {
      tone: detectTone(corpus, avgWords),
      readingLevel: detectReadingLevel(avgWords, corpus),
      averageSentenceWords: avgWords,
      signaturePhrases,
      avoid: [],
      person: detectPerson(corpus),
    },
    seo: {
      offering: offering.slice(0, 240),
      audience: audience.slice(0, 240),
      location,
      competitorTerms: [],
    },
    clusters,
    suggestedMoneyPages: items
      .filter(i => (i.kind === 'site-page' || i.kind === 'url') && i.url)
      .slice(0, 8)
      .map(i => ({
        id: newId('mp'),
        title: i.label,
        url: i.url!,
        purpose: '',
        primaryKeyword: '',
        websiteId: i.websiteId,
      })),
    source: 'heuristic',
  };
}

/* ── The AI reader ── */

const MODEL = 'gemini-2.0-flash';

interface RawProfile {
  offering?: string;
  audience?: string;
  location?: string;
  competitorTerms?: string[];
  tone?: string;
  readingLevel?: string;
  person?: string;
  signaturePhrases?: string[];
  avoid?: string[];
  clusters?: { pillar?: string; keywords?: string[] }[];
}

/**
 * Ask the model to read the portfolio as an SEO strategist would.
 *
 * Whatever comes back is treated as untrusted: every field is re-derived or
 * clamped through the same helpers the deterministic path uses, so a model that
 * invents a difficulty score or a nonsense intent cannot get one onto the
 * screen. What the model is genuinely better at — judging what a business
 * actually sells, and which topics group together — is what we keep.
 */
export async function distilWithAI(items: PortfolioItem[]): Promise<DistilledProfile> {
  const key = getGeminiKey();
  const corpus = ALL_TEXT(items);

  if (!key) {
    return {
      ...distilFromText(items),
      note: 'No Gemini key configured — read from the text itself. Add a key in Settings → AI for a sharper strategy.',
    };
  }
  if (corpus.trim().length < 200) {
    return { ...distilFromText(items), note: 'Not enough portfolio text to analyse yet.' };
  }

  const prompt = `You are an SEO strategist. Read this business's own writing and return JSON only.

${corpus.slice(0, 24000)}

Return exactly this shape:
{
  "offering": "one sentence: what they sell",
  "audience": "one sentence: who they sell to",
  "location": "town or region if they are a local business, else empty string",
  "competitorTerms": ["up to 5 terms a competitor would own"],
  "tone": "two or three words describing how they write",
  "readingLevel": "plain | standard | technical",
  "person": "we | i | neutral",
  "signaturePhrases": ["up to 6 phrases they actually repeat"],
  "avoid": ["up to 6 words they never use, or jargon they avoid"],
  "clusters": [
    { "pillar": "the broad topic", "keywords": ["8-12 specific search phrases someone would type"] }
  ]
}
Give 3 to 6 clusters. Keywords must be phrases a real person would search for,
not slogans. Prefer specific long-tail phrases over one-word terms.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini returned ${res.status}`);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const raw = JSON.parse(text) as RawProfile;

    const base = distilFromText(items);
    const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v.trim().slice(0, 240) : fallback);
    const list = (v: unknown, n: number) =>
      (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string')
        .map(x => x.trim()).filter(Boolean).slice(0, n);

    const clusters: TopicCluster[] = (Array.isArray(raw.clusters) ? raw.clusters : [])
      .slice(0, 6)
      .map(c => {
        const terms = list(c.keywords, 12);
        return {
          id: newId('cl'),
          pillar: str(c.pillar, terms[0] ?? '').slice(0, 120),
          // Difficulty and intent are ours, not the model's — it has no more
          // idea of a real difficulty than we do, and a fabricated number
          // presented as data is worse than an honest heuristic.
          keywords: terms.map(term => ({
            term,
            intent: classifyIntent(term),
            difficulty: estimateDifficulty(term),
            weight: weigh(term, corpus),
          })),
        };
      })
      .filter(c => c.pillar && c.keywords.length);

    const level = str(raw.readingLevel).toLowerCase();
    const person = str(raw.person).toLowerCase();

    return {
      voice: {
        tone: str(raw.tone, base.voice.tone).slice(0, 60),
        readingLevel: level === 'plain' || level === 'technical' ? level : 'standard',
        // Measured, not asked — the model cannot count better than we can.
        averageSentenceWords: base.voice.averageSentenceWords,
        signaturePhrases: list(raw.signaturePhrases, 6),
        avoid: list(raw.avoid, 6),
        person: person === 'i' || person === 'neutral' ? person : 'we',
      },
      seo: {
        offering: str(raw.offering, base.seo.offering),
        audience: str(raw.audience, base.seo.audience),
        location: str(raw.location, base.seo.location).slice(0, 80),
        competitorTerms: list(raw.competitorTerms, 5),
      },
      clusters: clusters.length ? clusters : base.clusters,
      suggestedMoneyPages: base.suggestedMoneyPages,
      source: 'ai',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...distilFromText(items),
      note: `The AI read failed (${message.slice(0, 140)}). Read from the text instead.`,
    };
  }
}

/* ── Reporting ── */

export interface ClusterStats {
  terms: number;
  /** The winnable ones — where a new site actually stands a chance. */
  easy: number;
  byIntent: Record<SearchIntent, number>;
  averageDifficulty: number;
}

export function clusterStats(c: TopicCluster): ClusterStats {
  const byIntent: Record<SearchIntent, number> = {
    informational: 0, commercial: 0, transactional: 0, navigational: 0,
  };
  for (const k of c.keywords) byIntent[k.intent] += 1;
  const total = c.keywords.length;
  return {
    terms: total,
    easy: c.keywords.filter(k => k.difficulty <= 40).length,
    byIntent,
    averageDifficulty: total
      ? Math.round(c.keywords.reduce((n, k) => n + k.difficulty, 0) / total)
      : 0,
  };
}
