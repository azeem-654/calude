/**
 * Photographs every screen the marketing site shows, from the real app.
 *
 *   VITE_BASE=/ npm run build
 *   npx tsx scripts/site-reels.mts            # every picture
 *   npx tsx scripts/site-reels.mts hero-flow  # just the ones named
 *
 * Self-contained: it starts its own `wrangler dev` (port 8797) over a fresh
 * database in `.wrangler-reels`, and its own business directory (port 8857 —
 * Geoapify's two endpoints and DNS-over-HTTPS, serving the invented businesses
 * of `demo-world.mjs`), so AI Prospecting is photographed *running a search*
 * and not drawn.
 *
 * ── Why against the Worker, not Vite ──
 *
 * The parts that matter most (AI Autopilot's projects, workflows, the daily
 * prospect finder, forms, tickets) live on the server. A picture of Autopilot
 * from a workspace with no server is a picture of an empty state. So this signs
 * a real account up, writes the sample business (`site-seed.mjs`) into its
 * server-side workspace, creates real clients, projects, workflows and a
 * finder through the real API, and then photographs the running app.
 *
 * ── Every picture is the whole window ──
 *
 * The owner found the hero's pictures were "half a screen": close crops of one
 * diagram, a panel cut off at its edge, a project board with one project and a
 * four-step workflow. So every picture is now the whole app window — the nav,
 * the page, the panel — at 1600×1000, against a workspace that looks like a
 * business that has been running a while: five clients in different trades,
 * projects with branching workflows that tag, assign, text, email and create
 * tasks, thirty days of prospects found, a pipeline across six stages.
 *
 * ── What it refuses ──
 *
 * A shot in `src/components/Site/reels.ts` with no recipe here stops the run
 * before anything is taken, and a screen showing the error boundary is refused
 * rather than written — a marketing page with an error on it is worse than one
 * with a gap.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { execSync, spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { REEL_FILES } from '../src/components/Site/reels.ts';
import { TEMPLATES } from '../src/components/Autopilot/workflowTemplates.ts';
import { designFromPost } from '../worker/src/lib/projectAgents.ts';
// @ts-expect-error — plain .mjs modules shared with the older capture scripts.
import { workspaceSeed } from './site-seed.mjs';
// @ts-expect-error — as above.
import { INDUSTRIES, TOWNS, businessesIn, countFor, townFor } from './demo-world.mjs';

const PORT = 8797, MOCK = 8857, INSPECT = 9397;
const B = `http://127.0.0.1:${PORT}`;
const G = `http://127.0.0.1:${MOCK}`;
const OUT = 'public/site/reel';
const RAW = '/tmp/site-reel-raw';
/* The whole window, wide enough that a five-column workflow fits the project
   card without scrolling sideways; written out at 1600 wide, which stays sharp
   where the hero draws it largest. */
const VIEW = { width: 1920, height: 1200 };
/* Each shot three ways: the desktop window at 1.5× (2400 wide, for a big
   screen and for the zoom into its focus), the same at 1200 for a smaller
   one, and the app's own phone layout at 390×720, 3×, for a phone — where no
   zoom can make a whole desktop window readable (ShotReel). */
const SCALE = 1.5;
const PHONE = { width: 390, height: 720 };
const GEOKEY = 'reel'.repeat(8);
const HKEY = 'cd'.repeat(20);

