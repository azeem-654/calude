/**
 * What each plan allows, and how much of it has been used — the rules.
 *
 * Pure, no imports: the Worker enforces these numbers (lib/allowanceStore.ts)
 * and the browser draws them (src/services/allowances.ts re-exports this
 * file) — the public site's pricing, Plan & billing's Usage card, the meter
 * strip on the AI Autopilot board. One table, so the site cannot promise a
 * number the server does not hold somebody to. `npm run test:allowances`.
 *
 * ── Whose allowance ──
 *
 * The subscriber's: the person who pays, i.e. the owner of the workspace
 * (`crm_workspaces.owner_email`). Every workspace they own — their own and
 * each client sub-account — draws on the one allowance. Per workspace would
 * have multiplied it by the sub-account count, and on a plan with unlimited
 * sub-accounts that is an unlimited bill for the operator.
 *
 * ── Kinds of meter ──
 *
 *   count      how many exist now (projects, workflows in a project). Deleting
 *              one frees its place.
 *   monthly    how many were made this calendar month, UTC. Counted once per
 *              thing made, keyed by the thing (a retry cannot count twice), and
 *              never given back by deleting it — the cost was already paid.
 *   standing   how much is held now (video storage).
 *
 * `UNLIMITED` (-1) is how "no limit" is written everywhere, as `resell_limit`
 * already was. The install owner is never limited: every meter reads -1.
 *
 * ── What is not metered, and why ──
 *
 * Contacts: they live in the browser's synced records, and the server sees a
 * whole list at a time — there is no single moment a contact is "created"
 * that it could refuse. Email sends: they go through the customer's own
 * mailbox and cost the operator nothing, and the one door (lib/deliver.ts)
 * also carries the install's sign-in codes, which a cap must never stop.
 * Social posts and articles written *in the browser* (Social Creator, Blog)
 * reach the server only as AI requests, so they count there, not as posts.
 */

export const UNLIMITED = -1;

export type MeterId =
  | 'autopilot_projects' | 'workflows_per_project' | 'sub_accounts'
  | 'ai_requests' | 'social_posts' | 'blog_articles' | 'ai_emails'
  | 'prospects_found'
  | 'long_videos' | 'ai_shorts' | 'video_minutes' | 'render_minutes' | 'video_storage_gb';

export type MeterKind = 'count' | 'monthly' | 'standing';

export interface Meter {
  id: MeterId;
  /** What a person reads: "AI Shorts". */
  label: string;
  /** One of them, for sentences: "AI Short". */
  one: string;
  kind: MeterKind;
  group: 'AI Autopilot' | 'AI writing' | 'Prospecting' | 'Video' | 'Workspace';
  /** Where it is counted — said on the Usage card, so nobody has to guess. */
  counted: string;
  /** Unit after the number, when it is not a count of things. */
  unit?: string;
}

export const METERS: Meter[] = [
  { id: 'autopilot_projects', label: 'AI Autopilot projects', one: 'AI Autopilot project', kind: 'count', group: 'AI Autopilot',
    counted: 'Projects that exist across all your workspaces. Deleting one frees its place.' },
  { id: 'workflows_per_project', label: 'Workflows per project', one: 'workflow', kind: 'count', group: 'AI Autopilot',
    counted: 'Workflows in one project, counted per project.' },
  { id: 'sub_accounts', label: 'Client sub-accounts', one: 'sub-account', kind: 'count', group: 'Workspace',
    counted: 'Workspaces you run beyond your own.' },
  { id: 'ai_requests', label: 'AI requests', one: 'AI request', kind: 'monthly', group: 'AI writing',
    counted: 'Each time a screen asks the AI to write or read something for you.' },
  { id: 'social_posts', label: 'Social posts by AI Autopilot', one: 'social post', kind: 'monthly', group: 'AI writing',
    counted: 'Each post a project’s agent or AI Video Studio writes into Social Creator.' },
  { id: 'blog_articles', label: 'Blog articles by AI Autopilot', one: 'blog article', kind: 'monthly', group: 'AI writing',
    counted: 'Each article a project’s agent or AI Video Studio drafts into Blog.' },
  { id: 'ai_emails', label: 'Emails written by AI Autopilot', one: 'email', kind: 'monthly', group: 'AI writing',
    counted: 'Each email in a campaign a project’s agent or AI Video Studio writes.' },
  { id: 'prospects_found', label: 'Prospects found daily', one: 'prospect', kind: 'monthly', group: 'Prospecting',
    counted: 'Each business a project’s daily prospecting adds to its audience.' },
  { id: 'long_videos', label: 'Recordings processed', one: 'recording', kind: 'monthly', group: 'Video',
    counted: 'Each recording uploaded to AI Video Studio and processed.' },
  { id: 'ai_shorts', label: 'AI Shorts', one: 'AI Short', kind: 'monthly', group: 'Video',
    counted: 'Each Short the first time it is rendered. Rendering it again is free.' },
  { id: 'video_minutes', label: 'Video minutes uploaded', one: 'minute', kind: 'monthly', group: 'Video', unit: 'min',
    counted: 'The length of each recording processed.' },
  { id: 'render_minutes', label: 'Render minutes', one: 'minute', kind: 'monthly', group: 'Video', unit: 'min',
    counted: 'The length of every video rendered, re-renders included.' },
  { id: 'video_storage_gb', label: 'Video storage', one: 'GB', kind: 'standing', group: 'Video', unit: 'GB',
    counted: 'Recordings and rendered files kept. Deleting a project frees it.' },
];

