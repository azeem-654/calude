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

await b.close();
console.log(fail ? `\n${fail} failed` : '\nAll passed');
process.exit(fail ? 1 : 0);
