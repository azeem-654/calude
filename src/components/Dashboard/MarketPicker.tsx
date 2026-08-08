import { useMemo, useState } from 'react';
import { Info, Search, Star, X } from 'lucide-react';
import { formatValue, INDEX_SYMBOL, type Book, type Category, type Quote } from '../../services/marketFeed';
import { ModuleMark } from './moduleIcons';
import { loadWatchlist, saveWatchlist, targetFor } from './watchlist';
import { colorFor, dirOf, glyphFor, signed, type Palette } from './marketTheme';

const CATEGORIES: (Category | 'All' | 'Watchlist')[] = [
  'All', 'Watchlist', 'Revenue', 'Demand', 'Customer', 'Content', 'Operations',
];

type SortKey = 'score' | 'name' | 'today' | 'gap';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'score', label: 'Sort by Score' },
  { key: 'today', label: 'Sort by Today' },
  { key: 'gap', label: 'Sort by Gap' },
  { key: 'name', label: 'Sort by Name' },
];

interface Props {
  book: Book;
  selected: string;
  p: Palette;
  onPick: (symbol: string) => void;
  onClose: () => void;
}

/**
 * The markets list: every department, searchable, grouped by the part of the
 * business it belongs to. Score is where it stands, Target the next milestone,
 * Today the session move, Gap the distance left — the four numbers a trader
 * scans, each meaning something real here.
 */
