/**
 * Every form asks only for what it shows.
 *
 * The bug this exists for: the mailbox form hid its SMTP host box when "Brevo"
 * was picked, and "Save & validate" answered "Add your outgoing mail server
 * (SMTP) host first." The SMTP path had been tested; the Brevo one never was.
 *
 * So this does not test one path. It takes a form, picks **every option of
 * every choice** in it, presses its validate button twice — once with the
 * boxes empty and once filled with plausible values — and fails if any answer
 * names a box that is not on screen. That judgement is services/fieldGuard.ts,
 * the same code that watches customers' screens in production; this reads what
 * it recorded (`window.__deadEnds`). Then it sweeps the validate/test buttons
 * on every Settings tab, and proves the guard itself works by feeding it a
 * refusal for a box that does not exist.
 *
 * Needs a built bundle (VITE_BASE=/) and `wrangler dev` over a fresh database
 * with APP_ORIGIN pointing at it — the same set-up as test:google:
 *   npx wrangler dev --local --port 8799 --persist-to <empty dir> --var APP_ORIGIN:http://localhost:8799
 *   BASE=http://localhost:8799 node test/formContract.e2e.mjs
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const B = process.env.BASE ?? 'http://localhost:8799';
let fail = 0;
const ok = (name, cond, detail = '') => { if (!cond) fail++; console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ` — ${detail}`}`); };
const api = (path, body) => fetch(`${B}/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());

const EMAIL = `owner-${Date.now()}@example.test`;
const PASSWORD = 'Correct-horse-9-forms';
const boot = await api('auth.php', { action: 'bootstrap', email: EMAIL, name: 'Owner', password: PASSWORD });
if (!boot.success) { console.log('bootstrap failed — this needs a fresh database', boot); process.exit(1); }

/** A plausible value for a box, from its field name or type. */
const valueFor = (field, type) => {
  if (/port/.test(field)) return '587';
  if (/host/.test(field)) return 'mail.example.test';
  if (/domain/.test(field)) return 'mg.example.test';
  if (/email|username/.test(field)) return 'test@example.test';
  if (/folder/.test(field)) return 'INBOX';
  if (/name/.test(field)) return 'Test';
  if (type === 'password' || /key|secret|password/.test(field)) return 'not-a-real-key-123';
  return 'test';
};

const b = await pw.chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));

/* Sign in the way a person does. */
await p.goto(`${B}/login`, { waitUntil: 'networkidle' });
await p.getByLabel('Email or username').fill(EMAIL);
await p.getByLabel('Password', { exact: true }).fill(PASSWORD);
await p.getByRole('button', { name: 'Sign in', exact: true }).click();
await p.waitForTimeout(2500);

const deadEnds = () => p.evaluate(() => window.__deadEnds ?? []);
/* A customer, so the Sign-ups list has somebody to message. */
const early = await api('auth.php', { action: 'register', email: `early-${Date.now()}@example.test`, name: 'Early', password: 'Violet-kettle-8-forms' });
const other0 = () => !!early.token;
const resetDeadEnds = () => p.evaluate(() => { window.__deadEnds = []; });
const settle = async () => {
  await p.waitForLoadState('networkidle').catch(() => {});
  await p.waitForTimeout(900);
};

/* ── 1 · The mailbox form, every sending method, empty and filled ──
   Each round starts from a workspace with no mailboxes and a fresh "Add a
   mailbox" form. Saving closes that form and opens the saved mailbox's card,
   so a round that reused the page would drive whatever form happened to be
   first — which is how an earlier version of this test passed with the bug
   it exists for put back. */
const account = await p.evaluate(() => localStorage.getItem('crm_active_account'));
const mailboxApi = (b) => p.evaluate(async ([acct, body]) => {
  const r = await fetch('/api/mailbox.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'cookie', accountId: acct, ...body }) });
  return r.json();
}, [account, b]);
const freshForm = async () => {
  const l = await mailboxApi({ action: 'list' });
  for (const m of l.mailboxes ?? []) await mailboxApi({ action: 'delete', id: m.id });
  await p.goto(`${B}/settings`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /Add a mailbox/ }).click();
  return p.getByRole('combobox').filter({ has: p.locator('option[value="brevo"]') }).first();
};

let how = await freshForm();
const methods = await how.locator('option').evaluateAll(os => os.map(o => ({ value: o.value, label: o.textContent })));
ok('the mailbox form offers several ways to send', methods.length >= 2, JSON.stringify(methods));

