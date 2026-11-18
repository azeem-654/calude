/**
 * White-label, end to end: a reseller names and brands their workspace, claims
 * `<name>.protectedcentral.com`, and a client arriving there — in a browser that
 * has never seen the reseller — is greeted by the reseller's name, logo and
 * headline, not ours. Then the reseller changes the branding and the address
 * catches up; and nobody else can take, read past or remove that address.
 *
 *   npx wrangler dev --local --port 8799 --persist-to <empty dir> --var APP_ORIGIN:http://localhost:8799
 *   BASE=http://localhost:8799 PERSIST=<that dir> node test/whiteLabel.e2e.mjs
 *
 * The branded address is a real hostname in the browser: Chromium is told to
 * resolve `*.protectedcentral.com` to 127.0.0.1, so `location.hostname` is what
 * a client would have and hosts.ts decides exactly as it would on live.
 */
import { execSync } from 'node:child_process';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const B = process.env.BASE ?? 'http://localhost:8799';
const PORT = new URL(B).port || '80';
const persist = process.env.PERSIST ? ` --persist-to ${process.env.PERSIST}` : '';
let fail = 0;
const ok = (name, cond, detail = '') => { if (!cond) fail++; console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ` — ${detail}`}`); };
let ipN = 1;
const api = (path, body) => fetch(`${B}/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.9.7.${ipN++ % 250}` }, body: JSON.stringify(body) }).then(r => r.json().catch(() => ({})));
const sql = (q) => JSON.parse(execSync(`npx wrangler d1 execute crmpro --local${persist} --json --command ${JSON.stringify(q)}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;

/* A real 64×64 PNG, so the logo is well over the few hundred characters a
   careless column would keep, and an <img> can prove it decoded. */
const browser = await pw.chromium.launch({ args: ['--host-resolver-rules=MAP *.protectedcentral.com 127.0.0.1'] });
const LOGO = await (async () => {
  const p = await browser.newPage();
  const url = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#e11d48'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#fff'; g.font = 'bold 34px sans-serif'; g.fillText('A', 18, 45); for (let i = 0; i < 400; i++) { g.fillStyle = `rgb(${i % 255},${(i * 7) % 255},${(i * 13) % 255})`; g.fillRect(i % 64, (i * 3) % 64, 1, 1); } return c.toDataURL('image/png'); });
  await p.close();
  return url;
})();

console.log('\nWhite-label: a reseller\'s own name and address');
const boot = await api('auth.php', { action: 'bootstrap', email: 'owner@wl.test', password: 'Tq9!vX2#pLm7wZ-wl', name: 'Owner' });
if (!boot.success) { console.log('bootstrap failed — needs a fresh database', boot); process.exit(2); }
const PASS = 'Another-horse-7x';
const signup = async (email, name) => { const r = await api('auth.php', { action: 'register', email, password: PASS, name }); return r.token ? r : api('auth.php', { action: 'login', email, password: PASS }); };
const ann = await signup('ann@acme.test', 'Ann Acme');
const bob = await signup('bob@other.test', 'Bob Other');
ok('two resellers can sign up', !!ann.token && !!bob.token, JSON.stringify([ann.error, bob.error]));

async function signIn(page, base, email) {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email or username').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASS);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(3000);
}

/* ── Ann brands her workspace and claims her address, on the screens ── */
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const pa = await ctxA.newPage();
const errs = []; pa.on('pageerror', e => errs.push(String(e)));
await signIn(pa, B, 'ann@acme.test');
await pa.goto(`${B}/settings?tab=branding`, { waitUntil: 'networkidle' });
await pa.waitForTimeout(800);
const nameBox = pa.locator('#brand-name');
ok('Settings → Branding opens', await nameBox.isVisible().catch(() => false));
await nameBox.fill('Acme Growth');
await pa.locator('input[type=file]').first().setInputFiles({ name: 'acme.png', mimeType: 'image/png', buffer: Buffer.from(LOGO.split(',')[1], 'base64') });
await pa.waitForTimeout(400);
const headlineBox = pa.locator('#brand-headline');
if (await headlineBox.count()) await headlineBox.fill('Welcome to Acme Growth — sign in');
await pa.getByRole('button', { name: /^Save/ }).first().click();
await pa.waitForTimeout(800);

