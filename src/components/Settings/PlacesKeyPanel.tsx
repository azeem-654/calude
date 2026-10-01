/**
 * The install's Google Places key — the owner's, once, for everybody.
 *
 * Reputation reads each customer's Google rating and reviews through Places
 * API (New). Asking every customer to make a Google Cloud project for that
 * would stop most of them at the first screen, so the owner sets one key here
 * and a workspace's own key (Reputation → Settings) is used first when it has
 * one. Owner-only on the server; the key is encrypted and never shown again.
 */
import { useEffect, useState } from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import { installKeyStatus, saveInstallKey, testInstallKey } from '../../services/reputationService';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';

export default function PlacesKeyPanel() {
  const [st, setSt] = useState<{ set: boolean; status: string; lastError: string } | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void installKeyStatus().then(r => { if (alive && r.success) setSt(r); });
    return () => { alive = false; };
  }, []);

  const save = async () => {
    setBusy('save'); setMsg(null);
    const r = await saveInstallKey(key.trim());
    setBusy('');
    if (!r.success) { setMsg({ ok: false, text: r.error ?? 'Not saved.' }); return; }
    setKey(''); setSt(r);
    setMsg({ ok: true, text: 'Saved and encrypted. Press "Test connection" to prove it with Google.' });
  };
  const test = async () => {
    setBusy('test'); setMsg(null);
    const r = await testInstallKey();
    setBusy('');
    const s = await installKeyStatus();
    if (s.success) setSt(s);
    setMsg(r.success ? { ok: true, text: 'Google accepted the key — Places API (New) works.' } : { ok: false, text: r.error ?? 'Google refused the key.' });
  };

  if (!st) return null;
  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: `1px solid ${LINE}`, borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' };
  const b: React.CSSProperties = { padding: '9px 14px', borderRadius: 10, border: `1px solid ${LINE}`, background: '#fff', color: INK, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };

  return (
    <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, padding: 24, marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0 }}>Google reviews (Places API key)</h3>
        {st.set && st.status === 'ok' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: '#e8f6ee', color: '#0f7b3d' }}><ShieldCheck size={10} /> Working</span>}
        {st.set && st.status !== 'ok' && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: '#f1f5f9', color: MUTED }}>Saved, not tested</span>}
      </div>
      <p style={{ fontSize: 13, color: MUTED, margin: '0 0 14px', lineHeight: 1.6 }}>
        One key for the whole installation, so customers can find their business and read its Google reviews without a
        Google Cloud project of their own. In Google Cloud: enable <strong>Places API (New)</strong>, create an API key,
        restrict it to Places API (New) with no website restriction, and paste it here. A customer's own key, if they add one, is used first.
      </p>
      <label style={{ display: 'grid', gap: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>API key</span>
        <input data-field="places.installKey" type="password" autoComplete="new-password" style={inp} value={key} onChange={e => setKey(e.target.value)}
          placeholder={st.set ? 'Stored — leave blank to keep it' : 'AIza…'} />
      </label>
      {st.lastError && <div style={{ fontSize: 12, color: '#b42318', marginTop: 8 }}>{st.lastError}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button onClick={save} disabled={busy === 'save'} style={{ ...b, background: INK, color: '#fff', border: 'none' }}>{busy === 'save' ? 'Saving…' : 'Save key'}</button>
        <button onClick={test} disabled={busy === 'test'} style={b}>{busy === 'test' ? 'Testing…' : 'Test connection'}</button>
      </div>
      {msg && <div role={msg.ok ? 'status' : 'alert'} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10, fontSize: 12.5, color: msg.ok ? '#0f7b3d' : '#b42318' }}>{msg.ok && <Check size={13} />}{msg.text}</div>}
    </div>
  );
}
