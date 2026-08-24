/**
 * What this server can actually do — run against the live host.
 *
 * The other connection tests report pass or fail. This one reports how far the
 * conversation got and what the server said at each step, because that is the
 * difference between "wrong password", "port blocked by the host", "certificate
 * does not match" and "PHP is missing an extension" — four problems with four
 * different fixes that otherwise all look like "sending doesn't work".
 */
import { useState } from 'react';
import { Stethoscope, CheckCircle, XCircle, AlertTriangle, MinusCircle, Loader, Copy, Check } from 'lucide-react';
import { sessionToken } from '../../services/auth';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

type Status = 'pass' | 'fail' | 'warn' | 'skip';
interface Check { id: string; label: string; status: Status; detail: string }
interface Result { success: boolean; failures: number; checks: Check[]; report: string }

const LOOK: Record<Status, { colour: string; bg: string; icon: typeof CheckCircle }> = {
  pass: { colour: '#16a34a', bg: '#f0fdf4', icon: CheckCircle },
  fail: { colour: '#dc2626', bg: '#fef2f2', icon: XCircle },
  warn: { colour: '#d97706', bg: '#fffbeb', icon: AlertTriangle },
  skip: { colour: '#94a3b8', bg: '#f8fafc', icon: MinusCircle },
};

function readStored<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}

export default function DiagnosticsCard() {
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setState('running'); setError(''); setResult(null); setCopied(false);

    /* The saved settings are sent so the server tests the same credentials the
       app itself would use — testing anything else would prove nothing. */
    const smtp = readStored<{ host?: string; port?: string; user?: string; pass?: string; encryption?: string }>('crm_smtp', {});
    const imap = readStored<{ host?: string; port?: string; user?: string; pass?: string; folder?: string }>('crm_imap', {});

    try {
      const r = await fetch(`${API_BASE}/api/diagnostics.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: sessionToken(),
          smtp: smtp.host ? {
            host: smtp.host, port: parseInt(smtp.port || '587') || 587,
            encryption: smtp.encryption || 'tls', username: smtp.user, password: smtp.pass,
          } : null,
          imap: imap.host ? {
            host: imap.host, port: parseInt(imap.port || '993') || 993,
            encryption: (parseInt(imap.port || '993') || 993) === 143 ? 'tls' : 'ssl',
            username: imap.user, password: imap.pass, folder: imap.folder || 'INBOX',
          } : null,
        }),
      });
      if (r.status === 401) {
        setState('error');
        setError('Your session has expired. Sign in again, then re-run the checks.');
        return;
      }
      if (!r.ok) { setState('error'); setError(`The diagnostics endpoint returned ${r.status}.`); return; }
      setResult(await r.json() as Result);
      setState('done');
    } catch {
      setState('error');
      setError('Could not reach the diagnostics endpoint. This check only works on a host running PHP — it will not work on a static preview.');
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy automatically — select the text below and copy it.');
    }
  };

  return (
    <div style={{ backgroundColor: 'white', borderRadius: 18, border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: '#f0f1f3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Stethoscope size={20} color="#17191c" />
        </div>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>Server diagnostics</h3>
          <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>
            Checks this server's PHP build and walks a real SMTP and IMAP conversation, reporting what the mail server said at each step.
          </p>
          {/* Which build answered. Without this a stale cache and a deploy that
              never happened look exactly the same from the browser. */}
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            build {__BUILD_SHA__} · {new Date(__BUILT_AT__).toLocaleString()}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: result || error ? 16 : 0 }}>
        <button onClick={run} disabled={state === 'running'}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', backgroundColor: state === 'running' ? '#e2e8f0' : '#17191c', color: state === 'running' ? '#94a3b8' : 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: state === 'running' ? 'not-allowed' : 'pointer' }}>
          {state === 'running'
            ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Running checks…</>
            : <><Stethoscope size={14} /> Run checks</>}
        </button>
        {result && (
          <button onClick={copy}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', backgroundColor: 'white', color: '#334155', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {copied ? <><Check size={14} color="#16a34a" /> Copied</> : <><Copy size={14} /> Copy report</>}
          </button>
        )}
        {result && (
          <span style={{ fontSize: 12, fontWeight: 600, color: result.failures ? '#dc2626' : '#16a34a' }}>
            {result.failures ? `${result.failures} failed` : 'All checks passed'}
          </span>
        )}
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9 }}>
          <XCircle size={14} color="#dc2626" style={{ marginTop: 2, flexShrink: 0 }} />
          <p style={{ fontSize: 12, color: '#991b1b', margin: 0, lineHeight: 1.5 }}>{error}</p>
        </div>
      )}

      {result && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {result.checks.map(c => {
              const look = LOOK[c.status] ?? LOOK.skip;
              const Icon = look.icon;
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '8px 11px', backgroundColor: look.bg, borderRadius: 8, border: '1px solid #f1f5f9' }}>
                  <Icon size={14} color={look.colour} style={{ marginTop: 2, flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 600, color: '#0f172a', margin: 0 }}>{c.label}</p>
                    {c.detail && (
                      /* The server's own words, wrapped rather than truncated —
                         the useful part of an SMTP reply is often at the end. */
                      <p style={{ fontSize: 11.5, color: '#475569', margin: '2px 0 0', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                        {c.detail}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <details style={{ marginTop: 12 }}>
            <summary style={{ fontSize: 12, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
              Plain-text report (safe to share — no passwords)
            </summary>
            <pre style={{ marginTop: 8, padding: 12, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 11, lineHeight: 1.55, color: '#334155', overflowX: 'auto', whiteSpace: 'pre' }}>
              {result.report}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
