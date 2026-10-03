/**
 * The install's email finder & verifier — what lets AI Prospecting say a
 * mailbox exists rather than only that its domain takes mail.
 *
 * Without it every customer still gets the free checks (format, domain, mail
 * server, throwaway inboxes) and the screen says the mailbox was not checked.
 * A Worker cannot ask a mail server itself — outbound port 25 is closed on
 * Cloudflare — so the mailbox question goes to a service that can.
 *
 * One provider at a time. Hunter also searches the web for addresses a
 * business has published (named people, with their role); ZeroBounce and
 * MillionVerifier only check. Owner-only on the server; the key is encrypted
 * and never shown again.
 */
import { useEffect, useState } from 'react';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { removeVerifier, saveVerifier, testVerifier, verifierStatus, type VerifierState } from '../../services/emailVerifier';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';

const SIGNUP: Record<string, { url: string; free: string }> = {
  hunter: { url: 'https://hunter.io/api-keys', free: 'Free plan: 25 searches and 50 verifications a month' },
  zerobounce: { url: 'https://www.zerobounce.net/members/API', free: 'Free plan: 100 verifications a month' },
  millionverifier: { url: 'https://app.millionverifier.com/api', free: 'Pay as you go; the cheapest per check in bulk' },
};

export default function EmailVerifierPanel() {
  const [st, setSt] = useState<VerifierState | null>(null);
  const [provider, setProvider] = useState('hunter');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void verifierStatus().then(r => {
      if (!alive || !r.success) return;
      setSt(r);
      if (r.provider) setProvider(r.provider);
    });
    return () => { alive = false; };
  }, []);

  const name = (id?: string) => st?.providers?.find(p => p.id === id)?.name ?? id ?? '';
  const after = (r: VerifierState, saved: boolean) => {
    if (!r.success) { setMsg({ ok: false, text: r.error ?? 'That did not work.' }); return; }
    setSt(r);
    if (saved) setKey('');
    setMsg(r.tested?.ok
      ? { ok: true, text: `${saved ? 'Saved, encrypted, and ' : ''}${name(r.provider)} accepted it${r.tested.credits ? ` — ${r.tested.credits}` : ''}.` }
      : { ok: false, text: `${saved ? 'Saved, but ' : ''}${name(r.provider)} refused it: ${r.tested?.error ?? 'no answer'}` });
  };

  if (!st) return null;
  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: `1px solid ${LINE}`, borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' };
  const b: React.CSSProperties = { padding: '9px 14px', borderRadius: 10, border: `1px solid ${LINE}`, background: '#fff', color: INK, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
  const pill = (bg: string, fg: string, text: React.ReactNode) =>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: bg, color: fg }}>{text}</span>;
  const chosen = st.providers?.find(p => p.id === provider);
  const sign = SIGNUP[provider];

  return (
    <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0 }}>Email finder &amp; verifier</h3>
        {st.set && st.status === 'ok' && pill('#e8f6ee', '#0f7b3d', <><ShieldCheck size={10} /> Working — {name(st.provider)}</>)}
        {st.set && st.status === 'error' && pill('#fef2f2', '#b42318', `Refused by ${name(st.provider)}`)}
        {st.set && st.status !== 'ok' && st.status !== 'error' && pill('#f1f5f9', MUTED, 'Saved, not tested')}
        {!st.set && pill('#f1f5f9', MUTED, 'Optional — not set')}
      </div>
      <p style={{ fontSize: 13, color: MUTED, margin: '0 0 6px', lineHeight: 1.6 }}>
        AI Prospecting checks every address it finds for free — format, domain, mail server, throwaway inboxes — and says
        plainly that <strong style={{ color: INK }}>the mailbox itself was not checked</strong>. Connect a verifier and it
        asks the mail server too (from the verifier's servers — this app cannot), spots catch-all domains and spam traps,
        and marks the ones that exist <strong style={{ color: INK }}>Verified</strong>. With <strong style={{ color: INK }}>Hunter</strong>,
        customers can also search the web for addresses a business has published — named people with their role; never
        a guessed address.
      </p>
      <p style={{ fontSize: 12.5, color: MUTED, margin: '0 0 14px', lineHeight: 1.6 }}>
        Your credits serve every customer, so each workspace is capped
        ({st.budget?.verify.day ?? 100} mailbox checks a day and {st.budget?.verify.month ?? 500} a month;
        {' '}{st.budget?.find.day ?? 10} web searches a day and {st.budget?.find.month ?? 40} a month), an ended trial stops it,
        and every answer is kept so the same address is never paid for twice.
      </p>
      {st.set && (
        <div style={{ fontSize: 12.5, color: INK, background: '#f8fafc', borderRadius: 10, padding: '10px 12px', marginBottom: 12, lineHeight: 1.6 }}>
          This month, across every workspace: <strong>{st.month?.verify ?? 0}</strong> mailbox check{st.month?.verify === 1 ? '' : 's'}
          {st.finds && <>, <strong>{st.month?.find ?? 0}</strong> web search{st.month?.find === 1 ? '' : 'es'}</>}.
          {st.status === 'error' && st.lastError && <div style={{ color: '#b42318', marginTop: 4 }}>Last refusal: {st.lastError}</div>}
        </div>
      )}
      <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
        <div role="radiogroup" aria-label="Which service" data-field="verifier.provider" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(st.providers ?? []).map(p => (
            <button key={p.id} type="button" role="radio" aria-checked={provider === p.id} onClick={() => setProvider(p.id)}
              style={{ ...b, background: provider === p.id ? INK : '#fff', color: provider === p.id ? '#fff' : INK, borderColor: provider === p.id ? INK : LINE }}>
              {p.name}{p.finds ? ' — finds and verifies' : ' — verifies'}
            </button>
          ))}
        </div>
        {sign && (
          <span style={{ fontSize: 12, color: MUTED, lineHeight: 1.55 }}>
            {sign.free}. Get a key at <a href={sign.url} target="_blank" rel="noopener noreferrer" style={{ color: INK, fontWeight: 600 }}>{chosen?.name ?? provider} <ExternalLink size={10} style={{ verticalAlign: 'middle' }} /></a>
            {chosen?.where ? ` (${chosen.where})` : ''}.
            {st.set && st.provider && st.provider !== provider && <strong style={{ color: '#9a3412' }}> Saving replaces {name(st.provider)}.</strong>}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...inp, flex: '1 1 240px', width: 'auto' }} type="password" autoComplete="off" value={key} aria-label={`${chosen?.name ?? ''} API key`}
          onChange={e => setKey(e.target.value)} placeholder={st.set ? 'Paste a new key to replace it' : `${chosen?.name ?? ''} API key`} data-field="verifier.key" />
        <button style={{ ...b, background: INK, color: '#fff', borderColor: INK }} disabled={!!busy || !key.trim()}
          onClick={async () => { setBusy('save'); setMsg(null); const r = await saveVerifier(provider, key.trim()); setBusy(''); after(r, true); }}>
          {busy === 'save' ? 'Checking…' : 'Save key'}
        </button>
        {st.set && (
          <button style={b} disabled={!!busy} onClick={async () => { setBusy('test'); setMsg(null); const r = await testVerifier(); setBusy(''); after(r, false); }}>
            {busy === 'test' ? 'Testing…' : 'Test connection'}
          </button>
        )}
        {st.set && (
          <button style={{ ...b, color: '#b42318' }} disabled={!!busy}
            onClick={async () => {
              if (!window.confirm('Disconnect the email verifier? Customers keep the free checks.')) return;
              setBusy('remove'); setMsg(null); const r = await removeVerifier(); setBusy('');
              if (r.success) { setSt(r); setMsg({ ok: true, text: 'Disconnected. AI Prospecting runs the free checks only.' }); } else setMsg({ ok: false, text: r.error ?? 'That did not work.' });
            }}>
            Disconnect
          </button>
        )}
      </div>
      {msg && <div role="status" style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: msg.ok ? '#0f7b3d' : '#b42318' }}>{msg.text}</div>}
    </div>
  );
}
