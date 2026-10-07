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
 * ── The tour: whole, then zoomed in and read from top to bottom ──
 *
 * The owner found the zoom "not working" and asked for something else: each
 * screen shown whole once, then zoomed in and travelled down from its top to
 * its bottom, so it can be read. The pictures are now the *whole page* — the
 * window and everything under it (scripts/site-reels.mts, up to about two and
 * a half windows on a desktop, three on a phone) — and each slide runs:
 *
 *   whole   the top of the page, the size of the window: the screen as it opens
 *   zoom    into its readable size, centred on the part that matters (`focus`)
 *   travel  down to the bottom of the page, at a reading pace
 *   back    out to the whole screen, and on to the next
 *
 * The travel's length comes from the picture itself, so a long page takes
 * longer than a short one. On a phone there is no zoom: the picture is the
 * app's own phone layout, already at its size, and it is read top to bottom
 * the same way. While it travels, the shot's `notes` — how it works, what it
 * brings in — come up one at a time over the screen.
 *
 * ── Motion ──
 *
 * The tour plays with reduced motion asked for too: on many machines that
 * setting is switched on by a battery saver, not chosen (services/motion.ts),
 * and the owner's own reported the zoom as broken. What it changes is the
 * movement's shape — the zoom and the way back are a fade, not a swoop — and
 * there is always a pause button, which is what a moving picture owes anyone.
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
import { ChevronLeft, ChevronRight, Maximize2, Pause, Play, X } from 'lucide-react';
import { motionReduced } from '../../services/motion';
import type { ReelShot } from './reels';

/* The phases of a slide, in milliseconds. */
const WHOLE_MS = 1900;
const WHOLE_NARROW_MS = 1500;
const ZOOM_MS = 1300;
const END_MS = 1300;
const BACK_MS = 1100;
/* How fast the page travels, in the app's own pixels a second — a reading
   pace, not a scroll: a desktop line of the app is about 20 of them. */
const SPEED = 165;
const SPEED_NARROW = 105;
const TRAVEL_MIN = 2600;
const TRAVEL_MAX = 21000;
/* Width of the window the pictures were taken in (scripts/site-reels.mts). */
const APP_W = 1920;
const APP_W_NARROW = 390;
const narrow = () => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 760px)').matches;

const base = () => `${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}/site/reel`;
const file = (f: string, v = '') => `${base()}/${f}${v}.webp`;

type Phase = 'whole' | 'zoom' | 'travel' | 'end' | 'back';
interface Plan { s: number; tx: number; ty: number; travel: number }

/**
 * Where the zoom goes and how long the travel takes, for a slide `fw`×`fh`
 * showing a picture `nw`×`nh` drawn at the slide's width.
 */
function planFor(fw: number, fh: number, nw: number, nh: number, focus: ReelShot['focus'], small: boolean): Plan {
  const ih = fw * (nh / nw);
  /* Desktop: large enough that the app's 14px text reads at about 11px. */
  const s = small ? 1 : Math.min(2.2, Math.max(1.3, (0.78 * APP_W) / fw));
  const cx = focus ? focus[0] + focus[2] / 2 : 0.5;
  const tx = Math.min(0, Math.max(fw - s * fw, fw / 2 - s * cx * fw));
  const ty = Math.min(0, fh - s * ih);
  const appPx = (-ty * (small ? APP_W_NARROW : APP_W)) / (s * fw);
  const travel = appPx < 40 ? 0 : Math.min(TRAVEL_MAX, Math.max(TRAVEL_MIN, (appPx / (small ? SPEED_NARROW : SPEED)) * 1000));
  return { s, tx, ty, travel };
}

function durations(plan: Plan | null, small: boolean) {
  const whole = small ? WHOLE_NARROW_MS : WHOLE_MS;
  const zoom = plan && plan.s > 1 ? ZOOM_MS : 0;
  const travel = plan?.travel ?? 0;
  /* A picture with nothing below the window holds a little longer instead. */
  const end = travel ? END_MS : 2600;
  const back = zoom || travel ? BACK_MS : 0;
  return { whole, zoom, travel, end, back, total: whole + zoom + travel + end + back };
}

