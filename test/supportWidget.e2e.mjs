/**
 * The help button's Report a problem and Check ticket status (2026-11-15),
 * driven end to end against a running Worker and its local D1:
 *
 *   VITE_BASE=/ npm run build
 *   npx wrangler d1 migrations apply crmpro --local
 *   npx wrangler dev --local                     (in another terminal)
 *   npm run test:supportwidget
 *
 * BASE / PERSIST as test:chatlive. SHOTS=<dir> keeps screenshots.
 *
 * What it guards: a report is a ticket with its screenshots beside it, in
 * that widget's workspace only; an email address alone never lists anybody's
 * tickets (a mailed code does, and five wrong guesses kill it); a signed-in
 * customer sees their own tickets at once and nobody else's; and in the app
 * the widget's option opens the screenshot sheet now the floating Protron is
 * not on live.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { execSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';

const B = process.env.BASE ?? 'http://127.0.0.1:8787';
const run = Date.now().toString(36);
const out = [];
const ok = (n, p, d = '') => { out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`); if (process.env.PROGRESS) console.error(out.at(-1)); };
const persist = process.env.PERSIST ? ` --persist-to ${process.env.PERSIST}` : '';
const d1 = (sql, json = false) => {
  try {
    const r = execSync(`npx wrangler d1 execute crmpro --local${persist} --json --command ${JSON.stringify(sql)}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    return json ? JSON.parse(r)[0]?.results ?? [] : null;
  } catch { return json ? [] : null; }
};
d1('DELETE FROM crm_signup_attempts');
d1("DELETE FROM crm_rate_limits WHERE bucket LIKE 'engage%' OR bucket LIKE 'login%' OR bucket LIKE 'ticket-code%' OR bucket LIKE 'support-report%'");

async function api(path, body, headers = {}) {
  const r = await fetch(`${B}/api/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', ...headers }, body: JSON.stringify(body),
  });
  const type = r.headers.get('Content-Type') ?? '';
  if (type.startsWith('image/')) return { status: r.status, type, bytes: Buffer.from(await r.arrayBuffer()) };
  return { status: r.status, type, json: await r.json().catch(() => ({})) };
}
let ipN = 0;
const pub = body => api('engage.php', body, { Origin: 'https://acme-help.example', 'CF-Connecting-IP': `10.61.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}` });

async function signUp(tag) {
  const email = `sw-${tag}-${run}@example.test`;
  const r = await api('auth.php', { action: 'register', email, name: `Help ${tag}`, password: 'Correct-horse-9' }, { 'CF-Connecting-IP': `10.62.${tag.charCodeAt(0) % 200}.9` });
  if (!r.json.success) throw new Error(`sign-up ${tag}: ${JSON.stringify(r.json).slice(0, 200)}`);
  return { email, token: r.json.token, acct: r.json.user.accountId };
}
const A = await signUp('a');
const Bt = await signUp('b');
const as = (who, action, extra = {}) => api('engagement.php', { token: who.token, accountId: who.acct, action, ...extra });

const w = await as(A, 'save_widget', { record: { name: `Help ${run}`, title: 'Acme help', features: ['chat', 'ticket'], status: 'live' } });
const key = w.json.item?.public_key;
ok('a live widget with chat and tickets exists', !!key, JSON.stringify(w.json).slice(0, 160));
const wb = await as(Bt, 'save_widget', { record: { name: `Other ${run}`, features: ['chat', 'ticket'], status: 'live' } });
const keyB = wb.json.item?.public_key;

const browser = await pw.chromium.launch({
  args: ['--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests'],
});
const scratch = await (await browser.newContext()).newPage();
const PNG = await scratch.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 320; c.height = 200;
  const g = c.getContext('2d'); g.fillStyle = '#e11d48'; g.fillRect(0, 0, 320, 200);
  return c.toDataURL('image/png');
});
const pngBytes = Buffer.from(PNG.split(',')[1], 'base64');

/* ═══ API: Report a problem ═════════════════════════════════════════════ */
const visitor = `visitor-${run}@example.test`;
const noEmail = await pub({ action: 'report', widgetKey: key, description: 'The booking page will not save' });
ok('a visitor report without an email names the email box', noEmail.json.success === false && noEmail.json.field === 'report.email', JSON.stringify(noEmail.json));
const short = await pub({ action: 'report', widgetKey: key, email: visitor, description: 'no' });
ok('a report that says nothing names the description box', short.json.field === 'report.description', JSON.stringify(short.json));
const notPic = await pub({ action: 'report', widgetKey: key, email: visitor, description: 'It broke here', pictures: ['data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64')] });
ok('something that is not a picture is refused by its bytes', notPic.json.success === false && notPic.json.field === 'report.pictures', JSON.stringify(notPic.json));
const rep = await pub({ action: 'report', widgetKey: key, name: 'Vee', email: visitor, description: `Saving the booking page does nothing ${run}`, pictures: [PNG], context: { page: 'https://acme-help.example/book' } });
ok('a visitor report is filed as a ticket with a reference and key', rep.json.success === true && /^[A-Z]+-\d+$/.test(rep.json.reference ?? '') && !!rep.json.guestKey, JSON.stringify(rep.json));
ok('a customer\'s widget sends no email to Protected Central', rep.json.emailed === 'n/a', String(rep.json.emailed));