export const meterOf = (id: string): Meter | undefined => METERS.find(m => m.id === id);
export const METER_IDS = METERS.map(m => m.id);

export type Limits = Record<MeterId, number>;

export type PlanKey = 'starter' | 'growth' | 'pro' | 'agency';
export const PLAN_KEYS: PlanKey[] = ['starter', 'growth', 'pro', 'agency'];

export interface PlanDef {
  id: PlanKey;
  name: string;
  /** Who it is for, one line. */
  tagline: string;
  monthlyCents: number;
  /** Billed once a year — ten months' price, two free. */
  annualCents: number;
  /** Drawn as the recommended one. */
  featured?: boolean;
  color: string;
  limits: Limits;
}

/*
 * The packages. docs/PRICING.md has the market comparison and the cost per
 * unit these were set against; change them together.
 *
 * Plan ids are the ones `crm_plans` already holds. `pro` and `agency` were
 * once sold as "Agency" ($97) and "Network" ($149) — LEGACY_CENTS below keeps
 * those subscribers on the plan they bought when a renewal arrives at the old
 * price.
 */
export const PLAN_DEFS: PlanDef[] = [
  {
    id: 'starter', name: 'Starter', color: '#3e63dd',
    tagline: 'One business putting its marketing on autopilot.',
    monthlyCents: 4_900, annualCents: 49_000,
    limits: {
      autopilot_projects: 3, workflows_per_project: 6, sub_accounts: 2,
      ai_requests: 1_500, social_posts: 60, blog_articles: 8, ai_emails: 300,
      prospects_found: 500,
      long_videos: 5, ai_shorts: 30, video_minutes: 300, render_minutes: 400, video_storage_gb: 25,
    },
  },
  {
    id: 'growth', name: 'Growth', color: '#8b5cf6', featured: true,
    tagline: 'A growing business, or a freelancer with a few clients.',
    monthlyCents: 9_700, annualCents: 97_000,
    limits: {
      autopilot_projects: 10, workflows_per_project: 12, sub_accounts: 5,
      ai_requests: 5_000, social_posts: 200, blog_articles: 30, ai_emails: 1_500,
      prospects_found: 2_000,
      long_videos: 15, ai_shorts: 100, video_minutes: 900, render_minutes: 1_200, video_storage_gb: 100,
    },
  },
  {
    id: 'pro', name: 'Pro', color: '#0f766e',
    tagline: 'An agency running AI marketing for its clients.',
    monthlyCents: 19_700, annualCents: 197_000,
    limits: {
      autopilot_projects: 30, workflows_per_project: 25, sub_accounts: 15,
      ai_requests: 15_000, social_posts: 600, blog_articles: 100, ai_emails: 5_000,
      prospects_found: 6_000,
      long_videos: 40, ai_shorts: 300, video_minutes: 2_400, render_minutes: 3_000, video_storage_gb: 250,
    },
  },
  {
    id: 'agency', name: 'Agency', color: '#17191c',
    tagline: 'A network of clients, without counting workspaces.',
    monthlyCents: 29_700, annualCents: 297_000,
    limits: {
      autopilot_projects: UNLIMITED, workflows_per_project: 40, sub_accounts: UNLIMITED,
      ai_requests: 40_000, social_posts: 2_000, blog_articles: 300, ai_emails: 15_000,
      prospects_found: 20_000,
      long_videos: 100, ai_shorts: 1_000, video_minutes: 6_000, render_minutes: 8_000, video_storage_gb: 750,
    },
  },
];

/**
 * What every plan includes. Nothing here is gated by plan in the product, so
 * no card may list one of these as what a higher plan adds — a customer would
 * pay more for something they already had.
 */
export const INCLUDED: string[] = [
  'CRM, pipelines and one inbox',
  'Funnels, websites, forms and a shop',
  'Booking page in your visitors’ time zones',
  'White-label: your name and logo',
  'Business directory search and free email checks',
  'Sends from your own mailbox — nothing goes until you approve it',
];

/**
 * The 7-day trial's allowance: enough to build a real project and see it
 * work, small enough that a trial costs the operator about two dollars.
 * Sub-accounts match Starter, which is what a trial has always had.
 */
