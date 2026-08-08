import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, TrendingUp, DollarSign, MousePointer, ExternalLink, Edit2, Trash2, Copy, BarChart2, X, Search, Check, Rocket } from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import FunnelBuilder from './FunnelBuilder';
import type { Funnel as FunnelType, FunnelStep } from '../../types';
import { buildFunnelPage, type BrandContext, type TemplateMeta } from '../shared/pageTemplates';
import TemplateGallery from '../shared/TemplateGallery';
import { PagesStrip, ScaledPage } from '../shared/BlockRender';
import { activeAccount } from '../../services/tenancy';

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
  { id: 'squeeze', name: 'Squeeze Page', emoji: '📧', color: '#17191c', bg: '#f0f1f3', category: 'Lead Generation', desc: 'Capture emails with a single-focused opt-in page', defaultSteps: [{ name: 'Squeeze Page', type: 'optin' }, { name: 'Thank You', type: 'thankyou' }] },
  { id: 'lead_magnet', name: 'Lead Magnet', emoji: '🎯', color: '#3b3f45', bg: '#f0f1f3', category: 'Lead Generation', desc: 'Offer a free resource in exchange for email addresses', defaultSteps: [{ name: 'Opt-in Page', type: 'optin' }, { name: 'Thank You', type: 'thankyou' }] },
  { id: 'reverse_squeeze', name: 'Reverse Squeeze', emoji: '🔄', color: '#17191c', bg: '#f0f1f3', category: 'Lead Generation', desc: 'Give value first, then ask for the opt-in', defaultSteps: [{ name: 'Content Page', type: 'landing' }, { name: 'Opt-in Page', type: 'optin' }, { name: 'Thank You', type: 'thankyou' }] },
  { id: 'ask_campaign', name: 'Ask Campaign', emoji: '❓', color: '#ec4899', bg: '#fdf2f8', category: 'Lead Generation', desc: 'Survey prospects to understand their biggest problems', defaultSteps: [{ name: 'Survey Page', type: 'survey' }, { name: 'Thank You', type: 'thankyou' }] },
  { id: 'survey', name: 'Survey Funnel', emoji: '📋', color: '#f97316', bg: '#fff7ed', category: 'Lead Generation', desc: 'Qualify prospects with a multi-step survey funnel', defaultSteps: [{ name: 'Survey', type: 'survey' }, { name: 'Result Page', type: 'landing' }, { name: 'Opt-in', type: 'optin' }] },
  { id: 'sales', name: 'Sales Letter', emoji: '💰', color: '#22c55e', bg: '#f0fdf4', category: 'Sales', desc: 'Classic long-form sales page with order form', defaultSteps: [{ name: 'Sales Page', type: 'sales' }, { name: 'Order Form', type: 'checkout' }, { name: 'OTO', type: 'upsell' }, { name: 'Thank You', type: 'thankyou' }] },
  { id: 'vsl', name: 'Video Sales Letter', emoji: '🎬', color: '#ef4444', bg: '#fff5f5', category: 'Sales', desc: 'Video-driven sales funnel for high-ticket offers', defaultSteps: [{ name: 'VSL Page', type: 'sales' }, { name: 'Order Form', type: 'checkout' }, { name: 'OTO', type: 'upsell' }, { name: 'Thank You', type: 'thankyou' }] },
  { id: 'hero', name: 'Hero Funnel', emoji: '🦸', color: '#0891b2', bg: '#ecfeff', category: 'Sales', desc: 'Position you as the hero and authority in your niche', defaultSteps: [{ name: 'Hero Page', type: 'landing' }, { name: 'Application', type: 'checkout' }, { name: 'Thank You', type: 'thankyou' }] },
  { id: 'product_launch', name: 'Product Launch', emoji: '🚀', color: '#f59e0b', bg: '#fffbeb', category: 'Sales', desc: 'Build anticipation and launch your product with a bang', defaultSteps: [{ name: 'Pre-Launch 1', type: 'landing' }, { name: 'Pre-Launch 2', type: 'landing' }, { name: 'Pre-Launch 3', type: 'landing' }, { name: 'Sales Page', type: 'sales' }, { name: 'Order Form', type: 'checkout' }] },
  { id: 'invisible', name: 'Invisible Funnel', emoji: '👻', color: '#64748b', bg: '#f8fafc', category: 'Sales', desc: 'Charge a tiny fee upfront to build trust, then upsell', defaultSteps: [{ name: 'Free+Shipping', type: 'sales' }, { name: 'Order Form', type: 'checkout' }, { name: 'OTO', type: 'upsell' }, { name: 'Thank You', type: 'thankyou' }] },
  { id: 'daily_deal', name: 'Daily Deal', emoji: '⚡', color: '#dc2626', bg: '#fff5f5', category: 'Sales', desc: 'Time-sensitive daily deal funnel with urgency countdown', defaultSteps: [{ name: 'Deal Page', type: 'sales' }, { name: 'Order Form', type: 'checkout' }, { name: 'Thank You', type: 'thankyou' }] },
  { id: 'webinar', name: 'Webinar Funnel', emoji: '🎤', color: '#17191c', bg: '#f0f1f3', category: 'Events', desc: 'Register, deliver, and sell during your live webinar', defaultSteps: [{ name: 'Registration', type: 'webinar' }, { name: 'Confirmation', type: 'thankyou' }, { name: 'Webinar Room', type: 'webinar' }, { name: 'Replay', type: 'landing' }] },
  { id: 'auto_webinar', name: 'Auto Webinar', emoji: '🤖', color: '#3b3f45', bg: '#f0f1f3', category: 'Events', desc: 'Run evergreen automated webinars on autopilot 24/7', defaultSteps: [{ name: 'Registration', type: 'webinar' }, { name: 'Confirmation', type: 'thankyou' }, { name: 'Webinar Room', type: 'webinar' }, { name: 'Sales Page', type: 'sales' }] },
  { id: 'live_demo', name: 'Live Demo', emoji: '📡', color: '#0ea5e9', bg: '#f0f9ff', category: 'Events', desc: 'Book prospects into live product demonstrations', defaultSteps: [{ name: 'Demo Page', type: 'landing' }, { name: 'Application', type: 'checkout' }, { name: 'Confirmation', type: 'thankyou' }] },
  { id: 'summit', name: 'Summit Funnel', emoji: '🏔️', color: '#14b8a6', bg: '#f0fdfa', category: 'Events', desc: 'Virtual summit with multiple speakers and sessions', defaultSteps: [{ name: 'Registration', type: 'optin' }, { name: 'Summit Room', type: 'webinar' }, { name: 'Upgrade Page', type: 'sales' }] },
  { id: 'membership', name: 'Membership', emoji: '🔐', color: '#17191c', bg: '#f0f1f3', category: 'Membership', desc: 'Sell and deliver recurring membership access', defaultSteps: [{ name: 'Sales Page', type: 'sales' }, { name: 'Checkout', type: 'checkout' }, { name: 'Member Access', type: 'landing' }, { name: 'Welcome', type: 'thankyou' }] },
  { id: 'bridge', name: 'Bridge Page', emoji: '🌉', color: '#f97316', bg: '#fff7ed', category: 'Affiliate', desc: 'Warm up traffic before sending to an affiliate offer', defaultSteps: [{ name: 'Bridge Page', type: 'landing' }, { name: 'Offer Page', type: 'sales' }] },
  { id: 'application', name: 'Application', emoji: '📝', color: '#ec4899', bg: '#fdf2f8', category: 'High Ticket', desc: 'Qualify high-ticket clients with an application process', defaultSteps: [{ name: 'Application Page', type: 'checkout' }, { name: 'Confirmation', type: 'thankyou' }, { name: 'Schedule Call', type: 'landing' }] },
  { id: 'cancellation', name: 'Cancellation', emoji: '🛑', color: '#64748b', bg: '#f8fafc', category: 'Retention', desc: 'Save cancellations with downsells and pause options', defaultSteps: [{ name: 'Cancel Page', type: 'landing' }, { name: 'Downsell', type: 'sales' }, { name: 'Confirmed', type: 'thankyou' }] },
];

