/**
 * What Autopilot made, and where a lead goes.
 *
 * Needs a built bundle and `npx wrangler dev --local`:
 *   node test/leadFlow.e2e.mjs <session-token> <account-id>
 *
 * Four things this covers, all of which were broken or invisible and none of
 * which a typecheck could see:
 *
 *  1. Autopilot writes `crm_blog_posts` and, until now, nothing read it. Its
 *     board said a post existed and the Blog screen said it did not.
 *  2. Autopilot writes a *sequence*, not a campaign, and the word on its board
 *     sends people to the Campaigns tab. The pointer between them.
 *  3. A captured lead reaching the pipeline rather than sitting in a list.
 *     Driven the whole way: a live form, a public submission with no session at
 *     all, the merge on the Engagement screen, then the board.
 *  4. The shop is findable — under Sales, called what it is, with its own map.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const B = 'http://localhost:8787';
const [TOK, ACCT] = process.argv.slice(2);
if (!TOK || !ACCT) { console.error('usage: node test/leadFlow.e2e.mjs <token> <accountId>'); process.exit(2); }

const out = [];
const ok = (n, p, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);

const api = async (path, body) => {
  const r = await fetch(`${B}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json();
};

/* ── A live form, and a stranger filling it in ── */
const SLUG = `lead-${Date.now().toString(36)}`;
const LEAD_EMAIL = `walkin-${Date.now().toString(36)}@example.test`;

const saved = await api('/api/engagement.php', {
  token: TOK, accountId: ACCT, action: 'save_form',
  record: {
    name: 'Get a quote', slug: SLUG, headline: 'Get a quote',
    fields: [
      { key: 'name', label: 'Your name', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true },
    ],
    createPerson: 1, status: 'live',
  },
});
ok('a form can be published', saved.success === true, JSON.stringify(saved).slice(0, 200));

const sent = await api('/api/engage.php', {
  action: 'submit', formSlug: SLUG,
  answers: { name: 'Walk In', email: LEAD_EMAIL },
});
/* No token anywhere in that request. That is the point: the public path has to
   work for somebody who has never signed in and never will. */
ok('a stranger can submit it with no session', sent.success === true, JSON.stringify(sent).slice(0, 200));

const b = await pw.chromium.launch();

const signedIn = async (width = 1280) => {
  const ctx = await b.newContext({ viewport: { width, height: 950 } });
  await ctx.addInitScript(([token, acct]) => {
    localStorage.setItem('crm_session', JSON.stringify({ token, backend: 'php', user: { email: 'lead@test.dev', name: 'L', role: 'agency', accountId: acct } }));
    localStorage.setItem('crm_active_account', acct);
    localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: acct, name: 'L', plan: 'starter', status: 'active', price: 0 }]));
  }, [TOK, ACCT]);
  return ctx;
};

