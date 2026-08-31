/**
 * The setup checklist, on the dashboard.
 *
 * What a new workspace meets first. It replaces the AI onboarding wizard's
 * auto-open — that wizard plans a year of content, which is a fine thing to do
 * *fifth*, and a strange thing to be asked before the product can send an
 * email. It is still here; it is the last step rather than the first screen.
 *
 * Every step reads its own state (services/setup.ts), so this is a view of what
 * is actually configured rather than a list of things somebody clicked past.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, AlertTriangle, X, Sparkles } from 'lucide-react';
import { setupProgress, setupHidden, hideSetup, type SetupStep } from '../../services/setup';

const INK = '#17191c';
const MUTED = '#6b7280';

function StepRow({ step, index, onGo }: { step: SetupStep; index: number; onGo: (s: SetupStep) => void }) {
  const done = step.state === 'done';
  const partial = step.state === 'partial';

  return (
    <li className="setup-step" style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '13px 14px', borderRadius: 14,
      background: done ? 'rgba(63,145,66,0.06)' : '#fff',
      border: `1px solid ${done ? 'rgba(63,145,66,0.22)' : '#e9ecf2'}`,
    }}>
      {/* The number is the point of a step-by-step list; it becomes a tick when
          the step is done rather than disappearing, so the list keeps its shape. */}
      <span aria-hidden="true" style={{
        flexShrink: 0, width: 26, height: 26, borderRadius: 9,
        display: 'grid', placeItems: 'center',
        fontSize: 12, fontWeight: 800,
        background: done ? '#3f9142' : partial ? '#f6c445' : INK,
        color: done || partial ? (partial ? '#3a2f00' : '#fff') : '#fff',
      }}>
        {done ? <Check size={14} strokeWidth={3} /> : index + 1}
      </span>

      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{step.title}</span>
          {step.blocking && !done && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 999,
              background: '#fdecec', color: '#b42318',
            }}>
              <AlertTriangle size={10} /> Required to send
            </span>
          )}
        </span>
        <span style={{ display: 'block', fontSize: 12, color: MUTED, marginTop: 3, lineHeight: 1.45 }}>
          {done ? step.detail : step.why}
        </span>
        {!done && step.detail && (
          <span style={{ display: 'block', fontSize: 11.5, color: partial ? '#8a6d00' : '#98a1ae', marginTop: 3, fontWeight: 600 }}>
            {step.detail}
          </span>
        )}
      </span>

      {!done && (
        <button
          onClick={() => onGo(step)}
          style={{
            flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '7px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: INK, color: '#fff', fontSize: 12, fontWeight: 700,
          }}
        >
          {step.action} <ChevronRight size={13} />
        </button>
      )}
    </li>
  );
}

export default function SetupChecklist({ onOpenAiWizard, refreshKey = 0 }: {
  onOpenAiWizard?: () => void;
  refreshKey?: number;
}) {
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(setupHidden);
  const [expanded, setExpanded] = useState(true);

  /* Re-read on every refresh tick: the steps come from storage, and finishing
     one in another tab or on another screen should show here without a reload. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const progress = useMemo(() => setupProgress(), [refreshKey, hidden]);

  if (hidden || progress.complete) return null;

  const pct = Math.round((progress.done / progress.total) * 100);

  const go = (s: SetupStep) => {
    /* The portfolio step opens the AI wizard: its first screen asks for exactly
       the four things that step is about, so sending somebody to a Settings
       panel that asked them again would be two places to enter one thing. */
    if (s.id === 'portfolio' && onOpenAiWizard) { onOpenAiWizard(); return; }
    navigate(s.route);
  };

  return (
    <section className="setup-card slide-up" aria-label="Set up your workspace" style={{
      background: 'rgba(255,255,255,0.72)',
      backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      border: '1px solid rgba(255,255,255,0.6)',
      borderRadius: 24, padding: 18,
      boxShadow: '0 18px 44px -18px rgba(16,24,40,0.24)',
    }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <span style={{
          width: 38, height: 38, borderRadius: 12, flexShrink: 0,
          display: 'grid', placeItems: 'center', background: INK, color: '#fff',
        }}>
          <Sparkles size={18} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>
            Set up your workspace
          </h2>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
            {progress.blockers.length > 0
              ? `${progress.blockers.length} of these must be done before anything can send.`
              : progress.next
                ? `Next: ${progress.next.title.toLowerCase()}.`
                : 'Almost there.'}
          </p>
        </span>

        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: INK, whiteSpace: 'nowrap' }}>
            {progress.done} / {progress.total}
          </span>
          <button
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: MUTED, padding: 4, display: 'flex' }}
          >
            <ChevronRight size={16} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s' }} />
          </button>
          <button
            onClick={() => { hideSetup(true); setHidden(true); }}
            title="Hide this. Settings → it can be brought back."
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: MUTED, padding: 4, display: 'flex' }}
          >
            <X size={15} />
          </button>
        </span>
      </header>

      {/* The bar is the only thing that has to be legible at a glance. */}
      <div style={{ height: 6, borderRadius: 999, background: '#e9ecf2', overflow: 'hidden', margin: '14px 0 0' }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: 999,
          background: progress.blockers.length ? '#f6c445' : '#3f9142',
          transition: 'width 420ms cubic-bezier(0.22,1,0.36,1)',
        }} />
      </div>

      {expanded && (
        <ol style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {progress.steps.map((s, i) => <StepRow key={s.id} step={s} index={i} onGo={go} />)}
        </ol>
      )}
    </section>
  );
}
