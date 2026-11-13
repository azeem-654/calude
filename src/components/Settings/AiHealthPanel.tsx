/**
 * Platform services → AI health: every tool that spends an AI or Maps key
 * (worker/src/lib/aiTools.ts), whether its key is configured, whether it is
 * failing, how near today's free quota it is, and what the monitor last
 * mailed the owner.
 *
 * One read (`/api/ai-health.php`, owner only — lib/aiHealth.ts). Never a key:
 * keys appear by their label. "Check now" runs the hourly check at once; the
 * once-a-day rule for each alert still holds, so pressing it twice does not
 * mail twice.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, KeyRound, Loader, RefreshCw, XCircle } from 'lucide-react';
import { API_BASE } from '../../services/apiBase';
import { sessionToken } from '../../services/auth';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';

type State = 'ok' | 'missing_key' | 'failing' | 'near_quota';
interface Tool {
  id: string; name: string; provider: string; powers: string; keyWhere: string; optional: boolean;
  state: State; detail: string;
  key: { configured: boolean; detail: string };
  recent: { requests: number; ok: number; limited: number };
  lastOkAt: string | null; lastErrorAt: string | null; lastError: string; failStreak: number;
  quota: { used: number; limit: number; pct: number; basis: string } | null;
}
interface Alert { tool: string; condition: string; sent_at: string | null; last_attempt_at: string | null; outcome: string }
interface Answer {
  success?: boolean; error?: string; checkedAt?: string | null;
  tools?: Tool[]; alerts?: Alert[];
  mail?: { at: string; ok: boolean; detail: string } | null;
  recipients?: { to: string; copy: string; from: string };
}

const LOOK: Record<State, { label: string; color: string; Icon: typeof CheckCircle }> = {
  ok: { label: 'OK', color: '#15803d', Icon: CheckCircle },
  missing_key: { label: 'Missing key', color: '#b45309', Icon: KeyRound },
  failing: { label: 'Failing', color: '#d92d20', Icon: XCircle },
  near_quota: { label: 'Near quota', color: '#dc8a06', Icon: AlertTriangle },
};
const when = (iso: string | null | undefined) => (iso ? new Date(iso.replace(' ', 'T')).toLocaleString() : '—');

export default function AiHealthPanel() {
  const [a, setA] = useState<Answer | null>(null);
  const [busy, setBusy] = useState<'' | 'status' | 'run'>('');
  const [error, setError] = useState('');

  const load = useCallback(async (action: 'status' | 'run') => {
    setBusy(action);
    try {
      const r = await fetch(`${API_BASE}/api/ai-health.php`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: sessionToken(), action }),
      });
      const d = await r.json() as Answer;
      if (d.success) { setA(d); setError(''); } else setError(d.error ?? 'Could not read the AI health check.');
    } catch {
      setError('Could not reach the server.');
    } finally { setBusy(''); }
  }, []);

  useEffect(() => { void load('status'); }, [load]);

  const tools = a?.tools ?? [];
  const attention = tools.filter(t => t.state !== 'ok' && !(t.state === 'missing_key' && t.optional)).length;

  return (
    <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, padding: 'clamp(16px, 3vw, 24px)', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0, flex: 1, minWidth: 180 }}>AI health</h3>
        <button type="button" onClick={() => void load('run')} disabled={!!busy}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${LINE}`, background: '#fff', borderRadius: 10, padding: '7px 12px', fontSize: 13, fontWeight: 600, color: INK, cursor: busy ? 'default' : 'pointer' }}>
          {busy ? <Loader size={14} className="spin" /> : <RefreshCw size={14} />} Check now
        </button>
      </div>
      <p style={{ fontSize: 13, color: MUTED, margin: '6px 0 14px', lineHeight: 1.55 }}>
        Every tool that spends an AI or Maps key, checked every hour. {a?.recipients ? <>Problems are mailed to {a.recipients.to} with a copy to {a.recipients.copy}, from {a.recipients.from}, at most once a day each.</> : null}
        {a?.checkedAt ? <> Last checked {when(a.checkedAt)}.</> : null}
      </p>
      {error && <p role="alert" style={{ color: '#d92d20', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}
      {a?.mail && !a.mail.ok && (
        <p role="status" style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: 10, padding: '8px 12px', fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>
          Alerts could not be sent ({when(a.mail.at)}): {a.mail.detail}
        </p>
      )}
      {!a && !error && <p style={{ fontSize: 13, color: MUTED }}><Loader size={13} className="spin" /> Reading…</p>}
      {a && (
        <p style={{ fontSize: 13, color: attention ? '#b45309' : '#15803d', fontWeight: 600, margin: '0 0 10px' }}>
          {attention ? `${attention} of ${tools.length} need attention.` : `All ${tools.length} tools are working.`}
        </p>
      )}
      <div style={{ display: 'grid', gap: 10 }}>
        {tools.map(t => {
          const look = LOOK[t.state];
          return (
            <div key={t.id} data-tool={t.id} style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: '10px 12px', display: 'grid', gap: 4, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, color: INK, fontSize: 14, flex: '1 1 180px', minWidth: 0, overflowWrap: 'anywhere' }}>{t.name}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: look.color, whiteSpace: 'nowrap' }}>
                  <look.Icon size={13} /> {look.label}{t.state === 'missing_key' && t.optional ? ' (optional)' : ''}
                </span>
              </div>
              <span style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{t.detail}</span>
              <span style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                {t.provider}. Key: {t.key.detail}
                {t.quota ? ` Quota: ${t.quota.used} of ${t.quota.limit} (${Math.round(t.quota.pct * 100)}%) — ${t.quota.basis}` : ''}
              </span>
              {(t.lastError || t.lastOkAt) && (
                <span style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                  Last worked {when(t.lastOkAt)}{t.lastError ? ` · last failure ${when(t.lastErrorAt)}: ${t.lastError}` : ''}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {!!a?.alerts?.length && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ fontSize: 13, color: INK, cursor: 'pointer', fontWeight: 600 }}>Alerts ({a.alerts.length})</summary>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
            {a.alerts.map(x => (
              <li key={`${x.tool}:${x.condition}`} style={{ fontSize: 12.5, color: '#334155', overflowWrap: 'anywhere' }}>
                {tools.find(t => t.id === x.tool)?.name ?? x.tool} — {x.condition.replace('_', ' ')}: {x.sent_at ? `mailed ${when(x.sent_at)}` : `not sent (${x.outcome})`}{x.sent_at && x.outcome !== 'sent' ? ` — ${x.outcome}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
