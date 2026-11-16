/**
 * The live AI key monitor at the top of AI & cloud usage: every install key
 * in the order it is tried, whether it is answering, resting after a limit
 * (and until when) or refusing, and today's calls, refusals and average reply
 * time on it — read again every 15 seconds while the page is visible
 * (`/api/platform.php` `usage_live`, our own tables only).
 *
 * The owner asked for this so a long Autopilot run (a year of posts) can be
 * watched moving from one key to the next as each one's quota runs out. The
 * switching itself is lib/aiPool.ts; this only shows it. Never a key — a
 * label and where it lives.
 */
import { useEffect, useRef, useState } from 'react';
import { Activity } from 'lucide-react';
import { API_BASE } from '../../services/apiBase';
import { sessionToken } from '../../services/auth';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';
const EVERY_MS = 15_000;

interface KeyRow {
  label: string; source: string; provider: 'google' | 'openrouter'; state: 'working' | 'resting' | 'failing' | 'unused';
  restingUntil: string | null; lastOkAt: string | null; lastFailedAt: string | null; lastError: string;
  today: { requests: number; answered: number; limited: number; tokens: number; avgMs: number | null; lastAt: string | null };
}
interface Live {
  at: string; keys: KeyRow[];
  totals: { keys: number; working: number; resting: number; requests: number; answered: number; limited: number; tokens: number; avgMs: number | null };
  ownKeys: { requests: number; answered: number } | null;
}

const TONE: Record<KeyRow['state'], [string, string, string]> = {
  working: ['#0f7b3d', '#e8f6ee', 'Answering'],
  unused: ['#475569', '#eef1f6', 'Not used yet today'],
  resting: ['#9a3412', '#fff7ed', 'Resting'],
  failing: ['#b42318', '#fef2f2', 'Refusing'],
};
const secs = (ms: number | null) => ms === null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

export default function AiKeyMonitor() {
  const [d, setD] = useState<Live | null>(null);
  const [error, setError] = useState('');
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.visibilityState !== 'hidden') {
        try {
          const r = await fetch(`${API_BASE}/api/platform.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: sessionToken(), action: 'usage_live' }) });
          const j = await r.json() as Live & { success?: boolean; error?: string };
          if (stop) return;
          if (j.success) { setD(j); setError(''); } else setError(j.error ?? 'Could not read the keys.');
        } catch { if (!stop) setError('Could not reach the server — trying again in 15 seconds.'); }
      }
      if (!stop) timer.current = window.setTimeout(() => void tick(), EVERY_MS);
    };
    void tick();
    return () => { stop = true; if (timer.current) window.clearTimeout(timer.current); };
  }, []);

  const t = d?.totals;
  return (
    <section style={{ display: 'grid', gap: 10, border: `1px solid ${LINE}`, borderRadius: 14, padding: 14, minWidth: 0 }} data-testid="ai-key-monitor" aria-live="polite">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Activity size={14} style={{ color: '#0f7b3d' }} aria-hidden />
        <h4 style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: 0, flex: 1, minWidth: 160 }}>AI keys — live</h4>
        <span style={{ fontSize: 11.5, color: MUTED }}>{d ? `Updated ${time(d.at)} · every 15 s` : 'Reading…'}</span>
      </div>
      {error && <div role="alert" style={{ fontSize: 12, color: '#b42318' }}>{error}</div>}
      {t && (
        <p style={{ fontSize: 12.5, color: '#334155', margin: 0, lineHeight: 1.55 }}>
          {t.keys === 0 ? 'No AI key is set — add one under AI keys below.' : <>
            <strong>{t.working}</strong> of {t.keys} key{t.keys === 1 ? '' : 's'} ready{t.resting ? <>, <strong>{t.resting}</strong> resting after a limit</> : ''}.
            {' '}Today: {t.requests.toLocaleString()} calls, {t.answered.toLocaleString()} answered, {t.limited.toLocaleString()} refused at a limit
            {t.avgMs !== null ? <>, average reply <strong>{secs(t.avgMs)}</strong></> : ''}.
            {' '}When a key hits its limit or is refused, calls move to the next key on their own, one by one, and it rests until it can answer again.
          </>}
        </p>
      )}
      {d && d.keys.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          {d.keys.map((k, i) => {
            const [fg, bg, word] = TONE[k.state];
            return (
              <div key={i} style={{ display: 'grid', gap: 3, padding: '8px 10px', borderRadius: 10, background: '#fafbfc', border: `1px solid ${LINE}`, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: INK, flex: '1 1 160px', minWidth: 0, overflowWrap: 'anywhere' }}>{i + 1}. {k.label}{k.provider === 'openrouter' ? ' (OpenRouter)' : ''}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color: fg, background: bg, whiteSpace: 'nowrap' }}>
                    {word}{k.state === 'resting' && k.restingUntil ? ` until ${time(k.restingUntil)}` : ''}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: MUTED, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span>{k.today.requests.toLocaleString()} calls today</span>
                  <span>{k.today.answered.toLocaleString()} answered</span>
                  {k.today.limited > 0 && <span style={{ color: '#b42318' }}>{k.today.limited.toLocaleString()} at a limit</span>}
                  <span>avg reply {secs(k.today.avgMs)}</span>
                  {k.today.lastAt && <span>last used {time(k.today.lastAt)}</span>}
                </div>
                {(k.state === 'failing' || k.state === 'resting') && k.lastError && (
                  <div style={{ fontSize: 11.5, color: '#9a3412', overflowWrap: 'anywhere' }}>Google said: {k.lastError}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {d?.ownKeys && <p style={{ fontSize: 11.5, color: MUTED, margin: 0 }}>Customers' own keys today: {d.ownKeys.requests.toLocaleString()} calls (their quota, not yours).</p>}
    </section>
  );
}
