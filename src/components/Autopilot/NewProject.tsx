/**
 * Starting a project.
 *
 * ── What changed, and why ──
 *
 * It used to open on six capabilities — "Find people worth contacting", "Write
 * and send the emails", "Text them as well" — and ask a plumber to tick the
 * right ones. That is the implementation asking to be configured. Nobody
 * arrives at a marketing tool having decided they want capability three and
 * five; they arrive because the phone is not ringing, or because they are
 * launching something, or because they have four hundred old customers and no
 * reason to email them.
 *
 * So it opens on the job now, and the capabilities are derived from it —
 * `services/projectJobs.ts` holds the catalogue and `kindFor` already worked
 * this way round. Each job carries the first fortnight in plain sentences,
 * which is the teaching part: choosing between six abstract options is
 * guessing, and reading "week one it writes the emails and shows them to you"
 * is a decision. Each also says who it is *not* for, because that is what makes
 * the rest credible.
 *
 * ── The step that was missing ──
 *
 * Nothing used to tell somebody that the job they picked needs a mailbox, or an
 * AI key, until it quietly failed to do anything. Step three names what this
 * particular job cannot run without, reports whether it is actually there —
 * asking the server, with `unknown` as its own state — and offers both ways to
 * fix it: connect a mailbox they own, or buy a domain and business email.
 *
 * The buying happens after the project is saved, because a purchase has to name
 * something that exists. That is not a step nobody warned them about: step
 * three is where the choice is made, and the last screen is where it completes.
 *
 * ── Why it looks like this ──
 *
 * One question per screen, a large title, and a single full-width button at the
 * bottom. Six things on a screen is a form; one thing is a conversation, and a
 * conversation is what somebody setting up their first project needs. Nothing
 * is saved until the create press, so abandoning halfway leaves no half-client
 * behind.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Loader, Globe, Check, ArrowLeft, ArrowRight, Sparkles, Minus, Plus,
  ClipboardPaste, PenLine, Building2, Search, Mail, MessageSquare, HelpCircle,
  FileText, CalendarCheck, ShoppingBag, ChevronRight, ShieldCheck, ExternalLink,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getSession } from '../../services/auth';
import DigitalSetupStep from '../Setup/DigitalSetupStep';
import {
  saveProject, savePortfolio, readPortfolioFromUrl, readPortfolioFromText,
  CAPABILITIES, kindFor, guardrailsFor, objectiveIdeas,
  type Portfolio, type Capability,
} from '../../services/projects';
import {
  ADVANCED_JOB, EVERYTHING, JOBS, REQUIREMENTS, jobById, requirementsFor,
  type Job,
} from '../../services/projectJobs';
import { checkReadiness, type Readiness, type ReadyState } from '../../services/projectReadiness';
import {
  BEGINNER, DEFAULTS, INDUSTRIES, capacityOf, industryById, packageFor, project,
  type Industry, type StarterPackage,
} from '../../services/sendingPlan';

const INK = '#0b0c0e';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';
const GREEN = '#0f7b3d';

const JOB_ICON: Record<string, typeof Search> = {
  'new-customers': Search,
  'existing-customers': Mail,
  launch: Sparkles,
  shop: ShoppingBag,
  'be-found': FileText,
  advanced: PenLine,
};

const CAP_ICON: Record<Capability, typeof Search> = {
  find: Search, email: Mail, sms: MessageSquare,
  content: FileText, book: CalendarCheck, shop: ShoppingBag,
};

const GOALS = [
  { id: 'more-leads', label: 'More enquiries' },
  { id: 'higher-value', label: 'Bigger jobs' },
  { id: 'retention', label: 'Keep customers longer' },
  { id: 'launch', label: 'Launch something new' },
  { id: 'reputation', label: 'Reviews and reputation' },
  { id: 'fill-diary', label: 'Fill the diary' },
] as const;

/* Five before anything is saved, then the purchase. Completion falls off a
   cliff with length — three-step flows finish around 72%, seven-step around
   16% — so each of these earns its place, and the sixth is optional and
   after the fact. */
type Step = 1 | 2 | 3 | 4 | 5 | 6;
type Way = 'site' | 'paste' | 'hand';
/** How this project will get an address to send from. */
type MailPlan = 'have' | 'buy' | 'later';

const TITLES: Record<Step, string> = {
  1: 'What are you trying to do?',
  2: 'Who is it for?',
  3: 'Your sending setup',
  4: 'What would make this a success?',
  5: 'Ready when you are',
  6: 'Your domain and email',
};

const SUBTITLES: Record<Step, string> = {
  1: 'Pick the closest one. It decides what Autopilot does first, and you can change any of it later.',
  2: 'Everything it writes comes from here — what they sell, who buys it, how they talk.',
  3: 'Sized from what you want to send, and adjustable. The arithmetic is shown so you can check it.',
  4: 'Autopilot reads this every time it decides what to do next.',
  5: 'Nothing has been saved yet. Here is exactly what happens when you press start.',
  6: 'Bought for this project. Skip it if you would rather not.',
};

