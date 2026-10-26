/**
 * Photographs the industry sites' "See it working" screens from the real app:
 * an HVAC business, a roofing business and the synthetic medical practice.
 *
 *   VITE_BASE=/ npm run build
 *   npx tsx scripts/industry-demos.mts             # every picture
 *   npx tsx scripts/industry-demos.mts hvac-jobs   # just the ones named
 *   HOLD=1 npx tsx scripts/industry-demos.mts      # seed, then wait (for writing a recipe)
 *
 * Self-contained like site-reels.mts: its own `wrangler dev` (:8798) over a
 * fresh database in `.wrangler-demos`, so nothing it writes reaches a real
 * workspace.
 *
 * ── Why a second script, not more recipes in site-reels.mts ──
 *
 * site-reels.mts photographs one sample agency, and its pictures are the home
 * page's. A trade owner reading /hvac looking at an agency with five clients
 * in other trades is not seeing their own business. These screens are three
 * different workspaces — a heating and cooling firm, a roofer and a practice —
 * each set up the way the service sets one up (the industry snapshot, its
 * pipeline and fields, its workflows, the Jobs & revenue ledger written
 * through the real API: inquiries, quotes, jobs confirmed by the contractor,
 * payments reported and then confirmed), and the medical practice is the
 * synthetic one `synthetic_seed` loads — every screen of it says so.
 *
 * Every business, person and address is invented and on `.example`; the
 * pages that show these pictures say they are a sample workspace. Each
 * recipe ends on `onScreen` (the address and a line only that screen
 * carries), so a picture can never land under another step's words.
 *
 * Writes public/site/reel/<file>{,-sm,-m}.webp (ShotReel's names) and
 * marketing/industry-films/focus.json — where on each desktop picture the
 * part worth reading is, which the films zoom to.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DEMO_FILES } from '../src/components/Site/industryDemos.ts';
import { TEMPLATES } from '../src/components/Autopilot/workflowTemplates.ts';

const PORT = 8798, INSPECT = 9398;
const B = `http://127.0.0.1:${PORT}`;
const OUT = 'public/site/reel';
const RAW = '/tmp/industry-demo-raw';
const FOCUS = 'marketing/industry-films/focus.json';
const VIEW = { width: 1920, height: 1200 };
const SCALE = 1.5;
const PHONE = { width: 390, height: 720 };
const only = process.argv.slice(2);

if (!fs.existsSync('dist/index.html')) { console.log('Build first: VITE_BASE=/ npm run build'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(RAW, { recursive: true, force: true });
fs.mkdirSync(RAW, { recursive: true });

/* ── A fresh database and the real Worker ─────────────────────────────────── */

const persist = path.resolve('.wrangler-demos');
fs.rmSync(persist, { recursive: true, force: true });
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
let wr: ReturnType<typeof spawn>;
let wlog = '';
let stopping = false;
/* Restarted on exit, as in site-reels.mts: a dropped request can take local wrangler down. */
const startWrangler = () => {
  wr = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--inspector-port', String(INSPECT), '--persist-to', persist, '--var', `APP_ORIGIN:${B}`], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  wr.stdout!.on('data', c => { wlog += c; }); wr.stderr!.on('data', c => { wlog += c; });
  wr.on('exit', code => { if (!stopping) { console.log(`wrangler exited (${code}) — starting it again`); setTimeout(startWrangler, 1000); } });
};
startWrangler();
const stop = () => { stopping = true; try { process.kill(-wr.pid!, 'SIGTERM'); } catch { /* gone */ } };
process.on('exit', stop);
process.on('uncaughtException', e => { console.log(e); console.log(wlog.slice(-2000)); stop(); process.exit(1); });
const ready = async () => {
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(`${B}/api/data.php`, { method: 'POST', headers: { Connection: 'close' }, body: '{"action":"ping"}' }); if (r.ok) return; } catch { /* starting */ }
    await new Promise(r => setTimeout(r, 1000));
  }
};
await ready();

