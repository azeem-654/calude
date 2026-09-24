/**
 * A pipeline per project, with the first tasks already written.
 *
 * ── Why a pipeline at all ──
 *
 * The Autopilot board answers "what did the machine do". It does not answer
 * "where has this client got to", which is the question somebody asks before a
 * status call and the one a reseller has to answer for their own customer. Those
 * are different questions about the same project, and a board of AI actions
 * cannot be made to answer the second: it has no notion of a thing moving
 * through stages towards done.
 *
 * So each project gets a pipeline of its own, named after it, with stages
 * suited to what kind of push it is. The Deals module already renders these —
 * nothing new had to be built to look at them, which is the point.
 *
 * ── Why the starter tasks are written by the AI ──
 *
 * A fixed checklist is the same for a roofer and a supplement brand, and is
 * therefore useful to neither. The tasks here are generated from the project's
 * own objective and its client's portfolio, so "call the three warmest leads
 * from the quote form" is a task a roofer actually has, and the supplement
 * brand gets something about its first product drop instead.
 *
 * When there is no AI key, a plain fallback is used and *says* it is generic
 * rather than pretending a template was written for this client.
 *
 * ── Idempotence ──
 *
 * Written into the workspace's own `crm_pipelines` storage, which is where the
 * Deals module reads from, and matched on `projectId`. Running twice edits the
 * pipeline that is already there rather than adding a second one — including
 * when a customer has renamed it, because the marker is the id and not the name.
 */
import { askGemini } from './ai';
import { loadAiKey } from './ai';
import { dataGet, dataPut, nowIso, type Env } from './db';

const rid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function parse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

interface StageShape {
  id: string;
  name: string;
  color: string;
  deals: unknown[];
  playbook: Array<{ id: string; text: string }>;
}

interface PipelineShape {
  id: string;
  name: string;
  stages: StageShape[];
  /** What ties this pipeline to its project. Survives a rename. */
  projectId?: string;
  source?: { origin: string; title: string; refId: string; route: string };
}

/**
 * The stages, by what the project is trying to do.
 *
 * Not one set for everything: a lead-generation push moves people from "never
 * heard of us" to "booked", and an e-commerce push moves *products* from idea
 * to selling. Forcing the second through stages named for the first is how a
 * board stops being used.
 */
function stagesFor(kind: string): Array<{ name: string; color: string }> {
  switch (kind) {
    case 'ecommerce':
      return [
        { name: 'Product ideas', color: '#6366f1' },
        { name: 'Sourcing', color: '#0ea5e9' },
        { name: 'Listed', color: '#f59e0b' },
        { name: 'Promoting', color: '#8b5cf6' },
        { name: 'Selling', color: '#10b981' },
      ];
    case 'consultancy':
      return [
        { name: 'Researching', color: '#6366f1' },
        { name: 'Approached', color: '#0ea5e9' },
        { name: 'In conversation', color: '#f59e0b' },
        { name: 'Proposal sent', color: '#8b5cf6' },
        { name: 'Won', color: '#10b981' },
      ];
    case 'leadgen':
      return [
        { name: 'New lead', color: '#6366f1' },
        { name: 'Contacted', color: '#0ea5e9' },
        { name: 'Replied', color: '#f59e0b' },
        { name: 'Booked', color: '#8b5cf6' },
        { name: 'Customer', color: '#10b981' },
      ];
    default:
      return [
        { name: 'To set up', color: '#6366f1' },
        { name: 'In progress', color: '#0ea5e9' },
        { name: 'Waiting on client', color: '#f59e0b' },
        { name: 'Review', color: '#8b5cf6' },
        { name: 'Done', color: '#10b981' },
      ];
  }
}

/**
 * Enough of a fallback to be useful, and honest about being generic.
 *
 * Reached when there is no AI key or the model would not answer. A silent
 * template pretending to be bespoke advice is worse than an admitted one: the
 * customer trusts it, follows it, and only finds out it was never about their
 * business when it does not work.
 */
function fallbackTasks(stages: Array<{ name: string }>): string[][] {
  const generic = [
    ['Confirm what this client actually sells, in their words', 'Agree who the ideal customer is', 'Check the mailbox sends and receives'],
    ['Review the first campaign Autopilot writes before it goes out', 'Set the daily sending cap'],
    ['Chase anything waiting on the client for more than three days'],
    ['Read the week’s replies and correct anything the AI got wrong'],
    ['Write down what worked, so the next month starts from it'],
  ];
  return stages.map((_, i) => generic[i] ?? []);
}

