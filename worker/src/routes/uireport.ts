/**
 * Dead ends reported by the app's own screens, and the owner's view of them.
 *
 * `report` comes from services/fieldGuard.ts when a refused request named a
 * form field the screen does not show — the class of fault where a customer is
 * told to fill in a box that is not there. It needs a session (only people
 * using the app can hit a dead end in it), is rate-limited per account, and is
 * folded into one counted row per (endpoint, field, screen).
 *
 * `list` and `clear` are the install owner's alone: these are faults in the
 * product, not in any one workspace, and the owner is who fixes the product.
 */
import { body, fail, json } from '../lib/http';
import { nowIso, userFromToken, type Env, type SessionUser } from '../lib/db';
import { rateLimit } from '../lib/rateLimit';

interface ReportBody {
  token?: string; action?: string; kind?: string;
  field?: string; message?: string; path?: string; api?: string; id?: string;
}

const isOwner = (u: SessionUser) => u.role === 'agency' && !u.accountId;
const clip = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

export async function handleUiReport(req: Request, env: Env): Promise<Response> {
  const d = await body<ReportBody>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });
  const action = String(d.action ?? '');

  if (action === 'report') {
    const api = clip(d.api, 80);
    const field = clip(d.field, 80);
    const path = clip(d.path, 160);
    /* Shapes only: an endpoint, a dotted field name, a path. Anything else is
       not a report this app's screens would make. */
    if (!/^\/api\/[\w-]+\.php$/.test(api) || !/^[\w.\-]{1,80}$/.test(field) || !path.startsWith('/')) {
      return fail('Not a report this app makes.', 400);
    }
    const limit = await rateLimit(env, { what: 'uireport', who: user.accountId || user.email, max: 30, windowSeconds: 3600 });
    if (!limit.allowed) return json({ success: true, dropped: true });
    const now = nowIso();
    await env.DB.prepare(
      `INSERT INTO crm_ui_reports (id, kind, api, field, path, message, account_id, first_at, last_at, hits)
       VALUES (?, 'dead_end', ?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(kind, api, field, path) DO UPDATE SET
         hits = crm_ui_reports.hits + 1, last_at = excluded.last_at, message = excluded.message`,
    ).bind(`ui-${crypto.randomUUID()}`, api, field, path, clip(d.message, 300), user.accountId ?? null, now, now).run();
    return json({ success: true });
  }

  if (!isOwner(user)) return fail('Only the install owner can see these.', 403);

  if (action === 'list') {
    const { results } = await env.DB.prepare(
      'SELECT id, kind, api, field, path, message, first_at AS firstAt, last_at AS lastAt, hits FROM crm_ui_reports ORDER BY last_at DESC LIMIT 100',
    ).all().catch(() => ({ results: [] }));
    return json({ success: true, reports: results ?? [] });
  }

  if (action === 'clear') {
    const id = clip(d.id, 80);
    if (id) await env.DB.prepare('DELETE FROM crm_ui_reports WHERE id = ?').bind(id).run();
    else await env.DB.prepare('DELETE FROM crm_ui_reports').run();
    return json({ success: true });
  }

  return fail(`"${action}" is not something this endpoint does.`);
}