for (const m of methods) {
  for (const pass of ['empty', 'filled']) {
    how = await freshForm();
    await resetDeadEnds();
    await how.selectOption(m.value);
    await p.waitForTimeout(150);
    /* Fill (or leave empty) every box the outgoing half is showing now. */
    const boxes = await p.locator('[data-field]:visible').evaluateAll(els => els.map(e => ({ field: e.getAttribute('data-field'), type: e.getAttribute('type') || 'text' })));
    for (const bx of boxes) {
      if (!/^(smtp|provider|from)\./.test(bx.field)) continue;
      await p.locator(`[data-field="${bx.field}"]:visible`).first().fill(pass === 'empty' ? '' : valueFor(bx.field, bx.type));
    }
    const answer = p.waitForResponse(r => r.url().includes('/api/mailbox.php') && /test_outgoing|"save"/.test(r.request().postData() ?? ''), { timeout: 20000 }).catch(() => null);
    await p.getByRole('button', { name: /Save & validate/ }).first().click();
    await answer;
    await settle();
    const de = await deadEnds();
    const page = await p.locator('body').innerText().catch(() => '');
    ok(`${m.label}, ${pass}: every box it asks for is on screen`, de.length === 0, JSON.stringify(de));
    if (m.value !== 'smtp') ok(`${m.label}, ${pass}: never asks for an SMTP host`, !/\(SMTP\) host|SMTP host first/.test(page), page.match(/[^\n]*(SMTP\) host|SMTP host first)[^\n]*/)?.[0] ?? '');
  }
}

/* ── 2 · Every validate / test-connection button on every Settings tab ── */
const settingsTabs = ['Email & SMS', 'AI Engine', 'API Validation', 'Integrations', 'Email Deliverability', 'Infrastructure', 'Domains & Email', 'Security & Privacy', 'Platform services'];
for (const t of settingsTabs) {
  await p.goto(`${B}/settings`, { waitUntil: 'networkidle' });
  const tab = p.getByRole('button', { name: new RegExp(`^${t}`) }).first();
  if (!(await tab.count())) { ok(`Settings → ${t} exists`, false, 'tab not found'); continue; }
  await tab.click();
  await settle();
  await resetDeadEnds();
  const buttons = p.getByRole('button', { name: /^(Save & validate|Validate|Test connection|Check connection|Check what)/i });
  const n = await buttons.count();
  for (let i = 0; i < n; i++) {
    const btn = buttons.nth(i);
    if (!(await btn.isVisible().catch(() => false)) || !(await btn.isEnabled().catch(() => false))) continue;
    await btn.click().catch(() => {});
    await settle();
  }
  const de = await deadEnds();
  ok(`Settings → ${t}: ${n} validate button(s) pressed, no dead ends`, de.length === 0, JSON.stringify(de));
}

/* ── 2b · Sign-ups & trials: the booking link and a message's button ──
   Both refuse anything that is not https by naming their box; both boxes must
   be on screen when they do. */
await resetDeadEnds();
await p.goto(`${B}/signups`, { waitUntil: 'networkidle' });
await settle();
await p.locator('[data-field="kickoffUrl"]').fill('ftp://not-a-booking-page');
await p.getByRole('button', { name: 'Save', exact: true }).first().click();
await settle();
ok('Sign-ups: a bad booking link is refused at a box on screen', (await deadEnds()).length === 0, JSON.stringify(await deadEnds()));
await p.locator('[data-field="kickoffUrl"]').fill('');
await p.locator('[data-field="digestTo"]').fill('not-an-address@');
await p.getByRole('button', { name: 'Save', exact: true }).last().click();
await settle();
ok('Sign-ups: a bad digest address is refused at a box on screen', (await deadEnds()).length === 0, JSON.stringify(await deadEnds()));
await p.locator('[data-field="digestTo"]').fill('');
if (other0()) {
  await p.goto(`${B}/signups`, { waitUntil: 'networkidle' });
  await settle();
  await p.getByRole('button', { name: 'Message', exact: false }).last().click();
  await p.locator('[data-field="link"]').fill('javascript:alert(1)');
  await p.getByRole('button', { name: 'Send', exact: true }).click();
  await settle();
  ok('Sign-ups: a bad message link is refused at a box on screen', (await deadEnds()).length === 0, JSON.stringify(await deadEnds()));
}

/* ── 2c · Reputation: the review-source form and the owner's Places key ──
   Finding the business, the workspace's own key, and the install key all
   refuse by naming a box; each must be on screen when they do. */
