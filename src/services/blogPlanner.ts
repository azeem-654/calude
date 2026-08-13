/**
 * A month of posts, planned to rank.
 *
 * Two halves, both of which decide whether the plan is worth anything.
 *
 * The scheduling half is arithmetic: real dates in the chosen month, on the
 * chosen weekdays, never in the past, never two in one slot.
 *
 * The strategy half is where a content plan usually goes wrong, and it comes
 * down to three rules:
 *
 *   1. One keyword per post. Two posts chasing the same phrase compete with
 *      each other in the index — Google picks one and the other's work is
 *      wasted. This is the most common way a plan quietly fails.
 *   2. A cluster's pillar publishes before its supporting posts, so that when
 *      the supporting posts link up to it, there is something to link to.
 *   3. Every post points at a money page. A post that links nowhere ranks for
 *      itself and moves no revenue.
 *
 * All three are enforced when the plan is built and re-checked afterwards by
 * `auditPlan`, so a hand-edited plan cannot silently break them either.
 */
import { getGeminiKey } from '../lib/gemini';
import { newId } from './blogAutomation';
import { inlinePhrase } from './blogWriter';
import type {
  BlogProject, Keyword, MonthPlan, PlanAudit, PlanOptions, PlannedPost, TopicCluster,
} from '../types/blogAutomation';

const PLANS_KEY = 'crm_blog_plans';

/* ── Storage ── */

export function loadPlans(): MonthPlan[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PLANS_KEY) || '[]');
    return Array.isArray(raw) ? (raw as MonthPlan[]) : [];
  } catch { return []; }
}

let lastSaveError = '';

export function takePlanSaveError(): string {
  const e = lastSaveError;
  lastSaveError = '';
  return e;
}

export function savePlans(rows: MonthPlan[]): boolean {
  try {
    localStorage.setItem(PLANS_KEY, JSON.stringify(rows));
    return true;
  } catch (err) {
    const quota = err instanceof DOMException
      && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    console.error('Blog Automation could not save the plan:', err);
    lastSaveError = quota
      ? 'Your browser storage is full. Delete an old plan to free space — nothing new can be saved until you do.'
      : 'The browser refused to save the plan. Check that storage is not blocked for this site.';
    return false;
  }
}

export function upsertPlan(plan: MonthPlan): boolean {
  const rows = loadPlans();
  const i = rows.findIndex(p => p.id === plan.id);
  const next = { ...plan, updatedAt: new Date().toISOString() };
  if (i < 0) rows.unshift(next); else rows[i] = next;
  return savePlans(rows);
}

export const planFor = (projectId: string, month: string): MonthPlan | undefined =>
  loadPlans().find(p => p.projectId === projectId && p.options.month === month);

export const plansForProject = (projectId: string): MonthPlan[] =>
  loadPlans().filter(p => p.projectId === projectId);

export function deletePlan(id: string): boolean {
  return savePlans(loadPlans().filter(p => p.id !== id));
}

/* ── Dates ── */

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date — never toISOString, which is UTC. */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/**
 * Every publishable date in the month, in order.
 *
 * `from` excludes days already gone: planning the current month must not
 * schedule posts into last Tuesday, which would arrive already overdue.
 */
