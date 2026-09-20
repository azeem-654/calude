/**
 * Writing down every send, at the moment it is attempted.
 *
 * ── Why this is one function and not an inline insert ──
 *
 * There are four places mail or SMS leaves this app — the sequence tick, the
 * campaign batch, engagement notifications and the digest — and the value of
 * this table is entirely that they all write the same shape. Four inline
 * inserts would drift into four ideas of what `status` means within a month,
 * and the first question anybody asks of a delivery log is a comparison across
 * all of them.
 *
 * ── Why it never throws ──
 *
 * A log entry must never be the reason a message fails to send. If the write
 * fails the mail has already gone, and losing the record of a delivery is bad;
 * losing the delivery because the record failed would be worse.
 */
import { nowIso, type Env } from './db';

export interface LogEntry {
  channel?: 'email' | 'sms';
  source?: 'sequence' | 'campaign' | 'engagement' | 'automation' | 'manual';
  sourceId?: string;
  sourceName?: string;
  stepIndex?: number;
  contactId?: string;
  recipient: string;
  subject?: string;
  /** `suppressed` is the person's own opt-out, not a fault to chase. */
  status: 'sent' | 'failed' | 'suppressed';
  detail?: string;
  sentFrom?: string;
}

export async function logDelivery(env: Env, accountId: string, e: LogEntry): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO crm_delivery_log
       (id, account_id, channel, source, source_id, source_name, step_index,
        contact_id, recipient, subject, status, detail, sent_from, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      `dl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      accountId,
      e.channel ?? 'email',
      e.source ?? 'manual',
      String(e.sourceId ?? '').slice(0, 80),
      String(e.sourceName ?? '').slice(0, 200),
      Math.max(0, Math.round(e.stepIndex ?? 0)),
      String(e.contactId ?? '').slice(0, 80),
      String(e.recipient ?? '').slice(0, 200),
      String(e.subject ?? '').slice(0, 300),
      e.status,
      /* Truncated, not summarised. An SMTP refusal is the most useful string on
         this table and paraphrasing it would lose the code somebody needs. */
      String(e.detail ?? '').slice(0, 600),
      String(e.sentFrom ?? '').slice(0, 200),
      nowIso(),
    ).run();
  } catch {
    /* See the note at the top: the message has already gone. */
  }
}

/**
 * Trim the log.
 *
 * Kept generous — ten thousand rows per workspace — because the question this
 * answers is usually asked weeks after the send, and a log that only covers
 * last Tuesday is a log that is never the one you need. Called from the cron.
 */
export async function pruneDeliveryLog(env: Env): Promise<void> {
  try {
    await env.DB.prepare(
      `DELETE FROM crm_delivery_log WHERE id IN (
         SELECT id FROM crm_delivery_log
         WHERE account_id IN (SELECT DISTINCT account_id FROM crm_delivery_log)
         ORDER BY created_at DESC LIMIT -1 OFFSET 10000
       )`,
    ).run();
  } catch { /* housekeeping is never worth failing a tick over */ }
}
