import { useState, useEffect } from 'react';
import {
  Zap, X, Plus, Trash2, ChevronRight, Activity, ToggleLeft, ToggleRight,
  ArrowRight, Flag, Tag, Percent, Trophy, XCircle, ListChecks, Bell, MoveRight,
} from 'lucide-react';
import type { Deal, Stage } from '../../types';

/* ═══════════════════════════════════════════════════════════════
   Automation engine — Trello Butler / ClickUp Automations style.
   Rules are "WHEN <trigger> THEN <actions>" and run client-side
   whenever deals are created, moved, or go idle.
   ═══════════════════════════════════════════════════════════════ */

export type TriggerType = 'deal_created' | 'deal_moved' | 'deal_idle' | 'value_above';
export type ActionType =
  | 'move_to_stage' | 'set_priority' | 'add_label' | 'set_probability'
  | 'mark_won' | 'mark_lost' | 'add_checklist' | 'notify';

export interface AutomationTrigger {
  type: TriggerType;
  stageId?: string;   // deal_moved: destination stage · deal_created/deal_idle: stage filter (empty = any)
  days?: number;      // deal_idle: days without stage change
  amount?: number;    // value_above: minimum deal value
}

export interface AutomationAction {
  type: ActionType;
  stageId?: string;
  priority?: 'urgent' | 'high' | 'normal' | 'low';
  labelText?: string;
  labelColor?: string;
  probability?: number;
  checklistText?: string;
  message?: string;
}

export interface AutomationRule {
  id: string;
  pipelineId: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  runs: number;
  createdAt: string;
}

export interface AutomationLogEntry {
  id: string;
  ruleName: string;
  dealTitle: string;
  summary: string;
  at: string;
}

/* ── Storage ── */
const RULES_KEY = 'crm_pipeline_automations';
const LOG_KEY = 'crm_automation_log';
const IDLE_DONE_KEY = 'crm_automation_idle_done';

export function loadAutomationRules(): AutomationRule[] {
  try { return JSON.parse(localStorage.getItem(RULES_KEY) || '[]'); } catch { return []; }
}
export function saveAutomationRules(rules: AutomationRule[]) {
  try { localStorage.setItem(RULES_KEY, JSON.stringify(rules)); } catch { /* ignore */ }
}
export function loadAutomationLog(): AutomationLogEntry[] {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; }
}
export function appendAutomationLog(entries: AutomationLogEntry[]) {
  const log = [...entries, ...loadAutomationLog()].slice(0, 100);
  try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch { /* ignore */ }
}
function loadIdleDone(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(IDLE_DONE_KEY) || '[]')); } catch { return new Set(); }
}
function saveIdleDone(done: Set<string>) {
  try { localStorage.setItem(IDLE_DONE_KEY, JSON.stringify([...done].slice(-500))); } catch { /* ignore */ }
}

/* ── Pure engine helpers ── */
function mutateDeal(stages: Stage[], dealId: string, fn: (d: Deal) => Deal): Stage[] {
  return stages.map(s => ({ ...s, deals: s.deals.map(d => d.id === dealId ? fn(d) : d) }));
}

function moveDealPure(stages: Stage[], dealId: string, toStageId: string): Stage[] {
  const toStage = stages.find(s => s.id === toStageId);
  if (!toStage) return stages;
  let moving: Deal | undefined;
  const without = stages.map(s => {
    const found = s.deals.find(d => d.id === dealId);
    if (found && s.id !== toStageId) { moving = found; return { ...s, deals: s.deals.filter(d => d.id !== dealId) }; }
    return s;
  });
  if (!moving) return stages;
  const updated = { ...moving, stage: toStage.name, lastStageChangedAt: new Date().toISOString() };
  return without.map(s => s.id === toStageId ? { ...s, deals: [...s.deals, updated] } : s);
}

export function describeAction(a: AutomationAction, stages: Stage[]): string {
  switch (a.type) {
    case 'move_to_stage': return `move to "${stages.find(s => s.id === a.stageId)?.name ?? '?'}"`;
    case 'set_priority': return `set priority to ${a.priority}`;
    case 'add_label': return `add label "${a.labelText}"`;
    case 'set_probability': return `set probability to ${a.probability}%`;
    case 'mark_won': return 'mark as Won';
    case 'mark_lost': return 'mark as Lost';
    case 'add_checklist': return `add checklist item "${a.checklistText}"`;
    case 'notify': return `notify "${a.message}"`;
  }
}

