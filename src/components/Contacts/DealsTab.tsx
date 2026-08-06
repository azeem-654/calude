/**
 * DealsTab.tsx — every deal this contact has, with one-click stage moves that
 * fire the same automations as the pipeline board, an explainable win
 * probability, and inline editing of the fields that actually move a forecast.
 */
import { useMemo, useState } from 'react';
import {
  Briefcase, Plus, Trophy, XCircle, RotateCcw, Trash2, Check, X,
  TrendingUp, Calendar, ChevronRight, Info, Pencil, Zap, ToggleLeft, ToggleRight,
} from 'lucide-react';
import type { Contact, Pipeline } from '../../types';
import {
  placedDealsForContact, winProbability, summariseDeals, moveDealToStage,
  closeDeal, reopenDeal, updateDealFields, deleteDeal, createDealForContact,
  loadBehaviourRules, saveBehaviourRules,
  type PlacedDeal,
} from '../../services/contactDeals';

const INK = '#17191c';

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

const STATUS_META = {
  active: { label: 'Open', color: '#6366f1', bg: '#eef2ff' },
  won:    { label: 'Won',  color: '#16a34a', bg: '#dcfce7' },
  lost:   { label: 'Lost', color: '#dc2626', bg: '#fef2f2' },
} as const;

interface Props {
  contact: Contact;
  pipelines: Pipeline[];
  health: number;
  /** Persist a whole pipeline (stages included). */
  onPipelines: (pipelines: Pipeline[]) => void;
  onActivity: (text: string) => void;
  onNotify: (text: string) => void;
}

