import { useId } from 'react';
import type { Candle } from '../../services/marketFeed';
import { DOWN, UP } from './marketTheme';

interface Props {
  candles: Candle[];
  width?: number;
  height?: number;
  /** Session direction — keeps the sparkline in step with the row's figures. */
  up: boolean;
}

/**
 * A closing-price trace for the watchlist. Deliberately axis-free: it shows
 * shape only, and the exact numbers sit beside it in the same row.
 */
export default function Sparkline({ candles, width = 62, height = 22, up }: Props) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (candles.length < 2) return <svg width={width} height={height} aria-hidden="true" />;

  const closes = candles.map(k => k.c);
  const lo = Math.min(...closes);
  const hi = Math.max(...closes);
  const span = hi - lo || Math.abs(hi) * 0.02 || 1;
  const pad = 2;
  const x = (i: number) => (i / (closes.length - 1)) * width;
  const y = (v: number) => height - pad - ((v - lo) / span) * (height - pad * 2);

  const line = closes.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const color = up ? UP : DOWN;

  return (
    <svg width={width} height={height} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={`spark${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(closes.length - 1)} cy={y(closes[closes.length - 1])} r={1.9} fill={color} />
    </svg>
  );
}
