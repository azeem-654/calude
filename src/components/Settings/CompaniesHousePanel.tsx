/**
 * The install's Companies House key — "Verified business directories" in AI
 * Prospecting for every customer: active UK companies by trade and town, with
 * the directors they declared (worker/src/lib/companiesHouse.ts).
 *
 * The key is free from the government and the data is under the Open
 * Government Licence, so results may be kept in Contacts. Owner-only on the
 * server; the key is encrypted and never shown again.
 */
import { useEffect, useState } from 'react';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { registerStatus, saveRegisterKey, testRegisterKey, type RegisterState } from '../../services/companiesHouse';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';

export default function CompaniesHousePanel() {
  const [st, setSt] = useState<RegisterState | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void registerStatus().then(r => { if (alive && r.success) setSt(r); });
    return () => { alive = false; };
  }, []);

  const after = (r: RegisterState, saved: boolean) => {
    if (!r.success) { setMsg({ ok: false, text: r.error ?? 'That did not work.' }); return; }
    setSt(r);
    if (saved) setKey('');
    setMsg(r.tested?.ok
      ? { ok: true, text: saved ? 'Saved, encrypted, and Companies House accepted it. Verified business directories are on for every customer.' : 'Companies House accepted the key.' }
      : { ok: false, text: `${saved ? 'Saved, but ' : ''}${r.tested?.error ?? 'no answer'}` });
  };

  if (!st) return null;
  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: `1px solid ${LINE}`, borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' };
  const b: React.CSSProperties = { padding: '9px 14px', borderRadius: 10, border: `1px solid ${LINE}`, background: '#fff', color: INK, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
  const pill = (bg: string, fg: string, text: React.ReactNode) =>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: bg, color: fg }}>{text}</span>;

  return (
    <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0 }}>Verified business directories (Companies House)</h3>
        {st.set && st.status === 'ok' && pill('#e8f6ee', '#0f7b3d', <><ShieldCheck size={10} /> Working</>)}
        {st.set && st.status === 'error' && pill('#fef2f2', '#b42318', 'Refused by Companies House')}
        {st.set && st.status !== 'ok' && st.status !== 'error' && pill('#f1f5f9', MUTED, 'Saved, not tested')}
        {!st.set && pill('#f1f5f9', MUTED, 'Optional — not set')}
      </div>
      <p style={{ fontSize: 13, color: MUTED, margin: '0 0 6px', lineHeight: 1.6 }}>
        The UK's official company register, as a source in AI Prospecting: <strong style={{ color: INK }}>active, registered companies</strong> by
        trade and town, with the <strong style={{ color: INK }}>directors</strong> they declared. The register holds no websites or email
        addresses, and customers are told so. The data is under the Open Government Licence, so it may be kept in Contacts.
      </p>
      <p style={{ fontSize: 12.5, color: MUTED, margin: '0 0 14px', lineHeight: 1.6 }}>
        At <a href="https://developer.company-information.service.gov.uk/" target="_blank" rel="noopener noreferrer" style={{ color: INK, fontWeight: 600 }}>Companies House developer hub <ExternalLink size={10} style={{ verticalAlign: 'middle' }} /></a>:
        register (free) → create an application → <em>Create new key</em> → type <strong>REST</strong> → copy the key → paste it here.
        It allows 600 requests every five minutes; searches are kept a fortnight and each workspace has an hourly allowance.
      </p>
      {st.set && st.status === 'error' && st.lastError && (
        <div style={{ fontSize: 12.5, color: '#b42318', background: '#fef2f2', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>Last refusal: {st.lastError}</div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...inp, flex: '1 1 240px', width: 'auto' }} type="password" autoComplete="off" value={key} aria-label="Companies House API key"
          onChange={e => setKey(e.target.value)} placeholder={st.set ? 'Paste a new key to replace it' : 'Companies House REST API key'} data-field="register.key" />
        <button style={{ ...b, background: INK, color: '#fff', borderColor: INK }} disabled={!!busy || !key.trim()}
          onClick={async () => { setBusy('save'); setMsg(null); const r = await saveRegisterKey(key.trim()); setBusy(''); after(r, true); }}>
          {busy === 'save' ? 'Checking…' : 'Save key'}
        </button>
        {st.set && (
          <button style={b} disabled={!!busy} onClick={async () => { setBusy('test'); setMsg(null); const r = await testRegisterKey(); setBusy(''); after(r, false); }}>
            {busy === 'test' ? 'Testing…' : 'Test connection'}
          </button>
        )}
      </div>
      {msg && <div role="status" style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: msg.ok ? '#0f7b3d' : '#b42318' }}>{msg.text}</div>}
    </div>
  );
}
