/**
 * What Autopilot is doing right now, fetched once and shared.
 *
 * Two screens want this at the same time — the dashboard panel and the nav
 * pill, which lights its traces only when something is actually running. Left
 * to themselves each would fetch the board on every mount, so a person moving
 * between screens would ask the server the same question four times a minute
 * for an answer that changes every five.
 *
 * So: one in-flight request, one cached answer, and a subscription. The cache
 * is deliberately short — a tick fires every five minutes, and a board that is
 * half a minute stale is honest where one that is ten minutes stale is not.
 *
 * **Nothing here invents a number.** `unreadable` is its own state rather than
 * an empty board: "no projects" and "could not ask" look identical in a zero,
 * and only one of them means the customer has nothing set up.
 */
import { fetchBoard, type Card, type Project } from './projects';
import { getActiveAccountId } from './tenancy';

export interface Pulse {
  state: 'loading' | 'ready' | 'unreadable';
  projects: Project[];
  /** Every card, by project id — the shape the endpoint returns. */
  board: Record<string, Card[]>;
  /** The same cards flattened, for the counts that do not care whose they are. */
  cards: Card[];
  /** Waiting on a person. The one number worth putting on a badge. */
  awaiting: number;
  /** Projects that would act on the next tick. */
  running: number;
  fetchedAt: number;
}

const EMPTY: Pulse = {
  state: 'loading', projects: [], board: {}, cards: [], awaiting: 0, running: 0, fetchedAt: 0,
};

/* Half a minute. Long enough that moving between screens does not re-ask,
   short enough that approving something and going back shows it gone. */
const FRESH_MS = 30_000;

let current: Pulse = EMPTY;
let inFlight: Promise<Pulse> | null = null;
let forAccount: string | null = null;
const listeners = new Set<(p: Pulse) => void>();

function publish(p: Pulse) {
  current = p;
  for (const fn of listeners) fn(p);
}

async function load(): Promise<Pulse> {
  const r = await fetchBoard();
  const cards = Object.values(r.board).flat();
  const next: Pulse = r.error
    ? { ...EMPTY, state: 'unreadable', fetchedAt: Date.now() }
    : {
      state: 'ready',
      projects: r.projects,
      board: r.board,
      cards,
      awaiting: cards.filter(c => c.status === 'awaiting').length,
      running: r.projects.filter(p => p.status === 'running' || p.status === 'learning').length,
      fetchedAt: Date.now(),
    };
  publish(next);
  return next;
}

/**
 * The current pulse, fetching if what we have is stale.
 *
 * `force` is for right after something changed — approving a card, starting a
 * project — where the cache is a promise about the past.
 */
export function readPulse(force = false): Promise<Pulse> {
  const account = getActiveAccountId();
  /* Switching workspace makes every cached number somebody else's. */
  if (account !== forAccount) {
    forAccount = account;
    current = EMPTY;
    inFlight = null;
    force = true;
  }
  if (!force && current.state !== 'loading' && Date.now() - current.fetchedAt < FRESH_MS) {
    return Promise.resolve(current);
  }
  if (!inFlight) {
    inFlight = load().finally(() => { inFlight = null; });
  }
  return inFlight;
}

/** The last answer without asking for a new one. */
export const peekPulse = (): Pulse => current;

/**
 * Watch it. Fires immediately with whatever is known, then on every refresh.
 *
 * The returned function unsubscribes, and every caller must call it — a
 * listener held by an unmounted component is a setState on a dead tree.
 */
export function watchPulse(fn: (p: Pulse) => void): () => void {
  listeners.add(fn);
  fn(current);
  void readPulse();
  return () => { listeners.delete(fn); };
}

/** Throw the cache away — call after anything that changes the board. */
export function refreshPulse(): Promise<Pulse> {
  return readPulse(true);
}
