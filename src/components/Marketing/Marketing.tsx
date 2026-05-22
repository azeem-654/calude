import React, { useState } from 'react';
import { Mail, MessageSquare, Zap, Plus, Play, Pause, BarChart2, Users, Upload, GitBranch, ChevronRight, Inbox } from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import ContactImport from './ContactImport';
import SequenceBuilder from './SequenceBuilder';
import AutomationBuilder from './AutomationBuilder';
import CampaignWizard from './CampaignWizard';
import CampaignDetailPanel from './CampaignDetailPanel';
import DemoInbox from './DemoInbox';
import { loadDemoEmails } from '../../services/emailService';
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
  const { campaigns, addCampaign, updateCampaign, deleteCampaign, toggleCampaignStatus, contacts } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [showDemoInbox, setShowDemoInbox] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const demoCount = loadDemoEmails().length;

  const filtered = campaigns.filter(c => typeFilter === 'all' || c.type === typeFilter);
  const totalSent = campaigns.reduce((s, c) => s + c.sent, 0);
  const withSent = campaigns.filter(c => c.sent > 0);
  const avgOpen = withSent.length > 0 ? withSent.reduce((s, c) => s + c.opened / c.sent, 0) / withSent.length * 100 : 0;

  const handleEditFromPanel = () => {
    setEditingCampaign(selectedCampaign);
    setSelectedCampaign(null);
  };

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '22px' }}>
        {[
          { label: 'Total Campaigns', value: campaigns.length, icon: Mail, color: '#6366f1' },
          { label: 'Total Sent', value: totalSent.toLocaleString(), icon: Users, color: '#3b82f6' },
          { label: 'Avg Open Rate', value: `${avgOpen.toFixed(1)}%`, icon: BarChart2, color: '#22c55e' },
          { label: 'Active', value: campaigns.filter(c => c.status === 'active').length, icon: Play, color: '#f59e0b' },
        ].map(item => (
          <div key={item.label} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '16px 18px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: `${item.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <item.icon size={20} color={item.color} />
            </div>
            <div>
              <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 3px', fontWeight: 500 }}>{item.label}</p>
              <p style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: 0 }}>{item.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {['all', 'email', 'sms', 'sequence'].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              style={{ padding: '6px 13px', borderRadius: '8px', border: `1px solid ${typeFilter === t ? '#6366f1' : '#e2e8f0'}`, backgroundColor: typeFilter === t ? '#6366f1' : 'white', color: typeFilter === t ? 'white' : '#64748b', fontSize: '12px', cursor: 'pointer', textTransform: 'capitalize', fontWeight: 500 }}>
              {t === 'all' ? 'All' : t.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowDemoInbox(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', backgroundColor: 'white', color: '#0284c7', border: '1px solid #bae6fd', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', position: 'relative' }}>
            <Inbox size={14} /> Demo Inbox
            {demoCount > 0 && (
              <span style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', backgroundColor: '#6366f1', color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {demoCount > 99 ? '99+' : demoCount}
              </span>
            )}
          </button>
          <button onClick={() => setShowModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={15} /> Create Campaign
          </button>
        </div>
      </div>

      {/* Campaign list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filtered.length === 0 && (
          <div style={{ padding: '40px', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'center', color: '#94a3b8' }}>
            <p style={{ fontSize: 14, margin: 0 }}>No campaigns yet. Click "Create Campaign" to get started.</p>
          </div>
        )}
        {filtered.map(campaign => {
          const sc = campaignStatusColors[campaign.status] || campaignStatusColors.draft;
          const tc = typeColors[campaign.type];
          return (
            <div key={campaign.id} onClick={() => setSelectedCampaign(campaign)}
              style={{ backgroundColor: 'white', borderRadius: '12px', padding: '16px 20px', border: '1px solid #e2e8f0', cursor: 'pointer', transition: 'box-shadow 0.15s, border-color 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(99,102,241,0.1)'; (e.currentTarget as HTMLDivElement).style.borderColor = '#c4b5fd'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = ''; (e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f0'; }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: campaign.sent > 0 ? '14px' : '0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: `${tc}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tc, flexShrink: 0 }}>
                    {typeIcons[campaign.type]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{campaign.name}</p>
                    <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>
                      {campaign.createdAt} · {campaign.type.toUpperCase()}
                      {campaign.goal ? ` · ${campaign.goal}` : ''}
                      {campaign.audience ? ` · ${campaign.audience}` : ''}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: 12 }}>
                  <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, backgroundColor: sc.bg, color: sc.color }}>
                    {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                  </span>
                  <button onClick={e => { e.stopPropagation(); toggleCampaignStatus(campaign.id); }}
                    style={{ padding: '6px', borderRadius: '7px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', display: 'flex' }}>
                    {campaign.status === 'active' ? <Pause size={13} color="#64748b" /> : <Play size={13} color="#64748b" />}
                  </button>
                  <ChevronRight size={15} color="#cbd5e1" />
                </div>
              </div>
              {campaign.sent > 0 && (
                <div style={{ display: 'flex', gap: '16px', paddingTop: '12px', borderTop: '1px solid #f8fafc' }}>
                  <MetricBar label="Open" value={campaign.opened} total={campaign.sent} color="#6366f1" />
                  <MetricBar label="Click" value={campaign.clicked} total={campaign.sent} color="#3b82f6" />
                  <MetricBar label="Reply" value={campaign.replied} total={campaign.sent} color="#22c55e" />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '10px', color: '#64748b', marginBottom: '3px', fontWeight: 500 }}>Sent</p>
                    <p style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>{campaign.sent.toLocaleString()}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create wizard */}
      {showModal && (
        <CampaignWizard contacts={contacts} onClose={() => setShowModal(false)} onAdd={addCampaign} />
      )}

      {/* Edit wizard */}
      {editingCampaign && (
        <CampaignWizard
          contacts={contacts}
          editCampaign={editingCampaign}
          onClose={() => setEditingCampaign(null)}
          onAdd={data => {
            updateCampaign(editingCampaign.id, data);
            setEditingCampaign(null);
          }}
        />
      )}

      {/* Demo Inbox */}
      {showDemoInbox && <DemoInbox onClose={() => setShowDemoInbox(false)} />}

      {/* Detail panel */}
      {selectedCampaign && (
        <CampaignDetailPanel
          campaign={selectedCampaign}
          contacts={contacts}
          onClose={() => setSelectedCampaign(null)}
          onEdit={handleEditFromPanel}
          onToggleStatus={() => {
            toggleCampaignStatus(selectedCampaign.id);
            setSelectedCampaign(prev => prev ? { ...prev, status: prev.status === 'active' ? 'paused' : 'active' } : null);
          }}
          onDelete={() => {
            deleteCampaign(selectedCampaign.id);
            setSelectedCampaign(null);
          }}
        />
      )}
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
