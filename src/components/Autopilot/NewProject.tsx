/**
 * Starting a project.
 *
 * ── Why this is three steps and not one form ──
 *
 * It used to be one screen with three questions, on the argument that a wizard
 * is only right when later steps depend on earlier answers. That argument was
 * correct and the premise was wrong: they do depend on each other now. What
 * this project is allowed to do decides which objectives are worth suggesting,
 * and the client decides what those objectives say. Asking all of it at once
 * meant the objective box was a blank rectangle, and a blank rectangle is where
 * people write "more leads".
 *
 * ── The three questions ──
 *
 *  1. **What should it do?** As many capabilities as apply, not one of three
 *     categories. Each is a real guardrail on the server, and anything not
 *     chosen is switched off rather than left at a default nobody saw.
 *  2. **Whose is it?** A portfolio — a client described once and reused by
 *     every project that speaks for them. Three ways in, because the fastest
 *     one depends on what the person happens to have: their website, something
 *     written about them, or their own words.
 *  3. **What should it achieve?** Suggestions built from the first two answers,
 *     and a box. The suggestions are a starting sentence to edit, not a menu —
 *     Autopilot reads this every time it decides what to do next, so the
 *     difference between it and "more leads" is the difference between a plan
 *     and a shrug.
 *
 * You can go back. Nothing is saved until the last press, including the
 * portfolio — so abandoning this halfway leaves no half-client behind.
 */
import { useMemo, useState } from 'react';
import {
  X, Loader, Globe, Check, ArrowLeft, ArrowRight, Sparkles,
  ClipboardPaste, PenLine, Building2, Search, Mail, MessageSquare,
  FileText, CalendarCheck, ShoppingBag, Zap,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  saveProject, savePortfolio, readPortfolioFromUrl, readPortfolioFromText,
  CAPABILITIES, ALL_CAPABILITIES, kindFor, guardrailsFor, objectiveIdeas,
  type Portfolio, type Capability,
} from '../../services/projects';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

const inp: React.CSSProperties = {
  width: '100%', padding: '11px 13px', border: `1px solid ${LINE}`, borderRadius: 11,
  fontSize: 13.5, color: INK, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 };

const CAP_ICON: Record<Capability, typeof Search> = {
  find: Search, email: Mail, sms: MessageSquare,
  content: FileText, book: CalendarCheck, shop: ShoppingBag,
};

/** A ready-made set, for somebody who does not want to think about six switches. */
const PRESETS: { id: string; label: string; caps: Capability[]; blurb: string }[] = [
  { id: 'all', label: 'Run the whole thing', caps: ALL_CAPABILITIES, blurb: 'Everything below, hands off' },
  { id: 'outreach', label: 'Find and contact people', caps: ['find', 'email', 'content', 'book'], blurb: 'The usual lead-generation push' },
  { id: 'write', label: 'Write, I press send', caps: ['content', 'email'], blurb: 'Nothing leaves without you' },
  { id: 'shop', label: 'Run a shop', caps: ['shop', 'email', 'content'], blurb: 'Catalogue, checkout and the follow-up' },
];

type Step = 1 | 2 | 3;
type Way = 'site' | 'paste' | 'hand';

