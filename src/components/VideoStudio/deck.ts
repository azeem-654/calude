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
 */
export type Range = [number, number];

type VFC = (now: number, meta: { mediaTime: number }) => void;
type WithVfc = HTMLVideoElement & { requestVideoFrameCallback?: (cb: VFC) => number; cancelVideoFrameCallback?: (h: number) => void };

const FRAME = 1 / 30;

export interface DeckStats { swaps: number; waits: number; stalls: number }

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
  readonly stats: DeckStats = { swaps: 0, waits: 0, stalls: 0 };
  private offs: (() => void)[] = [];

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
      const meta = () => { el.playbackRate = this.rate; if (i !== this.on) { this.prep = -1; this.plan(); } };
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
    for (const off of this.offs) off();
    for (const el of this.els) el.pause();
  }

  /** The edit changed: find where the playing element is in the new stretches and get the next one ready. */
  setKeeps(keeps: Range[]) {
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
    void this.active.play().catch(() => { this.want = false; this.dispatchEvent(new Event('pause')); });
    this.plan();
    this.startLoop();
    this.dispatchEvent(new Event('play'));
  }

  pause() {
    this.want = false;
    this.holding = false;
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

  /** Seek the standby to the start of the stretch after the playing one. */
  private plan() {
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
    if (this.prep !== next) this.plan();
    if (!this.ready) {
      /* Not decoded yet: hold the last kept frame rather than show the cut. */
      if (!this.holding) { this.holding = true; this.stats.waits++; this.tell(); this.active.pause(); }
      return;
    }
    const old = this.active, s = this.standby;
    s.playbackRate = this.rate;
    s.muted = this.mute;
    if (this.want) void s.play().catch(() => {});
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
  private tell() { const p = this.active.parentElement; if (p) { p.dataset.swaps = String(this.stats.swaps); p.dataset.waits = String(this.stats.waits); } }

  private startLoop() {
    this.stopLoop();
    const tick = () => {
      if (!this.want || this.dead) return;
      const t = this.time;
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
