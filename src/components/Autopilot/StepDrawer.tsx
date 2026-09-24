/**
 * One step, edited where it is.
 *
 * ── Why this exists ──
 *
 * Changing one subject line used to mean opening the whole workflow in a
 * full-screen editor, finding the step again in a list, changing it, and
 * saving everything. Three screens for one field. The pen on each step now
 * opens this: that step's settings, beside the diagram, saving that step.
 *
 * It is the same settings panel the full editor uses — `StepSettings` — so the
 * two cannot disagree about what a step takes. The full editor is still there
 * for the things that are about the whole graph: reordering, renaming the
 * workflow.
 *
 * ── Guided ──
 *
 * Somebody opening a step is asked three things in order — what it is called,
 * what it should do, and what it would actually do — with a tick on each as it
 * is answered, and arrows to walk to the step before or after without closing
 * anything. The ticks are real: Configure is ticked when nothing blocks the
 * step, not when somebody has clicked past it.
 *
 * ── What saving refuses ──
 *
 * An edit that *introduces* a problem — an email left with no subject, a
 * condition with nothing to test — is refused and named, because the
 * alternative is finding out from the delivery log. A problem that was already
 * there before this edit, on some other step, is shown but does not block:
 * refusing to save a subject line because of a feed address three steps away
 * would make the pen useless on exactly the workflows that most need fixing.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Check, Loader, ChevronLeft, ChevronRight, Plus, Trash2, AlertTriangle, Maximize2,
} from 'lucide-react';
import StepSettings, { ADDABLE, DEFAULTS, applyConfig, newId, type Stage } from './StepSettings';
import { renderGuided } from './GuidedFields';
import {
  insertAfter, layout, lookFor, patchStep, previewStep, problemsWith, removeStep,
} from './workflowNodes';
import {
  runAgent, saveWorkflow,
  type AgentRunResult, type ProjectWorkflow, type WorkflowNode,
} from '../../services/autopilot';
import { T, ghostBtn, nodeTone, primaryBtn } from './theme';

export default function StepDrawer({
  projectId, workflow, stepId, onClose, onSaved, onOpenFull,
}: {
  projectId: string;
  workflow: ProjectWorkflow;
  stepId: string;
  onClose: () => void;
  onSaved: () => void;
  /** Opens the whole-workflow editor, for the things that are about the graph. */
  onOpenFull: () => void;
}) {
  const [nodes, setNodes] = useState<WorkflowNode[]>(() =>
    workflow.nodes.map(n => ({ ...n, config: { ...n.config } })));
  const [picked, setPicked] = useState(stepId);
  const [stage, setStage] = useState<Stage>('configure');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState<AgentRunResult | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* The steps in the order somebody reads them — the diagram's order, spine
     first — so the arrows walk the workflow rather than the storage array. */
  const order = useMemo(() => layout(nodes).placed
    .slice().sort((a, b) => a.row - b.row || a.column - b.column)
    .map(p => p.node.id), [nodes]);

  const current = nodes.find(n => n.id === picked) ?? nodes[0] ?? null;
  const pos = current ? order.indexOf(current.id) : -1;
  const dirty = JSON.stringify(nodes) !== JSON.stringify(workflow.nodes);

  /* What was already wrong before this edit, and what this edit added. */
  const before = useMemo(() => new Set(problemsWith(workflow.name, workflow.nodes)), [workflow]);
  const now = problemsWith(workflow.name, nodes);
  const introduced = now.filter(p => !before.has(p));
  const standing = now.filter(p => before.has(p));

  const onPatch = (id: string, patch: Partial<WorkflowNode>) =>
    setNodes(list => ('noId' in patch
      ? list.map(n => (n.id === id ? { ...n, noId: patch.noId ?? null } : n))
      : patchStep(list, id, patch)));
  const onConfig = (id: string, key: string, value: string) =>
    setNodes(list => list.map(n => (n.id === id ? applyConfig(n, key, value) : n)));

  async function persist(next: WorkflowNode[]): Promise<boolean> {
    setSaving(true);
    setError('');
    const r = await saveWorkflow(projectId, {
      id: workflow.id, name: workflow.name, description: workflow.description,
      /* Kept as it was. Editing a step of a live workflow must not switch it
         off, and editing a draft must not switch it on. */
      status: workflow.status, nodes: next,
    });
    setSaving(false);
    if (!r.success) { setError(String(r.error ?? 'That could not be saved.')); return false; }
    onSaved();
    return true;
  }

  async function save() {
    if (introduced.length || saving) return;
    if (await persist(nodes)) onClose();
  }

  async function del() {
    if (!current || current.type === 'trigger') return;
    const name = current.label || lookFor(current.type).label;
    if (!window.confirm(`Delete "${name}"? Whatever came before it will go straight to whatever came after.`)) return;
    const next = removeStep(nodes, current.id);
    setNodes(next);
    if (await persist(next)) onClose();
  }

  function add(type: string) {
    if (!current) return;
    const step: WorkflowNode = {
      id: newId(), type, label: lookFor(type).label, config: { ...(DEFAULTS[type] ?? {}) }, nextId: null,
    };
    setNodes(list => insertAfter(list, current.id, step));
    setPicked(step.id);
    setStage('configure');
    setAdding(false);
  }

  async function run(id: string) {
    setRunning(true);
    setRan(null);
    const r = await runAgent(projectId, workflow.id, id);
    setRan(r);
    setRunning(false);
    if (r.ok) onSaved();
  }

  const tone = current ? nodeTone(current.type) : null;
  const look = current ? lookFor(current.type) : null;
  const Ic = look?.icon;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={current ? `Edit step: ${current.label || look?.label}` : 'Edit step'}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      /* Above the app's top bar (100) and its menus (300), the same level as
         the full editor. Below it, the bar covered this panel's header — the
         line that says which step is open — and stayed clickable behind the
         scrim. */
      style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(15,17,23,0.32)' }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        className="ap-drawer-in"
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(460px, 100vw)',
          background: '#fff', display: 'flex', flexDirection: 'column', outline: 'none',
          boxShadow: '-18px 0 50px -20px rgba(16,24,40,0.35)',
        }}
      >
        {/* ── Which step, and where it sits ── */}
        <header style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${T.line}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.muted, flex: 1, minWidth: 0 }}>
              {workflow.name}
            </span>
            <button onClick={onClose} aria-label="Close" style={{
              border: 'none', background: 'none', padding: 4, cursor: 'pointer', color: T.muted, display: 'flex',
            }}><X size={17} /></button>
          </div>

          {current && tone && Ic && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
              <span style={{
                width: 32, height: 32, borderRadius: 10, background: tone.bg, color: tone.fg,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}><Ic size={15} /></span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: T.ink, lineHeight: 1.25 }}>
                  {current.label || look?.label}
                </span>
                <span style={{ display: 'block', fontSize: 11, color: T.muted, marginTop: 1 }}>
                  {look?.label} · step {pos + 1} of {order.length}
                </span>
              </span>
              {/* Walk the workflow without closing anything. */}
              <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button onClick={() => pos > 0 && setPicked(order[pos - 1])} disabled={pos <= 0}
                  aria-label="Previous step" style={{ ...ghostBtn, padding: 6, opacity: pos <= 0 ? 0.4 : 1 }}>
                  <ChevronLeft size={13} />
                </button>
                <button onClick={() => pos < order.length - 1 && setPicked(order[pos + 1])}
                  disabled={pos >= order.length - 1} aria-label="Next step"
                  style={{ ...ghostBtn, padding: 6, opacity: pos >= order.length - 1 ? 0.4 : 1 }}>
                  <ChevronRight size={13} />
                </button>
              </span>
            </div>
          )}

          {/* What this step does, in one line, before any field is touched. */}
          {current && (
            <p style={{
              margin: '10px 0 0', padding: '8px 10px', borderRadius: 10, fontSize: 11.5, lineHeight: 1.5,
              background: T.accentSoft, color: T.ink,
            }}>{previewStep(current).headline}</p>
          )}
        </header>

        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, background: T.aside }}>
          <StepSettings
            node={current}
            nodes={nodes}
            stage={stage}
            onStage={setStage}
            onPatch={onPatch}
            onConfig={onConfig}
            onRun={id => void run(id)}
            running={running}
            ran={ran}
            /* A step added in this panel is not on the server until saved, so
               it cannot be run yet; one that was already there can. */
            canRun={!dirty && workflow.nodes.some(n => n.id === current?.id)}
            renderField={renderGuided}
              onGraph={fn => setNodes(fn)}
          />

          {/* ── The graph-level things one step can still do ── */}
          {current && (
            <div style={{ padding: '4px 15px 16px', display: 'grid', gap: 9 }}>
              {adding ? (
                <div style={{
                  border: `1px solid ${T.line}`, borderRadius: 12, padding: 10, background: '#fff',
                }}>
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 800, color: T.muted, marginBottom: 7 }}>
                    ADD A STEP AFTER THIS ONE
                  </span>
                  <div style={{ display: 'grid', gap: 5, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                    {ADDABLE.map(t => {
                      const L = lookFor(t);
                      const I2 = L.icon;
                      const tn = nodeTone(t);
                      return (
                        <button key={t} onClick={() => add(t)} className="press" style={{
                          display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px',
                          borderRadius: 9, border: `1px solid ${tn.edge}`, background: tn.bg,
                          color: tn.fg, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                          fontFamily: 'inherit', textAlign: 'left',
                        }}><I2 size={12} /> {L.label}</button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <button onClick={() => setAdding(true)} style={{ ...ghostBtn, justifySelf: 'start', borderRadius: 10 }}>
                  <Plus size={12} /> Add a step after this one
                </button>
              )}

              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                <button onClick={onOpenFull} style={{ ...ghostBtn, borderRadius: 10 }}>
                  <Maximize2 size={11} /> Open the whole workflow
                </button>
                {current.type !== 'trigger' && (
                  <button onClick={() => void del()} disabled={saving} style={{
                    ...ghostBtn, borderRadius: 10, color: T.bad, borderColor: `${T.bad}44`, background: T.badSoft,
                  }}><Trash2 size={11} /> Delete this step</button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Saving ── */}
        <footer style={{
          padding: '12px 16px', borderTop: `1px solid ${T.line}`, flexShrink: 0, display: 'grid', gap: 8,
        }}>
          {introduced.length > 0 && (
            <div style={{
              padding: '9px 11px', borderRadius: 10, background: T.warnSoft,
              border: `1px solid ${T.warn}44`, color: T.warn, fontSize: 11.5, lineHeight: 1.5,
            }}>
              <strong style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <AlertTriangle size={12} /> Not ready to save
              </strong>
              {introduced.map(p => <div key={p}>{p}</div>)}
            </div>
          )}
          {!introduced.length && standing.length > 0 && (
            <p style={{ margin: 0, fontSize: 10.5, color: T.muted, lineHeight: 1.5 }}>
              Elsewhere in this workflow: {standing[0]}{standing.length > 1 ? ` (and ${standing.length - 1} more)` : ''}
            </p>
          )}
          {error && <p style={{ margin: 0, fontSize: 11.5, color: T.bad }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ flex: 1, fontSize: 10.5, color: T.muted, lineHeight: 1.45 }}>
              {workflow.status === 'active'
                ? 'This workflow is live. Saving changes it for everybody from their next step.'
                : 'Saving does not switch it on.'}
            </span>
            <button onClick={onClose} style={ghostBtn}>Cancel</button>
            <button onClick={() => void save()} disabled={!dirty || !!introduced.length || saving}
              className={dirty && !introduced.length ? 'press ap-btn' : 'press'}
              style={{
                ...primaryBtn,
                opacity: !dirty || introduced.length ? 0.55 : 1,
                cursor: !dirty || introduced.length || saving ? 'default' : 'pointer',
              }}>
              {saving ? <><Loader size={12} className="spin" /> Saving…</> : <><Check size={12} /> Save step</>}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
