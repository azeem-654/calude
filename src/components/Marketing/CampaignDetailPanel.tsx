import React, { useState } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import type { Campaign, Contact } from '../../types';
import { sanitizeEmailHtml } from '../../services/emailHtml';
import { loadEnrollments, type SequenceEnrollment } from '../../services/contactEmail';
import {
  X, Mail, MessageSquare, Zap, Play, Pause, Edit2, Trash2,
  BarChart2, Users, MousePointerClick, Reply, AlertCircle,
  CheckCircle, ChevronDown, ChevronUp, Clock, Settings,
  ArrowLeft,
} from 'lucide-react';

const TYPE_META: Record<string, { icon: React.ReactElement; color: string; label: string }> = {
  email:    { icon: <Mail size={14} />,          color: '#3b82f6', label: 'Email' },
  sms:      { icon: <MessageSquare size={14} />, color: '#22c55e', label: 'SMS' },
  sequence: { icon: <Zap size={14} />,           color: '#8b5cf6', label: 'Sequence' },
};
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  active:    { bg: '#ecfdf5', color: '#16a34a' },
  draft:     { bg: '#f8fafc', color: '#64748b' },
  paused:    { bg: '#fef3c7', color: '#d97706' },
  completed: { bg: '#eff6ff', color: '#2563eb' },
};

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactElement; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div style={{ backgroundColor: 'white', borderRadius: 12, padding: '16px 18px', border: '1px solid #e2e8f0', flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>{icon}</div>
        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{label}</span>
      </div>
      <p style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>{sub}</p>}
    </div>
  );
}

function MetricRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{label}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color }}>{pct}%</span>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{value.toLocaleString()}</span>
        </div>
      </div>
      <div style={{ height: 6, backgroundColor: '#f1f5f9', borderRadius: 3 }}>
        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

