import { useState, useRef, Fragment, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { Globe, Search, Smartphone, Tablet, Monitor, Undo2, Redo2 } from 'lucide-react';
import type { Website, FunnelStep, FunnelBlock } from '../../types';
import { useHistory } from '../../hooks/useHistory';

// ── Reuse block types and uid from shared patterns ───────────────────────────
let DRAG_TYPE: 'new' | 'move' | null = null;
let DRAG_PAYLOAD = '';
const uid = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
type BlockType = FunnelBlock['type'];

const DEFAULTS: Record<BlockType, FunnelBlock['settings']> = {
  navbar: { bgColor: '#ffffff', textColor: '#0f172a', navLogo: 'MySite', buttonText: 'Contact', buttonColor: '#6366f1', buttonTextColor: '#ffffff', navLinks: [{ label: 'Home', url: '#' }, { label: 'About', url: '#about' }, { label: 'Services', url: '#services' }, { label: 'Contact', url: '#contact' }] },
  hero: { bgGradient: 'linear-gradient(135deg,#1e3a5f,#2563eb)', textColor: '#ffffff', subheading: 'We help businesses grow with smart digital strategies.', buttonText: 'Get Started', buttonColor: '#ffffff', buttonTextColor: '#1e3a5f', secondaryButtonText: 'Learn More', align: 'center', minHeight: 520, padding: 80 },
  features: { bgColor: '#f8fafc', textColor: '#0f172a', subtitle: 'Why choose us', align: 'center', iconColor: '#6366f1', columns: 3, padding: 80, featureItems: [{ icon: '⚡', title: 'Fast', desc: 'Lightning-fast results you can count on.' }, { icon: '🔒', title: 'Secure', desc: 'Enterprise-grade security.' }, { icon: '🎯', title: 'Focused', desc: 'Results-driven approach.' }] },
  testimonials: { bgColor: '#ffffff', textColor: '#0f172a', subtitle: 'What our clients say', align: 'center', padding: 80, testimonialItems: [{ quote: 'Outstanding service and results.', author: 'Jane Smith', role: 'CEO at Acme', stars: 5 }, { quote: 'Highly recommend to any business.', author: 'John Doe', role: 'Founder at Startup', stars: 5 }] },
  pricing: { bgColor: '#f8fafc', textColor: '#0f172a', subtitle: 'Simple pricing', align: 'center', padding: 80, pricingPlans: [{ name: 'Starter', price: '$29', period: '/mo', features: ['5 pages', 'Basic SEO', 'Email support'], highlighted: false, buttonText: 'Get Started' }, { name: 'Pro', price: '$79', period: '/mo', features: ['Unlimited pages', 'Advanced SEO', 'Priority support', 'Custom domain'], highlighted: true, buttonText: 'Get Pro' }] },
  columns: { bgColor: '#ffffff', textColor: '#0f172a', subheading: 'We build websites that convert visitors into customers.', buttonText: 'Learn More', buttonColor: '#6366f1', buttonTextColor: '#ffffff', imagePosition: 'right', imageUrl: '', listItems: ['Professional design', 'Mobile-first approach', 'SEO optimized', 'Fast load times'], padding: 80 },
  cta: { bgGradient: 'linear-gradient(135deg,#6366f1,#8b5cf6)', textColor: '#ffffff', subheading: 'Ready to take your business to the next level?', buttonText: 'Get in Touch', buttonColor: '#ffffff', buttonTextColor: '#6366f1', align: 'center', padding: 80 },
  stats: { bgColor: '#0f172a', textColor: '#ffffff', padding: 60, statItems: [{ value: '500+', label: 'Clients', icon: '🤝' }, { value: '10yr', label: 'Experience', icon: '🏆' }, { value: '99%', label: 'Satisfaction', icon: '⭐' }, { value: '24/7', label: 'Support', icon: '💬' }] },
  faq: { bgColor: '#ffffff', textColor: '#0f172a', subtitle: 'Common questions', align: 'left', padding: 80, faqItems: [{ q: 'How long does a website take?', a: 'Typically 2–4 weeks for a standard business site.' }, { q: 'Do you offer ongoing support?', a: 'Yes — all plans include monthly maintenance.' }] },
  footer: { bgColor: '#0f172a', textColor: '#94a3b8', navLogo: 'MySite', padding: 60, footerColumns: [{ heading: 'Company', links: [{ label: 'About', url: '#' }, { label: 'Services', url: '#' }, { label: 'Blog', url: '#' }] }, { heading: 'Support', links: [{ label: 'Contact', url: '#' }, { label: 'FAQ', url: '#' }] }], footerCopyright: `© ${new Date().getFullYear()} MySite. All rights reserved.` },
  gallery: { bgColor: '#f8fafc', textColor: '#0f172a', subtitle: 'Our work', columns: 3, galleryImages: ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#0891b2'], padding: 60, align: 'center' },
  heading: { size: 'xl', color: '#0f172a', align: 'center', padding: 16, fontWeight: '700' },
  text: { size: 'md', color: '#64748b', align: 'center', padding: 12 },
  button: { buttonColor: '#6366f1', buttonTextColor: '#ffffff', align: 'center', buttonText: 'Click Here', url: '#', padding: 20, borderRadius: 8 },
  image: { align: 'center', imageUrl: '', imageAlt: 'Image', padding: 16, shadow: false, borderRadius: 0 },
  video: { align: 'center', url: '', padding: 24 },
  form: { bgColor: '#f8fafc', buttonColor: '#6366f1', buttonTextColor: '#ffffff', buttonText: 'Send Message', align: 'center', padding: 48, formFields: [{ label: 'Name', type: 'text', required: true }, { label: 'Email', type: 'email', required: true }, { label: 'Message', type: 'textarea', required: true }], redirectUrl: '' },
  divider: { color: '#e2e8f0', padding: 16 },
  spacer: { padding: 60 },
  countdown: { bgColor: '#0f172a', textColor: '#ffffff', subheading: 'Coming soon!', align: 'center', padding: 60 },
};

const DEFAULT_CONTENT: Record<BlockType, string> = {
  navbar: '', hero: 'Welcome to Our Website', features: 'Our Services',
  testimonials: 'Client Reviews', pricing: 'Our Pricing',
  columns: 'About Us', cta: 'Ready to Work Together?', stats: '',
  faq: 'FAQ', footer: '', gallery: 'Our Portfolio',
  heading: 'Section Heading', text: 'Add your content here.',
  button: 'Click Here', image: '', video: '', form: 'Contact Us',
  divider: '', spacer: '', countdown: 'Launching Soon',
};

function createBlock(type: BlockType): FunnelBlock {
  return { id: uid(), type, content: DEFAULT_CONTENT[type], settings: { ...DEFAULTS[type] } };
}
let _pi = 0;
function mkPage(name: string, type: FunnelStep['type'] = 'custom'): FunnelStep {
  return { id: `wp${++_pi}`, name, type, slug: name.toLowerCase().replace(/\s+/g, '-'), blocks: [], visitors: 0, conversions: 0 };
}
let _bi = 0;
function mkBlock(type: BlockType, content = '', extra: FunnelBlock['settings'] = {}): FunnelBlock {
  return { id: `wt${++_bi}`, type, content: content || DEFAULT_CONTENT[type], settings: { ...DEFAULTS[type], ...extra } };
}

// ── Website templates ─────────────────────────────────────────────────────────
interface WSTemplate { id: string; name: string; emoji: string; heroColor: string; desc: string; pages: { name: string; type: FunnelStep['type']; blocks: FunnelBlock[] }[]; }

const WS_TEMPLATES: WSTemplate[] = [
  {
    id: 'business', name: 'Business Website', emoji: '🏢', heroColor: 'linear-gradient(135deg,#1e3a5f,#2563eb)',
    desc: 'Professional multi-page business site with services, about, and contact.',
    pages: [
      { name: 'Home', type: 'landing', blocks: [mkBlock('navbar'), mkBlock('hero', 'Growing Businesses Through Strategy & Design', { bgGradient: 'linear-gradient(135deg,#1e3a5f,#2563eb)', subheading: 'Full-service digital agency helping companies scale since 2010.', buttonText: 'Get a Free Quote', secondaryButtonText: 'View Our Work' }), mkBlock('stats', '', { bgColor: '#f8fafc', textColor: '#0f172a', statItems: [{ value: '500+', label: 'Clients Served', icon: '🤝' }, { value: '15yr', label: 'In Business', icon: '🏆' }, { value: '98%', label: 'Satisfaction', icon: '⭐' }, { value: '24/7', label: 'Support', icon: '💬' }] }), mkBlock('features', 'What We Do', { featureItems: [{ icon: '💻', title: 'Web Design', desc: 'Stunning, conversion-focused websites.' }, { icon: '📱', title: 'Mobile Apps', desc: 'iOS & Android apps users love.' }, { icon: '📈', title: 'Digital Marketing', desc: 'SEO, PPC, and social media.' }, { icon: '🎨', title: 'Brand Identity', desc: 'Logos and brand systems.' }, { icon: '⚙️', title: 'IT Solutions', desc: 'Cloud, security, and infrastructure.' }, { icon: '📊', title: 'Analytics', desc: 'Data-driven insights and reporting.' }] }), mkBlock('testimonials', 'What Clients Say'), mkBlock('cta', 'Ready to Grow Your Business?', { buttonText: 'Start a Project', secondaryButtonText: 'Schedule a Call' }), mkBlock('footer')] },
      { name: 'About', type: 'custom', blocks: [mkBlock('navbar'), mkBlock('hero', 'About Our Company', { bgGradient: 'linear-gradient(135deg,#334155,#1e293b)', subheading: 'Founded in 2010, we\'ve helped 500+ businesses grow through smart digital strategies.', buttonText: 'Meet the Team' }), mkBlock('columns', 'Our Mission', { subheading: 'We believe every business deserves a strong digital presence.', listItems: ['Client-first approach', 'Transparent pricing', 'Measurable results', 'Long-term partnerships'], imagePosition: 'right' }), mkBlock('stats'), mkBlock('footer')] },
      { name: 'Contact', type: 'custom', blocks: [mkBlock('navbar'), mkBlock('hero', 'Get in Touch', { bgGradient: 'linear-gradient(135deg,#1e3a5f,#2563eb)', subheading: 'We\'d love to hear from you. Send us a message and we\'ll get back to you within 24 hours.', buttonText: '' }), mkBlock('form', 'Send Us a Message', { formFields: [{ label: 'Full Name', type: 'text', required: true }, { label: 'Email', type: 'email', required: true }, { label: 'Phone', type: 'phone', required: false }, { label: 'Message', type: 'textarea', required: true }] }), mkBlock('footer')] },
    ],
  },
  {
    id: 'portfolio', name: 'Creative Portfolio', emoji: '✨', heroColor: 'linear-gradient(135deg,#f59e0b,#ec4899)',
    desc: 'Stunning portfolio for designers, developers and creatives.',
    pages: [
      { name: 'Portfolio', type: 'landing', blocks: [mkBlock('navbar', '', { navLogo: 'Creative.Co', buttonText: 'Hire Me', buttonColor: '#f59e0b', buttonTextColor: '#0f172a' }), mkBlock('hero', "Hi, I Design Beautiful Digital Experiences", { bgGradient: 'linear-gradient(135deg,#fbbf24,#f59e0b,#ec4899)', subheading: 'Award-winning UX/UI designer with 8+ years helping brands stand out.', buttonText: 'View My Work', buttonColor: '#0f172a', buttonTextColor: '#ffffff', secondaryButtonText: 'Get in Touch' }), mkBlock('gallery', 'Selected Work', { galleryImages: ['#6366f1', '#f59e0b', '#ec4899', '#0891b2', '#22c55e', '#f97316', '#8b5cf6', '#14b8a6', '#ef4444'], columns: 3 }), mkBlock('features', 'Skills & Expertise', { featureItems: [{ icon: '🎨', title: 'UI Design', desc: 'Pixel-perfect interfaces.' }, { icon: '🧠', title: 'UX Research', desc: 'Data-driven decisions.' }, { icon: '💻', title: 'Frontend Dev', desc: 'I code my designs in React.' }, { icon: '📱', title: 'Mobile', desc: 'iOS & Android design.' }] }), mkBlock('testimonials', 'Client Feedback', { testimonialItems: [{ quote: 'Alex redesigned our app and engagement jumped 85%.', author: 'Ben Carter', role: 'CEO, AppStartup', stars: 5 }, { quote: 'Best designer I\'ve ever worked with.', author: 'Sarah Kim', role: 'Product Lead', stars: 5 }] }), mkBlock('form', "Let's Work Together", { bgColor: '#fefce8', buttonColor: '#f59e0b', buttonTextColor: '#0f172a' }), mkBlock('footer', '', { navLogo: 'Creative.Co' })] },
    ],
  },
  {
    id: 'blog', name: 'Blog / Magazine', emoji: '📝', heroColor: 'linear-gradient(135deg,#0891b2,#06b6d4)',
    desc: 'Clean editorial layout for content creators and bloggers.',
    pages: [
      { name: 'Home', type: 'landing', blocks: [mkBlock('navbar', '', { buttonText: 'Subscribe', buttonColor: '#0891b2' }), mkBlock('hero', 'Stories Worth Reading', { bgGradient: 'linear-gradient(135deg,#0891b2,#06b6d4)', subheading: 'Thoughtful articles on technology, design, and business growth.', buttonText: 'Start Reading', secondaryButtonText: 'Subscribe Free' }), mkBlock('features', 'Trending Topics', { bgColor: '#f8fafc', featureItems: [{ icon: '💻', title: 'Technology', desc: 'Latest in tech, AI, and software.' }, { icon: '🎨', title: 'Design', desc: 'UI, UX, and creative inspiration.' }, { icon: '📈', title: 'Business', desc: 'Growth strategies and case studies.' }, { icon: '🧠', title: 'Productivity', desc: 'Work smarter, not harder.' }], columns: 4 }), mkBlock('stats', '', { bgColor: '#0891b2', textColor: '#ffffff', statItems: [{ value: '50K+', label: 'Readers', icon: '👥' }, { value: '500+', label: 'Articles', icon: '📝' }, { value: 'Weekly', label: 'New Posts', icon: '📅' }, { value: 'Free', label: 'Forever', icon: '❤️' }] }), mkBlock('form', 'Get Articles in Your Inbox', { bgColor: '#eff6ff', buttonColor: '#0891b2', buttonText: 'Subscribe Free', formFields: [{ label: 'Email Address', type: 'email', required: true }] }), mkBlock('footer')] },
    ],
  },
  {
    id: 'restaurant', name: 'Restaurant / Cafe', emoji: '🍽️', heroColor: 'linear-gradient(135deg,#b45309,#92400e)',
    desc: 'Menu, gallery, and reservations all in one beautiful layout.',
    pages: [
      { name: 'Home', type: 'landing', blocks: [mkBlock('navbar', '', { bgColor: '#1c0a00', textColor: '#f5e6d3', buttonText: 'Reserve a Table', buttonColor: '#b45309', buttonTextColor: '#ffffff' }), mkBlock('hero', 'Authentic Flavors, Unforgettable Experience', { bgGradient: 'linear-gradient(135deg,#78350f,#1c0a00)', subheading: 'Farm-to-table cuisine in the heart of the city. Open daily 11am–10pm.', buttonText: 'Reserve a Table', buttonColor: '#b45309', secondaryButtonText: 'View Menu' }), mkBlock('features', 'Why Dine With Us', { bgColor: '#fffbf5', featureItems: [{ icon: '🌿', title: 'Fresh Ingredients', desc: 'Locally sourced produce, delivered daily.' }, { icon: '👨‍🍳', title: 'Expert Chefs', desc: 'Michelin-trained kitchen team.' }, { icon: '🍷', title: 'Curated Wine List', desc: '200+ wines from around the world.' }, { icon: '🎵', title: 'Live Music', desc: 'Jazz every Friday and Saturday night.' }] }), mkBlock('gallery', 'Our Dishes', { galleryImages: ['#b45309', '#92400e', '#d97706', '#78350f', '#b45309', '#92400e'], columns: 3 }), mkBlock('testimonials', 'Guest Reviews', { testimonialItems: [{ quote: 'Best dining experience in the city. The lamb is extraordinary.', author: 'Maria G.', role: 'Regular Guest', stars: 5 }, { quote: 'Perfect for date night. Service is impeccable.', author: 'Tom & Lisa', role: 'Anniversary Dinner', stars: 5 }] }), mkBlock('form', 'Reserve Your Table', { bgColor: '#fffbf5', buttonColor: '#b45309', buttonText: 'Request Reservation', formFields: [{ label: 'Name', type: 'text', required: true }, { label: 'Email', type: 'email', required: true }, { label: 'Date & Time', type: 'text', required: true }, { label: 'Party Size', type: 'number', required: true }] }), mkBlock('footer', '', { bgColor: '#1c0a00', navLogo: 'La Maison', footerCopyright: `© ${new Date().getFullYear()} La Maison Restaurant. All rights reserved.` })] },
    ],
  },
];

// ── Catalog ───────────────────────────────────────────────────────────────────
const WS_CATALOG: { category: string; blocks: { type: BlockType; label: string; emoji: string }[] }[] = [
  { category: 'Sections', blocks: [{ type: 'hero', label: 'Hero Banner', emoji: '🦸' }, { type: 'features', label: 'Services/Features', emoji: '⚡' }, { type: 'testimonials', label: 'Testimonials', emoji: '💬' }, { type: 'pricing', label: 'Pricing', emoji: '💰' }, { type: 'columns', label: 'Two Column', emoji: '◼◼' }, { type: 'cta', label: 'Call to Action', emoji: '📣' }, { type: 'stats', label: 'Stats Bar', emoji: '📊' }, { type: 'faq', label: 'FAQ', emoji: '❓' }, { type: 'gallery', label: 'Gallery', emoji: '🖼️' }] },
  { category: 'Navigation', blocks: [{ type: 'navbar', label: 'Navigation Bar', emoji: '🔝' }, { type: 'footer', label: 'Footer', emoji: '🔚' }] },
  { category: 'Content', blocks: [{ type: 'heading', label: 'Heading', emoji: 'H' }, { type: 'text', label: 'Text', emoji: 'T' }, { type: 'button', label: 'Button', emoji: '▶' }, { type: 'image', label: 'Image', emoji: '🖼' }, { type: 'video', label: 'Video', emoji: '▶️' }, { type: 'form', label: 'Contact Form', emoji: '📋' }, { type: 'divider', label: 'Divider', emoji: '—' }, { type: 'spacer', label: 'Spacer', emoji: '↕' }] },
];

// ── Drop zone ─────────────────────────────────────────────────────────────────
function DropZone({ index, active, onOver, onDrop }: { index: number; active: boolean; onOver: (i: number) => void; onDrop: (i: number) => void }) {
  return (
    <div
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); onOver(index); }}
      onDragLeave={() => onOver(-1)}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); onDrop(index); }}
      style={{ height: active ? 52 : 6, background: active ? '#e0e7ff' : 'transparent', border: active ? '2px dashed #6366f1' : '2px dashed transparent', borderRadius: 4, margin: active ? '0 8px' : 0, transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {active && <span style={{ fontSize: 12, color: '#6366f1', fontWeight: 700 }}>Drop here</span>}
    </div>
  );
}