await resetDeadEnds();
await p.goto(`${B}/reputation`, { waitUntil: 'networkidle' });
await settle();
await p.getByRole('button', { name: /Find your business on Google|Reputation settings/ }).first().click();
const repDialog = p.getByRole('dialog');
await repDialog.getByRole('button', { name: /Review Sources/ }).click();
await repDialog.locator('[data-field="rep.search"]').fill('');
await repDialog.getByRole('button', { name: /^Search/ }).click();
await settle();
ok('Reputation: an empty business search is refused at a box on screen', (await deadEnds()).length === 0, JSON.stringify(await deadEnds()));
await repDialog.locator('[data-field="rep.placesKey"]').fill('not-a-google-key');
await repDialog.getByRole('button', { name: 'Save key', exact: true }).click();
await settle();
ok('Reputation: a malformed Places key is refused at a box on screen', (await deadEnds()).length === 0, JSON.stringify(await deadEnds()));
ok('Reputation: …and the refusal is shown', /does not look like a Google API key/.test(await repDialog.innerText()));
await p.goto(`${B}/settings`, { waitUntil: 'networkidle' });
await p.getByRole('button', { name: /^Platform services/ }).first().click();
await settle();
await p.locator('[data-field="places.installKey"]').fill('AIzaTooShort');
await p.getByRole('button', { name: 'Save key', exact: true }).click();
await settle();
ok('Settings → Platform services: a malformed Google Maps key is refused at a box on screen', (await deadEnds()).length === 0, JSON.stringify(await deadEnds()));

/* ── 2d · Contacts → Find businesses: both boxes refuse by name ──
   Checked before any key or budget, so this runs on an install with no
   Google Maps key at all. */
await resetDeadEnds();
await p.goto(`${B}/contacts`, { waitUntil: 'networkidle' });
await settle();
await p.getByRole('button', { name: /Find businesses/ }).first().click();
const findDialog = p.getByRole('dialog', { name: 'Find businesses' });
await findDialog.getByRole('button', { name: /^Search$/ }).click();
await settle();
ok('Find businesses: an empty search is refused at a box on screen', (await deadEnds()).length === 0, JSON.stringify(await deadEnds()));
ok('Find businesses: …and the refusal is shown', /Say what kind of business/.test(await findDialog.innerText()));
await findDialog.locator('[data-field="prospects.trade"]').fill('plumber');
await findDialog.getByRole('button', { name: /^Search$/ }).click();
await settle();
ok('Find businesses: a missing place is refused at its box', (await deadEnds()).length === 0 && /Say where to look/.test(await findDialog.innerText()), JSON.stringify(await deadEnds()));
await findDialog.getByRole('button', { name: 'Close' }).click();

/* ── 3 · The guard catches what it is for ──
   A refusal naming a box that does not exist anywhere must be recorded and
   reported — otherwise every pass above proves nothing. */
await p.goto(`${B}/settings`, { waitUntil: 'networkidle' });
await resetDeadEnds();
await p.route('**/api/mailbox.php', async (route, req) => {
  if (req.postData()?.includes('"list"')) return route.continue();
  /* Shaped exactly as worker/src/lib/http.ts `fail` shapes a field refusal. */
  await route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'X-Refused-Field': 'no.such.box' },
    body: JSON.stringify({ success: false, error: 'Add your frobnicator first.', field: 'no.such.box' }),
  });
});
await p.getByRole('button', { name: /Add a mailbox/ }).click();
await p.getByRole('button', { name: /Save & validate/ }).first().click();
await settle();
await p.unroute('**/api/mailbox.php');
const caught = await deadEnds();
ok('a refusal for a box that is not there is caught', caught.some(d => d.field === 'no.such.box'), JSON.stringify(caught));
await p.waitForTimeout(600);
const listed = await p.evaluate(async () => {
  const r = await fetch('/api/uireport.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'cookie', action: 'list' }) });
  return r.json();
});
ok('…and reported to the owner', (listed.reports ?? []).some(r => r.field === 'no.such.box' && r.api === '/api/mailbox.php'), JSON.stringify(listed).slice(0, 300));

/* The owner sees it in Settings → API Validation. */
await p.goto(`${B}/settings?tab=api-validation`, { waitUntil: 'networkidle' });
await settle();
ok('the Screen checks card lists it', (await p.getByText('no.such.box').count()) > 0);

/* Somebody who is not the owner cannot read the list. */
const other = await api('auth.php', { action: 'register', email: `member-${Date.now()}@example.test`, name: 'Member', password: 'Another-horse-7' });
ok('a customer can still sign up while the owner\'s mailbox is unproved', !!other.token, JSON.stringify(other).slice(0, 200));
if (other.token) {
  const r = await api('uireport.php', { token: other.token, action: 'list' });
  ok('a customer cannot read the reports', !r.success, JSON.stringify(r));
}

ok('no page errors', !errs.length, errs.join(' | '));
await b.close();
console.log(fail ? `\n${fail} failed` : '\nall passed');
process.exit(fail ? 1 : 0);
