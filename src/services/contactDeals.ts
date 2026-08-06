/**
 * contactDeals.ts — deal operations seen from the contact's side of the CRM.
 *
 * Deals live inside `pipeline.stages[].deals`, which is convenient for a kanban
 * board and awkward everywhere else. These helpers are pure: each one takes the
 * pipeline array and returns a new one, so the caller decides when to persist
 * through `updatePipeline`. Stage moves run the same automation engine the
 * pipeline board uses, so a move made from a contact profile behaves exactly
 * like a drag on the board.
 */

import type { Contact, Deal, Pipeline, Stage } from '../types';
import {
  loadAutomationRules, runAutomations, appendAutomationLog,
  type AutomationLogEntry,
} from '../components/Pipelines/Automations';

/** A deal enriched with where it sits, so the UI never has to re-walk pipelines. */
export interface PlacedDeal extends Deal {
  pipelineId: string;
  pipelineName: string;
  stageId: string;
  stageName: string;
  stageColor: string;
  stageIndex: number;
  stageCount: number;
}

/* ── Lookup ── */

function belongsTo(d: Deal, contact: Contact): boolean {
  if (d.contactId && d.contactId === contact.id) return true;
  if (contact.email && d.contactEmail && d.contactEmail.toLowerCase() === contact.email.toLowerCase()) return true;
  if (d.contactName && d.contactName === contact.name) return true;
  return false;
}

/** Every deal belonging to this contact, across every pipeline. */
export function placedDealsForContact(contact: Contact, pipelines: Pipeline[]): PlacedDeal[] {
  const out: PlacedDeal[] = [];
  for (const p of pipelines) {
    p.stages.forEach((st, i) => {
      for (const d of st.deals) {
        if (!belongsTo(d, contact)) continue;
        out.push({
          ...d,
          pipelineId: p.id, pipelineName: p.name,
          stageId: st.id, stageName: st.name, stageColor: st.color,
          stageIndex: i, stageCount: p.stages.length,
        });
      }
    });
  }
  return out.sort((a, b) => {
    const rank = (d: PlacedDeal) => ((d.status ?? 'active') === 'active' ? 0 : 1);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return (b.value ?? 0) - (a.value ?? 0);
  });
}

/** Find a single deal anywhere in the pipelines. */
export function findDeal(pipelines: Pipeline[], dealId: string): PlacedDeal | null {
  for (const p of pipelines) {
    for (let i = 0; i < p.stages.length; i++) {
      const st = p.stages[i];
      const d = st.deals.find(x => x.id === dealId);
      if (d) {
        return {
          ...d,
          pipelineId: p.id, pipelineName: p.name,
          stageId: st.id, stageName: st.name, stageColor: st.color,
          stageIndex: i, stageCount: p.stages.length,
        };
      }
    }
  }
  return null;
}

/* ── Win probability ── */

export interface ProbabilityComponent { label: string; points: number; detail: string; }
export interface WinProbability {
  percent: number;
  /** True when the number is derived rather than typed in by a person. */
  derived: boolean;
  components: ProbabilityComponent[];
  summary: string;
}

const daysSince = (iso?: string): number => {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
};

/**
 * A forecast probability built from stage position, contact health, deal age
 * and momentum. Every component is returned so the UI can justify the number —
 * a forecast nobody can interrogate is a forecast nobody trusts.
 */
