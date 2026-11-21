/**
 * Protron's messages in the live chat (owner, 2026-11-21).
 *
 * "Protron keeps working on its own and keeps sending messages in the chat even
 * if the customer is not there": what AI Autopilot did on each business
 * workspace, what waits for the customer's yes (with buttons to approve it from
 * the chat), what the campaign watch noticed, and now and then a question about
 * what is going on in the business. Written on the server by the cron
 * (`runProtronFeed`, after the watch), so the messages are waiting when the
 * customer next signs in; read and answered through /api/protron-feed.php; the
 * help button's widget (public/widget.js, signed in) shows them.
 *
 * ── The rules ──
 *
 * Every message is a fact about a record that exists — an action row, a
 * delivery count, a project's own goal. Nothing is invented and nothing is
 * claimed that did not happen; a quiet day writes nothing. No AI is called
 * here, so it costs nothing per message and cannot hallucinate.
 *
 * An approve button only ever moves an action from `awaiting` to `pending` —
 * the same rule as the Autopilot screen (`decideAction`, used by both), and the
 * tick carries it out. Which action a button acts on is read from the stored
 * message, never from the request, so a request cannot name somebody else's.
 */
import { dataGet, dataPut, nowIso, type Env } from './db';
import { localHour } from './localHour';

export type FeedAction =
  | { type: 'approve'; actionId: string }
  | { type: 'open'; path: string; label: string };

export interface FeedMessage {
  accountId: string;
  projectId?: string;
  role?: 'protron' | 'you';
  kind: 'waiting' | 'progress' | 'watch' | 'ask' | 'reply' | 'summary' | 'note';
  body: string;
  actions?: FeedAction[];
  ref?: string;
}

/** How long a business goes between "what is going on?" questions. */
export const ASK_EVERY_DAYS = 7;
const DAY = 86_400_000;

/* ── Pure: the words. Exported for test/protronFeed.test.mts. ───────────── */

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function waitingText(a: { summary: string; because?: string; project?: string }): string {
  const where = a.project ? ` for ${a.project}` : '';
  const why = (a.because ?? '').trim();
  return `This is waiting for your yes${where}: ${clip(a.summary.trim(), 200)}.${why ? ` Why: ${clip(why, 220)}` : ''} Nothing goes out until you approve it.`;
}

export function progressText(project: string, done: string[], failed: string[]): string {
  const parts: string[] = [];
  if (done.length) {
    const shown = done.slice(0, 4).map(d => `• ${clip(d, 140)}`).join('\n');
    parts.push(`Update on ${project || 'your business'} — I carried out ${plural(done.length, 'thing')}:\n${shown}${done.length > 4 ? `\n…and ${done.length - 4} more on the Activity tab.` : ''}`);
  }
  if (failed.length) {
    const shown = failed.slice(0, 3).map(d => `• ${clip(d, 140)}`).join('\n');
    parts.push(`${done.length ? 'And' : `On ${project || 'your business'},`} ${plural(failed.length, 'thing')} did not work — I have not retried ${failed.length === 1 ? 'it' : 'them'} on my own:\n${shown}`);
  }
  return parts.join('\n\n');
}

export function askText(project: string, objective: string): string {
  const goal = objective.trim() ? ` The goal I am working to is “${clip(objective.trim(), 120)}”.` : '';
  return `Quick question about ${project || 'your business'}: what is going on this week — a new offer, a busy or slow patch, a new service, a customer you want more of?${goal} Reply here and I will use it the next time I plan its work.`;
}

export interface ProjectState { name: string; status: string; awaiting: number; done: number; failed: number; flagged: string[] }

export function summaryText(projects: ProjectState[]): string {
  if (!projects.length) return 'You have no business workspaces running yet. Start one on AI Autopilot and I will report on it here.';
  const lines = projects.map(p => {
    const bits: string[] = [];
    if (p.status === 'paused' || p.status === 'off') bits.push('paused');
    if (p.awaiting) bits.push(`${plural(p.awaiting, 'thing')} waiting for you`);
    if (p.done) bits.push(`${p.done} done in the last day`);
    if (p.failed) bits.push(`${p.failed} did not work`);
    for (const f of p.flagged.slice(0, 2)) bits.push(`flagged: ${f}`);
    return `• ${p.name}: ${bits.length ? bits.join(' · ') : 'nothing new in the last day'}`;
  });
  const waiting = projects.reduce((n, p) => n + p.awaiting, 0);
  return `Here is where things stand:\n${lines.join('\n')}${waiting ? `\n\n${plural(waiting, 'thing')} ${waiting === 1 ? 'needs' : 'need'} your yes — use the buttons above, or Approve all.` : ''}`;
}

