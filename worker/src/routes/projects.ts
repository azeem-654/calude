/**
 * Projects, and the client portfolios they speak for.
 *
 * ── What a project is ──
 *
 * One push, for one client, with its own objective and its own execution: a
 * dental practice's client-acquisition campaign, a gym's membership drive.
 * A workspace can run several at once. Each writes from a portfolio, and many
 * projects can share one — a client with three services is described once and
 * pushed three ways, so correcting their description corrects all three.
 *
 * ── Why this replaced the AI Sales Agent ──
 *
 * That module had the same job: an objective, a plan, a set of generated
 * campaigns. Two brains in two menus is the single thing most likely to leave
 * a customer unable to say which one to open, so there is one brain, and a
 * project is what one of its campaigns used to be. Prospecting — the part with
 * real cost attached — came across as a project capability, held for approval
 * the first time like every other channel that reaches a stranger.
 */
import { body, fail, json } from '../lib/http';
import { canAccess, nowIso, userFromToken, type Env } from '../lib/db';

interface Req {
  token?: string;
  action?: string;
  accountId?: string;
  id?: string;
  /* Projects */
  name?: string;
  objective?: string;
  portfolioId?: string;
  status?: string;
  kind?: string;
  guardrails?: Record<string, string>;
  /* Portfolios */
  profile?: Record<string, unknown>;
  source?: string;
}

const rid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * The permissions a new project starts with.
 *
 * Everything that reaches a person it has not spoken to before waits for a
 * human the first time. Writing does not: a draft nobody sent costs nothing,
 * and making somebody approve each one is how a hands-off product becomes a
 * queue of chores.
 */
const DEFAULT_GUARDRAILS = {
  createWorkflows: 'on',
  activateWorkflows: 'approval',
  sendEmail: 'approval',
  sendSms: 'approval',
  bookAppointments: 'on',
  /* Finding and importing strangers. Approval-gated for the same reason
     sending is, and separately, because a customer may be happy to email a
     list they own long before they are happy to have one built for them. */
  findProspects: 'approval',
};

const STATUSES = new Set(['off', 'learning', 'running', 'paused']);

/**
 * What a project can be for. Each plans a different set of work — see
 * lib/autopilotPlan.ts. 'general' plans everything and is what projects made
 * before kinds existed still are.
 */
const KINDS = new Set(['leadgen', 'consultancy', 'ecommerce', 'general']);