let ipN = 1;
async function post(p: string, body: Record<string, unknown>): Promise<Record<string, any>> {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(`${B}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.9.${attempt}.${ipN++ % 250}` }, body: JSON.stringify(body) });
      return await r.json() as Record<string, any>;
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise(r => setTimeout(r, 2500 * attempt));
    }
  }
}
const must = async (what: string, p: Promise<Record<string, any>>) => {
  const r = await p;
  if (!r.success) throw new Error(`${what}: ${JSON.stringify(r).slice(0, 300)}`);
  return r;
};
const sql = (q: string) => JSON.parse(execSync(`npx wrangler d1 execute crmpro --local --persist-to ${persist} --json --command ${JSON.stringify(q)}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))[0].results as Record<string, any>[];

const now = Date.now();
const iso = (d: number, h = 0) => new Date(now + d * 86_400_000 + h * 3_600_000).toISOString();
const day = (d: number) => iso(d).slice(0, 10);
const today = day(0);

/* ── The install owner: the service team, and the biller ──────────────────── */

const OWNER = { email: 'team@protectedcentral.example', password: 'Tq9!vX2#pLm7wZ-demos', name: 'Growth team' };
await must('bootstrap', post('/api/auth.php', { action: 'bootstrap', ...OWNER }));
const T: string = (await must('owner login', post('/api/auth.php', { action: 'login', email: OWNER.email, password: OWNER.password }))).token;
await must('terms', post('/api/lead-revenue.php', {
  action: 'terms_add', token: T, effectiveFrom: today, note: 'Published terms',
  terms: { setupCents: 30000, monthlyCents: 8700, performanceBps: 500, attributionDays: 180, exclusions: ['tax', 'permits'] },
}));

/* ── The two trades ──────────────────────────────────────────────────────── */

interface Person { first: string; last: string; town: string; street: string; tags: string[]; status: string; fields: Record<string, string> }
interface Lead {
  who: number; service: string; channel: string; detail?: string; stage: string;
  quote?: number; final?: number; paid?: number; excluded?: number; confirm?: boolean; method?: string;
}
interface Trade {
  slug: 'hvac' | 'roofing'; business: string; owner: string; email: string; password: string; domain: string; phone: string;
  description: string; project: string; objective: string; templates: string[];
  people: Person[]; deals: [number, string, number][][]; appts: [number, string, number, string, number][]; leads: Lead[];
}

const P = (first: string, last: string, town: string, street: string, status: string, tags: string[], fields: Record<string, string>): Person => ({ first, last, town, street, status, tags, fields });

const TRADES: Trade[] = [
  {
    slug: 'hvac', business: 'Northwind Heating & Air', owner: 'Maria Lopez', email: 'maria@northwindair.example', password: 'Northwind-capture-2026!',
    domain: 'northwindair.example', phone: '(614) 555-0142',
    description: 'Heating and cooling repair, replacement and maintenance plans for homes and light commercial buildings in Columbus, Ohio.',
    project: 'Northwind — every enquiry answered', objective: 'Answer every web enquiry within minutes, follow up every estimate, and fill the spring tune-up calendar from past customers',
    templates: ['speed-to-lead', 'quote-chase', 'appointment-reminders', 'stale-deal', 'review-request', 'dormant-winback'],
    people: [
      P('Dana', 'Whitfield', 'Dublin, OH', '412 Brand Rd', 'lead', ['website enquiry', 'no heat'], { hvac_service: 'Repair', hvac_system: 'Furnace', hvac_system_age: '17 years', hvac_fuel: 'Gas', property_type: 'Home' }),
      P('Marcus', 'Bell', 'Westerville, OH', '88 Otterbein Ave', 'prospect', ['estimate sent'], { hvac_service: 'Replacement', hvac_system: 'Heat pump', hvac_system_age: '14 years', hvac_fuel: 'Electric', property_type: 'Home' }),
      P('Priya', 'Natarajan', 'Hilliard, OH', '5120 Cemetery Rd', 'customer', ['maintenance plan'], { hvac_service: 'Maintenance', hvac_system: 'AC', hvac_system_age: '6 years', property_type: 'Home', hvac_plan: 'Yes' }),
      P('Tom', 'Garrity', 'Grove City, OH', '3301 Broadway', 'prospect', ['estimate sent', 'financing'], { hvac_service: 'Replacement', hvac_system: 'Furnace and AC', hvac_system_age: '21 years', hvac_fuel: 'Gas', property_type: 'Home' }),
      P('Elena', 'Cruz', 'Columbus, OH', '77 E Gay St', 'lead', ['property manager', 'commercial'], { hvac_service: 'Maintenance', hvac_system: 'Rooftop units', property_type: 'Commercial' }),
      P('James', 'Okafor', 'Upper Arlington, OH', '2045 Tremont Rd', 'customer', ['past customer'], { hvac_service: 'Repair', hvac_system: 'Boiler', hvac_system_age: '11 years', hvac_fuel: 'Gas', property_type: 'Home' }),
      P('Sofia', 'Lindqvist', 'Worthington, OH', '640 High St', 'lead', ['website enquiry'], { hvac_service: 'Replacement', hvac_system: 'AC', hvac_system_age: '19 years', property_type: 'Home' }),
      P('Ray', 'Mendoza', 'Gahanna, OH', '190 Mill St', 'customer', ['maintenance plan', 'referral'], { hvac_service: 'Maintenance', hvac_system: 'Heat pump', hvac_system_age: '4 years', property_type: 'Home', hvac_plan: 'Yes' }),
      P('Linda', 'Park', 'Bexley, OH', '2500 E Main St', 'prospect', ['visit booked'], { hvac_service: 'Repair', hvac_system: 'AC', hvac_system_age: '9 years', property_type: 'Rental' }),
      P('Kevin', 'Shaw', 'Reynoldsburg, OH', '7400 E Main St', 'customer', ['past customer'], { hvac_service: 'Replacement', hvac_system: 'Furnace', hvac_system_age: '2 years', hvac_fuel: 'Gas', property_type: 'Home' }),
      P('Aisha', 'Rahman', 'Dublin, OH', '6650 Perimeter Dr', 'lead', ['website enquiry', 'commercial'], { hvac_service: 'Repair', hvac_system: 'Rooftop units', property_type: 'Commercial' }),
      P('Greg', 'Holloway', 'Powell, OH', '30 Village Pointe', 'customer', ['maintenance plan'], { hvac_service: 'Maintenance', hvac_system: 'Furnace', hvac_system_age: '8 years', hvac_fuel: 'Gas', property_type: 'Home', hvac_plan: 'Yes' }),
    ],
    /* Per snapshot stage, in order: [person, what, value]. */
    deals: [
      [[0, 'No-heat diagnostic', 189], [6, 'AC replacement quote', 0], [10, 'Rooftop unit repair', 0]],
      [[8, 'AC not cooling — visit', 189], [4, 'Rooftop maintenance contract', 4800]],
      [[1, 'Heat pump replacement', 11850], [3, 'Furnace + AC replacement', 14200]],
      [[3, 'Financing options sent', 14200], [6, 'High-efficiency AC', 7900]],
      [[5, 'Boiler repair', 1350], [7, 'Heat pump tune-up plan', 279]],
      [[9, 'Furnace install', 6800], [2, 'Spring AC tune-up', 149], [11, 'Plan renewal', 279]],
    ],
    appts: [
      [0, 'No-heat diagnostic', 0, '08:00', 60], [8, 'AC not cooling — visit', 0, '10:30', 60], [1, 'Heat pump install — day 1', 1, '08:00', 480],
      [4, 'Rooftop units walk-through', 1, '14:00', 90], [2, 'Spring tune-up', 2, '09:00', 60], [11, 'Spring tune-up', 2, '11:00', 60],
      [7, 'Plan maintenance visit', 3, '08:30', 60], [6, 'Replacement estimate visit', 3, '13:00', 60], [5, 'Boiler repair follow-up', 4, '10:00', 60],
    ],
    leads: [
      { who: 0, service: 'No heat — furnace repair', channel: 'service_web', detail: 'Website form — “No heat” page', stage: 'appointment' },
      { who: 1, service: 'Heat pump replacement', channel: 'service_ads', detail: 'Google Ads — heat pump replacement', stage: 'quoted', quote: 11850 },
      { who: 3, service: 'Furnace and AC replacement', channel: 'service_ads', detail: 'Google Ads — furnace replacement', stage: 'quoted', quote: 14200 },
      { who: 6, service: 'AC replacement', channel: 'service_web', detail: 'Website form — free estimate', stage: 'qualified' },
      { who: 10, service: 'Rooftop unit repair', channel: 'service_outreach', detail: 'Commercial prospecting — offices, Dublin', stage: 'inquiry' },
      { who: 4, service: 'Rooftop maintenance contract', channel: 'service_calls', detail: 'Outbound call — property managers', stage: 'appointment' },
      { who: 9, service: 'Furnace install', channel: 'service_ads', detail: 'Google Ads — furnace replacement', stage: 'completed', quote: 6800, final: 6800, paid: 6800, excluded: 450, confirm: true, method: 'financing' },
      { who: 5, service: 'Boiler repair', channel: 'service_web', detail: 'Website form — boiler repair', stage: 'completed', quote: 1350, final: 1350, paid: 1350, confirm: false, method: 'card' },
      { who: 7, service: 'Heat pump tune-up plan', channel: 'own_referral', detail: 'Referred by a neighbour', stage: 'won', quote: 279 },
      { who: 11, service: 'Plan renewal', channel: 'own_repeat', detail: 'Existing maintenance-plan member', stage: 'completed', quote: 279, final: 279, paid: 279, confirm: true, method: 'card' },
    ],
  },
  {
    slug: 'roofing', business: 'Summit Ridge Roofing', owner: 'Ben Carter', email: 'ben@summitridge.example', password: 'SummitRidge-capture-2026!',
    domain: 'summitridgeroofing.example', phone: '(817) 555-0177',
    description: 'Roof repair, replacement and storm-damage work for homes and small commercial buildings across Fort Worth and Arlington, Texas.',
    project: 'Summit Ridge — inspections to signed jobs', objective: 'Answer every inquiry fast, confirm every inspection, follow up every estimate and keep insurance jobs moving',
    templates: ['speed-to-lead', 'appointment-reminders', 'quote-chase', 'stage-proposal', 'review-request', 'unhappy-first'],
    people: [
      P('Hannah', 'Brooks', 'Arlington, TX', '1408 W Abram St', 'lead', ['website enquiry', 'leak'], { roof_material: 'Shingle', roof_age: '18 years', roof_issue: 'Leak over the kitchen', roof_stories: '1', property_type: 'Home' }),
      P('Victor', 'Reyes', 'Fort Worth, TX', '3920 Camp Bowie Blvd', 'prospect', ['insurance claim', 'hail'], { roof_material: 'Shingle', roof_age: '12 years', roof_issue: 'Hail damage', roof_stories: '2', insurance_carrier: 'Carrier on file', insurance_claim: 'Opened', property_type: 'Home' }),
      P('Claire', 'Donovan', 'Keller, TX', '220 Bear Creek Pkwy', 'prospect', ['estimate sent'], { roof_material: 'Shingle', roof_age: '22 years', roof_issue: 'Ageing roof', roof_stories: '2', property_type: 'Home' }),
      P('Omar', 'Haddad', 'Fort Worth, TX', '601 Main St', 'lead', ['commercial', 'flat roof'], { roof_material: 'Flat (TPO)', roof_issue: 'Ponding and a leak', property_type: 'Commercial' }),
      P('Grace', 'Kim', 'Southlake, TX', '1250 Main St', 'customer', ['past customer'], { roof_material: 'Metal', roof_age: '1 year', property_type: 'Home' }),
      P('Luis', 'Ortega', 'Grapevine, TX', '415 S Main St', 'prospect', ['insurance claim', 'storm'], { roof_material: 'Tile', roof_age: '15 years', roof_issue: 'Wind damage', roof_stories: '1', insurance_carrier: 'Carrier on file', insurance_claim: 'Adjuster booked', property_type: 'Home' }),
      P('Megan', 'Foster', 'Mansfield, TX', '108 N Main St', 'lead', ['website enquiry'], { roof_material: 'Shingle', roof_age: '25 years', roof_issue: 'Missing shingles', roof_stories: '1', property_type: 'Home' }),
      P('Derek', 'Wallace', 'Arlington, TX', '2200 E Lamar Blvd', 'customer', ['referral'], { roof_material: 'Shingle', roof_age: 'New', property_type: 'Rental' }),
      P('Nina', 'Patel', 'Bedford, TX', '2000 Forest Ridge Dr', 'prospect', ['inspection booked'], { roof_material: 'Shingle', roof_age: '16 years', roof_issue: 'Granules in the gutters', roof_stories: '2', property_type: 'Home' }),
      P('Sam', 'Whitaker', 'Fort Worth, TX', '5100 Bryant Irvin Rd', 'customer', ['past customer'], { roof_material: 'Shingle', roof_age: '3 years', property_type: 'Home' }),
      P('Rachel', 'Nguyen', 'Euless, TX', '900 W Euless Blvd', 'lead', ['storm', 'website enquiry'], { roof_material: 'Shingle', roof_age: '11 years', roof_issue: 'Hail damage', roof_stories: '1', property_type: 'Home' }),
      P('Paul', 'Sanders', 'Hurst, TX', '1600 Precinct Line Rd', 'customer', ['insurance claim'], { roof_material: 'Shingle', roof_age: 'New', property_type: 'Home' }),
    ],
    deals: [
      [[0, 'Kitchen leak — repair', 0], [6, 'Missing shingles', 0], [10, 'Hail check', 0]],
      [[8, 'Inspection — granule loss', 0], [3, 'Flat roof survey', 0]],
      [[2, 'Full replacement — architectural shingle', 16400], [3, 'TPO recover', 28900]],
      [[1, 'Hail claim — full replacement', 18750], [5, 'Wind claim — tile repair', 7300]],
      [[7, 'Rental re-roof', 11200], [11, 'Insurance re-roof', 15800]],
      [[9, 'Repair and gutter guard', 2450], [4, 'Metal roof', 24600]],
    ],
    appts: [
      [8, 'Roof inspection', 0, '09:00', 60], [0, 'Leak inspection', 0, '13:30', 60], [5, 'Adjuster meeting on site', 1, '10:00', 90],
      [3, 'Flat roof survey', 1, '14:00', 90], [7, 'Re-roof — tear-off', 2, '07:30', 600], [10, 'Hail inspection', 3, '09:30', 60],
      [6, 'Repair estimate visit', 3, '15:00', 60], [11, 'Final walk-through', 4, '11:00', 45],
    ],
    leads: [
      { who: 0, service: 'Leak over the kitchen', channel: 'service_web', detail: 'Website form — roof leak', stage: 'appointment' },
      { who: 2, service: 'Full replacement', channel: 'service_ads', detail: 'Google Ads — roof replacement', stage: 'quoted', quote: 16400 },
      { who: 1, service: 'Hail claim — full replacement', channel: 'service_ads', detail: 'Google Ads — hail damage', stage: 'quoted', quote: 18750 },
      { who: 5, service: 'Wind claim — tile repair', channel: 'service_web', detail: 'Website form — storm damage', stage: 'quoted', quote: 7300 },
      { who: 3, service: 'Flat roof recover', channel: 'service_outreach', detail: 'Commercial prospecting — retail, Fort Worth', stage: 'appointment' },
      { who: 10, service: 'Hail inspection', channel: 'service_web', detail: 'Website form — free inspection', stage: 'inquiry' },
      { who: 11, service: 'Insurance re-roof', channel: 'service_ads', detail: 'Google Ads — hail damage', stage: 'completed', quote: 15800, final: 15800, paid: 15800, excluded: 1200, confirm: true, method: 'check' },
      { who: 7, service: 'Rental re-roof', channel: 'own_referral', detail: 'Referred by a past customer', stage: 'completed', quote: 11200, final: 11200, paid: 11200, confirm: true, method: 'bank' },
      { who: 9, service: 'Repair and gutter guard', channel: 'service_web', detail: 'Website form — roof repair', stage: 'completed', quote: 2450, final: 2450, paid: 2450, confirm: false, method: 'card' },
      { who: 6, service: 'Missing shingles', channel: 'service_web', detail: 'Website form — roof repair', stage: 'qualified' },
    ],
  },
];

interface Account { slug: string; email: string; password: string; token: string; acct: string; business: string; projectId?: string }
const accounts: Record<string, Account> = {};

for (const t of TRADES) {
  const reg = await must(`${t.slug} sign-up`, post('/api/auth.php', { action: 'register', email: t.email, password: t.password, name: t.owner, businessName: t.business }));
  const a: Account = { slug: t.slug, email: t.email, password: t.password, token: reg.token, acct: reg.user.accountId, business: t.business };
  accounts[t.slug] = a;
  const as = (p: string, body: Record<string, unknown>) => post(p, { token: a.token, accountId: a.acct, ...body });
  /* A paying growth-service customer, not a trial: the trial bar is not the picture. */
  sql(`INSERT OR REPLACE INTO crm_plans (owner_email, plan_id, resell_limit, source, updated_at) VALUES ('${t.email}', 'growth', 0, 'manual', '${iso(0)}')`);

  /* The industry snapshot — the pipeline, its stages and the fields the service installs. */
  await must(`${t.slug} snapshot`, post('/api/snapshots.php', { action: 'claim', token: a.token, industry: t.slug }));
  const pipes = JSON.parse(sql(`SELECT v FROM crm_data WHERE account_id = '${a.acct}' AND k = 'crm_pipelines'`)[0]?.v ?? '[]');
  const pipe = pipes.find((p: { id: string }) => p.id === `snap-${t.slug}-pipeline`);
  if (!pipe) throw new Error(`${t.slug}: the snapshot pipeline is missing`);

  const contacts = t.people.map((p, i) => ({
    id: `${t.slug}-c${i}`, name: `${p.first} ${p.last}`, firstName: p.first, lastName: p.last,
    company: p.fields.property_type === 'Commercial' ? `${p.last} Property Group` : '',
    email: `${p.first.toLowerCase()}.${p.last.toLowerCase()}@mail.example`, phone: `(555) 01${String(10 + i).padStart(2, '0')}-${String(2200 + i * 37).slice(0, 4)}`,
    status: p.status, tags: p.tags, source: ['Website form', 'Google Ads', 'Referral', 'Phone call'][i % 4],
    createdAt: iso(-40 + i * 3), lastActivity: day(-(i % 9)), value: 0,
    address: `${p.street}, ${p.town}`, customFields: p.fields,
  }));
  const probability = [10, 25, 45, 60, 90, 100];
  pipe.stages = pipe.stages.map((st: Record<string, unknown>, si: number) => ({
    ...st,
    deals: (t.deals[si] ?? []).map(([who, what, value], n) => ({
      id: `${t.slug}-d${si}-${n}`, title: `${what} — ${contacts[who].name}`, contactId: contacts[who].id, contactName: contacts[who].name,
      value, stage: st.id, probability: probability[si], expectedClose: day(3 + si * 2 + n), assignedTo: ['Office', 'Field team', t.owner.split(' ')[0]][n % 3],
      createdAt: iso(-14 + si + n), priority: si === 2 && n === 0 ? 'high' : 'normal',
      status: si === 5 ? 'won' : 'active', ...(si === 5 ? { closedAt: iso(-1 - n) } : {}),
    })),
  }));
  const appointments = t.appts.map(([who, title, d, time, duration], i) => ({
    id: `${t.slug}-a${i}`, title, contactId: contacts[who].id, contactName: contacts[who].name,
    date: day(d), time, duration, status: 'scheduled', type: 'meeting', location: contacts[who].address,
  }));
  await must(`${t.slug} workspace`, as('/api/data.php', { action: 'bulk_set', items: {
    crm_contacts: JSON.stringify(contacts),
    crm_pipelines: JSON.stringify(pipes),
    crm_appointments: JSON.stringify(appointments),
    crm_setup_hidden: '1',
    crm_email_provider: JSON.stringify({ provider: 'smtp' }),
    crm_smtp: JSON.stringify({ host: `smtp.${t.domain}`, port: '587', user: t.email, pass: '••••••••', fromName: t.business, fromEmail: t.email, encryption: 'tls' }),
    crm_onboarding: JSON.stringify({
      version: 1, step: 5, completed: true, skipped: false,
      profile: { companyName: t.business, industry: t.slug === 'hvac' ? 'HVAC' : 'Roofing', description: t.description, website: t.domain, email: t.email, phone: t.phone, brandColor: '#0f766e' },
      goals: {}, channels: ['email'], plan: [], audit: [],
    }),
  } }));

  /* The business workspace the service sets up, with the trade's workflows from the template library. */
  const pf = await must(`${t.slug} portfolio`, as('/api/projects.php', { action: 'save_portfolio', name: t.business, profile: { description: t.description, website: t.domain } }));
  const pr = await must(`${t.slug} project`, as('/api/projects.php', {
    action: 'save_project', portfolioId: pf.id, name: t.project, objective: t.objective, kind: 'leadgen',
    guardrails: { sendEmail: 'approval', sendSms: 'approval', createWorkflows: 'on', activateWorkflows: 'approval' },
    launchSteps: [{ label: 'Connect the mailbox' }, { label: 'Answer every enquiry fast' }, { label: 'Follow up every estimate' }, { label: 'Ask for reviews' }],
  }));
  a.projectId = pr.id;
  for (const k of t.templates) {
    const tp = TEMPLATES.find(x => x.key === k);
    if (!tp) throw new Error(`no template ${k}`);
    await must(`${t.slug} workflow ${k}`, as('/api/autopilot.php', { action: 'save_workflow', projectId: pr.id, record: { name: tp.name, description: tp.description, nodes: tp.nodes, status: 'active', key: k }, templateKey: k }));
  }
  sql(`UPDATE crm_projects SET status = 'running', last_planned_at = '${iso(0, -2)}', created_at = '${iso(-30)}' WHERE id = '${pr.id}'`);

  /* The agreement, then Jobs & revenue — each step by whoever may take it. */
  const lr = (token: string, body: Record<string, unknown>) => must(`${t.slug} ${String(body.action)}`, post('/api/lead-revenue.php', { token, accountId: a.acct, ...body }));
  await lr(a.token, { action: 'overview' });
  const ag = (await lr(T, { action: 'agreement_draft', customerName: `${t.business} LLC` })).agreement;
  await lr(T, { action: 'agreement_activate', id: ag.id, signedBy: t.owner, signedOn: today, startsOn: today });
  const ORDER = ['inquiry', 'qualified', 'appointment', 'quoted', 'won'];
  for (const [n, l] of t.leads.entries()) {
    const c = contacts[l.who];
    const byService = l.channel.startsWith('service_');
    const who = byService ? T : a.token;
    const lead = (await lr(who, { action: 'lead_create', idem: `${t.slug}-lead-${n}`, lead: {
      name: c.name, phone: c.phone, email: c.email, service: l.service, channel: l.channel, channelDetail: l.detail,
      consent: 'inquiry', timezone: t.slug === 'hvac' ? 'America/New_York' : 'America/Chicago',
    } })).lead;
    const target = l.stage === 'completed' ? 'won' : l.stage;
    for (const to of ORDER.slice(1, ORDER.indexOf(target) + 1)) {
      if (to === 'won' && l.quote) await lr(who, { action: 'lead_update', id: lead.id, patch: { quote: String(l.quote) } });
      await lr(who, { action: 'stage', id: lead.id, to });
    }
    if (target === 'quoted' && l.quote) await lr(who, { action: 'lead_update', id: lead.id, patch: { quote: String(l.quote) } });
    if (l.stage === 'completed') {
      await lr(a.token, { action: 'confirm_completion', id: lead.id, finalAmount: String(l.final) });
      if (l.paid) {
        /* The service reports what it heard was paid; only the contractor's confirmation makes it count. */
        const pay = (await lr(byService ? T : a.token, { action: 'payment_add', leadId: lead.id, kind: 'payment', amount: String(l.paid), excluded: l.excluded ? String(l.excluded) : '', receivedOn: today, method: l.method ?? 'card', idem: `${t.slug}-pay-${n}` })).payment;
        if (byService && l.confirm) await lr(a.token, { action: 'payment_confirm', id: pay.id });
      }
    }
  }
  const st = (await lr(T, { action: 'statement_compute', periodEnd: today })).statement;
  await lr(T, { action: 'statement_send', id: st.id });
  console.log(`seeded  ${t.business}`);
}

/* ── The synthetic practice, in the owner's own workspace ─────────────────── */

/* A fixed workspace id the owner's browser is pointed at (crm_active_account
   and crm_subaccounts, below): an install owner with no account of their own
   gets an invented `acct-<timestamp>` per page load otherwise, and the
   practice seeded into one load's workspace is gone on the next. The first
   overview claims it as the owner's own, which `synthetic_seed` requires. */
const MED_ACCT = 'acct-demo-billing';
await must('practice workspace', post('/api/data.php', { action: 'bulk_set', token: T, accountId: MED_ACCT, items: { crm_setup_hidden: '1' } }));
const seeded = await must('synthetic practice', post('/api/rcm.php', { action: 'synthetic_seed', token: T, accountId: MED_ACCT }));
const claimNo: Record<string, string> = seeded.claimNos ?? {};
const ov = await must('practice overview', post('/api/rcm.php', { action: 'overview', token: T, accountId: MED_ACCT }));
const claimId = (no: string) => (ov.claims as Record<string, any>[]).find(c => (c.claimNo ?? c.claim_no) === no)?.id;
/* What a practice and its billing team say to each other — in the portal, not an inbox. */
for (const [ref, body, kind] of [
  ['SYN-1003', 'Please send the visit note that supports medical necessity for this claim, so the appeal goes in before the deadline.', 'request'],
  ['SYN-1008', 'Rejected by the clearinghouse: the subscriber ID does not match this payer. Checking the card on file with the front desk before we resubmit.', 'note'],
  ['SYN-1006', 'Ready to submit, 25 days inside this payer’s filing limit. Going out today.', 'note'],
] as const) {
  await must(`note on ${ref}`, post('/api/rcm.php', { action: 'note_add', token: T, accountId: MED_ACCT, claimId: claimId(claimNo[ref]), body, visibility: 'practice', kind }));
}
console.log(`seeded  the synthetic practice (${Object.keys(claimNo).length} claims)`);

if (process.env.HOLD) {
  fs.writeFileSync(`${RAW}/session.json`, JSON.stringify({ B, owner: OWNER, medAcct: MED_ACCT, accounts }, null, 2));
  console.log(`holding: ${B}, sign-ins in ${RAW}/session.json — stop with Ctrl+C`);
  await new Promise(() => {});
}

/* ── The browser: one signed-in window per business, desktop and phone ───── */

type Who = 'hvac' | 'roofing' | 'med';
const browser = await pw.chromium.launch();
const contexts: Record<string, Awaited<ReturnType<typeof browser.newContext>>> = {};
const errs: string[] = [];
let page: Awaited<ReturnType<Awaited<ReturnType<typeof browser.newContext>>['newPage']>>;
let phone = false;

/** A page signed in as `who` through the real sign-in form, on the device being photographed. */
async function as(who: Who) {
  const key = `${who}${phone ? '-m' : ''}`;
  if (!contexts[key]) {
    const ctx = await browser.newContext(phone ? { viewport: PHONE, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: VIEW, deviceScaleFactor: SCALE });
    await ctx.addInitScript((med: boolean) => {
      localStorage.setItem('crm_sidebar_mode', JSON.stringify('hidden'));
      localStorage.setItem('crm_motion', 'reduced');
      if (med) {
        localStorage.setItem('crm_active_account', 'acct-demo-billing');
        localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: 'acct-demo-billing', name: 'Protected Central', plan: 'agency', status: 'active', price: 0 }]));
      }
    }, who === 'med');
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`${key} ${p.url()}: ${e.message}`));
    const cred = who === 'med' ? OWNER : accounts[who];
    /* Once more if the Worker restarted under the sign-in (it is restarted above). */
    for (let attempt = 1; ; attempt++) {
      try {
        await ready();
        await p.goto(`${B}/login`, { waitUntil: 'networkidle' });
        await p.getByLabel('Email or username').fill(cred.email, { timeout: 15_000 });
        await p.getByLabel('Password', { exact: true }).fill(cred.password);
        await p.getByRole('button', { name: 'Sign in', exact: true }).click();
        await p.waitForTimeout(3000);
        break;
      } catch (e) { if (attempt >= 3) throw e; }
    }
    contexts[key] = ctx;
  }
  page = contexts[key].pages()[0];
}

const hideNoise = async () => {
  /* The trial welcome, notices and the corner help offer: real, but not the picture of the screen. */
  await page.addStyleTag({ content: '.toast-stack,[data-trialbar],.trial-bar,[aria-label="Help"],[data-corner-help],[data-help-fab],.help-fab{display:none!important}' }).catch(() => {});
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' && /your 7-day trial has started/i.test(el.innerText ?? '') && el.innerText.length < 400) el.style.display = 'none';
    }
  });
};
const go = async (route: string, settle = 2200) => {
  await ready();
  await page.goto(`${B}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(settle);
  await hideNoise();
};
let proved = '';
const onScreen = async (where: string, heading: string | RegExp | null, ...texts: (string | RegExp)[]) => {
  const here = new URL(page.url()).pathname;
  if (here !== where) throw new Error(`landed on ${here}, not ${where}`);
  if (heading) {
    await page.getByRole('heading', { name: heading }).locator('visible=true').first().waitFor({ timeout: 12_000 })
      .catch(() => { throw new Error(`${where}: no heading "${heading}" on the screen`); });
  }
  for (const t of texts) {
    await page.getByText(t).locator('visible=true').first().waitFor({ timeout: 12_000 })
      .catch(() => { throw new Error(`${where}: "${t}" is not on the screen`); });
  }
  proved = `${where} ${heading}`;
};
/** Scroll so the text starts just under the app's top bar. */
const under = async (text: string | RegExp, gap = 120) => {
  await page.getByText(text).first().evaluate((el, g) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - g), gap);
  await page.waitForTimeout(700);
};
/* The part of the picture worth reading, for the films' zoom: a selector or a text, measured just before the picture is taken. */
let focusOn: (() => Promise<{ x: number; y: number; width: number; height: number } | null>) | null = null;
const focus = (sel: string | RegExp) => {
  focusOn = async () => {
    const loc = typeof sel === 'string' && /^([[.#]|table\b)/.test(sel) ? page.locator(sel).first() : page.getByText(sel).first();
    return loc.evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top + window.scrollY, width: r.width, height: r.height }; }).catch(() => null);
  };
};
/** A workflow on the business workspace's card, put at the top of the picture. */
const workflow = async (name: string) => {
  await go('/autopilot', 2600);
  await under(name, phone ? 70 : 110);
  focus(name);
};
const jobs = async () => {
  await go('/jobs');
  await page.waitForSelector('[data-testid="ledger"]', { timeout: 15_000 });
  await hideNoise();
};
const rcm = async (tab?: string) => {
  await go('/rcm');
  await page.waitForSelector('[data-testid="rcm"]', { timeout: 15_000 });
  if (tab) { await page.getByTestId(`rcm-tab-${tab}`).click(); await page.waitForTimeout(1200); }
  await hideNoise();
};
const leadNamed = async (name: string) => {
  await jobs();
  const row = page.locator('[data-lead]').filter({ hasText: name }).first();
  await row.locator('> button').click();
  await page.getByTestId('lead-history').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(600);
  await row.evaluate((el, g) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - g), phone ? 70 : 120);
  await page.waitForTimeout(500);
  focus('[data-testid="lead-detail"]');
};

