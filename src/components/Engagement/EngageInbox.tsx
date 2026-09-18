/**
 * The agent inbox.
 *
 * ── What a human needs when they pick a conversation up ──
 *
 * Everything the assistant already knows, without the customer being asked to
 * start again. That is the whole point of the handover: the transcript, who
 * they are, what they have raised before, and what the assistant thought it was
 * about. All of it arrives in one call rather than four, because a screen that
 * loads a customer's history in pieces is a screen an agent starts replying on
 * before it has finished.
 */
import { useEffect, useState } from 'react';
import { Bot, Loader, Send, User, Lock, CornerUpLeft } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  getConversation, replyToConversation, resumeAi, setConversation,
  type Conversation, type ConversationMessage,
} from '../../services/engagement';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

export default function EngageInbox({ conversations, onChange }: {
  conversations: Conversation[];
  onChange: () => void;
}) {
  const { addNotification } = useApp();
  const [openId, setOpenId] = useState('');
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [tickets, setTickets] = useState<{ reference: string; subject: string; status: string }[]>([]);
  const [draft, setDraft] = useState('');
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!openId) { setMessages([]); setDetail(null); return; }
    let alive = true;
    void (async () => {
      const r = await getConversation(openId);
      if (!alive || !r.success) return;
      setMessages((r.messages ?? []) as ConversationMessage[]);
      setDetail((r.conversation ?? null) as Record<string, unknown> | null);
      setTickets((r.tickets ?? []) as typeof tickets);
    })();
    return () => { alive = false; };
  }, [openId]);

  const send = async () => {
    if (!draft.trim() || !openId) return;
    setBusy(true);
    const r = await replyToConversation(openId, draft.trim(), internal);
    setBusy(false);
    if (!r.success) { addNotification(r.error ?? 'Could not send that.', 'error'); return; }
    setDraft('');
    const again = await getConversation(openId);
    if (again.success) setMessages((again.messages ?? []) as ConversationMessage[]);
    onChange();
  };

  const card: React.CSSProperties = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16 };

  if (conversations.length === 0) {
    return (
      <div style={{ ...card, padding: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: INK, margin: '0 0 6px' }}>No conversations yet</h3>
        <p style={{ fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.65, maxWidth: '62ch' }}>
          Conversations arrive here when somebody uses a chat widget on a website. Build an AI agent, make a
          widget, paste the snippet into your site, and this becomes the shared inbox for everybody who gets
          in touch.
        </p>
      </div>
    );
  }

  const handedOver = String(detail?.handled_by ?? '') === 'human';

  return (
    <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0, 320px) minmax(0, 1fr)', alignItems: 'start' }}>
      <div style={{ ...card, overflow: 'hidden', maxHeight: '70vh', overflowY: 'auto' }}>
        {conversations.map(c => {
          const on = c.id === openId;
          const waiting = c.handledBy === 'human' && c.status === 'open';
          return (
            <button key={c.id} onClick={() => setOpenId(c.id)} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px',
              border: 'none', borderBottom: `1px solid ${LINE}`, cursor: 'pointer', fontFamily: 'inherit',
              background: on ? 'rgba(91,70,229,0.06)' : '#fff',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                {waiting
                  ? <User size={13} color="#b42318" />
                  : <Bot size={13} color={MUTED} />}
                <span style={{ fontSize: 13, fontWeight: 700, color: INK, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.personName || c.personEmail || 'Anonymous visitor'}
                </span>
                {waiting && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, color: '#b42318' }}>WAITING</span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: MUTED, marginTop: 3, lineHeight: 1.45 }}>
                {c.aiSummary || c.intent || c.pageUrl || 'Chat'}
              </div>
              <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 3 }}>
                {new Date(c.lastAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ ...card, padding: 18, minHeight: 320 }}>
        {!openId ? (
          <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Pick a conversation to read it.</p>
        ) : (
          <>
            {/* The context a human needs before typing a word. */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', paddingBottom: 12, borderBottom: `1px solid ${LINE}`, marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: INK }}>
                {String(detail?.personName ?? '') || String(detail?.personEmail ?? '') || 'Anonymous visitor'}
              </span>
              {!!detail?.personEmail && (
                <span style={{ fontSize: 12, color: MUTED }}>{String(detail.personEmail)}</span>
              )}
              {!!detail?.page_url && (
                <span style={{ fontSize: 11.5, color: MUTED }}>on {String(detail.page_url)}</span>
              )}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
                {handedOver && (
                  <button onClick={() => void (async () => {
                    await resumeAi(openId); onChange();
                    const r = await getConversation(openId);
                    if (r.success) setDetail((r.conversation ?? null) as Record<string, unknown> | null);
                  })()} title="Let the assistant answer again" style={ghost}>
                    <CornerUpLeft size={12} /> Give back to AI
                  </button>
                )}
                <button onClick={() => void (async () => { await setConversation(openId, 'closed'); onChange(); })()} style={ghost}>
                  Close
                </button>
              </span>
            </div>

            {tickets.length > 0 && (
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>
                Also has {tickets.map(t => `${t.reference} (${t.status})`).join(', ')}
              </div>
            )}

            <div style={{ display: 'grid', gap: 9, maxHeight: '42vh', overflowY: 'auto', marginBottom: 12 }}>
              {messages.map(m => (
                <div key={m.id} style={{
                  justifySelf: m.role === 'visitor' ? 'start' : 'end',
                  maxWidth: '78%',
                  background: m.internal ? '#fffbeb' : m.role === 'visitor' ? '#f1f3f7' : ACCENT,
                  color: m.internal ? '#78350f' : m.role === 'visitor' ? INK : '#fff',
                  border: m.internal ? '1px solid #fde68a' : 'none',
                  borderRadius: 13, padding: '9px 12px', fontSize: 13, lineHeight: 1.55,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 800, opacity: 0.75, marginBottom: 3, letterSpacing: '0.04em' }}>
                    {m.internal ? 'INTERNAL NOTE' : m.role === 'visitor' ? 'CUSTOMER' : m.role === 'ai' ? 'ASSISTANT' : m.role === 'system' ? 'SYSTEM' : (m.author || 'YOU').toUpperCase()}
                  </div>
                  {m.body}
                  {/* Where the answer came from. Shown so a wrong retrieval is
                      visible rather than laundered into confident prose. */}
                  {m.role === 'ai' && m.sources && m.sources !== '[]' && (
                    <div style={{ fontSize: 10.5, opacity: 0.8, marginTop: 5 }}>
                      from: {(JSON.parse(m.sources) as { title: string }[]).map(s => s.title).join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2}
                placeholder={internal ? 'A note only your team can see…' : 'Reply to the customer…'}
                style={{
                  flex: 1, padding: '10px 12px', border: `1px solid ${LINE}`, borderRadius: 11,
                  fontSize: 13.5, fontFamily: 'inherit', resize: 'vertical', outline: 'none',
                }} />
              <button onClick={() => void send()} disabled={busy || !draft.trim()} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 15px',
                border: 'none', borderRadius: 11, background: busy || !draft.trim() ? '#dcdfe6' : ACCENT,
                color: busy || !draft.trim() ? '#8b93a3' : '#fff', fontSize: 13, fontWeight: 700,
                cursor: busy || !draft.trim() ? 'default' : 'pointer', fontFamily: 'inherit',
              }}>
                {busy ? <Loader size={13} className="spin" /> : <Send size={13} />} Send
              </button>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: MUTED, marginTop: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} />
              <Lock size={11} /> Internal note — the customer never sees this, and it does not take the
              conversation off the assistant
            </label>
          </>
        )}
      </div>
    </div>
  );
}

const ghost: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px',
  border: `1px solid ${LINE}`, borderRadius: 8, background: '#fff', color: INK,
  fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
