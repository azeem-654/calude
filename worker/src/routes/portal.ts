/**
 * /api/portal.php — the report a reseller's client can open, and nothing else.
 *
 * ── The rule this file exists to enforce ──
 *
 * `view` answers to nobody signed in. A stranger with a link gets a reply. So
 * every assumption the rest of the app makes has to be re-earned here, and the
 * shape of the answer is the enforcement: the view builds a fresh object with
 * named fields, rather than selecting rows and handing them over. A column
 * added to `crm_projects` next year cannot leak through a `SELECT *` that does
 * not exist.
 *
 * What a link holder can see: the name of their own project, which stage its
 * work has reached, what was done and when, and how many of the things they
 * were promised have happened. That is a status report.
 *
 * What they cannot see, and why each one is named rather than assumed:
 *
 *  - **Any other client.** The token is scoped to one portfolio, and every
 *    query filters on it. A reseller with four clients in one workspace can
 *    hand out four links that cannot see each other.
 *  - **Money.** Not the retail price, not the cost, not the margin, not the
 *    supplier balance. A client learning their agency's markup is a
 *    relationship ending.
 *  - **Contacts.** The leads are the reseller's asset and the reason the client
 *    pays them. A report that lists them is a report that replaces the agency.
 *  - **Anything a provider said.** Same rule as everywhere: `detail` is ours,
 *    `last_error` is theirs, and only ours travels.
 *  - **Settings, credentials, other workspaces.** There is no action here that
 *    can reach them.
 */
import { body, fail, json } from '../lib/http';
import { nowIso, userFromToken, workspaceAccess, type Env } from '../lib/db';

interface Req {
  token?: string;
  accountId?: string;
  action?: string;
  [k: string]: unknown;
}

/**
 * The link itself, and the whole credential.
 *
 * 32 bytes of crypto randomness in base32 — more entropy than any password
 * somebody would choose, and safe in a URL without escaping. Guessing is not a
 * strategy against it, which is what lets the link be the only check.
 */
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  return [...bytes].map(b => alphabet[b % alphabet.length]).join('');
}

function parse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/**
 * How far along a board is, from the board itself.
 *
 * Counted rather than stored: a stored percentage is a number that stops being
 * true the moment somebody moves a card, and the whole point of this report is
 * that the client sees the same thing the agency does.
 */
function boardProgress(stages: Array<{ name: string; deals?: unknown[] }>): {
  stages: Array<{ name: string; count: number }>;
  total: number;
  done: number;
} {
  const rows = stages.map(s => ({ name: s.name, count: (s.deals ?? []).length }));
  const total = rows.reduce((n, r) => n + r.count, 0);
  /* The last stage is "done" by construction in every set this app generates —
     Customer, Selling, Won, Done. Counting it as finished is honest and needs
     no extra field. */
  const done = rows.length ? rows[rows.length - 1].count : 0;
  return { stages: rows, total, done };
}

