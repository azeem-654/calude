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
import {
  edgesOf, insertAfter, layout, nodeDetail, patchStep, previewStep, problemsWith,
  pointReaderAt, readerOf, removeStep, swapWithNext, swapWithPrev,
} from '../src/components/Autopilot/workflowNodes';
import { TEMPLATES } from '../src/components/Autopilot/workflowTemplates';
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

/* ── A workflow that runs on a clock ─────────────────────────────────────── */

{
  const scheduled: WorkflowNode[] = [
    n('a', 'trigger', 'Every day', { event: 'schedule', cadence: 'daily' }, 'b'),
    n('b', 'ai', 'Write a post', { source: 'portfolio', produces: 'social', count: '1' }),
  ];
  ok('a schedule and an agent is a complete workflow', problemsWith('Daily posts', scheduled).length === 0,
    problemsWith('Daily posts', scheduled).join(' | '));

  /*
   * The check this whole pass exists for. A workflow on a schedule runs with
   * nobody in it. A send step in one has no address, so it would be stepped
   * over at run time — a line in a log nobody reads, on a workflow the screen
   * says is live. Named before it is saved instead.
   */
  const sendsToNobody: WorkflowNode[] = [
    n('a', 'trigger', 'Every day', { event: 'schedule', cadence: 'daily' }, 'b'),
    n('b', 'ai', 'Write a post', { source: 'portfolio', produces: 'social' }, 'c'),
    n('c', 'send_email', 'Tell them', { subject: 'Hello' }),
  ];
  ok('a send step in a scheduled workflow is named as having nobody to send to',
    problemsWith('x', sendsToNobody).some(p => /no person in it/i.test(p)),
    problemsWith('x', sendsToNobody).join(' | '));

  const nothingToDo: WorkflowNode[] = [
    n('a', 'trigger', 'Every day', { event: 'schedule', cadence: 'daily' }, 'b'),
    n('b', 'add_tag', 'Tag them', { tag: 'x' }),
  ];
  ok('a scheduled workflow with no agent is refused',
    problemsWith('x', nothingToDo).some(p => /needs an AI agent/i.test(p)),
    problemsWith('x', nothingToDo).join(' | '));

  /* A feed agent with no address fetches nothing, every morning, silently. */
  const noAddress: WorkflowNode[] = [
    n('a', 'trigger', 'Every day', { event: 'schedule', cadence: 'daily' }, 'b'),
    n('b', 'ai', 'Write it up', { source: 'rss', sourceUrl: '', produces: 'blog' }),
  ];
  ok('an agent reading a feed with no address is refused',
    problemsWith('x', noAddress).some(p => /no address is set/i.test(p)),
    problemsWith('x', noAddress).join(' | '));
  /* And the same agent reading the portfolio needs no address at all. */
  ok('the same agent reading the portfolio needs none',
    problemsWith('x', [
      n('a', 'trigger', 'Every day', { event: 'schedule', cadence: 'daily' }, 'b'),
      n('b', 'ai', 'Write it up', { source: 'portfolio', produces: 'blog' }),
    ]).length === 0);

  /* The line under the step's name says where the work ends up, because "where
     did it put it" is the question this feature is answered by. */
  ok('the agent step says what it reads and where the result goes',
    /portfolio/i.test(nodeDetail('ai', { source: 'portfolio', produces: 'social' }))
    && /Social Creator/.test(nodeDetail('ai', { source: 'portfolio', produces: 'social' })),
    nodeDetail('ai', { source: 'portfolio', produces: 'social' }));
  ok('and a schedule trigger reads as a schedule rather than as its config',
    nodeDetail('trigger', { event: 'schedule', cadence: 'weekly' }) === 'Every week',
    nodeDetail('trigger', { event: 'schedule', cadence: 'weekly' }));

  /* The dry run must not claim to show copy it cannot have: the model writes
     it at run time. */
  const pv = previewStep(n('b', 'ai', 'Write a post', { source: 'portfolio', produces: 'social', count: '2' }));
  ok('the agent preview says what it would do without inventing the copy',
    !pv.blocked && pv.subject === undefined && pv.body === undefined, JSON.stringify(pv));
  ok('and says everything it makes is a draft',
    pv.notes.some(x => /draft/i.test(x)), pv.notes.join(' | '));

  const blocked = previewStep(n('b', 'ai', 'Write it up', { source: 'rss', produces: 'blog' }));
  ok('an agent with no feed address is blocked in the preview too',
    /no address/i.test(blocked.blocked), blocked.blocked);
}

