/**
 * /api/allowances.php — what each plan allows, and what a workspace has used.
 *
 *   plans       no session. The packages as the server holds them (with the
 *               owner's changes), for the public site's pricing and Plan &
 *               billing — so a card can only show a number that is enforced.
 *   status      session + workspaceAccess. Every meter: used, allowed, when it
 *               starts again. The Usage card and the board's meter strip.
 *   check       session + workspaceAccess. "May I make `need` more of this?"
 *               before a screen starts something long (the wizard's build).
 *               Answers the same refusal the making would.
 *   set_limits  the install owner only. Changes one plan's numbers.
 *
 * The rules are lib/allowances.ts; the reads lib/allowanceStore.ts.
 */
import { body, fail, json } from '../lib/http';
import { nowIso, userFromToken, workspaceAccess, type Env } from '../lib/db';
import {
  INCLUDED, PLAN_KEYS, TRIAL_LIMITS, TRIAL_NAME, cleanLimit, effectivePlans, meterOf, applyOverrides, type MeterId,
} from '../lib/allowances';
import { check, loadOverrides, readAll, refusalBody } from '../lib/allowanceStore';

interface Req {
  token?: string;
  action?: string;
  accountId?: string;
  meter?: string;
  need?: number;
  projectId?: string;
  planId?: string;
  limits?: Record<string, unknown>;
}

export async function handleAllowances(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const act = String(d.action ?? '');

  if (act === 'plans') {
    const over = await loadOverrides(env);
    return json({
      success: true,
      plans: effectivePlans(over),
      trial: { name: TRIAL_NAME, limits: applyOverrides(TRIAL_LIMITS, over.trial) },
      included: INCLUDED,
      changed: Object.keys(over),
    });
  }

  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this needs a current session.', 401, { code: 'unauthorised' });

  if (act === 'set_limits') {
    if (!(user.accountId === null && user.role === 'agency')) return fail('Only the owner of this installation can change what a plan allows.', 403, { code: 'not_owner' });
    const planId = String(d.planId ?? '');
    if (!(PLAN_KEYS as string[]).includes(planId) && planId !== 'trial') return fail('Choose one of the plans.', 200, { field: 'plans.plan' });
    const stmts: D1PreparedStatement[] = [];
    for (const [k, raw] of Object.entries(d.limits ?? {})) {
      if (!meterOf(k)) return fail(`"${k}" is not something a plan counts.`);
      /* Blank puts the plan's own number back. */
      if (raw === '' || raw === null) {
        stmts.push(env.DB.prepare('DELETE FROM crm_plan_limits WHERE plan_id = ? AND meter = ?').bind(planId, k));
        continue;
      }
      const v = cleanLimit(raw);
      if (v === null) return fail(`${meterOf(k)!.label}: a whole number, or −1 for unlimited.`, 200, { field: `plans.${k}` });
      stmts.push(env.DB.prepare(
        `INSERT INTO crm_plan_limits (plan_id, meter, value, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(plan_id, meter) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      ).bind(planId, k as MeterId, v, nowIso(), user.email));
    }
    if (stmts.length) await env.DB.batch(stmts);
    const over = await loadOverrides(env);
    return json({ success: true, plans: effectivePlans(over), trial: { name: TRIAL_NAME, limits: applyOverrides(TRIAL_LIMITS, over.trial) }, changed: Object.keys(over) });
  }

  const accountId = String(d.accountId ?? '').trim();
  if (!/^[A-Za-z0-9_.\-]{1,64}$/.test(accountId)) return fail('A valid workspace is required.', 400, { code: 'no_workspace' });
  const access = await workspaceAccess(env.DB, user, accountId);
  if (!access.ok) return fail(access.message ?? 'That workspace is not yours.', 403, { code: access.code });

  if (act === 'status') return json({ success: true, allowances: await readAll(env, accountId) });

  if (act === 'check') {
    const meter = meterOf(String(d.meter ?? ''));
    if (!meter) return fail('Which allowance?');
    const need = Math.max(1, Math.min(10_000, Math.round(Number(d.need) || 1)));
    const projectId = String(d.projectId ?? '').slice(0, 80);
    if (projectId) {
      const own = await env.DB.prepare('SELECT 1 AS x FROM crm_projects WHERE id = ? AND account_id = ?').bind(projectId, accountId).first();
      if (!own) return fail('That project is not in this workspace.', 404, { code: 'not_found' });
    }
    const r = await check(env, accountId, meter.id, need, { projectId });
    if (r.ok) return json({ success: true, ok: true, left: r.left });
    /* Answered, not failed: the question was asked properly, and "no" is the answer. */
    return json({ success: true, ok: false, error: r.message, message: r.message, ...refusalBody(r) });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}
