/**
 * Chat, live in both directions — and pictures in it — driven end to end.
 *
 * Self-contained against a running Worker and its local D1:
 *
 *   VITE_BASE=/ npm run build
 *   npx wrangler d1 migrations apply crmpro --local
 *   npx wrangler dev --local                     (in another terminal)
 *   npm run test:chatlive
 *
 * BASE (default http://127.0.0.1:8787) and PERSIST (the --persist-to wrangler
 * was started with) say where, when not the defaults.
 *
 * The bugs this exists for were all of the "nothing failed, it just never
 * arrived" kind: a business reply that never reached the widget because it
 * only polled after a handover, an inbox that needed a refresh to show a new
 * enquiry. So the browser half asserts arrival *without a reload*, inside a
 * few seconds — and the API half asserts every refusal around the pictures,
 * because a file store reachable from a public widget is exactly where one
 * tenant reads another's screenshots.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { execSync } from 'node:child_process';

const B = process.env.BASE ?? 'http://127.0.0.1:8787';
const run = Date.now().toString(36);
const out = [];
const ok = (n, p, d = '') => { out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`); if (process.env.PROGRESS) console.error(out.at(-1)); };

const persist = process.env.PERSIST ? ` --persist-to ${process.env.PERSIST}` : '';
const d1 = sql => { try { execSync(`npx wrangler d1 execute crmpro --local${persist} --command ${JSON.stringify(sql)}`, { stdio: 'ignore' }); } catch { /* best effort */ } };
/* A test run is not an attack: sign-up and the public budgets are per address. */
d1('DELETE FROM crm_signup_attempts');
d1("DELETE FROM crm_rate_limits WHERE bucket LIKE 'engage%' OR bucket LIKE 'login%'");

/* `Connection: close` for the same reason security.e2e.mjs gives: d1() blocks
   this process, and a kept-alive socket would be reused after the Worker shut it. */
