import React, { useState } from 'react';
import { Plus, Eye, TrendingUp, DollarSign, MousePointer, ExternalLink, Edit2, Trash2, Copy, BarChart2, X, Search, Check } from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import FunnelBuilder from './FunnelBuilder';
import type { Funnel as FunnelType, FunnelStep } from '../../types';

/* ─── Funnel type definitions (ClickFunnels-style) ─── */

interface FunnelTypeConfig {
  id: string;
  name: string;
  emoji: string;
  color: string;
  bg: string;
  desc: string;
  category: string;
  defaultSteps: { name: string; type: FunnelStep['type'] }[];
}

const FUNNEL_TYPES: FunnelTypeConfig[] = [
  { id: 'squeeze', name: 'Squeeze Page', emoji: '📧', color: '#6366f1', bg: '#f5f3ff', category: 'Lead Generation', desc: 'Capture emails with a single-focused opt-in page', defaultSteps: [{ name: 'Squeeze Page', type: 'optin' }, { name: 'Thank You', type: 'thankyou' }] },
  { id: 'lead_magnet', name: 'Lead Magnet', emoji: '🎯', color: '#8b5cf6', bg: '#f5f3ff', category: 'Lead Generation', desc: 'Offer a free resource in exchange for email addresses', defaultSteps: [{ name: 'Opt-in Page', type: 'optin' }, { name: 'Thank You', type: 'thankyou' }] },
  { id: 'reverse_squeeze', name: 'Reverse Squeeze', emoji: '🔄', color: '#7c3aed', bg: '#f5f3ff', category: 'Lead Generation', desc: 'Give value first, then ask for the opt-in', defaultSteps: [{ name: 'Content Page', type: 'landing' }, { name: 'Opt-in Page', type: 'optin' }, { name: 'Thank You', type: 'thankyou' }] },
  { id: 'ask_campaign', name: 'Ask Campaign', emoji: '❓', color: '#ec4899', bg: '#fdf2f8', category: 'Lead Generation', desc: 'Survey prospects to understand their biggest problems', defaultSteps: [{ name: 'Survey Page', type: 'survey' }, { name: 'Thank You', type: 'thankyou' }] },
  { id: 'survey', name: 'Survey Funnel', emoji: '📋', color: '#f97316', bg: '#fff7ed', category: 'Lead Generation', desc: 'Qualify prospects with a multi-step survey funnel', defaultSteps: [{ name: 'Survey', type: 'survey' }, { name: 'Result Page', type: 'landing' }, { name: 'Opt-in', type: 'optin' }] },
  { id: 'sales', name: 'Sales Letter', emoji: '💰', color: '#22c55e', bg: '#f0fdf4', category: 'Sales', desc: 'Classic long-form sales page with order form', defaultSteps: [{ name: 'Sales Page', type: 'sales' }, { name: 'Order Form', type: 'checkout' }, { name: 'OTO', type: 'upsell' }, { name: 'Thank You', type: 'thankyou' }] },
  { id: 'vsl', name: 'Video Sales Letter', emoji: '🎬', color: '#ef4444', bg: '#fff5f5', category: 'Sales', desc: 'Video-driven sales funnel for high-ticket offers', defaultSteps: [{ name: 'VSL Page', type: 'sales' }, { name: 'Order Form', type: 'checkout' }, { name: 'OTO', type: 'upsell' }, { name: 'Thank You', type: 'thankyou' }] },
  { id: 'hero', name: 'Hero Funnel', emoji: '🦸', color: '#0891b2', bg: '#ecfeff', category: 'Sales', desc: 'Position you as the hero and authority in your niche', defaultSteps: [{ name: 'Hero Page', type: 'landing' }, { name: 'Application', type: 'checkout' }, { name: 'Thank You', type: 'thankyou' }] },
  { id: 'product_launch', name: 'Product Launch', emoji: '🚀', color: '#f59e0b', bg: '#fffbeb', category: 'Sales', desc: 'Build anticipation and launch your product with a bang', defaultSteps: [{ name: 'Pre-Launch 1', type: 'landing' }, { name: 'Pre-Launch 2', type: 'landing' }, { name: 'Pre-Launch 3', type: 'landing' }, { name: 'Sales Page', type: 'sales' }, { name: 'Order Form', type: 'checkout' }] },
  { id: 'invisible', name: 'Invisible Funnel', emoji: '👻', color: '#64748b', bg: '#f8fafc', category: 'Sales', desc: 'Charge a tiny fee upfront to build trust, then upsell', defaultSteps: [{ name: 'Free+Shipping', type: 'sales' }, { name: 'Order Form', type: 'checkout' }, { name: 'OTO', type: 'upsell' }, { name: 'Thank You', type: 'thankyou' }] },
  { id: 'daily_deal', name: 'Daily Deal', emoji: '⚡', color: '#dc2626', bg: '#fff5f5', category: 'Sales', desc: 'Time-sensitive daily deal funnel with urgency countdown', defaultSteps: [{ name: 'Deal Page', type: 'sales' }, { name: 'Order Form', type: 'checkout' }, { name: 'Thank You', type: 'thankyou' }] },
  { id: 'webinar', name: 'Webinar Funnel', emoji: '🎤', color: '#6366f1', bg: '#f5f3ff', category: 'Events', desc: 'Register, deliver, and sell during your live webinar', defaultSteps: [{ name: 'Registration', type: 'webinar' }, { name: 'Confirmation', type: 'thankyou' }, { name: 'Webinar Room', type: 'webinar' }, { name: 'Replay', type: 'landing' }] },
  { id: 'auto_webinar', name: 'Auto Webinar', emoji: '🤖', color: '#8b5cf6', bg: '#f5f3ff', category: 'Events', desc: 'Run evergreen automated webinars on autopilot 24/7', defaultSteps: [{ name: 'Registration', type: 'webinar' }, { name: 'Confirmation', type: 'thankyou' }, { name: 'Webinar Room', type: 'webinar' }, { name: 'Sales Page', type: 'sales' }] },
  { id: 'live_demo', name: 'Live Demo', emoji: '📡', color: '#0ea5e9', bg: '#f0f9ff', category: 'Events', desc: 'Book prospects into live product demonstrations', defaultSteps: [{ name: 'Demo Page', type: 'landing' }, { name: 'Application', type: 'checkout' }, { name: 'Confirmation', type: 'thankyou' }] },
  { id: 'summit', name: 'Summit Funnel', emoji: '🏔️', color: '#14b8a6', bg: '#f0fdfa', category: 'Events', desc: 'Virtual summit with multiple speakers and sessions', defaultSteps: [{ name: 'Registration', type: 'optin' }, { name: 'Summit Room', type: 'webinar' }, { name: 'Upgrade Page', type: 'sales' }] },
  { id: 'membership', name: 'Membership', emoji: '🔐', color: '#7c3aed', bg: '#f5f3ff', category: 'Membership', desc: 'Sell and deliver recurring membership access', defaultSteps: [{ name: 'Sales Page', type: 'sales' }, { name: 'Checkout', type: 'checkout' }, { name: 'Member Access', type: 'landing' }, { name: 'Welcome', type: 'thankyou' }] },
  { id: 'bridge', name: 'Bridge Page', emoji: '🌉', color: '#f97316', bg: '#fff7ed', category: 'Affiliate', desc: 'Warm up traffic before sending to an affiliate offer', defaultSteps: [{ name: 'Bridge Page', type: 'landing' }, { name: 'Offer Page', type: 'sales' }] },
  { id: 'application', name: 'Application', emoji: '📝', color: '#ec4899', bg: '#fdf2f8', category: 'High Ticket', desc: 'Qualify high-ticket clients with an application process', defaultSteps: [{ name: 'Application Page', type: 'checkout' }, { name: 'Confirmation', type: 'thankyou' }, { name: 'Schedule Call', type: 'landing' }] },
  { id: 'cancellation', name: 'Cancellation', emoji: '🛑', color: '#64748b', bg: '#f8fafc', category: 'Retention', desc: 'Save cancellations with downsells and pause options', defaultSteps: [{ name: 'Cancel Page', type: 'landing' }, { name: 'Downsell', type: 'sales' }, { name: 'Confirmed', type: 'thankyou' }] },
];