export function winProbability(deal: PlacedDeal, healthTotal: number): WinProbability {
  if (deal.status === 'won') {
    return { percent: 100, derived: false, summary: 'Closed won.', components: [{ label: 'Outcome', points: 100, detail: 'This deal was won' }] };
  }
  if (deal.status === 'lost') {
    return { percent: 0, derived: false, summary: 'Closed lost.', components: [{ label: 'Outcome', points: 0, detail: deal.lostReason || 'This deal was lost' }] };
  }

  const components: ProbabilityComponent[] = [];

  // Stage position — the further along, the likelier. Last stage is treated as
  // the win column, so it tops out at 70 before the other signals apply.
  const span = Math.max(1, deal.stageCount - 1);
  const stagePoints = Math.round(15 + (deal.stageIndex / span) * 55);
  components.push({ label: 'Stage', points: stagePoints, detail: `${deal.stageName} — stage ${deal.stageIndex + 1} of ${deal.stageCount}` });

  // Contact health — an engaged buyer closes; a cold one stalls.
  const healthPoints = Math.round((healthTotal - 50) / 5);   // −10 … +10
  components.push({ label: 'Contact health', points: healthPoints, detail: `Health ${healthTotal}/100` });

  // Age in stage — deals that sit still go cold.
  const idle = daysSince(deal.lastStageChangedAt || deal.createdAt);
  const agePoints = idle <= 7 ? 5 : idle <= 21 ? 0 : idle <= 45 ? -8 : -18;
  components.push({ label: 'Momentum', points: agePoints, detail: idle === 0 ? 'Moved today' : `${idle} day${idle === 1 ? '' : 's'} in this stage` });

  // Close date — a date in the past means the forecast already slipped once.
  let datePoints = 0;
  let dateDetail = 'No expected close date set';
  if (deal.expectedClose) {
    const days = Math.floor((new Date(deal.expectedClose).getTime() - Date.now()) / 86_400_000);
    if (Number.isNaN(days)) { datePoints = 0; dateDetail = 'Expected close date is unreadable'; }
    else if (days < 0) { datePoints = -12; dateDetail = `Expected close was ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`; }
    else if (days <= 14) { datePoints = 6; dateDetail = `Closes in ${days} day${days === 1 ? '' : 's'}`; }
    else { datePoints = 2; dateDetail = `Closes in ${days} days`; }
  }
  components.push({ label: 'Close date', points: datePoints, detail: dateDetail });

  const percent = Math.max(2, Math.min(95, components.reduce((s, c) => s + c.points, 0)));

  const strongest = [...components].sort((a, b) => Math.abs(b.points) - Math.abs(a.points))[0];
  const summary = percent >= 65
    ? `Strong — ${strongest.detail.toLowerCase()}.`
    : percent >= 35
      ? `Even odds. Biggest factor: ${strongest.detail.toLowerCase()}.`
      : `Long shot. Biggest drag: ${strongest.detail.toLowerCase()}.`;

  return { percent, derived: true, components, summary };
}

/* ── Pipeline summary for one contact ── */

export interface DealSummary {
  open: number;
  openValue: number;
  weighted: number;
  won: number;
  wonValue: number;
  lost: number;
  lostValue: number;
}

export function summariseDeals(deals: PlacedDeal[], probabilityOf: (d: PlacedDeal) => number): DealSummary {
  const s: DealSummary = { open: 0, openValue: 0, weighted: 0, won: 0, wonValue: 0, lost: 0, lostValue: 0 };
  for (const d of deals) {
    const status = d.status ?? 'active';
    const v = d.value ?? 0;
    if (status === 'won') { s.won++; s.wonValue += v; }
    else if (status === 'lost') { s.lost++; s.lostValue += v; }
    else { s.open++; s.openValue += v; s.weighted += (v * probabilityOf(d)) / 100; }
  }
  s.weighted = Math.round(s.weighted);
  return s;
}

/* ── Mutations (pure — caller persists) ── */

export interface DealMutation {
  pipelines: Pipeline[];
  /** Human-readable lines describing what automations did, for notifications. */
  automationNotes: string[];
  /** Text for the contact activity feed, or null when nothing changed. */
  activity: string | null;
}

const noop = (pipelines: Pipeline[]): DealMutation => ({ pipelines, automationNotes: [], activity: null });

function withStages(pipelines: Pipeline[], pipelineId: string, stages: Stage[]): Pipeline[] {
  return pipelines.map(p => (p.id === pipelineId ? { ...p, stages } : p));
}

