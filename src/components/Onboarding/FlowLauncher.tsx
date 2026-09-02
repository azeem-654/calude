/**
 * Pick an outcome, read what will be written, then create it.
 *
 * Three screens, and the middle one is the point. A chain that fans a campaign
 * into five modules on one click is a chain nobody presses twice, so the plan
 * is shown in full — the actual subject lines, the actual texts — before
 * anything exists. What you approve is what lands.
 *
 * Nothing here sends. Every record is created as a draft, in the module that
 * owns it, stamped with where it came from and removable in one action.
 */
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  X, ChevronRight, ChevronLeft, Loader, Mail, MessageSquare, Image, FileText,
  Clapperboard, LayoutTemplate, Check, Sparkles, AlertTriangle, Undo2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  FLOWS, planFlow, planCounts, type FlowPlan, type ChannelId, type BusinessFlow,
} from '../../services/businessFlow';
import { applyPlan, undoRun, loadRuns, type FlowApi } from '../../services/flowRun';

const INK = '#17191c';
const MUTED = '#5b6472';
const LINE = '#e6e9f0';

const CHANNELS: { id: ChannelId; label: string; icon: typeof Mail; where: string }[] = [
  { id: 'email', label: 'Email sequence', icon: Mail, where: 'Marketing → Sequences' },
  { id: 'sms', label: 'SMS campaign', icon: MessageSquare, where: 'Marketing → Campaigns' },
  { id: 'social', label: 'Social posts', icon: Image, where: 'Social Creator' },
  { id: 'blog', label: 'Blog project', icon: FileText, where: 'Blog Automation' },
  { id: 'short', label: 'Short video script', icon: Clapperboard, where: 'Kept here to shoot' },
  { id: 'landing', label: 'Landing page', icon: LayoutTemplate, where: 'Funnels' },
];

/* ── Reading the plan ────────────────────────────────────────────────────── */

