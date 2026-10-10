/**
 * Suggested answers under a typed question — chips to pick from (several at
 * once where the answer is a list), and "Let AI decide", which fills in what
 * the AI would choose and says why.
 *
 * ── Where the ideas come from ──
 *
 * Shown at once from services/answerIdeas.ts (the trade the request names),
 * then replaced by the AI's own for this business when `suggest` answers —
 * one request per screen, remembered for the visit so going Back does not
 * ask again. Without the AI the first set simply stays, which is why it
 * exists: an empty box with an example from another trade in it was the
 * screen the owner was looking at.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, Loader, Plus, Sparkles } from 'lucide-react';
import { ideasFor, IDEA_QUESTIONS, type Ideas } from '../../../services/answerIdeas';
import { suggestAnswers } from '../../../services/intake';
import type { Question } from '../../../services/projectSolutions';

/** How each answer joins several picks — the way its reader splits them. */
export const SEP: Record<string, string> = { prospectTrades: ', ', topics: ', ', designStyle: ', ', prospectPlaces: '; ' };
const sepOf = (id: string) => SEP[id] ?? '; ';
export const partsOf = (id: string, v: string) => v.split(sepOf(id).trim()).map(x => x.trim()).filter(Boolean);

/* One AI request per screen per visit. */
const asked = new Map<string, Promise<Record<string, Ideas>>>();

export interface IdeaInputs {
  prompt: string;
  business: { companyName?: string; description?: string; website?: string };
  answers: Record<string, string>;
}

/**
 * Ideas for the typed questions on one screen: the offline set at once, the
 * AI's when it comes. `busy` while the AI is being asked.
 */
export function useIdeas(questions: Question[], inputs: IdeaInputs): { ideas: Record<string, Ideas>; busy: boolean; byAi: boolean } {
  const qs = questions.filter(q => IDEA_QUESTIONS.has(q.id));
  const ids = qs.map(q => q.id).join(',');
  /* The offline ideas depend on what has been answered (a place found on the
     previous screen narrows "nearby"); the AI's are asked once per screen. */
  const local = useMemo(() => {
    const out: Record<string, Ideas> = {};
    for (const q of qs) {
      const i = ideasFor(q.id, { prompt: inputs.prompt, description: inputs.business.description, answers: inputs.answers });
      if (i) out[q.id] = i;
    }
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, inputs.prompt, inputs.business.description, inputs.answers.location, inputs.answers.prospectPlaces]);
  const [ai, setAi] = useState<Record<string, Ideas>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!qs.length) return;
    const key = `${inputs.prompt}|${inputs.business.companyName ?? ''}|${ids}`;
    let p = asked.get(key);
    if (!p) {
      p = suggestAnswers({
        prompt: inputs.prompt,
        business: inputs.business,
        questions: qs.map(q => ({ id: q.id, prompt: q.prompt, help: q.help, many: true })),
        answers: inputs.answers,
      }).then(r => r.suggestions);
      asked.set(key, p);
    }
    let alive = true;
    setBusy(true);
    void p.then(s => { if (alive) { setAi(s); setBusy(false); } });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  const merged = { ...local };
  for (const [id, s] of Object.entries(ai)) if (s?.options?.length && qs.some(q => q.id === id)) merged[id] = s;
  return { ideas: merged, busy, byAi: Object.keys(ai).length > 0 };
}

/**
 * The chips and the AI button for one question. `value` is the answer as
 * stored; picking a chip adds it to (or takes it out of) that answer.
 */
export function SuggestChips({ id, value, ideas, busy, fromAi, onChange }: {
  id: string; value: string; ideas: Ideas | undefined; busy: boolean; fromAi: boolean;
  onChange: (next: string, decided?: boolean) => void;
}) {
  if (!ideas && !busy) return null;
  const parts = partsOf(id, value);
  const has = (o: string) => parts.some(p => p.toLowerCase() === o.toLowerCase());
  const toggle = (o: string) => {
    const next = has(o) ? parts.filter(p => p.toLowerCase() !== o.toLowerCase()) : [...parts, o];
    onChange(next.join(sepOf(id)));
  };
  const pickValue = ideas ? ideas.pick.join(sepOf(id)) : '';
  const decided = !!ideas && !!value && value === pickValue;
  return (
    <div className="np-suggest">
      <div className="np-suggest-head">
        <Sparkles size={13} />
        <span>{fromAi ? 'Suggested for your business' : 'Suggestions'} — pick one or more{busy ? '' : ', or type your own'}</span>
        {busy && <span className="np-suggest-busy"><Loader size={12} className="spin" /> asking the AI for better ones…</span>}
      </div>
      {ideas && (
        <div className="np-opts">
          {ideas.options.map(o => {
            const on = has(o);
            return (
              <button key={o} type="button" className="np-opt np-opt-sm" aria-pressed={on} onClick={() => toggle(o)}>
                {on ? <Check size={11} /> : <Plus size={11} />} {o}
              </button>
            );
          })}
          <button type="button" className="np-opt np-opt-sm" data-ai="1" aria-pressed={decided}
            onClick={() => onChange(decided ? '' : pickValue, !decided)}>
            <Sparkles size={12} /> Let AI decide
          </button>
        </div>
      )}
      {decided && ideas?.why && (
        <span className="np-suggest-why"><b>Why:</b> {ideas.why}</span>
      )}
    </div>
  );
}
