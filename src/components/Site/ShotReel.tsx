/**
 * A module, shown a screen at a time — every screen whole, and readable.
 *
 * ── What it replaced, and why ──
 *
 * Every module on this page used to be a looping video of its screen being
 * scrolled from top to bottom, then a slideshow of close crops, then of whole
 * screens shrunk to the space. The first two showed half a screen; the last
 * showed all of it at a size nobody could read — a 1920-wide app window drawn
 * 600px wide puts its 14px text at about 4px. The owner asked for both: the
 * complete screen, and its content readable on a phone and on a big monitor.
 *
 * So a reel is a strip: the screen showing is drawn whole in the middle with
 * the one before and after smaller beside it, and the strip slides along —
 * nothing is cropped at any point of the movement. Then, as product sites do
 * when a full screen is too dense to read at page size:
 *
 *   - On a wide screen each slide opens whole, then zooms smoothly into the
 *     part that carries its argument (`focus` in reels.ts — the workflow, the
 *     table, the chart), holds there long enough to read, and zooms back out
 *     to the whole screen before the next. Captured at 1.5× so the zoom stays
 *     sharp (`srcset`: 1200 and 2400 wide).
 *   - On a phone a desktop screen cannot be made readable by any zoom that
 *     keeps it whole, so the phone gets the app's own phone layout (`-m`,
 *     captured at 390px wide, 3×) — the complete screen as somebody would see
 *     it on that phone, at nearly the size they would see it.
 *   - Everywhere, the screen showing can be opened full size (a click on it,
 *     or its expand button), and a phone can pinch it there.
 *
 * ── Motion is a preference ──
 *
 * With reduced motion asked for (by the system or by this browser's own
 * setting in `services/motion.ts`), nothing advances, slides or zooms on its
 * own: the first screen is shown whole, and the arrows, dots and full-size
 * view still work by hand.
 *
 * ── Costs ──
 *
 * Nothing advances while the reel is off screen or the tab is hidden, or
 * while keyboard focus is in its controls. A mouse resting on it does not
 * stop it — the owner found the slides freezing whenever the pointer happened
 * to sit over them. Pictures are lazy: only the one showing and its
 * neighbours are loaded early, and each device fetches one size of each.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react';
import { motionReduced } from '../../services/motion';
import type { ReelShot } from './reels';

const HOLD_MS = 7800;
const HOLD_NARROW_MS = 6200;
/* Whole first, then the zoom; out again before the next screen. */
const ZOOM_IN_AT = 1300;
const ZOOM_OUT_BEFORE = 1500;
const narrow = () => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 760px)').matches;

const base = () => `${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}/site/reel`;
const file = (f: string, v = '') => `${base()}/${f}${v}.webp`;

/** The transform that puts `focus` in the middle of the frame, as large as it fits — never past an edge. */
function zoomFor(focus?: [number, number, number, number]): React.CSSProperties {
  if (!focus) return {};
  const [x, y, w, h] = focus;
  const s = Math.min(2.6, 1 / Math.max(w, h * 1));
  const clamp = (v: number) => Math.min(0, Math.max(1 - s, v));
  const tx = clamp(0.5 - s * (x + w / 2));
  const ty = clamp(0.5 - s * (y + h / 2));
  return { '--zs': s.toFixed(3), '--zx': `${(tx * 100).toFixed(2)}%`, '--zy': `${(ty * 100).toFixed(2)}%` } as React.CSSProperties;
}

function Shot({ s, eager, on }: { s: ReelShot; eager: boolean; on: boolean }) {
  return (
    <picture>
      <source media="(max-width: 760px)" srcSet={file(s.file, '-m')} />
      <img
        src={file(s.file)}
        srcSet={`${file(s.file, '-sm')} 1200w, ${file(s.file)} 2400w`}
        sizes="(min-width: 1000px) 78vw, 100vw"
        alt={on ? s.alt : ''}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        width={2400}
        height={1500}
        className="dc-shot-img"
        style={zoomFor(s.focus)}
      />
    </picture>
  );
}

