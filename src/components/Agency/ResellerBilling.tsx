/**
 * Charging your clients — on your own payment account, at your own price.
 *
 * This replaced a modal that kept a Stripe secret key in the browser and
 * billed clients at the install's plan prices on the install owner's
 * processor: a reseller's client payments landed in the operator's account,
 * and the "Charged price" field changed nothing but a number on screen.
 *
 * Now the reseller connects their own Stripe or Creem (the key is encrypted
 * on the server and never comes back), sets each client's monthly price, and
 * sends the client a subscription link drawn on that account. The client's
 * webhook (with the reseller's own address and secret) marks them paid.
 */
import { useEffect, useState } from 'react';
import { CreditCard, X, Copy, ExternalLink, Loader, CheckCircle2, ShieldCheck } from 'lucide-react';
import type { SubAccount } from '../../services/tenancy';
import {
  clientCheckout, connectResell, resellStatus, setClientPrice, testResell, type ResellState,
} from '../../services/resell';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 9, fontSize: 13.5, boxSizing: 'border-box', background: '#fff' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: INK, marginBottom: 5 };
const box: React.CSSProperties = { border: `1px solid ${LINE}`, borderRadius: 14, padding: 16 };

export const STATUS_BADGE: Record<string, [string, string, string]> = {
  active: ['#e9f4e6', '#3f9142', 'Paid'], checkout_sent: ['#eceff9', '#3e63dd', 'Link sent'],
  past_due: ['#fdf5e7', '#c77414', 'Past due'], cancelled: ['#fceaea', '#e5484d', 'Cancelled'],
};

