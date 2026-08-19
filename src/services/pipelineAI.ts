/**
 * Describe the work; get a pipeline back.
 *
 * A sales pipeline is the same shape for everyone and completely different for
 * everyone: a dental practice, a roofing contractor and an agency selling
 * retainers all move a deal from "someone got in touch" to "they paid", and not
 * one of them wants the other's column headings. Asking a person to build that
 * from an empty board is asking them to design a process before they have run
 * one.
 *
 * So this asks a handful of questions about the project and turns the answers
 * into named stages, each with the tasks a deal in that stage should carry.
 *
 * Three rules run through it.
 *
 * Nothing is applied without being shown first. The plan comes back editable —
 * rename a stage, drop one, rewrite a task, add your own — and only what is on
 * screen when Apply is pressed is what gets written.
 *
 * Nothing is invented that the brief did not contain. Where a stage exists
 * because of a stated fact ("we quote before we visit"), the plan says so; where
 * it is there because almost every pipeline has one, it says that instead.
 *
 * No deal is ever lost. Applying a plan that drops a stage moves the deals in it
 * to the nearest stage that survived, and reports how many moved and where —
 * silently deleting somebody's opportunities to tidy up a board would be the
 * worst bug this file could have.
 */
import { getGeminiKey } from '../lib/gemini';
import type { Deal, Pipeline, Stage } from '../types';

const MODEL = 'gemini-2.0-flash';

/* ── The brief ─────────────────────────────────────────────────────────── */

export interface ProjectBrief {
  /** What the business does — "family dental practice", "commercial roofing". */
  business: string;
  /** What is actually sold — "implants and Invisalign", "annual retainers". */
  offer: string;
  /** Who buys it. */
  customer: string;
  /** Roughly how long from first contact to money, in days. 0 = not stated. */
  cycleDays: number;
  /** Typical deal size as the user typed it, kept verbatim. */
  dealSize: string;
  /** Anything else about how the work actually runs. */
  notes: string;
}

export const EMPTY_BRIEF: ProjectBrief = {
  business: '', offer: '', customer: '', cycleDays: 0, dealSize: '', notes: '',
};

/** Enough to plan from. A blank form gets a plan nobody asked for. */
export function briefIsUsable(brief: ProjectBrief): boolean {
  return brief.business.trim().length >= 3 || brief.offer.trim().length >= 3;
}

/* ── The plan ──────────────────────────────────────────────────────────── */

export interface PlannedTask {
  id: string;
  text: string;
}

export interface PlannedStage {
  id: string;
  name: string;
  color: string;
  /** What somebody should do while a deal is sitting here. */
  tasks: PlannedTask[];
  /** Why this stage is in the plan, in one line. */
  because: string;
  /** An existing stage this one is meant to be, when the plan is a revision. */
  existingId?: string;
}

export interface PipelinePlan {
  summary: string;
  stages: PlannedStage[];
  /** 'ai' when a model wrote it, 'rules' when this file did. Never dressed up. */
  source: 'ai' | 'rules';
  /** Said on screen when the model was not used, or not usable. */
  note?: string;
}

/* Colours in board order: cool at the start, warm in the middle, green at the
   end. Won and lost get their own so the board reads at a glance. */
const TRACK = ['#94a3b8', '#0ea5e9', '#6366f1', '#f59e0b', '#f97316', '#14b8a6'];
const WON = '#16a34a';
const LOST = '#e5484d';

