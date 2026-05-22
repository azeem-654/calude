import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Contact, Campaign } from '../../types';
import {
  Mail, MessageSquare, Zap, X, Bold, Italic, Underline, Strikethrough,
  Link2, List, ListOrdered, AlignLeft, AlignCenter, AlignRight,
  Smartphone, Monitor, Users, Send, CheckCircle,
  ChevronRight, ChevronLeft, Sparkles, RotateCcw,
  Plus, Trash2,
} from 'lucide-react';

/* ─── Types ─── */
type CampaignGoal = 'announce' | 'promote' | 'nurture' | 'welcome' | 'reengage' | 'custom';
type AudienceSegment = 'all' | 'leads' | 'customers' | 'prospects';
interface FollowUp { day: number; subject: string; condition: string; }
interface WizardState {
  type: Campaign['type'];
  name: string;
  goal: CampaignGoal | '';
  customGoal: string;
  audience: AudienceSegment;
  subject: string;
  previewText: string;
  emailBody: string;
  smsBody: string;
  followUps: FollowUp[];
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
  'email-reengage': '🔄 "We miss you" + exclusive offer is the #1 win-back combo. Subject line: "It\'s been a while, {{firstName}}" consistently beats others.',
  'email-custom': '✨ Personalization is key — {{firstName}}, {{company}}, and segment your audience. Emails with 1 CTA get 42% higher click rates than those with many.',
  'sms-announce': '📱 SMS open rates hit 98% in under 3 minutes. Keep under 160 chars and include a short link. Mention your brand name at the start.',
  'sms-promote': '⚡ Flash sale SMS: "[Brand]: 30% off ends midnight. Shop: [link]". Add urgency and keep it scannable.',
  'sms-nurture': '💬 SMS nurturing works best with a question. "Hey {{firstName}}, what\'s your biggest challenge with X?" drives 3× more replies.',
  'sms-welcome': '📲 Keep welcome SMS friendly: "Hi {{firstName}}! Welcome to [Company]. Reply HELP for support." Short and personal.',
  'sms-reengage': '🔥 Win-back SMS: short message + exclusive discount. "We miss you! 25% off expires Friday — reply to claim."',
  'sms-custom': '📱 Best practices: under 160 chars, include brand name, add "Reply STOP to unsubscribe" for compliance.',
  'sequence-announce': '🚀 Launch sequences: Day 0 teaser → Day 1 launch → Day 3 social proof → Day 7 last chance. Storytelling drives 47% more conversions.',
  'sequence-nurture': '📈 6–8 emails over 30 days. Mix tips, case studies, and soft CTAs. High-value content cuts unsubscribe rate by 60%.',
  'sequence-welcome': '🎉 Onboarding: welcome → first tip → success story → check-in → upgrade nudge. 5 emails over 14 days is optimal.',
  'sequence-promote': '💥 Promotional: teaser → live → reminder → last chance → replay. 5 emails over 7 days.',
  'sequence-reengage': '💌 Win-back: "Miss you" → value reminder → exclusive offer → final notice. 4 emails, 21 days.',
  'sequence-custom': '✨ Design every step. Start with a trigger, add wait periods, and branch on opens/clicks for maximum relevance.',
};
const getAiTip = (type: string, goal: string) => AI_TIPS[`${type}-${goal}`] || '✨ Select a goal to see AI-powered recommendations for your campaign.';

const SUBJECT_SUGGESTIONS: Record<string, string[]> = {
  announce: ['Introducing [Product] 🚀', '[Product] is live — be first to try it', 'Big news, {{firstName}}!'],
  promote:  ['{{firstName}}, 30% off — today only ⚡', 'Your exclusive offer expires at midnight', 'Last chance to grab this deal'],
  nurture:  ['Quick tip to help you [goal], {{firstName}}', '3 things top performers do differently', 'This changed everything for our customers'],
  welcome:  ['Welcome to [Company], {{firstName}}! 🎉', 'You\'re in — here\'s what\'s next', 'Your first step starts here'],
  reengage: ['We miss you, {{firstName}} 💌', 'It\'s been a while — here\'s what\'s new', 'Come back — we have something for you'],
  custom:   ['{{firstName}}, a quick note from [Company]', 'Something important for you, {{firstName}}', 'We thought you\'d want to see this'],
};

