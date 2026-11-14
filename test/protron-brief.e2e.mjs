/**
 * Protron, the 2026-11-12 brief, in the real app: the new robot face on the
 * launcher and in the panel, a first greeting written from what sign-up
 * already said (a Gmail address is asked "own business, agency or
 * independent?", never told it has none), the voice menu (warm by default),
 * and a workflow draft built step by step into a real business workspace —
 * every step a real save, the pointer following it, the result a draft in
 * D1. At 1280 and 390 wide: no overflow, no page errors.
 *
 * Needs `VITE_BASE=/ npm run build` and `wrangler dev --local` on :8787. No AI
 * key is needed: the no-AI path maps "an email workflow for my existing
 * contacts" to the same registered action the AI would propose.
 */
import { execSync } from 'node:child_process';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const B = process.env.BASE ?? 'http://localhost:8787';
for (let i = 0; i < 40; i++) { try { const r = await fetch(`${B}/login`); if (r.ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 1000)); }
const d1 = sql => { try { return JSON.parse(execSync(`npx wrangler d1 execute crmpro --local --json --command ${JSON.stringify(sql)}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))[0]?.results ?? []; } catch { return []; } };
let ipN = 1;
const api = (p, body) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.9.8.${ipN++ % 250}` }, body: JSON.stringify(body) }).then(r => r.json().catch(() => ({})));

d1('DELETE FROM crm_signup_attempts');
const email = `priya${Date.now().toString(36)}@gmail.com`;
const reg = await api('auth.php', { action: 'register', email, password: 'Sup3rSecret!23', name: 'Priya Shah', businessName: 'My Business' });
if (!reg.success) { console.log('register failed', reg.error); process.exit(1); }
const token = reg.token, acct = reg.user.accountId;
const pf = await api('projects.php', { token, accountId: acct, action: 'save_portfolio', name: 'Shah Motors', profile: { description: 'Used cars in Dallas' } });
const pj = await api('projects.php', { token, accountId: acct, action: 'save_project', name: 'Dealership customer acquisition', objective: 'More buyers in Dallas', portfolioId: pf.id, kind: 'general' });
if (!pj.success) { console.log('project failed', pj.error); process.exit(1); }

const b = await pw.chromium.launch();
const results = [];
const ok = (name, pass, detail = '') => results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : ` — ${detail}`}`);
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const width of [390, 1280]) {
  const W = `${width}px`;
  const ctx = await b.newContext({ viewport: { width, height: width === 390 ? 844 : 860 } });
  await ctx.addInitScript(([t, a, e]) => {
    if (!localStorage.getItem('crm_session')) {
      localStorage.setItem('crm_session', JSON.stringify({ token: t, backend: 'php', user: { email: e, name: 'Priya Shah', role: 'agency', accountId: a } }));
      localStorage.setItem('crm_active_account', a);
      localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: a, name: 'My workspace', businessName: 'My Business', plan: 'agency', status: 'active', price: 0 }]));
    }
  }, [token, acct, email]);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 180)));
  await p.goto(`${B}/contacts`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);

  /* The new face. */
  const face = p.locator('.pt-launch svg.pt-av');
  ok(`${W} the launcher shows the robot portrait`, (await face.count()) === 1 && /\/protron\/robot-(160|384)\.webp$/.test(await face.locator('image.pt-photo').getAttribute('href') ?? '') && (await face.locator('.pt-ring').count()) === 1 && (await face.locator('.pt-mouth .pt-bar').count()) === 7);

  await p.getByRole('button', { name: /Open Protron/ }).click();
  const panel = p.getByRole('dialog', { name: /Protron, your AI Live Business Manager/ });
  await panel.waitFor();
  await p.waitForTimeout(600);
  const hello = await panel.innerText();
  ok(`${W} greets by first name from sign-up`, /Hi Priya!/.test(hello), hello.slice(0, 240));
  ok(`${W} a Gmail sign-up is asked, never told it has no business`, /own business, managing an agency, or working independently/.test(hello) && !/My Business/.test(hello), hello.slice(0, 240));
  ok(`${W} the panel header has the robot face`, (await panel.locator('.pt-head-bar svg.pt-av').count()) === 1);

  /* The voice menu: warm by default, two choices (the robot "commander" voice
     was removed on 2026-11-13 — docs/claude/protron.md "One voice"). */
  await panel.getByRole('button', { name: 'Protron settings' }).click();
  const voice = panel.locator('[data-field="protron.voice"]');
  const opts = await voice.locator('option').evaluateAll(os => os.map(o => o.value));
  ok(`${W} voice menu: warm (default), device`, (await voice.inputValue()) === 'warm' && opts.join() === 'warm,natural', `${await voice.inputValue()} ${opts}`);
  ok(`${W} the business profile has the new boxes`, (await panel.locator('[data-field="protron.places"]').count()) === 1 && (await panel.locator('[data-field="protron.audience"]').count()) === 1);
  await panel.getByRole('button', { name: 'Protron settings' }).click();

  if (width === 1280) {
    /* A workflow draft, built step by step into the business workspace. */
    const box = panel.getByLabel('Message Protron');
    await box.fill('Create an email workflow for my existing contacts');
    await box.press('Enter');
    const confirm = panel.getByRole('button', { name: 'Confirm' });
    await confirm.waitFor({ timeout: 20_000 });
    const card = await panel.locator('.pt-card').last().innerText();
    ok(`${W} a workflow draft waits for Confirm and says it sends nothing`, /draft/i.test(card) && /nothing is sent until you turn it on/i.test(card), card.slice(0, 300));
    await confirm.click();
    let pointerSeen = false;
    for (let i = 0; i < 60; i++) {
      if (await p.locator('.pt-cursor-layer[data-shown="1"]').count()) pointerSeen = true;
      const st = await panel.locator('.pt-card').last().getAttribute('data-s');
      if (st === 'done' || st === 'failed') break;
      await p.waitForTimeout(250);
    }
    const doneCard = await panel.locator('.pt-card').last().innerText();
    ok(`${W} it finished, as a draft`, (await panel.locator('.pt-card').last().getAttribute('data-s')) === 'done' && /saved as a draft/.test(doneCard), doneCard.slice(0, 400));
    ok(`${W} the pointer showed where it was working`, pointerSeen);
    ok(`${W} it opened the business workspace's workflows`, p.url().includes(`project=${pj.id}`) && p.url().includes('tab=workflows'), p.url());
    const steps = await panel.locator('.pt-card').last().locator('.pt-steps li').count();
    const rows = d1(`SELECT status, nodes, template_key AS k FROM crm_project_workflows WHERE account_id = '${acct}' AND project_id = '${pj.id}'`);
    const nodes = rows[0] ? JSON.parse(rows[0].nodes).length : 0;
    ok(`${W} one draft in D1, every step saved, from the template`, rows.length === 1 && rows[0].status === 'draft' && rows[0].k === 'dormant-winback' && nodes > 2 && steps === nodes + 2, JSON.stringify({ rows: rows.length, status: rows[0]?.status, k: rows[0]?.k, nodes, steps }));
    await p.waitForTimeout(800);
    ok(`${W} the steps are drawn on the business workspace`, (await p.locator('[data-node-id]').count()) >= nodes, String(await p.locator('[data-node-id]').count()));
  }

  ok(`${W} no sideways scroll`, (await overflow(p)) === 0, String(await overflow(p)));
  ok(`${W} no page errors`, errs.length === 0, errs.join(' | '));
  await p.screenshot({ path: `/tmp/claude-0/pv/brief-${width}.png` });
  await ctx.close();
}

await b.close();
console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL'));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
