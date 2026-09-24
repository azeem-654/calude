/**
 * Photographs every screen the marketing site shows, from the real app.
 *
 *   VITE_BASE=/ npm run build && npx wrangler dev --local --port 8787
 *   npx tsx scripts/site-reels.mts
 *
 * ── Why against the Worker, not Vite ──
 *
 * The older capture scripts booted Vite with a localStorage-only workspace.
 * That photographs the parts of the product that live in the browser and
 * nothing else — and the parts that matter most now (AI Autopilot's projects,
 * workflows, templates, forms, tickets) live on the server. A picture of
 * Autopilot from a workspace with no server is a picture of an empty state.
 *
 * So this signs a real account up on `wrangler dev`, writes the same plausible
 * business the other scripts use (`site-seed.mjs`) into its server-side
 * workspace, creates a real client, project, workflows, forms and tickets
 * through the real API, and then photographs the running app.
 *
 * ── What it refuses ──
 *
 * A shot in `src/components/Site/reels.ts` with no recipe here stops the run
 * before anything is taken, and a screen showing the error boundary is
 * refused rather than written — a marketing page with an error on it is
 * worse than one with a gap.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { REEL_FILES } from '../src/components/Site/reels.ts';
import { TEMPLATES, DEMO_CLIENT, DEMO_PROJECT } from '../src/components/Autopilot/workflowTemplates.ts';
import { designFromPost } from '../worker/src/lib/projectAgents.ts';
// @ts-expect-error — a plain .mjs module shared with the older capture scripts.
import { workspaceSeed } from './site-seed.mjs';

const B = 'http://localhost:8787';
const OUT = 'public/site/reel';
const RAW = '/tmp/site-reel-raw';
const VIEW = { width: 1280, height: 800 };

fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(RAW, { recursive: true, force: true });
fs.mkdirSync(RAW, { recursive: true });

/* Retried on a dropped connection only. `wrangler dev` restarts its runtime
   now and then while the database is being written from a second process,
   and a capture run should not die of that; a real error answer is returned
   as it is, never retried into success. */
