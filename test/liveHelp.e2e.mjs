/**
 * Live help — screen sharing from a widget — driven end to end.
 *
 * Needs a built bundle and `npx wrangler dev --local`, then:
 *   node test/liveHelp.e2e.mjs <owner-token> <owner-account> <other-token> <other-account>
 *
 * Two halves.
 *
 * The handshake over the API: a stranger asks, the business joins, first to
 * join wins, either side ends it — and every way of reaching somebody else's
 * session is refused. Session descriptions here are placeholders; the server
 * checks their shape, not their meaning.
 *
 * Then the real thing: two Chromium pages, the widget on one sharing a fake
 * screen, Customer Engagement → Live help on the other joining it, and the
 * picture actually arriving — frames decoded, not merely a green light.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const B = 'http://localhost:8787';
const [TOK, ACCT, OTOK, OACCT] = process.argv.slice(2);
if (!OACCT) { console.error('usage: node test/liveHelp.e2e.mjs <owner-token> <owner-account> <other-token> <other-account>'); process.exit(2); }
const out = [];
const ok = (n, p, d = '') => { out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`); if (process.env.PROGRESS) console.error(out.at(-1)); };

const api = async (path, body, headers = {}) => {
  const r = await fetch(`${B}/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};
const owner = (action, extra = {}) => api('engagement.php', { token: TOK, accountId: ACCT, action, ...extra });
const other = (action, extra = {}) => api('engagement.php', { token: OTOK, accountId: OACCT, action, ...extra });
/* A fresh address per call, so this suite never spends the shared per-IP
   budget that other suites run against. */
let n = 0;
const pub = (body) => api('engage.php', body, {
  Origin: 'https://acme-test.example', 'CF-Connecting-IP': `10.9.${Math.floor(n / 250)}.${(n++ % 250) + 1}`,
});
const SDP = (tag) => `v=0\r\no=- ${tag} 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n`;
const stamp = Date.now().toString(36);

/* ── Set up ── */
const plain = await owner('save_widget', { record: { name: `No screen ${stamp}`, features: ['chat'], status: 'live' } });
const shared = await owner('save_widget', {
  record: { name: `Screen ${stamp}`, features: ['chat', 'screen', 'ticket'], status: 'live', inApp: true },
});
const plainKey = plain.json.item?.public_key;
const key = shared.json.item?.public_key;
ok('a widget can offer screen sharing', !!key && JSON.parse(shared.json.item.features).includes('screen'),
  JSON.stringify(shared.json).slice(0, 160));
ok('and "use as the app help button" is stored when asked for', shared.json.item?.in_app === 1, `in_app=${shared.json.item?.in_app}`);

const w = await pub({ action: 'widget', widgetKey: key });
ok('the widget tells the page what it offers', String(w.json.widget?.features ?? '').includes('screen'));

/* ── Refusals before anything exists ── */
const off = await pub({ action: 'live_start', widgetKey: plainKey, name: 'X' });
ok('a widget without screen sharing refuses a request', off.status === 403, `status ${off.status}`);

/* ── The house button is the install owner's, and only theirs ── */
const house = await pub({ action: 'house' });
ok('a tenant ticking "help button" does not become the app\'s help button',
  house.json.widgetKey !== key, `house key is this tenant's widget`);

/* ── A stranger asks ── */
const start = await pub({
  action: 'live_start', widgetKey: key, name: 'Sam Visitor', email: 'sam@visitor.example',
  subject: 'The export button does nothing', token: 'cookie', context: { page: 'https://acme-test.example/pricing' },
});
const sid = start.json.sessionId;
const skey = start.json.shareKey;
ok('a visitor can ask to share their screen', start.json.success === true && !!sid && !!skey, JSON.stringify(start.json).slice(0, 160));
ok('and is handed servers to connect through', Array.isArray(start.json.iceServers) && start.json.iceServers.length > 0);
ok('the reply carries no workspace id', !JSON.stringify(start.json).includes(ACCT));

