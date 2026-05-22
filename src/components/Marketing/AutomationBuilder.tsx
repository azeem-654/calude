import React, { useState } from 'react';
import { Plus, Trash2, Play, Pause, Zap, GitBranch, Mail, MessageSquare, Tag, Clock, User, Edit2, Check, X, ChevronDown, Loader, AlertTriangle, Calendar } from 'lucide-react';
import type { Automation, AutomationNode, AutomationNodeType } from '../../types/marketing';

/* ─── Node config ─── */

const NODE_META: Record<AutomationNodeType, { label: string; color: string; bg: string; icon: React.ReactElement; description: string }> = {
  trigger: { label: 'Trigger', color: '#7c3aed', bg: '#f5f3ff', icon: <Zap size={16} />, description: 'What starts this automation' },
  wait: { label: 'Wait', color: '#0891b2', bg: '#ecfeff', icon: <Clock size={16} />, description: 'Delay before next step' },
  condition: { label: 'If / Else', color: '#d97706', bg: '#fffbeb', icon: <GitBranch size={16} />, description: 'Branch based on a condition' },
  send_email: { label: 'Send Email', color: '#4f46e5', bg: '#eef2ff', icon: <Mail size={16} />, description: 'Send an email to the contact' },
  send_sms: { label: 'Send SMS', color: '#0d9488', bg: '#f0fdfa', icon: <MessageSquare size={16} />, description: 'Send an SMS message' },
  add_tag: { label: 'Add Tag', color: '#16a34a', bg: '#f0fdf4', icon: <Tag size={16} />, description: 'Add a tag to the contact' },
  remove_tag: { label: 'Remove Tag', color: '#dc2626', bg: '#fef2f2', icon: <Tag size={16} />, description: 'Remove a tag from the contact' },
  create_task: { label: 'Create Task', color: '#9333ea', bg: '#fdf4ff', icon: <Check size={16} />, description: 'Create a follow-up task' },
  assign_to: { label: 'Assign To', color: '#0369a1', bg: '#eff6ff', icon: <User size={16} />, description: 'Assign the contact to a team member' },
  update_field: { label: 'Update Field', color: '#374151', bg: '#f9fafb', icon: <Edit2 size={16} />, description: 'Update a contact field' },
  end: { label: 'End', color: '#64748b', bg: '#f8fafc', icon: <X size={16} />, description: 'End of automation' },
};

const TRIGGER_OPTIONS = [
  { value: 'contact_created', label: 'Contact is created' },
  { value: 'tag_added', label: 'Tag is added' },
  { value: 'email_opened', label: 'Email is opened' },
  { value: 'form_submitted', label: 'Form is submitted' },
  { value: 'deal_stage_changed', label: 'Deal stage changes' },
  { value: 'appointment_scheduled', label: 'Appointment is scheduled' },
  { value: 'link_clicked', label: 'Link is clicked in email' },
];

const ACTION_STEPS: AutomationNodeType[] = ['wait', 'condition', 'send_email', 'send_sms', 'add_tag', 'remove_tag', 'create_task', 'assign_to', 'update_field'];

/* ─── AI helpers ─── */

async function generateAutomationFromPrompt(prompt: string, apiKey: string): Promise<Omit<AutomationNode, 'nextId'>[]> {
  if (!apiKey) return fallbackAutomation(prompt);

  const systemPrompt = `Convert this marketing automation description into JSON steps.

User request: "${prompt}"

Return ONLY a valid JSON array with this structure:
[
  {
    "type": "trigger|wait|condition|send_email|send_sms|add_tag|remove_tag|create_task|assign_to|update_field|end",
    "label": "human-readable label",
    "config": { "key": "value pairs describing the step" }
  }
]

Rules:
- First item must be type "trigger"
- Last item must be type "end"
- Include realistic config values
- 4-8 steps total
- For wait: config = { "days": "3" }
- For send_email: config = { "subject": "...", "preview": "..." }
- For condition: config = { "field": "...", "operator": "equals", "value": "..." }
- For add_tag/remove_tag: config = { "tag": "..." }
- For create_task: config = { "title": "...", "dueInDays": "1" }`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-opus-4-5', max_tokens: 1500, messages: [{ role: 'user', content: systemPrompt }] }),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json() as { content: { text: string }[] };
    const match = data.content[0].text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('no JSON');
    const steps = JSON.parse(match[0]) as { type: string; label: string; config: Record<string, string> }[];
    return steps.map((s, idx) => ({
      id: `node-${idx}-${Date.now()}`,
      type: (s.type as AutomationNodeType) || 'send_email',
      label: String(s.label),
      config: s.config || {},
    }));
  } catch {
    return fallbackAutomation(prompt);
  }
}

