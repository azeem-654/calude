/**
 * The install's Geoapify key — the free business directory behind prospect
 * search, for every customer.
 *
 * Prospect search reads it first (Contacts → Find businesses, and the AI
 * Sales Agent): OpenStreetMap's businesses, served fast, and — unlike Google's
 * — allowed to be kept, so "Add to Contacts" is within the provider's terms.
 * The free plan is 3,000 credits a day; the server stops at 2,800 and falls
 * back to OpenStreetMap's own servers, so it never needs a card.
 *
 * Owner-only on the server. The key is encrypted and never shown again; the
 * card shows whether Geoapify accepted it and today's credits.
 */
import { useEffect, useState } from 'react';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { geoStatus, saveGeoKey, testGeoKey, type GeoState } from '../../services/geoapify';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';

export default function GeoapifyKeyPanel() {
  const [st, setSt] = useState<GeoState | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void geoStatus().then(r => { if (alive && r.success) setSt(r); });
    return () => { alive = false; };
  }, []);

  const after = (r: GeoState, saved: boolean) => {
    if (!r.success) { setMsg({ ok: false, text: r.error ?? 'That did not work.' }); return; }
    setSt(r);
    if (saved) setKey('');
    setMsg(r.tested?.ok
      ? { ok: true, text: saved ? 'Saved, encrypted, and Geoapify accepted it. Prospect search uses it from now on.' : 'Geoapify accepted the key.' }
      : { ok: false, text: `${saved ? 'Saved, but ' : ''}Geoapify refused it: ${r.tested?.error ?? 'no answer'}` });
  };

  if (!st) return null;
  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: `1px solid ${LINE}`, borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' };
  const b: React.CSSProperties = { padding: '9px 14px', borderRadius: 10, border: `1px solid ${LINE}`, background: '#fff', color: INK, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
  const pill = (bg: string, fg: string, text: React.ReactNode) =>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: bg, color: fg }}>{text}</span>;

  return (
    <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0 }}>Free business directory (Geoapify)</h3>
        {st.set && st.status === 'ok' && pill('#e8f6ee', '#0f7b3d', <><ShieldCheck size={10} /> Working</>)}
        {st.set && st.status === 'error' && pill('#fef2f2', '#b42318', 'Refused by Geoapify')}
        {st.set && st.status !== 'ok' && st.status !== 'error' && pill('#f1f5f9', MUTED, 'Saved, not tested')}
        {!st.set && pill('#fff7ed', '#9a3412', 'Not set')}
      </div>
      <p style={{ fontSize: 13, color: MUTED, margin: '0 0 6px', lineHeight: 1.6 }}>
        Prospect search looks here <strong style={{ color: INK }}>first, at no cost to you</strong>: OpenStreetMap's businesses
        with phone and website where they are mapped, and — unlike Google's — results customers may keep in their Contacts.
        Trades it has no category for (plumbers, roofers, builders) are searched on OpenStreetMap directly, also free.
        Google Maps stays one tap away for customers who ask for it.
      </p>
      <p style={{ fontSize: 12.5, color: MUTED, margin: '0 0 14px', lineHeight: 1.6 }}>
        At <a href="https://myprojects.geoapify.com/" target="_blank" rel="noopener noreferrer" style={{ color: INK, fontWeight: 600 }}>Geoapify <ExternalLink size={10} style={{ verticalAlign: 'middle' }} /></a>:
        sign up free (no card) → create a project → copy its API key → paste it here. The free plan is 3,000 credits a day
        (20 businesses a credit); this app stops at {st.cap ?? 2800} and falls back to OpenStreetMap, so it never bills.
      </p>
      {st.set && (
        <div style={{ fontSize: 12.5, color: INK, background: '#f8fafc', borderRadius: 10, padding: '10px 12px', marginBottom: 12, lineHeight: 1.6 }}>
          Today: <strong>{st.creditsToday ?? 0}</strong> of {st.cap ?? 2800} free credits used. Searches are kept for a fortnight, so a repeated one costs nothing.
          {st.status === 'error' && st.lastError && <div style={{ color: '#b42318', marginTop: 4 }}>Last refusal: {st.lastError}</div>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...inp, flex: '1 1 240px', width: 'auto' }} type="password" autoComplete="off" value={key}
          onChange={e => setKey(e.target.value)} placeholder={st.set ? 'Paste a new key to replace it' : 'Geoapify API key'} data-field="geoapify.key" />
        <button style={{ ...b, background: INK, color: '#fff', borderColor: INK }} disabled={!!busy || !key.trim()}
          onClick={async () => { setBusy('save'); setMsg(null); const r = await saveGeoKey(key.trim()); setBusy(''); after(r, true); }}>
          {busy === 'save' ? 'Checking…' : 'Save key'}
        </button>
        {st.set && (
          <button style={b} disabled={!!busy} onClick={async () => { setBusy('test'); setMsg(null); const r = await testGeoKey(); setBusy(''); after(r, false); }}>
            {busy === 'test' ? 'Testing…' : 'Test connection'}
          </button>
        )}
      </div>
      {msg && <div role="status" style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: msg.ok ? '#0f7b3d' : '#b42318' }}>{msg.text}</div>}
    </div>
  );
}
