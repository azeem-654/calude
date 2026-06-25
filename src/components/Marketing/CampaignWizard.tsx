import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Contact, Campaign, CampaignStep } from '../../types';
import {
  Mail, MessageSquare, Zap, X, Bold, Italic, Underline, Strikethrough,
  Link2, List, ListOrdered, AlignLeft, AlignCenter, AlignRight,
  Smartphone, Monitor, CheckCircle, ChevronRight, ChevronLeft,
  Sparkles, RotateCcw, Plus, Trash2, Send, Eye, EyeOff,
  Clock, Calendar, Users, Settings, ChevronDown, ChevronUp,
  Loader, XCircle, RefreshCw, Wand2, Target,
} from 'lucide-react';
import { loadEmailConfig, sendEmail, personalizeHtml, isEmailConfigured } from '../../services/emailService';

/* ─── Types ─── */
type CampaignGoal = 'announce' | 'promote' | 'nurture' | 'welcome' | 'reengage' | 'custom';
type AudienceSegment = 'all' | 'leads' | 'customers' | 'prospects';
type ToneType = 'professional' | 'friendly' | 'urgent' | 'educational';

interface WizardStep extends CampaignStep {}

interface WizardState {
  type: Campaign['type'];
  name: string;
  description: string;
  goal: CampaignGoal | '';
  customGoal: string;
  concept: string;
  cta: string;
  tone: ToneType;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  openTracking: boolean;
  clickTracking: boolean;
  stopOnReply: boolean;
  stopOnBounce: boolean;
  sendDays: string[];
  sendHoursFrom: string;
  sendHoursTo: string;
  audience: AudienceSegment;
  subject: string;
  previewText: string;
  emailBody: string;
  smsBody: string;
  steps: WizardStep[];
}

/* ─── Constants ─── */
const GOALS = [
  { id: 'announce', label: 'Product Launch', icon: '🚀', desc: 'Announce a new product or feature' },
  { id: 'promote',  label: 'Promote Offer',  icon: '🎯', desc: 'Sale, discount, or limited-time deal' },
  { id: 'nurture',  label: 'Nurture Leads',  icon: '💬', desc: 'Build trust with educational content' },
  { id: 'welcome',  label: 'Welcome Users',  icon: '👋', desc: 'Onboard new signups or customers' },
  { id: 'reengage', label: 'Re-engage',      icon: '🔄', desc: 'Win back cold or inactive contacts' },
  { id: 'custom',   label: 'Custom',         icon: '✍️', desc: 'Define your own objective' },
] as const;

const WEEK_DAYS = [
  { id: 'mon', label: 'M' }, { id: 'tue', label: 'T' }, { id: 'wed', label: 'W' },
  { id: 'thu', label: 'T' }, { id: 'fri', label: 'F' }, { id: 'sat', label: 'S' }, { id: 'sun', label: 'S' },
];

/* ─── Workflow Generator ─── */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
}

function extractProductName(concept: string): string {
  if (!concept.trim()) return 'our solution';
  const kwPattern = /(?:called|named|about|for|introducing|launching|announcing)\s+["']?([A-Z][^\s,.:]{2,}(?:\s+[A-Z]?[^\s,.:]{2,})?)/i;
  const m = concept.match(kwPattern);
  if (m?.[1]) return m[1].trim();
  const caps = concept.match(/\b[A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,})*/);
  if (caps?.[0]) return caps[0];
  return concept.trim().split(/\s+/).slice(0, 5).join(' ');
}

const TONE_CFG: Record<ToneType, { greet: string; sign: string }> = {
  professional: { greet: 'Dear {{firstName}},', sign: 'Best regards,' },
  friendly:     { greet: 'Hi {{firstName}},',   sign: 'Cheers,' },
  urgent:       { greet: 'Hey {{firstName}},',  sign: "Don't wait," },
  educational:  { greet: 'Hello {{firstName}},', sign: 'To your success,' },
};

function buildEmailBody(goal: string, stepIdx: number, product: string, concept: string, cta: string, tone: ToneType): string {
  const { greet, sign } = TONE_CFG[tone] || TONE_CFG.professional;
  const ctaText = cta || 'Get Started';
  const btn = `<div style="text-align:center;margin:24px 0"><a href="#" style="display:inline-block;padding:14px 32px;background:#6366f1;color:white;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">${ctaText} →</a></div>`;
  const g = goal || 'custom';

  if (stepIdx === 0) {
    const first: Record<string, string> = {
      announce: `<p>${greet}</p><p>We're thrilled to announce <strong>${product}</strong>.</p><p>${concept || "This is something we've been working on, and we can't wait to share it with you."}</p><ul><li>✅ <strong>Benefit 1</strong> — [describe key value]</li><li>✅ <strong>Benefit 2</strong> — [describe key value]</li><li>✅ <strong>Benefit 3</strong> — [describe key value]</li></ul>${btn}<p>${sign}<br/>[Your Name]</p>`,
      promote:  `<p>${greet}</p><p>We have an exclusive offer prepared just for you:</p><div style="background:#f5f3ff;padding:24px;border-radius:12px;text-align:center;margin:20px 0"><p style="font-size:26px;font-weight:800;color:#6366f1;margin:0">${concept.slice(0, 70) || 'Special Offer'}</p></div><p>This is available for a <strong>limited time only</strong>. Here's what you get:</p><ul><li>[Offer detail 1]</li><li>[Offer detail 2]</li></ul>${btn}<p>${sign}<br/>[Your Name]</p>`,
      nurture:  `<p>${greet}</p><p>${concept || "Here's something that's been helping our top users succeed."}</p><p><strong>The key insight:</strong> [Your main insight or tip here]</p><p>Here's how to apply it today:</p><ol><li>[Action step 1]</li><li>[Action step 2]</li><li>[Action step 3]</li></ol>${btn}<p>${sign}<br/>[Your Name]</p>`,
      welcome:  `<p>${greet} Welcome! 🎉</p><p>${concept || "We're excited to have you on board."}</p><p>Here's your quick-start plan:</p><ul><li>📌 <strong>Right now</strong>: ${ctaText}</li><li>📌 <strong>Day 2</strong>: Get your first result</li><li>📌 <strong>Day 5</strong>: Discover advanced features</li></ul>${btn}<p>${sign}<br/>[Your Name]</p>`,
      reengage: `<p>${greet}</p><p>It's been a while, and we genuinely miss you.</p><p>${concept || "A lot has improved. Here's what's new for you."}</p><div style="background:#ecfdf5;padding:20px;border-radius:12px;text-align:center;margin:20px 0"><p style="font-size:18px;font-weight:700;color:#16a34a;margin:0">We've prepared something special for your return</p></div>${btn}<p>${sign}<br/>[Your Name]</p>`,
      custom:   `<p>${greet}</p><p>${concept || "[Write your opening message — tell them why you're reaching out and why it matters to them]"}</p><p>[Main body — your key message, value proposition, or information]</p>${btn}<p>${sign}<br/>[Your Name]</p>`,
    };
    return first[g] || first.custom;
  }

  if (stepIdx === 1) {
    return `<p>${greet}</p><p>I wanted to follow up on my message about <strong>${product}</strong>.</p><p>In case life got busy — ${concept ? concept.slice(0, 100) + '...' : '[brief summary of what you shared]'}</p><p>The reason I'm following up: this directly helps with [key challenge]. I've seen it make a real difference for [type of person/company].</p>${btn}<p>Questions? Just reply — I read every one.<br/>${sign}<br/>[Your Name]</p>`;
  }

  return `<p>${greet}</p><p>Last message from me about <strong>${product}</strong> — I promise.</p><p>${cta ? `The bottom line: <strong>${ctaText}</strong> and see the difference for yourself.` : "I don't want you to miss this."}</p><div style="background:#fef9c3;padding:16px;border-radius:10px;border-left:4px solid #f59e0b;margin:16px 0"><p style="margin:0;font-weight:600;color:#92400e">⏰ This opportunity closes soon.</p></div>${btn}<p>No hard feelings if now's not the right time. But if you've been on the fence — this is the moment.<br/>${sign}<br/>[Your Name]</p>`;
}

