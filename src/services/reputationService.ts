/**
 * reputationService — the Reviews screen's side of /api/reputation.php.
 *
 * Reviews come from Google, read by the Worker: through Places API (New) —
 * rating, count and at most five reviews Google picks — or, once connected,
 * through Business Profile, which has every review and can post replies.
 * Nothing here invents a review. This file used to seed eight, make up another
 * every twenty to forty seconds and compare the business with three made-up
 * competitors; all of that is gone, and anything left over from it in this
 * browser is cleared on first load (`clearLegacy`).
 *
 * What stays in the workspace's synced storage is what the customer writes:
 * the business profile (tone, signature, review links) and the auto-response
 * rules. The cron reads both from crm_data, so a rule runs with no tab open.
 */
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';
import { API_BASE } from './apiBase';

export type Platform = 'google' | 'facebook' | 'yelp' | 'trustpilot';

export type ReplyState = 'none' | 'draft' | 'posted' | 'posted_elsewhere';

export interface RepReview {
  id: string;
  source: 'google_places' | 'google_business';
  platform: Platform;
  author: string;
  authorPhoto: string;
  rating: number;
  content: string;
  time: string | null;
  link: string;
  reply: string;
  replyTime: string | null;
  replyState: ReplyState;
  draft: string;
  attention: boolean;
  note: string;
  auto: boolean;
  /** Can this review be answered from here (Business Profile, connected)? */
  canPost: boolean;
}

export interface BusinessProfile {
  name: string;
  category: string;
  description: string;
  tone: 'warm' | 'professional' | 'friendly' | 'formal';
  signature: string;
  knowledge: string;           // policies/facts the AI can cite
  reviewLinks: Partial<Record<Platform, string>>;   // where to send review requests
}

export interface AutoResponseRule {
  id: string;
  enabled: boolean;
  minRating: number;
  maxRating: number;
  mode: 'auto_send' | 'draft' | 'alert';
  instruction: string;
  runs: number;
}

export interface ReviewRequest {
  id: string;
  contactName?: string;
  email?: string;
  contactId?: string;
  sentAt?: string;
  createdAt?: string;
  status: 'queued' | 'sent' | 'failed' | 'clicked' | 'reviewed';
  platform?: Platform;
  error?: string;
}

export interface Competitor {
  placeId: string;
  name: string;
  rating: number | null;
  reviewCount: number | null;
  mapsUrl: string;
  lastError: string;
}

export interface PlaceHit { placeId: string; name: string; address: string; rating: number | null; count: number | null; mapsUrl: string }
export interface GbpLocation { id: string; title: string; address: string; placeId: string; mapsUrl: string }

export interface RepStatus {
  source: null | {
    placeId: string; placeName: string; mapsUrl: string;
    ownKey: boolean; ownKeyVerified: boolean; autoCheck: boolean;
    lastCheckedAt: string | null; lastError: string;
    rating: number | null; reviewCount: number | null;
  };
  installKey: boolean;
  gbp: { configured: boolean; status: 'none' | 'connected' | 'error' | string; ownerEmail: string; location: { id: string; title: string } | null; lastError: string };
  counts: { total: number; unanswered: number; attention: number };
  placesReviewLimit: number;
}

export type Res<T> = T & { success: boolean; error?: string; message?: string; code?: string; field?: string; link?: string };