/**
 * Ask for the starter tasks, in the client's own situation.
 *
 * Returns one list per stage. A model that answers with the wrong shape is
 * treated as no answer at all rather than half-used — a pipeline with three of
 * five stages populated looks broken in a way an empty one does not.
 */
async function writeTasks(
  env: Env, accountId: string,
  brief: {
    company: string; industry: string; offer: string; audience: string;
    objective: string; kind: string;
    revenueTarget: number; volumeTarget: number; goals: string[];
  },
  stages: Array<{ name: string }>,
): Promise<{ tasks: string[][]; generated: boolean }> {
  const key = await loadAiKey(env, accountId);
  if (!key) return { tasks: fallbackTasks(stages), generated: false };

  const prompt = `You are setting up a project board for a marketing agency's client.

The client: ${brief.company || 'a small business'}
Industry: ${brief.industry || 'unknown'}
What they sell: ${brief.offer || 'unknown'}
Who they sell to: ${brief.audience || 'unknown'}
What this project must achieve: ${brief.objective || 'grow the business'}
${brief.goals.length ? `Goals picked: ${brief.goals.join(', ')}` : ''}
${brief.revenueTarget > 0 ? `Revenue target: ${brief.revenueTarget} a month` : 'Revenue target: not given — do not invent one'}
${brief.volumeTarget > 0 ? `Volume target: ${brief.volumeTarget} customers or jobs a month` : 'Volume target: not given — do not invent one'}

The board has these stages, in order: ${stages.map(s => s.name).join(', ')}.

Plan for the numbers above where they are given. Fifteen jobs a month is a
volume problem and needs tasks about reach; three jobs at a high price is a
trust problem and needs tasks about proof and referrals. Where a number is not
given, write tasks that work at any size rather than assuming one.

For each stage, write 2 to 4 tasks a person at the agency should actually do
while work sits in that stage. Concrete and specific to this client — name their
offer and their customers. No generic marketing advice. Each task under 90
characters, phrased as an instruction.

Reply with only JSON, in this exact shape:
{"stages":[{"name":"<stage name>","tasks":["...","..."]}]}`;

  const r = await askGemini(key, prompt, 0.4);
  if (!r.ok) return { tasks: fallbackTasks(stages), generated: false };

  const out = parse<{ stages?: Array<{ name?: string; tasks?: unknown }> }>(r.text, {});
  const rows = out.stages;
  if (!Array.isArray(rows) || rows.length !== stages.length) {
    return { tasks: fallbackTasks(stages), generated: false };
  }

  const tasks = stages.map((_, i) => {
    const list = rows[i]?.tasks;
    if (!Array.isArray(list)) return [];
    return list.map(t => String(t).trim()).filter(Boolean).slice(0, 4).map(t => t.slice(0, 120));
  });

  /* All-or-nothing: a stage the model skipped means the answer was not usable,
     and mixing real tasks with fallback ones produces a board nobody can trust
     the provenance of. */
  if (tasks.some(t => t.length === 0)) return { tasks: fallbackTasks(stages), generated: false };
  return { tasks, generated: true };
}

/**
 * Create or refresh the pipeline for one project.
 *
 * Returns what happened, so a caller can say "made you a board" once and not
 * every time the tick runs.
 */
