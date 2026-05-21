import React, { useState } from 'react';
import { Mail, MessageSquare, Zap, Plus, Play, Pause, BarChart2, Users, X } from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import type { Campaign } from '../../types';

const typeIcons: Record<string, React.ReactElement> = {
  email: <Mail size={14} />, sms: <MessageSquare size={14} />, sequence: <Zap size={14} />,
};
const typeColors: Record<string, string> = { email: '#3b82f6', sms: '#22c55e', sequence: '#8b5cf6' };
const statusColors: Record<string, { bg: string; color: string }> = {
  active: { bg: '#ecfdf5', color: '#16a34a' },
  draft: { bg: '#f8fafc', color: '#64748b' },
  paused: { bg: '#fef3c7', color: '#d97706' },
  completed: { bg: '#eff6ff', color: '#2563eb' },
};

function NewCampaignModal({ onClose, onAdd }: { onClose: () => void; onAdd: (c: Omit<Campaign, 'id'>) => void }) {
  const [form, setForm] = useState({ name: '', type: 'email' as Campaign['type'], status: 'draft' as Campaign['status'] });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({ ...form, sent: 0, opened: 0, clicked: 0, replied: 0, createdAt: new Date().toISOString().split('T')[0] });
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '420px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Create Campaign</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={20} color="#94a3b8" /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Campaign Name</label>
            <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Summer Newsletter" style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Campaign Type</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {(['email', 'sms', 'sequence'] as Campaign['type'][]).map(t => (
                <button key={t} type="button" onClick={() => setForm(p => ({ ...p, type: t }))} style={{ padding: '12px', border: `2px solid ${form.type === t ? typeColors[t] : '#e2e8f0'}`, borderRadius: '10px', backgroundColor: form.type === t ? `${typeColors[t]}10` : 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: typeColors[t] }}>{typeIcons[t]}</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: form.type === t ? typeColors[t] : '#374151', textTransform: 'capitalize' }}>{t}</span>
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', backgroundColor: 'white' }}>Cancel</button>
            <button type="submit" style={{ padding: '9px 18px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Create Campaign</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MetricBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '11px', color: '#64748b' }}>{label}</span>
        <span style={{ fontSize: '11px', fontWeight: 600, color }}>{ pct}%</span>
      </div>
      <div style={{ height: '4px', backgroundColor: '#e2e8f0', borderRadius: '2px' }}>
        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: '2px' }} />
      </div>
      <span style={{ fontSize: '11px', color: '#94a3b8' }}>{value.toLocaleString()}</span>
    </div>
  );
}

export default function Marketing() {
  const { campaigns, addCampaign, toggleCampaignStatus } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');

  const filtered = campaigns.filter(c => typeFilter === 'all' || c.type === typeFilter);
  const totalSent = campaigns.reduce((s, c) => s + c.sent, 0);
  const avgOpen = campaigns.filter(c => c.sent > 0).reduce((s, c) => s + (c.opened / c.sent), 0) / (campaigns.filter(c => c.sent > 0).length || 1) * 100;

  return (
    <div>
      <Header title="Marketing" subtitle="Manage campaigns and automations" />
      <div style={{ padding: '24px 28px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {[
            { label: 'Total Campaigns', value: campaigns.length, icon: Mail, color: '#6366f1' },
            { label: 'Total Sent', value: totalSent.toLocaleString(), icon: Users, color: '#3b82f6' },
            { label: 'Avg Open Rate', value: `${avgOpen.toFixed(1)}%`, icon: BarChart2, color: '#22c55e' },
            { label: 'Active Campaigns', value: campaigns.filter(c => c.status === 'active').length, icon: Play, color: '#f59e0b' },
          ].map(item => (
            <div key={item.label} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '18px 20px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '10px', backgroundColor: `${item.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <item.icon size={22} color={item.color} />
              </div>
              <div>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 4px', fontWeight: 500 }}>{item.label}</p>
                <p style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: 0 }}>{item.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['all', 'email', 'sms', 'sequence'].map(t => (
              <button key={t} onClick={() => setTypeFilter(t)} style={{ padding: '7px 14px', borderRadius: '8px', border: `1px solid ${typeFilter === t ? '#6366f1' : '#e2e8f0'}`, backgroundColor: typeFilter === t ? '#6366f1' : 'white', color: typeFilter === t ? 'white' : '#64748b', fontSize: '13px', cursor: 'pointer', textTransform: 'capitalize', fontWeight: 500 }}>
                {t === 'all' ? 'All' : t.toUpperCase()}
              </button>
            ))}
          </div>
          <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={15} /> Create Campaign
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.map(campaign => {
            const sc = statusColors[campaign.status];
            const tc = typeColors[campaign.type];
            return (
              <div key={campaign.id} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px 24px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: `${tc}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tc }}>
                      {typeIcons[campaign.type]}
                    </div>
                    <div>
                      <p style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', margin: 0 }}>{campaign.name}</p>
                      <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>Created {campaign.createdAt} · {campaign.type.toUpperCase()}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, backgroundColor: sc.bg, color: sc.color }}>
                      {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                    </span>
                    <button onClick={() => toggleCampaignStatus(campaign.id)} style={{ padding: '7px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', display: 'flex' }}>
                      {campaign.status === 'active' ? <Pause size={14} color="#64748b" /> : <Play size={14} color="#64748b" />}
                    </button>
                  </div>
                </div>
                {campaign.sent > 0 && (
                  <div style={{ display: 'flex', gap: '20px' }}>
                    <MetricBar label="Open Rate" value={campaign.opened} total={campaign.sent} color="#6366f1" />
                    <MetricBar label="Click Rate" value={campaign.clicked} total={campaign.sent} color="#3b82f6" />
                    <MetricBar label="Reply Rate" value={campaign.replied} total={campaign.sent} color="#22c55e" />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Total Sent</p>
                      <p style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: 0 }}>{campaign.sent.toLocaleString()}</p>
                    </div>
                  </div>
                )}
                {campaign.sent === 0 && (
                  <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                    Draft — no messages sent yet. Click play to launch.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {showModal && <NewCampaignModal onClose={() => setShowModal(false)} onAdd={addCampaign} />}
    </div>
  );
}
