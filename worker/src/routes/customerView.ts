/**
 * /api/customer-view.php — one customer, on one screen, for the install owner (OPS-2).
 *
 * Support used to mean opening five screens and the database console to answer
 * "what plan is this person on, what have they used, and what went wrong for
 * them". This answers it in one read: their account and workspaces, plan and
 * this month's usage, recent failed Autopilot steps, video jobs and sends,
 * crash reports from their screens, and the audit trail — theirs and the
 * operator's actions on them. Read-only; owner only; never a secret, a
 * message body or a contact list.
 */
import { body, fail, json } from '../lib/http';
import { userFromToken, type Env, type SessionUser } from '../lib/db';
import { readAll } from '../lib/allowanceStore';

const isOwner = (u: SessionUser) => u.role === 'agency' && !u.accountId;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function handleCustomerView(req: Request, env: Env): Promise<Response> {
  const d = await body<{ token?: string; email?: string }>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this needs a current session.', 401, { code: 'unauthorised' });
  if (!isOwner(user)) return fail('Only the install owner can look up customers.', 403, { code: 'not_owner' });
  const email = String(d.email ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) return fail('Type the customer’s email address.', 200, { field: 'customer.email' });

  const who = await env.DB.prepare('SELECT email, name, role, account_id AS accountId, created_at AS createdAt, trial_ends_at AS trialEndsAt FROM crm_users WHERE email = ?')
    .bind(email).first<{ email: string; name: string; role: string; accountId: string | null; createdAt: string; trialEndsAt: string | null }>().catch(() => null);
  if (!who) return fail('No account uses that address.', 200, { field: 'customer.email' });

  const ws = await env.DB.prepare('SELECT account_id AS id, created_at AS createdAt, industry FROM crm_workspaces WHERE owner_email = ? ORDER BY created_at LIMIT 100')
    .bind(email).all<{ id: string; createdAt: string; industry: string }>().catch(() => ({ results: [] as { id: string; createdAt: string; industry: string }[] }));
  const ids = [...new Set([who.accountId, ...(ws.results ?? []).map(w => w.id)].filter((x): x is string => !!x))].slice(0, 100);
  const inIds = ids.length ? `account_id IN (${ids.map(() => '?').join(',')})` : '1 = 0';
  const rows = async <T,>(q: string, ...extra: unknown[]): Promise<T[]> =>
    (await env.DB.prepare(q).bind(...ids, ...extra).all<T>().catch(() => ({ results: [] as T[] }))).results ?? [];

  const plan = await env.DB.prepare('SELECT plan_id AS planId, source, updated_at AS updatedAt FROM crm_plans WHERE owner_email = ?')
    .bind(email).first().catch(() => null);
  const usage = who.accountId ? await readAll(env, who.accountId).catch(() => null) : null;

  const [autopilot, jobs, sends, crashes, audit, onThem] = await Promise.all([
    rows(`SELECT account_id AS accountId, kind, status, summary, detail, created_at AS at FROM crm_autopilot_actions WHERE ${inIds} AND status = 'failed' ORDER BY created_at DESC LIMIT 15`),
    rows(`SELECT account_id AS accountId, kind, state, error, updated_at AS at FROM crm_video_jobs WHERE ${inIds} AND state IN ('failed', 'dead') ORDER BY updated_at DESC LIMIT 15`),
    rows(`SELECT account_id AS accountId, channel, recipient, status, detail, created_at AS at FROM crm_delivery_log WHERE ${inIds} AND status NOT IN ('sent', 'delivered', 'suppressed') ORDER BY created_at DESC LIMIT 15`),
    rows(`SELECT account_id AS accountId, kind, field, path, message, hits, last_at AS at FROM crm_ui_reports WHERE ${inIds} ORDER BY last_at DESC LIMIT 15`),
    env.DB.prepare('SELECT at, kind, detail, account_id AS accountId FROM crm_audit_events WHERE actor_email = ? ORDER BY at DESC LIMIT 25').bind(email).all().then(r => r.results ?? []).catch(() => []),
    /* The owner's own actions that name this customer. */
    env.DB.prepare("SELECT at, kind, detail FROM crm_audit_events WHERE kind LIKE 'operator_%' AND detail LIKE ? ORDER BY at DESC LIMIT 25").bind(`%${email}%`).all().then(r => r.results ?? []).catch(() => []),
  ]);

  return json({
    success: true,
    customer: { ...who, workspaces: ws.results ?? [], plan, usage, autopilot, jobs, sends, crashes, audit, operatorActions: onThem },
  });
}
