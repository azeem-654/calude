/**
 * Gapless preview playback through cuts — two <video> elements on the same
 * proxy, swapped at each kept stretch's end.
 *
 * ── Why two elements ──
 *
 * The old player played one element and, at every cut, set `currentTime` to
 * the next kept stretch while it was playing. Each of those is a seek: the
 * element drops below HAVE_FUTURE_DATA, fires `waiting`, flushes its audio,
 * decodes again from the keyframe before the new position and only then
 * plays on — 100–400 ms of frozen picture and silence at every cut. A
 * cleaned recording has a cut every few seconds, so it never played with
 * flow. Media Source Extensions would need the proxy re-muxed into segments
 * in the browser (an MP4 demuxer, keyframe-aligned appends), which is a far
 * larger thing to carry for what this needs.
 *
 * Instead the element that is not playing (the standby) is seeked, paused,
 * to the start of the *next* kept stretch while the other plays, so its
 * frame is decoded and its data buffered long before it is wanted. When the
 * playing element reaches the end of its stretch — timed off its own
 * presented frames (`requestVideoFrameCallback`, falling back to the
 * animation frame) — the standby is played and shown in the same task and
 * the old one paused and muted, then seeked ahead to the stretch after
 * that. Nothing that plays ever seeks, so nothing stalls; the sound moves
 * with the picture, one element to the other, without a flush.
 *
 * A stretch shorter than a standby needs to seek (a few frames between two
 * cuts) cannot be ready in time; then the playing element holds its last
 * frame until the standby is ready — a wait, counted in `stats` — rather
 * than showing what was cut.
 *
 * ── Why it never stops on its own ──
 *
 * The preview used to play a stretch or two and stop for good in some
 * browsers. Each way that happened is now caught here:
 *
 *  - **The standby was never allowed to play.** Safari (and any browser
 *    without sticky activation) lets an element play with sound only if
 *    `play()` was first called on *it* inside a user gesture. The first
 *    press of Play now calls it on both elements (`unlock`); a standby whose
 *    `play()` is still refused hands over to seeking the element that is
 *    allowed (`single`), which stalls a little at each cut but plays on.
 *  - **The standby never finished seeking** (a range request that failed
 *    or was cut off). A hold lasts at most `HOLD_MS`; then the element on
 *    screen seeks to the next stretch itself.
 *  - **An element errored or was paused under us.** The loop resumes a
 *    playing element the browser paused, and nudges one that has not moved
 *    for `STUCK_MS` (a re-seek re-requests its data); an errored standby is
 *    reloaded by the player and re-planned on `loadedmetadata`.
 *  - **Every poll re-planned the standby.** `setKeeps` with the same
 *    stretches is now a no-op, so a poll's new (but equal) edit no longer
 *    re-seeks the standby while it is about to be needed.
 */
export type Range = [number, number];

type VFC = (now: number, meta: { mediaTime: number }) => void;
type WithVfc = HTMLVideoElement & { requestVideoFrameCallback?: (cb: VFC) => number; cancelVideoFrameCallback?: (h: number) => void };

const FRAME = 1 / 30;
/** Longest the picture waits for a standby before the playing element seeks itself. */
const HOLD_MS = 900;
/** A playing element whose clock has not moved this long is nudged. */
const STUCK_MS = 2500;

export interface DeckStats { swaps: number; waits: number; stalls: number; fallbacks: number; nudges: number }

export class Deck extends EventTarget {
  private els: [WithVfc, WithVfc];
  private on = 0;
  private keeps: Range[] = [];
  /** The kept stretch the playing element is in; −1 when not known yet. */
  private k = -1;
  /** Which stretch the standby is seeked to, and whether its frame is there. */
  private prep = -1;
  private ready = false;
  private want = false;
  private holding = false;
  private rate = 1;
  private mute = false;
  private raf = 0;
  private vfc = 0;
  private vfcEl: WithVfc | null = null;
  private timer = 0;
  private dead = false;
  readonly stats: DeckStats = { swaps: 0, waits: 0, stalls: 0, fallbacks: 0, nudges: 0 };
  private offs: (() => void)[] = [];
  /** Which elements have had `play()` inside a user gesture (Safari's rule for sound). */
  private unlocked = [false, false];
  /** The standby cannot be played (refused by the browser): cuts are crossed by seeking the one on screen. */
  private single = false;
  private holdTimer = 0;
  /** Where the playing element's clock was, and when it last moved (the stall watchdog). */
  private lastT = -1;
  private lastMoved = 0;
  private pausedSince = 0;