/* ── Every branch gets its own row, and every link is a line ─────────────── */

{
  /* A fork inside a fork. The old layout gave every branch one shared second
     row and never laid out a condition's No path when that condition was
     itself on a branch — those steps fell into the "unreachable" pile and were
     drawn as though disconnected. */
  const nested: WorkflowNode[] = [
    n('a', 'trigger', 'Form', {}, 'b'),
    n('b', 'condition', 'Outer?', { field: 'status' }, null, { yesId: 'c', noId: 'd' }),
    n('c', 'send_email', 'Outer yes', { subject: 'x' }),
    n('d', 'condition', 'Inner?', { field: 'tag' }, null, { yesId: 'e', noId: 'f' }),
    n('e', 'send_email', 'Inner yes', { subject: 'y' }),
    n('f', 'send_sms', 'Inner no', { message: 'z' }),
  ];
  const r = layout(nested);
  const row = (id: string) => r.placed.find(p => p.node.id === id)?.row;
  ok('a fork inside a fork gives the inner No its own row',
    row('d') === 1 && row('e') === 1 && row('f') === 2,
    JSON.stringify(r.placed.map(p => `${p.node.id}:${p.row}:${p.column}`)));
  ok('and the inner No remembers which condition it left',
    r.placed.find(p => p.node.id === 'f')?.from === 'd');
  ok('and no two steps share a place',
    new Set(r.placed.map(p => `${p.row}:${p.column}`)).size === r.placed.length);

  const edges = edgesOf(nested);
  /* The thing that was missing from the screen: a line from a condition to
     the branch it starts. */
  ok('every condition yields both of its outcomes as lines',
    edges.filter(e => e.from === 'b').length === 2 && edges.filter(e => e.from === 'd').length === 2);
  ok('the No outcome leads to the branch it starts',
    edges.some(e => e.from === 'b' && e.branch === 'no' && e.to === 'd'));
}

{
  /* An outcome that leads nowhere is still an outcome — the workflow ends there
     for everybody who answers that way. */
  const e = edgesOf([
    n('a', 'trigger', 'Form', {}, 'b'),
    n('b', 'condition', 'Replied?', { field: 'status' }, null, { yesId: null, noId: 'c' }),
    n('c', 'send_email', 'Chase', { subject: 's' }),
  ]);
  ok('an unwired Yes is drawn as an ending, not dropped',
    e.some(x => x.from === 'b' && x.branch === 'yes' && x.to === null));
}

{
  /* Every template in the library lays out with nothing overlapping and no
     step left disconnected. This is the check that would have caught the
     floating branch on the first template that had one. */
  for (const t of TEMPLATES) {
    const r = layout(t.nodes);
    const places = r.placed.map(p => `${p.row}:${p.column}`);
    ok(`${t.key} · lays out with nothing on top of anything else`,
      new Set(places).size === places.length, places.join(' '));
    ok(`${t.key} · every step is placed`, r.placed.length === t.nodes.length,
      `${r.placed.length} of ${t.nodes.length}`);
  }
}

/* ── Editing a graph without breaking it ────────────────────────────────── */

{
  /* The bug: renaming a step rebuilt every link from the list order, so a
     condition whose Yes ends the workflow was re-pointed at the No branch. In
     "Speed to Lead" that chased the people who had replied. */
  const speed = TEMPLATES.find(t => t.key === 'speed-to-lead')!.nodes;
  const renamed = patchStep(speed, 'n1', { label: 'Tag them' });
  const cond = renamed.find(x => x.id === 'n6')!;
  ok('renaming a step changes no link at all',
    JSON.stringify(renamed.map(x => [x.id, x.nextId, x.yesId ?? null, x.noId ?? null]))
      === JSON.stringify(speed.map(x => [x.id, x.nextId, x.yesId ?? null, x.noId ?? null])));
  ok('in particular a Yes that ends the workflow still ends it',
    (cond.yesId ?? null) === null && cond.noId === 'n7', JSON.stringify(cond));

  const configured = patchStep(speed, 'n3', { config: { subject: 'New subject' } });
  ok('changing a step’s settings keeps its other settings',
    configured.find(x => x.id === 'n3')?.config.body === speed.find(x => x.id === 'n3')?.config.body);
}

