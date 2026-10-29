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
  | 'long_videos' | 'ai_shorts' | 'video_minutes' | 'render_minutes' | 'video_storage_gb'
  | 'login_addresses';

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
  { id: 'autopilot_projects', label: 'AI Autopilot business workspaces', one: 'AI Autopilot business workspace', kind: 'count', group: 'AI Autopilot',
    counted: 'Business workspaces in AI Autopilot, counted across every account you own. Deleting one frees its place.' },
  { id: 'workflows_per_project', label: 'Workflows per business workspace', one: 'workflow', kind: 'count', group: 'AI Autopilot',
    counted: 'Workflows in one business workspace, counted per business workspace.' },
  { id: 'sub_accounts', label: 'Client sub-accounts', one: 'sub-account', kind: 'count', group: 'Workspace',
    counted: 'Workspaces you run beyond your own.' },
  { id: 'ai_requests', label: 'AI requests', one: 'AI request', kind: 'monthly', group: 'AI writing',
    counted: 'Each time a screen asks the AI to write or read something for you.' },
  { id: 'social_posts', label: 'Social posts by AI Autopilot', one: 'social post', kind: 'monthly', group: 'AI writing',
    counted: 'Each post a business workspace’s agent or AI Video Studio writes into the Graphics Designer & Editor.' },
  { id: 'blog_articles', label: 'Blog articles by AI Autopilot', one: 'blog article', kind: 'monthly', group: 'AI writing',
    counted: 'Each article a business workspace’s agent or AI Video Studio drafts into Blog.' },
  { id: 'ai_emails', label: 'Emails written by AI Autopilot', one: 'email', kind: 'monthly', group: 'AI writing',
    counted: 'Each email in a campaign a business workspace’s agent or AI Video Studio writes.' },
  { id: 'prospects_found', label: 'Prospects found daily', one: 'prospect', kind: 'monthly', group: 'Prospecting',
    counted: 'Each business a business workspace’s daily prospecting adds to its audience.' },
  { id: 'long_videos', label: 'Recordings processed', one: 'recording', kind: 'monthly', group: 'Video',
    counted: 'Each recording uploaded to AI Video Studio and processed.' },
  { id: 'ai_shorts', label: 'AI Shorts', one: 'AI Short', kind: 'monthly', group: 'Video',
    counted: 'Each Short the first time it is rendered. Rendering it again is free.' },
  { id: 'video_minutes', label: 'Video minutes uploaded', one: 'minute', kind: 'monthly', group: 'Video', unit: 'min',
    counted: 'The length of each recording processed.' },
  { id: 'render_minutes', label: 'Render minutes', one: 'minute', kind: 'monthly', group: 'Video', unit: 'min',
    counted: 'The length of every video rendered, re-renders included.' },
  { id: 'video_storage_gb', label: 'Video storage', one: 'GB', kind: 'standing', group: 'Video', unit: 'GB',
    counted: 'Recordings and rendered files kept. Deleting a video project frees it.' },
  { id: 'login_addresses', label: 'Branded login addresses', one: 'login address', kind: 'count', group: 'Workspace',
    counted: 'Addresses your clients sign in at under your brand — a free subdomain or your own domain. Removing one frees its place.' },
];

export const meterOf = (id: string): Meter | undefined => METERS.find(m => m.id === id);
export const METER_IDS = METERS.map(m => m.id);

export type Limits = Record<MeterId, number>;