if (!fs.existsSync('dist/index.html')) { console.log('Build first: VITE_BASE=/ npm run build'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(RAW, { recursive: true, force: true });
fs.mkdirSync(RAW, { recursive: true });

/* ── The directory ───────────────────────────────────────────────────────── */

type Ind = { key: string; trade: string; label: string; cat: string };
type Town = { name: string; short: string; lat: number; lon: number };
const send = (res: http.ServerResponse, status: number, body: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const mock = http.createServer((req, res) => {
  const u = new URL(req.url ?? '/', G);
  if (u.pathname === '/dns-query') {
    const name = (u.searchParams.get('name') ?? '').replace(/\.$/, '');
    /* Most domains take mail; one in nine has no mail server, so the checks
       have something to say no to — as they would on a real list. */
    const bad = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 9 === 0;
    if (u.searchParams.get('type') === 'MX' && !bad) return send(res, 200, { Status: 0, Answer: [{ type: 15, data: `10 mx.${name}.` }] });
    return send(res, 200, { Status: 0, Answer: [] });
  }
  /* The owner's mailbox verifier (Hunter's three endpoints): most published
     addresses are deliverable, a few are catch-alls, one in twenty bounces —
     and a named person is found on some sites, with the page they were on. */
  if (['/v2/account', '/v2/email-verifier', '/v2/domain-search'].includes(u.pathname)) {
    if (u.searchParams.get('api_key') !== HKEY) return send(res, 401, { errors: [{ id: 'authentication_failed' }] });
    if (u.pathname === '/v2/account') return send(res, 200, { data: { requests: { searches: { used: 0, available: 500 }, verifications: { used: 0, available: 1000 } } } });
    const subject = u.searchParams.get('email') ?? u.searchParams.get('domain') ?? '';
    const k = [...subject].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    if (u.pathname === '/v2/email-verifier') {
      if (k % 20 === 3) return send(res, 200, { data: { status: 'invalid', result: 'undeliverable' } });
      if (k % 6 === 1) return send(res, 200, { data: { status: 'accept_all', result: 'risky', accept_all: true } });
      return send(res, 200, { data: { status: 'valid', result: 'deliverable' } });
    }
    const PEOPLE = [['Dana', 'Whitlock', 'Broker / Owner'], ['Marcus', 'Hale', 'Managing Broker'], ['Priya', 'Raman', 'Practice Manager'], ['Elena', 'Cruz', 'Office Manager'], ['James', 'Okoro', 'Managing Partner'], ['Sofia', 'Lind', 'Director']];
    const [f, l, role] = PEOPLE[k % PEOPLE.length];
    return send(res, 200, { data: { emails: k % 3 === 0 ? [] : [
      { value: `${f.toLowerCase()}@${subject}`, type: 'personal', confidence: 90, sources: [{ uri: `https://${subject}/team` }], first_name: f, last_name: l, position: role },
    ] } });
  }
  if (u.searchParams.get('apiKey') !== GEOKEY) return send(res, 401, { message: 'Invalid apiKey' });
  if (u.pathname === '/v1/geocode/search') {
    const t = townFor(u.searchParams.get('text') ?? '') as Town | null;
    if (!t) return send(res, 200, { results: [{ place_id: 'p-london', lon: -0.12, lat: 51.5, result_type: 'city' }] });
    return send(res, 200, { results: [{ place_id: `p-${t.short}`, lon: t.lon, lat: t.lat, result_type: 'city' }] });
  }
  if (u.pathname === '/v2/places') {
    const cats = u.searchParams.get('categories') ?? '';
    const filter = (u.searchParams.get('filter') ?? '').replace(/^place:p-/, '');
    const offset = Number(u.searchParams.get('offset') ?? 0), limit = Number(u.searchParams.get('limit') ?? 60);
    const ind = (INDUSTRIES as Ind[]).find(i => cats.split(',').includes(i.cat.split(',')[0]));
    const town = (TOWNS as Town[]).find(t => t.short === filter);
    if (!ind || !town) return send(res, 200, { features: [] });
    const all = businessesIn(ind, town, countFor(ind, town)) as { name: string; address: string; phone: string; website: string; email: string; lat: number; lon: number; category: string }[];
    return send(res, 200, {
      features: all.slice(offset, offset + limit).map((b, n) => ({
        type: 'Feature',
        properties: {
          place_id: `geo-${ind.key}-${town.short}-${offset + n}`, name: b.name, formatted: `${b.name}, ${b.address}`,
          categories: [b.category.split('.')[0], b.category], lat: b.lat, lon: b.lon,
          website: b.website || undefined, contact: { phone: b.phone, email: b.email || undefined },
          datasource: { sourcename: 'openstreetmap', raw: {} },
        },
      })),
    });
  }
  send(res, 404, { message: 'no such path in the mock' });
});
await new Promise<void>(r => mock.listen(MOCK, '127.0.0.1', () => r()));

/* ── A fresh database and the real Worker ─────────────────────────────────── */

const persist = path.resolve('.wrangler-reels');
fs.rmSync(persist, { recursive: true, force: true });
execSync(`npx wrangler d1 migrations apply crmpro --local --persist-to ${persist}`, { stdio: 'ignore', env: { ...process.env, CI: '1' } });
const vars = [`APP_ORIGIN:${B}`, `GEOAPIFY_BASE:${G}`, `DOH_BASE:${G}/dns-query`, `EMAIL_VERIFIER_BASE:${G}`];
const wr = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--inspector-port', String(INSPECT), '--persist-to', persist, ...vars.flatMap(v => ['--var', v])], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
let wlog = '';
wr.stdout!.on('data', c => { wlog += c; }); wr.stderr!.on('data', c => { wlog += c; });
const stop = () => { try { process.kill(-wr.pid!, 'SIGTERM'); } catch { /* gone */ } mock.close(); };
process.on('exit', stop);
process.on('uncaughtException', e => { console.log(e); console.log(wlog.slice(-2000)); stop(); process.exit(1); });
for (let i = 0; i < 90; i++) {
  try { const r = await fetch(`${B}/api/data.php`, { method: 'POST', headers: { Connection: 'close' }, body: '{"action":"ping"}' }); if (r.ok) break; } catch { /* starting */ }
  await new Promise(r => setTimeout(r, 1000));
}

/* Retried on a dropped connection only; a real error answer is returned as it is. */
async function post(p: string, body: Record<string, unknown>): Promise<Record<string, any>> {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(`${B}${p}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', 'CF-Connecting-IP': `10.7.0.${attempt}` }, body: JSON.stringify(body),
      });
      return await r.json() as Record<string, any>;
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise(r => setTimeout(r, 2500 * attempt));
    }
  }
}

/* Long statements go through a file: a command line has a length limit, and
   thirty days of found prospects is longer than that. */
const d1 = (sql: string) => {
  const f = `${RAW}/q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.sql`;
  fs.writeFileSync(f, sql);
  try {
    execSync(`npx wrangler d1 execute crmpro --local --persist-to ${persist} --file ${f}`, { stdio: 'pipe' });
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(`D1 refused: ${sql.slice(0, 160)}\n${String(err.stdout ?? '')}${String(err.stderr ?? '')}`.slice(0, 1400));
  }
};
const q = (s: string) => `'${String(s).replace(/'/g, "''")}'`;

/* ── The install owner, and the directory on their key ─────────────────────── */

await post('/api/auth.php', { action: 'bootstrap', email: 'owner@reels.test', password: 'Tq9!vX2#pLm7wZ-rl', name: 'Owner' });
const owner = await post('/api/auth.php', { action: 'login', email: 'owner@reels.test', password: 'Tq9!vX2#pLm7wZ-rl' });
const geo = await post('/api/geoapify.php', { token: owner.token, action: 'save', apiKey: GEOKEY });
if (!geo.success) throw new Error(`the directory key was refused: ${JSON.stringify(geo)}`);
const hv = await post('/api/email-verifier.php', { token: owner.token, action: 'save', provider: 'hunter', apiKey: HKEY });
if (!hv.success) throw new Error(`the verifier key was refused: ${JSON.stringify(hv)}`);

/* ── The account ─────────────────────────────────────────────────────────── */

const signup = await post('/api/auth.php', {
  action: 'register', email: `alex.${Date.now().toString(36)}@riverastudio.test`,
  password: 'Studio-capture-2026!', name: 'Alex Rivera', businessName: 'Rivera Studio',
});
if (!signup.success) throw new Error(`could not sign up: ${JSON.stringify(signup)}`);
const TOK: string = signup.token;
const ACCT: string = signup.user.accountId;
const as = (p: string, body: Record<string, unknown>) => post(p, { token: TOK, accountId: ACCT, ...body });

/* ── The business, written where the app reads it ─────────────────────────── */

const seed = workspaceSeed();
const w = seed.data;
const now = new Date().toISOString();
const ago = (days: number, hours = 0) => new Date(Date.now() - days * 86_400_000 - hours * 3_600_000).toISOString();

/* Social posts with real canvases, composed exactly as the agent composes them. */
const POSTS = [
  { platform: 'instagram', headline: 'Winter is when boilers give up', body: 'Book the service now.', hashtags: ['#heating'], co: 'Northside Plumbing', color: '#6d3bf5' },
  { platform: 'linkedin', headline: 'Three homes listed this week in Richmond', body: 'Tours open Saturday.', hashtags: ['#realestate'], co: 'Brightline Realty', color: '#0f766e' },
  { platform: 'instagram', headline: 'New patients: first check-up on us', body: 'Book online in a minute.', hashtags: ['#dentist'], co: 'Parkway Dental', color: '#0369a1' },
  { platform: 'instagram', headline: 'January memberships, half price', body: 'Ten days only.', hashtags: ['#fitness'], co: 'Legacy Fitness', color: '#b45309' },
  { platform: 'linkedin', headline: 'What the new tenancy rules mean for landlords', body: 'A two-minute read.', hashtags: ['#law'], co: 'Harbour Law', color: '#7c3aed' },
  { platform: 'facebook', headline: 'Catering for 20 to 200 — booking spring now', body: 'Menus inside.', hashtags: ['#catering'], co: 'Vine Street Kitchen', color: '#be123c' },
];
const posts = POSTS.map((p, i) => designFromPost(p, {
  id: `sp-reel-${i}`, brandColor: p.color, company: p.co,
  source: { origin: 'autopilot', title: 'AI Autopilot', route: '/autopilot', at: now }, now,
}));

/* The lists AI Prospecting has saved, and the searches it remembers — across
   trades and towns, so the side panel reads like an agency working several
   markets rather than one search. */
const LISTS = [
  { id: 'list-va-realtors', name: 'Virginia realtors — daily', count: 412, color: '#0f766e' },
  { id: 'list-leeds-dentists', name: 'Leeds & Manchester dentists', count: 186, color: '#0369a1' },
  { id: 'list-austin-food', name: 'Austin restaurants & cafés', count: 141, color: '#be123c' },
  { id: 'list-denver-law', name: 'Denver & Phoenix law firms', count: 96, color: '#7c3aed' },
  { id: 'list-gyms', name: 'Gyms & studios, US', count: 233, color: '#b45309' },
  { id: 'list-trades', name: 'Electricians & auto repair, UK', count: 158, color: '#334155' },
];
const contactLists = LISTS.map((l, i) => ({
  id: l.id, name: l.name, type: 'static', rules: [], match: 'all',
  memberIds: w.contacts.filter((_: unknown, n: number) => n % LISTS.length === i).map((c: { id: string }) => c.id),
  color: l.color, createdAt: ago(20 - i * 2), createdBy: 'Alex Rivera', kind: 'cold', origin: 'prospecting',
}));
const SEARCHES = [
  ['real estate agents', 'Richmond, Virginia', 48, true], ['dentists', 'Leeds', 52, true], ['law firms', 'Denver, Colorado', 41, false],
  ['gyms', 'Austin, Texas', 57, false], ['restaurants', 'Miami, Florida', 59, false], ['accountants', 'Manchester', 44, false],
  ['hair salons', 'Bristol', 38, false], ['auto repair shops', 'Phoenix, Arizona', 46, false], ['insurance agencies', 'Norfolk, Virginia', 35, false],
  ['veterinarians', 'Plano, Texas', 39, false], ['wedding venues', 'Virginia Beach, Virginia', 36, false],
].map(([trade, place, count, saved], i) => ({ source: 'free', trade, place, count, saved, at: ago(0, i * 5 + 1) }));

/* The addresses the daily finder's thirty days hold (below), so their checks can be seeded with the rest. */
const FINDER_EMAILS: string[] = (INDUSTRIES as Ind[]).filter(i => ['realtor', 'property', 'mortgage'].includes(i.key))
  .flatMap(ind => ['Richmond, Virginia', 'Virginia Beach, Virginia', 'Norfolk, Virginia']
    .flatMap(t => (businessesIn(ind, (TOWNS as Town[]).find(x => x.name === t)!, 60) as { email: string }[]).map(b => b.email).filter(Boolean)));

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
  crm_contact_lists: JSON.stringify(contactLists),
  crm_prospect_searches: JSON.stringify(SEARCHES),
  /* The workspace's own address checks, as its Contacts screen keeps them —
     most deliverable, some catch-alls, a few that bounce, the way a checked
     list really comes back. Without them every `.example` address is judged
     in the browser alone, where a reserved domain is rightly "risky". */
  crm_email_health: JSON.stringify(Object.fromEntries(
    [...w.contacts.map((c: { email: string }) => c.email), ...FINDER_EMAILS].map((e: string, i: number) => [e.toLowerCase(), {
      verdict: i % 17 === 5 ? 'invalid' : i % 7 === 3 ? 'risky' : 'valid', score: i % 17 === 5 ? 5 : i % 7 === 3 ? 55 : 92,
      reason: i % 17 === 5 ? 'The mail server refused it' : i % 7 === 3 ? 'Accepts everything (catch-all)' : 'Mailbox confirmed', at: ago(i % 9),
    }]),
  )),
  crm_setup_hidden: '1',
  /* A configured workspace: a banner saying "email provider not set up yet"
     across a photograph of the campaigns screen is the wrong picture of a
     product that sends mail. The password is placeholder dots. */
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
      description: 'Growth, sites and booking for clinics, firms, trades and shops across the US and UK',
      audience: 'Owner-run clinics, law firms, realtors, gyms and trades doing $1m–$10m a year',
      brandVoice: 'Friendly & approachable', brandColor: '#6d3bf5',
      website: 'riverastudio.com', email: 'alex@riverastudio.com', phone: '(972) 555-0100',
    },
    goals: {}, channels: ['email', 'sms', 'blog'], plan: [], audit: [],
  }),
};
const bulk = await as('/api/data.php', { action: 'bulk_set', items });
if (!bulk.success) throw new Error(`could not write the workspace: ${JSON.stringify(bulk).slice(0, 300)}`);

