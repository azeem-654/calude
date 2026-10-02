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
 *
 * ── Live, without a refresh button ──
 *
 * While this screen is visible it asks every four seconds what has changed
 * since its last look: conversations touched (new ones included) and, for the
 * thread that is open, the messages since. Both answers are small, both are
 * de-duplicated by id, and the cursor is the server's clock. The thread on
 * screen counts as read; every other one shows how many messages are waiting.
 * A refresh button that the owner had to press to find out somebody had
 * written was the bug this replaced.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bot, Loader, Send, User, Lock, CornerUpLeft, Paperclip, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  chatFileUrl, getConversation, inboxSync, rememberChatFile, replyToConversation, replyWithImage,
  resumeAi, setConversation,
  type Conversation, type ConversationMessage,
} from '../../services/engagement';
import { parseAttachments, pastedImage, shrinkImage, type ChatAttachment, type ShrunkImage } from '../../services/chatImage';
import { refreshSupport } from '../../services/supportPulse';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

/* Four seconds: a reply typed in the widget is on this screen before the
   person who sent it has looked up. Hidden tabs do not ask at all. */
const SYNC_MS = 4000;

function useNarrow(px: number) {
  const q = `(max-width: ${px}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(q);
    if (!mq) return;
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return narrow;
}

export default function EngageInbox({ conversations, onChange, onRows }: {
  conversations: Conversation[];
  onChange: () => void;
  /** Conversations the server says changed — merged into the list by id. A
      partial row changes only the fields it names. */
  onRows: (rows: (Partial<Conversation> & { id: string })[]) => void;
}) {
  const { addNotification } = useApp();
  const [params] = useSearchParams();
  const [openId, setOpenId] = useState(() => params.get('c') ?? '');
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [tickets, setTickets] = useState<{ reference: string; subject: string; status: string }[]>([]);
  const [draft, setDraft] = useState('');
  const [image, setImage] = useState<ShrunkImage | null>(null);
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState('');
  const narrow = useNarrow(760);
  const fileRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  /* Cursors and what is already known, in refs: the sync loop reads them on
     every tick and must not restart because one moved. */
  const listCursor = useRef('');
  const msgCursor = useRef('');
  const openRef = useRef(openId);
  const known = useRef(new Set<string>());
  useEffect(() => {
    for (const c of conversations) known.current.add(c.id);
    if (!listCursor.current) {
      /* The newest change the server has told us about is a server time —
         a safe place to start asking from. */
      const newest = conversations.reduce((m, c) => (c.updatedAt && c.updatedAt > m ? c.updatedAt : m), '');
      if (newest) listCursor.current = newest;
    }
  }, [conversations]);

  const load = useCallback(async (id: string) => {
    const r = await getConversation(id);
    if (openRef.current !== id || !r.success) return;
    setMessages((r.messages ?? []) as ConversationMessage[]);
    setDetail((r.conversation ?? null) as Record<string, unknown> | null);
    setTickets((r.tickets ?? []) as typeof tickets);
    msgCursor.current = String(r.cursor ?? '');
    /* Opening it read it: the dot goes, here and on the badges. */
    onRows([{ id, unread: 0 }]);
    refreshSupport();
  }, [onRows]);

  useEffect(() => {
    openRef.current = openId;
    msgCursor.current = '';
    /* Nothing to clear when none is open: the thread is not drawn. */
    if (!openId) return;
    void load(openId);
  }, [openId, load]);

  /* ── The loop ── */
  const sync = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    const id = openRef.current;
    const r = await inboxSync({
      since: listCursor.current || undefined,
      conversationId: id && msgCursor.current ? id : undefined,
      msgSince: id ? msgCursor.current || undefined : undefined,
      seen: document.visibilityState === 'visible',
    });
    if (!r.success) return;
    const first = !listCursor.current;
    listCursor.current = String(r.cursor ?? listCursor.current);
    const rows = (r.conversations ?? []) as Conversation[];
    if (rows.length) {
      const fresh = rows.filter(c => !known.current.has(c.id));
      for (const c of rows) known.current.add(c.id);
      onRows(rows.map(c => (c.id === openRef.current ? { ...c, unread: 0 } : c)));
      if (!first && fresh.length) {
        addNotification(fresh.length === 1
          ? `New conversation from ${fresh[0].personName || fresh[0].personEmail || 'a visitor'}.`
          : `${fresh.length} new conversations.`, 'info');
      }
      refreshSupport();
    }
    if (id && id === openRef.current && msgCursor.current) {
      msgCursor.current = String(r.cursor ?? msgCursor.current);
      const incoming = (r.messages ?? []) as ConversationMessage[];
      if (incoming.length) {
        setMessages(prev => {
          const have = new Set(prev.map(m => m.id));
          const add = incoming.filter(m => !have.has(m.id));
          return add.length ? [...prev, ...add] : prev;
        });
      }
      const t = r.thread as Record<string, unknown> | null;
      if (t) setDetail(prev => (prev && prev.handled_by !== t.handled_by ? { ...prev, handled_by: t.handled_by } : prev));
    }
  }, [onRows, addNotification]);

  /* One loop for the life of the screen. The latest `sync` is read through a
     ref: it changes whenever the app's notifier does, and restarting the loop
     each time sent a second request on top of the first. */
  const syncRef = useRef(sync);
  useEffect(() => { syncRef.current = sync; }, [sync]);
  useEffect(() => {
    let alive = true;
    let timer = 0;
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      window.clearTimeout(timer);
      try { await syncRef.current(); } catch { /* the next tick tries again */ } finally {
        running = false;
        if (alive) timer = window.setTimeout(() => void tick(), SYNC_MS);
      }
    };
    void tick();
    const onVis = () => { if (document.visibilityState === 'visible') void tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  /* Keep the newest message in view, unless somebody has scrolled up to read. */
  const lastCount = useRef(0);
  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    const grew = messages.length > lastCount.current;
    const wasFirst = lastCount.current === 0;
    lastCount.current = messages.length;
    if (!grew) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    if (wasFirst || nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);
  useEffect(() => { lastCount.current = 0; }, [openId]);

  const takePicture = async (file: File | null | undefined) => {
    if (!file) return;
    try { setImage(await shrinkImage(file)); } catch (e) {
      addNotification(e instanceof Error ? e.message : 'That picture could not be used.', 'error');
    }
  };

  const send = async () => {
    if ((!draft.trim() && !image) || !openId) return;
    setBusy(true);
    const r = image
      ? await replyWithImage(openId, draft.trim(), image, internal)
      : await replyToConversation(openId, draft.trim(), internal);
    setBusy(false);
    if (!r.success) { addNotification(r.error ?? 'Could not send that.', 'error'); return; }
    if (image && typeof r.id === 'string') {
      /* Drawn from the copy already in this page rather than fetched back. */
      const again = await getConversation(openId);
      if (again.success) {
        const sent = ((again.messages ?? []) as ConversationMessage[]).find(m => m.id === r.id);
        const a = sent ? parseAttachments(sent.attachments)[0] : undefined;
        if (a) rememberChatFile(a.id, image.data);
        setMessages((again.messages ?? []) as ConversationMessage[]);
        msgCursor.current = String(again.cursor ?? msgCursor.current);
      }
    } else {
      const again = await getConversation(openId);
      if (again.success) {
        setMessages((again.messages ?? []) as ConversationMessage[]);
        setDetail((again.conversation ?? null) as Record<string, unknown> | null);
        msgCursor.current = String(again.cursor ?? msgCursor.current);
      }
    }
    setDraft('');
    setImage(null);
    onChange();
    refreshSupport();
  };

  const card: React.CSSProperties = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16 };

  if (conversations.length === 0) {
    return (
      <div style={{ ...card, padding: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: INK, margin: '0 0 6px' }}>No conversations yet</h3>
        <p style={{ fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.65, maxWidth: '62ch' }}>
          Conversations arrive here when somebody uses a chat widget on a website. Build an AI agent, make a
          widget, paste the snippet into your site, and this becomes the shared inbox for everybody who gets
          in touch. New ones appear on their own — there is no need to refresh.
        </p>
      </div>
    );
  }

  const handedOver = String(detail?.handled_by ?? '') === 'human';
  const canSend = !busy && (!!draft.trim() || !!image);
  const showList = !narrow || !openId;
  const showThread = !narrow || !!openId;

  return (
    <div style={{
      display: 'grid', gap: 14, alignItems: 'start',
      gridTemplateColumns: narrow ? 'minmax(0, 1fr)' : 'minmax(0, 320px) minmax(0, 1fr)',
    }}>
      {showList && (
        <div style={{ ...card, overflow: 'hidden', maxHeight: '70vh', overflowY: 'auto' }} data-testid="inbox-list">
          {conversations.map(c => {
            const on = c.id === openId;
            const waiting = !!c.needsHumanSince && c.status === 'open';
            const unread = on ? 0 : Number(c.unread ?? 0);
            return (
              <button key={c.id} onClick={() => setOpenId(c.id)} data-conversation={c.id} style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px',
                border: 'none', borderBottom: `1px solid ${LINE}`, cursor: 'pointer', fontFamily: 'inherit',
                background: on ? 'rgba(91,70,229,0.06)' : '#fff',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  {waiting
                    ? <User size={13} color="#b42318" />
                    : <Bot size={13} color={MUTED} />}
                  <span style={{ fontSize: 13, fontWeight: unread ? 800 : 700, color: INK, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.personName || c.personEmail || 'Anonymous visitor'}
                  </span>
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    {waiting && (
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#b42318' }}>WAITING</span>
                    )}
                    {unread > 0 && (
                      <span aria-label={`${unread} unread`} data-unread={unread} style={{
                        minWidth: 18, height: 18, padding: '0 5px', boxSizing: 'border-box', borderRadius: 999,
                        background: ACCENT, color: '#fff', fontSize: 10.5, fontWeight: 800,
                        display: 'inline-grid', placeItems: 'center',
                      }}>{unread > 99 ? '99+' : unread}</span>
                    )}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: MUTED, marginTop: 3, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                  {c.aiSummary || c.intent || c.pageUrl || 'Chat'}
                </div>
                <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 3 }}>
                  {new Date(c.lastAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showThread && (
        <div style={{ ...card, padding: 18, minHeight: 320, minWidth: 0 }}>
          {!openId ? (
            <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Pick a conversation to read it.</p>
          ) : (
            <>
              {/* The context a human needs before typing a word. */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', paddingBottom: 12, borderBottom: `1px solid ${LINE}`, marginBottom: 12 }}>
                {narrow && (
                  <button onClick={() => setOpenId('')} style={ghost} aria-label="Back to the conversations">← All</button>
                )}
                <span style={{ fontSize: 14, fontWeight: 800, color: INK }}>
                  {String(detail?.personName ?? '') || String(detail?.personEmail ?? '') || 'Anonymous visitor'}
                </span>
                {!!detail?.personEmail && (
                  <span style={{ fontSize: 12, color: MUTED, overflowWrap: 'anywhere' }}>{String(detail.personEmail)}</span>
                )}
                {!!detail?.page_url && (
                  <span style={{ fontSize: 11.5, color: MUTED, overflowWrap: 'anywhere' }}>on {String(detail.page_url)}</span>
                )}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
                  {handedOver && (
                    <button onClick={() => void (async () => {
                      await resumeAi(openId); onChange(); refreshSupport();
                      const r = await getConversation(openId);
                      if (r.success) setDetail((r.conversation ?? null) as Record<string, unknown> | null);
                    })()} title="Let the assistant answer again" style={ghost}>
                      <CornerUpLeft size={12} /> Give back to AI
                    </button>
                  )}
                  <button onClick={() => void (async () => { await setConversation(openId, 'closed'); onChange(); refreshSupport(); })()} style={ghost}>
                    Close
                  </button>
                </span>
              </div>

              {tickets.length > 0 && (
                <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>
                  Also has {tickets.map(t => `${t.reference} (${t.status})`).join(', ')}
                </div>
              )}

              <div ref={threadRef} data-testid="thread" style={{ display: 'grid', gap: 9, maxHeight: '42vh', overflowY: 'auto', marginBottom: 12 }}>
                {messages.map(m => {
                  const files = parseAttachments(m.attachments);
                  return (
                    <div key={m.id} data-message={m.id} style={{
                      justifySelf: m.role === 'visitor' ? 'start' : 'end',
                      maxWidth: '78%', minWidth: 0,
                      background: m.internal ? '#fffbeb' : m.role === 'visitor' ? '#f1f3f7' : ACCENT,
                      color: m.internal ? '#78350f' : m.role === 'visitor' ? INK : '#fff',
                      border: m.internal ? '1px solid #fde68a' : 'none',
                      borderRadius: 13, padding: '9px 12px', fontSize: 13, lineHeight: 1.55,
                      whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 800, opacity: 0.75, marginBottom: 3, letterSpacing: '0.04em' }}>
                        {m.internal ? 'INTERNAL NOTE' : m.role === 'visitor' ? 'CUSTOMER' : m.role === 'ai' ? 'ASSISTANT' : m.role === 'system' ? 'SYSTEM' : (m.author || 'YOU').toUpperCase()}
                      </div>
                      {m.body}
                      {files.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: m.body ? 6 : 0 }}>
                          {files.map(a => <ChatImage key={a.id} a={a} onOpen={setLightbox} />)}
                        </div>
                      )}
                      {/* Where the answer came from. Shown so a wrong retrieval is
                          visible rather than laundered into confident prose. */}
                      {m.role === 'ai' && m.sources && m.sources !== '[]' && (
                        <div style={{ fontSize: 10.5, opacity: 0.8, marginTop: 5 }}>
                          from: {(JSON.parse(m.sources) as { title: string }[]).map(s => s.title).join(', ')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {image && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: 6, border: `1px solid ${LINE}`, borderRadius: 10, marginBottom: 8 }}>
                  <img src={image.data} alt="Picture to send" style={{ height: 54, maxWidth: 120, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
                  <span style={{ fontSize: 12, color: MUTED }}>{image.w}×{image.h}</span>
                  <button type="button" onClick={() => setImage(null)} aria-label="Remove the picture" style={{ ...ghost, padding: 4 }}>
                    <X size={13} />
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { void takePicture(e.target.files?.[0]); e.target.value = ''; }} />
                <button type="button" data-field="image" onClick={() => fileRef.current?.click()}
                  title="Attach a screenshot or picture (or paste one into the box)"
                  aria-label="Attach a picture"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, flexShrink: 0,
                    border: `1px solid ${LINE}`, borderRadius: 11, background: '#fff', color: '#475569', cursor: 'pointer',
                  }}>
                  <Paperclip size={15} />
                </button>
                <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} data-field="message"
                  onPaste={e => { const f = pastedImage(e); if (f) { e.preventDefault(); void takePicture(f); } }}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }}
                  placeholder={internal ? 'A note only your team can see…' : 'Reply to the customer…'}
                  aria-label={internal ? 'Internal note' : 'Reply'}
                  style={{
                    flex: 1, minWidth: 0, padding: '10px 12px', border: `1px solid ${LINE}`, borderRadius: 11,
                    fontSize: 13.5, fontFamily: 'inherit', resize: 'vertical', outline: 'none',
                  }} />
                <button onClick={() => void send()} disabled={!canSend} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 15px', flexShrink: 0,
                  border: 'none', borderRadius: 11, background: canSend ? ACCENT : '#dcdfe6',
                  color: canSend ? '#fff' : '#8b93a3', fontSize: 13, fontWeight: 700,
                  cursor: canSend ? 'pointer' : 'default', fontFamily: 'inherit',
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
      )}

      {lightbox && (
        <div role="dialog" aria-label="Picture, full size" onClick={() => setLightbox('')}
          onKeyDown={e => { if (e.key === 'Escape') setLightbox(''); }} tabIndex={-1}
          ref={el => el?.focus()}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(15,23,42,0.84)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 16, cursor: 'zoom-out', outline: 'none',
          }}>
          <img src={lightbox} alt="Picture sent in the chat" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, background: '#fff' }} />
        </div>
      )}
    </div>
  );
}

/** A picture in the thread: fetched with the session, opened full size on a click. */
function ChatImage({ a, onOpen }: { a: ChatAttachment; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    chatFileUrl(a.id).then(u => { if (alive) setUrl(u); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [a.id]);
  const ratio = a.w && a.h ? `${a.w} / ${a.h}` : undefined;
  if (failed) {
    return <span style={{ fontSize: 12, padding: '6px 8px', borderRadius: 8, background: 'rgba(0,0,0,0.06)' }}>Picture unavailable</span>;
  }
  return (
    <button type="button" onClick={() => url && onOpen(url)} aria-label="Open the picture full size" data-attachment={a.id}
      style={{
        padding: 0, border: 'none', borderRadius: 9, overflow: 'hidden', cursor: url ? 'zoom-in' : 'default',
        background: 'rgba(0,0,0,0.08)', width: a.w ? Math.min(220, a.w) : 160, maxWidth: '100%',
        aspectRatio: ratio, maxHeight: 240, display: 'block',
      }}>
      {url && <img src={url} alt="Picture sent in the chat" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />}
    </button>
  );
}

const ghost: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px',
  border: `1px solid ${LINE}`, borderRadius: 8, background: '#fff', color: INK,
  fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
