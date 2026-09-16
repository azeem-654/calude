/**
 * The screens a shopkeeper uses to set codes and delivery rates.
 *
 * Needs a built bundle, `npx wrangler dev --local`, and the seeded shop:
 *   node test/shopAdmin.e2e.mjs <session-token> <account-id>
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
  await p.goto(`${B}/sell`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);

  const t = await p.textContent('body');
  ok(`${width}px · the discounts panel is there`, /Discount codes/.test(t ?? ''));
  ok(`${width}px · and the seeded code is listed`, /SAVE20/.test(t ?? ''), (t ?? '').slice(0, 0) || 'not listed');
  ok(`${width}px · with how many times it has been used`, /used/.test(t ?? ''));
  ok(`${width}px · the delivery panel is there`, /Delivery/.test(t ?? ''));
  ok(`${width}px · and both rates are listed`, /UK standard/.test(t ?? '') && /Rest of world/.test(t ?? ''));
  ok(`${width}px · the catch-all is described as such`, /Everywhere else/.test(t ?? ''));

  /* Create a code the way somebody would. */
  await p.getByRole('button', { name: /New code/ }).click();
  await p.waitForTimeout(300);
  await p.getByPlaceholder('SPRING20').fill('TENOFF');
  await p.getByRole('button', { name: /^Save$/ }).first().click();
  await p.waitForTimeout(1200);
  ok(`${width}px · a new code saves and appears`, /TENOFF/.test((await p.textContent('body')) ?? ''));

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`${width}px · no horizontal overflow`, over <= 0, `${over}px`);
  ok(`${width}px · nothing threw`, errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  if (width === 1280) await p.screenshot({ path: '/tmp/claude-0/admin-shop.png', fullPage: false });
  await ctx.close();
}
await b.close();
console.log(out.join('\n'));
process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0);
