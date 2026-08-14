/**
 * Getting the month onto the customer's site.
 *
 * The rules this follows are the ones that matter when software writes to
 * somebody else's live website:
 *
 *   • Nothing is published that a human has not approved. The plan gate from
 *     Part 2 still applies, and a post with failing SEO checks is flagged
 *     before it goes rather than after.
 *   • One post per pass, against a stored job, so an interrupted run cannot
 *     leave the plan and the live site disagreeing about what exists.
 *   • Every result is recorded against the post — remote id, URL, state — so a
 *     second run updates the same post instead of publishing a duplicate. A
 *     duplicate is not a cosmetic problem: two pages with the same content
 *     compete for the same phrase and neither wins.
 *   • Withdrawing sets the remote post back to draft. It never deletes.
 */
import { newId } from './blogAutomation';
import { loadPlans, upsertPlan } from './blogPlanner';
import { postUrl } from './blogExport';
import { getSession } from './auth';
import type {
  Article, BlogProject, MonthPlan, PlannedPost, PublishJob, PublishRecord,
  PublishState, PublishTarget,
} from '../types/blogAutomation';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';
const TARGETS_KEY = 'crm_blog_targets';
const JOBS_KEY = 'crm_blog_publish_jobs';

/* ── Target storage (everything except the credential) ── */

let lastSaveError = '';
export function takePublishSaveError(): string {
  const e = lastSaveError;
  lastSaveError = '';
  return e;
}

function readList<T>(key: string): T[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(raw) ? (raw as T[]) : [];
  } catch { return []; }
}

function writeList(key: string, rows: unknown[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(rows));
    return true;
  } catch (err) {
    console.error('Blog Automation could not save:', err);
    lastSaveError = 'The browser refused to save. Check that storage is not blocked or full.';
    return false;
  }
}

export const loadTargets = (): PublishTarget[] => readList<PublishTarget>(TARGETS_KEY);

export const targetsFor = (projectId: string): PublishTarget[] =>
  loadTargets().filter(t => t.projectId === projectId);

export function upsertTarget(target: PublishTarget): boolean {
  const rows = loadTargets();
  const i = rows.findIndex(t => t.id === target.id);
  const next = { ...target, updatedAt: new Date().toISOString() };
  if (i < 0) rows.unshift(next); else rows[i] = next;
  return writeList(TARGETS_KEY, rows);
}

export const deleteTarget = (id: string): boolean =>
  writeList(TARGETS_KEY, loadTargets().filter(t => t.id !== id));

export function emptyTarget(projectId: string, kind: PublishTarget['kind'], siteUrl = ''): PublishTarget {
  const now = new Date().toISOString();
  return {
    id: newId('tgt'),
    projectId,
    kind,
    name: kind === 'wordpress' ? 'WordPress site' : 'Download a bundle',
    siteUrl: siteUrl.replace(/\/+$/, ''),
    basePath: kind === 'wordpress' ? '' : 'blog',
    createdAt: now,
    updatedAt: now,
  };
}

/* ── Talking to the backend ── */

interface ApiResult { success: boolean; error?: string; [k: string]: unknown }

