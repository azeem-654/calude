/**
 * The template gallery, driven in a real browser.
 *
 * Needs a built bundle and `npx wrangler dev --local`:
 *   node test/templateGallery.e2e.mjs <token> <accountId>
 *
 * ── What is worth checking ──
 *
 * The gallery's whole argument is that you can see what you are getting before
 * you get it, and that the numbers on it are real. So: that the preview is the
 * actual graph, that using a template writes the actual workflow to the server,
 * and that the usage count is a count — it goes up by one, having started at
 * nothing, rather than being a figure somebody typed.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const B = 'http://localhost:8787';
const [TOK, ACCT] = process.argv.slice(2);
if (!TOK || !ACCT) { console.error('usage: node test/templateGallery.e2e.mjs <token> <accountId>'); process.exit(2); }

const out = [];
const ok = (n, p, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);

const api = (path, body) => fetch(`${B}${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: TOK, accountId: ACCT, ...body }),
}).then(r => r.json());

const b = await pw.chromium.launch();
const open = async (width = 1440, reduce = false) => {
  const ctx = await b.newContext({ viewport: { width, height: 1100 }, reducedMotion: reduce ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(([token, acct]) => {
    localStorage.setItem('crm_session', JSON.stringify({ token, backend: 'php', user: { email: 'tg@test.dev', name: 'G', role: 'agency', accountId: acct } }));
    localStorage.setItem('crm_active_account', acct);
    localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: acct, name: 'G', plan: 'starter', status: 'active', price: 0 }]));
  }, [TOK, ACCT]);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${B}/autopilot?view=templates`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2600);
  return { ctx, p, errs };
};

const project = (await api('/api/projects.php', { action: 'get' })).projects?.[0];
if (!project) { console.error('seed a project first'); process.exit(2); }

/* ── The gallery ── */
for (const width of [390, 1440]) {
  const { ctx, p, errs } = await open(width);
  const t = (await p.textContent('body')) ?? '';

  ok(`${width}px · the gallery is there`, /AI Workflow Template Gallery/.test(t), t.slice(0, 200));
  ok(`${width}px · with the counts at the top`, /Workflow templates/.test(t) && /Jobs covered/.test(t));
  ok(`${width}px · and the assistant beside it`, /AI Assistant/.test(t) && /Quick prompts/.test(t));

  /* Every title ends in Automation: it is what makes a library of thirty scan
     as one set rather than as a pile of differently-written notes. */
  const titles = await p.locator('article h3').allTextContents();
  ok(`${width}px · every template is named as an automation`,
    titles.length > 10 && titles.every(x => /Automation$/.test(x.trim())),
    titles.filter(x => !/Automation$/.test(x.trim())).join(', ') || `${titles.length} titles`);

  /* The whole point: the graph is on the row, not behind a click. */
  const firstRow = p.locator('article').first();
  const rowText = (await firstRow.textContent()) ?? '';
  ok(`${width}px · the workflow is drawn on the row itself`,
    /Trigger/.test(rowText) && /Delay|Email|Action|AI Agent/.test(rowText), rowText.slice(0, 200));

  ok(`${width}px · no horizontal overflow`,
    (await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  ok(`${width}px · nothing threw`, errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── Finding things by the problem, not the name ── */
{
  const { ctx, p } = await open();
  const box = p.getByLabel('Search workflow templates');

  for (const [typed, expect] of [
    ['missed calls', /Missed Call Text Back Automation/],
    ['abandoned cart', /Abandoned Cart Recovery Automation/],
    ['no show', /No-Show Recovery Automation/],
  ]) {
    await box.fill(typed);
    await p.waitForTimeout(350);
    const t = (await p.textContent('body')) ?? '';
    ok(`searching "${typed}" finds it`, expect.test(t), t.slice(t.indexOf('templates'), t.indexOf('templates') + 160));
  }

  /* A search with no answer says so and offers the thing that does work,
     rather than showing an empty page. */
  await box.fill('zzzznothing');
  await p.waitForTimeout(350);
  const t = (await p.textContent('body')) ?? '';
  ok('a search with no matches says so and offers the assistant',
    /Nothing here matches/.test(t) && /describe it to the assistant/i.test(t), t.slice(0, 200));
  await ctx.close();
}

/* ── The preview, and using it for real ── */
{
  const { ctx, p, errs } = await open();

  await p.getByRole('button', { name: /^Preview$/ }).first().click();
  await p.waitForTimeout(600);
  const dialog = p.getByRole('dialog');
  const d = (await dialog.textContent()) ?? '';

  ok('the preview draws the whole workflow', /THE WHOLE WORKFLOW/.test(d));
  /* The three things somebody needs before committing, and the codebase rule
     that each is stated before rather than discovered after. */
  ok('and says what has to be connected first', /What it needs before it can run/.test(d));
  ok('and what actually comes out of it', /What comes out of it/.test(d));
  ok('and what it is honest to expect', /reasonable to expect/.test(d));

  const before = await api('/api/autopilot.php', { action: 'template_uses' });
  const wfBefore = await api('/api/autopilot.php', { action: 'workflows', projectId: project.id });

  await dialog.getByRole('button', { name: /Use this template/ }).click();
  await p.waitForTimeout(1800);

  /* Asked of the server, not the screen. */
  const wfAfter = await api('/api/autopilot.php', { action: 'workflows', projectId: project.id });
  ok('using a template writes a real workflow to the server',
    (wfAfter.workflows ?? []).length === (wfBefore.workflows ?? []).length + 1,
    `${(wfBefore.workflows ?? []).length} → ${(wfAfter.workflows ?? []).length}`);

  const added = (wfAfter.workflows ?? []).find(w => !(wfBefore.workflows ?? []).some(x => x.id === w.id));
  /* Nothing arrives switched on. Every template in here sends something. */
  ok('and it arrives as a draft', added?.status === 'draft', String(added?.status));
  ok('with its steps intact', (added?.nodes ?? []).length > 1, String((added?.nodes ?? []).length));

  /*
   * The number is a count.
   *
   * This is the assertion the whole "real figures" argument rests on: it was
   * absent or lower before, and it is exactly one higher after. A figure that
   * behaves like that cannot have been typed into the source.
   */
  const after = await api('/api/autopilot.php', { action: 'template_uses' });
  const key = Object.keys(after.uses ?? {}).find(k => (after.uses[k] ?? 0) > (before.uses?.[k] ?? 0));
  ok('and the usage count goes up by exactly one', !!key
    && (after.uses[key] ?? 0) === (before.uses?.[key] ?? 0) + 1,
    JSON.stringify({ before: before.uses, after: after.uses }));

  ok('nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── Motion ── */
{
  const { ctx, p } = await open(1440, true);
  const moving = await p.evaluate(() => Array.from(document.querySelectorAll('*'))
    .filter(el => { const a = getComputedStyle(el).animationName; return a && a !== 'none'; }).length);
  ok('asked for reduced motion, the gallery is completely still', moving === 0, `${moving} animated elements`);
  await ctx.close();
}

await b.close();
for (const line of out) console.log(line);
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
