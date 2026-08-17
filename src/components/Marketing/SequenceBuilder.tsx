import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Zap, Plus, Play, Pause, Trash2, X, Settings, Mail, Phone,
  ChevronDown, ChevronUp, Loader, BarChart2,
  Activity, Users, Wand2, Sparkles, Check,
  AlignLeft, Bold, Italic, Underline, List, Link2, RotateCcw,
  Eye, EyeOff, Inbox,
} from 'lucide-react';
import type { EmailSequence, EmailStep, StepType, SequenceStats, SequenceActivity } from '../../types/marketing';
import type { Contact } from '../../types';
import SourceTag from '../shared/SourceTag';

// ── Step type config ──────────────────────────────────────────────────────────
const STEP_TYPES: { id: StepType; label: string; icon: React.ReactElement; color: string; bg: string }[] = [
  { id: 'auto_email',   label: 'Automatic email',           icon: <Mail size={13} />,        color: '#6366f1', bg: '#eef2ff' },
  { id: 'manual_email', label: 'Manual email',              icon: <Mail size={13} />,        color: '#0ea5e9', bg: '#e0f2fe' },
  { id: 'phone_call',   label: 'Phone call',                icon: <Phone size={13} />,       color: '#16a34a', bg: '#dcfce7' },
  { id: 'li_connect',   label: 'LinkedIn – connection req', icon: <span style={{ fontSize: 9, fontWeight: 900, color: '#0a66c2' }}>in</span>,   color: '#0a66c2', bg: '#dbeafe' },
  { id: 'li_message',   label: 'LinkedIn – send message',   icon: <span style={{ fontSize: 9, fontWeight: 900, color: '#0a66c2' }}>in</span>,   color: '#0a66c2', bg: '#dbeafe' },
  { id: 'li_view',      label: 'LinkedIn – view profile',   icon: <span style={{ fontSize: 9, fontWeight: 900, color: '#0a66c2' }}>in</span>,   color: '#0a66c2', bg: '#dbeafe' },
  { id: 'li_interact',  label: 'LinkedIn – interact post',  icon: <span style={{ fontSize: 9, fontWeight: 900, color: '#0a66c2' }}>in</span>,   color: '#0a66c2', bg: '#dbeafe' },
];
function stepTypeCfg(t: StepType) { return STEP_TYPES.find(s => s.id === t) ?? STEP_TYPES[0]; }

// ── Template data ─────────────────────────────────────────────────────────────
const TEMPLATES: { id: string; name: string; category: string; desc: string; steps: number; icon: string }[] = [
  { id: 'cold-calling', name: 'Cold calling script to convert 17%', category: 'call', desc: 'Cold calling script designed to start real conversations from the first touch.', steps: 4, icon: '📞' },
  { id: 'vp-cold-call', name: 'Reach out to VPs with a proven cold calling script', category: 'call', desc: 'Reach out with a manual email, follow up with a proven cold calling script.', steps: 5, icon: '🎯' },
  { id: 'quick-pitch',  name: 'The Quick Pitch Cold Calling Script', category: 'call', desc: 'Start with a personalized email, then follow up with a cold call using a proven pitch.', steps: 4, icon: '⚡' },
  { id: 'at-risk',      name: 'At-risk customers', category: 'email', desc: 'Email to re-examine company success progress relevant to the customer.', steps: 3, icon: '⚠️' },
  { id: 'leadership',   name: 'Change in leadership', category: 'email', desc: 'Email to highlight your product\'s benefits for the new leadership, then follow up with another email to schedule.', steps: 3, icon: '👔' },
  { id: 'closed-lost',  name: 'Closed lost/win-back', category: 'email', desc: 'Series of emails for retaining the lost deal and highlighting value props.', steps: 4, icon: '🔄' },
  { id: 'inbound',      name: 'Convert inbound leads', category: 'email', desc: 'Email to show value for their new role — call to action: book a meeting.', steps: 3, icon: '🚀' },
  { id: 'onboarding',   name: 'New user onboarding', category: 'email', desc: 'Welcome and onboard new signups with a structured sequence driving activation.', steps: 5, icon: '👋' },
  { id: 'cta-book',     name: 'Book a meeting CTA', category: 'cta', desc: 'Short, punchy sequence with a single CTA: book a 15-minute call.', steps: 3, icon: '📅' },
  { id: 'cta-demo',     name: 'Request a demo CTA', category: 'cta', desc: 'Sequence built around a clear demo request CTA with follow-ups.', steps: 4, icon: '🎬' },
];