let seq = 0;
/** Ids are only unique within a plan; the board gives stages their real ones. */
function nid(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

function task(text: string): PlannedTask {
  return { id: nid('t'), text };
}

/* ── The rules plan ────────────────────────────────────────────────────── */

/**
 * What almost every pipeline has, tuned by what the brief actually said.
 *
 * This is the whole answer when there is no AI key, and the floor under the AI
 * answer when there is: a model that returns something unusable falls back to
 * this rather than to an empty board.
 */
export function rulesPlan(brief: ProjectBrief): PipelinePlan {
  const what = brief.offer.trim() || 'the work';
  const who = brief.customer.trim() || 'the customer';
  const slow = brief.cycleDays >= 45;
  const fast = brief.cycleDays > 0 && brief.cycleDays <= 7;
  const priced = brief.dealSize.trim().length > 0;

  const stages: PlannedStage[] = [];
  const add = (name: string, tasks: string[], because: string) => {
    stages.push({
      id: nid('s'),
      name,
      color: TRACK[stages.length % TRACK.length],
      tasks: tasks.map(task),
      because,
    });
  };

  add('New enquiry', [
    `Reply to ${who} the same day`,
    'Record where the enquiry came from',
    'Check whether they are already in Contacts',
  ], 'Every pipeline needs a place for work that has arrived but not been looked at.');

  add('Qualified', [
    `Confirm they actually want ${what}`,
    'Find out who decides and who pays',
    'Agree a rough timeline',
    ...(priced ? [`Check the budget against ${brief.dealSize.trim()}`] : ['Ask what budget they have in mind']),
  ], priced
    ? `You said deals are around ${brief.dealSize.trim()}, so budget is worth settling before any work goes in.`
    : 'Separating "asked a question" from "might actually buy" is what stops a board filling with noise.');

  if (slow) {
    add('Discovery', [
      'Book the discovery call or site visit',
      'Write up what they need, in their words',
      'Flag anything that would stop the deal',
    ], `A cycle of about ${brief.cycleDays} days is long enough that the middle needs its own column, or everything sits in "Qualified" for weeks.`);
  }

  add('Proposal sent', [
    `Send the quote for ${what}`,
    'Confirm they received it',
    'Diarise the follow-up',
  ], 'The point where the money is named is the point most deals stall, so it gets its own column.');

  if (!fast) {
    add('Negotiation', [
      'Answer the objection in writing',
      'Agree final scope and price',
      'Send the agreement',
    ], 'Something between "quoted" and "signed" is where the deal is actually won or lost.');
  }

  stages.push({
    id: nid('s'),
    name: 'Won',
    color: WON,
    tasks: [
      task('Take the deposit or first payment'),
      task('Book the start date'),
      task('Ask for a review once the work is done'),
    ],
    because: 'The finish line, and the place the win rate is counted from.',
  });

  stages.push({
    id: nid('s'),
    name: 'Lost',
    color: LOST,
    tasks: [
      task('Write down why, in one line'),
      task('Set a reminder to try again later'),
    ],
    because: 'A lost column with a reason on every card is the only way the win rate means anything.',
  });

  const trade = brief.business.trim();
  return {
    stages,
    source: 'rules',
    summary: trade
      ? `A ${stages.length}-stage pipeline for ${trade}, selling ${what} to ${who}.`
      : `A ${stages.length}-stage pipeline for selling ${what} to ${who}.`,
  };
}

/* ── The AI plan ───────────────────────────────────────────────────────── */

interface RawStage {
  name?: unknown;
  tasks?: unknown;
  because?: unknown;
}
interface RawPlan {
  summary?: unknown;
  stages?: unknown;
}

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

/**
 * Turn a model's answer into a plan, or return null if it is not worth showing.
 *
 * A stage with no name is not a stage. A plan with fewer than two of them is
 * not a pipeline. Both fall back rather than being presented as considered.
 */
export function readPlan(raw: RawPlan): { summary: string; stages: PlannedStage[] } | null {
  if (!Array.isArray(raw.stages)) return null;

  const stages: PlannedStage[] = [];
  for (const item of raw.stages as RawStage[]) {
    const name = str(item?.name, 40);
    if (!name) continue;
    const tasks = Array.isArray(item?.tasks)
      ? (item.tasks as unknown[]).map(t => str(t, 120)).filter(Boolean).slice(0, 8).map(task)
      : [];
    const lower = name.toLowerCase();
    const color = /^won$|closed won|^sold$/.test(lower) ? WON
      : /^lost$|closed lost|^dead$/.test(lower) ? LOST
        : TRACK[stages.length % TRACK.length];
    stages.push({ id: nid('s'), name, color, tasks, because: str(item?.because, 200) });
    if (stages.length >= 10) break;
  }
  if (stages.length < 2) return null;
  return { summary: str(raw.summary, 400), stages };
}

export async function planPipeline(brief: ProjectBrief): Promise<PipelinePlan> {
  const fallback = rulesPlan(brief);
  const key = getGeminiKey();
  if (!key) {
    return { ...fallback, note: 'Built without an AI model — no Gemini key is set in Settings → AI Engine. Every stage below comes from what you wrote and from how sales pipelines are normally laid out.' };
  }

  const prompt = `You are laying out a sales pipeline for a small business in their CRM.

What they told you about the work:
- Business: ${brief.business || '(not said)'}
- What they sell: ${brief.offer || '(not said)'}
- Who buys it: ${brief.customer || '(not said)'}
- Typical time from first contact to payment: ${brief.cycleDays > 0 ? `${brief.cycleDays} days` : '(not said)'}
- Typical deal size: ${brief.dealSize || '(not said)'}
- Anything else: ${brief.notes || '(nothing)'}

Design the stages a deal moves through, in order, ending with a won stage and a
lost stage. Between four and eight stages. For each one, list the things a
person should actually do while a deal is sitting in it — real actions with a
verb, specific to this business, not "follow up".

Do not invent facts they did not give you. If they did not state a price, do not
put a price in a task. Where a stage exists because of something they said,
say which thing in "because"; where it is there because nearly every pipeline
has one, say that.

Return JSON only:
{
  "summary": "one sentence describing the pipeline",
  "stages": [
    { "name": "New enquiry", "tasks": ["…", "…"], "because": "…" }
  ]
}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini returned ${res.status}`);
    const data = await res.json();
    const raw = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}') as RawPlan;
    const read = readPlan(raw);
    if (!read) throw new Error('the model returned a plan with too little in it to use');
    return {
      summary: read.summary || fallback.summary,
      stages: read.stages,
      source: 'ai',
    };
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return { ...fallback, note: `Built without an AI model — ${why}. Every stage below comes from what you wrote and from how sales pipelines are normally laid out.` };
  }
}

