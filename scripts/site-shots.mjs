/**
 * Real screenshots of the real modules, for the marketing site.
 *
 * Nothing here is a mock-up: the app is booted with a plausible workspace and
 * photographed, so what the site shows is what a customer actually gets. Rerun
 * this whenever a module's look changes.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';

const ROOT = '/home/user/calude';
const BASE = 'http://localhost:5193/calude';
const RAW = '/tmp/crmpro-site-shots';
const OUT = `${ROOT}/public/site`;

fs.rmSync(RAW, { recursive: true, force: true }); fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
execSync(`rm -f ${ROOT}/public/api/data/users.php`);

const vite = spawn('npx', ['vite', '--port', '5193', '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
for (let i = 0; i < 140; i++) { try { if ((await fetch(`${BASE}/`)).ok) break; } catch { /* waiting */ } await new Promise(r => setTimeout(r, 500)); }

const FIRST = ['Aisha','Tom','Marta','Devon','Priya','Grant','Nia','Owen','Rosa','Caleb','Hana','Iris','Marcus','Lena'];
const LAST = ['Khan','Reilly','Vega','Brooks','Nair','Whitfield','Osei','Baptiste','Marin','Doyle','Sato','Flynn','Ellis','Ward'];
const CO = ['Northline Logistics','Parkway Dental','Legacy Fitness','Willow Bend Clinic','Prestonwood Accountants','Creekside Studio','Harbour Law','Fenwick Interiors','Rowan Health','Bluecoat Media','Tenby Roofing','Kestrel Analytics','Alderman Group','Vine Street Cafe'];

