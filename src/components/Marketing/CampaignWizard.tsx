import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Contact, Campaign, CampaignStep } from '../../types';
import {
  Mail, MessageSquare, Zap, X, Bold, Italic, Underline, Strikethrough,
  Link2, List, ListOrdered, AlignLeft, AlignCenter, AlignRight,
  Smartphone, Monitor, CheckCircle, ChevronRight, ChevronLeft,
  Sparkles, RotateCcw, Plus, Trash2, Send, Eye, EyeOff,
  Clock, Calendar, Users, Settings, ChevronDown, ChevronUp, Loader, XCircle,
} from 'lucide-react';
import { loadEmailConfig, sendEmail, personalizeHtml } from '../../services/emailService';

/* ─── Types ─── */
type CampaignGoal = 'announce' | 'promote' | 'nurture' | 'welcome' | 'reengage' | 'custom';
type AudienceSegment = 'all' | 'leads' | 'customers' | 'prospects';

interface WizardStep extends CampaignStep {}

interface WizardState {
  type: Campaign['type'];
  name: string;
  description: string;
  // Sender settings
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
  // Audience
  goal: CampaignGoal | '';
  customGoal: string;
  audience: AudienceSegment;
  // Email content
  subject: string;
  subjectB: string;
  abTest: boolean;
  previewText: string;
  emailBody: string;
  // SMS content
  smsBody: string;
  // Sequence steps
  steps: WizardStep[];
}

/* ─── Static data ─── */
const GOALS = [
  { id: 'announce', label: 'Product Launch', icon: '🚀', desc: 'Announce a new product or feature' },
  { id: 'promote',  label: 'Promote Offer',  icon: '🎯', desc: 'Sale, discount, or limited-time deal' },
  { id: 'nurture',  label: 'Nurture Leads',  icon: '💬', desc: 'Build trust with educational content' },
  { id: 'welcome',  label: 'Welcome Users',  icon: '👋', desc: 'Onboard new signups or customers' },
  { id: 'reengage', label: 'Re-engage',      icon: '🔄', desc: 'Win back cold or inactive contacts' },
  { id: 'custom',   label: 'Custom Goal',    icon: '✍️', desc: 'Define your own objective' },
] as const;

const AI_TIPS: Record<string, string> = {
  'email-announce': '📢 Launch emails work best with a single bold CTA. Open rates spike 40% when the product name is in the subject. Add social proof ("10,000+ users already love it").',
  'email-promote': '🎯 Urgency drives conversions — "48 hours only" or a countdown. Use {{firstName}} to boost open rates by 26%. Keep the discount prominent above the fold.',
  'email-nurture': '💡 80% value / 20% promotion is the golden ratio. Aim for one insight per email. Space emails 4–7 days apart to avoid fatigue.',
  'email-welcome': '👋 Welcome emails get 4× the open rate of regular campaigns. Strike within the first hour of signup for maximum impact.',
  'email-reengage': '🔄 "We miss you" + exclusive offer is the #1 win-back combo. Subject: "It\'s been a while, {{firstName}}" consistently beats others.',
  'email-custom': '✨ Personalization is key — {{firstName}}, {{company}}. Emails with 1 CTA get 42% higher click rates than those with many.',
  'sms-announce': '📱 SMS open rates hit 98% in under 3 minutes. Keep under 160 chars and include a short link.',
  'sms-promote': '⚡ Flash sale SMS: "[Brand]: 30% off ends midnight. Shop: [link]". Add urgency and keep it scannable.',
  'sms-nurture': '💬 SMS nurturing works best with a question. "Hey {{firstName}}, what\'s your biggest challenge with X?" drives 3× more replies.',
  'sms-welcome': '📲 Keep welcome SMS friendly: "Hi {{firstName}}! Welcome to [Company]. Reply HELP for support."',
  'sms-reengage': '🔥 Win-back SMS: short message + exclusive discount. "We miss you! 25% off expires Friday."',
  'sms-custom': '📱 Best practices: under 160 chars, include brand name, add "Reply STOP to unsubscribe" for compliance.',
  'sequence-announce': '🚀 Launch sequences: Day 0 teaser → Day 1 launch → Day 3 social proof → Day 7 last chance. Storytelling drives 47% more conversions.',
  'sequence-nurture': '📈 6–8 emails over 30 days. Mix tips, case studies, and soft CTAs. High-value content cuts unsubscribe rate by 60%.',
  'sequence-welcome': '🎉 Onboarding: welcome → first tip → success story → check-in → upgrade nudge. 5 emails over 14 days is optimal.',
  'sequence-promote': '💥 Promotional: teaser → live → reminder → last chance → replay. 5 emails over 7 days.',
  'sequence-reengage': '💌 Win-back: "Miss you" → value reminder → exclusive offer → final notice. 4 emails, 21 days.',
  'sequence-custom': '✨ Start with a trigger, add wait periods, and branch on opens/clicks for maximum relevance.',
};
const getAiTip = (type: string, goal: string) =>
  AI_TIPS[`${type}-${goal}`] || '✨ Select a goal to see AI-powered recommendations for your campaign.';

const SUBJECT_SUGGESTIONS: Record<string, string[]> = {
  announce: ['Introducing [Product] 🚀', '[Product] is live — be first to try it', 'Big news, {{firstName}}!'],
  promote:  ['{{firstName}}, 30% off — today only ⚡', 'Your exclusive offer expires at midnight', 'Last chance to grab this deal'],
  nurture:  ['Quick tip to help you [goal], {{firstName}}', '3 things top performers do differently', 'This changed everything for our customers'],
  welcome:  ['Welcome to [Company], {{firstName}}! 🎉', 'You\'re in — here\'s what\'s next', 'Your first step starts here'],
  reengage: ['We miss you, {{firstName}} 💌', 'It\'s been a while — here\'s what\'s new', 'Come back — we have something for you'],
  custom:   ['{{firstName}}, a quick note from [Company]', 'Something important for you, {{firstName}}'],
};

