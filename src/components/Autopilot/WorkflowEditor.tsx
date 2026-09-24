/**
 * Editing a workflow, step by step.
 *
 * ── Why this exists rather than a link to the Marketing builder ──
 *
 * A project's workflows are the project's. Sending somebody to a different
 * module to change one would mean editing a *different list* — the two are
 * separate tables on purpose — so the edit would either go nowhere or, worse,
 * land on somebody else's rule.
 *
 * ── What "fully editable" has to mean ──
 *
 * Every field the engine reads. A step whose subject line cannot be changed is
 * a step somebody has to delete and rebuild, and a condition whose branches
 * cannot be pointed anywhere is a branch that always ends the workflow. So the
 * form for each type is generated from the same table the engine reads, which
 * is what stops the two drifting: add a field the engine understands and it
 * appears here.
 *
 * ── What it deliberately refuses ──
 *
 * Saving a graph that cannot run. A workflow with no trigger never starts; one
 * whose first step is a send with no subject sends a blank email to a real
 * person. Both are caught here and named, because the alternative is finding
 * out from the delivery log.
 *
 * ── The shape: a list, and a panel for the selected step ──
 *
 * The steps run down the left and the one being edited opens on the right,
 * under **Setup → Configure → Test**. Three named stages rather than one long
 * form because they answer three different questions — what kind of step is
 * this, what should it say, and what would it actually do — and somebody
 * building a workflow asks them in that order and goes back to the middle one
 * a dozen times.
 *
 * **Test is a dry run, and says so.** A Test button that really sends puts a
 * real email in a real inbox every time it is pressed while building, and it
 * gets pressed a lot. It renders what would be sent, to a stand-in person, and
 * names anything that would stop it — while being honest that it cannot know
 * whether a mail server will accept the message.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Trash2, ArrowUp, ArrowDown, X, Check, Loader, AlertTriangle, GitBranch,
  Play, Settings2, Sliders, ChevronRight,
} from 'lucide-react';
import {
  insertAfter, lookFor, nodeDetail, patchStep, previewStep,
  problemsWith, removeStep, swapWithNext, swapWithPrev,
} from './workflowNodes';
import {
  runAgent, saveWorkflow,
  type AgentRunResult, type ProjectWorkflow, type WorkflowNode,
} from '../../services/autopilot';
import { T, nodeDark } from './theme';
import StepSettings, {
  ADDABLE, DEFAULTS, applyConfig, newId, type Stage,
} from './StepSettings';
import { renderGuided } from './GuidedFields';
import { StepContext } from './EmailStepEditor';

const INK = T.ink;
const MUTED = T.muted;
const LINE = T.line;
const ACCENT = T.accent;


export default function WorkflowEditor({
  projectId, workflow, focusStep, onClose, onSaved,
}: {
  projectId: string;
  /** Null for a new one. */
  workflow: ProjectWorkflow | null;
  /**
   * The step to open on, when somebody clicked one on the canvas rather than
   * pressing Edit. Read once, as the initial selection, rather than watched:
   * after the editor is open the selection is the customer's, and a prop that
   * kept reasserting itself would drag them back to where they came in.
   */
  focusStep?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(workflow?.name ?? '');
  const [description, setDescription] = useState(workflow?.description ?? '');
  const [nodes, setNodes] = useState<WorkflowNode[]>(() =>
    workflow?.nodes?.length
      ? workflow.nodes.map(n => ({ ...n, config: { ...n.config } }))
      /* A new one starts with the step every workflow must have, so nobody is
         looking at a blank canvas wondering what a trigger is. */
      : [{ id: newId(), type: 'trigger', label: 'A form is submitted', config: { event: 'form_submitted' }, nextId: null }]);

  /* Empty means "whichever is first". Derived below rather than synced in an
     effect: an effect would set state during the first render pass, and the
     fallback is a one-line read that cannot get out of step with the list. */
  const [picked, setPicked] = useState<string>(focusStep ?? '');
  const [stage, setStage] = useState<Stage>('configure');
  const [addingAfter, setAddingAfter] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState<AgentRunResult | null>(null);

  /* The first step stands in until somebody picks another, so the panel is
     never an empty frame asking for a click before it will say anything. */
  const selected = nodes.some(n => n.id === picked) ? picked : (nodes[0]?.id ?? '');
  const setSelected = setPicked;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /**
   * Change one step's own fields.
   *
   * ── Why there is no longer a "relink" here ──
   *
   * This used to rebuild every link from the order of the list after any
   * edit, renaming included. Correct for a straight line; destructive for a
   * fork, because a condition's Yes was re-pointed at whatever sat next in the
   * list — usually the first step of its own No branch. Renaming a step in
   * "Speed to Lead" therefore sent the chase email to the people who had
   * replied. The graph operations in `workflowNodes.ts` change only the links
   * an edit actually touches, and a rename touches none.
   *
   * The one link a person sets here directly is a condition's No, which is
   * theirs to point, and is written as chosen.
   */
  const setStep = (id: string, patch: Partial<WorkflowNode>) =>
    setNodes(list => ('noId' in patch
      ? list.map(n => (n.id === id ? { ...n, noId: patch.noId ?? null } : n))
      : patchStep(list, id, patch)));

  /* One setting on one step. The rule for what that implies — a trigger renamed
     when its event changes — lives in `applyConfig`, shared with the pen panel. */
  const setConfig = (id: string, key: string, value: string) =>
    setNodes(list => list.map(n => (n.id === id ? applyConfig(n, key, value) : n)));

  /**
   * Run one agent step against the saved workflow.
   *
   * Against the *saved* one, deliberately: the server can only run what it has
   * stored, so an unsaved edit would be run as it was before the edit and the
   * result would be quietly about a different step. The button is disabled
   * until there is something to run rather than explaining that afterwards.
   */
  async function runNow(nodeId: string) {
    if (!workflow?.id) return;
    setRunning(true);
    setRan(null);
    const r = await runAgent(projectId, workflow.id, nodeId);
    setRan(r);
    setRunning(false);
    /* The list on the left shows what each workflow has produced; a run that
       made something has changed that. */
    if (r.ok) onSaved();
  }

  function addAt(type: string, after: string | null) {
    const look = lookFor(type);
    const node: WorkflowNode = {
      id: newId(), type, label: look.label, config: { ...(DEFAULTS[type] ?? {}) }, nextId: null,
    };
    /* On the same path as the step it follows, taking over where that step
       was going — never re-deriving anybody else's links. */
    setNodes(list => insertAfter(list, after ?? list[list.length - 1]?.id ?? '', node));
    setSelected(node.id);
    setStage('configure');
    setAddingAfter(null);
  }

  function move(id: string, by: -1 | 1) {
    /* Along the path, not along the list: a step moves past its neighbour on
       the route a person takes. It will not move past a condition, because
       that would carry the condition's No branch to a different point in the
       story without anybody deciding that. */
    setNodes(list => (by < 0 ? swapWithPrev(list, id) : swapWithNext(list, id)));
  }

  function remove(id: string) {
    setNodes(list => {
      const next = removeStep(list, id);
      if (selected === id) setSelected(next[0]?.id ?? '');
      return next;
    });
  }

  const problems = problemsWith(name, nodes);
  const current = nodes.find(n => n.id === selected) ?? null;

  async function save() {
    if (problems.length || saving) return;
    setSaving(true);
    const r = await saveWorkflow(projectId, {
      id: workflow?.id,
      name: name.trim(),
      description: description.trim(),
      /* An edit never switches it on. Somebody fixing a typo in a live workflow
         keeps it live; somebody finishing a draft still presses the switch,
         because that is the press that reaches real people. */
      status: workflow?.status ?? 'draft',
      nodes,
    });
    setSaving(false);
    if (!r.success) { setError(String(r.error ?? 'That could not be saved.')); return; }
    onSaved();
    onClose();
  }

  return (
    <div
      /* No `data-noinvert`: the editor themes with the app, like the board
         behind it. It carried one while this screen was authored dark. */
      role="dialog"
      aria-modal="true"
      aria-label={workflow ? `Edit ${workflow.name}` : 'New workflow'}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(4,7,16,0.66)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(8px, 3vw, 28px)',
        backdropFilter: 'blur(3px)',
      }}>
      <div style={{
        background: T.panel, borderRadius: 20, width: 'min(1040px, 100%)', maxHeight: '94vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        border: `1px solid ${LINE}`, boxShadow: '0 24px 70px -12px rgba(0,0,0,0.6)',
      }}>
        {/* ── The workflow itself ── */}
        <header style={{
          display: 'flex', alignItems: 'center', gap: 11, padding: '13px 16px',
          borderBottom: `1px solid ${LINE}`, flexShrink: 0, flexWrap: 'wrap',
        }}>
          <input value={name} onChange={e => setName(e.target.value)}
            aria-label="Workflow name"
            placeholder="Name this workflow"
            style={{
              ...inp, width: 'auto', flex: '1 1 220px', fontSize: 14, fontWeight: 800,
              background: 'transparent', border: `1px solid transparent`, padding: '6px 8px',
            }} />
          <input value={description} onChange={e => setDescription(e.target.value)}
            aria-label="What this workflow is for"
            placeholder="What it is for"
            style={{
              ...inp, width: 'auto', flex: '1 1 200px', fontSize: 12, color: MUTED,
              background: 'transparent', border: `1px solid transparent`, padding: '6px 8px',
            }} />
          <button onClick={onClose} aria-label="Close" style={{
            border: 'none', background: 'none', padding: 4, cursor: 'pointer', color: MUTED, display: 'flex',
          }}><X size={17} /></button>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', flex: 1, minHeight: 0 }}
          className="ap-editor">
          {/* ── The steps, top to bottom ── */}
          <div style={{ overflowY: 'auto', padding: 16, borderRight: `1px solid ${LINE}` }}>
            <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {nodes.map((n, i) => {
                const look = lookFor(n.type);
                const tone = nodeDark(n.type);
                const Ic = look.icon;
                const on = selected === n.id;
                const p = previewStep(n);
                return (
                  <li key={n.id}>
                    <div style={{ display: 'flex', alignItems: 'stretch', gap: 9 }}>
                      <span style={{
                        width: 22, flexShrink: 0, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', paddingTop: 13, fontSize: 10.5, fontWeight: 800, color: MUTED,
                      }}>{i + 1}</span>

                      <button onClick={() => { setSelected(n.id); setStage('configure'); }}
                        aria-pressed={on}
                        style={{
                          flex: 1, minWidth: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px',
                          borderRadius: 12, background: on ? T.raised : 'transparent',
                          border: `1px solid ${on ? tone.edge : LINE}`,
                        }}>
                        <span style={{
                          width: 24, height: 24, borderRadius: 7, background: tone.bg, color: tone.fg,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}><Ic size={12} /></span>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{
                            display: 'block', fontSize: 12.5, fontWeight: 700, color: INK,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{n.label || look.label}</span>
                          {/* What it is *set to*, not what type it is. The type
                              is already the icon, and the label above is the
                              customer's own words — which go stale the moment
                              they change the step and do not rename it. A
                              trigger switched to a schedule would otherwise
                              still read "A form is submitted" in both lines. */}
                          <span style={{
                            display: 'block', fontSize: 10.5, color: MUTED, marginTop: 1,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {/* The type, when the detail would only repeat the
                                name above it — which it does whenever the step
                                is still called what it does. */}
                            {(nodeDetail(n.type, n.config) || look.label) === (n.label || look.label)
                              ? look.label
                              : (nodeDetail(n.type, n.config) || look.label)}
                          </span>
                        </span>
                        {/* A step that cannot run is marked in the list, not
                            only inside the panel — otherwise the one broken
                            step in nine is found by opening all nine. */}
                        {p.blocked && <AlertTriangle size={12} color={T.warn} style={{ flexShrink: 0 }} />}
                      </button>

                      {i > 0 && (
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'center', flexShrink: 0 }}>
                          <button onClick={() => move(n.id, -1)} aria-label={`Move ${n.label} up`}
                            disabled={i <= 1} style={{ ...iconBtn, opacity: i <= 1 ? 0.3 : 1 }}>
                            <ArrowUp size={10} />
                          </button>
                          <button onClick={() => move(n.id, 1)} aria-label={`Move ${n.label} down`}
                            disabled={i >= nodes.length - 1} style={{ ...iconBtn, opacity: i >= nodes.length - 1 ? 0.3 : 1 }}>
                            <ArrowDown size={10} />
                          </button>
                        </span>
                      )}
                    </div>

                    {/* The + between steps, which is how a step gets inserted
                        in the middle rather than only at the end. */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '2px 0' }}>
                      <span style={{ width: 22, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                        <span aria-hidden style={{ width: 1, height: 14, background: LINE }} />
                      </span>
                      <button onClick={() => setAddingAfter(addingAfter === n.id ? null : n.id)}
                        aria-label={`Add a step after ${n.label}`}
                        style={{
                          width: 20, height: 20, borderRadius: 999, padding: 0, cursor: 'pointer',
                          border: `1px dashed ${LINE}`, background: T.panel, color: MUTED,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        }}><Plus size={11} /></button>
                    </div>

                    {addingAfter === n.id && (
                      <div style={{
                        margin: '4px 0 8px 31px', display: 'grid', gap: 5,
                        gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                      }}>
                        {ADDABLE.map(t => {
                          const l = lookFor(t);
                          const tn = nodeDark(t);
                          const I2 = l.icon;
                          return (
                            <button key={t} onClick={() => addAt(t, n.id)} className="press" style={{
                              display: 'flex', alignItems: 'center', gap: 7, padding: '8px 10px',
                              border: `1px solid ${tn.edge}`, borderRadius: 10, background: T.raised,
                              cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                            }}>
                              <span style={{
                                width: 18, height: 18, borderRadius: 5, background: tn.bg, color: tn.fg,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                              }}><I2 size={9} /></span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: INK }}>{l.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>

            {problems.length > 0 && (
              <div style={{
                marginTop: 10, padding: '11px 13px', borderRadius: 11,
                background: T.warnSoft, border: `1px solid ${T.warn}55`,
              }}>
                <p style={{ margin: '0 0 5px', fontSize: 12, fontWeight: 800, color: T.warn, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={12} /> Not ready to save
                </p>
                <ul style={{ margin: 0, paddingLeft: 17, fontSize: 11.5, color: T.warn, lineHeight: 1.6 }}>
                  {problems.map(p => <li key={p}>{p}</li>)}
                </ul>
              </div>
            )}
          </div>

          {/* ── Setup → Configure → Test, for the selected step ── */}
          <aside style={{ overflowY: 'auto', background: T.aside, minWidth: 0 }}>
            {/* One step's settings, shared with the pen panel on the canvas so the
                two cannot disagree about what a step takes. */}
            <StepContext.Provider value={{ projectId, workflowName: name, workflowPurpose: workflow?.description }}>
            <StepSettings
              node={current}
              nodes={nodes}
              stage={stage}
              onStage={setStage}
              onPatch={setStep}
              onConfig={setConfig}
              onDelete={remove}
              onRun={id => void runNow(id)}
              running={running}
              ran={ran}
              canRun={!!workflow?.id}
              renderField={renderGuided}
              onGraph={fn => setNodes(fn)}
            />
            </StepContext.Provider>
          </aside>
        </div>

        <footer style={{
          display: 'flex', gap: 9, padding: '12px 16px', borderTop: `1px solid ${LINE}`,
          flexShrink: 0, alignItems: 'center', flexWrap: 'wrap',
        }}>
          {error && (
            <span style={{ fontSize: 12, color: T.bad, flex: '1 1 200px' }}>{error}</span>
          )}
          {!error && (
            <span style={{ fontSize: 11, color: MUTED, flex: 1, minWidth: 140 }}>
              Saving does not switch it on.
            </span>
          )}
          <button onClick={onClose} style={{
            padding: '10px 16px', borderRadius: 10, border: `1px solid ${LINE}`,
            background: T.raised, color: INK, fontSize: 12.5, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancel</button>
          <button onClick={() => void save()} disabled={!!problems.length || saving} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px',
            borderRadius: 10, border: 'none',
            background: problems.length ? T.line : ACCENT, color: '#fff',
            fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
            cursor: problems.length || saving ? 'default' : 'pointer',
          }}>
            {saving ? <Loader size={13} className="spin" /> : <Check size={13} />} Save workflow
          </button>
        </footer>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 4,
};

const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9,
  border: `1px solid ${LINE}`, fontSize: 12.5, outline: 'none', fontFamily: 'inherit',
  background: T.raised, color: T.ink,
};

const iconBtn: React.CSSProperties = {
  width: 22, height: 22, borderRadius: 7, border: `1px solid ${LINE}`, background: T.raised,
  color: T.muted, cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
  justifyContent: 'center', flexShrink: 0, padding: 0,
};
