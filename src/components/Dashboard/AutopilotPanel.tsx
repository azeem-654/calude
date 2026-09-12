/**
 * What AI Autopilot is doing, on the first screen after signing in.
 *
 * The rest of this dashboard is a report on what already happened — deals,
 * meetings, contacts, all counted from records. Autopilot is the only thing in
 * the product that acts without being asked, and it had a one-line strip. That
 * strip could say how many projects were running; it could not show a person
 * which of their four clients was moving and which had been stuck for a week,
 * which is the actual question.
 *
 * ── The honesty problem with a progress bar ──
 *
 * There is no true percentage here. Autopilot does not work through a fixed
 * list — it plans more work as conditions change, so "60% done" would be a
 * number about a denominator that moves. What *is* true is the shape of the
 * ledger: of everything it has planned for this project so far, this much is
 * carried out, this much is waiting on you, this much failed. The bar shows
 * exactly that and the caption says so in those words. A bar that means
 * something narrow and says so beats a percentage that means nothing.
 *
 * Three states, each saying which one it is: nothing set up (an invitation),
 * projects running (the boards), or the board could not be read — which is said
 * rather than drawn as zeros, because "0 waiting for you" is a claim and a
 * failed request is not evidence for it.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap, ChevronRight, CircleAlert, Clock, Check, TriangleAlert,
  Pause, Search, Mail, MessageSquare, FileText, CalendarCheck, ShoppingBag,
} from 'lucide-react';
import { watchPulse, type Pulse } from '../../services/autopilotPulse';
import type { Card, Project } from '../../services/projects';

const INK = '#17191c';
const MUTED = '#6b7280';
const ACCENT = '#5b46e5';

/**
 * What Autopilot does, in the words somebody would use for it.
 *
 * Shown to every workspace, not only the empty one. A customer running three
 * projects still mostly does not know it will write their blog — the board only
 * shows what it has already done, which for a new project is nothing, and a
 * capability nobody knows about is a capability nobody paid for.
 *
 * `module` is the part of the app it drives, because "it automates the whole
 * thing" means nothing until you can see which screens it reaches into.
 */
const DOES = [
  { icon: Search, label: 'Finds the people', sub: 'Searches out businesses that fit, and files them as leads', module: 'Contacts' },
  { icon: Mail, label: 'Writes and sends', sub: 'Sequences, follow-ups and campaigns, in the client\u2019s own voice', module: 'Email campaigns' },
  { icon: MessageSquare, label: 'Answers the replies', sub: 'Reads what came back, answers it, and knows when to stop', module: 'Unified Inbox' },
  { icon: FileText, label: 'Publishes the content', sub: 'Landing pages, blog posts and social, written from the portfolio', module: 'Websites · Blog · Social' },
  { icon: CalendarCheck, label: 'Books the call', sub: 'Turns a yes into a slot in the diary without the email chain', module: 'Calendar' },
  { icon: ShoppingBag, label: 'Runs the shop', sub: 'Chases what is unpaid, thanks the people who bought', module: 'Sell' },
];

/**
 * The capability strip.
 *
 * Every card carries a sweep that never stops — the module never stops either:
 * the cron fires every five minutes whether or not anybody has the tab open.
 * The cards are staggered so the strip reads as something continuously working
 * rather than as six things flashing in time, which is what a shared delay
 * looks like and why it reads as decoration.
 *
 * It is deliberately not tied to live state. This is a description of what the
 * module is for; the numbers and the per-project bars below it are the part
 * that reports what is true right now, and conflating the two would mean the
 * explanation went quiet exactly when somebody had no projects and most needed
 * reading it.
 */