const DEFAULT_BODIES: Record<string, string> = {
  announce: `<p>Hi {{firstName}},</p><p>We're thrilled to announce <strong>[Product Name]</strong> — built to help you <em>[achieve main benefit]</em>.</p><p>Here's what's new:</p><ul><li>✅ <strong>Feature 1</strong> — [brief description]</li><li>✅ <strong>Feature 2</strong> — [brief description]</li><li>✅ <strong>Feature 3</strong> — [brief description]</li></ul><p>As one of our valued contacts, you get <strong>early access</strong> starting today.</p><div style="text-align:center;margin:24px 0"><a href="#" style="display:inline-block;padding:14px 32px;background:#6366f1;color:white;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">Try It Now →</a></div><p>Questions? Just reply — we read every one.</p><p>Best,<br/>[Your Name]<br/>[Company]</p>`,
  promote:  `<p>Hi {{firstName}},</p><p>For the next <strong>48 hours only</strong>, we're giving you an exclusive deal:</p><div style="background:#f5f3ff;padding:24px;border-radius:12px;text-align:center;margin:20px 0"><p style="font-size:32px;font-weight:800;color:#6366f1;margin:0">30% OFF</p><p style="color:#374151;margin:10px 0 0;font-size:15px">Use code: <strong>SAVE30</strong></p></div><p>This is our biggest discount of the year. Don't let it pass.</p><div style="text-align:center;margin:24px 0"><a href="#" style="display:inline-block;padding:14px 32px;background:#6366f1;color:white;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">Claim Your Discount →</a></div><p>Offer expires <strong>[Date]</strong> at midnight.</p><p>Best,<br/>[Your Name]</p>`,
  nurture:  `<p>Hi {{firstName}},</p><p>Quick question: what's your biggest challenge with <em>[topic]</em> right now?</p><p>I ask because I've been noticing a pattern with our most successful customers — and I wanted to share something that's working really well.</p><p><strong>The insight:</strong> [Key insight or tip in 1–2 sentences].</p><p>Here's how to apply it today:</p><ol><li>[Action step 1]</li><li>[Action step 2]</li><li>[Action step 3]</li></ol><p>Try it and reply to let me know how it goes.</p><p>Best,<br/>[Your Name]</p>`,
  welcome:  `<p>Hi {{firstName}}, welcome aboard! 🎉</p><p>We're excited to have you. Here's what to expect:</p><ul><li>📌 <strong>Today</strong>: Explore your dashboard and set up your profile</li><li>📌 <strong>Day 2</strong>: We'll send your first pro tip</li><li>📌 <strong>Day 5</strong>: See how customers like you succeed</li></ul><p><strong>Your first step right now:</strong> [Key onboarding action]</p><div style="text-align:center;margin:24px 0"><a href="#" style="display:inline-block;padding:14px 32px;background:#6366f1;color:white;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">Get Started →</a></div><p>Questions? I'm here — just reply.</p><p>Best,<br/>[Your Name]</p>`,
  reengage: `<p>Hi {{firstName}},</p><p>It's been a while, and honestly — we miss you.</p><p>A lot has changed since you were last here. We've added [feature 1], improved [feature 2], and our customers are seeing <strong>[specific result]</strong>.</p><p>To welcome you back, here's something special:</p><div style="background:#ecfdf5;padding:20px;border-radius:12px;text-align:center;margin:20px 0"><p style="font-size:24px;font-weight:700;color:#16a34a;margin:0">25% off — exclusively for you</p><p style="color:#374151;margin:10px 0 0">Code: <strong>COMEBACK25</strong> · Expires in 7 days</p></div><div style="text-align:center;margin:24px 0"><a href="#" style="display:inline-block;padding:14px 32px;background:#6366f1;color:white;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">Come Back →</a></div><p>Best,<br/>[Your Name]</p>`,
  custom:   `<p>Hi {{firstName}},</p><p>[Write your opening — tell them why you're reaching out and why it matters to them.]</p><p>[Main body — your key message, value proposition, or information. Keep it focused on one idea.]</p><p>[Call to action — what do you want them to do? Make it specific and easy.]</p><div style="text-align:center;margin:24px 0"><a href="#" style="display:inline-block;padding:14px 32px;background:#6366f1;color:white;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">[Button Text] →</a></div><p>Best,<br/>[Your Name]<br/>[Company]</p>`,
};

const makeSteps = (goal: string): WizardStep[] => {
  const g = goal || 'custom';
  const bodies = DEFAULT_BODIES;
  const defaultSubjects: Record<string, string[][]> = {
    announce: [['Introducing [Product] 🚀', ''], ['Did you see our launch, {{firstName}}?', ''], ['Last chance for early pricing', '']],
    promote:  [['{{firstName}}, 30% off — today only ⚡', ''], ['Reminder: your offer expires tomorrow', ''], ['⚡ Last chance — offer ends tonight', '']],
    nurture:  [['Quick tip for {{firstName}}', ''], ['Part 2: The next step, {{firstName}}', ''], ['How [Customer] achieved [result]', '']],
    welcome:  [['Welcome to [Company], {{firstName}}! 🎉', ''], ['Your first win with [Product]', ''], ['Pro tip: the feature 90% of users miss', '']],
    reengage: [['We miss you, {{firstName}} 💌', ''], ['A lot has changed since you left', ''], ['Exclusive: 25% off just for you', '']],
    custom:   [['Hello {{firstName}}', ''], ['Following up, {{firstName}}', ''], ['One last thought', '']],
  };
  const days = [0, 3, 7];
  const conditions = ['Always', 'If not opened', 'If not replied'];
  const subjectList = defaultSubjects[g] || defaultSubjects.custom;
  return days.map((day, i) => ({
    id: `step-${Date.now()}-${i}`,
    day,
    waitUnit: 'days' as const,
    subject: subjectList[i]?.[0] || `Follow-up ${i + 1}`,
    subjectB: '',
    abTest: false,
    body: bodies[i === 0 ? g : 'nurture'] || bodies.custom,
    condition: conditions[i] || 'Always',
  }));
};

