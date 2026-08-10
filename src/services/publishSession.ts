/**
 * A run through a campaign's publish queue.
 *
 * Kept on disk rather than in component state for the same reason the generator
 * is: publishing thirty posts is a long sitting, and closing the tab halfway
 * through must not lose which ones already went out. Reopening picks up at the
 * next unfinished job.
 */
import {
  loadAssets, loadJobs, loadSessions, newId, saveAssets, saveJobs, saveSessions, updateCampaign,
} from './socialAutomation';
import type {
  Campaign, CampaignAsset, PublishJob, PublishSession, PublishStatus,
} from '../types/socialAutomation';

/** Give up after this many tries so a broken platform cannot loop forever. */
export const MAX_ATTEMPTS = 3;

/* ── Sessions ── */

export function sessionFor(campaignId: string): PublishSession | undefined {
  return loadSessions().find(s => s.campaignId === campaignId && s.status !== 'done' && s.status !== 'cancelled');
}

function putSession(session: PublishSession): PublishSession {
  const rows = loadSessions().filter(s => s.id !== session.id);
  saveSessions([session, ...rows].slice(0, 20));
  return session;
}

/**
 * Start (or resume) a run. Jobs are ordered by their scheduled slot when there
 * is one, so an unattended sitting follows the plan rather than the order the
 * assets happened to be written in.
 */
export function startSession(campaign: Campaign): PublishSession {
  const existing = sessionFor(campaign.id);
  if (existing) return existing;

  const jobs = loadJobs()
    .filter(j => j.campaignId === campaign.id)
    .filter(j => j.status === 'queued' || j.status === 'failed')
    .sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''));

  const session: PublishSession = {
    id: newId('sess'),
    campaignId: campaign.id,
    startedAt: new Date().toISOString(),
    order: jobs.map(j => j.id),
    cursor: 0,
    status: 'running',
  };
  updateCampaign(campaign.id, { status: 'publishing' });
  return putSession(session);
}

export function currentJob(session: PublishSession): PublishJob | undefined {
  const id = session.order[session.cursor];
  return loadJobs().find(j => j.id === id);
}

export function assetForJob(job: PublishJob): CampaignAsset | undefined {
  return loadAssets().find(a => a.id === job.assetId);
}

/* ── Recording what happened ── */

function setJob(jobId: string, patch: Partial<PublishJob>): PublishJob | undefined {
  const jobs = loadJobs();
  const idx = jobs.findIndex(j => j.id === jobId);
  if (idx < 0) return undefined;
  jobs[idx] = { ...jobs[idx], ...patch };
  saveJobs(jobs);
  return jobs[idx];
}

function setAssetStatus(assetId: string, status: CampaignAsset['status']): void {
  saveAssets(loadAssets().map(a => (
    a.id === assetId ? { ...a, status, updatedAt: new Date().toISOString() } : a
  )));
}

/** Mark the composer as opened, which is the last thing this app can observe. */
export function markOpened(jobId: string): void {
  const job = loadJobs().find(j => j.id === jobId);
  if (!job) return;
  setJob(jobId, { status: 'opened', openedAt: new Date().toISOString(), attempts: job.attempts + 1 });
}

/**
 * The user confirming they posted it. Only they can know — the platform never
 * tells us — so this is a claim recorded honestly rather than a detection.
 */
export function markPublished(jobId: string, permalink?: string): void {
  const job = setJob(jobId, {
    status: 'published',
    publishedAt: new Date().toISOString(),
    permalink: permalink?.trim() || undefined,
  });
  if (job) setAssetStatus(job.assetId, 'published');
}

export function markFailed(jobId: string, error: string): void {
  const job = setJob(jobId, { status: 'failed', lastError: error.slice(0, 200) });
  if (job) setAssetStatus(job.assetId, 'failed');
}

export function markSkipped(jobId: string): void {
  const job = setJob(jobId, { status: 'skipped' });
  if (job) setAssetStatus(job.assetId, 'ready');
}

/** Move to the next job, finishing the session when the queue runs out. */
export function advance(session: PublishSession): PublishSession {
  const next = session.cursor + 1;
  if (next >= session.order.length) return finishSession(session);
  return putSession({ ...session, cursor: next });
}

export function finishSession(session: PublishSession): PublishSession {
  const jobs = loadJobs().filter(j => j.campaignId === session.campaignId);
  const published = jobs.filter(j => j.status === 'published').length;
  const failed = jobs.filter(j => j.status === 'failed').length;

  updateCampaign(session.campaignId, {
    status: published === 0 ? 'ready' : failed > 0 || published < jobs.length ? 'partial' : 'published',
  });
  return putSession({ ...session, status: 'done', finishedAt: new Date().toISOString() });
}

export function cancelSession(session: PublishSession): PublishSession {
  updateCampaign(session.campaignId, { status: 'ready' });
  return putSession({ ...session, status: 'cancelled', finishedAt: new Date().toISOString() });
}

/* ── Retrying ── */

export interface RetryResult {
  ok: boolean;
  retried: number;
  error?: string;
}

/**
 * Put failed jobs back in the queue. Anything that has already had its three
 * goes stays failed — a post that will not go out needs a person looking at it,
 * not a fourth automatic attempt.
 */
export function retryFailed(campaignId: string): RetryResult {
  const jobs = loadJobs();
  const failed = jobs.filter(j => j.campaignId === campaignId && j.status === 'failed');
  if (failed.length === 0) return { ok: false, retried: 0, error: 'Nothing has failed.' };

  const eligible = failed.filter(j => j.attempts < MAX_ATTEMPTS);
  if (eligible.length === 0) {
    return {
      ok: false,
      retried: 0,
      error: `All ${failed.length} failed posts have had ${MAX_ATTEMPTS} attempts. Edit them under Review, then schedule again.`,
    };
  }

  const ids = new Set(eligible.map(j => j.id));
  saveJobs(jobs.map(j => (ids.has(j.id) ? { ...j, status: 'queued' as PublishStatus, lastError: undefined } : j)));
  saveAssets(loadAssets().map(a => (
    eligible.some(j => j.assetId === a.id) ? { ...a, status: 'scheduled' as const } : a
  )));
  return { ok: true, retried: eligible.length };
}

/* ── Progress ── */

export interface SessionProgress {
  total: number;
  done: number;
  published: number;
  failed: number;
  skipped: number;
  percent: number;
}

export function sessionProgress(session: PublishSession): SessionProgress {
  const jobs = loadJobs();
  const mine = session.order.map(id => jobs.find(j => j.id === id)).filter((j): j is PublishJob => !!j);
  const published = mine.filter(j => j.status === 'published').length;
  const failed = mine.filter(j => j.status === 'failed').length;
  const skipped = mine.filter(j => j.status === 'skipped').length;
  const done = published + failed + skipped;
  return {
    total: session.order.length,
    done,
    published,
    failed,
    skipped,
    percent: session.order.length ? Math.round((done / session.order.length) * 100) : 0,
  };
}
