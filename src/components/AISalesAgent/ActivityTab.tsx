/**
 * The account the agent gives of itself.
 *
 * The reason each line exists is the `because`, not the summary. "Moved 4 leads
 * to Interested" is a claim to be taken on trust; "because they replied and the
 * reply did not match an out-of-office pattern" is something a person can check
 * and disagree with. So the evidence is shown by default rather than folded
 * behind a chevron nobody clicks.
 *
 * A long-running campaign produces a lot of these, so they can be filtered by
 * what kind of thing happened — with the counts on the filters, so it is
 * obvious whether there were three errors or none without opening anything.
 */
import { useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { trimmedCount } from '../../services/aiDecisionLog';
import { DECISION_LABEL, type AIDecision, type DecisionKind } from '../../types/aiSalesAgent';
import { ago } from './ui';
import { Panel } from './tabs';

/** Grouped so the filter row stays short on a phone. */
const GROUPS: { id: string; label: string; kinds: DecisionKind[] }[] = [
  { id: 'all', label: 'Everything', kinds: [] },
  { id: 'decisions', label: 'Decisions', kinds: ['plan', 'approval'] },
  { id: 'prospects', label: 'Prospects', kinds: ['discover', 'qualify'] },
  { id: 'created', label: 'Created', kinds: ['create', 'enrol'] },
  { id: 'sending', label: 'Sending', kinds: ['send', 'observe', 'advance', 'book'] },
  { id: 'problems', label: 'Problems', kinds: ['error'] },
];

export default function ActivityTab({ log }: { log: AIDecision[] }) {
  const [group, setGroup] = useState('all');

  const counts = useMemo(() => {
    const by = new Map<string, number>();
    for (const g of GROUPS) {
      by.set(g.id, g.id === 'all' ? log.length : log.filter(d => g.kinds.includes(d.kind)).length);
    }
    return by;
  }, [log]);

  const rows = useMemo(() => {
    const g = GROUPS.find(x => x.id === group);
    const filtered = !g || g.id === 'all' ? log : log.filter(d => g.kinds.includes(d.kind));
    /* Newest first on screen; the store keeps them in order, which is what makes
       "what happened just before this went wrong" answerable. */
    return [...filtered].reverse();
  }, [log, group]);

  const trimmed = trimmedCount();

  return (
    <Panel title="What the agent has done" note="Every action, with the reason it acted.">
      {log.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13.5, color: '#64748b' }}>Nothing recorded yet.</p>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {GROUPS.map(g => {
              const n = counts.get(g.id) ?? 0;
              if (g.id !== 'all' && n === 0) return null;
              const on = group === g.id;
              return (
                <button key={g.id} onClick={() => setGroup(g.id)} className="press"
                  aria-pressed={on}
                  style={{
                    padding: '5px 11px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${on ? '#17191c' : '#e2e8f0'}`,
                    backgroundColor: on ? '#17191c' : 'white',
                    color: on ? 'white' : (g.id === 'problems' ? '#b91c1c' : '#475569'),
                  }}>
                  {g.label} <span style={{ opacity: 0.65 }}>{n}</span>
                </button>
              );
            })}
          </div>

          {trimmed > 0 && (
            <p style={{ margin: 0, fontSize: 11.5, color: '#94a3b8' }}>
              {trimmed.toLocaleString()} older {trimmed === 1 ? 'entry has' : 'entries have'} been dropped to stay
              inside the storage limit. This is the most recent history, not all of it.
            </p>
          )}

          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 13 }}>
            {rows.map(d => (
              <li key={d.id} style={{ display: 'flex', gap: 11 }}>
                <span style={{
                  flexShrink: 0, marginTop: 5, width: 8, height: 8, borderRadius: 999,
                  backgroundColor: d.kind === 'error' ? '#dc2626' : d.kind === 'approval' ? '#2563eb' : '#cbd5e1',
                }} />
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: d.kind === 'error' ? '#991b1b' : '#0f172a' }}>
                      {d.kind === 'error' && <AlertCircle size={12} style={{ verticalAlign: -1, marginRight: 4 }} />}
                      {d.summary}
                    </span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      {DECISION_LABEL[d.kind]} · {ago(d.at)} · {new Date(d.at).toLocaleString()}
                    </span>
                  </div>

                  {/* The half worth reading. */}
                  {d.because && (
                    <p style={{ margin: 0, fontSize: 12.5, color: '#475569', lineHeight: 1.6 }}>{d.because}</p>
                  )}

                  {d.counts && Object.keys(d.counts).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 1 }}>
                      {Object.entries(d.counts).map(([k, v]) => (
                        <span key={k} style={{ fontSize: 11.5, color: '#64748b' }}>
                          <strong style={{ color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{v.toLocaleString()}</strong> {k}
                        </span>
                      ))}
                    </div>
                  )}

                  {d.link && (
                    <span style={{ fontSize: 11.5, color: '#94a3b8' }}>
                      {d.link.label} <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{d.link.id}</span>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {rows.length === 0 && (
            <p style={{ margin: 0, fontSize: 13.5, color: '#64748b' }}>Nothing of that kind has happened.</p>
          )}
        </>
      )}
    </Panel>
  );
}
