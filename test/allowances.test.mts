/**
 * Plan allowances: the rules (worker/src/lib/allowances.ts), the counting and
 * refusals (worker/src/lib/allowanceStore.ts) on a real SQLite with every
 * migration applied, and that the site's price cards, Plan & billing and the
 * server read one table.
 *
 *   npm run test:allowances
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import {
  INCLUDED, LEGACY_CENTS, METERS, METER_IDS, OWNER_LIMITS, PLAN_DEFS, TRIAL_LIMITS, UNLIMITED, annualSaving, applyOverrides, cleanLimit,
  effectivePlans, featureLines, fill, formatLimit, limitsFor, periodEnd, periodOf, planByAmount, refusalText, soldAt, upgradeFor, verdict, meterOf,
} from '../worker/src/lib/allowances';
import { check, counted, readAll, record, roomFor, standingOf, take } from '../worker/src/lib/allowanceStore';
import { handleAllowances } from '../worker/src/routes/allowances';
import { PLAN_RESELL } from '../worker/src/lib/db';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d: unknown = '') => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c ? '' : ` — ${JSON.stringify(d).slice(0, 400)}`}`); };

/* ── The rules ── */
console.log('Rules');
ok('every plan names every meter', PLAN_DEFS.every(p => METER_IDS.every(id => typeof p.limits[id] === 'number')) && METER_IDS.every(id => typeof TRIAL_LIMITS[id] === 'number'));
ok('plans are in ascending price', PLAN_DEFS.every((p, i) => i === 0 || p.monthlyCents > PLAN_DEFS[i - 1].monthlyCents));
ok('no plan allows less than the one below it', PLAN_DEFS.every((p, i) => i === 0 || METER_IDS.every(id => p.limits[id] < 0 || (PLAN_DEFS[i - 1].limits[id] >= 0 && p.limits[id] >= PLAN_DEFS[i - 1].limits[id]))));
ok('the trial allows no more than Starter, except where it is equal', METER_IDS.every(id => TRIAL_LIMITS[id] <= PLAN_DEFS[0].limits[id]));
ok('yearly is ten months (two free)', PLAN_DEFS.every(p => p.annualCents === p.monthlyCents * 10 && annualSaving(p) === p.monthlyCents * 2));
ok('every price is distinct, so an amount names one plan', new Set(PLAN_DEFS.flatMap(p => [p.monthlyCents, p.annualCents])).size === PLAN_DEFS.length * 2);
ok('the owner is unlimited on every meter', METER_IDS.every(id => OWNER_LIMITS[id] === UNLIMITED) && limitsFor('owner', 'starter') === OWNER_LIMITS);
ok('a trial — running or ended — gets the trial numbers', limitsFor('trial', 'agency').ai_shorts === TRIAL_LIMITS.ai_shorts && limitsFor('ended', 'pro').autopilot_projects === TRIAL_LIMITS.autopilot_projects);
ok('a plan gets its own numbers', limitsFor('plan', 'growth').ai_shorts === 100 && limitsFor('plan', 'agency').autopilot_projects === UNLIMITED);
ok('an unknown plan is held to Starter', limitsFor('plan', 'custom').ai_shorts === PLAN_DEFS[0].limits.ai_shorts);
ok('an owner change wins, a bad one is ignored', limitsFor('plan', 'starter', { starter: { ai_shorts: 45, social_posts: -7 as never } }).ai_shorts === 45 && limitsFor('plan', 'starter', { starter: { social_posts: -7 } }).social_posts === 60);
ok('limits are whole numbers from 0, or -1', cleanLimit('12') === 12 && cleanLimit(-1) === -1 && cleanLimit(-2) === null && cleanLimit(1.5) === null && cleanLimit('') === null && cleanLimit(true) === null);
ok('verdict: room, none, unlimited', verdict(29, 30).ok && !verdict(30, 30).ok && verdict(30, 30).left === 0 && !verdict(25, 30, 6).ok && verdict(1e9, UNLIMITED).ok);
ok('fill: a bar, and none for unlimited', fill({ used: 15, limit: 30 }) === 0.5 && fill({ used: 99, limit: UNLIMITED }) === 0 && fill({ used: 40, limit: 30 }) === 1);
ok('the plan that raises Shorts above Starter is Growth', upgradeFor('ai_shorts', { kind: 'plan', planId: 'starter' })?.id === 'growth');
ok('from the trial, the first plan', upgradeFor('autopilot_projects', { kind: 'trial', planId: 'starter' })?.id === 'starter');
ok('nothing raises an unlimited meter', upgradeFor('autopilot_projects', { kind: 'plan', planId: 'agency' }) === null && upgradeFor('ai_shorts', { kind: 'owner', planId: '' }) === null);
ok('formatLimit says Unlimited', formatLimit(UNLIMITED) === 'Unlimited' && formatLimit(1500) === '1,500' && formatLimit(300, meterOf('video_minutes')) === '300 min');

