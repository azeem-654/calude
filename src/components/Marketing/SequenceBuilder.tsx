import React, { useState, useEffect } from 'react';
import { Zap, Plus, Play, Pause, Trash2, Edit2, Check, X, Settings, ChevronDown, ChevronUp, Loader, Mail, Clock, ArrowRight } from 'lucide-react';
import type { EmailSequence, EmailStep } from '../../types/marketing';

/* ─── AI / Template helpers ─── */

async function callClaude(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message || `API error ${res.status}`);
  }
  const data = await res.json() as { content: { text: string }[] };
  return data.content[0].text;
}

function templateFallback(goal: string): EmailStep[] {
  const isTrial = /trial|free|convert|paid|upgrade|saas/i.test(goal);
  const isOnboard = /onboard|welcome|getting.?start|new.?user/i.test(goal);
  const isReengage = /re.?engag|inactive|win.?back|dormant|lapsed/i.test(goal);
  const isNurture = /nurtur|lead|prospect|interest/i.test(goal);

  if (isTrial) return [
    { id: 's1', day: 0, subject: 'You\'re in! Let\'s get you started, {{firstName}}', body: 'Hi {{firstName}},\n\nWelcome to your free trial! I\'m thrilled you\'re giving us a shot.\n\nHere\'s what you can do right now:\n• Set up your first project in under 5 minutes\n• Connect your team (invite up to 5 members free)\n• Explore our template library\n\nIf you have any questions, just reply to this email — I personally read every response.\n\nLet\'s make this trial count!\n\n[Your Name]', followUpRule: 'Proceed regardless' },
    { id: 's2', day: 2, subject: 'Quick win: the one feature our best customers use first', body: 'Hi {{firstName}},\n\nTwo days in — how\'s it going?\n\nI wanted to share a shortcut. Our highest-converting customers all do one thing in their first week: they connect their data source.\n\nOnce connected, you\'ll see results in minutes. Here\'s the 2-click setup →\n\n[LINK]\n\nAlready done it? Hit reply and tell me how it went. I\'d love to hear.\n\n[Your Name]', followUpRule: 'If no link click, send follow-up' },
    { id: 's3', day: 5, subject: '{{firstName}}, your trial is halfway done', body: 'Hi {{firstName}},\n\nYour trial is 50% over — and I want to make sure you\'ve seen the most valuable parts.\n\nHere\'s what {{company || "teams like yours"}} typically unlocks in week one:\n✓ Automated workflows (saves ~4 hrs/week)\n✓ Real-time analytics dashboard\n✓ One-click reporting\n\nIf you haven\'t explored these yet, today is the perfect day.\n\nWant a quick 15-min call to walk through your specific use case? Pick a time here: [CALENDAR LINK]\n\n[Your Name]', followUpRule: 'If no meeting booked, escalate' },
    { id: 's4', day: 9, subject: 'Your trial ends in 48 hours — here\'s your upgrade offer', body: 'Hi {{firstName}},\n\nJust 48 hours left on your trial.\n\nI\'d hate for you to lose access to everything you\'ve set up. That\'s why I\'m offering you something special:\n\n🎁 Use code TRIAL20 for 20% off your first 3 months when you upgrade today.\n\nThis offer expires when your trial does.\n\n[UPGRADE NOW →]\n\nHave questions? I\'m here. Just reply.\n\n[Your Name]', followUpRule: 'If no upgrade, send final email' },
    { id: 's5', day: 11, subject: 'Last chance, {{firstName}} — and an honest question', body: 'Hi {{firstName}},\n\nYour trial ends today.\n\nBefore you go, can I ask one honest question: what stopped you from upgrading?\n\nWas it price? Missing feature? Bad timing? Your answer will take 10 seconds and genuinely helps us improve.\n\nAnd if it\'s any of these, let me know — I might be able to help:\n• Price: I can offer an extended discount\n• Features: I\'ll add you to our roadmap waitlist\n• Timing: I can pause your account for 30 days\n\nJust reply with one word. I\'m listening.\n\n[Your Name]', followUpRule: 'End of sequence' },
  ];

  if (isOnboard) return [
    { id: 's1', day: 0, subject: 'Welcome to {{company}} — your account is ready', body: 'Hi {{firstName}},\n\nWelcome! Your account is live and ready to go.\n\nHere are your first 3 steps:\n1. Complete your profile (takes 2 minutes)\n2. Set up your workspace\n3. Invite your team\n\nWe\'ve put together a quick-start guide here: [LINK]\n\nReply with any questions — we typically respond within the hour.\n\n[Your Name]', followUpRule: 'Send next email after 3 days' },
    { id: 's2', day: 3, subject: 'How\'s the setup going, {{firstName}}?', body: 'Hi {{firstName}},\n\nChecking in! Have you had a chance to explore the platform yet?\n\nMost users find the most value in [KEY FEATURE]. Here\'s a 90-second video showing how it works: [VIDEO LINK]\n\nLet me know if you\'d like a walkthrough — happy to jump on a quick call.\n\n[Your Name]', followUpRule: 'Proceed after 4 days' },
    { id: 's3', day: 7, subject: 'One week in — tips from our power users', body: 'Hi {{firstName}},\n\nYou\'ve been using [PRODUCT] for a week — congrats!\n\nHere are 3 tips our most successful users swear by:\n\n💡 Tip 1: [POWER TIP 1]\n💡 Tip 2: [POWER TIP 2]  \n💡 Tip 3: [POWER TIP 3]\n\nBookmark this email — you\'ll thank yourself later.\n\n[Your Name]', followUpRule: 'End of sequence' },
  ];

  if (isReengage) return [
    { id: 's1', day: 0, subject: 'We miss you, {{firstName}} — here\'s what\'s new', body: 'Hi {{firstName}},\n\nIt\'s been a while! A lot has changed since you last logged in.\n\nHere\'s what\'s new:\n• [NEW FEATURE 1] — saves time on [TASK]\n• [NEW FEATURE 2] — customers love this one\n• [IMPROVEMENT] — we fixed the thing you probably noticed\n\nReady to pick up where you left off? Your account is right where you left it.\n\n[LOG IN →]\n\n[Your Name]', followUpRule: 'If no login, send after 5 days' },
    { id: 's2', day: 5, subject: 'A special offer to welcome you back', body: 'Hi {{firstName}},\n\nWe want you back — and we\'re willing to put our money where our mouth is.\n\nFor the next 72 hours, use code COMEBACK30 for 30% off.\n\nNo strings attached. If you\'re not happy in 30 days, full refund.\n\n[CLAIM OFFER →]\n\nHope to see you soon.\n\n[Your Name]', followUpRule: 'End of re-engagement sequence' },
  ];

  // Default nurture sequence
  return [
    { id: 's1', day: 0, subject: 'Thanks for your interest, {{firstName}}', body: 'Hi {{firstName}},\n\nThank you for reaching out! I\'m excited to learn more about what you\'re trying to accomplish.\n\nHere\'s a quick overview of how we help companies like {{company || "yours"}}:\n\n• [VALUE PROP 1]\n• [VALUE PROP 2]\n• [VALUE PROP 3]\n\nWould you be open to a 20-minute call this week? I\'d love to understand your goals and see if we\'re a good fit.\n\nBook a time here: [CALENDAR LINK]\n\n[Your Name]', followUpRule: 'If no booking, follow up in 3 days' },
    { id: 's2', day: 3, subject: 'Quick question, {{firstName}}', body: 'Hi {{firstName}},\n\nFollowing up on my last note.\n\nI know you\'re busy, so I\'ll keep this short: what\'s the biggest challenge you\'re currently facing with [RELEVANT AREA]?\n\nEven a one-sentence reply helps me understand how I can be most useful.\n\n[Your Name]', followUpRule: 'Proceed after response or 4 days' },
    { id: 's3', day: 7, subject: 'Case study: how {{industry || "a company like yours"}} achieved [RESULT]', body: 'Hi {{firstName}},\n\nI thought you\'d find this interesting.\n\n[CLIENT NAME], a company in [SIMILAR INDUSTRY], was struggling with [SAME PROBLEM]. Within 60 days of working with us, they achieved [SPECIFIC RESULT].\n\nHere\'s the full story: [CASE STUDY LINK]\n\nWould something like this be valuable for {{company || "your team"}}? Happy to map out a similar approach for you.\n\n[Your Name]', followUpRule: 'If no reply, send breakup email' },
    { id: 's4', day: 14, subject: 'Should I stay or should I go?', body: 'Hi {{firstName}},\n\nI\'ve reached out a few times and haven\'t heard back. No worries — I know inboxes get crazy.\n\nI\'ll stop reaching out after this, but I\'d be remiss not to ask one last time: is now just a bad time, or is [PRODUCT/SERVICE] not a fit?\n\nIf bad timing: I\'ll check back in 30 days. Just reply "later."\nIf not a fit: totally understood. Just reply "no thanks" and I\'ll close this out.\n\nNo hard feelings either way.\n\n[Your Name]', followUpRule: 'End of sequence' },
  ];
}