function Preview({ plan }: { plan: FlowPlan }) {
  const [tab, setTab] = useState<ChannelId>('email');

  const body = () => {
    switch (tab) {
      case 'email':
        return plan.emails.map((e, i) => (
          <article key={i} style={item}>
            <div style={itemHead}>
              <span style={dayChip}>Day {e.day}</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{e.subject}</span>
            </div>
            <p style={{ ...bodyText, whiteSpace: 'pre-wrap' }}>{e.body}</p>
          </article>
        ));
      case 'sms':
        return plan.sms.map((m, i) => (
          <article key={i} style={item}>
            <div style={itemHead}>
              <span style={dayChip}>Day {m.day}</span>
              <span style={{ fontSize: 11.5, color: MUTED, fontWeight: 600 }}>{m.body.length} characters</span>
            </div>
            <p style={bodyText}>{m.body}</p>
          </article>
        ));
      case 'social':
        return plan.social.map((p, i) => (
          <article key={i} style={item}>
            <div style={itemHead}>
              <span style={dayChip}>Day {p.day}</span>
              <span style={{ ...dayChip, background: '#eef2ff', color: '#3730a3' }}>{p.platform}</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{p.headline}</span>
            </div>
            <p style={bodyText}>{p.caption}</p>
            <p style={{ ...bodyText, color: '#6366f1', marginTop: 4 }}>{p.hashtags.join(' ')}</p>
          </article>
        ));
      case 'blog':
        return (
          <article style={item}>
            <span style={{ fontSize: 14, fontWeight: 800, color: INK }}>{plan.blog.title}</span>
            <p style={bodyText}>{plan.blog.angle}</p>
            <ol style={{ margin: '10px 0 0', paddingLeft: 18, color: MUTED, fontSize: 12.5, lineHeight: 1.7 }}>
              {plan.blog.outline.map((o, i) => <li key={i}>{o}</li>)}
            </ol>
            <p style={{ ...bodyText, marginTop: 10 }}>
              <strong style={{ color: INK }}>Search terms:</strong> {plan.blog.keywords.join(' · ')}
            </p>
          </article>
        );
      case 'short':
        return (
          <article style={item}>
            <span style={{ fontSize: 14, fontWeight: 800, color: INK }}>{plan.short.title}</span>
            <p style={{ ...bodyText, fontWeight: 700, color: INK }}>“{plan.short.hook}”</p>
            <ol style={{ margin: '10px 0 0', paddingLeft: 18, color: MUTED, fontSize: 12.5, lineHeight: 1.8 }}>
              {plan.short.script.map((l, i) => <li key={i}>{l}</li>)}
            </ol>
            {/* Said here rather than discovered later: AI Shorts cuts clips out
                of footage, and there is no footage yet. */}
            <p style={{ ...bodyText, marginTop: 10, color: '#8a6d00' }}>
              A script to read to camera. AI Shorts cuts clips out of a video you upload, so this becomes a project
              once you have the footage.
            </p>
          </article>
        );
      case 'landing':
        return (
          <article style={item}>
            <span style={{ fontSize: 14, fontWeight: 800, color: INK }}>{plan.landing.title}</span>
            <p style={bodyText}>{plan.landing.subhead}</p>
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, color: MUTED, fontSize: 12.5, lineHeight: 1.7 }}>
              {plan.landing.bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
            <span style={{ display: 'inline-block', marginTop: 12, padding: '7px 14px', borderRadius: 9, background: INK, color: '#fff', fontSize: 12.5, fontWeight: 700 }}>
              {plan.landing.cta}
            </span>
          </article>
        );
    }
  };

  const counts = planCounts(plan);

  return (
    <>
      {/* Sticky and wrapping, both for the same reason: below this is a
          170-word email. Six chips in a horizontal scroller put half the
          channels off the side of a phone with nothing to say so, and a
          non-sticky strip scrolls out of reach by the time you have read one
          message. */}
      <div
        style={{
          display: 'flex', gap: 6, flexWrap: 'wrap', minWidth: 0,
          position: 'sticky', top: 0, zIndex: 2,
          padding: '10px 0 8px', margin: '-10px 0 0', background: '#f7f8fa',
        }}
      >
        {CHANNELS.map(c => (
          <button key={c.id} onClick={() => setTab(c.id)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
            padding: '7px 11px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700,
            border: `1px solid ${tab === c.id ? INK : LINE}`,
            background: tab === c.id ? INK : '#fff', color: tab === c.id ? '#fff' : MUTED,
          }}>
            <c.icon size={12} /> {c.label.split(' ')[0]}
            <span style={{ opacity: 0.7 }}>{counts[c.id]}</span>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>{body()}</div>
    </>
  );
}

/* ── The launcher ────────────────────────────────────────────────────────── */

export default function FlowLauncher({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
  const app = useApp();
  const navigate = useNavigate();
  const [step, setStep] = useState<'pick' | 'review' | 'done'>('pick');
  const [flow, setFlow] = useState<BusinessFlow | null>(null);
  const [plan, setPlan] = useState<FlowPlan | null>(null);
  const [readiness, setReadiness] = useState(1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<Set<ChannelId>>(new Set(CHANNELS.map(c => c.id)));
  const [result, setResult] = useState<{ created: string[]; runId?: string; skipped: { channel: ChannelId; why: string }[] } | null>(null);

  const api: FlowApi = useMemo(() => ({
    addSequence: app.addSequence,
    addCampaign: app.addCampaign,
    addSocialPost: app.addSocialPost,
    addFunnel: app.addFunnel,
    deleteSequence: app.deleteSequence,
    deleteCampaign: app.deleteCampaign,
    deleteSocialPosts: app.deleteSocialPosts,
    deleteFunnel: app.deleteFunnel,
  }), [app]);

  const choose = async (f: BusinessFlow) => {
    setFlow(f);
    setBusy(true);
    const r = await planFlow(f.id);
    setPlan(r.plan);
    setReadiness(r.readiness);
    setNote(r.note ?? '');
    setBusy(false);
    setStep('review');
  };

  const create = () => {
    if (!plan) return;
    setBusy(true);
    const r = applyPlan(plan, [...chosen], api);
    setBusy(false);
    if (!r.ok && !r.created.length) {
      app.addNotification(r.error ?? 'Nothing could be created.', 'error');
      return;
    }
    setResult({ created: r.created, runId: r.run?.id, skipped: r.skipped });
    setStep('done');
    onDone?.();
  };

  const takeBack = () => {
    if (!result?.runId) return;
    const r = undoRun(result.runId, api);
    app.addNotification(r.ok ? `Removed ${r.removed.join(', ')}.` : 'That run was already removed.', r.ok ? 'success' : 'info');
    onDone?.();
    onClose();
  };

  const toggle = (id: ChannelId) => setChosen(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const priorRuns = useMemo(() => (step === 'pick' ? loadRuns() : []), [step]);

  /*
   * Through a portal, because the dashboard sits inside stacking contexts of
   * its own — a fixed overlay rendered in place is trapped in whichever one
   * contains it, and the sticky app header, on a far lower z-index, paints
   * straight over the dialog's title and its close button.
   */
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Build a campaign from your portfolio"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(16,24,40,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'clamp(8px, 3vw, 40px)',
      }}
    >
      {/*
        One scroller, not two.
        
        The shell is capped to the viewport and lays out as a column: header,
        a body that takes the remaining height and scrolls, footer. The obvious
        alternative — a tall dialog inside a scrolling backdrop, with the body
        also capped — gives you two scrollbars that fight, and a sticky element
        inside the inner one that the outer one can slide out from under.
      */}
      <div style={{
        width: '100%', maxWidth: 720, maxHeight: '100%',
        display: 'flex', flexDirection: 'column', minHeight: 0,
        background: '#f7f8fa', borderRadius: 22,
        boxShadow: '0 30px 80px -20px rgba(16,24,40,0.5)', overflow: 'hidden',
      }}>
        <header style={{
          display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 18px',
          background: '#fff', borderBottom: `1px solid ${LINE}`, flexShrink: 0,
        }}>
          <span style={{ width: 36, height: 36, borderRadius: 11, background: INK, color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Sparkles size={17} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 16.5, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>
              {step === 'pick' ? 'What do you want to happen?' : step === 'review' ? flow?.label : 'Created'}
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
              {step === 'pick'
                ? 'Pick the outcome. Everything else is written from your company portfolio.'
                : step === 'review'
                  ? 'Read it before anything is created. Nothing is sent — every record lands as a draft.'
                  : 'All of it is in your modules now, tagged so you can find it again.'}
            </p>
          </span>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', color: MUTED, padding: 4, display: 'flex', flexShrink: 0 }}>
            <X size={17} />
          </button>
        </header>

        <div style={{ padding: 18, flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {/* ── Pick ── */}
          {step === 'pick' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
                {FLOWS.map(f => (
                  <button key={f.id} onClick={() => choose(f)} disabled={busy} style={{
                    textAlign: 'left', padding: '13px 14px', borderRadius: 14, cursor: 'pointer',
                    border: `1px solid ${LINE}`, background: '#fff', minWidth: 0,
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>{f.label}</span>
                      {busy && flow?.id === f.id && <Loader size={12} style={{ animation: 'spin 0.8s linear infinite' }} />}
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>{f.blurb}</span>
                  </button>
                ))}
              </div>

              {priorRuns.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>Already built</span>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {priorRuns.slice(0, 4).map(r => (
                      <li key={r.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                        padding: '9px 11px', borderRadius: 11, background: '#fff', border: `1px solid ${LINE}`,
                      }}>
                        <span style={{ flex: 1, minWidth: 120, fontSize: 12.5, fontWeight: 700, color: INK }}>{r.name}</span>
                        <span style={{ fontSize: 11.5, color: MUTED }}>{r.created.join(', ')}</span>
                        <button
                          onClick={() => {
                            const u = undoRun(r.id, api);
                            app.addNotification(u.ok ? `Removed ${u.removed.join(', ')}.` : 'Already removed.', 'success');
                            onDone?.();
                            setStep('pick');
                          }}
                          style={{ ...ghostBtn, color: '#b42318' }}
                        >
                          <Undo2 size={12} /> Undo
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* ── Review ── */}
          {step === 'review' && plan && (
            <>
              <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 14 }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>{plan.name}</span>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.55 }}>{plan.promise}</p>
                <p style={{ margin: '8px 0 0', fontSize: 11.5, color: MUTED }}>
                  Goes to <strong style={{ color: INK }}>{plan.audience}</strong> ·{' '}
                  {plan.writtenBy === 'ai' ? 'written by the AI' : 'written from your portfolio'}
                </p>
              </div>

              {/* A portfolio with holes in it produces copy with generalities in
                  it. Better to say so here than to let somebody wonder why. */}
              {readiness < 1 && (
                <p style={warn}>
                  <AlertTriangle size={12} style={{ verticalAlign: -1, marginRight: 5 }} />
                  {Math.round(readiness * 4)} of 4 portfolio fields are filled in. Finish it and re-run this — the copy
                  gets specific in proportion to what it knows.
                </p>
              )}
              {note && <p style={warn}>{note}</p>}

              <div style={{ marginTop: 14 }}><Preview plan={plan} /></div>

              <div style={{ marginTop: 18 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>Create which of these?</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginTop: 8 }}>
                  {CHANNELS.map(c => {
                    const on = chosen.has(c.id);
                    return (
                      <button key={c.id} onClick={() => toggle(c.id)} aria-pressed={on} style={{
                        display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left',
                        padding: '10px 11px', borderRadius: 12, cursor: 'pointer', minWidth: 0,
                        border: `1.5px solid ${on ? INK : LINE}`, background: on ? '#fff' : '#fbfbfc',
                      }}>
                        <span style={{
                          width: 20, height: 20, borderRadius: 6, flexShrink: 0, display: 'grid', placeItems: 'center',
                          background: on ? INK : '#e9ecf2', color: '#fff',
                        }}>
                          {on ? <Check size={12} strokeWidth={3} /> : null}
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: INK }}>{c.label}</span>
                          <span style={{ display: 'block', fontSize: 11, color: MUTED }}>{c.where}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* ── Done ── */}
          {step === 'done' && result && (
            <>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {result.created.map(c => (
                  <li key={c} style={{
                    display: 'flex', alignItems: 'center', gap: 9, padding: '11px 12px',
                    borderRadius: 12, background: '#fbfdfb', border: '1px solid #cfe6d2',
                  }}>
                    <Check size={14} color="#1e6b32" strokeWidth={3} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>{c}</span>
                  </li>
                ))}
              </ul>

              {result.skipped.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {result.skipped.map(s => (
                    <li key={s.channel} style={{ ...warn, margin: 0 }}>
                      <strong>{CHANNELS.find(c => c.id === s.channel)?.label}</strong> — {s.why}
                    </li>
                  ))}
                </ul>
              )}

              <p style={{ margin: '14px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
                Everything is a draft, tagged “Business flow” wherever it landed. Read it, change what you want, then
                turn it on in its own module.
              </p>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                <button onClick={() => { navigate('/marketing'); onClose(); }} style={darkBtn}>Open Marketing</button>
                <button onClick={() => { navigate('/social-creator'); onClose(); }} style={ghostBtn}>Open Social Creator</button>
                <button onClick={takeBack} style={{ ...ghostBtn, color: '#b42318', marginLeft: 'auto' }}>
                  <Undo2 size={12} /> Undo all of it
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        {step !== 'done' && (
          <footer style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px',
            background: '#fff', borderTop: `1px solid ${LINE}`, flexWrap: 'wrap', flexShrink: 0,
          }}>
            {step === 'review' && (
              <button onClick={() => setStep('pick')} style={ghostBtn}><ChevronLeft size={13} /> Back</button>
            )}
            <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: MUTED }}>
              {step === 'pick' ? 'Nothing is created until you have read it.' : `${chosen.size} of ${CHANNELS.length} selected`}
            </span>
            {step === 'review' && (
              <button onClick={create} disabled={busy || !chosen.size} style={darkBtn}>
                {busy ? <Loader size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : null}
                Create {chosen.size} thing{chosen.size === 1 ? '' : 's'} <ChevronRight size={13} />
              </button>
            )}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ── Style ───────────────────────────────────────────────────────────────── */

const item: React.CSSProperties = {
  background: '#fff', border: `1px solid ${LINE}`, borderRadius: 13, padding: '12px 13px',
};

const itemHead: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 6,
};

const dayChip: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 999,
  background: '#f1f3f7', color: INK, flexShrink: 0,
};

const bodyText: React.CSSProperties = {
  margin: 0, fontSize: 12.5, color: MUTED, lineHeight: 1.6,
};

const warn: React.CSSProperties = {
  margin: '10px 0 0', fontSize: 12, lineHeight: 1.55, color: '#8a6d00',
  background: '#fff9e6', border: '1px solid #f6e2a8', borderRadius: 10, padding: '8px 11px',
};

const btnBase: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px',
  borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: 'none',
};

const darkBtn: React.CSSProperties = { ...btnBase, background: INK, color: '#fff' };
const ghostBtn: React.CSSProperties = { ...btnBase, background: '#f1f3f7', color: INK };
