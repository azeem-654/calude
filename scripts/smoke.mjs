/**
 * The check that would have caught the two worst bugs in this codebase.
 *
 * Both were invisible to `npm run typecheck`, both shipped, and both sat in
 * production for weeks: signing in on a second device showed an empty
 * workspace, because the sync read a field the server has never returned and
 * called it a success. The other, the same symptom from a different cause, was
 * the owner's browser inventing a workspace id because the install owner has
 * no `account_id`.
 *
 * Nothing that compiles could have found either. What finds them is doing what
 * a customer does — sign up, put real work in, close the browser, come back —
 * and then asserting the work is still there. That is all this does.
 *
 * ── Running it ──
 *
 *   VITE_BASE=/ npm run build
 *   npx wrangler dev --local --port 8787      # in another shell
 *   npm run smoke
 *
 * It drives the real Worker against a real D1, so the API is exercised too.
 * Exits non-zero on the first failure, and says which one, so it can be wired
 * into CI later — that is deliberately not done here, because it needs a
 * running Worker and a browser and would roughly triple the deploy time.
 *
 * ── Two traps, learned the hard way, that this file already avoids ──
 *
 *  - **Scope every locator to the dialog.** The nav rail behind the onboarding
 *    overlay has buttons called "Email" and "Social" too. Playwright finds
 *    those happily and then times out trying to click through the backdrop.
 *  - **A button's accessible name is all of its text.** The channel buttons
 *    read "Blog / SEO Blog automation", so an exact match on the visible label
 *    finds nothing at all. Match loosely, or on the first line only.
 */
/**
 * Playwright is not a dependency of this project, on purpose — it and its
 * browsers are hundreds of megabytes that every `npm install` would pay for so
 * that one script can run. On this machine it is installed globally, which is
 * the import `CLAUDE.md` documents. Both are tried, so the script works
 * wherever it is and says which it used.
 */
const CANDIDATES = [
  process.env.SMOKE_PLAYWRIGHT,
  'playwright',
  '/opt/node22/lib/node_modules/playwright/index.js',
].filter(Boolean);

let chromium;
for (const spec of CANDIDATES) {
  try {
    const mod = await import(spec);
    /* A globally installed Playwright resolves as CommonJS, so everything is
       under `default`; a project dependency gives named exports. Reading both
       is the difference between this working and reporting, wrongly, that
       Playwright is not installed. */
    chromium = mod.chromium ?? mod.default?.chromium;
    if (chromium) break;
  } catch { /* try the next candidate */ }
}
if (!chromium) {
  console.error('Playwright could not be found. Install it (npm i -D playwright) or set');
  console.error('SMOKE_PLAYWRIGHT to the path of its index.js.');
  process.exit(2);
}

const BASE = process.env.SMOKE_BASE ?? 'http://127.0.0.1:8787';
const CHROME = process.env.SMOKE_CHROME ?? undefined;
const EMAIL = `smoke${Date.now()}@example.com`;
const PASSWORD = 'smoke-testing-4471';
const COMPANY = 'Pike Plumbing & Heating';

