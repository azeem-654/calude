/**
 * Every AI key the Worker spends is listed, gated and watched.
 *
 * 1. The scan: every file in worker/src that calls an AI client or a
 *    provider's host (lib/aiTools.ts AI_CALL_PATTERNS) has an entry in
 *    AI_CALLERS, and does what the entry says — `aiBudget(env, …)` before the
 *    key, or the same gates inline, or a stated reason it spends nothing of a
 *    customer's allowance. A new caller that skips this fails here (audit F-3).
 * 2. The monitor (lib/aiHealth.ts) on every migration in SQLite: a missing
 *    key, a tool that keeps failing and 80% / 95% of today's free quota are
 *    each reported; the owner is mailed only through lib/deliver.ts, from
 *    support@ with a copy to the second address, once a day per tool and
 *    condition; with no mailbox it says it could not send and sends nothing.
 * 3. The owner's route: anybody else is refused, and no key appears in it.
 *
 * `npm run test:ai-keys`
 */
import { DatabaseSync } from 'node:sqlite';
import { register } from 'node:module';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { AI_CALLERS, AI_CALL_PATTERNS, AI_TOOLS, toolForModule } from '../worker/src/lib/aiTools';
import { MODULES } from '../worker/src/lib/aiTasks';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d: unknown = '') => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c ? '' : ` — ${JSON.stringify(d).slice(0, 500)}`}`); };

/* ── 1 · The scan ─────────────────────────────────────────────────────── */
console.log('Every AI caller is listed and gated');
const SRC = new URL('../worker/src/', import.meta.url).pathname;
const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []; });
const files = walk(SRC).map(p => relative(SRC, p).split('\\').join('/'));
const text = new Map(files.map(f => [f, readFileSync(join(SRC, f), 'utf8')]));
const calling = files.filter(f => AI_CALL_PATTERNS.some(re => re.test(text.get(f)!)));

const unlisted = calling.filter(f => !AI_CALLERS[f]);
ok('every file that calls an AI provider is in lib/aiTools.ts AI_CALLERS', !unlisted.length, unlisted);
const stale = Object.keys(AI_CALLERS).filter(f => !existsSync(join(SRC, f)) || !calling.includes(f));
ok('…and every entry there still is one (no stale entries)', !stale.length, stale);

const toolIds = new Set(AI_TOOLS.map(t => t.id));
const badTools = Object.entries(AI_CALLERS).filter(([, c]) => c.tools.some(t => !toolIds.has(t))).map(([f]) => f);
ok('every caller names tools that exist', !badTools.length, badTools);
const unused = AI_TOOLS.filter(t => !Object.values(AI_CALLERS).some(c => c.tools.includes(t.id))).map(t => t.id);
ok('every tool has a file that uses it', !unused.length, unused);

const noBudget = Object.entries(AI_CALLERS).filter(([f, c]) => c.gate === 'aiBudget' && !/\baiBudget\s*\(\s*env\b/.test(text.get(f) ?? '')).map(([f]) => f);
ok('a file listed as gated by aiBudget() calls it', !noBudget.length, noBudget);
const noInline = Object.entries(AI_CALLERS).filter(([f, c]) => c.gate === 'inline' && !(/\bcapRefusal\s*\(/.test(text.get(f) ?? '') && /\btrialRefusal\s*\(/.test(text.get(f) ?? '') && /'ai_requests'/.test(text.get(f) ?? ''))).map(([f]) => f);
ok('an inline gate applies all three: caps, ended trial, monthly AI requests', !noInline.length, noInline);
const unexplained = Object.entries(AI_CALLERS).filter(([, c]) => (c.gate === 'exempt' || c.gate === 'caller') && (c.why ?? '').length < 40).map(([f]) => f);
ok('an exemption or a hand-off says why, in a sentence', !unexplained.length, unexplained);
const orphanCaller = Object.entries(AI_CALLERS).filter(([, c]) => c.gate === 'caller' && !(c.from?.length && c.from.every(f => AI_CALLERS[f] && AI_CALLERS[f].gate !== 'caller'))).map(([f]) => f);
ok('a file handed its key names callers that are themselves gated', !orphanCaller.length, orphanCaller);
const providers = Object.entries(AI_CALLERS).filter(([, c]) => c.gate === 'provider').map(([f]) => f).sort();
ok('only the two clients are providers', providers.join() === 'lib/ai.ts,lib/openrouter.ts', providers);
/* The model is never chosen in code (CLAUDE.md): no Gemini id in a caller. */
const pinned = calling.filter(f => !['lib/ai.ts', 'lib/aiTasks.ts', 'lib/openrouter.ts'].includes(f) && /['"`]gemini-\d/.test(text.get(f)!));
ok('no caller hard-codes a model id', !pinned.length, pinned);
const orphanModules = Object.keys(MODULES).filter(m => !toolIds.has(toolForModule(m)));
ok('every usage module is counted under a tool', !orphanModules.length, orphanModules);

