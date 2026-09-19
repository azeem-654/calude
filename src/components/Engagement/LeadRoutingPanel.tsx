/**
 * Where a captured lead goes next.
 *
 * Lives beside the engagement settings rather than in the pipeline module,
 * because the question is "what happens when somebody fills in my form" — which
 * is a question about the form, not about the board it lands on.
 *
 * The routing itself is browser-side state (`crm_lead_routing`), for the same
 * reason contacts and pipelines are: the merge that acts on it runs in this
 * browser, and a server copy of a rule the server cannot apply would be a
 * setting that looks authoritative and is not.
 */
import { useState } from 'react';
import { GitBranch, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { loadRouting, saveRouting, type LeadRouting } from '../../services/leadRouting';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

export default function LeadRoutingPanel() {
  const { addNotification, pipelines, sequences } = useApp();
  const [r, setR] = useState<LeadRouting>(() => loadRouting());

  const pipeline = pipelines.find(p => p.id === r.pipelineId) ?? pipelines[0];
  const stages = pipeline?.stages ?? [];

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 9,
    fontSize: 13.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff',
  };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 5 };

  function save() {
    if (!saveRouting(r)) {
      addNotification('The browser refused to save that. Check that storage is not blocked for this site.', 'error');
      return;
    }
    addNotification('Saved. It applies to leads that arrive from now on.');
  }

  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 22, display: 'grid', gap: 16, maxWidth: 760 }}>
      <div>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <GitBranch size={16} color={ACCENT} /> Where new leads go
        </h3>
        <p style={{ fontSize: 12.5, color: MUTED, margin: '6px 0 0', lineHeight: 1.6 }}>
          Everything a form, the chat assistant or the voice agent captures becomes a contact. This is what
          happens to it after that — so an enquiry is on the board being worked rather than sitting in a list
          waiting for somebody to notice.
        </p>
      </div>

      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
        <input type="checkbox" checked={r.createDeal} style={{ marginTop: 3 }}
          onChange={e => setR({ ...r, createDeal: e.target.checked })} />
        <span>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: INK }}>Open a deal on the pipeline</span>
          <span style={{ display: 'block', fontSize: 12, color: MUTED, marginTop: 1, lineHeight: 1.5 }}>
            One card per person, in the first stage, carrying that stage’s checklist. Somebody who enquires
            twice does not get two cards.
          </span>
        </span>
      </label>

      {r.createDeal && (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))' }}>
          <label><span style={lbl}>Pipeline</span>
            <select style={inp} value={pipeline?.id ?? ''}
              onChange={e => setR({ ...r, pipelineId: e.target.value, stageId: '' })}>
              {pipelines.length === 0 && <option value="">No pipeline yet</option>}
              {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
          <label><span style={lbl}>Stage</span>
            <select style={inp} value={r.stageId || stages[0]?.id || ''}
              onChange={e => setR({ ...r, stageId: e.target.value })}>
              {stages.length === 0 && <option value="">No stages</option>}
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></label>
          <label><span style={lbl}>Starting value</span>
            <input style={inp} type="number" min={0} value={r.dealValue}
              onChange={e => setR({ ...r, dealValue: Math.max(0, Number(e.target.value) || 0) })} />
            <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>
              What a typical job is worth, so the board’s totals mean something before anybody has quoted.
            </span></label>
        </div>
      )}

      <label><span style={lbl}>Put them into a follow-up sequence</span>
        <select style={inp} value={r.sequenceId} onChange={e => setR({ ...r, sequenceId: e.target.value })}>
          <option value="">Don’t — I’ll reply myself</option>
          {sequences.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 6, lineHeight: 1.6 }}>
          <strong style={{ color: INK }}>This sends email.</strong> It is off until you pick one, on purpose —
          somebody who filled in your form has asked to hear from you, but that is still your decision and not
          a default. The first email goes out on the next send, the rest on the sequence’s own spacing, and
          the unsubscribe link and your daily cap apply exactly as they do everywhere else.
          {sequences.length === 0 && ' You have no sequences yet — AI Autopilot writes one, or build one in Email campaigns → Sequences.'}
        </span></label>

      <button onClick={save} style={{
        justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px',
        border: 'none', borderRadius: 10, background: ACCENT, color: '#fff', fontSize: 13.5, fontWeight: 700,
        cursor: 'pointer', fontFamily: 'inherit',
      }}>
        <Check size={14} /> Save routing
      </button>
    </div>
  );
}
