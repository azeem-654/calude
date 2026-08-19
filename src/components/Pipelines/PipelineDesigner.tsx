/**
 * Describe the project; get stages and tasks; edit them; then apply.
 *
 * Three steps, in that order, and the middle one is not optional. A generated
 * pipeline that wrote itself straight onto somebody's board would be a tool
 * that rearranges their work without asking — so the plan arrives as a draft
 * with every stage renameable, reorderable, removable, and every task editable,
 * and only what is on screen at the moment Apply is pressed gets written.
 *
 * The apply step says, before it runs, exactly what will happen to the deals
 * already on the board: how many stages stay, how many are new, and — the one
 * that matters — which columns are going and where their deals will end up.
 */
import { useMemo, useState } from 'react';
import {
  ArrowRight, Check, ChevronDown, ChevronUp, Loader, Plus, Sparkles, Trash2, X,
} from 'lucide-react';
import type { Pipeline } from '../../types';
import {
  EMPTY_BRIEF, applyPlan, briefIsUsable, makeId, makeTask, planFromPipeline,
  planPipeline, type PipelinePlan, type PlannedStage, type ProjectBrief,
} from '../../services/pipelineAI';

const INK = '#17191c';
const MUTED = '#8a8f98';
const LINE = '#e3e6eb';

type Step = 'brief' | 'review';

const PALETTE = ['#94a3b8', '#0ea5e9', '#6366f1', '#8b5cf6', '#f59e0b', '#f97316', '#14b8a6', '#16a34a', '#e5484d'];

