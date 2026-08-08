import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, ChevronDown, LayoutGrid, Radio, Table2 } from 'lucide-react';
import {
  buildTape, formatBucket, formatClock, formatCountdown, formatValue,
  indexComposition, INDEX_SYMBOL, TIMEFRAMES, untilNextBucket,
  type FeedInput, type Quote, type Timeframe,
} from '../../services/marketFeed';
import CandleChart from './CandleChart';
import GrowthActions from './GrowthActions';
import MarketPicker from './MarketPicker';
import { ModuleMark } from './moduleIcons';
import Sparkline from './Sparkline';
import { setSimEnabled, simEnabled, useMarketBook } from './useMarketBook';
import { useTheme } from './useTheme';
import { colorFor, dirOf, glyphFor, palette, signed, type Palette } from './marketTheme';

type Props = FeedInput;

/* ── Small shared chrome ── */

function Badge({ children, color, p, title }: {
  children: React.ReactNode; color?: string; p: Palette; title?: string;
}) {
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 5,
      border: `1px solid ${p.border}`, backgroundColor: p.panelHi, color: color ?? p.textMuted,
      fontSize: 9.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase',
      whiteSpace: 'nowrap', cursor: title ? 'help' : 'default',
    }}>{children}</span>
  );
}

function SectionTitle({ children, right, p }: { children: React.ReactNode; right?: React.ReactNode; p: Palette }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      padding: '9px 12px', borderBottom: `1px solid ${p.border}`,
    }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: p.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {children}
      </span>
      {right}
    </div>
  );
}

/** Change figure: colour, glyph and sign together, so none is load-bearing alone. */
function Change({ pct, p, size = 11.5 }: { pct: number; p: Palette; size?: number }) {
  const dir = dirOf(Number(pct.toFixed(2)));
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3, color: colorFor(dir, p),
      fontSize: size, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
    }}>
      <span style={{ fontSize: size * 0.72 }} aria-hidden="true">{glyphFor(dir)}</span>
      {signed(pct)}%
    </span>
  );
}

/* ── Watchlist ── */

