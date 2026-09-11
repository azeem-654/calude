/**
 * What AI Autopilot is doing, on the first screen after signing in.
 *
 * The dashboard is a report on what already happened: deals, meetings, contacts
 * counted from records. Autopilot is the only thing on the product that acts
 * without being asked, and it had no presence here at all — so a customer whose
 * whole reason for paying is "it runs the business" opened the app and saw a
 * spreadsheet.
 *
 * ── What it refuses to do ──
 *
 * It does not motivate with a number it does not have. Three states, and each
 * says which one it is: no projects yet (an invitation), projects running (the
 * counts, and what is waiting on a person), or the board could not be read (it
 * says so rather than rendering zeros, because "0 waiting for you" is a claim
 * and a failed fetch is not evidence for it).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, ChevronRight, CircleAlert } from 'lucide-react';
import { fetchBoard, type Project, type Card } from '../../services/projects';

interface Snapshot {
  projects: Project[];
  awaiting: Card[];
  /** The last card that actually carried something out. */
  lastAct: Card | null;
  /** The last card that only reported a condition. */
  lastNotice: Card | null;
}

/*
 * An `observe` or `error` card is Autopilot saying something, not doing it, and
 * the tick still marks it Done because there is nothing to carry out. Reporting
 * one as "the last thing it did" turns a warning into a claim of work — the
 * strip said Autopilot's last act was "no mailbox is connected", which reads as
 * though it had gone and fixed that.
 */
const ACTS = new Set(['create', 'enrol', 'send', 'advance', 'book']);

export default function AutopilotStrip() {
  const navigate = useNavigate();
  const [state, setState] = useState<Snapshot | 'loading' | 'unreadable'>('loading');

  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await fetchBoard();
      if (!live) return;
      if (r.error) { setState('unreadable'); return; }
      const cards = Object.values(r.board).flat();
      const done = cards
        .filter(c => c.status === 'done' && c.actedAt)
        .sort((a, b) => String(b.actedAt).localeCompare(String(a.actedAt)));
      setState({
        projects: r.projects,
        awaiting: cards.filter(c => c.status === 'awaiting'),
        lastAct: done.find(c => ACTS.has(c.kind)) ?? null,
        lastNotice: done.find(c => !ACTS.has(c.kind)) ?? null,
      });
    })();
    return () => { live = false; };
  }, []);

  /* Nothing at all until it knows. A strip that flashes "no projects yet" for
     a beat and then corrects itself is worse than one that arrives late. */
  if (state === 'loading') return null;

  if (state === 'unreadable') {
    return (
      <button type="button" onClick={() => navigate('/autopilot')} className="flow-strip press"
        aria-label="Open AI Autopilot">
        <span className="flow-strip-icon ap-strip-icon" aria-hidden="true"><CircleAlert size={17} /></span>
        <span className="flow-strip-text">
          <span className="flow-strip-title">AI Autopilot could not be read just now</span>
          <span className="flow-strip-sub">
            The board did not answer, so there is nothing reliable to show here. It may still be running —
            open it to see.
          </span>
        </span>
        <ChevronRight size={16} aria-hidden="true" style={{ flexShrink: 0, opacity: 0.5 }} />
      </button>
    );
  }

  const { projects, awaiting, lastAct, lastNotice } = state;
  const running = projects.filter(p => p.status === 'running' || p.status === 'learning');

  if (projects.length === 0) {
    return (
      <button type="button" onClick={() => navigate('/autopilot')} className="flow-strip press"
        aria-label="Start your first AI Autopilot project">
        <span className="flow-strip-icon ap-strip-icon" aria-hidden="true"><Rocket size={17} /></span>
        <span className="flow-strip-text">
          <span className="flow-strip-title">Put one thing on AI Autopilot</span>
          <span className="flow-strip-sub">
            One project per client and per push — find the leads, write the emails and texts, publish the
            posts, book the calls. You say what you want to happen; it works out what to do and asks before
            anything goes out.
          </span>
        </span>
        <ChevronRight size={16} aria-hidden="true" style={{ flexShrink: 0, opacity: 0.5 }} />
      </button>
    );
  }

  const n = (v: number, one: string, many = `${one}s`) => `${v} ${v === 1 ? one : many}`;

  return (
    <button type="button" onClick={() => navigate('/autopilot')} className="flow-strip press"
      aria-label="Open the AI Autopilot board">
      <span className="flow-strip-icon ap-strip-icon" aria-hidden="true"><Rocket size={17} /></span>
      <span className="flow-strip-text">
        <span className="flow-strip-title">
          {running.length > 0
            ? `AI Autopilot is running ${n(running.length, 'project')}`
            : `AI Autopilot is paused across ${n(projects.length, 'project')}`}
        </span>
        <span className="flow-strip-sub">
          {awaiting.length > 0
            ? <><strong>{n(awaiting.length, 'thing')} waiting for your yes.</strong>{' '}</>
            : running.length > 0 ? 'Nothing is waiting on you. ' : ''}
          {lastAct
            ? `Last thing it did: ${lastAct.summary}`
            : lastNotice
              ? `It has not acted yet. It says: ${lastNotice.summary}`
              : running.length > 0
                ? 'It has not had to act yet — the first pass runs within the hour.'
                : 'Nothing will happen until a project is switched back on.'}
        </span>
      </span>
      {awaiting.length > 0 && (
        <span className="ap-strip-count" aria-hidden="true">{awaiting.length}</span>
      )}
      <ChevronRight size={16} aria-hidden="true" style={{ flexShrink: 0, opacity: 0.5 }} />
    </button>
  );
}