const tickets = await as(A, 'tickets');
const row = (tickets.json.tickets ?? []).find(t => t.reference === rep.json.reference);
ok('the business sees it in Tickets, as a high-priority problem', row && row.category === 'problem' && row.priority === 'high' && row.source === 'report', JSON.stringify(row ?? {}));
const detail = await as(A, 'ticket', { id: row?.id });
const pic = detail.json.pictures?.[0];
ok('with its screenshot beside it', detail.json.pictures?.length === 1 && pic?.mime === 'image/png', JSON.stringify(detail.json.pictures));
ok('and where it was sent from', /acme-help\.example\/book/.test(String(detail.json.ticket?.body ?? '')));
const bytes = await as(A, 'file', { fileId: pic?.id });
ok('the screenshot comes back as the same bytes', bytes.status === 200 && bytes.bytes?.equals(pngBytes), `status ${bytes.status}`);
const foreign = await as(Bt, 'file', { fileId: pic?.id });
ok('another workspace cannot fetch it', foreign.status === 404, `status ${foreign.status}`);
const foreignT = await as(Bt, 'ticket', { id: row?.id });
ok('nor read the ticket', foreignT.json.success !== true, JSON.stringify(foreignT.json).slice(0, 120));
const pubFile = await pub({ action: 'file', conversationId: row?.id, visitorKey: rep.json.guestKey, fileId: pic?.id });
ok('the public file action cannot reach a ticket\'s pictures', pubFile.status !== 200, `status ${pubFile.status}`);

/* ═══ API: Check ticket status ══════════════════════════════════════════ */
const bare = await pub({ action: 'my_tickets', widgetKey: key, email: visitor });
ok('an email address alone lists nothing', bare.json.success === false && !bare.json.tickets, JSON.stringify(bare.json).slice(0, 160));
const code0 = await pub({ action: 'ticket_code', widgetKey: key, email: visitor });
ok('with no mailbox, asking for a code says so and points at the reference', code0.json.success === false && code0.json.code === 'no_mailbox', JSON.stringify(code0.json));

