import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, ArrowUpRight, Check, ChevronDown, Circle, CircleDot,
  Search, SlidersHorizontal, Table2,
} from 'lucide-react';
import { INDEX_SYMBOL, type Book, type Quote } from '../../services/marketFeed';
import { BANDS, bandFor, type Band } from './progressBands';
import { ModuleMark } from './moduleIcons';
import { palette, glyphFor, dirOf, colorFor } from './marketTheme';
import { useTheme } from './useTheme';
import { useTilt } from './useTilt';
import Gauge from './Gauge';
import HistoryComb from './HistoryComb';

/**
 * Where the business stands, department by department.
 *
 * Built on the reference's layout and its colour system. That system is worth
 * naming, because copying it well meant copying the logic and not just the
 * palette: in the reference every progress bar is the same lime, because every
 * bar measures the same thing, and *state* is carried by words and small chips —
 * "Overdue", "Unsent", "Viewed". Quantity gets one accent; status gets a label.
 *
 * So here: bars are lime and encode the score by length alone, and health lives
 * in a chip with a tinted pill, an icon and a word. That removes the wall of red
 * bars a new account used to see, and it keeps the health read explicit rather
 * than smuggled into a fill colour.
 *
 * The detail pane is the other half. Each department is scored from different
 * things — Contacts from database, engagement and segmentation; Reputation from
 * volume, reply rate and rating — so selecting one shows its own metrics, its
 * own history and its own way in.
 */

/** 60 daily buckets, so "vs 30 days ago" is a real comparison against a real bucket. */
const LOOKBACK_DAYS = 30;

type SortKey = 'attention' | 'name';
type View = 'split' | 'table';

interface Row {
  q: Quote;
  score: number;
  delta: number;
  band: Band;
}

/* ── The accent, stepped per surface ──
   #c7f441 is 14:1 on a near-black card and 1.28:1 on white, so the same hex
   cannot do both jobs. The bar fill takes the step that clears 3:1 against the
   surface it is drawn on; the call-to-action keeps the bright lime in both
   modes, because there it is a large shape carrying near-black text. */
const LIME_ON_DARK = '#c7f441';
const LIME_ON_LIGHT = '#65a30d';
const LIME_CTA = '#c7f441';
const ON_LIME = '#0e1117';
/** The CTA is pale against white, so its edge is drawn rather than assumed. */
const LIME_CTA_EDGE = '#a8d327';

