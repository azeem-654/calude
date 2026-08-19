/**
 * reputationService — real-time review management for the Reputation module.
 *
 * Aggregates reviews across platforms, streams new ones live, drafts AI
 * replies grounded in a business profile, runs auto-response rules, and
 * powers review-request campaigns. A fetch endpoint (public/api/reviews-fetch.php)
 * can pull real reviews when configured; otherwise a realistic live simulation
 * keeps the module fully usable.
 */

export type Platform = 'google' | 'facebook' | 'yelp' | 'trustpilot';

export interface RepReview {
  id: string;
  platform: Platform;
  rating: number;              // 1-5
  author: string;
  content: string;
  date: string;                // ISO
  replied: boolean;
  reply?: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  autoReplied?: boolean;
  isNew?: boolean;             // just streamed in (for animation)
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
  minRating: number;           // applies to reviews with rating >= min
  maxRating: number;           // ... and <= max
  mode: 'auto_send' | 'draft' | 'alert';
  instruction: string;
  runs: number;
}

export interface ReviewRequest {
  id: string;
  contactName: string;
  email: string;
  sentAt: string;
  status: 'sent' | 'clicked' | 'reviewed';
  platform: Platform;
}

export interface Competitor {
  name: string;
  rating: number;
  reviewCount: number;
}

/* ─── Storage ─── */
const REV_KEY = 'crm_reputation_reviews';
const PROFILE_KEY = 'crm_reputation_profile';
const RULES_KEY = 'crm_reputation_rules';
const REQ_KEY = 'crm_reputation_requests';
const COMP_KEY = 'crm_reputation_competitors';

export function loadReviews(): RepReview[] {
  try {
    const saved = JSON.parse(localStorage.getItem(REV_KEY) || 'null');
    if (Array.isArray(saved) && saved.length) return saved;
  } catch { /* ignore */ }
  const seed = seedReviews();
  saveReviews(seed);
  return seed;
}
export function saveReviews(list: RepReview[]) {
  try { localStorage.setItem(REV_KEY, JSON.stringify(list.map(r => ({ ...r, isNew: false })))); } catch { /* ignore */ }
}

export function loadProfile(): BusinessProfile {
  try { const s = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); if (s) return s; } catch { /* ignore */ }
  return { name: '', category: '', description: '', tone: 'warm', signature: '', knowledge: '', reviewLinks: {} };
}
export function saveProfile(p: BusinessProfile) { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* ignore */ } }

export function loadRules(): AutoResponseRule[] {
  try { const s = JSON.parse(localStorage.getItem(RULES_KEY) || 'null'); if (Array.isArray(s)) return s; } catch { /* ignore */ }
  return defaultRules();
}
export function saveRules(r: AutoResponseRule[]) { try { localStorage.setItem(RULES_KEY, JSON.stringify(r)); } catch { /* ignore */ } }

export function loadRequests(): ReviewRequest[] {
  try { return JSON.parse(localStorage.getItem(REQ_KEY) || '[]'); } catch { return []; }
}
export function saveRequests(r: ReviewRequest[]) { try { localStorage.setItem(REQ_KEY, JSON.stringify(r)); } catch { /* ignore */ } }

export function loadCompetitors(): Competitor[] {
  try { const s = JSON.parse(localStorage.getItem(COMP_KEY) || 'null'); if (Array.isArray(s)) return s; } catch { /* ignore */ }
  return [
    { name: 'Your business', rating: 0, reviewCount: 0 },   // filled at runtime
    { name: 'Northgate Rivals', rating: 4.2, reviewCount: 318 },
    { name: 'Summit & Co', rating: 3.9, reviewCount: 204 },
    { name: 'Bluepeak Group', rating: 4.6, reviewCount: 512 },
  ];
}
export function saveCompetitors(c: Competitor[]) { try { localStorage.setItem(COMP_KEY, JSON.stringify(c)); } catch { /* ignore */ } }

/* ─── Sentiment ─── */
/**
 * A review that carries no words is still a review.
 *
 * This took the whole screen down when a record arrived with no text — an older
 * schema, a half-finished import, a star rating left on its own. A rating with
 * nothing written against it is neutral by the same rule as anything else, not
 * a reason to stop rendering the page.
 */
export function sentimentOf(rating: number, text: unknown): RepReview['sentiment'] {
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
  reviews.filter(r => r.sentiment === sentiment).forEach(r => {
    /* Same reason as sentimentOf: a review with no words contributes none. */
    const content = typeof r.content === 'string' ? r.content : '';
    content.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).forEach(w => {
      if (w.length < 4 || STOP.has(w)) return;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    });
  });
  return [...counts.entries()].map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count).slice(0, 8);
}