/* The code as ticket_code would have mailed it (the hash is the server's). */
const code = String(randomBytes(3).readUIntBE(0, 3) % 1_000_000).padStart(6, '0');
const hash = createHash('sha256').update(`${A.acct}|${visitor}|${code}`).digest('hex');
d1(`INSERT INTO crm_ticket_lookup_codes (id, account_id, email, code_hash, attempts, expires_at, created_at) VALUES ('tlc-${run}', '${A.acct}', '${visitor}', '${hash}', 0, ${Math.floor(Date.now() / 1000) + 900}, '${new Date().toISOString()}')`);
const wrong = await pub({ action: 'my_tickets', widgetKey: key, email: visitor, code: code === '000000' ? '111111' : '000000' });
ok('a wrong code is refused on the code box', wrong.json.code === 'wrong' && wrong.json.field === 'status.code', JSON.stringify(wrong.json));
const right = await pub({ action: 'my_tickets', widgetKey: key, email: visitor, code });
const mine = right.json.tickets ?? [];
ok('the right code lists that address\'s tickets', right.json.success === true && mine.some(t => t.reference === rep.json.reference), JSON.stringify(right.json).slice(0, 200));
ok('without the guest key or internal notes', !JSON.stringify(right.json).includes(rep.json.guestKey) && mine.every(t => !('guest_key' in t)));
const otherWidget = await pub({ action: 'my_tickets', widgetKey: keyB, email: visitor, code });
ok('the same code opens nothing at another business\'s widget', otherWidget.json.success === false, JSON.stringify(otherWidget.json).slice(0, 120));
for (let i = 0; i < 5; i++) await pub({ action: 'my_tickets', widgetKey: key, email: visitor, code: '999999' === code ? '888888' : '999999' });
const dead = await pub({ action: 'my_tickets', widgetKey: key, email: visitor, code });
ok('five wrong guesses kill the code, even for the right one', dead.json.code === 'dead', JSON.stringify(dead.json));

/* Signed in: by the session's email, nothing typed. */
const signedRep = await pub({ action: 'report', widgetKey: key, token: A.token, email: 'typed-lie@example.test', description: `Signed-in report ${run}` });
ok('a signed-in report is filed under the session\'s email, not the typed one', signedRep.json.success === true, JSON.stringify(signedRep.json));
const own = await pub({ action: 'my_tickets', widgetKey: key, token: A.token });
ok('signed in, their tickets are listed at once', own.json.success === true && own.json.signedIn === true
  && (own.json.tickets ?? []).some(t => t.reference === signedRep.json.reference), JSON.stringify(own.json).slice(0, 200));
ok('and not the visitor\'s', !(own.json.tickets ?? []).some(t => t.reference === rep.json.reference));
const ownB = await pub({ action: 'my_tickets', widgetKey: key, token: Bt.token });
ok('another signed-in customer sees none of them', ownB.json.success === true && (ownB.json.tickets ?? []).length === 0, JSON.stringify(ownB.json).slice(0, 160));

/* ═══ API: How did we do? ══════════════════════════════════════════════ */
const early = await pub({ action: 'rate_ticket', ticketRef: rep.json.reference, guestKey: rep.json.guestKey, score: 4 });
ok('a ticket cannot be rated before it is resolved, said at the score', early.json.success === false && early.json.field === 'csat.score', JSON.stringify(early.json));
await as(A, 'set_ticket', { id: row?.id, status: 'resolved', priority: 'high' });
const outOf = await pub({ action: 'rate_ticket', ticketRef: rep.json.reference, guestKey: rep.json.guestKey, score: 9 });
ok('a score outside 1–5 is refused at the score', outOf.json.field === 'csat.score', JSON.stringify(outOf.json));
const badKey = await pub({ action: 'rate_ticket', ticketRef: rep.json.reference, guestKey: 'nope', score: 2 });
ok('a wrong key rates nothing', badKey.json.success === false && badKey.json.code === 'no-match', JSON.stringify(badKey.json));
const rated = await pub({ action: 'rate_ticket', ticketRef: rep.json.reference, guestKey: rep.json.guestKey, score: 4, comment: 'Quick and kind' });
ok('resolved, it is rated with the reference and key', rated.json.success === true && rated.json.csatScore === 4, JSON.stringify(rated.json));
/* A fresh code: the one above was killed on purpose by five wrong guesses. */
const code2 = String(randomBytes(3).readUIntBE(0, 3) % 1_000_000).padStart(6, '0');
d1(`INSERT INTO crm_ticket_lookup_codes (id, account_id, email, code_hash, attempts, expires_at, created_at) VALUES ('tlc2-${run}', '${A.acct}', '${visitor}', '${createHash('sha256').update(`${A.acct}|${visitor}|${code2}`).digest('hex')}', 0, ${Math.floor(Date.now() / 1000) + 900}, '${new Date(Date.now() + 1000).toISOString()}')`);
const byCode = await pub({ action: 'rate_ticket', widgetKey: key, ticketRef: rep.json.reference, email: visitor, code: code2, score: 5 });
ok('…and can be changed from the list opened by email and code', byCode.json.success === true && byCode.json.csatScore === 5, JSON.stringify(byCode.json));
const byCodeB = await pub({ action: 'rate_ticket', widgetKey: keyB, ticketRef: rep.json.reference, email: visitor, code: code2, score: 1 });
ok('the same email and code rate nothing at another business\'s widget', byCodeB.json.success === false, JSON.stringify(byCodeB.json));
const seen = await as(A, 'ticket', { id: row?.id });
ok('the business sees the rating and comment on the ticket', seen.json.ticket?.csat_score === 5 && seen.json.ticket?.csat_comment === '' , JSON.stringify(seen.json.ticket ?? {}).slice(0, 200));
const listed = (await as(A, 'tickets')).json.tickets?.find(t => t.reference === rep.json.reference);
ok('…and in the ticket list', listed?.csatScore === 5, JSON.stringify(listed ?? {}));
const again = await pub({ action: 'my_tickets', widgetKey: key, email: visitor, code: code2 });
ok('the customer\'s list shows their rating, still without the key', again.json.tickets?.find(t => t.reference === rep.json.reference)?.csatScore === 5 && !JSON.stringify(again.json).includes(rep.json.guestKey));

