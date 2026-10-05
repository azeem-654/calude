/**
 * "Call us now", the help launcher's home panel, the owner's photo, and the
 * sound controls on both ends — driven end to end.
 *
 * Needs a `VITE_BASE=/` build and `npx wrangler dev --local`, then:
 *   BASE=http://localhost:8787 PERSIST=<persist dir, if not the default> \
 *     node test/voiceCall.e2e.mjs <owner-token> <owner-account> <other-token> <other-account>
 *
 * Three halves, as test:livehelp does it.
 *
 * Over the API: a call rings, can be declined, rings out (the clock is moved
 * on in D1 rather than waited for), and every route that takes an id refuses
 * another workspace. The photo is checked by its bytes: an HTML page, an SVG
 * and an oversized picture are refused whatever they claim to be, and the
 * public address serves exactly what was stored and nothing else.
 *
 * Then two real browsers with fake microphones: a visitor on "their website"
 * calls, the business is rung wherever it is in the app, declines once and
 * answers the next — and audio is shown to flow both ways, mute is shown to
 * switch the sending track off (and the other end to be told), and choosing a
 * microphone is shown to swap the track with replaceTrack. Then the home
 * panel lists exactly what the widget offers, the teaser behaves, and the
 * photo goes in through the widget builder.
 */
import { execSync } from 'node:child_process';
import zlib from 'node:zlib';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const B = process.env.BASE ?? 'http://localhost:8787';
const [TOK, ACCT, OTOK, OACCT] = process.argv.slice(2);
if (!OACCT) { console.error('usage: node test/voiceCall.e2e.mjs <owner-token> <owner-account> <other-token> <other-account>'); process.exit(2); }
const out = [];
const ok = (n, p, d = '') => { out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`); if (process.env.PROGRESS) console.error(out.at(-1)); };

/* `Connection: close`: d1 blocks this process while wrangler runs, and a
   kept-alive socket the Worker closed meanwhile would fail as "other side
   closed" — a fault of the test, not the app. */
const api = async (path, body, headers = {}) => {
  const r = await fetch(`${B}/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Connection: 'close', ...headers },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};
const owner = (action, extra = {}) => api('engagement.php', { token: TOK, accountId: ACCT, action, ...extra });
const other = (action, extra = {}) => api('engagement.php', { token: OTOK, accountId: OACCT, action, ...extra });
let n = 0;
const pub = (body) => api('engage.php', body, {
  Origin: 'https://acme-test.example', 'CF-Connecting-IP': `10.11.${Math.floor(n / 250)}.${(n++ % 250) + 1}`,
});
const persist = process.env.PERSIST ? ` --persist-to ${process.env.PERSIST}` : '';
const d1 = sql => {
  try {
    return JSON.parse(execSync(`npx wrangler d1 execute crmpro --local${persist} --json --command ${JSON.stringify(sql.replace(/\s+/g, ' '))}`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))[0]?.results ?? [];
  } catch (e) { console.error(String(e.stdout ?? e)); return []; }
};
/* Move a ringing call's start back past the ring, instead of waiting it out. */
const age = (id) => d1(`UPDATE crm_live_sessions SET created_at = '${new Date(Date.now() - 10 * 60_000).toISOString()}' WHERE id = '${id}'`);
const SDP = (tag) => `v=0\r\no=- ${tag} 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n`;
const stamp = Date.now().toString(36);

