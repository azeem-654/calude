/**
 * Social Media Automation — store, validation and the platform rulebook.
 *
 * Everything persists through the tenant-scoped `crm_*` keys, so a campaign
 * belongs to the sub-account that created it without this file knowing that
 * scoping exists.
 *
 * The platform rules here are the single source of truth for the whole module:
 * the generator writes captions to these limits, the dashboard shows them, and
 * the publisher checks against them before handing anything over. Keeping one
 * table means a caption can never be generated to a limit the publisher then
 * disagrees with.
 */
import type {
  Campaign, CampaignAsset, CampaignAssetKind, CampaignAudience, CampaignGoal,
  CampaignSource, CampaignStatus, Channel, Placement, Platform,
  PublishJob, PublishSession,
} from '../types/socialAutomation';

const CAMPAIGNS_KEY = 'crm_sa_campaigns';
const ASSETS_KEY = 'crm_sa_assets';
const JOBS_KEY = 'crm_sa_jobs';
const SESSIONS_KEY = 'crm_sa_sessions';

/* ── Storage ── */

function load<T>(key: string): T[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(raw) ? (raw as T[]) : [];
  } catch { return []; }
}

function save<T>(key: string, rows: T[]): void {
  try { localStorage.setItem(key, JSON.stringify(rows)); } catch { /* quota */ }
}

export const loadCampaigns = () => load<Campaign>(CAMPAIGNS_KEY);
export const saveCampaigns = (rows: Campaign[]) => save(CAMPAIGNS_KEY, rows);
export const loadAssets = () => load<CampaignAsset>(ASSETS_KEY);
export const saveAssets = (rows: CampaignAsset[]) => save(ASSETS_KEY, rows);
export const loadJobs = () => load<PublishJob>(JOBS_KEY);
export const saveJobs = (rows: PublishJob[]) => save(JOBS_KEY, rows);
export const loadSessions = () => load<PublishSession>(SESSIONS_KEY);
export const saveSessions = (rows: PublishSession[]) => save(SESSIONS_KEY, rows);

/** Ids are unique per millisecond without needing a crypto dependency. */
let idSeq = 0;
export function newId(prefix: string): string {
  idSeq = (idSeq + 1) % 100000;
  return `${prefix}-${Date.now().toString(36)}-${idSeq.toString(36)}`;
}

/* ── Goals ── */

export const GOALS: { value: CampaignGoal; label: string; hint: string }[] = [
  { value: 'educate', label: 'Educate / Teach', hint: 'Explain something useful — the AI leans on clarity and takeaways' },
  { value: 'promote', label: 'Promote a Product/Service', hint: 'Sell — captions carry an offer and a clear call to action' },
  { value: 'awareness', label: 'Build Brand Awareness', hint: 'Get known — broad reach, personality over pitch' },
  { value: 'launch', label: 'Announce a Launch', hint: 'Something new — urgency, dates and a waitlist push' },
  { value: 'testimonial', label: 'Share a Testimonial', hint: 'Proof — quotes from the customer do the selling' },
  { value: 'entertain', label: 'Entertain / Engage', hint: 'Hook first — hooks, humour and replies over links' },
  { value: 'traffic', label: 'Drive Traffic to Website', hint: 'Clicks — every piece routes back to your site' },
];

export const goalLabel = (g: CampaignGoal) => GOALS.find(x => x.value === g)?.label ?? g;

/* ── Platform rulebook ── */

export interface PlacementRules {
  placement: Placement;
  platform: Platform;
  label: string;
  /** What the platform calls this surface, for the UI. */
  surface: string;
  /** Hard character ceiling for the caption or body. */
  captionLimit: number;
  /** The band that performs, not the platform maximum. */
  hashtagMin: number;
  hashtagMax: number;
  aspect: '9:16' | '1:1' | '4:5' | '16:9' | '1.91:1' | '2:3';
  media: 'video' | 'image' | 'either' | 'text';
  /** Local-time hours that tend to perform, used by the scheduler in part 4. */
  bestHours: number[];
  /** Whether the platform offers a prefilled web composer we can hand off to. */
  handoff: 'intent' | 'share' | 'manual';
}