function workspace() {
  const now = Date.now();
  const iso = (d) => new Date(now + d * 86400000).toISOString();
  const day = (d) => new Date(now + d * 86400000).toISOString().slice(0, 10);

  const contacts = Array.from({ length: 14 }, (_, i) => ({
    id: `c${i}`, name: `${FIRST[i]} ${LAST[i]}`, firstName: FIRST[i], lastName: LAST[i],
    company: CO[i], email: `${FIRST[i].toLowerCase()}@${CO[i].split(' ')[0].toLowerCase()}.com`,
    phone: `(972) 555-0${String(100 + i).slice(-3)}`,
    status: ['lead','prospect','customer','lead','prospect'][i % 5],
    tags: [['website enquiry'],['referral'],['ai-sales-agent'],['event'],['inbound']][i % 5],
    source: ['Website form','Referral','AI Sales Agent','Trade show','Google'][i % 5],
    createdAt: iso(-40 + i), lastActivity: iso(-i), value: [0,2400,7800,0,1200][i % 5],
    address: '18 Parker Rd, Plano, TX 75074',
  }));

  const stage = (id, name, color, picks) => ({
    id, name, color,
    deals: picks.map((i, n) => ({
      id: `d-${id}-${n}`, title: `${CO[i]} — retainer`, contactId: `c${i}`, contactName: contacts[i].name,
      value: [4200, 12800, 7400, 3600, 21500, 9100][(i + n) % 6],
      stage: id, probability: [20, 45, 65, 85][['new','qualified','proposal','won'].indexOf(id)] ?? 40,
      expectedClose: day(9 + n * 4), assignedTo: 'You', createdAt: iso(-12 + n),
      priority: ['normal','high','urgent','normal'][n % 4],
      /* A deal sitting in the Won column had `status: 'active'` and no closing
         date, so the dashboard's "Revenue won, last 7 days" — which counts
         won deals by the day they closed — was $0 next to a $113k pipeline.
         The board said one thing and the figure above it another. */
      status: id === 'won' ? 'won' : 'active',
      ...(id === 'won' ? { closedAt: iso(-2 - n) } : {}),
    })),
  });

  const pipelines = [{
    id: 'p1', name: 'New business',
    stages: [
      stage('new', 'New', '#94a3b8', [0, 3, 7]),
      stage('qualified', 'Qualified', '#0ea5e9', [1, 8]),
      stage('proposal', 'Proposal sent', '#f59e0b', [2, 5, 11]),
      stage('won', 'Won', '#16a34a', [4, 9]),
    ],
  }];

  const steps = [
    { id: 's0', day: 0, waitUnit: 'days', type: 'auto_email', subject: 'Quick question about {{company}}', body: 'Hi {{firstName}},\n\nI work with firms like {{company}} on filling the diary.\n\nWorth a look?', followUpRule: 'Stop if they reply' },
    { id: 's1', day: 3, waitUnit: 'days', type: 'auto_email', subject: 'Following up', body: 'Hi {{firstName}},\n\nFollowing up on my note.', followUpRule: 'Stop if they reply' },
    { id: 's2', day: 8, waitUnit: 'days', type: 'auto_email', subject: 'Last one from me', body: 'Hi {{firstName}},\n\nI will stop here.', followUpRule: 'Stop if they reply' },
  ];

  const sequences = [
    { id: 'seq-1', name: 'New business — outreach', goal: 'Book consultations', steps, status: 'active', createdAt: iso(-14), enrolledCount: 118,
      source: { origin: 'ai-sales-agent', title: 'North Texas outreach', refId: 'AI-SA-2026-0001', route: '/ai-sales-agent/AI-SA-2026-0001', at: iso(-14) } },
    { id: 'seq-2', name: 'Lapsed customers — win back', goal: 'Reopen conversations', steps: steps.slice(0, 2), status: 'draft', createdAt: iso(-5), enrolledCount: 0 },
  ];

  const campaign = {
    id: 'AI-SA-2026-0001', name: 'North Texas outreach',
    objective: 'Find 200 clinics and firms across North Texas, email them about our booking service at $290 a month, follow up twice, and book consultations.',
    status: 'running',
    strategy: {
      summary: 'Contact 200 prospects in North Texas about a booking service at $290 a month. Open on email, then 2 follow-ups 4 days apart, and a booking link for anyone who shows interest.',
      icp: { description: 'clinics and firms in North Texas', industry: 'clinics', location: 'North Texas', signals: ['based in North Texas', 'works in clinics', 'could plausibly afford $290 a month'] },
      offer: { what: 'a booking service', priceHint: '$290 a month' },
      channels: ['email', 'calendar'], cadence: { followUps: 2, intervalDays: 4 },
      exitConditions: ['They reply', 'They book a meeting', 'They unsubscribe or ask to stop'],
      targetCount: 200, rationale: ['Email leads, because it is the cheapest channel to test a message on before spending anything else.'], generatedBy: 'fallback',
    },
    guardrails: { dailyNewProspects: 100, maxEmailsPerDay: 120, maxSmsPerDay: 20, createWorkflows: 'on', activateWorkflows: 'on', sendEmail: 'on', sendSms: 'approval', bookAppointments: 'on' },
    links: [
      { kind: 'sequence', id: 'seq-1', label: 'New business — outreach', route: '/marketing', at: iso(-14) },
      ...contacts.slice(0, 8).map(c => ({ kind: 'contact', id: c.id, label: c.name, route: '/contacts', at: iso(-14) })),
    ],
    createdAt: iso(-15), updatedAt: iso(-1),
  };

  const emails = [];
  for (let i = 0; i < 118; i++) {
    const s = i < 4 ? 'bounced' : i < 13 ? 'replied' : i < 61 ? 'opened' : 'sent';
    emails.push({ id: `em${i}`, contactId: `c${i % 14}`, subject: 'Quick question about Northline Logistics',
      body: 'Hi Aisha,\n\nI work with firms like Northline Logistics on filling the diary.', direction: 'outbound',
      status: s, createdAt: iso(-9), sentAt: iso(-9), opens: s === 'sent' ? 0 : 1, clicks: 0,
      clickedUrls: [], attachments: [], threadId: `t${i}`, sequenceId: 'seq-1' });
  }

  const enrolments = Array.from({ length: 118 }, (_, i) => ({
    id: `e${i}`, contactId: `c${i % 14}`, sequenceId: 'seq-1', sequenceName: 'New business — outreach',
    status: i < 96 ? 'active' : 'completed', currentStep: i % 3, totalSteps: 3,
    enrolledAt: iso(-12), nextSendAt: iso(1), history: [],
  }));

  /*
   * Some of these are deliberately in the *current* week.
   *
   * They were all a day or more ahead, which put every one of them in next
   * week's column — so the calendar's week grid, photographed for the marketing
   * site, was an empty ruled page under a headline about interested replies
   * becoming meetings. The diary has to have something in it on the day the
   * picture is taken.
   */
  const appointments = [
    /* Monday to Wednesday of the week on screen. The first attempt put these on
       day(-2) to day(0), which is Friday to Sunday — inside the week, and
       outside the three columns the close-up crops to, so the grid was still
       photographed empty. */
    { id: 'a0', title: 'Intro call', contactId: 'c3', contactName: contacts[3].name, date: day(-6), time: '09:00', duration: 30, status: 'completed', type: 'call' },
    { id: 'a6', title: 'Scoping call', contactId: 'c5', contactName: contacts[5].name, date: day(-6), time: '11:00', duration: 45, status: 'completed', type: 'consultation' },
    { id: 'a7', title: 'Retainer review', contactId: 'c8', contactName: contacts[8].name, date: day(-5), time: '10:00', duration: 30, status: 'completed', type: 'meeting' },
    { id: 'a8', title: 'Follow-up', contactId: 'c11', contactName: contacts[11].name, date: day(-4), time: '08:30', duration: 30, status: 'completed', type: 'call' },
    { id: 'a9', title: 'Kickoff', contactId: 'c6', contactName: contacts[6].name, date: day(-4), time: '11:30', duration: 60, status: 'completed', type: 'meeting' },
    { id: 'a1', title: 'Discovery call', contactId: 'c1', contactName: contacts[1].name, date: day(1), time: '10:00', duration: 30, status: 'scheduled', type: 'consultation' },
    { id: 'a2', title: 'Proposal walkthrough', contactId: 'c4', contactName: contacts[4].name, date: day(1), time: '14:30', duration: 45, status: 'scheduled', type: 'meeting' },
    { id: 'a3', title: 'Onboarding', contactId: 'c9', contactName: contacts[9].name, date: day(2), time: '09:30', duration: 60, status: 'scheduled', type: 'meeting' },
    { id: 'a4', title: 'Check-in', contactId: 'c2', contactName: contacts[2].name, date: day(3), time: '11:00', duration: 30, status: 'scheduled', type: 'call' },
    { id: 'a5', title: 'Quarterly review', contactId: 'c7', contactName: contacts[7].name, date: day(4), time: '15:00', duration: 45, status: 'scheduled', type: 'meeting' },
  ];

  /* Prospects the campaign found, so the roll-up has real counts rather than
     the dashes it correctly shows when nothing has been searched. */
  const leads = Array.from({ length: 214 }, (_, i) => ({
    id: `l${i}`, campaignId: 'AI-SA-2026-0001', name: CO[i % 14],
    source: 'google-places', sourceRef: `place-${i}`,
    address: '18 Parker Rd, Plano, TX 75074', phone: '(972) 555-0101',
    email: i < 118 ? `hello${i}@example.com` : undefined,
    status: i < 118 ? 'promoted' : i < 166 ? 'qualified' : 'rejected',
    qualification: { score: 72, checks: [], contactable: ['email'], at: iso(-10) },
    createdAt: iso(-10),
  }));

  /* Marketing reads crm_campaigns, which nothing seeded — so the picture of
     the email module on the marketing site was of an empty module, under a
     headline about cadences that stop when somebody answers. */
  const campaigns = [
    { id: 'cmp-1', name: 'North Texas outreach', type: 'sequence', status: 'active',
      goal: 'Book consultations', audience: 'Clinics and firms, North Texas',
      fromName: 'Alex Rivera', openTracking: true, clickTracking: true, stopOnReply: true, stopOnBounce: true,
      createdAt: day(-14), sent: 118, opened: 61, clicked: 22, replied: 9, bounced: 4,
      source: { origin: 'ai-sales-agent', title: 'North Texas outreach', refId: 'AI-SA-2026-0001', route: '/ai-sales-agent/AI-SA-2026-0001', at: iso(-14) } },
    { id: 'cmp-2', name: 'Lapsed customers — win back', type: 'email', status: 'scheduled',
      goal: 'Reopen conversations', audience: 'Customers with no activity in 90 days',
      fromName: 'Alex Rivera', openTracking: true, clickTracking: true, stopOnReply: true, stopOnBounce: true,
      createdAt: day(-5), scheduledAt: iso(2), sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 },
    { id: 'cmp-3', name: 'Booking service — spring offer', type: 'email', status: 'completed',
      goal: 'Upsell existing customers', audience: 'Active customers',
      fromName: 'Alex Rivera', openTracking: true, clickTracking: true, stopOnReply: true, stopOnBounce: true,
      createdAt: day(-38), sent: 96, opened: 54, clicked: 19, replied: 7, bounced: 1 },
  ];

  return { contacts, pipelines, sequences, campaign, campaigns, emails, enrolments, appointments, leads };
}

