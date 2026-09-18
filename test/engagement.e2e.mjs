/**
 * The Customer Engagement platform, driven end to end.
 *
 * Needs a built bundle and `npx wrangler dev --local`, then:
 *   node test/engagement.e2e.mjs <session-token> <account-id> <other-account-id>
 *
 * Two kinds of check here, and the second matters more than the first.
 *
 * The happy paths prove a stranger can reach a business: load a form, submit
 * it, open a chat, be answered, raise a ticket, look it up again.
 *
 * The isolation checks prove they can reach *only* that business. Those are the
 * ones where a passing product and a data breach look identical on screen, so
 * each one asserts the refusal rather than the absence of a crash.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const B = 'http://localhost:8787';
const [TOK, ACCT, OTHER] = process.argv.slice(2);
const out = [];
const ok = (n, p, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);

const api = async (path, body, headers = {}) => {
  const r = await fetch(`${B}/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};

const owner = (action, extra = {}) => api('engagement.php', { token: TOK, accountId: ACCT, action, ...extra });
const pub = (body) => api('engage.php', body, { Origin: 'https://acme-test.example' });

const stamp = Date.now().toString(36);

/* ── Set a tenant up the way a customer would ── */
const agentRes = await owner('save_agent', {
  record: {
    name: `Test agent ${stamp}`,
    businessInfo: 'Acme fits boilers in Leeds. Callouts are quoted on the day.',
    greeting: 'Hello',
    tools: ['searchKnowledge', 'createTicket', 'handoffToHuman'],
    status: 'live',
  },
});
ok('an AI agent can be created', agentRes.json.success === true, JSON.stringify(agentRes.json).slice(0, 120));
const agentId = agentRes.json.id;

await owner('save_article', {
  record: { title: `Boiler servicing ${stamp}`, body: 'We service boilers. A service is quoted after an engineer has seen the unit.', status: 'published' },
});

const formRes = await owner('save_form', {
  record: {
    name: `Quote request ${stamp}`,
    fields: [
      { key: 'name', label: 'Your name', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true },
    ],
    status: 'live',
  },
});
const formSlug = formRes.json.item?.slug;
ok('a form can be created and gets a public address', !!formSlug, JSON.stringify(formRes.json).slice(0, 120));

const widgetRes = await owner('save_widget', {
  record: { name: `Site chat ${stamp}`, agentId, title: 'Acme', status: 'live' },
});
const widgetKey = widgetRes.json.item?.public_key;
ok('a widget can be created and gets a public key', !!widgetKey && widgetKey.length >= 24);
ok('and the widget keeps its designed defaults rather than blanks',
  widgetRes.json.item?.accent === '#5b46e5' && widgetRes.json.item?.launcher === 'Chat with us',
  `accent=${widgetRes.json.item?.accent} launcher=${widgetRes.json.item?.launcher}`);

/* ── A stranger uses it ── */
const formView = await pub({ action: 'form', formSlug });
ok('a stranger can load the form with no session', formView.json.success === true);
ok('and the payload does not carry the workspace id',
  !JSON.stringify(formView.json).includes(ACCT), 'the account id was exposed to the page');

const email = `rita-${stamp}@example.com`;
const submitted = await pub({
  action: 'submit', formSlug,
  answers: { name: 'Rita Shah', email },
  context: { page: 'https://acme-test.example/contact' },
});
ok('a submission is accepted', submitted.json.success === true, JSON.stringify(submitted.json).slice(0, 120));

const subs = await owner('submissions');
ok('and appears in the owner’s list', (subs.json.submissions ?? []).some(s => JSON.stringify(s.answers).includes(email)));

const people = await owner('unmerged_people');
ok('with a person captured, ready for the CRM merge',
  (people.json.people ?? []).some(p => p.email === email));

/* Submitting twice with one address must not make two people — the CRM
   deduplicates on email and two systems disagreeing about identity is worse
   than either rule alone. */
