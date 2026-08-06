/**
 * TeamFeed.tsx — what the team has been doing across every contact, plus a
 * per-owner workload read. The per-contact timeline answers "what happened to
 * this person"; this answers "what has been happening at all".
 */
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Activity, UserCircle2 } from 'lucide-react';
import type { Contact } from '../../types';
import { teamFeed, ownerWorkload } from '../../services/contactPermissions';

const INK = '#17191c';

const TYPE_META: Record<string, { icon: string; color: string }> = {
  email_sent: { icon: '📧', color: '#6366f1' },
  email_opened: { icon: '👁', color: '#22c55e' },
  link_clicked: { icon: '🔗', color: '#f97316' },
  note: { icon: '📝', color: '#f59e0b' },
  task_completed: { icon: '✅', color: '#22c55e' },
  meeting: { icon: '📅', color: '#3b82f6' },
  tag_added: { icon: '🏷', color: '#ec4899' },
  stage_change: { icon: '🔄', color: '#64748b' },
  form_submitted: { icon: '📋', color: '#14b8a6' },
  call: { icon: '📞', color: '#06b6d4' },
};

function ago(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '';
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function TeamFeed({ contacts, onClose, onOpenContact }: {
  contacts: Contact[];
  onClose: () => void;
  onOpenContact: (c: Contact) => void;
}) {
  const [owner, setOwner] = useState('');
  const workload = useMemo(() => ownerWorkload(contacts), [contacts]);
  const feed = useMemo(() => teamFeed(contacts, 80, owner), [contacts, owner]);

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 'min(760px, 100%)', maxHeight: '88vh', background: '#fff', borderRadius: 18, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(15,23,42,0.25)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e6e9f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, color: INK }}>
            <Activity size={16} /> Team activity
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={owner} onChange={e => setOwner(e.target.value)} title="Filter the feed by owner"
              style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>
              <option value="">Everyone</option>
              {workload.filter(w => w.owner !== 'Unassigned').map(w => <option key={w.owner} value={w.owner}>{w.owner}</option>)}
            </select>
            <button onClick={onClose} title="Close"
              style={{ padding: 8, borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', color: '#475569' }}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Workload */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 20px', borderBottom: '1px solid #f1f5f9', overflowX: 'auto' }}>
          {workload.map(w => (
            <div key={w.owner} style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #eef0f3', borderRadius: 10, minWidth: 130, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: INK }}>
                <UserCircle2 size={12} color="#94a3b8" /> {w.owner}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                {w.contacts} contact{w.contacts === 1 ? '' : 's'} · {w.recent} action{w.recent === 1 ? '' : 's'} this week
              </div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 20px' }}>
          {!feed.length && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 12.5 }}>
              Nothing recorded yet{owner ? ` for ${owner}` : ''}.
            </div>
          )}
          {feed.map(e => {
            const meta = TYPE_META[e.type] ?? { icon: '•', color: '#94a3b8' };
            const contact = contacts.find(c => c.id === e.contactId);
            return (
              <div key={e.id} style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: '1px solid #f8fafc' }}>
                <span style={{ fontSize: 14, lineHeight: '18px', flexShrink: 0 }}>{meta.icon}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, color: INK }}>{e.description}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    <button onClick={() => contact && onOpenContact(contact)} title={`Open ${e.contactName}`}
                      disabled={!contact}
                      style={{ border: 'none', background: 'none', padding: 0, color: meta.color, fontWeight: 700, cursor: contact ? 'pointer' : 'default', fontSize: 11 }}>
                      {e.contactName}
                    </button>
                    {e.owner ? ` · ${e.owner}` : ''} · {ago(e.at)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
