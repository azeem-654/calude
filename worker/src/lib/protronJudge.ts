/**
 * Protron's campaign watch, the pure part: what the numbers say
 * (lib/protronWatch.ts reads them and tells the customer). No imports, so
 * test/protronWatch.test.mts runs it under node.
 */
export const WINDOW_DAYS = 14;

/** The thresholds, in one place (documented in docs/claude/protron.md). */
export const WATCH = { minAttempts: 30, failShare: 0.1, minSent: 40, replyShare: 0.01 } as const;

export interface WatchReport { ran: boolean; raised: number; emailed: number; notes: string[] }

export interface SourceRow { account_id: string; source_id: string; source_name: string; sent: number; failed: number }

export interface Finding { accountId: string; sourceId: string; name: string; kind: 'low_replies' | 'failing_sends'; title: string; body: string }

/** Pure: what the numbers say. Exported for the test. */
export function judge(rows: SourceRow[], repliesByAccount: Map<string, number>): Finding[] {
  const out: Finding[] = [];
  const byAccount = new Map<string, SourceRow[]>();
  for (const r of rows) byAccount.set(r.account_id, [...(byAccount.get(r.account_id) ?? []), r]);
  for (const [accountId, list] of byAccount) {
    for (const r of list) {
      const attempts = r.sent + r.failed;
      if (attempts >= WATCH.minAttempts && r.failed / attempts >= WATCH.failShare) {
        out.push({
          accountId, sourceId: r.source_id, name: r.source_name, kind: 'failing_sends',
          title: `“${r.source_name}” is failing to send`,
          body: `In the last ${WINDOW_DAYS} days ${r.failed} of ${attempts} emails from “${r.source_name}” could not be sent. Do I have your go-ahead to find out why and fix it?`,
        });
      }
    }
    const sent = list.reduce((n, r) => n + r.sent, 0);
    const replies = repliesByAccount.get(accountId) ?? 0;
    if (sent >= WATCH.minSent && replies / sent < WATCH.replyShare) {
      const top = [...list].sort((a, b) => b.sent - a.sent)[0];
      out.push({
        accountId, sourceId: top.source_id, name: top.source_name, kind: 'low_replies',
        title: `Replies are lower than expected on “${top.source_name}”`,
        body: `In the last ${WINDOW_DAYS} days your campaigns sent ${sent} emails (${top.sent} from “${top.source_name}”) and your inbox received ${replies} ${replies === 1 ? 'reply' : 'replies'}. Do I have your go-ahead to optimise “${top.source_name}” to get more responses?`,
      });
    }
  }
  return out;
}

