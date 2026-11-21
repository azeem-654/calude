/**
 * Protron's messages in the help button's live chat, in the browser (390 and
 * 1280 wide): a signed-in customer opens /autopilot?pc=updates, sees what is
 * waiting with its Approve button, approves it, asks "Where do things
 * stand?", and replies — with no sideways scroll and no page errors.
 *
 * Over a fresh database (it needs an install owner, which it makes):
 *   VITE_BASE=/ npm run build
 *   npx wrangler d1 migrations apply crmpro --local --persist-to /tmp/pf-db
 *   npx wrangler dev --local --port 8799 --persist-to /tmp/pf-db     (another terminal)
 *   BASE=http://localhost:8799 PERSIST=/tmp/pf-db node test/protronFeed.e2e.mjs   SHOTS=/dir keeps screenshots
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const B = process.env.BASE ?? 'http://localhost:8787';
const SHOTS = process.env.SHOTS ?? '';
let bad = 0;
const ok = (name, cond, detail = '') => { console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  — ${detail}`}`); if (!cond) bad++; };
const PERSIST = process.env.PERSIST ? ` --persist-to ${process.env.PERSIST}` : '';
/* Through a file: the JSON inside the values does not survive a shell's quoting. */
const d1 = sql => {
  const f = path.join(os.tmpdir(), `pf-${process.pid}-${Math.random().toString(36).slice(2)}.sql`);
  fs.writeFileSync(f, sql);
  try { return JSON.parse(execSync(`npx wrangler d1 execute crmpro --local${PERSIST} --json --file ${f}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString())[0]?.results ?? []; }
  finally { fs.rmSync(f, { force: true }); }
};

d1('DELETE FROM crm_signup_attempts');
/* The help button exists only where the install owner has an in-app widget (houseWidgetKey). */
let owner = d1("SELECT email FROM crm_users WHERE account_id IS NULL AND role = 'agency' LIMIT 1")[0]?.email;
if (!owner) {
  /* A fresh database: make the install owner (bootstrap refuses a second one). */
  await fetch(`${B}/api/auth.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'bootstrap', email: 'owner-pf@test.dev', name: 'Owner', password: 'Correct-horse-9-feed' }) });
  owner = d1("SELECT email FROM crm_users WHERE account_id IS NULL AND role = 'agency' LIMIT 1")[0]?.email;
}
if (!owner) { console.log('This needs an install owner in the local database (run any e2e that bootstraps one first).'); process.exit(2); }
d1(`INSERT OR IGNORE INTO crm_workspaces (account_id, owner_email, created_at) VALUES ('acct-e2e-owner', '${owner}', '2026-01-01T00:00:00Z')`);
const ws = d1(`SELECT account_id FROM crm_workspaces WHERE owner_email = '${owner}' LIMIT 1`)[0].account_id;
d1(`INSERT OR IGNORE INTO crm_widgets (id, account_id, name, public_key, title, launcher, features, status, in_app, created_at, updated_at) VALUES ('w-e2e-house', '${ws}', 'Help', 'e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0', 'Help & support', 'Help', '["chat","ticket"]', 'live', 1, '2026-01-01T00:00:00Z', '2026-11-21T00:00:00Z')`);

