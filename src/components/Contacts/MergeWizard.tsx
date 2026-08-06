/**
 * MergeWizard.tsx — find duplicate contacts and merge them without losing
 * anything. Every field conflict is shown before the merge happens, and the
 * summary afterwards says exactly what moved.
 */
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Merge, AlertTriangle, Check, Users, ChevronRight } from 'lucide-react';
import type { Appointment, Contact, Pipeline } from '../../types';
import {
  findDuplicates, mergePreview, mergeContacts, completeness,
  FIELD_LABELS, reassignEmails, reassignListMembership,
  type DuplicateGroup, type MergeField,
} from '../../services/contactMerge';

const INK = '#17191c';

interface Props {
  contacts: Contact[];
  pipelines: Pipeline[];
  appointments: Appointment[];
  onClose: () => void;
  onMerge: (result: {
    merged: Contact; removedIds: string[];
    pipelines: Pipeline[]; appointments: Appointment[];
  }) => void;
  onNotify: (text: string, kind?: 'success' | 'error' | 'info') => void;
}

export default function MergeWizard({ contacts, pipelines, appointments, onClose, onMerge, onNotify }: Props) {
  const groups = useMemo(() => findDuplicates(contacts), [contacts]);
  const [openGroup, setOpenGroup] = useState<string | null>(groups[0]?.id ?? null);
  const [done, setDone] = useState<string[]>([]);

  const remaining = groups.filter(g => !done.includes(g.id));

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 'min(880px, 100%)', maxHeight: '88vh', background: '#fff', borderRadius: 18, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(15,23,42,0.25)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e6e9f0' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, color: INK }}>
              <Merge size={16} /> Find and merge duplicates
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              {remaining.length
                ? `${remaining.length} possible duplicate group${remaining.length === 1 ? '' : 's'} across ${contacts.length} contacts`
                : 'No duplicates left to review'}
            </div>
          </div>
          <button onClick={onClose} title="Close"
            style={{ padding: 8, borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', color: '#475569' }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {!remaining.length && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
              <Users size={26} style={{ opacity: 0.4 }} />
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#16a34a', marginTop: 10 }}>
                {done.length ? `${done.length} group${done.length === 1 ? '' : 's'} merged` : 'No duplicates found'}
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Contacts are matched on email, phone number, and name at the same company.
              </div>
            </div>
          )}

          {remaining.map(group => (
            <GroupCard
              key={group.id}
              group={group}
              open={openGroup === group.id}
              onToggle={() => setOpenGroup(openGroup === group.id ? null : group.id)}
              onMerge={(primaryId, choices) => {
                const result = mergeContacts(group.contacts, primaryId, choices, pipelines, appointments);
                const movedEmails = reassignEmails(result.removedIds, result.merged.id);
                const touchedLists = reassignListMembership(result.removedIds, result.merged.id);
                onMerge(result);
                setDone(d => [...d, group.id]);
                const extras = [
                  ...result.summary,
                  movedEmails ? `${movedEmails} email record${movedEmails === 1 ? '' : 's'} re-pointed` : '',
                  touchedLists ? `${touchedLists} list${touchedLists === 1 ? '' : 's'} updated` : '',
                ].filter(Boolean);
                onNotify(`Merged into ${result.merged.name} — ${extras.join('; ')}`);
              }}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function GroupCard({ group, open, onToggle, onMerge }: {
  group: DuplicateGroup;
  open: boolean;
  onToggle: () => void;
  onMerge: (primaryId: string, choices: Partial<Record<MergeField, string>>) => void;
}) {
  const [primaryId, setPrimaryId] = useState(group.contacts[0].id);
  const [choices, setChoices] = useState<Partial<Record<MergeField, string>>>({});
  const preview = useMemo(() => mergePreview(group.contacts), [group.contacts]);
  const conflicts = preview.filter(p => p.conflict);

  const confColor = group.confidence >= 90 ? '#16a34a' : group.confidence >= 80 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{ border: '1px solid #e6e9f0', borderRadius: 14, marginBottom: 12, overflow: 'hidden' }}>
      <button onClick={onToggle} title={open ? 'Collapse this group' : 'Review this group'}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: 'none', background: '#f8fafc', cursor: 'pointer', textAlign: 'left' }}>
        <ChevronRight size={14} color="#94a3b8" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: INK, flex: 1 }}>
          {group.contacts.map(c => c.name).join(' · ')}
        </span>
        <span style={{ padding: '2px 9px', borderRadius: 999, background: '#fff', border: `1px solid ${confColor}`, color: confColor, fontSize: 10.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
          {group.confidence}% — {group.reason}
        </span>
      </button>

      {open && (
        <div style={{ padding: 14 }}>
          {group.confidence < 80 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 11.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9, padding: '8px 11px', marginBottom: 12 }}>
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>These only share a name and company, which is weaker evidence than a matching email. Check them before merging.</span>
            </div>
          )}

          {/* Which record survives */}
          <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>
            Keep as the primary record
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {group.contacts.map(c => (
              <button key={c.id} onClick={() => setPrimaryId(c.id)} title={`Keep ${c.name} as the surviving record`}
                style={{
                  textAlign: 'left', padding: '9px 12px', borderRadius: 11, cursor: 'pointer',
                  border: `1px solid ${primaryId === c.id ? INK : '#e2e8f0'}`,
                  background: primaryId === c.id ? '#f8fafc' : '#fff',
                  boxShadow: primaryId === c.id ? `inset 0 0 0 1px ${INK}` : 'none',
                }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>{c.name}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.email || 'no email'}{c.phone ? ` · ${c.phone}` : ''}</div>
                <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>
                  {(c.activities?.length ?? 0)} activities · {(c.notes?.length ?? 0)} notes · completeness {completeness(c)}
                </div>
              </button>
            ))}
          </div>

          {/* Conflicting fields */}
          {conflicts.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>
                {conflicts.length} field{conflicts.length === 1 ? '' : 's'} disagree — pick what to keep
              </div>
              {conflicts.map(c => (
                <div key={c.field} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, color: '#64748b', minWidth: 90 }}>{FIELD_LABELS[c.field]}</span>
                  {c.options.map(o => {
                    const picked = (choices[c.field] ?? c.suggested) === o.value;
                    return (
                      <button key={o.value} onClick={() => setChoices(ch => ({ ...ch, [c.field]: o.value }))}
                        title={`Keep "${o.value}" as the ${FIELD_LABELS[c.field].toLowerCase()}`}
                        style={{
                          padding: '4px 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                          border: `1px solid ${picked ? INK : '#e2e8f0'}`,
                          background: picked ? INK : '#fff', color: picked ? '#fff' : '#475569',
                        }}>
                        {o.value}
                      </button>
                    );
                  })}
                </div>
              ))}
            </>
          )}

          <div style={{ fontSize: 11.5, color: '#64748b', background: '#f8fafc', border: '1px solid #eef0f3', borderRadius: 9, padding: '9px 11px', margin: '12px 0' }}>
            Tags, notes, tasks and timeline entries are combined rather than replaced. Every deal,
            meeting, email and list membership pointing at the other record is moved to the survivor
            before it is removed.
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => onMerge(primaryId, choices)} title="Merge these records"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, border: 'none', background: INK, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              <Check size={13} /> Merge {group.contacts.length} records
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