/* A real PNG of any size, made here, so the size check meets a real header. */
function png(w, h) {
  const crcTable = Array.from({ length: 256 }, (_, k) => { let c = k; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 91; raw[o + 1] = 70; raw[o + 2] = 229; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const dataUrl = (buf, type = 'image/png') => `data:${type};base64,${buf.toString('base64')}`;

/* ── Set up ── */
/* The browsers here call from one local address, and a handful of calls an
   hour from one address is the limit by design; a re-run is not an attack. */
d1("DELETE FROM crm_rate_limits WHERE bucket LIKE 'live-start%' OR bucket LIKE 'engage%'");
await owner('save_settings', { record: { businessName: 'Acme Ltd' } });
const callW = await owner('save_widget', {
  record: { name: `Calls ${stamp}`, features: ['chat', 'voice', 'ticket'], status: 'live', agentName: 'Azeem' },
});
const screenW = await owner('save_widget', { record: { name: `Screen only ${stamp}`, features: ['screen'], status: 'live' } });
const chatW = await owner('save_widget', { record: { name: `Chat only ${stamp}`, features: ['chat'], status: 'live' } });
const key = callW.json.item?.public_key;
const wid = callW.json.item?.id;
ok('a widget can offer calls, and keeps the name it is given',
  !!key && JSON.parse(callW.json.item.features).includes('voice') && callW.json.item.agent_name === 'Azeem', JSON.stringify(callW.json).slice(0, 200));

/* ── Refusals ── */
const offChat = await pub({ action: 'live_start', kind: 'voice', widgetKey: chatW.json.item.public_key, name: 'X' });
ok('a widget without calls refuses a call', offChat.status === 403, `status ${offChat.status}`);
const offScreen = await pub({ action: 'live_start', kind: 'voice', widgetKey: screenW.json.item.public_key, name: 'X' });
ok('screen sharing switched on is not calls switched on', offScreen.status === 403, `status ${offScreen.status}`);
const offShare = await pub({ action: 'live_start', widgetKey: key, name: 'X' });
ok('and calls switched on is not screen sharing switched on', offShare.status === 403, `status ${offShare.status}`);

/* ── "Online" is only ever what is known ── */
const chatCfg = await pub({ action: 'widget', widgetKey: chatW.json.item.public_key });
ok('a chat-only widget claims nothing about who is in', chatCfg.json.widget?.online === null, JSON.stringify(chatCfg.json.widget?.online));
d1(`DELETE FROM crm_live_presence WHERE account_id = '${ACCT}'`);
const away = await pub({ action: 'widget', widgetKey: key });
ok('with nobody\'s app open, the widget is told nobody is in', away.json.widget?.online === false, JSON.stringify(away.json.widget?.online));
await owner('live_waiting');
const here = await pub({ action: 'widget', widgetKey: key });
ok('once a signed-in page asks for calls, the widget is told somebody is in', here.json.widget?.online === true, JSON.stringify(here.json.widget?.online));
ok('the public config names who answers and for which business',
  here.json.widget?.agentName === 'Azeem' && here.json.widget?.businessName === 'Acme Ltd' && here.json.widget?.agentAvatar === '',
  JSON.stringify(here.json.widget).slice(0, 300));
const otherWait = await other('live_waiting');
ok('another workspace\'s check does not light this one\'s dot, and sees no calls', otherWait.json.enabled === false && !(otherWait.json.calls ?? []).length, JSON.stringify(otherWait.json));

/* ── A call is declined ── */
const c1 = await pub({ action: 'live_start', kind: 'voice', widgetKey: key, name: 'Cara Caller', email: 'cara@caller.example', subject: 'Billing question' });
ok('a visitor can call', c1.json.success === true && !!c1.json.sessionId, JSON.stringify(c1.json).slice(0, 200));
ok('and is told how long it will ring', c1.json.ringSeconds > 0 && c1.json.ringSeconds <= 120, `ringSeconds ${c1.json.ringSeconds}`);
ok('the reply carries no workspace id', !JSON.stringify(c1.json).includes(ACCT));
await pub({ action: 'live_offer', sessionId: c1.json.sessionId, shareKey: c1.json.shareKey, sdp: SDP('c1') });
const ring = await owner('live_waiting');
const listed = (ring.json.calls ?? []).find(c => c.id === c1.json.sessionId);
ok('the app-wide check lists the ringing call with who and why', listed?.name === 'Cara Caller' && listed?.topic === 'Billing question' && listed?.ready === 1,
  JSON.stringify(ring.json).slice(0, 300));
ok('the ringing list carries no share key or description', !JSON.stringify(ring.json).includes(c1.json.shareKey) && !JSON.stringify(ring.json).includes('v=0'));
ok('a call is not counted as somebody waiting to share a screen', Number(ring.json.waiting) === 0, `waiting ${ring.json.waiting}`);
const listAll = await owner('live_sessions');
ok('Live help lists it as a call', (listAll.json.sessions ?? []).find(s => s.id === c1.json.sessionId)?.kind === 'voice' && listAll.json.voice === true);

const theirs = await other('live_decline', { id: c1.json.sessionId });
const stillRinging = await owner('live_session', { id: c1.json.sessionId });
ok('another workspace cannot decline it', theirs.json.success !== true && stillRinging.json.session?.status === 'waiting',
  `${JSON.stringify(theirs.json)} / ${stillRinging.json.session?.status}`);
const peek = await other('live_session', { id: c1.json.sessionId });
ok('another workspace cannot read it', peek.status === 404, `status ${peek.status}`);
const dec = await owner('live_decline', { id: c1.json.sessionId });
ok('the business can decline', dec.json.success === true, JSON.stringify(dec.json));
const told = await pub({ action: 'live_poll', sessionId: c1.json.sessionId, shareKey: c1.json.shareKey });
ok('the caller is told it was declined — not that it rang out', told.json.status === 'ended' && told.json.endedReason === 'declined', JSON.stringify(told.json).slice(0, 200));
const decTwice = await owner('live_decline', { id: c1.json.sessionId });
ok('declining an ended call says so', decTwice.status === 409, `status ${decTwice.status}`);

/* ── A call rings out ── */
const c2 = await pub({ action: 'live_start', kind: 'voice', widgetKey: key, name: 'Ringo Out', email: 'ringo@caller.example' });
await pub({ action: 'live_offer', sessionId: c2.json.sessionId, shareKey: c2.json.shareKey, sdp: SDP('c2') });
age(c2.json.sessionId);
const gone = await owner('live_waiting');
ok('a call past its ring is no longer offered for answering', !(gone.json.calls ?? []).some(c => c.id === c2.json.sessionId));
const late = await owner('live_answer', { id: c2.json.sessionId, sdp: SDP('late') });
const expired = await pub({ action: 'live_poll', sessionId: c2.json.sessionId, shareKey: c2.json.shareKey });
ok('the caller is told nobody answered', expired.json.status === 'ended' && expired.json.endedReason === 'expired', JSON.stringify(expired.json).slice(0, 200));
ok('answering after the ring has run out does not connect anybody', late.json.success !== true && late.status === 409 && expired.json.answer === '', JSON.stringify(late.json));
const missed = d1(`SELECT kind, summary FROM crm_engage_events WHERE ref_id = '${c2.json.sessionId}'`);
ok('a missed call is recorded for the business, by name', missed.some(e => e.kind === 'live.missed' && /Ringo Out/.test(e.summary)), JSON.stringify(missed));
const shareRow = await pub({ action: 'live_start', widgetKey: screenW.json.item.public_key, name: 'Sharer' });
const declineShare = await owner('live_decline', { id: shareRow.json.sessionId });
ok('Decline is for calls only — a screen share is not ended by it', declineShare.status === 409, `status ${declineShare.status}`);
await pub({ action: 'live_end', sessionId: shareRow.json.sessionId, shareKey: shareRow.json.shareKey });

/* ── The photo ── */
const html = Buffer.from('<!doctype html><script>alert(1)</script>');
const asPng = await owner('widget_avatar', { id: wid, image: dataUrl(html) });
ok('an HTML page labelled as a PNG is refused, naming the box', asPng.status === 422 && asPng.json.field === 'agentAvatar', JSON.stringify(asPng.json));
const svg = await owner('widget_avatar', { id: wid, image: dataUrl(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml') });
ok('an SVG is refused', svg.status === 422, `status ${svg.status}`);
const huge = await owner('widget_avatar', { id: wid, image: dataUrl(png(400, 300)) });
ok('a picture over 256 pixels is refused — the browser shrinks it first', huge.status === 422 && /256/.test(huge.json.error ?? ''), JSON.stringify(huge.json));
const notMine = await other('widget_avatar', { id: wid, image: dataUrl(png(64, 64)) });
ok('another workspace cannot set this widget\'s photo', notMine.status === 404, `status ${notMine.status}`);
const small = png(96, 96);
const good = await owner('widget_avatar', { id: wid, image: dataUrl(small) });
ok('a small PNG is accepted', good.json.success === true && /^[a-f0-9]{36}$/.test(good.json.key ?? ''), JSON.stringify(good.json));
const cfg2 = await pub({ action: 'widget', widgetKey: key });
const avatarUrl = cfg2.json.widget?.agentAvatar ?? '';
ok('the public config gives its address, which names nothing but the picture',
  avatarUrl.includes(`/api/widget-avatar.php?k=${good.json.key}`) && !avatarUrl.includes(wid) && !avatarUrl.includes(ACCT), avatarUrl);
const img = await fetch(`${B}/api/widget-avatar.php?k=${good.json.key}`);
const bytes = Buffer.from(await img.arrayBuffer());
ok('the address serves exactly the picture, as an image that is not sniffed',
  img.status === 200 && img.headers.get('content-type') === 'image/png' && img.headers.get('x-content-type-options') === 'nosniff' && bytes.equals(small),
  `${img.status} ${img.headers.get('content-type')} ${bytes.length}/${small.length}`);
const guess = await fetch(`${B}/api/widget-avatar.php?k=${'0'.repeat(36)}`);
const junk = await fetch(`${B}/api/widget-avatar.php?k=../../etc`);
ok('a guessed or malformed address is not found', guess.status === 404 && junk.status === 404, `${guess.status} ${junk.status}`);
const replaced = await owner('widget_avatar', { id: wid, image: dataUrl(png(80, 80)) });
const old = await fetch(`${B}/api/widget-avatar.php?k=${good.json.key}`);
ok('a new photo gets a new address, and the old one stops answering', replaced.json.key && replaced.json.key !== good.json.key && old.status === 404, `${old.status}`);
const keep = await owner('save_widget', { record: { ...callW.json.item, id: wid, agentName: 'Azeem', features: ['chat', 'voice', 'ticket'], status: 'live' } });
ok('saving the widget from a form keeps its photo', keep.json.item?.agent_avatar_key === replaced.json.key, JSON.stringify(keep.json.item?.agent_avatar_key));

/* ═══ Two browsers ═══════════════════════════════════════════════════════ */

const browser = await pw.chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required',
    '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests',
  ],
});
const errs = [];
/* Every connection made on the page, and every track swap, where the test
   can see them. The product exposes neither; this is the test's own window. */
const watch = () => {
  window.__pcs = [];
  window.__replaced = 0;
  const PC = window.RTCPeerConnection;
  window.RTCPeerConnection = function (...a) { const pc = new PC(...a); window.__pcs.push(pc); return pc; };
  window.RTCPeerConnection.prototype = PC.prototype;
  const rt = RTCRtpSender.prototype.replaceTrack;
  RTCRtpSender.prototype.replaceTrack = function (t) { window.__replaced++; return rt.call(this, t); };
};
const audioStats = (page) => page.evaluate(async () => {
  const pc = window.__pcs.at(-1);
  if (!pc) return null;
  const s = await pc.getStats();
  let sent = 0; let got = 0;
  s.forEach(r => {
    if (r.type === 'outbound-rtp' && r.kind === 'audio') sent += r.bytesSent ?? 0;
    if (r.type === 'inbound-rtp' && r.kind === 'audio') got += r.bytesReceived ?? 0;
  });
  const snd = pc.getSenders().find(x => x.track?.kind === 'audio');
  return { sent, got, enabled: snd?.track?.enabled ?? null, trackId: snd?.track?.id ?? '', label: snd?.track?.label ?? '' };
});

const page = `<!doctype html><meta name=viewport content="width=device-width"><title>Acme</title><h1>Acme pricing</h1>
<p>${'Plans and prices. '.repeat(40)}</p>`;
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctxA.addInitScript(watch);
const site = await ctxA.newPage();
site.on('pageerror', e => errs.push(`site: ${String(e).slice(0, 160)}`));
await site.route('http://acme.localhost:9911/**', r => r.fulfill({
  contentType: 'text/html', body: `${page}<script src="${B}/widget.js" data-pc-widget="${key}" async></script>`,
}));
await site.goto('http://acme.localhost:9911/pricing');
const launcher = site.getByRole('button', { name: /open the chat/i });
await launcher.waitFor();
const launcherText = await launcher.innerText();
ok('the launcher says what it is, not just an icon', /Help/.test(launcherText), launcherText);
await launcher.click();
const dlg = site.getByRole('dialog');
const menu = await dlg.innerText();
const options = await dlg.locator('button').evaluateAll(bs => bs.map(b => b.innerText.split('\n')[0]).filter(t => t && !/^(Back|Close)$/.test(t)));
ok('the home panel lists exactly what this widget offers, in order',
  JSON.stringify(options) === JSON.stringify(['Start an online call', 'Live chat', 'Submit a ticket', 'Check a ticket']), JSON.stringify(options));
ok('and says who answers, from where', /Azeem from Acme Ltd/.test(menu), menu.slice(0, 200));
const face = await dlg.locator('img').first().evaluate(i => ({ w: i.naturalWidth, src: i.src })).catch(() => null);
ok('with the owner\'s photo, loaded', !!face && face.w > 0 && face.src.includes('widget-avatar.php'), JSON.stringify(face));

/* The business: signed in, on the dashboard — nowhere near Live help. */
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctxB.addCookies([{ name: 'pc_session', value: TOK, url: B }]);
await ctxB.addInitScript(watch);
await ctxB.addInitScript(([acct]) => {
  const user = { email: 'x', name: 'Agent', role: 'agency', accountId: acct };
  localStorage.setItem('crm_session', JSON.stringify({ token: 'cookie', user, backend: 'php' }));
  localStorage.setItem('crm_active_account', acct);
  localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: acct, name: 'Test', createdAt: new Date().toISOString() }]));
}, [ACCT]);
const app = await ctxB.newPage();
app.on('pageerror', e => errs.push(`app: ${String(e).slice(0, 160)}`));
await app.goto(`${B}/`, { waitUntil: 'domcontentloaded' });
await app.waitForTimeout(2500);

