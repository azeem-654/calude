/**
 * The shop a stranger sees.
 *
 * Runs with no session, no AppProvider and no workspace. It knows one thing —
 * the slug in the address — and everything else comes from /api/shop.php.
 *
 * ── Two rules that do not bend ──
 *
 *  - **It never sends a price.** The buy call carries a product id and a
 *    quantity. What that costs is the server's business; a page that posts an
 *    amount is a page whose amount can be edited.
 *  - **It says when it cannot sell.** If the owner has not connected a
 *    processor the buy buttons are gone and the reason is on the page. Taking
 *    somebody's email address and then failing at the checkout is the version
 *    of this that loses a customer quietly.
 *
 * ── Why there is a basket ──
 *
 * The first version sold one thing at a time: press Buy, type your email, go to
 * a checkout. Which is fine for a service and hopeless for a shop — somebody
 * buying three things had to do the whole thing three times and pay three lots
 * of card fees. The basket is local to the page; the order is still created
 * server-side from ids and quantities only.
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePageTitle } from '../../services/pageTitle';
import {
  ShoppingBag, Loader, AlertCircle, Plus, Minus, X, ArrowRight, Check, Search,
} from 'lucide-react';
import { API_BASE } from '../../services/apiBase';
import { themeFor, inkOn, usableAccent, type Theme } from './themes';

interface Variant {
  id: string;
  title: string;
  priceCents: number;
  compareAtCents: number;
  inventory: number;
  imageUrl: string;
  sku: string;
}

interface Product {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  compareAtCents: number;
  currency: string;
  sku: string;
  imageUrl: string;
  category: string;
  inventory: number;
  trackInventory: number;
  variants?: Variant[];
}

interface ShippingRate {
  id: string;
  name: string;
  countries: string;
  kind: string;
  amountCents: number;
  thresholdCents: number;
}

/**
 * What the shop says this basket costs.
 *
 * Asked of the server rather than worked out here. The browser never does
 * money arithmetic: `buy` recomputes from the same module, so a total shown on
 * the page can only ever agree with the one that gets charged — and a total
 * assembled in a browser is a total somebody can edit.
 */
interface Totals {
  goodsCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  shippingLabel: string;
  discountCode: string;
  discountProblem: string;
}

/**
 * A basket line's identity.
 *
 * The product alone is not enough once a t-shirt has sizes: a Large and a
 * Small are two lines with two prices and two stock counts, and keying by
 * product id would silently merge them into whichever was added last.
 */
const lineKey = (productId: string, variantId: string) => `${productId}|${variantId}`;

interface Shop {
  slug: string;
  name: string;
  headline: string;
  about: string;
  accent: string;
  template: string;
  heroImage: string;
  shippingNote: string;
  returnsNote: string;
  contactEmail: string;
}