const withToken = await pub({ action: 'live_start', widgetKey: key, name: 'Forger', email: 'owner@victim.example', token: OTOK });
/* A real token in a body from another website: withCookieToken never runs for
   it, but the route still resolves it — that is the tests' own door, and why
   the widget only ever sends the placeholder. What must hold is that the
   placeholder alone proves nothing. */
const listA = await owner('live_sessions');
const mine = (listA.json.sessions ?? []).find(s => s.id === sid);
ok('the placeholder token proves nobody — typed details stay unverified',
  mine && mine.verifiedEmail === '' && mine.email === 'sam@visitor.example', JSON.stringify(mine ?? {}).slice(0, 200));
const forged = (listA.json.sessions ?? []).find(s => s.id === withToken.json.sessionId);
ok('a real session is shown as that person, not as what they typed',
  forged && forged.verifiedEmail && forged.verifiedEmail !== 'owner@victim.example', JSON.stringify(forged ?? {}).slice(0, 200));
ok('the list never carries the share key or the descriptions',
  !JSON.stringify(listA.json).includes(skey) && !('offer' in (mine ?? {})), 'secret material in the list');
ok('the business is told screen sharing is switched on', listA.json.enabled === true);

/* ── Keys ── */
const wrong = await pub({ action: 'live_poll', sessionId: sid, shareKey: 'f'.repeat(36) });
ok('a wrong share key reads nothing', wrong.status === 404, `status ${wrong.status}`);
const junk = await pub({ action: 'live_offer', sessionId: sid, shareKey: skey, sdp: '<script>alert(1)</script>' });
ok('something that is not a session description is refused', junk.status === 422, `status ${junk.status}`);
const huge = await pub({ action: 'live_offer', sessionId: sid, shareKey: skey, sdp: `v=0\r\n${'a'.repeat(30_000)}` });
ok('an oversized description is refused — a public store is not a file host', huge.status === 422, `status ${huge.status}`);

const early = await owner('live_answer', { id: sid, sdp: SDP('early') });
ok('nobody can join before there is anything to join', early.status === 409, `status ${early.status}`);

const offer = await pub({ action: 'live_offer', sessionId: sid, shareKey: skey, sdp: SDP('offer') });
ok('the sharer can post their half', offer.json.success === true, JSON.stringify(offer.json));

/* ── Another workspace ── */
const peek = await other('live_session', { id: sid });
ok('another workspace cannot read the session', peek.status === 404, `status ${peek.status}`);
const steal = await other('live_answer', { id: sid, sdp: SDP('thief') });
ok('another workspace cannot join it', steal.json.success !== true, JSON.stringify(steal.json));
const stop = await other('live_end', { id: sid });
const still = await owner('live_session', { id: sid });
ok('another workspace cannot end it', still.json.session?.status === 'waiting', `status ${still.json.session?.status} (end said ${JSON.stringify(stop.json)})`);
const otherList = await other('live_sessions');
ok('and does not see it in its list', !(otherList.json.sessions ?? []).some(s => s.id === sid));

/* ── The business joins ── */
const waiting = await owner('live_waiting');
ok('the app-wide alert counts the waiting request', Number(waiting.json.waiting) >= 1, JSON.stringify(waiting.json));
const got = await owner('live_session', { id: sid });
ok('the business reads the offer to answer it', got.json.session?.offer === SDP('offer'));
const ans = await owner('live_answer', { id: sid, sdp: SDP('answer') });
ok('the business can join', ans.json.success === true, JSON.stringify(ans.json));
const twice = await owner('live_answer', { id: sid, sdp: SDP('second') });
ok('a second person pressing Join is told it is taken', twice.status === 409, `status ${twice.status}`);

const poll = await pub({ action: 'live_poll', sessionId: sid, shareKey: skey, state: 'connected' });
ok('the sharer receives the answer', poll.json.answer === SDP('answer') && poll.json.status === 'live', JSON.stringify(poll.json).slice(0, 200));
const late = await pub({ action: 'live_offer', sessionId: sid, shareKey: skey, sdp: SDP('late') });
ok('the offer cannot be swapped once joined', late.status === 409, `status ${late.status}`);

