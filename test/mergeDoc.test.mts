/** DATA-1: two tabs' changes to one document both survive. `npm run test:merge` */
import { mergeDoc } from '../src/services/mergeDoc';
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d: unknown = '') => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c ? '' : ` — ${JSON.stringify(d)}`}`); };
const J = JSON.stringify, P = (s: string | null) => JSON.parse(s ?? 'null');

const base = J([{ id: 'c1', name: 'Ann' }, { id: 'c2', name: 'Bo' }]);
const tabA = J([{ id: 'a', name: 'From A' }, { id: 'c1', name: 'Ann' }, { id: 'c2', name: 'Bo' }]);
const tabB = J([{ id: 'b', name: 'From B' }, { id: 'c1', name: 'Ann' }, { id: 'c2', name: 'Bo' }]);
const m = P(mergeDoc(base, tabB, tabA)) as { id: string }[];
ok('two tabs adding different contacts: both survive', m.some(x => x.id === 'a') && m.some(x => x.id === 'b') && m.length === 4, m);
ok('…newest first, as the list keeps them', m[0].id === 'b');

const edited = J([{ id: 'c1', name: 'Ann Lee' }, { id: 'c2', name: 'Bo' }]);
const removed = J([{ id: 'c1', name: 'Ann' }]);
const m2 = P(mergeDoc(base, edited, removed)) as { id: string; name: string }[];
ok('an edit here and a delete there both apply', m2.length === 1 && m2[0].name === 'Ann Lee', m2);
const m3 = P(mergeDoc(base, removed, edited)) as { id: string }[];
ok('a delete here wins over nothing changed here', m3.length === 1 && m3[0].id === 'c1', m3);
ok('unchanged here takes theirs', mergeDoc(base, base, tabA) === tabA);
ok('unchanged there keeps mine', mergeDoc(base, tabB, base) === tabB);

const s0 = J({ theme: 'light', name: 'X' });
const s1 = P(mergeDoc(s0, J({ theme: 'dark', name: 'X' }), J({ theme: 'light', name: 'Y' })));
ok('settings: each tab\'s own field survives', s1.theme === 'dark' && s1.name === 'Y', s1);
ok('a new key created in both tabs merges', (P(mergeDoc(null, J([{ id: 1 }]), J([{ id: 2 }]))) as unknown[]).length === 2);
ok('text that is not JSON keeps this browser\'s copy', mergeDoc('a', 'b', 'c') === 'b');

/* ── The server's side: a save against a stale copy is refused with the current one ── */
{
  const { DatabaseSync } = await import('node:sqlite');
  const { readdirSync, readFileSync } = await import('node:fs');
  const { handleData } = await import('../worker/src/routes/data');
  const { sessionKey } = await import('../worker/src/lib/db');
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
  const env = { DB: { prepare: (q: string) => new Stmt(q), batch: async (x: Stmt[]) => Promise.all(x.map(y => y.run())) } } as never;
  const now = new Date().toISOString();
  sql.prepare("INSERT INTO crm_users (email, name, role, account_id, hash, created_at) VALUES ('a@x.test', 'A', 'agency', 'acct-m', 'x', ?)").run(now);
  sql.prepare("INSERT INTO crm_workspaces (account_id, owner_email, created_at) VALUES ('acct-m', 'a@x.test', ?)").run(now);
  sql.prepare('INSERT INTO crm_sessions (token, email, expires_at, created_at) VALUES (?, ?, ?, ?)').run(await sessionKey('tok-m'), 'a@x.test', new Date(Date.now() + 3600e3).toISOString(), now);
  const post = (b: Record<string, unknown>) => handleData(new Request('https://x.test/api/data.php', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'tok-m', accountId: 'acct-m', ...b }) }), env).then(r => r.json() as Promise<Record<string, any>>);
  const first = await post({ action: 'bulk_set', items: { crm_contacts: base }, base: { crm_contacts: '' } });
  const seen = first.stamps?.crm_contacts as string;
  ok('a save of a new key returns its stamp', first.success && typeof seen === 'string' && seen.length > 0, first);
  await new Promise(r => setTimeout(r, 5));
  const a = await post({ action: 'bulk_set', items: { crm_contacts: tabA }, base: { crm_contacts: seen } });
  ok('tab A, saving against what it saw, is written', a.success && !a.conflicts && a.stamps?.crm_contacts && a.stamps.crm_contacts !== seen, a);
  const b = await post({ action: 'bulk_set', items: { crm_contacts: tabB }, base: { crm_contacts: seen } });
  ok('tab B, saving against the same stale copy, is refused with A\'s list', b.success && b.conflicts?.crm_contacts?.value === tabA, b);
  const merged = mergeDoc(base, tabB, b.conflicts.crm_contacts.value);
  const again = await post({ action: 'bulk_set', items: { crm_contacts: merged }, base: { crm_contacts: b.conflicts.crm_contacts.updatedAt } });
  const all = await post({ action: 'get_all' });
  const ids = (JSON.parse(all.data.crm_contacts) as { id: string }[]).map(x => x.id);
  ok('…and its merged save keeps both new contacts', again.success && !again.conflicts && ids.includes('a') && ids.includes('b'), ids);
  ok('get_all sends the stamps', typeof all.stamps?.crm_contacts === 'string');
  const old = await post({ action: 'bulk_set', items: { crm_note: '"x"' } });
  ok('a save with no base (an older tab) is still written', old.success && !old.conflicts);
  const put = await post({ action: 'put', key: 'crm_contacts', value: tabB, expectedUpdatedAt: seen });
  ok('put with a stale expectedUpdatedAt reports the conflict', put.conflict === true && typeof put.value === 'string');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