/* ── 2 · The monitor, on a database ───────────────────────────────────── */
console.log('The AI health monitor');
const sql = new DatabaseSync(':memory:');
const mig = new URL('../worker/migrations/', import.meta.url);
for (const f of readdirSync(mig).filter(f => f.endsWith('.sql')).sort()) sql.exec(readFileSync(new URL(f, mig), 'utf8'));
const norm = (a: unknown[]) => a.map(v => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v)) as (string | number | null)[];
class Stmt {
  constructor(private q: string, private a: unknown[] = []) {}
  bind(...a: unknown[]) { return new Stmt(this.q, a); }
  async first<T>() { return (sql.prepare(this.q).get(...norm(this.a)) ?? null) as T | null; }
  async all<T>() { return { results: sql.prepare(this.q).all(...norm(this.a)) as T[] }; }
  async run() { const r = sql.prepare(this.q).run(...norm(this.a)); return { meta: { changes: Number(r.changes) } }; }
}
const DB = { prepare: (q: string) => new Stmt(q), batch: async (x: Stmt[]) => Promise.all(x.map(y => y.run())) };
const KEY = 'AIzaMonitorTestKey1234567890abcdefghij';
const MAIL_KEY = 're_mailbox_provider_key_for_tests';
const env = { DB, APP_ORIGIN: 'https://app.example' } as Record<string, unknown>;

