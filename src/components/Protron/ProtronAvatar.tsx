/**
 * Protron's face: a friendly humanoid robot head.
 *
 * ── Why this face (owner's brief, 2026-11-12) ──
 *
 * The helmet with the V visor read as alien. The brief asked for a premium,
 * cinematic robot assistant in the spirit of film-robot engineering — an
 * original design, not any studio's character: a titanium cranium with a crest
 * and panel seams, a smooth lighter face plate, gently arched brows, round
 * cyan eyes with a highlight, audio receptors where ears would be, a neck and
 * collar, and a mouth that is a softly smiling slot of light segments. Nothing
 * biological, nothing sharp or frowning; the resting face smiles.
 *
 * ── Why SVG and CSS, not a 3D scene ──
 *
 * It sits on every screen. A WebGL head would cost a GPU context and an engine
 * download for a 56-pixel face; this is one inline SVG (~4 KB) whose moving
 * parts are CSS transforms. Below 36 px (`lite`) the glow filter and the fine
 * seams are left out — they cannot be seen at that size and the filter is the
 * only costly part.
 *
 * ── What moves, and what each move means ──
 *
 *   blink        the eyes close and open every few seconds, sometimes twice
 *   head         small unhurried poses — a tilt, a nod, a glance — every 3–7 s
 *   mouth        the seven segments follow the voice's real loudness
 *                (services/protron/level.ts, measured from the audio playing);
 *                silent, the mouth is one soft lit smile. Never a timer.
 *   idle         steady cyan eyes
 *   listening    brighter eyes, the ear rings pulse, the head leans in
 *   thinking     eyes glance up, the forehead light breathes slowly
 *   speaking     the mouth follows the voice
 *   working      the ear rings and forehead light run quickly
 *   done         green, one bright pop
 *   error        amber (help needed, not alarm), brows a little raised
 *
 * Every animation is a CSS rule inside `prefers-reduced-motion: no-preference`
 * (protron.css), and blinks and poses are not scheduled at all under reduced
 * motion — never an inline `animation`, which no media query can reach (the
 * trap AutopilotBot.tsx records). The mouth's loudness is a CSS variable, so
 * under reduced motion it is still drawn, just without transition.
 */
import { useEffect, useId, useRef } from 'react';
import { onVoiceLevel } from '../../services/protron/level';
import './protron.css';

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'working' | 'done' | 'error';

const POSES: { tilt: number; x: number; y: number; look: number }[] = [
  { tilt: 0, x: 0, y: 0, look: 0 },
  { tilt: -3.5, x: -0.8, y: 0, look: -1 },
  { tilt: 3, x: 0.8, y: 0, look: 1 },
  { tilt: -1.5, x: 0, y: -0.6, look: -0.5 },
  { tilt: 2, x: 0.5, y: 0.4, look: 0.8 },
  { tilt: 0, x: 0, y: 0, look: 1.4 },
  { tilt: 0, x: 0, y: 0, look: -1.4 },
];

/* The mouth's segments: where each sits on the smile, and how much of the
   voice's loudness it shows (the middle ones open most, like a mouth). */
