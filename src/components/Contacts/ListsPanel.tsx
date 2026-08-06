/**
 * ListsPanel.tsx — saved segments across the top of the contact list, plus the
 * rule builder for smart lists.
 */
import { useMemo, useState } from 'react';
import { Bookmark, Plus, Trash2, Pencil, Check, X, Sparkles, Users } from 'lucide-react';
import type { Appointment, Contact, Pipeline } from '../../types';
import {
  LIST_FIELDS, OPS_FOR, fieldDef, describeList, listMembers, createList,
  updateList, deleteList, STARTER_LISTS,
  type ContactList, type ListRule,
} from '../../services/contactLists';

const INK = '#17191c';

interface Props {
  lists: ContactList[];
  contacts: Contact[];
  pipelines: Pipeline[];
  appointments: Appointment[];
  activeId: string | null;
  canManage: boolean;
  onActivate: (id: string | null) => void;
  onChange: (lists: ContactList[]) => void;
  onNotify: (text: string, kind?: 'success' | 'error' | 'info') => void;
  createdBy: string;
}

export default function ListsPanel({
  lists, contacts, pipelines, appointments, activeId, canManage,
  onActivate, onChange, onNotify, createdBy,
}: Props) {
  const [editing, setEditing] = useState<ContactList | null>(null);
  const [creating, setCreating] = useState(false);

  const ctx = useMemo(() => ({ pipelines, appointments }), [pipelines, appointments]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lists) m.set(l.id, listMembers(l, contacts, ctx).length);
    return m;
  }, [lists, contacts, ctx]);

  const seedStarters = () => {
    let next = lists;
    for (const s of STARTER_LISTS) {
      if (next.some(l => l.name === s.name)) continue;
      createList({ name: s.name, type: 'smart', rules: s.rules, match: s.match, createdBy });
    }
    next = JSON.parse(localStorage.getItem('crm_contact_lists') || '[]');
    onChange(next);
    onNotify(`${STARTER_LISTS.length} starter segments added`);
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => onActivate(null)} title="Show every contact"
          style={chip(activeId === null, '#475569')}>
          <Users size={12} /> All contacts <span style={{ opacity: 0.65 }}>{contacts.length}</span>
        </button>

        {lists.map(l => (
          <button key={l.id} onClick={() => onActivate(l.id === activeId ? null : l.id)}
            title={describeList(l)} style={chip(activeId === l.id, l.color)}>
            <Bookmark size={12} /> {l.name} <span style={{ opacity: 0.65 }}>{counts.get(l.id) ?? 0}</span>
          </button>
        ))}

        {canManage && (
          <>
            <button onClick={() => { setCreating(true); setEditing(null); }} title="Create a saved list"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 999, border: '1px dashed #cbd5e1', background: '#fff', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <Plus size={12} /> New list
            </button>
            {!lists.length && (
              <button onClick={seedStarters} title="Add five ready-made segments"
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 999, border: '1px solid #e2e8f0', background: '#fff', color: '#4f46e5', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                <Sparkles size={12} /> Add starter segments
              </button>
            )}
          </>
        )}

        {activeId && canManage && (
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            <button onClick={() => { setEditing(lists.find(l => l.id === activeId) ?? null); setCreating(false); }}
              title="Edit this list"
              style={{ padding: 6, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', color: '#475569' }}>
              <Pencil size={12} />
            </button>
            <button title="Delete this list"
              onClick={() => {
                const l = lists.find(x => x.id === activeId);
                if (!l || !window.confirm(`Delete the list "${l.name}"? The contacts in it are not affected.`)) return;
                onChange(deleteList(activeId));
                onActivate(null);
                onNotify(`List "${l.name}" deleted`, 'info');
              }}
              style={{ padding: 6, borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer', display: 'flex', color: '#dc2626' }}>
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {activeId && !editing && !creating && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: '#94a3b8' }}>
          {(() => {
            const l = lists.find(x => x.id === activeId);
            if (!l) return null;
            return l.type === 'smart'
              ? `Smart list — re-evaluated every time you open it: ${describeList(l)}`
              : `Static list — ${describeList(l)}`;
          })()}
        </div>
      )}

      {(creating || editing) && (
        <ListEditor
          list={editing}
          contacts={contacts}
          ctx={ctx}
          onCancel={() => { setCreating(false); setEditing(null); }}
          onSave={(name, type, rules, match) => {
            if (editing) {
              onChange(updateList(editing.id, { name, rules, match }));
              onNotify(`List "${name}" updated`);
            } else {
              const l = createList({ name, type, rules, match, createdBy });
              onChange(JSON.parse(localStorage.getItem('crm_contact_lists') || '[]'));
              onActivate(l.id);
              onNotify(`List "${name}" created`);
            }
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function chip(active: boolean, color: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 999,
    border: `1px solid ${active ? color : '#e2e8f0'}`,
    background: active ? color : '#fff',
    color: active ? '#fff' : '#475569',
    fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}

/* ── Rule builder ── */

function ListEditor({ list, contacts, ctx, onSave, onCancel }: {
  list: ContactList | null;
  contacts: Contact[];
  ctx: { pipelines: Pipeline[]; appointments: Appointment[] };
  onSave: (name: string, type: 'smart' | 'static', rules: ListRule[], match: 'all' | 'any') => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(list?.name ?? '');
  const [type, setType] = useState<'smart' | 'static'>(list?.type ?? 'smart');
  const [match, setMatch] = useState<'all' | 'any'>(list?.match ?? 'all');
  const [rules, setRules] = useState<ListRule[]>(list?.rules?.length ? list.rules : [{ field: 'health', op: 'gt', value: '60' }]);
  const [err, setErr] = useState('');

  // Live count, so you can see what a rule selects before you save it.
  const preview = useMemo(() => {
    if (type === 'static') return 0;
    const draft: ContactList = {
      id: 'preview', name, type: 'smart', rules, match, memberIds: [],
      color: '#6366f1', createdAt: '', createdBy: '',
    };
    return listMembers(draft, contacts, ctx).length;
  }, [type, name, rules, match, contacts, ctx]);

  const inp: React.CSSProperties = { padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, outline: 'none', fontFamily: 'inherit', background: '#fff' };

  const setRule = (i: number, patch: Partial<ListRule>) =>
    setRules(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const grouped = useMemo(() => {
    const g = new Map<string, typeof LIST_FIELDS>();
    for (const f of LIST_FIELDS) g.set(f.group, [...(g.get(f.group) ?? []), f]);
    return [...g];
  }, []);

  return (
    <div style={{ marginTop: 10, border: '1px solid #e6e9f0', borderRadius: 14, padding: 14, background: '#fff' }}>
      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={name} onChange={e => { setName(e.target.value); setErr(''); }} placeholder="List name"
          style={{ ...inp, flex: 1, minWidth: 180 }} />
        {!list && (
          <select value={type} onChange={e => setType(e.target.value as 'smart' | 'static')} title="List type"
            style={{ ...inp, cursor: 'pointer' }}>
            <option value="smart">Smart — rules, always current</option>
            <option value="static">Static — hand-picked</option>
          </select>
        )}
      </div>

      {type === 'smart' ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 8px' }}>
            <span style={{ fontSize: 11.5, color: '#64748b' }}>Match</span>
            <select value={match} onChange={e => setMatch(e.target.value as 'all' | 'any')} title="Match all or any rule"
              style={{ ...inp, cursor: 'pointer' }}>
              <option value="all">all of these rules</option>
              <option value="any">any of these rules</option>
            </select>
            <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: '#4f46e5', background: '#eef2ff', padding: '3px 10px', borderRadius: 999 }}>
              {preview} contact{preview === 1 ? '' : 's'} match
            </span>
          </div>

          {rules.map((r, i) => {
            const def = fieldDef(r.field);
            const ops = OPS_FOR[def?.kind ?? 'text'];
            const needsValue = r.op !== 'is_empty' && r.op !== 'is_not_empty';
            return (
              <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={r.field} title="Field"
                  onChange={e => {
                    const nd = fieldDef(e.target.value);
                    setRule(i, { field: e.target.value, op: OPS_FOR[nd?.kind ?? 'text'][0].value, value: '' });
                  }}
                  style={{ ...inp, cursor: 'pointer', minWidth: 150 }}>
                  {grouped.map(([group, fields]) => (
                    <optgroup key={group} label={group}>
                      {fields.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </optgroup>
                  ))}
                </select>
                <select value={r.op} onChange={e => setRule(i, { op: e.target.value as ListRule['op'] })} title="Condition"
                  style={{ ...inp, cursor: 'pointer' }}>
                  {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {needsValue && (
                  def?.kind === 'choice'
                    ? (
                      <select value={r.value} onChange={e => setRule(i, { value: e.target.value })} title="Value"
                        style={{ ...inp, cursor: 'pointer' }}>
                        <option value="">choose…</option>
                        {def.choices!.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    )
                    : (
                      <input value={r.value} onChange={e => setRule(i, { value: e.target.value })}
                        placeholder={def?.kind === 'number' ? '0' : 'value'} title="Value"
                        inputMode={def?.kind === 'number' ? 'numeric' : 'text'}
                        style={{ ...inp, width: 130 }} />
                    )
                )}
                <button onClick={() => setRules(rs => rs.filter((_, j) => j !== i))} title="Remove this rule"
                  disabled={rules.length === 1}
                  style={{ padding: 6, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: rules.length === 1 ? 'not-allowed' : 'pointer', display: 'flex', color: rules.length === 1 ? '#cbd5e1' : '#94a3b8' }}>
                  <X size={12} />
                </button>
              </div>
            );
          })}

          <button onClick={() => setRules(rs => [...rs, { field: 'name', op: 'contains', value: '' }])} title="Add another rule"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8, border: '1px dashed #cbd5e1', background: '#fff', color: '#64748b', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={11} /> Add rule
          </button>
        </>
      ) : (
        <p style={{ margin: '12px 0 0', fontSize: 11.5, color: '#64748b', lineHeight: 1.5 }}>
          A static list starts empty. Select contacts in the table and use
          “Add to list” to put them in it.
        </p>
      )}

      {err && <div style={{ fontSize: 11.5, color: '#dc2626', marginTop: 8 }}>{err}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} title="Discard these changes"
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          Cancel
        </button>
        <button title="Save this list"
          onClick={() => {
            if (!name.trim()) { setErr('Give the list a name.'); return; }
            onSave(name.trim(), type, rules, match);
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 15px', borderRadius: 9, border: 'none', background: INK, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          <Check size={12} /> Save list
        </button>
      </div>
    </div>
  );
}
