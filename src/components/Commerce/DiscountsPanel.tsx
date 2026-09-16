/**
 * The codes a buyer types at the checkout.
 *
 * ── Why the usage count is read-only here ──
 *
 * Because it is not a setting, it is a fact. It goes up when an order is
 * *paid*, never when a code is typed — otherwise ten abandoned payment pages
 * exhaust a ten-use code and the eleventh person, the one who actually paid,
 * is refused. Editing a code never resets it either: changing the expiry on
 * something used fifty times must not hand out fifty more.
 *
 * ── Why the limits are visible rather than clever ──
 *
 * A discount is the one thing on this screen that gives money away. "20% off,
 * no minimum, no expiry, unlimited uses" is a sentence somebody should have to
 * read before they publish it, so every part of it is a field rather than an
 * advanced panel three clicks down.
 */
import { useState } from 'react';
import { Check, Loader, Percent, Plus, Tag, Trash2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { deleteDiscount, money, saveDiscount, type Discount } from '../../services/commerce';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

const blank = (): Partial<Discount> => ({
  code: '', kind: 'percent', value: 10, minSpendCents: 0,
  startsAt: null, endsAt: null, usageLimit: 0, status: 'active',
});

export default function DiscountsPanel({
  discounts, currency, onChange,
}: {
  discounts: Discount[];
  currency: string;
  onChange: () => void;
}) {
  const { addNotification } = useApp();
  const [draft, setDraft] = useState<Partial<Discount> | null>(null);
  const [busy, setBusy] = useState('');

  const set = <K extends keyof Discount>(k: K, v: Discount[K]) =>
    setDraft(d => (d ? { ...d, [k]: v } : d));

  const save = async () => {
    if (!draft) return;
    setBusy('save');
    const r = await saveDiscount(draft);
    setBusy('');
    if (!r.success) { addNotification(r.error ?? 'Could not save that code.', 'error'); return; }
    addNotification(`${draft.code} is live.`, 'success');
    setDraft(null);
    onChange();
  };

  const remove = async (d: Discount) => {
    if (!window.confirm(`Delete ${d.code}? Anyone typing it at the checkout will be told it is not recognised.`)) return;
    setBusy(d.id);
    const r = await deleteDiscount(d.id);
    setBusy('');
    if (!r.success) { addNotification(r.error ?? 'Could not delete that.', 'error'); return; }
    onChange();
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 9,
    fontSize: 13.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff',
  };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5 };

  /** What a code takes off, in the words the shopkeeper set it in. */
  const describe = (d: Discount) =>
    d.kind === 'percent' ? `${d.value}% off` : `${money(d.value, currency)} off`;

  return (
    <section style={{ background: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
        <Tag size={16} color={ACCENT} />
        <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0, flex: 1 }}>Discount codes</h3>
        {!draft && (
          <button onClick={() => setDraft(blank())} style={smallBtn}>
            <Plus size={12} /> New code
          </button>
        )}
      </div>
      <p style={{ fontSize: 13, color: MUTED, margin: '0 0 16px', lineHeight: 1.6 }}>
        Typed at the checkout, and taken off the items — never off the delivery. Your email campaigns can
        carry one.
      </p>

      {draft && (
        <div style={{ border: `1.5px solid ${ACCENT}`, borderRadius: 14, padding: 16, marginBottom: 14, display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <label><span style={lbl}>Code</span>
              <input style={{ ...inp, letterSpacing: '0.06em', fontWeight: 700 }} value={draft.code ?? ''}
                onChange={e => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                placeholder="SPRING20" /></label>

            <label><span style={lbl}>Takes off</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <input style={{ ...inp, flex: 1 }} inputMode="numeric" value={String(draft.value ?? '')}
                  onChange={e => set('value', Math.max(0, Number(e.target.value.replace(/[^0-9]/g, '')) || 0))} />
                <select style={{ ...inp, width: 'auto' }} value={draft.kind}
                  onChange={e => set('kind', e.target.value as Discount['kind'])}>
                  <option value="percent">%</option>
                  <option value="fixed">{currency}</option>
                </select>
              </div>
              {draft.kind === 'fixed' && (
                <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 4 }}>
                  In minor units — 500 is {money(500, currency)}.
                </span>
              )}
            </label>
          </div>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <label><span style={lbl}>Minimum basket (0 = none)</span>
              <input style={inp} inputMode="numeric" value={String(draft.minSpendCents ?? 0)}
                onChange={e => set('minSpendCents', Math.max(0, Number(e.target.value.replace(/[^0-9]/g, '')) || 0))} /></label>
            <label><span style={lbl}>Times it may be used (0 = unlimited)</span>
              <input style={inp} inputMode="numeric" value={String(draft.usageLimit ?? 0)}
                onChange={e => set('usageLimit', Math.max(0, Number(e.target.value.replace(/[^0-9]/g, '')) || 0))} /></label>
          </div>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <label><span style={lbl}>Live from (optional)</span>
              <input style={inp} type="date" value={(draft.startsAt ?? '').slice(0, 10)}
                onChange={e => set('startsAt', e.target.value || null)} /></label>
            <label><span style={lbl}>Until (optional)</span>
              <input style={inp} type="date" value={(draft.endsAt ?? '').slice(0, 10)}
                onChange={e => set('endsAt', e.target.value || null)} /></label>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => void save()} disabled={busy === 'save' || !((draft.code ?? '').length >= 3)}
              style={{ ...smallBtn, background: ACCENT, color: '#fff', border: 'none', padding: '9px 16px', fontSize: 13 }}>
              {busy === 'save' ? <Loader size={12} className="spin" /> : <Check size={12} />} Save
            </button>
            <button onClick={() => setDraft(null)} style={{ ...smallBtn, padding: '9px 14px', fontSize: 13 }}>
              <X size={12} /> Cancel
            </button>
          </div>
        </div>
      )}

      {discounts.length === 0 && !draft ? (
        <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
          No codes yet. One is usually enough to start — a single code you can put in an email and see
          come back.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {discounts.map(d => {
            const spent = d.usageLimit > 0 && d.usedCount >= d.usageLimit;
            return (
              <div key={d.id} style={{
                display: 'flex', gap: 11, alignItems: 'center', flexWrap: 'wrap',
                border: `1px solid ${LINE}`, borderRadius: 12, padding: '11px 13px',
                opacity: d.status === 'off' || spent ? 0.6 : 1,
              }}>
                <span style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 13.5, fontWeight: 800, color: INK, letterSpacing: '0.04em',
                }}>{d.code}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: ACCENT, fontWeight: 700 }}>
                  <Percent size={11} /> {describe(d)}
                </span>
                <span style={{ flex: 1, minWidth: 100, fontSize: 11.5, color: MUTED }}>
                  {d.minSpendCents > 0 && `Over ${money(d.minSpendCents, currency)} · `}
                  {/* The fact, not a setting. See the note at the top. */}
                  {d.usageLimit > 0 ? `${d.usedCount} of ${d.usageLimit} used` : `${d.usedCount} used`}
                  {d.endsAt && ` · until ${d.endsAt.slice(0, 10)}`}
                  {spent && ' · all used up'}
                  {d.status === 'off' && ' · switched off'}
                </span>
                <button onClick={() => setDraft(d)} style={smallBtn}>Edit</button>
                <button onClick={() => void remove(d)} disabled={busy === d.id}
                  style={{ ...smallBtn, color: '#b42318' }} aria-label={`Delete ${d.code}`}>
                  {busy === d.id ? <Loader size={11} className="spin" /> : <Trash2 size={11} />}
                </button>
              </div>
            );
          })}
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
