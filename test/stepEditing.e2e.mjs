/**
 * Editing a workflow one step at a time, from the diagram.
 *
 * Needs a built bundle and `npx wrangler dev --local`, and a workspace with a
 * project (the demo is fine):
 *   node test/stepEditing.e2e.mjs <token> <accountId> <projectId>
 *
 * ── What is worth checking ──
 *
 * That the diagram can be understood and changed without leaving it: branches
 * drawn as lines rather than floating, a pen on every step that opens that
 * step only, a form made on the spot and attached — and, most of all, that
 * saving one step changes that step and nothing else. The bug this replaced
 * rewired a condition's Yes path whenever any step was renamed, so the last
 * check reads the graph back from the server and compares every link.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const B = 'http://localhost:8787';
const [TOK, ACCT, PROJ] = process.argv.slice(2);
if (!TOK || !ACCT || !PROJ) {
  console.error('usage: node test/stepEditing.e2e.mjs <token> <accountId> <projectId>');
  process.exit(2);
}

const out = [];
const ok = (n, p, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);
const api = (path, body) => fetch(`${B}${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: TOK, accountId: ACCT, ...body }),
}).then(r => r.json());

/* A workflow with a fork whose Yes ends the workflow — the exact shape the old
   relink broke — seeded fresh so the test does not depend on other fixtures. */
const nodes = [
  { id: 'n0', type: 'trigger', label: 'A form is submitted', config: { event: 'form_submitted' }, nextId: 'n1' },
  { id: 'n1', type: 'wait', label: 'Wait 3 days', config: { days: '3' }, nextId: 'n2' },
  { id: 'n2', type: 'condition', label: 'Already a customer?', config: { field: 'status', operator: 'equals', value: 'customer' }, nextId: null, yesId: null, noId: 'n3' },
  { id: 'n3', type: 'send_email', label: 'Still interested?', config: { subject: 'Still thinking it over, {{firstName}}?', body: 'Hello' }, nextId: 'n4' },
  { id: 'n4', type: 'add_tag', label: 'Tag as chased', config: { tag: 'chased' }, nextId: null },
];
/* Leftovers from a run that died before cleaning up would otherwise be the
   first diagram on the page, and the test would edit one workflow and check
   another. */
for (const w of (await api('/api/autopilot.php', { action: 'workflows', projectId: PROJ })).workflows ?? []) {
  if (w.name === 'Step editing check' || w.name === 'DBG flow') {
    await api('/api/autopilot.php', { action: 'delete_workflow', workflowId: w.id });
  }
}

const saved = await api('/api/autopilot.php', {
  action: 'save_workflow', projectId: PROJ,
  record: { name: 'Step editing check', description: 'e2e', status: 'draft', nodes },
});
if (!saved.success) { console.error('could not seed', saved); process.exit(2); }
const WF = saved.id;
const links = ns => JSON.stringify(ns.map(n => [n.id, n.nextId ?? null, n.yesId ?? null, n.noId ?? null]));

