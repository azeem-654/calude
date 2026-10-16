/**
 * ListsPanel.tsx — the lists beside the contact table, the open list's header,
 * and the rule builder for smart lists.
 *
 * ── One place for every list ──
 *
 * Lead lists used to be a screen of their own (Customers → Lead lists), with
 * the same contacts in folders. It is folded in here: the sidebar keeps its
 * folders — one per AI Autopilot business workspace (the lists it writes to
 * and fills, which only the server knows: `finders.php folders`), what was
 * saved from AI Prospecting, and the customer's own lists — and opening one
 * filters this table rather than a second, poorer one. services/leadLists.ts
 * still builds the folders; nothing here searches anything but this
 * workspace's own contacts.
 */
import { useMemo, useState } from 'react';
import {
  Bookmark, Bot, Check, ChevronDown, ChevronRight, Crosshair, Download, ExternalLink, Folder, Loader, Mail, Pencil,
  Plus, Rocket, Search, Sparkles, Trash2, Users, X,
} from 'lucide-react';
import type { Appointment, Contact, Pipeline } from '../../types';
import {
  LIST_FIELDS, OPS_FOR, fieldDef, describeList, listMembers,
  type ContactList, type ListRule,
} from '../../services/contactLists';
import { CHECK_LABEL, checkOf, type CheckState, type LeadFolder, type LeadListView } from '../../services/leadLists';
import './contactLists.css';

const INK = '#17191c';
const fmtN = (n: number) => n.toLocaleString('en-US');
const fmtDate = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
};
const STATUS_LABEL: Record<string, string> = { running: 'Running', learning: 'Learning', paused: 'Paused', off: 'Off' };
const CHECK_ORDER: CheckState[] = ['valid', 'domain_ok', 'risky', 'invalid', 'none'];

/* ── The sidebar ── */

