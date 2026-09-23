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
import {
  Plus, Trash2, ArrowUp, ArrowDown, X, Check, Loader, AlertTriangle, GitBranch,
  Play, Settings2, Sliders, ChevronRight,
} from 'lucide-react';
import { lookFor, previewStep, problemsWith, SAMPLE_CONTACT } from './workflowNodes';
import { saveWorkflow, type ProjectWorkflow, type WorkflowNode } from '../../services/autopilot';
import { T, nodeDark } from './theme';

const INK = T.ink;
const MUTED = T.muted;
const LINE = T.line;
const ACCENT = T.accent;

/**
 * Every step somebody can add, and every field it takes.
 *
 * One table, read by the picker and by the form. The engine reads the same
 * config keys — `worker/src/lib/automationEngine.ts` — so a field named here is
 * a field that actually does something, and a field the engine reads and this
 * omits is a field somebody cannot set. Both are the sort of thing that only
 * shows up in production, which is why they are in one place.
 */
interface FieldDef {
  key: string;
  label: string;
  hint?: string;
  kind?: 'text' | 'textarea' | 'number' | 'select';
  options?: { value: string; label: string }[];
  placeholder?: string;
}

const STEP_FIELDS: Record<string, FieldDef[]> = {
  trigger: [
    {
      key: 'event', label: 'What starts it', kind: 'select',
      options: [
        { value: 'form_submitted', label: 'A form is submitted' },
        { value: 'contact_created', label: 'A contact is created' },
        { value: 'tag_added', label: 'A tag is added' },
        { value: 'deal_stage_changed', label: 'A deal changes stage' },
        { value: 'appointment_scheduled', label: 'An appointment is booked' },
        { value: 'email_opened', label: 'An email is opened' },
        { value: 'link_clicked', label: 'A link is clicked' },
      ],
    },
    { key: 'formName', label: 'Only this form', hint: 'Leave blank for any form.', placeholder: 'Get a quote' },
    { key: 'tag', label: 'Only this tag or stage', hint: 'Leave blank for any.', placeholder: 'enquiry' },
  ],
  wait: [
    { key: 'days', label: 'Days', kind: 'number', placeholder: '0' },
    { key: 'hours', label: 'Hours', kind: 'number', placeholder: '0' },
    { key: 'minutes', label: 'Minutes', kind: 'number', placeholder: '0' },
  ],
  condition: [
    {
      key: 'field', label: 'Look at', kind: 'select',
      options: [
        { value: 'tag', label: 'A tag on the contact' },
        { value: 'status', label: 'Their status' },
        { value: 'email', label: 'Their email address' },
        { value: 'phone', label: 'Their phone number' },
        { value: 'company', label: 'Their company' },
        { value: 'name', label: 'Their name' },
      ],
    },
    {
      key: 'operator', label: 'Test', kind: 'select',
      options: [
        { value: 'equals', label: 'is exactly' },
        { value: 'not_equals', label: 'is not' },
        { value: 'contains', label: 'contains' },
        { value: 'is_set', label: 'is filled in' },
        { value: 'is_empty', label: 'is empty' },
      ],
    },
    { key: 'value', label: 'Value', hint: 'Not needed for "is filled in" or "is empty".', placeholder: 'customer' },
  ],
  send_email: [
    { key: 'subject', label: 'Subject', placeholder: 'Thanks for getting in touch, {{firstName}}' },
    {
      key: 'body', label: 'Message', kind: 'textarea',
      hint: '{{firstName}}, {{name}}, {{company}} and {{email}} are filled in for each person.',
      placeholder: 'Hello {{firstName}},\n\nI have your enquiry and will come back to you shortly.',
    },
  ],
  send_sms: [
    {
      key: 'message', label: 'Text', kind: 'textarea',
      hint: 'Plain text only — a text is not an email. Keep it under about 160 characters.',
      placeholder: 'Hi {{firstName}}, just checking you got my email.',
    },
  ],
  add_tag: [{ key: 'tag', label: 'Tag to add', placeholder: 'enquiry' }],
  remove_tag: [{ key: 'tag', label: 'Tag to remove', placeholder: 'enquiry' }],
  create_task: [{ key: 'title', label: 'What to do', placeholder: 'Call this enquiry back' }],
  assign_to: [{ key: 'user', label: 'Who to assign it to', placeholder: 'sam@yourbusiness.com' }],
  update_field: [
    { key: 'field', label: 'Field', placeholder: 'status' },
    { key: 'value', label: 'Set it to', placeholder: 'customer' },
  ],
  end: [],
};