/*
 * ── The packages ──
 *
 * Two priced, self-serve plans and Custom, which has no price: it is agreed
 * with the customer, and the install owner gives it to them by hand (Sign-ups
 * & trials → Plans & allowances → Give a customer a plan). docs/PRICING.md has
 * the market comparison and the cost per unit these were set against.
 *
 * Since 2026-10-28 (the owner's specification) new customers are offered
 * exactly Advanced (id `growth`) at $97 a month, Scale at $297 a month, and
 * Custom, in US dollars. Since 2026-10-29 yearly billing is back at the
 * discount it always had — ten months' price, two free: Advanced $970 (the
 * yearly price Growth was sold at until 2026-10-28) and Scale $2,970.
 * `annualCents: 0` still means no yearly price, and checkout refuses a yearly
 * request for such a plan.
 *
 * "Growth" was renamed "Advanced" on every customer screen (2026-10-29) so it
 * is not confused with the HVAC/roofing "growth service"; the id stays
 * `growth`, because crm_plans rows, checkout metadata and processor
 * subscriptions already carry it.
 *
 * Plan ids are the ones `crm_plans` already holds, and none is ever reused for
 * a different product. A plan no longer sold becomes `legacy`: never on a
 * card, never at checkout, still enforced with the allowance its subscribers
 * bought, and still renewed at the price they pay (LEGACY_CENTS) — nobody is
 * repriced or has an allowance taken away by a change here:
 *   - `starter` — Starter, $49 / $490 (2026-10-14 to 2026-10-28);
 *   - `pro` — Pro, $197 / $1,970 (2026-10-14 to 2026-10-28), and before that
 *     "Agency" at $97;
 *   - `agency` — "Network" ($149), then briefly "Agency" ($297).
 * Growth keeps its id, price and allowance, so its subscribers see no change
 * except that yearly is no longer offered to new buyers; a yearly Growth
 * subscription still renews (LEGACY_CENTS).
 */
export type PlanKey = 'starter' | 'growth' | 'scale' | 'pro' | 'custom' | 'agency';
export const PLAN_KEYS: PlanKey[] = ['starter', 'growth', 'scale', 'pro', 'custom', 'agency'];

/** `self` is bought at checkout; `custom` is agreed and given by hand; `legacy` is kept for who has it. */
export type PlanKind = 'self' | 'custom' | 'legacy';

export interface PlanDef {
  id: PlanKey;
  name: string;
  kind: PlanKind;
  /** Who it is for, one line. */
  tagline: string;
  /** 0 for Custom: there is no list price. */
  monthlyCents: number;
  /** Billed once a year — ten months' price, two free. 0: no yearly price is sold. */
  annualCents: number;
  /** Drawn as the recommended one. */
  featured?: boolean;
  color: string;
  limits: Limits;
  /** How we help on this plan — service, not software, and said as such. */
  support: string;
}

