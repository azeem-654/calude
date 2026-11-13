/**
 * /api/ai-health.php — the install owner's AI health table (lib/aiHealth.ts):
 * every AI tool, whether its key is configured, whether it is failing, how
 * near today's free quota it is, and what the monitor last mailed.
 *
 * Owner only, on the server: the single `crm_users` row with no account and
 * the agency role, as on Platform services. It takes no workspace or id. It
 * never answers a key — not a value, not a tail; keys appear by their label,
 * and stored errors are scrubbed of anything shaped like one.
 *
 * `status` reads; `run` checks now and mails what is due (the once-a-day rule
 * per tool and condition still holds), for the owner's "Check now".
 */
import { body, fail, json } from '../lib/http';
import { metaGet, userFromToken, type Env } from '../lib/db';
import { ALERT_COPY, ALERT_FROM, ALERT_TO, checkAiTools, lastMail, readAlerts, runAiHealth } from '../lib/aiHealth';

interface Req { token?: string; action?: string }

export async function handleAiHealth(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this needs a current session.', 401, { code: 'unauthorised' });
  if (!(user.role === 'agency' && !user.accountId)) return fail('Only the owner of this installation can see its AI health.', 403, { code: 'not_owner' });
  const act = String(d.action ?? 'status');
  if (act !== 'status' && act !== 'run') return fail(`"${act}" is not something this endpoint does.`);
  const run = act === 'run' ? await runAiHealth(env, { force: true }) : null;
  const [tools, alerts, mail, checkedAt] = await Promise.all([checkAiTools(env), readAlerts(env), lastMail(env), metaGet(env.DB, 'ai_health_checked_at').catch(() => null)]);
  return json({
    success: true, checkedAt, tools, alerts, mail, run,
    recipients: { to: ALERT_TO, copy: ALERT_COPY, from: ALERT_FROM },
  });
}
