import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, ArrowUpRight, Check, ChevronDown, Circle, CircleDot,
  Search, SlidersHorizontal, Table2,
} from 'lucide-react';
import {
  INDEX_SYMBOL, buildBook, type FeedInput, type Quote,
} from '../../services/marketFeed';
import { BANDS, bandFor, type Band } from './progressBands';
import { ModuleMark } from './moduleIcons';
import { palette, glyphFor, dirOf, colorFor } from './marketTheme';
import { useTheme } from './useTheme';
import GrowthActions from './GrowthActions';
import Gauge from './Gauge';
import HistoryComb from './HistoryComb';

/**
 * Where the business stands, department by department.
 *
 * Laid out the way the reference is: a band of dark summary cards on top, a
 * filter row, then one bright working card holding a list on the left and the
 * selected item's detail on the right. The detail is the point — every
 * department is scored from different things, so Contacts breaks down into
 * database, engagement and segmentation while Reputation breaks down into
 * volume, reply rate and rating. A row of ten identical bars could never show
 * that; a master/detail pane shows nothing else.
 *
 * The working card is light in both themes, exactly as in the reference. That
 * matters for more than looks: the band colours were validated separately
 * against a white surface and a near-black one, so anything drawn inside the
 * card uses the light steps even when the page around it is dark.
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

export default function ProgressBoard(props: FeedInput) {
  const {
    contacts, pipelines, appointments, conversations, campaigns,
    reviews, funnels, websites, videoProjects, socialPosts,
  } = props;

  const navigate = useNavigate();
  const theme = useTheme();
  const p = palette(theme);
  const dark = theme === 'dark';
  const accent = dark ? p.accent : p.textStrong;
  const onAccent = dark ? p.onAccent : '#ffffff';

  const [sort, setSort] = useState<SortKey>('attention');
  const [view, setView] = useState<View>('split');
  const [picked, setPicked] = useState<string>('');
  const [query, setQuery] = useState('');

  const book = useMemo(
    () => buildBook(
      { contacts, pipelines, appointments, conversations, campaigns, reviews, funnels, websites, videoProjects, socialPosts },
      '1D',
    ),
    [contacts, pipelines, appointments, conversations, campaigns, reviews, funnels, websites, videoProjects, socialPosts],
  );

  const index = book.quotes.find(q => q.module.symbol === INDEX_SYMBOL);

  /** Score this many days ago, for an honest "since last month" figure. */
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
    const list = needle
      ? all.filter(r => `${r.q.module.name} ${r.q.module.dept}`.toLowerCase().includes(needle))
      : all.slice();
    return sort === 'attention'
      ? list.sort((a, b) => a.score - b.score)
      : list.sort((a, b) => a.q.module.name.localeCompare(b.q.module.name));
  }, [all, sort, query]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(BANDS.map(b => [b.key, 0])) as Record<string, number>;
    for (const r of all) c[r.band.key] += 1;
    return c;
  }, [all]);

  const overall = index ? Math.max(0, Math.min(100, index.truth)) : 0;
  const overallDelta = index ? index.truth - past(index) : 0;
  const overallBand = bandFor(overall);

  // Nothing picked yet: lead with whatever most needs looking at.
  const current = rows.find(r => r.q.module.symbol === picked) ?? rows[0];

  const activeFilters = (sort === 'attention' ? 0 : 1) + (query.trim() ? 1 : 0);

  /* ── Surfaces ── */

  /**
   * The reference gets its structure from figure and ground: a recessed page
   * plane with raised cards on it, and one bright working card that is where the
   * work happens. Light mode needs its own version of that — a white card on a
   * white panel is invisible — so the plane steps back to grey and the cards
   * stay white.
   */
  const PLANE = dark ? p.ink : '#eef0f4';

  const SUMMARY_TILE: React.CSSProperties = {
    backgroundColor: dark ? p.panel : '#ffffff',
    borderRadius: 20,
    border: `1px solid ${dark ? p.border : '#e3e6eb'}`,
    padding: '16px 18px',
    backgroundImage: dark ? 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0) 45%)' : undefined,
  };

  /** The bright working card. White in both themes, as in the reference. */
  const SHEET = '#ffffff';
  const SHEET_LINE = '#e8eaee';
  const SHEET_INK = '#17191c';
  const SHEET_MUTED = '#6b7480';

  return (
    <div data-noinvert style={{
      backgroundColor: PLANE, borderRadius: 24,
      border: `1px solid ${dark ? p.border : '#e3e6eb'}`, overflow: 'hidden',
    }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, padding: '16px 18px 4px', flexWrap: 'wrap',
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: p.textStrong, letterSpacing: '-0.02em' }}>
            Business progress
          </h3>
          <p style={{ margin: '3px 0 0', fontSize: 11.5, color: p.textDim }}>
            {book.real
              ? `Every department scored out of 100 from your own records · ${book.recordCount.toLocaleString()} records`
              : 'Sample figures until you have enough records — they become yours as you use the app'}
          </p>
        </div>
        <button
          onClick={() => navigate('/analytics')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px',
            borderRadius: 999, border: 'none', backgroundColor: accent, color: onAccent,
            fontSize: 12, fontWeight: 800, cursor: 'pointer',
          }}
        >
          Full analytics <ArrowUpRight size={13} />
        </button>
      </div>

      {/* ── Summary band ── */}
      <div style={{ display: 'flex', gap: 12, padding: '14px 18px', flexWrap: 'wrap', alignItems: 'stretch' }}>

        {/* Bands, each with its share and the departments in it. */}
        <div style={{ ...SUMMARY_TILE, flex: '2 1 460px', minWidth: 320 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 18,
          }}>
            {BANDS.map(b => {
              const members = all.filter(r => r.band.key === b.key);
              return (
                <div key={b.key}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 7 }}>
                    <BandIcon band={b} onLight={!dark} />
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: p.textMuted, whiteSpace: 'nowrap' }}>{b.label}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 30, fontWeight: 800, color: p.textStrong, lineHeight: 1, letterSpacing: '-0.02em' }}>
                    {counts[b.key]}
                  </p>
                  <div style={{ margin: '10px 0 9px' }}>
                    <Meter
                      score={all.length ? (counts[b.key] / all.length) * 100 : 0}
                      band={b}
                      onLight={!dark}
                      thin
                    />
                  </div>
                  {/* Which departments, not just how many. */}
                  <div style={{ display: 'flex', minHeight: 22 }}>
                    {members.slice(0, 5).map((r, i) => (
                      <span key={r.q.module.symbol} title={r.q.module.name} style={{ marginLeft: i === 0 ? 0 : -7 }}>
                        <ModuleMark symbol={r.q.module.symbol} size={22} />
                      </span>
                    ))}
                    {members.length > 5 && (
                      <span style={{
                        marginLeft: -7, width: 22, height: 22, borderRadius: 999, flexShrink: 0,
                        backgroundColor: p.panelHi, color: p.textMuted, fontSize: 9.5, fontWeight: 800,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        border: `2px solid ${p.panel}`,
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

        {/* The composite, as an arc. */}
        <div style={{
          ...SUMMARY_TILE, flex: '1 1 260px', minWidth: 250, position: 'relative',
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{ position: 'relative', flexShrink: 0, padding: 3 }}>
            {/* Brand accent, not a band colour: this is the composite index, a
                different entity from the ten departments, and its band is said
                in words right beside it. */}
            <Gauge
              value={overall}
              fill={accent}
              track={dark ? 'rgba(255,255,255,0.10)' : '#e9ebee'}
              surface={p.panel}
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
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: p.textMuted }}>Overall progress</p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 7 }}>
              <BandIcon band={overallBand} onLight={!dark} />
              <span style={{ fontSize: 12, fontWeight: 800, color: dark ? overallBand.inkDark : overallBand.ink }}>
                {overallBand.label}
              </span>
            </div>
            <Delta value={overallDelta} p={p} suffix={`vs ${LOOKBACK_DAYS} days ago`} />
            {index && (
              <div style={{ marginTop: 12 }}>
                <HistoryComb candles={index.candles} color={p.textDim} accent={accent} height={26} label="Overall progress" />
                <p style={{ margin: '5px 0 0', fontSize: 9.5, color: p.textDim }}>Last 44 days</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Filter row ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '2px 18px 14px', flexWrap: 'wrap',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: p.textMuted }}>
          <SlidersHorizontal size={13} /> Active filters
          <span style={{
            minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999,
            backgroundColor: activeFilters ? accent : p.panelHi,
            color: activeFilters ? onAccent : p.textDim,
            fontSize: 10.5, fontWeight: 800,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>{activeFilters}</span>
        </span>

        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px',
          borderRadius: 999, border: `1px solid ${dark ? p.border : '#e3e6eb'}`,
          backgroundColor: dark ? p.panel : '#ffffff',
          fontSize: 11.5, color: p.textMuted, minWidth: 180,
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
          p={p}
          icon={ChevronDown}
        />
        <Pill
          label={view === 'split' ? 'Table view' : 'Split view'}
          onClick={() => setView(view === 'split' ? 'table' : 'split')}
          p={p}
          icon={Table2}
          on={view === 'table'}
          accent={accent}
          onAccent={onAccent}
        />
      </div>

      {/* ── The working card ── */}
      <div style={{ padding: '0 18px 18px' }}>
        <div style={{ backgroundColor: SHEET, borderRadius: 20, overflow: 'hidden' }}>
          {view === 'table' ? (
            <ScoreTable rows={rows} sheetInk={SHEET_INK} sheetMuted={SHEET_MUTED} line={SHEET_LINE} />
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch' }}>

              {/* Master */}
              <div style={{ flex: '1 1 320px', minWidth: 290, borderRight: `1px solid ${SHEET_LINE}` }}>
                <div style={{ padding: '15px 18px 10px' }}>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: SHEET_INK }}>Departments</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: SHEET_MUTED }}>
                    {rows.length} shown · {sort === 'attention' ? 'weakest first' : 'A to Z'}
                  </p>
                </div>

                {rows.length === 0 && (
                  <p style={{ padding: '18px', fontSize: 12.5, color: SHEET_MUTED, margin: 0 }}>
                    Nothing matches “{query}”.
                  </p>
                )}

                {/* Scrolls inside the card rather than stretching it, so ten
                    departments do not leave a void beside a short detail. */}
                <div style={{ paddingBottom: 10, maxHeight: 372, overflowY: 'auto' }}>
                  {rows.map(r => {
                    const on = current?.q.module.symbol === r.q.module.symbol;
                    return (
                      <button
                        key={r.q.module.symbol}
                        onClick={() => setPicked(r.q.module.symbol)}
                        aria-pressed={on}
                        style={{
                          display: 'grid', gridTemplateColumns: '30px 1fr 92px 44px',
                          alignItems: 'center', gap: 10, width: 'calc(100% - 16px)', textAlign: 'left',
                          padding: '9px 14px', margin: '0 8px',
                          border: on ? `1px solid ${SHEET_INK}` : '1px solid transparent',
                          borderRadius: 14,
                          backgroundColor: on ? '#f7f8fa' : 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <ModuleMark symbol={r.q.module.symbol} size={30} />
                        <span style={{ minWidth: 0 }}>
                          <span style={{
                            display: 'block', fontSize: 12.5, fontWeight: 700, color: SHEET_INK,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>{r.q.module.name}</span>
                          <span style={{ display: 'block', fontSize: 10.5, color: SHEET_MUTED }}>{r.q.module.dept}</span>
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifySelf: 'start' }}>
                          <BandIcon band={r.band} onLight />
                          <span style={{ fontSize: 10, fontWeight: 700, color: r.band.ink, whiteSpace: 'nowrap' }}>
                            {r.band.key === 'attention' ? 'Attention' : r.band.label}
                          </span>
                        </span>
                        <span style={{
                          fontSize: 15, fontWeight: 800, color: SHEET_INK, textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                        }}>{r.score.toFixed(0)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Detail — different for every department, because every
                  department is scored from different things. */}
              {current && (
                <div style={{ flex: '1.2 1 380px', minWidth: 320, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '15px 18px 0', flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: SHEET_MUTED }}>
                          {current.q.module.dept}
                        </p>
                        <h4 style={{ margin: '3px 0 0', fontSize: 19, fontWeight: 800, color: SHEET_INK, letterSpacing: '-0.02em' }}>
                          {current.q.module.name}
                        </h4>
                      </div>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                        padding: '5px 11px', borderRadius: 999, backgroundColor: current.band.track,
                      }}>
                        <BandIcon band={current.band} onLight />
                        <span style={{ fontSize: 11, fontWeight: 800, color: current.band.ink, whiteSpace: 'nowrap' }}>
                          {current.band.label}
                        </span>
                      </span>
                    </div>

                    <p style={{ margin: '9px 0 14px', fontSize: 11.5, color: SHEET_MUTED, lineHeight: 1.55 }}>
                      {current.q.module.basis}
                    </p>

                    {/* The parts this department's score is actually made of. */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gap: 9,
                    }}>
                      {current.q.breakdown.map(b => (
                        <div key={b.label} title={b.hint} style={{
                          padding: '10px 12px', borderRadius: 13,
                          backgroundColor: '#f7f8fa', border: `1px solid ${SHEET_LINE}`,
                        }}>
                          <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, color: SHEET_MUTED }}>{b.label}</p>
                          <p style={{
                            margin: '5px 0 8px', fontSize: 21, fontWeight: 800, color: SHEET_INK, lineHeight: 1,
                          }}>{Math.round(b.score)}</p>
                          <Meter score={b.score} band={bandFor(b.score)} onLight thin />
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop: 14 }}>
                      <HistoryComb
                        candles={current.q.candles}
                        color={SHEET_MUTED}
                        accent={current.band.fill}
                        height={34}
                        label={current.q.module.name}
                      />
                      <p style={{ margin: '5px 0 0', fontSize: 10, color: SHEET_MUTED }}>
                        Last 44 days, out of 100
                      </p>
                    </div>
                  </div>

                  {/* Totals footer, mirroring the reference's sub-total row. */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                    margin: '16px 12px 12px', padding: '13px 15px',
                    borderRadius: 16, backgroundColor: '#f2f4f7',
                  }}>
                    <Figure label="Score" value={`${current.score.toFixed(0)}`} sub="of 100" ink={SHEET_INK} muted={SHEET_MUTED} />
                    <Figure
                      label={`${LOOKBACK_DAYS}-day change`}
                      value={`${current.delta > 0 ? '+' : current.delta < 0 ? '−' : ''}${Math.abs(current.delta).toFixed(1)}`}
                      sub="points"
                      ink={current.delta > 0 ? '#00846b' : current.delta < 0 ? '#e11d48' : SHEET_INK}
                      muted={SHEET_MUTED}
                    />
                    <div style={{ flex: 1 }} />
                    <button
                      onClick={() => navigate(current.q.module.route)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px',
                        borderRadius: 999, border: 'none', backgroundColor: dark ? p.accent : SHEET_INK,
                        color: dark ? p.onAccent : '#ffffff', fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
                      }}
                    >
                      Open {current.q.module.dest} <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── What to do next ── */}
      <div style={{ borderTop: `1px solid ${p.border}` }}>
        <div style={{ padding: '14px 18px 4px' }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: p.textStrong }}>What to do next</p>
          <p style={{ margin: '3px 0 0', fontSize: 11, color: p.textDim }}>
            Ranked by how much each one would actually move the overall score.
          </p>
        </div>
        <GrowthActions actions={book.actions.slice(0, 5)} p={p} onFocus={sym => setPicked(sym)} />
      </div>
    </div>
  );
}

