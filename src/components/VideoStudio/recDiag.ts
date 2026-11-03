/**
 * The Screen Recorder's own measurements — what the diagnostics panel shows
 * (Ctrl+Shift+D in the recorder, or `?recdiag=1`), and what the recorder
 * reads to judge whether this computer is keeping up.
 *
 * Collected always (a few numbers into fixed rings per frame — nothing
 * allocated, no DOM); shown only when asked. It answers one question: when
 * the recording stutters, where is the time going?
 *
 *  - capture: the camera or the screen delivers fewer frames than asked for
 *    (their own counters, `TrackFeed.count`);
 *  - main thread: the page was busy (long tasks, frame-clock ticks that
 *    arrived late and were dropped instead of drawn in a burst);
 *  - rendering: drawing a frame takes a large share of the frame's time;
 *  - segmentation: the background finder answers slower than a frame;
 *  - encoding: the recorder's chunks arrive late (the encoder behind).
 *
 * No device names or ids are kept — sizes, rates and timings only.
 */

/** Fixed-size ring of numbers: average, 95th percentile and maximum over the last `n`. */
export class Ring {
  private a: Float64Array;
  private i = 0;
  private n = 0;
  constructor(size = 120) { this.a = new Float64Array(size); }
  push(v: number) { if (!Number.isFinite(v)) return; this.a[this.i] = v; this.i = (this.i + 1) % this.a.length; this.n = Math.min(this.n + 1, this.a.length); }
  get count() { return this.n; }
  avg() { if (!this.n) return 0; let s = 0; for (let k = 0; k < this.n; k++) s += this.a[k]; return s / this.n; }
  max() { let m = 0; for (let k = 0; k < this.n; k++) m = Math.max(m, this.a[k]); return m; }
  p95() {
    if (!this.n) return 0;
    const v = Array.from(this.a.subarray(0, this.n)).sort((x, y) => x - y);
    return v[Math.min(v.length - 1, Math.floor(v.length * 0.95))];
  }
  clear() { this.n = 0; this.i = 0; }
}

export type Bottleneck = 'none' | 'capture' | 'main-thread' | 'rendering' | 'segmentation' | 'encoding';

export interface DiagSnapshot {
  fps: number; target: number;
  drawAvg: number; drawP95: number;
  /** Frames between two drawn frames longer than 1.5 frames, in the last window. */
  gaps: number; longestGap: number;
  /** Clock ticks dropped because they arrived after a newer one (would have been a burst). */
  dropped: number;
  camFps: number; scrFps: number;
  camAge: number; camAgeP95: number; scrAge: number;
  longTasks: number; longTaskMax: number;
  pointerMs: number;
  heapMB: number | null;
  bottleneck: Bottleneck; why: string;
}

/** Everything the panel shows beyond the frame numbers, gathered by the recorder when the panel asks. */
export interface DiagContext {
  fx: { runs: string; delegate: string; model: string; cost: number; roundTrip: number; looksPerSec: number; paired: boolean; maskAge: number } | null;
  rec: { state: string; mime: string; bitrate: number; chunks: number; bytes: number; chunkGapMax: number } | null;
  audio: { sampleRate: number; baseLatency: number; outputLatency: number; delayMs: number; camLatency: number | null } | null;
  cam: { w: number; h: number; fps: number } | null;
  scr: { w: number; h: number; fps: number } | null;
  out: { w: number; h: number };
  profile: string;
  cores: number | null; memory: number | null;
}

export class RecDiag {
  readonly draw = new Ring(180);
  readonly camAge = new Ring(180);
  readonly scrAge = new Ring(180);
  readonly pointer = new Ring(60);
  private drawn: number[] = [];
  private droppedAt: number[] = [];
  private long: { at: number; d: number }[] = [];
  private feeds = { cam: { n: 0, at: 0, fps: 0 }, scr: { n: 0, at: 0, fps: 0 } };
  private obs: PerformanceObserver | null = null;
  target = 30;