export function describeTrigger(t: AutomationTrigger, stages: Stage[]): string {
  const stageName = t.stageId ? `"${stages.find(s => s.id === t.stageId)?.name ?? '?'}"` : 'any stage';
  switch (t.type) {
    case 'deal_created': return `a deal is created in ${stageName}`;
    case 'deal_moved': return `a deal is moved to ${stageName}`;
    case 'deal_idle': return `a deal sits in ${stageName} for ${t.days ?? 7}+ days`;
    case 'value_above': return `a deal worth $${(t.amount ?? 0).toLocaleString()}+ is added or moved`;
  }
}

/** Apply one rule's actions to a deal. Single pass — automation-triggered
    moves intentionally do NOT re-trigger other rules (prevents loops). */
function applyActions(stages: Stage[], dealId: string, actions: AutomationAction[]): { stages: Stage[]; notes: string[] } {
  let out = stages;
  const notes: string[] = [];
  for (const a of actions) {
    switch (a.type) {
      case 'move_to_stage':
        if (a.stageId) out = moveDealPure(out, dealId, a.stageId);
        break;
      case 'set_priority':
        out = mutateDeal(out, dealId, d => ({ ...d, priority: a.priority ?? 'normal' }));
        break;
      case 'add_label':
        out = mutateDeal(out, dealId, d => {
          const labels = d.labels ?? [];
          if (labels.some(l => l.text === a.labelText)) return d;
          return { ...d, labels: [...labels, { text: a.labelText ?? 'Auto', color: a.labelColor ?? '#3b3f45' }] };
        });
        break;
      case 'set_probability':
        out = mutateDeal(out, dealId, d => ({ ...d, probability: Math.max(0, Math.min(100, a.probability ?? 50)) }));
        break;
      case 'mark_won':
        out = mutateDeal(out, dealId, d => ({ ...d, status: 'won', probability: 100, closedAt: new Date().toISOString() }));
        break;
      case 'mark_lost':
        out = mutateDeal(out, dealId, d => ({ ...d, status: 'lost', probability: 0, closedAt: new Date().toISOString() }));
        break;
      case 'add_checklist':
        out = mutateDeal(out, dealId, d => ({
          ...d,
          checklist: [...(d.checklist ?? []), { id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text: a.checklistText ?? 'Follow up', done: false }],
        }));
        break;
      case 'notify':
        if (a.message) notes.push(a.message);
        break;
    }
  }
  return { stages: out, notes };
}

export interface AutomationRunResult {
  stages: Stage[];
  ran: { rule: AutomationRule; dealTitle: string }[];
  notes: string[];
}

/** Run all matching enabled rules for an event against one deal. */
export function runAutomations(
  stages: Stage[],
  dealId: string,
  event: { type: 'deal_created' | 'deal_moved'; stageId: string },
  rules: AutomationRule[],
  pipelineId: string,
): AutomationRunResult {
  let out = stages;
  const ran: AutomationRunResult['ran'] = [];
  const notes: string[] = [];
  const deal = stages.flatMap(s => s.deals).find(d => d.id === dealId);
  if (!deal) return { stages, ran, notes };

  for (const rule of rules) {
    if (!rule.enabled || rule.pipelineId !== pipelineId) continue;
    const t = rule.trigger;
    let matches = false;
    if (t.type === event.type) {
      matches = !t.stageId || t.stageId === event.stageId;
    } else if (t.type === 'value_above') {
      matches = deal.value >= (t.amount ?? 0);
    }
    if (!matches) continue;
    const res = applyActions(out, dealId, rule.actions);
    out = res.stages;
    notes.push(...res.notes);
    ran.push({ rule, dealTitle: deal.title });
  }
  return { stages: out, ran, notes };
}

/** Sweep for idle deals (run on pipeline load). Dedup key includes
    lastStageChangedAt so a rule re-fires only after the deal moves again. */
