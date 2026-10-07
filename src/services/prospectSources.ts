/**
 * AI Prospecting searches as recurring lead sources for AI Autopilot projects,
 * from the browser's side — /api/sources.php (worker/src/routes/sources.ts).
 * The rules themselves (schedules, confidence, what a sentence means) are the
 * Worker's own file, imported here so both sides read them the same way.
 */
import { API_BASE } from './apiBase';
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';
import type { Destination, Filters, Schedule, Verify } from '../../worker/src/lib/prospectSources';

export * from '../../worker/src/lib/prospectSources';

type Answer<T> = T & { success?: boolean; error?: string; field?: string; code?: string };

async function call<T = Record<string, unknown>>(action: string, extra: Record<string, unknown> = {}): Promise<Answer<T>> {
  try {
    const r = await fetch(`${API_BASE}/api/sources.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token: sessionToken(), accountId: getActiveAccountId(), ...extra }),
    });
    return await r.json() as Answer<T>;
  } catch {
    return { success: false, error: 'Could not reach the server.' } as Answer<T>;
  }
}

export interface SearchDef {
  id: string; name: string; query: string; trade: string; place: string; source: 'free' | 'register';
  filters: Filters; exclusions: string[]; version: number; createdAt: string; updatedAt: string;
}
export interface ConnectionSummary {
  id: string; projectId: string; projectName: string; workflowId: string; workflowName: string;
  status: string; target: number; scheduleText: string; upToDate: boolean;
}
export interface LiveCheck { label: string; state: string; detail: string }
export interface LiveItem { name: string; ok: boolean | null; confidence: number; reason: string; checks: LiveCheck[]; done: string[]; at: string }
export interface Connection {
  id: string; projectId: string; projectName: string; workflowId: string; workflowName: string;
  searchId: string; searchName: string; trade: string; place: string; source: string; searchVersion: number; latestVersion: number;
  filters: Filters; exclusions: string[];
  schedule: Schedule; runDays: string; runHour: number; tz: string; scheduleText: string;
  target: number; minConfidence: number; verify: Verify; destination: Destination;
  status: 'active' | 'paused' | 'exhausted'; statusReason: string;
  today: { date: string; running: boolean; added: number; examined: number; rejected: Record<string, number>; searches: number; reads: number };
  limits: { searches: number; reads: number };
  lastRunAt: string; nextRunAt: string; manualOnly: boolean;
  live: { run: string; current: LiveItem | null; recent: LiveItem[] };
}
export interface ConnectSettings {
  name?: string; schedule: Schedule; runDays?: string; weeklyDay?: number; runHour: number; tz: string;
  target: number; minConfidence: number; verify: Verify; destination: Partial<Destination>;
}

export const listSearches = () => call<{ searches: (SearchDef & { connections: ConnectionSummary[] })[] }>('searches');
export const defineSearch = (p: { trade: string; place: string; source: string; query?: string; filters?: Partial<Filters> }) =>
  call<{ search: SearchDef; differs: boolean; googleNote: string }>('define', p);
export const updateSearch = (searchId: string, p: { trade?: string; place?: string; filters?: Partial<Filters>; exclusions?: string[]; name?: string }) =>
  call<{ search: SearchDef; changed: boolean; connections: Connection[] }>('update_search', { searchId, ...p });
export const applySearch = (searchId: string, mode: 'update' | 'keep', finderIds?: string[]) => call<{ updated: number }>('apply_search', { searchId, mode, finderIds });
export const connectSearch = (searchId: string, projectId: string, s: ConnectSettings) => call<{ connection: Connection }>('connect', { searchId, projectId, ...s });
export const projectSources = (projectId: string) =>
  call<{ connections: Connection[]; recent: Record<string, string | number>[]; log: { finder_id: string; kind: string; detail: string; at: string }[] }>('project', { projectId });
export const liveSource = (finderId: string) => call<{ connection: Connection }>('live', { finderId });
export const updateSource = (finderId: string, s: Partial<ConnectSettings>) => call<{ connection: Connection }>('update', { finderId, ...s });
export const setSourceStatus = (finderId: string, status: 'active' | 'paused') => call<{ connection: Connection }>('set_status', { finderId, status });
export const runSourceNow = (finderId: string) => call<{ connection: Connection; step: { detail: string; added: number } }>('run_now', { finderId });
export const disconnectSource = (finderId: string) => call('disconnect', { finderId });
export const sourceCommand = (projectId: string, text: string, finderId?: string) =>
  call<{ understood: boolean; said: string; open?: 'connect' | 'run_now'; searchId?: string; finderId?: string; connection?: Connection; needsSource?: boolean }>('command', { projectId, text, finderId });
export const sourcePolicy = (settings?: Record<string, string>) => call<{ settings: Record<string, string> }>('policy', settings ? { settings } : {});

/** The browser's time zone — a connection's run days are the customer's own. */
export const localTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };
