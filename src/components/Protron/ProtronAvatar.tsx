/**
 * Protron's face: the gunmetal helmet with the glowing V visor.
 *
 * ── Why SVG and CSS, not a 3D scene ──
 *
 * It sits on every screen of the app. A WebGL helmet would cost a GPU context
 * and tens of kilobytes of engine on every page for a 56-pixel face; this is
 * one inline SVG (~3 KB) whose moving parts are CSS transforms and one colour,
 * and the colour is stepped twelve times a second rather than every frame, so
 * a modest laptop or a phone does not notice it.
 *
 * ── What moves, and what each move means ──
 *
 *   eyes colour   drifts slowly through green → cyan → blue → violet and back
 *                 (`pt-hue`, 28 s) — alive, not busy
 *   blink         the visor closes and opens every few seconds, sometimes twice
 *   head          small, unhurried poses — a tilt, a nod, a glance — picked at
 *                 random every 3–7 s, the way somebody listening moves
 *   state         listening: the eyes pulse with attention; thinking: the head
 *                 tilts and the eyes dim and brighten; speaking: a quick
 *                 flicker with the words; working: a fast pulse; done: green;
 *                 error: red, still
 *
 * Every animation is a CSS rule inside `prefers-reduced-motion: no-preference`
 * (protron.css), and the random blinks and poses are not scheduled at all
 * under reduced motion — never an inline `animation`, which no media query can
 * reach (the trap AutopilotBot.tsx records). The head poses are CSS variables
 * the stylesheet turns into a transform, so the transition lives in the
 * stylesheet too.
 *
 * The founder-avatar option (a photo- or video-driven talking head) would
 * replace this component behind the same `state` prop; nothing else in
 * Protron depends on what the face is drawn with.
 */
import { useEffect, useId, useRef } from 'react';
import './protron.css';

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'working' | 'done' | 'error';

const POSES: { tilt: number; x: number; y: number; look: number }[] = [
  { tilt: 0, x: 0, y: 0, look: 0 },
  { tilt: -4, x: -1, y: 0, look: -1.2 },
  { tilt: 3.5, x: 1, y: 0, look: 1.2 },
  { tilt: -2, x: 0, y: -0.8, look: -0.6 },
  { tilt: 2.5, x: 0.6, y: 0.5, look: 0.9 },
  { tilt: 0, x: 0, y: 0, look: 1.7 },
  { tilt: 0, x: 0, y: 0, look: -1.7 },
];

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function ProtronAvatar({ size = 56, state = 'idle', alive = true, title }: {
  size?: number;
  state?: AvatarState;
  /** False: no random blinks or poses (a static copy, e.g. in a list). */
  alive?: boolean;
  /** An accessible name when the face stands alone; decorative otherwise. */
  title?: string;
}) {
  const root = useRef<SVGSVGElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  /* Blinks and poses: timers, not CSS loops, so they are irregular like a person's. */
  useEffect(() => {
    if (!alive || reducedMotion()) return;
    const el = root.current;
    if (!el) return;
    let off = false;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(() => { if (!off) fn(); }, ms)); };

    const blinkOnce = () => { el.dataset.blink = '1'; later(() => { el.dataset.blink = '0'; }, 140); };
    const blink = () => {
      if (document.visibilityState === 'visible') {
        blinkOnce();
        if (Math.random() < 0.2) later(blinkOnce, 300);
      }
      later(blink, 2600 + Math.random() * 3800);
    };
    const pose = () => {
      if (document.visibilityState === 'visible') {
        const p = POSES[Math.floor(Math.random() * POSES.length)];
        el.style.setProperty('--pt-tilt', `${p.tilt}deg`);
        el.style.setProperty('--pt-x', `${p.x}px`);
        el.style.setProperty('--pt-y', `${p.y}px`);
        el.style.setProperty('--pt-look', `${p.look}px`);
        /* A nod is down and back, not a held pose. */
        if (Math.random() < 0.25) {
          el.style.setProperty('--pt-y', '1.8px');
          later(() => el.style.setProperty('--pt-y', `${p.y}px`), 420);
        }
      }
      later(pose, 3000 + Math.random() * 4000);
    };
    later(blink, 1200);
    later(pose, 1800);
    return () => { off = true; timers.forEach(t => window.clearTimeout(t)); };
  }, [alive]);

  const g = (n: string) => `${n}${uid}`;
  return (
    <svg
      ref={root}
      className="pt-av"
      data-state={state}
      data-blink="0"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={g('m')} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#c9d0d8" />
          <stop offset="0.28" stopColor="#7d8791" />
          <stop offset="0.62" stopColor="#3b434c" />
          <stop offset="1" stopColor="#15191e" />
        </linearGradient>
        <linearGradient id={g('d')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#59626c" />
          <stop offset="1" stopColor="#1a1f25" />
        </linearGradient>
        <linearGradient id={g('c')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#dfe4ea" />
          <stop offset="1" stopColor="#4d5660" />
        </linearGradient>
        <filter id={g('glow')} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.7" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <g className="pt-head">
        {/* Ear pods, behind the shell, each with a small light. */}
        <rect x="5" y="38" width="11" height="25" rx="5.5" fill={`url(#${g('d')})`} />
        <rect x="84" y="38" width="11" height="25" rx="5.5" fill={`url(#${g('d')})`} />
        <rect className="pt-light" x="8.5" y="52" width="4" height="6" rx="2" fill="currentColor" filter={`url(#${g('glow')})`} />
        <rect className="pt-light" x="87.5" y="52" width="4" height="6" rx="2" fill="currentColor" filter={`url(#${g('glow')})`} />

        {/* The shell. */}
        <path d="M50 5 C72 5 86 20 87 42 C88 60 82 75 71 86 C64 93 57 96 50 96 C43 96 36 93 29 86 C18 75 12 60 13 42 C14 20 28 5 50 5 Z" fill={`url(#${g('m')})`} />
        <path d="M29 14 C37 9 45 8 49 8 L47.5 30 C39 30 31 32 25 36 C24 27 25 19 29 14 Z" fill="#fff" opacity="0.16" />
        {/* The crest down the middle. */}
        <path d="M44 6 L56 6 L58 30 L50 40 L42 30 Z" fill={`url(#${g('c')})`} stroke="#0e1114" strokeWidth="0.8" />
        <path d="M20 44 C30 38 42 38 50 46 C58 38 70 38 80 44" stroke="#0e1114" strokeWidth="1.2" fill="none" opacity="0.6" />

        {/* The dark face behind the visor, and the plates that make its V. */}
        <path d="M17 50 C28 43 41 44 48 52 L50 55 L52 52 C59 44 72 43 83 50 C82 62 78 74 70 84 C64 90 57 93 50 93 C43 93 36 90 30 84 C22 74 18 62 17 50 Z" fill="#07090b" />
        <path d="M25 61 C29 71 35 80 44 88 L45.5 62 C38 58.5 31 58.5 25 61 Z" fill={`url(#${g('d')})`} />
        <path d="M75 61 C71 71 65 80 56 88 L54.5 62 C62 58.5 69 58.5 75 61 Z" fill={`url(#${g('d')})`} />
        <path d="M47.5 57 L52.5 57 L51.6 90 L48.4 90 Z" fill={`url(#${g('d')})`} />

        {/* The glowing seams running down from the eyes. */}
        <g className="pt-lines" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" filter={`url(#${g('glow')})`}>
          <path d="M46.2 57.5 L44.8 87" />
          <path d="M53.8 57.5 L55.2 87" />
          <path d="M21.5 55.5 C24.5 66 29.5 76 37.5 85" />
          <path d="M78.5 55.5 C75.5 66 70.5 76 62.5 85" />
        </g>

        {/* The eyes: a glow and a hot white core, each blinking on its own centre. */}
        <g className="pt-eyes">
          <g className="pt-eye">
            <path d="M18.5 51 C29 44.5 41 45.5 47 55 C39 57.2 28 57 18.5 51 Z" fill="currentColor" filter={`url(#${g('glow')})`} />
            <path className="pt-core" d="M23.5 51.6 C31 48 39 49 43.6 54 C37 55.2 29.5 55 23.5 51.6 Z" fill="#f2fff7" />
          </g>
          <g className="pt-eye">
            <path d="M81.5 51 C71 44.5 59 45.5 53 55 C61 57.2 72 57 81.5 51 Z" fill="currentColor" filter={`url(#${g('glow')})`} />
            <path className="pt-core" d="M76.5 51.6 C69 48 61 49 56.4 54 C63 55.2 70.5 55 76.5 51.6 Z" fill="#f2fff7" />
          </g>
        </g>
      </g>
    </svg>
  );
}
