/**
 * One scroll from the hero to the film, and one back.
 *
 * The owner's request: on a laptop, a single turn of the wheel (or a single
 * swipe of the trackpad) from the top should put the launch film exactly in
 * the middle of what is under the nav, and a single turn back up should return
 * to the hero filling the screen. Below the film the page is long, and it must
 * scroll like any other page.
 *
 * ── Why a few lines of script and not `scroll-snap-type: y mandatory` ──
 *
 * Mandatory snapping is a property of the whole scroller. With two snap points
 * at the top of a page several thousand pixels long, a mandatory scroller pulls
 * everybody below the film back up to it — a page you cannot leave. Proximity
 * snapping does not trap, but it only snaps when the scroll happens to end
 * near a point, so one notch of a mouse wheel (about 100px) from the top just
 * moves the hero up 100px. Neither is "one step".
 *
 * So the step is made here, and only for wheel input, and only in the band
 * between the top and the film: a wheel down anywhere above the film's
 * centred position goes to it; a wheel up from there (or from just below it)
 * goes to the top. Everything else — below the film, the keyboard, a
 * scrollbar drag, a touch screen (which gets CSS proximity snapping instead,
 * site.css) — is the browser's own scrolling, untouched.
 *
 * ── One gesture, one step ──
 *
 * A trackpad swipe is not one event but a burst of them, and then a second
 * burst of momentum that can last over a second. Taking each as a request
 * would step to the film and straight on past it. After a step, wheel events
 * are swallowed for STEP_MS, and for as long after that as they keep arriving
 * close together (a burst still running), up to STEP_MAX_MS — so a mouse's
 * deliberate second notch is honoured and a trackpad's tail is not.
 *
 * ── When it does not step at all ──
 *
 * Only on a landscape window, and only when the whole of the hero was on the
 * first screen. Stepping from the top to the film would otherwise skip
 * whatever of the hero did not fit. A portrait tablet is excluded outright:
 * there the hero only just fits, and whether it does changes with the length
 * of the caption under the picture — a step that came and went every five
 * seconds would be worse than none. The touch snapping (the `dc-snap` class)
 * follows the same rule.
 */
import { useEffect, type RefObject } from 'react';
import { motionReduced } from '../../services/motion';

const STEP_MS = 800;
const STEP_MAX_MS = 1700;
/* Gaps in a trackpad burst are a frame or two; a person's next notch is
   longer than this. */
const BURST_GAP_MS = 140;

/** Whether something under the pointer would scroll itself in this direction. */
function innerScroller(from: EventTarget | null, down: boolean): boolean {
  for (let el = from instanceof Element ? from : null; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
      if (down ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
    }
  }
  return false;
}

export function useFilmStep(heroInner: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = document.documentElement;
    /* The scroll padding (the nav's height, so "centred" and every anchor
       mean "under the nav") belongs to this page only; the app is the same
       bundle and must not inherit it. */
    root.classList.add('dc-root');

    const frame = () => document.querySelector<HTMLElement>('.dc-film-frame');
    const navH = () => document.querySelector('.dc-nav')?.getBoundingClientRect().height ?? 0;

    /** The scroll position that puts the film's centre in the middle of the area under the nav. */
    const filmAt = (): number | null => {
      const f = frame();
      if (!f) return null;
      const r = f.getBoundingClientRect();
      const n = navH();
      return Math.max(0, Math.round(r.top + window.scrollY - n - (window.innerHeight - n - r.height) / 2));
    };

    /** A landscape window with the whole hero on its first screen, so stepping past it skips nothing. */
    const steps = () => {
      const h = heroInner.current;
      if (!h || window.innerWidth <= window.innerHeight) return false;
      return h.getBoundingClientRect().bottom + window.scrollY <= window.innerHeight + 1;
    };

    const mark = () => { root.classList.toggle('dc-snap', steps()); };
    mark();
    const ro = new ResizeObserver(mark);
    ro.observe(root);

    let stepAt = -Infinity;
    let lastSwallow = -Infinity;
    const go = (top: number) => {
      stepAt = lastSwallow = performance.now();
      window.scrollTo({ top, behavior: motionReduced() ? 'auto' : 'smooth' });
    };

    const onWheel = (e: WheelEvent) => {
      /* Pinch-zoom arrives as a wheel with ctrl held; sideways is not ours. */
      if (e.ctrlKey || e.defaultPrevented || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const now = performance.now();
      const since = now - stepAt;
      if (since < STEP_MS || (since < STEP_MAX_MS && now - lastSwallow < BURST_GAP_MS)) {
        e.preventDefault();
        lastSwallow = now;
        return;
      }
      if (!steps() || innerScroller(e.target, e.deltaY > 0)) return;
      const t = filmAt();
      if (t === null || t < 8) return;
      const y = window.scrollY;
      if (e.deltaY > 0 && y < t - 2) {
        e.preventDefault();
        go(t);
      } else if (e.deltaY < 0 && y > 2 && y <= t + 2) {
        e.preventDefault();
        go(0);
      } else if (e.deltaY < 0 && y > t + 2 && y < t + window.innerHeight / 2) {
        /* Coming back up from just below the film: stop on it, centred, on
           the way to the top, rather than leaving it half under the nav. */
        e.preventDefault();
        go(t);
      }
    };
    window.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      window.removeEventListener('wheel', onWheel);
      ro.disconnect();
      root.classList.remove('dc-root', 'dc-snap');
    };
  }, [heroInner]);
}
