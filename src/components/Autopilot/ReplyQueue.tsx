/**
 * Replies Autopilot wrote, waiting for you to say yes.
 *
 * The customer's message is shown above the draft, always. Approving a reply
 * without seeing what it answers is not approval — it is clicking a button —
 * and the whole reason these are held is that somebody should read them.
 *
 * The reply is editable in place and Send takes whatever is on screen. Making
 * the edit a separate save step is how somebody rewrites a reply, presses Send,
 * and watches the old version go out.
 */
import { useState } from 'react';
import { Send, Trash2, ChevronDown, ChevronRight, Loader, User } from 'lucide-react';
import type { ReplyDraft } from '../../services/replies';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';

export default function ReplyQueue({ drafts, onSend, onDiscard, busy }: {
  drafts: ReplyDraft[];
  onSend: (id: string, subject: string, body: string) => void;
  onDiscard: (id: string) => void;
  busy?: boolean;
}) {
  /*
   * The first reply is open unless you have chosen otherwise.
   *
   * `useState(drafts[0]?.id)` looked right and was wrong: the list arrives from
   * the server after the first render, so the initialiser ran against an empty
   * array and every draft stayed collapsed. The one thing this queue exists for
   * is reading the words before they go out, and it was showing a list of
   * headlines instead.
   *
   * `null` here means "not chosen yet" and falls through to the first; an
   * explicit '' means the customer closed it.
   */
  const [chosenId, setChosenId] = useState<string | null>(null);
  const openId = chosenId === null ? (drafts[0]?.id ?? null) : (chosenId || null);
  const setOpenId = (id: string | null) => setChosenId(id ?? '');
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string }>>({});

  if (!drafts.length) return null;

  const draftOf = (d: ReplyDraft) => edits[d.id] ?? { subject: d.subject, body: d.body };
  const setDraft = (id: string, patch: Partial<{ subject: string; body: string }>) =>
    setEdits(p => ({ ...p, [id]: { ...(p[id] ?? { subject: '', body: '' }), ...patch } as { subject: string; body: string } }));

  return (
    <div style={{ background: '#fff', border: `1px solid #f0d68a`, borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ padding: '13px 15px', borderBottom: `1px solid ${LINE}`, background: '#fff8e1', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Send size={15} color="#8a6d00" />
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#8a6d00' }}>
          {drafts.length} repl{drafts.length === 1 ? 'y is' : 'ies are'} written and waiting for you
        </h3>
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {drafts.map(d => {
          const open = openId === d.id;
          const cur = draftOf(d);
          return (
            <li key={d.id} style={{ borderBottom: `1px solid ${LINE}` }}>
              <button onClick={() => setOpenId(open ? null : d.id)} aria-expanded={open}
                style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '13px 15px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
                {open ? <ChevronDown size={15} style={{ marginTop: 2, flexShrink: 0 }} /> : <ChevronRight size={15} style={{ marginTop: 2, flexShrink: 0 }} />}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: INK }}>
                    {d.to.name || d.to.email} — {d.incoming.subject || '(no subject)'}
                  </span>
                  <span style={{ display: 'block', fontSize: 12.5, color: MUTED, marginTop: 3, lineHeight: 1.5 }}>
                    waiting because {d.because}
                  </span>
                </span>
                {/* Confidence is the AI's own answer to "did your knowledge base
                    cover this?" — worth showing, and worth not dressing up as
                    more than that. */}
                <span style={{ flexShrink: 0, fontSize: 11.5, color: MUTED, fontWeight: 600 }}>
                  {d.confidence}% covered
                </span>
              </button>

              {open && (
                <div style={{ padding: '0 15px 15px 40px', display: 'grid', gap: 12 }}>
                  {/* What they actually asked. Above the reply, always. */}
                  <div style={{ padding: 12, borderRadius: 10, background: '#f7f8fa', border: `1px solid ${LINE}` }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: MUTED }}>
                      <User size={12} /> {d.to.name || d.to.email} wrote
                    </span>
                    <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#3a4150', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {d.incoming.body.slice(0, 900)}{d.incoming.body.length > 900 ? '…' : ''}
                    </p>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Subject</label>
                    <input value={cur.subject} onChange={e => setDraft(d.id, { subject: e.target.value })}
                      style={{ width: '100%', padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 9, fontSize: 13, color: INK, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                      Reply — edit it if you want; Send uses exactly what is here
                    </label>
                    <textarea value={cur.body} onChange={e => setDraft(d.id, { body: e.target.value })} rows={10}
                      style={{ width: '100%', padding: '10px 12px', border: `1px solid ${LINE}`, borderRadius: 9, fontSize: 13, color: INK, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical' }} />
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => onSend(d.id, cur.subject, cur.body)} disabled={busy || !cur.body.trim()}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', border: 'none', borderRadius: 9, background: cur.body.trim() ? INK : '#c3c7cd', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: busy || !cur.body.trim() ? 'default' : 'pointer' }}>
                      {busy ? <Loader size={13} /> : <Send size={13} />} Send to {d.to.email}
                    </button>
                    <button onClick={() => onDiscard(d.id)} disabled={busy}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', border: `1px solid ${LINE}`, borderRadius: 9, background: '#fff', color: MUTED, fontSize: 12.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
                      <Trash2 size={13} /> Discard
                    </button>
                    {d.ruleName && (
                      <span style={{ alignSelf: 'center', fontSize: 11.5, color: MUTED }}>
                        matched your rule “{d.ruleName}”
                      </span>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