const slugBox = pa.getByPlaceholder(/yourname|your-name|agency/i).first();
ok('the address box is on the same screen', await slugBox.isVisible().catch(() => false));
await slugBox.fill('acme-growth');
await pa.getByRole('button', { name: /claim|get (this|my) address|use this/i }).first().click();
await pa.waitForTimeout(1500);
ok('…the claimed address is listed as live', await pa.getByText('acme-growth.protectedcentral.com').first().isVisible().catch(() => false));
let row = sql("SELECT account_id, kind, status FROM crm_custom_domains WHERE hostname = 'acme-growth.protectedcentral.com'")[0];
ok('…stored as Ann\'s, active at once', row?.status === 'active' && row.kind === 'subdomain', JSON.stringify(row));
let brandRow = sql("SELECT app_name, length(logo_url) AS n, substr(logo_url, -8) AS tail, login_headline FROM crm_domain_branding WHERE hostname = 'acme-growth.protectedcentral.com'")[0];
ok('…with her name copied for the sign-in page', brandRow?.app_name === 'Acme Growth', JSON.stringify(brandRow));
ok('…and her whole logo, not a clipped one', brandRow?.n > 600 && /=*$/.test(brandRow.tail) && brandRow.n === sql("SELECT length(logo_url) AS n FROM crm_workspace_branding")[0]?.n, JSON.stringify(brandRow));

/* ── A client arrives at the address in a browser that has never seen Ann ── */
const HOST = `http://acme-growth.protectedcentral.com:${PORT}`;
async function visit(label, expectName) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(`${HOST}/login`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const body = await p.locator('body').innerText();
  const title = await p.title();
  const img = p.locator('.au-brand img');
  const decoded = await img.count() ? await img.evaluate(i => i.complete && i.naturalWidth > 0) : false;
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(`${label}: the tab says ${expectName}`, title.includes(expectName), title);
  ok(`${label}: her logo is drawn and decodes`, decoded);
  ok(`${label}: our name appears nowhere on her sign-in page`, !/Protected\s*Central/i.test(body + title), body.match(/.{0,40}Protected\s*Central.{0,40}/i)?.[0] ?? title);
  ok(`${label}: no sign-up for one of our trials on her address`, !/Create one/.test(body), 'Create one shown');
  ok(`${label}: no sideways scroll at 390, no page errors`, !overflow && !perr.length, perr.join(' | '));
  await ctx.close();
  return body;
}
const first = await visit('first visit', 'Acme Growth');
ok('first visit: her headline is the greeting', /Acme Growth/.test(first), first.slice(0, 200));
for (const path of ['/pricing', '/appsumo', '/security', '/']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${HOST}${path}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  const t = await p.locator('body').innerText();
  ok(`${path} on her address is her sign-in, not our page`, !/Protected\s*Central/i.test(t) && await p.getByLabel('Password', { exact: true }).isVisible().catch(() => false), t.slice(0, 120));
  await ctx.close();
}

/* ── Ann renames; the address must catch up without her re-claiming it ── */
await pa.goto(`${B}/settings?tab=branding`, { waitUntil: 'networkidle' });
await pa.waitForTimeout(600);
await pa.locator('#brand-name').fill('Acme Two');
if (await pa.locator('#brand-headline').count()) await pa.locator('#brand-headline').fill('Acme Two client sign-in');
await pa.getByRole('button', { name: /^Save/ }).first().click();
await pa.waitForTimeout(1500);
brandRow = sql("SELECT app_name FROM crm_domain_branding WHERE hostname = 'acme-growth.protectedcentral.com'")[0];
ok('a rename reaches the address\'s sign-in copy', brandRow?.app_name === 'Acme Two', JSON.stringify(brandRow));
await visit('after the rename', 'Acme Two');

/* ── Ann, signed in at her own address, sees her name in the app ── */
const ctxC = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const pc = await ctxC.newPage();
const cerr = []; pc.on('pageerror', e => cerr.push(String(e)));
await signIn(pc, HOST, 'ann@acme.test');
const inApp = await pc.locator('body').innerText();
ok('signed in at her address: the app opens, not the sign-in form', !(await pc.getByLabel('Password', { exact: true }).isVisible().catch(() => false)));
ok('…and her name is on the top bar', /Acme Two/.test(inApp), inApp.slice(0, 200));
ok('…without page errors', !cerr.length, cerr.join(' | '));
await ctxC.close();

/* ── A second device of Ann's, at the product's own address, shows her name too ── */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await signIn(p, B, 'ann@acme.test');
  const nav = p.locator('.nav-logo');
  ok('a second device shows her brand on the top bar', (await nav.getAttribute('title').catch(() => '')) === 'Acme Two', await nav.getAttribute('title').catch(() => 'no nav'));
  await ctx.close();
}

