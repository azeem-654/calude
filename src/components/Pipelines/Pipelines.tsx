import { Fragment, useState, useRef, useCallback, useEffect } from 'react';
import type { DragEvent } from 'react';
import {
  Plus, Search, X, Check, Edit2, Trash2, User,
  LayoutGrid, List, MessageSquare, Send, Flag, ChevronDown,
  ChevronLeft, ChevronRight, Trophy, ThumbsDown, MoreVertical,
  Settings, Clock, SlidersHorizontal, TrendingUp,
  FileText, CheckSquare, Timer, Link2, GitBranch, CalendarDays,
  Sparkles, ChevronUp, Calendar, Brain, Zap, Gauge, CheckCircle2, Paperclip,
  Tag, Users, Circle, AlertCircle, Share2, Table2,
} from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import type { Deal, Stage, ChecklistItem, DealActivity, SubTask } from '../../types';
import {
  AutomationsModal, ConfettiBurst, loadAutomationRules, saveAutomationRules,
  runAutomations, runIdleSweep, appendAutomationLog, describeAction,
} from './Automations';
import type { AutomationRule, AutomationRunResult } from './Automations';
import PipelineDesigner from './PipelineDesigner';
import { playbookChecklist, seedExistingDeals } from '../../services/pipelineAI';

type Priority = 'urgent' | 'high' | 'normal' | 'low';
type ViewMode = 'board' | 'list' | 'calendar' | 'gantt' | 'table' | 'funnel';
type SortKey = 'manual' | 'title' | 'value' | 'close' | 'priority' | 'days';

/**
 * Escape closes an overlay.
 *
 * Every panel here could already be dismissed by clicking the backdrop, which
 * is no help to anyone on a keyboard and is a guess for everyone else. One hook
 * so no overlay is added later without it.
 */
function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

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
  normal: { color: '#17191c', bg: '#eceef1', label: 'Normal', border: '#17191c' },
  low:    { color: '#94a3b8', bg: '#f8fafc', label: 'Low',    border: '#e2e8f0' },
};

const LABEL_PRESETS = [
  { color: '#ef4444', text: 'Hot Lead' },
  { color: '#f97316', text: 'Follow Up' },
  { color: '#22c55e', text: 'Ready to Close' },
  { color: '#3b82f6', text: 'Enterprise' },
  { color: '#3b3f45', text: 'VIP' },
  { color: '#ec4899', text: 'Partnership' },
];

const LABEL_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#3b3f45','#ec4899','#14b8a6'];
const STAGE_COLORS = ['#17191c','#22c55e','#f59e0b','#ef4444','#3b3f45','#14b8a6','#ec4899','#0ea5e9'];
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function fmt(n: number) { return `$${n.toLocaleString()}`; }
function isOverdue(date: string) { return !!date && new Date(date) < new Date(); }