  private onFrame: (t: number) => void;

  constructor(a: HTMLVideoElement, b: HTMLVideoElement, onFrame: (t: number) => void) {
    super();
    this.onFrame = onFrame;
    this.els = [a as WithVfc, b as WithVfc];
    this.show();
    this.setMuted(false);
    for (const [i, el] of this.els.entries()) {
      const seeked = () => this.seeked(i);
      const waiting = () => { if (i === this.on && this.want && !this.holding) this.stats.stalls++; };
      const ended = () => { if (i === this.on && this.want) this.finish(); };
      const meta = () => { el.playbackRate = this.rate; if (i !== this.on) { this.prep = -1; this.ready = false; this.plan(); } };
      el.addEventListener('seeked', seeked);
      el.addEventListener('waiting', waiting);
      el.addEventListener('ended', ended);
      el.addEventListener('loadedmetadata', meta);
      this.offs.push(() => { el.removeEventListener('seeked', seeked); el.removeEventListener('waiting', waiting); el.removeEventListener('ended', ended); el.removeEventListener('loadedmetadata', meta); });
    }
  }

  get active(): HTMLVideoElement { return this.els[this.on]; }
  get standby(): HTMLVideoElement { return this.els[1 - this.on]; }
  get time(): number { return this.active.currentTime; }
  get playing(): boolean { return this.want; }

  destroy() {
    this.dead = true;
    this.stopLoop();
    clearTimeout(this.holdTimer);
    for (const off of this.offs) off();
    for (const el of this.els) el.pause();
  }

  /** The edit changed: find where the playing element is in the new stretches and get the next one ready. */
  setKeeps(keeps: Range[]) {
    /* A poll hands over an equal edit as a new array; re-planning on it re-seeked the standby just before it was needed. */
    if (keeps.length === this.keeps.length && keeps.every((r, i) => r[0] === this.keeps[i][0] && r[1] === this.keeps[i][1])) { this.keeps = keeps; return; }
    this.keeps = keeps;
    this.k = this.find(this.time);
    this.prep = -1;
    this.plan();
    this.emitFrame();
  }

  setRate(rate: number) {
    this.rate = rate;
    for (const el of this.els) { el.playbackRate = rate; (el as HTMLVideoElement & { preservesPitch?: boolean }).preservesPitch = true; }
  }

  setMuted(m: boolean) {
    this.mute = m;
    this.active.muted = m;
    this.standby.muted = true;
  }

  play() {
    if (!this.keeps.length) return;
    const t = this.time;
    let k = this.find(t);
    if (k < 0) {
      /* In a cut, or past the end: from the next stretch, or from the start. */
      const next = this.keeps.findIndex(([a]) => a > t);
      k = next >= 0 ? next : 0;
      this.active.currentTime = this.keeps[k][0];
    }
    this.k = k;
    this.want = true;
    this.active.muted = this.mute;
    this.active.playbackRate = this.rate;
    this.unlocked[this.on] = true;
    const el = this.active;
    void el.play().catch(() => { if (el === this.active && this.want) { this.want = false; this.stopLoop(); this.dispatchEvent(new Event('pause')); } });
    this.unlock();
    this.plan();
    this.startLoop();
    this.dispatchEvent(new Event('play'));
  }

  pause() {
    this.want = false;
    this.holding = false;
    clearTimeout(this.holdTimer);
    this.stopLoop();
    for (const el of this.els) el.pause();
    this.emitFrame();
    this.dispatchEvent(new Event('pause'));
  }

  toggle() { if (this.want) this.pause(); else this.play(); }

  /** Move to a source time; a moment that is cut moves on to where the edit carries on. */
  seek(t: number) {
    if (!this.keeps.length) { this.active.currentTime = t; return; }
    let k = this.find(t);
    if (k < 0) {
      const next = this.keeps.findIndex(([a]) => a > t);
      k = next >= 0 ? next : this.keeps.length - 1;
      t = next >= 0 ? this.keeps[k][0] : this.keeps[k][1] - FRAME;
    }
    this.k = k;
    this.holding = false;
    clearTimeout(this.holdTimer);
    /* If the standby already holds exactly this moment (a seek to the next
       stretch's start), show it instead of seeking the one on screen. */
    if (this.prep === k && this.ready && Math.abs(this.standby.currentTime - t) < 0.02) this.flip();
    else this.active.currentTime = t;
    this.prep = -1;
    this.plan();
    this.emitFrame();
    this.dispatchEvent(new Event('seeked'));
  }

