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
import { useState } from 'react';
import { CheckCircle2, Circle, Loader, AlertTriangle, Info, Sparkles, Send, ChevronDown, Wand2 } from 'lucide-react';
import { SOLUTIONS, solutionByKey, QUESTIONS, GROUP_TITLE, GROUP_ORDER } from '../../../services/projectSolutions';
import { describeAnswer, type IntakeState } from '../../../services/projectIntake';

export type StageState = 'todo' | 'now' | 'done' | 'warn';
export interface Stage { key: string; label: string; state: StageState; detail?: string }

const SOURCE_NOTE: Record<string, string> = {
  prompt: 'from your request', profile: 'already in Protected Central', file: 'from your files',
  link: 'from your link', ai: 'understood by the AI', you: 'you said', default: 'chosen for you',
};

/* A question's prompt is a question ("Where are they?"); a fact needs a name.
   The commonest ones get a short noun, the rest keep their prompt. */
const FACT_NAME: Record<string, string> = {
  location: 'Where', audience: 'Who it is for', offer: 'Your offer', business: 'Your business', website: 'Website',
  contactSource: 'Contacts', prospectTrades: 'Businesses to find', prospectPlaces: 'Where to look', prospectPerDay: 'Prospects a day',
  prospectSms: 'Texts', emailGoal: 'Goal', apptChannels: 'Channels', apptFocus: 'Focus', calendar: 'Calendar', booking: 'Booking',
  platforms: 'Platforms', frequency: 'How often', blogFrequency: 'How often', sequenceLength: 'Emails in the sequence',
  contactCount: 'How many people', productCount: 'Products', socialOutputs: 'Each post', approval: 'Approval',
};