async function call(action: string, body: Record<string, unknown>): Promise<ApiResult> {
  const session = getSession();
  if (!session) return { success: false, error: 'You are signed out. Sign in again before publishing.' };
  try {
    const res = await fetch(`${API_BASE}/api/blog-publish.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        token: session.token,
        accountId: session.user.accountId ?? '__agency__',
        ...body,
      }),
    });
    if (!res.ok) return { success: false, error: `The publishing endpoint returned ${res.status}.` };
    return (await res.json()) as ApiResult;
  } catch (err) {
    // The most common cause by far, and worth naming rather than showing a
    // bare TypeError: the PHP backend is not running or not deployed.
    return {
      success: false,
      error: `Could not reach the publishing endpoint (${err instanceof Error ? err.message : 'network error'}). Publishing needs the PHP backend — the export bundle works without it.`,
    };
  }
}

export interface ConnectionStatus {
  connected: boolean;
  siteUrl?: string;
  username?: string;
  connectedAs?: string;
  verifiedAt?: string;
  error?: string;
}

/**
 * Save and verify a WordPress connection.
 *
 * The password is sent once and never comes back. WordPress application
 * passwords are generated per-application in Users → Profile and can be
 * revoked there without touching the real login, which is the only sane way to
 * give software write access to a site.
 */
export async function connectWordPress(
  target: PublishTarget, username: string, password: string,
): Promise<ConnectionStatus> {
  const r = await call('connect', {
    targetId: target.id, siteUrl: target.siteUrl, username, password,
  });
  if (!r.success) return { connected: false, error: r.error };
  return {
    connected: true,
    connectedAs: String(r.connectedAs ?? username),
    verifiedAt: String(r.verifiedAt ?? new Date().toISOString()),
  };
}

export async function connectionStatus(target: PublishTarget): Promise<ConnectionStatus> {
  const r = await call('status', { targetId: target.id });
  if (!r.success) return { connected: false, error: r.error };
  return {
    connected: !!r.connected,
    siteUrl: String(r.siteUrl ?? ''),
    username: String(r.username ?? ''),
    connectedAs: String(r.connectedAs ?? ''),
    verifiedAt: String(r.verifiedAt ?? ''),
  };
}

export const disconnect = (target: PublishTarget) => call('disconnect', { targetId: target.id });

/* ── Readiness ── */

export interface PublishBlocker {
  postId: string;
  title: string;
  reason: string;
  /** A failing SEO check is a warning; an unwritten post is a hard stop. */
  fatal: boolean;
}

/**
 * What would go wrong if this were published right now.
 *
 * Failing SEO checks do not block — it is the customer's site and their call,
 * and a thin post is still a post. But they are surfaced by name, because
 * publishing twenty articles and discovering afterwards that none of them had
 * the keyword in the title is the expensive version of finding out.
 */
export function blockers(plan: MonthPlan, project: BlogProject): PublishBlocker[] {
  const out: PublishBlocker[] = [];
  if (plan.status !== 'approved') {
    out.push({ postId: '', title: plan.options.month, reason: 'The plan has not been approved.', fatal: true });
  }
  for (const p of plan.posts) {
    if (!p.article) {
      out.push({ postId: p.id, title: p.title, reason: 'Not written yet.', fatal: true });
      continue;
    }
    if (!p.article.html.trim()) {
      out.push({ postId: p.id, title: p.title, reason: 'The article is empty.', fatal: true });
      continue;
    }
    const failing = p.article.seo.checks.filter(c => !c.ok);
    if (failing.length) {
      out.push({
        postId: p.id,
        title: p.title,
        reason: `${failing.length} SEO check${failing.length === 1 ? '' : 's'} failing: ${failing.map(c => c.label).join(', ')}.`,
        fatal: false,
      });
    }
    const missingAlt = (p.article.images ?? []).filter(i => !i.alt.trim()).length;
    if (missingAlt) {
      out.push({ postId: p.id, title: p.title, reason: `${missingAlt} image without alt text.`, fatal: false });
    }
  }
  void project;
  return out;
}

/* ── Records ── */

export const recordFor = (post: PlannedPost, targetId: string): PublishRecord | undefined =>
  post.published?.[targetId];

export function setRecord(plan: MonthPlan, postId: string, targetId: string, patch: Partial<PublishRecord>): MonthPlan {
  return {
    ...plan,
    posts: plan.posts.map(p => {
      if (p.id !== postId) return p;
      const prev = p.published?.[targetId];
      const next: PublishRecord = {
        postId, targetId,
        state: patch.state ?? prev?.state ?? 'draft',
        remoteId: patch.remoteId ?? prev?.remoteId,
        url: patch.url ?? prev?.url,
        at: patch.at ?? prev?.at,
        error: patch.error,
        updatedAt: new Date().toISOString(),
      };
      return { ...p, published: { ...(p.published ?? {}), [targetId]: next } };
    }),
  };
}

/* ── The job ── */

export const loadPublishJobs = (): PublishJob[] => readList<PublishJob>(JOBS_KEY);

export function upsertPublishJob(job: PublishJob): boolean {
  const rows = loadPublishJobs();
  const i = rows.findIndex(j => j.id === job.id);
  if (i < 0) rows.unshift(job); else rows[i] = job;
  return writeList(JOBS_KEY, rows.slice(0, 20));
}

export const publishJobFor = (planId: string, targetId: string): PublishJob | undefined =>
  loadPublishJobs().find(j => j.planId === planId && j.targetId === targetId);

/**
 * Queue everything not already live on this target.
 *
 * Posts that are already live are included only when their article has changed
 * since — those become updates to the same remote post, never new ones.
 */
export function startPublishJob(plan: MonthPlan, target: PublishTarget, mode: PublishJob['mode']): PublishJob {
  const queue = plan.posts
    .filter(p => {
      if (!p.article) return false;
      const rec = p.published?.[target.id];
      if (!rec) return true;
      if (rec.state === 'failed' || rec.state === 'withdrawn' || rec.state === 'draft') return true;
      // Live or scheduled: only re-send if the article was touched afterwards.
      return !!rec.updatedAt && p.article.writtenAt > rec.updatedAt;
    })
    .map(p => p.id);

  return {
    id: newId('pjob'),
    projectId: plan.projectId,
    planId: plan.id,
    targetId: target.id,
    queue,
    done: [],
    failed: [],
    status: queue.length ? 'running' : 'done',
    mode,
    startedAt: new Date().toISOString(),
    finishedAt: queue.length ? undefined : new Date().toISOString(),
  };
}

export interface PublishPass {
  job: PublishJob;
  post?: PlannedPost;
  url?: string;
  state?: PublishState;
  error?: string;
}

/** When a post is due, as an instant. */
export function dueAt(post: PlannedPost): Date {
  const [h, m] = (post.time || '09:00').split(':').map(Number);
  const d = new Date(`${post.date}T00:00:00`);
  d.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

/**
 * Publish exactly one post, then return.
 *
 * In `schedule` mode a future-dated post is handed to WordPress as a scheduled
 * post rather than held here. That matters: WordPress will publish it on time
 * whether or not this app is open, whereas a queue in a browser tab only runs
 * while somebody is looking at it.
 */
export async function publishNext(
  job: PublishJob, project: BlogProject, target: PublishTarget, now = new Date(),
): Promise<PublishPass> {
  if (job.status !== 'running' || !job.queue.length) return { job: finish(job) };

  const [postId, ...rest] = job.queue;
  const plan = loadPlans().find(p => p.id === job.planId);
  if (!plan) {
    return {
      job: { ...job, queue: [], status: 'cancelled', finishedAt: new Date().toISOString() },
      error: 'The plan being published no longer exists.',
    };
  }

  const post = plan.posts.find(p => p.id === postId);
  if (!post?.article) return { job: advance(job, rest) };

  const article: Article = post.article;
  const due = dueAt(post);
  const future = due.getTime() > now.getTime();
  const status = job.mode === 'now' ? 'publish' : future ? 'future' : 'publish';
  const at = (job.mode === 'now' ? now : due).toISOString();

  const existing = post.published?.[target.id];

  try {
    const r = await call('publish', {
      targetId: target.id,
      slug: article.seo.slug,
      title: post.title,
      html: article.html,
      excerpt: article.seo.metaDescription,
      status,
      date: status === 'future' ? at : undefined,
      remoteId: existing?.remoteId,
    });

    if (!r.success) throw new Error(r.error || 'The site rejected the post.');

    const state: PublishState = status === 'future' ? 'scheduled' : 'live';
    const url = String(r.url ?? postUrl(target, article.seo.slug));
    upsertPlan(setRecord(plan, postId, target.id, {
      state,
      remoteId: r.remoteId ? String(r.remoteId) : existing?.remoteId,
      url,
      at,
      error: undefined,
    }));

    return { job: advance({ ...job, done: [...job.done, postId] }, rest), post, url, state };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    upsertPlan(setRecord(plan, postId, target.id, { state: 'failed', error: message.slice(0, 300) }));
    return {
      job: advance({ ...job, failed: [...job.failed, { postId, title: post.title, error: message.slice(0, 200) }] }, rest),
      post,
      error: message,
    };
  }
}

const advance = (job: PublishJob, queue: string[]): PublishJob =>
  queue.length ? { ...job, queue } : finish({ ...job, queue });

const finish = (job: PublishJob): PublishJob =>
  job.status === 'running' ? { ...job, status: 'done', finishedAt: new Date().toISOString() } : job;

export const cancelPublishJob = (job: PublishJob): PublishJob =>
  ({ ...job, status: 'cancelled', queue: [], finishedAt: new Date().toISOString() });

/** Take one post back off the site, without destroying it. */
export async function withdraw(plan: MonthPlan, post: PlannedPost, target: PublishTarget): Promise<{ ok: boolean; error?: string }> {
  const rec = post.published?.[target.id];
  if (!rec?.remoteId) return { ok: false, error: 'There is no record of this post on that site.' };

  const r = await call('withdraw', { targetId: target.id, remoteId: rec.remoteId });
  if (!r.success) return { ok: false, error: r.error };

  upsertPlan(setRecord(plan, post.id, target.id, { state: 'withdrawn', error: undefined }));
  return { ok: true };
}

/* ── Reporting ── */

export interface PublishProgress {
  live: number;
  scheduled: number;
  failed: number;
  remaining: number;
  total: number;
  percent: number;
}

export function publishProgress(plan: MonthPlan, targetId: string): PublishProgress {
  const written = plan.posts.filter(p => p.article);
  const state = (p: PlannedPost) => p.published?.[targetId]?.state;
  const live = written.filter(p => state(p) === 'live').length;
  const scheduled = written.filter(p => state(p) === 'scheduled').length;
  const failed = written.filter(p => state(p) === 'failed').length;
  const total = written.length;
  return {
    live, scheduled, failed,
    remaining: total - live - scheduled - failed,
    total,
    percent: total ? Math.round(((live + scheduled) / total) * 100) : 0,
  };
}
