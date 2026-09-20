/**
 * What is happening to a project that has only just been created.
 *
 * ── The gap this fills ──
 *
 * Creating a project said "Autopilot plans it within a day" and then showed a
 * board column with nothing in it. Nothing on the screen distinguished
 *
 *   - the planner has not run yet — normal, and the answer is to wait;
 *   - the planner ran and produced nothing — not normal;
 *   - the planner cannot run at all because no AI key is connected.
 *
 * All three are an empty column, and the customer had just committed to a plan
 * and paid attention to it. So this says which, in the moment when somebody is
 * definitely watching.
 *
 * ── Why it is not a fake progress bar ──
 *
 * A bar that fills on a timer would be the same lie in nicer clothes. Each line
 * here is a real state read from the project and its cards: the launch plan the
 * customer agreed to on the last screen of the wizard, marked off as Autopilot
 * actually produces the thing. A step with nothing behind it stays grey and
 * says it is waiting rather than showing a tick.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, Loader, AlertTriangle, Sparkles, ArrowRight } from 'lucide-react';
import { fetchBoard, type Project, type Card } from '../../services/projects';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

/**
 * Which card kinds count as which part of the build.
 *
 * Matched on the card's `kind` rather than on its wording: the summaries are
 * written by a model and would change under us, and a progress list that
 * quietly stopped matching would show nothing while everything worked.
 */
const STAGES: { key: string; label: string; kinds: string[]; waiting: string }[] = [
  { key: 'plan', label: 'Reading the business and choosing what to do', kinds: ['observe', 'plan'], waiting: 'Autopilot plans once a day. The first pass usually lands within the hour.' },
  { key: 'sending', label: 'Getting email able to send', kinds: ['pool', 'domain', 'mailbox', 'infra'], waiting: 'Waiting on a sending domain or a connected mailbox.' },
  { key: 'words', label: 'Writing the campaigns and the content', kinds: ['sequence', 'campaign', 'blog', 'social', 'short', 'landing', 'funnel', 'website'], waiting: 'Nothing written yet.' },
  { key: 'shop', label: 'Building the catalogue and the shop', kinds: ['product', 'order', 'shop', 'idea'], waiting: 'Only for projects that sell something.' },
  { key: 'acting', label: 'Working leads and answering replies', kinds: ['reply', 'enrol', 'review', 'chase', 'thank', 'appointment'], waiting: 'Starts once there are people to work.' },
];

export default function ProjectProgress({ projectId, onOpenBoard }: { projectId: string; onOpenBoard: () => void }) {
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [error, setError] = useState('');
  const [firstLoad, setFirstLoad] = useState(true);

  useEffect(() => {
    let alive = true;
    const read = async () => {
      const r = await fetchBoard();
      if (!alive) return;
      setFirstLoad(false);
      if (r.error) { setError(r.error); return; }
      setError('');
      setProject(r.projects.find(p => p.id === projectId) ?? null);
      setCards(r.board[projectId] ?? []);
    };
    void read();
    /*
     * Twenty seconds, and only while this screen is open.
     *
     * The planner runs on a five-minute cron, so a faster poll would ask four
     * times for an answer that cannot have changed. Twenty is slow enough to be
     * cheap and fast enough that somebody watching sees the first card appear
     * without reloading — which is the entire point of this screen.
     */
    const t = window.setInterval(() => void read(), 20_000);
    return () => { alive = false; window.clearInterval(t); };
  }, [projectId]);

  const planned = !!project?.lastPlannedAt;
  const failedCards = cards.filter(c => c.status === 'failed');

  return (
    <div style={{ padding: '10px 2px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
        <span style={{
          width: 30, height: 30, borderRadius: 10, background: ACCENT, color: '#fff',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}><Sparkles size={15} /></span>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>
          {project ? `Building “${project.name}”` : 'Starting the project'}
        </h3>
      </div>

      <p style={{ margin: '0 0 16px', fontSize: 13, color: MUTED, lineHeight: 1.6, maxWidth: 560 }}>
        {planned
          ? 'Autopilot has read the business and started. Everything below is a real record — nothing is ticked until the thing itself exists.'
          : 'Autopilot plans each project once a day and carries out what it planned every five minutes. Nothing here is ticked on a timer: a step turns green when the record behind it is actually there.'}
        {' '}You can close this — it carries on without the app open.
      </p>

      {error && (
        <p style={{
          margin: '0 0 14px', padding: '11px 13px', borderRadius: 10, background: '#fef2f2',
          border: '1px solid #fecaca', color: '#b42318', fontSize: 12.5, lineHeight: 1.55,
        }}>{error}</p>
      )}

      {project?.lastError && (
        /* The project's own recorded failure, shown before the checklist. A
           customer whose AI key is missing needs that sentence, not five grey
           circles that imply patience will fix it. */
        <p style={{
          margin: '0 0 14px', padding: '11px 13px', borderRadius: 10, background: '#fffbeb',
          border: '1px solid #fde68a', color: '#92400e', fontSize: 12.5, lineHeight: 1.55,
          display: 'flex', gap: 8,
        }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{project.lastError}</span>
        </p>
      )}

      <ol style={{ margin: '0 0 16px', padding: 0, listStyle: 'none', display: 'grid', gap: 9 }}>
        {STAGES.map(stage => {
          const mine = cards.filter(c => stage.kinds.some(k => c.kind.includes(k)));
          const done = mine.filter(c => c.status === 'done').length;
          const waiting = mine.filter(c => c.status === 'awaiting').length;
          const working = firstLoad || (!mine.length && stage.key === 'plan' && !planned);

          return (
            <li key={stage.key} style={{
              display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 13px',
              border: `1px solid ${LINE}`, borderRadius: 12,
              background: done ? '#f6fbf7' : '#fff',
            }}>
              <span style={{ marginTop: 1, flexShrink: 0 }}>
                {done > 0 ? <CheckCircle2 size={16} color="#16a34a" />
                  : working ? <Loader size={16} color={ACCENT} className="spin" />
                    : <Circle size={16} color="#cbd5e1" />}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: INK }}>{stage.label}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 2, lineHeight: 1.55 }}>
                  {done > 0
                    ? `${done} done${waiting ? `, ${waiting} waiting for you to approve` : ''}.`
                    : stage.waiting}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      {failedCards.length > 0 && (
        <div style={{
          marginBottom: 16, padding: '12px 14px', borderRadius: 12,
          background: '#fdf3f3', border: '1px solid #f3cfcf',
        }}>
          <p style={{ margin: '0 0 6px', fontSize: 12.5, fontWeight: 800, color: '#b42318' }}>
            {failedCards.length} step{failedCards.length === 1 ? '' : 's'} did not work
          </p>
          {/* Named individually rather than counted. "2 failed" is not something
              anybody can act on; "no mail server is connected" is. */}
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: '#7a2622', lineHeight: 1.6 }}>
            {failedCards.slice(0, 3).map(c => <li key={c.id}>{c.detail || c.summary}</li>)}
          </ul>
        </div>
      )}

      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
        <button onClick={onOpenBoard} className="press" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 17px',
          border: 'none', borderRadius: 10, background: INK, color: '#fff',
          fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          Go to the board <ArrowRight size={13} />
        </button>
        <button onClick={() => navigate('/settings?tab=email-sms')} className="press" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 17px',
          border: `1px solid ${LINE}`, borderRadius: 10, background: '#fff', color: INK,
          fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          Connect a mailbox
        </button>
      </div>
    </div>
  );
}
