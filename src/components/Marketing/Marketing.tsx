import React, { useState } from 'react';
import { Mail, MessageSquare, Zap, Plus, Play, Pause, BarChart2, Users, Upload, GitBranch, ChevronRight, Inbox, Shield, Check, ToggleLeft, ToggleRight, Grid3x3, Settings } from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import { isEmailConfigured } from '../../services/emailService';
import ContactImport from './ContactImport';
import SequenceBuilder from './SequenceBuilder';
import AutomationBuilder from './AutomationBuilder';
import CampaignWizard from './CampaignWizard';
import CampaignDetailPanel from './CampaignDetailPanel';
import EmailApps from './EmailApps';
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
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [dismissedProviderBanner, setDismissedProviderBanner] = useState(false);

  const emailReady = isEmailConfigured();
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
      {/* Email provider setup nudge — non-blocking */}
      {!emailReady && !dismissedProviderBanner && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, marginBottom: 18 }}>
          <Settings size={16} color="#d97706" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 13, color: '#92400e' }}>
            <strong>Email provider not set up yet.</strong> You can create and draft campaigns now — connect SMTP, Resend, or Mailtrap in{' '}
            <button onClick={() => { window.location.hash = '#/settings'; }} style={{ border: 'none', background: 'none', color: '#6366f1', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 13 }}>Settings → Email & SMS</button> when ready to send.
          </div>
          <button onClick={() => setDismissedProviderBanner(true)} style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2, display: 'flex' }}>✕</button>
        </div>
      )}
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

type WarmupType = 'progressive' | 'flat' | 'randomize';