export default function ProgressBoard({ book }: { book: Book }) {
  const navigate = useNavigate();
  const theme = useTheme();
  const p = palette(theme);
  const dark = theme === 'dark';

  const [sort, setSort] = useState<SortKey>('attention');
  const [view, setView] = useState<View>('split');
  const [picked, setPicked] = useState<string>('');
  const [query, setQuery] = useState('');
  const [bandFilter, setBandFilter] = useState<string>('all');

  const index = book.quotes.find(q => q.module.symbol === INDEX_SYMBOL);

  const past = (q: Quote): number => {
    const c = q.candles;
    if (c.length < 2) return q.truth;
    return c[Math.max(0, c.length - 1 - LOOKBACK_DAYS)].c;
  };

  const all: Row[] = useMemo(() => book.quotes
    .filter(q => q.module.symbol !== INDEX_SYMBOL)
    .map(q => {
      const score = Math.max(0, Math.min(100, q.truth));
      return { q, score, delta: q.truth - past(q), band: bandFor(score) };
    }), [book]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = all.slice();
    if (bandFilter !== 'all') list = list.filter(r => r.band.key === bandFilter);
    if (needle) list = list.filter(r => `${r.q.module.name} ${r.q.module.dept}`.toLowerCase().includes(needle));
    return sort === 'attention'
      ? list.sort((a, b) => a.score - b.score)
      : list.sort((a, b) => a.q.module.name.localeCompare(b.q.module.name));
  }, [all, sort, query, bandFilter]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(BANDS.map(b => [b.key, 0])) as Record<string, number>;
    for (const r of all) c[r.band.key] += 1;
    return c;
  }, [all]);

  const overall = index ? Math.max(0, Math.min(100, index.truth)) : 0;
  const overallDelta = index ? index.truth - past(index) : 0;
  const overallBand = bandFor(overall);
  const current = rows.find(r => r.q.module.symbol === picked) ?? rows[0];
  const activeFilters = (sort === 'attention' ? 0 : 1) + (query.trim() ? 1 : 0) + (bandFilter === 'all' ? 0 : 1);

  /* ── Surfaces ──
     The reference reads as raised cards on a recessed plane, with one bright
     working card. Light mode needs its own version of that, because a white
     card on a white panel is invisible. */
  const PLANE = dark ? '#0c0e12' : '#eef0f4';
  const TILE_BG = dark ? '#161a20' : '#ffffff';
  const TILE_LINE = dark ? '#232a33' : '#e3e6eb';
  const LIME_TILE = dark ? LIME_ON_DARK : LIME_ON_LIGHT;
  const TRACK_TILE = dark ? 'rgba(255,255,255,0.10)' : '#e6e9ee';

  /** The bright working card. White in both themes, as in the reference. */
  const SHEET = '#ffffff';
  const SHEET_SUNK = '#f3f5f7';
  const SHEET_LINE = '#e8eaee';
  const SHEET_INK = '#17191c';
  const SHEET_MUTED = '#6b7480';

  const { tiltProps: bandTilt } = useTilt(3);
  const { tiltProps: gaugeTilt } = useTilt(5);

  const TILE: React.CSSProperties = {
    backgroundColor: TILE_BG, borderRadius: 22, border: `1px solid ${TILE_LINE}`, padding: '16px 18px',
  };

  return (
    <div data-noinvert style={{
      backgroundColor: PLANE, borderRadius: 26,
      border: `1px solid ${TILE_LINE}`, overflow: 'hidden',
    }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, padding: '18px 18px 6px', flexWrap: 'wrap',
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: p.textStrong, letterSpacing: '-0.025em' }}>
            Business progress
          </h3>
          <p style={{ margin: '3px 0 0', fontSize: 11.5, color: p.textDim }}>
            {book.real
              ? `Every department scored out of 100 from your own records · ${book.recordCount.toLocaleString()} records`
              : 'Sample figures until you have enough records — they become yours as you use the app'}
          </p>
        </div>
        <button onClick={() => navigate('/analytics')} className="press" style={ctaStyle()}>
          Full analytics <ArrowUpRight size={13} />
        </button>
      </div>

      {/* ── Summary band ── */}
      <div style={{ display: 'flex', gap: 12, padding: '14px 18px', flexWrap: 'wrap', alignItems: 'stretch' }}>

        <div className="tilt-card" {...bandTilt} style={{ ...TILE, flex: '2 1 470px', minWidth: 320 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(122px, 1fr))', gap: 18 }}>
            {BANDS.map(b => {
              const members = all.filter(r => r.band.key === b.key);
              return (
                <div key={b.key}>
                  <BandChip band={b} onLight={!dark} />
                  <p style={{ margin: '10px 0 0', fontSize: 31, fontWeight: 800, color: p.textStrong, lineHeight: 1, letterSpacing: '-0.03em' }}>
                    {counts[b.key]}
                  </p>
                  <div style={{ margin: '11px 0 10px' }}>
                    <Bar
                      score={all.length ? (counts[b.key] / all.length) * 100 : 0}
                      fill={LIME_TILE}
                      track={TRACK_TILE}
                      label={`${counts[b.key]} of ${all.length} departments`}
                      thin
                    />
                  </div>
                  <div style={{ display: 'flex', minHeight: 22 }}>
                    {members.slice(0, 5).map((r, i) => (
                      <span key={r.q.module.symbol} title={r.q.module.name} style={{ marginLeft: i === 0 ? 0 : -7 }}>
                        <ModuleMark symbol={r.q.module.symbol} size={22} />
                      </span>
                    ))}
                    {members.length > 5 && (
                      <span style={{
                        marginLeft: -7, width: 22, height: 22, borderRadius: 999, flexShrink: 0,
                        backgroundColor: dark ? '#232a33' : '#eef0f4', color: p.textMuted,
                        fontSize: 9.5, fontWeight: 800,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        border: `2px solid ${TILE_BG}`,
                      }}>+{members.length - 5}</span>
                    )}
                    {members.length === 0 && (
                      <span style={{ fontSize: 10.5, color: p.textDim, alignSelf: 'center' }}>None</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="tilt-card" {...gaugeTilt} style={{ ...TILE, flex: '1 1 265px', minWidth: 250, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative', flexShrink: 0, padding: 3 }}>
            <Gauge
              value={overall}
              fill={LIME_TILE}
              track={TRACK_TILE}
              surface={TILE_BG}
              label={overallBand.label}
              size={116}
              thickness={9}
            />
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
            }}>
              <span style={{ fontSize: 33, fontWeight: 800, color: p.textStrong, letterSpacing: '-0.03em', lineHeight: 1 }}>
                {overall.toFixed(0)}
              </span>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: p.textDim, marginTop: 2 }}>of 100</span>
            </div>
          </div>

          <div style={{ minWidth: 0 }}>
            <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: p.textMuted }}>Overall progress</p>
            <BandChip band={overallBand} onLight={!dark} />
            <Delta value={overallDelta} p={p} suffix={`vs ${LOOKBACK_DAYS} days ago`} />
            {index && (
              <div style={{ marginTop: 12 }}>
                <HistoryComb candles={index.candles} color={p.textDim} accent={LIME_TILE} height={26} label="Overall progress" />
                <p style={{ margin: '5px 0 0', fontSize: 9.5, color: p.textDim }}>Last 44 days</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Filter row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '2px 18px 14px', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: p.textMuted }}>
          <SlidersHorizontal size={13} /> Active filters
          <span style={{
            minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999,
            backgroundColor: activeFilters ? LIME_CTA : (dark ? '#232a33' : '#e3e6eb'),
            color: activeFilters ? ON_LIME : p.textDim,
            fontSize: 10.5, fontWeight: 800,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>{activeFilters}</span>
        </span>

        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px',
          borderRadius: 999, border: `1px solid ${TILE_LINE}`, backgroundColor: TILE_BG,
          fontSize: 11.5, color: p.textMuted, minWidth: 186,
        }}>
          <Search size={13} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Find a department"
            aria-label="Find a department"
            style={{
              border: 'none', outline: 'none', background: 'transparent',
              color: p.textStrong, fontSize: 11.5, fontFamily: 'inherit', width: '100%', minWidth: 0,
            }}
          />
        </label>

        <Pill
          label={sort === 'attention' ? 'Weakest first' : 'A to Z'}
          onClick={() => setSort(sort === 'attention' ? 'name' : 'attention')}
          icon={ChevronDown} bg={TILE_BG} line={TILE_LINE} ink={p.textMuted}
        />
        <Pill
          label={view === 'split' ? 'Table view' : 'Split view'}
          onClick={() => setView(view === 'split' ? 'table' : 'split')}
          icon={Table2} bg={TILE_BG} line={TILE_LINE} ink={p.textMuted}
          on={view === 'table'}
        />
      </div>

      {/* ── The working card ── */}
      <div style={{ padding: '0 18px 18px' }}>
        <div style={{ backgroundColor: SHEET, borderRadius: 22, overflow: 'hidden' }}>

          {/* Segmented control, as in the reference: a dark pill group riding
              the top of the bright card, active segment in lime. */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, padding: '14px 16px 12px', flexWrap: 'wrap',
          }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: SHEET_INK }}>Departments</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: SHEET_MUTED }}>
                {rows.length} shown · {sort === 'attention' ? 'weakest first' : 'A to Z'}
              </p>
            </div>

            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, padding: 4,
              borderRadius: 999, backgroundColor: '#15181d', flexWrap: 'wrap',
            }}>
              <Segment label="All" count={all.length} on={bandFilter === 'all'} onClick={() => setBandFilter('all')} />
              {BANDS.map(b => (
                <Segment
                  key={b.key}
                  label={b.key === 'attention' ? 'Attention' : b.label}
                  count={counts[b.key]}
                  on={bandFilter === b.key}
                  onClick={() => setBandFilter(bandFilter === b.key ? 'all' : b.key)}
                />
              ))}
            </div>
          </div>

          {view === 'table' ? (
            <ScoreTable rows={rows} sheetInk={SHEET_INK} sheetMuted={SHEET_MUTED} line={SHEET_LINE} />
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch' }}>

              {/* Master */}
              <div style={{ flex: '1 1 330px', minWidth: 296, borderRight: `1px solid ${SHEET_LINE}` }}>
                {rows.length === 0 && (
                  <p style={{ padding: '4px 18px 20px', fontSize: 12.5, color: SHEET_MUTED, margin: 0 }}>
                    Nothing matches those filters.
                  </p>
                )}
                <div style={{ padding: '0 8px 12px', maxHeight: 388, overflowY: 'auto' }}>
                  {rows.map((r, i) => {
                    const on = current?.q.module.symbol === r.q.module.symbol;
                    return (
                      <button
                        key={r.q.module.symbol}
                        onClick={() => setPicked(r.q.module.symbol)}
                        aria-pressed={on}
                        className="row-in press"
                        style={{
                          ['--i' as string]: i,
                          display: 'grid', gridTemplateColumns: '32px 1fr 104px 40px',
                          alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                          padding: '10px 12px', border: 'none', borderRadius: 16,
                          // Selection inverts against the card, as in the reference.
                          backgroundColor: on ? '#15181d' : 'transparent',
                          cursor: 'pointer', marginBottom: 2,
                        }}
                      >
                        <ModuleMark symbol={r.q.module.symbol} size={32} />
                        <span style={{ minWidth: 0 }}>
                          <span style={{
                            display: 'block', fontSize: 12.5, fontWeight: 700,
                            color: on ? '#ffffff' : SHEET_INK,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>{r.q.module.name}</span>
                          <span style={{
                            display: 'block', fontSize: 10.5,
                            color: on ? 'rgba(255,255,255,0.62)' : SHEET_MUTED,
                          }}>{r.q.module.dept}</span>
                        </span>
                        <span style={{ justifySelf: 'start' }}>
                          <BandChip band={r.band} onLight={!on} compact />
                        </span>
                        <span style={{
                          fontSize: 15.5, fontWeight: 800, textAlign: 'right',
                          color: on ? '#ffffff' : SHEET_INK, fontVariantNumeric: 'tabular-nums',
                        }}>{r.score.toFixed(0)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Detail — different for every department. */}
              {current && (
                <div style={{ flex: '1.25 1 380px', minWidth: 320, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '2px 18px 0', flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: SHEET_MUTED }}>
                          {current.q.module.dept}
                        </p>
                        <h4 style={{ margin: '3px 0 0', fontSize: 20, fontWeight: 800, color: SHEET_INK, letterSpacing: '-0.025em' }}>
                          {current.q.module.name}
                        </h4>
                      </div>
                      <BandChip band={current.band} onLight />
                    </div>

                    <p style={{ margin: '9px 0 14px', fontSize: 11.5, color: SHEET_MUTED, lineHeight: 1.55 }}>
                      {current.q.module.basis}
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(134px, 1fr))', gap: 9 }}>
                      {current.q.breakdown.map(b => (
                        <div key={b.label} title={b.hint} className="hover-lift" style={{
                          position: 'relative', padding: '11px 12px', borderRadius: 15,
                          backgroundColor: SHEET_SUNK,
                        }}>
                          <ArrowUpRight
                            size={12}
                            color={SHEET_MUTED}
                            style={{ position: 'absolute', top: 10, right: 10 }}
                            aria-hidden="true"
                          />
                          <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, color: SHEET_MUTED }}>{b.label}</p>
                          <p style={{ margin: '6px 0 9px', fontSize: 22, fontWeight: 800, color: SHEET_INK, lineHeight: 1 }}>
                            {Math.round(b.score)}
                          </p>
                          <Bar score={b.score} fill={LIME_ON_LIGHT} track="#e0e4e9" label={`${b.label} ${Math.round(b.score)} of 100`} thin />
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop: 14 }}>
                      <HistoryComb
                        candles={current.q.candles}
                        color={SHEET_MUTED}
                        accent={LIME_ON_LIGHT}
                        height={34}
                        label={current.q.module.name}
                      />
                      <p style={{ margin: '5px 0 0', fontSize: 10, color: SHEET_MUTED }}>Last 44 days, out of 100</p>
                    </div>
                  </div>

                  {/* Totals bar, mirroring the reference's sub-total row. */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                    margin: '16px 12px 12px', padding: '13px 16px',
                    borderRadius: 18, backgroundColor: SHEET_SUNK,
                  }}>
                    <Figure label="Score" value={current.score.toFixed(0)} sub="of 100" ink={SHEET_INK} muted={SHEET_MUTED} />
                    <Figure
                      label={`${LOOKBACK_DAYS}-day change`}
                      value={`${current.delta > 0 ? '+' : current.delta < 0 ? '−' : ''}${Math.abs(current.delta).toFixed(1)}`}
                      sub="points"
                      ink={current.delta > 0 ? '#00846b' : current.delta < 0 ? '#e11d48' : SHEET_INK}
                      muted={SHEET_MUTED}
                    />
                    <div style={{ flex: 1 }} />
                    <button onClick={() => navigate(current.q.module.route)} className="press" style={ctaStyle(true)}>
                      Open {current.q.module.dest} <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

/* ── Pieces ── */

/** The lime call-to-action, edged so it does not float on a light surface. */
function ctaStyle(large = false): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: large ? '11px 20px' : '9px 17px',
    borderRadius: 999, border: `1px solid ${LIME_CTA_EDGE}`,
    backgroundColor: LIME_CTA, color: ON_LIME,
    fontSize: large ? 12.5 : 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}

function Pill({ label, onClick, icon: Icon, on, bg, line, ink }: {
  label: string; onClick: () => void; icon: typeof ChevronDown;
  on?: boolean; bg: string; line: string; ink: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="press"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 15px',
        borderRadius: 999,
        border: `1px solid ${on ? LIME_CTA_EDGE : line}`,
        backgroundColor: on ? LIME_CTA : bg,
        color: on ? ON_LIME : ink,
        fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {label} <Icon size={12} />
    </button>
  );
}

/** One segment of the dark filter group riding the working card. */
function Segment({ label, count, on, onClick }: {
  label: string; count: number; on: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="press"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px',
        borderRadius: 999, border: 'none',
        backgroundColor: on ? LIME_CTA : 'transparent',
        color: on ? ON_LIME : 'rgba(255,255,255,0.72)',
        fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {label}
      <span style={{
        minWidth: 17, height: 17, padding: '0 4px', borderRadius: 999,
        backgroundColor: on ? 'rgba(14,17,23,0.16)' : 'rgba(255,255,255,0.12)',
        color: on ? ON_LIME : 'rgba(255,255,255,0.82)',
        fontSize: 9.5, fontWeight: 800,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>{count}</span>
    </button>
  );
}

/**
 * Progress, as length in a single accent.
 *
 * Colour is not doing any work here — the bar means the same thing on every row,
 * exactly as every bar in the reference does. Health is a chip, not a fill.
 */
function Bar({ score, fill, track, label, thin }: {
  score: number; fill: string; track: string; label: string; thin?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div
      role="img"
      aria-label={`${label}: ${pct.toFixed(0)} out of 100`}
      style={{ height: thin ? 6 : 9, borderRadius: 999, width: '100%', backgroundColor: track, overflow: 'hidden' }}
    >
      <div className="bar-grow" style={{
        width: `${Math.max(pct, 1.5)}%`, height: '100%',
        backgroundColor: fill, borderRadius: '0 999px 999px 0',
      }} />
    </div>
  );
}

/**
 * Health, as a chip: a tinted pill, an icon and a word. Three channels, so the
 * state survives colourblindness, greyscale printing and a glance.
 */
function BandChip({ band, onLight, compact }: { band: Band; onLight: boolean; compact?: boolean }) {
  const ink = onLight ? band.ink : band.inkDark;
  const bg = onLight ? band.track : 'rgba(255,255,255,0.10)';
  const Icon = band.key === 'strong' ? Check
    : band.key === 'building' ? CircleDot
      : band.key === 'idle' ? Circle
        : AlertTriangle;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: compact ? '3px 9px' : '5px 11px', borderRadius: 999,
      backgroundColor: bg, maxWidth: '100%',
    }}>
      <Icon size={11} strokeWidth={2.8} color={ink} aria-hidden="true" style={{ flexShrink: 0 }} />
      <span style={{
        fontSize: compact ? 10 : 11, fontWeight: 800, color: ink,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {compact && band.key === 'attention' ? 'Attention' : band.label}
      </span>
    </span>
  );
}

/** Signed, glyphed, and coloured with the already-validated up/down pair. */
function Delta({ value, p, suffix }: { value: number; p: ReturnType<typeof palette>; suffix?: string }) {
  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  const dir = dirOf(rounded);
  const c = colorFor(dir, p);
  const text = `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toFixed(1)}`;
  return (
    <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 9, whiteSpace: 'nowrap' }}>
      <span style={{ fontSize: 9, color: c }} aria-hidden="true">{glyphFor(dir)}</span>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: c, fontVariantNumeric: 'tabular-nums' }}>{text}</span>
      <span style={{ fontSize: 10.5, color: p.textDim }}>{suffix ?? 'pts'}</span>
    </span>
  );
}

function Figure({ label, value, sub, ink, muted }: {
  label: string; value: string; sub: string; ink: string; muted: string;
}) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: muted }}>{label}</p>
      <p style={{ margin: '3px 0 0', fontSize: 20, fontWeight: 800, color: ink, lineHeight: 1 }}>
        {value} <span style={{ fontSize: 10.5, fontWeight: 700, color: muted }}>{sub}</span>
      </p>
    </div>
  );
}

