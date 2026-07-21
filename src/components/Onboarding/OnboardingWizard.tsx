/**
 * OnboardingWizard — AI Company Onboarding, Part 1.
 *
 * Steps: 1) Business profile  2) Goals & sales process  3) Marketing channels
 * 4) 12-month AI content plan (generate → review → edit → launch).
 *
 * "Launch" immediately configures the workspace: sub-account branding,
 * scheduling availability/business hours, a sales pipeline with the chosen
 * stages, and stores the 12-month plan month-by-month (status PLAN_GENERATED)
 * for the monthly approval workflow.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Sparkles, Building2, Target, Megaphone, CalendarRange, X, ArrowRight, ArrowLeft,
  Check, Loader, Plus, Trash2, Wand2, PencilLine,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { activeAccount, getActiveAccountId, updateSubAccount } from '../../services/tenancy';
import { getSession } from '../../services/auth';
import {
  loadOnboarding, saveOnboarding, emptyOnboarding, auditEntry, buildTwelveMonthPlan,
  sanitizeText, isValidEmail, isValidUrl, statusMeta,
  INDUSTRIES, VOICE_OPTIONS, GOAL_OPTIONS, CHANNEL_OPTIONS, defaultStagesFor,
} from '../../services/onboarding';
import type { OnboardingState, ContentMonth } from '../../types/onboarding';

const INK = '#17191c';
const MUTED = '#8a8f98';
const RED = '#e5484d';
const STAGE_COLORS = ['#3e63dd', '#8b5cf6', '#c77414', '#3f9142', '#e5484d', '#0ea5e9', '#d946ef', '#64748b'];
const WEEK: { id: string; label: string }[] = [
  { id: 'mon', label: 'Mon' }, { id: 'tue', label: 'Tue' }, { id: 'wed', label: 'Wed' },
  { id: 'thu', label: 'Thu' }, { id: 'fri', label: 'Fri' }, { id: 'sat', label: 'Sat' }, { id: 'sun', label: 'Sun' },
];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px', borderRadius: 12, border: '1.5px solid #e4e6ea',
  fontSize: 13.5, color: INK, outline: 'none', backgroundColor: '#fff', boxSizing: 'border-box',
  fontFamily: 'inherit',
};

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: INK }}>
        {label} {required && <span style={{ color: RED }}>*</span>}
      </label>
      {children}
      {error && <span style={{ fontSize: 11.5, color: RED, fontWeight: 600 }}>{error}</span>}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '9px 16px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
      border: active ? `1.5px solid ${INK}` : '1.5px solid #e4e6ea',
      backgroundColor: active ? INK : '#fff', color: active ? '#fff' : '#5c6066',
      display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s ease',
    }}>
      {active && <Check size={13} strokeWidth={3} />}{children}
    </button>
  );
}

const STEPS = [
  { icon: Building2, title: 'Business profile' },
  { icon: Target, title: 'Goals & sales process' },
  { icon: Megaphone, title: 'Channels' },
  { icon: CalendarRange, title: '12-month plan' },
];

export default function OnboardingWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { updateSchedule, createPipeline, updatePipeline, addNotification } = useApp();
  const [ob, setOb] = useState<OnboardingState>(() => loadOnboarding());
  const [step, setStep] = useState(() => Math.min(loadOnboarding().step, 3));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [editingMonth, setEditingMonth] = useState<number | null>(null);
  const [launching, setLaunching] = useState(false);

  // Prefill from the sub-account record the first time the wizard opens.
  useEffect(() => {
    if (!open) return;
    setOb(prev => {
      if (prev.profile.companyName) return prev;
      const acct = activeAccount();
      if (!acct) return prev;
      return {
        ...prev,
        profile: {
          ...prev.profile,
          companyName: acct.businessName !== 'My Business' ? acct.businessName : '',
          industry: acct.industry || '',
          email: acct.contactEmail || '',
          phone: acct.phone || '',
          brandColor: acct.color || prev.profile.brandColor,
        },
      };
    });
  }, [open]);

  const p = ob.profile;
  const setP = (patch: Partial<typeof p>) => setOb(o => ({ ...o, profile: { ...o.profile, ...patch } }));
  const setG = (patch: Partial<typeof ob.goals>) => setOb(o => ({ ...o, goals: { ...o.goals, ...patch } }));

  const persist = (next: OnboardingState) => { setOb(next); saveOnboarding(next); };

  const stages = ob.goals.salesStages.length ? ob.goals.salesStages : defaultStagesFor(p.industry);

  const validateStep = (s: number): boolean => {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!p.companyName.trim()) e.companyName = 'Company name is required.';
      if (!p.industry) e.industry = 'Pick the closest industry.';
      if (p.description.trim().length < 15) e.description = 'Describe what you do (at least 15 characters).';
      if (p.audience.trim().length < 10) e.audience = 'Describe your target audience (at least 10 characters).';
      if (p.email && !isValidEmail(p.email)) e.email = 'That email address doesn\'t look valid.';
      if (p.website && !isValidUrl(p.website)) e.website = 'That website URL doesn\'t look valid.';
      if (!p.workDays.length) e.workDays = 'Pick at least one working day.';
      if (p.workFrom >= p.workTo) e.workHours = 'Opening time must be before closing time.';
    }
    if (s === 1) {
      if (!ob.goals.goals.length) e.goals = 'Pick at least one goal.';
      if (stages.length < 2) e.stages = 'You need at least 2 pipeline stages.';
      if (!(ob.goals.monthlyLeadTarget > 0)) e.leadTarget = 'Enter a monthly lead target above 0.';
    }
    if (s === 2 && !ob.channels.length) e.channels = 'Pick at least one channel — your content plan is built from these.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const goNext = async () => {
    if (!validateStep(step)) return;
    const next = { ...ob, step: step + 1, goals: { ...ob.goals, salesStages: stages } };
    persist(next);
    setStep(step + 1);
    if (step === 2 && !ob.plan.length) void generatePlan(next);
  };

  const generatePlan = async (state: OnboardingState) => {
    setGenerating(true);
    setGenError('');
    try {
      const { months, source } = await buildTwelveMonthPlan(state.profile, state.goals, state.channels);
      persist({
        ...state, step: 3, plan: months, planSource: source,
        audit: [...state.audit, auditEntry(`12-month plan generated via ${source === 'ai' ? 'Gemini AI' : 'smart templates'}`, actorEmail())],
      });
    } catch {
      setGenError('Plan generation hit a snag — tap Regenerate to try again.');
    } finally {
      setGenerating(false);
    }
  };

  const actorEmail = () => getSession()?.user.email || 'owner';

  const updateMonth = (idx: number, patch: Partial<ContentMonth>) => {
    persist({
      ...ob,
      plan: ob.plan.map(m => m.index === idx
        ? { ...m, ...patch, audit: [...m.audit, auditEntry('Plan edited by user', actorEmail())] }
        : m),
    });
  };

  const launch = () => {
    if (!ob.plan.length || launching) return;
    setLaunching(true);
    const acctId = getActiveAccountId();
    const cleanName = sanitizeText(p.companyName, 80);

    // 1) Brand kit → sub-account record
    if (acctId) {
      updateSubAccount(acctId, {
        businessName: cleanName,
        industry: p.industry,
        color: p.brandColor,
        contactEmail: p.email.trim() || undefined,
        phone: sanitizeText(p.phone, 30) || undefined,
      });
    }

    // 2) Business hours → scheduling availability
    const weekly = Object.fromEntries(WEEK.map(d => [d.id, {
      enabled: p.workDays.includes(d.id), from: p.workFrom, to: p.workTo,
    }])) as Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', { enabled: boolean; from: string; to: string }>;
    updateSchedule({
      title: `Meet with ${cleanName}`,
      description: sanitizeText(p.description, 160) || `Book time with ${cleanName}.`,
      weekly,
    });

    // 3) Sales stages → new pipeline
    const pipe = createPipeline(`${cleanName} Sales`);
    updatePipeline(pipe.id, {
      stages: stages.map((name, i) => ({
        id: `stage-${Date.now()}-${i}`, name: sanitizeText(name, 40) || `Stage ${i + 1}`,
        color: STAGE_COLORS[i % STAGE_COLORS.length], deals: [],
      })),
    });

    // 4) Persist onboarding as completed
    persist({
      ...ob, completed: true, skipped: false, completedAt: new Date().toISOString(), step: 3,
      createdPipelineId: pipe.id,
      audit: [...ob.audit,
        auditEntry('Workspace configured: brand kit, business hours, sales pipeline', actorEmail()),
        auditEntry('Onboarding completed — 12-month content pipeline is live', actorEmail())],
    });
    addNotification(`${cleanName} is set up — your 12-month content plan is ready on the dashboard`, 'success');
    setLaunching(false);
    onClose();
  };

  const skip = () => {
    persist({ ...ob, skipped: true, audit: [...ob.audit, auditEntry('Onboarding skipped for now', actorEmail())] });
    onClose();
  };

  const planStats = useMemo(() => ({
    planned: ob.plan.filter(m => m.status === 'PLAN_GENERATED').length,
    review: ob.plan.filter(m => m.status === 'AWAITING_APPROVAL').length,
    published: ob.plan.filter(m => m.status === 'PUBLISHED').length,
  }), [ob.plan]);

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 4000, backgroundColor: 'rgba(23,25,28,0.55)',
      backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        width: 'min(880px, 100%)', maxHeight: '92vh', backgroundColor: '#f7f8fa', borderRadius: 24,
        display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 80px -16px rgba(23,25,28,0.5)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 26px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: INK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles size={16} color="#c7f441" />
              </div>
              <h2 style={{ fontSize: 19, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.02em' }}>AI Business Setup</h2>
            </div>
            <p style={{ fontSize: 12.5, color: MUTED, margin: '6px 0 0' }}>
              Answer a few questions — the AI configures your whole workspace and plans 12 months of marketing.
            </p>
          </div>
          <button onClick={skip} title="Skip for now" style={{ width: 34, height: 34, borderRadius: 999, border: 'none', backgroundColor: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED }}>
            <X size={16} />
          </button>
        </div>

        {/* Stepper */}
        <div style={{ display: 'flex', gap: 6, padding: '16px 26px 14px' }}>
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < step, active = i === step;
            return (
              <div key={s.title} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ height: 4, borderRadius: 999, backgroundColor: done || active ? INK : '#e0e2e7' }} />
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: done || active ? INK : MUTED }}>
                  {done ? <Check size={12} strokeWidth={3} /> : <Icon size={12} />}{s.title}
                </span>
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 26px 22px' }}>
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Company name" required error={errors.companyName}>
                  <input style={inputStyle} value={p.companyName} maxLength={80} placeholder="Acme Fitness Studio"
                    onChange={e => setP({ companyName: e.target.value })} />
                </Field>
                <Field label="Industry" required error={errors.industry}>
                  <select style={{ ...inputStyle, cursor: 'pointer' }} value={p.industry} onChange={e => {
                    setP({ industry: e.target.value });
                    setOb(o => ({ ...o, goals: { ...o.goals, salesStages: defaultStagesFor(e.target.value) } }));
                  }}>
                    <option value="">Select your industry…</option>
                    {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="What does your business do / sell?" required error={errors.description}>
                <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} value={p.description} maxLength={400}
                  placeholder="We run a boutique fitness studio offering personal training, group classes and nutrition coaching…"
                  onChange={e => setP({ description: e.target.value })} />
              </Field>
              <Field label="Who is your target audience?" required error={errors.audience}>
                <textarea style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }} value={p.audience} maxLength={300}
                  placeholder="Busy professionals aged 30-50 within 10 miles who want to get fit without living at the gym…"
                  onChange={e => setP({ audience: e.target.value })} />
              </Field>
              <Field label="Brand voice">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {VOICE_OPTIONS.map(v => <Chip key={v} active={p.brandVoice === v} onClick={() => setP({ brandVoice: v })}>{v}</Chip>)}
                </div>
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                <Field label="Website" error={errors.website}>
                  <input style={inputStyle} value={p.website} maxLength={120} placeholder="acmefitness.com" onChange={e => setP({ website: e.target.value })} />
                </Field>
                <Field label="Business email" error={errors.email}>
                  <input style={inputStyle} value={p.email} maxLength={120} placeholder="hello@acmefitness.com" onChange={e => setP({ email: e.target.value })} />
                </Field>
                <Field label="Phone">
                  <input style={inputStyle} value={p.phone} maxLength={30} placeholder="+1 555 010 2030" onChange={e => setP({ phone: e.target.value })} />
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'end' }}>
                <Field label="Business days & hours" error={errors.workDays || errors.workHours}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    {WEEK.map(d => (
                      <Chip key={d.id} active={p.workDays.includes(d.id)}
                        onClick={() => setP({ workDays: p.workDays.includes(d.id) ? p.workDays.filter(x => x !== d.id) : [...p.workDays, d.id] })}>
                        {d.label}
                      </Chip>
                    ))}
                    <input type="time" value={p.workFrom} onChange={e => setP({ workFrom: e.target.value })} style={{ ...inputStyle, width: 110 }} />
                    <span style={{ color: MUTED, fontSize: 12 }}>to</span>
                    <input type="time" value={p.workTo} onChange={e => setP({ workTo: e.target.value })} style={{ ...inputStyle, width: 110 }} />
                  </div>
                </Field>
                <Field label="Brand color">
                  <input type="color" value={p.brandColor} onChange={e => setP({ brandColor: e.target.value })}
                    style={{ width: 52, height: 42, border: '1.5px solid #e4e6ea', borderRadius: 12, cursor: 'pointer', backgroundColor: '#fff', padding: 3 }} />
                </Field>
              </div>
            </div>
          )}

          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <Field label="What do you want to achieve in the next 12 months?" required error={errors.goals}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {GOAL_OPTIONS.map(g => (
                    <Chip key={g} active={ob.goals.goals.includes(g)}
                      onClick={() => setG({ goals: ob.goals.goals.includes(g) ? ob.goals.goals.filter(x => x !== g) : [...ob.goals.goals, g] })}>
                      {g}
                    </Chip>
                  ))}
                </div>
              </Field>
              <Field label="Monthly new-lead target" required error={errors.leadTarget}>
                <input type="number" min={1} max={100000} style={{ ...inputStyle, width: 160 }} value={ob.goals.monthlyLeadTarget}
                  onChange={e => setG({ monthlyLeadTarget: Math.max(0, Math.min(100000, Number(e.target.value) || 0)) })} />
              </Field>
              <Field label="Your sales pipeline stages (drag-free — edit, add or remove)" required error={errors.stages}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {stages.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: STAGE_COLORS[i % STAGE_COLORS.length], flexShrink: 0 }} />
                      <input style={{ ...inputStyle, flex: 1 }} value={s} maxLength={40}
                        onChange={e => setG({ salesStages: stages.map((x, xi) => xi === i ? e.target.value : x) })} />
                      <button onClick={() => setG({ salesStages: stages.filter((_, xi) => xi !== i) })} disabled={stages.length <= 2}
                        style={{ width: 34, height: 34, borderRadius: 10, border: 'none', backgroundColor: '#fff', cursor: stages.length <= 2 ? 'not-allowed' : 'pointer', color: stages.length <= 2 ? '#d0d3d8' : RED, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {stages.length < 8 && (
                    <button onClick={() => setG({ salesStages: [...stages, `Stage ${stages.length + 1}`] })}
                      style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999, border: '1.5px dashed #cfd3d9', backgroundColor: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#5c6066' }}>
                      <Plus size={13} /> Add stage
                    </button>
                  )}
                </div>
              </Field>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 13, color: '#5c6066', margin: 0 }}>
                Pick every channel you want the AI to plan content for. Each one activates the matching CRM module.
              </p>
              {errors.channels && <span style={{ fontSize: 11.5, color: RED, fontWeight: 600 }}>{errors.channels}</span>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {CHANNEL_OPTIONS.map(c => {
                  const active = ob.channels.includes(c.id);
                  return (
                    <button key={c.id}
                      onClick={() => setOb(o => ({ ...o, channels: active ? o.channels.filter(x => x !== c.id) : [...o.channels, c.id] }))}
                      style={{
                        textAlign: 'left', padding: '13px 16px', borderRadius: 14, cursor: 'pointer',
                        border: active ? `1.5px solid ${INK}` : '1.5px solid #e4e6ea',
                        backgroundColor: active ? '#fff' : 'rgba(255,255,255,0.55)',
                        boxShadow: active ? '0 4px 14px -6px rgba(23,25,28,0.25)' : 'none',
                        display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s ease',
                      }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                        backgroundColor: active ? INK : '#eef0f3', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {active && <Check size={13} color="#c7f441" strokeWidth={3} />}
                      </span>
                      <span>
                        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: INK }}>{c.label}</span>
                        <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 2 }}>{c.module}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {generating && (
                <div style={{ padding: '48px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 999, backgroundColor: INK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Loader size={22} color="#c7f441" style={{ animation: 'spin 0.9s linear infinite' }} />
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: INK, margin: 0 }}>Planning your next 12 months…</p>
                  <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>Themes, seasonal angles and campaign ideas tailored to {p.companyName || 'your business'}.</p>
                </div>
              )}

              {!generating && genError && (
                <div style={{ padding: 16, borderRadius: 14, backgroundColor: '#fceaea', color: RED, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  {genError}
                  <button onClick={() => void generatePlan(ob)} style={{ padding: '8px 14px', borderRadius: 999, border: 'none', backgroundColor: RED, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Regenerate</button>
                </div>
              )}

              {!generating && ob.plan.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <p style={{ fontSize: 14.5, fontWeight: 800, color: INK, margin: 0 }}>
                        Your 12-month content plan
                        <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 800, padding: '3px 10px', borderRadius: 999, backgroundColor: ob.planSource === 'ai' ? '#e9f4e6' : '#eceff9', color: ob.planSource === 'ai' ? '#3f9142' : '#3e63dd', verticalAlign: 'middle' }}>
                          {ob.planSource === 'ai' ? 'AI GENERATED' : 'SMART TEMPLATES'}
                        </span>
                      </p>
                      <p style={{ fontSize: 12, color: MUTED, margin: '4px 0 0' }}>
                        {planStats.planned} months planned · Month 1 content generates first — later months wait for your monthly approval. Click any month to edit it.
                      </p>
                    </div>
                    <button onClick={() => void generatePlan(ob)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 999, border: '1.5px solid #e4e6ea', backgroundColor: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: INK }}>
                      <Wand2 size={13} /> Regenerate all
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    {ob.plan.map(m => {
                      const meta = statusMeta(m.status);
                      const editing = editingMonth === m.index;
                      return (
                        <div key={m.index} onClick={() => setEditingMonth(editing ? null : m.index)} style={{
                          backgroundColor: '#fff', borderRadius: 14, padding: '13px 15px', cursor: 'pointer',
                          border: editing ? `1.5px solid ${INK}` : '1.5px solid transparent',
                          gridColumn: editing ? '1 / -1' : undefined,
                          boxShadow: '0 1px 2px rgba(23,25,28,0.05)', transition: 'border 0.15s ease',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: 10.5, fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{m.label}</span>
                            <span style={{ fontSize: 9.5, fontWeight: 800, padding: '3px 9px', borderRadius: 999, backgroundColor: meta.bg, color: meta.color }}>{meta.label}</span>
                          </div>
                          {!editing && (
                            <>
                              <p style={{ fontSize: 13.5, fontWeight: 800, color: INK, margin: '7px 0 4px', letterSpacing: '-0.01em' }}>{m.theme}</p>
                              <p style={{ fontSize: 11.5, color: '#5c6066', margin: 0, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.focus}</p>
                              <p style={{ fontSize: 10.5, color: MUTED, margin: '7px 0 0', display: 'flex', alignItems: 'center', gap: 5 }}>
                                <PencilLine size={11} /> {m.ideas.length} ideas · {m.holidays.join(', ') || 'no holidays'}
                              </p>
                            </>
                          )}
                          {editing && (
                            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                              <Field label="Monthly theme">
                                <input style={inputStyle} value={m.theme} maxLength={60} onChange={e => updateMonth(m.index, { theme: sanitizeText(e.target.value, 60) || m.theme })} />
                              </Field>
                              <Field label="Focus">
                                <textarea style={{ ...inputStyle, minHeight: 54, resize: 'vertical' }} value={m.focus} maxLength={260} onChange={e => updateMonth(m.index, { focus: e.target.value.slice(0, 260) })} />
                              </Field>
                              <Field label="Content ideas">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {m.ideas.map((idea, ii) => (
                                    <div key={ii} style={{ display: 'flex', gap: 8 }}>
                                      <input style={{ ...inputStyle, flex: 1 }} value={idea} maxLength={90}
                                        onChange={e => updateMonth(m.index, { ideas: m.ideas.map((x, xi) => xi === ii ? e.target.value : x) })} />
                                      <button onClick={() => updateMonth(m.index, { ideas: m.ideas.filter((_, xi) => xi !== ii) })} disabled={m.ideas.length <= 1}
                                        style={{ width: 34, borderRadius: 10, border: 'none', backgroundColor: '#f4f5f7', cursor: m.ideas.length <= 1 ? 'not-allowed' : 'pointer', color: m.ideas.length <= 1 ? '#d0d3d8' : RED }}>
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  ))}
                                  {m.ideas.length < 6 && (
                                    <button onClick={() => updateMonth(m.index, { ideas: [...m.ideas, ''] })}
                                      style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 999, border: '1.5px dashed #cfd3d9', backgroundColor: 'transparent', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, color: '#5c6066' }}>
                                      <Plus size={12} /> Add idea
                                    </button>
                                  )}
                                </div>
                              </Field>
                              <button onClick={() => setEditingMonth(null)} style={{ alignSelf: 'flex-end', padding: '8px 16px', borderRadius: 999, border: 'none', backgroundColor: INK, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Done</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 26px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #eceef1', backgroundColor: '#fff' }}>
          <button onClick={skip} style={{ padding: '10px 16px', borderRadius: 999, border: 'none', backgroundColor: 'transparent', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: MUTED }}>
            Skip for now
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            {step > 0 && (
              <button onClick={() => setStep(step - 1)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '11px 20px', borderRadius: 999, border: '1.5px solid #e4e6ea', backgroundColor: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: INK }}>
                <ArrowLeft size={14} /> Back
              </button>
            )}
            {step < 3 && (
              <button onClick={() => void goNext()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '11px 22px', borderRadius: 999, border: 'none', backgroundColor: INK, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                Continue <ArrowRight size={14} />
              </button>
            )}
            {step === 3 && (
              <button onClick={launch} disabled={generating || launching || !ob.plan.length}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 24px', borderRadius: 999, border: 'none', backgroundColor: generating || !ob.plan.length ? '#c3c7cd' : INK, color: '#fff', cursor: generating || !ob.plan.length ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 800 }}>
                <Sparkles size={14} color="#c7f441" /> {launching ? 'Launching…' : 'Launch my workspace'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
