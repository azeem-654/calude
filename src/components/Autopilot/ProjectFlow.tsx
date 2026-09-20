/**
 * One project's working day, drawn as a flow.
 *
 * ── What this column is for ──
 *
 * The left of a project dashboard answers "what has it done". This answers the
 * harder question: "is it still going, and what happens next". Those are not
 * the same, and the second is the one a customer paying monthly actually wants
 * — a list of finished work says nothing about whether the thing is alive.
 *
 * So every stage carries its own state: what it did today, whether it is the
 * step running now, and when the next one is due. A stage with nothing behind
 * it stays grey and says what it is waiting for rather than pretending.
 *
 * ── Why the movement is real and not decoration ──
 *
 * The travelling light on a connector only runs while the project is running.
 * Pause it and the chart goes still, because a paused project that still looks
 * busy is a lie told in CSS. Everything moving is a rule in index.css inside a
 * `prefers-reduced-motion` block, never an inline animation — an inline one
 * cannot be reached by a media query, which this codebase has now been caught
 * by three times.
 */
import { Bot, FileText, Image, Mail, MessageSquare, Globe, Users, Clock } from 'lucide-react';
import type { AutopilotAction, ProjectDay } from '../../services/autopilot';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

/**
 * The working day, in the order it happens.
 *
 * Matched on the action's `kind` and its effect rather than on its wording: the
 * summaries are written by a model and would change under us, and a chart that
 * quietly stopped matching would show an idle day on a busy project.
 */
const STAGES: { key: string; label: string; icon: typeof Bot; match: (a: AutopilotAction) => boolean; idle: string }[] = [
  {
    key: 'think', label: 'Reads the business', icon: Bot,
    match: a => a.kind === 'plan' || a.kind === 'observe',
    idle: 'Plans once a day.',
  },
  {
    key: 'write', label: 'Writes the blog post', icon: FileText,
    match: a => /blog/i.test(a.summary) || a.link?.kind === 'blog-post',
    idle: 'One a day, once there is a key to write with.',
  },
  {
    key: 'social', label: 'Writes the social posts', icon: Image,
    match: a => /social/i.test(a.summary) || a.link?.kind === 'social-post',
    idle: 'Tops the queue up when it runs low.',
  },
  {
    key: 'pages', label: 'Builds the pages', icon: Globe,
    match: a => a.link?.kind === 'website' || a.link?.kind === 'funnel' || /website|funnel|landing/i.test(a.summary),
    idle: 'Built once, then left alone.',
  },
  {
    key: 'campaign', label: 'Writes the campaigns', icon: Mail,
    match: a => a.link?.kind === 'sequence' || /campaign|sequence|follow-up/i.test(a.summary),
    idle: 'A new angle roughly weekly.',
  },
  {
    key: 'send', label: 'Sends and follows up', icon: Users,
    match: a => a.kind === 'enrol' || a.kind === 'send',
    idle: 'Waits for somebody to send to.',
  },
];

const clock = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  /* To the second, deliberately. "14:32" and "14:32:07" answer different
     questions, and the second one is what somebody doubting it is working
     actually wants — it is the difference between a claim and a receipt. */
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