// ── Block renderer ────────────────────────────────────────────────────────────
function BlockRender({ block }: { block: FunnelBlock }) {
  const s = block.settings;
  const bg: CSSProperties = s.bgGradient ? { background: s.bgGradient } : s.bgImage ? { backgroundImage: `url(${s.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: s.bgColor ?? '#fff' };
  const pad = s.padding ?? 40;

  switch (block.type) {
    case 'navbar': return (
      <nav style={{ ...bg, padding: '0 40px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', position: 'relative', zIndex: 10 }}>
        <span style={{ fontWeight: 900, fontSize: 20, color: s.textColor ?? '#0f172a' }}>{s.navLogo ?? 'MySite'}</span>
        <div style={{ display: 'flex', gap: 24 }}>{(s.navLinks ?? []).map((l, i) => <a key={i} href={l.url} style={{ color: s.textColor ?? '#0f172a', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>{l.label}</a>)}</div>
        {s.buttonText && <button style={{ padding: '8px 18px', background: s.buttonColor ?? '#6366f1', color: s.buttonTextColor ?? '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{s.buttonText}</button>}
      </nav>
    );
    case 'hero': return (
      <section style={{ ...bg, padding: `${pad}px 60px`, textAlign: s.align ?? 'center', minHeight: s.minHeight ?? 420, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <h1 style={{ fontSize: 48, fontWeight: 900, color: s.textColor ?? '#fff', margin: '0 0 16px', maxWidth: 760, lineHeight: 1.15 }}>{block.content}</h1>
        {s.subheading && <p style={{ fontSize: 18, color: `${s.textColor ?? '#fff'}cc`, margin: '0 0 36px', maxWidth: 580, lineHeight: 1.6 }}>{s.subheading}</p>}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
          {s.buttonText && <button style={{ padding: '14px 28px', background: s.buttonColor ?? '#fff', color: s.buttonTextColor ?? '#1e3a5f', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>{s.buttonText}</button>}
          {s.secondaryButtonText && <button style={{ padding: '14px 28px', background: 'transparent', color: s.textColor ?? '#fff', border: `2px solid ${s.textColor ?? '#fff'}66`, borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{s.secondaryButtonText}</button>}
        </div>
      </section>
    );
    case 'features': return (
      <section style={{ ...bg, padding: `${pad}px 60px` }}>
        {block.content && <h2 style={{ textAlign: s.align ?? 'center', fontSize: 32, fontWeight: 800, color: s.textColor ?? '#0f172a', margin: '0 0 8px' }}>{block.content}</h2>}
        {s.subtitle && <p style={{ textAlign: s.align ?? 'center', fontSize: 16, color: `${s.textColor ?? '#0f172a'}99`, margin: '0 0 40px' }}>{s.subtitle}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${s.columns ?? 3}, 1fr)`, gap: 28 }}>
          {(s.featureItems ?? []).map((f, i) => (
            <div key={i} style={{ padding: 28, borderRadius: 14, background: 'rgba(255,255,255,0.7)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: 32, marginBottom: 14 }}>{f.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 17, color: s.textColor ?? '#0f172a', marginBottom: 8 }}>{f.title}</div>
              <div style={{ fontSize: 14, color: `${s.textColor ?? '#0f172a'}99`, lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>
    );
    case 'columns': return (
      <section style={{ ...bg, padding: `${pad}px 60px` }}>
        <div style={{ display: 'flex', gap: 60, alignItems: 'center', flexDirection: s.imagePosition === 'left' ? 'row-reverse' : 'row', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 34, fontWeight: 800, color: s.textColor ?? '#0f172a', margin: '0 0 16px' }}>{block.content}</h2>
            <p style={{ fontSize: 16, color: `${s.textColor ?? '#0f172a'}99`, margin: '0 0 24px', lineHeight: 1.7 }}>{s.subheading}</p>
            {(s.listItems ?? []).map((li, i) => <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12, fontSize: 15, color: s.textColor ?? '#0f172a' }}><span style={{ color: '#22c55e', fontWeight: 700, marginTop: 1 }}>✓</span>{li}</div>)}
            {s.buttonText && <button style={{ marginTop: 20, padding: '12px 24px', background: s.buttonColor ?? '#6366f1', color: s.buttonTextColor ?? '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{s.buttonText}</button>}
          </div>
          <div style={{ width: 340, height: 280, borderRadius: 16, background: s.imageUrl ? `url(${s.imageUrl}) center/cover` : 'linear-gradient(135deg,#6366f1,#8b5cf6)', flexShrink: 0 }} />
        </div>
      </section>
    );
    case 'testimonials': return (
      <section style={{ ...bg, padding: `${pad}px 60px` }}>
        {block.content && <h2 style={{ textAlign: s.align ?? 'center', fontSize: 32, fontWeight: 800, color: s.textColor ?? '#0f172a', margin: '0 0 8px' }}>{block.content}</h2>}
        {s.subtitle && <p style={{ textAlign: 'center', fontSize: 16, color: `${s.textColor ?? '#0f172a'}99`, margin: '0 0 40px' }}>{s.subtitle}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
          {(s.testimonialItems ?? []).map((t, i) => (
            <div key={i} style={{ padding: 28, borderRadius: 14, background: '#fff', boxShadow: '0 2px 16px rgba(0,0,0,0.07)', border: '1px solid #f1f5f9' }}>
              <div style={{ color: '#f59e0b', fontSize: 16, marginBottom: 14 }}>{'★'.repeat(t.stars ?? 5)}</div>
              <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.7, margin: '0 0 18px', fontStyle: 'italic' }}>"{t.quote}"</p>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{t.author}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.role}</div>
            </div>
          ))}
        </div>
      </section>
    );
    case 'pricing': return (
      <section style={{ ...bg, padding: `${pad}px 60px` }}>
        {block.content && <h2 style={{ textAlign: 'center', fontSize: 32, fontWeight: 800, color: s.textColor ?? '#0f172a', margin: '0 0 8px' }}>{block.content}</h2>}
        {s.subtitle && <p style={{ textAlign: 'center', fontSize: 16, color: `${s.textColor ?? '#0f172a'}99`, margin: '0 0 40px' }}>{s.subtitle}</p>}
        <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
          {(s.pricingPlans ?? []).map((p, i) => (
            <div key={i} style={{ padding: '36px 28px', borderRadius: 16, background: p.highlighted ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#fff', color: p.highlighted ? '#fff' : '#0f172a', boxShadow: p.highlighted ? '0 8px 32px rgba(99,102,241,0.3)' : '0 2px 12px rgba(0,0,0,0.08)', minWidth: 220, transform: p.highlighted ? 'scale(1.04)' : 'none' }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, opacity: 0.8 }}>{p.name}</div>
              <div style={{ fontSize: 40, fontWeight: 900, marginBottom: 4 }}>{p.price}<span style={{ fontSize: 16, fontWeight: 500, opacity: 0.7 }}>{p.period}</span></div>
              <ul style={{ padding: '16px 0', margin: '0 0 20px', listStyle: 'none' }}>{p.features.map((f, j) => <li key={j} style={{ fontSize: 14, marginBottom: 8, display: 'flex', gap: 8 }}><span>✓</span>{f}</li>)}</ul>
              <button style={{ width: '100%', padding: '12px 0', border: p.highlighted ? '2px solid #fff' : '2px solid #6366f1', borderRadius: 8, background: p.highlighted ? '#fff' : '#6366f1', color: p.highlighted ? '#6366f1' : '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{p.buttonText ?? 'Get Started'}</button>
            </div>
          ))}
        </div>
      </section>
    );
    case 'stats': return (
      <section style={{ ...bg, padding: `${pad}px 60px` }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 60, flexWrap: 'wrap' }}>
          {(s.statItems ?? []).map((st, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              {st.icon && <div style={{ fontSize: 28, marginBottom: 8 }}>{st.icon}</div>}
              <div style={{ fontSize: 42, fontWeight: 900, color: s.textColor ?? '#fff' }}>{st.value}</div>
              <div style={{ fontSize: 14, color: `${s.textColor ?? '#fff'}aa`, marginTop: 4 }}>{st.label}</div>
            </div>
          ))}
        </div>
      </section>
    );
    case 'cta': return (
      <section style={{ ...bg, padding: `${pad}px 60px`, textAlign: s.align ?? 'center' }}>
        <h2 style={{ fontSize: 36, fontWeight: 900, color: s.textColor ?? '#fff', margin: '0 0 12px' }}>{block.content}</h2>
        {s.subheading && <p style={{ fontSize: 17, color: `${s.textColor ?? '#fff'}cc`, margin: '0 0 32px' }}>{s.subheading}</p>}
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          {s.buttonText && <button style={{ padding: '14px 32px', background: s.buttonColor ?? '#fff', color: s.buttonTextColor ?? '#6366f1', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>{s.buttonText}</button>}
          {s.secondaryButtonText && <button style={{ padding: '14px 32px', background: 'transparent', color: s.textColor ?? '#fff', border: `2px solid ${s.textColor ?? '#fff'}66`, borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>{s.secondaryButtonText}</button>}
        </div>
      </section>
    );
    case 'faq': return (
      <section style={{ ...bg, padding: `${pad}px 60px` }}>
        {block.content && <h2 style={{ textAlign: s.align ?? 'center', fontSize: 32, fontWeight: 800, color: s.textColor ?? '#0f172a', margin: '0 0 8px' }}>{block.content}</h2>}
        {s.subtitle && <p style={{ textAlign: 'center', color: `${s.textColor ?? '#0f172a'}99`, margin: '0 0 36px' }}>{s.subtitle}</p>}
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          {(s.faqItems ?? []).map((f, i) => (
            <div key={i} style={{ borderBottom: '1px solid #f1f5f9', padding: '20px 0' }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: s.textColor ?? '#0f172a', marginBottom: 8 }}>{f.q}</div>
              <div style={{ fontSize: 14, color: `${s.textColor ?? '#0f172a'}99`, lineHeight: 1.7 }}>{f.a}</div>
            </div>
          ))}
        </div>
      </section>
    );
    case 'gallery': return (
      <section style={{ ...bg, padding: `${pad}px 60px` }}>
        {block.content && <h2 style={{ textAlign: 'center', fontSize: 32, fontWeight: 800, color: s.textColor ?? '#0f172a', margin: '0 0 8px' }}>{block.content}</h2>}
        {s.subtitle && <p style={{ textAlign: 'center', color: `${s.textColor ?? '#0f172a'}99`, margin: '0 0 36px' }}>{s.subtitle}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${s.columns ?? 3}, 1fr)`, gap: 14 }}>
          {(s.galleryImages ?? []).map((c, i) => <div key={i} style={{ aspectRatio: '4/3', borderRadius: 10, background: c.startsWith('#') ? c : `url(${c}) center/cover`, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} />)}
        </div>
      </section>
    );
    case 'footer': return (
      <footer style={{ ...bg, padding: `${pad}px 60px` }}>
        <div style={{ display: 'flex', gap: 60, flexWrap: 'wrap', marginBottom: 36 }}>
          <div style={{ flex: 2 }}>
            <div style={{ fontWeight: 900, fontSize: 22, color: s.textColor ? s.textColor.replace('99', '') : '#fff', marginBottom: 12 }}>{s.navLogo ?? 'MySite'}</div>
            <p style={{ fontSize: 14, color: s.textColor ?? '#94a3b8', lineHeight: 1.7, maxWidth: 300 }}>Building better businesses through design and digital strategy.</p>
          </div>
          {(s.footerColumns ?? []).map((col, i) => (
            <div key={i} style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#fff', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>{col.heading}</div>
              {col.links.map((l, j) => <div key={j} style={{ marginBottom: 8 }}><a href={l.url} style={{ color: s.textColor ?? '#94a3b8', fontSize: 14, textDecoration: 'none' }}>{l.label}</a></div>)}
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 24, textAlign: 'center', fontSize: 13, color: s.textColor ?? '#64748b' }}>{s.footerCopyright}</div>
      </footer>
    );
    case 'heading': return <div style={{ ...bg, padding: `${pad}px 60px`, textAlign: s.align ?? 'center' }}><h2 style={{ margin: 0, fontSize: s.size === 'xl' ? 40 : s.size === 'lg' ? 32 : s.size === 'sm' ? 20 : 26, fontWeight: parseInt(s.fontWeight ?? '700'), color: s.color ?? s.textColor ?? '#0f172a' }}>{block.content}</h2></div>;
    case 'text': return <div style={{ ...bg, padding: `${pad}px 60px`, textAlign: s.align ?? 'left' }}><p style={{ margin: 0, fontSize: s.size === 'lg' ? 18 : s.size === 'sm' ? 13 : 15, color: s.color ?? s.textColor ?? '#475569', lineHeight: 1.75 }}>{block.content}</p></div>;
    case 'button': return <div style={{ ...bg, padding: `${pad}px 60px`, textAlign: s.align ?? 'center' }}><button style={{ padding: '13px 28px', background: s.buttonColor ?? '#6366f1', color: s.buttonTextColor ?? '#fff', border: 'none', borderRadius: s.borderRadius ?? 8, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>{s.buttonText ?? block.content}</button></div>;
    case 'image': return <div style={{ ...bg, padding: `${pad}px 60px`, textAlign: s.align ?? 'center' }}>{s.imageUrl ? <img src={s.imageUrl} alt={s.imageAlt ?? ''} style={{ maxWidth: '100%', borderRadius: s.borderRadius ?? 0, boxShadow: s.shadow ? '0 8px 32px rgba(0,0,0,0.15)' : 'none' }} /> : <div style={{ height: 200, background: '#e2e8f0', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 14 }}>Image placeholder</div>}</div>;
    case 'video': return <div style={{ ...bg, padding: `${pad}px 60px` }}><div style={{ position: 'relative', paddingBottom: '56.25%', borderRadius: 12, overflow: 'hidden', background: '#000' }}>{s.url ? <iframe src={s.url} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} allowFullScreen /> : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 48 }}>▶</div>}</div></div>;
    case 'form': return (
      <section style={{ ...bg, padding: `${pad}px 60px` }}>
        {block.content && <h2 style={{ textAlign: s.align ?? 'center', fontSize: 28, fontWeight: 800, color: s.textColor ?? '#0f172a', margin: '0 0 28px' }}>{block.content}</h2>}
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          {(s.formFields ?? []).map((f, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>{f.label}{f.required && <span style={{ color: '#ef4444' }}> *</span>}</label>
              {f.type === 'textarea' ? <textarea rows={4} style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} /> : <input type={f.type} style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />}
            </div>
          ))}
          <button style={{ width: '100%', padding: '13px 0', background: s.buttonColor ?? '#6366f1', color: s.buttonTextColor ?? '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>{s.buttonText ?? 'Submit'}</button>
        </div>
      </section>
    );
    case 'divider': return <div style={{ padding: `${pad}px 60px` }}><hr style={{ border: 'none', borderTop: `2px solid ${s.color ?? '#e2e8f0'}`, margin: 0 }} /></div>;
    case 'spacer': return <div style={{ height: pad }} />;
    default: return <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Block: {block.type}</div>;
  }
}

// ── Canvas block wrapper ──────────────────────────────────────────────────────
function CanvasBlock({ block, selected, preview, onClick, onDragStart, isDragging, onDelete, onDuplicate, onMoveUp, onMoveDown }: {
  block: FunnelBlock; selected: boolean; preview: boolean; isDragging: boolean;
  onClick: () => void; onDragStart: () => void; onDelete: () => void; onDuplicate: () => void; onMoveUp: () => void; onMoveDown: () => void;
}) {
  return (
    <div draggable={!preview} onDragStart={e => { e.stopPropagation(); onDragStart(); }} onClick={e => { e.stopPropagation(); if (!preview) onClick(); }}
      style={{ position: 'relative', opacity: isDragging ? 0.35 : 1, outline: selected && !preview ? '2px solid #6366f1' : '2px solid transparent', outlineOffset: -2, cursor: preview ? 'default' : 'pointer' }}>
      <BlockRender block={block} />
      {selected && !preview && (
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4, zIndex: 20 }}>
          {[{ icon: '↑', title: 'Up', fn: onMoveUp }, { icon: '↓', title: 'Down', fn: onMoveDown }, { icon: '⧉', title: 'Duplicate', fn: onDuplicate }, { icon: '🗑', title: 'Delete', fn: onDelete }].map(b => (
            <button key={b.title} title={b.title} onClick={e => { e.stopPropagation(); b.fn(); }}
              style={{ width: 32, height: 32, border: 'none', borderRadius: 6, background: b.title === 'Delete' ? '#ef4444' : '#0f172a', color: '#fff', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {b.icon}
            </button>
          ))}
        </div>
      )}
      {selected && !preview && (
        <div style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', background: '#6366f1', color: '#fff', borderRadius: 6, padding: '3px 6px', fontSize: 10, fontWeight: 700, zIndex: 20, textTransform: 'uppercase' }}>{block.type}</div>
      )}
    </div>
  );
}

// ── Properties panel ──────────────────────────────────────────────────────────
function PropertiesPanel({ block, onChange }: { block: FunnelBlock; onChange: (b: FunnelBlock) => void }) {
  const s = block.settings;
  const set = (patch: Partial<FunnelBlock['settings']>) => onChange({ ...block, settings: { ...s, ...patch } });
  const inp: CSSProperties = { width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' };
  const lbl: CSSProperties = { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 };
  const row: CSSProperties = { marginBottom: 12 };
  const sec: CSSProperties = { borderBottom: '1px solid #f1f5f9', paddingBottom: 14, marginBottom: 14 };
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAiInput, setShowAiInput] = useState(false);

  async function generateAiContent() {
    const apiKey = localStorage.getItem('openai_api_key') || localStorage.getItem('crm_openai_key') || localStorage.getItem('settings_openai');
    if (!apiKey) { alert('Add your OpenAI API key in Settings → API Validation first.'); return; }
    setAiLoading(true);
    try {
      const systemPrompt = `You are a professional copywriter. Write compelling website copy for a ${block.type} section. Be concise, benefit-focused, and conversion-optimized. Return only the text, no quotes or explanations.`;
      const userPrompt = aiPrompt || `Write a great ${block.type} headline/text for a professional website.`;
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], max_tokens: 200 }),
      });
      const data = await res.json() as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content?.trim() ?? '';
      if (text) onChange({ ...block, content: text });
      setShowAiInput(false);
      setAiPrompt('');
    } catch { alert('Failed to generate content. Check your API key.'); }
    finally { setAiLoading(false); }
  }

  return (
    <div style={{ padding: 16, overflowY: 'auto', height: '100%' }}>
      <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 14, color: '#0f172a', textTransform: 'uppercase' }}>{block.type} Settings</div>
      {!['features','testimonials','pricing','stats','faq','gallery','navbar','footer'].includes(block.type) && (
        <div style={sec}>
          <label style={lbl}>Content</label>
          <textarea value={block.content} onChange={e => onChange({ ...block, content: e.target.value })} style={{ ...inp, minHeight: 56, resize: 'vertical', fontFamily: 'inherit', marginBottom: 6 }} />
          {!showAiInput ? (
            <button onClick={() => setShowAiInput(true)} style={{ width: '100%', padding: '6px 0', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              ✨ Generate with AI
            </button>
          ) : (
            <div style={{ background: '#f5f3ff', borderRadius: 8, padding: 10 }}>
              <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder={`Describe what you want for this ${block.type}...`} rows={2} style={{ ...inp, marginBottom: 6, fontSize: 12, background: '#fff', resize: 'none', fontFamily: 'inherit' }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={generateAiContent} disabled={aiLoading} style={{ flex: 1, padding: '6px 0', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: aiLoading ? 'not-allowed' : 'pointer' }}>
                  {aiLoading ? '⏳ Generating...' : '✨ Generate'}
                </button>
                <button onClick={() => { setShowAiInput(false); setAiPrompt(''); }} style={{ padding: '6px 10px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
      <div style={sec}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div style={row}><label style={lbl}>Text Color</label><input type="color" value={s.textColor ?? '#1e293b'} onChange={e => set({ textColor: e.target.value })} style={{ width: '100%', height: 32, padding: 2, border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }} /></div>
          <div style={row}><label style={lbl}>Bg Color</label><input type="color" value={s.bgColor ?? '#ffffff'} onChange={e => set({ bgColor: e.target.value })} style={{ width: '100%', height: 32, padding: 2, border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }} /></div>
        </div>
        <div style={row}><label style={lbl}>Gradient (CSS)</label><input value={s.bgGradient ?? ''} onChange={e => set({ bgGradient: e.target.value || undefined })} placeholder="linear-gradient(...)" style={inp} /></div>
        <div style={row}><label style={lbl}>Padding (px)</label><input type="number" value={s.padding ?? 40} onChange={e => set({ padding: +e.target.value })} style={inp} /></div>
      </div>
      {['button','hero','cta'].includes(block.type) && (
        <div style={sec}>
          <div style={row}><label style={lbl}>Button Text</label><input value={s.buttonText ?? ''} onChange={e => set({ buttonText: e.target.value })} style={inp} /></div>
          <div style={row}><label style={lbl}>Button URL</label><input value={s.url ?? ''} onChange={e => set({ url: e.target.value })} style={inp} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={lbl}>Btn Color</label><input type="color" value={s.buttonColor ?? '#6366f1'} onChange={e => set({ buttonColor: e.target.value })} style={{ width: '100%', height: 32, padding: 2, border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }} /></div>
            <div><label style={lbl}>Text Color</label><input type="color" value={s.buttonTextColor ?? '#ffffff'} onChange={e => set({ buttonTextColor: e.target.value })} style={{ width: '100%', height: 32, padding: 2, border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }} /></div>
          </div>
        </div>
      )}
      {block.type === 'navbar' && (
        <div style={sec}>
          <div style={row}><label style={lbl}>Logo Text</label><input value={s.navLogo ?? ''} onChange={e => set({ navLogo: e.target.value })} style={inp} /></div>
          <label style={lbl}>Nav Links</label>
          {(s.navLinks ?? []).map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 5, marginBottom: 5 }}>
              <input value={l.label} onChange={e => { const nl = [...(s.navLinks ?? [])]; nl[i] = { ...nl[i], label: e.target.value }; set({ navLinks: nl }); }} placeholder="Label" style={{ ...inp, flex: 1 }} />
              <input value={l.url} onChange={e => { const nl = [...(s.navLinks ?? [])]; nl[i] = { ...nl[i], url: e.target.value }; set({ navLinks: nl }); }} placeholder="URL" style={{ ...inp, flex: 1 }} />
              <button onClick={() => { const nl = [...(s.navLinks ?? [])]; nl.splice(i, 1); set({ navLinks: nl }); }} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '0 6px', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
          <button onClick={() => set({ navLinks: [...(s.navLinks ?? []), { label: 'Link', url: '#' }] })} style={{ width: '100%', padding: '6px 0', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>+ Add Link</button>
        </div>
      )}
      {block.type === 'features' && (
        <div style={sec}>
          <label style={lbl}>Feature Items</label>
          {(s.featureItems ?? []).map((f, i) => (
            <div key={i} style={{ background: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>#{i + 1}</span>
                <button onClick={() => { const fi = [...(s.featureItems ?? [])]; fi.splice(i, 1); set({ featureItems: fi }); }} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 11, cursor: 'pointer' }}>Remove</button>
              </div>
              <input value={f.icon} onChange={e => { const fi = [...(s.featureItems ?? [])]; fi[i] = { ...fi[i], icon: e.target.value }; set({ featureItems: fi }); }} placeholder="Icon (emoji)" style={{ ...inp, marginBottom: 4 }} />
              <input value={f.title} onChange={e => { const fi = [...(s.featureItems ?? [])]; fi[i] = { ...fi[i], title: e.target.value }; set({ featureItems: fi }); }} placeholder="Title" style={{ ...inp, marginBottom: 4 }} />
              <input value={f.desc} onChange={e => { const fi = [...(s.featureItems ?? [])]; fi[i] = { ...fi[i], desc: e.target.value }; set({ featureItems: fi }); }} placeholder="Description" style={inp} />
            </div>
          ))}
          <button onClick={() => set({ featureItems: [...(s.featureItems ?? []), { icon: '⭐', title: 'Feature', desc: 'Description' }] })} style={{ width: '100%', padding: '6px 0', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Add Feature</button>
        </div>
      )}
      {block.type === 'form' && (
        <div style={sec}>
          <label style={lbl}>Form Fields</label>
          {(s.formFields ?? []).map((f, i) => (
            <div key={i} style={{ background: '#f8fafc', borderRadius: 8, padding: 8, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Field {i + 1}</span>
                <button onClick={() => { const ff = [...(s.formFields ?? [])]; ff.splice(i, 1); set({ formFields: ff }); }} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 11, cursor: 'pointer' }}>Remove</button>
              </div>
              <input value={f.label} onChange={e => { const ff = [...(s.formFields ?? [])]; ff[i] = { ...ff[i], label: e.target.value }; set({ formFields: ff }); }} placeholder="Label" style={{ ...inp, marginBottom: 4 }} />
              <select value={f.type} onChange={e => { const ff = [...(s.formFields ?? [])]; ff[i] = { ...ff[i], type: e.target.value }; set({ formFields: ff }); }} style={inp}>
                {['text', 'email', 'phone', 'number', 'textarea'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          ))}
          <button onClick={() => set({ formFields: [...(s.formFields ?? []), { label: 'Field', type: 'text', required: false }] })} style={{ width: '100%', padding: '6px 0', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Add Field</button>
        </div>
      )}
    </div>
  );
}

// ── SEO Panel ─────────────────────────────────────────────────────────────────
function SeoPanel({ website, onChange }: { website: Website; onChange: (patch: Partial<Website>) => void }) {
  const inp: CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' };
  const lbl: CSSProperties = { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 5 };
  const row: CSSProperties = { marginBottom: 14 };
  return (
    <div style={{ padding: 16, overflowY: 'auto', height: '100%' }}>
      <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 16, color: '#0f172a', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}><Search size={13} /> SEO &amp; Settings</div>
      <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 14, marginBottom: 14 }}>
        <div style={row}><label style={lbl}>Site Name</label><input value={website.name} onChange={e => onChange({ name: e.target.value })} style={inp} /></div>
        <div style={row}><label style={lbl}>Description</label><textarea value={website.description ?? ''} onChange={e => onChange({ description: e.target.value })} rows={3} style={{ ...inp, resize: 'vertical' }} /></div>
      </div>
      <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 14, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 11, color: '#64748b', textTransform: 'uppercase', marginBottom: 10 }}>SEO</div>
        <div style={row}><label style={lbl}>SEO Title</label><input value={website.seoTitle ?? ''} onChange={e => onChange({ seoTitle: e.target.value })} placeholder="Page title for search engines" style={inp} /></div>
        <div style={row}><label style={lbl}>Meta Description</label><textarea value={website.seoDescription ?? ''} onChange={e => onChange({ seoDescription: e.target.value })} placeholder="160 characters max" rows={3} style={{ ...inp, resize: 'vertical' }} /></div>
        <div style={row}><label style={lbl}>Keywords</label><input value={website.seoKeywords ?? ''} onChange={e => onChange({ seoKeywords: e.target.value })} placeholder="keyword1, keyword2..." style={inp} /></div>
        <div style={row}><label style={lbl}>OG Image URL</label><input value={website.ogImage ?? ''} onChange={e => onChange({ ogImage: e.target.value })} placeholder="https://..." style={inp} /></div>
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 11, color: '#64748b', textTransform: 'uppercase', marginBottom: 10 }}>Domain</div>
        <div style={row}><label style={lbl}>Custom Domain</label><input value={website.domain ?? ''} onChange={e => onChange({ domain: e.target.value })} placeholder="www.yourdomain.com" style={inp} /></div>
        <div style={row}><label style={lbl}>Subdomain</label><input value={website.subdomain ?? ''} onChange={e => onChange({ subdomain: e.target.value })} placeholder="mysite.crmpro.app" style={inp} /></div>
        <div style={row}>
          <label style={lbl}>Status</label>
          <select value={website.status} onChange={e => onChange({ status: e.target.value as 'published' | 'draft' })} style={inp}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </div>
      </div>
    </div>
  );
}

// ── Main WebsiteBuilder ───────────────────────────────────────────────────────
interface WebsiteBuilderProps {
  website: Website;
  onSave: (w: Website) => void;
  onClose: () => void;
}

export default function WebsiteBuilder({ website, onSave, onClose }: WebsiteBuilderProps) {
  const initialPages = website.pages && website.pages.length > 0 ? website.pages : [mkPage('Home', 'landing')];
  const { state: pages, push: pushHistory, undo, redo, canUndo, canRedo } = useHistory<FunnelStep[]>(initialPages);
  const setPages = useCallback((updater: FunnelStep[] | ((prev: FunnelStep[]) => FunnelStep[])) => {
    if (typeof updater === 'function') {
      pushHistory(updater(pages));
    } else {
      pushHistory(updater);
    }
  }, [pages, pushHistory]);
  const [siteData, setSiteData] = useState<Omit<Website, 'pages'>>({ ...website });
  const [activePageId, setActivePageId] = useState(initialPages[0].id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<number>(-1);
  const [preview, setPreview] = useState(false);
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [leftTab, setLeftTab] = useState<'elements' | 'templates' | 'pages'>('elements');
  const [rightTab, setRightTab] = useState<'properties' | 'seo'>('properties');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [blockSearch, setBlockSearch] = useState('');
  const canvasRef = useRef<HTMLDivElement>(null);

  const activePage = pages.find(p => p.id === activePageId) ?? pages[0];
  const blocks = activePage.blocks;
  const selectedBlock = blocks.find(b => b.id === selectedId) ?? null;

  // Keyboard undo/redo
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  function updateBlocks(next: FunnelBlock[]) {
    pushHistory(pages.map(p => p.id === activePage.id ? { ...p, blocks: next } : p));
  }

  function handleDrop(index: number) {
    if (DRAG_TYPE === 'new') {
      const b = createBlock(DRAG_PAYLOAD as BlockType);
      const next = [...blocks]; next.splice(index, 0, b);
      updateBlocks(next); setSelectedId(b.id);
    } else if (DRAG_TYPE === 'move' && draggingId) {
      const from = blocks.findIndex(b => b.id === draggingId);
      if (from < 0) return;
      const next = [...blocks]; const [moved] = next.splice(from, 1);
      next.splice(index > from ? index - 1 : index, 0, moved);
      updateBlocks(next);
    }
    setDropTarget(-1); setDraggingId(null); DRAG_TYPE = null; DRAG_PAYLOAD = '';
  }

  function applyTemplate(t: WSTemplate) {
    const tp = t.pages[0];
    const p = mkPage(tp.name, tp.type);
    p.blocks = tp.blocks.map(b => ({ ...b, id: uid() }));
    setPages(prev => prev.map(pg => pg.id === activePage.id ? p : pg));
    setSelectedId(null);
  }

  function handleSave() {
    onSave({ ...siteData, pages, id: website.id } as Website);
  }

  const deviceWidth = device === 'desktop' ? '100%' : device === 'tablet' ? 768 : 375;
  const tbBtn = (active?: boolean): CSSProperties => ({ padding: '6px 12px', borderRadius: 6, border: active ? '2px solid #6366f1' : '1px solid #334155', background: active ? '#1e293b' : 'transparent', color: active ? '#a5b4fc' : '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer' });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', flexDirection: 'column', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Toolbar */}
      <div style={{ height: 52, background: '#0f172a', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10, flexShrink: 0, borderBottom: '1px solid #1e293b' }}>
        <button onClick={onClose} style={{ ...tbBtn(), border: '1px solid #334155' }}>← Back</button>
        <Globe size={16} color="#6366f1" />
        <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: 14, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{siteData.name}</span>
        <div style={{ flex: 1 }} />
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" style={{ ...tbBtn(), opacity: canUndo ? 1 : 0.35, display: 'flex', alignItems: 'center', gap: 4 }}><Undo2 size={13} /></button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" style={{ ...tbBtn(), opacity: canRedo ? 1 : 0.35, display: 'flex', alignItems: 'center', gap: 4 }}><Redo2 size={13} /></button>
        <div style={{ width: 1, height: 24, background: '#334155', margin: '0 4px' }} />
        <button onClick={() => setDevice('desktop')} style={tbBtn(device === 'desktop')}><Monitor size={13} /></button>
        <button onClick={() => setDevice('tablet')} style={tbBtn(device === 'tablet')}><Tablet size={13} /></button>
        <button onClick={() => setDevice('mobile')} style={tbBtn(device === 'mobile')}><Smartphone size={13} /></button>
        <button onClick={() => { setPreview(p => !p); setSelectedId(null); }} style={tbBtn(preview)}>{preview ? '✏️ Edit' : '👁 Preview'}</button>
        <button onClick={handleSave} style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Save</button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left panel */}
        {!preview && (
          <div style={{ width: 236, background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
              {(['elements', 'templates', 'pages'] as const).map(tab => (
                <button key={tab} onClick={() => setLeftTab(tab)} style={{ flex: 1, padding: '9px 2px', border: 'none', background: 'transparent', fontSize: 10, fontWeight: leftTab === tab ? 800 : 500, color: leftTab === tab ? '#6366f1' : '#64748b', cursor: 'pointer', borderBottom: leftTab === tab ? '2px solid #6366f1' : '2px solid transparent', textTransform: 'uppercase', letterSpacing: 0.4 }}>{tab}</button>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {leftTab === 'elements' && (
                <div style={{ padding: 10 }}>
                  <div style={{ position: 'relative', marginBottom: 10 }}>
                    <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input value={blockSearch} onChange={e => setBlockSearch(e.target.value)} placeholder="Search blocks..."
                      style={{ width: '100%', padding: '6px 8px 6px 26px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  {WS_CATALOG.map(cat => {
                    const filtered = blockSearch ? cat.blocks.filter(b => b.label.toLowerCase().includes(blockSearch.toLowerCase()) || b.type.toLowerCase().includes(blockSearch.toLowerCase())) : cat.blocks;
                    if (filtered.length === 0) return null;
                    return (
                    <div key={cat.category} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6 }}>{cat.category}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                        {filtered.map(item => (
                          <div key={item.type} draggable
                            onDragStart={() => { DRAG_TYPE = 'new'; DRAG_PAYLOAD = item.type; }}
                            onDragEnd={() => { if (DRAG_TYPE === 'new') { DRAG_TYPE = null; DRAG_PAYLOAD = ''; setDropTarget(-1); } }}
                            onClick={() => { const b = createBlock(item.type); updateBlocks([...blocks, b]); setSelectedId(b.id); }}
                            style={{ padding: '9px 5px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'grab', textAlign: 'center', fontSize: 11, color: '#475569' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#eef2ff'; (e.currentTarget as HTMLDivElement).style.borderColor = '#a5b4fc'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = '#f8fafc'; (e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f0'; }}>
                            <div style={{ fontSize: 17, marginBottom: 2 }}>{item.emoji}</div>
                            <div style={{ fontWeight: 600 }}>{item.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
              {leftTab === 'templates' && (
                <div style={{ padding: 10 }}>
                  <p style={{ fontSize: 11, color: '#64748b', marginBottom: 10, lineHeight: 1.5 }}>Apply a template to replace the current page.</p>
                  {WS_TEMPLATES.map(t => (
                    <div key={t.id} onClick={() => applyTemplate(t)}
                      style={{ marginBottom: 8, borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0', cursor: 'pointer' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#6366f1'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f0'; }}>
                      <div style={{ height: 60, background: t.heroColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{t.emoji}</div>
                      <div style={{ padding: '7px 10px', background: '#fff' }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: '#0f172a' }}>{t.name}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{t.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {leftTab === 'pages' && (
                <div style={{ padding: 10 }}>
                  {pages.map(p => (
                    <div key={p.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 8px', borderRadius: 8, marginBottom: 4, background: p.id === activePageId ? '#eef2ff' : '#f8fafc', border: p.id === activePageId ? '1px solid #a5b4fc' : '1px solid #e2e8f0', cursor: 'pointer' }}
                      onClick={() => { setActivePageId(p.id); setSelectedId(null); }}>
                      {renamingId === p.id ? (
                        <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                          onBlur={() => { setPages(prev => prev.map(pg => pg.id === p.id ? { ...pg, name: renameVal || pg.name } : pg)); setRenamingId(null); }}
                          onKeyDown={e => { if (e.key === 'Enter') { setPages(prev => prev.map(pg => pg.id === p.id ? { ...pg, name: renameVal || pg.name } : pg)); setRenamingId(null); } }}
                          style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 12, fontWeight: 700, outline: 'none' }} />
                      ) : (
                        <span style={{ flex: 1, fontSize: 12, fontWeight: p.id === activePageId ? 700 : 400, color: p.id === activePageId ? '#4f46e5' : '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      )}
                      <button onClick={e => { e.stopPropagation(); setRenamingId(p.id); setRenameVal(p.name); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#94a3b8' }}>✏️</button>
                      {pages.length > 1 && <button onClick={e => { e.stopPropagation(); const next = pages.filter(pg => pg.id !== p.id); setPages(next); if (activePageId === p.id) setActivePageId(next[0].id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#f87171' }}>🗑</button>}
                    </div>
                  ))}
                  <button onClick={() => { const p = mkPage(`Page ${pages.length + 1}`); setPages(prev => [...prev, p]); setActivePageId(p.id); }}
                    style={{ width: '100%', marginTop: 6, padding: '7px 0', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Add Page</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Canvas */}
        <div ref={canvasRef} onDragOver={e => e.preventDefault()} onClick={() => setSelectedId(null)}
          style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: preview ? 0 : '16px 24px', background: '#e2e8f0', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
          <div style={{ width: typeof deviceWidth === 'number' ? deviceWidth : '100%', maxWidth: '100%', background: '#fff', minHeight: '100%', boxShadow: preview ? 'none' : '0 4px 24px rgba(0,0,0,0.10)', borderRadius: preview ? 0 : 8, overflow: 'hidden' }}>
            {!preview && <DropZone index={0} active={dropTarget === 0} onOver={i => setDropTarget(i)} onDrop={handleDrop} />}
            {blocks.length === 0 && !preview && (
              <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>🌐</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Start Building</div>
                <div style={{ fontSize: 13 }}>Drag blocks from the left panel onto the canvas</div>
              </div>
            )}
            {blocks.map((block, idx) => (
              <Fragment key={block.id}>
                <CanvasBlock block={block} selected={selectedId === block.id} preview={preview} isDragging={draggingId === block.id}
                  onClick={() => { setSelectedId(block.id); setRightTab('properties'); }}
                  onDragStart={() => { DRAG_TYPE = 'move'; DRAG_PAYLOAD = block.id; setDraggingId(block.id); }}
                  onDelete={() => { updateBlocks(blocks.filter(b => b.id !== block.id)); if (selectedId === block.id) setSelectedId(null); }}
                  onDuplicate={() => { const copy = { ...block, id: uid() }; const next = [...blocks]; next.splice(idx + 1, 0, copy); updateBlocks(next); setSelectedId(copy.id); }}
                  onMoveUp={() => { if (idx <= 0) return; const next = [...blocks]; [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]; updateBlocks(next); }}
                  onMoveDown={() => { if (idx >= blocks.length - 1) return; const next = [...blocks]; [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]; updateBlocks(next); }}
                />
                {!preview && <DropZone index={idx + 1} active={dropTarget === idx + 1} onOver={i => setDropTarget(i)} onDrop={handleDrop} />}
              </Fragment>
            ))}
          </div>
        </div>

        {/* Right panel */}
        {!preview && (
          <div style={{ width: 272, background: '#fff', borderLeft: '1px solid #e2e8f0', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
              {(['properties', 'seo'] as const).map(tab => (
                <button key={tab} onClick={() => setRightTab(tab)} style={{ flex: 1, padding: '10px 4px', border: 'none', background: 'transparent', fontSize: 11, fontWeight: rightTab === tab ? 800 : 500, color: rightTab === tab ? '#6366f1' : '#64748b', cursor: 'pointer', borderBottom: rightTab === tab ? '2px solid #6366f1' : '2px solid transparent', textTransform: 'uppercase', letterSpacing: 0.4 }}>{tab === 'seo' ? 'SEO & Domain' : 'Properties'}</button>
              ))}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {rightTab === 'properties' ? (
                selectedBlock ? (
                  <PropertiesPanel block={selectedBlock} onChange={updated => updateBlocks(blocks.map(b => b.id === updated.id ? updated : b))} />
                ) : (
                  <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', paddingTop: 48 }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>🖱</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>No block selected</div>
                    <div style={{ fontSize: 12 }}>Click a block on the canvas to edit it</div>
                  </div>
                )
              ) : (
                <SeoPanel website={{ ...siteData, pages } as Website} onChange={patch => setSiteData(prev => ({ ...prev, ...patch }))} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