/* ── Clients, projects and their workflows, through the real API ──────────── */

type Node = { id: string; type: string; label: string; config: Record<string, unknown>; nextId: string | null; yesId?: string | null; noId?: string | null };
const n = (id: string, type: string, label: string, config: Record<string, unknown>, nextId: string | null, br: { yesId?: string | null; noId?: string | null } = {}): Node =>
  ({ id, type, label, config, nextId, ...br });

/*
 * The workflows a busy business would actually run — each one a shape the
 * engine runs today (automationEngine.ts), and each drawn in five columns so
 * the whole of it fits the card: a spine that does the work for the people
 * who qualify, and a row under each question for the people who do not.
 */
const FLOWS: Record<string, { name: string; description: string; nodes: Node[] }> = {
  qualify: {
    name: 'New enquiry — qualify, route and book',
    description: 'Big jobs go to a senior with a task and a text; the rest get the price list or the calendar',
    nodes: [
      n('n0', 'trigger', 'A form is submitted', { event: 'form_submitted', formName: 'Get a quote' }, 'n1'),
      n('n1', 'condition', 'A job over $5k?', { field: 'tag', operator: 'equals', value: 'big job' }, 'n2', { yesId: 'n2', noId: 'n5' }),
      n('n2', 'assign_to', 'Give it to a senior', { user: 'Maya' }, 'n3'),
      n('n3', 'create_task', 'Ring within the hour', { title: 'Big enquiry — ring within the hour' }, 'n4'),
      n('n4', 'send_sms', 'Text: calling you shortly', { message: 'Hi {{firstName}}, thanks — Maya from {{myCompany}} will ring you within the hour.' }, null),
      n('n5', 'condition', 'Asked for prices?', { field: 'tag', operator: 'equals', value: 'pricing' }, 'n6', { yesId: 'n6', noId: 'n8' }),
      n('n6', 'send_email', 'Send the price list', { subject: 'Our prices, {{firstName}}', body: 'Hello {{firstName}},\n\nHere are our prices, plainly.' }, 'n7'),
      n('n7', 'add_tag', 'Tag: priced', { tag: 'priced' }, null),
      n('n8', 'send_email', 'Here is my calendar', { subject: 'Pick a time, {{firstName}}', body: 'Hello {{firstName}},\n\nPick any time that suits: {{bookingLink}}' }, 'n9'),
      n('n9', 'add_tag', 'Tag: nurture', { tag: 'nurture' }, null),
    ],
  },
  missed: {
    name: 'Missed call — text back and book',
    description: 'Patients get a callback task; new callers get a welcome, the booking link and one reminder',
    nodes: [
      n('n0', 'trigger', 'A tag is added', { event: 'tag_added', tag: 'missed call' }, 'n1'),
      n('n1', 'condition', 'Already a patient?', { field: 'status', operator: 'equals', value: 'customer' }, 'n2', { yesId: 'n2', noId: 'n5' }),
      n('n2', 'send_sms', 'Sorry we missed you', { message: 'Sorry we missed you, {{firstName}} — we will ring you back today.' }, 'n3'),
      n('n3', 'create_task', 'Call them back today', { title: 'Missed call from a patient — call back' }, 'n4'),
      n('n4', 'add_tag', 'Tag: callback', { tag: 'callback' }, null),
      n('n5', 'send_email', 'New-patient welcome', { subject: 'Welcome, {{firstName}}', body: 'Hello {{firstName}},\n\nYour first check-up is on us: {{bookingLink}}' }, 'n6'),
      n('n6', 'condition', 'Booked yet?', { field: 'tag', operator: 'equals', value: 'booked' }, 'n7', { yesId: 'n7', noId: 'n8' }),
      n('n7', 'update_field', 'Stage: booked', { field: 'status', value: 'customer' }, null),
      n('n8', 'send_sms', 'One reminder', { message: 'Still want that first check-up, {{firstName}}? {{bookingLink}}' }, null),
    ],
  },
  outreach: {
    name: 'Prospect outreach — email, follow up, hand over',
    description: 'A reply becomes a demo and a deal; opt-ins get texts; everyone else one more email',
    nodes: [
      n('n0', 'trigger', 'A tag is added', { event: 'tag_added', tag: 'autopilot' }, 'n1'),
      n('n1', 'send_email', 'Open with a listing tip', { subject: 'More listings this spring, {{firstName}}?', body: 'Hello {{firstName}},\n\nOne idea for {{company}}.\n\nP.S. Would a text be easier? Say yes here and we will text you instead: {{smsOptInLink}}' }, 'n2'),
      n('n2', 'condition', 'Replied in 3 days?', { field: 'status', operator: 'equals', value: 'replied' }, 'n3', { yesId: 'n3', noId: 'n5' }),
      n('n3', 'create_task', 'Book the demo', { title: 'Replied — book the demo' }, 'n4'),
      n('n4', 'update_field', 'Stage: qualified', { field: 'status', value: 'lead' }, null),
      n('n5', 'condition', 'Said yes to texts?', { field: 'tag', operator: 'equals', value: 'sms opt-in' }, 'n6', { yesId: 'n6', noId: 'n7' }),
      n('n6', 'send_sms', 'Text the offer', { message: 'Hi {{firstName}} — here is the offer we mentioned.' }, null),
      n('n7', 'send_email', 'Follow up with proof', { subject: 'How Keystone did it, {{firstName}}', body: 'Hello {{firstName}},\n\nA short example.' }, null),
    ],
  },
  reviews: {
    name: 'After the visit — reviews, rescue, referrals',
    description: 'Happy customers are asked for a review and a referral; unhappy ones reach the owner first',
    nodes: [
      n('n0', 'trigger', 'A deal moves to Won', { event: 'deal_stage_changed', stage: 'won' }, 'n1'),
      n('n1', 'send_email', 'How did we do?', { subject: 'How did we do, {{firstName}}?', body: 'Hello {{firstName}},\n\nOne click: how was it?' }, 'n2'),
      n('n2', 'condition', 'Happy (4–5 stars)?', { field: 'tag', operator: 'equals', value: 'happy' }, 'n3', { yesId: 'n3', noId: 'n5' }),
      n('n3', 'send_email', 'Ask for a Google review', { subject: 'Would you say so on Google?', body: 'Hello {{firstName}},\n\nIt would mean a lot.' }, 'n4'),
      n('n4', 'send_sms', 'Referral offer by text', { message: 'Thanks {{firstName}}! Refer a friend and you both get 20% off.' }, null),
      n('n5', 'assign_to', 'Straight to the owner', { user: 'You' }, 'n6'),
      n('n6', 'create_task', 'Call and put it right', { title: 'Unhappy customer — call today' }, null),
    ],
  },
};

