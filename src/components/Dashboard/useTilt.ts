import { useCallback, useRef } from 'react';

/**
 * Pointer-driven 3D tilt for a card.
 *
 * The rotation is written straight to two CSS custom properties rather than
 * held in React state: a mousemove handler that calls setState re-renders the
 * whole card on every pixel of pointer travel, and with a rail of a dozen cards
 * that is the difference between smooth and visibly dropping frames. The
 * transition and the transform itself live in CSS, so the browser keeps the
 * whole thing on the compositor.
 *
 * Honours the reader's motion preference: when they have asked for less, the
 * handlers write nothing and the card stays flat.
 */
export function useTilt(max = 6) {
  const ref = useRef<HTMLElement | null>(null);

  const still = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (still) return;
    const el = e.currentTarget;
    const box = el.getBoundingClientRect();
    // −0.5 … +0.5 from the card's centre.
    const px = (e.clientX - box.left) / box.width - 0.5;
    const py = (e.clientY - box.top) / box.height - 0.5;
    // Y rotation follows the horizontal offset; X is inverted so the card tips
    // *towards* the pointer rather than away from it.
    el.style.setProperty('--tilt-y', `${(px * max).toFixed(2)}deg`);
    el.style.setProperty('--tilt-x', `${(-py * max).toFixed(2)}deg`);
  }, [max, still]);

  const onPointerLeave = useCallback((e: React.PointerEvent<HTMLElement>) => {
    e.currentTarget.style.setProperty('--tilt-y', '0deg');
    e.currentTarget.style.setProperty('--tilt-x', '0deg');
  }, []);

  return { ref, tiltProps: { onPointerMove, onPointerLeave } };
}