async function call(name) {
  await dlg.getByRole('button', { name: /Start an online call/ }).click();
  const form = await dlg.innerText();
  if (await dlg.getByLabel('Your name').count()) await dlg.getByLabel('Your name').fill(name);
  if (await dlg.getByLabel(/Email/).count()) await dlg.getByLabel(/Email/).fill('caller@visitor.example');
  await dlg.getByLabel(/What is it about/).fill('Cannot find my invoice');
  await dlg.getByRole('button', { name: 'Call now' }).click();
  return form;
}
const form = await call('Vera Visitor');
ok('the call form says it is a browser call, not a phone call', /not a phone call/.test(form) && /microphone/.test(form), form.slice(0, 300));
await site.waitForTimeout(5000);
const ringingText = await dlg.innerText();
ok('the caller hears it ringing', /Ringing/.test(ringingText) && /Cancel call/.test(ringingText), ringingText.slice(0, 200));
ok('and can mute before anybody answers', await dlg.getByRole('button', { name: 'Mute' }).count() === 1);

const toast = app.getByRole('alert', { name: 'Incoming call' });
await toast.waitFor({ timeout: 12_000 }).catch(() => undefined);
const toastText = await toast.innerText().catch(() => '');
ok('the business is rung wherever it is in the app', /INCOMING CALL/.test(toastText) && /Vera Visitor/.test(toastText) && /Cannot find my invoice/.test(toastText), toastText);
if (process.env.SHOTS) await app.screenshot({ path: `${process.env.SHOTS}/incoming.png` });
const toastBox = await toast.boundingBox().catch(() => null);
ok('the incoming-call alert fits the window', !!toastBox && toastBox.x >= 0 && toastBox.x + toastBox.width <= 1280, JSON.stringify(toastBox));
await toast.getByRole('button', { name: /Decline/ }).click();
await site.waitForTimeout(3500);
const declined = await dlg.innerText();
ok('declining tells the caller at once, and offers a message or a ticket',
  /could not take the call/.test(declined) && /Leave us a message/.test(declined) && /Submit a ticket/.test(declined), declined.slice(0, 300));