async function api(path, body, headers = {}) {
  const r = await fetch(`${B}/api/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', ...headers }, body: JSON.stringify(body),
  });
  const type = r.headers.get('Content-Type') ?? '';
  if (type.startsWith('image/')) return { status: r.status, type, bytes: Buffer.from(await r.arrayBuffer()), headers: r.headers };
  return { status: r.status, type, json: await r.json().catch(() => ({})), headers: r.headers };
}
let ipN = 0;
const pub = body => api('engage.php', body, { Origin: 'https://acme-chat.example', 'CF-Connecting-IP': `10.44.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}` });

async function signUp(tag) {
  const email = `chat-${tag}-${run}@example.test`;
  const r = await api('auth.php', { action: 'register', email, name: `Chat ${tag}`, password: 'Correct-horse-9' }, { 'CF-Connecting-IP': `10.45.${tag === 'a' ? 1 : 2}.9` });
  if (!r.json.success) throw new Error(`sign-up ${tag}: ${JSON.stringify(r.json).slice(0, 200)}`);
  return { email, token: r.json.token, acct: r.json.user.accountId };
}
const A = await signUp('a');
const Bt = await signUp('b');
const as = (who, action, extra = {}) => api('engagement.php', { token: who.token, accountId: who.acct, action, ...extra });

/* ── Fixtures ── */
const fresh = await as(Bt, 'support_waiting');
ok('a workspace that never used engagement says so, and nobody is waiting',
  fresh.json.success === true && fresh.json.hasData === false && fresh.json.conversations?.count === 0, JSON.stringify(fresh.json).slice(0, 200));

/* No assistant on this widget: the reply is "a colleague will pick this up",
   which is the visitor waiting for a person — deterministic, no AI key needed. */
const w = await as(A, 'save_widget', { record: { name: `Chat ${run}`, title: 'Acme', features: ['chat'], status: 'live' } });
const key = w.json.item?.public_key;
ok('a live widget exists', !!key, JSON.stringify(w.json).slice(0, 160));

/* A real picture, made by a real browser, for both the API and the screens. */
const browser = await pw.chromium.launch({
  args: ['--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests'],
});
const scratch = await (await browser.newContext()).newPage();
const PNG = await scratch.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 320; c.height = 200;
  const g = c.getContext('2d'); g.fillStyle = '#5b46e5'; g.fillRect(0, 0, 320, 200);
  g.fillStyle = '#fff'; g.font = '28px sans-serif'; g.fillText('screenshot', 70, 110);
  return c.toDataURL('image/png');
});
const pngBytes = Buffer.from(PNG.split(',')[1], 'base64');

/* ═══ The API ═══════════════════════════════════════════════════════════════ */

const st = await pub({ action: 'start', widgetKey: key, context: { page: 'https://acme-chat.example/' } });
const conv = st.json.conversationId;
const vkey = st.json.visitorKey;
const said = await pub({ action: 'send', conversationId: conv, visitorKey: vkey, message: 'My invoices will not download' });
ok('a sent message comes back with its id, so the page can tell it from the poll',
  typeof said.json.message?.id === 'string' && said.json.messages?.[0]?.id, JSON.stringify(said.json).slice(0, 200));

const p0 = await pub({ action: 'poll', conversationId: conv, visitorKey: vkey });
ok('a poll with no cursor returns the thread and a server cursor',
  p0.json.success === true && typeof p0.json.cursor === 'string' && (p0.json.messages ?? []).length >= 2);
ok('every polled message carries its id', (p0.json.messages ?? []).every(m => typeof m.id === 'string'));
const p1 = await pub({ action: 'poll', conversationId: conv, visitorKey: vkey, since: new Date(Date.parse(p0.json.cursor) + 60_000).toISOString() });
ok('a poll from after the last change reads nothing', p1.json.success === true && (p1.json.messages ?? []).length === 0);

const waitA = await as(A, 'support_waiting');
ok('the dashboard counts the visitor waiting for a person',
  waitA.json.hasData === true && waitA.json.conversations?.count === 1 && waitA.json.conversations?.oldestId === conv,
  JSON.stringify(waitA.json).slice(0, 240));
ok('and the conversation is unread', waitA.json.unread === 1, `unread=${waitA.json.unread}`);
const waitB = await as(Bt, 'support_waiting');
ok('another workspace counts none of it', waitB.json.conversations?.count === 0 && waitB.json.unread === 0);
const waitForged = await api('engagement.php', { token: Bt.token, accountId: A.acct, action: 'support_waiting' });
ok('nor can it ask about this one', waitForged.status === 403, `status ${waitForged.status}`);

const list = await as(A, 'conversations');
const row = (list.json.conversations ?? []).find(c => c.id === conv);
ok('the inbox row says it is unread and waiting', row && row.unread >= 1 && !!row.needsHumanSince, JSON.stringify(row ?? {}).slice(0, 200));

const sync0 = await as(A, 'inbox_sync', { since: new Date(Date.now() - 60_000).toISOString() });
ok('inbox_sync returns the changed conversation', (sync0.json.conversations ?? []).some(c => c.id === conv));
const syncB = await as(Bt, 'inbox_sync', { since: new Date(Date.now() - 60_000).toISOString(), conversationId: conv, msgSince: new Date(Date.now() - 60_000).toISOString() });
ok('inbox_sync in another workspace sees neither the row nor its messages',
  syncB.json.success === true && (syncB.json.conversations ?? []).length === 0 && (syncB.json.messages ?? []).length === 0 && !syncB.json.thread,
  JSON.stringify(syncB.json).slice(0, 200));

await as(A, 'reply', { conversationId: conv, message: 'Hello, Sam here — try Billing → Invoices' });
const p2 = await pub({ action: 'poll', conversationId: conv, visitorKey: vkey, since: p0.json.cursor });
ok('the business reply reaches the visitor on the next poll',
  (p2.json.messages ?? []).some(m => m.role === 'agent' && /Sam here/.test(m.body)), JSON.stringify(p2.json).slice(0, 240));
ok('without the author\'s address', !JSON.stringify(p2.json).includes(A.email));
const waitA2 = await as(A, 'support_waiting');
ok('a person replying ends the wait', waitA2.json.conversations?.count === 0, JSON.stringify(waitA2.json.conversations));

/* ── Pictures ── */
const att = await pub({ action: 'attach', conversationId: conv, visitorKey: vkey, image: PNG, w: 320, h: 200 });
const fileId = att.json.message?.attachments?.[0]?.id;
ok('a visitor can send a picture', att.json.success === true && !!fileId, JSON.stringify(att.json).slice(0, 200));
const waitA3 = await as(A, 'support_waiting');
ok('a picture puts the conversation back in front of a person (the assistant cannot see it)', waitA3.json.conversations?.count === 1);

const back = await pub({ action: 'file', conversationId: conv, visitorKey: vkey, fileId });
ok('the visitor gets their own picture back, as the same bytes', back.status === 200 && back.bytes?.equals(pngBytes), `status ${back.status} ${back.type}`);
ok('served as an image, never as a page', back.type === 'image/png'
  && back.headers.get('x-content-type-options') === 'nosniff'
  && /sandbox/.test(back.headers.get('content-security-policy') ?? ''));
const wrongKey = await pub({ action: 'file', conversationId: conv, visitorKey: 'f'.repeat(36), fileId });
ok('not with the wrong visitor key', wrongKey.status === 404 && !wrongKey.bytes, `status ${wrongKey.status}`);

const st2 = await pub({ action: 'start', widgetKey: key });
const otherConv = await pub({ action: 'file', conversationId: st2.json.conversationId, visitorKey: st2.json.visitorKey, fileId });
ok('another conversation, with its own valid key, cannot fetch it', otherConv.status === 404 && !otherConv.bytes, `status ${otherConv.status}`);

const asBiz = await as(A, 'file', { fileId });
ok('the business fetches it with its session', asBiz.status === 200 && asBiz.bytes?.equals(pngBytes), `status ${asBiz.status}`);
const asOther = await as(Bt, 'file', { fileId });
ok('another workspace cannot, from its own', asOther.status === 404 && !asOther.bytes, `status ${asOther.status}`);
const asOtherForged = await api('engagement.php', { token: Bt.token, accountId: A.acct, action: 'file', fileId });
ok('nor by naming this one', asOtherForged.status === 403 && !asOtherForged.bytes, `status ${asOtherForged.status}`);
const noSession = await api('engagement.php', { accountId: A.acct, action: 'file', fileId });
ok('nor with no session at all', noSession.status === 401 && !noSession.bytes, `status ${noSession.status}`);

const notImage = await pub({ action: 'attach', conversationId: conv, visitorKey: vkey, image: `data:image/png;base64,${Buffer.from('<html><script>alert(1)</script></html>').toString('base64')}` });
ok('a file that only claims to be a picture is refused', notImage.status === 422 && notImage.json.code === 'not_image', JSON.stringify(notImage.json).slice(0, 160));
const svg = await pub({ action: 'attach', conversationId: conv, visitorKey: vkey, image: `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64')}` });
ok('an SVG is refused', svg.status === 422, `status ${svg.status}`);
const big = Buffer.alloc(1_700_000, 0); big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff;
const tooBig = await pub({ action: 'attach', conversationId: conv, visitorKey: vkey, image: big.toString('base64') });
ok('an oversized picture is refused before it is stored', tooBig.status === 413 && tooBig.json.code === 'too_large', `status ${tooBig.status}`);
const foreignAttach = await pub({ action: 'attach', conversationId: conv, visitorKey: st2.json.visitorKey, image: PNG });
ok('a picture cannot be put into somebody else\'s conversation', foreignAttach.status === 404, `status ${foreignAttach.status}`);

/* The business replies with a picture; an internal note with one stays inside. */
const rImg = await as(A, 'reply', { conversationId: conv, message: 'Here is where to click', image: PNG, w: 320, h: 200 });
const rNote = await as(A, 'reply', { conversationId: conv, message: 'internal screenshot', image: PNG, internal: true });
ok('the business can reply with a picture', rImg.json.success === true && rNote.json.success === true, JSON.stringify(rImg.json).slice(0, 160));
const p3 = await pub({ action: 'poll', conversationId: conv, visitorKey: vkey, since: p2.json.cursor });
const bizMsg = (p3.json.messages ?? []).find(m => m.role === 'agent' && (m.attachments ?? []).length);
ok('which reaches the visitor with its picture', !!bizMsg, JSON.stringify(p3.json).slice(0, 240));
ok('and the internal note does not', !JSON.stringify(p3.json).includes('internal screenshot'));
const bizFile = bizMsg ? await pub({ action: 'file', conversationId: conv, visitorKey: vkey, fileId: bizMsg.attachments[0].id }) : { status: 0 };
ok('the visitor can open the business\'s picture', bizFile.status === 200, `status ${bizFile.status}`);
const thread = await as(A, 'conversation', { conversationId: conv });
const noteMsg = (thread.json.messages ?? []).find(m => m.body === 'internal screenshot');
const noteFile = JSON.parse(noteMsg?.attachments ?? '[]')[0]?.id;
const peekNote = await pub({ action: 'file', conversationId: conv, visitorKey: vkey, fileId: noteFile });
ok('but never a picture on an internal note', !!noteFile && peekNote.status === 404, `status ${peekNote.status}`);

/* Rate limit per conversation: a chat is not a photo album. */
let limited = false;
for (let i = 0; i < 10 && !limited; i++) {
  const r = await pub({ action: 'attach', conversationId: conv, visitorKey: vkey, image: PNG });
  if (r.status === 429) limited = true;
}
ok('pictures are rate limited per conversation', limited);

/* ═══ The screens ════════════════════════════════════════════════════════════ */
d1("DELETE FROM crm_rate_limits WHERE bucket LIKE 'engage%'");
const errs = [];
/* SHOTS=<dir> keeps screenshots of the screens for a person to look at. */
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

/* The customer's site with the widget, and the business signed in. */
const site = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
site.on('pageerror', e => errs.push(`site: ${String(e).slice(0, 160)}`));
await site.route('http://acme.localhost:9912/**', r => r.fulfill({
  contentType: 'text/html',
  body: `<!doctype html><title>Acme</title><h1>Acme</h1><script src="${B}/widget.js" data-pc-widget="${key}" async></script>`,
}));
await site.goto('http://acme.localhost:9912/');
await site.getByRole('button', { name: 'Open the chat' }).click();
const dlg = site.getByRole('dialog');
await dlg.getByPlaceholder('Type a message…').fill(`Browser question ${run}`);
await site.keyboard.press('Enter');
await site.waitForTimeout(1500);

const appCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await appCtx.addCookies([{ name: 'pc_session', value: A.token, url: B }]);
const app = await appCtx.newPage();
app.on('pageerror', e => errs.push(`app: ${String(e).slice(0, 160)}`));
await app.addInitScript(([acct, email]) => {
  const user = { email, name: 'Sam Agent', role: 'agency', accountId: acct };
  localStorage.setItem('crm_session', JSON.stringify({ token: 'cookie', user, backend: 'php' }));
  localStorage.setItem('crm_active_account', acct);
  localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: acct, name: 'Test', createdAt: new Date().toISOString() }]));
}, [A.acct, A.email]);

