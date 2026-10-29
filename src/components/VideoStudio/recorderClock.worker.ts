/*
 * The Screen Recorder's frame clock (recorder.ts `startClock` says why it is a
 * worker): post a number of milliseconds to start ticking, 0 to stop.
 */
let timer: ReturnType<typeof setInterval> | null = null;
self.onmessage = (e: MessageEvent) => {
  if (timer) clearInterval(timer);
  timer = null;
  const ms = Number(e.data);
  if (ms > 0) timer = setInterval(() => self.postMessage(0), ms);
};
