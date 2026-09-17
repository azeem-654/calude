/**
 * The domains are bought where they are decided, not at the end.
 *
 * Needs a built bundle and `npx wrangler dev --local`, then:
 *   node test/wizardBuy.e2e.mjs <session-token> <account-id>
 *
 * Somebody who has just settled on three domains and nine mailboxes is at the
 * exact moment they care about buying them. The old flow took the decision,
 * walked them through two more screens, created the project and produced the
 * shop on the way out — which turns a decision into an errand.
 *
 * So the check that matters is the transition: the press that leaves the
 * sending setup lands on the domain search, with a project real enough behind
 * it that the buy button is live rather than held.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const B = 'http://localhost:8787';
const [TOK, ACCT] = process.argv.slice(2);
const out = [];
const ok = (n, p, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);
const b = await pw.chromium.launch();

for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 950 } });
  await ctx.addInitScript(([token, acct]) => {
    localStorage.setItem('crm_session', JSON.stringify({ token, backend: 'php', user: { email: 'other@test.dev', name: 'S', role: 'agency', accountId: acct } }));
    localStorage.setItem('crm_active_account', acct);
    localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: acct, name: 'S', plan: 'starter', status: 'active', price: 0 }]));
  }, [TOK, ACCT]);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));

  await p.goto(`${B}/autopilot`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /New project|Start your first project/i }).first().click();
  const d = p.getByRole('dialog', { name: 'New project' });
  await d.waitFor({ timeout: 8000 });

  /* 1 — the problem, in the words somebody would actually use. */
  const first = await d.textContent();
  ok(`${width}px · the first screen leads with the problem, not the feature`,
    /phone has gone quiet/.test(first ?? '') && !/Win new customers/.test(first ?? ''),
    (first ?? '').slice(0, 120));
  ok(`${width}px · and carries the words somebody would search for`,
    /lead generation on autopilot/.test(first ?? '') || /get more leads/.test(first ?? ''));
  await d.getByRole('button', { name: /phone has gone quiet/ }).click();
  await d.getByRole('button', { name: /^Continue/ }).click();
  await p.waitForTimeout(400);

  /* 2 — the business. */
  await d.getByRole('button', { name: /Trades and local services/ }).click();
  const someoneNew = d.getByRole('button', { name: 'Someone new' });
  if (await someoneNew.count()) await someoneNew.click();
  await d.getByRole('button', { name: /Type it/ }).click();
  await d.getByPlaceholder(/Bob/).first().fill('Buy Flow Plumbing');
  await d.getByRole('button', { name: /^Continue/ }).click();
  await p.waitForTimeout(2300);

  /* 3 — the goal, which now comes *before* the sizing so the project can be
     saved the moment the sizing is agreed. */
  const goalScreen = await d.textContent();
  ok(`${width}px · the goal is asked before the sending setup`,
    /What would make this worth it/.test(goalScreen ?? ''), (goalScreen ?? '').slice(0, 120));
  await d.getByPlaceholder(/Spring push|—/).first().fill(`Buy flow ${width}`);
  await d.getByPlaceholder(/Pick one above to edit/).fill('Book six boiler services a month.');
  await d.getByRole('button', { name: /^Continue/ }).click();
  await p.waitForTimeout(900);

  /* 4 — the sizing, with the build order on the same screen as the button that
     agrees to it rather than one step further on. */
  const sizing = await d.textContent();
  ok(`${width}px · the sizing step is reached`, /Your sending setup/.test(sizing ?? ''));
  ok(`${width}px · and the build order is on it, beside the button`,
    /The order it builds things in/.test(sizing ?? ''), 'the review is still a separate step');

  /* Ask for a pool, and name the mailboxes. */
  await d.getByRole('button', { name: /^Buy the \d+ domain/ }).first().click();
  await p.waitForTimeout(400);
  const chose = await d.textContent();
  ok(`${width}px · choosing to buy says what the button will now do`,
    /Create it and choose the domains/.test(chose ?? ''),
    (chose ?? '').match(/Create it[^.]{0,40}/)?.[0] ?? 'the button still says Continue');

  await d.getByRole('button', { name: /Create it and choose the domains/ }).click();
  /* Creating the project is a real round trip, and the domain screen searches
     on arrival. */
  await p.waitForTimeout(4500);

  const buying = await d.textContent();
  ok(`${width}px · the very next screen is the domain purchase`,
    /Your domains and mailboxes/.test(buying ?? ''), (buying ?? '').slice(0, 160));
  /* The old flow held the buy button until a project existed. It exists now,
     so the hold must be gone — that message appearing here would mean the
     purchase had been moved in front of the thing it depends on. */
  ok(`${width}px · and it is not waiting on a project that does not exist yet`,
    !/Finish creating the project first/.test(buying ?? ''),
    'the checkout is still held');

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`${width}px · no horizontal overflow`, over <= 0, `${over}px`);
  ok(`${width}px · nothing threw`, errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

await b.close();
console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
if (failed) process.exit(1);
