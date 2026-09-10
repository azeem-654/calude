/**
 * The processor this app is paid through — the operator's own, not a
 * customer's.
 *
 * ── Why this is a separate screen from "Getting paid" ──
 *
 * There are two pots of money in this product and confusing them is expensive.
 * Sell → Getting paid is a *customer* connecting the account their buyers pay
 * into. This is the operator connecting the account their subscribers pay into.
 * They are different keys and different money, so they are different screens,
 * and each says whose it is in its first line.
 *
 * Only the install owner sees this: connecting the install's processor decides
 * who gets paid for everybody.
 */
import { useEffect, useState } from 'react';
import { Landmark, Check, AlertTriangle, Copy } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  fetchOperatorBilling, connectOperatorBilling, testOperatorBilling, disconnectOperatorBilling,
  EMPTY_OPERATOR_BILLING, type OperatorBilling,
} from '../../services/operatorBilling';
import type { Diagnosis } from '../../services/storefront';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 9, fontSize: 13, color: INK, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 };
const btn = (primary = false): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 15px', borderRadius: 9,
  border: primary ? 'none' : `1px solid ${LINE}`, background: primary ? INK : '#fff',
  color: primary ? '#fff' : INK, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
});

export default function OperatorPayments() {
  const { addNotification } = useApp();
  const [state, setState] = useState<OperatorBilling>(EMPTY_OPERATOR_BILLING);
  const [pick, setPick] = useState('creem');
  const [key, setKey] = useState('');
  const [whsec, setWhsec] = useState('');
  const [busy, setBusy] = useState(false);
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [denied, setDenied] = useState(false);

  const load = async () => {
    const r = await fetchOperatorBilling();
    if (r.billing) {
      setState(r.billing);
      if (r.billing.provider) setPick(r.billing.provider);
    }
  };
  useEffect(() => { void load(); }, []);

  const apply = (r: { billing?: OperatorBilling }) => { if (r.billing) setState(r.billing); };

  const save = async () => {
    setBusy(true); setDiag(null);
    const r = await connectOperatorBilling(pick, key, whsec);
    setBusy(false);
    if (!r.success) {
      /* Said once, plainly: a sub-account seeing "not authorised" here should
         understand it is not their setting to change, not that it is broken. */
      if ((r.error ?? '').includes('install owner')) setDenied(true);
      addNotification(r.error ?? 'Could not save that.', 'error');
      return;
    }
    setKey(''); setWhsec('');
    apply(r);
    addNotification('Saved. Test it to confirm the processor accepts the key.', 'success');
  };

  const test = async () => {
    setBusy(true); setDiag(null);
    const r = await testOperatorBilling();
    setBusy(false);
    apply(r);
    if (!r.success) { setDiag(r.diagnosis ?? { summary: r.error ?? 'That key was refused.', steps: [] }); return; }
    addNotification(`Connected to ${r.account?.name || 'your account'} (${r.account?.mode} mode).`, 'success');
  };

  const disconnect = async () => {
    setBusy(true);
    const r = await disconnectOperatorBilling();
    setBusy(false);
    apply(r); setDiag(null);
    addNotification('Disconnected. Nobody can be charged for a subscription until you connect one again.', 'success');
  };

  const chosen = state.choices.find(c => c.id === pick)
    ?? { id: pick, label: pick === 'creem' ? 'Creem' : 'Stripe', currencies: [], keyHint: '' };

  if (denied) {
    return (
      <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 20 }}>
        <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.65 }}>
          Only the install owner can change how this app is paid. Your own storefront — the account
          <em> your </em> buyers pay into — is under <strong style={{ color: INK }}>Sell → Getting paid</strong>.
        </p>
      </div>
    );
  }

  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ padding: '13px 15px', borderBottom: `1px solid ${LINE}`, background: '#fafbfc', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Landmark size={15} color={INK} />
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: INK }}>How this app is paid</h3>
        {state.connected && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#0f7b3d', background: '#e8f6ee', padding: '3px 9px', borderRadius: 999 }}>
            <Check size={11} /> {state.providerLabel}{state.mode === 'live' ? '' : ' · test mode'}
          </span>
        )}
      </div>

      <div style={{ padding: 15, display: 'grid', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: MUTED, lineHeight: 1.65 }}>
          The account <strong style={{ color: INK }}>your subscribers pay you</strong> through. This is not the same as
          Sell → Getting paid, which is where a customer connects the account <em>their</em> buyers pay into.
        </p>

        {state.usingDeploymentSecret && (
          <p style={{ margin: 0, padding: '10px 12px', borderRadius: 10, background: '#fff7e6', color: '#7a4d00', fontSize: 12.5, lineHeight: 1.6 }}>
            Currently billing through the Stripe key set on the deployment itself. That works, but nobody chose it
            here — connect a processor below and it takes over.
          </p>
        )}
        {state.connected && state.status === 'failed' && state.lastError && (
          <p style={{ margin: 0, padding: '10px 12px', borderRadius: 10, background: '#fdf3f3', color: '#b42318', fontSize: 12.5, lineHeight: 1.6 }}>
            Last test failed: {state.lastError}
          </p>
        )}
        {state.connected && !state.webhookSet && (
          <p style={{ margin: 0, padding: '10px 12px', borderRadius: 10, background: '#fff7e6', color: '#7a4d00', fontSize: 12.5, lineHeight: 1.6 }}>
            No signing secret yet, so a subscription that is paid will not mark itself active here.
          </p>
        )}
        {diag && (
          <div style={{ padding: '11px 13px', border: '1px solid #f5c6c6', background: '#fdf3f3', borderRadius: 10, display: 'grid', gap: 7 }}>
            <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
              <AlertTriangle size={14} color="#b42318" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#b42318' }}>{diag.summary}</span>
            </div>
            <ol style={{ margin: 0, paddingLeft: 26, display: 'grid', gap: 5 }}>
              {diag.steps.map((s, i) => <li key={i} style={{ fontSize: 12.5, color: '#5b3a3a', lineHeight: 1.55 }}>{s}</li>)}
            </ol>
          </div>
        )}

        <div>
          <label style={lbl}>Payment processor</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(state.choices.length ? state.choices : [{ id: 'stripe', label: 'Stripe', currencies: [], keyHint: '' }, { id: 'creem', label: 'Creem', currencies: ['USD', 'EUR'], keyHint: '' }]).map(c => (
              <button key={c.id} onClick={() => setPick(c.id)} aria-pressed={pick === c.id}
                style={{
                  flex: '1 1 140px', textAlign: 'left', padding: '10px 13px', borderRadius: 11, cursor: 'pointer',
                  border: pick === c.id ? `1.5px solid ${INK}` : `1.5px solid ${LINE}`,
                  background: pick === c.id ? '#fff' : 'rgba(255,255,255,0.6)',
                }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: INK }}>{c.label}</span>
                <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 2 }}>
                  {c.currencies.length ? c.currencies.join(' / ') + ' only' : 'most currencies'}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={lbl}>{chosen.label} secret key</label>
          <input value={key} onChange={e => setKey(e.target.value)} type="password" autoComplete="off"
            placeholder={state.connected && state.provider === pick ? 'Leave blank to keep the one you have' : (pick === 'creem' ? 'creem_live_… or creem_test_…' : 'sk_live_… or sk_test_…')}
            style={inp} />
          <p style={{ margin: '5px 0 0', fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>{chosen.keyHint}</p>
        </div>

        <div>
          <label style={lbl}>Endpoint signing secret</label>
          <input value={whsec} onChange={e => setWhsec(e.target.value)} type="password" autoComplete="off"
            placeholder={state.webhookSet ? 'Leave blank to keep the one you have' : 'The value the processor shows once'}
            style={inp} />
        </div>

        {state.webhookUrl && (
          <div>
            <label style={lbl}>The address to give {chosen.label}</label>
            <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
              <input readOnly value={state.webhookUrl} onFocus={e => e.currentTarget.select()} style={{ ...inp, fontSize: 12 }} />
              <button onClick={() => void navigator.clipboard?.writeText(state.webhookUrl)
                .then(() => addNotification('Address copied.', 'success'))
                .catch(() => addNotification('Could not copy — select it and copy by hand.', 'error'))}
                style={btn()}><Copy size={13} /> Copy</button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => void save()} disabled={busy} style={btn(true)}>Save</button>
          <button onClick={() => void test()} disabled={busy || !state.connected} style={btn()}>Test</button>
          {state.connected && !state.usingDeploymentSecret && (
            <button onClick={() => void disconnect()} disabled={busy} style={{ ...btn(), marginLeft: 'auto', color: '#b42318' }}>
              Disconnect
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
