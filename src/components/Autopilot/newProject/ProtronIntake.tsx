/**
 * The first screens of a new business workspace, with Protron.
 *
 *   name       "What is your company or business name?"
 *   solutions  Start with a ready-made solution — any number, combined, with
 *              the customer's own instructions and "Ask Protron to recommend"
 *   talk       a short interview, one question at a time, each skippable
 *   prompt     the instruction Protron wrote: edit it, add to it, write it
 *              again, or approve it
 *
 * Approving hands the instruction and the chosen solutions to the wizard's
 * own Understand step (NewProject.tsx `approveInstruction`) — the same path a
 * typed request takes. The logic is in services/protron/intake.ts; this file
 * holds the screens and the state between them (`useProtronIntake`), which the
 * wizard owns so its footer button can drive the steps.
 *
 * "I'd rather describe it myself" leads to the original box (Describe.tsx),
 * which is unchanged.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Megaphone, Search, Mail, TrendingUp, RefreshCcw, PenLine, Workflow, Rocket, Repeat, Wand2,
  Sparkles, Check, Loader, RotateCcw, Plus, ChevronDown, ChevronUp, Info, SkipForward,
} from 'lucide-react';
import ProtronAvatar from '../../Protron/ProtronAvatar';
import { readFacts } from '../../../services/protron/facts';
import { solutionByKey } from '../../../services/projectSolutions';
import {
  START_CARDS, MORE_SOLUTIONS, EMPTY_BRIEF, chosenKeys, nextStep, recommendCards, writeInstruction, MAX_INSTRUCTION,
  type Brief,
} from '../../../services/protron/intake';

export type IntroStep = 'name' | 'solutions' | 'talk' | 'prompt' | 'manual';

const CARD_ICON: Record<string, typeof Search> = {
  social: Megaphone, leads: Search, outreach: Mail, crm: TrendingUp, followup: Repeat,
  content: PenLine, process: Workflow, campaigns: Rocket, reactivation: RefreshCcw, custom: Wand2,
};

export function useProtronIntake(initialCompany: string, start: IntroStep) {
  const [step, setStep] = useState<IntroStep>(start);
  /* A business name already given — at sign-up, on the workspace, in
     Settings, or to Protron — is not asked for again (the owner's brief). */
  const [brief, setBriefState] = useState<Brief>(() => ({ ...EMPTY_BRIEF, company: initialCompany || readFacts().businessName }));
  const ref = useRef(brief);
  const setBrief = useCallback((b: Brief) => { ref.current = b; setBriefState(b); }, []);
  const [busy, setBusy] = useState<'' | 'asking' | 'writing' | 'recommending'>('');
  const [note, setNote] = useState('');
  const [recs, setRecs] = useState<{ key: string; why: string }[]>([]);
  const [cardWhy, setCardWhy] = useState('');
  const [instruction, setInstruction] = useState('');
  const [talkDone, setTalkDone] = useState(false);

  const askNext = useCallback(async (b: Brief) => {
    setBusy('asking');
    const r = await nextStep(b);
    setBusy('');
    setNote(r.offline ? (r.error ? `${r.error} — asking the standard questions instead.` : 'The AI is not answering, so I am asking the standard questions.') : '');
    if (r.recommend.length) setRecs(prev => [...prev, ...r.recommend.filter(x => !prev.some(p => p.key === x.key))]);
    if (r.done || !r.ask) {
      setTalkDone(true);
      if (r.ask) setBrief({ ...ref.current, talk: [...ref.current.talk, { role: 'protron', text: r.ask }] });
      return;
    }
    setBrief({ ...ref.current, talk: [...ref.current.talk, { role: 'protron', text: r.ask, quick: r.quick }] });
  }, [setBrief]);

  const startTalk = useCallback(() => {
    setStep('talk');
    if (!ref.current.talk.length) void askNext(ref.current);
  }, [askNext]);

  const answer = useCallback((text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    const b = { ...ref.current, talk: [...ref.current.talk, { role: 'user' as const, text: t.slice(0, 1200) }] };
    setBrief(b);
    void askNext(b);
  }, [busy, askNext, setBrief]);

  const write = useCallback(async (extra = '') => {
    setStep('prompt');
    setBusy('writing');
    const r = await writeInstruction(ref.current, extra);
    setBusy('');
    setInstruction(r.text);
    setNote(r.offline ? (r.error ? `${r.error} — this was put together from your answers instead.` : 'The AI is not answering, so this was put together from your answers. Edit it freely.') : '');
  }, []);

  const recommend = useCallback(async () => {
    setBusy('recommending');
    const r = await recommendCards(ref.current);
    setBusy('');
    setCardWhy(r.why);
    if (r.ids.length) setBrief({ ...ref.current, cards: [...new Set([...ref.current.cards, ...r.ids])] });
  }, [setBrief]);

  return { step, setStep, brief, setBrief, busy, note, recs, setRecs, cardWhy, instruction, setInstruction, talkDone, startTalk, answer, write, recommend, keys: chosenKeys(brief) };
}

