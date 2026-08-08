import { useEffect, useMemo, useRef, useState } from 'react';
import { formatAxis, formatBucket, formatValue, type Candle, type Timeframe, type Unit } from '../../services/marketFeed';
import { DOWN, GRID, INK_DARK, TEXT_DIM, TEXT_MUTED, TEXT_STRONG, UP } from './marketTheme';

/** Element size, so the SVG can lay out in real pixels instead of guessing. */
function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const box = entries[0]?.contentRect;
      if (box) setSize({ w: box.width, h: box.height });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  return { ref, ...size };
}

interface Props {
  candles: Candle[];
  unit: Unit;
  timeframe: Timeframe;
  symbol: string;
  name: string;
  /** Live displayed price — drawn as the marker line on the axis. */
  last: number;
  height?: number;
}

const PAD = { top: 14, right: 62, bottom: 22, left: 10 };
const VOL_SHARE = 0.2;
const PANEL_GAP = 14;

export default function CandleChart({ candles, unit, timeframe, symbol, name, last, height = 300 }: Props) {
  const { ref, w } = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const width = Math.max(w, 320);
  const plotW = Math.max(width - PAD.left - PAD.right, 40);
  const bodyH = height - PAD.top - PAD.bottom;
  const priceH = bodyH * (1 - VOL_SHARE) - PANEL_GAP;
  const volTop = PAD.top + priceH + PANEL_GAP;
  const volH = bodyH * VOL_SHARE;

  const geom = useMemo(() => {
    if (candles.length === 0) return null;
    let lo = Infinity, hi = -Infinity;
    for (const k of candles) { lo = Math.min(lo, k.l); hi = Math.max(hi, k.h); }
    lo = Math.min(lo, last); hi = Math.max(hi, last);
    // A perfectly flat series would divide by zero; give it a nominal band.
    if (!(hi > lo)) { const mid = hi || 1; hi = mid * 1.02 + 1; lo = mid * 0.98 - 1; }
    const floorAtZero = lo >= 0;
    const headroom = (hi - lo) * 0.08;
    lo -= headroom; hi += headroom;
    // None of these instruments can go negative, so an axis that dips below
    // zero is empty space that says nothing.
    if (floorAtZero) lo = Math.max(lo, 0);
    if (unit === 'pct') hi = Math.min(hi, 100);

    const peakVol = Math.max(...candles.map(k => k.v), 1);
    const slot = plotW / candles.length;
    const bodyW = Math.max(1.5, Math.min(slot * 0.62, 13));

    const x = (i: number) => PAD.left + slot * (i + 0.5);
    const y = (v: number) => PAD.top + priceH - ((v - lo) / (hi - lo)) * priceH;
    const vy = (v: number) => volTop + volH - (v / peakVol) * volH;

    // Four gridlines is enough structure to read against without competing.
    const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
    return { lo, hi, slot, bodyW, x, y, vy, ticks, peakVol };
  }, [candles, plotW, priceH, volTop, volH, last, unit]);

  const active = hover !== null ? candles[hover] : null;
  const readout = active ?? candles[candles.length - 1];
  const readoutUp = readout ? readout.c >= readout.o : true;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!geom || candles.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = e.clientX - rect.left - PAD.left;
    const i = Math.floor(rel / geom.slot);
    setHover(i >= 0 && i < candles.length ? i : null);
  }

  const lastUp = candles.length > 1 ? last >= candles[candles.length - 2].c : true;

  return (
    <div ref={ref} style={{ width: '100%', position: 'relative' }}>
      {/* Corner readout — OHLC for the hovered bar, newest bar when idle. */}
      {readout && (
        <div style={{
          position: 'absolute', top: 8, left: 12, zIndex: 2, pointerEvents: 'none',
          display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0 12px',
          fontSize: 11, fontVariantNumeric: 'tabular-nums',
        }}>
          <span style={{ color: TEXT_STRONG, fontWeight: 800, letterSpacing: '0.02em' }}>{symbol}</span>
          <span style={{ color: TEXT_MUTED }}>{name}</span>
          <span style={{ color: TEXT_DIM }}>{formatBucket(readout.t, timeframe)}</span>
          {([['O', readout.o], ['H', readout.h], ['L', readout.l], ['C', readout.c]] as const).map(([k, v]) => (
            <span key={k} style={{ color: TEXT_DIM }}>
              {k}<span style={{ color: readoutUp ? UP : DOWN, fontWeight: 700, marginLeft: 3 }}>{formatValue(v, unit)}</span>
            </span>
          ))}
          <span style={{ color: TEXT_DIM }}>
            Vol<span style={{ color: TEXT_MUTED, fontWeight: 700, marginLeft: 3 }}>{readout.v}</span>
          </span>
        </div>
      )}

      <svg
        width="100%" height={height} viewBox={`0 0 ${width} ${height}`}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}
        style={{ display: 'block', cursor: 'crosshair' }}
        role="img"
        aria-label={`${name} candlestick chart, ${candles.length} ${timeframe} bars, latest close ${formatValue(readout?.c ?? 0, unit)}`}
      >
        {geom && (
          <>
            {/* Horizontal grid + right-hand price axis */}
            {geom.ticks.map(t => (
              <g key={t}>
                <line x1={PAD.left} x2={PAD.left + plotW} y1={geom.y(t)} y2={geom.y(t)} stroke={GRID} strokeWidth={1} />
                <text x={PAD.left + plotW + 8} y={geom.y(t) + 3.5} fill={TEXT_DIM} fontSize={10} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatAxis(t, unit)}
                </text>
              </g>
            ))}

            {/* Candles. Up bars are hollow, down bars filled — direction stays
                readable without relying on the red/green pair alone. */}
            {candles.map((k, i) => {
              const up = k.c >= k.o;
              const color = up ? UP : DOWN;
              const cx = geom.x(i);
              const top = geom.y(Math.max(k.o, k.c));
              const bottom = geom.y(Math.min(k.o, k.c));
              const h = Math.max(bottom - top, 1);
              const dim = hover !== null && hover !== i;
              return (
                <g key={k.t} opacity={dim ? 0.42 : 1}>
                  <line x1={cx} x2={cx} y1={geom.y(k.h)} y2={geom.y(k.l)} stroke={color} strokeWidth={1} />
                  <rect
                    x={cx - geom.bodyW / 2} y={top} width={geom.bodyW} height={h} rx={1}
                    fill={up ? INK_DARK : color} stroke={color} strokeWidth={up ? 1.2 : 0}
                  />
                  {/* Volume sub-panel — its own scale, stacked, never a second y-axis. */}
                  <rect
                    x={cx - geom.bodyW / 2} y={geom.vy(k.v)} width={geom.bodyW}
                    height={Math.max(volTop + volH - geom.vy(k.v), 0.5)} rx={1}
                    fill={color} opacity={dim ? 0.18 : 0.4}
                  />
                </g>
              );
            })}

            {/* Live price marker */}
            <line
              x1={PAD.left} x2={PAD.left + plotW} y1={geom.y(last)} y2={geom.y(last)}
              stroke={lastUp ? UP : DOWN} strokeWidth={1} strokeDasharray="3 3" opacity={0.75}
            />
            <rect
              x={PAD.left + plotW + 3} y={geom.y(last) - 8} width={PAD.right - 8} height={16} rx={3}
              fill={lastUp ? UP : DOWN}
            />
            <text
              x={PAD.left + plotW + 3 + (PAD.right - 8) / 2} y={geom.y(last) + 4}
              fill={INK_DARK} fontSize={10} fontWeight={800} textAnchor="middle" style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatAxis(last, unit)}
            </text>

            {/* Crosshair */}
            {hover !== null && candles[hover] && (
              <>
                <line
                  x1={geom.x(hover)} x2={geom.x(hover)} y1={PAD.top} y2={volTop + volH}
                  stroke={TEXT_MUTED} strokeWidth={1} strokeDasharray="2 3" opacity={0.6}
                />
                <rect
                  x={Math.min(Math.max(geom.x(hover) - 34, 2), width - 70)}
                  y={volTop + volH + 4} width={68} height={15} rx={3} fill="#1c2230"
                />
                <text
                  x={Math.min(Math.max(geom.x(hover) - 34, 2), width - 70) + 34}
                  y={volTop + volH + 15} fill={TEXT_STRONG} fontSize={9.5} textAnchor="middle"
                >
                  {formatBucket(candles[hover].t, timeframe)}
                </text>
              </>
            )}

            {/* Time axis — a handful of anchors, not one label per bar. */}
            {hover === null && candles.map((k, i) => {
              const every = Math.max(1, Math.ceil(candles.length / 7));
              if (i % every !== 0) return null;
              return (
                <text key={k.t} x={geom.x(i)} y={volTop + volH + 15} fill={TEXT_DIM} fontSize={9.5} textAnchor="middle">
                  {formatBucket(k.t, timeframe)}
                </text>
              );
            })}
          </>
        )}
      </svg>
    </div>
  );
}
