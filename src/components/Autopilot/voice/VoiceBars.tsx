/**
 * Bars that move with the microphone — the proof that it is hearing you.
 *
 * Each bar is a moment of the real input level (`meter` from useVoiceInput,
 * read off the same stream the recording is cut from), newest on the right,
 * so speech scrolls across and silence lies flat. Nothing here is a loop that
 * moves on its own: a dead microphone draws dots.
 *
 * The heights are written straight onto the bars from a frame loop of its own
 * rather than through React — fifteen new levels a second would otherwise
 * redraw the component (and whoever owns it) fifteen times a second, the same
 * kind of lag this replaced.
 *
 * With motion reduced (motion.ts — the system's setting or the person's own
 * override) there is no scrolling: one level meter, its fill set four times a
 * second with no transition.
 */
import { useEffect, useRef } from 'react';
import { motionReduced } from '../../../services/motion';
import { METER_BARS, type VoiceMeter } from './useVoiceInput';
import './voice.css';

/** The smallest a bar is drawn, so silence reads as a row of dots, not nothing. */
const FLOOR = 0.1;

export default function VoiceBars({ meter, count = 32, height = 34, label = 'Microphone level' }: {
  meter: React.RefObject<VoiceMeter>;
  /** How many of the most recent levels to draw. */
  count?: number;
  height?: number;
  label?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const still = motionReduced();
  const shown = Math.max(1, Math.min(count, METER_BARS));

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    if (still) {
      const fill = el.querySelector<HTMLElement>('.vc-meter-fill');
      const id = window.setInterval(() => {
        const lvl = meter.current?.level ?? 0;
        if (fill) fill.style.width = `${Math.round(lvl * 100)}%`;
        el.setAttribute('aria-valuenow', String(Math.round(lvl * 100)));
      }, 250);
      return () => window.clearInterval(id);
    }
    const bars = Array.from(el.querySelectorAll<HTMLElement>('.vc-bar'));
    let seen = -1;
    let raf = 0;
    const draw = () => {
      const m = meter.current;
      if (m && m.version !== seen) {
        seen = m.version;
        const n = m.bars.length;
        /* The newest `count` levels, oldest first: the one just before `head`
           is the latest. */
        for (let i = 0; i < bars.length; i++) {
          const v = m.bars[(m.head - bars.length + i + n * 2) % n];
          bars[i].style.transform = `scaleY(${Math.max(FLOOR, v).toFixed(3)})`;
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [meter, still, shown]);

  if (still) {
    return (
      <div ref={wrap} className="vc-meter" role="meter" aria-label={label}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}>
        <span className="vc-meter-fill" />
      </div>
    );
  }
  return (
    <div ref={wrap} className="vc-bars" aria-hidden style={{ height }}>
      {Array.from({ length: shown }, (_, i) => <span key={i} className="vc-bar" />)}
    </div>
  );
}
