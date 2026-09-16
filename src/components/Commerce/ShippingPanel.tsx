/**
 * What delivery costs, and where.
 *
 * ── Why these and not live carrier rates ──
 *
 * Live rates need weights, dimensions, a carrier account and a negotiated
 * contract, and getting one wrong charges a real buyer the wrong amount for a
 * real parcel. What is here is what a small shop actually uses: a flat price, a
 * threshold above which it is free, and different numbers for different places.
 *
 * ── The catch-all is the important one ──
 *
 * A rate with no countries applies to everywhere nobody listed. Without one, a
 * buyer in a country the shopkeeper never thought about gets free delivery —
 * which is not a generous shop, it is a shop losing money quietly on exactly
 * the orders that cost the most to send.
 */
import { useState } from 'react';
import { Check, Globe, Loader, Plus, Trash2, Truck, X, AlertTriangle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { deleteShipping, money, saveShipping, type ShippingRate } from '../../services/commerce';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

const blank = (): Partial<ShippingRate> => ({
  name: '', countries: '', kind: 'flat', amountCents: 499, thresholdCents: 0, status: 'active',
});

export default function ShippingPanel({
  rates, currency, onChange,
}: {
  rates: ShippingRate[];
  currency: string;
  onChange: () => void;
}) {
  const { addNotification } = useApp();
  const [draft, setDraft] = useState<Partial<ShippingRate> | null>(null);
  const [busy, setBusy] = useState('');

  const set = <K extends keyof ShippingRate>(k: K, v: ShippingRate[K]) =>
    setDraft(r => (r ? { ...r, [k]: v } : r));

  const save = async () => {
    if (!draft) return;
    setBusy('save');
    const r = await saveShipping(draft);
    setBusy('');
    if (!r.success) { addNotification(r.error ?? 'Could not save that rate.', 'error'); return; }
    setDraft(null);
    onChange();
  };

  const remove = async (r: ShippingRate) => {
    if (!window.confirm(`Delete "${r.name}"? Orders going there will fall to whichever rate covers them next.`)) return;
    setBusy(r.id);
    const res = await deleteShipping(r.id);
    setBusy('');
    if (!res.success) { addNotification(res.error ?? 'Could not delete that.', 'error'); return; }
    onChange();
  };

  const live = rates.filter(r => r.status === 'active');
  const hasCatchAll = live.some(r => !r.countries.trim());

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 9,
    fontSize: 13.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff',
  };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5 };

  const describe = (r: ShippingRate) =>
    r.kind === 'free_over'
      ? `${money(r.amountCents, currency)}, free over ${money(r.thresholdCents, currency)}`
      : money(r.amountCents, currency);

  return (
    <section style={{ background: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
        <Truck size={16} color={ACCENT} />
        <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0, flex: 1 }}>Delivery</h3>
        {!draft && (
          <button onClick={() => setDraft(blank())} style={smallBtn}><Plus size={12} /> New rate</button>
        )}
      </div>
      <p style={{ fontSize: 13, color: MUTED, margin: '0 0 16px', lineHeight: 1.6 }}>
        A rate naming a country beats the catch-all, so &ldquo;{money(300, currency)} in the UK,{' '}
        {money(1200, currency)} everywhere else&rdquo; is two rates.
      </p>

      {/* The one thing worth interrupting about. */}
      {live.length > 0 && !hasCatchAll && (
        <div style={{
          display: 'flex', gap: 9, alignItems: 'flex-start', padding: '11px 12px', borderRadius: 11,
          background: '#fffbeb', border: '1px solid #fde68a', marginBottom: 14,
        }}>
          <AlertTriangle size={15} color="#b45309" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 12, color: '#78350f', lineHeight: 1.6 }}>
            No rate covers the countries you have not listed, so an order from one of them ships free.
            Add a rate and leave the countries box empty to catch everywhere else.
          </p>
        </div>
      )}

      {draft && (
        <div style={{ border: `1.5px solid ${ACCENT}`, borderRadius: 14, padding: 16, marginBottom: 14, display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <label><span style={lbl}>What the buyer sees</span>
              <input style={inp} value={draft.name ?? ''} onChange={e => set('name', e.target.value)}
                placeholder="UK standard" /></label>
            <label><span style={lbl}>Countries (blank = everywhere else)</span>
              <input style={inp} value={draft.countries ?? ''}
                onChange={e => set('countries', e.target.value.toUpperCase())}
                placeholder="GB, IE" /></label>
          </div>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <label><span style={lbl}>Charge (minor units)</span>
              <input style={inp} inputMode="numeric" value={String(draft.amountCents ?? 0)}
                onChange={e => set('amountCents', Math.max(0, Number(e.target.value.replace(/[^0-9]/g, '')) || 0))} />
              <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 4 }}>
                {money(draft.amountCents ?? 0, currency)}
              </span></label>
            <label><span style={lbl}>Rule</span>
              <select style={inp} value={draft.kind}
                onChange={e => set('kind', e.target.value as ShippingRate['kind'])}>
                <option value="flat">Always this price</option>
                <option value="free_over">Free over a total</option>
              </select></label>
          </div>

          {draft.kind === 'free_over' && (
            <label><span style={lbl}>Free once the items come to</span>
              <input style={inp} inputMode="numeric" value={String(draft.thresholdCents ?? 0)}
                onChange={e => set('thresholdCents', Math.max(0, Number(e.target.value.replace(/[^0-9]/g, '')) || 0))} />
              <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>
                {money(draft.thresholdCents ?? 0, currency)} — measured after any discount code, so a
                half-price basket has to clear it on what is actually paid.
              </span></label>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => void save()} disabled={busy === 'save' || !(draft.name ?? '').trim()}
              style={{ ...smallBtn, background: ACCENT, color: '#fff', border: 'none', padding: '9px 16px', fontSize: 13 }}>
              {busy === 'save' ? <Loader size={12} className="spin" /> : <Check size={12} />} Save
            </button>
            <button onClick={() => setDraft(null)} style={{ ...smallBtn, padding: '9px 14px', fontSize: 13 }}>
              <X size={12} /> Cancel
            </button>
          </div>
        </div>
      )}

      {rates.length === 0 && !draft ? (
        <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
          No rates yet, so delivery is free everywhere. That is a real choice — it is just worth making it
          on purpose.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rates.map(r => (
            <div key={r.id} style={{
              display: 'flex', gap: 11, alignItems: 'center', flexWrap: 'wrap',
              border: `1px solid ${LINE}`, borderRadius: 12, padding: '11px 13px',
              opacity: r.status === 'off' ? 0.6 : 1,
            }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{r.name}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: MUTED }}>
                <Globe size={11} /> {r.countries || 'Everywhere else'}
              </span>
              <span style={{ flex: 1, minWidth: 90, fontSize: 12.5, color: ACCENT, fontWeight: 700 }}>
                {describe(r)}
              </span>
              <button onClick={() => setDraft(r)} style={smallBtn}>Edit</button>
              <button onClick={() => void remove(r)} disabled={busy === r.id}
                style={{ ...smallBtn, color: '#b42318' }} aria-label={`Delete ${r.name}`}>
                {busy === r.id ? <Loader size={11} className="spin" /> : <Trash2 size={11} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const smallBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px',
  border: `1px solid ${LINE}`, borderRadius: 8, background: '#fff',
  color: INK, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
