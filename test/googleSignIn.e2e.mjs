/**
 * Sign in with Google gets past its own browser check.
 *
 * Needs a fresh database (it creates the install owner, to connect Google) and
 * a Worker told that localhost is the sign-in address:
 *
 *   VITE_BASE=/ npm run build
 *   npx wrangler d1 migrations apply crmpro --local --persist-to /tmp/pc-google
 *   npx wrangler dev --local --persist-to /tmp/pc-google --var APP_ORIGIN:http://localhost:8787
 *   npm run test:google
 *
 * ── What broke ──
 *
 * The callback refuses an answer unless the state it carries is the one this
 * tab remembered in sessionStorage when it set off. installTenantStorage()
 * patches Storage.prototype, and its fallthrough for sessionStorage called the
 * patched method again: every read and write recursed until the stack ran out,
 * the try/catch around them swallowed it, and every Google sign-in on live
 * ended at "That sign-in was not started from this browser".
 *
 * Google itself is stubbed at the browser: the authorize address is answered
 * with the redirect Google would send. The code is fake, so the Worker's swap
 * with Google fails — which is the point to reach. Getting there proves the
 * browser check passed and the server accepted its own state.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const B = process.env.BASE ?? 'http://localhost:8787';
let fail = 0;
const ok = (name, cond, detail = '') => { if (!cond) fail++; console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ` — ${detail}`}`); };
const api = (body) => fetch(`${B}/api/auth.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());

const NOT_OURS = 'not started from this browser';

/* Connect Google the way the owner would. */
const owner = await api({ action: 'bootstrap', email: `owner-${Date.now()}@example.test`, name: 'Owner', password: 'Correct-horse-9' });
if (!owner.success) { console.log('bootstrap failed — this needs a fresh database', owner); process.exit(1); }
const saved = await api({ action: 'google_save', token: owner.token, clientId: 'e2e-test.apps.googleusercontent.com', clientSecret: 'e2e-secret' });
if (!saved.success) { console.log('google_save failed', saved); process.exit(1); }

const b = await pw.chromium.launch();

/** Answer Google's authorize page with the redirect Google would send. */
const fakeGoogle = async (ctx, seen) => {
  await ctx.route('https://accounts.google.com/**', route => {
    const u = new URL(route.request().url());
    seen.state = u.searchParams.get('state') ?? '';
    seen.redirect = u.searchParams.get('redirect_uri') ?? '';
    seen.hint = u.searchParams.get('login_hint') ?? '';
    seen.prompt = u.searchParams.get('prompt') ?? '';
    route.fulfill({ status: 302, headers: { location: `${seen.redirect}?code=e2e-fake-code&state=${encodeURIComponent(seen.state)}&scope=email` } });
  });
};

/* 1 · sessionStorage works once the tenant patch is installed. */
{
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${B}/login`, { waitUntil: 'networkidle' });
  const r = await p.evaluate(() => {
    try {
      sessionStorage.setItem('crm_probe', 'x');
      const v = sessionStorage.getItem('crm_probe');
      sessionStorage.removeItem('crm_probe');
      return { v, after: sessionStorage.getItem('crm_probe') };
    } catch (e) { return { error: String(e) }; }
  });
  ok('sessionStorage reads, writes and removes', r.v === 'x' && r.after === null, JSON.stringify(r));
  const scoped = await p.evaluate(() => {
    const a = localStorage.getItem('crm_active_account');
    localStorage.setItem('crm_probe', 'y');
    const raw = Object.keys(localStorage).filter(k => k.endsWith('_crm_probe'));
    localStorage.removeItem('crm_probe');
    return { a, raw };
  });
  ok('localStorage is still scoped to the workspace', !!scoped.a && scoped.raw.includes(`crm_acct_${scoped.a}_crm_probe`), JSON.stringify(scoped));
  ok('no page errors', !errs.length, errs.join(' | '));
  await ctx.close();
}

/* 2 · The round trip, as a person makes it. */
let strayUrl = '';
{
  const ctx = await b.newContext();
  const seen = {};
  await fakeGoogle(ctx, seen);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${B}/login`, { waitUntil: 'networkidle' });
  const btn = p.getByRole('button', { name: /Continue with Google/ });
  ok('the Google button is offered', await btn.count() > 0);
  const finish = p.waitForResponse(r => r.url().includes('/api/auth.php') && r.request().postData()?.includes('google_finish'), { timeout: 15000 }).catch(() => null);
  await btn.click();
  await p.waitForURL(/\/auth\/google\?/, { timeout: 15000 });
  ok('Google is sent back to this app', seen.redirect === `${B}/auth/google`, seen.redirect);
  ok('with no account named, Google shows its chooser', seen.prompt === 'select_account' && !seen.hint, JSON.stringify(seen));
  const res = await finish;
  ok('the callback hands the code to the server', !!res, 'google_finish was never called');
  const body = res ? await res.json() : {};
  await p.waitForTimeout(500);
  const text = await p.locator('body').innerText();
  ok('it is not refused as "not started from this browser"', !text.includes(NOT_OURS), text.slice(0, 200));
  ok('the server accepts its own state and goes on to ask Google',
    !/took too long or did not start here/.test(String(body.error ?? '')), String(body.error));
  ok('no page errors', !errs.length, errs.join(' | '));
  strayUrl = `${B}/auth/google?code=e2e-fake-code&state=${encodeURIComponent(seen.state)}`;
  await ctx.close();
}

/* 3 · The check still refuses what it is there to refuse: a genuine, signed
      state that this browser never set off with — the shape of somebody
      mailing you a link that signs you into their account. */
{
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  let called = false;
  p.on('request', r => { if (r.postData()?.includes('google_finish')) called = true; });
  await p.goto(strayUrl, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  ok('a sign-in started elsewhere is refused', (await p.locator('body').innerText()).includes(NOT_OURS));
  ok('…before the code is sent anywhere', !called);
  await ctx.close();
}

/* 4 · "Continue as …": the account this browser used last is offered, and
      pressing it names that account to Google instead of the chooser. */
{
  const ctx = await b.newContext();
  await ctx.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('pc_last_signin', JSON.stringify({ email: 'azeem@example.test', name: 'Azeem', method: 'google' }));
      sessionStorage.setItem('seeded', '1');
    }
  });
  const seen = {};
  await fakeGoogle(ctx, seen);
  const p = await ctx.newPage();
  await p.goto(`${B}/login`, { waitUntil: 'networkidle' });
  const last = p.getByRole('button', { name: /Continue as Azeem/ });
  ok('the last account is offered by name', await last.count() > 0);
  await last.click();
  await p.waitForURL(/\/auth\/google\?/, { timeout: 15000 }).catch(() => {});
  ok('Google is told which account', seen.hint === 'azeem@example.test' && !seen.prompt, JSON.stringify(seen));
  await ctx.close();

  /* A hint that is not an address is dropped, and the chooser comes back. */
  const r = await api({ action: 'google_start', hint: 'not an address' });
  const u = new URL(r.url);
  ok('a malformed hint is ignored', !u.searchParams.get('login_hint') && u.searchParams.get('prompt') === 'select_account', r.url);
}

await b.close();
console.log(fail ? `\n${fail} failed` : '\nall passed');
process.exit(fail ? 1 : 0);
