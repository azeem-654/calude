/**
 * Something to sell — ideas, products, and the orders you have taken.
 *
 * For the customer this product also promises to serve: the one who has no
 * business yet. They describe themselves, the app suggests things they could
 * actually start, and the one they pick becomes a product.
 *
 * ── What this screen refuses to imply ──
 *
 * Until a Stripe account is connected there is no way to be paid through the
 * app, and the orders list says so at the top rather than sitting empty and
 * letting somebody conclude nobody has bought anything. And the startup and
 * revenue figures on an idea are a language model's guesses; they are labelled
 * "estimate" every single time, because a number like that presented as a
 * forecast is how a person commits money they do not have.
 */
import { useEffect, useState } from 'react';
import {
  Lightbulb, Package, Receipt, Plus, Trash2, Sparkles, Loader, Star, X, Link2, Truck,
} from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import {
  fetchCommerce, suggestIdeas, setIdeaStatus, saveProduct, deleteProduct,
  recordOrder, setOrderStatus, money,
  type BusinessIdea, type Product, type Order,
} from '../../services/commerce';
import { payLink } from '../../services/storefront';
import { fulfilOrder } from '../../services/supplier';
import GettingPaid from './GettingPaid';
import SupplierPanel from './SupplierPanel';
import ProductEditor from './ProductEditor';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, overflow: 'hidden' };
const head: React.CSSProperties = { padding: '13px 15px', borderBottom: `1px solid ${LINE}`, background: '#fafbfc', display: 'flex', alignItems: 'center', gap: 8 };
const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 9, fontSize: 13, color: INK, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 };
const btn = (primary = false): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 15px', borderRadius: 9,
  border: primary ? 'none' : `1px solid ${LINE}`, background: primary ? INK : '#fff',
  color: primary ? '#fff' : INK, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
});

