import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, LayoutGrid, Radio, Table2 } from 'lucide-react';
import {
  buildTape, formatBucket, formatClock, formatCountdown,
  formatValue, pipelineDepth, TIMEFRAMES, untilNextBucket,
  type Quote, type Timeframe,
} from '../../services/marketFeed';
import type { Appointment, Contact, Pipeline } from '../../types';
import CandleChart from './CandleChart';
import Sparkline from './Sparkline';
import { setSimEnabled, simEnabled, useMarketBook } from './useMarketBook';
import {
  ACCENT, BORDER, colorFor, dirOf, DOWN, FLAT, glyphFor, INK_DARK, PANEL, PANEL_HI,
  signed, TEXT_DIM, TEXT_MUTED, TEXT_STRONG, UP,
} from './marketTheme';

interface Props {
  contacts: Contact[];
  pipelines: Pipeline[];
  appointments: Appointment[];
}

/* ── Small shared chrome ── */

function Badge({ children, color = TEXT_MUTED, title }: { children: React.ReactNode; color?: string; title?: string }) {
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 5,
      border: `1px solid ${BORDER}`, backgroundColor: PANEL_HI, color,
      fontSize: 9.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase',
      whiteSpace: 'nowrap', cursor: title ? 'help' : 'default',
    }}>{children}</span>
  );
}

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      padding: '9px 12px', borderBottom: `1px solid ${BORDER}`,
    }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: TEXT_MUTED, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {children}
      </span>
      {right}
    </div>
  );
}

/** Change figure: colour, glyph and sign together, so none of the three is load-bearing alone. */
function Change({ pct, size = 11.5 }: { pct: number; size?: number }) {
  const dir = dirOf(Number(pct.toFixed(2)));
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3, color: colorFor(dir),
      fontSize: size, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
    }}>
      <span style={{ fontSize: size * 0.72 }} aria-hidden="true">{glyphFor(dir)}</span>
      {signed(pct)}%
    </span>
  );
}

/* ── Watchlist ── */

function WatchRow({ quote, selected, tickSeq, onSelect }: {
  quote: Quote; selected: boolean; tickSeq: number; onSelect: () => void;
}) {
  const { instrument: ins } = quote;
  const up = quote.changePct >= 0;
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      title={ins.basis}
      style={{
        display: 'grid', gridTemplateColumns: '1fr 62px 74px', alignItems: 'center', gap: 8,
        width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', cursor: 'pointer',
        borderLeft: `2px solid ${selected ? ACCENT : 'transparent'}`,
        backgroundColor: selected ? PANEL_HI : 'transparent',
        borderBottom: `1px solid ${BORDER}`,
      }}
    >
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 11.5, fontWeight: 800, color: TEXT_STRONG, letterSpacing: '0.02em' }}>
          {ins.symbol}
        </span>
        <span style={{
          display: 'block', fontSize: 10, color: TEXT_DIM, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{ins.name}</span>
      </span>

      <Sparkline candles={quote.candles} up={up} />

      <span style={{ textAlign: 'right' }}>
        <span
          key={`${ins.symbol}-${tickSeq}`}
          className={quote.tickDir === 'up' ? 'tick-up' : quote.tickDir === 'down' ? 'tick-down' : undefined}
          style={{
            display: 'block', fontSize: 12, fontWeight: 800, color: TEXT_STRONG,
            fontVariantNumeric: 'tabular-nums', borderRadius: 3, padding: '0 2px',
          }}
        >
          {formatValue(quote.last, ins.unit)}
        </span>
        <span style={{ display: 'block', marginTop: 1 }}><Change pct={quote.changePct} size={10} /></span>
      </span>
    </button>
  );
}

/* ── Depth ladder ── */

