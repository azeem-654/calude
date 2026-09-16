/**
 * The feature list, and specifically the half that says no.
 *
 * Needs a built bundle and `npx wrangler dev --local`:
 *   node test/shopFeatures.e2e.mjs <session-token> <account-id>
 *
 * Every "not here" row is asserted. A list that only says yes is a list
 * nobody believes, and those rows are what make the rest worth reading.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
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
  await p.goto('http://localhost:8787/sell', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1000);

  ok(`${width}px · the feature list is offered`, /What this shop can do/.test((await p.textContent('body')) ?? ''));
  await p.getByRole('button', { name: /What this shop can do/ }).click();
  await p.waitForTimeout(400);
  const t = await p.textContent('body');

  ok(`${width}px · it lists the options feature`, /Options — sizes, colours, finishes/.test(t ?? ''));
  ok(`${width}px · and discount codes`, /Taken off the items, never the delivery/.test(t ?? ''));
  ok(`${width}px · and that sales land in the seller's own balance`, /not the platform/.test(t ?? ''));
  /* The half that makes the rest believable. */
  ok(`${width}px · it says live carrier rates are not here`, /Live carrier rates/.test(t ?? '') && /Not here|charges a real buyer/.test(t ?? ''));
  ok(`${width}px · it says tax is not calculated`, /Tax and VAT/.test(t ?? ''));
  ok(`${width}px · it says there are no customer accounts`, /Customer accounts/.test(t ?? ''));
  ok(`${width}px · it says there are no subscriptions`, /Subscriptions and repeat billing/.test(t ?? ''));
  ok(`${width}px · and it promises the list tracks what shipped`, /added to when something ships, not when it is planned/.test(t ?? ''));

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`${width}px · no horizontal overflow`, over <= 0, `${over}px`);
  ok(`${width}px · nothing threw`, errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  if (width === 1280) await p.screenshot({ path: '/tmp/claude-0/shop-features.png' });
  await ctx.close();
}
await b.close();
console.log(out.join('\n'));
process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0);
