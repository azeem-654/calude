/**
 * The sized setup, driven in a real browser.
 *
 * Needs a built bundle and a running `npx wrangler dev --local`, then:
 *   node test/wizardPlan.e2e.mjs <session-token> <account-id>
 *
 * The case worth having is the shop: it must be told one address on its own
 * domain and *not* sold a pool. That is the one a generic slider gets wrong
 * while looking perfectly reasonable, and it is the difference between a
 * recommendation and an upsell.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const B = 'http://localhost:8787';
const [TOK, ACCT] = process.argv.slice(2);
const out = [];
const ok = (n, p, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);
const b = await pw.chromium.launch();

const open = async (width) => {
  const ctx = await b.newContext({ viewport: { width, height: 940 } });
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
  return { ctx, p, d, errs };
};

/*
 * To the sending setup, which is now step four rather than step three.
 *
 * The goal step moved in front of it so that the project can be saved the
 * moment the sizing is agreed — which is what lets the domains be bought on
 * the very next screen instead of after the whole wizard.
 */
const toSendingSetup = async (d, p, industry) => {
  await d.getByRole('button', { name: /phone has gone quiet/ }).click();
  await d.getByRole('button', { name: /^Continue/ }).click();
  await p.waitForTimeout(300);
  await d.getByRole('button', { name: industry }).click();
  /* A workspace that already has portfolios opens on the picker, not on the
     three ways to describe a new one. The test used to assume an empty
     workspace, which is true exactly once — the second run of it was testing
     a screen the wizard no longer shows. */
  const someoneNew = d.getByRole('button', { name: 'Someone new' });
  if (await someoneNew.count()) await someoneNew.click();
  await d.getByRole('button', { name: /Type it/ }).click();
  await d.getByPlaceholder(/Bob/).first().fill('Bobs Plumbing');
  await d.getByRole('button', { name: /^Continue/ }).click();
  await p.waitForTimeout(2200);

  /* The goal step. Both fields are required before it will go on, which is
     itself worth driving rather than stepping around. */
  await d.getByPlaceholder(/Spring push|—/).first().fill('Test project');
  await d.getByPlaceholder(/Pick one above to edit/).fill('Book six boiler services a month.');
  await d.getByRole('button', { name: /^Continue/ }).click();
  await p.waitForTimeout(900);
};

for (const width of [390, 1280]) {
  const { ctx, p, d, errs } = await open(width);

  /* No AI key anywhere. */
  await d.getByRole('button', { name: /I know exactly what I want/ }).click();
  await p.waitForTimeout(300);
  const caps = await d.textContent();
  ok(`${width}px · the capability list no longer asks for an AI key`, !/AI key/i.test(caps ?? ''), (caps ?? '').slice(0, 0) || 'found one');

  await toSendingSetup(d, p, /Trades and local services/);
  const t = await d.textContent();

  ok(`${width}px · the sending setup is reached`, /Your sending setup/.test(t ?? ''));
  ok(`${width}px · and the step after it is named as the domains`,
    /Domains and mailboxes/.test(t ?? '') || width < 900, 'the rail does not name the purchase step');
  ok(`${width}px · the starter is three domains and nine mailboxes`,
    /9 mailboxes across 3 domains/.test(t ?? ''), (t ?? '').match(/\d+ mailboxes across \d+ domains?/)?.[0] ?? 'not found');
  ok(`${width}px · it shows the arithmetic rather than just the answer`,
    /3 × 3 × 10 a day × 22 weekdays/.test(t ?? ''));
  ok(`${width}px · it warns about the warm-up`, /warm up/.test(t ?? ''));
  ok(`${width}px · it projects a funnel`, /Replies/.test(t ?? '') && /New customers/.test(t ?? ''));
  ok(`${width}px · every projection is a range`, /\d+–\d+/.test(t ?? ''));
  ok(`${width}px · and says it is a range, not a forecast`, /Ranges, not a forecast/.test(t ?? ''));
  ok(`${width}px · it says the writing is included`, /do not need an AI key of your own/.test(t ?? ''));
  ok(`${width}px · the buy option names the actual pool`,
    /Buy the 3 domains and 9 mailboxes/.test(t ?? ''), (t ?? '').match(/Buy the [^.]*/)?.[0] ?? 'not found');

  /* Typing a target resizes the pool. */
  await d.getByPlaceholder(/Leave blank for the starter/).fill('15000');
  await p.waitForTimeout(500);
  const t2 = await d.textContent();
  ok(`${width}px · 15,000 a month resizes to 69 mailboxes on 23 domains`,
    /69 mailboxes across 23 domains/.test(t2 ?? ''), (t2 ?? '').match(/\d+ mailboxes across \d+ domains?/)?.[0] ?? 'not found');

  /* A stepper changes it, and the total follows. */
  await d.getByRole('button', { name: /More Emails per mailbox, per day/ }).click();
  await p.waitForTimeout(300);
  const t3 = await d.textContent();
  ok(`${width}px · nudging the daily rate changes the monthly total`,
    !/15,180 emails a month/.test(t3 ?? '') && /emails a month/.test(t3 ?? ''));

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`${width}px · no horizontal overflow`, over <= 0, `${over}px`);
  ok(`${width}px · nothing threw`, errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  if (width === 1280) await p.screenshot({ path: '/tmp/claude-0/plan-cold.png' });
  await ctx.close();
}

/* A shop is told it does not need a pool. */
{
  const { ctx, p, d, errs } = await open(1280);
  await toSendingSetup(d, p, /Online shop/);
  const t = await d.textContent();
  ok('a shop is told one address on its own domain', /One address, on your own domain/.test(t ?? ''), (t ?? '').slice(0, 140));
  ok('and is not sold a pool of domains', !/mailboxes across/.test(t ?? ''));
  ok('and is told plainly why', /less<\/em>? likely to arrive|less likely to arrive/.test(t ?? '') || /recognise/.test(t ?? ''));
  await d.getByPlaceholder('4000').fill('10000');
  await p.waitForTimeout(400);
  const t2 = await d.textContent();
  ok('it projects orders rather than replies', /Orders/.test(t2 ?? '') && !/Conversations booked/.test(t2 ?? ''));
  ok('shop: nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await p.screenshot({ path: '/tmp/claude-0/plan-shop.png' });
  await ctx.close();
}

await b.close();
console.log(out.join('\n'));
process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0);
