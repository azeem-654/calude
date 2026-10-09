/**
 * Website funnel — how many visitors reached each step, from a visit to the
 * site to a project's first output (routes/sitePlan.ts `funnel`).
 *
 * Distinct visitors per step over the window, and the share of the step
 * above that each one kept. Counts only: nothing a visitor typed is stored,
 * and browsers asking not to be tracked are not counted — said under the
 * table, because a funnel that silently under-counts reads as a worse site.
 */
import { useEffect, useState } from 'react';
import { BarChart3, Loader } from 'lucide-react';
import { sessionToken } from '../../services/auth';
import { API_BASE } from '../../services/apiBase';
import { solutionByKey } from '../../services/projectSolutions';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';

const LABEL: Record<string, string> = {
  homepage_view: 'Visited the site',
  hero_cta_clicked: 'Pressed a hero button',
  wizard_started: 'Opened Find my solution',
  wizard_intent_submitted: 'Said what they want',
  wizard_question_answered: 'Answered a question',
  wizard_completed: 'Finished the questions',
  solution_viewed: 'Saw their plan',
  solution_edited: 'Changed their plan',
  trial_cta_clicked: 'Pressed Start free / Build this',
  signup_started: 'Opened sign-up',
  signup_completed: 'Created an account',
  autopilot_project_build_started: 'Project build started',
  autopilot_project_created: 'Project created',
  first_workflow_created: 'First workflow created',
  first_value_reached: 'Reached a first output',
};

/* Steps a visitor may skip without leaving the funnel: they are shown, but the
   share is measured against the last step everyone passes through. */
const SIDE = new Set(['hero_cta_clicked', 'wizard_question_answered', 'solution_edited']);

interface Step { event: string; visitors: number; phone: number; desktop: number }

export default function SiteFunnel() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{ steps: Step[]; solutions: { solution: string; n: number }[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setData(null); setError('');
    void fetch(`${API_BASE}/api/site-plan.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'funnel', token: sessionToken(), days }),
    }).then(r => r.json()).then((d: { success?: boolean; error?: string; steps?: Step[]; solutions?: { solution: string; n: number }[] }) => {
      if (!alive) return;
      if (d.success) setData({ steps: d.steps ?? [], solutions: d.solutions ?? [] });
      else setError(d.error ?? 'The funnel could not be read.');
    }).catch(() => { if (alive) setError('The funnel could not be read — the server did not answer.'); });
    return () => { alive = false; };
  }, [days]);

  const top = Math.max(1, ...(data?.steps ?? []).map(s => s.visitors));
  let prev = 0;
  return (
    <section style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: 'clamp(14px, 2.5vw, 20px)' }} aria-label="Website funnel">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <BarChart3 size={16} /> Website funnel
        </h2>
        <div role="group" aria-label="Period" style={{ display: 'flex', gap: 4 }}>
          {[7, 30, 90].map(d => (
            <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d}
              style={{ border: `1px solid ${days === d ? INK : LINE}`, background: days === d ? INK : '#fff', color: days === d ? '#fff' : INK, borderRadius: 99, padding: '5px 11px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              {d} days
            </button>
          ))}
        </div>
      </div>
      <p style={{ margin: '6px 0 12px', fontSize: 13, color: MUTED, lineHeight: 1.55 }}>
        Different people at each step of protectedcentral.com → Find my solution → sign-up → first output. Each percentage is the share of the step above it.
      </p>
      {error && <p role="alert" style={{ color: '#991b1b', fontSize: 13.5 }}>{error}</p>}
      {!data && !error && <p style={{ color: MUTED, fontSize: 13.5, display: 'flex', gap: 6, alignItems: 'center' }}><Loader size={14} className="spin" /> Reading…</p>}
      {data && (
        <div style={{ display: 'grid', gap: 6 }} data-testid="site-funnel">
          {data.steps.map(s => {
            const share = SIDE.has(s.event) || !prev ? '' : `${Math.round((s.visitors / Math.max(1, prev)) * 100)}%`;
            if (!SIDE.has(s.event)) prev = s.visitors;
            return (
              <div key={s.event} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1.2fr) minmax(80px, 2fr) 56px 46px', gap: 10, alignItems: 'center', fontSize: 13 }}>
                <span style={{ color: SIDE.has(s.event) ? MUTED : INK, fontWeight: SIDE.has(s.event) ? 500 : 650 }}>{LABEL[s.event] ?? s.event}</span>
                <span style={{ height: 10, borderRadius: 99, background: '#f1f3f7', overflow: 'hidden' }} title={`${s.desktop} on a computer, ${s.phone} on a phone`}>
                  <i style={{ display: 'block', height: '100%', width: `${(s.visitors / top) * 100}%`, background: SIDE.has(s.event) ? '#c7c2f5' : 'linear-gradient(90deg, #5b46e5, #a3e635)', borderRadius: 99 }} />
                </span>
                <b style={{ textAlign: 'right', color: INK }} data-event={s.event}>{s.visitors.toLocaleString()}</b>
                <span style={{ color: MUTED, textAlign: 'right' }}>{share}</span>
              </div>
            );
          })}
          {data.solutions.length > 0 && (
            <p style={{ margin: '10px 0 0', fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
              <b style={{ color: INK }}>What finished plans were for:</b>{' '}
              {data.solutions.map(x => `${solutionByKey(x.solution)?.label ?? x.solution} (${x.n})`).join(' · ')}
            </p>
          )}
          <p style={{ margin: '6px 0 0', fontSize: 12, color: MUTED }}>
            Counts only — nothing a visitor typed is kept. Browsers that ask not to be tracked are not counted.
          </p>
        </div>
      )}
    </section>
  );
}
