import { useMemo, useState } from 'react';
import { formatValue, type Quote } from '../../services/marketFeed';
import type { Appointment, Contact, Pipeline } from '../../types';
import { simEnabled, useMarketBook } from './useMarketBook';
import { colorFor, dirOf, glyphFor, signed } from './marketTheme';

const INK = '#17191c';
const MUTED = '#8a8f98';

interface Props {
  contacts: Contact[];
  pipelines: Pipeline[];
  appointments: Appointment[];
}

function Cell({ quote, seq, keyPrefix }: { quote: Quote; seq: number; keyPrefix: string }) {
  const dir = dirOf(Number(quote.changePct.toFixed(2)));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 22px', flexShrink: 0 }}>
      <span style={{
        fontSize: 10.5, fontWeight: 700, color: MUTED, letterSpacing: '0.07em', whiteSpace: 'nowrap',
      }}>{quote.instrument.symbol}</span>
      <span
        key={`${keyPrefix}-${quote.instrument.symbol}-${seq}`}
        className={quote.tickDir === 'up' ? 'tick-up' : quote.tickDir === 'down' ? 'tick-down' : undefined}
        style={{
          fontSize: 13.5, fontWeight: 800, color: INK, letterSpacing: '-0.01em',
          whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', borderRadius: 4, padding: '1px 3px',
        }}
      >{formatValue(quote.last, quote.instrument.unit)}</span>
      <span style={{
        display: 'flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 700,
        color: colorFor(dir), whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
      }}>
        <span style={{ fontSize: 8 }} aria-hidden="true">{glyphFor(dir)}</span>
        {signed(quote.changePct)}%
      </span>
      <span style={{ width: 4, height: 4, borderRadius: 999, backgroundColor: '#d5d8dd', marginLeft: 14 }} />
    </div>
  );
}

/**
 * The page-top tape. Same book as the trading board below it — one shared clock
 * means the two never show different prices for the same symbol.
 */
export default function MarketTicker({ contacts, pipelines, appointments }: Props) {
  const [sim] = useState(simEnabled);
  const input = useMemo(() => ({ contacts, pipelines, appointments }), [contacts, pipelines, appointments]);
  const { book, seq } = useMarketBook(input, '1D', sim);

  return (
    <div
      role="marquee"
      aria-label="Live business metrics tape"
      style={{
        backgroundColor: '#fff', borderRadius: 999, overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(23,25,28,0.05)', padding: '11px 0', position: 'relative',
      }}
    >
      <div className="ticker-track">
        {book.quotes.map(q => <Cell key={`a-${q.instrument.symbol}`} quote={q} seq={seq} keyPrefix="a" />)}
        {book.quotes.map(q => <Cell key={`b-${q.instrument.symbol}`} quote={q} seq={seq} keyPrefix="b" />)}
      </div>
      <div style={{ position: 'absolute', inset: '0 auto 0 0', width: 46, background: 'linear-gradient(90deg,#fff,transparent)', borderRadius: '999px 0 0 999px', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: '0 0 0 auto', width: 46, background: 'linear-gradient(270deg,#fff,transparent)', borderRadius: '0 999px 999px 0', pointerEvents: 'none' }} />
    </div>
  );
}
