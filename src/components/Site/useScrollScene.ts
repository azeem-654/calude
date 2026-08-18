/**
 * Scroll, turned into a continuous position rather than a step.
 *
 * The page scrolls normally — a tall document with a fixed stage on top of it —
 * and every pixel of that scroll moves the scene by a proportional amount. A
 * flick of the wheel nudges the next screen a little way in; keep going and it
 * arrives. Nothing snaps, and nothing waits for a gesture to finish.
 *
 * Two deliberate choices.
 *
 * The value is eased toward its target rather than followed exactly. Raw scroll
 * position tracks the wheel one-to-one and feels brittle; a light lag makes the
 * same movement read as weight. `EASE` is how much of the remaining distance is
 * covered each frame — low is slow and heavy, high is immediate.
 *
 * Frames are driven by requestAnimationFrame and applied by the caller writing
 * styles straight onto DOM nodes. Putting this value in React state would
 * re-render nine scenes sixty times a second, which is how a page like this
 * ends up janky.
 */
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

/** Fraction of the remaining distance covered per frame. */
const EASE = 0.085;
/** Below this the animation has arrived; stop nudging and idle. */
const SETTLED = 0.00012;

export interface SceneScroll {
  /** Scroll so that scene `i` is the one on screen. */
  scrollTo: (i: number) => void;
}

export function useScrollScene(
  count: number,
  /** How many viewport heights of scroll one scene occupies. */
  sceneVh: number,
  /** Called every animation frame with the eased position, in scenes. */
  onFrame: (u: number) => void,
): SceneScroll {
  const target = useRef(0);
  const current = useRef(0);
  const frame = useRef(0);
  /* Held in a ref so a new callback identity each render does not restart the
     animation loop, and written in an effect rather than during render. */
  const render = useRef(onFrame);
  useLayoutEffect(() => { render.current = onFrame; }, [onFrame]);

  /** One scene, in pixels of scroll. */
  const stride = useCallback(() => (sceneVh / 100) * window.innerHeight, [sceneVh]);

  const measure = useCallback(() => {
    target.current = Math.max(0, window.scrollY) / stride();
  }, [stride]);

  useEffect(() => {
    const reduced = typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches;

    measure();
    current.current = target.current;

    const tick = () => {
      const gap = target.current - current.current;
      /* Snapping to the target when the gap is tiny stops a permanent
         sub-pixel wobble that would keep the loop busy for ever. */
      current.current = reduced || Math.abs(gap) < SETTLED
        ? target.current
        : current.current + gap * EASE;
      render.current(current.current);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);

    const onScroll = () => measure();
    const onResize = () => { measure(); current.current = target.current; };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(frame.current);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [measure]);

  const scrollTo = useCallback((i: number) => {
    const to = Math.max(0, Math.min(count - 1, i)) * stride();
    window.scrollTo({ top: to, behavior: 'smooth' });
  }, [count, stride]);

  return { scrollTo };
}

/* ── The little bits of maths every scene needs ───────────────────────── */

export const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** 0 below `a`, 1 above `b`, eased in between. */
export function smoothstep(a: number, b: number, n: number): number {
  const t = clamp01((n - a) / (b - a || 1));
  return t * t * (3 - 2 * t);
}

export const mix = (from: number, to: number, t: number) => from + (to - from) * t;