export default function NewProject({
  portfolios, onClose, onCreated,
}: {
  portfolios: Portfolio[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { addNotification } = useApp();
  const [step, setStep] = useState<Step>(1);
  const [createdId, setCreatedId] = useState('');
  const [busy, setBusy] = useState(false);

  /* 1 — the job */
  const [jobId, setJobId] = useState('');
  const [caps, setCaps] = useState<Capability[]>([]);

  /* 2 — the client */
  const [portfolioId, setPortfolioId] = useState(portfolios[0]?.id ?? '');
  const [adding, setAdding] = useState(!portfolios.length);
  const [way, setWay] = useState<Way>('site');
  const [reading, setReading] = useState(false);
  const [readFrom, setReadFrom] = useState('');
  const [pasted, setPasted] = useState('');
  const [form, setForm] = useState<Record<string, string>>({
    companyName: '', description: '', audience: '', offer: '',
    industry: '', tone: '', locations: '', website: '',
  });

  /* 2b — the trade, which decides the shape of everything after it */
  const [industryId, setIndustryId] = useState('');

  /* 3 — the sending setup */
  const [ready, setReady] = useState<Readiness | null>(null);
  const [mailPlan, setMailPlan] = useState<MailPlan>('later');
  /* The pool, as domains × mailboxes. Edited directly by the steppers, or
     recomputed when somebody types a monthly target. */
  const [pool, setPool] = useState<StarterPackage>(BEGINNER);
  const [targetMonth, setTargetMonth] = useState('');

  /* 4 — what good looks like */
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [goals, setGoals] = useState<string[]>([]);
  const [revenueTarget, setRevenueTarget] = useState('');

  const job = jobById(jobId);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const toggleCap = (c: Capability) =>
    setCaps(cs => (cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c]));

  const clientName = adding
    ? form.companyName
    : (portfolios.find(p => p.id === portfolioId)?.name ?? '');

  const ideas = useMemo(() => objectiveIdeas(caps, clientName), [caps, clientName]);
  const needs = useMemo(() => requirementsFor(caps), [caps]);

  /* Asked when the step is reached, not at mount: a wizard that fires four
     requests before anybody has chosen anything is four requests most people
     never needed. */
  useEffect(() => {
    if (step !== 3 || ready) return;
    let alive = true;
    void checkReadiness().then(r => { if (alive) setReady(r); });
    return () => { alive = false; };
  }, [step, ready]);

  const pickJob = (j: Job) => {
    setJobId(j.id);
    /* The advanced path starts from the commonest set rather than nothing, so
       the first thing somebody sees is a sensible project they can trim. */
    setCaps(j.id === ADVANCED_JOB.id ? ['find', 'email', 'content', 'book'] : j.caps);
  };

  const absorb = (p: Record<string, string>, from: string) => {
    setForm(f => {
      const next = { ...f };
      for (const k of Object.keys(next)) {
        /* Typed wins. A machine reading a marketing page should not overrule
           somebody who has already written the answer. */
        if (!next[k].trim() && p[k]) next[k] = p[k];
      }
      return next;
    });
    setReadFrom(from);
    setWay('hand');
    addNotification('Read it in. Check it over — this is what everything gets written from.', 'success');
  };

  const readSite = async () => {
    const url = form.website.trim();
    if (!url) { addNotification('Paste the client’s website address first.', 'error'); return; }
    setReading(true);
    const r = await readPortfolioFromUrl(url);
    setReading(false);
    if (!r.success || !r.profile) { addNotification(r.error ?? 'That page could not be read.', 'error'); return; }
    absorb(r.profile, r.readFrom ?? url);
  };

  const readPasted = async () => {
    if (!pasted.trim()) { addNotification('Paste something about them first.', 'error'); return; }
    setReading(true);
    const r = await readPortfolioFromText(pasted);
    setReading(false);
    if (!r.success || !r.profile) { addNotification(r.error ?? 'That could not be read.', 'error'); return; }
    absorb(r.profile, r.readFrom ?? 'what you pasted');
  };

  const industry: Industry | null = industryById(industryId);
  /* An owned list needs one address on the domain people recognise, not a pool.
     The trade decides which of the two this is; nothing else in the step
     changes shape as much as that does. */
  const listKind = industry?.listKind ?? 'cold';
  const capacity = listKind === 'owned' ? Number(targetMonth) || 0 : capacityOf(pool);
  const forecast = industry ? project(industry, capacity) : null;

  /** Resize the pool from a monthly number somebody typed. */
  const sizeFromTarget = (raw: string) => {
    setTargetMonth(raw);
    const n = Number(raw);
    if (!raw.trim() || !Number.isFinite(n) || n <= 0) return;
    setPool(packageFor(n, listKind, { perMailboxPerDay: pool.perMailboxPerDay }));
  };

  /** Nudge one dimension of the pool, keeping the derived total honest. */
  const nudge = (field: 'domains' | 'mailboxesPerDomain' | 'perMailboxPerDay', by: number) => {
    setPool(p => {
      const limits = { domains: [1, 50], mailboxesPerDomain: [1, 10], perMailboxPerDay: [1, 50] } as const;
      const [lo, hi] = limits[field];
      const next = { ...p, [field]: Math.min(Math.max(p[field] + by, lo), hi) };
      next.mailboxes = next.domains * next.mailboxesPerDomain;
      next.emailsPerMonth = capacityOf(next);
      /* The typed target stops being the source of truth the moment somebody
         edits the pool by hand — leaving it would show two different answers. */
      setTargetMonth('');
      return next;
    });
  };

  /* Said on the button rather than as an error after the press. */
  const blocked =
    step === 1 ? (!jobId ? 'Pick what you are trying to do'
      : caps.length === 0 ? 'Choose at least one thing for it to do' : '')
      : step === 2 ? (!industryId ? 'Say what kind of business it is'
        : adding
          ? (form.companyName.trim() ? '' : 'Give the client a name')
          : (portfolioId ? '' : 'Choose a client'))
        : step === 4 ? (!name.trim() ? 'Name the project'
          : objective.trim().length < 8 ? 'Say what it should achieve' : '')
          : '';

  const create = async () => {
    setBusy(true);
    let pid = portfolioId;

    if (adding) {
      const p = await savePortfolio({
        name: form.companyName.trim(),
        profile: { ...form, companyName: form.companyName.trim() },
        source: readFrom ? 'url' : 'manual',
      });
      if (!p.success || !p.id) { setBusy(false); addNotification(p.error ?? 'Could not save the client.', 'error'); return; }
      pid = p.id;
    }

    const r = await saveProject({
      name: name.trim(), objective: objective.trim(), portfolioId: pid,
      kind: kindFor(caps), guardrails: guardrailsFor(caps),
      goals,
      revenueTarget: Math.round(Number(revenueTarget) || 0),
      volumeTarget: 0,
    });
    setBusy(false);
    if (!r.success || !r.id) { addNotification(r.error ?? 'Could not start the project.', 'error'); return; }
    addNotification(`"${name.trim()}" started. Autopilot plans it within a day.`, 'success');
    setCreatedId(r.id);
    /* Straight to the purchase only if they asked for one on step three.
       Otherwise there is nothing left to do and another screen would be a
       toll booth on the way out. */
    if (mailPlan === 'buy') setStep(6);
    else onCreated();
  };

  const next = () => {
    if (blocked) return;
    if (step === 5) { void create(); return; }
    setStep(s => (Math.min(s + 1, 5) as Step));
  };

  /* ── Small shared pieces, in the one visual language ── */

  const sheet: React.CSSProperties = {
    width: '100%', maxWidth: 560, background: '#fff',
    borderRadius: 'clamp(20px, 4vw, 26px)',
    display: 'flex', flexDirection: 'column',
    maxHeight: 'min(92vh, 860px)', overflow: 'hidden',
    boxShadow: '0 30px 80px -20px rgba(11,12,14,0.45)',
  };

  const row = (on: boolean): React.CSSProperties => ({
    display: 'flex', gap: 13, alignItems: 'flex-start', textAlign: 'left', width: '100%',
    padding: '15px 16px', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit',
    border: `1.5px solid ${on ? ACCENT : LINE}`,
    background: on ? 'rgba(91,70,229,0.045)' : '#fff',
    transition: 'border-color 0.15s ease, background 0.15s ease',
  });

  const inp: React.CSSProperties = {
    width: '100%', padding: '13px 14px', border: `1px solid ${LINE}`, borderRadius: 13,
    fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff',
  };
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 12.5, fontWeight: 700, color: '#475569', marginBottom: 7,
  };

  const stepBtn: React.CSSProperties = {
    width: 30, height: 30, borderRadius: 999, border: 'none', background: '#fff',
    display: 'grid', placeItems: 'center', cursor: 'pointer', color: INK,
    boxShadow: '0 1px 2px rgba(16,24,40,0.12)',
  };

  const STATE_TONE: Record<ReadyState, { bg: string; fg: string; label: string }> = {
    ready: { bg: '#e8f6ee', fg: GREEN, label: 'Ready' },
    missing: { bg: '#fff4ed', fg: '#9a3412', label: 'Not set up' },
    /* Its own state on purpose: "we could not ask" is not "it is missing", and
       reporting the second sends somebody to reconnect a working mailbox. */
    unknown: { bg: '#f1f5f9', fg: '#475569', label: 'Could not check' },
  };

  return (
    <div
      role="dialog" aria-modal="true" aria-label="New project"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(11,12,14,0.5)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'clamp(10px, 3vw, 28px)',
      }}>
      <div style={sheet}>

        {/* ── Chrome: cancel, progress, nothing else ── */}
        <header style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px 10px', flexShrink: 0,
        }}>
          <button onClick={onClose} style={{
            background: 'none', border: 0, padding: '4px 2px', cursor: 'pointer',
            color: MUTED, fontSize: 15, fontFamily: 'inherit', fontWeight: 500,
          }}>
            {step === 6 ? 'Done' : 'Cancel'}
          </button>
          <span style={{ flex: 1, display: 'flex', gap: 6, justifyContent: 'center' }}>
            {[1, 2, 3, 4, 5].map(n => (
              <span key={n} style={{
                width: step === n ? 20 : 6, height: 6, borderRadius: 99,
                background: step >= n ? ACCENT : '#e2e6ee',
                transition: 'width 0.25s ease, background 0.25s ease',
              }} />
            ))}
          </span>
          {/* Balances the cancel button so the dots sit centred. */}
          <span style={{ width: 46 }} aria-hidden="true" />
        </header>

        <div style={{ overflowY: 'auto', padding: '4px 20px 20px', display: 'grid', gap: 18 }}>
          <div>
            <h2 style={{
              margin: 0, fontSize: 'clamp(21px, 4.4vw, 27px)', fontWeight: 800,
              color: INK, letterSpacing: '-0.03em', lineHeight: 1.18,
            }}>
              {TITLES[step]}
            </h2>
            <p style={{ margin: '7px 0 0', fontSize: 14.5, color: MUTED, lineHeight: 1.55 }}>
              {SUBTITLES[step]}
            </p>
          </div>

          {/* ── 1 · The job ── */}
          {step === 1 && (
            <div style={{ display: 'grid', gap: 9 }}>
              {[...JOBS, ADVANCED_JOB].map(j => {
                const on = jobId === j.id;
                const Icon = JOB_ICON[j.id] ?? Sparkles;
                return (
                  <div key={j.id}>
                    <button type="button" onClick={() => pickJob(j)} aria-pressed={on} style={row(on)}>
                      <span style={{
                        flexShrink: 0, width: 34, height: 34, borderRadius: 11, display: 'grid', placeItems: 'center',
                        background: on ? ACCENT : '#f1f3f7', color: on ? '#fff' : '#8b93a3',
                      }}>
                        <Icon size={17} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 15.5, fontWeight: 700, color: INK, letterSpacing: '-0.01em' }}>
                          {j.label}
                        </span>
                        <span style={{ display: 'block', fontSize: 13, color: MUTED, marginTop: 3, lineHeight: 1.5 }}>
                          {j.blurb}
                        </span>
                      </span>
                      {on
                        ? <Check size={17} color={ACCENT} style={{ flexShrink: 0, marginTop: 8 }} />
                        : <ChevronRight size={16} color="#c3c9d4" style={{ flexShrink: 0, marginTop: 9 }} />}
                    </button>

                    {/* The teaching part, and only for the one they chose — six
                        expanded explanations is a wall nobody reads. */}
                    {on && j.firstFortnight.length > 0 && (
                      <div style={{ margin: '9px 0 2px', padding: '13px 15px', borderRadius: 14, background: '#f7f8fb' }}>
                        <div style={{ fontSize: 11.5, fontWeight: 800, color: '#475569', letterSpacing: '0.03em', marginBottom: 8 }}>
                          THE FIRST FORTNIGHT
                        </div>
                        {j.firstFortnight.map((line, i) => (
                          <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: i ? 7 : 0 }}>
                            <span style={{
                              flexShrink: 0, width: 17, height: 17, borderRadius: 99, marginTop: 1,
                              display: 'grid', placeItems: 'center', background: '#fff',
                              border: `1px solid ${LINE}`, fontSize: 9.5, fontWeight: 800, color: ACCENT,
                            }}>{i + 1}</span>
                            <span style={{ fontSize: 13, color: '#334155', lineHeight: 1.55 }}>{line}</span>
                          </div>
                        ))}
                        {j.notFor && (
                          <p style={{ margin: '11px 0 0', paddingTop: 10, borderTop: `1px solid ${LINE}`, fontSize: 12.5, color: MUTED, lineHeight: 1.55 }}>
                            <strong style={{ color: '#475569' }}>Not this one if:</strong> {j.notFor}
                          </p>
                        )}
                      </div>
                    )}

                    {/* The advanced path opens the six switches in place. */}
                    {on && j.id === ADVANCED_JOB.id && (
                      <div style={{ display: 'grid', gap: 7, marginTop: 9 }}>
                        {CAPABILITIES.map(c => {
                          const picked = caps.includes(c.id);
                          const Ic = CAP_ICON[c.id];
                          return (
                            <button key={c.id} type="button" onClick={() => toggleCap(c.id)} aria-pressed={picked}
                              style={{ ...row(picked), padding: '12px 14px' }}>
                              <span style={{
                                flexShrink: 0, width: 28, height: 28, borderRadius: 9, display: 'grid', placeItems: 'center',
                                background: picked ? ACCENT : '#f1f3f7', color: picked ? '#fff' : '#8b93a3',
                              }}>
                                <Ic size={14} />
                              </span>
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: INK }}>{c.label}</span>
                                <span style={{ display: 'block', fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 1.5 }}>
                                  {c.blurb}{c.needs ? ` · needs ${c.needs}` : ''}
                                </span>
                              </span>
                              {picked && <Check size={15} color={ACCENT} style={{ flexShrink: 0, marginTop: 5 }} />}
                            </button>
                          );
                        })}
                        <button type="button" onClick={() => setCaps(EVERYTHING)} style={{
                          background: 'none', border: 0, padding: '4px 2px', textAlign: 'left',
                          fontSize: 12.5, fontWeight: 700, color: ACCENT, cursor: 'pointer', fontFamily: 'inherit',
                        }}>
                          Turn all six on
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── 2 · The client ── */}
          {step === 2 && (
            <div style={{ display: 'grid', gap: 14 }}>
              {/* Asked here rather than in a step of its own: it is a fact about
                  the client, it lives on the portfolio, and it is what decides
                  the shape of the next screen. */}
              <div>
                <label style={lbl}>What kind of business is it?</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {INDUSTRIES.map(i => {
                    const on = industryId === i.id;
                    return (
                      <button key={i.id} type="button" onClick={() => { setIndustryId(i.id); set('industry', i.label); }}
                        aria-pressed={on} style={{
                          padding: '9px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                          border: `1.5px solid ${on ? ACCENT : LINE}`,
                          background: on ? 'rgba(91,70,229,0.06)' : '#fff',
                          color: on ? ACCENT : '#475569', fontSize: 13.5, fontWeight: 600,
                        }}>{i.label}</button>
                    );
                  })}
                </div>
                {industry && (
                  <p style={{ margin: '9px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>{industry.note}</p>
                )}
              </div>

              {portfolios.length > 0 && (
                <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 13, background: '#f1f3f7' }}>
                  {([[false, 'One I have'], [true, 'Someone new']] as const).map(([v, label]) => (
                    <button key={label} type="button" onClick={() => setAdding(v)} style={{
                      flex: 1, padding: '9px 10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: adding === v ? '#fff' : 'transparent',
                      color: adding === v ? INK : MUTED, fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit',
                      boxShadow: adding === v ? '0 1px 3px rgba(16,24,40,0.12)' : 'none',
                    }}>{label}</button>
                  ))}
                </div>
              )}

              {!adding ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {portfolios.map(p => {
                    const on = p.id === portfolioId;
                    const desc = String(p.profile?.description ?? '');
                    return (
                      <button key={p.id} type="button" onClick={() => setPortfolioId(p.id)} aria-pressed={on} style={row(on)}>
                        <span style={{
                          flexShrink: 0, width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center',
                          background: on ? ACCENT : '#f1f3f7', color: on ? '#fff' : '#8b93a3',
                        }}>
                          <Building2 size={15} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: INK }}>{p.name}</span>
                          <span style={{
                            display: 'block', fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 1.5,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {desc || (p.source === 'url' ? 'Read from their website' : 'No description yet')}
                          </span>
                        </span>
                        {on && <Check size={16} color={ACCENT} style={{ flexShrink: 0, marginTop: 7 }} />}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 13, background: '#f1f3f7' }}>
                    {([['site', 'Their website', Globe], ['paste', 'Paste something', ClipboardPaste], ['hand', 'Type it', PenLine]] as const).map(([v, label, Ic]) => (
                      <button key={v} type="button" onClick={() => setWay(v)} style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        padding: '9px 6px', borderRadius: 10, border: 'none', cursor: 'pointer',
                        background: way === v ? '#fff' : 'transparent',
                        color: way === v ? INK : MUTED, fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
                        boxShadow: way === v ? '0 1px 3px rgba(16,24,40,0.12)' : 'none',
                      }}><Ic size={13} /> {label}</button>
                    ))}
                  </div>

                  {way === 'site' && (
                    <div style={{ display: 'grid', gap: 9 }}>
                      <input style={inp} value={form.website} onChange={e => set('website', e.target.value)}
                        placeholder="https://theircompany.com"
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void readSite(); } }} />
                      <button type="button" onClick={() => void readSite()} disabled={reading} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        padding: '13px', borderRadius: 13, border: 'none', cursor: reading ? 'default' : 'pointer',
                        background: reading ? '#c7c9d3' : INK, color: '#fff', fontSize: 15, fontWeight: 600, fontFamily: 'inherit',
                      }}>
                        {reading ? <Loader size={15} className="spin" /> : <Globe size={15} />} Read their site
                      </button>
                    </div>
                  )}

                  {way === 'paste' && (
                    <div style={{ display: 'grid', gap: 9 }}>
                      <textarea value={pasted} onChange={e => setPasted(e.target.value)} rows={5}
                        placeholder="Their about page, a brochure, an old proposal — anything that describes them."
                        style={{ ...inp, resize: 'vertical', lineHeight: 1.55 }} />
                      <button type="button" onClick={() => void readPasted()} disabled={reading} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        padding: '13px', borderRadius: 13, border: 'none', cursor: reading ? 'default' : 'pointer',
                        background: reading ? '#c7c9d3' : INK, color: '#fff', fontSize: 15, fontWeight: 600, fontFamily: 'inherit',
                      }}>
                        {reading ? <Loader size={15} className="spin" /> : <Sparkles size={15} />} Read it in
                      </button>
                    </div>
                  )}

                  {way === 'hand' && (
                    <div style={{ display: 'grid', gap: 12 }}>
                      {readFrom && (
                        <p style={{ margin: 0, fontSize: 12.5, color: GREEN, fontWeight: 600 }}>
                          Filled in from {readFrom}. Correct anything that reads wrong.
                        </p>
                      )}
                      <div><label style={lbl}>Their name</label>
                        <input style={inp} value={form.companyName} onChange={e => set('companyName', e.target.value)} placeholder="Bob’s Plumbing" /></div>
                      <div><label style={lbl}>What they do</label>
                        <textarea style={{ ...inp, resize: 'vertical', lineHeight: 1.55 }} rows={3} value={form.description}
                          onChange={e => set('description', e.target.value)} placeholder="Emergency plumbing and boiler work across Greater Manchester." /></div>
                      <div><label style={lbl}>Who buys it</label>
                        <input style={inp} value={form.audience} onChange={e => set('audience', e.target.value)} placeholder="Homeowners and small landlords" /></div>
                      <div><label style={lbl}>What you want to put in front of them</label>
                        <input style={inp} value={form.offer} onChange={e => set('offer', e.target.value)} placeholder="Free boiler health check" /></div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── 3 · The sending setup, sized from the target ── */}
          {step === 3 && (
            <div style={{ display: 'grid', gap: 14 }}>

              {/* An owned list is a different machine, and says so instead of
                  being quietly sold a pool it does not need. */}
              {listKind === 'owned' ? (
                <div style={{ border: `1px solid ${LINE}`, borderRadius: 16, padding: '15px 16px' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>One address, on your own domain</div>
                  <p style={{ margin: '7px 0 0', fontSize: 13.5, color: MUTED, lineHeight: 1.6 }}>
                    You are writing to people who already know you. That needs the domain they recognise —
                    not a pool of lookalikes. Spreading it across nine new domains would make the mail
                    <em> less</em> likely to arrive, not more.
                  </p>
                  <label style={{ ...lbl, marginTop: 14 }}>Roughly how many a month?</label>
                  <input style={inp} inputMode="numeric" value={targetMonth}
                    onChange={e => sizeFromTarget(e.target.value.replace(/[^0-9]/g, ''))} placeholder="4000" />
                </div>
              ) : (<>
                <div>
                  <label style={lbl}>How many emails a month do you want to send?</label>
                  <input style={inp} inputMode="numeric" value={targetMonth}
                    onChange={e => sizeFromTarget(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder={`Leave blank for the starter — ${BEGINNER.emailsPerMonth.toLocaleString()} a month`} />
                  <p style={{ margin: '7px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.55 }}>
                    Type a number and the setup below resizes itself. Or adjust it by hand — the total
                    follows either way.
                  </p>
                </div>

                {/* ── The pool, adjustable ── */}
                <div style={{ border: `1px solid ${LINE}`, borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 15px', background: '#f7f8fb', borderBottom: `1px solid ${LINE}`, fontSize: 13, fontWeight: 800, color: INK }}>
                    What gets bought
                  </div>
                  <div style={{ padding: '6px 15px 14px' }}>
                    {([
                      ['domains', 'Domains', pool.domains, 'Lookalikes of the client\u2019s name, never their real one — a filtered domain you paid \u00a39 for is an inconvenience.'],
                      ['mailboxesPerDomain', 'Mailboxes on each', pool.mailboxesPerDomain, 'Three spreads the risk: a domain that gets filtered takes all of its mailboxes with it.'],
                      ['perMailboxPerDay', 'Emails per mailbox, per day', pool.perMailboxPerDay, 'What gets somebody blocked is the daily rate from one address, not the monthly total.'],
                    ] as const).map(([field, label, value, why]) => (
                      <div key={field} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '11px 0', borderTop: `1px solid ${LINE}` }}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: INK }}>{label}</span>
                          <span style={{ display: 'block', fontSize: 12, color: MUTED, marginTop: 2, lineHeight: 1.5 }}>{why}</span>
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, background: '#f1f3f7', borderRadius: 999, padding: 3 }}>
                          <button type="button" aria-label={`Fewer ${label}`} onClick={() => nudge(field, -1)} style={stepBtn}>
                            <Minus size={14} />
                          </button>
                          <span style={{ minWidth: 30, textAlign: 'center', fontSize: 15, fontWeight: 800, color: INK }}>{value}</span>
                          <button type="button" aria-label={`More ${label}`} onClick={() => nudge(field, 1)} style={stepBtn}>
                            <Plus size={14} />
                          </button>
                        </span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', paddingTop: 13, borderTop: `1px solid ${LINE}`, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>
                        {pool.mailboxes} mailboxes across {pool.domains} domain{pool.domains === 1 ? '' : 's'}
                      </span>
                      <span style={{ fontSize: 13, color: MUTED }}>
                        · {capacity.toLocaleString()} emails a month
                      </span>
                    </div>
                    <p style={{ margin: '9px 0 0', fontSize: 12, color: MUTED, lineHeight: 1.55 }}>
                      {pool.domains} × {pool.mailboxesPerDomain} × {pool.perMailboxPerDay} a day ×{' '}
                      {DEFAULTS.sendingDaysPerMonth} weekdays. The first three weeks run slower while the
                      domains warm up — sending a new domain\u2019s full volume on day one is the surest way
                      to be filtered.
                    </p>
                  </div>
                </div>
              </>)}

              {/* ── What it might come back as ── */}
              {forecast && capacity > 0 && (
                <div style={{ border: `1px solid ${LINE}`, borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 15px', background: '#f7f8fb', borderBottom: `1px solid ${LINE}`, fontSize: 13, fontWeight: 800, color: INK }}>
                    What that could come back as, per month
                  </div>
                  <div style={{ padding: '4px 15px 13px' }}>
                    {(forecast.funnelApplies
                      ? ([
                        ['Delivered', forecast.delivered],
                        ['Replies', forecast.replies],
                        ['Interested', forecast.interested],
                        ['Conversations booked', forecast.meetings],
                        ['New customers', forecast.customers],
                      ] as const)
                      : ([
                        ['Delivered', forecast.delivered],
                        ['Orders', forecast.customers],
                      ] as const)
                    ).map(([label, range]) => (
                      <div key={label} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '9px 0', borderTop: `1px solid ${LINE}` }}>
                        <span style={{ flex: 1, fontSize: 13.5, color: '#334155' }}>{label}</span>
                        <span style={{ fontSize: 14.5, fontWeight: 700, color: INK }}>
                          {range.low.toLocaleString()}–{range.high.toLocaleString()}
                        </span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '11px 0 0', borderTop: `1.5px solid ${LINE}` }}>
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: INK }}>Revenue</span>
                      <span style={{ fontSize: 16, fontWeight: 800, color: GREEN }}>
                        {forecast.revenue.low.toLocaleString()}–{forecast.revenue.high.toLocaleString()}
                      </span>
                    </div>
                    {/* The honesty clause, and it is not small print. */}
                    <p style={{ margin: '11px 0 0', fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
                      Ranges, not a forecast. They come from ordinary published rates for{' '}
                      {industry?.label.toLowerCase()} — a {(industry!.replyRate[0] * 100).toFixed(0)}–
                      {(industry!.replyRate[1] * 100).toFixed(0)}% reply rate and a typical first order of{' '}
                      {industry!.dealValue[0].toLocaleString()}–{industry!.dealValue[1].toLocaleString()}.
                      The gap between a good list and a bad one is wider than any of this, so treat the low
                      end as the one to plan against.
                    </p>
                  </div>
                </div>
              )}

              {/* ── How the addresses get here ── */}
              {needs.includes('mailbox') && (
                <div style={{ border: `1px solid ${LINE}`, borderRadius: 16, padding: '14px 15px' }}>
                  <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14.5, fontWeight: 700, color: INK, flex: 1, minWidth: 140 }}>
                      {REQUIREMENTS.mailbox.label}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 999,
                      background: ready ? STATE_TONE[ready.mailbox].bg : '#f1f5f9',
                      color: ready ? STATE_TONE[ready.mailbox].fg : '#94a3b8',
                    }}>
                      {ready ? STATE_TONE[ready.mailbox].label : 'Checking\u2026'}
                    </span>
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: MUTED, lineHeight: 1.55 }}>
                    {REQUIREMENTS.mailbox.why}
                  </p>
                  <div style={{ display: 'grid', gap: 7, marginTop: 11 }}>
                    {([
                      ['buy', `Buy the ${pool.domains} domain${pool.domains === 1 ? '' : 's'} and ${pool.mailboxes} mailbox${pool.mailboxes === 1 ? '' : 'es'}`, 'Chosen and paid for on the next screen, once the project exists.'],
                      ['have', 'I have a mailbox to use', 'Connect it in Settings. Fine for your own list; not enough on its own for cold outreach at this volume.'],
                      ['later', 'Decide later', 'The project still starts. Nothing will send until this is sorted.'],
                    ] as const).map(([id, label, hint]) => (
                      <button key={id} type="button" onClick={() => setMailPlan(id)} aria-pressed={mailPlan === id}
                        style={{ ...row(mailPlan === id), padding: '11px 13px' }}>
                        <span style={{
                          flexShrink: 0, width: 17, height: 17, borderRadius: 99, marginTop: 2, display: 'grid', placeItems: 'center',
                          border: `1.5px solid ${mailPlan === id ? ACCENT : '#cbd2df'}`, background: mailPlan === id ? ACCENT : '#fff',
                        }}>
                          {mailPlan === id && <Check size={10} color="#fff" />}
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: INK }}>{label}</span>
                          <span style={{ display: 'block', fontSize: 12, color: MUTED, marginTop: 2, lineHeight: 1.5 }}>{hint}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* The other two, when the job needs them. */}
              {needs.filter(n => n !== 'mailbox').map(req => {
                const info = REQUIREMENTS[req];
                const state: ReadyState = ready ? ready[req] : 'unknown';
                return (
                  <div key={req} style={{ border: `1px solid ${LINE}`, borderRadius: 16, padding: '14px 15px' }}>
                    <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14.5, fontWeight: 700, color: INK, flex: 1, minWidth: 140 }}>{info.label}</span>
                      <span style={{
                        fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 999,
                        background: ready ? STATE_TONE[state].bg : '#f1f5f9',
                        color: ready ? STATE_TONE[state].fg : '#94a3b8',
                      }}>{ready ? STATE_TONE[state].label : 'Checking\u2026'}</span>
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: 13, color: MUTED, lineHeight: 1.55 }}>{info.why}</p>
                    {state !== 'ready' && (
                      <a href={`/settings?tab=${info.settingsTab}`} target="_blank" rel="noopener noreferrer" style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10,
                        fontSize: 13, fontWeight: 700, color: ACCENT, textDecoration: 'none',
                      }}>Set this up <ExternalLink size={12} /></a>
                    )}
                    {state === 'unknown' && ready && (
                      <p style={{ margin: '8px 0 0', display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
                        <HelpCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                        We could not reach the setting to check — that is not the same as it being missing.
                      </p>
                    )}
                  </div>
                );
              })}

              <p style={{
                margin: 0, display: 'flex', gap: 8, alignItems: 'flex-start',
                padding: '12px 13px', borderRadius: 14, background: '#f4f7fb',
                fontSize: 12.5, color: '#1e3a5f', lineHeight: 1.6,
              }}>
                <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                The writing is included — you do not need an AI key of your own. You can start with any of
                the above missing: Autopilot plans either way and reports that a step was skipped, rather
                than pretending it ran.
              </p>
            </div>
          )}

          {/* ── 4 · What success is ── */}
          {step === 4 && (
            <div style={{ display: 'grid', gap: 14 }}>
              <div><label style={lbl}>Call the project</label>
                <input style={inp} value={name} onChange={e => setName(e.target.value)}
                  placeholder={clientName ? `${clientName} — ${job?.label.toLowerCase() ?? 'growth'}` : 'Spring push'} /></div>

              <div>
                <label style={lbl}>What should it achieve?</label>
                {ideas.length > 0 && (
                  <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
                    {ideas.slice(0, 3).map(idea => (
                      <button key={idea} type="button" onClick={() => setObjective(idea)} style={{
                        textAlign: 'left', padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                        border: `1px solid ${objective === idea ? ACCENT : LINE}`,
                        background: objective === idea ? 'rgba(91,70,229,0.05)' : '#fff',
                        fontSize: 13, color: '#334155', fontFamily: 'inherit', lineHeight: 1.5,
                      }}>{idea}</button>
                    ))}
                  </div>
                )}
                <textarea style={{ ...inp, resize: 'vertical', lineHeight: 1.55 }} rows={3} value={objective}
                  onChange={e => setObjective(e.target.value)}
                  placeholder="Pick one above to edit, or write your own." />
                <p style={{ margin: '6px 0 0', fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
                  The difference between this and “more leads” is the difference between a plan and a shrug.
                </p>
              </div>

              <div>
                <label style={lbl}>Which of these matter? (optional)</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {GOALS.map(g => {
                    const on = goals.includes(g.id);
                    return (
                      <button key={g.id} type="button"
                        onClick={() => setGoals(gs => on ? gs.filter(x => x !== g.id) : [...gs, g.id])}
                        style={{
                          padding: '8px 13px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                          border: `1.5px solid ${on ? ACCENT : LINE}`,
                          background: on ? 'rgba(91,70,229,0.06)' : '#fff',
                          color: on ? ACCENT : '#475569', fontSize: 13, fontWeight: 600,
                        }}>{g.label}</button>
                    );
                  })}
                </div>
              </div>

              <div><label style={lbl}>Revenue you want from it, per month (optional)</label>
                <input style={inp} inputMode="numeric" value={revenueTarget}
                  onChange={e => setRevenueTarget(e.target.value.replace(/[^0-9]/g, ''))} placeholder="5000" />
                <p style={{ margin: '6px 0 0', fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
                  Left blank, the planner is told it was not given rather than inventing one.
                </p></div>
            </div>
          )}

          {/* ── 5 · Review ── */}
          {step === 5 && (
            <div style={{ display: 'grid', gap: 11 }}>
              {([
                ['Doing', job?.label ?? '—'],
                ['For', clientName || '—'],
                ['To achieve', objective || '—'],
              ] as const).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 14, background: '#f7f8fb' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', width: 78, flexShrink: 0, letterSpacing: '0.02em' }}>
                    {k.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 14, color: INK, lineHeight: 1.5, minWidth: 0 }}>{v}</span>
                </div>
              ))}

              <div style={{ border: `1px solid ${LINE}`, borderRadius: 16, padding: '14px 15px' }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: INK, marginBottom: 9 }}>
                  What it will be allowed to do
                </div>
                {caps.map(c => {
                  const info = CAPABILITIES.find(x => x.id === c);
                  const Ic = CAP_ICON[c];
                  return (
                    <div key={c} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 8 }}>
                      <Ic size={14} color={ACCENT} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span style={{ fontSize: 13, color: '#334155', lineHeight: 1.5 }}>{info?.label ?? c}</span>
                    </div>
                  );
                })}
                <p style={{ margin: '11px 0 0', paddingTop: 10, borderTop: `1px solid ${LINE}`, fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
                  Everything not on this list is switched off, not left at a default. Anything that reaches
                  a stranger waits for your yes the first time.
                </p>
              </div>

              {mailPlan === 'buy' && (
                <p style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: '#1e3a5f', background: '#f4f7fb', borderRadius: 14, padding: '12px 13px', lineHeight: 1.6 }}>
                  <Mail size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  Next: choosing the domain and the mailboxes. Nothing is charged until you press buy.
                </p>
              )}
            </div>
          )}

          {/* ── 6 · The purchase, once the project is real ── */}
          {step === 6 && createdId && (
            <DigitalSetupStep
              companyName={clientName}
              contactEmail={getSession()?.user?.email ?? ''}
              projectId={createdId}
              onOrder={() => { addNotification('Order placed. Watch it build on the project.', 'success'); onCreated(); }}
            />
          )}
        </div>

        {/* ── One button, at the bottom, always ── */}
        {step !== 6 && (
          <footer style={{ padding: '12px 20px 18px', borderTop: `1px solid ${LINE}`, flexShrink: 0, display: 'flex', gap: 10 }}>
            {step > 1 && (
              <button onClick={() => setStep(s => (Math.max(s - 1, 1) as Step))} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '14px 18px', borderRadius: 999,
                border: `1px solid ${LINE}`, background: '#fff', color: INK,
                fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
              }}>
                <ArrowLeft size={15} /> Back
              </button>
            )}
            <button onClick={next} disabled={!!blocked || busy} title={blocked || undefined} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '14px', borderRadius: 999, border: 'none',
              background: blocked || busy ? '#dcdfe6' : ACCENT,
              color: blocked || busy ? '#8b93a3' : '#fff',
              fontSize: 16, fontWeight: 600, cursor: blocked || busy ? 'default' : 'pointer', fontFamily: 'inherit',
            }}>
              {busy ? <Loader size={16} className="spin" />
                : blocked ? blocked
                  : step === 5 ? <>Start the project <Sparkles size={15} /></>
                    : <>Continue <ArrowRight size={15} /></>}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