async function call<T>(action: string, extra: Record<string, unknown> = {}): Promise<Res<T>> {
  const accountId = getActiveAccountId();
  if (!accountId) return { success: false, error: 'No workspace is active yet.' } as Res<T>;
  try {
    const r = await fetch(`${API_BASE}/api/reputation.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), accountId, action, ...extra }),
    });
    const j = await r.json().catch(() => ({ success: false, error: `The server answered ${r.status}.` }));
    return j as Res<T>;
  } catch {
    /* Offline is not "no reviews" — said as what it is. */
    return { success: false, error: 'Could not reach the server. Check your connection and try again.', code: 'offline' } as Res<T>;
  }
}

export const repStatus = () => call<RepStatus>('status');
export const findPlace = (query: string) => call<{ places: PlaceHit[] }>('find_place', { query });
export const saveSource = (patch: { placeId?: string; placeName?: string; placesKey?: string; clearKey?: boolean; autoCheck?: boolean }) => call<RepStatus>('save_source', patch);
export const checkNow = () => call<RepStatus & { added: number; repliesFound: number; via: string; notes: string[] }>('check_now');
/* The agency dashboard's per-workspace counts are read from this browser's
   copy of each workspace (tenancy.ts accountUsage), and reviews now live only
   on the server — so the count is left behind here each time the list is read,
   rather than the dashboard asking the server once per client. */
export const REVIEW_COUNT_KEY = 'crm_reputation_count';
export async function listReviews() {
  const r = await call<{ reviews: RepReview[] }>('reviews');
  if (r.success && Array.isArray(r.reviews)) { try { localStorage.setItem(REVIEW_COUNT_KEY, String(r.reviews.length)); } catch { /* private mode */ } }
  return r;
}
export const draftReply = (reviewId: string, instruction = '') => call<{ draft: string }>('draft_reply', { reviewId, instruction });
export const postReply = (reviewId: string, text: string) => call<{ replyState: ReplyState }>('reply', { reviewId, text });
export const markReplied = (reviewId: string, text: string) => call<{ replyState: ReplyState }>('mark_replied', { reviewId, text });
export const dismissAttention = (reviewId: string) => call<object>('dismiss', { reviewId });
export const listCompetitors = (refresh = false) => call<{ competitors: Competitor[] }>('competitors', { refresh });
export const addCompetitor = (placeId: string) => call<{ competitors: Competitor[] }>('add_competitor', { placeId });
export const removeCompetitor = (placeId: string) => call<{ competitors: Competitor[] }>('remove_competitor', { placeId });
export const gbpConnect = () => call<{ url: string }>('gbp_connect');
export const gbpLocations = () => call<{ locations: GbpLocation[] }>('gbp_locations');
export const gbpChoose = (location: string) => call<RepStatus>('gbp_choose', { location });
export const gbpDisconnect = () => call<RepStatus>('gbp_disconnect');
export const listRequests = () => call<{ requests: ReviewRequest[] }>('requests');
export const sendRequests = (recipients: { name: string; email: string }[], platform: Platform) =>
  call<{ sent: number; failed: number; failures: string[] }>('send_requests', { recipients, platform });

/* ── The install owner's Places key (no workspace) ── */
/** The owner's Google Maps key, as the server describes it: set or not, last checked, this month's use. Never the key. */
export interface InstallKeyState {
  set: boolean; status: string; lastError: string; checkedAt?: string | null;
  usage?: { month: string; install: { prospects: number; reviews: number }; own: { prospects: number; reviews: number }; workspaces: number };
}

async function ownerCall(action: string, extra: Record<string, unknown> = {}) {
  try {
    const r = await fetch(`${API_BASE}/api/reputation.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), action, ...extra }),
    });
    return await r.json() as Res<InstallKeyState>;
  } catch {
    return { success: false, error: 'Could not reach the server.', set: false, status: 'none', lastError: '' };
  }
}
export const installKeyStatus = () => ownerCall('install_key_status');
export const saveInstallKey = (apiKey: string) => ownerCall('save_install_key', { apiKey });
export const testInstallKey = () => ownerCall('test_install_key');

/* ── What the customer writes: synced workspace storage ── */
const PROFILE_KEY = 'crm_reputation_profile';
const RULES_KEY = 'crm_reputation_rules';
const LEGACY_REVIEWS = 'crm_reputation_reviews';
const LEGACY_COMPETITORS = 'crm_reputation_competitors';
const LEGACY_GOOGLE = 'crm_reputation_google';

export function loadProfile(): BusinessProfile {
  try { const s = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); if (s) return { reviewLinks: {}, ...s }; } catch { /* ignore */ }
  return { name: '', category: '', description: '', tone: 'warm', signature: '', knowledge: '', reviewLinks: {} };
}
export function saveProfile(p: BusinessProfile) { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* ignore */ } }

/** Saved rules, or the suggestions — which the server does not run until saved. */
export function loadRules(): { rules: AutoResponseRule[]; saved: boolean } {
  try { const s = JSON.parse(localStorage.getItem(RULES_KEY) || 'null'); if (Array.isArray(s)) return { rules: s, saved: true }; } catch { /* ignore */ }
  return { rules: defaultRules(), saved: false };
}
export function saveRules(r: AutoResponseRule[]) { try { localStorage.setItem(RULES_KEY, JSON.stringify(r)); } catch { /* ignore */ } }

