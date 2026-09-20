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
 */
import { useEffect, useState } from 'react';
import {
  Plus, Trash2, ArrowUp, ArrowDown, X, Check, Loader, AlertTriangle, GitBranch,
} from 'lucide-react';
import { lookFor, problemsWith } from './workflowNodes';
import { saveWorkflow, type ProjectWorkflow, type WorkflowNode } from '../../services/autopilot';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

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
      /* A new one starts with the one step every workflow must have, so
         somebody is never looking at a blank canvas wondering what a trigger
         is. */
      : [{ id: newId(), type: 'trigger', label: 'A form is submitted', config: { event: 'form_submitted' }, nextId: null }]);
  const [openStep, setOpenStep] = useState<string>('');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  /* Escape closes, like every other overlay here. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /**
   * Re-link the chain after any change to the order.
   *
   * Every step points at the next one in the list, and a condition keeps its
   * Yes on the next step while its No is the customer's to point somewhere.
   * Doing it in one place after each edit is what stops a reorder leaving a
   * step pointing at where it used to be — which reads as a workflow that skips
   * a step for no reason.
   */
  const relink = (list: WorkflowNode[]): WorkflowNode[] =>
    list.map((n, i) => {
      const next = i < list.length - 1 ? list[i + 1].id : null;
      if (n.type === 'condition') {
        return {
          ...n, nextId: null, yesId: next,
          /* A No pointing at a step that has been deleted is worse than one
             pointing nowhere: the engine would look it up, fail, and end the
             run reporting the step was removed. */
          noId: n.noId && list.some(x => x.id === n.noId) ? n.noId : null,
        };
      }
      return { ...n, nextId: next };
    });

  const setStep = (id: string, patch: Partial<WorkflowNode>) =>
    setNodes(list => relink(list.map(n => (n.id === id ? { ...n, ...patch } : n))));

  const setConfig = (id: string, key: string, value: string) =>
    setNodes(list => list.map(n => (n.id === id ? { ...n, config: { ...n.config, [key]: value } } : n)));

  function add(type: string) {
    const look = lookFor(type);
    const node: WorkflowNode = { id: newId(), type, label: look.label, config: {}, nextId: null };
    setNodes(list => relink([...list, node]));
    setOpenStep(node.id);
    setAdding(false);
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
    setNodes(list => relink(list.filter(n => n.id !== id)));
  }

  const problems = problemsWith(name, nodes);

  async function save() {
    if (problems.length || saving) return;
    setSaving(true);
    const r = await saveWorkflow(projectId, {
      id: workflow?.id,
      name: name.trim(),
      description: description.trim(),
      /* An edit never switches it on. Somebody fixing a typo in a live workflow
         keeps it live; somebody finishing a draft still has to press the
         switch, because that is the press that reaches real people. */
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
      role="dialog"
      aria-modal="true"
      aria-label={workflow ? `Edit ${workflow.name}` : 'New workflow'}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(15,17,23,0.42)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(8px, 3vw, 28px)',
        backdropFilter: 'blur(2px)',
      }}>
      <div style={{
        background: '#fff', borderRadius: 20, width: 'min(720px, 100%)', maxHeight: '94vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 24px 70px -12px rgba(16,24,40,0.3)',
      }}>
        <header style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
          borderBottom: `1px solid ${LINE}`, flexShrink: 0,
        }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: INK }}>
            {workflow ? 'Edit workflow' : 'New workflow'}
          </h3>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} aria-label="Close" style={{
            border: 'none', background: 'none', padding: 4, cursor: 'pointer', color: MUTED, display: 'flex',
          }}><X size={17} /></button>
        </header>

        <div style={{ overflowY: 'auto', padding: 16, display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <label>
              <span style={lbl}>Name</span>
              <input value={name} onChange={e => setName(e.target.value)} style={inp}
                placeholder="Answer a new enquiry" />
            </label>
            <label>
              <span style={lbl}>What it is for</span>
              <input value={description} onChange={e => setDescription(e.target.value)} style={inp}
                placeholder="New enquiries get a reply within the hour" />
            </label>
          </div>

          {/* ── The steps ── */}
          <div style={{ display: 'grid', gap: 8 }}>
            {nodes.map((n, i) => {
              const look = lookFor(n.type);
              const Ic = look.icon;
              const isOpen = openStep === n.id;
              const fields = STEP_FIELDS[n.type] ?? [];
              return (
                <article key={n.id} style={{ border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', background: '#fbfbfc' }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: 7, background: look.bg, color: look.fg,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}><Ic size={11} /></span>
                    <button onClick={() => setOpenStep(isOpen ? '' : n.id)} aria-expanded={isOpen} style={{
                      flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'none',
                      padding: 0, cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: INK }}>
                        {n.label || look.label}
                      </span>
                      <span style={{ display: 'block', fontSize: 10.5, color: MUTED }}>{look.label}</span>
                    </button>

                    {i > 0 && (
                      <>
                        <button onClick={() => move(n.id, -1)} aria-label={`Move ${n.label} up`}
                          disabled={i <= 1} style={{ ...iconBtn, opacity: i <= 1 ? 0.35 : 1 }}>
                          <ArrowUp size={11} />
                        </button>
                        <button onClick={() => move(n.id, 1)} aria-label={`Move ${n.label} down`}
                          disabled={i >= nodes.length - 1} style={{ ...iconBtn, opacity: i >= nodes.length - 1 ? 0.35 : 1 }}>
                          <ArrowDown size={11} />
                        </button>
                        <button onClick={() => remove(n.id)} aria-label={`Delete ${n.label}`}
                          style={{ ...iconBtn, color: '#b42318' }}><Trash2 size={11} /></button>
                      </>
                    )}
                  </div>

                  {isOpen && (
                    <div style={{ padding: 12, borderTop: `1px solid ${LINE}`, display: 'grid', gap: 10 }}>
                      <label>
                        <span style={lbl}>What to call this step</span>
                        <input value={n.label} onChange={e => setStep(n.id, { label: e.target.value })}
                          style={inp} placeholder={look.label} />
                      </label>

                      {fields.map(f => (
                        <label key={f.key}>
                          <span style={lbl}>{f.label}</span>
                          {f.kind === 'select' ? (
                            <select value={n.config[f.key] ?? ''} onChange={e => setConfig(n.id, f.key, e.target.value)} style={inp}>
                              <option value="">— choose —</option>
                              {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          ) : f.kind === 'textarea' ? (
                            <textarea value={n.config[f.key] ?? ''} rows={4}
                              onChange={e => setConfig(n.id, f.key, e.target.value)}
                              style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} placeholder={f.placeholder} />
                          ) : (
                            <input type={f.kind === 'number' ? 'number' : 'text'} min={0}
                              value={n.config[f.key] ?? ''}
                              onChange={e => setConfig(n.id, f.key, e.target.value)}
                              style={inp} placeholder={f.placeholder} />
                          )}
                          {f.hint && (
                            <span style={{ display: 'block', fontSize: 10.5, color: MUTED, marginTop: 3, lineHeight: 1.5 }}>
                              {f.hint}
                            </span>
                          )}
                        </label>
                      ))}

                      {n.type === 'condition' && (
                        <label>
                          <span style={lbl}>
                            <GitBranch size={10} style={{ display: 'inline', marginRight: 4 }} />
                            If the answer is No, go to
                          </span>
                          <select value={n.noId ?? ''} onChange={e => setStep(n.id, { noId: e.target.value || null })} style={inp}>
                            {/* Nothing is a real answer and the commonest one: a
                                condition whose No ends the workflow is how most
                                of these are drawn. */}
                            <option value="">Stop here</option>
                            {nodes.filter(x => x.id !== n.id && x.type !== 'trigger').map(x => (
                              <option key={x.id} value={x.id}>{x.label || lookFor(x.type).label}</option>
                            ))}
                          </select>
                          <span style={{ display: 'block', fontSize: 10.5, color: MUTED, marginTop: 3, lineHeight: 1.5 }}>
                            Yes always continues to the next step below. This is where No goes.
                          </span>
                        </label>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {/* ── Add a step ── */}
          {adding ? (
            <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {ADDABLE.map(t => {
                const look = lookFor(t);
                const Ic = look.icon;
                return (
                  <button key={t} onClick={() => add(t)} className="press" style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: '9px 11px',
                    border: `1px solid ${LINE}`, borderRadius: 10, background: '#fff',
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: 6, background: look.bg, color: look.fg,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}><Ic size={10} /></span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>{look.label}</span>
                  </button>
                );
              })}
              <button onClick={() => setAdding(false)} style={{
                padding: '9px 11px', border: `1px dashed ${LINE}`, borderRadius: 10,
                background: '#fff', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 11.5, color: MUTED,
              }}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} className="press" style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '10px 14px', border: `1px dashed ${ACCENT}`, borderRadius: 11,
              background: '#f8f7ff', color: ACCENT, fontSize: 12.5, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <Plus size={13} /> Add a step
            </button>
          )}

          {/* ── What is wrong with it ── */}
          {problems.length > 0 && (
            <div style={{
              padding: '11px 13px', borderRadius: 11, background: '#fffbeb',
              border: '1px solid #fde68a',
            }}>
              <p style={{ margin: '0 0 5px', fontSize: 12, fontWeight: 800, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={12} /> Not ready to save
              </p>
              <ul style={{ margin: 0, paddingLeft: 17, fontSize: 11.5, color: '#92400e', lineHeight: 1.6 }}>
                {problems.map(p => <li key={p}>{p}</li>)}
              </ul>
            </div>
          )}

          {error && (
            <p style={{
              margin: 0, padding: '10px 13px', borderRadius: 10, background: '#fdf3f3',
              border: '1px solid #f3cfcf', color: '#b42318', fontSize: 12.5,
            }}>{error}</p>
          )}
        </div>

        <footer style={{
          display: 'flex', gap: 9, padding: '12px 16px', borderTop: `1px solid ${LINE}`,
          flexShrink: 0, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 11, color: MUTED, flex: 1, minWidth: 140 }}>
            {/* Said where the decision is made. */}
            Saving does not switch it on.
          </span>
          <button onClick={onClose} style={{
            padding: '10px 16px', borderRadius: 10, border: `1px solid ${LINE}`,
            background: '#fff', color: INK, fontSize: 12.5, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancel</button>
          <button onClick={() => void save()} disabled={!!problems.length || saving} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px',
            borderRadius: 10, border: 'none',
            background: problems.length ? '#cbd5e1' : INK, color: '#fff',
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
  display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4,
};

const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9,
  border: `1px solid ${LINE}`, fontSize: 12.5, outline: 'none', fontFamily: 'inherit',
  background: '#fff',
};

const iconBtn: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 7, border: `1px solid ${LINE}`, background: '#fff',
  color: MUTED, cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
  justifyContent: 'center', flexShrink: 0, padding: 0,
};
