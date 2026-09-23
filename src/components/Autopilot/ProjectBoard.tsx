/**
 * The board: one column per project, one card per thing Autopilot did.
 *
 * ── Why a board and not a list ──
 *
 * A sub-account runs several pushes at once — find dental clients, sell
 * supplements, win Amazon consultancy work — and the question it asks on
 * opening this screen is "what is happening for each of my clients", not "what
 * happened most recently". A single stream answers the second question and
 * buries the first: four projects interleaved is four stories told a sentence
 * at a time. Columns keep each one whole.
 *
 * ── The cards are real records ──
 *
 * Each one links into the module that owns it, so "wrote a follow-up sequence"
 * opens the sequence. Nothing here is a copy: the card is the ledger entry and
 * the link is where the thing actually lives.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Check, Clock, AlertTriangle, ExternalLink, Pause, Play, MoreHorizontal, Trash2, Globe,
  Sparkles, Loader,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  fetchBoard, setProjectStatus, deleteProject, poolTargetOf, KIND_LABEL,
  saveProject, savePortfolio,
  type Project, type Card, type Portfolio,
} from '../../services/projects';
import { approveAction, rejectAction } from '../../services/autopilot';
import ProjectInfra from './ProjectInfra';
import ProjectAssets from './ProjectAssets';
import ProjectCard from './ProjectCard';
import AutopilotBot from './AutopilotBot';
import { DEMO_CLIENT, DEMO_PROJECT, DEMO_WORKFLOWS, TEMPLATES } from './workflowTemplates';
import { saveWorkflow } from '../../services/autopilot';
import { getSession } from '../../services/auth';

const INK = T.ink;
const MUTED = T.muted;
import { T } from './theme';

const LINE = T.line;
const ACCENT = T.accent;

/** A dot per project, so a column is identifiable at a glance rather than by
 *  reading its heading. The palette repeats after six; a workspace with more
 *  than six live projects has bigger problems than colour collisions. */
const DOTS = ['#6366f1', '#f59e0b', '#0ea5e9', '#10b981', '#ec4899', '#8b5cf6'];

/**
 * What Autopilot can actually do, said before somebody commits to a project.
 *
 * Deliberately the things it *does*, not the things it is. "Writes a blog post
 * a day" is checkable; "AI-powered growth engine" is not, and a customer who
 * cannot tell what they are buying tends not to buy it.
 */
const CAN_DO = [
  { what: 'Writes a post a day', how: 'Blog, social and pages, in this client\u2019s voice.' },
  { what: 'Answers enquiries', how: 'A form is filled in and somebody hears back within the hour.' },
  { what: 'Follows up on its own', how: 'Email and SMS sequences, spaced over days.' },
  { what: 'Keeps working closed', how: 'Runs on the server every five minutes, not in this tab.' },
  { what: 'Asks before it sends', how: 'Anything that reaches a person waits for you by default.' },
  { what: 'Shows its reasons', how: 'Every card says why it decided to, so you can disagree.' },
];

const STATUS_TONE: Record<Card['status'], { bg: string; fg: string; label: string }> = {
  awaiting: { bg: '#fff7e6', fg: '#7a4d00', label: 'Waiting for you' },
  pending:  { bg: '#eef2f8', fg: '#3a4a63', label: 'Queued' },
  done:     { bg: '#e8f6ee', fg: '#0f7b3d', label: 'Done' },
  failed:   { bg: '#fdf3f3', fg: '#b42318', label: 'Did not work' },
  skipped:  { bg: '#f2f3f5', fg: '#6b7280', label: 'Skipped' },
};

/**
 * A notice is not a completed job.
 *
 * `observe` and `error` actions have nothing to carry out — noticing is the
 * whole action — so the tick records them as `done` the moment it writes them.
 * Reading that status straight off the row put a green tick and the word
 * "Done" on "Autopilot cannot build your sending pool yet", which says the
 * opposite of what the card is for. They get their own tone.
 */
const NOTICE_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  error: { bg: '#fdf3f3', fg: '#b42318', label: 'Needs you' },
  observe: { bg: '#eef2f8', fg: '#3a4a63', label: 'Noticed' },
};