/* ── Applying it ───────────────────────────────────────────────────────── */

export interface ApplyReport {
  stages: Stage[];
  /** Stages that were already there and stayed. */
  kept: string[];
  /** Stages the plan added. */
  added: string[];
  /** Stages that went, and where their deals ended up. */
  moved: { from: string; to: string; deals: number }[];
  /** Total deals that changed column. Never anything but a move. */
  dealsMoved: number;
}

function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Fold a plan into a pipeline without losing a deal.
 *
 * A planned stage is matched to an existing one by the id it was revised from,
 * failing that by name. Existing stages the plan does not mention are removed,
 * and whatever was in them moves to the nearest surviving stage *before* it —
 * backwards rather than forwards, because a deal that has not been through a
 * step should never be recorded as having passed it, and never into Won.
 */
export function applyPlan(pipeline: Pipeline, plan: PlannedStage[]): ApplyReport {
  const existing = pipeline.stages;
  const byId = new Map(existing.map(s => [s.id, s]));
  const bySlug = new Map(existing.map(s => [slug(s.name), s]));

  const kept: string[] = [];
  const added: string[] = [];
  const claimed = new Set<string>();

  /* Build the new columns first, carrying over each matched stage's deals. */
  const stages: Stage[] = plan.map((p, i) => {
    const match = (p.existingId && byId.get(p.existingId)) || bySlug.get(slug(p.name));
    if (match && !claimed.has(match.id)) {
      claimed.add(match.id);
      kept.push(match.name);
      return {
        id: match.id,
        name: p.name,
        color: p.color,
        deals: match.deals.map(d => (d.stage === match.name ? { ...d, stage: p.name } : d)),
        playbook: p.tasks.map(t => ({ id: t.id, text: t.text })),
      };
    }
    added.push(p.name);
    return {
      id: `stage-${Date.now()}-${i}`,
      name: p.name,
      color: p.color,
      deals: [],
      playbook: p.tasks.map(t => ({ id: t.id, text: t.text })),
    };
  });

  /* Then re-home anything left behind. Walking the old order backwards from
     each dropped stage finds the nearest earlier column that survived; if a
     stage was dropped from the very front, the first surviving column takes it. */
  const moved: ApplyReport['moved'] = [];
  let dealsMoved = 0;
  existing.forEach((old, index) => {
    if (claimed.has(old.id) || old.deals.length === 0) return;

    let target: Stage | undefined;
    for (let i = index - 1; i >= 0 && !target; i--) {
      if (claimed.has(existing[i].id)) target = stages.find(s => s.id === existing[i].id);
    }
    if (!target) target = stages[0];
    if (!target) return;

    const carried: Deal[] = old.deals.map(d => ({ ...d, stage: target!.name }));
    target.deals = [...target.deals, ...carried];
    moved.push({ from: old.name, to: target.name, deals: carried.length });
    dealsMoved += carried.length;
  });

  return { stages, kept, added, moved, dealsMoved };
}

/** The tasks a new deal should start with, from the stage it is created in. */
export function playbookChecklist(stage: Stage | undefined): { id: string; text: string; done: boolean }[] {
  if (!stage?.playbook?.length) return [];
  return stage.playbook.map((t, i) => ({ id: `chk-${Date.now()}-${i}`, text: t.text, done: false }));
}

/**
 * Put a stage's tasks onto the deals already sitting in it.
 *
 * Anything already on a deal's list stays, and a task it already carries is not
 * added twice — a person who has ticked "send the quote" must not find it back
 * and unticked because the stage was given a playbook afterwards.
 */
export function seedExistingDeals(stage: Stage): { stage: Stage; touched: number } {
  if (!stage.playbook?.length) return { stage, touched: 0 };
  let touched = 0;
  const deals = stage.deals.map((d, di) => {
    const have = new Set((d.checklist ?? []).map(c => c.text.trim().toLowerCase()));
    const fresh = stage.playbook!
      .filter(t => !have.has(t.text.trim().toLowerCase()))
      .map((t, i) => ({ id: `chk-${Date.now()}-${di}-${i}`, text: t.text, done: false }));
    if (fresh.length === 0) return d;
    touched += 1;
    return { ...d, checklist: [...(d.checklist ?? []), ...fresh] };
  });
  return { stage: { ...stage, deals }, touched };
}

/** A plan that mirrors a pipeline as it stands, so a revision starts from the truth. */
export function planFromPipeline(pipeline: Pipeline): PlannedStage[] {
  return pipeline.stages.map(s => ({
    id: nid('s'),
    existingId: s.id,
    name: s.name,
    color: s.color,
    tasks: (s.playbook ?? []).map(t => ({ id: nid('t'), text: t.text })),
    because: 'Already on your board.',
  }));
}

export { task as makeTask, nid as makeId };
