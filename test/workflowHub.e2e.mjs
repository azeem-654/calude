/**
 * The Autopilot workflow canvas, driven in a real browser.
 *
 * Needs a built bundle and `npx wrangler dev --local --test-scheduled`:
 *   node test/workflowHub.e2e.mjs <token> <accountId>
 *
 * ── What is worth checking on a screen like this ──
 *
 * A dashboard is the easiest place in a product to lie: a plausible number is
 * indistinguishable from a real one until somebody acts on it. So most of these
 * are about honesty rather than layout — that a quiet week says so instead of
 * showing 0%, that a workflow arrives switched off, that the branch a condition
 * does not take is drawn rather than silently dropped.
 *
 * The layout checks that do matter are the ones a typecheck cannot see: that a
 * seven-step workflow is readable at 390px, and that a branch lands under the
 * step it left rather than on top of the trigger.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const B = 'http://localhost:8787';
const [TOK, ACCT] = process.argv.slice(2);
if (!TOK || !ACCT) { console.error('usage: node test/workflowHub.e2e.mjs <token> <accountId>'); process.exit(2); }

const out = [];
const ok = (n, p, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);

const node = (id, type, label, config, nextId, extra = {}) =>
  ({ id, type, label, config, nextId, ...extra });

/* Three workflows: one that branches and rejoins, one straight line of
   content steps, and one paused — so the filters, the canvas and the live
   state all have something real to draw. */
const GRAPHS = [
  {
    id: 'wf-nurture', name: 'Lead Nurture Flow', description: 'New leads → nurture → convert',
    status: 'active', createdAt: new Date().toISOString(), enrolledCount: 0, completedCount: 0,
    nodes: [
      node('n0', 'trigger', 'New lead enters CRM', { event: 'form_submitted', formName: 'Get a quote' }, 'n1'),
      node('n1', 'add_tag', 'Tag as enquiry', { tag: 'enquiry' }, 'n2'),
      node('n2', 'condition', 'Is Amazon seller?', { field: 'tag', operator: 'equals', value: 'amazon' }, null, { yesId: 'n3', noId: 'n6' }),
      node('n3', 'send_email', 'Send Welcome', { subject: 'Are you losing money?' }, 'n4'),
      node('n4', 'wait', 'Wait 2 days', { days: '2' }, 'n5'),
      node('n5', 'send_sms', 'Send Follow-up', { message: 'Quick reminder' }, null),
      node('n6', 'send_email', 'Send Case Study', { subject: 'How others did it' }, null),
    ],
  },
  {
    id: 'wf-blog', name: 'Blog Creation Flow', description: 'Ideas into published content',
    status: 'active', createdAt: new Date().toISOString(), enrolledCount: 0, completedCount: 0,
    nodes: [
      node('n0', 'trigger', 'New blog idea', { event: 'tag_added', tag: 'idea' }, 'n1'),
      node('n1', 'wait', 'Wait 1 day', { days: '1' }, 'n2'),
      node('n2', 'update_field', 'Mark as drafted', { field: 'stage', value: 'drafted' }, null),
    ],
  },
  {
    id: 'wf-paused', name: 'Appointment Follow-up', description: 'Re-engage no-shows',
    status: 'paused', createdAt: new Date().toISOString(), enrolledCount: 0, completedCount: 0,
    nodes: [
      node('n0', 'trigger', 'Missed meeting', { event: 'appointment_scheduled' }, 'n1'),
      node('n1', 'create_task', 'Call them back', { title: 'Call this no-show' }, null),
    ],
  },
];

const b = await pw.chromium.launch();

