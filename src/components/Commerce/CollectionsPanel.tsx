/**
 * Groups a shopkeeper sells with.
 *
 * ── Why this is not the category field ──
 *
 * A product's category files it: a candle is in Candles and nowhere else. A
 * collection sells it — "New in", "Under £20", "Gifts for him" — and the same
 * candle belongs in several of those at once, or in none. Folding one into the
 * other would make a shop choose between filing its stock and merchandising
 * it, so both exist and this panel says so rather than leaving somebody to
 * work out why there are two.
 *
 * ── The order is the feature ──
 *
 * The whole point of a hand-built collection is that the shopkeeper decides
 * what sits at the top of it. So membership is a list with an order, not a set
 * of ticks — and it is saved whole, because moving one product changes the
 * position of every product after it.
 */
import { useState } from 'react';
import {
  ArrowDown, ArrowUp, Check, Layers, Loader, Plus, Trash2, X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  deleteCollection, saveCollection, type Collection, type Product,
} from '../../services/commerce';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

const blank = (): Partial<Collection> => ({
  name: '', description: '', productIds: [], status: 'active',
});

export default function CollectionsPanel({
  collections, products, onChange,
}: {
  collections: Collection[];
  products: Product[];
  onChange: () => void;
}) {
  const { addNotification } = useApp();
  const [draft, setDraft] = useState<Partial<Collection> | null>(null);
  const [busy, setBusy] = useState('');

  const held = draft?.productIds ?? [];
  const nameOf = (id: string) => products.find(p => String(p.id) === id)?.name ?? 'A deleted product';

  const set = <K extends keyof Collection>(k: K, v: Collection[K]) =>
    setDraft(c => (c ? { ...c, [k]: v } : c));

  const move = (id: string, by: number) => {
    const next = [...held];
    const at = next.indexOf(id);
    const to = at + by;
    if (at < 0 || to < 0 || to >= next.length) return;
    [next[at], next[to]] = [next[to], next[at]];
    set('productIds', next);
  };

  const save = async () => {
    if (!draft) return;
    setBusy('save');
    const r = await saveCollection(draft);
    setBusy('');
    if (!r.success) { addNotification(r.error ?? 'Could not save that collection.', 'error'); return; }
    setDraft(null);
    onChange();
  };

  const remove = async (c: Collection) => {
    if (!window.confirm(`Delete "${c.name}"? The products in it stay in your catalogue — only the grouping goes.`)) return;
    setBusy(c.id);
    const res = await deleteCollection(c.id);
    setBusy('');
    if (!res.success) { addNotification(res.error ?? 'Could not delete that.', 'error'); return; }
    onChange();
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 9,
    fontSize: 13.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff',
  };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5 };

  return (
    <section style={{ background: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
        <Layers size={16} color={ACCENT} />
        <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0, flex: 1 }}>Collections</h3>
        {!draft && (
          <button onClick={() => setDraft(blank())} style={smallBtn}><Plus size={12} /> New collection</button>
        )}
      </div>
      <p style={{ fontSize: 13, color: MUTED, margin: '0 0 16px', lineHeight: 1.6 }}>
        A product can be in as many as you like — &ldquo;New in&rdquo; and &ldquo;Gifts&rdquo; and
        &ldquo;Under £20&rdquo; all at once. That is what these are for; the category on a product is
        for filing it, and stays as it is.
      </p>

      {draft && (
        <div style={{ border: `1.5px solid ${ACCENT}`, borderRadius: 14, padding: 16, marginBottom: 14, display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <label><span style={lbl}>What buyers see</span>
              <input style={inp} value={draft.name ?? ''} onChange={e => set('name', e.target.value)}
                placeholder="New in" /></label>
            <label><span style={lbl}>A line under the heading (optional)</span>
              <input style={inp} value={draft.description ?? ''} onChange={e => set('description', e.target.value)}
                placeholder="Just landed this week" /></label>
          </div>

          <div>
            <span style={lbl}>What is in it, in the order it shows</span>
            {held.length === 0 ? (
              <p style={{ margin: '0 0 8px', fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
                Nothing yet. An empty collection is not shown on your shop at all, so nobody sees a
                heading with nothing under it.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
                {held.map((id, n) => (
                  <div key={id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    border: `1px solid ${LINE}`, borderRadius: 10, padding: '7px 10px',
                  }}>
                    <span style={{ fontSize: 12, color: MUTED, width: 18 }}>{n + 1}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {nameOf(id)}
                    </span>
                    <button onClick={() => move(id, -1)} disabled={n === 0}
                      style={{ ...iconBtn, opacity: n === 0 ? 0.35 : 1 }} aria-label={`Move ${nameOf(id)} up`}>
                      <ArrowUp size={12} />
                    </button>
                    <button onClick={() => move(id, 1)} disabled={n === held.length - 1}
                      style={{ ...iconBtn, opacity: n === held.length - 1 ? 0.35 : 1 }} aria-label={`Move ${nameOf(id)} down`}>
                      <ArrowDown size={12} />
                    </button>
                    <button onClick={() => set('productIds', held.filter(x => x !== id))}
                      style={{ ...iconBtn, color: '#b42318' }} aria-label={`Take ${nameOf(id)} out`}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {products.filter(p => !held.includes(String(p.id))).slice(0, 60).map(p => (
                <button key={p.id} onClick={() => set('productIds', [...held, String(p.id)])}
                  style={{ ...smallBtn, fontWeight: 600 }}>
                  <Plus size={11} /> {p.name}
                </button>
              ))}
            </div>
          </div>

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

      {collections.length === 0 && !draft ? (
        <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
          None yet. Your shop lists everything in one run and filters by category, which is fine for a
          small range — collections start earning their keep once there is more than a screenful.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {collections.map(c => (
            <div key={c.id} style={{
              display: 'flex', gap: 11, alignItems: 'center', flexWrap: 'wrap',
              border: `1px solid ${LINE}`, borderRadius: 12, padding: '11px 13px',
              opacity: c.status === 'off' ? 0.6 : 1,
            }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{c.name}</span>
              <span style={{ flex: 1, minWidth: 80, fontSize: 12.5, color: c.productIds.length ? MUTED : '#b45309' }}>
                {c.productIds.length
                  ? `${c.productIds.length} ${c.productIds.length === 1 ? 'product' : 'products'}`
                  : 'Empty — not shown on your shop'}
              </span>
              <button onClick={() => setDraft(c)} style={smallBtn}>Edit</button>
              <button onClick={() => void remove(c)} disabled={busy === c.id}
                style={{ ...smallBtn, color: '#b42318' }} aria-label={`Delete ${c.name}`}>
                {busy === c.id ? <Loader size={11} className="spin" /> : <Trash2 size={11} />}
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

const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 24, height: 24, border: `1px solid ${LINE}`, borderRadius: 7,
  background: '#fff', color: INK, cursor: 'pointer', padding: 0, fontFamily: 'inherit',
};
