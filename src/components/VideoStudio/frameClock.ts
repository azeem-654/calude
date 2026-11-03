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

/*
 * ── Frames drawn as they arrive (2026-11, the camera "a beat behind") ──
 *
 * The compositor used to draw only on the frame clock. A camera frame then
 * waited for the next tick — up to a whole frame, 17 ms on average at 30 fps
 * — and, the camera's 30 a second and the clock's 30 never quite agreeing,
 * the wait crept from nothing to a full frame and back: every few seconds one
 * camera frame was shown twice and the next never (the benchmark counted both
 * in every recording). That beat is the periodic stutter, and the wait is
 * latency on top of the camera's own.
 *
 * So the source that paces the picture draws it the moment its frame is in
 * (`lead`): the camera when one is shown, or — with a background effect that
 * pairs each frame with its own outline (cameraFx.ts) — the outline's answer;
 * the shared screen when there is no camera. The clock stays, as the
 * heartbeat for when the lead goes quiet (a still screen sends nothing; a
 * camera hiccups): a tick draws only once more than a frame and a quarter has
 * passed without a draw. Where the lead cannot pace the frame rate asked for
 * (a 30 fps camera in a 60 fps recording) the clock leads, as before, and the
 * arrivals wait for it — at 60 fps that is at most 17 ms.
 *
 * An arrival less than about a third of a frame after the last draw is left
 * for the next one: two frames a few milliseconds apart are work the eye
 * never sees and the encoder pays for.
 */
export type Lead = 'cam' | 'pair' | 'screen' | 'clock';
export type DrawWhy = 'tick' | 'cam' | 'pair' | 'screen';
export const ARRIVAL_GAP = 0.35;
export const HEARTBEAT = 1.25;
/*
 * And never more than four fifths of the page's time on drawing (`costMs`,
 * what a frame has been costing): a computer that needs 60 ms a frame was
 * drawing back to back, and with the page never free the camera's own frames
 * waited unread — the benchmark's layout switching showed pictures a second
 * and more old. Fewer frames, each current, feel far more live than more
 * frames that are all late.
 */
export const COST_SHARE = 1.25;

export function drawNow(why: DrawWhy, lead: Lead, sinceDrawnMs: number, frameMs: number, costMs = 0): boolean {
  const room = costMs * COST_SHARE;
  if (why === 'tick') return sinceDrawnMs >= (lead === 'clock' ? room : Math.max(frameMs * HEARTBEAT, room));
  return why === lead && sinceDrawnMs >= Math.max(frameMs * ARRIVAL_GAP, room);
}

/**
 * Which source leads (above). `camMs` is the camera's own gap between frames
 * (0 when not known yet); `pairing` is whether the frame shown waits for its
 * outline. Only a feed read frame by frame can lead — an element's frames
 * cannot be seen arriving, so the clock leads there (Firefox, Safari).
 */
export function leadOf(o: { cam: boolean; camFeed: boolean; camMs: number; pairing: boolean; screenFeed: boolean; fps: number }): Lead {
  if (o.cam) {
    if (!o.camFeed) return 'clock';
    /* Up to ~35 fps the heartbeat fills whatever a slow camera leaves; above that only a camera nearly as fast as the recording can pace it. */
    if (o.fps > 35 && !(o.camMs > 0 && 1000 / o.camMs * 1.25 >= o.fps)) return 'clock';
    return o.pairing ? 'pair' : 'cam';
  }
  return o.screenFeed ? 'screen' : 'clock';
}