export const TRIAL_LIMITS: Limits = {
  autopilot_projects: 2, workflows_per_project: 6, sub_accounts: 2,
  ai_requests: 300, social_posts: 20, blog_articles: 3, ai_emails: 50,
  prospects_found: 100,
  long_videos: 2, ai_shorts: 10, video_minutes: 90, render_minutes: 120, video_storage_gb: 5,
};
export const TRIAL_NAME = 'Free trial';

export const OWNER_LIMITS: Limits = Object.fromEntries(METER_IDS.map(id => [id, UNLIMITED])) as Limits;

/** Prices a plan was sold at before these packages, by plan id. */
export const LEGACY_CENTS: Partial<Record<PlanKey, number[]>> = { pro: [9_700], agency: [14_900] };

export const planDef = (id: string): PlanDef | undefined => PLAN_DEFS.find(p => p.id === id);
export const isPlanKey = (id: string): id is PlanKey => (PLAN_KEYS as string[]).includes(id);

/* ── Limits ──────────────────────────────────────────────────────────────── */

export type Overrides = Partial<Record<PlanKey | 'trial', Partial<Limits>>>;

/** A limit as the owner may set it: a whole number from 0, or -1. Anything else is null. */
export function cleanLimit(v: unknown): number | null {
  if (v === '' || v === null || v === undefined || typeof v === 'boolean') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (n === UNLIMITED) return UNLIMITED;
  if (n < 0 || n > 10_000_000) return null;
  return n;
}

export function applyOverrides(base: Limits, over: Partial<Limits> | undefined): Limits {
  const out = { ...base };
  for (const id of METER_IDS) {
    const v = cleanLimit(over?.[id]);
    if (v !== null) out[id] = v;
  }
  return out;
}

/** Every plan with the owner's changes applied — what the site shows and the server holds. */
export function effectivePlans(over: Overrides = {}): PlanDef[] {
  return PLAN_DEFS.map(p => ({ ...p, limits: applyOverrides(p.limits, over[p.id]) }));
}

export type StandingKind = 'owner' | 'trial' | 'ended' | 'plan';

/** The limits for a standing. An unknown plan id is held to Starter — refusing, not giving away. */
export function limitsFor(kind: StandingKind, planId: string, over: Overrides = {}): Limits {
  if (kind === 'owner') return OWNER_LIMITS;
  if (kind === 'trial' || kind === 'ended') return applyOverrides(TRIAL_LIMITS, over.trial);
  const p = planDef(planId) ?? PLAN_DEFS[0];
  return applyOverrides(p.limits, over[p.id]);
}

export const isUnlimited = (n: number) => n < 0;

/** May `need` more be used? */
export function verdict(used: number, limit: number, need = 1): { ok: boolean; left: number } {
  if (isUnlimited(limit)) return { ok: true, left: UNLIMITED };
  const left = Math.max(0, limit - used);
  return { ok: need <= left, left };
}

/** The first plan above this one that allows more of this meter. */
export function upgradeFor(meter: MeterId, current: { kind: StandingKind; planId: string }, plans: PlanDef[] = PLAN_DEFS): PlanDef | null {
  if (current.kind === 'owner') return null;
  const have = limitsFor(current.kind, current.planId, Object.fromEntries(plans.map(p => [p.id, p.limits])) as Overrides)[meter];
  if (isUnlimited(have)) return null;
  const from = current.kind === 'plan' ? Math.max(0, plans.findIndex(p => p.id === current.planId)) : -1;
  for (const p of plans.slice(from + 1)) {
    if (isUnlimited(p.limits[meter]) || p.limits[meter] > have) return p;
  }
  return null;
}

/* ── Periods ─────────────────────────────────────────────────────────────── */

/** The calendar month in UTC, written as `crm_video_usage` already writes it. */
export const periodOf = (d = new Date()): string => `m:${d.toISOString().slice(0, 7)}`;

/** When a month's allowance starts again: the first instant of the next month, UTC. */
export function periodEnd(period: string): string {
  const m = /^m:(\d{4})-(\d{2})$/.exec(period);
  if (!m) return '';
  return new Date(Date.UTC(Number(m[1]), Number(m[2]), 1)).toISOString();
}

/* ── Words ───────────────────────────────────────────────────────────────── */

const num = (n: number) => n.toLocaleString('en-US');

export function formatLimit(n: number, meter?: Meter): string {
  if (isUnlimited(n)) return 'Unlimited';
  return meter?.unit ? `${num(n)} ${meter.unit}` : num(n);
}

const plural = (n: number, one: string) => {
  if (n === 1 || one === 'GB' || one === 'min') return one;
  return one.endsWith('y') && !/[aeiou]y$/.test(one) ? `${one.slice(0, -1)}ies` : `${one}s`;
};

