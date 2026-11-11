/**
 * F-2: a due scheduled agent runs however many other workflows exist.
 * `npm run test:fairness`
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { runProjectAgents } from '../worker/src/lib/projectAgents';

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
sql.prepare("INSERT INTO crm_projects (id, account_id, name, created_at, updated_at) VALUES ('pj', 'acct-f', 'P', ?, ?)").run(now, now);
const wf = (id: string, nodes: unknown[], last: string | null = null) =>
  sql.prepare("INSERT INTO crm_project_workflows (id, account_id, project_id, name, nodes, status, last_run_at, created_at, updated_at) VALUES (?, 'acct-f', 'pj', ?, ?, 'active', ?, ?, ?)")
    .run(id, id, JSON.stringify(nodes), last, now, now);
for (let i = 0; i < 250; i++) wf(`tag-${String(i).padStart(3, '0')}`, [{ id: 't', type: 'trigger', config: { event: 'tag_added' } }, { id: 'a', type: 'ai', config: { produces: 'social' } }]);
/* 250 weekly schedules that ran yesterday: candidates, never due. */
const yesterday = new Date(Date.now() - 26 * 3600e3).toISOString();
for (let i = 0; i < 250; i++) wf(`wk-${String(i).padStart(3, '0')}`, [{ id: 't', type: 'trigger', config: { event: 'schedule', cadence: 'weekly' } }, { id: 'a', type: 'ai', config: { produces: 'social' } }], new Date(Date.now() - 30 * 3600e3).toISOString());
wf('zz-due', [{ id: 't', type: 'trigger', config: { event: 'schedule', cadence: 'daily' } }], yesterday);

const r = await runProjectAgents(env);
const stamped = (sql.prepare("SELECT last_run_at AS at FROM crm_project_workflows WHERE id = 'zz-due'").get() as { at: string }).at;
ok('with 250 tag workflows and 250 weekly ones not due, the due daily schedule is reached in one tick', stamped > yesterday, { stamped, r });
ok('…and no tag workflow was touched', (sql.prepare("SELECT COUNT(*) AS n FROM crm_project_workflows WHERE id LIKE 'tag-%' AND last_run_at IS NOT NULL").get() as { n: number }).n === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
