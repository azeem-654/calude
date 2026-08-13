/**
 * Writing a month, one post at a time.
 *
 * A month is twenty-odd articles and, with a model behind it, twenty-odd API
 * calls that take a few seconds each. Holding that in a promise means a closed
 * tab, a refresh or a flat battery loses the lot and bills for it twice. So the
 * job is a record in storage rather than a loop in memory: each pass writes
 * exactly one post, saves the article onto the plan, moves the id from the
 * queue to done, and returns. Reopening the module picks up at the next
 * unwritten post with everything already written still there.
 *
 * A post that fails is recorded with the reason and skipped rather than
 * stopping the run — one model refusal should not cost the other nineteen
 * articles — and the failures are listed so they can be retried on their own.
 */
import { newId } from './blogAutomation';
import { loadPlans, planFor, upsertPlan } from './blogPlanner';
import { unwritten, writeWithAI } from './blogWriter';
import type { BlogProject, MonthPlan, PlannedPost, WriteJob } from '../types/blogAutomation';

const JOBS_KEY = 'crm_blog_write_jobs';

/* ── Storage ── */

export function loadJobs(): WriteJob[] {
  try {
    const raw = JSON.parse(localStorage.getItem(JOBS_KEY) || '[]');
    return Array.isArray(raw) ? (raw as WriteJob[]) : [];
  } catch { return []; }
}

let lastSaveError = '';

export function takeJobSaveError(): string {
  const e = lastSaveError;
  lastSaveError = '';
  return e;
}

export function saveJobs(rows: WriteJob[]): boolean {
  try {
    localStorage.setItem(JOBS_KEY, JSON.stringify(rows));
    return true;
  } catch (err) {
    const quota = err instanceof DOMException
      && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    console.error('Blog Automation could not save the writing job:', err);
    lastSaveError = quota
      ? 'Your browser storage is full. Delete an old plan to free space — the articles already written are safe, but nothing new can be saved until you do.'
      : 'The browser refused to save the writing job. Check that storage is not blocked for this site.';
    return false;
  }
}

export function upsertJob(job: WriteJob): boolean {
  const rows = loadJobs();
  const i = rows.findIndex(j => j.id === job.id);
  if (i < 0) rows.unshift(job); else rows[i] = job;
  // Jobs are a work log, not an archive. Keeping the last 20 stops a busy
  // account slowly filling its storage quota with finished runs.
  return saveJobs(rows.slice(0, 20));
}

export const jobForPlan = (planId: string): WriteJob | undefined =>
  loadJobs().find(j => j.planId === planId);

export function deleteJob(id: string): boolean {
  return saveJobs(loadJobs().filter(j => j.id !== id));
}

/* ── Running ── */

/**
 * Queue everything in the plan that has no article yet.
 *
 * Posts already written are left alone. Rewriting one is a deliberate act on
 * that post, never a side effect of pressing "write the month" again, because
 * a human may have spent an hour editing it.
 */
export function startJob(plan: MonthPlan, only?: string[]): WriteJob {
  const queue = (only ?? unwritten(plan).map(p => p.id))
    // Publishing order, so what gets written first is what goes out first.
    .slice()
    .sort((a, b) => {
      const pa = plan.posts.findIndex(p => p.id === a);
      const pb = plan.posts.findIndex(p => p.id === b);
      return pa - pb;
    });

  return {
    id: newId('wjob'),
    projectId: plan.projectId,
    planId: plan.id,
    queue,
    done: [],
    failed: [],
    status: queue.length ? 'running' : 'done',
    startedAt: new Date().toISOString(),
    finishedAt: queue.length ? undefined : new Date().toISOString(),
  };
}

export interface PassResult {
  job: WriteJob;
  /** The post this pass handled, if there was one left. */
  post?: PlannedPost;
  /** Set when the post could not be written and was recorded as a failure. */
  error?: string;
  /** Set when the article was saved but the plan could not be persisted. */
  saveError?: string;
}

/**
 * Write exactly one post, then return.
 *
 * One unit per call is what makes the job resumable and what keeps the UI
 * responsive and cancellable between posts. The caller drives the loop and can
 * stop it at any point without leaving anything half-written.
 */
export async function writeNextPost(job: WriteJob, project: BlogProject): Promise<PassResult> {
  if (job.status !== 'running' || !job.queue.length) {
    return { job: finish(job) };
  }

  const [postId, ...rest] = job.queue;
  const plan = loadPlan(job.planId);
  if (!plan) {
    // The plan was deleted while the job was running. Nothing left to write to.
    return {
      job: { ...finish(job), queue: [], status: 'cancelled' },
      error: 'The plan this job was writing to no longer exists.',
    };
  }

  const post = plan.posts.find(p => p.id === postId);
  if (!post) {
    // The post was removed from the plan mid-run. Drop it quietly.
    return { job: advance(job, rest) };
  }

  try {
    const article = await writeWithAI(post, project);
    const nextPlan: MonthPlan = {
      ...plan,
      posts: plan.posts.map(p => (p.id === postId ? { ...p, article, status: 'written' as const } : p)),
    };
    const saved = upsertPlan(nextPlan);
    return {
      job: advance({ ...job, done: [...job.done, postId] }, rest),
      post,
      saveError: saved ? undefined : 'The article was written but could not be saved.',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      job: advance({ ...job, failed: [...job.failed, { postId, title: post.title, error: message.slice(0, 200) }] }, rest),
      post,
      error: message,
    };
  }
}

const advance = (job: WriteJob, queue: string[]): WriteJob =>
  queue.length ? { ...job, queue } : finish({ ...job, queue });

const finish = (job: WriteJob): WriteJob =>
  job.status === 'running'
    ? { ...job, status: 'done', finishedAt: new Date().toISOString() }
    : job;

export const cancelJob = (job: WriteJob): WriteJob =>
  ({ ...job, status: 'cancelled', queue: [], finishedAt: new Date().toISOString() });

/**
 * Read the plan fresh on every pass rather than closing over it.
 *
 * A pass takes seconds, and in that time the plan may have been edited in
 * another tab or by the previous pass itself. Re-reading means each article is
 * saved onto the current plan instead of an older copy that would silently drop
 * whatever changed in between.
 */
const loadPlan = (planId: string): MonthPlan | undefined =>
  loadPlans().find(p => p.id === planId);

/** So a caller that only has a project and a month does not need the plan id. */
export const jobForMonth = (projectId: string, month: string): WriteJob | undefined => {
  const plan = planFor(projectId, month);
  return plan ? jobForPlan(plan.id) : undefined;
};

export interface JobProgress {
  written: number;
  failed: number;
  remaining: number;
  total: number;
  percent: number;
}

export function jobProgress(job: WriteJob): JobProgress {
  const written = job.done.length;
  const failed = job.failed.length;
  const remaining = job.queue.length;
  const total = written + failed + remaining;
  return {
    written,
    failed,
    remaining,
    total,
    percent: total ? Math.round(((written + failed) / total) * 100) : 0,
  };
}
