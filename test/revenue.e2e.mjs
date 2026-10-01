/**
 * Revenue by project: which project earned each order, and the report on it.
 *
 *   npx wrangler d1 migrations apply crmpro --local --persist-to <empty dir>
 *   npx wrangler dev --local --port 8811 --persist-to <that dir> --var APP_ORIGIN:http://localhost:8811
 *   BASE=http://localhost:8811 PERSIST=<that dir> node test/revenue.e2e.mjs
 *
 * Needs a fresh database and a bundle built with VITE_BASE=/. Everything that
 * makes money move goes through the real routes — projects, shops, products,
 * the anonymous shop checkout and the signed storefront webhook — so what is
 * proved is the attribution rule as the product actually applies it, and the
 * report's arithmetic to the cent. The processor is never reached for a real
 * link (a test key cannot make one); the order exists regardless, pending,
 * exactly as it would for a buyer whose checkout failed.
 */
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const B = process.env.BASE ?? 'http://localhost:8811';
const persist = process.env.PERSIST ? ` --persist-to ${process.env.PERSIST}` : '';
let fail = 0;
const ok = (name, cond, detail = '') => { if (!cond) fail++; console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ` — ${detail}`}`); };
const post = async (url, init) => { try { return await fetch(url, init); } catch { await new Promise(r => setTimeout(r, 500)); return fetch(url, init); } };
let ipN = 1;
const api = (path, body) => post(`${B}/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.8.3.${ipN++ % 250}` }, body: JSON.stringify(body) }).then(r => r.json().catch(() => ({ status: r.status })));
const sql = (q) => JSON.parse(execSync(`npx wrangler d1 execute crmpro --local${persist} --json --command ${JSON.stringify(q.replace(/\s+/g, " "))}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
const esc = (s) => String(s).replace(/'/g, "''");

async function signed(accountId, secret, event) {
  const payload = JSON.stringify(event); const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return (await post(`${B}/api/storefront-webhook.php?ws=${encodeURIComponent(accountId)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${sig}` }, body: payload,
  })).status;
}
let evt = 1;
const paidEvent = (orderId) => ({ id: `evt_${evt++}`, type: 'checkout.session.completed', data: { object: { id: `cs_${orderId}`, client_reference_id: orderId, metadata: { orderId } } } });
const refundEvent = (orderId) => ({ id: `evt_${evt++}`, type: 'charge.refunded', data: { object: { id: `ch_${orderId}`, metadata: { orderId } } } });

console.log('\nRevenue by project');
const boot = await api('auth.php', { action: 'bootstrap', email: 'owner@revenue.test', password: 'Tq9!vX2#pLm7wZ-rv', name: 'Owner' });
if (!boot.success) { console.log('bootstrap failed — needs a fresh database', boot); process.exit(2); }
const signup = async (email, name) => { const r = await api('auth.php', { action: 'register', email, password: 'Another-horse-7x', name }); return r.token ? r : api('auth.php', { action: 'login', email, password: 'Another-horse-7x' }); };
const ann = await signup('ann@shop.test', 'Ann Shop');
const bob = await signup('bob@shop.test', 'Bob Shop');
const A = ann.user?.accountId; const BB = bob.user?.accountId;
ok('two workspaces', !!A && !!BB && A !== BB, JSON.stringify({ A, BB }));
const asAnn = (path, body) => api(path, { token: ann.token, accountId: A, ...body });
const asBob = (path, body) => api(path, { token: bob.token, accountId: BB, ...body });

