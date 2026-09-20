/**
 * The three live panels along the bottom of the Autopilot screen.
 *
 * ── The rule every one of these is written to ──
 *
 * A dashboard is the easiest place in a product to lie, because a plausible
 * number is indistinguishable from a real one until somebody acts on it. So
 * every figure here is computed from a real table: progress is steps taken over
 * steps in the graph, "sent" is the delivery log, engagement is opens over
 * sends. Where there is nothing to compute, the panel says so — it is never
 * filled with something that merely looks healthy.
 *
 * That is why there is no "+42% engagement". A percentage change needs a
 * previous week to compare against and a reason to believe the comparison; a
 * rate does not, and a rate is what this can honestly show.
 */
import { useNavigate } from 'react-router-dom';
import {
  Bot, Calendar, CheckCircle2, Clock, FileText, Image, Mail, MessageSquare,
  Send, Sparkles, TrendingUp,
} from 'lucide-react';
import type { Hub, HubTask } from '../../services/autopilot';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

const card: React.CSSProperties = {
  background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16,
  padding: 15, display: 'flex', flexDirection: 'column', gap: 11, minWidth: 0,
};

const head = (icon: React.ReactNode, title: string, right?: React.ReactNode) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
    {icon}
    <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: INK }}>{title}</h3>
    <span style={{ flex: 1 }} />
    {right}
  </div>
);

const ago = (iso: string): string => {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const mins = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
};

const at = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

/* ── What is being worked on ─────────────────────────────────────────────── */

