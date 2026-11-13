/**
 * The page-drawn demonstration player: a 16:9 "film" of the app, drawn as
 * HTML, with a pointer that moves like a hand, steps and captions.
 *
 * ── Why one engine ──
 *
 * It began as the home page's AutopilotDemo (Site/AutopilotDemo.tsx). The
 * owner then asked for two more in the same look — the whole platform on the
 * home page (Site/PlatformDemo.tsx) and how AI Prospecting fills a list day
 * by day, inside the app (Prospecting/ProspectingDemo.tsx). Three copies of
 * the clock, the pointer and the scaling would drift apart the first time one
 * was fixed, so the player lives here and each film is only its story and
 * its scenes.
 *
 * ── Why it is drawn rather than recorded ──
 *
 * A recorded MP4 goes stale the day a label changes and is blurry at one of
 * the two widths; this is crisp at both and costs no download. Every film is
 * an illustration with an example business and says so in the frame
 * (`exLabel`), so a screenshot of it says it too. No figure in a film may
 * read as a result (CLAUDE.md: no invented figures on a customer screen).
 *
 * ── How it moves ──
 *
 * Every scene is laid out once, in full, at a fixed design size, and scaled
 * to the frame with one transform — so nothing reflows while it plays, and
 * the pointer's targets are measured from the real elements (`data-k`; their
 * layout offsets, which ignore the reveal transforms) instead of written as
 * pixels that would be wrong at another width. A narrow frame gets a smaller
 * design size with fewer, larger parts (`is-compact`), because one design
 * scaled to a phone puts its text at four pixels.
 *
 * Each step is a list of cues on its own clock: reveal a part, type into a
 * box, move the pointer, click. One requestAnimationFrame loop runs that
 * clock, and only while the film is playing, at least partly on screen and
 * the tab visible. It writes only classes (opacity/transform transitions in
 * demoFilm.css) and the pointer's transform; React renders once per step,
 * never per frame. The pointer travels on a slight arc with a minimum-jerk
 * profile, never disappears, and carries on from wherever it was when a step
 * changes — it cannot teleport. A click waits for the pointer to arrive.
 *
 * Somebody whose device asks for less motion gets each step as a still,
 * finished frame with its caption, and moves between them with the buttons.
 *
 * No sound: Protron's narrated voice needs a signed-in workspace, and the
 * owner asked for no browser voice; the captions carry every step.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Pause, Play, SkipBack, SkipForward, type LucideIcon } from 'lucide-react';
import { LogoMark } from './Logo';
import { motionReduced } from '../../services/motion';
import './demoFilm.css';

/* ── The story's vocabulary ────────────────────────────────────────────── */

export type Cue =
  | { at: number; do: 'on'; k: string }
  | { at: number; do: 'type'; k: string; ms: number }
  | { at: number; do: 'move'; k: string; ms: number; say?: string }
  | { at: number; do: 'click'; k: string };

export type FilmStep = {
  title: string;
  caption: string;
  /** What the top bar says while this step plays. */
  crumb: ReactNode;
  /** Which rail item is lit. */
  rail: string;
  ms: number;
  cues: Cue[];
};

export type RailItem = { id: string; icon: LucideIcon; label: string };

export const on = (at: number, k: string): Cue => ({ at, do: 'on', k });
export const type = (at: number, k: string, ms: number): Cue => ({ at, do: 'type', k, ms });
/** `say` is the label beside the pointer, naming what it is doing, the way an AI agent's cursor does. */
export const move = (at: number, k: string, ms: number, say?: string): Cue => ({ at, do: 'move', k, ms, say });
export const click = (at: number, k: string): Cue => ({ at, do: 'click', k });

/* ── Drawing helpers ───────────────────────────────────────────────────── */

/** Text that types itself: every character is laid out from the start and only shown. */
export function Typed({ k, text }: { k: string; text: string }) {
  return (
    <span className="apd-typed" data-k={k} data-typed="">
      {Array.from(text).map((c, i) => <span key={i} className="apd-c">{c}</span>)}
    </span>
  );
}

/** A labelled box that the pointer clicks and types into (`<k>t` is its text). */
export function Field({ k, label, ph, text, wide }: { k: string; label: string; ph: string; text: string; wide?: boolean }) {
  return (
    <div className={`apd-field apd-t${wide ? ' apd-wide-only' : ''}`} data-k={k}>
      <span className="apd-lbl">{label}</span>
      <span className="apd-input">
        <span className="apd-ph">{ph}</span>
        <Typed k={`${k}t`} text={text} />
      </span>
    </div>
  );
}

/* ── Layout: design sizes, one transform ───────────────────────────────── */

type Fit = { w: number; h: number; k: number; compact: boolean };

