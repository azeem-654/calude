/**
 * How often one caller may do one thing.
 *
 * ── The decision, the reset and the count are one statement ──
 *
 * The obvious shape is: read the row, work out whether the window has expired,
 * then write the new count. Across two awaits that is a race — two requests
 * both read "4 of 5" and both write "5", and the limit can be beaten by
 * holding the button down. The upsert below does all three at once, so
 * concurrent callers queue behind one another in SQLite instead.
 *
 * `RETURNING` gives back the count *after* this call, so the caller does not
 * have to read it again and cannot act on a number that has already moved.
 *
 * ── Failing open, on purpose ──
 *
 * If the table cannot be reached, the call is allowed. A rate limiter that
 * takes the shop down when it has a bad day has done more damage than the
 * abuse it was guarding against — these endpoints hold no secrets and move no
 * money on their own. A limiter in front of something that did would be a
 * different judgement, and should not reuse this.
 */
import type { Env } from './db';

export interface Limit {
  /** What is being limited. Paired with the caller to make the bucket. */
  what: string;
  /** Usually an IP. Anything stable per caller will do. */
  who: string;
  /** How many are allowed inside the window. */
  max: number;
  windowSeconds: number;
}

export interface Verdict {
  allowed: boolean;
  /** How many this caller has now used, including this one. */
  used: number;
  /** Seconds until the window opens again. 0 when they are inside it. */
  retryAfter: number;
}

export async function rateLimit(env: Env, limit: Limit): Promise<Verdict> {
  const bucket = `${limit.what}:${limit.who}`.slice(0, 200);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const cutoff = new Date(now - limit.windowSeconds * 1000).toISOString();

  try {
    const row = await env.DB.prepare(
      `INSERT INTO crm_rate_limits (bucket, hits, window_start)
       VALUES (?, 1, ?)
       ON CONFLICT(bucket) DO UPDATE SET
         hits = CASE WHEN crm_rate_limits.window_start < ? THEN 1 ELSE crm_rate_limits.hits + 1 END,
         window_start = CASE WHEN crm_rate_limits.window_start < ? THEN excluded.window_start ELSE crm_rate_limits.window_start END
       RETURNING hits, window_start AS windowStart`,
    ).bind(bucket, nowIso, cutoff, cutoff).first<{ hits: number; windowStart: string }>();

    const used = row?.hits ?? 1;
    const started = Date.parse(row?.windowStart ?? nowIso);
    const endsAt = started + limit.windowSeconds * 1000;
    return {
      allowed: used <= limit.max,
      used,
      retryAfter: used <= limit.max ? 0 : Math.max(1, Math.ceil((endsAt - now) / 1000)),
    };
  } catch {
    /* See the note at the top: an unreachable counter must not close the shop. */
    return { allowed: true, used: 0, retryAfter: 0 };
  }
}

/**
 * Drop windows that closed long ago.
 *
 * Every window that ever opened leaves a row, so without this the table grows
 * by one per visitor for ever. A day is far longer than any window here, which
 * means a sweep can never delete a budget somebody is still inside.
 */
export async function pruneRateLimits(env: Env): Promise<number> {
  const cutoff = new Date(Date.now() - 86_400_000).toISOString();
  try {
    const r = await env.DB.prepare('DELETE FROM crm_rate_limits WHERE window_start < ?')
      .bind(cutoff).run();
    return r.meta?.changes ?? 0;
  } catch {
    return 0;
  }
}
