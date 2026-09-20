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
  Workflow as WorkflowIcon, Bot, Library, BarChart3, Settings as SettingsIcon,
  Calendar, MoreHorizontal, Plus, Loader, Sparkles, Trash2, HelpCircle,
  ChevronDown, ChevronRight, Pause, Play, ExternalLink, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import {
  fetchWorkflows, setWorkflowStatus, deleteWorkflow, buildWorkflow,
  fetchProjectDay, approveAction, rejectAction,
  type ProjectWorkflow, type ProjectDay,
} from '../../services/autopilot';
import { KIND_LABEL, type Project } from '../../services/projects';
import WorkflowCanvas from './WorkflowCanvas';
import ProjectFlow from './ProjectFlow';
import type { AutomationNode } from '../../types/marketing';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

type Tab = 'workflows' | 'agents' | 'library' | 'analytics' | 'settings';

const TABS: { id: Tab; label: string; icon: typeof Bot }[] = [
  { id: 'workflows', label: 'Workflows', icon: WorkflowIcon },
  { id: 'agents', label: 'AI Agents', icon: Bot },
  { id: 'library', label: 'Content Library', icon: Library },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Project Settings', icon: SettingsIcon },
];

/** The tint behind each workflow's index badge, so a card is findable at a glance. */
const INDEX_TINT = ['#2563eb', '#ea580c', '#16a34a', '#7c3aed', '#0891b2', '#db2777'];

/**
 * A project's initial, in a colour taken from its own name.
 *
 * Deterministic rather than random: the same project is the same colour on
 * every device and after every reload, which is what makes it useful for
 * finding your place in a stack of six.
 */
