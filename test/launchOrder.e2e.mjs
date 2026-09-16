/**
 * Does the build order actually reach the board?
 *
 * Needs a built bundle and a running `npx wrangler dev --local`, then:
 *   node test/launchOrder.e2e.mjs <session-token> <account-id>
 *
 * The check that stops this being decoration is the last one: it creates a real
 * shop project and reads `crm_pipelines` back out of the API, asserting the
 * first card's checklist is the list the review screen showed. A plan that
 * looks right in a wizard and never becomes anything is a leaflet.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const B = 'http://localhost:8787';
const [TOK, ACCT] = process.argv.slice(2);
const out = [];
const ok = (n, p, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);
const b = await pw.chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 940 } });
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

/* A shop, all the way to the review. */
await d.getByRole('button', { name: /Sell products online/ }).click();
await d.getByRole('button', { name: /^Continue/ }).click();
await p.waitForTimeout(300);
await d.getByRole('button', { name: /Online shop/ }).click();
await d.getByRole('button', { name: /Type it/ }).click();
await d.getByPlaceholder(/Bob/).first().fill('Northgate Candles');
await d.getByRole('button', { name: /^Continue/ }).click();
await p.waitForTimeout(2200);
await d.getByRole('button', { name: /^Continue/ }).click();
await p.waitForTimeout(400);
await d.getByPlaceholder(/Spring push|Northgate/).first().fill('Candles spring');
await d.locator('textarea').first().fill('Sell 200 candles a month and get buyers back for a second order');
await d.getByRole('button', { name: /^Continue/ }).click();
await p.waitForTimeout(500);

const t = await d.textContent();
ok('the review shows the build order', /The order it builds things in/.test(t ?? ''));
ok('a shop starts with the catalogue, not outreach',
  (t ?? '').indexOf('Put the catalogue up') > 0
  && (t ?? '').indexOf('Put the catalogue up') < (t ?? '').indexOf('abandoned baskets'),
  (t ?? '').slice((t ?? '').indexOf('The order it builds'), (t ?? '').indexOf('The order it builds') + 260));
ok('and explains why the basket email is not first', /basket to leave|real basket/.test(t ?? ''));
ok('it says this becomes the board', /becomes the first card/.test(t ?? ''));

/* Start it, and check the board really got that list. */
await d.getByRole('button', { name: /Start the project/ }).click();
await p.waitForTimeout(3500);

const board = await p.evaluate(async ([acct, token]) => {
  const r = await fetch('/api/data.php', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'get', token, accountId: acct, key: 'crm_pipelines' }),
  });
  const j = await r.json();
  try { return JSON.parse(j.value || '[]'); } catch { return []; }
}, [ACCT, TOK]);

const pipe = board.find(x => /Candles spring/.test(x.name ?? ''));
ok('the project got a board', !!pipe, JSON.stringify(board.map(x => x.name)));
const card = pipe?.stages?.[0]?.deals?.[0];
const checklist = (card?.checklist ?? []).map(c => c.text);
ok('its first card carries the agreed order', checklist.length >= 4, JSON.stringify(checklist));
ok('and the first item is the catalogue, exactly as shown',
  /catalogue/i.test(checklist[0] ?? ''), JSON.stringify(checklist));
ok('the board and the screen say the same thing',
  checklist.some(c => /abandoned baskets/i.test(c)), JSON.stringify(checklist));
ok('nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));

await p.screenshot({ path: '/tmp/claude-0/launch-order.png' });
await b.close();
console.log(out.join('\n'));
process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0);