const CATEGORIES = ['All', ...Array.from(new Set(FUNNEL_TYPES.map(f => f.category)))];

/**
 * Build the funnel's pages with REAL block content from the shared template
 * library, so a newly created funnel opens fully designed instead of blank.
 */
function defaultPages(steps: { name: string; type: FunnelStep['type'] }[], ctx: BrandContext): FunnelStep[] {
  return steps.map(s => buildFunnelPage(s.name, s.type, ctx));
}

/** Brand context for generated pages, taken from the active sub-account. */
function brandContext(): BrandContext {
  const acct = activeAccount();
  return {
    name: acct?.businessName?.trim() || acct?.name?.trim() || 'Your Business',
    color: acct?.color || '#6366f1',
    tagline: acct?.industry ? `Trusted ${acct.industry.toLowerCase()} experts` : undefined,
  };
}

/* ─── Page wireframe preview (used in wizard cards + side panel) ─── */

function FunnelPageWireframe({ type }: { type: FunnelTypeConfig }) {
  const c = type.color;
  return (
    <div>
      {/* Navbar */}
      <div style={{ height: 30, background: 'white', borderBottom: `1px solid ${c}20`, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 8 }}>
        <div style={{ width: 44, height: 8, borderRadius: 4, background: c, opacity: 0.8 }} />
        <div style={{ flex: 1 }} />
        {[0, 1, 2].map(i => <div key={i} style={{ width: 26, height: 6, borderRadius: 3, background: `${c}30` }} />)}
        <div style={{ width: 44, height: 18, borderRadius: 9, background: c, opacity: 0.7 }} />
      </div>
      {/* Hero */}
      <div style={{ background: `linear-gradient(135deg, ${c}ee, ${c}66)`, padding: '30px 20px', textAlign: 'center' }}>
        <div style={{ width: '72%', height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.92)', margin: '0 auto 10px' }} />
        <div style={{ width: '52%', height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.65)', margin: '0 auto 6px' }} />
        <div style={{ width: '40%', height: 7, borderRadius: 3, background: 'rgba(255,255,255,0.5)', margin: '0 auto 18px' }} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <div style={{ width: 90, height: 26, borderRadius: 13, background: 'white', opacity: 0.95 }} />
          <div style={{ width: 70, height: 26, borderRadius: 13, background: 'rgba(255,255,255,0.25)', border: '1.5px solid rgba(255,255,255,0.6)' }} />
        </div>
      </div>
      {/* Stats bar */}
      <div style={{ background: '#f8fafc', padding: '14px 16px', display: 'flex', justifyContent: 'space-around', borderBottom: '1px solid #e2e8f0' }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ textAlign: 'center' }}>
            <div style={{ width: 34, height: 9, borderRadius: 4, background: c, opacity: 0.6, margin: '0 auto 4px' }} />
            <div style={{ width: 28, height: 5, borderRadius: 2, background: '#e2e8f0', margin: '0 auto' }} />
          </div>
        ))}
      </div>
      {/* Features */}
      <div style={{ background: 'white', padding: '22px 16px' }}>
        <div style={{ width: '46%', height: 10, borderRadius: 5, background: '#1e293b', opacity: 0.75, margin: '0 auto 6px' }} />
        <div style={{ width: '62%', height: 6, borderRadius: 3, background: '#e2e8f0', margin: '0 auto 18px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ background: `${c}08`, borderRadius: 8, padding: '12px 8px', textAlign: 'center' }}>
              <div style={{ width: 28, height: 28, borderRadius: 18, background: `${c}22`, margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 12, height: 12, borderRadius: 6, background: c, opacity: 0.55 }} />
              </div>
              <div style={{ width: '78%', height: 5, borderRadius: 2, background: '#64748b', opacity: 0.5, margin: '0 auto 4px' }} />
              <div style={{ width: '58%', height: 4, borderRadius: 2, background: '#e2e8f0', margin: '0 auto 3px' }} />
              <div style={{ width: '48%', height: 4, borderRadius: 2, background: '#f1f5f9', margin: '0 auto' }} />
            </div>
          ))}
        </div>
      </div>
      {/* Testimonials */}
      <div style={{ background: `${c}06`, padding: '18px 14px' }}>
        <div style={{ width: '42%', height: 9, borderRadius: 4, background: '#1e293b', opacity: 0.65, margin: '0 auto 14px' }} />
        {[0, 1, 2].map(i => (
          <div key={i} style={{ background: 'white', borderRadius: 8, padding: '10px 12px', marginBottom: 8, display: 'flex', gap: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ width: 28, height: 28, borderRadius: 18, background: `${c}25`, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 2, marginBottom: 5 }}>
                {[0, 1, 2, 3, 4].map(s => <div key={s} style={{ width: 8, height: 8, borderRadius: 4, background: '#fbbf24' }} />)}
              </div>
              <div style={{ width: '88%', height: 4, borderRadius: 2, background: '#e2e8f0', marginBottom: 3 }} />
              <div style={{ width: '70%', height: 4, borderRadius: 2, background: '#f1f5f9', marginBottom: 5 }} />
              <div style={{ width: '38%', height: 4, borderRadius: 2, background: `${c}30` }} />
            </div>
          </div>
        ))}
      </div>
      {/* Pricing */}
      <div style={{ background: 'white', padding: '20px 14px' }}>
        <div style={{ width: '36%', height: 9, borderRadius: 4, background: '#1e293b', opacity: 0.75, margin: '0 auto 6px' }} />
        <div style={{ width: '52%', height: 6, borderRadius: 3, background: '#e2e8f0', margin: '0 auto 14px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ borderRadius: 8, padding: '12px 8px', border: i === 1 ? `2px solid ${c}` : '1px solid #e2e8f0', background: i === 1 ? `${c}08` : 'white', textAlign: 'center' }}>
              <div style={{ width: '62%', height: 5, borderRadius: 2, background: i === 1 ? c : '#94a3b8', margin: '0 auto 5px', opacity: i === 1 ? 0.8 : 0.6 }} />
              <div style={{ width: '50%', height: 10, borderRadius: 5, background: i === 1 ? c : '#e2e8f0', margin: '0 auto 7px', opacity: i === 1 ? 0.75 : 1 }} />
              {[0, 1, 2, 3].map(r => <div key={r} style={{ width: '82%', height: 4, borderRadius: 2, background: '#f1f5f9', margin: '0 auto 3px' }} />)}
              <div style={{ width: '80%', height: 20, borderRadius: 10, background: i === 1 ? c : '#e2e8f0', margin: '8px auto 0', opacity: i === 1 ? 0.85 : 1 }} />
            </div>
          ))}
        </div>
      </div>
      {/* CTA */}
      <div style={{ background: `linear-gradient(135deg, ${c}, ${c}cc)`, padding: '26px 20px', textAlign: 'center' }}>
        <div style={{ width: '62%', height: 11, borderRadius: 5, background: 'rgba(255,255,255,0.9)', margin: '0 auto 8px' }} />
        <div style={{ width: '46%', height: 7, borderRadius: 3, background: 'rgba(255,255,255,0.6)', margin: '0 auto 16px' }} />
        <div style={{ width: 104, height: 28, borderRadius: 18, background: 'white', margin: '0 auto', opacity: 0.95 }} />
      </div>
      {/* Footer */}
      <div style={{ background: '#0f172a', padding: '18px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i}>
              <div style={{ width: 38, height: 5, borderRadius: 2, background: 'rgba(255,255,255,0.45)', marginBottom: 5 }} />
              {[0, 1, 2].map(r => <div key={r} style={{ width: 28, height: 3, borderRadius: 1, background: 'rgba(255,255,255,0.2)', marginBottom: 4 }} />)}
            </div>
          ))}
        </div>
        <div style={{ width: '50%', height: 3, borderRadius: 1, background: 'rgba(255,255,255,0.15)', margin: '0 auto' }} />
      </div>
    </div>
  );
}

