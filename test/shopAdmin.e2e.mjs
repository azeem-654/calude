/**
 * The screens a shopkeeper uses to set codes and delivery rates.
 *
 * Needs a built bundle, `npx wrangler dev --local`, and the seeded shop with a
 * 20% GB VAT rate and the storefront set to tax-inclusive:
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

  /* ── Tax ──
     Scoped to the panel's own section: the page now has three Save buttons and
     two "New …" buttons, and a name that collides picks whichever the DOM
     reaches first. */
  const taxPanel = p.locator('section').filter({ hasText: 'not a tax engine' });
  ok(`${width}px · the tax panel is there`, await taxPanel.first().isVisible());
  ok(`${width}px · the seeded VAT rate is listed at 20%`,
    /VAT/.test(t ?? '') && /20%/.test(t ?? ''), (t ?? '').match(/[\d.]+%/g)?.join(' ') ?? 'no rate');
  ok(`${width}px · and the caveat is on the screen, not in a tooltip`,
    /take advice/.test(t ?? ''));
  ok(`${width}px · the shop's tax-inclusive position is shown as chosen`,
    await taxPanel.getByRole('button', { name: /Already include tax/ }).getAttribute('aria-pressed') === 'true');

  /* A rate with decimals, which is the reason the column is basis points. */
  await taxPanel.getByRole('button', { name: /New rate/ }).click();
  await p.waitForTimeout(300);
  await taxPanel.getByPlaceholder('VAT').fill('Sales tax');
  await taxPanel.getByPlaceholder('GB, IE').fill('US');
  await taxPanel.getByPlaceholder('20').fill('8.875');
  await taxPanel.getByRole('button', { name: /^Save$/ }).click();
  await p.waitForTimeout(1300);
  const taxed = await p.textContent('body');
  ok(`${width}px · a fractional rate saves and comes back`,
    /Sales tax/.test(taxed ?? '') && /8\.88%/.test(taxed ?? ''),
    (taxed ?? '').match(/Sales tax[\s\S]{0,60}/)?.[0] ?? 'not listed');

  /* The inclusive/exclusive setting is the expensive one: get it backwards and
     you either overcharge every buyer by the rate or pay it out of your own
     margin, and both look normal. So it is driven, reloaded, and put back —
     a setting that appears to save and is gone on the next visit is the same
     bug wearing a different face. */
  await taxPanel.getByRole('button', { name: /Have tax added/ }).click();
  await p.waitForTimeout(1100);
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const after = p.locator('section').filter({ hasText: 'not a tax engine' });
  ok(`${width}px · switching to tax-added survives a reload`,
    await after.getByRole('button', { name: /Have tax added/ }).getAttribute('aria-pressed') === 'true');
  await after.getByRole('button', { name: /Already include tax/ }).click();
  await p.waitForTimeout(1100);
  ok(`${width}px · and switching back takes`,
    await after.getByRole('button', { name: /Already include tax/ }).getAttribute('aria-pressed') === 'true');

  /* Delete what this run created, so a second run is not testing against the
     leftovers of the first. The confirm has to be accepted explicitly:
     Playwright dismisses dialogs by default, so without this the button is
     pressed, nothing happens, and the assertion below is measuring the
     harness rather than the app. */
  p.once('dialog', dlg => void dlg.accept());
  await after.getByRole('button', { name: 'Delete Sales tax' }).first().click();
  await p.waitForTimeout(1200);
  ok(`${width}px · and a rate can be deleted`,
    !/Sales tax/.test((await p.textContent('body')) ?? ''));

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