export const PLAN_DEFS: PlanDef[] = [
  {
    /* Not sold since 2026-10-28. Its subscribers keep what they bought, at their price.
       First in the list: an unknown plan id is held to it (limitsFor). */
    id: 'starter', name: 'Starter', kind: 'legacy', color: '#3e63dd',
    tagline: 'No longer offered — kept for the subscribers who have it.',
    monthlyCents: 4_900, annualCents: 49_000,
    support: 'In-app help: chat, tickets and screen sharing',
    limits: {
      autopilot_projects: 3, workflows_per_project: 6, sub_accounts: 2,
      ai_requests: 1_500, social_posts: 60, blog_articles: 8, ai_emails: 300,
      prospects_found: 500,
      long_videos: 5, ai_shorts: 30, video_minutes: 300, render_minutes: 400, video_storage_gb: 25,
      login_addresses: 1,
    },
  },
  {
    id: 'growth', name: 'Advanced', kind: 'self', color: '#8b5cf6', featured: true,
    tagline: 'One business running its CRM, follow-up and marketing automation in one place.',
    monthlyCents: 9_700, annualCents: 97_000,
    support: 'In-app help: chat, tickets and screen sharing',
    limits: {
      autopilot_projects: 10, workflows_per_project: 12, sub_accounts: 5,
      ai_requests: 5_000, social_posts: 200, blog_articles: 30, ai_emails: 1_500,
      prospects_found: 2_000,
      long_videos: 15, ai_shorts: 100, video_minutes: 900, render_minutes: 1_200, video_storage_gb: 100,
      login_addresses: 5,
    },
  },
  {
    /* Sold from 2026-10-28. Until 2026-10-29 its allowance was Pro's, which
       left a Pro subscriber with exactly what Scale sells for $100 more. Now
       every meter is about 1.5× Pro's — Scale is 1.5× Pro's price ($297 vs
       $197), so the operator's cost per dollar stays where Pro was sized
       (docs/PRICING.md) — and every one stays at or under where Custom
       starts. These numbers wait on the owner's approval
       (docs/OWNER-CHECKLIST.md item 31); any of them can be changed on Plans
       & allowances without a release. */
    id: 'scale', name: 'Scale', kind: 'self', color: '#0f766e',
    tagline: 'A bigger operation or an agency: more business workspaces, campaigns, clients and AI.',
    monthlyCents: 29_700, annualCents: 297_000,
    support: 'In-app help, answered first',
    limits: {
      autopilot_projects: 60, workflows_per_project: 35, sub_accounts: 40,
      ai_requests: 30_000, social_posts: 1_200, blog_articles: 180, ai_emails: 9_000,
      prospects_found: 12_000,
      long_videos: 75, ai_shorts: 600, video_minutes: 4_500, render_minutes: 6_000, video_storage_gb: 450,
      login_addresses: 40,
    },
  },
  {
    /* Not sold since 2026-10-28. Its subscribers keep what they bought, at their price. */
    id: 'pro', name: 'Pro', kind: 'legacy', color: '#0f766e',
    tagline: 'No longer offered — kept for the subscribers who have it.',
    monthlyCents: 19_700, annualCents: 197_000,
    support: 'In-app help, answered first',
    limits: {
      autopilot_projects: 40, workflows_per_project: 25, sub_accounts: 25,
      ai_requests: 20_000, social_posts: 800, blog_articles: 120, ai_emails: 6_000,
      prospects_found: 8_000,
      long_videos: 50, ai_shorts: 400, video_minutes: 3_000, render_minutes: 4_000, video_storage_gb: 300,
      login_addresses: 25,
    },
  },
  {
    /* The numbers are where a Custom plan starts; the owner changes them on
       Plans & allowances. Never sold at checkout. */
    id: 'custom', name: 'Custom', kind: 'custom', color: '#17191c',
    tagline: 'More than Scale, or something Scale does not do — agreed with you.',
    monthlyCents: 0, annualCents: 0,
    support: 'An onboarding call, done-for-you setup and a named contact',
    limits: {
      autopilot_projects: UNLIMITED, workflows_per_project: 40, sub_accounts: UNLIMITED,
      ai_requests: 40_000, social_posts: 2_000, blog_articles: 300, ai_emails: 15_000,
      prospects_found: 20_000,
      long_videos: 100, ai_shorts: 1_000, video_minutes: 6_000, render_minutes: 8_000, video_storage_gb: 750,
      login_addresses: 100,
    },
  },
  {
    /* Not sold. Its subscribers keep what they bought. */
    id: 'agency', name: 'Agency', kind: 'legacy', color: '#17191c',
    tagline: 'No longer offered — kept for the subscribers who have it.',
    monthlyCents: 29_700, annualCents: 297_000,
    support: 'In-app help, answered first',
    limits: {
      autopilot_projects: UNLIMITED, workflows_per_project: 40, sub_accounts: UNLIMITED,
      ai_requests: 40_000, social_posts: 2_000, blog_articles: 300, ai_emails: 15_000,
      prospects_found: 20_000,
      long_videos: 100, ai_shorts: 1_000, video_minutes: 6_000, render_minutes: 8_000, video_storage_gb: 750,
      login_addresses: UNLIMITED,
    },
  },
];

/** The plans a card shows: the priced ones, then Custom. */
export const CARD_PLANS = (plans: PlanDef[] = PLAN_DEFS) => plans.filter(p => p.kind !== 'legacy');
/** The plans checkout sells. */
export const SOLD_PLANS = (plans: PlanDef[] = PLAN_DEFS) => plans.filter(p => p.kind === 'self');

/**
 * What every plan includes. Nothing here is gated by plan in the product, so
 * no card may list one of these as what a higher plan adds — a customer would
 * pay more for something they already had.
 */
export const INCLUDED: string[] = [
  'CRM, pipelines and one inbox',
  'Funnels, websites, forms and a shop',
  'Booking page in your visitors’ time zones',
  'White-label: your name, logo and colours on every workspace',
  'Business directory search and free email checks',
  'Sends from your own mailbox — nothing goes until you approve it',
];

/**
 * What Custom offers beyond numbers: service the owner gives by hand, listed
 * only on Custom, which has no checkout and starts with a conversation.
 */
export const CUSTOM_OFFER: string[] = [
  'Any allowance raised to fit — business workspaces, Shorts, prospects, sub-accounts',
  'Done-for-you setup of your first business workspaces and workflows',
  'An onboarding call and a named contact',
  'Integrations scoped and quoted for you',
  'Invoiced billing on request',
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
  login_addresses: 1,
};
export const TRIAL_NAME = 'Free trial';

