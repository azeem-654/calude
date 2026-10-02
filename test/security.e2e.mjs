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

/* `Connection: close`: `d1rows` blocks this process while wrangler runs, and a
   kept-alive socket the Worker closed in the meantime would be reused after
   it and fail as "other side closed" — a fault of the test, not the app. */
async function api(path, body, init = {}) {
  const r = await fetch(`${BASE}/api/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': init.ip ?? '10.0.0.1' },
    body: JSON.stringify(body), redirect: 'manual',
  });
  let data = {};
  try { data = await r.json(); } catch { /* not json */ }
  return { status: r.status, data, ok: !!data.success };
}

/* PERSIST: the --persist-to directory `wrangler dev` was started with, when it
   is not the default — otherwise these reads look at a different database. */
const persist = process.env.PERSIST ? ` --persist-to ${process.env.PERSIST}` : '';
const d1 = sql => execSync(`npx wrangler d1 execute crmpro --local${persist} --json --command ${JSON.stringify(sql.replace(/\s+/g, ' '))}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
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

console.log('\nSign-ups and messages — the owner\'s alone');
const su = await api('customers.php', { action: 'signups', token: B.token });
check("B cannot read the owner's list of sign-ups", !su.ok, JSON.stringify(su.data).slice(0, 120));
const msg = await api('customers.php', { action: 'message', token: B.token, to: [A.email], title: 'Phish', body: 'x', link: 'https://evil.example' });
check('B cannot message other customers as the owner', !msg.ok, JSON.stringify(msg.data).slice(0, 120));
const aMine = await api('customers.php', { action: 'mine', token: A.token });
const aNote = (aMine.data.notices ?? [])[0];
if (aNote) {
  await api('customers.php', { action: 'read', token: B.token, id: aNote.id });
  const again = await api('customers.php', { action: 'mine', token: A.token });
  check("B cannot close A's message by id", (again.data.notices ?? []).some(n => n.id === aNote.id));
}
const setg = await api('customers.php', { action: 'settings_save', token: B.token, settings: { kickoffUrl: 'https://evil.example' } });
check("B cannot change the owner's kickoff link", !setg.ok, JSON.stringify(setg.data).slice(0, 120));

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
const rev = await api('revenue.php', { action: 'summary', token: B.token, accountId: A.acct, days: 30 });
check("B cannot read A's revenue", !rev.ok, JSON.stringify(rev.data).slice(0, 120));
const revPj = await api('revenue.php', { action: 'summary', token: B.token, accountId: B.acct, days: 30, projectId: pj.data.id });
check("B cannot scope a report to A's project", !revPj.ok, JSON.stringify(revPj.data).slice(0, 120));
const repS = await api('reputation.php', { action: 'status', token: B.token, accountId: A.acct });
check("B cannot read A's review source", !repS.ok, JSON.stringify(repS.data).slice(0, 120));
const repR = await api('reputation.php', { action: 'reviews', token: B.token, accountId: A.acct });
check("B cannot read A's reviews", !repR.ok, JSON.stringify(repR.data).slice(0, 120));
const repSave = await api('reputation.php', { action: 'save_source', token: B.token, accountId: A.acct, placeId: 'ChIJforged', placeName: 'Forged' });
check("B cannot point A's reviews at another business", !repSave.ok, JSON.stringify(repSave.data).slice(0, 120));
/* Prospect search spends the owner's Google Maps key on the named workspace's
   budget, so naming A's workspace must be refused before anything is spent. */
const proS = await api('prospects.php', { action: 'search', token: B.token, accountId: A.acct, trade: 'plumber', place: 'Manchester' });
check("B cannot search for prospects on A's workspace (and A's budget)", !proS.ok && proS.status === 403, JSON.stringify(proS.data).slice(0, 120));
const proQ = await api('prospects.php', { action: 'search', token: B.token, accountId: A.acct, query: 'plumber in Leeds' });
check("…nor through the AI Sales Agent's one-line search", !proQ.ok && proQ.status === 403, JSON.stringify(proQ.data).slice(0, 120));
const proSt = await api('prospects.php', { action: 'status', token: B.token, accountId: A.acct });
check("…nor read whether A can search", !proSt.ok && proSt.status === 403, JSON.stringify(proSt.data).slice(0, 120));
const proC = await api('prospects.php', { action: 'contacts', token: B.token, accountId: A.acct, websites: ['https://example.com'] });
check("…nor read websites on A's workspace", !proC.ok && proC.status === 403, JSON.stringify(proC.data).slice(0, 120));
const oldPlaces = await api('places-search.php', { token: B.token, apiKey: 'AIzaFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAK', query: 'plumber' });
check('the old Places proxy that took a key in the body is gone', !oldPlaces.ok && oldPlaces.status === 410, JSON.stringify(oldPlaces.data).slice(0, 120));
const plat = await api('platform.php', { action: 'status', token: B.token });
check("B cannot read the owner's Platform services", !plat.ok && plat.status === 403, JSON.stringify(plat.data).slice(0, 120));

console.log('\nSMS credentials — never in plain text, never back to a browser');
{
  /* A token that is unmistakable in any dump, so a grep for it is the test. */
  const TOKEN = `tok${run}secret0123456789abcdef`;
  const sB = await api('sms-send.php', { action: 'save', token: B.token, accountId: A.acct, accountSid: 'AC' + 'f'.repeat(32), authToken: 'hijack', from: '+15550000000' });
  check("B cannot set A's SMS sender", !sB.ok && sB.status === 403, JSON.stringify(sB.data));
  const gB = await api('sms-send.php', { action: 'get', token: B.token, accountId: A.acct });
  check("B cannot read whether A has an SMS sender", !gB.ok && gB.status === 403, JSON.stringify(gB.data));

  const save = await api('sms-send.php', { action: 'save', token: A.token, accountId: A.acct, accountSid: 'AC' + 'a'.repeat(32), authToken: TOKEN, from: '+15551234567' });
  const got = await api('sms-send.php', { action: 'get', token: A.token, accountId: A.acct });
  check('A saving a sender is answered with "set", never the token', save.ok && got.data.sms?.hasCredentials === true && !JSON.stringify(got.data).includes(TOKEN) && !JSON.stringify(got.data).includes('aaaaaaaa'), JSON.stringify(got.data));
  const stored = d1rows(`SELECT auth_token AS t, verified_at AS v FROM crm_sms_config WHERE account_id = '${A.acct}'`)[0];
  check('…and it is stored encrypted, unverified', !!stored && stored.t.startsWith('v1.') && !stored.t.includes(TOKEN) && stored.v === null, JSON.stringify(stored));
  const badFrom = await api('sms-send.php', { action: 'save', token: A.token, accountId: A.acct, from: '555' });
  check('A bad sending number is refused by name (sms.from)', !badFrom.ok && badFrom.data.field === 'sms.from', JSON.stringify(badFrom.data));

  /* The old client wrote the token into the synced schedule and into the
     booking page's private blob. Both doors take it out now. */
  const LEGACY = `legacy${run}tokenABCDEF`;
  const sched = { title: 'Meet', automations: { confirmEmail: true, twilioSid: 'AC' + 'b'.repeat(32), twilioToken: LEGACY, twilioFrom: '+15557654321' } };
  await api('data.php', { action: 'bulk_set', token: B.token, accountId: B.acct, items: { crm_schedule: JSON.stringify(sched), crm_sms: JSON.stringify({ accountSid: 'AC1', authToken: LEGACY, fromNumber: '' }) } });
  const back = await api('data.php', { action: 'get_all', token: B.token, accountId: B.acct });
  check('A schedule synced with a Twilio token is stored without it', back.ok && !JSON.stringify(back.data).includes(LEGACY) && !('crm_sms' in (back.data.data ?? {})) && JSON.parse(back.data.data?.crm_schedule ?? '{}').automations?.confirmEmail === true, JSON.stringify(back.data).slice(0, 200));
  const adopted = d1rows(`SELECT auth_token AS t, from_number AS f FROM crm_sms_config WHERE account_id = '${B.acct}'`)[0];
  check('…and kept, encrypted, as the sender of a workspace that had none', !!adopted && adopted.t.startsWith('v1.') && adopted.f === '+15557654321', JSON.stringify(adopted));
  const anyPlain = d1rows(`SELECT count(*) AS n FROM crm_data WHERE v LIKE '%${LEGACY}%'`)[0];
  check('…and appears nowhere in crm_data', anyPlain?.n === 0, JSON.stringify(anyPlain));

  /* B's workspace, not A's: "Public surfaces" below needs A to have no booking page. */
  const pub = await api('booking.php', { action: 'publish', token: B.token, accountId: B.acct, public: { slug: `b-${run}`, title: 'B' }, private: { twilio: { sid: 'AC' + 'c'.repeat(32), token: LEGACY, from: '+15550001111' }, automations: { twilioToken: LEGACY, reminderEmail: true } } });
  const priv = d1rows(`SELECT private FROM crm_booking_config WHERE account_id = '${B.acct}'`)[0]?.private ?? '';
  check('Publishing a booking page never stores a Twilio credential', pub.ok && !priv.includes(LEGACY) && !priv.includes('twilio') && priv.includes('reminderEmail'), priv);
  const bStill = d1rows(`SELECT auth_token AS t FROM crm_sms_config WHERE account_id = '${B.acct}'`)[0];
  check('…and an older copy does not replace a sender the workspace already has', !!bStill && bStill.t === adopted?.t, 'sender was overwritten');
  const cfg = await api('booking.php', { action: 'config', slug: `b-${run}` });
  check('…and the public page config carries none of it', cfg.ok && !JSON.stringify(cfg.data).includes(LEGACY), JSON.stringify(cfg.data).slice(0, 160));
}

console.log('\nForms — consent is the visitor\'s to give');
{
  const fr = await api('engagement.php', { action: 'save_form', token: A.token, accountId: A.acct, record: {
    name: `Consent form ${run}`, consentText: 'I agree to be contacted about my enquiry.', status: 'live',
    fields: [{ key: 'email', label: 'Email', type: 'email', required: true }],
  } });
  const slug = fr.data.item?.slug;
  const meta = await api('engage.php', { action: 'form', formSlug: slug });
  check('A form with consent wording says so to the page that renders it', meta.ok && /agree/.test(meta.data.form?.consentText ?? ''), JSON.stringify(meta.data).slice(0, 160));
  const none = await api('engage.php', { action: 'submit', formSlug: slug, answers: { email: `c1-${run}@example.test` } }, { ip: '10.8.0.1' });
  check('A submission without the tick is refused, naming the consent box', !none.ok && none.status === 422 && none.data.code === 'consent' && none.data.field === 'consent', JSON.stringify(none.data));
  const truthy = await api('engage.php', { action: 'submit', formSlug: slug, answers: { email: `c2-${run}@example.test` }, consent: 'yes' }, { ip: '10.8.0.2' });
  check('…and so is anything but a literal true', !truthy.ok && truthy.data.code === 'consent', JSON.stringify(truthy.data));
  const given = await api('engage.php', { action: 'submit', formSlug: slug, answers: { email: `c3-${run}@example.test` }, consent: true }, { ip: '10.8.0.3' });
  check('…and one with it is taken', given.ok, JSON.stringify(given.data));
}

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

console.log("\nLive help — B against A's screen-sharing sessions");
{
  const w = await api('engagement.php', { action: 'save_widget', token: A.token, accountId: A.acct, record: { name: 'A help', features: ['screen'], status: 'live', inApp: true } });
  const key = w.data.item?.public_key;
  const st = await api('engage.php', { action: 'live_start', widgetKey: key, name: 'Visitor' }, { ip: '10.7.0.1' });
  const sid = st.data.sessionId;
  await api('engage.php', { action: 'live_offer', sessionId: sid, shareKey: st.data.shareKey, sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n' }, { ip: '10.7.0.1' });
  const peek = await api('engagement.php', { action: 'live_session', token: B.token, accountId: B.acct, id: sid });
  check("B cannot read A's live session by id", !peek.ok && peek.status === 404, JSON.stringify(peek.data));
  const join = await api('engagement.php', { action: 'live_answer', token: B.token, accountId: B.acct, id: sid, sdp: 'v=0\r\no=- 9 2 IN IP4 127.0.0.1\r\ns=-\r\n' });
  const after = d1rows(`SELECT status, answer FROM crm_live_sessions WHERE id = '${sid}'`)[0];
  check("B cannot join A's live session by id", !join.ok && after?.status === 'waiting' && after?.answer === '', JSON.stringify([join.data, after]));
  const named = await api('engagement.php', { action: 'live_sessions', token: B.token, accountId: A.acct });
  check("B cannot list A's live sessions by naming the workspace", !named.ok && named.status === 403, JSON.stringify(named.data).slice(0, 120));
  const poll = await api('engage.php', { action: 'live_poll', sessionId: sid, shareKey: 'a'.repeat(36) }, { ip: '10.7.0.2' });
  check('A session id without its share key reads nothing', poll.status === 404, JSON.stringify(poll.data));
  const house = await api('engage.php', { action: 'house' });
  check("A customer's widget cannot become the app's own help button", house.data.widgetKey !== key, 'house key is a tenant widget');
  await api('engagement.php', { action: 'live_end', token: A.token, accountId: A.acct, id: sid });
}

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