const noMic = await site.evaluate(() => window.__pcs.at(-1)?.connectionState);
ok('and the caller\'s connection is closed', noMic === 'closed', String(noMic));

/* Call again, and answer from the alert. */
await dlg.getByRole('button', { name: 'Back' }).last().click();
await call('Vera Visitor');
await toast.waitFor({ timeout: 12_000 });
await toast.getByRole('button', { name: /Answer/ }).click();
await app.waitForURL(/tab=live/, { timeout: 10_000 });
let connected = false;
for (let i = 0; i < 25 && !connected; i++) {
  await app.waitForTimeout(800);
  connected = /On a call ·/.test(await app.locator('main').innerText());
}
ok('Answer in the alert opens Live help and connects the call', connected, (await app.locator('main').innerText()).slice(0, 300));
ok('the address no longer carries the call to answer', !/answer=/.test(app.url()), app.url());
await site.waitForTimeout(3000);
const onCall = await dlg.innerText();
ok('the caller is told who they are talking to, with the call\'s length', /On a call with/.test(onCall) && /\d:\d\d/.test(onCall), onCall.slice(0, 200));
/* SHOTS=<dir> keeps a picture of both ends mid-call, for a person to look at. */
if (process.env.SHOTS) { await site.screenshot({ path: `${process.env.SHOTS}/call-widget.png` }); await app.screenshot({ path: `${process.env.SHOTS}/call-app.png`, fullPage: true }); }