function DoesStrip() {
  return (
    <div className="ap-does">
      {DOES.map((d, i) => (
        <div key={d.label} className="ap-does-item" style={{ animationDelay: `${i * 0.9}s` }}>
          <span className="ap-does-icon" aria-hidden="true"><d.icon size={15} /></span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: INK }}>{d.label}</span>
            <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 2, lineHeight: 1.45 }}>{d.sub}</span>
            <span className="ap-does-module">{d.module}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/* An observe or error card is Autopilot *saying* something; the tick marks it
   done because there is nothing to carry out. Counting those as work carried
   out is how a warning turns into a claim of progress. */
const ACTS = new Set(['create', 'enrol', 'send', 'advance', 'book']);

function relative(iso: string | null): string {
  if (!iso) return 'not yet';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(s) || s < 0) return 'just now';
  if (s < 90) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const STATUS: Record<Project['status'], { label: string; fg: string; bg: string }> = {
  running: { label: 'Running', fg: '#15803d', bg: '#dcfce7' },
  learning: { label: 'Warming up', fg: '#a16207', bg: '#fef9c3' },
  paused: { label: 'Paused', fg: '#64748b', bg: '#f1f5f9' },
  off: { label: 'Off', fg: '#64748b', bg: '#f1f5f9' },
};

function ProjectRow({ project, cards, onOpen }: { project: Project; cards: Card[]; onOpen: () => void }) {
  const done = cards.filter(c => c.status === 'done' && ACTS.has(c.kind)).length;
  const notices = cards.filter(c => c.status === 'done' && !ACTS.has(c.kind));
  const awaiting = cards.filter(c => c.status === 'awaiting');
  const pending = cards.filter(c => c.status === 'pending');
  const failures = cards.filter(c => c.status === 'failed');
  const failed = failures.length;

  /* The denominator is "everything it has planned for this project", which is
     what the caption says. Not a completion estimate — see the file comment. */
  const planned = done + awaiting.length + pending.length + failed;
  const pct = (n: number) => (planned ? (n / planned) * 100 : 0);
  const st = STATUS[project.status];

  /* What it is going to do next, by name. "3 things in flight" tells nobody
     anything; "Write the first email sequence" tells them what to expect. */
  const next = pending[0] ?? awaiting[0] ?? null;
  const lastNotice = notices[0] ?? null;
  /* A red bar and a count is not a reason. Somebody whose AI key was rejected
     needs to be told that, on the screen where they saw it go red — otherwise
     "4 failed" reads as "this product does not work". */
  const why = failures[0] ?? null;

  return (
    <button type="button" onClick={onOpen} className="ap-row press"
      style={{
        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
        background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(255,255,255,0.7)',
        borderRadius: 16, padding: '14px 15px', fontFamily: 'inherit',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: INK, letterSpacing: '-0.015em' }}>{project.name}</span>
        <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 800, color: st.fg, background: st.bg }}>
          {st.label}
        </span>
        {project.portfolioName && (
          <span style={{ fontSize: 11.5, color: MUTED }}>for {project.portfolioName}</span>
        )}
        <span style={{ flex: 1, minWidth: 4 }} />
        {awaiting.length > 0 && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999,
            background: ACCENT, color: '#fff', fontSize: 11, fontWeight: 800,
          }}>
            <Clock size={11} /> {awaiting.length} for you
          </span>
        )}
        <ChevronRight size={15} style={{ color: '#b6bcc8', flexShrink: 0 }} />
      </div>

      {/* ── The bar ── */}
      {planned > 0 ? (
        <>
          <div style={{ display: 'flex', height: 7, borderRadius: 99, overflow: 'hidden', background: '#eceef3', marginTop: 11 }}>
            {done > 0 && <div style={{ width: `${pct(done)}%`, background: '#3f9142' }} title={`${done} carried out`} />}
            {awaiting.length > 0 && <div style={{ width: `${pct(awaiting.length)}%`, background: ACCENT }} title={`${awaiting.length} waiting for you`} />}
            {pending.length > 0 && <div style={{ width: `${pct(pending.length)}%`, background: '#c3c8d4' }} title={`${pending.length} queued`} />}
            {failed > 0 && <div style={{ width: `${pct(failed)}%`, background: '#e5484d' }} title={`${failed} failed`} />}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 7, fontSize: 11.5, color: MUTED }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Check size={11} color="#3f9142" /> {done} carried out
            </span>
            {awaiting.length > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Clock size={11} color={ACCENT} /> {awaiting.length} waiting on you
              </span>
            )}
            {pending.length > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Pause size={11} /> {pending.length} queued
              </span>
            )}
            {failed > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#b91c1c' }}>
                <TriangleAlert size={11} /> {failed} failed
              </span>
            )}
            <span style={{ marginLeft: 'auto' }}>acted {relative(project.lastActedAt)}</span>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 11, color: '#9aa1b0', lineHeight: 1.5 }}>
            Of the {planned} {planned === 1 ? 'thing' : 'things'} it has planned for this project so far.
            It plans more as it goes, so this is not a countdown to finished.
          </p>
        </>
      ) : (
        <p style={{ margin: '9px 0 0', fontSize: 12, color: MUTED, lineHeight: 1.55 }}>
          {project.status !== 'running' && project.status !== 'learning'
            ? 'Switched off, so nothing is planned.'
            : lastNotice
              /* Saying "nothing planned yet" above a notice explaining why
                 reads as a contradiction. It did plan — it planned to tell you
                 something, which is not work it can carry out. */
              ? 'Nothing it can carry out yet:'
              : 'Nothing planned yet — the first pass runs within the day.'}
        </p>
      )}

      {/* ── What is next, by name ── */}
      {next && (
        <div style={{
          marginTop: 10, padding: '8px 10px', borderRadius: 10,
          background: next.status === 'awaiting' ? 'rgba(91,70,229,0.07)' : '#f6f7f9',
          fontSize: 12, color: INK, lineHeight: 1.5,
        }}>
          <strong style={{ fontWeight: 700 }}>{next.status === 'awaiting' ? 'Waiting on you: ' : 'Next: '}</strong>
          {next.summary}
        </div>
      )}

      {/* A standing condition it cannot get past — no mailbox, no AI key. Worth
          surfacing here, because it is the reason the bar is not moving. */}
      {!next && lastNotice && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#7c2d12', lineHeight: 1.5, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <CircleAlert size={13} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{lastNotice.summary}</span>
        </div>
      )}

      {/* Why it went red. */}
      {!next && why && (
        <div style={{
          marginTop: 9, padding: '8px 10px', borderRadius: 10,
          background: '#fef2f2', border: '1px solid #fecaca',
          fontSize: 11.5, color: '#7f1d1d', lineHeight: 1.5,
        }}>
          <strong style={{ fontWeight: 700 }}>{why.summary}</strong>
          {why.detail && <> — {why.detail}</>}
        </div>
      )}

      {project.lastError && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: '#b91c1c', lineHeight: 1.5 }}>
          Last run reported: {project.lastError}
        </div>
      )}
    </button>
  );
}

