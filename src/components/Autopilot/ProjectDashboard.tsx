/**
 * One project, with its own dashboard.
 *
 * ── Why a dashboard each rather than a column each ──
 *
 * The board answered "what happened, per client" with a column of cards, which
 * is the right shape for a log and the wrong one for a service somebody is
 * paying for monthly. A column cannot say what is running now, what is due
 * next, or what actually went out — and those are the three things a customer
 * checks before deciding the money is well spent.
 *
 * So each project gets the whole width: what it has done and what is waiting on
 * the left, and its working day as a live chart on the right. Several of these
 * stack down one screen, because a sub-account runs several pushes at once and
 * the question is always "how is each of mine doing".
 *
 * ── The box at the top ──
 *
 * Somebody watching their business being run will want to say something about
 * it, and the alternative to a text box is a support email. What they type is
 * classified into one of the things Autopilot already does and *queued* — never
 * carried out here. It lands on the same board under the same guardrails as
 * anything the planner decided, so a misread instruction is visible as a card
 * they can reject rather than as something that has already happened.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Sparkles, Send, Loader, AlertTriangle, CheckCircle2, Clock, ExternalLink,
  Pause, Play, ChevronDown, ChevronRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  fetchProjectDay, instructProject, approveAction, rejectAction,
  type ProjectDay,
} from '../../services/autopilot';
import { KIND_LABEL, type Project } from '../../services/projects';
import ProjectFlow from './ProjectFlow';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

/** How often a dashboard re-reads its project. See the note where it is used. */
const POLL_MS = 30_000;