function CardTile({ card, onOpen, onDecide, busy }: {
  card: Card;
  onOpen: (route: string) => void;
  onDecide: (id: string, approve: boolean) => void;
  busy: boolean;
}) {
  const notice = card.status === 'done' ? NOTICE_TONE[card.kind] : undefined;
  const tone = notice ?? STATUS_TONE[card.status] ?? STATUS_TONE.pending;
  const why = card.detail?.trim() || card.because?.trim() || '';
  return (
    <div style={{
      background: T.raised, border: `1px solid ${LINE}`, borderRadius: 14,
      padding: 13, display: 'grid', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700,
          padding: '3px 8px', borderRadius: 999, background: tone.bg, color: tone.fg,
        }}>
          {notice ? <AlertTriangle size={10} />
            : card.status === 'done' ? <Check size={10} />
              : card.status === 'failed' ? <AlertTriangle size={10} />
                : <Clock size={10} />}
          {tone.label}
        </span>
        {Object.entries(card.counts ?? {}).slice(0, 1).map(([k, v]) => (
          <span key={k} style={{ fontSize: 10.5, color: MUTED }}>{v} {k}</span>
        ))}
      </div>

      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: INK, lineHeight: 1.4 }}>
        {card.summary}
      </p>
      {why && (
        <p style={{
          margin: 0, fontSize: 11.5, lineHeight: 1.5,
          color: card.status === 'failed' || card.kind === 'error' ? '#b42318' : MUTED,
        }}>
          {why.length > 160 ? why.slice(0, 160) + '…' : why}
        </p>
      )}

      {/* The only thing on this board blocked on a person. Both answers are
          offered plainly: a card you can only say yes to is not a decision. */}
      {card.status === 'awaiting' && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button disabled={busy} onClick={() => onDecide(card.id, true)} style={{
            flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none',
            background: ACCENT, color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
          }}>Approve</button>
          <button disabled={busy} onClick={() => onDecide(card.id, false)} style={{
            padding: '7px 10px', borderRadius: 8, border: `1px solid ${LINE}`,
            background: T.raised, color: MUTED, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
          }}>No</button>
        </div>
      )}

      {card.linkRoute && (
        <button
          onClick={() => onOpen(card.linkRoute!)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
            padding: '5px 10px', borderRadius: 8, border: `1px solid ${LINE}`,
            background: T.raised, color: INK, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
          }}>
          <ExternalLink size={11} /> {card.linkLabel || 'Open'}
        </button>
      )}
    </div>
  );
}