/* ═══ API: help articles ════════════════════════════════════════════════ */
const noArt = await pub({ action: 'widget', widgetKey: key });
ok('with no published article the widget is told there are none', noArt.json.widget?.articles === 0, JSON.stringify(noArt.json.widget ?? {}).slice(0, 120));
const art = await as(A, 'save_article', { record: { title: `Refund policy ${run}`, body: 'We refund any unused month in full.\nWrite to us from the help button.', kind: 'policy', status: 'published', source_url: 'javascript:alert(1)' } });
await as(A, 'save_article', { record: { title: `Draft refunds ${run}`, body: 'Not ready — refunds draft.', status: 'draft' } });
await as(Bt, 'save_article', { record: { title: `Other refunds ${run}`, body: 'Another business refunds.', status: 'published' } });
const artId = art.json.item?.id;
ok('a published article is saved', !!artId, JSON.stringify(art.json).slice(0, 160));
const withArt = await pub({ action: 'widget', widgetKey: key });
ok('…and the widget is told it has one', withArt.json.widget?.articles === 1, String(withArt.json.widget?.articles));
const found = await pub({ action: 'articles', widgetKey: key, query: 'refund' });
const titles = (found.json.articles ?? []).map(a => a.title);
ok('searching finds the published article, with a snippet', titles.includes(`Refund policy ${run}`) && /unused month/.test(found.json.articles?.[0]?.snippet ?? ''), JSON.stringify(found.json).slice(0, 240));
ok('…never a draft, never another business\'s', !titles.some(t => /Draft|Other/.test(t)), titles.join(' | '));
const nothing = await pub({ action: 'articles', widgetKey: key, query: 'zebra crossing' });
ok('a search with no match finds nothing', nothing.json.success === true && nothing.json.articles?.length === 0, JSON.stringify(nothing.json));
const opened1 = await pub({ action: 'article', widgetKey: key, articleId: artId });
ok('the article opens whole, with no unsafe link', opened1.json.article?.body?.includes('Write to us') && opened1.json.article?.sourceUrl === '', JSON.stringify(opened1.json.article ?? {}).slice(0, 200));
const fromB = await pub({ action: 'article', widgetKey: keyB, articleId: artId });
ok('another business\'s widget cannot open it', fromB.json.success === false, JSON.stringify(fromB.json));

