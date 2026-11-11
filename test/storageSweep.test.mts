/**
 * Stored files (W-5, T-3): a browser's upload link stores one named file
 * within its size; a closed workspace's files are deleted by the queued job;
 * the daily sweep deletes files no row owns, and keeps everything else.
 *
 *   npm run test:storage
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { queuePurge, runStoragePurges, sweepOrphans } from '../worker/src/lib/storageSweep';
import { closeWorkspace } from '../worker/src/lib/closeWorkspace';
import { sign } from '../worker/src/lib/video/store';
import { handleVideoFile } from '../worker/src/routes/videoFile';

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
const DB = { prepare: (q: string) => new Stmt(q), batch: async (s: Stmt[]) => Promise.all(s.map(x => x.run())) };

/* An R2 bucket in memory: the calls these files make. */
const objects = new Map<string, { size: number; uploaded: Date }>();
let mpuStarted = 0;
const VIDEO = {
  async list({ prefix = '', cursor, limit = 1000 }: { prefix?: string; cursor?: string; limit?: number }) {
    const keys = [...objects.keys()].filter(k => k.startsWith(prefix)).sort();
    const from = cursor ? Number(cursor) : 0;
    const page = keys.slice(from, from + limit);
    return { objects: page.map(key => ({ key, ...objects.get(key)! })), truncated: from + limit < keys.length, cursor: String(from + limit) };
  },
  async delete(k: string | string[]) { for (const x of Array.isArray(k) ? k : [k]) objects.delete(x); },
  async put(key: string, body: ReadableStream | Uint8Array) {
    let size = 0;
    if (body instanceof Uint8Array) size = body.length;
    else { const r = body.getReader(); for (;;) { const { done, value } = await r.read(); if (done) break; size += value.length; } }
    objects.set(key, { size, uploaded: new Date() });
    return { key };
  },
  async createMultipartUpload() { mpuStarted++; return { uploadId: 'u1' }; },
  resumeMultipartUpload() { return { abort: async () => undefined, uploadPart: async () => ({ etag: 'e' }), complete: async () => undefined }; },
};
const env = { DB, VIDEO } as never;
const old = new Date(Date.now() - 3 * 86_400_000);
const put = (k: string, when = old) => objects.set(k, { size: 10, uploaded: when });
(globalThis as { FixedLengthStream?: unknown }).FixedLengthStream ??= class { readable: ReadableStream; writable: WritableStream; constructor() { const t = new TransformStream(); this.readable = t.readable; this.writable = t.writable; } };

/* ── W-5: a browser's link ── */
console.log('A browser upload link');
const prefix = 'v/acct-a/media/med_00000000000000000000/';
const t = await sign(env, { a: 'acct-a', k: prefix, m: 'put', n: ['file.png'], b: 15 * 1024 * 1024 }, 1800);
const ctx = { waitUntil() { /* */ } } as never;
const req = (q: string, method: string, bytes: number) => new Request(`https://x/api/video-file.php?t=${t}${q}`, { method, headers: { 'content-length': String(bytes) }, body: method === 'PUT' ? new Uint8Array(bytes) : undefined, duplex: 'half' } as RequestInit);
const other = await handleVideoFile(req('&name=other.png', 'PUT', 100), env, ctx);
ok('another file name under the same prefix is refused', other.status === 403);
const mpu = await handleVideoFile(req('&name=file.png&op=mpu-start', 'POST', 0), env, ctx);
ok('a multipart upload through a media grant is refused', mpu.status === 413 && mpuStarted === 0);
const big = await handleVideoFile(req('&name=file.png', 'PUT', 40 * 1024 * 1024), env, ctx);
ok('a 40 MB file through a media grant is refused', big.status === 413 && !objects.has(`${prefix}file.png`));
const fits = await handleVideoFile(req('&name=file.png', 'PUT', 1000), env, ctx);
ok('…and its own picture, within the size, is stored', fits.status === 200 && objects.has(`${prefix}file.png`));
const tEngine = await sign(env, { a: 'acct-a', k: 'v/acct-a/vp-00000000-0000-0000-0000-000000000000/out/', m: 'put' }, 1800);
const eng = await handleVideoFile(new Request(`https://x/api/video-file.php?t=${tEngine}&name=render.mp4&op=mpu-start`, { method: 'POST' }), env, ctx);
ok('the engine\'s own grant still uploads in parts', eng.status === 200 && mpuStarted === 1);