interface Loaded {
  shop: Shop;
  products: Product[];
  currency: string;
  canBuy: boolean;
  /* The rules, not a price. The page has no country until the buyer says. */
  rates: ShippingRate[];
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

/** How many of this can still be bought. Infinity when nobody is counting. */
/**
 * What is left of a thing.
 *
 * A variant's own count when one is chosen — the product's number is the total
 * across every size, and using it lets somebody order six Larges when there
 * are two, because there are six shirts.
 */
const stockOf = (p: Product, v?: Variant) =>
  (p.trackInventory ? (v ? v.inventory : p.inventory) : Number.POSITIVE_INFINITY);

function Placeholder({ t, ratio }: { t: Theme; ratio: string }) {
  return (
    <div style={{
      aspectRatio: ratio, width: '100%', display: 'grid', placeItems: 'center',
      background: t.pageBg === '#ffffff' ? '#f4f5f7' : 'rgba(255,255,255,0.05)',
      borderRadius: t.radius, color: t.muted,
    }}>
      <ShoppingBag size={26} strokeWidth={1.4} />
    </div>
  );
}

export default function ShopPage() {
  const { slug } = useParams<{ slug?: string }>();
  const [state, setState] = useState<Loaded | 'loading' | 'missing'>('loading');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');

  /** productId → quantity. Lives only as long as the page is open. */
  const [basket, setBasket] = useState<Record<string, number>>({});
  const [basketOpen, setBasketOpen] = useState(false);
  /* Which option is showing on each card, before anything is added. */
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [discountCode, setDiscountCode] = useState('');
  const [country, setCountry] = useState('');
  const [totals, setTotals] = useState<Totals | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /* The shop's own name in the tab. `index.html` names this platform, which is
     right for the product and wrong for a page belonging to somebody else's
     business. */
  usePageTitle(typeof state === 'object' ? state.shop.name : 'Shop');

  useEffect(() => {
    let live = true;
    setState('loading');
    call({ action: 'get', slug: slug ?? '' }).then(res => {
      if (!live) return;
      if (!res.success) { setState('missing'); return; }
      setState({
        shop: res.shop as Shop,
        products: ((res.products as Product[]) ?? []).map(p => ({
          ...p,
          compareAtCents: Number(p.compareAtCents ?? 0),
          inventory: Number(p.inventory ?? 0),
          trackInventory: Number(p.trackInventory ?? 0),
          variants: ((p.variants as Variant[]) ?? []).map(v => ({
            ...v,
            priceCents: Number(v.priceCents ?? 0),
            compareAtCents: Number(v.compareAtCents ?? 0),
            inventory: Number(v.inventory ?? 0),
          })),
        })),
        rates: (res.shippingRates as ShippingRate[]) ?? [],
        currency: String(res.currency ?? 'USD'),
        canBuy: !!res.canBuy,
      });
    });
    return () => { live = false; };
  }, [slug]);

  const products = state !== 'loading' && state !== 'missing' ? state.products : [];

  const lines = useMemo(
    () => Object.entries(basket)
      .map(([key, qty]) => {
        const [productId, variantId = ''] = key.split('|');
        const product = products.find(p => p.id === productId);
        const variant = variantId ? product?.variants?.find(v => v.id === variantId) : undefined;
        return { key, product, variant, qty };
      })
      .filter((l): l is { key: string; product: Product; variant: Variant | undefined; qty: number } =>
        !!l.product && l.qty > 0
        /* A variant that has since been removed leaves a stale basket line. It
           is dropped rather than priced at the product's price, which would
           charge for something the shop no longer sells. */
        && (!l.key.split('|')[1] || !!l.variant)),
    [basket, products],
  );
  const basketCount = lines.reduce((n, l) => n + l.qty, 0);

  /** What one line costs each — the variant's price when there is one. */
  const unitOf = (l: { product: Product; variant?: Variant }) =>
    l.variant ? l.variant.priceCents : l.product.priceCents;

  /* What goes to the server, both for the quote and the purchase: what and how
     many, never a price. */
  const orderItems = lines.map(l => ({
    productId: l.product.id, variantId: l.variant?.id ?? '', qty: l.qty,
  }));

  /*
   * Ask the shop what this costs, whenever the basket, the code or the country
   * changes.
   *
   * The browser never works it out. `buy` recomputes from the same module, so
   * what is shown here can only ever agree with what is charged — and a total
   * assembled in a browser is a total somebody can edit.
   *
   * Debounced, because this fires on every keystroke in the code box.
   *
   * It lives up here with the other hooks rather than beside the checkout it
   * belongs to: below the `loading` and `missing` early returns it would be a
   * conditional hook, which React refuses the moment the shop finishes
   * loading. Caught by the linter, and it would have been a white screen.
   */
  useEffect(() => {
    let live = true;
    /* Everything inside the timer, including the state changes: a setState in
       an effect body is a cascading render, and the debounce is here anyway. */
    const timer = window.setTimeout(() => {
      if (!lines.length) { setTotals(null); return; }
      setQuoting(true);
      void call({
        action: 'quote', slug: slug ?? '', items: orderItems,
        discountCode: discountCode.trim(), shipCountry: country,
      }).then(res => {
        if (!live) return;
        setQuoting(false);
        setTotals(res.success ? (res.totals as Totals) : null);
      });
    }, 350);
    return () => { live = false; window.clearTimeout(timer); };
    /* `orderItems` is rebuilt every render, so the basket itself is the
       dependency — otherwise this loops forever. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basket, discountCode, country, slug]);



  const categories = useMemo(() => {
    const set = new Set(products.map(p => p.category).filter(Boolean));
    return [...set].sort();
  }, [products]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(p => {
      if (category && p.category !== category) return false;
      if (!q) return true;
      return `${p.name} ${p.description} ${p.sku}`.toLowerCase().includes(q);
    });
  }, [products, query, category]);


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

  const { shop, currency, canBuy, rates } = state;
  const t = themeFor(shop.template);
  /* Lifted off the theme's own ground only if it would otherwise vanish into
     it — a near-black brand colour on the dark theme gave a black button on a
     black card, which reads as a shop with no buy button. */
  const accent = usableAccent(shop.accent || '#17191c', t.cardBg);
  const onAccent = inkOn(accent);

  const add = (p: Product, by = 1, variant?: Variant) => {
    setError('');
    const key = lineKey(p.id, variant?.id ?? '');
    setBasket(b => {
      const next = Math.max(0, (b[key] ?? 0) + by);
      /* Capped at what is left, so the basket can never ask for more than the
         shop can send and the buyer finds out here rather than at the card.
         A variant's own stock, because one number across sizes is the bug that
         oversells the large. */
      const cap = Math.min(next, stockOf(p, variant), 50);
      const out = { ...b };
      if (cap <= 0) delete out[key]; else out[key] = cap;
      return out;
    });
  };

  /* What the items are worth before anything is taken off or added on. Shown
     while a quote is in flight so the panel is never blank. */
  const goods = lines.reduce((n, l) => n + unitOf(l) * l.qty, 0);
  const total = totals ? totals.totalCents : goods;

  const checkout = async () => {
    setError('');
    if (!lines.length) return;
    setBusy(true);
    /*
     * The whole basket, in one order.
     *
     * This used to send only the first line while the page showed a total for
     * all of them — survivable when the total was a sum anybody could check,
     * and not survivable beside a discount code, because the page would show
     * 20% off three items and the card would be debited for one.
     */
    const res = await call({
      action: 'buy', slug: shop.slug, items: orderItems, email,
      discountCode: discountCode.trim(), shipCountry: country,
      /* Deliberately no price. */
    });
    setBusy(false);
    if (!res.success || !res.url) {
      setError(String(res.message ?? 'That did not go through. Try again.'));
      return;
    }
    window.location.href = String(res.url);
  };

  const btn = (filled: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '11px 18px', borderRadius: t.radius === 0 ? 0 : Math.min(t.radius, 10),
    border: filled ? 'none' : `1px solid ${t.line}`,
    background: filled ? accent : 'transparent',
    color: filled ? onAccent : t.ink,
    fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  });

  const heroHeading = (
    <h1 style={{
      fontFamily: t.headingFont,
      fontSize: `clamp(26px, ${2.2 * t.headingScale}rem, ${44 * t.headingScale}px)`,
      fontWeight: t.headingWeight,
      letterSpacing: t.headingTracking,
      textTransform: t.uppercaseHeading ? 'uppercase' : 'none',
      margin: 0, lineHeight: 1.12,
    }}>{shop.name}</h1>
  );

  const heroText = t.heroFilled && t.hero !== 'quiet' ? onAccent : t.ink;

  return (
    <div style={{ minHeight: '100vh', background: t.pageBg, color: t.ink, fontFamily: t.bodyFont }}>
      {/* ── Bar: name and the basket ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: t.pageBg, borderBottom: `1px solid ${t.line}`,
      }}>
        <div style={{
          maxWidth: t.maxWidth, margin: '0 auto', padding: '12px 20px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>{shop.name}</span>
          <span style={{ flex: 1 }} />
          {canBuy && (
            <button onClick={() => setBasketOpen(true)} style={{ ...btn(basketCount > 0), padding: '8px 14px', fontSize: 13 }}>
              <ShoppingBag size={15} />
              {basketCount > 0 ? `${basketCount} · ${money(total, currency)}` : 'Basket'}
            </button>
          )}
        </div>
      </div>

      {/* ── Hero ── */}
      <header style={{
        background: t.heroFilled && t.hero !== 'quiet' ? accent : 'transparent',
        color: heroText,
        padding: `${t.heroPad}px 20px ${Math.round(t.heroPad * 0.72)}px`,
        borderBottom: t.heroFilled ? 'none' : `1px solid ${t.line}`,
      }}>
        <div style={{
          maxWidth: t.maxWidth, margin: '0 auto',
          display: t.hero === 'split' ? 'grid' : 'block',
          gridTemplateColumns: t.hero === 'split' ? 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))' : undefined,
          gap: 28, alignItems: 'center',
          textAlign: t.hero === 'full' || t.hero === 'quiet' ? 'center' : 'left',
        }}>
          <div>
            {heroHeading}
            {shop.headline && (
              <p style={{
                fontSize: t.hero === 'full' ? 17 : 15.5, opacity: 0.86,
                margin: '12px 0 0', maxWidth: 620, lineHeight: 1.55,
                marginLeft: t.hero === 'full' || t.hero === 'quiet' ? 'auto' : undefined,
                marginRight: t.hero === 'full' || t.hero === 'quiet' ? 'auto' : undefined,
              }}>
                {shop.headline}
              </p>
            )}
          </div>
          {shop.heroImage && (
            <img src={shop.heroImage} alt="" style={{
              width: '100%', maxHeight: 340, objectFit: 'cover',
              borderRadius: t.radius, display: 'block',
              marginTop: t.hero === 'split' ? 0 : 26,
            }} />
          )}
        </div>
      </header>

      <main style={{ maxWidth: t.maxWidth, margin: '0 auto', padding: '28px 20px 72px' }}>
        {shop.about && (
          <p style={{
            fontSize: 15, color: t.muted, lineHeight: 1.75, margin: '0 0 30px',
            maxWidth: 680, whiteSpace: 'pre-wrap',
          }}>{shop.about}</p>
        )}

        {!canBuy && (
          <div style={{
            display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', marginBottom: 26,
            background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: Math.max(t.radius, 8),
          }}>
            <AlertCircle size={16} style={{ color: '#c2410c', flexShrink: 0, marginTop: 2 }} />
            <p style={{ margin: 0, fontSize: 13.5, color: '#7c2d12', lineHeight: 1.6 }}>
              This shop is not taking payments at the moment. You can see what is on offer, but
              nothing can be bought until the owner finishes setting up.
            </p>
          </div>
        )}

        {/* Search and categories, only once there is enough to need them. */}
        {products.length > 8 && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 24 }}>
            <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
              <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: t.muted }} />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search"
                style={{
                  width: '100%', padding: '9px 12px 9px 34px', boxSizing: 'border-box',
                  border: `1px solid ${t.line}`, borderRadius: Math.max(t.radius, 8),
                  background: t.cardBg, color: t.ink, fontSize: 14, outline: 'none', fontFamily: 'inherit',
                }} />
            </div>
            {categories.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['', ...categories].map(c => (
                  <button key={c || 'all'} onClick={() => setCategory(c)}
                    style={{
                      padding: '7px 13px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                      border: `1px solid ${category === c ? accent : t.line}`,
                      background: category === c ? accent : 'transparent',
                      color: category === c ? onAccent : t.muted,
                      fontSize: 12.5, fontWeight: 600,
                    }}>
                    {c || 'Everything'}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {products.length === 0 ? (
          <p style={{ fontSize: 14, color: t.muted }}>Nothing is listed for sale yet.</p>
        ) : shown.length === 0 ? (
          <p style={{ fontSize: 14, color: t.muted }}>Nothing matches that.</p>
        ) : (
          <div style={{
            display: 'grid', gap: t.gap,
            gridTemplateColumns: `repeat(auto-fill, minmax(min(${t.cardMin}px, 100%), 1fr))`,
          }}>
            {shown.map(p => {
              const variants = p.variants ?? [];
              /* The one showing on this card. Defaults to the first that is
                 actually in stock, so a shirt whose Small sold out opens on the
                 Large rather than on a disabled button. */
              const pick = variants.length
                ? (variants.find(v => v.id === chosen[p.id])
                  ?? variants.find(v => stockOf(p, v) > 0)
                  ?? variants[0])
                : undefined;
              const left = stockOf(p, pick);
              const out = left <= 0;
              const inBasket = basket[lineKey(p.id, pick?.id ?? '')] ?? 0;
              const unit = pick ? pick.priceCents : p.priceCents;
              const wasPrice = pick ? pick.compareAtCents : p.compareAtCents;
              const onSale = wasPrice > unit;
              return (
                <article key={p.id} style={{
                  background: t.cardBg,
                  border: t.cardBorder ? `1px solid ${t.line}` : 'none',
                  borderRadius: t.radius,
                  boxShadow: t.cardShadow,
                  overflow: 'hidden',
                  display: 'flex', flexDirection: 'column',
                  opacity: out ? 0.58 : 1,
                }}>
                  {/* The chosen option's own picture when it has one — a blue
                      shirt should not be illustrated by the red one. */}
                  {(pick?.imageUrl || p.imageUrl)
                    ? <img src={pick?.imageUrl || p.imageUrl} alt="" style={{ width: '100%', aspectRatio: t.ratio, objectFit: 'cover', display: 'block' }} />
                    : <Placeholder t={t} ratio={t.ratio} />}

                  <div style={{ padding: t.cardBorder || t.cardShadow !== 'none' ? 15 : '14px 0 0', display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
                    <h2 style={{ fontFamily: t.headingFont, fontSize: 15.5, fontWeight: 600, margin: 0, lineHeight: 1.35 }}>{p.name}</h2>
                    {p.description && (
                      <p style={{ fontSize: 13.5, color: t.muted, margin: 0, lineHeight: 1.6 }}>{p.description}</p>
                    )}

                    {/* ── The options, when there are any ── */}
                    {variants.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 2 }}>
                        {variants.map(v => {
                          const vLeft = stockOf(p, v);
                          const gone = vLeft <= 0;
                          const on = v.id === pick?.id;
                          return (
                            <button key={v.id} type="button"
                              onClick={() => setChosen(c => ({ ...c, [p.id]: v.id }))}
                              disabled={gone} aria-pressed={on}
                              title={gone ? `${v.title} — out of stock` : v.title}
                              style={{
                                padding: '6px 11px', borderRadius: Math.min(t.radius, 999),
                                border: `1px solid ${on ? accent : t.line}`,
                                background: on ? accent : 'transparent',
                                color: on ? onAccent : gone ? t.muted : t.ink,
                                fontSize: 12.5, fontWeight: 600, cursor: gone ? 'not-allowed' : 'pointer',
                                fontFamily: 'inherit',
                                /* Struck through rather than hidden: a buyer
                                   should see the size exists and has gone, not
                                   wonder whether the shop stocks it. */
                                textDecoration: gone ? 'line-through' : 'none',
                                opacity: gone ? 0.5 : 1,
                              }}>
                              {v.title}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 'auto', paddingTop: 6 }}>
                      <span style={{ fontSize: 17, fontWeight: 700 }}>{money(unit, currency)}</span>
                      {onSale && (
                        /* Only ever shown when it is genuinely higher — the
                           server refuses to store a "was" below the price. */
                        <span style={{ fontSize: 13.5, color: t.muted, textDecoration: 'line-through' }}>
                          {money(wasPrice, currency)}
                        </span>
                      )}
                    </div>

                    {p.trackInventory === 1 && (
                      <span style={{ fontSize: 12, color: out ? '#b91c1c' : left <= 5 ? '#b45309' : t.muted }}>
                        {out ? 'Out of stock' : left <= 5 ? `Only ${left} left` : `${left} in stock`}
                      </span>
                    )}

                    {canBuy && !out && (
                      inBasket > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          <button onClick={() => add(p, -1, pick)} aria-label={`One fewer ${p.name}`}
                            style={{ ...btn(false), padding: 8, borderRadius: Math.min(t.radius, 8) }}><Minus size={14} /></button>
                          <span style={{ fontSize: 15, fontWeight: 700, minWidth: 22, textAlign: 'center' }}>{inBasket}</span>
                          <button onClick={() => add(p, 1, pick)} disabled={inBasket >= left} aria-label={`One more ${p.name}`}
                            style={{ ...btn(false), padding: 8, borderRadius: Math.min(t.radius, 8), opacity: inBasket >= left ? 0.4 : 1 }}><Plus size={14} /></button>
                        </div>
                      ) : (
                        <button onClick={() => add(p, 1, pick)} style={{ ...btn(true), marginTop: 4 }}>
                          Add to basket
                        </button>
                      )
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* ── What a buyer asks before and after paying ── */}
        {(shop.shippingNote || shop.returnsNote || shop.contactEmail) && (
          <div style={{
            marginTop: 56, paddingTop: 28, borderTop: `1px solid ${t.line}`,
            display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))',
          }}>
            {shop.shippingNote && (
              <div>
                <h3 style={{ fontFamily: t.headingFont, fontSize: 13, fontWeight: 700, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Delivery</h3>
                <p style={{ margin: 0, fontSize: 13.5, color: t.muted, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{shop.shippingNote}</p>
              </div>
            )}
            {shop.returnsNote && (
              <div>
                <h3 style={{ fontFamily: t.headingFont, fontSize: 13, fontWeight: 700, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Returns</h3>
                <p style={{ margin: 0, fontSize: 13.5, color: t.muted, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{shop.returnsNote}</p>
              </div>
            )}
            {shop.contactEmail && (
              <div>
                <h3 style={{ fontFamily: t.headingFont, fontSize: 13, fontWeight: 700, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Questions</h3>
                <a href={`mailto:${shop.contactEmail}`} style={{ fontSize: 13.5, color: accent, textDecoration: 'none' }}>{shop.contactEmail}</a>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── The basket ── */}
      {basketOpen && canBuy && (
        <div
          role="dialog" aria-modal="true" aria-label="Basket"
          onClick={e => { if (e.target === e.currentTarget) setBasketOpen(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(12,14,17,0.5)', display: 'flex', justifyContent: 'flex-end' }}
        >
          <div style={{
            background: t.cardBg, color: t.ink, width: 'min(420px, 100%)', height: '100%',
            display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 60px rgba(0,0,0,0.25)',
          }}>
            <div style={{ padding: '16px 18px', borderBottom: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontFamily: t.headingFont, margin: 0, fontSize: 16, fontWeight: 700, flex: 1 }}>Your basket</h2>
              <button onClick={() => setBasketOpen(false)} aria-label="Close"
                style={{ border: 'none', background: 'none', color: t.muted, cursor: 'pointer', display: 'flex', padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'grid', gap: 14, alignContent: 'start' }}>
              {lines.length === 0 && (
                <p style={{ fontSize: 14, color: t.muted, margin: 0 }}>Nothing in it yet.</p>
              )}
              {lines.map(l => (
                <div key={l.product.id} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                  {l.product.imageUrl
                    ? <img src={l.product.imageUrl} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: Math.min(t.radius, 8), flexShrink: 0 }} />
                    : <div style={{ width: 56, height: 56, flexShrink: 0, borderRadius: Math.min(t.radius, 8), background: t.pageBg === '#ffffff' ? '#f4f5f7' : 'rgba(255,255,255,0.06)', display: 'grid', placeItems: 'center', color: t.muted }}><ShoppingBag size={16} /></div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>
                      {l.product.name}{l.variant ? ` — ${l.variant.title}` : ''}
                    </div>
                    <div style={{ fontSize: 13, color: t.muted, marginTop: 2 }}>{money(l.product.priceCents, currency)} each</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7 }}>
                      <button onClick={() => add(l.product, -1)} aria-label="One fewer"
                        style={{ ...btn(false), padding: 6, borderRadius: 6 }}><Minus size={12} /></button>
                      <span style={{ fontSize: 14, fontWeight: 700, minWidth: 18, textAlign: 'center' }}>{l.qty}</span>
                      <button onClick={() => add(l.product, 1, l.variant)} disabled={l.qty >= stockOf(l.product, l.variant)} aria-label="One more"
                        style={{ ...btn(false), padding: 6, borderRadius: 6, opacity: l.qty >= stockOf(l.product, l.variant) ? 0.4 : 1 }}><Plus size={12} /></button>
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{money(unitOf(l) * l.qty, currency)}</div>
                </div>
              ))}
            </div>

            {lines.length > 0 && (
              <form
                onSubmit={e => { e.preventDefault(); if (!busy) void checkout(); }}
                style={{ padding: 18, borderTop: `1px solid ${t.line}`, display: 'grid', gap: 10 }}
              >
                {/* ── The code ── */}
                <label style={{ display: 'grid', gap: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: t.muted }}>Discount code</span>
                  <input value={discountCode} onChange={e => setDiscountCode(e.target.value.toUpperCase())}
                    placeholder="If you have one" aria-label="Discount code"
                    style={{
                      width: '100%', padding: '10px 13px', boxSizing: 'border-box', letterSpacing: '0.06em',
                      border: `1px solid ${totals?.discountProblem ? '#b91c1c' : t.line}`,
                      borderRadius: Math.max(t.radius, 8),
                      background: t.pageBg, color: t.ink, fontSize: 14, outline: 'none', fontFamily: 'inherit',
                    }} />
                </label>
                {/* Why it did not apply, rather than a total that quietly did
                    not move. */}
                {totals?.discountProblem && (
                  <p style={{ margin: 0, fontSize: 12.5, color: '#b91c1c', lineHeight: 1.5 }}>{totals.discountProblem}</p>
                )}

                {/* ── Where it is going, so delivery can be priced ── */}
                {rates.length > 0 && (
                  <label style={{ display: 'grid', gap: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: t.muted }}>Delivering to</span>
                    <input value={country} onChange={e => setCountry(e.target.value.toUpperCase().slice(0, 2))}
                      placeholder="GB" aria-label="Country code"
                      style={{
                        width: '100%', padding: '10px 13px', boxSizing: 'border-box',
                        border: `1px solid ${t.line}`, borderRadius: Math.max(t.radius, 8),
                        background: t.pageBg, color: t.ink, fontSize: 14, outline: 'none', fontFamily: 'inherit',
                      }} />
                  </label>
                )}

                {/* ── The sum, itemised ──
                    Every line is the shop's own arithmetic, asked for rather
                    than worked out here. `buy` recomputes from the same code,
                    so this can only ever agree with what gets charged. */}
                <div style={{ display: 'grid', gap: 5, fontSize: 13.5, color: t.muted }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Items</span><span>{money(totals ? totals.goodsCents : goods, currency)}</span>
                  </div>
                  {!!totals?.discountCents && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0f7b3d' }}>
                      <span>{totals.discountCode}</span><span>−{money(totals.discountCents, currency)}</span>
                    </div>
                  )}
                  {!!totals && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{totals.shippingLabel || 'Delivery'}</span>
                      <span>{totals.shippingCents ? money(totals.shippingCents, currency) : 'Free'}</span>
                    </div>
                  )}
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700,
                  paddingTop: 8, borderTop: `1px solid ${t.line}`,
                  /* Faded while the shop is re-checking, so a number that is
                     about to change does not look settled. */
                  opacity: quoting ? 0.55 : 1,
                }}>
                  <span>Total</span><span>{money(total, currency)}</span>
                </div>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="Where should the receipt go?" aria-label="Your email address"
                  style={{
                    width: '100%', padding: '11px 13px', boxSizing: 'border-box',
                    border: `1px solid ${t.line}`, borderRadius: Math.max(t.radius, 8),
                    background: t.pageBg, color: t.ink, fontSize: 14, outline: 'none', fontFamily: 'inherit',
                  }} />
                <button type="submit" disabled={busy} style={{ ...btn(true), opacity: busy ? 0.7 : 1 }}>
                  {busy ? 'Taking you to checkout…' : <>Checkout <ArrowRight size={15} /></>}
                </button>
                {error && <p style={{ margin: 0, fontSize: 13, color: '#b91c1c', lineHeight: 1.5 }}>{error}</p>}
                <p style={{ margin: 0, fontSize: 11.5, color: t.muted, lineHeight: 1.5, display: 'flex', gap: 5, alignItems: 'flex-start' }}>
                  <Check size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                  Payment is taken on {shop.name}&rsquo;s own processor. This page never sees your card.
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
