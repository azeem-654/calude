/**
 * The wheel, turned into steps.
 *
 * The page does not scroll. One notch of a mouse wheel, one swipe, one arrow
 * key moves the deck on by exactly one panel, and the movement is what animates
 * the content — which is the whole idea of the design this follows.
 *
 * Three things make that bearable rather than infuriating.
 *
 * A trackpad emits a stream of small deltas for one physical gesture, so a
 * naive handler jumps five panels at once. Deltas are accumulated to a
 * threshold and then the deck is locked for the length of the transition, and
 * the accumulator only resets once the stream actually stops.
 *
 * A panel taller than the screen scrolls inside itself first. Only when its
 * content is already at the edge in the direction being scrolled does the wheel
 * move the deck. Hijacking the wheel over text somebody is still reading is the
 * thing that makes pages like this unusable.
 *
 * And the wheel is never the only way through: arrows, Home/End, Page keys and
 * the numbered rail all do the same job, so a person who cannot use a wheel is
 * not stuck on panel one.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** How much accumulated wheel delta counts as one deliberate notch. */
const THRESHOLD = 42;
/** Held for the length of the slide, so one gesture cannot fire twice. */
const LOCK_MS = 680;
/** A gap this long means the previous gesture ended. */
const GESTURE_GAP_MS = 220;
/** Below this a swipe is a tap that wandered. */
const SWIPE_PX = 46;

export interface Deck {
  index: number;
  go: (delta: number) => void;
  to: (index: number) => void;
  /** Attach to the element the gestures should be read from. */
  attach: (node: HTMLElement | null) => void;
}

export function useDeck(count: number, opts: { enabled?: boolean } = {}): Deck {
  const enabled = opts.enabled !== false;
  const [index, setIndex] = useState(0);

  const locked = useRef(false);
  const accum = useRef(0);
  const lastWheelAt = useRef(0);
  const node = useRef<HTMLElement | null>(null);

  const to = useCallback((next: number) => {
    setIndex(i => {
      const clamped = Math.max(0, Math.min(count - 1, next));
      return clamped === i ? i : clamped;
    });
  }, [count]);

  const go = useCallback((delta: number) => {
    setIndex(i => Math.max(0, Math.min(count - 1, i + delta)));
  }, [count]);

  /** Take the lock, or report that a move is already in flight. */
  const claim = useCallback(() => {
    if (locked.current) return false;
    locked.current = true;
    window.setTimeout(() => { locked.current = false; }, LOCK_MS);
    return true;
  }, []);

  /**
   * Whether the thing under the pointer can absorb this scroll itself.
   *
   * Walks up from the target looking for an element that both overflows and
   * still has room to move the way the wheel is pointing.
   */
  const absorbedInside = useCallback((target: EventTarget | null, dy: number): boolean => {
    let el = target instanceof Element ? target : null;
    while (el && el !== node.current) {
      /*
       * Overflowing is not the same as scrolling. An element with
       * `overflow: visible` — the isometric artwork spills past its box on
       * purpose — reports a scrollHeight larger than its clientHeight and can
       * never move a pixel. Handing it the wheel on that basis wedged the deck
       * on the first panel: every notch was given to a box that swallowed it
       * and did nothing.
       */
      const overflowY = getComputedStyle(el).overflowY;
      const scrollable = (overflowY === 'auto' || overflowY === 'scroll')
        && el.scrollHeight - el.clientHeight > 2;
      if (scrollable) {
        const atTop = el.scrollTop <= 0;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        if ((dy > 0 && !atBottom) || (dy < 0 && !atTop)) return true;
      }
      el = el.parentElement;
    }
    return false;
  }, []);

  /* Wheel. Registered by hand because preventDefault needs a non-passive
     listener, which React's onWheel cannot give. */
  useEffect(() => {
    const host = node.current;
    if (!host || !enabled) return;

    const onWheel = (e: WheelEvent) => {
      /* A horizontal trackpad swipe reads as deltaX; either axis advances. */
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (absorbedInside(e.target, delta)) return;

      e.preventDefault();

      const now = Date.now();
      if (now - lastWheelAt.current > GESTURE_GAP_MS) accum.current = 0;
      lastWheelAt.current = now;

      if (locked.current) return;
      accum.current += delta;
      if (Math.abs(accum.current) < THRESHOLD) return;

      const direction = accum.current > 0 ? 1 : -1;
      accum.current = 0;
      if (claim()) go(direction);
    };

    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, [enabled, go, claim, absorbedInside]);

  /* Touch. Whichever axis the finger travelled furthest on wins. */
  useEffect(() => {
    const host = node.current;
    if (!host || !enabled) return;

    let start: { x: number; y: number; absorbed: boolean } | null = null;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      start = { x: t.clientX, y: t.clientY, absorbed: false };
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!start || !t) return;
      const dy = start.y - t.clientY;
      if (absorbedInside(e.target, dy)) start.absorbed = true;
    };
    const onEnd = (e: TouchEvent) => {
      const s = start;
      start = null;
      const t = e.changedTouches[0];
      if (!s || !t || s.absorbed) return;
      const dx = s.x - t.clientX;
      const dy = s.y - t.clientY;
      const moved = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      if (Math.abs(moved) < SWIPE_PX) return;
      if (claim()) go(moved > 0 ? 1 : -1);
    };

    host.addEventListener('touchstart', onStart, { passive: true });
    host.addEventListener('touchmove', onMove, { passive: true });
    host.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      host.removeEventListener('touchstart', onStart);
      host.removeEventListener('touchmove', onMove);
      host.removeEventListener('touchend', onEnd);
    };
  }, [enabled, go, claim, absorbedInside]);

  /* Keys. The wheel is a preference, not a requirement. */
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      /* Never steal a key from something being typed into. */
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'ArrowRight': case 'ArrowDown': case 'PageDown':
          e.preventDefault(); go(1); break;
        case 'ArrowLeft': case 'ArrowUp': case 'PageUp':
          e.preventDefault(); go(-1); break;
        case ' ':
          e.preventDefault(); go(e.shiftKey ? -1 : 1); break;
        case 'Home':
          e.preventDefault(); to(0); break;
        case 'End':
          e.preventDefault(); to(count - 1); break;
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, go, to, count]);

  const setRef = useCallback((el: HTMLElement | null) => { node.current = el; }, []);

  return { index, go, to, attach: setRef };
}
