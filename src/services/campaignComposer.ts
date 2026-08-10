/**
 * Phases 2 and 3 — clips, and a post written for each placement.
 *
 * The rule this file exists to enforce: a caption is never generated to a limit
 * the publisher would then reject. Every string that leaves here has been fitted
 * against the placement's own entry in the rulebook — 280 characters for X, 150
 * for TikTok, 2200 with thirty hashtags for Instagram — and `fitCaption` is the
 * one place that arithmetic happens.
 */
import {
  newId, placementRules, type PlacementRules,
} from './socialAutomation';
import { toHashtag } from './campaignAnalysis';
import type { CampaignAnalysis, Moment } from './campaignAnalysis';
import type {
  Campaign, CampaignAsset, CampaignSource, Placement,
} from '../types/socialAutomation';

/* ── Hashtags ── */

/** `#Foo Bar!` → `#fooBar`. Anything that cannot be salvaged is dropped. */
export function normaliseTag(raw: string): string {
  const body = raw.replace(/^#+/, '').trim();
  if (!body) return '';
  // Already one alphanumeric token, so it has been through here before:
  // re-deriving it would lowercase `#firstHire` into `#firsthire`, because the
  // word boundary it was built from is gone.
  if (/^[A-Za-z0-9]+$/.test(body)) return `#${body}`;
  return toHashtag(body);
}

/**
 * A hashtag set inside the placement's band. Preference order is the caller's
 * order — clip-specific tags before campaign-wide ones — then the keyword pool
 * tops it up if the platform expects more than we have.
 */
export function pickHashtags(preferred: string[], pool: string[], rules: PlacementRules): string[] {
  if (rules.hashtagMax === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...preferred, ...pool]) {
    const tag = normaliseTag(raw);
    if (!tag || tag.length < 3 || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
    if (out.length >= rules.hashtagMax) break;
  }
  return out;
}

/* ── Captions ── */

/** Trim to a word boundary, adding an ellipsis only when something was lost. */
export function trimToWord(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, Math.max(0, limit - 1));
  const at = cut.lastIndexOf(' ');
  return `${(at > limit * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

export interface FittedCaption {
  text: string;
  hashtags: string[];
  /** True when hashtags had to be dropped to make the caption fit. */
  trimmedTags: boolean;
  /** True when the body itself had to be shortened. */
  trimmedBody: boolean;
}

/**
 * Assemble body + call to action + hashtags inside the placement's ceiling.
 *
 * Hashtags are shed before the body is cut, because losing the twenty-ninth tag
 * costs less than losing the end of the sentence that carried the point. The
 * body is only trimmed once no hashtags are left to give up.
 */
export function fitCaption(
  body: string,
  cta: string,
  hashtags: string[],
  rules: PlacementRules,
): FittedCaption {
  const limit = rules.captionLimit;
  const tail = cta ? `\n\n${cta}` : '';
  let tags = [...hashtags];
  let trimmedTags = false;

  const assemble = (b: string, t: string[]) =>
    [b + tail, t.join(' ')].filter(Boolean).join('\n\n');

  // Shed hashtags down to the minimum the platform expects.
  while (tags.length > rules.hashtagMin && assemble(body, tags).length > limit) {
    tags = tags.slice(0, -1);
    trimmedTags = true;
  }
  // Then below the minimum if the platform still will not take it.
  while (tags.length > 0 && assemble(body, tags).length > limit) {
    tags = tags.slice(0, -1);
    trimmedTags = true;
  }

  let finalBody = body;
  let trimmedBody = false;
  if (assemble(finalBody, tags).length > limit) {
    const room = limit - (tail.length + (tags.length ? tags.join(' ').length + 2 : 0));
    finalBody = trimToWord(body, Math.max(20, room));
    trimmedBody = true;
  }

  return { text: assemble(finalBody, tags).slice(0, limit), hashtags: tags, trimmedTags, trimmedBody };
}

/**
 * Split a body into numbered posts that each fit the limit, never cutting a
 * sentence in half when a boundary is available.
 */
export function splitThread(body: string, limit: number, max = 15): string[] {
  const sentences = body.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  const parts: string[] = [];
  let current = '';
  // Leave room for the " 3/12" counter appended at the end.
  const room = limit - 6;

  for (const sentence of sentences) {
    const piece = sentence.length > room ? trimToWord(sentence, room) : sentence;
    if (!current) { current = piece; continue; }
    if (`${current} ${piece}`.length <= room) current = `${current} ${piece}`;
    else { parts.push(current); current = piece; if (parts.length >= max - 1) break; }
  }
  if (current) parts.push(current);
  const capped = parts.slice(0, max);
  return capped.map((p, i) => `${p} ${i + 1}/${capped.length}`);
}

/* ── Composing assets ── */

const base = (campaign: Campaign, source: CampaignSource) => ({
  campaignId: campaign.id,
  sourceId: source.id,
  status: 'ready' as const,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

/** Clips, best first, capped at what the spec asks for. */
export function composeClips(
  campaign: Campaign,
  source: CampaignSource,
  analysis: CampaignAnalysis,
  max = 15,
): CampaignAsset[] {
  return analysis.moments
    .slice()
    .sort((a, b) => b.viralityScore - a.viralityScore)
    .slice(0, max)
    .map(m => ({
      ...base(campaign, source),
      id: newId('asset'),
      kind: 'clip' as const,
      placement: null,
      channel: null,
      title: m.title,
      body: m.transcript || m.reason,
      hashtags: m.hashtags,
      mentions: [],
      media: source.blobUrl ? [source.blobUrl] : source.url ? [source.url] : [],
      viralityScore: m.viralityScore,
      startSec: m.start,
      endSec: m.end,
    }));
}

/**
 * The sentence a caption opens with.
 *
 * The campaign title outranks a topic keyword: a topic is one word, and one word
 * is not an opening line. A keyword is only reached for when there is no title
 * at all.
 */
function hook(moment: Moment | null, analysis: CampaignAnalysis, campaign: Campaign): string {
  if (moment?.title) return moment.title;
  if (campaign.title.trim()) return campaign.title.trim();
  return analysis.topics[0] ?? '';
}

/** The nth item, wrapping — so post 2 does not repeat post 1 word for word. */
const pick = <T,>(items: T[], index: number): T | undefined =>
  (items.length ? items[index % items.length] : undefined);

/** The list rotated to start at n, keeping every item but changing the order. */
function rotate<T>(items: T[], index: number): T[] {
  if (items.length < 2) return items;
  const at = index % items.length;
  return [...items.slice(at), ...items.slice(0, at)];
}

function bodyFor(
  placement: Placement,
  moment: Moment | null,
  analysis: CampaignAnalysis,
  campaign: Campaign,
  index: number,
): string {
  const points = analysis.talkingPoints.length ? analysis.talkingPoints : [analysis.summary];
  const head = hook(moment, analysis, campaign);
  // Each variant leads with a different point, so three Instagram posts are
  // three posts rather than the same post with three sign-offs.
  const point = moment?.transcript?.trim() || pick(points, index) || '';

  switch (placement) {
    case 'linkedin_feed':
    case 'linkedin_newsletter':
      // Professional register: claim, evidence, takeaway.
      return [
        head,
        '',
        ...rotate(points, index).slice(0, 3).map(p => `• ${p}`),
        '',
        analysis.summary,
      ].join('\n');

    case 'x_post':
      // 280 characters is room for a line and a point, not just a headline.
      return [head, point].filter(Boolean).join('\n\n');

    case 'x_thread':
      return [head, ...points].join(' ');

    case 'pinterest_pin':
      // Pinterest is a search engine; the description carries the keywords.
      return [head, point, analysis.keywords.slice(0, 6).join(', ')].filter(Boolean).join(' — ');

    case 'instagram_story':
    case 'facebook_story':
    case 'tiktok_video':
      // Short surfaces: the title first, then a point per variant.
      return trimToWord(index === 0 ? head : (point || head), 90);

    case 'youtube_shorts':
    case 'instagram_reel':
    case 'facebook_reel':
      return [head, point].filter(Boolean).join('\n\n');

    default:
      return [head, '', rotate(points, index).slice(0, 2).join('\n\n')].filter(Boolean).join('\n');
  }
}

const KIND_FOR: Partial<Record<Placement, CampaignAsset['kind']>> = {
  instagram_reel: 'clip', facebook_reel: 'clip', tiktok_video: 'clip', youtube_shorts: 'clip',
  instagram_story: 'story', facebook_story: 'story',
  instagram_feed: 'carousel', facebook_feed: 'image', linkedin_feed: 'image',
  linkedin_newsletter: 'text', youtube_community: 'text',
  x_post: 'text', x_thread: 'thread', pinterest_pin: 'image',
};

/** How many posts a placement gets from one video. */
const COUNT_FOR: Partial<Record<Placement, number>> = {
  instagram_reel: 3, facebook_reel: 3, tiktok_video: 5, youtube_shorts: 3,
  instagram_story: 7, facebook_story: 5,
  instagram_feed: 5, facebook_feed: 5, linkedin_feed: 2,
  linkedin_newsletter: 1, youtube_community: 2,
  x_post: 3, x_thread: 1, pinterest_pin: 5,
};

/**
 * One placement's worth of posts. Video placements are driven by the ranked
 * moments so the strongest clip becomes the first Reel; text and image
 * placements walk the talking points instead.
 */
export function composePlacement(
  campaign: Campaign,
  source: CampaignSource,
  analysis: CampaignAnalysis,
  placement: Placement,
): CampaignAsset[] {
  const rules = placementRules(placement);
  if (!rules) return [];

  const kind = KIND_FOR[placement] ?? 'text';
  const wanted = COUNT_FOR[placement] ?? 1;
  const usesMoments = kind === 'clip' || kind === 'story';

  // Video and story placements prefer real moments. When the analyser could not
  // find any — a YouTube link whose length is unknown, no Gemini key — they
  // still get posts written from the talking points. A placement the user
  // deliberately ticked must never come back empty and unexplained.
  const moments = usesMoments ? analysis.moments.slice(0, wanted) : [];
  const fallbackCount = usesMoments
    ? Math.min(wanted, Math.max(1, analysis.talkingPoints.length || 1), 3)
    : Math.min(wanted, Math.max(1, analysis.talkingPoints.length || 1));
  const slots: (Moment | null)[] = moments.length
    ? moments
    : Array.from({ length: fallbackCount }, () => null);

  const out: CampaignAsset[] = [];
  slots.forEach((moment, i) => {
    const cta = analysis.ctas[i % analysis.ctas.length] ?? '';
    const body = bodyFor(placement, moment, analysis, campaign, i);
    const tags = pickHashtags(moment?.hashtags ?? [], analysis.hashtags, rules);

    if (placement === 'x_thread') {
      const parts = splitThread(
        [body, ...analysis.talkingPoints].join(' '),
        rules.captionLimit,
      );
      out.push({
        ...base(campaign, source),
        id: newId('asset'),
        kind: 'thread',
        placement,
        channel: null,
        title: `${campaign.title} — thread`,
        body: parts[0] ?? body,
        hashtags: tags,
        mentions: [],
        media: [],
        parts: parts.map(p => ({ body: p })),
      });
      return;
    }

    const fitted = fitCaption(body, cta, tags, rules);
    out.push({
      ...base(campaign, source),
      id: newId('asset'),
      kind,
      placement,
      channel: null,
      title: moment?.title ?? `${campaign.title} — ${rules.surface} ${i + 1}`,
      body: fitted.text,
      hashtags: fitted.hashtags,
      mentions: [],
      media: usesMoments && (source.blobUrl || source.url) ? [source.blobUrl ?? source.url!] : [],
      viralityScore: moment?.viralityScore,
      startSec: moment?.start,
      endSec: moment?.end,
      // A carousel is a set of slides, each carrying one point.
      parts: kind === 'carousel'
        ? rotate(analysis.talkingPoints, i).slice(0, 6).map((p, n) => ({ title: `Slide ${n + 1}`, body: trimToWord(p, 180) }))
        : undefined,
    });
  });

  return out;
}

/** Everything for one source across every placement the campaign selected. */
export function composeAll(
  campaign: Campaign,
  source: CampaignSource,
  analysis: CampaignAnalysis,
): CampaignAsset[] {
  const clips = composeClips(campaign, source, analysis);
  const posts = campaign.placements.flatMap(p => composePlacement(campaign, source, analysis, p));
  return [...clips, ...posts];
}