/* The clients, each a different trade, so the board reads like an agency. */
const CLIENTS = [
  { name: 'Brightline Realty', desc: 'Residential real estate across Richmond, Norfolk and Virginia Beach.', project: 'Brightline Realty — Virginia listings', objective: 'Win listing appointments from agents and homeowners across Virginia, found every day', kind: 'leadgen', flows: ['outreach', 'qualify', 'reviews'], templates: ['daily-posts'] },
  { name: 'Parkway Dental', desc: 'Family and cosmetic dentistry in Leeds and Manchester.', project: 'Parkway Dental — new patients', objective: 'Fill 40 new-patient check-ups a month and win back lapsed patients', kind: 'leadgen', flows: ['missed', 'reviews'], templates: ['appointment-reminders', 'daily-posts'] },
  { name: 'Harbour Law', desc: 'Property and family law, Denver and Phoenix.', project: 'Harbour Law — consultations', objective: 'Book 25 paid consultations a month from enquiries and referrals', kind: 'consultancy', flows: ['qualify', 'reviews'], templates: ['seo-blog-pipeline'] },
  { name: 'Legacy Fitness', desc: 'Strength and conditioning gyms in Austin and Denver.', project: 'Legacy Fitness — January memberships', objective: 'Sell 300 memberships in January and keep them past March', kind: 'ecommerce', flows: ['missed'], templates: ['multi-platform-social', 'dormant-winback'] },
  { name: 'Vine Street Kitchen', desc: 'Restaurant and catering in Austin.', project: 'Vine Street Kitchen — catering season', objective: 'Book 60 catering events this spring and fill weeknight tables', kind: 'general', flows: ['reviews'], templates: ['daily-posts', 'birthday-anniversary'] },
];

