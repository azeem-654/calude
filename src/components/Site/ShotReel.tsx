/**
 * A module, shown a screen at a time.
 *
 * ── What it replaced, and why ──
 *
 * Every module on this page used to be a looping video of its screen being
 * scrolled from top to bottom. That proves the screen is long. The part that
 * answers "does this do what I am looking for" went past in half a second, at a
 * size nobody could read, between two stretches of table. The owner put it
 * plainly: show the features, not the scroll.
 *
 * So a module is two to five photographs of its moments that matter, from
 * `reels.ts`, one at a time. Each holds still long enough to read, drifts very
 * slowly so the page does not feel frozen, and changes to the next with its
 * caption — so the words under the picture are always about the picture.
 *
 * ── Motion is a preference ──
 *
 * With reduced motion asked for (by the system or by this browser's own
 * setting in `services/motion.ts`), nothing advances on its own and nothing
 * drifts: the first screen is shown, and the arrows and dots still step
 * through by hand. The drift is a CSS class, so the media query reaches it; the
 * advancing is a timer, so it is gated here, where a media query cannot reach.
 *
 * ── Costs ──
 *
 * Nothing advances while the reel is off screen, the tab is hidden, or a
 * pointer or keyboard focus is on it — somebody reading a caption should not
 * have it change under them. Pictures are lazy, and only the one showing and
 * the next are ever in the document's way.
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motionReduced } from '../../services/motion';
import type { ReelShot } from './reels';

const HOLD_MS = 5200;
/* On a phone a screen is shown larger and panned across (see site.css), so
   it needs longer to be read: the pan is the time it takes to follow. */
const HOLD_NARROW_MS = 7600;
const narrow = () => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 760px)').matches;

const src = (file: string) =>
  `${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}/site/reel/${file}.webp`;

export default function ShotReel({
  shots, label, eager = false, chrome = true,
}: {
  shots: ReelShot[];
  /** What the reel is of, for a screen reader: "AI Autopilot". */
  label: string;
  /** The hero's reel loads at once; everything else waits to be scrolled to. */
  eager?: boolean;
  /** The three browser dots across the top. */
  chrome?: boolean;
}) {
  const [at, setAt] = useState(0);
  const [inView, setInView] = useState(false);
  const [held, setHeld] = useState(false);
  const [still] = useState(() => motionReduced());
  const [hold] = useState(() => (narrow() ? HOLD_NARROW_MS : HOLD_MS));
  const box = useRef<HTMLDivElement | null>(null);
  const many = shots.length > 1;

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => setInView(!!e?.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* The advancing. A timeout per shot rather than an interval, so pressing a
     dot restarts the clock for the shot it chose instead of changing it again
     a moment later. */
  useEffect(() => {
    if (!many || still || !inView || held) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const t = window.setTimeout(() => setAt(i => (i + 1) % shots.length), hold);
    return () => window.clearTimeout(t);
  }, [at, many, still, inView, held, shots.length, hold]);

  const go = (i: number) => setAt((i + shots.length) % shots.length);
  const shot = shots[at] ?? shots[0];

  return (
    <div
      className={`dc-reel${inView ? ' in-view' : ''}${held ? ' held' : ''}${many ? '' : ' single'}`}
      ref={box}
      style={{ '--hold': `${hold}ms` } as React.CSSProperties}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false); }}
    >
      <div className="dc-reel-frame">
        {chrome && <div className="dc-chrome" aria-hidden="true"><i /><i /><i /></div>}
        <div className="dc-reel-stage">
          {shots.map((s, i) => {
            const on = i === at;
            /* Only the showing picture and the one after it are loaded early.
               The rest wait until they are close to being shown. */
            const near = on || i === (at + 1) % shots.length;
            return (
              <img
                key={s.file}
                src={src(s.file)}
                alt={on ? s.alt : ''}
                aria-hidden={on ? undefined : true}
                loading={eager && i === 0 ? 'eager' : near ? 'eager' : 'lazy'}
                decoding="async"
                width={1440}
                height={900}
                className={`dc-reel-shot${on ? ' on' : ''}`}
                /* Alternate the direction of the drift so consecutive shots do
                   not all slide the same way. */
                data-drift={i % 2 ? 'b' : 'a'}
              />
            );
          })}
        </div>
      </div>

      <div className="dc-reel-caption">
        {/* Keyed on the shot so the caption fades in with its picture. */}
        <p key={shot.file} className="dc-reel-text">{shot.caption}</p>
        {many && (
          <div className="dc-reel-controls">
            <button type="button" onClick={() => go(at - 1)} aria-label="Previous screen" className="dc-reel-arrow">
              <ChevronLeft size={14} />
            </button>
            <div className="dc-reel-dots" role="tablist" aria-label={`${label} screens`}>
              {shots.map((s, i) => (
                <button
                  key={s.file}
                  type="button"
                  role="tab"
                  aria-selected={i === at}
                  aria-label={`Screen ${i + 1} of ${shots.length}: ${s.caption}`}
                  className={`dc-reel-dot${i === at ? ' on' : ''}`}
                  onClick={() => go(i)}
                >
                  {/* The fill shows how long until the next screen. A class,
                      and restarted per shot by its key. */}
                  {i === at && !still && inView && !held && <span key={at} className="dc-reel-fill" />}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => go(at + 1)} aria-label="Next screen" className="dc-reel-arrow">
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
