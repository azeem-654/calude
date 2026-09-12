import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, MessageSquare, Zap, Plus, Play, Pause, BarChart2, Users, Upload, GitBranch, ChevronRight, Shield, Settings } from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import { isEmailConfigured } from '../../services/emailService';
import ContactImport from './ContactImport';
import SequenceBuilder from './SequenceBuilder';
import AutomationBuilder from './AutomationBuilder';
import CampaignWizard from './CampaignWizard';
import CampaignDetailPanel from './CampaignDetailPanel';
import type { Campaign } from '../../types';
import type { EmailSequence } from '../../types/marketing';
import SourceTag from '../shared/SourceTag';

/* ─── Campaign tab ─── */

const typeIcons: Record<string, React.ReactElement> = {
  email: <Mail size={14} />, sms: <MessageSquare size={14} />, sequence: <Zap size={14} />,
};
const typeColors: Record<string, string> = { email: '#3b82f6', sms: '#22c55e', sequence: '#3b3f45' };
const campaignStatusColors: Record<string, { bg: string; color: string }> = {
  active: { bg: '#ecfdf5', color: '#16a34a' },
  draft: { bg: '#f1f5f9', color: '#64748b' },
  paused: { bg: '#fffbeb', color: '#d97706' },
  completed: { bg: '#eceef1', color: '#17191c' },
};

function MetricBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</span>
        <span style={{ fontSize: '11px', fontWeight: 600, color }}>{pct}%</span>
      </div>
      <div style={{ height: '6px', backgroundColor: '#f1f5f9', borderRadius: '9999px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: '#17191c', borderRadius: '9999px' }} />
      </div>
      <span style={{ fontSize: '11px', color: '#94a3b8' }}>{value.toLocaleString()}</span>
    </div>
  );
}