const CATEGORIES = ['All', ...Array.from(new Set(FUNNEL_TYPES.map(f => f.category)))];

function defaultPages(steps: { name: string; type: FunnelStep['type'] }[]): FunnelStep[] {
  return steps.map((s, i) => ({
    id: `step-${Date.now()}-${i}`,
    name: s.name,
    type: s.type,
    slug: s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    blocks: [],
    visitors: 0,
    conversions: 0,
  }));
}

/* ─── Funnel Type Wizard ─── */

function FunnelWizard({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, type: FunnelTypeConfig) => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<FunnelTypeConfig | null>(null);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [funnelName, setFunnelName] = useState('');

  const filtered = FUNNEL_TYPES.filter(f =>
    (category === 'All' || f.category === category) &&
    (search === '' || f.name.toLowerCase().includes(search.toLowerCase()) || f.desc.toLowerCase().includes(search.toLowerCase()))
  );

  const handleSelectType = (t: FunnelTypeConfig) => {
    setSelectedType(t);
    setFunnelName(t.name + ' Funnel');
    setStep(2);
  };

  const handleCreate = () => {
    if (!funnelName.trim() || !selectedType) return;
    onCreate(funnelName.trim(), selectedType);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      {step === 1 ? (
        <div style={{ backgroundColor: 'white', borderRadius: '16px', width: '900px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}>
          {/* Header */}
          <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Create New Funnel</h2>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>Choose a funnel type to get started with pre-built pages</p>
            </div>
            <button onClick={onClose} style={{ padding: '8px', border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}><X size={20} /></button>
          </div>

          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {/* Left sidebar — categories */}
            <div style={{ width: '180px', borderRight: '1px solid #e2e8f0', padding: '16px 12px', flexShrink: 0, overflowY: 'auto' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 10px 4px' }}>Category</p>
              {CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setCategory(cat)}
                  style={{ width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: '8px', border: 'none', backgroundColor: category === cat ? '#f5f3ff' : 'transparent', color: category === cat ? '#6366f1' : '#374151', fontSize: '13px', fontWeight: category === cat ? 600 : 400, cursor: 'pointer', marginBottom: '2px' }}>
                  {cat}
                </button>
              ))}
            </div>

            {/* Right — type grid */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', flexShrink: 0 }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    placeholder="Search funnel types..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  {filtered.map(type => (
                    <button key={type.id} onClick={() => handleSelectType(type)}
                      style={{ padding: '18px 16px', border: '2px solid #e2e8f0', borderRadius: '12px', backgroundColor: 'white', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = type.color; (e.currentTarget as HTMLButtonElement).style.backgroundColor = type.bg; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e2e8f0'; (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'white'; }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: type.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', marginBottom: '10px', border: `1px solid ${type.color}30` }}>
                        {type.emoji}
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>{type.name}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.5 }}>{type.desc}</div>
                      <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {type.defaultSteps.slice(0, 3).map((s, i) => (
                          <span key={i} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: `${type.color}15`, color: type.color, fontWeight: 600 }}>{s.name}</span>
                        ))}
                        {type.defaultSteps.length > 3 && <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#f1f5f9', color: '#64748b', fontWeight: 600 }}>+{type.defaultSteps.length - 3}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Step 2 — name + confirm */
        <div style={{ backgroundColor: 'white', borderRadius: '16px', width: '480px', padding: '32px', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <button onClick={() => setStep(1)} style={{ padding: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', background: 'white', cursor: 'pointer', display: 'flex', color: '#64748b' }}>
              <X size={14} />
            </button>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Name Your Funnel</h2>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0' }}>You can always change this later</p>
            </div>
          </div>

          {selectedType && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', backgroundColor: selectedType.bg, borderRadius: '10px', border: `1px solid ${selectedType.color}30`, marginBottom: '20px' }}>
              <span style={{ fontSize: '24px' }}>{selectedType.emoji}</span>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{selectedType.name}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{selectedType.defaultSteps.length} pages · {selectedType.category}</div>
              </div>
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Funnel Name *</label>
            <input
              autoFocus
              value={funnelName}
              onChange={e => setFunnelName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. My Lead Generation Funnel"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {selectedType && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>Pages that will be created:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {selectedType.defaultSteps.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151' }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: `${selectedType.color}15`, color: selectedType.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                    {s.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setStep(1)} style={{ flex: 1, padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', backgroundColor: 'white', color: '#374151', fontWeight: 500 }}>
              Back
            </button>
            <button onClick={handleCreate} disabled={!funnelName.trim()}
              style={{ flex: 2, padding: '10px', backgroundColor: funnelName.trim() ? '#6366f1' : '#e2e8f0', color: funnelName.trim() ? 'white' : '#94a3b8', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: funnelName.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <Check size={15} /> Build Funnel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Funnels component ─── */

export default function Funnels() {
  const { funnels, addFunnel, updateFunnel, deleteFunnel } = useApp();
  const [activeTab, setActiveTab] = useState<'funnels' | 'websites'>('funnels');
  const [builderFunnel, setBuilderFunnel] = useState<FunnelType | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const totalRevenue = funnels.reduce((s, f) => s + f.revenue, 0);
  const totalVisitors = funnels.reduce((s, f) => s + f.visitors, 0);
  const totalConversions = funnels.reduce((s, f) => s + f.conversions, 0);
  const avgCvr = totalVisitors > 0 ? ((totalConversions / totalVisitors) * 100).toFixed(1) : '0';

  const handleCreate = (name: string, type: FunnelTypeConfig) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const id = `funnel-${Date.now()}`;
    const pages = defaultPages(type.defaultSteps);
    const newFunnel: FunnelType = {
      id, name,
      steps: pages.length,
      visitors: 0, conversions: 0, revenue: 0,
      status: 'draft',
      goal: type.category,
      slug,
      pages,
      createdAt: new Date().toISOString(),
    };
    addFunnel(newFunnel);
    setShowWizard(false);
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Header title="Funnels & Sites" subtitle="Build and manage your marketing funnels" />
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
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
          <button onClick={() => setShowWizard(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={15} /> New {activeTab === 'funnels' ? 'Funnel' : 'Website'}
          </button>
        </div>

        {/* Funnel cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px', marginBottom: '24px' }}>
          {funnels.map(funnel => {
            const cvr = funnel.visitors > 0 ? ((funnel.conversions / funnel.visitors) * 100).toFixed(1) : '0';
            const ftype = FUNNEL_TYPES.find(t => funnel.goal === t.category);
            return (
              <div key={funnel.id} style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                {/* Card header with color accent */}
                <div style={{ height: '4px', background: ftype ? `linear-gradient(90deg, ${ftype.color}, ${ftype.color}88)` : 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />
                <div style={{ padding: '18px 20px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{funnel.name}</h3>
                      <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>{funnel.pages?.length ?? funnel.steps} pages · {funnel.goal ?? 'Lead Generation'}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                      <button onClick={() => handleToggleStatus(funnel)}
                        style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, backgroundColor: funnel.status === 'active' ? '#ecfdf5' : '#f8fafc', color: funnel.status === 'active' ? '#16a34a' : '#64748b', border: `1px solid ${funnel.status === 'active' ? '#bbf7d0' : '#e2e8f0'}`, cursor: 'pointer' }}>
                        {funnel.status === 'active' ? 'Active' : 'Draft'}
                      </button>
                      <button onClick={() => setBuilderFunnel(funnel)} title="Edit"
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

                {/* Funnel steps preview */}
                {(funnel.pages?.length ?? 0) > 0 && (
                  <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '4px', overflowX: 'auto' }}>
                    {(funnel.pages ?? []).map((page, i) => (
                      <React.Fragment key={page.id}>
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#f1f5f9', color: '#374151', fontWeight: 500, whiteSpace: 'nowrap' }}>{page.name}</span>
                        {i < (funnel.pages ?? []).length - 1 && <span style={{ color: '#cbd5e1', fontSize: '12px' }}>→</span>}
                      </React.Fragment>
                    ))}
                  </div>
                )}

                <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
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
                <div style={{ padding: '0 20px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                    <span>Conversion Rate</span><span style={{ fontWeight: 700, color: '#374151' }}>{cvr}%</span>
                  </div>
                  <div style={{ height: '4px', backgroundColor: '#e2e8f0', borderRadius: '2px' }}>
                    <div style={{ height: '100%', width: `${Math.min(parseFloat(cvr) * 5, 100)}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', borderRadius: '2px' }} />
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

          {funnels.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '80px 60px', border: '2px dashed #e2e8f0', borderRadius: '16px', color: '#94a3b8' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🚀</div>
              <p style={{ fontWeight: 700, color: '#374151', margin: '0 0 6px', fontSize: '16px' }}>No funnels yet</p>
              <p style={{ fontSize: '13px', margin: '0 0 20px' }}>Choose from 19 funnel types to start converting visitors into customers</p>
              <button onClick={() => setShowWizard(true)} style={{ padding: '10px 24px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Plus size={14} /> Create Your First Funnel
              </button>
            </div>
          )}
        </div>
      </div>

      {showWizard && <FunnelWizard onClose={() => setShowWizard(false)} onCreate={handleCreate} />}

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