/* ═══ Browser: a visitor on a customer's website ════════════════════════ */
const errs = [];
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const width of [390, 1280]) {
  const ctx = await browser.newContext({ viewport: { width, height: 820 } });
  const site = await ctx.newPage();
  site.on('pageerror', e => errs.push(`site ${width}: ${String(e).slice(0, 160)}`));
  const port = 9920 + (width === 390 ? 1 : 2);
  await site.route(`http://acme.localhost:${port}/**`, r => r.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><meta name="viewport" content="width=device-width"><title>Acme</title><h1>Acme</h1><script src="${B}/widget.js" data-pc-widget="${key}" async></script>`,
  }));
  await site.goto(`http://acme.localhost:${port}/`);
  await site.locator('button[aria-label]').filter({ hasText: /help|chat/i }).first().click({ timeout: 10000 }).catch(async () => {
    await site.evaluate(() => window.ProtectedCentralChat?.open('home'));
  });
  const dlg = site.getByRole('dialog');
  await dlg.getByText('Report a problem').waitFor({ timeout: 10000 });
  const home = await dlg.innerText();
  ok(`${width}: the home panel offers Live chat, Report a problem, Submit a ticket, Check ticket status`,
    ['Live chat', 'Report a problem', 'Submit a ticket', 'Check ticket status'].every(t => home.includes(t)), home.slice(0, 300));
  ok(`${width}: "Check a ticket" is gone`, !home.includes('Check a ticket'));
  await shot(site, `widget-home-${width}`);

  /* Help articles: typed, found, opened, and back. */
  await dlg.locator('[data-field="help.search"]').fill('refund policy');
  await dlg.getByRole('button', { name: new RegExp(`Refund policy ${run}`) }).waitFor({ timeout: 8000 }).catch(() => {});
  ok(`${width}: typing in Search help articles finds the article`, await dlg.getByRole('button', { name: new RegExp(`Refund policy ${run}`) }).count() === 1, (await dlg.innerText()).slice(0, 300));
  await dlg.getByRole('button', { name: new RegExp(`Refund policy ${run}`) }).click().catch(() => {});
  await dlg.getByText('Still need help?').waitFor({ timeout: 8000 }).catch(() => {});
  const artText = await dlg.innerText();
  ok(`${width}: the article opens in the widget, with the ways to ask after it`, /unused month in full/.test(artText) && /Still need help\?/.test(artText) && /Submit a ticket/.test(artText), artText.slice(0, 300));
  ok(`${width}: no sideways scroll on an article`, await overflow(site) <= 0);
  await shot(site, `widget-article-${width}`);
  await site.evaluate(() => window.ProtectedCentralChat?.open('home'));
  await dlg.getByText('Report a problem').waitFor({ timeout: 8000 });

  await dlg.getByText('Report a problem').click();
  await dlg.locator('[data-field="report.email"]').fill(`browser-${width}-${run}@example.test`);
  await dlg.locator('[data-field="report.description"]').fill(`Stuck on the invoice screen at ${width}`);
  await dlg.locator('input[type=file]').setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: pngBytes });
  await dlg.locator('img[alt="Screenshot 1"]').waitFor({ timeout: 8000 });
  ok(`${width}: the chosen screenshot is shown before sending`, await dlg.locator('img[alt="Screenshot 1"]').count() === 1);
  ok(`${width}: the report form fits (no sideways scroll)`, await overflow(site) <= 0, String(await overflow(site)));
  await shot(site, `widget-report-${width}`);
  await dlg.getByRole('button', { name: 'Send report' }).click();
  await dlg.getByText(/is with us/).waitFor({ timeout: 10000 }).catch(() => {});
  const done = await dlg.innerText();
  ok(`${width}: sending says the reference and how to follow it`, /report [A-Z]+-\d+ is with us/i.test(done) && /Check ticket status/.test(done), done.slice(0, 240));

  await dlg.getByRole('button', { name: 'Check ticket status' }).click();
  await dlg.getByText('RAISED IN THIS BROWSER').waitFor({ timeout: 8000 });
  const st = await dlg.innerText();
  ok(`${width}: Check ticket status asks for the email, not a reference`, /Your email/.test(st) && /six-digit code/.test(st) && !/^Reference$/m.test(st), st.slice(0, 300));
  await dlg.getByRole('button', { name: /Stuck on the invoice screen/ }).first().click();
  await dlg.getByText(/^Open$/i).first().waitFor({ timeout: 8000 }).catch(() => {});
  const opened = await dlg.innerText();
  ok(`${width}: a ticket raised in this browser opens with its status`, /open/i.test(opened) && /No reply yet/.test(opened), opened.slice(0, 300));
  await dlg.locator('[data-field="status.email"]').fill(`browser-${width}-${run}@example.test`);
  await dlg.getByRole('button', { name: 'Email me a code' }).click();
  await dlg.getByText(/cannot email you a code/).waitFor({ timeout: 8000 }).catch(() => {});
  const noBox = await dlg.innerText();
  ok(`${width}: with no mailbox it says so and opens the reference form`, /cannot email you a code/.test(noBox) && /Reference/.test(noBox), noBox.slice(-300));
  ok(`${width}: no sideways scroll on ticket status`, await overflow(site) <= 0);
  await shot(site, `widget-status-${width}`);

  /* How did we do? — on the browser's own ticket once it is resolved. */
  const myRef = (done.match(/[A-Z]+-\d+/) ?? [''])[0];
  const mineRow = ((await as(A, 'tickets')).json.tickets ?? []).find(t => t.reference === myRef);
  await as(A, 'set_ticket', { id: mineRow?.id, status: 'resolved', priority: 'high' });
  await site.evaluate(() => window.ProtectedCentralChat?.open('status'));
  await dlg.getByText('RAISED IN THIS BROWSER').waitFor({ timeout: 8000 });
  await dlg.getByRole('button', { name: /Stuck on the invoice screen/ }).first().click();
  await dlg.getByText('How did we do?').waitFor({ timeout: 8000 }).catch(() => {});
  ok(`${width}: a resolved ticket asks How did we do?`, await dlg.getByText('How did we do?').count() === 1, (await dlg.innerText()).slice(-300));
  await dlg.getByRole('radio', { name: /^4 — Good/ }).click().catch(() => {});
  await dlg.locator('[data-field="csat.comment"]').fill('Sorted the same day');
  await dlg.getByRole('button', { name: 'Send rating' }).click().catch(() => {});
  await dlg.getByText(/You rated this 4\/5/).waitFor({ timeout: 8000 }).catch(() => {});
  ok(`${width}: the rating is sent and thanked`, await dlg.getByText(/You rated this 4\/5/).count() === 1, (await dlg.innerText()).slice(-300));
  const stored = ((await as(A, 'tickets')).json.tickets ?? []).find(t => t.reference === myRef);
  ok(`${width}: …and the business sees it`, stored?.csatScore === 4, JSON.stringify(stored ?? {}));
  ok(`${width}: no sideways scroll with the rating`, await overflow(site) <= 0);
  await shot(site, `widget-rating-${width}`);
  await ctx.close();
}

