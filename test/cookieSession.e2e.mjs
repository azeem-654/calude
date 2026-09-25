/**
 * The session lives in an HttpOnly cookie, not in page storage.
 *
 *   VITE_BASE=/ npm run build && npx wrangler dev --local   (then)
 *   node test/cookieSession.e2e.mjs
 *
 * Checks what the change is for — a script on the page cannot read the
 * token — and that nothing broke: signing in works, the app's API calls work
 * on the cookie alone, an old stored token is moved onto the cookie, logout
 * ends it, and another site cannot use it.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { execSync } from 'node:child_process';

const B = process.env.BASE ?? 'http://localhost:8787';
let fail = 0;
const ok = (name, cond, detail = '') => { if (!cond) fail++; console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ` — ${detail}`}`); };
execSync('npx wrangler d1 execute crmpro --local --command "DELETE FROM crm_signup_attempts; DELETE FROM crm_rate_limits WHERE bucket LIKE \'login%\'"', { stdio: 'ignore' });

const email = `cookie-${Date.now()}@example.test`;
const pw1 = 'Correct-horse-9';
/* An account, made the way scripts make one (they still get the token). */
const reg = await fetch(`${B}/api/auth.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'register', email, name: 'Cookie Test', password: pw1 }) }).then(r => r.json());
if (!reg.success) { console.log('register failed', reg); process.exit(1); }

const b = await pw.chromium.launch();

/* 1 · Signing in through the page. */
{
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  await p.goto(`${B}/login`, { waitUntil: 'networkidle' });
  const res = await p.evaluate(async ([e, pwd]) => {
    const r = await fetch('/api/auth.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', email: e, password: pwd }) });
    return r.json();
  }, [email, pw1]);
  ok('password sign-in answers', res.success, JSON.stringify(res).slice(0, 120));
  const cookies = await ctx.cookies();
  const c = cookies.find(x => x.name === 'pc_session');
  ok('the session cookie is set', !!c);
  ok('…HttpOnly', c?.httpOnly === true);
  ok('…SameSite=Lax', c?.sameSite === 'Lax');
  ok('a page script cannot read it', !(await p.evaluate(() => document.cookie)).includes('pc_session'));

  const me = await p.evaluate(async () => (await fetch('/api/auth.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'me', token: 'cookie' }) })).json());
  ok('an API call with only the placeholder is signed in', me.success && me.user?.email, JSON.stringify(me));

  const out = await p.evaluate(async () => (await fetch('/api/auth.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout', token: 'cookie' }) })).json());
  const after = await p.evaluate(async () => (await fetch('/api/auth.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'me', token: 'cookie' }) })).json());
  ok('logout ends the session and clears the cookie', out.success && !after.success && !(await ctx.cookies()).some(x => x.name === 'pc_session' && x.value), JSON.stringify(after));
  await ctx.close();
}

/* 2 · A browser signed in the old way is moved onto the cookie. */
{
  const fresh = await fetch(`${B}/api/auth.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', email, password: pw1 }) }).then(r => r.json());
  const ctx = await b.newContext();
  await ctx.addInitScript(([t, a, e]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('crm_session', JSON.stringify({ token: t, backend: 'php', user: { email: e, name: 'Cookie Test', role: 'agency', accountId: a } }));
    localStorage.setItem('crm_active_account', a);
    localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: a, name: 'Cookie Co', plan: 'agency', status: 'active', price: 0 }]));
  }, [fresh.token, fresh.user.accountId, email]);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${B}/settings?tab=security`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('crm_session') || '{}').token);
  ok('the stored token is replaced by the placeholder', stored === 'cookie', String(stored).slice(0, 8));
  ok('and the cookie now carries the session', (await ctx.cookies()).some(x => x.name === 'pc_session' && x.value === fresh.token));
  await p.reload({ waitUntil: 'networkidle' });
  await p.getByText('Protected Workspace').waitFor({ timeout: 10000 }).catch(() => {});
  ok('the app works on the cookie alone after a reload', await p.getByText('Signed-in devices').count() > 0);
  ok('no page errors', !errs.length, errs.join(' | '));

  /* 3 · Another site cannot use it. The request is made as if from elsewhere. */
  const cross = await p.evaluate(async () => {
    const r = await fetch('/api/auth.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'me', token: 'cookie' }) });
    return r.status;
  });
  ok('same-site request still works (control)', cross === 200, String(cross));
  const raw = await fetch(`${B}/api/auth.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', Cookie: `pc_session=${fresh.token}` },
    body: JSON.stringify({ action: 'me', token: 'cookie' }),
  }).then(r => r.json());
  ok('a request from another origin is not signed in by the cookie', !raw.success, JSON.stringify(raw));
  await ctx.close();
}

