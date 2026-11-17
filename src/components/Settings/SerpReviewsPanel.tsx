/**
 * Google reviews without a Google Maps key — through SerpApi's free plan.
 *
 * Places API needs a Google Cloud billing account (in some countries with a
 * prepayment). Until the owner has one, this keeps every customer's Reviews
 * screen reading their Google listing. It is used only while no Maps key is
 * saved; once one is, Places takes over and this sits unused
 * (worker/src/lib/serpReviews.ts). Owner-only on the server; the key is
 * encrypted and never shown again.
 */
import { useEffect, useState } from 'react';
import { Check, ExternalLink, ShieldCheck } from 'lucide-react';
import { clearSerpKey, saveSerpKey, serpKeyStatus, testSerpKey, type SerpKeyState } from '../../services/reputationService';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';

export default function SerpReviewsPanel() {
  const [st, setSt] = useState<SerpKeyState | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void serpKeyStatus().then(r => { if (alive && r.success) setSt(r); });
    return () => { alive = false; };
  }, []);

  const run = async (what: string, call: () => Promise<{ success: boolean; error?: string } & Partial<SerpKeyState>>, okText: string) => {
    setBusy(what); setMsg(null);
    const r = await call();
    setBusy('');
    const s = await serpKeyStatus();
    if (s.success) setSt(s);
    if (!r.success) { setMsg({ ok: false, text: r.error ?? 'That did not work.' }); return; }
    setKey('');
    setMsg({ ok: true, text: okText });
  };

  if (!st) return null;
  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: `1px solid ${LINE}`, borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' };
  const b: React.CSSProperties = { padding: '9px 14px', borderRadius: 10, border: `1px solid ${LINE}`, background: '#fff', color: INK, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
  const pill = (bg: string, fg: string, text: React.ReactNode) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: bg, color: fg }}>{text}</span>;

  return (
    <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0 }}>Google reviews without a Maps key (SerpApi)</h3>
        {st.set && st.status === 'ok' && pill('#e8f6ee', '#0f7b3d', <><ShieldCheck size={10} /> Working</>)}
        {st.set && st.status === 'error' && pill('#fef2f2', '#b42318', 'Refused')}
        {st.set && st.status !== 'ok' && st.status !== 'error' && pill('#f1f5f9', MUTED, 'Saved, not tested')}
        {!st.set && pill('#fff7ed', '#9a3412', 'Not set')}
        {st.set && !st.inUse && pill('#f1f5f9', MUTED, 'Not in use — the Maps key reads reviews')}
      </div>
      <p style={{ fontSize: 13, color: MUTED, margin: '0 0 6px', lineHeight: 1.6 }}>
        While no Google Maps key is saved above, customers' <strong style={{ color: INK }}>Reviews</strong> screens read their
        Google listing through SerpApi instead: the rating, the review count and the ten newest reviews. Replies still need
        Google Business Profile. Prospect search is not affected. The moment you save a Maps key, it takes over and nothing
        has to be set up again.
      </p>
      <p style={{ fontSize: 12.5, color: MUTED, margin: '0 0 14px', lineHeight: 1.6 }}>
        <a href="https://serpapi.com/users/sign_up" target="_blank" rel="noopener noreferrer" style={{ color: INK, fontWeight: 600 }}>Make a free SerpApi account <ExternalLink size={10} style={{ verticalAlign: 'middle' }} /></a>{' '}
        (no card; 250 searches a month), copy the key from Your account → API key, and paste it here. The app stops at
        {' '}{st.usage?.cap ?? 230} a month and 15 a day per workspace, and reads each workspace every three days on its own.
      </p>
      {st.set && (
        <div style={{ fontSize: 12.5, color: '#334155', margin: '0 0 12px', lineHeight: 1.7 }}>
          {st.checkedAt && <div>{st.status === 'ok' ? 'SerpApi last accepted it' : 'Last checked'}: {new Date(st.checkedAt).toLocaleString()}</div>}
          {st.usage && <div>This month: <strong>{st.usage.used}</strong> of {st.usage.cap} reads used.</div>}
        </div>
      )}
      <label style={{ display: 'grid', gap: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>SerpApi key</span>
        <input data-field="serpapi.key" type="password" autoComplete="new-password" style={inp} value={key} onChange={e => setKey(e.target.value)}
          placeholder={st.set ? 'Stored — leave blank to keep it' : '64 letters and digits'} aria-label="SerpApi key" />
      </label>
      {st.lastError && <div style={{ fontSize: 12, color: '#b42318', marginTop: 8 }}>{st.lastError}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button onClick={() => void run('save', () => saveSerpKey(key.trim()), 'Saved, encrypted and tested — SerpApi answered.')} disabled={busy === 'save' || !key.trim()}
          style={{ ...b, background: INK, color: '#fff', border: 'none', opacity: key.trim() ? 1 : 0.5 }}>{busy === 'save' ? 'Saving…' : 'Save and test'}</button>
        <button onClick={() => void run('test', testSerpKey, 'SerpApi accepted the key.')} disabled={busy === 'test' || !st.set} style={{ ...b, opacity: st.set ? 1 : 0.5 }}>{busy === 'test' ? 'Testing…' : 'Test connection'}</button>
        {st.set && <button onClick={() => void run('clear', clearSerpKey, 'Removed.')} disabled={busy === 'clear'} style={b}>Remove</button>}
      </div>
      {msg && <div role={msg.ok ? 'status' : 'alert'} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10, fontSize: 12.5, color: msg.ok ? '#0f7b3d' : '#b42318' }}>{msg.ok && <Check size={13} />}{msg.text}</div>}
    </div>
  );
}
