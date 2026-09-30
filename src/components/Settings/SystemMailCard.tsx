/**
 * "System email" — which of the owner's mailboxes the install itself writes
 * from: sign-in codes, sign-up confirmations, trial emails, the digest, and
 * the notices from Sign-ups & trials. Install owner only (routes/systemMail.ts).
 *
 * It says what is in use and why in a sentence, lists the owner's mailboxes
 * with whether each has passed validation, lets one be chosen, and sends a
 * real test through the same path a sign-in code takes. The mailboxes
 * themselves are added and validated in the panel below it, not here — one
 * place to type a key.
 */
import { useEffect, useState } from 'react';
import { ShieldCheck, Send, Loader, CheckCircle, AlertTriangle } from 'lucide-react';
import { sessionToken } from '../../services/auth';

interface Candidate { id: string; label: string; fromEmail: string; via: string; validated: boolean; usable: boolean; lastError: string; chosen: boolean }
interface Status { inUse: { id: string; fromEmail: string; fromName: string } | null; chosenId: string; why: string; candidates: Candidate[]; sends: string[] }

const call = (action: string, extra: Record<string, unknown> = {}) =>
  fetch('/api/system-mail.php', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: sessionToken(), action, ...extra }),
  }).then(r => r.json() as Promise<Partial<Status> & { success: boolean; error?: string; message?: string }>);

const INK = '#17191c';
const MUTED = '#64748b';

export default function SystemMailCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<'' | 'choose' | 'test'>('');
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  const take = (d: Partial<Status> & { success: boolean; error?: string }) => {
    if (d.success && d.candidates) { setSt(d as Status); setErr(''); } else setErr(d.error ?? 'Could not load.');
  };
  useEffect(() => { call('status').then(take).catch(() => setErr('Could not reach the server.')); }, [refreshKey]);

  const choose = async (id: string) => {
    setBusy('choose'); setSaid(null);
    take(await call('choose', { id }).catch(() => ({ success: false, error: 'Could not reach the server.' })));
    setBusy('');
  };
  const test = async () => {
    setBusy('test'); setSaid(null);
    const r = await call('test').catch(() => ({ success: false, error: 'Could not reach the server.', message: '' }));
    setSaid({ ok: r.success, text: (r.success ? r.message : r.error) ?? '' });
    setBusy('');
  };

  return (
    <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #e6e9f0', padding: 22 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: '#ecfdf5', display: 'grid', placeItems: 'center', flexShrink: 0 }}><ShieldCheck size={17} color="#059669" /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: INK }}>System email <span style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9', background: '#f3e8ff', borderRadius: 999, padding: '2px 8px', marginLeft: 6 }}>Owner only</span></h3>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.55 }}>
            The mailbox Protected Central itself writes from to your customers. It must be one of your own — never a customer&apos;s — and it is used only after it passes “Save &amp; validate”.
          </p>
        </div>
      </div>

      {err ? <p style={{ margin: '14px 0 0', fontSize: 12.5, color: '#b91c1c' }}>{err}</p>
        : !st ? <span style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, fontSize: 12.5, color: MUTED }}><Loader size={14} className="spin" /> Checking…</span>
          : (
            <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
              <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '11px 13px', borderRadius: 12, background: st.inUse ? '#f0fdf4' : '#fffbeb', border: `1px solid ${st.inUse ? '#bbf7d0' : '#fde68a'}` }}>
                {st.inUse ? <CheckCircle size={16} color="#15803d" style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertTriangle size={16} color="#b45309" style={{ flexShrink: 0, marginTop: 1 }} />}
                <div style={{ fontSize: 13, lineHeight: 1.5, color: st.inUse ? '#14532d' : '#92400e' }}>
                  {st.inUse ? <>System emails go out from <b>{st.inUse.fromEmail}</b>{st.inUse.fromName ? <> as “{st.inUse.fromName}”</> : null}. </> : null}
                  {st.why}
                </div>
              </div>

              {st.candidates.length > 0 && (
                <div>
                  <label htmlFor="system-mailbox" style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 6 }}>Send system email from</label>
                  <select id="system-mailbox" data-field="system.mailbox" value={st.chosenId} disabled={busy !== ''}
                    onChange={e => void choose(e.target.value)}
                    style={{ width: '100%', maxWidth: 460, padding: '9px 11px', borderRadius: 10, border: '1px solid #e6e9f0', fontSize: 13.5, background: '#fff' }}>
                    <option value="">Choose automatically (first validated mailbox)</option>
                    {st.candidates.map(c => (
                      <option key={c.id} value={c.id}>
                        {(c.fromEmail || c.label || 'Mailbox')} — {c.via}{c.usable ? ' · validated' : ' · not validated yet'}
                      </option>
                    ))}
                  </select>
                  {st.candidates.filter(c => !c.usable && c.lastError).slice(0, 2).map(c => (
                    <p key={c.id} style={{ margin: '6px 0 0', fontSize: 11.5, color: '#92400e' }}>{c.fromEmail || c.label}: {c.lastError}</p>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => void test()} disabled={busy !== '' || !st.inUse}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 15px', borderRadius: 10, border: 'none', background: busy || !st.inUse ? '#c3c7cd' : INK, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: busy || !st.inUse ? 'default' : 'pointer' }}>
                  {busy === 'test' ? <Loader size={14} className="spin" /> : <Send size={14} />} Send me a test system email
                </button>
                {said && <span style={{ fontSize: 12.5, fontWeight: 600, color: said.ok ? '#15803d' : '#b91c1c', lineHeight: 1.5 }}>{said.text}</span>}
              </div>

              <div>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: MUTED, letterSpacing: '0.04em', textTransform: 'uppercase' }}>What goes out from it</span>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12.5, color: '#334155', lineHeight: 1.7 }}>
                  {st.sends.map(s => <li key={s}>{s}</li>)}
                </ul>
              </div>
            </div>
          )}
    </div>
  );
}
