/**
 * The AI bloom: the drawn flower in a milky glass lens that marks the two
 * modules that act on their own — AI Autopilot and AI Prospecting — in the top
 * bar. The same drawing as the website's help button (`bloomSvg` in
 * public/widget.js), ported to React so its gradient ids are unique per
 * instance: two blooms on one page sharing an id would paint the second with
 * the first one's stops.
 *
 * Two rings of long rounded petals — violet and cyan behind, magenta in front —
 * round a glowing heart. Each petal opens a beat after its neighbour and the
 * rings turn slowly against each other (index.css, `.ai-bloom`), all of it
 * behind `prefers-reduced-motion: no-preference`. `fast` is set when the module
 * is actually working, so the movement carries the real state.
 */
import { useId } from 'react';

const P = 'M0 0C-1.2-2.5-4.2-5.5-3.6-8.2C-3.1-10.2-1-10.6 0-10.4C1-10.6 3.1-10.2 3.6-8.2C4.2-5.5 1.2-2.5 0 0Z';
/* Fixed jitter, so no two petals are quite alike and every render is the same. */
const J = [0.6, -0.4, 0.9, -0.8, 0.3, -0.2, 0.7, -0.9, 0.1, 0.5, -0.6, 0.8, -0.3];

function ring(n: number, base: number, swing: number, wide: number, from: number, fill: string, dur: number, edge: string) {
  return Array.from({ length: n }, (_, i) => {
    const a = from + i * (360 / n) + J[i % J.length] * 7;
    const len = base + swing * Math.cos((a * Math.PI) / 180) + J[(i + 3) % J.length] * 0.9;
    const sy = len / 10;
    const sx = (len / 10) * (wide + 0.08 * J[(i + 5) % J.length]);
    return (
      <g key={i} transform={`rotate(${a.toFixed(1)})`}>
        <g transform={`scale(${sx.toFixed(3)} ${sy.toFixed(3)})`}>
          <path className="ai-bloom-p" d={P} fill={fill} stroke={`rgba(255,255,255,${edge})`} strokeWidth={0.5}
            vectorEffect="non-scaling-stroke" style={{ animationDelay: `-${((i * dur) / n).toFixed(2)}s` }} />
        </g>
      </g>
    );
  });
}

export default function AiBloom({ size = 26, fast = false }: { size?: number; fast?: boolean }) {
  const id = `bl${useId().replace(/:/g, '')}`;
  return (
    <span className={`ai-lens${fast ? ' ai-fast' : ''}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg className="ai-bloom" viewBox="-16 -16 32 32" focusable="false">
        <defs>
          <linearGradient id={`${id}b`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="-10.4">
            <stop offset="0" stopColor="#ff2d86" stopOpacity=".95" />
            <stop offset=".35" stopColor="#c04bff" stopOpacity=".85" />
            <stop offset=".72" stopColor="#6d8dff" stopOpacity=".75" />
            <stop offset="1" stopColor="#39c6f4" stopOpacity=".5" />
          </linearGradient>
          <linearGradient id={`${id}f`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="-10.4">
            <stop offset="0" stopColor="#ff1a6c" />
            <stop offset=".45" stopColor="#ff4aa8" stopOpacity=".9" />
            <stop offset=".8" stopColor="#d36bff" stopOpacity=".62" />
            <stop offset="1" stopColor="#b98cff" stopOpacity=".4" />
          </linearGradient>
          <radialGradient id={`${id}h`}>
            <stop offset="0" stopColor="#fff" />
            <stop offset=".18" stopColor="#ffc2dc" />
            <stop offset=".45" stopColor="#ff2d7a" />
            <stop offset="1" stopColor="#ff1470" stopOpacity="0" />
          </radialGradient>
          <filter id={`${id}s`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".32" /></filter>
          <filter id={`${id}t`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".14" /></filter>
        </defs>
        <g transform="translate(0 2) scale(1 .9)">
          <g className="ai-bloom-back" filter={`url(#${id}s)`}>{ring(16, 12.4, 3, 0.58, 4, `url(#${id}b)`, 4.8, '.5')}</g>
          <g className="ai-bloom-front" filter={`url(#${id}t)`}>{ring(12, 8.2, 2, 0.6, 15, `url(#${id}f)`, 4.2, '.22')}</g>
          <g className="ai-bloom-heart">
            <circle r="4.6" fill={`url(#${id}h)`} />
            <circle cx="-.4" cy="-.5" r=".75" fill="#fff" opacity=".95" />
          </g>
        </g>
      </svg>
    </span>
  );
}
