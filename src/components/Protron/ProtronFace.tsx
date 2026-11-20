/**
 * Protron: the owner's robot — a gloss-white humanoid, head and chest, with
 * the Protected Central mark on its chest plate.
 *
 * ── Why a photograph (owner, 2026-11-12, third and fourth briefs) ──
 *
 * The owner sent a reference picture of a white humanoid robot and asked for
 * Protron to be *exactly* that robot, with our logo where the example brand's
 * logo sat on the chest. A drawing in its style (the version before this) was
 * not what was asked. So this is the owner's picture itself: upscaled 2×, the
 * example brand's mark inpainted out of the chest plate and our tile-and-shield
 * mark laid in its place. Fourth brief: no "PROTECTED CENTRAL" wording under
 * it — the logo alone, larger (about 1.7× as seen) — and the crop zoomed in
 * about 1.24× so the head fills more of the circle
 * (public/protron/robot-{160,384}.webp — 3 and 9 KB; the bigger one only
 * where the face is drawn large or on a dense screen).
 *
 * ── How a photograph still shows what Protron is doing ──
 *
 * A picture cannot blink or move its mouth, and the panel, the launcher and
 * the wizard all rely on the face saying "listening", "thinking", "speaking".
 * Three things carry that, all CSS (protron.css), all in the state's colour:
 *
 *   ring    a light ring round the portrait: soft when idle, pulsing while
 *           listening, breathing while thinking, running while working,
 *           green when done, amber when help is needed; while speaking its
 *           glow follows the voice's real loudness (services/protron/level.ts)
 *   ear     the robot's own audio receptor lights up in that colour
 *   voice   seven small bars low on the faceplate, where a mouth would be,
 *           opening with the voice — never a timer; hidden while silent
 *           (the zoomed crop left no room under the chest mark)
 *
 * ── The head moves, not the frame (owner, 2026-11-20) ──
 *
 * The first "alive" version leaned the whole photograph a degree inside its
 * circle, which read as the frame wobbling. The owner asked for the robot
 * itself to turn its face and think. So the portrait is two layers cut from
 * that same picture: the body (public/protron/robot-body-*.webp, the head
 * painted out with the backdrop's own gradient) and the head
 * (robot-head-*.webp, cut along its outline, transparent around it). The
 * head turns about the neck: a turn is a slide plus a narrowing (2D stands
 * in for a yaw, since SVG content gets no 3D transforms) with the far side
 * of the dome shaded, a nod, a curious tilt. The ear and the voice bars are
 * drawn on the head layer, so they turn with it. The ring never moves.
 *
 * Moves are timers, not a CSS loop, so they come at irregular times like a
 * person's, and they follow the state: forward and attentive while
 * listening, glancing up and aside while thinking, scanning left and right
 * while working, small nods while speaking. The ear light blinks now and
 * then. Under reduced motion none of that is scheduled and nothing
 * animates; the colours still change.
 *
 * The SVG wrapper stays (rather than an <img>) so every place that sizes,
 * colours or tests `svg.pt-av` keeps working, and it carries data-noinvert:
 * dark mode inverts the page, and a photograph inside an SVG is not an <img>
 * the inversion rule would turn back.
 *
 * This file imports no stylesheet so plain-node tests can load modules that
 * name ProtronMark (workflowNodes.ts); screens import ProtronAvatar.tsx,
 * which brings protron.css with it.
 */
import { useEffect, useId, useRef } from 'react';
import { onVoiceLevel } from '../../services/protron/level';

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'working' | 'done' | 'error';

/** A head pose: yaw −1…1 (its left…right as seen), nod −1 (up)…1 (down), tilt in degrees. */
interface Pose { yaw: number; nod: number; tilt: number }
const FORWARD: Pose = { yaw: 0, nod: 0, tilt: 0 };
const POSES: Record<AvatarState, Pose[]> = {
  idle: [FORWARD, FORWARD, { yaw: -0.7, nod: 0, tilt: -1 }, { yaw: 0.7, nod: 0.1, tilt: 1 }, { yaw: 0.3, nod: -0.4, tilt: 3 }, { yaw: -0.25, nod: 0.3, tilt: -2.5 }],
  listening: [FORWARD, { yaw: 0.15, nod: 0.15, tilt: 4 }, { yaw: -0.15, nod: 0.1, tilt: -3 }],
  thinking: [{ yaw: 0.55, nod: -0.8, tilt: 3 }, { yaw: -0.5, nod: -0.6, tilt: -2 }, { yaw: 0.2, nod: -0.3, tilt: 5 }, FORWARD],
  speaking: [FORWARD, { yaw: 0.2, nod: 0.25, tilt: 1.5 }, { yaw: -0.2, nod: 0.2, tilt: -1.5 }],
  working: [{ yaw: -0.85, nod: 0.35, tilt: -1 }, { yaw: 0.85, nod: 0.35, tilt: 1 }, { yaw: 0, nod: 0.5, tilt: 0 }],
  done: [FORWARD, { yaw: 0, nod: 0.35, tilt: 0 }],
  error: [{ yaw: 0.15, nod: 0.2, tilt: 5 }, FORWARD],
};
/* How long a pose is held, by state: thinking and working move more often. */
const HOLD: Record<AvatarState, [number, number]> = {
  idle: [2200, 4200], listening: [1800, 3000], thinking: [900, 1600], speaking: [600, 1100], working: [700, 1200], done: [1600, 2600], error: [1500, 2500],
};