await site.waitForTimeout(2500);
const a1 = await audioStats(site);
const b1 = await audioStats(app);
await site.waitForTimeout(2500);
const a2 = await audioStats(site);
const b2 = await audioStats(app);
ok('audio flows from the caller to the business', b2.got > b1.got && a2.sent > a1.sent, JSON.stringify({ a1, a2, b1, b2 }));
ok('and from the business to the caller', a2.got > a1.got && b2.sent > b1.sent, JSON.stringify({ a1, a2, b1, b2 }));

let talking = false;
for (let i = 0; i < 20 && !talking; i++) {
  await app.waitForTimeout(300);
  talking = /Vera Visitor — talking/.test(await app.locator('[data-live-audio]').innerText());
}
ok('the business sees when the caller is talking', talking);

/* Mute: the track really stops, and the other end is told. */
await dlg.getByRole('button', { name: 'Mute' }).click();
await site.waitForTimeout(1200);
const muted = await audioStats(site);
ok('mute switches the sending track off', muted.enabled === false, JSON.stringify(muted));
ok('and the caller\'s screen says so', /muted/.test(await site.locator('[data-pc-me]').innerText()));
ok('and the business is told the caller muted', /Vera Visitor — muted/.test(await app.locator('[data-live-audio]').innerText()));
await dlg.getByRole('button', { name: 'Unmute' }).click();
await site.waitForTimeout(800);
ok('unmute switches it back on', (await audioStats(site)).enabled === true);