export default function ProjectFlow({ day, live }: { day: ProjectDay | null; live: boolean }) {
  const done = day?.didToday ?? [];
  const upcoming = day?.upcoming ?? [];
  const next = upcoming[0];

  /* The stage that is running now: the first one with nothing done today that
     something upcoming is about to touch. A chart with no "now" is a chart that
     cannot say whether it is alive. */
  const nowKey = STAGES.find(s => !done.some(s.match) && upcoming.some(s.match))?.key
    ?? STAGES.find(s => !done.some(s.match))?.key
    ?? '';

  return (
    <aside style={{
      background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 15,
      display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {live ? (
          <span className="ap-live-dot" aria-hidden><span className="ap-live-ring" /></span>
        ) : (
          <span style={{ width: 8, height: 8, borderRadius: 999, background: '#cbd5e1', flexShrink: 0 }} aria-hidden />
        )}
        <h4 style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: INK }}>
          {live ? 'Running' : 'Paused'}
        </h4>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10.5, color: MUTED }}>{day?.today ?? ''}</span>
      </div>

      {/* ── The day, stage by stage ── */}
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 2 }}>
        {STAGES.map((stage, i) => {
          const mine = done.filter(stage.match);
          const isNow = live && stage.key === nowKey;
          const Ic = stage.icon;
          return (
            <li key={stage.key}>
              <div style={{
                display: 'flex', gap: 9, alignItems: 'flex-start', padding: '7px 9px',
                borderRadius: 10, border: `1px solid ${mine.length ? '#d7ead9' : isNow ? '#ddd6fe' : LINE}`,
                background: mine.length ? '#f6fbf7' : isNow ? '#f8f7ff' : '#fff',
              }} className={isNow ? 'ap-node-now' : undefined}>
                <span style={{
                  width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: mine.length ? '#e8f6ee' : isNow ? '#ede9fe' : '#f4f5f7',
                  color: mine.length ? '#0f7b3d' : isNow ? ACCENT : '#94a3b8',
                }}><Ic size={12} /></span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: INK }}>{stage.label}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: MUTED, marginTop: 1, lineHeight: 1.45 }}>
                    {mine.length
                      ? `${mine.length} today · ${mine[0].actedAt ? clock(mine[0].actedAt) : ''}`
                      : isNow ? 'Next up' : stage.idle}
                  </span>
                </span>
              </div>
              {i < STAGES.length - 1 && (
                <div style={{ display: 'flex', alignItems: 'center', padding: '2px 0 2px 19px' }}>
                  {/* Only lit while the project is running. A paused project
                      that still looks busy is a lie told in CSS. */}
                  <span className={live ? 'ap-flow-line' : undefined} style={live ? undefined : {
                    flex: 1, height: 2, background: '#eef0f4', borderRadius: 999,
                  }} aria-hidden />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {/* ── What happens next ── */}
      <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 11 }}>
        <p style={{ margin: '0 0 6px', fontSize: 10.5, fontWeight: 800, color: MUTED, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Next
        </p>
        {next ? (
          <>
            <p style={{ margin: 0, fontSize: 11.5, color: INK, fontWeight: 700, lineHeight: 1.45 }}>{next.summary}</p>
            <p style={{ margin: '3px 0 0', fontSize: 10.5, color: MUTED, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={10} />
              {next.dueAt
                ? new Date(next.dueAt).toLocaleString()
                /* A row with no due date runs on the next tick, which is sooner
                   than anything scheduled — said rather than left blank. */
                : 'On the next pass, within five minutes'}
            </p>
            {live && <div className="ap-tick-bar" style={{ marginTop: 8 }} aria-hidden />}
            {upcoming.length > 1 && (
              <p style={{ margin: '7px 0 0', fontSize: 10.5, color: MUTED }}>
                and {upcoming.length - 1} more queued behind it
              </p>
            )}
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
            {live
              ? 'Nothing queued. It plans again within the day and will add what it finds.'
              : 'Paused, so nothing is queued. Resume it and it plans on the next pass.'}
          </p>
        )}
      </div>

      {/* ── What actually went out, with the time ── */}
      {(day?.sentToday.length ?? 0) > 0 && (
        <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 11 }}>
          <p style={{ margin: '0 0 7px', fontSize: 10.5, fontWeight: 800, color: MUTED, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Sent today
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
            {(day?.sentToday ?? []).slice(0, 6).map(s => (
              <li key={s.id} style={{
                border: `1px solid ${s.status === 'failed' ? '#f3cfcf' : LINE}`, borderRadius: 9,
                padding: '7px 9px', background: s.status === 'failed' ? '#fdf3f3' : '#fbfbfc',
              }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {s.channel === 'sms' ? <MessageSquare size={10} color={MUTED} /> : <Mail size={10} color={MUTED} />}
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, color: INK, minWidth: 0, flex: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{s.subject || s.sourceName || 'Message'}</span>
                </div>
                <div style={{ fontSize: 10, color: MUTED, marginTop: 2, wordBreak: 'break-all' }}>
                  {s.recipient} · {clock(s.createdAt)}
                </div>
                {s.status === 'failed' && (
                  /* The server's own words. "Failed" is not actionable; "550
                     mailbox unavailable" is. */
                  <div style={{ fontSize: 10, color: '#b42318', marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>
                    {s.detail || 'refused, with no reason given'}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {(day?.sentToday.length ?? 0) > 6 && (
            <p style={{ margin: '7px 0 0', fontSize: 10.5, color: MUTED }}>
              and {(day?.sentToday.length ?? 0) - 6} more
            </p>
          )}
          <p style={{ margin: '8px 0 0', fontSize: 10, color: MUTED, lineHeight: 1.5 }}>
            {/* The same caveat the delivery log carries, because the number here
                would otherwise read as "arrived". */}
            Sent means the server accepted it, not that it reached an inbox.
          </p>
        </div>
      )}
    </aside>
  );
}
