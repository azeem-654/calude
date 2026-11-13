/**
 * The AppSumo reviewer's first article (2026-11): a weekly SEO blog workflow
 * built by AI Autopilot on the *included* AI, no key of the customer's own,
 * whose "Making your first article now" step read "Not made yet. Searching
 * the web needs a Google AI key."
 *
 * The real path, end to end: `runAgentOnce` (what `/api/autopilot.php
 * run_agent` calls for the wizard's first article) → aiBudget → loadAiKey
 * (the operator's pool) → researchWeb → writeBlogPost, on every migration in
 * SQLite and with Google and OpenRouter stubbed at the network.
 *
 * Each state below is one the operator's keys really get into. In every one
 * the customer is owed the article, and nothing they read may tell them to
 * bring a key: they were told AI is included. `npm run test:firstarticle`
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { runAgentOnce } from '../worker/src/lib/projectAgents';
import { dataGet } from '../worker/src/lib/db';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d: unknown = '') => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c ? '' : ` — ${JSON.stringify(d).slice(0, 400)}`}`); };

const sql = new DatabaseSync(':memory:');
const dir = new URL('../worker/migrations/', import.meta.url);
for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) sql.exec(readFileSync(new URL(f, dir), 'utf8'));
const norm = (a: unknown[]) => a.map(v => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v)) as (string | number | null)[];
class Stmt {
  constructor(private q: string, private a: unknown[] = []) {}
  bind(...a: unknown[]) { return new Stmt(this.q, a); }
  async first<T>() { return (sql.prepare(this.q).get(...norm(this.a)) ?? null) as T | null; }
  async all<T>() { return { results: sql.prepare(this.q).all(...norm(this.a)) as T[] }; }
  async run() { const r = sql.prepare(this.q).run(...norm(this.a)); return { meta: { changes: Number(r.changes) } }; }
}
const GEMINI = 'http://gemini.test';
const OPENROUTER = 'http://openrouter.test';
/* The operator's pool: a Google key and an OpenRouter key, as on live. The
   customer's workspace has none of its own. */
const env = {
  DB: { prepare: (q: string) => new Stmt(q), batch: async (x: Stmt[]) => Promise.all(x.map(y => y.run())) },
  AI_API_KEY: 'AIzaPoolKeyForTests000000000000000000',
  OPENROUTER_API_KEY: 'sk-or-v1-pool-key-for-tests',
  GEMINI_BASE: GEMINI, OPENROUTER_BASE: OPENROUTER,
} as never;

const now = new Date().toISOString();
sql.prepare("INSERT INTO crm_users (email, name, role, account_id, hash, created_at) VALUES ('owner@pc.test', 'Owner', 'agency', NULL, 'x', ?)").run(now);
sql.prepare("INSERT INTO crm_workspaces (account_id, owner_email, created_at) VALUES ('acct-owner', 'owner@pc.test', ?)").run(now);
sql.prepare("INSERT INTO crm_users (email, name, role, account_id, hash, created_at) VALUES ('buyer@pc.test', 'Buyer', 'agency', 'acct-c', 'x', ?)").run(now);
sql.prepare("INSERT INTO crm_workspaces (account_id, owner_email, created_at) VALUES ('acct-c', 'buyer@pc.test', ?)").run(now);
/* A lifetime-deal buyer on a paid plan: AI requests and articles included. */
sql.prepare("INSERT INTO crm_plans (owner_email, plan_id, resell_limit, source, updated_at) VALUES ('buyer@pc.test', 'growth', 5, 'appsumo', ?)").run(now);
const profile = { companyName: 'Northside Heating', industry: 'HVAC', description: 'Boiler installs and repairs in Leeds', products: 'Boiler servicing, heat pumps', audience: 'Homeowners' };
sql.prepare("INSERT INTO crm_portfolios (id, account_id, name, profile, created_at, updated_at) VALUES ('pf-1', 'acct-c', 'Northside', ?, ?, ?)").run(JSON.stringify(profile), now, now);
sql.prepare("INSERT INTO crm_projects (id, account_id, portfolio_id, name, objective, created_at, updated_at) VALUES ('pj-1', 'acct-c', 'pf-1', 'Northside', 'More boiler jobs', ?, ?)").run(now, now);
/* The wizard's weekly SEO blog step: researched on the web, written as an article. */
const nodes = [
  { id: 'n-trigger', type: 'trigger', config: { cadence: 'weekly' } },
  { id: 'n-ai', type: 'ai', config: { source: 'web', sourcePrompt: 'What is new this month in UK boiler grants and heat pump rules', produces: 'blog', cadence: 'weekly' } },
];
sql.prepare("INSERT INTO crm_project_workflows (id, account_id, project_id, name, nodes, status, created_at, updated_at) VALUES ('wf-1', 'acct-c', 'pj-1', 'Weekly SEO blog', ?, 'active', ?, ?)").run(JSON.stringify(nodes), now, now);