function buildStepsFromTemplate(id: string): EmailStep[] {
  const base = (n: string, d: number, t: StepType, sub: string, body: string): EmailStep => ({
    id: `${id}-${n}-${Date.now()}`, day: d, waitUnit: 'days', type: t,
    subject: sub, body, followUpRule: 'Proceed regardless', abEnabled: false,
  });
  const t = TEMPLATES.find(t => t.id === id);
  if (!t) return [];
  switch (id) {
    case 'cold-calling': return [
      base('1', 0, 'auto_email', 'Quick question about {{company}}', 'Hi {{firstName}},\n\nI noticed {{company}} is growing fast in [industry]. We help teams like yours [key benefit].\n\nWorth a quick 10-minute chat?\n\n[Your Name]'),
      base('2', 2, 'phone_call', '', 'Call to introduce yourself and reference the email sent on Day 0.'),
      base('3', 5, 'auto_email', 'Following up, {{firstName}}', 'Hi {{firstName}},\n\nI left a voicemail earlier. Still think there\'s a fit here.\n\nDo you have 10 minutes Thursday or Friday?\n\n[Your Name]'),
      base('4', 10, 'phone_call', '', 'Final call attempt. Keep it under 30 seconds. Reference previous touchpoints.'),
    ];
    case 'at-risk': return [
      base('1', 0, 'auto_email', 'Checking in, {{firstName}}', 'Hi {{firstName}},\n\nI wanted to check in on how things are going with [product]. Based on your usage, it looks like [observation].\n\nCan we schedule a quick call to get things back on track?\n\n[Your Name]'),
      base('2', 4, 'auto_email', 'Resources to help, {{firstName}}', 'Hi {{firstName}},\n\nHere are some resources specifically for your situation:\n\n• [Resource 1]\n• [Resource 2]\n\nWould love to walk through these with you.\n\n[Your Name]'),
      base('3', 9, 'manual_email', 'Last check-in', 'Hi {{firstName}},\n\nOne last note before I close this conversation. Is there anything I can do to help {{company}} get more value from [product]?\n\n[Your Name]'),
    ];
    default: return [
      base('1', 0, 'auto_email', 'A quick note, {{firstName}}', 'Hi {{firstName}},\n\n' + (t.desc || '') + '\n\nWould love to connect — any time this week?\n\n[Your Name]'),
      base('2', 3, 'auto_email', 'Following up, {{firstName}}', 'Hi {{firstName}},\n\nJust following up on my last email. Still think there\'s an opportunity here.\n\n[Your Name]'),
      base('3', 7, 'auto_email', 'Last note, {{firstName}}', 'Hi {{firstName}},\n\nLast message from me. Totally understand if timing isn\'t right — just reply and I\'ll stop reaching out.\n\n[Your Name]'),
    ];
  }
}