export function slotsInMonth(month: string, weekdays: number[], from = new Date()): string[] {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return [];
  const days = weekdays.length ? [...new Set(weekdays)].filter(d => d >= 0 && d <= 6) : [1, 3];
  const out: string[] = [];
  const cursor = new Date(y, m - 1, 1);
  const floor = ymd(from);
  while (cursor.getMonth() === m - 1) {
    if (days.includes(cursor.getDay())) {
      const day = ymd(cursor);
      if (day >= floor) out.push(day);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** How many posts a cadence asks for across the slots actually available. */
export function slotsWanted(month: string, cadence: number, weekdays: number[], from = new Date()): number {
  const available = slotsInMonth(month, weekdays, from).length;
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return 0;
  const daysInMonth = new Date(y, m, 0).getDate();
  const weeks = daysInMonth / 7;
  return Math.max(0, Math.min(available, Math.round(Math.max(1, cadence) * weeks)));
}

/* ── Choosing what to write about ── */

export interface Pick {
  cluster: TopicCluster;
  keyword: Keyword;
  role: 'pillar' | 'supporting';
}

/**
 * Which keywords get a post, in the order they should publish.
 *
 * Depth, not breadth. The obvious approach — one post per cluster, round-robin
 * — produces a month of five pillar posts on the five hardest terms in the
 * strategy, which is the worst possible opening for a site with no authority.
 * It was what the first version did, and it showed: every title came out "X: a
 * complete guide" on a term nobody new can win.
 *
 * So each cluster gets a burst instead: its pillar, then its easiest supporting
 * long-tail, before the planner moves on. That gives a month that is mostly
 * winnable terms with a pillar for them to link up to, which is how topical
 * authority is actually built.
 */
export function pickKeywords(project: BlogProject, count: number, burst = 4): Pick[] {
  const used = new Set<string>();
  const queues = project.clusters.map(cluster => {
    const sorted = [...cluster.keywords].sort((a, b) => a.difficulty - b.difficulty);
    // The pillar post targets the cluster's own pillar phrase when that phrase
    // is one of its keywords, and otherwise the hardest term in it — the
    // broadest thing the cluster can plausibly own.
    const pillarTerm = sorted.find(k => k.term.toLowerCase() === cluster.pillar.toLowerCase())
      ?? [...sorted].sort((a, b) => b.difficulty - a.difficulty)[0];
    const rest = sorted.filter(k => k.term !== pillarTerm?.term);
    return { cluster, queue: pillarTerm ? [pillarTerm, ...rest] : rest, first: true };
  });

  const picks: Pick[] = [];
  const size = Math.max(1, burst);

  // A burst per cluster: pillar first so the supporting posts have something to
  // link up to, then the easiest terms it owns.
  while (picks.length < count && queues.some(q => q.queue.length)) {
    let progressed = false;
    for (const q of queues) {
      if (picks.length >= count) break;
      for (let n = 0; n < size && picks.length < count; n++) {
        let keyword: Keyword | undefined;
        while ((keyword = q.queue.shift())) {
          if (!used.has(keyword.term.toLowerCase())) break;
        }
        if (!keyword) break;
        used.add(keyword.term.toLowerCase());
        picks.push({ cluster: q.cluster, keyword, role: q.first ? 'pillar' : 'supporting' });
        q.first = false;
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return picks;
}

/* ── Drafting a post ── */

const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** A headline from the keyword, without inventing claims we cannot support. */
export function draftTitle(keyword: string, role: 'pillar' | 'supporting', location = ''): string {
  const k = keyword.trim().toLowerCase();
  /* Long-tail keywords are lower-cased throughout, so a place name inside one
     comes out as "combi boiler in bristol". Capitalise it back — a title that
     miscases the customer's own town is the first thing they notice. */
  const fixCase = (title: string) => {
    const place = location.trim();
    if (!place) return title;
    return title.replace(new RegExp(`\\b${place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'ig'), place);
  };
  if (/^how much do(es)? /.test(k)) return fixCase(capitalise(k.replace(/\?$/, '')) + '?');
  if (/^(how to|what is|why|when|which)\b/.test(k)) return fixCase(capitalise(k));
  if (/^best /.test(k)) return fixCase(`${capitalise(k)}: what to look for`);
  if (/ checklist$/.test(k)) return fixCase(`${capitalise(k)}: the one we use`);
  if (/^common .* mistakes$/.test(k)) return fixCase(`${capitalise(k)} — and how to avoid them`);
  if (/ near me$/.test(k)) return fixCase(capitalise(k.replace(/ near me$/, '')) + (location ? ` in ${location}` : '') + ': how to choose');
  if (role === 'pillar') return fixCase(`${capitalise(k)}: a complete guide`);
  return fixCase(capitalise(k));
}

/**
 * The line the post argues, so Part 3 has a point of view rather than filler.
 *
 * The profile fields are distilled from prose and can come back as whole
 * sentences rather than the short phrases these slots expect. Splicing one in
 * produces an angle like "…for Our pricing is published on the site: one price,
 * no callout fee., written by…", which then opens every article written from
 * it. Anything not phrase-shaped is dropped instead.
 */
export function draftAngle(keyword: string, project: BlogProject, role: 'pillar' | 'supporting'): string {
  const who = inlinePhrase(project.seo.audience) || 'the reader';
  const what = inlinePhrase(project.seo.offering, 12);
  return role === 'pillar'
    ? `The definitive answer on "${keyword}" for ${who}${what ? `, written by someone who does this: ${what}` : ''}.`
    : `A short, direct answer to "${keyword}" that sends the reader on to the service page when they are ready.`;
}

/** Headings, so a writer has a shape and the post covers what a searcher wants. */
export function draftOutline(keyword: string, role: 'pillar' | 'supporting'): string[] {
  const k = keyword.trim().toLowerCase();
  if (role === 'pillar') {
    return [
      `What "${k}" actually means`,
      'The short answer',
      'What it depends on',
      'What most people get wrong',
      'How to decide',
      'When to bring someone in',
    ];
  }
  if (/^how much/.test(k)) return ['The honest range', 'What moves the price', 'What is included', 'How to get a firm number'];
  if (/^how to/.test(k)) return ['Before you start', 'Step by step', 'Where it goes wrong', 'When to stop and call someone'];
  if (/mistakes$/.test(k)) return ['The five we see most', 'Why each one costs money', 'What to do instead'];
  if (/checklist$/.test(k)) return ['The checklist', 'How to use it', 'What to do with the results'];
  return ['The short answer', 'The detail', 'What to do next'];
}

/** Pillars earn a long, thorough piece; supporting posts answer and get out. */
const wordsFor = (role: 'pillar' | 'supporting') => (role === 'pillar' ? 1800 : 900);

/* ── Building the plan ── */

export interface BuildResult {
  plan: MonthPlan;
  /** Said out loud when the month wanted more posts than there are keywords. */
  shortfall: number;
}

export function buildPlan(
  project: BlogProject,
  options: PlanOptions,
  now = new Date(),
): BuildResult {
  const slots = slotsInMonth(options.month, options.weekdays, now);
  const wanted = slotsWanted(options.month, options.cadence, options.weekdays, now);
  const picks = pickKeywords(project, wanted);

  const posts: PlannedPost[] = picks.map((pick, i) => ({
    id: newId('post'),
    clusterId: pick.cluster.id,
    primaryKeyword: pick.keyword.term,
    // The rest of the cluster gives the post its supporting vocabulary without
    // ever becoming a second thing it competes for.
    secondaryKeywords: pick.cluster.keywords
      .filter(k => k.term !== pick.keyword.term)
      .slice(0, 4)
      .map(k => k.term),
    title: draftTitle(pick.keyword.term, pick.role, project.seo.location),
    angle: draftAngle(pick.keyword.term, project, pick.role),
    outline: draftOutline(pick.keyword.term, pick.role),
    role: pick.role,
    targetWords: wordsFor(pick.role),
    // Falls back to the first money page: a post with nowhere to link is a post
    // that cannot move revenue, and silently leaving it blank hides that.
    moneyPageId: pick.cluster.targetPageId ?? project.moneyPages[0]?.id,
    date: slots[i] ?? slots[slots.length - 1] ?? ymd(now),
    time: options.time || '09:00',
    status: 'planned',
  }));

  return {
    plan: {
      id: newId('plan'),
      projectId: project.id,
      options,
      posts,
      status: 'draft',
      planSource: 'heuristic',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    shortfall: Math.max(0, wanted - posts.length),
  };
}

/* ── Checking a plan ── */

/**
 * Re-derives the three rules from the plan as it now stands.
 *
 * Building enforces them, but a plan is editable — retitle, reschedule, add
 * your own — and an edit can break one without anyone noticing. So the checks
 * run against the current state rather than trusting how it was made.
 */
export function auditPlan(plan: MonthPlan, project: BlogProject): PlanAudit {
  const seen = new Map<string, number>();
  for (const p of plan.posts) {
    const k = p.primaryKeyword.trim().toLowerCase();
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const cannibalised = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);

  const pillarsOutOfOrder: string[] = [];
  for (const cluster of project.clusters) {
    const mine = plan.posts.filter(p => p.clusterId === cluster.id);
    const pillar = mine.find(p => p.role === 'pillar');
    if (!pillar) continue;
    const when = `${pillar.date} ${pillar.time}`;
    const earlier = mine.some(p => p.role === 'supporting' && `${p.date} ${p.time}` < when);
    if (earlier) pillarsOutOfOrder.push(cluster.pillar);
  }

  const difficulties = plan.posts.map(p => {
    const cluster = project.clusters.find(c => c.id === p.clusterId);
    return cluster?.keywords.find(k => k.term === p.primaryKeyword)?.difficulty ?? 50;
  });

  return {
    posts: plan.posts.length,
    distinctKeywords: seen.size,
    cannibalised,
    pillarsOutOfOrder,
    withoutMoneyPage: plan.posts.filter(p => !p.moneyPageId).length,
    averageDifficulty: difficulties.length
      ? Math.round(difficulties.reduce((a, b) => a + b, 0) / difficulties.length)
      : 0,
    clustersCovered: new Set(plan.posts.map(p => p.clusterId)).size,
  };
}

/* ── Rescheduling ── */

/**
 * Lay the posts back onto the month's slots in their current order.
 *
 * Used after a reorder or a cadence change. Order is the strategy — pillars
 * before their supporting posts — so this preserves it and only moves the
 * dates.
 */
export function reflow(plan: MonthPlan, now = new Date()): MonthPlan {
  const slots = slotsInMonth(plan.options.month, plan.options.weekdays, now);
  return {
    ...plan,
    posts: plan.posts.map((p, i) => ({
      ...p,
      date: slots[i] ?? slots[slots.length - 1] ?? p.date,
      time: plan.options.time || p.time,
    })),
  };
}

/* ── The AI pass ── */

const MODEL = 'gemini-2.0-flash';

interface RawPost {
  keyword?: string;
  title?: string;
  angle?: string;
  outline?: string[];
}

/**
 * Better titles, angles and outlines for the posts already chosen.
 *
 * Deliberately narrow: the model is asked to write headlines for a keyword
 * list it is given, not to choose the keywords. Keyword choice is where the
 * cannibalisation and pillar-order rules live, and those are not negotiable by
 * a model that cannot see the whole plan.
 */
export async function enrichPlanWithAI(plan: MonthPlan, project: BlogProject): Promise<MonthPlan> {
  const key = getGeminiKey();
  if (!key) {
    return { ...plan, note: 'No Gemini key configured — titles and outlines written from the keywords. Add a key in Settings → AI for sharper ones.' };
  }
  if (!plan.posts.length) return plan;

  const prompt = `You are an SEO editor. For each keyword below write a headline, a one-line angle and 4-6 H2 headings.

Business: ${project.seo.offering || 'unknown'}
Audience: ${project.seo.audience || 'unknown'}
${project.seo.location ? `Location: ${project.seo.location}` : ''}
Tone: ${project.voice.tone || 'plain'}, ${project.voice.readingLevel} reading level, written as "${project.voice.person}".
${project.voice.avoid.length ? `Never use these words: ${project.voice.avoid.join(', ')}.` : ''}

Keywords, in publishing order:
${plan.posts.map((p, i) => `${i + 1}. ${p.primaryKeyword} (${p.role})`).join('\n')}

Return JSON only: { "posts": [ { "keyword": "...", "title": "...", "angle": "...", "outline": ["...","..."] } ] }
The headline must read like something a person would click, must contain the
keyword or a close variant, and must not promise a number the business has not
given you.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6, responseMimeType: 'application/json' },
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini returned ${res.status}`);
    const data = await res.json();
    const raw = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}') as { posts?: RawPost[] };
    const byKeyword = new Map<string, RawPost>();
    for (const p of raw.posts ?? []) {
      if (typeof p?.keyword === 'string') byKeyword.set(p.keyword.trim().toLowerCase(), p);
    }

    const str = (v: unknown, fallback: string, max = 160) =>
      (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback);

    return {
      ...plan,
      planSource: 'ai',
      note: undefined,
      posts: plan.posts.map(post => {
        // A human's edit outranks a regeneration, always.
        if (post.edited) return post;
        const got = byKeyword.get(post.primaryKeyword.trim().toLowerCase());
        if (!got) return post;
        const outline = (Array.isArray(got.outline) ? got.outline : [])
          .filter((h): h is string => typeof h === 'string' && !!h.trim())
          .map(h => h.trim().slice(0, 120))
          .slice(0, 8);
        return {
          ...post,
          title: str(got.title, post.title, 120),
          angle: str(got.angle, post.angle, 240),
          outline: outline.length ? outline : post.outline,
        };
      }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ...plan, note: `The AI pass failed (${message.slice(0, 140)}). Titles written from the keywords instead.` };
  }
}
