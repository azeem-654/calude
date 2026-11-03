/**
 * Platform services → Email on customers' domains: the operator's Cloudflare
 * token and sending account that power "Your own domain" for every customer
 * (worker/src/lib/hostedMail.ts). Owner only; secrets are write-only — a
 * blank field keeps the stored one, and nothing set is ever shown back.
 */
import { useEffect, useState } from 'react';
import { CheckCircle, Loader } from 'lucide-react';
import { sessionToken } from '../../services/auth';

const API_BASE = import.meta.env.DEV ? 'http://localhost:8787' : '';
const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';

interface View { configured: boolean; cfAccountId: string; workerName: string; sendProvider: 'resend' | 'brevo'; hasToken: boolean; hasSendKey: boolean }

async function call(action: string, extra: Record<string, unknown> = {}) {
  const r = await fetch(`${API_BASE}/api/hosted-mail.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: sessionToken(), action, ...extra }) });
  return r.json() as Promise<{ success?: boolean; error?: string; field?: string; config?: View }>;
}

const input: React.CSSProperties = { padding: '8px 10px', borderRadius: 9, border: `1px solid ${LINE}`, fontSize: 13, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
const label: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 12, color: MUTED, minWidth: 0 };

export default function HostedMailSettings() {
  const [v, setV] = useState<View | null>(null);
  const [f, setF] = useState({ cfToken: '', cfAccountId: '', workerName: '', sendProvider: 'resend', sendKey: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void call('config').then(d => {
      if (d.config) { setV(d.config); setF(x => ({ ...x, cfAccountId: d.config!.cfAccountId, workerName: d.config!.workerName || 'crmpro', sendProvider: d.config!.sendProvider })); }
    }).catch(() => setMsg({ ok: false, text: 'Could not reach the server.' }));
  }, []);

  const save = async () => {
    setBusy(true); setMsg(null);
    const d = await call('save_config', f).catch(() => ({ success: false, error: 'Could not reach the server.' } as { success?: boolean; error?: string; field?: string; config?: View }));
    setBusy(false);
    if (d.success && d.config) { setV(d.config); setF(x => ({ ...x, cfToken: '', sendKey: '' })); setMsg({ ok: true, text: 'Saved — the Cloudflare token was checked with Cloudflare.' }); }
    else setMsg({ ok: false, text: d.error ?? 'Not saved.', field: d.field });
  };

  return (
    <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, padding: 'clamp(16px, 3vw, 24px)', display: 'grid', gap: 12, minWidth: 0 }} data-testid="hosted-mail-settings">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0, flex: 1, minWidth: 180 }}>Email on customers' domains</h3>
        {v?.configured && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: '#e8f6ee', color: '#0f7b3d' }}><CheckCircle size={10} /> On</span>}
      </div>
      <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6, margin: 0 }}>
        Lets every customer receive and send as you@theirdomain inside the app. Each domain becomes a zone on your Cloudflare account
        (they change its nameservers; Cloudflare's free plan, no cost per domain); mail arrives through Email Routing into this Worker.
        Sending goes through your Resend or Brevo account — each customer domain is added and verified there automatically.
        Limits: no IMAP (mail lives in the app), 25 MB a message, 200 addresses a domain; Resend's free plan allows one domain and 100 emails a day,
        Brevo's 300 a day.
      </p>
      <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.6, margin: 0 }}>
        Cloudflare token permissions (My Profile → API Tokens → Custom): <b>Account → Account Settings: Read</b>, <b>Zone → Zone: Edit</b>,
        <b> Zone → DNS: Edit</b>, <b>Zone → Email Routing Rules: Edit</b>, <b>Zone → Zone Settings: Edit</b>, for all zones of your account.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        <label style={label}>Cloudflare API token {v?.hasToken && <small>(set — leave blank to keep)</small>}
          <input style={input} type="password" autoComplete="off" value={f.cfToken} onChange={e => setF({ ...f, cfToken: e.target.value })} data-field="hosted.cfToken" /></label>
        <label style={label}>Cloudflare account ID
          <input style={input} value={f.cfAccountId} onChange={e => setF({ ...f, cfAccountId: e.target.value })} data-field="hosted.cfAccountId" /></label>
        <label style={label}>Worker that receives the mail
          <input style={input} value={f.workerName} onChange={e => setF({ ...f, workerName: e.target.value })} data-field="hosted.workerName" /></label>
        <label style={label}>Sending through
          <select style={input} value={f.sendProvider} onChange={e => setF({ ...f, sendProvider: e.target.value })}>
            <option value="resend">Resend</option><option value="brevo">Brevo</option>
          </select></label>
        <label style={label}>{f.sendProvider === 'brevo' ? 'Brevo API key (xkeysib-…)' : 'Resend API key (re_…)'} {v?.hasSendKey && <small>(set — leave blank to keep)</small>}
          <input style={input} type="password" autoComplete="off" value={f.sendKey} onChange={e => setF({ ...f, sendKey: e.target.value })} data-field="hosted.sendKey" /></label>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => void save()} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: 'none', background: INK, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          {busy && <Loader size={12} className="spin" />} Save and check
        </button>
        {msg && <span role={msg.ok ? 'status' : 'alert'} style={{ fontSize: 12.5, color: msg.ok ? '#0f7b3d' : '#b42318' }}>{msg.text}</span>}
      </div>
    </div>
  );
}
