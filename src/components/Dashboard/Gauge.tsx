import { useId } from 'react';

/**
 * The overall score as an arc.
 *
 * A single ratio against a fixed limit is the one job a radial meter does well —
 * it is a bar bent round, not a pie, and there is nothing to compare it against
 * so none of the pie objections apply. The ten departments stay as straight bars
 * below, because comparing ten values is what bars are for.
 *
 * The arc carries the same band colour the rows use. Painting the headline a
 * brand colour while the rows underneath use health colours would give the same
 * quantity two encodings, which is the fastest way to make a dashboard lie.
 */
interface Props {
  /** 0–100. */
  value: number;
  fill: string;
  track: string;
  /** Ring drawn around the leading dot, in the surface colour, so it reads clear of the track. */
  surface: string;
  size?: number;
  thickness?: number;
  label: string;
}

const START = 135;
const SWEEP = 270;
const rad = (deg: number) => (deg * Math.PI) / 180;

export default function Gauge({ value, fill, track, surface, size = 168, thickness = 11, label }: Props) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - thickness) / 2 - 2;
  const c = size / 2;

  const point = (deg: number) => [c + r * Math.cos(rad(deg)), c + r * Math.sin(rad(deg))] as const;
  const arc = (fromDeg: number, toDeg: number) => {
    const [x1, y1] = point(fromDeg);
    const [x2, y2] = point(toDeg);
    const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
    return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
  };

  const endDeg = START + (SWEEP * pct) / 100;
  const [dx, dy] = point(endDeg);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${pct.toFixed(0)} out of 100 — ${label}`}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        {/* The track fades toward the far end, so the unfilled remainder recedes
            instead of competing with the value. The fill itself is flat — a
            gradient on the measured arc would misstate where the value sits. */}
        <linearGradient id={`gt${gid}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor={track} stopOpacity={1} />
          <stop offset="100%" stopColor={track} stopOpacity={0.55} />
        </linearGradient>
      </defs>

      <path d={arc(START, START + SWEEP)} fill="none" stroke={`url(#gt${gid})`} strokeWidth={thickness} strokeLinecap="round" />
      {pct > 0.5 && (
        <path d={arc(START, endDeg)} fill="none" stroke={fill} strokeWidth={thickness} strokeLinecap="round" />
      )}
      {/* Leading dot, ringed in the surface colour so it stays legible where it
          overlaps the track. */}
      <circle cx={dx} cy={dy} r={thickness * 0.62} fill={fill} stroke={surface} strokeWidth={2.5} />
    </svg>
  );
}