/* lib/deliver.ts reaches lib/smtp.ts, which imports the Workers runtime's
   sockets; Node has none. A stand-in that refuses — only the provider (API)
   path is used below, and an SMTP attempt would fail loudly. */
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, n) {
  if (s === 'cloudflare:sockets') return { url: 'data:text/javascript,export function connect(){throw new Error("no sockets in tests")}', shortCircuit: true };
  return n(s, c);
}`));
const { checkAiTools, runAiHealth, ALERT_TO, ALERT_COPY, ALERT_FROM } = await import('../worker/src/lib/aiHealth');
const { noteTool, resetToolNotes } = await import('../worker/src/lib/aiToolHealth');
const { adoptAiBase } = await import('../worker/src/lib/ai');
const { forgetPool, fingerprint } = await import('../worker/src/lib/aiPool');
const { encryptSecret } = await import('../worker/src/lib/crypto');
const { installSecret, sessionKey } = await import('../worker/src/lib/db');
const { handleAiHealth } = await import('../worker/src/routes/aiHealth');

const now = new Date().toISOString();
sql.prepare("INSERT INTO crm_users (email, name, role, account_id, hash, created_at) VALUES ('owner@pc.test', 'Owner', 'agency', NULL, 'x', ?)").run(now);
sql.prepare("INSERT INTO crm_workspaces (account_id, owner_email, created_at) VALUES ('acct-owner', 'owner@pc.test', ?)").run(now);
sql.prepare("INSERT INTO crm_users (email, name, role, account_id, hash, created_at) VALUES ('cust@pc.test', 'Cust', 'agency', 'acct-c', 'x', ?)").run(now);
sql.prepare("INSERT INTO crm_workspaces (account_id, owner_email, created_at) VALUES ('acct-c', 'cust@pc.test', ?)").run(now);

/* Every provider send is caught here; nothing reaches the network. */
const sends: { to: string; from: string; subject: string }[] = [];
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === 'https://api.resend.com/emails') {
    const b = JSON.parse(String(init?.body ?? '{}')) as { to: string | string[]; from: string; subject: string };
    sends.push({ to: [b.to].flat().join(','), from: b.from, subject: b.subject });
    return Response.json({ id: `re-${sends.length}` });
  }
  return new Response('not stubbed', { status: 599 });
}) as typeof fetch;
const alerts = () => sql.prepare('SELECT tool, condition, sent_at, outcome FROM crm_ai_alerts ORDER BY tool, condition').all() as { tool: string; condition: string; sent_at: string | null; outcome: string }[];
const tool = (t: Awaited<ReturnType<typeof checkAiTools>>, id: string) => t.find(x => x.id === id)!;

{
  const t = await checkAiTools(env as never);
  ok('with no keys at all, writing, search and Maps say "missing key"', ['text', 'search', 'vision', 'video_watch', 'places', 'transcription'].every(id => tool(t, id).state === 'missing_key'), t.map(x => [x.id, x.state]));
  ok('…the optional voice tools are shown missing but not mailed', tool(t, 'speech').state === 'missing_key' && !tool(t, 'speech').conditions.length && tool(t, 'text').conditions.includes('missing_key'));
  const r = await runAiHealth(env as never);
  ok('with no mailbox, nothing is sent and the run says why', !r.sent && r.due > 0 && /no validated mailbox/.test(r.detail) && sends.length === 0, r);
  ok('…each condition is recorded as not sent, with no sent stamp', alerts().length === r.due && alerts().every(a => a.outcome === 'not_sent' && a.sent_at === null), alerts());
  const again = await runAiHealth(env as never);
  ok('the hourly gate holds between cron ticks', !again.ran, again);
  const forced = await runAiHealth(env as never, { force: true });
  ok('…and an unsent alert is tried again rather than marked done', forced.due === r.due && !forced.sent, forced);
}

/* A validated support@ mailbox (a Resend key) in the owner's workspace. */
{
  const blob = await encryptSecret(await installSecret(DB as never, 'mailbox_key'), MAIL_KEY);
  sql.prepare(`INSERT INTO crm_mailbox_accounts (id, account_id, label, from_name, from_email, provider, provider_key, out_verified_at, is_primary, created_at, updated_at)
    VALUES ('mb-support', 'acct-owner', 'Support', 'Protected Central', ?, 'resend', ?, ?, 1, ?, ?)`).run(ALERT_FROM, blob, now, now, now);
  const r = await runAiHealth(env as never, { force: true });
  ok('the alert goes through deliver: to the owner and a second copy to the other address', r.sent && sends.length === 2 && sends[0].to === ALERT_TO && sends[1].to === ALERT_COPY, sends);
  ok('…from support@', sends.every(s => s.from.includes(ALERT_FROM)), sends);
  ok('…one mail naming every new problem, each stamped sent', alerts().every(a => a.sent_at && a.outcome === 'sent') && /AI health/.test(sends[0].subject), alerts());
  const n = sends.length;
  await runAiHealth(env as never, { force: true });
  ok('the same tool and condition is not mailed again within a day', sends.length === n, sends.length);
}

/* The install's Google key, and today's use of it. */
{
  env.AI_API_KEY = KEY;
  forgetPool();
  adoptAiBase(env as never);
  const fp = await fingerprint(KEY);
  const use = (model: string, n: number) => sql.prepare(`INSERT INTO crm_ai_usage (day, provider, key_fp, model, module, account_id, requests, ok, limited, updated_at)
    VALUES (?, 'gemini', ?, ?, 'autopilot', 'acct-c', ?, ?, 0, ?)
    ON CONFLICT(day, provider, key_fp, model, module, account_id) DO UPDATE SET requests = excluded.requests, ok = excluded.ok`).run(now.slice(0, 10), fp, model, n, n, now);
  let t = await checkAiTools(env as never);
  ok('with a key, writing is configured and its key named by label only', tool(t, 'text').key.configured && !JSON.stringify(t).includes(KEY), tool(t, 'text').key);
  use('gemini-2.5-flash-lite', 420);   // 420 of Flash-Lite's 500 free a day
  t = await checkAiTools(env as never);
  ok('84% of today\'s free requests is "near quota", the 80% alert', tool(t, 'text').state === 'near_quota' && tool(t, 'text').conditions.includes('quota80'), tool(t, 'text'));
  use('gemini-2.5-flash-lite', 480);
  t = await checkAiTools(env as never);
  ok('96% raises the 95% alert instead', tool(t, 'text').conditions.includes('quota95') && !tool(t, 'text').conditions.includes('quota80'), tool(t, 'text').conditions);
  use('gemini-2.5-flash-lite', 900);
  t = await checkAiTools(env as never);
  ok('a key that served more than the free figure is paid, and not "near quota"', tool(t, 'text').state === 'ok' && !tool(t, 'text').quota, tool(t, 'text'));

  resetToolNotes();
  for (let i = 0; i < 3; i++) await noteTool('search', false, `429: quota exhausted for ${KEY} at https://x.test/?key=${KEY}`);
  t = await checkAiTools(env as never);
  ok('three failures in a row with no success: "failing"', tool(t, 'search').state === 'failing' && tool(t, 'search').conditions.includes('failing'), tool(t, 'search'));
  ok('…and the stored reason has no key in it', !tool(t, 'search').lastError.includes('AIza') && /\[key\]/.test(tool(t, 'search').lastError), tool(t, 'search').lastError);
  const before = sends.length;
  const r = await runAiHealth(env as never, { force: true });
  ok('a newly failing tool is mailed, the ones already mailed today are not', r.sent && sends.length === before + 2 && /Web research/.test(sends[before].subject), { r, s: sends.slice(before) });
  await noteTool('search', true);
  t = await checkAiTools(env as never);
  ok('one success ends the streak', tool(t, 'search').state !== 'failing' && tool(t, 'search').failStreak === 0, tool(t, 'search'));
}

