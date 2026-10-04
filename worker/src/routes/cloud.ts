/**
 * "Is the cloud running my work?" — the one read behind the blinking cloud in
 * the top bar and the card on the dashboard.
 *
 * The claim the app makes is that a customer's workflows keep running with
 * their computer off. That is true only while the Worker's cron is firing, so
 * the indicator is drawn from the cron's own record of itself (`crm_ticks`,
 * one row a tick) and never from a constant: a cloud that blinks "live" while
 * the schedule has stopped would be the plausible success this codebase
 * refuses. `live` means a tick finished in the last twenty minutes — four
 * missed ticks, the same threshold the automation health panel uses.
 *
 * What is counted for the workspace is what the cron will act on without
 * anybody signed in: running Autopilot projects, switched-on workflows, active
 * daily prospect finders, and follow-ups waiting in the queue. Each count is
 * read on its own so a table an older database lacks costs that number, not
 * the answer.
 */
import { body, fail, json } from '../lib/http';
import { canAccess, userFromToken, type Env } from '../lib/db';

interface Req { token?: string; accountId?: string; action?: string }

const LIVE_WITHIN_MS = 20 * 60_000;

async function count(env: Env, sql: string, accountId: string): Promise<number> {
  try {
    const r = await env.DB.prepare(sql).bind(accountId).first<{ n: number }>();
    return Number(r?.n ?? 0);
  } catch { return 0; }
}

export async function handleCloud(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this needs a current session.', 401, { code: 'unauthorised' });
  const accountId = String(d.accountId ?? '').trim();
  if (!/^[A-Za-z0-9_.\-]{1,64}$/.test(accountId)) return fail('A valid workspace is required.');
  if (!(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours.', 403);
  const act = String(d.action ?? 'status');
  if (act !== 'status') return fail(`"${act}" is not something this endpoint does.`);

  /* The tick is shared by every workspace; only its time is told, never what
     it did for anybody else. */
  let lastRunAt: string | null = null;
  try {
    const t = await env.DB.prepare('SELECT at FROM crm_ticks ORDER BY at DESC LIMIT 1').first<{ at: string }>();
    lastRunAt = t?.at ?? null;
  } catch { lastRunAt = null; }
  const live = !!lastRunAt && Date.now() - new Date(lastRunAt).getTime() < LIVE_WITHIN_MS;

  const [projects, workflows, finders, followUps] = await Promise.all([
    count(env, "SELECT COUNT(*) AS n FROM crm_projects WHERE account_id = ? AND status IN ('learning','running')", accountId),
    count(env, "SELECT COUNT(*) AS n FROM crm_project_workflows WHERE account_id = ? AND status = 'active'", accountId),
    count(env, "SELECT COUNT(*) AS n FROM crm_prospect_finders WHERE account_id = ? AND status = 'active'", accountId),
    count(env, "SELECT COUNT(*) AS n FROM crm_automation_runs WHERE account_id = ? AND status = 'active'", accountId),
  ]);

  return json({
    success: true,
    live,
    lastRunAt,
    everyMinutes: 5,
    running: { projects, workflows, finders, followUps },
  });
}
