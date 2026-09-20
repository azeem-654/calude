/**
 * The two judgements a workflow screen makes, argued with directly.
 *
 * Run with `npm run test:nodes`. No browser and no database: `layout` and
 * `problemsWith` are pure functions over a graph, which is what makes "would
 * it draw this correctly?" and "would it let this be saved?" answerable
 * without clicking anything.
 *
 * ── Why these two ──
 *
 * `layout` decides what a customer sees, and the cases that matter are the
 * ones a plausible implementation gets wrong while looking right: a graph that
 * points back at itself, a branch that rejoins the spine, a step left
 * disconnected in the editor.
 *
 * `problemsWith` decides what reaches a real person. A workflow with no trigger
 * never starts, and one whose email has no subject sends a blank message to
 * somebody's customer — which is the kind of thing found in a delivery log
 * rather than in a builder.
 */
import { layout, problemsWith } from '../src/components/Autopilot/workflowNodes';
import type { WorkflowNode } from '../src/services/autopilot';

const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);

const n = (
  id: string, type: string, label = '',
  config: Record<string, string> = {}, nextId: string | null = null,
  extra: Partial<WorkflowNode> = {},
): WorkflowNode => ({ id, type, label: label || type, config, nextId, ...extra });

/* ── Laying a graph out ── */
{
  const straight = [
    n('a', 'trigger', 'Form', {}, 'b'),
    n('b', 'add_tag', 'Tag', {}, 'c'),
    n('c', 'send_email', 'Email', {}),
  ];
  const r = layout(straight);
  ok('a straight workflow is one row', r.placed.every(p => p.row === 0), JSON.stringify(r.placed.map(p => p.row)));
  ok('in the order it runs', r.placed.map(p => p.node.id).join('') === 'abc', r.placed.map(p => p.node.id).join(''));
  ok('and its width is its length', r.columns === 3, String(r.columns));
}

{
  /* A condition: Yes carries the spine, No drops to the row beneath starting in
     the column after the condition — which is what makes two paths read as two
     paths rather than as an indented list. */
  const branched = [
    n('a', 'trigger', 'Form', {}, 'b'),
    n('b', 'condition', 'Customer?', { field: 'status' }, null, { yesId: 'c', noId: 'd' }),
    n('c', 'send_email', 'Yes path', {}),
    n('d', 'send_sms', 'No path', {}),
  ];
  const r = layout(branched);
  const yes = r.placed.find(p => p.node.id === 'c');
  const no = r.placed.find(p => p.node.id === 'd');
  ok('the Yes branch stays on the spine', yes?.row === 0, JSON.stringify(yes));
  ok('the No branch drops a row', no?.row === 1, JSON.stringify(no));
  ok('and starts after the condition it left', no?.column === 2, String(no?.column));
  ok('the No branch remembers which condition it came from', no?.from === 'b', String(no?.from));
}

{
  /* The one that hangs a naive renderer. `nextId` is drawn by hand in the
     editor and nothing stops somebody pointing the last step back at the
     first — the layout has to stop rather than loop for ever. */
  const loop = [
    n('a', 'trigger', 'Form', {}, 'b'),
    n('b', 'add_tag', 'One', {}, 'c'),
    n('c', 'add_tag', 'Two', {}, 'b'),
  ];
  const r = layout(loop);
  ok('a graph that points back at itself is drawn once, not for ever',
    r.placed.length === 3, String(r.placed.length));
}

{
  /* A step left disconnected in the editor. Dropping it silently means a
     customer who cannot find the step they added concludes it was deleted. */
  const orphan = [
    n('a', 'trigger', 'Form', {}, 'b'),
    n('b', 'send_email', 'Reached', {}),
    n('z', 'add_tag', 'Stranded', {}),
  ];
  const r = layout(orphan);
  ok('a disconnected step is still drawn', r.placed.some(p => p.node.id === 'z'),
    r.placed.map(p => p.node.id).join(','));
  ok('and not on the spine, where it would read as part of the flow',
    r.placed.find(p => p.node.id === 'z')?.row === 1);
}

{
  ok('an empty graph does not throw', layout([]).placed.length === 0);
}

/* ── What must not be saved ── */
{
  const good: WorkflowNode[] = [
    n('a', 'trigger', 'Form', { event: 'form_submitted' }, 'b'),
    n('b', 'send_email', 'Reply', { subject: 'Thanks' }),
  ];
  ok('a workable workflow has nothing wrong with it', problemsWith('Answer enquiries', good).length === 0,
    problemsWith('Answer enquiries', good).join(' | '));

  ok('an unnamed one is refused', problemsWith('', good).some(p => /name/i.test(p)));

  const noTrigger = [n('b', 'send_email', 'Reply', { subject: 'Thanks' })];
  ok('one with no trigger is refused, because nothing would start it',
    problemsWith('x', noTrigger).some(p => /trigger/i.test(p)), problemsWith('x', noTrigger).join(' | '));

  const onlyTrigger = [n('a', 'trigger', 'Form', { event: 'form_submitted' })];
  ok('a trigger on its own is refused', problemsWith('x', onlyTrigger).some(p => /at least one step/i.test(p)));

  /* The two that reach a real person carrying nothing. */
  const blankEmail: WorkflowNode[] = [
    n('a', 'trigger', 'Form', { event: 'form_submitted' }, 'b'),
    n('b', 'send_email', 'Reply', {}),
  ];
  ok('an email with no subject is refused, not sent blank',
    problemsWith('x', blankEmail).some(p => /blank email/i.test(p)), problemsWith('x', blankEmail).join(' | '));

  const blankSms: WorkflowNode[] = [
    n('a', 'trigger', 'Form', { event: 'form_submitted' }, 'b'),
    n('b', 'send_sms', 'Text', {}),
  ];
  ok('a text with no message is refused', problemsWith('x', blankSms).some(p => /empty text/i.test(p)));

  /* A condition with nothing to test always takes No, which is a workflow that
     silently does the opposite of what it looks like. */
  const blankCondition: WorkflowNode[] = [
    n('a', 'trigger', 'Form', { event: 'form_submitted' }, 'b'),
    n('b', 'condition', 'Is it?', {}),
  ];
  ok('a condition with nothing to test is refused',
    problemsWith('x', blankCondition).some(p => /always take the No branch/i.test(p)));

  const blankTag: WorkflowNode[] = [
    n('a', 'trigger', 'Form', { event: 'form_submitted' }, 'b'),
    n('b', 'add_tag', 'Tag them', {}),
  ];
  ok('a tag step with no tag is refused', problemsWith('x', blankTag).some(p => /no tag named/i.test(p)));

  /* Named individually rather than counted: "3 problems" is not something
     anybody can act on. */
  const several: WorkflowNode[] = [
    n('a', 'trigger', 'Form', { event: 'form_submitted' }, 'b'),
    n('b', 'send_email', 'One', {}, 'c'),
    n('c', 'send_sms', 'Two', {}),
  ];
  ok('every problem is named, not counted', problemsWith('x', several).length === 2,
    problemsWith('x', several).join(' | '));
  ok('and each names the step it is about',
    problemsWith('x', several).every(p => /"One"|"Two"/.test(p)), problemsWith('x', several).join(' | '));
}

for (const line of out) console.log(line);
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
