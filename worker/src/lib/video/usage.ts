/**
 * What Video Studio used, and how much a workspace may use.
 *
 * Every processing step writes a line to `crm_video_usage` keyed by its job
 * and kind — a retried job writes the same key, so it is never counted twice.
 * The money figures are estimates at Cloudflare's and Google's list prices,
 * for the owner's eyes; customers see minutes, not cents.
 *
 * Allowances are per calendar month and come from the subscriber's plan
 * (lib/allowances.ts — `video_minutes`, `render_minutes`, `video_storage_gb`,
 * shared with every other allowance, the site's price cards included): a
 * trial is small (it is for trying), each plan larger, the install owner's
 * effectively unlimited. Like every allowance they are the subscriber's,
 * across all the workspaces they own. An ended trial processes nothing new —
 * the same rule that stops the operator's AI key — and says so by name.
 */
import type { Env } from '../db';
import { nowIso } from '../db';
import { TRIAL_ENDED_MESSAGE } from '../trial';
import { standingOf, usedOf, type Standing } from '../allowanceStore';
import { isUnlimited } from '../allowances';

/** Estimated list prices, in millionths of a dollar. */
export const PRICE = {
  /** Workers AI whisper-large-v3-turbo, per audio minute. */
  audioMin: 510,
  /** Container standard-1 (½ vCPU, 4 GiB) for about one and a half minutes of encoding per output minute. */
  renderMin: 1_800,
  /** A Gemini Flash analysis or metadata call, roughly. */
  aiCall: 2_000,
  /** R2, per GB-month. */
  storageGbMonth: 15_000,
};

export interface Limits { sourceMin: number; renderMin: number; storageGb: number }
/** What an unlimited allowance is written as here, where the screens show a number. */
export const OWNER_VIDEO: Limits = { sourceMin: 100_000, renderMin: 100_000, storageGb: 5_000 };

export function videoLimits(st: Pick<Standing, 'limits'>): Limits {
  const L = st.limits;
  return {
    sourceMin: isUnlimited(L.video_minutes) ? OWNER_VIDEO.sourceMin : L.video_minutes,
    renderMin: isUnlimited(L.render_minutes) ? OWNER_VIDEO.renderMin : L.render_minutes,
    storageGb: isUnlimited(L.video_storage_gb) ? OWNER_VIDEO.storageGb : L.video_storage_gb,
  };
}

export const period = () => `m:${new Date().toISOString().slice(0, 7)}`;

export async function meter(env: Env, r: { jobId: string; kind: string; accountId: string; units: number; unit: string; costMicros: number }): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO crm_video_usage (job_id, kind, account_id, period, units, unit, cost_micros, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(job_id, kind) DO NOTHING`,
  ).bind(r.jobId, r.kind, r.accountId, period(), Math.round(r.units * 1000) / 1000, r.unit, Math.round(r.costMicros), nowIso()).run().catch(() => null);
}

export interface Allowance {
  tier: 'trial' | 'paid' | 'owner' | 'ended';
  limits: Limits;
  used: { sourceMin: number; renderMin: number; audioMin: number; aiCalls: number; storageGb: number; costMicros: number };
}

export async function allowance(env: Env, accountId: string, withStorage = true): Promise<Allowance> {
  const st = await standingOf(env, accountId);
  const tier = st.kind === 'owner' ? 'owner' : st.kind === 'trial' ? 'trial' : st.kind === 'ended' ? 'ended' : 'paid';
  /* Across every workspace the subscriber owns — the allowance is theirs. */
  const { results } = await env.DB.prepare(
    `SELECT unit, SUM(units) AS n, SUM(cost_micros) AS c FROM crm_video_usage
      WHERE (account_id IN (SELECT account_id FROM crm_workspaces WHERE owner_email = ?1) OR account_id = ?2) AND period = ?3 GROUP BY unit`,
  ).bind(st.email ?? '', accountId, period()).all<{ unit: string; n: number; c: number }>();
  const by = (u: string) => results.find(r => r.unit === u)?.n ?? 0;
  const storageGb = withStorage ? await usedOf(env, st, accountId, 'video_storage_gb').catch(() => 0) : 0;
  return {
    tier,
    limits: videoLimits(st),
    used: {
      sourceMin: Math.round(by('source_min') * 10) / 10,
      renderMin: Math.round(by('render_min') * 10) / 10,
      audioMin: Math.round(by('audio_min') * 10) / 10,
      aiCalls: by('ai_call'),
      storageGb,
      costMicros: results.reduce((n, r) => n + (r.c ?? 0), 0),
    },
  };
}

/** Why this cannot go ahead, in words — or null. */
export async function refusal(env: Env, accountId: string, need: { sourceMin?: number; renderMin?: number; bytes?: number }): Promise<string | null> {
  const a = await allowance(env, accountId, !!need.bytes);
  if (a.tier === 'ended') return TRIAL_ENDED_MESSAGE;
  if (need.sourceMin && a.used.sourceMin + need.sourceMin > a.limits.sourceMin) {
    const left = Math.max(0, Math.floor(a.limits.sourceMin - a.used.sourceMin));
    return `This recording is ${Math.ceil(need.sourceMin)} minutes and ${left} minute${left === 1 ? '' : 's'} of this month's ${a.limits.sourceMin}-minute video allowance ${left === 1 ? 'is' : 'are'} left.`;
  }
  if (need.renderMin && a.used.renderMin + need.renderMin > a.limits.renderMin) {
    return `Rendering this needs ${Math.ceil(need.renderMin)} minutes and this month's ${a.limits.renderMin}-minute render allowance is nearly used (${Math.floor(a.used.renderMin)} used).`;
  }
  if (need.bytes && a.used.storageGb + need.bytes / 1e9 > a.limits.storageGb) {
    return `This would go over the ${a.limits.storageGb} GB of video storage (${a.used.storageGb} GB used). Delete a project you no longer need, then try again.`;
  }
  return null;
}
