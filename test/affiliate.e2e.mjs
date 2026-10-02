/**
 * The affiliate program, end to end, with real signed webhooks.
 *
 * Needs a fresh database (it creates the install owner) and the Worker:
 *   npx wrangler dev --local --port 8799 --persist-to <empty dir> --var APP_ORIGIN:http://localhost:8799
 *   BASE=http://localhost:8799 PERSIST=<that dir> node test/affiliate.e2e.mjs
 *
 * What it proves: a commission is earned only by money that arrived — a
 * correctly signed subscription payment from an account that signed up
 * through the link — at 40%, once per processor event however often it is
 * delivered; the first payment is not counted twice; nobody refers
 * themselves; an old account cannot be claimed; affiliates see only their own,
 * masked; and only the owner can mark a commission paid.
 */
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const B = process.env.BASE ?? 'http://localhost:8799';
const persist = process.env.PERSIST ? ` --persist-to ${process.env.PERSIST}` : '';
let fail = 0;
const ok = (name, cond, detail = '') => { if (!cond) fail++; console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ` — ${detail}`}`); };
let ipN = 1;
/* Once more on a dropped socket: editing the local database from the side
   (`sql`) can close a kept-alive connection under the next request. */
const post = async (url, init) => { try { return await fetch(url, init); } catch { await new Promise(r => setTimeout(r, 500)); return fetch(url, init); } };
const api = (path, body, headers = {}) => post(`${B}/api/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.9.1.${ipN++ % 250}`, ...headers }, body: JSON.stringify(body),
}).then(r => r.json().catch(() => ({})));
const sql = (q) => JSON.parse(execSync(`npx wrangler d1 execute crmpro --local${persist} --json --command ${JSON.stringify(q)}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;