const b = await pw.chromium.launch();
const open = async (width = 1400, reduce = false) => {
  const ctx = await b.newContext({ viewport: { width, height: 1100 }, reducedMotion: reduce ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(([token, acct]) => {
    localStorage.setItem('crm_session', JSON.stringify({ token, backend: 'php', user: { email: 'se@test.dev', name: 'S', role: 'agency', accountId: acct } }));
    localStorage.setItem('crm_active_account', acct);
    localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: acct, name: 'S', plan: 'starter', status: 'active', price: 0 }]));
  }, [TOK, ACCT]);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${B}/autopilot`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2600);
  return { ctx, p, errs };
};

/* ── The diagram ── */
{
  const { ctx, p, errs } = await open();
  const diagram = p.getByRole('group', { name: 'Workflow diagram' })
    .filter({ hasText: 'Already a customer?' }).first();
  await diagram.scrollIntoViewIfNeeded();

  /* The complaint: the No branch floated on the row below with nothing
     joining it to its condition. Every link is now a drawn line. */
  const lines = await diagram.locator('svg path').count();
  ok('every link in the workflow is a drawn line', lines >= 5, `${lines} lines`);
  const text = (await diagram.textContent()) ?? '';
  ok('the fork is labelled with what each answer means', /Yes/.test(text) && /No/.test(text), text.slice(0, 200));
  ok('an answer that leads nowhere says so', /Ends here/.test(text), text.slice(0, 200));

  const pens = await diagram.getByRole('button', { name: /^Edit step:/ }).count();
  ok('every step carries a pen', pens === nodes.length, `${pens} of ${nodes.length}`);

  /* ── The pen opens that step, and only that step ── */
  await diagram.getByRole('button', { name: 'Edit step: Still interested?' }).click();
  await p.waitForTimeout(600);
  /* Anchored to the panel itself, not its name: the name follows the step's
     name, which is the thing this test renames. */
  const panel = p.getByRole('dialog').filter({ has: p.locator('.ap-drawer-in') });
  ok('the pen opens a panel for that step', await panel.isVisible());
  ok('beside the diagram, not over the whole screen',
    (await panel.locator('.ap-drawer-in').boundingBox())?.width < 500);
  const pt = (await panel.textContent()) ?? '';
  ok('it says which step of how many', /step \d+ of 5/.test(pt), pt.slice(0, 160));
  ok('and offers the personal details as one click',
    await panel.getByRole('button', { name: 'First name' }).first().isVisible());

  /* Rename it and save — the edit that used to rewire the fork. */
  await panel.getByRole('tab', { name: /Setup/ }).click();
  await panel.getByPlaceholder('Email').fill('Still keen?');
  await panel.getByRole('button', { name: /Save step/ }).click();
  await p.waitForTimeout(1500);

  const after = (await api('/api/autopilot.php', { action: 'workflows', projectId: PROJ })).workflows.find(w => w.id === WF);
  ok('the rename is stored', after?.nodes.find(n => n.id === 'n3')?.label === 'Still keen?',
    after?.nodes.find(n => n.id === 'n3')?.label);
  ok('and not one link in the workflow changed', links(after?.nodes ?? []) === links(nodes),
    `${links(nodes)} → ${links(after?.nodes ?? [])}`);
  ok('in particular, customers still stop at the fork',
    (after?.nodes.find(n => n.id === 'n2')?.yesId ?? null) === null);

  ok('nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── The trigger: guided, and a form made on the spot ── */
{
  const { ctx, p, errs } = await open();
  const diagram = p.getByRole('group', { name: 'Workflow diagram' })
    .filter({ hasText: 'Already a customer?' }).first();
  await diagram.scrollIntoViewIfNeeded();
  await diagram.getByRole('button', { name: 'Edit step: A form is submitted' }).click();
  await p.waitForTimeout(700);
  const panel = p.getByRole('dialog').filter({ has: p.locator('.ap-drawer-in') });
  const pt = (await panel.textContent()) ?? '';

  ok('the trigger offers both kinds of start',
    /When somebody does something/.test(pt) && /On a schedule, reading something/.test(pt));
  ok('including a web page and a web search', /A web page/.test(pt) && /A web search/.test(pt));
  ok('and asks which form rather than for a name to type',
    await panel.getByLabel('Which form starts it').isVisible());

  await panel.getByRole('button', { name: /Make a new form/ }).click();
  await p.waitForTimeout(400);
  const pop = p.getByRole('dialog', { name: 'Make a new form' });
  const formName = `Quote check ${Date.now().toString(36)}`;
  await pop.getByPlaceholder('Get a quote').fill(formName);
  await pop.getByRole('button', { name: /Make it and attach it/ }).click();
  await p.waitForTimeout(1400);
  const popText = (await pop.textContent()) ?? '';
  ok('the form is made and attached', /is live and this workflow now starts/.test(popText), popText.slice(0, 200));
  /* The step people miss, said at the moment it matters. */
  ok('and it says the form must be put on a page to collect anything', /has to be on a page/.test(popText));
  await pop.getByRole('button', { name: /^Done$/ }).click();
  await p.waitForTimeout(300);

  await panel.getByRole('button', { name: /Save step/ }).click();
  await p.waitForTimeout(1500);

  const forms = (await api('/api/engagement.php', { action: 'list_form' })).items ?? [];
  const made = forms.find(f => f.name === formName);
  ok('the form really exists, switched on', made?.status === 'live', JSON.stringify(made ?? null).slice(0, 120));
  const after = (await api('/api/autopilot.php', { action: 'workflows', projectId: PROJ })).workflows.find(w => w.id === WF);
  const trig = after?.nodes.find(n => n.id === 'n0');
  /* Attached by the form itself, so renaming the form later does not detach it. */
  ok('the trigger is attached to that form by id, not just by name',
    trig?.config?.formId === made?.id && trig?.config?.formName === formName, JSON.stringify(trig?.config));

  await api('/api/engagement.php', { action: 'delete_form', id: made?.id });
  ok('nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── Choosing a reading source from the trigger sets up the agent too ── */
{
  const { ctx, p } = await open();
  const diagram = p.getByRole('group', { name: 'Workflow diagram' })
    .filter({ hasText: 'Already a customer?' }).first();
  await diagram.scrollIntoViewIfNeeded();
  await diagram.getByRole('button', { name: /Edit step: A form is submitted|Edit step: Every day/ }).first().click();
  await p.waitForTimeout(600);
  const panel = p.getByRole('dialog').filter({ has: p.locator('.ap-drawer-in') });
  await panel.getByRole('button', { name: /A web page/ }).click();
  await p.waitForTimeout(400);
  const t = (await panel.textContent()) ?? '';
  ok('choosing a web page asks for its address right there', await panel.getByPlaceholder('https://example.com/news').isVisible(), t.slice(0, 200));
  ok('and the trigger becomes a schedule', /Every day|How often/.test(t));
  /* Not saved: this workflow has send steps, which a schedule cannot use, and
     the panel refuses by name rather than saving something that cannot run. */
  ok('a schedule over steps that need a person is refused, by name',
    /sends to a person/i.test(t) && await panel.getByRole('button', { name: /Save step/ }).isDisabled(), t.slice(-300));
  await ctx.close();
}

/* ── Motion ── */
{
  const { ctx, p } = await open(1400, true);
  const moving = await p.evaluate(() => Array.from(document.querySelectorAll('*'))
    .filter(el => { const a = getComputedStyle(el).animationName; return a && a !== 'none'; }).length);
  ok('asked for reduced motion, the diagram is completely still', moving === 0, `${moving} animated`);
  await ctx.close();
}

await api('/api/autopilot.php', { action: 'delete_workflow', workflowId: WF });
await b.close();
for (const line of out) console.log(line);
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