export default function ProjectDashboard({
  project, onChanged, onToggle,
}: {
  project: Project;
  onChanged: () => void;
  onToggle: (p: Project) => void;
}) {
  const navigate = useNavigate();
  const [day, setDay] = useState<ProjectDay | null>(null);
  const [error, setError] = useState('');
  const [first, setFirst] = useState(true);

  const [prompt, setPrompt] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState('');
  const [answerBad, setAnswerBad] = useState(false);

  const [busyId, setBusyId] = useState('');
  const [openLog, setOpenLog] = useState(false);

  const live = project.status === 'running' || project.status === 'learning';

  /* Held in a ref so the interval below never closes over a stale copy — a
     dashboard that keeps polling with last render's project id is the kind of
     bug that only shows up once somebody has two projects. */
  const idRef = useRef(project.id);
  idRef.current = project.id;

  const read = useCallback(async () => {
    const r = await fetchProjectDay(idRef.current);
    setFirst(false);
    if (r.error) { setError(r.error); return; }
    setError('');
    setDay(r.day);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => { await read(); if (!alive) return; })();
    /*
     * Thirty seconds, against a five-minute tick.
     *
     * Slower would mean a customer watching a card appear has to reload, which
     * is the one thing this screen exists to avoid. Much faster would be asking
     * ten times for an answer that cannot have changed. It stops when the tab
     * is hidden: several dashboards on one screen, left open all day, should
     * not each be holding a request open overnight.
     */
    const tick = () => { if (document.visibilityState === 'visible') void read(); };
    const t = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { alive = false; window.clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [read]);

  async function ask() {
    const text = prompt.trim();
    if (!text || asking) return;
    setAsking(true);
    const r = await instructProject(project.id, text);
    setAsking(false);
    setAnswer(r.message);
    setAnswerBad(!r.ok || !r.understood);
    if (r.ok && r.understood) { setPrompt(''); void read(); }
  }

  async function decide(id: string, yes: boolean) {
    setBusyId(id);
    const r = yes ? await approveAction(id) : await rejectAction(id);
    setBusyId('');
    if (!r.success) { setError(r.error ?? 'That could not be done.'); return; }
    void read();
    onChanged();
  }

  const totals = day?.totals ?? { doneToday: 0, failedToday: 0, awaiting: 0, sentToday: 0 };

  /*
   * ── A notice is not a completed job ──
   *
   * `observe` and `error` actions have nothing to carry out — noticing is the
   * whole action — so the tick writes them straight to `done`. Counting them
   * with the rest put "1 done today" at the top of a project whose only event
   * was "nothing can be sent yet, no mailbox is connected", which says the
   * opposite of what happened. The board learned this once already; this screen
   * has to know it too.
   */
  const isNotice = (a: { kind: string }) => a.kind === 'observe' || a.kind === 'error';
  const notices = (day?.didToday ?? []).filter(isNotice);
  const achieved = (day?.didToday ?? []).filter(a => !isNotice(a));
  const problems = [...(day?.failedToday ?? []), ...notices];

  return (
    <section style={{
      border: `1px solid ${LINE}`, borderRadius: 20, background: '#fbfbfc',
      padding: 'clamp(13px, 2vw, 18px)', display: 'flex', flexDirection: 'column', gap: 13,
    }}>
      {/* ── Who this is ── */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {live
          ? <span className="ap-live-dot" aria-hidden><span className="ap-live-ring" /></span>
          : <span style={{ width: 8, height: 8, borderRadius: 999, background: '#cbd5e1' }} aria-hidden />}
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>
          {project.name}
        </h3>
        <span style={{ fontSize: 11.5, color: MUTED }}>
          {project.portfolioName || 'No client'} · {KIND_LABEL[project.kind] ?? project.kind}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {totals.awaiting > 0 && (
            <span style={chip('#fff7e6', '#7a4d00')}>{totals.awaiting} waiting for you</span>
          )}
          <span style={chip('#e8f6ee', '#0f7b3d')}>{achieved.length} done today</span>
          {totals.sentToday > 0 && <span style={chip('#eef2ff', '#4338ca')}>{totals.sentToday} sent</span>}
          {totals.failedToday > 0 && <span style={chip('#fdf3f3', '#b42318')}>{totals.failedToday} failed</span>}
        </span>
        <button onClick={() => onToggle(project)} className="press" style={ghost()}>
          {live ? <><Pause size={11} /> Pause</> : <><Play size={11} /> Resume</>}
        </button>
      </header>

      {/* ── Say what you want it to do ── */}
      <div style={{
        background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 13,
      }}>
        <label htmlFor={`ask-${project.id}`} style={{
          display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 800, color: INK, marginBottom: 7,
        }}>
          <Sparkles size={13} color={ACCENT} /> Tell it what to do
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            id={`ask-${project.id}`}
            value={prompt}
            onChange={e => { setPrompt(e.target.value); setAnswer(''); }}
            onKeyDown={e => { if (e.key === 'Enter') void ask(); }}
            placeholder="Write a post about getting ready for winter"
            style={{
              flex: '1 1 240px', minWidth: 0, padding: '10px 13px', borderRadius: 10,
              border: `1px solid ${LINE}`, fontSize: 13, outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button onClick={() => void ask()} disabled={asking || !prompt.trim()} className="press" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10,
            border: 'none', background: prompt.trim() ? INK : '#cbd5e1', color: '#fff',
            fontSize: 13, fontWeight: 700, cursor: asking || !prompt.trim() ? 'default' : 'pointer',
            fontFamily: 'inherit', flexShrink: 0,
          }}>
            {asking ? <Loader size={13} className="spin" /> : <Send size={13} />} Ask
          </button>
        </div>
        {answer && (
          <p style={{
            margin: '9px 0 0', fontSize: 12, lineHeight: 1.55,
            color: answerBad ? '#92400e' : '#0f7b3d',
          }}>{answer}</p>
        )}
        <p style={{ margin: '7px 0 0', fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
          {/* Said before they type, not after it has happened. */}
          Whatever it understands is queued as a card you can read and reject — nothing is sent because
          you typed it.
        </p>
      </div>

      {error && (
        <p style={{
          margin: 0, padding: '10px 13px', borderRadius: 10, background: '#fdf3f3',
          border: '1px solid #f3cfcf', color: '#b42318', fontSize: 12.5,
        }}>{error}</p>
      )}

      {/* ── The split ── */}
      <div style={{ display: 'grid', gap: 13, gridTemplateColumns: 'minmax(0, 2.2fr) minmax(0, 1fr)' }} className="ap-split">
        {/* Left: what it has done and what it wants */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, minWidth: 0 }}>
          {(day?.awaiting.length ?? 0) > 0 && (
            <div style={{ background: '#fff', border: '1px solid #f0dcb4', borderRadius: 14, padding: 13 }}>
              <p style={{ margin: '0 0 9px', fontSize: 12.5, fontWeight: 800, color: '#7a4d00' }}>
                Waiting for you
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
                {(day?.awaiting ?? []).map(a => (
                  <article key={a.id} style={{ border: `1px solid ${LINE}`, borderRadius: 11, padding: 11 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: INK }}>{a.summary}</p>
                    <p style={{ margin: '4px 0 0', fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>{a.because}</p>
                    <div style={{ display: 'flex', gap: 7, marginTop: 9, flexWrap: 'wrap' }}>
                      <button onClick={() => void decide(a.id, true)} disabled={busyId === a.id}
                        className="press" style={{ ...ghost(), background: INK, color: '#fff', border: 'none' }}>
                        {busyId === a.id ? <Loader size={11} className="spin" /> : <CheckCircle2 size={11} />} Do it
                      </button>
                      <button onClick={() => void decide(a.id, false)} disabled={busyId === a.id}
                        className="press" style={ghost()}>Not this one</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 13 }}>
            <button onClick={() => setOpenLog(o => !o)} aria-expanded={openLog} style={{
              display: 'flex', alignItems: 'center', gap: 7, width: '100%', border: 'none',
              background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            }}>
              {openLog ? <ChevronDown size={13} color={MUTED} /> : <ChevronRight size={13} color={MUTED} />}
              <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>What it did today</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: MUTED }}>{totals.doneToday}</span>
            </button>

            {first ? (
              <p style={{ margin: '9px 0 0', fontSize: 12, color: MUTED }}>Reading…</p>
            ) : achieved.length === 0 && problems.length === 0 ? (
              <p style={{ margin: '9px 0 0', fontSize: 12, color: MUTED, lineHeight: 1.55 }}>
                {live
                  ? 'Nothing yet today. It plans once a day and carries out what it planned every five minutes — the chart beside this says what is next.'
                  : 'Paused, so nothing has run today. Resume it and it plans on the next pass.'}
              </p>
            ) : openLog ? (
              <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
                {[...problems, ...achieved].map(a => (
                  <li key={a.id} style={{
                    border: `1px solid ${a.status === 'failed' ? '#f3cfcf' : LINE}`, borderRadius: 11,
                    padding: 10, background: a.status === 'failed' ? '#fdf3f3' : '#fff',
                  }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      {a.status === 'failed'
                        ? <AlertTriangle size={12} color="#b42318" style={{ marginTop: 2, flexShrink: 0 }} />
                        : <CheckCircle2 size={12} color="#0f7b3d" style={{ marginTop: 2, flexShrink: 0 }} />}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: INK }}>{a.summary}</p>
                        {a.detail && (
                          <p style={{ margin: '3px 0 0', fontSize: 11.5, color: a.status === 'failed' ? '#7a2622' : MUTED, lineHeight: 1.5 }}>
                            {a.detail}
                          </p>
                        )}
                        <p style={{ margin: '4px 0 0', fontSize: 10.5, color: MUTED, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={9} />
                          {a.actedAt ? new Date(a.actedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                        </p>
                      </div>
                      {a.link?.route && (
                        <button onClick={() => navigate(a.link!.route)} className="press" style={ghost()}>
                          Open <ExternalLink size={10} />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                {/*
                  * Anything wrong is never behind the toggle.
                  *
                  * The collapsed summary read "1 finished" on a project whose
                  * only event was "no mailbox is connected" — the one thing the
                  * customer had to act on, hidden behind a click, counted as an
                  * achievement. A problem is the most important thing on this
                  * screen and is shown whether the log is open or not.
                  */}
                {problems.length > 0 && (
                  <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
                    {problems.slice(0, 3).map(a => (
                      <li key={a.id} style={{
                        border: '1px solid #f3cfcf', borderRadius: 11, padding: 10, background: '#fdf3f3',
                      }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <AlertTriangle size={12} color="#b42318" style={{ marginTop: 2, flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#7a2622' }}>{a.summary}</p>
                            {a.because && (
                              <p style={{ margin: '3px 0 0', fontSize: 11.5, color: '#7a2622', lineHeight: 1.5 }}>{a.because}</p>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {achieved.length > 0 && (
                  <p style={{ margin: '9px 0 0', fontSize: 12, color: MUTED, lineHeight: 1.55 }}>
                    {achieved.length} finished — open this to see each one and what it produced.
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right: the working day, as a chart that moves while it is running */}
        <ProjectFlow day={day} live={live} />
      </div>
    </section>
  );
}

function chip(bg: string, fg: string): React.CSSProperties {
  return { padding: '3px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 800, background: bg, color: fg };
}

function ghost(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px',
    borderRadius: 999, border: `1px solid ${LINE}`, background: '#fff',
    fontSize: 11.5, fontWeight: 700, color: INK, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
  };
}