/* ─── Default rules ─── */
export function defaultRules(): AutoResponseRule[] {
  return [
    { id: 'ar-5', enabled: true, minRating: 4, maxRating: 5, mode: 'auto_send', instruction: 'Thank them warmly and invite them back.', runs: 0 },
    { id: 'ar-3', enabled: true, minRating: 3, maxRating: 3, mode: 'draft', instruction: 'Acknowledge the feedback and ask how we can do better.', runs: 0 },
    { id: 'ar-1', enabled: true, minRating: 1, maxRating: 2, mode: 'alert', instruction: 'Apologize, take it offline, and offer to make it right.', runs: 0 },
  ];
}
export function blankRule(): AutoResponseRule {
  return { id: `ar-${Date.now()}`, enabled: true, minRating: 1, maxRating: 5, mode: 'draft', instruction: '', runs: 0 };
}

/* ─── Live stream simulation (new reviews arrive over time) ─── */
const STREAM_AUTHORS = ['Jordan P.', 'Nina R.', 'Carlos M.', 'Priya S.', 'Liam O.', 'Grace T.', 'Ahmed K.', 'Sofia L.', 'Marcus D.', 'Elena V.'];
const STREAM_POS = [
  'Absolutely fantastic experience — the team went above and beyond. Highly recommend!',
  'Quick, professional and friendly service. Will definitely come back.',
  'Best in the area, hands down. Everything was smooth from start to finish.',
  'Really impressed with the quality and the attention to detail. Five stars!',
];
const STREAM_MID = [
  'Decent overall, though the wait was a little longer than expected.',
  'Good service but a couple of small things could be improved.',
  'It was fine — nothing spectacular, nothing bad.',
];
const STREAM_NEG = [
  'Disappointed with the service this time. Hoping for better next visit.',
  'Slow response and the issue wasn\'t fully resolved. Not happy.',
];
const PLATFORMS: Platform[] = ['google', 'facebook', 'yelp', 'trustpilot'];

export function makeIncomingReview(): RepReview {
  const roll = Math.random();
  const rating = roll < 0.62 ? (Math.random() < 0.6 ? 5 : 4) : roll < 0.82 ? 3 : (Math.random() < 0.5 ? 2 : 1);
  const content = rating >= 4 ? STREAM_POS[Math.floor(Math.random() * STREAM_POS.length)]
    : rating === 3 ? STREAM_MID[Math.floor(Math.random() * STREAM_MID.length)]
    : STREAM_NEG[Math.floor(Math.random() * STREAM_NEG.length)];
  const author = STREAM_AUTHORS[Math.floor(Math.random() * STREAM_AUTHORS.length)];
  const platform = PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)];
  return {
    id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    platform, rating, author, content, date: new Date().toISOString(),
    replied: false, sentiment: sentimentOf(rating, content), isNew: true,
  };
}

/* ─── Seed (first load) ─── */
function seedReviews(): RepReview[] {
  const base: [Platform, number, string, string, number][] = [
    ['google', 5, 'Amanda Foster', 'Outstanding from start to finish. The staff were knowledgeable and made everything effortless. Couldn\'t be happier!', 2],
    ['google', 4, 'David Kim', 'Great service overall. One small hiccup with scheduling but they sorted it out quickly.', 8],
    ['facebook', 5, 'Rachel Torres', 'I\'ve recommended them to all my friends. Consistently excellent and genuinely care about customers.', 26],
    ['yelp', 2, 'Brian Walsh', 'Had high hopes but the experience fell short. Long wait and communication could be better.', 50],
    ['trustpilot', 5, 'Priya Nair', 'Exceptional quality and support. They answered every question and delivered ahead of schedule.', 74],
    ['google', 3, 'Tom Becker', 'It was okay. Nothing wrong exactly, just didn\'t wow me. Might try again.', 120],
    ['facebook', 5, 'Sofia Lang', 'Five stars all the way. Friendly, fast, and fair pricing. My new go-to.', 190],
    ['yelp', 1, 'Kevin Ross', 'Really disappointed. The issue took days to resolve and I had to follow up repeatedly.', 300],
  ];
  return base.map((b, i) => ({
    id: `seed-${i}`, platform: b[0], rating: b[1], author: b[2], content: b[3],
    date: new Date(Date.now() - b[4] * 3_600_000).toISOString(),
    replied: i % 3 === 0, reply: i % 3 === 0 ? 'Thank you so much for the kind words — it means a lot to our team!' : undefined,
    sentiment: sentimentOf(b[1], b[3]),
  }));
}

export function matchRule(rules: AutoResponseRule[], rating: number): AutoResponseRule | null {
  return rules.find(r => r.enabled && rating >= r.minRating && rating <= r.maxRating) ?? null;
}
