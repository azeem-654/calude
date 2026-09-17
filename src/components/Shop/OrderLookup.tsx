/**
 * "Where is my order?", answered by the shop instead of by an email.
 *
 * ── Why there is no account ──
 *
 * Buying here needs no login, so looking up must not need one either.
 * Inventing a password for a shop you used once is precisely the friction that
 * makes people give up and email the owner instead — which is the thing this
 * screen exists to prevent.
 *
 * The reference and the email are both on the receipt, so a buyer has both,
 * and somebody who has only one of them has nothing. The server never says
 * which half was wrong; see the note on the `order` action for why that
 * matters more than the small unhelpfulness it causes.
 *
 * ── Every number here was frozen at the till ──
 *
 * The totals come back from the order row and the lines stored on it, not from
 * the shop's settings today. A receipt that restates itself when the shop
 * changes its VAT position or retires a code is a receipt nobody can rely on
 * in an argument, which is the only time anybody reads one.
 */
import { useEffect, useState } from 'react';
import { Loader, PackageSearch, X } from 'lucide-react';
import { API_BASE } from '../../services/apiBase';
import type { Theme } from './themes';

export interface OrderLine { name?: string; qty?: number; priceCents?: number }

export interface TrackedOrder {
  reference: string;
  status: string;
  placedAt: string;
  items: OrderLine[];
  currency: string;
  goodsCents: number;
  discountCode: string;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  taxLabel: string;
  taxIncluded: boolean;
  totalCents: number;
  shipName: string;
  shipAddress1: string;
  shipAddress2: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  shipCountry: string;
}

/**
 * What a status means to the person who paid.
 *
 * The stored words are the shop's ("pending", "paid", "fulfilled"), and
 * "pending" to a buyer who has just paid reads as though something has gone
 * wrong. These say what has happened and what happens next, which is the
 * actual question.
 */
