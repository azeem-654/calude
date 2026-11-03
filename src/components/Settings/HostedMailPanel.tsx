/**
 * Settings → Email & SMS → Your own domain: email addresses on the
 * customer's own domain, hosted here (worker/src/lib/hostedMail.ts).
 *
 * Three steps, each shown with the state Cloudflare or the sending provider
 * actually reported: change the nameservers (the one thing only the customer
 * can do, and the proof the domain is theirs), receiving switched on, sending
 * verified. The addresses then appear in the mailbox list and the inbox like
 * any other mailbox. Mail lives in the app's inbox — there is no IMAP, so a
 * phone's mail app cannot open it, and the panel says so.
 */
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, Circle, Loader, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { sessionToken } from '../../services/auth';
import { getActiveAccountId } from '../../services/tenancy';

const API_BASE = import.meta.env.DEV ? 'http://localhost:8787' : '';
const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';

interface Domain { id: string; domain: string; nameservers: string[]; zone: string; receiving: string; sending: string; sendProvider: string; error: string; checkedAt: string | null }
interface Address { id: string; domainId: string; address: string; mailboxId: string; messages: number }
interface Status { available: boolean; sending: boolean; domains: Domain[]; addresses: Address[] }

async function call<T>(action: string, extra: Record<string, unknown> = {}): Promise<T & { success?: boolean; error?: string; field?: string; warning?: string }> {
  try {
    const r = await fetch(`${API_BASE}/api/hosted-mail.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), accountId: getActiveAccountId(), action, ...extra }),
    });
    return await r.json();
  } catch {
    return { success: false, error: 'Could not reach the server.' } as T & { success: boolean; error: string };
  }
}

function Step({ done, failed, label, detail }: { done: boolean; failed?: boolean; label: string; detail: string }) {
  const Icon = done ? CheckCircle : failed ? XCircle : Circle;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, minWidth: 0 }}>
      <Icon size={14} style={{ flexShrink: 0, marginTop: 2, color: done ? '#0f7b3d' : failed ? '#b42318' : '#94a3b8' }} />
      <span style={{ minWidth: 0 }}><b style={{ color: INK }}>{label}</b> <span style={{ color: MUTED }}>— {detail}</span></span>
    </div>
  );
}

const input: React.CSSProperties = { padding: '8px 10px', borderRadius: 9, border: `1px solid ${LINE}`, fontSize: 13, fontFamily: 'inherit', minWidth: 0 };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, border: `1px solid ${LINE}`, background: '#fff', color: INK, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const primary: React.CSSProperties = { ...btn, background: INK, color: '#fff', borderColor: INK };

export default function HostedMailPanel() {
  const [s, setS] = useState<Status | null>(null);
  const [err, setErr] = useState<{ msg: string; field?: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [domain, setDomain] = useState('');
  const [local, setLocal] = useState<Record<string, string>>({});
  const [name, setName] = useState<Record<string, string>>({});

  const run = useCallback(async (action: string, extra: Record<string, unknown> = {}, label = '') => {
    setBusy(label || action); setErr(null);
    const r = await call<Status>(action, extra);
    setBusy('');
    if (r.success) { setS(r); if (r.warning) setErr({ msg: r.warning }); return true; }
    setErr({ msg: r.error ?? 'That did not work.', field: r.field });
    return false;
  }, []);

  useEffect(() => { void run('status', {}, 'load'); }, [run]);

  if (!s) return <div style={{ fontSize: 12.5, color: MUTED }}>{err ? err.msg : <><Loader size={12} className="spin" /> Reading…</>}</div>;

  return (
    <div style={{ display: 'grid', gap: 14, minWidth: 0 }} data-testid="hosted-mail">
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: INK, margin: 0 }}>Email on your own domain</h3>
        <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6, margin: '6px 0 0' }}>
          Get addresses like hello@yourbusiness.com that receive into your inbox here and send from it — no separate mail host.
          You change your domain's nameservers once; we do the rest. Mail lives in this app's inbox (there is no IMAP, so phone mail apps cannot open it).
        </p>
      </div>
      {!s.available && <p style={{ fontSize: 12.5, color: '#9a3412', margin: 0 }}>This is not switched on for this platform yet.</p>}
      {s.available && !s.sending && <p style={{ fontSize: 12.5, color: '#9a3412', margin: 0 }}>Receiving works now; sending from your own domain is not switched on for this platform yet.</p>}

      {s.available && (
        <form onSubmit={e => { e.preventDefault(); if (domain.trim()) void run('add_domain', { domain }, 'add').then(ok => { if (ok) setDomain(''); }); }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ ...input, flex: '1 1 220px' }} placeholder="yourbusiness.com" value={domain} onChange={e => setDomain(e.target.value)} data-field="hosted.domain" aria-label="Your domain" />
          <button type="submit" style={primary} disabled={!!busy}>{busy === 'add' ? <Loader size={12} className="spin" /> : null} Add domain</button>
        </form>
      )}
      {err && <div role="alert" style={{ fontSize: 12.5, color: '#b42318', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '9px 12px' }}>{err.msg}</div>}

      {s.domains.map(d => {
        const active = d.zone === 'active';
        const addrs = s.addresses.filter(a => a.domainId === d.id);
        return (
          <div key={d.id} data-domain={d.domain} style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: '12px 14px', display: 'grid', gap: 10, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 14, color: INK, flex: '1 1 160px', overflowWrap: 'anywhere' }}>{d.domain}</strong>
              <button style={btn} disabled={!!busy} onClick={() => void run('refresh', { domainId: d.id }, `r-${d.id}`)}>{busy === `r-${d.id}` ? <Loader size={12} className="spin" /> : <RefreshCw size={12} />} Check again</button>
              <button style={{ ...btn, color: '#b42318' }} disabled={!!busy} onClick={() => { if (confirm(`Remove ${d.domain}, its addresses and the mail stored for them?`)) void run('remove_domain', { domainId: d.id }); }} aria-label={`Remove ${d.domain}`}><Trash2 size={12} /></button>
            </div>
            <Step done={active} label="1. Nameservers" detail={active ? 'changed — the domain is connected.' : 'at the company where you bought the domain, replace its nameservers with these two, then press Check again (it can take a few hours):'} />
            {!active && (
              <div style={{ display: 'grid', gap: 4, paddingLeft: 22 }}>
                {d.nameservers.map(n => <code key={n} style={{ fontSize: 12.5, background: '#f1f5f9', borderRadius: 6, padding: '4px 8px', overflowWrap: 'anywhere' }}>{n}</code>)}
                <span style={{ fontSize: 11.5, color: MUTED }}>Your website and other records were copied across, so they keep working.</span>
              </div>
            )}
            <Step done={d.receiving === 'on'} label="2. Receiving" detail={d.receiving === 'on' ? 'on — mail to your addresses arrives in your inbox here.' : active ? 'being switched on — press Check again.' : 'starts once the nameservers are changed.'} />
            <Step done={d.sending === 'verified'} failed={d.sending === 'failed'} label="3. Sending"
              detail={d.sending === 'verified' ? `verified${d.sendProvider ? ` (${d.sendProvider === 'resend' ? 'Resend' : 'Brevo'})` : ''} — campaigns and replies can send from these addresses.`
                : d.sending === 'no_provider' ? 'not switched on for this platform yet.' : d.sending === 'failed' ? 'the provider could not verify it yet — press Check again.' : active ? 'records added, being verified — press Check again in a few minutes.' : 'starts once the nameservers are changed.'} />
            {d.error && <div style={{ fontSize: 12, color: '#b42318', overflowWrap: 'anywhere' }}>{d.error}</div>}

            <div style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>Addresses</span>
              {!addrs.length && <span style={{ fontSize: 12, color: MUTED }}>None yet — mail to this domain is refused until you add one.</span>}
              {addrs.map(a => (
                <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5 }}>
                  <span style={{ color: INK, flex: '1 1 180px', overflowWrap: 'anywhere' }}>{a.address}</span>
                  <span style={{ color: MUTED }}>{a.messages} message{a.messages === 1 ? '' : 's'}</span>
                  <button style={{ ...btn, padding: '5px 8px', color: '#b42318' }} disabled={!!busy} onClick={() => { if (confirm(`Remove ${a.address} and its mail?`)) void run('remove_address', { addressId: a.id }); }} aria-label={`Remove ${a.address}`}><Trash2 size={12} /></button>
                </div>
              ))}
              <form onSubmit={e => { e.preventDefault(); void run('add_address', { domainId: d.id, local: local[d.id] ?? '', name: name[d.id] ?? '' }, `a-${d.id}`).then(ok => { if (ok) { setLocal({ ...local, [d.id]: '' }); setName({ ...name, [d.id]: '' }); } }); }} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flex: '1 1 200px', minWidth: 0 }}>
                  <input style={{ ...input, flex: 1, width: 0 }} placeholder="hello" value={local[d.id] ?? ''} onChange={e => setLocal({ ...local, [d.id]: e.target.value })} data-field="hosted.local" aria-label="Address" />
                  <span style={{ fontSize: 12.5, color: MUTED, overflowWrap: 'anywhere' }}>@{d.domain}</span>
                </span>
                <input style={{ ...input, flex: '1 1 140px' }} placeholder="Name shown (optional)" value={name[d.id] ?? ''} onChange={e => setName({ ...name, [d.id]: e.target.value })} aria-label="Name shown" />
                <button type="submit" style={btn} disabled={!!busy}>Add address</button>
              </form>
            </div>
          </div>
        );
      })}
    </div>
  );
}