/** Run the pipeline automation rules for an event and record them in the log. */
function fireAutomations(
  stages: Stage[], dealId: string, pipelineId: string,
  event: { type: 'deal_created' | 'deal_moved'; stageId: string },
): { stages: Stage[]; notes: string[] } {
  const rules = loadAutomationRules();
  if (!rules.length) return { stages, notes: [] };
  const res = runAutomations(stages, dealId, event, rules, pipelineId);
  if (res.ran.length) {
    const at = new Date().toISOString();
    const entries: AutomationLogEntry[] = res.ran.map((r, i) => ({
      id: `log-${Date.now()}-${i}`,
      ruleName: r.rule.name,
      dealTitle: r.dealTitle,
      summary: res.notes[i] || 'Automation ran',
      at,
    }));
    appendAutomationLog(entries);
  }
  return { stages: res.stages, notes: res.notes };
}

/** Move a deal to another stage in the same pipeline, firing automations. */
export function moveDealToStage(pipelines: Pipeline[], dealId: string, toStageId: string): DealMutation {
  const placed = findDeal(pipelines, dealId);
  if (!placed || placed.stageId === toStageId) return noop(pipelines);
  const pipeline = pipelines.find(p => p.id === placed.pipelineId);
  const target = pipeline?.stages.find(s => s.id === toStageId);
  if (!pipeline || !target) return noop(pipelines);

  const moved: Deal = {
    ...stripPlacement(placed),
    stage: target.name,
    lastStageChangedAt: new Date().toISOString(),
    activity: [
      { id: `da-${Date.now()}`, text: `Moved from ${placed.stageName} to ${target.name}`, timestamp: new Date().toISOString() },
      ...(placed.activity ?? []),
    ].slice(0, 50),
  };

  let stages = pipeline.stages.map(s => {
    if (s.id === placed.stageId) return { ...s, deals: s.deals.filter(d => d.id !== dealId) };
    if (s.id === toStageId) return { ...s, deals: [...s.deals, moved] };
    return s;
  });

  const fired = fireAutomations(stages, dealId, pipeline.id, { type: 'deal_moved', stageId: toStageId });
  stages = fired.stages;

  return {
    pipelines: withStages(pipelines, pipeline.id, stages),
    automationNotes: fired.notes,
    activity: `Deal "${placed.title}" moved ${placed.stageName} → ${target.name}`,
  };
}

/** Mark a deal won or lost. Won deals land in the final stage so the board agrees. */
export function closeDeal(pipelines: Pipeline[], dealId: string, outcome: 'won' | 'lost', lostReason?: string): DealMutation {
  const placed = findDeal(pipelines, dealId);
  if (!placed) return noop(pipelines);
  const pipeline = pipelines.find(p => p.id === placed.pipelineId);
  if (!pipeline) return noop(pipelines);

  const now = new Date().toISOString();
  const patch: Partial<Deal> = outcome === 'won'
    ? { status: 'won', probability: 100, closedAt: now, lostReason: undefined }
    : { status: 'lost', probability: 0, closedAt: now, lostReason: lostReason?.trim() || 'No reason given' };

  const stages = pipeline.stages.map(s => ({
    ...s,
    deals: s.deals.map(d => d.id === dealId
      ? {
        ...d, ...patch,
        activity: [{ id: `da-${Date.now()}`, text: outcome === 'won' ? 'Marked won' : `Marked lost — ${patch.lostReason}`, timestamp: now }, ...(d.activity ?? [])].slice(0, 50),
      }
      : d),
  }));

  return {
    pipelines: withStages(pipelines, pipeline.id, stages),
    automationNotes: [],
    activity: outcome === 'won'
      ? `Deal "${placed.title}" won — $${(placed.value ?? 0).toLocaleString()}`
      : `Deal "${placed.title}" lost — ${patch.lostReason}`,
  };
}