function generateWorkflow(type: Campaign['type'], goal: string, concept: string, cta: string, tone: ToneType): WizardStep[] {
  const g = goal || 'custom';
  const product = extractProductName(concept);
  const ctaText = cta || 'Get Started';

  if (type === 'sms') {
    return [
      { id: `step-${Date.now()}-0`, day: 0, waitUnit: 'days', subject: '', subjectB: '', abTest: false, body: `Hi {{firstName}}! ${concept.slice(0, 80) || `Check out ${product}`}. ${ctaText}: [link]. Reply STOP to opt out.`, condition: 'Always' },
      { id: `step-${Date.now()}-1`, day: 3, waitUnit: 'days', subject: '', subjectB: '', abTest: false, body: `Reminder, {{firstName}}: ${product} is still available. ${ctaText}: [link]. Reply STOP to opt out.`, condition: 'If no click' },
    ];
  }

  const subjectsByGoal: Record<string, string[]> = {
    announce:  [`Introducing ${product} 🚀`, `{{firstName}}, did you see what we launched?`, `Last chance: ${product} early access`, `One more thing, {{firstName}}`],
    promote:   [`{{firstName}}, your exclusive offer is here ⚡`, `Reminder: your offer expires tomorrow, {{firstName}}`, `⏰ Final hours — don't miss this`, `{{firstName}}, we saved your spot`],
    nurture:   [`Here's how to get better results, {{firstName}}`, `Part 2: The strategy that changes everything`, `How top performers use ${product}`, `{{firstName}}, one last insight`],
    welcome:   [`Welcome to ${product}! Here's what's next 🎉`, `Your first win with ${product}, {{firstName}}`, `The feature 90% of users miss`, `Quick check-in, {{firstName}}`],
    reengage:  [`We miss you, {{firstName}} 💌`, `{{firstName}}, a lot has changed — see what's new`, `We made something special for you`, `{{firstName}}, this is my last message`],
    custom:    [concept.slice(0, 50) || `A note for you, {{firstName}}`, `Following up, {{firstName}}`, `One last thing about ${product}`, `{{firstName}}, closing the loop`],
  };

  const subjects = subjectsByGoal[g] || subjectsByGoal.custom;
  const conditions = ['Always', 'If not opened', 'If not replied', 'If not clicked'];
  const stepCount = type === 'sequence' ? 4 : 3;
  const days = [0, 3, 7, 14];

  return Array.from({ length: stepCount }, (_, i) => ({
    id: `step-${Date.now()}-${i}`,
    day: days[i],
    waitUnit: 'days' as const,
    subject: subjects[Math.min(i, subjects.length - 1)] || `Follow-up ${i + 1}`,
    subjectB: '',
    abTest: false,
    body: buildEmailBody(g, Math.min(i, 2), product, concept, ctaText, tone),
    condition: conditions[Math.min(i, conditions.length - 1)],
  }));
}

function createStepFromCampaign(c: Campaign): WizardStep {
  return {
    id: `step-${Date.now()}-0`,
    day: 0,
    waitUnit: 'days',
    subject: c.subject || '',
    subjectB: '',
    abTest: false,
    body: c.type === 'sms' ? (c.smsBody || '') : (c.emailBody || ''),
    condition: 'Always',
  };
}

/* ─── Rich Email Editor ─── */
const CONTENT_BLOCKS = [
  { label: 'CTA Button', html: '<div style="text-align:center;margin:24px 0"><a href="#" style="display:inline-block;padding:14px 32px;background:#6366f1;color:white;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">Button Text →</a></div>' },
  { label: 'Divider',    html: '<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0" />' },
  { label: 'Highlight',  html: '<div style="background:#f5f3ff;border-left:4px solid #6366f1;padding:16px 20px;border-radius:0 8px 8px 0;margin:16px 0"><p style="margin:0;color:#374151;font-weight:500">[Key message or quote]</p></div>' },
  { label: 'Image',      html: '<div style="text-align:center;margin:20px 0;padding:40px;background:#f1f5f9;border-radius:8px;border:2px dashed #e2e8f0"><p style="margin:0;color:#94a3b8;font-size:13px">📷 [Replace with your image URL]</p></div>' },
];