/** The screen at full size: the whole desktop picture, fitted to the window — or, on a phone, twice its width to pan and pinch. */
function Viewer({ shots, at, onClose, onGo }: { shots: ReelShot[]; at: number; onClose: () => void; onGo: (i: number) => void }) {
  const s = shots[at];
  const close = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    close.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onGo(at + 1);
      if (e.key === 'ArrowLeft') onGo(at - 1);
    };
    window.addEventListener('keydown', key);
    const was = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = was; };
  }, [at, onClose, onGo]);
  return (
    <div className="dc-viewer" role="dialog" aria-modal="true" aria-label={`${s.caption} — full size`} onClick={onClose}>
      <div className="dc-viewer-body" onClick={e => e.stopPropagation()}>
        {/* Always the whole desktop screen: on a phone the slide already showed
            the phone layout, and "full size" is the complete window — wider
            than the phone, to pan and pinch. */}
        <img src={file(s.file)} alt={s.alt} className="dc-viewer-img" />
        <p className="dc-viewer-cap">{s.caption}</p>
      </div>
      <button ref={close} type="button" className="dc-viewer-btn dc-viewer-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
      {shots.length > 1 && <>
        <button type="button" className="dc-viewer-btn dc-viewer-prev" aria-label="Previous screen" onClick={e => { e.stopPropagation(); onGo(at - 1); }}><ChevronLeft size={20} /></button>
        <button type="button" className="dc-viewer-btn dc-viewer-next" aria-label="Next screen" onClick={e => { e.stopPropagation(); onGo(at + 1); }}><ChevronRight size={20} /></button>
      </>}
    </div>
  );
}

export default function ShotReel({
  shots, label, eager = false, holdMs,
}: {
  shots: ReelShot[];
  /** What the reel is of, for a screen reader: "AI Autopilot". */
  label: string;
  /** The hero's reel loads at once; everything else waits to be scrolled to. */
  eager?: boolean;
  /** Kept for callers; every reel is a strip now and draws no browser bar. */
  chrome?: boolean;
  strip?: boolean;
  /** How long each screen holds on a wide screen, zoom included. */
  holdMs?: number;
}) {
  const [at, setAt] = useState(0);
  const [inView, setInView] = useState(false);
  const [held, setHeld] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [still] = useState(() => motionReduced());
  const [small] = useState(() => narrow());
  const [hold] = useState(() => (small ? HOLD_NARROW_MS : holdMs ?? HOLD_MS));
  const box = useRef<HTMLDivElement | null>(null);
  const many = shots.length > 1;

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => setInView(!!e?.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const paused = still || !inView || held || viewing || (typeof document !== 'undefined' && document.visibilityState === 'hidden');

  /* The advancing. A timeout per shot rather than an interval, so pressing a
     dot restarts the clock for the shot it chose. */
  useEffect(() => {
    if (!many || paused) return;
    const t = window.setTimeout(() => setAt(i => (i + 1) % shots.length), hold);
    return () => window.clearTimeout(t);
  }, [at, many, paused, shots.length, hold]);

  /* The zoom: whole, then into its focus, then whole again before it leaves.
     Not on a phone, which is shown its own phone screen instead. */
  useEffect(() => {
    setZoom(false);
    if (paused || small || !shots[at]?.focus) return;
    const a = window.setTimeout(() => setZoom(true), ZOOM_IN_AT);
    const b = window.setTimeout(() => setZoom(false), Math.max(ZOOM_IN_AT + 2000, hold - ZOOM_OUT_BEFORE));
    return () => { window.clearTimeout(a); window.clearTimeout(b); };
  }, [at, paused, small, hold, shots]);

  const go = (i: number) => setAt((i + shots.length) % shots.length);
  const shot = shots[at] ?? shots[0];
  const n = shots.length;

  return (
    <div
      className={`dc-reel strip${inView ? ' in-view' : ''}${held ? ' held' : ''}${many ? '' : ' single'}`}
      ref={box}
      style={{ '--hold': `${hold}ms` } as React.CSSProperties}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      onFocus={e => { if ((e.target as HTMLElement).matches?.(':focus-visible')) setHeld(true); }}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false); }}
    >
      <div className="dc-reel-frame">
        <div className="dc-reel-stage">
          {shots.map((s, i) => {
            const on = i === at;
            let pos = ((i - at) % n + n) % n;
            if (pos > n / 2) pos -= n;
            const near = Math.abs(pos) <= 1;
            return (
              <div
                key={s.file}
                className={`dc-reel-shot${on ? ' on' : ''}${on && zoom ? ' zoom' : ''}`}
                data-pos={Math.max(-2, Math.min(2, pos))}
                aria-hidden={on ? undefined : true}
                onClick={() => (on ? setViewing(true) : go(i))}
              >
                <Shot s={s} on={on} eager={(eager && i === 0) || near} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="dc-reel-caption">
        <p key={shot.file} className="dc-reel-text">{shot.caption}</p>
        <button type="button" className="dc-reel-open" aria-label={`Open “${shot.caption}” full size`} onClick={() => setViewing(true)}>
          <Maximize2 size={13} /><span>Full size</span>
        </button>
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
                  {i === at && !paused && <span key={at} className="dc-reel-fill" />}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => go(at + 1)} aria-label="Next screen" className="dc-reel-arrow">
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
      {/* Into <body>: inside the section, a revealed (transformed) ancestor
          would trap `position: fixed` under the nav and the page's own image
          rules would cap its width. */}
      {viewing && createPortal(<Viewer shots={shots} at={at} onClose={() => setViewing(false)} onGo={go} />, document.body)}
    </div>
  );
}
