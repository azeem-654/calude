/**
 * Stored files that nothing points to any more — deleted on a schedule.
 *
 * Two jobs, both on the 5-minute cron and both bounded per run so a large
 * bucket cannot hold the tick past its time:
 *
 *   purges   a closed workspace's prefixes (T-3), queued by closeWorkspace in
 *            crm_storage_purges and worked through until each lists empty.
 *   orphans  once a day (W-5), objects older than a day that no row owns: a
 *            Media Center upload that was never committed, and a Video Studio
 *            project's folder whose project is gone. Anything else under a
 *            workspace (brand/, music/, a folder this code does not recognise)
 *            is left alone — deleting a file somebody needs is far worse than
 *            keeping one nobody does.
 */
import { metaGet, metaPut, nowIso, type Env } from './db';
import { workspacePrefix } from './video/store';

/** Where a workspace keeps files: Video Studio and media, booking clips, hosted mail. */
export function storagePrefixes(accountId: string): string[] {
  const id = String(accountId ?? '').trim();
  if (!id || id.includes('/') || id.includes('..')) return [];
  return [workspacePrefix(id), `booking/${id}/`, `mail/${id}/`];
}

const PREFIX_OK = /^(v|booking|mail)\/[^/]+\/$/;

/** Queue a closed workspace's files for deletion. Idempotent. */
export async function queuePurge(env: Env, accountId: string): Promise<void> {
  const now = nowIso();
  const rows = storagePrefixes(accountId).filter(p => PREFIX_OK.test(p) && p !== 'v//');
  if (!rows.length) return;
  await env.DB.batch(rows.map(p => env.DB.prepare(
    'INSERT INTO crm_storage_purges (prefix, workspace, created_at) VALUES (?,?,?) ON CONFLICT(prefix) DO UPDATE SET done_at = NULL',
  ).bind(p, accountId, now)));
}

/** Delete up to `budget` objects from the queued prefixes. Never throws. */
export async function runStoragePurges(env: Env, budget = 3000): Promise<number> {
  if (!env.VIDEO) return 0;
  let n = 0;
  try {
    const { results } = await env.DB.prepare('SELECT prefix FROM crm_storage_purges WHERE done_at IS NULL ORDER BY created_at LIMIT 10')
      .all<{ prefix: string }>();
    for (const { prefix } of results ?? []) {
      if (!PREFIX_OK.test(prefix)) continue;
      let empty = false;
      while (n < budget) {
        const page = await env.VIDEO.list({ prefix, limit: 1000 });
        if (!page.objects.length) { empty = true; break; }
        await env.VIDEO.delete(page.objects.map(o => o.key));
        n += page.objects.length;
        await env.DB.prepare('UPDATE crm_storage_purges SET deleted = deleted + ? WHERE prefix = ?').bind(page.objects.length, prefix).run();
        if (!page.truncated) { empty = true; break; }
      }
      if (empty) await env.DB.prepare('UPDATE crm_storage_purges SET done_at = ? WHERE prefix = ?').bind(nowIso(), prefix).run();
      if (n >= budget) break;
    }
  } catch { /* the next tick carries on from what is left */ }
  return n;
}

const SWEEP_AT = 'storage_sweep_at';
const SWEEP_CURSOR = 'storage_sweep_cursor';
const DAY = 86_400_000;
const MEDIA = /^v\/([^/]+)\/media\/(med_[a-f0-9]{20})\//;
const PROJECT = /^v\/([^/]+)\/(vp-[0-9a-f-]{36})\//;

/**
 * Is this object owned by a row? `true` when it is, or when the rule does not
 * know the folder (kept).
 */
async function owned(env: Env, key: string): Promise<boolean> {
  const m = MEDIA.exec(key);
  if (m) return !!(await env.DB.prepare('SELECT 1 AS n FROM crm_media_assets WHERE r2_key = ?').bind(key).first());
  const p = PROJECT.exec(key);
  if (p) return !!(await env.DB.prepare('SELECT 1 AS n FROM crm_video_projects WHERE id = ?').bind(p[2]).first());
  return true;
}

/**
 * One page of the daily orphan pass. A pass walks the whole `v/` space a page
 * per tick (cursor in crm_meta) and then waits a day. Returns what it deleted.
 */
export async function sweepOrphans(env: Env, opts: { force?: boolean; now?: number; pages?: number } = {}): Promise<{ ran: boolean; deleted: number; done: boolean }> {
  if (!env.VIDEO) return { ran: false, deleted: 0, done: true };
  const now = opts.now ?? Date.now();
  try {
    const cursor = await metaGet(env.DB, SWEEP_CURSOR);
    if (!cursor && !opts.force) {
      const last = Date.parse((await metaGet(env.DB, SWEEP_AT)) ?? '');
      if (Number.isFinite(last) && now - last < DAY) return { ran: false, deleted: 0, done: true };
    }
    let next: string | undefined = cursor || undefined;
    let deleted = 0, done = false;
    for (let i = 0; i < (opts.pages ?? 1); i++) {
      const page = await env.VIDEO.list({ prefix: 'v/', cursor: next, limit: 500 });
      const doomed: string[] = [];
      for (const o of page.objects) {
        /* A day's grace: an upload between "get the link" and "commit" has
           no row yet, and must not be swept out from under it. */
        if (now - o.uploaded.getTime() < DAY) continue;
        if (!(await owned(env, o.key))) doomed.push(o.key);
      }
      if (doomed.length) { await env.VIDEO.delete(doomed); deleted += doomed.length; }
      if (!page.truncated) { done = true; next = undefined; break; }
      next = page.cursor;
    }
    /* Abandoned browser uploads: an open multipart past a day is aborted, so
       its parts stop being stored. */
    const { results: stale } = await env.DB.prepare(
      "SELECT id, r2_key, upload_id FROM crm_video_uploads WHERE state = 'open' AND updated_at < ? LIMIT 50",
    ).bind(new Date(now - DAY).toISOString()).all<{ id: string; r2_key: string; upload_id: string }>().catch(() => ({ results: [] as { id: string; r2_key: string; upload_id: string }[] }));
    for (const u of stale ?? []) {
      await env.VIDEO.resumeMultipartUpload(u.r2_key, u.upload_id).abort().catch(() => null);
      await env.DB.prepare("UPDATE crm_video_uploads SET state = 'aborted', updated_at = ? WHERE id = ?").bind(nowIso(), u.id).run();
    }
    if (done) { await metaPut(env.DB, SWEEP_CURSOR, ''); await metaPut(env.DB, SWEEP_AT, new Date(now).toISOString()); }
    else await metaPut(env.DB, SWEEP_CURSOR, next ?? '');
    return { ran: true, deleted, done };
  } catch {
    return { ran: false, deleted: 0, done: false };
  }
}