/* ── Task-card helpers (avatars, dates, progress) ── */
const AVATAR_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#22c55e', '#0ea5e9', '#8b5cf6', '#ef4444', '#14b8a6'];
function initials(name: string): string {
  return (name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}
function fmtDay(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleDateString('en-US', { month: 'short' })}, ${d.getFullYear()}`;
}
/** Round, coloured initials avatar (an <img>-free stand-in). */
function InitialsAvatar({ name, i = 0, size = 24, ring = '#ffffff' }: { name: string; i?: number; size?: number; ring?: string }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: 999, flexShrink: 0,
      background: AVATAR_COLORS[(hashId(name || 'x') + i) % AVATAR_COLORS.length],
      color: '#fff', fontSize: size * 0.42, fontWeight: 800,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: `2px solid ${ring}`, boxSizing: 'border-box',
    }}>{initials(name)}</span>
  );
}
/** People shown on a deal card (assignee + contact, de-duplicated). */
function dealPeople(deal: Deal): string[] {
  const list = [deal.assignedTo, deal.contactName].filter((v): v is string => !!v && v.trim().length > 0);
  return Array.from(new Set(list));
}
function fmtRelTime(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── Deal Card ─────────────────────────────────────────────────────────────────
/* ── E-wallet card skins: every deal gets a genuinely different design ──
   (like a bank-card set: solid+mesh, circles, two-tone band, clean white,
   gradients with shine, dark with color band). Stable per deal via id hash. */
interface CardSkin {
  bg: string;
  ink: string;          // primary text
  sub: string;          // secondary text
  chipBg: string;
  chipInk: string;
  trackBg: string;      // checklist track
  fillBg: string;       // checklist fill
  divider: string;
  border?: string;      // light cards need an outline
  texture: 'mesh' | 'circles' | 'diag' | 'shine' | 'none';
  band?: string;        // decorative bottom band (color/gradient)
  footerInk?: string;   // bottom-row text when it sits on the band
  glow: string;
  dark: boolean;        // dark background → white-ish overlays
}

const CARD_SKINS: CardSkin[] = [
  { // 1 · royal blue + geometric mesh
    bg: '#2f6bff', ink: '#fff', sub: 'rgba(255,255,255,0.72)',
    chipBg: 'rgba(255,255,255,0.18)', chipInk: '#fff',
    trackBg: 'rgba(255,255,255,0.25)', fillBg: '#fff', divider: 'rgba(255,255,255,0.18)',
    texture: 'mesh', glow: 'rgba(47,107,255,0.4)', dark: true,
  },
  { // 2 · teal + big translucent circles (balance-card style)
    bg: 'linear-gradient(135deg, #2dd4bf 0%, #0f9488 100%)', ink: '#fff', sub: 'rgba(255,255,255,0.75)',
    chipBg: 'rgba(255,255,255,0.2)', chipInk: '#fff',
    trackBg: 'rgba(255,255,255,0.25)', fillBg: '#fff', divider: 'rgba(255,255,255,0.18)',
    texture: 'circles', glow: 'rgba(20,184,166,0.4)', dark: true,
  },
  { // 3 · yellow with black band (two-tone)
    bg: '#fbbf24', ink: '#17191c', sub: 'rgba(0,0,0,0.55)',
    chipBg: 'rgba(0,0,0,0.12)', chipInk: '#17191c',
    trackBg: 'rgba(0,0,0,0.15)', fillBg: '#17191c', divider: 'transparent',
    texture: 'none', band: '#17191c', footerInk: '#fff',
    glow: 'rgba(251,191,36,0.45)', dark: false,
  },
  { // 4 · clean white + fine diagonal lines
    bg: '#ffffff', ink: '#17191c', sub: '#8a8f98',
    chipBg: '#f0f1f3', chipInk: '#17191c',
    trackBg: '#e9ebee', fillBg: '#17191c', divider: '#f0f1f3',
    border: '1px solid #e6e9f0',
    texture: 'diag', glow: 'rgba(23,25,28,0.12)', dark: false,
  },
  { // 5 · violet gradient + shine
    bg: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', ink: '#fff', sub: 'rgba(255,255,255,0.72)',
    chipBg: 'rgba(255,255,255,0.18)', chipInk: '#fff',
    trackBg: 'rgba(255,255,255,0.25)', fillBg: '#fff', divider: 'rgba(255,255,255,0.18)',
    texture: 'shine', glow: 'rgba(139,92,246,0.4)', dark: true,
  },
  { // 6 · pink→orange gradient + shine
    bg: 'linear-gradient(135deg, #ec4899 0%, #f97316 100%)', ink: '#fff', sub: 'rgba(255,255,255,0.78)',
    chipBg: 'rgba(255,255,255,0.2)', chipInk: '#fff',
    trackBg: 'rgba(255,255,255,0.25)', fillBg: '#fff', divider: 'rgba(255,255,255,0.18)',
    texture: 'shine', glow: 'rgba(236,72,153,0.4)', dark: true,
  },
  { // 7 · dark navy + sunset gradient band
    bg: '#1b2436', ink: '#fff', sub: 'rgba(255,255,255,0.6)',
    chipBg: 'rgba(255,255,255,0.12)', chipInk: '#fff',
    trackBg: 'rgba(255,255,255,0.18)', fillBg: '#c7f441', divider: 'transparent',
    texture: 'none', band: 'linear-gradient(90deg, #ec4899, #fb923c)', footerInk: '#fff',
    glow: 'rgba(27,36,54,0.45)', dark: true,
  },
  { // 8 · deep green + peach band
    bg: '#1f3d36', ink: '#fff', sub: 'rgba(255,255,255,0.62)',
    chipBg: 'rgba(255,255,255,0.14)', chipInk: '#fff',
    trackBg: 'rgba(255,255,255,0.18)', fillBg: '#f6c6a6', divider: 'transparent',
    texture: 'none', band: '#f6c6a6', footerInk: '#17191c',
    glow: 'rgba(31,61,54,0.45)', dark: true,
  },
];

const WON_SKIN: CardSkin = {
  bg: 'linear-gradient(135deg, #34d399 0%, #059669 100%)', ink: '#fff', sub: 'rgba(255,255,255,0.78)',
  chipBg: 'rgba(255,255,255,0.22)', chipInk: '#fff',
  trackBg: 'rgba(255,255,255,0.25)', fillBg: '#fff', divider: 'rgba(255,255,255,0.18)',
  texture: 'circles', glow: 'rgba(16,185,129,0.4)', dark: true,
};
const LOST_SKIN: CardSkin = {
  bg: 'linear-gradient(135deg, #a8adb5 0%, #7c828c 100%)', ink: '#fff', sub: 'rgba(255,255,255,0.7)',
  chipBg: 'rgba(255,255,255,0.2)', chipInk: '#fff',
  trackBg: 'rgba(255,255,255,0.22)', fillBg: '#fff', divider: 'rgba(255,255,255,0.16)',
  texture: 'diag', glow: 'rgba(107,114,128,0.3)', dark: true,
};

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function CardTexture({ skin }: { skin: CardSkin }) {
  const common: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' };
  const line = skin.dark ? 'rgba(255,255,255,0.16)' : 'rgba(23,25,28,0.08)';
  const soft = skin.dark ? 'rgba(255,255,255,0.10)' : 'rgba(23,25,28,0.04)';

  if (skin.texture === 'mesh') {
    return (
      <svg style={common} viewBox="0 0 300 190" preserveAspectRatio="none">
        <g stroke={line} strokeWidth="1" fill="none">
          <path d="M150,-10 L260,60 L200,190 M260,60 L340,140 M150,-10 L200,190 M200,190 L320,90" />
          <path d="M180,-20 L260,60 L310,10 M230,20 L200,190" />
        </g>
      </svg>
    );
  }
  if (skin.texture === 'circles') {
    return (
      <svg style={common} viewBox="0 0 300 190" preserveAspectRatio="none">
        <circle cx="250" cy="150" r="80" fill={soft} />
        <circle cx="285" cy="60" r="45" fill={soft} />
        <circle cx="215" cy="105" r="26" fill={line} opacity="0.5" />
      </svg>
    );
  }
  if (skin.texture === 'diag') {
    return (
      <svg style={common} viewBox="0 0 300 190" preserveAspectRatio="none">
        <g stroke={line} strokeWidth="1">
          {Array.from({ length: 9 }, (_, i) => (
            <line key={i} x1={170 + i * 16} y1="-10" x2={90 + i * 16} y2="200" />
          ))}
        </g>
      </svg>
    );
  }
  if (skin.texture === 'shine') {
    return (
      <svg style={common} viewBox="0 0 300 190" preserveAspectRatio="none">
        <path d="M140,-20 L300,190 L220,190 L60,-20 Z" fill={soft} />
        <path d="M200,-20 L340,160 L310,190 L160,-20 Z" fill={line} opacity="0.4" />
      </svg>
    );
  }
  return null;
}

/** Shows exactly where a dragged card will land. */
function DropLine() {
  return (
    <div style={{
      height: 3, borderRadius: 999, background: '#17191c',
      margin: '0 2px 11px', boxShadow: '0 0 0 3px rgba(23,25,28,0.10)',
    }} />
  );
}

interface DealCardProps {
  deal: Deal;
  stageId: string;
  visibleFields: Set<CardFieldKey>;
  rottingDays: number;
  onEdit: (deal: Deal) => void;
  onDelete: (deal: Deal) => void;
  onOpen: (deal: Deal) => void;
  /** True while this card is the one being dragged. */
  dimmed: boolean;
  onDragStart: (e: DragEvent<HTMLDivElement>, deal: Deal, stageId: string) => void;
  onDragEnd: () => void;
  onDragOverCard: (e: DragEvent<HTMLDivElement>) => void;
  onMarkWon: (deal: Deal) => void;
  onMarkLost: (deal: Deal) => void;
  onAddSubtask: (deal: Deal, title: string) => void;
  onToggleSubtask: (deal: Deal, subtaskId: string) => void;
}

function DealCard({
  deal, stageId, visibleFields: vf, rottingDays, dimmed,
  onEdit, onDelete, onOpen, onDragStart, onDragEnd, onDragOverCard,
  onMarkWon, onMarkLost, onAddSubtask, onToggleSubtask,
}: DealCardProps) {
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const p = (deal.priority ?? 'normal') as Priority;
  const pc = PRIORITY[p];
  const checklist = deal.checklist ?? [];
  const done = checklist.filter(c => c.done).length;
  const subtasks = deal.subtasks ?? [];
  const subDone = subtasks.filter(s => s.done).length;
  const labels = deal.labels ?? [];
  const overdue = isOverdue(deal.expectedClose);
  const status = deal.status ?? 'active';
  const isWon = status === 'won';
  const isLost = status === 'lost';
  const days = daysInStage(deal);
  const isRotting = status === 'active' && days >= rottingDays;

  const people = dealPeople(deal);
  const attachCount = (deal as unknown as { attachments?: unknown[] }).attachments?.length ?? 0;
  const commentCount = (deal.activity ?? []).length;
  // Progress segments (setup → done) driven by the checklist/subtasks.
  const items = (deal.subtasks && deal.subtasks.length ? deal.subtasks.map(s => ({ done: s.done })) : checklist.map(c => ({ done: c.done })));
  const segCount = Math.max(3, Math.min(5, items.length || 3));
  const doneRatio = items.length ? items.filter(i => i.done).length / items.length : (isWon ? 1 : deal.probability ? deal.probability / 100 : 0);
  const segFilled = Math.round(doneRatio * segCount);
  const segColor = p === 'urgent' ? '#f87171' : p === 'high' ? '#fb923c' : p === 'low' ? '#cbd5e1' : isWon ? '#34d399' : '#818cf8';

  return (
    <div
      draggable={status === 'active' && !addingSubtask}
      onDragStart={e => status === 'active' && onDragStart(e, deal, stageId)}
      onDragEnd={onDragEnd}
      onDragOver={onDragOverCard}
      onClick={() => onOpen(deal)}
      className="hover-lift"
      style={{
        position: 'relative', background: '#ffffff', borderRadius: 18,
        border: '1px solid #edeef1', padding: '16px 16px 14px',
        boxShadow: '0 1px 2px rgba(16,24,40,0.05)', cursor: 'pointer',
        marginBottom: 14, userSelect: 'none',
        opacity: dimmed ? 0.35 : isLost ? 0.7 : 1,
      }}
    >
      {/* Progress segments */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {Array.from({ length: segCount }).map((_, i) => (
          <div key={i} style={{ flex: 1, height: 5, borderRadius: 999, background: i < segFilled ? segColor : '#e8eaee' }} />
        ))}
      </div>

      {/* Date range + inline actions (revealed on hover, in-flow — no overlap) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, minHeight: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#8a8f98', fontWeight: 500 }}>
          <span>{fmtDay(deal.createdAt) || '—'}</span>
          <span style={{ width: 12, height: 1, background: '#c7ccd3' }} />
          <span style={{ color: overdue && status === 'active' ? '#ef4444' : '#8a8f98', fontWeight: overdue && status === 'active' ? 700 : 500 }}>{fmtDay(deal.expectedClose) || '—'}</span>
        </div>
        <div className="card-actions" style={{ display: 'flex', gap: 1, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {status === 'active' && <>
            <button onClick={() => onMarkWon(deal)} title="Mark Won" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, color: '#a4abb5', display: 'flex' }}><Trophy size={14} /></button>
            <button onClick={() => onMarkLost(deal)} title="Mark Lost" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, color: '#a4abb5', display: 'flex' }}><ThumbsDown size={14} /></button>
          </>}
          {(isWon || isLost) && <button onClick={() => onEdit(deal)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 6, color: '#475569', fontSize: 11, fontWeight: 700 }}>Reopen</button>}
          <button onClick={() => onEdit(deal)} title="Edit" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, color: '#a4abb5', display: 'flex' }}><Edit2 size={14} /></button>
          <button onClick={() => onDelete(deal)} title="Delete" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, color: '#a4abb5', display: 'flex' }}><Trash2 size={14} /></button>
        </div>
      </div>

      {/* Title with status check */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 7 }}>
        {isWon
          ? <CheckCircle2 size={20} color="#22c55e" strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 1 }} />
          : <span style={{ width: 20, height: 20, borderRadius: 999, border: '2px solid #c7ccd3', flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={11} color="#c7ccd3" strokeWidth={3} /></span>}
        <span style={{ fontSize: 17, fontWeight: 700, color: '#17191c', letterSpacing: '-0.02em', lineHeight: 1.25, textDecoration: isLost ? 'line-through' : 'none' }}>{deal.title}</span>
      </div>

      {/* Description */}
      {deal.description && (
        <p style={{ margin: '0 0 4px 29px', fontSize: 14, color: '#5c6270', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{deal.description}</p>
      )}

      {/* Labels (compact) */}
      {labels.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, margin: '8px 0 0 29px' }}>
          {labels.slice(0, 3).map((l, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: `${l.color}14`, color: l.color }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: l.color }} />{l.text}
            </span>
          ))}
        </div>
      )}

      {/* Sub-tasks on the cover: readable, tickable and addable without opening
          the card. Every control here stops the click from reaching the card,
          which would otherwise open the detail panel on top of it. */}
      <div style={{ margin: '11px 0 0 29px' }} onClick={e => e.stopPropagation()}>
        {subtasks.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#8a8f98', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sub-tasks</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#8a8f98' }}>{subDone}/{subtasks.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {subtasks.slice(0, 3).map(st => (
                <button
                  key={st.id}
                  onClick={() => onToggleSubtask(deal, st.id)}
                  aria-pressed={st.done}
                  // The visible label is the sub-task's own text, so the action
                  // has to be spelled out for anyone not looking at the tick.
                  aria-label={`${st.done ? 'Mark as not done' : 'Mark as done'}: ${st.title}`}
                  title={st.done ? 'Mark as not done' : 'Mark as done'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer',
                  }}
                >
                  {st.done
                    ? <CheckCircle2 size={15} color="#22c55e" strokeWidth={2.4} style={{ flexShrink: 0 }} />
                    : <Circle size={15} color="#c7ccd3" strokeWidth={2} style={{ flexShrink: 0 }} />}
                  <span style={{ fontSize: 12.5, color: st.done ? '#a4abb5' : '#5c6270', textDecoration: st.done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.title}</span>
                </button>
              ))}
              {subtasks.length > 3 && (
                <button onClick={() => onOpen(deal)} style={{ border: 'none', background: 'none', padding: 0, textAlign: 'left', fontSize: 11.5, color: '#8a8f98', fontWeight: 600, marginLeft: 23, cursor: 'pointer' }}>
                  +{subtasks.length - 3} more
                </button>
              )}
            </div>
          </>
        )}

        {addingSubtask ? (
          <div style={{ display: 'flex', gap: 6, marginTop: subtasks.length ? 8 : 0 }}>
            <input
              autoFocus
              value={subtaskDraft}
              onChange={e => setSubtaskDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { onAddSubtask(deal, subtaskDraft); setSubtaskDraft(''); }
                if (e.key === 'Escape') { setAddingSubtask(false); setSubtaskDraft(''); }
              }}
              onBlur={() => { if (!subtaskDraft.trim()) setAddingSubtask(false); }}
              placeholder="Sub-task, then Enter"
              style={{ flex: 1, minWidth: 0, padding: '6px 9px', border: '1px solid #d5d8dd', borderRadius: 8, fontSize: 12.5, outline: 'none' }}
            />
            <button
              onClick={() => { onAddSubtask(deal, subtaskDraft); setSubtaskDraft(''); }}
              style={{ padding: '6px 11px', background: '#17191c', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              Add
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddingSubtask(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, marginTop: subtasks.length ? 8 : 0,
              border: 'none', background: 'none', padding: 0,
              fontSize: 12, fontWeight: 600, color: '#8a8f98', cursor: 'pointer',
            }}
          >
            <Plus size={13} /> Sub-task
          </button>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: '#f0f1f4', margin: '14px 0 12px' }} />

      {/* Footer: add + avatars · attachments · comments */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button onClick={e => { e.stopPropagation(); onEdit(deal); }} title="Assign"
            style={{ width: 30, height: 30, borderRadius: 999, border: '1.5px dashed #c7ccd3', background: 'none', color: '#8a8f98', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: people.length ? 8 : 0, flexShrink: 0 }}>
            <Plus size={14} />
          </button>
          <div style={{ display: 'flex' }}>
            {people.slice(0, 3).map((name, i) => (
              <span key={i} style={{ marginLeft: i === 0 ? 0 : -8 }}><InitialsAvatar name={name} i={i} size={28} /></span>
            ))}
            {people.length > 3 && (
              <span style={{ marginLeft: -8, width: 28, height: 28, borderRadius: 999, background: '#eceef2', color: '#5c6270', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>+{people.length - 3}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {subtasks.length > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: subDone === subtasks.length ? '#22c55e' : '#8a8f98', fontWeight: 600 }}><CheckSquare size={14} />{subDone}/{subtasks.length}</span>
          )}
          {attachCount > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#8a8f98', fontWeight: 600 }}><Paperclip size={14} />{attachCount}</span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#8a8f98', fontWeight: 600 }}><MessageSquare size={14} />{commentCount}</span>
        </div>
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
  useEscape(onClose);
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
              <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '6px 10px', borderRadius: 8, backgroundColor: draft.has(f.key) ? '#eceef1' : '#f8fafc', border: `1px solid ${draft.has(f.key) ? '#d5d8dd' : '#e2e8f0'}` }}>
                <input type="checkbox" checked={draft.has(f.key)} onChange={() => toggle(f.key)} style={{ cursor: 'pointer' }} />
                <span style={{ fontSize: 13, fontWeight: draft.has(f.key) ? 600 : 400, color: draft.has(f.key) ? '#17191c' : '#374151' }}>{f.label}</span>
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
          <button onClick={save} style={{ padding: '8px 16px', backgroundColor: '#17191c', color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Apply</button>
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
    <div style={{ backgroundColor: 'white', borderRadius: 18, border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: '24px 28px' }}>
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
    <div style={{ backgroundColor: 'white', borderRadius: 18, border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
        <CalendarDays size={14} color="#17191c" />
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
    <div style={{ backgroundColor: 'white', borderRadius: 18, border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Calendar size={14} color="#17191c" />
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
                    <span style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: isToday ? 700 : 400, backgroundColor: isToday ? '#17191c' : 'transparent', color: isToday ? 'white' : '#374151' }}>
                      {day}
                    </span>
                  </div>
                  {dayDeals.slice(0, 3).map(deal => {
                    const stageColor = stageColorMap.get(deal.stage) ?? '#17191c';
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
  useEscape(onClose);
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
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#17191c', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                style={{ padding: '5px 10px', borderRadius: 20, border: '1px solid #d5d8dd', backgroundColor: '#eceef1', color: '#17191c', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
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
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#17191c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Sparkles size={12} color="white" />
                </div>
              )}
              <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px', backgroundColor: msg.role === 'user' ? '#17191c' : '#f8fafc', border: msg.role === 'user' ? 'none' : '1px solid #e2e8f0' }}>
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
            style={{ padding: '9px 14px', backgroundColor: input.trim() ? '#17191c' : '#e2e8f0', color: input.trim() ? 'white' : '#94a3b8', border: 'none', borderRadius: 8, cursor: input.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, backgroundColor: 'white', borderRadius: 18, border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', overflow: 'hidden' }}>
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
                            <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#17191c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
              style={{ fontSize: 13, fontWeight: 600, border: '1px solid #17191c', borderRadius: 7, padding: '2px 8px', outline: 'none', width: '100%', fontFamily: 'inherit', color: '#0f172a' }}
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
                  style={{ padding: '5px 10px', border: 'none', borderRadius: 7, background: '#17191c', color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Set</button>
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
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#17191c'; e.currentTarget.style.color = '#17191c'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#94a3b8'; }}>
      <Plus size={13} /> Add Deal
    </button>
  );

  return (
    <div style={{ marginTop: 6, padding: '10px', backgroundColor: 'white', border: '1px solid #17191c', borderRadius: 10 }}>
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Deal title..."
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setTitle(''); setActive(false); } }}
        style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', marginBottom: 6, boxSizing: 'border-box', fontFamily: 'inherit' }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={commit} style={{ flex: 1, padding: '6px', backgroundColor: '#17191c', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add</button>
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
  useEscape(onClose);
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
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, border: `1px solid ${p.id === selectedId ? '#17191c' : '#e2e8f0'}`, backgroundColor: p.id === selectedId ? '#eceef1' : 'white' }}>
                {editingId === p.id ? (
                  <input
                    value={editDraft}
                    onChange={e => setEditDraft(e.target.value)}
                    onBlur={() => commitRename(p.id)}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(p.id); if (e.key === 'Escape') setEditingId(null); }}
                    autoFocus
                    style={{ flex: 1, fontSize: 14, border: '1px solid #17191c', borderRadius: 6, padding: '4px 8px', outline: 'none', fontFamily: 'inherit' }}
                  />
                ) : (
                  <span
                    style={{ flex: 1, fontSize: 14, fontWeight: p.id === selectedId ? 700 : 500, color: p.id === selectedId ? '#17191c' : '#374151', cursor: 'pointer' }}
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
              style={{ padding: '9px 16px', backgroundColor: newName.trim() ? '#17191c' : '#d5d8dd', color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: newName.trim() ? 'pointer' : 'default' }}>
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
  useEscape(onClose);
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
              {([['active', '#17191c', 'Active'], ['won', '#22c55e', '🏆 Won'], ['lost', '#94a3b8', 'Lost']] as const).map(([s, c, l]) => (
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
              <button onClick={addCustomLabel} style={{ padding: '7px 12px', backgroundColor: '#17191c', color: 'white', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add</button>
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
            style={{ padding: '9px 20px', backgroundColor: title.trim() ? '#17191c' : '#d5d8dd', color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: title.trim() ? 'pointer' : 'default' }}>
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
  useEscape(onClose);
  const [section, setSection] = useState<'subtasks' | 'checklist' | null>(null);
  const [newActivity, setNewActivity] = useState('');
  const [newCheckItem, setNewCheckItem] = useState('');
  const [showLostModal, setShowLostModal] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [newSubtask, setNewSubtask] = useState('');
  const [showTimeLog, setShowTimeLog] = useState(false);
  const [timeInput, setTimeInput] = useState('');
  const [tab, setTab] = useState<'subtask' | 'details' | 'attachment'>('subtask');

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

  const overdue = isOverdue(deal.expectedClose);
  const people = dealPeople(deal);
  const attachments = (deal as unknown as { attachments?: { name: string }[] }).attachments ?? [];
  const statusPill = status === 'won'
    ? { text: 'Won', bg: '#dcfce7', color: '#16a34a' }
    : status === 'lost'
      ? { text: 'Lost', bg: '#f1f5f9', color: '#8a8f98' }
      : { text: deal.stage || 'In Progress', bg: `${currentStage?.color ?? '#f59e0b'}1a`, color: currentStage?.color ?? '#b45309' };

  const iconField = (icon: React.ReactNode, label: string, children: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 0' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 116, color: '#8a8f98', fontSize: 13.5, fontWeight: 500, paddingTop: 2 }}>{icon}{label}</span>
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', padding: '16px' }} onClick={onClose}>
      <div className="slide-up" style={{ backgroundColor: '#ffffff', borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px -12px rgba(16,24,40,0.3)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f0f1f4', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#17191c', display: 'flex', padding: 2 }}><X size={20} /></button>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, color: '#8a8f98', fontWeight: 500, minWidth: 0 }}>
              <span style={{ color: '#17191c', fontWeight: 600 }}>Pipeline</span>
              <ChevronRight size={13} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.stage}</span>
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {(status === 'won' || status === 'lost') && <button onClick={reactivate} style={{ fontSize: 12, color: '#374151', background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontWeight: 600 }}>Reactivate</button>}
            <button onClick={() => onEdit(deal)} title="Edit" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', padding: 7, borderRadius: 8 }}><Edit2 size={17} /></button>
            <button title="Share" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', padding: 7, borderRadius: 8 }}><Share2 size={17} /></button>
            <button title="More" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', padding: 7, borderRadius: 8 }}><MoreVertical size={17} /></button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px' }}>
          {status === 'won' && <div style={{ padding: '6px 12px', borderRadius: 8, backgroundColor: '#dcfce7', color: '#16a34a', fontSize: 12, fontWeight: 700, marginBottom: 14, display: 'inline-block' }}>🏆 Deal Won!</div>}
          {status === 'lost' && <div style={{ padding: '6px 12px', borderRadius: 8, backgroundColor: '#f1f5f9', color: '#8a8f98', fontSize: 12, fontWeight: 600, marginBottom: 14, display: 'inline-block' }}>Deal Lost{deal.lostReason ? ` — ${deal.lostReason}` : ''}</div>}

          {/* Title + description */}
          <h2 style={{ margin: '0 0 8px', fontSize: 23, fontWeight: 800, color: '#17191c', lineHeight: 1.25, letterSpacing: '-0.02em', textDecoration: status === 'lost' ? 'line-through' : 'none' }}>{deal.title}</h2>
          {deal.description && <p style={{ margin: '0 0 18px', fontSize: 14.5, color: '#5c6270', lineHeight: 1.5 }}>{deal.description}</p>}

          {/* Fields */}
          <div style={{ borderTop: '1px solid #f0f1f4', marginBottom: 6 }}>
            {iconField(<Calendar size={15} />, 'Deadline', (
              <span style={{ fontSize: 14, fontWeight: 600, color: overdue && status === 'active' ? '#ef4444' : '#17191c' }}>{fmtDay(deal.expectedClose) || 'No deadline'}</span>
            ))}
            {iconField(<Tag size={15} />, 'Tags', (
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {labels.length ? labels.map((l, i) => (
                  <span key={i} style={{ fontSize: 12.5, fontWeight: 600, padding: '4px 11px', borderRadius: 8, background: `${l.color}18`, color: l.color }}>{l.text}</span>
                )) : <span style={{ fontSize: 13.5, color: '#b0b4ba' }}>No tags</span>}
              </span>
            ))}
            {iconField(<Users size={15} />, 'Assigned', (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {people.slice(0, 4).map((name, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#17191c', background: '#f4f5f7', borderRadius: 999, padding: '3px 10px 3px 3px' }}>
                    <InitialsAvatar name={name} i={i} size={22} ring="#f4f5f7" />{name.split(' ')[0]}
                  </span>
                ))}
                <button onClick={() => onEdit(deal)} style={{ width: 26, height: 26, borderRadius: 999, border: '1.5px dashed #c7ccd3', background: 'none', color: '#8a8f98', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={13} /></button>
              </span>
            ))}
            {iconField(<Gauge size={15} />, 'Status', (
              <span style={{ fontSize: 12.5, fontWeight: 700, padding: '5px 12px', borderRadius: 8, background: statusPill.bg, color: statusPill.color, display: 'inline-block' }}>{statusPill.text}</span>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 22, borderBottom: '1px solid #f0f1f4', margin: '14px 0 0' }}>
            {([['subtask', `Sub Task`], ['details', 'Details'], ['attachment', `Attachment${attachments.length ? ` (${attachments.length})` : ''}`]] as const).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '12px 0', fontSize: 14, fontWeight: 700, color: tab === id ? '#17191c' : '#8a8f98', borderBottom: `2.5px solid ${tab === id ? '#17191c' : 'transparent'}`, marginBottom: -1 }}>{label}</button>
            ))}
          </div>

          {/* SUB TASK tab */}
          {tab === 'subtask' && (
            <div style={{ paddingTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#17191c' }}>Our Design Process</span>
                <span style={{ fontSize: 13, color: '#8a8f98', fontWeight: 600 }}>{subtasksDone} of {subtasks.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {subtasks.map(st => (
                  <div key={st.id} style={{ border: '1px solid #f0f1f4', borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                      <button onClick={() => toggleSubtask(st.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0, marginTop: 1 }}>
                        {st.done ? <CheckCircle2 size={20} color="#22c55e" strokeWidth={2.4} /> : <Circle size={20} color="#c7ccd3" strokeWidth={2} />}
                      </button>
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: st.done ? '#a4abb5' : '#2b2f36', lineHeight: 1.4, textDecoration: st.done ? 'line-through' : 'none' }}>{st.title}</span>
                      <button onClick={() => removeSubtask(st.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#c7ccd3', display: 'flex', flexShrink: 0 }}><X size={15} /></button>
                    </div>
                    {st.blocker && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, marginLeft: 31, fontSize: 12.5, color: '#ef4444', fontWeight: 600 }}>
                        <AlertCircle size={13} /> <span><strong>Blocker</strong> {st.blocker}</span>
                      </div>
                    )}
                  </div>
                ))}
                {subtasks.length === 0 && <p style={{ fontSize: 13.5, color: '#b0b4ba', margin: '4px 0 8px' }}>No sub-tasks yet.</p>}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <input value={newSubtask} onChange={e => setNewSubtask(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSubtask()} placeholder="Add a sub-task…"
                  style={{ flex: 1, padding: '10px 13px', border: '1px solid #e6e9f0', borderRadius: 10, fontSize: 13.5, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                <button onClick={addSubtask} style={{ padding: '10px 16px', background: '#17191c', color: 'white', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Add</button>
              </div>
            </div>
          )}

          {/* DETAILS tab */}
          {tab === 'details' && (
            <div style={{ paddingTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Deal value', value: fmt(deal.value) },
                { label: 'Probability', value: `${deal.probability}%` },
                { label: 'Contact', value: deal.contactName || '—' },
                { label: 'Source', value: deal.source || '—' },
                { label: 'Priority', value: pc.label },
                { label: 'Time tracked', value: fmtTime(Math.round(timeTracked / 60)) },
              ].map(f => (
                <div key={f.label} style={{ border: '1px solid #f0f1f4', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11.5, color: '#8a8f98', fontWeight: 600, marginBottom: 4 }}>{f.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#17191c' }}>{f.value}</div>
                </div>
              ))}
              {(prevStage || nextStage) && (
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, marginTop: 2 }}>
                  {prevStage && <button onClick={() => moveToStage(prevStage)} style={{ flex: 1, padding: '10px', border: '1px solid #e6e9f0', borderRadius: 10, background: 'white', color: '#374151', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><ChevronLeft size={14} /> {prevStage.name}</button>}
                  {nextStage && <button onClick={() => moveToStage(nextStage)} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 10, background: '#17191c', color: 'white', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>{nextStage.name} <ChevronRight size={14} /></button>}
                </div>
              )}
            </div>
          )}

          {/* ATTACHMENT tab */}
          {tab === 'attachment' && (
            <div style={{ paddingTop: 16 }}>
              {attachments.length ? attachments.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #f0f1f4', borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
                  <Paperclip size={15} color="#8a8f98" /><span style={{ fontSize: 13.5, color: '#2b2f36', fontWeight: 500 }}>{a.name}</span>
                </div>
              )) : (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#b0b4ba' }}>
                  <Paperclip size={26} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>No attachments yet</p>
                </div>
              )}
            </div>
          )}

          {/* Comments */}
          <div style={{ marginTop: 24, borderTop: '1px solid #f0f1f4', paddingTop: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#17191c', marginBottom: 12 }}>Comments {activity.length > 0 && <span style={{ color: '#8a8f98', fontWeight: 600 }}>({activity.length})</span>}</div>
            <div style={{ display: 'flex', gap: 9, marginBottom: 14 }}>
              <InitialsAvatar name={deal.assignedTo || 'You'} size={30} ring="#fff" />
              <input value={newActivity} onChange={e => setNewActivity(e.target.value)} onKeyDown={e => e.key === 'Enter' && addActivity()} placeholder="Write a comment…"
                style={{ flex: 1, padding: '9px 13px', border: '1px solid #e6e9f0', borderRadius: 10, fontSize: 13.5, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              <button onClick={addActivity} style={{ padding: '9px 12px', background: '#17191c', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Send size={15} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {activity.map(a => (
                <div key={a.id} style={{ display: 'flex', gap: 10 }}>
                  <InitialsAvatar name={a.text.slice(0, 6)} size={30} ring="#fff" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#17191c' }}>{deal.assignedTo || 'Team'}</span>
                      <span style={{ fontSize: 11.5, color: '#b0b4ba' }}>{fmtRelTime(a.timestamp)}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 13.5, color: '#5c6270', lineHeight: 1.45 }}>{a.text}</p>
                  </div>
                </div>
              ))}
              {activity.length === 0 && <p style={{ fontSize: 13, color: '#b0b4ba', margin: 0 }}>No comments yet — start the conversation.</p>}
            </div>
          </div>
        </div>
      </div>

      {showLostModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.55)' }} onClick={() => setShowLostModal(false)}>
          <div style={{ backgroundColor: 'white', borderRadius: 14, width: 360, padding: 20 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>Mark as Lost?</h3>
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
  const [showDesigner, setShowDesigner] = useState(false);
  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'won' | 'lost'>('all');
  // Manual by default: a board whose cards are always re-sorted cannot be
  // arranged by hand, and arranging by hand is what a board is for.
  const [sortBy, setSortBy] = useState<SortKey>('manual');
  const [showSortMenu, setShowSortMenu] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editDealId, setEditDealId] = useState<string | null>(null);
  const [formDefaultStage, setFormDefaultStage] = useState('');

  const [detailDealId, setDetailDealId] = useState<string | null>(null);

  const [dragOverStage, setDragOverStage] = useState('');
  /**
   * Where the card would land in the column currently under the pointer.
   *
   * Kept in a ref as well as state: `drop` can arrive in the same tick as the
   * `dragover` that set it, and a handler closed over the previous render would
   * read a stale index and quietly append. The state drives the indicator; the
   * ref is what the drop reads.
   */
  const [dropIndex, setDropIndexState] = useState<number | null>(null);
  const dropIndexRef = useRef<number | null>(null);
  const setDropIndex = useCallback((n: number | null) => {
    dropIndexRef.current = n;
    setDropIndexState(n);
  }, []);
  /** The card being dragged, so it can be dimmed while it is in flight. */
  const [draggingId, setDraggingId] = useState('');
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
      <Header title="Deals" subtitle="Move opportunities through to won" />
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 16 }}>No pipelines yet.</p>
        <button onClick={() => setShowPipelineModal(true)}
          style={{ padding: '10px 20px', backgroundColor: '#17191c', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
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

  /* Sub-tasks are edited from the card cover as well as the detail panel, so
     both entry points go through these rather than each rebuilding the list. */

  const addSubtaskToDeal = (deal: Deal, title: string) => {
    const clean = title.trim();
    if (!clean) return;
    const item: SubTask = {
      id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: clean.slice(0, 200),
      done: false,
      createdAt: new Date().toISOString(),
    };
    updateDeal(deal.id, { subtasks: [...(deal.subtasks ?? []), item] });
  };

  const toggleSubtaskOnDeal = (deal: Deal, subtaskId: string) => {
    updateDeal(deal.id, {
      subtasks: (deal.subtasks ?? []).map(s => (s.id === subtaskId ? { ...s, done: !s.done } : s)),
    });
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

  /**
   * Move a deal between stages, or reorder it inside one.
   *
   * `atIndex` is where the pointer was released, counted against the stage's
   * list with the dragged card already taken out. Leaving it undefined appends,
   * which is what the non-drag callers (the detail panel's stage picker) want.
   */
  const moveDeal = (dealId: string, fromStageId: string, toStageId: string, atIndex?: number) => {
    const sameStage = fromStageId === toStageId;
    // Nothing to do only when the stage is unchanged *and* no position was asked for.
    if (sameStage && atIndex === undefined) return;
    const toStage = selected.stages.find(s => s.id === toStageId);
    if (!toStage) return;

    let moving: Deal | undefined;
    const without = selected.stages.map(s => {
      if (s.id === fromStageId) { moving = s.deals.find(d => d.id === dealId); return { ...s, deals: s.deals.filter(d => d.id !== dealId) }; }
      return s;
    });
    if (!moving) return;

    const updated: Deal = sameStage
      ? moving
      : { ...moving, stage: toStage.name, lastStageChangedAt: new Date().toISOString() };

    const movedStages = without.map(s => {
      if (s.id !== toStageId) return s;
      const at = atIndex === undefined ? s.deals.length : Math.max(0, Math.min(atIndex, s.deals.length));
      const deals = [...s.deals];
      deals.splice(at, 0, updated);
      return { ...s, deals };
    });

    // A reorder inside a stage is not a stage change, so it must not fire the
    // "deal moved" automations — that would re-run the same rules on every nudge.
    if (sameStage) {
      updatePipeline(selected.id, { stages: movedStages });
      return;
    }

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
        /* A stage with a playbook hands its tasks to every deal that lands in
           it, which is the whole point of having designed one. Anything the
           form already put on the list stays in front of them. */
        checklist: [...(data.checklist ?? []), ...playbookChecklist(targetStage)],
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
    // Firefox will not start a drag unless something is on the transfer.
    try { e.dataTransfer.setData('text/plain', deal.id); } catch { /* older browsers */ }
    setDraggingId(deal.id);
  };

  /**
   * Over the column but not over a card — the cards stop this event, so
   * reaching here means the empty space below them. The card lands at the end.
   */
  const handleDragOver = (e: DragEvent<HTMLDivElement>, stageId: string, count: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stageId);
    // The gaps between cards belong to the column, so crossing one would snap
    // the indicator to the bottom and back. Only claim the end position when the
    // pointer is actually past the last card.
    const cards = e.currentTarget.querySelectorAll('[draggable="true"]');
    const last = cards[cards.length - 1];
    if (last && e.clientY < last.getBoundingClientRect().bottom) return;
    setDropIndex(count);
  };

  /**
   * Over a card. Which side of it the pointer is on decides whether the dragged
   * card goes above or below — the same rule every board uses, and the reason a
   * drop can land anywhere in the column rather than always at the bottom.
   */
  const handleCardDragOver = (e: DragEvent<HTMLDivElement>, stageId: string, index: number) => {
    if (!dragDealId.current) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const box = e.currentTarget.getBoundingClientRect();
    const below = e.clientY > box.top + box.height / 2;
    setDragOverStage(stageId);
    setDropIndex(below ? index + 1 : index);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, toStageId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const dealId = dragDealId.current;
    const fromStage = dragFromStage.current;
    const target = dropIndexRef.current;

    setDragOverStage('');
    setDropIndex(null);
    setDraggingId('');
    dragDealId.current = '';
    dragFromStage.current = '';
    if (!dealId) return;

    // `dropIndex` counts positions in the filtered, on-screen list — which still
    // contains the dragged card when it came from this same column. So resolve
    // it to the card it was dropped in front of, then find *that* card in the
    // stage's own array with the dragged one taken out. Going through the
    // anchor is what keeps a filtered or sorted board landing where the pointer
    // was, and avoids the off-by-one when a card is dragged downwards.
    const stage = selected.stages.find(s => s.id === toStageId);
    let atIndex: number | undefined;
    if (stage && target !== null) {
      const shown = applyFilter(stage.deals);
      const remaining = stage.deals.filter(d => d.id !== dealId);
      const anchor = shown[target];
      // Dropped onto its own top edge: the card is already there.
      if (anchor?.id === dealId) return;
      const at = anchor ? remaining.findIndex(d => d.id === anchor.id) : -1;
      atIndex = at < 0 ? remaining.length : at;
    }

    // A position was pointed at, so a sort would immediately throw it away.
    // Switch to manual order and say so rather than silently ignoring the drop.
    if (atIndex !== undefined && sortBy !== 'manual') {
      setSortBy('manual');
      addNotification(`Switched to manual order so "${SORT_LABELS[sortBy]}" sorting does not undo your placement.`, 'info');
    }
    moveDeal(dealId, fromStage, toStageId, atIndex);
  };

  const handleDragEnd = () => {
    setDragOverStage('');
    setDropIndex(null);
    setDraggingId('');
    dragDealId.current = '';
    dragFromStage.current = '';
  };

  // ── Filter + Sort ─────────────────────────────────────────────────────────
  const applyFilter = (deals: Deal[]) => {
    let r = deals;
    if (search) r = r.filter(d => d.title.toLowerCase().includes(search.toLowerCase()) || d.contactName.toLowerCase().includes(search.toLowerCase()));
    if (filterPriority !== 'all') r = r.filter(d => (d.priority ?? 'normal') === filterPriority);
    if (filterStatus !== 'all') r = r.filter(d => (d.status ?? 'active') === filterStatus);
    // Manual keeps the order the cards were dragged into.
    if (sortBy === 'manual') return r;
    return [...r].sort((a, b) => {
      if (sortBy === 'value') return b.value - a.value;
      if (sortBy === 'close') return (a.expectedClose || '9999').localeCompare(b.expectedClose || '9999');
      if (sortBy === 'priority') return (PRIORITY_ORDER[a.priority ?? 'normal'] ?? 2) - (PRIORITY_ORDER[b.priority ?? 'normal'] ?? 2);
      // Longest in the stage first — the ones going stale are the ones to look at.
      if (sortBy === 'days') return daysInStage(b) - daysInStage(a);
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

  const SORT_LABELS: Record<SortKey, string> = { manual: 'Manual', title: 'Name', value: 'Value', close: 'Close Date', priority: 'Priority', days: 'Days in Stage' };

  const saveCardFields = (fields: Set<CardFieldKey>) => {
    setCardFields(fields);
    try { localStorage.setItem('crm_card_fields', JSON.stringify([...fields])); } catch { /* ignore */ }
  };
  const saveRottingDays = (days: number) => {
    setRottingDays(days);
    try { localStorage.setItem('crm_rotting_days', String(days)); } catch { /* ignore */ }
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header title="Deals" subtitle="Move opportunities through to won" />
      <div style={{ padding: 'clamp(14px, 3vw, 28px)' }}>

        {/* Stats — four across when there is room, fewer when there is not. A
            fixed four-column grid was dragging the whole page sideways on a
            phone, which took the board and every panel on it with it. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Active Pipeline', value: fmt(totalValue), sub: `${activeDeals.length} active deals`, color: '#17191c' },
            { label: 'Weighted Value', value: fmt(weightedValue), sub: 'By probability', color: '#3b3f45' },
            { label: 'Won Revenue', value: fmt(wonValue), sub: `${wonDeals.length} won · ${lostDeals.length} lost`, color: '#22c55e' },
            { label: 'Win Rate', value: `${winRate}%`, sub: `${closedTotal} closed deals`, color: '#f59e0b' },
          ].map(item => (
            <div key={item.label} style={{ backgroundColor: 'white', borderRadius: 18, padding: '20px 22px', border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
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
          <div style={{ display: 'flex', flexWrap: 'wrap', backgroundColor: '#f1f5f9', borderRadius: 8, padding: 3, gap: 2 }}>
            {([
              ['board',    <LayoutGrid size={13} />,  'Board'],
              ['list',     <List size={13} />,         'List'],
              ['table',    <Table2 size={13} />,       'Table'],
              ['calendar', <Calendar size={13} />,    'Calendar'],
              ['funnel',   <TrendingUp size={13} />,  'Funnel'],
              ['gantt',    <CalendarDays size={13} />, 'Gantt'],
            ] as const).map(([v, icon, label]) => (
              <button key={v} onClick={() => setView(v as ViewMode)} aria-pressed={view === v}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 6, border: 'none', backgroundColor: view === v ? 'white' : 'transparent', color: view === v ? '#17191c' : '#64748b', fontSize: 12, fontWeight: view === v ? 700 : 500, cursor: 'pointer', boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', whiteSpace: 'nowrap' }}>
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
                    style={{ display: 'block', width: '100%', padding: '9px 14px', textAlign: 'left', border: 'none', backgroundColor: sortBy === key ? '#f0f9ff' : 'white', color: sortBy === key ? '#17191c' : '#374151', fontSize: 13, fontWeight: sortBy === key ? 700 : 400, cursor: 'pointer' }}>
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
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#17191c', color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <Plus size={15} /> Add Deal
          </button>

          {/* Design the pipeline from a brief */}
          <button onClick={() => setShowDesigner(true)}
            title="Describe the work and lay out the stages"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'white', color: '#17191c', border: '1px solid #d5d8dd', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <Sparkles size={14} /> Design stages
          </button>

          {/* Brain AI Button */}
          <button onClick={() => setShowBrain(prev => !prev)}
            title="ClickUp Brain — AI pipeline insights"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: showBrain ? '#17191c' : 'white', color: showBrain ? 'white' : '#17191c', border: showBrain ? 'none' : '1px solid #d5d8dd', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: showBrain ? '0 2px 8px rgba(23,25,28,0.35)' : 'none' }}>
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
                  style={{ minWidth: 280, maxWidth: 290, flex: '0 0 280px', backgroundColor: '#f4f6fa', borderRadius: 18, padding: '10px 10px 12px' }}
                  onDragOver={e => handleDragOver(e, stage.id, deals.length)}
                  onDrop={e => handleDrop(e, stage.id)}
                  onDragLeave={e => {
                    // Only when the pointer actually left the column, not when it
                    // crossed onto a card inside it.
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                      setDragOverStage('');
                      setDropIndex(null);
                    }
                  }}>

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
                  <div style={{ minHeight: 80, padding: '4px 0', borderRadius: 10, backgroundColor: isOver ? '#eceef1' : 'transparent', border: isOver ? '2px dashed #17191c' : '2px dashed transparent', transition: 'all 0.15s' }}>
                    {deals.map((deal, dealIdx) => (
                      <Fragment key={deal.id}>
                        {isOver && dropIndex === dealIdx && <DropLine />}
                        <DealCard
                          deal={deal}
                          stageId={stage.id}
                          visibleFields={cardFields}
                          rottingDays={rottingDays}
                          dimmed={draggingId === deal.id}
                          onEdit={openEditDeal}
                          onDelete={deleteDeal}
                          onOpen={d => setDetailDealId(d.id)}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                          onDragOverCard={e => handleCardDragOver(e, stage.id, dealIdx)}
                          onMarkWon={markDealWon}
                          onMarkLost={markDealLost}
                          onAddSubtask={addSubtaskToDeal}
                          onToggleSubtask={toggleSubtaskOnDeal}
                        />
                      </Fragment>
                    ))}
                    {isOver && dropIndex !== null && dropIndex >= deals.length && <DropLine />}
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
                    <button onClick={addStage} style={{ flex: 1, padding: '7px', backgroundColor: '#17191c', color: 'white', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add</button>
                    <button onClick={() => setAddingStage(false)} style={{ flex: 1, padding: '7px', backgroundColor: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingStage(true)}
                  style={{ width: '100%', padding: '12px', border: '2px dashed #d1d5db', borderRadius: 10, backgroundColor: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.1s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#17191c'; e.currentTarget.style.color = '#17191c'; }}
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
          <div style={{ backgroundColor: 'white', borderRadius: 18, border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', overflow: 'hidden' }}>
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
                      <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600, color: '#17191c', whiteSpace: 'nowrap' }}>{fmt(Math.round(deal.value * deal.probability / 100))}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 50, height: 5, backgroundColor: '#e2e8f0', borderRadius: 3 }}>
                            <div style={{ height: '100%', width: `${deal.probability}%`, backgroundColor: '#17191c', borderRadius: 3 }} />
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
                              <div style={{ height: '100%', width: `${(dn / cl.length) * 100}%`, backgroundColor: dn === cl.length ? '#22c55e' : '#17191c', borderRadius: 2 }} />
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

      {showDesigner && (
        <PipelineDesigner
          pipeline={selected}
          onClose={() => setShowDesigner(false)}
          onApply={stages => {
            /* Every stage that gained a playbook offers it to the deals already
               sitting in it, so applying a design does something for the board
               as it stands and not only for deals created after today. */
            let touched = 0;
            const seeded = stages.map(st => {
              const r = seedExistingDeals(st);
              touched += r.touched;
              return r.stage;
            });
            updatePipeline(selected.id, { stages: seeded });
            setShowDesigner(false);
            addNotification(
              touched > 0
                ? `${selected.name} rebuilt — ${seeded.length} stages, and ${touched} deal${touched === 1 ? '' : 's'} picked up their stage's tasks.`
                : `${selected.name} rebuilt — ${seeded.length} stages.`,
            );
          }}
        />
      )}

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