export async function handleProjects(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });

  const accountId = String(d.accountId ?? '').trim();
  if (!/^[A-Za-z0-9_.\-]{1,64}$/.test(accountId)) return fail('A valid workspace is required.');
  if (!(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours.', 403);

  const act = d.action ?? 'get';

  const listPortfolios = async () => {
    const { results } = await env.DB.prepare(
      `SELECT id, name, profile, source, created_at AS createdAt, updated_at AS updatedAt
       FROM crm_portfolios WHERE account_id = ? ORDER BY created_at LIMIT 200`,
    ).bind(accountId).all();
    return (results ?? []).map(r => {
      const row = r as Record<string, unknown>;
      let profile: unknown = {};
      try { profile = JSON.parse(String(row.profile ?? '{}')); } catch { profile = {}; }
      return { ...row, profile };
    });
  };

  const listProjects = async () => {
    /* The counts a board needs, read in the same query rather than one per
       project — a workspace with a dozen projects would otherwise cost a dozen
       round trips to draw one screen. */
    const { results } = await env.DB.prepare(
      `SELECT j.id, j.portfolio_id AS portfolioId, j.name, j.objective, j.kind, j.status,
              j.guardrails, j.purchase_mode AS purchaseMode, j.pool_target AS poolTarget,
              j.last_planned_at AS lastPlannedAt, j.last_acted_at AS lastActedAt,
              j.last_error AS lastError, j.created_at AS createdAt,
              COALESCE(p.name, '') AS portfolioName,
              (SELECT count(*) FROM crm_autopilot_actions a
                WHERE a.project_id = j.id AND a.status = 'awaiting') AS awaiting,
              (SELECT count(*) FROM crm_autopilot_actions a
                WHERE a.project_id = j.id AND a.status = 'done') AS done,
              (SELECT count(*) FROM crm_autopilot_actions a
                WHERE a.project_id = j.id AND a.status = 'failed') AS failed
       FROM crm_projects j
       LEFT JOIN crm_portfolios p ON p.id = j.portfolio_id
       WHERE j.account_id = ? ORDER BY j.created_at LIMIT 100`,
    ).bind(accountId).all();
    return (results ?? []).map(r => {
      const row = r as Record<string, unknown>;
      let guardrails: unknown = {};
      try { guardrails = JSON.parse(String(row.guardrails ?? '{}')); } catch { guardrails = {}; }
      return { ...row, guardrails };
    });
  };

  /** The cards on one project's column. */
  const cardsFor = async (projectId: string) => {
    const { results } = await env.DB.prepare(
      `SELECT id, kind, status, summary, because, detail, counts,
              link_kind AS linkKind, link_id AS linkId, link_label AS linkLabel,
              link_route AS linkRoute, created_at AS createdAt, acted_at AS actedAt
       FROM crm_autopilot_actions
       WHERE account_id = ? AND project_id = ?
       ORDER BY created_at DESC LIMIT 60`,
    ).bind(accountId, projectId).all();
    return (results ?? []).map(r => {
      const row = r as Record<string, unknown>;
      let counts: unknown = {};
      try { counts = JSON.parse(String(row.counts ?? '{}')); } catch { counts = {}; }
      return { ...row, counts };
    });
  };

  if (act === 'get') {
    const projects = await listProjects();
    /* Every project's cards, in one answer. The board draws all the columns at
       once and a second round trip per column is a visibly staggered screen. */
    const board: Record<string, unknown> = {};
    for (const p of projects) {
      const id = String((p as Record<string, unknown>).id ?? '');
      if (id) board[id] = await cardsFor(id);
    }
    return json({ success: true, projects, portfolios: await listPortfolios(), board });
  }

  /* ── Portfolios ── */
  if (act === 'save_portfolio') {
    const id = String(d.id ?? '').trim() || rid('pf');
    const name = String(d.name ?? '').trim();
    if (!name) return fail('A portfolio needs the client’s name.');
    const now = nowIso();
    const existing = await env.DB.prepare('SELECT created_at FROM crm_portfolios WHERE id = ? AND account_id = ?')
      .bind(id, accountId).first<{ created_at: string }>();
    await env.DB.prepare(
      `INSERT INTO crm_portfolios (id, account_id, name, profile, source, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, profile=excluded.profile, source=excluded.source,
         updated_at=excluded.updated_at`,
    ).bind(
      id, accountId, name.slice(0, 160),
      JSON.stringify(d.profile ?? {}).slice(0, 200_000),
      ['manual', 'url'].includes(String(d.source)) ? String(d.source) : 'manual',
      existing?.created_at ?? now, now,
    ).run();
    return json({ success: true, id, portfolios: await listPortfolios() });
  }

  if (act === 'delete_portfolio') {
    const id = String(d.id ?? '').trim();
    /* Refused while anything still speaks for it. Deleting it out from under a
       project would leave that project writing in a voice nobody chose. */
    const used = await env.DB.prepare('SELECT count(*) AS n FROM crm_projects WHERE portfolio_id = ? AND account_id = ?')
      .bind(id, accountId).first<{ n: number }>();
    if ((used?.n ?? 0) > 0) {
      return fail(`${used?.n} project${used?.n === 1 ? '' : 's'} still write${used?.n === 1 ? 's' : ''} from this portfolio. Point ${used?.n === 1 ? 'it' : 'them'} at another one first.`);
    }
    await env.DB.prepare('DELETE FROM crm_portfolios WHERE id = ? AND account_id = ?').bind(id, accountId).run();
    return json({ success: true, portfolios: await listPortfolios() });
  }

  /* ── Projects ── */
  if (act === 'save_project') {
    const id = String(d.id ?? '').trim() || rid('pj');
    const name = String(d.name ?? '').trim();
    if (!name) return fail('Give the project a name — it is how you will tell it from the others.');

    const objective = String(d.objective ?? '').trim();
    if (objective.length < 8) {
      return fail('Say what you want this project to achieve — a sentence is enough, in your own words.');
    }

    const portfolioId = String(d.portfolioId ?? '').trim();
    if (!portfolioId) return fail('Choose which client this project is for.');
    const pf = await env.DB.prepare('SELECT 1 AS n FROM crm_portfolios WHERE id = ? AND account_id = ?')
      .bind(portfolioId, accountId).first();
    if (!pf) return fail('That portfolio is not in this workspace.');

    const kind = String(d.kind ?? '') || 'general';
    if (!KINDS.has(kind)) return fail(`"${d.kind}" is not a kind of project this app runs.`);

    const now = nowIso();
    const existing = await env.DB.prepare('SELECT created_at, guardrails, status FROM crm_projects WHERE id = ? AND account_id = ?')
      .bind(id, accountId).first<{ created_at: string; guardrails: string; status: string }>();

    /* Guardrails survive an edit. Somebody who opened sending up once should
       not be asked again because they reworded the objective. */
    let guardrails = DEFAULT_GUARDRAILS as Record<string, string>;
    if (existing) {
      try { guardrails = { ...DEFAULT_GUARDRAILS, ...JSON.parse(existing.guardrails) as Record<string, string> }; }
      catch { /* keep the defaults */ }
    }
    if (d.guardrails) guardrails = { ...guardrails, ...d.guardrails };

    await env.DB.prepare(
      `INSERT INTO crm_projects
       (id, account_id, portfolio_id, name, objective, kind, status, guardrails,
        purchase_mode, pool_target, last_error, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?, 'byo', '{}', '', ?,?)
       ON CONFLICT(id) DO UPDATE SET
         portfolio_id=excluded.portfolio_id, name=excluded.name,
         objective=excluded.objective, kind=excluded.kind, status=excluded.status,
         guardrails=excluded.guardrails, last_error='', updated_at=excluded.updated_at`,
    ).bind(
      id, accountId, portfolioId, name.slice(0, 160), objective.slice(0, 2000),
      kind, existing?.status ?? 'learning', JSON.stringify(guardrails),
      existing?.created_at ?? now, now,
    ).run();

    return json({ success: true, id, projects: await listProjects() });
  }

  if (act === 'set_status') {
    const id = String(d.id ?? '').trim();
    const status = String(d.status ?? '');
    if (!STATUSES.has(status)) return fail(`"${d.status}" is not a state a project can be in.`);
    const res = await env.DB.prepare('UPDATE crm_projects SET status = ?, updated_at = ? WHERE id = ? AND account_id = ?')
      .bind(status, nowIso(), id, accountId).run();
    if (!res.meta.changes) return fail('That project is not in this workspace.');
    return json({ success: true, projects: await listProjects() });
  }

  if (act === 'delete_project') {
    const id = String(d.id ?? '').trim();
    /* The history goes with it. An action list belonging to a project nobody
       can open is a board that shows work with no home. */
    await env.DB.batch([
      env.DB.prepare('DELETE FROM crm_autopilot_actions WHERE project_id = ? AND account_id = ?').bind(id, accountId),
      env.DB.prepare('DELETE FROM crm_projects WHERE id = ? AND account_id = ?').bind(id, accountId),
    ]);
    return json({ success: true, projects: await listProjects() });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}