function DeliverabilityTab() {
  const [mailboxes] = useState([
    { email: 'you@yourdomain.com', type: 'Gmail', warmup: true, warmupOn: true, dailyLimit: 40, sent: 12, deliverability: 94, lastSync: 'Just now' },
  ]);
  const [showWarmupModal, setShowWarmupModal] = useState(false);
  const [warmupType, setWarmupType] = useState<WarmupType>('progressive');
  const [minEmails, setMinEmails] = useState(10);
  const [maxEmails, setMaxEmails] = useState(40);
  const [replyPct, setReplyPct] = useState(30);
  const [continuous, setContinuous] = useState(true);
  const [endDate, setEndDate] = useState('');

  const warmupDescriptions: Record<WarmupType, { label: string; desc: string }> = {
    progressive: { label: 'Progressive', desc: 'The number of emails sent per day will gradually increase.' },
    flat:        { label: 'Flat',        desc: 'The number of emails sent each day will be exactly the same.' },
    randomize:   { label: 'Randomize',   desc: 'The number of emails and each day will not be determined.' },
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: 820 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Deliverability Suite</h2>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Warm up your mailboxes to improve deliverability and avoid the spam folder.</p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Connected Mailboxes', value: mailboxes.length, color: '#6366f1', icon: <Inbox size={18} color="#6366f1" /> },
          { label: 'Warming Up', value: mailboxes.filter(m => m.warmupOn).length, color: '#f59e0b', icon: <Zap size={18} color="#f59e0b" /> },
          { label: 'Avg Deliverability', value: `${mailboxes.reduce((s, m) => s + m.deliverability, 0) / (mailboxes.length || 1)}%`, color: '#22c55e', icon: <Shield size={18} color="#22c55e" /> },
          { label: 'Emails Today', value: mailboxes.reduce((s, m) => s + m.sent, 0), color: '#3b82f6', icon: <Mail size={18} color="#3b82f6" /> },
        ].map(item => (
          <div key={item.label} style={{ backgroundColor: 'white', borderRadius: 12, padding: '16px 18px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: `${item.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{item.icon}</div>
            <div>
              <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 3px', fontWeight: 500 }}>{item.label}</p>
              <p style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: 0 }}>{item.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Mailbox list */}
      <div style={{ backgroundColor: 'white', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>My mailboxes</span>
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={13} /> Link mailbox
          </button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc' }}>
              {['Mailbox', 'Type', 'Setup', 'Warmup', 'Daily limit', 'Sent today', 'Deliverability', 'Last sync'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mailboxes.map(m => (
              <tr key={m.email} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{m.email}</td>
                <td style={{ padding: '12px 14px' }}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, backgroundColor: '#dbeafe', color: '#1d4ed8', fontWeight: 600 }}>{m.type}</span></td>
                <td style={{ padding: '12px 14px' }}><span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#16a34a' }}><Check size={12} /> Connected</span></td>
                <td style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => setShowWarmupModal(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 7, backgroundColor: m.warmupOn ? '#fffbeb' : 'white', color: m.warmupOn ? '#d97706' : '#64748b', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                      {m.warmupOn ? <ToggleRight size={13} color="#f59e0b" /> : <ToggleLeft size={13} />}
                      {m.warmupOn ? 'On' : 'Off'}
                    </button>
                    {m.warmupOn && <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 600 }}>✓ Active</span>}
                  </div>
                </td>
                <td style={{ padding: '12px 14px', fontSize: 13, color: '#374151' }}>{m.dailyLimit}</td>
                <td style={{ padding: '12px 14px', fontSize: 13, color: '#374151' }}>{m.sent} / {m.dailyLimit}</td>
                <td style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 50, height: 5, backgroundColor: '#e2e8f0', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${m.deliverability}%`, backgroundColor: m.deliverability >= 90 ? '#22c55e' : m.deliverability >= 70 ? '#f59e0b' : '#ef4444', borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: m.deliverability >= 90 ? '#16a34a' : '#d97706' }}>{m.deliverability}%</span>
                  </div>
                </td>
                <td style={{ padding: '12px 14px', fontSize: 12, color: '#94a3b8' }}>{m.lastSync}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tips */}
      <div style={{ backgroundColor: '#fffbeb', borderRadius: 12, border: '1px solid #fde68a', padding: '16px 20px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 10 }}>💡 Deliverability Tips</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            'Start slow — under 20 emails/day for the first week.',
            'Keep reply rate above 25% during warmup.',
            'Avoid spam trigger words in subject lines.',
            'Set up SPF, DKIM, and DMARC on your domain.',
          ].map(tip => (
            <div key={tip} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Check size={13} color="#d97706" style={{ marginTop: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#78350f' }}>{tip}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Warmup settings modal */}
      {showWarmupModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowWarmupModal(false)}>
          <div style={{ backgroundColor: 'white', borderRadius: 16, width: '100%', maxWidth: 580, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Mailbox Warmup Settings</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Inbox Warmup improves email deliverability by gradually increasing outbound volume over time to build sender reputation.</div>
              </div>
              <button onClick={() => setShowWarmupModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><Shield size={18} /></button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Warmup type */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 10 }}>Select your warmup options</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                  {(['progressive', 'flat', 'randomize'] as WarmupType[]).map(t => (
                    <button key={t} onClick={() => setWarmupType(t)}
                      style={{ padding: '12px 10px', border: `2px solid ${warmupType === t ? '#6366f1' : '#e2e8f0'}`, borderRadius: 10, backgroundColor: warmupType === t ? '#eef2ff' : 'white', cursor: 'pointer', textAlign: 'center' }}>
                      {warmupType === t && <Check size={14} color="#6366f1" style={{ display: 'block', margin: '0 auto 4px' }} />}
                      <div style={{ fontSize: 12, fontWeight: 700, color: warmupType === t ? '#4f46e5' : '#374151', textTransform: 'capitalize' }}>{warmupDescriptions[t].label}</div>
                      <div style={{ fontSize: 10, color: '#64748b', marginTop: 3, lineHeight: 1.3 }}>{warmupDescriptions[t].desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              {/* Settings grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                {[
                  { label: 'Warm up to (end)', value: endDate, isDate: true, onChange: (v: string) => setEndDate(v) },
                  { label: 'Min emails/day', value: minEmails, min: 1, max: 20, onChange: (v: string) => setMinEmails(parseInt(v)) },
                  { label: 'Max emails/day', value: maxEmails, min: 10, max: 100, onChange: (v: string) => setMaxEmails(parseInt(v)) },
                  { label: 'Reply rate %', value: replyPct, min: 10, max: 80, onChange: (v: string) => setReplyPct(parseInt(v)) },
                ].map(f => (
                  <div key={f.label}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 5 }}>{f.label}</label>
                    <input type={f.isDate ? 'date' : 'number'} value={f.value} min={(f as { min?: number }).min} max={(f as { max?: number }).max}
                      onChange={e => f.onChange(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                    {!f.isDate && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>{(f as { min?: number }).min ? `Recommended: ${(f as { min?: number }).min}–${(f as { max?: number }).max}` : ''}</div>}
                  </div>
                ))}
              </div>
              {/* Continuous warmup */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={continuous} onChange={e => setContinuous(e.target.checked)} style={{ marginTop: 3, accentColor: '#6366f1', cursor: 'pointer' }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Continuous warmup</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Continuous warmup keeps sending warmup emails after your scheduled end date to maintain deliverability.</div>
                </div>
              </label>
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setShowWarmupModal(false)} style={{ padding: '8px 18px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, cursor: 'pointer', backgroundColor: 'white' }}>Skip step</button>
              <button onClick={() => setShowWarmupModal(false)}
                style={{ padding: '8px 18px', backgroundColor: '#f59e0b', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Warm up mailbox
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Tab definitions ─── */

type TabId = 'campaigns' | 'import' | 'sequences' | 'automations' | 'deliverability' | 'emailapps';

/* ─── Root component ─── */

export default function Marketing() {
  const [activeTab, setActiveTab] = useState<TabId>('campaigns');
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

  const tabs: { id: TabId; label: string; icon: React.ReactElement; badge?: number }[] = [
    { id: 'campaigns',      label: 'Campaigns',      icon: <Mail size={15} /> },
    { id: 'sequences',      label: 'Sequences',       icon: <Zap size={15} />, badge: activeSeqCount || undefined },
    { id: 'automations',    label: 'Automations',     icon: <GitBranch size={15} />, badge: activeAutoCount || undefined },
    { id: 'deliverability', label: 'Deliverability',  icon: <Shield size={15} /> },
    { id: 'emailapps',      label: 'Email Apps',      icon: <Grid3x3 size={15} /> },
    { id: 'import',         label: 'Import Contacts', icon: <Upload size={15} /> },
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
            contacts={contacts}
            onAddSequence={addSequence}
            onUpdateSequence={updateSequence}
            onDeleteSequence={deleteSequence}
            onActivateSequence={handleActivateSequence}
            onNotify={addNotification}
          />
        )}
        {activeTab === 'deliverability' && (
          <div style={{ height: '100%', overflowY: 'auto' }}><DeliverabilityTab /></div>
        )}
        {activeTab === 'emailapps' && (
          <div style={{ height: '100%', overflowY: 'auto' }}>
            <EmailApps contacts={contacts} />
          </div>
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