/* Dashboard first: the card counts the browser visitor who is waiting. */
await app.goto(`${B}/`, { waitUntil: 'domcontentloaded' });
await app.locator('[data-testid="support-waiting"]').waitFor({ timeout: 15000 }).catch(() => {});
const card = await app.locator('[data-testid="support-waiting"]').innerText().catch(() => '');
ok('the dashboard card shows people waiting for support', /waiting for support/.test(card) && /chats? waiting for a reply/.test(card), card.slice(0, 200));
const badge = await app.locator('[data-testid="support-badge"]').count();
ok('and the nav carries a badge for Customer Engagement', badge === 1);
await app.locator('[data-testid="support-waiting"]').getByRole('button', { name: /Answer the longest wait/ }).click();
await app.waitForURL(/\/engagement\?tab=(inbox|live|tickets)/, { timeout: 8000 }).catch(() => {});
ok('its button goes straight to the queue', /\/engagement\?tab=inbox&c=/.test(app.url()), app.url());

/* Open the browser visitor's conversation in the inbox. */
const convs = await as(A, 'conversations');
const browserConv = (convs.json.conversations ?? []).find(c => c.id !== conv && c.id !== st2.json.conversationId && c.lastAt);
await app.goto(`${B}/engagement?tab=inbox&c=${browserConv?.id}`, { waitUntil: 'domcontentloaded' });
await app.locator('[data-testid="thread"]').waitFor({ timeout: 15000 });
await app.waitForTimeout(800);
ok('the inbox opens the conversation from the link', (await app.locator('[data-testid="thread"]').innerText()).includes(`Browser question ${run}`));

