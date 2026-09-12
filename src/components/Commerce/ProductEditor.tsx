/**
 * Adding and editing a product.
 *
 * ── The bug this was written to fix ──
 *
 * The whole product form was three inline inputs, and the price field was:
 *
 *     value={String(draft.priceCents ?? '')}
 *     onChange={e => setDraft({ ...draft, priceCents: Number(e.target.value) })}
 *
 * `Number("85.")` is `85`, so the decimal point was deleted the instant it was
 * typed and "85.00" could not be entered at all. Clearing the field gave
 * `Number("")` → `0`, so the box filled itself with a zero; a stray letter gave
 * `NaN`, which rendered as the literal text "NaN". Somebody trying to add a
 * product with a real price found the field fighting them, and reasonably said
 * products could not be added.
 *
 * The rule this file follows everywhere: **the input owns its own text.** What
 * a person typed stays exactly as typed until they leave the field; the number
 * is derived from it when it is needed. A controlled numeric input that reforms
 * its own value on every keystroke can never accept a partially-typed number.
 */
import { useEffect, useRef, useState } from 'react';
import {
  X, Loader, ImagePlus, Trash2, AlertCircle, Package,
} from 'lucide-react';
import { saveProduct, type Product } from '../../services/commerce';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: `1px solid ${LINE}`, borderRadius: 10,
  fontSize: 13.5, color: INK, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 5 };
const hint: React.CSSProperties = { margin: '5px 0 0', fontSize: 11.5, color: MUTED, lineHeight: 1.5 };

/** The largest image worth putting in a row. Roughly 700KB of base64. */
const MAX_IMAGE_BYTES = 520_000;

/**
 * A money field that lets you type money.
 *
 * Holds the raw text and reports the parsed value; refuses nothing while you
 * type, and tidies the display only on blur. `''` means empty, which is a
 * different thing from zero and must not become "0" under the cursor.
 */
function Money({
  label, value, onChange, currency, placeholder, hintText,
}: {
  label: string;
  /** Minor units, or null for empty. */
  value: number | null;
  onChange: (cents: number | null) => void;
  currency: string;
  placeholder?: string;
  hintText?: string;
}) {
  const [text, setText] = useState(() => (value == null ? '' : (value / 100).toFixed(2)));
  const editing = useRef(false);

  /* Follow the model only while the field is not being typed into — otherwise
     a re-render mid-keystroke would snatch the caret back. */
  useEffect(() => {
    if (editing.current) return;
    setText(value == null ? '' : (value / 100).toFixed(2));
  }, [value]);

  const symbol = (() => {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' })
        .formatToParts(0).find(p => p.type === 'currency')?.value ?? '';
    } catch { return ''; }
  })();

  return (
    <div>
      <label style={lbl}>{label}</label>
      <div style={{ position: 'relative' }}>
        {symbol && (
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 13.5, color: MUTED, pointerEvents: 'none' }}>
            {symbol}
          </span>
        )}
        <input
          value={text}
          inputMode="decimal"
          placeholder={placeholder ?? '0.00'}
          onFocus={() => { editing.current = true; }}
          onChange={e => {
            /* Digits, one separator, nothing else. Letters are dropped rather
               than turned into NaN, and a half-typed "85." survives. */
            const raw = e.target.value.replace(/[^\d.,]/g, '').replace(/,/g, '.');
            const parts = raw.split('.');
            const clean = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : raw;
            setText(clean);
            const n = Number(clean);
            onChange(clean.trim() === '' ? null : (Number.isFinite(n) ? Math.round(n * 100) : null));
          }}
          onBlur={() => {
            editing.current = false;
            const n = Number(text);
            if (text.trim() === '') { setText(''); onChange(null); return; }
            if (!Number.isFinite(n)) { setText(''); onChange(null); return; }
            setText(n.toFixed(2));
            onChange(Math.round(n * 100));
          }}
          style={{ ...inp, paddingLeft: symbol ? 11 + symbol.length * 9 : 12 }}
        />
      </div>
      {hintText && <p style={hint}>{hintText}</p>}
    </div>
  );
}