  constructor() {
    /* Long tasks (Chrome, Edge): the page's thread busy for 50 ms or more — the clearest sign the trouble is not the camera. */
    try {
      if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        this.obs = new PerformanceObserver(list => {
          for (const e of list.getEntries()) this.long.push({ at: e.startTime, d: e.duration });
          if (this.long.length > 200) this.long.splice(0, this.long.length - 200);
        });
        this.obs.observe({ type: 'longtask', buffered: false });
      }
    } catch { this.obs = null; }
  }

  dispose() { try { this.obs?.disconnect(); } catch { /* gone */ } this.obs = null; }

  /** A frame drawn: when, what it cost, and how old the camera's and screen's pictures in it were (NaN when not known). */
  frame(now: number, ms: number, camAge: number, scrAge: number) {
    this.drawn.push(now);
    if (this.drawn.length > 600) this.drawn.splice(0, this.drawn.length - 600);
    this.draw.push(ms);
    if (Number.isFinite(camAge)) this.camAge.push(camAge);
    if (Number.isFinite(scrAge)) this.scrAge.push(scrAge);
  }
  dropped(now: number) { this.droppedAt.push(now); if (this.droppedAt.length > 300) this.droppedAt.shift(); }
  /** The camera's and screen's own frame counters, read once a second or so. */
  feedCounts(now: number, cam: number | null, scr: number | null) {
    for (const [k, n] of [['cam', cam], ['scr', scr]] as const) {
      const f = this.feeds[k];
      if (n === null) { f.fps = 0; f.n = 0; f.at = 0; continue; }
      if (f.at && now - f.at >= 900) { f.fps = (n - f.n) * 1000 / (now - f.at); f.n = n; f.at = now; }
      else if (!f.at || n < f.n) { f.n = n; f.at = now; }
    }
  }
  reset() { this.draw.clear(); this.camAge.clear(); this.scrAge.clear(); this.pointer.clear(); this.drawn = []; this.droppedAt = []; this.long = []; }

  snapshot(now: number, fx: DiagContext['fx'], rec: DiagContext['rec'], camAsked: number, scrAsked: number): DiagSnapshot {
    const win = 3000, since = now - win;
    const d = this.drawn.filter(t => t >= since);
    const budget = 1000 / this.target;
    let gaps = 0, longestGap = 0;
    for (let k = 1; k < d.length; k++) { const g = d[k] - d[k - 1]; if (g > budget * 1.5) gaps++; longestGap = Math.max(longestGap, g); }
    const fps = d.length > 1 ? (d.length - 1) * 1000 / (d[d.length - 1] - d[0]) : 0;
    const dropped = this.droppedAt.filter(t => t >= since).length;
    const long = this.long.filter(l => l.at >= now - 5000);
    const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
    const s: DiagSnapshot = {
      fps, target: this.target, drawAvg: this.draw.avg(), drawP95: this.draw.p95(), gaps, longestGap, dropped,
      camFps: this.feeds.cam.fps, scrFps: this.feeds.scr.fps,
      camAge: this.camAge.avg(), camAgeP95: this.camAge.p95(), scrAge: this.scrAge.avg(),
      longTasks: long.length, longTaskMax: long.reduce((m, l) => Math.max(m, l.d), 0),
      pointerMs: this.pointer.avg(), heapMB: heap ? heap / 1048576 : null,
      bottleneck: 'none', why: 'Keeping up.',
    };
    [s.bottleneck, s.why] = judge(s, fx, rec, camAsked, scrAsked);
    return s;
  }
}

/**
 * Where the time is going, first cause first. Pure — the thresholds are the
 * judgement, kept in one place (and tested in `npm run test:recorder`).
 */
export function judge(s: Pick<DiagSnapshot, 'fps' | 'target' | 'drawP95' | 'dropped' | 'longTasks' | 'longTaskMax' | 'camFps' | 'scrFps' | 'gaps'>, fx: DiagContext['fx'], rec: DiagContext['rec'], camAsked: number, scrAsked: number): [Bottleneck, string] {
  const budget = 1000 / s.target;
  if (s.longTasks > 0 && s.longTaskMax >= 100) return ['main-thread', `The page was busy for up to ${Math.round(s.longTaskMax)} ms at a time — frames wait behind it.`];
  if (s.dropped > s.target * 0.15) return ['main-thread', `${s.dropped} frame ticks in 3 s arrived late (the page was busy) and were skipped rather than drawn in a burst.`];
  if (s.drawP95 > budget * 0.6) return ['rendering', `Drawing a frame takes up to ${s.drawP95.toFixed(1)} ms of the ${budget.toFixed(0)} ms each frame has.`];
  if (fx && fx.runs !== 'off' && fx.roundTrip > budget * 1.25) return ['segmentation', `The background finder answers in ${fx.roundTrip.toFixed(0)} ms (${fx.runs === 'worker' ? 'off the page' : 'on the page'}, ${fx.delegate}); the outline is reused between answers.`];
  if (camAsked && s.camFps > 0 && s.camFps < Math.min(camAsked, s.target) * 0.75) return ['capture', `The camera delivers ${s.camFps.toFixed(0)} frames a second (asked for ${camAsked}) — usually a dim room (longer exposure) or a busy USB port.`];
  if (scrAsked && s.scrFps > 0 && s.scrFps < 2 && s.fps >= s.target * 0.8) return ['none', 'The screen sends a new frame only when something on it changes — that is normal for a still screen.'];
  if (rec && rec.state === 'recording' && rec.chunkGapMax > 2500) return ['encoding', `The recorder's chunks came up to ${(rec.chunkGapMax / 1000).toFixed(1)} s apart (asked for 1 s) — the encoder is behind.`];
  if (s.fps > 0 && s.fps < s.target * 0.8) return ['main-thread', `${s.fps.toFixed(0)} of ${s.target} frames a second drawn.`];
  return ['none', 'Keeping up.'];
}
