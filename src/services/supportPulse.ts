/**
 * Who is waiting for a person — fetched once and shared.
 *
 * The dashboard card and the badge in the nav want the same answer at the
 * same time, the same reason `autopilotPulse.ts` exists: left alone, each
 * would poll on its own and the question would be asked twice as often for an
 * answer only one request needs.
 *
 * One timer for everybody watching: every twenty seconds while the tab is
 * visible, nothing while it is hidden, and straight away when it comes back.
 * A person waiting in a chat is the most time-sensitive thing in the app, but
 * the conversation screen itself polls every few seconds — this is the "you
 * are elsewhere, somebody wants you" signal, and twenty seconds is soon enough
 * for that.
 *
 * `unreadable` is its own state rather than a zero, as in autopilotPulse:
 * "nobody is waiting" and "could not ask" must not look the same.
 */
import { supportWaiting } from './engagement';
import { getActiveAccountId } from './tenancy';

export interface WaitGroup { count: number; oldestAt: string | null; oldestId: string | null }

export interface SupportPulse {
  state: 'loading' | 'ready' | 'unreadable';
  /** The workspace has a widget, a conversation, a ticket or a live session at all. */
  hasData: boolean;
  conversations: WaitGroup;
  tickets: WaitGroup;
  live: WaitGroup;
  /** Conversations with a visitor message nobody here has had on screen. */
  unread: number;
  fetchedAt: number;
}

const NONE: WaitGroup = { count: 0, oldestAt: null, oldestId: null };
const EMPTY: SupportPulse = {
  state: 'loading', hasData: false, conversations: NONE, tickets: NONE, live: NONE, unread: 0, fetchedAt: 0,
};

const EVERY_MS = 20_000;

let current: SupportPulse = EMPTY;
let forAccount: string | null = null;
let inFlight: Promise<void> | null = null;
let timer = 0;
const listeners = new Set<(p: SupportPulse) => void>();

function publish(p: SupportPulse) {
  current = p;
  for (const fn of listeners) fn(p);
}

const group = (v: unknown): WaitGroup => {
  const g = (v ?? {}) as Partial<WaitGroup>;
  return { count: Number(g.count ?? 0), oldestAt: g.oldestAt ?? null, oldestId: g.oldestId ?? null };
};

function load(): Promise<void> {
  const account = getActiveAccountId();
  if (account !== forAccount) { forAccount = account; current = EMPTY; }
  if (!account) return Promise.resolve();
  if (!inFlight) {
    inFlight = supportWaiting().then(r => {
      /* An answer for a workspace we have since left is somebody else's. */
      if (getActiveAccountId() !== account) return;
      publish(r.success
        ? {
          state: 'ready', hasData: !!r.hasData,
          conversations: group(r.conversations), tickets: group(r.tickets), live: group(r.live),
          unread: Number(r.unread ?? 0), fetchedAt: Date.now(),
        }
        : { ...current, state: 'unreadable', fetchedAt: Date.now() });
    }).finally(() => { inFlight = null; });
  }
  return inFlight;
}

function loop() {
  window.clearTimeout(timer);
  if (!listeners.size) return;
  if (document.visibilityState !== 'hidden') void load();
  /* A workspace with no widget, chat, ticket or live session has nothing
     that could start waiting between two looks; asked every five minutes in
     case one is made, not every twenty seconds for ever. */
  timer = window.setTimeout(loop, current.state === 'ready' && !current.hasData ? 300_000 : EVERY_MS);
}

function onVisible() {
  if (document.visibilityState === 'visible' && listeners.size) loop();
}

/** Watch it. Fires at once with what is known; the returned function stops. */
export function watchSupport(fn: (p: SupportPulse) => void): () => void {
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

/** Ask again now — after a reply, when the number is a promise about the past. */
export function refreshSupport(): void { void load(); }
