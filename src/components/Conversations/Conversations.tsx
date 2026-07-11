import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Send, Mail, Inbox, Plus, RefreshCw, Sparkles, Zap, Settings2,
  AlertTriangle, Smile, Meh, Frown, Wifi, WifiOff, Reply,
  Tag, CheckCircle2, Clock, Activity, MessageSquare, Edit2, Trash2,
} from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import MailboxSetup from './MailboxSetup';
import { sendEmail, loadEmailConfig } from '../../services/emailService';
import { draftEmailReply } from '../../lib/gemini';
import { hasGeminiKey } from '../../lib/gemini';
import {
  loadMailboxes, saveMailboxes, fetchInbox, matchAutoReplyRule,
  updateMessageState, appendAutoReplyLog, loadAutoReplyLog,
} from '../../services/mailboxService';
import type { Mailbox, InboxMessage } from '../../services/mailboxService';

const INK = '#17191c';
const MUTED = '#8a8f98';
const FAINT = '#b0b4ba';

const SENTIMENT = {
  positive: { icon: Smile, color: '#3f9142', bg: '#e9f4e6', label: 'Positive' },
  neutral:  { icon: Meh,   color: '#7c828c', bg: '#f0f1f3', label: 'Neutral' },
  negative: { icon: Frown, color: '#e5484d', bg: '#fceaea', label: 'Negative' },
} as const;
const PRIORITY = {
  low:    { color: '#7c828c', bg: '#f0f1f3', label: 'Low' },
  normal: { color: '#3e63dd', bg: '#eceff9', label: 'Normal' },
  high:   { color: '#d97706', bg: '#fdf5e7', label: 'High' },
  urgent: { color: '#e5484d', bg: '#fceaea', label: 'Urgent' },
} as const;

const SNIPPETS = [
  { label: 'Thanks', text: 'Thanks so much for reaching out! ' },
  { label: 'Looking into it', text: 'Thanks for flagging this — I\'m looking into it now and will get back to you shortly. ' },
  { label: 'Ask for details', text: 'Could you share a bit more detail so I can help faster? Specifically: ' },
  { label: 'Book a call', text: 'Happy to help! Would a quick call work? You can grab a time here: ' },
];

function relTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function initials(name: string) { return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(); }

