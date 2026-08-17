/**
 * The work that is due, run wherever the user happens to be.
 *
 * Scheduled emails and sequence follow-ups have always been correct; nothing
 * has been driving them. processScheduled() and processSequences() were called
 * from exactly one place — the Dashboard's mount effect — so a plan that said
 * "wait three days, then send email two" meant "send email two the next time
 * somebody opens the dashboard after three days". For a module whose whole
 * promise is timed follow-up, that is the difference between working and not.
 *
 * This runs them on a timer from the app shell instead, so they advance on any
 * screen. It is honest about what that does not fix: a browser cannot be a
 * scheduler. With every tab closed, nothing runs. The app says so where it
 * matters rather than implying a server is minding the queue — see
 * describeReach() below, which the campaign page shows.
 *
 * The lock is not paranoia. Two tabs open on the same workspace would otherwise
 * both find the same message due and both send it, and the customer receives
 * the follow-up twice.
 */
import { processScheduled, processSequences, syncTracking } from './contactEmail';
import { campaignSendGate } from './aiSendCap';
import type { Contact } from '../types';
import type { EmailSequence } from '../types/marketing';

const LOCK_KEY = 'crm_duework_lock';
const LAST_RUN_KEY = 'crm_duework_last';

/** How often the tick fires while the app is open. */
export const TICK_MS = 60_000;

/**
 * How long a lock is trusted before it is assumed to belong to a tab that was
 * closed mid-run. Long enough for a slow batch, short enough that a crashed tab
 * does not stop the queue for the rest of the day.
 */
const LOCK_TTL_MS = 5 * 60_000;

export interface DueWorkReport {
  ran: boolean;
  scheduledSent: number;
  sequenceSent: number;
  /** Why it did not run, when it did not. */
  skipped?: 'locked' | 'no-work';
}

function now() { return Date.now(); }

/**
 * Who holds the lock, not merely that it is held.
 *
 * Without an owner, releasing is "delete whatever is there" — and React's
 * development double-mount does exactly that: start, run, unmount, release the
 * lock the still-running pass is holding, mount again, acquire freely. Two
 * passes then walk the same enrolments at once and the same person is emailed
 * twice. An owner makes a release that does not belong to you a no-op.
 */
const OWNER = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

interface Lock { at: number; owner: string }

function readLock(): Lock | null {
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Lock>;
    if (typeof parsed?.at === 'number' && typeof parsed?.owner === 'string') return parsed as Lock;
    /* A timestamp written by the previous version of this file. */
    const held = Number(raw);
    return Number.isFinite(held) ? { at: held, owner: 'legacy' } : null;
  } catch { return null; }
}

/** Take the lock, or report that another tab holds it. */
function acquire(): boolean {
  try {
    const held = readLock();
    if (held && now() - held.at < LOCK_TTL_MS) return false;
    localStorage.setItem(LOCK_KEY, JSON.stringify({ at: now(), owner: OWNER }));
    return true;
  } catch { return true; }   // storage blocked: better to run than to stall
}

function release() {
  try {
    const held = readLock();
    /* Never release somebody else's run. */
    if (held && held.owner !== OWNER && held.owner !== 'legacy') return;
    localStorage.removeItem(LOCK_KEY);
  } catch { /* nothing to do */ }
}

/**
 * A pass already running in this tab.
 *
 * The stored lock cannot see this on its own: two mounts of the same component
 * share one OWNER, so the second would find its own lock and take it.
 */
let inFlight: Promise<DueWorkReport> | null = null;

export function lastRunAt(): number | null {
  try {
    const raw = Number(localStorage.getItem(LAST_RUN_KEY));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  } catch { return null; }
}

export interface DueWorkApi {
  contacts: Contact[];
  sequences: EmailSequence[];
}

/**
 * One pass. Safe to call as often as you like: it does nothing when there is
 * nothing due, and nothing at all when another tab is mid-pass.
 */
export async function runDueWork(api: DueWorkApi): Promise<DueWorkReport> {
  if (inFlight) return { ran: false, scheduledSent: 0, sequenceSent: 0, skipped: 'locked' };
  if (!acquire()) return { ran: false, scheduledSent: 0, sequenceSent: 0, skipped: 'locked' };

  /* Assigned before the first await, or a second caller slips past the guard. */
  const pass = (async (): Promise<DueWorkReport> => {
    const scheduledSent = await processScheduled(api.contacts);
    /* The campaign controls say "50 emails a day". This is what makes that
       a limit rather than a number on a screen. */
    const sequenceSent = await processSequences(api.contacts, api.sequences, campaignSendGate(api.contacts));
    await syncTracking();
    try { localStorage.setItem(LAST_RUN_KEY, String(now())); } catch { /* not fatal */ }
    return { ran: true, scheduledSent, sequenceSent };
  })();
  inFlight = pass;

  try {
    return await pass;
  } finally {
    inFlight = null;
    release();
  }
}

/**
 * Run it now, then keep running it. Returns a stop function for the caller's
 * cleanup — an interval that outlives its component is a slow leak and, worse,
 * a second sender once the component remounts.
 */
export function startDueWork(
  getApi: () => DueWorkApi,
  onReport?: (r: DueWorkReport) => void,
  intervalMs = TICK_MS,
): () => void {
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const report = await runDueWork(getApi());
      if (!stopped && report.ran && (report.scheduledSent || report.sequenceSent)) onReport?.(report);
    } catch (err) {
      console.error('Due work failed:', err);
    }
  };

  void tick();
  const handle = window.setInterval(() => void tick(), intervalMs);

  /* Coming back to a tab that has been in the background is exactly when a
     backlog is most likely, and browsers throttle timers in hidden tabs. */
  const onVisible = () => { if (document.visibilityState === 'visible') void tick(); };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    stopped = true;
    window.clearInterval(handle);
    document.removeEventListener('visibilitychange', onVisible);
    /* Deliberately not releasing the lock here. Unmounting does not stop a pass
       that is already sending, and dropping its lock is how the same person
       gets two copies of the same email. A pass releases its own lock when it
       finishes, and the TTL covers a tab that really did go away. */
  };
}

/**
 * What the user needs to know about when their follow-ups actually go out.
 *
 * Kept here rather than written into a component, because every screen that
 * promises a schedule should say the same thing, and it should be one sentence
 * to change if this ever moves to a server.
 */
export function describeReach(): string {
  return 'Follow-ups go out while ProtectedCentral is open in a browser — the schedule is checked every minute. '
    + 'Nothing is sent while every tab is closed, so a sequence resumes when you next open the app rather than sending on the exact minute.';
}
