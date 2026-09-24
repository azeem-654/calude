/**
 * Step six: the last thing read before anything is created.
 *
 * Counts and lists, not prose — this is the screen somebody checks against
 * what they meant, and "3 workflows, 2 AI agents, weekdays" is checkable in a
 * way a paragraph is not. Every number here is the length of a list the build
 * is about to walk.
 */
import { Workflow, Bot, Clock, PackageCheck, Hand, Plug, ArrowRightLeft } from 'lucide-react';
import type { Blueprint } from '../../../services/projectIntake';
import { REQUIREMENT_INFO } from '../../../services/projectSolutions';

export default function Review({ bp }: { bp: Blueprint }) {
  const connected = bp.requirements.filter(r => REQUIREMENT_INFO[r].kind !== 'optional').map(r => REQUIREMENT_INFO[r].label);
  const rows: { icon: typeof Workflow; label: string; value: string; list?: string[] }[] = [
    { icon: Workflow, label: 'Workflows', value: String(bp.workflows.length), list: bp.workflows.map(w => w.name) },
    { icon: Bot, label: 'AI agents', value: String(bp.agents.length), list: bp.agents.map(a => a.name) },
    { icon: Clock, label: 'Schedules', value: bp.schedules.length ? String(bp.schedules.length) : 'None', list: bp.schedules },
    { icon: PackageCheck, label: 'What you will get', value: String(bp.outputs.length), list: bp.outputs },
    { icon: Hand, label: 'What is yours to do', value: String(bp.manual.length + bp.setup.filter(s => s.by === 'you').length), list: [...bp.setup.filter(s => s.by === 'you').map(s => s.label), ...bp.manual] },
    { icon: Plug, label: 'Connected systems', value: String(connected.length), list: connected },
    { icon: ArrowRightLeft, label: 'Handed to you', value: bp.destinations.length ? String(bp.destinations.length) : 'None', list: bp.destinations.map(d => d.label) },
  ];
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div>
        <h2 className="wz-title">Ready to <span className="wz-accent">build</span></h2>
        <p style={{ margin: '9px 0 0', fontSize: 14.5, color: '#6b7280', lineHeight: 1.55 }}>
          This is exactly what will be created in <b style={{ color: '#17191c' }}>{bp.name}</b>. Nothing that sends to a person is switched on without you.
        </p>
      </div>
      <div className="np-bp-grid">
        {rows.map(r => (
          <div key={r.label} className="np-bp-box np-rise">
            <h4><r.icon size={13} /> {r.label} <span style={{ marginLeft: 'auto', fontSize: 16, color: '#17191c', letterSpacing: 0 }}>{r.value}</span></h4>
            {r.list && r.list.length > 0
              ? <ul>{r.list.map(i => <li key={i}><span style={{ color: '#8b93a3' }}>•</span><span>{i}</span></li>)}</ul>
              : <p style={{ margin: 0, fontSize: 13, color: '#8b93a3' }}>—</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
