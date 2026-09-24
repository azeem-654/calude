/**
 * "Who will this reach?" — asked before the wizard lets go.
 *
 * A project whose workflows email or text people was built, switched to draft,
 * and never mentioned that the workspace had nobody in it to email. The
 * customer found out by waiting. So the finished build says how many contacts
 * there are, how people get into each workflow, and offers the importer —
 * and says plainly when the answer is "nobody yet".
 */
import { Users, Upload, ArrowRight } from 'lucide-react';
import type { WorkflowNode } from '../../../services/autopilot';
import { contactCount, entryOf } from './contactFacts';

export default function ContactsCheck({ flows }: { flows: { name: string; nodes?: WorkflowNode[] }[] }) {
  if (!flows.length) return null;
  const n = contactCount();
  return (
    <div className="np-rise" style={{ padding: 16, borderRadius: 16, border: `1px solid ${n ? '#e2e8f0' : '#fcd9a8'}`, background: n ? '#fff' : '#fffaf2', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
        <span style={{ width: 34, height: 34, borderRadius: 11, background: n ? '#eef2ff' : '#fff1dc', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Users size={17} color={n ? '#4c39d1' : '#b45309'} />
        </span>
        <div style={{ minWidth: 0 }}>
          <b style={{ display: 'block', fontSize: 15, color: '#17191c' }}>
            {n ? `${n} contact${n === 1 ? '' : 's'} in this workspace` : 'Nobody to email yet'}
          </b>
          <span style={{ display: 'block', fontSize: 13, color: '#6b7280', lineHeight: 1.55, marginTop: 2 }}>
            {n
              ? 'These workflows reach the people who meet their starting condition — below. Add more any time.'
              : 'These workflows email people, and this workspace has no contacts. Import your list, or let your forms and booking page bring people in.'}
          </span>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {flows.map(f => (
          <div key={f.name} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#334155', lineHeight: 1.45, flexWrap: 'wrap' }}>
            <ArrowRight size={14} color="#94a3b8" style={{ flexShrink: 0, marginTop: 2 }} />
            <span><b>{f.name}</b> — people enter when: {entryOf(f.nodes).toLowerCase()}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a href="/contacts?import=1" style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 11,
          background: '#17191c', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none',
        }}><Upload size={14} /> Import contacts</a>
        <a href="/engagement" style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 11,
          border: '1px solid #e2e8f0', color: '#17191c', fontSize: 13, fontWeight: 700, textDecoration: 'none',
        }}>Set up a form</a>
      </div>
    </div>
  );
}