/* ═══ Browser: inside the app, signed in ════════════════════════════════
   The house widget is the install owner's in_app widget; this local D1 has
   an install owner from earlier runs. A fresh house widget for the run,
   removed again at the end. */
const owner = d1("SELECT ws.account_id AS acct FROM crm_workspaces ws JOIN crm_users u ON u.email = ws.owner_email WHERE u.account_id IS NULL AND u.role = 'agency' LIMIT 1", true)[0];
if (!owner) {
  ok('in-app: an install owner exists in this D1 (skipped)', true);
} else {
  const houseKey = randomBytes(18).toString('hex');
  d1(`INSERT INTO crm_widgets (id, account_id, name, public_key, title, features, status, in_app, created_at, updated_at) VALUES ('wid-sw-${run}', '${owner.acct}', 'House ${run}', '${houseKey}', 'Help', '["chat","ticket"]', 'live', 1, '2999-01-01T00:00:00.000Z', '2999-01-01T00:00:00.000Z')`);
  for (const width of [390, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 860 } });
    await ctx.addCookies([{ name: 'pc_session', value: A.token, url: B }]);
    const app = await ctx.newPage();
    app.on('pageerror', e => errs.push(`app ${width}: ${String(e).slice(0, 160)}`));
    await app.addInitScript(([acct, email]) => {
      const user = { email, name: 'Help A', role: 'agency', accountId: acct };
      localStorage.setItem('crm_session', JSON.stringify({ token: 'cookie', user, backend: 'php' }));
      localStorage.setItem('crm_active_account', acct);
      localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: acct, name: 'Test', createdAt: new Date().toISOString() }]));
    }, [A.acct, A.email]);
    await app.goto(`${B}/contacts`, { waitUntil: 'domcontentloaded' });
    await app.waitForFunction(() => !!window.ProtectedCentralChat && !!window.ProtectedCentralReport, null, { timeout: 20000 }).catch(() => {});
    ok(`in-app ${width}: the help widget and the report sheet are both ready`, await app.evaluate(() => !!window.ProtectedCentralChat && !!window.ProtectedCentralReport));
    /* 127.0.0.1 is not the testing site: isRehearsal() is true for localhost,
       so the floating Protron shows here as it does on testing — live is
       checked by the host rule in features.ts, not by this page. */
    await app.waitForTimeout(800);
    await app.evaluate(() => window.ProtectedCentralChat?.open('home'));
    const dlg = app.getByRole('dialog').filter({ hasText: 'Check ticket status' });
    const opened = await dlg.getByText('Report a problem', { exact: true }).first().click({ timeout: 10000 }).then(() => true, () => false);
    if (!opened) out.push(`INFO  in-app ${width} dialogs: ${(await app.locator('[role=dialog]').allInnerTexts()).join(' || ').slice(0, 400)}`);
    const sheet = app.locator('[data-testid="protron-report"]');
    await sheet.waitFor({ timeout: 10000 }).catch(() => {});
    ok(`in-app ${width}: Report a problem opens the screenshot sheet`, await sheet.count() === 1);
    await sheet.locator('img[alt^="Screenshot of your screen"]').waitFor({ timeout: 20000 }).catch(() => {});
    ok(`in-app ${width}: it took a screenshot of the screen`, await sheet.locator('img[alt^="Screenshot of your screen"]').count() === 1);
    await sheet.locator('[data-field="report.description"]').fill(`In-app report at ${width} ${run}`);
    ok(`in-app ${width}: the sheet fits`, await overflow(app) <= 0, String(await overflow(app)));
    await shot(app, `app-report-${width}`);
    await sheet.getByTestId('protron-report-send').click();
    const sent = app.locator('[data-testid="report-sent"]');
    await sent.waitFor({ timeout: 15000 }).catch(() => {});
    const said = await sent.innerText().catch(async () => (await sheet.innerText().catch(() => '')));
    ok(`in-app ${width}: it is saved as a ticket with a reference`, /[A-Z]+-\d+/.test(said) && /Check ticket status/.test(said), said.slice(0, 260));
    await sent.getByRole('button', { name: 'Check ticket status' }).click().catch(() => {});
    const status = app.getByRole('dialog').filter({ hasText: 'Signed in as' });
    await status.getByText(`In-app report at ${width}`, { exact: false }).first().waitFor({ timeout: 10000 }).catch(() => {});
    const list = await status.innerText().catch(() => '');
    ok(`in-app ${width}: Check ticket status lists it at once, from the session`, list.includes(`Signed in as ${A.email}`) && list.includes(`In-app report at ${width}`) && /ACTIVE/.test(list), list.slice(0, 300));
    await shot(app, `app-status-${width}`);
    await ctx.close();
  }
  d1(`DELETE FROM crm_widgets WHERE id = 'wid-sw-${run}'`);
}

ok('no page errors', errs.length === 0, errs.join(' | '));
await browser.close();
console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