export default function AutopilotPanel() {
  const navigate = useNavigate();
  const [pulse, setPulse] = useState<Pulse | null>(null);

  useEffect(() => watchPulse(setPulse), []);

  /* Nothing at all until it knows. A panel that flashes "no projects" for a
     beat and then corrects itself is worse than one that arrives late. */
  if (!pulse || pulse.state === 'loading') return null;

  const shell = (children: React.ReactNode) => (
    <section aria-label="AI Autopilot" className="ap-panel slide-up">
      <div className="ap-panel-head">
        {/* The same core as the nav pill, so the two read as one module. */}
        <span className="ap-panel-badge" aria-hidden="true">
          <span className="ap-badge-ring" />
          <span className="ap-badge-ring" />
          <Zap size={15} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: INK, letterSpacing: '-0.025em' }}>AI Autopilot</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
            It runs the rest of this app for you — finding people, writing and sending, publishing,
            answering, booking. Everything else on this screen is a report on what it did.
          </p>
        </div>
        <button type="button" className="dash-chip press" onClick={() => navigate('/autopilot')}>
          Open the board <ChevronRight size={12} />
        </button>
      </div>
      {children}
    </section>
  );

  if (pulse.state === 'unreadable') {
    return shell(
      <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '13px 14px', borderRadius: 14, background: '#fff7ed', border: '1px solid #fed7aa' }}>
        <CircleAlert size={16} color="#c2410c" style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ margin: 0, fontSize: 13, color: '#7c2d12', lineHeight: 1.6 }}>
          The board did not answer, so there is nothing reliable to show here. Autopilot may still be
          running — open it to see.
        </p>
      </div>,
    );
  }

  if (pulse.projects.length === 0) {
    return shell(
      <>
        <DoesStrip />
        <button type="button" onClick={() => navigate('/autopilot')} className="ap-cta press">
          <Zap size={15} /> Put one thing on Autopilot
        </button>
        <p style={{ margin: 0, fontSize: 12, color: MUTED, lineHeight: 1.6, textAlign: 'center' }}>
          One project per client and per push. You say what you want to happen; it works out what to
          do, and asks before anything reaches a person.
        </p>
      </>,
    );
  }

  /* Busiest first — a project with work waiting on a person is the one worth
     seeing without scrolling. */
  const ordered = [...pulse.projects].sort((a, b) => (b.awaiting - a.awaiting) || (b.done - a.done));

  return shell(
    <>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: MUTED, margin: '-2px 2px 2px' }}>
        <span><strong style={{ color: INK, fontWeight: 800 }}>{pulse.running}</strong> of {pulse.projects.length} running</span>
        <span><strong style={{ color: pulse.awaiting ? ACCENT : INK, fontWeight: 800 }}>{pulse.awaiting}</strong> waiting on you</span>
        <span><strong style={{ color: INK, fontWeight: 800 }}>{pulse.cards.filter(c => c.status === 'done' && ACTS.has(c.kind)).length}</strong> carried out</span>
        {/* Never omitted. A summary line that counts the wins and leaves the
            failures to the bars is a summary that flatters. */}
        {pulse.cards.some(c => c.status === 'failed') && (
          <span style={{ color: '#b91c1c' }}>
            <strong style={{ fontWeight: 800 }}>{pulse.cards.filter(c => c.status === 'failed').length}</strong> failed
          </span>
        )}
      </div>

      <DoesStrip />

      <div style={{ display: 'grid', gap: 11 }}>
        {ordered.map(p => (
          <ProjectRow key={p.id} project={p} cards={pulse.board[p.id] ?? []} onOpen={() => navigate('/autopilot')} />
        ))}
      </div>
    </>,
  );
}
