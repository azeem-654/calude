/**
 * D-3: once SPF, DKIM and DMARC are found for a domain, the sending-pool
 * planner sees it as authenticated and plans its mailboxes. A lookup that
 * could not run proves nothing. `npm run test:poolauth`
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { handleInfra } from '../worker/src/routes/infra';
import { poolState } from '../worker/src/lib/poolState';
const readPool = (env: never, a: string) => poolState(env, a, []);
import { planPool } from '../worker/src/lib/sendingPool';
import { sessionKey } from '../worker/src/lib/db';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d: unknown = '') => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c ? '' : ` — ${JSON.stringify(d).slice(0, 300)}`}`); };
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
sql.prepare("INSERT INTO crm_users (email, name, role, account_id, hash, created_at) VALUES ('a@x.test', 'A', 'agency', 'acct-p', 'x', ?)").run(now);
sql.prepare("INSERT INTO crm_workspaces (account_id, owner_email, created_at) VALUES ('acct-p', 'a@x.test', ?)").run(now);
sql.prepare('INSERT INTO crm_sessions (token, email, expires_at, created_at) VALUES (?, ?, ?, ?)').run(await sessionKey('tok-p'), 'a@x.test', new Date(Date.now() + 3600e3).toISOString(), now);

/* Public DNS, stubbed: D has all three; E has no DMARC; F cannot be asked. */
const TXT: Record<string, string[]> = {
  'd.test': ['v=spf1 include:_spf.example ~all'], '_dmarc.d.test': ['v=DMARC1; p=none'], 'default._domainkey.d.test': ['v=DKIM1; k=rsa; p=MIIB'],
  'e.test': ['v=spf1 ~all'], 'default._domainkey.e.test': ['v=DKIM1; p=MIIB'],
};
globalThis.fetch = (async (u: string | URL | Request) => {
  const url = new URL(String(u instanceof Request ? u.url : u));
  const name = url.searchParams.get('name') ?? '';
  if (name.endsWith('f.test')) return new Response('down', { status: 503 });
  return Response.json({ Answer: (TXT[name] ?? []).map(data => ({ data: `"${data}"`, type: 16 })) });
}) as typeof fetch;

const check = (domain: string) => handleInfra(new Request('https://x.test/api/infra.php', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'tok-p', accountId: 'acct-p', action: 'dns_records', domain, dkimValue: 'v=DKIM1; k=rsa; p=MIIB', spfInclude: '_spf.example' }) }), env).then(r => r.json() as Promise<Record<string, unknown>>);
const target = { domains: 3, mailboxesPerDomain: 2 };
for (const dm of ['d.test', 'e.test', 'f.test']) sql.prepare("INSERT INTO crm_provisioned (id, account_id, kind, subject, provider, outcome, detail, created_at) VALUES (?, 'acct-p', 'domain', ?, 'porkbun', 'ok', '', ?)").run(`p-${dm}`, dm, now);
const before = planPool(await readPool(env, 'acct-p'), target);
ok('before any check, no domain gets mailboxes', !before.some(s => s.type === 'create_mailboxes'), before);
const rd = await check('d.test'); const re = await check('e.test'); const rf = await check('f.test');
ok('a domain with SPF, DKIM and DMARC found is reported authenticated', rd.authenticated === true && re.authenticated === false && rf.authenticated === false, [rd.authenticated, re.authenticated, rf.authenticated]);
const pool = await readPool(env, 'acct-p');
const after = planPool(pool, target);
const mb = after.find(s => s.type === 'create_mailboxes') as { domains?: string[] } | undefined;
ok('…and the planner then plans mailboxes for it', !!mb && JSON.stringify(mb).includes('d.test'), after);
ok('…not for one missing DMARC, nor one whose lookup failed', !JSON.stringify(mb ?? {}).includes('e.test') && !JSON.stringify(mb ?? {}).includes('f.test') && pool.authenticated.join() === 'd.test', pool.authenticated);
await check('d.test');
ok('checking again records it once', (sql.prepare("SELECT COUNT(*) AS n FROM crm_provisioned WHERE kind = 'dns' AND subject = 'd.test'").get() as { n: number }).n === 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