const BARS = [-8.4, -5.6, -2.8, 0, 2.8, 5.6, 8.4].map(dx => ({
  x: 50 + dx,
  y: 71.4 - 1.5 * (dx / 9) ** 2,
  k: 2.6 - Math.abs(dx) / 4.2,
}));

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
  const lite = size < 36;

  /* Blinks and poses: timers, not CSS loops, so they are irregular like a person's. */
  useEffect(() => {
    if (!alive || reducedMotion()) return;
    const el = root.current;
    if (!el) return;
    let off = false;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(() => { if (!off) fn(); }, ms)); };

    const blinkOnce = () => { el.dataset.blink = '1'; later(() => { el.dataset.blink = '0'; }, 130); };
    const blink = () => {
      if (document.visibilityState === 'visible') {
        blinkOnce();
        if (Math.random() < 0.2) later(blinkOnce, 280);
      }
      later(blink, 2800 + Math.random() * 3800);
    };
    const pose = () => {
      if (document.visibilityState === 'visible') {
        const p = POSES[Math.floor(Math.random() * POSES.length)];
        el.style.setProperty('--pt-tilt', `${p.tilt}deg`);
        el.style.setProperty('--pt-x', `${p.x}px`);
        el.style.setProperty('--pt-y', `${p.y}px`);
        el.style.setProperty('--pt-look', `${p.look}px`);
        if (Math.random() < 0.25) {
          el.style.setProperty('--pt-y', '1.4px');
          later(() => el.style.setProperty('--pt-y', `${p.y}px`), 420);
        }
      }
      later(pose, 3000 + Math.random() * 4000);
    };
    later(blink, 1200);
    later(pose, 1800);
    return () => { off = true; timers.forEach(t => window.clearTimeout(t)); };
  }, [alive]);

  /* The mouth follows the real voice — only while this face is the speaking one. */
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
      data-blink="0"
      data-lite={lite ? '1' : '0'}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={g('m')} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#eef2f6" />
          <stop offset="0.3" stopColor="#a3aebb" />
          <stop offset="0.68" stopColor="#4c5864" />
          <stop offset="1" stopColor="#1b2229" />
        </linearGradient>
        <linearGradient id={g('f')} x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0" stopColor="#e4eaf0" />
          <stop offset="0.5" stopColor="#b3bec9" />
          <stop offset="1" stopColor="#66727e" />
        </linearGradient>
        <linearGradient id={g('d')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4a545f" />
          <stop offset="1" stopColor="#12171c" />
        </linearGradient>
        <radialGradient id={g('s')} cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#24313f" />
          <stop offset="1" stopColor="#111922" />
        </radialGradient>
        {!lite && (
          <filter id={g('glow')} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="1.4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        )}
      </defs>

      {/* Neck and collar, still while the head moves. */}
      <path d="M40 78 L60 78 L61 92 L39 92 Z" fill={`url(#${g('d')})`} />
      {!lite && <path d="M43 81 L57 81 M43 85 L57 85 M43 89 L57 89" stroke="#0b0f13" strokeWidth="0.9" />}
      <path d="M22 100 C24 92 36 88 50 88 C64 88 76 92 78 100 Z" fill={`url(#${g('m')})`} />
      <path className="pt-light" d="M40 93.5 L60 93.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" filter={glow} />

      <g className="pt-head">
        {/* Audio receptors where ears would be, each with a light ring. */}
        <circle cx="15.5" cy="50" r="7.5" fill={`url(#${g('d')})`} />
        <circle cx="84.5" cy="50" r="7.5" fill={`url(#${g('d')})`} />
        <circle className="pt-ear" cx="15.5" cy="50" r="4" fill="none" stroke="currentColor" strokeWidth="1.4" filter={glow} />
        <circle className="pt-ear" cx="84.5" cy="50" r="4" fill="none" stroke="currentColor" strokeWidth="1.4" filter={glow} />

        {/* The cranium: brushed titanium, a crest, a highlight. */}
        <path d="M50 6 C69 6 82 18 83 37 C84 50 82 60 78 68 C74 77 64 85 50 86 C36 85 26 77 22 68 C18 60 16 50 17 37 C18 18 31 6 50 6 Z" fill={`url(#${g('m')})`} />
        <path d="M46 7 L54 7 L55.5 23 L50 27 L44.5 23 Z" fill={`url(#${g('f')})`} stroke="#20272e" strokeWidth="0.6" />
        <path d="M32 14 C38 10 43 9 46.5 9 L45.5 21 C39 22 33.5 24 28.5 28 C28.5 22 29.5 17.5 32 14 Z" fill="#fff" opacity="0.2" />
        {!lite && (
          <g fill="none" stroke="#1d242b" strokeWidth="0.7" opacity="0.7">
            <path d="M21 33 C28 29 36 28 43 29.5" />
            <path d="M79 33 C72 29 64 28 57 29.5" />
            <path d="M20 58 C22 64 24 68 27 71" />
            <path d="M80 58 C78 64 76 68 73 71" />
          </g>
        )}

        {/* The face plate, lighter and smooth. */}
        <path d="M50 28 C62 28 72 33 74 43 C75 52 73 62 69 69 C65 76 58 81 50 81 C42 81 35 76 31 69 C27 62 25 52 26 43 C28 33 38 28 50 28 Z" fill={`url(#${g('f')})`} />
        {!lite && (
          <g fill="none" stroke="#5b6672" strokeWidth="0.6" opacity="0.75">
            <path d="M30 58 C33.5 64 37.5 68 42 70.5" />
            <path d="M70 58 C66.5 64 62.5 68 58 70.5" />
          </g>
        )}
        {!lite && <><circle cx="27.5" cy="62" r="1.1" fill="#3a434d" /><circle cx="72.5" cy="62" r="1.1" fill="#3a434d" /></>}

        {/* Forehead light. */}
        <path className="pt-core-light" d="M50 30.6 L52.6 33.6 L50 36.6 L47.4 33.6 Z" fill="currentColor" filter={glow} />

        {/* Brows: gently arched plates — friendly, never a frown. */}
        <g className="pt-brows" fill="#3d4651">
          <path className="pt-brow" d="M28.5 41 C33 37 39.5 36 45.5 38.2 L45 40.6 C39.5 39 34 39.6 29.8 42.6 Z" />
          <path className="pt-brow" d="M71.5 41 C67 37 60.5 36 54.5 38.2 L55 40.6 C60.5 39 66 39.6 70.2 42.6 Z" />
        </g>

        {/* The eyes: dark sockets, round glowing lenses, a highlight. */}
        <ellipse cx="37.5" cy="47.5" rx="6.5" ry="5.1" fill={`url(#${g('s')})`} />
        <ellipse cx="62.5" cy="47.5" rx="6.5" ry="5.1" fill={`url(#${g('s')})`} />
        <g className="pt-eyes">
          {[37.5, 62.5].map(cx => (
            <g className="pt-eye" key={cx}>
              <ellipse cx={cx} cy="47.6" rx="5" ry="4.1" fill="currentColor" filter={glow} />
              <circle className="pt-core" cx={cx} cy="47.6" r="2.3" fill="#e9fcff" />
              <circle cx={cx - 1.7} cy="46" r="0.95" fill="#fff" />
            </g>
          ))}
        </g>

        {/* Nose bridge and chin plate. */}
        <path d="M48.2 50.5 L51.8 50.5 L52.8 60 L50 62 L47.2 60 Z" fill={`url(#${g('m')})`} opacity="0.85" />
        <path d="M44 77.5 L56 77.5 L54 81 L46 81 Z" fill={`url(#${g('m')})`} opacity="0.8" />

        {/* The mouth: a smiling slot whose segments follow the voice. */}
        <path d="M39.5 68 C44.5 71.6 55.5 71.6 60.5 68 L59.7 72 C54.8 75 45.2 75 40.3 72 Z" fill="#141c25" />
        <path className="pt-smile" d="M41.5 70.2 C46 72.6 54 72.6 58.5 70.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" filter={glow} />
        <g className="pt-mouth" fill="currentColor" filter={glow}>
          {BARS.map(b => (
            <rect key={b.x} className="pt-bar" x={b.x - 0.8} y={b.y - 1.6} width="1.6" height="3.2" rx="0.8"
              style={{ ['--k' as string]: b.k.toFixed(2) }} />
          ))}
        </g>
      </g>
    </svg>
  );
}
