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
