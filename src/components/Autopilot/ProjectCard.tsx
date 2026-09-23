/**
 * One AI Autopilot project, whole.
 *
 * ── What this screen is ──
 *
 * The only interface to a project: its identity, its workflows drawn as the
 * shapes they are, what its AI is allowed to do, what it has produced, how it
 * is doing, and its settings — behind one tab bar, with the box that writes a
 * workflow for it sitting alongside.
 *
 * Several of these stack down the page, because an agency runs several pushes
 * at once and the question is always "how is each of mine doing".
 *
 * ── Why a project's workflows are its own ──
 *
 * They live in `crm_project_workflows`, not in the workspace-wide list under
 * Marketing → Automations. Those are two different things: one is a list
 * somebody maintains by hand for the whole business, the other belongs to one
 * client, is written in that client's voice against that client's forms, and is
 * switched on and off with the project. Sharing one list would put thirty-odd
 * rules from six clients in a single column with nothing but the name to tell
 * them apart, and deleting a project would either orphan its rules or take
 * somebody else's with it.
 *
 * What *is* shared is the engine that runs them. Two executors would be two
 * implementations of wait, condition and send, and they would drift the first
 * time either was fixed.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Workflow as WorkflowIcon, Bot, BarChart3, Settings as SettingsIcon,
  Calendar, MoreHorizontal, Plus, Loader, Sparkles, Trash2, HelpCircle,
  ChevronDown, ChevronRight, ExternalLink, AlertTriangle, CheckCircle2,
  Image as ImageIcon, Activity, Clock,
} from 'lucide-react';
import {
  fetchWorkflows, setWorkflowStatus, deleteWorkflow, buildWorkflow, saveWorkflow,
  fetchProjectDay, approveAction, rejectAction, fetchAgentRuns,
  type ProjectWorkflow, type ProjectDay, type AgentRun, type StepStates, type RunCounts,
} from '../../services/autopilot';
import { KIND_LABEL, type Portfolio, type Project } from '../../services/projects';
import { useApp } from '../../context/AppContext';
import WorkflowCanvas from './WorkflowCanvas';
import ProjectFlow from './ProjectFlow';
import WorkflowEditor from './WorkflowEditor';
import AutopilotBot from './AutopilotBot';
import BotSays from './BotSays';
import ProducedRail from './ProducedRail';
import Guardrails from './Guardrails';
import VoicePrompt from './VoicePrompt';
import ProjectLogo from './ProjectLogo';
import { TEMPLATES } from './workflowTemplates';
import { AGENT_OUTPUTS, AGENT_SOURCES, CADENCES, lookFor } from './workflowNodes';
import type { AutomationNode } from '../../types/marketing';

import { T, nodeTone, primaryBtn } from './theme';

const INK = T.ink;
const MUTED = T.muted;
const LINE = T.line;
const ACCENT = T.accent;

/*
 * ── The sections of a project ──
 *
 * `agents` came back after being cut, and it is a different tab now. It used to
 * list guardrails, which answers "what is it allowed to do" rather than "what
 * is it doing" — a wall of green switches with nothing behind them. It now
 * lists the steps the AI actually performs, each one a link into the workflow
 * that holds it, so deleting the step deletes the duty.
 *
 * `assets` and `activity` answer the two questions the board could not: where
 * is the work it produced, and what is it about to do.
 *
 * ── Assets and Content Library used to be two tabs ──
 *
 * They answered the same question in two shapes — a grid of thumbnails and a
 * list of the same records — and nobody could say which one to open, including
 * the person who built them. Worse, they were fed from slightly different
 * places: Assets from the produced records, the Library from today's ledger
 * only, so a post written yesterday appeared in one and not the other and the
 * screen contradicted itself.
 *
 * One tab now, with a view switch inside it. Same list, two ways of looking at
 * it, one source.
 */
type Tab = 'workflows' | 'agents' | 'assets' | 'activity' | 'analytics' | 'settings';

const TABS: { id: Tab; label: string; icon: typeof Bot }[] = [
  { id: 'workflows', label: 'Workflows', icon: WorkflowIcon },
  { id: 'agents', label: 'AI Agents', icon: Bot },
  { id: 'assets', label: 'Assets', icon: ImageIcon },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Project Settings', icon: SettingsIcon },
];

/** The tint behind each workflow's index badge, so a card is findable at a glance. */
const INDEX_TINT = ['#2563eb', '#ea580c', '#16a34a', '#7c3aed', '#0891b2', '#db2777'];

/**
 * Things worth asking this project for.
 *
 * Chosen by what the project is *for*, because "create a webinar registration
 * flow" is noise on a plumbing project and the whole point of a suggestion is
 * that it is one you might actually want. They fill the box rather than
 * building on click: a one-click template teaches nothing about what a usable
 * instruction looks like.
 */
function promptsFor(kind: string): string[] {
  if (kind === 'ecommerce') {
    return [
      'When somebody buys, thank them a day later and ask for a review',
      'Chase an abandoned basket after four hours',
      'Email anybody who has not bought in three months',
      'Tag a repeat buyer and send them the new range',
    ];
  }
  if (kind === 'consultancy') {
    return [
      'When a discovery call is booked, send what to prepare',
      'Follow up two days after a proposal goes out',
      'Re-engage a lead that went quiet after a call',
      'Ask for a testimonial a week after a project ends',
    ];
  }
  return [
    'When somebody fills in the quote form, tag them and email within the hour',
    'Chase an enquiry that has gone quiet after three days',
    'Text anybody who has not replied to two emails',
    'Follow up after a missed appointment and offer to rebook',
  ];
}