/* ── Periods ── */
console.log('Periods');
ok('a month is UTC', periodOf(new Date('2026-10-31T23:59:59Z')) === 'm:2026-10' && periodOf(new Date('2026-11-01T00:00:00Z')) === 'm:2026-11');
ok('it starts again on the 1st', periodEnd('m:2026-10') === '2026-11-01T00:00:00.000Z' && periodEnd('m:2026-12') === '2027-01-01T00:00:00.000Z');

/* ── Words ── */
console.log('Words');
const shortsMsg = refusalText(meterOf('ai_shorts')!, 30, 30, 'Starter', { name: 'Growth', limit: 100 }, periodEnd('m:2026-10'));
ok('a monthly refusal names the plan, the numbers, the date and the plan that raises it',
  /30 AI Shorts on Starter/.test(shortsMsg) && /30 of 30/.test(shortsMsg) && /1 November/.test(shortsMsg) && /Growth includes 100 a month/.test(shortsMsg), shortsMsg);
const projMsg = refusalText(meterOf('autopilot_projects')!, 2, 2, 'Free trial', { name: 'Starter', limit: 3 });
ok('a count refusal says what exists and how to make room', /Free trial includes 2 AI Autopilot projects and 2 exist/.test(projMsg) && /delete one/.test(projMsg), projMsg);
ok('a workflow refusal is about the one project', /This project already has 6 of the 6 workflows/.test(refusalText(meterOf('workflows_per_project')!, 6, 6, 'Starter', null)));

/* ── One table: the site, Plan & billing and the server ── */
console.log('One table');
const n = (v: number) => v < 0 ? 'Unlimited' : v.toLocaleString('en-US');
ok('price cards are generated from the limits', PLAN_DEFS.every(p => {
  const lines = featureLines(p).join(' | ');
  return (['ai_shorts', 'long_videos', 'social_posts', 'blog_articles', 'ai_emails', 'prospects_found', 'ai_requests', 'autopilot_projects', 'workflows_per_project', 'sub_accounts'] as const)
    .every(id => lines.includes(n(p.limits[id])));
}), PLAN_DEFS.map(p => featureLines(p)));
ok('…and change when the owner changes a number', featureLines(effectivePlans({ growth: { ai_shorts: 123 } })[1]).some(l => l.includes('123 AI Shorts')));
ok('the server\'s sub-account table is the plan table', PLAN_DEFS.every(p => PLAN_RESELL[p.id] === p.limits.sub_accounts));
ok('an amount names its plan and period', planByAmount(4900)?.id === 'starter' && planByAmount(197000)?.interval === 'year' && planByAmount(14900) === null);
ok('the old prices still belong to the plans that charged them', soldAt('pro', 9700) && soldAt('agency', 14900) && !soldAt('starter', 9700) && (LEGACY_CENTS.pro ?? []).includes(9700));
const site = readFileSync(new URL('../src/components/Site/PricingSection.tsx', import.meta.url), 'utf8');
const billing = readFileSync(new URL('../src/components/Billing/ClientBilling.tsx', import.meta.url), 'utf8');
const tenancy = readFileSync(new URL('../src/services/tenancy.ts', import.meta.url), 'utf8');
ok('the site draws its cards from the table and the server', /featureLines\(p\)/.test(site) && /fetchPlans\(\)/.test(site) && !/\$\d{2,}/.test(site.replace(/\$\{/g, '')));
ok('Plan & billing too', /featureLines\(p\)/.test(billing) && /fetchPlans\(\)/.test(billing) && !/PLANS\b/.test(billing.replace(/PLAN_DEFS/g, '')));
ok('the app\'s plan list is derived, not written out again', /PLAN_DEFS\.map/.test(tenancy) && !/price: [1-9]\d*/.test(tenancy));
ok('what every plan includes is said once', INCLUDED.length >= 4 && !PLAN_DEFS.some(p => 'extras' in p));
ok('every meter says where it is counted', METERS.every(m => m.counted.length > 20));

/* ── A database: every migration, on SQLite ── */
console.log('Counting, on a database');
const sql = new DatabaseSync(':memory:');
const dir = new URL('../worker/migrations/', import.meta.url);
for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) sql.exec(readFileSync(new URL(f, dir), 'utf8'));

