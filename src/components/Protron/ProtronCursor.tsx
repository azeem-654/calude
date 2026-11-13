/**
 * The pointer that shows where Protron is working (services/protron/cursor.ts).
 *
 * Fixed over the page, never clickable itself; when Protron presses a safe
 * control (screen.ts pressControl) the tip shows a ripple first. It follows the element it was pointed
 * at while the page scrolls (one animation frame at a time, and only while it
 * is showing), rings it, and carries a chip saying what Protron is doing. It
 * fades a moment after the last thing it was told, or at once on `done`.
 */
import { useEffect, useRef, useState } from 'react';
import { CURSOR_EVENT, type CursorDetail } from '../../services/protron/cursor';

const LINGER_MS = 2600;

export default function ProtronCursor() {
  const [shown, setShown] = useState(false);
  const [label, setLabel] = useState('');
  const pointer = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const ripple = useRef<HTMLSpanElement>(null);
  const target = useRef<Element | null>(null);

  useEffect(() => {
    let raf = 0;
    let hide = 0;
    const place = () => {
      const el = target.current;
      const p = pointer.current, g = ring.current;
      if (!el || !p || !g || !el.isConnected) return;
      const r = el.getBoundingClientRect();
      /* The tip rests just inside the element's lower right, where a hand on a mouse would be. */
      const x = Math.min(window.innerWidth - 24, Math.max(4, r.left + Math.min(r.width * 0.72, r.width - 10)));
      const y = Math.min(window.innerHeight - 24, Math.max(4, r.top + Math.min(r.height * 0.7, r.height - 6)));
      p.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      g.style.transform = `translate(${Math.round(r.left - 4)}px, ${Math.round(r.top - 4)}px)`;
      g.style.width = `${Math.round(r.width + 8)}px`;
      g.style.height = `${Math.round(r.height + 8)}px`;
    };
    const follow = () => { place(); raf = requestAnimationFrame(follow); };
    const on = (e: Event) => {
      const d = (e as CustomEvent<CursorDetail>).detail;
      window.clearTimeout(hide);
      if (d?.done || !d?.el) {
        hide = window.setTimeout(() => { setShown(false); cancelAnimationFrame(raf); raf = 0; target.current = null; }, 700);
        return;
      }
      target.current = d.el;
      setLabel(d.label ?? '');
      setShown(true);
      place();
      /* A press: restart the ripple at the tip. */
      if (d.click && ripple.current) {
        const rp = ripple.current;
        rp.classList.remove('is-on');
        void rp.offsetWidth;
        rp.classList.add('is-on');
      }
      if (!raf) raf = requestAnimationFrame(follow);
      hide = window.setTimeout(() => { setShown(false); cancelAnimationFrame(raf); raf = 0; target.current = null; }, LINGER_MS + 6000);
    };
    window.addEventListener(CURSOR_EVENT, on);
    return () => { window.removeEventListener(CURSOR_EVENT, on); cancelAnimationFrame(raf); window.clearTimeout(hide); };
  }, []);

  return (
    <div className="pt-cursor-layer" data-shown={shown ? '1' : '0'} aria-hidden>
      <div ref={ring} className="pt-cursor-ring" />
      <div ref={pointer} className="pt-cursor">
        <span ref={ripple} className="pt-cursor-ripple" />
        <svg width="24" height="26" viewBox="0 0 24 26" focusable="false">
          <path d="M3 2.5 L3 21 L8.2 16.4 L11.6 23.6 L15 22 L11.7 15 L19.2 14.6 Z" fill="#d97757" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
        </svg>
        {label && <span className="pt-cursor-chip">{label}</span>}
      </div>
    </div>
  );
}