/* The window every capture is measured against. The clip regions below are
   document pixels at exactly this size, so changing it invalidates them. */
const VIEWPORT = { width: 1240, height: 800 };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
await ctx.addInitScript((w) => {
  localStorage.setItem('crm_session', JSON.stringify({ token: 't', user: { email: 'you@studio.test', name: 'Alex Rivera', role: 'agency', accountId: null }, backend: 'local' }));
  localStorage.setItem('crm_onboarding', JSON.stringify({ version: 1, step: 5, completed: true, skipped: true, profile: { companyName: 'Rivera Studio' }, goals: {}, channels: [], plan: [], audit: [] }));
  localStorage.setItem('crm_contacts', JSON.stringify(w.contacts));
  localStorage.setItem('crm_pipelines', JSON.stringify(w.pipelines));
  localStorage.setItem('crm_sequences', JSON.stringify(w.sequences));
  localStorage.setItem('crm_ai_campaigns', JSON.stringify([w.campaign]));
  localStorage.setItem('crm_campaigns', JSON.stringify(w.campaigns));
  localStorage.setItem('crm_contact_emails', JSON.stringify(w.emails));
  localStorage.setItem('crm_sequence_enrollments', JSON.stringify(w.enrolments));
  localStorage.setItem('crm_appointments', JSON.stringify(w.appointments));
  localStorage.setItem('crm_ai_leads', JSON.stringify(w.leads));
  localStorage.setItem('crm_sidebar_mode', JSON.stringify('hidden'));
}, workspace());

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.stack || e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 400)); });