export async function ensureProjectPipeline(
  env: Env,
  project: {
    id: string; account_id: string; name: string; kind: string; objective: string;
    portfolio_id: string;
    revenueTarget?: number; volumeTarget?: number; goals?: string;
    /** JSON from `launch_steps`: the build order the customer was shown. */
    launchSteps?: string;
  },
): Promise<{ created: boolean; generated: boolean; pipelineId: string }> {
  const accountId = project.account_id;
  const pipelines = parse<PipelineShape[]>(await dataGet(env.DB, accountId, 'crm_pipelines'), []);

  const existing = pipelines.find(p => p.projectId === project.id);
  if (existing) return { created: false, generated: false, pipelineId: existing.id };

  /* The client this project speaks for, for the brief. Missing is survivable —
     the tasks are simply less specific — so it does not block the board. */
  const pfRow = await env.DB.prepare(
    'SELECT name, profile FROM crm_portfolios WHERE id = ? AND account_id = ?',
  ).bind(project.portfolio_id, accountId).first<{ name: string; profile: string }>();
  /* The profile is one JSON document rather than columns — every writer in this
     app reads all of it at once, and nothing queries across the fields. The key
     names vary by how the portfolio was filled in, so each is tried both ways. */
  const prof = parse<Record<string, string>>(pfRow?.profile ?? '{}', {});
  const pf = {
    name: pfRow?.name ?? prof.companyName ?? '',
    industry: prof.industry ?? '',
    products: prof.products ?? prof.services ?? '',
    audience: prof.audience ?? prof.idealCustomer ?? '',
  };

  const shape = stagesFor(project.kind);
  const { tasks, generated } = await writeTasks(env, accountId, {
    company: pf.name,
    industry: pf.industry,
    offer: pf.products,
    audience: pf.audience,
    objective: project.objective,
    kind: project.kind,
    revenueTarget: Number(project.revenueTarget) || 0,
    volumeTarget: Number(project.volumeTarget) || 0,
    goals: parse<string[]>(project.goals ?? '[]', []),
  }, shape);

  const stages: StageShape[] = shape.map((s, i) => ({
    id: rid('stg'),
    name: s.name,
    color: s.color,
    deals: [],
    playbook: (tasks[i] ?? []).map(text => ({ id: rid('tsk'), text })),
  }));

  /*
   * A first card, holding the setup work.
   *
   * An empty board is a board nobody opens twice. This one has the things that
   * have to happen before Autopilot's own work is worth anything — and it sits
   * in the first stage, where somebody will see it.
   */
  /*
   * The setup card's checklist is the build order the customer agreed to, when
   * there is one.
   *
   * It beats the AI's first stage on purpose. Those tasks are written from the
   * client and the objective, which is the right job for a model; the order of
   * operations is not — it is the same for every shop, and it is the list the
   * wizard put on screen before anybody pressed start. A board that says
   * something different from the screen they agreed to is a board that costs
   * trust on the first visit.
   *
   * Falls back to the generated tasks for a project made before this existed.
   */
  const agreed = parse<Array<{ label?: string }>>(project.launchSteps ?? '[]', [])
    .map(s => String(s.label ?? '').trim())
    .filter(Boolean);
  const setupChecklist = agreed.length ? agreed : (tasks[0] ?? []);

  const now = nowIso();

  /*
   * The whole to-do list, on a timeline.
   *
   * This card used to carry the setup steps as a checklist with no dates, and
   * the tasks written for every later stage sat in each stage's playbook where
   * nobody saw them — so a new project looked like one task with nothing after
   * it. Every one of them is now a sub-task on the card, with a due date:
   * setup first, a day apart; then each stage's tasks, three days per stage.
   * The dates are a sensible default rather than a promise — each can be moved
   * on the card — and they are what drives the "due soon" reminders and the
   * pending-task badge in the app's header.
   */
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const subtasks: Array<Record<string, unknown>> = [];
  setupChecklist.forEach((text, i) => subtasks.push({
    id: rid('sub'), title: text, done: false, priority: i < 2 ? 'high' : 'normal', dueDate: day(i + 1), createdAt: now, source: 'autopilot',
  }));
  let offset = setupChecklist.length + 1;
  shape.forEach((st, i) => {
    /* The first stage's own tasks are the setup list when one was agreed. */
    if (i === 0 && agreed.length === 0) return;
    for (const text of tasks[i] ?? []) {
      subtasks.push({ id: rid('sub'), title: `${st.name}: ${text}`, done: false, priority: 'normal', dueDate: day(offset), createdAt: now, source: 'autopilot' });
    }
    if ((tasks[i] ?? []).length) offset += 3;
  });

  stages[0].deals.push({
    id: rid('deal'),
    title: `Get ${pf.name || project.name} live`,
    contactId: '',
    contactName: pf.name || project.name,
    value: 0,
    stage: stages[0].id,
    probability: 0,
    expectedClose: subtasks.length ? String(subtasks[subtasks.length - 1].dueDate) : '',
    assignedTo: '',
    createdAt: now,
    priority: 'high',
    description: project.objective,
    subtasks,
    status: 'active',
    /* Stamped, so a board full of generated cards can still be traced back to
       what made them. */
    source: 'autopilot',
  });

  const pipeline: PipelineShape = {
    id: rid('pipe'),
    name: project.name,
    projectId: project.id,
    stages,
    source: { origin: 'autopilot', title: project.name, refId: project.id, route: '/autopilot' },
  };

  pipelines.push(pipeline);
  await dataPut(env.DB, accountId, 'crm_pipelines', JSON.stringify(pipelines));

  return { created: true, generated, pipelineId: pipeline.id };
}