/* ── 3 · The owner's route ────────────────────────────────────────────── */
console.log('The owner\'s route');
{
  const exp = new Date(Date.now() + 3600e3).toISOString();
  sql.prepare('INSERT INTO crm_sessions (token, email, expires_at, created_at) VALUES (?, ?, ?, ?)').run(await sessionKey('tok-owner'), 'owner@pc.test', exp, now);
  sql.prepare('INSERT INTO crm_sessions (token, email, expires_at, created_at) VALUES (?, ?, ?, ?)').run(await sessionKey('tok-cust'), 'cust@pc.test', exp, now);
  const ask = (token: string, action = 'status') => handleAiHealth(new Request('https://x.test/api/ai-health.php', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, action }) }), env as never);
  const cust = await ask('tok-cust');
  ok('a customer (a sub-account) is refused', cust.status === 403 && (await cust.json() as { code?: string }).code === 'not_owner');
  const none = await ask('nope');
  ok('no session is refused', none.status === 401);
  const own = await ask('tok-owner');
  const body = await own.text();
  const j = JSON.parse(body) as { success: boolean; tools: { id: string; state: string }[]; alerts: unknown[]; recipients: { to: string } };
  ok('the owner gets every tool with a state', own.status === 200 && j.success && j.tools.length === AI_TOOLS.length && j.tools.every(t => ['ok', 'missing_key', 'failing', 'near_quota'].includes(t.state)), j.tools);
  ok('…and the answer holds no key material at all', !body.includes(KEY) && !body.includes(MAIL_KEY) && !/AIza[0-9A-Za-z_-]{10,}|sk-or-[\w-]{8,}|re_[\w]{10,}/.test(body), body.slice(0, 300));
  const run = await ask('tok-owner', 'run');
  ok('"Check now" runs the check for the owner', run.status === 200 && (await run.json() as { run?: { ran: boolean } }).run?.ran === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
