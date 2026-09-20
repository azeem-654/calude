/**
 * How a workflow step looks, in one place.
 *
 * Two screens draw the same graph — the compact chain inside a project's
 * settings panel, and the full canvas on the Autopilot hub — and a palette
 * defined twice is a palette that disagrees with itself the first time either
 * is touched. A customer who has learned that purple means "the AI does this"
 * has learned it everywhere or nowhere.
 */
import {
  Zap, Clock, GitBranch, Mail, MessageSquare, Tag, Check, User, Edit2, X,
  Bot, Workflow, type LucideIcon,
} from 'lucide-react';
import type { WorkflowNode } from '../../services/autopilot';

export interface NodeLook {
  icon: LucideIcon;
  /** The type's colour: the icon, the label, and the connector leaving it. */
  fg: string;
  /** The tint behind the icon. Deliberately pale — a wall of saturated cards
   *  is unreadable at six nodes, which is the ordinary length of one of these. */
  bg: string;
  /** What this step is called, in the customer's words rather than the code's. */
  label: string;
}

export const NODE_LOOK: Record<string, NodeLook> = {
  trigger:      { icon: Zap,            fg: '#7c3aed', bg: '#f5f3ff', label: 'Trigger' },
  /* The one that needed a name of its own. A step the model writes is not the
     same promise as a step the product performs, and somebody deciding whether
     to trust a workflow needs to see which is which at a glance. */
  ai:           { icon: Bot,            fg: '#7c3aed', bg: '#f5f3ff', label: 'AI Agent' },
  wait:         { icon: Clock,          fg: '#db2777', bg: '#fdf2f8', label: 'Delay' },
  condition:    { icon: GitBranch,      fg: '#c2410c', bg: '#fff7ed', label: 'Condition' },
  send_email:   { icon: Mail,           fg: '#2563eb', bg: '#eff6ff', label: 'Email' },
  send_sms:     { icon: MessageSquare,  fg: '#0d9488', bg: '#f0fdfa', label: 'SMS' },
  add_tag:      { icon: Tag,            fg: '#16a34a', bg: '#f0fdf4', label: 'Action' },
  remove_tag:   { icon: Tag,            fg: '#dc2626', bg: '#fef2f2', label: 'Action' },
  create_task:  { icon: Check,          fg: '#16a34a', bg: '#f0fdf4', label: 'Action' },
  assign_to:    { icon: User,           fg: '#0369a1', bg: '#eff6ff', label: 'Action' },
  update_field: { icon: Edit2,          fg: '#475569', bg: '#f8fafc', label: 'Action' },
  end:          { icon: X,              fg: '#64748b', bg: '#f8fafc', label: 'End' },
};

export const lookFor = (type: string): NodeLook =>
  NODE_LOOK[type] ?? { icon: Workflow, fg: '#64748b', bg: '#f4f5f7', label: type.replace(/_/g, ' ') };

/**
 * The line under a step's name: what it will actually do, from its own config.
 *
 * Read from the config rather than from the label, because the label is
 * editable and the config is what runs. A workflow whose step is called
 * "Welcome" and whose subject line was changed last week should say the subject
 * line — that is the thing somebody is checking when they look.
 */
export function nodeDetail(type: string, config: Record<string, string> = {}): string {
  const c = (k: string) => String(config[k] ?? '').trim();

  if (type === 'trigger') {
    const ev = c('event').replace(/_/g, ' ');
    const named = c('formName') || c('tag');
    return named ? `${ev} — ${named}` : ev;
  }
  if (type === 'wait') {
    const bits = [
      Number(c('days')) > 0 ? `${Number(c('days'))} day${Number(c('days')) === 1 ? '' : 's'}` : '',
      Number(c('hours')) > 0 ? `${Number(c('hours'))} hour${Number(c('hours')) === 1 ? '' : 's'}` : '',
      Number(c('minutes')) > 0 ? `${Number(c('minutes'))} min` : '',
    ].filter(Boolean);
    /* The engine's own default, said out loud. A wait with nothing set is a day,
       and a blank line here would leave somebody guessing at it. */
    return bits.length ? `Wait ${bits.join(' ')}` : 'Wait 1 day';
  }
  if (type === 'condition') {
    const f = c('field');
    const op = c('operator') || 'equals';
    const v = c('value');
    if (!f) return 'No condition set';
    if (op === 'is_set') return `${f} is set`;
    if (op === 'is_empty') return `${f} is empty`;
    return `${f} ${op.replace(/_/g, ' ')} ${v}`.trim();
  }
  if (type === 'send_email') return c('subject') || 'No subject set';
  if (type === 'send_sms') return (c('message') || c('body') || 'No message set').slice(0, 80);
  if (type === 'add_tag' || type === 'remove_tag') return c('tag') ? `Tag: ${c('tag')}` : 'No tag named';
  if (type === 'create_task') return c('title') || c('text') || 'Follow up';
  if (type === 'assign_to') return c('user') || c('assignee') || 'Nobody named';
  if (type === 'update_field') return c('field') ? `Set ${c('field')}` : 'No field named';
  return '';
}

/**
 * Which part of the business a workflow belongs to, for the filter row.
 *
 * Derived from what its steps do rather than stored, because a field somebody
 * has to remember to set is a field that is wrong on half the rows. A workflow
 * that emails is Marketing; one that only writes or tags is Content; one that
 * moves a deal is Sales. A workflow doing several is filed under the one that
 * costs the most to get wrong, which is the one that sends.
 */
