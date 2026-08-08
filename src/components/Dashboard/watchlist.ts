/**
 * Watchlist and milestone helpers for the markets picker. They live apart from
 * the component so the module exports components only, which is what keeps fast
 * refresh working during development.
 */
const WATCH_KEY = 'crm_market_watchlist';

export function loadWatchlist(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(WATCH_KEY) || '[]') as string[]); }
  catch { return new Set(); }
}

export function saveWatchlist(set: Set<string>): void {
  try { localStorage.setItem(WATCH_KEY, JSON.stringify([...set])); } catch { /* quota */ }
}

/** The next round milestone above a score — what the department is working toward. */
export function targetFor(score: number): number {
  return Math.min(100, Math.floor(score / 10) * 10 + 10);
}
