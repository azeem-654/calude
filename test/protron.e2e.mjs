/**
 * Protron in the real app — the launcher, the panel, the action cards, the
 * context note, and the AI Autopilot onboarding through to Understand.
 *
 * Needs `VITE_BASE=/ npm run build` and `npx wrangler dev --local --port 8787`.
 * Run with `npm run test:protron:e2e`. With no AI key on the local install it
 * also proves the offline path: Protron says the AI is not answering and still
 * maps the commonest requests to registered actions.
 */
import { execSync } from 'node:child_process';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const B = process.env.BASE ?? 'http://localhost:8787';
if (!/localhost|127\.0\.0\.1/.test(B)) throw new Error('Local only: this clears sign-up limits.');
const SHOTS = process.env.SHOTS ?? '';
for (let i = 0; i < 40; i++) { try { const r = await fetch(`${B}/login`); if (r.ok) break; } catch {} await new Promise(r => setTimeout(r, 1000)); }
const tag = Date.now().toString(36);
const email = `pt${tag}@test.dev`, password = 'Sup3rSecret!23';

execSync('npx wrangler d1 execute crmpro --local --command "DELETE FROM crm_signup_attempts"', { stdio: 'ignore' });
const reg = await (await fetch(`${B}/api/auth.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'register', email, password, name: 'Tester', businessName: 'Lone Star Roofing' }) })).json();
console.log('register', reg.success ?? reg.error);
const token = reg.token, acct = reg.user.accountId;

const b = await pw.chromium.launch();
const out = [];
for (const width of [390, 1280]) {
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
  await p.goto(`${B}/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const overflow = () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const orb = p.getByRole('button', { name: /Open Protron/ });
  out.push(`${width}: launcher visible=${await orb.isVisible()} overflow=${await overflow()}`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/dash-${width}.png` });
  await orb.click();
  const panel = p.getByRole('dialog', { name: /Protron, your AI Live Business Manager/ });
  await panel.waitFor({ timeout: 10000 });
  const txt = await panel.innerText();
  out.push(`${width}: panel open; welcome=${/I.m Protron/.test(txt)} starters=${await panel.locator('.pt-sug').count()} overflow=${await overflow()}`);
  // Offline matching path (no AI key locally): find prospects proposal
  await panel.getByLabel('Message Protron').fill('Find roofing companies in Dallas');
  await panel.getByRole('button', { name: 'Send' }).click();
  await panel.locator('.pt-card').first().waitFor({ timeout: 30000 });
  const card = await panel.locator('.pt-card').first().innerText();
  out.push(`${width}: card -> ${card.replace(/\s+/g, ' ').slice(0, 160)}`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/panel-${width}.png` });
  await panel.getByRole('button', { name: 'Cancel' }).first().click();
  out.push(`${width}: after cancel -> ${(await panel.locator('.pt-card').first().innerText()).replace(/\s+/g, ' ').slice(0, 90)} url=${new URL(p.url()).pathname}`);
  // navigation action (read tier, runs at once)
  await p.waitForTimeout(1300);
  await panel.getByLabel('Message Protron').fill('Where do I configure my email settings?');
  await panel.getByRole('button', { name: 'Send' }).click();
  await p.waitForURL(/\/settings/, { timeout: 30000 }).catch(() => {});
  out.push(`${width}: email question -> url=${new URL(p.url()).pathname}${new URL(p.url()).search}`);
  await p.waitForTimeout(800);
  // navigate by app, panel says new screen
  await p.goto(`${B}/video-studio`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  const kept = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('pc_protron_chat') && !/_(at|dirty)$/.test(k)).map(k => JSON.parse(localStorage.getItem(k)).length));
  out.push(`${width}: after reload, conversation turns kept=${kept}`);
  await p.getByRole('button', { name: /Open Protron/ }).click();
  const panel2 = p.getByRole('dialog', { name: /Protron, your AI Live Business Manager/ });
  await panel2.waitFor();
  await p.waitForTimeout(600);
  const t2 = await panel2.innerText();
  out.push(`${width}: context note on video studio=${/You're now in AI Video Studio/.test(t2)}`);
  await panel2.getByRole('button', { name: /Minimise Protron/ }).click();

  // Autopilot wizard onboarding
  await p.goto(`${B}/autopilot?new=1`, { waitUntil: 'domcontentloaded' });
  const d = p.getByRole('dialog', { name: 'New business workspace' });
  await d.waitFor({ timeout: 20000 });
  await p.waitForTimeout(800);
  /* Chat-first (2026-11-14): Protron's own opening is on screen at once — no form, no AI call. */
  const opening = d.locator('.np-talk-bot').first();
  await opening.waitFor({ timeout: 5000 });
  const faces = await d.locator('.np-chat-row .np-chat-face').count();
  out.push(`${width}: wizard opens on chat=${/name of your business/.test(await opening.innerText())} face=${faces > 0} nameBox=${await d.getByLabel('Company or business name').count()} launcherAside=${await p.locator('.pt-launch[data-aside="1"]').count()}`);
  const cta = d.locator('.wz-cta').last();
  const say = async (t) => {
    const before = await d.locator('.np-talk-bot').count();
    await d.getByLabel('Your answer').fill(t);
    await d.getByRole('button', { name: 'Answer', exact: true }).click();
    await d.locator('.np-talk-bot').nth(before).waitFor({ timeout: 30000 }).catch(() => {});
  };
  await say('Lone Star Roofing');
  await say('We run a roofing company in Texas.');
  /* "What would you like first?" offers the ready-made solutions as quick answers. */
  await d.getByRole('button', { name: 'Lead Generation', exact: true }).click();
  await p.waitForTimeout(1500);
  await say('Homeowners around Dallas.');
  await say('Dallas');
  await say('We forget to follow up on estimates.');
  const side = await d.locator('.np-side').innerText();
  out.push(`${width}: chat filled company=${/Lone Star Roofing/.test(side)} solution=${/Lead Generation/.test(side)} overflow=${await overflow()} cta="${await cta.innerText()}"`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/wizard-talk-${width}.png` });
  await cta.click(); // write my instruction
  const ins = d.getByLabel('Instruction for AI Autopilot');
  await ins.waitFor({ timeout: 40000 });
  const text = await ins.inputValue();
  out.push(`${width}: instruction has company=${/Lone Star Roofing/.test(text)} problem=${/follow up on estimates/.test(text)} len=${text.length}`);
  await ins.fill(text + '\nPreferences: weekdays only.');
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/wizard-prompt-${width}.png` });
  await cta.click(); // approve
  await d.getByText(/Here.s what I understood|Understanding your request/).first().waitFor({ timeout: 40000 });
  await p.waitForTimeout(3000);
  const und = await d.innerText();
  out.push(`${width}: understand step reached; solutions shown=${/Lead Generation/.test(und)}; overflow=${await overflow()}`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/wizard-understand-${width}.png` });
  out.push(`${width}: pageerrors=${JSON.stringify(errs)}`);
  await p.close();
}
await b.close();
console.log(out.join('\n'));
const want = [
  /launcher visible=true overflow=0/, /welcome=true starters=4 overflow=0/, /card -> Search for prospects Confirm below/,
  /after cancel -> Search for prospects Cancelled .* url=\//, /email question -> url=\/settings/, /conversation turns kept=4/,
  /context note on video studio=true/, /wizard opens on chat=true face=true nameBox=0 launcherAside=1/, /chat filled company=true solution=true overflow=0/,
  /instruction has company=true problem=true/, /solutions shown=true; overflow=0/, /pageerrors=\[\]/,
];
let failed = 0;
for (const w of [390, 1280]) for (const re of want) {
  const hit = out.some(l => l.startsWith(`${w}:`) && re.test(l));
  if (!hit) failed++;
  console.log(`${hit ? 'PASS' : 'FAIL'}  ${w}px ${re}`);
}
if (failed) process.exit(1);