/**
 * `handoff` decides how part 5 gets content to the platform:
 *   intent  — an official prefill URL exists, so the composer opens filled in
 *   share   — no prefill, but the Web Share API can pass media to the app
 *   manual  — neither; we download the media, copy the caption, open the composer
 */
export const PLACEMENTS: PlacementRules[] = [
  { placement: 'instagram_reel',   platform: 'instagram', label: 'Instagram Reels',   surface: 'Reels',       captionLimit: 2200, hashtagMin: 20, hashtagMax: 30, aspect: '9:16',   media: 'video',  bestHours: [18, 19, 20, 21], handoff: 'share' },
  { placement: 'instagram_feed',   platform: 'instagram', label: 'Instagram Feed',    surface: 'Feed',        captionLimit: 2200, hashtagMin: 20, hashtagMax: 30, aspect: '4:5',    media: 'image',  bestHours: [18, 19, 20, 21], handoff: 'share' },
  { placement: 'instagram_story',  platform: 'instagram', label: 'Instagram Stories', surface: 'Stories',     captionLimit: 250,  hashtagMin: 0,  hashtagMax: 0,  aspect: '9:16',   media: 'image',  bestHours: [9, 12, 15, 18, 21], handoff: 'share' },
  { placement: 'tiktok_video',     platform: 'tiktok',    label: 'TikTok',            surface: 'Video',       captionLimit: 150,  hashtagMin: 3,  hashtagMax: 5,  aspect: '9:16',   media: 'video',  bestHours: [19, 20, 21, 22], handoff: 'share' },
  { placement: 'facebook_feed',    platform: 'facebook',  label: 'Facebook Feed',     surface: 'Feed',        captionLimit: 2000, hashtagMin: 3,  hashtagMax: 5,  aspect: '1:1',    media: 'either', bestHours: [9, 13, 18], handoff: 'intent' },
  { placement: 'facebook_reel',    platform: 'facebook',  label: 'Facebook Reels',    surface: 'Reels',       captionLimit: 2000, hashtagMin: 3,  hashtagMax: 5,  aspect: '9:16',   media: 'video',  bestHours: [9, 13, 18], handoff: 'share' },
  { placement: 'facebook_story',   platform: 'facebook',  label: 'Facebook Stories',  surface: 'Stories',     captionLimit: 250,  hashtagMin: 0,  hashtagMax: 0,  aspect: '9:16',   media: 'image',  bestHours: [9, 13, 18], handoff: 'share' },
  { placement: 'linkedin_feed',    platform: 'linkedin',  label: 'LinkedIn Feed',     surface: 'Feed',        captionLimit: 3000, hashtagMin: 2,  hashtagMax: 3,  aspect: '1.91:1', media: 'either', bestHours: [8, 9, 10, 12], handoff: 'intent' },
  { placement: 'linkedin_newsletter', platform: 'linkedin', label: 'LinkedIn Newsletter', surface: 'Newsletter', captionLimit: 8000, hashtagMin: 2, hashtagMax: 3, aspect: '1.91:1', media: 'image', bestHours: [8, 9], handoff: 'manual' },
  { placement: 'x_post',           platform: 'x',         label: 'X post',            surface: 'Post',        captionLimit: 280,  hashtagMin: 1,  hashtagMax: 2,  aspect: '16:9',   media: 'either', bestHours: [8, 9, 17, 18, 19], handoff: 'intent' },
  { placement: 'x_thread',         platform: 'x',         label: 'X thread',          surface: 'Thread',      captionLimit: 280,  hashtagMin: 1,  hashtagMax: 2,  aspect: '16:9',   media: 'either', bestHours: [8, 9, 17, 18, 19], handoff: 'intent' },
  { placement: 'youtube_shorts',   platform: 'youtube',   label: 'YouTube Shorts',    surface: 'Shorts',      captionLimit: 1000, hashtagMin: 3,  hashtagMax: 5,  aspect: '9:16',   media: 'video',  bestHours: [14, 15, 16], handoff: 'manual' },
  { placement: 'youtube_community', platform: 'youtube',  label: 'YouTube Community', surface: 'Community',   captionLimit: 1000, hashtagMin: 0,  hashtagMax: 3,  aspect: '1:1',    media: 'image',  bestHours: [14, 15, 16], handoff: 'manual' },
  { placement: 'pinterest_pin',    platform: 'pinterest', label: 'Pinterest Pins',    surface: 'Pin',         captionLimit: 500,  hashtagMin: 10, hashtagMax: 15, aspect: '2:3',    media: 'image',  bestHours: [20, 21, 22, 23], handoff: 'intent' },
];