const open = async (width, reduce = false) => {
  const ctx = await b.newContext({ viewport: { width, height: 1100 }, reducedMotion: reduce ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(([token, acct, graphs]) => {
    localStorage.setItem('crm_session', JSON.stringify({ token, backend: 'php', user: { email: 'hub@test.dev', name: 'H', role: 'agency', accountId: acct } }));
    localStorage.setItem('crm_active_account', acct);
    localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: acct, name: 'H', plan: 'starter', status: 'active', price: 0 }]));
    localStorage.setItem(`crm_acct_${acct}_crm_automations`, JSON.stringify(graphs));
  }, [TOK, ACCT, GRAPHS]);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${B}/autopilot?view=workflows`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  return { ctx, p, errs };
};

for (const width of [390, 1280]) {
  const { ctx, p, errs } = await open(width);
  const t = (await p.textContent('body')) ?? '';

  ok(`${width}px · every workflow is drawn`,
    /Lead Nurture Flow/.test(t) && /Blog Creation Flow/.test(t) && /Appointment Follow-up/.test(t), t.slice(0, 250));

  /* The steps, by their own names rather than by their type. */
  ok(`${width}px · the steps are named`,
    /New lead enters CRM/.test(t) && /Send Welcome/.test(t) && /Send Follow-up/.test(t));

  /* The config, not the label — what a step will actually do when it runs. */
  ok(`${width}px · and each says what it will actually do`,
    /Are you losing money\?/.test(t) && /Wait 2 days/.test(t), t.slice(0, 400));

  /* A condition has two outcomes even when only one is wired, and drawing only
     the taken one is how a branch nobody checks gets shipped. */
  ok(`${width}px · a condition shows both of its outcomes`,
    (t.match(/Yes/g) ?? []).length >= 1 && (t.match(/No/g) ?? []).length >= 1);
  ok(`${width}px · and the branch it did not take is drawn too`,
    /Send Case Study/.test(t), 'the No branch is missing');

  ok(`${width}px · a paused workflow says so`, /Paused/.test(t));

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`${width}px · no horizontal overflow of the page`, over <= 0, `${over}px`);
  ok(`${width}px · nothing threw`, errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── The filters are derived, not stored ── */
{
  const { ctx, p, errs } = await open(1280);
  const t = (await p.textContent('body')) ?? '';
  /* Nurture sends, so Marketing. Blog only tags and waits, so Content. The
     no-show one makes a task, so Sales. Nothing had to be filed by hand. */
  ok('workflows are filed by what their steps do', /Marketing \(1\)/.test(t) && /Content \(1\)/.test(t) && /Sales \(1\)/.test(t),
    (t.match(/Marketing \(\d\)[\s\S]{0,40}/) ?? ['not found'])[0]);

  await p.getByRole('button', { name: /^Content \(1\)$/ }).click();
  await p.waitForTimeout(500);
  const filtered = (await p.textContent('body')) ?? '';
  ok('and choosing one filters to it', /Blog Creation Flow/.test(filtered) && !/Lead Nurture Flow/.test(filtered),
    filtered.slice(0, 200));

  ok('nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── The switch is a switch ── */
{
  const { ctx, p, errs } = await open(1280);
  const sw = p.getByRole('switch', { name: /Pause Lead Nurture Flow/ });
  ok('a live workflow has a switch that is on', await sw.getAttribute('aria-checked') === 'true');
  await sw.click();
  await p.waitForTimeout(600);
  ok('and it can be switched off from the canvas',
    await p.getByRole('switch', { name: /Switch on Lead Nurture Flow/ }).getAttribute('aria-checked') === 'false');
  ok('nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── The numbers are honest ── */
{
  const { ctx, p, errs } = await open(1280);
  const t = (await p.textContent('body')) ?? '';

  /* Nothing has been sent from this workspace, so the open rate is not
     computable. A "0%" would read as a failure rather than as a quiet week,
     and an invented "+42%" is the single most tempting lie on a panel here. */
  ok('a week with no sends shows no open rate rather than 0%',
    /—\s*opened/.test(t.replace(/\s+/g, ' ')), (t.match(/[—\d%]+ opened/) ?? ['not found'])[0]);

  ok('nothing is claimed to be mid-flight when nothing is',
    /Nothing is mid-flight/.test(t), t.slice(0, 200));

  /* The one real thing this workspace has to act on. */
  ok('the real problem is in the task list', /no mailbox is connected/i.test(t));

  ok('instructions are metered as instructions, not as invented credits',
    /Instructions today/.test(t) && /0 \/ 20/.test(t), (t.match(/\d+ \/ \d+/) ?? ['not found'])[0]);

  ok('nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── Building one says what it will do before it does it ── */
{
  const { ctx, p, errs } = await open(1280);
  const t = (await p.textContent('body')) ?? '';
  ok('the AI column says a new workflow arrives switched off',
    /arrives switched off/.test(t), 'the warning before the button is missing');

  await p.getByRole('button', { name: /Chase an enquiry that has gone quiet/ }).click();
  await p.waitForTimeout(400);
  const filled = await p.getByLabel('Describe a workflow').inputValue();
  ok('a suggestion fills the box rather than building silently',
    filled.includes('gone quiet'), filled.slice(0, 80));

  ok('nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── Motion ── */
{
  const { ctx, p } = await open(1280, true);
  const moving = await p.evaluate(() => Array.from(document.querySelectorAll('*'))
    .filter(el => { const a = getComputedStyle(el).animationName; return a && a !== 'none'; }).length);
  ok('asked for reduced motion, the canvas is completely still', moving === 0, `${moving} animated elements`);
  await ctx.close();
}

await b.close();
for (const line of out) console.log(line);
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