/** Put a closed deal back into play. */
export function reopenDeal(pipelines: Pipeline[], dealId: string): DealMutation {
  const placed = findDeal(pipelines, dealId);
  if (!placed || (placed.status ?? 'active') === 'active') return noop(pipelines);
  const pipeline = pipelines.find(p => p.id === placed.pipelineId);
  if (!pipeline) return noop(pipelines);
  const now = new Date().toISOString();
  const stages = pipeline.stages.map(s => ({
    ...s,
    deals: s.deals.map(d => d.id === dealId
      ? {
        ...d, status: 'active' as const, closedAt: undefined, lostReason: undefined,
        lastStageChangedAt: now,
        activity: [{ id: `da-${Date.now()}`, text: 'Reopened', timestamp: now }, ...(d.activity ?? [])].slice(0, 50),
      }
      : d),
  }));
  return { pipelines: withStages(pipelines, pipeline.id, stages), automationNotes: [], activity: `Deal "${placed.title}" reopened` };
}

/** Patch editable fields on a deal (value, title, close date, priority). */
export function updateDealFields(pipelines: Pipeline[], dealId: string, updates: Partial<Deal>): DealMutation {
  const placed = findDeal(pipelines, dealId);
  if (!placed) return noop(pipelines);
  const pipeline = pipelines.find(p => p.id === placed.pipelineId);
  if (!pipeline) return noop(pipelines);
  const stages = pipeline.stages.map(s => ({
    ...s,
    deals: s.deals.map(d => (d.id === dealId ? { ...d, ...updates } : d)),
  }));
  return { pipelines: withStages(pipelines, pipeline.id, stages), automationNotes: [], activity: null };
}

export function deleteDeal(pipelines: Pipeline[], dealId: string): DealMutation {
  const placed = findDeal(pipelines, dealId);
  if (!placed) return noop(pipelines);
  const pipeline = pipelines.find(p => p.id === placed.pipelineId);
  if (!pipeline) return noop(pipelines);
  const stages = pipeline.stages.map(s => ({ ...s, deals: s.deals.filter(d => d.id !== dealId) }));
  return { pipelines: withStages(pipelines, pipeline.id, stages), automationNotes: [], activity: `Deal "${placed.title}" deleted` };
}

export interface NewDealInput {
  title: string;
  value: number;
  pipelineId: string;
  stageId: string;
  expectedClose?: string;
  priority?: Deal['priority'];
}

/** Create a deal against a contact, pre-filling the contact fields so the
 *  pipeline board shows who it belongs to without a second lookup. */
export function createDealForContact(pipelines: Pipeline[], contact: Contact, input: NewDealInput): DealMutation & { dealId: string | null } {
  const pipeline = pipelines.find(p => p.id === input.pipelineId);
  const stageIndex = pipeline?.stages.findIndex(s => s.id === input.stageId) ?? -1;
  if (!pipeline || stageIndex < 0) return { ...noop(pipelines), dealId: null };
  const stage = pipeline.stages[stageIndex];

  const now = new Date().toISOString();
  const id = `deal-${Date.now()}-${Math.floor(performance.now() * 1000) % 100000}`;
  const span = Math.max(1, pipeline.stages.length - 1);

  const deal: Deal = {
    id,
    title: input.title.trim() || `${contact.name} opportunity`,
    contactId: contact.id,
    contactName: contact.name,
    contactEmail: contact.email,
    contactPhone: contact.phone,
    value: Math.max(0, Math.round(input.value || 0)),
    stage: stage.name,
    probability: Math.round(15 + (stageIndex / span) * 55),
    expectedClose: input.expectedClose || new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    assignedTo: 'You',
    createdAt: now,
    lastStageChangedAt: now,
    status: 'active',
    priority: input.priority ?? 'normal',
    source: contact.source,
    activity: [{ id: `da-${Date.now()}`, text: `Deal created in ${stage.name}`, timestamp: now }],
  };

  let stages = pipeline.stages.map(s => (s.id === stage.id ? { ...s, deals: [...s.deals, deal] } : s));
  const fired = fireAutomations(stages, id, pipeline.id, { type: 'deal_created', stageId: stage.id });
  stages = fired.stages;

  return {
    pipelines: withStages(pipelines, pipeline.id, stages),
    automationNotes: fired.notes,
    activity: `Deal "${deal.title}" created — $${deal.value.toLocaleString()}`,
    dealId: id,
  };
}