export default function DealsTab({ contact, pipelines, health, onPipelines, onActivity, onNotify }: Props) {
  const [showNew, setShowNew] = useState(false);
  const [explain, setExplain] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const deals = useMemo(() => placedDealsForContact(contact, pipelines), [contact, pipelines]);
  const probs = useMemo(() => {
    const m = new Map<string, ReturnType<typeof winProbability>>();
    for (const d of deals) m.set(d.id, winProbability(d, health));
    return m;
  }, [deals, health]);
  const summary = useMemo(
    () => summariseDeals(deals, d => probs.get(d.id)?.percent ?? d.probability ?? 0),
    [deals, probs],
  );

  /** Apply a pure mutation: persist, log to the contact, surface automations. */
  const apply = (res: { pipelines: Pipeline[]; automationNotes: string[]; activity: string | null }) => {
    onPipelines(res.pipelines);
    if (res.activity) { onActivity(res.activity); onNotify(res.activity); }
    for (const note of res.automationNotes) onNotify(`Automation: ${note}`);
  };

  const move = (deal: PlacedDeal, stageId: string) => apply(moveDealToStage(pipelines, deal.id, stageId));

  const win = (deal: PlacedDeal) => apply(closeDeal(pipelines, deal.id, 'won'));

  const lose = (deal: PlacedDeal) => {
    const reason = window.prompt(`Why was "${deal.title}" lost?`, 'Went with a competitor');
    if (reason === null) return;
    apply(closeDeal(pipelines, deal.id, 'lost', reason));
  };

  const remove = (deal: PlacedDeal) => {
    if (!window.confirm(`Delete the deal "${deal.title}"? This cannot be undone.`)) return;
    apply(deleteDeal(pipelines, deal.id));
  };

  return (
    <div>
      <SummaryStrip summary={summary} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 0 10px' }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Briefcase size={13} /> Deals ({deals.length})
        </span>
        <button onClick={() => setShowNew(v => !v)} title="Create a deal for this contact"
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 9, border: 'none', background: INK, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={12} /> New deal
        </button>
      </div>

      {showNew && (
        <NewDealForm
          contact={contact} pipelines={pipelines}
          onCancel={() => setShowNew(false)}
          onCreate={input => {
            const res = createDealForContact(pipelines, contact, input);
            if (!res.dealId) { onNotify('Pick a pipeline and stage first.'); return; }
            apply(res);
            setShowNew(false);
          }}
        />
      )}

      {!deals.length && !showNew && (
        <div style={{ padding: '30px 20px', textAlign: 'center', border: '1px dashed #e2e8f0', borderRadius: 14, color: '#94a3b8' }}>
          <Briefcase size={22} style={{ opacity: 0.4 }} />
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8, color: '#64748b' }}>No deals yet</div>
          <div style={{ fontSize: 11.5, marginTop: 3 }}>Create one to put this relationship in the pipeline.</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {deals.map(deal => {
          const pipeline = pipelines.find(p => p.id === deal.pipelineId);
          const prob = probs.get(deal.id)!;
          const status = (deal.status ?? 'active') as keyof typeof STATUS_META;
          const meta = STATUS_META[status];
          const closed = status !== 'active';

          return (
            <div key={deal.id} style={{ border: '1px solid #e6e9f0', borderRadius: 14, padding: 14, background: '#fff' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>{deal.title}</span>
                    <span style={{ padding: '2px 8px', borderRadius: 999, background: meta.bg, color: meta.color, fontSize: 10, fontWeight: 800 }}>{meta.label}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 3 }}>
                    {deal.pipelineName} · {deal.stageName}
                    {deal.expectedClose && <> · <Calendar size={10} style={{ display: 'inline', verticalAlign: -1 }} /> {deal.expectedClose}</>}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: INK }}>{money(deal.value ?? 0)}</div>
                  <button onClick={() => setExplain(explain === deal.id ? null : deal.id)}
                    title="How this probability is calculated"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2, padding: 0, border: 'none', background: 'transparent', color: prob.percent >= 65 ? '#16a34a' : prob.percent >= 35 ? '#f59e0b' : '#ef4444', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                    <TrendingUp size={11} /> {prob.percent}% to win <Info size={10} style={{ opacity: 0.6 }} />
                  </button>
                </div>
              </div>

              {/* Probability breakdown */}
              {explain === deal.id && (
                <div style={{ marginTop: 10, padding: 12, background: '#f8fafc', border: '1px solid #eef0f3', borderRadius: 11 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: INK, marginBottom: 8 }}>{prob.summary}</div>
                  {prob.components.map(c => (
                    <div key={c.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '3px 0' }}>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{c.label} — {c.detail}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: c.points >= 0 ? '#16a34a' : '#ef4444', flexShrink: 0 }}>
                        {c.points >= 0 ? '+' : ''}{c.points}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* One-click stage moves */}
              {!closed && pipeline && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Move to stage</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {pipeline.stages.map((s, i) => {
                      const here = s.id === deal.stageId;
                      return (
                        <button key={s.id} onClick={() => move(deal, s.id)} disabled={here}
                          title={here ? `Currently in ${s.name}` : `Move "${deal.title}" to ${s.name}`}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 999,
                            border: `1px solid ${here ? s.color : '#e2e8f0'}`,
                            background: here ? s.color : '#fff',
                            color: here ? '#fff' : '#475569',
                            fontSize: 11, fontWeight: 700, cursor: here ? 'default' : 'pointer',
                          }}>
                          {here && <Check size={10} />}
                          {i > deal.stageIndex && !here && <ChevronRight size={10} style={{ opacity: 0.5 }} />}
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {closed && deal.status === 'lost' && deal.lostReason && (
                <div style={{ marginTop: 10, fontSize: 11.5, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9, padding: '7px 10px' }}>
                  Lost: {deal.lostReason}
                </div>
              )}

              {/* Inline edit */}
              {editing === deal.id && (
                <EditDeal deal={deal} onCancel={() => setEditing(null)}
                  onSave={updates => { apply(updateDealFields(pipelines, deal.id, updates)); setEditing(null); onNotify(`"${deal.title}" updated`); }} />
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 7, marginTop: 12, flexWrap: 'wrap' }}>
                {!closed && (
                  <>
                    <button onClick={() => win(deal)} title="Mark this deal won"
                      style={btn('#16a34a', '#dcfce7', '#bbf7d0')}><Trophy size={11} /> Mark won</button>
                    <button onClick={() => lose(deal)} title="Mark this deal lost"
                      style={btn('#dc2626', '#fef2f2', '#fecaca')}><XCircle size={11} /> Mark lost</button>
                  </>
                )}
                {closed && (
                  <button onClick={() => apply(reopenDeal(pipelines, deal.id))} title="Reopen this deal"
                    style={btn('#6366f1', '#eef2ff', '#c7d2fe')}><RotateCcw size={11} /> Reopen</button>
                )}
                <button onClick={() => setEditing(editing === deal.id ? null : deal.id)} title="Edit deal details"
                  style={btn('#475569', '#fff', '#e2e8f0')}><Pencil size={11} /> Edit</button>
                <button onClick={() => remove(deal)} title="Delete this deal"
                  style={{ ...btn('#94a3b8', '#fff', '#e2e8f0'), marginLeft: 'auto' }}><Trash2 size={11} /></button>
              </div>
            </div>
          );
        })}
      </div>

      <BehaviourRules />
    </div>
  );
}

/* ── Behaviour-triggered automation ── */

function BehaviourRules() {
  const [rules, setRules] = useState(() => loadBehaviourRules());
  const [open, setOpen] = useState(false);
  const active = rules.filter(r => r.enabled).length;

  const toggle = (id: string) => {
    const next = rules.map(r => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    setRules(next);
    saveBehaviourRules(next);
  };

  return (
    <div style={{ marginTop: 18, border: '1px solid #e6e9f0', borderRadius: 14, background: '#fff', overflow: 'hidden' }}>
      <button onClick={() => setOpen(v => !v)} title="Rules that move deals when the contact does something"
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', border: 'none', background: 'transparent', cursor: 'pointer' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 800, color: INK }}>
          <Zap size={13} /> Behaviour triggers
          <span style={{ padding: '2px 8px', borderRadius: 999, background: '#eef2ff', color: '#4f46e5', fontSize: 10, fontWeight: 800 }}>{active} on</span>
        </span>
        <ChevronRight size={14} color="#94a3b8" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div style={{ padding: '0 14px 14px' }}>
          <p style={{ margin: '0 0 10px', fontSize: 11.5, color: '#64748b', lineHeight: 1.5 }}>
            These run in the background whenever the dashboard is open. They never move a deal into the
            final stage — closing a deal stays a decision you make.
          </p>
          {rules.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #f1f5f9' }}>
              <button onClick={() => toggle(r.id)} title={r.enabled ? 'Turn this rule off' : 'Turn this rule on'}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', color: r.enabled ? '#16a34a' : '#cbd5e1', padding: 0 }}>
                {r.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
              </button>
              <span style={{ fontSize: 12, color: r.enabled ? INK : '#94a3b8', fontWeight: r.enabled ? 600 : 500 }}>{r.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function btn(color: string, bg: string, border: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 9,
    border: `1px solid ${border}`, background: bg, color, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
  };
}

/* ── Summary strip ── */

function SummaryStrip({ summary }: { summary: ReturnType<typeof summariseDeals> }) {
  const cell = (label: string, value: string, sub?: string) => (
    <div key={label} style={{ flex: 1, padding: '10px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #eef0f3' }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: INK, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{sub}</div>}
    </div>
  );
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {cell('Open deals', String(summary.open), money(summary.openValue) + ' in pipeline')}
      {cell('Weighted forecast', money(summary.weighted), 'value × win probability')}
      {cell('Won', String(summary.won), money(summary.wonValue))}
      {cell('Lost', String(summary.lost), money(summary.lostValue))}
    </div>
  );
}

/* ── New deal ── */

function NewDealForm({ contact, pipelines, onCreate, onCancel }: {
  contact: Contact;
  pipelines: Pipeline[];
  onCreate: (input: { title: string; value: number; pipelineId: string; stageId: string; expectedClose: string }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(`${contact.company || contact.name} — new opportunity`);
  const [value, setValue] = useState('');
  const [pipelineId, setPipelineId] = useState(pipelines[0]?.id ?? '');
  const [stageId, setStageId] = useState(pipelines[0]?.stages[0]?.id ?? '');
  const [close, setClose] = useState(new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
  const [err, setErr] = useState('');

  const pipeline = pipelines.find(p => p.id === pipelineId);

  const inp: React.CSSProperties = { width: '100%', padding: '8px 11px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 12.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };

  const submit = () => {
    if (!title.trim()) { setErr('Give the deal a name.'); return; }
    const n = Number(value);
    if (value !== '' && (!Number.isFinite(n) || n < 0)) { setErr('Value must be a positive number.'); return; }
    if (!pipelineId || !stageId) { setErr('Choose a pipeline and a stage.'); return; }
    onCreate({ title: title.trim(), value: n || 0, pipelineId, stageId, expectedClose: close });
  };

  if (!pipelines.length) {
    return (
      <div style={{ border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 12, padding: 14, marginBottom: 12, fontSize: 12, color: '#92400e' }}>
        There are no pipelines yet. Create one in the Pipelines module first, then deals can live somewhere.
      </div>
    );
  }

  return (
    <div style={{ border: '1px solid #e6e9f0', borderRadius: 14, padding: 14, background: '#fff', marginBottom: 12 }}>
      <div style={{ display: 'grid', gap: 9 }}>
        <input value={title} onChange={e => { setTitle(e.target.value); setErr(''); }} placeholder="Deal name" style={inp} />
        <div style={{ display: 'flex', gap: 9 }}>
          <input value={value} onChange={e => { setValue(e.target.value); setErr(''); }} placeholder="Value (e.g. 5000)" inputMode="numeric" style={inp} />
          <input type="date" value={close} onChange={e => setClose(e.target.value)} title="Expected close date" style={inp} />
        </div>
        <div style={{ display: 'flex', gap: 9 }}>
          <select value={pipelineId} title="Pipeline"
            onChange={e => {
              setPipelineId(e.target.value);
              const p = pipelines.find(x => x.id === e.target.value);
              setStageId(p?.stages[0]?.id ?? '');
            }}
            style={{ ...inp, cursor: 'pointer' }}>
            {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={stageId} onChange={e => setStageId(e.target.value)} title="Starting stage" style={{ ...inp, cursor: 'pointer' }}>
            {(pipeline?.stages ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>
      {err && <div style={{ fontSize: 11.5, color: '#dc2626', marginTop: 8 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={btn('#64748b', '#fff', '#e2e8f0')}><X size={11} /> Cancel</button>
        <button onClick={submit} title="Create this deal"
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 15px', borderRadius: 9, border: 'none', background: INK, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          <Check size={12} /> Create deal
        </button>
      </div>
    </div>
  );
}

/* ── Inline edit ── */

function EditDeal({ deal, onSave, onCancel }: {
  deal: PlacedDeal;
  onSave: (updates: { title: string; value: number; expectedClose: string }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(deal.title);
  const [value, setValue] = useState(String(deal.value ?? 0));
  const [close, setClose] = useState(deal.expectedClose || '');
  const [err, setErr] = useState('');

  const inp: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };

  return (
    <div style={{ marginTop: 12, padding: 12, background: '#f8fafc', border: '1px solid #eef0f3', borderRadius: 11 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        <input value={title} onChange={e => { setTitle(e.target.value); setErr(''); }} placeholder="Deal name" style={inp} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={value} onChange={e => { setValue(e.target.value); setErr(''); }} inputMode="numeric" placeholder="Value" style={inp} />
          <input type="date" value={close} onChange={e => setClose(e.target.value)} title="Expected close date" style={inp} />
        </div>
      </div>
      {err && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 7 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 7, marginTop: 10, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={btn('#64748b', '#fff', '#e2e8f0')}>Cancel</button>
        <button title="Save deal changes"
          onClick={() => {
            const n = Number(value);
            if (!title.trim()) { setErr('Give the deal a name.'); return; }
            if (!Number.isFinite(n) || n < 0) { setErr('Value must be a positive number.'); return; }
            onSave({ title: title.trim(), value: Math.round(n), expectedClose: close });
          }}
          style={btn('#fff', INK, INK)}>
          <Check size={11} /> Save
        </button>
      </div>
    </div>
  );
}
