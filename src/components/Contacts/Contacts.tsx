import React, { useState } from 'react';
import { Users, Plus, Search, Mail, Phone, Trash2, Edit2, ChevronDown } from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import type { Contact } from '../../types';

const statusColors: Record<string, { bg: string; color: string }> = {
  lead: { bg: '#eff6ff', color: '#2563eb' },
  prospect: { bg: '#fef3c7', color: '#d97706' },
  customer: { bg: '#ecfdf5', color: '#16a34a' },
  churned: { bg: '#fef2f2', color: '#dc2626' },
};

function ContactModal({ onClose, onSave, initial }: { onClose: () => void; onSave: (c: Omit<Contact, 'id'>) => void; initial?: Contact }) {
  const [form, setForm] = useState({
    name: initial?.name || '', email: initial?.email || '', phone: initial?.phone || '',
    status: initial?.status || 'lead' as Contact['status'], source: initial?.source || 'Website',
    tags: initial?.tags.join(', ') || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...form, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean), value: initial?.value || 0, createdAt: initial?.createdAt || new Date().toISOString().split('T')[0], lastActivity: new Date().toISOString().split('T')[0] });
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginBottom: '20px' }}>{initial ? 'Edit Contact' : 'Add New Contact'}</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            {[
              { label: 'Full Name', key: 'name', placeholder: 'John Smith', required: true },
              { label: 'Email', key: 'email', placeholder: 'john@example.com', type: 'email' },
              { label: 'Phone', key: 'phone', placeholder: '+1 (555) 000-0000' },
              { label: 'Source', key: 'source', placeholder: 'Website' },
            ].map(({ label, key, placeholder, type, required }) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>{label}</label>
                <input
                  required={required} type={type || 'text'} placeholder={placeholder}
                  value={(form as Record<string, string>)[key]}
                  onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', color: '#374151' }}
                />
              </div>
            ))}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Status</label>
              <select
                value={form.status}
                onChange={e => setForm(prev => ({ ...prev, status: e.target.value as Contact['status'] }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', color: '#374151' }}
              >
                <option value="lead">Lead</option>
                <option value="prospect">Prospect</option>
                <option value="customer">Customer</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Tags (comma separated)</label>
              <input
                placeholder="VIP, Referral"
                value={form.tags}
                onChange={e => setForm(prev => ({ ...prev, tags: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', color: '#374151' }}
              />
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

export default function Contacts() {
  const { contacts, addContact, updateContact, deleteContact } = useApp();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = contacts.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  return (
    <div>
      <Header title="Contacts" subtitle={`${contacts.length} total contacts`} />
      <div style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '10px', flex: 1 }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: '320px' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                placeholder="Search contacts..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', paddingLeft: '32px', paddingRight: '12px', paddingTop: '9px', paddingBottom: '9px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', color: '#374151', backgroundColor: 'white' }}
              />
            </div>
            <div style={{ position: 'relative' }}>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{ padding: '9px 12px', paddingRight: '32px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', color: '#374151', backgroundColor: 'white', appearance: 'none', cursor: 'pointer' }}
              >
                <option value="all">All Status</option>
                <option value="lead">Lead</option>
                <option value="prospect">Prospect</option>
                <option value="customer">Customer</option>
                <option value="churned">Churned</option>
              </select>
              <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
            </div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >
            <Plus size={16} /> Add Contact
          </button>
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', width: '40px' }}>
                  <input type="checkbox" style={{ cursor: 'pointer' }} />
                </th>
                {['Name', 'Contact', 'Status', 'Tags', 'Value', 'Last Activity', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((contact, i) => {
                const sc = statusColors[contact.status];
                return (
                  <tr key={contact.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'white')}
                  >
                    <td style={{ padding: '14px 16px' }}>
                      <input type="checkbox" checked={selected.has(contact.id)} onChange={() => toggleSelect(contact.id)} style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: `linear-gradient(135deg, #6366f1, #8b5cf6)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '13px', fontWeight: 600, flexShrink: 0 }}>
                          {contact.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <p style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', margin: 0 }}>{contact.name}</p>
                          <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>{contact.source}</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                          <Mail size={12} color="#94a3b8" />
                          <span style={{ fontSize: '13px', color: '#374151' }}>{contact.email}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Phone size={12} color="#94a3b8" />
                          <span style={{ fontSize: '13px', color: '#374151' }}>{contact.phone}</span>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, backgroundColor: sc.bg, color: sc.color }}>
                        {contact.status.charAt(0).toUpperCase() + contact.status.slice(1)}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {contact.tags.map(tag => (
                          <span key={tag} style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', backgroundColor: '#f1f5f9', color: '#64748b', fontWeight: 500 }}>{tag}</span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
                      {contact.value > 0 ? `$${contact.value.toLocaleString()}` : '—'}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#94a3b8' }}>{contact.lastActivity}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => setEditContact(contact)} style={{ padding: '6px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', display: 'flex' }}>
                          <Edit2 size={14} color="#6366f1" />
                        </button>
                        <button onClick={() => deleteContact(contact.id)} style={{ padding: '6px', borderRadius: '6px', border: '1px solid #fee2e2', backgroundColor: '#fef2f2', cursor: 'pointer', display: 'flex' }}>
                          <Trash2 size={14} color="#ef4444" />
                        </button>
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
              <p>No contacts found</p>
            </div>
          )}
        </div>
      </div>
      {showModal && <ContactModal onClose={() => setShowModal(false)} onSave={addContact} />}
      {editContact && <ContactModal initial={editContact} onClose={() => setEditContact(null)} onSave={(updates) => updateContact(editContact.id, updates)} />}
    </div>
  );
}