/* ── Projects, through the real route ── */
const pfA = await asAnn('projects.php', { action: 'save_portfolio', name: 'Ann Tees Ltd', profile: { companyName: 'Ann Tees Ltd' } });
const pfB = await asBob('projects.php', { action: 'save_portfolio', name: 'Bob Goods', profile: { companyName: 'Bob Goods' } });
const proj = async (as, pf, name) => (await as('projects.php', { action: 'save_project', name, objective: `Sell more through ${name}`, portfolioId: pf.id, kind: 'ecommerce' })).id;
const P1 = await proj(asAnn, pfA, 'Tees drop');
const P2 = await proj(asAnn, pfA, 'Mugs launch');
const P3 = await proj(asAnn, pfA, 'Hoodies');
const PB = await proj(asBob, pfB, 'Bob launch');
ok('projects made through projects.php', [P1, P2, P3, PB].every(Boolean), JSON.stringify([P1, P2, P3, PB]));

/* ── Getting paid: each workspace its own key and webhook secret ── */
let r = await asAnn('storefront.php', { action: 'save', provider: 'stripe', apiKey: 'sk_test_' + 'a'.repeat(24), webhookSecret: 'whsec_ann', currency: 'USD' });
ok('Ann connects her storefront', r.success, JSON.stringify(r).slice(0, 200));
r = await asBob('storefront.php', { action: 'save', provider: 'stripe', apiKey: 'sk_test_' + 'b'.repeat(24), webhookSecret: 'whsec_bob', currency: 'USD' });
ok('Bob connects his', r.success, JSON.stringify(r).slice(0, 200));
/* "Test connection" calls Stripe, which a test key cannot pass; the stamp is
   what that test would have written. */
sql(`UPDATE crm_storefront SET verified_at = '2026-10-01T00:00:00Z' WHERE account_id IN ('${esc(A)}', '${esc(BB)}')`);

/* ── Products ── */
const product = async (as, name, cents, projectId) => {
  const res = await as('commerce.php', { action: 'save_product', name, priceCents: cents, status: 'active', projectId });
  return res.id;
};
const tee = await product(asAnn, 'Tee', 2500, P1);
const mug = await product(asAnn, 'Mug', 1200, P2);
const hoodie = await product(asAnn, 'Hoodie', 4000, P3);
const sticker = await product(asAnn, 'Sticker', 300, '');
const bobThing = await product(asBob, 'Bob thing', 999, PB);
ok('products made through commerce.php, each with its project',
  sql(`SELECT count(*) AS n FROM crm_products WHERE account_id = '${esc(A)}' AND status = 'active'`)[0].n === 4
  && sql(`SELECT project_id AS p FROM crm_products WHERE id = '${esc(hoodie)}'`)[0]?.p === P3,
  JSON.stringify(sql(`SELECT name, status, project_id FROM crm_products`)));

/* ── Shops ── */
const shop = async (as, slug, projectId) => as('shop.php', { action: 'save', name: slug, slug, projectId, status: 'published' });
r = await shop(asAnn, 'tees-a', P1); ok('a shop belonging to Tees drop', r.success, JSON.stringify(r).slice(0, 200));
r = await shop(asAnn, 'general-a', ''); ok('a shop belonging to no project', r.success, JSON.stringify(r).slice(0, 200));
r = await shop(asBob, 'bob-shop', PB); ok('Bob\'s shop', r.success, JSON.stringify(r).slice(0, 200));

/* ── Orders, as an anonymous buyer ── */
const buy = async (slug, items, email, projectId) => {
  await api('shop.php', { action: 'buy', slug, items, email, projectId });
  return sql(`SELECT id, project_id AS pj, project_via AS via, total_cents AS total, paid_at AS paid FROM crm_orders WHERE email = '${esc(email)}'`)[0];
};
const pay = async (o) => signed(A, 'whsec_ann', paidEvent(o.id));