/* Choosing a microphone swaps the track in place. */
const micSel = dlg.getByRole('combobox', { name: /^Microphone/ });
ok('the caller can choose a microphone', await micSel.count() === 1);
const before = await audioStats(site);
const replacedBefore = await site.evaluate(() => window.__replaced);
const choices = await micSel.locator('option').evaluateAll(os => os.map(o => o.value));
await micSel.selectOption(choices.at(-1));
await site.waitForTimeout(1500);
const after = await audioStats(site);
ok('choosing one replaces the sending track without hanging up',
  (await site.evaluate(() => window.__replaced)) > replacedBefore && after.trackId !== before.trackId && /Fake Audio Input 2/.test(after.label),
  JSON.stringify({ before, after }));
const spk = dlg.getByRole('combobox', { name: /^Speaker/ });
const sinkable = await site.evaluate(() => 'setSinkId' in HTMLMediaElement.prototype);
ok('the speaker choice is drawn where the browser can switch speakers', sinkable ? await spk.count() === 1 : await spk.count() === 0);
if (sinkable) {
  const outs = await spk.locator('option').evaluateAll(os => os.map(o => o.value));
  await spk.selectOption(outs.at(-1));
  await site.waitForTimeout(500);
  const sink = await site.evaluate(() => document.querySelector('audio[data-pc-remote-audio]')?.sinkId);
  ok('and choosing one sends the call there', sink === outs.at(-1), `${sink} vs ${outs.at(-1)}`);
}
await dlg.getByLabel('Speaker volume').evaluate(r => { r.value = '0.3'; r.dispatchEvent(new Event('input', { bubbles: true })); });
const vol = await site.evaluate(() => document.querySelector('audio[data-pc-remote-audio]')?.volume);
ok('the volume control sets how loud they are played', Math.abs(vol - 0.3) < 0.01, String(vol));

/* The business's own controls. */
const appMic = app.locator('[data-live-audio]').getByRole('combobox', { name: /^Microphone/ });
ok('the business can choose a microphone too', await appMic.count() === 1);
const bBefore = await audioStats(app);
const bOpts = await appMic.locator('option').evaluateAll(os => os.map(o => o.value));
await appMic.selectOption(bOpts.at(-1));
await app.waitForTimeout(1500);
const bAfter = await audioStats(app);
ok('and it swaps the track in place', bAfter.trackId !== bBefore.trackId && (await app.evaluate(() => window.__replaced)) >= 2, JSON.stringify({ bBefore, bAfter }));
await app.locator('[data-live-audio]').getByRole('button', { name: 'Mute' }).click();
await app.waitForTimeout(1200);
ok('the business can mute, and the caller is told', (await audioStats(app)).enabled === false && /muted/.test(await site.locator('[data-pc-them]').innerText()),
  await site.locator('[data-pc-them]').innerText());
await app.locator('[data-live-audio]').getByRole('button', { name: 'Unmute' }).click();

const o1280 = await app.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok('no horizontal overflow on the call screen at 1280px', o1280 === 0, `${o1280}px`);
await app.setViewportSize({ width: 390, height: 844 });
await app.waitForTimeout(600);
const o390 = await app.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok('no horizontal overflow on the call screen at 390px', o390 === 0, `${o390}px`);
await app.setViewportSize({ width: 1280, height: 900 });

