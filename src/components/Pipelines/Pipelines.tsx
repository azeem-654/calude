import { useState, useRef, useCallback, useEffect } from 'react';
import type { DragEvent } from 'react';
import {
  Plus, Search, X, Check, Edit2, Trash2, User,
  LayoutGrid, List, MessageSquare, Send, Flag, ChevronDown,
  ChevronLeft, ChevronRight, Trophy, ThumbsDown, MoreVertical,
  Settings, Clock, SlidersHorizontal, TrendingUp,
  FileText, CheckSquare, Timer, Link2, GitBranch, CalendarDays,
  Sparkles, ChevronUp, Calendar, Brain, Zap, Gauge,
} from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import type { Deal, Stage, ChecklistItem, DealActivity, SubTask } from '../../types';
import {
  AutomationsModal, ConfettiBurst, loadAutomationRules, saveAutomationRules,
  runAutomations, runIdleSweep, appendAutomationLog, describeAction,
} from './Automations';
import type { AutomationRule, AutomationRunResult } from './Automations';

type Priority = 'urgent' | 'high' | 'normal' | 'low';
type ViewMode = 'board' | 'list' | 'calendar' | 'gantt' | 'table' | 'funnel';
type SortKey = 'title' | 'value' | 'close' | 'priority' | 'days';

const SOURCES = ['Website', 'Referral', 'Cold Outreach', 'Social Media', 'Event', 'Paid Ads', 'Email Campaign', 'Phone', 'Walk-in', 'Other'];
const DEFAULT_ROTTING_DAYS = 14;

type CardFieldKey = 'priority' | 'source' | 'contact' | 'value' | 'probability' | 'labels' | 'daysInStage' | 'closeDate' | 'assignedTo' | 'checklist' | 'quickActions';
const ALL_CARD_FIELDS: { key: CardFieldKey; label: string; defaultOn: boolean }[] = [
  { key: 'priority',    label: 'Priority',      defaultOn: true  },
  { key: 'contact',     label: 'Contact',        defaultOn: true  },
  { key: 'value',       label: 'Value',          defaultOn: true  },
  { key: 'probability', label: 'Probability',    defaultOn: true  },
  { key: 'labels',      label: 'Labels',         defaultOn: true  },
  { key: 'daysInStage', label: 'Days in Stage',  defaultOn: true  },
  { key: 'source',      label: 'Source',         defaultOn: false },
  { key: 'closeDate',   label: 'Close Date',     defaultOn: true  },
  { key: 'assignedTo',  label: 'Assigned To',    defaultOn: false },
  { key: 'checklist',   label: 'Checklist',      defaultOn: true  },
  { key: 'quickActions',label: 'Quick Actions',  defaultOn: true  },
];
function loadCardFields(): Set<CardFieldKey> {
  try {
    const saved = localStorage.getItem('crm_card_fields');
    if (saved) return new Set(JSON.parse(saved) as CardFieldKey[]);
  } catch { /* ignore */ }
  return new Set(ALL_CARD_FIELDS.filter(f => f.defaultOn).map(f => f.key));
}
function daysInStage(deal: Deal): number {
  const from = deal.lastStageChangedAt ?? deal.createdAt;
  return Math.floor((Date.now() - new Date(from).getTime()) / 86400000);
}

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
  visibleFields: Set<CardFieldKey>;
  rottingDays: number;
  onEdit: (deal: Deal) => void;
  onDelete: (deal: Deal) => void;
  onOpen: (deal: Deal) => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, deal: Deal, stageId: string) => void;
  onMarkWon: (deal: Deal) => void;
  onMarkLost: (deal: Deal) => void;
}

