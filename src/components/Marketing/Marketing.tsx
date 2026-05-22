import React, { useState } from 'react';
import { Mail, MessageSquare, Zap, Plus, Play, Pause, BarChart2, Users, Upload, GitBranch } from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import ContactImport from './ContactImport';
import SequenceBuilder from './SequenceBuilder';
import AutomationBuilder from './AutomationBuilder';
import CampaignWizard from './CampaignWizard';
import type { Campaign } from '../../types';
import type { EmailSequence } from '../../types/marketing';

/* ─── Campaign tab ─── */

const typeIcons: Record<string, React.ReactElement> = {
  email: <Mail size={14} />, sms: <MessageSquare size={14} />, sequence: <Zap size={14} />,
};
const typeColors: Record<string, string> = { email: '#3b82f6', sms: '#22c55e', sequence: '#8b5cf6' };
const campaignStatusColors: Record<string, { bg: string; color: string }> = {
  active: { bg: '#ecfdf5', color: '#16a34a' },
  draft: { bg: '#f8fafc', color: '#64748b' },
  paused: { bg: '#fef3c7', color: '#d97706' },
  completed: { bg: '#eff6ff', color: '#2563eb' },
};

function MetricBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '11px', color: '#64748b' }}>{label}</span>
        <span style={{ fontSize: '11px', fontWeight: 600, color }}>{pct}%</span>
      </div>
      <div style={{ height: '4px', backgroundColor: '#e2e8f0', borderRadius: '2px' }}>
        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: '2px' }} />
      </div>
      <span style={{ fontSize: '11px', color: '#94a3b8' }}>{value.toLocaleString()}</span>
    </div>
  );
}

function CampaignsTab() {
  const { campaigns, addCampaign, toggleCampaignStatus, contacts } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const filtered = campaigns.filter(c => typeFilter === 'all' || c.type === typeFilter);
  const totalSent = campaigns.reduce((s, c) => s + c.sent, 0);
  const withSent = campaigns.filter(c => c.sent > 0);
  const avgOpen = withSent.length > 0 ? withSent.reduce((s, c) => s + c.opened / c.sent, 0) / withSent.length * 100 : 0;
  return (
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
            <button key={t} onClick={() => setTypeFilter(t)}
              style={{ padding: '7px 14px', borderRadius: '8px', border: `1px solid ${typeFilter === t ? '#6366f1' : '#e2e8f0'}`, backgroundColor: typeFilter === t ? '#6366f1' : 'white', color: typeFilter === t ? 'white' : '#64748b', fontSize: '13px', cursor: 'pointer', textTransform: 'capitalize', fontWeight: 500 }}>
              {t === 'all' ? 'All' : t.toUpperCase()}
            </button>
          ))}
        </div>
        <button onClick={() => setShowModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={15} /> Create Campaign
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filtered.map(campaign => {
          const sc = campaignStatusColors[campaign.status];
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
                  <button onClick={() => toggleCampaignStatus(campaign.id)}
                    style={{ padding: '7px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', display: 'flex' }}>
                    {campaign.status === 'active' ? <Pause size={14} color="#64748b" /> : <Play size={14} color="#64748b" />}
                  </button>
                </div>
              </div>
              {campaign.sent > 0 ? (
                <div style={{ display: 'flex', gap: '20px' }}>
                  <MetricBar label="Open Rate" value={campaign.opened} total={campaign.sent} color="#6366f1" />
                  <MetricBar label="Click Rate" value={campaign.clicked} total={campaign.sent} color="#3b82f6" />
                  <MetricBar label="Reply Rate" value={campaign.replied} total={campaign.sent} color="#22c55e" />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Total Sent</p>
                    <p style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: 0 }}>{campaign.sent.toLocaleString()}</p>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                  Draft — no messages sent yet. Click play to launch.
                </div>
              )}
            </div>
          );
        })}
      </div>
      {showModal && <CampaignWizard contacts={contacts} onClose={() => setShowModal(false)} onAdd={addCampaign} />}
    </div>
  );
}

/* ─── Tab definitions ─── */

type TabId = 'campaigns' | 'import' | 'sequences' | 'automations';

/* ─── Root component ─── */

export default function Marketing() {
  const [activeTab, setActiveTab] = useState<TabId>('campaigns');
  const ctx = useApp();
  const { contacts, sequences, automations, addSequence, updateSequence, deleteSequence, addAutomation, updateAutomation, deleteAutomation, bulkImportContacts, addCampaign, addNotification } = ctx;

  const handleActivateSequence = (seq: EmailSequence) => {
    addCampaign({
      name: seq.name, type: 'sequence', status: 'active',
      sent: Math.floor(Math.random() * 200) + 20,
      opened: 0, clicked: 0, replied: 0,
      createdAt: new Date().toISOString().split('T')[0],
    });
    addNotification(`Sequence "${seq.name}" pushed live as active campaign!`);
  };

  const activeSeqCount = sequences.filter(s => s.status === 'active').length;
  const activeAutoCount = automations.filter(a => a.status === 'active').length;

  const tabs: { id: TabId; label: string; icon: React.ReactElement; badge?: number }[] = [
    { id: 'campaigns', label: 'Campaigns', icon: <Mail size={15} /> },
    { id: 'import', label: 'Import Contacts', icon: <Upload size={15} /> },
    { id: 'sequences', label: 'Email Sequences', icon: <Zap size={15} />, badge: activeSeqCount || undefined },
    { id: 'automations', label: 'Automations', icon: <GitBranch size={15} />, badge: activeAutoCount || undefined },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Header title="Marketing" subtitle="Campaigns · Imports · Sequences · Automations" />

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '2px', padding: '0 28px', borderBottom: '1px solid #e2e8f0', backgroundColor: 'white', flexShrink: 0 }}>
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '12px 16px', border: 'none', borderBottom: `2px solid ${isActive ? '#6366f1' : 'transparent'}`, backgroundColor: 'transparent', cursor: 'pointer', fontSize: '13px', fontWeight: isActive ? 600 : 500, color: isActive ? '#6366f1' : '#64748b', transition: 'all 0.15s', whiteSpace: 'nowrap', marginBottom: '-1px' }}>
              <span style={{ color: isActive ? '#6366f1' : '#94a3b8' }}>{tab.icon}</span>
              {tab.label}
              {tab.badge && (
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '10px', backgroundColor: '#ecfdf5', color: '#16a34a' }}>{tab.badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden', backgroundColor: '#f8fafc' }}>
        {activeTab === 'campaigns' && (
          <div style={{ height: '100%', overflowY: 'auto' }}><CampaignsTab /></div>
        )}
        {activeTab === 'import' && (
          <div style={{ height: '100%', overflowY: 'auto' }}>
            <ContactImport contacts={contacts} onBulkImport={bulkImportContacts} onNotify={addNotification} />
          </div>
        )}
        {activeTab === 'sequences' && (
          <SequenceBuilder
            sequences={sequences}
            onAddSequence={addSequence}
            onUpdateSequence={updateSequence}
            onDeleteSequence={deleteSequence}
            onActivateSequence={handleActivateSequence}
            onNotify={addNotification}
          />
        )}
        {activeTab === 'automations' && (
          <AutomationBuilder
            automations={automations}
            onAddAutomation={addAutomation}
            onUpdateAutomation={updateAutomation}
            onDeleteAutomation={deleteAutomation}
            onNotify={addNotification}
          />
        )}
      </div>
    </div>
  );
}