export default function ProjectCard({
  project, portfolio, onChanged, onToggle, onDelete, tools,
}: {
  project: Project;
  /** The client this project is for. Null when none was chosen — the logo then
   *  falls back to a letter and says there is nowhere to keep one. */
  portfolio: Portfolio | null;
  onChanged: () => void;
  onToggle: (p: Project) => void;
  onDelete: (p: Project) => void;
  /** The settings tab's contents, which the board already owns. */
  tools: React.ReactNode;
}) {
  const navigate = useNavigate();
  /* The designer's own posts, for their thumbnails. Read from the context that
     already holds them rather than fetched again — the Assets tab is a view of
     work that exists, not a second source of it. */
  const { socialPosts } = useApp();
  const [tab, setTab] = useState<Tab>('workflows');
  /* Grid to recognise a picture, list to read a name. Not stored: it is a
     glance, not a preference, and a remembered one is a setting to explain. */
  const [assetView, setAssetView] = useState<'grid' | 'list'>('grid');
  const [flows, setFlows] = useState<ProjectWorkflow[]>([]);
  /* What the scheduled agents have made. Its own request because it is its own
     table: these rows are written by the cron with nobody signed in, so they
     cannot be derived from anything the browser already holds. */
  const [runs, setRuns] = useState<AgentRun[]>([]);
  /* Who is standing where. Arrives with the graphs, so the canvas cannot draw a
     step as busy while the header says nothing is running. */
  const [stepState, setStepState] = useState<StepStates>({});
  const [runCounts, setRunCounts] = useState<RunCounts>({});
  const [day, setDay] = useState<ProjectDay | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const [prompt, setPrompt] = useState('');
  const [building, setBuilding] = useState(false);
  const [answer, setAnswer] = useState('');
  const [answerBad, setAnswerBad] = useState(false);

  /* Null means closed; `{ workflow: null }` means a new one. A nested null is
     the clearest way to say "open, on nothing" without a second flag that can
     disagree with the first. */
  /* `focus` is the step to open on. Null means "the first one", which is what
     the Edit button means; a node id is what clicking a step on the canvas
     means. Carried here rather than inside the editor because the editor is
     unmounted between openings and would forget it. */
  const [editing, setEditing] = useState<{ workflow: ProjectWorkflow | null; focus?: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState('');

  const live = project.status === 'running' || project.status === 'learning';

  const read = useCallback(async () => {
    const [w, d, a] = await Promise.all([
      fetchWorkflows(project.id), fetchProjectDay(project.id), fetchAgentRuns(project.id),
    ]);
    if (w.error) setError(w.error); else setError('');
    setFlows(w.workflows);
    setStepState(w.stepState);
    setRunCounts(w.runCounts);
    if (d.day) setDay(d.day);
    /* A failed read leaves the last good list rather than emptying the tab:
       "nothing yet" and "could not ask" look identical in an empty list, and
       only one of them is true. */
    if (!a.error) setRuns(a.runs);
  }, [project.id]);

  /**
   * How often to ask, which is not a constant.
   *
   * ── Why this was changed ──
   *
   * Every thirty seconds, three requests, per card. A board of six projects
   * left open on a spare monitor was two thousand five hundred requests an
   * hour, almost all of them fetching an answer that had not moved — the
   * planner runs on a five-minute cron, so four polls in five are asking a
   * question that cannot have a new answer yet. Together with the housekeeping
   * this was why Cloudflare started writing about the daily D1 limit.
   *
   * So: fast while something is genuinely in flight and somebody is watching
   * it happen, and a lot slower when the project is simply ticking over. An
   * idle project still refreshes the instant the tab is brought back to the
   * front, which is the moment anybody actually looks.
   */
  const inFlight = building || !!busyId || (day?.upcoming.length ?? 0) > 0;
  const everyMs = inFlight ? 30_000 : 150_000;

  useEffect(() => {
    /* Read once on mount and then on a timer. The lint rule against setState in
       an effect is about synchronising React with React; this is the other
       thing it exists for — subscribing to an external system, which is what a
       server on a five-minute cron is. */
    void read();
    /* Nothing is asked while the tab is hidden — several of these left open all
       day should not each hold a request open overnight — and everything is
       asked the moment it comes back. */
    const tick = () => { if (document.visibilityState === 'visible') void read(); };
    const t = window.setInterval(tick, everyMs);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [read, everyMs]);

  const activeFlows = flows.filter(f => f.status === 'active').length;

  async function build() {
    const text = prompt.trim();
    if (text.length < 8 || building) return;
    setBuilding(true);
    const r = await buildWorkflow(project.id, text);
    setBuilding(false);
    setAnswer(r.message);
    setAnswerBad(!r.ok);
    if (r.ok) { setPrompt(''); void read(); onChanged(); }
  }

  async function toggleFlow(f: ProjectWorkflow) {
    setBusyId(f.id);
    await setWorkflowStatus(f.id, f.status === 'active' ? 'paused' : 'active');
    setBusyId('');
    void read();
  }

  async function removeFlow(f: ProjectWorkflow) {
    if (!window.confirm(`Delete "${f.name}"? Anybody part-way through it stops where they are.`)) return;
    setBusyId(f.id);
    await deleteWorkflow(f.id);
    setBusyId('');
    void read();
  }

  async function decide(id: string, yes: boolean) {
    setBusyId(id);
    const r = yes ? await approveAction(id) : await rejectAction(id);
    setBusyId('');
    if (!r.success) { setError(r.error ?? 'That could not be done.'); return; }
    void read();
    onChanged();
  }

  const made = (day?.didToday ?? []).filter(a => a.link?.kind);

  /**
   * What this project has produced, as things rather than as log entries.
   *
   * ── Why the asset lives elsewhere and this is a shortcut ──
   *
   * A social post belongs to the Social Creator, a page to Websites, a draft to
   * the Blog. Copying them here would be a second copy to keep in step, and the
   * one somebody edited would always be the other one. So each tile carries the
   * route to the real record and nothing else.
   *
   * The thumbnail is the designer's own, when the ledger's link names a post
   * that still exists. A tile with no thumbnail shows its kind instead of a
   * placeholder image, because a grey rectangle pretending to be a picture is
   * worse than an honest icon.
   */
  const assets = [
    ...made
      .filter(a => ['social-post', 'blog-post', 'website', 'funnel', 'short'].includes(a.link?.kind ?? ''))
      .map(a => ({
        id: a.id,
        name: a.link?.label || a.summary,
        kind: (a.link?.kind ?? '').replace(/-/g, ' '),
        route: a.link?.route ?? '',
        thumbnail: socialPosts.find(p => p.id === a.link?.id)?.thumbnail ?? '',
        at: a.actedAt ?? a.createdAt,
      })),
    /* And what the scheduled agents made, which is not in the ledger at all:
       the ledger is the planner's queue, and an agent answers a clock rather
       than a planned action. Only the runs that produced something — a
       morning the feed was empty made no asset and must not leave a tile
       saying it did. */
    ...runs
      .filter(r => r.outcome === 'ok' && r.link)
      .map(r => ({
        id: r.id,
        name: r.link!.label || r.detail,
        kind: r.link!.kind.replace(/-/g, ' '),
        route: r.link!.route,
        thumbnail: socialPosts.find(p => p.id === r.link!.id)?.thumbnail ?? '',
        at: r.createdAt,
      })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));

  /**
   * What the AI actually does on this project, read from the workflows.
   *
   * The tab used to list guardrails alone, which answers "what is it allowed to
   * do" and not "what is it doing" — and the second is the question somebody
   * opening a tab called AI Agents is asking. A permission with no step behind
   * it is a permission nothing uses.
   *
   * So every step the AI performs is gathered from the live graphs, with the
   * workflow it belongs to. That is a real connection: delete the step and the
   * duty disappears, because there is nothing else holding it up.
   */
  const duties = flows
    .filter(f => f.status === 'active')
    .flatMap(f => (f.nodes ?? [])
      .filter(node => node.type === 'ai' || node.type === 'send_email'
        || node.type === 'send_sms' || node.type === 'condition')
      .map(node => ({ workflow: f.name, workflowId: f.id, node })));

  /**
   * The agents proper: a step that reads a source and writes something, with
   * what it has actually produced attached.
   *
   * Separated from `duties` because these are the only steps that run on their
   * own clock, and "when did it last do anything" is the question about them.
   * A condition inside a follow-up has no such answer.
   */
  const agents = flows
    .flatMap(f => (f.nodes ?? [])
      .filter(node => node.type === 'ai')
      .map(node => {
        const mine = runs.filter(r => r.workflowId === f.id && r.nodeId === node.id);
        return {
          workflow: f,
          node,
          cadence: String((f.nodes ?? []).find(n => n.type === 'trigger')?.config?.cadence ?? ''),
          scheduled: (f.nodes ?? []).some(n => n.type === 'trigger' && n.config?.event === 'schedule'),
          last: mine[0] ?? null,
          /* Produced, not run: a skipped morning is not an achievement and
             counting it as one is how a screen stops being believed. */
          produced: mine.filter(r => r.outcome === 'ok').length,
        };
      }));

  /**
   * How far through its opening plan this project is.
   *
   * The launch order somebody agreed to in the wizard, against what Autopilot
   * has actually finished. A real fraction: each step is matched to a card in
   * the ledger, so nothing here moves until a record exists.
   *
   * This is what a brand-new project shows instead of an empty frame. It is
   * deliberately not a bar that fills on a timer — the whole complaint about
   * those is that they are indistinguishable from progress.
   */
  const plan = project.launchSteps ?? [];
  const finished = (day?.didToday ?? []).filter(a => a.kind !== 'observe' && a.kind !== 'error');
  const planDone = plan.filter(step => {
    const words = step.label.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    return finished.some(a => words.some(w => `${a.summary} ${a.detail}`.toLowerCase().includes(w)));
  }).length;
  const planPercent = plan.length ? Math.round((planDone / plan.length) * 100) : 0;
  /* A project with nothing yet: no workflows, nothing produced, and the planner
     has not run. That is the state the loading view is for — and it is not the
     same as a project somebody has emptied, which has been planned. */
  const preparing = !flows.length && !finished.length && !project.lastPlannedAt;

  /**
   * What the bot has to say, and nothing it does not.
   *
   * Every line is a fact about a record on this screen: a workflow that is
   * live, a run that happened, an approval that is waiting. Nothing is
   * "analysing your audience" — a line like that costs nothing to write, cannot
   * be checked, and is what a customer remembers when their mail bounces a
   * fortnight later.
   *
   * The last line is the honest one, and it is the only one a brand-new project
   * gets. A face with nothing true to say should say that rather than fill the
   * silence.
   */
  const botLines: string[] = (() => {
    const say: string[] = [];
    const liveFlows = flows.filter(f => f.status === 'active');

    if (!live) {
      return ['This project is paused, so I am not doing anything on it. Switch it on and I pick up at the next pass.'];
    }

    if (liveFlows.length) {
      say.push(`${liveFlows.length} workflow${liveFlows.length === 1 ? ' is' : 's are'} switched on. I check them every five minutes.`);
    }
    if (agents.length) {
      const scheduled = agents.filter(a => a.scheduled && a.workflow.status === 'active').length;
      if (scheduled) say.push(`${scheduled} agent${scheduled === 1 ? '' : 's'} run on a schedule. Everything they write is a draft.`);
    }
    const ok = runs.find(r => r.outcome === 'ok');
    if (ok) say.push(ok.detail);
    const failed = runs.find(r => r.outcome === 'failed');
    if (failed) say.push(`Something needs you: ${failed.detail}`);
    if ((day?.awaiting.length ?? 0) > 0) {
      const n = day?.awaiting.length ?? 0;
      say.push(`${n} thing${n === 1 ? '' : 's'} waiting on you before I can go ahead.`);
    }
    if (finished.length) {
      say.push(`${finished.length} thing${finished.length === 1 ? '' : 's'} carried out today.`);
    }

    if (!say.length) {
      say.push(preparing
        ? 'I am reading this client\u2019s profile. Nothing has been written yet — the first pass runs within the day.'
        : 'Nothing has happened here today. I run on the server every five minutes whether or not this is open.');
    }
    return say;
  })();

  async function addTemplate(key: string) {
    const t = TEMPLATES.find(x => x.key === key);
    if (!t || adding) return;
    setAdding(key);
    const r = await saveWorkflow(project.id, {
      name: t.name, description: t.description,
      /* A draft, always. Each of these sends something. */
      status: 'draft', nodes: t.nodes,
    });
    setAdding('');
    setPicking(false);
    if (!r.success) { setError(String(r.error ?? 'That could not be added.')); return; }
    void read();
    onChanged();
  }

  return (
    <section style={{
      display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0, 1fr) 272px', alignItems: 'start',
    }} className="ap-project">
      {/* ── The project ── */}
      <div style={{
        background: T.panel, border: `1px solid ${LINE}`, borderRadius: 18, overflow: 'hidden', minWidth: 0,
      }}>
        {/* Identity */}
        <header style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', flexWrap: 'wrap',
          background: 'linear-gradient(180deg, rgba(91,124,250,0.07), transparent)',
          borderBottom: `1px solid ${LINE}`,
        }}>
          {/* The client's own mark. This is the spot somebody scanning a stack
              of six projects uses to find their place, so it belongs to the
              client rather than to the system — the bot lives beside the AI
              column, where what it says about the system is the subject. */}
          <ProjectLogo
            portfolio={portfolio}
            projectName={project.name}
            onSaved={() => { onChanged(); void read(); }}
            onError={setError}
          />

          <span style={{ minWidth: 0, flex: '1 1 240px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16.5, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>
                {project.name}
              </span>
              <button
                role="switch"
                aria-checked={live}
                aria-label={`${live ? 'Pause' : 'Resume'} ${project.name}`}
                onClick={() => onToggle(project)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px 3px 4px',
                  borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  background: live ? T.goodSoft : T.lineSoft,
                }}>
                <span style={{
                  width: 26, height: 15, borderRadius: 999, position: 'relative', flexShrink: 0,
                  background: live ? T.good : T.line, transition: 'background 0.15s',
                }}>
                  <span style={{
                    position: 'absolute', top: 2, left: live ? 13 : 2, width: 11, height: 11,
                    borderRadius: 999, background: '#fff', transition: 'left 0.15s',
                  }} />
                </span>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: live ? T.good : MUTED }}>
                  {live ? 'Active' : 'Paused'}
                </span>
              </button>
            </span>
            <span style={{ display: 'block', fontSize: 12, color: MUTED, marginTop: 2, lineHeight: 1.45 }}>
              {project.objective || `${KIND_LABEL[project.kind] ?? project.kind} for ${project.portfolioName || 'this client'}`}
            </span>
          </span>

          <span style={{ display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: MUTED }}>
              <Calendar size={11} />
              Created {project.createdAt ? new Date(project.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: MUTED }}>
              <BarChart3 size={11} />
              {activeFlows} workflow{activeFlows === 1 ? '' : 's'} active
            </span>
            <button onClick={() => setMenu(m => !m)} aria-label={`More for ${project.name}`} style={{
              border: 'none', background: 'none', padding: 3, cursor: 'pointer', color: MUTED, display: 'flex',
            }}><MoreHorizontal size={16} /></button>
          </span>

          {menu && (
            <div style={{ display: 'flex', gap: 7, width: '100%', paddingTop: 2 }}>
              <button onClick={() => { setMenu(false); setTab('settings'); }} className="press" style={ghost()}>
                Settings
              </button>
              <button onClick={() => { setMenu(false); onDelete(project); }} className="press"
                style={{ ...ghost(), color: '#b42318' }}>
                <Trash2 size={11} /> Delete project
              </button>
            </div>
          )}
        </header>

        {/* Its own tabs */}
        <div role="tablist" aria-label={`${project.name} sections`} style={{
          display: 'flex', gap: 2, padding: '0 12px', borderBottom: `1px solid ${LINE}`,
          overflowX: 'auto', background: T.panel,
        }}>
          {TABS.map(({ id, label, icon: Ic }) => {
            const on = tab === id;
            return (
              <button key={id} role="tab" aria-selected={on} onClick={() => setTab(id)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 12px',
                border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 12.5, fontWeight: on ? 800 : 600, whiteSpace: 'nowrap',
                color: on ? T.accent : MUTED,
                borderBottom: `2px solid ${on ? T.accent : 'transparent'}`, marginBottom: -1,
              }}>
                <Ic size={12} />
                {label}
                {id === 'workflows' && flows.length > 0 && ` (${flows.length})`}
              </button>
            );
          })}
        </div>

        {/* ── What it has actually made ──
            Under the tabs rather than inside one, because "is this doing
            anything" is the question somebody has on every tab, and answering
            it only inside Assets means they have to already believe the answer
            is yes in order to go and look. */}
        <ProducedRail items={assets.slice(0, 12).map(a => ({
          id: a.id, kind: a.kind.replace(/ /g, '-'), label: a.name, route: a.route, at: a.at,
        }))} />

        <div style={{ padding: 14 }}>
          {error && (
            <p style={{
              margin: '0 0 12px', padding: '10px 13px', borderRadius: 10, background: '#fdf3f3',
              border: `1px solid ${T.bad}55`, color: T.bad, fontSize: 12.5,
            }}>{error}</p>
          )}

          {/* ── Workflows ── */}
          {tab === 'workflows' && (
            !flows.length ? (
              <div style={{ padding: '18px 6px' }}>
                {preparing && (
                  /*
                   * A brand-new project, before the planner has run.
                   *
                   * The bar is the launch plan the customer agreed to in the
                   * wizard against what has actually finished — a real fraction
                   * over real steps, which is why it can sit at 0% and say so
                   * rather than creeping upward to look busy.
                   */
                  <div style={{
                    border: `1px solid ${T.line}`, background: 'linear-gradient(180deg, rgba(91,124,250,0.1), transparent)', borderRadius: 14,
                    padding: 14, marginBottom: 14,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                      <AutopilotBot size={30} awake busy />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: INK }}>
                          Getting this project ready
                        </span>
                        <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 1 }}>
                          It plans once a day and acts every five minutes, on the server.
                        </span>
                      </span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 13, fontWeight: 800, color: ACCENT }}>{planPercent}%</span>
                    </div>

                    <div style={{ height: 6, borderRadius: 999, background: T.lineSoft, overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.max(planPercent, 2)}%`, height: '100%', borderRadius: 999,
                        background: ACCENT, transition: 'width 0.5s ease',
                      }} />
                    </div>
                    {/* The sweep says "still working" without pretending the
                        number underneath has moved. */}
                    <div className={live ? 'ap-tick-bar' : undefined} style={{ marginTop: 7 }} aria-hidden />

                    {plan.length > 0 && (
                      <ol style={{ margin: '11px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 5 }}>
                        {plan.slice(0, 6).map((step, i) => (
                          <li key={step.label} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <span style={{
                              marginTop: 4, width: 6, height: 6, borderRadius: 999, flexShrink: 0,
                              background: i < planDone ? T.good : T.line,
                            }} />
                            <span style={{
                              fontSize: 11.5, lineHeight: 1.5,
                              color: i < planDone ? INK : MUTED,
                              textDecoration: i < planDone ? 'line-through' : 'none',
                            }}>{step.label}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                    <p style={{ margin: '10px 0 0', fontSize: 10.5, color: MUTED, lineHeight: 1.5 }}>
                      Nothing above moves on a timer — a step is ticked when the record behind it exists.
                      You do not have to wait: start a workflow yourself below.
                    </p>
                  </div>
                )}

                <div style={{ textAlign: 'center', padding: '10px 10px 4px' }}>
                  <span style={{
                    width: 40, height: 40, borderRadius: 13, background: T.accentSoft, color: T.accent,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10,
                  }}><WorkflowIcon size={18} /></span>
                  <h4 style={{ margin: '0 0 5px', fontSize: 14, fontWeight: 800, color: INK }}>
                    No workflows on this project yet
                  </h4>
                  <p style={{ margin: '0 auto 13px', maxWidth: 440, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
                    A workflow is what happens on its own when somebody fills in this client's form, is
                    tagged, or goes quiet. Build one, start from a template below, or describe one to the
                    AI beside this.
                  </p>

                  {/*
                    * The same button a project gets once it has a workflow.
                    *
                    * It was only offered as a dashed tile at the bottom of a
                    * grid of eight templates, worded differently — so a
                    * customer on a brand-new project looked for "Create
                    * workflow", did not find it, added a template to get past
                    * it, and only then saw the button appear. The empty state
                    * is the one place the primary action must be impossible to
                    * miss, not the one place it is hidden.
                    */}
                  <button onClick={() => setEditing({ workflow: null })} className="press ap-btn"
                    style={{ ...primaryBtn, padding: '11px 20px' }}>
                    <Plus size={14} /> Create workflow
                  </button>
                </div>

                {/* Somebody can start one themselves rather than waiting. */}
                <div style={{ display: 'grid', gap: 7, gridTemplateColumns: 'repeat(auto-fill, minmax(min(250px, 100%), 1fr))' }}>
                  {TEMPLATES.map(t => (
                    <button key={t.key} onClick={() => void addTemplate(t.key)} disabled={!!adding}
                      className="press" style={{
                        display: 'flex', gap: 9, alignItems: 'flex-start', textAlign: 'left',
                        padding: '11px 12px', border: `1px solid ${LINE}`, borderRadius: 12,
                        background: T.raised, cursor: adding ? 'default' : 'pointer', fontFamily: 'inherit',
                      }}>
                      {adding === t.key
                        ? <Loader size={13} className="spin" color={T.accent} style={{ marginTop: 2, flexShrink: 0 }} />
                        : <Plus size={13} color={T.accent} style={{ marginTop: 2, flexShrink: 0 }} />}
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: INK }}>{t.name}</span>
                        <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 2, lineHeight: 1.5 }}>
                          {t.blurb}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
                <p style={{ margin: '11px 0 0', fontSize: 10.5, color: MUTED, lineHeight: 1.5, textAlign: 'center' }}>
                  Every one arrives switched off and is yours to change, step by step, before anybody hears
                  from it.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  <button onClick={() => setEditing({ workflow: null })} className="press ap-btn"
                    style={{ ...primaryBtn, padding: '9px 16px' }}>
                    <Plus size={13} /> Create workflow
                  </button>
                  <button onClick={() => setPicking(p => !p)} className="press" style={ghost()}>
                    Start from a template
                  </button>
                </div>

                {picking && (
                  <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))' }}>
                    {TEMPLATES.map(t => (
                      <button key={t.key} onClick={() => void addTemplate(t.key)} disabled={!!adding}
                        className="press" style={{
                          display: 'flex', gap: 8, alignItems: 'flex-start', textAlign: 'left',
                          padding: '10px 11px', border: `1px solid ${LINE}`, borderRadius: 11,
                          background: T.raised, cursor: adding ? 'default' : 'pointer', fontFamily: 'inherit',
                        }}>
                        {adding === t.key
                          ? <Loader size={12} className="spin" color={T.accent} style={{ marginTop: 2, flexShrink: 0 }} />
                          : <Plus size={12} color={T.accent} style={{ marginTop: 2, flexShrink: 0 }} />}
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: INK }}>{t.name}</span>
                          <span style={{ display: 'block', fontSize: 10.5, color: MUTED, marginTop: 1, lineHeight: 1.45 }}>
                            {t.blurb}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {flows.map((f, i) => {
                  const isOpen = open[f.id] !== false;
                  const on = f.status === 'active';
                  return (
                    <article key={f.id} style={{
                      border: `1px solid ${LINE}`, borderRadius: 14, overflow: 'hidden',
                      background: T.raised,
                    }}>
                      <header style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', flexWrap: 'wrap' }}>
                        <button onClick={() => setOpen(o => ({ ...o, [f.id]: !isOpen }))}
                          aria-expanded={isOpen} aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${f.name}`}
                          style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}>
                          {isOpen ? <ChevronDown size={14} color={MUTED} /> : <ChevronRight size={14} color={MUTED} />}
                        </button>
                        <span style={{
                          width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                          background: INDEX_TINT[i % INDEX_TINT.length], color: '#fff',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10.5, fontWeight: 800,
                        }}>{i + 1}</span>
                        <span style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>{f.name}</span>
                        <span style={{
                          fontSize: 11, color: MUTED, minWidth: 0, flex: '1 1 120px',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{f.description}</span>

                        {/*
                          * Is it actually doing anything?
                          *
                          * "Active" says it is switched on, which is not the
                          * same question — a live workflow nobody has ever
                          * triggered looks identical to one running fifty
                          * people through a week. These are counted from real
                          * runs, so a workflow with nothing in it says nothing
                          * rather than showing a zero dressed up as progress.
                          */}
                        {(runCounts[f.id]?.active ?? 0) > 0 && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                            padding: '2px 9px', borderRadius: 999, fontSize: 10, fontWeight: 800,
                            background: T.accentSoft, color: T.accent,
                          }}>
                            <span className="ap-live-dot" style={{ background: T.accent }} />
                            {runCounts[f.id].active} in it now
                          </span>
                        )}
                        {(runCounts[f.id]?.done ?? 0) > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: MUTED, flexShrink: 0 }}>
                            {runCounts[f.id].done} finished
                          </span>
                        )}

                        <span style={{ fontSize: 10.5, fontWeight: 700, color: on ? '#15803d' : MUTED }}>
                          {on ? 'Active' : f.status === 'paused' ? 'Paused' : 'Draft'}
                        </span>
                        <button
                          role="switch"
                          aria-checked={on}
                          aria-label={`${on ? 'Pause' : 'Switch on'} ${f.name}`}
                          disabled={busyId === f.id}
                          onClick={() => void toggleFlow(f)}
                          style={{
                            width: 32, height: 18, borderRadius: 999, border: 'none', flexShrink: 0,
                            cursor: busyId === f.id ? 'default' : 'pointer', position: 'relative',
                            background: on ? T.good : T.line, transition: 'background 0.15s',
                          }}>
                          <span style={{
                            position: 'absolute', top: 2, left: on ? 16 : 2, width: 14, height: 14,
                            borderRadius: 999, background: '#fff', transition: 'left 0.15s',
                          }} />
                        </button>
                        <button onClick={() => setEditing({ workflow: f })} className="press" style={ghost()}>
                          Edit
                        </button>
                        <button onClick={() => void removeFlow(f)} aria-label={`Delete ${f.name}`}
                          className="press" style={{ ...ghost(), color: '#b42318', padding: '5px 8px' }}>
                          <Trash2 size={11} />
                        </button>
                      </header>

                      {isOpen && (
                        <div style={{ background: T.panel, borderTop: `1px solid ${LINE}`, padding: 12 }}>
                          <WorkflowCanvas
                            nodes={f.nodes as unknown as AutomationNode[]}
                            live={on && live}
                            stepState={stepState[f.id]}
                            /* The step *is* the control. Opening the builder
                               and then hunting for the step you were already
                               pointing at was three actions for one edit. */
                            onPickStep={id => setEditing({ workflow: f, focus: id })}
                          />
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )
          )}

          {/* ── AI Agents: what this project's AI may do, and what it is doing ── */}
          {tab === 'agents' && (
            <div style={{ display: 'grid', gap: 15 }}>
              {/*
                * What the AI is actually on the hook for, read from the live
                * workflows.
                *
                * This tab listed permissions alone, which answers "what is it
                * allowed to do" and not "what is it doing" — and the second is
                * the question somebody opening a tab called AI Agents is
                * asking. A permission with no step behind it is a permission
                * nothing uses, and a customer reading a wall of green switches
                * would reasonably conclude a great deal was happening.
                *
                * Every row here is a real step in a real workflow. Delete the
                * step and the duty disappears, because nothing else holds it up.
                */}
              {/* ── The agents that run on their own clock ──
                  First, because they are the only steps here that do anything
                  without somebody filling a form in. Each one says what it
                  reads, what it makes, and when it last actually made it — and
                  a run that produced nothing says so rather than being counted.
              */}
              {agents.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 800, color: INK }}>
                    Agents on a schedule
                  </h4>
                  <p style={{ margin: '0 0 9px', fontSize: 11.5, color: MUTED, lineHeight: 1.55 }}>
                    These read something and write something, on the server, whether or not this is open.
                    Everything they make is a draft.
                  </p>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {agents.map(({ workflow, node, cadence, scheduled, last, produced }) => {
                      const src = AGENT_SOURCES[node.config?.source ?? 'portfolio'];
                      const out = AGENT_OUTPUTS[node.config?.produces ?? 'social'];
                      return (
                        <article key={`${workflow.id}-${node.id}`} style={{
                          border: `1px solid ${LINE}`, borderRadius: 12, padding: 11, background: T.raised,
                          display: 'grid', gap: 7,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                            <span style={{
                              width: 24, height: 24, borderRadius: 8, flexShrink: 0,
                              background: nodeTone('ai').bg, color: nodeTone('ai').fg,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            }}><Bot size={12} /></span>
                            <span style={{ minWidth: 0, flex: '1 1 140px' }}>
                              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: INK }}>
                                {node.label || 'AI agent'}
                              </span>
                              <span style={{ display: 'block', fontSize: 10.5, color: MUTED }}>
                                in “{workflow.name}”
                              </span>
                            </span>
                            <span style={{
                              padding: '2px 9px', borderRadius: 999, fontSize: 9.5, fontWeight: 800, flexShrink: 0,
                              background: workflow.status === 'active' ? T.goodSoft : T.lineSoft,
                              color: workflow.status === 'active' ? T.good : MUTED,
                            }}>
                              {/* Three states, not two. A live agent with no
                                  schedule never fires, and saying "Live" would
                                  be the screen telling a comfortable lie. */}
                              {workflow.status !== 'active' ? 'Switched off'
                                : scheduled ? (CADENCES[cadence] ?? CADENCES.daily)
                                  : 'Live, but not on a schedule'}
                            </span>
                          </div>

                          <p style={{ margin: 0, fontSize: 11.5, color: MUTED, lineHeight: 1.55 }}>
                            Reads {src?.label.toLowerCase() ?? 'nothing set'} → writes{' '}
                            {out?.label.toLowerCase() ?? 'nothing set'} into {out?.where ?? 'the app'}.
                          </p>

                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 10.5, color: MUTED }}>
                              {last
                                ? `Last run ${new Date(last.createdAt).toLocaleString()} — ${last.outcome === 'ok' ? 'made something' : last.outcome === 'skipped' ? 'nothing new to write about' : 'failed'}`
                                : 'Has not run yet.'}
                            </span>
                            {produced > 0 && (
                              <span style={{
                                padding: '2px 8px', borderRadius: 999, fontSize: 9.5, fontWeight: 800,
                                background: T.goodSoft, color: T.good,
                              }}>{produced} made</span>
                            )}
                          </div>

                          {last && last.outcome !== 'ok' && (
                            <p style={{
                              margin: 0, padding: '8px 10px', borderRadius: 9, fontSize: 11, lineHeight: 1.5,
                              background: last.outcome === 'failed' ? T.badSoft : T.lineSoft,
                              color: last.outcome === 'failed' ? T.bad : MUTED,
                            }}>{last.detail}</p>
                          )}

                          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                            <button className="press" style={ghost()}
                              onClick={() => { setEditing({ workflow }); }}>
                              <Sparkles size={11} /> Edit this agent
                            </button>
                            {last?.link && (
                              <button className="press" style={ghost()}
                                onClick={() => navigate(last.link!.route)}>
                                <ExternalLink size={11} /> Open what it made
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3 }}>
                  <AutopilotBot size={30} awake={live} busy={duties.length > 0} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: INK }}>
                      What it is on the hook for
                    </span>
                    <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 1 }}>
                      {duties.length
                        ? `${duties.length} step${duties.length === 1 ? '' : 's'} across ${new Set(duties.map(d => d.workflowId)).size} live workflow${new Set(duties.map(d => d.workflowId)).size === 1 ? '' : 's'}.`
                        : 'Nothing yet — no live workflow has a step it performs.'}
                    </span>
                  </span>
                </div>

                {duties.length > 0 && (
                  <ul style={{ margin: '9px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
                    {duties.slice(0, 12).map(({ workflow, node }) => {
                      const look = lookFor(node.type);
                      const Ic = look.icon;
                      return (
                        <li key={`${workflow}-${node.id}`} style={{
                          display: 'flex', gap: 9, alignItems: 'center', padding: '8px 11px',
                          border: `1px solid ${LINE}`, borderRadius: 10, background: T.raised,
                        }}>
                          <span style={{
                            width: 22, height: 22, borderRadius: 7,
                            background: nodeTone(node.type).bg, color: nodeTone(node.type).fg,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}><Ic size={11} /></span>
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <span style={{
                              display: 'block', fontSize: 12, fontWeight: 700, color: INK,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>{node.label || look.label}</span>
                            <span style={{ display: 'block', fontSize: 10.5, color: MUTED }}>
                              in “{workflow}”
                            </span>
                          </span>
                          <span style={{
                            padding: '2px 8px', borderRadius: 999, fontSize: 9.5, fontWeight: 800,
                            background: nodeTone(node.type).bg, color: nodeTone(node.type).fg, flexShrink: 0,
                          }}>{look.label}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {duties.length > 12 && (
                  <p style={{ margin: '7px 0 0', fontSize: 10.5, color: MUTED }}>
                    and {duties.length - 12} more.
                  </p>
                )}
              </div>

              {/* ── Where the permissions went ──
                  They were listed here, unchangeable, which is the worst of
                  both: it is the first thing somebody wants to adjust after
                  reading it. They now live in Project Settings, where the rest
                  of what this project *is* lives, and this points at them
                  rather than repeating them somewhere they still cannot be
                  touched. */}
              <button onClick={() => setTab('settings')} className="press" style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                padding: '11px 13px', border: `1px solid ${LINE}`, borderRadius: 12,
                background: T.raised, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <SettingsIcon size={14} color={T.accent} style={{ flexShrink: 0 }} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: INK }}>
                    What this project is allowed to do
                  </span>
                  <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 2, lineHeight: 1.5 }}>
                    {(() => {
                      const g = Object.values(project.guardrails ?? {});
                      const on = g.filter(v => v === 'on').length;
                      const ask = g.filter(v => v === 'approval').length;
                      const off = g.filter(v => v === 'off').length;
                      return `${on} on its own · ${ask} ask first · ${off} off — change them in Project Settings`;
                    })()}
                  </span>
                </span>
                <ChevronRight size={14} color={MUTED} style={{ flexShrink: 0 }} />
              </button>

              {(day?.awaiting.length ?? 0) > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 7px', fontSize: 13, fontWeight: 800, color: '#7a4d00' }}>
                    Waiting for you
                  </h4>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {(day?.awaiting ?? []).map(a => (
                      <article key={a.id} style={{ border: '1px solid #f0dcb4', borderRadius: 11, padding: 11, background: '#fffdf7' }}>
                        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: INK }}>{a.summary}</p>
                        <p style={{ margin: '3px 0 0', fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>{a.because}</p>
                        <div style={{ display: 'flex', gap: 7, marginTop: 9 }}>
                          <button onClick={() => void decide(a.id, true)} disabled={busyId === a.id}
                            className="press" style={{ ...ghost(), background: ACCENT, color: '#fff', border: 'none' }}>
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
            </div>
          )}

          {/* ── Assets: the pictures and files this project has produced ──
              Its own tab because "where is the thing it made" is a different
              question from "what did it do", and answering it with a log entry
              means opening five cards to find one image. */}
          {tab === 'assets' && (
            !assets.length ? (
              <div style={{ padding: '26px 10px', textAlign: 'center' }}>
                <span style={{
                  width: 40, height: 40, borderRadius: 13, background: T.accentSoft, color: T.accent,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10,
                }}><ImageIcon size={18} /></span>
                <h4 style={{ margin: '0 0 5px', fontSize: 14, fontWeight: 800, color: INK }}>
                  Nothing made yet
                </h4>
                <p style={{ margin: '0 auto', maxWidth: 430, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
                  Social posts, page designs and images this project produces collect here, with a link to
                  the module that owns each one — the asset itself lives there, and this is the shortcut.
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 11 }}>
                {/* ── Two ways of looking at one list ──
                    This was two tabs, fed from two slightly different places,
                    so a post written yesterday appeared in one and not the
                    other. One list now; the switch only changes how it is
                    drawn. Grid to recognise a picture, list to read a name. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, color: MUTED, flex: 1, minWidth: 0 }}>
                    {assets.length} {assets.length === 1 ? 'thing' : 'things'} made. Each one lives in the
                    module that owns it — this is the shortcut, not a copy.
                  </span>
                  <div role="radiogroup" aria-label="How to show these"
                    style={{ display: 'inline-flex', gap: 3, padding: 3, borderRadius: 999, background: T.lineSoft }}>
                    {(['grid', 'list'] as const).map(v => (
                      <button key={v} role="radio" aria-checked={assetView === v}
                        onClick={() => setAssetView(v)} style={{
                          padding: '4px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
                          fontFamily: 'inherit', fontSize: 11, fontWeight: 800,
                          background: assetView === v ? '#fff' : 'transparent',
                          color: assetView === v ? T.ink : MUTED,
                          boxShadow: assetView === v ? '0 1px 2px rgba(16,24,40,0.10)' : 'none',
                        }}>{v === 'grid' ? 'Grid' : 'List'}</button>
                    ))}
                  </div>
                </div>

                {assetView === 'list' ? (
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 7 }}>
                    {assets.map(a => (
                      <li key={a.id}>
                        <button onClick={() => navigate(a.route)} className="press" style={{
                          display: 'flex', gap: 10, alignItems: 'center', width: '100%', textAlign: 'left',
                          border: `1px solid ${LINE}`, borderRadius: 11, padding: '10px 12px',
                          background: T.raised, cursor: 'pointer', fontFamily: 'inherit',
                        }}>
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: INK }}>
                              {a.name}
                            </span>
                            <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 2 }}>
                              {a.kind}{a.at ? ` · ${new Date(a.at).toLocaleDateString()}` : ''}
                            </span>
                          </span>
                          <ExternalLink size={12} color={MUTED} style={{ flexShrink: 0 }} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                <div style={{
                  display: 'grid', gap: 10,
                  gridTemplateColumns: 'repeat(auto-fill, minmax(min(150px, 100%), 1fr))',
                }}>
                {assets.map(a => (
                  <button key={a.id} onClick={() => navigate(a.route)} className="press" style={{
                    display: 'flex', flexDirection: 'column', gap: 0, padding: 0, textAlign: 'left',
                    border: `1px solid ${LINE}`, borderRadius: 12, background: T.raised,
                    cursor: 'pointer', fontFamily: 'inherit', overflow: 'hidden',
                  }}>
                    <span style={{
                      height: 82, background: T.lineSoft, display: 'flex',
                      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                    }}>
                      {a.thumbnail
                        /* The real thumbnail the designer rendered, not a stand-in.
                           `data-noinvert` keeps it right way round under the app's
                           dark-mode filter. */
                        ? <img src={a.thumbnail} alt="" data-noinvert
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <ImageIcon size={20} color={T.faint} />}
                    </span>
                    <span style={{ padding: '8px 9px', minWidth: 0 }}>
                      <span style={{
                        display: 'block', fontSize: 11.5, fontWeight: 700, color: INK,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{a.name}</span>
                      <span style={{ display: 'block', fontSize: 10, color: MUTED, marginTop: 2 }}>
                        {a.kind}{a.at ? ` · ${new Date(a.at).toLocaleDateString()}` : ''}
                      </span>
                    </span>
                  </button>
                ))}
                </div>
                )}
              </div>
            )
          )}

          {/* ── Activity: what is happening and what is next ──
              Two lists rather than one, because "it did this" and "it is about
              to do this" are answered at different moments and a single stream
              buries the second under the first. */}
          {tab === 'activity' && (
            <div style={{ display: 'grid', gap: 15 }}>
              <div>
                <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Activity size={13} color={T.good} /> Going on now
                </h4>
                {!finished.length && !(day?.failedToday ?? []).length ? (
                  <p style={{ margin: 0, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
                    Nothing carried out today. It plans once a day and acts every five minutes on the
                    server, so this fills in without the app being open.
                  </p>
                ) : (
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 7 }}>
                    {[...(day?.failedToday ?? []), ...finished].slice(0, 10).map(a => (
                      <li key={a.id} style={{
                        display: 'flex', gap: 9, alignItems: 'flex-start', padding: '9px 11px',
                        border: `1px solid ${a.status === 'failed' ? `${T.bad}55` : LINE}`,
                        borderRadius: 11, background: a.status === 'failed' ? T.badSoft : T.raised,
                      }}>
                        {a.status === 'failed'
                          ? <AlertTriangle size={12} color={T.bad} style={{ marginTop: 2, flexShrink: 0 }} />
                          : <CheckCircle2 size={12} color={T.good} style={{ marginTop: 2, flexShrink: 0 }} />}
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: INK }}>{a.summary}</span>
                          {a.detail && (
                            <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 2, lineHeight: 1.5 }}>
                              {a.detail}
                            </span>
                          )}
                        </span>
                        <span style={{ fontSize: 10, color: MUTED, flexShrink: 0 }}>
                          {a.actedAt ? new Date(a.actedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* ── What the scheduled agents did ──
                  Kept apart from the ledger above because it answers a
                  different question. The ledger is the planner's queue — what
                  Autopilot decided to do. This is what the clock did, whether
                  or not anybody decided anything, and a morning it found
                  nothing new belongs here and nowhere else. */}
              {runs.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Bot size={13} color={T.violet} /> What the agents made
                  </h4>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 7 }}>
                    {runs.slice(0, 12).map(r => (
                      <li key={r.id} style={{
                        display: 'flex', gap: 9, alignItems: 'flex-start', padding: '9px 11px',
                        border: `1px solid ${r.outcome === 'failed' ? `${T.bad}55` : LINE}`,
                        borderRadius: 11, background: r.outcome === 'failed' ? T.badSoft : T.raised,
                      }}>
                        {r.outcome === 'ok'
                          ? <CheckCircle2 size={12} color={T.good} style={{ marginTop: 2, flexShrink: 0 }} />
                          : r.outcome === 'skipped'
                            /* A clock, not a cross. Nothing went wrong; there
                               was simply nothing new to write about. */
                            ? <Clock size={12} color={T.faint} style={{ marginTop: 2, flexShrink: 0 }} />
                            : <AlertTriangle size={12} color={T.bad} style={{ marginTop: 2, flexShrink: 0 }} />}
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'block', fontSize: 12, color: INK, lineHeight: 1.5 }}>{r.detail}</span>
                          {r.link && (
                            <button onClick={() => navigate(r.link!.route)} style={{
                              marginTop: 4, padding: 0, border: 'none', background: 'none',
                              color: T.accent, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                              fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}>
                              {r.link.label || 'Open it'} <ChevronRight size={11} />
                            </button>
                          )}
                        </span>
                        <span style={{ fontSize: 10, color: MUTED, flexShrink: 0 }}>
                          {new Date(r.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Clock size={13} color={T.accent} /> Coming up
                </h4>
                {!(day?.upcoming ?? []).length ? (
                  <p style={{ margin: 0, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
                    Nothing queued. {live
                      ? 'It plans again within the day and adds what it finds.'
                      : 'This project is paused, so nothing will be.'}
                  </p>
                ) : (
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 7 }}>
                    {(day?.upcoming ?? []).map(a => (
                      <li key={a.id} style={{
                        display: 'flex', gap: 9, alignItems: 'flex-start', padding: '9px 11px',
                        border: `1px solid ${LINE}`, borderRadius: 11, background: T.raised,
                      }}>
                        <Clock size={12} color={T.faint} style={{ marginTop: 2, flexShrink: 0 }} />
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: INK }}>{a.summary}</span>
                          <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 2, lineHeight: 1.5 }}>
                            {a.because}
                          </span>
                        </span>
                        <span style={{ fontSize: 10, color: MUTED, flexShrink: 0, textAlign: 'right' }}>
                          {a.dueAt
                            ? new Date(a.dueAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                            /* No due date means the next tick, which is sooner
                               than anything scheduled — said rather than blank. */
                            : 'next pass'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* ── Content Library: what it has actually produced ── */}
          {/* ── Analytics: the working day, and what went out ── */}
          {tab === 'analytics' && <ProjectFlow day={day} live={live} />}

          {/* ── Settings ── */}
          {tab === 'settings' && (
            <div style={{ display: 'grid', gap: 16 }}>
              {/* The permissions first: it is what somebody opens Settings for,
                  and the infrastructure below it is set once and left. */}
              <Guardrails
                projectId={project.id}
                guardrails={project.guardrails ?? {}}
                onChanged={onChanged}
              />
              {tools}
            </div>
          )}
        </div>
      </div>

      {/* ── Edit with AI, for this project ── */}
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 11, minWidth: 0 }}>
        <section style={{ background: T.aside, border: `1px solid ${LINE}`, borderRadius: 16, padding: 14 }}>
          {/* Where the bot belongs. Here it is *about* something — the thing on
              the other side of this box — rather than decorating a client's
              name. It sleeps when the project is paused and speeds up while
              something is queued, so it is a status light as much as a face. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <AutopilotBot size={44} awake={live} busy={building || (day?.upcoming.length ?? 0) > 0} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: INK }}>Edit with AI</span>
              <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 1 }}>
                Your AI co-pilot
              </span>
            </span>
          </div>
          {/* What it is actually doing, in its own words — every line a fact
              about a record on this screen. */}
          <BotSays lines={botLines} />

          <p style={{ margin: '0 0 9px', fontSize: 11.5, color: MUTED, lineHeight: 1.55 }}>
            Describe a workflow in simple words. It writes it for <strong>{project.portfolioName || 'this client'}</strong>,
            in their voice.
          </p>

          <textarea
            value={prompt}
            onChange={e => { setPrompt(e.target.value.slice(0, 1000)); setAnswer(''); }}
            rows={5}
            placeholder={`e.g. ${promptsFor(project.kind)[0]}`}
            aria-label={`Describe a workflow for ${project.name}`}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 11px', borderRadius: 10,
              border: `1px solid ${LINE}`, fontSize: 12, outline: 'none', resize: 'vertical',
              fontFamily: 'inherit', lineHeight: 1.5,
            }}
          />
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            gap: 8, fontSize: 10, color: MUTED, marginTop: 5,
          }}>
            {/* Renders nothing where the browser has no speech recognition, so
                nobody is offered a button that quietly does not work. */}
            <VoicePrompt
              disabled={building}
              /* Appended, never replacing: somebody who typed two sentences and
                 then reached for the microphone meant to add a third. */
              onText={heard => setPrompt(p => `${p.trim()} ${heard}`.trim().slice(0, 1000))}
            />
            <span style={{ flexShrink: 0, paddingTop: 9 }}>{prompt.length}/1000</span>
          </div>

          <button onClick={() => void build()} disabled={building || prompt.trim().length < 8}
            className={prompt.trim().length >= 8 && !building ? 'press ap-btn' : 'press'} style={{
            ...primaryBtn,
            width: '100%', marginTop: 6, justifyContent: 'center', padding: '10px 14px',
            background: prompt.trim().length >= 8 ? primaryBtn.background : T.line,
            boxShadow: prompt.trim().length >= 8 ? primaryBtn.boxShadow : 'none',
            cursor: building || prompt.trim().length < 8 ? 'default' : 'pointer',
          }}>
            {building ? <Loader size={13} className="spin" /> : <Sparkles size={13} />}
            {building ? 'Building…' : 'Update project'}
          </button>

          {answer && (
            <p style={{
              margin: '8px 0 0', fontSize: 11.5, lineHeight: 1.5,
              color: answerBad ? T.warn : T.good,
            }}>{answer}</p>
          )}
          <p style={{ margin: '7px 0 0', fontSize: 10.5, color: MUTED, lineHeight: 1.5 }}>
            {/* Said before the button, not after something has happened. */}
            It arrives switched off. Nothing reaches anybody until you read it and switch it on.
          </p>
        </section>

        <section style={{ background: T.aside, border: `1px solid ${LINE}`, borderRadius: 16, padding: 14 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 800, color: INK }}>Quick prompts</h4>
          <div style={{ display: 'grid', gap: 5 }}>
            {promptsFor(project.kind).map(q => (
              <button key={q} onClick={() => { setPrompt(q); setAnswer(''); }} className="press" style={{
                display: 'flex', gap: 7, alignItems: 'flex-start', textAlign: 'left',
                padding: '7px 9px', borderRadius: 9, border: `1px solid ${LINE}`,
                background: T.raised, fontSize: 11, color: INK, cursor: 'pointer',
                fontFamily: 'inherit', lineHeight: 1.45,
              }}>
                <Plus size={10} color={ACCENT} style={{ marginTop: 2, flexShrink: 0 }} />
                {q}
              </button>
            ))}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 10.5, color: MUTED, lineHeight: 1.5 }}>
            These fill the box so you can change them before anything is built.
          </p>
        </section>

        <section style={{
          background: T.accentSoft, border: `1px solid ${T.line}`, borderRadius: 16, padding: 13,
        }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 6 }}>
            <HelpCircle size={13} color={ACCENT} /> Need help?
          </p>
          <p style={{ margin: '5px 0 0', fontSize: 11, color: MUTED, lineHeight: 1.55 }}>
            A workflow runs on the server every five minutes, so it keeps working with the app closed. A
            step it cannot carry out is skipped and named, never counted as done.
          </p>
        </section>

        {project.lastError && (
          <p style={{
            margin: 0, padding: '10px 12px', borderRadius: 12, background: '#fdf3f3',
            border: '1px solid #f3cfcf', color: '#7a2622', fontSize: 11.5, lineHeight: 1.55,
            display: 'flex', gap: 7,
          }}>
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{project.lastError.slice(0, 220)}</span>
          </p>
        )}
      </aside>

      {editing && (
        <WorkflowEditor
          projectId={project.id}
          workflow={editing.workflow}
          focusStep={editing.focus}
          onClose={() => setEditing(null)}
          onSaved={() => { void read(); onChanged(); }}
        />
      )}
    </section>
  );
}

function ghost(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px',
    borderRadius: 999, border: `1px solid ${LINE}`, background: T.raised,
    fontSize: 11.5, fontWeight: 700, color: INK, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
  };
}