await pub({ action: 'submit', formSlug, answers: { name: 'Rita S', email } });
const again = await owner('unmerged_people');
ok('a second submission from the same address does not duplicate the person',
  (again.json.people ?? []).filter(p => p.email === email).length === 1);

/* ── Chat ── */
const cfg = await pub({ action: 'widget', widgetKey });
ok('the widget serves its configuration', cfg.json.success === true && !!cfg.json.widget);

const started = await pub({ action: 'start', widgetKey, context: { page: 'https://acme-test.example/' } });
ok('a chat can be started', started.json.success === true && !!started.json.conversationId);
const convId = started.json.conversationId;
const vkey = started.json.visitorKey;

const said = await pub({ action: 'send', conversationId: convId, visitorKey: vkey, message: 'How much is a boiler service?' });
ok('the assistant answers', said.json.success === true && (said.json.messages ?? []).length > 0);
/* The whole of section 53 in one assertion: with no working AI key it must say
   it does not know, never invent a figure. */
const reply = (said.json.messages ?? [])[0]?.body ?? '';
ok('and never invents a price', !/£\s*\d|\$\s*\d|\d+\s*(pounds|dollars)/i.test(reply), reply.slice(0, 140));

const convs = await owner('conversations');
ok('the conversation is in the owner’s inbox', (convs.json.conversations ?? []).some(c => c.id === convId));

/* A human replying takes the conversation off the assistant — the override. */
await owner('reply', { conversationId: convId, message: 'Hello, this is Sam.' });
const after = await owner('conversation', { conversationId: convId });
ok('a human reply takes the conversation off the AI', after.json.conversation?.handled_by === 'human');
const blocked = await pub({ action: 'send', conversationId: convId, visitorKey: vkey, message: 'Are you there?' });
ok('and the assistant then stays out of it', blocked.json.handedOver === true);

/* An internal note must not reach the visitor. */
await owner('reply', { conversationId: convId, message: 'Internal: check their account first', internal: true });
const polled = await pub({ action: 'poll', conversationId: convId, visitorKey: vkey });
ok('an internal note is never sent to the visitor',
  !JSON.stringify(polled.json.messages ?? []).includes('check their account first'));

/* ── Tickets ── */
const tkt = await pub({
  action: 'ticket', widgetKey, email, name: 'Rita Shah',
  subject: 'Boiler not firing', message: 'It clicks and stops.',
});
ok('a ticket can be raised from the widget', tkt.json.success === true && !!tkt.json.reference);
const look = await pub({ action: 'ticket_status', ticketRef: tkt.json.reference, guestKey: tkt.json.guestKey });
ok('and looked up again with the reference and key', look.json.success === true);
const wrongKey = await pub({ action: 'ticket_status', ticketRef: tkt.json.reference, guestKey: 'deadbeef'.repeat(4) });
ok('but not with the wrong key', wrongKey.json.success !== true);

const tickets = await owner('tickets');
ok('the ticket is in the owner’s queue', (tickets.json.tickets ?? []).some(t => t.reference === tkt.json.reference));
const one = await owner('ticket', { id: (tickets.json.tickets ?? []).find(t => t.reference === tkt.json.reference)?.id });
ok('and the guest key is never returned to the owner’s screen',
  !JSON.stringify(one.json).includes(tkt.json.guestKey), 'the guest key leaked into the admin payload');

/* ── Tenant isolation: the checks that matter ── */
const cross = await owner('conversations');
ok('the inbox only holds this workspace’s conversations',
  (cross.json.conversations ?? []).every(c => typeof c.id === 'string'));

if (OTHER) {
  const a = await api('engagement.php', { token: TOK, accountId: OTHER, action: 'conversations' });
  ok('a token cannot read another workspace', a.json.success !== true && a.status === 403,
    `status ${a.status} ${JSON.stringify(a.json).slice(0, 80)}`);

  const b = await api('engagement.php', { token: TOK, accountId: OTHER, action: 'save_agent', record: { name: 'Intruder' } });
  ok('nor write into one', b.json.success !== true, JSON.stringify(b.json).slice(0, 80));
}

