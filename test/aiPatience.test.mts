/**
 * A busy AI is waited out, not shown as an error.
 *
 * 1. The server marks every busy refusal — fail(AI_BUSY), a route's own
 *    sentence around it, code 'ai_busy' — with X-AI-Busy, and nothing else.
 * 2. The page (src/services/aiPatience.ts) asks again when the header says,
 *    hands the screen the answer that worked, shows the wait while it lasts,
 *    turns a long rest into "paused", and lets "Stop waiting" and a caller's
 *    own signal end it. Requests it cannot replay, and non-API paths, pass
 *    straight through.
 *
 * `npm run test:patience`
 */
import { fail as refuse, json, ok as okRes } from '../worker/src/lib/http';
import { AI_BUSY } from '../worker/src/lib/ai';
import { retryable, watchWrites, writtenTables } from '../worker/src/lib/writeWatch';

let pass = 0, failed = 0;
const ok = (n: string, c: boolean, d: unknown = '') => { if (c) pass++; else failed++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c ? '' : ` — ${JSON.stringify(d).slice(0, 300)}`}`); };

console.log('The server marks busy refusals');
ok('fail(AI_BUSY) carries X-AI-Busy', refuse(AI_BUSY).headers.get('X-AI-Busy') !== null);
ok('a sentence around it does too', refuse(`Could not write that: ${AI_BUSY}`).headers.get('X-AI-Busy') !== null);
ok("code 'ai_busy' does too", refuse('The AI took too long.', 200, { code: 'ai_busy' }).headers.get('X-AI-Busy') !== null);
ok('another refusal does not', refuse('Pick a date.').headers.get('X-AI-Busy') === null);
ok('a success with the sentence inside does not', okRes({ note: AI_BUSY }).headers.get('X-AI-Busy') === null);
ok('json success:false with it does', json({ success: false, error: AI_BUSY }).headers.get('X-AI-Busy') !== null);
ok('the header is exposed to a cross-origin page', /X-AI-Busy/.test(refuse('x').headers.get('Access-Control-Expose-Headers') ?? ''));

console.log('A request that saved something is never marked for retry');
ok('an insert counts', writtenTables('INSERT INTO crm_contacts (id) VALUES (?)').join() === 'crm_contacts');
ok('upsert, update, delete and replace count', writtenTables('INSERT OR REPLACE INTO crm_a VALUES (1); UPDATE crm_b SET x=1; DELETE FROM crm_c; REPLACE INTO crm_d VALUES (1)').join() === 'crm_a,crm_b,crm_c,crm_d');
ok('a read does not', writtenTables('SELECT * FROM crm_contacts WHERE id = ?').length === 0);
ok('the AI unit taken and given back does not', writtenTables("DELETE FROM crm_usage WHERE rowid = (SELECT rowid FROM crm_usage)").length === 0);
ok('rate limits, key health and AI usage do not', writtenTables('INSERT INTO crm_rate_limits VALUES (1); INSERT INTO crm_ai_key_health VALUES (1); INSERT INTO crm_ai_usage VALUES (1)').length === 0);
const fakeDb = { prepare: (sql: string) => ({ sql, bind() { return this; }, run: async () => ({}) }), exec: async () => ({}), batch: async () => [] };
const env = { DB: fakeDb, APP_ORIGIN: 'x' } as unknown as Parameters<typeof watchWrites>[0];
const w1 = watchWrites(env);
await (w1.env.DB.prepare('INSERT INTO crm_usage (id) VALUES (?)').bind('u') as unknown as { run(): Promise<unknown> }).run();
ok('bookkeeping alone keeps the mark', retryable(refuse(AI_BUSY), w1, '/api/x.php').headers.get('X-AI-Busy') !== null);
ok('the rest of env is untouched', (w1.env as unknown as { APP_ORIGIN: string }).APP_ORIGIN === 'x' && typeof w1.env.DB.batch === 'function');
const w2 = watchWrites(env);
w2.env.DB.prepare('INSERT INTO crm_blog_posts (id) VALUES (?)');
const stripped = retryable(refuse(AI_BUSY), w2, '/api/x.php');
ok('a saved row removes the mark', stripped.headers.get('X-AI-Busy') === null && w2.wrote.has('crm_blog_posts'));
ok('…and the answer is otherwise the same', (await stripped.json() as { error?: string }).error === AI_BUSY);
const w3 = watchWrites(env);
w3.env.DB.prepare('UPDATE crm_contacts SET x = 1');
ok('an answer that was not busy is left alone', retryable(okRes({}), w3, '/api/x.php').headers.get('X-AI-Busy') === null);

/* ── 2 · The page ── */
console.log('The page waits it out');
let script: Response[] = [];
let calls = 0;
const busy = (sec: string) => new Response(JSON.stringify({ success: false, error: AI_BUSY }), { headers: { 'X-AI-Busy': sec } });
const good = () => new Response(JSON.stringify({ success: true, text: 'done' }));
const g = globalThis as unknown as Record<string, unknown>;
const unload: ((e: { preventDefault(): void; returnValue: string }) => void)[] = [];
g.location = { href: 'https://app.example.com/dashboard' };
g.window = {
  fetch: async () => { calls++; return script.shift() ?? good(); },
  addEventListener: (t: string, f: (e: { preventDefault(): void; returnValue: string }) => void) => { if (t === 'beforeunload') unload.push(f); },
};
const P = await import('../src/services/aiPatience');
P.installAiPatience();
const f = (g.window as { fetch: typeof fetch }).fetch;
const post = (body = '{"a":1}', extra: RequestInit = {}) => f('/api/aiwrite.php', { method: 'POST', body, ...extra });

script = [busy('1')]; calls = 0;
const t0 = Date.now();
const pending = post();
await new Promise(r => setTimeout(r, 200));
ok('while it waits, the bar has it', P.patienceSnapshot().length === 1 && !P.patienceSnapshot()[0].paused, P.patienceSnapshot());
let blocked = false;
unload.forEach(h => h({ preventDefault: () => { blocked = true; }, returnValue: '' }));
ok('leaving the page asks first', blocked);
const r1 = await pending;
ok('the answer that worked reaches the screen', (await r1.json() as { text?: string }).text === 'done');
ok('asked twice, after the rest', calls === 2 && Date.now() - t0 >= 3_500, { calls, ms: Date.now() - t0 });
ok('the bar is empty again', P.patienceSnapshot().length === 0);

script = [busy('7200')]; calls = 0;
const longWait = post();
await new Promise(r => setTimeout(r, 100));
ok('a daily-quota rest is a pause', P.patienceSnapshot()[0]?.paused === true, P.patienceSnapshot());
ok('checked again within five minutes', (P.patienceSnapshot()[0]?.nextAt ?? 0) - Date.now() <= 5 * 60_000 + 50);
P.stopAllWaiting();
const r2 = await longWait;
ok('Stop waiting hands back the busy answer', r2.headers.get('X-AI-Busy') === '7200' && calls === 1);

script = [busy('60')]; calls = 0;
const ac = new AbortController();
const aborted = post('{}', { signal: ac.signal });
await new Promise(r => setTimeout(r, 50));
ac.abort();
ok("the caller's own signal ends the wait", await aborted.then(() => false, () => true));
ok('and the bar lets go', P.patienceSnapshot().length === 0);

script = [busy('1')]; calls = 0;
const notApi = await f('/assets/x.json', { method: 'POST', body: '{}' });
ok('a path outside the API passes through', notApi.headers.get('X-AI-Busy') === '1' && calls === 1);
script = [busy('1')]; calls = 0;
const stream = await f('/api/aiwrite.php', { method: 'POST', body: new Blob(['x']) });
ok('a body that cannot be sent again passes through', stream.headers.get('X-AI-Busy') === '1' && calls === 1);
script = [good()]; calls = 0;
await post();
ok('an answer that is not busy is untouched', calls === 1);

console.log(`\n${pass} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