/* ── W-5: the daily sweep ── */
console.log('The orphan sweep');
objects.clear();
const MED_KEPT = 'v/acct-a/media/med_11111111111111111111/file.png';
const MED_ORPHAN = 'v/acct-a/media/med_22222222222222222222/file.png';
const MED_FRESH = 'v/acct-a/media/med_33333333333333333333/file.png';
const PROJ = 'vp-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', GONE = 'vp-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
put(MED_KEPT); put(MED_ORPHAN); put(MED_FRESH, new Date());
put(`v/acct-a/${PROJ}/source.mp4`); put(`v/acct-a/${GONE}/source.mp4`); put(`v/acct-a/${GONE}/out/o1/final.mp4`);
put('v/acct-a/brand/logo-abc.png'); put('v/acct-a/music/ov-1/track.mp3');
sql.prepare("INSERT INTO crm_media_assets (id, account_id, kind, name, r2_key, mime, bytes, width, height, design_id, source, created_by, created_at) VALUES ('med_11111111111111111111','acct-a','upload','x',?,'image/png',10,1,1,'','{}','',?)").run(MED_KEPT, old.toISOString());
sql.prepare("INSERT INTO crm_video_projects (id, account_id, name, status, stage, doc, created_by, created_at, updated_at) VALUES (?, 'acct-a', 'p', 'draft', '', '{}', '', ?, ?)").run(PROJ, old.toISOString(), old.toISOString());
const s1 = await sweepOrphans(env, { pages: 10 });
ok('an uncommitted picture over a day old is deleted', !objects.has(MED_ORPHAN), [...objects.keys()]);
ok('a deleted project\'s folder is deleted', !objects.has(`v/acct-a/${GONE}/source.mp4`) && !objects.has(`v/acct-a/${GONE}/out/o1/final.mp4`));
ok('a committed picture, a live project, a fresh upload, brand and music are kept', objects.has(MED_KEPT) && objects.has(`v/acct-a/${PROJ}/source.mp4`) && objects.has(MED_FRESH) && objects.has('v/acct-a/brand/logo-abc.png') && objects.has('v/acct-a/music/ov-1/track.mp3'));
ok('the pass finished and reported three', s1.ran && s1.done && s1.deleted === 3, s1);
ok('…and waits a day before the next', !(await sweepOrphans(env)).ran);

/* ── T-3: closing a workspace ── */
console.log('Closing a workspace');
objects.clear();
for (let i = 0; i < 1500; i++) put(`v/acct-c/${PROJ}/f${i}`);
put('booking/acct-c/clip1'); put('mail/acct-c/m1/x.eml'); put('v/acct-cc/keep.png'); put('v/acct-d/keep.png');
sql.prepare("INSERT INTO crm_workspaces (account_id, owner_email, created_at) VALUES ('acct-c', 'c@x.test', ?)").run(old.toISOString());
await closeWorkspace(env, 'acct-c');
const queued = sql.prepare("SELECT COUNT(*) AS n FROM crm_storage_purges WHERE workspace = 'acct-c'").get() as { n: number };
ok('its prefixes are queued, and survive the workspace\'s own deletion', queued.n === 3);
ok('the first pass is bounded', [...objects.keys()].some(k => k.startsWith('v/acct-c/')));
await runStoragePurges(env);
const left = [...objects.keys()].filter(k => k.startsWith('v/acct-c/') || k.startsWith('booking/acct-c/') || k.startsWith('mail/acct-c/'));
ok('after the cron, storage lists nothing under its prefixes', left.length === 0, left.slice(0, 3));
ok('…and each prefix is stamped done', (sql.prepare("SELECT COUNT(*) AS n FROM crm_storage_purges WHERE workspace = 'acct-c' AND done_at IS NOT NULL").get() as { n: number }).n === 3);
ok('a workspace whose id merely starts the same is untouched', objects.has('v/acct-cc/keep.png') && objects.has('v/acct-d/keep.png'));
await queuePurge(env, '../etc');
ok('an id with a path in it queues nothing', (sql.prepare("SELECT COUNT(*) AS n FROM crm_storage_purges WHERE workspace = '../etc'").get() as { n: number }).n === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