export default function NewProject({
  portfolios, onClose, onCreated,
}: {
  portfolios: Portfolio[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { addNotification } = useApp();
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);

  /* 1 — what it may do */
  const [caps, setCaps] = useState<Capability[]>(['find', 'email', 'content', 'book']);

  /* 2 — whose it is */
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

  /* 3 — what it should achieve */
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const toggle = (c: Capability) =>
    setCaps(cs => (cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c]));

  const clientName = adding
    ? form.companyName
    : (portfolios.find(p => p.id === portfolioId)?.name ?? '');

  const ideas = useMemo(() => objectiveIdeas(caps, clientName), [caps, clientName]);

  /** Fill the form from a source, without overwriting anything typed by hand. */
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

  /* What each step will not let you leave without. Said on the button rather
     than as an error after the press. */
  const blocked =
    step === 1 ? (caps.length === 0 ? 'Pick at least one thing for it to do' : '')
      : step === 2 ? (adding
        ? (form.companyName.trim() ? '' : 'Give the client a name')
        : (portfolioId ? '' : 'Choose a client'))
        : (!name.trim() ? 'Name the project'
          : objective.trim().length < 8 ? 'Say what it should achieve' : '');

  const create = async () => {
    setBusy(true);
    let pid = portfolioId;

    if (adding) {
      const p = await savePortfolio({
        name: form.companyName.trim(),
        profile: { ...form, companyName: form.companyName.trim() },
        /* Stamped so the portfolio says where it came from. A description a
           person wrote and one read off a page are worth different amounts of
           trust when something it writes reads oddly. */
        source: readFrom ? 'url' : 'manual',
      });
      if (!p.success || !p.id) { setBusy(false); addNotification(p.error ?? 'Could not save the client.', 'error'); return; }
      pid = p.id;
    }

    const r = await saveProject({
      name: name.trim(), objective: objective.trim(), portfolioId: pid,
      kind: kindFor(caps), guardrails: guardrailsFor(caps),
    });
    setBusy(false);
    if (!r.success) { addNotification(r.error ?? 'Could not start the project.', 'error'); return; }
    addNotification(`"${name.trim()}" started. Autopilot plans it within a day.`, 'success');
    onCreated();
  };

  const TITLES: Record<Step, string> = {
    1: 'What should it do?',
    2: 'Who is it for?',
    3: 'What should it achieve?',
  };

  return (
    <div
      role="dialog" aria-modal="true" aria-label="New project"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(12,14,17,0.55)',
        backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: 'clamp(12px, 3vw, 24px)', overflowY: 'auto',
      }}
    >
      <div className="np-card" style={{
        background: '#fff', borderRadius: 22, width: '100%', maxWidth: 620,
        marginTop: 'clamp(16px, 4vh, 44px)', marginBottom: 24, overflow: 'hidden',
        boxShadow: '0 28px 70px -14px rgba(12,14,17,0.45)',
      }}>
        {/* ── Header: the module's own colour, so this reads as Autopilot's
            door rather than a generic dialog ── */}
        <div style={{
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 52%, #9333ea 100%)',
          color: '#fff', padding: '17px 20px 15px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Zap size={17} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, opacity: 0.72, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                New project · step {step} of 3
              </div>
              <h2 style={{ margin: '2px 0 0', fontSize: 17.5, fontWeight: 800, letterSpacing: '-0.02em' }}>
                {TITLES[step]}
              </h2>
            </div>
            <button onClick={onClose} aria-label="Close"
              style={{ border: 'none', background: 'rgba(255,255,255,0.16)', borderRadius: 9, cursor: 'pointer', color: '#fff', display: 'flex', padding: 6 }}>
              <X size={16} />
            </button>
          </div>

          {/* Three segments rather than a percentage: there are three questions
              and somebody should be able to see which one they are on. */}
          <div style={{ display: 'flex', gap: 5, marginTop: 13 }}>
            {([1, 2, 3] as Step[]).map(n => (
              <div key={n} style={{
                flex: 1, height: 3, borderRadius: 99,
                background: n <= step ? '#fff' : 'rgba(255,255,255,0.28)',
                transition: 'background 0.3s ease',
              }} />
            ))}
          </div>
        </div>

        <div style={{ padding: 'clamp(16px, 3vw, 22px)', display: 'grid', gap: 16 }}>

          {/* ══════════ 1 — capabilities ══════════ */}
          {step === 1 && (
            <>
              <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
                Pick as many as apply. Each one is a real permission — anything you leave off, this
                project cannot do, and anything that reaches a stranger still waits for your yes the
                first time.
              </p>

              <div>
                <label style={lbl}>Start from one of these</label>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {PRESETS.map(pr => {
                    const on = pr.caps.length === caps.length && pr.caps.every(c => caps.includes(c));
                    return (
                      <button key={pr.id} type="button" onClick={() => setCaps(pr.caps)} title={pr.blurb}
                        style={{
                          padding: '8px 13px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                          border: `1.5px solid ${on ? ACCENT : LINE}`,
                          background: on ? 'rgba(91,70,229,0.07)' : '#fff',
                          color: on ? ACCENT : INK, fontSize: 12.5, fontWeight: 700,
                        }}>
                        {pr.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                {CAPABILITIES.map(c => {
                  const on = caps.includes(c.id);
                  const Icon = CAP_ICON[c.id];
                  return (
                    <button key={c.id} type="button" onClick={() => toggle(c.id)} aria-pressed={on}
                      className="np-cap"
                      style={{
                        display: 'flex', gap: 11, alignItems: 'flex-start', textAlign: 'left',
                        padding: '12px 13px', borderRadius: 13, cursor: 'pointer', fontFamily: 'inherit',
                        border: `1.5px solid ${on ? ACCENT : LINE}`,
                        background: on ? 'rgba(91,70,229,0.05)' : '#fff',
                        transition: 'border-color 0.15s ease, background 0.15s ease',
                      }}>
                      <span style={{
                        flexShrink: 0, width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center',
                        background: on ? ACCENT : '#f1f3f7', color: on ? '#fff' : '#8b93a3',
                        transition: 'background 0.15s ease, color 0.15s ease',
                      }}>
                        <Icon size={15} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: INK }}>{c.label}</span>
                        <span style={{ display: 'block', fontSize: 12, color: MUTED, marginTop: 2, lineHeight: 1.5 }}>
                          {c.blurb}
                          {c.needs && (
                            /* Said here rather than found out when nothing sends. */
                            <span style={{ color: '#94a3b8' }}> · needs {c.needs}</span>
                          )}
                        </span>
                      </span>
                      <span style={{
                        flexShrink: 0, width: 19, height: 19, borderRadius: 6, marginTop: 5,
                        border: `1.5px solid ${on ? ACCENT : '#cbd2df'}`, background: on ? ACCENT : '#fff',
                        display: 'grid', placeItems: 'center', color: '#fff',
                      }}>
                        {on && <Check size={12} strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* ══════════ 2 — the portfolio ══════════ */}
          {step === 2 && (
            <>
              <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
                A portfolio is everything Autopilot knows about one business — what they sell, who
                buys it, how they talk. Every word it writes for this project comes from here, and
                other projects for the same client share it.
              </p>

              {portfolios.length > 0 && (
                <div style={{ display: 'flex', gap: 5, padding: 4, borderRadius: 12, background: '#f4f5f8' }}>
                  {([[false, 'Use one I have'], [true, 'Add a new one']] as const).map(([v, label]) => (
                    <button key={label} type="button" onClick={() => setAdding(v)}
                      style={{
                        flex: 1, padding: '8px 10px', borderRadius: 9, border: 'none', cursor: 'pointer',
                        background: adding === v ? '#fff' : 'transparent',
                        color: adding === v ? INK : MUTED, fontSize: 12.5, fontWeight: 700,
                        fontFamily: 'inherit',
                        boxShadow: adding === v ? '0 1px 3px rgba(16,24,40,0.1)' : 'none',
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {!adding ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {portfolios.map(p => {
                    const on = p.id === portfolioId;
                    const desc = String(p.profile?.description ?? '');
                    return (
                      <button key={p.id} type="button" onClick={() => setPortfolioId(p.id)} aria-pressed={on}
                        style={{
                          display: 'flex', gap: 11, alignItems: 'flex-start', textAlign: 'left',
                          padding: '12px 13px', borderRadius: 13, cursor: 'pointer', fontFamily: 'inherit',
                          border: `1.5px solid ${on ? ACCENT : LINE}`,
                          background: on ? 'rgba(91,70,229,0.05)' : '#fff',
                        }}>
                        <span style={{
                          flexShrink: 0, width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center',
                          background: on ? ACCENT : '#f1f3f7', color: on ? '#fff' : '#8b93a3',
                        }}>
                          <Building2 size={15} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: INK }}>{p.name}</span>
                          <span style={{
                            display: 'block', fontSize: 12, color: MUTED, marginTop: 2, lineHeight: 1.5,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {desc || (p.source === 'url' ? 'Read from their website' : 'No description yet')}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div>
                    <label style={lbl}>How would you like to fill it in?</label>
                    <div style={{ display: 'grid', gap: 7, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                      {([
                        ['site', Globe, 'From their website', 'Fastest, if they have one'],
                        ['paste', ClipboardPaste, 'From something written', 'An about page, a brochure, an article'],
                        ['hand', PenLine, 'I will type it', 'Or correct what was read in'],
                      ] as const).map(([id, Icon, label, sub]) => {
                        const on = way === id;
                        return (
                          <button key={id} type="button" onClick={() => setWay(id)}
                            style={{
                              textAlign: 'left', padding: '11px 12px', borderRadius: 12, cursor: 'pointer',
                              border: `1.5px solid ${on ? ACCENT : LINE}`, fontFamily: 'inherit',
                              background: on ? 'rgba(91,70,229,0.05)' : '#fff',
                            }}>
                            <Icon size={15} color={on ? ACCENT : '#8b93a3'} />
                            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: INK, marginTop: 6 }}>{label}</span>
                            <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 2, lineHeight: 1.45 }}>{sub}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {way === 'site' && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <input value={form.website} onChange={e => set('website', e.target.value)} style={inp}
                        placeholder="brightsmile.co.uk" aria-label="Their website" />
                      <button onClick={() => void readSite()} disabled={reading} type="button" style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '11px 15px', borderRadius: 11, border: 'none', background: INK, color: '#fff',
                        fontSize: 13, fontWeight: 700, cursor: reading ? 'default' : 'pointer', opacity: reading ? 0.65 : 1,
                      }}>
                        {reading ? <Loader size={14} className="spin" /> : <Sparkles size={14} />}
                        {reading ? 'Reading their site…' : 'Read their site'}
                      </button>
                    </div>
                  )}

                  {way === 'paste' && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <textarea value={pasted} onChange={e => setPasted(e.target.value)} rows={5}
                        style={{ ...inp, resize: 'vertical', lineHeight: 1.55 }}
                        placeholder="Paste their about page, a brochure, a press piece — anything that says who they are and what they sell." />
                      <button onClick={() => void readPasted()} disabled={reading} type="button" style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '11px 15px', borderRadius: 11, border: 'none', background: INK, color: '#fff',
                        fontSize: 13, fontWeight: 700, cursor: reading ? 'default' : 'pointer', opacity: reading ? 0.65 : 1,
                      }}>
                        {reading ? <Loader size={14} className="spin" /> : <Sparkles size={14} />}
                        {reading ? 'Reading it…' : 'Read what I pasted'}
                      </button>
                    </div>
                  )}

                  {way === 'hand' && (
                    <div style={{ display: 'grid', gap: 9 }}>
                      {readFrom && (
                        <p style={{
                          margin: 0, fontSize: 12, color: '#166534', lineHeight: 1.5,
                          display: 'flex', gap: 6, alignItems: 'flex-start',
                          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '9px 11px',
                        }}>
                          <Check size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                          <span>Filled in from <strong>{readFrom}</strong>. Correct anything it got wrong — nothing is saved until you start the project.</span>
                        </p>
                      )}
                      {([
                        ['companyName', 'Client name', 'Bright Smile Dental', false],
                        ['description', 'What do they do?', 'Family dentistry — check-ups, whitening, implants.', true],
                        ['audience', 'Who buys it?', 'Families and professionals within about 20 miles', false],
                        ['offer', 'What exactly do they sell?', 'Implants, Invisalign, hygiene plans', false],
                        ['industry', 'Industry', 'Dentistry', false],
                        ['tone', 'How do they talk?', 'Warm and plain — no jargon', false],
                        ['locations', 'Where do they work?', 'Leeds and Harrogate', false],
                        ['website', 'Website', 'brightsmile.co.uk', false],
                      ] as const).map(([k, label, ph, multi]) => (
                        <div key={k}>
                          <label style={lbl} htmlFor={`pf-${k}`}>{label}</label>
                          {multi
                            ? <textarea id={`pf-${k}`} value={form[k]} onChange={e => set(k, e.target.value)} rows={2} style={{ ...inp, resize: 'vertical', lineHeight: 1.55 }} placeholder={ph} />
                            : <input id={`pf-${k}`} value={form[k]} onChange={e => set(k, e.target.value)} style={inp} placeholder={ph} />}
                        </div>
                      ))}
                      <p style={{ margin: 0, fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
                        Only the name is required. The rest makes what it writes sound like them rather
                        than like a template — you can fill it in properly later.
                      </p>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ══════════ 3 — name and objective ══════════ */}
          {step === 3 && (
            <>
              <div>
                <label style={lbl} htmlFor="pj-name">Call it something you will recognise</label>
                <input id="pj-name" value={name} onChange={e => setName(e.target.value)} style={inp}
                  placeholder={caps.includes('shop') ? 'Supplement range launch' : 'Dental client acquisition'} />
              </div>

              <div>
                <label style={lbl} htmlFor="pj-obj">What should it achieve?</label>
                <textarea id="pj-obj" value={objective} onChange={e => setObjective(e.target.value)} rows={3}
                  style={{ ...inp, resize: 'vertical', lineHeight: 1.55 }}
                  placeholder="In your own words — a sentence is enough." />
                <p style={{ margin: '6px 0 0', fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
                  Autopilot reads this every time it decides what to do next, so a number and a place
                  plan very differently from "more leads".
                </p>
              </div>

              <div>
                <label style={lbl}>Or start from one of these and edit it</label>
                <div style={{ display: 'grid', gap: 6 }}>
                  {ideas.map(idea => (
                    <button key={idea} type="button" onClick={() => setObjective(idea)}
                      style={{
                        textAlign: 'left', padding: '10px 12px', borderRadius: 11, cursor: 'pointer',
                        border: `1px solid ${objective === idea ? ACCENT : LINE}`, fontFamily: 'inherit',
                        background: objective === idea ? 'rgba(91,70,229,0.05)' : '#fbfbfd',
                        fontSize: 12.5, color: INK, lineHeight: 1.5,
                      }}>
                      {idea}
                    </button>
                  ))}
                </div>
              </div>

              {/* What is about to be created, before it is. */}
              <div style={{ padding: '12px 13px', borderRadius: 13, background: '#f7f8fa', border: `1px solid ${LINE}` }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 7 }}>This project will be allowed to</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {caps.map(c => (
                    <span key={c} style={{
                      padding: '4px 10px', borderRadius: 999, background: '#fff',
                      border: `1px solid ${LINE}`, fontSize: 11.5, fontWeight: 600, color: INK,
                    }}>
                      {CAPABILITIES.find(x => x.id === c)?.label}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 11.5, color: MUTED, marginTop: 9, lineHeight: 1.5 }}>
                  for <strong style={{ color: INK }}>{clientName || 'this client'}</strong>. Nothing that
                  reaches a person goes out until you approve the first one.
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
          padding: 'clamp(12px, 2.5vw, 16px) clamp(16px, 3vw, 22px)',
          borderTop: `1px solid ${LINE}`, background: '#fcfcfd',
        }}>
          {step > 1 ? (
            <button onClick={() => setStep(s => (s - 1) as Step)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 14px', borderRadius: 11, border: `1px solid ${LINE}`,
              background: '#fff', fontSize: 13, fontWeight: 700, color: INK, cursor: 'pointer',
            }}><ArrowLeft size={14} /> Back</button>
          ) : (
            <button onClick={onClose} style={{
              padding: '10px 14px', borderRadius: 11, border: `1px solid ${LINE}`,
              background: '#fff', fontSize: 13, fontWeight: 700, color: INK, cursor: 'pointer',
            }}>Cancel</button>
          )}

          <div style={{ flex: 1, minWidth: 8 }} />

          {/* The reason a step will not advance, before the press rather than
              after it. */}
          {blocked && (
            <span style={{ fontSize: 11.5, color: MUTED, order: 3, width: '100%', textAlign: 'right' }}>{blocked}</span>
          )}

          {step < 3 ? (
            <button onClick={() => setStep(s => (s + 1) as Step)} disabled={!!blocked} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 18px', borderRadius: 11, border: 'none',
              background: blocked ? '#c7c9d3' : ACCENT, color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: blocked ? 'not-allowed' : 'pointer',
            }}>Next <ArrowRight size={14} /></button>
          ) : (
            <button onClick={() => void create()} disabled={busy || !!blocked} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 18px', borderRadius: 11, border: 'none',
              background: busy || blocked ? '#c7c9d3' : ACCENT, color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: busy || blocked ? 'not-allowed' : 'pointer',
            }}>
              {busy ? <Loader size={14} className="spin" /> : <Zap size={14} />} Start project
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