/* ── Pieces ── */

function Pill({ label, onClick, p, icon: Icon, on, accent, onAccent }: {
  label: string;
  onClick: () => void;
  p: ReturnType<typeof palette>;
  icon: typeof ChevronDown;
  on?: boolean;
  accent?: string;
  onAccent?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px',
        borderRadius: 999,
        border: `1px solid ${on ? 'transparent' : p.border}`,
        backgroundColor: on && accent ? accent : p.panel,
        color: on && onAccent ? onAccent : p.textMuted,
        fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {label} <Icon size={12} />
    </button>
  );
}

/**
 * The bar. Length carries the score; the fill carries the band; the hairline
 * keeps the amber's edge visible on white, where it is deliberately low
 * contrast.
 *
 * `onLight` is the surface it is drawn on, not the app's theme — the working
 * card is light even when the page around it is dark, and the bands have
 * separate steps validated against each surface.
 */
function Meter({ score, band, onLight, thin }: { score: number; band: Band; onLight: boolean; thin?: boolean }) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div
      role="img"
      aria-label={`${pct.toFixed(0)} out of 100 — ${band.label}`}
      style={{
        height: thin ? 5 : 8, borderRadius: 999, width: '100%',
        backgroundColor: onLight ? band.track : band.trackDark, overflow: 'hidden',
      }}
    >
      <div style={{
        width: `${Math.max(pct, 1.5)}%`, height: '100%',
        backgroundColor: band.fill,
        boxShadow: `inset 0 0 0 1px ${band.edge}`,
        borderRadius: '0 999px 999px 0',
      }} />
    </div>
  );
}