let failures = 0;
const ok = (name, pass, detail = '') => {
  if (!pass) failures++;
  console.log(`${pass ? '  ok  ' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const step = name => console.log(`\n${name}`);

/** Everything the page complained about, so a failure names the cause. */
const watch = page => {
  const errs = [];
  page.on('pageerror', e => errs.push(`pageerror: ${e.message}`));
  page.on('response', r => {
    /* Fonts and favicons are blocked in sandboxes and are not this test's
       business. An API refusing us is. */
    if (r.status() >= 400 && r.url().includes('/api/')) errs.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  return errs;
};

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

try {
  /* ── 1. Sign up ────────────────────────────────────────────────────────── */
  step('Signing up as somebody who has never used this');
  const first = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await first.newPage();
  const errs = watch(p);

  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Create one' }).click();
  await p.waitForTimeout(400);
  await p.locator('input[placeholder="Your name"]').fill('Dave Pike');
  await p.locator('input[placeholder="Email address"]').fill(EMAIL);
  await p.locator('input[placeholder="Password"]').fill(PASSWORD);
  await p.locator('input[placeholder="Confirm password"]').fill(PASSWORD);
  const consent = p.locator('input[type=checkbox]');
  if (await consent.count()) await consent.first().check();
  await p.getByRole('button', { name: 'Create account' }).click();
  await p.waitForTimeout(2500);

  const screen = await p.evaluate(() => document.body.innerText);
  if (/Too many accounts have been created/.test(screen)) {
    /* The signup rate limit is a real feature doing its job. Say so plainly
       rather than reporting a mysterious failure six assertions later. */
    console.log('\n  Signup is rate-limited from this address — the limit is per hour and per IP.');
    console.log('  Locally: npx wrangler d1 execute crmpro --local --command "DELETE FROM crm_signup_attempts"');
    process.exit(2);
  }

  const workspace = await p.evaluate(() => localStorage.getItem('crm_active_account'));
  ok('signed up and got a workspace', !!workspace && !workspace.startsWith('acct-'),
    workspace ?? 'none — the browser invented one, or signup failed');

  /* ── 2. Put real work in ───────────────────────────────────────────────── */
  step('Filling in the company portfolio');
  await p.getByRole('button', { name: 'Add your details' }).click();
  await p.waitForTimeout(800);
  const dlg = p.locator('[role=dialog][aria-label="Company onboarding"]');
  await dlg.locator('input[placeholder="Acme Fitness Studio"]').fill(COMPANY);
  await dlg.locator('textarea').nth(0).fill('Emergency plumbing, boiler servicing and bathroom installation across Leeds.');
  await dlg.locator('textarea').nth(1).fill('Homeowners in Leeds with a boiler that has stopped working, and landlords needing gas safety checks.');
  await dlg.locator('select').first().selectOption('Home Services');
  await dlg.getByRole('button', { name: 'Continue' }).click();
  await p.waitForTimeout(1500);

  const saved = await p.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!/onboarding/.test(k)) continue;
      try { return JSON.parse(localStorage.getItem(k)).profile?.companyName ?? ''; } catch { return ''; }
    }
    return '';
  });
  ok('the portfolio saved', saved === COMPANY, saved || 'nothing stored');

  /* Give the debounced push time to reach the server before we throw the
     browser away — this is a sync test, and racing it proves nothing. */
  await p.waitForTimeout(2500);
  await first.close();

  /* ── 3. Come back on a clean browser ───────────────────────────────────── */
  step('Signing back in on a browser that has never seen this account');
  const second = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const q = await second.newPage();
  const errs2 = watch(q);

  await q.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await q.locator('input[placeholder="Email or username"]').fill(EMAIL);
  await q.locator('input[placeholder="Password"]').fill(PASSWORD);
  await q.getByRole('button', { name: 'Sign in' }).click();
  await q.waitForTimeout(6000);

  const back = await q.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!/onboarding/.test(k)) continue;
      try { return JSON.parse(localStorage.getItem(k)).profile?.companyName ?? ''; } catch { return ''; }
    }
    return '';
  });
  /* The assertion this whole file exists for. */
  ok('THE WORKSPACE CAME BACK', back === COMPANY,
    back ? `got "${back}"` : 'the workspace was empty — the sync pulled nothing');

  ok('and it is on cloud sync, not local-only',
    (await q.evaluate(() => localStorage.getItem('crm_cloud_status'))) === 'cloud');

  const activeAgain = await q.evaluate(() => localStorage.getItem('crm_active_account'));
  ok('pointing at the same workspace, not an invented one', activeAgain === workspace,
    `${activeAgain} vs ${workspace}`);

  /* ── 4. The page itself ────────────────────────────────────────────────── */
  step('Checking the page holds together');
  for (const width of [390, 1280]) {
    await q.setViewportSize({ width, height: 900 });
    await q.waitForTimeout(600);
    const overflow = await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`no horizontal overflow at ${width}px`, overflow <= 0, `${overflow}px`);
  }
  ok('no page errors and no API refusals', errs.length === 0 && errs2.length === 0,
    [...errs, ...errs2].slice(0, 4).join(' | '));

  await second.close();
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
