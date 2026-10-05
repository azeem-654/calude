/**
 * The web app inside the phone apps (src/services/nativeApp.ts), and the
 * phones' push registration (/api/push.php), against the real Worker.
 *
 *   VITE_BASE=/ npm run build
 *   npx wrangler dev --local --port 8787 --persist-to <empty dir>   (a fresh D1)
 *   BASE=http://localhost:8787 npm run test:nativeapp
 *
 * The apps are told apart only by the user agent they append
 * (mobile/<app>/capacitor.config.json), so a browser with that user agent is
 * the app as far as the page can tell — which is what is checked:
 *  - the support app opens on the inbox, the customer app on the dashboard;
 *  - neither offers to sell a plan (the stores' billing rules), the browser does;
 *  - a phone registers for its workspace, and not for somebody else's;
 *  - with no Firebase in the Android build ("; push" absent) the page never
 *    asks the plugin, which would crash the app.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const B = process.env.BASE ?? 'http://localhost:8787';
if (!/localhost|127\.0\.0\.1/.test(B)) throw new Error('Local only.');
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c ? '' : ` — ${String(d).slice(0, 400)}`}`); };
const api = (path, body) => fetch(`${B}/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close' }, body: JSON.stringify(body) }).then(r => r.json());

async function register(tag) {
  /* Two sign-ups, under the five-an-hour limit: no need to clear it with
     `wrangler d1 execute`, which stalls a running `wrangler dev`. */
  const email = `app-${tag}-${Date.now()}@test.dev`;
  const r = await api('auth.php', { action: 'register', email, password: 'Sup3rSecret!23', name: 'Tester', businessName: 'Pike Plumbing' });
  if (!r.success) throw new Error(`register: ${r.error}`);
  return { token: r.token, acct: r.user.accountId, email };
}

const A = await register('a');
const Bb = await register('b');
const br = await pw.chromium.launch();
const base = (await (await br.newContext()).newPage().then(async p => { const ua = await p.evaluate(() => navigator.userAgent); await p.context().close(); return ua; }));

async function open(ua, s = A) {
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, userAgent: ua, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([t, a, e]) => {
    localStorage.setItem('crm_session', JSON.stringify({ token: t, backend: 'php', user: { email: e, name: 'T', role: 'agency', accountId: a } }));
    localStorage.setItem('crm_active_account', a);
    localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: a, name: 'Pike Plumbing', plan: 'agency', status: 'active', price: 0 }]));
    /* Stand in for Capacitor's bridge, to see whether the page asks it anything. */
    window.__pushCalls = [];
    window.Capacitor = { Plugins: { PushNotifications: {
      checkPermissions: async () => { window.__pushCalls.push('check'); return { receive: 'granted' }; },
      requestPermissions: async () => ({ receive: 'granted' }),
      register: async () => { window.__pushCalls.push('register'); setTimeout(() => window.__fire?.('registration', { value: 'fcm-test-token-0123456789abcdef' }), 50); },
      addListener: async (ev, cb) => { const prev = window.__fire; window.__fire = (e, x) => { if (e === ev) cb(x); prev?.(e, x); }; return { remove() {} }; },
      createChannel: async () => {},
    } } };
  }, [s.token, s.acct, s.email]);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  /* Leave the page before closing: a context closed with polls in flight
     takes `wrangler dev`'s local proxy down with it. */
  const done = async () => { await page.goto('about:blank').catch(() => {}); await page.waitForTimeout(400); await ctx.close(); };
  return { ctx, page, errs, done };
}

/* ── The support app opens on the inbox and registers the phone ── */
{
  const { page, errs, done } = await open(`${base} ProtectedCentralApp/1.0 (support; android; push)`);
  await page.goto(`${B}/`, { waitUntil: 'networkidle' });
  await page.waitForURL(/\/engagement\?tab=inbox/, { timeout: 10_000 }).catch(() => {});
  ok('the support app opens on the inbox', /\/engagement\?tab=inbox/.test(page.url()), page.url());
  await page.waitForFunction(() => window.__pushCalls.includes('register'), null, { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(800);
  const st = await api('push.php', { action: 'status', token: A.token, accountId: A.acct });
  ok('…asks for alert permission and registers this phone for the workspace', st.success && st.devices === 1, JSON.stringify(st));
  ok('no page errors (support app)', errs.length === 0, errs.join(' | '));
  await done();
}

/* ── No Firebase in the Android build: the plugin is never touched ── */
{
  const { page, done } = await open(`${base} ProtectedCentralApp/1.0 (customer; android)`);
  await page.goto(`${B}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  ok('the customer app opens on the dashboard, not the inbox', !/engagement/.test(page.url()), page.url());
  ok('without "; push" the page never calls the push plugin (it would crash the app)', (await page.evaluate(() => window.__pushCalls.length)) === 0);
  await done();
}

/* ── Plans are not sold in the apps, and are in the browser ── */
for (const [who, ua, sells] of [['iPhone app', `${base} ProtectedCentralApp/1.0 (customer; ios; push)`, false], ['browser', base, true]]) {
  const { page, done } = await open(ua);
  await page.goto(`${B}/billing`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const body = await page.innerText('body');
  const buttons = await page.getByRole('button', { name: /^Choose (Starter|Pro|Agency|Growth|Business)/ }).count();
  if (sells) ok(`the ${who} offers plans`, buttons > 0 || /Choose a plan/.test(body), body.slice(0, 300));
  else ok(`the ${who} offers no plan and says so`, buttons === 0 && !/Choose a plan/.test(body) && /not available in the app/.test(body), body.slice(0, 400));
  await done();
}

/* ── The route: a phone is filed under a workspace its user may open, and no other ── */
{
  const foreign = await api('push.php', { action: 'register', token: Bb.token, accountId: A.acct, deviceToken: 'fcm-foreign-token-0123456789', platform: 'android', app: 'support' });
  ok('a phone cannot register for another workspace', !foreign.success && /not yours|workspace/i.test(foreign.error ?? ''), JSON.stringify(foreign));
  const bad = await api('push.php', { action: 'register', token: A.token, accountId: A.acct, deviceToken: 'not a token!', platform: 'android', app: 'support' });
  ok('a malformed token is refused', !bad.success, JSON.stringify(bad));
  const anon = await api('push.php', { action: 'status', accountId: A.acct });
  ok('without a session, nothing', !anon.success && anon.code === 'unauthorised', JSON.stringify(anon));
  await api('push.php', { action: 'unregister', token: Bb.token, deviceToken: 'fcm-test-token-0123456789abcdef' });
  const still = await api('push.php', { action: 'status', token: A.token, accountId: A.acct });
  ok('somebody else cannot unregister your phone', still.devices === 1, JSON.stringify(still));
  await api('push.php', { action: 'unregister', token: A.token, deviceToken: 'fcm-test-token-0123456789abcdef' });
  const gone = await api('push.php', { action: 'status', token: A.token, accountId: A.acct });
  ok('signing out on the phone removes it', gone.devices === 0, JSON.stringify(gone));
}

await br.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
