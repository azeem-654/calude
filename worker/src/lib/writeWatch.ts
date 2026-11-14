/**
 * Did this request save anything?
 *
 * A busy AI answer carries `X-AI-Busy` (lib/http.ts `json`), and the page
 * then sends the very same request again (src/services/aiPatience.ts). That
 * is only safe when the first attempt changed nothing — otherwise a route
 * that saved a draft and then failed on the AI would save it twice. Thirty-
 * odd routes reach the AI, through lib functions that call it in different
 * places, and a route checked by hand today is changed tomorrow. So it is
 * not left to each route: every API request gets a database that notes the
 * tables written through it (index.ts), and a busy answer from a request
 * that wrote anything loses its header (`retryable`). The page then shows
 * the busy sentence as before, and nothing is sent twice.
 *
 * Written tables that do not count are the bookkeeping of a failed AI call
 * and of being signed in: the allowance unit taken and given back, rate-
 * limit counters, the key pool's health, AI usage and alerts, install meta
 * (job and outage stamps), the session's last-seen, the audit trail and the
 * delivery log of the owner's outage mail. A second attempt writing those
 * again is what a second attempt is meant to do.
 */
import type { Env } from './db';

const BOOKKEEPING = new Set([
  'crm_usage', 'crm_rate_limits', 'crm_ai_usage', 'crm_ai_key_health', 'crm_ai_alerts',
  'crm_meta', 'crm_sessions', 'crm_audit_events', 'crm_delivery_log',
]);

const WRITE = /\b(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|REPLACE\s+INTO|UPDATE(?:\s+OR\s+\w+)?|DELETE\s+FROM)\s+["`[]?(\w+)/gi;

/** The tables a statement writes, bookkeeping left out. */
export function writtenTables(sql: string): string[] {
  const out: string[] = [];
  for (const m of sql.matchAll(WRITE)) {
    const t = m[1].toLowerCase();
    if (!BOOKKEEPING.has(t)) out.push(t);
  }
  return out;
}

export interface Watched { env: Env; wrote: Set<string> }

/**
 * The same env with a database that notes what it is asked to write. Noted
 * when a statement is prepared (or exec'd), which is before it runs: a
 * statement prepared and never run is counted, which errs toward not
 * retrying — the safe side.
 */
export function watchWrites(env: Env): Watched {
  const wrote = new Set<string>();
  const note = (sql: unknown) => { if (typeof sql === 'string') for (const t of writtenTables(sql)) wrote.add(t); };
  const db = env.DB;
  const DB = new Proxy(db, {
    get(target, prop) {
      if (prop === 'prepare') return (sql: string) => { note(sql); return target.prepare(sql); };
      if (prop === 'exec') return (sql: string) => { note(sql); return target.exec(sql); };
      const v = Reflect.get(target, prop, target) as unknown;
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  });
  return { env: { ...env, DB }, wrote };
}

/** The answer, without its "ask again" mark when the request saved something. */
export function retryable(res: Response, w: Watched, path: string): Response {
  if (!res.headers.has('X-AI-Busy') || !w.wrote.size) return res;
  console.warn(`[ai-busy] ${path} wrote ${[...w.wrote].join(', ')} before the AI was busy — not marked for retry`);
  const out = new Response(res.body, res);
  out.headers.delete('X-AI-Busy');
  return out;
}
