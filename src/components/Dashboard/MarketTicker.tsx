import { useMemo, useState } from 'react';
import { formatValue, INDEX_SYMBOL, type FeedInput, type Quote } from '../../services/marketFeed';
import { simEnabled, useMarketBook } from './useMarketBook';
import { useTheme } from './useTheme';
import { colorFor, dirOf, glyphFor, palette, signed, type Palette } from './marketTheme';

type Props = FeedInput;

function Cell({ quote, seq, keyPrefix, p }: { quote: Quote; seq: number; keyPrefix: string; p: Palette }) {
  const dir = dirOf(Number(quote.changePct.toFixed(2)));
  const isIndex = quote.module.symbol === INDEX_SYMBOL;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px', flexShrink: 0 }}>
      <span style={{
        fontSize: 10.5, fontWeight: isIndex ? 800 : 700, color: isIndex ? p.textStrong : p.textMuted,
        letterSpacing: '0.07em', whiteSpace: 'nowrap',
      }}>{quote.module.symbol}</span>
      <span
        key={`${keyPrefix}-${quote.module.symbol}-${seq}`}
        className={quote.tickDir === 'up' ? 'tick-up' : quote.tickDir === 'down' ? 'tick-down' : undefined}
        style={{
          fontSize: 13.5, fontWeight: 800, color: p.textStrong, letterSpacing: '-0.01em',
          whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', borderRadius: 4, padding: '1px 3px',
        }}
      >{formatValue(quote.last)}</span>
      <span style={{
        display: 'flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 700,
        color: colorFor(dir, p), whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
      }}>
        <span style={{ fontSize: 8 }} aria-hidden="true">{glyphFor(dir)}</span>
        {signed(quote.changePct)}%
      </span>
      <span style={{ width: 4, height: 4, borderRadius: 999, backgroundColor: p.border, marginLeft: 14 }} />
    </div>
  );
}

/**
 * The page-top tape. Same book as the board below it — one shared clock means
 * the two never show different scores for the same module.
 */
export default function MarketTicker(props: Props) {
  const theme = useTheme();
  const p = palette(theme);
  const [sim] = useState(simEnabled);

  const { contacts, pipelines, appointments, conversations, campaigns, reviews, funnels, websites } = props;
  const input = useMemo<FeedInput>(
    () => ({ contacts, pipelines, appointments, conversations, campaigns, reviews, funnels, websites }),
    [contacts, pipelines, appointments, conversations, campaigns, reviews, funnels, websites],
  );
  const { book, seq } = useMarketBook(input, '1D', sim);
  const fade = p.ink;

  return (
    <div
      role="marquee"
      aria-label="Live department progress tape"
      data-noinvert
      style={{
        backgroundColor: p.ink, borderRadius: 999, overflow: 'hidden',
        border: `1px solid ${p.border}`, padding: '11px 0', position: 'relative',
      }}
    >
      <div className="ticker-track">
        {book.quotes.map(q => <Cell key={`a-${q.module.symbol}`} quote={q} seq={seq} keyPrefix="a" p={p} />)}
        {book.quotes.map(q => <Cell key={`b-${q.module.symbol}`} quote={q} seq={seq} keyPrefix="b" p={p} />)}
      </div>
      <div style={{ position: 'absolute', inset: '0 auto 0 0', width: 46, background: `linear-gradient(90deg,${fade},transparent)`, borderRadius: '999px 0 0 999px', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: '0 0 0 auto', width: 46, background: `linear-gradient(270deg,${fade},transparent)`, borderRadius: '0 999px 999px 0', pointerEvents: 'none' }} />
    </div>
  );
}