await app.locator('main').getByRole('button', { name: /Hang up/ }).click();
await site.waitForTimeout(2500);
const ended = await dlg.innerText();
ok('hanging up from the business tells the caller, with how long it lasted', /The call has ended/.test(ended) && /Call length \d:\d\d/.test(ended), ended.slice(0, 200));
const rows = await owner('live_sessions');
ok('and Live help records it as answered and ended', (rows.json.sessions ?? []).some(s => s.kind === 'voice' && s.status === 'ended' && s.endedReason === 'agent' && s.agentEmail));

/* Nobody answers: the ring runs out (moved on in D1), and the caller is told. */
await dlg.getByRole('button', { name: 'Back' }).last().click();
await call('Vera Visitor');
await site.waitForTimeout(4500);
const ringing = (await owner('live_waiting')).json.calls ?? [];
ringing.forEach(c => age(c.id));
await site.waitForTimeout(4000);
const nobody = await dlg.innerText();
ok('a call nobody answers ends with "no one is available", and the ways to leave a message',
  /No one is available/.test(nobody) && /Leave us a message/.test(nobody), nobody.slice(0, 300));
await dlg.getByRole('button', { name: 'Leave us a message' }).click();
ok('and "Leave us a message" opens the chat', await dlg.getByLabel('Message').count() === 1);

/* Phone width: the widget fits and the page does not scroll sideways. */
await site.setViewportSize({ width: 390, height: 780 });
await site.waitForTimeout(400);
const box = await dlg.boundingBox();
ok('the widget fits a phone screen', !!box && box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box));
const s390 = await site.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok('no horizontal overflow on the customer\'s page at 390px', s390 === 0, `${s390}px`);

/* ── The teaser: on every page load, wide screens only, closed only for that page ── */
const ctxC = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const mk = await ctxC.newPage();
mk.on('pageerror', e => errs.push(`teaser: ${String(e).slice(0, 160)}`));
await mk.route('http://acme.localhost:9911/**', r => r.fulfill({
  contentType: 'text/html', body: `${page}<script src="${B}/widget.js" data-pc-widget="${key}" data-pc-teaser async></script>`,
}));
await mk.goto('http://acme.localhost:9911/');
const teaser = mk.getByRole('complementary', { name: 'Ways to reach us' });
await teaser.waitFor({ timeout: 9000 }).catch(() => undefined);
const tText = await teaser.innerText().catch(() => '');
ok('the teaser appears and names the same ways in as the home panel', /Start an online call/.test(tText) && /Live chat/.test(tText) && /Submit a ticket/.test(tText) && !/Share your screen/.test(tText), tText);
const tBox = await teaser.boundingBox().catch(() => null);
ok('it sits on screen', !!tBox && tBox.x >= 0 && tBox.x + tBox.width <= 1280 && tBox.y >= 0, JSON.stringify(tBox));
const tBg = await teaser.evaluate(n => getComputedStyle(n).backgroundColor);
ok('and is see-through', /rgba\(.*, 0?\.\d+\)/.test(tBg), tBg);
await mk.reload();
await teaser.waitFor({ timeout: 9000 }).catch(() => undefined);
ok('it is there again on the next page', await teaser.count() === 1);
/* The launcher on the site: frosted glass, moving in a loop, the blur deepening while the page scrolls. */
const launch = mk.getByRole('button', { name: /^Open the chat/ });
const lk = await launch.evaluate(n => { const c = getComputedStyle(n); return { cls: n.className, anim: c.animationName, blur: c.backdropFilter || c.webkitBackdropFilter || '', bg: c.backgroundImage }; });
ok('on the site the launcher is frosted glass that moves in a loop', /pc-launch-site/.test(lk.cls) && /pcLaunchDrift/.test(lk.anim) && /pcLaunchGlow/.test(lk.anim) && /blur\(12px\)/.test(lk.blur) && /gradient/.test(lk.bg), JSON.stringify(lk));
await mk.evaluate(() => { document.body.style.minHeight = '3000px'; window.scrollBy(0, 400); });
await mk.waitForTimeout(80);
const scrolled = await launch.evaluate(n => n.className);
ok('…its blur deepens while the page scrolls under it', /pc-launch-scroll/.test(scrolled), scrolled);
if (process.env.SHOTS) await launch.screenshot({ path: `${process.env.SHOTS}/launcher-site.png` });
/* Signed in (HelpLauncher calls appMode): plain, still, no card. */
await mk.evaluate(() => window.ProtectedCentralChat.appMode());
const quiet = await launch.evaluate(n => { const c = getComputedStyle(n); return { cls: n.className, anim: c.animationName, blur: c.backdropFilter || '' }; });
ok('in app mode the launcher is plain and still, and the card is gone', !/pc-launch-site/.test(quiet.cls) && quiet.anim === 'none' && !/blur/.test(quiet.blur)
  && await mk.getByRole('complementary', { name: 'Ways to reach us' }).count() === 0, JSON.stringify(quiet));