export default function Conversations() {
  const { addNotification, conversations } = useApp();
  const [mailboxes, setMailboxes] = useState<Mailbox[]>(loadMailboxes);
  const [activeMbId, setActiveMbId] = useState<string>('all');
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [selectedUid, setSelectedUid] = useState<string>('');   // `${mailboxId}:${uid}`
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'urgent'>('all');
  const [loading, setLoading] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [editMb, setEditMb] = useState<Mailbox | undefined>();
  const [showLog, setShowLog] = useState(false);

  // reply composer
  const [reply, setReply] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState('');
  const autoRunRef = useRef<Set<string>>(new Set());

  const persist = (list: Mailbox[]) => { setMailboxes(list); saveMailboxes(list); };

  /* ── Load all mailbox inboxes (takes the list explicitly to avoid stale closures) ── */
  const refreshList = useCallback(async (list: Mailbox[], silent = false) => {
    if (list.length === 0) { setMessages([]); return; }
    if (!silent) setLoading(true);
    let demo = false;
    const all: InboxMessage[] = [];
    const results = await Promise.all(list.map(mb => fetchInbox(mb, 20)));
    results.forEach(res => {
      if (res.demo) demo = true;
      all.push(...res.messages);
    });
    all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setMessages(all);
    setDemoMode(demo);
    setLoading(false);
    runAutoReplies(all, list);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback((silent = false) => refreshList(mailboxes, silent), [mailboxes, refreshList]);

  // fetch whenever the mailbox list changes, and poll live every 60s
  useEffect(() => { refreshList(mailboxes); }, [mailboxes, refreshList]);
  useEffect(() => {
    const t = setInterval(() => refreshList(mailboxes, true), 60000);
    return () => clearInterval(t);
  }, [mailboxes, refreshList]);

  /* ── Auto-reply engine ── */
  const runAutoReplies = async (msgs: InboxMessage[], list: Mailbox[]) => {
    for (const mb of list) {
      if (mb.autoReplyRules.every(r => !r.enabled)) continue;
      const mbMsgs = msgs.filter(m => m.mailboxId === mb.id);
      const seenSenders = new Set<string>();
      // oldest-first so "first contact" detection is correct
      for (const msg of [...mbMsgs].reverse()) {
        const key = `${mb.id}:${msg.uid}`;
        const isFirst = !seenSenders.has(msg.from);
        seenSenders.add(msg.from);
        if (msg.autoRepliedAt || autoRunRef.current.has(key)) continue;
        const rule = matchAutoReplyRule(mb, msg, isFirst);
        if (!rule) continue;
        autoRunRef.current.add(key);
        if (!hasGeminiKey()) continue;
        try {
          const drafted = await draftEmailReply(mb.profile, msg, rule.instruction);
          if (rule.mode === 'auto_send' && !drafted.needsHuman) {
            await sendReplyRaw(mb, msg, drafted.subject, drafted.body);
            updateMessageState(mb.id, msg.uid, { autoRepliedAt: new Date().toISOString(), status: 'closed' });
            setMessages(prev => prev.map(m => m.mailboxId === mb.id && m.uid === msg.uid ? { ...m, autoRepliedAt: new Date().toISOString(), status: 'closed' } : m));
            addNotification(`🤖 Auto-replied to ${msg.fromName} on ${mb.label}`, 'success');
          }
          appendAutoReplyLog({
            id: `arl-${Date.now()}-${msg.uid}`, mailboxLabel: mb.label, ruleName: rule.name || rule.match.type,
            to: msg.from, subject: drafted.subject, mode: (rule.mode === 'auto_send' && !drafted.needsHuman) ? 'auto_send' : 'draft', at: new Date().toISOString(),
          });
          if (rule.mode === 'draft' || drafted.needsHuman) {
            updateMessageState(mb.id, msg.uid, { status: 'pending' });
            setMessages(prev => prev.map(m => m.mailboxId === mb.id && m.uid === msg.uid ? { ...m, status: 'pending' } : m));
          }
          persist(mailboxes.map(x => x.id === mb.id ? { ...x, autoReplyRules: x.autoReplyRules.map(r => r.id === rule.id ? { ...r, runs: r.runs + 1 } : r) } : x));
        } catch { /* AI failed — skip */ }
      }
    }
  };

  const sendReplyRaw = async (mb: Mailbox, msg: InboxMessage, subject: string, body: string) => {
    const cfg = loadEmailConfig();
    // Prefer the mailbox's own SMTP identity
    return sendEmail(
      { ...cfg, provider: cfg.provider === 'none' ? 'smtp' : cfg.provider, fromName: mb.fromName || mb.profile.companyName || mb.label, fromEmail: mb.address || mb.smtpUser },
      { to: msg.from, toName: msg.fromName, subject, html: body.replace(/\n/g, '<br>') },
    );
  };

  /* ── Derived ── */
  const activeMb = mailboxes.find(m => m.id === activeMbId);
  const visible = messages
    .filter(m => activeMbId === 'all' || m.mailboxId === activeMbId)
    .filter(m => filter === 'all' || (filter === 'unread' && !m.seen) || (filter === 'urgent' && m.priority === 'urgent'))
    .filter(m => !search || m.subject.toLowerCase().includes(search.toLowerCase()) || m.fromName.toLowerCase().includes(search.toLowerCase()) || m.snippet.toLowerCase().includes(search.toLowerCase()));

  const selected = messages.find(m => `${m.mailboxId}:${m.uid}` === selectedUid);
  const selectedMb = selected ? mailboxes.find(m => m.id === selected.mailboxId) : undefined;
  const unreadOf = (mbId: string) => messages.filter(m => m.mailboxId === mbId && !m.seen).length;

  const openMessage = (m: InboxMessage) => {
    setSelectedUid(`${m.mailboxId}:${m.uid}`);
    setReply(''); setNote('');
    if (!m.seen) {
      updateMessageState(m.mailboxId, m.uid, {});
      setMessages(prev => prev.map(x => x.mailboxId === m.mailboxId && x.uid === m.uid ? { ...x, seen: true } : x));
    }
  };

  /* ── Actions ── */
  const aiDraft = async () => {
    if (!selected || !selectedMb) return;
    if (!hasGeminiKey()) { addNotification('No Gemini API key configured — add one to draft AI replies.', 'error'); return; }
    setDrafting(true);
    try {
      const d = await draftEmailReply(selectedMb.profile, selected, '');
      setReply(d.body);
      if (d.needsHuman) addNotification('AI wasn\'t fully confident — please review before sending.', 'info');
    } catch (e) {
      addNotification(e instanceof Error ? e.message : 'AI draft failed', 'error');
    } finally { setDrafting(false); }
  };

  const send = async () => {
    if (!selected || !selectedMb || !reply.trim()) return;
    setSending(true);
    try {
      const res = await sendReplyRaw(selectedMb, selected, `Re: ${selected.subject}`, reply);
      if (res.success) {
        addNotification(`Reply sent to ${selected.fromName}`, 'success');
        updateMessageState(selected.mailboxId, selected.uid, { status: 'closed' });
        setMessages(prev => prev.map(m => m === selected ? { ...m, status: 'closed' } : m));
        setReply('');
      } else {
        addNotification(res.error || 'Send failed — check the mailbox SMTP settings.', 'error');
      }
    } finally { setSending(false); }
  };

  const setStatus = (s: InboxMessage['status']) => {
    if (!selected) return;
    updateMessageState(selected.mailboxId, selected.uid, { status: s });
    setMessages(prev => prev.map(m => m === selected ? { ...m, status: s } : m));
  };
  const addTag = (t: string) => {
    if (!selected || !t.trim()) return;
    const tags = [...(selected.tags ?? []), t.trim()];
    updateMessageState(selected.mailboxId, selected.uid, { tags });
    setMessages(prev => prev.map(m => m === selected ? { ...m, tags } : m));
  };

  const saveMailbox = (mb: Mailbox) => {
    const exists = mailboxes.some(x => x.id === mb.id);
    const next = exists ? mailboxes.map(x => x.id === mb.id ? mb : x) : [...mailboxes, mb];
    persist(next);   // the [mailboxes] effect re-fetches automatically
    setSetupOpen(false); setEditMb(undefined);
    addNotification(`Mailbox "${mb.label}" ${exists ? 'updated' : 'connected'}`, 'success');
  };
  const removeMailbox = (id: string) => {
    persist(mailboxes.filter(x => x.id !== id));
    if (activeMbId === id) setActiveMbId('all');
  };

  const log = loadAutoReplyLog();

  /* ── Empty state (no mailboxes) ── */
  if (mailboxes.length === 0) {
    return (
      <div style={{ minHeight: '100vh' }}>
        <Header title="Conversations" subtitle="A live shared inbox for every mailbox" />
        <div style={{ padding: '60px 28px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ maxWidth: 460, textAlign: 'center', background: 'rgba(255,255,255,0.6)', borderRadius: 24, padding: '40px 32px' }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
              <Inbox size={28} color="#fff" />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: INK, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Connect your first mailbox</h2>
            <p style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.6, margin: '0 0 22px' }}>
              Bring incoming email into a live shared inbox. Each mailbox gets its own company profile, so AI-drafted and auto-sent replies always speak in that brand's voice with its own knowledge.
            </p>
            <button onClick={() => { setEditMb(undefined); setSetupOpen(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', background: INK, color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              <Plus size={16} /> Connect a Mailbox
            </button>
            {conversations.length > 0 && (
              <p style={{ fontSize: 11.5, color: FAINT, marginTop: 18 }}>You also have {conversations.length} legacy chat/SMS threads.</p>
            )}
          </div>
        </div>
        {setupOpen && <MailboxSetup initial={editMb} onSave={saveMailbox} onClose={() => setSetupOpen(false)} />}
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header title="Conversations" subtitle={`${mailboxes.length} mailbox${mailboxes.length > 1 ? 'es' : ''} · ${messages.filter(m => !m.seen).length} unread`} />

      <div style={{ padding: '10px 28px 0', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* connection status */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, padding: '5px 12px', borderRadius: 999, background: demoMode ? '#fdf5e7' : '#e9f4e6', color: demoMode ? '#c77414' : '#3f9142' }}>
          {demoMode ? <WifiOff size={12} /> : <Wifi size={12} />}
          {demoMode ? 'Demo inbox' : 'Live'}
        </span>
        <button onClick={() => refresh()} disabled={loading} style={btn(false)}>
          <RefreshCw size={13} style={loading ? { animation: 'spin 0.8s linear infinite' } : undefined} /> Refresh
        </button>
        <button onClick={() => setShowLog(v => !v)} style={btn(showLog)}>
          <Activity size={13} /> Auto-reply log{log.length ? ` (${log.length})` : ''}
        </button>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={() => { setEditMb(undefined); setSetupOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: INK, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={14} /> Connect Mailbox
          </button>
        </div>
      </div>

      {showLog && (
        <div style={{ margin: '12px 28px 0', background: 'rgba(255,255,255,0.65)', borderRadius: 16, padding: 16, maxHeight: 200, overflowY: 'auto' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: INK, marginBottom: 8 }}>Auto-reply activity</div>
          {log.length === 0 ? <p style={{ fontSize: 12.5, color: MUTED, margin: 0 }}>No auto-replies yet.</p> : log.map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f2f3f5' }}>
              <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: e.mode === 'auto_send' ? '#e9f4e6' : '#eceff9', color: e.mode === 'auto_send' ? '#3f9142' : '#3e63dd' }}>
                {e.mode === 'auto_send' ? 'SENT' : 'DRAFTED'}
              </span>
              <span style={{ fontSize: 12.5, color: INK, fontWeight: 600 }}>{e.mailboxLabel}</span>
              <span style={{ fontSize: 12, color: MUTED, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>→ {e.to} · {e.subject}</span>
              <span style={{ fontSize: 11, color: FAINT }}>{relTime(e.at)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, padding: '14px 28px 28px', height: 'calc(100vh - 150px)' }}>

        {/* ── Mailbox rail ── */}
        <div style={{ width: 210, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button onClick={() => setActiveMbId('all')} style={railItem(activeMbId === 'all')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <Inbox size={15} /> <span style={{ fontWeight: 600 }}>All inboxes</span>
            </div>
            {messages.filter(m => !m.seen).length > 0 && <span style={badge(activeMbId === 'all')}>{messages.filter(m => !m.seen).length}</span>}
          </button>
          {mailboxes.map(mb => (
            <button key={mb.id} onClick={() => setActiveMbId(mb.id)} style={railItem(activeMbId === mb.id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: mb.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mb.label}</span>
              </div>
              {unreadOf(mb.id) > 0 && <span style={badge(activeMbId === mb.id)}>{unreadOf(mb.id)}</span>}
            </button>
          ))}
          {activeMb && (
            <div style={{ marginTop: 4, padding: '10px 12px', background: 'rgba(255,255,255,0.6)', borderRadius: 12 }}>
              <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, marginBottom: 6 }}>{activeMb.profile.companyName || activeMb.label}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => { setEditMb(activeMb); setSetupOpen(true); }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px', border: '1px solid #e6e9f0', borderRadius: 8, background: '#fff', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', color: INK }}><Settings2 size={12} /> Edit</button>
                <button onClick={() => removeMailbox(activeMb.id)} style={{ padding: '6px 9px', border: '1px solid #f4d4d4', borderRadius: 8, background: '#fceaea', cursor: 'pointer', display: 'flex' }}><Trash2 size={12} color="#e5484d" /></button>
              </div>
              {activeMb.autoReplyRules.filter(r => r.enabled).length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 11, color: '#3f9142', fontWeight: 600 }}>
                  <Zap size={11} /> {activeMb.autoReplyRules.filter(r => r.enabled).length} auto-reply rule{activeMb.autoReplyRules.filter(r => r.enabled).length > 1 ? 's' : ''} active
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Message list ── */}
        <div style={{ width: 340, flexShrink: 0, background: '#fff', borderRadius: 18, boxShadow: '0 1px 2px rgba(23,25,28,0.05)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: 12, borderBottom: '1px solid #f2f3f5' }}>
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: FAINT }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search inbox…" style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1px solid #e6e9f0', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['all', 'unread', 'urgent'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{ flex: 1, padding: '5px', border: 'none', borderRadius: 8, background: filter === f ? INK : '#f0f1f3', color: filter === f ? '#fff' : '#5c6066', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize' }}>{f}</button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {visible.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: FAINT }}>
                <Mail size={26} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.4 }} />
                <p style={{ fontSize: 13, margin: 0 }}>No messages</p>
              </div>
            )}
            {visible.map(m => {
              const mb = mailboxes.find(x => x.id === m.mailboxId);
              const sel = `${m.mailboxId}:${m.uid}` === selectedUid;
              const S = SENTIMENT[m.sentiment ?? 'neutral'];
              return (
                <div key={`${m.mailboxId}:${m.uid}`} onClick={() => openMessage(m)}
                  style={{ padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid #f6f7f8', borderLeft: `3px solid ${sel ? INK : 'transparent'}`, background: sel ? '#f7f8f9' : m.seen ? '#fff' : '#fcfdff' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 999, background: mb?.color ?? INK, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>{initials(m.fromName)}</div>
                      {!m.seen && <span style={{ position: 'absolute', top: -1, right: -1, width: 9, height: 9, borderRadius: 999, background: '#3e63dd', border: '2px solid #fff' }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: m.seen ? 600 : 800, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.fromName}</span>
                        <span style={{ fontSize: 10.5, color: FAINT, flexShrink: 0 }}>{relTime(m.date)}</span>
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: m.seen ? 500 : 700, color: m.seen ? '#5c6066' : INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{m.subject}</div>
                      <div style={{ fontSize: 11.5, color: FAINT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.snippet}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                        {m.priority && m.priority !== 'normal' && <span style={chip(PRIORITY[m.priority].bg, PRIORITY[m.priority].color)}>{m.priority === 'urgent' && <AlertTriangle size={9} />}{PRIORITY[m.priority].label}</span>}
                        <span style={chip(S.bg, S.color)}><S.icon size={9} />{S.label}</span>
                        {m.autoRepliedAt && <span style={chip('#e9f4e6', '#3f9142')}><Zap size={9} />Auto-replied</span>}
                        {m.status === 'pending' && <span style={chip('#fdf5e7', '#c77414')}>Needs review</span>}
                        {activeMbId === 'all' && mb && <span style={{ fontSize: 10, color: FAINT }}>{mb.label}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Reading + reply pane ── */}
        <div style={{ flex: 1, background: '#fff', borderRadius: 18, boxShadow: '0 1px 2px rgba(23,25,28,0.05)', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: FAINT }}>
              <MessageSquare size={44} style={{ opacity: 0.3, marginBottom: 14 }} />
              <p style={{ fontSize: 14, margin: 0 }}>Select a message to read and reply</p>
            </div>
          ) : (
            <>
              {/* Message header */}
              <div style={{ padding: '16px 22px', borderBottom: '1px solid #f2f3f5' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: '0 0 4px', letterSpacing: '-0.02em' }}>{selected.subject}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: MUTED }}>
                      <div style={{ width: 22, height: 22, borderRadius: 999, background: selectedMb?.color ?? INK, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700 }}>{initials(selected.fromName)}</div>
                      <span style={{ fontWeight: 600, color: INK }}>{selected.fromName}</span>
                      <span>&lt;{selected.from}&gt;</span>
                      <span>· {relTime(selected.date)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => setStatus('pending')} title="Mark pending" style={iconBtn(selected.status === 'pending')}><Clock size={14} /></button>
                    <button onClick={() => setStatus('closed')} title="Mark resolved" style={iconBtn(selected.status === 'closed')}><CheckCircle2 size={14} /></button>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  {selected.priority && <span style={chip(PRIORITY[selected.priority].bg, PRIORITY[selected.priority].color)}>{selected.priority === 'urgent' && <AlertTriangle size={9} />}{PRIORITY[selected.priority].label} priority</span>}
                  {(() => { const S = SENTIMENT[selected.sentiment ?? 'neutral']; return <span style={chip(S.bg, S.color)}><S.icon size={9} />{S.label}</span>; })()}
                  {(selected.tags ?? []).map(t => <span key={t} style={chip('#eceff9', '#3e63dd')}><Tag size={9} />{t}</span>)}
                  <button onClick={() => { const t = prompt('Add tag'); if (t) addTag(t); }} style={{ ...chip('#f0f1f3', '#5c6066'), border: 'none', cursor: 'pointer' }}><Plus size={9} /> Tag</button>
                </div>
              </div>

              {/* Message body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
                <div style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                  {selected.bodyType === 'HTML'
                    ? <div dangerouslySetInnerHTML={{ __html: selected.body }} />
                    : selected.body}
                </div>
                {note && (
                  <div style={{ marginTop: 16, padding: '10px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, fontSize: 12.5, color: '#92400e' }}>
                    <strong>Internal note:</strong> {note}
                  </div>
                )}
              </div>

              {/* Composer */}
              <div style={{ borderTop: '1px solid #f2f3f5', padding: '12px 22px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                  <button onClick={aiDraft} disabled={drafting} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: INK, color: '#fff', border: 'none', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                    <Sparkles size={13} /> {drafting ? 'Drafting…' : 'AI draft reply'}
                  </button>
                  {SNIPPETS.map(s => (
                    <button key={s.label} onClick={() => setReply(r => r + s.text)} style={{ padding: '6px 11px', background: '#f0f1f3', color: '#5c6066', border: 'none', borderRadius: 999, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>{s.label}</button>
                  ))}
                  <button onClick={() => { const n = prompt('Internal note (not sent to customer)'); if (n) setNote(n); }} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', borderRadius: 999, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}><Edit2 size={11} /> Note</button>
                </div>
                <div style={{ position: 'relative' }}>
                  <textarea value={reply} onChange={e => setReply(e.target.value)} placeholder={`Reply to ${selected.fromName}…  (${selectedMb?.profile.companyName || selectedMb?.label} voice)`} rows={4}
                    style={{ width: '100%', padding: '12px 14px', border: '1px solid #e6e9f0', borderRadius: 12, fontSize: 13.5, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                  <span style={{ fontSize: 11.5, color: FAINT, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Reply size={12} /> Sending as {selectedMb?.fromName || selectedMb?.label} &lt;{selectedMb?.address}&gt;
                  </span>
                  <button onClick={send} disabled={sending || !reply.trim()} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', background: reply.trim() ? INK : '#c7cbd1', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: reply.trim() ? 'pointer' : 'not-allowed' }}>
                    <Send size={14} /> {sending ? 'Sending…' : 'Send reply'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {setupOpen && <MailboxSetup initial={editMb} onSave={saveMailbox} onClose={() => { setSetupOpen(false); setEditMb(undefined); }} />}
    </div>
  );
}

/* ── style helpers ── */
function btn(active: boolean): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', border: '1px solid #e6e9f0', borderRadius: 10, background: active ? INK : '#fff', color: active ? '#fff' : '#374151', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' };
}
function railItem(active: boolean): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', border: 'none', borderRadius: 12, background: active ? INK : 'rgba(255,255,255,0.6)', color: active ? '#fff' : INK, fontSize: 13, cursor: 'pointer', textAlign: 'left', width: '100%' };
}
function badge(active: boolean): React.CSSProperties {
  return { minWidth: 18, height: 18, borderRadius: 999, background: active ? 'rgba(255,255,255,0.25)' : INK, color: '#fff', fontSize: 10.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' };
}
function chip(bg: string, color: string): React.CSSProperties {
  return { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: bg, color };
}
function iconBtn(active: boolean): React.CSSProperties {
  return { width: 32, height: 32, borderRadius: 9, border: '1px solid #e6e9f0', background: active ? INK : '#fff', color: active ? '#fff' : '#5c6066', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
}
