/**
 * The generation pipeline.
 *
 * Built as one-unit-of-work-per-call rather than a long async function, for the
 * same reason the verification queue was: analysing four videos can take
 * minutes, and a user who reloads mid-run must not lose the work or, worse,
 * silently start it again. Every call advances the job by one step and writes
 * the result, so progress is a fact on disk rather than a variable in a closure.
 */
import { analyseSource, type CampaignAnalysis } from './campaignAnalysis';
import { composeAll } from './campaignComposer';
import {
  assetCounts, getCampaign, loadAssets, saveAssets, updateCampaign,
} from './socialAutomation';
import type { Campaign } from '../types/socialAutomation';

const JOBS_KEY = 'crm_sa_generation';

export type Phase = 'analyse' | 'compose' | 'done';

export interface GenerationJob {
  campaignId: string;
  phase: Phase;
  status: 'running' | 'done' | 'failed';
  /** Index of the source being worked on. */
  cursor: number;
  total: number;
  /** What is happening right now, in words a user would use. */
  message: string;
  analyses: CampaignAnalysis[];
  startedAt: string;
  updatedAt: string;
  error?: string;
  /** Set when any source fell back to the text analyser. */
  degraded?: string;
}

/* ── Store ── */

function loadJobs(): GenerationJob[] {
  try {
    const raw = JSON.parse(localStorage.getItem(JOBS_KEY) || '[]');
    return Array.isArray(raw) ? (raw as GenerationJob[]) : [];
  } catch { return []; }
}

function saveJobs(rows: GenerationJob[]): void {
  try { localStorage.setItem(JOBS_KEY, JSON.stringify(rows)); } catch { /* quota */ }
}

export function getJob(campaignId: string): GenerationJob | undefined {
  return loadJobs().find(j => j.campaignId === campaignId);
}

function putJob(job: GenerationJob): GenerationJob {
  const rows = loadJobs().filter(j => j.campaignId !== job.campaignId);
  const next = { ...job, updatedAt: new Date().toISOString() };
  // Keep the store small; a finished job is only interesting until the next run.
  saveJobs([next, ...rows].slice(0, 20));
  return next;
}

export function clearJob(campaignId: string): void {
  saveJobs(loadJobs().filter(j => j.campaignId !== campaignId));
}

/** Fraction complete, counting analysis and composition as equal halves. */
export function jobProgress(job: GenerationJob): number {
  if (job.status === 'done') return 1;
  if (job.total === 0) return 0;
  const analysed = Math.min(job.cursor, job.total) / job.total;
  return job.phase === 'analyse' ? analysed * 0.7 : 0.7 + (job.cursor / job.total) * 0.3;
}

/* ── Running ── */

export function startGeneration(campaign: Campaign): GenerationJob {
  // Composing again would otherwise stack a second set of posts on the first.
  saveAssets(loadAssets().filter(a => a.campaignId !== campaign.id));
  updateCampaign(campaign.id, { status: 'generating', error: undefined });
  return putJob({
    campaignId: campaign.id,
    phase: 'analyse',
    status: 'running',
    cursor: 0,
    total: campaign.sources.length,
    message: `Watching ${campaign.sources[0]?.name ?? 'the video'}…`,
    analyses: [],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Advance the job by one step and return it. Safe to call repeatedly; calling
 * it on a finished job is a no-op rather than an error, so a component that
 * re-renders cannot re-run the tail of the pipeline.
 */
export async function runGenerationPass(campaignId: string): Promise<GenerationJob | null> {
  const job = getJob(campaignId);
  if (!job || job.status !== 'running') return job ?? null;

  const campaign = getCampaign(campaignId);
  if (!campaign) {
    return putJob({ ...job, status: 'failed', error: 'The campaign no longer exists.' });
  }

  try {
    if (job.phase === 'analyse') {
      const source = campaign.sources[job.cursor];
      if (!source) {
        return putJob({ ...job, phase: 'compose', cursor: 0, message: 'Writing the posts…' });
      }
      const analysis = await analyseSource(campaign, source);
      const analyses = [...job.analyses, analysis];
      const cursor = job.cursor + 1;
      const degraded = analysis.source === 'heuristic'
        ? (analysis.note ?? 'Written from the title and description.')
        : job.degraded;

      const moreToWatch = cursor < campaign.sources.length;
      return putJob({
        ...job,
        analyses,
        cursor: moreToWatch ? cursor : 0,
        phase: moreToWatch ? 'analyse' : 'compose',
        degraded,
        message: moreToWatch
          ? `Watching ${campaign.sources[cursor]?.name ?? 'the next video'}…`
          : 'Writing the posts…',
      });
    }

    if (job.phase === 'compose') {
      const source = campaign.sources[job.cursor];
      const analysis = job.analyses[job.cursor];
      if (!source || !analysis) {
        const counts = assetCounts(campaign.id);
        updateCampaign(campaign.id, { status: 'ready', assetCounts: counts });
        return putJob({
          ...job,
          phase: 'done',
          status: 'done',
          message: 'Everything is written and ready to review.',
        });
      }

      const assets = composeAll(campaign, source, analysis);
      saveAssets([...loadAssets(), ...assets]);
      const cursor = job.cursor + 1;
      const finished = cursor >= campaign.sources.length;

      if (finished) {
        const counts = assetCounts(campaign.id);
        updateCampaign(campaign.id, { status: 'ready', assetCounts: counts });
        return putJob({
          ...job,
          phase: 'done',
          status: 'done',
          cursor,
          message: 'Everything is written and ready to review.',
        });
      }
      return putJob({
        ...job,
        cursor,
        message: `Writing posts for ${campaign.sources[cursor]?.name ?? 'the next video'}…`,
      });
    }

    return job;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateCampaign(campaign.id, { status: 'failed', error: message.slice(0, 300) });
    return putJob({ ...job, status: 'failed', error: message.slice(0, 300), message: 'Generation stopped.' });
  }
}
