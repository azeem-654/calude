/**
 * VAT, sales tax, GST — one rate per country.
 *
 * ── What this is honestly not ──
 *
 * It is not a tax engine. It does not know about US state and city nexus, about
 * which of forty-five states tax delivery, about digital place-of-supply rules,
 * or about EU OSS thresholds. Pretending otherwise would be the worst kind of
 * wrong here, because the failure is silent and slow: quietly under-collecting
 * for a year is a bill with interest on it, and nothing on this screen would
 * ever have prompted a second look.
 *
 * So the panel says so, at the top, where somebody deciding whether to trust it
 * will read it — not in a tooltip.
 *
 * ── Included or added ──
 *
 * The setting that matters most, and the one that differs by hemisphere. A UK
 * shop lists £120 and that £120 *contains* £20 of VAT; a US shop lists $100 and
 * adds tax at the till. Get it backwards and you either overcharge every buyer
 * by the rate or pay it out of your own margin — and both look completely
 * normal on the page. It is asked once, plainly, before any rate.
 */
import { useState } from 'react';
import { AlertTriangle, Check, Globe, Loader, Percent, Plus, Trash2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  bpToPercent, deleteTax, percentToBp, saveTax, saveTaxSettings, type TaxRate,
} from '../../services/commerce';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

const blank = (): Partial<TaxRate> => ({
  name: 'VAT', countries: '', percentBp: 2000, status: 'active',
});