function BandIcon({ band, onLight }: { band: Band; onLight: boolean }) {
  const c = onLight ? band.ink : band.inkDark;
  // Four bands, four distinct glyphs. Two bands sharing a mark would put the
  // whole distinction back onto colour, which is the thing the icon is here to
  // prevent.
  if (band.key === 'strong') return <Check size={12} strokeWidth={3} color={c} aria-hidden="true" />;
  if (band.key === 'building') return <CircleDot size={12} strokeWidth={2.6} color={c} aria-hidden="true" />;
  if (band.key === 'idle') return <Circle size={12} strokeWidth={2.2} color={c} aria-hidden="true" />;
  return <AlertTriangle size={12} strokeWidth={2.6} color={c} aria-hidden="true" />;
}

/** Signed, glyphed, and coloured with the already-validated up/down pair. */
function Delta({ value, p, suffix, compact }: {
  value: number; p: ReturnType<typeof palette>; suffix?: string; compact?: boolean;
}) {
  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  const dir = dirOf(rounded);
  const c = colorFor(dir, p);
  const text = `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toFixed(1)}`;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 4,
      marginTop: compact ? 0 : 8, whiteSpace: 'nowrap',
    }}>
      <span style={{ fontSize: 9, color: c }} aria-hidden="true">{glyphFor(dir)}</span>
      <span style={{ fontSize: compact ? 12 : 12.5, fontWeight: 800, color: c, fontVariantNumeric: 'tabular-nums' }}>
        {text}
      </span>
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
      <p style={{ margin: '3px 0 0', fontSize: 19, fontWeight: 800, color: ink, lineHeight: 1 }}>
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
        <caption style={{ captionSide: 'top', textAlign: 'left', padding: '13px 18px 4px', fontSize: 11, color: sheetMuted }}>
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
              <td style={cell}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <BandIcon band={band} onLight />
                  <span style={{ fontWeight: 700, color: band.ink, fontSize: 11.5 }}>{band.label}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
