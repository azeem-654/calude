import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, ArrowUpRight, Check, CircleDot,
  Gauge as GaugeIcon, LayoutList, ListChecks, Sparkles, Table2,
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
 * Where the business actually stands, department by department.
 *
 * The numbers are the same ones the delta-stream engine has always produced —
 * every department scored 0–100 from the records themselves. What changed is the
 * reading of them. A candlestick chart answers "what did the price do in the
 * last four hours"; nobody running a business asks that about their own
 * contacts. The question is "which parts are healthy, which are not, and what
 * should I do about it", and that is a ranked list of meters, not an exchange.
 *
 * Form follows that job. Magnitude across ten named departments is a bar; a
 * single current value plus a trend is a stat tile; the one number the dashboard
 * leads with is a hero figure. None of those need ten colours — colour here
 * carries the health band and nothing else, and never carries it alone.
 */

/** 60 daily buckets, so "vs 30 days ago" is a real comparison against a real bucket. */
const LOOKBACK_DAYS = 30;

type SortKey = 'attention' | 'name';
type View = 'list' | 'table';

interface Props extends FeedInput {
  /** How many departments to list before the "show all" fold. */
  initialRows?: number;
}

export default function ProgressBoard(props: Props) {
  const {
    contacts, pipelines, appointments, conversations, campaigns,
    reviews, funnels, websites, videoProjects, socialPosts, initialRows = 10,
  } = props;

  const navigate = useNavigate();
  const theme = useTheme();
  const p = palette(theme);
  const dark = theme === 'dark';

  const [sort, setSort] = useState<SortKey>('attention');
  const [view, setView] = useState<View>('list');
  const [openRow, setOpenRow] = useState<string>('');

  // Replaying the whole event history is the expensive part, so it is keyed on
  // the records rather than on the parent's render.
  const book = useMemo(
    () => buildBook(
      { contacts, pipelines, appointments, conversations, campaigns, reviews, funnels, websites, videoProjects, socialPosts },
      '1D',
    ),
    [contacts, pipelines, appointments, conversations, campaigns, reviews, funnels, websites, videoProjects, socialPosts],
  );

  const index = book.quotes.find(q => q.module.symbol === INDEX_SYMBOL);
  const departments = useMemo(
    () => book.quotes.filter(q => q.module.symbol !== INDEX_SYMBOL),
    [book],
  );

  /** Score this many days ago, for an honest "since last month" figure. */
  const past = (q: Quote): number => {
    const c = q.candles;
    if (c.length < 2) return q.truth;
    return c[Math.max(0, c.length - 1 - LOOKBACK_DAYS)].c;
  };

  const rows = useMemo(() => {
    const list = departments.map(q => ({
      q,
      score: Math.max(0, Math.min(100, q.truth)),
      delta: q.truth - past(q),
      band: bandFor(Math.max(0, Math.min(100, q.truth))),
    }));
    return sort === 'attention'
      ? list.sort((a, b) => a.score - b.score)
      : list.sort((a, b) => a.q.module.name.localeCompare(b.q.module.name));
  }, [departments, sort]);

  // Seeded from BANDS rather than a hand-written literal, so adding a band can
  // never leave a tile counting `undefined + 1`.
  const counts = useMemo(() => {
    const c = Object.fromEntries(BANDS.map(b => [b.key, 0])) as Record<string, number>;
    for (const r of rows) c[r.band.key] += 1;
    return c;
  }, [rows]);

  const overall = index ? Math.max(0, Math.min(100, index.truth)) : 0;
  const overallDelta = index ? index.truth - past(index) : 0;

  const CARD: React.CSSProperties = {
    backgroundColor: p.ink, borderRadius: 22, border: `1px solid ${p.border}`,
    overflow: 'hidden',
  };

  /**
   * An inner tile — the unit the whole panel is built out of. The top highlight
   * is chrome: a few percent of white along the upper edge so tiles read as
   * raised against a near-black panel. It sits behind the marks and encodes
   * nothing.
   */
  const TILE: React.CSSProperties = {
    backgroundColor: p.panel, borderRadius: 18, border: `1px solid ${p.border}`,
    padding: '14px 15px 15px',
    backgroundImage: dark
      ? 'linear-gradient(180deg, rgba(255,255,255,0.038), rgba(255,255,255,0) 42%)'
      : undefined,
  };

  const overallBand = bandFor(overall);

  return (
    // The app inverts #root for dark mode; this panel opts out and picks its own
    // colours, so the bands stay the colours they were validated as.
    <div data-noinvert style={CARD}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, padding: '14px 16px', borderBottom: `1px solid ${p.border}`, flexWrap: 'wrap',
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: p.textStrong, letterSpacing: '-0.01em' }}>
            Business progress
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: 11.5, color: p.textDim }}>
            {book.real
              ? `Every department scored out of 100 from your own records · ${book.recordCount.toLocaleString()} records`
              : 'Sample figures until you have enough records — they become yours as you use the app'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {([['attention', 'Needs attention first', LayoutList], ['name', 'A–Z', LayoutList]] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              aria-pressed={sort === k}
              style={chip(sort === k, p)}
            >
              {label}
            </button>
          ))}
          <span style={{ width: 1, backgroundColor: p.border, margin: '0 3px' }} />
          <button onClick={() => setView(view === 'list' ? 'table' : 'list')} style={chip(view === 'table', p)}>
            <Table2 size={11} style={{ marginRight: 4, verticalAlign: -1 }} />
            {view === 'table' ? 'Chart' : 'Table'}
          </button>
        </div>
      </div>

      {/* ── Hero + band summary ── */}
      <div style={{
        display: 'flex', gap: 12, padding: '14px', flexWrap: 'wrap',
        borderBottom: `1px solid ${p.border}`, alignItems: 'stretch',
      }}>
        {/* The headline: one ratio against a fixed limit, so an arc. */}
        <div style={{ ...TILE, flex: '1 1 300px', minWidth: 280, display: 'flex', gap: 18, alignItems: 'center', padding: '16px 18px' }}>
          {/* The arc's leading dot sits proud of the stroke, so the box gets a
              little room rather than clipping it against the tile edge. */}
          <div style={{ position: 'relative', flexShrink: 0, padding: 4 }}>
            {/* The arc wears the brand accent, not a band colour. It is the
                composite index — a different entity from the ten departments
                below — so it is not competing with their encoding, and its band
                is stated in words and an icon immediately beside it. */}
            <Gauge
              value={overall}
              fill={accentOf(p, dark)}
              track={dark ? 'rgba(255,255,255,0.10)' : '#e9ebee'}
              surface={p.panel}
              label={overallBand.label}
              size={132}
              thickness={10}
            />
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
            }}>
              {/* Proportional figures — a hero number, not a column. */}
              <span style={{ fontSize: 38, fontWeight: 800, color: p.textStrong, letterSpacing: '-0.03em', lineHeight: 1 }}>
                {overall.toFixed(0)}
              </span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: p.textDim, marginTop: 3 }}>of 100</span>
            </div>
          </div>

          <div style={{ minWidth: 0 }}>
            <TileHeader icon={GaugeIcon} label="Overall progress" p={p} accent={accentOf(p, dark)} />
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 9 }}>
              <BandIcon band={overallBand} dark={dark} />
              <span style={{ fontSize: 12, fontWeight: 800, color: dark ? overallBand.inkDark : overallBand.ink }}>
                {overallBand.label}
              </span>
            </div>
            <Delta value={overallDelta} p={p} suffix={`vs ${LOOKBACK_DAYS} days ago`} />
            {index && (
              <div style={{ marginTop: 12 }}>
                <HistoryComb
                  candles={index.candles}
                  color={p.textDim}
                  accent={accentOf(p, dark)}
                  height={30}
                  label="Overall progress"
                />
                <p style={{ margin: '5px 0 0', fontSize: 10, color: p.textDim }}>Last 44 days</p>
              </div>
            )}
          </div>
        </div>

        {/* One tile per band — the triage summary. */}
        <div style={{
          flex: '1 1 340px', minWidth: 300,
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12,
        }}>
          {BANDS.map(b => (
            <div key={b.key} style={TILE}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <BandIcon band={b} dark={dark} />
                <span style={{ fontSize: 11, fontWeight: 700, color: dark ? b.inkDark : b.ink }}>{b.label}</span>
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 30, fontWeight: 800, color: p.textStrong, lineHeight: 1, letterSpacing: '-0.02em' }}>
                {counts[b.key]}
              </p>
              <p style={{ margin: '4px 0 8px', fontSize: 10.5, color: p.textDim }}>
                of {rows.length} {rows.length === 1 ? 'department' : 'departments'}
              </p>
              {/* This band's share of the ten, so the tile carries a shape as
                  well as a count and the four can be compared at a glance. */}
              <Meter
                score={rows.length ? (counts[b.key] / rows.length) * 100 : 0}
                band={b}
                dark={dark}
                thin
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── The departments ── */}
      <div style={{ padding: '4px 16px 0', display: 'flex', alignItems: 'center', gap: 7 }}>
        <ListChecks size={13} strokeWidth={2.2} color={accentOf(p, dark)} aria-hidden="true" />
        <span style={{ fontSize: 11, fontWeight: 700, color: p.textMuted }}>
          Every department, {sort === 'attention' ? 'weakest first' : 'A to Z'}
        </span>
      </div>

      {view === 'table' ? (
        <ScoreTable rows={rows} p={p} dark={dark} />
      ) : (
        <div style={{ paddingTop: 4 }}>
          {rows.slice(0, initialRows).map(({ q, score, delta, band }) => {
            const open = openRow === q.module.symbol;
            return (
              <div key={q.module.symbol} style={{ borderBottom: `1px solid ${p.border}` }}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenRow(open ? '' : q.module.symbol)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenRow(open ? '' : q.module.symbol); } }}
                  aria-expanded={open}
                  style={{
                    display: 'grid',
                    // Every column is capped and a trailing spacer takes the
                    // slack, so the figures stay grouped instead of drifting to
                    // opposite edges of a wide panel — and the meter never
                    // stretches into something that reads as a rule.
                    gridTemplateColumns: 'minmax(170px, 250px) minmax(110px, 230px) 46px 134px 128px 1fr',
                    alignItems: 'center', gap: 14, padding: '11px 16px', cursor: 'pointer',
                    backgroundColor: open ? p.panel : 'transparent',
                  }}
                >
                  {/* Identity */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <ModuleMark symbol={q.module.symbol} size={26} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: p.textStrong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {q.module.name}
                      </p>
                      <p style={{ margin: 0, fontSize: 10.5, color: p.textDim }}>{q.module.dept}</p>
                    </div>
                  </div>

                  {/* Meter — length is the encoding; colour is the band. */}
                  <Meter score={score} band={band} dark={dark} />

                  <span style={{
                    fontSize: 15, fontWeight: 800, color: p.textStrong, textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                  }}>{score.toFixed(0)}</span>

                  {/* Band, in words with an icon — never colour alone. */}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <BandIcon band={band} dark={dark} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: dark ? band.inkDark : band.ink, whiteSpace: 'nowrap' }}>
                      {band.label}
                    </span>
                  </span>

                  <Delta value={delta} p={p} compact />

                  <ArrowUpRight
                    size={14}
                    strokeWidth={2.4}
                    color={open ? accentOf(p, dark) : p.textDim}
                    style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
                    aria-hidden="true"
                  />
                </div>

                {/* What the score is made of, and where to go. */}
                {open && (
                  <div style={{ padding: '2px 16px 14px 51px', backgroundColor: p.panel }}>
                    <p style={{ margin: '0 0 11px', fontSize: 11, color: p.textMuted, lineHeight: 1.55 }}>
                      {q.module.basis}
                    </p>
                    <div style={{ maxWidth: 300, marginBottom: 14 }}>
                      <HistoryComb
                        candles={q.candles}
                        color={p.textDim}
                        accent={band.fill}
                        height={32}
                        label={q.module.name}
                      />
                      <p style={{ margin: '5px 0 0', fontSize: 10, color: p.textDim }}>
                        Last 44 days, out of 100
                      </p>
                    </div>
                    {/* Capped so the component meters line up with the row
                        meters above rather than spanning the whole panel. */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 11, maxWidth: 760 }}>
                      {q.breakdown.map(b => (
                        <div key={b.label} title={b.hint} style={{
                          flex: '1 1 150px', minWidth: 150, padding: '8px 10px', borderRadius: 10,
                          backgroundColor: p.ink, border: `1px solid ${p.border}`,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: p.textMuted }}>{b.label}</span>
                            <span style={{ fontSize: 10.5, fontWeight: 800, color: p.textStrong, fontVariantNumeric: 'tabular-nums' }}>
                              {Math.round(b.score)}
                            </span>
                          </div>
                          <Meter score={b.score} band={bandFor(b.score)} dark={dark} thin />
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); navigate(q.module.route); }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                        borderRadius: 999, border: `1px solid ${p.border}`, backgroundColor: p.ink,
                        color: p.textStrong, fontSize: 11, fontWeight: 800, cursor: 'pointer',
                      }}
                    >
                      Open {q.module.dest} <ArrowRight size={11} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── What to do next ── */}
      <div style={{ borderTop: `1px solid ${p.border}` }}>
        <div style={{ padding: '13px 16px 4px' }}>
          <TileHeader icon={Sparkles} label="What to do next" p={p} accent={accentOf(p, dark)} />
          <p style={{ margin: '4px 0 0 20px', fontSize: 11, color: p.textDim }}>
            Ranked by how much each one would actually move the overall score.
          </p>
        </div>
        <GrowthActions actions={book.actions.slice(0, 6)} p={p} onFocus={sym => setOpenRow(sym)} />
      </div>
    </div>
  );
}

