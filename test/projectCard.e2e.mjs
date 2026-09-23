/**
 * The AI Autopilot screen: one project card per project, and nothing else.
 *
 * Needs a built bundle and `npx wrangler dev --local --test-scheduled`:
 *   node test/projectCard.e2e.mjs <token> <accountId> <projectId>
 *
 * ── What is worth checking ──
 *
 * Two things this screen has to get right that a typecheck cannot see.
 *
 * The first is **separation**: a project's workflows are its own, in their own
 * table, and must never be the workspace-wide list under Marketing →
 * Automations. Getting that wrong would put an agency's thirty-odd rules from
 * six clients in one column, and would make deleting a project either orphan
 * rules or take somebody else's.
 *
 * The second is **honesty**, as everywhere: a workflow arrives switched off, a
 * step that cannot run is named, and a condition's untaken branch is drawn
 * rather than quietly dropped.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const B = 'http://localhost:8787';
const [TOK, ACCT, PROJ] = process.argv.slice(2);
if (!TOK || !ACCT || !PROJ) {
  console.error('usage: node test/projectCard.e2e.mjs <token> <accountId> <projectId>');
  process.exit(2);
}

const out = [];
const ok = (n, p, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);

const api = (body) => fetch(`${B}/api/autopilot.php`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: TOK, accountId: ACCT, ...body }),
}).then(r => r.json());

const projectsApi = (body) => fetch(`${B}/api/projects.php`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: TOK, accountId: ACCT, ...body }),
}).then(r => r.json());

/* ── What the server actually holds ──
   Asserted against, rather than against a name typed into this file. The
   fixture is seeded by whoever runs this, and a hard-coded "Leeds plumbing"
   fails on a differently-named project while proving nothing about the
   screen. Reading it back means the check is what it claims to be: the card
   shows *this* project, and each step says what the stored node will do. */
const NAME = await projectsApi({ action: 'get' })
  .then(r => (r.projects ?? []).find(x => x.id === PROJ)?.name ?? '');
const STEPS = await api({ action: 'workflows', projectId: PROJ })
  .then(r => (r.workflows ?? [])[0]?.nodes ?? []);
if (!NAME) { console.error(`no project ${PROJ} in workspace ${ACCT} — seed one first`); process.exit(2); }
if (!STEPS.length) { console.error(`project ${PROJ} has no workflow to draw — seed one first`); process.exit(2); }

/* The label a step is drawn with: the node's own, or the subject it sends. */
const stepLabel = (n) => String(n.label ?? n.config?.subject ?? '').trim();
const rx = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

const b = await pw.chromium.launch();