export const placementRules = (p: Placement): PlacementRules | undefined =>
  PLACEMENTS.find(x => x.placement === p);

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook',
  linkedin: 'LinkedIn', x: 'X / Twitter', youtube: 'YouTube', pinterest: 'Pinterest',
};

export const PLATFORM_ORDER: Platform[] = ['instagram', 'tiktok', 'youtube', 'facebook', 'linkedin', 'x', 'pinterest'];

export const placementsFor = (platform: Platform) => PLACEMENTS.filter(p => p.platform === platform);

export const CHANNELS: { value: Channel; label: string; hint: string }[] = [
  { value: 'email', label: 'Email campaign', hint: 'A four-email sequence sent to the segments you choose' },
  { value: 'sms', label: 'SMS campaign', hint: 'Two to three short messages with the link' },
  { value: 'blog', label: 'Blog post', hint: 'A full SEO article published on your site' },
  { value: 'landing', label: 'Landing page', hint: 'A mini funnel page with the video embedded' },
];

export const channelLabel = (c: Channel) => CHANNELS.find(x => x.value === c)?.label ?? c;

/* ── Source handling ── */

/** Accepted upload types. Anything else is refused before it is read. */
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm'];
const VIDEO_EXT = /\.(mp4|mov|m4v|webm)$/i;
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;   // 500 MB

/** The eleven-character id inside any of YouTube's URL shapes. */
export function youTubeId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function validateUpload(file: File): string {
  const typeOk = VIDEO_TYPES.includes(file.type) || VIDEO_EXT.test(file.name);
  if (!typeOk) return 'That file is not a video. Use MP4, MOV, M4V or WebM.';
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_UPLOAD_BYTES) {
    return `That file is ${(file.size / 1024 / 1024).toFixed(0)} MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`;
  }
  return '';
}

/**
 * Strip anything that could break out of the contexts this text later lands in
 * — generated email HTML, a blog post, a page title. React escapes on render,
 * but this text is also interpolated into HTML we build ourselves, so it is
 * cleaned once here at the boundary rather than trusted everywhere after.
 */
export function sanitizeText(input: string, limit = 5000): string {
  return input
    // Removing control characters is the whole point of this line — they are
    // what smuggles line breaks into headers and null bytes into file names.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>]/g, '')                     // no tag delimiters
    .slice(0, limit)
    .trim();
}

/** A file name safe to write to disk and to show in the UI. */
export function safeName(name: string): string {
  return name.replace(/[^\w. -]+/g, '_').slice(0, 120) || 'video';
}

export function sourceFromFile(file: File): CampaignSource {
  return {
    id: newId('src'),
    kind: 'upload',
    name: safeName(file.name),
    blobUrl: URL.createObjectURL(file),
    sizeBytes: file.size,
    mimeType: file.type || 'video/mp4',
  };
}

export function sourceFromYouTube(url: string): CampaignSource | null {
  const id = youTubeId(url.trim());
  if (!id) return null;
  return {
    id: newId('src'),
    kind: 'youtube',
    name: `YouTube ${id}`,
    url: `https://www.youtube.com/watch?v=${id}`,
    youtubeId: id,
  };
}

/* ── Validation ── */

export interface DraftCampaign {
  name: string;
  goal: CampaignGoal;
  sources: CampaignSource[];
  title: string;
  description: string;
  placements: Placement[];
  channels: Channel[];
  audience: CampaignAudience;
}

/** Per-step problems, so the wizard can block the right Next button. */
export function stepProblem(step: 1 | 2 | 3, draft: DraftCampaign): string {
  if (step === 1) {
    if (draft.sources.length === 0) return 'Add a video file or a YouTube link to continue.';
    if (!draft.title.trim()) return 'Give the campaign a video title — the AI uses it for context.';
    return '';
  }
  if (step === 2) {
    if (draft.placements.length === 0 && draft.channels.length === 0) {
      return 'Choose at least one platform or channel to publish to.';
    }
    return '';
  }
  // Step 3 only matters when something will actually be sent to contacts.
  const needsAudience = draft.channels.includes('email') || draft.channels.includes('sms');
  if (needsAudience && draft.audience.listIds.length === 0 && !draft.audience.skipped) {
    return 'Pick who receives the email and SMS, or choose to skip for now.';
  }
  return '';
}