/* ── Pieces ── */

/**
 * The brand accent — lime on dark, ink on light.
 *
 * It marks chrome only: the selected chip, a tile's own icon, the latest bar in
 * a history comb. It never carries a value. The health bands do that, and a
 * second colour meaning "important" beside colours meaning "how healthy" would
 * make the reader guess which one to believe. Lime sits ΔE 26 from the band
 * green under CVD, so the two cannot be mistaken for each other.
 */
function accentOf(p: ReturnType<typeof palette>, dark: boolean): string {
  return dark ? p.accent : p.textStrong;
}

function chip(on: boolean, p: ReturnType<typeof palette>): React.CSSProperties {
  return {
    padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
    border: `1px solid ${on ? 'transparent' : p.border}`,
    backgroundColor: on ? p.accent : p.panel,
    color: on ? p.onAccent : p.textMuted,
    fontSize: 10.5, fontWeight: 800, whiteSpace: 'nowrap',
  };
}

/** A tile's own caption: outline mark, then the name of what the tile shows. */
function TileHeader({ icon: Icon, label, p, accent }: {
  icon: typeof GaugeIcon; label: string; p: ReturnType<typeof palette>; accent: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <Icon size={13} strokeWidth={2.2} color={accent} aria-hidden="true" />
      <span style={{ fontSize: 11, fontWeight: 700, color: p.textMuted, letterSpacing: '0.01em' }}>{label}</span>
    </div>
  );
}