const open = async (width, reduce = false) => {
  const ctx = await b.newContext({ viewport: { width, height: 1200 }, reducedMotion: reduce ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(([token, acct]) => {
    localStorage.setItem('crm_session', JSON.stringify({ token, backend: 'php', user: { email: 'pc@test.dev', name: 'P', role: 'agency', accountId: acct } }));
    localStorage.setItem('crm_active_account', acct);
    localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: acct, name: 'P', plan: 'starter', status: 'active', price: 0 }]));
    /* A workspace automation, which must NEVER appear on the project card: the
       two lists are separate and this is the check that proves it. */
    localStorage.setItem(`crm_acct_${acct}_crm_automations`, JSON.stringify([{
      id: 'mk-1', name: 'MARKETING ONLY ROLE', description: 'workspace list', status: 'active',
      createdAt: new Date().toISOString(), enrolledCount: 0, completedCount: 0,
      nodes: [{ id: 'n0', type: 'trigger', label: 'x', config: {}, nextId: null }],
    }]));
  }, [TOK, ACCT]);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${B}/autopilot`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2400);
  return { ctx, p, errs };
};

for (const width of [390, 1280]) {
  const { ctx, p, errs } = await open(width);
  const t = (await p.textContent('body')) ?? '';

  ok(`${width}px · the project is a card of its own`, rx(NAME).test(t), t.slice(0, 250));
  ok(`${width}px · with when it was created and how many workflows are live`,
    /Created/.test(t) && /workflow.? active/.test(t), (t.match(/Created[^·]{0,40}/) ?? ['not found'])[0]);

  /* Its own tab bar — the five sections of a project. */
  for (const tab of ['Workflows', 'AI Agents', 'Assets', 'Activity', 'Analytics', 'Project Settings']) {
    ok(`${width}px · it has a ${tab} tab`, await p.getByRole('tab', { name: new RegExp(tab) }).first().isVisible());
  }

  /* The workflow, drawn. */
  ok(`${width}px · its workflow is drawn as a shape`,
    /Lead Nurture Flow/.test(t) && /New lead enters CRM/.test(t), t.slice(0, 350));
  /* Every stored step is named on the screen. A step drawn as a blank box is
     the failure this is aimed at — the customer cannot approve what it will
     not tell them. */
  {
    const labels = STEPS.map(stepLabel).filter(Boolean);
    const missing = labels.filter(l => !rx(l).test(t));
    ok(`${width}px · each step says what it will actually do`,
      labels.length > 0 && missing.length === 0, `not drawn: ${missing.join(' | ') || 'no step carries a label'}`);
  }
  ok(`${width}px · and the branch the condition did not take is drawn too`,
    /Send educational content/.test(t), 'the No branch is missing');

  /* The separation that matters. */
  ok(`${width}px · a Marketing automation is NOT on the project`,
    !/MARKETING ONLY ROLE/.test(t), 'the workspace list leaked onto the project card');

  /* And the top-level Workflows tab is gone: a project *is* its workflows, and
     a second place to look at them asked somebody to hold two mental models of
     one thing.

     Aimed at the Workflows tab itself rather than at the presence of a
     Projects tab — there is now a Projects/Templates pair, which is a
     different thing and a legitimate one. */
  ok(`${width}px · there is no second top-level Workflows view`,
    (await p.getByRole('tab', { name: /^Workflows$/ }).count()) === 0, 'the old view switcher is still there');

  ok(`${width}px · the Edit with AI column is beside it`,
    /Edit with AI/.test(t) && /Update project/.test(t));

  /* ── The bot says something, and it is true ──
     A face that talks is the most persuasive thing on a screen and the easiest
     place in this product to lie. Every line it can say is a fact about a
     record: a workflow that is switched on, a run that happened, an approval
     that is waiting. This asserts one of those is on screen, and that none of
     the stock phrases a caption like this attracts is — "analysing your
     audience" costs nothing to write and cannot be checked. */
  ok(`${width}px · the bot says what is actually happening`,
    /switched on\. I check them every five minutes|Nothing has happened here today|paused, so I am not doing anything|reading this client|waiting on you|carried out today/.test(t),
    t.slice(0, 300));
  ok(`${width}px · and never something it could not know`,
    !/analysing your|optimi[sz]ing your|crunching|thinking\u2026|working on it\u2026/i.test(t),
    (t.match(/[^.]*(analysing|optimi[sz]ing|crunching)[^.]*/i) ?? [''])[0]);
  ok(`${width}px · which says a new one arrives switched off`,
    /arrives switched off/.test(t), 'the warning before the button is missing');

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`${width}px · no horizontal overflow`, over <= 0, `${over}px`);
  ok(`${width}px · nothing threw`, errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── The tabs carry real content ── */
{
  const { ctx, p, errs } = await open(1280);

  await p.getByRole('tab', { name: /AI Agents/ }).first().click();
  await p.waitForTimeout(500);
  let t = (await p.textContent('body')) ?? '';
  ok('AI Agents points at what the project may do', /What this project is allowed to do/.test(t), t.slice(0, 200));
  /* It used to list the permissions here, unchangeable. Now it summarises them
     and sends you where they can actually be set. */
  ok('and says where they are changed', /Project Settings/.test(t));

  await p.getByRole('tab', { name: /^Assets/ }).first().click();
  await p.waitForTimeout(500);
  t = (await p.textContent('body')) ?? '';
  ok('Assets says what it holds rather than being blank',
    /Nothing made yet|lives in the module that owns it|shortcut/.test(t), t.slice(0, 200));

  /* Content Library was a second tab over the same records, fed from a
     different place, so a post written yesterday showed in one and not the
     other. One tab now — this pins that it does not come back. */
  ok('and there is no second tab over the same records',
    (await p.getByRole('tab', { name: /Content Library/ }).count()) === 0);

  await p.getByRole('tab', { name: /Analytics/ }).first().click();
  await p.waitForTimeout(600);
  t = (await p.textContent('body')) ?? '';
  ok('Analytics draws the working day', /Reads the business/.test(t) && /Next/.test(t), t.slice(0, 250));

  await p.getByRole('tab', { name: /Project Settings/ }).first().click();
  await p.waitForTimeout(600);
  t = (await p.textContent('body')) ?? '';
  ok('Settings still reaches the sending pool', /domain|sending/i.test(t), t.slice(0, 200));

  /* ── The permissions are controls, not a readout ──
     They were listed unchangeably on the Agents tab, which is the worst of
     both: the first thing somebody wants after reading one is to change it,
     and there was nowhere that could be done short of deleting the project. */
  ok('the permissions are on Settings and are settable',
    (await p.getByRole('radiogroup', { name: /Send email/ }).count()) > 0, t.slice(0, 250));
  ok('and each says what it actually governs, not just its key name',
    /Email this client|cost money per message|never run until switched on/.test(t), t.slice(0, 400));

  ok('nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── The switch really switches, on the server ── */
{
  const { ctx, p, errs } = await open(1280);
  const sw = p.getByRole('switch', { name: /Pause Lead Nurture Flow/ });
  ok('a live workflow shows as on', await sw.getAttribute('aria-checked') === 'true');
  await sw.click();
  await p.waitForTimeout(1200);

  /* Asked of the server rather than of the screen: a toggle that only moves
     locally is the exact bug this project keeps finding. */
  const after = await api({ action: 'workflows', projectId: PROJ });
  ok('and pausing it is stored on the server',
    after.workflows?.[0]?.status === 'paused', JSON.stringify(after.workflows?.[0]?.status ?? after));

  await api({ action: 'set_workflow_status', workflowId: after.workflows[0].id, status: 'active' });
  ok('nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── Motion ── */
{
  const { ctx, p } = await open(1280, true);
  const moving = await p.evaluate(() => Array.from(document.querySelectorAll('*'))
    .filter(el => { const a = getComputedStyle(el).animationName; return a && a !== 'none'; }).length);
  ok('asked for reduced motion, the screen is completely still', moving === 0, `${moving} animated elements`);
  await ctx.close();
}

await b.close();
for (const line of out) console.log(line);
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