export default function ProjectBoard({ onNewProject }: { onNewProject: () => void }) {
  const navigate = useNavigate();
  const { addNotification } = useApp();
  const [projects, setProjects] = useState<Project[]>([]);
  const [board, setBoard] = useState<Record<string, Card[]>>({});
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState<string | null>(null);
  /* Open for one project at a time. Two of these expanded in adjacent columns
     is a wall of numbers, and only one of them is the one being changed. */
  const [infra, setInfra] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  /* The client behind each project. A project's logo lives on its client, so
     the card has to be handed one to show or change it. */
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  /* The message while the example is being built, so the button can say which
     of the four steps it is on rather than spinning silently for six seconds. */
  const [demoBusy, setDemoBusy] = useState('');

  /**
   * Build the worked example.
   *
   * ── Why it is real ──
   *
   * Every row it creates is the row a customer's own project has: a portfolio,
   * a project with real guardrails, and three workflows in the project's own
   * table that the engine would run exactly as it runs anybody's. There is no
   * demo mode and no mock data path, because a demonstration that takes a
   * different path through the code demonstrates the wrong code.
   *
   * ── Why nothing in it is switched on ──
   *
   * A worked example whose first act is emailing somebody is not an example,
   * it is an accident. The workflows arrive as drafts and every guardrail that
   * sends asks first — which is also what a real project does by default, so
   * the example is honest about that too.
   */
  async function makeDemo() {
    if (demoBusy) return;
    try {
      setDemoBusy('Making the client…');
      const pf = await savePortfolio({ name: DEMO_CLIENT.name, profile: DEMO_CLIENT.profile, source: 'manual' });
      if (!pf.success || !pf.id) throw new Error(String(pf.error ?? 'the client could not be saved'));

      setDemoBusy('Starting the project…');
      const pr = await saveProject({
        name: DEMO_PROJECT.name,
        objective: DEMO_PROJECT.objective,
        portfolioId: pf.id,
        kind: DEMO_PROJECT.kind,
        guardrails: DEMO_PROJECT.guardrails,
      });
      if (!pr.success || !pr.id) throw new Error(String(pr.error ?? 'the project could not be started'));

      setDemoBusy('Adding the workflows…');
      for (const key of DEMO_WORKFLOWS) {
        const t = TEMPLATES.find(x => x.key === key);
        if (!t) continue;
        await saveWorkflow(pr.id, {
          name: t.name, description: t.description, status: 'draft', nodes: t.nodes,
        });
      }

      setDemoBusy('');
      await load();
      addNotification('The example is ready. Nothing in it is switched on — read it, change it, or delete it.');
    } catch (e) {
      setDemoBusy('');
      addNotification(`The example could not be built: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  }

  const load = async () => {
    const r = await fetchBoard();
    setProjects(r.projects);
    setPortfolios(r.portfolios);
    setBoard(r.board);
    setLoading(false);
    if (r.error) addNotification(r.error, 'error');
  };
  useEffect(() => {
    /* Same guard as the screen above: a board left mid-fetch must not set
       state after it has gone. */
    let live = true;
    void (async () => {
      const r = await fetchBoard();
      if (!live) return;
      setProjects(r.projects);
      setPortfolios(r.portfolios);
      setBoard(r.board);
      setLoading(false);
      if (r.error) addNotification(r.error, 'error');
    })();
    return () => { live = false; };
  }, [addNotification]);

  const decide = async (id: string, approve: boolean) => {
    setDeciding(true);
    const r = approve ? await approveAction(id) : await rejectAction(id);
    setDeciding(false);
    if (!r.success) { addNotification(r.error ?? 'Could not record that.', 'error'); return; }
    /* Approving queues it for the next tick rather than doing it here — two
       places that can send is how something gets sent twice. */
    addNotification(approve ? 'Approved — Autopilot carries it out on the next run.' : 'Left undone.', 'success');
    void load();
  };

  const toggle = async (p: Project) => {
    const next = p.status === 'running' || p.status === 'learning' ? 'paused' : 'running';
    const r = await setProjectStatus(p.id, next);
    if (!r.success) { addNotification(r.error ?? 'Could not change that.', 'error'); return; }
    setMenu(null);
    void load();
  };

  const remove = async (p: Project) => {
    if (!window.confirm(`Delete "${p.name}" and everything Autopilot recorded for it? The campaigns and posts it already made stay where they are.`)) return;
    const r = await deleteProject(p.id);
    if (!r.success) { addNotification(r.error ?? 'Could not delete that.', 'error'); return; }
    setMenu(null);
    addNotification(`"${p.name}" deleted.`, 'success');
    void load();
  };

  if (loading) {
    return <p style={{ fontSize: 13, color: MUTED, padding: '20px 0' }}>Loading your projects…</p>;
  }

  if (!projects.length) {
    return (
      <div style={{
        background: T.panel, border: `1px dashed ${LINE}`, borderRadius: 18,
        padding: '34px 24px', textAlign: 'center', display: 'grid', gap: 11, justifyItems: 'center',
      }}>
        <AutopilotBot size={62} awake />
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>
          No projects yet
        </h3>
        <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.6, maxWidth: 470 }}>
          A project is one push for one client — find dental patients, sell a range of products,
          win consultancy work. Each one runs on its own and reports here.
        </p>

        {/* What it can actually do, before somebody commits to anything. */}
        <div style={{
          display: 'grid', gap: 7, gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))',
          maxWidth: 620, width: '100%', textAlign: 'left', marginTop: 2,
        }}>
          {CAN_DO.map(c => (
            <span key={c.what} style={{
              display: 'flex', gap: 8, alignItems: 'flex-start', padding: '9px 11px',
              border: `1px solid ${LINE}`, borderRadius: 11, background: T.raised,
            }}>
              <Check size={12} color="#16a34a" style={{ marginTop: 2, flexShrink: 0 }} />
              <span>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: INK }}>{c.what}</span>
                <span style={{ display: 'block', fontSize: 10.5, color: MUTED, marginTop: 1, lineHeight: 1.45 }}>
                  {c.how}
                </span>
              </span>
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
          <button onClick={onNewProject} className="ap-cta-pulse" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '11px 20px', borderRadius: 999, border: 'none',
            background: ACCENT, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
            <Plus size={14} /> Start your first project
          </button>
          <button onClick={() => void makeDemo()} disabled={!!demoBusy} className="press" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '11px 20px', borderRadius: 999, border: `1px solid ${LINE}`,
            background: T.raised, color: INK, fontSize: 13, fontWeight: 700,
            cursor: demoBusy ? 'default' : 'pointer', fontFamily: 'inherit',
          }}>
            {demoBusy ? <Loader size={14} className="spin" /> : <Sparkles size={14} />}
            {demoBusy || 'See a worked example'}
          </button>
        </div>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: MUTED, lineHeight: 1.5, maxWidth: 440 }}>
          {/* Said plainly: the example is not a mock-up, it is a real project
              that really runs — which is also why it has to be deletable. */}
          The example builds a real client, a real project and three real workflows you can read, change
          and delete. Nothing in it is switched on.
        </p>
      </div>
    );
  }

  /*
   * ── Stacked project cards, not a row of columns ──
   *
   * The board was a horizontal scroller: one 320px column per project, each a
   * list of cards. That is the right shape for a log and the wrong one for a
   * service somebody pays for monthly — a column cannot say what is running
   * now, what is due next, or what actually went out.
   *
   * Each project now gets the full width and its own card: its workflows drawn
   * as the shapes they are, what its AI may do, what it has produced, how it is
   * doing, and its settings, behind one tab bar with the box that writes a
   * workflow for it alongside.
   *
   * The old column survives inside the Settings tab, because the sending pool
   * and the full ledger are things somebody opens deliberately rather than
   * watches.
   */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── The bar above the projects ──
          The button was only at the bottom, after a page of projects, which is
          the one place somebody with six of them will not look. It is here as
          well, and it keeps a slow pulse so an eye scanning the top of the page
          lands on the thing to press. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <AutopilotBot size={30} awake={projects.some(p => p.status === 'running' || p.status === 'learning')} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: INK }}>
            {projects.length} project{projects.length === 1 ? '' : 's'}
          </span>
          <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 1 }}>
            Each runs on the server every five minutes, whether or not this is open.
          </span>
        </span>
        <span style={{ flex: 1 }} />
        <button onClick={onNewProject} className="ap-cta-pulse" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px',
          borderRadius: 999, border: 'none', background: ACCENT, color: '#fff',
          fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
        }}>
          <Plus size={14} /> New project
        </button>
      </div>

      {projects.map((p, i) => {
        const cards = board[p.id] ?? [];
        const pool = poolTargetOf(p);
        const dot = DOTS[i % DOTS.length];
        const live = p.status === 'running' || p.status === 'learning';
        return (
          <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* A line and a number between projects.
                Six full-width cards in a column run together, and the thing
                somebody loses is where one client ends and the next begins —
                which is the only question the stack exists to answer. */}
            {i > 0 && (
              <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '2px 0' }}>
                <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${LINE})` }} />
                <span style={{
                  fontSize: 10, fontWeight: 800, color: MUTED, letterSpacing: '0.09em',
                  textTransform: 'uppercase', whiteSpace: 'nowrap',
                }}>Project {i + 1} of {projects.length}</span>
                <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${LINE}, transparent)` }} />
              </div>
            )}
          <ProjectCard
            project={p}
            portfolio={portfolios.find(x => x.id === p.portfolioId) ?? null}
            onChanged={() => void load()}
            onToggle={x => void toggle(x)}
            onDelete={x => void remove(x)}
            tools={(
          <section style={{
            background: T.panel,
            border: `1px solid ${LINE}`, borderRadius: 18, padding: 12,
            display: 'grid', gap: 10, alignContent: 'start',
          }}>
            <header style={{ display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: dot, flexShrink: 0 }} />
                <h3 style={{
                  margin: 0, fontSize: 13.5, fontWeight: 800, color: INK, flex: 1,
                  minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{p.name}</h3>
                <span style={{ fontSize: 11, color: MUTED, fontWeight: 700 }}>{cards.length}</span>
                <button onClick={() => setMenu(menu === p.id ? null : p.id)} aria-label={`Options for ${p.name}`}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: MUTED, padding: 2, display: 'flex' }}>
                  <MoreHorizontal size={15} />
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#475569', background: '#eceef1', padding: '2px 7px', borderRadius: 999 }}>
                  {KIND_LABEL[p.kind] ?? p.kind}
                </span>
                {p.portfolioName && (
                  <span style={{ fontSize: 11, color: MUTED, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.portfolioName}
                  </span>
                )}
                {!live && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#7a4d00', background: '#fff7e6', padding: '2px 7px', borderRadius: 999 }}>
                    Paused
                  </span>
                )}
                {p.awaiting > 0 && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#7a4d00', background: '#fff7e6', padding: '2px 7px', borderRadius: 999 }}>
                    {p.awaiting} waiting
                  </span>
                )}
                {/* What this project sends from, on the column itself. Without
                    it the answer is three clicks away and the usual conclusion
                    is that the feature does not exist. */}
                <button onClick={() => setInfra(infra === p.id ? null : p.id)}
                  title={pool.domains > 0
                    ? `${pool.domains} sending ${pool.domains === 1 ? 'domain' : 'domains'}, ${pool.mailboxesPerDomain} mailboxes on each`
                    : 'Autopilot buys and builds no domains for this project'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px',
                    borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 10.5, fontWeight: 700,
                    border: `1px solid ${infra === p.id ? '#c7bdf7' : LINE}`,
                    background: pool.domains > 0 ? T.accentSoft : T.raised,
                    color: pool.domains > 0 ? '#4338ca' : MUTED,
                  }}>
                  <Globe size={10} />
                  {pool.domains > 0 ? `${pool.domains} × ${pool.mailboxesPerDomain}` : 'No domains'}
                </button>

              </div>


              {infra === p.id && (
                <div style={{ display: 'grid', gap: 10 }}>
                  {/* What it has comes first. Somebody opening this panel is
                      more often checking than changing, and the sending-pool
                      settings below are the rarer, more dangerous half. */}
                  <ProjectAssets
                    projectId={p.id}
                    projectName={p.name}
                    companyName={p.portfolioName || p.name}
                    contactEmail={getSession()?.user?.email ?? ''}
                  />
                  <ProjectInfra project={p} onSaved={next => setProjects(next)} />
                </div>
              )}

              {menu === p.id && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '6px 0 2px' }}>
                  <button onClick={() => void toggle(p)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px',
                    borderRadius: 8, border: `1px solid ${LINE}`, background: T.raised,
                    fontSize: 11.5, fontWeight: 700, color: INK, cursor: 'pointer',
                  }}>
                    {live ? <><Pause size={11} /> Pause</> : <><Play size={11} /> Resume</>}
                  </button>
                  <button onClick={() => void remove(p)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px',
                    borderRadius: 8, border: `1px solid ${LINE}`, background: T.raised,
                    fontSize: 11.5, fontWeight: 700, color: '#b42318', cursor: 'pointer',
                  }}>
                    <Trash2 size={11} /> Delete
                  </button>
                </div>
              )}
            </header>

            {p.lastError && (
              <p style={{ margin: 0, padding: '8px 10px', borderRadius: 9, background: '#fdf3f3', color: '#b42318', fontSize: 11.5, lineHeight: 1.5 }}>
                {p.lastError.slice(0, 180)}
              </p>
            )}

            {cards.length === 0 ? (
              <p style={{ margin: 0, padding: '18px 10px', textAlign: 'center', fontSize: 12, color: MUTED, lineHeight: 1.55 }}>
                {live
                  ? 'Nothing yet — Autopilot plans each project once a day, and the first plan lands within a day of starting it.'
                  : 'Paused. Resume it and Autopilot will pick it up on the next plan.'}
              </p>
            ) : (
              cards.map(c => (
                <CardTile key={c.id} card={c} busy={deciding}
                  onOpen={r => navigate(r)} onDecide={(id, ok) => void decide(id, ok)} />
              ))
            )}
          </section>
            )}
          />
          </div>
        );
      })}

      {/* The way to add another, for somebody who has read to the bottom.
          A slim bar rather than the tall dashed box it was: that shape was
          sized for the old horizontal column layout, and in a vertical stack it
          became a full-width empty rectangle under the last project. The
          button at the top is the one most people use. */}
      <button onClick={onNewProject} style={{
        width: '100%', padding: '11px 16px', background: 'transparent',
        border: `1px dashed ${LINE}`, borderRadius: 14, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 7, color: MUTED, fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
      }}>
        <Plus size={14} /> Add another project
      </button>
    </div>
  );
}