/* ── The network ──────────────────────────────────────────────────────── */
type Grounding = () => Response;
let grounding: Grounding = () => new Response('unset', { status: 500 });
let searches = 0, writes = 0;
const article = { title: 'Boiler grants in 2026: what changed', slug: 'boiler-grants-2026', excerpt: 'What homeowners can claim.', body: '## Grants\n\nPlain words.', keywords: ['boiler grant'] };
const gem = (text: string, chunks: { web: { uri: string; title: string } }[] = []) =>
  Response.json({ candidates: [{ content: { parts: [{ text }] }, groundingMetadata: { groundingChunks: chunks } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 } });

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith(`${GEMINI}/v1beta/models?`)) {
    return Response.json({ models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'].map(n => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) });
  }
  if (url.startsWith(`${GEMINI}/v1beta/models/`) && url.includes(':generateContent')) {
    const body = JSON.parse(String(init?.body ?? '{}')) as { tools?: unknown[] };
    if (body.tools?.length) { searches++; return grounding(); }
    writes++;
    return gem(JSON.stringify(article));
  }
  if (url.startsWith(`${OPENROUTER}/models`)) return Response.json({ data: [] });
  /* OpenRouter with no credit: its web plugin is billed, so it answers 402. */
  if (url.startsWith(OPENROUTER)) return Response.json({ error: { code: 402, message: 'Insufficient credits' } }, { status: 402 });
  return new Response('not stubbed', { status: 599 });
}) as typeof fetch;

/* Words an included-AI customer must never be shown. */
const HOMEWORK = /Google AI key|your own key|own AI key|add (?:a|an|your) (?:Google |AI )?key|bring (?:a|your)|needs a (?:Google )?(?:AI )?key/i;

async function firstArticle(name: string, g: Grounding, expectFallback: RegExp | null) {
  grounding = g;
  searches = 0; writes = 0;
  const before = JSON.parse((await dataGet(env.DB, 'acct-c', 'crm_blog_posts')) ?? '[]').length as number;
  const r = await runAgentOnce(env, 'acct-c', 'pj-1', 'wf-1', 'n-ai');
  const after = JSON.parse((await dataGet(env.DB, 'acct-c', 'crm_blog_posts')) ?? '[]') as { title: string; source?: { origin?: string } }[];
  console.log(`${name}`);
  ok('the first article is made', r.ok && r.outcome === 'ok' && !!r.link && r.link.route === '/blog-automation', r);
  ok('…and is in the Blog as a draft, stamped as AI Autopilot\'s', after.length === before + 1 && after[after.length - 1]?.title === article.title && after[after.length - 1]?.source?.origin === 'autopilot', after.slice(-1));
  ok('nothing the customer reads tells them to bring a key', !HOMEWORK.test(r.detail), r.detail);
  if (expectFallback) ok('it says honestly that it was written from the profile, not this week\'s research', expectFallback.test(r.detail) && /business profile/.test(r.detail), r.detail);
  else ok('written from the research, with no fallback note', !/business profile/.test(r.detail), r.detail);
  ok('the web was searched first', searches > 0, { searches, writes });
}

/* Control: grounding works. */
await firstArticle('Search works', () => gem(JSON.stringify({ findings: [{ title: 'Boiler Upgrade Scheme raised', summary: 'The grant rose this month. Homeowners can claim more.', link: 'https://gov.example/bus' }] }), [{ web: { uri: 'https://gov.example/bus', title: 'gov' } }]), null);

/* The model answered without grounding: no pages behind it. Before the fix
   this failed the step: "The search came back with no sources". */
await firstArticle('Search answers with no sources (the model did not ground)', () => gem(JSON.stringify({ findings: [{ title: 'Something', summary: 'From memory.', link: '' }] })), /did not return pages/);

/* Google refuses the search tool for a reason that is not the key's (a plain
   400): every key would say the same, so it is not "busy" — and it used to
   fail the step with Google's own sentence. */
await firstArticle('Google refuses the search tool (a 400 that is not the key\'s)', () => Response.json({ error: { code: 400, message: 'Search Grounding is unavailable for this request.', status: 'INVALID_ARGUMENT' } }, { status: 400 }), /did not return pages/);

/* The search worked and found nothing recent: Run now / the first article
   still writes one (a scheduled run would skip — the news was quiet). */
await firstArticle('Search finds nothing recent, on the first article', () => gem(JSON.stringify({ findings: [] }), [{ web: { uri: 'https://news.example/', title: 'n' } }]), /found nothing recent/);

/* The reviewer's state exactly: Google's grounding quota spent for the day
   (429) and OpenRouter with no credit (402). Last, because it rests both keys. */
await firstArticle('The reviewer\'s state: Google\'s search quota spent, OpenRouter without credit', () => Response.json({ error: { code: 429, message: 'Quota exceeded for quota metric GenerateContent search grounding per day', status: 'RESOURCE_EXHAUSTED' } }, { status: 429 }), /Web research was not available/);

/* What it cost the customer: one AI request per step, one article each. */
const usage = sql.prepare("SELECT meter, COUNT(*) AS n FROM crm_usage WHERE account_id = 'acct-c' GROUP BY meter").all() as { meter: string; n: number }[];
const m = Object.fromEntries(usage.map(u => [u.meter, u.n]));
ok('each first article counted once as an article and once as an AI request', m.blog_articles === 5 && m.ai_requests === 5, m);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