const H = TRADES[0], R = TRADES[1];
/** How to reach each picture. Every file in industryDemos.ts must be here, and every one ends on `onScreen`. */
const RECIPES: Record<string, [Who, () => Promise<void>]> = {
  /* ── HVAC ── */
  'ind-hvac-jobs': ['hvac', async () => { await jobs(); focus('[data-testid="metrics"]'); await onScreen('/jobs', 'Jobs & revenue', 'Growth service agreement', 'Dana Whitfield'); }],
  'ind-hvac-speed': ['hvac', async () => { await workflow('Speed to Lead Response Automation'); await onScreen('/autopilot', 'AI Autopilot', H.project, 'Speed to Lead Response Automation'); }],
  'ind-hvac-pipeline': ['hvac', async () => { await go('/pipelines'); focus('Estimate sent'); await onScreen('/pipelines', 'Deals', 'Estimate sent', 'Heat pump replacement — Marcus Bell'); }],
  'ind-hvac-quote': ['hvac', async () => { await workflow('Quote Follow-up Automation'); await onScreen('/autopilot', 'AI Autopilot', 'Quote Follow-up Automation', 'Anything I can explain?'); }],
  'ind-hvac-calendar': ['hvac', async () => { await go('/calendar'); focus('Heat pump install — day 1'); await onScreen('/calendar', 'Calendar', 'Heat pump install — day 1'); }],
  'ind-hvac-reminder': ['hvac', async () => { await workflow('Appointment Reminder Automation'); await onScreen('/autopilot', 'AI Autopilot', 'Appointment Reminder Automation', 'Text the reminder'); }],
  'ind-hvac-lead': ['hvac', async () => { await leadNamed('Kevin Shaw'); await onScreen('/jobs', 'Jobs & revenue', 'Furnace install'); }],
  'ind-hvac-payments': ['hvac', async () => { await jobs(); await page.getByTestId('tab-payments').click(); await page.waitForTimeout(1000); focus('[data-payment]'); await onScreen('/jobs', 'Jobs & revenue', /Kevin Shaw/); }],
  'ind-hvac-contacts': ['hvac', async () => { await go('/contacts'); focus('table'); await onScreen('/contacts', 'Contacts', 'Priya Natarajan'); }],
  'ind-hvac-winback': ['hvac', async () => { await workflow('Cold Lead Re-activation Automation'); await onScreen('/autopilot', 'AI Autopilot', 'Cold Lead Re-activation Automation'); }],

  /* ── Roofing ── */
  'ind-roof-jobs': ['roofing', async () => { await jobs(); focus('[data-testid="metrics"]'); await onScreen('/jobs', 'Jobs & revenue', 'Growth service agreement', 'Victor Reyes'); }],
  'ind-roof-speed': ['roofing', async () => { await workflow('Speed to Lead Response Automation'); await onScreen('/autopilot', 'AI Autopilot', R.project, 'Speed to Lead Response Automation'); }],
  'ind-roof-calendar': ['roofing', async () => { await go('/calendar'); focus('Adjuster meeting on site'); await onScreen('/calendar', 'Calendar', 'Adjuster meeting on site'); }],
  'ind-roof-reminder': ['roofing', async () => { await workflow('Appointment Reminder Automation'); await onScreen('/autopilot', 'AI Autopilot', 'Appointment Reminder Automation', 'Text the reminder'); }],
  'ind-roof-pipeline': ['roofing', async () => { await go('/pipelines'); focus('Insurance claim'); await onScreen('/pipelines', 'Deals', 'Insurance claim', 'Hail claim — full replacement — Victor Reyes'); }],
  'ind-roof-quote': ['roofing', async () => { await workflow('Quote Follow-up Automation'); await onScreen('/autopilot', 'AI Autopilot', 'Quote Follow-up Automation'); }],
  'ind-roof-lead': ['roofing', async () => { await leadNamed('Paul Sanders'); await onScreen('/jobs', 'Jobs & revenue', 'Insurance re-roof'); }],
  'ind-roof-payments': ['roofing', async () => { await jobs(); await page.getByTestId('tab-payments').click(); await page.waitForTimeout(1000); focus('[data-payment]'); await onScreen('/jobs', 'Jobs & revenue', /Paul Sanders/); }],
  'ind-roof-reviews': ['roofing', async () => { await workflow('Client Review Request Automation'); await onScreen('/autopilot', 'AI Autopilot', 'Client Review Request Automation', 'Unhappy Customer Recovery Automation'); }],

  /* ── Medical billing, the synthetic practice ── */
  'ind-med-claims': ['med', async () => { await rcm(); focus('[data-claim]'); await onScreen('/rcm', 'Medical billing', 'Synthetic test data only — do not enter real patient information.', /Clearinghouse: Rejected/); }],
  'ind-med-claim': ['med', async () => {
    await rcm();
    const row = page.locator(`[data-claim="${claimNo['SYN-1008']}"]`);
    await row.locator('> button').click();
    await page.getByTestId('claim-detail').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(600);
    await row.evaluate((el, g) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - g), phone ? 70 : 120);
    focus('[data-testid="claim-detail"]');
    await onScreen('/rcm', 'Medical billing', /Clearinghouse: Rejected/);
  }],
  'ind-med-review': ['med', async () => { await rcm('review'); focus('[data-review]'); await onScreen('/rcm', 'Medical billing', /Synthetic test data only/); await page.locator('[data-review]').first().waitFor(); }],
  'ind-med-denials': ['med', async () => { await rcm('denials'); focus('[data-denial]'); await onScreen('/rcm', 'Medical billing', 'Medical necessity', 'Draft an appeal'); }],
  'ind-med-remits': ['med', async () => {
    await rcm('remits');
    await page.locator('[data-remit] > button').first().click();
    await page.getByTestId('remit-detail').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(800);
    focus('[data-testid="remit-detail"]');
    await onScreen('/rcm', 'Medical billing', 'synthetic-remittance-1.csv');
  }],
  'ind-med-aging': ['med', async () => { await rcm('aging'); focus('[data-testid="aging"]'); await onScreen('/rcm', 'Medical billing', 'What payers still owe, by age', 'Over 120'); }],
  'ind-med-auths': ['med', async () => { await rcm('auths'); focus('An authorization is needed'); await onScreen('/rcm', 'Medical billing', /Needed by/); }],
  'ind-med-leakage': ['med', async () => { await rcm('leakage'); focus('[data-testid="leakage"]'); await onScreen('/rcm', 'Medical billing', 'Where money is leaking', 'Rejection not corrected'); }],
  'ind-med-messages': ['med', async () => { await rcm('messages'); focus(/supports medical necessity/); await onScreen('/rcm', 'Medical billing', /supports medical necessity/); }],
  'ind-med-audit': ['med', async () => { await rcm('audit'); await page.waitForSelector('[data-testid="audit"] tbody tr', { timeout: 10_000 }).catch(() => {}); focus('[data-testid="audit"]'); await onScreen('/rcm', 'Medical billing', /Synthetic test data only/); }],
};
const missing = DEMO_FILES.filter(f => !RECIPES[f]);
if (missing.length) { console.log(`No recipe for: ${missing.join(', ')}`); stop(); process.exit(1); }