/* Visitor → business, without a reload. */
const t0 = Date.now();
await dlg.getByPlaceholder('Type a message…').fill(`Second line ${run}`);
await site.keyboard.press('Enter');
let seen = false;
while (Date.now() - t0 < 9000 && !seen) {
  await app.waitForTimeout(400);
  seen = (await app.locator('[data-testid="thread"]').innerText()).includes(`Second line ${run}`);
}
ok('a visitor message appears in the open thread without a reload', seen, `${Date.now() - t0} ms`);
ok(`  → within a few seconds (${Date.now() - t0} ms)`, seen && Date.now() - t0 < 7000);

/* Business → visitor, without a reload, inside ~5 s. */
await app.locator('textarea[data-field="message"]').fill(`Reply from the app ${run}`);
/* Ctrl+Enter from the box: the app's own toasts can sit over the button. */
await app.locator('textarea[data-field="message"]').press('Control+Enter');
const t1 = Date.now();
let arrived = false;
while (Date.now() - t1 < 8000 && !arrived) {
  await site.waitForTimeout(300);
  arrived = (await dlg.innerText()).includes(`Reply from the app ${run}`);
}
ok('a business reply appears in the widget without a reload', arrived, `${Date.now() - t1} ms`);
ok(`  → within ~5 s (${Date.now() - t1} ms)`, arrived && Date.now() - t1 <= 5500);

