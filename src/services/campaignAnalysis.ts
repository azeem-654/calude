/**
 * Phase 1 — understanding the video.
 *
 * Everything the rest of the pipeline writes is downstream of this: the clips,
 * the captions, the emails, the blog. So it has two implementations, not one.
 *
 * With a Gemini key the video itself is watched. Without one — which is most
 * accounts on day one — a deterministic analyser reads the title, description
 * and goal and produces the same shape from text alone. It is plainly weaker,
 * says so via `source: 'heuristic'`, and every consumer works either way. A
 * campaign that refuses to run because a key is missing is worse than one that
 * runs on what it has.
 */
import {
  analyzeVideoWithGemini, getGeminiKey, sanitizeAnalysis,
  uploadFileToGemini, waitForFileActive,
} from '../lib/gemini';
import type { Campaign, CampaignGoal, CampaignSource } from '../types/socialAutomation';

export type Tone = 'professional' | 'casual' | 'inspirational' | 'humorous' | 'urgent';

export interface Moment {
  start: number;
  end: number;
  title: string;
  transcript: string;
  viralityScore: number;
  hashtags: string[];
  focus: string;
  /** Why this moment was picked — shown to the user so the choice is auditable. */
  reason: string;
}

export interface CampaignAnalysis {
  sourceId: string;
  summary: string;
  topics: string[];
  talkingPoints: string[];
  tone: Tone;
  keywords: string[];
  hashtags: string[];
  ctas: string[];
  moments: Moment[];
  durationSec: number;
  language: string;
  /** 'ai' when the video was watched, 'heuristic' when only the text was read. */
  source: 'ai' | 'heuristic';
  /** Set when the AI was tried and failed, so the UI can explain the downgrade. */
  note?: string;
}

/* ── Tone and calls to action follow from the goal ── */

const TONE_BY_GOAL: Record<CampaignGoal, Tone> = {
  educate: 'professional',
  promote: 'urgent',
  awareness: 'casual',
  launch: 'urgent',
  testimonial: 'inspirational',
  entertain: 'humorous',
  traffic: 'casual',
};

const CTAS_BY_GOAL: Record<CampaignGoal, string[]> = {
  educate: ['Save this for later', 'Follow for more like this', 'Which one surprised you?', 'Read the full breakdown'],
  promote: ['Book a call this week', 'See pricing and start today', 'Claim your spot', 'Reply and I will send details'],
  awareness: ['Follow along', 'Share this with someone who needs it', 'Tell me what you think', 'More on this soon'],
  launch: ['Join the waitlist', 'Doors open this week', 'Get early access', 'Set a reminder'],
  testimonial: ['See more results', 'Read the full story', 'Could this be you?', 'Start your own'],
  entertain: ['Tag someone who does this', 'Which one are you?', 'Wait for the end', 'Follow for part two'],
  traffic: ['Full article on the site', 'Link in bio', 'Read the whole thing', 'Get the free guide'],
};

/* ── The text analyser ── */

const STOPWORDS = new Set([
  'the', 'and', 'for', 'you', 'your', 'that', 'this', 'with', 'have', 'from', 'they', 'been',
  'will', 'what', 'when', 'were', 'them', 'then', 'than', 'into', 'more', 'some', 'about',
  'just', 'like', 'over', 'also', 'most', 'other', 'because', 'these', 'those', 'there', 'their',
  'which', 'would', 'could', 'should', 'after', 'before', 'while', 'being', 'does', 'doing',
  'here', 'very', 'much', 'many', 'make', 'made', 'take', 'went', 'come', 'came', 'know', 'want',
  'need', 'work', 'time', 'people', 'thing', 'things', 'really', 'going', 'says', 'said', 'get',
  'got', 'its', 'was', 'are', 'not', 'but', 'all', 'can', 'has', 'had', 'out', 'one', 'two',
  // Number words read as content otherwise, and "#five" is nobody's hashtag.
  'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  // Determiners and filler that survived the length test.
  'any', 'each', 'every', 'both', 'such', 'same', 'own', 'few', 'who', 'why', 'how',
  'off', 'yet', 'per', 'via',
  // Verbs and adverbs that carry no topic — a hashtag made of one is noise.
  'beats', 'covers', 'gives', 'gave', 'goes', 'keep', 'kept', 'look', 'looks', 'find', 'finds',
  'found', 'show', 'shows', 'shown', 'tell', 'told', 'turn', 'turns', 'used', 'uses', 'using',
  'write', 'wrote', 'writes', 'read', 'reads', 'help', 'helps', 'lets', 'give', 'even', 'still',
  'back', 'down', 'only', 'ever', 'never', 'always', 'often', 'sure', 'away', 'good', 'great',
  'best', 'well', 'next', 'last', 'says', 'seem', 'seems', 'must', 'may', 'might',
]);

