import { useState, useRef, Fragment, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import {
  X, Save, Eye, EyeOff,
  Plus, Trash2, Copy, ChevronUp, ChevronDown,
  Check, Undo2, Redo2,
  Settings, Search, GitBranch, BarChart2, Users, ShoppingCart,
  Mail, Phone, MousePointerClick, Heart, ArrowRight, List,
} from 'lucide-react';
import type { Funnel, FunnelStep, FunnelBlock } from '../../types';
import { useHistory } from '../../hooks/useHistory';

/* ─── Step type config ─── */
const STEP_TYPE_CONFIG: Record<string, { emoji: string; color: string; bg: string; label: string }> = {
  optin:    { emoji: '📧', color: '#6366f1', bg: '#f5f3ff', label: 'Opt-in' },
  sales:    { emoji: '💰', color: '#22c55e', bg: '#f0fdf4', label: 'Sales Page' },
  checkout: { emoji: '🛒', color: '#f59e0b', bg: '#fffbeb', label: 'Order Form' },
  upsell:   { emoji: '⬆️', color: '#8b5cf6', bg: '#f5f3ff', label: 'Upsell' },
  downsell: { emoji: '⬇️', color: '#64748b', bg: '#f8fafc', label: 'Downsell' },
  thankyou: { emoji: '🎉', color: '#ec4899', bg: '#fdf2f8', label: 'Thank You' },
  webinar:  { emoji: '🎤', color: '#0ea5e9', bg: '#f0f9ff', label: 'Webinar' },
  survey:   { emoji: '📋', color: '#f97316', bg: '#fff7ed', label: 'Survey' },
  landing:  { emoji: '🏠', color: '#14b8a6', bg: '#f0fdfa', label: 'Landing' },
  custom:   { emoji: '📄', color: '#64748b', bg: '#f8fafc', label: 'Page' },
};

/* ─── Funnel Steps Overview (ClickFunnels-style) ─── */

interface FunnelOverviewProps {
  funnel: Funnel;
  pages: FunnelStep[];
  onEditPage: (pageId: string) => void;
  onAddPage: () => void;
  onDeletePage: (id: string) => void;
  onRenamePage: (id: string, name: string) => void;
  onReorderPage: (from: number, to: number) => void;
  onClose: () => void;
  onSave: () => void;
}

function FunnelOverview({ funnel, pages, onEditPage, onAddPage, onDeletePage, onRenamePage, onClose, onSave }: FunnelOverviewProps) {
  const [activeStep, setActiveStep] = useState(pages[0]?.id ?? '');
  const [headerTab, setHeaderTab] = useState<'steps' | 'stats' | 'contacts' | 'sales' | 'settings'>('steps');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newStepName, setNewStepName] = useState('');
  const [newStepType, setNewStepType] = useState<FunnelStep['type']>('landing');
  const [splitTestPage, setSplitTestPage] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');

  const step = pages.find(p => p.id === activeStep) ?? pages[0];
  const stepConfig = step ? (STEP_TYPE_CONFIG[step.type] ?? STEP_TYPE_CONFIG.custom) : null;

  const STEP_TYPES: { type: FunnelStep['type']; label: string }[] = [
    { type: 'optin', label: 'Opt-in Page' },
    { type: 'sales', label: 'Sales Page' },
    { type: 'checkout', label: 'Order Form' },
    { type: 'upsell', label: 'OTO / Upsell' },
    { type: 'downsell', label: 'Downsell' },
    { type: 'thankyou', label: 'Thank You' },
    { type: 'webinar', label: 'Webinar' },
    { type: 'survey', label: 'Survey' },
    { type: 'landing', label: 'Content Page' },
    { type: 'custom', label: 'Blank Page' },
  ];

  function handleAddStep() {
    if (!newStepName.trim()) return;
    onAddPage();
    setShowAddModal(false);
    setNewStepName('');
    setNewStepType('landing');
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', flexDirection: 'column', background: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Top bar */}
      <div style={{ height: 52, background: '#0f172a', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0 }}>
        <button onClick={onClose} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>← Back</button>
        <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: 15 }}>{funnel.name}</span>
        <div style={{ flex: 1 }} />
        <button onClick={onSave} style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Save size={13} /> Save
        </button>
      </div>

      {/* Header tabs */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 0 }}>
        {(['steps', 'stats', 'contacts', 'sales', 'settings'] as const).map(tab => (
          <button key={tab} onClick={() => setHeaderTab(tab)}
            style={{ padding: '12px 18px', border: 'none', borderBottom: `2px solid ${headerTab === tab ? '#6366f1' : 'transparent'}`, background: 'transparent', color: headerTab === tab ? '#6366f1' : '#64748b', fontSize: '13px', fontWeight: headerTab === tab ? 700 : 500, cursor: 'pointer', textTransform: 'capitalize', marginBottom: '-1px' }}>
            {tab === 'steps' ? '⚡ Steps' : tab === 'stats' ? '📊 Stats' : tab === 'contacts' ? '👥 Contacts' : tab === 'sales' ? '💰 Sales' : '⚙️ Settings'}
          </button>
        ))}
      </div>

      {headerTab === 'steps' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left: Steps sidebar */}
          <div style={{ width: '240px', background: 'white', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Funnel Steps
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              {pages.map((page, idx) => {
                const cfg = STEP_TYPE_CONFIG[page.type] ?? STEP_TYPE_CONFIG.custom;
                const isActive = page.id === activeStep;
                return (
                  <div key={page.id} onClick={() => setActiveStep(page.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', marginBottom: '4px', backgroundColor: isActive ? '#f5f3ff' : 'transparent', border: isActive ? `1px solid ${cfg.color}40` : '1px solid transparent', cursor: 'pointer' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0, border: `1px solid ${cfg.color}30` }}>
                      {cfg.emoji}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {renamingId === page.id ? (
                        <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                          onBlur={() => { onRenamePage(page.id, renameVal || page.name); setRenamingId(null); }}
                          onKeyDown={e => { if (e.key === 'Enter') { onRenamePage(page.id, renameVal || page.name); setRenamingId(null); } }}
                          onClick={e => e.stopPropagation()}
                          style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '12px', fontWeight: 700, outline: '1px solid #6366f1', borderRadius: '3px', padding: '1px 2px' }} />
                      ) : (
                        <div style={{ fontSize: '12px', fontWeight: isActive ? 700 : 500, color: isActive ? '#4f46e5' : '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{page.name}</div>
                      )}
                      <div style={{ fontSize: '10px', color: cfg.color, fontWeight: 600, marginTop: '1px' }}>{cfg.label}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                      <button onClick={e => { e.stopPropagation(); setRenamingId(page.id); setRenameVal(page.name); }}
                        style={{ padding: '3px', border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '12px' }}>✏️</button>
                      {pages.length > 1 && (
                        <button onClick={e => { e.stopPropagation(); onDeletePage(page.id); }}
                          style={{ padding: '3px', border: 'none', background: 'none', cursor: 'pointer', color: '#f87171', fontSize: '12px' }}>🗑</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: '10px 14px', borderTop: '1px solid #f1f5f9' }}>
              <button onClick={() => setShowAddModal(true)}
                style={{ width: '100%', padding: '9px', border: '2px dashed #c4b5fd', borderRadius: '8px', background: 'transparent', color: '#6366f1', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <Plus size={13} /> ADD NEW STEP
              </button>
            </div>
          </div>

          {/* Right: Step overview */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>
            {step && stepConfig && (
              <div>
                {/* Step header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: stepConfig.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', border: `1px solid ${stepConfig.color}30` }}>
                    {stepConfig.emoji}
                  </div>
                  <div>
                    <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: 0 }}>{step.name}</h2>
                    <p style={{ fontSize: '13px', color: '#64748b', margin: '3px 0 0' }}>/{step.slug} · {stepConfig.label}</p>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                    <button style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', background: 'white', color: '#374151', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Eye size={14} /> Preview
                    </button>
                    <button onClick={() => onEditPage(step.id)}
                      style={{ padding: '8px 20px', border: 'none', borderRadius: '8px', background: '#6366f1', color: 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      ✏️ Edit Page
                    </button>
                  </div>
                </div>

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' }}>
                  {[
                    { label: 'Visitors', value: step.visitors.toLocaleString(), color: '#6366f1' },
                    { label: 'Conversions', value: step.conversions.toLocaleString(), color: '#22c55e' },
                    { label: 'Conversion Rate', value: step.visitors > 0 ? `${((step.conversions / step.visitors) * 100).toFixed(1)}%` : '0%', color: '#f59e0b' },
                  ].map(m => (
                    <div key={m.label} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '16px 20px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <p style={{ fontSize: '22px', fontWeight: 800, color: m.color, margin: '0 0 4px' }}>{m.value}</p>
                      <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>{m.label}</p>
                    </div>
                  ))}
                </div>

                {/* Variants panel */}
                <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '24px' }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Page Variants</span>
                      <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '8px' }}>Split test your page to maximize conversions</span>
                    </div>
                    {splitTestPage !== step.id && (
                      <button onClick={() => setSplitTestPage(step.id)}
                        style={{ padding: '7px 14px', border: '1px solid #6366f1', borderRadius: '7px', background: 'white', color: '#6366f1', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <GitBranch size={13} /> Start Split Test
                      </button>
                    )}
                  </div>
                  <div style={{ padding: '20px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    {/* Control variant */}
                    <div style={{ flex: '0 0 200px' }}>
                      <div style={{ height: '130px', backgroundColor: '#f1f5f9', borderRadius: '8px', border: '2px solid #6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${stepConfig.bg}, white)`, opacity: 0.7 }} />
                        <div style={{ position: 'relative', textAlign: 'center' }}>
                          <div style={{ fontSize: '28px', marginBottom: '4px' }}>{stepConfig.emoji}</div>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: stepConfig.color }}>Control</div>
                        </div>
                        <div style={{ position: 'absolute', top: '6px', left: '6px', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#6366f1', color: 'white', fontSize: '10px', fontWeight: 700 }}>100%</div>
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>Control</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{step.visitors} visitors</div>
                    </div>

                    {/* Variation (if split test active) */}
                    {splitTestPage === step.id && (
                      <div style={{ flex: '0 0 200px' }}>
                        <div style={{ height: '130px', backgroundColor: '#f1f5f9', borderRadius: '8px', border: '2px dashed #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                          <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                            <Plus size={24} style={{ marginBottom: '4px' }} />
                            <div style={{ fontSize: '11px', fontWeight: 600 }}>Variation B</div>
                          </div>
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>Variation B</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>0 visitors</div>
                      </div>
                    )}

                    {splitTestPage !== step.id && (
                      <div style={{ flex: '0 0 200px' }}>
                        <div onClick={() => setSplitTestPage(step.id)} style={{ height: '130px', borderRadius: '8px', border: '2px dashed #c4b5fd', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: '10px', backgroundColor: '#f5f3ff' }}
                          onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.backgroundColor = '#ede9fe'}
                          onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.backgroundColor = '#f5f3ff'}>
                          <div style={{ textAlign: 'center', color: '#7c3aed' }}>
                            <Plus size={20} style={{ marginBottom: '4px' }} />
                            <div style={{ fontSize: '11px', fontWeight: 700 }}>Create Variation</div>
                          </div>
                        </div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>Add a B variant to split test</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Page blocks summary */}
                <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>Page Contents</div>
                  {(step.blocks ?? []).length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                      <div style={{ fontSize: '24px', marginBottom: '8px' }}>📝</div>
                      <div style={{ fontSize: '13px' }}>No content yet. Click "Edit Page" to start building.</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {(step.blocks ?? []).map((b, i) => (
                        <span key={b.id} style={{ padding: '3px 10px', borderRadius: '20px', backgroundColor: '#f1f5f9', color: '#374151', fontSize: '12px', fontWeight: 500 }}>{b.type}</span>
                      ))}
                    </div>
                  )}
                  <button onClick={() => onEditPage(step.id)}
                    style={{ marginTop: '14px', width: '100%', padding: '9px', border: '1px solid #6366f1', borderRadius: '8px', background: '#f5f3ff', color: '#6366f1', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                    ✏️ Open Page Editor
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {headerTab !== 'steps' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>
              {headerTab === 'stats' ? '📊' : headerTab === 'contacts' ? '👥' : headerTab === 'sales' ? '💰' : '⚙️'}
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#374151', marginBottom: '6px' }}>
              {headerTab.charAt(0).toUpperCase() + headerTab.slice(1)}
            </div>
            <div style={{ fontSize: '13px' }}>No data available yet</div>
          </div>
        </div>
      )}

      {/* Add Step Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Add New Step</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Step Name</label>
              <input autoFocus value={newStepName} onChange={e => setNewStepName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddStep()}
                placeholder="e.g. Sales Page"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Page Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                {STEP_TYPES.map(t => {
                  const cfg = STEP_TYPE_CONFIG[t.type] ?? STEP_TYPE_CONFIG.custom;
                  return (
                    <button key={t.type} onClick={() => setNewStepType(t.type)}
                      style={{ padding: '10px', border: `2px solid ${newStepType === t.type ? cfg.color : '#e2e8f0'}`, borderRadius: '8px', background: newStepType === t.type ? cfg.bg : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600, color: newStepType === t.type ? cfg.color : '#374151' }}>
                      <span style={{ fontSize: '16px' }}>{cfg.emoji}</span>{t.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowAddModal(false)} style={{ flex: 1, padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', background: 'white' }}>Cancel</button>
              <button onClick={handleAddStep} disabled={!newStepName.trim()}
                style={{ flex: 2, padding: '10px', background: newStepName.trim() ? '#6366f1' : '#e2e8f0', color: newStepName.trim() ? 'white' : '#94a3b8', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: newStepName.trim() ? 'pointer' : 'not-allowed' }}>
                Add Step
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

let DRAG_TYPE: 'new' | 'move' | null = null;
let DRAG_PAYLOAD = '';
const uid = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
type Device = 'desktop' | 'tablet' | 'mobile';
type LeftTab = 'elements' | 'templates' | 'pages';
type BlockType = FunnelBlock['type'];

const DEFAULTS: Record<BlockType, FunnelBlock['settings']> = {
  navbar: { bgColor: '#ffffff', textColor: '#0f172a', navLogo: 'YourBrand', buttonText: 'Get Started', buttonColor: '#6366f1', buttonTextColor: '#ffffff', navLinks: [{ label: 'Features', url: '#' }, { label: 'Pricing', url: '#' }, { label: 'About', url: '#' }] },
  hero: { bgGradient: 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)', textColor: '#ffffff', subheading: 'The all-in-one platform to grow your business faster.', buttonText: 'Get Started Free', buttonColor: '#ffffff', buttonTextColor: '#6366f1', secondaryButtonText: 'Watch Demo', align: 'center', minHeight: 520, padding: 80 },
  features: { bgColor: '#f8fafc', textColor: '#0f172a', subtitle: 'Everything you need to succeed', align: 'center', iconColor: '#6366f1', columns: 3, padding: 80, featureItems: [{ icon: '⚡', title: 'Lightning Fast', desc: 'Built for performance with cutting-edge technology.' }, { icon: '🔒', title: 'Secure by Default', desc: 'Enterprise-grade security out of the box.' }, { icon: '📊', title: 'Advanced Analytics', desc: 'Real-time insights that help you decide better.' }, { icon: '🤝', title: 'Team Collaboration', desc: 'Work seamlessly together from anywhere.' }, { icon: '🌍', title: 'Global Scale', desc: 'Serve customers reliably worldwide, 24/7.' }, { icon: '🎯', title: 'Easy to Use', desc: 'Intuitive interface your team will love.' }] },
  testimonials: { bgColor: '#ffffff', textColor: '#0f172a', subtitle: 'Loved by thousands of customers worldwide', align: 'center', padding: 80, testimonialItems: [{ quote: 'This platform completely transformed how our team operates. Revenue doubled in 6 months.', author: 'Sarah Johnson', role: 'CEO at TechCorp', stars: 5 }, { quote: 'Incredible ROI. 3x improvement in conversion rate within the first month of using this.', author: 'Marcus Williams', role: 'CMO at GrowthHQ', stars: 5 }, { quote: 'The support team is world-class. Setup was quick and results speak for themselves.', author: 'Emily Chen', role: 'Founder at StartupXYZ', stars: 5 }] },
  pricing: { bgColor: '#f8fafc', textColor: '#0f172a', subtitle: 'Simple, transparent pricing for every team', align: 'center', padding: 80, pricingPlans: [{ name: 'Starter', price: '$29', period: '/month', features: ['5 users', '10GB storage', 'Basic analytics', 'Email support'], highlighted: false, buttonText: 'Start Free Trial' }, { name: 'Pro', price: '$79', period: '/month', features: ['Unlimited users', '100GB storage', 'Advanced analytics', 'Priority support', 'Custom integrations', 'API access'], highlighted: true, buttonText: 'Get Started' }, { name: 'Enterprise', price: 'Custom', period: '', features: ['Unlimited everything', 'Dedicated infrastructure', 'Custom reporting', '24/7 phone support', 'SLA guarantee'], highlighted: false, buttonText: 'Contact Sales' }] },
  columns: { bgColor: '#ffffff', textColor: '#0f172a', subheading: 'We help ambitious companies achieve their goals faster with cutting-edge solutions.', buttonText: 'Learn More', buttonColor: '#6366f1', buttonTextColor: '#ffffff', imagePosition: 'right', imageUrl: '', listItems: ['Streamline your entire workflow end-to-end', 'Automate repetitive tasks and save hours daily', 'Get real-time insights and actionable analytics', 'Scale from startup to enterprise without friction'], padding: 80 },
  cta: { bgGradient: 'linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)', textColor: '#ffffff', subheading: 'Join over 10,000 companies already growing with our platform.', buttonText: 'Start Your Free Trial', buttonColor: '#ffffff', buttonTextColor: '#6366f1', secondaryButtonText: 'Schedule a Demo', align: 'center', padding: 80 },
  stats: { bgColor: '#0f172a', textColor: '#ffffff', padding: 60, statItems: [{ value: '10,000+', label: 'Happy Customers', icon: '😊' }, { value: '99.9%', label: 'Uptime SLA', icon: '⚡' }, { value: '$2.4B', label: 'Revenue Generated', icon: '💰' }, { value: '4.9/5', label: 'Average Rating', icon: '⭐' }] },
  faq: { bgColor: '#ffffff', textColor: '#0f172a', subtitle: 'Everything you need to know', align: 'left', padding: 80, faqItems: [{ q: 'How does the free trial work?', a: 'Start with a 14-day free trial with full access. No credit card required.' }, { q: 'Can I change my plan later?', a: 'Yes! Upgrade or downgrade at any time. Changes take effect immediately.' }, { q: 'What payment methods do you accept?', a: 'We accept all major credit cards, PayPal, and bank wire for annual plans.' }, { q: 'Is there a long-term contract?', a: 'No contracts. All plans are month-to-month. Annual plans have a 20% discount.' }, { q: 'Do you offer customer support?', a: 'All plans include email support. Pro/Enterprise include priority support.' }] },
  footer: { bgColor: '#0f172a', textColor: '#94a3b8', navLogo: 'YourBrand', padding: 60, footerColumns: [{ heading: 'Product', links: [{ label: 'Features', url: '#' }, { label: 'Pricing', url: '#' }, { label: 'Changelog', url: '#' }] }, { heading: 'Company', links: [{ label: 'About', url: '#' }, { label: 'Blog', url: '#' }, { label: 'Careers', url: '#' }] }, { heading: 'Support', links: [{ label: 'Docs', url: '#' }, { label: 'Help Center', url: '#' }, { label: 'Contact', url: '#' }] }], footerCopyright: `© ${new Date().getFullYear()} YourBrand Inc. All rights reserved.` },
  gallery: { bgColor: '#f8fafc', textColor: '#0f172a', subtitle: 'Our work speaks for itself', columns: 3, galleryImages: ['#e0e7ff', '#ddd6fe', '#fce7f3', '#fee2e2', '#d1fae5', '#fef3c7'], padding: 60, align: 'center' },
  heading: { size: 'xl', color: '#0f172a', align: 'center', padding: 16, fontWeight: '700' },
  text: { size: 'md', color: '#64748b', align: 'center', padding: 12 },
  button: { buttonColor: '#6366f1', buttonTextColor: '#ffffff', align: 'center', buttonText: 'Click Here', url: '#', padding: 20, borderRadius: 8 },
  image: { align: 'center', imageUrl: '', imageAlt: 'Image', padding: 16, shadow: false, borderRadius: 0 },
  video: { align: 'center', url: '', padding: 24 },
  form: { bgColor: '#f8fafc', buttonColor: '#6366f1', buttonTextColor: '#ffffff', buttonText: 'Submit Now', align: 'center', padding: 48, formFields: [{ label: 'Full Name', type: 'text', required: true }, { label: 'Email Address', type: 'email', required: true }], redirectUrl: '' },
  divider: { color: '#e2e8f0', padding: 16 },
  spacer: { padding: 60 },
  countdown: { bgColor: '#0f172a', textColor: '#ffffff', subheading: "Don't miss out — offer ends soon!", align: 'center', padding: 60 },
};

const DEFAULT_CONTENT: Record<BlockType, string> = {
  navbar: '', hero: 'Transform Your Business Today', features: 'Why Choose Us',
  testimonials: 'What Our Customers Say', pricing: 'Simple, Transparent Pricing',
  columns: 'Grow Faster With Us', cta: 'Ready to Get Started?', stats: '',
  faq: 'Frequently Asked Questions', footer: '', gallery: 'Our Portfolio',
  heading: 'Your Headline Here', text: 'Add your body text here. Describe your value clearly.',
  button: 'Click Here', image: '', video: '', form: 'Get In Touch',
  divider: '', spacer: '', countdown: 'Limited Time Offer',
};

function createBlock(type: BlockType, content = '', extra: FunnelBlock['settings'] = {}): FunnelBlock {
  return { id: uid(), type, content: content || DEFAULT_CONTENT[type], settings: { ...DEFAULTS[type], ...extra } };
}
let _ti = 0;
function mk(type: BlockType, content = '', extra: FunnelBlock['settings'] = {}): FunnelBlock {
  return { id: `t${++_ti}`, type, content: content || DEFAULT_CONTENT[type], settings: { ...DEFAULTS[type], ...extra } };
}
let _pi = 0;
function mkPage(name: string, type: FunnelStep['type'] = 'landing'): FunnelStep {
  return { id: `p${++_pi}`, name, type, slug: name.toLowerCase().replace(/\s+/g, '-'), blocks: [], visitors: 0, conversions: 0 };
}

// ─── TEMPLATES ────────────────────────────────────────────────────────────────
interface Template { id: string; name: string; category: string; emoji: string; heroColor: string; desc: string; pages: { name: string; type: FunnelStep['type']; blocks: FunnelBlock[] }[]; }

const TEMPLATES: Template[] = [
  /* ── SaaS & Tech ── */
  { id: 'saas-pro', name: 'SaaS Pro', category: 'SaaS', emoji: '🚀', heroColor: 'linear-gradient(135deg,#6366f1,#8b5cf6)', desc: 'Modern SaaS with gradient hero, features, pricing & social proof.', pages: [{ name: 'Home', type: 'landing', blocks: [mk('navbar', '', { navLogo: 'ProSaaS', buttonText: 'Start Free', buttonColor: '#6366f1' }), mk('hero', 'The Smarter Way to Manage Your Business', { bgGradient: 'linear-gradient(135deg,#6366f1,#8b5cf6)', subheading: 'Join 25,000+ companies using our platform to streamline operations, boost revenue, and delight customers.', buttonText: 'Start Free Trial — No Card Needed', secondaryButtonText: 'Watch 2-min Demo' }), mk('stats', '', { bgColor: '#0f172a', statItems: [{ value: '25K+', label: 'Active Companies', icon: '🏢' }, { value: '99.9%', label: 'Uptime Guarantee', icon: '⚡' }, { value: '4.9★', label: 'App Store Rating', icon: '⭐' }, { value: '$2.1B', label: 'Revenue Tracked', icon: '💰' }] }), mk('features', 'One Platform. Every Tool You Need.', { subtitle: 'Replace 8 different tools with a single, powerful workspace your team will love.', featureItems: [{ icon: '🤖', title: 'AI Automation', desc: 'Let AI handle repetitive tasks so your team focuses on what matters most.' }, { icon: '📊', title: 'Live Analytics', desc: 'Real-time dashboards that surface insights before issues become problems.' }, { icon: '🔗', title: '300+ Integrations', desc: 'Connect to Slack, Salesforce, HubSpot, Stripe and 300+ more with one click.' }, { icon: '🔒', title: 'Enterprise Security', desc: 'SOC 2 Type II, GDPR compliant, SSO, and end-to-end encryption.' }, { icon: '📱', title: 'Mobile-First', desc: 'Native iOS and Android apps so your team stays productive anywhere.' }, { icon: '⚡', title: 'Lightning Fast', desc: 'Pages load in under 200ms. No more waiting, no more lost productivity.' }] }), mk('columns', 'See the Difference in 5 Minutes', { subheading: 'Import your existing data and get up and running in minutes — not months. Our setup wizard guides you every step of the way.', listItems: ['White-glove onboarding included with all plans', 'Migrate from any tool with zero data loss', 'Dedicated success manager for Pro+ accounts', '24/7 live chat support — average 2min response'] }), mk('testimonials', 'Loved by Teams at World-Class Companies', { testimonialItems: [{ quote: 'Switched from 6 different tools to this. Saved $3,400/month and our team is 40% more productive.', author: 'Sarah Mitchell', role: 'COO, TechFlow Inc.', stars: 5 }, { quote: 'The AI features alone paid for 3 years of subscription in the first quarter.', author: 'James Park', role: 'CEO, GrowthLabs', stars: 5 }, { quote: 'Best investment we made in 2024. Can\'t imagine running our ops without it.', author: 'Priya Nair', role: 'VP Operations, ScaleHQ', stars: 5 }] }), mk('pricing', 'Simple, Transparent Pricing', { subtitle: 'Start free. Upgrade when you\'re ready. No surprise fees.', pricingPlans: [{ name: 'Starter', price: '$0', period: '/month', features: ['Up to 5 users', '10 projects', 'Basic analytics', 'Email support'], highlighted: false, buttonText: 'Get Started Free' }, { name: 'Growth', price: '$49', period: '/month', features: ['Unlimited users', 'Unlimited projects', 'Advanced AI features', 'Priority support', 'Custom integrations', 'API access'], highlighted: true, buttonText: 'Start 14-Day Trial' }, { name: 'Enterprise', price: 'Custom', period: '', features: ['Everything in Growth', 'Dedicated infrastructure', 'Custom SLAs', '24/7 phone support', 'Compliance suite'], highlighted: false, buttonText: 'Contact Sales' }] }), mk('cta', 'Ready to Transform Your Business?', { bgGradient: 'linear-gradient(135deg,#6366f1,#8b5cf6)', subheading: 'Join 25,000+ companies. Start free — upgrade anytime. No credit card required.', buttonText: 'Start Your Free Trial', buttonColor: '#fff', buttonTextColor: '#6366f1', secondaryButtonText: 'Schedule a Demo' }), mk('footer', '', { navLogo: 'ProSaaS' })] }] },

  { id: 'ai-startup', name: 'AI Startup', category: 'SaaS', emoji: '🤖', heroColor: 'linear-gradient(135deg,#0f172a,#312e81)', desc: 'Dark-theme AI company site with futuristic neon accent styling.', pages: [{ name: 'Home', type: 'landing', blocks: [mk('navbar', '', { bgColor: '#0f172a', textColor: '#ffffff', navLogo: 'NeuralAI', buttonText: 'Get Beta Access', buttonColor: '#818cf8', buttonTextColor: '#fff' }), mk('hero', 'The Future of Business Intelligence is Here', { bgGradient: 'linear-gradient(135deg,#0f172a 0%,#312e81 50%,#0f172a 100%)', subheading: 'Our AI analyzes millions of data points in seconds to give you predictions, insights, and recommendations your competitors can only dream about.', buttonText: 'Request Beta Access', buttonColor: '#818cf8', secondaryButtonText: 'See Live Demo' }), mk('stats', '', { bgColor: '#1e1b4b', statItems: [{ value: '10B+', label: 'Data Points Processed', icon: '🧠' }, { value: '94%', label: 'Prediction Accuracy', icon: '🎯' }, { value: '3.8x', label: 'Avg Revenue Increase', icon: '📈' }, { value: '<50ms', label: 'Response Time', icon: '⚡' }] }), mk('features', 'Intelligence at Scale', { bgColor: '#0f172a', textColor: '#f1f5f9', iconColor: '#818cf8', featureItems: [{ icon: '🧠', title: 'Predictive Analytics', desc: 'Know what your customers will do before they do it. 94% accurate.' }, { icon: '💬', title: 'Natural Language Query', desc: 'Ask business questions in plain English. Get instant chart answers.' }, { icon: '🔮', title: 'Revenue Forecasting', desc: 'AI-powered revenue predictions with 90-day rolling forecasts.' }, { icon: '⚠️', title: 'Anomaly Detection', desc: 'Instant alerts when something unusual happens in your data.' }, { icon: '🌍', title: 'Multi-source Fusion', desc: 'Connect all your data sources and get a unified intelligence layer.' }, { icon: '🔐', title: 'Private & Secure', desc: 'Your data never leaves your infrastructure. Zero-trust architecture.' }] }), mk('testimonials', 'Trusted by Innovation Leaders', { bgColor: '#0f172a', testimonialItems: [{ quote: 'NeuralAI predicted our biggest customer churn risk 3 weeks in advance. We retained a $2M account.', author: 'Lauren Kim', role: 'Chief Analytics Officer, Apex Corp', stars: 5 }, { quote: 'The natural language querying is black magic. Our non-technical team now runs their own analyses.', author: 'David Okafor', role: 'CEO, DataVenture', stars: 5 }, { quote: 'ROI was 1,200% in year one. This is the most impactful software purchase I\'ve ever made.', author: 'Maya Patel', role: 'Founder, InsightStack', stars: 5 }] }), mk('pricing', 'Built for Every Scale', { bgColor: '#0f172a', textColor: '#f1f5f9', pricingPlans: [{ name: 'Starter', price: '$299', period: '/month', features: ['5M data points/mo', '3 data sources', 'Standard dashboards', 'Email support'], highlighted: false, buttonText: 'Start Trial' }, { name: 'Scale', price: '$999', period: '/month', features: ['100M data points/mo', 'Unlimited sources', 'AI predictions', 'Slack integration', 'Priority support'], highlighted: true, buttonText: 'Start Trial' }, { name: 'Enterprise', price: 'Custom', period: '', features: ['Unlimited everything', 'Private deployment', 'Custom AI models', 'Dedicated team'], highlighted: false, buttonText: 'Talk to Us' }] }), mk('cta', 'See What AI Can Do for Your Business', { bgGradient: 'linear-gradient(135deg,#312e81,#6366f1)', subheading: 'Get a personalized demo with your own data. See real insights in 30 minutes.', buttonText: 'Book a Live Demo', buttonColor: '#fff', buttonTextColor: '#6366f1' }), mk('footer', '', { bgColor: '#0a0a1a', navLogo: 'NeuralAI' })] }] },

  { id: 'mobile-app', name: 'Mobile App Launch', category: 'App', emoji: '📱', heroColor: 'linear-gradient(135deg,#06b6d4,#6366f1)', desc: 'App store launch page with device showcase and download CTAs.', pages: [{ name: 'App', type: 'landing', blocks: [mk('navbar', '', { navLogo: 'AppName', buttonText: 'Download Free', buttonColor: '#06b6d4' }), mk('hero', 'The App That Changes Everything', { bgGradient: 'linear-gradient(135deg,#06b6d4,#6366f1)', subheading: 'Available on iOS & Android. Join 500,000+ users who\'ve already transformed their daily routine. Free forever.', buttonText: '⬇ Download on App Store', buttonColor: '#000', buttonTextColor: '#fff', secondaryButtonText: '▶ Get on Google Play' }), mk('stats', '', { bgColor: '#f0f9ff', textColor: '#0f172a', statItems: [{ value: '500K+', label: 'Active Users', icon: '👥' }, { value: '4.9★', label: 'App Store', icon: '⭐' }, { value: '#1', label: 'Productivity Chart', icon: '🏆' }, { value: 'Free', label: 'Always Free Tier', icon: '🎁' }] }), mk('features', 'Everything You Need in One App', { subtitle: 'Built by experts who actually use what they build. For people who demand more.', featureItems: [{ icon: '⚡', title: 'Instant Sync', desc: 'Your data syncs across all devices in under 1 second. Always in sync.' }, { icon: '🔔', title: 'Smart Notifications', desc: 'AI-powered notifications that learn your habits and only alert when it matters.' }, { icon: '🌙', title: 'Dark Mode', desc: 'Stunning dark and light modes that automatically match your device settings.' }, { icon: '🔒', title: 'End-to-End Encrypted', desc: 'Military-grade encryption. Your data belongs to you and only you.' }, { icon: '📴', title: 'Works Offline', desc: 'Full functionality even without internet. Syncs automatically when back online.' }, { icon: '🌍', title: '28 Languages', desc: 'Fully localized in 28 languages with right-to-left support.' }] }), mk('columns', 'Designed for Real Life', { subheading: 'Every pixel crafted with purpose. Every interaction smooth as butter. This is what software should feel like.', imagePosition: 'right', imageUrl: '#06b6d4', listItems: ['Gesture-based navigation — swipe to do anything', 'Customizable widgets for your home screen', '1-tap sharing to any app or person', 'Accessibility-first design for everyone'] }), mk('testimonials', 'What Users Are Saying', { testimonialItems: [{ quote: "I've tried every productivity app. This is the one I've stuck with for 2 years. Nothing comes close.", author: 'Emma Watson', role: '⭐⭐⭐⭐⭐ App Store Review', stars: 5 }, { quote: "The offline mode alone is worth 5 stars. I work on planes constantly and this app just works.", author: 'Tom Richards', role: '⭐⭐⭐⭐⭐ Google Play Review', stars: 5 }, { quote: "My whole family uses it. The sync between our devices is instant and flawless.", author: 'Maria Santos', role: '⭐⭐⭐⭐⭐ App Store Review', stars: 5 }] }), mk('cta', 'Download Free — Start in 60 Seconds', { bgGradient: 'linear-gradient(135deg,#06b6d4,#6366f1)', subheading: 'No account required to start. No credit card. No catch. Just open the app and go.', buttonText: '⬇ Download on iOS', buttonColor: '#000', buttonTextColor: '#fff', secondaryButtonText: '▶ Download on Android' }), mk('footer', '', { navLogo: 'AppName' })] }] },

  { id: 'fintech', name: 'FinTech Banking', category: 'Finance', emoji: '💳', heroColor: 'linear-gradient(135deg,#0ea5e9,#0284c7)', desc: 'Modern digital banking app with trust signals and features.', pages: [{ name: 'Home', type: 'landing', blocks: [mk('navbar', '', { navLogo: 'NeoBank', buttonText: 'Open Account', buttonColor: '#0ea5e9' }), mk('hero', 'Banking That Works as Hard as You Do', { bgGradient: 'linear-gradient(135deg,#0ea5e9,#0369a1)', subheading: 'Open a free account in 3 minutes. No fees, no minimum balance, no paperwork. Just smarter banking built for the modern world.', buttonText: 'Open Free Account', buttonColor: '#fff', buttonTextColor: '#0284c7', secondaryButtonText: 'See How It Works' }), mk('stats', '', { bgColor: '#f0f9ff', textColor: '#0f172a', statItems: [{ value: '2M+', label: 'Happy Customers', icon: '😊' }, { value: '$0', label: 'Monthly Fees', icon: '🆓' }, { value: '4.8★', label: 'App Store Rating', icon: '⭐' }, { value: '256-bit', label: 'Encryption', icon: '🔒' }] }), mk('features', 'More Than a Bank Account', { subtitle: 'Everything you need to take control of your finances — in one beautifully simple app.', featureItems: [{ icon: '💸', title: 'Instant Transfers', desc: 'Send money to anyone in seconds. Domestic and international. No fees.' }, { icon: '📊', title: 'Spending Analytics', desc: 'AI categorizes every transaction and shows exactly where your money goes.' }, { icon: '🏦', title: 'High-Yield Savings', desc: 'Earn 5.10% APY on your savings. 10x the national average.' }, { icon: '💳', title: 'Virtual Cards', desc: 'Create unlimited virtual cards for safer online shopping.' }, { icon: '🤖', title: 'AI Financial Coach', desc: 'Get personalized tips to reach your money goals faster.' }, { icon: '🌍', title: 'Global Spending', desc: 'Use your card worldwide with zero foreign transaction fees.' }] }), mk('columns', 'Trusted. Regulated. Secure.', { subheading: 'We hold your money in FDIC-insured accounts up to $250,000. Regulated by the FCA and FINRA. We take the security of your money extremely seriously.', listItems: ['FDIC insured up to $250,000', 'Bank-grade 256-bit AES encryption', 'Biometric authentication required', 'Real-time fraud detection AI'] }), mk('testimonials', 'Why Our Customers Love Us', { testimonialItems: [{ quote: 'Finally a bank that doesn\'t charge me for breathing. Switched all my accounts over in one afternoon.', author: 'Jessica Liu', role: 'Freelance Designer', stars: 5 }, { quote: 'The spending analytics showed me I was wasting $400/month on subscriptions I forgot about.', author: 'Mark Stevens', role: 'Software Engineer', stars: 5 }, { quote: 'Customer support actually picks up the phone. In 5 years of banking with them, never had an issue.', author: 'Amara Johnson', role: 'Small Business Owner', stars: 5 }] }), mk('cta', 'Join 2 Million People Banking Smarter', { bgGradient: 'linear-gradient(135deg,#0ea5e9,#0369a1)', subheading: 'Open your free account in 3 minutes. No fees. No minimum balance. Cancel anytime.', buttonText: 'Open Free Account', buttonColor: '#fff', buttonTextColor: '#0284c7' }), mk('footer', '', { navLogo: 'NeoBank' })] }] },

  /* ── Agency & Creative ── */
  { id: 'agency-dark', name: 'Creative Agency', category: 'Agency', emoji: '🎨', heroColor: 'linear-gradient(135deg,#18181b,#7c3aed)', desc: 'Bold dark-theme creative agency with portfolio gallery.', pages: [{ name: 'Home', type: 'landing', blocks: [mk('navbar', '', { bgColor: '#09090b', textColor: '#ffffff', navLogo: 'STUDIOX', buttonText: 'Start a Project', buttonColor: '#7c3aed', buttonTextColor: '#fff' }), mk('hero', 'We Build Brands That Stop the Scroll', { bgGradient: 'linear-gradient(135deg,#09090b,#18181b)', subheading: 'Strategy. Design. Development. We are a full-service creative agency that turns ambitious brands into market leaders.', buttonText: 'View Our Work', buttonColor: '#7c3aed', secondaryButtonText: 'Get a Free Audit' }), mk('gallery', 'Award-Winning Work', { subtitle: '45+ projects. 12 industry awards. 100% on-time delivery.', galleryImages: ['#7c3aed', '#6366f1', '#ec4899', '#f97316', '#06b6d4', '#22c55e', '#8b5cf6', '#0ea5e9', '#f59e0b'] }), mk('features', 'Our Services', { bgColor: '#09090b', textColor: '#f1f5f9', iconColor: '#7c3aed', featureItems: [{ icon: '🎨', title: 'Brand Identity', desc: 'Logo, color systems, typography and brand guidelines that last decades.' }, { icon: '💻', title: 'Website Design', desc: 'Hand-crafted websites with conversion rates above industry average.' }, { icon: '📱', title: 'Mobile Apps', desc: 'Native iOS & Android apps with App Store Optimization built in.' }, { icon: '🎬', title: 'Motion & Video', desc: 'Brand films, explainers, and social content that goes viral.' }, { icon: '📣', title: 'Growth Marketing', desc: 'Performance campaigns with a proven track record of 5-10x ROAS.' }, { icon: '🛍️', title: 'eCommerce', desc: 'Shopify and WooCommerce stores engineered to maximize revenue.' }] }), mk('stats', '', { bgColor: '#7c3aed', statItems: [{ value: '45+', label: 'Projects Delivered', icon: '🚀' }, { value: '12', label: 'Industry Awards', icon: '🏆' }, { value: '$80M', label: 'Revenue Generated', icon: '💰' }, { value: '98%', label: 'Client Retention', icon: '❤️' }] }), mk('testimonials', 'What Our Clients Say', { bgColor: '#09090b', testimonialItems: [{ quote: 'StudioX didn\'t just redesign our website — they rebuilt our entire brand narrative. Sales up 180%.', author: 'Ryan Cole', role: 'Founder, ModernMade', stars: 5 }, { quote: 'The most professional agency I\'ve worked with in 15 years. Exceptional quality, exceptional speed.', author: 'Sophie Laurent', role: 'CMO, LuxBrand Paris', stars: 5 }, { quote: 'Our app launch was the most successful in company history. 10,000 downloads day one.', author: 'Kai Tanaka', role: 'CEO, AppLaunch.io', stars: 5 }] }), mk('cta', "Let's Build Something Legendary", { bgGradient: 'linear-gradient(135deg,#7c3aed,#6366f1)', subheading: 'Limited availability. We only take on 4 new projects per month to ensure exceptional results.', buttonText: 'Apply to Work With Us', buttonColor: '#fff', buttonTextColor: '#7c3aed' }), mk('footer', '', { bgColor: '#09090b', navLogo: 'STUDIOX' })] }] },

  { id: 'marketing-agency', name: 'Marketing Agency', category: 'Agency', emoji: '📣', heroColor: 'linear-gradient(135deg,#f97316,#ec4899)', desc: 'Performance marketing agency with results-focused design.', pages: [{ name: 'Home', type: 'landing', blocks: [mk('navbar', '', { navLogo: 'GrowthForce', buttonText: 'Get Free Audit', buttonColor: '#f97316' }), mk('hero', 'We Turn Ad Spend Into Revenue — Guaranteed', { bgGradient: 'linear-gradient(135deg,#7f1d1d,#f97316)', subheading: 'Performance marketing agency specializing in Meta, Google, and TikTok ads. Average client sees 4.2x ROAS within 90 days or we work for free.', buttonText: 'Claim Your Free Audit', buttonColor: '#f97316', secondaryButtonText: 'See Case Studies' }), mk('stats', '', { bgColor: '#0f172a', statItems: [{ value: '4.2x', label: 'Average ROAS', icon: '📈' }, { value: '$50M+', label: 'Ad Spend Managed', icon: '💰' }, { value: '127', label: 'Active Clients', icon: '🏢' }, { value: '90-Day', label: 'Guarantee', icon: '✅' }] }), mk('features', 'Every Channel. Every Platform.', { subtitle: 'We don\'t just run ads. We engineer customer acquisition machines.', featureItems: [{ icon: '📘', title: 'Meta (FB/IG) Ads', desc: 'Creative testing frameworks that find your winners in days, not months.' }, { icon: '🔍', title: 'Google Search & Shopping', desc: 'Capture high-intent buyers at the exact moment they\'re ready to purchase.' }, { icon: '🎵', title: 'TikTok Ads', desc: 'Native-feeling creatives that blend into the feed and drive conversions.' }, { icon: '🎯', title: 'Programmatic Display', desc: 'Retargeting sequences that bring back 30% of lost visitors.' }, { icon: '📧', title: 'Email & SMS', desc: 'Automated flows that generate 30-40% of total eCommerce revenue.' }, { icon: '📊', title: 'Analytics & CRO', desc: 'A/B testing and conversion rate optimization to maximize every click.' }] }), mk('testimonials', 'Client Results That Speak for Themselves', { testimonialItems: [{ quote: 'ROAS went from 1.8x to 5.6x in 60 days. GrowthForce paid for themselves 20x over.', author: 'Brandon Lee', role: 'DTC Brand Founder', stars: 5 }, { quote: 'They scaled our Google Shopping from $20K to $200K/month in spend while improving ROAS.', author: 'Claire Dubois', role: 'Head of eCommerce, LuxCo', stars: 5 }, { quote: 'TikTok campaigns they built generated $1.2M in revenue in Q4. Blew our projections away.', author: 'Kevin Marsh', role: 'CMO, FitBrand', stars: 5 }] }), mk('pricing', 'Investment Levels', { pricingPlans: [{ name: 'Starter', price: '$2,500', period: '/month', features: ['1 ad platform', 'Up to $20K ad spend', 'Bi-weekly reporting', 'Dedicated manager'], highlighted: false, buttonText: 'Get Started' }, { name: 'Growth', price: '$5,000', period: '/month', features: ['3 ad platforms', 'Up to $100K ad spend', 'Weekly reporting', 'CRO included', 'Creative production'], highlighted: true, buttonText: 'Most Popular' }, { name: 'Scale', price: '$10,000+', period: '/month', features: ['All platforms', 'Unlimited ad spend', 'Daily reporting', 'Full creative team', 'C-suite access'], highlighted: false, buttonText: 'Let\'s Talk' }] }), mk('cta', 'Ready for Real Results?', { bgGradient: 'linear-gradient(135deg,#f97316,#ec4899)', subheading: 'Get a free 30-minute audit. We\'ll show you exactly where you\'re losing money and how to fix it.', buttonText: 'Book Free Audit Call', buttonColor: '#fff', buttonTextColor: '#f97316' }), mk('footer', '', { navLogo: 'GrowthForce' })] }] },

  /* ── eCommerce & Products ── */
  { id: 'ecommerce-modern', name: 'eCommerce Store', category: 'eCommerce', emoji: '🛒', heroColor: 'linear-gradient(135deg,#ec4899,#8b5cf6)', desc: 'Modern product launch page with reviews, social proof, and urgency.', pages: [{ name: 'Store', type: 'sales', blocks: [mk('navbar', '', { navLogo: 'ShopLux', buttonText: 'Shop Now', buttonColor: '#ec4899' }), mk('hero', 'The Product Everyone Is Talking About', { bgGradient: 'linear-gradient(135deg,#ec4899,#8b5cf6)', subheading: '⭐⭐⭐⭐⭐ Over 12,000 five-star reviews. Free shipping over $50. 60-day hassle-free returns.', buttonText: 'Shop Now — Save 30%', buttonColor: '#fff', buttonTextColor: '#ec4899', secondaryButtonText: 'See Reviews' }), mk('countdown', '⚡ Flash Sale Ends In:', { bgColor: '#ec4899', textColor: '#ffffff', subheading: 'Don\'t miss 30% off sitewide — biggest discount of the year.' }), mk('columns', 'Why Customers Can\'t Stop Buying', { subheading: 'Built with premium materials by craftspeople who care about quality. The kind of product you\'ll pass down to the next generation.', imagePosition: 'left', imageUrl: '#ec4899', listItems: ['Premium materials that last a lifetime', 'Eco-friendly sustainable production', 'Handcrafted by artisans in small batches', '60-day no-questions return policy'] }), mk('stats', '', { bgColor: '#fff', textColor: '#0f172a', statItems: [{ value: '12K+', label: '5-Star Reviews', icon: '⭐' }, { value: '98%', label: 'Recommend to Friends', icon: '❤️' }, { value: '2-Day', label: 'Free Shipping', icon: '🚚' }, { value: '60-Day', label: 'Free Returns', icon: '↩️' }] }), mk('gallery', 'See It in Real Life', { subtitle: 'Photos from our community of 50,000+ happy customers', galleryImages: ['#ec4899', '#f9a8d4', '#8b5cf6', '#c4b5fd', '#ec4899', '#8b5cf6', '#f97316', '#fbbf24', '#22c55e'] }), mk('testimonials', 'What Our Customers Are Saying', { bgColor: '#fff5f9', testimonialItems: [{ quote: 'Ordered for myself and bought 3 more as gifts the same week. Absolutely obsessed with the quality.', author: 'Megan Turner', role: 'Verified Buyer ✓', stars: 5 }, { quote: 'The packaging alone made me emotional. This company genuinely cares about every detail.', author: 'Chris Novak', role: 'Verified Buyer ✓', stars: 5 }, { quote: 'Returned competitor product and bought this instead. No comparison. This is leagues ahead.', author: 'Ana Ferreira', role: 'Verified Buyer ✓', stars: 5 }] }), mk('cta', 'Join 50,000+ Happy Customers', { bgGradient: 'linear-gradient(135deg,#ec4899,#8b5cf6)', subheading: 'Free shipping. 60-day returns. Lifetime warranty on all products.', buttonText: 'Shop the Collection', buttonColor: '#fff', buttonTextColor: '#ec4899' }), mk('footer', '', { navLogo: 'ShopLux' })] }] },

  /* ── Education & Courses ── */
  { id: 'bootcamp', name: 'Online Bootcamp', category: 'Education', emoji: '🎓', heroColor: 'linear-gradient(135deg,#0891b2,#6366f1)', desc: 'Intensive course sales page with curriculum and placement stats.', pages: [{ name: 'Bootcamp', type: 'sales', blocks: [mk('navbar', '', { bgColor: '#0c1445', textColor: '#ffffff', navLogo: 'LearnPro', buttonText: 'Apply Now', buttonColor: '#0891b2' }), mk('hero', 'Land a $100K+ Tech Job in 6 Months — Guaranteed', { bgGradient: 'linear-gradient(135deg,#0c1445,#1e3a8a)', subheading: 'Our proven bootcamp has placed 2,000+ graduates at companies like Google, Stripe, and Shopify. If you don\'t get a job offer, we refund 100%.', buttonText: 'Apply Now — Limited Spots', buttonColor: '#0891b2', secondaryButtonText: 'View Curriculum' }), mk('stats', '', { bgColor: '#0891b2', statItems: [{ value: '2,000+', label: 'Graduates Hired', icon: '💼' }, { value: '$108K', label: 'Avg Starting Salary', icon: '💰' }, { value: '94%', label: 'Job Placement Rate', icon: '✅' }, { value: '4.9★', label: 'Student Rating', icon: '⭐' }] }), mk('features', 'What You\'ll Master', { subtitle: '24 weeks. 500+ hours of hands-on coding. Real projects. Real mentors. Real results.', featureItems: [{ icon: '⚛️', title: 'React & Next.js', desc: 'Build production-ready full-stack apps with the most in-demand framework.' }, { icon: '🗄️', title: 'Node.js & Databases', desc: 'Master backend development with PostgreSQL, MongoDB and Redis.' }, { icon: '☁️', title: 'Cloud & DevOps', desc: 'Deploy with Docker, AWS, CI/CD pipelines and infrastructure as code.' }, { icon: '🤖', title: 'AI Integration', desc: 'Build AI-powered features using OpenAI, LangChain and vector databases.' }, { icon: '💼', title: 'Job Preparation', desc: 'Technical interviews, system design, salary negotiation coaching.' }, { icon: '🏗️', title: 'Portfolio Projects', desc: '5 production-grade projects that impress hiring managers on day one.' }] }), mk('testimonials', 'Graduate Success Stories', { testimonialItems: [{ quote: 'Went from barista to $115K engineer at Stripe in 7 months. Genuinely life-changing.', author: 'Darius Webb', role: 'Software Engineer, Stripe', stars: 5 }, { quote: 'The mentorship is unlike anything else. My mentor at Google guided me through every interview stage.', author: 'Sofia Reyes', role: 'Frontend Engineer, Google', stars: 5 }, { quote: 'Worth every penny of the tuition. Got 4 offers and chose the one paying $120K.', author: 'Jamal Brooks', role: 'Full-Stack Dev, Shopify', stars: 5 }] }), mk('pricing', 'Your Investment in a New Career', { pricingPlans: [{ name: 'Part-Time', price: '$7,500', period: 'total', features: ['12-month program', 'Weekend classes only', 'Lifetime job placement', 'Alumni network'], highlighted: false, buttonText: 'Apply Part-Time' }, { name: 'Full-Time', price: '$12,000', period: 'total', features: ['6-month intensive', 'Daily live classes', '1-on-1 mentorship', 'Guaranteed job or refund', 'ISA available'], highlighted: true, buttonText: 'Apply Full-Time' }, { name: 'ISA Option', price: '$0', period: 'upfront', features: ['Pay after you\'re hired', '15% of salary for 2 years', 'All full-time benefits', 'No risk to you'], highlighted: false, buttonText: 'Apply with ISA' }] }), mk('cta', 'Your New Career Starts Today', { bgGradient: 'linear-gradient(135deg,#0891b2,#6366f1)', subheading: 'Applications close when cohort fills — 8 spots left for January intake. Apply now.', buttonText: 'Apply for Next Cohort', buttonColor: '#fff', buttonTextColor: '#0891b2' }), mk('footer', '', { navLogo: 'LearnPro', bgColor: '#0c1445' })] }] },

  /* ── Health & Fitness ── */
  { id: 'fitness', name: 'Fitness & Gym', category: 'Health', emoji: '💪', heroColor: 'linear-gradient(135deg,#dc2626,#7f1d1d)', desc: 'High-energy gym or fitness brand site with program offerings.', pages: [{ name: 'Gym', type: 'landing', blocks: [mk('navbar', '', { bgColor: '#0a0a0a', textColor: '#ffffff', navLogo: 'APEX GYM', buttonText: 'Join Now', buttonColor: '#dc2626' }), mk('hero', 'Build the Body. Build the Life.', { bgGradient: 'linear-gradient(135deg,#0a0a0a,#1a0000)', subheading: 'State-of-the-art facilities. World-class coaches. A community that pushes you to be extraordinary. Your transformation starts today.', buttonText: 'Start 7-Day Free Trial', buttonColor: '#dc2626', secondaryButtonText: 'Book a Tour' }), mk('stats', '', { bgColor: '#dc2626', statItems: [{ value: '5,000+', label: 'Active Members', icon: '💪' }, { value: '50+', label: 'Expert Coaches', icon: '🏋️' }, { value: '200+', label: 'Weekly Classes', icon: '📅' }, { value: '#1', label: 'Rated in City', icon: '🏆' }] }), mk('features', 'Everything You Need to Win', { bgColor: '#0a0a0a', textColor: '#f1f5f9', iconColor: '#dc2626', featureItems: [{ icon: '🏋️', title: 'Premium Equipment', desc: '500+ pieces of cutting-edge equipment from top brands. Never wait for a machine.' }, { icon: '🥗', title: 'Nutrition Coaching', desc: 'Certified dietitians create personalized meal plans for your exact goals.' }, { icon: '📱', title: 'Training App', desc: 'Track workouts, log meals, book classes, and chat with coaches from our app.' }, { icon: '🛁', title: 'Luxury Amenities', desc: 'Saunas, steam rooms, pools, and premium locker rooms at every location.' }, { icon: '👥', title: '50+ Weekly Classes', desc: 'CrossFit, yoga, spin, HIIT, boxing, pilates and more. All included.' }, { icon: '🎯', title: 'Personalized Programs', desc: 'Custom 12-week training programs designed for your body and your goals.' }] }), mk('pricing', 'Choose Your Membership', { pricingPlans: [{ name: 'Basic', price: '$39', period: '/month', features: ['Gym access 6am-10pm', 'Locker room access', '5 group classes/month', 'App access'], highlighted: false, buttonText: 'Get Basic' }, { name: 'Premium', price: '$79', period: '/month', features: ['24/7 gym access', 'Unlimited classes', 'Sauna & spa access', 'Guest passes (2/mo)', 'Nutrition tracking app'], highlighted: true, buttonText: 'Go Premium' }, { name: 'Elite', price: '$149', period: '/month', features: ['Everything Premium', '4 PT sessions/month', 'Custom meal plan', 'Priority booking', 'Recovery coaching'], highlighted: false, buttonText: 'Go Elite' }] }), mk('testimonials', 'Real Transformations, Real People', { bgColor: '#0a0a0a', testimonialItems: [{ quote: 'Lost 42 pounds in 6 months. The coaching team held me accountable every single day. Life changed.', author: 'Michael Torres', role: 'Member since 2023', stars: 5 }, { quote: 'Best gym I\'ve ever been a member of. Equipment is always clean, staff is always helpful.', author: 'Rachel Kim', role: 'Member since 2022', stars: 5 }, { quote: 'The nutrition coaching combined with the training program is an unstoppable combination.', author: 'Jason Williams', role: 'Member since 2024', stars: 5 }] }), mk('cta', 'Your Transformation Starts Today', { bgGradient: 'linear-gradient(135deg,#dc2626,#7f1d1d)', subheading: 'First 7 days completely free. No commitment. No cancellation fees. Just results.', buttonText: 'Start Free Trial', buttonColor: '#fff', buttonTextColor: '#dc2626' }), mk('footer', '', { bgColor: '#0a0a0a', navLogo: 'APEX GYM' })] }] },

  { id: 'wellness', name: 'Health & Wellness', category: 'Health', emoji: '🧘', heroColor: 'linear-gradient(135deg,#22c55e,#0891b2)', desc: 'Clean, calming wellness brand with services and booking.', pages: [{ name: 'Wellness', type: 'landing', blocks: [mk('navbar', '', { navLogo: 'Serenity', buttonText: 'Book Session', buttonColor: '#22c55e' }), mk('hero', 'Your Journey to Whole-Body Wellness Starts Here', { bgGradient: 'linear-gradient(135deg,#166534,#0891b2)', subheading: 'Holistic health programs combining ancient wisdom with modern science. Mindfulness, nutrition, movement — everything you need to thrive.', buttonText: 'Book a Free Consultation', secondaryButtonText: 'Explore Programs' }), mk('features', 'Holistic Programs Designed for You', { bgColor: '#f0fdf4', featureItems: [{ icon: '🧘', title: 'Mindfulness & Meditation', desc: 'Daily practices to reduce stress, improve focus, and find inner peace.' }, { icon: '🥗', title: 'Nutritional Therapy', desc: 'Personalized nutrition plans based on your body and health goals.' }, { icon: '🏃', title: 'Movement & Yoga', desc: 'Guided yoga, stretching and low-impact movement for every fitness level.' }, { icon: '😴', title: 'Sleep Optimization', desc: 'Evidence-based techniques to dramatically improve your sleep quality.' }, { icon: '🫁', title: 'Breathwork Sessions', desc: 'Powerful breathing techniques for stress relief and mental clarity.' }, { icon: '💊', title: 'Supplement Guidance', desc: 'Science-backed supplement recommendations tailored to your needs.' }] }), mk('testimonials', 'Real Health Transformations', { testimonialItems: [{ quote: 'After 3 months of the program, my anxiety is at an all-time low and my energy is incredible.', author: 'Emma Clarke', role: 'Program Graduate', stars: 5 }, { quote: 'The holistic approach addressed root causes, not just symptoms. My whole life has improved.', author: 'Robert Singh', role: 'Member for 1 year', stars: 5 }, { quote: 'Down 18 pounds and sleeping better than I have in a decade. This program is extraordinary.', author: 'Linda Park', role: 'Program Graduate', stars: 5 }] }), mk('pricing', 'Programs for Every Journey', { pricingPlans: [{ name: 'Foundations', price: '$97', period: '/month', features: ['Weekly group sessions', 'Nutrition guidelines', 'App access', 'Community forum'], highlighted: false, buttonText: 'Join Foundations' }, { name: 'Transform', price: '$247', period: '/month', features: ['2x private sessions/week', 'Custom meal plan', 'Daily check-ins', 'Supplement guidance', 'Sleep coaching'], highlighted: true, buttonText: 'Start Transforming' }, { name: 'Immersive', price: '$497', period: '/month', features: ['Daily private sessions', 'Full health assessment', 'Lab testing', 'Concierge support', 'Retreats included'], highlighted: false, buttonText: 'Go Immersive' }] }), mk('cta', 'Begin Your Wellness Journey Today', { bgGradient: 'linear-gradient(135deg,#22c55e,#0891b2)', subheading: 'Free 30-minute wellness consultation. No pressure. Just real conversation about your health.', buttonText: 'Book Free Consultation', buttonColor: '#fff', buttonTextColor: '#166534' }), mk('footer', '', { navLogo: 'Serenity' })] }] },

  /* ── Real Estate & Local ── */
  { id: 'real-estate', name: 'Real Estate Agency', category: 'Real Estate', emoji: '🏡', heroColor: 'linear-gradient(135deg,#1e3a5f,#0ea5e9)', desc: 'Luxury real estate agency with property showcase and lead capture.', pages: [{ name: 'Home', type: 'landing', blocks: [mk('navbar', '', { navLogo: 'LuxRealty', buttonText: 'Find Your Home', buttonColor: '#1e3a5f' }), mk('hero', 'Find the Home You Deserve in a Market You Can Trust', { bgGradient: 'linear-gradient(135deg,#1e3a5f,#0c4a6e)', subheading: 'Award-winning real estate agency with 20+ years helping families find their perfect home. 500+ properties sold this year alone.', buttonText: 'Browse Properties', secondaryButtonText: 'Free Home Valuation' }), mk('stats', '', { bgColor: '#f0f9ff', textColor: '#0f172a', statItems: [{ value: '500+', label: 'Homes Sold (2024)', icon: '🏠' }, { value: '$2.1B', label: 'Total Sales Volume', icon: '💰' }, { value: '4.9★', label: 'Client Rating', icon: '⭐' }, { value: '20yr', label: 'Serving the Area', icon: '🏆' }] }), mk('features', 'The LuxRealty Advantage', { subtitle: 'More than just a transaction — we guide you through one of the most important decisions of your life.', featureItems: [{ icon: '🔍', title: 'AI Property Matching', desc: 'Our AI learns your preferences and alerts you the moment your perfect home lists.' }, { icon: '🏠', title: 'Virtual Tours', desc: '3D virtual tours of every listing so you can explore homes from anywhere.' }, { icon: '📊', title: 'Market Intelligence', desc: 'Hyper-local market reports so you always know the fair price for any home.' }, { icon: '🤝', title: 'Expert Negotiators', desc: 'Our agents average $15,000 below asking price for buyer clients.' }, { icon: '🔑', title: 'Smooth Closings', desc: 'In-house legal, mortgage, and title services for a stress-free close.' }, { icon: '📱', title: 'Agent App', desc: 'Track your transaction status, documents, and timeline 24/7 from our app.' }] }), mk('columns', 'Selling? Get Top Dollar.', { subheading: 'Our proven listing strategy gets homes sold 43% faster and for 6% more than market average. Professional photography, staging consultation, and global listing syndication included.', listItems: ['Professional photography & drone footage', 'Staging consultation with certified stager', 'Global syndication to 100+ listing sites', 'Open house coordination and management'] }), mk('testimonials', 'Happy Home Owners', { testimonialItems: [{ quote: 'LuxRealty got us $47K over asking price in just 8 days on market. The marketing they did was incredible.', author: 'David & Karen Pierce', role: 'Home Sellers', stars: 5 }, { quote: 'As first-time buyers, we were terrified. Our agent held our hand through every step. Dream home found!', author: 'Tyler & Jessica Marsh', role: 'First-Time Buyers', stars: 5 }, { quote: 'Sold our old home and bought new within 6 weeks. Flawless coordination. Cannot recommend enough.', author: 'Sandra Chen', role: 'Buy & Sell Client', stars: 5 }] }), mk('form', 'Talk to an Agent Today — Free', { bgColor: '#f0f9ff', buttonColor: '#1e3a5f', buttonText: 'Connect With an Agent →', formFields: [{ label: 'Your Name', type: 'text', required: true }, { label: 'Email Address', type: 'email', required: true }, { label: 'Phone Number', type: 'phone', required: true }, { label: 'Buying, Selling, or Both?', type: 'text', required: false }] }), mk('footer', '', { navLogo: 'LuxRealty' })] }] },

  { id: 'restaurant', name: 'Restaurant & Dining', category: 'Food & Dining', emoji: '🍽️', heroColor: 'linear-gradient(135deg,#78350f,#f59e0b)', desc: 'Upscale restaurant website with menu showcase and reservations.', pages: [{ name: 'Restaurant', type: 'landing', blocks: [mk('navbar', '', { bgColor: '#1c0a00', textColor: '#fef3c7', navLogo: 'Bistro & Co.', buttonText: 'Reserve a Table', buttonColor: '#f59e0b', buttonTextColor: '#1c0a00' }), mk('hero', 'Where Every Meal Becomes a Memory', { bgGradient: 'linear-gradient(135deg,#1c0a00,#451a03)', subheading: 'Fine dining crafted from locally-sourced ingredients. A culinary journey through seasonal flavors in an atmosphere that feels like home.', buttonText: 'Reserve Your Table', buttonColor: '#f59e0b', buttonTextColor: '#1c0a00', secondaryButtonText: 'View Full Menu' }), mk('features', 'The Bistro Experience', { bgColor: '#fffbeb', featureItems: [{ icon: '🌿', title: 'Farm-to-Table', desc: 'Every ingredient sourced within 50 miles. Fresh, seasonal, and sustainably farmed.' }, { icon: '👨‍🍳', title: 'Master Chef', desc: 'Award-winning Executive Chef with 20 years at Michelin-starred restaurants.' }, { icon: '🍷', title: 'Curated Wine List', desc: '200+ wines from boutique vineyards worldwide. Sommelier-guided pairings.' }, { icon: '🎂', title: 'Special Occasions', desc: 'Private dining rooms, custom menus, and florals for your most special moments.' }, { icon: '🌍', title: 'International Flavors', desc: 'A rotating seasonal menu inspired by culinary traditions from around the world.' }, { icon: '♿', title: 'Fully Accessible', desc: 'Wheelchair accessible throughout. Dietary accommodations always available.' }] }), mk('testimonials', 'What Our Guests Are Saying', { bgColor: '#fffbeb', testimonialItems: [{ quote: 'Best meal of my life. The truffle risotto made me cry happy tears. We will return every anniversary.', author: 'Catherine & James Moore', role: 'Regular Guests', stars: 5 }, { quote: 'Hosted our company dinner for 20. Chef came out and discussed the menu personally. Extraordinary.', author: 'Raymond Zhang', role: 'Corporate Dinner', stars: 5 }, { quote: 'The tasting menu is a religious experience. 7 courses of perfection from start to finish.', author: 'Isabella Romano', role: 'First Visit', stars: 5 }] }), mk('stats', '', { bgColor: '#451a03', statItems: [{ value: '2', label: 'Michelin Stars', icon: '⭐' }, { value: '18yr', label: 'Serving Our Community', icon: '🏠' }, { value: '4.9★', label: 'TripAdvisor Rating', icon: '🌍' }, { value: '50K+', label: 'Happy Guests', icon: '😊' }] }), mk('form', 'Reserve Your Table', { bgColor: '#fffbeb', buttonColor: '#78350f', buttonText: 'Confirm Reservation →', formFields: [{ label: 'Your Name', type: 'text', required: true }, { label: 'Email Address', type: 'email', required: true }, { label: 'Phone Number', type: 'phone', required: true }, { label: 'Party Size', type: 'text', required: true }] }), mk('footer', '', { bgColor: '#1c0a00', navLogo: 'Bistro & Co.' })] }] },

  /* ── Funnels ── */
  { id: 'lead-magnet', name: 'Lead Magnet Funnel', category: 'Funnel', emoji: '🎯', heroColor: 'linear-gradient(135deg,#22c55e,#16a34a)', desc: 'High-converting lead capture funnel for a free resource.', pages: [{ name: 'Opt-in', type: 'optin', blocks: [mk('hero', 'FREE Guide: 10 Secrets to 10x Your Revenue in 90 Days', { bgGradient: 'linear-gradient(135deg,#16a34a,#0f766e)', subheading: 'Join 75,000+ entrepreneurs using these strategies. Download instantly. No credit card ever.', buttonText: '⬇ Yes! Send Me the Free Guide', secondaryButtonText: undefined }), mk('stats', '', { bgColor: '#f0fdf4', textColor: '#0f172a', statItems: [{ value: '75K+', label: 'Downloads', icon: '📥' }, { value: '4.9★', label: 'Average Rating', icon: '⭐' }, { value: '15 min', label: 'Quick Read', icon: '⚡' }] }), mk('columns', "Inside the Free Guide:", { subheading: 'The exact playbook used by 7-figure entrepreneurs — never shared publicly until now.', listItems: ['The silent conversion killer 90% of businesses ignore', '3-step framework to qualify and close leads faster', 'Email sequences that average 42% open rates', 'The "10x lever" that multiplies revenue without more traffic'], buttonText: 'Get Instant Access →', buttonColor: '#22c55e' }), mk('form', 'Where Should We Send Your Guide?', { bgColor: '#f0fdf4', buttonColor: '#16a34a', buttonText: '⬇ Get Free Instant Access →', formFields: [{ label: 'First Name', type: 'text', required: true }, { label: 'Email Address', type: 'email', required: true }] }), mk('text', '🔒 100% private. Never spammed. Unsubscribe anytime.', { color: '#94a3b8', align: 'center', size: 'sm' })] }] },

  { id: 'product-launch', name: 'Product Launch', category: 'Funnel', emoji: '🔥', heroColor: 'linear-gradient(135deg,#f97316,#ef4444)', desc: 'Build hype and urgency with countdown and early bird offer.', pages: [{ name: 'Launch', type: 'landing', blocks: [mk('hero', 'Introducing the Tool That Changes Everything', { bgGradient: 'linear-gradient(135deg,#18181b,#3f1f00)', subheading: 'After 2 years of development and 10,000+ beta testers — we\'re finally launching. Early bird pricing expires at midnight.', buttonText: '⚡ Claim Early Bird Pricing', buttonColor: '#f97316', secondaryButtonText: 'See What\'s Inside' }), mk('countdown', '🔥 Early Bird Pricing Ends In:', { bgColor: '#f97316', textColor: '#ffffff', subheading: '67% OFF for the first 1,000 customers only. 412 spots remaining.' }), mk('features', 'Why 10,000+ Beta Testers Love It', { featureItems: [{ icon: '🚀', title: '10x Faster Results', desc: 'Our AI-powered engine delivers in minutes what used to take weeks of manual work.' }, { icon: '🤖', title: 'AI at Its Core', desc: 'Not bolted-on AI — built from the ground up to be intelligent from day one.' }, { icon: '🔗', title: 'Connects Everything', desc: 'Integrates with your existing stack in seconds. No migration headaches.' }], columns: 3 }), mk('testimonials', 'What Beta Testers Are Saying', { bgColor: '#18181b', testimonialItems: [{ quote: 'Used it for 3 weeks in beta. Cancelled 4 other subscriptions immediately after. This is the one.', author: 'Alex Mercer', role: 'Founding Beta Tester', stars: 5 }, { quote: 'The ROI in the first month was insane. Genuinely can\'t imagine my workflow without it anymore.', author: 'Priya Kapoor', role: 'Beta User — 8 weeks', stars: 5 }, { quote: 'I\'ve tested 40+ tools in this space. Nothing comes remotely close to what this team built.', author: 'Tyler Brooks', role: 'Product Manager', stars: 5 }] }), mk('pricing', 'Early Bird Pricing — Today Only', { subtitle: 'Regular price is $297/month. Early bird locks you in forever.', pricingPlans: [{ name: 'Early Bird', price: '$97', period: '/month', features: ['Locked in forever', 'All current features', 'All future updates', 'Founding member badge', 'Priority support'], highlighted: true, buttonText: 'Claim My Spot →' }] }), mk('cta', 'This Price Disappears at Midnight', { bgGradient: 'linear-gradient(135deg,#f97316,#ef4444)', subheading: 'Once 1,000 founding members claim their spots, price goes to $297/month. Forever. No exceptions.', buttonText: '⚡ Claim Early Bird Now', buttonColor: '#fff', buttonTextColor: '#f97316' })] }] },

  { id: 'webinar-reg', name: 'Webinar Registration', category: 'Funnel', emoji: '🎤', heroColor: 'linear-gradient(135deg,#0ea5e9,#6366f1)', desc: 'Professional webinar sign-up with speaker bio and social proof.', pages: [{ name: 'Register', type: 'webinar', blocks: [mk('hero', 'FREE Masterclass: How to Scale to $1M Without Burning Out', { bgGradient: 'linear-gradient(135deg,#0ea5e9,#6366f1)', subheading: '📅 Live Thursday at 2:00 PM EST · 90 Minutes · Q&A Included · Replay Available for 48hrs', buttonText: '👆 Reserve My Free Spot →' }), mk('features', "What You\'ll Walk Away With:", { bgColor: '#f8fafc', columns: 2, featureItems: [{ icon: '📈', title: 'The $1M Revenue Blueprint', desc: 'Exact step-by-step system to reach your first million ARR in 12-18 months.' }, { icon: '🤖', title: 'AI Automation Playbook', desc: 'How to automate 40% of your work so you can scale without burning out.' }, { icon: '💰', title: 'Funding vs Bootstrapping', desc: 'The honest framework to decide which path is right for your specific business.' }, { icon: '❓', title: 'Live Q&A With the Expert', desc: 'Bring your toughest business questions and get real answers live on the call.' }] }), mk('columns', 'Your Host: Alexandra Chen', { subheading: '3x founder, 2 successful exits. Featured in Forbes 30 Under 30, TechCrunch, and Bloomberg. Now she teaches founders what schools never taught her.', imagePosition: 'left', imageUrl: '#6366f1', listItems: ['Built and sold 2 SaaS companies for $8M+', 'Raised $12M in venture capital', 'Forbes 30 Under 30 in Tech', 'Current advisor to 20+ startups'] }), mk('form', 'Reserve Your Free Seat Now:', { bgColor: '#eff6ff', buttonColor: '#6366f1', buttonText: '✅ Save My Seat — It\'s Free →', formFields: [{ label: 'First Name', type: 'text', required: true }, { label: 'Email Address', type: 'email', required: true }] }), mk('stats', '', { bgColor: '#0f172a', statItems: [{ value: '22K+', label: 'Past Attendees', icon: '👥' }, { value: '96%', label: 'Would Attend Again', icon: '❤️' }, { value: '90 Min', label: 'Packed Value', icon: '⏱️' }, { value: 'FREE', label: 'No Credit Card', icon: '🎁' }] })] }] },

  /* ── Portfolio ── */
  { id: 'freelancer', name: 'Freelancer Portfolio', category: 'Portfolio', emoji: '✨', heroColor: 'linear-gradient(135deg,#6366f1,#ec4899)', desc: 'Modern freelancer portfolio for designers, devs, and writers.', pages: [{ name: 'Portfolio', type: 'landing', blocks: [mk('navbar', '', { navLogo: 'Alex.Studio', buttonText: 'Hire Me', buttonColor: '#6366f1' }), mk('hero', "Hi, I'm Alex — I Build Things People Love.", { bgGradient: 'linear-gradient(135deg,#6366f1,#ec4899)', subheading: 'Full-stack designer & developer crafting beautiful products for startups and Fortune 500 companies. Available for new projects.', buttonText: 'View My Work ↓', buttonColor: '#fff', buttonTextColor: '#6366f1', secondaryButtonText: 'Download Resume' }), mk('stats', '', { bgColor: '#f5f3ff', textColor: '#0f172a', statItems: [{ value: '60+', label: 'Projects Shipped', icon: '🚀' }, { value: '8yr', label: 'Experience', icon: '💼' }, { value: '$12M+', label: 'Revenue for Clients', icon: '💰' }, { value: '100%', label: 'On-Time Delivery', icon: '✅' }] }), mk('gallery', 'Selected Work', { subtitle: '60+ projects spanning SaaS, eCommerce, mobile apps, and brand identity', galleryImages: ['#6366f1', '#ec4899', '#f59e0b', '#0891b2', '#22c55e', '#f97316', '#8b5cf6', '#0ea5e9', '#14b8a6'], columns: 3 }), mk('features', 'What I Do Best', { featureItems: [{ icon: '🎨', title: 'Product Design', desc: 'End-to-end design from user research to pixel-perfect Figma handoff.' }, { icon: '⚛️', title: 'Frontend Dev', desc: 'React, Next.js, TypeScript. Performant, accessible, production-ready.' }, { icon: '🗄️', title: 'Full-Stack', desc: 'Node.js, PostgreSQL, serverless. I build things that actually scale.' }, { icon: '📱', title: 'Mobile Apps', desc: 'React Native apps for iOS and Android that users actually enjoy using.' }, { icon: '🔍', title: 'Technical SEO', desc: 'Core Web Vitals, structured data, and performance optimization.' }, { icon: '🤖', title: 'AI Integration', desc: 'Integrate AI features into your product using OpenAI, Claude, and more.' }] }), mk('testimonials', 'What Clients Say', { testimonialItems: [{ quote: 'Alex delivered a product that exceeded our expectations in half the time we budgeted. Incredible.', author: 'Marcus Reid', role: 'CEO, StartupX', stars: 5 }, { quote: 'The best freelancer I\'ve ever worked with. Communicates like a senior employee, delivers like a rockstar.', author: 'Natalie Brooks', role: 'CPO, GrowthApp', stars: 5 }, { quote: 'Our conversion rate went up 67% after Alex redesigned our landing pages. ROI was 40x.', author: 'Leon Torres', role: 'Founder, ShopScale', stars: 5 }] }), mk('pricing', 'Project Packages', { pricingPlans: [{ name: 'Landing Page', price: '$2,500', period: 'one-time', features: ['1-page website', 'Mobile responsive', 'Performance optimized', 'Delivered in 1 week'], highlighted: false, buttonText: 'Get Started' }, { name: 'Full Product', price: '$8,500', period: 'per project', features: ['Full web app or site', 'Design + development', 'Testing & QA', '3 revision rounds', '30-day support'], highlighted: true, buttonText: 'Most Popular' }, { name: 'Retainer', price: '$4,000', period: '/month', features: ['40 hrs/month dedicated', 'Priority availability', 'Ongoing dev & design', 'Weekly calls'], highlighted: false, buttonText: 'Book Retainer' }] }), mk('form', "Let's Build Something Great", { bgColor: '#f5f3ff', buttonColor: '#6366f1', buttonText: "Send a Project Inquiry →", formFields: [{ label: 'Your Name', type: 'text', required: true }, { label: 'Email Address', type: 'email', required: true }, { label: 'Project Budget', type: 'text', required: false }, { label: 'Tell Me About Your Project', type: 'text', required: true }] }), mk('footer', '', { navLogo: 'Alex.Studio' })] }] },

  { id: 'consulting', name: 'Consulting Firm', category: 'Business', emoji: '💼', heroColor: 'linear-gradient(135deg,#1e3a5f,#0f172a)', desc: 'Premium B2B consulting firm with authority-building layout.', pages: [{ name: 'Home', type: 'landing', blocks: [mk('navbar', '', { bgColor: '#0c1f3f', textColor: '#ffffff', navLogo: 'Apex Consulting', buttonText: 'Book Strategy Call', buttonColor: '#f59e0b', buttonTextColor: '#0f172a' }), mk('hero', 'We Scale B2B Revenue From $1M to $10M+', { bgGradient: 'linear-gradient(135deg,#0c1f3f,#0f172a)', subheading: 'Proven go-to-market strategy, revenue operations, and sales enablement for ambitious B2B companies ready to dominate their market.', buttonText: 'Book a Free Strategy Call', buttonColor: '#f59e0b', buttonTextColor: '#0f172a' }), mk('stats', '', { bgColor: '#f59e0b', textColor: '#0f172a', statItems: [{ value: '300+', label: 'Companies Scaled', icon: '📈' }, { value: '$3.2B', label: 'Revenue Generated', icon: '💰' }, { value: '20yr', label: 'Combined Experience', icon: '🏆' }, { value: '95%', label: 'Client Renewal Rate', icon: '❤️' }] }), mk('features', 'How We Drive Revenue', { bgColor: '#f8fafc', featureItems: [{ icon: '🎯', title: 'GTM Strategy', desc: 'Proven go-to-market playbooks that generate qualified pipeline consistently.' }, { icon: '📊', title: 'Revenue Operations', desc: 'Align your entire revenue team and eliminate the gaps leaking money.' }, { icon: '🤝', title: 'Sales Enablement', desc: 'Tools, playbooks, and coaching so every rep performs like your best rep.' }, { icon: '🔍', title: 'Market Intelligence', desc: 'Deep competitive analysis so you always know exactly where to focus.' }, { icon: '🚀', title: 'Demand Generation', desc: 'Multi-channel programs that fill your pipeline with qualified enterprise buyers.' }, { icon: '📈', title: 'Account Expansion', desc: 'Systematic land-and-expand strategies to maximize lifetime customer value.' }] }), mk('testimonials', 'What Our Clients Say', { testimonialItems: [{ quote: 'Revenue doubled in 9 months. Apex identified gaps our internal team had missed for years.', author: 'Robert Hayes', role: 'CEO, SaaSify ($12M ARR)', stars: 5 }, { quote: 'The GTM strategy they built for us became our entire competitive advantage for 3 years.', author: 'Sandra Wu', role: 'VP Sales, DataPlex', stars: 5 }, { quote: 'Closed our first enterprise deal 6 weeks after engagement. Changed the trajectory of our company.', author: 'Mark Jensen', role: 'Founder, TechOps Inc.', stars: 5 }] }), mk('form', 'Book a Free 30-Min Strategy Call', { bgColor: '#f8fafc', buttonColor: '#0c1f3f', buttonText: 'Schedule My Strategy Call →', formFields: [{ label: 'Full Name', type: 'text', required: true }, { label: 'Work Email', type: 'email', required: true }, { label: 'Current Annual Revenue', type: 'text', required: false }, { label: 'Biggest Revenue Challenge', type: 'text', required: false }] }), mk('footer', '', { navLogo: 'Apex Consulting', bgColor: '#0c1f3f' })] }] },

  { id: 'event-conf', name: 'Event & Conference', category: 'Events', emoji: '🎪', heroColor: 'linear-gradient(135deg,#7c3aed,#1e1b4b)', desc: 'Premium conference page with countdown, speakers, and pricing.', pages: [{ name: 'Event', type: 'landing', blocks: [mk('hero', 'ScaleConf 2026: Where Founders Break Through', { bgGradient: 'linear-gradient(135deg,#1e1b4b,#7c3aed)', subheading: '📍 New York City · March 14-15, 2026 · 3,000 Founders & Leaders · 50+ World-Class Speakers', buttonText: 'Get Your Ticket Now', buttonColor: '#f59e0b', buttonTextColor: '#0f172a', secondaryButtonText: 'View Speakers' }), mk('countdown', '⏰ Early Bird Ends In:', { bgColor: '#7c3aed', textColor: '#ffffff', subheading: 'Save $500 on your ticket before early bird pricing expires.' }), mk('features', 'An Experience Unlike Any Other', { bgColor: '#f5f3ff', featureItems: [{ icon: '🎤', title: '50 World-Class Speakers', desc: 'CEOs, founders, investors, and innovators sharing what actually works.' }, { icon: '🤝', title: 'Elite Networking', desc: 'Curated networking sessions designed to create lasting business relationships.' }, { icon: '🔬', title: 'Deep-Dive Workshops', desc: '8 intensive workshops covering growth, fundraising, product, and team building.' }, { icon: '🎯', title: 'Investor Pitch Day', desc: 'Pitch your company to 30 top-tier VCs competing to invest on day two.' }, { icon: '🎊', title: 'Founders Gala', desc: 'Evening gala at NYC\'s most iconic venue. Black-tie. Unforgettable.' }, { icon: '📱', title: 'Event App', desc: 'AI-powered networking app that connects you with exactly the right people.' }] }), mk('testimonials', 'Why Founders Keep Coming Back', { bgColor: '#1e1b4b', testimonialItems: [{ quote: 'Made a business partner at ScaleConf who is now our biggest investor. Paid for itself 100x over.', author: 'Jennifer Wu', role: 'Founder, AIScale — Attended 2024', stars: 5 }, { quote: 'The keynotes alone were worth the ticket. But the hallway conversations changed my life.', author: 'Daniel Park', role: 'CEO, TechVenture — 3x Attendee', stars: 5 }, { quote: 'Raised our Series A 3 months after meeting our lead investor at ScaleConf.', author: 'Sarah Mitchell', role: 'Founder, DataFirst', stars: 5 }] }), mk('pricing', 'Choose Your Experience', { pricingPlans: [{ name: 'General', price: '$697', period: '', features: ['2-day full access', 'All keynotes', 'Networking sessions', 'Recording access', 'Event app'], highlighted: false, buttonText: 'Get General' }, { name: 'VIP', price: '$1,497', period: '', features: ['Everything General', 'VIP dinner with speakers', 'Workshop priority seating', 'Investor Pitch Day', 'Founders Gala ticket'], highlighted: true, buttonText: 'Get VIP' }, { name: 'Platinum', price: '$4,997', period: '', features: ['Table of 5', 'Private speaker dinner', 'Keynote co-presentation option', 'Brand visibility package'], highlighted: false, buttonText: 'Get Platinum' }] }), mk('cta', 'See You in New York', { bgGradient: 'linear-gradient(135deg,#7c3aed,#6366f1)', subheading: 'Tickets sell out every year. Don\'t miss out — 78% already claimed.', buttonText: 'Get My Ticket Now', buttonColor: '#f59e0b', buttonTextColor: '#0f172a' }), mk('footer', '', { bgColor: '#0f0e1a', navLogo: 'ScaleConf' })] }] },
];

const CATALOG: { category: string; icon: string; blocks: { type: BlockType; label: string; emoji: string; color: string }[] }[] = [
  { category: 'Text', icon: '✍️', blocks: [
    { type: 'heading', label: 'Heading', emoji: 'H1', color: '#0f172a' },
    { type: 'text', label: 'Paragraph', emoji: '¶', color: '#64748b' },
    { type: 'button', label: 'Button', emoji: '▶', color: '#6366f1' },
  ]},
  { category: 'Media', icon: '🎬', blocks: [
    { type: 'image', label: 'Image', emoji: '🖼', color: '#f59e0b' },
    { type: 'video', label: 'Video', emoji: '▶️', color: '#ef4444' },
    { type: 'gallery', label: 'Gallery', emoji: '🗂', color: '#0891b2' },
  ]},
  { category: 'Sections', icon: '🏗️', blocks: [
    { type: 'hero', label: 'Hero', emoji: '🦸', color: '#6366f1' },
    { type: 'features', label: 'Features', emoji: '⚡', color: '#3b82f6' },
    { type: 'testimonials', label: 'Testimonials', emoji: '💬', color: '#8b5cf6' },
    { type: 'pricing', label: 'Pricing', emoji: '💰', color: '#22c55e' },
    { type: 'columns', label: '2 Columns', emoji: '◼◼', color: '#f59e0b' },
    { type: 'cta', label: 'CTA', emoji: '📣', color: '#ec4899' },
    { type: 'stats', label: 'Stats', emoji: '📊', color: '#06b6d4' },
    { type: 'faq', label: 'FAQ', emoji: '❓', color: '#84cc16' },
    { type: 'gallery', label: 'Gallery', emoji: '🖼️', color: '#f97316' },
  ]},
  { category: 'Navigation', icon: '🧭', blocks: [
    { type: 'navbar', label: 'Navbar', emoji: '🔝', color: '#374151' },
    { type: 'footer', label: 'Footer', emoji: '🔚', color: '#374151' },
  ]},
  { category: 'Forms & Tools', icon: '📋', blocks: [
    { type: 'form', label: 'Lead Form', emoji: '📋', color: '#6366f1' },
    { type: 'countdown', label: 'Countdown', emoji: '⏱', color: '#ef4444' },
  ]},
  { category: 'Layout', icon: '📐', blocks: [
    { type: 'divider', label: 'Divider', emoji: '—', color: '#94a3b8' },
    { type: 'spacer', label: 'Spacer', emoji: '↕', color: '#cbd5e1' },
  ]},
];

// ─── DROP ZONE ────────────────────────────────────────────────────────────────
function DropZone({ index, active, onOver, onDrop }: { index: number; active: boolean; onOver: (i: number) => void; onDrop: (i: number) => void }) {
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onOver(index); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(index); }}
      style={{ height: active ? 52 : 6, background: active ? '#eff6ff' : 'transparent', borderTop: active ? '2px solid #6366f1' : '2px solid transparent', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {active && <span style={{ fontSize: 12, color: '#6366f1', fontWeight: 600 }}>Drop here</span>}
    </div>
  );
}

// ─── BLOCK RENDERER ────────────────────────────────────────────────────────────
function BlockRender({ block }: { block: FunnelBlock }) {
  const s = block.settings;
  const bg = s.bgGradient || (s.bgColor ?? 'transparent');
  const pad = `${s.padding ?? 16}px`;

  switch (block.type) {
    case 'navbar': return (
      <nav style={{ background: s.bgColor ?? '#fff', padding: '0 40px', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: s.textColor ?? '#0f172a', letterSpacing: '-0.5px' }}>{s.navLogo ?? 'YourBrand'}</div>
        <div style={{ display: 'flex', gap: 28 }}>
          {(s.navLinks ?? []).map((l, i) => <a key={i} href={l.url} style={{ fontSize: 14, color: s.textColor ?? '#374151', textDecoration: 'none', fontWeight: 500 }}>{l.label}</a>)}
        </div>
        {s.buttonText && <button style={{ padding: '9px 20px', background: s.buttonColor ?? '#6366f1', color: s.buttonTextColor ?? '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{s.buttonText}</button>}
      </nav>
    );

    case 'hero': return (
      <section style={{ background: bg, minHeight: s.minHeight ?? 520, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: `${s.padding ?? 80}px 40px`, position: 'relative', overflow: 'hidden' }}>
        {s.bgImage && <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${s.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />}
        {s.overlay && <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${s.overlayOpacity ?? 0.5})` }} />}
        <div style={{ position: 'relative', textAlign: s.align ?? 'center', maxWidth: 860, width: '100%' }}>
          <h1 style={{ fontSize: 54, fontWeight: 900, color: s.textColor ?? '#fff', lineHeight: 1.1, margin: '0 0 20px', letterSpacing: '-1px' }}>{block.content}</h1>
          {s.subheading && <p style={{ fontSize: 20, color: `${s.textColor ?? '#fff'}cc`, marginBottom: 36, lineHeight: 1.7 }}>{s.subheading}</p>}
          <div style={{ display: 'flex', gap: 14, justifyContent: s.align === 'left' ? 'flex-start' : s.align === 'right' ? 'flex-end' : 'center', flexWrap: 'wrap' }}>
            <button style={{ padding: '15px 34px', background: s.buttonColor ?? '#fff', color: s.buttonTextColor ?? '#6366f1', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>{s.buttonText ?? 'Get Started'}</button>
            {s.secondaryButtonText && <button style={{ padding: '15px 34px', background: 'transparent', color: s.textColor ?? '#fff', border: '2px solid rgba(255,255,255,0.45)', borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>{s.secondaryButtonText}</button>}
          </div>
        </div>
      </section>
    );

    case 'features': return (
      <section style={{ background: bg, padding: `${s.padding ?? 80}px 40px` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: s.align ?? 'center' }}>
          <h2 style={{ fontSize: 38, fontWeight: 800, color: s.textColor ?? '#0f172a', marginBottom: 12, letterSpacing: '-0.5px' }}>{block.content}</h2>
          {s.subtitle && <p style={{ fontSize: 18, color: '#64748b', marginBottom: 52, lineHeight: 1.7 }}>{s.subtitle}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${s.columns ?? 3}, 1fr)`, gap: 24 }}>
            {(s.featureItems ?? []).map((f, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 16, padding: 28, textAlign: 'left', border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: `${s.iconColor ?? '#6366f1'}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, marginBottom: 16 }}>{f.icon}</div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', marginBottom: 8, margin: '0 0 8px' }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    );

    case 'testimonials': return (
      <section style={{ background: bg, padding: `${s.padding ?? 80}px 40px` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 38, fontWeight: 800, color: s.textColor ?? '#0f172a', marginBottom: 12 }}>{block.content}</h2>
          {s.subtitle && <p style={{ fontSize: 18, color: s.textColor ? `${s.textColor}99` : '#64748b', marginBottom: 52 }}>{s.subtitle}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            {(s.testimonialItems ?? []).slice(0, 3).map((t, i) => (
              <div key={i} style={{ background: s.bgColor === '#0f172a' ? '#1e293b' : '#f8fafc', borderRadius: 18, padding: 28, textAlign: 'left', border: `1px solid ${s.bgColor === '#0f172a' ? '#334155' : '#e2e8f0'}` }}>
                <div style={{ color: '#f59e0b', marginBottom: 14, fontSize: 18, letterSpacing: 2 }}>{'★'.repeat(t.stars ?? 5)}</div>
                <p style={{ fontSize: 15, color: s.bgColor === '#0f172a' ? '#cbd5e1' : '#374151', lineHeight: 1.8, marginBottom: 20, fontStyle: 'italic' }}>"{t.quote}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: '50%', background: `hsl(${i * 80 + 200},60%,50%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>{t.author[0]}</div>
                  <div><div style={{ fontSize: 14, fontWeight: 700, color: s.bgColor === '#0f172a' ? '#f1f5f9' : '#0f172a' }}>{t.author}</div><div style={{ fontSize: 12, color: '#94a3b8' }}>{t.role}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );

    case 'pricing': return (
      <section style={{ background: bg, padding: `${s.padding ?? 80}px 40px` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 38, fontWeight: 800, color: s.textColor ?? '#0f172a', marginBottom: 12 }}>{block.content}</h2>
          {s.subtitle && <p style={{ fontSize: 18, color: '#64748b', marginBottom: 52 }}>{s.subtitle}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${(s.pricingPlans ?? []).length}, 1fr)`, gap: 24, maxWidth: 1000, margin: '0 auto' }}>
            {(s.pricingPlans ?? []).map((plan, i) => (
              <div key={i} style={{ background: plan.highlighted ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#fff', borderRadius: 22, padding: '36px 28px', border: plan.highlighted ? 'none' : '1px solid #e2e8f0', boxShadow: plan.highlighted ? '0 24px 60px rgba(99,102,241,0.35)' : '0 2px 12px rgba(0,0,0,0.04)', transform: plan.highlighted ? 'scale(1.05)' : 'none' }}>
                {plan.highlighted && <div style={{ fontSize: 12, fontWeight: 700, color: '#c7d2fe', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Most Popular</div>}
                <div style={{ fontSize: 16, fontWeight: 700, color: plan.highlighted ? '#e0e7ff' : '#64748b', marginBottom: 8 }}>{plan.name}</div>
                <div style={{ fontSize: 50, fontWeight: 900, color: plan.highlighted ? '#fff' : '#0f172a', lineHeight: 1, marginBottom: 4 }}>{plan.price}</div>
                {plan.period && <div style={{ fontSize: 14, color: plan.highlighted ? '#c7d2fe' : '#94a3b8', marginBottom: 28 }}>{plan.period}</div>}
                <div style={{ borderTop: `1px solid ${plan.highlighted ? '#a5b4fc' : '#e2e8f0'}`, paddingTop: 24, marginBottom: 28 }}>
                  {(plan.features ?? []).map((f, fi) => (
                    <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <span style={{ width: 20, height: 20, borderRadius: '50%', background: plan.highlighted ? 'rgba(255,255,255,0.2)' : '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: plan.highlighted ? '#fff' : '#16a34a', fontWeight: 700, flexShrink: 0 }}>✓</span>
                      <span style={{ fontSize: 14, color: plan.highlighted ? '#e0e7ff' : '#374151', textAlign: 'left' }}>{f}</span>
                    </div>
                  ))}
                </div>
                <button style={{ width: '100%', padding: 14, background: plan.highlighted ? '#fff' : '#6366f1', color: plan.highlighted ? '#6366f1' : '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>{plan.buttonText ?? 'Get Started'}</button>
              </div>
            ))}
          </div>
        </div>
      </section>
    );

    case 'columns': {
      const imgSide = (
        <div style={{ borderRadius: 20, overflow: 'hidden', background: s.imageUrl ? undefined : `linear-gradient(135deg,${s.buttonColor ?? '#6366f1'}33,${s.buttonColor ?? '#6366f1'}66)`, minHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {s.imageUrl ? <img src={s.imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" /> : <span style={{ fontSize: 64, opacity: 0.5 }}>🖼️</span>}
        </div>
      );
      const txtSide = (
        <div>
          <h2 style={{ fontSize: 38, fontWeight: 800, color: s.textColor ?? '#0f172a', marginBottom: 16, lineHeight: 1.15, letterSpacing: '-0.5px' }}>{block.content}</h2>
          {s.subheading && <p style={{ fontSize: 16, color: '#64748b', lineHeight: 1.8, marginBottom: 24 }}>{s.subheading}</p>}
          {(s.listItems ?? []).map((item, i) => <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}><span style={{ width: 22, height: 22, borderRadius: '50%', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#16a34a', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span><span style={{ fontSize: 15, color: '#374151', lineHeight: 1.6 }}>{item}</span></div>)}
          {s.buttonText && <button style={{ marginTop: 12, padding: '13px 28px', background: s.buttonColor ?? '#6366f1', color: s.buttonTextColor ?? '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>{s.buttonText}</button>}
        </div>
      );
      return (
        <section style={{ background: bg, padding: `${s.padding ?? 80}px 40px` }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
            {s.imagePosition === 'left' ? <>{imgSide}{txtSide}</> : <>{txtSide}{imgSide}</>}
          </div>
        </section>
      );
    }

    case 'cta': return (
      <section style={{ background: bg, padding: `${s.padding ?? 80}px 40px`, textAlign: s.align ?? 'center' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <h2 style={{ fontSize: 44, fontWeight: 900, color: s.textColor ?? '#fff', marginBottom: 16, lineHeight: 1.1, letterSpacing: '-1px' }}>{block.content}</h2>
          {s.subheading && <p style={{ fontSize: 18, color: `${s.textColor ?? '#fff'}bb`, marginBottom: 36, lineHeight: 1.7 }}>{s.subheading}</p>}
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button style={{ padding: '16px 36px', background: s.buttonColor ?? '#fff', color: s.buttonTextColor ?? '#6366f1', border: 'none', borderRadius: 10, fontSize: 17, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>{s.buttonText ?? 'Get Started'}</button>
            {s.secondaryButtonText && <button style={{ padding: '16px 36px', background: 'transparent', color: s.textColor ?? '#fff', border: '2px solid rgba(255,255,255,0.4)', borderRadius: 10, fontSize: 17, fontWeight: 600, cursor: 'pointer' }}>{s.secondaryButtonText}</button>}
          </div>
        </div>
      </section>
    );

    case 'stats': return (
      <section style={{ background: bg, padding: `${s.padding ?? 60}px 40px` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: `repeat(${(s.statItems ?? []).length}, 1fr)`, gap: 32, textAlign: 'center' }}>
          {(s.statItems ?? []).map((st, i) => (
            <div key={i}>
              {st.icon && <div style={{ fontSize: 32, marginBottom: 10 }}>{st.icon}</div>}
              <div style={{ fontSize: 44, fontWeight: 900, color: s.textColor ?? '#fff', lineHeight: 1 }}>{st.value}</div>
              <div style={{ fontSize: 14, color: s.bgColor === '#0f172a' ? '#94a3b8' : '#64748b', marginTop: 8, fontWeight: 500 }}>{st.label}</div>
            </div>
          ))}
        </div>
      </section>
    );

    case 'faq': return (
      <section style={{ background: bg, padding: `${s.padding ?? 80}px 40px` }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <h2 style={{ fontSize: 38, fontWeight: 800, color: s.textColor ?? '#0f172a', marginBottom: 12, textAlign: s.align ?? 'left' }}>{block.content}</h2>
          {s.subtitle && <p style={{ fontSize: 16, color: '#64748b', marginBottom: 40, textAlign: s.align ?? 'left' }}>{s.subtitle}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(s.faqItems ?? []).map((f, i) => (
              <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '18px 22px', background: '#f8fafc', fontWeight: 600, color: '#0f172a', fontSize: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {f.q}<span style={{ color: '#6366f1', fontSize: 20, fontWeight: 300, marginLeft: 12 }}>+</span>
                </div>
                <div style={{ padding: '14px 22px', fontSize: 14, color: '#64748b', lineHeight: 1.8, background: '#fff' }}>{f.a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );

    case 'gallery': return (
      <section style={{ background: bg, padding: `${s.padding ?? 60}px 40px` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontSize: 38, fontWeight: 800, color: s.textColor ?? '#0f172a', marginBottom: 10, textAlign: 'center' }}>{block.content}</h2>
          {s.subtitle && <p style={{ fontSize: 18, color: '#64748b', marginBottom: 40, textAlign: 'center' }}>{s.subtitle}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${s.columns ?? 3}, 1fr)`, gap: 16 }}>
            {(s.galleryImages ?? ['#e0e7ff', '#ddd6fe', '#fce7f3', '#fee2e2', '#d1fae5', '#fef3c7']).map((c, i) => (
              <div key={i} style={{ aspectRatio: '4/3', background: c.startsWith('#') ? c : '#e2e8f0', borderRadius: 14, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>
                {c.startsWith('http') ? <img src={c} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : '📷'}
              </div>
            ))}
          </div>
        </div>
      </section>
    );

    case 'footer': return (
      <footer style={{ background: s.bgColor ?? '#0f172a', padding: `${s.padding ?? 60}px 40px 40px` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `2fr ${(s.footerColumns ?? []).map(() => '1fr').join(' ')}`, gap: 48, marginBottom: 48, paddingBottom: 40, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 12 }}>{s.navLogo ?? 'YourBrand'}</div>
              <p style={{ fontSize: 14, color: s.textColor ?? '#94a3b8', lineHeight: 1.8, maxWidth: 220 }}>Building the future, one product at a time.</p>
            </div>
            {(s.footerColumns ?? []).map((col, i) => (
              <div key={i}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{col.heading}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(col.links ?? []).map((link, j) => <a key={j} href={link.url} style={{ fontSize: 14, color: s.textColor ?? '#94a3b8', textDecoration: 'none' }}>{link.label}</a>)}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 13, color: '#4b5563' }}>{s.footerCopyright ?? `© ${new Date().getFullYear()} YourBrand Inc.`}</div>
        </div>
      </footer>
    );

    case 'heading': {
      const sz: Record<string, string> = { sm: '20px', md: '28px', lg: '36px', xl: '48px' };
      return <div style={{ padding: pad, textAlign: s.align ?? 'center' }}><h1 style={{ fontSize: sz[s.size ?? 'xl'], fontWeight: Number(s.fontWeight ?? 700), color: s.color ?? '#0f172a', margin: 0, lineHeight: 1.2 }}>{block.content}</h1></div>;
    }
    case 'text': {
      const sz: Record<string, string> = { sm: '13px', md: '15px', lg: '18px', xl: '22px' };
      return <div style={{ padding: pad, textAlign: s.align ?? 'left' }}><p style={{ fontSize: sz[s.size ?? 'md'], color: s.color ?? '#64748b', lineHeight: 1.8, margin: 0 }}>{block.content}</p></div>;
    }
    case 'button': return (
      <div style={{ padding: pad, textAlign: s.align ?? 'center' }}>
        <button style={{ padding: '13px 30px', background: s.buttonColor ?? '#6366f1', color: s.buttonTextColor ?? '#fff', border: 'none', borderRadius: s.borderRadius ?? 8, fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>{block.content}</button>
      </div>
    );
    case 'image': return (
      <div style={{ padding: pad, textAlign: s.align ?? 'center' }}>
        {s.imageUrl ? <img src={s.imageUrl} alt={s.imageAlt ?? ''} style={{ maxWidth: '100%', borderRadius: s.borderRadius ?? 0, boxShadow: s.shadow ? '0 8px 32px rgba(0,0,0,0.15)' : 'none' }} /> : <div style={{ background: '#e2e8f0', borderRadius: 12, padding: 60, display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: '#94a3b8', minWidth: 280 }}><span style={{ fontSize: 48 }}>🖼️</span><span style={{ fontSize: 14 }}>Image URL not set</span></div>}
      </div>
    );
    case 'video': return (
      <div style={{ padding: pad }}>
        <div style={{ background: '#0f172a', borderRadius: 14, aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', maxWidth: 800, margin: '0 auto' }}>
          {s.url ? <iframe src={s.url} style={{ width: '100%', height: '100%', border: 'none' }} title="video" allow="autoplay" /> : <div style={{ textAlign: 'center', color: '#94a3b8' }}><div style={{ fontSize: 56, marginBottom: 12 }}>▶️</div><div style={{ fontSize: 15 }}>Paste a YouTube or Vimeo embed URL</div></div>}
        </div>
      </div>
    );
    case 'form': return (
      <div style={{ background: bg, padding: `${s.padding ?? 48}px 40px` }}>
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          <h3 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginBottom: 24, textAlign: 'center' }}>{block.content}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(s.formFields ?? []).map((f, i) => (
              <div key={i}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>{f.label}{f.required && <span style={{ color: '#ef4444' }}> *</span>}</label>
                <input type={f.type} placeholder={`Enter your ${f.label.toLowerCase()}`} style={{ width: '100%', padding: '11px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} readOnly />
              </div>
            ))}
          </div>
          <button style={{ width: '100%', marginTop: 20, padding: '14px', background: s.buttonColor ?? '#6366f1', color: s.buttonTextColor ?? '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>{s.buttonText ?? 'Submit'}</button>
        </div>
      </div>
    );
    case 'divider': return <div style={{ padding: `${s.padding ?? 16}px 40px` }}><hr style={{ border: 'none', borderTop: `1px solid ${s.color ?? '#e2e8f0'}`, margin: 0 }} /></div>;
    case 'spacer': return <div style={{ height: s.padding ?? 60 }} />;
    case 'countdown': return (
      <section style={{ background: bg, padding: `${s.padding ?? 60}px 40px`, textAlign: s.align ?? 'center' }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: s.textColor ?? '#fff', marginBottom: 8 }}>{block.content}</h2>
        {s.subheading && <p style={{ fontSize: 15, color: `${s.textColor ?? '#fff'}aa`, marginBottom: 32 }}>{s.subheading}</p>}
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          {['14', '23', '47', '12'].map((n, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: '18px 24px', minWidth: 80, backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}>
              <div style={{ fontSize: 44, fontWeight: 900, color: s.textColor ?? '#fff', lineHeight: 1 }}>{n}</div>
              <div style={{ fontSize: 12, color: `${s.textColor ?? '#fff'}99`, marginTop: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{['Days', 'Hours', 'Mins', 'Secs'][i]}</div>
            </div>
          ))}
        </div>
      </section>
    );
    default: return <div style={{ padding: 20, background: '#f8fafc', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Block: {block.type}</div>;
  }
}

interface CanvasBlockProps {
  block: FunnelBlock; selected: boolean; preview: boolean;
  onClick: () => void; onDragStart: () => void; isDragging: boolean;
  onDelete: () => void; onDuplicate: () => void; onMoveUp: () => void; onMoveDown: () => void;
}
function CanvasBlock({ block, selected, preview, onClick, onDragStart, isDragging, onDelete, onDuplicate, onMoveUp, onMoveDown }: CanvasBlockProps) {
  return (
    <div
      draggable={!preview}
      onDragStart={(e) => { e.stopPropagation(); onDragStart(); }}
      onClick={(e) => { e.stopPropagation(); if (!preview) onClick(); }}
      style={{ position: 'relative', opacity: isDragging ? 0.35 : 1, outline: selected && !preview ? '2px solid #6366f1' : '2px solid transparent', outlineOffset: -2, cursor: preview ? 'default' : 'pointer', transition: 'opacity 0.15s' }}
    >
      <BlockRender block={block} />
      {selected && !preview && (
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4, zIndex: 20 }}>
          {[
            { icon: '↑', title: 'Move Up', action: onMoveUp },
            { icon: '↓', title: 'Move Down', action: onMoveDown },
            { icon: '⧉', title: 'Duplicate', action: onDuplicate },
            { icon: '🗑', title: 'Delete', action: onDelete },
          ].map(btn => (
            <button key={btn.title} title={btn.title} onClick={(e) => { e.stopPropagation(); btn.action(); }}
              style={{ width: 32, height: 32, border: 'none', borderRadius: 6, background: btn.title === 'Delete' ? '#ef4444' : '#0f172a', color: '#fff', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
              {btn.icon}
            </button>
          ))}
        </div>
      )}
      {selected && !preview && (
        <div style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', background: '#6366f1', color: '#fff', borderRadius: 6, padding: '4px 6px', fontSize: 11, fontWeight: 700, zIndex: 20, textTransform: 'uppercase', letterSpacing: 0.5 }}>{block.type}</div>
      )}
    </div>
  );
}

// ─── PropertiesPanel ──────────────────────────────────────────────────────────
interface PropPanelProps {
  block: FunnelBlock;
  onChange: (updated: FunnelBlock) => void;
}
function PropertiesPanel({ block, onChange }: PropPanelProps) {
  const s = block.settings;
  function set(patch: Partial<FunnelBlock['settings']>) {
    onChange({ ...block, settings: { ...s, ...patch } });
  }
  function setContent(content: string) {
    onChange({ ...block, content });
  }

  const row: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 };
  const label: CSSProperties = { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 };
  const input: CSSProperties = { width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: '#fff', boxSizing: 'border-box' };
  const sel: CSSProperties = { ...input };
  const section: CSSProperties = { borderBottom: '1px solid #f1f5f9', paddingBottom: 14, marginBottom: 14 };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 16, color: '#0f172a', textTransform: 'uppercase', letterSpacing: 0.5 }}>{block.type} Settings</div>

      {/* Common: content for simple blocks */}
      {!['features','testimonials','pricing','stats','faq','gallery','navbar','footer','hero','columns','cta'].includes(block.type) && (
        <div style={section}>
          <div style={row}>
            <span style={label}>Content / Text</span>
            <textarea value={block.content} onChange={e => setContent(e.target.value)}
              style={{ ...input, minHeight: 64, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
        </div>
      )}

      {/* Hero — full text editing */}
      {block.type === 'hero' && (
        <div style={section}>
          <div style={row}><span style={label}>Main Heading</span><textarea value={block.content} onChange={e => setContent(e.target.value)} style={{ ...input, minHeight: 56, resize: 'vertical', fontFamily: 'inherit' }} /></div>
          <div style={row}><span style={label}>Subheading</span><textarea value={s.subheading ?? ''} onChange={e => set({ subheading: e.target.value })} style={{ ...input, minHeight: 72, resize: 'vertical', fontFamily: 'inherit' }} /></div>
          <div style={row}><span style={label}>Min Height (px)</span><input type="number" value={s.minHeight ?? 520} onChange={e => set({ minHeight: parseInt(e.target.value) })} style={input} /></div>
        </div>
      )}

      {/* CTA — full text editing */}
      {block.type === 'cta' && (
        <div style={section}>
          <div style={row}><span style={label}>Heading</span><textarea value={block.content} onChange={e => setContent(e.target.value)} style={{ ...input, minHeight: 56, resize: 'vertical', fontFamily: 'inherit' }} /></div>
          <div style={row}><span style={label}>Subheading</span><textarea value={s.subheading ?? ''} onChange={e => set({ subheading: e.target.value })} style={{ ...input, minHeight: 64, resize: 'vertical', fontFamily: 'inherit' }} /></div>
        </div>
      )}

      {/* Columns — full text + list editing */}
      {block.type === 'columns' && (
        <div style={section}>
          <div style={row}><span style={label}>Heading</span><textarea value={block.content} onChange={e => setContent(e.target.value)} style={{ ...input, minHeight: 48, resize: 'vertical', fontFamily: 'inherit' }} /></div>
          <div style={row}><span style={label}>Subheading</span><textarea value={s.subheading ?? ''} onChange={e => set({ subheading: e.target.value })} style={{ ...input, minHeight: 64, resize: 'vertical', fontFamily: 'inherit' }} /></div>
          <div style={row}><span style={label}>Button Text</span><input value={s.buttonText ?? ''} onChange={e => set({ buttonText: e.target.value })} style={input} /></div>
          <div style={row}><span style={label}>Image Position</span>
            <select value={s.imagePosition ?? 'right'} onChange={e => set({ imagePosition: e.target.value as 'left' | 'right' })} style={sel}>
              <option value="left">Left</option><option value="right">Right</option>
            </select>
          </div>
          <div style={row}><span style={label}>Image URL</span><input value={s.imageUrl ?? ''} onChange={e => set({ imageUrl: e.target.value })} placeholder="https://..." style={input} /></div>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#475569' }}>Bullet Points</div>
          {(s.listItems ?? []).map((item: string, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input value={item} onChange={e => { const li = [...(s.listItems ?? [])]; li[i] = e.target.value; set({ listItems: li }); }} style={{ ...input, flex: 1 }} />
              <button onClick={() => { const li = [...(s.listItems ?? [])]; li.splice(i,1); set({ listItems: li }); }} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '0 6px', fontSize: 11, cursor: 'pointer' }}>✕</button>
            </div>
          ))}
          <button onClick={() => set({ listItems: [...(s.listItems ?? []), 'New bullet point'] })} style={{ width: '100%', padding: '7px 0', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Add Point</button>
        </div>
      )}

      {/* Features — heading + subtitle + columns */}
      {block.type === 'features' && (
        <div style={section}>
          <div style={row}><span style={label}>Section Heading</span><input value={block.content} onChange={e => setContent(e.target.value)} style={input} /></div>
          <div style={row}><span style={label}>Subtitle</span><textarea value={s.subtitle ?? ''} onChange={e => set({ subtitle: e.target.value })} style={{ ...input, minHeight: 48, resize: 'vertical', fontFamily: 'inherit' }} /></div>
          <div style={row}><span style={label}>Columns</span>
            <select value={s.columns ?? 3} onChange={e => set({ columns: parseInt(e.target.value) })} style={sel}>
              <option value={1}>1 Column</option><option value={2}>2 Columns</option><option value={3}>3 Columns</option><option value={4}>4 Columns</option>
            </select>
          </div>
        </div>
      )}

      {/* Testimonials — heading + subtitle */}
      {block.type === 'testimonials' && (
        <div style={section}>
          <div style={row}><span style={label}>Section Heading</span><input value={block.content} onChange={e => setContent(e.target.value)} style={input} /></div>
          <div style={row}><span style={label}>Subtitle</span><input value={s.subtitle ?? ''} onChange={e => set({ subtitle: e.target.value })} style={input} /></div>
        </div>
      )}

      {/* Pricing — heading + subtitle */}
      {block.type === 'pricing' && (
        <div style={section}>
          <div style={row}><span style={label}>Section Heading</span><input value={block.content} onChange={e => setContent(e.target.value)} style={input} /></div>
          <div style={row}><span style={label}>Subtitle</span><input value={s.subtitle ?? ''} onChange={e => set({ subtitle: e.target.value })} style={input} /></div>
        </div>
      )}

      {/* FAQ — heading + subtitle */}
      {block.type === 'faq' && (
        <div style={section}>
          <div style={row}><span style={label}>Section Heading</span><input value={block.content} onChange={e => setContent(e.target.value)} style={input} /></div>
          <div style={row}><span style={label}>Subtitle / Intro</span><input value={s.subtitle ?? ''} onChange={e => set({ subtitle: e.target.value })} style={input} /></div>
        </div>
      )}

      {/* Gallery — heading + subtitle + columns */}
      {block.type === 'gallery' && (
        <div style={section}>
          <div style={row}><span style={label}>Section Heading</span><input value={block.content} onChange={e => setContent(e.target.value)} style={input} /></div>
          <div style={row}><span style={label}>Subtitle</span><input value={s.subtitle ?? ''} onChange={e => set({ subtitle: e.target.value })} style={input} /></div>
          <div style={row}><span style={label}>Columns</span>
            <select value={s.columns ?? 3} onChange={e => set({ columns: parseInt(e.target.value) })} style={sel}>
              <option value={2}>2</option><option value={3}>3</option><option value={4}>4</option>
            </select>
          </div>
        </div>
      )}

      {/* Stats — items */}
      {block.type === 'stats' && (
        <div style={section}>
          <div style={row}><span style={label}>Section Label (optional)</span><input value={block.content} onChange={e => setContent(e.target.value)} placeholder="e.g. Our Results" style={input} /></div>
        </div>
      )}

      {/* Countdown — heading + subheading */}
      {block.type === 'countdown' && (
        <div style={section}>
          <div style={row}><span style={label}>Heading</span><input value={block.content} onChange={e => setContent(e.target.value)} style={input} /></div>
          <div style={row}><span style={label}>Subheading</span><input value={s.subheading ?? ''} onChange={e => set({ subheading: e.target.value })} style={input} /></div>
        </div>
      )}

      {/* Alignment */}
      {['heading','text','button','cta','stats','countdown'].includes(block.type) && (
        <div style={row}>
          <span style={label}>Align</span>
          <select value={s.align ?? 'center'} onChange={e => set({ align: e.target.value as 'left'|'center'|'right' })} style={sel}>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>
      )}

      {/* Colors */}
      <div style={section}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {['hero','heading','text','button','cta','features','testimonials','pricing','stats','faq','countdown','columns'].includes(block.type) && (
            <div style={row}>
              <span style={label}>Text Color</span>
              <input type="color" value={s.textColor ?? '#1e293b'} onChange={e => set({ textColor: e.target.value })} style={{ width: '100%', height: 32, padding: 2, border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }} />
            </div>
          )}
          <div style={row}>
            <span style={label}>Bg Color</span>
            <input type="color" value={s.bgColor ?? '#ffffff'} onChange={e => set({ bgColor: e.target.value })} style={{ width: '100%', height: 32, padding: 2, border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }} />
          </div>
        </div>
        <div style={row}>
          <span style={label}>Bg Gradient (CSS)</span>
          <input value={s.bgGradient ?? ''} onChange={e => set({ bgGradient: e.target.value })}
            placeholder="linear-gradient(135deg, #667eea, #764ba2)" style={input} />
        </div>
        <div style={row}>
          <span style={label}>Bg Image URL</span>
          <input value={s.bgImage ?? ''} onChange={e => set({ bgImage: e.target.value })}
            placeholder="https://..." style={input} />
        </div>
        {s.bgImage && (
          <div style={row}>
            <span style={label}>Overlay opacity</span>
            <input type="range" min={0} max={1} step={0.05} value={s.overlayOpacity ?? 0.5}
              onChange={e => set({ overlayOpacity: parseFloat(e.target.value) })} style={{ width: '100%' }} />
          </div>
        )}
      </div>

      {/* Padding / spacing */}
      <div style={section}>
        <div style={row}>
          <span style={label}>Padding (px)</span>
          <input type="number" value={s.padding ?? 40} onChange={e => set({ padding: parseInt(e.target.value) })} style={input} />
        </div>
      </div>

      {/* Button specific */}
      {['button','hero','cta'].includes(block.type) && (
        <div style={section}>
          <div style={row}><span style={label}>Button Text</span><input value={s.buttonText ?? ''} onChange={e => set({ buttonText: e.target.value })} style={input} /></div>
          <div style={row}><span style={label}>Button URL</span><input value={s.url ?? ''} onChange={e => set({ url: e.target.value })} style={input} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={row}><span style={label}>Btn Color</span><input type="color" value={s.buttonColor ?? '#6366f1'} onChange={e => set({ buttonColor: e.target.value })} style={{ width: '100%', height: 32, padding: 2, border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }} /></div>
            <div style={row}><span style={label}>Btn Text</span><input type="color" value={s.buttonTextColor ?? '#ffffff'} onChange={e => set({ buttonTextColor: e.target.value })} style={{ width: '100%', height: 32, padding: 2, border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }} /></div>
          </div>
          {['hero','cta'].includes(block.type) && (
            <>
              <div style={row}><span style={label}>Secondary Button Text</span><input value={s.secondaryButtonText ?? ''} onChange={e => set({ secondaryButtonText: e.target.value })} style={input} /></div>
              <div style={row}><span style={label}>Secondary Button URL</span><input value={s.secondaryButtonUrl ?? ''} onChange={e => set({ secondaryButtonUrl: e.target.value })} style={input} /></div>
            </>
          )}
        </div>
      )}

      {/* Image */}
      {['image','hero'].includes(block.type) && (
        <div style={section}>
          <div style={row}><span style={label}>Image URL</span><input value={s.imageUrl ?? ''} onChange={e => set({ imageUrl: e.target.value })} placeholder="https://..." style={input} /></div>
          <div style={row}><span style={label}>Alt Text</span><input value={s.imageAlt ?? ''} onChange={e => set({ imageAlt: e.target.value })} style={input} /></div>
        </div>
      )}

      {/* Video */}
      {block.type === 'video' && (
        <div style={section}>
          <div style={row}><span style={label}>Video URL (YouTube/Vimeo embed)</span><input value={s.url ?? ''} onChange={e => set({ url: e.target.value })} placeholder="https://youtube.com/embed/..." style={input} /></div>
        </div>
      )}

      {/* Form fields */}
      {block.type === 'form' && (
        <div style={section}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#475569' }}>Form Fields</div>
          {(s.formFields ?? []).map((f, i) => (
            <div key={i} style={{ background: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Field {i+1}</span>
                <button onClick={() => { const ff = [...(s.formFields??[])]; ff.splice(i,1); set({ formFields: ff }); }}
                  style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 11, cursor: 'pointer' }}>Remove</button>
              </div>
              <input value={f.label} onChange={e => { const ff = [...(s.formFields??[])]; ff[i] = {...ff[i], label: e.target.value}; set({ formFields: ff }); }}
                placeholder="Label" style={{ ...input, marginBottom: 4 }} />
              <select value={f.type} onChange={e => { const ff = [...(s.formFields??[])]; ff[i] = {...ff[i], type: e.target.value}; set({ formFields: ff }); }} style={sel}>
                {['text','email','phone','number','textarea','select'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          ))}
          <button onClick={() => set({ formFields: [...(s.formFields??[]), { label: 'Field', type: 'text', required: false }] })}
            style={{ width: '100%', padding: '7px 0', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Add Field</button>
        </div>
      )}

      {/* Feature items */}
      {block.type === 'features' && (
        <div style={section}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#475569' }}>Feature Items</div>
          {(s.featureItems ?? []).map((f, i) => (
            <div key={i} style={{ background: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Item {i+1}</span>
                <button onClick={() => { const fi = [...(s.featureItems??[])]; fi.splice(i,1); set({ featureItems: fi }); }}
                  style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 11, cursor: 'pointer' }}>Remove</button>
              </div>
              <input value={f.icon} onChange={e => { const fi = [...(s.featureItems??[])]; fi[i]={...fi[i],icon:e.target.value}; set({featureItems:fi}); }} placeholder="Icon (emoji)" style={{ ...input, marginBottom: 4 }} />
              <input value={f.title} onChange={e => { const fi = [...(s.featureItems??[])]; fi[i]={...fi[i],title:e.target.value}; set({featureItems:fi}); }} placeholder="Title" style={{ ...input, marginBottom: 4 }} />
              <input value={f.desc} onChange={e => { const fi = [...(s.featureItems??[])]; fi[i]={...fi[i],desc:e.target.value}; set({featureItems:fi}); }} placeholder="Description" style={input} />
            </div>
          ))}
          <button onClick={() => set({ featureItems: [...(s.featureItems??[]), { icon: '⭐', title: 'Feature', desc: 'Description' }] })}
            style={{ width: '100%', padding: '7px 0', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Add Feature</button>
        </div>
      )}

      {/* Testimonials */}
      {block.type === 'testimonials' && (
        <div style={section}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#475569' }}>Testimonials</div>
          {(s.testimonialItems ?? []).map((t, i) => (
            <div key={i} style={{ background: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>#{i+1}</span>
                <button onClick={() => { const ti=[...(s.testimonialItems??[])]; ti.splice(i,1); set({testimonialItems:ti}); }}
                  style={{ background:'#ef4444',color:'#fff',border:'none',borderRadius:4,padding:'2px 6px',fontSize:11,cursor:'pointer' }}>Remove</button>
              </div>
              <textarea value={t.quote} onChange={e => { const ti=[...(s.testimonialItems??[])]; ti[i]={...ti[i],quote:e.target.value}; set({testimonialItems:ti}); }} placeholder="Quote" style={{ ...input, minHeight: 48, resize: 'vertical', fontFamily: 'inherit', marginBottom: 4 }} />
              <input value={t.author} onChange={e => { const ti=[...(s.testimonialItems??[])]; ti[i]={...ti[i],author:e.target.value}; set({testimonialItems:ti}); }} placeholder="Author" style={{ ...input, marginBottom: 4 }} />
              <input value={t.role} onChange={e => { const ti=[...(s.testimonialItems??[])]; ti[i]={...ti[i],role:e.target.value}; set({testimonialItems:ti}); }} placeholder="Role / Company" style={input} />
            </div>
          ))}
          <button onClick={() => set({ testimonialItems: [...(s.testimonialItems??[]), { quote: 'Great product!', author: 'Jane Doe', role: 'CEO', stars: 5 }] })}
            style={{ width:'100%',padding:'7px 0',background:'#6366f1',color:'#fff',border:'none',borderRadius:6,fontSize:12,fontWeight:700,cursor:'pointer' }}>+ Add Testimonial</button>
        </div>
      )}

      {/* Pricing plans */}
      {block.type === 'pricing' && (
        <div style={section}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#475569' }}>Pricing Plans</div>
          {(s.pricingPlans ?? []).map((p, i) => (
            <div key={i} style={{ background: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Plan {i+1}</span>
                <button onClick={() => { const pp=[...(s.pricingPlans??[])]; pp.splice(i,1); set({pricingPlans:pp}); }}
                  style={{ background:'#ef4444',color:'#fff',border:'none',borderRadius:4,padding:'2px 6px',fontSize:11,cursor:'pointer' }}>Remove</button>
              </div>
              <input value={p.name} onChange={e => { const pp=[...(s.pricingPlans??[])]; pp[i]={...pp[i],name:e.target.value}; set({pricingPlans:pp}); }} placeholder="Plan name" style={{ ...input, marginBottom: 4 }} />
              <input value={p.price} onChange={e => { const pp=[...(s.pricingPlans??[])]; pp[i]={...pp[i],price:e.target.value}; set({pricingPlans:pp}); }} placeholder="Price e.g. $29" style={{ ...input, marginBottom: 4 }} />
              <input value={p.period} onChange={e => { const pp=[...(s.pricingPlans??[])]; pp[i]={...pp[i],period:e.target.value}; set({pricingPlans:pp}); }} placeholder="Period e.g. /month" style={{ ...input, marginBottom: 4 }} />
              <textarea value={(p.features ?? []).join('\n')} onChange={e => { const pp=[...(s.pricingPlans??[])]; pp[i]={...pp[i],features:e.target.value.split('\n')}; set({pricingPlans:pp}); }} placeholder="Features (one per line)" style={{ ...input, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
          ))}
          <button onClick={() => set({ pricingPlans: [...(s.pricingPlans??[]), { name: 'New Plan', price: '$0', period: '/mo', features: ['Feature 1'] }] })}
            style={{ width:'100%',padding:'7px 0',background:'#6366f1',color:'#fff',border:'none',borderRadius:6,fontSize:12,fontWeight:700,cursor:'pointer' }}>+ Add Plan</button>
        </div>
      )}

      {/* FAQ */}
      {block.type === 'faq' && (
        <div style={section}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#475569' }}>FAQ Items</div>
          {(s.faqItems ?? []).map((f, i) => (
            <div key={i} style={{ background: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Q{i+1}</span>
                <button onClick={() => { const fi=[...(s.faqItems??[])]; fi.splice(i,1); set({faqItems:fi}); }}
                  style={{ background:'#ef4444',color:'#fff',border:'none',borderRadius:4,padding:'2px 6px',fontSize:11,cursor:'pointer' }}>Remove</button>
              </div>
              <input value={f.q} onChange={e => { const fi=[...(s.faqItems??[])]; fi[i]={...fi[i],q:e.target.value}; set({faqItems:fi}); }} placeholder="Question" style={{ ...input, marginBottom: 4 }} />
              <textarea value={f.a} onChange={e => { const fi=[...(s.faqItems??[])]; fi[i]={...fi[i],a:e.target.value}; set({faqItems:fi}); }} placeholder="Answer" style={{ ...input, minHeight: 48, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
          ))}
          <button onClick={() => set({ faqItems: [...(s.faqItems??[]), { q: 'Question?', a: 'Answer.' }] })}
            style={{ width:'100%',padding:'7px 0',background:'#6366f1',color:'#fff',border:'none',borderRadius:6,fontSize:12,fontWeight:700,cursor:'pointer' }}>+ Add FAQ</button>
        </div>
      )}

      {/* Stat items */}
      {block.type === 'stats' && (
        <div style={section}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#475569' }}>Stat Items</div>
          {(s.statItems ?? []).map((st, i) => (
            <div key={i} style={{ background: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Stat {i+1}</span>
                <button onClick={() => { const si=[...(s.statItems??[])]; si.splice(i,1); set({statItems:si}); }}
                  style={{ background:'#ef4444',color:'#fff',border:'none',borderRadius:4,padding:'2px 6px',fontSize:11,cursor:'pointer' }}>Remove</button>
              </div>
              <input value={st.value} onChange={e => { const si=[...(s.statItems??[])]; si[i]={...si[i],value:e.target.value}; set({statItems:si}); }} placeholder="Value e.g. 10K+" style={{ ...input, marginBottom: 4 }} />
              <input value={st.label} onChange={e => { const si=[...(s.statItems??[])]; si[i]={...si[i],label:e.target.value}; set({statItems:si}); }} placeholder="Label e.g. Users" style={input} />
            </div>
          ))}
          <button onClick={() => set({ statItems: [...(s.statItems??[]), { value: '0', label: 'Stat' }] })}
            style={{ width:'100%',padding:'7px 0',background:'#6366f1',color:'#fff',border:'none',borderRadius:6,fontSize:12,fontWeight:700,cursor:'pointer' }}>+ Add Stat</button>
        </div>
      )}

      {/* Navbar */}
      {block.type === 'navbar' && (
        <div style={section}>
          <div style={row}><span style={label}>Logo Text</span><input value={s.navLogo ?? ''} onChange={e => set({ navLogo: e.target.value })} style={input} /></div>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#475569' }}>Nav Links</div>
          {(s.navLinks ?? []).map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input value={l.label} onChange={e => { const nl=[...(s.navLinks??[])]; nl[i]={...nl[i],label:e.target.value}; set({navLinks:nl}); }} placeholder="Label" style={{ ...input, flex: 1 }} />
              <input value={l.url} onChange={e => { const nl=[...(s.navLinks??[])]; nl[i]={...nl[i],url:e.target.value}; set({navLinks:nl}); }} placeholder="URL" style={{ ...input, flex: 1 }} />
              <button onClick={() => { const nl=[...(s.navLinks??[])]; nl.splice(i,1); set({navLinks:nl}); }}
                style={{ background:'#ef4444',color:'#fff',border:'none',borderRadius:4,padding:'0 6px',fontSize:11,cursor:'pointer' }}>✕</button>
            </div>
          ))}
          <button onClick={() => set({ navLinks: [...(s.navLinks??[]), { label: 'Link', url: '#' }] })}
            style={{ width:'100%',padding:'7px 0',background:'#6366f1',color:'#fff',border:'none',borderRadius:6,fontSize:12,fontWeight:700,cursor:'pointer' }}>+ Add Link</button>
        </div>
      )}

      {/* Gallery images */}
      {block.type === 'gallery' && (
        <div style={section}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#475569' }}>Gallery Images (URLs)</div>
          {(s.galleryImages ?? []).map((url, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input value={url} onChange={e => { const gi=[...(s.galleryImages??[])]; gi[i]=e.target.value; set({galleryImages:gi}); }} placeholder="https://..." style={{ ...input, flex: 1 }} />
              <button onClick={() => { const gi=[...(s.galleryImages??[])]; gi.splice(i,1); set({galleryImages:gi}); }}
                style={{ background:'#ef4444',color:'#fff',border:'none',borderRadius:4,padding:'0 6px',fontSize:11,cursor:'pointer' }}>✕</button>
            </div>
          ))}
          <button onClick={() => set({ galleryImages: [...(s.galleryImages??[]), ''] })}
            style={{ width:'100%',padding:'7px 0',background:'#6366f1',color:'#fff',border:'none',borderRadius:6,fontSize:12,fontWeight:700,cursor:'pointer' }}>+ Add Image</button>
        </div>
      )}
    </div>
  );
}

// ─── Main FunnelBuilder ───────────────────────────────────────────────────────
interface FunnelBuilderProps {
  funnel: Funnel;
  onSave: (funnel: Funnel) => void;
  onClose: () => void;
}

export default function FunnelBuilder({ funnel, onSave, onClose }: FunnelBuilderProps) {
  const initialPages = funnel.pages && funnel.pages.length > 0 ? funnel.pages : [mkPage('Home')];
  const { state: pages, push: pushHistory, undo, redo, canUndo, canRedo } = useHistory<FunnelStep[]>(initialPages);
  const [editorMode, setEditorMode] = useState<'overview' | 'page-editor'>('overview');
  const setPages = useCallback((updater: FunnelStep[] | ((prev: FunnelStep[]) => FunnelStep[])) => {
    if (typeof updater === 'function') { pushHistory(updater(pages)); } else { pushHistory(updater); }
  }, [pages, pushHistory]);
  const [activePageId, setActivePageId] = useState(initialPages[0].id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [leftTab, setLeftTab] = useState<'elements' | 'sections' | 'templates' | 'pages'>('elements');
  const [previewTemplate, setPreviewTemplate] = useState<typeof TEMPLATES[0] | null>(null);
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [blockSearch, setBlockSearch] = useState('');
  const canvasRef = useRef<HTMLDivElement>(null);

  const activePage = pages.find(p => p.id === activePageId) ?? pages[0];
  const blocks = activePage.blocks;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  function updateBlocks(newBlocks: FunnelBlock[]) {
    pushHistory(pages.map(p => p.id === activePage.id ? { ...p, blocks: newBlocks } : p));
  }

  // ── Drag handlers ─────────────────────────────────────────────────────────
  function handleDrop(index: number) {
    if (DRAG_TYPE === 'new') {
      const newBlock = createBlock(DRAG_PAYLOAD as FunnelBlock['type']);
      const next = [...blocks];
      next.splice(index, 0, newBlock);
      updateBlocks(next);
      setSelectedId(newBlock.id);
    } else if (DRAG_TYPE === 'move' && draggingId) {
      const from = blocks.findIndex(b => b.id === draggingId);
      if (from < 0) return;
      const next = [...blocks];
      const [moved] = next.splice(from, 1);
      const insertAt = index > from ? index - 1 : index;
      next.splice(insertAt, 0, moved);
      updateBlocks(next);
    }
    setDropTarget(null);
    setDraggingId(null);
    DRAG_TYPE = null;
    DRAG_PAYLOAD = '';
  }

  function handleBlockUpdate(updated: FunnelBlock) {
    updateBlocks(blocks.map(b => b.id === updated.id ? updated : b));
  }

  function handleDelete(id: string) {
    updateBlocks(blocks.filter(b => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function handleDuplicate(id: string) {
    const idx = blocks.findIndex(b => b.id === id);
    if (idx < 0) return;
    const copy = { ...blocks[idx], id: uid() };
    const next = [...blocks];
    next.splice(idx + 1, 0, copy);
    updateBlocks(next);
    setSelectedId(copy.id);
  }

  function handleMoveUp(id: string) {
    const idx = blocks.findIndex(b => b.id === id);
    if (idx <= 0) return;
    const next = [...blocks];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    updateBlocks(next);
  }

  function handleMoveDown(id: string) {
    const idx = blocks.findIndex(b => b.id === id);
    if (idx < 0 || idx >= blocks.length - 1) return;
    const next = [...blocks];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    updateBlocks(next);
  }

  // ── Page management ────────────────────────────────────────────────────────
  function addPage() {
    const p = mkPage(`Page ${pages.length + 1}`, 'custom');
    setPages(prev => [...prev, p]);
    setActivePageId(p.id);
  }

  function deletePage(id: string) {
    if (pages.length <= 1) return;
    const next = pages.filter(p => p.id !== id);
    setPages(next);
    if (activePageId === id) setActivePageId(next[0].id);
  }

  function applyTemplate(t: typeof TEMPLATES[0]) {
    const tpage = t.pages[0];
    const p = mkPage(tpage.name, tpage.type);
    p.blocks = tpage.blocks.map(b => ({ ...b, id: uid() }));
    setPages(prev => prev.map(pg => pg.id === activePage.id ? p : pg));
    setSelectedId(null);
  }

  function handleSave() {
    onSave({ ...funnel, pages, steps: pages.length });
  }

  const deviceWidth = device === 'desktop' ? '100%' : device === 'tablet' ? 768 : 375;
  const selectedBlock = blocks.find(b => b.id === selectedId) ?? null;

  if (editorMode === 'overview') {
    return (
      <FunnelOverview
        funnel={funnel}
        pages={pages}
        onEditPage={(pageId) => { setActivePageId(pageId); setEditorMode('page-editor'); }}
        onAddPage={addPage}
        onDeletePage={deletePage}
        onRenamePage={(id, name) => setPages(prev => prev.map(p => p.id === id ? { ...p, name } : p))}
        onReorderPage={(from, to) => {
          const next = [...pages];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          setPages(next);
        }}
        onClose={onClose}
        onSave={handleSave}
      />
    );
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const toolbarBtn = (active?: boolean): CSSProperties => ({
    padding: '6px 12px', borderRadius: 6, border: active ? '1px solid #6366f1' : '1px solid #334155',
    background: active ? '#1e293b' : 'transparent', color: active ? '#a5b4fc' : '#94a3b8',
    fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
  });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', flexDirection: 'column', background: '#f1f5f9', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* ── Toolbar (Canva/Wix style) ── */}
      <div style={{ height: 56, background: '#ffffff', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8, flexShrink: 0, borderBottom: '1px solid #e8ecf0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        {/* Left: back + funnel name */}
        <button onClick={() => setEditorMode('overview')}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e8ecf0', background: 'white', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
          ← Funnel
        </button>
        <div style={{ width: 1, height: 22, background: '#e8ecf0', margin: '0 4px' }} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 800, fontSize: 13, color: '#0f172a', lineHeight: 1.2 }}>{funnel.name}</span>
          <span style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1 }}>{activePage?.name}</span>
        </div>
        <div style={{ flex: 1 }} />
        {/* Center: undo/redo + device */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={undo} disabled={!canUndo} title="Undo" style={{ padding: '7px 9px', borderRadius: 7, border: '1px solid #e8ecf0', background: 'white', cursor: canUndo ? 'pointer' : 'not-allowed', opacity: canUndo ? 1 : 0.4, display: 'flex' }}><Undo2 size={14} color="#374151" /></button>
          <button onClick={redo} disabled={!canRedo} title="Redo" style={{ padding: '7px 9px', borderRadius: 7, border: '1px solid #e8ecf0', background: 'white', cursor: canRedo ? 'pointer' : 'not-allowed', opacity: canRedo ? 1 : 0.4, display: 'flex' }}><Redo2 size={14} color="#374151" /></button>
        </div>
        <div style={{ width: 1, height: 22, background: '#e8ecf0', margin: '0 4px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: '#f8fafc', borderRadius: 8, padding: '3px', border: '1px solid #e8ecf0' }}>
          {(['desktop','tablet','mobile'] as const).map(d => (
            <button key={d} onClick={() => setDevice(d)}
              style={{ padding: '5px 8px', borderRadius: 6, border: 'none', background: device === d ? '#fff' : 'transparent', color: device === d ? '#6366f1' : '#64748b', fontSize: 13, cursor: 'pointer', boxShadow: device === d ? '0 1px 4px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s' }}
              title={d}>
              {d === 'desktop' ? '🖥' : d === 'tablet' ? '📱' : '📲'}
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 22, background: '#e8ecf0', margin: '0 4px' }} />
        {/* Right: preview + publish */}
        <button onClick={() => { setPreview(p => !p); setSelectedId(null); }}
          style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #e8ecf0', background: preview ? '#f5f3ff' : 'white', color: preview ? '#6366f1' : '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Eye size={14} /> {preview ? 'Edit' : 'Preview'}
        </button>
        <button onClick={handleSave}
          style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, boxShadow: '0 2px 8px rgba(99,102,241,0.3)' }}>
          <Save size={13} /> Publish
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ── Left panel ── */}
        {!preview && (
          <div style={{ width: 256, background: '#fff', borderRight: '1px solid #e8ecf0', display: 'flex', flexDirection: 'column', flexShrink: 0, boxShadow: '2px 0 8px rgba(0,0,0,0.04)' }}>
            {/* Tab bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e8ecf0', backgroundColor: '#fafbfc' }}>
              {(['elements','sections','templates','pages'] as const).map(tab => (
                <button key={tab} onClick={() => setLeftTab(tab as 'elements' | 'sections' | 'templates' | 'pages')}
                  style={{ flex: 1, padding: '11px 2px', border: 'none', background: 'transparent', fontSize: '10px', fontWeight: (leftTab as string) === tab ? 700 : 500, color: (leftTab as string) === tab ? '#6366f1' : '#64748b', cursor: 'pointer', borderBottom: (leftTab as string) === tab ? '2px solid #6366f1' : '2px solid transparent', textTransform: 'uppercase', letterSpacing: 0.5, transition: 'all 0.15s' }}>
                  {tab === 'elements' ? '🧩 Elements' : tab === 'sections' ? '🏗 Sections' : tab === 'templates' ? '🎨 Templates' : '📄 Pages'}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {/* Elements tab */}
              {(leftTab as string) === 'elements' && (
                <div style={{ padding: '10px' }}>
                  <div style={{ position: 'relative', marginBottom: 12 }}>
                    <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input value={blockSearch} onChange={e => setBlockSearch(e.target.value)} placeholder="Search elements..."
                      style={{ width: '100%', padding: '8px 10px 8px 28px', border: '1px solid #e8ecf0', borderRadius: 8, fontSize: 12, outline: 'none', boxSizing: 'border-box', backgroundColor: '#f8fafc' }} />
                  </div>
                  {CATALOG.map(cat => {
                    const filtered = blockSearch ? cat.blocks.filter(b => b.label.toLowerCase().includes(blockSearch.toLowerCase())) : cat.blocks;
                    if (filtered.length === 0) return null;
                    return (
                      <div key={cat.category} style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6, paddingLeft: 2 }}>
                          {cat.icon} {cat.category}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                          {filtered.map(item => (
                            <div key={item.type + item.label}
                              draggable
                              onDragStart={() => { DRAG_TYPE = 'new'; DRAG_PAYLOAD = item.type; }}
                              onDragEnd={() => { if (DRAG_TYPE === 'new') { DRAG_TYPE = null; DRAG_PAYLOAD = ''; setDropTarget(null); } }}
                              onClick={() => { const b = createBlock(item.type); updateBlocks([...blocks, b]); setSelectedId(b.id); }}
                              style={{ padding: '12px 8px', background: '#f8fafc', border: `1px solid #e8ecf0`, borderRadius: 10, cursor: 'grab', textAlign: 'center', fontSize: '11px', color: '#374151', transition: 'all 0.15s', userSelect: 'none' }}
                              onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.background = `${item.color}10`; el.style.borderColor = `${item.color}60`; el.style.transform = 'translateY(-1px)'; el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; }}
                              onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.background = '#f8fafc'; el.style.borderColor = '#e8ecf0'; el.style.transform = ''; el.style.boxShadow = ''; }}>
                              <div style={{ fontSize: 20, marginBottom: 4, lineHeight: 1 }}>{item.emoji}</div>
                              <div style={{ fontWeight: 600, fontSize: '11px' }}>{item.label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Sections tab - ready-made pre-built sections */}
              {(leftTab as string) === 'sections' && (
                <div style={{ padding: '10px' }}>
                  <p style={{ fontSize: '11px', color: '#64748b', marginBottom: 10, lineHeight: 1.5, margin: '0 0 10px' }}>Click to add a complete ready-made section</p>
                  {[
                    { label: 'Hero — Dark Gradient', preview: 'linear-gradient(135deg,#1e293b,#7c3aed)', type: 'hero' as BlockType, extra: { bgGradient: 'linear-gradient(135deg,#1e293b,#7c3aed)', textColor: '#fff', buttonText: 'Get Started', subheading: 'Transform your business today' } },
                    { label: 'Hero — Ocean Blue', preview: 'linear-gradient(135deg,#0ea5e9,#6366f1)', type: 'hero' as BlockType, extra: { bgGradient: 'linear-gradient(135deg,#0ea5e9,#6366f1)', textColor: '#fff', buttonText: 'Start Free Trial', subheading: 'Built for teams that move fast' } },
                    { label: 'Hero — Sunset', preview: 'linear-gradient(135deg,#f97316,#ec4899)', type: 'hero' as BlockType, extra: { bgGradient: 'linear-gradient(135deg,#f97316,#ec4899)', textColor: '#fff', buttonText: 'Explore Now', subheading: 'Join 50,000+ happy customers' } },
                    { label: 'Hero — Mint', preview: 'linear-gradient(135deg,#22c55e,#0891b2)', type: 'hero' as BlockType, extra: { bgGradient: 'linear-gradient(135deg,#22c55e,#0891b2)', textColor: '#fff', buttonText: 'Get Access', subheading: 'Simple, powerful, and fast' } },
                    { label: 'Features — 3 Cols', preview: 'linear-gradient(135deg,#f0f9ff,#e0e7ff)', type: 'features' as BlockType, extra: {} },
                    { label: 'Features — 2 Cols', preview: 'linear-gradient(135deg,#f0fdf4,#ecfdf5)', type: 'features' as BlockType, extra: { columns: 2 } },
                    { label: 'Testimonials — Light', preview: 'linear-gradient(135deg,#fff7ed,#fef3c7)', type: 'testimonials' as BlockType, extra: { bgColor: '#fffbeb' } },
                    { label: 'Testimonials — Dark', preview: 'linear-gradient(135deg,#1e293b,#0f172a)', type: 'testimonials' as BlockType, extra: { bgColor: '#0f172a' } },
                    { label: 'Pricing — 3 Plans', preview: 'linear-gradient(135deg,#f5f3ff,#ede9fe)', type: 'pricing' as BlockType, extra: {} },
                    { label: 'CTA — Purple', preview: 'linear-gradient(135deg,#6366f1,#8b5cf6)', type: 'cta' as BlockType, extra: {} },
                    { label: 'CTA — Orange', preview: 'linear-gradient(135deg,#f97316,#f59e0b)', type: 'cta' as BlockType, extra: { bgGradient: 'linear-gradient(135deg,#f97316,#f59e0b)', textColor: '#fff', buttonColor: '#fff', buttonTextColor: '#f97316' } },
                    { label: 'Stats Counter', preview: 'linear-gradient(135deg,#0f172a,#1e293b)', type: 'stats' as BlockType, extra: {} },
                    { label: 'FAQ Section', preview: 'linear-gradient(135deg,#f8fafc,#f1f5f9)', type: 'faq' as BlockType, extra: {} },
                    { label: 'Contact Form', preview: 'linear-gradient(135deg,#eff6ff,#dbeafe)', type: 'form' as BlockType, extra: { bgColor: '#eff6ff', buttonColor: '#3b82f6' } },
                    { label: 'Countdown Timer', preview: 'linear-gradient(135deg,#7f1d1d,#dc2626)', type: 'countdown' as BlockType, extra: { bgColor: '#dc2626' } },
                    { label: '2-Col Split', preview: 'linear-gradient(135deg,#fff,#f1f5f9)', type: 'columns' as BlockType, extra: {} },
                    { label: 'Image Gallery', preview: 'linear-gradient(135deg,#fdf4ff,#f0abfc)', type: 'gallery' as BlockType, extra: {} },
                    { label: 'Navigation Bar', preview: 'linear-gradient(135deg,#fff,#f8fafc)', type: 'navbar' as BlockType, extra: {} },
                    { label: 'Footer', preview: 'linear-gradient(135deg,#0f172a,#1e293b)', type: 'footer' as BlockType, extra: {} },
                    { label: 'Video Embed', preview: 'linear-gradient(135deg,#0f172a,#18181b)', type: 'video' as BlockType, extra: {} },
                  ].map((sec, i) => (
                    <div key={i}
                      onClick={() => { const b = createBlock(sec.type, '', sec.extra); updateBlocks([...blocks, b]); setSelectedId(b.id); }}
                      style={{ marginBottom: 10, borderRadius: 10, overflow: 'hidden', border: '1px solid #e8ecf0', cursor: 'pointer', transition: 'all 0.15s' }}
                      onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = '#6366f1'; el.style.boxShadow = '0 0 0 2px #e0e7ff'; el.style.transform = 'translateY(-1px)'; }}
                      onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = '#e8ecf0'; el.style.boxShadow = 'none'; el.style.transform = ''; }}>
                      <div style={{ height: 56, background: sec.preview, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', inset: 0, opacity: 0.3, background: 'repeating-linear-gradient(90deg, transparent, transparent 10px, rgba(255,255,255,0.1) 10px, rgba(255,255,255,0.1) 11px)' }} />
                        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: 60, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.6)' }} />
                          <div style={{ width: 40, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.4)' }} />
                          <div style={{ width: 28, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.7)', marginTop: 2 }} />
                        </div>
                      </div>
                      <div style={{ padding: '7px 10px', background: '#fff' }}>
                        <div style={{ fontWeight: 600, fontSize: '11px', color: '#374151' }}>{sec.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Templates tab */}
              {(leftTab as string) === 'templates' && (
                <div style={{ padding: '10px' }}>
                  <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 10px', lineHeight: 1.5 }}>Preview or apply a full page template</p>
                  {TEMPLATES.map(t => (
                    <div key={t.name}
                      style={{ marginBottom: 10, borderRadius: 10, overflow: 'hidden', border: '1px solid #e8ecf0', background: '#fff', transition: 'all 0.15s' }}
                      onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = '#6366f1'; el.style.boxShadow = '0 4px 16px rgba(99,102,241,0.15)'; }}
                      onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = '#e8ecf0'; el.style.boxShadow = 'none'; }}>
                      {/* Visual preview thumbnail */}
                      <div style={{ height: 90, background: t.heroColor, position: 'relative', overflow: 'hidden', cursor: 'pointer' }} onClick={() => setPreviewTemplate(t)}>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '10px' }}>
                          <div style={{ width: '65%', height: 7, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.8)' }} />
                          <div style={{ width: '45%', height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.55)' }} />
                          <div style={{ width: '28%', height: 11, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.85)', marginTop: 5 }} />
                          <div style={{ position: 'absolute', bottom: 6, left: 8, right: 8, display: 'flex', gap: 4 }}>
                            {[1,2,3].map(i => <div key={i} style={{ flex: 1, height: 16, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.18)' }} />)}
                          </div>
                        </div>
                        <div style={{ position: 'absolute', top: 6, left: 8, fontSize: '16px' }}>{t.emoji}</div>
                        <div style={{ position: 'absolute', top: 6, right: 8, padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(0,0,0,0.35)', color: 'white', fontSize: '10px', fontWeight: 700 }}>{t.category}</div>
                        {/* Hover overlay */}
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(99,102,241,0)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
                          onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(99,102,241,0.25)'}
                          onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(99,102,241,0)'}>
                          <div style={{ opacity: 0, transition: 'opacity 0.15s', padding: '5px 10px', background: 'white', borderRadius: 6, fontSize: 11, fontWeight: 700, color: '#6366f1' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.opacity = '1'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = '0'; }}>
                            👁 Preview
                          </div>
                        </div>
                      </div>
                      <div style={{ padding: '8px 10px' }}>
                        <div style={{ fontWeight: 700, fontSize: '12px', color: '#0f172a', marginBottom: '2px' }}>{t.name}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.4, marginBottom: 6 }}>{t.desc}</div>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button onClick={() => setPreviewTemplate(t)}
                            style={{ flex: 1, padding: '5px 0', border: '1px solid #e2e8f0', borderRadius: 6, background: 'white', color: '#374151', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                            👁 Preview
                          </button>
                          <button onClick={() => applyTemplate(t)}
                            style={{ flex: 1, padding: '5px 0', border: 'none', borderRadius: 6, background: '#6366f1', color: 'white', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                            Apply
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pages tab */}
              {(leftTab as string) === 'pages' && (
                <div style={{ padding: 10 }}>
                  {pages.map(p => (
                    <div key={p.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, marginBottom: 4, background: p.id === activePageId ? '#eef2ff' : '#f8fafc', border: p.id === activePageId ? '1px solid #a5b4fc' : '1px solid #e2e8f0', cursor: 'pointer' }}
                      onClick={() => { setActivePageId(p.id); setSelectedId(null); }}>
                      {renamingPageId === p.id ? (
                        <input autoFocus value={renameVal}
                          onChange={e => setRenameVal(e.target.value)}
                          onBlur={() => { setPages(prev => prev.map(pg => pg.id === p.id ? { ...pg, name: renameVal || pg.name } : pg)); setRenamingPageId(null); }}
                          onKeyDown={e => { if (e.key === 'Enter') { setPages(prev => prev.map(pg => pg.id === p.id ? { ...pg, name: renameVal || pg.name } : pg)); setRenamingPageId(null); } }}
                          style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 12, fontWeight: 700, outline: 'none', color: '#0f172a' }} />
                      ) : (
                        <span style={{ flex: 1, fontSize: 12, fontWeight: p.id === activePageId ? 700 : 500, color: p.id === activePageId ? '#4f46e5' : '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      )}
                      <button title="Rename" onClick={e => { e.stopPropagation(); setRenamingPageId(p.id); setRenameVal(p.name); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '0 2px', color: '#94a3b8' }}>✏️</button>
                      {pages.length > 1 && (
                        <button title="Delete" onClick={e => { e.stopPropagation(); deletePage(p.id); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '0 2px', color: '#f87171' }}>🗑</button>
                      )}
                    </div>
                  ))}
                  <button onClick={addPage}
                    style={{ width: '100%', marginTop: 8, padding: '8px 0', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Add Page</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Canvas ── */}
        <div
          ref={canvasRef}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); if (blocks.length === 0) { handleDrop(0); } }}
          onClick={() => setSelectedId(null)}
          style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: preview ? 0 : '16px 24px', background: '#e2e8f0', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
          <div style={{ width: typeof deviceWidth === 'number' ? deviceWidth : '100%', maxWidth: '100%', background: '#fff', minHeight: '100%', boxShadow: preview ? 'none' : '0 4px 24px rgba(0,0,0,0.10)', borderRadius: preview ? 0 : 8, overflow: 'hidden' }}>
            {/* Drop zone before first block */}
            {!preview && (
              <DropZone index={0} active={dropTarget === 0}
                onOver={i => setDropTarget(i)}
                onDrop={handleDrop} />
            )}
            {blocks.length === 0 && !preview && (
              <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🎨</div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#475569' }}>Start Building</div>
                <div style={{ fontSize: 14 }}>Drag elements from the left panel or click them to add</div>
              </div>
            )}
            {blocks.map((block, idx) => (
              <Fragment key={block.id}>
                <CanvasBlock
                  block={block}
                  selected={selectedId === block.id}
                  preview={preview}
                  isDragging={draggingId === block.id}
                  onClick={() => setSelectedId(block.id)}
                  onDragStart={() => { DRAG_TYPE = 'move'; DRAG_PAYLOAD = block.id; setDraggingId(block.id); }}
                  onDelete={() => handleDelete(block.id)}
                  onDuplicate={() => handleDuplicate(block.id)}
                  onMoveUp={() => handleMoveUp(block.id)}
                  onMoveDown={() => handleMoveDown(block.id)}
                />
                {!preview && (
                  <DropZone index={idx + 1} active={dropTarget === idx + 1}
                    onOver={i => setDropTarget(i)}
                    onDrop={handleDrop} />
                )}
              </Fragment>
            ))}
          </div>
        </div>

        {/* ── Properties panel ── */}
        {!preview && selectedBlock && (
          <div style={{ width: 280, background: '#fff', borderLeft: '1px solid #e2e8f0', flexShrink: 0, overflowY: 'auto' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: 13, color: '#0f172a' }}>Properties</span>
              <button onClick={() => setSelectedId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>
            <PropertiesPanel block={selectedBlock} onChange={handleBlockUpdate} />
          </div>
        )}
        {!preview && !selectedBlock && (
          <div style={{ width: 280, background: '#fff', borderLeft: '1px solid #e2e8f0', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, color: '#94a3b8', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🖱</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#475569' }}>No block selected</div>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>Click a block on the canvas to edit its properties</div>
          </div>
        )}
      </div>

      {/* ── Template Preview Modal ── */}
      {previewTemplate && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 600, display: 'flex', flexDirection: 'column' }} onClick={() => setPreviewTemplate(null)}>
          {/* Modal header */}
          <div style={{ height: 54, background: '#0f172a', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <span style={{ fontSize: '18px' }}>{previewTemplate.emoji}</span>
            <div>
              <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: 15 }}>{previewTemplate.name}</div>
              <div style={{ color: '#94a3b8', fontSize: 11 }}>{previewTemplate.desc}</div>
            </div>
            <div style={{ flex: 1 }} />
            <button onClick={() => { applyTemplate(previewTemplate); setPreviewTemplate(null); }}
              style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Apply Template
            </button>
            <button onClick={() => setPreviewTemplate(null)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer', marginLeft: 4 }}>
              <X size={16} />
            </button>
          </div>
          {/* Scrollable preview */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0', backgroundColor: '#e2e8f0' }} onClick={e => e.stopPropagation()}>
            <div style={{ background: '#fff', maxWidth: 1100, margin: '0 auto', boxShadow: '0 0 40px rgba(0,0,0,0.3)', pointerEvents: 'none' }}>
              {previewTemplate.pages[0].blocks.map((block, i) => (
                <BlockRender key={i} block={block} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