/* A new enquiry, from a second visitor, shows in the list unprompted. */
const st3 = await pub({ action: 'start', widgetKey: key });
await pub({ action: 'identify', conversationId: st3.json.conversationId, visitorKey: st3.json.visitorKey, name: `Newcomer ${run}`, email: `new-${run}@example.test` });
await pub({ action: 'send', conversationId: st3.json.conversationId, visitorKey: st3.json.visitorKey, message: 'Hello?' });
const t2 = Date.now();
let listed = false;
while (Date.now() - t2 < 10000 && !listed) {
  await app.waitForTimeout(500);
  listed = (await app.locator('[data-testid="inbox-list"]').innerText()).includes(`Newcomer ${run}`);
}
ok('a new enquiry appears in the inbox list without a refresh', listed, `${Date.now() - t2} ms`);
const unreadDot = await app.locator(`[data-conversation="${st3.json.conversationId}"] [data-unread]`).count();
ok('with an unread count', unreadDot === 1);

/* Pictures in the screens: the business attaches one, the visitor sees it. */
await app.locator('input[type=file][accept="image/*"]').setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: pngBytes });
await app.waitForTimeout(400);
/* Ctrl+Enter from the box: the app's own toasts can sit over the button. */
await app.locator('textarea[data-field="message"]').press('Control+Enter');
await app.waitForTimeout(1500);
ok('the business thread shows its picture as a thumbnail',
  await app.locator('[data-testid="thread"] [data-attachment] img').count() >= 1);
const t3 = Date.now();
let pic = 0;
while (Date.now() - t3 < 8000 && !pic) {
  await site.waitForTimeout(400);
  pic = await dlg.locator('button[aria-label="Open the picture full size"] img[src^="blob:"]').count();
}
ok('the picture reaches the widget and is drawn', pic >= 1, `${Date.now() - t3} ms`);
if (pic) {
  await dlg.locator('button[aria-label="Open the picture full size"]').last().click();
  ok('clicking it opens it full size', await site.locator('[aria-label="Picture, full size"] img').count() === 1);
  await site.keyboard.press('Escape');
}

/* The visitor pastes a screenshot; the business sees it. */
await dlg.getByPlaceholder('Type a message…').focus();
await site.evaluate(async (dataUrl) => {
  const blob = await (await fetch(dataUrl)).blob();
  const dt = new DataTransfer();
  dt.items.add(new File([blob], 'paste.png', { type: 'image/png' }));
  const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  document.activeElement.dispatchEvent(ev);
}, PNG);
const t4 = Date.now();
let visitorPic = 0;
/* Two: the business's own picture from above, and this one. */
while (Date.now() - t4 < 9000 && visitorPic < 2) {
  await app.waitForTimeout(400);
  visitorPic = await app.locator('[data-testid="thread"] [data-message] [data-attachment] img').count();
}
ok('a pasted screenshot reaches the business inbox', visitorPic >= 2, `${visitorPic} pictures`);
await shot(site, 'widget-pictures');
await shot(app, 'inbox-pictures');