/* ─── Funnel Type Wizard ─── */

function FunnelWizard({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, type: FunnelTypeConfig) => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<FunnelTypeConfig | null>(null);
  const [hoveredType, setHoveredType] = useState<FunnelTypeConfig | null>(null);
  const [previewScrollY, setPreviewScrollY] = useState(0);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [funnelName, setFunnelName] = useState('');
  const animRef = useRef<number | null>(null);
  const scrollYRef = useRef(0);

  const filtered = FUNNEL_TYPES.filter(f =>
    (category === 'All' || f.category === category) &&
    (search === '' || f.name.toLowerCase().includes(search.toLowerCase()) || f.desc.toLowerCase().includes(search.toLowerCase()))
  );

  /* Auto-scroll the right preview panel when a type is hovered */
  useEffect(() => {
    if (animRef.current !== null) clearInterval(animRef.current);
    scrollYRef.current = 0;
    setPreviewScrollY(0);
    if (hoveredType) {
      animRef.current = window.setInterval(() => {
        scrollYRef.current += 0.55;
        if (scrollYRef.current > 560) scrollYRef.current = 0;
        setPreviewScrollY(scrollYRef.current);
      }, 20);
    }
    return () => { if (animRef.current !== null) clearInterval(animRef.current); };
  }, [hoveredType?.id]);

  const handleSelectType = (t: FunnelTypeConfig) => {
    if (animRef.current !== null) clearInterval(animRef.current);
    setSelectedType(t);
    setFunnelName(t.name + ' Funnel');
    setStep(2);
  };

  const handleCreate = () => {
    if (!funnelName.trim() || !selectedType) return;
    onCreate(funnelName.trim(), selectedType);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      {step === 1 ? (
        <div style={{ backgroundColor: 'white', borderRadius: '16px', width: '1100px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 48px -12px rgba(16,24,40,0.25)' }}>
          {/* Header */}
          <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>Create New Funnel</h2>
              <p style={{ fontSize: '13px', color: '#475569', margin: '4px 0 0' }}>Choose a funnel type to get started with pre-built pages</p>
            </div>
            <button onClick={onClose} style={{ padding: '8px', border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}><X size={20} /></button>
          </div>

          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {/* Left sidebar — categories */}
            <div style={{ width: '155px', borderRight: '1px solid #e2e8f0', padding: '14px 10px', flexShrink: 0, overflowY: 'auto' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px 4px' }}>Category</p>
              {CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setCategory(cat)}
                  style={{ width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: '8px', border: 'none', backgroundColor: category === cat ? '#f0f1f3' : 'transparent', color: category === cat ? '#17191c' : '#374151', fontSize: '13px', fontWeight: category === cat ? 600 : 400, cursor: 'pointer', marginBottom: '2px' }}>
                  {cat}
                </button>
              ))}
            </div>

            {/* Center — type grid */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', flexShrink: 0 }}>
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
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {filtered.map(type => {
                    const isHovered = hoveredType?.id === type.id;
                    return (
                      <button key={type.id}
                        onClick={() => handleSelectType(type)}
                        onMouseEnter={() => setHoveredType(type)}
                        onMouseLeave={() => setHoveredType(null)}
                        style={{ padding: 0, border: `2px solid ${isHovered ? type.color : '#e2e8f0'}`, borderRadius: '12px', backgroundColor: 'white', cursor: 'pointer', textAlign: 'left', overflow: 'hidden', transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s', boxShadow: isHovered ? `0 6px 24px ${type.color}35` : 'none', transform: isHovered ? 'translateY(-2px)' : 'none' }}>
                        {/* Thumbnail — scrolls on hover to reveal full page */}
                        <div style={{ height: '90px', overflow: 'hidden', position: 'relative', backgroundColor: '#f8fafc' }}>
                          <div style={{ transform: isHovered ? 'translateY(-58%)' : 'translateY(0)', transition: isHovered ? 'transform 2.8s ease-in-out' : 'transform 0.4s ease-out', willChange: 'transform' }}>
                            <FunnelPageWireframe type={type} />
                          </div>
                          {/* Gradient overlay at bottom for non-hovered */}
                          {!isHovered && (
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '30px', background: 'linear-gradient(to top, #f8fafc, transparent)', pointerEvents: 'none' }} />
                          )}
                          <div style={{ position: 'absolute', top: 6, left: 8, fontSize: '16px' }}>{type.emoji}</div>
                          <div style={{ position: 'absolute', bottom: 6, right: 8, padding: '2px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.45)', color: 'white', fontSize: '9px', fontWeight: 700, backdropFilter: 'blur(2px)' }}>
                            {type.defaultSteps.length} pages
                          </div>
                          {!isHovered && (
                            <div style={{ position: 'absolute', bottom: 6, left: 8, fontSize: '9px', color: '#94a3b8', background: 'rgba(255,255,255,0.85)', padding: '2px 5px', borderRadius: 3, fontWeight: 500 }}>
                              Hover to scroll
                            </div>
                          )}
                        </div>
                        <div style={{ padding: '10px 12px' }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '3px' }}>{type.name}</div>
                          <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.4, marginBottom: '8px' }}>{type.desc}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                            {type.defaultSteps.slice(0, 3).map((s, i) => (
                              <span key={i} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: `${type.color}15`, color: type.color, fontWeight: 600 }}>{s.name}</span>
                            ))}
                            {type.defaultSteps.length > 3 && <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#f1f5f9', color: '#64748b', fontWeight: 600 }}>+{type.defaultSteps.length - 3}</span>}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right — live preview panel */}
            <div style={{ width: '295px', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0, transition: 'background 0.2s', backgroundColor: hoveredType ? '#fafafa' : '#f8fafc' }}>
              {hoveredType ? (
                <>
                  {/* Preview panel header */}
                  <div style={{ background: `linear-gradient(135deg, ${hoveredType.color}, ${hoveredType.color}bb)`, padding: '16px 18px', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '26px' }}>{hoveredType.emoji}</span>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: 'white', lineHeight: 1.2 }}>{hoveredType.name}</div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.75)', marginTop: '2px' }}>{hoveredType.category} · {hoveredType.defaultSteps.length} pages</div>
                      </div>
                    </div>
                    <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', margin: 0, lineHeight: 1.5 }}>{hoveredType.desc}</p>
                  </div>

                  {/* Auto-scrolling page preview */}
                  <div style={{ flex: 1, position: 'relative', overflow: 'hidden', borderBottom: '1px solid #e2e8f0', minHeight: 0 }}>
                    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
                      <div style={{ transform: `translateY(-${previewScrollY}px)`, willChange: 'transform' }}>
                        <FunnelPageWireframe type={hoveredType} />
                      </div>
                    </div>
                    {/* Top/bottom fade overlays */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '32px', background: 'linear-gradient(to bottom, #fafafa, transparent)', pointerEvents: 'none', zIndex: 1 }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '32px', background: 'linear-gradient(to top, #fafafa, transparent)', pointerEvents: 'none', zIndex: 1 }} />
                    {/* Live badge */}
                    <div style={{ position: 'absolute', top: 8, right: 10, zIndex: 2, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.92)', padding: '3px 7px', borderRadius: 5, fontSize: '10px', fontWeight: 600, color: '#64748b', backdropFilter: 'blur(4px)', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
                      <div style={{ width: 6, height: 6, borderRadius: 3, background: '#22c55e', animation: 'none' }} />
                      Live preview
                    </div>
                  </div>

                  {/* Funnel steps list */}
                  <div style={{ padding: '12px 14px 14px', flexShrink: 0 }}>
                    <p style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 8px' }}>Funnel Steps</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '12px' }}>
                      {hoveredType.defaultSteps.map((s, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '18px', height: '18px', borderRadius: '9px', background: `${hoveredType.color}20`, color: hoveredType.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
                          <span style={{ fontSize: '12px', color: '#374151', fontWeight: 500, flex: 1 }}>{s.name}</span>
                          <span style={{ fontSize: '9px', color: '#94a3b8', background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>{s.type}</span>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => handleSelectType(hoveredType)}
                      style={{ width: '100%', padding: '9px', background: hoveredType.color, color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <Check size={14} /> Use This Funnel
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
                  <div style={{ fontSize: '44px', marginBottom: '12px', opacity: 0.2 }}>👈</div>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', margin: '0 0 6px' }}>Hover to Preview</p>
                  <p style={{ fontSize: '12px', color: '#cbd5e1', margin: 0, lineHeight: 1.5 }}>Point at any funnel type to see a scrolling live preview of the page</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Step 2 — name + confirm */
        <div style={{ backgroundColor: 'white', borderRadius: '16px', width: '480px', padding: '32px', boxShadow: '0 24px 48px -12px rgba(16,24,40,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <button onClick={() => setStep(1)} style={{ padding: '8px', border: '1px solid #e2e8f0', borderRadius: '9px', background: 'white', cursor: 'pointer', display: 'flex', color: '#64748b' }}>
              <X size={14} />
            </button>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>Name Your Funnel</h2>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>You can always change this later</p>
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
            <button onClick={() => setStep(1)} style={{ flex: 1, padding: '10px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '14px', cursor: 'pointer', backgroundColor: 'white', color: '#374151', fontWeight: 500 }}>
              Back
            </button>
            <button onClick={handleCreate} disabled={!funnelName.trim()}
              style={{ flex: 2, padding: '10px', backgroundColor: funnelName.trim() ? '#17191c' : '#e2e8f0', color: funnelName.trim() ? 'white' : '#94a3b8', border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: 600, cursor: funnelName.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', boxShadow: funnelName.trim() ? '0 1px 2px rgba(23,25,28,0.3)' : 'none' }}>
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
  const navigate = useNavigate();
  const [builderFunnel, setBuilderFunnel] = useState<FunnelType | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [statsFunnel, setStatsFunnel] = useState<FunnelType | null>(null);

  // Records written by older versions (or a partial import) can be missing
  // these counters; a NaN here used to blank the whole page.
  const totalRevenue = funnels.reduce((s, f) => s + (f.revenue ?? 0), 0);
  const totalVisitors = funnels.reduce((s, f) => s + (f.visitors ?? 0), 0);
  const totalConversions = funnels.reduce((s, f) => s + f.conversions, 0);
  const avgCvr = totalVisitors > 0 ? ((totalConversions / totalVisitors) * 100).toFixed(1) : '0';

  const handleCreate = (name: string, type: FunnelTypeConfig) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const id = `funnel-${Date.now()}`;
    const pages = defaultPages(type.defaultSteps, brandContext());
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

  /** Create a funnel from a catalog template — pages arrive fully populated. */
  const handleUseTemplate = (meta: TemplateMeta, pages: FunnelStep[]) => {
    const name = meta.name;
    const newFunnel: FunnelType = {
      id: `funnel-${Date.now()}`,
      name,
      steps: pages.length,
      visitors: 0, conversions: 0, revenue: 0,
      status: 'draft',
      goal: meta.category,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      pages,
      createdAt: new Date().toISOString(),
    };
    addFunnel(newFunnel);
    setShowWizard(false);
    // Straight into the editor with the content loaded.
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
        onPersist={updates => updateFunnel(liveFunnel.id, updates)}
        onClose={() => setBuilderFunnel(null)}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Header title="Funnels & Sites" subtitle="Build and manage your marketing funnels" />
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {[
            { label: 'Total Revenue', value: `$${totalRevenue.toLocaleString()}`, icon: DollarSign, color: '#22c55e' },
            { label: 'Total Visitors', value: totalVisitors.toLocaleString(), icon: Eye, color: '#17191c' },
            { label: 'Conversions', value: totalConversions, icon: MousePointer, color: '#3b82f6' },
            { label: 'Avg Conversion Rate', value: `${avgCvr}%`, icon: TrendingUp, color: '#f59e0b' },
          ].map(item => (
            <div key={item.label}
              style={{ backgroundColor: 'white', borderRadius: '18px', padding: '20px', border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', display: 'flex', gap: '14px', alignItems: 'center', transition: 'box-shadow 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(16,24,40,0.08)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 2px rgba(16,24,40,0.04)'; }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '11px', backgroundColor: `${item.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <item.icon size={22} color={item.color} />
              </div>
              <div>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{item.label}</p>
                <p style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>{item.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs + New button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'inline-flex', gap: '2px', padding: '3px', borderRadius: '10px', border: '1px solid #e6e9f0', backgroundColor: '#f1f5f9' }}>
            <button onClick={() => {}} style={{ padding: '6px 18px', border: 'none', borderRadius: '8px', backgroundColor: 'white', color: '#0f172a', fontSize: '13px', fontWeight: 600, cursor: 'default', boxShadow: '0 1px 2px rgba(16,24,40,0.08)' }}>
              Funnels
            </button>
            <button onClick={() => navigate('/websites')} style={{ padding: '6px 18px', border: 'none', borderRadius: '8px', backgroundColor: 'transparent', color: '#64748b', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' }}>
              Websites
            </button>
          </div>
          <button onClick={() => setShowWizard(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', backgroundColor: '#17191c', color: 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 2px rgba(23,25,28,0.3)' }}>
            <Plus size={15} /> New Funnel
          </button>
        </div>

        {/* Funnel cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px', marginBottom: '24px' }}>
          {funnels.map(funnel => {
            const cvr = funnel.visitors > 0 ? ((funnel.conversions / funnel.visitors) * 100).toFixed(1) : '0';
            const ftype = FUNNEL_TYPES.find(t => funnel.goal === t.category);
            return (
              <div key={funnel.id}
                style={{ backgroundColor: 'white', borderRadius: '18px', border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', overflow: 'hidden', transition: 'box-shadow 0.15s, border-color 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(16,24,40,0.08)'; (e.currentTarget as HTMLDivElement).style.borderColor = '#d5d8dd'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 2px rgba(16,24,40,0.04)'; (e.currentTarget as HTMLDivElement).style.borderColor = '#e6e9f0'; }}>
                {/* Card header with color accent */}
                <div style={{ height: '4px', background: ftype ? `linear-gradient(90deg, ${ftype.color}, ${ftype.color}88)` : '#17191c' }} />
                {/* Every step previewed in one strip — hover to scroll them */}
                {(funnel.pages?.length ?? 0) > 0 && (
                  <div style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => setBuilderFunnel(funnel)}>
                    {funnel.pages!.length > 1
                      ? <PagesStrip pages={funnel.pages!} height={132} />
                      : <ScaledPage page={funnel.pages![0]} height={132} />}
                  </div>
                )}
                <div style={{ padding: '18px 20px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{funnel.name}</h3>
                      <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>{funnel.pages?.length ?? funnel.steps} pages · {funnel.goal ?? 'Lead Generation'}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                      <button onClick={() => handleToggleStatus(funnel)}
                        style={{ padding: '3px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: 600, backgroundColor: funnel.status === 'active' ? '#ecfdf5' : '#f1f5f9', color: funnel.status === 'active' ? '#16a34a' : '#64748b', border: 'none', cursor: 'pointer' }}>
                        {funnel.status === 'active' ? 'Active' : 'Draft'}
                      </button>
                      <button onClick={() => setBuilderFunnel(funnel)} title="Edit"
                        style={{ padding: '6px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', display: 'flex', color: '#17191c' }}>
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDuplicate(funnel)} title="Duplicate"
                        style={{ padding: '6px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', display: 'flex', color: '#64748b' }}>
                        <Copy size={14} />
                      </button>
                      <button onClick={() => setDeleteConfirm(funnel.id)} title="Delete"
                        style={{ padding: '6px', borderRadius: '8px', border: '1px solid #fee2e2', backgroundColor: '#fff5f5', cursor: 'pointer', display: 'flex', color: '#dc2626' }}>
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
                        <span style={{ fontSize: '11px', padding: '2px 9px', borderRadius: '9999px', backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 500, whiteSpace: 'nowrap' }}>{page.name}</span>
                        {i < (funnel.pages ?? []).length - 1 && <span style={{ color: '#cbd5e1', fontSize: '12px' }}>→</span>}
                      </React.Fragment>
                    ))}
                  </div>
                )}

                <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  {[
                    { label: 'Visitors', value: (funnel.visitors ?? 0).toLocaleString(), color: '#17191c' },
                    { label: 'Conversions', value: (funnel.conversions ?? 0).toLocaleString(), color: '#22c55e' },
                    { label: 'Revenue', value: `$${(funnel.revenue ?? 0).toLocaleString()}`, color: '#f59e0b' },
                  ].map(m => (
                    <div key={m.label} style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '20px', fontWeight: 700, color: m.color, margin: 0, letterSpacing: '-0.02em' }}>{m.value}</p>
                      <p style={{ fontSize: '11px', color: '#94a3b8', margin: '3px 0 0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{m.label}</p>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '0 20px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>
                    <span>Conversion Rate</span><span style={{ fontWeight: 700, color: '#0f172a' }}>{cvr}%</span>
                  </div>
                  <div style={{ height: '6px', backgroundColor: '#f1f5f9', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(parseFloat(cvr) * 5, 100)}%`, background: '#17191c', borderRadius: '9999px' }} />
                  </div>
                </div>
                <div style={{ padding: '14px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '8px' }}>
                  <button onClick={() => setBuilderFunnel(funnel)}
                    style={{ flex: 1, padding: '8px', borderRadius: '9px', border: 'none', backgroundColor: '#17191c', color: 'white', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', boxShadow: '0 1px 2px rgba(23,25,28,0.3)' }}>
                    <Edit2 size={13} /> Open Builder
                  </button>
                  <button onClick={() => setStatsFunnel(funnel)} title="Funnel analytics"
                    style={{ flex: 1, padding: '8px', borderRadius: '9px', border: '1px solid #e2e8f0', backgroundColor: 'white', color: '#374151', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                    <BarChart2 size={13} /> Analytics
                  </button>
                  <button onClick={() => navigate(`/preview-funnel/${funnel.id}`)} title="Preview funnel"
                    style={{ padding: '8px 10px', borderRadius: '9px', border: '1px solid #e2e8f0', backgroundColor: 'white', color: '#374151', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ExternalLink size={13} />
                  </button>
                </div>
              </div>
            );
          })}

          {funnels.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '72px 60px', backgroundColor: 'white', border: '1px solid #e6e9f0', borderRadius: '16px', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: '#eceef1', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Rocket size={28} color="#17191c" />
              </div>
              <p style={{ fontWeight: 700, color: '#0f172a', margin: '0 0 6px', fontSize: '16px' }}>No funnels yet</p>
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 20px' }}>Choose from 19 funnel types to start converting visitors into customers</p>
              <button onClick={() => setShowWizard(true)} style={{ padding: '9px 16px', backgroundColor: '#17191c', color: 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', boxShadow: '0 1px 2px rgba(23,25,28,0.3)' }}>
                <Plus size={14} /> Create Your First Funnel
              </button>
            </div>
          )}
        </div>
      </div>

      {statsFunnel && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setStatsFunnel(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 26, width: 'min(520px,100%)', boxShadow: '0 24px 60px rgba(15,23,42,0.3)' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{statsFunnel.name}</h3>
            <p style={{ margin: '0 0 18px', fontSize: 12.5, color: '#64748b' }}>Performance across {statsFunnel.pages?.length ?? 0} pages</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 18 }}>
              {[
                { l: 'Visitors', v: (statsFunnel.visitors ?? 0).toLocaleString(), c: '#17191c' },
                { l: 'Conversions', v: (statsFunnel.conversions ?? 0).toLocaleString(), c: '#22c55e' },
                { l: 'Conv. rate', v: statsFunnel.visitors > 0 ? `${((statsFunnel.conversions / statsFunnel.visitors) * 100).toFixed(1)}%` : '0%', c: '#6366f1' },
              ].map(m => (
                <div key={m.l} style={{ background: '#f8fafc', borderRadius: 12, padding: '14px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: m.c }}>{m.v}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{m.l}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11.5, color: '#94a3b8', margin: '0 0 16px', lineHeight: 1.55 }}>
              Conversions increment when a visitor submits a form on the funnel preview or published page.
            </p>
            <button onClick={() => setStatsFunnel(null)} style={{ width: '100%', padding: '10px 0', borderRadius: 9, border: 'none', background: '#17191c', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      )}

      {showWizard && (
        <TemplateGallery
          ctx={brandContext()}
          kind="funnel"
          title="Choose a funnel template"
          onClose={() => setShowWizard(false)}
          onUse={handleUseTemplate}
        />
      )}

      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '24px', width: '360px', boxShadow: '0 24px 48px -12px rgba(16,24,40,0.25)' }}>
            <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px', letterSpacing: '-0.02em' }}>Delete Funnel?</h4>
            <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 20px' }}>This action cannot be undone. All pages and data will be permanently deleted.</p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ padding: '9px 16px', border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '13px', fontWeight: 500, color: '#374151', cursor: 'pointer', backgroundColor: 'white' }}>Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} style={{ padding: '9px 16px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 2px rgba(220,38,38,0.3)' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