const SAYS: Record<string, { label: string; note: string }> = {
  pending: { label: 'Not paid yet', note: 'We have not had payment for this one. If you thought you had paid, your bank may still be settling it — check back shortly, or get in touch.' },
  paid: { label: 'Paid', note: 'Payment is in. The shop is getting it ready to send.' },
  fulfilled: { label: 'Sent', note: 'This has been sent. Delivery time is whatever the shop says above.' },
  refunded: { label: 'Refunded', note: 'This was refunded. The money goes back the way it came, which can take a few days to show.' },
  cancelled: { label: 'Cancelled', note: 'This order was cancelled.' },
};

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency || ''}`.trim();
  }
}

export default function OrderLookup({
  slug, t, accent, inkOnAccent, initialReference, onClose,
}: {
  slug: string;
  t: Theme;
  accent: string;
  inkOnAccent: string;
  /** From ?order= in the link on a receipt, so only the email is left to type. */
  initialReference: string;
  onClose: () => void;
}) {
  const [reference, setReference] = useState(initialReference);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [contact, setContact] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const look = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem('');
    setOrder(null);
    try {
      const r = await fetch(`${API_BASE}/api/shop.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'order', slug, reference, email }),
      });
      const res = await r.json() as Record<string, unknown>;
      if (res.success) {
        setOrder(res.order as TrackedOrder);
        setContact(String(res.contactEmail ?? ''));
      } else {
        setProblem(String(res.message ?? res.error ?? 'Could not look that up.'));
      }
    } catch {
      setProblem('Could not reach the shop. Check your connection and try again.');
    }
    setBusy(false);
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '11px 13px', boxSizing: 'border-box',
    border: `1px solid ${t.line}`, borderRadius: Math.max(t.radius, 8),
    background: t.pageBg, color: t.ink, fontSize: 14, outline: 'none', fontFamily: 'inherit',
  };
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 700, color: t.muted, marginBottom: 5,
  };
  const line: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12 };

  const said = SAYS[order?.status ?? ''] ?? { label: order?.status ?? '', note: '' };
  const address = order
    ? [order.shipName, order.shipAddress1, order.shipAddress2, order.shipCity,
       order.shipState, order.shipZip, order.shipCountry].filter(Boolean)
    : [];

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Track an order"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(12,14,17,0.5)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 480, marginTop: '6vh', marginBottom: 24,
        background: t.cardBg, color: t.ink, borderRadius: Math.max(t.radius, 14),
        border: `1px solid ${t.line}`, padding: 22, display: 'grid', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <PackageSearch size={17} color={accent} />
          <h2 style={{ fontFamily: t.headingFont, fontSize: 18, fontWeight: 700, margin: 0, flex: 1 }}>
            Track an order
          </h2>
          <button onClick={onClose} aria-label="Close" style={{
            border: 'none', background: 'transparent', color: t.muted, cursor: 'pointer', padding: 4, lineHeight: 0,
          }}><X size={17} /></button>
        </div>

        <form onSubmit={e => void look(e)} style={{ display: 'grid', gap: 12 }}>
          <label><span style={lbl}>Order reference</span>
            <input style={inp} value={reference} onChange={e => setReference(e.target.value)}
              aria-label="Order reference" placeholder="ord-…" autoComplete="off" required /></label>
          <label><span style={lbl}>The email you ordered with</span>
            <input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)}
              aria-label="Order email" placeholder="you@example.com" required /></label>
          <button type="submit" disabled={busy} style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            padding: '11px 16px', borderRadius: Math.max(t.radius, 8), border: 'none',
            background: accent, color: inkOnAccent, fontSize: 14, fontWeight: 700,
            cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, fontFamily: 'inherit',
          }}>
            {busy ? <><Loader size={14} className="spin" /> Looking…</> : 'Find my order'}
          </button>
          <p style={{ margin: 0, fontSize: 12, color: t.muted, lineHeight: 1.6 }}>
            Both are on the receipt that was emailed to you when you ordered.
          </p>
        </form>

        {!!problem && (
          <p role="alert" style={{
            margin: 0, fontSize: 13, lineHeight: 1.6, color: '#b42318',
            background: 'rgba(180,35,24,0.07)', border: '1px solid rgba(180,35,24,0.22)',
            borderRadius: Math.max(t.radius, 8), padding: '10px 12px',
          }}>{problem}</p>
        )}

        {order && (
          <div style={{ display: 'grid', gap: 14, borderTop: `1px solid ${t.line}`, paddingTop: 16 }}>
            <div>
              <span style={{ display: 'block', fontSize: 16, fontWeight: 700 }}>{said.label}</span>
              {!!said.note && (
                <span style={{ display: 'block', fontSize: 13, color: t.muted, marginTop: 4, lineHeight: 1.6 }}>{said.note}</span>
              )}
              <span style={{ display: 'block', fontSize: 12, color: t.muted, marginTop: 6 }}>
                {order.reference}
                {order.placedAt ? ` · ${new Date(order.placedAt).toLocaleDateString()}` : ''}
              </span>
            </div>

            <div style={{ display: 'grid', gap: 7, fontSize: 13.5 }}>
              {order.items.map((i, n) => (
                <div key={`${i.name}-${n}`} style={line}>
                  <span>{i.qty ?? 1} × {i.name}</span>
                  <span>{money((i.qty ?? 1) * (i.priceCents ?? 0), order.currency)}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gap: 5, fontSize: 13, color: t.muted }}>
              <div style={line}><span>Items</span><span>{money(order.goodsCents, order.currency)}</span></div>
              {!!order.discountCents && (
                <div style={{ ...line, color: '#0f7b3d' }}>
                  <span>{order.discountCode || 'Discount'}</span>
                  <span>−{money(order.discountCents, order.currency)}</span>
                </div>
              )}
              <div style={line}>
                <span>Delivery</span>
                <span>{order.shippingCents ? money(order.shippingCents, order.currency) : 'Free'}</span>
              </div>
              {/* Included tax is a note, not a line to add up — listed beside
                  the others it would make the column stop summing to the total
                  and look like a mistake on the shop's part. */}
              {!!order.taxCents && (
                <div style={line}>
                  <span>{order.taxIncluded ? `Includes ${order.taxLabel || 'tax'}` : (order.taxLabel || 'Tax')}</span>
                  <span>{order.taxIncluded ? '' : '+'}{money(order.taxCents, order.currency)}</span>
                </div>
              )}
            </div>

            <div style={{ ...line, fontSize: 15, fontWeight: 700, paddingTop: 10, borderTop: `1px solid ${t.line}` }}>
              <span>Paid</span><span>{money(order.totalCents, order.currency)}</span>
            </div>

            {address.length > 0 && (
              <div>
                <span style={lbl}>Going to</span>
                <span style={{ fontSize: 13.5, lineHeight: 1.6 }}>{address.join(', ')}</span>
              </div>
            )}

            {!!contact && (
              <p style={{ margin: 0, fontSize: 13, color: t.muted, lineHeight: 1.6 }}>
                Something not right? Email{' '}
                <a href={`mailto:${contact}?subject=${encodeURIComponent(`Order ${order.reference}`)}`}
                  style={{ color: accent, textDecoration: 'none' }}>{contact}</a> and quote the reference above.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