  /* ── Inside ─────────────────────────────────────────────────────────────── */

  private find(t: number): number {
    return this.keeps.findIndex(([a, b]) => t >= a - 0.01 && t < b - 0.005);
  }

  private show() {
    this.els.forEach((el, i) => { el.classList.toggle('on', i === this.on); el.setAttribute('aria-hidden', i === this.on ? 'false' : 'true'); });
  }

  /**
   * Inside the press of Play: let the standby play later too. `play()` then
   * `pause()` in the same task never shows or sounds a frame, but it is the
   * user gesture Safari wants on each element before it plays with sound.
   */
  private unlock() {
    const i = 1 - this.on, s = this.els[i];
    if (this.unlocked[i]) return;
    this.unlocked[i] = true;
    const was = s.muted;
    try { const p = s.play(); s.pause(); s.muted = was; void p?.catch(() => {}); } catch { /* an element with no source yet */ }
  }

  /** Seek the standby to the start of the stretch after the playing one. */
  private plan() {
    if (this.single) return;
    const want = this.k + 1;
    if (want < 1 || want >= this.keeps.length) return;
    if (this.prep === want) return;
    const s = this.standby;
    this.prep = want;
    this.ready = false;
    s.pause();
    s.muted = true;
    if (s.readyState >= 1) {
      if (Math.abs(s.currentTime - this.keeps[want][0]) < 0.004 && !s.seeking && s.readyState >= 2) { this.ready = true; return; }
      s.currentTime = this.keeps[want][0];
    }
  }

  private seeked(i: number) {
    if (i === this.on) { this.emitFrame(); return; }
    const s = this.els[i];
    if (this.prep >= 0 && this.keeps[this.prep] && Math.abs(s.currentTime - this.keeps[this.prep][0]) < 0.05) {
      this.ready = true;
      if (this.holding) { this.holding = false; this.swap(); }
    }
  }

  /** The stretch on screen ends: play the standby, show it, park the old one. */
  private swap() {
    if (this.dead) return;
    clearTimeout(this.timer); this.timer = 0;
    const next = this.k + 1;
    if (next >= this.keeps.length) { this.finish(); return; }
    if (this.single) { this.jump(next); return; }
    if (this.prep !== next) this.plan();
    if (!this.ready) {
      /* Not decoded yet: hold the last kept frame rather than show the cut —
         but never for long: a standby that cannot get there (its range
         request failed) must not stop the preview. */
      if (!this.holding) {
        this.holding = true; this.stats.waits++; this.tell(); this.active.pause();
        clearTimeout(this.holdTimer);
        this.holdTimer = window.setTimeout(() => { if (this.holding && this.want && !this.dead) { this.holding = false; this.stats.fallbacks++; this.jump(this.k + 1); } }, HOLD_MS);
      }
      return;
    }
    clearTimeout(this.holdTimer);
    this.holding = false;
    const old = this.active, s = this.standby;
    s.playbackRate = this.rate;
    s.muted = this.mute;
    if (this.want) {
      void s.play().catch((e: unknown) => {
        /* The browser will not let the standby play (no user gesture on it):
           from here on, cuts are crossed by seeking the element it allows. */
        if ((e as { name?: string })?.name !== 'NotAllowedError' || this.dead || !this.want || s !== this.active) return;
        this.single = true; this.stats.fallbacks++;
        const at = s.currentTime;
        this.on = 1 - this.on; this.show();
        s.muted = true; s.pause();
        this.active.currentTime = at;
        this.active.muted = this.mute;
        void this.active.play().catch(() => { this.pause(); });
      });
    }
    this.on = 1 - this.on;
    this.show();
    old.muted = true;
    old.pause();
    this.k = next;
    this.prep = -1;
    this.stats.swaps++; this.tell();
    this.plan();
    if (this.want) this.armVfc();
  }

  /** Cross a cut on the element on screen (the fallback: a seek, which may stall briefly, but plays on). */
  private jump(next: number) {
    if (next >= this.keeps.length) { this.finish(); return; }
    const el = this.active;
    el.currentTime = this.keeps[next][0];
    this.k = next;
    this.prep = -1;
    this.lastMoved = performance.now();
    if (this.want) { el.muted = this.mute; void el.play().catch(() => {}); }
    this.tell();
    this.plan();
    if (this.want) this.armVfc();
  }

