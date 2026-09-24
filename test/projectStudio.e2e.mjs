/**
 * Starting from nothing: the example, the templates and the editor.
 *
 * Needs a built bundle and `npx wrangler dev --local --test-scheduled`, and a
 * **fresh workspace with no projects**:
 *   node test/projectStudio.e2e.mjs <token> <accountId>
 *
 * ── What is worth checking ──
 *
 * This is the path a customer takes on their first five minutes, and the two
 * things it has to get right are both about trust.
 *
 * **Nothing is switched on by accident.** The worked example, every template
 * and everything the AI writes all land as drafts, and the screen says so
 * before the button is pressed rather than after somebody's customers have
 * been emailed.
 *
 * **The example is real.** It creates the same rows a customer's own project
 * has — checked against the server, not against the screen — because a demo
 * that takes a different path through the code demonstrates the wrong code.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const B = 'http://localhost:8787';
const [TOK, ACCT] = process.argv.slice(2);
if (!TOK || !ACCT) { console.error('usage: node test/projectStudio.e2e.mjs <token> <accountId>'); process.exit(2); }

const out = [];
const ok = (n, p, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);

const api = (path, body) => fetch(`${B}${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: TOK, accountId: ACCT, ...body }),
}).then(r => r.json());

const b = await pw.chromium.launch();
const open = async (width = 1280, reduce = false) => {
  const ctx = await b.newContext({ viewport: { width, height: 1200 }, reducedMotion: reduce ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(([token, acct]) => {
    localStorage.setItem('crm_session', JSON.stringify({ token, backend: 'php', user: { email: 'ps@test.dev', name: 'S', role: 'agency', accountId: acct } }));
    localStorage.setItem('crm_active_account', acct);
    localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: acct, name: 'S', plan: 'starter', status: 'active', price: 0 }]));
  }, [TOK, ACCT]);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${B}/autopilot`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2200);
  return { ctx, p, errs };
};

/* ── 1. An empty workspace says what this is for ── */
{
  const { ctx, p, errs } = await open();
  const t = (await p.textContent('body')) ?? '';
  ok('an empty workspace says what Autopilot can do', /Writes a post a day/.test(t) && /Asks before it sends/.test(t), t.slice(0, 300));
  /* Capabilities stated as things it does, which are checkable. */
  ok('and each capability says how, not just what', /Runs on the server every five minutes/.test(t));
  ok('the example is offered and described honestly',
    /worked example/i.test(t) && /Nothing in it is switched on/.test(t), t.slice(0, 400));

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('no horizontal overflow', over <= 0, `${over}px`);
  ok('nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── 2. Building the example makes real rows ── */
let projectId = '';
{
  const { ctx, p, errs } = await open();
  await p.getByRole('button', { name: /worked example/i }).click();
  /* Four server round trips: a client, a project and three workflows. */
  await p.waitForTimeout(6500);

  const board = await api('/api/projects.php', { action: 'get' });
  const demo = (board.projects ?? []).find(x => /demo/i.test(x.name));
  ok('the example created a real project', !!demo, JSON.stringify((board.projects ?? []).map(x => x.name)));
  projectId = demo?.id ?? '';

  const wf = await api('/api/autopilot.php', { action: 'workflows', projectId });
  ok('with three real workflows in the project\'s own table',
    (wf.workflows ?? []).length === 3, String((wf.workflows ?? []).length));

  /* The check that matters most: a demonstration must not be the thing that
     emails somebody's customers. */
  ok('and every one of them is a draft',
    (wf.workflows ?? []).every(w => w.status === 'draft'),
    JSON.stringify((wf.workflows ?? []).map(w => w.status)));
  ok('and every send asks first',
    demo?.guardrails?.sendEmail === 'approval' && demo?.guardrails?.sendSms === 'approval',
    JSON.stringify(demo?.guardrails ?? {}));

  /* Real steps, not placeholders — the workflow has to be worth reading. */
  /* Found by the template it came from rather than by a word in its name: the
     library's wording is data and is allowed to change, and a test that breaks
     on a rename is a test about the copy rather than about the behaviour. */
  const enquiry = (wf.workflows ?? []).find(w => w.templateKey === 'speed-to-lead');
  ok('the workflows have real steps with real content',
    enquiry?.nodes?.some(n => n.type === 'send_email' && /Thanks for getting in touch/.test(n.config?.subject ?? '')),
    JSON.stringify(enquiry?.nodes?.map(n => n.type) ?? []));

  ok('nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── 3. The card shows it, and the editor edits it ── */
for (const width of [390, 1280]) {
  const { ctx, p, errs } = await open(width);
  const t = (await p.textContent('body')) ?? '';

  ok(`${width}px · the example project is on screen`, /Northside Plumbing/.test(t), t.slice(0, 250));
  ok(`${width}px · with a way to add a workflow`, await p.getByRole('button', { name: /Create workflow/ }).first().isVisible());

  /* The editor: open it on a real workflow and change a real field. */
  await p.getByRole('button', { name: /^Edit$/ }).first().click();
  await p.waitForTimeout(700);
  ok(`${width}px · the editor opens on that workflow`, await p.getByRole('dialog').isVisible());
  const dialog = p.getByRole('dialog');
  ok(`${width}px · and says saving does not switch it on`,
    /Saving does not switch it on/.test((await dialog.textContent()) ?? ''));

  /* Every step is openable and its config editable — which is what "fully
     editable" has to mean. */
  /* Found by the step's own label rather than by a name typed here: the
     template library is data and its wording is allowed to change, but the
     editor must always open a step and show that step's stored config. */
  await dialog.getByRole('button', { name: /Answer them/ }).first().click();
  await p.waitForTimeout(400);
  const subject = dialog.getByLabel('Subject');
  ok(`${width}px · a step's real config is on the form`,
    /Thanks for getting in touch/.test(await subject.inputValue()), await subject.inputValue());

  await subject.fill('Edited by the test');
  await dialog.getByRole('button', { name: /Save workflow/ }).click();
  await p.waitForTimeout(1500);

  /* Asked of the server, not the screen. */
  const after = await api('/api/autopilot.php', { action: 'workflows', projectId });
  const edited = (after.workflows ?? []).find(w => w.templateKey === 'speed-to-lead');
  ok(`${width}px · and the edit is stored on the server`,
    edited?.nodes?.some(n => n.config?.subject === 'Edited by the test'),
    JSON.stringify(edited?.nodes?.find(n => n.type === 'send_email')?.config ?? {}));

  /* Put it back so the other width starts from the same place. */
  await api('/api/autopilot.php', {
    action: 'save_workflow', projectId,
    record: {
      ...edited,
      nodes: (edited?.nodes ?? []).map(n => (n.type === 'send_email'
        ? { ...n, config: { ...n.config, subject: 'Thanks for getting in touch, {{firstName}}' } } : n)),
    },
  });

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`${width}px · no horizontal overflow`, over <= 0, `${over}px`);
  ok(`${width}px · nothing threw`, errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── 4. The editor refuses a workflow that cannot run ── */
{
  const { ctx, p, errs } = await open();
  /* Straight to the empty builder. The wizard's third door and this button do
     the same thing on purpose — somebody who knows the shape they want should
     not have to walk through a chooser first. */
  await p.getByRole('button', { name: /Build from scratch/ }).first().click();
  await p.waitForTimeout(700);
  const dialog = p.getByRole('dialog');

  ok('a new workflow will not save unnamed',
    await dialog.getByRole('button', { name: /Save workflow/ }).isDisabled());
  ok('and says why, rather than just greying out',
    /Not ready to save/.test((await dialog.textContent()) ?? ''), 'no reason given');

  await dialog.getByLabel('Name').fill('Test workflow');
  await dialog.getByRole('button', { name: /Add a step/ }).click();
  await p.waitForTimeout(300);
  await dialog.getByRole('button', { name: 'Email', exact: true }).click();
  await p.waitForTimeout(400);

  /* An email with no subject reaches a real person carrying nothing — the
     editor has to catch that, because the alternative is the delivery log. */
  ok('an email step with no subject is named as the problem',
    /blank email/i.test((await dialog.textContent()) ?? ''), (await dialog.textContent())?.slice(0, 300));
  ok('and saving is still refused',
    await dialog.getByRole('button', { name: /Save workflow/ }).isDisabled());

  ok('nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── 5. The bot is alive, and honours the motion preference ── */
{
  const { ctx, p } = await open();
  const named = await p.evaluate(() => Array.from(document.querySelectorAll('*'))
    .map(el => getComputedStyle(el).animationName).filter(a => a && a !== 'none'));
  ok('the project bot moves', named.some(x => x.startsWith('ap-bot')), named.join(','));
  ok('and the new-project button pulses', named.includes('ap-cta'), named.join(','));
  await ctx.close();
}
{
  const { ctx, p } = await open(1280, true);
  const moving = await p.evaluate(() => Array.from(document.querySelectorAll('*'))
    .filter(el => { const a = getComputedStyle(el).animationName; return a && a !== 'none'; }).length);
  ok('asked for reduced motion, everything is still', moving === 0, `${moving} animated elements`);
  await ctx.close();
}

await b.close();
for (const line of out) console.log(line);
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
