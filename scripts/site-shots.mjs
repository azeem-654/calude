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
      priority: ['normal','high','urgent','normal'][n % 4], status: 'active',
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

  const appointments = [
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

  return { contacts, pipelines, sequences, campaign, emails, enrolments, appointments, leads };
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1240, height: 800 }, deviceScaleFactor: 2 });
await ctx.addInitScript((w) => {
  localStorage.setItem('crm_session', JSON.stringify({ token: 't', user: { email: 'you@studio.test', name: 'Alex Rivera', role: 'agency', accountId: null }, backend: 'local' }));
  localStorage.setItem('crm_onboarding', JSON.stringify({ version: 1, step: 5, completed: true, skipped: true, profile: { companyName: 'Rivera Studio' }, goals: {}, channels: [], plan: [], audit: [] }));
  localStorage.setItem('crm_contacts', JSON.stringify(w.contacts));
  localStorage.setItem('crm_pipelines', JSON.stringify(w.pipelines));
  localStorage.setItem('crm_sequences', JSON.stringify(w.sequences));
  localStorage.setItem('crm_ai_campaigns', JSON.stringify([w.campaign]));
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

const SHOTS = [
  { file: 'dashboard', path: '/' },
  { file: 'agent', path: '/ai-sales-agent/AI-SA-2026-0001' },
  { file: 'marketing', path: '/marketing' },
  { file: 'contacts', path: '/contacts' },
  { file: 'pipelines', path: '/pipelines' },
  { file: 'calendar', path: '/calendar' },
];

for (const s of SHOTS) {
  await page.goto(`${BASE}${s.path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);
  // Notifications would date the picture and add nothing.
  await page.evaluate(() => document.querySelectorAll('[class*="notif"], [role="status"]').forEach(n => n.remove()));
  const broken = await page.evaluate(() => /ran into a problem/i.test(document.body.innerText));
  if (broken) { console.log('REFUSED', s.file, '— the screen is showing the error boundary'); process.exitCode = 1; continue; }
  await page.screenshot({ path: `${RAW}/${s.file}.png` });
  console.log('captured', s.file);
}

console.log('ERRORS:', errs.length ? errs.join(' | ') : 'none');
await browser.close(); vite.kill();