/** "This month's 30 AI Shorts are used (30 of 30) — they start again on 1 November. Growth includes 100." */
export function refusalText(m: Meter, used: number, limit: number, planName: string, upgrade: { name: string; limit: number } | null, resetsAt = ''): string {
  const what = m.kind === 'monthly'
    ? `This month’s ${num(limit)} ${plural(limit, m.one)} on ${planName} ${limit === 1 ? 'is' : 'are'} used (${num(Math.round(used))} of ${num(limit)})`
    : m.id === 'workflows_per_project'
      ? `This project already has ${num(used)} of the ${num(limit)} ${plural(limit, m.one)} ${planName} allows in one project`
      : m.kind === 'standing'
        ? `${planName} includes ${num(limit)} ${m.unit ?? ''} of ${m.label.toLowerCase()} and ${num(Math.round(used * 10) / 10)} ${m.unit ?? ''} ${used === 1 ? 'is' : 'are'} in use`.replace(/\s+/g, ' ')
        : `${planName} includes ${num(limit)} ${plural(limit, m.one)} and ${num(used)} ${used === 1 ? 'exists' : 'exist'}`;
  const when = m.kind === 'monthly' && resetsAt
    ? ` — ${limit === 1 ? 'it starts' : 'they start'} again on ${new Date(resetsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })}`
    : m.kind === 'count' ? ' — delete one you no longer need, or choose a larger plan' : '';
  const up = upgrade
    ? ` ${upgrade.name} includes ${isUnlimited(upgrade.limit) ? 'unlimited' : num(upgrade.limit)}${m.kind === 'monthly' ? ' a month' : ''}.`
    : '';
  return `${what}${when}.${up}`;
}

/**
 * The plan's numbers as lines for a price card — generated from the limits,
 * so a card cannot say a number the server does not hold.
 */
export function featureLines(p: Pick<PlanDef, 'limits'>): string[] {
  const L = p.limits;
  const n = (v: number, one: string, many: string) => isUnlimited(v) ? `Unlimited ${many}` : `${num(v)} ${v === 1 ? one : many}`;
  return [
    n(L.autopilot_projects, 'AI Autopilot project', 'AI Autopilot projects'),
    `${isUnlimited(L.workflows_per_project) ? 'Unlimited' : `Up to ${num(L.workflows_per_project)}`} workflows per project`,
    `${n(L.ai_shorts, 'AI Short', 'AI Shorts')} and ${n(L.long_videos, 'recording', 'recordings')} processed a month`,
    `${n(L.social_posts, 'social post', 'social posts')} and ${n(L.blog_articles, 'blog article', 'blog articles')} written a month`,
    `${n(L.ai_emails, 'AI-written email', 'AI-written emails')} a month`,
    `${n(L.prospects_found, 'prospect', 'prospects')} found for you a month`,
    `${n(L.ai_requests, 'AI request', 'AI requests')} a month`,
    isUnlimited(L.sub_accounts) ? 'Unlimited client sub-accounts' : `${num(L.sub_accounts)} client sub-account${L.sub_accounts === 1 ? '' : 's'}`,
  ];
}

/** Dollars, for display: 4900 → "49", 49000 → "490". */
export const dollars = (cents: number) => (cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100));

/** What paying yearly saves, in cents. */
export const annualSaving = (p: Pick<PlanDef, 'monthlyCents' | 'annualCents'>) => p.monthlyCents * 12 - p.annualCents;

export type Interval = 'month' | 'year';

/** The plan a payment of this amount is, when it is exactly one plan's price. */
export function planByAmount(cents: number | undefined, plans: PlanDef[] = PLAN_DEFS): { id: PlanKey; interval: Interval } | null {
  if (!cents) return null;
  for (const p of plans) {
    if (p.monthlyCents === cents) return { id: p.id, interval: 'month' };
    if (p.annualCents === cents) return { id: p.id, interval: 'year' };
  }
  return null;
}

/** Has this plan ever been sold at this amount? */
export const soldAt = (id: string, cents: number | undefined): boolean => {
  const p = planDef(id);
  return !!p && !!cents && (p.monthlyCents === cents || p.annualCents === cents || (LEGACY_CENTS[p.id] ?? []).includes(cents));
};

/* ── The read the screens draw ───────────────────────────────────────────── */

export interface MeterReading {
  id: MeterId;
  used: number;
  limit: number;
  /** For workflows_per_project: the project with the most, by name. */
  note?: string;
}

/** How full a meter is, 0..1; unlimited is 0 (nothing to fill). */
export function fill(r: Pick<MeterReading, 'used' | 'limit'>): number {
  if (isUnlimited(r.limit)) return 0;
  if (r.limit === 0) return r.used > 0 ? 1 : 0;
  return Math.min(1, r.used / r.limit);
}
