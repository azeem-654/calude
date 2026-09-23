/**
 * Deleting old rows, at a price worth paying.
 *
 * ── Why this file exists ──
 *
 * The four prunes it replaces ran on every tick — 288 times a day — and three
 * of them asked for "keep the newest ten thousand rows". SQLite answers that by
 * sorting the whole table and then testing every row against a list of ten
 * thousand ids, so each one read about as many rows as the table holds, every
 * five minutes, in order to delete nothing at all on almost every run. That was
 * the bulk of an account sitting at 77% of Cloudflare's daily D1 operation
 * limit while serving hardly any traffic.
 *
 * Two changes, and the second matters more than the first:
 *
 * **By age, not by count.** `created_at < ?` against an index reads the rows it
 * is about to delete and no others. "The newest N" cannot be answered without
 * looking at all of them. The rule is also easier to state to a customer: we
 * keep thirty days of delivery history, not "ten thousand rows, whenever that
 * turns out to be".
 *
 * **Hourly, not every tick.** Nothing here is time-sensitive. A log row that
 * lives an extra fifty-five minutes costs nobody anything, and the gate itself
 * is one row read and one written.
 *
 * ── The one thing this deliberately does not do ──
 *
 * Cap the tables by size. A workspace that somehow writes a million log rows in
 * a day would still hold them for the full retention window. The alternative is
 * the sort that caused the problem, and the honest answer to runaway volume is
 * to find what is writing it rather than to hide it behind a nightly trim.
 */
import { metaGet, metaPut, nowIso, type Env } from './db';

/** How long each table's rows are kept, in days. */
const KEEP_DAYS = {
  /* Long enough to answer "did that campaign go out three weeks ago?", which
     is the question this log exists for. */
  delivery: 30,
  /* Shorter: this is step-by-step detail about a run, useful while somebody is
     working out why an automation did something and of no interest after. */
  automation: 14,
  /* Longest, because it is the only record that an agent produced anything on
     a given morning, and "what has it actually made for me" is asked monthly. */
  agentRuns: 60,
  /* A tick report is operational. Four days covers a long weekend. */
  ticks: 4,
  /* Every rate-limit window that ever opened leaves a row. A day is far longer
     than any window in use, so this can never delete a budget somebody is
     still inside. */
  rateLimits: 1,
} as const;

const GATE_KEY = 'housekeeping_at';
const EVERY_MS = 3_600_000;

export interface HousekeepingReport {
  ran: boolean;
  deleted: number;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/**
 * Delete everything past its keep-by date, at most once an hour.
 *
 * Never throws and never reports a problem to a customer: there is nothing they
 * could do about it, and a failed prune costs a little storage rather than
 * anything they would notice.
 */
export async function runHousekeeping(env: Env): Promise<HousekeepingReport> {
  try {
    const last = await metaGet(env.DB, GATE_KEY);
    const then = last ? Date.parse(last) : NaN;
    /* An unreadable stamp runs rather than waits. Waiting for ever on a bad
       value is the failure mode that leaves a table growing without limit. */
    if (Number.isFinite(then) && Date.now() - then < EVERY_MS) return { ran: false, deleted: 0 };
  } catch {
    /* No meta table to ask: fall through and prune. */
  }

  let deleted = 0;
  const sweep = async (sql: string, cutoff: string) => {
    try {
      const r = await env.DB.prepare(sql).bind(cutoff).run();
      deleted += r.meta?.changes ?? 0;
    } catch { /* one table's failure must not stop the rest */ }
  };

  await sweep('DELETE FROM crm_delivery_log WHERE created_at < ?', daysAgo(KEEP_DAYS.delivery));
  await sweep('DELETE FROM crm_automation_log WHERE created_at < ?', daysAgo(KEEP_DAYS.automation));
  await sweep('DELETE FROM crm_agent_runs WHERE created_at < ?', daysAgo(KEEP_DAYS.agentRuns));
  await sweep('DELETE FROM crm_ticks WHERE at < ?', daysAgo(KEEP_DAYS.ticks));
  await sweep('DELETE FROM crm_rate_limits WHERE window_start < ?', daysAgo(KEEP_DAYS.rateLimits));

  /* Stamped after the work rather than before, so a run that died half way
     through is retried on the next tick instead of being skipped for an hour. */
  try { await metaPut(env.DB, GATE_KEY, nowIso()); } catch { /* next tick will try again */ }

  return { ran: true, deleted };
}
