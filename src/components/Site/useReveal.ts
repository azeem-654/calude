/**
 * Bring an element in when it arrives on screen.
 *
 * The page is a long column of cards, and a column of cards that is simply
 * *there* reads as a spreadsheet. What makes a marketing page feel built is
 * that each row assembles itself as you reach it — so this adds one class, and
 * the CSS owns what that class means.
 *
 * Deliberately one-way. Re-hiding a card when it leaves the viewport means
 * scrolling back up replays every animation, which is nauseating on a long
 * page and makes the browser's back button feel broken. Once seen, stays seen.
 */
import { useEffect, useRef } from 'react';

export function useReveal<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    /*
     * Somebody who has asked their system not to animate things has asked for
     * a reason — vestibular disorders make parallax and slide-ins genuinely
     * unpleasant. They get the finished state immediately, not a degraded one.
     */
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('in');
      return;
    }

    /* Already on screen at mount — the hero, on every load. Observers fire
       asynchronously, so without this the first paint is a blank hero. */
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).classList.add('in');
          io.unobserve(e.target);
        }
      },
      /*
       * Fires when the element is properly in view, not as its first pixel
       * appears.
       *
       * At -12%/0.08 the entrance was finished before it reached anywhere you
       * would look, which is most of why the page read as having no animation.
       * A quarter of the viewport of margin means the movement plays where the
       * eye already is.
       */
      { rootMargin: '0px 0px -24% 0px', threshold: 0.12 },
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return ref;
}

/**
 * The same thing for a whole group, so a grid's children can stagger.
 *
 * Each child is given its index as a custom property; the CSS turns that into
 * a delay. Doing it here rather than with an observer per card keeps one
 * observer for the group and one class for the animation.
 */
export function useRevealGroup<T extends HTMLElement = HTMLElement>(selector = ':scope > *') {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const kids = Array.from(el.querySelectorAll<HTMLElement>(selector));
    kids.forEach((k, i) => k.style.setProperty('--i', String(i)));

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('in');
      return;
    }

    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).classList.add('in');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -20% 0px', threshold: 0.08 },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [selector]);

  return ref;
}