/* Where the head layer sits in the picture (viewBox units), and the neck it turns on. */
const HEAD = { x: 22.92, y: 2.34, w: 47.92, h: 58.07 };
const NECK = { x: 45.6, y: 56 };
/* The head's outline, for the shading that sells a turn. */
const OUTLINE = 'M45.8 3.4L39.1 4.4L32.8 7.8L28.1 13L25.3 20.3L24 28.6L24 37.8L25.3 46.4L27.6 52.9L30.7 57L34.4 58.9L41.7 59.1L46.4 58.3L51 53.6L55.2 48.4L59.4 44.8L64.1 43.8L66.1 41.7L68.2 36.5L69.5 29.2L68.8 21.9L66.4 17.2L62.5 14.3L60.4 10.4L55.7 6.2L51 4.2Z';

/* The voice bars, low on the faceplate: the middle ones open most. */
const MOUTH = { x: 38.5, y: 47 };
const BARS = [-4.5, -3, -1.5, 0, 1.5, 3, 4.5].map(dx => ({ x: MOUTH.x + dx, k: 2.6 - Math.abs(dx) / 2.3 }));

/* The robot's audio receptor, on the side of the head (viewBox units). */
const EAR = { x: 62.3, y: 25.6 };

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const res = (size: number) => {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return size * dpr > 170 ? 384 : 160;
};

function setPose(el: SVGSVGElement, p: Pose) {
  el.style.setProperty('--pt-yaw', p.yaw.toFixed(3));
  el.style.setProperty('--pt-nod', p.nod.toFixed(3));
  el.style.setProperty('--pt-tilt', `${p.tilt}deg`);
  /* A turned head shows less of its width; the far side falls into shade. */
  el.style.setProperty('--pt-sx', (1 - Math.abs(p.yaw) * 0.1).toFixed(3));
  el.style.setProperty('--pt-shade-l', (Math.max(0, p.yaw) * 0.6).toFixed(3));
  el.style.setProperty('--pt-shade-r', (Math.max(0, -p.yaw) * 0.6).toFixed(3));
}

