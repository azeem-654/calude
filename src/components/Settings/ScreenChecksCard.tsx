/**
 * "Screen checks" — the dead ends customers have actually hit.
 *
 * Each row is a refusal that told somebody to fill in a box their screen did
 * not show (services/fieldGuard.ts reports it; routes/uireport.ts keeps it).
 * That is always a product fault — a form and the server disagreeing about
 * what the form contains — so it is shown to the install owner, counted, with
 * the server's own sentence, and cleared once fixed.
 *
 * Empty is the goal and says so plainly, rather than looking like a card that
 * failed to load.
 */
import { useEffect, useState } from 'react';
import { ScanSearch, CheckCircle, Loader, Trash2 } from 'lucide-react';
import { sessionToken } from '../../services/auth';

interface Report { id: string; api: string; field: string; path: string; message: string; firstAt: string; lastAt: string; hits: number }

const call = (action: string, extra: Record<string, unknown> = {}) =>
  fetch('/api/uireport.php', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: sessionToken(), action, ...extra }),
  }).then(r => r.json() as Promise<{ success: boolean; reports?: Report[]; error?: string }>);

export default function ScreenChecksCard() {
  const [rows, setRows] = useState<Report[] | null>(null);
  const [err, setErr] = useState('');
  const load = () => call('list').then(d => { if (d.success) { setRows(d.reports ?? []); setErr(''); } else setErr(d.error ?? 'Could not load.'); }).catch(() => setErr('Could not reach the server.'));
  useEffect(() => { void load(); }, []);

  return (
    <div style={{ background: 'white', borderRadius: 18, border: '1px solid #e6e9f0', padding: 22, marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: '#eef2ff', display: 'grid', placeItems: 'center', flexShrink: 0 }}><ScanSearch size={17} color="#4f46e5" /></span>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: '#0f172a' }}>Screen checks</h3>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#64748b', lineHeight: 1.55 }}>
            Every time a screen tells somebody to fill in a box it is not showing them, it is recorded here — with how often and where.
            These are faults in the product, not in anyone&apos;s settings. Only you see this.
          </p>
        </div>
        {rows && rows.length > 0 && (
          <button type="button" onClick={() => void call('clear').then(load)} style={{ border: '1px solid #e6e9f0', background: '#fff', borderRadius: 10, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Clear all
          </button>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        {err ? <p style={{ margin: 0, fontSize: 12.5, color: '#b91c1c' }}>{err}</p>
          : rows === null ? <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: '#64748b' }}><Loader size={14} className="spin" /> Checking…</span>
            : rows.length === 0 ? (
              <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#15803d', fontWeight: 600 }}>
                <CheckCircle size={15} /> No dead ends reported. Every refusal so far pointed at a box the screen was showing.
              </span>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {rows.map(r => (
                  <div key={r.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, padding: '10px 12px', border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <b style={{ fontSize: 13, color: '#0f172a' }}>{r.path}</b>
                      <span style={{ fontSize: 12, color: '#92400e' }}> · asked for <code>{r.field}</code> via <code>{r.api}</code> · {r.hits}×</span>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#475569', lineHeight: 1.5 }}>“{r.message}”</p>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>Last {new Date(r.lastAt).toLocaleString()}</span>
                    </div>
                    <button type="button" aria-label="Mark fixed" title="Mark fixed" onClick={() => void call('clear', { id: r.id }).then(load)}
                      style={{ border: 0, background: 'none', cursor: 'pointer', color: '#94a3b8', alignSelf: 'start' }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
      </div>
    </div>
  );
}