async function generateSequence(goal: string, apiKey: string): Promise<EmailStep[]> {
  if (!apiKey) return templateFallback(goal);

  const prompt = `You are a world-class email copywriter. Create a professional email nurture sequence for this goal:

"${goal}"

Return ONLY a valid JSON array (no markdown, no explanation) with this exact structure:
[
  {
    "day": 0,
    "subject": "email subject line",
    "body": "full professional email body with line breaks as \\n",
    "followUpRule": "brief follow-up instruction (one sentence)"
  }
]

Rules:
- 4-6 emails depending on complexity
- Day 0 = sent immediately; subsequent emails spaced 2-7 days apart
- Use {{firstName}} and {{company}} as personalization tokens
- Professional yet human tone; concise and compelling
- Each email escalates value: awareness → education → social proof → offer → urgency
- Final email is a "breakup" / low-pressure close
- Subjects: under 60 chars, no spam words`;

  try {
    const text = await callClaude(prompt, apiKey);
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON array in response');
    const parsed = JSON.parse(match[0]) as { day: number; subject: string; body: string; followUpRule: string }[];
    return parsed.map((s, idx) => ({
      id: `ai-${idx}-${Date.now()}`,
      day: Number(s.day) || idx * 3,
      subject: String(s.subject),
      body: String(s.body),
      followUpRule: String(s.followUpRule),
    }));
  } catch {
    return templateFallback(goal);
  }
}