/** The design size for a frame `c` px wide: whichever keeps the app's text at a readable size once scaled. */
function fitFor(c: number): Fit {
  if (c < 620) return { w: 640, h: 360, k: c / 640, compact: true };
  if (c < 900) return { w: 960, h: 540, k: c / 960, compact: false };
  return { w: 1200, h: 675, k: c / 1200, compact: false };
}

/** Where an element sits inside the canvas, from layout offsets — transforms (reveals, the scale) do not count. */
function boxIn(el: HTMLElement, root: HTMLElement) {
  let x = 0, y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight, ok: n === root };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
/** Minimum-jerk easing: velocity and acceleration are zero at both ends, as in a hand's reach. */
const reach = (s: number) => s * s * s * (10 - 15 * s + 6 * s * s);

type Move = { at: number; ms: number; x0: number; y0: number; cx: number; cy: number; x1: number; y1: number };
type Typing = { at: number; ms: number; chars: HTMLElement[]; shown: number };

export type SceneProps = { className: string; ref: (e: HTMLElement | null) => void };
export type FilmCtx = {
  step: number;
  compact: boolean;
  /** Spread onto each scene's <section>: its class (lit while it plays) and its ref. */
  scene: (i: number, cls: string) => SceneProps;
};

/* ── The player ────────────────────────────────────────────────────────── */