/* ── Bulk ── */

export interface BulkMoveResult extends DealMutation {
  moved: number;
  contactsTouched: string[];
}

/**
 * Move every open deal belonging to the given contacts into a stage. Deals in
 * other pipelines are skipped rather than silently relocated, since a stage id
 * only means something inside its own pipeline.
 */
export function bulkMoveContactDeals(pipelines: Pipeline[], contacts: Contact[], toStageId: string): BulkMoveResult {
  let next = pipelines;
  const notes: string[] = [];
  const touched: string[] = [];
  let moved = 0;

  for (const c of contacts) {
    const deals = placedDealsForContact(c, next).filter(d => (d.status ?? 'active') === 'active');
    for (const d of deals) {
      const targetPipeline = next.find(p => p.id === d.pipelineId);
      if (!targetPipeline?.stages.some(s => s.id === toStageId)) continue;   // different pipeline
      if (d.stageId === toStageId) continue;
      const res = moveDealToStage(next, d.id, toStageId);
      if (res.activity) {
        next = res.pipelines;
        notes.push(...res.automationNotes);
        moved++;
        if (!touched.includes(c.id)) touched.push(c.id);
      }
    }
  }

  return { pipelines: next, automationNotes: notes, activity: null, moved, contactsTouched: touched };
}

/* ── Behaviour-triggered stage automation ──
   The pipeline automation engine reacts to things that happen *to a deal*.
   These rules react to things the *contact* does — a click, a booked meeting,
   a pricing form — and push the deal that the behaviour is about.

   Safety rule: behaviour never advances a deal into the final stage. That
   column is the win column in every default pipeline, and closing a deal is a
   decision a person makes, not something a link click should do. */

export type Behaviour = 'link_clicked' | 'form_submitted' | 'meeting' | 'email_opened' | 'call';

export interface BehaviourRule {
  id: string;
  label: string;
  behaviour: Behaviour;
  /** Only fire if the behaviour happened within this many days. */
  withinDays: number;
  action: 'advance_stage' | 'raise_probability' | 'flag_urgent';
  /** raise_probability only. */
  probability?: number;
  /** form_submitted only — the description must match, so "newsletter signup"
   *  does not get treated like "book a demo". */
  match?: string;
  enabled: boolean;
}

export const DEFAULT_BEHAVIOUR_RULES: BehaviourRule[] = [
  { id: 'br-click', label: 'Clicked a link → advance the deal one stage', behaviour: 'link_clicked', withinDays: 7, action: 'advance_stage', enabled: true },
  { id: 'br-meeting', label: 'Booked a meeting → advance the deal one stage', behaviour: 'meeting', withinDays: 14, action: 'advance_stage', enabled: true },
  { id: 'br-pricing', label: 'Submitted a pricing or demo form → set win probability to at least 60%', behaviour: 'form_submitted', withinDays: 14, action: 'raise_probability', probability: 60, match: 'quote|demo|pricing|consult', enabled: true },
  { id: 'br-call', label: 'Had a call → set win probability to at least 45%', behaviour: 'call', withinDays: 14, action: 'raise_probability', probability: 45, enabled: true },
];

const BEHAVIOUR_RULES_KEY = 'crm_deal_behaviour_rules';
const BEHAVIOUR_DONE_KEY = 'crm_deal_behaviour_done';

export function loadBehaviourRules(): BehaviourRule[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BEHAVIOUR_RULES_KEY) || 'null');
    if (!Array.isArray(raw)) return DEFAULT_BEHAVIOUR_RULES;
    // Merge so new default rules appear for existing accounts without wiping
    // the enabled/disabled choices the user already made.
    return DEFAULT_BEHAVIOUR_RULES.map(d => {
      const saved = raw.find((r: BehaviourRule) => r.id === d.id);
      return saved ? { ...d, enabled: !!saved.enabled } : d;
    });
  } catch { return DEFAULT_BEHAVIOUR_RULES; }
}

