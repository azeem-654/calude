/**
 * One step's settings: Setup, Configure, Test.
 *
 * ── Why this is its own file ──
 *
 * The same panel is needed in two places now: inside the full workflow editor,
 * and on its own when somebody presses the pen on a single step. Two copies of
 * "what fields does an email step take, and how is a trigger renamed when its
 * event changes" would disagree the first time either was touched — the drift
 * this codebase keeps writing comments about. So there is one, and both
 * screens hand it the step.
 *
 * It holds no state of its own beyond the stage. The caller owns the graph and
 * decides what an edit means for it, which is what lets the pen panel save one
 * step while the full editor saves the lot.
 */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Trash2, Check, Loader, GitBranch, Play, Settings2, Sliders, ChevronRight,
} from 'lucide-react';
import {
  AGENT_OUTPUTS, AGENT_SOURCES, CADENCES, lookFor, previewStep, SAMPLE_CONTACT,
} from './workflowNodes';
import type { AgentRunResult, WorkflowNode } from '../../services/autopilot';
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
export interface FieldDef {
  key: string;
  label: string;
  hint?: string;
  kind?: 'text' | 'textarea' | 'number' | 'select';
  options?: { value: string; label: string }[];
  placeholder?: string;
  /**
   * Shown only when this is true of the step's config.
   *
   * A feed address on a step reading the client's portfolio is a box that can
   * only be filled in wrongly, and a campaign length on a step making images is
   * a number that does nothing. Hiding them is not decoration: every visible
   * field is a claim that it matters.
   */
  when?: (cfg: Record<string, string>) => boolean;
}