export default function MarketPicker({ book, selected, p, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<(Category | 'All' | 'Watchlist')>('All');
  const [sort, setSort] = useState<SortKey>('score');
  const [watch, setWatch] = useState<Set<string>>(loadWatchlist);

  function toggleWatch(symbol: string) {
    setWatch(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol); else next.add(symbol);
      saveWatchlist(next);
      return next;
    });
  }

  const inCategory = (q: Quote, c: typeof cat) =>
    c === 'All' ? true
      : c === 'Watchlist' ? watch.has(q.module.symbol)
        : q.module.symbol !== INDEX_SYMBOL && q.module.category === c;

  const counts = useMemo(() => {
    const m = {} as Record<string, number>;
    for (const c of CATEGORIES) m[c] = book.quotes.filter(q => inCategory(q, c)).length;
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.quotes, watch]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = book.quotes.filter(q => {
      if (!inCategory(q, cat)) return false;
      if (!needle) return true;
      const m = q.module;
      return `${m.symbol} ${m.name} ${m.dept}`.toLowerCase().includes(needle);
    });
    const by: Record<SortKey, (a: Quote, b: Quote) => number> = {
      score: (a, b) => b.truth - a.truth,
      today: (a, b) => b.changePct - a.changePct,
      gap: (a, b) => (targetFor(b.truth) - b.truth) - (targetFor(a.truth) - a.truth),
      name: (a, b) => a.module.name.localeCompare(b.module.name),
    };
    return [...list].sort(by[sort]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.quotes, cat, query, sort, watch]);

  const head: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: p.textMuted, letterSpacing: '0.04em',
    padding: '8px 6px', textAlign: 'right', whiteSpace: 'nowrap',
  };

  return (
    <div
      role="dialog"
      aria-label="Departments"
      style={{
        position: 'absolute', inset: '0 0 auto 0', zIndex: 5,
        backgroundColor: p.ink, border: `1px solid ${p.border}`, borderRadius: 14,
        boxShadow: '0 24px 60px -18px rgba(8,10,14,0.5)', overflow: 'hidden',
      }}
    >
      {/* Search */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
        borderBottom: `1px solid ${p.border}`, backgroundColor: p.panel,
      }}>
        <Search size={14} color={p.textDim} />
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name or ticker"
          aria-label="Search departments"
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            color: p.textStrong, fontSize: 12.5,
          }}
        />
        <button
          onClick={onClose}
          aria-label="Close departments list"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 24, height: 24, borderRadius: 6, border: `1px solid ${p.border}`,
            backgroundColor: 'transparent', color: p.textMuted, cursor: 'pointer',
          }}
        >
          <X size={13} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '148px minmax(0,1fr)' }}>
        {/* Category rail */}
        <div style={{ borderRight: `1px solid ${p.border}`, backgroundColor: p.panel, padding: '6px 0' }}>
          {CATEGORIES.map(c => {
            const on = c === cat;
            return (
              <button
                key={c}
                onClick={() => setCat(c)}
                aria-pressed={on}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  width: '100%', padding: '8px 12px', border: 'none', cursor: 'pointer',
                  backgroundColor: on ? p.panelHi : 'transparent',
                  color: on ? p.textStrong : p.textMuted,
                  fontSize: 12, fontWeight: on ? 800 : 600, textAlign: 'left',
                }}
              >
                {c}
                <span style={{ fontSize: 10.5, color: p.textDim, fontVariantNumeric: 'tabular-nums' }}>
                  {counts[c] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* Rows */}
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: p.ink }}>
                <th style={{ ...head, textAlign: 'left', paddingLeft: 12, position: 'sticky', top: 0, backgroundColor: p.ink }}>
                  <select
                    value={sort}
                    onChange={e => setSort(e.target.value as SortKey)}
                    aria-label="Sort departments"
                    style={{
                      border: 'none', background: 'transparent', color: p.textMuted,
                      fontSize: 10, fontWeight: 700, cursor: 'pointer', outline: 'none',
                    }}
                  >
                    {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </th>
                {['Score', 'Target', 'Today', 'Gap'].map(h => (
                  <th key={h} style={{ ...head, position: 'sticky', top: 0, backgroundColor: p.ink }}>{h}</th>
                ))}
                <th style={{ ...head, position: 'sticky', top: 0, backgroundColor: p.ink, width: 52 }} />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 18, fontSize: 11.5, color: p.textDim, textAlign: 'center' }}>
                  Nothing matches “{query}”.
                </td></tr>
              )}
              {rows.map(q => {
                const m = q.module;
                const target = targetFor(q.truth);
                const gap = target - q.truth;
                const dir = dirOf(Number(q.changePct.toFixed(2)));
                const on = m.symbol === selected;
                const cell: React.CSSProperties = {
                  padding: '9px 6px', fontSize: 11.5, textAlign: 'right', color: p.textStrong,
                  fontVariantNumeric: 'tabular-nums', borderBottom: `1px solid ${p.border}`,
                };
                return (
                  <tr
                    key={m.symbol}
                    onClick={() => { onPick(m.symbol); onClose(); }}
                    style={{ cursor: 'pointer', backgroundColor: on ? p.panelHi : 'transparent' }}
                  >
                    <td style={{ ...cell, textAlign: 'left', paddingLeft: 12 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                        <ModuleMark symbol={m.symbol} />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: p.textStrong }}>
                            {m.name}
                          </span>
                          <span style={{ display: 'block', fontSize: 10, color: p.textDim, letterSpacing: '0.04em' }}>
                            {m.symbol} · {m.dept}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td style={{ ...cell, fontWeight: 800 }}>{formatValue(q.truth)}</td>
                    <td style={{ ...cell, color: p.textMuted }}>{target}</td>
                    <td style={{ ...cell, color: colorFor(dir, p), fontWeight: 700 }}>
                      <span aria-hidden="true" style={{ fontSize: 8, marginRight: 2 }}>{glyphFor(dir)}</span>
                      {signed(q.changePct)}%
                    </td>
                    <td style={{ ...cell, color: p.textMuted }}>{gap.toFixed(2)}</td>
                    <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                      <button
                        onClick={e => { e.stopPropagation(); toggleWatch(m.symbol); }}
                        aria-label={watch.has(m.symbol) ? `Remove ${m.name} from watchlist` : `Add ${m.name} to watchlist`}
                        aria-pressed={watch.has(m.symbol)}
                        style={{
                          border: 'none', background: 'transparent', cursor: 'pointer', padding: 3,
                          color: watch.has(m.symbol) ? '#eda100' : p.textDim, lineHeight: 0,
                        }}
                      >
                        <Star size={13} fill={watch.has(m.symbol) ? '#eda100' : 'none'} />
                      </button>
                      <span title={m.basis} style={{ color: p.textDim, cursor: 'help', padding: 3, display: 'inline-block', lineHeight: 0 }}>
                        <Info size={13} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