/* ── 1. Autopilot's blog drafts are on the Blog screen ── */
{
  const ctx = await signedIn();
  await ctx.addInitScript(acct => {
    /* Written through the workspace prefix by hand, the way the cron's pull
       lands it — application code reads the plain key and the prefix is applied
       underneath, so a test that writes the plain key writes the wrong place. */
    localStorage.setItem(`crm_acct_${acct}_crm_blog_posts`, JSON.stringify([{
      id: 'bp-test-1', title: 'Five signs your boiler is on its way out',
      slug: 'boiler-signs', excerpt: 'What to look for before it fails in January.',
      body: 'A long draft body.\n\nWith two paragraphs.',
      keywords: ['boiler repair', 'emergency plumber'],
      status: 'draft', createdAt: new Date().toISOString(),
      source: { origin: 'autopilot', title: 'Autopilot', at: new Date().toISOString() },
    }]));
  }, ACCT);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${B}/blog-automation`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);

  const t = (await p.textContent('body')) ?? '';
  ok('the Blog screen shows Autopilot\'s drafts', /Drafts from AI Autopilot/.test(t), t.slice(0, 200));
  ok('and names the post it wrote', /Five signs your boiler/.test(t));
  /* The one that caught the old behaviour: the screen used to say there was
     nothing to rank while holding a finished draft. */
  ok('it no longer claims there is nothing here', !/Nothing to rank yet/.test(t));

  await p.getByRole('button', { name: 'Five signs your boiler is on its way out', exact: true }).click();
  await p.waitForTimeout(300);
  const open = (await p.textContent('body')) ?? '';
  ok('opening one shows the body it wrote', /With two paragraphs/.test(open));
  ok('and the keywords it was aiming at', /emergency plumber/.test(open));

  ok('nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── 2. The pointer from Campaigns to the sequence Autopilot wrote ── */
for (const width of [390, 1280]) {
  const ctx = await signedIn(width);
  await ctx.addInitScript(acct => {
    localStorage.setItem(`crm_acct_${acct}_crm_sequences`, JSON.stringify([{
      id: 'sq-test-1', name: 'New enquiry follow-up', goal: 'Book the job',
      status: 'active', createdAt: new Date().toISOString(), enrolledCount: 0,
      source: { origin: 'autopilot', title: 'Autopilot', at: new Date().toISOString() },
      steps: [{ id: 's1', day: 0, waitUnit: 'days', subject: 'Thanks for getting in touch', body: 'Hello', channel: 'email' }],
    }]));
  }, ACCT);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${B}/marketing`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);

  const t = (await p.textContent('body')) ?? '';
  ok(`${width}px · Campaigns says where Autopilot's email work went`,
    /AI Autopilot has written a follow-up sequence/.test(t), t.slice(0, 250));

  await p.getByRole('button', { name: 'Open Sequences' }).click();
  await p.waitForTimeout(600);
  ok(`${width}px · and the button lands on it`,
    /New enquiry follow-up/.test((await p.textContent('body')) ?? ''));

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`${width}px · no horizontal overflow`, over <= 0, `${over}px`);
  ok(`${width}px · nothing threw`, errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── 3. The captured lead reaches the board ── */
{
  const ctx = await signedIn();
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));

  /* Opening Engagement is what merges captures — deliberately not behind a
     button, because a lead that arrived overnight should be in the list by the
     time somebody looks. */
  await p.goto(`${B}/engagement`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);

  const contacts = await p.evaluate(acct => localStorage.getItem(`crm_acct_${acct}_crm_contacts`) ?? '[]', ACCT);
  ok('the submission became a contact', contacts.includes(LEAD_EMAIL), contacts.slice(0, 200));

  const pipelines = await p.evaluate(acct => localStorage.getItem(`crm_acct_${acct}_crm_pipelines`) ?? '[]', ACCT);
  ok('and a deal on the pipeline', /Walk In/.test(pipelines), pipelines.slice(0, 300));
  ok('stamped with the channel it came from', /engagement:form/.test(pipelines));

  /* Routing runs on every merge pass. If it were not idempotent, a page left
     open would grow a card for the same person every couple of minutes. */
  await p.goto(`${B}/engagement`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  const again = await p.evaluate(acct => localStorage.getItem(`crm_acct_${acct}_crm_pipelines`) ?? '[]', ACCT);
  const count = (again.match(/Walk In/g) ?? []).length;
  ok('a second pass does not make a second deal', count <= 2, `${count} mentions of the name`);

  await p.goto(`${B}/pipelines`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  ok('and it is on the board somebody looks at',
    /Walk In/.test((await p.textContent('body')) ?? ''));

  ok('nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── 3b. The routing settings are reachable and say what they do ── */
{
  const ctx = await signedIn();
  const p = await ctx.newPage();
  await p.goto(`${B}/engagement?tab=settings`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1400);
  const t = (await p.textContent('body')) ?? '';
  ok('the routing settings are on the Engagement settings tab', /Where new leads go/.test(t), t.slice(0, 200));
  /* The honesty that matters: enrolling a stranger into a sequence sends them
     mail, and the screen has to say so rather than leaving it as a dropdown. */
  ok('and it says plainly that the sequence option sends email', /This sends email/.test(t));
  ok('with the do-nothing option first', /I’ll reply myself|I'll reply myself/.test(t));
  await ctx.close();
}

/* ── 4. The shop is findable and explains itself ── */
for (const width of [390, 1280]) {
  const ctx = await signedIn(width);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${B}/sell`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1400);

  const t = (await p.textContent('body')) ?? '';
  ok(`${width}px · it is called what it is`, /Online shop/.test(t), t.slice(0, 160));
  ok(`${width}px · and says what is on the page`, /On this page/.test(t));
  for (const label of ['Products', 'Storefront', 'Discount codes', 'Delivery & tax', 'Getting paid', 'Orders']) {
    ok(`${width}px · the map offers "${label}"`, await p.getByRole('link', { name: label, exact: true }).first().isVisible());
  }
  ok(`${width}px · and points at the page people actually buy from`,
    await p.getByRole('link', { name: /Open shop pages/ }).isVisible());

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`${width}px · no horizontal overflow`, over <= 0, `${over}px`);
  ok(`${width}px · nothing threw`, errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── 4b. Both directions of the link between the two halves of the shop ── */
{
  const ctx = await signedIn();
  const p = await ctx.newPage();
  await p.goto(`${B}/sell`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  await p.getByRole('link', { name: /Open shop pages/ }).click();
  await p.waitForTimeout(1200);
  ok('the shop module reaches the shop pages',
    /A shop is a page anyone can open without signing in/.test((await p.textContent('body')) ?? ''),
    p.url());
  /* And the tab it lands on has to survive a reload, or the link is a one-off. */
  ok('and the tab is in the address', /tab=shops/.test(p.url()), p.url());

  await p.getByRole('link', { name: 'Online shop', exact: true }).click();
  await p.waitForTimeout(1200);
  ok('and the shop pages reach the catalogue back',
    /On this page/.test((await p.textContent('body')) ?? ''), p.url());
  await ctx.close();
}

await b.close();

for (const line of out) console.log(line);
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
