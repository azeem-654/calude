/**
 * The shop a stranger sees.
 *
 * This component runs with no session, no AppProvider and no workspace. It
 * knows one thing — the slug in the address — and everything else comes from
 * /api/shop.php. Two consequences worth stating, because both were mistakes
 * waiting to be made:
 *
 *  - **It never sends a price.** The buy call carries a product id and a
 *    quantity. What that costs is the server's business; a page that posts an
 *    amount is a page whose amount can be edited.
 *  - **It says when it cannot sell.** If the owner has not connected a
 *    processor, the buy buttons are gone and the reason is on the page. Taking
 *    somebody's email address and then failing at the checkout is the version
 *    of this that loses a customer quietly.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ShoppingBag, Loader, AlertCircle, ArrowRight } from 'lucide-react';
import { API_BASE } from '../../services/apiBase';

interface Product {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  sku: string;
}

interface Shop {
  slug: string;
  name: string;
  headline: string;
  about: string;
  accent: string;
}

interface Loaded {
  shop: Shop;
  products: Product[];
  currency: string;
  canBuy: boolean;
}

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' })
      .format(cents / 100);
  } catch {
    /* An unknown currency code should not blank the price out. */
    return `${(cents / 100).toFixed(2)} ${currency || ''}`.trim();
  }
}

async function call(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const r = await fetch(`${API_BASE}/api/shop.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await r.json() as Record<string, unknown>;
  } catch {
    return { success: false, message: 'Could not reach the shop. Check your connection and try again.' };
  }
}

export default function ShopPage() {
  const { slug } = useParams<{ slug?: string }>();
  const [state, setState] = useState<Loaded | 'loading' | 'missing'>('loading');
  /* Which product's buy form is open, and what is in it. One at a time: a grid
     of open email fields is a grid of half-finished orders. */
  const [buying, setBuying] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setState('loading');
    call({ action: 'get', slug: slug ?? '' }).then(res => {
      if (!live) return;
      if (!res.success) { setState('missing'); return; }
      setState({
        shop: res.shop as Shop,
        products: (res.products as Product[]) ?? [],
        currency: String(res.currency ?? 'USD'),
        canBuy: !!res.canBuy,
      });
    });
    return () => { live = false; };
  }, [slug]);

  if (state === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#fff' }}>
        <Loader size={22} style={{ animation: 'spin 1s linear infinite', color: '#8a8f98' }} />
      </div>
    );
  }

  if (state === 'missing') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#fff', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <ShoppingBag size={32} style={{ color: '#c4c8cf' }} />
          <h1 style={{ fontSize: 20, margin: '14px 0 6px', color: '#17191c' }}>Nothing here</h1>
          <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, margin: 0 }}>
            There is no shop at this address. The link may be wrong, or the shop may not be open yet.
          </p>
        </div>
      </div>
    );
  }

  const { shop, products, currency, canBuy } = state;
  const accent = shop.accent || '#17191c';

  const buy = async (product: Product) => {
    setError('');
    setBusy(true);
    const res = await call({
      action: 'buy',
      slug: shop.slug,
      productId: product.id,
      qty,
      email,
      /* Deliberately no price. */
    });
    setBusy(false);
    if (!res.success || !res.url) {
      setError(String(res.message ?? 'That did not go through. Try again.'));
      return;
    }
    window.location.href = String(res.url);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#17191c' }}>
      <header style={{ background: accent, color: '#fff', padding: '48px 20px 40px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <h1 style={{ fontSize: 30, fontWeight: 600, margin: 0, lineHeight: 1.2 }}>{shop.name}</h1>
          {shop.headline && (
            <p style={{ fontSize: 16, opacity: 0.85, margin: '10px 0 0', maxWidth: 620, lineHeight: 1.5 }}>
              {shop.headline}
            </p>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 20px 64px' }}>
        {shop.about && (
          <p style={{ fontSize: 15, color: '#4b5563', lineHeight: 1.7, margin: '0 0 28px', maxWidth: 680, whiteSpace: 'pre-wrap' }}>
            {shop.about}
          </p>
        )}

        {!canBuy && (
          <div style={{
            display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', marginBottom: 24,
            background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8,
          }}>
            <AlertCircle size={16} style={{ color: '#c2410c', flexShrink: 0, marginTop: 2 }} />
            <p style={{ margin: 0, fontSize: 13.5, color: '#7c2d12', lineHeight: 1.6 }}>
              This shop is not taking payments at the moment. You can see what is on offer, but
              nothing can be bought until the owner finishes setting up.
            </p>
          </div>
        )}

        {products.length === 0 ? (
          <p style={{ fontSize: 14, color: '#6b7280' }}>Nothing is listed for sale yet.</p>
        ) : (
          <div style={{
            display: 'grid', gap: 16,
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          }}>
            {products.map(p => (
              <article key={p.id} style={{
                border: '1px solid #e5e7eb', borderRadius: 10, padding: 18,
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, lineHeight: 1.35 }}>{p.name}</h2>
                {p.description && (
                  <p style={{ fontSize: 13.5, color: '#6b7280', margin: 0, lineHeight: 1.6 }}>{p.description}</p>
                )}
                <div style={{ fontSize: 18, fontWeight: 600, marginTop: 'auto' }}>
                  {money(p.priceCents, currency)}
                </div>

                {canBuy && buying !== p.id && (
                  <button
                    onClick={() => { setBuying(p.id); setQty(1); setError(''); }}
                    style={{
                      background: accent, color: '#fff', border: 'none', borderRadius: 8,
                      padding: '10px 14px', fontSize: 14, fontWeight: 500, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    Buy <ArrowRight size={15} />
                  </button>
                )}

                {canBuy && buying === p.id && (
                  <form
                    onSubmit={e => { e.preventDefault(); if (!busy) buy(p); }}
                    style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                  >
                    <label style={{ fontSize: 12.5, color: '#6b7280' }}>
                      Where should the receipt go?
                    </label>
                    <input
                      type="email" required value={email} autoFocus
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      style={{
                        border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 11px',
                        fontSize: 14, width: '100%', boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="number" min={1} max={50} value={qty}
                        onChange={e => setQty(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
                        aria-label="Quantity"
                        style={{
                          border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 11px',
                          fontSize: 14, width: 74,
                        }}
                      />
                      <button
                        type="submit" disabled={busy}
                        style={{
                          background: accent, color: '#fff', border: 'none', borderRadius: 8,
                          padding: '10px 14px', fontSize: 14, fontWeight: 500,
                          cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, flex: 1,
                        }}
                      >
                        {busy ? 'Taking you to checkout…' : `Pay ${money(qty * p.priceCents, currency)}`}
                      </button>
                    </div>
                    <button
                      type="button" onClick={() => { setBuying(null); setError(''); }}
                      style={{
                        background: 'none', border: 'none', color: '#6b7280', fontSize: 13,
                        cursor: 'pointer', padding: 0, textAlign: 'left',
                      }}
                    >
                      Cancel
                    </button>
                    {error && (
                      <p style={{ margin: 0, fontSize: 13, color: '#b91c1c', lineHeight: 1.5 }}>{error}</p>
                    )}
                  </form>
                )}
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