export function AgentsInAction({ hub }: { hub: Hub | null }) {
  const agents = hub?.agents ?? [];
  return (
    <section style={card}>
      {head(<Sparkles size={14} color={ACCENT} />, 'Working on now')}

      {!agents.length ? (
        <p style={{ margin: 0, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
          Nothing is mid-flight. A workflow appears here while somebody is partway through it — between
          a wait and the step after it, for instance.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 11 }}>
          {agents.map(a => (
            <article key={a.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <span style={{
                width: 28, height: 28, borderRadius: 9, background: '#f5f3ff', color: ACCENT,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}><Bot size={14} /></span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', gap: 7, alignItems: 'baseline' }}>
                  <span style={{
                    fontSize: 12.5, fontWeight: 700, color: INK, minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{a.name}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 10.5, color: MUTED, flexShrink: 0 }}>{ago(a.updatedAt)}</span>
                </div>
                <p style={{
                  margin: '2px 0 0', fontSize: 11, color: MUTED, lineHeight: 1.45,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>Working on: {a.working}</p>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <div style={{ flex: 1, height: 5, borderRadius: 999, background: '#eef0f4', overflow: 'hidden' }}>
                    <div style={{
                      /* Steps taken over steps in the graph. A real fraction,
                         unlike a bar that fills on a timer. */
                      width: `${a.percent ?? 0}%`, height: '100%', borderRadius: 999,
                      background: ACCENT, transition: 'width 0.4s ease',
                    }} />
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: MUTED, flexShrink: 0 }}>
                    {a.percent === null ? '—' : `${a.percent}%`}
                  </span>
                </div>
                <p style={{ margin: '3px 0 0', fontSize: 10.5, color: MUTED }}>
                  {a.percent === null
                    /* Named rather than shown as finished: a run whose workflow
                       was deleted is orphaned, not complete. */
                    ? 'Its workflow has been deleted, so this run has nowhere to go.'
                    : `Step ${a.stepsTaken} of ${a.totalSteps}${a.dueAt ? ` · next ${at(a.dueAt)}` : ''}`}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── What is due ─────────────────────────────────────────────────────────── */

const TASK_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  pending: { bg: '#eef2f8', fg: '#3a4a63', label: 'Queued' },
  awaiting: { bg: '#fff7e6', fg: '#7a4d00', label: 'Needs you' },
  done: { bg: '#e8f6ee', fg: '#0f7b3d', label: 'Done' },
  failed: { bg: '#fdf3f3', fg: '#b42318', label: 'Failed' },
  skipped: { bg: '#f2f3f5', fg: '#6b7280', label: 'Skipped' },
};

const taskIcon = (t: HubTask) => {
  const k = `${t.linkKind ?? ''} ${t.summary}`.toLowerCase();
  if (/blog/.test(k)) return FileText;
  if (/social/.test(k)) return Image;
  if (/sms|text/.test(k)) return MessageSquare;
  if (/email|sequence|campaign/.test(k)) return Mail;
  return Sparkles;
};

export function TodaysTasks({ hub, filter, onFilter }: {
  hub: Hub | null;
  filter: string;
  onFilter: (f: string) => void;
}) {
  const navigate = useNavigate();
  const tasks = hub?.tasks ?? [];

  const counts = {
    all: tasks.length,
    queued: tasks.filter(t => t.status === 'pending').length,
    needs: tasks.filter(t => t.status === 'awaiting').length,
    done: tasks.filter(t => t.status === 'done').length,
  };
  const shown = tasks.filter(t =>
    filter === 'all' ? true
      : filter === 'queued' ? t.status === 'pending'
        : filter === 'needs' ? t.status === 'awaiting'
          : t.status === 'done');

  const pill = (id: string, label: string, n: number) => (
    <button key={id} onClick={() => onFilter(id)} aria-pressed={filter === id} style={{
      padding: '4px 11px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer',
      fontFamily: 'inherit',
      border: `1px solid ${filter === id ? INK : LINE}`,
      background: filter === id ? INK : '#fff',
      color: filter === id ? '#fff' : MUTED,
    }}>{label} ({n})</button>
  );

  return (
    <section style={card}>
      {head(<Calendar size={14} color={INK} />, 'Today', (
        <button onClick={() => navigate('/calendar')} style={{
          border: 'none', background: 'none', color: MUTED, fontSize: 11, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit', padding: 0,
        }}>Calendar</button>
      ))}

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {pill('all', 'All', counts.all)}
        {pill('queued', 'Queued', counts.queued)}
        {pill('needs', 'Needs you', counts.needs)}
        {pill('done', 'Done', counts.done)}
      </div>

      {!shown.length ? (
        <p style={{ margin: 0, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
          {tasks.length
            ? 'Nothing under that filter.'
            : 'Nothing queued or carried out in the last day. Autopilot plans once a day per project.'}
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 7, maxHeight: 300, overflowY: 'auto' }}>
          {shown.map(t => {
            const Ic = taskIcon(t);
            const tone = TASK_TONE[t.status] ?? TASK_TONE.pending;
            return (
              <li key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 10.5, color: MUTED, width: 52, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {/* The time it is due, or the time it happened. Blank rather
                      than invented when a row carries neither. */}
                  {at(t.dueAt ?? t.actedAt) || '—'}
                </span>
                <span style={{
                  width: 22, height: 22, borderRadius: 7, background: '#f5f6f8', color: MUTED,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}><Ic size={11} /></span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{
                    display: 'block', fontSize: 12, fontWeight: 700, color: INK,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{t.summary}</span>
                  {t.project && (
                    <span style={{ display: 'block', fontSize: 10, color: MUTED }}>{t.project}</span>
                  )}
                </span>
                <span style={{
                  padding: '2px 8px', borderRadius: 999, fontSize: 9.5, fontWeight: 800,
                  background: tone.bg, color: tone.fg, flexShrink: 0,
                }}>{tone.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ── What has left the building ──────────────────────────────────────────── */

export function RecentlyPublished({ hub }: { hub: Hub | null }) {
  const navigate = useNavigate();
  const made = hub?.published.made ?? [];
  const sent = hub?.published.sent ?? [];
  const week = hub?.week;

  const rows = [
    ...made.map(m => ({
      id: m.id, title: m.linkLabel || m.summary, kind: m.linkKind, at: m.actedAt,
      state: 'Published', route: m.linkRoute,
    })),
    ...sent.map(s => ({
      id: s.id, title: s.subject || s.sourceName || 'Message',
      kind: s.channel === 'sms' ? 'sms' : 'email', at: s.createdAt,
      state: s.status === 'sent' ? 'Sent' : s.status === 'suppressed' ? 'Opted out' : 'Failed',
      route: '/engagement?tab=delivery',
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 8);

  return (
    <section style={card}>
      {head(<CheckCircle2 size={14} color="#0f7b3d" />, 'Recently out')}

      {!rows.length ? (
        <p style={{ margin: 0, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
          Nothing has gone out in the last week.
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
          {rows.map(r => (
            <li key={r.id}>
              <button onClick={() => r.route && navigate(r.route)} style={{
                display: 'flex', gap: 8, alignItems: 'center', width: '100%', textAlign: 'left',
                border: 'none', background: 'none', padding: 0, cursor: r.route ? 'pointer' : 'default',
                fontFamily: 'inherit',
              }}>
                <span style={{
                  width: 26, height: 26, borderRadius: 8, background: '#f5f6f8', color: MUTED,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {r.kind === 'sms' ? <MessageSquare size={12} />
                    : r.kind === 'email' ? <Mail size={12} />
                      : r.kind === 'social-post' ? <Image size={12} />
                        : <FileText size={12} />}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{
                    display: 'block', fontSize: 12, fontWeight: 700, color: INK,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{r.title}</span>
                  <span style={{ display: 'block', fontSize: 10, color: MUTED }}>{ago(r.at)}</span>
                </span>
                <span style={{
                  padding: '2px 8px', borderRadius: 999, fontSize: 9.5, fontWeight: 800, flexShrink: 0,
                  background: r.state === 'Failed' ? '#fdf3f3' : r.state === 'Opted out' ? '#f2f3f5' : '#e8f6ee',
                  color: r.state === 'Failed' ? '#b42318' : r.state === 'Opted out' ? '#6b7280' : '#0f7b3d',
                }}>{r.state}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ── The week, counted ── */}
      <div style={{
        borderTop: `1px solid ${LINE}`, paddingTop: 10, display: 'flex',
        gap: 12, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          This week
        </span>
        <Stat icon={<FileText size={11} />} n={week?.contentCreated ?? 0} label="made" />
        <Stat icon={<Mail size={11} />} n={week?.emailsSent ?? 0} label="emails" />
        <Stat icon={<Send size={11} />} n={week?.smsSent ?? 0} label="texts" />
        <Stat
          icon={<TrendingUp size={11} />}
          /* Null when nothing was sent. A 0% on a quiet week reads as a failure
             rather than as a quiet week — and inventing a flattering delta is
             the single most tempting lie on a panel like this. */
          n={week?.openRate ?? null}
          label="opened"
          suffix="%"
        />
      </div>
      {week?.openRate !== null && week?.openRate !== undefined && (
        <p style={{ margin: 0, fontSize: 10, color: MUTED, lineHeight: 1.5 }}>
          {/* The caveat that makes the number usable rather than misleading. */}
          Opens are a floor — a mail client that blocks images never reports one.
        </p>
      )}
    </section>
  );
}

function Stat({ icon, n, label, suffix = '' }: {
  icon: React.ReactNode; n: number | null; label: string; suffix?: string;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ color: MUTED, display: 'flex' }}>{icon}</span>
      <strong style={{ fontSize: 13, fontWeight: 800, color: INK }}>
        {n === null ? '—' : `${n}${suffix}`}
      </strong>
      <span style={{ fontSize: 10.5, color: MUTED }}>{label}</span>
    </span>
  );
}

export { Clock };
