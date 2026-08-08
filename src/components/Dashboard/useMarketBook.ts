import { useEffect, useMemo, useState } from 'react';
import {
  advanceOffsets, applyTick, buildBook,
  type Book, type FeedInput, type Timeframe,
} from '../../services/marketFeed';

const SIM_KEY = 'crm_market_sim';
const TICK_MS = 1100;

/* ── One clock for the whole page ──
   Every panel subscribes to the same interval, so the offsets advance exactly
   once per tick no matter how many boards are mounted, and two panels showing
   the same symbol can never drift apart. */

const subscribers = new Set<() => void>();
let timer: number | null = null;

function start() {
  if (timer !== null) return;
  timer = window.setInterval(() => {
    advanceOffsets();
    for (const fn of subscribers) fn();
  }, TICK_MS);
}

function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  start();
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

export function simEnabled(): boolean {
  return localStorage.getItem(SIM_KEY) !== 'off';
}

export function setSimEnabled(on: boolean): void {
  localStorage.setItem(SIM_KEY, on ? 'on' : 'off');
}

export interface MarketState {
  book: Book;
  /** Increments on every tick — use it to restart the flash animation. */
  seq: number;
  now: number;
}

/**
 * Replay the records into a book, then keep it ticking. The replay is memoised
 * on the inputs, so a tick never re-walks the whole event history.
 */
export function useMarketBook(input: FeedInput, timeframe: Timeframe, sim: boolean): MarketState {
  // Callers pass a memoised `input`, so this only re-walks the event history
  // when the records themselves change.
  const base = useMemo(() => buildBook(input, timeframe), [input, timeframe]);

  const [state, setState] = useState<MarketState>(() => ({ book: base, seq: 0, now: Date.now() }));
  const [seenBase, setSeenBase] = useState(base);

  // Adjusting state during render — rather than in an effect — keeps a fresh
  // replay on screen in the same commit, with no flash of the stale book.
  if (seenBase !== base) {
    setSeenBase(base);
    setState(s => ({ ...s, book: base }));
  }

  // Re-subscribing on `sim` lets the callback close over the current setting
  // instead of reading a ref during render.
  useEffect(() => subscribe(() => {
    setState(s => ({ book: applyTick(s.book, sim), seq: s.seq + 1, now: Date.now() }));
  }), [sim]);

  return state;
}