function RichEmailEditor({ initialValue, onChange, compact }: { initialValue: string; onChange: (html: string) => void; compact?: boolean }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<'edit' | 'mobile' | 'desktop'>('edit');
  const [html, setHtml] = useState(initialValue);
  const [wordCount, setWordCount] = useState(0);

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = initialValue;
    setWordCount(stripHtml(initialValue).split(/\s+/).filter(Boolean).length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = useCallback((cmd: string, val?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    const h = editorRef.current?.innerHTML || '';
    setHtml(h); onChange(h);
    setWordCount(stripHtml(h).split(/\s+/).filter(Boolean).length);
  }, [onChange]);

  const onInput = () => {
    const h = editorRef.current?.innerHTML || '';
    setHtml(h); onChange(h);
    setWordCount(stripHtml(h).split(/\s+/).filter(Boolean).length);
  };

  const insertVar = (v: string) => {
    editorRef.current?.focus();
    document.execCommand('insertText', false, v);
    onInput();
  };

  const insertBlock = (blockHtml: string) => {
    editorRef.current?.focus();
    document.execCommand('insertHTML', false, blockHtml);
    onInput();
  };

  const insertLink = () => {
    const url = prompt('Enter URL:', 'https://');
    if (url) exec('createLink', url);
  };

  const tb: React.CSSProperties = {
    width: 26, height: 26, border: '1px solid #e2e8f0', borderRadius: 5,
    backgroundColor: 'white', cursor: 'pointer', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151',
  };
  const sep = <div style={{ width: 1, height: 18, backgroundColor: '#e2e8f0', margin: '0 2px' }} />;

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', backgroundColor: 'white' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '6px 8px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fafafa', flexWrap: 'wrap' }}>
        <button style={tb} onClick={() => exec('bold')} title="Bold"><Bold size={11} /></button>
        <button style={tb} onClick={() => exec('italic')} title="Italic"><Italic size={11} /></button>
        <button style={tb} onClick={() => exec('underline')} title="Underline"><Underline size={11} /></button>
        <button style={tb} onClick={() => exec('strikeThrough')} title="Strikethrough"><Strikethrough size={11} /></button>
        {sep}
        <button style={{ ...tb, width: 'auto', padding: '0 6px', fontSize: 10, fontWeight: 700 }} onClick={() => exec('formatBlock', 'h2')}>H2</button>
        <button style={{ ...tb, width: 'auto', padding: '0 6px', fontSize: 10, fontWeight: 700 }} onClick={() => exec('formatBlock', 'h3')}>H3</button>
        <button style={{ ...tb, width: 'auto', padding: '0 6px', fontSize: 10, fontWeight: 700 }} onClick={() => exec('formatBlock', 'p')}>¶</button>
        {sep}
        <button style={tb} onClick={() => exec('insertUnorderedList')} title="Bullets"><List size={11} /></button>
        <button style={tb} onClick={() => exec('insertOrderedList')} title="Numbered"><ListOrdered size={11} /></button>
        {sep}
        <button style={tb} onClick={() => exec('justifyLeft')}><AlignLeft size={11} /></button>
        <button style={tb} onClick={() => exec('justifyCenter')}><AlignCenter size={11} /></button>
        <button style={tb} onClick={() => exec('justifyRight')}><AlignRight size={11} /></button>
        {sep}
        <button style={tb} onClick={insertLink} title="Insert link"><Link2 size={11} /></button>
        <button style={tb} onClick={() => exec('removeFormat')} title="Clear formatting"><RotateCcw size={11} /></button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          {(['edit', 'mobile', 'desktop'] as const).map(m => (
            <button key={m} onClick={() => setPreview(m)}
              style={{ ...tb, width: 'auto', padding: '0 7px', fontSize: 10, fontWeight: 600, backgroundColor: preview === m ? '#ede9fe' : 'white', color: preview === m ? '#6366f1' : '#64748b', border: `1px solid ${preview === m ? '#c4b5fd' : '#e2e8f0'}` }}>
              {m === 'edit' ? '✏️' : m === 'mobile' ? <Smartphone size={11} /> : <Monitor size={11} />}
            </button>
          ))}
        </div>
      </div>

      {/* Variables bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, flexShrink: 0 }}>Personalize:</span>
        {['{{firstName}}', '{{lastName}}', '{{email}}', '{{company}}', '{{unsubscribe}}'].map(v => (
          <button key={v} onClick={() => insertVar(v)}
            style={{ padding: '2px 6px', background: '#ede9fe', color: '#6d28d9', border: 'none', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontFamily: 'monospace', fontWeight: 500 }}>{v}</button>
        ))}
        <div style={{ width: 1, height: 14, backgroundColor: '#e2e8f0', margin: '0 2px' }} />
        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, flexShrink: 0 }}>Blocks:</span>
        {CONTENT_BLOCKS.map(b => (
          <button key={b.label} onClick={() => insertBlock(b.html)}
            style={{ padding: '2px 6px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontWeight: 500 }}>{b.label}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#94a3b8' }}>{wordCount} words · ~{Math.ceil(wordCount / 200)}min read</span>
      </div>

      {/* Editor or Preview */}
      {preview === 'edit' ? (
        <div ref={editorRef} contentEditable suppressContentEditableWarning onInput={onInput}
          style={{ minHeight: compact ? 180 : 260, padding: '14px 18px', outline: 'none', fontSize: 13, lineHeight: 1.7, color: '#374151', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }} />
      ) : (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 12px', backgroundColor: '#f1f5f9', minHeight: compact ? 180 : 260 }}>
          <div style={{ width: preview === 'mobile' ? 340 : 560, backgroundColor: 'white', borderRadius: preview === 'mobile' ? 16 : 8, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', overflow: 'hidden', border: preview === 'mobile' ? '6px solid #1e293b' : '1px solid #e2e8f0' }}>
            <div style={{ padding: preview === 'mobile' ? '14px 12px' : '24px 32px', fontSize: preview === 'mobile' ? 13 : 14, lineHeight: 1.7, color: '#374151', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}
              dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Toggle Switch ─── */
function ToggleSwitch({ on, onChange, label, desc }: { on: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', backgroundColor: '#f8fafc', borderRadius: 8, border: '1px solid #f1f5f9' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{desc}</div>}
      </div>
      <button onClick={() => onChange(!on)} style={{ width: 38, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', backgroundColor: on ? '#6366f1' : '#e2e8f0', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
        <div style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: 3, left: on ? 21 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      </button>
    </div>
  );
}

/* ─── Step 1: Campaign Brief ─── */
function StepBrief({ state, onChange }: { state: WizardState; onChange: (u: Partial<WizardState>) => void }) {
  const types = [
    { id: 'email' as const,    icon: <Mail size={20} color="#6366f1" />,          label: 'Email Campaign',   desc: 'Newsletter, announcement, or blast',     badge: '~24% open rate', color: '#6366f1' },
    { id: 'sms' as const,      icon: <MessageSquare size={20} color="#22c55e" />, label: 'SMS Campaign',     desc: 'Flash sales, urgent alerts, outreach',   badge: '98% open rate',  color: '#22c55e' },
    { id: 'sequence' as const, icon: <Zap size={20} color="#f59e0b" />,           label: 'Email Sequence',   desc: 'Multi-step automated follow-up flow',    badge: '3× conversion',  color: '#f59e0b' },
  ];
  const tones: { id: ToneType; label: string; desc: string; emoji: string }[] = [
    { id: 'professional', label: 'Professional', desc: 'Formal & business-appropriate', emoji: '👔' },
    { id: 'friendly',     label: 'Friendly',     desc: 'Warm, conversational tone',     emoji: '😊' },
    { id: 'urgent',       label: 'Urgent',       desc: 'High-energy, drives action',    emoji: '⚡' },
    { id: 'educational',  label: 'Educational',  desc: 'Informative & helpful',         emoji: '📚' },
  ];

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Campaign brief</h2>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 22 }}>Tell us about your campaign and we'll build a personalized multi-step flow for you.</p>

      {/* Name + Type */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14, marginBottom: 20 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Campaign name *</label>
          <input value={state.name} onChange={e => onChange({ name: e.target.value })} placeholder="e.g. Summer Product Launch 2025"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
      </div>

      {/* Type */}
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Campaign type *</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {types.map(t => (
          <button key={t.id} onClick={() => onChange({ type: t.id, steps: [] })}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 10px', border: `2px solid ${state.type === t.id ? t.color : '#e2e8f0'}`, borderRadius: 12, backgroundColor: state.type === t.id ? `${t.color}08` : 'white', cursor: 'pointer', textAlign: 'center', transition: 'all 0.12s' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: `${t.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: state.type === t.id ? t.color : '#0f172a' }}>{t.label}</div>
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 20, backgroundColor: `${t.color}15`, color: t.color, fontWeight: 600 }}>{t.badge}</span>
          </button>
        ))}
      </div>

      {/* Goal */}
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Campaign goal *</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginBottom: 20 }}>
        {GOALS.map(g => (
          <button key={g.id} onClick={() => onChange({ goal: g.id as CampaignGoal, steps: [] })}
            style={{ padding: '10px 8px', border: `2px solid ${state.goal === g.id ? '#6366f1' : '#e2e8f0'}`, borderRadius: 10, backgroundColor: state.goal === g.id ? '#f5f3ff' : 'white', cursor: 'pointer', textAlign: 'center', transition: 'all 0.12s' }}>
            <div style={{ fontSize: 20, marginBottom: 3 }}>{g.icon}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: state.goal === g.id ? '#6366f1' : '#0f172a', marginBottom: 1 }}>{g.label}</div>
            <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.3 }}>{g.desc}</div>
          </button>
        ))}
      </div>

      {/* Concept + CTA */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14, marginBottom: 20 }}>
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <Wand2 size={12} color="#6366f1" /> What is this campaign about? *
          </label>
          <textarea value={state.concept} onChange={e => onChange({ concept: e.target.value, steps: [] })}
            placeholder="e.g. We're launching TaskFlow, our new project management SaaS. It helps remote teams track tasks, deadlines and workloads in one place."
            rows={3}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5 }} />
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>Be specific — the AI uses this to write personalized subject lines and email copy.</p>
        </div>
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <Target size={12} color="#6366f1" /> Desired action (CTA)
          </label>
          <input value={state.cta} onChange={e => onChange({ cta: e.target.value, steps: [] })} placeholder="e.g. Start free trial, Book a demo, Claim 30% off, Download guide"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
      </div>

      {/* Tone */}
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Email tone</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7 }}>
        {tones.map(t => (
          <button key={t.id} onClick={() => onChange({ tone: t.id, steps: [] })}
            style={{ padding: '10px 8px', border: `2px solid ${state.tone === t.id ? '#6366f1' : '#e2e8f0'}`, borderRadius: 10, backgroundColor: state.tone === t.id ? '#f5f3ff' : 'white', cursor: 'pointer', textAlign: 'center', transition: 'all 0.12s' }}>
            <div style={{ fontSize: 18, marginBottom: 3 }}>{t.emoji}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: state.tone === t.id ? '#6366f1' : '#0f172a' }}>{t.label}</div>
            <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.3, marginTop: 1 }}>{t.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 2: AI Campaign Flow ─── */
const LOADING_MSGS = [
  'Analyzing your campaign brief…',
  'Generating personalized subject lines…',
  'Writing tailored email copy…',
  'Building your multi-step flow…',
  'Optimizing send timing…',
];

const CONDITION_COLORS: Record<string, { bg: string; color: string }> = {
  'Always':         { bg: '#ecfdf5', color: '#16a34a' },
  'If not opened':  { bg: '#fef3c7', color: '#d97706' },
  'If not clicked': { bg: '#fef3c7', color: '#d97706' },
  'If not replied': { bg: '#fee2e2', color: '#dc2626' },
  'If no click':    { bg: '#fee2e2', color: '#dc2626' },
  'If opened':      { bg: '#eff6ff', color: '#2563eb' },
  'If clicked':     { bg: '#eff6ff', color: '#2563eb' },
};

function StepAIWorkflow({ state, onChange }: { state: WizardState; onChange: (u: Partial<WizardState>) => void }) {
  const [loading, setLoading] = useState(() => state.steps.length === 0);
  const [msgIdx, setMsgIdx] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const generated = useRef(false);

  useEffect(() => {
    if (state.steps.length === 0 && !generated.current) {
      generated.current = true;
      const msgTimer = setInterval(() => setMsgIdx(i => (i + 1) % LOADING_MSGS.length), 420);
      const genTimer = setTimeout(() => {
        clearInterval(msgTimer);
        const flow = generateWorkflow(state.type, state.goal, state.concept, state.cta, state.tone);
        onChange({ steps: flow });
        setLoading(false);
        setExpandedId(null);
      }, 1800);
      return () => { clearInterval(msgTimer); clearTimeout(genTimer); };
    } else if (state.steps.length > 0) {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const regenerate = () => {
    setLoading(true);
    setMsgIdx(0);
    onChange({ steps: [] });
    generated.current = false;
    const msgTimer = setInterval(() => setMsgIdx(i => (i + 1) % LOADING_MSGS.length), 400);
    const genTimer = setTimeout(() => {
      clearInterval(msgTimer);
      const flow = generateWorkflow(state.type, state.goal, state.concept, state.cta, state.tone);
      onChange({ steps: flow });
      setLoading(false);
    }, 1600);
    return () => { clearInterval(msgTimer); clearTimeout(genTimer); };
  };

  const updateStep = (id: string, updates: Partial<WizardStep>) =>
    onChange({ steps: state.steps.map(s => s.id === id ? { ...s, ...updates } : s) });

  const removeStep = (id: string) => {
    const next = state.steps.filter(s => s.id !== id);
    onChange({ steps: next });
    if (expandedId === id) setExpandedId(next[0]?.id ?? null);
  };

  const addStep = () => {
    const last = state.steps[state.steps.length - 1];
    const product = extractProductName(state.concept);
    const ns: WizardStep = {
      id: `step-${Date.now()}`,
      day: (last?.day || 0) + 7,
      waitUnit: 'days',
      subject: `Following up, {{firstName}} — about ${product}`,
      subjectB: '',
      abTest: false,
      body: buildEmailBody(state.goal, 3, product, state.concept, state.cta, state.tone),
      condition: 'If not replied',
    };
    onChange({ steps: [...state.steps, ns] });
    setExpandedId(ns.id);
  };

  const isSMS = state.type === 'sms';
  const totalDays = state.steps.length > 0 ? state.steps[state.steps.length - 1].day : 0;

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, boxShadow: '0 0 30px rgba(99,102,241,0.3)' }}>
          <Sparkles size={28} color="white" />
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Building your campaign flow</h3>
        <p style={{ fontSize: 13, color: '#6366f1', fontWeight: 500, marginBottom: 24, minHeight: 20, transition: 'opacity 0.3s' }}>{LOADING_MSGS[msgIdx]}</p>
        <div style={{ display: 'flex', gap: 6 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#6366f1', opacity: msgIdx % 3 === i ? 1 : 0.3, transition: 'opacity 0.3s' }} />
          ))}
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 16 }}>Personalized for: <em>"{state.concept.slice(0, 60) || 'your campaign'}{state.concept.length > 60 ? '…' : ''}"</em></p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Your AI-generated campaign flow</h2>
          <p style={{ color: '#64748b', fontSize: 13 }}>Review, edit, and approve your campaign before it goes live.</p>
        </div>
        <button onClick={regenerate}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', border: '1px solid #e2e8f0', borderRadius: 8, backgroundColor: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#6366f1', flexShrink: 0 }}>
          <RefreshCw size={12} /> Regenerate
        </button>
      </div>

      {/* Summary bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', backgroundColor: '#f5f3ff', borderRadius: 10, border: '1px solid #ede9fe', marginBottom: 18, flexWrap: 'wrap' }}>
        <Sparkles size={13} color="#6366f1" />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#6366f1' }}>{state.steps.length} {isSMS ? 'message' : 'email'}{state.steps.length !== 1 ? 's' : ''}</span>
        {!isSMS && <><span style={{ fontSize: 11, color: '#8b5cf6' }}>·</span><span style={{ fontSize: 12, color: '#8b5cf6' }}>Spans {totalDays} days</span></>}
        {state.stopOnReply && <><span style={{ fontSize: 11, color: '#8b5cf6' }}>·</span><span style={{ fontSize: 12, color: '#8b5cf6' }}>Stops on reply</span></>}
        <span style={{ fontSize: 11, color: '#8b5cf6' }}>·</span>
        <span style={{ fontSize: 11, color: '#8b5cf6', padding: '1px 7px', backgroundColor: '#ede9fe', borderRadius: 20, fontWeight: 600 }}>AI-generated · Review before launch</span>
      </div>

      {/* Step timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {state.steps.map((step, idx) => {
          const isFirst = idx === 0;
          const isExpanded = expandedId === step.id;
          const cc = CONDITION_COLORS[step.condition] || CONDITION_COLORS['Always'];
          const preview = isSMS ? step.body.slice(0, 100) : stripHtml(step.body);

          return (
            <div key={step.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {/* Timeline */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 32, flexShrink: 0, paddingTop: 6 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: isFirst ? '#6366f1' : '#f1f5f9', border: isFirst ? 'none' : '2px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, flexShrink: 0 }}>
                  {isFirst ? (isSMS ? <MessageSquare size={12} color="white" /> : <Mail size={12} color="white" />) : <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>{idx + 1}</span>}
                </div>
                {idx < state.steps.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 20, backgroundColor: '#e2e8f0', marginTop: 2 }} />}
              </div>

              {/* Card */}
              <div style={{ flex: 1, border: `1px solid ${isExpanded ? '#c4b5fd' : '#e2e8f0'}`, borderRadius: 10, overflow: 'hidden', marginBottom: 10, backgroundColor: 'white', boxShadow: isExpanded ? '0 0 0 3px #ede9fe40' : 'none', transition: 'all 0.15s' }}>
                {/* Header row */}
                <div onClick={() => setExpandedId(isExpanded ? null : step.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', cursor: 'pointer', backgroundColor: isExpanded ? '#faf5ff' : 'white' }}>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, backgroundColor: isFirst ? '#6366f1' : '#f1f5f9', color: isFirst ? 'white' : '#64748b', fontWeight: 700 }}>
                      {isFirst ? 'Day 0' : `Day ${step.day}`}
                    </span>
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, fontWeight: 600, backgroundColor: cc.bg, color: cc.color }}>{step.condition}</span>
                    {step.abTest && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, fontWeight: 600, backgroundColor: '#fef3c7', color: '#d97706' }}>A/B</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {!isSMS && <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{step.subject || '(No subject)'}</div>}
                    <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: isSMS ? 0 : 1 }}>{preview || '(Empty body)'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {state.steps.length > 1 && (
                      <button onClick={e => { e.stopPropagation(); removeStep(step.id); }}
                        style={{ width: 24, height: 24, border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Trash2 size={12} />
                      </button>
                    )}
                    {isExpanded ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
                  </div>
                </div>

                {/* Expanded editor */}
                {isExpanded && (
                  <div style={{ padding: '14px 14px 16px', borderTop: '1px solid #f1f5f9', backgroundColor: '#fafafa' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: !isFirst ? '90px 1fr' : '1fr', gap: 8, marginBottom: 12 }}>
                      {!isFirst && (
                        <div>
                          <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 3, fontWeight: 500 }}>Send after</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="number" min={1} value={step.day} onChange={e => updateStep(step.id, { day: parseInt(e.target.value) || 1 })}
                              style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                            <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>days</span>
                          </div>
                        </div>
                      )}
                      {!isFirst && (
                        <div>
                          <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 3, fontWeight: 500 }}>Send condition</label>
                          <select value={step.condition} onChange={e => updateStep(step.id, { condition: e.target.value })}
                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none', backgroundColor: 'white', color: '#374151', cursor: 'pointer' }}>
                            {['Always', 'If not opened', 'If not clicked', 'If not replied', 'If opened', 'If clicked'].map(c => <option key={c}>{c}</option>)}
                          </select>
                        </div>
                      )}
                    </div>

                    {!isSMS && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>Subject line</label>
                          <button onClick={() => updateStep(step.id, { abTest: !step.abTest })}
                            style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', border: `1px solid ${step.abTest ? '#f59e0b' : '#e2e8f0'}`, borderRadius: 5, backgroundColor: step.abTest ? '#fef3c7' : 'white', color: step.abTest ? '#d97706' : '#64748b', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                            A/B Test
                          </button>
                        </div>
                        <input value={step.subject} onChange={e => updateStep(step.id, { subject: e.target.value })} placeholder="Subject line..."
                          style={{ width: '100%', padding: '7px 9px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box', marginBottom: step.abTest ? 5 : 0 }} />
                        {step.abTest && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10, padding: '1px 6px', backgroundColor: '#fef3c7', color: '#d97706', borderRadius: 10, fontWeight: 700, flexShrink: 0 }}>B</span>
                            <input value={step.subjectB || ''} onChange={e => updateStep(step.id, { subjectB: e.target.value })} placeholder="Variant B subject..."
                              style={{ flex: 1, padding: '7px 9px', border: '1px solid #fde68a', borderRadius: 7, fontSize: 12, outline: 'none' }} />
                          </div>
                        )}
                      </div>
                    )}

                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{isSMS ? 'SMS message' : 'Email body'}</label>
                    {isSMS ? (
                      <div>
                        <textarea value={step.body} onChange={e => updateStep(step.id, { body: e.target.value })} rows={4}
                          style={{ width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6 }} />
                        <span style={{ fontSize: 11, color: step.body.length > 160 ? '#dc2626' : '#94a3b8' }}>{step.body.length}/160</span>
                      </div>
                    ) : (
                      <RichEmailEditor compact initialValue={step.body} onChange={html => updateStep(step.id, { body: html })} />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={addStep}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', padding: '11px 16px', border: '2px dashed #c4b5fd', borderRadius: 10, backgroundColor: '#faf5ff', cursor: 'pointer', color: '#6366f1', fontSize: 13, fontWeight: 600, marginTop: 4 }}>
        <Plus size={14} /> Add follow-up step
      </button>
    </div>
  );
}