export const OWNER_LIMITS: Limits = Object.fromEntries(METER_IDS.map(id => [id, UNLIMITED])) as Limits;

/**
 * Prices a plan was sold at before, by plan id — so a renewal at an old price
 * stays on the plan it bought: Starter's $49 / $490; Growth's yearly $970
 * (on sale again as Advanced's since 2026-10-29, kept here regardless);
 * Pro's $197 / $1,970, and $97 when it was called "Agency"; $149 was
 * "Network" and $297 a month or $2,970 a year "Agency" (`agency`).
 *
 * $297 a month is now also Scale's price. A renewal is matched to the plan the
 * subscriber is already on first (billing.ts `planFromEvent`), so an old
 * Agency subscriber renewing at $297 stays on `agency`; a new payment of $297
 * with no plan on record is Scale, because `planByAmount` (current prices)
 * is asked before this list.
 */
export const LEGACY_CENTS: Partial<Record<PlanKey, number[]>> = {
  starter: [4_900, 49_000],
  growth: [97_000],
  pro: [9_700, 19_700, 197_000],
  agency: [14_900, 29_700, 297_000],
};

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
  const p = planDef(planId) ?? planDef('starter')!;
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
  const ladder = CARD_PLANS(plans);
  const at = ladder.findIndex(p => p.id === current.planId);
  /* A legacy plan may sit below what is sold (Starter) or above it (Agency):
     search the whole ladder for the first plan that allows more. */
  const from = current.kind !== 'plan' ? -1 : at;
  for (const p of ladder.slice(from + 1)) {
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

/** "This month's 30 AI Shorts are used (30 of 30) — they start again on 1 November. Advanced includes 100." */
export function refusalText(m: Meter, used: number, limit: number, planName: string, upgrade: { name: string; limit: number } | null, resetsAt = ''): string {
  const what = m.kind === 'monthly'
    ? `This month’s ${num(limit)} ${plural(limit, m.one)} on ${planName} ${limit === 1 ? 'is' : 'are'} used (${num(Math.round(used))} of ${num(limit)})`
    : m.id === 'workflows_per_project'
      ? `This business workspace already has ${num(used)} of the ${num(limit)} ${plural(limit, m.one)} ${planName} allows in one business workspace`
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
    n(L.autopilot_projects, 'AI Autopilot business workspace', 'AI Autopilot business workspaces'),
    `${isUnlimited(L.workflows_per_project) ? 'Unlimited' : `Up to ${num(L.workflows_per_project)}`} workflows per business workspace`,
    `${n(L.ai_shorts, 'AI Short', 'AI Shorts')} and ${n(L.long_videos, 'recording', 'recordings')} processed a month`,
    `${n(L.social_posts, 'social post', 'social posts')} and ${n(L.blog_articles, 'blog article', 'blog articles')} written a month`,
    `${n(L.ai_emails, 'AI-written email', 'AI-written emails')} a month`,
    `${n(L.prospects_found, 'prospect', 'prospects')} found for you a month`,
    `${n(L.ai_requests, 'AI request', 'AI requests')} a month`,
    isUnlimited(L.sub_accounts) ? 'Unlimited client sub-accounts' : `${num(L.sub_accounts)} client sub-account${L.sub_accounts === 1 ? '' : 's'}`,
    `White-label, with ${n(L.login_addresses, 'branded login address', 'branded login addresses')}`,
  ];
}

/* ── The full comparison ─────────────────────────────────────────────────── */

/** A cell: a number or words, `true` (included) or `false` (not included). */
export type Cell = string | boolean;
export interface CompareRow { label: string; note?: string; values: Record<string, Cell> }
export interface CompareGroup { name: string; rows: CompareRow[] }

/** Said once under the table, where a row carries its number. */
export const COMPARE_NOTES: string[] = [
  'Monthly allowances start again on the 1st (UTC) and are shared by every workspace you run.',
  'Custom’s numbers are agreed with you; the ones shown on the plan are where they start.',
  'Your own domain for client logins needs one DNS record and is offered once it is switched on for this platform; the free yourname.protectedcentral.com address works from the first day.',
];

/**
 * Every allowance and feature, plan by plan — generated from the plan table,
 * so the comparison on the site cannot say a number the server does not hold.
 * Features listed as included on every plan are ones the product does not
 * gate by plan.
 */