function CampaignsTab() {
  const navigate = useNavigate();
  const { campaigns, addCampaign, updateCampaign, deleteCampaign, toggleCampaignStatus, contacts } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [dismissedProviderBanner, setDismissedProviderBanner] = useState(false);

  const emailReady = isEmailConfigured();
  const filtered = campaigns.filter(c => typeFilter === 'all' || c.type === typeFilter);
  /* One campaign missing a counter used to make the whole tile read "NaN":
     `s + undefined` is NaN and every later addition keeps it. A record can
     arrive without one from an import, from an older version, or from any
     creator that did not think to set it, and the total of everything else is
     still worth showing. */
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const totalSent = campaigns.reduce((s, c) => s + n(c.sent), 0);
  const withSent = campaigns.filter(c => n(c.sent) > 0);
  const avgOpen = withSent.length > 0 ? withSent.reduce((s, c) => s + n(c.opened) / n(c.sent), 0) / withSent.length * 100 : 0;

  const handleEditFromPanel = () => {
    setEditingCampaign(selectedCampaign);
    setSelectedCampaign(null);
  };

  return (
    <div style={{ padding: '28px' }}>
      {/* Email provider setup nudge — non-blocking */}
      {!emailReady && !dismissedProviderBanner && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, marginBottom: 18 }}>
          <Settings size={16} color="#d97706" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 13, color: '#92400e' }}>
            <strong>Email provider not set up yet.</strong> You can create and draft campaigns now — connect SMTP, Resend, or Mailtrap in{' '}
            <button onClick={() => navigate('/settings?tab=email-sms')} style={{ border: 'none', background: 'none', color: '#17191c', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 13, textDecoration: 'underline', textUnderlineOffset: 2, fontFamily: 'inherit' }}>Settings → Email &amp; SMS</button> when ready to send.
          </div>
          <button onClick={() => setDismissedProviderBanner(true)} style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2, display: 'flex' }}>✕</button>
        </div>
      )}
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '24px' }}>
        {[
          { label: 'Total Campaigns', value: campaigns.length, icon: Mail, color: '#17191c' },
          { label: 'Total Sent', value: totalSent.toLocaleString(), icon: Users, color: '#3b82f6' },
          { label: 'Avg Open Rate', value: `${avgOpen.toFixed(1)}%`, icon: BarChart2, color: '#22c55e' },
          { label: 'Active', value: campaigns.filter(c => c.status === 'active').length, icon: Play, color: '#f59e0b' },
        ].map(item => (
          <div key={item.label}
            style={{ backgroundColor: 'white', borderRadius: '18px', padding: '20px', border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', display: 'flex', alignItems: 'center', gap: '14px', transition: 'box-shadow 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(16,24,40,0.08)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 2px rgba(16,24,40,0.04)'; }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: `${item.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <item.icon size={20} color={item.color} />
            </div>
            <div>
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0 0 3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{item.label}</p>
              <p style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>{item.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'inline-flex', gap: '2px', padding: '3px', borderRadius: '10px', backgroundColor: '#f1f5f9', border: '1px solid #e6e9f0' }}>
          {['all', 'email', 'sms', 'sequence'].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', backgroundColor: typeFilter === t ? 'white' : 'transparent', color: typeFilter === t ? '#0f172a' : '#64748b', fontSize: '12px', cursor: 'pointer', textTransform: 'capitalize', fontWeight: typeFilter === t ? 600 : 500, boxShadow: typeFilter === t ? '0 1px 2px rgba(16,24,40,0.08)' : 'none', transition: 'all 0.15s' }}>
              {t === 'all' ? 'All' : t.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', backgroundColor: '#17191c', color: 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 2px rgba(23,25,28,0.3)' }}>
            <Plus size={15} /> Create Campaign
          </button>
        </div>
      </div>

      {/* Campaign list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filtered.length === 0 && (
          <div style={{ padding: '56px 40px', backgroundColor: 'white', borderRadius: '18px', border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: '#eceef1', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Mail size={28} color="#17191c" />
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>No campaigns yet</p>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 20px' }}>Create your first campaign to start reaching your audience.</p>
            <button onClick={() => setShowModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 16px', backgroundColor: '#17191c', color: 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 2px rgba(23,25,28,0.3)' }}>
              <Plus size={15} /> Create Campaign
            </button>
          </div>
        )}
        {filtered.map(campaign => {
          const sc = campaignStatusColors[campaign.status] || campaignStatusColors.draft;
          const tc = typeColors[campaign.type];
          return (
            <div key={campaign.id} onClick={() => setSelectedCampaign(campaign)}
              style={{ backgroundColor: 'white', borderRadius: '18px', padding: '20px', border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', cursor: 'pointer', transition: 'box-shadow 0.15s, border-color 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(16,24,40,0.08)'; (e.currentTarget as HTMLDivElement).style.borderColor = '#d5d8dd'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 2px rgba(16,24,40,0.04)'; (e.currentTarget as HTMLDivElement).style.borderColor = '#e6e9f0'; }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: campaign.sent > 0 ? '14px' : '0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: `${tc}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tc, flexShrink: 0 }}>
                    {typeIcons[campaign.type]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{campaign.name}</p>
                    <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>
                      {campaignDate(campaign.createdAt)} · {campaign.type.toUpperCase()}
                      {campaign.goal ? ` · ${campaign.goal}` : ''}
                      {campaign.audience ? ` · ${campaign.audience}` : ''}
                    </p>
                    {campaign.source && (
                      <div style={{ marginTop: 5 }}><SourceTag source={campaign.source} /></div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: 12 }}>
                  <span style={{ padding: '3px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: 600, backgroundColor: sc.bg, color: sc.color }}>
                    {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                  </span>
                  <button onClick={e => { e.stopPropagation(); toggleCampaignStatus(campaign.id); }}
                    style={{ padding: '6px', borderRadius: '9px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', display: 'flex' }}>
                    {campaign.status === 'active' ? <Pause size={13} color="#64748b" /> : <Play size={13} color="#64748b" />}
                  </button>
                  <ChevronRight size={15} color="#cbd5e1" />
                </div>
              </div>
              {campaign.sent > 0 && (
                <div style={{ display: 'flex', gap: '16px', paddingTop: '14px', borderTop: '1px solid #f1f5f9' }}>
                  <MetricBar label="Open" value={campaign.opened} total={campaign.sent} color="#17191c" />
                  <MetricBar label="Click" value={campaign.clicked} total={campaign.sent} color="#3b82f6" />
                  <MetricBar label="Reply" value={campaign.replied} total={campaign.sent} color="#22c55e" />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Sent</p>
                    <p style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>{campaign.sent.toLocaleString()}</p>
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
            /* Returned, not discarded: the wizard needs the saved record back
               to enrol a rescheduled campaign into the sequence engine. */
            return { ...editingCampaign, ...data };
          }}
        />
      )}

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

/* ─── Deliverability Tab ─── */

/*
 * The "Deliverability Suite" tab used to live here, and every number on it was
 * invented: one hardcoded mailbox called you@yourdomain.com, 94% deliverability,
 * 12 sent today, "Last sync: Just now". The "Link mailbox" button had no
 * handler at all, and the warm-up modal wrote its settings nowhere.
 *
 * All of it already exists for real elsewhere — Settings → Email & SMS connects
 * mailboxes, Settings → Deliverability runs the actual SPF/DKIM/DMARC and
 * blacklist checks and holds the suppression list, and WarmupPanel runs a real
 * warm-up against real sends. A second copy made of stage scenery, sitting in
 * front of the module a customer is about to send from, is the most damaging
 * possible place to put a fake number: it says deliverability is fine when
 * nothing has been checked.
 *
 * So it is gone rather than rebuilt. The tab bar links across instead.
 */

/* ─── Tab definitions ─── */

type TabId = 'campaigns' | 'sequences' | 'automations' | 'import';

/* The set an address is checked against, so an unknown ?tab= falls back to the
   default rather than rendering nothing at all. */
const TAB_IDS: TabId[] = ['campaigns', 'sequences', 'automations', 'import'];

/* ─── Root component ─── */

/**
 * The stored date, as a person would write it.
 *
 * This printed `campaign.createdAt` straight out. The app's own creator stores
 * a plain `YYYY-MM-DD`, so it usually looked fine — but anything that stored a
 * full timestamp put `2026-08-16T16:43:48.343Z` in the middle of the campaign
 * list, and a string nobody set is worse than a blank. Formatting it here means
 * the list is right whatever wrote the record.
 */
function campaignDate(raw: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Marketing() {
  /*
   * The chosen tab lives in the address.
   *
   * It was `useState('campaigns')`, so every link that named a tab was
   * ignored — including Autopilot's own "here is the sequence I wrote", which
   * landed on Campaigns and left the customer looking at a list that did not
   * contain it. Nothing was missing; they were sent to the wrong shelf and
   * reasonably concluded the app had invented the work.
   *
   * Settings has done this correctly for a long time; this is the same
   * pattern, and now anything that says "/marketing?tab=…" is a real link.
   */
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab');
  const activeTab: TabId = TAB_IDS.includes(asked as TabId) ? (asked as TabId) : 'campaigns';
  const setActiveTab = (id: TabId) =>
    setParams(id === 'campaigns' ? {} : { tab: id }, { replace: true });
  const ctx = useApp();
  const { contacts, sequences, automations, addSequence, updateSequence, deleteSequence, addAutomation, updateAutomation, deleteAutomation, bulkImportContacts, addCampaign, addNotification } = ctx;

  const handleActivateSequence = (seq: EmailSequence) => {
    addCampaign({
      name: seq.name, type: 'sequence', status: 'active',
      sent: 0, opened: 0, clicked: 0, replied: 0,
      createdAt: new Date().toISOString().split('T')[0],
    });
    addNotification(`Sequence "${seq.name}" is now live!`);
  };

  const activeSeqCount = sequences.filter(s => s.status === 'active').length;
  const activeAutoCount = automations.filter(a => a.status === 'active').length;

  /*
   * Four tabs, and each one is a thing this module owns.
   *
   * It was six. "Deliverability" was scenery over a real panel in Settings, and
   * "Email Apps" connected ActiveCampaign and Mailchimp — a competitor sync
   * nobody asked for, which stored their API keys in plain text in
   * localStorage, where every other credential in this app is encrypted on the
   * server and never returned to a browser.
   */
  const tabs: { id: TabId; label: string; icon: React.ReactElement; badge?: number }[] = [
    { id: 'campaigns',   label: 'Campaigns',  icon: <Mail size={15} /> },
    { id: 'sequences',   label: 'Sequences',  icon: <Zap size={15} />, badge: activeSeqCount || undefined },
    { id: 'automations', label: 'Automations', icon: <GitBranch size={15} />, badge: activeAutoCount || undefined },
    { id: 'import',      label: 'Import a list', icon: <Upload size={15} /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Header title="Email campaigns" subtitle="Campaigns · Sequences · Automations" />

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '4px', padding: '0 28px', borderBottom: '1px solid #e6e9f0', backgroundColor: 'white', flexShrink: 0 }}>
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} aria-pressed={activeTab === tab.id}
              style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '13px 16px', border: 'none', borderBottom: `2px solid ${isActive ? '#17191c' : 'transparent'}`, backgroundColor: 'transparent', cursor: 'pointer', fontSize: '13px', fontWeight: isActive ? 600 : 500, color: isActive ? '#0f172a' : '#64748b', transition: 'all 0.15s', whiteSpace: 'nowrap', marginBottom: '-1px' }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = '#0f172a'; }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = '#64748b'; }}>
              <span style={{ color: isActive ? '#17191c' : '#94a3b8', display: 'flex' }}>{tab.icon}</span>
              {tab.label}
              {tab.badge && (
                <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 7px', borderRadius: '9999px', backgroundColor: '#ecfdf5', color: '#16a34a' }}>{tab.badge}</span>
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
            contacts={contacts}
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