/** The screen at full size, to scroll: the whole desktop page, or on a phone its phone layout. */
function Viewer({ shots, at, small, onClose, onGo }: { shots: ReelShot[]; at: number; small: boolean; onClose: () => void; onGo: (i: number) => void }) {
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
        <p className="dc-viewer-cap">{s.caption}</p>
        <img key={s.file} src={file(s.file, small ? '-m' : '')} alt={s.alt} className="dc-viewer-img" />
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
  shots, label, eager = false,
}: {
  shots: ReelShot[];
  /** What the reel is of, for a screen reader: "AI Autopilot". */
  label: string;
  /** The hero's reel loads at once; everything else waits to be scrolled to. */
  eager?: boolean;
  /** Kept for callers; every reel is a strip now and draws no browser bar. */
  chrome?: boolean;
  strip?: boolean;
  /** Kept for callers; a slide now lasts as long as its page takes to read. */
  holdMs?: number;
}) {
  const [at, setAt] = useState(0);
  const [inView, setInView] = useState(false);
  const [held, setHeld] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.visibilityState === 'hidden');
  const [viewing, setViewing] = useState(false);
  const [phase, setPhase] = useState<Phase>('whole');
  const [note, setNote] = useState(-1);
  const [run, setRun] = useState(0);
  /* Where a paused slide stopped, as the transform it had then. */
  const [frozen, setFrozen] = useState<string | null>(null);
  const [reduced] = useState(() => motionReduced());
  const [small] = useState(() => narrow());
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  const [dims, setDims] = useState<Record<string, { w: number; h: number }>>({});
  const box = useRef<HTMLDivElement | null>(null);
  const stage = useRef<HTMLDivElement | null>(null);
  const many = shots.length > 1;

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => setInView(!!e?.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const vis = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, []);
  /* Every slide is the same size; the one showing is measured. */
  useEffect(() => {
    const el = stage.current?.querySelector<HTMLElement>('.dc-reel-shot');
    if (!el) return;
    const measure = () => setFrame(f => (f && f.w === el.clientWidth && f.h === el.clientHeight ? f : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const paused = !inView || held || stopped || viewing || hidden;
  const shot = shots[at] ?? shots[0];
  const d = dims[shot.file];
  const plan = frame && d ? planFor(frame.w, frame.h, d.w, d.h, shot.focus, small) : null;
  const t = durations(plan, small);
  const notes = shot.notes ?? [];

  /*
   * The slide's timeline: whole → zoom → travel → end → back → next. One
   * timeout per phase, restarted whenever the slide, the size or the pause
   * changes. Pausing holds the picture where it is (read back from the
   * running transition); playing again starts the slide from whole.
   */
  useEffect(() => {
    if (paused) {
      const im = stage.current?.querySelector<HTMLElement>('.dc-reel-shot.on .dc-sr-img');
      setFrozen(im ? getComputedStyle(im).transform : null);
      return;
    }
    setFrozen(null);
    setPhase('whole');
    setNote(-1);
    if (!plan) return;
    const timers: number[] = [];
    const after = (ms: number, f: () => void) => timers.push(window.setTimeout(f, ms));
    let clock = t.whole;
    if (t.zoom) { after(clock, () => setPhase('zoom')); clock += t.zoom; }
    if (t.travel) after(clock, () => setPhase('travel'));
    /* The notes: one at a time across the travel, or across the hold when the page is one window long. */
    const span = t.travel || t.end;
    notes.forEach((_, i) => after((t.travel ? clock : t.whole) + (i * span) / Math.max(1, notes.length), () => setNote(i)));
    clock += t.travel;
    after(clock, () => setPhase('end'));
    clock += t.end;
    if (t.back) { after(clock, () => { setPhase('back'); setNote(-1); }); clock += t.back; }
    if (many) after(clock, () => setAt(i => (i + 1) % shots.length));
    else after(clock, () => setRun(r => r + 1));
    return () => timers.forEach(x => window.clearTimeout(x));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, paused, plan?.s, plan?.tx, plan?.ty, plan?.travel, run]);

  const go = (i: number) => setAt((i + shots.length) % shots.length);
  const n = shots.length;

  const imgStyle = (on: boolean): React.CSSProperties => {
    if (on && frozen && frozen !== 'none') return { transform: frozen, transition: 'none' };
    if (!on || !plan || phase === 'whole' || phase === 'back') {
      return { transform: 'translate(0px, 0px) scale(1)', transition: on && phase === 'back' && !reduced ? `transform ${BACK_MS}ms cubic-bezier(0.65, 0, 0.25, 1)` : 'none' };
    }
    const atEnd = phase === 'travel' || phase === 'end';
    return {
      transform: `translate(${plan.tx.toFixed(1)}px, ${(atEnd ? plan.ty : 0).toFixed(1)}px) scale(${plan.s.toFixed(3)})`,
      transition: phase === 'zoom'
        ? (reduced ? 'none' : `transform ${ZOOM_MS}ms cubic-bezier(0.65, 0, 0.25, 1)`)
        : phase === 'travel' ? `transform ${t.travel}ms cubic-bezier(0.42, 0, 0.58, 1)` : 'none',
    };
  };

  return (
    <div
      className={`dc-reel strip${inView ? ' in-view' : ''}${paused ? ' held' : ''}${many ? '' : ' single'}${reduced ? ' calm' : ''}`}
      ref={box}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      onFocus={e => { if ((e.target as HTMLElement).matches?.(':focus-visible')) setHeld(true); }}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false); }}
    >
      <div className="dc-reel-frame">
        <div className="dc-reel-stage" ref={stage}>
          {shots.map((s, i) => {
            const on = i === at;
            let pos = ((i - at) % n + n) % n;
            if (pos > n / 2) pos -= n;
            const near = Math.abs(pos) <= 1;
            return (
              <div
                key={s.file}
                className={`dc-reel-shot${on ? ' on' : ''}${on && phase !== 'whole' && phase !== 'back' ? ' zoom' : ''}${on ? ` ph-${phase}` : ''}`}
                data-pos={Math.max(-2, Math.min(2, pos))}
                aria-hidden={on ? undefined : true}
                onClick={() => (on ? setViewing(true) : go(i))}
              >
                <picture>
                  <source media="(max-width: 760px)" srcSet={file(s.file, '-m')} />
                  <img
                    src={file(s.file)}
                    srcSet={`${file(s.file, '-sm')} 1200w, ${file(s.file)} 2000w`}
                    sizes="(min-width: 1000px) 90vw, 100vw"
                    alt={on ? s.alt : ''}
                    loading={(eager && i === 0) || near ? 'eager' : 'lazy'}
                    decoding="async"
                    className="dc-sr-img"
                    style={imgStyle(on)}
                    onLoad={e => {
                      const im = e.currentTarget;
                      if (im.naturalWidth) setDims(m => (m[s.file]?.w === im.naturalWidth && m[s.file]?.h === im.naturalHeight ? m : { ...m, [s.file]: { w: im.naturalWidth, h: im.naturalHeight } }));
                    }}
                  />
                </picture>
                {on && note >= 0 && notes[note] && (
                  <div className="dc-sr-note" key={`${s.file}-${note}`} aria-live="polite">
                    <span className="dc-sr-note-n">{note + 1}/{notes.length}</span>
                    <span>{notes[note]}</span>
                  </div>
                )}
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
        <div className="dc-reel-controls">
          <button type="button" onClick={() => setStopped(v => !v)} aria-label={stopped ? 'Play the tour' : 'Pause the tour'} aria-pressed={stopped} className="dc-reel-arrow dc-reel-play">
            {stopped ? <Play size={13} /> : <Pause size={13} />}
          </button>
          {many && <>
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
                  {i === at && !paused && plan && <span key={`${at}-${run}`} className="dc-reel-fill" style={{ '--hold': `${t.total}ms` } as React.CSSProperties} />}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => go(at + 1)} aria-label="Next screen" className="dc-reel-arrow">
              <ChevronRight size={14} />
            </button>
          </>}
        </div>
      </div>
      {/* Into <body>: inside the section, a revealed (transformed) ancestor
          would trap `position: fixed` under the nav and the page's own image
          rules would cap its width. */}
      {viewing && createPortal(<Viewer shots={shots} at={at} small={small} onClose={() => setViewing(false)} onGo={go} />, document.body)}
    </div>
  );
}