export function comparison(plans: PlanDef[] = CARD_PLANS()): CompareGroup[] {
  const meter = (id: MeterId, label?: string): CompareRow => {
    const m = meterOf(id)!;
    return {
      label: label ?? m.label, note: m.counted,
      values: Object.fromEntries(plans.map(p => [p.id,
        p.kind === 'custom' && !isUnlimited(p.limits[id]) ? 'Set to fit'
          : isUnlimited(p.limits[id]) ? 'Unlimited'
            : `${formatLimit(p.limits[id], m)}${m.kind === 'monthly' ? ' / mo' : ''}`])),
    };
  };
  const all = (label: string, note?: string): CompareRow => ({ label, ...(note ? { note } : {}), values: Object.fromEntries(plans.map(p => [p.id, true])) });
  const each = (label: string, f: (p: PlanDef) => Cell, note?: string): CompareRow => ({ label, ...(note ? { note } : {}), values: Object.fromEntries(plans.map(p => [p.id, f(p)])) });
  return [
    { name: 'AI Autopilot', rows: [
      meter('autopilot_projects', 'Business workspaces at once'),
      meter('workflows_per_project'),
      meter('ai_requests'),
      meter('social_posts', 'Social posts written for you'),
      meter('blog_articles', 'Blog articles written for you'),
      meter('ai_emails', 'Campaign emails written for you'),
      all('Emails researched from each prospect’s own website'),
      all('Nothing sends until you approve it'),
    ] },
    { name: 'AI Prospecting', rows: [
      meter('prospects_found', 'Prospects found for you daily'),
      all('Live business-directory search'),
      all('Free email checks (format, domain, mail server)'),
      all('A tested search connected to a business workspace'),
    ] },
    { name: 'AI Video Studio', rows: [
      meter('long_videos'),
      meter('ai_shorts'),
      meter('video_minutes'),
      meter('render_minutes'),
      meter('video_storage_gb'),
      all('Captions, thumbnails, chapters and licensed music'),
    ] },
    { name: 'Sell, book and send', rows: [
      all('CRM, pipelines and one inbox'),
      all('Websites and funnels'),
      all('A shop, paid into your own Stripe or Creem'),
      all('Booking page in your visitors’ time zones'),
      all('Email from your own mailbox or provider'),
    ] },
    { name: 'White-label and reselling', rows: [
      all('Your name, logo and colours on every workspace'),
      meter('login_addresses'),
      all('A free yourname.protectedcentral.com login address'),
      all('Your own domain for client logins', 'Needs one DNS record; offered once switched on for this platform.'),
      meter('sub_accounts', 'Client sub-accounts'),
      all('Charge clients on your own Stripe or Creem, at your price'),
      all('Client report links without your prices or contacts'),
    ] },
    { name: 'Help', rows: [
      each('Support', p => p.support),
      each('Done-for-you setup', p => p.kind === 'custom'),
      each('Integrations built for you', p => p.kind === 'custom' ? 'Scoped and quoted' : false),
    ] },
  ];
}

/** Dollars, for display: 4900 → "49", 197000 → "1,970". */
export const dollars = (cents: number) => (cents % 100
  ? (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : (cents / 100).toLocaleString('en-US'));

/** What paying yearly saves, in cents. */
export const annualSaving = (p: Pick<PlanDef, 'monthlyCents' | 'annualCents'>) => p.monthlyCents * 12 - p.annualCents;

export type Interval = 'month' | 'year';

/** The plan a payment of this amount is, when it is exactly one plan's price. */
export function planByAmount(cents: number | undefined, plans: PlanDef[] = PLAN_DEFS): { id: PlanKey; interval: Interval } | null {
  if (!cents) return null;
  for (const p of SOLD_PLANS(plans)) {
    if (p.monthlyCents === cents) return { id: p.id, interval: 'month' };
    if (p.annualCents > 0 && p.annualCents === cents) return { id: p.id, interval: 'year' };
  }
  return null;
}

/** Has this plan ever been sold at this amount? */
export const soldAt = (id: string, cents: number | undefined): boolean => {
  const p = planDef(id);
  return !!p && !!cents && ((p.kind === 'self' && (p.monthlyCents === cents || (p.annualCents > 0 && p.annualCents === cents))) || (LEGACY_CENTS[p.id] ?? []).includes(cents));
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
