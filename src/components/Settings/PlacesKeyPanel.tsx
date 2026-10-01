/**
 * The install's Google Maps key — the owner's, once, for everybody.
 *
 * One key serves two features: prospect search (Contacts → Find businesses,
 * and the AI Sales Agent's lead search) and Google reviews (Reputation). Both
 * read Places API (New) from the Worker. Asking every customer to make a
 * Google Cloud project would stop most of them at the first screen, so the
 * owner sets one key here and a workspace's own key (Reputation → Settings)
 * is used first when it has one.
 *
 * Lives on Settings → Platform services, the owner's one place for the keys
 * they provide. Owner-only on the server; the key is encrypted and never shown
 * again — not even its last characters. What is shown instead is what the
 * owner needs to act on: whether Google accepted it, when, and how much it is
 * being used this month, because Google bills it per call.
 */
import { useEffect, useState } from 'react';
import { Check, ExternalLink, ShieldCheck } from 'lucide-react';
import { installKeyStatus, saveInstallKey, testInstallKey, type InstallKeyState } from '../../services/reputationService';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';

export default function PlacesKeyPanel() {
  const [st, setSt] = useState<InstallKeyState | null>(null);
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
  const u = st.usage;
  const monthName = u ? new Date(`${u.month}-01T12:00:00Z`).toLocaleString(undefined, { month: 'long' }) : '';

  return (
    <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0 }}>Google Maps key (Places API)</h3>
        {st.set && st.status === 'ok' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: '#e8f6ee', color: '#0f7b3d' }}><ShieldCheck size={10} /> Working</span>}
        {st.set && st.status === 'error' && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: '#fef2f2', color: '#b42318' }}>Refused by Google</span>}
        {st.set && st.status !== 'ok' && st.status !== 'error' && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: '#f1f5f9', color: MUTED }}>Saved, not tested</span>}
        {!st.set && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: '#fff7ed', color: '#9a3412' }}>Not set</span>}
      </div>
      <p style={{ fontSize: 13, color: MUTED, margin: '0 0 6px', lineHeight: 1.6 }}>
        One key for the whole installation. It powers <strong style={{ color: INK }}>prospect search</strong> (Contacts → Find
        businesses, and the AI Sales Agent) and <strong style={{ color: INK }}>Google reviews</strong> (Reputation) for every
        customer, so none of them needs a Google Cloud project. A customer's own key, if they add one, is used first.
        Each workspace may run 20 searches an hour, 60 a day and 300 a month on it, and none after its trial ends unpaid.
      </p>
      <p style={{ fontSize: 12.5, color: MUTED, margin: '0 0 14px', lineHeight: 1.6 }}>
        In <a href="https://console.cloud.google.com/apis/library/places.googleapis.com" target="_blank" rel="noopener noreferrer" style={{ color: INK, fontWeight: 600 }}>Google Cloud <ExternalLink size={10} style={{ verticalAlign: 'middle' }} /></a>:
        enable <strong>Places API (New)</strong>, create an API key under Credentials, restrict it to Places API (New) with
        no website restriction, and paste it here.
      </p>
      {st.set && (
        <div style={{ fontSize: 12.5, color: '#334155', margin: '0 0 12px', lineHeight: 1.7 }}>
          {st.checkedAt && <div>{st.status === 'ok' ? 'Google last accepted it' : 'Last checked'}: {new Date(st.checkedAt).toLocaleString()}</div>}
          {u && (
            <div>
              {monthName} on your key: <strong>{u.install.prospects}</strong> prospect search{u.install.prospects === 1 ? '' : 'es'},{' '}
              <strong>{u.install.reviews}</strong> review call{u.install.reviews === 1 ? '' : 's'}
              {u.workspaces > 0 && <> across {u.workspaces} workspace{u.workspaces === 1 ? '' : 's'}</>}.
              {(u.own.prospects + u.own.reviews) > 0 && <span style={{ color: MUTED }}> ({u.own.prospects + u.own.reviews} more on customers' own keys.)</span>}
            </div>
          )}
        </div>
      )}
      <label style={{ display: 'grid', gap: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>API key</span>
        <input data-field="places.installKey" type="password" autoComplete="new-password" style={inp} value={key} onChange={e => setKey(e.target.value)}
          placeholder={st.set ? 'Stored — leave blank to keep it' : 'AIza…'} aria-label="Google Maps API key" />
      </label>
      {st.lastError && <div style={{ fontSize: 12, color: '#b42318', marginTop: 8 }}>{st.lastError}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button onClick={save} disabled={busy === 'save'} style={{ ...b, background: INK, color: '#fff', border: 'none' }}>{busy === 'save' ? 'Saving…' : 'Save key'}</button>
        <button onClick={test} disabled={busy === 'test' || !st.set} style={{ ...b, opacity: st.set ? 1 : 0.5 }}>{busy === 'test' ? 'Testing…' : 'Test connection'}</button>
      </div>
      {msg && <div role={msg.ok ? 'status' : 'alert'} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10, fontSize: 12.5, color: msg.ok ? '#0f7b3d' : '#b42318' }}>{msg.ok && <Check size={13} />}{msg.text}</div>}
    </div>
  );
}