// ── AI helpers ────────────────────────────────────────────────────────────────
function buildAIBody(goal: string, pain: string, value: string, cta: string, company: string, context: string, proof: string): string {
  const sub = (goal || 'Outreach sequence').slice(0, 50);
  return `Hi {{firstName}},

${pain ? `I know ${pain.toLowerCase()} can be a real challenge.` : `I wanted to reach out because ${sub.toLowerCase()}.`}

${value ? value : '[Your value proposition here]'}

${proof ? `Many teams we work with — like ${proof} — have seen real results.` : ''}

${cta ? `I'd love to ${cta.toLowerCase()}. When works best for you?` : 'Would you be open to a quick call this week?'}

${company || '[Your Name]'}`;
}

function templateFallback(goal: string, fields: Record<string, string>): EmailStep[] {
  const { pain, value, cta, company, proof } = fields;
  const body1 = buildAIBody(goal, pain, value, cta, company, '', proof);
  const body2 = `Hi {{firstName}},\n\nFollowing up on my last note about ${goal.slice(0, 60) || 'how we can help'}.\n\n${value ? value : '[Key benefit]'}\n\n${cta ? `Still happy to ${cta.toLowerCase()}.` : 'Worth a quick chat?'}\n\n${company || '[Your Name]'}`;
  const body3 = `Hi {{firstName}},\n\nLast message from me — promise.\n\n${proof ? `${proof} saw great results with us.` : 'We\'ve helped many teams like yours.'}\n\n${cta ? `If you change your mind, ${cta.toLowerCase()} anytime.` : 'The door\'s always open.'}\n\n${company || '[Your Name]'}`;
  return [
    { id: `ai-1-${Date.now()}`, day: 0, waitUnit: 'days', type: 'auto_email', subject: `A quick note, {{firstName}}`, body: body1, followUpRule: 'Send next step after 3 days', abEnabled: false },
    { id: `ai-2-${Date.now()}`, day: 3, waitUnit: 'days', type: 'auto_email', subject: `Following up, {{firstName}}`, body: body2, followUpRule: 'If no reply, send after 4 days', abEnabled: false },
    { id: `ai-3-${Date.now()}`, day: 7, waitUnit: 'days', type: 'auto_email', subject: `Last note, {{firstName}}`, body: body3, followUpRule: 'End of sequence', abEnabled: false },
  ];
}

// ── Personalization util ──────────────────────────────────────────────────────
function personalize(text: string, c: Contact | null): string {
  if (!c) return text;
  return text
    .replace(/\{\{firstName\}\}/g, c.firstName ?? c.name.split(' ')[0])
    .replace(/\{\{lastName\}\}/g, c.lastName ?? c.name.split(' ')[1] ?? '')
    .replace(/\{\{email\}\}/g, c.email)
    .replace(/\{\{company\}\}/g, c.company ?? '[company]');
}

// ── Create Sequence Modal ─────────────────────────────────────────────────────
function CreateModal({ onSelect, onClose }: {
  onSelect: (mode: 'ai' | 'template' | 'scratch') => void;
  onClose: () => void;
}) {
  const options = [
    { id: 'ai' as const, label: 'AI-assisted', desc: 'Create a simply outbound sequence with one click', icon: '✨', color: '#8b5cf6' },
    { id: 'template' as const, label: 'Templates', desc: 'Start with one of our sequence templates', icon: '📋', color: '#3b82f6' },
    { id: 'scratch' as const, label: 'From scratch', desc: 'Create a new sequence from scratch', icon: '📝', color: '#64748b' },
  ];
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, width: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Create a sequence</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={20} /></button>
        </div>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b' }}>Sequences are a series of automated or manual touchpoints and activities, designed to drive deeper engagement with your contacts.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {options.map(o => (
            <button key={o.id} onClick={() => onSelect(o.id)}
              style={{ textAlign: 'left', padding: '18px 16px', border: '1px solid #e2e8f0', borderRadius: 12, cursor: 'pointer', backgroundColor: 'white', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = o.color; (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#fafafa'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e2e8f0'; (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'white'; }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{o.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{o.label}</div>
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>{o.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Template Library Modal ────────────────────────────────────────────────────
function TemplateModal({ onSelect, onClose }: {
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all');
  const cats = ['all', 'email', 'call', 'cta'];
  const filtered = TEMPLATES.filter(t => (cat === 'all' || t.category === cat) && (!search || t.name.toLowerCase().includes(search.toLowerCase())));
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Sequence templates</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Leverage automation in your outreach so you can focus on what matters most — building relationships.</p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={20} /></button>
        </div>
        <div style={{ display: 'flex', gap: 12, padding: '12px 24px', borderBottom: '1px solid #f1f5f9', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {cats.map(c => (
              <button key={c} onClick={() => setCat(c)}
                style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${cat === c ? '#6366f1' : '#e2e8f0'}`, backgroundColor: cat === c ? '#6366f1' : 'white', color: cat === c ? 'white' : '#64748b', fontSize: 12, cursor: 'pointer', fontWeight: 500, textTransform: 'capitalize' }}>
                {c === 'all' ? 'All Templates' : c === 'call' ? 'Call-based' : c === 'email' ? 'Email-based' : 'CTA-based'}
              </button>
            ))}
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates..."
            style={{ flex: 1, minWidth: 160, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, outline: 'none' }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12, alignContent: 'start' }}>
          {filtered.map(t => (
            <div key={t.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, backgroundColor: 'white', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 24 }}>{t.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>{t.name}</div>
              <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4, flex: 1 }}>{t.desc}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>{t.steps} steps</span>
                <button onClick={() => onSelect(t.id)}
                  style={{ padding: '5px 10px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  Use template
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: 13 }}>No templates match your search.</div>
          )}
        </div>
        <div style={{ padding: '12px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => onSelect('')}
            style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, cursor: 'pointer', backgroundColor: 'white', color: '#374151' }}>
            Create from scratch
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AI Generator Form ─────────────────────────────────────────────────────────
function AIGeneratorForm({ onGenerate, onClose }: {
  onGenerate: (name: string, fields: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [fields, setFields] = useState({ pain: '', value: '', cta: '', company: '', context: '', proof: '' });
  const f = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => setFields(p => ({ ...p, [k]: e.target.value }));
  const inputs: { key: keyof typeof fields; label: string; placeholder: string; rows?: number }[] = [
    { key: 'company', label: 'Company or product name *', placeholder: 'e.g. Acme Solutions' },
    { key: 'pain', label: 'Customer pain points', placeholder: 'e.g. Too much manual data entry, missing deadlines', rows: 2 },
    { key: 'value', label: 'Value proposition', placeholder: 'e.g. We automate your entire onboarding pipeline', rows: 2 },
    { key: 'cta', label: 'Call to action', placeholder: 'e.g. Book a demo', },
    { key: 'context', label: 'Company overview (optional)', placeholder: 'e.g. We help SMBs reduce churn using AI engagement tools', rows: 2 },
    { key: 'proof', label: 'Social proof (optional)', placeholder: 'e.g. 200+ SaaS companies trust us — including Acme, Globex' },
  ];
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, width: '100%', maxWidth: 580, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 20, flex: 1, overflow: 'hidden' }}>
          {/* Left panel */}
          <div style={{ width: 160, flexShrink: 0, background: 'linear-gradient(160deg,#6366f1,#8b5cf6)', padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Sparkles size={28} color="rgba(255,255,255,0.9)" />
            <div style={{ fontSize: 18, fontWeight: 800, color: 'white', lineHeight: 1.3 }}>Let AI assist with your sequences</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>Use AI to generate a complete campaign with sequential contact points to engage target audiences at scale.</div>
          </div>
          {/* Right form */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 20px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Review your company information</h3>
              <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={18} /></button>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Sequence name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Outbound AI Sequence 1"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            {inputs.map(inp => (
              <div key={inp.key}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>{inp.label}</label>
                {inp.rows ? (
                  <textarea value={fields[inp.key]} onChange={f(inp.key)} placeholder={inp.placeholder} rows={inp.rows}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.5 }} />
                ) : (
                  <input value={fields[inp.key]} onChange={e => setFields(p => ({ ...p, [inp.key]: e.target.value }))} placeholder={inp.placeholder}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                )}
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, cursor: 'pointer', backgroundColor: 'white' }}>Cancel</button>
          <button onClick={() => { if (!fields.company.trim() && !name.trim()) return; onGenerate(name || `${fields.company} Outbound Sequence`, fields); }}
            style={{ padding: '9px 20px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Sparkles size={14} /> Generate new sequence
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Email / Body editor for steps ─────────────────────────────────────────────
function BodyEditor({ value, onChange, contacts, compact }: { value: string; onChange: (v: string) => void; contacts: Contact[]; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(contacts[0] ?? null);

  useEffect(() => { if (ref.current) ref.current.innerText = value; }, []);

  const exec = useCallback((cmd: string, val?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, val);
    onChange(ref.current?.innerText ?? '');
  }, [onChange]);

  const tb: React.CSSProperties = {
    width: 26, height: 26, border: '1px solid #e2e8f0', borderRadius: 5,
    backgroundColor: 'white', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151', flexShrink: 0,
  };

  const VARS = ['{{firstName}}', '{{lastName}}', '{{email}}', '{{company}}'];

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', backgroundColor: 'white' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '5px 8px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#fafafa', flexWrap: 'wrap' }}>
        <button style={tb} onClick={() => exec('bold')} title="Bold"><Bold size={11} /></button>
        <button style={tb} onClick={() => exec('italic')} title="Italic"><Italic size={11} /></button>
        <button style={tb} onClick={() => exec('underline')} title="Underline"><Underline size={11} /></button>
        <div style={{ width: 1, height: 16, backgroundColor: '#e2e8f0', margin: '0 2px' }} />
        <button style={tb} onClick={() => exec('insertUnorderedList')} title="Bullets"><List size={11} /></button>
        <button style={tb} onClick={() => { const url = prompt('Enter URL:', 'https://'); if (url) exec('createLink', url); }} title="Link"><Link2 size={11} /></button>
        <button style={tb} onClick={() => exec('removeFormat')} title="Clear"><RotateCcw size={11} /></button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 3, alignItems: 'center' }}>
          {VARS.map(v => (
            <button key={v} onClick={() => { ref.current?.focus(); document.execCommand('insertText', false, v); onChange(ref.current?.innerText ?? ''); }}
              style={{ padding: '2px 5px', background: '#ede9fe', color: '#6d28d9', border: 'none', borderRadius: 4, fontSize: 9, cursor: 'pointer', fontFamily: 'monospace', fontWeight: 600 }}>{v}</button>
          ))}
        </div>
      </div>
      {/* Body */}
      <div ref={ref} contentEditable suppressContentEditableWarning
        onInput={() => onChange(ref.current?.innerText ?? '')}
        style={{ minHeight: compact ? 120 : 180, padding: '10px 12px', outline: 'none', fontSize: 13, lineHeight: 1.7, color: '#374151', fontFamily: 'inherit', whiteSpace: 'pre-wrap' }} />
      {/* Write with AI bar */}
      <div style={{ borderTop: '1px solid #f1f5f9', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8, backgroundColor: '#fafafa' }}>
        <button style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', border: '1px solid #c4b5fd', borderRadius: 6, backgroundColor: '#ede9fe', color: '#6d28d9', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          <Wand2 size={11} /> Write with AI
        </button>
        <div style={{ width: 1, height: 14, backgroundColor: '#e2e8f0' }} />
        {contacts.length > 0 && (
          <>
            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, flexShrink: 0 }}>Preview for:</span>
            <select value={selectedContact?.id ?? ''} onChange={e => setSelectedContact(contacts.find(c => c.id === e.target.value) ?? null)}
              style={{ fontSize: 11, padding: '2px 6px', border: '1px solid #e2e8f0', borderRadius: 6, outline: 'none', cursor: 'pointer', maxWidth: 140 }}>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={() => setShowPreview(p => !p)}
              style={{ ...tb, width: 'auto', padding: '0 6px', fontSize: 10, color: showPreview ? '#6366f1' : '#94a3b8' }}>
              {showPreview ? <EyeOff size={11} /> : <Eye size={11} />}
            </button>
          </>
        )}
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b', cursor: 'pointer' }}>
          <input type="checkbox" style={{ cursor: 'pointer', accentColor: '#6366f1' }} /> Include signature
        </label>
      </div>
      {/* Preview */}
      {showPreview && selectedContact && (
        <div style={{ borderTop: '1px solid #e2e8f0', padding: '12px', backgroundColor: '#f8fafc', fontSize: 12, color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 180, overflowY: 'auto' }}>
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Preview · {selectedContact.name} · {selectedContact.email}</div>
          {personalize(value, selectedContact)}
        </div>
      )}
    </div>
  );
}

