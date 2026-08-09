/**
 * Social Media Automation — the data model.
 *
 * One video in, a whole campaign out. This file defines the four records the
 * module is built on, and they are deliberately declared in full here even
 * though the later phases are what populate most of them:
 *
 *   Campaign        what the user asked for — source, goal, targets, audience
 *   CampaignAsset   one generated piece of content (a clip, post, email, …)
 *   PublishJob      one attempt to get one asset onto one placement
 *   PublishSession  a run of the publishing flow, so progress survives a reload
 *
 * Keeping the shapes together means the wizard, the generator and the publisher
 * agree on the contract instead of each inventing its own.
 */

/* ── Platforms and placements ── */

export type Platform =
  | 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'linkedin' | 'x' | 'pinterest';

/** Where content actually lands. Instagram Feed, Reels and Stories are three
 *  different products with different rules, so they are three placements. */
export type Placement =
  | 'youtube_shorts' | 'youtube_community'
  | 'tiktok_video'
  | 'instagram_reel' | 'instagram_feed' | 'instagram_story'
  | 'facebook_feed' | 'facebook_reel' | 'facebook_story'
  | 'linkedin_feed' | 'linkedin_newsletter'
  | 'x_post' | 'x_thread'
  | 'pinterest_pin';

/** Channels the CRM owns end to end, as opposed to third-party platforms. */
export type Channel = 'email' | 'sms' | 'blog' | 'landing';

export type CampaignGoal =
  | 'educate' | 'promote' | 'awareness' | 'launch' | 'testimonial' | 'entertain' | 'traffic';

/* ── Campaign ── */

export type CampaignStatus =
  | 'draft'        // the wizard has been started but not submitted
  | 'queued'       // generation asked for, not yet running
  | 'generating'   // the pipeline is working through its phases
  | 'ready'        // content exists and is waiting to be published
  | 'publishing'
  | 'partial'      // some placements done, some failed
  | 'published'
  | 'failed';

export interface CampaignSource {
  id: string;
  kind: 'upload' | 'youtube';
  /** File name for an upload, or the original URL for a YouTube source. */
  name: string;
  url?: string;
  youtubeId?: string;
  /**
   * Object URL for an uploaded file. Only valid for the session that created
   * it — a reload invalidates it, and the UI asks for the file again rather
   * than pretending it still has the video.
   */
  blobUrl?: string;
  sizeBytes?: number;
  mimeType?: string;
  durationSec?: number;
}

export interface CampaignAudience {
  /** Contact lists (segments) the email and SMS steps will target. */
  listIds: string[];
  /** Snapshot of how many contacts that resolved to when the campaign was set up. */
  contactCount: number;
  /** True when the user chose to go ahead without an audience. */
  skipped: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  goal: CampaignGoal;
  /** More than one source is allowed, so a batch of videos is one campaign. */
  sources: CampaignSource[];
  title: string;
  description: string;
  placements: Placement[];
  channels: Channel[];
  audience: CampaignAudience;
  status: CampaignStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  /** Filled by the generation phases; counts shown on the dashboard. */
  assetCounts?: Partial<Record<CampaignAssetKind, number>>;
  /** Set when generation fails, so the dashboard can explain itself. */
  error?: string;
  /**
   * What a push into Marketing/Websites/Funnels created. Present means it has
   * already happened, which is what stops a second push duplicating sequences.
   */
  handoff?: {
    at: string;
    sequenceId?: string;
    smsCampaignId?: string;
    blogTitle?: string;
    funnelName?: string;
  };
}

/* ── Generated content ── */

export type CampaignAssetKind =
  | 'clip'        // a short video cut from the source
  | 'image'       // a single graphic
  | 'carousel'    // an ordered set of graphics
  | 'story'       // a story frame
  | 'text'        // a caption-only post
  | 'thread'      // an ordered set of posts
  | 'email'
  | 'sms'
  | 'blog'
  | 'landing';

export type AssetStatus = 'draft' | 'ready' | 'scheduled' | 'published' | 'failed';

export interface CampaignAsset {
  id: string;
  campaignId: string;
  sourceId: string;
  kind: CampaignAssetKind;
  /** Null for email, SMS and blog, which are not platform placements. */
  placement: Placement | null;
  channel: Channel | null;
  title: string;
  /** The caption or body. Plain text; HTML lives in `html` so it can be escaped. */
  body: string;
  html?: string;
  hashtags: string[];
  mentions: string[];
  /** Media the asset needs: object URLs, data URLs or remote URLs. */
  media: string[];
  /** Ordered children for carousels and threads. */
  parts?: { title?: string; body: string; media?: string }[];
  /** 0–100, from the Shorts engine. Used to rank which clips get used first. */
  viralityScore?: number;
  /** Where this asset came from in the source video, in seconds. */
  startSec?: number;
  endSec?: number;
  status: AssetStatus;
  scheduledFor?: string;
  createdAt: string;
  updatedAt: string;
}

/* ── Publishing ── */

export type PublishStatus =
  | 'queued'
  | 'opened'      // the composer was handed to the user
  | 'confirmed'   // the user said they posted it
  | 'published'
  | 'failed'
  | 'skipped';

export interface PublishJob {
  id: string;
  campaignId: string;
  assetId: string;
  placement: Placement | null;
  channel: Channel | null;
  status: PublishStatus;
  scheduledFor?: string;
  openedAt?: string;
  publishedAt?: string;
  attempts: number;
  lastError?: string;
  /** Set once the platform reports or the user records a permalink. */
  permalink?: string;
}

export interface PublishSession {
  id: string;
  campaignId: string;
  startedAt: string;
  finishedAt?: string;
  /** Job ids in the order they will be handed to the user. */
  order: string[];
  cursor: number;
  status: 'running' | 'paused' | 'done' | 'cancelled';
}