export function saveBehaviourRules(rules: BehaviourRule[]) {
  try { localStorage.setItem(BEHAVIOUR_RULES_KEY, JSON.stringify(rules.map(r => ({ id: r.id, enabled: r.enabled })))); } catch { /* storage full or blocked */ }
}

function loadDone(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(BEHAVIOUR_DONE_KEY) || '[]')); } catch { return new Set(); }
}
function saveDone(done: Set<string>) {
  try { localStorage.setItem(BEHAVIOUR_DONE_KEY, JSON.stringify([...done].slice(-800))); } catch { /* storage full or blocked */ }
}

export interface BehaviourFireResult {
  pipelines: Pipeline[];
  fired: { contactId: string; contactName: string; dealTitle: string; summary: string }[];
}

/**
 * Scan contacts for qualifying behaviour and act on their open deals.
 * Each (rule, deal, activity) pair fires at most once, so re-running this on
 * every dashboard load is safe.
 */
export function runBehaviourTriggers(pipelines: Pipeline[], contacts: Contact[]): BehaviourFireResult {
  const rules = loadBehaviourRules().filter(r => r.enabled);
  if (!rules.length) return { pipelines, fired: [] };

  const done = loadDone();
  let next = pipelines;
  const fired: BehaviourFireResult['fired'] = [];
  let dirty = false;

  for (const contact of contacts) {
    const activities = contact.activities ?? [];
    if (!activities.length) continue;
    const openDeals = placedDealsForContact(contact, next).filter(d => (d.status ?? 'active') === 'active');
    if (!openDeals.length) continue;

    for (const rule of rules) {
      const act = activities.find(a =>
        a.type === rule.behaviour
        && daysSince(a.timestamp) <= rule.withinDays
        && (!rule.match || new RegExp(rule.match, 'i').test(a.description)),
      );
      if (!act) continue;

      for (const deal of placedDealsForContact(contact, next).filter(d => (d.status ?? 'active') === 'active' && openDeals.some(o => o.id === d.id))) {
        const key = `${rule.id}:${deal.id}:${act.id}`;
        if (done.has(key)) continue;

        if (rule.action === 'advance_stage') {
          const pipeline = next.find(p => p.id === deal.pipelineId);
          // Never auto-close: stop one short of the final stage.
          const target = pipeline?.stages[deal.stageIndex + 1];
          if (!pipeline || !target || deal.stageIndex + 1 >= pipeline.stages.length - 1) { done.add(key); dirty = true; continue; }
          const res = moveDealToStage(next, deal.id, target.id);
          if (!res.activity) continue;
          next = res.pipelines;
          fired.push({ contactId: contact.id, contactName: contact.name, dealTitle: deal.title, summary: `${rule.label.split('→')[0].trim()} — "${deal.title}" moved to ${target.name}` });
        } else if (rule.action === 'raise_probability') {
          const floor = rule.probability ?? 50;
          if ((deal.probability ?? 0) >= floor) { done.add(key); dirty = true; continue; }
          next = updateDealFields(next, deal.id, { probability: floor }).pipelines;
          fired.push({ contactId: contact.id, contactName: contact.name, dealTitle: deal.title, summary: `"${deal.title}" probability raised to ${floor}% — ${act.description}` });
        } else {
          if (deal.priority === 'urgent') { done.add(key); dirty = true; continue; }
          next = updateDealFields(next, deal.id, { priority: 'urgent' }).pipelines;
          fired.push({ contactId: contact.id, contactName: contact.name, dealTitle: deal.title, summary: `"${deal.title}" flagged urgent — ${act.description}` });
        }

        done.add(key);
        dirty = true;
      }
    }
  }

  if (dirty) saveDone(done);
  return { pipelines: next, fired };
}

/* ── internals ── */

function stripPlacement(d: PlacedDeal): Deal {
  const { pipelineId, pipelineName, stageId, stageName, stageColor, stageIndex, stageCount, ...deal } = d;
  void pipelineId; void pipelineName; void stageId; void stageName; void stageColor; void stageIndex; void stageCount;
  return deal;
}
