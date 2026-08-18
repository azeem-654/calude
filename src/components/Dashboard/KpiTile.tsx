/**
 * The headline cards.
 *
 * One number, how it moved against the week before, and the fortnight behind it
 * drawn small. The "…" is not decoration: it opens the definition of the metric
 * in plain words and a way through to the records it was counted from, because
 * a figure nobody can check is a figure nobody trusts.
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, MoreHorizontal, TrendingDown, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDelta, formatKpi, type Kpi } from './kpis';

const INK = '#17191c';
const MUTED = '#8a8f98';
const UP = '#3f9142';
const DOWN = '#e5484d';

/** A small area chart. No axes, no grid — it is there to show a shape. */
export function Trend({ series, tone, idKey, width = 132, height = 42 }: {
  series: number[];
  tone: string;
  /** Makes the fill gradient's id unique on a page full of these. */
  idKey: string;
  width?: number;
  height?: number;
}) {
  const pts = series.length > 1 ? series : [0, 0];
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const span = max - min || 1;
  const pad = 3;
  const x = (i: number) => (i / (pts.length - 1)) * width;
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);

  const line = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const id = `sp-${idKey.replace(/[^a-z0-9]/gi, '')}`;
  const flat = max === min;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true"
      style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity="0.26" />
          <stop offset="100%" stopColor={tone} stopOpacity="0" />
        </linearGradient>
      </defs>
      {!flat && <path d={area} fill={`url(#${id})`} />}
      <path d={line} fill="none" stroke={tone} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        opacity={flat ? 0.35 : 1} />
      <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1])} r="3" fill={tone} />
      <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1])} r="6" fill={tone} opacity="0.18" />
    </svg>
  );
}

export default function KpiTile({ kpi }: { kpi: Kpi }) {
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setMenu(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
    };
  }, [menu]);

  const rising = (kpi.delta ?? 0) >= 0;
  const tone = kpi.delta === null ? MUTED : rising ? UP : DOWN;


  return (
    <div ref={box} className="dash-tile" style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: INK, letterSpacing: '-0.015em' }}>{kpi.label}</h3>
          <p style={{ margin: '2px 0 0', fontSize: 11.5, color: MUTED, fontWeight: 500 }}>{kpi.window}</p>
        </div>
        <button
          type="button"
          aria-label={`About ${kpi.label}`}
          aria-expanded={menu}
          onClick={() => setMenu(v => !v)}
          className="dash-dots"
        >
          <MoreHorizontal size={15} strokeWidth={2.4} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 14 }}>
        <div style={{ minWidth: 0 }}>
          <p className="dash-pop" style={{ margin: 0, fontSize: 'clamp(24px, 2.4vw, 31px)', fontWeight: 800, color: INK, letterSpacing: '-0.035em', lineHeight: 1.05 }}>
            {formatKpi(kpi.value, kpi.format)}
          </p>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8,
            padding: '4px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
            color: tone, backgroundColor: kpi.delta === null ? 'rgba(138,143,152,0.12)' : rising ? 'rgba(63,145,66,0.12)' : 'rgba(229,72,77,0.12)',
          }}>
            {kpi.delta !== null && (rising ? <TrendingUp size={11} strokeWidth={2.6} /> : <TrendingDown size={11} strokeWidth={2.6} />)}
            {formatDelta(kpi.delta)}
            <span style={{ color: MUTED, fontWeight: 600 }}>vs prev 7d</span>
          </span>
        </div>
        <Trend series={kpi.series} idKey={kpi.id} tone={kpi.delta === null ? '#9aa2ad' : rising ? UP : DOWN} />
      </div>

      {menu && (
        <div role="dialog" aria-label={`${kpi.label} — how it is counted`} className="dash-note">
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: '#3c4148' }}>{kpi.note}</p>
          <button type="button" className="press dash-note-link" onClick={() => { setMenu(false); navigate(kpi.path); }}>
            {kpi.linkLabel} <ArrowRight size={12} strokeWidth={2.6} />
          </button>
        </div>
      )}
    </div>
  );
}
