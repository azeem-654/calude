/**
 * Whether the cloud is running this workspace's work — fetched once and
 * shared by the cloud in the top bar and the card on the dashboard, for the
 * reason supportPulse and autopilotPulse exist: both mount at once, and each
 * asking on its own would double the requests for an answer that changes
 * every five minutes.
 *
 * Asked every minute while the tab is visible, never while it is hidden, and
 * at once when it comes back. `unreadable` is its own state: "the cloud has
 * stopped" and "could not ask" are different news, and only the first is
 * about the customer's workflows.
 */
import { useEffect, useState } from 'react';
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';
import { API_BASE } from './apiBase';

export interface CloudPulse {
  state: 'loading' | 'ready' | 'unreadable';
  /** A cron tick finished in the last twenty minutes. */
  live: boolean;
  lastRunAt: string | null;
  everyMinutes: number;
  running: { projects: number; workflows: number; finders: number; followUps: number };
}

const EMPTY: CloudPulse = {
  state: 'loading', live: false, lastRunAt: null, everyMinutes: 5,
  running: { projects: 0, workflows: 0, finders: 0, followUps: 0 },
};
const EVERY_MS = 60_000;

let current: CloudPulse = EMPTY;
let forAccount: string | null = null;
let inFlight: Promise<void> | null = null;
let timer = 0;
const listeners = new Set<(p: CloudPulse) => void>();

function publish(p: CloudPulse) {
  current = p;
  for (const fn of listeners) fn(p);
}

function load(): Promise<void> {
  const account = getActiveAccountId();
  if (account !== forAccount) { forAccount = account; current = EMPTY; }
  if (!account) return Promise.resolve();
  if (!inFlight) {
    inFlight = fetch(`${API_BASE}/api/cloud.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status', token: sessionToken(), accountId: account }),
    }).then(r => r.json()).then((d: Partial<CloudPulse> & { success?: boolean }) => {
      if (getActiveAccountId() !== account) return;
      publish(d.success
        ? {
          state: 'ready', live: !!d.live, lastRunAt: d.lastRunAt ?? null, everyMinutes: Number(d.everyMinutes ?? 5),
          running: { ...EMPTY.running, ...(d.running ?? {}) },
        }
        : { ...current, state: 'unreadable' });
    }).catch(() => publish({ ...current, state: 'unreadable' }))
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

function loop() {
  window.clearTimeout(timer);
  if (!listeners.size) return;
  if (document.visibilityState !== 'hidden') void load();
  timer = window.setTimeout(loop, EVERY_MS);
}

function onVisible() {
  if (document.visibilityState === 'visible' && listeners.size) loop();
}

/** Watch it. Fires at once with what is known; the returned function stops. */
export function watchCloud(fn: (p: CloudPulse) => void): () => void {
  if (!listeners.size) document.addEventListener('visibilitychange', onVisible);
  listeners.add(fn);
  fn(current);
  if (listeners.size === 1) loop();
  return () => {
    listeners.delete(fn);
    if (!listeners.size) {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    }
  };
}

/** "2 min ago", "just now" — how long since the cloud last ran. */
export function sinceText(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never';
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

/** What the cron is minding for this workspace, as a phrase. */
export function runningText(p: CloudPulse): string {
  const r = p.running;
  const bits = [
    r.projects ? `${r.projects} Autopilot project${r.projects === 1 ? '' : 's'}` : '',
    r.workflows ? `${r.workflows} workflow${r.workflows === 1 ? '' : 's'}` : '',
    r.finders ? `${r.finders} daily prospect finder${r.finders === 1 ? '' : 's'}` : '',
    r.followUps ? `${r.followUps} follow-up${r.followUps === 1 ? '' : 's'} in progress` : '',
  ].filter(Boolean);
  return bits.length ? bits.join(', ') : 'nothing switched on yet';
}

/** The pulse, for a component: null until the first answer is in hand. */
export function useCloud(): CloudPulse | null {
  const [p, setP] = useState<CloudPulse | null>(null);
  useEffect(() => watchCloud(setP), []);
  return p;
}

/** Live (a run in the last twenty minutes), late, or not known. */
export function cloudTone(p: CloudPulse | null): 'live' | 'late' | 'unknown' {
  if (!p || p.state !== 'ready') return 'unknown';
  return p.live ? 'live' : 'late';
}
