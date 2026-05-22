import { useState, useRef } from 'react';
import type { DragEvent } from 'react';
import {
  Plus, Search, X, Check, Edit2, Trash2, User,
  LayoutGrid, List, MessageSquare, Send, Flag, ChevronDown,
} from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import type { Deal, Stage, ChecklistItem, DealActivity } from '../../types';

type Priority = 'urgent' | 'high' | 'normal' | 'low';
type ViewMode = 'board' | 'list' | 'table';
type SortKey = 'title' | 'value' | 'close' | 'priority';

const PRIORITY: Record<Priority, { color: string; bg: string; label: string; border: string }> = {
  urgent: { color: '#dc2626', bg: '#fef2f2', label: 'Urgent', border: '#dc2626' },
  high:   { color: '#ea580c', bg: '#fff7ed', label: 'High',   border: '#ea580c' },
  normal: { color: '#6366f1', bg: '#eef2ff', label: 'Normal', border: '#6366f1' },
  low:    { color: '#94a3b8', bg: '#f8fafc', label: 'Low',    border: '#e2e8f0' },
};

const LABEL_PRESETS = [
  { color: '#ef4444', text: 'Hot Lead' },
  { color: '#f97316', text: 'Follow Up' },
  { color: '#22c55e', text: 'Ready to Close' },
  { color: '#3b82f6', text: 'Enterprise' },
  { color: '#8b5cf6', text: 'VIP' },
  { color: '#ec4899', text: 'Partnership' },
];

const LABEL_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#14b8a6'];

const STAGE_COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#8b5cf6','#14b8a6','#ec4899','#0ea5e9'];

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function fmt(n: number) { return `$${n.toLocaleString()}`; }
function isOverdue(date: string) { return !!date && new Date(date) < new Date(); }
function fmtRelTime(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── Deal Card ─────────────────────────────────────────────────────────────────
interface DealCardProps {
  deal: Deal;
  stageId: string;
  onEdit: (deal: Deal) => void;
  onDelete: (deal: Deal) => void;
  onOpen: (deal: Deal) => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, deal: Deal, stageId: string) => void;
}

