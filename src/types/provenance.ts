/**
 * Where a generated record came from.
 *
 * The app has several setups that create content in bulk — the business wizard
 * plans a year of campaigns, a single video fans out into shorts, posts, an
 * email sequence, SMS and a blog — and once a few of those have run, a
 * marketing list is a pile of similarly-named records with no way to tell which
 * batch produced which. Deleting the wrong one, or editing a campaign whose
 * source video has since changed, is then a matter of luck.
 *
 * So anything a setup creates carries this stamp: what made it, what the
 * original was called, and how to get back there. It is written once at
 * creation and never inferred from the name, because names get edited.
 */

export type ContentOrigin =
  /** The full business setup wizard. */
  | 'business-wizard'
  /** The twelve-month content plan the wizard schedules. */
  | 'content-plan'
  /** One video fanned out across every channel. */
  | 'video-campaign'
  /** Clips cut out of a video by AI Shorts. */
  | 'ai-shorts'
  /** Created by an AI Sales Agent campaign to carry out its strategy. */
  | 'ai-sales-agent'
  /** A scheduled send or a multi-step follow-up flow, materialized into the
   *  sequence engine so the same tested heartbeat that runs Sequences carries
   *  it forward — rather than a second, parallel scheduler. */
  | 'marketing-campaign';

export interface ContentSource {
  origin: ContentOrigin;
  /** The source's own title — the video, the campaign, the wizard run. */
  title: string;
  /** The originating record's id, so the tag can be traced rather than matched on text. */
  refId?: string;
  /** Where to go to see the original. */
  route?: string;
  /** Extra context worth showing on the chip, e.g. "Month 3 of 12". */
  detail?: string;
  at: string;
}

/** Anything a setup can stamp. */
export interface SourceStamped {
  source?: ContentSource;
}

export const ORIGIN_LABEL: Record<ContentOrigin, string> = {
  'business-wizard': 'Business setup',
  'content-plan': 'Content plan',
  'video-campaign': 'Video campaign',
  'ai-shorts': 'AI Shorts',
  'ai-sales-agent': 'AI Sales Agent',
  'marketing-campaign': 'Marketing campaign',
};

/** "Video campaign · Five mistakes that kill your first hire" */
export function describeSource(s: ContentSource): string {
  const head = ORIGIN_LABEL[s.origin] ?? 'Setup';
  return s.detail ? `${head} · ${s.title} · ${s.detail}` : `${head} · ${s.title}`;
}

export function makeSource(
  origin: ContentOrigin,
  title: string,
  extra: Omit<ContentSource, 'origin' | 'title' | 'at'> = {},
): ContentSource {
  return {
    origin,
    // Kept short: this is a label, and an untrimmed video title can be a
    // paragraph.
    title: (title || 'Untitled').trim().slice(0, 120),
    at: new Date().toISOString(),
    ...extra,
  };
}
