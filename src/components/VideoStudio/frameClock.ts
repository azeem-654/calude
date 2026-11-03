/**
 * Whether the page draws a frame-clock tick or skips it (recorder.ts
 * `startClock` says why — the "stacked scenes"). Pure, so `npm run
 * test:recorder` holds it: a tick that waited in the page's queue longer than
 * a frame has a newer tick behind it and is skipped, but never more than
 * three in a row (a clock that disagrees with the worker's cannot stop the
 * drawing). And a tick that comes less than a quarter of a frame after the
 * last draw *finished* is skipped too: a slow draw, then the tick queued
 * behind it drawn at once, recorded two frames a few milliseconds apart —
 * the same picture twice (the benchmark counted 62–85 such pairs in 90–150 s
 * of camera + screen + blur). Measured from the end of the draw, because a
 * draw's own length is what had pushed the next one up against it.
 */
export const MAX_SKIPS = 3;
export function keepTick(waitedMs: number, frameMs: number, skippedInARow: number, sinceDrawnMs = Infinity): boolean {
  if (skippedInARow >= MAX_SKIPS) return true;
  return !(waitedMs > frameMs || sinceDrawnMs < frameMs * 0.25);
}