async function post(path: string, body: Record<string, unknown>): Promise<Record<string, any>> {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(`${B}${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      return await r.json() as Record<string, any>;
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise(r => setTimeout(r, 2500 * attempt));
    }
  }
}

/* Whitespace collapsed first: a newline inside the quoted command reaches
   SQLite as a literal backslash-n and is a syntax error. The error is printed
   rather than swallowed into a Buffer dump. */
const d1 = (sql: string) => {
  try {
    execSync(`npx wrangler d1 execute crmpro --local --command ${JSON.stringify(sql.replace(/\s+/g, ' ').trim())}`, { stdio: 'pipe' });
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(`D1 refused: ${sql.slice(0, 120)}\n${String(err.stdout ?? '')}${String(err.stderr ?? '')}`.slice(0, 1200));
  }
};

/* ── The account ─────────────────────────────────────────────────────────── */

d1('DELETE FROM crm_signup_attempts');
const signup = await post('/api/auth.php', {
  action: 'register', email: `alex.${Date.now().toString(36)}@riverastudio.test`,
  password: 'Reel-capture-2026!', name: 'Alex Rivera',
});
if (!signup.success) throw new Error(`could not sign up: ${JSON.stringify(signup)}`);
const TOK: string = signup.token;
const ACCT: string = signup.user.accountId;
const as = (path: string, body: Record<string, unknown>) => post(path, { token: TOK, accountId: ACCT, ...body });

/* ── The business, written where the app reads it ─────────────────────────── */

const seed = workspaceSeed();
const w = seed.data;
const now = new Date().toISOString();

/* Social posts with real canvases, composed exactly as the agent composes
   them, so the Social Creator and the "made so far" rail show designs rather
   than blank squares. */
const posts = [
  { platform: 'instagram', headline: 'Winter is when boilers give up', body: 'Book the service now.', hashtags: ['#heating'] },
  { platform: 'linkedin', headline: 'Landlords: the gas certificate deadline', body: 'What changes in April.', hashtags: ['#landlords'] },
  { platform: 'instagram', headline: 'Three signs your boiler is on its way out', body: 'And what each costs.', hashtags: ['#homeowners'] },
].map((p, i) => designFromPost(p, {
  id: `sp-reel-${i}`, brandColor: ['#6d3bf5', '#0f766e', '#b45309'][i], company: 'Northside Plumbing',
  source: { origin: 'autopilot', title: 'AI Autopilot', route: '/autopilot', at: now }, now,
}));

const items: Record<string, string> = {
  crm_contacts: JSON.stringify(w.contacts),
  crm_pipelines: JSON.stringify(w.pipelines),
  crm_sequences: JSON.stringify(w.sequences),
  crm_ai_campaigns: JSON.stringify([w.campaign]),
  crm_campaigns: JSON.stringify(w.campaigns),
  crm_contact_emails: JSON.stringify(w.emails),
  crm_sequence_enrollments: JSON.stringify(w.enrolments),
  crm_appointments: JSON.stringify(w.appointments),
  crm_ai_leads: JSON.stringify(w.leads),
  crm_funnels: JSON.stringify(w.funnels),
  crm_websites: JSON.stringify(w.websites),
  crm_bookings: JSON.stringify(w.bookings),
  crm_reviews: JSON.stringify(w.reviews),
  crm_blog_projects: JSON.stringify(w.blogProjects),
  crm_social_posts: JSON.stringify(posts),
  crm_setup_hidden: '1',
  /* A configured workspace, because a banner saying "email provider not set
     up yet" across a photograph of the campaigns screen is the wrong picture
     of a product that sends mail. The password is the seed's placeholder dots;
     nothing here is a real credential. */
  crm_email_provider: JSON.stringify({ provider: 'smtp' }),
  crm_smtp: JSON.stringify({
    host: 'smtp.riverastudio.com', port: '587', user: 'alex@riverastudio.com', pass: '••••••••',
    fromName: 'Alex Rivera', fromEmail: 'alex@riverastudio.com', encryption: 'tls',
  }),
  crm_deliverability_settings: JSON.stringify({ sendingDomain: 'riverastudio.com', dkimSelectors: ['default'] }),
  crm_onboarding: JSON.stringify({
    version: 1, step: 5, completed: true, skipped: false,
    profile: {
      companyName: 'Rivera Studio', industry: 'Marketing Agency',
      description: 'Campaigns, sites and booking for clinics, firms and trades across North Texas',
      audience: 'Owner-run clinics, law firms and trades doing $1m–$10m a year',
      brandVoice: 'Friendly & approachable', brandColor: '#6d3bf5',
      website: 'riverastudio.com', email: 'alex@riverastudio.com', phone: '(972) 555-0100',
    },
    goals: {}, channels: ['email', 'sms', 'blog'], plan: [], audit: [],
  }),
};
const bulk = await as('/api/data.php', { action: 'bulk_set', items });
if (!bulk.success) throw new Error(`could not write the workspace: ${JSON.stringify(bulk).slice(0, 300)}`);

/* ── A client, a project and its workflows, through the real API ──────────── */

const pf = await as('/api/projects.php', { action: 'save_portfolio', name: DEMO_CLIENT.name.replace(' (demo)', ''), profile: DEMO_CLIENT.profile });
const pr = await as('/api/projects.php', {
  action: 'save_project', portfolioId: pf.id,
  name: 'Northside Plumbing — winter installs', objective: DEMO_PROJECT.objective, kind: DEMO_PROJECT.kind,
  guardrails: DEMO_PROJECT.guardrails,
  launchSteps: [{ label: 'Get email sending' }, { label: 'Answer every enquiry fast' }, { label: 'Post every morning' }, { label: 'Ask for reviews' }],
});
if (!pr.success) throw new Error(`could not make the project: ${JSON.stringify(pr).slice(0, 300)}`);
const PROJ: string = pr.id;
/* Planned, so the board shows a running project rather than "getting ready". */
d1(`UPDATE crm_projects SET last_planned_at = '${now}', status = 'running' WHERE id = '${PROJ}'`);

/* The workflow from the screenshot somebody sent, which is the one that best
   shows a fork: customers stop, everybody else is chased. */
const fork = [
  { id: 'n0', type: 'trigger', label: 'A form is submitted', config: { event: 'form_submitted' }, nextId: 'n1' },
  { id: 'n1', type: 'wait', label: 'Wait 3 days', config: { days: '3' }, nextId: 'n2' },
  { id: 'n2', type: 'condition', label: 'Already a customer?', config: { field: 'status', operator: 'equals', value: 'customer' }, nextId: null, yesId: 'n5', noId: 'n3' },
  { id: 'n3', type: 'send_email', label: 'Still interested?', config: { subject: 'Still thinking it over, {{firstName}}?', body: 'Hello {{firstName}}' }, nextId: 'n4' },
  { id: 'n4', type: 'add_tag', label: 'Tag as chased', config: { tag: 'chased' }, nextId: null },
  { id: 'n5', type: 'end', label: 'Nothing to do', config: {}, nextId: null },
];
const flows: { name: string; description: string; nodes: unknown[]; status: string; key?: string }[] = [
  { name: 'Chase a quiet enquiry', description: 'Customers stop; everybody else is chased once', nodes: fork, status: 'active' },
  ...['daily-posts', 'speed-to-lead'].map(k => {
    const t = TEMPLATES.find(x => x.key === k)!;
    return { name: t.name, description: t.description, nodes: t.nodes, status: k === 'daily-posts' ? 'active' : 'draft', key: k };
  }),
];
const wfIds: string[] = [];
for (const f of flows) {
  const r = await as('/api/autopilot.php', { action: 'save_workflow', projectId: PROJ, record: f, templateKey: f.key });
  if (!r.success) throw new Error(`could not save "${f.name}": ${JSON.stringify(r).slice(0, 200)}`);
  wfIds.push(r.id);
}

/* What the daily agent has made, so the "made so far" rail has something true
   on it: the three posts above, recorded as its runs. */
posts.forEach((p, i) => d1(
  `INSERT INTO crm_agent_runs (id, account_id, project_id, workflow_id, node_id, produces, outcome, detail, link, created_at)
   VALUES ('ar-reel-${ACCT.slice(0, 8)}-${i}', '${ACCT}', '${PROJ}', '${wfIds[1]}', 'n1', 'social', 'ok',
     'Made 1 post from the client portfolio.',
     '${JSON.stringify({ kind: 'social-post', id: p.id, label: String(p.name), route: '/social-creator' }).replace(/'/g, "''")}',
     '${new Date(Date.now() - i * 86_400_000).toISOString()}')`));

/* ── Engagement: forms and tickets ───────────────────────────────────────── */

for (const name of ['Get a quote', 'Book a boiler service', 'Newsletter sign-up']) {
  await as('/api/engagement.php', {
    action: 'save_form', record: {
      name, headline: name, status: 'live', createPerson: true,
      fields: [{ key: 'name', label: 'Your name', type: 'text', required: true }, { key: 'email', label: 'Email', type: 'email', required: true }],
    },
  });
}
for (const [subject, priority] of [['Boiler making a banging noise', 'urgent'], ['Invoice question for March', 'normal'], ['Can you quote for two flats?', 'normal']]) {
  await as('/api/engagement.php', { action: 'create_ticket', subject, bodyText: subject, priority, category: 'service' });
}

/* ── Photographing ───────────────────────────────────────────────────────── */

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1.5 });
await ctx.addInitScript(([token, acct]: string[]) => {
  localStorage.setItem('crm_session', JSON.stringify({
    token, backend: 'php', user: { email: 'alex@riverastudio.com', name: 'Alex Rivera', role: 'agency', accountId: acct },
  }));
  localStorage.setItem('crm_active_account', acct);
  /* The agency screen photographed with clients on it. The other rows are the
     agency's client list as the browser holds it; the active one is the real
     server workspace everything else is read from. */
  localStorage.setItem('crm_subaccounts', JSON.stringify([
    { id: acct, name: 'Rivera Studio', plan: 'agency', status: 'active', price: 0 },
    { id: 'reel-c1', parentId: acct, name: 'Northside Plumbing', plan: 'growth', status: 'active', price: 297, createdAt: '2026-06-02T09:00:00Z' },
    { id: 'reel-c2', parentId: acct, name: 'Parkway Dental', plan: 'growth', status: 'active', price: 297, createdAt: '2026-06-19T09:00:00Z' },
    { id: 'reel-c3', parentId: acct, name: 'Legacy Fitness', plan: 'starter', status: 'active', price: 147, createdAt: '2026-07-08T09:00:00Z' },
    { id: 'reel-c4', parentId: acct, name: 'Harbour Law', plan: 'pro', status: 'active', price: 497, createdAt: '2026-08-14T09:00:00Z' },
    { id: 'reel-c5', parentId: acct, name: 'Tenby Roofing', plan: 'starter', status: 'trial', price: 147, createdAt: '2026-09-10T09:00:00Z' },
  ]));
  localStorage.setItem('crm_sidebar_mode', JSON.stringify('hidden'));
  /* Still frames: nothing mid-animation in a photograph. */
  localStorage.setItem('crm_motion', 'reduced');
}, [TOK, ACCT]);
const page = await ctx.newPage();
const errs: string[] = [];
page.on('pageerror', e => errs.push(`${page.url()}: ${e.message}`));

const go = async (route: string, settle = 1800) => {
  await page.goto(`${B}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(settle);
};
const into = async (text: string | RegExp) => {
  await page.getByText(text).first().scrollIntoViewIfNeeded().catch(() => {});
  await page.evaluate(() => window.scrollBy(0, -90));
  await page.waitForTimeout(400);
};

