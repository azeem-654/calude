/**
 * When each of a project's workflows runs.
 *
 * Two kinds, said differently: a workflow on a clock ("Every weekday — last
 * ran Tuesday, next from Wednesday morning") and one that waits for something
 * to happen ("When a form is submitted"). The next run is an estimate from the
 * cadence and the last run, and says so: the tick runs every five minutes, and
 * a schedule that is off does not run at all, which is the first thing it says.
 */
import { Clock, Zap, PauseCircle } from 'lucide-react';
import type { AgentRun, ProjectWorkflow } from '../../services/autopilot';
import { nodeDetail, scheduleLabel } from './workflowNodes';
import { T } from './theme';

const HOURS: Record<string, number> = { hourly: 1, daily: 20, weekdays: 20, weekly: 156, monthly: 696 };
const DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** The earliest moment the server would consider it due again. */
function nextRun(config: Record<string, string>, lastRunAt: string | null, now = Date.now()): Date {
  const base = lastRunAt ? Date.parse(lastRunAt) + (HOURS[config.cadence ?? 'daily'] ?? 20) * 3_600_000 : now;
  let t = new Date(Math.max(base, now));
  const days = String(config.days ?? '').split(/[\s,]+/).map(d => DAY.indexOf(d.slice(0, 3).toLowerCase())).filter(i => i >= 0);
  const allowed = days.length ? days : config.cadence === 'weekdays' ? [1, 2, 3, 4, 5] : [];
  if (allowed.length) {
    for (let i = 0; i < 8 && !allowed.includes(t.getUTCDay()); i++) {
      t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1));
    }
  }
  return t;
}

const when = (d: Date) => {
  const diff = d.getTime() - Date.now();
  if (diff <= 5 * 60_000) return 'on the next pass (within five minutes)';
  return d.toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' });
};

export default function ProjectSchedule({ flows, runs }: { flows: ProjectWorkflow[]; runs: AgentRun[] }) {
  if (!flows.length) {
    return <p style={{ margin: 0, fontSize: 12.5, color: T.muted }}>No workflows yet, so nothing is scheduled.</p>;
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {flows.map(f => {
        const trigger = f.nodes.find(n => n.type === 'trigger');
        const scheduled = trigger?.config?.event === 'schedule';
        const last = runs.filter(r => r.workflowId === f.id).map(r => r.createdAt).sort().pop() ?? null;
        const on = f.status === 'active';
        return (
          <div key={f.id} style={{
            display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 12px', borderRadius: 12,
            border: `1px solid ${T.line}`, background: T.panel,
          }}>
            {!on ? <PauseCircle size={16} color={T.faint} style={{ flexShrink: 0, marginTop: 1 }} />
              : scheduled ? <Clock size={16} color={T.accent} style={{ flexShrink: 0, marginTop: 1 }} />
                : <Zap size={16} color={T.accent} style={{ flexShrink: 0, marginTop: 1 }} />}
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: T.ink }}>{f.name}</span>
              <span style={{ display: 'block', fontSize: 12, color: T.muted, marginTop: 2, lineHeight: 1.5 }}>
                {scheduled ? scheduleLabel(trigger?.config ?? {}) : `When ${nodeDetail('trigger', trigger?.config ?? {}).toLowerCase()}`}
                {!on && ' — not running: this workflow is switched off.'}
                {on && scheduled && ` · last ran ${last ? new Date(last).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'never'} · next ${when(nextRun(trigger?.config ?? {}, last))} (estimate)`}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