const o1 = await buy('tees-a', [{ productId: tee, qty: 2 }], 'o1@buyer.test');
ok('a sale in a project\'s shop is stamped to it (via shop)', o1?.pj === P1 && o1.via === 'shop' && o1.total === 5000, JSON.stringify(o1));
const o2 = await buy('general-a', [{ productId: mug, qty: 1 }], 'o2@buyer.test', P2);
ok('?pj on the shop link credits that project (via link)', o2?.pj === P2 && o2.via === 'link', JSON.stringify(o2));
const o3 = await buy('general-a', [{ productId: hoodie, qty: 1 }], 'o3@buyer.test', PB);
ok('another workspace\'s project id is ignored — falls to the product rule', o3?.pj === P3 && o3.via === 'products', JSON.stringify(o3));
const o3b = await buy('general-a', [{ productId: sticker, qty: 1 }], 'o3b@buyer.test', 'pj-does-not-exist');
ok('an unknown project id is ignored silently, and the order is still taken', !!o3b && o3b.pj === '' && o3b.via === '', JSON.stringify(o3b));
sql(`DELETE FROM crm_orders WHERE id = '${esc(o3b.id)}'`);
const o4 = await buy('general-a', [{ productId: hoodie, qty: 1 }, { productId: mug, qty: 1 }], 'o4@buyer.test');
ok('a basket spanning two projects is Unattributed', o4?.pj === '' && o4.total === 5200, JSON.stringify(o4));
const o5 = await buy('tees-a', [{ productId: tee, qty: 1 }], 'o5@buyer.test');
const o6 = await buy('tees-a', [{ productId: tee, qty: 1 }], 'o6@buyer.test', P2);
ok('the link outranks the shop', o6?.pj === P2 && o6.via === 'link', JSON.stringify(o6));
const o7 = await buy('tees-a', [{ productId: tee, qty: 1 }], 'o7@buyer.test');
const o9 = await buy('tees-a', [{ productId: tee, qty: 1 }], 'o9@buyer.test');
const bobOrder = await (async () => {
  await api('shop.php', { action: 'buy', slug: 'bob-shop', items: [{ productId: bobThing, qty: 1 }], email: 'bob-buyer@buyer.test' });
  return sql("SELECT id FROM crm_orders WHERE email = 'bob-buyer@buyer.test'")[0];
})();
ok('a buyer cannot buy Ann\'s product in Bob\'s shop', sql(`SELECT count(*) AS n FROM crm_orders WHERE shop_id IN (SELECT id FROM crm_shops WHERE slug='bob-shop') AND items LIKE '%${esc(tee)}%'`)[0].n === 0);

/* ── An Autopilot chase on o9, before it was paid ── */
const chasedAt = new Date(Date.now() - 3_600_000).toISOString();
sql(`UPDATE crm_orders SET chased_at = '${chasedAt}' WHERE id = '${esc(o9.id)}'`);
sql(`INSERT INTO crm_autopilot_actions (id, account_id, project_id, kind, status, summary, because, counts, detail, effect, created_at, acted_at)
     VALUES ('act-chase-1', '${esc(A)}', '${esc(P1)}', 'send', 'done', 'Chased 1 unpaid order', '', '{}', '1 sent.',
             '{"type":"chase_payment","orderIds":["${esc(o9.id)}"]}', '${chasedAt}', '${chasedAt}')`);

/* ── The money arrives, signed ── */
ok('a forged payment is refused', (await signed(A, 'whsec_wrong', paidEvent(o1.id))) === 400);
ok('…and leaves no paid_at', sql(`SELECT paid_at AS p FROM crm_orders WHERE id = '${esc(o1.id)}'`)[0].p === null);
for (const o of [o1, o2, o3, o4, o5, o6, o9]) await pay(o);
const paid1 = sql(`SELECT status, paid_at AS p FROM crm_orders WHERE id = '${esc(o1.id)}'`)[0];
ok('the signed webhook marks the order paid and stamps paid_at', paid1.status === 'paid' && !!paid1.p, JSON.stringify(paid1));
ok('a pending order has no paid_at', sql(`SELECT paid_at AS p FROM crm_orders WHERE id = '${esc(o7.id)}'`)[0].p === null);
await new Promise(res => setTimeout(res, 1100));
await pay(o1);
ok('a redelivery does not move paid_at', sql(`SELECT paid_at AS p FROM crm_orders WHERE id = '${esc(o1.id)}'`)[0].p === paid1.p);
r = await asAnn('commerce.php', { action: 'set_order_status', id: o1.id, status: 'fulfilled' });
ok('fulfilling it later does not move paid_at either', r.success && sql(`SELECT paid_at AS p FROM crm_orders WHERE id = '${esc(o1.id)}'`)[0].p === paid1.p);
ok('Ann\'s webhook cannot pay Bob\'s order', (await signed(A, 'whsec_ann', paidEvent(bobOrder.id))) === 200
  && sql(`SELECT status FROM crm_orders WHERE id = '${esc(bobOrder.id)}'`)[0].status === 'pending');