/**
 * Move a pre-server Google key off this browser, and drop the made-up data.
 *
 * The key was kept in crm_reputation_google — workspace storage, so it was
 * synced to the server in plain text. It is handed to `save_source` (which
 * encrypts it) and the local copy deleted; deleting it is what removes the
 * plain copy from crm_data too. The old seeded reviews and competitors are
 * not real and are removed rather than shown.
 */
export async function migrateLegacy(): Promise<string> {
  let note = '';
  try {
    const raw = localStorage.getItem(LEGACY_GOOGLE);
    if (raw) {
      const g = JSON.parse(raw) as { apiKey?: string; placeId?: string };
      const apiKey = String(g?.apiKey ?? '').trim();
      const placeId = String(g?.placeId ?? '').trim();
      if (apiKey || placeId) {
        const r = await saveSource({ placesKey: apiKey, placeId });
        /* A key of the wrong shape is refused; dropped rather than kept in
           plain text forever, and the customer is told. */
        note = r.success ? 'Your Google key was moved to the server and encrypted.' : `Your old Google settings could not be moved (${r.error ?? 'refused'}) and were removed. Set the source again below.`;
        if (!r.success && r.code === 'offline') return '';
      }
      localStorage.removeItem(LEGACY_GOOGLE);
    }
    if (localStorage.getItem(LEGACY_REVIEWS) !== null) localStorage.removeItem(LEGACY_REVIEWS);
    if (localStorage.getItem(LEGACY_COMPETITORS) !== null) localStorage.removeItem(LEGACY_COMPETITORS);
  } catch { /* storage blocked: nothing to move */ }
  return note;
}

/* ─── Sentiment ─── */
export type Sentiment = 'positive' | 'neutral' | 'negative';
/** A review with no words is still a review, and neutral unless its stars say otherwise. */
export function sentimentOf(rating: number, text: unknown): Sentiment {
  const n = Number(rating);
  if (Number.isFinite(n) && n >= 4) return 'positive';
  if (Number.isFinite(n) && n <= 2 && n > 0) return 'negative';
  const words = typeof text === 'string' ? text.toLowerCase() : '';
  const neg = ['bad', 'poor', 'slow', 'rude', 'disappointed', 'never', 'worst', 'refund'].some(w => words.includes(w));
  return neg ? 'negative' : 'neutral';
}

/* ─── Trending keyword themes ─── */
const STOP = new Set(['the', 'and', 'was', 'for', 'with', 'this', 'that', 'they', 'have', 'were', 'your', 'you', 'our', 'are', 'but', 'all', 'not', 'very', 'had', 'has', 'from', 'get', 'their', 'them', 'would', 'will', 'been', 'when', 'what', 'who', 'how']);
export function trendingThemes(reviews: RepReview[], sentiment: 'positive' | 'negative'): { word: string; count: number }[] {
  const counts = new Map<string, number>();
  reviews.filter(r => sentimentOf(r.rating, r.content) === sentiment).forEach(r => {
    const content = typeof r.content === 'string' ? r.content : '';
    content.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).forEach(w => {
      if (w.length < 4 || STOP.has(w)) return;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    });
  });
  return [...counts.entries()].map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count).slice(0, 8);
}

/* ─── Suggested rules ─── */
/**
 * What the rules tab suggests before anything is saved.
 *
 * The top rule drafts rather than auto-sends: a reply posted publicly in the
 * customer's name is a permission they should switch on, not find on.
 */
export function defaultRules(): AutoResponseRule[] {
  return [
    { id: 'ar-5', enabled: true, minRating: 4, maxRating: 5, mode: 'draft', instruction: 'Thank them warmly and invite them back.', runs: 0 },
    { id: 'ar-3', enabled: true, minRating: 3, maxRating: 3, mode: 'draft', instruction: 'Acknowledge the feedback and ask how we can do better.', runs: 0 },
    { id: 'ar-1', enabled: true, minRating: 1, maxRating: 2, mode: 'alert', instruction: 'Apologize, take it offline, and offer to make it right.', runs: 0 },
  ];
}
export function blankRule(): AutoResponseRule {
  return { id: `ar-${Date.now()}`, enabled: true, minRating: 1, maxRating: 5, mode: 'draft', instruction: '', runs: 0 };
}
