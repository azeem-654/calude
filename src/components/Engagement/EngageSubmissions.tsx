/**
 * What people have sent through forms.
 *
 * Shows the answers as they were submitted, not a tidied version. If triage has
 * read it, what the assistant made of it sits *beside* the answers rather than
 * instead of them — a judgement by a model standing in for what somebody
 * actually wrote is how a real enquiry gets filed as junk.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader } from 'lucide-react';
import { listSubmissions, setSubmission } from '../../services/engagement';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

interface Row {
  id: string; formName: string; answers: string; context: string; status: string;
  createdAt: string; aiSummary: string; aiIntent: string; aiQuality: string;
  personName: string | null; personEmail: string | null;
}

const QUALITY: Record<string, string> = { hot: '#b42318', warm: '#b45309', cold: '#64748b', junk: '#94a3b8' };

export default function EngageSubmissions() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true);

  const read = useCallback(async () => {
    setBusy(true);
    const r = await listSubmissions();
    setRows((r.submissions ?? []) as Row[]);
    setBusy(false);
  }, []);

  useEffect(() => { void read(); }, [read]);

  const card: React.CSSProperties = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 20 };

  if (busy) return <div style={card}><Loader size={16} className="spin" /></div>;

  if (rows.length === 0) {
    return (
      <div style={card}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: INK, margin: '0 0 6px' }}>Nothing submitted yet</h3>
        <p style={{ fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.65, maxWidth: '62ch' }}>
          Make a form, set it live, and put its address on a page. Everything sent through it appears here and
          becomes a contact.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rows.map(r => {
        let answers: Record<string, string>;
        try { answers = JSON.parse(r.answers || '{}') as Record<string, string>; } catch { answers = {}; }
        let ctx: Record<string, string>;
        try { ctx = JSON.parse(r.context || '{}') as Record<string, string>; } catch { ctx = {}; }

        return (
          <div key={r.id} style={{ ...card, padding: 16, opacity: r.status === 'spam' ? 0.55 : 1 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>{r.formName || 'Form'}</span>
              <span style={{ fontSize: 11.5, color: MUTED }}>
                {new Date(r.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
              {!!r.aiQuality && (
                <span style={{ fontSize: 10.5, fontWeight: 800, color: QUALITY[r.aiQuality] ?? MUTED }}>
                  {r.aiQuality.toUpperCase()}
                </span>
              )}
              <span style={{ flex: 1 }} />
              {['seen', 'actioned', 'spam'].map(st => (
                <button key={st} onClick={() => void (async () => { await setSubmission(r.id, st); void read(); })()} style={{
                  padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${r.status === st ? ACCENT : LINE}`,
                  background: r.status === st ? 'rgba(91,70,229,0.06)' : '#fff',
                  color: r.status === st ? ACCENT : '#475569', fontSize: 11, fontWeight: 700,
                }}>{st}</button>
              ))}
            </div>

            {!!r.aiSummary && (
              <p style={{
                fontSize: 12.5, color: '#334155', background: '#f8fafc', border: `1px solid ${LINE}`,
                borderRadius: 10, padding: '9px 11px', margin: '0 0 9px', lineHeight: 1.6,
              }}>
                <strong style={{ color: INK }}>Read as: </strong>{r.aiSummary}
              </p>
            )}

            <div style={{ display: 'grid', gap: 4 }}>
              {Object.entries(answers).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 10, fontSize: 13, alignItems: 'baseline' }}>
                  <span style={{ color: MUTED, width: 110, flexShrink: 0, fontSize: 11.5, fontWeight: 700 }}>{k}</span>
                  <span style={{ color: INK, minWidth: 0, whiteSpace: 'pre-wrap' }}>{v}</span>
                </div>
              ))}
            </div>

            {!!ctx.page && (
              <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>
                from {ctx.page}{ctx.utm_source ? ` · ${ctx.utm_source}` : ''}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