/* ── Nobody else can take, remove or read past it ── */
const annWs = sql("SELECT account_id AS id FROM crm_workspaces WHERE owner_email = 'ann@acme.test' ORDER BY created_at LIMIT 1")[0]?.id;
const bobWs = sql("SELECT account_id AS id FROM crm_workspaces WHERE owner_email = 'bob@other.test' ORDER BY created_at LIMIT 1")[0]?.id;
ok('each reseller has a workspace on the server', !!annWs && !!bobWs, JSON.stringify([annWs, bobWs]));
let r = await api('whitelabel.php', { token: bob.token, accountId: annWs, action: 'save_branding', branding: { appName: 'Hijacked' } });
ok('Bob cannot write Ann\'s branding', !r.success && sql(`SELECT app_name FROM crm_workspace_branding WHERE account_id = '${annWs}'`)[0]?.app_name === 'Acme Two', JSON.stringify(r));
r = await api('whitelabel.php', { token: ann.token, accountId: annWs, action: 'save_branding', branding: { appName: 'Acme Two', logoUrl: 'data:image/png;base64,' + 'A'.repeat(250_000) } });
ok('an oversized logo is refused by name, not clipped', !r.success && r.field === 'brand.logo', JSON.stringify(r).slice(0, 200));
r = await api('whitelabel.php', { token: ann.token, accountId: annWs, action: 'save_branding', branding: { appName: 'Acme Two', logoUrl: 'javascript:alert(1)' } });
ok('…and so is a logo that is not an image address', !r.success && r.field === 'brand.logo', JSON.stringify(r).slice(0, 200));
r = await api('whitelabel.php', { token: ann.token, accountId: annWs, action: 'get_branding' });
ok('…leaving her saved branding as it was', r.branding?.appName === 'Acme Two' && r.branding?.logoUrl?.startsWith('data:image/png'), JSON.stringify(r).slice(0, 160));
r = await api('whitelabel.php', { token: bob.token, accountId: bobWs, action: 'add', kind: 'subdomain', slug: 'acme-growth', branding: { appName: 'Bob' } });
ok('Bob cannot claim Ann\'s address', !r.success && /in use/i.test(r.error ?? ''), JSON.stringify(r));
r = await api('whitelabel.php', { token: bob.token, accountId: bobWs, action: 'remove', hostname: 'acme-growth.protectedcentral.com' });
ok('…nor remove it', !r.success, JSON.stringify(r));
r = await api('whitelabel.php', { token: bob.token, accountId: bobWs, action: 'check', hostname: 'acme-growth.protectedcentral.com', branding: { appName: 'Hijacked' } });
ok('…nor overwrite its branding through "check"', !r.success && sql("SELECT app_name FROM crm_domain_branding WHERE hostname = 'acme-growth.protectedcentral.com'")[0]?.app_name === 'Acme Two', JSON.stringify(r));
for (const slug of ['app', 'testing', 'login', 'billing', 'protectedcentral']) {
  r = await api('whitelabel.php', { token: bob.token, accountId: bobWs, action: 'add', kind: 'subdomain', slug, branding: {} });
  ok(`"${slug}" is reserved`, !r.success, JSON.stringify(r));
}
r = await api('whitelabel.php', { token: bob.token, accountId: bobWs, action: 'add', kind: 'custom', hostname: 'app.protectedcentral.com', branding: {} });
ok('the product\'s own address cannot be claimed as a custom domain', !r.success);
r = await api('whitelabel.php', { action: 'resolve', hostname: 'acme-growth.protectedcentral.com' });
ok('the public answer is the sign-in branding and nothing else', r.match && Object.keys(r.match).sort().join() === 'accent,accountId,appName,kind,loginHeadline,logoUrl,status', JSON.stringify(Object.keys(r.match ?? {})));
r = await api('whitelabel.php', { action: 'resolve', hostname: 'nobody-here.protectedcentral.com' });
ok('an unclaimed address resolves to nothing, without an error', r.success && r.match === null);
r = await api('whitelabel.php', { action: 'list' });
ok('listing addresses needs a session', !r.success && r.code === 'unauthorised');

/* ── An unclaimed name under ours is the plain product, not somebody's brand ── */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`http://nobody-here.protectedcentral.com:${PORT}/login`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  ok('an unclaimed address shows the plain sign-in, no reseller\'s name', !/Acme/.test(await p.locator('body').innerText()));
  await ctx.close();
}

/* ── Removing it frees the name and blanks the public answer ── */
r = await api('whitelabel.php', { token: ann.token, accountId: annWs, action: 'remove', hostname: 'acme-growth.protectedcentral.com' });
ok('Ann can release her address', r.success, JSON.stringify(r));
r = await api('whitelabel.php', { action: 'resolve', hostname: 'acme-growth.protectedcentral.com' });
ok('…after which it resolves to nothing', r.match === null);
ok('…and its branding copy is gone', sql("SELECT COUNT(*) AS n FROM crm_domain_branding WHERE hostname = 'acme-growth.protectedcentral.com'")[0].n === 0);

ok('Ann\'s screens raised no page errors', !errs.length, errs.join(' | '));
await browser.close();
console.log(fail ? `\n${fail} failed` : '\nall passed');
process.exit(fail ? 1 : 0);
