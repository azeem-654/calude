/**
 * "Why won't my email send?" — answered by the server, not guessed at.
 *
 * Shared hosting blocks outbound mail ports, and which ones it blocks is not
 * published anywhere; you find out because sending fails. Until now the app
 * could only report that failure. This asks the host directly — one connection
 * per port, one HTTPS request per provider — and comes back with the route that
 * actually works from where the app is installed.
 *
 * There is essentially always one. A host that blocks every SMTP port still has
 * port 443 open, because closing it would break the web, and every sending
 * service worth using has an HTTPS API behind it.
 *
 * It has to run on the deployed host to mean anything: the answer is a property
 * of that server's firewall, not of the developer's laptop.
 */
import { useState } from 'react';
import { Radar, CheckCircle, XCircle, Loader, ArrowRight, ExternalLink } from 'lucide-react';
import { sessionToken } from '../../services/auth';

interface PortResult {
  label: string; host: string; port: number; own: boolean;
  open: boolean; ms: number; reason: string; detail: string;
}
interface ApiResult { label: string; key: string; open: boolean; ms: number; status: number; detail: string }
interface Probe {
  success: boolean;
  env: Record<string, boolean | string>;
  ports: PortResult[];
  apis: ApiResult[];
  route: 'smtp' | 'api' | 'server-mail' | 'none';
  headline: string;
  advice: string;
}

/* Where to sign up, for the providers the probe reports as reachable. */
const SIGNUP: Record<string, { url: string; free: string }> = {
  brevo:   { url: 'https://www.brevo.com', free: '300 a day, no card' },
  resend:  { url: 'https://resend.com',    free: '3,000 a month' },
  mailjet: { url: 'https://www.mailjet.com', free: '200 a day' },
  smtp2go: { url: 'https://www.smtp2go.com', free: '1,000 a month' },
};

