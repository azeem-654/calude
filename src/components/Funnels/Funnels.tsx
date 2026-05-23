import React, { useState } from 'react';
import { Funnel, Plus, Eye, TrendingUp, DollarSign, MousePointer, ExternalLink, Edit2, Trash2, Copy, BarChart2 } from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import FunnelBuilder from './FunnelBuilder';
import type { Funnel as FunnelType, FunnelStep } from '../../types';

function defaultPages(): FunnelStep[] {
  return [
    {
      id: `step-${Date.now()}-1`,
      name: 'Landing Page',
      type: 'landing',
      slug: 'landing',
      blocks: [
        { id: `b1-${Date.now()}`, type: 'heading', content: 'Welcome to Our Offer', settings: { align: 'center', size: 'xl', color: '#0f172a' } },
        { id: `b2-${Date.now()}`, type: 'text', content: 'Discover how we can help you grow your business.', settings: { align: 'center', color: '#64748b' } },
        { id: `b3-${Date.now()}`, type: 'button', content: 'Get Started', settings: { align: 'center', buttonColor: '#6366f1', url: '#' } },
      ],
      visitors: 0,
      conversions: 0,
    },
  ];
}

export default function Funnels() {
  const { funnels, addFunnel, updateFunnel, deleteFunnel } = useApp();
  const [activeTab, setActiveTab] = useState<'funnels' | 'websites'>('funnels');
  const [builderFunnel, setBuilderFunnel] = useState<FunnelType | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGoal, setNewGoal] = useState('leads');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const totalRevenue = funnels.reduce((s, f) => s + f.revenue, 0);
  const totalVisitors = funnels.reduce((s, f) => s + f.visitors, 0);
  const totalConversions = funnels.reduce((s, f) => s + f.conversions, 0);
  const avgCvr = totalVisitors > 0 ? ((totalConversions / totalVisitors) * 100).toFixed(1) : '0';

  const funnelSteps = [
    { name: 'Landing Page', visitors: 3420, rate: 100, color: '#6366f1' },
    { name: 'Opt-in Form', visitors: 1890, rate: 55, color: '#8b5cf6' },
    { name: 'Thank You', visitors: 1540, rate: 45, color: '#3b82f6' },
    { name: 'Sales Page', visitors: 890, rate: 26, color: '#22c55e' },
    { name: 'Checkout', visitors: 287, rate: 8, color: '#f59e0b' },
  ];

  const handleCreate = () => {
    if (!newName.trim()) return;
    const slug = newName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const id = `funnel-${Date.now()}`;
    const newFunnel: FunnelType = {
      id,
      name: newName.trim(),
      steps: 1,
      visitors: 0,
      conversions: 0,
      revenue: 0,
      status: 'draft',
      goal: newGoal,
      slug,
      pages: defaultPages(),
      createdAt: new Date().toISOString(),
    };
    addFunnel(newFunnel);
    setShowNewModal(false);
    setNewName('');
    setNewGoal('leads');
    setBuilderFunnel(newFunnel);
  };

  const handleDuplicate = (f: FunnelType) => {
    const id = `funnel-${Date.now()}`;
    addFunnel({ ...f, id, name: `${f.name} (copy)`, status: 'draft', visitors: 0, conversions: 0, revenue: 0, createdAt: new Date().toISOString() });
  };

  const handleDelete = (id: string) => {
    deleteFunnel(id);
    setDeleteConfirm(null);
  };

  const handleToggleStatus = (f: FunnelType) => {
    updateFunnel(f.id, { status: f.status === 'active' ? 'draft' : 'active' });
  };

  if (builderFunnel) {
    const liveFunnel = funnels.find(f => f.id === builderFunnel.id) ?? builderFunnel;
    return (
      <FunnelBuilder
        funnel={liveFunnel}
        onSave={(updates) => {
          updateFunnel(liveFunnel.id, updates);
          setBuilderFunnel(null);
        }}
        onClose={() => setBuilderFunnel(null)}
      />
    );
  }

  return (
    <div>
      <Header title="Funnels & Sites" subtitle="Build and manage your marketing funnels" />
      <div style={{ padding: '24px 28px' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {[
            { label: 'Total Revenue', value: `$${totalRevenue.toLocaleString()}`, icon: DollarSign, color: '#22c55e' },
            { label: 'Total Visitors', value: totalVisitors.toLocaleString(), icon: Eye, color: '#6366f1' },
            { label: 'Conversions', value: totalConversions, icon: MousePointer, color: '#3b82f6' },
            { label: 'Avg Conversion Rate', value: `${avgCvr}%`, icon: TrendingUp, color: '#f59e0b' },
          ].map(item => (
            <div key={item.label} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '18px 20px', border: '1px solid #e2e8f0', display: 'flex', gap: '14px', alignItems: 'center' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '10px', backgroundColor: `${item.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <item.icon size={22} color={item.color} />
              </div>
              <div>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 4px', fontWeight: 500 }}>{item.label}</p>
                <p style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: 0 }}>{item.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs + New button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '0', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden', backgroundColor: '#f8fafc' }}>
            {(['funnels', 'websites'] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)} style={{ padding: '8px 20px', border: 'none', backgroundColor: activeTab === t ? '#6366f1' : 'transparent', color: activeTab === t ? 'white' : '#64748b', fontSize: '13px', fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize', transition: 'all 0.15s' }}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <button onClick={() => setShowNewModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={15} /> New {activeTab === 'funnels' ? 'Funnel' : 'Website'}
          </button>
        </div>

        {/* Funnel cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px', marginBottom: '24px' }}>
          {funnels.map(funnel => {
            const cvr = funnel.visitors > 0 ? ((funnel.conversions / funnel.visitors) * 100).toFixed(1) : '0';
            return (
              <div key={funnel.id} style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{funnel.name}</h3>
                      <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>{funnel.pages?.length ?? funnel.steps} pages · {funnel.goal ?? 'lead generation'}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                      <button onClick={() => handleToggleStatus(funnel)}
                        style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, backgroundColor: funnel.status === 'active' ? '#ecfdf5' : '#f8fafc', color: funnel.status === 'active' ? '#16a34a' : '#64748b', border: `1px solid ${funnel.status === 'active' ? '#bbf7d0' : '#e2e8f0'}`, cursor: 'pointer' }}>
                        {funnel.status}
                      </button>
                      <button onClick={() => setBuilderFunnel(funnel)} title="Edit in builder"
                        style={{ padding: '6px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', display: 'flex', color: '#6366f1' }}>
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDuplicate(funnel)} title="Duplicate"
                        style={{ padding: '6px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', display: 'flex', color: '#64748b' }}>
                        <Copy size={14} />
                      </button>
                      <button onClick={() => setDeleteConfirm(funnel.id)} title="Delete"
                        style={{ padding: '6px', borderRadius: '6px', border: '1px solid #fee2e2', backgroundColor: '#fff5f5', cursor: 'pointer', display: 'flex', color: '#dc2626' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
                <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  {[
                    { label: 'Visitors', value: funnel.visitors.toLocaleString(), color: '#6366f1' },
                    { label: 'Conversions', value: funnel.conversions.toLocaleString(), color: '#22c55e' },
                    { label: 'Revenue', value: `$${funnel.revenue.toLocaleString()}`, color: '#f59e0b' },
                  ].map(m => (
                    <div key={m.label} style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '18px', fontWeight: 700, color: m.color, margin: 0 }}>{m.value}</p>
                      <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>{m.label}</p>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '0 20px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                    <span>Conversion Rate</span><span style={{ fontWeight: 700, color: '#374151' }}>{cvr}%</span>
                  </div>
                  <div style={{ height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px' }}>
                    <div style={{ height: '100%', width: `${Math.min(parseFloat(cvr) * 5, 100)}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', borderRadius: '3px' }} />
                  </div>
                </div>
                <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '8px' }}>
                  <button onClick={() => setBuilderFunnel(funnel)}
                    style={{ flex: 1, padding: '8px', borderRadius: '7px', border: '1px solid #6366f1', backgroundColor: '#f5f3ff', color: '#6366f1', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                    <Edit2 size={13} /> Open Builder
                  </button>
                  <button
                    style={{ flex: 1, padding: '8px', borderRadius: '7px', border: '1px solid #e2e8f0', backgroundColor: 'white', color: '#374151', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                    <BarChart2 size={13} /> Analytics
                  </button>
                  <button
                    style={{ padding: '8px 10px', borderRadius: '7px', border: '1px solid #e2e8f0', backgroundColor: 'white', color: '#374151', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ExternalLink size={13} />
                  </button>
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {funnels.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px', border: '2px dashed #e2e8f0', borderRadius: '12px', color: '#94a3b8' }}>
              <Funnel size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
              <p style={{ fontWeight: 600, color: '#374151', margin: '0 0 6px' }}>No funnels yet</p>
              <p style={{ fontSize: '13px', margin: '0 0 16px' }}>Create your first funnel to start converting visitors into customers</p>
              <button onClick={() => setShowNewModal(true)} style={{ padding: '10px 20px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Plus size={14} /> Create Your First Funnel
              </button>
            </div>
          )}
        </div>

        {/* Funnel visualization */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '20px' }}>Funnel Visualization — Lead Magnet Funnel</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {funnelSteps.map((step, i) => (
              <div key={step.name}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', color: '#374151', fontWeight: 500, minWidth: '130px' }}>{step.name}</span>
                  <div style={{ flex: 1, height: '36px', backgroundColor: '#f8fafc', borderRadius: '6px', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ height: '100%', width: `${step.rate}%`, backgroundColor: step.color, opacity: 0.85, borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '10px', transition: 'width 0.5s ease' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'white' }}>{step.visitors.toLocaleString()}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151', minWidth: '45px', textAlign: 'right' }}>{step.rate}%</span>
                </div>
                {i < funnelSteps.length - 1 && (
                  <div style={{ marginLeft: '142px', height: '12px', width: '2px', backgroundColor: '#e2e8f0', marginBottom: '-4px' }} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* New funnel modal */}
      {showNewModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 20px' }}>Create New Funnel</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Funnel Name *</label>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="e.g. Lead Magnet Funnel"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>Funnel Goal</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                {[
                  { id: 'leads', label: '🎯 Lead Generation', desc: 'Collect email leads' },
                  { id: 'sales', label: '💰 Product Sales', desc: 'Sell products/services' },
                  { id: 'webinar', label: '🎤 Webinar Registration', desc: 'Event sign-ups' },
                  { id: 'survey', label: '📋 Survey/Quiz', desc: 'Qualify prospects' },
                ].map(g => (
                  <button key={g.id} onClick={() => setNewGoal(g.id)}
                    style={{ padding: '12px', border: `2px solid ${newGoal === g.id ? '#6366f1' : '#e2e8f0'}`, borderRadius: '8px', backgroundColor: newGoal === g.id ? '#f5f3ff' : 'white', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: newGoal === g.id ? '#6366f1' : '#374151' }}>{g.label}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{g.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowNewModal(false); setNewName(''); }} style={{ padding: '10px 20px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', backgroundColor: 'white', color: '#374151', fontWeight: 500 }}>
                Cancel
              </button>
              <button onClick={handleCreate} disabled={!newName.trim()} style={{ padding: '10px 20px', backgroundColor: newName.trim() ? '#6366f1' : '#e2e8f0', color: newName.trim() ? 'white' : '#94a3b8', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: newName.trim() ? 'pointer' : 'not-allowed' }}>
                Create & Open Builder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', width: '360px' }}>
            <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>Delete Funnel?</h4>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px' }}>This action cannot be undone. All pages and data will be permanently deleted.</p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', backgroundColor: 'white' }}>Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} style={{ padding: '9px 18px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