/* 4 · Signing up through the form keeps you signed in — across a reload and
   a browser closed and opened again. */
{
  execSync('npx wrangler d1 execute crmpro --local --command "DELETE FROM crm_signup_attempts"', { stdio: 'ignore' });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const signupEmail = `stay-${Date.now()}@example.test`;
  await p.goto(`${B}/login`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Create one' }).click();
  await p.locator('input[placeholder="Your name"]').fill('Stay Signedin');
  await p.locator('input[placeholder="Email address"]').fill(signupEmail);
  await p.locator('input[placeholder="Password"]').fill(pw1);
  await p.locator('input[placeholder="Confirm password"]').fill(pw1);
  const consent = p.locator('input[type=checkbox]');
  if (await consent.count()) await consent.first().check();
  await p.getByRole('button', { name: /^(Continue|Create account)/ }).click();
  await p.waitForTimeout(2500);
  const inApp = async (page) => (await page.locator('input[placeholder="Password"]').count()) === 0 && (await page.getByText(/Dashboard|AI Autopilot/).count()) > 0;
  ok('signed up and in the app', await inApp(p));
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  ok('still signed in after a reload', await inApp(p));
  const state = await ctx.storageState();
  await ctx.close();
  const again = await b.newContext({ viewport: { width: 1280, height: 900 }, storageState: state });
  const p2 = await again.newPage();
  await p2.goto(`${B}/`, { waitUntil: 'networkidle' }); await p2.waitForTimeout(1500);
  ok('still signed in after closing and reopening the browser', await inApp(p2));
  ok('the cookie is kept for longer than the session (the server decides)', (state.cookies.find(c => c.name === 'pc_session')?.expires ?? 0) > Date.now() / 1000 + 300 * 86400);

  /* 5 · A session in use is renewed. */
  const q = sql => JSON.parse(execSync(`npx wrangler d1 execute crmpro --local --json --command ${JSON.stringify(sql)}`, { encoding: 'utf8' }))[0].results;
  const soon = Math.floor(Date.now() / 1000) + 2 * 86400;
  q(`UPDATE crm_sessions SET expires_at = ${soon} WHERE email = '${signupEmail}'`);
  await p2.evaluate(async () => { await fetch('/api/auth.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'me', token: 'cookie' }) }); });
  const exp = q(`SELECT MAX(expires_at) AS e FROM crm_sessions WHERE email = '${signupEmail}'`)[0].e;
  ok('a session in use is pushed back out to 30 days', exp > Date.now() / 1000 + 29 * 86400, String(exp - Date.now() / 1000));

  /* 6 · A session the server ended goes to sign-in, and says why. */
  q(`DELETE FROM crm_sessions WHERE email = '${signupEmail}'`);
  await p2.reload({ waitUntil: 'networkidle' }); await p2.waitForTimeout(2000);
  ok('an ended session returns to the sign-in screen', (await p2.locator('input[placeholder="Password"]').count()) > 0);
  ok('…with the reason', (await p2.getByText(/Your session ended/).count()) > 0);
  await again.close();
}

await b.close();
console.log(fail ? `\n${fail} failed` : '\nAll passed');
process.exit(fail ? 1 : 0);
