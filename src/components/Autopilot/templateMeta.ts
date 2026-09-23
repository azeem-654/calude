/**
 * What a template is, worked out from what it does.
 *
 * ── Why this is derived rather than typed out ──
 *
 * The gallery wants a difficulty, a setup time, a list of what comes out of it
 * and whether the AI is involved. Every one of those is a fact about the graph,
 * and a field somebody has to remember to set is a field that is wrong on half
 * the rows the first time anybody adds a template in a hurry. The same argument
 * this codebase already makes for `kindFor`, `groupOf` and the capabilities on
 * a project: derived, never asked.
 *
 * What is *not* derivable stays on the template: the problem it solves, what has
 * to be connected, and what it is honest to expect. Those are judgements.
 *
 * ── The setup estimate ──
 *
 * It is a real estimate of a real job: reading the steps and filling in the
 * fields that are blank or generic. It is not a number picked to look good. A
 * template with eight steps, three of which carry copy somebody will rewrite,
 * genuinely takes longer than a two-step scheduled agent — and the gallery
 * should say so, because a customer choosing between them is choosing partly on
 * that.
 *
 * Pure, and tested as such: `npm run test:templates`.
 */
import type { WorkflowNode } from '../../services/autopilot';

export type Difficulty = 'easy' | 'medium' | 'advanced';

/** Steps whose copy somebody will almost certainly rewrite before switching on. */
const WRITTEN = new Set(['send_email', 'send_sms']);
/** Steps that need a decision rather than just a read. */
const THOUGHT = new Set(['condition', 'ai', 'assign_to', 'update_field']);

/**
 * How hard this is to get running.
 *
 * Branches are what make a workflow hard to hold in your head, so a condition
 * counts for more than a step. Length alone is a poor guide: a ten-step drip is
 * long and simple, and a four-step graph that forks twice is short and not.
 */
export function difficultyOf(nodes: WorkflowNode[]): Difficulty {
  const branches = nodes.filter(n => n.type === 'condition').length;
  const decisions = nodes.filter(n => THOUGHT.has(n.type)).length;
  const score = nodes.length + branches * 3 + decisions;
  if (score <= 9) return 'easy';
  if (score <= 16) return 'medium';
  return 'advanced';
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  advanced: 'Advanced',
};

/**
 * Roughly how long it takes to set up, in minutes.
 *
 * Four minutes of reading, plus the fields. A written step is the expensive one
 * because somebody rewrites the copy; a branch costs a decision. Rounded to the
 * nearest five so it reads as the estimate it is rather than as a measurement —
 * "18 minutes" implies a precision nobody has.
 */
export function setupMinutes(nodes: WorkflowNode[]): number {
  const written = nodes.filter(n => WRITTEN.has(n.type)).length;
  const branches = nodes.filter(n => n.type === 'condition').length;
  const agents = nodes.filter(n => n.type === 'ai').length;
  const raw = 4 + written * 3 + branches * 2 + agents * 3 + Math.max(0, nodes.length - written - branches - agents) * 1;
  return Math.max(5, Math.round(raw / 5) * 5);
}

/** True when a step in it is the model doing the work. */
export const usesAi = (nodes: WorkflowNode[]): boolean => nodes.some(n => n.type === 'ai');

/** True when it runs on a clock rather than on somebody doing something. */
export const isScheduled = (nodes: WorkflowNode[]): boolean =>
  nodes.some(n => n.type === 'trigger' && n.config?.event === 'schedule');

/** True when it forks. Drawn in the preview, and the reason difficulty rises. */
export const hasBranches = (nodes: WorkflowNode[]): boolean =>
  nodes.some(n => n.type === 'condition');

/**
 * What actually comes out of it, in the customer's words.
 *
 * Read from the steps rather than written per template, so a template that
 * gains a step gains the output. Ordered by what somebody cares about most —
 * a thing that reaches a customer outranks a tag on a record.
 */
export function outputsOf(nodes: WorkflowNode[]): string[] {
  const out: string[] = [];
  const has = (t: string) => nodes.some(n => n.type === t);

  if (has('send_email')) {
    const n = nodes.filter(x => x.type === 'send_email').length;
    out.push(n === 1 ? 'An email to the contact' : `${n} emails to the contact`);
  }
  if (has('send_sms')) {
    const n = nodes.filter(x => x.type === 'send_sms').length;
    out.push(n === 1 ? 'A text to the contact' : `${n} texts to the contact`);
  }

  /* The AI steps, named by where the work lands rather than by what they are.
     "An AI step" tells nobody anything; "Draft posts in the Social Creator"
     is the thing somebody is deciding whether they want. */
  for (const n of nodes.filter(x => x.type === 'ai')) {
    const produces = String(n.config?.produces ?? 'social');
    if (produces === 'social') out.push('Draft posts in the Social Creator');
    else if (produces === 'blog') out.push('A draft article in Blog');
    else if (produces === 'email_campaign') out.push('A draft campaign in Campaigns');
  }

  if (has('create_task')) out.push('A task on your list');
  if (has('assign_to')) out.push('The contact assigned to somebody');
  if (has('add_tag') || has('remove_tag')) out.push('Tags on the contact record');
  if (has('update_field')) out.push('A field updated on the contact');

  /* Never empty. A workflow that produces nothing anybody can point at is one
     nobody should add, and saying so is more useful than an empty list. */
  return out.length ? out : ['Nothing that leaves the app — this one only moves records about'];
}

/**
 * Where a branch leads, for the little Yes/No labels on the preview.
 *
 * A condition's own wording decides it: "Is it urgent?" reads better as
 * Yes/No, "Did they reply?" as Replied/No reply. Matched on the field the
 * condition tests, because that is what the engine reads and the label is
 * what the customer reads, and the two should agree.
 */
export function branchLabels(node: WorkflowNode): { yes: string; no: string } {
  const field = String(node.config?.field ?? '').toLowerCase();
  const value = String(node.config?.value ?? '').toLowerCase();
  const label = `${node.label ?? ''}`.toLowerCase();

  if (value === 'replied' || /repl/.test(label)) return { yes: 'Replied', no: 'No reply' };
  if (value === 'booked' || /book|rebook/.test(label)) return { yes: 'Booked', no: 'Still not' };
  if (value === 'paid' || /paid|purchas|bought/.test(label)) return { yes: 'Bought', no: 'Not yet' };
  if (/qualif/.test(label)) return { yes: 'Qualified', no: 'Not yet' };
  if (/approve/.test(label)) return { yes: 'Approved', no: 'Needs work' };
  if (/urgent/.test(label)) return { yes: 'Urgent', no: 'Normal' };
  if (/attend|show/.test(label)) return { yes: 'Attended', no: 'Missed' };
  if (field === 'status' && !value) return { yes: 'Yes', no: 'No' };
  return { yes: 'Yes', no: 'No' };
}