export default function PipelineDesigner({ pipeline, onApply, onClose }: {
  pipeline: Pipeline;
  onApply: (stages: Pipeline['stages']) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>('brief');
  const [brief, setBrief] = useState<ProjectBrief>(EMPTY_BRIEF);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');
  const [plan, setPlan] = useState<PipelinePlan | null>(null);
  const [stages, setStages] = useState<PlannedStage[]>([]);
  const [openStage, setOpenStage] = useState<string | null>(null);

  const usable = briefIsUsable(brief);

  const generate = async () => {
    setBusy(true);
    setFailed('');
    try {
      const result = await planPipeline(brief);
      setPlan(result);
      setStages(result.stages);
      setOpenStage(result.stages[0]?.id ?? null);
      setStep('review');
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'Something went wrong building the plan.');
    } finally {
      setBusy(false);
    }
  };

  const startFromBoard = () => {
    const mirrored = planFromPipeline(pipeline);
    setPlan({ summary: `Your board as it stands — ${mirrored.length} stage${mirrored.length === 1 ? '' : 's'}.`, stages: mirrored, source: 'rules' });
    setStages(mirrored);
    setOpenStage(mirrored[0]?.id ?? null);
    setStep('review');
  };

  /* What applying this plan would do to the deals already on the board. Worked
     out from the same function that does it, so the warning cannot drift from
     the behaviour. */
  const preview = useMemo(() => applyPlan(pipeline, stages), [pipeline, stages]);

  const edit = (id: string, patch: Partial<PlannedStage>) =>
    setStages(list => list.map(s => (s.id === id ? { ...s, ...patch } : s)));

  const move = (id: string, by: -1 | 1) =>
    setStages(list => {
      const at = list.findIndex(s => s.id === id);
      const to = at + by;
      if (at === -1 || to < 0 || to >= list.length) return list;
      const next = [...list];
      [next[at], next[to]] = [next[to], next[at]];
      return next;
    });

  const removeStage = (id: string) => setStages(list => list.filter(s => s.id !== id));

  const addStage = () => {
    const fresh: PlannedStage = {
      id: makeId('s'),
      name: 'New stage',
      color: PALETTE[stages.length % PALETTE.length],
      tasks: [],
      because: 'Added by you.',
    };
    setStages(list => [...list, fresh]);
    setOpenStage(fresh.id);
  };

  const apply = () => {
    if (stages.length < 2) return;
    onApply(preview.stages);
  };

  return (
    <div
      role="presentation"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 800, backgroundColor: 'rgba(23,25,28,0.4)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: 'clamp(12px, 5vh, 60px) 12px 12px', overflowY: 'auto',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Design this pipeline with AI"
        style={{
          /* min-width on a flex item defaults to auto, which lets a wide child
             push the whole dialog past the edge of a phone. */
          width: 'min(720px, 100%)', maxWidth: '100%', minWidth: 0,
          backgroundColor: '#fff', borderRadius: 22, boxSizing: 'border-box',
          boxShadow: '0 30px 80px -20px rgba(23,25,28,0.45)',
          display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 80px)',
        }}
      >
        {/* ── Head ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 20px 14px', borderBottom: `1px solid ${LINE}`, minWidth: 0 }}>
          <span style={{
            width: 36, height: 36, borderRadius: 11, flexShrink: 0, backgroundColor: '#17191c',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Sparkles size={17} color="#c7f441" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 16.5, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>
              Design this pipeline
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
              {step === 'brief'
                ? 'Tell it about the work and it lays out the stages, with the tasks a deal should carry in each.'
                : 'Nothing is written until you press Apply. Rename, reorder, remove, rewrite — this is a draft.'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: MUTED, display: 'flex', padding: 4 }}>
            <X size={17} strokeWidth={2.4} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 'clamp(14px, 3vw, 20px)' }}>
          {step === 'brief' ? (
            <BriefForm brief={brief} onChange={setBrief} />
          ) : (
            <Review
              plan={plan}
              stages={stages}
              openStage={openStage}
              setOpenStage={setOpenStage}
              edit={edit}
              move={move}
              removeStage={removeStage}
              addStage={addStage}
              preview={preview}
            />
          )}

          {failed && (
            <p role="alert" style={{ margin: '14px 0 0', padding: '10px 12px', borderRadius: 10, backgroundColor: '#fdecec', color: '#b42318', fontSize: 12.5, lineHeight: 1.5 }}>
              {failed}
            </p>
          )}
        </div>

        {/* ── Foot ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px clamp(14px, 3vw, 20px)', borderTop: `1px solid ${LINE}`, flexWrap: 'wrap', minWidth: 0 }}>
          {step === 'brief' ? (
            <>
              <button
                type="button"
                onClick={startFromBoard}
                disabled={pipeline.stages.length === 0}
                style={{
                  padding: '9px 14px', borderRadius: 10, border: `1px solid ${LINE}`, background: '#fff',
                  color: pipeline.stages.length === 0 ? MUTED : INK, fontSize: 12.5, fontWeight: 600,
                  cursor: pipeline.stages.length === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                }}
              >
                Start from what I have
              </button>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                onClick={generate}
                disabled={!usable || busy}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '10px 18px', borderRadius: 10, border: 'none',
                  backgroundColor: usable && !busy ? INK : '#e6e8eb',
                  color: usable && !busy ? '#fff' : MUTED,
                  fontSize: 13, fontWeight: 700, cursor: usable && !busy ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                }}
              >
                {busy ? <><Loader size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Working…</> : <><Sparkles size={14} /> Design the stages</>}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { setStep('brief'); setFailed(''); }}
                style={{ padding: '9px 14px', borderRadius: 10, border: `1px solid ${LINE}`, background: '#fff', color: INK, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Back to the brief
              </button>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11.5, color: MUTED, fontWeight: 600 }}>
                {stages.length} stage{stages.length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                onClick={apply}
                disabled={stages.length < 2}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '10px 18px', borderRadius: 10, border: 'none',
                  backgroundColor: stages.length >= 2 ? INK : '#e6e8eb',
                  color: stages.length >= 2 ? '#fff' : MUTED,
                  fontSize: 13, fontWeight: 700, cursor: stages.length >= 2 ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                }}
              >
                <Check size={14} strokeWidth={2.8} /> Apply to {pipeline.name}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Step one ──────────────────────────────────────────────────────────── */

function BriefForm({ brief, onChange }: { brief: ProjectBrief; onChange: (b: ProjectBrief) => void }) {
  const set = (patch: Partial<ProjectBrief>) => onChange({ ...brief, ...patch });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field
        label="What does the business do?"
        hint="A family dental practice · commercial roofing · a design studio"
        value={brief.business}
        onChange={v => set({ business: v })}
      />
      <Field
        label="What are you selling?"
        hint="Implants and Invisalign · flat-roof replacements · monthly retainers"
        value={brief.offer}
        onChange={v => set({ offer: v })}
      />
      <Field
        label="Who buys it?"
        hint="Adults within 20 minutes of the clinic · facilities managers"
        value={brief.customer}
        onChange={v => set({ customer: v })}
      />

      {/* min() in the track so the pair collapses to one column on a phone
          rather than holding the dialog open at 190px each. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: 14 }}>
        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 5 }}>
            Days from first contact to paid
          </span>
          <input
            type="number"
            min={0}
            max={999}
            value={brief.cycleDays || ''}
            onChange={e => set({ cycleDays: Math.max(0, Math.min(999, Number(e.target.value) || 0)) })}
            placeholder="Leave blank if it varies"
            style={inputStyle}
          />
          <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 4 }}>
            A long cycle gets an extra stage in the middle.
          </span>
        </label>
        <Field
          label="Typical deal size"
          hint="£3,000 · $250/month"
          value={brief.dealSize}
          onChange={v => set({ dealSize: v })}
        />
      </div>

      <label style={{ display: 'block' }}>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 5 }}>
          Anything else about how the work actually runs
        </span>
        <textarea
          value={brief.notes}
          onChange={e => set({ notes: e.target.value })}
          rows={3}
          placeholder="We always survey before quoting. Two people have to sign off anything over £10k."
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
        />
      </label>

      <p style={{ margin: 0, fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
        Nothing here is guessed at. Anything you leave blank stays out of the plan rather than being
        filled in for you, and the next screen says which stages are there because of something you
        wrote and which are there because nearly every pipeline has one.
      </p>
    </div>
  );
}

function Field({ label, hint, value, onChange }: {
  label: string; hint: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 5 }}>{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={hint} style={inputStyle} />
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: `1px solid ${LINE}`, borderRadius: 10,
  fontSize: 13, fontFamily: 'inherit', color: INK, outline: 'none', boxSizing: 'border-box',
  backgroundColor: '#fff',
};

/* ── Step two ──────────────────────────────────────────────────────────── */

function Review({ plan, stages, openStage, setOpenStage, edit, move, removeStage, addStage, preview }: {
  plan: PipelinePlan | null;
  stages: PlannedStage[];
  openStage: string | null;
  setOpenStage: (id: string | null) => void;
  edit: (id: string, patch: Partial<PlannedStage>) => void;
  move: (id: string, by: -1 | 1) => void;
  removeStage: (id: string) => void;
  addStage: () => void;
  preview: ReturnType<typeof applyPlan>;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {plan && (
        <div style={{ padding: '12px 14px', borderRadius: 12, backgroundColor: '#f6f7f9', border: `1px solid ${LINE}` }}>
          <p style={{ margin: 0, fontSize: 13, color: INK, lineHeight: 1.55, fontWeight: 600 }}>{plan.summary}</p>
          <p style={{ margin: '6px 0 0', fontSize: 11.5, color: MUTED, lineHeight: 1.55 }}>
            {plan.note ?? (plan.source === 'ai'
              ? 'Written by the AI model from your brief. Read it before you apply it — it does not know your business better than you do.'
              : 'Built from your brief and from how sales pipelines are normally laid out.')}
          </p>
        </div>
      )}

      {/* What this would do to what is already there. */}
      <div style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${preview.dealsMoved > 0 ? '#fde68a' : LINE}`, backgroundColor: preview.dealsMoved > 0 ? '#fffbeb' : '#fff' }}>
        <p style={{ margin: 0, fontSize: 11.5, fontWeight: 800, color: preview.dealsMoved > 0 ? '#92400e' : INK, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          What applying this does
        </p>
        <ul style={{ margin: '7px 0 0', paddingLeft: 18, fontSize: 12.5, color: preview.dealsMoved > 0 ? '#92400e' : '#4b5563', lineHeight: 1.65 }}>
          <li>{preview.kept.length} stage{preview.kept.length === 1 ? '' : 's'} kept{preview.kept.length > 0 ? ` — ${preview.kept.join(', ')}` : ''}</li>
          <li>{preview.added.length} added{preview.added.length > 0 ? ` — ${preview.added.join(', ')}` : ''}</li>
          {preview.moved.length === 0
            ? <li>No deal changes column.</li>
            : preview.moved.map(m => (
                <li key={m.from}>
                  <strong>{m.from}</strong> goes — its {m.deals} deal{m.deals === 1 ? '' : 's'} move to <strong>{m.to}</strong>
                </li>
              ))}
        </ul>
        <p style={{ margin: '7px 0 0', fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
          No deal is ever deleted. Anything in a stage you drop moves back to the nearest stage that stays.
        </p>
      </div>

      {stages.map((stage, i) => (
        <StageCard
          key={stage.id}
          stage={stage}
          index={i}
          total={stages.length}
          open={openStage === stage.id}
          onToggle={() => setOpenStage(openStage === stage.id ? null : stage.id)}
          edit={patch => edit(stage.id, patch)}
          move={by => move(stage.id, by)}
          onRemove={() => removeStage(stage.id)}
        />
      ))}

      <button
        type="button"
        onClick={addStage}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          padding: '11px 14px', borderRadius: 12, border: `1px dashed ${LINE}`,
          background: 'none', color: INK, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <Plus size={14} strokeWidth={2.6} /> Add a stage of your own
      </button>
    </div>
  );
}

function StageCard({ stage, index, total, open, onToggle, edit, move, onRemove }: {
  stage: PlannedStage;
  index: number;
  total: number;
  open: boolean;
  onToggle: () => void;
  edit: (patch: Partial<PlannedStage>) => void;
  move: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const setTask = (id: string, text: string) =>
    edit({ tasks: stage.tasks.map(t => (t.id === id ? { ...t, text } : t)) });
  const dropTask = (id: string) => edit({ tasks: stage.tasks.filter(t => t.id !== id) });
  const addTask = () => edit({ tasks: [...stage.tasks, makeTask('')] });

  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, overflow: 'hidden', backgroundColor: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', minWidth: 0 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: stage.color, flexShrink: 0 }} />
        <input
          value={stage.name}
          onChange={e => edit({ name: e.target.value })}
          aria-label={`Stage ${index + 1} name`}
          style={{
            flex: 1, minWidth: 0, border: 'none', outline: 'none', fontSize: 13.5,
            fontWeight: 700, color: INK, fontFamily: 'inherit', background: 'none', padding: '2px 0',
          }}
        />
        <span style={{ fontSize: 11, color: MUTED, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {stage.tasks.length} task{stage.tasks.length === 1 ? '' : 's'}
        </span>
        <button type="button" aria-label={`Move ${stage.name} earlier`} disabled={index === 0} onClick={() => move(-1)}
          style={{ ...iconBtn, opacity: index === 0 ? 0.3 : 1 }}>
          <ChevronUp size={14} strokeWidth={2.4} />
        </button>
        <button type="button" aria-label={`Move ${stage.name} later`} disabled={index === total - 1} onClick={() => move(1)}
          style={{ ...iconBtn, opacity: index === total - 1 ? 0.3 : 1 }}>
          <ChevronDown size={14} strokeWidth={2.4} />
        </button>
        <button type="button" aria-label={`Remove ${stage.name}`} onClick={onRemove} style={{ ...iconBtn, color: '#b42318' }}>
          <Trash2 size={13} strokeWidth={2.2} />
        </button>
        <button type="button" aria-label={`${open ? 'Hide' : 'Show'} tasks for ${stage.name}`} onClick={onToggle} style={iconBtn}>
          {open ? <ChevronUp size={15} strokeWidth={2.4} /> : <ArrowRight size={15} strokeWidth={2.4} />}
        </button>
      </div>

      {open && (
        <div style={{ padding: '2px 12px 12px', borderTop: `1px solid ${LINE}` }}>
          {stage.because && (
            <p style={{ margin: '10px 0 10px', fontSize: 11.5, color: MUTED, lineHeight: 1.55 }}>
              {stage.because}
            </p>
          )}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {PALETTE.map(c => (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${stage.name} ${c}`}
                aria-pressed={stage.color === c}
                onClick={() => edit({ color: c })}
                style={{
                  width: 20, height: 20, borderRadius: 6, backgroundColor: c, cursor: 'pointer',
                  border: stage.color === c ? '2px solid #17191c' : '1px solid rgba(0,0,0,0.08)',
                }}
              />
            ))}
          </div>

          {stage.tasks.length === 0 && (
            <p style={{ margin: '0 0 8px', fontSize: 12, color: MUTED }}>
              No tasks here. A deal created in this stage will start with an empty checklist.
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {stage.tasks.map((t, ti) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${LINE}`, flexShrink: 0 }} />
                <input
                  value={t.text}
                  onChange={e => setTask(t.id, e.target.value)}
                  placeholder="What should somebody do here?"
                  aria-label={`Task ${ti + 1} in ${stage.name}`}
                  style={{ ...inputStyle, padding: '7px 10px', fontSize: 12.5 }}
                />
                <button type="button" aria-label={`Remove task ${ti + 1} from ${stage.name}`} onClick={() => dropTask(t.id)} style={iconBtn}>
                  <X size={13} strokeWidth={2.4} />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addTask}
            style={{
              marginTop: 8, display: 'flex', alignItems: 'center', gap: 5,
              border: 'none', background: 'none', color: INK, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', padding: 0, fontFamily: 'inherit',
            }}
          >
            <Plus size={12} strokeWidth={2.8} /> Add a task
          </button>
        </div>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  border: 'none', background: 'none', cursor: 'pointer', color: MUTED,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 3, flexShrink: 0,
};