export default function ProtronAvatar({ size = 56, state = 'idle', alive = true, title }: {
  size?: number;
  state?: AvatarState;
  /** False: the head holds still (a static copy, e.g. in a list). */
  alive?: boolean;
  /** An accessible name when the face stands alone; decorative otherwise. */
  title?: string;
}) {
  const root = useRef<SVGSVGElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const lite = size < 36;
  const r = res(size);

  /* The head's moves: irregular timers, chosen by state. */
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    setPose(el, FORWARD);
    if (!alive || reducedMotion()) return;
    let off = false;
    let timer = 0;
    let last = -1;
    const poses = POSES[state] ?? POSES.idle;
    const [lo, hi] = HOLD[state] ?? HOLD.idle;
    const move = () => {
      if (off) return;
      if (document.visibilityState === 'visible') {
        let n = Math.floor(Math.random() * poses.length);
        if (n === last && poses.length > 1) n = (n + 1) % poses.length;
        last = n;
        setPose(el, poses[n]);
      }
      timer = window.setTimeout(move, lo + Math.random() * (hi - lo));
    };
    timer = window.setTimeout(move, 300 + Math.random() * 900);
    return () => { off = true; window.clearTimeout(timer); };
  }, [alive, state]);

  /* The ear light blinks now and then, the nearest thing this face has to an eye. */
  useEffect(() => {
    const el = root.current;
    if (!el || !alive || reducedMotion()) return;
    let off = false;
    let timer = 0;
    let unblink = 0;
    const blink = () => {
      if (off) return;
      el.setAttribute('data-blink', '1');
      unblink = window.setTimeout(() => el.removeAttribute('data-blink'), 170);
      timer = window.setTimeout(blink, 2600 + Math.random() * 4200);
    };
    timer = window.setTimeout(blink, 1500 + Math.random() * 2500);
    return () => { off = true; window.clearTimeout(timer); window.clearTimeout(unblink); el.removeAttribute('data-blink'); };
  }, [alive]);

  /* The ring and the bars follow the real voice — only while this face is the speaking one. */
  useEffect(() => {
    const el = root.current;
    if (!el || state !== 'speaking') { el?.style.setProperty('--pt-lvl', '0'); return; }
    const stop = onVoiceLevel(l => el.style.setProperty('--pt-lvl', l.toFixed(3)));
    return () => { stop(); el.style.setProperty('--pt-lvl', '0'); };
  }, [state]);

  const g = (n: string) => `${n}${uid}`;
  const glow = lite ? undefined : `url(#${g('glow')})`;
  return (
    <svg
      ref={root}
      className="pt-av"
      data-state={state}
      data-lite={lite ? '1' : '0'}
      data-noinvert=""
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <clipPath id={g('c')}><circle cx="50" cy="50" r="50" /></clipPath>
        <clipPath id={g('h')}><path d={OUTLINE} /></clipPath>
        <linearGradient id={g('sl')} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#1d2733" stopOpacity="0.9" /><stop offset="0.55" stopColor="#1d2733" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={g('sr')} x1="1" x2="0" y1="0" y2="0">
          <stop offset="0" stopColor="#1d2733" stopOpacity="0.9" /><stop offset="0.55" stopColor="#1d2733" stopOpacity="0" />
        </linearGradient>
        {!lite && (
          <filter id={g('glow')} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        )}
      </defs>
      <g clipPath={`url(#${g('c')})`}>
        <rect width="100" height="100" fill="#cfd2d6" />
        <g className="pt-photo">
          <image className="pt-body" href={`/protron/robot-body-${r}.webp`} x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid slice" />
          <g className="pt-head" style={{ transformOrigin: `${NECK.x}px ${NECK.y}px` }}>
            <image className="pt-head-img" href={`/protron/robot-head-${r}.webp`} x={HEAD.x} y={HEAD.y} width={HEAD.w} height={HEAD.h} preserveAspectRatio="none" />
            {!lite && (
              <g clipPath={`url(#${g('h')})`}>
                <rect className="pt-shade pt-shade-l" x={HEAD.x} y={HEAD.y} width={HEAD.w} height={HEAD.h} fill={`url(#${g('sl')})`} />
                <rect className="pt-shade pt-shade-r" x={HEAD.x} y={HEAD.y} width={HEAD.w} height={HEAD.h} fill={`url(#${g('sr')})`} />
              </g>
            )}
            {/* The robot's own receptor, lit in the state's colour. */}
            <ellipse className="pt-ear" cx={EAR.x} cy={EAR.y} rx="2.4" ry="3.3" fill="none" stroke="currentColor" strokeWidth="0.9" filter={glow} />
            <circle className="pt-core-light" cx={EAR.x} cy={EAR.y} r="1" fill="currentColor" />
            {/* The voice, where a mouth would be. */}
            <g className="pt-mouth" fill="currentColor" filter={glow}>
              <rect className="pt-mouth-bg" x={MOUTH.x - 7.5} y={MOUTH.y - 3.5} width="15" height="7" rx="3.5" fill="#0c1014" />
              {BARS.map(b => (
                <rect key={b.x} className="pt-bar" x={b.x - 0.45} y={MOUTH.y - 1.5} width="0.9" height="3" rx="0.45"
                  style={{ ['--k' as string]: b.k.toFixed(2) }} />
              ))}
            </g>
          </g>
        </g>
      </g>
      <circle className="pt-ring" cx="50" cy="50" r="48.6" fill="none" stroke="currentColor" filter={glow} />
    </svg>
  );
}

/** What an icon slot takes: a lucide icon or ProtronMark. */
export type IconLike = React.ComponentType<{ size?: number | string; color?: string; style?: React.CSSProperties; className?: string; strokeWidth?: number }>;

/**
 * Protron in place of a robot icon: the same props a lucide icon takes, so a
 * `Bot` in an icon map or a button can be swapped for it as is. Below 18 px
 * the head holds still — a turn of a third of a pixel is only work.
 */
export function ProtronMark({ size = 16, style, className }: { size?: number | string; color?: string; style?: React.CSSProperties; className?: string; strokeWidth?: number }) {
  const n = typeof size === 'number' ? size : parseFloat(size) || 16;
  return (
    <span className={className} style={{ display: 'inline-flex', width: n, height: n, flexShrink: 0, borderRadius: '50%', ...style }} aria-hidden>
      <ProtronAvatar size={n} alive={n >= 18} />
    </span>
  );
}