export default function RouteCheck() {
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');
  const [probe, setProbe] = useState<Probe | null>(null);
  const [error, setError] = useState('');

  const run = async () => {
    setState('running'); setError(''); setProbe(null);
    /* The SMTP server the user has configured is the most relevant target of
       all, so it is probed alongside the public relays. */
    let own: { host?: string; port?: number } = {};
    try {
      const smtp = JSON.parse(localStorage.getItem('crm_smtp') || 'null');
      if (smtp?.host) own = { host: smtp.host, port: Number(smtp.port) || 587 };
    } catch { /* no SMTP configured yet, which is fine */ }

    try {
      const base = import.meta.env.DEV ? 'http://localhost:3001' : '';
      const resp = await fetch(`${base}/api/mail-probe.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: sessionToken(), ...own }),
      });
      const data = await resp.json() as Probe;
      if (!data.success) throw new Error((data as unknown as { message?: string }).message || `HTTP ${resp.status}`);
      setProbe(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setState('done');
  };

  const verdictTone = probe?.route === 'none'
    ? { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' }
    : probe?.route === 'server-mail'
      ? { bg: '#fffbeb', border: '#fde68a', text: '#92400e' }
      : { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' };

  return (
    <div style={{ backgroundColor: 'white', borderRadius: 18, border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: '#f0f1f3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Radar size={19} color="#17191c" />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>Which route can this server send on?</h3>
          <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0', lineHeight: 1.5 }}>
            Tries every mail port and every HTTPS mail API from this host and reports what actually gets through.
            Run it here, on the live site — the answer belongs to this server's firewall.
          </p>
        </div>
      </div>

      <button
        onClick={run}
        disabled={state === 'running'}
        style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', border: 'none', borderRadius: 9,
          backgroundColor: state === 'running' ? '#e2e8f0' : '#17191c',
          color: state === 'running' ? '#94a3b8' : 'white',
          fontSize: 13, fontWeight: 600, cursor: state === 'running' ? 'not-allowed' : 'pointer',
        }}
      >
        {state === 'running'
          ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Trying every route…</>
          : <><Radar size={14} /> Check what works here</>}
      </button>

      {state === 'running' && (
        <p style={{ fontSize: 12, color: '#64748b', margin: '12px 0 0', lineHeight: 1.6 }}>
          A blocked port gives no answer at all, so each one has to time out before it can be called blocked.
          Give it up to half a minute.
        </p>
      )}

      {error && (
        <div style={{ marginTop: 14, padding: '11px 13px', borderRadius: 9, backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}>
          <p style={{ fontSize: 12.5, color: '#991b1b', margin: 0, lineHeight: 1.55, wordBreak: 'break-word' }}>
            The check itself could not run: {error}
          </p>
        </div>
      )}

      {probe && (
        <div style={{ marginTop: 16 }}>
          <div style={{ padding: '12px 14px', borderRadius: 10, backgroundColor: verdictTone.bg, border: `1px solid ${verdictTone.border}` }}>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: verdictTone.text, margin: '0 0 4px', lineHeight: 1.5 }}>{probe.headline}</p>
            <p style={{ fontSize: 12.5, color: verdictTone.text, margin: 0, lineHeight: 1.6, opacity: 0.92 }}>{probe.advice}</p>
          </div>

          {/* When HTTPS is the way through, the next step is a signup link, so
              it is put in front of the person rather than described. */}
          {probe.route === 'api' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {probe.apis.filter(a => a.open && SIGNUP[a.key]).map(a => (
                <a key={a.key} href={SIGNUP[a.key].url} target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 9,
                    border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', textDecoration: 'none',
                    fontSize: 12.5, color: '#0f172a', fontWeight: 600,
                  }}>
                  {a.label}
                  <span style={{ fontWeight: 400, color: '#64748b' }}>· {SIGNUP[a.key].free} free</span>
                  <ExternalLink size={11} color="#64748b" />
                </a>
              ))}
            </div>
          )}

          <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '18px 0 8px' }}>
            SMTP ports
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {probe.ports.map(p => (
              <Row key={`${p.host}:${p.port}`} ok={p.open} label={p.label} emphasis={p.own}
                detail={p.open ? `answered in ${p.ms}ms` : p.reason === 'blocked' ? 'blocked by this host — no reply at all' : p.detail} />
            ))}
          </div>

          <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '18px 0 8px' }}>
            HTTPS mail APIs (port 443)
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {probe.apis.map(a => (
              <Row key={a.key} ok={a.open} label={a.label} detail={a.open ? `reachable · ${a.detail}` : a.detail} />
            ))}
          </div>

          <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '18px 0 8px' }}>
            What this PHP build can do
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[
              ['Outbound sockets', probe.env.sockets], ['cURL', probe.env.curl],
              ['OpenSSL', probe.env.openssl], ['Local mail() relay', probe.env.mail],
            ].map(([label, on]) => (
              <span key={String(label)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999,
                fontSize: 11.5, fontWeight: 600,
                backgroundColor: on ? '#f0fdf4' : '#fef2f2',
                color: on ? '#166534' : '#991b1b',
                border: `1px solid ${on ? '#bbf7d0' : '#fecaca'}`,
              }}>
                {on ? <CheckCircle size={11} /> : <XCircle size={11} />}{String(label)}
              </span>
            ))}
            <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11.5, color: '#64748b', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
              PHP {String(probe.env.php)}
            </span>
          </div>

          <p style={{ fontSize: 11.5, color: '#64748b', margin: '16px 0 0', lineHeight: 1.6, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <ArrowRight size={13} style={{ marginTop: 2, flexShrink: 0 }} />
            Once a route is set up, use the Delivery check below to send one real campaign-shaped message through it.
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ ok, label, detail, emphasis }: { ok: boolean; label: string; detail: string; emphasis?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: '#334155' }}>
      {ok
        ? <CheckCircle size={13} color="#16a34a" style={{ flexShrink: 0, marginTop: 2 }} />
        : <XCircle size={13} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />}
      <span style={{ fontWeight: emphasis ? 700 : 500, flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#94a3b8', minWidth: 0, wordBreak: 'break-word' }}>{detail}</span>
    </div>
  );
}
