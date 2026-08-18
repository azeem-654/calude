/**
 * onboarding.ts — storage + plan engine for the AI Company Onboarding Wizard.
 *
 * Persists under the tenant-scoped `crm_onboarding` localStorage key, so every
 * sub-account gets its own onboarding state automatically (see tenancy.ts).
 *
 * The 12-month plan generator prefers Gemini (generateMarketingPlan) and falls
 * back to a deterministic smart-template engine keyed on industry + real
 * calendar holidays, so the wizard is fully functional with no API key.
 */

import type { ContentMonth, OnboardingState, OnboardingProfile, OnboardingGoals, PlanAuditEntry } from '../types/onboarding';
import { generateMarketingPlan, hasGeminiKey } from '../lib/gemini';

const LS_KEY = 'crm_onboarding';

/* ── Sanitization ── */

/** Strip HTML/control characters and clamp length — applied to every free-text field. */
export function sanitizeText(s: string, max = 400): string {
  return s
    .replace(/<[^>]*>/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s{3,}/g, '  ')
    .trim()
    .slice(0, max);
}

export function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
}

export function isValidUrl(s: string): boolean {
  try { const u = new URL(s.startsWith('http') ? s : `https://${s}`); return u.hostname.includes('.'); } catch { return false; }
}

/* ── Option catalogs ── */

export const INDUSTRIES = [
  'Real Estate', 'Home Services', 'Health & Wellness', 'Fitness & Gyms', 'Beauty & Salon',
  'Restaurant & Food', 'E-commerce & Retail', 'Professional Services', 'Legal', 'Finance & Insurance',
  'Marketing Agency', 'Education & Coaching', 'Automotive', 'Construction', 'Technology & SaaS',
  'Travel & Hospitality', 'Events & Entertainment', 'Nonprofit', 'Other',
];

export const VOICE_OPTIONS = [
  'Friendly & approachable', 'Professional & authoritative', 'Bold & energetic',
  'Warm & caring', 'Witty & playful', 'Luxury & refined',
];

export const GOAL_OPTIONS = [
  'Generate more leads', 'Book more appointments', 'Increase repeat sales',
  'Grow social following', 'Build brand awareness', 'Get more 5-star reviews',
  'Launch a new offer', 'Nurture existing customers',
];

export interface ChannelOption { id: string; label: string; module: string; }
export const CHANNEL_OPTIONS: ChannelOption[] = [
  { id: 'email',     label: 'Email marketing',   module: 'Marketing → Campaigns & Sequences' },
  { id: 'sms',       label: 'SMS marketing',     module: 'Marketing → SMS flows' },
  { id: 'facebook',  label: 'Facebook',          module: 'Social Creator → Post calendar' },
  { id: 'instagram', label: 'Instagram',         module: 'Social Creator → Post calendar' },
  { id: 'linkedin',  label: 'LinkedIn',          module: 'Social Creator → Post calendar' },
  { id: 'video',     label: 'YouTube / Shorts',  module: 'AI Shorts → Clip pipeline' },
  { id: 'blog',      label: 'Blog / SEO',        module: 'Websites → Blog posts' },
  { id: 'reviews',   label: 'Google reviews',    module: 'Reputation → Review requests' },
  { id: 'booking',   label: 'Online booking',    module: 'Scheduling → Booking pages' },
  { id: 'funnels',   label: 'Funnels & landing pages', module: 'Funnels → Lead capture' },
];

