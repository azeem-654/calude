/**
 * The plan, before anyone acts on it.
 *
 * Every field is editable. That is not a nicety: the agent is about to create
 * sequences that email real customers, and the moment a person cannot change
 * the number, the audience or the wording, the only options left are to accept
 * a machine's guess or abandon the campaign.
 *
 * The panel is also explicit about where each part came from. A plan the
 * fallback assembled from a regular expression says so at the top, because "the
 * AI decided to target multi-location clinics" and "the phrase multi-location
 * appeared in your sentence" deserve very different amounts of trust.
 */
import { Children, cloneElement, isValidElement, useState } from 'react';
import type { ReactElement } from 'react';
import { AlertTriangle, Check, Loader, Pencil, RefreshCw, Sparkles, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { setStatus, setStrategy, takeSaveError } from '../../services/aiCampaigns';
import { logDecision } from '../../services/aiDecisionLog';
import { checkStrategy, proposeStrategy } from '../../services/aiStrategy';
import type { AICampaign, AIChannel, AIStrategy } from '../../types/aiSalesAgent';
import { card, ghostBtn, primaryBtn } from './ui';

const CHANNELS: { id: AIChannel; label: string; note: string }[] = [
  { id: 'email', label: 'Email', note: 'The opening channel and the follow-ups' },
  { id: 'sms', label: 'SMS', note: 'Held for people who already engaged' },
  { id: 'calendar', label: 'Calendar', note: 'A booking link once someone is interested' },
];

interface Props {
  campaign: AICampaign;
  onChanged: () => void;
}

export default function StrategyPanel({ campaign, onChanged }: Props) {
  const { addNotification } = useApp();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState<AIStrategy | null>(null);
  const [problems, setProblems] = useState<{ field: string; message: string }[]>([]);

  const plan = async () => {
    setBusy(true); setNote('');
    const t0 = Date.now();
    const { strategy, note: why } = await proposeStrategy(campaign.objective);
    setBusy(false);
    setDraft(strategy);
    setNote(why ?? '');
    logDecision(campaign.id, {
      kind: 'plan',
      summary: strategy.generatedBy === 'ai' ? 'Worked out a plan' : 'Worked out a plan without a model',
      because: why
        ?? `Read the objective and took ${strategy.targetCount.toLocaleString()} prospects, ${strategy.cadence.followUps} follow-ups ${strategy.cadence.intervalDays} days apart, on ${strategy.channels.join(', ')}.`,
      counts: { seconds: Math.max(1, Math.round((Date.now() - t0) / 1000)) },
    });
  };

  const save = (s: AIStrategy) => {
    if (!setStrategy(campaign.id, s)) {
      addNotification(takeSaveError() || 'The plan could not be saved.', 'error');
      return false;
    }
    return true;
  };

  const approve = (s: AIStrategy) => {
    const found = checkStrategy(s);
    setProblems(found);
    if (found.length) return;
    if (!save(s)) return;
    setStatus(campaign.id, 'ready');
    logDecision(campaign.id, {
      kind: 'approval',
      summary: 'Plan approved',
      because: `Approved by a person. ${s.targetCount.toLocaleString()} prospects, ${s.cadence.followUps} follow-up${s.cadence.followUps === 1 ? '' : 's'} ${s.cadence.intervalDays} days apart, on ${s.channels.join(', ')}.`,
    });
    setDraft(null);
    onChanged();
    addNotification('Plan approved — nothing has been sent yet');
  };

  /* Editing an approved plan puts the campaign back in front of a person before
     anything acts on the change. */
  const reopen = () => {
    if (!campaign.strategy) return;
    setDraft(campaign.strategy);
    setProblems([]);
    setNote('');
  };

  const existing = campaign.strategy;

  if (draft) {
    return (
      <Editor
        strategy={draft}
        note={note}
        problems={problems}
        onChange={(s) => { setDraft(s); if (problems.length) setProblems(checkStrategy(s)); }}
        onCancel={() => { setDraft(null); setProblems([]); }}
        onApprove={approve}
        onReplan={plan}
        busy={busy}
      />
    );
  }

  if (!existing) {
    return (
      <section style={{ ...card, padding: 'clamp(16px, 3vw, 22px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Strategy</h2>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#64748b', lineHeight: 1.6 }}>
            Nothing planned yet. Work out an approach from the objective — you will be able to
            change every part of it before anything is created.
          </p>
        </div>
        <div>
          <button onClick={plan} disabled={busy} className="press"
            style={{ ...primaryBtn, opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? <><Loader size={14} className="spin" /> Working it out…</> : <><Sparkles size={14} /> Work out a plan</>}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section style={{ ...card, padding: 'clamp(16px, 3vw, 22px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Strategy</h2>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>
            {existing.generatedBy === 'fallback'
              ? 'Worked out from your sentence without an AI model — check it against what you meant.'
              : 'Drafted by AI from your objective, then approved by you.'}
          </p>
        </div>
        <button onClick={reopen} className="press" style={ghostBtn}><Pencil size={13} /> Edit</button>
      </div>
      <Summary strategy={existing} />
    </section>
  );
}

/* ── Read-only view of an agreed plan ──────────────────────────────────── */

function Summary({ strategy: s }: { strategy: AIStrategy }) {
  return (
    <>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: '#1e293b' }}>{s.summary}</p>
      <dl style={{ margin: 0, display: 'grid', gap: '10px 18px', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 165px), 1fr))' }}>
        <Fact label="Who" value={s.icp.description} />
        <Fact label="Offer" value={[s.offer.what, s.offer.priceHint].filter(Boolean).join(' · ')} />
        <Fact label="Channels" value={s.channels.join(', ')} />
        <Fact label="Follow-ups" value={`${s.cadence.followUps}, every ${s.cadence.intervalDays} days`} />
        <Fact label="Target" value={s.targetCount.toLocaleString()} />
      </dl>
      {s.icp.signals.length > 0 && (
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8' }}>What makes a lead worth contacting</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {s.icp.signals.map((sig, i) => (
              <span key={i} style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 999, backgroundColor: '#f1f5f9', color: '#475569' }}>{sig}</span>
            ))}
          </div>
        </div>
      )}
      {s.exitConditions.length > 0 && (
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8' }}>Stop chasing when</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {s.exitConditions.map((c, i) => (
              <span key={i} style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 999, backgroundColor: '#f1f5f9', color: '#475569' }}>{c}</span>
            ))}
          </div>
        </div>
      )}
      {s.rationale.length > 0 && (
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8' }}>Why this approach</p>
          <ul style={{ margin: 0, paddingLeft: 17, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {s.rationale.map((r, i) => (
              <li key={i} style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.55 }}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <dt style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8' }}>{label}</dt>
      <dd style={{ margin: '2px 0 0', fontSize: 13, color: '#1e293b', lineHeight: 1.5 }}>{value}</dd>
    </div>
  );
}

/* ── The editable form ─────────────────────────────────────────────────── */

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 9,
  fontSize: 13.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: '#0f172a',
};

function Editor({ strategy, note, problems, onChange, onCancel, onApprove, onReplan, busy }: {
  strategy: AIStrategy;
  note: string;
  problems: { field: string; message: string }[];
  onChange: (s: AIStrategy) => void;
  onCancel: () => void;
  onApprove: (s: AIStrategy) => void;
  onReplan: () => void;
  busy: boolean;
}) {
  const set = (patch: Partial<AIStrategy>) => onChange({ ...strategy, ...patch });
  const problemFor = (field: string) => problems.find(p => p.field === field)?.message;

  const toggleChannel = (id: AIChannel) => {
    const has = strategy.channels.includes(id);
    set({ channels: has ? strategy.channels.filter(c => c !== id) : [...strategy.channels, id] });
  };

  return (
    <section style={{ ...card, padding: 'clamp(16px, 3vw, 22px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Review the plan</h2>
        <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#64748b', lineHeight: 1.6 }}>
          Change anything here. Nothing is created until you approve it, and nothing is sent
          until you allow sending.
        </p>
      </div>

      {note && (
        <div style={{ display: 'flex', gap: 8, padding: '10px 12px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9 }}>
          <AlertTriangle size={14} color="#b45309" style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ margin: 0, fontSize: 12.5, color: '#92400e', lineHeight: 1.55 }}>{note}</p>
        </div>
      )}

      <Field label="In a sentence, what will happen" error={problemFor('summary')}>
        <textarea value={strategy.summary} onChange={e => set({ summary: e.target.value })} rows={3}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
      </Field>

      <Field label="Who to contact" error={problemFor('icp')}>
        <textarea value={strategy.icp.description} onChange={e => set({ icp: { ...strategy.icp, description: e.target.value } })} rows={2}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
      </Field>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
        <Field label="Industry">
          <input value={strategy.icp.industry ?? ''} placeholder="Not specified"
            onChange={e => set({ icp: { ...strategy.icp, industry: e.target.value } })} style={inputStyle} />
        </Field>
        <Field label="Location">
          <input value={strategy.icp.location ?? ''} placeholder="Not specified"
            onChange={e => set({ icp: { ...strategy.icp, location: e.target.value } })} style={inputStyle} />
        </Field>
        <Field label="Size or shape">
          <input value={strategy.icp.sizeHint ?? ''} placeholder="e.g. more than one location"
            onChange={e => set({ icp: { ...strategy.icp, sizeHint: e.target.value } })} style={inputStyle} />
        </Field>
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
        <Field label="What is being offered">
          <input value={strategy.offer.what} onChange={e => set({ offer: { ...strategy.offer, what: e.target.value } })} style={inputStyle} />
        </Field>
        <Field label="Price">
          <input value={strategy.offer.priceHint ?? ''} placeholder="Not specified"
            onChange={e => set({ offer: { ...strategy.offer, priceHint: e.target.value } })} style={inputStyle} />
        </Field>
      </div>

      <Field label="Channels" group error={problemFor('channels')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CHANNELS.map(c => {
            const on = strategy.channels.includes(c.id);
            return (
              <button key={c.id} type="button" onClick={() => toggleChannel(c.id)} className="press"
                aria-pressed={on}
                style={{
                  flex: '1 1 160px', textAlign: 'left', padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
                  border: `2px solid ${on ? '#17191c' : '#e2e8f0'}`,
                  backgroundColor: on ? '#f0f1f3' : 'white',
                }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                  {on && <Check size={13} />}{c.label}
                </span>
                <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{c.note}</span>
              </button>
            );
          })}
        </div>
      </Field>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))' }}>
        <Field label="How many prospects" error={problemFor('targetCount')}>
          <input type="number" min={1} value={strategy.targetCount}
            onChange={e => set({ targetCount: Math.max(0, Math.round(Number(e.target.value) || 0)) })} style={inputStyle} />
        </Field>
        <Field label="Follow-ups" error={problemFor('followUps')}>
          <input type="number" min={0} max={10} value={strategy.cadence.followUps}
            onChange={e => set({ cadence: { ...strategy.cadence, followUps: Math.max(0, Math.round(Number(e.target.value) || 0)) } })} style={inputStyle} />
        </Field>
        <Field label="Days between messages" error={problemFor('intervalDays')}>
          <input type="number" min={1} value={strategy.cadence.intervalDays}
            onChange={e => set({ cadence: { ...strategy.cadence, intervalDays: Math.max(0, Math.round(Number(e.target.value) || 0)) } })} style={inputStyle} />
        </Field>
      </div>

      <Field label="Stop chasing someone when" error={problemFor('exitConditions')}>
        <textarea
          value={strategy.exitConditions.join('\n')}
          onChange={e => set({ exitConditions: e.target.value.split('\n').map(x => x.trim()).filter(Boolean) })}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
        <span style={{ fontSize: 11.5, color: '#94a3b8' }}>One per line.</span>
      </Field>

      {strategy.rationale.length > 0 && (
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8' }}>Why this approach</p>
          <ul style={{ margin: 0, paddingLeft: 17, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {strategy.rationale.map((r, i) => (
              <li key={i} style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.55 }}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {problems.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '11px 13px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9 }}>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#991b1b' }}>Fix these before approving</p>
          {problems.map(p => (
            <p key={p.field} style={{ margin: 0, fontSize: 12.5, color: '#b91c1c', lineHeight: 1.55 }}>{p.message}</p>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} className="press" style={ghostBtn}><X size={13} /> Cancel</button>
        <button onClick={onReplan} disabled={busy} className="press" style={{ ...ghostBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? <Loader size={13} className="spin" /> : <RefreshCw size={13} />} Start again
        </button>
        <button onClick={() => onApprove(strategy)} className="press" style={primaryBtn}>
          <Check size={14} /> Approve plan
        </button>
      </div>
    </section>
  );
}

/**
 * A labelled field.
 *
 * `group` is not cosmetic. A <label> binds to the first labelable control
 * inside it, so wrapping several buttons in one hands the whole group's text to
 * the first button and drops the rest — the channel toggles were briefly in
 * that state, and the Email button disappeared from the accessibility tree
 * altogether, unreachable by name and unlabelled to a screen reader. Several
 * controls get a group with its own label instead.
 *
 * The aria-label is not belt and braces either. React renders a textarea's
 * value as a DOM child, so a wrapping label's text content is the caption plus
 * the entire value — and the accessible name of the summary box was the caption
 * followed by the whole plan, read out before the value itself. An explicit
 * name wins over the computed one.
 */
function Field({ label, error, group, children }: {
  label: string;
  error?: string;
  group?: boolean;
  children: React.ReactNode;
}) {
  const named = Children.map(children, child => (
    isValidElement(child) && (child.type === 'textarea' || child.type === 'input')
      && !(child.props as { 'aria-label'?: string })['aria-label']
      ? cloneElement(child as ReactElement<{ 'aria-label'?: string }>, { 'aria-label': label })
      : child
  ));

  const inner = (
    <>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{label}</span>
      {named}
      {error && <span style={{ fontSize: 11.5, color: '#b91c1c' }}>{error}</span>}
    </>
  );
  const style: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5 };
  return group
    ? <div role="group" aria-label={label} style={style}>{inner}</div>
    : <label style={style}>{inner}</label>;
}