export function runIdleSweep(
  stages: Stage[],
  rules: AutomationRule[],
  pipelineId: string,
): AutomationRunResult {
  let out = stages;
  const ran: AutomationRunResult['ran'] = [];
  const notes: string[] = [];
  const done = loadIdleDone();
  let dirty = false;

  for (const rule of rules) {
    if (!rule.enabled || rule.pipelineId !== pipelineId || rule.trigger.type !== 'deal_idle') continue;
    const minDays = rule.trigger.days ?? 7;
    for (const stage of stages) {
      if (rule.trigger.stageId && rule.trigger.stageId !== stage.id) continue;
      for (const deal of stage.deals) {
        if ((deal.status ?? 'active') !== 'active') continue;
        const ref = deal.lastStageChangedAt ?? deal.createdAt;
        const days = Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000);
        if (days < minDays) continue;
        const key = `${rule.id}:${deal.id}:${ref}`;
        if (done.has(key)) continue;
        const res = applyActions(out, deal.id, rule.actions);
        out = res.stages;
        notes.push(...res.notes);
        ran.push({ rule, dealTitle: deal.title });
        done.add(key);
        dirty = true;
      }
    }
  }
  if (dirty) saveIdleDone(done);
  return { stages: out, ran, notes };
}

/* ═══════════════════════════════════════════════════════════════
   Confetti burst — celebration on Won deals (Asana-style delight)
   ═══════════════════════════════════════════════════════════════ */