const projects: { id: string; name: string; wf: string[] }[] = [];
for (const [ci, c] of CLIENTS.entries()) {
  const pf = await as('/api/projects.php', { action: 'save_portfolio', name: c.name, profile: { description: c.desc, website: `${c.name.toLowerCase().replace(/[^a-z]+/g, '')}.example` } });
  const pr = await as('/api/projects.php', {
    action: 'save_project', portfolioId: pf.id, name: c.project, objective: c.objective, kind: c.kind,
    guardrails: { sendEmail: 'approval', sendSms: 'approval', createWorkflows: 'on', activateWorkflows: 'approval' },
    launchSteps: [{ label: 'Get email sending' }, { label: 'Answer every enquiry fast' }, { label: 'Post every morning' }, { label: 'Ask for reviews' }],
  });
  if (!pr.success) throw new Error(`could not make "${c.project}": ${JSON.stringify(pr).slice(0, 300)}`);
  const wf: string[] = [];
  for (const key of c.flows) {
    const f = FLOWS[key];
    const r = await as('/api/autopilot.php', { action: 'save_workflow', projectId: pr.id, record: { name: f.name, description: f.description, nodes: f.nodes, status: 'active' } });
    if (!r.success) throw new Error(`could not save "${f.name}": ${JSON.stringify(r).slice(0, 200)}`);
    wf.push(r.id);
  }
  for (const k of c.templates) {
    const t = TEMPLATES.find(x => x.key === k);
    if (!t) continue;
    const r = await as('/api/autopilot.php', { action: 'save_workflow', projectId: pr.id, record: { name: t.name, description: t.description, nodes: t.nodes, status: 'active', key: k }, templateKey: k });
    if (r.success) wf.push(r.id);
  }
  projects.push({ id: pr.id, name: c.project, wf });
  d1(`UPDATE crm_projects SET last_planned_at = ${q(ago(0, ci + 1))}, status = 'running', created_at = ${q(ago(40 - ci * 6))} WHERE id = ${q(pr.id)};`);
}
const REALTY = projects[0];

/* ── Thirty days of Brightline's daily prospect finder ─────────────────────── */

const vaTowns = ['Richmond, Virginia', 'Virginia Beach, Virginia', 'Norfolk, Virginia'];
const fs1 = await as('/api/finders.php', {
  action: 'save', projectId: REALTY.id, trades: ['real estate agents', 'property managers', 'mortgage brokers'],
  places: vaTowns, perDay: 20, source: 'free', listId: 'list-va-realtors', listName: 'Virginia realtors — daily',
});
if (!fs1.success) throw new Error(`could not start the finder: ${JSON.stringify(fs1).slice(0, 300)}`);
const FID = String(fs1.finderId ?? '');
const finderId = FID || ((): string => { throw new Error(`no finder id in ${JSON.stringify(fs1).slice(0, 200)}`); })();

{
  const rows: string[] = [];
  const runs: string[] = [];
  let seq = 0;
  const realtors = (INDUSTRIES as Ind[]).filter(i => ['realtor', 'property', 'mortgage'].includes(i.key));
  for (let d = 29; d >= 0; d--) {
    /* Twenty most days; fewer at the weekend, when the directories have less new. */
    const date = new Date(Date.now() - d * 86_400_000);
    const weekend = [0, 6].includes(date.getUTCDay());
    const added = d === 0 ? 14 : weekend ? 11 + (d % 4) : 18 + (d % 3);
    const ind = realtors[d % realtors.length];
    const town = (TOWNS as Town[]).find(t => t.name === vaTowns[d % vaTowns.length])!;
    const bs = businessesIn(ind, town, 60) as { name: string; email: string; phone: string; website: string; address: string }[];
    const pool = bs.filter(b => b.email);
    for (let k = 0; k < added + 3; k++) {
      const b = pool[(k + d * 7) % pool.length];
      const at = new Date(date.getTime() - (k * 23 + 40) * 60_000).toISOString();
      const ok = k < added;
      const status = ok ? 'added' : k === added ? 'no_email' : 'known';
      const es = ok ? (k % 9 === 0 ? 'valid' : k % 13 === 5 ? 'risky' : 'domain_ok') : '';
      rows.push(`(${q(`pp-reel-${seq}`)}, ${q(ACCT)}, ${q(REALTY.id)}, ${q(finderId)}, ${q(`geo-reel-${d}-${k}-${ind.key}`)}, ${q(b.name)}, ${q(ok ? b.email : '')}, ${q(b.phone)}, ${q(b.website)}, ${q(b.address)}, ${q(ind.label.toLowerCase())}, '', '', '', ${q(es)}, ${q(`${ind.trade}|${town.name}`)}, 'free', ${q(status)}, ${q(ok ? `pf-pp-reel-${seq}` : '')}, ${q(at)}, ${q(ok ? at : '')})`);
      seq++;
    }
    runs.push(`(${q(`fr-reel-${d}-s`)}, ${q(finderId)}, ${q(ACCT)}, ${q(REALTY.id)}, 'search', ${q(`Searched ${ind.trade} in ${town.name} — ${40 + (d % 17)} found`)}, ${40 + (d % 17)}, 0, ${q(new Date(date.getTime() - 9 * 3_600_000).toISOString())})`);
    runs.push(`(${q(`fr-reel-${d}-r`)}, ${q(finderId)}, ${q(ACCT)}, ${q(REALTY.id)}, 'read', ${q(`Read ${added + 6} websites — ${added + 2} published an address, ${added} checked out`)}, ${added + 2}, 0, ${q(new Date(date.getTime() - 8 * 3_600_000).toISOString())})`);
    runs.push(`(${q(`fr-reel-${d}-a`)}, ${q(finderId)}, ${q(ACCT)}, ${q(REALTY.id)}, 'add', ${q(`Added ${added} to "Virginia realtors — daily"`)}, 0, ${added}, ${q(new Date(date.getTime() - 7 * 3_600_000).toISOString())})`);
  }
  for (let i = 0; i < rows.length; i += 150) {
    d1(`INSERT INTO crm_project_prospects (id, account_id, project_id, finder_id, ref, name, email, phone, website, address, category, person_name, person_role, company_number, email_status, query, source, status, contact_id, found_at, added_at) VALUES ${rows.slice(i, i + 150).join(',\n')};`);
  }
  d1(`INSERT INTO crm_finder_runs (id, finder_id, account_id, project_id, kind, detail, found, added, at) VALUES ${runs.join(',\n')};`);
  d1(`UPDATE crm_prospect_finders SET day = ${q(now.slice(0, 10))}, day_added = 14, day_searches = 3, day_reads = 41, cursor = 4,
      next_run_at = ${q(new Date(Date.now() + 4 * 60_000).toISOString())}, last_run_at = ${q(ago(0, 0.2))}, created_at = ${q(ago(31))} WHERE id = ${q(finderId)};`);
  /* The project's brief, so its Overview and the planner both know who it writes to. */
  d1(`UPDATE crm_projects SET brief = ${q(JSON.stringify({ version: 1, audience: { listId: 'list-va-realtors', listName: 'Virginia realtors — daily' }, smsOptIn: true, createdWith: 'wizard-v2' }))} WHERE id = ${q(REALTY.id)};`);
}