export default function ProductEditor({
  product, currency, projectId, onClose, onSaved,
}: {
  /** null to add a new one. */
  product: Product | null;
  currency: string;
  projectId?: string;
  onClose: () => void;
  onSaved: (products: Product[]) => void;
}) {
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [category, setCategory] = useState(product?.category ?? '');
  const [price, setPrice] = useState<number | null>(product?.priceCents ?? null);
  const [compareAt, setCompareAt] = useState<number | null>(product?.compareAtCents || null);
  const [cost, setCost] = useState<number | null>(product?.costCents || null);
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? '');
  const [trackInventory, setTrackInventory] = useState(!!product?.trackInventory);
  const [inventory, setInventory] = useState(String(product?.inventory ?? 0));
  const [status, setStatus] = useState<Product['status']>(product?.status ?? 'draft');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const pickImage = (file: File) => {
    setError('');
    if (!file.type.startsWith('image/')) { setError('That is not an image.'); return; }
    if (file.size > MAX_IMAGE_BYTES) {
      /* Said with the number, because "too large" without one is a guessing
         game about how much to shrink it by. */
      setError(`That image is ${Math.round(file.size / 1024)}KB. Keep it under ${Math.round(MAX_IMAGE_BYTES / 1024)}KB, or paste a link to it instead.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageUrl(String(reader.result ?? ''));
    reader.onerror = () => setError('That image could not be read.');
    reader.readAsDataURL(file);
  };

  /* What stops the save, said on the button rather than after the press. The
     old form just disabled Save and never explained why. */
  const blocked =
    !name.trim() ? 'Give it a name'
      : price == null ? 'Set a price'
        : status === 'active' && price <= 0 ? 'A price above zero, to sell it'
          : compareAt != null && price != null && compareAt <= price
            ? 'The “was” price has to be higher than the price'
            : '';

  const save = async () => {
    if (blocked) return;
    setBusy(true);
    setError('');
    const r = await saveProduct({
      id: product?.id,
      name: name.trim(),
      description: description.trim(),
      sku: sku.trim(),
      category: category.trim(),
      priceCents: price ?? 0,
      costCents: cost ?? 0,
      compareAtCents: compareAt ?? 0,
      imageUrl,
      trackInventory: trackInventory ? 1 : 0,
      inventory: Math.max(0, Math.round(Number(inventory) || 0)),
      status,
      projectId: product?.projectId ?? projectId ?? '',
    } as Partial<Product>);
    setBusy(false);
    if (!r.success) { setError(r.error ?? 'Could not save that.'); return; }
    onSaved((r.products ?? []) as Product[]);
    onClose();
  };

  const margin = price != null && cost != null && cost > 0 && price > 0
    ? Math.round(((price - cost) / price) * 100)
    : null;

  return (
    <div
      role="dialog" aria-modal="true" aria-label={product ? 'Edit product' : 'New product'}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(12,14,17,0.5)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: 'clamp(12px, 3vw, 24px)', overflowY: 'auto',
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 20, width: '100%', maxWidth: 720,
        marginTop: 'clamp(12px, 3vh, 36px)', marginBottom: 24, overflow: 'hidden',
        boxShadow: '0 26px 64px -14px rgba(12,14,17,0.45)',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Package size={17} color={INK} />
          <h2 style={{ margin: 0, fontSize: 16.5, fontWeight: 800, color: INK, flex: 1 }}>
            {product ? 'Edit product' : 'New product'}
          </h2>
          <button onClick={onClose} aria-label="Close"
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: MUTED, display: 'flex', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 'clamp(16px, 3vw, 20px)', display: 'grid', gap: 16 }}>

          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))' }}>
            {/* ── Picture ── */}
            <div>
              <label style={lbl}>Picture</label>
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) pickImage(f); }}
                style={{
                  border: `1.5px dashed ${LINE}`, borderRadius: 12, cursor: 'pointer',
                  aspectRatio: '4 / 3', display: 'grid', placeItems: 'center',
                  background: '#fafbfc', overflow: 'hidden', position: 'relative',
                }}
              >
                {imageUrl
                  ? <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (
                    <div style={{ textAlign: 'center', color: MUTED, padding: 16 }}>
                      <ImagePlus size={22} />
                      <div style={{ fontSize: 12.5, marginTop: 7, lineHeight: 1.5 }}>Click or drop an image</div>
                    </div>
                  )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" hidden
                onChange={e => { const f = e.target.files?.[0]; if (f) pickImage(f); e.target.value = ''; }} />
              <div style={{ display: 'flex', gap: 7, marginTop: 7, alignItems: 'center' }}>
                <input value={imageUrl.startsWith('data:') ? '' : imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  placeholder="…or paste an image link"
                  style={{ ...inp, fontSize: 12.5, padding: '8px 10px' }} />
                {imageUrl && (
                  <button onClick={() => setImageUrl('')} aria-label="Remove the picture"
                    style={{ border: `1px solid ${LINE}`, background: '#fff', borderRadius: 9, padding: 8, cursor: 'pointer', color: '#dc2626', display: 'flex' }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* ── Name and description ── */}
            <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
              <div>
                <label style={lbl} htmlFor="pr-name">Name</label>
                <input id="pr-name" autoFocus value={name} onChange={e => setName(e.target.value)}
                  placeholder="Bronze cleat, 150mm" style={inp} />
              </div>
              <div>
                <label style={lbl} htmlFor="pr-desc">Description</label>
                <textarea id="pr-desc" value={description} onChange={e => setDescription(e.target.value)} rows={4}
                  placeholder="What it is, what it is for, and anything a buyer would ask before paying."
                  style={{ ...inp, resize: 'vertical', lineHeight: 1.55 }} />
              </div>
            </div>
          </div>

          {/* ── Money ── */}
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))' }}>
            <Money label="Price" value={price} onChange={setPrice} currency={currency} placeholder="85.00" />
            <Money label="Was (optional)" value={compareAt} onChange={setCompareAt} currency={currency}
              placeholder="120.00"
              hintText="Only if it genuinely was." />
            <Money label="What it costs you" value={cost} onChange={setCost} currency={currency} placeholder="32.00"
              hintText={margin != null ? `${margin}% margin` : 'Never shown to buyers.'} />
          </div>

          {/* ── Stock ── */}
          <div style={{ padding: 13, border: `1px solid ${LINE}`, borderRadius: 12, background: '#fafbfc' }}>
            <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="checkbox" checked={trackInventory} onChange={e => setTrackInventory(e.target.checked)}
                style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer' }} />
              <span>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: INK }}>Keep count of stock</span>
                <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 2, lineHeight: 1.5 }}>
                  Leave this off for a service. With it on, the shop shows how many are left and refuses
                  an order for more than that.
                </span>
              </span>
            </label>
            {trackInventory && (
              <div style={{ marginTop: 11, maxWidth: 160 }}>
                <label style={lbl} htmlFor="pr-stock">How many are there?</label>
                <input id="pr-stock" value={inventory} inputMode="numeric"
                  onChange={e => setInventory(e.target.value.replace(/[^\d]/g, ''))}
                  style={inp} />
              </div>
            )}
          </div>

          {/* ── Filing ── */}
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))' }}>
            <div>
              <label style={lbl} htmlFor="pr-cat">Category</label>
              <input id="pr-cat" value={category} onChange={e => setCategory(e.target.value)}
                placeholder="Fittings" style={inp} />
              <p style={hint}>Groups it in the shop. Optional.</p>
            </div>
            <div>
              <label style={lbl} htmlFor="pr-sku">Code / SKU</label>
              <input id="pr-sku" value={sku} onChange={e => setSku(e.target.value)}
                placeholder="BC-150" style={inp} />
            </div>
            <div>
              <label style={lbl}>Is it for sale?</label>
              <div style={{ display: 'flex', gap: 5, padding: 4, borderRadius: 10, background: '#f1f3f6' }}>
                {([['draft', 'Draft'], ['active', 'For sale'], ['archived', 'Archived']] as const).map(([v, label]) => (
                  <button key={v} onClick={() => setStatus(v)}
                    style={{
                      flex: 1, padding: '7px 6px', borderRadius: 7, border: 'none', cursor: 'pointer',
                      background: status === v ? '#fff' : 'transparent',
                      color: status === v ? INK : MUTED,
                      fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                      boxShadow: status === v ? '0 1px 3px rgba(16,24,40,0.1)' : 'none',
                    }}>
                    {label}
                  </button>
                ))}
              </div>
              <p style={hint}>Only “For sale” appears in your shop.</p>
            </div>
          </div>

          {error && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10 }}>
              <AlertCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 12.5, color: '#7f1d1d', lineHeight: 1.55 }}>{error}</p>
            </div>
          )}
        </div>

        <div style={{
          display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
          padding: '14px 20px', borderTop: `1px solid ${LINE}`, background: '#fcfcfd',
        }}>
          <button onClick={onClose} style={{
            padding: '10px 15px', borderRadius: 10, border: `1px solid ${LINE}`,
            background: '#fff', fontSize: 13, fontWeight: 700, color: INK, cursor: 'pointer',
          }}>Cancel</button>
          <span style={{ flex: 1, minWidth: 8 }} />
          {blocked && <span style={{ fontSize: 11.5, color: MUTED }}>{blocked}</span>}
          <button onClick={() => void save()} disabled={busy || !!blocked} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '10px 18px', borderRadius: 10, border: 'none',
            background: busy || blocked ? '#c7c9d3' : INK, color: '#fff',
            fontSize: 13, fontWeight: 700, cursor: busy || blocked ? 'not-allowed' : 'pointer',
          }}>
            {busy && <Loader size={13} className="spin" />} {product ? 'Save changes' : 'Add product'}
          </button>
        </div>
      </div>
    </div>
  );
}