/*
 * What to photograph.
 *
 * One picture per module was one picture too few. A whole 1240px window shrunk
 * into a marketing page shows that a screen exists and nothing about what it
 * does; the parts that carry the argument — the figures, the board, the ranked
 * list of what to do next — are each a few dozen pixels tall in it.
 *
 * So each module is captured several times, close in, on the region that
 * actually makes its point. The regions come from measuring the running app
 * rather than from taste: `clip` is in document pixels at the 1240x800 viewport
 * below, and `fullPage` lets a region below the fold be captured without
 * scrolling the page under it.
 *
 * `label` is what the site prints under the view. It says which function is
 * being shown, because a crop without one is just a smaller screenshot.
 */
const SHOTS = [
  { file: 'dashboard',      path: '/', settle: 2800 },
  { file: 'dash-kpis',      path: '/', clip: { x: 96, y: 248, width: 560, height: 180 }, label: 'Counted from your own records, not estimated' },
  { file: 'dash-next',      path: '/', clip: { x: 114, y: 700, width: 600, height: 262 }, label: 'What to do next, ranked by lift' },

  { file: 'agent',          path: '/ai-sales-agent/AI-SA-2026-0001', settle: 2800 },
  { file: 'agent-objective', path: '/ai-sales-agent/AI-SA-2026-0001', clip: { x: 84, y: 326, width: 620, height: 146 }, label: 'Your sentence, kept word for word' },
  { file: 'agent-metrics',  path: '/ai-sales-agent/AI-SA-2026-0001', clip: { x: 106, y: 544, width: 600, height: 192 }, label: 'Every figure read live from the module that owns it' },

  { file: 'flow',           path: '/ai-sales-agent/AI-SA-2026-0001?tab=flow', settle: 3400 },

  { file: 'marketing',      path: '/marketing', settle: 2800 },
  { file: 'mkt-stats',      path: '/marketing', clip: { x: 84, y: 334, width: 580, height: 114 }, label: 'Sent, opened and replied across every campaign' },
  { file: 'mkt-list',       path: '/marketing', clip: { x: 84, y: 452, width: 620, height: 310 }, label: 'Each campaign, and the sequence that produced it' },

  { file: 'contacts',       path: '/contacts', settle: 2800 },
  { file: 'contacts-filters', path: '/contacts', clip: { x: 56, y: 190, width: 620, height: 240 }, label: 'Filter by status, stage, owner or tag' },
  { file: 'contacts-table', path: '/contacts', clip: { x: 84, y: 430, width: 620, height: 400 }, label: 'Health, stage and pipeline on every row' },

  { file: 'pipelines',      path: '/pipelines', settle: 2800 },
  { file: 'pipe-summary',   path: '/pipelines', clip: { x: 84, y: 216, width: 580, height: 142 }, label: 'Open value, and the same value weighted by probability' },
  { file: 'pipe-board',     path: '/pipelines', clip: { x: 84, y: 462, width: 600, height: 420 }, label: 'Stages you define, dragged straight across' },

  { file: 'calendar',       path: '/calendar', settle: 2800 },
  { file: 'cal-week',       path: '/calendar', clip: { x: 78, y: 280, width: 600, height: 420 }, label: 'The week, on one grid' },
  { file: 'cal-upcoming',   path: '/calendar', clip: { x: 878, y: 266, width: 352, height: 380 }, label: 'What is booked, and who booked it' },
];

