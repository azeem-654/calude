/*
 * The Screen Recorder's frame clock (recorder.ts `startClock` says why it is a
 * worker): post a number of milliseconds to start ticking, 0 to stop.
 *
 * Each tick is aimed at its own slot on a fixed grid (start + n × ms) rather
 * than "ms after the last one": setInterval rounds 16.67 ms to 16 or 17 and
 * drifts, which shows as an uneven, juddering pan at 50 or 60 fps. A tick
 * that falls more than a frame behind (a busy computer) skips ahead instead of
 * bursting to catch up.
 */
let timer: ReturnType<typeof setTimeout> | null = null;
let next = 0, ms = 0;
const tick = () => {
  self.postMessage(0);
  const now = performance.now();
  next += ms;
  if (next < now - ms) next = now + ms;
  timer = setTimeout(tick, Math.max(0, next - now));
};
self.onmessage = (e: MessageEvent) => {
  if (timer) clearTimeout(timer);
  timer = null;
  ms = Number(e.data);
  if (ms > 0) { next = performance.now() + ms; timer = setTimeout(tick, ms); }
};