const meet = await owner('live_meet', { id: sid });
ok('with no calendar, the Meet fallback says why rather than inventing a link',
  meet.json.success !== true && meet.json.code === 'no-calendar', JSON.stringify(meet.json));

const listB = await owner('live_sessions');
const live = (listB.json.sessions ?? []).find(s => s.id === sid);
ok('the list shows who joined and the sharer\'s connection state',
  live?.status === 'live' && live.agentEmail && live.sharerState === 'connected', JSON.stringify(live ?? {}).slice(0, 220));

/* ── Ending ── */
await pub({ action: 'live_end', sessionId: sid, shareKey: skey });
const listC = await owner('live_sessions');
const ended = (listC.json.sessions ?? []).find(s => s.id === sid);
ok('the sharer can end it, and the business sees why', ended?.status === 'ended' && ended.endedReason === 'sharer', JSON.stringify(ended ?? {}).slice(0, 200));
const after = await pub({ action: 'live_poll', sessionId: sid, shareKey: skey });
ok('and the sharer\'s page is told it ended', after.json.status === 'ended');

await pub({ action: 'live_end', sessionId: withToken.json.sessionId, shareKey: withToken.json.shareKey });

/* ═══ The real thing, in two browsers ═══════════════════════════════════════ */

const browser = await pw.chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--auto-accept-this-tab-capture', '--auto-select-desktop-capture-source=Entire screen',
    /* A page served by Playwright's router sits in an "unknown" address space,
       and Chrome's local-network guard then refuses it anything on localhost.
       Test plumbing only: in production the widget and the page are both on
       the public internet. */
    '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests',
  ],
});
const errs = [];

/* The customer: a page on "their website" with the widget on it. */
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const site = await ctxA.newPage();
site.on('pageerror', e => errs.push(`site: ${String(e).slice(0, 160)}`));
/* A *.localhost origin: a secure context, so a screen may be shared from it. */
await site.route('http://acme.localhost:9911/**', r => r.fulfill({
  contentType: 'text/html',
  body: `<!doctype html><title>Acme</title><h1>Acme pricing</h1><script src="${B}/widget.js" data-pc-widget="${key}" async></script>`,
}));
await site.goto('http://acme.localhost:9911/pricing');
await site.getByRole('button', { name: 'Open the chat' }).click();
const menu = await site.getByRole('dialog').innerText();
ok('the widget opens onto a menu of what it offers',
  /Share your screen/.test(menu) && /Raise a ticket/.test(menu) && /Check a ticket/.test(menu), menu.slice(0, 200));

await site.getByRole('button', { name: /Share your screen/ }).click();
await site.getByLabel('Your name').fill('Browser Customer');
await site.getByLabel(/Email/).fill('browser@customer.example');
await site.getByLabel('What is going wrong?').fill('Invoices will not download');
await site.getByRole('button', { name: 'Choose what to share' }).click();
await site.waitForTimeout(6000);
const waitingText = await site.getByRole('dialog').innerText();
ok('the customer is told they are waiting for somebody', /Waiting for somebody to join/.test(waitingText), waitingText.slice(0, 240));

/* The business: signed in, on Customer Engagement → Live help. */
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctxB.addCookies([{ name: 'pc_session', value: TOK, url: B }]);
const app = await ctxB.newPage();
app.on('pageerror', e => errs.push(`app: ${String(e).slice(0, 160)}`));
await app.addInitScript(([acct]) => {
  const user = { email: 'x', name: 'Agent', role: 'agency', accountId: acct };
  localStorage.setItem('crm_session', JSON.stringify({ token: 'cookie', user, backend: 'php' }));
  localStorage.setItem('crm_active_account', acct);
  localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: acct, name: 'Test', createdAt: new Date().toISOString() }]));
}, [ACCT]);
await app.goto(`${B}/engagement?tab=live`, { waitUntil: 'domcontentloaded' });
await app.waitForTimeout(5000);
const board = await app.locator('main').innerText();
ok('Live help lists the waiting customer with what they said',
  /Browser Customer/.test(board) && /Invoices will not download/.test(board), board.slice(0, 300));