/* ── CRUD ── */

export function createCampaign(draft: DraftCampaign, createdBy: string): Campaign {
  const now = new Date().toISOString();
  const campaign: Campaign = {
    id: newId('camp'),
    name: sanitizeText(draft.name, 120) || sanitizeText(draft.title, 120) || 'Untitled campaign',
    goal: draft.goal,
    sources: draft.sources,
    title: sanitizeText(draft.title, 200),
    description: sanitizeText(draft.description, 5000),
    placements: [...draft.placements],
    channels: [...draft.channels],
    audience: { ...draft.audience, listIds: [...draft.audience.listIds] },
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    createdBy,
  };
  saveCampaigns([campaign, ...loadCampaigns()]);
  return campaign;
}

export function updateCampaign(id: string, updates: Partial<Campaign>): Campaign | null {
  const rows = loadCampaigns();
  const idx = rows.findIndex(c => c.id === id);
  if (idx < 0) return null;
  const next: Campaign = { ...rows[idx], ...updates, id, updatedAt: new Date().toISOString() };
  rows[idx] = next;
  saveCampaigns(rows);
  return next;
}

export function getCampaign(id: string): Campaign | undefined {
  return loadCampaigns().find(c => c.id === id);
}

/** Removes the campaign and everything generated from it. */
export function deleteCampaign(id: string): void {
  for (const s of loadCampaigns().find(c => c.id === id)?.sources ?? []) {
    if (s.blobUrl) { try { URL.revokeObjectURL(s.blobUrl); } catch { /* already gone */ } }
  }
  saveCampaigns(loadCampaigns().filter(c => c.id !== id));
  saveAssets(loadAssets().filter(a => a.campaignId !== id));
  saveJobs(loadJobs().filter(j => j.campaignId !== id));
  saveSessions(loadSessions().filter(s => s.campaignId !== id));
}

export const assetsFor = (campaignId: string) => loadAssets().filter(a => a.campaignId === campaignId);
export const jobsFor = (campaignId: string) => loadJobs().filter(j => j.campaignId === campaignId);

export function assetCounts(campaignId: string): Partial<Record<CampaignAssetKind, number>> {
  const out: Partial<Record<CampaignAssetKind, number>> = {};
  for (const a of assetsFor(campaignId)) out[a.kind] = (out[a.kind] ?? 0) + 1;
  return out;
}

/* ── Presentation helpers ── */

export const STATUS_META: Record<CampaignStatus, { label: string; color: string; bg: string }> = {
  draft:      { label: 'Draft',        color: '#8a8f98', bg: '#f0f1f3' },
  queued:     { label: 'Queued',       color: '#c77414', bg: '#fdf5e7' },
  generating: { label: 'Generating',   color: '#3e63dd', bg: '#eceff9' },
  ready:      { label: 'Ready',        color: '#3f9142', bg: '#e9f4e6' },
  publishing: { label: 'Publishing',   color: '#3e63dd', bg: '#eceff9' },
  partial:    { label: 'Part published', color: '#c77414', bg: '#fdf5e7' },
  published:  { label: 'Published',    color: '#3f9142', bg: '#e9f4e6' },
  failed:     { label: 'Failed',       color: '#e5484d', bg: '#fceaea' },
};

/** "3 platforms · 12 placements · email, SMS" — the one-line summary. */
export function describeTargets(campaign: Pick<Campaign, 'placements' | 'channels'>): string {
  const platforms = new Set(campaign.placements.map(p => placementRules(p)?.platform).filter(Boolean));
  const bits: string[] = [];
  if (platforms.size) {
    bits.push(`${platforms.size} platform${platforms.size === 1 ? '' : 's'}`);
    bits.push(`${campaign.placements.length} placement${campaign.placements.length === 1 ? '' : 's'}`);
  }
  if (campaign.channels.length) bits.push(campaign.channels.map(channelLabel).join(', '));
  return bits.join(' · ') || 'Nothing selected yet';
}
