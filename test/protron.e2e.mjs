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
  const panel = p.getByRole('dialog', { name: /Protron, your AI business manager/ });
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
  const kept = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('pc_protron_chat')).map(k => JSON.parse(localStorage.getItem(k)).length));
  out.push(`${width}: after reload, conversation turns kept=${kept}`);
  await p.getByRole('button', { name: /Open Protron/ }).click();
  const panel2 = p.getByRole('dialog', { name: /Protron, your AI business manager/ });
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
  const nameBox = d.getByLabel('Company or business name');
  out.push(`${width}: wizard first screen asks name=${await nameBox.isVisible()} prefilled="${await nameBox.inputValue()}" launcherAside=${await p.locator('.pt-launch[data-aside="1"]').count()}`);
  await nameBox.fill('Lone Star Roofing');
  const cta = d.locator('.wz-cta').last();
  await cta.click();
  await d.getByRole('button', { name: /Lead Generation/ }).click();
  await d.getByRole('button', { name: /Customer Follow-Up Automation/ }).click();
  await d.getByRole('button', { name: /Customer Reactivation/ }).click();
  await d.getByRole('button', { name: /Customer Reactivation/ }).click(); // remove again
  const pressed = await d.locator('.np-sol[aria-pressed="true"]').count();
  out.push(`${width}: solutions chosen=${pressed} overflow=${await overflow()} cta="${await cta.innerText()}"`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/wizard-sol-${width}.png` });
  await cta.click();
  await d.locator('.np-talk-bot').first().waitFor({ timeout: 30000 });
  out.push(`${width}: first question="${(await d.locator('.np-talk-bot').first().innerText()).slice(0, 90)}"`);
  await d.getByLabel('Your answer').fill('We run a roofing company in Texas.');
  await d.getByRole('button', { name: 'Answer', exact: true }).click();
  await p.waitForTimeout(1500);
  await d.getByLabel('Your answer').fill('Homeowners around Dallas.');
  await d.getByRole('button', { name: 'Answer', exact: true }).click();
  await p.waitForTimeout(1500);
  await d.getByLabel('Your answer').fill('We forget to follow up on estimates.');
  await d.getByRole('button', { name: 'Answer', exact: true }).click();
  await p.waitForTimeout(1500);
  await d.getByRole('button', { name: /Skip this question/ }).click().catch(() => {});
  await p.waitForTimeout(1200);
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
  out.push(`${width}: understand step reached; solutions shown=${/Lead Generation/.test(und)}&${/Sales Follow-up/.test(und)}; overflow=${await overflow()}`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/wizard-understand-${width}.png` });
  out.push(`${width}: pageerrors=${JSON.stringify(errs)}`);
  await p.close();
}
await b.close();
console.log(out.join('\n'));
const want = [
  /launcher visible=true overflow=0/, /welcome=true starters=4 overflow=0/, /card -> Search for prospects Needs your OK/,
  /after cancel -> Search for prospects Cancelled .* url=\//, /email question -> url=\/settings/, /conversation turns kept=4/,
  /context note on video studio=true/, /asks name=true .*launcherAside=1/, /solutions chosen=2 overflow=0/,
  /instruction has company=true problem=true/, /solutions shown=true&true; overflow=0/, /pageerrors=\[\]/,
];
let failed = 0;
for (const w of [390, 1280]) for (const re of want) {
  const hit = out.some(l => l.startsWith(`${w}:`) && re.test(l));
  if (!hit) failed++;
  console.log(`${hit ? 'PASS' : 'FAIL'}  ${w}px ${re}`);
}
if (failed) process.exit(1);
