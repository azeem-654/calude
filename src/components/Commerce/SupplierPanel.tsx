/**
 * Connecting Printful, and bringing across what they already make.
 *
 * ── What this deliberately does not do ──
 *
 * It does not browse Printful's catalogue and build a shop. Choosing what to
 * sell and what to charge for it *is* the business; a screen that picked for
 * them would be choosing a business at random and calling it automation.
 *
 * Import brings in products the customer has already set up in Printful, as
 * drafts, so nothing goes on sale because a button was pressed.
 */
import { useEffect, useState } from 'react';
import { Truck, Check, Download, AlertTriangle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  fetchSupplier, saveSupplier, testSupplier, disconnectSupplier, importProducts,
  EMPTY_SUPPLIER, type SupplierState,
} from '../../services/supplier';
import type { Diagnosis } from '../../services/storefront';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, overflow: 'hidden' };
/* Wraps rather than squeezing the title: at 390px the buttons took the row
   and left "Who makes and posts it" four characters wide. */
const head: React.CSSProperties = { padding: '13px 15px', borderBottom: `1px solid ${LINE}`, background: '#fafbfc', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 9, fontSize: 13, color: INK, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 };
const btn = (primary = false): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 15px', borderRadius: 9,
  border: primary ? 'none' : `1px solid ${LINE}`, background: primary ? INK : '#fff',
  color: primary ? '#fff' : INK, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
});

function Steps({ d }: { d: Diagnosis }) {
  return (
    <div style={{ padding: '11px 13px', border: '1px solid #f5c6c6', background: '#fdf3f3', borderRadius: 10, display: 'grid', gap: 7 }}>
      <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
        <AlertTriangle size={14} color="#b42318" style={{ flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#b42318' }}>{d.summary}</span>
      </div>
      <ol style={{ margin: 0, paddingLeft: 26, display: 'grid', gap: 5 }}>
        {d.steps.map((s, i) => <li key={i} style={{ fontSize: 12.5, color: '#5b3a3a', lineHeight: 1.55 }}>{s}</li>)}
      </ol>
    </div>
  );
}

export default function SupplierPanel({ onChange }: { onChange?: () => void }) {
  const { addNotification } = useApp();
  const [state, setState] = useState<SupplierState>(EMPTY_SUPPLIER);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [tok, setTok] = useState('');
  const [storeId, setStoreId] = useState('');
  const [skipped, setSkipped] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await fetchSupplier();
      if (!live || !r.supplier) return;
      setState(r.supplier);
      setStoreId(r.supplier.storeId);
      setOpen(!r.supplier.connected);
    })();
    return () => { live = false; };
  }, []);

  const apply = (r: { supplier?: SupplierState }) => {
    if (r.supplier) { setState(r.supplier); setStoreId(r.supplier.storeId); }
  };

  const save = async () => {
    setBusy(true); setDiag(null);
    const r = await saveSupplier(tok, storeId);
    setBusy(false);
    if (!r.success) { addNotification(r.error ?? 'Could not save that.', 'error'); return; }
    setTok('');
    apply(r);
    addNotification('Saved. Test it to confirm Printful accepts the token.', 'success');
  };

  const test = async () => {
    setBusy(true); setDiag(null);
    const r = await testSupplier();
    setBusy(false);
    apply(r);
    if (!r.success) { setDiag(r.diagnosis ?? { summary: r.error ?? 'Printful refused that token.', steps: [] }); return; }
    if (r.needsStoreId) {
      addNotification(`The token works but sees ${r.stores?.length} stores — put the store id in so imports come from the right one.`, 'info');
      return;
    }
    addNotification(`Connected to ${r.stores?.[0]?.name || 'your Printful store'}.`, 'success');
  };

  const doImport = async () => {
    setBusy(true); setDiag(null); setSkipped([]);
    const r = await importProducts();
    setBusy(false);
    if (!r.success) { setDiag(r.diagnosis ?? { summary: r.error ?? 'Could not import.', steps: [] }); return; }
    setSkipped(r.skipped ?? []);
    onChange?.();
    addNotification(r.note ?? `${r.added ?? 0} imported, ${r.updated ?? 0} refreshed.`, 'success');
  };

  const disconnect = async () => {
    setBusy(true);
    const r = await disconnectSupplier();
    setBusy(false);
    setDiag(null); setOpen(true);
    apply(r);
    addNotification('Printful disconnected. Products already imported are left alone.', 'success');
  };

  const ready = state.connected && !!state.verifiedAt;

  return (
    <div style={card}>
      <div style={head}>
        <Truck size={15} color={INK} />
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: INK }}>Who makes and posts it</h3>
        {ready && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#0f7b3d', background: '#e8f6ee', padding: '3px 9px', borderRadius: 999 }}>
            <Check size={11} /> Printful
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
          {ready && (
            <button onClick={() => void doImport()} disabled={busy} style={btn()}>
              <Download size={13} /> Import products
            </button>
          )}
          <button onClick={() => setOpen(o => !o)} style={btn()}>
            {open ? 'Hide' : state.connected ? 'Change' : 'Connect Printful'}
          </button>
        </div>
      </div>

      <div style={{ padding: 15, display: 'grid', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: MUTED, lineHeight: 1.65 }}>
          Sell without holding any stock: Printful prints and posts each order as it comes in, on{' '}
          <strong style={{ color: INK }}>your own Printful account</strong>. Set your products up there, import them
          here, and a paid order can be sent to be made.
        </p>

        {state.connected && !state.verifiedAt && (
          <p style={{ margin: 0, padding: '10px 12px', borderRadius: 10, background: '#fff7e6', color: '#7a4d00', fontSize: 12.5, lineHeight: 1.6 }}>
            A token is saved but has not been tested since it changed. Press Test before importing anything.
          </p>
        )}
        {diag && <Steps d={diag} />}
        {skipped.length > 0 && (
          <div style={{ padding: '10px 12px', borderRadius: 10, background: '#fff7e6', color: '#7a4d00', fontSize: 12.5, lineHeight: 1.6 }}>
            Left out, and why:
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {skipped.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}

        {open && (
          <div style={{ display: 'grid', gap: 11, padding: 13, border: `1px solid ${LINE}`, borderRadius: 12, background: '#f7f8fa' }}>
            <div>
              <label style={lbl}>Printful private token</label>
              <input
                value={tok} onChange={e => setTok(e.target.value)} type="password" autoComplete="off"
                placeholder={state.connected ? 'Leave blank to keep the one you have' : 'Paste the token'}
                style={inp}
              />
              <p style={{ margin: '5px 0 0', fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
                Printful → Settings → Developers → add a private token with the Orders and Sync Products scopes.
                It is shown once.
              </p>
            </div>
            <div>
              <label style={lbl}>Store ID <span style={{ fontWeight: 500, color: MUTED }}>— only if the token sees more than one</span></label>
              <input value={storeId} onChange={e => setStoreId(e.target.value)} placeholder="e.g. 1234567" style={inp} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => void save()} disabled={busy} style={btn(true)}>Save</button>
              <button onClick={() => void test()} disabled={busy || !state.connected} style={btn()}>Test</button>
              {state.connected && (
                <button onClick={() => void disconnect()} disabled={busy} style={{ ...btn(), marginLeft: 'auto', color: '#b42318' }}>
                  Disconnect
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