const WH = 'whsec_affiliate_test';
async function stripeEvent(event) {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', WH).update(`${t}.${payload}`).digest('hex');
  const r = await post(`${B}/api/billing-webhook.php`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${sig}` }, body: payload });
  return r.status;
}
const invoicePaid = (id, accountId, cents, customer = 'cus_test1') => ({ id, type: 'invoice.paid', data: { object: { id: `in_${id}`, customer, amount_paid: cents, currency: 'usd', parent: { subscription_details: { metadata: { accountId } } } } } });

console.log('\nAffiliate program');
const OWNER = 'owner@aff.test', PW = 'Tq9!vX2#pLm7wZ-aff';
const boot = await api('auth.php', { action: 'bootstrap', email: OWNER, password: PW, name: 'Owner' });
if (!boot.success) { console.log('bootstrap failed — needs a fresh database', boot); process.exit(2); }
const owner = await api('auth.php', { action: 'login', email: OWNER, password: PW });
const conn = await api('billing.php', { token: owner.token, action: 'connect', provider: 'stripe', apiKey: 'sk_test_' + 'x'.repeat(24), webhookSecret: WH });
ok('the owner connects the subscription processor', conn.success, JSON.stringify(conn));

const signup = async (email, name) => {
  const r = await api('auth.php', { action: 'register', email, password: 'Another-horse-7x', name });
  return r.token ? r : await api('auth.php', { action: 'login', email, password: 'Another-horse-7x' });
};
const aff = await signup('sam@aff.test', 'Sam Partner');
let r = await api('affiliate.php', { token: aff.token, action: 'join', agree: false });
ok('joining needs the terms accepted', !r.success && r.field === 'affiliate.agree', JSON.stringify(r));
r = await api('affiliate.php', { token: aff.token, action: 'join', agree: true, payoutNote: 'sam@paypal.test' });
const code = r.program?.code;
ok('an account owner joins and gets a code', r.success && /^sam-[a-z0-9]{4}$/.test(code ?? ''), JSON.stringify(r));
r = await api('affiliate.php', { token: aff.token, action: 'attribute', ref: code });
ok('an affiliate cannot refer themselves', !r.attributed, JSON.stringify(r));

await api('affiliate.php', { action: 'click', ref: code });
await api('affiliate.php', { action: 'click', ref: code }, { 'CF-Connecting-IP': '10.9.1.200' });
await api('affiliate.php', { action: 'click', ref: code }, { 'CF-Connecting-IP': '10.9.1.200' });

const buyer = await signup('jamie@buyer.test', 'Jamie Buyer');
r = await api('affiliate.php', { token: buyer.token, action: 'attribute', ref: code });
ok('a new account that came through the link is attributed', r.success && r.attributed, JSON.stringify(r));
r = await api('affiliate.php', { token: buyer.token, action: 'attribute', ref: code });
ok('…once', !r.attributed, JSON.stringify(r));

const late = await signup('old@buyer.test', 'Old Account');
sql("UPDATE crm_users SET created_at = '2020-01-01T00:00:00.000Z' WHERE email = 'old@buyer.test'");
r = await api('affiliate.php', { token: late.token, action: 'attribute', ref: code });
ok('an old account cannot be claimed', !r.attributed, JSON.stringify(r));

/* The buyer's workspace, and the processor saying they paid. */
const acct = sql("SELECT account_id AS a FROM crm_workspaces WHERE owner_email = 'jamie@buyer.test' LIMIT 1")[0]?.a;
ok('the buyer has a workspace', !!acct, String(acct));
const checkout = { id: 'evt_checkout_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1', mode: 'subscription', client_reference_id: acct, metadata: { accountId: acct }, amount_total: 4900, currency: 'usd' } } };
ok('the checkout event is accepted', (await stripeEvent(checkout)) === 200);
let n = sql('SELECT COUNT(*) AS n FROM crm_commissions')[0].n;
ok('a completed checkout alone earns nothing (its invoice does)', n === 0, String(n));

ok('the first invoice is accepted', (await stripeEvent(invoicePaid('evt_inv_1', acct, 4900))) === 200);
ok('…and delivered again', (await stripeEvent(invoicePaid('evt_inv_1', acct, 4900))) === 200);
ok('a renewal next month', (await stripeEvent(invoicePaid('evt_inv_2', acct, 4900))) === 200);
const rows = sql('SELECT amount_cents AS a, base_cents AS b, rate_pct AS p, status AS s FROM crm_commissions ORDER BY created_at');
ok('two payments, two commissions — the repeat did not count', rows.length === 2, JSON.stringify(rows));
ok('each is 40% of what was paid, held', rows.every(x => x.a === 1960 && x.b === 4900 && x.p === 40 && x.s === 'pending'), JSON.stringify(rows));

const bad = await post(`${B}/api/billing-webhook.php`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 't=1,v1=00' }, body: JSON.stringify(invoicePaid('evt_forged', acct, 999999)) });
ok('a forged webhook is refused', bad.status === 400, String(bad.status));
ok('…and earns nothing', sql('SELECT COUNT(*) AS n FROM crm_commissions')[0].n === 2);

/* Payments from somebody not referred earn nothing. */
const other = await signup('pat@other.test', 'Pat Other');
const acct2 = sql("SELECT account_id AS a FROM crm_workspaces WHERE owner_email = 'pat@other.test' LIMIT 1")[0]?.a;
await stripeEvent(invoicePaid('evt_inv_other', acct2, 9700));
ok('a customer who was not referred earns nobody anything', sql('SELECT COUNT(*) AS n FROM crm_commissions')[0].n === 2);

r = await api('affiliate.php', { token: aff.token, action: 'status' });
const p = r.program;
ok('the affiliate sees their visits, sign-ups and paying customers', p?.stats?.clicks === 2 && p?.stats?.signups === 1 && p?.stats?.paying === 1, JSON.stringify(p?.stats));
ok('…held earnings of $39.20', p?.totals?.USD?.pending === 3920, JSON.stringify(p?.totals));
ok('…and the customer only masked', p?.commissions?.every(c => c.customer.startsWith('j') && !c.customer.includes('jamie')), JSON.stringify(p?.commissions?.[0]));

r = await api('affiliate.php', { token: aff.token, action: 'admin' });
ok('an affiliate cannot open the owner\'s view', !r.success, JSON.stringify(r).slice(0, 120));
r = await api('affiliate.php', { token: other.token, action: 'admin_mark', id: 'stripe:evt_inv_1', status: 'paid' });
ok('…nor mark anything paid', !r.success);

sql("UPDATE crm_commissions SET payable_at = '2020-01-01T00:00:00.000Z' WHERE id = 'stripe:evt_inv_1'");
r = await api('affiliate.php', { token: owner.token, action: 'admin' });
ok('the owner sees every affiliate and what is payable', r.success && r.affiliates?.length === 1 && r.totals?.USD?.payable === 1960, JSON.stringify(r.totals));
r = await api('affiliate.php', { token: owner.token, action: 'admin_mark', id: 'stripe:evt_inv_1', status: 'paid' });
ok('the owner marks one paid', r.success);
r = await api('affiliate.php', { token: aff.token, action: 'status' });
ok('…and the affiliate sees it paid', r.program?.totals?.USD?.paid === 1960, JSON.stringify(r.program?.totals));

/* What a payment buys. Nothing wrote crm_plans from a payment, so a buyer
   of Agency stayed on Studio's limit, and a cancelled one kept theirs. */
console.log('\nPlans follow payments');
const plan = email => sql(`SELECT plan_id AS p, resell_limit AS l, source AS s FROM crm_plans WHERE owner_email = '${email}'`)[0];
const billing = id => JSON.parse(sql(`SELECT v FROM crm_data WHERE k = 'crm_billing_status_${id}'`)[0]?.v ?? '{}');
ok('a Studio payment sets Studio', plan('jamie@buyer.test')?.p === 'starter' && plan('jamie@buyer.test')?.s === 'stripe', JSON.stringify(plan('jamie@buyer.test')));
ok('an Agency payment sets Agency, with its allowance', plan('pat@other.test')?.p === 'pro' && plan('pat@other.test')?.l === 12, JSON.stringify(plan('pat@other.test')));
ok('…and records who paid, for the billing portal', billing(acct2).customerId === 'cus_test1', JSON.stringify(billing(acct2)));
await stripeEvent({ id: 'evt_sub_upd', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', metadata: { accountId: acct2 } } } });
ok('an event the app does not act on leaves the status alone', billing(acct2).status === 'active' && billing(acct2).lastEvent === 'paid', JSON.stringify(billing(acct2)));
r = await api('stripe-portal.php', { token: other.token, accountId: acct2 });
ok('"Manage billing" goes to the connected processor, for the recorded customer', !r.success && !/not set up|No .*customer/i.test(r.message ?? r.error ?? ''), JSON.stringify(r).slice(0, 200));
r = await api('stripe-portal.php', { token: buyer.token, accountId: acct2 });
ok('…and only for your own workspace', !r.success && /not yours/.test(r.message ?? r.error ?? ''), JSON.stringify(r).slice(0, 160));
await stripeEvent({ id: 'evt_sub_del', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_test1', metadata: { accountId: acct2 } } } });
ok('a cancelled subscription is cancelled', billing(acct2).status === 'cancelled', JSON.stringify(billing(acct2)));
ok('…and its plan removed', !plan('pat@other.test'), JSON.stringify(plan('pat@other.test')));
sql("UPDATE crm_plans SET plan_id = 'agency', resell_limit = -1, source = 'manual' WHERE owner_email = 'jamie@buyer.test'");
await stripeEvent(invoicePaid('evt_inv_3', acct, 4900));
ok('a plan the owner granted by hand is not overwritten by a payment', plan('jamie@buyer.test')?.p === 'agency' && plan('jamie@buyer.test')?.s === 'manual', JSON.stringify(plan('jamie@buyer.test')));

/* The screens. */
const b = await pw.chromium.launch();
const pg = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = []; pg.on('pageerror', e => errs.push(String(e)));
await pg.goto(`${B}/?ref=${code}`, { waitUntil: 'networkidle' });
const stored = await pg.evaluate(() => localStorage.getItem('pc_ref'));
ok('a visit through the link is remembered in the browser', (stored ?? '').includes(code), String(stored));
const signupHref = await pg.evaluate(() => [...document.querySelectorAll('a')].map(a => a.getAttribute('href') ?? '').find(h => h.includes('/signup')) ?? '');
ok('…and carried on the sign-up link', signupHref.includes(`ref=${code}`), signupHref);
await pg.goto(`${B}/login`, { waitUntil: 'networkidle' });
await pg.getByLabel('Email or username').fill('sam@aff.test');
await pg.getByLabel('Password', { exact: true }).fill('Another-horse-7x');
await pg.getByRole('button', { name: 'Sign in', exact: true }).click();
await pg.waitForTimeout(2500);
await pg.goto(`${B}/affiliate`, { waitUntil: 'networkidle' });
await pg.waitForTimeout(1000);
ok('the affiliate screen shows the link', await pg.getByText(`?ref=${code}`).count() > 0);
ok('…and the commissions', await pg.getByText('$19.60').count() > 0);
await pg.setViewportSize({ width: 390, height: 844 });
await pg.waitForTimeout(300);
ok('no sideways scroll at 390px', (await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
await pg.goto(`${B}/affiliate-terms`, { waitUntil: 'networkidle' });
ok('the affiliate terms are public', await pg.getByRole('heading', { name: 'Affiliate Program Terms' }).count() > 0);
ok('no page errors', !errs.length, errs.join(' | '));
await b.close();

console.log(fail ? `\n${fail} failed` : '\nall passed');
process.exit(fail ? 1 : 0);