/* The slice of D1's API the store uses. */
const norm = (a: unknown[]) => a.map(v => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v)) as (string | number | null)[];
class Stmt {
  constructor(private q: string, private a: unknown[] = []) {}
  bind(...a: unknown[]) { return new Stmt(this.q, a); }
  async first<T>() { return (sql.prepare(this.q).get(...norm(this.a)) ?? null) as T | null; }
  async all<T>() { return { results: sql.prepare(this.q).all(...norm(this.a)) as T[] }; }
  async run() { const r = sql.prepare(this.q).run(...norm(this.a)); return { meta: { changes: Number(r.changes) } }; }
}
const DB = { prepare: (q: string) => new Stmt(q), batch: async (s: Stmt[]) => Promise.all(s.map(x => x.run())) };
const env = { DB } as never;
const now = new Date().toISOString();
const later = new Date(Date.now() + 5 * 86_400_000).toISOString();
const user = (email: string, accountId: string | null, trialEnds: string | null) =>
  sql.prepare("INSERT INTO crm_users (email, name, role, account_id, hash, created_at, trial_ends_at) VALUES (?, ?, 'agency', ?, 'x', ?, ?)").run(email, email, accountId, now, trialEnds);
const ws = (id: string, owner: string) => sql.prepare('INSERT INTO crm_workspaces (account_id, owner_email, created_at) VALUES (?, ?, ?)').run(id, owner, now);
const project = (id: string, account: string) => sql.prepare('INSERT INTO crm_projects (id, account_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, account, id, now, now);
const workflow = (id: string, account: string, pj: string) => sql.prepare('INSERT INTO crm_project_workflows (id, account_id, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, account, pj, now, now);

user('owner@pc.test', null, null); ws('acct-owner', 'owner@pc.test');
user('trial@pc.test', 'acct-trial', later); ws('acct-trial', 'trial@pc.test'); ws('acct-trial-client', 'trial@pc.test');
user('paid@pc.test', 'acct-paid', later); ws('acct-paid', 'paid@pc.test');
sql.prepare("INSERT INTO crm_plans (owner_email, plan_id, resell_limit, source, updated_at) VALUES ('paid@pc.test', 'growth', 5, 'stripe', ?)").run(now);

const tr = await standingOf(env, 'acct-trial');
ok('a trial customer stands on the trial', tr.kind === 'trial' && tr.limits.ai_shorts === TRIAL_LIMITS.ai_shorts && tr.planName === 'Free trial', tr);
const pd = await standingOf(env, 'acct-paid');
ok('a paying customer stands on their plan', pd.kind === 'plan' && pd.planId === 'growth' && pd.limits.ai_shorts === 100, pd);
const ow = await standingOf(env, 'acct-owner');
ok('the install owner is never limited', ow.kind === 'owner' && ow.limits.autopilot_projects === UNLIMITED);

ok('the same Short counted twice is one', await record(env, 'acct-trial', 'ai_shorts', 'short:vo-1') && !(await record(env, 'acct-trial', 'ai_shorts', 'short:vo-1')));
ok('…and it is known to be counted', await counted(env, 'acct-trial', 'ai_shorts', 'short:vo-1'));
for (let i = 2; i <= 9; i++) await record(env, 'acct-trial', 'ai_shorts', `short:vo-${i}`);
/* A client sub-account draws on the same allowance. */
await record(env, 'acct-trial-client', 'ai_shorts', 'short:vo-10');
const full = await check(env, 'acct-trial', 'ai_shorts');
ok('the trial\'s tenth Short, made in a sub-account, fills the shared allowance', !full.ok && full.used === 10 && full.limit === 10, full);
ok('the refusal is by name, with the plan that raises it', !full.ok && full.code === 'allowance' && full.upgrade?.id === 'starter' && /10 AI Shorts on Free trial/.test(full.message), !full.ok && full.message);
ok('roomFor says none, and why', (await roomFor(env, 'acct-trial-client', 'ai_shorts')).left === 0);
const again = await take(env, 'acct-trial', 'ai_shorts', 'short:vo-3');
ok('re-rendering a Short already counted is free', again.ok);
/* Last month's use does not count this month. */
sql.prepare("UPDATE crm_usage SET period = 'm:2000-01' WHERE meter = 'ai_shorts'").run();
ok('a new month starts empty', (await check(env, 'acct-trial', 'ai_shorts')).ok && (await roomFor(env, 'acct-trial', 'ai_shorts')).left === TRIAL_LIMITS.ai_shorts);
/* The owner: counted, never refused. */
for (let i = 0; i < 5; i++) await record(env, 'acct-owner', 'blog_articles', `bp-${i}`);
ok('the owner is counted but never refused', (await check(env, 'acct-owner', 'blog_articles', 1e6)).ok);

project('pj-1', 'acct-trial'); project('pj-2', 'acct-trial-client');
const third = await check(env, 'acct-trial', 'autopilot_projects');
ok('a third project on the trial is refused (two across both workspaces)', !third.ok && third.used === 2 && third.limit === 2, third);
ok('the paying customer has room for more', (await check(env, 'acct-paid', 'autopilot_projects')).ok);
for (let i = 0; i < 6; i++) workflow(`wf-${i}`, 'acct-trial', 'pj-1');
const wf = await check(env, 'acct-trial', 'workflows_per_project', 1, { projectId: 'pj-1' });
ok('a seventh workflow in one project is refused', !wf.ok && wf.used === 6, wf);
ok('…but another project has its own six', (await check(env, 'acct-trial-client', 'workflows_per_project', 1, { projectId: 'pj-2' })).ok);

const view = await readAll(env, 'acct-trial');
ok('the Usage card reads every meter', view.meters.length === METERS.length && view.workspaces === 2 && view.planName === 'Free trial');
ok('…with the counts as the refusals see them', view.meters.find(m => m.id === 'autopilot_projects')?.used === 2 && view.meters.find(m => m.id === 'workflows_per_project')?.used === 6);

/* ── The route ── */
console.log('The route');
const post = (b: Record<string, unknown>) => handleAllowances(new Request('https://x.test/api/allowances.php', { method: 'POST', body: JSON.stringify(b) }), env).then(r => r.json() as Promise<Record<string, any>>);
const pub = await post({ action: 'plans' });
ok('`plans` needs no session and is the plan table', pub.success && JSON.stringify(pub.plans) === JSON.stringify(PLAN_DEFS) && JSON.stringify(pub.trial.limits) === JSON.stringify(TRIAL_LIMITS));
ok('status needs a session', (await post({ action: 'status', accountId: 'acct-trial' })).code === 'unauthorised');
sql.prepare("INSERT INTO crm_plan_limits (plan_id, meter, value, updated_at) VALUES ('growth', 'ai_shorts', 150, ?)").run(now);
const changed = await post({ action: 'plans' });
ok('an owner\'s change reaches the public table', changed.plans.find((p: { id: string }) => p.id === 'growth').limits.ai_shorts === 150 && changed.changed.includes('growth'));
ok('…and the limits the server holds', (await standingOf(env, 'acct-paid')).limits.ai_shorts === 150);
ok('applyOverrides keeps the rest', applyOverrides(PLAN_DEFS[1].limits, { ai_shorts: 150 }).social_posts === PLAN_DEFS[1].limits.social_posts);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
