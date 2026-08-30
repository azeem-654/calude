/**
 * verifyQueue.ts — durable bulk verification and inbox placement testing.
 *
 * Verifying thousands of addresses cannot block the interface, and it must not
 * lose its place when the tab is closed. The queue therefore lives in storage
 * rather than in memory: each pass takes a slice, records the results, and
 * stops. Reopening the app resumes exactly where it stopped.
 */

import type { Contact } from '../types';
import { getSession } from './auth';
import { verifyEmails, recordHealth, type VerifyResult, type Verdict } from './deliverability';
import { recordPlacement, log as warmupLog, type Seed } from './warmup';
import { API_BASE } from './apiBase';

const QUEUE_KEY = 'crm_verify_queue';
const PLACEMENT_KEY = 'crm_placement_runs';

/* ── Bulk verification queue ─────────────────────────────────────────────── */

export interface VerifyJob {
  id: string;
  /** Addresses still to check. Consumed from the front as work completes. */
  pending: string[];
  /** Verdict counts so far, kept as a tally rather than every result. */
  tally: Record<Verdict, number>;
  total: number;
  status: 'running' | 'paused' | 'done';
  startedAt: string;
  finishedAt?: string;
  /** Last error, when a pass could not reach the server. */
  error?: string;
  label: string;
}

/** How many addresses one pass handles. Matches the endpoint's own cap. */
const BATCH = 50;

export function loadJob(): VerifyJob | null {
  try {
    const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) || 'null');
    return raw && typeof raw === 'object' ? raw as VerifyJob : null;
  } catch { return null; }
}

function saveJob(job: VerifyJob | null) {
  try {
    if (job) localStorage.setItem(QUEUE_KEY, JSON.stringify(job));
    else localStorage.removeItem(QUEUE_KEY);
  } catch { /* storage full */ }
}

export function clearJob() { saveJob(null); }

/**
 * Queue a list for verification. Addresses already verified this session are
 * still included — the endpoint caches per address for a week, so re-checking
 * costs nothing and keeps the tally honest.
 */
export function queueVerification(emails: string[], label = 'Contact list'): VerifyJob {
  const unique = [...new Set(emails.map(e => (e || '').trim().toLowerCase()).filter(Boolean))];
  const job: VerifyJob = {
    id: `vq-${Date.now()}`,
    pending: unique,
    tally: { valid: 0, risky: 0, invalid: 0, unknown: 0 },
    total: unique.length,
    status: unique.length ? 'running' : 'done',
    startedAt: new Date().toISOString(),
    finishedAt: unique.length ? undefined : new Date().toISOString(),
    label,
  };
  saveJob(job);
  return job;
}

export function pauseJob(): VerifyJob | null {
  const job = loadJob();
  if (!job || job.status !== 'running') return job;
  job.status = 'paused';
  saveJob(job);
  return job;
}

export function resumeJob(): VerifyJob | null {
  const job = loadJob();
  if (!job || job.status !== 'paused') return job;
  job.status = 'running';
  job.error = undefined;
  saveJob(job);
  return job;
}

export const jobProgress = (job: VerifyJob) => ({
  done: job.total - job.pending.length,
  total: job.total,
  percent: job.total ? Math.round(((job.total - job.pending.length) / job.total) * 100) : 100,
});

/**
 * Do one slice of work. Returns the job as it now stands, or null when there
 * is nothing to do. Safe to call repeatedly; a paused or finished job is left
 * alone. Results are written to contact health, and anything undeliverable is
 * suppressed, as each batch completes — so stopping half way still leaves the
 * work done so far applied.
 */
export async function runQueuePass(): Promise<VerifyJob | null> {
  const job = loadJob();
  if (!job || job.status !== 'running') return job;
  if (!job.pending.length) {
    job.status = 'done';
    job.finishedAt = new Date().toISOString();
    saveJob(job);
    return job;
  }

  const batch = job.pending.slice(0, BATCH);
  let results: VerifyResult[] = [];
  try {
    results = await verifyEmails(batch);
  } catch {
    job.error = 'The verification service could not be reached. The queue will retry.';
    saveJob(job);
    return job;
  }

  // Re-read: a pause or a second pass may have landed while this was in flight.
  const current = loadJob();
  if (!current || current.id !== job.id) return current;

  recordHealth(results);
  for (const r of results) current.tally[r.verdict] = (current.tally[r.verdict] ?? 0) + 1;

  const seen = new Set(batch);
  current.pending = current.pending.filter(e => !seen.has(e));
  current.error = undefined;
  if (!current.pending.length) {
    current.status = 'done';
    current.finishedAt = new Date().toISOString();
  }
  saveJob(current);
  return current;
}

/** A one-line summary of what a finished job found. */
export function jobSummary(job: VerifyJob): string {
  const { valid, risky, invalid } = job.tally;
  const checked = valid + risky + invalid + job.tally.unknown;
  if (!checked) return 'Nothing checked yet.';
  const parts = [`${valid} valid`];
  if (risky) parts.push(`${risky} risky`);
  if (invalid) parts.push(`${invalid} invalid and now suppressed`);
  return `${checked} checked — ${parts.join(', ')}.`;
}

/* ── Inbox placement testing ─────────────────────────────────────────────── */

export interface PlacementSeedConfig {
  id: string;
  email: string;
  host: string;
  port: number;
  encryption: 'ssl' | 'tls' | 'none';
  username: string;
  hasPassword: boolean;
}

