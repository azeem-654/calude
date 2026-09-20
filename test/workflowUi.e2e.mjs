/**
 * The workflow screens, driven in a real browser.
 *
 * Needs a built bundle and `npx wrangler dev --local --test-scheduled`:
 *   node test/workflowUi.e2e.mjs <session-token> <account-id>
 *
 * `test/automation.e2e.mjs` argues with the engine over HTTP. This argues with
 * the parts a customer actually touches, which a typecheck cannot see at all:
 * that a form block on a page posts somewhere rather than nowhere, that a
 * project's workflows are its own, and that the build view says which of "not
 * started" and "cannot start" is true.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const B = 'http://localhost:8787';
const [TOK, ACCT] = process.argv.slice(2);
if (!TOK || !ACCT) { console.error('usage: node test/workflowUi.e2e.mjs <token> <accountId>'); process.exit(2); }

const out = [];
const ok = (n, p, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);
const b = await pw.chromium.launch();

const seeded = async (extra = () => {}, width = 1280) => {
  const ctx = await b.newContext({ viewport: { width, height: 950 } });
  await ctx.addInitScript(([token, acct]) => {
    localStorage.setItem('crm_session', JSON.stringify({ token, backend: 'php', user: { email: 'flow@test.dev', name: 'F', role: 'agency', accountId: acct } }));
    localStorage.setItem('crm_active_account', acct);
    localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: acct, name: 'F', plan: 'starter', status: 'active', price: 0 }]));
  }, [TOK, ACCT]);
  await ctx.addInitScript(extra, ACCT);
  return ctx;
};

/* ── 1. The form block on a page actually posts ── */
for (const width of [390, 1280]) {
  const ctx = await seeded(acct => {
    const site = {
      id: 'site-1', name: 'Test site', status: 'published',
      pages: [{
        id: 'pg-1', name: 'Home', type: 'landing', blocks: [{
          id: 'bl-1', type: 'form', content: 'Get a quote',
          /* No `formSlug`: the unbound case, which used to look identical to a
             working form and silently collected nothing. */
          settings: { formFields: [{ label: 'Name', type: 'text', required: true }, { label: 'Email', type: 'email', required: true }] },
        }],
      }],
    };
    localStorage.setItem(`crm_acct_${acct}_crm_websites`, JSON.stringify([site]));
  }, width);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${B}/preview/site-1`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);

  const t = (await p.textContent('body')) ?? '';
  ok(`${width}px · an unconnected form says it cannot take an enquiry`,
    /not connected yet/.test(t), t.slice(0, 220));
  ok(`${width}px · and its button is not pressable`,
    await p.getByRole('button', { name: 'Submit' }).isDisabled());

  /* The fields are real inputs now, not decoration. */
  await p.getByLabel(/^Name/).fill('Typed');
  ok(`${width}px · the fields actually hold what is typed`,
    (await p.getByLabel(/^Name/).inputValue()) === 'Typed');

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`${width}px · no horizontal overflow`, over <= 0, `${over}px`);
  ok(`${width}px · nothing threw`, errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── 1b. A connected form really sends ── */
{
  const slug = `page-${Date.now().toString(36)}`;
  const saved = await fetch(`${B}/api/engagement.php`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: TOK, accountId: ACCT, action: 'save_form',
      record: {
        name: 'Page form', slug, headline: 'Page form', status: 'live', createPerson: 1,
        fields: [{ key: 'name', label: 'Name', type: 'text', required: true }, { key: 'email', label: 'Email', type: 'email', required: true }],
      },
    }),
  }).then(r => r.json());
  ok('a form for the page exists', saved.success === true);

  const ctx = await seeded();
  /* The site goes in separately from the session because the slug is only
     known once the form has been created above. */
  await ctx.addInitScript(([acct, formSlug]) => {
    localStorage.setItem(`crm_acct_${acct}_crm_websites`, JSON.stringify([{
      id: 'site-2', name: 'Live site', status: 'published',
      pages: [{
        id: 'pg-1', name: 'Home', type: 'landing', blocks: [{
          id: 'bl-1', type: 'form', content: 'Get a quote',
          settings: { formSlug, formFields: [{ label: 'Name', type: 'text', required: true }, { label: 'Email', type: 'email', required: true }] },
        }],
      }],
    }]));
  }, [ACCT, slug]);

  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${B}/preview/site-2`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);

  await p.getByLabel(/^Name/).fill('Page Visitor');
  await p.getByLabel(/^Email/).fill('page.visitor@example.test');
  await p.getByRole('button', { name: 'Submit' }).click();
  await p.waitForTimeout(1500);

  ok('a connected form thanks the visitor',
    /Thank you/i.test((await p.textContent('body')) ?? ''), (await p.textContent('body'))?.slice(0, 200));

  /* And the submission is really on the server, not just a message on screen. */
  const subs = await fetch(`${B}/api/engagement.php`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: TOK, accountId: ACCT, action: 'submissions' }),
  }).then(r => r.json());
  ok('and the submission reached the workspace',
    JSON.stringify(subs).includes('page.visitor@example.test'), JSON.stringify(subs).slice(0, 200));

  ok('nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

/* ── 2. The run panel under the automation builder ── */
{
  const ctx = await seeded();
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`${B}/marketing?tab=automations`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1600);

  const t = (await p.textContent('body')) ?? '';
  ok('the automations tab shows what has actually run', /What has actually run/.test(t), t.slice(0, 220));
  /* The sentence that separates this from the old "Enrolled: 0". */
  ok('and says a step that could not run is skipped, not sent',
    /skipped and named/.test(t), 'the honesty note is missing');
  ok('nothing threw', errs.filter(e => !/ERR_CERT|fonts\.googleapis/.test(e)).length === 0, errs.join(' | '));
  await ctx.close();
}

for (const line of out) console.log(line);
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