export default function TaxPanel({
  rates, pricesIncludeTax, onChange,
}: {
  rates: TaxRate[];
  pricesIncludeTax: boolean;
  onChange: () => void;
}) {
  const { addNotification } = useApp();
  const [draft, setDraft] = useState<Partial<TaxRate> | null>(null);
  /* The typed percentage is kept as text while the field has focus, so "8."
     on the way to "8.875" does not snap back to "8" under the person's
     cursor. It becomes basis points on save. */
  const [pct, setPct] = useState('20');
  const [busy, setBusy] = useState('');

  const open = (r?: TaxRate) => {
    setDraft(r ?? blank());
    setPct(bpToPercent(r ? r.percentBp : 2000));
  };

  const set = <K extends keyof TaxRate>(k: K, v: TaxRate[K]) =>
    setDraft(r => (r ? { ...r, [k]: v } : r));

  const save = async () => {
    if (!draft) return;
    setBusy('save');
    const r = await saveTax({ ...draft, percentBp: percentToBp(pct) });
    setBusy('');
    if (!r.success) { addNotification(r.error ?? 'Could not save that rate.', 'error'); return; }
    setDraft(null);
    onChange();
  };

  const remove = async (r: TaxRate) => {
    if (!window.confirm(`Delete "${r.name}"? Orders already placed keep the tax they were charged.`)) return;
    setBusy(r.id);
    const res = await deleteTax(r.id);
    setBusy('');
    if (!res.success) { addNotification(res.error ?? 'Could not delete that.', 'error'); return; }
    onChange();
  };

  const setMode = async (included: boolean) => {
    if (included === pricesIncludeTax) return;
    setBusy('mode');
    const r = await saveTaxSettings(included);
    setBusy('');
    if (!r.success) { addNotification(r.error ?? 'Could not save that.', 'error'); return; }
    onChange();
  };

  const live = rates.filter(r => r.status === 'active' && r.percentBp > 0);
  const catchAll = live.some(r => !r.countries.trim());

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 9,
    fontSize: 13.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff',
  };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5 };

  return (
    <section style={{ background: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
        <Percent size={16} color={ACCENT} />
        <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0, flex: 1 }}>Tax</h3>
        {!draft && (
          <button onClick={() => open()} style={smallBtn}><Plus size={12} /> New rate</button>
        )}
      </div>
      <p style={{ fontSize: 13, color: MUTED, margin: '0 0 14px', lineHeight: 1.6 }}>
        One rate per country, applied to the goods after any discount and to the delivery as well.
      </p>

      {/* Said where it will be read, not in a tooltip. */}
      <div style={{
        display: 'flex', gap: 9, alignItems: 'flex-start', padding: '11px 12px', borderRadius: 11,
        background: '#f8fafc', border: `1px solid ${LINE}`, marginBottom: 16,
      }}>
        <AlertTriangle size={15} color="#64748b" style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ margin: 0, fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
          This is a rate per country, not a tax engine. It does not work out US state or city nexus,
          which states tax delivery, digital place-of-supply, or EU OSS thresholds. If your situation
          is more complicated than one rate per country, take advice — under-collecting is a bill with
          interest on it, and nothing here would tell you.
        </p>
      </div>

      {/* The hemisphere question, asked once. */}
      <div style={{ marginBottom: 18 }}>
        <span style={lbl}>Your listed prices</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { on: true, title: 'Already include tax', hint: 'UK and EU. £120 on the page is £120 at the till.' },
            { on: false, title: 'Have tax added at checkout', hint: 'US sales tax, and most B2B pricing.' },
          ].map(o => (
            <button key={String(o.on)} onClick={() => void setMode(o.on)} disabled={busy === 'mode'}
              aria-pressed={pricesIncludeTax === o.on}
              style={{
                flex: '1 1 200px', textAlign: 'left', padding: '11px 13px', borderRadius: 12,
                border: `1.5px solid ${pricesIncludeTax === o.on ? ACCENT : LINE}`,
                background: pricesIncludeTax === o.on ? '#f5f3ff' : '#fff',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: INK }}>{o.title}</span>
              <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 3, lineHeight: 1.5 }}>{o.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* A tax catch-all is the opposite of the delivery one: there, leaving it
          out loses money quietly; here, leaving it in charges buyers in
          countries you have no duty to collect for. */}
      {catchAll && (
        <div style={{
          display: 'flex', gap: 9, alignItems: 'flex-start', padding: '11px 12px', borderRadius: 11,
          background: '#fffbeb', border: '1px solid #fde68a', marginBottom: 14,
        }}>
          <AlertTriangle size={15} color="#b45309" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 12, color: '#78350f', lineHeight: 1.6 }}>
            A rate with no countries taxes every buyer, anywhere. That is right if you only sell at home
            and wrong if you ship worldwide — list the countries you are registered in instead.
          </p>
        </div>
      )}

      {draft && (
        <div style={{ border: `1.5px solid ${ACCENT}`, borderRadius: 14, padding: 16, marginBottom: 14, display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <label><span style={lbl}>What the receipt calls it</span>
              <input style={inp} value={draft.name ?? ''} onChange={e => set('name', e.target.value)}
                placeholder="VAT" /></label>
            <label><span style={lbl}>Countries (blank = everywhere)</span>
              <input style={inp} value={draft.countries ?? ''}
                onChange={e => set('countries', e.target.value.toUpperCase())}
                placeholder="GB, IE" /></label>
            <label><span style={lbl}>Rate</span>
              <input style={inp} inputMode="decimal" value={pct}
                onChange={e => setPct(e.target.value.replace(/[^0-9.]/g, '').slice(0, 7))}
                placeholder="20" />
              <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 4 }}>
                {bpToPercent(percentToBp(pct))}% — decimals are fine, so 8.875 works.
              </span></label>
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

      {rates.length === 0 && !draft ? (
        <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
          No tax is charged. If you are not registered for VAT or sales tax, that is correct and there is
          nothing to do here.
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
                <Globe size={11} /> {r.countries || 'Everywhere'}
              </span>
              <span style={{ flex: 1, minWidth: 70, fontSize: 12.5, color: ACCENT, fontWeight: 700 }}>
                {bpToPercent(r.percentBp)}%
              </span>
              <button onClick={() => open(r)} style={smallBtn}>Edit</button>
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