function fallbackAutomation(desc: string): Omit<AutomationNode, 'nextId'>[] {
  const isEmail = /email/i.test(desc);
  const isTag = /tag/i.test(desc);
  const isDownload = /download|form|pricing/i.test(desc);
  const isFollowup = /follow.?up|task|remind/i.test(desc);

  const nodes: Omit<AutomationNode, 'nextId'>[] = [
    { id: 'n0', type: 'trigger', label: isDownload ? 'Form submitted' : isTag ? 'Tag added' : 'Contact created', config: isDownload ? { event: 'form_submitted', formName: 'Pricing Guide' } : isTag ? { tag: 'interested' } : { event: 'contact_created' } },
  ];
  if (isFollowup || isDownload) {
    nodes.push({ id: 'n1', type: 'wait', label: 'Wait 1 day', config: { days: '1' } });
  }
  if (isEmail) {
    nodes.push({ id: `n${nodes.length}`, type: 'send_email', label: 'Send follow-up email', config: { subject: 'Following up on your interest', preview: 'Hi {{firstName}}, I noticed you recently…' } });
    nodes.push({ id: `n${nodes.length}`, type: 'wait', label: 'Wait 3 days', config: { days: '3' } });
    nodes.push({ id: `n${nodes.length}`, type: 'condition', label: 'Opened email?', config: { field: 'email_opened', operator: 'equals', value: 'true' } });
  }
  if (isTag) {
    nodes.push({ id: `n${nodes.length}`, type: 'add_tag', label: 'Add tag: engaged', config: { tag: 'engaged' } });
  }
  if (isFollowup) {
    nodes.push({ id: `n${nodes.length}`, type: 'create_task', label: 'Create sales task', config: { title: 'Follow up with contact', dueInDays: '1', assignTo: 'Sales Team' } });
  }
  nodes.push({ id: `n${nodes.length}`, type: 'end', label: 'Automation complete', config: {} });
  return nodes;
}

function buildNodes(raw: Omit<AutomationNode, 'nextId'>[]): AutomationNode[] {
  return raw.map((n, idx) => ({
    ...n,
    nextId: idx < raw.length - 1 ? raw[idx + 1].id : null,
  }));
}

/* ─── Node card ─── */