const tag = Date.now().toString(36);
const b = await pw.chromium.launch();
for (const width of [390, 1280]) {
  console.log(`\n${width} wide`);
  const email = `pf${tag}${width}@test.dev`;
  const reg = await (await fetch(`${B}/api/auth.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'register', email, password: 'Sup3rSecret!23', name: 'Tester', businessName: 'Lone Star Roofing' }) })).json();
  if (!reg.success) { ok('signed up', false, JSON.stringify(reg).slice(0, 160)); continue; }
  const acct = reg.user.accountId;
  const act = `pfa-${tag}-${width}`;
  const proj = `pfp-${tag}-${width}`;
  d1(`INSERT INTO crm_projects (id, account_id, name, objective, status, created_at, updated_at) VALUES ('${proj}', '${acct}', 'Lone Star Roofing — spring', 'Book 20 roof checks', 'running', '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`);
  d1(`INSERT INTO crm_autopilot_actions (id, account_id, project_id, kind, status, summary, because, counts, effect, detail, due_at, created_at) VALUES ('${act}', '${acct}', '${proj}', 'send_email', 'awaiting', 'Email 12 past clients about the spring offer', 'They have not heard from you in 90 days', '{}', '{"type":"none"}', '', NULL, '2026-11-21T09:00:00Z')`);
  d1(`INSERT INTO crm_protron_messages (id, account_id, kind, body, actions, created_at) VALUES
      ('pfm1-${tag}-${width}', '${acct}', 'progress', 'Update on Lone Star Roofing — I carried out 2 things:\n• Wrote a follow-up email\n• Built a booking workflow', '[{"type":"open","path":"/autopilot","label":"See it on AI Autopilot"}]', '2026-11-21T09:01:00Z'),
      ('pfm2-${tag}-${width}', '${acct}', 'waiting', 'This is waiting for your yes: Email 12 past clients about the spring offer. Nothing goes out until you approve it.', '[{"type":"approve","actionId":"${act}"}]', '2026-11-21T09:02:00Z'),
      ('pfm3-${tag}-${width}', '${acct}', 'ask', 'Quick question about Lone Star Roofing: what is going on this week?', '[]', '2026-11-21T09:03:00Z')`);

  const ctx = await b.newContext({ viewport: { width, height: width === 390 ? 844 : 860 } });
  const host = new URL(B).hostname;
  await ctx.addCookies([{ name: 'pc_session', value: reg.token, domain: host, path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.addInitScript(([t, a, e]) => {
    if (!localStorage.getItem('crm_session')) {
      localStorage.setItem('crm_session', JSON.stringify({ token: t, backend: 'php', user: { email: e, name: 'T', role: 'agency', accountId: a } }));
      localStorage.setItem('crm_active_account', a);
    }
  }, [reg.token, acct, email]);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 180)));
  await p.goto(`${B}/autopilot?pc=updates`, { waitUntil: 'networkidle' });
  const thread = p.locator('[data-pc-updates]');
  await thread.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  ok('the link opens the AI Live Business Manager thread', await thread.isVisible());
  ok('it shows the waiting item and the update', await thread.getByText(/Email 12 past clients/).first().isVisible() && await thread.getByText(/carried out 2 things/).isVisible());
  const approve = thread.locator(`[data-pc-approve]`).first();
  ok('the waiting item has an Approve button', await approve.isVisible());
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/feed-${width}-0.png` });
  await approve.click();
  await thread.getByText(/Approved — going ahead/).waitFor({ timeout: 10_000 }).catch(() => {});
  ok('approving it from the chat says so', await thread.getByText(/Approved — going ahead/).isVisible());
  ok('…and the action really moved to pending', d1(`SELECT status FROM crm_autopilot_actions WHERE id = '${act}'`)[0]?.status === 'pending');
  await p.getByRole('button', { name: 'Where do things stand?' }).click();
  await p.locator('[data-pc-updates]').getByText(/Here is where things stand/).waitFor({ timeout: 10_000 }).catch(() => {});
  ok('"Where do things stand?" answers from the records', await p.locator('[data-pc-updates]').getByText(/Here is where things stand/).isVisible());
  await p.locator('[data-field="protron-reply"]').fill('We start a spring roof check offer next week');
  await p.getByRole('button', { name: 'Send' }).last().click();
  await p.locator('[data-pc-updates]').getByText(/Thanks — noted/).waitFor({ timeout: 10_000 }).catch(() => {});
  ok('a reply is kept and acknowledged', await p.locator('[data-pc-updates]').getByText(/Thanks — noted/).isVisible());
  ok('…and saved where the AI writers read it', /spring roof check/.test(JSON.stringify(d1(`SELECT v FROM crm_data WHERE account_id = '${acct}' AND k = 'crm_onboarding'`))));
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/feed-${width}-1.png` });
  ok('no sideways scroll', await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) === 0);
  ok('no page errors', !errs.length, errs.join(' | '));
  await ctx.close();
}
await b.close();
console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