await app.locator('main').getByRole('button', { name: 'Join', exact: true }).first().click();
let frames = 0;
for (let i = 0; i < 20 && frames === 0; i++) {
  await app.waitForTimeout(1000);
  frames = await app.evaluate(() => {
    const v = document.querySelector('main video');
    return v && v.videoWidth > 0 ? (v.getVideoPlaybackQuality?.().totalVideoFrames ?? 1) : 0;
  });
}
ok('the business sees the customer\'s screen — frames decoded', frames > 0, 'no video frames arrived');
const joined = await app.locator('main').innerText();
ok('and is told it is connected', /Connected — you can see their screen/.test(joined), joined.slice(0, 200));

await site.waitForTimeout(3500);
const sharing = await site.getByRole('dialog').innerText();
ok('the customer is told who can see their screen', /can see your screen/.test(sharing), sharing.slice(0, 200));

/* Talk both ways over the direct channel. */
await app.getByLabel('Message to the customer').fill('Click Billing, then Invoices');
await app.locator('main').getByRole('button', { name: 'Send', exact: true }).click();
await site.waitForTimeout(1200);
ok('a typed message reaches the customer directly', /Click Billing, then Invoices/.test(await site.getByRole('dialog').innerText()));
await site.getByLabel('Message to support').fill('Found it, thanks');
await site.getByRole('button', { name: 'Send' }).click();
await app.waitForTimeout(1200);
ok('and one comes back', /Found it, thanks/.test(await app.locator('main').innerText()));

const overflow = await app.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok('no horizontal overflow on the viewer at 1280px', overflow === 0, `${overflow}px`);

await app.locator('main').getByRole('button', { name: 'End', exact: true }).click();
await site.waitForTimeout(2500);
ok('ending from the business tells the customer', /Support has ended the session/.test(await site.getByRole('dialog').innerText()));

/* The ticket screens the widget always had a server for and never drew. */
const dlg = site.getByRole('dialog');
await dlg.getByRole('button', { name: 'Back' }).last().click();
await dlg.getByRole('button', { name: /Raise a ticket/ }).click();
await dlg.getByLabel('Your name').fill('Browser Customer');
await dlg.getByLabel(/Email/).fill('browser@customer.example');
await dlg.getByLabel('What is it about?').fill(`Invoice PDF ${stamp}`);
await dlg.getByLabel('Tell us what happened').fill('The download spins for ever.');
await dlg.getByRole('button', { name: 'Send ticket' }).click();
await site.waitForTimeout(1500);
const raised = await dlg.innerText();
const ref = (raised.match(/Ticket (\S+) raised/) ?? [])[1];
ok('a ticket can be raised from the widget, with its reference shown', !!ref, raised.slice(0, 200));
await dlg.getByRole('button', { name: 'Back' }).last().click();
await dlg.getByRole('button', { name: /Check a ticket/ }).click();
await dlg.getByRole('button', { name: 'Look it up' }).click();
await site.waitForTimeout(1200);
const looked = await dlg.innerText();
ok('and looked up again from the same browser without retyping the key',
  looked.includes(`Invoice PDF ${stamp}`) && /Status: open/i.test(looked), looked.slice(0, 240));
const tickets = await owner('tickets');
ok('and it is in the business\'s ticket list', (tickets.json.tickets ?? []).some(t => t.reference === ref));

await site.setViewportSize({ width: 390, height: 780 });
await site.waitForTimeout(400);
const box = await dlg.boundingBox();
ok('the widget fits a phone screen', !!box && box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box));

/* Phone width: the viewer and the widget both fit. */
await app.setViewportSize({ width: 390, height: 844 });
await app.waitForTimeout(600);
const o390 = await app.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok('no horizontal overflow on Live help at 390px', o390 === 0, `${o390}px`);

ok('no page errors in either browser', errs.length === 0, errs.join(' | '));
await browser.close();

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
