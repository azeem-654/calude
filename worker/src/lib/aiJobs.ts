/**
 * A job that started inside the AI allowance finishes past it.
 *
 * The owner's rule: when something has started generating — a 12-month plan,
 * a month of content, a business workspace build — let it finish, and *then*
 * tell the customer their AI credits are used up. Cutting a build off at its
 * fourth call leaves half a project and a refusal in the middle of a progress
 * list, which reads as the product breaking rather than a plan running out.
 *
 * A caller names its job (`job`, any short id it makes up per run). The first
 * call is checked as usual and starts the job; later calls of the same job
 * within 45 minutes pass even when the month is used up, up to 80 of them, and
 * the answer carries `creditsOut` so the screen can say so once the job is
 * done. Without a name, nothing changes: every call is checked on its own.
 */
import { metaGet, metaPut, type Env } from './db';

const JOB_MS = 45 * 60_000;
const JOB_MAX_CALLS = 80;

const keyOf = (accountId: string, job: string) => `aijob:${accountId}:${job}`.slice(0, 200);
export const cleanJob = (raw: unknown): string => String(raw ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);

/** Mark the job started (or one more call of it). Never throws. */
export async function jobTouch(env: Env, accountId: string, job: string): Promise<void> {
  if (!job) return;
  try {
    const cur = await read(env, accountId, job);
    await metaPut(env.DB, keyOf(accountId, job), JSON.stringify({ at: cur?.at ?? Date.now(), n: (cur?.n ?? 0) + 1 }));
    if (Math.random() < 0.01) {
      await env.DB.prepare("DELETE FROM crm_meta WHERE k LIKE 'aijob:%' AND updated_at < ?")
        .bind(new Date(Date.now() - 86_400_000).toISOString()).run();
    }
  } catch { /* a counter must not cost the answer */ }
}

/** Did this job start within the allowance, recently enough to be finished past it? */
export async function jobMayFinish(env: Env, accountId: string, job: string): Promise<boolean> {
  if (!job) return false;
  const cur = await read(env, accountId, job).catch(() => null);
  return !!cur && Date.now() - cur.at < JOB_MS && cur.n < JOB_MAX_CALLS;
}

async function read(env: Env, accountId: string, job: string): Promise<{ at: number; n: number } | null> {
  const raw = await metaGet(env.DB, keyOf(accountId, job));
  if (!raw) return null;
  try { const v = JSON.parse(raw) as { at?: number; n?: number }; return { at: Number(v.at) || 0, n: Number(v.n) || 0 }; } catch { return null; }
}