export default function DemoFilm({
  steps, rail, label, children, className = '', exLabel = 'Illustration · example business', brand = 'Protected Central',
}: {
  steps: FilmStep[];
  rail: RailItem[];
  /** The player's accessible name. */
  label: string;
  children: (ctx: FilmCtx) => ReactNode;
  className?: string;
  exLabel?: string;
  brand?: string;
}) {
  const root = useRef<HTMLElement | null>(null);
  const screen = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLDivElement | null>(null);
  const pointer = useRef<HTMLDivElement | null>(null);
  const ripple = useRef<HTMLSpanElement | null>(null);
  const rippleAt = useRef<HTMLDivElement | null>(null);
  const scenes = useRef<(HTMLElement | null)[]>([]);
  const fills = useRef<(HTMLSpanElement | null)[]>([]);

  const [reduced] = useState(() => motionReduced());
  const [fit, setFit] = useState<Fit>(() => fitFor(1180));
  const [step, setStep] = useState(0);
  /* Bumped by a chip or a button, so pressing the step that is playing starts it again. */
  const [take, setTake] = useState(0);
  const [playing, setPlaying] = useState(!reduced);
  const [inView, setInView] = useState(false);
  const [shown, setShown] = useState(() => typeof document === 'undefined' || !document.hidden);

  /* The clock and what it has done so far in this step. Refs, not state: they
     change every frame and nothing React draws depends on them. */
  const t = useRef(0);
  const fired = useRef(0);
  const typing = useRef<Typing[]>([]);
  const travel = useRef<Move | null>(null);
  const hits = useRef<{ el: HTMLElement; until: number }[]>([]);
  const ptr = useRef({ x: 0, y: 0 });

  /* ── Size: one measurement per resize, never per frame ── */
  useLayoutEffect(() => {
    const el = screen.current;
    if (!el) return;
    const size = () => {
      const next = fitFor(el.clientWidth || 1180);
      setFit(f => (f.w === next.w && Math.abs(f.k - next.k) < 0.0005 ? f : next));
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── Only while somebody can see it ── */
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    const vis = () => setShown(!document.hidden);
    document.addEventListener('visibilitychange', vis);
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', vis); };
  }, []);

  const setPointer = useCallback((x: number, y: number) => {
    ptr.current = { x, y };
    const p = pointer.current;
    if (p) p.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
  }, []);

  const find = (k: string): HTMLElement[] => {
    const sc = scenes.current[step];
    return sc ? Array.from(sc.querySelectorAll<HTMLElement>(`[data-k="${k}"]`)) : [];
  };

  /** One cue, fired at `now` (ms into the step). `still` draws its end state with no movement. */
  const fire = (cue: Cue, now: number, still: boolean) => {
    const els = find(cue.k);
    const el = els[0];
    const cv = canvas.current;
    if (!el || !cv) return;
    if (cue.do === 'on') { els.forEach(e => e.classList.add('is-on')); return; }
    if (cue.do === 'type') {
      const chars = Array.from(el.querySelectorAll<HTMLElement>('.apd-c'));
      if (still) { chars.forEach(c => c.classList.add('is-on')); return; }
      typing.current.push({ at: now, ms: cue.ms, chars, shown: 0 });
      return;
    }
    if (cue.do === 'click') {
      el.classList.add('is-clicked');
      /* A part this design size leaves out gets no ring where the pointer is not. */
      if (still || !el.offsetParent) return;
      el.classList.add('is-hit');
      hits.current.push({ el, until: now + 700 });
      /* The ring is drawn where the pointer's tip is, and animated with the
         Web Animations API: transform and opacity only, no class juggling
         or forced reflow to restart a CSS animation. */
      const at = rippleAt.current, r = ripple.current;
      if (at && r) {
        at.style.transform = `translate3d(${ptr.current.x.toFixed(2)}px, ${ptr.current.y.toFixed(2)}px, 0)`;
        r.animate?.([{ transform: 'scale(0.2)', opacity: 0.9 }, { transform: 'scale(1)', opacity: 0 }], { duration: 620, easing: 'cubic-bezier(.2,.7,.3,1)' });
      }
      pointer.current?.animate?.([{ scale: '1' }, { scale: '0.86' }, { scale: '1' }], { duration: 240, easing: 'ease-out' });
      return;
    }
    /* move: to a point a little inside the target, from wherever the pointer is. */
    if (still) return;
    const b = boxIn(el, cv);
    if (!b.ok || (!b.w && !b.h)) return; // not drawn at this size (a wide-only part on a phone)
    const x1 = b.x + Math.min(b.w * 0.5, 120), y1 = b.y + b.h * 0.55;
    const { x: x0, y: y0 } = ptr.current;
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    /* A gentle arc that bows upward, the way a wrist swings — a straight
       line at an even speed reads as a robot. */
    let nx = -dy / len, ny = dx / len;
    if (ny > 0) { nx = -nx; ny = -ny; }
    const bow = Math.min(90, len * 0.16);
    /* A long reach takes longer: at a fixed duration a trip across the
       screen is a blur nobody's eye can follow. */
    const ms = Math.max(cue.ms, 350 + len * 0.85);
    travel.current = { at: now, ms, x0, y0, x1, y1, cx: (x0 + x1) / 2 + nx * bow, cy: (y0 + y1) / 2 + ny * bow };
    const say = pointer.current?.querySelector<HTMLElement>('.apd-ptr-say');
    if (say) {
      if (cue.say) say.textContent = cue.say;
      say.classList.toggle('is-on', !!cue.say);
      /* Near the right or bottom edge it flips to the other side, so it never leaves the frame. */
      say.classList.toggle('is-left', x1 > cv.offsetWidth * 0.62);
      say.classList.toggle('is-up', y1 > cv.offsetHeight * 0.76);
    }
  };

  /** Advances the step's drawing to time `now` (ms into the step). */
  const advance = (now: number) => {
    const cues = steps[step].cues;
    while (fired.current < cues.length && cues[fired.current].at <= now) {
      /* A click waits for the pointer to arrive — it never lands on a
         target the pointer has not reached — and the cues after it wait too. */
      if (cues[fired.current].do === 'click' && travel.current) break;
      fire(cues[fired.current++], now, false);
    }
    for (const ty of typing.current) {
      const n = Math.round(ty.chars.length * clamp01((now - ty.at) / ty.ms));
      if (n === ty.shown) continue;
      ty.chars[ty.shown - 1]?.classList.remove('is-caret');
      while (ty.shown < n) ty.chars[ty.shown++].classList.add('is-on');
      if (n < ty.chars.length) ty.chars[n - 1]?.classList.add('is-caret');
    }
    typing.current = typing.current.filter(ty => ty.shown < ty.chars.length);
    const m = travel.current;
    if (m) {
      const s = reach(clamp01((now - m.at) / m.ms)), u = 1 - s;
      setPointer(u * u * m.x0 + 2 * u * s * m.cx + s * s * m.x1, u * u * m.y0 + 2 * u * s * m.cy + s * s * m.y1);
      if (s >= 1) travel.current = null;
    }
    if (hits.current.length) {
      hits.current = hits.current.filter(h => (now < h.until ? true : (h.el.classList.remove('is-hit'), false)));
    }
    const f = fills.current[step];
    if (f) f.style.transform = `scaleX(${clamp01(now / steps[step].ms).toFixed(4)})`;
  };

  /* ── A step begins: its scene is cleared while invisible, then plays ── */
  useLayoutEffect(() => {
    const sc = scenes.current[step];
    if (!sc) return;
    /* Transitions off for the reset, or every part would visibly fade back
       out as its scene fades in. On again a frame later. */
    sc.classList.add('apd-reset');
    sc.querySelectorAll('.is-on, .is-clicked, .is-hit, .is-caret').forEach(e => e.classList.remove('is-on', 'is-clicked', 'is-hit', 'is-caret'));
    t.current = 0; fired.current = 0; typing.current = []; travel.current = null; hits.current = [];
    /* A new step says nothing until its first move names what it is doing. */
    pointer.current?.querySelector('.apd-ptr-say')?.classList.remove('is-on');
    fills.current.forEach((f, i) => { if (f) f.style.transform = i < step ? 'scaleX(1)' : 'scaleX(0)'; });
    if (reduced) {
      steps[step].cues.forEach(c => fire(c, c.at, true));
      fills.current[step]?.style.setProperty('transform', 'scaleX(1)');
    }
    const raf = requestAnimationFrame(() => sc.classList.remove('apd-reset'));
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fire reads the step it was rendered with
  }, [step, take, fit.w, reduced]);

  /* The pointer starts low on the right, in view, the first time and after a resize to another design size. */
  useLayoutEffect(() => { setPointer(fit.w * 0.74, fit.h * 0.8); }, [fit.w, fit.h, setPointer]);

  /* ── The clock ── */
  const running = playing && inView && shown && !reduced;
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      /* A long gap (a dropped frame, a debugger) moves the story on by one
         frame's worth, not by the gap. */
      t.current += Math.min(50, now - last);
      last = now;
      advance(t.current);
      if (t.current >= steps[step].ms) { setStep(s => (s + 1) % steps.length); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- advance reads the current step
  }, [running, step, take]);

  const go = (i: number) => { setStep((i + steps.length) % steps.length); setTake(n => n + 1); };
  const cur = steps[step];
  const scene = (i: number, cls: string): SceneProps => ({
    className: `apd-scene ${cls}${step === i ? ' is-now' : ''}`,
    ref: (e: HTMLElement | null) => { scenes.current[i] = e; },
  });

  return (
    <section
      ref={root}
      className={`apd${fit.compact ? ' is-compact' : fit.w < 1200 ? ' is-mid' : ' is-big'}${reduced ? ' is-still' : ''}${className ? ` ${className}` : ''}`}
      aria-roledescription="video"
      aria-label={label}
      data-step={step}
    >
      <div className="apd-screen" ref={screen}>
        <div
          className="apd-canvas"
          ref={canvas}
          style={{ width: fit.w, height: fit.h, transform: `scale(${fit.k})` }}
          aria-hidden="true"
        >
          <div className="apd-app">
            <header className="apd-top">
              <LogoMark size={fit.compact ? 20 : 22} />
              <b className="apd-brand">{brand}</b>
              <span className="apd-crumbs">
                {steps.map((s, i) => (
                  <span key={s.title} className={`apd-crumb${i === step ? ' is-now' : ''}`}>{s.crumb}</span>
                ))}
              </span>
              {/* Said in the frame itself, so a screenshot of it says it too. */}
              <span className="apd-ex">{exLabel}</span>
            </header>
            <div className="apd-body">
              <nav className="apd-rail">
                {rail.map(r => (
                  <span key={r.id} className={`apd-rail-i${cur.rail === r.id ? ' is-now' : ''}`}><r.icon size={17} /><i>{r.label}</i></span>
                ))}
              </nav>
              <div className="apd-main">
                {children({ step, compact: fit.compact, scene })}
              </div>
            </div>
          </div>
          <div className="apd-ripple-at" ref={rippleAt}><span className="apd-ripple" ref={ripple} /></div>
          <div className="apd-ptr" ref={pointer}>
            <svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2.5 L4 19.5 L8.6 15.4 L11.5 21.8 L14.6 20.4 L11.8 14.2 L18 14.2 Z" fill="#D97757" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round" /></svg>
            <span className="apd-ptr-say" />
          </div>
        </div>
      </div>

      <div className="apd-bar">
        <div className="apd-ctls">
          {reduced && <button type="button" className="apd-ctl" onClick={() => go(step - 1)} aria-label="Previous step"><SkipBack size={15} /></button>}
          {!reduced && (
            <button type="button" className="apd-ctl is-play" onClick={() => setPlaying(v => !v)} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
            </button>
          )}
          {reduced && <button type="button" className="apd-ctl" onClick={() => go(step + 1)} aria-label="Next step"><SkipForward size={15} /></button>}
        </div>
        <div className="apd-info">
          <ol className="apd-chips">
            {steps.map((s, i) => (
              <li key={s.title}>
                <button
                  type="button"
                  className={`apd-chip${i === step ? ' is-now' : ''}${i < step ? ' is-done' : ''}`}
                  onClick={() => go(i)}
                  aria-label={`Step ${i + 1}: ${s.title}`}
                  aria-current={i === step ? 'step' : undefined}
                >
                  <span className="apd-chip-l"><i>{i + 1}</i><span>{s.title}</span></span>
                  <span className="apd-chip-track"><span ref={e => { fills.current[i] = e; }} /></span>
                </button>
              </li>
            ))}
          </ol>
          <p className="apd-cap" aria-live={running ? 'off' : 'polite'}>
            <b>Step {step + 1} · {cur.title}.</b> {cur.caption}
          </p>
        </div>
      </div>
    </section>
  );
}