export const STEP_FIELDS: Record<string, FieldDef[]> = {
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
        /* The one that is not about a person. A workflow triggered this way is
           run by `worker/src/lib/projectAgents.ts` instead of the contact
           engine — see the note in 0044_agent_runs.sql. */
        { value: 'schedule', label: 'A schedule — nobody has to do anything' },
      ],
    },
    {
      key: 'cadence', label: 'How often', kind: 'select',
      when: cfg => cfg.event === 'schedule',
      options: Object.entries(CADENCES).map(([value, label]) => ({ value, label })),
      hint: 'Counted from when it last ran, not from a clock — so nothing is skipped by a tick landing a few minutes early.',
    },
    {
      key: 'formName', label: 'Only this form', hint: 'Leave blank for any form.', placeholder: 'Get a quote',
      /* Only for the event it narrows. It used to show for every event, so a
         tag trigger carried a form name it could not use — and the engine,
         reading whichever was set, then waited for a form that never came. */
      when: cfg => cfg.event === 'form_submitted',
    },
    {
      key: 'tag', label: 'Only this tag or stage', hint: 'Leave blank for any.', placeholder: 'enquiry',
      /* The events that carry something to narrow by: a tag, a stage, an
         appointment's title, an email's subject. A new contact carries
         nothing, so there is nothing to ask. */
      when: cfg => ['tag_added', 'deal_stage_changed', 'appointment_scheduled', 'email_opened', 'link_clicked']
        .includes(String(cfg.event ?? '')),
    },
  ],
  /**
   * The AI agent.
   *
   * Three questions in the order somebody actually asks them: what should it
   * read, what should it make, and how much. The source and the output are the
   * same two tables the runner reads, so a choice offered here is a choice the
   * server can carry out.
   */
  ai: [
    {
      key: 'source', label: 'What it reads', kind: 'select',
      options: Object.entries(AGENT_SOURCES).map(([value, v]) => ({ value, label: v.label })),
      hint: 'The material it writes from. Everything else it says comes from this.',
    },
    {
      key: 'sourceUrl', label: 'Address', kind: 'text',
      when: cfg => !!AGENT_SOURCES[cfg.source ?? '']?.needsUrl,
      hint: 'A page, a feed, or a YouTube channel ID beginning UC.',
      placeholder: 'https://example.com/feed',
    },
    {
      key: 'sourcePrompt', label: 'What to search for', kind: 'textarea',
      when: cfg => !!AGENT_SOURCES[cfg.source ?? '']?.needsPrompt,
      hint: 'Written as you would type it into a search engine, plus what you care about. It runs this search each time and writes from what it finds.',
      placeholder: 'Latest UK boiler grant and heat pump scheme changes, from official or trade sources',
    },
    {
      key: 'produces', label: 'What it makes', kind: 'select',
      options: Object.entries(AGENT_OUTPUTS).map(([value, v]) => ({ value, label: v.label })),
    },
    {
      key: 'platform', label: 'For which platform', kind: 'select',
      when: cfg => (cfg.produces ?? 'social') === 'social',
      options: [
        { value: 'instagram', label: 'Instagram — square' },
        { value: 'facebook', label: 'Facebook — square' },
        { value: 'linkedin', label: 'LinkedIn — wide' },
        { value: 'twitter', label: 'X — wide' },
      ],
    },
    {
      key: 'count', label: 'How many each time', kind: 'number',
      when: cfg => (cfg.produces ?? 'social') === 'social',
      hint: 'One a day is a habit somebody can keep up with. Six is the most it will make in one run.',
      placeholder: '1',
    },
    {
      key: 'campaignSteps', label: 'How many emails', kind: 'select',
      when: cfg => cfg.produces === 'email_campaign',
      options: [
        { value: '7', label: '7 — a week of daily emails, or seven weekly ones' },
        { value: '20', label: '20 — a long nurture' },
        { value: '52', label: '52 — one a week for a year' },
      ],
    },
    {
      key: 'everyDays', label: 'Days between emails', kind: 'number',
      when: cfg => cfg.produces === 'email_campaign',
      hint: 'Seven is weekly. The campaign is written all at once; this is the gap it schedules them at.',
      placeholder: '7',
    },
    {
      key: 'topic', label: 'Anything it should stick to', kind: 'textarea',
      hint: 'Optional. Leave it blank and it chooses from what it reads.',
      placeholder: 'Boiler servicing before winter, and the grant that pays for part of it.',
    },
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
export const ADDABLE = ['ai', 'send_email', 'send_sms', 'wait', 'condition', 'add_tag', 'remove_tag', 'create_task', 'assign_to', 'update_field'];

export const newId = () => `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;


/** The three stages of setting one step up, in the order somebody asks them. */
export type Stage = 'setup' | 'configure' | 'test';

export const STAGES: { id: Stage; label: string; icon: typeof Play }[] = [
  { id: 'setup', label: 'Setup', icon: Settings2 },
  { id: 'configure', label: 'Configure', icon: Sliders },
  { id: 'test', label: 'Test', icon: Play },
];

/**
 * What a step arrives already set to.
 *
 * An agent added with an empty config shows two boxes reading "— choose —",
 * and until both are answered the step does nothing and the dry run can say
 * nothing useful about it. These are the commonest answers, so the step is
 * complete from the moment it is added and changing it is an edit rather than a
 * form to fill in.
 *
 * Only for the types where a default is genuinely right. An email's subject has
 * no sensible default: a pre-filled one is a real message somebody might not
 * read before switching it on.
 */
export const DEFAULTS: Record<string, Record<string, string>> = {
  ai: { source: 'portfolio', produces: 'social', platform: 'instagram', count: '1' },
  wait: { days: '1' },
};

/** Every stock trigger name, so one can be recognised as untouched. The
 *  cadences are in here too because a schedule is named after its cadence
 *  rather than after the option that chose it — "Every day" is a step name,
 *  "A schedule — nobody has to do anything" is a menu entry. */
const TRIGGER_LABELS = [
  ...(STEP_FIELDS.trigger[0].options ?? []).map(o => o.label),
  ...Object.values(CADENCES),
];

/**
 * One setting changed on one step, with what that implies for its name.
 *
 * Changing what starts a workflow renames it, unless somebody has named it
 * themselves. Without this a trigger switched to a schedule goes on reading "A
 * form is submitted" — the one line somebody scanning a workflow actually
 * trusts. A name they typed is left alone, because overwriting that is the worse
 * of the two mistakes. Pure, so both editors get the same rule.
 */
export function applyConfig(n: WorkflowNode, key: string, value: string): WorkflowNode {
  const next = { ...n, config: { ...n.config, [key]: value } };
  /* A trigger's narrowing belongs to its event. Switching from "a form is
     submitted" to "a tag is added" used to keep the old form name, and the
     engine — matching whichever narrowing was set — then waited for that form
     on a tag trigger, for ever. The stale one goes when the event changes. */
  if (n.type === 'trigger' && key === 'event' && value !== n.config?.event) {
    const cfg: Record<string, string> = { ...next.config };
    if (value !== 'form_submitted') { delete cfg.formName; delete cfg.formId; }
    if (value === 'form_submitted' || value === 'contact_created' || value === 'schedule') delete cfg.tag;
    if (value !== 'schedule') delete cfg.cadence;
    next.config = cfg;
  }
  if (n.type === 'trigger' && (key === 'event' || key === 'cadence') && TRIGGER_LABELS.includes(n.label)) {
    const event = key === 'event' ? value : String(next.config.event ?? '');
    if (event === 'schedule') {
      next.label = CADENCES[key === 'cadence' ? value : String(next.config.cadence ?? 'daily')] ?? CADENCES.daily;
    } else {
      const chosen = (STEP_FIELDS.trigger[0].options ?? []).find(o => o.value === event);
      if (chosen) next.label = chosen.label;
    }
  }
  return next;
}

/** The fields this step shows, given what it is already set to. */
/** What a guided control may do to the rest of the graph. */
export interface GraphAccess {
  nodes: WorkflowNode[];
  change: (fn: (nodes: WorkflowNode[]) => WorkflowNode[]) => void;
}

export const fieldsFor = (n: WorkflowNode): FieldDef[] =>
  (STEP_FIELDS[n.type] ?? []).filter(f => !f.when || f.when(n.config ?? {}));

export const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 4,
};

export const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9,
  border: `1px solid ${LINE}`, fontSize: 12.5, outline: 'none', fontFamily: 'inherit',
  background: T.raised, color: T.ink,
};

export default function StepSettings({
  node, nodes, stage, onStage, onPatch, onConfig, onDelete, onRun, running = false, ran = null,
  canRun = false, renderField, onGraph,
}: {
  node: WorkflowNode | null;
  /** The whole graph, for a condition's "if No, go to" list. */
  nodes: WorkflowNode[];
  stage: Stage;
  onStage: (s: Stage) => void;
  onPatch: (id: string, patch: Partial<WorkflowNode>) => void;
  onConfig: (id: string, key: string, value: string) => void;
  /** Absent where a step cannot be deleted from here. */
  onDelete?: (id: string) => void;
  /** Absent where an agent cannot be run from here. */
  onRun?: (id: string) => void;
  running?: boolean;
  ran?: AgentRunResult | null;
  /** Whether the workflow is saved, so an agent step can be run for real. */
  canRun?: boolean;
  /**
   * A richer control for one field, when the caller has one.
   *
   * The table describes every field as text, a number or a list, which is the
   * right default and the wrong answer for "which form?": somebody should pick
   * one of their forms, not type its name from memory. Returning null keeps the
   * plain control.
   */
  renderField?: (
    field: FieldDef, node: WorkflowNode, set: (key: string, value: string) => void, graph?: GraphAccess,
  ) => ReactNode | null;
  /**
   * The whole graph, for a control that has to change another step.
   *
   * One does: choosing "read a web page, every morning" on a trigger sets the
   * trigger to a schedule *and* points the agent after it at the page. Asking
   * somebody to do the second half on a different step is how it gets missed.
   */
  onGraph?: (change: (nodes: WorkflowNode[]) => WorkflowNode[]) => void;
}) {
  const navigate = useNavigate();
  const current = node;
  const preview = current ? previewStep(current) : null;
  const fields = current ? fieldsFor(current) : [];

  return (
    <>
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
                <button role="tab" aria-selected={on} onClick={() => onStage(id)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '10px 10px',
                  border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 12, fontWeight: on ? 800 : 600,
                  color: on ? T.accent : MUTED,
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
                <input value={current.label} onChange={e => onPatch(current.id, { label: e.target.value })}
                  style={inp} placeholder={lookFor(current.type).label} />
              </label>

              {current.type !== 'trigger' && onDelete && (
                <button onClick={() => onDelete?.(current.id)} className="press" style={{
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
              {fields.map(f => {
                /* A richer control where one exists — a list of real forms
                   rather than a box to type a form's name into from memory. */
                const guided = renderField?.(f, current, (k, v) => onConfig(current.id, k, v),
                  onGraph ? { nodes, change: onGraph } : undefined);
                if (guided) return <div key={f.key}>{guided}</div>;
                return (
                <label key={f.key}>
                    <span style={lbl}>{f.label}</span>
                    {f.kind === 'select' ? (
                      <select value={current.config[f.key] ?? ''}
                        onChange={e => onConfig(current.id, f.key, e.target.value)} style={inp}>
                        <option value="">— choose —</option>
                        {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : f.kind === 'textarea' ? (
                      <textarea value={current.config[f.key] ?? ''} rows={5}
                        onChange={e => onConfig(current.id, f.key, e.target.value)}
                        style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} placeholder={f.placeholder} />
                    ) : (
                      <input type={f.kind === 'number' ? 'number' : 'text'} min={0}
                        value={current.config[f.key] ?? ''}
                        onChange={e => onConfig(current.id, f.key, e.target.value)}
                        style={inp} placeholder={f.placeholder} />
                    )}
                    {f.hint && (
                      <span style={{ display: 'block', fontSize: 10.5, color: MUTED, marginTop: 3, lineHeight: 1.5 }}>
                        {f.hint}
                      </span>
                    )}
                  </label>
                );
              })}

              {current.type === 'condition' && (
                <label>
                  <span style={lbl}>
                    <GitBranch size={10} style={{ display: 'inline', marginRight: 4 }} />
                    If the answer is No, go to
                  </span>
                  <select value={current.noId ?? ''}
                    onChange={e => onPatch(current.id, { noId: e.target.value || null })} style={inp}>
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
                {current.type === 'ai'
                  /* An agent step has no person in it, so the stand-in
                     sentence would be a lie in the reassuring
                     direction — the worst kind. */
                  ? 'This describes what the agent would do. What it actually writes is written by the model when it runs.'
                  : <>
                    {/* The sentence that makes this button safe to press. */}
                    This is a dry run against a stand-in person — <strong style={{ color: INK }}>{SAMPLE_CONTACT.name}</strong>.
                    Nothing is sent and nobody is contacted.
                  </>}
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

              {/* ── Running it for real ──
                  Only for an agent, and only once the workflow has been
                  saved: the server runs the step it has stored, and a
                  step that only exists in this browser is not one it can
                  find. Saying so beats a 404 that reads like a fault. */}
              {current.type === 'ai' && onRun && (
                <div style={{ display: 'grid', gap: 8, marginTop: 2 }}>
                  <button
                    disabled={!canRun || running || !!preview.blocked}
                    onClick={() => onRun?.(current.id)}
                    style={{
                      padding: '10px 14px', borderRadius: 10, border: `1px solid ${LINE}`,
                      background: !canRun || preview.blocked ? T.raised : T.accentSoft,
                      color: !canRun || preview.blocked ? MUTED : INK,
                      fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
                      cursor: !canRun || running || preview.blocked ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    }}>
                    {running
                      ? <><Loader size={13} className="spin" /> Writing…</>
                      : <><Play size={13} /> Run it now</>}
                  </button>
                  <span style={{ fontSize: 10.5, color: MUTED, lineHeight: 1.55 }}>
                    {!canRun
                      ? 'Save the workflow first — the server runs the step it has stored.'
                      : 'This really runs: it writes a real draft, which you can read and delete like any other. It does not publish or send anything.'}
                  </span>
                  {ran && (
                    <div style={{
                      padding: '11px 12px', borderRadius: 11,
                      background: ran.ok ? T.goodSoft : ran.outcome === 'skipped' ? T.raised : T.badSoft,
                      border: `1px solid ${ran.ok ? T.good : ran.outcome === 'skipped' ? LINE : T.bad}55`,
                      display: 'grid', gap: 6,
                    }}>
                      <span style={{ fontSize: 12, color: INK, lineHeight: 1.55 }}>{ran.detail}</span>
                      {ran.link && (
                        <a href={ran.link.route}
                          /* Routed rather than reloaded: a full page
                             load here throws away the editor and the
                             unsaved graph in it. */
                          onClick={e => { e.preventDefault(); navigate(ran.link!.route); }}
                          style={{
                            fontSize: 12, fontWeight: 700, color: T.accent,
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                          }}>
                          Open it in {AGENT_OUTPUTS[current.config.produces || 'social']?.where ?? 'the app'}
                          <ChevronRight size={12} />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Forward, in the order the stages are asked. */}
          {stage !== 'test' && (
            <button onClick={() => onStage(stage === 'setup' ? 'configure' : 'test')} style={{
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
    </>
  );
}