export function ListsSidebar({
  folders, total, activeId, onActivate, canManage, onNew, onStarters, loading, error, colorOf,
}: {
  folders: LeadFolder[];
  total: number;
  activeId: string | null;
  onActivate: (id: string | null) => void;
  canManage: boolean;
  onNew: () => void;
  /** Offered only while the customer has no lists at all. */
  onStarters?: () => void;
  loading: boolean;
  error: string;
  colorOf: (listId: string) => string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [shut, setShut] = useState<Set<string>>(new Set());
  const projects = folders.filter(f => f.kind === 'project');
  const saved = folders.find(f => f.kind === 'prospecting');
  const mine = folders.find(f => f.kind === 'other');
  const allLists = folders.flatMap(f => f.lists);
  const activeName = activeId ? allLists.find(l => l.id === activeId)?.name ?? 'A list' : 'All contacts';
  const needle = q.trim().toLowerCase();
  const match = (l: LeadListView) => !needle || l.name.toLowerCase().includes(needle);
  const pick = (id: string | null) => { onActivate(id); setOpen(false); };

  const item = (l: LeadListView, sub: boolean) => (
    <button key={l.id} type="button" className={`cl-item${sub ? ' cl-sub' : ''}`} aria-current={activeId === l.id}
      onClick={() => pick(activeId === l.id ? null : l.id)} data-testid="cl-list" title={l.smart ? 'Smart list — its rules are run again every time you open it' : undefined}>
      {sub ? null : <span className="cl-dot" style={{ background: colorOf(l.id) ?? '#94a3b8' }} />}
      {l.smart ? <Sparkles size={12} style={{ flex: 'none', opacity: 0.7 }} /> : null}
      <span className="cl-name">{l.name}</span>
      <span className="cl-n">{fmtN(l.members.length)}</span>
    </button>
  );

  return (
    <aside className="cl-side" data-open={open} aria-label="Contact lists" data-testid="cl-sidebar">
      <button type="button" className="cl-side-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Bookmark size={14} /> <span>Lists · {activeName}</span> <ChevronDown size={15} />
      </button>
      <div className="cl-side-head">
        <h3>Lists</h3>
        {canManage && <button type="button" className="cl-new" onClick={onNew} title="Make a list"><Plus size={12} /> New list</button>}
      </div>
      <div className="cl-side-body">
        {allLists.length > 6 && (
          <label className="cl-find">
            <Search size={13} aria-hidden />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a list" aria-label="Find a list" />
          </label>
        )}
        <div className="cl-group">
          <button type="button" className="cl-item" aria-current={activeId === null} onClick={() => pick(null)}>
            <Users size={14} style={{ flex: 'none' }} /> <span className="cl-name">All contacts</span> <span className="cl-n">{fmtN(total)}</span>
          </button>
        </div>

        <div className="cl-group" data-testid="cl-workspaces">
          <div className="cl-group-label"><Rocket size={11} /> AI Autopilot business workspaces</div>
          {loading && !projects.length && <div className="cl-empty"><Loader size={11} className="spin" /> Reading your business workspaces…</div>}
          {!loading && !projects.length && <div className="cl-empty">None yet. A business workspace that finds its own customers keeps everyone it finds in a folder here.</div>}
          {projects.map(f => {
            const isOpen = !shut.has(f.id);
            const lists = f.lists.filter(match);
            if (needle && !lists.length && !f.name.toLowerCase().includes(needle)) return null;
            return (
              <div key={f.id}>
                <button type="button" className="cl-item cl-folder" aria-expanded={isOpen}
                  onClick={() => setShut(s => { const n = new Set(s); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; })}>
                  <ChevronRight size={13} className="cl-caret" />
                  <span className="cl-name">{f.name}</span>
                  {f.status && <span className="cl-state" data-s={f.status}>{STATUS_LABEL[f.status] ?? f.status}</span>}
                  <span className="cl-n">{fmtN(f.people.length)}</span>
                </button>
                {isOpen && (lists.length
                  ? lists.map(l => item(l, true))
                  : <div className="cl-empty" style={{ paddingLeft: 26 }}>Nobody found yet.</div>)}
              </div>
            );
          })}
        </div>

        <div className="cl-group" data-testid="cl-saved">
          <div className="cl-group-label"><Crosshair size={11} /> Saved from AI Prospecting</div>
          {saved?.lists.filter(match).map(l => item(l, false))}
          {!saved?.lists.length && <div className="cl-empty">Businesses you save from AI Prospecting arrive here as a list.</div>}
        </div>

        <div className="cl-group" data-testid="cl-mine">
          <div className="cl-group-label"><Folder size={11} /> My lists</div>
          {mine?.lists.filter(match).map(l => item(l, false))}
          {!mine?.lists.length && (
            <div className="cl-empty">
              {canManage ? <><button type="button" onClick={onNew}>Make a list</button> — hand-picked, or smart rules that stay current.</> : 'No lists yet.'}
              {onStarters && canManage && <> Or <button type="button" onClick={onStarters}>add five ready-made segments</button>.</>}
            </div>
          )}
        </div>
        {error && <p className="cl-note" role="status">{error}</p>}
      </div>
    </aside>
  );
}

/* ── The open list ── */

function CheckBar({ people }: { people: Contact[] }) {
  const withEmail = people.filter(c => c.email);
  if (!withEmail.length) return null;
  const n = Object.fromEntries(CHECK_ORDER.map(k => [k, 0])) as Record<CheckState, number>;
  for (const c of withEmail) n[checkOf(c)]++;
  return (
    <div className="cl-checks">
      <div className="cl-bar" aria-hidden>
        {CHECK_ORDER.map(k => (n[k] ? <i key={k} className={`cl-c-${k}`} style={{ width: `${(n[k] / withEmail.length) * 100}%` }} /> : null))}
      </div>
      <div className="cl-legend">
        {CHECK_ORDER.filter(k => n[k]).map(k => <span key={k}><i className={`cl-c-${k}`} /> {fmtN(n[k])} {CHECK_LABEL[k].toLowerCase()}</span>)}
      </div>
    </div>
  );
}

export function ListHeader({
  view, folder, list, canManage, canExport, onSend, onEmail, onExport, onEdit, onDelete, onOpenWorkspace, onClose,
}: {
  view: LeadListView;
  folder: LeadFolder | null;
  /** The stored list — absent for a workspace's finds that are on no list. */
  list?: ContactList;
  canManage: boolean;
  canExport: boolean;
  onSend: () => void;
  onEmail: () => void;
  onExport: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenWorkspace?: () => void;
  onClose: () => void;
}) {
  const n = view.members.length;
  return (
    <section className="cl-head" aria-label={`The list ${view.name}`} data-testid="cl-head">
      <div className="cl-head-top">
        <span className="cl-head-icon" aria-hidden>{folder?.kind === 'project' ? <Rocket size={18} /> : folder?.kind === 'prospecting' ? <Crosshair size={18} /> : <Bookmark size={18} />}</span>
        <div className="cl-head-title">
          <h2>{view.name}</h2>
          <p>
            <span>{fmtN(n)} {n === 1 ? 'contact' : 'contacts'}</span>
            {folder?.kind === 'project' && <span className="cl-pill" data-s="workspace">{folder.name}</span>}
            {view.cold && <span className="cl-pill" data-s="cold" title="People who have not asked to hear from you — AI Autopilot sends to them a few at a time, each batch approved">Prospects</span>}
            {view.smart ? <span className="cl-pill" data-s="smart">Smart list</span> : view.real ? <span className="cl-pill">Hand-picked</span> : <span className="cl-pill">Found, on no list</span>}
            {view.createdAt && <span>· made {fmtDate(view.createdAt)}</span>}
          </p>
          {list && list.type === 'smart' && <p style={{ marginTop: 4 }}>Its rules, run again every time you open it: {describeList(list)}</p>}
        </div>
        <div className="cl-actions">
          <button type="button" className="cl-btn primary" onClick={onSend} disabled={!n} data-testid="cl-send"
            title="Hand these people to an AI Autopilot business workspace to write to">
            <Bot size={14} /> Send to AI Autopilot
          </button>
          {view.real && <button type="button" className="cl-btn" onClick={onEmail} disabled={!n}><Mail size={14} /> Email this list</button>}
          <button type="button" className="cl-btn" onClick={onExport} disabled={!n || !canExport} data-testid="cl-export"
            title="A spreadsheet of these contacts, with where each one came from"><Download size={14} /> Export CSV</button>
          {onOpenWorkspace && <button type="button" className="cl-btn" onClick={onOpenWorkspace}><ExternalLink size={14} /> Open the workspace</button>}
          {view.real && canManage && list && <button type="button" className="cl-btn icon" onClick={onEdit} title="Rename or change this list" aria-label="Edit this list"><Pencil size={14} /></button>}
          {view.real && canManage && list && <button type="button" className="cl-btn icon danger" onClick={onDelete} title="Delete this list — its contacts stay" aria-label="Delete this list"><Trash2 size={14} /></button>}
          <button type="button" className="cl-btn icon" onClick={onClose} title="Show every contact" aria-label="Close this list"><X size={14} /></button>
        </div>
      </div>
      <CheckBar people={view.members} />
    </section>
  );
}

/* ── Rule builder ── */

export function ListEditor({ list, contacts, ctx, onSave, onCancel }: {
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