/** Sensible default sales stages per industry (editable in the wizard). */
export function defaultStagesFor(industry: string): string[] {
  const map: Record<string, string[]> = {
    'Real Estate':            ['New Lead', 'Contacted', 'Showing Booked', 'Offer Made', 'Under Contract', 'Closed'],
    'Home Services':          ['New Lead', 'Estimate Requested', 'Quote Sent', 'Job Scheduled', 'Job Done', 'Invoiced'],
    'Health & Wellness':      ['Inquiry', 'Consultation Booked', 'Treatment Plan', 'Active Client', 'Renewal'],
    'Fitness & Gyms':         ['Lead', 'Trial Booked', 'Trial Attended', 'Membership Offered', 'Member'],
    'Beauty & Salon':         ['Inquiry', 'Appointment Booked', 'First Visit', 'Regular Client', 'VIP'],
    'Restaurant & Food':      ['Inquiry', 'Tasting / Visit', 'Event Quoted', 'Booked', 'Completed'],
    'E-commerce & Retail':    ['Subscriber', 'First Purchase', 'Repeat Buyer', 'VIP Customer'],
    'Legal':                  ['Inquiry', 'Consultation', 'Retainer Sent', 'Active Case', 'Closed'],
    'Finance & Insurance':    ['Lead', 'Discovery Call', 'Proposal', 'Application', 'Client'],
    'Marketing Agency':       ['Lead', 'Discovery Call', 'Audit Sent', 'Proposal', 'Negotiation', 'Client'],
    'Education & Coaching':   ['Lead', 'Discovery Call', 'Enrolled', 'Active Student', 'Alumni'],
    'Automotive':             ['Lead', 'Test Drive', 'Financing', 'Negotiation', 'Sold'],
    'Construction':           ['Lead', 'Site Visit', 'Bid Sent', 'Contract', 'In Progress', 'Complete'],
    'Technology & SaaS':      ['Lead', 'Demo Booked', 'Trial', 'Proposal', 'Negotiation', 'Closed Won'],
    'Travel & Hospitality':   ['Inquiry', 'Quote Sent', 'Booked', 'Traveled', 'Review Requested'],
    'Events & Entertainment': ['Inquiry', 'Venue Tour', 'Proposal', 'Deposit Paid', 'Event Done'],
    'Nonprofit':              ['Prospect', 'First Contact', 'Meeting', 'Pledge', 'Donor'],
  };
  return map[industry] ?? ['New Lead', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won'];
}

/* ── Storage ── */

export function emptyOnboarding(): OnboardingState {
  return {
    version: 1, step: 0, completed: false, skipped: false,
    profile: {
      companyName: '', industry: '', description: '', audience: '',
      brandVoice: VOICE_OPTIONS[0], brandColor: '#3e63dd', website: '', email: '', phone: '',
      workDays: ['mon', 'tue', 'wed', 'thu', 'fri'], workFrom: '09:00', workTo: '17:00',
    },
    goals: { goals: [], monthlyLeadTarget: 30, salesStages: [] },
    channels: [],
    plan: [],
    audit: [],
  };
}

/**
 * Read the stored state, filling in anything it is missing.
 *
 * The merge has to reach inside the nested objects. A shallow spread replaces
 * `goals` wholesale, so a record saved by an older version — or written with
 * only some of its keys — leaves `goals.salesStages` undefined, and the first
 * `.length` on it takes down the whole dashboard behind the error boundary.
 * Arrays are checked rather than trusted for the same reason.
 */
export function loadOnboarding(): OnboardingState {
  const base = emptyOnboarding();
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null') as Partial<OnboardingState> | null;
    if (!raw || raw.version !== 1) return base;

    const list = <T,>(v: unknown, fallback: T[]): T[] => (Array.isArray(v) ? v as T[] : fallback);

    return {
      ...base,
      ...raw,
      profile: { ...base.profile, ...(raw.profile ?? {}) },
      goals: {
        ...base.goals,
        ...(raw.goals ?? {}),
        goals: list(raw.goals?.goals, base.goals.goals),
        salesStages: list(raw.goals?.salesStages, base.goals.salesStages),
      },
      channels: list(raw.channels, base.channels),
      plan: list(raw.plan, base.plan),
      audit: list(raw.audit, base.audit),
    };
  } catch { /* corrupted → start fresh */ }
  return base;
}

export function saveOnboarding(state: OnboardingState) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* quota */ }
}

export function auditEntry(action: string, actor = 'system'): PlanAuditEntry {
  return { at: new Date().toISOString(), actor, action };
}

/* ── 12-month plan engine ── */

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Real holidays & observances by calendar month (US-centric, broadly marketable). */
const HOLIDAYS_BY_MONTH: string[][] = [
  ["New Year's Day", 'MLK Day'],
  ["Valentine's Day", 'Presidents Day'],
  ["St. Patrick's Day", 'First Day of Spring'],
  ['Easter', 'Earth Day', 'Tax Day'],
  ["Mother's Day", 'Memorial Day'],
  ["Father's Day", 'First Day of Summer'],
  ['Independence Day'],
  ['Back to School season'],
  ['Labor Day', 'First Day of Fall'],
  ['Halloween'],
  ['Thanksgiving', 'Black Friday', 'Small Business Saturday'],
  ['Cyber Monday', 'Christmas', "New Year's Eve"],
];

/** Rotating monthly focus arcs the offline engine builds themes around. */
const ARC = [
  { theme: 'Fresh Start Momentum',      focus: 'Kick off with a strong introduction of who you are and the results you deliver. Warm the audience with your story and best proof.' },
  { theme: 'Trust & Social Proof',      focus: 'Put customer wins front and center — reviews, before/afters and case studies convert skeptics into buyers.' },
  { theme: 'Education Month',           focus: 'Teach, don\'t sell. How-to content positions the business as the go-to expert and fuels search traffic.' },
  { theme: 'Signature Offer Spotlight', focus: 'A focused push on the flagship product/service with a clear limited-time incentive to act now.' },
  { theme: 'Community & Behind-the-Scenes', focus: 'Humanize the brand — team intros, process peeks and local involvement deepen loyalty.' },
  { theme: 'Referral Engine',           focus: 'Turn happy customers into promoters with a simple, rewarding referral push across email and SMS.' },
  { theme: 'Mid-Year Value Drop',       focus: 'Deliver a high-value free resource (guide, checklist, mini-series) to grow the list fast.' },
  { theme: 'Objection Crusher',         focus: 'Address the top reasons prospects hesitate — price, timing, trust — one piece of content at a time.' },
  { theme: 'Seasonal Push',             focus: 'Ride the seasonal demand wave with themed offers and time-sensitive campaigns.' },
  { theme: 'Reviews & Reputation',      focus: 'A concentrated campaign to collect fresh 5-star reviews and showcase them everywhere.' },
  { theme: 'Big Promo Season',          focus: 'The year\'s biggest promotional window — stack offers, urgency and retargeting for maximum revenue.' },
  { theme: 'Year-in-Review & Renewal',  focus: 'Celebrate customer wins from the year and lock in next year\'s business with renewal and loyalty offers.' },
];

