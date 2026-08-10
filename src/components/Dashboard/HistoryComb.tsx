import type { Candle } from '../../services/marketFeed';

/**
 * The score's recent history as a comb of thin bars.
 *
 * The reference this was styled from uses combs as edge decoration. Decoration
 * is exactly what the anti-patterns rule out — a dense field of hairlines reads
 * as noise and, sitting next to real marks, invites the reader to interpret it.
 * So the comb is the data: one bar per day, height is that day's score, and the
 * most recent bar is picked out. It looks like the reference and means
 * something, which is the only version worth shipping.
 */
interface Props {
  candles: Candle[];
  /** Bars, oldest first. Fewer than this and the whole history is shown. */
  bars?: number;
  height?: number;
  color: string;
  /** The latest bar, so "now" is findable in the comb. */
  accent: string;
  label: string;
}

export default function HistoryComb({ candles, bars = 44, height = 34, color, accent, label }: Props) {
  const closes = candles.slice(-bars).map(k => k.c);
  if (closes.length < 2) return <div style={{ height }} aria-hidden="true" />;

  // Scaled against the score's own 0–100 domain, never the window's maximum.
  // Auto-scaling would stretch a department that sat flat at 68 all month into a
  // solid full-height block, which reads as "everything is maxed out" when the
  // truth is "nothing moved".
  const first = closes[0];
  const last = closes[closes.length - 1];

  return (
    <div
      role="img"
      aria-label={`${label}: ${closes.length} days of history, from ${first.toFixed(0)} to ${last.toFixed(0)} out of 100`}
      style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height, width: '100%' }}
    >
      {closes.map((v, i) => {
        const latest = i === closes.length - 1;
        return (
          // Each day is a full-height track with the score sitting inside it.
          // The track is what makes a 0–100 scale readable at the bottom of the
          // range: without it a business scoring 16 draws a row of specks, and
          // the fix of scaling to the window maximum would be a lie.
          <div
            key={i}
            style={{
              flex: 1, minWidth: 1, height: '100%', borderRadius: 1,
              // Alpha on the track's own colour, not `opacity` — opacity would
              // fade the bar sitting inside it too.
              backgroundColor: `${color}26`,
              display: 'flex', alignItems: 'flex-end',
            }}
          >
            <div
              style={{
                width: '100%',
                // A 3% floor so a genuine zero is still a mark rather than a
                // gap — an empty slot would read as missing data.
                height: `${Math.max(v, 3)}%`,
                borderRadius: 1,
                backgroundColor: latest ? accent : `${color}b0`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
