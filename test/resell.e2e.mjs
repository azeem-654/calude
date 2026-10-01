/**
 * Reselling at your own price: a reseller bills their clients on their own
 * processor, and nobody else's money or clients can be reached.
 *
 *   npx wrangler dev --local --port 8799 --persist-to <empty dir> --var APP_ORIGIN:http://localhost:8799
 *   BASE=http://localhost:8799 PERSIST=<that dir> node test/resell.e2e.mjs
 *
 * The processor itself is not called for a real link (a test key cannot make
 * one); what is proved is everything this app decides: whose key, whose price,
 * whose client, and that the client's payment, arriving on the reseller's own
 * signed webhook, marks that client — and only that client — paid, without
 * touching the operator's billing or the affiliate program.
 */
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const B = process.env.BASE ?? 'http://localhost:8799';
const persist = process.env.PERSIST ? ` --persist-to ${process.env.PERSIST}` : '';
let fail = 0;
const ok = (name, cond, detail = '') => { if (!cond) fail++; console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ` — ${detail}`}`); };
const post = async (url, init) => { try { return await fetch(url, init); } catch { await new Promise(r => setTimeout(r, 500)); return fetch(url, init); } };
let ipN = 1;
const api = (path, body) => post(`${B}/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.9.2.${ipN++ % 250}` }, body: JSON.stringify(body) }).then(r => r.json().catch(() => ({})));
const sql = (q) => JSON.parse(execSync(`npx wrangler d1 execute crmpro --local${persist} --json --command ${JSON.stringify(q)}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
async function signed(url, secret, event) {
  const payload = JSON.stringify(event); const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return (await post(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${sig}` }, body: payload })).status;
}
const invoicePaid = (id, accountId, cents) => ({ id, type: 'invoice.paid', data: { object: { id: `in_${id}`, amount_paid: cents, currency: 'usd', parent: { subscription_details: { metadata: { accountId } } } } } });

console.log('\nReselling at your own price');
const boot = await api('auth.php', { action: 'bootstrap', email: 'owner@resell.test', password: 'Tq9!vX2#pLm7wZ-rs', name: 'Owner' });
if (!boot.success) { console.log('bootstrap failed — needs a fresh database', boot); process.exit(2); }
const signup = async (email, name) => { const r = await api('auth.php', { action: 'register', email, password: 'Another-horse-7x', name }); return r.token ? r : api('auth.php', { action: 'login', email, password: 'Another-horse-7x' }); };
const ann = await signup('ann@agency.test', 'Ann Agency');
const bob = await signup('bob@agency.test', 'Bob Agency');
/* A client workspace each, as the agency screen makes them. */
sql("INSERT INTO crm_workspaces (account_id, owner_email, created_at) VALUES ('acct-ann-client', 'ann@agency.test', '2026-10-01T00:00:00Z'), ('acct-bob-client', 'bob@agency.test', '2026-10-01T00:00:00Z')");

let r = await api('resell.php', { token: ann.token, action: 'connect', provider: 'stripe', apiKey: 'pk_live_nope', webhookSecret: 'whsec_ann' });
ok('a publishable key is refused, naming the box', !r.success && r.field === 'resell.key', JSON.stringify(r));
r = await api('resell.php', { token: ann.token, action: 'connect', provider: 'stripe', apiKey: 'sk_test_' + 'a'.repeat(24), webhookSecret: 'whsec_ann' });
ok('Ann connects her own Stripe', r.success && r.resell?.connected && r.resell.mode === 'test', JSON.stringify(r).slice(0, 200));
const annHook = r.resell?.webhookUrl ?? '';
ok('…and gets a webhook address of her own', /\/api\/resell-webhook\.php\?r=[a-f0-9]{24}$/.test(annHook), annHook);
r = await api('resell.php', { token: bob.token, action: 'connect', provider: 'stripe', apiKey: 'sk_test_' + 'b'.repeat(24), webhookSecret: 'whsec_bob' });
const bobHook = r.resell?.webhookUrl ?? '';
ok('Bob connects his, at a different address', r.success && bobHook && bobHook !== annHook);
const st = await api('resell.php', { token: ann.token, action: 'status' });
ok('the key never comes back to the browser', !JSON.stringify(st).includes('aaaaaaaa') && !JSON.stringify(st).includes('whsec_ann'));

r = await api('resell.php', { token: ann.token, action: 'set_price', accountId: 'acct-ann-client', amount: 79, currency: 'USD' });
ok('Ann sets her client\'s price — $79 a month, her number', r.success && r.resell?.clients?.[0]?.amountCents === 7900, JSON.stringify(r.resell?.clients));
r = await api('resell.php', { token: ann.token, action: 'set_price', accountId: 'acct-bob-client', amount: 1 });
ok('Ann cannot price Bob\'s client', !r.success, JSON.stringify(r));
r = await api('resell.php', { token: ann.token, action: 'set_price', accountId: 'acct-ann-client', amount: 0 });
ok('a price must be a real one', !r.success && r.field === 'resell.price');
r = await api('resell.php', { token: ann.token, action: 'checkout', accountId: 'acct-bob-client' });
ok('Ann cannot send a payment link for Bob\'s client', !r.success, JSON.stringify(r));
r = await api('resell.php', { token: bob.token, action: 'checkout', accountId: 'acct-bob-client' });
ok('Bob cannot bill a client with no price set', !r.success && r.field === 'resell.price', JSON.stringify(r));

/* Ann's client pays — on Ann's webhook, signed with Ann's secret. */
ok('a forged payment is refused', (await signed(annHook, 'whsec_wrong', invoicePaid('evt_forged', 'acct-ann-client', 7900))) === 400);
ok('Ann\'s client\'s payment arrives on Ann\'s webhook', (await signed(annHook, 'whsec_ann', invoicePaid('evt_ann_1', 'acct-ann-client', 7900))) === 200);
let row = sql("SELECT status, last_paid_at AS p FROM crm_reseller_clients WHERE account_id = 'acct-ann-client'")[0];
ok('…and the client is marked paid', row?.status === 'active' && !!row.p, JSON.stringify(row));
sql("INSERT INTO crm_reseller_clients (account_id, owner_email, amount_cents, currency, status, updated_at) VALUES ('acct-bob-client', 'bob@agency.test', 5000, 'USD', 'none', '2026-10-01')");
await signed(annHook, 'whsec_ann', invoicePaid('evt_ann_reach', 'acct-bob-client', 5000));
row = sql("SELECT status FROM crm_reseller_clients WHERE account_id = 'acct-bob-client'")[0];
ok('Ann\'s processor cannot mark Bob\'s client paid', row?.status === 'none', JSON.stringify(row));
ok('an unknown webhook address is a 404', (await post(`${B}/api/resell-webhook.php?r=${'0'.repeat(24)}`, { method: 'POST', body: '{}' })).status === 404);

/* None of this is the operator's money. */
ok('no affiliate commission comes from a reseller\'s own billing', sql('SELECT COUNT(*) AS n FROM crm_commissions')[0].n === 0);
const opBilling = sql("SELECT COUNT(*) AS n FROM crm_data WHERE k LIKE 'crm_billing_status_acct-ann-client%'")[0].n;
ok('…and the operator\'s billing for that workspace is untouched', opBilling === 0, String(opBilling));

/* The screen. */
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto(`${B}/login`, { waitUntil: 'networkidle' });
await p.getByLabel('Email or username').fill('ann@agency.test');
await p.getByLabel('Password', { exact: true }).fill('Another-horse-7x');
await p.getByRole('button', { name: 'Sign in', exact: true }).click();
await p.waitForTimeout(2500);
await p.goto(`${B}/agency`, { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
await p.getByRole('button', { name: /^Billing$/ }).first().click();
const dlg = p.getByRole('dialog', { name: 'Charge your clients' });
ok('the billing window opens', await dlg.count() > 0);
ok('…says the money is the reseller\'s', await dlg.getByText(/Protected Central never holds this money/).count() > 0);
ok('…and shows her account connected, in test mode', await dlg.getByText(/Stripe · TEST/).count() > 0);
ok('…with her own webhook address', (await dlg.locator('input[readonly]').first().inputValue()) === annHook);
await p.setViewportSize({ width: 390, height: 844 });
await p.waitForTimeout(300);
ok('no sideways scroll at 390px', (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
ok('no page errors', !errs.length, errs.join(' | '));
await b.close();

console.log(fail ? `\n${fail} failed` : '\nall passed');
process.exit(fail ? 1 : 0);