/* ─── Step 3: Sender & Settings ─── */
function StepSenderSettings({ state, onChange }: { state: WizardState; onChange: (u: Partial<WizardState>) => void }) {
  const emailConfig = loadEmailConfig();
  const hasSaved = emailConfig.provider !== 'none' && !!emailConfig.fromEmail;
  const [useSaved, setUseSaved] = useState(() => hasSaved && !state.fromEmail);

  const selectSaved = () => {
    setUseSaved(true);
    onChange({ fromName: emailConfig.fromName || '', fromEmail: emailConfig.fromEmail || '' });
  };
  const selectCustom = () => { setUseSaved(false); };

  const toggleDay = (day: string) => {
    const days = state.sendDays.includes(day) ? state.sendDays.filter(d => d !== day) : [...state.sendDays, day];
    onChange({ sendDays: days });
  };

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Sender & settings</h2>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>Choose who this campaign comes from and configure sending behavior.</p>

      {/* Sender identity */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Settings size={13} color="#6366f1" />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sender identity</span>
        </div>

        {hasSaved && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 14 }}>
            {/* Saved profile option */}
            <button onClick={selectSaved}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: `2px solid ${useSaved ? '#6366f1' : '#e2e8f0'}`, borderRadius: 10, backgroundColor: useSaved ? '#f5f3ff' : 'white', cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s' }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Mail size={16} color="#6366f1" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{emailConfig.fromName || 'Saved Sender'}</div>
                <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emailConfig.fromEmail} · via {emailConfig.provider === 'mailtrap' ? 'Mailtrap' : 'Resend'}</div>
              </div>
              <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${useSaved ? '#6366f1' : '#cbd5e1'}`, backgroundColor: useSaved ? '#6366f1' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {useSaved && <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'white' }} />}
              </div>
            </button>

            {/* Custom option */}
            <button onClick={selectCustom}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: `2px solid ${!useSaved ? '#6366f1' : '#e2e8f0'}`, borderRadius: 10, backgroundColor: !useSaved ? '#f5f3ff' : 'white', cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s' }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: !useSaved ? '#ede9fe' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Settings size={16} color={!useSaved ? '#6366f1' : '#94a3b8'} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>Custom sender</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Use a different name and email address</div>
              </div>
              <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${!useSaved ? '#6366f1' : '#cbd5e1'}`, backgroundColor: !useSaved ? '#6366f1' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {!useSaved && <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'white' }} />}
              </div>
            </button>
          </div>
        )}

        {/* Custom fields or confirmation */}
        {useSaved && hasSaved ? (
          <div style={{ padding: '10px 12px', backgroundColor: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: '#166534' }}>✅ Sending as <strong>{emailConfig.fromName}</strong> ({emailConfig.fromEmail})</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'From name', key: 'fromName' as const, placeholder: 'John at Acme Co.' },
              { label: 'From email', key: 'fromEmail' as const, placeholder: 'john@acme.com' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>{f.label}</label>
                <input value={state[f.key] as string} onChange={e => onChange({ [f.key]: e.target.value })} placeholder={f.placeholder}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 10 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>Reply-to email</label>
          <input value={state.replyTo} onChange={e => onChange({ replyTo: e.target.value })} placeholder="support@acme.com"
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>

        {!hasSaved && (
          <div style={{ marginTop: 10, padding: '10px 12px', backgroundColor: '#fef9c3', borderRadius: 8, border: '1px solid #fde68a' }}>
            <span style={{ fontSize: 12, color: '#92400e' }}>💡 Configure an email provider in <strong>Settings → Email & SMS</strong> to enable one-click sender selection.</span>
          </div>
        )}
      </div>

      {/* Tracking */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Eye size={13} color="#6366f1" />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tracking & behavior</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <ToggleSwitch on={state.openTracking} onChange={v => onChange({ openTracking: v })} label="Open tracking" desc="Track when recipients open your emails" />
          <ToggleSwitch on={state.clickTracking} onChange={v => onChange({ clickTracking: v })} label="Click tracking" desc="Track link clicks inside your emails" />
          <ToggleSwitch on={state.stopOnReply} onChange={v => onChange({ stopOnReply: v })} label="Stop on reply" desc="Remove contact from sequence when they reply" />
          <ToggleSwitch on={state.stopOnBounce} onChange={v => onChange({ stopOnBounce: v })} label="Stop on bounce" desc="Remove contact when their email bounces" />
        </div>
      </div>

      {/* Send window */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Clock size={13} color="#6366f1" />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Send window</span>
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>Emails only send on selected days within the time range.</p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {WEEK_DAYS.map(d => (
            <button key={d.id} onClick={() => toggleDay(d.id)}
              style={{ width: 34, height: 34, borderRadius: '50%', border: `2px solid ${state.sendDays.includes(d.id) ? '#6366f1' : '#e2e8f0'}`, backgroundColor: state.sendDays.includes(d.id) ? '#6366f1' : 'white', color: state.sendDays.includes(d.id) ? 'white' : '#94a3b8', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              {d.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>From</label>
            <input type="time" value={state.sendHoursFrom} onChange={e => onChange({ sendHoursFrom: e.target.value })}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box', color: '#374151' }} />
          </div>
          <div style={{ paddingTop: 18, color: '#94a3b8' }}>→</div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>To</label>
            <input type="time" value={state.sendHoursTo} onChange={e => onChange({ sendHoursTo: e.target.value })}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box', color: '#374151' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Step 4: Audience ─── */
function StepAudience({ state, onChange, counts }: { state: WizardState; onChange: (u: Partial<WizardState>) => void; counts: Record<AudienceSegment, number> }) {
  const audiences = [
    { id: 'all' as const,       label: 'All Contacts', desc: 'Everyone in your CRM', count: counts.all },
    { id: 'leads' as const,     label: 'Leads',        desc: 'Status = lead',        count: counts.leads },
    { id: 'customers' as const, label: 'Customers',    desc: 'Status = customer',    count: counts.customers },
    { id: 'prospects' as const, label: 'Prospects',    desc: 'Status = prospect',    count: counts.prospects },
  ];
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Target audience</h2>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>Choose who will receive this campaign.</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Users size={13} color="#6366f1" />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Segment</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 20 }}>
        {audiences.map(a => (
          <button key={a.id} onClick={() => onChange({ audience: a.id })}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: `2px solid ${state.audience === a.id ? '#6366f1' : '#e2e8f0'}`, borderRadius: 10, backgroundColor: state.audience === a.id ? '#f5f3ff' : 'white', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: state.audience === a.id ? '#ede9fe' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Users size={15} color={state.audience === a.id ? '#6366f1' : '#94a3b8'} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{a.label}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{a.count.toLocaleString()} contacts · {a.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {counts[state.audience] === 0 && (
        <div style={{ padding: '14px 16px', backgroundColor: '#fef9c3', borderRadius: 10, border: '1px solid #fde68a' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#92400e', fontWeight: 500 }}>⚠️ No contacts in this segment yet. Add contacts in the <strong>Contacts</strong> module first, or choose "All Contacts" once you've imported your list.</p>
        </div>
      )}
    </div>
  );
}

/* ─── Step 5: Review & Launch ─── */
interface SendLog { email: string; name: string; status: 'pending' | 'sent' | 'failed'; error?: string; }

function StepReview({ state, counts, contacts, onLaunch }: {
  state: WizardState;
  counts: Record<AudienceSegment, number>;
  contacts: Contact[];
  onLaunch: (sendNow: boolean, scheduledAt: string, sentCount: number) => void;
}) {
  const [sendTime, setSendTime] = useState<'now' | 'scheduled'>('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [testAddr, setTestAddr] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'ok' | 'fail'>('idle');
  const [testMsg, setTestMsg] = useState('');
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [sendLogs, setSendLogs] = useState<SendLog[]>([]);
  const [sendProgress, setSendProgress] = useState(0);

  const emailConfig = loadEmailConfig();
  const isDemo = false;
  const hasProvider = emailConfig.provider === 'smtp' || (emailConfig.provider !== 'none' && !!emailConfig.apiKey);
  const isSMS = state.type === 'sms';

  const goalLabel = GOALS.find(g => g.id === state.goal)?.label || 'Custom';
  const typeLabel = ({ email: 'Email', sms: 'SMS', sequence: 'Email Sequence' } as const)[state.type];
  const dayLabels: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

  const getAudienceContacts = (): Contact[] => {
    if (state.audience === 'all') return contacts;
    const statusMap: Record<string, string> = { leads: 'lead', customers: 'customer', prospects: 'prospect' };
    const status = statusMap[state.audience];
    return contacts.filter(c => c.status === status);
  };

  const sendTestEmail = async () => {
    if (!testAddr.trim()) return;
    setTestStatus('sending'); setTestMsg('');
    const cfg = loadEmailConfig();
    const subject = state.steps[0]?.subject || state.subject || `Test: ${state.name}`;
    const html = state.steps[0]?.body || state.emailBody || '<p>Test email from your CRM.</p>';
    const result = await sendEmail(cfg, { to: testAddr.trim(), toName: 'Test', subject, html: personalizeHtml(html, { name: 'Test User', email: testAddr.trim() }) });
    setTestStatus(result.success ? 'ok' : 'fail');
    setTestMsg(result.success ? `Delivered! ${result.id ? `ID: ${result.id}` : ''}` : result.error || 'Send failed');
  };

  const handleLaunch = async () => {
    if (!state.name) return;
    setLaunching(true);
    let sentCount = 0;

    if (sendTime === 'now' && hasProvider && !isSMS) {
      const audience = getAudienceContacts();
      const cfg = loadEmailConfig();
      const logs: SendLog[] = audience.map(c => ({ email: c.email, name: c.name, status: 'pending' as const }));
      setSendLogs(logs);

      for (let i = 0; i < audience.length; i++) {
        const contact = audience[i];
        const subject = personalizeHtml(state.steps[0]?.subject || state.subject || state.name, contact);
        const body = state.steps[0]?.body || state.emailBody || '';
        const result = await sendEmail(cfg, { to: contact.email, toName: contact.name, subject, html: personalizeHtml(body, contact) });
        setSendLogs(prev => prev.map((l, idx) => idx === i ? { ...l, status: result.success ? 'sent' : 'failed', error: result.error } : l));
        setSendProgress(Math.round(((i + 1) / audience.length) * 100));
        if (result.success) sentCount++;
        await new Promise(r => setTimeout(r, 120));
      }
    } else {
      await new Promise(r => setTimeout(r, 1200));
      sentCount = sendTime === 'now' ? getAudienceContacts().length : 0;
    }

    setLaunching(false);
    setLaunched(true);
    setTimeout(() => onLaunch(sendTime === 'now', scheduledAt, sentCount), 1400);
  };

  if (launched) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '50px 20px', textAlign: 'center' }}>
      <div style={{ width: 70, height: 70, borderRadius: '50%', backgroundColor: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
        <CheckCircle size={34} color="#16a34a" />
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Campaign {sendTime === 'now' ? 'Launched' : 'Scheduled'}! 🎉</h2>
      {sendLogs.length > 0 && <p style={{ color: '#64748b', fontSize: 14 }}>{sendLogs.filter(l => l.status === 'sent').length} sent · {sendLogs.filter(l => l.status === 'failed').length} failed</p>}
    </div>
  );

  if (launching && sendLogs.length > 0) return (
    <div style={{ padding: '10px 0' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Sending in progress…</h2>
      <div style={{ height: 6, backgroundColor: '#e2e8f0', borderRadius: 3, marginBottom: 16 }}>
        <div style={{ height: '100%', width: `${sendProgress}%`, backgroundColor: '#6366f1', borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
        {sendLogs.map((log, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', backgroundColor: '#f8fafc', borderRadius: 7, border: '1px solid #f1f5f9' }}>
            <div style={{ width: 16, height: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {log.status === 'pending' && <Loader size={12} color="#94a3b8" />}
              {log.status === 'sent'    && <CheckCircle size={13} color="#16a34a" />}
              {log.status === 'failed'  && <XCircle size={13} color="#dc2626" />}
            </div>
            <span style={{ flex: 1, fontSize: 12, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.name} · {log.email}</span>
            {log.error && <span style={{ fontSize: 10, color: '#dc2626', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.error}</span>}
          </div>
        ))}
      </div>
    </div>
  );

  const summaryRows = [
    { label: 'Campaign', value: state.name },
    { label: 'Type', value: typeLabel },
    { label: 'Goal', value: goalLabel },
    { label: 'Steps', value: `${state.steps.length} ${isSMS ? 'SMS' : 'email'}${state.steps.length !== 1 ? 's' : ''}` },
    { label: 'Audience', value: `${counts[state.audience].toLocaleString()} contacts` },
    ...(state.fromEmail ? [{ label: 'From', value: `${state.fromName} <${state.fromEmail}>` }] : []),
    ...(state.sendDays.length > 0 ? [{ label: 'Send days', value: state.sendDays.map(d => dayLabels[d]).join(', ') }] : []),
  ];

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Review & launch</h2>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>Everything looks good? Send a test first, then launch.</p>

      {/* Summary */}
      <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: '14px 16px', marginBottom: 14, border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', marginBottom: 12 }}>
          {summaryRows.map(r => (
            <div key={r.label}>
              <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, margin: '0 0 1px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{r.label}</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', margin: 0 }}>{r.value}</p>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: state.steps.length > 0 ? 10 : 0 }}>
          {state.openTracking && <span style={{ fontSize: 10, padding: '2px 6px', backgroundColor: '#eff6ff', color: '#2563eb', borderRadius: 20, fontWeight: 600 }}>Open tracking</span>}
          {state.clickTracking && <span style={{ fontSize: 10, padding: '2px 6px', backgroundColor: '#eff6ff', color: '#2563eb', borderRadius: 20, fontWeight: 600 }}>Click tracking</span>}
          {state.stopOnReply && <span style={{ fontSize: 10, padding: '2px 6px', backgroundColor: '#ecfdf5', color: '#16a34a', borderRadius: 20, fontWeight: 600 }}>Stop on reply</span>}
        </div>
        {/* Flow preview */}
        {state.steps.length > 0 && (
          <div>
            <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, margin: '0 0 7px', textTransform: 'uppercase' }}>Campaign flow</p>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              {state.steps.map((s, i) => (
                <React.Fragment key={s.id}>
                  <div style={{ padding: '3px 9px', backgroundColor: i === 0 ? '#6366f1' : '#f1f5f9', color: i === 0 ? 'white' : '#374151', borderRadius: 6, fontSize: 10, fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Day {s.day} {!isSMS && s.subject ? `· ${s.subject.slice(0, 24)}${s.subject.length > 24 ? '…' : ''}` : ''}
                  </div>
                  {i < state.steps.length - 1 && <ChevronRight size={10} color="#94a3b8" />}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Test send / Demo mode notice */}
      {!isSMS && (
        <>
          {isDemo ? (
            <div style={{ padding: '12px 14px', backgroundColor: '#f0f9ff', borderRadius: 10, border: '1px solid #bae6fd', marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>📬</span>
              <div>
                <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700, color: '#0284c7' }}>Demo Mode — all emails go to Demo Inbox</p>
                <p style={{ margin: 0, fontSize: 12, color: '#0369a1', lineHeight: 1.5 }}>No real emails will be sent to your contacts. After launching, go to <strong>Marketing → Demo Inbox</strong> to preview all captured emails. Switch to Mailtrap or Resend in Settings when ready for real sending.</p>
              </div>
            </div>
          ) : hasProvider ? (
            <div style={{ padding: '14px', backgroundColor: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Send size={13} color="#16a34a" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#166534' }}>Send a test email before launching</span>
              </div>
              <div style={{ display: 'flex', gap: 7 }}>
                <input value={testAddr} onChange={e => setTestAddr(e.target.value)} placeholder="your@email.com"
                  style={{ flex: 1, padding: '7px 10px', border: '1px solid #d1fae5', borderRadius: 7, fontSize: 13, outline: 'none' }} />
                <button onClick={sendTestEmail} disabled={testStatus === 'sending' || !testAddr.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', backgroundColor: '#16a34a', color: 'white', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                  {testStatus === 'sending' ? <Loader size={12} /> : <Send size={12} />}
                  {testStatus === 'sending' ? 'Sending…' : 'Send Test'}
                </button>
              </div>
              {testMsg && (
                <div style={{ marginTop: 7, display: 'flex', alignItems: 'flex-start', gap: 6, padding: '6px 8px', backgroundColor: testStatus === 'ok' ? '#ecfdf5' : '#fef2f2', borderRadius: 6 }}>
                  {testStatus === 'ok' ? <CheckCircle size={13} color="#16a34a" style={{ marginTop: 1 }} /> : <XCircle size={13} color="#dc2626" style={{ marginTop: 1 }} />}
                  <span style={{ fontSize: 11, color: testStatus === 'ok' ? '#166534' : '#991b1b', lineHeight: 1.5, wordBreak: 'break-word' }}>{testMsg}</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: '12px 14px', backgroundColor: '#fef9c3', borderRadius: 10, border: '1px solid #fde68a', marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#92400e' }}>No email provider configured</p>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: '#78350f', lineHeight: 1.5 }}>
                  Go to <strong>Settings → Email & SMS</strong> and set up SMTP, Resend, or Mailtrap to send real emails.
                  You can still <strong>save this campaign as a draft</strong> now and activate it after setup.
                </p>
                <button onClick={() => { window.location.hash = '#/settings'; }}
                  style={{ padding: '5px 12px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  Set up email provider →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Timing */}
      <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>When to send</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[
          { id: 'now' as const,       label: '⚡ Send now',  desc: 'Goes live immediately' },
          { id: 'scheduled' as const, label: '📅 Schedule',  desc: 'Pick a date & time'   },
        ].map(opt => (
          <button key={opt.id} onClick={() => setSendTime(opt.id)}
            style={{ flex: 1, padding: '9px', border: `2px solid ${sendTime === opt.id ? '#6366f1' : '#e2e8f0'}`, borderRadius: 10, backgroundColor: sendTime === opt.id ? '#f5f3ff' : 'white', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: sendTime === opt.id ? '#6366f1' : '#0f172a', marginBottom: 1 }}>{opt.label}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{opt.desc}</div>
          </button>
        ))}
      </div>
      {sendTime === 'scheduled' && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', marginBottom: 5 }}><Calendar size={12} /> Schedule date & time</label>
          <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
            style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', color: '#374151', backgroundColor: 'white', width: '100%', boxSizing: 'border-box' }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {!isSMS && !hasProvider && (
          <button onClick={() => onLaunch(false, '', 0)}
            style={{ flex: 1, padding: 13, backgroundColor: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            💾 Save as Draft
          </button>
        )}
        <button onClick={handleLaunch} disabled={launching || !state.name}
          style={{ flex: 1, padding: 13, backgroundColor: (launching || !state.name) ? '#e2e8f0' : '#6366f1', color: (launching || !state.name) ? '#94a3b8' : 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: (launching || !state.name) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          {launching ? <><Loader size={15} /> {isDemo ? 'Capturing to Demo Inbox…' : (hasProvider && sendTime === 'now' && !isSMS ? 'Sending…' : 'Launching…')}</> : <><Send size={16} /> {sendTime === 'now' ? (isDemo ? `Launch → Demo Inbox (${counts[state.audience]} emails)` : (hasProvider && !isSMS ? `Launch & Send to ${counts[state.audience]} contacts` : 'Save & Launch Campaign')) : 'Schedule Campaign'}</>}
        </button>
      </div>
      {!state.name && <p style={{ fontSize: 12, color: '#f59e0b', textAlign: 'center', marginTop: 8 }}>⚠️ Add a campaign name in step 1 first</p>}
    </div>
  );
}

/* ─── Main Wizard ─── */
export default function CampaignWizard({ contacts, onClose, onAdd, editCampaign }: {
  contacts: Contact[];
  onClose: () => void;
  onAdd: (c: Omit<Campaign, 'id'>) => void;
  editCampaign?: Campaign;
}) {
  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>(() => {
    if (editCampaign) {
      const steps = editCampaign.steps?.length
        ? editCampaign.steps
        : (editCampaign.subject || editCampaign.emailBody || editCampaign.smsBody)
          ? [createStepFromCampaign(editCampaign)]
          : [];
      return {
        type: editCampaign.type, name: editCampaign.name, description: editCampaign.description || '',
        goal: (editCampaign.goal as CampaignGoal) || '', customGoal: '',
        concept: '', cta: '', tone: 'professional' as ToneType,
        fromName: editCampaign.fromName || '', fromEmail: editCampaign.fromEmail || '', replyTo: editCampaign.replyTo || '',
        openTracking: editCampaign.openTracking ?? true, clickTracking: editCampaign.clickTracking ?? true,
        stopOnReply: editCampaign.stopOnReply ?? true, stopOnBounce: editCampaign.stopOnBounce ?? true,
        sendDays: editCampaign.sendDays || ['mon', 'tue', 'wed', 'thu', 'fri'],
        sendHoursFrom: editCampaign.sendHoursFrom || '09:00', sendHoursTo: editCampaign.sendHoursTo || '17:00',
        audience: (editCampaign.audience as AudienceSegment) || 'all',
        subject: editCampaign.subject || '', previewText: editCampaign.previewText || '',
        emailBody: editCampaign.emailBody || '', smsBody: editCampaign.smsBody || '',
        steps,
      };
    }
    return {
      type: 'email', name: '', description: '',
      goal: '', customGoal: '', concept: '', cta: '', tone: 'professional',
      fromName: '', fromEmail: '', replyTo: '',
      openTracking: true, clickTracking: true, stopOnReply: true, stopOnBounce: true,
      sendDays: ['mon', 'tue', 'wed', 'thu', 'fri'], sendHoursFrom: '09:00', sendHoursTo: '17:00',
      audience: 'all', subject: '', previewText: '', emailBody: '', smsBody: '', steps: [],
    };
  });

  const update = useCallback((updates: Partial<WizardState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const counts: Record<AudienceSegment, number> = {
    all:       contacts.length,
    leads:     contacts.filter(c => c.status === 'lead').length,
    customers: contacts.filter(c => c.status === 'customer').length,
    prospects: contacts.filter(c => c.status === 'prospect').length,
  };

  const STEP_LABELS = ['Brief', 'Campaign Flow', 'Sender & Settings', 'Audience', 'Review'];
  const TOTAL_STEPS = 5;

  const isLastStep = step === TOTAL_STEPS;

  const canNext = (): boolean => {
    if (step === 1) return !!state.name && !!state.concept && !!state.goal;
    if (step === 2) return state.steps.length > 0;
    return true;
  };

  const canNextTooltip = (): string => {
    if (step === 1) {
      if (!state.name) return 'Enter a campaign name';
      if (!state.goal) return 'Select a campaign goal';
      if (!state.concept) return 'Describe what this campaign is about';
    }
    if (step === 2 && state.steps.length === 0) return 'Waiting for flow generation…';
    return '';
  };

  const renderStep = () => {
    if (step === 1) return <StepBrief state={state} onChange={update} />;
    if (step === 2) return <StepAIWorkflow state={state} onChange={update} />;
    if (step === 3) return <StepSenderSettings state={state} onChange={update} />;
    if (step === 4) return <StepAudience state={state} onChange={update} counts={counts} />;
    return <StepReview state={state} counts={counts} contacts={contacts} onLaunch={handleLaunch} />;
  };

  const handleLaunch = (sendNow: boolean, scheduledAt: string, sentCount: number) => {
    onAdd({
      name: state.name, description: state.description, type: state.type,
      status: sendNow ? 'active' : 'draft',
      goal: state.goal, audience: state.audience,
      fromName: state.fromName, fromEmail: state.fromEmail, replyTo: state.replyTo,
      openTracking: state.openTracking, clickTracking: state.clickTracking,
      stopOnReply: state.stopOnReply, stopOnBounce: state.stopOnBounce,
      sendDays: state.sendDays, sendHoursFrom: state.sendHoursFrom, sendHoursTo: state.sendHoursTo,
      subject: state.steps[0]?.subject || state.subject,
      previewText: state.previewText,
      emailBody: state.type !== 'sms' ? (state.steps[0]?.body || state.emailBody) : state.emailBody,
      smsBody: state.type === 'sms' ? (state.steps[0]?.body || state.smsBody) : state.smsBody,
      steps: state.steps,
      sent: sentCount,
      opened: 0, clicked: 0, replied: 0, bounced: 0, unsubscribed: 0,
      createdAt: new Date().toISOString().split('T')[0],
      scheduledAt: scheduledAt || undefined,
    });
    setTimeout(onClose, 1900);
  };

  /* AI tip for sidebar */
  const aiTips: Record<number, string> = {
    1: '✨ The more detail you give about your campaign concept, the better the AI can personalize your email copy and subject lines. Be specific!',
    2: '📊 Best practices: 3 emails over 7 days for promos, 4–5 emails over 14 days for nurture. Add follow-ups with "If not opened" conditions for maximum impact.',
    3: '📧 Your sender name and email affect open rates. Use a real person\'s name ("John at Acme") instead of a company name for 20–30% higher opens.',
    4: '🎯 Smaller, targeted segments outperform large blasts. A well-targeted list of 100 beats an untargeted list of 1,000 every time.',
    5: '🚀 Always send a test email first. Check subject line, preview text, and that personalization tokens like {{firstName}} render correctly.',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.72)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 20, width: '100%', maxWidth: 1000, maxHeight: '94vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 80px rgba(0,0,0,0.28)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, backgroundColor: 'white' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>{editCampaign ? 'Edit Campaign' : 'Create Campaign'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              {STEP_LABELS.map((label, i) => {
                const n = i + 1;
                const done = step > n;
                const active = step === n;
                return (
                  <React.Fragment key={label}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', backgroundColor: done || active ? '#6366f1' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: done || active ? 'white' : '#94a3b8', flexShrink: 0 }}>
                        {done ? '✓' : n}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: active ? 600 : 400, color: active ? '#6366f1' : done ? '#64748b' : '#94a3b8', whiteSpace: 'nowrap' }}>{label}</span>
                    </div>
                    {i < STEP_LABELS.length - 1 && <div style={{ width: 12, height: 1, backgroundColor: done ? '#6366f1' : '#e2e8f0', flexShrink: 0, margin: '0 1px' }} />}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}><X size={20} color="#94a3b8" /></button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '22px 26px' }}>
            {renderStep()}
          </div>

          {/* AI sidebar (hide on last step) */}
          {!isLastStep && (
            <div style={{ width: 220, flexShrink: 0, borderLeft: '1px solid #e2e8f0', backgroundColor: '#fafafa', padding: '20px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Sparkles size={12} color="white" />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>AI Guidance</span>
                </div>
                <div style={{ padding: '11px 12px', backgroundColor: 'white', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 11, color: '#374151', lineHeight: 1.7 }}>
                  {aiTips[step] || '✨ Follow the steps to build your campaign.'}
                </div>
              </div>

              {step === 4 && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Benchmarks</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {[
                      { label: 'Open rate',    value: '22–28%'   },
                      { label: 'Click rate',   value: '3–5%'     },
                      { label: 'Best day',     value: 'Tue/Thu'  },
                      { label: 'Best time',    value: '10am–2pm' },
                    ].map(b => (
                      <div key={b.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', backgroundColor: 'white', borderRadius: 6, border: '1px solid #f1f5f9' }}>
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>{b.label}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#374151' }}>{b.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quick stats</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {[
                    { label: 'Total contacts', value: contacts.length.toLocaleString() },
                    { label: 'Audience size',  value: counts[state.audience].toLocaleString() },
                    { label: 'Steps',          value: state.steps.length.toString() },
                  ].map(s => (
                    <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', backgroundColor: 'white', borderRadius: 6, border: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: 10, color: '#94a3b8' }}>{s.label}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#374151' }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        {!isLastStep && (
          <div style={{ padding: '12px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', flexShrink: 0 }}>
            <button onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, backgroundColor: 'white', cursor: step === 1 ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500, color: step === 1 ? '#cbd5e1' : '#374151' }}>
              <ChevronLeft size={14} /> Back
            </button>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>Step {step} of {TOTAL_STEPS}</span>
            <div style={{ display: 'flex', flex: 'column', alignItems: 'flex-end', gap: 4 }}>
              {!canNext() && canNextTooltip() && (
                <span style={{ fontSize: 11, color: '#f59e0b', marginRight: 8 }}>⚠️ {canNextTooltip()}</span>
              )}
              <button onClick={() => setStep(s => Math.min(TOTAL_STEPS, s + 1))} disabled={!canNext()}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 18px', backgroundColor: canNext() ? '#6366f1' : '#e2e8f0', color: canNext() ? 'white' : '#94a3b8', border: 'none', borderRadius: 8, cursor: canNext() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600 }}>
                {step === TOTAL_STEPS - 1 ? 'Review' : 'Next'} <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
