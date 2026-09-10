/**
 * Connecting the account the money actually lands in.
 *
 * ── Whose account, and why the screen says so out loud ──
 *
 * This app charges its own subscribers too, on the operator's processor. A
 * customer seeing the same brand name in two places will assume one is the
 * other, and the consequence of that assumption is their trading revenue
 * arriving in somebody else's balance. So this card names whose account it is
 * talking about in the first line, before asking for anything.
 *
 * ── Two processors that are not interchangeable ──
 *
 * Stripe is a gateway: it charges a card, in most currencies. Creem is a
 * merchant of record: it sells the thing for you and handles the tax, in
 * dollars or euros only. The picker does not pretend they are the same — it
 * shows what each takes, and warns *before* a buyer meets a checkout that the
 * workspace's currency is one the chosen processor will refuse.
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
  /* Which processor the form is offering to connect. Starts at whatever the
     workspace already uses, so opening the card changes nothing. */
  const [pick, setPick] = useState('stripe');
  const [successUrl, setSuccessUrl] = useState('');
  const [cancelUrl, setCancelUrl] = useState('');
  const [currency, setCurrency] = useState('USD');

  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await fetchStorefront();
      if (!live || !r.storefront) return;
      setState(r.storefront);
      setSuccessUrl(r.storefront.successUrl);
      setCancelUrl(r.storefront.cancelUrl);
      setPick(r.storefront.provider);
      setCurrency(r.storefront.currency);
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
      setPick(r.storefront.provider);
      setCurrency(r.storefront.currency);
    }
    onChange?.();
  };

  const save = async () => {
    setBusy(true); setDiag(null);
    const r = await saveStorefront({ provider: pick, apiKey: key, webhookSecret: whsec, successUrl, cancelUrl, currency });
    setBusy(false);
    if (!r.success) { addNotification(r.error ?? 'Could not save that.', 'error'); return; }
    /* Cleared from the form as soon as it is stored. Leaving a live secret key
       sitting in an input is how it ends up in a screenshot. */
    setKey(''); setWhsec('');
    apply(r);
    addNotification(`Saved. Test it to confirm ${chosen?.label ?? 'the processor'} accepts the key.`, 'success');
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
    addNotification(`Connected to ${r.account?.name || 'your account'} (${r.account?.mode} mode).`, 'success');
  };

  const disconnect = async () => {
    setBusy(true);
    const r = await disconnectStorefront();
    setBusy(false);
    setDiag(null); setOpen(true);
    apply(r);
    addNotification(`${state.providerLabel} disconnected. Nothing else changed — your orders are untouched.`, 'success');
  };

  const copyHook = () => {
    void navigator.clipboard?.writeText(state.webhookUrl)
      .then(() => addNotification('Address copied.', 'success'))
      .catch(() => addNotification('Could not copy — select the address and copy it by hand.', 'error'));
  };

  const chosen = state.choices.find(c => c.id === pick)
    ?? { id: pick, label: pick === 'creem' ? 'Creem' : 'Stripe', currencies: [], keyHint: '' };
  /* Changing processor is not a settings tweak: the stored key stops being
     usable, so the form says so before Save rather than after. */
  const switching = state.connected && pick !== state.provider;
  const ready = state.connected && !!state.verifiedAt;

  return (
    <div style={card}>
      <div style={head}>
        <CreditCard size={15} color={INK} />
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: INK }}>Getting paid</h3>
        {ready && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#0f7b3d', background: '#e8f6ee', padding: '3px 9px', borderRadius: 999 }}>
            <Check size={11} /> {state.providerLabel}{state.mode === 'live' ? '' : ' · test mode'}
          </span>
        )}
        <button onClick={() => setOpen(o => !o)} style={{ ...btn(), marginLeft: 'auto' }}>
          {open ? 'Hide' : state.connected ? 'Change' : 'Connect a processor'}
        </button>
      </div>

      <div style={{ padding: 15, display: 'grid', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: MUTED, lineHeight: 1.65 }}>
          Buyers pay into <strong style={{ color: INK }}>your own account</strong>, not ours — connect Stripe or Creem
          below and every order you record gets a payment link you can send. This is separate from the card you pay
          for Protected Central with.
        </p>

        {/* The one mismatch that is invisible until a buyer meets it. */}
        {state.connected && !state.currencySupported && (
          <p style={{ margin: 0, padding: '10px 12px', borderRadius: 10, background: '#fdf3f3', color: '#b42318', fontSize: 12.5, lineHeight: 1.6 }}>
            This workspace sells in <strong>{state.currency}</strong>, and {state.providerLabel} will not take it.
            Change the currency below, or connect a processor that does.
          </p>
        )}

        {state.connected && !state.verifiedAt && (
          <p style={{ margin: 0, padding: '10px 12px', borderRadius: 10, background: '#fff7e6', color: '#7a4d00', fontSize: 12.5, lineHeight: 1.6 }}>
            A key is saved but has not been tested since it changed. Press Test before you send anybody a payment link.
          </p>
        )}
        {state.connected && !state.webhookSet && (
          <p style={{ margin: 0, padding: '10px 12px', borderRadius: 10, background: '#fff7e6', color: '#7a4d00', fontSize: 12.5, lineHeight: 1.6 }}>
            No signing secret yet, so orders will not mark themselves paid — you would have to set each one by hand.
            Add the endpoint below in {state.providerLabel} and paste the signing secret it shows you.
          </p>
        )}
        {diag && <Steps d={diag} />}

        {open && (
          <div style={{ display: 'grid', gap: 11, padding: 13, border: `1px solid ${LINE}`, borderRadius: 12, background: '#f7f8fa' }}>
            <div>
              <label style={lbl}>Payment processor</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(state.choices.length ? state.choices : [{ id: state.provider, label: state.providerLabel, currencies: [], keyHint: '' }]).map(c => (
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
              {switching && (
                <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#7a4d00', lineHeight: 1.5 }}>
                  Switching from {state.providerLabel} to {chosen?.label}. You will need to paste a {chosen?.label} key —
                  the one you have cannot be used with it.
                </p>
              )}
            </div>

            <div>
              <label style={lbl}>{chosen?.label ?? 'Processor'} secret key</label>
              <input
                value={key} onChange={e => setKey(e.target.value)} type="password" autoComplete="off"
                placeholder={state.connected && !switching ? 'Leave blank to keep the one you have' : (pick === 'creem' ? 'creem_live_… or creem_test_…' : 'sk_live_… or sk_test_…')}
                style={inp}
              />
              <p style={{ margin: '5px 0 0', fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
                {chosen?.keyHint}
                {pick === 'stripe' && <> — the Secret key, not the one starting <code>pk_</code>, which cannot take money.</>}
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
                In {chosen?.label} → Webhooks, add an endpoint for the address below, listening for
                {' '}<code>{pick === 'creem' ? 'checkout.completed' : 'checkout.session.completed'}</code>.
                {' '}{chosen?.label} shows the signing secret once.
              </p>
            </div>

            {state.webhookUrl && (
              <div>
                <label style={lbl}>The address to give {chosen?.label}</label>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                  <input readOnly value={state.webhookUrl} onFocus={e => e.currentTarget.select()} style={{ ...inp, background: '#fff', fontSize: 12 }} />
                  <button onClick={copyHook} style={btn()}><Copy size={13} /> Copy</button>
                </div>
              </div>
            )}

            <div>
              <label style={lbl}>Currency you sell in</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                {(chosen.currencies.length ? chosen.currencies : ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD'])
                  .map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <p style={{ margin: '5px 0 0', fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
                {chosen.currencies.length
                  ? `${chosen.label} settles in ${chosen.currencies.join(' and ')} only.`
                  : `${chosen.label} takes most currencies.`}
                {' '}New products and orders are priced in this.
              </p>
            </div>

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