export type ProtronIntakeState = ReturnType<typeof useProtronIntake>;

export default function ProtronIntake({ p, onManual }: { p: ProtronIntakeState; onManual: () => void }) {
  const { step, brief, setBrief, busy } = p;
  const [firstName] = useState(() => readFacts().firstName);
  const [more, setMore] = useState(() => brief.more.length > 0);
  const [reply, setReply] = useState('');
  const [extra, setExtra] = useState('');
  const nameBox = useRef<HTMLInputElement>(null);
  const replyBox = useRef<HTMLTextAreaElement>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { if (step === 'name') nameBox.current?.focus(); if (step === 'talk') replyBox.current?.focus(); }, [step]);
  useEffect(() => { logEnd.current?.scrollIntoView({ block: 'nearest' }); }, [brief.talk.length, busy]);

  const toggleCard = (id: string) => setBrief({ ...brief, cards: brief.cards.includes(id) ? brief.cards.filter(x => x !== id) : [...brief.cards, id] });
  const toggleMore = (key: string) => setBrief({ ...brief, more: brief.more.includes(key) ? brief.more.filter(x => x !== key) : [...brief.more, key] });
  const sendReply = (t: string) => { p.answer(t); setReply(''); };

  const head = (title: React.ReactNode, sub: string) => (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <span className="np-protron-face"><ProtronAvatar size={48} state={busy ? 'thinking' : 'idle'} /></span>
      <div style={{ minWidth: 0 }}>
        <h2 className="wz-title">{title}</h2>
        <p style={{ margin: '8px 0 0', fontSize: 15, color: '#6b7280', lineHeight: 1.55, maxWidth: '60ch' }}>{sub}</p>
      </div>
    </div>
  );

  if (step === 'name') {
    return (
      <div style={{ display: 'grid', gap: 22 }}>
        {head(
          brief.company.trim()
            ? <>{firstName ? `${firstName}, is` : 'Is'} this your <span className="wz-accent">business name</span>?</>
            : <>{firstName ? `Hi ${firstName} — what` : 'What'} is your company or <span className="wz-accent">business name</span>?</>,
          brief.company.trim()
            ? "I'm Protron, your AI business manager. I filled in the name you gave us — change it if this business workspace is for another business. Then a few short questions, and you approve the plan before anything is built."
            : "I'm Protron, your AI business manager. I'll ask a few short questions and write the plan for AI Autopilot — you approve it before anything is built.",
        )}
        <input
          ref={nameBox}
          className="np-input"
          data-field="protron.company"
          aria-label="Company or business name"
          placeholder="e.g. Lone Star Roofing"
          value={brief.company}
          maxLength={120}
          onChange={e => setBrief({ ...brief, company: e.target.value })}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); p.setStep('solutions'); } }}
          style={{ fontSize: 17, padding: '14px 16px', maxWidth: 520 }}
        />
        <button type="button" className="np-link" onClick={onManual}>I&rsquo;d rather describe it myself</button>
      </div>
    );
  }

  if (step === 'solutions') {
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        {head(<>Start with a <span className="wz-accent">ready-made solution</span></>, `Pick one or several for ${brief.company.trim() || 'your business'} — they are combined into one business workspace. Or describe something of your own below.`)}
        <div className="np-cards" role="group" aria-label="Ready-made solutions">
          {START_CARDS.map(c => {
            const Icon = CARD_ICON[c.id] ?? Sparkles;
            const on = brief.cards.includes(c.id);
            return (
              <button key={c.id} type="button" className="np-sol" aria-pressed={on} data-custom={c.id === 'custom' ? '1' : '0'} onClick={() => toggleCard(c.id)}>
                <span className="np-sol-icon">{on ? <Check size={17} /> : <Icon size={17} />}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 750, color: '#17191c' }}>{c.label}</span>
                  <span style={{ display: 'block', fontSize: 12, color: '#6b7280', marginTop: 3, lineHeight: 1.45 }}>{c.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>

        <button type="button" className="np-link" aria-expanded={more} onClick={() => setMore(m => !m)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {more ? <ChevronUp size={15} /> : <ChevronDown size={15} />} {more ? 'Fewer solutions' : `${MORE_SOLUTIONS.length} more ready-made solutions`}
        </button>
        {more && (
          <div className="np-cards" role="group" aria-label="More ready-made solutions">
            {MORE_SOLUTIONS.map(s => {
              const on = brief.more.includes(s.key);
              return (
                <button key={s.key} type="button" className="np-sol" aria-pressed={on} onClick={() => toggleMore(s.key)}>
                  <span className="np-sol-icon">{on ? <Check size={17} /> : <Sparkles size={17} />}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 750, color: '#17191c' }}>{s.label}</span>
                    <span style={{ display: 'block', fontSize: 12, color: '#6b7280', marginTop: 3, lineHeight: 1.45 }}>{s.blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <label style={{ display: 'grid', gap: 7 }}>
          <span style={{ fontSize: 14, fontWeight: 750, color: '#17191c' }}>Your own instructions <span style={{ fontWeight: 500, color: '#6b7280' }}>(optional)</span></span>
          <textarea
            className="np-input"
            data-field="protron.custom"
            rows={3}
            maxLength={1500}
            value={brief.custom}
            placeholder="e.g. We get roofing enquiries but forget to follow up on estimates."
            onChange={e => setBrief({ ...brief, custom: e.target.value })}
          />
        </label>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="np-tool" disabled={busy === 'recommending'} onClick={() => void p.recommend()}>
            {busy === 'recommending' ? <Loader size={14} className="spin" /> : <Sparkles size={14} />} Ask Protron to recommend
          </button>
          {brief.cards.length + brief.more.length > 0 && (
            <span style={{ fontSize: 13, color: '#475569' }}>{brief.cards.length + brief.more.length} chosen</span>
          )}
        </div>
        {p.cardWhy && <p className="np-protron-note"><Info size={14} /> {p.cardWhy}</p>}
      </div>
    );
  }

  if (step === 'talk') {
    const last = brief.talk[brief.talk.length - 1];
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        {head(<>Tell Protron about <span className="wz-accent">{brief.company.trim() || 'your business'}</span></>, "Only what changes the plan. Skip anything — I'll choose a sensible default and say so.")}
        <div className="np-talk" aria-live="polite">
          {brief.talk.map((t, i) => (
            <div key={i} className={t.role === 'protron' ? 'np-talk-bot' : 'np-talk-you'}>{t.text}</div>
          ))}
          {busy === 'asking' && <div className="np-talk-bot" role="status"><Loader size={14} className="spin" /> Thinking…</div>}
          <div ref={logEnd} />
        </div>
        {p.note && <p className="np-protron-note"><Info size={14} /> {p.note}</p>}

        {p.recs.length > 0 && (
          <div className="np-protron-recs">
            <b style={{ fontSize: 13 }}>Protron suggests adding</b>
            {p.recs.map(r => (
              <div key={r.key} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ flex: '1 1 220px', fontSize: 13, color: '#334155' }}><b>{solutionByKey(r.key)?.label}</b> — {r.why}</span>
                <button type="button" className="np-tool" onClick={() => { setBrief({ ...brief, more: [...new Set([...brief.more, r.key])] }); p.setRecs(p.recs.filter(x => x.key !== r.key)); }}><Plus size={14} /> Include it</button>
                <button type="button" className="np-link" onClick={() => p.setRecs(p.recs.filter(x => x.key !== r.key))}>No thanks</button>
              </div>
            ))}
          </div>
        )}

        {!p.talkDone ? (
          <>
            {last?.role === 'protron' && last.quick && last.quick.length > 0 && busy !== 'asking' && (
              <div className="np-quick">
                {last.quick.map(q => <button key={q} type="button" className="np-chip-btn" onClick={() => sendReply(q)}>{q}</button>)}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                ref={replyBox}
                className="np-input"
                data-field="protron.answer"
                aria-label="Your answer"
                rows={2}
                maxLength={1200}
                value={reply}
                disabled={busy === 'asking'}
                placeholder="Type your answer…"
                onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(reply); } }}
                style={{ flex: 1 }}
              />
              <button type="button" className="np-tool" disabled={!reply.trim() || busy === 'asking'} onClick={() => sendReply(reply)}>Answer</button>
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <button type="button" className="np-link" disabled={busy === 'asking'} onClick={() => sendReply('Skip — use a sensible default.')}><SkipForward size={13} /> Skip this question</button>
            </div>
          </>
        ) : (
          <p className="np-protron-note" style={{ background: '#ecfdf5', color: '#065f46', borderColor: '#a7f3d0' }}><Check size={14} /> That&rsquo;s enough to write the plan. Press <b>Write my instruction</b>.</p>
        )}
      </div>
    );
  }

  /* prompt */
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {head(<>Your instruction for <span className="wz-accent">AI Autopilot</span></>, "Read it, change anything, then approve it. AI Autopilot reads it next and asks only what is still missing — nothing is built until you press Build.")}
      {busy === 'writing' ? (
        <div className="np-talk" role="status" style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#475569' }}><Loader size={15} className="spin" /> Protron is writing your instruction…</div>
      ) : (
        <textarea
          className="np-input np-instruction"
          data-field="protron.instruction"
          aria-label="Instruction for AI Autopilot"
          rows={13}
          maxLength={MAX_INSTRUCTION}
          value={p.instruction}
          onChange={e => p.setInstruction(e.target.value)}
        />
      )}
      {p.note && <p className="np-protron-note"><Info size={14} /> {p.note}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="np-input" style={{ flex: '1 1 240px', padding: '10px 12px' }} value={extra} maxLength={800}
          aria-label="Something to add" placeholder="Add something, e.g. “we only work weekdays”"
          onChange={e => setExtra(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && extra.trim()) { e.preventDefault(); void p.write(extra); setExtra(''); } }} />
        <button type="button" className="np-tool" disabled={!extra.trim() || busy === 'writing'} onClick={() => { void p.write(extra); setExtra(''); }}><Plus size={14} /> Add and rewrite</button>
        <button type="button" className="np-tool" disabled={busy === 'writing'} onClick={() => void p.write()}><RotateCcw size={14} /> Write it again</button>
      </div>
      {p.keys.length > 0 && (
        <p style={{ margin: 0, fontSize: 12.5, color: '#6b7280' }}>
          Built from: {p.keys.map(k => solutionByKey(k)?.label ?? 'Custom').join(' + ')}
        </p>
      )}
    </div>
  );
}
