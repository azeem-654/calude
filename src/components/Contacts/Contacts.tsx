import { useState } from 'react';
import {
  Users, Plus, Search, Mail, Phone, Trash2, Edit2, ChevronDown,
  Filter, Download, Upload, Tag, X, Eye,
} from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
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

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', color: '#374151', boxSizing: 'border-box' };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '560px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>{initial ? 'Edit Contact' : 'Add New Contact'}</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={20} color="#94a3b8" /></button>
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
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '5px' }}>{label}</label>
                <input required={required} type={type || 'text'} placeholder={placeholder}
                  value={(form as Record<string, string>)[key] || ''}
                  onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))} style={inp} />
              </div>
            ))}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '5px' }}>Status</label>
              <select value={form.status} onChange={e => setForm(prev => ({ ...prev, status: e.target.value as Contact['status'] }))} style={inp}>
                {['lead','prospect','customer','churned'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '5px' }}>Tags (comma separated)</label>
              <input placeholder="VIP, Referral" value={form.tags} onChange={e => setForm(prev => ({ ...prev, tags: e.target.value }))} style={inp} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', backgroundColor: 'white', color: '#374151' }}>Cancel</button>
            <button type="submit" style={{ padding: '9px 18px', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', backgroundColor: '#6366f1', color: 'white', fontWeight: 600 }}>{initial ? 'Save Changes' : 'Add Contact'}</button>
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
  const { contacts, addContact, updateContact, deleteContact, bulkImportContacts, addNotification, customFieldDefs, addCustomFieldDefs } = useApp();
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

  const addRule = () => setFilterRules(p => [...p, { field: 'name', op: 'contains', value: '' }]);
  const updateRule = (i: number, updates: Partial<FilterRule>) => setFilterRules(p => p.map((r, j) => j === i ? { ...r, ...updates } : r));
  const removeRule = (i: number) => setFilterRules(p => p.filter((_, j) => j !== i));

  const customFilter = buildFilterFn(filterRules);

  const filtered = contacts.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase()) || (c.company || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchSearch && matchStatus && customFilter(c);
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
      <div style={{ padding: '24px 28px' }}>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '8px', flex: 1, minWidth: 0 }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input placeholder="Search name, email, company..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', paddingLeft: '32px', paddingRight: '12px', paddingTop: '9px', paddingBottom: '9px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', color: '#374151', backgroundColor: 'white', boxSizing: 'border-box' }} />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', color: '#374151', backgroundColor: 'white', cursor: 'pointer' }}>
              <option value="all">All Status</option>
              {['lead','prospect','customer','churned'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
            <button onClick={() => setShowFilter(p => !p)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '9px 12px', border: `1px solid ${showFilter || filterRules.length > 0 ? '#6366f1' : '#e2e8f0'}`, borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', backgroundColor: showFilter || filterRules.length > 0 ? '#eef2ff' : 'white', color: showFilter || filterRules.length > 0 ? '#6366f1' : '#374151' }}>
              <Filter size={14} /> Filter{filterRules.length > 0 ? ` (${filterRules.length})` : ''}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', backgroundColor: 'white', color: '#374151' }}>
              <Download size={14} /> Export
            </button>
            <button onClick={() => setShowImport(true)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', backgroundColor: 'white', color: '#374151' }}>
              <Upload size={14} /> Import
            </button>
            <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={16} /> Add Contact
            </button>
          </div>
        </div>

        {/* Filter builder */}
        {showFilter && (
          <div style={{ backgroundColor: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 20px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 }}>Advanced Filters</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
              {filterRules.map((rule, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select value={rule.field} onChange={e => updateRule(i, { field: e.target.value })} style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
                    {FILTER_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <select value={rule.op} onChange={e => updateRule(i, { op: e.target.value })} style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
                    {FILTER_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {!['is_empty', 'is_not_empty'].includes(rule.op) && (
                    <input value={rule.value} onChange={e => updateRule(i, { value: e.target.value })} placeholder="Value..."
                      style={{ flex: 1, padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, outline: 'none' }} />
                  )}
                  <button onClick={() => removeRule(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}><X size={14} color="#94a3b8" /></button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addRule} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 7, backgroundColor: 'white', color: '#6366f1', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <Plus size={12} /> Add Filter
              </button>
              {filterRules.length > 0 && (
                <button onClick={() => setFilterRules([])} style={{ padding: '6px 12px', border: '1px solid #fecaca', borderRadius: 7, backgroundColor: '#fef2f2', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  Clear All
                </button>
              )}
              <span style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center' }}>{filtered.length} contacts match</span>
            </div>
          </div>
        )}

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', backgroundColor: '#eef2ff', borderRadius: 8, marginBottom: 12, border: '1px solid #c7d2fe' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#6366f1' }}>{selected.size} selected</span>
            <button onClick={bulkTag} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', border: '1px solid #c7d2fe', borderRadius: 6, backgroundColor: 'white', color: '#6366f1', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><Tag size={12} /> Add Tag</button>
            <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', border: '1px solid #c7d2fe', borderRadius: 6, backgroundColor: 'white', color: '#6366f1', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><Download size={12} /> Export</button>
            <button onClick={bulkDelete} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', border: '1px solid #fecaca', borderRadius: 6, backgroundColor: '#fef2f2', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><Trash2 size={12} /> Delete</button>
            <button onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={16} /></button>
          </div>
        )}

        {/* Table */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', width: '40px' }}>
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={selectAll} style={{ cursor: 'pointer' }} />
                </th>
                {[['name','Name'], ['email','Contact'], ['status','Status'], ['company','Company'], ['tags','Tags'], ['value','Value'], ['lastActivity','Last Active']].map(([field, label]) => (
                  <th key={field} onClick={() => sortHeader(field)} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                    {label}<SortIcon field={field} />
                  </th>
                ))}
                <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((contact, i) => {
                const sc = statusColors[contact.status];
                return (
                  <tr key={contact.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'white')}>
                    <td style={{ padding: '14px 16px' }}>
                      <input type="checkbox" checked={selected.has(contact.id)} onChange={() => toggleSelect(contact.id)} style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '13px', fontWeight: 600, flexShrink: 0 }}>
                          {contact.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <button onClick={() => setProfileContact(contact)} style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', display: 'block' }}>
                            {contact.name}
                          </button>
                          <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>{contact.source}{contact.company ? ` · ${contact.company}` : ''}</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div>
                        {contact.email && <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}><Mail size={12} color="#94a3b8" /><span style={{ fontSize: '13px', color: '#374151' }}>{contact.email}</span></div>}
                        {contact.phone && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Phone size={12} color="#94a3b8" /><span style={{ fontSize: '13px', color: '#374151' }}>{contact.phone}</span></div>}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, backgroundColor: sc.bg, color: sc.color }}>
                        {contact.status.charAt(0).toUpperCase() + contact.status.slice(1)}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#374151' }}>{contact.company || '—'}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {contact.tags.slice(0, 3).map(tag => (
                          <span key={tag} style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', backgroundColor: '#f1f5f9', color: '#64748b', fontWeight: 500 }}>{tag}</span>
                        ))}
                        {contact.tags.length > 3 && <span style={{ fontSize: '11px', color: '#94a3b8' }}>+{contact.tags.length - 3}</span>}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
                      {contact.value > 0 ? `$${contact.value.toLocaleString()}` : '—'}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#94a3b8' }}>{contact.lastActivity}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => setProfileContact(contact)} style={{ padding: '5px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', display: 'flex' }} title="View Profile"><Eye size={13} color="#6366f1" /></button>
                        <button onClick={() => setEditContact(contact)} style={{ padding: '5px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', display: 'flex' }}><Edit2 size={13} color="#6366f1" /></button>
                        <button onClick={() => deleteContact(contact.id)} style={{ padding: '5px', borderRadius: '6px', border: '1px solid #fee2e2', backgroundColor: '#fef2f2', cursor: 'pointer', display: 'flex' }}><Trash2 size={13} color="#ef4444" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>
              <Users size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p style={{ margin: 0, fontSize: 14 }}>No contacts found matching your filters.</p>
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
