/**
 * Two customers on one install, and the second one trying everything.
 *
 * Every request B makes here is one that used to succeed. The audit that
 * found them is in docs/SECURITY.md; this is the proof they stay shut. It
 * talks to a real Worker and a real local D1, because the bugs were in SQL
 * and in who a route believed — nothing a unit test of one function catches.
 *
 *   npx wrangler d1 migrations apply crmpro --local
 *   npx wrangler dev --local            (in another terminal)
 *   node test/security.e2e.mjs
 *
 * It also checks the failure side of the new protections: brute force is cut
 * off, a session is stored hashed, logout ends it, a password change needs
 * the current password, an unsigned tracked link does not redirect, and 2-step
 * sign-in refuses a wrong code.
 */
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';
const run = Date.now().toString(36);
let failures = 0;
let passes = 0;

const check = (name, cond, detail = '') => {
  if (cond) { passes++; console.log(`  ✓ ${name}`); }
  else { failures++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function api(path, body, init = {}) {
  const r = await fetch(`${BASE}/api/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': init.ip ?? '10.0.0.1' },
    body: JSON.stringify(body), redirect: 'manual',
  });
  let data = {};
  try { data = await r.json(); } catch { /* not json */ }
  return { status: r.status, data, ok: !!data.success };
}

const d1 = sql => execSync(`npx wrangler d1 execute crmpro --local --json --command ${JSON.stringify(sql.replace(/\s+/g, ' '))}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const d1rows = sql => { try { return JSON.parse(d1(sql))[0]?.results ?? []; } catch (e) { console.log(String(e.stdout ?? e)); return []; } };

/* Sign-up is limited per network; a test run is not an attack. */
d1rows('DELETE FROM crm_signup_attempts');
d1rows("DELETE FROM crm_rate_limits WHERE bucket LIKE 'login%' OR bucket LIKE 'mfa%' OR bucket LIKE 'booking%'");

const pw = 'Correct-horse-9';
async function signUp(tag) {
  const email = `${tag}-${run}@example.test`;
  const r = await api('auth.php', { action: 'register', email, name: `User ${tag}`, password: pw }, { ip: `10.1.${tag === 'a' ? 1 : 2}.1` });
  if (!r.ok) throw new Error(`could not sign up ${tag}: ${JSON.stringify(r.data)}`);
  return { email, token: r.data.token, acct: r.data.user.accountId };
}

console.log('\nSigning up two customers…');
const A = await signUp('a');
const B = await signUp('b');
const OWNER = d1rows("SELECT email FROM crm_users WHERE account_id IS NULL AND role = 'agency' LIMIT 1")[0]?.email;

/* A's things, for B to reach for. */
const pf = await api('projects.php', { action: 'save_portfolio', token: A.token, accountId: A.acct, name: 'A Plumbing', profile: { description: 'Boilers' } });
const pj = await api('projects.php', { action: 'save_project', token: A.token, accountId: A.acct, name: 'A project', objective: 'Get more boiler installs', portfolioId: pf.data.id });
const pr = await api('commerce.php', { action: 'save_product', token: A.token, accountId: A.acct, name: 'A boiler', priceCents: 150000, status: 'active' });
check('A can create its own portfolio, project and product', pf.ok && pj.ok && pr.ok, JSON.stringify([pf.data.error, pj.data.error, pr.data.error]));
const productId = pr.data.id ?? pr.data.product?.id ?? d1rows(`SELECT id FROM crm_products WHERE account_id = '${A.acct}' LIMIT 1`)[0]?.id;

console.log('\nAccounts — B against A and the owner');
const list = await api('auth.php', { action: 'list_users', token: B.token });
check('list_users does not show B other customers', list.ok && !(list.data.users ?? []).some(u => u.email === A.email || u.email === OWNER), JSON.stringify(list.data.users?.map(u => u.email)));
const sp = await api('auth.php', { action: 'set_password', token: B.token, email: A.email, password: 'Hijacked-pass-1' });
check("B cannot set A's password", !sp.ok && sp.status === 403, JSON.stringify(sp.data));
if (OWNER) {
  const so = await api('auth.php', { action: 'set_password', token: B.token, email: OWNER, password: 'Hijacked-pass-1' });
  check("B cannot set the install owner's password", !so.ok, JSON.stringify(so.data));
  const del = await api('auth.php', { action: 'delete_user', token: B.token, email: OWNER });
  check('B cannot delete the install owner', !del.ok, JSON.stringify(del.data));
}
const dl = await api('auth.php', { action: 'delete_user', token: B.token, email: A.email });
check('B cannot delete A', !dl.ok, JSON.stringify(dl.data));
const cu = await api('auth.php', { action: 'create_user', token: B.token, email: `mole-${run}@example.test`, password: 'Mole-password-1', name: 'Mole', role: 'client', accountId: A.acct });
check("B cannot create a login inside A's workspace", !cu.ok && cu.status === 403, JSON.stringify(cu.data));
const ca = await api('auth.php', { action: 'create_user', token: B.token, email: `agent-${run}@example.test`, password: 'Mole-password-1', name: 'Mole', role: 'agency', accountId: B.acct });
check('B cannot mint an agency login', !ca.ok, JSON.stringify(ca.data));

console.log("\nWorkspace data — B naming A's workspace");
const all = await api('data.php', { action: 'get_all', token: B.token, accountId: A.acct });
check("B cannot read A's workspace data", !all.ok, JSON.stringify(all.data).slice(0, 120));
const imap = await api('imap-fetch.php', { token: B.token, accountId: A.acct });
check("B cannot read A's inbox", !imap.ok && imap.status === 403, JSON.stringify(imap.data));
const smtp = await api('smtp-send.php', { token: B.token, accountId: A.acct, to: 'x@example.test', subject: 'hi', html: 'hi' });
check("B cannot send through A's mailbox", !smtp.ok && smtp.status === 403, JSON.stringify(smtp.data));
const prov = await api('provider-send.php', { token: B.token, accountId: A.acct, to: 'x@example.test', subject: 'hi', html: 'hi' });
check("B cannot send through A's provider key", !prov.ok && prov.status === 403, JSON.stringify(prov.data));
const blog = await api('blog-publish.php', { token: B.token, accountId: A.acct, title: 't', content: 'c' });
check("B cannot publish as A", !blog.ok && blog.status === 403, JSON.stringify(blog.data));

console.log("\nOverwriting A's records by id");
const bpf = await api('projects.php', { action: 'save_portfolio', token: B.token, accountId: B.acct, name: 'B Co', profile: {} });
const hijackProject = await api('projects.php', {
  action: 'save_project', token: B.token, accountId: B.acct, id: pj.data.id, name: 'pwned', objective: 'take over their guardrails', portfolioId: bpf.data.id,
  guardrails: { sending: 'on' },
});
const stillA = d1rows(`SELECT name, account_id AS a FROM crm_projects WHERE id = '${pj.data.id}'`)[0];
check("B cannot overwrite A's project by id", !hijackProject.ok && stillA?.name === 'A project' && stillA?.a === A.acct, JSON.stringify([hijackProject.data, stillA]));
if (productId) {
  const hijackProduct = await api('commerce.php', { action: 'save_product', token: B.token, accountId: B.acct, id: productId, name: 'defaced', priceCents: 1, status: 'active' });
  const p = d1rows(`SELECT name, price_cents AS price FROM crm_products WHERE id = '${productId}'`)[0];
  check("B cannot reprice A's product by id", !hijackProduct.ok && p?.name === 'A boiler', JSON.stringify([hijackProduct.data, p]));
}
const hijackPortfolio = await api('projects.php', { action: 'save_portfolio', token: B.token, accountId: B.acct, id: pf.data.id, name: 'pwned', profile: {} });
check("B cannot overwrite A's portfolio by id", !hijackPortfolio.ok, JSON.stringify(hijackPortfolio.data));

console.log('\nPublic surfaces');
const book = await api('booking.php', { action: 'create', accountId: A.acct, slotDate: '2031-01-02', slotTime: '10:00', guestEmail: 'v@example.test', guestName: 'Spam' });
check('Anyone cannot book into a workspace with no booking page', !book.ok, JSON.stringify(book.data));
const co = await api('stripe-checkout.php', { token: B.token, accountId: B.acct, amount: 0.01 });
check('Legacy checkout no longer takes a price from the request', !co.ok, JSON.stringify(co.data));
const portal = await api('stripe-portal.php', { token: B.token, accountId: A.acct, customerId: 'cus_abc' });
check("B cannot open A's billing portal", !portal.ok, JSON.stringify(portal.data));
const diag = await api('diagnostics.php', { token: B.token });
check('A customer cannot read install-wide diagnostics', !diag.ok && diag.status === 403, JSON.stringify(diag.data).slice(0, 100));
const unsub = await fetch(`${BASE}/api/unsubscribe.php?sign=1&a=${A.acct}&e=x@example.test`, { headers: { Authorization: `Bearer ${B.token}` } });
check("B cannot sign opt-outs for A's contacts", unsub.status === 403, String(unsub.status));
const click = await fetch(`${BASE}/api/track.php?c=e1&a=${A.acct}&u=${encodeURIComponent('https://evil.example/login')}`, { redirect: 'manual' });
check('An unsigned tracked link does not redirect', click.status === 200 && !click.headers.get('location'), `${click.status} ${click.headers.get('location')}`);

console.log('\nSessions and passwords');
const row = d1rows(`SELECT token FROM crm_sessions WHERE email = '${A.email}' ORDER BY created_at DESC LIMIT 1`)[0];
check('Sessions are stored as a hash, not the token', !!row && row.token.startsWith('h:') && row.token !== A.token, row?.token?.slice(0, 6));
const noCurrent = await api('auth.php', { action: 'set_password', token: A.token, email: A.email, password: 'Another-pass-22' });
check('Changing your own password needs the current one', !noCurrent.ok, JSON.stringify(noCurrent.data));
const withCurrent = await api('auth.php', { action: 'set_password', token: A.token, email: A.email, password: 'Another-pass-22', currentPassword: pw });
check('…and works with it', withCurrent.ok, JSON.stringify(withCurrent.data));

let blocked = false;
for (let i = 0; i < 12; i++) {
  const r = await api('auth.php', { action: 'login', email: B.email, password: `wrong-${i}` }, { ip: `10.9.${i}.1` });
  if (r.status === 429) { blocked = true; break; }
}
check('Repeated wrong passwords for one account are cut off', blocked);
const right = await api('auth.php', { action: 'login', email: B.email, password: pw }, { ip: '10.9.99.1' });
check('…including the right one, until the window passes', right.status === 429, String(right.status));

const events = d1rows(`SELECT kind FROM crm_audit_events WHERE actor_email = '${B.email}'`).map(e => e.kind);
check('Failed sign-ins are in the audit log', events.includes('login_failed'), events.join(','));

const out = await api('auth.php', { action: 'logout', token: A.token });
const after = await api('auth.php', { action: 'me', token: A.token });
check('Logout ends the session', out.ok && !after.ok, JSON.stringify(after.data));

console.log('\nTwo-step sign-in');
const A2 = await api('auth.php', { action: 'login', email: A.email, password: 'Another-pass-22' }, { ip: '10.3.0.1' });
const t = A2.data.token;
const begin = await api('security.php', { action: 'mfa_begin', token: t });
if (begin.ok) {
  const secret = begin.data.secret;
  const code = totp(secret);
  const on = await api('security.php', { action: 'mfa_enable', token: t, code });
  check('2-step can be switched on with a correct code', on.ok, JSON.stringify(on.data));
  const first = await api('auth.php', { action: 'login', email: A.email, password: 'Another-pass-22' }, { ip: '10.3.0.2' });
  check('A correct password then asks for the code, with no session yet', first.data.mfaRequired && !first.data.token, JSON.stringify(first.data).slice(0, 120));
  const wrong = await api('auth.php', { action: 'login_mfa', ticket: first.data.ticket, code: '000000' });
  check('A wrong code is refused', !wrong.ok, JSON.stringify(wrong.data));
  const good = await api('auth.php', { action: 'login_mfa', ticket: first.data.ticket, code: totp(secret) });
  check('The right code signs in', good.ok && !!good.data.token, JSON.stringify(good.data).slice(0, 120));
} else {
  check('security.php mfa_begin answers', false, JSON.stringify(begin.data));
}

console.log(`\n${passes} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);

/* RFC 6238, as an authenticator app computes it. */
function totp(secret, at = Date.now()) {
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0; let value = 0; const bytes = [];
  for (const ch of secret.replace(/=+$/, '')) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const mac = crypto.createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const off = mac[mac.length - 1] & 15;
  const n = ((mac[off] & 127) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(n % 1_000_000).padStart(6, '0');
}