{
  const g: WorkflowNode[] = [
    n('a', 'trigger', 'Form', {}, 'b'),
    n('b', 'condition', 'Q?', { field: 'status' }, null, { yesId: 'c', noId: 'd' }),
    n('c', 'send_email', 'Yes mail', { subject: 'y' }),
    n('d', 'send_email', 'No mail', { subject: 'n' }),
  ];
  const added = insertAfter(g, 'b', n('x', 'wait', 'Wait', { days: '1' }));
  const b = added.find(v => v.id === 'b')!;
  ok('adding after a condition goes on its Yes path', b.yesId === 'x' && added.find(v => v.id === 'x')?.nextId === 'c',
    JSON.stringify(b));
  ok('and leaves its No branch exactly where it was', b.noId === 'd');

  const mid = insertAfter(g, 'c', n('y', 'add_tag', 'Tag', { tag: 't' }));
  ok('adding after a step takes over where it was going',
    mid.find(v => v.id === 'c')?.nextId === 'y' && (mid.find(v => v.id === 'y')?.nextId ?? null) === null);
}

{
  const g: WorkflowNode[] = [
    n('a', 'trigger', 'Form', {}, 'b'),
    n('b', 'add_tag', 'Tag', { tag: 't' }, 'c'),
    n('c', 'condition', 'Q?', { field: 'status' }, null, { yesId: 'd', noId: 'e' }),
    n('d', 'send_email', 'Yes', { subject: 'y' }),
    n('e', 'send_email', 'No', { subject: 'n' }),
  ];
  const r = removeStep(g, 'b');
  ok('removing a step joins what was before it to what was after it',
    r.find(v => v.id === 'a')?.nextId === 'c' && !r.some(v => v.id === 'b'));
  const r2 = removeStep(g, 'e');
  ok('removing the first step of a No branch leaves that outcome ending, not rewired',
    (r2.find(v => v.id === 'c')?.noId ?? null) === null && r2.find(v => v.id === 'c')?.yesId === 'd');
}

{
  const g: WorkflowNode[] = [
    n('a', 'trigger', 'Form', {}, 'b'),
    n('b', 'add_tag', 'One', { tag: '1' }, 'c'),
    n('c', 'add_tag', 'Two', { tag: '2' }, 'd'),
    n('d', 'condition', 'Q?', { field: 'status' }, null, { yesId: null, noId: null }),
  ];
  const s1 = swapWithNext(g, 'b');
  ok('swapping two steps swaps them on the path',
    s1.find(v => v.id === 'a')?.nextId === 'c' && s1.find(v => v.id === 'c')?.nextId === 'b'
      && s1.find(v => v.id === 'b')?.nextId === 'd');
  ok('and moving it back puts it back',
    JSON.stringify(swapWithPrev(s1, 'b').map(v => [v.id, v.nextId])) === JSON.stringify(g.map(v => [v.id, v.nextId])));
  /* A condition carries a branch; swapping past it would move that branch to a
     different point in the story without anybody deciding that. */
  ok('a step is not swapped past a condition', swapWithNext(g, 'c') === g);
  ok('and the trigger never moves', swapWithNext(g, 'a') === g);
}

/* ── Choosing what a scheduled workflow reads, from its trigger ────────── */

{
  const bare: WorkflowNode[] = [n('t', 'trigger', 'Every day', { event: 'schedule', cadence: 'daily' })];
  const withReader = pointReaderAt(bare, 'website', { sourceUrl: 'https://example.com/news' });
  const agent = readerOf(withReader);
  /* A scheduled workflow with nothing to run is a clock with no hands. */
  ok('choosing a source on a bare schedule adds an agent to read it',
    !!agent && agent.config.source === 'website' && agent.config.sourceUrl === 'https://example.com/news');
  ok('and joins it to the trigger', withReader.find(v => v.id === 't')?.nextId === agent?.id);
  ok('and the result is a workflow that can be saved', problemsWith('x', withReader).length === 0,
    problemsWith('x', withReader).join(' | '));

  const existing: WorkflowNode[] = [
    n('t', 'trigger', 'Every day', { event: 'schedule' }, 'a'),
    n('a', 'ai', 'Write', { source: 'portfolio', produces: 'blog', count: '1' }),
  ];
  const repointed = pointReaderAt(existing, 'web', { sourcePrompt: 'heat pump grants this month' });
  const a = readerOf(repointed)!;
  ok('an existing agent is repointed rather than a second one added', repointed.filter(v => v.type === 'ai').length === 1);
  ok('and keeps what it makes', a.config.produces === 'blog' && a.config.source === 'web');

  const noQuestion = pointReaderAt(existing, 'web', {});
  ok('a web search with no question is refused by name',
    problemsWith('x', noQuestion).some(p => /no question/i.test(p)), problemsWith('x', noQuestion).join(' | '));
}

for (const line of out) console.log(line);
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