/**
 * The bar. Length carries the score; the fill carries the band; the hairline
 * keeps the amber's edge visible on white, where it is deliberately low
 * contrast. Rounded at the data end, square at the baseline.
 */
function Meter({ score, band, dark, thin }: { score: number; band: Band; dark: boolean; thin?: boolean }) {
  const pct = Math.max(0, Math.min(100, score));
  const h = thin ? 5 : 9;
  return (
    <div
      role="img"
      aria-label={`${pct.toFixed(0)} out of 100 — ${band.label}`}
      style={{
        height: h, borderRadius: 999, width: '100%',
        backgroundColor: dark ? band.trackDark : band.track, overflow: 'hidden',
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

function BandIcon({ band, dark }: { band: Band; dark: boolean }) {
  const c = dark ? band.inkDark : band.ink;
  if (band.key === 'strong') return <Check size={12} strokeWidth={3} color={c} aria-hidden="true" />;
  if (band.key === 'building') return <CircleDot size={12} strokeWidth={2.6} color={c} aria-hidden="true" />;
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

/** The table view. Its existence is what lets a low-contrast fill be legal. */
function ScoreTable({ rows, p, dark }: {
  rows: { q: Quote; score: number; delta: number; band: Band }[];
  p: ReturnType<typeof palette>;
  dark: boolean;
}) {
  const cell: React.CSSProperties = {
    padding: '9px 16px', fontSize: 12, color: p.textStrong,
    borderBottom: `1px solid ${p.border}`, textAlign: 'left',
  };
  const num: React.CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
        <caption style={{ captionSide: 'top', textAlign: 'left', padding: '10px 16px', fontSize: 11, color: p.textDim }}>
          Every department's progress score out of 100, with the change over the last {LOOKBACK_DAYS} days.
        </caption>
        <thead>
          <tr>
            {['Department', 'Area', 'Score', `${LOOKBACK_DAYS}-day change`, 'Status'].map((h, i) => (
              <th key={h} style={{
                ...cell, fontSize: 10.5, fontWeight: 800, color: p.textDim,
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
              <td style={{ ...cell, color: p.textMuted }}>{q.module.dept}</td>
              <td style={num}>{score.toFixed(0)}</td>
              <td style={{ ...num, color: colorFor(dirOf(delta), p) }}>
                {delta > 0 ? '+' : delta < 0 ? '−' : ''}{Math.abs(delta).toFixed(1)}
              </td>
              <td style={cell}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <BandIcon band={band} dark={dark} />
                  <span style={{ fontWeight: 700, color: dark ? band.inkDark : band.ink, fontSize: 11.5 }}>{band.label}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