/** What a customer can add. `trigger` is not here: a workflow has exactly one
 *  and it is the first step, which the editor keeps true rather than policing. */
const ADDABLE = ['send_email', 'send_sms', 'wait', 'condition', 'add_tag', 'remove_tag', 'create_task', 'assign_to', 'update_field'];

const newId = () => `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;


/** The three stages of setting one step up, in the order somebody asks them. */
type Stage = 'setup' | 'configure' | 'test';

const STAGES: { id: Stage; label: string; icon: typeof Play }[] = [
  { id: 'setup', label: 'Setup', icon: Settings2 },
  { id: 'configure', label: 'Configure', icon: Sliders },
  { id: 'test', label: 'Test', icon: Play },
];

export default function WorkflowEditor({
  projectId, workflow, onClose, onSaved,
}: {
  projectId: string;
  /** Null for a new one. */
  workflow: ProjectWorkflow | null;
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
  const [picked, setPicked] = useState<string>('');
  const [stage, setStage] = useState<Stage>('configure');
  const [addingAfter, setAddingAfter] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
   * Re-link the chain after any change to the order.
   *
   * Every step points at the next in the list, and a condition keeps Yes on the
   * next step while No is the customer's to point somewhere. Doing it in one
   * place after each edit is what stops a reorder leaving a step pointing at
   * where it used to be — which reads as a workflow that skips a step for no
   * reason at all.
   */
  const relink = (list: WorkflowNode[]): WorkflowNode[] =>
    list.map((n, i) => {
      const next = i < list.length - 1 ? list[i + 1].id : null;
      if (n.type === 'condition') {
        return {
          ...n, nextId: null, yesId: next,
          /* A No pointing at a deleted step is worse than one pointing nowhere:
             the engine looks it up, fails, and ends the run reporting that the
             step was removed. */
          noId: n.noId && list.some(x => x.id === n.noId) ? n.noId : null,
        };
      }
      return { ...n, nextId: next };
    });

  const setStep = (id: string, patch: Partial<WorkflowNode>) =>
    setNodes(list => relink(list.map(n => (n.id === id ? { ...n, ...patch } : n))));

  const setConfig = (id: string, key: string, value: string) =>
    setNodes(list => list.map(n => (n.id === id ? { ...n, config: { ...n.config, [key]: value } } : n)));

  function addAt(type: string, after: string | null) {
    const look = lookFor(type);
    const node: WorkflowNode = { id: newId(), type, label: look.label, config: {}, nextId: null };
    setNodes(list => {
      const at = after ? list.findIndex(n => n.id === after) + 1 : list.length;
      const next = [...list];
      next.splice(at, 0, node);
      return relink(next);
    });
    setSelected(node.id);
    setStage('configure');
    setAddingAfter(null);
  }

  function move(id: string, by: -1 | 1) {
    setNodes(list => {
      const i = list.findIndex(n => n.id === id);
      const j = i + by;
      /* The trigger stays first. Moving it is not an edit, it is a workflow
         with no way in. */
      if (i < 1 || j < 1 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return relink(next);
    });
  }

  function remove(id: string) {
    setNodes(list => {
      const next = relink(list.filter(n => n.id !== id));
      if (selected === id) setSelected(next[0]?.id ?? '');
      return next;
    });
  }

  const problems = problemsWith(name, nodes);
  const current = nodes.find(n => n.id === selected) ?? null;
  const preview = useMemo(() => (current ? previewStep(current) : null), [current]);
  const fields = current ? (STEP_FIELDS[current.type] ?? []) : [];

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
      data-noinvert
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
                          <span style={{ display: 'block', fontSize: 10.5, color: MUTED, marginTop: 1 }}>
                            {look.label}
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
            {!current ? (
              <p style={{ padding: 18, margin: 0, fontSize: 12, color: MUTED }}>
                Choose a step on the left to set it up.
              </p>
            ) : (
              <>
                <div style={{
                  display: 'flex', gap: 2, padding: '0 12px', borderBottom: `1px solid ${LINE}`,
                  position: 'sticky', top: 0, background: T.aside, zIndex: 1,
                }} role="tablist" aria-label="Step setup">
                  {STAGES.map(({ id, label, icon: SIc }, idx) => {
                    const on = stage === id;
                    /* Setup is done the moment a step exists — it has a type.
                       Configure is done when nothing blocks it. The ticks are
                       real state, not a wizard pretending to have stages. */
                    const done = id === 'setup' ? true : id === 'configure' ? !preview?.blocked : false;
                    return (
                      <span key={id} style={{ display: 'inline-flex', alignItems: 'center' }}>
                        {idx > 0 && <ChevronRight size={11} color={T.faint} />}
                        <button role="tab" aria-selected={on} onClick={() => setStage(id)} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '10px 10px',
                          border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          fontSize: 12, fontWeight: on ? 800 : 600,
                          color: on ? '#a9bbff' : MUTED,
                          borderBottom: `2px solid ${on ? ACCENT : 'transparent'}`, marginBottom: -1,
                        }}>
                          <SIc size={11} /> {label}
                          {done && <Check size={10} color={T.good} />}
                        </button>
                      </span>
                    );
                  })}
                </div>

                <div style={{ padding: 15, display: 'grid', gap: 12 }}>
                  {stage === 'setup' && (
                    <>
                      <div>
                        <span style={lbl}>This step is</span>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px',
                          border: `1px solid ${nodeDark(current.type).edge}`, borderRadius: 11,
                          background: T.raised,
                        }}>
                          <span style={{
                            width: 24, height: 24, borderRadius: 7,
                            background: nodeDark(current.type).bg, color: nodeDark(current.type).fg,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>{(() => { const I3 = lookFor(current.type).icon; return <I3 size={12} />; })()}</span>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>
                            {lookFor(current.type).label}
                          </span>
                        </div>
                        <p style={{ margin: '6px 0 0', fontSize: 10.5, color: MUTED, lineHeight: 1.5 }}>
                          {/* Changing a step's kind would throw away its settings
                             silently, so it is delete-and-add rather than a
                             dropdown that quietly empties the form. */}
                          A step's kind is fixed. To change it, delete this one and add the kind you want.
                        </p>
                      </div>

                      <label>
                        <span style={lbl}>What to call it</span>
                        <input value={current.label} onChange={e => setStep(current.id, { label: e.target.value })}
                          style={inp} placeholder={lookFor(current.type).label} />
                      </label>

                      {current.type !== 'trigger' && (
                        <button onClick={() => remove(current.id)} className="press" style={{
                          justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '8px 13px', borderRadius: 10, border: `1px solid ${T.bad}55`,
                          background: T.badSoft, color: T.bad, fontSize: 12, fontWeight: 700,
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}>
                          <Trash2 size={12} /> Delete this step
                        </button>
                      )}
                    </>
                  )}

                  {stage === 'configure' && (
                    <>
                      {!fields.length && (
                        <p style={{ margin: 0, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
                          This step has nothing to set.
                        </p>
                      )}
                      {fields.map(f => (
                        <label key={f.key}>
                          <span style={lbl}>{f.label}</span>
                          {f.kind === 'select' ? (
                            <select value={current.config[f.key] ?? ''}
                              onChange={e => setConfig(current.id, f.key, e.target.value)} style={inp}>
                              <option value="">— choose —</option>
                              {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          ) : f.kind === 'textarea' ? (
                            <textarea value={current.config[f.key] ?? ''} rows={5}
                              onChange={e => setConfig(current.id, f.key, e.target.value)}
                              style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} placeholder={f.placeholder} />
                          ) : (
                            <input type={f.kind === 'number' ? 'number' : 'text'} min={0}
                              value={current.config[f.key] ?? ''}
                              onChange={e => setConfig(current.id, f.key, e.target.value)}
                              style={inp} placeholder={f.placeholder} />
                          )}
                          {f.hint && (
                            <span style={{ display: 'block', fontSize: 10.5, color: MUTED, marginTop: 3, lineHeight: 1.5 }}>
                              {f.hint}
                            </span>
                          )}
                        </label>
                      ))}

                      {current.type === 'condition' && (
                        <label>
                          <span style={lbl}>
                            <GitBranch size={10} style={{ display: 'inline', marginRight: 4 }} />
                            If the answer is No, go to
                          </span>
                          <select value={current.noId ?? ''}
                            onChange={e => setStep(current.id, { noId: e.target.value || null })} style={inp}>
                            {/* Nothing is a real answer and the commonest one. */}
                            <option value="">Stop here</option>
                            {nodes.filter(x => x.id !== current.id && x.type !== 'trigger').map(x => (
                              <option key={x.id} value={x.id}>{x.label || lookFor(x.type).label}</option>
                            ))}
                          </select>
                          <span style={{ display: 'block', fontSize: 10.5, color: MUTED, marginTop: 3, lineHeight: 1.5 }}>
                            Yes always continues to the next step below. This is where No goes.
                          </span>
                        </label>
                      )}
                    </>
                  )}

                  {stage === 'test' && preview && (
                    <>
                      <div style={{
                        display: 'flex', gap: 9, alignItems: 'flex-start', padding: '11px 12px',
                        borderRadius: 11, background: T.raised, border: `1px solid ${LINE}`,
                      }}>
                        <Play size={13} color={T.good} style={{ marginTop: 2, flexShrink: 0 }} />
                        <span style={{ fontSize: 12.5, color: INK, fontWeight: 700, lineHeight: 1.5 }}>
                          {preview.headline}
                        </span>
                      </div>

                      <p style={{ margin: 0, fontSize: 10.5, color: MUTED, lineHeight: 1.55 }}>
                        {/* The sentence that makes this button safe to press. */}
                        This is a dry run against a stand-in person — <strong style={{ color: INK }}>{SAMPLE_CONTACT.name}</strong>.
                        Nothing is sent and nobody is contacted.
                      </p>

                      {preview.blocked && (
                        <p style={{
                          margin: 0, padding: '10px 12px', borderRadius: 10, background: T.warnSoft,
                          border: `1px solid ${T.warn}55`, color: T.warn, fontSize: 12, lineHeight: 1.5,
                        }}>{preview.blocked}</p>
                      )}

                      {(preview.subject || preview.body) && (
                        <div style={{
                          border: `1px solid ${LINE}`, borderRadius: 11, overflow: 'hidden', background: T.raised,
                        }}>
                          {preview.subject !== undefined && (
                            <div style={{ padding: '9px 12px', borderBottom: `1px solid ${LINE}` }}>
                              <span style={{ fontSize: 10, color: MUTED, display: 'block' }}>Subject</span>
                              <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>
                                {preview.subject || <em style={{ color: T.warn }}>empty</em>}
                              </span>
                            </div>
                          )}
                          {preview.body !== undefined && (
                            <pre style={{
                              margin: 0, padding: '11px 12px', fontSize: 12, lineHeight: 1.6, color: INK,
                              whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit',
                              maxHeight: 220, overflowY: 'auto',
                            }}>{preview.body || 'empty'}</pre>
                          )}
                        </div>
                      )}

                      {preview.notes.map(note => (
                        <p key={note} style={{ margin: 0, fontSize: 10.5, color: MUTED, lineHeight: 1.55 }}>
                          {note}
                        </p>
                      ))}
                    </>
                  )}

                  {/* Forward, in the order the stages are asked. */}
                  {stage !== 'test' && (
                    <button onClick={() => setStage(stage === 'setup' ? 'configure' : 'test')} style={{
                      justifySelf: 'stretch', padding: '10px 16px', borderRadius: 10, border: 'none',
                      background: stage === 'configure' && preview?.blocked ? T.line : ACCENT,
                      color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                      {stage === 'configure' && preview?.blocked
                        /* Zapier's phrasing, and it is the right one: it says
                           what is missing rather than simply refusing. */
                        ? 'Finish the fields above to test it'
                        : 'Continue'}
                    </button>
                  )}
                </div>
              </>
            )}
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
