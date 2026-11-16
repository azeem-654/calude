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

interface View { configured: boolean; cfAccountId: string; workerName: string; sendProvider: 'resend' | 'brevo'; hasToken: boolean; tokenFrom: '' | 'saved' | 'secret'; hasSendKey: boolean; hasEventsSecret?: boolean; eventsUrl?: string }

interface Own { id: string; address: string; receiving: boolean; verified: boolean; problem: string; messages: number; lastAt: string | null }

async function call(action: string, extra: Record<string, unknown> = {}) {
  const r = await fetch(`${API_BASE}/api/hosted-mail.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: sessionToken(), action, ...extra }) });
  return r.json() as Promise<{ success?: boolean; error?: string; field?: string; config?: View; own?: Own[]; steps?: string[]; warning?: string }>;
}

const input: React.CSSProperties = { padding: '8px 10px', borderRadius: 9, border: `1px solid ${LINE}`, fontSize: 13, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
const label: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 12, color: MUTED, minWidth: 0 };

export default function HostedMailSettings() {
  const [v, setV] = useState<View | null>(null);
  const [f, setF] = useState({ cfToken: '', cfAccountId: '', workerName: '', sendProvider: 'resend', sendKey: '', eventsSecret: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [own, setOwn] = useState<Own[] | null>(null);
  const [ownBusy, setOwnBusy] = useState('');
  const [ownMsg, setOwnMsg] = useState<{ ok: boolean; text: string; steps?: string[] } | null>(null);

  useEffect(() => {
    void call('own_status').then(d => { if (d.own) setOwn(d.own); }).catch(() => undefined);
  }, []);
  const ownRun = async (action: 'own_receive' | 'own_stop', id: string) => {
    setOwnBusy(`${action}${id}`); setOwnMsg(null);
    const d = await call(action, { mailboxId: id }).catch(() => ({ success: false, error: 'Could not reach the server.' } as Awaited<ReturnType<typeof call>>));
    setOwnBusy('');
    if (d.own) setOwn(d.own);
    if (d.success) setOwnMsg({ ok: !d.warning, text: d.warning ?? (action === 'own_stop' ? 'Stopped. Mail already received is kept.' : 'Done.'), steps: d.steps });
    else setOwnMsg({ ok: false, text: d.error ?? 'That did not work.', steps: d.steps });
  };

  useEffect(() => {
    void call('config').then(d => {
      if (d.config) { setV(d.config); setF(x => ({ ...x, cfAccountId: d.config!.cfAccountId, workerName: d.config!.workerName || 'crmpro', sendProvider: d.config!.sendProvider })); }
    }).catch(() => setMsg({ ok: false, text: 'Could not reach the server.' }));
  }, []);

  const save = async () => {
    setBusy(true); setMsg(null);
    const d = await call('save_config', f).catch(() => ({ success: false, error: 'Could not reach the server.' } as { success?: boolean; error?: string; field?: string; config?: View }));
    setBusy(false);
    if (d.success && d.config) { setV(d.config); setF(x => ({ ...x, cfToken: '', sendKey: '', eventsSecret: '' })); setMsg({ ok: true, text: 'Saved — the Cloudflare token was checked with Cloudflare.' }); }
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
        <label style={label}>Cloudflare API token {v?.tokenFrom === 'secret' ? <small>(set as a Worker secret — leave blank)</small> : v?.hasToken && <small>(set — leave blank to keep)</small>}
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
        {f.sendProvider === 'resend' && (
          <label style={label}>Resend webhook signing secret (whsec_…) {v?.hasEventsSecret && <small>(set — leave blank to keep)</small>}
            <input style={input} type="password" autoComplete="off" value={f.eventsSecret} onChange={e => setF({ ...f, eventsSecret: e.target.value })} data-field="hosted.eventsSecret" /></label>
        )}
      </div>
      {/* Bounces and complaints (E-7): until this address is added at the
          provider, a hard-bounced address keeps being mailed. Said, not hidden. */}
      {v?.eventsUrl && (
        <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.55 }}>
          <strong>Bounces and complaints.</strong> In {f.sendProvider === 'brevo' ? 'Brevo → Transactional → Settings → Webhook' : 'Resend → Webhooks → Add endpoint'}, add this address
          for {f.sendProvider === 'brevo' ? 'hard bounces, invalid email and spam complaints' : 'email.bounced and email.complained'}. Addresses it reports are added to the sending workspace’s suppression list.
          {f.sendProvider === 'resend' && ' Then paste the endpoint’s signing secret above.'}
          <input readOnly value={v.eventsUrl} onFocus={e => e.currentTarget.select()} aria-label="Bounce and complaint webhook address" style={{ ...input, marginTop: 6, fontFamily: 'monospace', fontSize: 11.5 }} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => void save()} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: 'none', background: INK, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          {busy && <Loader size={12} className="spin" />} Save and check
        </button>
        {msg && <span role={msg.ok ? 'status' : 'alert'} style={{ fontSize: 12.5, color: msg.ok ? '#0f7b3d' : '#b42318' }}>{msg.text}</span>}
      </div>

      {/* The owner's own addresses (support@ on this install's domain): a
          sending account (Brevo, Resend) only sends, so mail to it had
          nowhere to arrive. Received here through the same Email Routing. */}
      {own && (
        <section style={{ borderTop: `1px solid ${LINE}`, paddingTop: 12, display: 'grid', gap: 8 }} data-testid="own-inbox">
          <h4 style={{ fontSize: 14, fontWeight: 700, color: INK, margin: 0 }}>Receive your own address here</h4>
          <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6, margin: 0 }}>
            Resend and Brevo only <b>send</b> — they never hold mail, so an address set up with them alone cannot receive. If its domain is on your
            Cloudflare account, mail to it can arrive straight into its inbox here: Email Routing is switched on and one rule sends that one address to this
            Worker. Other addresses on the domain are not touched, sending keeps working as it does, and nothing changes if the domain's mail already goes to a
            mail host (then connect it over IMAP instead). The token above needs <b>Email Routing Rules: Edit</b>, <b>Zone Settings: Edit</b> and <b>DNS: Edit</b>.
            Do this on the live site (app.protectedcentral.com): the address can be received by one site only.
          </p>
          {own.length === 0 && <p style={{ fontSize: 12.5, color: MUTED, margin: 0 }}>None of your workspaces has a send-only mailbox. Add the address under Settings → Email &amp; SMS first.</p>}
          {own.map(o => (
            <div key={o.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', border: `1px solid ${LINE}`, borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: INK, overflowWrap: 'anywhere' }}>{o.address}</div>
                <div style={{ fontSize: 11.5, color: o.receiving && o.verified ? '#0f7b3d' : MUTED }}>
                  {o.receiving ? (o.verified ? `Receiving here · ${o.messages} message${o.messages === 1 ? '' : 's'}${o.lastAt ? `, last ${new Date(o.lastAt).toLocaleString()}` : ''}` : o.problem || 'Waiting for Cloudflare — press Check again.') : 'Sends only — mail to it does not arrive anywhere here'}
                </div>
              </div>
              <button onClick={() => void ownRun('own_receive', o.id)} disabled={!!ownBusy || !v?.configured} title={v?.configured ? '' : 'Save a Cloudflare token above first'}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: 'none', background: INK, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }} data-field="hosted.ownMailbox">
                {ownBusy === `own_receive${o.id}` && <Loader size={12} className="spin" />} {o.receiving ? 'Check again' : 'Receive mail here'}
              </button>
              {o.receiving && (
                <button onClick={() => void ownRun('own_stop', o.id)} disabled={!!ownBusy}
                  style={{ padding: '7px 12px', borderRadius: 9, border: `1px solid ${LINE}`, background: '#fff', color: '#b42318', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Stop</button>
              )}
            </div>
          ))}
          {ownMsg && (
            <div role={ownMsg.ok ? 'status' : 'alert'} style={{ fontSize: 12.5, color: ownMsg.ok ? '#0f7b3d' : '#b42318', lineHeight: 1.55 }}>
              {ownMsg.text}
              {!!ownMsg.steps?.length && <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: '#334155' }}>{ownMsg.steps.map((x, i) => <li key={i}>{x}</li>)}</ul>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