/* ── Photographing: the page from where the recipe left it, as site-reels.mts does ── */

const MAX_H = { desk: 3000, phone: 2160 };
const crops: Record<string, { h: number }> = {};
const focusRects: Record<string, { x: number; y: number; width: number; height: number; pageW: number; pageH: number }> =
  fs.existsSync(FOCUS) ? JSON.parse(fs.readFileSync(FOCUS, 'utf8')) : {};
const taken: string[] = [];
async function photograph(suffix: string) {
  for (const file of DEMO_FILES) {
    if (only.length && !only.includes(file)) continue;
    const [who, recipe] = RECIPES[file];
    try {
      await as(who);
      proved = ''; focusOn = null;
      await recipe();
      if (!proved) throw new Error('the recipe never checked which screen it reached');
    } catch (e) {
      console.log(`FAILED  ${file}${suffix}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      process.exitCode = 1;
      continue;
    }
    if (await page.evaluate(() => /ran into a problem|something went wrong/i.test(document.body.innerText))) {
      console.log(`REFUSED ${file}${suffix} — the screen is showing an error`); process.exitCode = 1; continue;
    }
    await hideNoise();
    /* Panes that scroll on their own are let out, so the picture is the whole page. */
    const at = await page.evaluate(() => {
      for (const el of document.querySelectorAll<HTMLElement>('body *')) {
        const cs = getComputedStyle(el);
        if (!/(auto|scroll)/.test(cs.overflowY) || el.clientHeight < 280 || el.scrollHeight <= el.clientHeight + 40) continue;
        el.style.maxHeight = 'none'; el.style.height = 'auto'; el.style.overflowY = 'visible';
      }
      return { y: Math.round(window.scrollY) };
    });
    await page.waitForTimeout(400);
    /* On a phone the app's top bar is the same on every screen: the picture starts under it. */
    const navEnd = suffix ? await page.evaluate(() => {
      for (const el of document.querySelectorAll<HTMLElement>('body *')) if (getComputedStyle(el).position === 'sticky') el.style.position = 'static';
      const bar = document.querySelector<HTMLElement>('header.app-header');
      if (!bar) return 0;
      bar.style.position = 'static';
      return Math.round(bar.getBoundingClientRect().bottom + window.scrollY);
    }) : 0;
    if (navEnd > at.y) at.y = navEnd;
    const docH = await page.evaluate(() => document.documentElement.scrollHeight);
    const h = Math.max(1, Math.min(suffix ? MAX_H.phone : MAX_H.desk, docH - at.y));
    const width = page.viewportSize()!.width;
    if (!suffix && focusOn) {
      const r = await focusOn();
      if (r) focusRects[file] = { x: Math.round(r.x), y: Math.round(r.y - at.y), width: Math.round(r.width), height: Math.round(r.height), pageW: width, pageH: h };
    }
    crops[`${file}${suffix}`] = { h };
    await page.screenshot({ path: `${RAW}/${file}${suffix}.png`, fullPage: true, clip: { x: 0, y: at.y, width, height: h } });
    taken.push(`${file}${suffix}`);
    console.log(`took    ${file}${suffix}`);
  }
}
if (!process.env.PHONE_ONLY) await photograph('');
if (!process.env.DESKTOP_ONLY) { phone = true; await photograph('-m'); }
fs.mkdirSync(path.dirname(FOCUS), { recursive: true });
fs.writeFileSync(FOCUS, `${JSON.stringify(focusRects, null, 1)}\n`);

/* PNG → WebP in Chromium, at the sizes ShotReel asks for. */
const conv = await (await browser.newContext()).newPage();
await conv.goto('about:blank');
const encode = async (raw: string, wide: number, quality: number, hCss: number, scale: number) => {
  const b64 = fs.readFileSync(raw).toString('base64');
  return conv.evaluate(async ([src, w, qq, h, k]: [string, number, number, number, number]) => {
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = `data:image/png;base64,${src}`; });
    const sh = Math.min(img.naturalHeight, Math.round(h * k));
    const c = document.createElement('canvas');
    c.width = Math.min(w, img.naturalWidth);
    c.height = Math.round(sh * (c.width / img.naturalWidth));
    const g = c.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, img.naturalWidth, sh, 0, 0, c.width, c.height);
    return c.toDataURL('image/webp', qq).split(',')[1];
  }, [b64, wide, quality, hCss, scale] as [string, number, number, number, number]);
};
const write = (name: string, data: string) => {
  fs.writeFileSync(`${OUT}/${name}.webp`, Buffer.from(data, 'base64'));
  console.log(`wrote   ${name}.webp  ${(fs.statSync(`${OUT}/${name}.webp`).size / 1024).toFixed(0)}kB`);
};
for (const name of taken) {
  const raw = `${RAW}/${name}.png`;
  if (name.endsWith('-m')) { write(name, await encode(raw, 1000, 0.78, crops[name].h, 3)); continue; }
  write(name, await encode(raw, 2000, 0.8, crops[name].h, SCALE));
  write(`${name}-sm`, await encode(raw, 1200, 0.8, crops[name].h, SCALE));
}
console.log(errs.length ? `PAGE ERRORS:\n  ${errs.join('\n  ')}` : 'no page errors');
await browser.close();
stop();
process.exit(process.exitCode ?? 0);
