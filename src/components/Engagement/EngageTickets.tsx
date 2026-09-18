/**
 * Tickets.
 *
 * Deliberately plain. A ticket list is a queue somebody works down, and every
 * pixel spent on decoration here is a pixel not spent on the subject line they
 * are scanning for.
 */
import { useEffect, useState } from 'react';
import { Loader, Send, Lock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getTicket, replyToTicket, setTicket, type Ticket } from '../../services/engagement';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

const STATUS: { id: string; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'waiting', label: 'Waiting on customer' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' },
];

const TONE: Record<string, string> = {
  open: '#b42318', in_progress: '#b45309', waiting: '#64748b', resolved: '#0f7b3d', closed: '#94a3b8',
};

export default function EngageTickets({ tickets, onChange }: { tickets: Ticket[]; onChange: () => void }) {
  const { addNotification } = useApp();
  const [openId, setOpenId] = useState('');
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [messages, setMessages] = useState<{ role: string; author: string; body: string; internal: number; createdAt: string }[]>([]);
  const [draft, setDraft] = useState('');
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!openId) { setDetail(null); setMessages([]); return; }
    let alive = true;
    void (async () => {
      const r = await getTicket(openId);
      if (!alive || !r.success) return;
      setDetail((r.ticket ?? null) as Record<string, unknown> | null);
      setMessages((r.messages ?? []) as typeof messages);
    })();
    return () => { alive = false; };
  }, [openId]);

  const card: React.CSSProperties = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16 };

  if (tickets.length === 0) {
    return (
      <div style={{ ...card, padding: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: INK, margin: '0 0 6px' }}>No tickets yet</h3>
        <p style={{ fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.65, maxWidth: '62ch' }}>
          A ticket is made when somebody raises one from a widget, or when the assistant decides a question
          needs a person and opens one on their behalf — with the conversation attached, so nobody has to ask
          them to explain it again.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0, 340px) minmax(0, 1fr)', alignItems: 'start' }}>
      <div style={{ ...card, overflow: 'hidden', maxHeight: '70vh', overflowY: 'auto' }}>
        {tickets.map(t => (
          <button key={t.id} onClick={() => setOpenId(t.id)} style={{
            display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px',
            border: 'none', borderBottom: `1px solid ${LINE}`, cursor: 'pointer', fontFamily: 'inherit',
            background: t.id === openId ? 'rgba(91,70,229,0.06)' : '#fff',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: MUTED }}>{t.reference}</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: TONE[t.status] ?? MUTED }}>
                {(STATUS.find(s => s.id === t.status)?.label ?? t.status).toUpperCase()}
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginTop: 3, lineHeight: 1.4 }}>{t.subject}</div>
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
              {t.personName || t.personEmail || 'No contact'} · {t.source}
            </div>
          </button>
        ))}
      </div>

      <div style={{ ...card, padding: 18, minHeight: 300 }}>
        {!openId || !detail ? (
          <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Pick a ticket to work on it.</p>
        ) : (
          <>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: '0 0 3px' }}>{String(detail.subject)}</h3>
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
              {String(detail.reference)} · from {String(detail.personEmail ?? 'no contact')} · via {String(detail.source)}
            </div>

            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
              {STATUS.map(st => (
                <button key={st.id} onClick={() => void (async () => {
                  const r = await setTicket(openId, { status: st.id, priority: String(detail.priority ?? 'normal') });
                  if (!r.success) { addNotification(r.error ?? 'Could not update.', 'error'); return; }
                  setDetail({ ...detail, status: st.id });
                  onChange();
                })()} style={{
                  padding: '6px 11px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1.5px solid ${detail.status === st.id ? ACCENT : LINE}`,
                  background: detail.status === st.id ? 'rgba(91,70,229,0.06)' : '#fff',
                  color: detail.status === st.id ? ACCENT : '#475569', fontSize: 12, fontWeight: 700,
                }}>{st.label}</button>
              ))}
            </div>

            {!!detail.body && (
              <p style={{ fontSize: 13.5, color: INK, lineHeight: 1.65, whiteSpace: 'pre-wrap', margin: '0 0 12px' }}>
                {String(detail.body)}
              </p>
            )}
            {!!detail.ai_summary && (
              <p style={{ fontSize: 12.5, color: MUTED, background: '#f8fafc', border: `1px solid ${LINE}`, borderRadius: 11, padding: '10px 12px', margin: '0 0 14px', lineHeight: 1.6 }}>
                <strong style={{ color: INK }}>What the assistant understood: </strong>{String(detail.ai_summary)}
              </p>
            )}

            <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              {messages.map((m, i) => (
                <div key={i} style={{
                  background: m.internal ? '#fffbeb' : m.role === 'customer' ? '#f1f3f7' : 'rgba(91,70,229,0.06)',
                  border: `1px solid ${m.internal ? '#fde68a' : LINE}`,
                  borderRadius: 11, padding: '9px 12px', fontSize: 13, lineHeight: 1.55, color: INK,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: MUTED, marginBottom: 3 }}>
                    {m.internal ? 'INTERNAL NOTE' : (m.author || m.role).toUpperCase()}
                  </div>
                  {m.body}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3}
                placeholder={internal ? 'A note only your team can see…' : 'Reply to the customer…'}
                style={{ flex: 1, padding: '10px 12px', border: `1px solid ${LINE}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
              <button onClick={() => void (async () => {
                if (!draft.trim()) return;
                setBusy(true);
                const r = await replyToTicket(openId, draft.trim(), internal);
                setBusy(false);
                if (!r.success) { addNotification(r.error ?? 'Could not send.', 'error'); return; }
                setDraft('');
                const again = await getTicket(openId);
                if (again.success) setMessages((again.messages ?? []) as typeof messages);
              })()} disabled={busy || !draft.trim()} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 15px', border: 'none',
                borderRadius: 11, background: busy || !draft.trim() ? '#dcdfe6' : ACCENT,
                color: busy || !draft.trim() ? '#8b93a3' : '#fff', fontSize: 13, fontWeight: 700,
                cursor: busy || !draft.trim() ? 'default' : 'pointer', fontFamily: 'inherit',
              }}>
                {busy ? <Loader size={13} className="spin" /> : <Send size={13} />} Send
              </button>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: MUTED, marginTop: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} />
              <Lock size={11} /> Internal note
            </label>
          </>
        )}
      </div>
    </div>
  );
}
