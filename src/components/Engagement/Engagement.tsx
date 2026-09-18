/**
 * Customer Engagement — one module, eight screens.
 *
 * ── Why this is one module and not eight nav entries ──
 *
 * A chat, a form, a ticket and a knowledge article are four faces of the same
 * job: a stranger trying to reach this business, and somebody here answering.
 * Splitting them across the nav would make a customer configure four products
 * to get one behaviour, and would hide the fact that the AI agent answering the
 * chat is the same one triaging the form.
 *
 * ── The one number worth reading twice ──
 *
 * "Waiting on a person" is on the overview in its own right, because it is the
 * only count where a delay costs something. Open conversations and open tickets
 * are workload; a conversation the assistant has already handed over and nobody
 * has picked up is a customer sitting in front of a chat window.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  MessageSquare, Ticket as TicketIcon, FileText, Bot, BookOpen, Code2,
  Settings as SettingsIcon, LayoutDashboard, Loader, RefreshCw, Users, Mic,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  listConversations, listTickets, mergeCaptured, overview,
  type Conversation, type EngageCounts, type Ticket,
} from '../../services/engagement';
import EngageInbox from './EngageInbox';
import EngageTickets from './EngageTickets';
import EngageBuilder from './EngageBuilder';
import EngageSettings from './EngageSettings';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

type Tab = 'overview' | 'inbox' | 'tickets' | 'forms' | 'agents' | 'knowledge' | 'widgets' | 'voice' | 'settings';

const TABS: { id: Tab; label: string; icon: typeof Bot }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'inbox', label: 'Conversations', icon: MessageSquare },
  { id: 'tickets', label: 'Tickets', icon: TicketIcon },
  { id: 'forms', label: 'Forms', icon: FileText },
  { id: 'agents', label: 'AI agents', icon: Bot },
  { id: 'knowledge', label: 'Knowledge', icon: BookOpen },
  { id: 'widgets', label: 'Widgets', icon: Code2 },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export default function Engagement() {
  const { addNotification } = useApp();
  const [tab, setTab] = useState<Tab>('overview');
  const [counts, setCounts] = useState<EngageCounts | null>(null);
  const [recent, setRecent] = useState<{ kind: string; summary: string; createdAt: string }[]>([]);
  const [resolution, setResolution] = useState({ conversations: 0, escalated: 0 });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [busy, setBusy] = useState(true);
  const [merging, setMerging] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    const [o, c, t] = await Promise.all([overview(), listConversations(), listTickets()]);
    if (o.success) {
      setCounts(o.counts as EngageCounts);
      setRecent((o.recent ?? []) as typeof recent);
      setResolution((o.resolution ?? { conversations: 0, escalated: 0 }) as typeof resolution);
    }
    if (c.success) setConversations((c.conversations ?? []) as Conversation[]);
    if (t.success) setTickets((t.tickets ?? []) as Ticket[]);
    setBusy(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  /*
   * Pulling public captures into the CRM.
   *
   * On the browser because the browser is the only writer of `crm_contacts` —
   * see the note in services/engagement.ts. Run on open rather than behind a
   * button: a lead that arrived overnight should be in the contact list by the
   * time somebody looks, not waiting for them to press something they do not
   * know about.
   */
  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await mergeCaptured();
      if (!alive || !r.added) return;
      addNotification(`${r.added} new ${r.added === 1 ? 'contact' : 'contacts'} added from forms and chat.`, 'success');
    })();
    return () => { alive = false; };
  }, [addNotification]);

  const card: React.CSSProperties = {
    background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 18,
  };

  const stat = (label: string, value: number, hint?: string, warn?: boolean) => (
    <div key={label} style={{ ...card, padding: 16 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: warn && value > 0 ? '#b42318' : INK, letterSpacing: '-0.02em' }}>
        {value}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, marginTop: 2 }}>{label}</div>
      {hint && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 3, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );

  return (
    <div style={{ padding: 'clamp(16px, 3vw, 28px)', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{ fontSize: 'clamp(21px, 3vw, 27px)', fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.03em' }}>
            Customer Engagement
          </h1>
          <p style={{ fontSize: 13.5, color: MUTED, margin: '5px 0 0', lineHeight: 1.6, maxWidth: '70ch' }}>
            Everything a customer of yours can use to reach you — a chat on your website, a form, a ticket,
            a booking — and everything you use to answer. It is the same system Protected Central uses for
            its own customers.
          </p>
        </div>
        <button onClick={() => void refresh()} disabled={busy} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px',
          border: `1px solid ${LINE}`, borderRadius: 10, background: '#fff', color: INK,
          fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
        }}>
          {busy ? <Loader size={14} className="spin" /> : <RefreshCw size={14} />} Refresh
        </button>
      </div>

      <div role="tablist" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 20, borderBottom: `1px solid ${LINE}`, paddingBottom: 10 }}>
        {TABS.map(({ id, label, icon: Ic }) => {
          const on = tab === id;
          const badge = id === 'inbox' ? (counts?.waitingOnHuman ?? 0)
            : id === 'tickets' ? (counts?.openTickets ?? 0) : 0;
          return (
            <button key={id} role="tab" aria-selected={on} onClick={() => setTab(id)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px',
              borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: on ? 'rgba(91,70,229,0.08)' : 'transparent',
              color: on ? ACCENT : '#475569', fontSize: 13, fontWeight: on ? 800 : 600,
            }}>
              <Ic size={14} /> {label}
              {badge > 0 && (
                <span style={{
                  fontSize: 10.5, fontWeight: 800, background: ACCENT, color: '#fff',
                  borderRadius: 999, padding: '1px 6px',
                }}>{badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(170px, 100%), 1fr))' }}>
            {stat('Waiting on a person', counts?.waitingOnHuman ?? 0,
              'Somebody is sitting in front of a chat window', true)}
            {stat('Open conversations', counts?.openConversations ?? 0)}
            {stat('Open tickets', counts?.openTickets ?? 0)}
            {stat('New submissions', counts?.newSubmissions ?? 0)}
            {stat('People captured', counts?.people ?? 0, 'From forms, chat and voice')}
          </div>

          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))' }}>
            <div style={card}>
              <h3 style={{ fontSize: 14.5, fontWeight: 800, color: INK, margin: '0 0 4px' }}>How much the assistant handles</h3>
              {resolution.conversations === 0 ? (
                <p style={{ fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.6 }}>
                  No conversations yet. This fills in once a widget is live on a website.
                </p>
              ) : (
                <>
                  <div style={{ fontSize: 26, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>
                    {Math.round(((resolution.conversations - resolution.escalated) / resolution.conversations) * 100)}%
                  </div>
                  <p style={{ fontSize: 12.5, color: MUTED, margin: '4px 0 0', lineHeight: 1.6 }}>
                    finished without asking for a person — {resolution.escalated} of {resolution.conversations} were
                    handed over. A number that is too high is worth reading as a knowledge base with gaps in it,
                    not as a good assistant.
                  </p>
                </>
              )}
            </div>

            <div style={{ ...card, gridColumn: 'span 2', minWidth: 0 }}>
              <h3 style={{ fontSize: 14.5, fontWeight: 800, color: INK, margin: '0 0 10px' }}>What has happened</h3>
              {recent.length === 0 ? (
                <p style={{ fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.6 }}>
                  Nothing yet. Build an AI agent, put a widget on your website, and this becomes the log of
                  everybody who got in touch.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: 7 }}>
                  {recent.slice(0, 12).map((e, i) => (
                    <div key={`${e.createdAt}-${i}`} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 13 }}>
                      <span style={{ color: MUTED, fontSize: 11.5, width: 96, flexShrink: 0 }}>
                        {new Date(e.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span style={{ color: INK, minWidth: 0 }}>{e.summary || e.kind}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ ...card, background: '#f8fafc' }}>
            <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginBottom: 7 }}>
              <Users size={15} color={ACCENT} />
              <h3 style={{ fontSize: 14, fontWeight: 800, color: INK, margin: 0 }}>How captures reach your contacts</h3>
            </div>
            <p style={{ fontSize: 12.5, color: MUTED, margin: 0, lineHeight: 1.65 }}>
              Anything a form or a chat captures is stored on the server first, then added to your contact list
              when you open this screen. It works that way round on purpose: your contacts are edited in this
              browser, and a server writing them at the same time would overwrite a lead the moment you had the
              app open. Nothing is ever overwritten — an address you already have is matched and left alone.
            </p>
            <button onClick={() => void (async () => {
              setMerging(true);
              const r = await mergeCaptured();
              setMerging(false);
              addNotification(
                r.error ? r.error : `${r.added} added, ${r.matched} already in your contacts.`,
                r.error ? 'error' : 'success',
              );
              void refresh();
            })()} disabled={merging} style={{
              marginTop: 11, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px',
              border: `1px solid ${LINE}`, borderRadius: 9, background: '#fff', color: INK,
              fontSize: 12.5, fontWeight: 700, cursor: merging ? 'default' : 'pointer', fontFamily: 'inherit',
            }}>
              {merging ? <Loader size={13} className="spin" /> : <RefreshCw size={13} />} Pull new captures now
            </button>
          </div>
        </div>
      )}

      {tab === 'inbox' && <EngageInbox conversations={conversations} onChange={() => void refresh()} />}
      {tab === 'tickets' && <EngageTickets tickets={tickets} onChange={() => void refresh()} />}
      {tab === 'forms' && <EngageBuilder kind="form" onChange={() => void refresh()} />}
      {tab === 'agents' && <EngageBuilder kind="agent" onChange={() => void refresh()} />}
      {tab === 'knowledge' && <EngageBuilder kind="article" onChange={() => void refresh()} />}
      {tab === 'widgets' && <EngageBuilder kind="widget" onChange={() => void refresh()} />}
      {tab === 'voice' && <EngageBuilder kind="voice_agent" onChange={() => void refresh()} />}
      {tab === 'settings' && <EngageSettings />}
    </div>
  );
}