export type WorkflowGroup = 'marketing' | 'content' | 'sales';

export function groupOf(nodes: { type: string }[]): WorkflowGroup {
  const has = (t: string) => nodes.some(n => n.type === t);
  if (has('send_email') || has('send_sms')) return 'marketing';
  if (has('assign_to') || has('create_task')) return 'sales';
  return 'content';
}

export const GROUP_LABEL: Record<WorkflowGroup, string> = {
  marketing: 'Marketing',
  content: 'Content',
  sales: 'Sales',
};

/**
 * Turn an ordered list of steps into a chain the engine can walk.
 *
 * The AI writer returns steps in order and nothing else — no ids, no `nextId`.
 * Saved as they arrive, every node points at nothing, and the engine carries
 * out the first step and stops: a workflow that looks complete on the canvas
 * and does exactly one thing.
 *
 * Shared rather than written twice. The builder has always done this and the
 * hub needs the identical rule, and two copies of "what does next mean" is the
 * kind of thing that diverges silently and is then very hard to see.
 */
export function chain<T extends { id: string }>(raw: T[]): (T & { nextId: string | null })[] {
  return raw.map((n, idx) => ({
    ...n,
    nextId: idx < raw.length - 1 ? raw[idx + 1].id : null,
  }));
}

/**
 * What is wrong with this graph, in the customer's terms.
 *
 * Exported because it is the whole judgement about whether a workflow can run,
 * and it is far easier to argue with as a function than through a form.
 */
export function problemsWith(name: string, nodes: WorkflowNode[]): string[] {
  const out: string[] = [];
  if (!name.trim()) out.push('Give the workflow a name.');
  if (!nodes.some(n => n.type === 'trigger')) out.push('It has no trigger, so nothing would ever start it.');
  if (nodes.length < 2) out.push('It needs at least one step after the trigger.');

  for (const n of nodes) {
    const label = n.label || lookFor(n.type).label;
    /* The two that reach a real person with nothing in them. A blank email is
       worse than no email, and it is the kind of thing found in a delivery log
       rather than in a builder. */
    if (n.type === 'send_email' && !String(n.config.subject ?? '').trim()) {
      out.push(`"${label}" has no subject, so it would send a blank email.`);
    }
    if (n.type === 'send_sms' && !String(n.config.message ?? '').trim()) {
      out.push(`"${label}" has no message, so it would send an empty text.`);
    }
    if (n.type === 'condition' && !String(n.config.field ?? '').trim()) {
      out.push(`"${label}" has nothing to test, so it would always take the No branch.`);
    }
    if ((n.type === 'add_tag' || n.type === 'remove_tag') && !String(n.config.tag ?? '').trim()) {
      out.push(`"${label}" has no tag named.`);
    }
  }
  return out;
}

/** One step, and where it sits. */
interface Placed {
  node: WorkflowNode;
  column: number;
  /** 0 is the spine; 1 is a No branch hanging under it. */
  row: number;
  /** The condition this branch left, so its elbow can be drawn. */
  from?: string;
}

/**
 * Walk the graph into rows and columns.
 *
 * Exported so it can be argued with directly: the interesting cases are a graph
 * that points back at itself and a branch that rejoins the spine, and both are
 * far easier to reason about as data than as pixels.
 */
export function layout(nodes: WorkflowNode[]): { placed: Placed[]; columns: number } {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const placed: Placed[] = [];
  const seen = new Set<string>();

  /* The spine: every condition answered Yes. That is the story the workflow is
     about, and the path a customer pictures when they describe it. */
  let cur: WorkflowNode | undefined = nodes.find(n => n.type === 'trigger') ?? nodes[0];
  let col = 0;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    placed.push({ node: cur, column: col, row: 0 });
    col += 1;
    const next: string | null = cur.type === 'condition'
      ? (cur.yesId ?? cur.nextId ?? null)
      : (cur.nextId ?? null);
    cur = next ? byId.get(next) : undefined;
  }

  /* Then each No branch, under the column after the condition it left. A branch
     that rejoins the spine stops at the join rather than drawing the rest of the
     spine a second time — the arrow back is what says it rejoined. */
  for (const p of placed.filter(x => x.node.type === 'condition')) {
    const noId = p.node.noId;
    if (!noId || seen.has(noId)) continue;
    let b: WorkflowNode | undefined = byId.get(noId);
    let bcol = p.column + 1;
    while (b && !seen.has(b.id)) {
      seen.add(b.id);
      placed.push({ node: b, column: bcol, row: 1, from: p.node.id });
      bcol += 1;
      const nx: string | null = b.type === 'condition' ? (b.yesId ?? b.nextId ?? null) : (b.nextId ?? null);
      b = nx ? byId.get(nx) : undefined;
    }
  }

  /* Anything unreachable — a step left disconnected in the builder — still gets
     drawn, on the second row, at the end. Dropping it silently would mean a
     customer who cannot find the step they added concludes it was deleted. */
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    placed.push({ node: n, column: Math.max(0, col), row: 1 });
    col += 1;
  }

  const columns = placed.reduce((m, p) => Math.max(m, p.column + 1), 1);
  return { placed, columns };
}
