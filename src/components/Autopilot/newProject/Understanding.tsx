/**
 * Step two: understanding, before any question.
 *
 * Each line is a real piece of work, ticked when it has actually finished:
 * the model reading the request and its material, the catalogue being
 * searched, the workspace being checked for what it already knows. The model
 * call is the only slow one and it is the only one drawn as in progress for
 * long; the rest are quick and are shown finishing, not staged for effect.
 *
 * Then the result, in plain words: what this looks like, what is already
 * known and where from, and how many questions are left. The customer can
 * overrule the match here rather than discovering at the blueprint that it
 * built the wrong kind of thing.
 */
import { CheckCircle2, Circle, Loader, AlertTriangle, Info } from 'lucide-react';
import { SOLUTIONS, solutionByKey, QUESTIONS } from '../../../services/projectSolutions';
import { describeAnswer, type IntakeState } from '../../../services/projectIntake';

export type StageState = 'todo' | 'now' | 'done' | 'warn';
export interface Stage { key: string; label: string; state: StageState; detail?: string }

const SOURCE_NOTE: Record<string, string> = {
  prompt: 'from your request', profile: 'already in Protected Central', file: 'from your files',
  link: 'from your link', ai: 'understood by the AI', you: 'you said', default: 'chosen for you',
};

export default function Understanding({ stages, state, finished, questionCount, onChangeSolution, portfolios }: {
  portfolios: { id: string; name: string }[];
  stages: Stage[];
  state: IntakeState | null;
  finished: boolean;
  questionCount: number;
  onChangeSolution: (keys: string[]) => void;
}) {
  const known = state ? Object.entries(state.known) : [];
  const names = (state?.solutionKeys ?? []).map(k => solutionByKey(k)?.label ?? k);

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <div>
        <h2 className="wz-title">{finished ? <>Here&rsquo;s what I <span className="wz-accent">understood</span></> : <>Understanding <span className="wz-accent">your request</span></>}</h2>
        {!finished && (
          <p style={{ margin: '9px 0 0', fontSize: 14.5, color: '#6b7280', lineHeight: 1.55 }}>
            Working out what you want before asking you anything. This usually takes a few seconds.
          </p>
        )}
      </div>

      <ol className="np-stages" aria-live="polite">
        {stages.map(s => (
          <li key={s.key} className="np-stage np-rise" data-state={s.state}>
            <span className="np-stage-icon">
              {s.state === 'done' ? <CheckCircle2 size={17} color="#16a34a" />
                : s.state === 'now' ? <Loader size={17} color="#5b46e5" className="spin" />
                  : s.state === 'warn' ? <AlertTriangle size={17} color="#b45309" />
                    : <Circle size={17} color="#cbd5e1" />}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: s.state === 'now' ? 700 : 500 }}>{s.label}</span>
              {s.detail && <span style={{ display: 'block', fontSize: 12.5, color: s.state === 'warn' ? '#92400e' : '#6b7280', marginTop: 2, lineHeight: 1.5 }}>{s.detail}</span>}
            </span>
          </li>
        ))}
      </ol>

      {finished && state && (
        <div className="np-rise" style={{ display: 'grid', gap: 14 }}>
          <div style={{ padding: '15px 17px', borderRadius: 16, background: '#f6f4ff', border: '1px solid #e2ddff' }}>
            <p style={{ margin: 0, fontSize: 15.5, color: '#17191c', lineHeight: 1.55, fontWeight: 600 }}>{state.summary}</p>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#4c39d1', lineHeight: 1.5 }}>
              {state.strength === 'strong' ? `Starting from a ready-made solution: ${names[0]}, personalised for you.`
                : state.strength === 'partial' ? `Combining ${names.join(' and ')}, with anything missing built for you.`
                  : 'No ready-made solution fits exactly, so this will be built from scratch around what you described.'}
            </p>
            {state.understoodBy === 'keywords' && (
              <p style={{ margin: '8px 0 0', display: 'flex', gap: 6, fontSize: 12.5, color: '#6b7280', lineHeight: 1.5 }}>
                <Info size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                The AI could not be reached, so I matched your words to our solutions instead of reading them properly. Check this is the right one.
              </p>
            )}
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 12.5, color: '#475569', flexWrap: 'wrap' }}>
              Not right?
              <select className="np-input" style={{ width: 'auto', padding: '7px 10px', fontSize: 13 }}
                value={state.solutionKeys[0] ?? 'custom'}
                onChange={e => onChangeSolution([e.target.value])}
                aria-label="Choose a different solution">
                {SOLUTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
          </div>

          {known.length > 0 && (
            <div className="np-known">
              <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.05em', color: '#6b7280' }}>WHAT I ALREADY KNOW — NOT ASKING AGAIN</span>
              {known.map(([id, k]) => {
                const q = QUESTIONS[id] ?? state.extraQuestions.find(x => x.id === id);
                if (!q) return null;
                const text = describeAnswer(q, k.value, portfolios);
                if (!text) return null;
                return (
                  <div key={id} className="np-known-row">
                    <span>{q.prompt.replace(/\?$/, '')}:</span> <b>{text}</b> <em>{k.note ?? SOURCE_NOTE[k.source]}</em>
                  </div>
                );
              })}
            </div>
          )}

          {state.unsupported.length > 0 && (
            <div style={{ padding: '12px 14px', borderRadius: 14, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 13, color: '#92400e', lineHeight: 1.55 }}>
              <b>Worth knowing:</b> {state.unsupported.join(' ')} — that part stays with you, and the plan will say so.
            </div>
          )}

          <p style={{ margin: 0, fontSize: 14, color: '#334155' }}>
            {questionCount === 0 ? 'I have everything I need to draw up the plan.'
              : `${questionCount} quick question${questionCount === 1 ? '' : 's'} left — only the ones this project needs.`}
          </p>
        </div>
      )}
    </div>
  );
}