function WatchRow({ quote, selected, tickSeq, p, onSelect }: {
  quote: Quote; selected: boolean; tickSeq: number; p: Palette; onSelect: () => void;
}) {
  const m = quote.module;
  const isIndex = m.symbol === INDEX_SYMBOL;
  const up = quote.changePct >= 0;
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      title={m.basis}
      style={{
        display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 52px 62px', alignItems: 'center', gap: 8,
        width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', cursor: 'pointer',
        borderLeft: `2px solid ${selected ? p.accent : 'transparent'}`,
        backgroundColor: selected ? p.panelHi : 'transparent',
        borderBottom: `1px solid ${p.border}`,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <ModuleMark symbol={m.symbol} size={22} />
        <span style={{ minWidth: 0 }}>
          <span style={{
            display: 'block', fontSize: isIndex ? 12 : 11.5, fontWeight: 800,
            color: p.textStrong, letterSpacing: '0.02em',
          }}>
            {m.symbol}
          </span>
          <span style={{
            display: 'block', fontSize: 10, color: p.textDim, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{isIndex ? m.dept : m.name}</span>
        </span>
      </span>

      <Sparkline candles={quote.candles} up={up} p={p} width={52} />

      <span style={{ textAlign: 'right' }}>
        <span
          key={`${m.symbol}-${tickSeq}`}
          className={quote.tickDir === 'up' ? 'tick-up' : quote.tickDir === 'down' ? 'tick-down' : undefined}
          style={{
            display: 'block', fontSize: 12, fontWeight: 800, color: p.textStrong,
            fontVariantNumeric: 'tabular-nums', borderRadius: 3, padding: '0 2px',
          }}
        >
          {formatValue(quote.last)}
        </span>
        <span style={{ display: 'block', marginTop: 1 }}><Change pct={quote.changePct} p={p} size={10} /></span>
      </span>
    </button>
  );
}

/* ── Index composition ladder ── */

function Composition({ rows, p, onPick }: {
  rows: ReturnType<typeof indexComposition>; p: Palette; onPick: (symbol: string) => void;
}) {
  if (rows.length === 0) {
    return <p style={{ padding: 14, fontSize: 11, color: p.textDim, margin: 0 }}>No modules to score yet.</p>;
  }
  const avg = rows.reduce((s, r) => s + r.score, 0) / rows.length;
  return (
    <div>
      {rows.map((r, i) => {
        const dir = dirOf(Number(r.delta.toFixed(1)));
        return (
          <button
            key={r.symbol}
            onClick={() => onPick(r.symbol)}
            title={`${r.name} — ${r.dept}. ${signed(r.delta, 1)} against the index average.`}
            style={{
              position: 'relative', display: 'grid', gridTemplateColumns: '1fr auto auto',
              alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', cursor: 'pointer',
              padding: '7px 12px', border: 'none', backgroundColor: 'transparent',
              borderBottom: i < rows.length - 1 ? `1px solid ${p.border}` : 'none',
            }}
          >
            {/* Depth bar reads right-to-left the way book size does. */}
            <div style={{
              position: 'absolute', inset: '2px 0 2px auto', right: 0,
              width: `${Math.max(r.share * 100, 1.5)}%`,
              backgroundColor: colorFor(dir, p), opacity: 0.14,
              borderRadius: '3px 0 0 3px', pointerEvents: 'none',
            }} />
            <span style={{
              position: 'relative', fontSize: 11, fontWeight: 700, color: p.textStrong,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{r.symbol}</span>
            <span style={{
              position: 'relative', fontSize: 9.5, color: colorFor(dir, p), fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
            }}>
              <span aria-hidden="true">{glyphFor(dir)}</span> {signed(r.delta, 1)}
            </span>
            <span style={{
              position: 'relative', fontSize: 11, fontWeight: 800, color: p.textStrong,
              fontVariantNumeric: 'tabular-nums', minWidth: 38, textAlign: 'right',
            }}>{formatValue(r.score)}</span>
          </button>
        );
      })}
      <div style={{
        display: 'flex', justifyContent: 'space-between', padding: '8px 12px',
        borderTop: `1px solid ${p.border}`, backgroundColor: p.panelHi,
      }}>
        <span style={{ fontSize: 10, color: p.textMuted, fontWeight: 700, letterSpacing: '0.06em' }}>INDEX AVERAGE</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: p.textStrong, fontVariantNumeric: 'tabular-nums' }}>
          {formatValue(avg)} / 100
        </span>
      </div>
    </div>
  );
}

/* ── Time & sales ── */

function relTime(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

function Tape({ rows, now, p }: { rows: ReturnType<typeof buildTape>; now: number; p: Palette }) {
  if (rows.length === 0) {
    return <p style={{ padding: 14, fontSize: 11, color: p.textDim, margin: 0 }}>Nothing has printed yet.</p>;
  }
  return (
    <div style={{ maxHeight: 232, overflowY: 'auto' }}>
      {rows.map(r => {
        const buy = r.side === 'buy';
        return (
          <div key={r.id} style={{
            display: 'grid', gridTemplateColumns: '30px 1fr', alignItems: 'center', gap: 8,
            padding: '6px 12px', borderBottom: `1px solid ${p.border}`,
          }}>
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.05em', color: buy ? p.up : p.down }}>
              <span aria-hidden="true">{buy ? '▲' : '▼'}</span> {buy ? 'B' : 'S'}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{
                display: 'block', fontSize: 10.5, color: p.textStrong, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{r.label}</span>
              <span style={{ display: 'block', fontSize: 9, color: p.textDim, letterSpacing: '0.04em' }}>
                {r.symbol} · {relTime(r.ts, now)} ago
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── OHLC table view (the non-visual route to the same numbers) ── */

function OhlcTable({ quote, timeframe, p }: { quote: Quote; timeframe: Timeframe; p: Palette }) {
  const rows = quote.candles.slice(-14).reverse();
  const cell: React.CSSProperties = {
    padding: '6px 8px', fontSize: 10.5, color: p.textStrong,
    fontVariantNumeric: 'tabular-nums', borderBottom: `1px solid ${p.border}`, textAlign: 'right',
  };
  return (
    <div style={{ maxHeight: 300, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Bar', 'Open', 'High', 'Low', 'Close', 'Chg', 'Events'].map((h, i) => (
              <th key={h} style={{
                ...cell, textAlign: i === 0 ? 'left' : 'right', color: p.textMuted,
                fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
                position: 'sticky', top: 0, backgroundColor: p.panel,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(k => {
            const pct = k.o !== 0 ? ((k.c - k.o) / Math.abs(k.o)) * 100 : 0;
            return (
              <tr key={k.t}>
                <td style={{ ...cell, textAlign: 'left', color: p.textMuted }}>{formatBucket(k.t, timeframe)}</td>
                <td style={cell}>{formatValue(k.o)}</td>
                <td style={cell}>{formatValue(k.h)}</td>
                <td style={cell}>{formatValue(k.l)}</td>
                <td style={cell}>{formatValue(k.c)}</td>
                <td style={cell}><Change pct={pct} p={p} size={10} /></td>
                <td style={{ ...cell, color: p.textMuted }}>{k.v}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Component breakdown strip ── */

function BreakdownStrip({ quote, p }: { quote: Quote; p: Palette }) {
  if (quote.breakdown.length === 0) return null;
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 14px',
      borderTop: `1px solid ${p.border}`,
    }}>
      {quote.breakdown.map(b => (
        <div key={b.label} title={b.hint} style={{
          flex: '1 1 96px', minWidth: 96, padding: '7px 9px', borderRadius: 7,
          backgroundColor: p.panel, border: `1px solid ${p.border}`, cursor: 'help',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6,
          }}>
            <span style={{
              fontSize: 9.5, fontWeight: 800, color: p.textMuted, letterSpacing: '0.06em',
              textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{b.label}</span>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: p.textStrong, fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(b.score)}
            </span>
          </div>
          {/* A meter, not a chart: the number above it is the value that counts. */}
          <div style={{ marginTop: 5, height: 3, borderRadius: 999, backgroundColor: p.panelHi, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.max(b.score, 1)}%`, height: '100%', borderRadius: 999,
              backgroundColor: b.score >= 50 ? p.up : b.score >= 25 ? p.flat : p.down,
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Board ── */

export default function MarketBoard(props: Props) {
  const navigate = useNavigate();
  const theme = useTheme();
  const p = palette(theme);

  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [symbol, setSymbol] = useState(INDEX_SYMBOL);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [side, setSide] = useState<'actions' | 'composition' | 'tape'>('actions');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sim, setSim] = useState(simEnabled);

  const { contacts, pipelines, appointments, conversations, campaigns, reviews, funnels, websites, videoProjects, socialPosts } = props;
  const input = useMemo<FeedInput>(
    () => ({ contacts, pipelines, appointments, conversations, campaigns, reviews, funnels, websites, videoProjects, socialPosts }),
    [contacts, pipelines, appointments, conversations, campaigns, reviews, funnels, websites, videoProjects, socialPosts],
  );
  const { book, seq: tickSeq, now } = useMarketBook(input, timeframe, sim);

  const tape = useMemo(() => buildTape(input), [input]);
  const composition = useMemo(() => indexComposition(book), [book]);
  const selected = book.quotes.find(q => q.module.symbol === symbol) ?? book.quotes[0];
  const countdown = formatCountdown(untilNextBucket(timeframe, now));

  const modules = book.quotes.filter(q => q.module.symbol !== INDEX_SYMBOL);
  const advancers = modules.filter(q => q.changePct > 0).length;
  const decliners = modules.filter(q => q.changePct < 0).length;

  function toggleSim() {
    setSim(v => {
      const next = !v;
      setSimEnabled(next);
      return next;
    });
  }

  if (!selected) return null;
  const selUp = selected.changePct >= 0;

  const tabBtn = (activeTab: boolean): React.CSSProperties => ({
    padding: '4px 10px', borderRadius: 5, border: `1px solid ${activeTab ? p.accent : p.border}`,
    backgroundColor: activeTab ? p.accentSoft : 'transparent',
    color: activeTab ? p.textStrong : p.textMuted, fontSize: 10.5, fontWeight: 800,
    cursor: 'pointer', letterSpacing: '0.04em',
  });

  return (
    <section
      aria-label="Business market board"
      /* The CRM goes dark by inverting all of #root with a CSS filter. This
         panel picks its own theme-matched colours instead, so it opts out. */
      data-noinvert
      style={{
        backgroundColor: p.ink, borderRadius: 20, overflow: 'hidden',
        border: `1px solid ${p.border}`,
        boxShadow: theme === 'dark'
          ? '0 18px 44px -16px rgba(8,10,14,0.55)'
          : '0 1px 2px rgba(23,25,28,0.06)',
      }}
    >
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
        padding: '12px 16px', borderBottom: `1px solid ${p.border}`, backgroundColor: p.panel,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: p.textStrong, letterSpacing: '-0.01em' }}>
            Department Exchange
          </span>
          <Badge p={p} color={p.up}>
            <span style={{ width: 5, height: 5, borderRadius: 999, backgroundColor: p.up, animation: 'pulse-dot 1.6s ease-in-out infinite' }} />
            Open
          </Badge>
          {book.real
            ? <Badge p={p} title={`Replayed from ${book.recordCount} dated records across your modules`}>Live data</Badge>
            : <Badge p={p} color={p.textStrong} title="Not enough dated records yet — this book is a worked example. It switches to your own data automatically once you have a handful of contacts, deals or campaigns.">Demo book</Badge>}
          <button
            onClick={toggleSim}
            title={sim
              ? 'Tick simulation is ON: scores wobble around your real values so the board reads like a live market. Candles still close on the true figure. Click to show only real movement.'
              : 'Tick simulation is OFF: scores move only when your records move.'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 5,
              border: `1px solid ${sim ? p.accent : p.border}`,
              backgroundColor: sim ? p.accentSoft : p.panelHi,
              color: sim ? p.textStrong : p.textDim, fontSize: 9.5, fontWeight: 800,
              letterSpacing: '0.09em', textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            <Radio size={10} /> Sim {sim ? 'on' : 'off'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 10.5, color: p.textMuted, fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ color: p.up, fontWeight: 800 }}>▲ {advancers}</span>
            <span style={{ color: p.textDim }}> / </span>
            <span style={{ color: p.down, fontWeight: 800 }}>▼ {decliners}</span>
          </span>
          <span style={{ fontSize: 11.5, color: p.textStrong, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {formatClock(now)}
          </span>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(0, 2.5fr) minmax(220px, 1fr)' }}>

        {/* Watchlist */}
        <div aria-label="Department watchlist" style={{ borderRight: `1px solid ${p.border}`, backgroundColor: p.panel }}>
          <SectionTitle p={p} right={<span style={{ fontSize: 9.5, color: p.textDim }}>{modules.length} modules</span>}>
            Departments
          </SectionTitle>
          {book.quotes.map(q => (
            <WatchRow
              key={q.module.symbol}
              quote={q}
              selected={q.module.symbol === selected.module.symbol}
              tickSeq={tickSeq}
              p={p}
              onSelect={() => setSymbol(q.module.symbol)}
            />
          ))}
        </div>

        {/* Chart */}
        <div style={{ minWidth: 0, backgroundColor: p.ink, position: 'relative' }}>
          {pickerOpen && (
            <MarketPicker
              book={book}
              selected={selected.module.symbol}
              p={p}
              onPick={setSymbol}
              onClose={() => setPickerOpen(false)}
            />
          )}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
            padding: '10px 14px', borderBottom: `1px solid ${p.border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={() => setPickerOpen(v => !v)}
                aria-expanded={pickerOpen}
                title="Browse departments"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 9px 4px 4px',
                  borderRadius: 999, border: `1px solid ${p.border}`, backgroundColor: p.panel,
                  color: p.textStrong, cursor: 'pointer',
                }}
              >
                <ModuleMark symbol={selected.module.symbol} size={22} />
                <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.02em' }}>
                  {selected.module.symbol}
                </span>
                <ChevronDown size={12} />
              </button>
              <span
                key={`sel-${tickSeq}`}
                className={selected.tickDir === 'up' ? 'tick-up' : selected.tickDir === 'down' ? 'tick-down' : undefined}
                style={{
                  fontSize: 20, fontWeight: 800, color: selUp ? p.up : p.down,
                  letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', borderRadius: 4, padding: '0 3px',
                }}
              >
                {formatValue(selected.last)}
              </span>
              <span style={{ fontSize: 11, color: p.textDim, fontWeight: 600 }}>/ 100</span>
              <Change pct={selected.changePct} p={p} size={12.5} />
              <span style={{ fontSize: 10.5, color: p.textDim }}>
                {signed(selected.change)} vs prev {timeframe} close
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {TIMEFRAMES.map(t => (
                <button key={t.key} onClick={() => setTimeframe(t.key)} style={tabBtn(t.key === timeframe)}>
                  {t.label}
                </button>
              ))}
              <span style={{ width: 1, height: 16, backgroundColor: p.border, margin: '0 2px' }} />
              <button
                onClick={() => setView(v => (v === 'chart' ? 'table' : 'chart'))}
                title={view === 'chart' ? 'Show the same bars as a table' : 'Back to the chart'}
                style={{ ...tabBtn(false), display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                {view === 'chart' ? <Table2 size={11} /> : <LayoutGrid size={11} />}
                {view === 'chart' ? 'Table' : 'Chart'}
              </button>
            </div>
          </div>

          {view === 'chart'
            ? <CandleChart
                candles={selected.candles}
                timeframe={timeframe}
                symbol={selected.module.symbol}
                name={selected.module.name}
                last={selected.last}
                p={p}
                height={286}
              />
            : <OhlcTable quote={selected} timeframe={timeframe} p={p} />}

          <BreakdownStrip quote={selected} p={p} />

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
            padding: '9px 14px', borderTop: `1px solid ${p.border}`, backgroundColor: p.panel,
          }}>
            <span style={{ fontSize: 10.5, color: p.textDim }}>
              {selected.module.basis} · <span style={{ color: p.textMuted }}>
                {book.real ? `${selected.volume} records in window` : 'worked example — no records yet'}
              </span>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 10.5, color: p.textMuted, fontVariantNumeric: 'tabular-nums' }}>
                Next bar in <span style={{ color: p.textStrong, fontWeight: 800 }}>{countdown}</span>
              </span>
              <button
                onClick={() => navigate(selected.module.route)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 999,
                  border: 'none', cursor: 'pointer', backgroundColor: p.accent, color: p.onAccent,
                  fontSize: 10.5, fontWeight: 800, letterSpacing: '0.03em',
                }}
              >
                Open {selected.module.dest} <ArrowUpRight size={11} />
              </button>
            </div>
          </div>
        </div>

        {/* Actions / composition / tape */}
        <div style={{ borderLeft: `1px solid ${p.border}`, backgroundColor: p.panel, minWidth: 0 }}>
          <div style={{ display: 'flex', borderBottom: `1px solid ${p.border}` }}>
            {([
              ['actions', 'Grow', `${book.actions.length}`],
              ['composition', 'Index', ''],
              ['tape', 'Tape', `${tape.length}`],
            ] as const).map(([key, label, count]) => (
              <button
                key={key}
                onClick={() => setSide(key)}
                aria-pressed={side === key}
                style={{
                  flex: 1, padding: '9px 6px', border: 'none', cursor: 'pointer',
                  backgroundColor: side === key ? p.ink : 'transparent',
                  color: side === key ? p.textStrong : p.textMuted,
                  borderBottom: `2px solid ${side === key ? p.accent : 'transparent'}`,
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase',
                }}
              >
                {label}{count ? ` ${count}` : ''}
              </button>
            ))}
          </div>

          {side === 'actions' && <GrowthActions actions={book.actions} p={p} onFocus={setSymbol} />}
          {side === 'composition' && <Composition rows={composition} p={p} onPick={setSymbol} />}
          {side === 'tape' && <Tape rows={tape} now={now} p={p} />}
        </div>
      </div>
    </section>
  );
}