export async function handlePortal(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const act = String(d.action ?? '').trim();

  /* ── Public: the report ───────────────────────────────────────────────── */

  if (act === 'view') {
    const token = String(d.portalToken ?? '').trim().toLowerCase();
    /* Length checked before the query. A one-character token should not become
       a database round trip, and it is never a real one. */
    if (token.length < 24) return fail('That link is not valid.', 404, { code: 'no_portal' });

    const portal = await env.DB.prepare(
      `SELECT account_id AS accountId, portfolio_id AS portfolioId, label, enabled, expires_at AS expiresAt
       FROM crm_client_portals WHERE token = ?`,
    ).bind(token).first<{ accountId: string; portfolioId: string; label: string; enabled: number; expiresAt: string | null }>();

    /*
     * One answer for missing, switched off and expired.
     *
     * Telling a caller which of the three it is tells somebody holding a
     * revoked link that it *was* real, and tells somebody guessing that they
     * found a token. "This link is no longer available" covers all three and
     * costs a legitimate viewer nothing — they will ask the person who sent it.
     */
    const gone = !portal
      || portal.enabled !== 1
      || (portal.expiresAt ? portal.expiresAt < nowIso() : false);
    if (gone) return fail('This link is no longer available. Ask whoever sent it for a new one.', 404, { code: 'no_portal' });

    const pf = await env.DB.prepare(
      'SELECT name, profile FROM crm_portfolios WHERE id = ? AND account_id = ?',
    ).bind(portal.portfolioId, portal.accountId).first<{ name: string; profile: string }>();

    /* The projects for this client, and only this client. */
    const { results: projects } = await env.DB.prepare(
      `SELECT id, name, objective, status, created_at AS createdAt
       FROM crm_projects WHERE account_id = ? AND portfolio_id = ?
       ORDER BY created_at`,
    ).bind(portal.accountId, portal.portfolioId).all<{
      id: string; name: string; objective: string; status: string; createdAt: string;
    }>();

    const projectIds = (projects ?? []).map(p => p.id);

    /*
     * What was done, in our words.
     *
     * `detail` and `summary` only — never `because` (which reasons about the
     * client's own data) and never `last_error` (which is the provider's). And
     * only finished work: a queued action is a plan, and a client reading a plan
     * as a promise is how an agency ends up explaining why something did not
     * happen.
     */
    let activity: Array<{ summary: string; detail: string; at: string }> = [];
    if (projectIds.length) {
      const holes = projectIds.map(() => '?').join(',');
      const { results } = await env.DB.prepare(
        `SELECT summary, detail, acted_at AS at
         FROM crm_autopilot_actions
         WHERE account_id = ? AND project_id IN (${holes}) AND status = 'done' AND kind != 'error'
         ORDER BY acted_at DESC LIMIT 40`,
      ).bind(portal.accountId, ...projectIds).all<{ summary: string; detail: string; at: string }>();
      activity = (results ?? []).map(r => ({
        summary: String(r.summary ?? ''),
        detail: String(r.detail ?? '').slice(0, 300),
        at: String(r.at ?? ''),
      }));
    }

    /*
     * The boards, read from the workspace's own storage.
     *
     * Only the pipelines belonging to this client's projects — matched on the
     * projectId marker the generator writes — so a workspace's other boards are
     * not merely filtered out of the render, they never leave the Worker.
     */
    const { dataGet } = await import('../lib/db');
    const pipelines = parse<Array<{ name?: string; projectId?: string; stages?: Array<{ name?: string; deals?: unknown[] }> }>>(
      await dataGet(env.DB, portal.accountId, 'crm_pipelines'), [],
    ).filter(p => p.projectId && projectIds.includes(p.projectId));

    const boards = pipelines.map(p => ({
      name: String(p.name ?? 'Project'),
      ...boardProgress((p.stages ?? []).map(s => ({ name: String(s.name ?? ''), deals: s.deals }))),
    }));

    /* Counted, because a client asks "how much have you done" and a number
       answers it better than a list they have to tally themselves. */
    await env.DB.prepare(
      'UPDATE crm_client_portals SET views = views + 1, last_viewed_at = ? WHERE token = ?',
    ).bind(nowIso(), token).run();

    const prof = parse<Record<string, string>>(pf?.profile ?? '{}', {});

    /*
     * Built field by field.
     *
     * Not a row handed over. A column added to any of these tables later cannot
     * appear here by accident, which is the difference between a boundary and a
     * habit.
     */
    return json({
      success: true,
      report: {
        client: pf?.name ?? prof.companyName ?? 'Your project',
        label: portal.label,
        projects: (projects ?? []).map(p => ({
          name: p.name,
          objective: p.objective,
          /* Running or paused. Never the guardrails, never the buying mode. */
          live: p.status === 'running' || p.status === 'learning',
          since: p.createdAt,
        })),
        boards,
        activity,
        generatedAt: nowIso(),
      },
    });
  }

  /* ── Everything else is the reseller managing their own links ─────────── */

  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });

  const accountId = String(d.accountId ?? '').trim();
  if (!accountId) return fail('Which workspace?');
  const access = await workspaceAccess(env.DB, user, accountId);
  if (!access.ok) return fail(access.message ?? 'That workspace is not yours.', 403, { code: access.code });

  const listPortals = async () => {
    const { results } = await env.DB.prepare(
      `SELECT p.token, p.portfolio_id AS portfolioId, p.label, p.enabled,
              p.expires_at AS expiresAt, p.views, p.last_viewed_at AS lastViewedAt,
              p.created_at AS createdAt,
              COALESCE(f.name, '') AS clientName
       FROM crm_client_portals p
       LEFT JOIN crm_portfolios f ON f.id = p.portfolio_id
       WHERE p.account_id = ? ORDER BY p.created_at DESC`,
    ).bind(accountId).all();
    return results ?? [];
  };

  if (act === 'list') return json({ success: true, portals: await listPortals() });

  if (act === 'create') {
    const portfolioId = String(d.portfolioId ?? '').trim();
    const pf = await env.DB.prepare('SELECT name FROM crm_portfolios WHERE id = ? AND account_id = ?')
      .bind(portfolioId, accountId).first<{ name: string }>();
    if (!pf) return fail('That client is not in this workspace.');

    /* One live link per client, so revoking is unambiguous. A reseller who
       wants a fresh token revokes and makes another, rather than wondering
       which of three they sent to whom. */
    const existing = await env.DB.prepare(
      'SELECT token FROM crm_client_portals WHERE account_id = ? AND portfolio_id = ? AND enabled = 1',
    ).bind(accountId, portfolioId).first<{ token: string }>();
    if (existing) return json({ success: true, token: existing.token, portals: await listPortals() });

    const token = newToken();
    const now = nowIso();
    await env.DB.prepare(
      `INSERT INTO crm_client_portals
       (token, account_id, portfolio_id, label, enabled, expires_at, views, created_at, updated_at)
       VALUES (?,?,?,?,1,NULL,0,?,?)`,
    ).bind(token, accountId, portfolioId, `${pf.name} — progress`.slice(0, 120), now, now).run();

    return json({ success: true, token, portals: await listPortals() });
  }

  if (act === 'revoke' || act === 'enable') {
    const token = String(d.portalToken ?? '').trim().toLowerCase();
    const res = await env.DB.prepare(
      'UPDATE crm_client_portals SET enabled = ?, updated_at = ? WHERE token = ? AND account_id = ?',
    ).bind(act === 'enable' ? 1 : 0, nowIso(), token, accountId).run();
    if (!res.meta.changes) return fail('That link is not in this workspace.', 403);
    return json({ success: true, portals: await listPortals() });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}