/* What the agents have made, so every project's "made so far" rail has
   something true on it: the posts above, recorded as their runs. */
d1(posts.map((p, i) => {
  const pj = projects[i % projects.length];
  return `INSERT INTO crm_agent_runs (id, account_id, project_id, workflow_id, node_id, produces, outcome, detail, link, created_at)
   VALUES (${q(`ar-reel-${i}`)}, ${q(ACCT)}, ${q(pj.id)}, ${q(pj.wf[pj.wf.length - 1])}, 'n1', 'social', 'ok',
     'Made 1 post from the client portfolio.',
     ${q(JSON.stringify({ kind: 'social-post', id: p.id, label: String(p.name), route: '/social-creator' }))},
     ${q(ago(i % 3, i))});`;
}).join('\n'));

/* What Autopilot has done for each project, and what waits for a person —
   the board's log and the dashboard's panel read these. Each one is the kind
   of thing the planner writes (autopilotPlan.ts), in its words. */
{
  const ACTS: [string, string, string, string][] = [
    ['enrol', 'done', 'Started 20 new prospects on "Prospect outreach"', 'they were added to the audience today and are in no sequence yet'],
    ['send', 'done', 'Sent 46 follow-ups from your own mailbox', 'they had not replied in three days'],
    ['create', 'done', 'Wrote 3 social posts for this week', 'the content workflow runs every weekday morning'],
    ['enrol', 'awaiting', 'Start the next 20 prospects on the outreach', 'cold lists go 20 at a time, each batch waiting for you'],
    ['book', 'done', 'Booked 4 calls from replies', 'they answered yes and picked a time on your calendar'],
    ['send', 'done', 'Asked 12 happy customers for a review', 'their deals moved to Won two days ago'],
    ['observe', 'done', 'Spotted 3 deals with no activity in 14 days', 'they are in Proposal sent and nobody has written since'],
  ];
  /* What each client's project is waiting on a person for — its own, so the
     dashboard does not read as one sentence five times. */
  const WAITING: [string, string][] = [
    ['Start the next 20 Virginia realtors on the outreach', 'cold lists go 20 at a time, each batch waiting for you'],
    ['Send 14 new-patient welcomes from Monday\'s missed calls', 'texts and emails to people who called are held for approval'],
    ['Publish "What the new tenancy rules mean for landlords"', 'a blog post goes out under the firm\'s name, so a partner reads it first'],
    ['Text 38 lapsed members the January offer', 'a text to people who have not visited in 60 days waits for you'],
    ['Email 22 past catering clients about spring dates', 'they booked last spring and have not been asked since'],
  ];
  const rows: string[] = [];
  projects.forEach((pj, i) => {
    ACTS.map(a => (a[1] === 'awaiting' ? [a[0], a[1], WAITING[i][0], WAITING[i][1]] as [string, string, string, string] : a)).forEach(([kind, status, summary, because], k) => {
      if ((k + i) % 5 === 4 && status === 'done') return;
      const at = ago(0, i * 2 + k * 3 + 1);
      rows.push(`(${q(`aa-reel-${i}-${k}`)}, ${q(ACCT)}, ${q(pj.id)}, ${q(kind)}, ${q(status)}, ${q(summary)}, ${q(because)}, '{}', ${q(JSON.stringify({ type: kind === 'observe' ? 'none' : 'none' }))}, ${q(status === 'done' ? 'Done.' : '')}, NULL, ${q(at)}, ${status === 'done' ? q(at) : 'NULL'})`);
    });
  });
  d1(`INSERT INTO crm_autopilot_actions (id, account_id, project_id, kind, status, summary, because, counts, effect, detail, due_at, created_at, acted_at) VALUES ${rows.join(',\n')};`);
  d1(projects.map((pj, i) => `UPDATE crm_projects SET last_acted_at = ${q(ago(0, i * 0.7 + 0.3))} WHERE id = ${q(pj.id)};`).join('\n'));
}

/* ── Engagement: forms and tickets ───────────────────────────────────────── */

for (const name of ['Get a quote', 'Book a consultation', 'New-patient sign-up', 'Catering enquiry', 'Newsletter sign-up']) {
  await as('/api/engagement.php', {
    action: 'save_form', record: {
      name, headline: name, status: 'live', createPerson: true,
      fields: [{ key: 'name', label: 'Your name', type: 'text', required: true }, { key: 'email', label: 'Email', type: 'email', required: true }],
    },
  });
}
for (const [subject, priority] of [['Booking link shows the wrong clinic hours', 'urgent'], ['Invoice question for March', 'normal'], ['Can you quote for two more locations?', 'normal'], ['Add our Norfolk office to the listings', 'normal'], ['Review request went to an old address', 'urgent']]) {
  await as('/api/engagement.php', { action: 'create_ticket', subject, bodyText: subject, priority, category: 'service' });
}

