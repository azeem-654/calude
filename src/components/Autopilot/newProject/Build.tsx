/**
 * Step seven: the build, as it happens.
 *
 * The percentage is the share of real operations that have returned (see
 * buildRunner.ts). The bot says what it is doing in the first person, one line
 * at a time, and every line is about the step that is actually running — "I
 * found 6 services" only appears when the profile it read listed six.
 *
 * When it finishes it says what was made, links to the first output if one
 * was made, and takes the customer into the project.
 */
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, Loader, AlertTriangle, XCircle, ArrowRight, ExternalLink } from 'lucide-react';
import AutopilotBot from '../AutopilotBot';
import { percentOf, type BuildResult, type BuildStep } from './buildRunner';
import ContactsCheck from './ContactsCheck';
import type { WorkflowNode } from '../../../services/autopilot';

export default function Build({ steps, say, result, reach = [] }: {
  steps: BuildStep[];
  /** The workflows that email or text people — for "who will this reach?". */
  reach?: { name: string; nodes?: WorkflowNode[] }[];
  say: string;
  result: BuildResult | null;
}) {
  const navigate = useNavigate();
  const pct = percentOf(steps);
  const now = steps.find(s => s.state === 'now');
  /* The one step with no knowable length. Drawn as working, not as a number. */
  const indeterminate = now?.key === 'first' || now?.key === 'profile';
  const done = !!result;
  const failed = !!result?.fatal;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <span className={done ? '' : 'np-glow'} style={{ borderRadius: 18, flexShrink: 0 }}>
          <AutopilotBot size={58} awake busy={!done} />
        </span>
        <div style={{ minWidth: 0 }}>
          <h2 className="wz-title" style={{ fontSize: 'clamp(22px, 3.6vw, 30px)' }}>
            {failed ? 'The build stopped' : done ? <>Your Autopilot is <span className="wz-accent">ready</span></> : <>Building <span className="wz-accent">your Autopilot</span></>}
          </h2>
          <p aria-live="polite" style={{ margin: '6px 0 0', fontSize: 14.5, color: '#4c39d1', fontWeight: 600, lineHeight: 1.5 }}>
            {failed ? result?.fatal : done ? 'Everything below is a real record, and it keeps running without this open.' : say}{!done && <> <span className="np-think" aria-hidden><i /><i /><i /></span></>}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 7 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: '#17191c', letterSpacing: '-0.03em' }}>{pct}%</span>
          <span style={{ fontSize: 12.5, color: '#6b7280', textAlign: 'right' }}>
            {now ? `${now.label}${now.detail && now.key === 'products' ? ` — ${now.detail}` : ''}` : done ? 'Every step has finished.' : ''}
          </span>
        </div>
        <div className="np-bar" data-indeterminate={indeterminate && !done ? '1' : '0'} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${Math.max(pct, 3)}%` }} />
        </div>
      </div>

      <ol className="np-stages">
        {steps.map(s => (
          <li key={s.key} className="np-stage" data-state={s.state === 'todo' ? 'todo' : 'x'}>
            <span className="np-stage-icon">
              {s.state === 'done' ? <CheckCircle2 size={17} color="#16a34a" />
                : s.state === 'now' ? <Loader size={17} color="#5b46e5" className="spin" />
                  : s.state === 'warn' ? <AlertTriangle size={17} color="#b45309" />
                    : s.state === 'failed' ? <XCircle size={17} color="#b42318" />
                      : <Circle size={17} color="#cbd5e1" />}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: s.state === 'now' ? 700 : 500 }}>{s.label}</span>
              {s.detail && (
                <span style={{ display: 'block', fontSize: 12.5, color: s.state === 'warn' || s.state === 'failed' ? '#92400e' : '#6b7280', marginTop: 2, lineHeight: 1.5 }}>
                  {s.detail}
                </span>
              )}
              {s.link && done && (
                <button type="button" onClick={() => navigate(s.link!.route)} style={{ marginTop: 5, display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', padding: 0, color: '#5b46e5', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {s.link.label} <ExternalLink size={11} />
                </button>
              )}
            </span>
          </li>
        ))}
      </ol>

      {done && !failed && (
        <div className="np-rise" style={{ padding: '14px 16px', borderRadius: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 14, color: '#14532d', lineHeight: 1.6 }}>
          Created {result!.created.workflows} workflow{result!.created.workflows === 1 ? '' : 's'}
          {result!.created.activated ? `, ${result!.created.activated} switched on` : ''}
          {result!.created.products ? `, and imported ${result!.created.products} product${result!.created.products === 1 ? '' : 's'}` : ''}.
          {result!.first && <> Your first one is already made. <ArrowRight size={12} style={{ verticalAlign: 'middle' }} /></>}
          {result!.problems.length > 0 && <> {result!.problems.length} step{result!.problems.length === 1 ? '' : 's'} need{result!.problems.length === 1 ? 's' : ''} you — marked above.</>}
        </div>
      )}

      {done && !failed && <ContactsCheck flows={reach} />}
    </div>
  );
}
