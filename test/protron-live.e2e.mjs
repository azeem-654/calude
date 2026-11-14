/**
 * Protron, the 2026-11-11 pass, in the real app: it floats beside its helmet
 * wherever that was dragged, Talk opens from the helmet, it speaks first
 * after ten seconds untouched, it drafts a social post by typing into
 * Graphics Designer step by step (and Undo puts it back), the conversation
 * follows the person to another browser, and what it did is in the audit
 * trail. At 390 and 1280 wide, no overflow, no page errors.
 *
 * Needs `VITE_BASE=/ npm run build` and `wrangler dev --local` on :8787. No AI
 * key is needed (the offline paths are what is checked); with one, the same
 * steps run through the AI.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const B = process.env.BASE ?? 'http://localhost:8787';
for (let i = 0; i < 40; i++) { try { const r = await fetch(`${B}/login`); if (r.ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 1000)); }
const d1 = sql => { try { return JSON.parse(execSync(`npx wrangler d1 execute crmpro --local --json --command ${JSON.stringify(sql)}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))[0]?.results ?? []; } catch { return []; } };
d1('DELETE FROM crm_signup_attempts');
const email = `ptl${Date.now().toString(36)}@test.dev`;
const reg = await (await fetch(`${B}/api/auth.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'register', email, password: 'Sup3rSecret!23', name: 'Tester', businessName: 'Lone Star Roofing' }) })).json();
if (!reg.success) { console.log('register failed', reg.error); process.exit(1); }
const token = reg.token, acct = reg.user.accountId;

const b = await pw.chromium.launch();
const results = [];
const ok = (name, pass, detail = '') => results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : ` — ${detail}`}`);

async function signedIn(width) {
  const ctx = await b.newContext({ viewport: { width, height: width === 390 ? 844 : 860 } });
  await ctx.addInitScript(([t, a, e]) => {
    if (!localStorage.getItem('crm_session')) {
      localStorage.setItem('crm_session', JSON.stringify({ token: t, backend: 'php', user: { email: e, name: 'T', role: 'agency', accountId: a } }));
      localStorage.setItem('crm_active_account', a);
      localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: a, name: 'Lone Star Roofing', plan: 'agency', status: 'active', price: 0 }]));
    }
  }, [token, acct, email]);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 180)));
  return { ctx, p, errs };
}
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const panelOf = p => p.getByRole('dialog', { name: /Protron, your AI Live Business Manager/ });

for (const width of [1280, 390]) {
  const W = `${width}px`;
  const { ctx, p, errs } = await signedIn(width);
  await p.goto(`${B}/contacts`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);

  /* Speaking first: ten seconds, nothing touched. Parked on both sites since
     2026-11-14 (features.ts PARKED — "only when it's clicked"): then the
     check is that it does NOT open by itself. */
  const speaksFirst = !/'protron-speaks-first',/.test(readFileSync(new URL('../src/services/features.ts', import.meta.url), 'utf8').split('const PARKED')[1]?.split(']);')[0] ?? '');
  await p.mouse.move(5, 5);
  await panelOf(p).waitFor({ timeout: speaksFirst ? 25_000 : 14_000 }).catch(() => undefined);
  const autoText = await panelOf(p).innerText().catch(() => '');
  if (speaksFirst) {
    ok(`${W} after 10 s untouched, Protron opens and speaks first`, /spoke up because you paused/.test(autoText), autoText.slice(0, 200));
    ok(`${W} …about the screen it is on`, /Contacts/i.test(autoText), autoText.slice(0, 200));
    await panelOf(p).getByRole('button', { name: 'Minimise Protron' }).click();
  } else {
    ok(`${W} speaking first is parked: 14 s untouched and the panel stays shut`, !autoText, autoText.slice(0, 200));
  }

  /* Floating beside the helmet, wherever it was dragged. */
  if (width > 760) {
    const orb = p.getByRole('button', { name: /Open Protron/ });
    const ob = await orb.boundingBox();
    await p.mouse.move(ob.x + 30, ob.y + 30);
    await p.mouse.down();
    await p.mouse.move(640, 430, { steps: 8 });
    await p.mouse.up();
    await p.waitForTimeout(300);
    const moved = await orb.boundingBox();
    ok(`${W} the helmet can be dragged anywhere`, Math.abs(moved.x + 35 - 640) < 6 && Math.abs(moved.y + 35 - 430) < 6, JSON.stringify(moved));
    await orb.click();
    await panelOf(p).waitFor();
    await p.waitForTimeout(500); // the opening animation scales it
    const pb = await panelOf(p).boundingBox();
    const beside = pb.x >= moved.x + moved.width - 2 || pb.x + pb.width <= moved.x + 2;
    ok(`${W} the chat floats beside the helmet, inside the window`, beside && pb.x >= 0 && pb.y >= 0 && pb.x + pb.width <= width && pb.y + pb.height <= 860, JSON.stringify({ pb, moved }));
    const head = panelOf(p).locator('.pt-head-bar');
    const hb = await head.boundingBox();
    await p.mouse.move(hb.x + 120, hb.y + 20);
    await p.mouse.down();
    await p.mouse.move(hb.x + 20, hb.y + 120, { steps: 6 });
    await p.mouse.up();
    const pb2 = await panelOf(p).boundingBox();
    ok(`${W} the chat can be dragged by its header`, Math.abs((pb2.x - pb.x) - -100) < 6 && Math.abs((pb2.y - pb.y) - 100) < 6, JSON.stringify({ pb, pb2 }));
    await panelOf(p).getByRole('button', { name: 'Minimise Protron' }).click();
  }

  /* Talk from the helmet. */
  await p.getByRole('button', { name: 'Talk to Protron' }).first().click();
  await panelOf(p).waitFor();
  await p.waitForTimeout(800);
  const talking = await panelOf(p).getAttribute('data-talk');
  ok(`${W} the helmet's Talk button opens Talk mode`, talking === '1' && await panelOf(p).locator('.pt-talk-stage').isVisible());
  await panelOf(p).getByRole('button', { name: 'Back to chat' }).click();
  ok(`${W} …and Back to chat returns to the conversation`, await panelOf(p).getAttribute('data-talk') === '0');

  /* A social post, typed into Graphics Designer in front of the customer. */
  await p.waitForTimeout(1300);
  await panelOf(p).getByLabel('Message Protron').fill('Draft a social post about our spring roof check sale');
  await panelOf(p).getByRole('button', { name: 'Send' }).click();
  await p.waitForURL(/\/social-creator/, { timeout: 30_000 }).catch(() => undefined);
  const card = panelOf(p).locator('.pt-card').last();
  await card.locator('.pt-chip[data-s="done"], .pt-chip[data-s="failed"]').waitFor({ timeout: 30_000 }).catch(() => undefined);
  const cardText = (await card.innerText().catch(() => '')).replace(/\s+/g, ' ');
  ok(`${W} the draft card lists its steps, all done`, (await card.locator('.pt-steps li[data-s="done"]').count()) === 4, cardText.slice(0, 240));
  const brief = await p.locator('[data-field="social.aiPrompt"]').inputValue().catch(() => '');
  ok(`${W} the brief is typed into Create with AI`, /spring roof check sale/.test(brief), brief.slice(0, 120));
  ok(`${W} generating stays the customer's button`, /press Generate/.test(cardText), cardText.slice(0, 240));
  await card.getByRole('button', { name: 'Undo' }).click();
  await p.waitForTimeout(400);
  ok(`${W} Undo puts the boxes back`, (await p.locator('[data-field="social.aiPrompt"]').inputValue().catch(() => 'x')) === '');

  ok(`${W} no horizontal overflow`, (await overflow(p)) === 0, String(await overflow(p)));
  ok(`${W} no page errors`, errs.length === 0, errs.join(' | '));
  await p.waitForTimeout(2200); // the server save is debounced 1.5 s
  await ctx.close();
}

/* Another browser, the same person: the conversation is there. */
{
  const { ctx, p, errs } = await signedIn(1280);
  await p.goto(`${B}/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: /Open Protron/ }).click();
  await panelOf(p).waitFor();
  await p.waitForTimeout(2500);
  const txt = await panelOf(p).innerText();
  ok('another device shows the same conversation', /spring roof check sale/.test(txt), txt.slice(0, 200));
  ok('…with no page errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

const audit = d1(`SELECT detail FROM crm_audit_events WHERE kind = 'protron_action' AND account_id = '${acct}'`);
ok('what Protron did is in the audit trail', audit.some(r => /draft_social_post\): done/.test(r.detail)) && audit.some(r => /cancelled — Undone/.test(r.detail)), JSON.stringify(audit).slice(0, 300));

await b.close();
console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL'));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