/** How to reach each picture. Every file in reels.ts must be here. */
type Clip = { x: number; y: number; width: number; height: number };
const RECIPES: Record<string, () => Promise<void | Clip>> = {
  'dashboard': () => go('/'),
  'ap-board': () => go('/autopilot'),
  'ap-describe': async () => {
    await go('/autopilot');
    await page.getByRole('button', { name: /New project/ }).first().click();
    await page.waitForTimeout(1200);
    const box = page.getByRole('dialog').locator('textarea').first();
    await box.fill('Post on Instagram every morning from our portfolio, answer every quote request within the hour, and ask happy customers for a review.').catch(() => {});
    await page.waitForTimeout(500);
  },
  /* Close in on the diagram. The whole board shrunk into a marketing tile
     shows that a workflow exists; the fork and its labels are what make the
     argument, so the frame is the workflow and not the page. 16:10, like
     every other frame, so the reel does not jump between shapes. */
  'ap-diagram': async () => {
    await go('/autopilot');
    const flow = page.getByRole('group', { name: 'Workflow diagram' }).filter({ hasText: 'Already a customer?' }).first();
    /* The workflow's own card, title row included, placed just under the
       app's sticky top bar — which otherwise sits over the title. And to the
       top of the window, because a clip reaching past the bottom edge comes
       back cut short. */
    const card = page.locator('article').filter({ has: flow }).first();
    await card.evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -112));
    await page.waitForTimeout(500);
    const b = (await card.boundingBox())!;
    const width = 860;
    return { x: Math.max(0, b.x - 12), y: Math.max(0, b.y - 12), width, height: Math.round(width / 1.6) };
  },
  'ap-step': async () => {
    await go('/autopilot');
    const flow = page.getByRole('group', { name: 'Workflow diagram' }).filter({ hasText: 'Already a customer?' }).first();
    await flow.scrollIntoViewIfNeeded();
    await flow.getByRole('button', { name: 'Edit step: A form is submitted' }).click();
    await page.waitForTimeout(900);
    /* The panel and the diagram it came from, side by side. */
    const width = 900;
    return { x: VIEW.width - width, y: 0, width, height: Math.round(width / 1.6) };
  },
  'ap-gallery': () => go('/autopilot?view=templates'),
  'contacts-list': () => go('/contacts'),
  'contacts-profile': async () => {
    await go('/contacts');
    await page.getByText(w.contacts[2].name).first().click();
    await page.waitForTimeout(1200);
  },
  'pipe-board': () => go('/pipelines'),
  'pipe-deal': async () => {
    await go('/pipelines');
    await page.getByText(/Northline Logistics — retainer/).first().click();
    await page.waitForTimeout(1200);
  },
  'mkt-campaigns': async () => {
    await go('/marketing?tab=campaigns');
    /* The mailbox in this workspace is a seeded one that has never been
       verified against a server, so the screen rightly offers the set-up
       banner. It is dismissible, and dismissed is what an owner with a working
       mailbox sees. */
    await page.getByRole('button', { name: '✕' }).first().click().catch(() => {});
    await page.waitForTimeout(300);
  },
  'mkt-sequences': () => go('/marketing?tab=sequences'),
  'eng-forms': () => go('/engagement?tab=forms'),
  'eng-tickets': async () => {
    await go('/engagement?tab=tickets');
    await page.getByText('Boiler making a banging noise').first().click();
    await page.waitForTimeout(1000);
  },
  'funnels-list': () => go('/funnels'),
  'social-editor': () => go('/social-creator/editor/sp-reel-0', 2400),
  'pipe-table': async () => {
    await go('/pipelines');
    await page.getByRole('button', { name: /^Table$/ }).first().click().catch(() => page.getByText('Table').first().click());
    await page.waitForTimeout(1000);
  },
  'sites-list': () => go('/websites'),
  'social-gallery': async () => {
    await go('/social-creator');
    await into('Winter is when boilers give up');
  },
  'blog-projects': () => go('/blog-automation'),
  'cal-week': () => go('/calendar'),
  'agency': () => go('/agency'),
  'analytics': () => go('/analytics'),
};