function DealCard({ deal, stageId, visibleFields: vf, rottingDays, onEdit, onDelete, onOpen, onDragStart, onMarkWon, onMarkLost }: DealCardProps) {
  const p = (deal.priority ?? 'normal') as Priority;
  const pc = PRIORITY[p];
  const checklist = deal.checklist ?? [];
  const done = checklist.filter(c => c.done).length;
  const labels = deal.labels ?? [];
  const overdue = isOverdue(deal.expectedClose);
  const status = deal.status ?? 'active';
  const isWon = status === 'won';
  const isLost = status === 'lost';
  const days = daysInStage(deal);
  const isRotting = status === 'active' && days >= rottingDays;

  const cardBg = isWon ? '#f0fdf4' : isLost ? '#fafafa' : 'white';
  const cardBorder = isRotting ? '#f97316' : isWon ? '#bbf7d0' : isLost ? '#e6e9f0' : '#e6e9f0';
  const leftBorder = isWon ? '#22c55e' : isLost ? '#94a3b8' : pc.border;
  const rottingGlow = isRotting ? '0 0 0 2px #fed7aa, 0 1px 2px rgba(16,24,40,0.04)' : '0 1px 2px rgba(16,24,40,0.04)';

  return (
    <div
      draggable={status === 'active'}
      onDragStart={e => status === 'active' && onDragStart(e, deal, stageId)}
      onClick={() => onOpen(deal)}
      style={{
        backgroundColor: cardBg,
        borderRadius: 12,
        padding: '12px 14px',
        border: `1px solid ${cardBorder}`,
        borderLeft: `3px solid ${leftBorder}`,
        boxShadow: rottingGlow,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        marginBottom: 10,
        userSelect: 'none',
        opacity: isLost ? 0.7 : 1,
      }}
      onMouseEnter={e => { if (!isLost) { e.currentTarget.style.boxShadow = '0 8px 24px rgba(16,24,40,0.08)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = rottingGlow; e.currentTarget.style.transform = 'none'; }}
    >
      {/* Top row: status/priority + actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {isWon && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, backgroundColor: '#dcfce7', color: '#16a34a' }}>WON</span>}
          {isLost && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, backgroundColor: '#f1f5f9', color: '#94a3b8' }}>LOST</span>}
          {status === 'active' && vf.has('priority') && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, backgroundColor: pc.bg, color: pc.color }}>{pc.label.toUpperCase()}</span>}
          {isRotting && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, backgroundColor: '#fff7ed', color: '#ea580c' }}>ROTTING</span>}
        </div>
        <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
          {status === 'active' && <>
            <button onClick={() => onMarkWon(deal)} title="Mark Won" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, color: '#22c55e', display: 'flex' }}><Trophy size={11} /></button>
            <button onClick={() => onMarkLost(deal)} title="Mark Lost" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, color: '#94a3b8', display: 'flex' }}><ThumbsDown size={11} /></button>
          </>}
          {(isWon || isLost) && <button onClick={() => onEdit(deal)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, color: '#6366f1', fontSize: 10, fontWeight: 600 }}>Reopen</button>}
          <button onClick={() => onEdit(deal)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, color: '#94a3b8', display: 'flex' }}><Edit2 size={12} /></button>
          <button onClick={() => onDelete(deal)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, color: '#94a3b8', display: 'flex' }}><Trash2 size={12} /></button>
        </div>
      </div>

      {/* Title */}
      <p style={{ fontSize: 13, fontWeight: 600, color: isLost ? '#94a3b8' : '#0f172a', margin: '0 0 6px', lineHeight: 1.4, textDecoration: isLost ? 'line-through' : 'none' }}>{deal.title}</p>

      {/* Labels */}
      {vf.has('labels') && labels.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {labels.map((l, i) => (
            <span key={i} style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 999, backgroundColor: l.color + '22', color: l.color, border: `1px solid ${l.color}44` }}>{l.text}</span>
          ))}
        </div>
      )}

      {/* Contact */}
      {vf.has('contact') && deal.contactName && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
          <User size={11} color="#94a3b8" />
          <span style={{ fontSize: 11, color: '#64748b' }}>{deal.contactName}</span>
        </div>
      )}

      {/* Source */}
      {vf.has('source') && deal.source && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
          <TrendingUp size={11} color="#94a3b8" />
          <span style={{ fontSize: 11, color: '#64748b' }}>{deal.source}</span>
        </div>
      )}

      {/* Assigned to */}
      {vf.has('assignedTo') && deal.assignedTo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
          <Flag size={11} color="#94a3b8" />
          <span style={{ fontSize: 11, color: '#64748b' }}>{deal.assignedTo}</span>
        </div>
      )}

      {/* Value + Probability */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        {vf.has('value') && <span style={{ fontSize: 14, fontWeight: 700, color: isWon ? '#16a34a' : '#0f172a' }}>{fmt(deal.value)}</span>}
        {vf.has('probability') && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, backgroundColor: '#eef2ff', color: '#6366f1', fontWeight: 600 }}>{deal.probability}%</span>}
      </div>

      {/* Checklist */}
      {vf.has('checklist') && checklist.length > 0 && (
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

      {/* Close date */}
      {vf.has('closeDate') && deal.expectedClose && (
        <div style={{ marginTop: 6 }}>
          <span style={{ fontSize: 10, color: overdue && status === 'active' ? '#dc2626' : '#94a3b8', fontWeight: overdue && status === 'active' ? 700 : 400 }}>
            {overdue && status === 'active' ? '⚠ Overdue: ' : '📅 '}{deal.expectedClose}
          </span>
        </div>
      )}

      {/* Bottom row: days in stage + quick actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
        {vf.has('daysInStage') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={10} color={isRotting ? '#ea580c' : '#94a3b8'} />
            <span style={{ fontSize: 10, color: isRotting ? '#ea580c' : '#94a3b8', fontWeight: isRotting ? 700 : 400 }}>{days}d in stage</span>
          </div>
        )}
        {vf.has('quickActions') && (
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }} onClick={e => e.stopPropagation()}>
            {(deal.activity ?? []).length > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#94a3b8' }}>
                <MessageSquare size={10} />{(deal.activity ?? []).length}
              </span>
            )}
            {checklist.length > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: done === checklist.length ? '#22c55e' : '#94a3b8' }}>
                <CheckSquare size={10} />{done}/{checklist.length}
              </span>
            )}
            {deal.description && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#94a3b8' }}>
                <FileText size={10} />
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Manage Fields Modal ───────────────────────────────────────────────────────
interface ManageFieldsProps {
  visible: Set<CardFieldKey>;
  rottingDays: number;
  onChange: (fields: Set<CardFieldKey>) => void;
  onRottingChange: (days: number) => void;
  onClose: () => void;
}
function ManageFieldsModal({ visible, rottingDays, onChange, onRottingChange, onClose }: ManageFieldsProps) {
  const [draft, setDraft] = useState(new Set(visible));
  const [rotting, setRotting] = useState(rottingDays);
  const toggle = (k: CardFieldKey) => setDraft(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const save = () => { onChange(draft); onRottingChange(rotting); onClose(); };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, width: 360, boxShadow: '0 24px 48px -12px rgba(16,24,40,0.25)' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Manage Card Fields</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>Choose which fields appear on deal cards:</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {ALL_CARD_FIELDS.map(f => (
              <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '6px 10px', borderRadius: 8, backgroundColor: draft.has(f.key) ? '#eef2ff' : '#f8fafc', border: `1px solid ${draft.has(f.key) ? '#c7d2fe' : '#e2e8f0'}` }}>
                <input type="checkbox" checked={draft.has(f.key)} onChange={() => toggle(f.key)} style={{ cursor: 'pointer' }} />
                <span style={{ fontSize: 13, fontWeight: draft.has(f.key) ? 600 : 400, color: draft.has(f.key) ? '#4f46e5' : '#374151' }}>{f.label}</span>
              </label>
            ))}
          </div>
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Deal Rotting Threshold
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>days in stage</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="range" min={1} max={60} value={rotting} onChange={e => setRotting(Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#ea580c', minWidth: 36, textAlign: 'right' }}>{rotting}d</span>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 11, color: '#94a3b8' }}>Cards stale longer than {rotting} days get an orange "ROTTING" badge</p>
          </div>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 9, backgroundColor: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151' }}>Cancel</button>
          <button onClick={save} style={{ padding: '8px 16px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Apply</button>
        </div>
      </div>
    </div>
  );
}

// ── Funnel View ───────────────────────────────────────────────────────────────
interface FunnelViewProps {
  stages: Stage[];
  allDeals: Deal[];
}
function FunnelView({ stages, allDeals }: FunnelViewProps) {
  const maxVal = Math.max(...stages.map(s => s.deals.filter(d => (d.status ?? 'active') === 'active').reduce((v, d) => v + d.value, 0)), 1);
  const totalActive = allDeals.filter(d => (d.status ?? 'active') === 'active').length;
  return (
    <div style={{ backgroundColor: 'white', borderRadius: 14, border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: '24px 28px' }}>
      <h3 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Stage Distribution</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {stages.map(stage => {
          const activeDeals = stage.deals.filter(d => (d.status ?? 'active') === 'active');
          const stageVal = activeDeals.reduce((v, d) => v + d.value, 0);
          const pct = totalActive > 0 ? Math.round(activeDeals.length / totalActive * 100) : 0;
          const barW = maxVal > 0 ? (stageVal / maxVal) * 100 : 0;
          const wonCount = stage.deals.filter(d => d.status === 'won').length;
          const lostCount = stage.deals.filter(d => d.status === 'lost').length;
          return (
            <div key={stage.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: stage.color }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>{stage.name}</span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{activeDeals.length} active · {pct}%</span>
                  {wonCount > 0 && <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>+{wonCount} won</span>}
                  {lostCount > 0 && <span style={{ fontSize: 11, color: '#94a3b8' }}>{lostCount} lost</span>}
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{fmt(stageVal)}</span>
              </div>
              <div style={{ height: 28, backgroundColor: '#f1f5f9', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                <div style={{ height: '100%', width: `${barW}%`, backgroundColor: stage.color, borderRadius: 6, transition: 'width 0.4s', opacity: 0.85 }} />
                {activeDeals.length > 0 && (
                  <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 6 }}>
                    {activeDeals.slice(0, 5).map(d => {
                      const ds = daysInStage(d);
                      return (
                        <span key={d.id} style={{ fontSize: 10, backgroundColor: 'rgba(255,255,255,0.9)', padding: '1px 6px', borderRadius: 10, fontWeight: 600, color: ds >= DEFAULT_ROTTING_DAYS ? '#ea580c' : '#374151' }}>
                          {d.title.length > 12 ? d.title.slice(0, 12) + '…' : d.title}
                        </span>
                      );
                    })}
                    {activeDeals.length > 5 && <span style={{ fontSize: 10, backgroundColor: 'rgba(255,255,255,0.9)', padding: '1px 6px', borderRadius: 10, color: '#64748b' }}>+{activeDeals.length - 5}</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {[
          { label: 'Total Stages', value: stages.length },
          { label: 'Active Deals', value: totalActive },
          { label: 'Avg per Stage', value: stages.length > 0 ? (totalActive / stages.length).toFixed(1) : '0' },
        ].map(m => (
          <div key={m.label} style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{m.value}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{m.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Gantt View ────────────────────────────────────────────────────────────────
interface GanttViewProps {
  stages: Stage[];
  allDeals: Deal[];
}
function GanttView({ stages, allDeals }: GanttViewProps) {
  const activeDeals = allDeals.filter(d => (d.status ?? 'active') !== 'lost');
  const today = new Date();

  // Build date range: from earliest createdAt to latest expectedClose (or +90 days)
  let minDate = new Date(today.getFullYear(), today.getMonth(), 1);
  let maxDate = new Date(today.getFullYear(), today.getMonth() + 3, 0);
  for (const d of activeDeals) {
    const start = new Date(d.createdAt);
    if (start < minDate) minDate = start;
    if (d.expectedClose) {
      const end = new Date(d.expectedClose);
      if (end > maxDate) maxDate = end;
    }
  }
  // Pad a bit
  minDate = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  maxDate = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0);

  const totalMs = maxDate.getTime() - minDate.getTime();
  const pct = (date: Date) => Math.max(0, Math.min(100, (date.getTime() - minDate.getTime()) / totalMs * 100));

  // Build month headers
  const months: { label: string; left: number; width: number }[] = [];
  const cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (cur <= maxDate) {
    const monthStart = new Date(cur);
    const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    const left = pct(monthStart);
    const right = pct(monthEnd);
    months.push({ label: monthStart.toLocaleString('default', { month: 'short', year: '2-digit' }), left, width: right - left });
    cur.setMonth(cur.getMonth() + 1);
  }

  const todayPct = pct(today);

  return (
    <div style={{ backgroundColor: 'white', borderRadius: 14, border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
        <CalendarDays size={14} color="#6366f1" />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Timeline / Gantt</span>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>({activeDeals.length} deals)</span>
      </div>

      {activeDeals.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No active deals to display.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 700, padding: '0 20px 20px' }}>
            {/* Month headers */}
            <div style={{ position: 'relative', height: 32, marginBottom: 4, marginLeft: 200 }}>
              {months.map((m, i) => (
                <div key={i} style={{ position: 'absolute', left: `${m.left}%`, width: `${m.width}%`, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#64748b', borderRight: '1px solid #e2e8f0' }}>
                  {m.label}
                </div>
              ))}
              {/* Today line in header */}
              <div style={{ position: 'absolute', left: `${todayPct}%`, top: 0, bottom: 0, width: 2, backgroundColor: '#ef4444', zIndex: 2 }} />
            </div>

            {/* Rows grouped by stage */}
            {stages.map(stage => {
              const stageDeals = stage.deals.filter(d => (d.status ?? 'active') !== 'lost');
              if (stageDeals.length === 0) return null;
              return (
                <div key={stage.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid #f1f5f9' }}>
                    <div style={{ width: 200, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: stage.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{stage.name}</span>
                      <span style={{ fontSize: 10, color: '#94a3b8' }}>({stageDeals.length})</span>
                    </div>
                    <div style={{ flex: 1, position: 'relative', height: 4, backgroundColor: stage.color + '22', borderRadius: 2 }}>
                      {/* Today line */}
                      <div style={{ position: 'absolute', left: `${todayPct}%`, top: -4, bottom: -4, width: 1, backgroundColor: '#ef444440', zIndex: 1 }} />
                    </div>
                  </div>
                  {stageDeals.map(deal => {
                    const start = new Date(deal.createdAt);
                    const end = deal.expectedClose ? new Date(deal.expectedClose) : new Date(today.getTime() + 30 * 86400000);
                    const left = pct(start);
                    const right = pct(end);
                    const width = Math.max(right - left, 2);
                    const isOverdueBar = deal.expectedClose && new Date(deal.expectedClose) < today && (deal.status ?? 'active') === 'active';
                    const days = daysInStage(deal);
                    return (
                      <div key={deal.id} style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                        <div style={{ width: 200, flexShrink: 0, paddingRight: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12, color: '#374151', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={deal.title}>{deal.title}</span>
                          {deal.status === 'won' && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3, backgroundColor: '#dcfce7', color: '#16a34a', flexShrink: 0 }}>WON</span>}
                        </div>
                        <div style={{ flex: 1, position: 'relative', height: 26 }}>
                          {/* Today line */}
                          <div style={{ position: 'absolute', left: `${todayPct}%`, top: 0, bottom: 0, width: 1, backgroundColor: '#ef444440', zIndex: 1 }} />
                          {/* Bar */}
                          <div style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, top: 3, height: 20, borderRadius: 4, backgroundColor: isOverdueBar ? '#fecaca' : (deal.status === 'won' ? '#bbf7d0' : stage.color + 'cc'), border: `1px solid ${isOverdueBar ? '#ef4444' : (deal.status === 'won' ? '#22c55e' : stage.color)}`, display: 'flex', alignItems: 'center', paddingLeft: 6, overflow: 'hidden', cursor: 'pointer', zIndex: 2, transition: 'opacity 0.1s' }}
                            title={`${deal.title} — ${fmt(deal.value)} — ${days}d in stage`}
                          >
                            <span style={{ fontSize: 10, fontWeight: 600, color: 'white', whiteSpace: 'nowrap', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{fmt(deal.value)}</span>
                          </div>
                        </div>
                        <div style={{ width: 60, flexShrink: 0, textAlign: 'right', paddingLeft: 8 }}>
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>{deal.expectedClose || '—'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Today indicator label */}
            <div style={{ position: 'relative', height: 20, marginLeft: 200 }}>
              <div style={{ position: 'absolute', left: `${todayPct}%`, top: 0, transform: 'translateX(-50%)' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', backgroundColor: '#fff', padding: '1px 4px', borderRadius: 3, border: '1px solid #fecaca' }}>Today</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Calendar View ─────────────────────────────────────────────────────────────
interface CalendarViewProps {
  stages: Stage[];
  allDeals: Deal[];
  onOpen: (deal: Deal) => void;
}
function CalendarView({ stages, allDeals, onOpen }: CalendarViewProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = firstDay.getDay(); // 0=Sun

  const monthLabel = firstDay.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Map YYYY-MM-DD → deals
  const dealsByDate = new Map<string, Deal[]>();
  for (const deal of allDeals) {
    if (!deal.expectedClose) continue;
    const d = deal.expectedClose.slice(0, 10);
    const [dy, dm] = d.split('-').map(Number);
    if (dy === year && dm - 1 === month) {
      if (!dealsByDate.has(d)) dealsByDate.set(d, []);
      dealsByDate.get(d)!.push(deal);
    }
  }
  const stageColorMap = new Map(stages.map(s => [s.name, s.color]));

  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return (
    <div style={{ backgroundColor: 'white', borderRadius: 14, border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Calendar size={14} color="#6366f1" />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>{monthLabel}</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => { const d = new Date(year, month - 1); setYear(d.getFullYear()); setMonth(d.getMonth()); }}
            style={{ border: '1px solid #e2e8f0', borderRadius: 6, backgroundColor: 'white', padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#64748b' }}>
            <ChevronLeft size={14} />
          </button>
          <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}
            style={{ border: '1px solid #e2e8f0', borderRadius: 6, backgroundColor: 'white', padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#374151' }}>
            Today
          </button>
          <button onClick={() => { const d = new Date(year, month + 1); setYear(d.getFullYear()); setMonth(d.getMonth()); }}
            style={{ border: '1px solid #e2e8f0', borderRadius: 6, backgroundColor: 'white', padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#64748b' }}>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      {/* Day-of-week headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid #e2e8f0' }}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{d}</div>
        ))}
      </div>
      {/* Weeks */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
        {cells.map((day, idx) => {
          const dateKey = day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
          const dayDeals = day ? (dealsByDate.get(dateKey) ?? []) : [];
          const isToday = dateKey === todayKey;
          const isWeekend = idx % 7 === 0 || idx % 7 === 6;
          return (
            <div key={idx} style={{ minHeight: 90, padding: '6px', borderRight: idx % 7 < 6 ? '1px solid #f1f5f9' : 'none', borderBottom: Math.floor(idx / 7) < Math.floor((cells.length - 1) / 7) ? '1px solid #f1f5f9' : 'none', backgroundColor: day ? (isWeekend ? '#fafafa' : 'white') : '#f8fafc' }}>
              {day && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                    <span style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: isToday ? 700 : 400, backgroundColor: isToday ? '#6366f1' : 'transparent', color: isToday ? 'white' : '#374151' }}>
                      {day}
                    </span>
                  </div>
                  {dayDeals.slice(0, 3).map(deal => {
                    const stageColor = stageColorMap.get(deal.stage) ?? '#6366f1';
                    const st = deal.status ?? 'active';
                    return (
                      <div key={deal.id} onClick={() => onOpen(deal)}
                        style={{ marginBottom: 2, padding: '2px 6px', borderRadius: 4, backgroundColor: st === 'won' ? '#dcfce7' : st === 'lost' ? '#f1f5f9' : stageColor + '22', borderLeft: `3px solid ${st === 'won' ? '#22c55e' : st === 'lost' ? '#94a3b8' : stageColor}`, cursor: 'pointer', overflow: 'hidden' }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: st === 'won' ? '#16a34a' : st === 'lost' ? '#94a3b8' : stageColor, whiteSpace: 'nowrap', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{deal.title}</span>
                      </div>
                    );
                  })}
                  {dayDeals.length > 3 && <span style={{ fontSize: 10, color: '#94a3b8', paddingLeft: 2 }}>+{dayDeals.length - 3} more</span>}
                </>
              )}
            </div>
          );
        })}
      </div>
      {/* Summary */}
      <div style={{ padding: '10px 20px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc', display: 'flex', gap: 16 }}>
        <span style={{ fontSize: 12, color: '#64748b' }}><strong>{[...dealsByDate.values()].reduce((s, a) => s + a.length, 0)}</strong> deals due this month</span>
        <span style={{ fontSize: 12, color: '#dc2626' }}><strong>{allDeals.filter(d => d.expectedClose && new Date(d.expectedClose) < today && (d.status ?? 'active') === 'active').length}</strong> overdue</span>
      </div>
    </div>
  );
}

// ── Brain Panel (AI Assistant) ─────────────────────────────────────────────────
interface BrainPanelProps {
  stages: Stage[];
  allDeals: Deal[];
  onClose: () => void;
}
function BrainPanel({ stages, allDeals, onClose }: BrainPanelProps) {
  const [messages, setMessages] = useState<{ role: 'user' | 'brain'; text: string }[]>([
    { role: 'brain', text: "Hi! I'm Brain. Ask me anything about your pipeline, or pick a suggestion below." },
  ]);
  const [input, setInput] = useState('');

  const activeDeals = allDeals.filter(d => (d.status ?? 'active') === 'active');
  const wonDeals = allDeals.filter(d => d.status === 'won');
  const lostDeals = allDeals.filter(d => d.status === 'lost');
  const overdueDeals = activeDeals.filter(d => d.expectedClose && new Date(d.expectedClose) < new Date());
  const rottingDeals = activeDeals.filter(d => daysInStage(d) >= DEFAULT_ROTTING_DAYS);
  const totalValue = activeDeals.reduce((s, d) => s + d.value, 0);
  const wonValue = wonDeals.reduce((s, d) => s + d.value, 0);
  const closedTotal = wonDeals.length + lostDeals.length;
  const winRate = closedTotal > 0 ? Math.round(wonDeals.length / closedTotal * 100) : 0;

  const SUGGESTIONS = [
    { label: 'Pipeline summary', query: 'Summarize my pipeline' },
    { label: 'Find overdue deals', query: 'Show overdue deals' },
    { label: 'Rotting deals', query: 'Which deals are rotting?' },
    { label: 'Win rate stats', query: 'Show win rate and revenue' },
  ];

  const respond = useCallback((q: string): string => {
    const ql = q.toLowerCase();
    if (ql.includes('overdue')) {
      if (overdueDeals.length === 0) return 'Great news — no overdue deals right now!';
      return `You have **${overdueDeals.length} overdue deal(s)**:\n${overdueDeals.slice(0,5).map(d => `• ${d.title} (was due ${d.expectedClose})`).join('\n')}`;
    }
    if (ql.includes('rotting') || ql.includes('stale')) {
      if (rottingDeals.length === 0) return `No rotting deals — all deals moved within ${DEFAULT_ROTTING_DAYS} days.`;
      return `**${rottingDeals.length} rotting deal(s)** (${DEFAULT_ROTTING_DAYS}+ days without movement):\n${rottingDeals.slice(0,5).map(d => `• ${d.title} — ${daysInStage(d)}d in ${d.stage}`).join('\n')}`;
    }
    if (ql.includes('win rate') || ql.includes('revenue') || ql.includes('won')) {
      return `**Win Rate:** ${winRate}%\n**Won:** ${wonDeals.length} deals (${fmt(wonValue)})\n**Lost:** ${lostDeals.length} deals\n**Active pipeline:** ${fmt(totalValue)}`;
    }
    if (ql.includes('summar') || ql.includes('pipeline') || ql.includes('overview')) {
      const byStage = stages.map(s => `• ${s.name}: ${s.deals.filter(d=>(d.status??'active')==='active').length} deals`).join('\n');
      return `**Pipeline Overview**\n${activeDeals.length} active deals · ${fmt(totalValue)} total value\nWin rate: ${winRate}%\n\nBy stage:\n${byStage}`;
    }
    if (ql.includes('value') || ql.includes('weighted')) {
      const weighted = activeDeals.reduce((s,d)=>s+Math.round(d.value*d.probability/100),0);
      return `**Active pipeline value:** ${fmt(totalValue)}\n**Weighted (by probability):** ${fmt(weighted)}\n**Won revenue:** ${fmt(wonValue)}`;
    }
    return `I found **${activeDeals.length} active deals** worth **${fmt(totalValue)}**.\n\nTry asking:\n• "Show overdue deals"\n• "Which deals are rotting?"\n• "What is my win rate?"`;
  }, [activeDeals, wonDeals, lostDeals, overdueDeals, rottingDeals, stages, totalValue, wonValue, winRate]);

  const send = (text: string) => {
    if (!text.trim()) return;
    const userMsg = { role: 'user' as const, text: text.trim() };
    const brainMsg = { role: 'brain' as const, text: respond(text.trim()) };
    setMessages(prev => [...prev, userMsg, brainMsg]);
    setInput('');
  };

  return (
    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 450, display: 'flex', backgroundColor: 'rgba(15,23,42,0.3)' }} onClick={onClose}>
      <div style={{ marginLeft: 'auto', width: 400, height: '100%', backgroundColor: 'white', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 48px rgba(0,0,0,0.16)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: 'linear-gradient(135deg, #7c3aed, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Brain size={18} color="white" />
            <span style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>ClickUp Brain</span>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', display: 'flex' }}><X size={18} /></button>
        </div>

        {/* Suggestions */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#fafafa' }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Suggestions</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SUGGESTIONS.map(s => (
              <button key={s.label} onClick={() => send(s.query)}
                style={{ padding: '5px 10px', borderRadius: 20, border: '1px solid #c7d2fe', backgroundColor: '#eef2ff', color: '#4f46e5', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
              {msg.role === 'brain' && (
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #7c3aed, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Sparkles size={12} color="white" />
                </div>
              )}
              <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px', backgroundColor: msg.role === 'user' ? '#6366f1' : '#f8fafc', border: msg.role === 'user' ? 'none' : '1px solid #e2e8f0' }}>
                {msg.text.split('\n').map((line, li) => (
                  <p key={li} style={{ margin: li > 0 ? '4px 0 0' : 0, fontSize: 13, color: msg.role === 'user' ? 'white' : '#374151', lineHeight: 1.5 }}>
                    {line.startsWith('**') && line.endsWith('**')
                      ? <strong>{line.slice(2, -2)}</strong>
                      : line.replace(/\*\*(.*?)\*\*/g, '$1')}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8 }}>
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask anything about your deals..."
            style={{ flex: 1, padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
            onKeyDown={e => e.key === 'Enter' && send(input)} />
          <button onClick={() => send(input)} disabled={!input.trim()}
            style={{ padding: '9px 14px', backgroundColor: input.trim() ? '#6366f1' : '#e2e8f0', color: input.trim() ? 'white' : '#94a3b8', border: 'none', borderRadius: 8, cursor: input.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center' }}>
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Grouped List View (ClickUp-style) ─────────────────────────────────────────
interface GroupedListViewProps {
  stages: Stage[];
  applyFilter: (deals: Deal[]) => Deal[];
  onOpen: (deal: Deal) => void;
  onEdit: (deal: Deal) => void;
  onDelete: (deal: Deal) => void;
  onQuickAdd: (stageId: string, title: string) => void;
}

function GroupedListView({ stages, applyFilter, onOpen, onEdit, onDelete, onQuickAdd }: GroupedListViewProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [quickAddStage, setQuickAddStage] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState('');

  const toggleCollapse = (stageId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(stageId) ? next.delete(stageId) : next.add(stageId);
      return next;
    });
  };

  const commitQuickAdd = (stageId: string) => {
    if (quickTitle.trim()) { onQuickAdd(stageId, quickTitle.trim()); }
    setQuickTitle('');
    setQuickAddStage(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, backgroundColor: 'white', borderRadius: 14, border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', overflow: 'hidden' }}>
      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 120px 110px 100px 80px', gap: 0, padding: '8px 16px 8px 44px', borderBottom: '2px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
        {['Task name', 'Assignee', 'Due date', 'Priority', 'Value', ''].map(h => (
          <span key={h} style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{h}</span>
        ))}
      </div>

      {stages.map(stage => {
        const deals = applyFilter(stage.deals);
        const isCollapsed = collapsed.has(stage.id);
        const stageValue = deals.reduce((v, d) => v + d.value, 0);

        return (
          <div key={stage.id}>
            {/* Stage group header — ClickUp-style solid color pill */}
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer', backgroundColor: '#fafafa', borderBottom: '1px solid #e2e8f0', borderLeft: `4px solid ${stage.color}` }}
              onClick={() => toggleCollapse(stage.id)}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, color: '#94a3b8' }}>
                {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              </div>
              {/* Solid color status pill */}
              <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 14px', borderRadius: 20, backgroundColor: stage.color, color: 'white', letterSpacing: '0.5px', textTransform: 'uppercase', userSelect: 'none' }}>
                {stage.name}
              </span>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>{deals.length}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginLeft: 'auto' }}>{fmt(stageValue)}</span>
            </div>

            {/* Deal rows */}
            {!isCollapsed && (
              <>
                {deals.map((deal, i) => {
                  const p = (deal.priority ?? 'normal') as Priority;
                  const pc = PRIORITY[p];
                  const st = deal.status ?? 'active';
                  const cl = deal.checklist ?? [];
                  const dn = cl.filter(c => c.done).length;
                  return (
                    <div key={deal.id}
                      onClick={() => onOpen(deal)}
                      style={{ display: 'grid', gridTemplateColumns: '1fr 140px 120px 110px 100px 80px', alignItems: 'center', gap: 0, padding: '9px 16px 9px 44px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', opacity: st === 'lost' ? 0.6 : 1, transition: 'background 0.1s', backgroundColor: 'white' }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'white'; }}>

                      {/* Name column */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${st === 'won' ? '#22c55e' : st === 'lost' ? '#94a3b8' : stage.color}`, backgroundColor: st === 'won' ? '#22c55e' : st === 'lost' ? '#94a3b8' : 'transparent', flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: st === 'lost' ? '#94a3b8' : '#0f172a', textDecoration: st === 'lost' ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {deal.title}
                        </span>
                        {deal.contactName && (
                          <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>
                            · {deal.contactName}
                          </span>
                        )}
                        {(deal.labels ?? []).slice(0, 2).map((l, li) => (
                          <span key={li} style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 999, backgroundColor: l.color + '22', color: l.color, flexShrink: 0 }}>{l.text}</span>
                        ))}
                        {cl.length > 0 && (
                          <span style={{ fontSize: 10, color: dn === cl.length ? '#22c55e' : '#94a3b8', fontWeight: 600, flexShrink: 0 }}>✓ {dn}/{cl.length}</span>
                        )}
                      </div>

                      {/* Assignee */}
                      <div>
                        {deal.assignedTo ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: 'white' }}>{deal.assignedTo.slice(0, 2).toUpperCase()}</span>
                            </div>
                            <span style={{ fontSize: 11, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>{deal.assignedTo}</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: '#d1d5db' }}>—</span>
                        )}
                      </div>

                      {/* Due date */}
                      <div>
                        {deal.expectedClose ? (
                          <span style={{ fontSize: 12, fontWeight: 600, color: isOverdue(deal.expectedClose) && st === 'active' ? '#dc2626' : '#64748b', backgroundColor: isOverdue(deal.expectedClose) && st === 'active' ? '#fef2f2' : '#f8fafc', padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                            {isOverdue(deal.expectedClose) && st === 'active' && '⚠ '}{deal.expectedClose}
                          </span>
                        ) : <span style={{ fontSize: 11, color: '#d1d5db' }}>—</span>}
                      </div>

                      {/* Priority */}
                      <div>
                        {st === 'won' ? (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, backgroundColor: '#dcfce7', color: '#16a34a' }}>WON</span>
                        ) : st === 'lost' ? (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, backgroundColor: '#f1f5f9', color: '#94a3b8' }}>LOST</span>
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, backgroundColor: pc.bg, color: pc.color, border: `1px solid ${pc.color}30` }}>
                            <Flag size={9} style={{ display: 'inline', marginRight: 3 }} />{pc.label}
                          </span>
                        )}
                      </div>

                      {/* Value */}
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: st === 'won' ? '#16a34a' : '#0f172a' }}>{fmt(deal.value)}</span>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => onEdit(deal)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 5, borderRadius: 5, color: '#94a3b8', display: 'flex' }}><Edit2 size={12} /></button>
                        <button onClick={() => onDelete(deal)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 5, borderRadius: 5, color: '#94a3b8', display: 'flex' }}><Trash2 size={12} /></button>
                      </div>
                    </div>
                  );
                })}

                {deals.length === 0 && (
                  <div style={{ padding: '16px 44px', fontSize: 12, color: '#94a3b8', fontStyle: 'italic', borderBottom: '1px solid #f1f5f9' }}>
                    No deals in this stage
                  </div>
                )}

                {/* Quick add row */}
                {quickAddStage === stage.id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px 8px 44px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#fafffe' }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${stage.color}`, flexShrink: 0 }} />
                    <input
                      autoFocus
                      value={quickTitle}
                      onChange={e => setQuickTitle(e.target.value)}
                      placeholder="Task name..."
                      style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, fontFamily: 'inherit', color: '#0f172a', backgroundColor: 'transparent' }}
                      onKeyDown={e => { if (e.key === 'Enter') commitQuickAdd(stage.id); if (e.key === 'Escape') { setQuickTitle(''); setQuickAddStage(null); } }}
                      onBlur={() => { if (quickTitle.trim()) commitQuickAdd(stage.id); else { setQuickTitle(''); setQuickAddStage(null); } }}
                    />
                    <button onClick={() => commitQuickAdd(stage.id)} style={{ padding: '4px 10px', backgroundColor: stage.color, color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add</button>
                    <button onClick={() => { setQuickTitle(''); setQuickAddStage(null); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={13} /></button>
                  </div>
                ) : (
                  <div
                    style={{ padding: '7px 16px 7px 44px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#94a3b8' }}
                    onClick={() => { setQuickAddStage(stage.id); setQuickTitle(''); }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.color = stage.color; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#94a3b8'; }}>
                    <Plus size={12} />
                    <span style={{ fontSize: 12, fontWeight: 500 }}>Add task</span>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Stage Column Header ───────────────────────────────────────────────────────
interface StageHeaderProps {
  stage: Stage;
  index: number;
  total: number;
  wipLimit?: number;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: 'left' | 'right') => void;
  onSetWip: (id: string, limit: number) => void;
}

function StageHeader({ stage, index, total, wipLimit, onRename, onRecolor, onDelete, onMove, onSetWip }: StageHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(stage.name);
  const [showMenu, setShowMenu] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showWipInput, setShowWipInput] = useState(false);
  const [wipDraft, setWipDraft] = useState(String(wipLimit ?? ''));

  const commitRename = () => {
    if (draft.trim() && draft.trim() !== stage.name) onRename(stage.id, draft.trim());
    setEditing(false);
  };

  const stageValue = stage.deals.reduce((v, d) => v + d.value, 0);
  const overWip = wipLimit != null && wipLimit > 0 && stage.deals.length > wipLimit;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 6px 12px', marginBottom: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: stage.color, flexShrink: 0 }} />
          {editing ? (
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setDraft(stage.name); setEditing(false); } }}
              autoFocus
              style={{ fontSize: 13, fontWeight: 600, border: '1px solid #6366f1', borderRadius: 7, padding: '2px 8px', outline: 'none', width: '100%', fontFamily: 'inherit', color: '#0f172a' }}
            />
          ) : (
            <span
              style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.1px', cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onDoubleClick={() => { setDraft(stage.name); setEditing(true); }}
              title="Double-click to rename"
            >
              {stage.name}
            </span>
          )}
          <span
            title={overWip ? `Over WIP limit (${wipLimit})` : wipLimit ? `WIP limit: ${wipLimit}` : undefined}
            style={{
              fontSize: 11, fontWeight: 700, flexShrink: 0, borderRadius: 999, padding: '1px 8px',
              color: overWip ? '#dc2626' : '#64748b',
              backgroundColor: overWip ? '#fef2f2' : 'white',
              border: `1px solid ${overWip ? '#fecaca' : '#e6e9f0'}`,
              boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
            }}>
            {stage.deals.length}{wipLimit ? `/${wipLimit}` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>{fmt(stageValue)}</span>
          <button onClick={() => { setShowMenu(prev => !prev); setShowPalette(false); }}
            style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 3, borderRadius: 6, color: '#94a3b8', display: 'flex' }}>
            <MoreVertical size={13} />
          </button>
        </div>
      </div>

      {/* Context menu */}
      {showMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 290 }} onClick={() => { setShowMenu(false); setShowPalette(false); }} />
          <div style={{ position: 'absolute', top: 34, right: 0, zIndex: 300, backgroundColor: 'white', border: '1px solid #e6e9f0', borderRadius: 12, boxShadow: '0 12px 32px rgba(16,24,40,0.12)', minWidth: 160, overflow: 'hidden' }}>
            <button onClick={() => { setDraft(stage.name); setEditing(true); setShowMenu(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: 'none', background: 'none', fontSize: 13, color: '#374151', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
              <Edit2 size={13} /> Rename
            </button>
            <button onClick={() => { setShowPalette(prev => !prev); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: 'none', background: 'none', fontSize: 13, color: '#374151', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
              <span style={{ width: 13, height: 13, borderRadius: '50%', backgroundColor: stage.color, display: 'inline-block', flexShrink: 0 }} /> Color
            </button>
            {showPalette && (
              <div style={{ padding: '6px 14px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {STAGE_COLORS.map(c => (
                  <button key={c} onClick={() => { onRecolor(stage.id, c); setShowMenu(false); setShowPalette(false); }}
                    style={{ width: 20, height: 20, borderRadius: '50%', backgroundColor: c, border: c === stage.color ? '2px solid #0f172a' : '2px solid transparent', cursor: 'pointer' }} />
                ))}
              </div>
            )}
            <button onClick={() => { setWipDraft(String(wipLimit ?? '')); setShowWipInput(prev => !prev); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: 'none', background: 'none', fontSize: 13, color: '#374151', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
              <Gauge size={13} /> WIP Limit{wipLimit ? ` (${wipLimit})` : ''}
            </button>
            {showWipInput && (
              <div style={{ padding: '2px 14px 10px', display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="number" min={0} max={99} value={wipDraft} autoFocus
                  onChange={e => setWipDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { onSetWip(stage.id, Number(wipDraft) || 0); setShowMenu(false); setShowWipInput(false); } }}
                  placeholder="0 = off"
                  style={{ width: 70, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
                <button onClick={() => { onSetWip(stage.id, Number(wipDraft) || 0); setShowMenu(false); setShowWipInput(false); }}
                  style={{ padding: '5px 10px', border: 'none', borderRadius: 7, background: '#6366f1', color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Set</button>
              </div>
            )}
            {index > 0 && (
              <button onClick={() => { onMove(stage.id, 'left'); setShowMenu(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: 'none', background: 'none', fontSize: 13, color: '#374151', cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
                <ChevronLeft size={13} /> Move Left
              </button>
            )}
            {index < total - 1 && (
              <button onClick={() => { onMove(stage.id, 'right'); setShowMenu(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: 'none', background: 'none', fontSize: 13, color: '#374151', cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
                <ChevronRight size={13} /> Move Right
              </button>
            )}
            <div style={{ height: 1, backgroundColor: '#f1f5f9', margin: '4px 0' }} />
            <button onClick={() => { onDelete(stage.id); setShowMenu(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: 'none', background: 'none', fontSize: 13, color: '#dc2626', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fef2f2'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
              <Trash2 size={13} /> Delete Stage
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Quick Add Deal inline ─────────────────────────────────────────────────────
interface QuickAddProps {
  onAdd: (title: string) => void;
}
function QuickAddDeal({ onAdd }: QuickAddProps) {
  const [active, setActive] = useState(false);
  const [title, setTitle] = useState('');

  const commit = () => {
    if (title.trim()) { onAdd(title.trim()); setTitle(''); }
    setActive(false);
  };

  if (!active) return (
    <button onClick={() => setActive(true)}
      style={{ width: '100%', marginTop: 6, padding: '9px', border: '2px dashed #e2e8f0', borderRadius: 10, backgroundColor: 'transparent', color: '#94a3b8', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'all 0.1s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.color = '#6366f1'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#94a3b8'; }}>
      <Plus size={13} /> Add Deal
    </button>
  );

  return (
    <div style={{ marginTop: 6, padding: '10px', backgroundColor: 'white', border: '1px solid #6366f1', borderRadius: 10 }}>
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Deal title..."
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setTitle(''); setActive(false); } }}
        style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', marginBottom: 6, boxSizing: 'border-box', fontFamily: 'inherit' }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={commit} style={{ flex: 1, padding: '6px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add</button>
        <button onClick={() => { setTitle(''); setActive(false); }} style={{ flex: 1, padding: '6px', backgroundColor: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  );
}

// ── Pipeline Manage Modal ─────────────────────────────────────────────────────
interface PipelineManageProps {
  pipelines: { id: string; name: string }[];
  selectedId: string;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function PipelineManageModal({ pipelines, selectedId, onCreate, onRename, onDelete, onSelect, onClose }: PipelineManageProps) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const commitRename = (id: string) => {
    if (editDraft.trim()) onRename(id, editDraft.trim());
    setEditingId(null);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, width: '100%', maxWidth: 460, boxShadow: '0 24px 48px -12px rgba(16,24,40,0.25)' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>Manage Pipelines</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={20} /></button>
        </div>

        <div style={{ padding: '18px 22px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {pipelines.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, border: `1px solid ${p.id === selectedId ? '#6366f1' : '#e2e8f0'}`, backgroundColor: p.id === selectedId ? '#eef2ff' : 'white' }}>
                {editingId === p.id ? (
                  <input
                    value={editDraft}
                    onChange={e => setEditDraft(e.target.value)}
                    onBlur={() => commitRename(p.id)}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(p.id); if (e.key === 'Escape') setEditingId(null); }}
                    autoFocus
                    style={{ flex: 1, fontSize: 14, border: '1px solid #6366f1', borderRadius: 6, padding: '4px 8px', outline: 'none', fontFamily: 'inherit' }}
                  />
                ) : (
                  <span
                    style={{ flex: 1, fontSize: 14, fontWeight: p.id === selectedId ? 700 : 500, color: p.id === selectedId ? '#4f46e5' : '#374151', cursor: 'pointer' }}
                    onClick={() => { onSelect(p.id); onClose(); }}
                  >
                    {p.name}
                  </span>
                )}
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => { setEditingId(p.id); setEditDraft(p.name); }}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 5, borderRadius: 5, color: '#94a3b8', display: 'flex' }}>
                    <Edit2 size={13} />
                  </button>
                  {pipelines.length > 1 && (
                    <button onClick={() => { if (window.confirm(`Delete pipeline "${p.name}"?`)) onDelete(p.id); }}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 5, borderRadius: 5, color: '#94a3b8', display: 'flex' }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New pipeline name..."
              style={{ flex: 1, padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
              onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) { onCreate(newName.trim()); setNewName(''); } }} />
            <button onClick={() => { if (newName.trim()) { onCreate(newName.trim()); setNewName(''); } }}
              disabled={!newName.trim()}
              style={{ padding: '9px 16px', backgroundColor: newName.trim() ? '#6366f1' : '#c7d2fe', color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: newName.trim() ? 'pointer' : 'default' }}>
              Create
            </button>
          </div>
        </div>
      </div>
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
  const [status, setStatus] = useState<'active' | 'won' | 'lost'>((deal?.status ?? 'active') as 'active' | 'won' | 'lost');
  const [source, setSource] = useState(deal?.source ?? '');

  const toggleLabel = (label: { color: string; text: string }) => {
    setLabels(prev => prev.some(l => l.text === label.text) ? prev.filter(l => l.text !== label.text) : [...prev, label]);
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
      status,
      source,
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 48px -12px rgba(16,24,40,0.25)' }} onClick={e => e.stopPropagation()}>
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
              <label style={lbl}>Source</label>
              <select value={source} onChange={e => setSource(e.target.value)} style={{ ...inp }}>
                <option value="">Select source...</option>
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Assigned To</label>
              <input value={assignedTo} onChange={e => setAssignedTo(e.target.value)} placeholder="Name or email" style={inp} />
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
            <label style={lbl}>Status</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {([['active', '#6366f1', 'Active'], ['won', '#22c55e', '🏆 Won'], ['lost', '#94a3b8', 'Lost']] as const).map(([s, c, l]) => (
                <button key={s} onClick={() => setStatus(s)}
                  style={{ flex: 1, padding: '7px 4px', border: `2px solid ${status === s ? c : '#e2e8f0'}`, borderRadius: 8, backgroundColor: status === s ? c + '22' : 'white', color: status === s ? c : '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {l}
                </button>
              ))}
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

          <div>
            <label style={lbl}>Expected Close</label>
            <input type="date" value={expectedClose} onChange={e => setExpectedClose(e.target.value)} style={inp} />
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
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, backgroundColor: l.color + '22', color: l.color, fontSize: 11, fontWeight: 600 }}>
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
                  <button onClick={() => setChecklist(prev => prev.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 2 }}><X size={12} /></button>
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
          <button onClick={onClose} style={{ padding: '9px 20px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', backgroundColor: 'white', color: '#374151' }}>Cancel</button>
          <button onClick={handleSave} disabled={!title.trim()}
            style={{ padding: '9px 20px', backgroundColor: title.trim() ? '#6366f1' : '#c7d2fe', color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: title.trim() ? 'pointer' : 'default' }}>
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
  stages: Stage[];
  onClose: () => void;
  onEdit: (deal: Deal) => void;
  onUpdateDeal: (dealId: string, updates: Partial<Deal>) => void;
  onMoveDealToStage: (dealId: string, fromStageId: string, toStageId: string) => void;
}

function DealDetailPanel({ deal, stages, onClose, onEdit, onUpdateDeal, onMoveDealToStage }: DealDetailPanelProps) {
  const [section, setSection] = useState<'subtasks' | 'checklist' | null>(null);
  const [newActivity, setNewActivity] = useState('');
  const [newCheckItem, setNewCheckItem] = useState('');
  const [showLostModal, setShowLostModal] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [newSubtask, setNewSubtask] = useState('');
  const [showTimeLog, setShowTimeLog] = useState(false);
  const [timeInput, setTimeInput] = useState('');

  const p = (deal.priority ?? 'normal') as Priority;
  const pc = PRIORITY[p];
  const checklist = deal.checklist ?? [];
  const activity = deal.activity ?? [];
  const labels = deal.labels ?? [];
  const subtasks = deal.subtasks ?? [];
  const done = checklist.filter(c => c.done).length;
  const subtasksDone = subtasks.filter(s => s.done).length;
  const status = deal.status ?? 'active';
  const timeTracked = deal.timeTracked ?? 0;

  const currentStageIdx = stages.findIndex(s => s.name === deal.stage);
  const prevStage = currentStageIdx > 0 ? stages[currentStageIdx - 1] : null;
  const nextStage = currentStageIdx < stages.length - 1 ? stages[currentStageIdx + 1] : null;
  const currentStage = stages[currentStageIdx];

  const moveToStage = (targetStage: Stage) => {
    if (!currentStage) return;
    onMoveDealToStage(deal.id, currentStage.id, targetStage.id);
    onUpdateDeal(deal.id, { stage: targetStage.name });
  };

  const markWon = () => {
    onUpdateDeal(deal.id, { status: 'won', closedAt: new Date().toISOString(), probability: 100 });
  };

  const confirmLost = () => {
    onUpdateDeal(deal.id, { status: 'lost', lostReason: lostReason.trim() || undefined, closedAt: new Date().toISOString(), probability: 0 });
    setShowLostModal(false);
  };

  const reactivate = () => {
    onUpdateDeal(deal.id, { status: 'active', closedAt: undefined, lostReason: undefined });
  };

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

  const addSubtask = () => {
    if (!newSubtask.trim()) return;
    const item: SubTask = { id: `st-${Date.now()}`, title: newSubtask.trim(), done: false, createdAt: new Date().toISOString() };
    onUpdateDeal(deal.id, { subtasks: [...subtasks, item] });
    setNewSubtask('');
  };

  const toggleSubtask = (id: string) => {
    onUpdateDeal(deal.id, { subtasks: subtasks.map(s => s.id === id ? { ...s, done: !s.done } : s) });
  };

  const removeSubtask = (id: string) => {
    onUpdateDeal(deal.id, { subtasks: subtasks.filter(s => s.id !== id) });
  };

  const logTime = () => {
    const mins = parseFloat(timeInput);
    if (isNaN(mins) || mins <= 0) return;
    onUpdateDeal(deal.id, { timeTracked: timeTracked + Math.round(mins * 60) });
    setTimeInput('');
    setShowTimeLog(false);
  };

  const fmtTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  };

  const fieldRow = (label: string, value: string, danger?: boolean) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500, minWidth: 110, paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: danger ? '#dc2626' : '#0f172a', flex: 1 }}>{value}</span>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', padding: '16px' }} onClick={onClose}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, width: '100%', maxWidth: 940, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px -12px rgba(16,24,40,0.25)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>

        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#fafafa', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8' }}>
            <span>Pipeline</span>
            <ChevronRight size={12} />
            <span style={{ color: '#64748b' }}>{deal.stage}</span>
            <ChevronRight size={12} />
            <span style={{ color: '#374151', fontWeight: 600 }}>{deal.title}</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {status === 'won' && <button onClick={reactivate} style={{ fontSize: 11, color: '#16a34a', background: 'none', border: '1px solid #16a34a', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>Reactivate</button>}
            {status === 'lost' && <button onClick={reactivate} style={{ fontSize: 11, color: '#6366f1', background: 'none', border: '1px solid #6366f1', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>Reactivate</button>}
            <button onClick={() => onEdit(deal)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 7, backgroundColor: 'white', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><Edit2 size={12} /> Edit</button>
            <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 4 }}><X size={18} /></button>
          </div>
        </div>

        {/* Two-column body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

          {/* LEFT: Fields + content */}
          <div style={{ flex: '0 0 55%', borderRight: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ padding: '20px 24px' }}>

              {/* Title + status banners */}
              {status === 'won' && <div style={{ padding: '6px 12px', borderRadius: 8, backgroundColor: '#dcfce7', color: '#16a34a', fontSize: 12, fontWeight: 700, marginBottom: 12 }}>🏆 Deal Won!</div>}
              {status === 'lost' && <div style={{ padding: '6px 12px', borderRadius: 8, backgroundColor: '#f1f5f9', color: '#94a3b8', fontSize: 12, fontWeight: 600, marginBottom: 12 }}>Deal Lost{deal.lostReason ? ` — ${deal.lostReason}` : ''}</div>}

              <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: '#0f172a', lineHeight: 1.3, textDecoration: status === 'lost' ? 'line-through' : 'none' }}>{deal.title}</h2>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>{deal.contactName && <>{deal.contactName} · </>}{deal.stage}</p>

              {/* Stage breadcrumb */}
              {status === 'active' && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16 }}>
                  {stages.map((s, i) => (
                    <button key={s.id} onClick={() => currentStage && s.id !== currentStage.id && moveToStage(s)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, border: 'none', cursor: s.id === currentStage?.id ? 'default' : 'pointer', flexShrink: 0, fontSize: 11, fontWeight: 700,
                        backgroundColor: s.id === currentStage?.id ? s.color : s.color + '18', color: s.id === currentStage?.id ? 'white' : s.color }}>
                      {i < (currentStageIdx ?? 0) && <Check size={9} />}{s.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Won / Lost actions */}
              {status === 'active' && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                  <button onClick={() => prevStage && moveToStage(prevStage)} disabled={!prevStage}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 9, backgroundColor: 'white', color: prevStage ? '#374151' : '#d1d5db', fontSize: 12, fontWeight: 600, cursor: prevStage ? 'pointer' : 'default' }}>
                    <ChevronLeft size={12} /> {prevStage?.name ?? 'Prev'}
                  </button>
                  <button onClick={() => nextStage && moveToStage(nextStage)} disabled={!nextStage}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 9, backgroundColor: 'white', color: nextStage ? '#374151' : '#d1d5db', fontSize: 12, fontWeight: 600, cursor: nextStage ? 'pointer' : 'default' }}>
                    {nextStage?.name ?? 'Next'} <ChevronRight size={12} />
                  </button>
                  <div style={{ flex: 1 }} />
                  <button onClick={markWon} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px', border: 'none', borderRadius: 8, backgroundColor: '#dcfce7', color: '#16a34a', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}><Trophy size={12} /> Won</button>
                  <button onClick={() => setShowLostModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px', border: 'none', borderRadius: 8, backgroundColor: '#f1f5f9', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}><ThumbsDown size={12} /> Lost</button>
                </div>
              )}

              {/* Fields */}
              <div style={{ marginBottom: 20 }}>
                {fieldRow('Status', status === 'won' ? '🏆 Won' : status === 'lost' ? 'Lost' : 'Active')}
                {fieldRow('Stage', deal.stage)}
                {fieldRow('Value', fmt(deal.value))}
                {fieldRow('Weighted', fmt(Math.round(deal.value * deal.probability / 100)))}
                {fieldRow('Probability', `${deal.probability}%`)}
                {fieldRow('Close Date', deal.expectedClose || '—', isOverdue(deal.expectedClose) && status === 'active')}
                {fieldRow('Priority', pc.label)}
                {fieldRow('Assigned To', deal.assignedTo || '—')}
                {deal.source && fieldRow('Source', deal.source)}
                {fieldRow('Days in Stage', `${daysInStage(deal)}d`)}
                {fieldRow('Created', new Date(deal.createdAt).toLocaleDateString())}
                {deal.lostReason && fieldRow('Lost Reason', deal.lostReason)}
              </div>

              {/* Win Probability bar */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Win Probability</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#6366f1' }}>{deal.probability}%</span>
                </div>
                <div style={{ height: 8, backgroundColor: '#e2e8f0', borderRadius: 4 }}>
                  <div style={{ height: '100%', width: `${deal.probability}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', borderRadius: 4, transition: 'width 0.3s' }} />
                </div>
              </div>

              {/* Time tracking */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'flex', alignItems: 'center', gap: 5 }}><Timer size={13} /> Track Time</span>
                  <button onClick={() => setShowTimeLog(p => !p)} style={{ fontSize: 11, color: '#6366f1', background: 'none', border: '1px solid #c7d2fe', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>+ Log</button>
                </div>
                <div style={{ padding: '10px 14px', backgroundColor: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, fontWeight: 700, color: timeTracked > 0 ? '#0f172a' : '#94a3b8' }}>
                  {timeTracked > 0 ? fmtTime(timeTracked) : '— Not tracked'}
                </div>
                {showTimeLog && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <input value={timeInput} onChange={e => setTimeInput(e.target.value)} placeholder="Hours (e.g. 1.5)" autoFocus
                      style={{ flex: 1, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                      onKeyDown={e => e.key === 'Enter' && logTime()} />
                    <button onClick={logTime} style={{ padding: '8px 14px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add</button>
                  </div>
                )}
              </div>

              {/* Description */}
              {deal.description && (
                <div style={{ marginBottom: 20 }}>
                  <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: '#374151' }}>Description</p>
                  <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.6, backgroundColor: '#f8fafc', padding: '12px 14px', borderRadius: 8, border: '1px solid #e2e8f0' }}>{deal.description}</p>
                </div>
              )}

              {/* Labels */}
              {labels.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#374151' }}>Labels</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {labels.map((l, i) => <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, backgroundColor: l.color + '22', color: l.color, border: `1px solid ${l.color}44` }}>{l.text}</span>)}
                  </div>
                </div>
              )}

              {/* Subtasks */}
              <div style={{ marginBottom: 20 }}>
                <button onClick={() => setSection(s => s === 'subtasks' ? null : 'subtasks')}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer', borderTop: '1px solid #f1f5f9', textAlign: 'left' }}>
                  <GitBranch size={13} color="#6366f1" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#374151', flex: 1 }}>Subtasks {subtasks.length > 0 && <span style={{ color: '#94a3b8', fontWeight: 400 }}>({subtasksDone}/{subtasks.length})</span>}</span>
                  {section === 'subtasks' ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
                </button>
                {section === 'subtasks' && (
                  <div style={{ paddingTop: 8 }}>
                    {subtasks.map(st => (
                      <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', marginBottom: 4, backgroundColor: st.done ? '#f0fdf4' : '#f8fafc', borderRadius: 7, border: `1px solid ${st.done ? '#bbf7d0' : '#e2e8f0'}` }}>
                        <input type="checkbox" checked={st.done} onChange={() => toggleSubtask(st.id)} style={{ cursor: 'pointer' }} />
                        <span style={{ flex: 1, fontSize: 13, color: st.done ? '#94a3b8' : '#374151', textDecoration: st.done ? 'line-through' : 'none' }}>{st.title}</span>
                        <button onClick={() => removeSubtask(st.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 2 }}><X size={11} /></button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <input value={newSubtask} onChange={e => setNewSubtask(e.target.value)} placeholder="Add subtask..."
                        style={{ flex: 1, padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
                        onKeyDown={e => e.key === 'Enter' && addSubtask()} />
                      <button onClick={addSubtask} style={{ padding: '7px 14px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Checklist */}
              <div style={{ marginBottom: 20 }}>
                <button onClick={() => setSection(s => s === 'checklist' ? null : 'checklist')}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer', borderTop: '1px solid #f1f5f9', textAlign: 'left' }}>
                  <CheckSquare size={13} color="#6366f1" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#374151', flex: 1 }}>Checklist {checklist.length > 0 && <span style={{ color: '#94a3b8', fontWeight: 400 }}>({done}/{checklist.length})</span>}</span>
                  {section === 'checklist' ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
                </button>
                {section === 'checklist' && (
                  <div style={{ paddingTop: 8 }}>
                    {checklist.length > 0 && (
                      <div style={{ height: 5, backgroundColor: '#e2e8f0', borderRadius: 3, marginBottom: 10 }}>
                        <div style={{ height: '100%', width: `${(done / checklist.length) * 100}%`, backgroundColor: done === checklist.length ? '#22c55e' : '#6366f1', borderRadius: 3, transition: 'width 0.3s' }} />
                      </div>
                    )}
                    {checklist.map(item => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', marginBottom: 4, backgroundColor: item.done ? '#f0fdf4' : '#f8fafc', borderRadius: 7, border: `1px solid ${item.done ? '#bbf7d0' : '#e2e8f0'}` }}>
                        <input type="checkbox" checked={item.done} onChange={() => toggleCheck(item.id)} style={{ cursor: 'pointer' }} />
                        <span style={{ flex: 1, fontSize: 13, color: item.done ? '#94a3b8' : '#374151', textDecoration: item.done ? 'line-through' : 'none' }}>{item.text}</span>
                        <button onClick={() => removeCheck(item.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 2 }}><X size={11} /></button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <input value={newCheckItem} onChange={e => setNewCheckItem(e.target.value)} placeholder="Add checklist item..."
                        style={{ flex: 1, padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
                        onKeyDown={e => e.key === 'Enter' && addCheck()} />
                      <button onClick={addCheck} style={{ padding: '7px 14px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: Activity feed */}
          <div style={{ flex: '0 0 45%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'flex', alignItems: 'center', gap: 5 }}><MessageSquare size={14} color="#6366f1" /> Activity {activity.length > 0 && <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 12 }}>({activity.length})</span>}</span>
            </div>
            {/* Compose */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <User size={13} color="white" />
              </div>
              <div style={{ flex: 1 }}>
                <input value={newActivity} onChange={e => setNewActivity(e.target.value)} placeholder="Write a note, comment, or update..."
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 6 }}
                  onKeyDown={e => e.key === 'Enter' && addActivity()} />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={addActivity} disabled={!newActivity.trim()}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', backgroundColor: newActivity.trim() ? '#6366f1' : '#e2e8f0', color: newActivity.trim() ? 'white' : '#94a3b8', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: newActivity.trim() ? 'pointer' : 'default' }}>
                    <Send size={12} /> Post
                  </button>
                </div>
              </div>
            </div>
            {/* Feed */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
              {activity.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                  <MessageSquare size={32} color="#e2e8f0" style={{ display: 'block', margin: '0 auto 10px' }} />
                  <p style={{ margin: 0, fontSize: 13 }}>No activity yet.</p>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: '#cbd5e1' }}>Notes and updates appear here.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {activity.map(item => (
                    <div key={item.id} style={{ display: 'flex', gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <User size={13} color="white" />
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
          </div>
        </div>
      </div>

      {/* Lost reason modal */}
      {showLostModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={e => { e.stopPropagation(); setShowLostModal(false); }}>
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, width: 360, boxShadow: '0 24px 48px -12px rgba(16,24,40,0.25)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>Mark as Lost</h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: '#64748b' }}>Optionally add a reason for losing this deal.</p>
            <input value={lostReason} onChange={e => setLostReason(e.target.value)} placeholder="Lost reason (optional)..."
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 14 }}
              onKeyDown={e => e.key === 'Enter' && confirmLost()} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowLostModal(false)} style={{ flex: 1, padding: '9px', border: '1px solid #e2e8f0', borderRadius: 9, backgroundColor: 'white', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={confirmLost} style={{ flex: 1, padding: '9px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Mark Lost</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Pipelines Component ──────────────────────────────────────────────────
export default function Pipelines() {
  const { pipelines, contacts, updatePipeline, addNotification, createPipeline, deletePipeline } = useApp();

  const [selectedId, setSelectedId] = useState(pipelines[0]?.id ?? '');
  const [view, setView] = useState<ViewMode>('board');
  const [showBrain, setShowBrain] = useState(false);
  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'won' | 'lost'>('all');
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
  const [showPipelineModal, setShowPipelineModal] = useState(false);
  const [showManageFields, setShowManageFields] = useState(false);
  const [cardFields, setCardFields] = useState<Set<CardFieldKey>>(loadCardFields);
  const [rottingDays, setRottingDays] = useState<number>(() => {
    try { return Number(localStorage.getItem('crm_rotting_days') ?? DEFAULT_ROTTING_DAYS); } catch { return DEFAULT_ROTTING_DAYS; }
  });

  // ── Automations / WIP / celebration ──
  const [autoRules, setAutoRules] = useState<AutomationRule[]>(loadAutomationRules);
  const [showAutomations, setShowAutomations] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [wipLimits, setWipLimits] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('crm_wip_limits') || '{}'); } catch { return {}; }
  });
  const searchRef = useRef<HTMLInputElement>(null);

  const updateAutoRules = (rules: AutomationRule[]) => {
    setAutoRules(rules);
    saveAutomationRules(rules);
  };

  const setWip = (stageId: string, limit: number) => {
    setWipLimits(prev => {
      const next = { ...prev };
      if (limit > 0) next[stageId] = limit; else delete next[stageId];
      try { localStorage.setItem('crm_wip_limits', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // "/" focuses deal search (ClickUp-style shortcut)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement) && !(e.target as HTMLElement)?.isContentEditable) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selected = pipelines.find(p => p.id === selectedId) ?? pipelines[0];
  const allDeals = selected?.stages.flatMap(s => s.deals) ?? [];
  const editDeal = editDealId ? allDeals.find(d => d.id === editDealId) ?? null : null;
  const detailDeal = detailDealId ? allDeals.find(d => d.id === detailDealId) ?? null : null;

  // Idle-deal automation sweep — runs once per pipeline selection
  useEffect(() => {
    if (!selected) return;
    const result = runIdleSweep(selected.stages, autoRules, selected.id);
    if (result.ran.length > 0) {
      updatePipeline(selected.id, { stages: result.stages });
      finishAutomationRun(result);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  if (!selected) return (
    <div>
      <Header title="Pipelines" subtitle="Track your sales opportunities" />
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 16 }}>No pipelines yet.</p>
        <button onClick={() => setShowPipelineModal(true)}
          style={{ padding: '10px 20px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          Create Pipeline
        </button>
        {showPipelineModal && (
          <PipelineManageModal
            pipelines={pipelines}
            selectedId={selectedId}
            onCreate={name => { const p = createPipeline(name); setSelectedId(p.id); }}
            onRename={(id, name) => updatePipeline(id, { name })}
            onDelete={id => { deletePipeline(id); if (selectedId === id) setSelectedId(pipelines.find(p => p.id !== id)?.id ?? ''); }}
            onSelect={setSelectedId}
            onClose={() => setShowPipelineModal(false)}
          />
        )}
      </div>
    </div>
  );

  // ── Helpers ──────────────────────────────────────────────────────────────
  const updateDeal = (dealId: string, updates: Partial<Deal>) => {
    const newStages = selected.stages.map(s => ({
      ...s, deals: s.deals.map(d => d.id === dealId ? { ...d, ...updates } : d),
    }));
    updatePipeline(selected.id, { stages: newStages });
  };

  /** After the engine runs: bump rule counters, append the activity log, surface notifications. */
  function finishAutomationRun(result: AutomationRunResult) {
    if (result.ran.length === 0) return;
    const counts = new Map<string, number>();
    result.ran.forEach(r => counts.set(r.rule.id, (counts.get(r.rule.id) ?? 0) + 1));
    updateAutoRules(autoRules.map(r => counts.has(r.id) ? { ...r, runs: r.runs + (counts.get(r.id) ?? 0) } : r));
    appendAutomationLog(result.ran.map((r, i) => ({
      id: `log-${Date.now()}-${i}`,
      ruleName: r.rule.name,
      dealTitle: r.dealTitle,
      summary: `"${r.dealTitle}" → ${r.rule.actions.map(a => describeAction(a, selected.stages)).join(', ')}`,
      at: new Date().toISOString(),
    })));
    result.notes.forEach(n => addNotification(`🔔 ${n}`, 'info'));
    const names = [...new Set(result.ran.map(r => r.rule.name))].slice(0, 2).join('", "');
    addNotification(`⚡ Automation ran: "${names}"`, 'info');
  }

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
    const updated = { ...moving, stage: toStage.name, lastStageChangedAt: new Date().toISOString() };
    const movedStages = without.map(s => s.id === toStageId ? { ...s, deals: [...s.deals, updated] } : s);
    const result = runAutomations(movedStages, dealId, { type: 'deal_moved', stageId: toStageId }, autoRules, selected.id);
    updatePipeline(selected.id, { stages: result.stages });
    finishAutomationRun(result);
    // WIP limit warning (Kanban best practice — from ClickUp/Trello)
    const limit = wipLimits[toStageId];
    const newCount = (movedStages.find(s => s.id === toStageId)?.deals.length ?? 0);
    if (limit && newCount > limit) {
      addNotification(`⚠️ "${toStage.name}" is over its WIP limit (${newCount}/${limit})`, 'error');
    }
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
        status: data.status ?? 'active',
        source: data.source ?? '',
        lastStageChangedAt: new Date().toISOString(),
        activity: [],
      };
      const withNew = selected.stages.map(s => s.id === targetStageId ? { ...s, deals: [...s.deals, newDeal] } : s);
      const result = runAutomations(withNew, newDeal.id, { type: 'deal_created', stageId: targetStageId }, autoRules, selected.id);
      updatePipeline(selected.id, { stages: result.stages });
      addNotification(`Deal "${newDeal.title}" created!`);
      finishAutomationRun(result);
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

  const quickAddDeal = (stageId: string, title: string) => {
    const stage = selected.stages.find(s => s.id === stageId);
    if (!stage) return;
    const newDeal: Deal = {
      id: `deal-${Date.now()}`,
      title,
      contactId: '',
      contactName: '',
      value: 0,
      stage: stage.name,
      probability: 50,
      expectedClose: '',
      assignedTo: '',
      createdAt: new Date().toISOString(),
      priority: 'normal',
      labels: [],
      description: '',
      checklist: [],
      status: 'active',
      activity: [],
    };
    const withNew = selected.stages.map(s => s.id === stageId ? { ...s, deals: [...s.deals, newDeal] } : s);
    const result = runAutomations(withNew, newDeal.id, { type: 'deal_created', stageId }, autoRules, selected.id);
    updatePipeline(selected.id, { stages: result.stages });
    addNotification(`Deal "${title}" created!`);
    finishAutomationRun(result);
  };

  const markDealWon = (deal: Deal) => {
    updateDeal(deal.id, { status: 'won', closedAt: new Date().toISOString(), probability: 100 });
    setConfetti(true);
    addNotification(`🏆 Deal "${deal.title}" marked as Won!`);
  };

  const markDealLost = (deal: Deal) => {
    updateDeal(deal.id, { status: 'lost', closedAt: new Date().toISOString(), probability: 0 });
    addNotification(`Deal "${deal.title}" marked as Lost`);
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

  const renameStage = (stageId: string, name: string) => {
    const stage = selected.stages.find(s => s.id === stageId);
    if (!stage) return;
    const oldName = stage.name;
    const newStages = selected.stages.map(s =>
      s.id === stageId
        ? { ...s, name, deals: s.deals.map(d => ({ ...d, stage: name })) }
        : s
    );
    updatePipeline(selected.id, { stages: newStages });
    // Update deal stage refs if detail panel is open
    if (detailDeal && detailDeal.stage === oldName) {
      // panel will re-read from updated deal list
    }
  };

  const recolorStage = (stageId: string, color: string) => {
    updatePipeline(selected.id, { stages: selected.stages.map(s => s.id === stageId ? { ...s, color } : s) });
  };

  const deleteStage = (stageId: string) => {
    const stage = selected.stages.find(s => s.id === stageId);
    if (!stage) return;
    if (stage.deals.length > 0 && !window.confirm(`Stage "${stage.name}" has ${stage.deals.length} deal(s). Delete stage and all its deals?`)) return;
    updatePipeline(selected.id, { stages: selected.stages.filter(s => s.id !== stageId) });
    addNotification('Stage deleted', 'info');
  };

  const moveStage = (stageId: string, dir: 'left' | 'right') => {
    const idx = selected.stages.findIndex(s => s.id === stageId);
    if (idx < 0) return;
    const newStages = [...selected.stages];
    const swapIdx = dir === 'left' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newStages.length) return;
    [newStages[idx], newStages[swapIdx]] = [newStages[swapIdx], newStages[idx]];
    updatePipeline(selected.id, { stages: newStages });
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
    if (filterStatus !== 'all') r = r.filter(d => (d.status ?? 'active') === filterStatus);
    return [...r].sort((a, b) => {
      if (sortBy === 'value') return b.value - a.value;
      if (sortBy === 'close') return (a.expectedClose || '9999').localeCompare(b.expectedClose || '9999');
      if (sortBy === 'priority') return (PRIORITY_ORDER[a.priority ?? 'normal'] ?? 2) - (PRIORITY_ORDER[b.priority ?? 'normal'] ?? 2);
      return a.title.localeCompare(b.title);
    });
  };

  // ── Stats ──────────────────────────────────────────────────────────────────
  const activeDeals = allDeals.filter(d => (d.status ?? 'active') === 'active');
  const wonDeals = allDeals.filter(d => d.status === 'won');
  const lostDeals = allDeals.filter(d => d.status === 'lost');
  const totalValue = activeDeals.reduce((v, d) => v + d.value, 0);
  const wonValue = wonDeals.reduce((v, d) => v + d.value, 0);
  const weightedValue = activeDeals.reduce((v, d) => v + Math.round(d.value * d.probability / 100), 0);
  const closedTotal = wonDeals.length + lostDeals.length;
  const winRate = closedTotal > 0 ? Math.round(wonDeals.length / closedTotal * 100) : 0;

  const SORT_LABELS: Record<SortKey, string> = { title: 'Name', value: 'Value', close: 'Close Date', priority: 'Priority', days: 'Days in Stage' };

  const saveCardFields = (fields: Set<CardFieldKey>) => {
    setCardFields(fields);
    try { localStorage.setItem('crm_card_fields', JSON.stringify([...fields])); } catch { /* ignore */ }
  };
  const saveRottingDays = (days: number) => {
    setRottingDays(days);
    try { localStorage.setItem('crm_rotting_days', String(days)); } catch { /* ignore */ }
  };

  return (
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100%' }}>
      <Header title="Pipelines" subtitle="Manage your sales opportunities" />
      <div style={{ padding: 28 }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Active Pipeline', value: fmt(totalValue), sub: `${activeDeals.length} active deals`, color: '#6366f1' },
            { label: 'Weighted Value', value: fmt(weightedValue), sub: 'By probability', color: '#8b5cf6' },
            { label: 'Won Revenue', value: fmt(wonValue), sub: `${wonDeals.length} won · ${lostDeals.length} lost`, color: '#22c55e' },
            { label: 'Win Rate', value: `${winRate}%`, sub: `${closedTotal} closed deals`, color: '#f59e0b' },
          ].map(item => (
            <div key={item.label} style={{ backgroundColor: 'white', borderRadius: 14, padding: '20px 22px', border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '0 0 8px' }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: item.color, flexShrink: 0 }} />
                <p style={{ fontSize: 12, color: '#475569', fontWeight: 600, margin: 0, letterSpacing: '0.2px' }}>{item.label}</p>
              </div>
              <p style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>{item.value}</p>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, marginBottom: 0 }}>{item.sub}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {/* Pipeline selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13, fontWeight: 600, color: '#0f172a', backgroundColor: 'white', cursor: 'pointer', outline: 'none' }}>
              {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button onClick={() => setShowPipelineModal(true)} title="Manage Pipelines"
              style={{ display: 'flex', alignItems: 'center', padding: '8px', border: '1px solid #e2e8f0', borderRadius: 9, backgroundColor: 'white', color: '#64748b', cursor: 'pointer' }}>
              <Settings size={14} />
            </button>
          </div>

          {/* View toggle */}
          <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: 8, padding: 3, gap: 2 }}>
            {([
              ['board',    <LayoutGrid size={13} />,  'Board'],
              ['list',     <List size={13} />,         'List'],
              ['table',    '≡',                        'Table'],
              ['calendar', <Calendar size={13} />,    'Calendar'],
              ['funnel',   <TrendingUp size={13} />,  'Funnel'],
              ['gantt',    <CalendarDays size={13} />, 'Gantt'],
            ] as const).map(([v, icon, label]) => (
              <button key={v} onClick={() => setView(v as ViewMode)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 6, border: 'none', backgroundColor: view === v ? 'white' : 'transparent', color: view === v ? '#6366f1' : '#64748b', fontSize: 12, fontWeight: view === v ? 700 : 500, cursor: 'pointer', boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', whiteSpace: 'nowrap' }}>
                {icon} {label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
            <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search deals...  ( / )"
              style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', backgroundColor: 'white', boxSizing: 'border-box' }} />
          </div>

          {/* Status filter */}
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}
            style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#374151', backgroundColor: 'white', cursor: 'pointer', outline: 'none' }}>
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>

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
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 9, backgroundColor: 'white', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
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

          {/* Manage Fields */}
          <button onClick={() => setShowManageFields(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 9, backgroundColor: 'white', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <SlidersHorizontal size={14} /> Fields
          </button>

          {/* Automations */}
          <button onClick={() => setShowAutomations(true)}
            title="Automations — when something happens, do something"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', border: '1px solid #fde68a', borderRadius: 9, backgroundColor: '#fffbeb', color: '#b45309', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <Zap size={14} /> Automations
            {autoRules.filter(r => r.pipelineId === selected.id && r.enabled).length > 0 && (
              <span style={{ fontSize: 10, fontWeight: 800, backgroundColor: '#f59e0b', color: 'white', borderRadius: 999, padding: '1px 6px' }}>
                {autoRules.filter(r => r.pipelineId === selected.id && r.enabled).length}
              </span>
            )}
          </button>

          {/* Add Deal */}
          <button onClick={() => openAddDeal()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <Plus size={15} /> Add Deal
          </button>

          {/* Brain AI Button */}
          <button onClick={() => setShowBrain(prev => !prev)}
            title="ClickUp Brain — AI pipeline insights"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: showBrain ? 'linear-gradient(135deg,#7c3aed,#6366f1)' : 'white', color: showBrain ? 'white' : '#7c3aed', border: showBrain ? 'none' : '1px solid #c4b5fd', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: showBrain ? '0 2px 8px rgba(124,58,237,0.35)' : 'none' }}>
            <Sparkles size={14} /> Brain
          </button>
        </div>

        {/* ── Board View ──────────────────────────────────────────────────────── */}
        {view === 'board' && (
          <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 16, alignItems: 'flex-start' }}>
            {selected.stages.map((stage, stageIdx) => {
              const deals = applyFilter(stage.deals);
              const isOver = dragOverStage === stage.id;
              return (
                <div key={stage.id}
                  style={{ minWidth: 280, maxWidth: 290, flex: '0 0 280px', backgroundColor: '#f4f6fa', borderRadius: 14, padding: '10px 10px 12px' }}
                  onDragOver={e => handleDragOver(e, stage.id)}
                  onDrop={e => handleDrop(e, stage.id)}
                  onDragLeave={() => setDragOverStage('')}>

                  <StageHeader
                    stage={stage}
                    index={stageIdx}
                    total={selected.stages.length}
                    wipLimit={wipLimits[stage.id]}
                    onRename={renameStage}
                    onRecolor={recolorStage}
                    onDelete={deleteStage}
                    onMove={moveStage}
                    onSetWip={setWip}
                  />

                  {/* Drop zone */}
                  <div style={{ minHeight: 80, padding: '4px 0', borderRadius: 10, backgroundColor: isOver ? '#eef2ff' : 'transparent', border: isOver ? '2px dashed #6366f1' : '2px dashed transparent', transition: 'all 0.15s' }}>
                    {deals.map(deal => (
                      <DealCard
                        key={deal.id}
                        deal={deal}
                        stageId={stage.id}
                        visibleFields={cardFields}
                        rottingDays={rottingDays}
                        onEdit={openEditDeal}
                        onDelete={deleteDeal}
                        onOpen={d => setDetailDealId(d.id)}
                        onDragStart={handleDragStart}
                        onMarkWon={markDealWon}
                        onMarkLost={markDealLost}
                      />
                    ))}
                    {deals.length === 0 && !isOver && (
                      <div style={{ padding: '20px 10px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                        Drop deals here
                      </div>
                    )}
                  </div>

                  <QuickAddDeal onAdd={title => quickAddDeal(stage.id, title)} />
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

        {/* ── List View (ClickUp-style grouped by stage) ───────────────────── */}
        {view === 'list' && (
          <GroupedListView
            stages={selected.stages}
            applyFilter={applyFilter}
            onOpen={d => setDetailDealId(d.id)}
            onEdit={openEditDeal}
            onDelete={deleteDeal}
            onQuickAdd={quickAddDeal}
          />
        )}

        {/* ── Table View ──────────────────────────────────────────────────────── */}
        {view === 'table' && (
          <div style={{ backgroundColor: 'white', borderRadius: 14, border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Status', 'Deal', 'Contact', 'Stage', 'Value', 'Weighted', 'Probability', 'Close Date', 'Assigned', 'Checklist', ''].map(h => (
                    <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {applyFilter(allDeals).map((deal, i, arr) => {
                  const p = (deal.priority ?? 'normal') as Priority;
                  const pc = PRIORITY[p];
                  const cl = deal.checklist ?? [];
                  const dn = cl.filter(c => c.done).length;
                  const stageObj = selected.stages.find(s => s.name === deal.stage);
                  const st = deal.status ?? 'active';
                  return (
                    <tr key={deal.id} onClick={() => setDetailDealId(deal.id)}
                      style={{ borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', opacity: st === 'lost' ? 0.7 : 1, transition: 'background 0.1s', borderLeft: `3px solid ${st === 'won' ? '#22c55e' : st === 'lost' ? '#94a3b8' : pc.border}` }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'white'; }}>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 3, backgroundColor: st === 'won' ? '#dcfce7' : st === 'lost' ? '#f1f5f9' : pc.bg, color: st === 'won' ? '#16a34a' : st === 'lost' ? '#94a3b8' : pc.color, textTransform: 'uppercase' }}>
                          {st === 'won' ? 'WON' : st === 'lost' ? 'LOST' : pc.label}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600, color: st === 'lost' ? '#94a3b8' : '#0f172a', maxWidth: 180 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: st === 'lost' ? 'line-through' : 'none' }}>{deal.title}</div>
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
                      <td style={{ padding: '11px 14px', fontSize: 14, fontWeight: 700, color: st === 'won' ? '#16a34a' : '#0f172a', whiteSpace: 'nowrap' }}>{fmt(deal.value)}</td>
                      <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600, color: '#6366f1', whiteSpace: 'nowrap' }}>{fmt(Math.round(deal.value * deal.probability / 100))}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 50, height: 5, backgroundColor: '#e2e8f0', borderRadius: 3 }}>
                            <div style={{ height: '100%', width: `${deal.probability}%`, backgroundColor: '#6366f1', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{deal.probability}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: isOverdue(deal.expectedClose) && st === 'active' ? '#dc2626' : '#64748b', fontWeight: isOverdue(deal.expectedClose) && st === 'active' ? 700 : 400, whiteSpace: 'nowrap' }}>
                        {isOverdue(deal.expectedClose) && st === 'active' && '⚠ '}{deal.expectedClose || '—'}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 13, color: '#374151' }}>{deal.assignedTo || '—'}</td>
                      <td style={{ padding: '11px 14px' }}>
                        {cl.length > 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{ width: 40, height: 4, backgroundColor: '#e2e8f0', borderRadius: 2 }}>
                              <div style={{ height: '100%', width: `${(dn / cl.length) * 100}%`, backgroundColor: dn === cl.length ? '#22c55e' : '#6366f1', borderRadius: 2 }} />
                            </div>
                            <span style={{ fontSize: 11, color: dn === cl.length ? '#22c55e' : '#94a3b8', fontWeight: 600 }}>{dn}/{cl.length}</span>
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

        {/* ── Funnel View ────────────────────────────────────────────────────── */}
        {view === 'funnel' && (
          <FunnelView stages={selected.stages} allDeals={allDeals} />
        )}

        {/* ── Calendar View ──────────────────────────────────────────────────── */}
        {view === 'calendar' && (
          <CalendarView stages={selected.stages} allDeals={allDeals} onOpen={d => setDetailDealId(d.id)} />
        )}

        {/* ── Gantt View ─────────────────────────────────────────────────────── */}
        {view === 'gantt' && (
          <GanttView stages={selected.stages} allDeals={allDeals} />
        )}
      </div>

      {/* Brain AI Panel */}
      {showBrain && (
        <BrainPanel stages={selected.stages} allDeals={allDeals} onClose={() => setShowBrain(false)} />
      )}

      {/* Sort menu backdrop */}
      {showSortMenu && <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setShowSortMenu(false)} />}

      {/* Manage Card Fields Modal */}
      {showManageFields && (
        <ManageFieldsModal
          visible={cardFields}
          rottingDays={rottingDays}
          onChange={saveCardFields}
          onRottingChange={saveRottingDays}
          onClose={() => setShowManageFields(false)}
        />
      )}

      {/* Pipeline Manage Modal */}
      {showPipelineModal && (
        <PipelineManageModal
          pipelines={pipelines}
          selectedId={selectedId}
          onCreate={name => { const p = createPipeline(name); setSelectedId(p.id); }}
          onRename={(id, name) => updatePipeline(id, { name })}
          onDelete={id => { deletePipeline(id); if (selectedId === id) setSelectedId(pipelines.find(p => p.id !== id)?.id ?? ''); }}
          onSelect={id => { setSelectedId(id); setShowPipelineModal(false); }}
          onClose={() => setShowPipelineModal(false)}
        />
      )}

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
          stages={selected.stages}
          onClose={() => setDetailDealId(null)}
          onEdit={deal => { openEditDeal(deal); setDetailDealId(null); }}
          onUpdateDeal={updateDeal}
          onMoveDealToStage={moveDeal}
        />
      )}

      {/* Automations */}
      {showAutomations && (
        <AutomationsModal
          pipelineId={selected.id}
          stages={selected.stages}
          rules={autoRules}
          onRulesChange={updateAutoRules}
          onClose={() => setShowAutomations(false)}
        />
      )}

      {/* Won-deal celebration */}
      {confetti && <ConfettiBurst onDone={() => setConfetti(false)} />}
    </div>
  );
}
