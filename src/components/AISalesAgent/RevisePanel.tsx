/**
 * The funnel rewrite, old against new, editable before any of it is applied.
 *
 * Three things this screen refuses to do. It will not propose a rewrite the
 * diagnosis says is wrong — a bouncing list gets told to clean the list, not
 * handed better subject lines. It will not apply anything until a person
 * presses the button, and what lands is the text in these boxes rather than
 * what was first proposed. And it always shows the old wording next to the new
 * one, because "we improved your emails" with the previous version thrown away
 * is not something anyone can check.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowUpRight, Check, RotateCcw, Sparkles, Trash2, Wand2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { customerBusinessName } from '../../services/tenancy';
import { sequenceView } from '../../services/aiRollup';
import { applyRevision, diagnose, reviseFunnel, revisionCount, type Revision } from '../../services/aiRestrategy';
import type { AICampaign } from '../../types/aiSalesAgent';
import type { EmailStep } from '../../types/marketing';
import { card, ghostBtn, primaryBtn } from './ui';

const box: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 11px',
  border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13,
  color: '#0f172a', outline: 'none', font: 'inherit', lineHeight: 1.55,
  backgroundColor: 'white',
};

export default function RevisePanel({ campaign, onChanged }: { campaign: AICampaign; onChanged: () => void }) {
  const navigate = useNavigate();
  const { contacts, sequences, appointments, bookings, updateSequence, addNotification } = useApp();
  const [proposal, setProposal] = useState<Revision | null>(null);
  const [draft, setDraft] = useState<EmailStep[]>([]);
  const [done, setDone] = useState<string[] | null>(null);

  /* The worst-performing sequence is the one worth rewriting; with one, that
     is simply the one. Read live from Marketing every render. */
  const { view, sequence } = useMemo(() => {
    const views = sequenceView(campaign, { contacts, sequences, appointments, bookings })
      .filter(v => v.status !== 'missing')
      .sort((a, b) => b.sent - a.sent);
    const v = views[0] ?? null;
    return { view: v, sequence: v ? sequences.find(s => s.id === v.id) ?? null : null };
  }, [campaign, contacts, sequences, appointments, bookings]);

  const diagnosis = useMemo(() => diagnose(view), [view]);
  const already = revisionCount(campaign.id);

  const propose = () => {
    if (!sequence || !view) return;
    const r = reviseFunnel(campaign, sequence, view, {
      businessName: customerBusinessName(),
      generation: already + 1,
    });
    if (!r) {
      addNotification('There is nothing worth changing in this sequence.', 'error');
      return;
    }
    setProposal(r);
    setDraft(r.steps.map(s => ({ ...s })));
    setDone(null);
  };

  const apply = () => {
    if (!proposal) return;
    const r = applyRevision(campaign, proposal, draft, { sequences, updateSequence });
    if (!r.ok) { addNotification(r.error || 'That could not be applied.', 'error'); return; }
    setDone(r.changed);
    setProposal(null);
    addNotification(`Funnel rewritten: ${r.changed.join(', ')}`);
    if (r.enrolmentsCompleted) {
      addNotification(
        `${r.enrolmentsCompleted} ${r.enrolmentsCompleted === 1 ? 'person had' : 'people had'} already passed the new last message and ${r.enrolmentsCompleted === 1 ? 'is' : 'are'} marked finished.`,
      );
    }
    onChanged();
  };

  const patch = (i: number, updates: Partial<EmailStep>) =>
    setDraft(d => d.map((s, n) => (n === i ? { ...s, ...updates } : s)));

  const edited = proposal
    ? JSON.stringify(draft) !== JSON.stringify(proposal.steps)
    : false;

  return (
    <section style={{ ...card, padding: 'clamp(16px, 3vw, 22px)', display: 'flex', flexDirection: 'column', gap: 13 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Rewrite the funnel</h2>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>
            Aimed at whichever half of it the figures say is failing — and only when they say so.
          </p>
        </div>
        {!proposal && (
          <button onClick={propose} disabled={!diagnosis.rewritable} className="press"
            style={{ ...primaryBtn, opacity: diagnosis.rewritable ? 1 : 0.45, cursor: diagnosis.rewritable ? 'pointer' : 'not-allowed' }}>
            <Wand2 size={14} /> {already ? 'Rewrite it again' : 'Rewrite it'}
          </button>
        )}
      </div>

      {/* The diagnosis is shown whether or not it leads to a rewrite. Being told
          why nothing will be changed is the more useful half of this. */}
      <div style={{
        display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 10,
        backgroundColor: diagnosis.rewritable ? '#fffbeb' : '#f8fafc',
        border: `1px solid ${diagnosis.rewritable ? '#fde68a' : '#e2e8f0'}`,
      }}>
        {diagnosis.rewritable
          ? <AlertTriangle size={15} color="#b45309" style={{ flexShrink: 0, marginTop: 2 }} />
          : <Check size={15} color="#64748b" style={{ flexShrink: 0, marginTop: 2 }} />}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: diagnosis.rewritable ? '#92400e' : '#334155' }}>
            {diagnosis.headline}
          </span>
          <p style={{ margin: 0, fontSize: 12.5, color: '#475569', lineHeight: 1.6 }}>{diagnosis.detail}</p>
          <p style={{ margin: 0, fontSize: 12, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
            <strong style={{ color: '#0f172a' }}>Because:</strong> {diagnosis.evidence}
          </p>
          {already > 0 && (
            <p style={{ margin: 0, fontSize: 11.5, color: '#94a3b8' }}>
              This funnel has been rewritten {already === 1 ? 'once' : `${already} times`} already.
            </p>
          )}
        </div>
      </div>

      {done && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 9, padding: '11px 13px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 9 }}>
          <Check size={14} color="#16a34a" style={{ flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 12.5, color: '#166534', lineHeight: 1.55, flex: 1, minWidth: 180 }}>
            Applied to the live sequence in Marketing — {done.join(', ')}. The new wording goes out on the next send;
            anything already scheduled keeps its time.
          </p>
          <button onClick={() => navigate('/marketing')} className="press" style={{ ...ghostBtn, padding: '5px 11px', fontSize: 12 }}>
            Open in Marketing <ArrowUpRight size={12} />
          </button>
        </div>
      )}

      {proposal && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '11px 13px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 9 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#94a3b8' }}>
              What this rewrite does, and why
            </p>
            {proposal.notes.map((n, i) => (
              <div key={i} style={{ display: 'flex', gap: 7 }}>
                <Sparkles size={12} color="#94a3b8" style={{ flexShrink: 0, marginTop: 3 }} />
                <p style={{ margin: 0, fontSize: 12.5, color: '#475569', lineHeight: 1.55 }}>{n}</p>
              </div>
            ))}
          </div>

          <p style={{ margin: 0, fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
            Every box below is editable. Nothing is written to “{proposal.sequenceName}” until you apply it.
          </p>

          {draft.map((step, i) => {
            const was = proposal.revisions.find(r => r.id === step.id)?.was;
            return (
              <div key={step.id} style={{ border: '1px solid #eef1f5', borderRadius: 11, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>
                    {i === 0 ? 'Opening message' : `Follow-up ${i}`}
                  </span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
                    Day
                    <input type="number" min={0} aria-label={`Day of message ${i + 1}`} value={step.day}
                      onChange={e => patch(i, { day: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                      style={{ ...box, width: 74, padding: '5px 8px' }} />
                    {was && was.day !== step.day && (
                      <span style={{ fontSize: 11.5, color: '#94a3b8', textDecoration: 'line-through' }}>{was.day}</span>
                    )}
                  </label>
                </div>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#94a3b8' }}>Subject</span>
                  {was && was.subject !== step.subject && <Was text={was.subject} />}
                  <input aria-label={`Subject of message ${i + 1}`}
                    value={step.subject} onChange={e => patch(i, { subject: e.target.value })} style={box} />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#94a3b8' }}>Message</span>
                  {was && was.body !== step.body && <Was text={was.body} />}
                  {/* Named explicitly: React renders a textarea's value as a DOM
                      child, so the wrapping label would announce the whole
                      message as this field's name. */}
                  <textarea aria-label={`Message ${i + 1}`}
                    value={step.body} onChange={e => patch(i, { body: e.target.value })} rows={7}
                    style={{ ...box, resize: 'vertical' }} />
                </label>

                {draft.length > 1 && (
                  <div>
                    <button onClick={() => setDraft(d => d.filter((_, n) => n !== i))} className="press"
                      style={{ ...ghostBtn, padding: '5px 11px', fontSize: 12, color: '#b91c1c', borderColor: '#fecaca' }}>
                      <Trash2 size={12} /> Drop this message
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {proposal.removed.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '11px 13px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#b91c1c' }}>
                Dropped from the funnel · {proposal.removed.length}
              </p>
              {proposal.removed.map(s => (
                <p key={s.id} style={{ margin: 0, fontSize: 12.5, color: '#991b1b', lineHeight: 1.55 }}>
                  Day {s.day} — “{s.subject}”
                </p>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setProposal(null); setDraft([]); }} className="press" style={ghostBtn}>
              Cancel
            </button>
            <button onClick={() => setDraft(proposal.steps.map(s => ({ ...s })))} disabled={!edited} className="press"
              style={{ ...ghostBtn, opacity: edited ? 1 : 0.45, cursor: edited ? 'pointer' : 'not-allowed' }}>
              <RotateCcw size={13} /> Undo my edits
            </button>
            <button onClick={apply} className="press" style={primaryBtn}>
              <Check size={14} /> Apply to the sequence
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Was({ text }: { text: string }) {
  return (
    <div style={{
      padding: '7px 10px', borderRadius: 8, backgroundColor: '#f8fafc',
      border: '1px dashed #e2e8f0', fontSize: 12, color: '#94a3b8',
      whiteSpace: 'pre-wrap', lineHeight: 1.55, maxHeight: 132, overflowY: 'auto',
    }}>
      <span style={{ fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 10 }}>Was</span>
      <br />
      {text}
    </div>
  );
}