ok('a refund arrives signed', (await signed(A, 'whsec_ann', refundEvent(o5.id))) === 200
  && sql(`SELECT status FROM crm_orders WHERE id = '${esc(o5.id)}'`)[0].status === 'refunded');

/* A manual order, paid, of one project's product — credited by the product
   rule when the report is read. */
r = await asAnn('commerce.php', { action: 'record_order', email: 'phone@buyer.test', status: 'paid', items: [{ productId: hoodie, name: 'Hoodie', qty: 1, priceCents: 4000 }] });
const o8 = sql("SELECT paid_at AS p, project_id AS pj FROM crm_orders WHERE email = 'phone@buyer.test'")[0];
ok('an order recorded as paid gets paid_at', r.success && !!o8?.p, JSON.stringify(o8));

/* Won deals in Mugs launch's own pipeline: one this month, one 100 days ago, one lost. */
const now = new Date().toISOString();
const old = new Date(Date.now() - 100 * 86_400_000).toISOString();
const pipelines = [{ id: 'pl-1', name: 'Mugs launch', projectId: P2, stages: [{ id: 's1', name: 'Selling', color: '#000', playbook: [], deals: [
  { id: 'd1', title: 'Cafe order', value: 500, status: 'won', closedAt: now },
  { id: 'd2', title: 'Old cafe', value: 700, status: 'won', closedAt: old },
  { id: 'd3', title: 'Lost one', value: 900, status: 'lost', closedAt: now },
] }] }, { id: 'pl-x', name: 'Not a project', stages: [{ id: 's', name: 'x', deals: [{ id: 'd9', value: 99999, status: 'won', closedAt: now }] }] }];
sql(`INSERT INTO crm_data (account_id, k, v, updated_at) VALUES ('${esc(A)}', 'crm_pipelines', '${esc(JSON.stringify(pipelines))}', '${now}')
     ON CONFLICT(account_id, k) DO UPDATE SET v = excluded.v`);