/* ─── Sub-components ─── */

function ApiKeyModal({ onClose, onSave }: { onClose: () => void; onSave: (key: string) => void }) {
  const [key, setKey] = useState(localStorage.getItem('crm_anthropic_key') || '');
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>AI Settings</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '4px' }}><X size={20} color="#94a3b8" /></button>
        </div>
        <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px' }}>
          Enter your Anthropic API key to enable AI-generated email sequences. The key is stored in your browser only and never sent to our servers.
        </p>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Anthropic API Key</label>
          <input
            type="password" value={key} onChange={e => setKey(e.target.value)}
            placeholder="sk-ant-api03-..."
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ padding: '12px 14px', backgroundColor: '#fffbeb', borderRadius: '8px', marginBottom: '20px' }}>
          <p style={{ fontSize: '12px', color: '#92400e', margin: 0 }}>
            ⚠️ For personal/demo use only. In production, proxy API calls through your own backend. Get your key at console.anthropic.com
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', background: 'white' }}>Cancel</button>
          <button onClick={() => { onSave(key); onClose(); }}
            style={{ padding: '9px 18px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            {key ? 'Save Key' : 'Use Templates (No AI)'}
          </button>
        </div>
      </div>
    </div>
  );
}

function StepCard({ step, index, total, onUpdate, onDelete, onMoveUp, onMoveDown }: {
  step: EmailStep; index: number; total: number;
  onUpdate: (s: EmailStep) => void; onDelete: () => void;
  onMoveUp: () => void; onMoveDown: () => void;
}) {
  const [expanded, setExpanded] = useState(index === 0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(step);

  const save = () => { onUpdate(draft); setEditing(false); };

  return (
    <div style={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px', cursor: 'pointer' }} onClick={() => setExpanded(p => !p)}>
        <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Mail size={16} color="#6366f1" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 9px', borderRadius: '10px', backgroundColor: '#f1f5f9', color: '#64748b' }}>
              {step.day === 0 ? 'Day 0 · Immediately' : `Day ${step.day}`}
            </span>
          </div>
          <p style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', margin: '4px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{step.subject}</p>
        </div>
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button onClick={onMoveUp} disabled={index === 0} style={{ padding: '5px', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: 'white', cursor: index === 0 ? 'not-allowed' : 'pointer', opacity: index === 0 ? 0.4 : 1 }}><ChevronUp size={13} color="#64748b" /></button>
          <button onClick={onMoveDown} disabled={index === total - 1} style={{ padding: '5px', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: 'white', cursor: index === total - 1 ? 'not-allowed' : 'pointer', opacity: index === total - 1 ? 0.4 : 1 }}><ChevronDown size={13} color="#64748b" /></button>
          <button onClick={() => { setEditing(true); setExpanded(true); }} style={{ padding: '5px', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: 'white', cursor: 'pointer' }}><Edit2 size={13} color="#6366f1" /></button>
          <button onClick={onDelete} style={{ padding: '5px', border: '1px solid #fecaca', borderRadius: '6px', backgroundColor: 'white', cursor: 'pointer' }}><Trash2 size={13} color="#ef4444" /></button>
        </div>
        {expanded ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
      </div>

      {expanded && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid #f1f5f9' }}>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '14px' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#374151', marginBottom: '5px' }}>Subject Line</label>
                  <input value={draft.subject} onChange={e => setDraft(p => ({ ...p, subject: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ width: '100px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#374151', marginBottom: '5px' }}>Send on Day</label>
                  <input type="number" min="0" value={draft.day} onChange={e => setDraft(p => ({ ...p, day: parseInt(e.target.value) || 0 }))}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#374151', marginBottom: '5px' }}>Email Body</label>
                <textarea value={draft.body} onChange={e => setDraft(p => ({ ...p, body: e.target.value }))} rows={10}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', resize: 'vertical', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', lineHeight: 1.6, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#374151', marginBottom: '5px' }}>Follow-up Rule</label>
                <input value={draft.followUpRule} onChange={e => setDraft(p => ({ ...p, followUpRule: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => { setDraft(step); setEditing(false); }} style={{ padding: '7px 14px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '13px', cursor: 'pointer', background: 'white' }}>Cancel</button>
                <button onClick={save} style={{ padding: '7px 14px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Check size={13} /> Save
                </button>
              </div>
            </div>
          ) : (
            <div style={{ paddingTop: '14px' }}>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '13px', color: '#374151', lineHeight: 1.7, backgroundColor: '#f8fafc', padding: '14px 16px', borderRadius: '8px', marginBottom: '10px' }}>
                {step.body}
              </div>
              {step.followUpRule && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <ArrowRight size={13} color="#6366f1" />
                  <span style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>{step.followUpRule}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main component ─── */

interface Props {
  sequences: EmailSequence[];
  onAddSequence: (s: Omit<EmailSequence, 'id'>) => void;
  onUpdateSequence: (id: string, updates: Partial<EmailSequence>) => void;
  onDeleteSequence: (id: string) => void;
  onActivateSequence: (seq: EmailSequence) => void;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function SequenceBuilder({ sequences, onAddSequence, onUpdateSequence, onDeleteSequence, onActivateSequence, onNotify }: Props) {
  const [selected, setSelected] = useState<EmailSequence | null>(null);
  const [showApiModal, setShowApiModal] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('crm_anthropic_key') || '');
  const [goal, setGoal] = useState('');
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (sequences.length > 0 && !selected) setSelected(sequences[0]);
  }, [sequences, selected]);

  const handleSaveKey = (key: string) => {
    localStorage.setItem('crm_anthropic_key', key);
    setApiKey(key);
  };

  const handleGenerate = async () => {
    if (!goal.trim()) { onNotify('Please describe your sequence goal', 'error'); return; }
    setGenerating(true);
    try {
      const steps = await generateSequence(goal.trim(), apiKey);
      const name = newName.trim() || `Sequence: ${goal.slice(0, 40)}`;
      const seq: Omit<EmailSequence, 'id'> = {
        name, goal: goal.trim(), steps,
        status: 'draft', createdAt: new Date().toISOString().split('T')[0], enrolledCount: 0,
      };
      onAddSequence(seq);
      setGoal(''); setNewName(''); setCreating(false);
      onNotify(`${apiKey ? 'AI-generated' : 'Template'} sequence "${name}" created!`);
    } catch (e) {
      onNotify(`Generation failed: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const updateStep = (seqId: string, stepId: string, updated: EmailStep) => {
    const seq = sequences.find(s => s.id === seqId);
    if (!seq) return;
    const steps = seq.steps.map(s => s.id === stepId ? updated : s);
    onUpdateSequence(seqId, { steps });
    setSelected(prev => prev?.id === seqId ? { ...prev, steps } : prev);
  };

  const deleteStep = (seqId: string, stepId: string) => {
    const seq = sequences.find(s => s.id === seqId);
    if (!seq) return;
    const steps = seq.steps.filter(s => s.id !== stepId);
    onUpdateSequence(seqId, { steps });
    setSelected(prev => prev?.id === seqId ? { ...prev, steps } : prev);
  };

  const moveStep = (seqId: string, idx: number, dir: -1 | 1) => {
    const seq = sequences.find(s => s.id === seqId);
    if (!seq) return;
    const steps = [...seq.steps];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= steps.length) return;
    [steps[idx], steps[newIdx]] = [steps[newIdx], steps[idx]];
    onUpdateSequence(seqId, { steps });
    setSelected(prev => prev?.id === seqId ? { ...prev, steps } : prev);
  };

  const addBlankStep = (seqId: string) => {
    const seq = sequences.find(s => s.id === seqId);
    if (!seq) return;
    const maxDay = seq.steps.reduce((m, s) => Math.max(m, s.day), 0);
    const newStep: EmailStep = {
      id: `step-${Date.now()}`, day: maxDay + 3,
      subject: 'New Email', body: 'Hi {{firstName}},\n\n[Write your email here]\n\n[Your Name]', followUpRule: '',
    };
    const steps = [...seq.steps, newStep];
    onUpdateSequence(seqId, { steps });
    setSelected(prev => prev?.id === seqId ? { ...prev, steps } : prev);
  };

  const statusColors: Record<string, { bg: string; color: string }> = {
    draft: { bg: '#f8fafc', color: '#64748b' },
    active: { bg: '#ecfdf5', color: '#16a34a' },
    paused: { bg: '#fffbeb', color: '#d97706' },
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', overflow: 'hidden' }}>
      {/* Left sidebar */}
      <div style={{ width: '300px', flexShrink: 0, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '8px' }}>
          <button onClick={() => setCreating(true)}
            style={{ flex: 1, padding: '9px 14px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <Plus size={15} /> New Sequence
          </button>
          <button onClick={() => setShowApiModal(true)}
            style={{ padding: '9px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: apiKey ? '#f0fdf4' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title={apiKey ? 'AI enabled' : 'Configure AI'}>
            <Settings size={16} color={apiKey ? '#16a34a' : '#64748b'} />
          </button>
        </div>
        {apiKey && (
          <div style={{ padding: '8px 12px', backgroundColor: '#ecfdf5', borderBottom: '1px solid #d1fae5', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Zap size={13} color="#16a34a" />
            <span style={{ fontSize: '11px', color: '#15803d', fontWeight: 500 }}>AI generation enabled</span>
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {sequences.length === 0 && !creating && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8' }}>
              <Zap size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
              <p style={{ fontSize: '13px', margin: 0 }}>No sequences yet.<br />Create your first one!</p>
            </div>
          )}
          {sequences.map(seq => {
            const sc = statusColors[seq.status];
            const isActive = selected?.id === seq.id;
            return (
              <div key={seq.id} onClick={() => setSelected(seq)}
                style={{ padding: '12px', borderRadius: '10px', cursor: 'pointer', marginBottom: '4px', backgroundColor: isActive ? '#f5f3ff' : 'white', border: `1px solid ${isActive ? '#c4b5fd' : 'transparent'}`, transition: 'all 0.15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', margin: 0, flex: 1, paddingRight: '8px' }}>{seq.name}</p>
                  <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', backgroundColor: sc.bg, color: sc.color, fontWeight: 600, flexShrink: 0 }}>
                    {seq.status}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{seq.steps.length} emails</span>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{seq.enrolledCount} enrolled</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* Create new sequence panel */}
        {creating && (
          <div style={{ padding: '24px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fafafa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Create New Sequence</h3>
              <button onClick={() => setCreating(false)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={18} color="#94a3b8" /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Sequence Name (optional)</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Trial User Conversion Sequence"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                  Describe your goal {apiKey ? <span style={{ color: '#16a34a', fontSize: '11px' }}>· AI will generate the sequence</span> : <span style={{ color: '#94a3b8', fontSize: '11px' }}>· Smart templates will be used</span>}
                </label>
                <textarea value={goal} onChange={e => setGoal(e.target.value)} rows={3}
                  placeholder="e.g. Create a 5-email sequence for new SaaS trial users to convert them to paid customers within 14 days"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5 }} />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button onClick={() => setCreating(false)} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', background: 'white' }}>Cancel</button>
                <button onClick={handleGenerate} disabled={generating}
                  style={{ padding: '9px 20px', backgroundColor: generating ? '#c4b5fd' : '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {generating ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</> : <><Zap size={14} /> {apiKey ? 'Generate with AI' : 'Generate Sequence'}</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sequence editor */}
        {selected ? (
          <div style={{ padding: '24px', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>{selected.name}</h2>
                <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                  <Clock size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                  {selected.steps.length} emails · spans {selected.steps[selected.steps.length - 1]?.day || 0} days
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => onDeleteSequence(selected.id)}
                  style={{ padding: '8px 14px', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', backgroundColor: 'white', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Trash2 size={14} /> Delete
                </button>
                {selected.status !== 'active' ? (
                  <button onClick={() => { onActivateSequence(selected); onUpdateSequence(selected.id, { status: 'active' }); setSelected(p => p ? { ...p, status: 'active' } : p); }}
                    style={{ padding: '8px 18px', backgroundColor: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Play size={14} /> Activate Sequence
                  </button>
                ) : (
                  <button onClick={() => { onUpdateSequence(selected.id, { status: 'paused' }); setSelected(p => p ? { ...p, status: 'paused' } : p); }}
                    style={{ padding: '8px 18px', backgroundColor: '#f59e0b', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Pause size={14} /> Pause
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {selected.steps.map((step, idx) => (
                <div key={step.id}>
                  <StepCard
                    step={step} index={idx} total={selected.steps.length}
                    onUpdate={updated => updateStep(selected.id, step.id, updated)}
                    onDelete={() => deleteStep(selected.id, step.id)}
                    onMoveUp={() => moveStep(selected.id, idx, -1)}
                    onMoveDown={() => moveStep(selected.id, idx, 1)}
                  />
                  {idx < selected.steps.length - 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', padding: '6px 0 6px 24px', gap: '8px' }}>
                      <div style={{ width: '2px', height: '24px', backgroundColor: '#e2e8f0', marginLeft: '17px' }} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button onClick={() => addBlankStep(selected.id)}
              style={{ marginTop: '16px', width: '100%', padding: '11px', border: '2px dashed #e2e8f0', borderRadius: '10px', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '13px', color: '#6366f1', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
              <Plus size={15} /> Add Email Step
            </button>
          </div>
        ) : !creating && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', padding: '48px' }}>
            <Zap size={48} style={{ marginBottom: '16px', opacity: 0.3 }} />
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#64748b', margin: '0 0 8px' }}>AI Email Sequence Builder</h3>
            <p style={{ fontSize: '14px', textAlign: 'center', maxWidth: '360px', lineHeight: 1.6, margin: 0 }}>
              Create professional email sequences in seconds. Describe your goal and {apiKey ? 'Claude AI' : 'smart templates'} will generate compelling copy ready to send.
            </p>
            <button onClick={() => setCreating(true)}
              style={{ marginTop: '24px', padding: '11px 24px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={16} /> Create First Sequence
            </button>
          </div>
        )}
      </div>

      {showApiModal && <ApiKeyModal onClose={() => setShowApiModal(false)} onSave={handleSaveKey} />}
    </div>
  );
}