export default function CampaignDetailPanel({
  campaign, contacts, onClose, onEdit, onToggleStatus, onDelete,
}: {
  campaign: Campaign;
  contacts: Contact[];
  onClose: () => void;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}) {
  useEscapeKey(true, onClose);
  const [activeTab, setActiveTab] = useState<'overview' | 'steps' | 'contacts' | 'settings'>('overview');
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const tm = TYPE_META[campaign.type];
  const sc = STATUS_COLORS[campaign.status] || STATUS_COLORS.draft;

  const bounced = campaign.bounced || 0;
  const unsubscribed = campaign.unsubscribed || 0;
  const deliverabilityRate = campaign.sent > 0 ? Math.round(((campaign.sent - bounced) / campaign.sent) * 100) : 100;

  /*
   * The real audience, not the first 12 contacts regardless of who the
   * campaign was actually sent to. Mirrors the segment resolution the wizard
   * itself uses when building this list, so the count here matches what was
   * actually addressed.
   */
  const STATUS_MAP: Record<string, string> = { leads: 'lead', customers: 'customer', prospects: 'prospect' };
  const targetStatus = STATUS_MAP[campaign.audience || 'all'];
  const inAudience = targetStatus ? contacts.filter(c => c.status === targetStatus) : contacts;

  /* A campaign with a linked sequence is genuinely being tracked per contact
     by the enrollment engine — real status, not a guess. One that sent
     immediately in a single step has no such record (it went straight out
     through the wizard's own send loop), so the list can show who it went
     to, honestly, without inventing what happened to each of them. */
  const enrollmentByContact: Record<string, SequenceEnrollment> = {};
  if (campaign.sequenceId) {
    for (const e of loadEnrollments()) {
      if (e.sequenceId === campaign.sequenceId) enrollmentByContact[e.contactId] = e;
    }
  }
  const audienceContacts = inAudience.map(c => ({
    ...c,
    campaignStatus: enrollmentByContact[c.id]?.status
      ?? (campaign.sequenceId ? 'not yet enrolled' : (campaign.sent > 0 ? 'sent' : 'not sent yet')),
  }));

  const contactStatusColors: Record<string, { bg: string; color: string }> = {
    active:    { bg: '#eff6ff', color: '#2563eb' },
    completed: { bg: '#ecfdf5', color: '#16a34a' },
    sent:      { bg: '#ecfdf5', color: '#16a34a' },
    paused:    { bg: '#fffbeb', color: '#b45309' },
    cancelled: { bg: '#f8fafc', color: '#64748b' },
    'not sent yet':     { bg: '#f8fafc', color: '#64748b' },
    'not yet enrolled': { bg: '#f8fafc', color: '#64748b' },
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.6)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
      <div style={{ width: '100%', maxWidth: 720, height: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column', boxShadow: '-10px 0 40px rgba(0,0,0,0.15)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #e2e8f0', flexShrink: 0, backgroundColor: 'white' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', fontSize: 13, padding: '4px 0' }}>
              <ArrowLeft size={15} /> Back
            </button>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={onEdit}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 8, backgroundColor: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#374151' }}>
                <Edit2 size={12} /> Edit
              </button>
              <button onClick={onToggleStatus}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: `1px solid ${campaign.status === 'active' ? '#fde68a' : '#bbf7d0'}`, borderRadius: 8, backgroundColor: campaign.status === 'active' ? '#fef9c3' : '#f0fdf4', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: campaign.status === 'active' ? '#d97706' : '#16a34a' }}>
                {campaign.status === 'active' ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Activate</>}
              </button>
              {!confirmDelete ? (
                <button onClick={() => setConfirmDelete(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: '1px solid #fee2e2', borderRadius: 8, backgroundColor: '#fff5f5', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#dc2626' }}>
                  <Trash2 size={12} /> Delete
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={onDelete} style={{ padding: '6px 10px', border: 'none', borderRadius: 8, backgroundColor: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'white' }}>Confirm</button>
                  <button onClick={() => setConfirmDelete(false)} style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8, backgroundColor: 'white', cursor: 'pointer', fontSize: 12, color: '#64748b' }}>Cancel</button>
                </div>
              )}
              <button onClick={onClose} style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 8, backgroundColor: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <X size={15} color="#94a3b8" />
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 11, backgroundColor: `${tm.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tm.color, flexShrink: 0 }}>
              {tm.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{campaign.name}</h2>
                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, backgroundColor: sc.bg, color: sc.color }}>
                  {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                </span>
                <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, backgroundColor: `${tm.color}15`, color: tm.color }}>
                  {tm.label}
                </span>
              </div>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '3px 0 0' }}>
                Created {campaign.createdAt}
                {campaign.scheduledAt && ` · Scheduled for ${campaign.scheduledAt}`}
                {campaign.goal && ` · ${campaign.goal.charAt(0).toUpperCase() + campaign.goal.slice(1)}`}
              </p>
              {campaign.description && <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>{campaign.description}</p>}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e2e8f0', backgroundColor: 'white', flexShrink: 0 }}>
          {(['overview', 'steps', 'contacts', 'settings'] as const).map(tab => {
            const isActive = activeTab === tab;
            const labels: Record<string, string> = { overview: 'Overview', steps: campaign.type === 'sequence' ? 'Sequence' : 'Content', contacts: 'Contacts', settings: 'Settings' };
            return (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{ padding: '11px 18px', border: 'none', borderBottom: `2px solid ${isActive ? '#6366f1' : 'transparent'}`, backgroundColor: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: isActive ? 600 : 500, color: isActive ? '#6366f1' : '#64748b', marginBottom: '-1px' }}>
                {labels[tab]}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#f8fafc' }}>
          {activeTab === 'overview' && (
            <div style={{ padding: '20px 22px' }}>
              {/* Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                <StatCard icon={<Users size={16} />} label="Total Sent" value={campaign.sent.toLocaleString()} sub={`${campaign.audience || 'all'} segment`} color="#6366f1" />
                <StatCard icon={<Mail size={16} />} label="Opened" value={campaign.sent > 0 ? `${Math.round((campaign.opened / campaign.sent) * 100)}%` : '—'} sub={`${campaign.opened.toLocaleString()} contacts`} color="#3b82f6" />
                <StatCard icon={<MousePointerClick size={16} />} label="Clicked" value={campaign.sent > 0 ? `${Math.round((campaign.clicked / campaign.sent) * 100)}%` : '—'} sub={`${campaign.clicked.toLocaleString()} contacts`} color="#8b5cf6" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                <StatCard icon={<Reply size={16} />} label="Replied" value={campaign.sent > 0 ? `${Math.round((campaign.replied / campaign.sent) * 100)}%` : '—'} sub={`${campaign.replied.toLocaleString()} replies`} color="#22c55e" />
                <StatCard icon={<AlertCircle size={16} />} label="Bounced" value={bounced.toLocaleString()} sub={`${campaign.sent > 0 ? Math.round((bounced / campaign.sent) * 100) : 0}% bounce rate`} color="#f59e0b" />
                <StatCard icon={<CheckCircle size={16} />} label="Deliverability" value={`${deliverabilityRate}%`} sub={`${unsubscribed} unsubscribed`} color="#16a34a" />
              </div>

              {/* Performance breakdown */}
              {campaign.sent > 0 && (
                <div style={{ backgroundColor: 'white', borderRadius: 12, padding: '18px 20px', border: '1px solid #e2e8f0', marginBottom: 16 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '0 0 16px' }}>Performance breakdown</h3>
                  <MetricRow label="Open rate" value={campaign.opened} total={campaign.sent} color="#3b82f6" />
                  <MetricRow label="Click rate" value={campaign.clicked} total={campaign.sent} color="#8b5cf6" />
                  <MetricRow label="Reply rate" value={campaign.replied} total={campaign.sent} color="#22c55e" />
                  <MetricRow label="Bounce rate" value={bounced} total={campaign.sent} color="#f59e0b" />
                </div>
              )}

              {campaign.sent === 0 && (
                <div style={{ backgroundColor: 'white', borderRadius: 12, padding: '32px 20px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                    <BarChart2 size={22} color="#94a3b8" />
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: '0 0 6px' }}>No data yet</p>
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                    {campaign.status === 'draft' ? 'This campaign is a draft. Launch it to start tracking.' : 'Stats will appear once emails start sending.'}
                  </p>
                  {campaign.status === 'draft' && (
                    <button onClick={onToggleStatus} style={{ marginTop: 14, padding: '8px 18px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      Activate Campaign
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'steps' && (
            <div style={{ padding: '20px 22px' }}>
              {campaign.type === 'sequence' && campaign.steps && campaign.steps.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {campaign.steps.map((step, idx) => {
                    const isExpanded = expandedStep === step.id;
                    /* A single-step campaign has no enrollment record — it went
                       out directly through the send-now loop — so its one step
                       just reports the campaign's own real totals. A step
                       beyond the first only exists because a sequence is
                       carrying it, so its count comes from that sequence's
                       actual send history: how many enrollments logged this
                       step as sent, not a guess shrinking by 15% a step. */
                    const sent = campaign.steps!.length <= 1
                      ? campaign.sent
                      : Object.values(enrollmentByContact).filter(e =>
                          e.history.some(h => h.step === idx && h.action === 'sent')).length;
                    return (
                      <div key={step.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28, flexShrink: 0, paddingTop: 4 }}>
                          <div style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: idx === 0 ? '#6366f1' : '#f1f5f9', border: idx === 0 ? 'none' : '2px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {idx === 0 ? <Mail size={10} color="white" /> : <span style={{ fontSize: 9, fontWeight: 700, color: '#64748b' }}>{idx + 1}</span>}
                          </div>
                          {idx < campaign.steps!.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 18, backgroundColor: '#e2e8f0', marginTop: 2 }} />}
                        </div>
                        <div style={{ flex: 1, border: `1px solid ${isExpanded ? '#c4b5fd' : '#e2e8f0'}`, borderRadius: 10, overflow: 'hidden', marginBottom: 10, backgroundColor: 'white' }}>
                          <div onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 2 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>Day {step.day}</span>
                                <span style={{ fontSize: 10, padding: '1px 6px', backgroundColor: '#f1f5f9', color: '#64748b', borderRadius: 10, fontWeight: 600 }}>{step.condition}</span>
                                {step.abTest && <span style={{ fontSize: 10, padding: '1px 6px', backgroundColor: '#fef3c7', color: '#d97706', borderRadius: 10, fontWeight: 600 }}>A/B</span>}
                              </div>
                              <div style={{ fontSize: 12, color: '#0f172a', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{step.subject}</div>
                              {sent > 0 && (
                                <div style={{ display: 'flex', gap: 10, marginTop: 5 }}>
                                  <span style={{ fontSize: 10, color: '#6366f1' }}>{sent.toLocaleString()} sent</span>
                                </div>
                              )}
                            </div>
                            {isExpanded ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
                          </div>
                          {isExpanded && (
                            <div style={{ padding: '12px 14px', borderTop: '1px solid #f1f5f9', backgroundColor: '#faf5ff' }}>
                              {step.subjectB && (
                                <div style={{ marginBottom: 8 }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: '#d97706', marginRight: 6 }}>Variant B subject:</span>
                                  <span style={{ fontSize: 12, color: '#374151' }}>{step.subjectB}</span>
                                </div>
                              )}
                              <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.7, maxHeight: 200, overflow: 'auto', padding: '10px', backgroundColor: 'white', borderRadius: 7, border: '1px solid #e2e8f0' }}
                                dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(step.body) }} />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : campaign.type === 'email' ? (
                <div style={{ backgroundColor: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#faf5ff' }}>
                    <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, margin: '0 0 4px', textTransform: 'uppercase' }}>Subject</p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: 0 }}>{campaign.subject || '(No subject)'}</p>
                    {campaign.previewText && <p style={{ fontSize: 12, color: '#94a3b8', margin: '3px 0 0' }}>{campaign.previewText}</p>}
                  </div>
                  {campaign.emailBody ? (
                    <div style={{ padding: '18px 24px', fontSize: 13, lineHeight: 1.7, color: '#374151' }}
                      dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(campaign.emailBody) }} />
                  ) : (
                    <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No email body. Click Edit to add content.</div>
                  )}
                </div>
              ) : (
                <div style={{ backgroundColor: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px' }}>
                  <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, margin: '0 0 8px', textTransform: 'uppercase' }}>SMS message</p>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ maxWidth: '80%', padding: '11px 14px', backgroundColor: '#3b82f6', color: 'white', borderRadius: '14px 14px 4px 14px', fontSize: 13, lineHeight: 1.6 }}>
                      {campaign.smsBody || '(No message set)'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'contacts' && (
            <div style={{ padding: '20px 22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 }}>Enrolled contacts</h3>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{audienceContacts.length} shown of {contacts.length}</span>
              </div>
              <div style={{ backgroundColor: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 80px', padding: '9px 14px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Contact</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Email</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</span>
                </div>
                {audienceContacts.map(c => {
                  const cs = contactStatusColors[c.campaignStatus] || contactStatusColors.active;
                  return (
                    <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 80px', padding: '10px 14px', borderBottom: '1px solid #f9fafb', alignItems: 'center' }}>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', margin: 0 }}>{c.name}</p>
                        <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{c.phone}</p>
                      </div>
                      <p style={{ fontSize: 12, color: '#64748b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</p>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, fontWeight: 600, backgroundColor: cs.bg, color: cs.color, justifySelf: 'start', textTransform: 'capitalize' }}>
                        {c.campaignStatus}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div style={{ padding: '20px 22px' }}>
              <div style={{ backgroundColor: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 14 }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Settings size={13} color="#6366f1" />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sender identity</span>
                </div>
                <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
                  {[
                    { label: 'From name',    value: campaign.fromName || '—' },
                    { label: 'From email',   value: campaign.fromEmail || '—' },
                    { label: 'Reply-to',     value: campaign.replyTo || campaign.fromEmail || '—' },
                    { label: 'Audience',     value: campaign.audience || 'all' },
                  ].map(r => (
                    <div key={r.label}>
                      <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{r.label}</p>
                      <p style={{ fontSize: 13, color: '#374151', margin: 0, fontWeight: 500 }}>{r.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ backgroundColor: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 14 }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Clock size={13} color="#6366f1" />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Send window</span>
                </div>
                <div style={{ padding: '14px 16px' }}>
                  {campaign.sendDays && campaign.sendDays.length > 0 ? (
                    <div style={{ display: 'flex', gap: 5 }}>
                      {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => {
                        const on = campaign.sendDays!.includes(d);
                        return (
                          <div key={d} style={{ width: 30, height: 30, borderRadius: '50%', backgroundColor: on ? '#6366f1' : '#f1f5f9', color: on ? 'white' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, textTransform: 'capitalize' }}>
                            {d[0].toUpperCase()}
                          </div>
                        );
                      })}
                      {campaign.sendHoursFrom && <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b', alignSelf: 'center' }}>{campaign.sendHoursFrom} – {campaign.sendHoursTo}</span>}
                    </div>
                  ) : <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>No send window configured</p>}
                </div>
              </div>

              <div style={{ backgroundColor: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tracking & behavior</span>
                </div>
                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: 'Open tracking', on: campaign.openTracking ?? true },
                    { label: 'Click tracking', on: campaign.clickTracking ?? true },
                    { label: 'Stop on reply', on: campaign.stopOnReply ?? true },
                    { label: 'Stop on bounce', on: campaign.stopOnBounce ?? true },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: '#374151' }}>{item.label}</span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, backgroundColor: item.on ? '#ecfdf5' : '#f8fafc', color: item.on ? '#16a34a' : '#94a3b8' }}>{item.on ? 'On' : 'Off'}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                <button onClick={onEdit} style={{ flex: 1, padding: '10px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                  <Edit2 size={13} /> Edit Campaign Settings
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