/** The table view. Its existence is what lets a low-contrast fill be legal. */
function ScoreTable({ rows, sheetInk, sheetMuted, line }: {
  rows: Row[]; sheetInk: string; sheetMuted: string; line: string;
}) {
  const cell: React.CSSProperties = {
    padding: '10px 18px', fontSize: 12, color: sheetInk,
    borderBottom: `1px solid ${line}`, textAlign: 'left',
  };
  const num: React.CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
        <caption style={{ captionSide: 'top', textAlign: 'left', padding: '0 18px 8px', fontSize: 11, color: sheetMuted }}>
          Every department's progress score out of 100, with the change over the last {LOOKBACK_DAYS} days.
        </caption>
        <thead>
          <tr>
            {['Department', 'Area', 'Score', `${LOOKBACK_DAYS}-day change`, 'Status'].map((h, i) => (
              <th key={h} style={{
                ...cell, fontSize: 10.5, fontWeight: 800, color: sheetMuted,
                textTransform: 'uppercase', letterSpacing: '0.05em',
                textAlign: i === 2 || i === 3 ? 'right' : 'left',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ q, score, delta, band }) => (
            <tr key={q.module.symbol}>
              <td style={{ ...cell, fontWeight: 700 }}>{q.module.name}</td>
              <td style={{ ...cell, color: sheetMuted }}>{q.module.dept}</td>
              <td style={num}>{score.toFixed(0)}</td>
              <td style={{ ...num, color: delta > 0 ? '#00846b' : delta < 0 ? '#e11d48' : sheetInk }}>
                {delta > 0 ? '+' : delta < 0 ? '−' : ''}{Math.abs(delta).toFixed(1)}
              </td>
              <td style={cell}><BandChip band={band} onLight /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