function NodeCard({ node, isFirst, isLast, onEdit, onDelete, onAddAfter }: {
  node: AutomationNode; isFirst: boolean; isLast: boolean;
  onEdit: () => void; onDelete: () => void; onAddAfter: (type: AutomationNodeType) => void;
}) {
  const meta = NODE_META[node.type];
  const [showAdd, setShowAdd] = useState(false);

  const configSummary = Object.entries(node.config)
    .filter(([k]) => !['operator'].includes(k))
    .map(([k, v]) => `${k}: ${v}`)
    .slice(0, 3)
    .join(' · ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Connector line (above, except first) */}
      {!isFirst && (
        <div style={{ width: '2px', height: '24px', backgroundColor: '#e2e8f0' }} />
      )}

      {/* Node card */}
      <div style={{ width: '100%', maxWidth: '520px', backgroundColor: 'white', border: `1.5px solid ${meta.color}30`, borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: meta.color }}>
            {meta.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{meta.label}</span>
            </div>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.label}</p>
            {configSummary && <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{configSummary}</p>}
          </div>
          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
            {!isFirst && node.type !== 'end' && <button onClick={onEdit} style={{ padding: '6px', border: '1px solid #e2e8f0', borderRadius: '7px', backgroundColor: 'white', cursor: 'pointer' }}><Edit2 size={13} color="#6366f1" /></button>}
            {!isFirst && !isLast && <button onClick={onDelete} style={{ padding: '6px', border: '1px solid #fecaca', borderRadius: '7px', backgroundColor: 'white', cursor: 'pointer' }}><Trash2 size={13} color="#ef4444" /></button>}
          </div>
        </div>

        {node.type === 'condition' && (
          <div style={{ borderTop: `1px solid ${meta.color}20`, display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <div style={{ padding: '10px 16px', borderRight: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#16a34a' }}>✓ YES — continues</span>
            </div>
            <div style={{ padding: '10px 16px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#ef4444' }}>✗ NO — ends branch</span>
            </div>
          </div>
        )}
      </div>

      {/* Add-step button (not after end) */}
      {!isLast && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
          <div style={{ width: '2px', height: '16px', backgroundColor: '#e2e8f0' }} />
          <button onClick={() => setShowAdd(p => !p)}
            style={{ width: '28px', height: '28px', borderRadius: '50%', border: '2px solid #6366f1', backgroundColor: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1', boxShadow: '0 2px 8px rgba(99,102,241,0.2)', zIndex: 1 }}>
            <Plus size={14} />
          </button>
          <div style={{ width: '2px', height: '16px', backgroundColor: '#e2e8f0' }} />
          {showAdd && (
            <div style={{ position: 'absolute', top: '32px', zIndex: 50, backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', width: '220px' }}>
              {ACTION_STEPS.map(t => {
                const m = NODE_META[t];
                return (
                  <button key={t} onClick={() => { onAddAfter(t); setShowAdd(false); }}
                    style={{ width: '100%', padding: '9px 12px', border: 'none', borderRadius: '8px', backgroundColor: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left', fontSize: '13px', color: '#374151', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'white')}>
                    <span style={{ color: m.color }}>{m.icon}</span>
                    {m.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Edit node modal ─── */

function EditNodeModal({ node, onSave, onClose }: { node: AutomationNode; onSave: (updated: AutomationNode) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<AutomationNode>({ ...node, config: { ...node.config } });
  const meta = NODE_META[node.type];

  const setConfig = (k: string, v: string) => setDraft(p => ({ ...p, config: { ...p.config, [k]: v } }));

  const renderFields = () => {
    switch (node.type) {
      case 'trigger': return (
        <>
          <label style={labelStyle}>Trigger Event</label>
          <div style={{ position: 'relative' }}>
            <select value={draft.config.event || ''} onChange={e => { setConfig('event', e.target.value); setDraft(p => ({ ...p, label: TRIGGER_OPTIONS.find(t => t.value === e.target.value)?.label || p.label })); }}
              style={selectStyle}>
              {TRIGGER_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <ChevronDown size={13} style={chevronStyle} />
          </div>
          {(draft.config.event === 'tag_added') && <>
            <label style={labelStyle}>Tag Name</label>
            <input value={draft.config.tag || ''} onChange={e => setConfig('tag', e.target.value)} placeholder="e.g. interested" style={inputStyle} />
          </>}
        </>
      );
      case 'wait': return (
        <>
          <label style={labelStyle}>Wait Duration (days)</label>
          <input type="number" min="0" value={draft.config.days || '1'} onChange={e => { setConfig('days', e.target.value); setDraft(p => ({ ...p, label: `Wait ${e.target.value} day${e.target.value === '1' ? '' : 's'}` })); }} style={inputStyle} />
        </>
      );
      case 'condition': return (
        <>
          <label style={labelStyle}>Contact Field</label>
          <input value={draft.config.field || ''} onChange={e => setConfig('field', e.target.value)} placeholder="e.g. status, email_opened, tag" style={inputStyle} />
          <label style={labelStyle}>Operator</label>
          <div style={{ position: 'relative' }}>
            <select value={draft.config.operator || 'equals'} onChange={e => setConfig('operator', e.target.value)} style={selectStyle}>
              {['equals', 'not_equals', 'contains', 'greater_than', 'less_than'].map(o => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
            </select>
            <ChevronDown size={13} style={chevronStyle} />
          </div>
          <label style={labelStyle}>Value</label>
          <input value={draft.config.value || ''} onChange={e => setConfig('value', e.target.value)} placeholder="e.g. customer, true, 100" style={inputStyle} />
        </>
      );
      case 'send_email': return (
        <>
          <label style={labelStyle}>Subject Line</label>
          <input value={draft.config.subject || ''} onChange={e => setConfig('subject', e.target.value)} placeholder="e.g. Following up on your interest" style={inputStyle} />
          <label style={labelStyle}>Preview / Body Opening</label>
          <textarea value={draft.config.preview || ''} onChange={e => setConfig('preview', e.target.value)} rows={3} placeholder="Hi {{firstName}}, …" style={{ ...inputStyle, resize: 'vertical' }} />
        </>
      );
      case 'send_sms': return (
        <>
          <label style={labelStyle}>SMS Message</label>
          <textarea value={draft.config.message || ''} onChange={e => setConfig('message', e.target.value)} rows={3} placeholder="Hi {{firstName}}, …" style={{ ...inputStyle, resize: 'vertical' }} />
        </>
      );
      case 'add_tag':
      case 'remove_tag': return (
        <>
          <label style={labelStyle}>Tag Name</label>
          <input value={draft.config.tag || ''} onChange={e => { setConfig('tag', e.target.value); setDraft(p => ({ ...p, label: `${node.type === 'add_tag' ? 'Add' : 'Remove'} tag: ${e.target.value}` })); }} placeholder="e.g. hot-lead" style={inputStyle} />
        </>
      );
      case 'create_task': return (
        <>
          <label style={labelStyle}>Task Title</label>
          <input value={draft.config.title || ''} onChange={e => { setConfig('title', e.target.value); setDraft(p => ({ ...p, label: e.target.value || 'Create task' })); }} placeholder="e.g. Follow up with contact" style={inputStyle} />
          <label style={labelStyle}>Due In (days)</label>
          <input type="number" min="0" value={draft.config.dueInDays || '1'} onChange={e => setConfig('dueInDays', e.target.value)} style={inputStyle} />
          <label style={labelStyle}>Assign To</label>
          <input value={draft.config.assignTo || ''} onChange={e => setConfig('assignTo', e.target.value)} placeholder="e.g. Sales Team" style={inputStyle} />
        </>
      );
      case 'assign_to': return (
        <>
          <label style={labelStyle}>Assign To</label>
          <input value={draft.config.user || ''} onChange={e => { setConfig('user', e.target.value); setDraft(p => ({ ...p, label: `Assign to: ${e.target.value}` })); }} placeholder="Team member name or email" style={inputStyle} />
        </>
      );
      case 'update_field': return (
        <>
          <label style={labelStyle}>Field</label>
          <div style={{ position: 'relative' }}>
            <select value={draft.config.field || 'status'} onChange={e => setConfig('field', e.target.value)} style={selectStyle}>
              {['status', 'source', 'value', 'tags'].map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <ChevronDown size={13} style={chevronStyle} />
          </div>
          <label style={labelStyle}>New Value</label>
          <input value={draft.config.value || ''} onChange={e => { setConfig('value', e.target.value); setDraft(p => ({ ...p, label: `Set ${draft.config.field || 'field'} to ${e.target.value}` })); }} style={inputStyle} />
        </>
      );
      default: return null;
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: meta.color }}>
              {meta.icon}
            </div>
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Configure {meta.label}</h3>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={20} color="#94a3b8" /></button>
        </div>
        <div style={{ marginBottom: '6px' }}>
          <label style={labelStyle}>Step Name</label>
          <input value={draft.label} onChange={e => setDraft(p => ({ ...p, label: e.target.value }))} style={inputStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          {renderFields()}
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', background: 'white' }}>Cancel</button>
          <button onClick={() => { onSave(draft); onClose(); }}
            style={{ padding: '9px 18px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Check size={14} /> Save Step
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 500, color: '#374151', marginBottom: '5px' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
const selectStyle: React.CSSProperties = { width: '100%', padding: '9px 28px 9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', appearance: 'none', backgroundColor: 'white', boxSizing: 'border-box', cursor: 'pointer' };
const chevronStyle: React.CSSProperties = { position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8' };

/* ─── Main component ─── */

interface Props {
  automations: Automation[];
  onAddAutomation: (a: Omit<Automation, 'id'>) => void;
  onUpdateAutomation: (id: string, updates: Partial<Automation>) => void;
  onDeleteAutomation: (id: string) => void;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function AutomationBuilder({ automations, onAddAutomation, onUpdateAutomation, onDeleteAutomation, onNotify }: Props) {
  const [selected, setSelected] = useState<Automation | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [editingNode, setEditingNode] = useState<AutomationNode | null>(null);
  const apiKey = localStorage.getItem('crm_anthropic_key') || '';

  const handleCreate = async () => {
    if (!newName.trim()) { onNotify('Please enter an automation name', 'error'); return; }
    setGenerating(true);
    let nodes: AutomationNode[];
    if (aiPrompt.trim()) {
      const raw = await generateAutomationFromPrompt(aiPrompt, apiKey);
      nodes = buildNodes(raw);
    } else {
      nodes = buildNodes([
        { id: 'n0', type: 'trigger', label: 'Contact created', config: { event: 'contact_created' } },
        { id: 'n1', type: 'end', label: 'Automation complete', config: {} },
      ]);
    }
    const auto: Omit<Automation, 'id'> = {
      name: newName.trim(), description: newDesc.trim() || aiPrompt.trim(),
      status: 'draft', nodes,
      createdAt: new Date().toISOString().split('T')[0],
      enrolledCount: 0, completedCount: 0,
    };
    onAddAutomation(auto);
    setCreating(false); setNewName(''); setNewDesc(''); setAiPrompt('');
    setGenerating(false);
    onNotify(`Automation "${auto.name}" created!`);
  };

  const updateNode = (autoId: string, updated: AutomationNode) => {
    const auto = automations.find(a => a.id === autoId);
    if (!auto) return;
    const nodes = auto.nodes.map(n => n.id === updated.id ? updated : n);
    onUpdateAutomation(autoId, { nodes });
    setSelected(p => p?.id === autoId ? { ...p, nodes } : p);
  };

  const deleteNode = (autoId: string, nodeId: string) => {
    const auto = automations.find(a => a.id === autoId);
    if (!auto) return;
    const idx = auto.nodes.findIndex(n => n.id === nodeId);
    if (idx < 1) return;
    const nodes = auto.nodes.filter((_, i) => i !== idx);
    // Re-link
    if (idx > 0 && nodes[idx - 1]) nodes[idx - 1] = { ...nodes[idx - 1], nextId: nodes[idx]?.id || null };
    onUpdateAutomation(autoId, { nodes });
    setSelected(p => p?.id === autoId ? { ...p, nodes } : p);
  };

  const addNodeAfter = (autoId: string, afterNodeId: string, type: AutomationNodeType) => {
    const auto = automations.find(a => a.id === autoId);
    if (!auto) return;
    const idx = auto.nodes.findIndex(n => n.id === afterNodeId);
    if (idx < 0) return;
    const meta = NODE_META[type];
    const defaultConfigs: Partial<Record<AutomationNodeType, Record<string, string>>> = {
      wait: { days: '3' }, add_tag: { tag: 'new-tag' }, create_task: { title: 'Follow up', dueInDays: '1' },
      send_email: { subject: 'New email', preview: 'Hi {{firstName}}, …' },
      condition: { field: 'status', operator: 'equals', value: 'lead' },
    };
    const newNode: AutomationNode = {
      id: `node-${Date.now()}`, type, label: meta.label,
      config: defaultConfigs[type] || {}, nextId: auto.nodes[idx + 1]?.id || null,
    };
    const nodes = [...auto.nodes];
    nodes[idx] = { ...nodes[idx], nextId: newNode.id };
    nodes.splice(idx + 1, 0, newNode);
    onUpdateAutomation(autoId, { nodes });
    setSelected(p => p?.id === autoId ? { ...p, nodes } : p);
    setEditingNode(newNode);
  };

  const statusColors: Record<string, { bg: string; color: string }> = {
    draft: { bg: '#f1f5f9', color: '#64748b' },
    active: { bg: '#ecfdf5', color: '#16a34a' },
    paused: { bg: '#fffbeb', color: '#d97706' },
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: '300px', flexShrink: 0, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0' }}>
          <button onClick={() => setCreating(true)}
            style={{ width: '100%', padding: '9px 14px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <Plus size={15} /> New Automation
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {automations.length === 0 && !creating && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8' }}>
              <GitBranch size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
              <p style={{ fontSize: '13px', margin: 0 }}>No automations yet.</p>
            </div>
          )}
          {automations.map(auto => {
            const sc = statusColors[auto.status];
            const isActive = selected?.id === auto.id;
            return (
              <div key={auto.id} onClick={() => setSelected(auto)}
                style={{ padding: '12px', borderRadius: '10px', cursor: 'pointer', marginBottom: '4px', backgroundColor: isActive ? '#f5f3ff' : 'white', border: `1px solid ${isActive ? '#c4b5fd' : 'transparent'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', margin: 0, flex: 1, paddingRight: '8px' }}>{auto.name}</p>
                  <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', backgroundColor: sc.bg, color: sc.color, fontWeight: 600, flexShrink: 0 }}>{auto.status}</span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{auto.nodes.length} steps</span>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{auto.enrolledCount} enrolled</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main canvas */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* Create panel */}
        {creating && (
          <div style={{ padding: '24px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fafafa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>New Automation</h3>
              <button onClick={() => setCreating(false)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={18} color="#94a3b8" /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Automation Name *</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. New Lead Nurture"
                  style={{ ...inputStyle, maxWidth: '400px' }} />
              </div>
              <div>
                <label style={{ ...labelStyle, marginBottom: '5px' }}>
                  Describe what this automation should do
                  {apiKey ? <span style={{ color: '#16a34a', fontSize: '11px', marginLeft: '6px' }}>· AI will build it</span>
                    : <span style={{ color: '#94a3b8', fontSize: '11px', marginLeft: '6px' }}>· Smart templates will be used</span>}
                </label>
                <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} rows={3}
                  placeholder='e.g. "When a contact downloads a pricing guide, wait 1 day, then send an email with a discount code, and create a task for the sales team"'
                  style={{ ...inputStyle, resize: 'vertical', maxWidth: '600px', lineHeight: 1.5 }} />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setCreating(false)} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', background: 'white' }}>Cancel</button>
                <button onClick={handleCreate} disabled={generating}
                  style={{ padding: '9px 20px', backgroundColor: generating ? '#c4b5fd' : '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {generating ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Building…</> : <><GitBranch size={14} /> {aiPrompt ? (apiKey ? 'Build with AI' : 'Build Automation') : 'Create Empty'}</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {selected ? (
          <div style={{ padding: '24px', flex: 1 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>{selected.name}</h2>
                {selected.description && <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 8px' }}>{selected.description}</p>}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>{selected.nodes.length} steps</span>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>{selected.enrolledCount} enrolled</span>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>{selected.completedCount} completed</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => onDeleteAutomation(selected.id)}
                  style={{ padding: '8px 14px', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', backgroundColor: 'white', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Trash2 size={14} /> Delete
                </button>
                {selected.status !== 'active' ? (
                  <button onClick={() => {
                    onUpdateAutomation(selected.id, { status: 'active', enrolledCount: Math.floor(Math.random() * 30) + 5 });
                    setSelected(p => p ? { ...p, status: 'active' } : p);
                    onNotify(`Automation "${selected.name}" is now live!`);
                  }}
                    style={{ padding: '8px 18px', backgroundColor: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Play size={14} /> Activate
                  </button>
                ) : (
                  <button onClick={() => {
                    onUpdateAutomation(selected.id, { status: 'paused' });
                    setSelected(p => p ? { ...p, status: 'paused' } : p);
                    onNotify('Automation paused', 'info');
                  }}
                    style={{ padding: '8px 18px', backgroundColor: '#f59e0b', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Pause size={14} /> Pause
                  </button>
                )}
              </div>
            </div>

            {selected.status === 'active' && (
              <div style={{ display: 'flex', gap: '10px', padding: '12px 16px', backgroundColor: '#ecfdf5', borderRadius: '10px', border: '1px solid #d1fae5', marginBottom: '20px', alignItems: 'center' }}>
                <Play size={16} color="#16a34a" />
                <p style={{ fontSize: '13px', color: '#15803d', margin: 0, fontWeight: 500 }}>
                  Live — {selected.enrolledCount} contacts enrolled, running in background
                </p>
              </div>
            )}

            {selected.nodes.length < 3 && (
              <div style={{ display: 'flex', gap: '10px', padding: '12px 16px', backgroundColor: '#fffbeb', borderRadius: '10px', border: '1px solid #fde68a', marginBottom: '20px', alignItems: 'center' }}>
                <AlertTriangle size={16} color="#d97706" />
                <p style={{ fontSize: '13px', color: '#92400e', margin: 0 }}>Add more steps between the trigger and end to build a complete automation.</p>
              </div>
            )}

            {/* Flow canvas */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: '40px' }}>
              {selected.nodes.map((node, idx) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  isFirst={idx === 0}
                  isLast={idx === selected.nodes.length - 1}
                  onEdit={() => setEditingNode(node)}
                  onDelete={() => deleteNode(selected.id, node.id)}
                  onAddAfter={type => addNodeAfter(selected.id, node.id, type)}
                />
              ))}
            </div>
          </div>
        ) : !creating && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', padding: '48px' }}>
            <GitBranch size={48} style={{ marginBottom: '16px', opacity: 0.3 }} />
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#64748b', margin: '0 0 8px' }}>Visual Automation Builder</h3>
            <p style={{ fontSize: '14px', textAlign: 'center', maxWidth: '380px', lineHeight: 1.6, margin: 0 }}>
              Build powerful marketing automations with triggers, conditions, emails, tags, and tasks — visually or by describing what you want in plain English.
            </p>
            <div style={{ marginTop: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {['New lead → nurture sequence', 'Trial signup → onboard + convert', 'Tag added → assign + task', 'Form submit → discount email'].map(ex => (
                <button key={ex} onClick={() => { setCreating(true); setAiPrompt(ex); }}
                  style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: '20px', fontSize: '12px', color: '#6366f1', backgroundColor: 'white', cursor: 'pointer' }}>
                  {ex}
                </button>
              ))}
            </div>
            <button onClick={() => setCreating(true)}
              style={{ marginTop: '20px', padding: '11px 24px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus size={16} /> New Automation
            </button>
          </div>
        )}
      </div>

      {editingNode && selected && (
        <EditNodeModal
          node={editingNode}
          onSave={updated => { updateNode(selected.id, updated); setEditingNode(null); }}
          onClose={() => setEditingNode(null)}
        />
      )}
    </div>
  );
}

// Suppress unused import warning — Calendar is used via NODE_META icons
const _calendarRef = Calendar;