const AUTO_FOLLOWUPS: Record<string, FollowUp[]> = {
  announce: [
    { day: 3,  subject: '{{firstName}}, did you see our launch?',      condition: 'If not opened' },
    { day: 7,  subject: 'Early adopter discount — 48 hours left',       condition: 'If not clicked' },
    { day: 14, subject: 'Final reminder: launch pricing ends soon',      condition: 'If not converted' },
  ],
  promote: [
    { day: 1, subject: 'Reminder: your offer expires tomorrow',          condition: 'If not clicked' },
    { day: 2, subject: '⚡ Last chance — offer ends tonight',            condition: 'If not converted' },
  ],
  nurture: [
    { day: 4,  subject: 'Part 2: {{firstName}}, here\'s the next step', condition: 'Always' },
    { day: 8,  subject: 'How [Customer] achieved [result]',              condition: 'Always' },
    { day: 14, subject: 'Ready to take the next step, {{firstName}}?',  condition: 'If not replied' },
  ],
  welcome: [
    { day: 2,  subject: 'Your first win with [Product], {{firstName}}', condition: 'Always' },
    { day: 5,  subject: 'Pro tip: the feature 90% of users miss',        condition: 'Always' },
    { day: 10, subject: 'How are things going, {{firstName}}?',          condition: 'If not replied' },
  ],
  reengage: [
    { day: 3,  subject: 'We updated a lot since you left, {{firstName}}',        condition: 'If not opened' },
    { day: 7,  subject: 'Exclusive: 25% off just for you — this week only',      condition: 'If not clicked' },
    { day: 14, subject: 'This is our last email, {{firstName}}',                 condition: 'If not replied' },
  ],
  custom: [
    { day: 3, subject: 'Following up, {{firstName}}',    condition: 'If not opened' },
    { day: 7, subject: 'One last thought from [Company]', condition: 'If not replied' },
  ],
};

const DEFAULT_BODIES: Record<string, string> = {
  announce: `<p>Hi {{firstName}},</p><p>We're thrilled to announce <strong>[Product Name]</strong> — built to help you <em>[achieve main benefit]</em>.</p><p>Here's what's new:</p><ul><li>✅ <strong>Feature 1</strong> — [brief description]</li><li>✅ <strong>Feature 2</strong> — [brief description]</li><li>✅ <strong>Feature 3</strong> — [brief description]</li></ul><p>As one of our valued contacts, you get <strong>early access</strong> starting today.</p><div style="text-align:center;margin:24px 0"><a href="#" style="display:inline-block;padding:14px 32px;background:#6366f1;color:white;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">Try It Now →</a></div><p>Questions? Just reply to this email — we read every one.</p><p>Best,<br/>[Your Name]<br/>[Company]</p>`,
  promote:  `<p>Hi {{firstName}},</p><p>For the next <strong>48 hours only</strong>, we're giving you an exclusive deal:</p><div style="background:#f5f3ff;padding:24px;border-radius:12px;text-align:center;margin:20px 0"><p style="font-size:32px;font-weight:800;color:#6366f1;margin:0">30% OFF</p><p style="color:#374151;margin:10px 0 0;font-size:15px">Use code: <strong>SAVE30</strong></p></div><p>This is our biggest discount of the year. Don't let it pass.</p><div style="text-align:center;margin:24px 0"><a href="#" style="display:inline-block;padding:14px 32px;background:#6366f1;color:white;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">Claim Your Discount →</a></div><p>Offer expires <strong>[Date]</strong> at midnight.</p><p>Best,<br/>[Your Name]</p>`,
  nurture:  `<p>Hi {{firstName}},</p><p>Quick question: what's your biggest challenge with <em>[topic]</em> right now?</p><p>I ask because I've been noticing a pattern with our most successful customers — and I wanted to share something that's been working really well.</p><p><strong>The insight:</strong> [Key insight or tip in 1–2 sentences].</p><p>Here's how to apply it today:</p><ol><li>[Action step 1]</li><li>[Action step 2]</li><li>[Action step 3]</li></ol><p>Try it and reply to let me know how it goes. I read every response.</p><p>Best,<br/>[Your Name]</p>`,
  welcome:  `<p>Hi {{firstName}}, welcome aboard! 🎉</p><p>We're excited to have you. Here's what to expect:</p><ul><li>📌 <strong>Today</strong>: Explore your dashboard and set up your profile</li><li>📌 <strong>Day 2</strong>: We'll send your first pro tip</li><li>📌 <strong>Day 5</strong>: See how customers like you succeed</li></ul><p><strong>Your first step right now:</strong> [Key onboarding action]</p><div style="text-align:center;margin:24px 0"><a href="#" style="display:inline-block;padding:14px 32px;background:#6366f1;color:white;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">Get Started →</a></div><p>Questions? I'm here — just reply.</p><p>Best,<br/>[Your Name]</p>`,
  reengage: `<p>Hi {{firstName}},</p><p>It's been a while, and honestly — we miss you.</p><p>A lot has changed since you were last here. We've added [feature 1], improved [feature 2], and our customers are seeing <strong>[specific result]</strong>.</p><p>To welcome you back, here's something special:</p><div style="background:#ecfdf5;padding:20px;border-radius:12px;text-align:center;margin:20px 0"><p style="font-size:24px;font-weight:700;color:#16a34a;margin:0">25% off — exclusively for you</p><p style="color:#374151;margin:10px 0 0">Code: <strong>COMEBACK25</strong> · Expires in 7 days</p></div><div style="text-align:center;margin:24px 0"><a href="#" style="display:inline-block;padding:14px 32px;background:#6366f1;color:white;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">Come Back →</a></div><p>Best,<br/>[Your Name]</p>`,
  custom:   `<p>Hi {{firstName}},</p><p>[Write your opening — tell them why you're reaching out and why it matters to them.]</p><p>[Main body — your key message, value proposition, or information. Keep it focused on one idea.]</p><p>[Call to action — what do you want them to do? Make it specific and easy.]</p><div style="text-align:center;margin:24px 0"><a href="#" style="display:inline-block;padding:14px 32px;background:#6366f1;color:white;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">[Button Text] →</a></div><p>[Closing — friendly sign-off]</p><p>Best,<br/>[Your Name]<br/>[Company]</p>`,
};