export default function ResellerBilling({ account, brand, onClose }: { account?: SubAccount; brand: string; onClose: () => void }) {
  const [st, setSt] = useState<ResellState | null>(null);
  const [provider, setProvider] = useState('stripe');
  const [key, setKey] = useState('');
  const [wh, setWh] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const client = account ? st?.clients.find(c => c.accountId === account.id) : undefined;
  const [price, setPrice] = useState(String(account?.price ?? ''));
  const [currency, setCurrency] = useState('USD');
  const [link, setLink] = useState('');

  useEffect(() => {
    resellStatus().then(r => {
      if (!r.success) { setMsg({ ok: false, text: r.error ?? 'Could not load.' }); return; }
      setSt(r.resell); if (r.resell.provider) setProvider(r.resell.provider);
      const c = account ? r.resell.clients.find(x => x.accountId === account.id) : undefined;
      if (c) { setPrice(String(c.amountCents / 100)); setCurrency(c.currency); }
    }).catch(() => setMsg({ ok: false, text: 'Could not reach the server.' }));
  }, [account]);

  const run = async (name: string, f: () => Promise<{ success: boolean; error?: string; resell?: ResellState }>, ok: string) => {
    setBusy(name); setMsg(null);
    const r: { success: boolean; error?: string; resell?: ResellState } = await f().catch(() => ({ success: false, error: 'Could not reach the server.' }));
    setBusy('');
    if (r.resell) setSt(r.resell);
    setMsg(r.success ? { ok: true, text: ok } : { ok: false, text: r.error ?? 'That did not work.' });
    return r;
  };
  const choice = st?.choices.find(c => c.id === provider);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-label="Charge your clients" style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 540, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 48px -12px rgba(16,24,40,0.28)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #e9edf3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#16a34a', display: 'grid', placeItems: 'center' }}><CreditCard size={17} color="#fff" /></div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: INK, margin: 0 }}>{account ? `Charge ${account.name}` : 'Charge your clients'}</h2>
              <p style={{ fontSize: 12, color: MUTED, margin: '1px 0 0' }}>Your price, paid into your own account.</p>
            </div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: 9, padding: 7, cursor: 'pointer', display: 'flex' }}><X size={16} color="#64748b" /></button>
        </div>

        <div style={{ padding: '18px 22px', display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 9, padding: '10px 12px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 12.5, color: '#14532d', lineHeight: 1.5 }}>
            <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Your clients pay <b>you</b>, on your own Stripe or Creem account, at the price you set. Protected Central never holds this money.</span>
          </div>

          <div style={box}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>Your payment account</span>
              {st?.connected && <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#e9f4e6', color: '#3f9142' }}>{st.providerLabel} · {st.mode === 'live' ? 'LIVE' : 'TEST'}</span>}
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div><label style={lbl}>Processor</label>
                <select value={provider} onChange={e => setProvider(e.target.value)} data-field="resell.provider" style={inp}>
                  {(st?.choices ?? [{ id: 'stripe', label: 'Stripe' }, { id: 'creem', label: 'Creem' }]).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select></div>
              <div><label style={lbl}>Secret key</label>
                <input style={inp} type="password" value={key} onChange={e => setKey(e.target.value)} data-field="resell.key"
                  placeholder={st?.connected ? 'Saved — leave blank to keep it' : provider === 'creem' ? 'creem_…' : 'sk_live_… or sk_test_…'} />
                {choice?.keyHint && <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 4 }}>{choice.keyHint}</span>}</div>
              <div><label style={lbl}>Webhook signing secret</label>
                <input style={inp} type="password" value={wh} onChange={e => setWh(e.target.value)} data-field="resell.webhook" placeholder={st?.webhookSet ? 'Saved — leave blank to keep it' : 'whsec_… (Stripe) or your Creem webhook secret'} /></div>
              {st?.webhookUrl && (
                <div><label style={lbl}>Webhook address — add it in your {st.providerLabel ?? 'processor'} dashboard</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input readOnly value={st.webhookUrl} style={{ ...inp, fontSize: 12, background: '#f7f8f9' }} onFocus={e => e.currentTarget.select()} />
                    <button type="button" title="Copy" onClick={() => navigator.clipboard?.writeText(st.webhookUrl)} style={{ padding: '0 12px', border: `1px solid ${LINE}`, borderRadius: 9, background: '#fff', cursor: 'pointer' }}><Copy size={14} /></button>
                  </div>
                  <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 4 }}>Events: <code>checkout.session.completed</code> and <code>invoice.paid</code> on Stripe, <code>checkout.completed</code> and <code>subscription.paid</code> on Creem.</span></div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" disabled={!!busy} onClick={() => void run('connect', () => connectResell(provider, key, wh), 'Saved.').then(() => { setKey(''); setWh(''); })}
                  style={{ padding: '9px 16px', background: INK, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{busy === 'connect' ? 'Saving…' : 'Save'}</button>
                {st?.connected && <button type="button" disabled={!!busy} onClick={() => void run('test', testResell, 'Your processor accepted the key.')}
                  style={{ padding: '9px 16px', background: '#fff', color: INK, border: `1px solid ${LINE}`, borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{busy === 'test' ? 'Testing…' : 'Test'}</button>}
              </div>
            </div>
          </div>

          {account && (
            <div style={box}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>{account.name}</span>
                {client && STATUS_BADGE[client.status] && <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: STATUS_BADGE[client.status][0], color: STATUS_BADGE[client.status][1] }}>{STATUS_BADGE[client.status][2]}</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px auto', gap: 8, alignItems: 'end' }}>
                <div><label style={lbl}>Your price per month</label><input style={inp} type="number" min={1} value={price} onChange={e => setPrice(e.target.value)} data-field="resell.price" /></div>
                <div><label style={lbl}>Currency</label>
                  <select style={inp} value={currency} onChange={e => setCurrency(e.target.value)}>{['USD', 'EUR', 'GBP', 'CAD', 'AUD'].map(c => <option key={c}>{c}</option>)}</select></div>
                <button type="button" disabled={!!busy} onClick={() => void run('price', () => setClientPrice(account.id, Number(price), currency), 'Price saved.')}
                  style={{ padding: '9px 14px', background: '#fff', color: INK, border: `1px solid ${LINE}`, borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Save price</button>
              </div>
              <button type="button" disabled={!!busy || !st?.connected || !client}
                onClick={async () => { setLink(''); const r = await run('checkout', () => clientCheckout(account.id, account.contactEmail, `${brand || 'Your plan'} — ${account.name}`), 'Payment link ready.'); if (r.success && 'url' in r) setLink((r as { url: string }).url); }}
                style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', padding: 11, background: st?.connected && client ? '#16a34a' : '#c7cbd1', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: st?.connected && client ? 'pointer' : 'not-allowed' }}>
                {busy === 'checkout' ? <Loader size={15} className="spin" /> : <CreditCard size={15} />} Create a monthly payment link
              </button>
              {!st?.connected && <p style={{ fontSize: 11.5, color: '#c77414', margin: '8px 0 0' }}>Connect your payment account above first.</p>}
              {st?.connected && !client && <p style={{ fontSize: 11.5, color: '#c77414', margin: '8px 0 0' }}>Save this client's price first.</p>}
              {link && (
                <div style={{ marginTop: 12, padding: '10px 12px', background: '#f7f8f9', borderRadius: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: INK, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={14} color="#16a34a" /> Send this to {account.contactEmail || 'your client'}:</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input readOnly value={link} style={{ ...inp, fontSize: 12 }} onFocus={e => e.currentTarget.select()} />
                    <button type="button" title="Copy" onClick={() => navigator.clipboard?.writeText(link)} style={{ padding: '0 12px', border: `1px solid ${LINE}`, borderRadius: 9, background: '#fff', cursor: 'pointer' }}><Copy size={14} /></button>
                    <a href={link} target="_blank" rel="noreferrer" title="Open" style={{ padding: '0 12px', border: `1px solid ${LINE}`, borderRadius: 9, background: '#fff', display: 'flex', alignItems: 'center' }}><ExternalLink size={14} color={INK} /></a>
                  </div>
                  <p style={{ fontSize: 11.5, color: MUTED, margin: '6px 0 0' }}>It turns into <b>Paid</b> here once your processor tells us — every month it renews.</p>
                </div>
              )}
            </div>
          )}

          {msg && <p role={msg.ok ? 'status' : 'alert'} style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: msg.ok ? '#15803d' : '#b91c1c' }}>{msg.text}</p>}
        </div>
      </div>
    </div>
  );
}