/** `actually`, `usually`, `simply` — adverbs are never the topic. */
const isAdverb = (w: string) => w.length >= 6 && w.endsWith('ly');

/** Words worth building SEO from, most frequent first. */
export function extractKeywords(text: string, limit = 12): string[] {
  const counts = new Map<string, number>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9'-]+/)) {
    const w = raw.replace(/^['-]+|['-]+$/g, '');
    if (w.length < 4 || STOPWORDS.has(w) || isAdverb(w) || /^\d+$/.test(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([w]) => w);
}

/** Split into clauses, so a phrase never runs across a comma or a full stop. */
function clauses(text: string): string[][] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9'\- ]+/)
    .map(c => c.split(/\s+/).map(w => w.replace(/^['-]+|['-]+$/g, '')).filter(Boolean));
}

/**
 * The phrases a person would actually tag: one or two words, taken from
 * unbroken runs of content words.
 *
 * Single words on their own are a poor hashtag — `#first` and `#hire` say
 * nothing that `#firstHire` does not — so pairs are scored above singles, and a
 * single already contained in a chosen pair is dropped. Anything appearing in
 * `emphasis` (the title, in practice) is lifted, because the title is the one
 * sentence the author definitely chose deliberately.
 */
export function extractPhrases(text: string, emphasis = '', limit = 12): string[] {
  const scores = new Map<string, number>();
  const lifted = new Set<string>();

  const walk = (src: string, into: (phrase: string, isPair: boolean) => void) => {
    for (const clause of clauses(src)) {
      let run: string[] = [];
      const flush = () => {
        for (let i = 0; i < run.length; i++) {
          into(run[i], false);
          if (i + 1 < run.length) into(`${run[i]} ${run[i + 1]}`, true);
        }
        run = [];
      };
      for (const w of clause) {
        if (w.length < 3 || STOPWORDS.has(w) || isAdverb(w) || /^\d+$/.test(w)) flush();
        else run.push(w);
      }
      flush();
    }
  };

  walk(emphasis, p => lifted.add(p));
  walk(text, (p, isPair) => {
    if (p.replace(/\s/g, '').length < 5) return;
    scores.set(p, (scores.get(p) ?? 0) + (isPair ? 2 : 1));
  });
  for (const p of lifted) {
    if (scores.has(p)) scores.set(p, (scores.get(p) ?? 0) + 3);
  }

  const out: string[] = [];
  for (const [phrase] of [...scores.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)) {
    if (!phrase.includes(' ') && out.some(p => p.includes(' ') && p.split(' ').includes(phrase))) continue;
    out.push(phrase);
    if (out.length >= limit) break;
  }
  return out;
}

/** Sentences long enough to stand on their own, which is what a talking point is. */
export function extractSentences(text: string, limit = 8): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length >= 25 && s.length <= 260)
    .slice(0, limit);
}

/** `#firstHire` — a hashtag a human would actually write. */
export function toHashtag(phrase: string): string {
  const parts = phrase.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (parts.length === 0) return '';
  const [head, ...rest] = parts;
  return `#${head}${rest.map(w => w[0].toUpperCase() + w.slice(1)).join('')}`;
}

const GOAL_TAGS: Record<CampaignGoal, string[]> = {
  educate: ['#howTo', '#learnOnSocial', '#tips'],
  promote: ['#smallBusiness', '#offer', '#services'],
  awareness: ['#brand', '#behindTheScenes', '#founder'],
  launch: ['#launch', '#newRelease', '#comingSoon'],
  testimonial: ['#clientStory', '#results', '#casestudy'],
  entertain: ['#relatable', '#funny', '#storytime'],
  traffic: ['#blog', '#readMore', '#newPost'],
};

/**
 * Analysis from the text alone. Deliberately conservative: it never invents a
 * quote it cannot support, and the moments it proposes are evenly spaced
 * windows flagged as estimates rather than claimed discoveries.
 */
