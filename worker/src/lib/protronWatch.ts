/**
 * Protron watching the running campaigns, from the cron (owner's brief,
 * 2026-11-13): when a campaign is doing badly, the customer is told — in the
 * app and by email — with the real numbers, and asked for the go-ahead to
 * improve it.
 *
 * ── What it measures, and why only that ──
 * Sends come from `crm_delivery_log`, per campaign or sequence (`source_id`),
 * over the last 14 days. Replies are only known per workspace: the inbox tick
 * (replyTick.ts) records each real reply in `crm_reply_seen` without saying
 * which campaign it answered. So:
 *   - failing_sends — a campaign with ≥ 30 attempts where ≥ 10 % failed. That
 *     is attributable, so it names the campaign outright.
 *   - low_replies  — a workspace that sent ≥ 40 campaign emails and got
 *     replies to under 1 % of them. It names the campaign that sent the most
 *     and says the reply count is the workspace's, never pretending a split it
 *     does not have.
 *
 * ── Asking, not doing ──
 * The email's button opens the app signed in (`?protron=optimise`), where
 * Protron proposes the change and the customer approves it there. A link in
 * an email is never itself the approval: anybody holding it could press it.
 *
 * Mail goes through the one door (deliver.ts) from the workspace's own
 * mailbox to its owner, the way the morning digest does. Each finding is
 * raised at most once a week (`crm_protron_alerts`). Hourly; never throws.
 */
import { metaGet, metaPut, nowIso, type Env } from './db';
import { loadMailbox } from '../routes/mailbox';
import { canSend, deliver, fromAddressOf } from './deliver';
import { ownerEmailOf } from './allowanceStore';
import { judge, WINDOW_DAYS, type SourceRow, type WatchReport } from './protronJudge';

export type { WatchReport };

const GATE_KEY = 'protron_watch_at';
const EVERY_MS = 60 * 60 * 1000;
const RETELL_MS = 7 * 24 * 60 * 60 * 1000;

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export async function runProtronWatch(env: Env): Promise<WatchReport> {
  const report: WatchReport = { ran: false, raised: 0, emailed: 0, notes: [] };
  try {
    const last = await metaGet(env.DB, GATE_KEY);
    if (last && Date.now() - Date.parse(last) < EVERY_MS) return report;
    await metaPut(env.DB, GATE_KEY, nowIso());
    report.ran = true;

    const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
    const { results } = await env.DB.prepare(
      `SELECT account_id, source_id, MAX(source_name) AS source_name,
              SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
         FROM crm_delivery_log
        WHERE channel = 'email' AND source IN ('sequence', 'campaign') AND source_id != '' AND created_at > ?
        GROUP BY account_id, source_id`,
    ).bind(since).all<SourceRow>();
    const rows = results ?? [];
    if (!rows.length) return report;

    const accounts = [...new Set(rows.map(r => r.account_id))];
    const replies = new Map<string, number>();
    for (const a of accounts) {
      const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM crm_reply_seen WHERE account_id = ? AND outcome IN ('replied', 'held') AND at > ?")
        .bind(a, since).first<{ n: number }>().catch(() => null);
      replies.set(a, r?.n ?? 0);
    }

    for (const f of judge(rows, replies)) {
      const told = await env.DB.prepare('SELECT told_at FROM crm_protron_alerts WHERE account_id = ? AND source_id = ? AND kind = ?')
        .bind(f.accountId, f.sourceId, f.kind).first<{ told_at: string }>();
      if (told && Date.now() - Date.parse(told.told_at) < RETELL_MS) continue;
      const to = await ownerEmailOf(env, f.accountId);
      if (!to) continue;
      const link = `${env.APP_ORIGIN ?? ''}/autopilot?protron=optimise&campaign=${encodeURIComponent(f.name.slice(0, 80))}`;

      /* In the app: the corner notice the customer already reads (NoticeCard). */
      let emailed: 'sent' | 'failed' | 'skipped' = 'skipped';
      const mb = await loadMailbox(env, f.accountId);
      const from = canSend(mb) ? fromAddressOf(mb) : '';
      if (mb && from) {
        const html = `<p>Hi,</p><p>${esc(f.body)}</p>`
          + `<p><a href="${esc(link)}" style="display:inline-block;padding:11px 22px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">Yes — review it with Protron</a></p>`
          + '<p style="color:#6b7280;font-size:13px">Nothing changes until you approve it in the app. — Protron, your AI business manager</p>';
        const r = await deliver(mb, { fromName: 'Protron', fromEmail: from, to, subject: f.title, html });
        emailed = r.ok ? 'sent' : 'failed';
        if (r.ok) report.emailed++; else report.notes.push(`Protron alert for ${f.accountId} not emailed: ${r.error}`);
      }
      await env.DB.prepare('INSERT INTO crm_notices (id, to_email, title, body, link, link_label, emailed, created_at) VALUES (?,?,?,?,?,?,?,?)')
        .bind(crypto.randomUUID(), to, `Protron: ${f.title}`.slice(0, 200), f.body.slice(0, 2000), link, 'Review it with Protron', emailed, nowIso()).run();
      await env.DB.prepare('INSERT INTO crm_protron_alerts (account_id, source_id, kind, told_at) VALUES (?,?,?,?) ON CONFLICT (account_id, source_id, kind) DO UPDATE SET told_at = excluded.told_at')
        .bind(f.accountId, f.sourceId, f.kind, nowIso()).run();
      report.raised++;
    }
  } catch (e) {
    report.notes.push(`Protron watch stopped: ${e instanceof Error ? e.message : String(e)}`);
  }
  return report;
}