const missing = REEL_FILES.filter(f => !RECIPES[f]);
if (missing.length) throw new Error(`no capture recipe for: ${missing.join(', ')}`);

const only = process.argv.slice(2);
const taken: string[] = [];
for (const file of REEL_FILES) {
  if (only.length && !only.includes(file)) continue;
  let clip: void | Clip;
  try {
    clip = await RECIPES[file]();
  } catch (e) {
    console.log(`FAILED  ${file}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    process.exitCode = 1;
    continue;
  }
  const broken = await page.evaluate(() => /ran into a problem|something went wrong/i.test(document.body.innerText));
  if (broken) { console.log(`REFUSED ${file} — the screen is showing an error`); process.exitCode = 1; continue; }
  await page.screenshot({ path: `${RAW}/${file}.png`, ...(clip ? { clip } : {}) });
  taken.push(file);
}

/* PNG → WebP in the browser that took them: Chromium encodes WebP natively,
   so there is no second tool to install or forget. 1440 wide is sharp on a
   laptop and still under ~150kB a frame. */
const conv = await ctx.newPage();
await conv.goto('about:blank');
for (const file of taken) {
  const b64 = fs.readFileSync(`${RAW}/${file}.png`).toString('base64');
  const data = await conv.evaluate(async (src: string) => {
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = `data:image/png;base64,${src}`; });
    const c = document.createElement('canvas');
    c.width = 1440;
    c.height = Math.round(img.naturalHeight * (1440 / img.naturalWidth));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/webp', 0.82).split(',')[1];
  }, b64);
  fs.writeFileSync(`${OUT}/${file}.webp`, Buffer.from(data, 'base64'));
  console.log(`wrote   ${file}.webp  ${(fs.statSync(`${OUT}/${file}.webp`).size / 1024).toFixed(0)}kB`);
}

console.log(errs.length ? `PAGE ERRORS:\n  ${errs.join('\n  ')}` : 'no page errors');
await browser.close();