/* ── The one rule for approving, shared with routes/autopilot.ts ────────── */

export async function decideAction(env: Env, accountId: string, actionId: string, approve: boolean): Promise<{ ok: boolean; error: string }> {
  const row = await env.DB.prepare('SELECT status FROM crm_autopilot_actions WHERE id = ? AND account_id = ?')
    .bind(actionId, accountId).first<{ status: string }>();
  if (!row) return { ok: false, error: 'That action is not in this workspace.' };
  if (row.status !== 'awaiting') return { ok: false, error: `That action is already "${row.status}" — it is not waiting for anybody.` };
  /* Approving moves it to pending so the next tick carries it out — it is not
     performed inline, because the thing that does the work is the tick and
     having two places that can send is how something gets sent twice. */
  await env.DB.prepare('UPDATE crm_autopilot_actions SET status = ?, detail = ?, acted_at = ? WHERE id = ?')
    .bind(approve ? 'pending' : 'skipped', approve ? '' : 'You decided not to do this.', approve ? null : nowIso(), actionId).run();
  return { ok: true, error: '' };
}

/* ── Writing ───────────────────────────────────────────────────────────── */

export async function postFeed(env: Env, m: FeedMessage): Promise<boolean> {
  const r = await env.DB.prepare(
    `INSERT OR IGNORE INTO crm_protron_messages (id, account_id, project_id, role, kind, body, actions, ref, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).bind(crypto.randomUUID(), m.accountId, m.projectId ?? '', m.role ?? 'protron', m.kind, clip(m.body, 2000),
    JSON.stringify(m.actions ?? []), m.ref ?? '', nowIso()).run().catch(() => null);
  return !!r?.meta?.changes;
}

/** Where every business workspace in the account stands, for "Today's summary" and the digest. */
export async function projectStates(env: Env, accountId: string): Promise<ProjectState[]> {
  const since = new Date(Date.now() - DAY).toISOString();
  const projects = (await env.DB.prepare('SELECT id, name, status FROM crm_projects WHERE account_id = ? ORDER BY created_at LIMIT 50')
    .bind(accountId).all<{ id: string; name: string; status: string }>()).results ?? [];
  const counts = (await env.DB.prepare(
    `SELECT project_id AS p,
            SUM(CASE WHEN status = 'awaiting' THEN 1 ELSE 0 END) AS awaiting,
            SUM(CASE WHEN status = 'done' AND kind NOT IN ('observe','error') AND created_at > ? THEN 1 ELSE 0 END) AS done,
            SUM(CASE WHEN status = 'failed' AND created_at > ? THEN 1 ELSE 0 END) AS failed
       FROM crm_autopilot_actions WHERE account_id = ? GROUP BY project_id`,
  ).bind(since, since, accountId).all<{ p: string; awaiting: number; done: number; failed: number }>()).results ?? [];
  const flags = (await env.DB.prepare(
    `SELECT a.kind, COALESCE(d.source_name, '') AS name FROM crm_protron_alerts a
       LEFT JOIN (SELECT source_id, MAX(source_name) AS source_name FROM crm_delivery_log WHERE account_id = ? GROUP BY source_id) d ON d.source_id = a.source_id
      WHERE a.account_id = ? AND a.told_at > ?`,
  ).bind(accountId, accountId, new Date(Date.now() - 7 * DAY).toISOString()).all<{ kind: string; name: string }>().catch(() => ({ results: [] }))).results ?? [];
  const flagged = flags.map(f => `“${f.name || 'a campaign'}” ${f.kind === 'failing_sends' ? 'is failing to send' : 'is getting almost no replies'}`);
  return projects.map((p, i) => {
    const c = counts.find(x => x.p === p.id);
    /* Campaign flags are per workspace (replies are only known per workspace),
       so they are told once, on the first business. */
    return { name: p.name, status: p.status, awaiting: Number(c?.awaiting) || 0, done: Number(c?.done) || 0, failed: Number(c?.failed) || 0, flagged: i === 0 ? flagged : [] };
  });
}

/* ── The cron pass ─────────────────────────────────────────────────────── */

const FEED_KEY = 'crm_protron_feed_at';

export interface FeedReport { accounts: number; posted: number; notes: string[] }

export async function runProtronFeed(env: Env): Promise<FeedReport> {
  const report: FeedReport = { accounts: 0, posted: 0, notes: [] };
  try {
    const { results } = await env.DB.prepare(
      `SELECT DISTINCT account_id FROM crm_projects WHERE status NOT IN ('off','paused') LIMIT 400`,
    ).all<{ account_id: string }>();
    for (const { account_id: accountId } of results ?? []) {
      report.accounts++;
      const last = (await dataGet(env.DB, accountId, FEED_KEY)) ?? '';
      const since = last && Date.now() - Date.parse(last) < 7 * DAY ? last : new Date(Date.now() - DAY).toISOString();
      const stamp = nowIso();

      /* 1. Everything waiting for a yes, one message each, with its buttons. */
      const waiting = (await env.DB.prepare(
        `SELECT a.id, a.summary, a.because, a.project_id, COALESCE(j.name, '') AS project
           FROM crm_autopilot_actions a LEFT JOIN crm_projects j ON j.id = a.project_id
          WHERE a.account_id = ? AND a.status = 'awaiting' ORDER BY a.created_at LIMIT 20`,
      ).bind(accountId).all<{ id: string; summary: string; because: string; project_id: string; project: string }>()).results ?? [];
      for (const w of waiting) {
        if (await postFeed(env, { accountId, projectId: w.project_id, kind: 'waiting', body: waitingText(w), actions: [{ type: 'approve', actionId: w.id }], ref: `wait:${w.id}` })) report.posted++;
      }

      /* 2. What was carried out (or failed) since the last pass, one message per business. */
      const acted = (await env.DB.prepare(
        `SELECT a.status, a.kind, a.summary, a.detail, a.project_id, a.created_at, COALESCE(j.name, '') AS project
           FROM crm_autopilot_actions a LEFT JOIN crm_projects j ON j.id = a.project_id
          WHERE a.account_id = ? AND a.created_at > ? AND a.created_at <= ? AND a.status IN ('done','failed')
          ORDER BY a.created_at LIMIT 100`,
      ).bind(accountId, since, stamp).all<{ status: string; kind: string; summary: string; detail: string | null; project_id: string; created_at: string; project: string }>()).results ?? [];
      const byProject = new Map<string, typeof acted>();
      for (const a of acted) {
        /* A notice is not a completed job (autopilotDigest.ts says why). */
        if (a.status === 'done' && (a.kind === 'observe' || a.kind === 'error')) continue;
        byProject.set(a.project_id, [...(byProject.get(a.project_id) ?? []), a]);
      }
      for (const [projectId, list] of byProject) {
        const done = list.filter(a => a.status === 'done').map(a => a.summary);
        const failed = list.filter(a => a.status === 'failed').map(a => `${a.summary}${a.detail ? ` — ${a.detail}` : ''}`);
        const body = progressText(list[0].project, done, failed);
        if (!body) continue;
        const newest = list[list.length - 1].created_at;
        if (await postFeed(env, { accountId, projectId, kind: 'progress', body, actions: [{ type: 'open', path: '/autopilot', label: 'See it on AI Autopilot' }], ref: `done:${projectId}:${newest}` })) report.posted++;
      }

      /* 3. Now and then, a question about the business — in its owner's
         working hours, at most once a week per business workspace. */
      const sched = JSON.parse((await dataGet(env.DB, accountId, 'crm_schedule')) ?? '{}') as { timezone?: string };
      const hour = localHour(sched.timezone ?? '');
      if (hour >= 9 && hour < 18) {
        const running = (await env.DB.prepare(`SELECT id, name, objective FROM crm_projects WHERE account_id = ? AND status NOT IN ('off','paused') ORDER BY created_at LIMIT 10`)
          .bind(accountId).all<{ id: string; name: string; objective: string }>()).results ?? [];
        for (const p of running) {
          const asked = await env.DB.prepare(`SELECT 1 FROM crm_protron_messages WHERE account_id = ? AND project_id = ? AND kind = 'ask' AND created_at > ?`)
            .bind(accountId, p.id, new Date(Date.now() - ASK_EVERY_DAYS * DAY).toISOString()).first();
          if (asked) continue;
          if (await postFeed(env, { accountId, projectId: p.id, kind: 'ask', body: askText(p.name, p.objective ?? ''), ref: `ask:${p.id}:${stamp.slice(0, 10)}` })) report.posted++;
          break;   // one question at a time, however many businesses
        }
      }

      await dataPut(env.DB, accountId, FEED_KEY, stamp);
    }
  } catch (e) {
    report.notes.push(`Protron's chat updates stopped: ${e instanceof Error ? e.message : String(e)}`);
  }
  return report;
}
