/**
 * Protron: a white humanoid robot, head and shoulders, with the Protected
 * Central mark on its chest.
 *
 * ── Why this figure (owner's brief, 2026-11-12, second picture) ──
 *
 * The owner sent a reference: a gloss-white humanoid bust — a smooth egg
 * head turned a little aside, a dark audio receptor on its side, cabled neck,
 * a broad chest plate between dark shoulder drums — and asked for Protron to
 * look like it with our logo on the chest. This is an original drawing of
 * that kind of robot, not the reference photograph (which carries another
 * company's mark). One addition: the reference head is blank, and Protron
 * has to show listening / thinking / speaking, so a dark glass visor carries
 * two lit eyes and a slim mouth light. The chest mark is public/favicon.svg's
 * tile and shield, drawn in place so it stays sharp at every size.
 *
 * ── Why SVG and CSS, not a 3D scene ──
 *
 * It sits on every screen. A WebGL head would cost a GPU context and an engine
 * download for a 56-pixel face; this is one inline SVG (~4 KB) whose moving
 * parts are CSS transforms. Below 36 px (`lite`) the glow filter, the cables and the
 * fine seams are left out — they cannot be seen at that size and the filter is the
 * only costly part.
 *
 * ── What moves, and what each move means ──
 *
 *   blink        the eyes close and open every few seconds, sometimes twice
 *   head         small unhurried poses — a tilt, a nod, a glance — every 3–7 s
 *                (the body stays still: the head turns on its neck)
 *   mouth        the seven segments follow the voice's real loudness
 *                (services/protron/level.ts, measured from the audio playing);
 *                silent, the mouth is one soft lit smile. Never a timer.
 *   idle         steady cyan eyes and receptor ring
 *   listening    brighter eyes, the receptor ring pulses, the head leans in
 *   thinking     eyes glance up, the receptor's centre breathes slowly
 *   speaking     the mouth follows the voice
 *   working      the receptor ring and its centre run quickly
 *   done         green, one bright pop
 *   error        amber (help needed, not alarm)
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
const BARS = [-4.5, -3, -1.5, 0, 1.5, 3, 4.5].map(dx => ({
  x: 47 + dx,
  y: 39.4 - 0.8 * (dx / 5) ** 2,
  k: 2.6 - Math.abs(dx) / 2.3,
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
        {/* Gloss white shell: lit from the upper left, falling to a cool grey at the edges. */}
        <radialGradient id={g('w')} cx="0.36" cy="0.26" r="0.82">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#eef0f3" />
          <stop offset="0.8" stopColor="#c9ced6" />
          <stop offset="1" stopColor="#9aa1ab" />
        </radialGradient>
        <linearGradient id={g('p')} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#fbfcfd" />
          <stop offset="0.55" stopColor="#e3e6ea" />
          <stop offset="1" stopColor="#a9b0b9" />
        </linearGradient>
        <linearGradient id={g('d')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4b525b" />
          <stop offset="1" stopColor="#121519" />
        </linearGradient>
        <linearGradient id={g('v')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a3340" />
          <stop offset="1" stopColor="#0b1016" />
        </linearGradient>
        {/* The Protected Central mark, as public/favicon.svg draws it. */}
        <linearGradient id={g('pc')} x1="6" y1="3" x2="26" y2="29" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#d6f96f" />
          <stop offset="0.55" stopColor="#c8f24d" />
          <stop offset="1" stopColor="#8fd9c4" />
        </linearGradient>
        {!lite && (
          <filter id={g('glow')} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="0.9" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        )}
      </defs>

      {/* ── The body: still while the head moves ── */}
      {/* Upper arms, outboard of the shoulder joints. */}
      <path d="M2 100 C1 87 3 77 9 72.5 C13 70 18 71.5 20 75 L21 100 Z" fill={`url(#${g('p')})`} />
      <path d="M98 100 C99 87 97 77 91 72.5 C87 70 82 71.5 80 75 L79 100 Z" fill={`url(#${g('p')})`} />
      {/* Abdomen, dark and ribbed, under the chest plate. */}
      <path d="M27 88 L73 88 L71 100 L29 100 Z" fill={`url(#${g('d')})`} />
      {!lite && <path d="M31 92.5 L69 92.5 M31 96.5 L69 96.5" stroke="#5d656f" strokeWidth="0.8" />}
      {/* Shoulder joints: dark drums with a ring disc. */}
      {[20.5, 79.5].map(cx => (
        <g key={cx}>
          <circle cx={cx} cy="71" r="7" fill={`url(#${g('d')})`} />
          <circle cx={cx} cy="71" r="4.4" fill="#2b3037" stroke="#6b737d" strokeWidth="0.8" />
          <circle cx={cx} cy="71" r="1.9" fill="#15181c" />
        </g>
      ))}
      {/* The neck: cables and a dark spine, between head and collar. */}
      <path d="M42.5 44 L54.5 44 L56 60 L41 60 Z" fill={`url(#${g('d')})`} />
      {!lite && (
        <g stroke="#6f7782" strokeWidth="0.9" strokeLinecap="round" fill="none">
          <path d="M45 46 C44.5 51 45.5 55 44.5 59" />
          <path d="M48.5 46 L48.5 59.5" />
          <path d="M52 46 C52.5 51 51.5 55 52.6 59" />
        </g>
      )}
      {/* Chest plate with the collar opening. */}
      <path d="M22 66 C28 60.5 38 58 48.5 58 C59 58 69 60.5 75 66 L77.5 82 C77.5 91 69 95 48.5 95 C28 95 19.5 91 19.5 82 Z" fill={`url(#${g('w')})`} />
      <ellipse cx="48.5" cy="60.2" rx="9.5" ry="2.6" fill="#191d22" />
      <path className="pt-light" d="M42 60.3 L55 60.3" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" filter={glow} />
      {!lite && (
        <g fill="none" stroke="#a7aeb7" strokeWidth="0.6" opacity="0.9">
          <path d="M27 66.5 C30 70 33 73 34 78 L33.5 90" />
          <path d="M70 66.5 C67 70 64 73 63 78 L63.5 90" />
          <path d="M34 82.5 C40 85 57 85 63 82.5" />
        </g>
      )}
      {/* The Protected Central mark on the chest: the tile and the shield. */}
      <g transform="translate(41.6 66.6) scale(0.43)">
        <rect width="32" height="32" rx="7.5" fill="#0f1210" />
        <path fill={`url(#${g('pc')})`} fillRule="evenodd"
          d="M16 4.6 L25.4 8.1 V16.2 C25.4 21.6 21.6 25.9 16 27.9 C10.4 25.9 6.6 21.6 6.6 16.2 V8.1 Z M16 12.2 a3.9 3.9 0 1 0 0 7.8 a3.9 3.9 0 1 0 0 -7.8 Z" />
      </g>

      {/* ── The head: a smooth white shell, turned a little to its right ── */}
      <g className="pt-head">
        {/* Drawn a tenth larger than the body's scale, as the reference's head is. */}
        <g transform="translate(-4.85 -2.9) scale(1.1)">
        <path d="M49 3.5 C60.5 3.5 67.5 12 67.5 24 C67.5 34 63.5 42 56.5 47 C52 50.3 45.5 50.3 41 47 C34 42 29.5 34 29.5 24 C29.5 12 37.5 3.5 49 3.5 Z" fill={`url(#${g('w')})`} />
        <ellipse cx="41" cy="12.5" rx="6.5" ry="3.8" fill="#fff" opacity="0.75" transform="rotate(-24 41 12.5)" />
        {!lite && <path d="M58 41 C61.5 37 64 33 65 28" fill="none" stroke="#a9b0b9" strokeWidth="0.6" />}

        {/* The audio receptor on its side, ringed in the state's light. */}
        <circle cx="63" cy="27" r="6.2" fill={`url(#${g('d')})`} />
        <circle cx="63" cy="27" r="4.3" fill="#2a2f36" stroke="#737b86" strokeWidth="0.7" />
        <circle className="pt-ear" cx="63" cy="27" r="3" fill="none" stroke="currentColor" strokeWidth="1" filter={glow} />
        <circle className="pt-core-light" cx="63" cy="27" r="1.2" fill="currentColor" />

        {/* The face: a dark glass visor where the eyes sit, and a slim mouth light. */}
        <path d="M33 22.5 C36 18.6 46 17.8 56.5 19.5 C59 20.2 59.4 29.5 57 31.3 C48 33.6 38.5 33 34 30.6 C32.2 28.8 32 25 33 22.5 Z" fill={`url(#${g('v')})`} />
        <path d="M35.5 20.8 C42 19 50 19 56 20.4" fill="none" stroke="#fff" strokeWidth="0.6" opacity="0.35" />
        <g className="pt-eyes">
          {[39.5, 50.5].map(cx => (
            <g className="pt-eye" key={cx}>
              <ellipse cx={cx} cy="25.8" rx="3" ry="2.3" fill="currentColor" filter={glow} />
              <circle className="pt-core" cx={cx} cy="25.8" r="1.25" fill="#e9fcff" />
              <circle cx={cx - 1} cy="24.9" r="0.5" fill="#fff" />
            </g>
          ))}
        </g>
        <path d="M41 37.6 C44 39.4 50 39.4 53 37.6 L52.6 40.2 C49.6 41.8 44.4 41.8 41.4 40.2 Z" fill="#20262e" />
        <path className="pt-smile" d="M43 39.2 C45.4 40.1 48.6 40.1 51 39.2" fill="none" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" filter={glow} />
        <g className="pt-mouth" fill="currentColor" filter={glow}>
          {BARS.map(b => (
            <rect key={b.x} className="pt-bar" x={b.x - 0.45} y={b.y - 1} width="0.9" height="2" rx="0.45"
              style={{ ['--k' as string]: b.k.toFixed(2) }} />
          ))}
        </g>
        </g>
      </g>
    </svg>
  );
}
