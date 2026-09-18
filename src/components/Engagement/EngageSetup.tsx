/**
 * The setup checklist.
 *
 * ── Why a checklist and not a wizard ──
 *
 * A wizard assumes an order and a single sitting. Setting this up is neither:
 * connecting a calendar needs a Google account somebody may not have to hand,
 * and writing knowledge is an afternoon's work that can happen after the chat
 * is already live. A wizard would make somebody either finish or abandon.
 *
 * The checklist reads the real state on every load, so it cannot claim
 * something is done that is not — and each row says what *stops working*
 * without it, rather than only what it is. "Add knowledge" is advice; "without
 * this the assistant can only say it does not know" is a reason.
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, Circle, ExternalLink, Loader, RefreshCw } from 'lucide-react';
import { calendarStatus, listOf, getSettings } from '../../services/engagement';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';
const GREEN = '#0f7b3d';

interface Step {
  id: string;
  label: string;
  why: string;
  done: boolean;
  /* Where to go and do it. A tab in this module, or a route elsewhere. */
  goTab?: string;
  goHref?: string;
  note?: string;
}

export default function EngageSetup({ onGo }: { onGo: (tab: string) => void }) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [busy, setBusy] = useState(true);

  const read = useCallback(async () => {
    setBusy(true);
    const [agents, articles, widgets, forms, cal, settings] = await Promise.all([
      listOf('agent'), listOf('article'), listOf('widget'), listOf('form'),
      calendarStatus(), getSettings(),
    ]);

    const live = (r: Record<string, unknown>) =>
      ((r.items ?? []) as { status?: string }[]).filter(i => i.status === 'live' || i.status === 'published');
    const s = (settings.settings ?? {}) as Record<string, unknown>;

    setSteps([
      {
        id: 'settings', label: 'Say who you are', goTab: 'settings',
        why: 'Your business name and the addresses that get told when somebody gets in touch. Without the addresses, everything still arrives — you just are not told about it.',
        done: !!String(s.business_name ?? '') && !!String(s.notify_emails ?? ''),
      },
      {
        id: 'agent', label: 'Build an AI agent', goTab: 'agents',
        why: 'What it knows about you, how it sounds, and what it is allowed to do. Without a live agent a chat widget still takes messages, but nobody answers until a person does.',
        done: live(agents).length > 0,
      },
      {
        id: 'knowledge', label: 'Give it something to answer from', goTab: 'knowledge',
        why: 'Published articles are the only thing it may quote. With none, it is honest and useless — it will say it does not know and offer a person, every time.',
        done: live(articles).length > 0,
        note: 'Three or four articles covering what you are asked most is enough to start.',
      },
      {
        id: 'widget', label: 'Make a chat widget', goTab: 'widgets',
        why: 'The chat box on your website, and the one line of HTML that puts it there.',
        done: live(widgets).length > 0,
      },
      {
        id: 'install', label: 'Paste the snippet into your website', goTab: 'widgets',
        why: 'Copy the embed code from the widget and put it before </body> on your site. Until that is on a page, nothing can reach you through it.',
        /* Cannot be detected from here: whether a snippet is on somebody else's
           website is not a fact this app has. Left permanently unticked rather
           than guessed, because a tick nobody earned is worse than a box. */
        done: false,
        note: 'This one stays unticked — we cannot see your website, so we will not pretend to know.',
      },
      {
        id: 'form', label: 'Make a form', goTab: 'forms',
        why: 'For the people who would rather write than chat. Every submission is kept whole and becomes a contact.',
        done: live(forms).length > 0,
      },
      {
        id: 'mailbox', label: 'Connect a mailbox', goHref: '/settings?tab=email-sms',
        why: 'Notifications go out from your own mailbox so replies come back to you. Without one they are held, not lost, and go out when you connect one.',
        done: false,
        note: 'Check Settings → Email & SMS. This list cannot read your mailbox settings, so it does not claim to.',
      },
      {
        id: 'calendar', label: 'Connect a calendar', goTab: 'meetings',
        why: 'Lets the assistant offer times that are really free, and puts a Google Meet link on every booking. Without it, booking still works — there is just no video link.',
        done: ((cal.connections ?? []) as { status?: string }[]).some(c => c.status === 'connected'),
        note: cal.configured === false
          ? 'No Google client is configured on this installation yet, so this cannot be connected.'
          : undefined,
      },
    ]);
    setBusy(false);
  }, []);

  useEffect(() => { void read(); }, [read]);

  const doneCount = steps.filter(x => x.done).length;

  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: 0, flex: 1 }}>Getting this working</h3>
        <span style={{ fontSize: 12.5, color: MUTED, fontWeight: 700 }}>{doneCount} of {steps.length}</span>
        <button onClick={() => void read()} disabled={busy} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px',
          border: `1px solid ${LINE}`, borderRadius: 8, background: '#fff', color: INK,
          fontSize: 11.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
        }}>
          {busy ? <Loader size={11} className="spin" /> : <RefreshCw size={11} />} Re-check
        </button>
      </div>
      <p style={{ fontSize: 12.5, color: MUTED, margin: '0 0 14px', lineHeight: 1.6, maxWidth: '74ch' }}>
        Checked against what is actually saved, every time you open this. You can do these in any order, and
        the parts you skip simply do less rather than breaking.
      </p>

      <div style={{ display: 'grid', gap: 8 }}>
        {steps.map(st => (
          <div key={st.id} style={{
            display: 'flex', gap: 11, alignItems: 'flex-start',
            border: `1px solid ${LINE}`, borderRadius: 12, padding: '12px 13px',
            background: st.done ? 'rgba(15,123,61,0.04)' : '#fff',
          }}>
            {st.done
              ? <Check size={15} color={GREEN} style={{ flexShrink: 0, marginTop: 2 }} />
              : <Circle size={15} color="#cbd2df" style={{ flexShrink: 0, marginTop: 2 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{st.label}</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 3, lineHeight: 1.6 }}>{st.why}</div>
              {st.note && (
                <div style={{ fontSize: 11.5, color: '#b45309', marginTop: 4, lineHeight: 1.5 }}>{st.note}</div>
              )}
            </div>
            {st.goTab && (
              <button onClick={() => onGo(st.goTab!)} style={goBtn}>Open</button>
            )}
            {st.goHref && (
              <a href={st.goHref} style={{ ...goBtn, textDecoration: 'none' }}>
                Open <ExternalLink size={10} />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const goBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px',
  border: `1px solid ${LINE}`, borderRadius: 8, background: '#fff',
  color: ACCENT, fontSize: 11.5, fontWeight: 800, cursor: 'pointer',
  fontFamily: 'inherit', flexShrink: 0,
};
