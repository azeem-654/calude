/**
 * The last time each AI tool worked, and the last time it did not — written
 * as calls finish, read by the owner's AI health monitor (lib/aiHealth.ts).
 *
 * ── Why not crm_ai_usage ──
 *
 * That table counts requests and 429s per model. A key Google refused, a
 * 5xx, or a web search answered with no pages to cite left no failure there,
 * so "is web research working?" could not be answered from it — the
 * question the AppSumo reviewer's first article needed asking.
 *
 * ── What counts as a failure ──
 *
 * Only the tool's: every key failed for a reason that was the key's (the
 * `exhausted` answer of withFailover), or the tool returned nothing usable
 * (a search with no sources). A request Google refused for its own content
 * is the request's problem, not the tool's, and is not written here.
 *
 * Its own file with no imports beyond db and aiUsage, so lib/ai.ts can call
 * it without a cycle. Never throws: the record is for the owner, and must
 * never cost a customer their answer.
 */
import { nowIso } from './db';
import { usageEnv } from './aiUsage';

/* A success is written at most every ten minutes per tool per isolate, or at
   once after this isolate saw that tool fail (so a streak ends promptly). */
const OK_EVERY_MS = 10 * 60_000;
const okWritten = new Map<string, number>();
const sawFail = new Set<string>();

/** Anything shaped like a key, out of a provider's error before it is stored or shown. */
export function scrubSecrets(text: string): string {
  return String(text ?? '')
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '[key]')
    .replace(/sk-(?:or-)?[0-9A-Za-z_-]{8,}/g, '[key]')
    .replace(/([?&](?:key|api_key|token)=)[^&\s"']+/gi, '$1[key]')
    .replace(/(Bearer\s+)[0-9A-Za-z._-]{8,}/g, '$1[key]')
    .slice(0, 300);
}

export async function noteTool(tool: string, ok: boolean, error = ''): Promise<void> {
  const env = usageEnv();
  if (!env) return;
  try {
    const now = nowIso();
    if (ok) {
      if (!sawFail.has(tool) && Date.now() - (okWritten.get(tool) ?? 0) < OK_EVERY_MS) return;
      okWritten.set(tool, Date.now());
      sawFail.delete(tool);
      await env.DB.prepare(
        `INSERT INTO crm_ai_tool_health (tool, last_ok_at, fail_streak, updated_at) VALUES (?, ?, 0, ?)
         ON CONFLICT(tool) DO UPDATE SET last_ok_at = excluded.last_ok_at, fail_streak = 0, updated_at = excluded.updated_at`,
      ).bind(tool, now, now).run();
      return;
    }
    sawFail.add(tool);
    await env.DB.prepare(
      `INSERT INTO crm_ai_tool_health (tool, last_error_at, last_error, fail_streak, updated_at) VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(tool) DO UPDATE SET last_error_at = excluded.last_error_at, last_error = excluded.last_error,
         fail_streak = crm_ai_tool_health.fail_streak + 1, updated_at = excluded.updated_at`,
    ).bind(tool, now, scrubSecrets(error) || 'failed', now).run();
  } catch { /* the owner's record, never the customer's failure */ }
}

/** Forget this isolate's throttle (tests). */
export function resetToolNotes(): void { okWritten.clear(); sawFail.clear(); }