/** Deterministic offline plan — industry-flavored ideas, real holidays, no API needed. */
export function offlinePlan(profile: OnboardingProfile, goals: OnboardingGoals, channels: string[], start: Date): Omit<ContentMonth, 'status' | 'counts' | 'audit'>[] {
  const co = profile.companyName || 'your business';
  const ind = (profile.industry || 'business').toLowerCase();
  const wantsEmail = channels.includes('email');
  const wantsSocial = channels.some(c => ['facebook', 'instagram', 'linkedin'].includes(c));
  const wantsVideo = channels.includes('video');
  const wantsReviews = channels.includes('reviews');

  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const m = d.getMonth();
    const arc = ARC[i % ARC.length];
    const ideas: string[] = [];
    if (wantsSocial) ideas.push(`"${arc.theme}" social series for ${co}`);
    if (wantsEmail) ideas.push(`Email campaign: ${arc.theme.toLowerCase()} for ${ind} clients`);
    if (wantsVideo) ideas.push(`Short video: ${arc.theme.toLowerCase()} explained in 60 seconds`);
    if (wantsReviews) ideas.push('Review-request blitz to recent happy customers');
    if (HOLIDAYS_BY_MONTH[m][0]) ideas.push(`${HOLIDAYS_BY_MONTH[m][0]} themed promo`);
    if (goals.goals.includes('Book more appointments')) ideas.push('Booking-link push with limited slots angle');
    if (ideas.length < 4) ideas.push(`Customer story spotlight for ${co}`, `FAQ post answering top ${ind} questions`);
    return {
      index: i,
      year: d.getFullYear(),
      month: m,
      label: `${MONTH_NAMES[m]} ${d.getFullYear()}`,
      theme: arc.theme,
      focus: arc.focus,
      holidays: HOLIDAYS_BY_MONTH[m].slice(0, 3),
      ideas: ideas.slice(0, 4),
    };
  });
}

/**
 * Build the full 12-month plan. Tries Gemini first (when a key is configured),
 * falls back to the offline smart-template engine. All AI output is sanitized.
 */
export async function buildTwelveMonthPlan(
  profile: OnboardingProfile,
  goals: OnboardingGoals,
  channels: string[],
): Promise<{ months: ContentMonth[]; source: 'ai' | 'smart-templates' }> {
  const start = new Date();
  start.setDate(1);
  const base = offlinePlan(profile, goals, channels, start);
  let source: 'ai' | 'smart-templates' = 'smart-templates';
  let months = base;

  if (hasGeminiKey()) {
    try {
      const ai = await generateMarketingPlan({
        company: sanitizeText(profile.companyName, 80),
        industry: sanitizeText(profile.industry, 60),
        description: sanitizeText(profile.description, 400),
        audience: sanitizeText(profile.audience, 300),
        voice: sanitizeText(profile.brandVoice, 60),
        goals: goals.goals.map(g => sanitizeText(g, 60)),
        channels: channels.map(c => sanitizeText(c, 30)),
        startMonthLabel: base[0].label,
      });
      months = base.map((b, i) => ({
        ...b,
        theme: sanitizeText(ai[i].theme, 60) || b.theme,
        focus: sanitizeText(ai[i].focus, 260) || b.focus,
        holidays: ai[i].holidays.map(h => sanitizeText(h, 50)).filter(Boolean).slice(0, 3),
        ideas: ai[i].ideas.map(x => sanitizeText(x, 90)).filter(Boolean).slice(0, 4),
      })).map(b => ({ ...b, holidays: b.holidays.length ? b.holidays : HOLIDAYS_BY_MONTH[b.month].slice(0, 3) }));
      source = 'ai';
    } catch { /* quota/network/parse — offline plan already in place */ }
  }

  const stamped: ContentMonth[] = months.map(m => ({
    ...m,
    status: 'PLAN_GENERATED',
    counts: { emails: 0, sms: 0, social: 0, blogs: 0, tasks: 0 },
    audit: [auditEntry(`Plan generated (${source === 'ai' ? 'Gemini AI' : 'smart templates'})`)],
  }));
  return { months: stamped, source };
}

/** Short status label + palette used by the widget and review screens. */
export function statusMeta(status: ContentMonth['status']): { label: string; bg: string; color: string } {
  switch (status) {
    case 'PLAN_GENERATED':    return { label: 'Planned',   bg: '#eceff9', color: '#3e63dd' };
    case 'GENERATING':        return { label: 'Generating', bg: '#fdeeda', color: '#c77414' };
    case 'AWAITING_APPROVAL': return { label: 'Review',    bg: '#f1edfb', color: '#8b5cf6' };
    case 'PUBLISHED':         return { label: 'Published', bg: '#e2f5dc', color: '#3f9142' };
  }
}
