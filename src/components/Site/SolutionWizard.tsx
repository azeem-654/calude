/**
 * "Find my solution" — the public site's wizard.
 *
 * A visitor says what they want their business to accomplish, answers the
 * few questions that are still open, and sees the project Protected Central
 * would build — workflows drawn the way they run — before they are asked for
 * an address. "Build this in my free account" takes the plan to sign-up, and
 * the app builds it on arrival (services/sitePlan.ts has how the plan travels;
 * Autopilot's NewProject `seed` has what happens there).
 *
 * The judgement is the app's own — matching, questions, blueprint — so what is
 * shown here is what gets built. The understanding is the AI's when the site's
 * allowance has it (routes/sitePlan.ts) and plain word matching when not, and
 * the screen says which.
 *
 * Progress is kept in this browser (`pc_site_wizard`) so somebody who leaves
 * can carry on; nothing is sent anywhere until they press the button, apart
 * from their request to the understanding step — and the funnel counts, which
 * carry no words at all (services/funnel.ts).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, ArrowRight, Check, X, Loader, Sparkles, Mic, Square, Paperclip, Globe, Target, Repeat,
  Image as ImageIcon, Calendar, Store, LifeBuoy, ClipboardList, Building2, FileText, RefreshCw, Bot,
  Workflow, ShieldCheck, Wand2, PenLine, CircleDashed,
} from 'lucide-react';
import { appHref } from '../../services/hosts';
import {
  applies, applyOps, buildBlueprint, initialState, parseEdit, withDefaults, urlsIn,
  type Attachment, type Blueprint, type IntakeState, type KnownSource, type LinkRef, type WorkspaceFacts,
} from '../../services/projectIntake';
import { GROUP_TITLE, QUESTIONS, REQUIREMENT_INFO, solutionByKey, CUSTOM, type Question } from '../../services/projectSolutions';
import { setSiteIntake, understand } from '../../services/intake';
import {
  SITE_SHORTCUTS, buyersFor, clearProgress, encodePlan, loadProgress, planOf, saveProgress, seedState,
  answerOnSite, siteAskable, siteScreens, withUnderstanding, yourTradeIn, type SitePlan,
} from '../../services/sitePlan';
import { track } from '../../services/funnel';
import { readAttachment } from '../Autopilot/newProject/attachments';
import { defaultLocale, useVoiceInput } from '../Autopilot/voice/useVoiceInput';
import WorkflowCanvas from '../Autopilot/WorkflowCanvas';
import './solutionWizard.css';

type Step = 'intent' | 'understand' | 'questions' | 'business' | 'solution';

const NO_WS: WorkspaceFacts = { portfolios: [], workspace: null };

const ICONS: Record<string, (p: { size?: number }) => ReactNode> = {
  target: Target, repeat: Repeat, image: ImageIcon, calendar: Calendar, store: Store, life: LifeBuoy,
  clipboard: ClipboardList, building: Building2, file: FileText, refresh: RefreshCw, sparkles: Sparkles,
};

const EXAMPLES = [
  'I need more commercial roofing leads in Dallas.',
  'I want daily social posts for my dental clinic.',
  'I have 70 products and want an online store.',
  'Follow up automatically with old customers.',
];

interface Stage { label: string; state: 'now' | 'done' | 'warn' }

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const normalUrl = (u: string) => { const t = u.trim(); if (!t) return ''; return /^https?:\/\//i.test(t) ? t : `https://${t}`; };
const isUrl = (u: string) => /^https?:\/\/[^\s/]+\.[^\s]{2,}$/.test(u);
const companyOf = (st: IntakeState): string => {
  const n = String(st.known.bizName?.value ?? '').trim();
  if (n) return n;
  const w = String(st.known.website?.value ?? '');
  const h = host(w).split('.')[0];
  return w && h ? h.split(/[-_]/).map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(' ') : '';
};

export default function SolutionWizard({ onClose, initialPick = '' }: { onClose: () => void; initialPick?: string }) {
  /* ── Where we are ── */
  const [step, setStep] = useState<Step>('intent');
  const [prompt, setPrompt] = useState(() => (initialPick ? SITE_SHORTCUTS.find(s => s.key === initialPick)?.seed ?? '' : ''));
  const [picked, setPicked] = useState(initialPick);
  const [website, setWebsite] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [fileNote, setFileNote] = useState('');
  const [state, setState] = useState<IntakeState | null>(null);
  const [asked, setAsked] = useState<string[]>([]);
  const [screenIdx, setScreenIdx] = useState(0);
  const [stages, setStages] = useState<Stage[]>([]);
  const [understood, setUnderstood] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const [profileHint, setProfileHint] = useState<Record<string, string>>({});
  const [resume, setResume] = useState(() => loadProgress());
  const [editText, setEditText] = useState('');
  const [editSaid, setEditSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const [wfIdx, setWfIdx] = useState(0);
  const dialog = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSiteIntake(true);
    track('wizard_started', { solution: initialPick || undefined });
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { setSiteIntake(false); document.body.style.overflow = prev; };
  }, [initialPick]);

  /* A resumable session is only worth offering if it got past the first box. */
  useEffect(() => { if (resume && (resume.step === 'intent' || !resume.plan)) setResume(null); }, [resume]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* Each step starts at the top of the card, not wherever the last one was scrolled. */
  useEffect(() => { dialog.current?.querySelector('.sw-body')?.scrollTo({ top: 0 }); }, [step, screenIdx]);

  const links: LinkRef[] = useMemo(() => (isUrl(normalUrl(website)) ? [{ url: normalUrl(website), role: 'website' }] : []), [website]);

  /* ── Kept in this browser as it goes ── */
  useEffect(() => {
    if (step === 'intent' && !state) return;
    saveProgress({ step, prompt, picked, website, asked, screen: screenIdx, plan: state ? planOf(state, picked) : null });
  }, [step, prompt, picked, website, asked, screenIdx, state]);

  const screens = useMemo(() => (state ? siteScreens(state, asked) : []), [state, asked]);
  const screen = screens[Math.min(screenIdx, Math.max(0, screens.length - 1))];

  const bp: Blueprint | null = useMemo(() => (state ? buildBlueprint(withDefaults(state), {
    companyName: companyOf(state), website: String(state.known.website?.value ?? ''), files: [], links,
  }) : null), [state, links]);

  /* ── Understanding ── */
  const runUnderstanding = async () => {
    const text = prompt.trim();
    const urls = [...new Set([...links.map(l => l.url), ...urlsIn(text)])].slice(0, 1);
    const base = initialState(text, picked || undefined, NO_WS, files, links);
    let cur: Stage[] = [
      { label: 'Reading what you asked for', state: 'now' },
      ...(urls.length ? [{ label: `Reading ${host(urls[0])}`, state: 'now' as const }] : []),
      ...(files.length ? [{ label: `Looking at ${files.length === 1 ? files[0].name : `${files.length} files`}`, state: 'now' as const }] : []),
    ];
    setStages(cur); setUnderstood(false); setAiNote('');
    const r = await understand({ prompt: text, files, urls, candidates: base.solutionKeys });
    let st = base;
    if (r.ok && r.understanding) {
      st = withUnderstanding(base, r.understanding, picked, NO_WS, files, links);
      const p = r.understanding.profile ?? {};
      setProfileHint({ companyName: p.companyName ?? '', description: p.description ?? '', audience: p.audience ?? '' });
    } else {
      setAiNote(r.noAi ? 'The AI is busy right now, so I matched your words to our solutions instead.' : 'The AI could not be reached, so I matched your words instead.');
    }
    if (links.length && !st.known.website) st = { ...st, known: { ...st.known, website: { value: links[0].url, source: 'link', note: 'the website you gave' } } };
    const site = urls.length ? r.sources.find(s => s.what === urls[0]) : null;
    cur = cur.map((s, i) => (i === 0 ? { ...s, state: r.ok ? 'done' : 'warn' } : s.label.startsWith('Reading ') && site && !site.ok ? { ...s, state: 'warn', label: `Could not read ${host(urls[0])} — that is fine, it is read again later` } : { ...s, state: 'done' }));
    cur = [...cur, { label: 'Matching it to Protected Central solutions and templates', state: 'done' }, { label: 'Working out the few things still needed', state: 'done' }];
    setStages(cur);
    setState(st);
    setUnderstood(true);
    track('wizard_intent_submitted', { solution: st.solutionKeys[0] });
  };

  const startQuestions = () => {
    if (!state) return;
    const ids = siteAskable(state);
    setAsked(ids);
    setScreenIdx(0);
    setStep(siteScreens(state, ids).length ? 'questions' : 'business');
  };

  /* ── Answering ── */
  const answer = (id: string, value: string | string[] | null, source: KnownSource = 'you') => {
    setState(s => (s ? answerOnSite(s, id, value, source) : s));
    track('wizard_question_answered', { solution: state?.solutionKeys[0] });
  };

  const screenOpen = (sc: typeof screen) => !!sc && !!state && sc.questions.some(q => {
    if (q.need !== 'required') return false;
    const v = state.known[q.id]?.value;
    return v === undefined || (Array.isArray(v) ? !v.length : !String(v).trim());
  });

  const toSolution = () => {
    setStep('solution');
    track('wizard_completed', { solution: state?.solutionKeys[0] });
    track('solution_viewed', { solution: state?.solutionKeys[0] });
  };

  const next = () => {
    if (step === 'intent') {
      if (prompt.trim().length < 6 && !picked) return;
      if (!prompt.trim() && picked) setPrompt(SITE_SHORTCUTS.find(s => s.key === picked)?.seed || 'Something custom');
      setStep('understand');
      void runUnderstanding();
      return;
    }
    if (step === 'understand') { if (understood) startQuestions(); return; }
    if (step === 'questions') {
      if (screenOpen(screen)) return;
      if (screenIdx + 1 < screens.length) setScreenIdx(i => i + 1); else setStep('business');
      return;
    }
    if (step === 'business') toSolution();
  };

  const back = () => {
    if (step === 'understand') setStep('intent');
    else if (step === 'questions') { if (screenIdx > 0) setScreenIdx(i => i - 1); else setStep('understand'); }
    else if (step === 'business') { if (screens.length) { setScreenIdx(screens.length - 1); setStep('questions'); } else setStep('understand'); }
    else if (step === 'solution') setStep('business');
  };

  const continueSaved = () => {
    if (!resume?.plan) return;
    setPrompt(resume.prompt); setPicked(resume.picked); setWebsite(resume.website);
    setState(seedState(resume.plan, NO_WS));
    setAsked(resume.asked); setScreenIdx(resume.screen); setUnderstood(true);
    setStages([{ label: 'Picked up where you left off', state: 'done' }]);
    setStep((['understand', 'questions', 'business', 'solution'].includes(resume.step) ? resume.step : 'understand') as Step);
    setResume(null);
  };

  /* ── Build it ── */
  const build = () => {
    if (!state) return;
    /* The name shown on the plan is the one the project gets — unless it was
       drawn without the business's name, which the app then asks for. */
    const plan: SitePlan = planOf({ ...state, name: state.name || (companyOf(state) ? bp?.name ?? '' : '') }, picked);
    track('trial_cta_clicked', { solution: state.solutionKeys[0] });
    track('signup_started', { solution: state.solutionKeys[0] });
    clearProgress();
    window.location.assign(`${appHref('/signup')}#plan=${encodePlan(plan)}`);
  };

  const applyEdit = () => {
    if (!state || !bp || !editText.trim()) return;
    const parsed = parseEdit(editText, state, bp);
    if (parsed) {
      setState(s => (s ? applyOps(s, parsed.ops) : s));
      setEditSaid({ ok: true, text: `Done: ${parsed.said}.` });
      setEditText('');
      track('solution_edited', { solution: state.solutionKeys[0] });
    } else {
      setEditSaid({ ok: false, text: 'I could not work that out here. Try "three posts a week", "add LinkedIn", "make approval mandatory" — or change your answers with Edit my plan.' });
    }
  };

  /* ── The footer button ── */
  const blocker = step === 'intent' ? (prompt.trim().length < 6 && !picked ? 'Say what you would like, or pick one below' : '')
    : step === 'understand' ? (understood ? '' : 'Understanding…')
      : step === 'questions' && screenOpen(screen) ? 'Answer this one, or let AI decide' : '';
  const ctaLabel = blocker || (step === 'intent' ? 'Continue'
    : step === 'understand' ? (screens.length || (state && siteAskable(state).length) ? 'Answer a few quick questions' : 'Continue')
      : step === 'questions' ? (screenIdx + 1 < screens.length ? 'Next' : 'Almost done')
        : step === 'business' ? 'Show me my plan' : '');

  const progress = step === 'intent' ? 0.08 : step === 'understand' ? 0.22
    : step === 'questions' ? 0.3 + 0.45 * ((screenIdx + 1) / Math.max(1, screens.length)) : step === 'business' ? 0.85 : 1;

  /* Portalled to <body>: the site's sections carry transforms and filters,
     and any of them makes `position: fixed` relative to itself — the card
     then sat at the foot of the page instead of over it. */
  return createPortal(
    <div className="sw-scrim" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sw-card" role="dialog" aria-modal="true" aria-label="Find my solution" ref={dialog} data-step={step}>
        <header className="sw-head">
          <span className="sw-brand"><Sparkles size={15} /> Find my solution</span>
          <div className="sw-bar" aria-hidden="true"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          <button type="button" className="sw-x" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="sw-body">
          <div key={`${step}-${screenIdx}`} className="sw-rise">
            {step === 'intent' && (
              <>
                {resume && (
                  <div className="sw-resume">
                    <span><b>Continue where you left off?</b> “{resume.prompt.slice(0, 80)}{resume.prompt.length > 80 ? '…' : ''}”</span>
                    <span className="sw-resume-btns">
                      <button type="button" className="sw-btn sw-btn-primary sw-btn-sm" onClick={continueSaved}>Continue</button>
                      <button type="button" className="sw-btn sw-btn-ghost sw-btn-sm" onClick={() => { clearProgress(); setResume(null); }}>Start again</button>
                    </span>
                  </div>
                )}
                <h2 className="sw-title">What would you like your business to accomplish?</h2>
                <p className="sw-sub">Say it the way you would to a person. Protected Central works out the rest and shows you the system it would build — before you sign up.</p>
                <div className="sw-ask">
                  <textarea className="sw-textarea" value={prompt} autoFocus rows={3} maxLength={1500}
                    placeholder={EXAMPLES[0]} aria-label="What would you like your business to accomplish?"
                    onChange={e => setPrompt(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) next(); }} />
                  <div className="sw-ask-tools">
                    <SiteMic onText={t => setPrompt(p => (p.trim() ? `${p.trim()} ${t}` : t))} />
                    <label className="sw-tool">
                      <Paperclip size={15} /> <span>Add a file</span>
                      <input type="file" hidden accept="application/pdf,.pdf,image/*" onChange={async e => {
                        const f = e.target.files?.[0]; e.target.value = '';
                        if (!f) return;
                        if (files.length >= 2) { setFileNote('Two files is plenty for now — you can add more after sign-up.'); return; }
                        const r = await readAttachment(f);
                        if (r.ok && (r.att.kind === 'pdf' || r.att.kind === 'image')) { setFiles(fs => [...fs, r.att]); setFileNote(''); }
                        else setFileNote(r.ok ? 'A PDF or an image, please.' : r.error);
                      }} />
                    </label>
                    {files.map(f => (
                      <span key={f.id} className="sw-file">{f.name}<button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(fs => fs.filter(x => x.id !== f.id))}><X size={12} /></button></span>
                    ))}
                  </div>
                </div>
                {fileNote && <p className="sw-note">{fileNote}</p>}
                <label className="sw-site">
                  <Globe size={15} />
                  <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="Your website (optional) — yourcompany.com" inputMode="url" autoComplete="url" aria-label="Your website (optional)" />
                </label>

                <p className="sw-label">Popular — or describe anything</p>
                <div className="sw-cards">
                  {SITE_SHORTCUTS.map(s => {
                    const Ic = ICONS[s.icon] ?? Sparkles;
                    const on = picked === s.key;
                    return (
                      <button key={s.key} type="button" className="sw-card-opt" aria-pressed={on}
                        onClick={() => {
                          setPicked(on ? '' : s.key);
                          if (!on && s.seed && (!prompt.trim() || SITE_SHORTCUTS.some(x => x.seed === prompt))) setPrompt(s.seed);
                          if (!on && s.key === CUSTOM) dialog.current?.querySelector<HTMLTextAreaElement>('.sw-textarea')?.focus();
                        }}>
                        <span className="sw-card-ic"><Ic size={17} /></span>
                        <span>{s.label}</span>
                        {on && <Check size={15} className="sw-card-tick" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {step === 'understand' && (
              <>
                <h2 className="sw-title">{understood ? 'Here’s what I understood' : 'Understanding your request…'}</h2>
                <blockquote className="sw-quote">“{prompt.trim()}”</blockquote>
                <ul className="sw-stages">
                  {stages.map(s => (
                    <li key={s.label} data-state={s.state}>
                      {s.state === 'now' ? <Loader size={15} className="sw-spin" /> : s.state === 'warn' ? <CircleDashed size={15} /> : <Check size={15} />} {s.label}
                    </li>
                  ))}
                </ul>
                {understood && state && (
                  <div className="sw-understood">
                    <p className="sw-summary">{state.summary}</p>
                    <div className="sw-chips">
                      {state.solutionKeys.map(k => <span key={k} className="sw-chip"><Wand2 size={13} /> {solutionByKey(k)?.label ?? k}</span>)}
                    </div>
                    {Object.entries(state.known).filter(([id]) => QUESTIONS[id] && id !== 'business').length > 0 && (
                      <ul className="sw-known">
                        {Object.entries(state.known).filter(([id]) => QUESTIONS[id] && id !== 'business').slice(0, 6).map(([id, k]) => (
                          <li key={id}><Check size={13} /> <span>{QUESTIONS[id].prompt.replace(/\?$/, '')}: <b>{answerText(QUESTIONS[id], k.value)}</b></span></li>
                        ))}
                      </ul>
                    )}
                    {aiNote && <p className="sw-note">{aiNote}</p>}
                  </div>
                )}
              </>
            )}

            {step === 'questions' && state && screen && (
              <>
                <p className="sw-kicker">Question {screenIdx + 1} of {screens.length} · {GROUP_TITLE[screen.group]}</p>
                {screen.questions.map(q => (
                  <QuestionBlock key={q.id} q={q} state={state} answer={answer} suggestions={q.id === 'audience' || q.id === 'prospectTrades' ? buyersFor(yourTradeIn(state.prompt)) : []} />
                ))}
              </>
            )}

            {step === 'business' && state && (
              <BusinessStep state={state} hint={profileHint} prompt={state.prompt} onAnswer={answer} />
            )}

            {step === 'solution' && state && bp && (
              <div className="sw-solution">
                <p className="sw-kicker">Your plan</p>
                <h2 className="sw-title">Here’s what Protected Central can build for you.</h2>
                <div className="sw-sol-head">
                  <label className="sw-sol-name">
                    <span>Project</span>
                    <input value={state.name || bp.name} onChange={e => { const name = e.target.value.slice(0, 80); setState(s => (s ? { ...s, name } : s)); }} aria-label="Project name" />
                  </label>
                  <div className="sw-sol-obj"><span>Objective</span><p>{bp.objective}</p></div>
                </div>

                <div className="sw-sol-grid">
                  <section>
                    <h3><Bot size={15} /> AI agents</h3>
                    <ul className="sw-list">{(bp.agents.length ? bp.agents : [{ name: 'Autopilot', role: 'Plans and runs the project', workflow: '' }]).slice(0, 5).map(a => <li key={`${a.name}-${a.workflow}`}><b>{a.name}</b> <span>{a.role}</span></li>)}</ul>
                  </section>
                  <section>
                    <h3><Sparkles size={15} /> What it produces</h3>
                    <ul className="sw-list">{[...new Set([...bp.workflows.map(w => w.output?.label ?? ''), ...bp.outputs])].filter(Boolean).slice(0, 6).map(o => <li key={o}><Check size={13} /> {o}</li>)}</ul>
                  </section>
                </div>

                <section className="sw-flows">
                  <h3><Workflow size={15} /> Workflows <small>{bp.workflows.length}</small></h3>
                  <div className="sw-flow-tabs" role="tablist">
                    {bp.workflows.map((w, i) => (
                      <button key={w.key} type="button" role="tab" aria-selected={i === wfIdx} className={i === wfIdx ? 'on' : ''} onClick={() => setWfIdx(i)}>{w.name}</button>
                    ))}
                  </div>
                  {bp.workflows[wfIdx] && (
                    <div className="sw-flow">
                      <p className="sw-flow-purpose">{bp.workflows[wfIdx].purpose} <span>· {bp.workflows[wfIdx].schedule}</span></p>
                      {bp.workflows[wfIdx].nodes?.length
                        ? <div className="sw-canvas"><WorkflowCanvas nodes={bp.workflows[wfIdx].nodes!} live={false} compact /></div>
                        : <p className="sw-flow-ai"><PenLine size={14} /> Written for your business while your account is built: {bp.workflows[wfIdx].instruction || bp.workflows[wfIdx].purpose}</p>}
                      {bp.workflows[wfIdx].sends && <p className="sw-safe"><ShieldCheck size={14} /> Starts as a draft — nothing is emailed or texted until you approve it.</p>}
                    </div>
                  )}
                </section>

                <section className="sw-later">
                  <h3>After you sign up</h3>
                  {bp.requirements.some(r => REQUIREMENT_INFO[r].kind !== 'included') ? (
                    <ul className="sw-list">{bp.requirements.filter(r => REQUIREMENT_INFO[r].kind !== 'included').map(r => (
                      <li key={r}><CircleDashed size={13} /> <span><b>{REQUIREMENT_INFO[r].label}</b>{REQUIREMENT_INFO[r].kind === 'optional' ? ' (optional)' : ''} — {REQUIREMENT_INFO[r].why}</span></li>
                    ))}</ul>
                  ) : <p className="sw-note ok">Nothing to connect first — everything this plan uses is included.</p>}
                  <p className="sw-safe"><ShieldCheck size={14} /> The project is built for you on sign-up. Anything that emails, texts or publishes waits for your approval.</p>
                </section>
                {state.unsupported.length > 0 && (
                  <p className="sw-note">Not something Protected Central does today: {state.unsupported.join('; ')}.</p>
                )}

                <div className="sw-edit">
                  <input value={editText} onChange={e => setEditText(e.target.value)} placeholder="Change anything — e.g. “three posts a week”"
                    aria-label="Change the plan" onKeyDown={e => { if (e.key === 'Enter') applyEdit(); }} />
                  <button type="button" className="sw-btn sw-btn-ghost sw-btn-sm" onClick={applyEdit} disabled={!editText.trim()}>Change</button>
                </div>
                {editSaid && <p className={`sw-note${editSaid.ok ? ' ok' : ''}`}>{editSaid.text}</p>}
                <p className="sw-fine">Outputs depend on your business and market; nothing here is a promised result. Screens in your account show what actually happens.</p>
              </div>
            )}
          </div>
        </div>

        <footer className="sw-foot">
          {step !== 'intent' && (
            <button type="button" className="sw-btn sw-btn-ghost" onClick={back}><ArrowLeft size={15} /> <span className="sw-back-label">Back</span></button>
          )}
          {step === 'questions' && screen && !screenOpen(screen) && screen.questions.every(q => q.need !== 'required') && (
            <span className="sw-foot-hint">Optional</span>
          )}
          {step === 'solution' ? (
            <div className="sw-final">
              <button type="button" className="sw-btn sw-btn-ghost" onClick={() => { setScreenIdx(0); setStep(screens.length ? 'questions' : 'intent'); }}>Edit my plan</button>
              <div className="sw-final-go">
                <button type="button" className="sw-btn sw-btn-primary sw-btn-lg" onClick={build} data-testid="sw-build">
                  Build this in my free account <ArrowRight size={16} />
                </button>
                <small>7-day free trial · No credit card required</small>
              </div>
            </div>
          ) : (
            <button type="button" className="sw-btn sw-btn-primary" onClick={next} disabled={!!blocker} data-testid="sw-next">
              {step === 'understand' && !understood ? <Loader size={15} className="sw-spin" /> : null}
              {ctaLabel} {!blocker && <ArrowRight size={15} />}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

function answerText(q: Question, v: string | string[]): string {
  const vals = Array.isArray(v) ? v : [v];
  return vals.map(x => q.options?.find(o => o.value === x)?.label ?? x).join(', ');
}

function QuestionBlock({ q, state, answer, suggestions }: {
  q: Question; state: IntakeState; answer: (id: string, v: string | string[] | null, s?: KnownSource) => void; suggestions: string[];
}) {
  const v = state.known[q.id]?.value;
  const vals = Array.isArray(v) ? v : v ? [String(v)] : [];
  const byAi = state.known[q.id]?.source === 'default';
  const aiPick = q.aiDecides !== undefined && q.aiDecides !== 'detect';
  if (!applies(q, state.known)) return null;

  const aiButton = aiPick && (
    <button type="button" className="sw-ai" aria-pressed={byAi} onClick={() => answer(q.id, q.aiDecides!, 'default')}>
      <Sparkles size={13} /> Let AI decide
    </button>
  );
  const skip = q.need === 'optional' && (
    <button type="button" className="sw-skip" onClick={() => answer(q.id, q.type === 'multi' ? [] : '', 'you')}>Skip</button>
  );

  if (q.type === 'single' || q.type === 'multi') {
    return (
      <div className="sw-q">
        <h2 className="sw-q-title">{q.prompt}</h2>
        {q.help && <p className="sw-q-help">{q.help}</p>}
        <div className="sw-opts">
          {(q.options ?? []).map(o => {
            const on = vals.includes(o.value) && !byAi;
            return (
              <button key={o.value} type="button" className="sw-opt" aria-pressed={on} onClick={() => {
                if (q.type === 'single') answer(q.id, on ? null : o.value);
                else answer(q.id, on ? vals.filter(x => x !== o.value) : [...(byAi ? [] : vals), o.value]);
              }}>
                <span className="sw-opt-box">{on && <Check size={13} />}</span>
                <span><b>{o.label}</b>{o.hint && <small>{o.hint}</small>}</span>
              </button>
            );
          })}
        </div>
        <div className="sw-q-more">{aiButton}{skip}{byAi && <span className="sw-ai-said">AI picks: {answerText(q, q.aiDecides!)}</span>}</div>
      </div>
    );
  }

  /* Text: a box, and — for who to reach — one-press ideas from the trade. */
  const text = vals.join(', ');
  return (
    <div className="sw-q">
      <h2 className="sw-q-title">{q.prompt}</h2>
      {q.help && <p className="sw-q-help">{q.help}</p>}
      <input className="sw-input" value={text} placeholder={q.placeholder ?? ''} inputMode={q.type === 'number' ? 'numeric' : undefined}
        aria-label={q.prompt} onChange={e => answer(q.id, e.target.value)} />
      {suggestions.length > 0 && (
        <div className="sw-suggest">
          {suggestions.map(s => {
            const parts = text.split(',').map(x => x.trim()).filter(Boolean);
            const on = parts.some(p => p.toLowerCase() === s.toLowerCase());
            return (
              <button key={s} type="button" className="sw-sug" aria-pressed={on}
                onClick={() => answer(q.id, (on ? parts.filter(p => p.toLowerCase() !== s.toLowerCase()) : [...parts, s]).join(', '))}>
                {on ? <Check size={12} /> : '+'} {s}
              </button>
            );
          })}
          <button type="button" className="sw-ai" onClick={() => answer(q.id, suggestions.slice(0, 2).join(', '), 'ai')}><Sparkles size={13} /> Let AI suggest</button>
        </div>
      )}
      <div className="sw-q-more">{!suggestions.length && aiButton}{skip}</div>
    </div>
  );
}

/**
 * Who the business is — optional here. With a name and a line of what it
 * does, the project is written about the business from the first minute;
 * left blank, the app asks once after sign-up (it cannot write about a
 * business it does not know).
 */
function BusinessStep({ state, hint, prompt, onAnswer }: {
  state: IntakeState; hint: Record<string, string>; prompt: string;
  onAnswer: (id: string, v: string | string[] | null, s?: KnownSource) => void;
}) {
  const get = (id: string) => String(state.known[id]?.value ?? '');
  const trade = yourTradeIn(prompt);
  const place = String(state.known.location?.value ?? state.known.prospectPlaces?.value ?? '');
  /* Ideas the visitor can take with one press, never filled in for them. */
  const whatIdea = hint.description || (trade ? `${trade.charAt(0).toUpperCase()}${trade.slice(1)}${place ? ` in ${place}` : ''}` : '');
  useEffect(() => {
    /* What decides how the app learns about the business: typed details win; a
       website alone is read after sign-up. */
    const name = get('bizName').trim();
    const what = get('bizWhat').trim();
    const site = get('website').trim();
    const want = name && what.length >= 8 ? 'manual' : isUrl(site) ? 'website' : '';
    if (want && get('business') !== want) onAnswer('business', want);
    if (!want && get('business')) onAnswer('business', null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to the three fields only
  }, [state.known.bizName?.value, state.known.bizWhat?.value, state.known.website?.value]);

  return (
    <div className="sw-q">
      <p className="sw-kicker">Last step · optional</p>
      <h2 className="sw-q-title">Who is it for?</h2>
      <p className="sw-q-help">Everything it writes starts from this. Skip it and you will be asked once after sign-up.</p>
      <label className="sw-field"><span>Business name</span>
        <input className="sw-input" value={get('bizName')} placeholder={hint.companyName || 'Pike Roofing'} onChange={e => onAnswer('bizName', e.target.value)} autoComplete="organization" />
      </label>
      <label className="sw-field"><span>What it does</span>
        <input className="sw-input" value={get('bizWhat')} placeholder={whatIdea || 'Commercial roofing across Dallas'} onChange={e => onAnswer('bizWhat', e.target.value)} />
      </label>
      {whatIdea && !get('bizWhat') && (
        <button type="button" className="sw-sug" onClick={() => onAnswer('bizWhat', whatIdea)}>+ {whatIdea}</button>
      )}
      <label className="sw-field"><span>Website <small>optional</small></span>
        <input className="sw-input" value={get('website')} placeholder="https://yourcompany.com" inputMode="url"
          onChange={e => { const u = normalUrl(e.target.value); onAnswer('website', e.target.value ? (isUrl(u) ? u : e.target.value) : null); }} />
      </label>
    </div>
  );
}

/** The microphone: the app's own voice engine, its words put in the box to check. */
function SiteMic({ onText }: { onText: (t: string) => void }) {
  const v = useVoiceInput(defaultLocale());
  if (!v.supported) return null;
  const listening = v.phase === 'listening' || v.phase === 'starting';
  const busy = v.phase === 'transcribing';
  return (
    <button type="button" className="sw-tool" data-state={listening ? 'listening' : undefined} disabled={busy}
      aria-label={listening ? 'Stop listening' : 'Say it instead'} title={v.problem || undefined}
      onClick={async () => {
        if (listening) { void v.stop(); return; }
        const r = await v.start();
        if (r?.text) onText(r.text);
      }}>
      {busy ? <Loader size={15} className="sw-spin" /> : listening ? <Square size={13} /> : <Mic size={15} />}
      <span>{listening ? 'Listening — tap to stop' : busy ? 'Writing it down…' : 'Say it'}</span>
    </button>
  );
}

