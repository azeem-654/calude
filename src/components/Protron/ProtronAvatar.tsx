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
 * The portrait also makes small unhurried moves (a lean, a settle) every
 * 3–7 s so it reads as present, not as a sticker. Under reduced motion none of
 * that is scheduled and nothing animates; the colours still change.
 *
 * The SVG wrapper stays (rather than an <img>) so every place that sizes,
 * colours or tests `svg.pt-av` keeps working, and it carries data-noinvert:
 * dark mode inverts the page, and a photograph inside an SVG is not an <img>
 * the inversion rule would turn back.
 */
import { useEffect, useId, useRef } from 'react';
import { onVoiceLevel } from '../../services/protron/level';
import './protron.css';

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'working' | 'done' | 'error';

const POSES: { tilt: number; x: number; y: number }[] = [
  { tilt: 0, x: 0, y: 0 },
  { tilt: -1.2, x: -0.6, y: 0 },
  { tilt: 1, x: 0.6, y: 0 },
  { tilt: -0.5, x: 0, y: -0.5 },
  { tilt: 0.7, x: 0.4, y: 0.3 },
];

/* The voice bars, low on the faceplate: the middle ones open most. */
const MOUTH = { x: 38, y: 46 };
const BARS = [-4.5, -3, -1.5, 0, 1.5, 3, 4.5].map(dx => ({ x: MOUTH.x + dx, k: 2.6 - Math.abs(dx) / 2.3 }));

/* Where the robot's audio receptor is in the portrait (viewBox units). */
const EAR = { x: 62.6, y: 26.4 };

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const portrait = (size: number) => {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return `/protron/robot-${size * dpr > 170 ? 384 : 160}.webp`;
};

export default function ProtronAvatar({ size = 56, state = 'idle', alive = true, title }: {
  size?: number;
  state?: AvatarState;
  /** False: no poses (a static copy, e.g. in a list). */
  alive?: boolean;
  /** An accessible name when the face stands alone; decorative otherwise. */
  title?: string;
}) {
  const root = useRef<SVGSVGElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const lite = size < 36;

  /* Poses: timers, not a CSS loop, so they are irregular like a person's. */
  useEffect(() => {
    if (!alive || reducedMotion()) return;
    const el = root.current;
    if (!el) return;
    let off = false;
    let timer = 0;
    const pose = () => {
      if (off) return;
      if (document.visibilityState === 'visible') {
        const p = POSES[Math.floor(Math.random() * POSES.length)];
        el.style.setProperty('--pt-tilt', `${p.tilt}deg`);
        el.style.setProperty('--pt-x', `${p.x}px`);
        el.style.setProperty('--pt-y', `${p.y}px`);
      }
      timer = window.setTimeout(pose, 3000 + Math.random() * 4000);
    };
    timer = window.setTimeout(pose, 1800);
    return () => { off = true; window.clearTimeout(timer); };
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
        {!lite && (
          <filter id={g('glow')} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        )}
      </defs>
      <g clipPath={`url(#${g('c')})`}>
        <rect width="100" height="100" fill="#cfd2d6" />
        <image className="pt-photo" href={portrait(size)} x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid slice" />
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
      <circle className="pt-ring" cx="50" cy="50" r="48.6" fill="none" stroke="currentColor" filter={glow} />
    </svg>
  );
}