function DealCard({ deal, stageId, onEdit, onDelete, onOpen, onDragStart }: DealCardProps) {
  const p = (deal.priority ?? 'normal') as Priority;
  const pc = PRIORITY[p];
  const checklist = deal.checklist ?? [];
  const done = checklist.filter(c => c.done).length;
  const labels = deal.labels ?? [];
  const overdue = isOverdue(deal.expectedClose);

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, deal, stageId)}
      onClick={() => onOpen(deal)}
      style={{
        backgroundColor: 'white',
        borderRadius: 10,
        padding: '12px 14px',
        border: '1px solid #e2e8f0',
        borderLeft: `4px solid ${pc.border}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        cursor: 'pointer',
        transition: 'all 0.12s',
        marginBottom: 8,
        userSelect: 'none',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, backgroundColor: pc.bg, color: pc.color }}>
          {pc.label.toUpperCase()}
        </span>
        <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => onEdit(deal)}
            style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, color: '#94a3b8', display: 'flex' }}>
            <Edit2 size={12} />
          </button>
          <button onClick={() => onDelete(deal)}
            style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, color: '#94a3b8', display: 'flex' }}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', margin: '0 0 6px', lineHeight: 1.4 }}>{deal.title}</p>

      {labels.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {labels.map((l, i) => (
            <span key={i} style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 10, backgroundColor: l.color + '22', color: l.color, border: `1px solid ${l.color}44` }}>
              {l.text}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
        <User size={11} color="#94a3b8" />
        <span style={{ fontSize: 11, color: '#64748b' }}>{deal.contactName}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{fmt(deal.value)}</span>
        <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 20, backgroundColor: '#f0f9ff', color: '#0ea5e9', fontWeight: 600 }}>
          {deal.probability}%
        </span>
      </div>

      {checklist.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: '#94a3b8' }}>Checklist</span>
            <span style={{ fontSize: 10, color: done === checklist.length ? '#22c55e' : '#94a3b8', fontWeight: 600 }}>{done}/{checklist.length}</span>
          </div>
          <div style={{ height: 3, backgroundColor: '#e2e8f0', borderRadius: 2 }}>
            <div style={{ height: '100%', width: `${checklist.length > 0 ? (done / checklist.length) * 100 : 0}%`, backgroundColor: done === checklist.length ? '#22c55e' : '#6366f1', borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      {deal.expectedClose && (
        <div style={{ marginTop: 6 }}>
          <span style={{ fontSize: 10, color: overdue ? '#dc2626' : '#94a3b8', fontWeight: overdue ? 700 : 400 }}>
            {overdue ? '⚠ Overdue: ' : '📅 '}{deal.expectedClose}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Deal Form Modal ───────────────────────────────────────────────────────────
interface DealFormProps {
  deal: Deal | null;
  stages: Stage[];
  defaultStageId: string;
  contacts: { id: string; name: string }[];
  onSave: (data: Partial<Deal>, targetStageId: string) => void;
  onClose: () => void;
}

function DealForm({ deal, stages, defaultStageId, contacts, onSave, onClose }: DealFormProps) {
  const initStageId = deal ? (stages.find(s => s.name === deal.stage)?.id ?? stages[0]?.id ?? '') : (defaultStageId || (stages[0]?.id ?? ''));
  const [title, setTitle] = useState(deal?.title ?? '');
  const [contactId, setContactId] = useState(deal?.contactId ?? '');
  const [stageId, setStageId] = useState(initStageId);
  const [value, setValue] = useState(deal?.value?.toString() ?? '0');
  const [probability, setProbability] = useState(deal?.probability?.toString() ?? '50');
  const [expectedClose, setExpectedClose] = useState(deal?.expectedClose ?? '');
  const [assignedTo, setAssignedTo] = useState(deal?.assignedTo ?? '');
  const [priority, setPriority] = useState<Priority>((deal?.priority ?? 'normal') as Priority);
  const [description, setDescription] = useState(deal?.description ?? '');
  const [labels, setLabels] = useState<{ color: string; text: string }[]>(deal?.labels ?? []);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(deal?.checklist ?? []);
  const [newCheckItem, setNewCheckItem] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [customLabelColor, setCustomLabelColor] = useState(LABEL_COLORS[0]);

  const toggleLabel = (label: { color: string; text: string }) => {
    setLabels(prev => prev.some(l => l.text === label.text)
      ? prev.filter(l => l.text !== label.text)
      : [...prev, label]);
  };

  const addChecklist = () => {
    if (!newCheckItem.trim()) return;
    setChecklist(prev => [...prev, { id: `ci-${Date.now()}`, text: newCheckItem.trim(), done: false }]);
    setNewCheckItem('');
  };

  const addCustomLabel = () => {
    if (!customLabel.trim()) return;
    setLabels(prev => [...prev, { color: customLabelColor, text: customLabel.trim() }]);
    setCustomLabel('');
  };

  const handleSave = () => {
    if (!title.trim()) return;
    const selContact = contacts.find(c => c.id === contactId);
    onSave({
      title: title.trim(),
      contactId: contactId || '',
      contactName: selContact?.name || (deal?.contactName ?? 'Unknown'),
      value: parseFloat(value) || 0,
      probability: parseInt(probability) || 50,
      expectedClose,
      assignedTo,
      priority,
      description,
      labels,
      checklist,
      activity: deal?.activity ?? [],
    }, stageId);
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7,
    fontSize: 13, color: '#0f172a', outline: 'none', boxSizing: 'border-box',
    backgroundColor: 'white', fontFamily: 'inherit',
  };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.5)' }}
      onClick={onClose}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
        onClick={e => e.stopPropagation()}>

        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{deal ? 'Edit Deal' : 'New Deal'}</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={20} /></button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={lbl}>Deal Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Enter deal title" style={inp} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Contact</label>
              <select value={contactId} onChange={e => setContactId(e.target.value)} style={{ ...inp }}>
                <option value="">Select contact...</option>
                {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Stage</label>
              <select value={stageId} onChange={e => setStageId(e.target.value)} style={{ ...inp }}>
                {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Deal Value ($)</label>
              <input type="number" value={value} onChange={e => setValue(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Probability (%)</label>
              <input type="number" min="0" max="100" value={probability} onChange={e => setProbability(e.target.value)} style={inp} />
            </div>
          </div>

          <div>
            <label style={lbl}>Priority</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(Object.entries(PRIORITY) as [Priority, (typeof PRIORITY)[Priority]][]).map(([key, cfg]) => (
                <button key={key} onClick={() => setPriority(key)}
                  style={{ flex: 1, padding: '7px 4px', border: `2px solid ${priority === key ? cfg.border : '#e2e8f0'}`, borderRadius: 8, backgroundColor: priority === key ? cfg.bg : 'white', color: priority === key ? cfg.color : '#64748b', fontSize: 11, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase' }}>
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Expected Close</label>
              <input type="date" value={expectedClose} onChange={e => setExpectedClose(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Assigned To</label>
              <input value={assignedTo} onChange={e => setAssignedTo(e.target.value)} placeholder="Name or email" style={inp} />
            </div>
          </div>

          <div>
            <label style={lbl}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Add deal description..." rows={3}
              style={{ ...inp, resize: 'vertical' }} />
          </div>

          <div>
            <label style={lbl}>Labels</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {LABEL_PRESETS.map(lp => {
                const active = labels.some(l => l.text === lp.text);
                return (
                  <button key={lp.text} onClick={() => toggleLabel(lp)}
                    style={{ padding: '4px 10px', borderRadius: 10, border: `1.5px solid ${active ? lp.color : '#e2e8f0'}`, backgroundColor: active ? lp.color + '22' : 'white', color: active ? lp.color : '#64748b', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    {lp.text}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {LABEL_COLORS.map(c => (
                  <button key={c} onClick={() => setCustomLabelColor(c)}
                    style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: c, border: customLabelColor === c ? `2px solid #0f172a` : '2px solid transparent', cursor: 'pointer', flexShrink: 0 }} />
                ))}
              </div>
              <input value={customLabel} onChange={e => setCustomLabel(e.target.value)} placeholder="Custom label..." style={{ ...inp, flex: 1 }} onKeyDown={e => e.key === 'Enter' && addCustomLabel()} />
              <button onClick={addCustomLabel} style={{ padding: '7px 12px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add</button>
            </div>
            {labels.filter(l => !LABEL_PRESETS.some(p => p.text === l.text)).length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {labels.filter(l => !LABEL_PRESETS.some(p => p.text === l.text)).map((l, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 10, backgroundColor: l.color + '22', color: l.color, fontSize: 11, fontWeight: 600 }}>
                    {l.text}
                    <button onClick={() => setLabels(prev => prev.filter(x => x.text !== l.text))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', padding: 0, display: 'flex' }}><X size={10} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label style={lbl}>Checklist ({checklist.filter(c => c.done).length}/{checklist.length})</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
              {checklist.map((item, i) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', backgroundColor: '#f8fafc', borderRadius: 7 }}>
                  <input type="checkbox" checked={item.done} onChange={() => setChecklist(prev => prev.map((c, j) => j === i ? { ...c, done: !c.done } : c))} style={{ cursor: 'pointer' }} />
                  <span style={{ flex: 1, fontSize: 13, color: item.done ? '#94a3b8' : '#374151', textDecoration: item.done ? 'line-through' : 'none' }}>{item.text}</span>
                  <button onClick={() => setChecklist(prev => prev.filter((_, j) => j !== i))}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 2 }}><X size={12} /></button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={newCheckItem} onChange={e => setNewCheckItem(e.target.value)} placeholder="Add checklist item..." style={{ ...inp, flex: 1 }} onKeyDown={e => e.key === 'Enter' && addChecklist()} />
              <button onClick={addChecklist} style={{ padding: '8px 14px', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#374151', whiteSpace: 'nowrap' }}>+ Add</button>
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '9px 20px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', backgroundColor: 'white', color: '#374151' }}>Cancel</button>
          <button onClick={handleSave} disabled={!title.trim()}
            style={{ padding: '9px 20px', backgroundColor: title.trim() ? '#6366f1' : '#c7d2fe', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: title.trim() ? 'pointer' : 'default' }}>
            {deal ? 'Save Changes' : 'Create Deal'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Deal Detail Panel ─────────────────────────────────────────────────────────
interface DealDetailPanelProps {
  deal: Deal;
  onClose: () => void;
  onEdit: (deal: Deal) => void;
  onUpdateDeal: (dealId: string, updates: Partial<Deal>) => void;
}

function DealDetailPanel({ deal, onClose, onEdit, onUpdateDeal }: DealDetailPanelProps) {
  const [tab, setTab] = useState<'overview' | 'checklist' | 'activity'>('overview');
  const [newActivity, setNewActivity] = useState('');
  const [newCheckItem, setNewCheckItem] = useState('');

  const p = (deal.priority ?? 'normal') as Priority;
  const pc = PRIORITY[p];
  const checklist = deal.checklist ?? [];
  const activity = deal.activity ?? [];
  const labels = deal.labels ?? [];
  const done = checklist.filter(c => c.done).length;

  const addActivity = () => {
    if (!newActivity.trim()) return;
    const item: DealActivity = { id: `act-${Date.now()}`, text: newActivity.trim(), timestamp: new Date().toISOString() };
    onUpdateDeal(deal.id, { activity: [item, ...activity] });
    setNewActivity('');
  };

  const toggleCheck = (id: string) => {
    onUpdateDeal(deal.id, { checklist: checklist.map(c => c.id === id ? { ...c, done: !c.done } : c) });
  };

  const addCheck = () => {
    if (!newCheckItem.trim()) return;
    onUpdateDeal(deal.id, { checklist: [...checklist, { id: `ci-${Date.now()}`, text: newCheckItem.trim(), done: false }] });
    setNewCheckItem('');
  };

  const removeCheck = (id: string) => {
    onUpdateDeal(deal.id, { checklist: checklist.filter(c => c.id !== id) });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', backgroundColor: 'rgba(15,23,42,0.4)' }}
      onClick={onClose}>
      <div style={{ marginLeft: 'auto', width: '100%', maxWidth: 540, height: '100%', backgroundColor: 'white', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 48px rgba(0,0,0,0.18)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fafafa', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, backgroundColor: pc.bg, color: pc.color }}>{pc.label.toUpperCase()}</span>
                {labels.map((l, i) => (
                  <span key={i} style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 10, backgroundColor: l.color + '22', color: l.color }}>{l.text}</span>
                ))}
              </div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>{deal.title}</h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{deal.contactName} · {deal.stage}</p>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={() => onEdit(deal)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 8, backgroundColor: 'white', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <Edit2 size={13} /> Edit
              </button>
              <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 4 }}><X size={20} /></button>
            </div>
          </div>

          {/* Key metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            {[
              { label: 'Value', value: fmt(deal.value) },
              { label: 'Weighted', value: fmt(Math.round(deal.value * deal.probability / 100)) },
              { label: 'Probability', value: `${deal.probability}%` },
              { label: 'Close', value: deal.expectedClose || '—', danger: isOverdue(deal.expectedClose) },
            ].map(m => (
              <div key={m.label} style={{ padding: '8px 10px', backgroundColor: 'white', borderRadius: 8, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>{m.label}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: (m as { danger?: boolean }).danger ? '#dc2626' : '#0f172a' }}>{m.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fafafa', flexShrink: 0 }}>
          {(['overview', 'checklist', 'activity'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex: 1, padding: '11px 8px', border: 'none', borderBottom: `2px solid ${tab === t ? '#6366f1' : 'transparent'}`, backgroundColor: 'transparent', color: tab === t ? '#6366f1' : '#64748b', fontSize: 13, fontWeight: tab === t ? 700 : 500, cursor: 'pointer', textTransform: 'capitalize' }}>
              {t}{t === 'checklist' ? ` (${done}/${checklist.length})` : ''}{t === 'activity' ? ` (${activity.length})` : ''}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {tab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {deal.description && (
                <div>
                  <h4 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Description</h4>
                  <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.6, backgroundColor: '#f8fafc', padding: '12px 14px', borderRadius: 8, border: '1px solid #e2e8f0' }}>{deal.description}</p>
                </div>
              )}
              <div>
                <h4 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Deal Details</h4>
                <div style={{ backgroundColor: 'white', borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                  {[
                    { label: 'Stage', value: deal.stage },
                    { label: 'Value', value: fmt(deal.value) },
                    { label: 'Weighted Value', value: fmt(Math.round(deal.value * deal.probability / 100)) },
                    { label: 'Probability', value: `${deal.probability}%` },
                    { label: 'Close Date', value: deal.expectedClose || '—', danger: isOverdue(deal.expectedClose) },
                    { label: 'Assigned To', value: deal.assignedTo || '—' },
                    { label: 'Created', value: new Date(deal.createdAt).toLocaleDateString() },
                  ].map((item, i, arr) => (
                    <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                      <span style={{ fontSize: 13, color: '#64748b' }}>{item.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: (item as { danger?: boolean }).danger ? '#dc2626' : '#0f172a' }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Win Probability</h4>
                <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: '14px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>Likelihood to close</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#6366f1' }}>{deal.probability}%</span>
                  </div>
                  <div style={{ height: 10, backgroundColor: '#e2e8f0', borderRadius: 5 }}>
                    <div style={{ height: '100%', width: `${deal.probability}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', borderRadius: 5, transition: 'width 0.3s' }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'checklist' && (
            <div>
              {checklist.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Progress</span>
                    <span style={{ fontSize: 12, color: done === checklist.length ? '#22c55e' : '#6366f1', fontWeight: 700 }}>{done}/{checklist.length} complete</span>
                  </div>
                  <div style={{ height: 8, backgroundColor: '#e2e8f0', borderRadius: 4 }}>
                    <div style={{ height: '100%', width: `${checklist.length > 0 ? (done / checklist.length) * 100 : 0}%`, backgroundColor: done === checklist.length ? '#22c55e' : '#6366f1', borderRadius: 4, transition: 'width 0.3s' }} />
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {checklist.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', backgroundColor: item.done ? '#f0fdf4' : '#f8fafc', borderRadius: 8, border: `1px solid ${item.done ? '#bbf7d0' : '#e2e8f0'}`, transition: 'all 0.2s' }}>
                    <input type="checkbox" checked={item.done} onChange={() => toggleCheck(item.id)} style={{ cursor: 'pointer', width: 16, height: 16 }} />
                    <span style={{ flex: 1, fontSize: 14, color: item.done ? '#94a3b8' : '#374151', textDecoration: item.done ? 'line-through' : 'none' }}>{item.text}</span>
                    {item.done && <Check size={14} color="#22c55e" />}
                    <button onClick={() => removeCheck(item.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 2 }}><X size={12} /></button>
                  </div>
                ))}
                {checklist.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8' }}>
                    <p style={{ margin: 0, fontSize: 13 }}>No checklist items yet.</p>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={newCheckItem} onChange={e => setNewCheckItem(e.target.value)} placeholder="Add checklist item..."
                  style={{ flex: 1, padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                  onKeyDown={e => e.key === 'Enter' && addCheck()} />
                <button onClick={addCheck}
                  style={{ padding: '9px 16px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Add</button>
              </div>
            </div>
          )}

          {tab === 'activity' && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
                <input value={newActivity} onChange={e => setNewActivity(e.target.value)} placeholder="Add a note or update..."
                  style={{ flex: 1, padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                  onKeyDown={e => e.key === 'Enter' && addActivity()} />
                <button onClick={addActivity}
                  style={{ padding: '9px 14px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Send size={14} /> Post
                </button>
              </div>
              {activity.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>
                  <MessageSquare size={28} color="#e2e8f0" style={{ margin: '0 auto 8px', display: 'block' }} />
                  <p style={{ fontSize: 13, margin: 0 }}>No activity yet. Add a note above.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {activity.map(item => (
                    <div key={item.id} style={{ display: 'flex', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <User size={14} color="white" />
                      </div>
                      <div style={{ flex: 1, backgroundColor: '#f8fafc', borderRadius: 10, padding: '10px 14px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>You</span>
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>{fmtRelTime(item.timestamp)}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{item.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Pipelines Component ──────────────────────────────────────────────────
export default function Pipelines() {
  const { pipelines, contacts, updatePipeline, addNotification } = useApp();

  const [selectedId, setSelectedId] = useState(pipelines[0]?.id ?? '');
  const [view, setView] = useState<ViewMode>('board');
  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortKey>('title');
  const [showSortMenu, setShowSortMenu] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editDealId, setEditDealId] = useState<string | null>(null);
  const [formDefaultStage, setFormDefaultStage] = useState('');

  const [detailDealId, setDetailDealId] = useState<string | null>(null);

  const [dragOverStage, setDragOverStage] = useState('');
  const dragDealId = useRef('');
  const dragFromStage = useRef('');

  const [addingStage, setAddingStage] = useState(false);
  const [newStageName, setNewStageName] = useState('');

  const selected = pipelines.find(p => p.id === selectedId) ?? pipelines[0];
  const allDeals = selected?.stages.flatMap(s => s.deals) ?? [];
  const editDeal = editDealId ? allDeals.find(d => d.id === editDealId) ?? null : null;
  const detailDeal = detailDealId ? allDeals.find(d => d.id === detailDealId) ?? null : null;

  if (!selected) return (
    <div>
      <Header title="Pipelines" subtitle="Track your sales opportunities" />
      <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>No pipelines configured.</div>
    </div>
  );

  // ── Helpers ──────────────────────────────────────────────────────────────
  const updateDeal = (dealId: string, updates: Partial<Deal>) => {
    const newStages = selected.stages.map(s => ({
      ...s, deals: s.deals.map(d => d.id === dealId ? { ...d, ...updates } : d),
    }));
    updatePipeline(selected.id, { stages: newStages });
  };

  const moveDeal = (dealId: string, fromStageId: string, toStageId: string) => {
    if (fromStageId === toStageId) return;
    const toStage = selected.stages.find(s => s.id === toStageId);
    if (!toStage) return;
    let moving: Deal | undefined;
    const without = selected.stages.map(s => {
      if (s.id === fromStageId) { moving = s.deals.find(d => d.id === dealId); return { ...s, deals: s.deals.filter(d => d.id !== dealId) }; }
      return s;
    });
    if (!moving) return;
    const updated = { ...moving, stage: toStage.name };
    updatePipeline(selected.id, { stages: without.map(s => s.id === toStageId ? { ...s, deals: [...s.deals, updated] } : s) });
  };

  const saveDeal = (data: Partial<Deal>, targetStageId: string) => {
    const targetStage = selected.stages.find(s => s.id === targetStageId);
    if (!targetStage) return;
    if (editDeal) {
      const updated: Deal = { ...editDeal, ...data, stage: targetStage.name };
      const newStages = selected.stages.map(s => ({
        ...s,
        deals: s.id === targetStageId
          ? [...s.deals.filter(d => d.id !== editDeal.id), updated]
          : s.deals.filter(d => d.id !== editDeal.id),
      }));
      updatePipeline(selected.id, { stages: newStages });
      addNotification('Deal updated');
    } else {
      const newDeal: Deal = {
        id: `deal-${Date.now()}`,
        title: data.title ?? '',
        contactId: data.contactId ?? '',
        contactName: data.contactName ?? '',
        value: data.value ?? 0,
        stage: targetStage.name,
        probability: data.probability ?? 50,
        expectedClose: data.expectedClose ?? '',
        assignedTo: data.assignedTo ?? '',
        createdAt: new Date().toISOString(),
        priority: data.priority ?? 'normal',
        labels: data.labels ?? [],
        description: data.description ?? '',
        checklist: data.checklist ?? [],
        activity: [],
      };
      updatePipeline(selected.id, { stages: selected.stages.map(s => s.id === targetStageId ? { ...s, deals: [...s.deals, newDeal] } : s) });
      addNotification(`Deal "${newDeal.title}" created!`);
    }
    setShowForm(false);
    setEditDealId(null);
  };

  const deleteDeal = (deal: Deal) => {
    if (!window.confirm(`Delete "${deal.title}"?`)) return;
    const newStages = selected.stages.map(s => ({ ...s, deals: s.deals.filter(d => d.id !== deal.id) }));
    updatePipeline(selected.id, { stages: newStages });
    if (detailDealId === deal.id) setDetailDealId(null);
    addNotification('Deal deleted', 'info');
  };

  const openAddDeal = (stageId = selected.stages[0]?.id ?? '') => {
    setFormDefaultStage(stageId);
    setEditDealId(null);
    setShowForm(true);
  };

  const openEditDeal = (deal: Deal) => {
    setEditDealId(deal.id);
    setShowForm(true);
  };

  const addStage = () => {
    if (!newStageName.trim()) return;
    const newStage: Stage = {
      id: `stage-${Date.now()}`,
      name: newStageName.trim(),
      color: STAGE_COLORS[selected.stages.length % STAGE_COLORS.length],
      deals: [],
    };
    updatePipeline(selected.id, { stages: [...selected.stages, newStage] });
    setNewStageName('');
    setAddingStage(false);
  };

  const handleDragStart = (e: DragEvent<HTMLDivElement>, deal: Deal, stageId: string) => {
    dragDealId.current = deal.id;
    dragFromStage.current = stageId;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stageId);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, toStageId: string) => {
    e.preventDefault();
    moveDeal(dragDealId.current, dragFromStage.current, toStageId);
    setDragOverStage('');
    dragDealId.current = '';
    dragFromStage.current = '';
  };

  // ── Filter + Sort ─────────────────────────────────────────────────────────
  const applyFilter = (deals: Deal[]) => {
    let r = deals;
    if (search) r = r.filter(d => d.title.toLowerCase().includes(search.toLowerCase()) || d.contactName.toLowerCase().includes(search.toLowerCase()));
    if (filterPriority !== 'all') r = r.filter(d => (d.priority ?? 'normal') === filterPriority);
    return [...r].sort((a, b) => {
      if (sortBy === 'value') return b.value - a.value;
      if (sortBy === 'close') return (a.expectedClose || '9999').localeCompare(b.expectedClose || '9999');
      if (sortBy === 'priority') return (PRIORITY_ORDER[a.priority ?? 'normal'] ?? 2) - (PRIORITY_ORDER[b.priority ?? 'normal'] ?? 2);
      return a.title.localeCompare(b.title);
    });
  };

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalValue = allDeals.reduce((v, d) => v + d.value, 0);
  const weightedValue = allDeals.reduce((v, d) => v + Math.round(d.value * d.probability / 100), 0);
  const wonStage = selected.stages.find(s => s.name.toLowerCase().includes('won') || s.name.toLowerCase().includes('close'));
  const wonDeals = wonStage?.deals.length ?? 0;
  const winRate = allDeals.length > 0 ? Math.round(wonDeals / allDeals.length * 100) : 0;

  const SORT_LABELS: Record<SortKey, string> = { title: 'Name', value: 'Value', close: 'Close Date', priority: 'Priority' };

  return (
    <div>
      <Header title="Pipelines" subtitle="Manage your sales opportunities" />
      <div style={{ padding: '24px 28px' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Total Pipeline', value: fmt(totalValue), sub: `${allDeals.length} deals`, color: '#6366f1' },
            { label: 'Weighted Value', value: fmt(weightedValue), sub: 'By probability', color: '#8b5cf6' },
            { label: 'Won This Period', value: fmt(wonStage?.deals.reduce((v, d) => v + d.value, 0) ?? 0), sub: `${wonDeals} closed deals`, color: '#22c55e' },
            { label: 'Win Rate', value: `${winRate}%`, sub: 'Based on closed stage', color: '#f59e0b' },
          ].map(item => (
            <div key={item.label} style={{ backgroundColor: 'white', borderRadius: 12, padding: '18px 20px', border: '1px solid #e2e8f0', borderLeft: `4px solid ${item.color}` }}>
              <p style={{ fontSize: 12, color: '#64748b', fontWeight: 500, margin: '0 0 6px' }}>{item.label}</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>{item.value}</p>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, marginBottom: 0 }}>{item.sub}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {/* Pipeline selector */}
          {pipelines.length > 1 && (
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#0f172a', backgroundColor: 'white', cursor: 'pointer', outline: 'none' }}>
              {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          {/* View toggle */}
          <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: 8, padding: 3, gap: 2 }}>
            {([['board', <LayoutGrid size={14} />], ['list', <List size={14} />], ['table', '≡']] as const).map(([v, icon]) => (
              <button key={v} onClick={() => setView(v as ViewMode)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, border: 'none', backgroundColor: view === v ? 'white' : 'transparent', color: view === v ? '#6366f1' : '#64748b', fontSize: 13, fontWeight: view === v ? 700 : 500, cursor: 'pointer', boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', textTransform: 'capitalize' }}>
                {icon} {v}
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
            <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search deals..."
              style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', backgroundColor: 'white', boxSizing: 'border-box' }} />
          </div>

          {/* Priority filter */}
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value as Priority | 'all')}
            style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#374151', backgroundColor: 'white', cursor: 'pointer', outline: 'none' }}>
            <option value="all">All Priorities</option>
            {(Object.entries(PRIORITY) as [Priority, (typeof PRIORITY)[Priority]][]).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          {/* Sort */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowSortMenu(prev => !prev)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, backgroundColor: 'white', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              Sort: {SORT_LABELS[sortBy]} <ChevronDown size={13} />
            </button>
            {showSortMenu && (
              <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 200, marginTop: 4, backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 140, overflow: 'hidden' }}>
                {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([key, label]) => (
                  <button key={key} onClick={() => { setSortBy(key); setShowSortMenu(false); }}
                    style={{ display: 'block', width: '100%', padding: '9px 14px', textAlign: 'left', border: 'none', backgroundColor: sortBy === key ? '#f0f9ff' : 'white', color: sortBy === key ? '#6366f1' : '#374151', fontSize: 13, fontWeight: sortBy === key ? 700 : 400, cursor: 'pointer' }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Add Deal */}
          <button onClick={() => openAddDeal()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <Plus size={15} /> Add Deal
          </button>
        </div>

        {/* ── Board View ──────────────────────────────────────────────────────── */}
        {view === 'board' && (
          <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 16, alignItems: 'flex-start' }}>
            {selected.stages.map(stage => {
              const deals = applyFilter(stage.deals);
              const stageValue = stage.deals.reduce((v, d) => v + d.value, 0);
              const isOver = dragOverStage === stage.id;
              return (
                <div key={stage.id}
                  style={{ minWidth: 260, maxWidth: 276, flex: '0 0 260px' }}
                  onDragOver={e => handleDragOver(e, stage.id)}
                  onDrop={e => handleDrop(e, stage.id)}
                  onDragLeave={() => setDragOverStage('')}>
                  {/* Column header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '8px 10px', backgroundColor: 'white', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: stage.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>{stage.name}</span>
                      <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>({stage.deals.length})</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>{fmt(stageValue)}</span>
                  </div>

                  {/* Drop zone */}
                  <div style={{ minHeight: 80, padding: '4px 0', borderRadius: 10, backgroundColor: isOver ? '#eef2ff' : 'transparent', border: isOver ? '2px dashed #6366f1' : '2px dashed transparent', transition: 'all 0.15s' }}>
                    {deals.map(deal => (
                      <DealCard
                        key={deal.id}
                        deal={deal}
                        stageId={stage.id}
                        onEdit={openEditDeal}
                        onDelete={deleteDeal}
                        onOpen={d => setDetailDealId(d.id)}
                        onDragStart={handleDragStart}
                      />
                    ))}
                    {deals.length === 0 && !isOver && (
                      <div style={{ padding: '20px 10px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                        Drop deals here
                      </div>
                    )}
                  </div>

                  {/* Add deal to this stage */}
                  <button onClick={() => openAddDeal(stage.id)}
                    style={{ width: '100%', marginTop: 6, padding: '9px', border: '2px dashed #e2e8f0', borderRadius: 10, backgroundColor: 'transparent', color: '#94a3b8', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'all 0.1s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.color = '#6366f1'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#94a3b8'; }}>
                    <Plus size={13} /> Add Deal
                  </button>
                </div>
              );
            })}

            {/* Add stage */}
            <div style={{ minWidth: 220, flex: '0 0 220px' }}>
              {addingStage ? (
                <div style={{ backgroundColor: 'white', borderRadius: 10, border: '1px solid #e2e8f0', padding: '12px' }}>
                  <input value={newStageName} onChange={e => setNewStageName(e.target.value)} placeholder="Stage name..." autoFocus
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', marginBottom: 8, boxSizing: 'border-box', fontFamily: 'inherit' }}
                    onKeyDown={e => { if (e.key === 'Enter') addStage(); if (e.key === 'Escape') setAddingStage(false); }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={addStage} style={{ flex: 1, padding: '7px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add</button>
                    <button onClick={() => setAddingStage(false)} style={{ flex: 1, padding: '7px', backgroundColor: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingStage(true)}
                  style={{ width: '100%', padding: '12px', border: '2px dashed #d1d5db', borderRadius: 10, backgroundColor: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.1s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.color = '#6366f1'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#94a3b8'; }}>
                  <Plus size={14} /> Add Stage
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── List View ───────────────────────────────────────────────────────── */}
        {view === 'list' && (
          <div style={{ backgroundColor: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Flag size={14} color="#6366f1" />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>All Deals</span>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>({applyFilter(allDeals).length} showing)</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {applyFilter(allDeals).map((deal, i, arr) => {
                const p = (deal.priority ?? 'normal') as Priority;
                const pc = PRIORITY[p];
                const checklist = deal.checklist ?? [];
                const done = checklist.filter(c => c.done).length;
                return (
                  <div key={deal.id}
                    onClick={() => setDetailDealId(deal.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', borderLeft: `4px solid ${pc.border}`, transition: 'background 0.1s' }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'white'; }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, backgroundColor: pc.bg, color: pc.color, whiteSpace: 'nowrap', flexShrink: 0 }}>{pc.label}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>{deal.title}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{deal.contactName}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flexShrink: 0 }}>
                      {(deal.labels ?? []).slice(0, 2).map((l, li) => (
                        <span key={li} style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 10, backgroundColor: l.color + '22', color: l.color }}>{l.text}</span>
                      ))}
                    </div>
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, backgroundColor: '#f1f5f9', color: '#64748b', fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>{deal.stage}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', flexShrink: 0 }}>{fmt(deal.value)}</span>
                    {checklist.length > 0 && (
                      <span style={{ fontSize: 11, color: done === checklist.length ? '#22c55e' : '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>✓ {done}/{checklist.length}</span>
                    )}
                    <span style={{ fontSize: 12, color: isOverdue(deal.expectedClose) ? '#dc2626' : '#94a3b8', whiteSpace: 'nowrap', flexShrink: 0 }}>{deal.expectedClose || '—'}</span>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => openEditDeal(deal)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 5, borderRadius: 5, color: '#94a3b8', display: 'flex' }}><Edit2 size={13} /></button>
                      <button onClick={() => deleteDeal(deal)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 5, borderRadius: 5, color: '#94a3b8', display: 'flex' }}><Trash2 size={13} /></button>
                    </div>
                  </div>
                );
              })}
              {applyFilter(allDeals).length === 0 && (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No deals match your filters.</div>
              )}
            </div>
          </div>
        )}

        {/* ── Table View ──────────────────────────────────────────────────────── */}
        {view === 'table' && (
          <div style={{ backgroundColor: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Priority', 'Deal', 'Contact', 'Stage', 'Value', 'Weighted', 'Probability', 'Close Date', 'Assigned', 'Checklist', ''].map(h => (
                    <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {applyFilter(allDeals).map((deal, i, arr) => {
                  const p = (deal.priority ?? 'normal') as Priority;
                  const pc = PRIORITY[p];
                  const checklist = deal.checklist ?? [];
                  const done = checklist.filter(c => c.done).length;
                  const stageObj = selected.stages.find(s => s.name === deal.stage);
                  return (
                    <tr key={deal.id} onClick={() => setDetailDealId(deal.id)}
                      style={{ borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', transition: 'background 0.1s', borderLeft: `3px solid ${pc.border}` }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'white'; }}>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 3, backgroundColor: pc.bg, color: pc.color, textTransform: 'uppercase' }}>{pc.label}</span>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600, color: '#0f172a', maxWidth: 180 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.title}</div>
                        {(deal.labels ?? []).length > 0 && (
                          <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
                            {(deal.labels ?? []).slice(0, 2).map((l, li) => (
                              <span key={li} style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8, backgroundColor: l.color + '22', color: l.color }}>{l.text}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 13, color: '#374151' }}>{deal.contactName}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, backgroundColor: stageObj ? stageObj.color + '22' : '#f1f5f9', color: stageObj?.color ?? '#64748b' }}>{deal.stage}</span>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 14, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>{fmt(deal.value)}</td>
                      <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600, color: '#6366f1', whiteSpace: 'nowrap' }}>{fmt(Math.round(deal.value * deal.probability / 100))}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 50, height: 5, backgroundColor: '#e2e8f0', borderRadius: 3 }}>
                            <div style={{ height: '100%', width: `${deal.probability}%`, backgroundColor: '#6366f1', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{deal.probability}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: isOverdue(deal.expectedClose) ? '#dc2626' : '#64748b', fontWeight: isOverdue(deal.expectedClose) ? 700 : 400, whiteSpace: 'nowrap' }}>
                        {isOverdue(deal.expectedClose) && '⚠ '}{deal.expectedClose || '—'}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 13, color: '#374151' }}>{deal.assignedTo || '—'}</td>
                      <td style={{ padding: '11px 14px' }}>
                        {checklist.length > 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{ width: 40, height: 4, backgroundColor: '#e2e8f0', borderRadius: 2 }}>
                              <div style={{ height: '100%', width: `${(done / checklist.length) * 100}%`, backgroundColor: done === checklist.length ? '#22c55e' : '#6366f1', borderRadius: 2 }} />
                            </div>
                            <span style={{ fontSize: 11, color: done === checklist.length ? '#22c55e' : '#94a3b8', fontWeight: 600 }}>{done}/{checklist.length}</span>
                          </div>
                        ) : <span style={{ fontSize: 11, color: '#d1d5db' }}>—</span>}
                      </td>
                      <td style={{ padding: '11px 14px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button onClick={() => openEditDeal(deal)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 5, borderRadius: 5, color: '#94a3b8', display: 'flex' }}><Edit2 size={12} /></button>
                          <button onClick={() => deleteDeal(deal)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 5, borderRadius: 5, color: '#94a3b8', display: 'flex' }}><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {applyFilter(allDeals).length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No deals match your filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sort menu backdrop */}
      {showSortMenu && <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setShowSortMenu(false)} />}

      {/* Deal Form Modal */}
      {showForm && (
        <DealForm
          deal={editDeal}
          stages={selected.stages}
          defaultStageId={formDefaultStage}
          contacts={contacts}
          onSave={saveDeal}
          onClose={() => { setShowForm(false); setEditDealId(null); }}
        />
      )}

      {/* Deal Detail Panel */}
      {detailDeal && (
        <DealDetailPanel
          deal={detailDeal}
          onClose={() => setDetailDealId(null)}
          onEdit={deal => { openEditDeal(deal); setDetailDealId(null); }}
          onUpdateDeal={updateDeal}
        />
      )}
    </div>
  );
}
