/**
 * Turning a pile of generated assets into a publishing plan.
 *
 * Two things decide when something goes out: the placement's own good hours
 * from the rulebook, and the fact that five Instagram posts landing in the same
 * minute reads as a bot. So each placement gets its own queue, walking its best
 * hours in order and rolling into the next day when it runs out.
 *
 * Everything is computed in the browser's local time, because "post at 7pm"
 * means the user's evening, not UTC's.
 */
import { newId, placementRules, loadJobs, saveJobs, assetsFor, loadAssets, saveAssets } from './socialAutomation';
import type { Campaign, CampaignAsset, PublishJob } from '../types/socialAutomation';

/** Hours used for email, SMS, blog and landing, which have no placement rules. */
const CHANNEL_HOURS: Record<string, number[]> = {
  email: [9, 14],
  sms: [11, 16],
  blog: [10],
  landing: [10],
};

function hoursFor(asset: CampaignAsset): number[] {
  if (asset.placement) return placementRules(asset.placement)?.bestHours ?? [10];
  return CHANNEL_HOURS[asset.channel ?? ''] ?? [10];
}

/** A key that groups assets competing for the same audience at the same time. */
function queueKey(asset: CampaignAsset): string {
  return asset.placement ?? asset.channel ?? 'other';
}

/** The nth slot counted from the start of `from`'s day, ignoring the clock. */
function rawSlot(hours: number[], n: number, from: Date): Date {
  const perDay = Math.max(1, hours.length);
  const day = Math.floor(n / perDay);
  const hour = hours[n % perDay];
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() + day, hour, 0, 0, 0);
}

/**
 * The nth slot for a queue, counted from the first one still in the future.
 *
 * The obvious implementation — build slot n, and push it forward a day if it
 * has already passed — collides: at 19:30 the 19:00 slot moves to tomorrow at
 * 19:00, which is exactly where slot n+4 already sits. Finding the first free
 * slot once and then stepping forward keeps the sequence strictly increasing,
 * so two posts can never share a minute.
 */
export function slotFor(hours: number[], index: number, from = new Date()): Date {
  const ordered = [...hours].sort((a, b) => a - b);
  const perDay = Math.max(1, ordered.length);
  let first = 0;
  // At most one day of slots can be behind us, but bound the walk regardless.
  while (first < perDay * 2 && rawSlot(ordered, first, from).getTime() <= from.getTime()) first++;
  return rawSlot(ordered, first + index, from);
}

export interface SchedulePlan {
  assetId: string;
  at: string;
}

/**
 * Assign a time to every asset. `startAt` lets the caller push the whole plan
 * into the future — "start this on Monday" — without changing the spacing.
 */
export function planSchedule(assets: CampaignAsset[], startAt = new Date()): SchedulePlan[] {
  const perQueue = new Map<string, number>();
  return assets.map(asset => {
    const key = queueKey(asset);
    const index = perQueue.get(key) ?? 0;
    perQueue.set(key, index + 1);
    return { assetId: asset.id, at: slotFor(hoursFor(asset), index, startAt).toISOString() };
  });
}

/**
 * Write the plan onto the assets and create a publish job for each one.
 * Re-scheduling replaces the campaign's jobs rather than adding a second set.
 */
export function scheduleCampaign(campaign: Campaign, startAt = new Date()): PublishJob[] {
  const assets = assetsFor(campaign.id);
  // Clips are the raw material for the video placements, not a destination of
  // their own, so they are not scheduled or published.
  const publishable = assets.filter(a => a.placement !== null || a.channel !== null);
  const plan = planSchedule(publishable, startAt);
  const byAsset = new Map(plan.map(p => [p.assetId, p.at]));

  const allAssets = loadAssets();
  saveAssets(allAssets.map(a => {
    const at = byAsset.get(a.id);
    return at ? { ...a, scheduledFor: at, status: 'scheduled' as const, updatedAt: new Date().toISOString() } : a;
  }));

  const jobs: PublishJob[] = publishable.map(a => ({
    id: newId('job'),
    campaignId: campaign.id,
    assetId: a.id,
    placement: a.placement,
    channel: a.channel,
    status: 'queued',
    scheduledFor: byAsset.get(a.id),
    attempts: 0,
  }));

  saveJobs([...loadJobs().filter(j => j.campaignId !== campaign.id), ...jobs]);
  return jobs;
}

/** Drop the plan: assets go back to ready and the jobs are removed. */
export function clearSchedule(campaignId: string): void {
  saveJobs(loadJobs().filter(j => j.campaignId !== campaignId));
  saveAssets(loadAssets().map(a => (
    a.campaignId === campaignId && a.status === 'scheduled'
      ? { ...a, scheduledFor: undefined, status: 'ready' as const }
      : a
  )));
}

/* ── Reporting ── */

export interface CampaignReport {
  total: number;
  scheduled: number;
  published: number;
  failed: number;
  /** Earliest and latest scheduled slot, for the "runs from … to …" line. */
  firstAt?: string;
  lastAt?: string;
  byPlatform: { label: string; total: number; published: number }[];
}

/** What the dashboard and Reports both read, so the numbers cannot disagree. */
export function campaignReport(campaign: Campaign): CampaignReport {
  const assets = assetsFor(campaign.id).filter(a => a.placement !== null || a.channel !== null);
  const jobs = loadJobs().filter(j => j.campaignId === campaign.id);
  const times = jobs.map(j => j.scheduledFor).filter((t): t is string => !!t).sort();

  const groups = new Map<string, { total: number; published: number }>();
  for (const a of assets) {
    const label = a.placement ? (placementRules(a.placement)?.label ?? a.placement) : (a.channel ?? 'other');
    const g = groups.get(label) ?? { total: 0, published: 0 };
    g.total += 1;
    if (a.status === 'published') g.published += 1;
    groups.set(label, g);
  }

  return {
    total: assets.length,
    scheduled: assets.filter(a => a.status === 'scheduled').length,
    published: assets.filter(a => a.status === 'published').length,
    failed: assets.filter(a => a.status === 'failed').length,
    firstAt: times[0],
    lastAt: times[times.length - 1],
    byPlatform: [...groups.entries()]
      .map(([label, g]) => ({ label, ...g }))
      .sort((a, b) => b.total - a.total),
  };
}

/** "Tue 12 Aug, 19:00" — the same phrasing everywhere a slot is shown. */
export function formatSlot(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}