/* ── The shop page carries ?pj for the visit ── */
const b = await pw.chromium.launch();
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${B}/shop/general-a?pj=${encodeURIComponent(P2)}`, { waitUntil: 'networkidle' });
  /* Arriving on the link, then browsing on: the address loses ?pj, the visit keeps it. */
  await p.goto(`${B}/shop/general-a`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: /Add to basket/ }).first().click();
  await p.getByRole('button', { name: /Basket|1 ·/ }).first().click();
  const dlg = p.getByRole('dialog', { name: 'Basket' });
  await dlg.getByLabel('Your email address').fill('o11@buyer.test');
  await dlg.getByRole('button', { name: /Checkout/ }).click();
  await p.waitForTimeout(2500);
  await ctx.close();
}
const o11 = sql("SELECT id, project_id AS pj, project_via AS via, total_cents AS total FROM crm_orders WHERE email = 'o11@buyer.test'")[0];
ok('the shop page remembers ?pj for the visit and sends it', o11?.pj === P2 && o11.via === 'link' && o11.total === 300, JSON.stringify(o11));
if (o11) await pay(o11);

/* ── The report ── */
const sum = (body) => asAnn('revenue.php', { action: 'summary', ...body });
const rep = await sum({ days: 30 });
const row = (id) => rep.projects?.find(p => p.id === id) ?? {};
ok('the report answers', rep.success && rep.currency === 'USD', JSON.stringify(rep).slice(0, 300));
ok('Tees drop: $75 from 2 paid orders (refund excluded)', row(P1).revenueCents === 7500 && row(P1).paidOrders === 2, JSON.stringify(row(P1)));
ok('…$25 refunded, shown beside it', row(P1).refundedCents === 2500 && row(P1).refundedOrders === 1);
ok('…and $25 recovered by its Autopilot', row(P1).recoveredCents === 2500 && row(P1).recoveredOrders === 1, JSON.stringify(row(P1)));
ok('Mugs launch: $40 from 3 orders (link, link, page-carried link)', row(P2).revenueCents === 4000 && row(P2).paidOrders === 3, JSON.stringify(row(P2)));
ok('…1 won deal worth 500 in this window, the lost one and other pipelines ignored', row(P2).wonDeals === 1 && row(P2).wonDealValue === 500, JSON.stringify(row(P2)));
ok('Hoodies: $80 from 2 orders (product rule, incl. the manual one)', row(P3).revenueCents === 8000 && row(P3).paidOrders === 2, JSON.stringify(row(P3)));
ok('Unattributed: $52, the mixed basket', rep.unattributed?.revenueCents === 5200 && rep.unattributed.paidOrders === 1, JSON.stringify(rep.unattributed));
ok('totals are the sum: $247 from 8 orders, average $30.88', rep.totals?.revenueCents === 24700 && rep.totals.paidOrders === 8 && rep.totals.averageCents === 3088, JSON.stringify(rep.totals));
ok('…refunds and recoveries total too', rep.totals?.refundedCents === 2500 && rep.totals.recoveredCents === 2500);
ok('attribution by evidence adds up', rep.attribution && rep.attribution.shop === 7500 && rep.attribution.link === 4000 && rep.attribution.products === 8000 && rep.attribution.none === 5200, JSON.stringify(rep.attribution));
ok('30 days are 30 daily buckets', rep.bucket === 'day' && rep.buckets?.length === 30 && row(P1).series?.length === 30);
ok('the series sums to the revenue', row(P1).series?.reduce((a, c) => a + c, 0) === 7500 && rep.totals.series.reduce((a, c) => a + c, 0) === 24700);
ok('Bob\'s money is not in Ann\'s report', !JSON.stringify(rep).includes(PB) && !JSON.stringify(rep).includes('Bob'));

const year = await sum({ days: 365 });
ok('12 months are weekly buckets and include the older won deal', year.bucket === 'week' && year.buckets.length === 53
  && year.projects.find(p => p.id === P2)?.wonDeals === 2 && year.projects.find(p => p.id === P2)?.wonDealValue === 1200,
  JSON.stringify({ b: year.bucket, n: year.buckets?.length, p2: year.projects?.find(p => p.id === P2) }));

/* A second currency is reported apart, never added. */
r = await asAnn('storefront.php', { action: 'save', currency: 'EUR' });
const o10 = await buy('general-a', [{ productId: hoodie, qty: 1 }], 'o10@buyer.test');
await pay(o10);
const two = await sum({ days: 30 });
ok('a euro sale does not join the dollars', two.currency === 'USD' && two.totals.revenueCents === 24700
  && two.currencies.length === 2 && two.currencies[1].code === 'EUR' && two.currencies[1].revenueCents === 4000, JSON.stringify(two.currencies));
const eur = await sum({ days: 30, currency: 'EUR' });
ok('…and the euro view has only the euros', eur.currency === 'EUR' && eur.totals.revenueCents === 4000 && eur.projects.find(p => p.id === P3)?.revenueCents === 4000);

const one = await sum({ days: 30, projectId: P1 });
ok('scoped to one project', one.success && one.projects.length === 1 && one.totals.revenueCents === 7500 && one.unattributed === null
  && one.projects[0].shops.some(s => s.slug === 'tees-a'), JSON.stringify(one).slice(0, 300));
ok('a bad period is refused', !(await sum({ days: 7 })).success);

/* ── Other tenants ── */
r = await api('revenue.php', { action: 'summary', token: bob.token, accountId: A, days: 30 });
ok('Bob cannot read Ann\'s report', !r.success && !JSON.stringify(r).includes('Tees drop'), JSON.stringify(r).slice(0, 200));
r = await asBob('revenue.php', { action: 'summary', days: 30, projectId: P1 });
ok('Bob cannot scope his report to Ann\'s project', !r.success, JSON.stringify(r).slice(0, 200));
r = await api('revenue.php', { action: 'summary', accountId: A, days: 30 });
ok('no session, no report', !r.success);
r = await asBob('revenue.php', { action: 'summary', days: 30 });
ok('Bob\'s own report is empty, not Ann\'s', r.success && r.totals.revenueCents === 0 && r.projects.length === 1 && r.projects[0].id === PB);

/* ── The screens ── */
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto(`${B}/login`, { waitUntil: 'networkidle' });
await p.getByLabel('Email or username').fill('ann@shop.test');
await p.getByLabel('Password', { exact: true }).fill('Another-horse-7x');
await p.getByRole('button', { name: 'Sign in', exact: true }).click();
await p.waitForTimeout(2500);
await p.goto(`${B}/analytics?section=revenue`, { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
const body = await p.textContent('body');
ok('the revenue section opens from the link', /Revenue by project/.test(body ?? ''));
ok('…shows the period\'s revenue', (body ?? '').includes('$247'), (body ?? '').match(/\$[\d,.]+/g)?.slice(0, 6).join(' '));
ok('…draws the stacked bars', await p.locator('.recharts-bar-rectangle path').count() > 0);
ok('…and the per-project table', await p.locator('tr[data-project]').count() === 4);
ok('…with an "other currencies" note', /not converted/.test(body ?? ''));
const over = async () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok('no sideways scroll at 1280px', (await over()) <= 0, String(await over()));
await p.screenshot({ path: `${process.env.SHOTS ?? '/tmp'}/revenue-1280.png`, fullPage: true });
await p.setViewportSize({ width: 390, height: 844 });
await p.waitForTimeout(500);
ok('no sideways scroll at 390px', (await over()) <= 0, String(await over()));
ok('the chart still renders at 390px', await p.locator('.recharts-bar-rectangle path').count() > 0);
await p.screenshot({ path: `${process.env.SHOTS ?? '/tmp'}/revenue-390.png`, fullPage: true });

/* The project's own strip and link. */
await p.setViewportSize({ width: 1280, height: 900 });
await p.goto(`${B}/autopilot`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);
/* The board opens on the first project; its Overview tab holds the strip. */
await p.getByRole('tab', { name: 'Overview' }).first().click();
await p.waitForTimeout(1500);
const strip = p.locator('[data-testid="project-revenue"]').first();
ok('a project\'s Overview shows its revenue strip', await strip.count() > 0);
if (await strip.count()) {
  const t = await strip.textContent();
  ok('…its own figure, not the workspace\'s', /\$75/.test(t ?? '') && /2 paid orders/.test(t ?? ''), t?.slice(0, 160));
  ok('…with a shop link that carries ?pj=', (await strip.locator('input').first().inputValue().catch(() => '')) === `${B}/shop/tees-a?pj=${encodeURIComponent(P1)}`, t?.slice(0, 160));
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(400);
  ok('the Overview has no sideways scroll at 390px', (await over()) <= 0, String(await over()));
  await strip.screenshot({ path: `${process.env.SHOTS ?? '/tmp'}/revenue-strip-390.png` });
}
ok('no page errors', !errs.length, errs.join(' | '));
await b.close();

console.log(fail ? `\n${fail} failed` : '\nall passed');
process.exit(fail ? 1 : 0);