/* A paying agency, not a trial: no trial bar across the top of every picture,
   and none of the welcome notices a new sign-up is shown. */
d1(`UPDATE crm_users SET trial_ends_at = NULL WHERE account_id = ${q(ACCT)}; DELETE FROM crm_notices;`);

/* ── Photographing ───────────────────────────────────────────────────────── */

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: SCALE });
const phoneCtx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const signIn = ([token, acct]: string[]) => {
  localStorage.setItem('crm_session', JSON.stringify({
    token, backend: 'php', user: { email: 'alex@riverastudio.com', name: 'Alex Rivera', role: 'agency', accountId: acct },
  }));
  localStorage.setItem('crm_active_account', acct);
  /* The agency's client list as the browser holds it; the active one is the
     real server workspace everything else is read from. */
  localStorage.setItem('crm_subaccounts', JSON.stringify([
    { id: acct, name: 'Rivera Studio', plan: 'agency', status: 'active', price: 0 },
    { id: 'reel-c1', parentId: acct, name: 'Brightline Realty', plan: 'pro', status: 'active', price: 2497, createdAt: '2026-05-12T09:00:00Z' },
    { id: 'reel-c2', parentId: acct, name: 'Parkway Dental', plan: 'growth', status: 'active', price: 1497, createdAt: '2026-06-19T09:00:00Z' },
    { id: 'reel-c3', parentId: acct, name: 'Harbour Law', plan: 'pro', status: 'active', price: 2497, createdAt: '2026-07-02T09:00:00Z' },
    { id: 'reel-c4', parentId: acct, name: 'Legacy Fitness', plan: 'starter', status: 'active', price: 897, createdAt: '2026-07-08T09:00:00Z' },
    { id: 'reel-c5', parentId: acct, name: 'Vine Street Kitchen', plan: 'growth', status: 'active', price: 1497, createdAt: '2026-08-14T09:00:00Z' },
    { id: 'reel-c6', parentId: acct, name: 'Northside Plumbing', plan: 'growth', status: 'active', price: 1497, createdAt: '2026-08-30T09:00:00Z' },
    { id: 'reel-c7', parentId: acct, name: 'Tenby Roofing', plan: 'starter', status: 'trial', price: 897, createdAt: '2026-09-10T09:00:00Z' },
  ]));
  localStorage.setItem('crm_sidebar_mode', JSON.stringify('hidden'));
  /* Still frames: nothing mid-animation in a photograph. */
  localStorage.setItem('crm_motion', 'reduced');
};
await ctx.addInitScript(signIn, [TOK, ACCT]);
await phoneCtx.addInitScript(signIn, [TOK, ACCT]);
/* The recipes drive whichever window is being photographed. */
let page = await ctx.newPage();
const errs: string[] = [];
page.on('pageerror', e => errs.push(`${page.url()}: ${e.message}`));

const hideNoise = async () => {
  /* The notices the seeded automations raise, the trial bar and the corner
     help offer: real, but not the picture of the screen. */
  await page.addStyleTag({ content: '.toast-stack,[data-trialbar],.trial-bar,[aria-label="Help"],[data-corner-help]{display:none!important}' }).catch(() => {});
};
const go = async (route: string, settle = 2000) => {
  await page.goto(`${B}${route}`, { waitUntil: 'networkidle' });
  await hideNoise();
  await page.waitForTimeout(settle);
};
/** Scroll so `el` starts just under the app's sticky bar. */
const under = async (text: string | RegExp, gap = 150) => {
  await page.getByText(text).first().evaluate((el, g) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - g), gap).catch(() => {});
  await page.waitForTimeout(600);
};
/* A search as somebody runs it: the sentence, then the mailbox checks and
   the named people on the owner's verifier. Each workspace's verifier
   allowance is a hundred checks a day, which is why only two searches verify. */