  /** Make the standby the one on screen, without playing (a seek that landed on its moment). */
  private flip() {
    const old = this.active;
    this.on = 1 - this.on;
    this.show();
    old.muted = true;
    old.pause();
    this.active.muted = this.mute;
    if (this.want) void this.active.play().catch(() => {});
  }

  private finish() {
    this.want = false;
    this.stopLoop();
    for (const el of this.els) el.pause();
    if (this.keeps.length) { this.k = 0; this.active.currentTime = this.keeps[0][0]; this.prep = -1; this.plan(); }
    this.emitFrame();
    this.dispatchEvent(new Event('pause'));
  }

  private emitFrame() { this.onFrame(this.time); }

  /** What the deck did, on its wrapper — read by the end-to-end test, and handy in devtools. */
  private tell() { const p = this.active.parentElement; if (p) { p.dataset.swaps = String(this.stats.swaps); p.dataset.waits = String(this.stats.waits); p.dataset.fallbacks = String(this.stats.fallbacks); p.dataset.nudges = String(this.stats.nudges); } }

  /**
   * The watchdog, every animation frame while playing: an element the
   * browser paused under us is resumed; one whose clock has not moved for
   * STUCK_MS is re-seeked where it is, which asks for its data again.
   */
  private guard(t: number) {
    const el = this.active, now = performance.now();
    if (this.holding) { this.lastMoved = now; this.pausedSince = 0; return; }
    if (el.paused && !el.ended) {
      if (!this.pausedSince) this.pausedSince = now;
      else if (now - this.pausedSince > 400) { this.pausedSince = now; el.muted = this.mute; void el.play().catch(() => {}); }
    } else this.pausedSince = 0;
    if (Math.abs(t - this.lastT) > 0.001) { this.lastT = t; this.lastMoved = now; return; }
    if (now - this.lastMoved > STUCK_MS) {
      this.lastMoved = now; this.stats.nudges++; this.tell();
      if (!el.seeking) el.currentTime = t + 0.001;
    }
  }

  private startLoop() {
    this.stopLoop();
    this.lastT = -1; this.lastMoved = performance.now(); this.pausedSince = 0;
    const tick = () => {
      if (!this.want || this.dead) return;
      const t = this.time;
      this.guard(t);
      const cur = this.keeps[this.k];
      if (!cur || t < cur[0] - 0.25 || t > cur[1] + 0.25) this.k = this.find(t);
      const end = this.keeps[this.k]?.[1];
      /* The animation frame is the fallback: the frame callback below swaps
         on time; this catches a playing element that ran past the end. */
      if (end !== undefined && t >= end - 0.008 && !this.holding) this.swap();
      else if (this.k < 0) {
        /* In a cut (the edit changed under the playhead): on to the next stretch. */
        const next = this.keeps.findIndex(([a]) => a > t);
        if (next < 0) { this.finish(); return; }
        if (next === 0) { this.active.currentTime = this.keeps[0][0]; this.k = 0; this.prep = -1; this.plan(); }
        else { this.k = next - 1; this.prep = -1; this.plan(); this.swap(); }
      }
      this.emitFrame();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    this.armVfc();
  }

  /**
   * Timed off the playing element's own frames: when the frame just shown is
   * the last kept one, swap when its time on screen is over.
   */
  private armVfc() {
    const el = this.active;
    if (!el.requestVideoFrameCallback) return;
    this.dropVfc();
    const cb: VFC = (_now, meta) => {
      if (!this.want || this.dead || el !== this.active) return;
      const end = this.keeps[this.k]?.[1];
      if (end !== undefined && !this.timer && !this.holding) {
        const due = ((end - meta.mediaTime) / this.rate) * 1000;
        if (due <= FRAME * 1500) this.timer = window.setTimeout(() => { this.timer = 0; if (this.want && el === this.active) this.swap(); }, Math.max(0, due - 6));
      }
      this.vfc = el.requestVideoFrameCallback!(cb);
    };
    this.vfcEl = el;
    this.vfc = el.requestVideoFrameCallback(cb);
  }

  private dropVfc() {
    if (this.vfc && this.vfcEl) this.vfcEl.cancelVideoFrameCallback?.(this.vfc);
    this.vfc = 0; this.vfcEl = null;
  }

  private stopLoop() {
    cancelAnimationFrame(this.raf); this.raf = 0;
    clearTimeout(this.timer); this.timer = 0;
    this.dropVfc();
  }
}