/* ─── Rich Email Editor ─── */
function RichEmailEditor({ initialValue, onChange }: { initialValue: string; onChange: (html: string) => void }) {
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
    width: 28, height: 28, border: '1px solid #e2e8f0', borderRadius: 5,
    backgroundColor: 'white', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151', flexShrink: 0,
  };
  const sep = <div style={{ width: 1, height: 20, backgroundColor: '#e2e8f0', margin: '0 2px' }} />;

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', backgroundColor: 'white' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '8px 10px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fafafa', flexWrap: 'wrap' }}>
        <button style={tb} onClick={() => exec('bold')} title="Bold"><Bold size={12} /></button>
        <button style={tb} onClick={() => exec('italic')} title="Italic"><Italic size={12} /></button>
        <button style={tb} onClick={() => exec('underline')} title="Underline"><Underline size={12} /></button>
        <button style={tb} onClick={() => exec('strikeThrough')} title="Strikethrough"><Strikethrough size={12} /></button>
        {sep}
        <button style={{ ...tb, width: 'auto', padding: '0 7px', fontSize: 11, fontWeight: 700 }} onClick={() => exec('formatBlock', 'h2')}>H2</button>
        <button style={{ ...tb, width: 'auto', padding: '0 7px', fontSize: 11, fontWeight: 700 }} onClick={() => exec('formatBlock', 'p')}>¶</button>
        {sep}
        <button style={tb} onClick={() => exec('insertUnorderedList')} title="Bullet list"><List size={12} /></button>
        <button style={tb} onClick={() => exec('insertOrderedList')} title="Numbered list"><ListOrdered size={12} /></button>
        {sep}
        <button style={tb} onClick={() => exec('justifyLeft')} title="Left"><AlignLeft size={12} /></button>
        <button style={tb} onClick={() => exec('justifyCenter')} title="Center"><AlignCenter size={12} /></button>
        <button style={tb} onClick={() => exec('justifyRight')} title="Right"><AlignRight size={12} /></button>
        {sep}
        <button style={tb} onClick={insertLink} title="Insert link"><Link2 size={12} /></button>
        <button style={tb} onClick={() => exec('removeFormat')} title="Clear formatting"><RotateCcw size={12} /></button>
        {/* Preview toggles */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
          {(['edit', 'mobile', 'desktop'] as const).map(m => (
            <button key={m} onClick={() => setPreview(m)}
              style={{ ...tb, width: 'auto', padding: '0 8px', fontSize: 11, fontWeight: 600, backgroundColor: preview === m ? '#ede9fe' : 'white', color: preview === m ? '#6366f1' : '#64748b', border: `1px solid ${preview === m ? '#c4b5fd' : '#e2e8f0'}` }}>
              {m === 'edit' ? '✏️' : m === 'mobile' ? <Smartphone size={12} /> : <Monitor size={12} />}
            </button>
          ))}
        </div>
      </div>
      {/* Variable tokens */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, flexShrink: 0 }}>Insert:</span>
        {['{{firstName}}', '{{lastName}}', '{{company}}', '{{email}}', '{{unsubscribe}}'].map(v => (
          <button key={v} onClick={() => insertVar(v)}
            style={{ padding: '2px 7px', background: '#ede9fe', color: '#6d28d9', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontFamily: 'monospace', fontWeight: 500 }}>
            {v}
          </button>
        ))}
      </div>
      {/* Content area */}
      {preview === 'edit' ? (
        <div ref={editorRef} contentEditable suppressContentEditableWarning onInput={onInput}
          style={{ minHeight: 260, padding: '18px 22px', outline: 'none', fontSize: 14, lineHeight: 1.7, color: '#374151', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }} />
      ) : (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 16px', backgroundColor: '#f1f5f9', minHeight: 260 }}>
          <div style={{
            width: preview === 'mobile' ? 375 : 600,
            backgroundColor: 'white',
            borderRadius: preview === 'mobile' ? 18 : 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            overflow: 'hidden',
            border: preview === 'mobile' ? '8px solid #1e293b' : '1px solid #e2e8f0',
          }}>
            <div style={{ padding: preview === 'mobile' ? '18px 14px' : '28px 36px', fontSize: preview === 'mobile' ? 14 : 15, lineHeight: 1.7, color: '#374151', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}
              dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Step 1: Type ─── */
function StepType({ value, onChange }: { value: Campaign['type']; onChange: (t: Campaign['type']) => void }) {
  const types = [
    { id: 'email' as const,    icon: <Mail size={26} color="#6366f1" />,        label: 'Email Campaign',    desc: 'Newsletters, announcements, and nurture emails.', badge: '📊 ~24% avg open rate', color: '#6366f1' },
    { id: 'sms' as const,      icon: <MessageSquare size={26} color="#22c55e" />, label: 'SMS Campaign',    desc: 'Flash sales, urgent alerts, and direct outreach.', badge: '⚡ 98% open rate',       color: '#22c55e' },
    { id: 'sequence' as const, icon: <Zap size={26} color="#f59e0b" />,          label: 'Email Sequence',  desc: 'Multi-step automated flows over time.',           badge: '🚀 3× conversion',       color: '#f59e0b' },
  ];
  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>Choose your campaign type</h2>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 28 }}>Select the channel that fits your goal best.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {types.map(t => (
          <button key={t.id} onClick={() => onChange(t.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '18px 20px', border: `2px solid ${value === t.id ? t.color : '#e2e8f0'}`, borderRadius: 14, backgroundColor: value === t.id ? `${t.color}08` : 'white', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
            <div style={{ width: 54, height: 54, borderRadius: 14, backgroundColor: `${t.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{t.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{t.label}</span>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, backgroundColor: `${t.color}15`, color: t.color, fontWeight: 600 }}>{t.badge}</span>
              </div>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{t.desc}</p>
            </div>
            <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${value === t.id ? t.color : '#cbd5e1'}`, backgroundColor: value === t.id ? t.color : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {value === t.id && <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'white' }} />}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 2: Goal & Audience ─── */
function StepGoalAudience({ state, onChange, counts }: { state: WizardState; onChange: (u: Partial<WizardState>) => void; counts: Record<AudienceSegment, number> }) {
  const audiences = [
    { id: 'all' as const,       label: 'All Contacts',  desc: 'Everyone in your CRM',           count: counts.all },
    { id: 'leads' as const,     label: 'Leads Only',    desc: 'Status = lead',                  count: counts.leads },
    { id: 'customers' as const, label: 'Customers',     desc: 'Status = customer',              count: counts.customers },
    { id: 'prospects' as const, label: 'Prospects',     desc: 'Status = prospect',              count: counts.prospects },
  ];
  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>What's the goal?</h2>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>Choose a goal and we'll pre-fill your content and flow automatically.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 28 }}>
        {GOALS.map(g => (
          <button key={g.id} onClick={() => onChange({ goal: g.id as CampaignGoal, followUps: AUTO_FOLLOWUPS[g.id] || AUTO_FOLLOWUPS.custom })}
            style={{ padding: '14px 12px', border: `2px solid ${state.goal === g.id ? '#6366f1' : '#e2e8f0'}`, borderRadius: 12, backgroundColor: state.goal === g.id ? '#f5f3ff' : 'white', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s' }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>{g.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: state.goal === g.id ? '#6366f1' : '#0f172a', marginBottom: 3 }}>{g.label}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{g.desc}</div>
          </button>
        ))}
      </div>
      {state.goal === 'custom' && (
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Describe your goal</label>
          <textarea value={state.customGoal} onChange={e => onChange({ customGoal: e.target.value })}
            placeholder="e.g. Invite existing customers to our upcoming webinar..." rows={2}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, resize: 'none', boxSizing: 'border-box', outline: 'none', lineHeight: 1.5 }} />
        </div>
      )}
      <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>Target audience</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {audiences.map(a => (
          <button key={a.id} onClick={() => onChange({ audience: a.id })}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', border: `2px solid ${state.audience === a.id ? '#6366f1' : '#e2e8f0'}`, borderRadius: 10, backgroundColor: state.audience === a.id ? '#f5f3ff' : 'white', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: state.audience === a.id ? '#ede9fe' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Users size={16} color={state.audience === a.id ? '#6366f1' : '#94a3b8'} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{a.label}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{a.count} contacts · {a.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 3: Content ─── */
function StepContent({ state, onChange }: { state: WizardState; onChange: (u: Partial<WizardState>) => void }) {
  const isSMS = state.type === 'sms';
  const suggestions = SUBJECT_SUGGESTIONS[state.goal] || SUBJECT_SUGGESTIONS.custom;
  const smsLen = state.smsBody.length;
  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
        {isSMS ? 'Write your SMS' : 'Compose your email'}
      </h2>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 22 }}>
        {isSMS ? 'Keep it short and punchy. Include your brand name and a clear CTA.' : 'Edit the AI-generated template or start from scratch.'}
      </p>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Campaign Name *</label>
        <input value={state.name} onChange={e => onChange({ name: e.target.value })} placeholder="e.g. Summer Launch 2025"
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {isSMS ? (
        <>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 5 }}>
            <span>Message *</span>
            <span style={{ color: smsLen > 160 ? '#dc2626' : '#94a3b8', fontSize: 12 }}>{smsLen}/160 · {Math.ceil(Math.max(smsLen, 1) / 160)} SMS</span>
          </label>
          <textarea value={state.smsBody} onChange={e => onChange({ smsBody: e.target.value })}
            placeholder="Hi {{firstName}}, [Brand]: your message here. Reply STOP to opt out." rows={5}
            style={{ width: '100%', padding: 12, border: `1px solid ${smsLen > 160 ? '#fca5a5' : '#e2e8f0'}`, borderRadius: 8, fontSize: 14, fontFamily: '-apple-system, sans-serif', resize: 'none', boxSizing: 'border-box', outline: 'none', lineHeight: 1.6 }} />
          <div style={{ padding: '10px 14px', backgroundColor: '#f8fafc', borderRadius: 8, marginTop: 10 }}>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>💡 <strong>Best practices:</strong> Include brand name, stay under 160 chars, and add opt-out text for compliance.</p>
          </div>
        </>
      ) : (
        <>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Subject Line *</label>
            <input value={state.subject} onChange={e => onChange({ subject: e.target.value })} placeholder="Enter subject line..."
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            {suggestions.length > 0 && (
              <div style={{ display: 'flex', gap: 5, marginTop: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>✨ AI suggestions:</span>
                {suggestions.map(s => (
                  <button key={s} onClick={() => onChange({ subject: s })}
                    style={{ padding: '3px 9px', backgroundColor: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd', borderRadius: 20, fontSize: 11, cursor: 'pointer', fontWeight: 500 }}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 5 }}>
              Preview Text <span style={{ color: '#94a3b8', fontWeight: 400 }}>(shown after subject in inbox)</span>
            </label>
            <input value={state.previewText} onChange={e => onChange({ previewText: e.target.value })} placeholder="Short teaser shown in the inbox..."
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 8 }}>Email Body *</label>
          <RichEmailEditor initialValue={state.emailBody} onChange={html => onChange({ emailBody: html })} />
        </>
      )}
    </div>
  );
}

/* ─── Step 4: Follow-up Flow (sequences only) ─── */
function StepFlow({ state, onChange }: { state: WizardState; onChange: (u: Partial<WizardState>) => void }) {
  const update = (idx: number, field: keyof FollowUp, val: string | number) =>
    onChange({ followUps: state.followUps.map((f, i) => i === idx ? { ...f, [field]: val } : f) });
  const addStep = () => {
    const last = state.followUps[state.followUps.length - 1]?.day || 0;
    onChange({ followUps: [...state.followUps, { day: last + 7, subject: 'Following up, {{firstName}}', condition: 'If not replied' }] });
  };
  const removeStep = (idx: number) => onChange({ followUps: state.followUps.filter((_, i) => i !== idx) });

  const nodeStyle = (variant: 'main' | 'follow'): React.CSSProperties => ({
    flex: 1, padding: '14px 16px', borderRadius: 10,
    backgroundColor: variant === 'main' ? '#f5f3ff' : 'white',
    border: variant === 'main' ? '1px solid #ede9fe' : '1px solid #e2e8f0',
    marginBottom: 10,
  });

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>Follow-up flow</h2>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>Auto-generated based on your goal. Edit timing, subjects, and conditions freely.</p>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Main email node */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 38, flexShrink: 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Mail size={15} color="white" />
            </div>
            <div style={{ width: 2, flex: 1, backgroundColor: '#e2e8f0', minHeight: 32 }} />
          </div>
          <div style={nodeStyle('main')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email 1 · Day 0</span>
              <span style={{ fontSize: 10, padding: '2px 8px', backgroundColor: '#6366f1', color: 'white', borderRadius: 20, fontWeight: 600 }}>Trigger: Enrolled</span>
            </div>
            <div style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{state.subject || '(No subject — set it in step 3)'}</div>
          </div>
        </div>
        {/* Follow-up nodes */}
        {state.followUps.map((f, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 38, flexShrink: 0 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: '#f1f5f9', border: '2px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>{idx + 2}</span>
              </div>
              {idx < state.followUps.length - 1 && <div style={{ width: 2, flex: 1, backgroundColor: '#e2e8f0', minHeight: 32 }} />}
            </div>
            <div style={nodeStyle('follow')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#64748b' }}>Follow-up {idx + 1}</span>
                  <span style={{ fontSize: 10, padding: '1px 7px', backgroundColor: '#fef3c7', color: '#d97706', borderRadius: 20, fontWeight: 600 }}>Day {f.day}</span>
                  <span style={{ fontSize: 10, padding: '1px 7px', backgroundColor: '#f0f9ff', color: '#0284c7', borderRadius: 20, fontWeight: 600 }}>{f.condition}</span>
                </div>
                <button onClick={() => removeStep(idx)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}><Trash2 size={13} /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>Day</div>
                  <input type="number" min={1} value={f.day} onChange={e => update(idx, 'day', parseInt(e.target.value) || 1)}
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>Subject line</div>
                  <input value={f.subject} onChange={e => update(idx, 'subject', e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>Send condition</div>
                <select value={f.condition} onChange={e => update(idx, 'condition', e.target.value)}
                  style={{ padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none', backgroundColor: 'white', color: '#374151', cursor: 'pointer' }}>
                  {['If not opened', 'If not clicked', 'If not replied', 'If opened', 'If clicked', 'Always'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>
        ))}
        <button onClick={addStep} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 16px', border: '2px dashed #e2e8f0', borderRadius: 10, backgroundColor: 'white', cursor: 'pointer', color: '#6366f1', fontSize: 13, fontWeight: 600, marginLeft: 52, marginTop: 4 }}>
          <Plus size={14} /> Add follow-up email
        </button>
      </div>
    </div>
  );
}

/* ─── Step 5: Review & Launch ─── */
function StepReview({ state, counts, onLaunch }: { state: WizardState; counts: Record<AudienceSegment, number>; onLaunch: () => void }) {
  const [sendTime, setSendTime] = useState<'now' | 'scheduled'>('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched] = useState(false);

  const goalLabel = GOALS.find(g => g.id === state.goal)?.label || 'Custom';
  const typeLabel = ({ email: 'Email', sms: 'SMS', sequence: 'Email Sequence' } as const)[state.type];

  const handleLaunch = () => {
    setLaunching(true);
    setTimeout(() => { setLaunching(false); setLaunched(true); setTimeout(onLaunch, 1600); }, 1800);
  };

  if (launched) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center' }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', backgroundColor: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <CheckCircle size={36} color="#16a34a" />
      </div>
      <h2 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Campaign Launched! 🎉</h2>
      <p style={{ color: '#64748b', fontSize: 15 }}><strong>{state.name}</strong> is now live and reaching {counts[state.audience]} contacts.</p>
    </div>
  );

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>Review & launch</h2>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 22 }}>Everything looks good? Hit launch when you're ready.</p>

      {/* Summary */}
      <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 20, marginBottom: 18, border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', marginBottom: 14 }}>
          {[
            { label: 'Campaign', value: state.name || '(No name)' },
            { label: 'Type', value: typeLabel },
            { label: 'Goal', value: goalLabel },
            { label: 'Audience', value: `${counts[state.audience]} contacts` },
          ].map(row => (
            <div key={row.label}>
              <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{row.label}</p>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: 0 }}>{row.value}</p>
            </div>
          ))}
        </div>

        {state.type !== 'sms' && state.subject && (
          <div style={{ padding: '11px 14px', backgroundColor: 'white', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: state.type === 'sequence' ? 14 : 0 }}>
            <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Subject preview</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: '0 0 2px' }}>{state.subject}</p>
            {state.previewText && <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>{state.previewText}</p>}
          </div>
        )}

        {state.type === 'sms' && state.smsBody && (
          <div style={{ padding: '11px 14px', backgroundColor: 'white', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>SMS preview</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ maxWidth: '80%', padding: '10px 14px', backgroundColor: '#3b82f6', color: 'white', borderRadius: '16px 16px 4px 16px', fontSize: 13 }}>{state.smsBody}</div>
            </div>
          </div>
        )}

        {state.type === 'sequence' && state.followUps.length > 0 && (
          <div>
            <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sequence flow</p>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ padding: '4px 10px', backgroundColor: '#6366f1', color: 'white', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>Day 0</span>
              {state.followUps.map((f, i) => (
                <React.Fragment key={i}>
                  <ChevronRight size={13} color="#94a3b8" />
                  <span style={{ padding: '4px 10px', backgroundColor: '#f1f5f9', color: '#374151', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>Day {f.day}</span>
                </React.Fragment>
              ))}
              <ChevronRight size={13} color="#94a3b8" />
              <span style={{ padding: '4px 10px', backgroundColor: '#ecfdf5', color: '#16a34a', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>End</span>
            </div>
          </div>
        )}
      </div>

      {/* Send time */}
      <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>When to send</p>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        {[
          { id: 'now' as const,       label: '⚡ Send now',  desc: 'Goes live immediately' },
          { id: 'scheduled' as const, label: '📅 Schedule',  desc: 'Pick a date & time'   },
        ].map(opt => (
          <button key={opt.id} onClick={() => setSendTime(opt.id)}
            style={{ flex: 1, padding: '11px', border: `2px solid ${sendTime === opt.id ? '#6366f1' : '#e2e8f0'}`, borderRadius: 10, backgroundColor: sendTime === opt.id ? '#f5f3ff' : 'white', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: sendTime === opt.id ? '#6366f1' : '#0f172a', marginBottom: 2 }}>{opt.label}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{opt.desc}</div>
          </button>
        ))}
      </div>
      {sendTime === 'scheduled' && (
        <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
          style={{ padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', color: '#374151', backgroundColor: 'white', marginBottom: 14 }} />
      )}

      <button onClick={handleLaunch} disabled={launching || !state.name}
        style={{ width: '100%', padding: 14, backgroundColor: (launching || !state.name) ? (launching ? '#c4b5fd' : '#e2e8f0') : '#6366f1', color: (launching || !state.name) ? '#9ca3af' : 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: (launching || !state.name) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        {launching ? <><span>⚙️</span> Launching…</> : <><Send size={17} /> Launch Campaign</>}
      </button>
      {!state.name && <p style={{ fontSize: 12, color: '#f59e0b', textAlign: 'center', marginTop: 8 }}>⚠️ Add a campaign name in step 3 first</p>}
    </div>
  );
}

/* ─── Main Wizard ─── */
export default function CampaignWizard({ contacts, onClose, onAdd }: {
  contacts: Contact[];
  onClose: () => void;
  onAdd: (c: Omit<Campaign, 'id'>) => void;
}) {
  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>({
    type: 'email', name: '', goal: '', customGoal: '',
    audience: 'all', subject: '', previewText: '',
    emailBody: DEFAULT_BODIES.custom, smsBody: '',
    followUps: AUTO_FOLLOWUPS.custom,
  });

  const update = useCallback((updates: Partial<WizardState>) => {
    setState(prev => {
      const next = { ...prev, ...updates };
      if (updates.goal && updates.goal !== prev.goal) {
        const g = updates.goal as string;
        next.emailBody = DEFAULT_BODIES[g] || DEFAULT_BODIES.custom;
        const sug = SUBJECT_SUGGESTIONS[g] || SUBJECT_SUGGESTIONS.custom;
        if (!next.subject) next.subject = sug[0];
        next.followUps = AUTO_FOLLOWUPS[g] || AUTO_FOLLOWUPS.custom;
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

  const isSequence = state.type === 'sequence';
  const steps = isSequence
    ? ['Type', 'Goal & Audience', 'Content', 'Follow-up Flow', 'Review & Launch']
    : ['Type', 'Goal & Audience', 'Content', 'Review & Launch'];
  const totalSteps = steps.length;
  const isLastStep = step === totalSteps;

  const canNext = () => {
    if (step === 1) return true;
    if (step === 2) return !!state.goal;
    if (step === 3) return !!state.name && (state.type === 'sms' ? !!state.smsBody : !!state.subject);
    return true;
  };

  const handleLaunch = () => {
    onAdd({
      name: state.name, type: state.type, status: 'active',
      sent: Math.floor(Math.random() * 600) + 80,
      opened: 0, clicked: 0, replied: 0,
      createdAt: new Date().toISOString().split('T')[0],
    });
    setTimeout(onClose, 1900);
  };

  const aiTip = state.goal ? getAiTip(state.type, state.goal) : '👋 Select a campaign type above to see AI-powered guidance.';

  const isFlowStep = isSequence && step === 4;
  const isReviewStep = step === totalSteps;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.72)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 20, width: '100%', maxWidth: 940, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 80px rgba(0,0,0,0.28)', overflow: 'hidden' }}>

        {/* Header with step progress */}
        <div style={{ padding: '18px 26px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, backgroundColor: 'white' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>Create Campaign</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {steps.map((label, i) => {
                const n = i + 1;
                const active = step === n;
                const done = step > n;
                return (
                  <React.Fragment key={label}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: done ? '#6366f1' : active ? '#6366f1' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: done || active ? 'white' : '#94a3b8', flexShrink: 0 }}>
                        {done ? '✓' : n}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: active ? 600 : 400, color: active ? '#6366f1' : done ? '#94a3b8' : '#94a3b8', whiteSpace: 'nowrap', display: 'none', ...(window.innerWidth > 700 ? { display: 'inline' } : {}) }}>{label}</span>
                    </div>
                    {i < steps.length - 1 && <div style={{ width: 14, height: 1, backgroundColor: done ? '#6366f1' : '#e2e8f0', flexShrink: 0 }} />}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}><X size={21} color="#94a3b8" /></button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          {/* Main content scroll area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '26px 28px' }}>
            {step === 1 && <StepType value={state.type} onChange={t => update({ type: t })} />}
            {step === 2 && <StepGoalAudience state={state} onChange={update} counts={counts} />}
            {step === 3 && <StepContent state={state} onChange={update} />}
            {isFlowStep && <StepFlow state={state} onChange={update} />}
            {isReviewStep && <StepReview state={state} counts={counts} onLaunch={handleLaunch} />}
          </div>

          {/* AI sidebar */}
          {!isReviewStep && (
            <div style={{ width: 250, flexShrink: 0, borderLeft: '1px solid #e2e8f0', backgroundColor: '#fafafa', padding: '22px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Sparkles size={13} color="white" />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>AI Guidance</span>
                </div>
                <div style={{ padding: '13px 14px', backgroundColor: 'white', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, color: '#374151', lineHeight: 1.65 }}>
                  {aiTip}
                </div>
              </div>

              {step === 3 && state.type !== 'sms' && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Benchmarks</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      { label: 'Open rate target',    value: '22–28%'   },
                      { label: 'Click rate target',   value: '3–5%'     },
                      { label: 'Best send time',      value: 'Tue 10am' },
                      { label: 'Subject line length', value: '40–60 ch' },
                    ].map(b => (
                      <div key={b.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', backgroundColor: 'white', borderRadius: 7, border: '1px solid #f1f5f9' }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{b.label}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{b.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isFlowStep && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Flow Tips</p>
                  <div style={{ padding: '12px 13px', backgroundColor: 'white', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, color: '#374151', lineHeight: 1.7 }}>
                    <p style={{ margin: '0 0 4px' }}>• Space emails ≥ 3 days apart</p>
                    <p style={{ margin: '0 0 4px' }}>• 3–5 steps is ideal</p>
                    <p style={{ margin: '0 0 4px' }}>• End with a clear opt-out</p>
                    <p style={{ margin: 0 }}>• A/B test subject lines</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer nav */}
        {!isReviewStep && (
          <div style={{ padding: '14px 26px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', flexShrink: 0 }}>
            <button onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: 8, backgroundColor: 'white', cursor: step === 1 ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500, color: step === 1 ? '#cbd5e1' : '#374151' }}>
              <ChevronLeft size={14} /> Back
            </button>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Step {step} of {totalSteps}</span>
            <button onClick={() => setStep(s => Math.min(totalSteps, s + 1))} disabled={!canNext()}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '9px 20px', backgroundColor: canNext() ? '#6366f1' : '#e2e8f0', color: canNext() ? 'white' : '#94a3b8', border: 'none', borderRadius: 8, cursor: canNext() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600 }}>
              {step === totalSteps - 1 ? 'Review' : 'Next'} <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