export interface PlacementRun {
  id: string;
  marker: string;
  startedAt: string;
  /** Per seed: where the message ended up, once known. */
  results: { seedId: string; email: string; provider: string; placement: 'inbox' | 'spam' | 'missing' | 'pending'; folder?: string; error?: string }[];
}

async function call(action: string, body: Record<string, unknown> = {}): Promise<Record<string, unknown> | null> {
  const session = getSession();
  if (!session) return null;
  try {
    const r = await fetch(`${API_BASE}/api/placement.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token: session.token, ...body }),
    });
    return await r.json();
  } catch { return null; }
}

export async function placementCapabilities(): Promise<{ imap: boolean; seeds: number; message: string } | null> {
  const res = await call('capabilities');
  if (!res?.success) return null;
  return { imap: !!res.imap, seeds: Number(res.seeds || 0), message: String(res.message || '') };
}

export async function listPlacementSeeds(): Promise<PlacementSeedConfig[]> {
  const res = await call('seed_list');
  if (!res?.success || !Array.isArray(res.seeds)) return [];
  return res.seeds as PlacementSeedConfig[];
}

export async function savePlacementSeed(cfg: Omit<PlacementSeedConfig, 'hasPassword'> & { password: string }): Promise<{ ok: boolean; error?: string }> {
  const res = await call('seed_set', cfg);
  if (!res) return { ok: false, error: 'Could not reach the server.' };
  return res.success ? { ok: true } : { ok: false, error: String(res.error || 'Could not save.') };
}

export async function removePlacementSeed(id: string): Promise<void> { await call('seed_remove', { id }); }

/** A marker unique to one placement run, put in the subject so IMAP can find it. */
export function newMarker(): string {
  return `PLACEMENT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

export function loadPlacementRuns(): PlacementRun[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PLACEMENT_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

function savePlacementRuns(rows: PlacementRun[]) {
  try { localStorage.setItem(PLACEMENT_KEY, JSON.stringify(rows.slice(0, 20))); } catch { /* storage full */ }
}

export function startPlacementRun(seeds: Seed[]): PlacementRun {
  const run: PlacementRun = {
    id: `run-${Date.now()}`,
    marker: newMarker(),
    startedAt: new Date().toISOString(),
    results: seeds.map(s => ({ seedId: s.id, email: s.email, provider: s.provider, placement: 'pending' })),
  };
  savePlacementRuns([run, ...loadPlacementRuns()]);
  return run;
}

export function recordRunResult(runId: string, seedId: string, placement: PlacementRun['results'][number]['placement'], folder?: string, error?: string) {
  const runs = loadPlacementRuns().map(r => r.id !== runId ? r : {
    ...r,
    results: r.results.map(x => (x.seedId === seedId ? { ...x, placement, folder, error } : x)),
  });
  savePlacementRuns(runs);
}

/**
 * Ask the server to look inside each seed mailbox for this run's marker.
 * Whatever it finds is written back to the seed, so the warmup panel's
 * placement rate reflects a real check rather than a self-report.
 */
export async function checkPlacement(run: PlacementRun): Promise<PlacementRun> {
  for (const row of run.results) {
    if (row.placement !== 'pending') continue;
    const res = await call('check', { id: row.seedId, marker: run.marker });
    if (!res) { recordRunResult(run.id, row.seedId, 'pending', undefined, 'Could not reach the server.'); continue; }
    if (!res.success) {
      recordRunResult(run.id, row.seedId, 'pending', undefined, String(res.error || 'Check failed.'));
      continue;
    }
    const placement = String(res.placement) as 'inbox' | 'spam' | 'missing';
    recordRunResult(run.id, row.seedId, placement, res.folder ? String(res.folder) : undefined);
    recordPlacement(row.seedId, placement);
    warmupLog(
      `${row.email}: ${placement === 'inbox' ? 'landed in the inbox' : placement === 'spam' ? `went to spam (${res.folder})` : 'was not delivered'}`,
      'placement',
    );
  }
  return loadPlacementRuns().find(r => r.id === run.id) ?? run;
}

/** Inbox rate for a run, once some seeds have reported. */
export function runSummary(run: PlacementRun) {
  const decided = run.results.filter(r => r.placement !== 'pending');
  const inbox = decided.filter(r => r.placement === 'inbox').length;
  const spam = decided.filter(r => r.placement === 'spam').length;
  const missing = decided.filter(r => r.placement === 'missing').length;
  return {
    decided: decided.length, total: run.results.length, inbox, spam, missing,
    inboxRate: decided.length ? Math.round((inbox / decided.length) * 100) : 0,
  };
}

/** The subject line for a placement test — the marker has to survive intact. */
export function placementSubject(marker: string): string {
  return `Deliverability check ${marker}`;
}

export function placementBody(marker: string): string {
  return [
    'This is an inbox placement test sent by your CRM.',
    '',
    'It exists so the system can tell whether mail from this sender reaches the',
    'inbox or the spam folder at each provider. Nothing is required of you.',
    '',
    `Reference: ${marker}`,
  ].join('\n');
}

/** Contacts whose address has never been checked — the useful thing to queue. */
export function uncheckedContacts(contacts: Contact[], healthFor: (email: string) => unknown): Contact[] {
  return contacts.filter(c => c.email && !healthFor(c.email));
}