export default function Understanding({ stages, state, finished, questionCount, onChangeSolution, onCorrect, correcting = false, correction, portfolios, lists = [], openGroups = [] }: {
  portfolios: { id: string; name: string }[];
  /** The workspace's contact lists, so a chosen one is named rather than shown as an id. */
  lists?: { id: string; name: string }[];
  stages: Stage[];
  state: IntakeState | null;
  finished: boolean;
  questionCount: number;
  onChangeSolution: (keys: string[]) => void;
  /** A correction in the customer's words — "it's a med spa, and I want reminders too". */
  onCorrect: (text: string) => void;
  correcting?: boolean;
  /** What the last correction did, in a sentence. */
  correction?: { ok: boolean; text: string } | null;
  /** The topics the questions still to come are about, in order. */
  openGroups?: string[];
}) {
  const known = state ? Object.entries(state.known) : [];
  const names = (state?.solutionKeys ?? []).map(k => solutionByKey(k)?.label ?? k);
  const [fix, setFix] = useState('');
  const [browse, setBrowse] = useState(false);
  const [how, setHow] = useState(false);
  const send = () => { const t = fix.trim(); if (t.length < 3 || correcting) return; onCorrect(t); setFix(''); };
  const facts = known.map(([id, k]) => {
    const q = QUESTIONS[id] ?? state?.extraQuestions.find(x => x.id === id);
    if (!q) return null;
    const text = describeAnswer(q, k.value, portfolios, lists);
    if (!text) return null;
    return { id, name: FACT_NAME[id] ?? q.prompt.replace(/\?$/, ''), text, from: k.note ?? SOURCE_NOTE[k.source] };
  }).filter((x): x is { id: string; name: string; text: string; from: string } => !!x);
  const topics = GROUP_ORDER.filter(g => openGroups.includes(g)).map(g => GROUP_TITLE[g]);

  /* While it works, the steps are the screen. Once it has finished they are
     folded away: the customer came for the answer, and five ticked lines
     above it pushed "is this right?" below the fold. */
  const steps = (
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
  );
  const warned = stages.filter(s => s.state === 'warn');

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h2 className="wz-title">{finished ? <>Here&rsquo;s what I <span className="wz-accent">understood</span></> : <>Understanding <span className="wz-accent">your request</span></>}</h2>
        <p style={{ margin: '9px 0 0', fontSize: 14.5, color: '#6b7280', lineHeight: 1.55 }}>
          {finished ? 'Check it reads right. If anything is off, tell me below in your own words — I’ll fix it before asking you anything.'
            : 'Working out what you want before asking you anything. This usually takes a few seconds.'}
        </p>
      </div>

      {!finished && steps}

      {finished && state && (
        <div className="np-rise" style={{ display: 'grid', gap: 16 }}>
          <section className="np-understood" aria-label="Your project">
            <span className="np-eyebrow"><Sparkles size={13} /> YOUR PROJECT</span>
            <p className="np-understood-summary">{state.summary}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, color: '#6b7280' }}>
                {state.strength === 'custom' ? 'Built from scratch around what you described' : state.strength === 'partial' ? 'Combines' : 'Starts from the ready-made'}
              </span>
              {state.strength !== 'custom' && names.map(n => <span key={n} className="np-pill">{n}</span>)}
              {state.strength !== 'custom' && <span style={{ fontSize: 12.5, color: '#6b7280' }}>solution, personalised for you.</span>}
            </div>
            {state.understoodBy === 'keywords' && (
              <p style={{ margin: 0, display: 'flex', gap: 6, fontSize: 12.5, color: '#6b7280', lineHeight: 1.5 }}>
                <Info size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                The AI could not be reached, so I matched your words to our solutions instead of reading them properly. Check this is right.
              </p>
            )}

            {/* The correction box — in the customer's words, not a dropdown of
                solution names they would have to know already. */}
            <div className="np-fix">
              <label htmlFor="np-fix" className="np-fix-label"><Wand2 size={14} /> Not quite right? Tell me what to change</label>
              <div className="np-fix-row">
                <input id="np-fix" className="np-input" value={fix} disabled={correcting} data-field="intake.correction"
                  placeholder="e.g. “It’s for a med spa in Miami — also remind people the day before”"
                  onChange={e => setFix(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send(); } }} />
                <button type="button" className="np-fix-send" onClick={send} disabled={correcting || fix.trim().length < 3} aria-label="Fix it">
                  {correcting ? <Loader size={15} className="spin" /> : <Send size={15} />} <span>{correcting ? 'Fixing…' : 'Fix it'}</span>
                </button>
              </div>
              {correction && (
                <span style={{ fontSize: 12.5, color: correction.ok ? '#0f7b3d' : '#9a3412', lineHeight: 1.5 }}>{correction.text}</span>
              )}
              <button type="button" className="np-skip" style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => setBrowse(b => !b)} aria-expanded={browse}>
                {browse ? 'Hide the ready-made solutions' : 'Or start from a different ready-made solution'} <ChevronDown size={12} style={{ transform: browse ? 'rotate(180deg)' : undefined }} />
              </button>
              {browse && (
                <div className="np-opts" role="radiogroup" aria-label="Ready-made solutions">
                  {SOLUTIONS.map(s => (
                    <button key={s.key} type="button" role="radio" className="np-opt np-opt-sm" aria-checked={state.solutionKeys[0] === s.key}
                      aria-pressed={state.solutionKeys[0] === s.key} onClick={() => onChangeSolution([s.key])}>{s.label}</button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {facts.length > 0 && (
            <section className="np-known" aria-label="What I already know">
              <span className="np-eyebrow"><CheckCircle2 size={13} color="#16a34a" /> ALREADY KNOWN — I WON’T ASK AGAIN</span>
              <dl className="np-facts">
                {facts.map(f => (
                  <div key={f.id} className="np-fact">
                    <dt>{f.name}</dt>
                    <dd><b>{f.text}</b> <em>{f.from}</em></dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {state.unsupported.length > 0 && (
            <div style={{ padding: '12px 14px', borderRadius: 14, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 13, color: '#92400e', lineHeight: 1.55 }}>
              <b>Worth knowing:</b> {state.unsupported.join(' ')} — that part stays with you, and the plan will say so.
            </div>
          )}

          <section className="np-next" aria-label="What happens next">
            <b>{questionCount === 0 ? 'Next: the plan' : `Next: ${questionCount} quick question${questionCount === 1 ? '' : 's'}`}</b>
            <span>
              {questionCount === 0 ? 'I have everything I need to draw up the plan.'
                : topics.length ? `About ${topics.join(', ').toLowerCase()} — each with suggestions and “Let AI decide”.`
                  : 'Only the ones this project needs, each with suggestions and “Let AI decide”.'}
            </span>
          </section>

          <button type="button" className="np-skip" style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => setHow(h => !h)} aria-expanded={how}>
            {how ? 'Hide' : 'Show'} how I worked this out{warned.length ? ` (${warned.length} note${warned.length === 1 ? '' : 's'})` : ''} <ChevronDown size={12} style={{ transform: how ? 'rotate(180deg)' : undefined }} />
          </button>
          {how && steps}
        </div>
      )}
    </div>
  );
}
