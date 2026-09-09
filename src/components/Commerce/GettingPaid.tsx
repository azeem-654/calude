/**
 * Connecting the Stripe account the money actually lands in.
 *
 * ── Whose account, and why the screen says so out loud ──
 *
 * This app already charges cards — for its own subscriptions, on the
 * operator's Stripe key. A customer seeing "Stripe" in two places will assume
 * one is the other, and the consequence of that assumption is their trading
 * revenue arriving in somebody else's balance. So this card names whose account
 * it is talking about in the first line, before asking for anything.
 *
 * The key is written and never read back. There is no masked value here to
 * re-display, so a connected account shows as connected and nothing more.
 */
import { useEffect, useState } from 'react';
import { CreditCard, Check, Loader, Copy, AlertTriangle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  fetchStorefront, saveStorefront, testStorefront, disconnectStorefront,
  EMPTY_STOREFRONT, type StorefrontState, type Diagnosis,
} from '../../services/storefront';

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

/** The remediation list, shown whole. A truncated fix is not a fix. */
function Steps({ d }: { d: Diagnosis }) {
  return (
    <div style={{ padding: '11px 13px', border: '1px solid #f5c6c6', background: '#fdf3f3', borderRadius: 10, display: 'grid', gap: 7 }}>
      <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
        <AlertTriangle size={14} color="#b42318" style={{ flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#b42318' }}>{d.summary}</span>
      </div>
      <ol style={{ margin: 0, paddingLeft: 26, display: 'grid', gap: 5 }}>
        {d.steps.map((s, i) => (
          <li key={i} style={{ fontSize: 12.5, color: '#5b3a3a', lineHeight: 1.55 }}>{s}</li>
        ))}
      </ol>
    </div>
  );
}

export default function GettingPaid({ onChange }: { onChange?: () => void }) {
  const { addNotification } = useApp();
  const [state, setState] = useState<StorefrontState>(EMPTY_STOREFRONT);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [diag, setDiag] = useState<Diagnosis | null>(null);

  const [key, setKey] = useState('');
  const [whsec, setWhsec] = useState('');
  const [successUrl, setSuccessUrl] = useState('');
  const [cancelUrl, setCancelUrl] = useState('');

  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await fetchStorefront();
      if (!live || !r.storefront) return;
      setState(r.storefront);
      setSuccessUrl(r.storefront.successUrl);
      setCancelUrl(r.storefront.cancelUrl);
      /* Opened for somebody who has nothing connected — the form is the point
         of the card until it is done, and closed again once it is. */
      setOpen(!r.storefront.connected);
    })();
    return () => { live = false; };
  }, []);

  const apply = (r: { storefront?: StorefrontState }) => {
    if (r.storefront) {
      setState(r.storefront);
      setSuccessUrl(r.storefront.successUrl);
      setCancelUrl(r.storefront.cancelUrl);
    }
    onChange?.();
  };

  const save = async () => {
    setBusy(true); setDiag(null);
    const r = await saveStorefront({ stripeKey: key, webhookSecret: whsec, successUrl, cancelUrl });
    setBusy(false);
    if (!r.success) { addNotification(r.error ?? 'Could not save that.', 'error'); return; }
    /* Cleared from the form as soon as it is stored. Leaving a live secret key
       sitting in an input is how it ends up in a screenshot. */
    setKey(''); setWhsec('');
    apply(r);
    addNotification('Saved. Test it to confirm Stripe accepts the key.', 'success');
  };

  const test = async () => {
    setBusy(true); setDiag(null);
    const r = await testStorefront();
    setBusy(false);
    apply(r);
    if (!r.success) {
      setDiag(r.diagnosis ?? { summary: r.error ?? 'Stripe refused that key.', steps: [] });
      return;
    }
    if (r.account && !r.account.chargesEnabled) {
      addNotification('The key works, but this Stripe account cannot take payments yet — finish activation in Stripe.', 'info');
      return;
    }
    addNotification(`Connected to ${r.account?.name || 'your Stripe account'} (${r.account?.mode} mode).`, 'success');
  };

  const disconnect = async () => {
    setBusy(true);
    const r = await disconnectStorefront();
    setBusy(false);
    setDiag(null); setOpen(true);
    apply(r);
    addNotification('Stripe disconnected. Nothing else changed — your orders are untouched.', 'success');
  };

  const copyHook = () => {
    void navigator.clipboard?.writeText(state.webhookUrl)
      .then(() => addNotification('Address copied.', 'success'))
      .catch(() => addNotification('Could not copy — select the address and copy it by hand.', 'error'));
  };

  const ready = state.connected && !!state.verifiedAt;

  return (
    <div style={card}>
      <div style={head}>
        <CreditCard size={15} color={INK} />
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: INK }}>Getting paid</h3>
        {ready && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#0f7b3d', background: '#e8f6ee', padding: '3px 9px', borderRadius: 999 }}>
            <Check size={11} /> {state.mode === 'live' ? 'Live' : 'Test mode'}
          </span>
        )}
        <button onClick={() => setOpen(o => !o)} style={{ ...btn(), marginLeft: 'auto' }}>
          {open ? 'Hide' : state.connected ? 'Change' : 'Connect Stripe'}
        </button>
      </div>

      <div style={{ padding: 15, display: 'grid', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: MUTED, lineHeight: 1.65 }}>
          Buyers pay into <strong style={{ color: INK }}>your own Stripe account</strong>, not ours — connect it below and
          every order you record gets a payment link you can send. This is separate from the card you pay for
          Protected Central with.
        </p>

        {state.connected && !state.verifiedAt && (
          <p style={{ margin: 0, padding: '10px 12px', borderRadius: 10, background: '#fff7e6', color: '#7a4d00', fontSize: 12.5, lineHeight: 1.6 }}>
            A key is saved but has not been tested since it changed. Press Test before you send anybody a payment link.
          </p>
        )}
        {state.connected && !state.webhookSet && (
          <p style={{ margin: 0, padding: '10px 12px', borderRadius: 10, background: '#fff7e6', color: '#7a4d00', fontSize: 12.5, lineHeight: 1.6 }}>
            No signing secret yet, so orders will not mark themselves paid — you would have to set each one by hand.
            Add the endpoint below in Stripe and paste the <code>whsec_</code> value it shows you.
          </p>
        )}
        {diag && <Steps d={diag} />}

        {open && (
          <div style={{ display: 'grid', gap: 11, padding: 13, border: `1px solid ${LINE}`, borderRadius: 12, background: '#f7f8fa' }}>
            <div>
              <label style={lbl}>Stripe secret key</label>
              <input
                value={key} onChange={e => setKey(e.target.value)} type="password" autoComplete="off"
                placeholder={state.connected ? 'Leave blank to keep the one you have' : 'sk_live_… or sk_test_…'}
                style={inp}
              />
              <p style={{ margin: '5px 0 0', fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
                Stripe → Developers → API keys → Secret key. Not the one starting <code>pk_</code>, which cannot take money.
              </p>
            </div>

            <div>
              <label style={lbl}>Endpoint signing secret</label>
              <input
                value={whsec} onChange={e => setWhsec(e.target.value)} type="password" autoComplete="off"
                placeholder={state.webhookSet ? 'Leave blank to keep the one you have' : 'whsec_…'}
                style={inp}
              />
              <p style={{ margin: '5px 0 0', fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
                In Stripe → Developers → Webhooks, add an endpoint for the address below, listening for
                {' '}<code>checkout.session.completed</code>. Stripe shows the signing secret once.
              </p>
            </div>

            {state.webhookUrl && (
              <div>
                <label style={lbl}>The address to give Stripe</label>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                  <input readOnly value={state.webhookUrl} onFocus={e => e.currentTarget.select()} style={{ ...inp, background: '#fff', fontSize: 12 }} />
                  <button onClick={copyHook} style={btn()}><Copy size={13} /> Copy</button>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lbl}>After they pay, send them to</label>
                <input value={successUrl} onChange={e => setSuccessUrl(e.target.value)} placeholder="https://yoursite.com/thank-you" style={inp} />
              </div>
              <div>
                <label style={lbl}>If they cancel, send them to</label>
                <input value={cancelUrl} onChange={e => setCancelUrl(e.target.value)} placeholder="https://yoursite.com/shop" style={inp} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => void save()} disabled={busy} style={btn(true)}>
                {busy ? <Loader size={13} className="spin" /> : null} Save
              </button>
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