/* Unread dot on the launcher when a reply arrives with the panel shut. */
await dlg.getByRole('button', { name: 'Close' }).click();
await as(A, 'reply', { conversationId: browserConv.id, message: `While you were away ${run}` });
const t5 = Date.now();
let dot = false;
while (Date.now() - t5 < 16000 && !dot) {
  await site.waitForTimeout(500);
  dot = await site.locator('[data-pc-unread="1"]').count() === 1;
}
ok('a reply while the chat is closed puts a dot on the launcher', dot, `${Date.now() - t5} ms`);
await site.getByRole('button', { name: /Open the chat/ }).click();
await site.waitForTimeout(500);
ok('opening the chat clears it', await site.locator('[data-pc-unread="1"]').count() === 0);
ok('and the reply is there', (await dlg.innerText()).includes(`While you were away ${run}`));

/* A person's reply carries their face and name when the widget is given
   them (agentAvatar / agentName); the assistant's never does. The setting
   itself belongs to the widget's configuration, so it is patched in here. */
{
  const page2 = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page2.on('pageerror', e => errs.push(`site2: ${String(e).slice(0, 160)}`));
  await page2.route(`${B}/api/engage.php`, async r => {
    const req = JSON.parse(r.request().postData() || '{}');
    if (req.action !== 'widget') return r.continue();
    const res = await r.fetch();
    const j = await res.json();
    j.widget = { ...j.widget, agentName: 'Sam from Acme', agentAvatar: '/favicon.svg' };
    return r.fulfill({ response: res, json: j });
  });
  await page2.route('http://acme.localhost:9913/**', r => r.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><title>Acme</title><script src="${B}/widget.js" data-pc-widget="${key}" async></script>`,
  }));
  await page2.goto('http://acme.localhost:9913/');
  await page2.getByRole('button', { name: /Open the chat/ }).click();
  const d2 = page2.getByRole('dialog');
  await d2.getByPlaceholder('Type a message…').fill('Is anybody there?');
  await page2.keyboard.press('Enter');
  await page2.waitForTimeout(1200);
  const list2 = await as(A, 'conversations');
  const c2 = (list2.json.conversations ?? [])[0];
  await as(A, 'reply', { conversationId: c2.id, message: `A person answering ${run}` });
  const t6 = Date.now();
  let named = false;
  while (Date.now() - t6 < 8000 && !named) {
    await page2.waitForTimeout(400);
    named = (await d2.innerText()).includes(`A person answering ${run}`);
  }
  const text2 = await d2.innerText();
  ok('a person\'s reply shows their name beside it', named && text2.includes('Sam from Acme'), text2.slice(-200));
  ok('and their photo', await d2.locator(`img[src="${B}/favicon.svg"]`).count() === 1);
  ok('the assistant\'s / system\'s messages carry no face', (text2.match(/Sam from Acme/g) ?? []).length === 1);
  await shot(page2, 'widget-agent-face');
  await page2.context().close();
}

/* Fit: phone and laptop, both screens. */
for (const width of [390, 1280]) {
  await app.setViewportSize({ width, height: 844 });
  await site.setViewportSize({ width, height: 800 });
  await app.waitForTimeout(500);
  const o = await app.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`no horizontal overflow on the inbox at ${width}px`, o === 0, `${o}px`);
  await shot(app, `inbox-${width}`);
  await shot(site, `widget-${width}`);
  const box = await dlg.boundingBox();
  ok(`the widget fits at ${width}px`, !!box && box.x >= 0 && box.x + box.width <= width, JSON.stringify(box));
}
await app.goto(`${B}/`, { waitUntil: 'domcontentloaded' });
await app.locator('[data-testid="support-waiting"]').waitFor({ timeout: 15000 }).catch(() => {});
for (const width of [390, 1280]) {
  await app.setViewportSize({ width, height: 844 });
  await app.waitForTimeout(400);
  const o = await app.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`no horizontal overflow on the dashboard at ${width}px`, o === 0, `${o}px`);
  await shot(app, `dashboard-${width}`);
  if (process.env.SHOTS) await app.locator('[data-testid="support-waiting"]').screenshot({ path: `${process.env.SHOTS}/support-card-${width}.png` }).catch(() => {});
}

ok('no page errors in either browser', errs.length === 0, errs.join(' | '));
await browser.close();

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