await mk.reload();
await teaser.waitFor({ timeout: 9000 }).catch(() => undefined);
const glyphs = await teaser.locator('.pc-tease-glyph').evaluateAll(ns => ns.map(n => getComputedStyle(n).animationName));
ok('each option\'s icon moves in a loop of its own', glyphs.length >= 3 && glyphs.every(a => a && a !== 'none') && new Set(glyphs).size >= 3, JSON.stringify(glyphs));
await teaser.getByRole('button', { name: 'Dismiss' }).click();
await mk.waitForTimeout(2500);
ok('closed, it stays away on this page', await mk.getByRole('complementary', { name: 'Ways to reach us' }).count() === 0);
await mk.reload();
await teaser.waitFor({ timeout: 9000 }).catch(() => undefined);
ok('…and is open again on the next load', await teaser.count() === 1);
{
  const ctxE = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const appLike = await ctxE.newPage();
  await appLike.route('http://acme.localhost:9911/**', r => r.fulfill({
    contentType: 'text/html', body: `${page}<script src="${B}/widget.js" data-pc-widget="${key}" async></script>`,
  }));
  await appLike.goto('http://acme.localhost:9911/');
  const l2 = appLike.getByRole('button', { name: /^Open the chat/ });
  await l2.waitFor({ timeout: 9000 }).catch(() => undefined);
  await appLike.waitForTimeout(1500);
  const still = await l2.evaluate(n => getComputedStyle(n).animationName + '|' + n.className).catch(() => 'missing');
  ok('inside the app (no data-pc-teaser) the launcher never animates', still.startsWith('none|') && !/pc-launch-site/.test(still), still);
  await ctxE.close();
}
const ctxD = await browser.newContext({ viewport: { width: 390, height: 780 } });
const phone = await ctxD.newPage();
await phone.route('http://acme.localhost:9911/**', r => r.fulfill({
  contentType: 'text/html', body: `${page}<script src="${B}/widget.js" data-pc-widget="${key}" data-pc-teaser async></script>`,
}));
await phone.goto('http://acme.localhost:9911/');
await phone.waitForTimeout(9500);
ok('never on a phone, over what somebody is reading', await phone.getByRole('complementary', { name: 'Ways to reach us' }).count() === 0);
const p390 = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok('and the launcher alone does not widen the page', p390 === 0, `${p390}px`);

/* ── The photo, through the widget builder ── */
await app.goto(`${B}/engagement?tab=widgets`, { waitUntil: 'domcontentloaded' });
await app.waitForTimeout(2500);
const rowsW = app.locator('main').locator('div', { hasText: `Calls ${stamp}` }).filter({ has: app.getByRole('button', { name: 'Edit' }) });
await rowsW.last().getByRole('button', { name: 'Edit' }).click();
await app.getByLabel('Your name in the widget').waitFor();
ok('the builder shows "Your photo and name" with the saved name', await app.getByLabel('Your name in the widget').inputValue() === 'Azeem');
await app.getByLabel('Upload your photo').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png(640, 480) });
await app.waitForTimeout(2500);
const shown = await app.locator('main img[src*="widget-avatar.php"]').first().evaluate(i => ({ w: i.naturalWidth, h: i.naturalHeight, src: i.src })).catch(() => null);
ok('a large photo is cut square and shrunk in the browser, then shown', !!shown && shown.w === 256 && shown.h === 256, JSON.stringify(shown));
if (shown) {
  const r = await fetch(shown.src);
  ok('and stored as a small JPEG', r.headers.get('content-type') === 'image/jpeg' && Number((await r.arrayBuffer()).byteLength) < 60_000);
}
const ow = await app.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok('no horizontal overflow on the widget builder', ow === 0, `${ow}px`);

ok('no page errors in any browser', errs.length === 0, errs.join(' | '));
await browser.close();

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