const CONFETTI_COLORS = ['#17191c', '#3b3f45', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#f97316'];

export function ConfettiBurst({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [onDone]);

  const pieces = Array.from({ length: 70 }, (_, i) => {
    const left = Math.random() * 100;
    const delay = Math.random() * 0.35;
    const duration = 1 + Math.random() * 0.7;
    const size = 6 + Math.random() * 7;
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    const rotate = Math.random() * 720 - 360;
    const round = Math.random() > 0.6;
    return { left, delay, duration, size, color, rotate, round, id: i };
  });

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999, overflow: 'hidden' }}>
      {pieces.map(p => (
        <span key={p.id} style={{
          position: 'absolute', top: -16, left: `${p.left}%`,
          width: p.size, height: p.round ? p.size : p.size * 1.6,
          backgroundColor: p.color, borderRadius: p.round ? '50%' : 2,
          animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
          ['--rot' as string]: `${p.rotate}deg`,
        }} />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(105vh) rotate(var(--rot)); opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Automations modal UI
   ═══════════════════════════════════════════════════════════════ */
const TRIGGER_OPTIONS: { value: TriggerType; label: string }[] = [
  { value: 'deal_moved', label: 'Deal is moved to a stage' },
  { value: 'deal_created', label: 'Deal is created' },
  { value: 'deal_idle', label: 'Deal is idle in a stage' },
  { value: 'value_above', label: 'Deal value is above amount' },
];

const ACTION_OPTIONS: { value: ActionType; label: string; icon: typeof Flag }[] = [
  { value: 'set_priority', label: 'Set priority', icon: Flag },
  { value: 'move_to_stage', label: 'Move to stage', icon: MoveRight },
  { value: 'add_label', label: 'Add label', icon: Tag },
  { value: 'set_probability', label: 'Set probability', icon: Percent },
  { value: 'add_checklist', label: 'Add checklist item', icon: ListChecks },
  { value: 'notify', label: 'Send notification', icon: Bell },
  { value: 'mark_won', label: 'Mark as Won', icon: Trophy },
  { value: 'mark_lost', label: 'Mark as Lost', icon: XCircle },
];

const LABEL_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#3b3f45', '#ec4899', '#14b8a6'];

const inp: React.CSSProperties = { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', backgroundColor: '#fff', fontFamily: 'inherit', boxSizing: 'border-box' };

interface AutomationsModalProps {
  pipelineId: string;
  stages: Stage[];
  rules: AutomationRule[];
  onRulesChange: (rules: AutomationRule[]) => void;
  onClose: () => void;
}

export function AutomationsModal({ pipelineId, stages, rules, onRulesChange, onClose }: AutomationsModalProps) {
  // Escape closes it, as it does for every other overlay in this module.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const [tab, setTab] = useState<'rules' | 'log'>('rules');
  const [building, setBuilding] = useState(false);
  const [trigger, setTrigger] = useState<AutomationTrigger>({ type: 'deal_moved', stageId: stages[0]?.id });
  const [actions, setActions] = useState<AutomationAction[]>([{ type: 'set_priority', priority: 'high' }]);
  const [ruleName, setRuleName] = useState('');
  const log = loadAutomationLog();

  const myRules = rules.filter(r => r.pipelineId === pipelineId);

  const addAction = () => setActions(prev => [...prev, { type: 'set_priority', priority: 'high' }]);
  const updateAction = (i: number, patch: Partial<AutomationAction>) => {
    setActions(prev => prev.map((a, idx) => idx === i ? { ...a, ...patch } : a));
  };
  const changeActionType = (i: number, type: ActionType) => {
    const defaults: AutomationAction =
      type === 'set_priority' ? { type, priority: 'high' } :
      type === 'move_to_stage' ? { type, stageId: stages[0]?.id } :
      type === 'add_label' ? { type, labelText: 'Hot', labelColor: '#ef4444' } :
      type === 'set_probability' ? { type, probability: 75 } :
      type === 'add_checklist' ? { type, checklistText: 'Follow up with contact' } :
      type === 'notify' ? { type, message: 'Deal needs attention' } :
      { type };
    setActions(prev => prev.map((a, idx) => idx === i ? defaults : a));
  };

  const saveRule = () => {
    if (actions.length === 0) return;
    const name = ruleName.trim() || `When ${describeTrigger(trigger, stages)} → ${actions.map(a => describeAction(a, stages)).join(', ')}`;
    const rule: AutomationRule = {
      id: `auto-${Date.now()}`,
      pipelineId,
      name,
      enabled: true,
      trigger,
      actions,
      runs: 0,
      createdAt: new Date().toISOString(),
    };
    onRulesChange([...rules, rule]);
    setBuilding(false);
    setRuleName('');
    setTrigger({ type: 'deal_moved', stageId: stages[0]?.id });
    setActions([{ type: 'set_priority', priority: 'high' }]);
  };

  const toggleRule = (id: string) => onRulesChange(rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  const deleteRule = (id: string) => onRulesChange(rules.filter(r => r.id !== id));

  const stageSelect = (value: string | undefined, onChange: (v: string) => void, allowAny = false) => (
    <select value={value ?? ''} onChange={e => onChange(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
      {allowAny && <option value="">any stage</option>}
      {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px -12px rgba(16,24,40,0.25)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(135deg,#f59e0b,#f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}>
                <Zap size={20} color="white" fill="white" />
              </div>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.01em' }}>Automations</h2>
                <p style={{ fontSize: 12.5, color: '#8492a6', margin: '2px 0 0' }}>When something happens, do something — automatically.</p>
              </div>
            </div>
            <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, padding: 7, display: 'flex', cursor: 'pointer' }}><X size={16} color="#64748b" /></button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 20, borderBottom: '1px solid #e9edf3' }}>
            {([['rules', 'Rules', myRules.length], ['log', 'Activity', log.length]] as const).map(([id, label, count]) => (
              <button key={id} onClick={() => setTab(id)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 2px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: tab === id ? '#17191c' : '#64748b', borderBottom: tab === id ? '2px solid #17191c' : '2px solid transparent', marginBottom: -1 }}>
                {id === 'rules' ? <Zap size={13} /> : <Activity size={13} />} {label}
                <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 999, background: tab === id ? '#eceef1' : '#f1f5f9', color: tab === id ? '#17191c' : '#94a3b8', fontWeight: 700 }}>{count}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px 24px' }}>
          {tab === 'rules' && (
            <>
              {/* Existing rules */}
              {myRules.length === 0 && !building && (
                <div style={{ textAlign: 'center', padding: '36px 20px' }}>
                  <div style={{ width: 64, height: 64, borderRadius: 18, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                    <Zap size={28} color="#f59e0b" />
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>No automations yet</div>
                  <p style={{ fontSize: 13, color: '#8492a6', margin: '0 0 18px', lineHeight: 1.6 }}>
                    Automate the busywork — auto-set priorities, move deals,<br />flag idle opportunities, and celebrate wins.
                  </p>
                </div>
              )}

              {myRules.map(rule => (
                <div key={rule.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', border: '1px solid #e6e9f0', borderRadius: 12, marginBottom: 10, background: rule.enabled ? '#fff' : '#fafbfc', opacity: rule.enabled ? 1 : 0.65 }}>
                  <button onClick={() => toggleRule(rule.id)} title={rule.enabled ? 'Disable' : 'Enable'}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0, marginTop: 1 }}>
                    {rule.enabled ? <ToggleRight size={26} color="#17191c" /> : <ToggleLeft size={26} color="#cbd5e1" />}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', lineHeight: 1.45 }}>
                      <span style={{ color: '#f59e0b', fontWeight: 700 }}>WHEN</span> {describeTrigger(rule.trigger, stages)}
                    </div>
                    <div style={{ fontSize: 13, color: '#475569', marginTop: 3, lineHeight: 1.45 }}>
                      <span style={{ color: '#17191c', fontWeight: 700 }}>THEN</span> {rule.actions.map(a => describeAction(a, stages)).join(' · ')}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 5 }}>
                      Ran {rule.runs} time{rule.runs === 1 ? '' : 's'}
                    </div>
                  </div>
                  <button onClick={() => deleteRule(rule.id)} title="Delete rule"
                    style={{ border: 'none', background: '#fef2f2', borderRadius: 7, padding: 6, cursor: 'pointer', display: 'flex', flexShrink: 0 }}>
                    <Trash2 size={13} color="#dc2626" />
                  </button>
                </div>
              ))}

              {/* Builder */}
              {building ? (
                <div style={{ border: '1px solid #d5d8dd', borderRadius: 14, padding: 18, background: '#fafbff', marginTop: 4 }}>
                  <input value={ruleName} onChange={e => setRuleName(e.target.value)} placeholder="Rule name (optional — auto-generated)"
                    style={{ ...inp, width: '100%', marginBottom: 14, fontWeight: 600 }} />

                  {/* WHEN */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#f59e0b', letterSpacing: '0.06em', marginBottom: 8 }}>⚡ WHEN</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <select value={trigger.type}
                        onChange={e => {
                          const type = e.target.value as TriggerType;
                          setTrigger(
                            type === 'deal_idle' ? { type, days: 7, stageId: '' } :
                            type === 'value_above' ? { type, amount: 10000 } :
                            { type, stageId: type === 'deal_moved' ? stages[0]?.id : '' }
                          );
                        }}
                        style={{ ...inp, cursor: 'pointer', fontWeight: 600 }}>
                        {TRIGGER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      {(trigger.type === 'deal_moved' || trigger.type === 'deal_created' || trigger.type === 'deal_idle') &&
                        stageSelect(trigger.stageId, v => setTrigger(prev => ({ ...prev, stageId: v })), trigger.type !== 'deal_moved')}
                      {trigger.type === 'deal_idle' && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569' }}>
                          for <input type="number" min={1} max={365} value={trigger.days ?? 7}
                            onChange={e => setTrigger(prev => ({ ...prev, days: Number(e.target.value) }))}
                            style={{ ...inp, width: 64 }} /> days
                        </span>
                      )}
                      {trigger.type === 'value_above' && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569' }}>
                          $ <input type="number" min={0} value={trigger.amount ?? 0}
                            onChange={e => setTrigger(prev => ({ ...prev, amount: Number(e.target.value) }))}
                            style={{ ...inp, width: 110 }} />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* THEN */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#17191c', letterSpacing: '0.06em', marginBottom: 8 }}>→ THEN</div>
                    {actions.map((a, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                        <ChevronRight size={13} color="#d5d8dd" style={{ flexShrink: 0 }} />
                        <select value={a.type} onChange={e => changeActionType(i, e.target.value as ActionType)}
                          style={{ ...inp, cursor: 'pointer', fontWeight: 600 }}>
                          {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        {a.type === 'set_priority' && (
                          <select value={a.priority} onChange={e => updateAction(i, { priority: e.target.value as AutomationAction['priority'] })} style={{ ...inp, cursor: 'pointer' }}>
                            {(['urgent', 'high', 'normal', 'low'] as const).map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        )}
                        {a.type === 'move_to_stage' && stageSelect(a.stageId, v => updateAction(i, { stageId: v }))}
                        {a.type === 'add_label' && (
                          <>
                            <input value={a.labelText ?? ''} onChange={e => updateAction(i, { labelText: e.target.value })} placeholder="Label text" style={{ ...inp, width: 120 }} />
                            <div style={{ display: 'flex', gap: 4 }}>
                              {LABEL_COLORS.map(c => (
                                <button key={c} onClick={() => updateAction(i, { labelColor: c })}
                                  style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: c, border: a.labelColor === c ? '2px solid #0f172a' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
                              ))}
                            </div>
                          </>
                        )}
                        {a.type === 'set_probability' && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569' }}>
                            <input type="number" min={0} max={100} value={a.probability ?? 50}
                              onChange={e => updateAction(i, { probability: Number(e.target.value) })} style={{ ...inp, width: 64 }} /> %
                          </span>
                        )}
                        {a.type === 'add_checklist' && (
                          <input value={a.checklistText ?? ''} onChange={e => updateAction(i, { checklistText: e.target.value })} placeholder="Checklist item" style={{ ...inp, flex: 1, minWidth: 160 }} />
                        )}
                        {a.type === 'notify' && (
                          <input value={a.message ?? ''} onChange={e => updateAction(i, { message: e.target.value })} placeholder="Notification message" style={{ ...inp, flex: 1, minWidth: 160 }} />
                        )}
                        {actions.length > 1 && (
                          <button onClick={() => setActions(prev => prev.filter((_, idx) => idx !== i))}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 3, display: 'flex' }}>
                            <X size={13} color="#94a3b8" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button onClick={addAction}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', border: '1px dashed #d5d8dd', borderRadius: 8, background: 'none', color: '#17191c', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginTop: 2 }}>
                      <Plus size={12} /> Add action
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => setBuilding(false)}
                      style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 9, background: 'white', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      Cancel
                    </button>
                    <button onClick={saveRule}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', border: 'none', borderRadius: 9, background: '#17191c', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 1px 2px rgba(23,25,28,0.3)' }}>
                      <Zap size={13} /> Create Rule
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setBuilding(true)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', padding: '12px', border: '2px dashed #d5d8dd', borderRadius: 12, background: 'none', color: '#17191c', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
                  <Plus size={15} /> New Automation Rule
                </button>
              )}

              {/* Quick templates */}
              {!building && myRules.length === 0 && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Popular templates</div>
                  {[
                    { name: 'Flag stale deals', trigger: { type: 'deal_idle' as const, days: 14, stageId: '' }, actions: [{ type: 'set_priority' as const, priority: 'urgent' as const }, { type: 'add_label' as const, labelText: 'Stale', labelColor: '#ef4444' }] },
                    { name: 'Hot lead alert', trigger: { type: 'value_above' as const, amount: 25000 }, actions: [{ type: 'add_label' as const, labelText: 'Big Deal', labelColor: '#f59e0b' }, { type: 'notify' as const, message: '💰 High-value deal added — review it now!' }] },
                    { name: 'New deal checklist', trigger: { type: 'deal_created' as const, stageId: '' }, actions: [{ type: 'add_checklist' as const, checklistText: 'Qualify the lead' }, { type: 'add_checklist' as const, checklistText: 'Schedule discovery call' }] },
                  ].map(tpl => (
                    <button key={tpl.name}
                      onClick={() => {
                        const rule: AutomationRule = {
                          id: `auto-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                          pipelineId, name: tpl.name, enabled: true,
                          trigger: tpl.trigger, actions: tpl.actions,
                          runs: 0, createdAt: new Date().toISOString(),
                        };
                        onRulesChange([...rules, rule]);
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px', border: '1px solid #e6e9f0', borderRadius: 10, background: 'white', cursor: 'pointer', marginBottom: 7, textAlign: 'left' }}>
                      <Zap size={14} color="#f59e0b" style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{tpl.name}</div>
                        <div style={{ fontSize: 11.5, color: '#8492a6', marginTop: 1 }}>
                          When {describeTrigger(tpl.trigger, stages)} → {tpl.actions.map(a => describeAction(a, stages)).join(', ')}
                        </div>
                      </div>
                      <ArrowRight size={13} color="#d5d8dd" style={{ flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'log' && (
            log.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', fontSize: 13 }}>
                <Activity size={28} style={{ margin: '0 auto 10px', opacity: 0.4, display: 'block' }} />
                No automation activity yet. Rules will log their runs here.
              </div>
            ) : (
              log.map(entry => (
                <div key={entry.id} style={{ display: 'flex', gap: 10, padding: '10px 4px', borderBottom: '1px solid #f1f5f9', alignItems: 'flex-start' }}>
                  <div style={{ width: 26, height: 26, borderRadius: 8, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Zap size={12} color="#f59e0b" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: '#0f172a', fontWeight: 600 }}>{entry.ruleName}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>{entry.summary}</div>
                  </div>
                  <span style={{ fontSize: 11, color: '#b6c0cd', flexShrink: 0 }}>{new Date(entry.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
}