export default function Commerce() {
  const { addNotification } = useApp();
  const [ideas, setIdeas] = useState<BusinessIdea[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [storefront, setStorefront] = useState({ available: false, note: '' });
  const [supplierConnected, setSupplierConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [about, setAbout] = useState('');
  const [budget, setBudget] = useState('');
  const [reload, setReload] = useState(0);

  /* `{ product: null }` opens the editor on a new one; a product opens it on
     that one. Null closes it. A bare `Product | null` could not tell "add" from
     "closed". */
  const [editing, setEditing] = useState<{ product: Product | null } | null>(null);
  const [order, setOrder] = useState<{ email: string; productId: string; qty: string } | null>(null);
  /* Kept per order rather than one at a time: somebody chasing three unpaid
     orders should not lose the first link by making the second. */
  const [links, setLinks] = useState<Record<string, string>>({});

  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await fetchCommerce();
      if (!live) return;
      setIdeas(r.ideas); setProducts(r.products); setOrders(r.orders); setStorefront(r.storefront);
      setSupplierConnected(r.supplierConnected);
    })();
    return () => { live = false; };
  }, [reload]);

  const again = () => setReload(n => n + 1);

  const doSuggest = async () => {
    setBusy(true);
    const r = await suggestIdeas(about, Number(budget) || 0);
    setBusy(false);
    if (!r.success) { addNotification(r.error ?? 'Could not suggest anything.', 'error'); return; }
    if (r.ideas) setIdeas(r.ideas);
    addNotification('Five ideas, written from what you said about yourself.', 'success');
  };

  const decide = async (id: string, status: BusinessIdea['status']) => {
    const r = await setIdeaStatus(id, status);
    if (r.ideas) setIdeas(r.ideas);
  };

  const doPayLink = async (id: string) => {
    setBusy(true);
    const r = await payLink(id);
    setBusy(false);
    if (!r.success || !r.url) { addNotification(r.error ?? 'Could not make a payment link.', 'error'); return; }
    setLinks(m => ({ ...m, [id]: r.url! }));
    void navigator.clipboard?.writeText(r.url).catch(() => {});
    addNotification(r.expiresNote ?? 'Payment link ready.', 'success');
  };

  /**
   * Two presses, on purpose.
   *
   * The first sends a draft to the supplier; the second confirms it, which is
   * the one that charges their Printful account and starts something being
   * printed. Collapsing them into a single button would mean a misread address
   * costs a shirt rather than a click.
   */
  const doFulfil = async (o: Order) => {
    const confirming = !!o.supplierRef;
    if (confirming && !window.confirm(
      'Confirm this with Printful? They will charge your Printful account and start making it. This cannot be undone.',
    )) return;
    setBusy(true);
    const r = await fulfilOrder(o.id, confirming);
    setBusy(false);
    if (!r.success) {
      const steps = r.diagnosis?.steps ?? [];
      addNotification(steps.length ? `${r.diagnosis?.summary} ${steps[0]}` : (r.error ?? 'Could not send it.'), 'error');
      again();
      return;
    }
    addNotification(r.note ?? (confirming ? 'Confirmed with Printful.' : 'Sent as a draft.'), 'success');
    again();
  };

  const doRecordOrder = async () => {
    if (!order) return;
    const p = products.find(x => x.id === order.productId);
    if (!p) { addNotification('Pick a product first.', 'error'); return; }
    setBusy(true);
    const r = await recordOrder(order.email, [{
      productId: p.id, name: p.name,
      qty: Math.max(1, Number(order.qty) || 1), priceCents: p.priceCents,
    }]);
    setBusy(false);
    if (!r.success) { addNotification(r.error ?? 'Could not record it.', 'error'); return; }
    if (r.orders) setOrders(r.orders);
    setOrder(null);
    addNotification('Order recorded.', 'success');
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header title="Sell" subtitle="What you sell, and what you have sold" />

      <div style={{ padding: '18px clamp(16px, 3vw, 32px) 60px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 980, margin: '0 auto' }}>

        {/* ── Ideas ── */}
        <div style={card}>
          <div style={head}>
            <Lightbulb size={15} color={INK} />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: INK }}>Ideas</h3>
          </div>
          <div style={{ padding: 15, display: 'grid', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
              No business yet? Say a little about yourself — what you are good at, how much time you have,
              anything you have already tried — and this suggests things you could realistically start.
            </p>
            <textarea value={about} onChange={e => setAbout(e.target.value)} rows={3}
              placeholder="I am a joiner, I have evenings and weekends free, and about £500 to start with."
              style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ maxWidth: 200 }}>
                <label style={lbl}>Budget to start (optional)</label>
                <input value={budget} onChange={e => setBudget(e.target.value)} placeholder="500" style={inp} />
              </div>
              <button onClick={() => void doSuggest()} disabled={busy} style={btn(true)}>
                {busy ? <Loader size={14} /> : <Sparkles size={14} />} Suggest ideas
              </button>
            </div>

            {ideas.map(i => (
              <div key={i.id} style={{ padding: 13, border: `1px solid ${LINE}`, borderRadius: 12, background: i.status === 'chosen' ? '#f4fbf5' : '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: INK }}>{i.title}</h4>
                    <p style={{ margin: '5px 0 0', fontSize: 13, color: '#3a4150', lineHeight: 1.6 }}>{i.summary}</p>
                    <p style={{ margin: '6px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.55 }}>
                      <strong>For:</strong> {i.audience} · <strong>Solves:</strong> {i.problem}
                    </p>
                    {i.because && (
                      <p style={{ margin: '6px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.55 }}>because {i.because}</p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => void decide(i.id, i.status === 'chosen' ? 'shortlisted' : 'chosen')} style={btn(i.status === 'chosen')}>
                      <Star size={12} /> {i.status === 'chosen' ? 'Chosen' : 'Choose'}
                    </button>
                    <button onClick={() => void decide(i.id, 'dismissed')} aria-label="Dismiss" style={{ ...btn(), padding: '9px 10px' }}>
                      <X size={12} />
                    </button>
                  </div>
                </div>
                {/* Estimates, said as estimates. Every time. */}
                <p style={{ margin: '9px 0 0', fontSize: 11.5, color: MUTED }}>
                  Rough estimate only — {money(Math.round(i.estStartup * 100), i.currency)} to start,
                  around {money(Math.round(i.estMonthly * 100), i.currency)} a month once going.
                  These are the model's guesses, not a forecast.
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Products ── */}
        <div style={card}>
          <div style={head}>
            <Package size={15} color={INK} />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: INK }}>Products</h3>
            {products.length > 0 && (
              <span style={{ fontSize: 11.5, color: MUTED }}>
                {products.filter(p => p.status === 'active').length} for sale · {products.length} total
              </span>
            )}
            <button onClick={() => setEditing({ product: null })} style={{ ...btn(true), marginLeft: 'auto' }}>
              <Plus size={13} /> Add product
            </button>
          </div>

          {!products.length ? (
            <div style={{ padding: '28px 18px', textAlign: 'center' }}>
              <Package size={24} color="#c4c8cf" />
              <p style={{ margin: '10px 0 4px', fontSize: 13.5, fontWeight: 700, color: INK }}>Nothing to sell yet</p>
              <p style={{ margin: '0 0 14px', fontSize: 12.5, color: MUTED, lineHeight: 1.55 }}>
                Add what you sell — a picture, a price, a line about it. Set one to “For sale” and it
                appears in your shop.
              </p>
              <button onClick={() => setEditing({ product: null })} style={btn(true)}>
                <Plus size={13} /> Add your first product
              </button>
            </div>
          ) : (
            <div style={{ padding: 12, display: 'grid', gap: 8 }}>
              {products.map(p => {
                const out = p.trackInventory === 1 && p.inventory <= 0;
                return (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 11, padding: 9,
                    border: `1px solid ${LINE}`, borderRadius: 11, flexWrap: 'wrap',
                  }}>
                    {/* The picture, because a catalogue of names is a spreadsheet. */}
                    {p.imageUrl
                      ? <img src={p.imageUrl} alt="" style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                      : <div style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 8, background: '#f4f5f7', display: 'grid', placeItems: 'center', color: '#c4c8cf' }}><Package size={16} /></div>}

                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{p.name}</div>
                      <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
                        {money(p.priceCents, p.currency)}
                        {p.compareAtCents > p.priceCents && (
                          <span style={{ textDecoration: 'line-through', marginLeft: 6 }}>{money(p.compareAtCents, p.currency)}</span>
                        )}
                        {p.costCents > 0 && <> · costs you {money(p.costCents, p.currency)}</>}
                        {p.trackInventory === 1 && <> · {p.inventory} in stock</>}
                        {p.category && <> · {p.category}</>}
                      </div>
                    </div>

                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999,
                      background: out ? '#fef2f2' : p.status === 'active' ? '#e8f5e9' : '#f1f5f9',
                      color: out ? '#b91c1c' : p.status === 'active' ? '#1e6b32' : MUTED,
                    }}>
                      {out ? 'out of stock' : p.status === 'active' ? 'for sale' : p.status}
                    </span>

                    <button onClick={() => setEditing({ product: p })}
                      style={{ ...btn(), padding: '6px 11px', fontSize: 12 }}>Edit</button>
                    <button onClick={() => void deleteProduct(p.id).then(r => r.products && setProducts(r.products))}
                      aria-label={`Delete ${p.name}`} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#a02216', display: 'flex' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Getting paid ── */}
        <GettingPaid onChange={again} />

        {/* ── Who makes and posts it ── */}
        <SupplierPanel onChange={again} />

        {/* ── Orders ── */}
        <div style={card}>
          <div style={head}>
            <Receipt size={15} color={INK} />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: INK }}>Orders</h3>
            {products.length > 0 && (
              <button onClick={() => setOrder({ email: '', productId: products[0].id, qty: '1' })} style={{ ...btn(), marginLeft: 'auto' }}>
                <Plus size={13} /> Record one
              </button>
            )}
          </div>
          <div style={{ padding: 15, display: 'grid', gap: 10 }}>
            {/* Said plainly, at the top, so an empty list is not mistaken for
                "nobody bought anything" — and, once Stripe is connected, so the
                payment link is not a button nobody knows is there. */}
            {storefront.note && (
              <p style={{ margin: 0, padding: '10px 12px', borderRadius: 10, background: storefront.available ? '#e8f6ee' : '#eef2f8', color: storefront.available ? '#1f6b45' : '#3a4a63', fontSize: 12.5, lineHeight: 1.6 }}>
                {storefront.note}
              </p>
            )}

            {order && (
              <div style={{ padding: 13, border: `1px solid ${LINE}`, borderRadius: 12, background: '#f7f8fa', display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px', gap: 10 }}>
                  <div><label style={lbl}>Customer email</label>
                    <input value={order.email} onChange={e => setOrder({ ...order, email: e.target.value })} placeholder="ann@example.com" style={inp} /></div>
                  <div><label style={lbl}>Product</label>
                    <select value={order.productId} onChange={e => setOrder({ ...order, productId: e.target.value })} style={inp}>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select></div>
                  <div><label style={lbl}>Qty</label>
                    <input value={order.qty} onChange={e => setOrder({ ...order, qty: e.target.value })} style={inp} /></div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => void doRecordOrder()} disabled={busy} style={btn(true)}>Record</button>
                  <button onClick={() => setOrder(null)} style={btn()}>Cancel</button>
                </div>
              </div>
            )}

            {orders.map(o => (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: `1px solid ${LINE}`, borderRadius: 10, flexWrap: 'wrap' }}>
                <span style={{ flex: 1, minWidth: 160, fontSize: 13, color: INK }}>
                  {o.email || 'No email'} — {o.items.map(i => `${i.qty} × ${i.name}`).join(', ')}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>{money(o.totalCents, o.currency)}</span>
                <select value={o.status} onChange={e => void setOrderStatus(o.id, e.target.value as Order['status']).then(r => r.orders && setOrders(r.orders))}
                  style={{ ...inp, width: 'auto', padding: '5px 8px', fontSize: 12 }}>
                  {['pending', 'paid', 'fulfilled', 'cancelled', 'refunded'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {/* Offered only where it can do something: a connected Stripe
                    account and an order still waiting to be paid. */}
                {storefront.available && o.status === 'pending' && (
                  <button onClick={() => void doPayLink(o.id)} disabled={busy} style={{ ...btn(), padding: '6px 11px' }}>
                    <Link2 size={13} /> {links[o.id] ? 'New link' : 'Payment link'}
                  </button>
                )}
                {/* Offered on a paid order, once a supplier is connected. The
                    label says which of the two presses this is: a draft costs
                    nothing, confirming is what starts something being made. */}
                {supplierConnected && o.supplierLines > 0 && (o.status === 'paid' || o.status === 'fulfilled') && o.supplierStatus !== 'submitted' && (
                  <button onClick={() => void doFulfil(o)} disabled={busy} style={{ ...btn(), padding: '6px 11px' }}>
                    <Truck size={13} /> {o.supplierRef ? 'Confirm with Printful' : 'Send to Printful'}
                  </button>
                )}
                {o.supplierStatus === 'submitted' && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#0f7b3d', background: '#e8f6ee', padding: '3px 9px', borderRadius: 999 }}>
                    With Printful #{o.supplierRef}
                  </span>
                )}
                {o.supplierStatus === 'draft' && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#7a4d00', background: '#fff7e6', padding: '3px 9px', borderRadius: 999 }}>
                    Draft #{o.supplierRef} — not made yet
                  </span>
                )}
                {o.supplierStatus === 'failed' && o.supplierError && (
                  <span style={{ flexBasis: '100%', fontSize: 11.5, color: '#b42318' }}>
                    Printful refused it: {o.supplierError}
                  </span>
                )}
                {o.shipName && (
                  <span style={{ flexBasis: '100%', fontSize: 11.5, color: MUTED }}>
                    Ship to {o.shipName}, {o.shipCity} {o.shipCountry}
                  </span>
                )}

                {links[o.id] && (
                  <div style={{ flexBasis: '100%', display: 'flex', gap: 7, alignItems: 'center' }}>
                    <input readOnly value={links[o.id]} onFocus={e => e.currentTarget.select()}
                      style={{ ...inp, fontSize: 11.5, padding: '6px 9px' }} />
                    <a href={links[o.id]} target="_blank" rel="noopener noreferrer" style={{ ...btn(), padding: '6px 11px', textDecoration: 'none' }}>Open</a>
                  </div>
                )}
              </div>
            ))}
            {!orders.length && !order && (
              <p style={{ margin: 0, fontSize: 13, color: MUTED }}>No orders recorded yet.</p>
            )}
          </div>
        </div>

        <button onClick={again} style={{ ...btn(), alignSelf: 'flex-start' }}>Refresh</button>
      </div>

      {editing && (
        <ProductEditor
          product={editing.product}
          /* The currency the storefront will actually charge in, so the price
             field shows the symbol somebody is really typing. */
          currency={products[0]?.currency || 'USD'}
          onClose={() => setEditing(null)}
          onSaved={setProducts}
        />
      )}
    </div>
  );
}