// ── Step Editor Panel (center) ────────────────────────────────────────────────
function StepEditorPanel({ step, seqId, contacts, onChange }: {
  step: EmailStep;
  seqId: string;
  contacts: Contact[];
  onChange: (updates: Partial<EmailStep>) => void;
}) {
  const [variant, setVariant] = useState<'A' | 'B'>('A');
  const cfg = stepTypeCfg(step.type);
  const isEmail = step.type === 'auto_email' || step.type === 'manual_email';
  const isPhone = step.type === 'phone_call';
  const isLinkedIn = step.type.startsWith('li_');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Type selector + subject row */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '0 0 auto' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Type</label>
          <select value={step.type} onChange={e => onChange({ type: e.target.value as StepType })}
            style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, outline: 'none', cursor: 'pointer', backgroundColor: 'white' }}>
            {STEP_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        {isEmail && (
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Subject</label>
            <input
              value={variant === 'A' ? step.subject : (step.variantB?.subject ?? '')}
              onChange={e => variant === 'A' ? onChange({ subject: e.target.value }) : onChange({ variantB: { ...step.variantB, subject: e.target.value, body: step.variantB?.body ?? step.body } })}
              placeholder="Subject line..."
              style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        )}
        <div style={{ flex: '0 0 auto', alignSelf: 'flex-end' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Timing</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>Send in</span>
            <input type="number" min={0} value={step.day}
              onChange={e => onChange({ day: parseInt(e.target.value) || 0 })}
              style={{ width: 52, padding: '7px 8px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, outline: 'none', textAlign: 'center' }} />
            <select value={step.waitUnit} onChange={e => onChange({ waitUnit: e.target.value as 'days' | 'hours' })}
              style={{ padding: '7px 8px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
              <option value="days">days</option>
              <option value="hours">hours</option>
            </select>
          </div>
        </div>
      </div>

      {/* A/B variant tabs (email only) */}
      {isEmail && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: 8, padding: 3, gap: 2 }}>
            {(['A', 'B'] as const).map(v => (
              <button key={v} onClick={() => setVariant(v)}
                style={{ padding: '5px 14px', borderRadius: 6, border: 'none', backgroundColor: variant === v ? 'white' : 'transparent', color: variant === v ? '#6366f1' : '#64748b', fontSize: 12, fontWeight: variant === v ? 700 : 500, cursor: 'pointer', boxShadow: variant === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                Test {v}
              </button>
            ))}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!step.abEnabled} onChange={e => onChange({ abEnabled: e.target.checked })} style={{ accentColor: '#6366f1', cursor: 'pointer' }} />
            Enable A/B test
          </label>
          {variant === 'B' && !step.abEnabled && (
            <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>Enable A/B above to activate variant B</span>
          )}
        </div>
      )}

      {/* Body area */}
      {isEmail && (
        <BodyEditor
          contacts={contacts}
          value={variant === 'A' ? step.body : (step.variantB?.body ?? step.body)}
          onChange={v => variant === 'A' ? onChange({ body: v }) : onChange({ variantB: { subject: step.variantB?.subject ?? step.subject, body: v } })}
        />
      )}
      {isPhone && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Task priority</label>
            <select value={step.taskPriority ?? 'medium'} onChange={e => onChange({ taskPriority: e.target.value as 'low' | 'medium' | 'high' })}
              style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Task note</label>
            <textarea value={step.taskNote ?? ''} onChange={e => onChange({ taskNote: e.target.value })} rows={3}
              placeholder="e.g. Ask about their pain points and share your company's case studies with them."
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Write with AI</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Personalised call guide</span>
            </div>
          </div>
        </div>
      )}
      {isLinkedIn && (
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Message (optional)</label>
          <textarea value={step.body} onChange={e => onChange({ body: e.target.value })} rows={3}
            placeholder="e.g. Hi {{firstName}}, I came across your profile and thought it would be great to connect..."
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }} />
        </div>
      )}

      {/* Follow-up rule */}
      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Follow-up condition</label>
        <select value={step.followUpRule} onChange={e => onChange({ followUpRule: e.target.value })}
          style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, outline: 'none', cursor: 'pointer', width: '100%', backgroundColor: 'white' }}>
          {['Proceed regardless', 'If no reply', 'If no click', 'If no open', 'If not interested', 'End of sequence'].map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
function StatsBar({ stats }: { stats?: SequenceStats }) {
  if (!stats) return null;
  const items = [
    { label: 'Active', value: stats.active, color: '#22c55e' },
    { label: 'Paused', value: stats.paused, color: '#f59e0b' },
    { label: 'Finished', value: stats.finished, color: '#6366f1' },
    { label: 'Bounced', value: stats.bounced, color: '#ef4444' },
    { label: 'Not sent', value: stats.notSent, color: '#94a3b8' },
  ];
  return (
    <div style={{ display: 'flex', gap: 24, padding: '10px 0', marginBottom: 12 }}>
      <div>
        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Overall sequence statistics</div>
        <div style={{ display: 'flex', gap: 16 }}>
          {items.map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  sequences: EmailSequence[];
  contacts?: Contact[];
  onAddSequence: (s: Omit<EmailSequence, 'id'>) => void;
  onUpdateSequence: (id: string, updates: Partial<EmailSequence>) => void;
  onDeleteSequence: (id: string) => void;
  onActivateSequence: (seq: EmailSequence) => void;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function SequenceBuilder({ sequences, contacts = [], onAddSequence, onUpdateSequence, onDeleteSequence, onActivateSequence, onNotify }: Props) {
  const [selected, setSelected] = useState<EmailSequence | null>(null);
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [tab, setTab] = useState<'editor' | 'contacts' | 'activity' | 'report' | 'settings'>('editor');

  const [showCreate, setShowCreate] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [showAIForm, setShowAIForm] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [collapseSteps, setCollapseSteps] = useState(false);

  useEffect(() => {
    if (sequences.length > 0 && !selected) { setSelected(sequences[0]); setActiveStep(sequences[0]?.steps[0]?.id ?? null); }
  }, [sequences, selected]);

  const activeStepObj = selected?.steps.find(s => s.id === activeStep) ?? selected?.steps[0] ?? null;

  // ── Mutations ──────────────────────────────────────────────────────────────
  const updateStep = (stepId: string, updates: Partial<EmailStep>) => {
    if (!selected) return;
    const steps = selected.steps.map(s => s.id === stepId ? { ...s, ...updates } : s);
    onUpdateSequence(selected.id, { steps });
    setSelected(p => p ? { ...p, steps } : p);
  };

  const deleteStep = (stepId: string) => {
    if (!selected) return;
    const steps = selected.steps.filter(s => s.id !== stepId);
    onUpdateSequence(selected.id, { steps });
    setSelected(p => p ? { ...p, steps } : p);
    if (activeStep === stepId) setActiveStep(steps[0]?.id ?? null);
  };

  const addStep = (type: StepType) => {
    if (!selected) return;
    const maxDay = selected.steps.reduce((m, s) => Math.max(m, s.day), 0);
    const newStep: EmailStep = {
      id: `step-${Date.now()}`, day: maxDay + 3, waitUnit: 'days', type,
      subject: type === 'auto_email' ? 'New email' : '',
      body: type === 'phone_call' ? 'Call script notes...' : 'Hi {{firstName}},\n\n[Your message here]\n\n[Your Name]',
      followUpRule: 'Proceed regardless', abEnabled: false,
    };
    const steps = [...selected.steps, newStep];
    onUpdateSequence(selected.id, { steps });
    setSelected(p => p ? { ...p, steps } : p);
    setActiveStep(newStep.id);
  };

  // ── Create handlers ────────────────────────────────────────────────────────
  const handleCreateMode = (mode: 'ai' | 'template' | 'scratch') => {
    setShowCreate(false);
    if (mode === 'ai') { setShowAIForm(true); return; }
    if (mode === 'template') { setShowTemplate(true); return; }
    createScratch();
  };

  const createScratch = (name = 'New Sequence') => {
    const seq: Omit<EmailSequence, 'id'> = {
      name, goal: '', steps: [{
        id: `step-${Date.now()}`, day: 0, waitUnit: 'days', type: 'auto_email',
        subject: 'Reaching out, {{firstName}}', body: 'Hi {{firstName}},\n\n[Your message here]\n\n[Your Name]', followUpRule: 'Proceed regardless', abEnabled: false,
      }],
      status: 'draft', createdAt: new Date().toISOString().split('T')[0], enrolledCount: 0,
    };
    onAddSequence(seq);
    onNotify(`Sequence "${name}" created!`);
  };

  const handleTemplateSelect = (id: string) => {
    setShowTemplate(false);
    if (!id) { createScratch(); return; }
    const tpl = TEMPLATES.find(t => t.id === id);
    const steps = buildStepsFromTemplate(id);
    const seq: Omit<EmailSequence, 'id'> = {
      name: tpl?.name ?? 'Sequence', goal: tpl?.desc ?? '', steps,
      status: 'draft', createdAt: new Date().toISOString().split('T')[0], enrolledCount: 0,
    };
    onAddSequence(seq);
    onNotify(`Template "${tpl?.name}" applied!`);
  };

  const handleAIGenerate = (name: string, fields: Record<string, string>) => {
    setShowAIForm(false);
    setGenerating(true);
    setTimeout(() => {
      const steps = templateFallback(name, fields);
      const seq: Omit<EmailSequence, 'id'> = {
        name: name || 'AI Sequence', goal: fields.pain || fields.value || '', steps,
        status: 'draft', createdAt: new Date().toISOString().split('T')[0], enrolledCount: 0,
      };
      onAddSequence(seq);
      setGenerating(false);
      onNotify(`AI sequence "${name}" created!`);
    }, 900);
  };

  const toggleStatus = () => {
    if (!selected) return;
    const next = selected.status === 'active' ? 'paused' : selected.status === 'paused' ? 'active' : 'active';
    onUpdateSequence(selected.id, { status: next });
    if (next === 'active') { onActivateSequence(selected); onNotify(`Sequence activated!`); }
    else onNotify(`Sequence paused`);
    setSelected(p => p ? { ...p, status: next } : p);
  };

  const statusColor = { draft: '#64748b', active: '#16a34a', paused: '#d97706' };

  const TABS: { id: typeof tab; label: string; icon: React.ReactElement }[] = [
    { id: 'editor', label: 'Editor', icon: <AlignLeft size={13} /> },
    { id: 'contacts', label: 'Contacts', icon: <Users size={13} /> },
    { id: 'activity', label: 'Activity', icon: <Activity size={13} /> },
    { id: 'report', label: 'Report', icon: <BarChart2 size={13} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={13} /> },
  ];

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', overflow: 'hidden' }}>
      {/* ── Left sidebar: sequence list ──────────────────────────────────────── */}
      <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'white' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0' }}>
          <button onClick={() => setShowCreate(true)} disabled={generating}
            style={{ width: '100%', padding: '9px 14px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {generating ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
            {generating ? 'Generating…' : 'Create sequence'}
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {sequences.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8' }}>
              <Zap size={28} style={{ display: 'block', margin: '0 auto 10px', opacity: 0.35 }} />
              <p style={{ fontSize: 12, margin: 0 }}>No sequences yet.</p>
            </div>
          ) : sequences.map(seq => {
            const sc = statusColor[seq.status];
            const isActive = selected?.id === seq.id;
            return (
              <div key={seq.id} onClick={() => { setSelected(seq); setActiveStep(seq.steps[0]?.id ?? null); setTab('editor'); }}
                style={{ padding: '11px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', backgroundColor: isActive ? '#f5f3ff' : 'white', borderLeft: `3px solid ${isActive ? '#6366f1' : 'transparent'}` }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.backgroundColor = '#fafafa'; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.backgroundColor = 'white'; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{seq.name}</span>
                  {seq.source && <SourceTag source={seq.source} size="compact" />}
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 10, backgroundColor: `${sc}18`, color: sc, flexShrink: 0, textTransform: 'capitalize' }}>{seq.status}</span>
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#94a3b8' }}>
                  <span>{seq.steps.length} steps</span>
                  <span>{seq.enrolledCount} contacts</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Center: sequence editor ───────────────────────────────────────────── */}
      {selected ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', backgroundColor: 'white', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input value={selected.name} onChange={e => { onUpdateSequence(selected.id, { name: e.target.value }); setSelected(p => p ? { ...p, name: e.target.value } : p); }}
                  style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', border: 'none', outline: 'none', flex: 1, minWidth: 0, fontFamily: 'inherit', backgroundColor: 'transparent' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{selected.steps.length} steps</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>·</span>
                <span style={{ fontSize: 11, color: statusColor[selected.status], fontWeight: 600, textTransform: 'capitalize' }}>{selected.status}</span>
                {/* Opened, a sequence should say who made it and let the reader
                    go there. The list tag is compact and shows the title only,
                    which is ambiguous once several setups have run. */}
                {selected.source && <SourceTag source={selected.source} />}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button onClick={() => setCollapseSteps(p => !p)}
                style={{ padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 8, backgroundColor: 'white', color: '#64748b', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                {collapseSteps ? <ChevronDown size={13} /> : <ChevronUp size={13} />} {collapseSteps ? 'Expand' : 'Collapse'}
              </button>
              <button onClick={toggleStatus}
                style={{ padding: '7px 14px', border: 'none', borderRadius: 8, backgroundColor: selected.status === 'active' ? '#fef3c7' : '#6366f1', color: selected.status === 'active' ? '#d97706' : 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                {selected.status === 'active' ? <><Pause size={13} /> Pause</> : <><Play size={13} /> {selected.status === 'paused' ? 'Resume' : 'Activate'}</>}
              </button>
              <button onClick={() => { if (window.confirm(`Delete "${selected.name}"?`)) { onDeleteSequence(selected.id); setSelected(null); setActiveStep(null); } }}
                style={{ padding: '7px 10px', border: '1px solid #fecaca', borderRadius: 8, backgroundColor: 'white', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 0, padding: '0 20px', borderBottom: '1px solid #e2e8f0', backgroundColor: 'white', flexShrink: 0 }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '10px 14px', border: 'none', borderBottom: `2px solid ${tab === t.id ? '#6366f1' : 'transparent'}`, backgroundColor: 'transparent', color: tab === t.id ? '#6366f1' : '#64748b', fontSize: 12, fontWeight: tab === t.id ? 600 : 500, cursor: 'pointer', marginBottom: -1 }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
            {tab === 'editor' && (
              <>
                {/* Steps list */}
                {!collapseSteps && (
                  <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid #e2e8f0', overflowY: 'auto', backgroundColor: '#fafafa', padding: '10px 8px' }}>
                    <StatsBar stats={selected.stats} />
                    {selected.steps.map((step, idx) => {
                      const cfg = stepTypeCfg(step.type);
                      const isAct = step.id === (activeStepObj?.id ?? null);
                      return (
                        <div key={step.id}>
                          <div onClick={() => setActiveStep(step.id)}
                            style={{ padding: '9px 10px', borderRadius: 8, cursor: 'pointer', backgroundColor: isAct ? '#ede9fe' : 'white', border: `1px solid ${isAct ? '#c4b5fd' : '#e2e8f0'}`, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
                            <div style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: cfg.color }}>
                              {cfg.icon}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Step {idx + 1}</div>
                              <div style={{ fontSize: 10, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cfg.label}</div>
                              <div style={{ fontSize: 10, color: '#94a3b8' }}>
                                {step.day === 0 ? 'Immediately' : `After ${step.day} ${step.waitUnit}`}
                              </div>
                            </div>
                            <button onClick={e => { e.stopPropagation(); deleteStep(step.id); }}
                              style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 3, color: '#94a3b8', display: 'flex', opacity: 0, position: 'absolute', right: 4, top: 4 }}
                              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                              onMouseLeave={e => e.currentTarget.style.opacity = '0'}>
                              <X size={10} />
                            </button>
                          </div>
                          {idx < selected.steps.length - 1 && (
                            <div style={{ width: 2, height: 12, backgroundColor: '#e2e8f0', margin: '0 0 2px 22px' }} />
                          )}
                        </div>
                      );
                    })}
                    {/* Add step dropdown */}
                    <AddStepButton onAdd={addStep} />
                  </div>
                )}

                {/* Step editing area */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                  {activeStepObj ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: stepTypeCfg(activeStepObj.type).bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: stepTypeCfg(activeStepObj.type).color }}>
                          {stepTypeCfg(activeStepObj.type).icon}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Step {selected.steps.findIndex(s => s.id === activeStepObj.id) + 1} · {stepTypeCfg(activeStepObj.type).label}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{activeStepObj.day === 0 ? 'Sends immediately' : `Sends after ${activeStepObj.day} ${activeStepObj.waitUnit}`}</div>
                        </div>
                      </div>
                      <StepEditorPanel step={activeStepObj} seqId={selected.id} contacts={contacts} onChange={updates => updateStep(activeStepObj.id, updates)} />
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', gap: 12 }}>
                      <Mail size={36} style={{ opacity: 0.3 }} />
                      <p style={{ fontSize: 13 }}>Select a step to edit it</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {tab === 'activity' && (
              <ActivityLog activity={selected.activity ?? []} />
            )}
            {tab === 'contacts' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>Contacts enrolled in this sequence.</p>
                {contacts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', border: '1px dashed #e2e8f0', borderRadius: 12 }}>
                    <Users size={28} style={{ display: 'block', margin: '0 auto 10px', opacity: 0.3 }} />
                    <p style={{ fontSize: 13, margin: 0 }}>No contacts enrolled yet.</p>
                  </div>
                ) : contacts.slice(0, 20).map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1px solid #f1f5f9', borderRadius: 8, marginBottom: 6, backgroundColor: 'white' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                      {c.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{c.email}</div>
                    </div>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, backgroundColor: '#ecfdf5', color: '#16a34a', fontWeight: 600 }}>Active</span>
                  </div>
                ))}
              </div>
            )}
            {tab === 'report' && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#94a3b8' }}>
                <BarChart2 size={40} style={{ opacity: 0.25 }} />
                <div style={{ fontSize: 16, fontWeight: 600, color: '#64748b' }}>No data at the moment...</div>
                <p style={{ fontSize: 13, textAlign: 'center', maxWidth: 300, margin: 0 }}>To see the Report — launch your Sequence. Then, once a few emails are delivered, your report will appear.</p>
              </div>
            )}
            {tab === 'settings' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: 20, maxWidth: 480 }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Sequence Settings</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[
                    { label: 'Stop on reply', checked: true, desc: 'Remove contacts from sequence when they reply' },
                    { label: 'Stop on bounce', checked: true, desc: 'Remove contacts from sequence when email bounces' },
                    { label: 'Respect time zones', checked: false, desc: 'Send emails in the recipient\'s local time zone' },
                    { label: 'Business hours only', checked: true, desc: 'Only send emails during business hours (9am–5pm)' },
                  ].map(s => (
                    <div key={s.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', border: '1px solid #f1f5f9', borderRadius: 8, backgroundColor: 'white' }}>
                      <input type="checkbox" defaultChecked={s.checked} style={{ marginTop: 2, accentColor: '#6366f1', cursor: 'pointer' }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{s.label}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{s.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: 14 }}>
          <Inbox size={44} style={{ opacity: 0.25 }} />
          <h3 style={{ fontSize: 17, fontWeight: 600, color: '#64748b', margin: 0 }}>Email Sequence Builder</h3>
          <p style={{ fontSize: 13, textAlign: 'center', maxWidth: 320, lineHeight: 1.6, margin: 0 }}>
            Create outbound email sequences with AI, templates, or from scratch. Automate multi-step outreach across email, phone, and LinkedIn.
          </p>
          <button onClick={() => setShowCreate(true)}
            style={{ padding: '10px 22px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Plus size={16} /> Create First Sequence
          </button>
        </div>
      )}

      {/* Modals */}
      {showCreate && <CreateModal onSelect={handleCreateMode} onClose={() => setShowCreate(false)} />}
      {showTemplate && <TemplateModal onSelect={handleTemplateSelect} onClose={() => setShowTemplate(false)} />}
      {showAIForm && <AIGeneratorForm onGenerate={handleAIGenerate} onClose={() => setShowAIForm(false)} />}
    </div>
  );
}

// ── Add Step button ────────────────────────────────────────────────────────────
function AddStepButton({ onAdd }: { onAdd: (type: StepType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', marginTop: 8 }}>
      <button onClick={() => setOpen(p => !p)}
        style={{ width: '100%', padding: '8px', border: '2px dashed #d1d5db', borderRadius: 8, backgroundColor: 'transparent', cursor: 'pointer', fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'all 0.15s' }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#6366f1'; (e.currentTarget as HTMLButtonElement).style.color = '#6366f1'; }}
        onMouseLeave={e => { if (!open) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d1d5db'; (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8'; } }}>
        <Plus size={13} /> Add a step
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 200 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300, backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', marginTop: 4 }}>
            {STEP_TYPES.map(t => (
              <button key={t.id} onClick={() => { onAdd(t.id); setOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: '#374151', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#f8fafc'}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'}>
                <div style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.color, flexShrink: 0 }}>{t.icon}</div>
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Activity Log ───────────────────────────────────────────────────────────────
function ActivityLog({ activity }: { activity: SequenceActivity[] }) {
  const mock: SequenceActivity[] = activity.length > 0 ? activity : [
    { id: '1', text: 'You added 2 contacts to the sequence.', timestamp: new Date(Date.now() - 3600000).toISOString() },
    { id: '2', text: 'You turned on the sequence.', timestamp: new Date(Date.now() - 3500000).toISOString() },
    { id: '3', text: 'You turned on the automatic email task in Step 1.', timestamp: new Date(Date.now() - 3400000).toISOString() },
    { id: '4', text: 'You edited the Automatic Email in Step 1.', timestamp: new Date(Date.now() - 3300000).toISOString() },
    { id: '5', text: 'You turned on the automatic email task in Step 2.', timestamp: new Date(Date.now() - 3200000).toISOString() },
    { id: '6', text: 'You edited the Automatic Email in Step 2.', timestamp: new Date(Date.now() - 3100000).toISOString() },
  ];
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {mock.map((a, i) => (
          <div key={a.id} style={{ display: 'flex', gap: 12, paddingBottom: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#6366f1', marginTop: 4 }} />
              {i < mock.length - 1 && <div style={{ width: 2, flex: 1, backgroundColor: '#e2e8f0', marginTop: 4 }} />}
            </div>
            <div>
              <div style={{ fontSize: 13, color: '#374151' }}>{a.text}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