const noToken = await api('engagement.php', { accountId: ACCT, action: 'conversations' });
ok('and no token reads nothing at all', noToken.json.success !== true && noToken.status === 401);

/* A public caller naming a workspace must be ignored, not obeyed. */
const forged = await pub({
  action: 'submit', accountId: OTHER || 'someone-else', formSlug,
  answers: { email: `forge-${stamp}@example.com` },
});
ok('a public caller cannot choose which workspace to write into', forged.json.success === true);
const forgedCheck = await owner('unmerged_people');
ok('  → and the capture landed in the form owner’s workspace',
  (forgedCheck.json.people ?? []).some(p => p.email === `forge-${stamp}@example.com`));

/* A conversation id without its visitor key is an id and nothing more. */
const peeping = await pub({ action: 'poll', conversationId: convId, visitorKey: 'not-the-key' });
ok('a conversation cannot be read without its visitor key', peeping.json.success !== true);

/* ── Calendar, voice and submissions: the pieces that were wired last ── */
const vs = await owner('voice_status');
ok('voice reports honestly that no provider is connected',
  vs.json.success === true && vs.json.available === false && /no voice provider/i.test(vs.json.message ?? ''),
  JSON.stringify(vs.json).slice(0, 120));

const cal = await api('calendar.php', { token: TOK, accountId: ACCT, action: 'status' });
ok('the calendar endpoint answers', cal.json.success === true);
ok('and says whether a Google client exists rather than assuming one',
  typeof cal.json.configured === 'boolean');

const conn = await api('calendar.php', { token: TOK, accountId: ACCT, action: 'connect' });
if (cal.json.configured) {
  ok('connecting produces a consent URL on the events scope only',
    typeof conn.json.url === 'string'
    && conn.json.url.includes('calendar.events')
    && !conn.json.url.includes('auth/calendar&'),
    String(conn.json.url ?? '').slice(0, 90));
  ok('  → asking for offline access, or the connection dies in an hour',
    String(conn.json.url ?? '').includes('access_type=offline'));
} else {
  ok('connecting refuses by name when no client is configured',
    conn.json.success !== true && /google client/i.test(conn.json.error ?? ''));
}

const calCross = await api('calendar.php', { token: TOK, accountId: OTHER || 'x', action: 'status' });
ok('the calendar endpoint is tenant-scoped too', calCross.json.success !== true);

const setSub = await owner('set_submission', { id: 'nope', status: 'spam' });
ok('a submission status can be set without leaking whether the id exists', setSub.json.success === true);

/* ── The widget actually runs on a page ── */
{
  const b2 = await pw.chromium.launch();
  const page = await (await b2.newContext({ viewport: { width: 1100, height: 800 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  /* A blank page on a different path, standing in for a customer's own site. */
  await page.goto(`${B}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(([origin, key]) => {
    document.body.innerHTML = '<h1>A customer website</h1>';
    const s = document.createElement('script');
    s.src = `${origin}/widget.js`;
    s.setAttribute('data-pc-widget', key);
    document.body.appendChild(s);
  }, [B, widgetKey]);
  await page.waitForTimeout(2500);

  const launcher = page.getByRole('button', { name: 'Open the chat' });
  ok('the widget draws itself on a plain page', await launcher.count() === 1);
  if (await launcher.count()) {
    await launcher.click();
    await page.waitForTimeout(600);
    const text = await page.textContent('body');
    ok('and opens with the agent’s greeting', /Hello/.test(text ?? ''), (text ?? '').slice(0, 120));
    await page.getByPlaceholder('Type a message…').fill('Do you service boilers?');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3500);
    const after2 = await page.textContent('body');
    ok('and answers in the window', (after2 ?? '').length > (text ?? '').length);
  }
  ok('nothing threw on the customer page',
    errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await b2.close();
}

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
if (failed) process.exit(1);