const aiSearch = async (ask: string, verify = false) => {
  await go('/prospecting', 1200);
  const box = page.getByLabel('Who to look for').first();
  await box.fill(ask);
  await page.keyboard.press('Enter');
  await page.getByText(/Checked \d+ address/).first().waitFor({ timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  if (verify) {
    await page.getByRole('button', { name: /^Verify \d+ mailbox/ }).first().click().catch(() => {});
    await page.getByText(/Verified \d+ mailbox/).first().waitFor({ timeout: 45_000 }).catch(() => {});
    await page.getByRole('button', { name: /Search the web for named people/ }).first().click().catch(() => {});
    await page.getByText(/Searched the web for addresses/).first().waitFor({ timeout: 45_000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }
  /* The results screen scrolls inside its own panes; all of them back to the top. */
  await page.evaluate(() => { for (const el of document.querySelectorAll<HTMLElement>('*')) if (el.scrollTop) el.scrollTop = 0; window.scrollTo(0, 0); });
  await page.waitForTimeout(800);
  await hideNoise();
};
const focusProject = (id: string, tab = '') => go(`/autopilot?project=${encodeURIComponent(id)}${tab ? `&tab=${tab}` : ''}`, 2600);
/** A project's card on its Workflows tab, where the diagrams are drawn. */
const workflowsOf = async (id: string) => {
  await focusProject(id);
  /* A phone draws the tabs differently; if neither form is there, the card
     is photographed on the tab it opened on rather than failing the shot. */
  await page.locator(`#project-${id}`).getByRole('tab', { name: /^Workflows/ }).first().click({ timeout: 6000 })
    .catch(() => page.locator(`#project-${id}`).getByText(/^Workflows/).first().click({ timeout: 6000 }))
    .catch(() => {});
  await page.waitForTimeout(1500);
};

/** How to reach each picture. Every file in reels.ts must be here. */
const RECIPES: Record<string, () => Promise<void>> = {
  /* ── The hero: the whole platform, one screen at a time ── */
  'hero-board': async () => {
    await workflowsOf(REALTY.id);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
  },
  'hero-flow': async () => {
    await workflowsOf(REALTY.id);
    await under('Prospect outreach — email, follow up, hand over', 120);
  },
  'hero-prospecting': () => aiSearch('real estate agents in Richmond, Virginia with a website', true),
  'hero-daily': () => focusProject(REALTY.id, 'prospects'),
  'hero-dashboard': () => go('/', 2600),
  'hero-pipeline': () => go('/pipelines'),

  /* ── AI Prospecting's own section ── */
  'pr-start': () => go('/prospecting', 1800),
  'pr-dentists': () => aiSearch('dentists in Leeds', true),
  'pr-lawyers': () => aiSearch('law firms in Denver, Colorado'),
  'pr-daily-chart': async () => {
    await focusProject(REALTY.id, 'prospects');
    await under(/Added to the audience, day by day/i, 230);
  },
  'pr-every-day': async () => {
    await aiSearch('gyms in Austin, Texas');
    /* The Connect to AI Autopilot wizard, at the step that shows the linked search and its criteria. */
    await page.getByRole('button', { name: /Connect to AI Autopilot/ }).first().click();
    await page.waitForTimeout(900);
    const dlg = page.getByRole('dialog', { name: 'Connect to AI Autopilot' });
    await dlg.getByRole('radio', { name: /Legacy Fitness/ }).click().catch(() => {});
    await dlg.getByTestId('connect-next').click().catch(() => {});
    await dlg.getByTestId('source-criteria').waitFor({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
  },

  /* ── The module reels further down the page ── */
  'dashboard': () => go('/', 2600),
  'ap-board': () => go('/autopilot', 2600),
  'ap-describe': async () => {
    await go('/autopilot');
    await page.getByRole('button', { name: /New project/ }).first().click();
    await page.waitForTimeout(1200);
    const box = page.getByRole('dialog').locator('textarea').first();
    await box.fill('I want to sell my products to real estate agents in Virginia — find new ones every day, email them, and text the ones who say yes.').catch(() => {});
    await page.waitForTimeout(500);
  },
  'ap-diagram': async () => {
    await workflowsOf(projects[1].id);
    await under('Missed call — text back and book', 168);
  },
  'ap-step': async () => {
    await workflowsOf(projects[2].id);
    await under('New enquiry — qualify, route and book', 168);
    const flow = page.getByRole('group', { name: 'Workflow diagram' }).filter({ hasText: 'A job over $5k?' }).first();
    await flow.getByRole('button', { name: 'Edit step: A form is submitted' }).click();
    await page.waitForTimeout(1000);
  },
  'ap-gallery': () => go('/autopilot?view=templates'),
  'contacts-list': () => go('/contacts'),
  'contacts-profile': async () => {
    await go('/contacts');
    await page.getByText(w.contacts[2].name).first().click();
    await page.waitForTimeout(1200);
  },
  'pipe-board': () => go('/pipelines'),
  'pipe-table': async () => {
    await go('/pipelines');
    await page.getByRole('button', { name: /^Table$/ }).first().click().catch(() => page.getByText('Table').first().click());
    await page.waitForTimeout(1000);
  },
  'mkt-campaigns': async () => {
    await go('/marketing?tab=campaigns');
    /* The seeded mailbox has never been proved, so the set-up banner is
       rightly offered; dismissed is what an owner with a working one sees. */
    await page.getByRole('button', { name: '✕' }).first().click().catch(() => {});
    await page.waitForTimeout(300);
  },
  'mkt-sequences': () => go('/marketing?tab=sequences'),
  'eng-forms': () => go('/engagement?tab=forms'),
  'eng-tickets': async () => {
    await go('/engagement?tab=tickets');
    await page.getByText('Booking link shows the wrong clinic hours').first().click();
    await page.waitForTimeout(1000);
  },
  'funnels-list': () => go('/funnels'),
  'social-editor': () => go('/social-creator/editor/sp-reel-1', 2600),
  'sites-list': () => go('/websites'),
  'social-gallery': () => go('/social-creator', 2400),
  'blog-projects': () => go('/blog-automation'),
  'cal-week': () => go('/calendar'),
  'agency': () => go('/agency'),
  'analytics': () => go('/analytics'),
};

const missing = (REEL_FILES as string[]).filter(f => !RECIPES[f]);
if (missing.length) throw new Error(`no capture recipe for: ${missing.join(', ')}`);

const only = process.argv.slice(2);
const taken: string[] = [];
async function photograph(suffix: string) {
  for (const file of REEL_FILES as string[]) {
    if (only.length && !only.includes(file)) continue;
    try {
      await RECIPES[file]();
    } catch (e) {
      console.log(`FAILED  ${file}${suffix}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      process.exitCode = 1;
      continue;
    }
    const broken = await page.evaluate(() => /ran into a problem|something went wrong/i.test(document.body.innerText));
    if (broken) { console.log(`REFUSED ${file}${suffix} — the screen is showing an error`); process.exitCode = 1; continue; }
    await page.screenshot({ path: `${RAW}/${file}${suffix}.png` });
    taken.push(`${file}${suffix}`);
  }
}
/* PHONE_ONLY=1 retakes just the phone pictures (the desktop ones are kept). */
if (!process.env.PHONE_ONLY) await photograph('');
page = await phoneCtx.newPage();
page.on('pageerror', e => errs.push(`phone ${page.url()}: ${e.message}`));
await photograph('-m');

/* PNG → WebP in the browser that took them: Chromium encodes WebP natively,
   so there is no second tool to install or forget. */
const conv = await ctx.newPage();
await conv.goto('about:blank');
const encode = async (raw: string, wide: number, quality: number) => {
  const b64 = fs.readFileSync(raw).toString('base64');
  return conv.evaluate(async ([src, w, qq]: [string, number, number]) => {
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = `data:image/png;base64,${src}`; });
    const c = document.createElement('canvas');
    c.width = Math.min(w, img.naturalWidth);
    c.height = Math.round(img.naturalHeight * (c.width / img.naturalWidth));
    const g = c.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/webp', qq).split(',')[1];
  }, [b64, wide, quality] as [string, number, number]);
};
const write = (name: string, data: string) => {
  fs.writeFileSync(`${OUT}/${name}.webp`, Buffer.from(data, 'base64'));
  console.log(`wrote   ${name}.webp  ${(fs.statSync(`${OUT}/${name}.webp`).size / 1024).toFixed(0)}kB`);
};
for (const name of taken) {
  const raw = `${RAW}/${name}.png`;
  if (name.endsWith('-m')) { write(name, await encode(raw, 1170, 0.8)); continue; }
  write(name, await encode(raw, 2400, 0.8));
  write(`${name}-sm`, await encode(raw, 1200, 0.82));
}

console.log(errs.length ? `PAGE ERRORS:\n  ${errs.join('\n  ')}` : 'no page errors');
await browser.close();
stop();
process.exit(process.exitCode ?? 0);