/* ─── Rich Email Editor ─── */
function RichEmailEditor({ initialValue, onChange, compact }: { initialValue: string; onChange: (html: string) => void; compact?: boolean }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<'edit' | 'mobile' | 'desktop'>('edit');
  const [html, setHtml] = useState(initialValue);

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = initialValue;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = useCallback((cmd: string, val?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    const h = editorRef.current?.innerHTML || '';
    setHtml(h); onChange(h);
  }, [onChange]);

  const onInput = () => {
    const h = editorRef.current?.innerHTML || '';
    setHtml(h); onChange(h);
  };

  const insertVar = (v: string) => {
    editorRef.current?.focus();
    document.execCommand('insertText', false, v);
    onInput();
  };

  const insertLink = () => {
    const url = prompt('Enter URL:', 'https://');
    if (url) exec('createLink', url);
  };

  const tb: React.CSSProperties = {
    width: 26, height: 26, border: '1px solid #e2e8f0', borderRadius: 5,
    backgroundColor: 'white', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151', flexShrink: 0,
  };
  const sep = <div style={{ width: 1, height: 18, backgroundColor: '#e2e8f0', margin: '0 2px' }} />;

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', backgroundColor: 'white' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '6px 8px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fafafa', flexWrap: 'wrap' }}>
        <button style={tb} onClick={() => exec('bold')} title="Bold"><Bold size={11} /></button>
        <button style={tb} onClick={() => exec('italic')} title="Italic"><Italic size={11} /></button>
        <button style={tb} onClick={() => exec('underline')} title="Underline"><Underline size={11} /></button>
        <button style={tb} onClick={() => exec('strikeThrough')} title="Strikethrough"><Strikethrough size={11} /></button>
        {sep}
        <button style={{ ...tb, width: 'auto', padding: '0 6px', fontSize: 10, fontWeight: 700 }} onClick={() => exec('formatBlock', 'h2')}>H2</button>
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
        <button style={tb} onClick={() => exec('removeFormat')} title="Clear"><RotateCcw size={11} /></button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          {(['edit', 'mobile', 'desktop'] as const).map(m => (
            <button key={m} onClick={() => setPreview(m)}
              style={{ ...tb, width: 'auto', padding: '0 7px', fontSize: 10, fontWeight: 600, backgroundColor: preview === m ? '#ede9fe' : 'white', color: preview === m ? '#6366f1' : '#64748b', border: `1px solid ${preview === m ? '#c4b5fd' : '#e2e8f0'}` }}>
              {m === 'edit' ? '✏️' : m === 'mobile' ? <Smartphone size={11} /> : <Monitor size={11} />}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, flexShrink: 0 }}>Insert:</span>
        {['{{firstName}}', '{{lastName}}', '{{company}}', '{{email}}', '{{unsubscribe}}'].map(v => (
          <button key={v} onClick={() => insertVar(v)}
            style={{ padding: '2px 6px', background: '#ede9fe', color: '#6d28d9', border: 'none', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontFamily: 'monospace', fontWeight: 500 }}>
            {v}
          </button>
        ))}
      </div>
      {preview === 'edit' ? (
        <div ref={editorRef} contentEditable suppressContentEditableWarning onInput={onInput}
          style={{ minHeight: compact ? 180 : 260, padding: '14px 18px', outline: 'none', fontSize: 13, lineHeight: 1.7, color: '#374151', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }} />
      ) : (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 12px', backgroundColor: '#f1f5f9', minHeight: compact ? 180 : 260 }}>
          <div style={{
            width: preview === 'mobile' ? 340 : 560,
            backgroundColor: 'white', borderRadius: preview === 'mobile' ? 16 : 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)', overflow: 'hidden',
            border: preview === 'mobile' ? '6px solid #1e293b' : '1px solid #e2e8f0',
          }}>
            <div style={{ padding: preview === 'mobile' ? '14px 12px' : '24px 32px', fontSize: preview === 'mobile' ? 13 : 14, lineHeight: 1.7, color: '#374151', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}
              dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Step 1: Campaign Setup ─── */
function StepSetup({ state, onChange }: { state: WizardState; onChange: (u: Partial<WizardState>) => void }) {
  const types = [
    { id: 'email' as const,    icon: <Mail size={22} color="#6366f1" />,          label: 'Email Campaign',   desc: 'One-off newsletter, announcement, or blast', badge: '~24% open rate', color: '#6366f1' },
    { id: 'sms' as const,      icon: <MessageSquare size={22} color="#22c55e" />, label: 'SMS Campaign',     desc: 'Flash sales, urgent alerts, direct outreach', badge: '98% open rate',  color: '#22c55e' },
    { id: 'sequence' as const, icon: <Zap size={22} color="#f59e0b" />,           label: 'Email Sequence',   desc: 'Multi-step automated follow-up flow',         badge: '3× conversion',  color: '#f59e0b' },
  ];
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Campaign setup</h2>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 22 }}>Name your campaign and choose the channel.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Campaign name *</label>
          <input value={state.name} onChange={e => onChange({ name: e.target.value })} placeholder="e.g. Summer Product Launch 2025"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Description <span style={{ fontWeight: 400, color: '#94a3b8', textTransform: 'none' }}>(optional)</span></label>
          <textarea value={state.description} onChange={e => onChange({ description: e.target.value })}
            placeholder="Internal notes about this campaign's purpose..." rows={2}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', resize: 'none', boxSizing: 'border-box', lineHeight: 1.5 }} />
        </div>
      </div>

      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Campaign type *</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {types.map(t => (
          <button key={t.id} onClick={() => onChange({ type: t.id })}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', border: `2px solid ${state.type === t.id ? t.color : '#e2e8f0'}`, borderRadius: 12, backgroundColor: state.type === t.id ? `${t.color}08` : 'white', cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s' }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: `${t.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{t.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{t.label}</span>
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, backgroundColor: `${t.color}15`, color: t.color, fontWeight: 600 }}>{t.badge}</span>
              </div>
              <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>{t.desc}</p>
            </div>
            <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${state.type === t.id ? t.color : '#cbd5e1'}`, backgroundColor: state.type === t.id ? t.color : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {state.type === t.id && <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'white' }} />}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 2: Sender & Settings ─── */
const WEEK_DAYS = [
  { id: 'mon', label: 'M' }, { id: 'tue', label: 'T' }, { id: 'wed', label: 'W' },
  { id: 'thu', label: 'T' }, { id: 'fri', label: 'F' }, { id: 'sat', label: 'S' }, { id: 'sun', label: 'S' },
];

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

function StepSenderSettings({ state, onChange }: { state: WizardState; onChange: (u: Partial<WizardState>) => void }) {
  const toggleDay = (day: string) => {
    const days = state.sendDays.includes(day) ? state.sendDays.filter(d => d !== day) : [...state.sendDays, day];
    onChange({ sendDays: days });
  };

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Sender & settings</h2>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>Configure who this campaign comes from and when it sends.</p>

      {/* Sender info */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Settings size={13} color="#6366f1" />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sender identity</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { label: 'From name', key: 'fromName' as const, placeholder: 'John at Acme Co.' },
            { label: 'From email', key: 'fromEmail' as const, placeholder: 'john@acme.com' },
            { label: 'Reply-to email', key: 'replyTo' as const, placeholder: 'support@acme.com', span: true },
          ].map(f => (
            <div key={f.key} style={f.span ? { gridColumn: '1/-1' } : {}}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>{f.label}</label>
              <input value={state[f.key] as string} onChange={e => onChange({ [f.key]: e.target.value })} placeholder={f.placeholder}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          ))}
        </div>
      </div>

      {/* Tracking & behavior */}
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
        <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>Emails will only be sent on selected days within the time range.</p>
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

/* ─── Step 3: Audience & Goal ─── */
function StepAudience({ state, onChange, counts }: { state: WizardState; onChange: (u: Partial<WizardState>) => void; counts: Record<AudienceSegment, number> }) {
  const audiences = [
    { id: 'all' as const,       label: 'All Contacts', desc: 'Everyone in your CRM', count: counts.all },
    { id: 'leads' as const,     label: 'Leads',        desc: 'Status = lead',        count: counts.leads },
    { id: 'customers' as const, label: 'Customers',    desc: 'Status = customer',    count: counts.customers },
    { id: 'prospects' as const, label: 'Prospects',    desc: 'Status = prospect',    count: counts.prospects },
  ];
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Audience & goal</h2>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>Select a goal and we'll pre-fill content templates for you.</p>

      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Campaign goal</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
        {GOALS.map(g => (
          <button key={g.id} onClick={() => onChange({ goal: g.id as CampaignGoal })}
            style={{ padding: '12px 10px', border: `2px solid ${state.goal === g.id ? '#6366f1' : '#e2e8f0'}`, borderRadius: 10, backgroundColor: state.goal === g.id ? '#f5f3ff' : 'white', cursor: 'pointer', textAlign: 'center', transition: 'all 0.12s' }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{g.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: state.goal === g.id ? '#6366f1' : '#0f172a', marginBottom: 2 }}>{g.label}</div>
            <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.3 }}>{g.desc}</div>
          </button>
        ))}
      </div>
      {state.goal === 'custom' && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Describe your goal</label>
          <textarea value={state.customGoal} onChange={e => onChange({ customGoal: e.target.value })}
            placeholder="e.g. Invite existing customers to our upcoming webinar..." rows={2}
            style={{ width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, resize: 'none', boxSizing: 'border-box', outline: 'none', lineHeight: 1.5 }} />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Users size={13} color="#6366f1" />
        <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Target audience</label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {audiences.map(a => (
          <button key={a.id} onClick={() => onChange({ audience: a.id })}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', border: `2px solid ${state.audience === a.id ? '#6366f1' : '#e2e8f0'}`, borderRadius: 10, backgroundColor: state.audience === a.id ? '#f5f3ff' : 'white', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: state.audience === a.id ? '#ede9fe' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Users size={15} color={state.audience === a.id ? '#6366f1' : '#94a3b8'} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{a.label}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{a.count.toLocaleString()} contacts · {a.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 4a: Email / SMS Content ─── */
function StepEmailContent({ state, onChange }: { state: WizardState; onChange: (u: Partial<WizardState>) => void }) {
  const suggestions = SUBJECT_SUGGESTIONS[state.goal] || SUBJECT_SUGGESTIONS.custom;
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Compose your email</h2>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 18 }}>Write your email and configure A/B testing if needed.</p>

      {/* Subject line */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Subject line *</label>
          <button onClick={() => onChange({ abTest: !state.abTest })}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', border: `1px solid ${state.abTest ? '#6366f1' : '#e2e8f0'}`, borderRadius: 6, backgroundColor: state.abTest ? '#f5f3ff' : 'white', color: state.abTest ? '#6366f1' : '#64748b', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            {state.abTest ? <EyeOff size={11} /> : <Eye size={11} />} A/B Test
          </button>
        </div>
        <input value={state.subject} onChange={e => onChange({ subject: e.target.value })} placeholder="Enter subject line..."
          style={{ width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 5 }} />
        {state.abTest && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <span style={{ fontSize: 11, padding: '2px 7px', backgroundColor: '#f59e0b15', color: '#f59e0b', borderRadius: 20, fontWeight: 700, flexShrink: 0 }}>Variant B</span>
            <input value={state.subjectB} onChange={e => onChange({ subjectB: e.target.value })} placeholder="Alternative subject line to test..."
              style={{ flex: 1, padding: '9px 11px', border: '1px solid #fde68a', borderRadius: 8, fontSize: 13, outline: 'none' }} />
          </div>
        )}
        {suggestions.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#94a3b8' }}>✨ AI:</span>
            {suggestions.map(s => (
              <button key={s} onClick={() => onChange({ subject: s })}
                style={{ padding: '2px 8px', backgroundColor: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd', borderRadius: 20, fontSize: 10, cursor: 'pointer', fontWeight: 500 }}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>
          Preview text <span style={{ color: '#94a3b8', fontWeight: 400, textTransform: 'none' }}>(shown after subject in inbox)</span>
        </label>
        <input value={state.previewText} onChange={e => onChange({ previewText: e.target.value })} placeholder="Short teaser shown in the inbox preview..."
          style={{ width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
      </div>

      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Email body *</label>
      <RichEmailEditor initialValue={state.emailBody} onChange={html => onChange({ emailBody: html })} />
    </div>
  );
}

function StepSMSContent({ state, onChange }: { state: WizardState; onChange: (u: Partial<WizardState>) => void }) {
  const len = state.smsBody.length;
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Write your SMS</h2>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 18 }}>Keep it short, punchy, and include your brand name and a clear CTA.</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Message *</label>
        <span style={{ fontSize: 11, color: len > 160 ? '#dc2626' : '#94a3b8', fontWeight: 500 }}>{len}/160 · {Math.ceil(Math.max(len, 1) / 160)} SMS</span>
      </div>
      <textarea value={state.smsBody} onChange={e => onChange({ smsBody: e.target.value })}
        placeholder="Hi {{firstName}}, [Brand]: your message here. Reply STOP to opt out." rows={5}
        style={{ width: '100%', padding: 12, border: `1px solid ${len > 160 ? '#fca5a5' : '#e2e8f0'}`, borderRadius: 8, fontSize: 14, fontFamily: '-apple-system, sans-serif', resize: 'none', boxSizing: 'border-box', outline: 'none', lineHeight: 1.6 }} />
      <div style={{ padding: '9px 12px', backgroundColor: '#f8fafc', borderRadius: 8, marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#64748b' }}>💡 Include brand name</span>
        <span style={{ fontSize: 11, color: '#64748b' }}>· Add "Reply STOP to opt out"</span>
        <span style={{ fontSize: 11, color: '#64748b' }}>· Use short URLs</span>
      </div>
    </div>
  );
}

/* ─── Step 4b: Sequence Builder ─── */
function StepSequenceBuilder({ state, onChange }: { state: WizardState; onChange: (u: Partial<WizardState>) => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(state.steps[0]?.id ?? null);

  const updateStep = (id: string, updates: Partial<WizardStep>) =>
    onChange({ steps: state.steps.map(s => s.id === id ? { ...s, ...updates } : s) });

  const removeStep = (id: string) => {
    const next = state.steps.filter(s => s.id !== id);
    onChange({ steps: next });
    if (expandedId === id) setExpandedId(next[0]?.id ?? null);
  };

  const addStep = () => {
    const last = state.steps[state.steps.length - 1];
    const newStep: WizardStep = {
      id: `step-${Date.now()}`, day: (last?.day || 0) + 7, waitUnit: 'days',
      subject: 'Following up, {{firstName}}', subjectB: '', abTest: false,
      body: DEFAULT_BODIES.nurture, condition: 'If not replied',
    };
    onChange({ steps: [...state.steps, newStep] });
    setExpandedId(newStep.id);
  };

  const conditionColors: Record<string, { bg: string; color: string }> = {
    'Always':         { bg: '#ecfdf5', color: '#16a34a' },
    'If not opened':  { bg: '#fef3c7', color: '#d97706' },
    'If not clicked': { bg: '#fef3c7', color: '#d97706' },
    'If not replied': { bg: '#fee2e2', color: '#dc2626' },
    'If opened':      { bg: '#eff6ff', color: '#2563eb' },
    'If clicked':     { bg: '#eff6ff', color: '#2563eb' },
  };

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Sequence builder</h2>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 18 }}>Each step is a separate email. Click to expand and edit the full email content.</p>

      {/* Summary bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', backgroundColor: '#f5f3ff', borderRadius: 8, border: '1px solid #ede9fe', marginBottom: 18, flexWrap: 'wrap' }}>
        <Zap size={13} color="#6366f1" />
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6366f1' }}>{state.steps.length} email{state.steps.length !== 1 ? 's' : ''}</span>
        <span style={{ fontSize: 11, color: '#8b5cf6' }}>·</span>
        <span style={{ fontSize: 12, color: '#8b5cf6' }}>Spans {state.steps.length > 0 ? state.steps[state.steps.length - 1].day : 0} days</span>
        {state.stopOnReply && <><span style={{ fontSize: 11, color: '#8b5cf6' }}>·</span><span style={{ fontSize: 12, color: '#8b5cf6' }}>Stops on reply</span></>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {state.steps.map((step, idx) => {
          const isFirst = idx === 0;
          const isExpanded = expandedId === step.id;
          const cc = conditionColors[step.condition] || conditionColors['Always'];
          return (
            <div key={step.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {/* Timeline dot */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 32, flexShrink: 0, paddingTop: 4 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: isFirst ? '#6366f1' : '#f1f5f9', border: isFirst ? 'none' : '2px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                  {isFirst ? <Mail size={12} color="white" /> : <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>{idx + 1}</span>}
                </div>
                {idx < state.steps.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 20, backgroundColor: '#e2e8f0', marginTop: 2 }} />}
              </div>

              {/* Step card */}
              <div style={{ flex: 1, border: `1px solid ${isExpanded ? '#c4b5fd' : '#e2e8f0'}`, borderRadius: 10, overflow: 'hidden', marginBottom: 10, backgroundColor: 'white', boxShadow: isExpanded ? '0 0 0 3px #ede9fe' : 'none', transition: 'box-shadow 0.15s' }}>
                {/* Step header */}
                <div onClick={() => setExpandedId(isExpanded ? null : step.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', cursor: 'pointer', backgroundColor: isExpanded ? '#faf5ff' : 'white' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: isFirst ? '#6366f1' : '#374151' }}>
                        {isFirst ? 'Day 0 · Initial email' : `Day ${step.day} · Follow-up ${idx}`}
                      </span>
                      <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, fontWeight: 600, backgroundColor: cc.bg, color: cc.color }}>{step.condition}</span>
                      {step.abTest && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, fontWeight: 600, backgroundColor: '#fef3c7', color: '#d97706' }}>A/B</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{step.subject || '(No subject)'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {!isFirst && (
                      <button onClick={e => { e.stopPropagation(); removeStep(step.id); }}
                        style={{ width: 24, height: 24, border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Trash2 size={12} />
                      </button>
                    )}
                    {isExpanded ? <ChevronUp size={15} color="#94a3b8" /> : <ChevronDown size={15} color="#94a3b8" />}
                  </div>
                </div>

                {/* Expanded editor */}
                {isExpanded && (
                  <div style={{ padding: '14px 14px 16px', borderTop: '1px solid #f1f5f9', backgroundColor: '#fafafa' }}>
                    {/* Step meta fields */}
                    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 8, marginBottom: 12 }}>
                      {!isFirst && (
                        <>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 3, fontWeight: 500 }}>Send after</label>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <input type="number" min={1} value={step.day} onChange={e => updateStep(step.id, { day: parseInt(e.target.value) || 1 })}
                                style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                            </div>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 3, fontWeight: 500 }}>Send condition</label>
                            <select value={step.condition} onChange={e => updateStep(step.id, { condition: e.target.value })}
                              style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none', backgroundColor: 'white', color: '#374151', cursor: 'pointer' }}>
                              {['If not opened', 'If not clicked', 'If not replied', 'If opened', 'If clicked', 'Always'].map(c => <option key={c}>{c}</option>)}
                            </select>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Subject with A/B test */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>Subject line</label>
                        <button onClick={() => updateStep(step.id, { abTest: !step.abTest })}
                          style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', border: `1px solid ${step.abTest ? '#f59e0b' : '#e2e8f0'}`, borderRadius: 5, backgroundColor: step.abTest ? '#fef3c7' : 'white', color: step.abTest ? '#d97706' : '#64748b', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                          A/B Test
                        </button>
                      </div>
                      <input value={step.subject} onChange={e => updateStep(step.id, { subject: e.target.value })} placeholder="Email subject line..."
                        style={{ width: '100%', padding: '7px 9px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box', marginBottom: 5 }} />
                      {step.abTest && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10, padding: '1px 6px', backgroundColor: '#fef3c7', color: '#d97706', borderRadius: 10, fontWeight: 700, flexShrink: 0 }}>B</span>
                          <input value={step.subjectB || ''} onChange={e => updateStep(step.id, { subjectB: e.target.value })} placeholder="Variant B subject..."
                            style={{ flex: 1, padding: '7px 9px', border: '1px solid #fde68a', borderRadius: 7, fontSize: 12, outline: 'none' }} />
                        </div>
                      )}
                    </div>

                    {/* Email body editor */}
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Email body</label>
                    <RichEmailEditor compact initialValue={step.body} onChange={html => updateStep(step.id, { body: html })} />
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

/* ─── Step 5: Review & Launch ─── */
interface SendLog { email: string; name: string; status: 'pending' | 'sent' | 'failed'; error?: string; }

function StepReview({ state, counts, contacts, onLaunch }: { state: WizardState; counts: Record<AudienceSegment, number>; contacts: Contact[]; onLaunch: (sendNow: boolean, scheduledAt: string, sentCount: number) => void }) {
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
  const hasProvider = emailConfig.provider !== 'none' && !!emailConfig.apiKey;

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
    const subject = state.subject || `Test: ${state.name}`;
    const html = state.emailBody || '<p>Test email from your CRM.</p>';
    const result = await sendEmail(cfg, { to: testAddr.trim(), toName: 'Test', subject, html: personalizeHtml(html, { name: 'Test User', email: testAddr.trim() }) });
    if (result.success) {
      setTestStatus('ok');
      setTestMsg(`Delivered! ${result.id ? `ID: ${result.id}` : ''}`);
    } else {
      setTestStatus('fail');
      setTestMsg(result.error || 'Send failed');
    }
  };

  const handleLaunch = async () => {
    if (!state.name) return;
    setLaunching(true);

    let sentCount = 0;

    if (sendTime === 'now' && hasProvider && state.type !== 'sms') {
      const audience = getAudienceContacts();
      const subject = state.subject || state.name;
      const body = state.type === 'sequence' ? (state.steps[0]?.body || state.emailBody) : state.emailBody;
      const cfg = loadEmailConfig();

      const logs: SendLog[] = audience.map(c => ({ email: c.email, name: c.name, status: 'pending' as const }));
      setSendLogs(logs);

      for (let i = 0; i < audience.length; i++) {
        const contact = audience[i];
        const result = await sendEmail(cfg, {
          to: contact.email,
          toName: contact.name,
          subject: personalizeHtml(subject, contact),
          html: personalizeHtml(body || '', contact),
        });
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
      {sendLogs.length > 0 && (
        <p style={{ color: '#64748b', fontSize: 14 }}>
          {sendLogs.filter(l => l.status === 'sent').length} sent · {sendLogs.filter(l => l.status === 'failed').length} failed
        </p>
      )}
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
              {log.status === 'pending' && <Loader size={12} color="#94a3b8" style={{ animation: 'spin 1s linear infinite' }} />}
              {log.status === 'sent' && <CheckCircle size={13} color="#16a34a" />}
              {log.status === 'failed' && <XCircle size={13} color="#dc2626" />}
            </div>
            <span style={{ flex: 1, fontSize: 12, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.name} · {log.email}</span>
            {log.error && <span style={{ fontSize: 10, color: '#dc2626', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.error}</span>}
          </div>
        ))}
      </div>
    </div>
  );

  const rows = [
    { label: 'Name', value: state.name || '(No name)' },
    { label: 'Type', value: typeLabel },
    { label: 'Goal', value: goalLabel },
    { label: 'Audience', value: `${counts[state.audience].toLocaleString()} contacts` },
    ...(state.fromEmail ? [{ label: 'From', value: `${state.fromName} <${state.fromEmail}>` }] : []),
    ...(state.sendDays.length > 0 ? [{ label: 'Send days', value: state.sendDays.map(d => dayLabels[d]).join(', ') }] : []),
  ];

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Review & launch</h2>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>Review your campaign, send a test, then launch.</p>

      {/* Summary */}
      <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: '14px 16px', marginBottom: 14, border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', marginBottom: 10 }}>
          {rows.map(r => (
            <div key={r.label}>
              <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, margin: '0 0 1px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{r.label}</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', margin: 0 }}>{r.value}</p>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {state.openTracking && <span style={{ fontSize: 10, padding: '2px 6px', backgroundColor: '#eff6ff', color: '#2563eb', borderRadius: 20, fontWeight: 600 }}>Open tracking</span>}
          {state.clickTracking && <span style={{ fontSize: 10, padding: '2px 6px', backgroundColor: '#eff6ff', color: '#2563eb', borderRadius: 20, fontWeight: 600 }}>Click tracking</span>}
          {state.stopOnReply && <span style={{ fontSize: 10, padding: '2px 6px', backgroundColor: '#ecfdf5', color: '#16a34a', borderRadius: 20, fontWeight: 600 }}>Stop on reply</span>}
        </div>
        {state.type !== 'sms' && state.subject && (
          <div style={{ marginTop: 10, padding: '8px 10px', backgroundColor: 'white', borderRadius: 7, border: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, margin: '0 0 2px', textTransform: 'uppercase' }}>Subject</p>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', margin: 0 }}>{state.subject}</p>
            {state.abTest && state.subjectB && <p style={{ fontSize: 11, color: '#d97706', margin: '2px 0 0' }}>B: {state.subjectB}</p>}
          </div>
        )}
        {state.type === 'sequence' && state.steps.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, margin: '0 0 6px', textTransform: 'uppercase' }}>Sequence</p>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              {state.steps.map((s, i) => (
                <React.Fragment key={s.id}>
                  <span style={{ padding: '2px 7px', backgroundColor: i === 0 ? '#6366f1' : '#f1f5f9', color: i === 0 ? 'white' : '#374151', borderRadius: 6, fontSize: 10, fontWeight: 600 }}>Day {s.day}</span>
                  {i < state.steps.length - 1 && <ChevronRight size={10} color="#94a3b8" />}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Test send */}
      {state.type !== 'sms' && (
        <div style={{ padding: '14px', backgroundColor: hasProvider ? '#f0fdf4' : '#fef9c3', borderRadius: 10, border: `1px solid ${hasProvider ? '#bbf7d0' : '#fde68a'}`, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Send size={13} color={hasProvider ? '#16a34a' : '#d97706'} />
            <span style={{ fontSize: 12, fontWeight: 700, color: hasProvider ? '#166534' : '#92400e' }}>
              {hasProvider ? 'Test email — send a preview first' : '⚠️ No email provider configured — go to Settings → Email & SMS to set up Mailtrap or Resend'}
            </span>
          </div>
          {hasProvider && (
            <div style={{ display: 'flex', gap: 7 }}>
              <input value={testAddr} onChange={e => setTestAddr(e.target.value)} placeholder="your@email.com"
                style={{ flex: 1, padding: '7px 10px', border: '1px solid #d1fae5', borderRadius: 7, fontSize: 13, outline: 'none' }} />
              <button onClick={sendTestEmail} disabled={testStatus === 'sending' || !testAddr.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', backgroundColor: '#16a34a', color: 'white', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                {testStatus === 'sending' ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={12} />}
                {testStatus === 'sending' ? 'Sending…' : 'Send Test'}
              </button>
            </div>
          )}
          {testMsg && (
            <div style={{ marginTop: 7, display: 'flex', alignItems: 'flex-start', gap: 6, padding: '6px 8px', backgroundColor: testStatus === 'ok' ? '#ecfdf5' : '#fef2f2', borderRadius: 6 }}>
              {testStatus === 'ok' ? <CheckCircle size={13} color="#16a34a" style={{ marginTop: 1 }} /> : <XCircle size={13} color="#dc2626" style={{ marginTop: 1 }} />}
              <span style={{ fontSize: 11, color: testStatus === 'ok' ? '#166534' : '#991b1b', lineHeight: 1.5, wordBreak: 'break-word' }}>{testMsg}</span>
            </div>
          )}
        </div>
      )}

      {/* Send timing */}
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

      <button onClick={handleLaunch} disabled={launching || !state.name}
        style={{ width: '100%', padding: 13, backgroundColor: (launching || !state.name) ? '#e2e8f0' : '#6366f1', color: (launching || !state.name) ? '#94a3b8' : 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: (launching || !state.name) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        {launching ? <><Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> {hasProvider && sendTime === 'now' ? 'Sending…' : 'Launching…'}</> : <><Send size={16} /> {sendTime === 'now' ? (hasProvider ? `Launch & Send to ${counts[state.audience]} contacts` : 'Launch Campaign') : 'Schedule Campaign'}</>}
      </button>
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
      return {
        type: editCampaign.type, name: editCampaign.name, description: editCampaign.description || '',
        fromName: editCampaign.fromName || '', fromEmail: editCampaign.fromEmail || '', replyTo: editCampaign.replyTo || '',
        openTracking: editCampaign.openTracking ?? true, clickTracking: editCampaign.clickTracking ?? true,
        stopOnReply: editCampaign.stopOnReply ?? true, stopOnBounce: editCampaign.stopOnBounce ?? true,
        sendDays: editCampaign.sendDays || ['mon', 'tue', 'wed', 'thu', 'fri'],
        sendHoursFrom: editCampaign.sendHoursFrom || '09:00', sendHoursTo: editCampaign.sendHoursTo || '17:00',
        goal: (editCampaign.goal as CampaignGoal) || '', customGoal: '', audience: (editCampaign.audience as AudienceSegment) || 'all',
        subject: editCampaign.subject || '', subjectB: '', abTest: false, previewText: editCampaign.previewText || '',
        emailBody: editCampaign.emailBody || DEFAULT_BODIES.custom, smsBody: editCampaign.smsBody || '',
        steps: editCampaign.steps || makeSteps('custom'),
      };
    }
    return {
      type: 'email', name: '', description: '',
      fromName: '', fromEmail: '', replyTo: '',
      openTracking: true, clickTracking: true, stopOnReply: true, stopOnBounce: true,
      sendDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      sendHoursFrom: '09:00', sendHoursTo: '17:00',
      goal: '', customGoal: '', audience: 'all',
      subject: '', subjectB: '', abTest: false, previewText: '',
      emailBody: DEFAULT_BODIES.custom, smsBody: '',
      steps: makeSteps('custom'),
    };
  });

  const update = useCallback((updates: Partial<WizardState>) => {
    setState(prev => {
      const next = { ...prev, ...updates };
      if (updates.goal && updates.goal !== prev.goal) {
        const g = updates.goal as string;
        next.emailBody = DEFAULT_BODIES[g] || DEFAULT_BODIES.custom;
        const sug = SUBJECT_SUGGESTIONS[g] || SUBJECT_SUGGESTIONS.custom;
        if (!next.subject) next.subject = sug[0];
        next.steps = makeSteps(g);
      }
      return next;
    });
  }, []);

  const counts: Record<AudienceSegment, number> = {
    all:       contacts.length,
    leads:     contacts.filter(c => c.status === 'lead').length,
    customers: contacts.filter(c => c.status === 'customer').length,
    prospects: contacts.filter(c => c.status === 'prospect').length,
  };

  const isSMS = state.type === 'sms';
  const isEmail = state.type === 'email';
  const isSeq = state.type === 'sequence';

  /* Step labels depend on type */
  const stepLabels = isSMS
    ? ['Setup', 'Audience', 'Message', 'Review']
    : ['Setup', 'Sender & Settings', 'Audience', isSeq ? 'Sequence' : 'Content', 'Review'];
  const totalSteps = stepLabels.length;
  const isLastStep = step === totalSteps;

  /* Map current step to rendered component */
  const renderStep = () => {
    if (isSMS) {
      if (step === 1) return <StepSetup state={state} onChange={update} />;
      if (step === 2) return <StepAudience state={state} onChange={update} counts={counts} />;
      if (step === 3) return <StepSMSContent state={state} onChange={update} />;
      return <StepReview state={state} counts={counts} contacts={contacts} onLaunch={handleLaunch} />;
    }
    if (step === 1) return <StepSetup state={state} onChange={update} />;
    if (step === 2) return <StepSenderSettings state={state} onChange={update} />;
    if (step === 3) return <StepAudience state={state} onChange={update} counts={counts} />;
    if (step === 4) return isSeq ? <StepSequenceBuilder state={state} onChange={update} /> : <StepEmailContent state={state} onChange={update} />;
    return <StepReview state={state} counts={counts} contacts={contacts} onLaunch={handleLaunch} />;
  };

  const canNext = (): boolean => {
    if (step === 1) return !!state.name;
    if (!isSMS && step === 3) return !!state.goal;
    if (isSMS && step === 2) return !!state.goal;
    if (!isSMS && step === 4 && isEmail) return !!state.subject;
    if (isSMS && step === 3) return !!state.smsBody;
    return true;
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
      subject: state.subject, previewText: state.previewText,
      emailBody: state.emailBody, smsBody: state.smsBody,
      steps: isSeq ? state.steps : undefined,
      sent: sentCount,
      opened: 0, clicked: 0, replied: 0, bounced: 0, unsubscribed: 0,
      createdAt: new Date().toISOString().split('T')[0],
      scheduledAt: scheduledAt || undefined,
    });
    setTimeout(onClose, 1900);
  };

  const aiTip = state.goal ? getAiTip(state.type, state.goal) : '👋 Start by naming your campaign and selecting the channel above.';

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.72)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 20, width: '100%', maxWidth: 960, maxHeight: '94vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 80px rgba(0,0,0,0.28)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, backgroundColor: 'white' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>{editCampaign ? 'Edit Campaign' : 'Create Campaign'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              {stepLabels.map((label, i) => {
                const n = i + 1;
                const done = step > n;
                const active = step === n;
                return (
                  <React.Fragment key={label}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', backgroundColor: done ? '#6366f1' : active ? '#6366f1' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: done || active ? 'white' : '#94a3b8', flexShrink: 0 }}>
                        {done ? '✓' : n}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: active ? 600 : 400, color: active ? '#6366f1' : '#94a3b8', whiteSpace: 'nowrap' }}>{label}</span>
                    </div>
                    {i < stepLabels.length - 1 && <div style={{ width: 12, height: 1, backgroundColor: done ? '#6366f1' : '#e2e8f0', flexShrink: 0, margin: '0 1px' }} />}
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
            <div style={{ width: 234, flexShrink: 0, borderLeft: '1px solid #e2e8f0', backgroundColor: '#fafafa', padding: '20px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Sparkles size={12} color="white" />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>AI Guidance</span>
                </div>
                <div style={{ padding: '11px 12px', backgroundColor: 'white', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 11, color: '#374151', lineHeight: 1.7 }}>
                  {aiTip}
                </div>
              </div>

              {(step === 4 || (isSMS && step === 3)) && !isSeq && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Benchmarks</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {[
                      { label: 'Open rate target',    value: '22–28%'   },
                      { label: 'Click rate target',   value: '3–5%'     },
                      { label: 'Best send time',      value: 'Tue 10am' },
                      { label: 'Subject length',      value: '40–60 ch' },
                    ].map(b => (
                      <div key={b.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', backgroundColor: 'white', borderRadius: 6, border: '1px solid #f1f5f9' }}>
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>{b.label}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#374151' }}>{b.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isSeq && step === 4 && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sequence tips</p>
                  <div style={{ padding: '10px 12px', backgroundColor: 'white', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 11, color: '#374151', lineHeight: 1.7 }}>
                    <p style={{ margin: '0 0 3px' }}>• Space emails ≥ 3 days</p>
                    <p style={{ margin: '0 0 3px' }}>• 3–5 steps is optimal</p>
                    <p style={{ margin: '0 0 3px' }}>• End with clear opt-out</p>
                    <p style={{ margin: 0 }}>• A/B test subjects</p>
                  </div>
                </div>
              )}

              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quick stats</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {[
                    { label: 'Total contacts', value: contacts.length.toLocaleString() },
                    { label: 'Audience size', value: counts[state.audience].toLocaleString() },
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
            <span style={{ fontSize: 11, color: '#94a3b8' }}>Step {step} of {totalSteps}</span>
            <button onClick={() => setStep(s => Math.min(totalSteps, s + 1))} disabled={!canNext()}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 18px', backgroundColor: canNext() ? '#6366f1' : '#e2e8f0', color: canNext() ? 'white' : '#94a3b8', border: 'none', borderRadius: 8, cursor: canNext() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600 }}>
              {step === totalSteps - 1 ? 'Review' : 'Next'} <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