export function analyseFromText(
  campaign: Pick<Campaign, 'title' | 'description' | 'goal'>,
  source: CampaignSource,
  durationSec = 0,
): CampaignAnalysis {
  const text = `${campaign.title}. ${campaign.description}`.trim();
  const phrases = extractPhrases(text, campaign.title);
  const keywords = phrases.length ? phrases : extractKeywords(text);
  const talkingPoints = extractSentences(campaign.description);
  const tags = [...new Set([
    ...keywords.slice(0, 8).map(toHashtag).filter(Boolean),
    ...GOAL_TAGS[campaign.goal],
  ])];

  // Without watching the video we cannot know where the good bits are. Six
  // evenly spaced windows give the clip step something real to cut against,
  // and the reason says exactly what they are.
  const total = durationSec > 0 ? durationSec : 0;
  const count = total > 0 ? Math.min(6, Math.max(3, Math.floor(total / 60))) : 0;
  const moments: Moment[] = [];
  for (let i = 0; i < count; i++) {
    const start = Math.round((total / count) * i);
    const end = Math.min(total, start + 45);
    if (end - start < 10) continue;
    moments.push({
      start, end,
      title: campaign.title ? `${campaign.title} — part ${i + 1}` : `Clip ${i + 1}`,
      transcript: '',
      // Evenly spaced guesses should not outrank anything the AI found, so they
      // sit in a deliberately low band.
      viralityScore: 55 - i * 3,
      hashtags: tags.slice(0, 5),
      focus: 'educational',
      reason: 'Evenly spaced window — add a Gemini key in Settings to have the video actually watched.',
    });
  }

  return {
    sourceId: source.id,
    summary: campaign.description.trim() || campaign.title.trim() || 'No description was provided.',
    topics: keywords.slice(0, 5),
    talkingPoints,
    tone: TONE_BY_GOAL[campaign.goal],
    keywords,
    hashtags: tags,
    ctas: CTAS_BY_GOAL[campaign.goal],
    moments,
    durationSec: total,
    language: 'English',
    source: 'heuristic',
  };
}

/* ── The AI analyser ── */

/** Gemini needs a file it can reach: an upload for a local file, the URL for YouTube. */
async function sourceUri(source: CampaignSource): Promise<{ uri: string; mimeType: string | null }> {
  if (source.kind === 'youtube' && source.url) return { uri: source.url, mimeType: null };
  if (!source.blobUrl) {
    throw new Error('The uploaded file is no longer available in this browser session. Re-add the video to analyse it.');
  }
  const blob = await fetch(source.blobUrl).then(r => r.blob());
  const file = new File([blob], source.name, { type: source.mimeType || 'video/mp4' });
  const uri = await uploadFileToGemini(file);
  await waitForFileActive(uri);
  return { uri, mimeType: file.type || 'video/mp4' };
}

/**
 * Watch the video and turn what Gemini found into campaign analysis. Falls back
 * to the text analyser on any failure — a missing key, a quota wall, an expired
 * blob — carrying the reason forward so the UI can say what happened.
 */
export async function analyseSource(
  campaign: Pick<Campaign, 'title' | 'description' | 'goal'>,
  source: CampaignSource,
): Promise<CampaignAnalysis> {
  if (!getGeminiKey()) {
    return { ...analyseFromText(campaign, source, source.durationSec ?? 0), note: 'No Gemini key configured — written from the title and description.' };
  }

  try {
    const { uri, mimeType } = await sourceUri(source);
    const raw = await analyzeVideoWithGemini(uri, mimeType, { maxClipDuration: 60, focus: 'all' }, source.durationSec);
    const clean = sanitizeAnalysis(raw, 60, source.durationSec);

    const fromClips = clean.clips.flatMap(c => c.hashtags ?? []);
    const summaryText = `${clean.videoSummary} ${clean.clips.map(c => c.title).join('. ')}`;
    const corpus = `${campaign.title}. ${campaign.description}. ${summaryText}`;
    const phrases = extractPhrases(corpus, campaign.title);
    const keywords = phrases.length ? phrases : extractKeywords(corpus);
    const hashtags = [...new Set([
      ...fromClips.map(h => (h.startsWith('#') ? h : `#${h}`)),
      ...keywords.slice(0, 6).map(toHashtag),
      ...GOAL_TAGS[campaign.goal],
    ])].filter(Boolean);

    return {
      sourceId: source.id,
      summary: clean.videoSummary,
      topics: clean.clips.slice(0, 5).map(c => c.title),
      talkingPoints: clean.clips.map(c => c.transcript?.trim()).filter((t): t is string => !!t && t.length > 20).slice(0, 8),
      tone: TONE_BY_GOAL[campaign.goal],
      keywords,
      hashtags,
      ctas: CTAS_BY_GOAL[campaign.goal],
      moments: clean.clips.map(c => ({
        start: c.startTime,
        end: c.endTime,
        title: c.title,
        transcript: c.transcript ?? '',
        viralityScore: Math.max(0, Math.min(100, Math.round(c.viralityScore ?? 60))),
        hashtags: (c.hashtags ?? []).map(h => (h.startsWith('#') ? h : `#${h}`)),
        focus: c.focus ?? 'educational',
        reason: c.reason ?? '',
      })).sort((a, b) => b.viralityScore - a.viralityScore),
      durationSec: clean.totalDuration || source.durationSec || 0,
      language: clean.videoLanguage || 'English',
      source: 'ai',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...analyseFromText(campaign, source, source.durationSec ?? 0),
      note: `The video could not be analysed (${message.slice(0, 160)}). Written from the title and description instead.`,
    };
  }
}