function avatarFor(name: string): { letter: string; bg: string; fg: string } {
  const palette = [
    { bg: '#fef3c7', fg: '#b45309' }, { bg: '#ede9fe', fg: '#6d28d9' },
    { bg: '#dcfce7', fg: '#15803d' }, { bg: '#dbeafe', fg: '#1d4ed8' },
    { bg: '#fce7f3', fg: '#be185d' }, { bg: '#ccfbf1', fg: '#0f766e' },
  ];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { letter: (name.trim()[0] ?? '?').toUpperCase(), ...palette[h % palette.length] };
}

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
  project, onChanged, onToggle, onDelete, tools,
}: {
  project: Project;
  onChanged: () => void;
  onToggle: (p: Project) => void;
  onDelete: (p: Project) => void;
  /** The settings tab's contents, which the board already owns. */
  tools: React.ReactNode;
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('workflows');
  const [flows, setFlows] = useState<ProjectWorkflow[]>([]);
  const [day, setDay] = useState<ProjectDay | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const [prompt, setPrompt] = useState('');
  const [building, setBuilding] = useState(false);
  const [answer, setAnswer] = useState('');
  const [answerBad, setAnswerBad] = useState(false);

  const live = project.status === 'running' || project.status === 'learning';
  const avatar = avatarFor(project.name);

  const read = useCallback(async () => {
    const [w, d] = await Promise.all([fetchWorkflows(project.id), fetchProjectDay(project.id)]);
    if (w.error) setError(w.error); else setError('');
    setFlows(w.workflows);
    if (d.day) setDay(d.day);
  }, [project.id]);

  useEffect(() => {
    /* Read once on mount and then on a timer. The lint rule against setState in
       an effect is about synchronising React with React; this is the other
       thing it exists for — subscribing to an external system, which is what a
       server on a five-minute cron is. */
    void read();
    /* Thirty seconds against a five-minute tick: fast enough that a card
       appears without a reload, slow enough not to ask ten times for an answer
       that cannot have changed. Stops while the tab is hidden, because several
       of these on one screen left open all day should not each hold a request
       open overnight. */
    const tick = () => { if (document.visibilityState === 'visible') void read(); };
    const t = window.setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [read]);

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

  return (
    <section style={{
      display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0, 1fr) 272px', alignItems: 'start',
    }} className="ap-project">
      {/* ── The project ── */}
      <div style={{
        background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, overflow: 'hidden', minWidth: 0,
      }}>
        {/* Identity */}
        <header style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', flexWrap: 'wrap',
          background: '#fbfbfc', borderBottom: `1px solid ${LINE}`,
        }}>
          <span style={{
            width: 42, height: 42, borderRadius: 13, flexShrink: 0,
            background: avatar.bg, color: avatar.fg,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 19, fontWeight: 800,
          }} aria-hidden>{avatar.letter}</span>

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
                  background: live ? '#dcfce7' : '#f1f5f9',
                }}>
                <span style={{
                  width: 26, height: 15, borderRadius: 999, position: 'relative', flexShrink: 0,
                  background: live ? '#16a34a' : '#cbd5e1', transition: 'background 0.15s',
                }}>
                  <span style={{
                    position: 'absolute', top: 2, left: live ? 13 : 2, width: 11, height: 11,
                    borderRadius: 999, background: '#fff', transition: 'left 0.15s',
                  }} />
                </span>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: live ? '#15803d' : MUTED }}>
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
          display: 'flex', gap: 2, padding: '0 12px', borderBottom: `1px solid ${LINE}`, overflowX: 'auto',
        }}>
          {TABS.map(({ id, label, icon: Ic }) => {
            const on = tab === id;
            return (
              <button key={id} role="tab" aria-selected={on} onClick={() => setTab(id)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 12px',
                border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 12.5, fontWeight: on ? 800 : 600, whiteSpace: 'nowrap',
                color: on ? ACCENT : MUTED,
                borderBottom: `2px solid ${on ? ACCENT : 'transparent'}`, marginBottom: -1,
              }}>
                <Ic size={12} />
                {label}
                {id === 'workflows' && flows.length > 0 && ` (${flows.length})`}
              </button>
            );
          })}
        </div>

        <div style={{ padding: 14 }}>
          {error && (
            <p style={{
              margin: '0 0 12px', padding: '10px 13px', borderRadius: 10, background: '#fdf3f3',
              border: '1px solid #f3cfcf', color: '#b42318', fontSize: 12.5,
            }}>{error}</p>
          )}

          {/* ── Workflows ── */}
          {tab === 'workflows' && (
            !flows.length ? (
              <div style={{ padding: '26px 16px', textAlign: 'center' }}>
                <span style={{
                  width: 40, height: 40, borderRadius: 13, background: '#f5f3ff', color: ACCENT,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10,
                }}><WorkflowIcon size={18} /></span>
                <h4 style={{ margin: '0 0 5px', fontSize: 14, fontWeight: 800, color: INK }}>
                  No workflows on this project yet
                </h4>
                <p style={{ margin: '0 auto', maxWidth: 420, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
                  A workflow is what happens on its own when somebody fills in this client's form, is
                  tagged, or goes quiet. Describe one in the box beside this and it will be built as a
                  draft.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {flows.map((f, i) => {
                  const isOpen = open[f.id] !== false;
                  const on = f.status === 'active';
                  return (
                    <article key={f.id} style={{
                      border: `1px solid ${LINE}`, borderRadius: 14, overflow: 'hidden',
                      background: '#fbfbfc',
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
                            background: on ? '#16a34a' : '#cbd5e1', transition: 'background 0.15s',
                          }}>
                          <span style={{
                            position: 'absolute', top: 2, left: on ? 16 : 2, width: 14, height: 14,
                            borderRadius: 999, background: '#fff', transition: 'left 0.15s',
                          }} />
                        </button>
                        <button onClick={() => void removeFlow(f)} aria-label={`Delete ${f.name}`}
                          className="press" style={{ ...ghost(), color: '#b42318', padding: '5px 8px' }}>
                          <Trash2 size={11} />
                        </button>
                      </header>

                      {isOpen && (
                        <div style={{ background: '#fff', borderTop: `1px solid ${LINE}`, padding: 12 }}>
                          <WorkflowCanvas nodes={f.nodes as unknown as AutomationNode[]} live={on && live} />
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
            <div style={{ display: 'grid', gap: 13 }}>
              <div>
                <h4 style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 800, color: INK }}>
                  What this project is allowed to do
                </h4>
                <p style={{ margin: '0 0 9px', fontSize: 11.5, color: MUTED, lineHeight: 1.55 }}>
                  Anything set to <strong>ask first</strong> waits on the card rather than happening. Anything
                  <strong> off</strong> it cannot do however it is asked.
                </p>
                <div style={{ display: 'grid', gap: 6 }}>
                  {Object.entries(project.guardrails ?? {}).map(([k, v]) => (
                    <div key={k} style={{
                      display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px',
                      border: `1px solid ${LINE}`, borderRadius: 10, background: '#fbfbfc',
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: INK, flex: 1, minWidth: 0 }}>
                        {k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}
                      </span>
                      <span style={{
                        padding: '2px 9px', borderRadius: 999, fontSize: 10, fontWeight: 800,
                        background: v === 'on' ? '#e8f6ee' : v === 'approval' ? '#fff7e6' : '#f2f3f5',
                        color: v === 'on' ? '#0f7b3d' : v === 'approval' ? '#7a4d00' : MUTED,
                      }}>
                        {v === 'on' ? 'On its own' : v === 'approval' ? 'Asks first' : 'Off'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

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
            </div>
          )}

          {/* ── Content Library: what it has actually produced ── */}
          {tab === 'library' && (
            !made.length ? (
              <p style={{ margin: 0, padding: '22px 4px', fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
                Nothing produced today. Everything this project writes — posts, pages, campaigns — appears
                here with a link to the real record, not a copy of it.
              </p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
                {made.map(a => (
                  <li key={a.id}>
                    <button onClick={() => a.link?.route && navigate(a.link.route)} style={{
                      display: 'flex', gap: 10, alignItems: 'center', width: '100%', textAlign: 'left',
                      border: `1px solid ${LINE}`, borderRadius: 11, padding: 11, background: '#fff',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: INK }}>
                          {a.link?.label || a.summary}
                        </span>
                        <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 2 }}>
                          {a.detail || a.summary}
                        </span>
                      </span>
                      <ExternalLink size={12} color={MUTED} />
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}

          {/* ── Analytics: the working day, and what went out ── */}
          {tab === 'analytics' && <ProjectFlow day={day} live={live} />}

          {/* ── Settings ── */}
          {tab === 'settings' && <div style={{ display: 'grid', gap: 12 }}>{tools}</div>}
        </div>
      </div>

      {/* ── Edit with AI, for this project ── */}
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 11, minWidth: 0 }}>
        <section style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{
              width: 30, height: 30, borderRadius: 10, background: '#f5f3ff', color: ACCENT,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}><Bot size={16} /></span>
            <h4 style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: INK }}>Edit with AI</h4>
          </div>
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 10, color: MUTED, marginTop: 3 }}>
            {prompt.length}/1000
          </div>

          <button onClick={() => void build()} disabled={building || prompt.trim().length < 8} style={{
            width: '100%', marginTop: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            gap: 6, padding: '10px 14px', borderRadius: 10, border: 'none',
            background: prompt.trim().length >= 8 ? ACCENT : '#cbd5e1', color: '#fff',
            fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
            cursor: building || prompt.trim().length < 8 ? 'default' : 'pointer',
          }}>
            {building ? <Loader size={13} className="spin" /> : <Sparkles size={13} />}
            {building ? 'Building…' : 'Update project'}
          </button>

          {answer && (
            <p style={{
              margin: '8px 0 0', fontSize: 11.5, lineHeight: 1.5,
              color: answerBad ? '#92400e' : '#0f7b3d',
            }}>{answer}</p>
          )}
          <p style={{ margin: '7px 0 0', fontSize: 10.5, color: MUTED, lineHeight: 1.5 }}>
            {/* Said before the button, not after something has happened. */}
            It arrives switched off. Nothing reaches anybody until you read it and switch it on.
          </p>
        </section>

        <section style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 14 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 800, color: INK }}>Quick prompts</h4>
          <div style={{ display: 'grid', gap: 5 }}>
            {promptsFor(project.kind).map(q => (
              <button key={q} onClick={() => { setPrompt(q); setAnswer(''); }} className="press" style={{
                display: 'flex', gap: 7, alignItems: 'flex-start', textAlign: 'left',
                padding: '7px 9px', borderRadius: 9, border: `1px solid ${LINE}`,
                background: '#fbfbfc', fontSize: 11, color: INK, cursor: 'pointer',
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
          background: '#f8f7ff', border: '1px solid #e4defc', borderRadius: 16, padding: 13,
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
    </section>
  );
}

function ghost(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px',
    borderRadius: 999, border: `1px solid ${LINE}`, background: '#fff',
    fontSize: 11.5, fontWeight: 700, color: INK, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
  };
}

export { Pause, Play };