/* One navigation per address, however many crops come off it. */
let at = '';
for (const s of SHOTS) {
  if (at !== s.path) {
    await page.goto(`${BASE}${s.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(s.settle ?? 2600);
    await page.evaluate(() => document.querySelectorAll('[class*="notif"], [role="status"]').forEach(n => n.remove()));
    at = s.path;
  }
  const broken = await page.evaluate(() => /ran into a problem/i.test(document.body.innerText));
  if (broken) { console.log('REFUSED', s.file, '— the screen is showing the error boundary'); process.exitCode = 1; continue; }
  await page.screenshot({ path: `${RAW}/${s.file}.png`, ...(s.clip ? { clip: s.clip, fullPage: true } : {}) });
  console.log('captured', s.file);
}

console.log('ERRORS:', errs.length ? errs.join(' | ') : 'none');

/*
 * PNG → WebP, in the browser that just took them.
 *
 * This step used to not exist. The script wrote full-size PNGs to a temp
 * directory and stopped, and somebody converted them by hand with cwebp — so
 * re-running it appeared to work, printed "captured" seven times, and changed
 * nothing the site actually serves.
 *
 * Chromium encodes WebP natively, and there is a Chromium right here. The crops
 * are already close in, so they are written at their captured width rather than
 * being scaled down again into illegibility; only the full-window shots need
 * reducing.
 */
const conv = await ctx.newPage();
await conv.goto('about:blank');
const manifest = [];
for (const s of SHOTS) {
  const png = `${RAW}/${s.file}.png`;
  if (!fs.existsSync(png)) { console.log('skipped', s.file, '— no capture'); continue; }
  const b64 = fs.readFileSync(png).toString('base64');
  const out = await conv.evaluate(async ({ b64, cap }) => {
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = 'data:image/png;base64,' + b64; });
    /* Captured at 2x for sharpness, written at 1x. A crop written wider than
       the region it came from would be upscaled mush; written narrower it is
       shrunk again, which is the thing these crops exist to avoid. */
    const w = Math.min(img.naturalWidth, cap);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = Math.round((img.naturalHeight / img.naturalWidth) * w);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { data: c.toDataURL('image/webp', 0.85).split(',')[1], w: c.width, h: c.height };
  }, { b64, cap: s.clip ? s.clip.width : 1400 });
  fs.writeFileSync(`${OUT}/${s.file}.webp`, Buffer.from(out.data, 'base64'));
  manifest.push({ file: s.file, w: out.w, h: out.h, label: s.label ?? null });
  console.log(`wrote ${s.file}.webp  ${out.w}x${out.h}  ${(fs.statSync(`${OUT}/${s.file}.webp`).size / 1024).toFixed(0)}kB`);
}

/* The site needs each picture's real size to reserve space for it before it
   loads; guessing one aspect for crops of five different shapes is what makes
   a page jump about while it settles. */
fs.writeFileSync(`${OUT}/shots.json`, JSON.stringify(manifest, null, 2));
console.log(`wrote shots.json (${manifest.length} views)`);

await browser.close(); vite.kill();