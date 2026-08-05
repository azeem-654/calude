import { useState, useMemo } from 'react';
import {
  Users, Plus, Search, Mail, Phone, Trash2, Edit2, ChevronDown,
  Filter, Download, Upload, Tag, X, Eye,
} from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import {
  computeHealthScore, inferLifecycle, dealsForContact, appointmentsForContact,
  LIFECYCLE_META, LIFECYCLE_STAGES, type LifecycleStage,
} from '../../services/contactIntelligence';
import type { Contact } from '../../types';
import ContactProfile from './ContactProfile';
import ImportWizard from './ImportWizard';

const statusColors: Record<string, { bg: string; color: string }> = {
  lead: { bg: '#eff6ff', color: '#2563eb' },
  prospect: { bg: '#fef3c7', color: '#d97706' },
  customer: { bg: '#ecfdf5', color: '#16a34a' },
  churned: { bg: '#fef2f2', color: '#dc2626' },
};

function ContactModal({ onClose, onSave, initial }: { onClose: () => void; onSave: (c: Omit<Contact, 'id'>) => void; initial?: Contact }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    email: initial?.email || '',
    phone: initial?.phone || '',
    status: (initial?.status || 'lead') as Contact['status'],
    source: initial?.source || 'Website',
    tags: initial?.tags.join(', ') || '',
    company: initial?.company || '',
    jobTitle: initial?.jobTitle || '',
    linkedin: initial?.linkedin || '',
    website: initial?.website || '',
    assignedTo: initial?.assignedTo || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...form,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      value: initial?.value || 0,
      createdAt: initial?.createdAt || new Date().toISOString().split('T')[0],
      lastActivity: new Date().toISOString().split('T')[0],
      notes: initial?.notes || [],
      tasks: initial?.tasks || [],
      activities: initial?.activities || [],
    });
    onClose();
  };

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', outline: 'none', color: '#374151', backgroundColor: '#fff', boxSizing: 'border-box' };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '560px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 48px -12px rgba(16,24,40,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em', margin: 0 }}>{initial ? 'Edit Contact' : 'Add New Contact'}</h2>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, padding: 6, display: 'flex', cursor: 'pointer' }}><X size={16} color="#64748b" /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            {[
              { label: 'Full Name *', key: 'name', placeholder: 'John Smith', required: true },
              { label: 'Email', key: 'email', placeholder: 'john@example.com', type: 'email' },
              { label: 'Phone', key: 'phone', placeholder: '+1 (555) 000-0000' },
              { label: 'Company', key: 'company', placeholder: 'Acme Inc.' },
              { label: 'Job Title', key: 'jobTitle', placeholder: 'CEO' },
              { label: 'Source', key: 'source', placeholder: 'Website' },
              { label: 'LinkedIn', key: 'linkedin', placeholder: 'https://linkedin.com/in/...' },
              { label: 'Website', key: 'website', placeholder: 'https://...' },
              { label: 'Assigned To', key: 'assignedTo', placeholder: 'Team member name' },
            ].map(({ label, key, placeholder, type, required }) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>{label}</label>
                <input required={required} type={type || 'text'} placeholder={placeholder}
                  value={(form as Record<string, string>)[key] || ''}
                  onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))} style={inp} />
              </div>
            ))}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Status</label>
              <select value={form.status} onChange={e => setForm(prev => ({ ...prev, status: e.target.value as Contact['status'] }))} style={inp}>
                {['lead','prospect','customer','churned'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Tags (comma separated)</label>
              <input placeholder="VIP, Referral" value={form.tags} onChange={e => setForm(prev => ({ ...prev, tags: e.target.value }))} style={inp} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '24px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 16px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', backgroundColor: 'white', color: '#374151' }}>Cancel</button>
            <button type="submit" style={{ padding: '9px 16px', border: 'none', borderRadius: '9px', fontSize: '13px', cursor: 'pointer', backgroundColor: '#17191c', color: 'white', fontWeight: 600, boxShadow: '0 1px 2px rgba(23,25,28,0.3)' }}>{initial ? 'Save Changes' : 'Add Contact'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Advanced Filter Builder ───────────────────────────────────────────────────
interface FilterRule {
  field: string;
  op: string;
  value: string;
}

function buildFilterFn(rules: FilterRule[]): (c: Contact) => boolean {
  if (rules.length === 0) return () => true;
  return (c) => rules.every(rule => {
    const val = ((c as unknown as Record<string, unknown>)[rule.field] ?? '');
    const strVal = Array.isArray(val) ? val.join(',') : String(val).toLowerCase();
    const ruleVal = rule.value.toLowerCase();
    switch (rule.op) {
      case 'contains': return strVal.includes(ruleVal);
      case 'equals': return strVal === ruleVal;
      case 'starts_with': return strVal.startsWith(ruleVal);
      case 'not_contains': return !strVal.includes(ruleVal);
      case 'is_empty': return !val || (Array.isArray(val) && val.length === 0);
      case 'is_not_empty': return !!val && (!Array.isArray(val) || val.length > 0);
      default: return true;
    }
  });
}

const FILTER_FIELDS = [
  { value: 'name', label: 'Name' }, { value: 'email', label: 'Email' }, { value: 'phone', label: 'Phone' },
  { value: 'company', label: 'Company' }, { value: 'jobTitle', label: 'Job Title' }, { value: 'status', label: 'Status' },
  { value: 'source', label: 'Source' }, { value: 'tags', label: 'Tags' }, { value: 'assignedTo', label: 'Assigned To' },
];
const FILTER_OPS = [
  { value: 'contains', label: 'contains' }, { value: 'equals', label: 'equals' }, { value: 'starts_with', label: 'starts with' },
  { value: 'not_contains', label: 'does not contain' }, { value: 'is_empty', label: 'is empty' }, { value: 'is_not_empty', label: 'is not empty' },
];

export default function Contacts() {
  const { contacts, addContact, updateContact, deleteContact, bulkImportContacts, addNotification, customFieldDefs, addCustomFieldDefs, pipelines, appointments } = useApp();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [profileContact, setProfileContact] = useState<Contact | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showImport, setShowImport] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filterRules, setFilterRules] = useState<FilterRule[]>([]);
  const [sortField, setSortField] = useState<string>('lastActivity');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleStage | 'all'>('all');

  const addRule = () => setFilterRules(p => [...p, { field: 'name', op: 'contains', value: '' }]);
  const updateRule = (i: number, updates: Partial<FilterRule>) => setFilterRules(p => p.map((r, j) => j === i ? { ...r, ...updates } : r));
  const removeRule = (i: number) => setFilterRules(p => p.filter((_, j) => j !== i));

  const customFilter = buildFilterFn(filterRules);

  /* Health + lifecycle for every contact, from live pipeline/appointment data. */
  const intel = useMemo(() => {
    const map = new Map<string, { health: ReturnType<typeof computeHealthScore>; stage: LifecycleStage }>();
    for (const c of contacts) {
      const d = dealsForContact(c, pipelines);
      const ap = appointmentsForContact(c, appointments);
      map.set(c.id, { health: computeHealthScore(c, d, ap), stage: c.lifecycle ?? inferLifecycle(c, d) });
    }
    return map;
  }, [contacts, pipelines, appointments]);

  const filtered = contacts.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase()) || (c.company || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    const matchStage = lifecycleFilter === 'all' || intel.get(c.id)?.stage === lifecycleFilter;
    return matchSearch && matchStatus && matchStage && customFilter(c);
  }).sort((a, b) => {
    const va = String((a as unknown as Record<string, unknown>)[sortField] ?? '');
    const vb = String((b as unknown as Record<string, unknown>)[sortField] ?? '');
    return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  const toggleSelect = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = () => setSelected(filtered.length === selected.size ? new Set() : new Set(filtered.map(c => c.id)));

  const exportCSV = () => {
    const sel = selected.size > 0 ? contacts.filter(c => selected.has(c.id)) : filtered;
    const headers = ['Name', 'Email', 'Phone', 'Company', 'Job Title', 'Status', 'Source', 'Tags', 'Value'];
    const rows = sel.map(c => [c.name, c.email, c.phone, c.company || '', c.jobTitle || '', c.status, c.source, c.tags.join(';'), c.value]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv,' + encodeURIComponent(csv);
    a.download = 'contacts.csv';
    a.click();
    addNotification(`Exported ${sel.length} contacts`);
  };

  const bulkDelete = () => {
    if (!window.confirm(`Delete ${selected.size} contacts?`)) return;
    selected.forEach(id => deleteContact(id));
    setSelected(new Set());
  };

  const bulkTag = () => {
    const tag = window.prompt('Tag to add:');
    if (!tag) return;
    selected.forEach(id => {
      const c = contacts.find(x => x.id === id);
      if (c && !c.tags.includes(tag)) updateContact(id, { tags: [...c.tags, tag] });
    });
    addNotification(`Tag "${tag}" added to ${selected.size} contacts`);
    setSelected(new Set());
  };

  const sortHeader = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon = ({ field }: { field: string }) => (
    sortField === field ? <span style={{ marginLeft: 4, fontSize: 10 }}>{sortDir === 'asc' ? '↑' : '↓'}</span> : null
  );

  return (
    <div>
      <Header title="Contacts" subtitle={`${contacts.length} total contacts · ${filtered.length} showing`} />
      <div style={{ padding: '28px', minHeight: 'calc(100vh - 73px)', boxSizing: 'border-box' }}>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '8px', flex: 1, minWidth: 0 }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input placeholder="Search name, email, company..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', paddingLeft: '32px', paddingRight: '12px', paddingTop: '9px', paddingBottom: '9px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', outline: 'none', color: '#374151', backgroundColor: '#fff', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', boxSizing: 'border-box' }} />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', outline: 'none', color: '#374151', backgroundColor: '#fff', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', cursor: 'pointer' }}>
              <option value="all">All Status</option>
              {['lead','prospect','customer','churned'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
            <select value={lifecycleFilter} onChange={e => setLifecycleFilter(e.target.value as LifecycleStage | 'all')}
              title="Filter by lifecycle stage"
              style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', outline: 'none', color: '#374151', backgroundColor: '#fff', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', cursor: 'pointer' }}>
              <option value="all">All Stages</option>
              {LIFECYCLE_STAGES.map(st => <option key={st} value={st}>{st}</option>)}
            </select>
            <button onClick={() => setShowFilter(p => !p)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '9px 12px', border: `1px solid ${showFilter || filterRules.length > 0 ? '#d5d8dd' : '#e2e8f0'}`, borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', backgroundColor: showFilter || filterRules.length > 0 ? '#eceef1' : 'white', color: showFilter || filterRules.length > 0 ? '#17191c' : '#374151', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
              <Filter size={14} /> Filter{filterRules.length > 0 ? ` (${filterRules.length})` : ''}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', backgroundColor: 'white', color: '#374151', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
              <Download size={14} color="#64748b" /> Export
            </button>
            <button onClick={() => setShowImport(true)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', backgroundColor: 'white', color: '#374151', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
              <Upload size={14} color="#64748b" /> Import
            </button>
            <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', backgroundColor: '#17191c', color: 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 2px rgba(23,25,28,0.3)' }}>
              <Plus size={16} /> Add Contact
            </button>
          </div>
        </div>

        {/* Filter builder */}
        {showFilter && (
          <div style={{ backgroundColor: 'white', borderRadius: 18, border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: '20px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em', marginBottom: 12 }}>Advanced Filters</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {filterRules.map((rule, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select value={rule.field} onChange={e => updateRule(i, { field: e.target.value })} style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13, outline: 'none', color: '#374151', backgroundColor: '#fff', cursor: 'pointer' }}>
                    {FILTER_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <select value={rule.op} onChange={e => updateRule(i, { op: e.target.value })} style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13, outline: 'none', color: '#374151', backgroundColor: '#fff', cursor: 'pointer' }}>
                    {FILTER_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {!['is_empty', 'is_not_empty'].includes(rule.op) && (
                    <input value={rule.value} onChange={e => updateRule(i, { value: e.target.value })} placeholder="Value..."
                      style={{ flex: 1, padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13, color: '#374151', backgroundColor: '#fff', outline: 'none' }} />
                  )}
                  <button onClick={() => removeRule(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}><X size={14} color="#94a3b8" /></button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addRule} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', border: '1px solid #d5d8dd', borderRadius: 9, backgroundColor: '#eceef1', color: '#17191c', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <Plus size={12} /> Add Filter
              </button>
              {filterRules.length > 0 && (
                <button onClick={() => setFilterRules([])} style={{ padding: '7px 12px', border: '1px solid #fecaca', borderRadius: 9, backgroundColor: '#fef2f2', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  Clear All
                </button>
              )}
              <span style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center' }}>{filtered.length} contacts match</span>
            </div>
          </div>
        )}

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', backgroundColor: '#eceef1', borderRadius: 12, marginBottom: 12, border: '1px solid #d5d8dd', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#17191c' }}>{selected.size} selected</span>
            <button onClick={bulkTag} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: '1px solid #d5d8dd', borderRadius: 9, backgroundColor: 'white', color: '#17191c', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><Tag size={12} /> Add Tag</button>
            <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: '1px solid #d5d8dd', borderRadius: 9, backgroundColor: 'white', color: '#17191c', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><Download size={12} /> Export</button>
            <button onClick={bulkDelete} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: '1px solid #fecaca', borderRadius: 9, backgroundColor: '#fef2f2', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><Trash2 size={12} /> Delete</button>
            <button onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={16} /></button>
          </div>
        )}

        {/* Table */}
        <div style={{ backgroundColor: 'white', borderRadius: '18px', border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e6e9f0' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', width: '40px' }}>
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={selectAll} style={{ cursor: 'pointer', accentColor: '#17191c' }} />
                </th>
                {[['name','Name'], ['email','Contact'], ['health','Health'], ['lifecycle','Stage'], ['status','Status'], ['company','Company'], ['tags','Tags'], ['value','Value'], ['lastActivity','Last Active']].map(([field, label]) => (
                  <th key={field} onClick={() => sortHeader(field)} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                    {label}<SortIcon field={field} />
                  </th>
                ))}
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((contact, i) => {
                const sc = statusColors[contact.status];
                return (
                  <tr key={contact.id} onClick={() => setProfileContact(contact)} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none', transition: 'background 0.1s', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'white')}>
                    <td style={{ padding: '14px 16px' }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(contact.id)} onChange={() => toggleSelect(contact.id)} style={{ cursor: 'pointer', accentColor: '#17191c' }} />
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#17191c', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '13px', fontWeight: 600, flexShrink: 0 }}>
                          {contact.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <button onClick={() => setProfileContact(contact)} style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.01em', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', display: 'block' }}>
                            {contact.name}
                          </button>
                          <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>{contact.source}{contact.company ? ` · ${contact.company}` : ''}</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div>
                        {contact.email && <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}><Mail size={12} color="#94a3b8" /><span style={{ fontSize: '13px', color: '#475569' }}>{contact.email}</span></div>}
                        {contact.phone && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Phone size={12} color="#94a3b8" /><span style={{ fontSize: '13px', color: '#475569' }}>{contact.phone}</span></div>}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {(() => {
                        const h = intel.get(contact.id)?.health;
                        if (!h) return <span style={{ color: '#cbd5e1' }}>—</span>;
                        return (
                          <span title={`${h.band} — ${h.components.map(x => `${x.label} ${x.score}/${x.max}`).join(', ')}`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 30, height: 5, borderRadius: 3, background: '#eef0f3', overflow: 'hidden', display: 'inline-block' }}>
                              <span style={{ display: 'block', width: `${h.total}%`, height: '100%', background: h.color }} />
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: h.color }}>{h.total}</span>
                          </span>
                        );
                      })()}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {(() => {
                        const st = intel.get(contact.id)?.stage ?? 'Lead';
                        const m = LIFECYCLE_META[st];
                        return <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: m.bg, color: m.color, whiteSpace: 'nowrap' }}>{st}</span>;
                      })()}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: '11px', fontWeight: 600, backgroundColor: sc.bg, color: sc.color }}>
                        {contact.status.charAt(0).toUpperCase() + contact.status.slice(1)}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#475569' }}>{contact.company || '—'}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {contact.tags.slice(0, 3).map(tag => (
                          <span key={tag} style={{ padding: '3px 10px', borderRadius: 999, fontSize: '11px', backgroundColor: '#f1f5f9', color: '#64748b', fontWeight: 600 }}>{tag}</span>
                        ))}
                        {contact.tags.length > 3 && <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, alignSelf: 'center' }}>+{contact.tags.length - 3}</span>}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                      {contact.value > 0 ? `$${contact.value.toLocaleString()}` : '—'}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#94a3b8' }}>{contact.lastActivity}</td>
                    <td style={{ padding: '14px 16px' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => setProfileContact(contact)} style={{ padding: '6px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', display: 'flex' }} title="View Profile"><Eye size={13} color="#17191c" /></button>
                        <button onClick={() => setEditContact(contact)} style={{ padding: '6px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', display: 'flex' }}><Edit2 size={13} color="#17191c" /></button>
                        <button onClick={() => deleteContact(contact.id)} style={{ padding: '6px', borderRadius: '8px', border: '1px solid #fee2e2', backgroundColor: '#fef2f2', cursor: 'pointer', display: 'flex' }}><Trash2 size={13} color="#ef4444" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '64px 24px' }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: '#eceef1', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Users size={28} color="#17191c" />
              </div>
              <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>No contacts found</p>
              <p style={{ margin: '0 0 20px', fontSize: 13, color: '#94a3b8', maxWidth: 320 }}>Try adjusting your search or filters, or add a new contact to get started.</p>
              <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', backgroundColor: '#17191c', color: 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 2px rgba(23,25,28,0.3)' }}>
                <Plus size={15} /> Add Contact
              </button>
            </div>
          )}
        </div>
      </div>

      {showModal && <ContactModal onClose={() => setShowModal(false)} onSave={addContact} />}
      {editContact && <ContactModal initial={editContact} onClose={() => setEditContact(null)} onSave={(updates) => { updateContact(editContact.id, updates); setEditContact(null); }} />}
      {showImport && (
        <ImportWizard
          onClose={() => setShowImport(false)}
          existingFields={customFieldDefs}
          onImport={(contacts, newFields) => {
            bulkImportContacts(contacts);
            addCustomFieldDefs(newFields);
            addNotification(`${contacts.length} contacts imported${newFields.length ? ` · ${newFields.length} new variable${newFields.length > 1 ? 's' : ''} created` : ''}`, 'success');
          }}
        />
      )}
      {profileContact && <ContactProfile contact={contacts.find(c => c.id === profileContact.id) ?? profileContact} onClose={() => setProfileContact(null)} />}
    </div>
  );
}