function DepthLadder({ pipelines }: { pipelines: Pipeline[] }) {
  const levels = useMemo(() => pipelineDepth(pipelines), [pipelines]);
  if (levels.length === 0) {
    return <p style={{ padding: 14, fontSize: 11, color: TEXT_DIM, margin: 0 }}>No pipeline stages yet.</p>;
  }
  const total = levels.reduce((s, l) => s + l.value, 0);
  return (
    <div>
      {levels.map((l, i) => (
        <div key={l.stage} style={{
          position: 'relative', display: 'grid', gridTemplateColumns: '1fr auto auto',
          alignItems: 'center', gap: 8, padding: '7px 12px',
          borderBottom: i < levels.length - 1 ? `1px solid ${BORDER}` : 'none',
        }}>
          {/* Depth bar reads right-to-left the way book size does. */}
          <div style={{
            position: 'absolute', inset: '2px 0 2px auto', right: 0,
            width: `${Math.max(l.share * 100, 1.5)}%`,
            backgroundColor: UP, opacity: 0.14, borderRadius: '3px 0 0 3px', pointerEvents: 'none',
          }} />
          <span style={{
            position: 'relative', fontSize: 11, fontWeight: 700, color: TEXT_STRONG,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{l.stage}</span>
          <span style={{ position: 'relative', fontSize: 10, color: TEXT_DIM, fontVariantNumeric: 'tabular-nums' }}>
            {l.deals}×
          </span>
          <span style={{
            position: 'relative', fontSize: 11, fontWeight: 800, color: TEXT_STRONG,
            fontVariantNumeric: 'tabular-nums', minWidth: 52, textAlign: 'right',
          }}>{formatValue(l.value, 'usd')}</span>
        </div>
      ))}
      <div style={{
        display: 'flex', justifyContent: 'space-between', padding: '8px 12px',
        borderTop: `1px solid ${BORDER}`, backgroundColor: PANEL_HI,
      }}>
        <span style={{ fontSize: 10, color: TEXT_MUTED, fontWeight: 700, letterSpacing: '0.06em' }}>TOTAL DEPTH</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>
          {formatValue(total, 'usd')}
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

function Tape({ rows, now }: { rows: ReturnType<typeof buildTape>; now: number }) {
  if (rows.length === 0) {
    return <p style={{ padding: 14, fontSize: 11, color: TEXT_DIM, margin: 0 }}>Nothing has printed yet.</p>;
  }
  return (
    <div style={{ maxHeight: 232, overflowY: 'auto' }}>
      {rows.map(r => {
        const buy = r.side === 'buy';
        return (
          <div key={r.id} style={{
            display: 'grid', gridTemplateColumns: '30px 1fr auto', alignItems: 'center', gap: 8,
            padding: '6px 12px', borderBottom: `1px solid ${BORDER}`,
          }}>
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.05em',
              color: buy ? UP : DOWN,
            }}>
              <span aria-hidden="true">{buy ? '▲' : '▼'}</span> {buy ? 'B' : 'S'}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{
                display: 'block', fontSize: 10.5, color: TEXT_STRONG, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{r.label}</span>
              <span style={{ display: 'block', fontSize: 9, color: TEXT_DIM, letterSpacing: '0.04em' }}>
                {r.symbol} · {relTime(r.ts, now)} ago
              </span>
            </span>
            <span style={{
              fontSize: 10.5, fontWeight: 800, color: buy ? UP : DOWN, fontVariantNumeric: 'tabular-nums',
            }}>
              {r.unit === 'usd' ? formatValue(Math.abs(r.size), 'usd') : `${Math.abs(r.size)}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── OHLC table view (the non-visual route to the same numbers) ── */

function OhlcTable({ quote, timeframe }: { quote: Quote; timeframe: Timeframe }) {
  const rows = quote.candles.slice(-14).reverse();
  const cell: React.CSSProperties = {
    padding: '6px 8px', fontSize: 10.5, color: TEXT_STRONG,
    fontVariantNumeric: 'tabular-nums', borderBottom: `1px solid ${BORDER}`, textAlign: 'right',
  };
  return (
    <div style={{ maxHeight: 300, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Bar', 'Open', 'High', 'Low', 'Close', 'Chg', 'Vol'].map((h, i) => (
              <th key={h} style={{
                ...cell, textAlign: i === 0 ? 'left' : 'right', color: TEXT_MUTED,
                fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
                position: 'sticky', top: 0, backgroundColor: PANEL,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(k => {
            const pct = k.o !== 0 ? ((k.c - k.o) / Math.abs(k.o)) * 100 : 0;
            return (
              <tr key={k.t}>
                <td style={{ ...cell, textAlign: 'left', color: TEXT_MUTED }}>{formatBucket(k.t, timeframe)}</td>
                <td style={cell}>{formatValue(k.o, quote.instrument.unit)}</td>
                <td style={cell}>{formatValue(k.h, quote.instrument.unit)}</td>
                <td style={cell}>{formatValue(k.l, quote.instrument.unit)}</td>
                <td style={cell}>{formatValue(k.c, quote.instrument.unit)}</td>
                <td style={cell}><Change pct={pct} size={10} /></td>
                <td style={{ ...cell, color: TEXT_MUTED }}>{k.v}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Board ── */

export default function MarketBoard({ contacts, pipelines, appointments }: Props) {
  const navigate = useNavigate();
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [symbol, setSymbol] = useState('PIPE/USD');
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [sim, setSim] = useState(simEnabled);

  const input = useMemo(() => ({ contacts, pipelines, appointments }), [contacts, pipelines, appointments]);
  const { book, seq: tickSeq, now } = useMarketBook(input, timeframe, sim);

  const tape = useMemo(() => buildTape(input), [input]);
  const selected = book.quotes.find(q => q.instrument.symbol === symbol) ?? book.quotes[0];
  const countdown = formatCountdown(untilNextBucket(timeframe, now));

  const advancers = book.quotes.filter(q => q.changePct > 0).length;
  const decliners = book.quotes.filter(q => q.changePct < 0).length;

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
    padding: '4px 10px', borderRadius: 5, border: `1px solid ${activeTab ? ACCENT : BORDER}`,
    backgroundColor: activeTab ? 'rgba(199,244,65,0.12)' : 'transparent',
    color: activeTab ? ACCENT : TEXT_MUTED, fontSize: 10.5, fontWeight: 800,
    cursor: 'pointer', letterSpacing: '0.04em',
  });

  return (
    <section
      aria-label="Business market board"
      style={{
        backgroundColor: INK_DARK, borderRadius: 20, overflow: 'hidden',
        border: `1px solid ${BORDER}`, boxShadow: '0 18px 44px -16px rgba(8,10,14,0.55)',
      }}
    >
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
        padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, backgroundColor: PANEL,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: TEXT_STRONG, letterSpacing: '-0.01em' }}>
            Business Exchange
          </span>
          <Badge color={UP}>
            <span style={{ width: 5, height: 5, borderRadius: 999, backgroundColor: UP, animation: 'pulse-dot 1.6s ease-in-out infinite' }} />
            Open
          </Badge>
          {book.real
            ? <Badge color={TEXT_MUTED} title={`Replayed from ${book.recordCount} dated records in your CRM`}>Live data</Badge>
            : <Badge color={ACCENT} title="Not enough dated records yet — this book is a worked example. It switches to your own data automatically once you have a handful of deals or contacts.">Demo book</Badge>}
          <button
            onClick={toggleSim}
            title={sim
              ? 'Tick simulation is ON: prices wobble around your real values so the board reads like a live market. Candles still close on the true figure. Click to show only real movement.'
              : 'Tick simulation is OFF: prices move only when your records move.'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 5,
              border: `1px solid ${sim ? ACCENT : BORDER}`, backgroundColor: sim ? 'rgba(199,244,65,0.12)' : PANEL_HI,
              color: sim ? ACCENT : TEXT_DIM, fontSize: 9.5, fontWeight: 800,
              letterSpacing: '0.09em', textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            <Radio size={10} /> Sim {sim ? 'on' : 'off'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 10.5, color: TEXT_MUTED, fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ color: UP, fontWeight: 800 }}>▲ {advancers}</span>
            <span style={{ color: TEXT_DIM }}> / </span>
            <span style={{ color: DOWN, fontWeight: 800 }}>▼ {decliners}</span>
          </span>
          <span style={{ fontSize: 11.5, color: TEXT_STRONG, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {formatClock(now)}
          </span>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(230px, 1fr) minmax(0, 2.5fr) minmax(230px, 1fr)' }}>

        {/* Watchlist */}
        <div style={{ borderRight: `1px solid ${BORDER}`, backgroundColor: PANEL }}>
          <SectionTitle right={<span style={{ fontSize: 9.5, color: TEXT_DIM }}>{book.quotes.length} symbols</span>}>
            Watchlist
          </SectionTitle>
          {book.quotes.map(q => (
            <WatchRow
              key={q.instrument.symbol}
              quote={q}
              selected={q.instrument.symbol === selected.instrument.symbol}
              tickSeq={tickSeq}
              onSelect={() => setSymbol(q.instrument.symbol)}
            />
          ))}
        </div>

        {/* Chart */}
        <div style={{ minWidth: 0, backgroundColor: INK_DARK }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
            padding: '10px 14px', borderBottom: `1px solid ${BORDER}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: TEXT_STRONG, letterSpacing: '0.02em' }}>
                {selected.instrument.symbol}
              </span>
              <span
                key={`sel-${tickSeq}`}
                className={selected.tickDir === 'up' ? 'tick-up' : selected.tickDir === 'down' ? 'tick-down' : undefined}
                style={{
                  fontSize: 20, fontWeight: 800, color: selUp ? UP : DOWN,
                  letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', borderRadius: 4, padding: '0 3px',
                }}
              >
                {formatValue(selected.last, selected.instrument.unit)}
              </span>
              <Change pct={selected.changePct} size={12.5} />
              <span style={{ fontSize: 10.5, color: TEXT_DIM }}>
                {signed(selected.change, selected.instrument.unit === 'count' ? 0 : 2)} vs prev {timeframe} close
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {TIMEFRAMES.map(t => (
                <button key={t.key} onClick={() => setTimeframe(t.key)} style={tabBtn(t.key === timeframe)}>
                  {t.label}
                </button>
              ))}
              <span style={{ width: 1, height: 16, backgroundColor: BORDER, margin: '0 2px' }} />
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
                unit={selected.instrument.unit}
                timeframe={timeframe}
                symbol={selected.instrument.symbol}
                name={selected.instrument.name}
                last={selected.last}
                height={300}
              />
            : <OhlcTable quote={selected} timeframe={timeframe} />}

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
            padding: '9px 14px', borderTop: `1px solid ${BORDER}`, backgroundColor: PANEL,
          }}>
            <span style={{ fontSize: 10.5, color: TEXT_DIM }}>
              {selected.instrument.basis} · <span style={{ color: TEXT_MUTED }}>
                {book.real ? `${selected.volume} records in window` : 'worked example — no records yet'}
              </span>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 10.5, color: TEXT_MUTED, fontVariantNumeric: 'tabular-nums' }}>
                Next bar in <span style={{ color: TEXT_STRONG, fontWeight: 800 }}>{countdown}</span>
              </span>
              <button
                onClick={() => navigate(selected.instrument.route)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 999,
                  border: 'none', cursor: 'pointer', backgroundColor: ACCENT, color: INK_DARK,
                  fontSize: 10.5, fontWeight: 800, letterSpacing: '0.03em',
                }}
              >
                Open {selected.instrument.dest} <ArrowUpRight size={11} />
              </button>
            </div>
          </div>
        </div>

        {/* Depth + tape */}
        <div style={{ borderLeft: `1px solid ${BORDER}`, backgroundColor: PANEL, minWidth: 0 }}>
          <SectionTitle right={<span style={{ fontSize: 9.5, color: TEXT_DIM }}>open value</span>}>
            Pipeline Depth
          </SectionTitle>
          <DepthLadder pipelines={pipelines} />
          <SectionTitle right={<span style={{ fontSize: 9.5, color: FLAT }}>{tape.length} prints</span>}>
            Time &amp; Sales
          </SectionTitle>
          <Tape rows={tape} now={now} />
        </div>
      </div>
    </section>
  );
}
