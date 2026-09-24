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
import { canAccess, foreignId, nowIso, userFromToken, type Env } from '../lib/db';
import { gate as contentGate } from '../lib/contentGate';
import { askGemini, loadAiKey } from '../lib/ai';
import { readSite } from '../lib/readSite';
import { ensureProjectPipeline } from '../lib/projectPipeline';
import { sanitiseBrief } from '../lib/projectBrief';

interface Req {
  token?: string;
  action?: string;
  accountId?: string;
  id?: string;
  /* Projects */
  name?: string;
  objective?: string;
  /** Optional numbers the starter tasks are planned against. 0 means not said. */
  revenueTarget?: number;
  volumeTarget?: number;
  goals?: unknown;
  /** The build order the wizard showed, kept as it was shown. */
  launchSteps?: unknown;
  /** The blueprint the customer approved. See lib/projectBrief.ts. */
  brief?: unknown;
  portfolioId?: string;
  status?: string;
  kind?: string;
  guardrails?: Record<string, string>;
  /* One permission, for `set_guardrail`. */
  key?: string;
  value?: string;
  /* Infrastructure, per project */
  purchaseMode?: string;
  domains?: number;
  mailboxesPerDomain?: number;
  /* Portfolios */
  profile?: Record<string, unknown>;
  source?: string;
  url?: string;
  text?: string;
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
              j.revenue_target AS revenueTarget, j.volume_target AS volumeTarget, j.goals,
              j.last_planned_at AS lastPlannedAt, j.last_acted_at AS lastActedAt,
              j.last_error AS lastError, j.created_at AS createdAt,
              /* The build order the customer agreed to in the wizard. Sent so a
                 project that has not produced anything yet can show what it is
                 working through rather than an empty frame — real steps with a
                 real count, never a bar on a timer. */
              j.launch_steps AS launchSteps,
              j.brief,
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
      /* Parsed here so a row whose JSON cannot be read arrives as an empty plan
         rather than taking the whole board down on one bad record. */
      let launchSteps: unknown = [];
      try { launchSteps = JSON.parse(String(row.launchSteps ?? '[]')); } catch { launchSteps = []; }
      /* The same for the blueprint: an unreadable one is no blueprint, and the
         project page falls back to what it showed before briefs existed. */
      let brief: unknown = null;
      try { brief = JSON.parse(String(row.brief ?? '{}')); } catch { brief = null; }
      const hasBrief = !!brief && typeof brief === 'object' && Object.keys(brief as object).length > 0;
      return {
        ...row, guardrails, launchSteps: Array.isArray(launchSteps) ? launchSteps : [],
        brief: hasBrief ? brief : null,
      };
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

    /*
     * The one entry point worth judging on its own.
     *
     * Everywhere else the question is "is this piece of writing acceptable".
     * Here it is "is this business". An adult site does not have to write
     * anything explicit for the answer to be no, and catching it once, at the
     * moment somebody describes what they do, is worth more than catching
     * every campaign it would go on to produce.
     *
     * Saved either way. Refusing to store it would lose the customer's work
     * and tell them nothing; what it does not get is a project that sends.
     */
    const profileText = `${name}\n${JSON.stringify(d.profile ?? {})}`;
    const verdict = await contentGate(env, accountId, 'portfolio', profileText);

    const now = nowIso();
    if (d.id && await foreignId(env, 'crm_portfolios', id, accountId)) return fail('That portfolio is not in this workspace.', 403);
    const existing = await env.DB.prepare('SELECT created_at FROM crm_portfolios WHERE id = ? AND account_id = ?')
      .bind(id, accountId).first<{ created_at: string }>();
    await env.DB.prepare(
      `INSERT INTO crm_portfolios (id, account_id, name, profile, source, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, profile=excluded.profile, source=excluded.source,
         updated_at=excluded.updated_at
       WHERE crm_portfolios.account_id = excluded.account_id`,
    ).bind(
      id, accountId, name.slice(0, 160),
      JSON.stringify(d.profile ?? {}).slice(0, 200_000),
      ['manual', 'url'].includes(String(d.source)) ? String(d.source) : 'manual',
      existing?.created_at ?? now, now,
    ).run();
    return json({
      success: true, id, portfolios: await listPortfolios(),
      /* Not an error — the portfolio saved. It is a warning that Autopilot will
         not run from it until somebody has looked, which is the thing they
         would otherwise discover by waiting for nothing to happen. */
      held: !verdict.ok,
      heldMessage: verdict.ok ? '' : verdict.message,
    });
  }

  /**
   * Read a client's own website and fill their portfolio from it.
   *
   * Everything Autopilot writes for a client is written from this profile, so
   * typing it out is the step people stall on — and the answers are already
   * published on the client's site.
   *
   * Two rules this refuses to bend:
   *
   *  - **It returns a draft; it does not save one.** The profile becomes the
   *    voice of every email, text and post that goes out under this client's
   *    name. A language model's reading of a marketing page is a good first
   *    draft and a bad thing to have silently become the truth, so a person
   *    sees it and presses save.
   *  - **It never guesses.** No AI key, no answer — not a plausible profile
   *    assembled from the company name. A page it could not read says so. A
   *    field the page did not answer comes back empty rather than filled with
   *    something that reads well.
   */
  /**
   * Read something written about a client and fill their portfolio from it.
   *
   * Two doors on one room: `read_url` fetches a page, `read_text` takes what
   * somebody pasted — an about page they copied, a brochure, an article, a
   * LinkedIn summary. Everything after "here is some text about a company" is
   * identical, so it is written once in `profileFrom` below.
   *
   * Two rules this refuses to bend:
   *
   *  - **It returns a draft; it does not save one.** The profile becomes the
   *    voice of every email, text and post that goes out under this client's
   *    name. A language model's reading of a marketing page is a good first
   *    draft and a bad thing to have silently become the truth, so a person
   *    sees it and presses save.
   *  - **It never guesses.** No AI key, no answer — not a plausible profile
   *    assembled from the company name. Text it could not make sense of says
   *    so. A field the source did not answer comes back empty rather than
   *    filled with something that reads well.
   */
  if (act === 'read_url' || act === 'read_text') {
    const key = await loadAiKey(env, accountId);
    if (!key) {
      return fail('No AI key is connected to this workspace, so nothing can be read into a portfolio. Add one under Settings \u2192 AI Engine, or fill the client in by hand.');
    }

    let title = '';
    let where = '';
    let text = '';

    if (act === 'read_url') {
      const site = await readSite(String(d.url ?? ''));
      if (!site.ok) return fail(site.error);
      title = site.title;
      where = site.url;
      text = site.text;
    } else {
      text = String(d.text ?? '').trim();
      /* Under about forty words there is nothing to extract, and a model given
         a sentence will happily invent the other six fields. */
      if (text.split(/\s+/).filter(Boolean).length < 40) {
        return fail('Paste a bit more \u2014 an about page, a brochure or an article. Under about forty words there is nothing in it to read, and guessing the rest is exactly what this must not do.');
      }
      text = text.slice(0, 12_000);
      where = 'what you pasted';
    }

    const prompt = [
      'You are reading material about a company to describe them for a marketing tool.',
      'Answer ONLY from the text given. If the text does not say, return an empty string for that field \u2014 never guess, never fill a gap with something plausible.',
      '',
      'Return JSON with exactly these keys:',
      '{"companyName":"","description":"","audience":"","offer":"","industry":"","tone":"","locations":""}',
      '',
      'companyName: what they call themselves.',
      'description: two or three sentences on what they actually do, in plain words.',
      'audience: who they sell to.',
      'offer: the specific services or products named.',
      'industry: one short label.',
      'tone: how they write \u2014 e.g. "plain and direct", "formal", "warm".',
      'locations: where they work, if the text says.',
      '',
      title ? `Page title: ${title}` : '',
      act === 'read_url' ? `Page address: ${where}` : '',
      '',
      'Text:',
      text,
    ].filter(Boolean).join('\n');

    /* Low temperature: this is extraction, not writing. */
    const ai = await askGemini(key, prompt, 0.15);
    if (!ai.ok) return fail(ai.error);

    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(ai.text) as Record<string, unknown>; } catch {
      return fail('The AI answered with something that was not a profile. Try again, or fill the client in by hand.');
    }

    const str = (k: string) => String(parsed[k] ?? '').trim().slice(0, 2000);
    const profile = {
      companyName: str('companyName'),
      description: str('description'),
      audience: str('audience'),
      offer: str('offer'),
      industry: str('industry'),
      tone: str('tone'),
      locations: str('locations'),
      website: act === 'read_url' ? where : '',
    };

    /* A source that yielded nothing usable is reported as that, not returned as
       an empty form somebody has to work out for themselves. */
    if (!profile.companyName && !profile.description) {
      return fail(act === 'read_url'
        ? 'That page did not say enough about the business to describe it. Try their home or about page, or fill the client in by hand.'
        : 'There was not enough about the business in that to describe it. Paste something that says who they are and what they sell.');
    }

    return json({
      success: true,
      profile,
      /* So the screen can say where this came from rather than presenting it
         as though a person had typed it. */
      readFrom: where,
      title,
    });
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

    /*
     * The numbers, clamped rather than trusted.
     *
     * Both optional: somebody who does not know their numbers yet must not be
     * blocked from starting, and a zero is stored as "not said" rather than as
     * a target of nothing. The ceiling is there because a typo in a revenue box
     * would otherwise reach a prompt as a billion-pound goal and produce advice
     * for a business that does not exist.
     */
    const revenueTarget = Math.min(Math.max(Math.round(Number(d.revenueTarget) || 0), 0), 100_000_000);
    const volumeTarget = Math.min(Math.max(Math.round(Number(d.volumeTarget) || 0), 0), 1_000_000);
    const goals = Array.isArray(d.goals)
      ? JSON.stringify((d.goals as unknown[]).map(g => String(g).slice(0, 40)).slice(0, 6))
      : '[]';

    /*
     * The build order the wizard displayed, stored as it was shown.
     *
     * Capped hard on both count and length: it arrives from a browser, it is
     * rendered as a checklist, and neither of those is a reason to accept a
     * megabyte. An edit that omits it keeps whatever the project already had —
     * the order was agreed once and reordering somebody's board because they
     * reworded the objective would be a surprise.
     */
    const launchSteps = Array.isArray(d.launchSteps)
      ? JSON.stringify(
        (d.launchSteps as unknown[]).slice(0, 12).map(raw => {
          const step = raw as { label?: unknown; why?: unknown; route?: unknown };
          return {
            label: String(step.label ?? '').slice(0, 120),
            why: String(step.why ?? '').slice(0, 400),
            /* An in-app path only. A step is rendered as a link, and a link
               somebody else supplied is a link somewhere else. */
            route: /^\/[A-Za-z0-9/?=&_-]{0,80}$/.test(String(step.route ?? '')) ? String(step.route) : '',
          };
        }).filter(s => s.label),
      )
      : null;

    /* Omitted on an edit, which keeps the one agreed at creation — the same rule
       as the launch steps. Refused outright when present and unusable, rather
       than saving a project whose page would then describe nothing. */
    const brief = d.brief === undefined ? null : sanitiseBrief(d.brief);
    if (d.brief !== undefined && brief === null) {
      return fail('The project blueprint could not be saved — it was not a blueprint, or it was far too large.');
    }

    const now = nowIso();
    /* An id that is somebody else's is refused, not upserted. `ON CONFLICT(id)`
       used to update the other workspace's row — their guardrails, their brief —
       while leaving it theirs; the WHERE on the upsert now stops that, and this
       says so instead of answering "saved". */
    if (d.id && await foreignId(env, 'crm_projects', id, accountId)) return fail('That project is not in this workspace.', 403);
    const existing = await env.DB.prepare('SELECT created_at, guardrails, status, launch_steps AS launchSteps, brief FROM crm_projects WHERE id = ? AND account_id = ?')
      .bind(id, accountId).first<{ created_at: string; guardrails: string; status: string; launchSteps: string; brief: string }>();

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
        purchase_mode, pool_target, revenue_target, volume_target, goals,
        launch_steps, brief, last_error, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?, 'byo', '{}', ?,?,?, ?, ?, '', ?,?)
       ON CONFLICT(id) DO UPDATE SET
         portfolio_id=excluded.portfolio_id, name=excluded.name,
         objective=excluded.objective, kind=excluded.kind, status=excluded.status,
         guardrails=excluded.guardrails, revenue_target=excluded.revenue_target,
         volume_target=excluded.volume_target, goals=excluded.goals,
         launch_steps=excluded.launch_steps, brief=excluded.brief,
         last_error='', updated_at=excluded.updated_at
       WHERE crm_projects.account_id = excluded.account_id`,
    ).bind(
      id, accountId, portfolioId, name.slice(0, 160), objective.slice(0, 2000),
      kind, existing?.status ?? 'learning', JSON.stringify(guardrails),
      revenueTarget, volumeTarget, goals,
      launchSteps ?? existing?.launchSteps ?? '[]',
      brief ?? existing?.brief ?? '{}',
      existing?.created_at ?? now, now,
    ).run();

    /*
     * A board for it, straight away.
     *
     * Done here rather than left to the tick because somebody who has just
     * created a project goes looking for it, and "your board arrives within the
     * hour" is not an answer. Failure is swallowed on purpose: a project that
     * exists without a board is a project, and refusing to create one because
     * the AI was slow would be the wrong trade.
     */
    try {
      const row = await env.DB.prepare(
        `SELECT id, account_id, name, kind, objective, portfolio_id,
                revenue_target AS revenueTarget, volume_target AS volumeTarget, goals,
                launch_steps AS launchSteps
         FROM crm_projects WHERE id = ? AND account_id = ?`,
      ).bind(id, accountId).first<{
        id: string; account_id: string; name: string; kind: string; objective: string;
        portfolio_id: string; revenueTarget: number; volumeTarget: number; goals: string;
        launchSteps: string;
      }>();
      if (row) await ensureProjectPipeline(env, row);
    } catch { /* the project stands on its own */ }

    return json({ success: true, id, projects: await listProjects() });
  }

  /**
   * What this project should have built for it, and who pays for it.
   *
   * ── The wire this reconnects ──
   *
   * The sending pool — buy domains, write SPF/DKIM/DMARC, create mailboxes,
   * warm them up — has been built and working for a long time. The tick reads
   * its target from `crm_projects.pool_target` and does nothing when that is
   * empty, on the deliberate principle that inventing a default would have
   * Autopilot proposing to spend a customer's money on domains nobody asked
   * for.
   *
   * But `crm_projects.pool_target` was written once, as '{}', when the project
   * was created, and nothing ever updated it. The one endpoint that set a pool
   * target — infra.ts `set_pool_target` — writes `crm_autopilot`, which is the
   * old one-Autopilot-per-workspace row that the per-project tick stopped
   * reading when projects arrived. Two tables, and the wire between the screen
   * and the machinery ran to the wrong one.
   *
   * So every project returned `undefined` from `poolFor()`, no infrastructure
   * step was ever planned, and the whole capability was unreachable while
   * looking present in the schema.
   */
  if (act === 'set_infra') {
    const id = String(d.id ?? '').trim();
    const mode = String(d.purchaseMode ?? '') === 'managed' ? 'managed' : 'byo';

    if (mode === 'managed') {
      /* Refused rather than accepted-and-broken, the same way infra.ts does it.
         A project set to managed on an install with nothing to buy through
         would look configured and quietly do nothing. */
      const reg = await env.DB.prepare(
        "SELECT 1 AS n FROM crm_install_providers WHERE kind = 'registrar' AND credentials != ''",
      ).first();
      if (!reg) {
        return fail('This installation cannot buy domains on your behalf yet. Connect your own registrar under Settings → Infrastructure and choose “I already have these”.');
      }
    }

    /* Zero domains is how a project says "build nothing" — and it has to be
       expressible, because turning this off again is otherwise impossible. */
    const domains = Math.min(Math.max(Math.round(Number(d.domains) || 0), 0), 20);
    const per = Math.min(Math.max(Math.round(Number(d.mailboxesPerDomain) || 3), 1), 10);
    const target = domains > 0 ? JSON.stringify({ domains, mailboxesPerDomain: per }) : '{}';

    const res = await env.DB.prepare(
      'UPDATE crm_projects SET purchase_mode = ?, pool_target = ?, updated_at = ? WHERE id = ? AND account_id = ?',
    ).bind(mode, target, nowIso(), id, accountId).run();
    if (!res.meta.changes) return fail('That project is not in this workspace.');

    return json({ success: true, projects: await listProjects() });
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

  /**
   * Change one permission on one project.
   *
   * ── Why this is its own action ──
   *
   * `save_project` already merges guardrails, but it takes the whole record —
   * name, objective, targets, the launch plan — so a screen that only wants to
   * turn SMS off has to send everything back, and anything it gets wrong or
   * leaves out is written over the top. One switch should send one switch.
   *
   * ── Why one at a time ──
   *
   * Each of these is a permission somebody is granting. Sent one at a time, a
   * failed request leaves the other six exactly as they were, and the screen
   * can say which one did not take. A batch that half-applies is the shape of
   * bug where a customer believes sending is off and it is not.
   */
  if (act === 'set_guardrail') {
    const id = String(d.id ?? '').trim();
    const key = String(d.key ?? '').trim();
    const value = String(d.value ?? '').trim();

    /* Only the keys this version knows. A guardrail the server does not read is
       a permission the screen would show as set and nothing would honour. */
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_GUARDRAILS, key)) {
      return fail(`"${key}" is not a permission this version has.`);
    }
    if (value !== 'off' && value !== 'approval' && value !== 'on') {
      return fail('A permission is off, asks first, or runs on its own.');
    }

    const row = await env.DB.prepare('SELECT guardrails FROM crm_projects WHERE id = ? AND account_id = ?')
      .bind(id, accountId).first<{ guardrails: string }>();
    if (!row) return fail('That project is not in this workspace.');

    let current = { ...DEFAULT_GUARDRAILS } as Record<string, string>;
    try { current = { ...current, ...JSON.parse(row.guardrails ?? '{}') as Record<string, string> }; }
    catch { /* unreadable: the defaults, which are the cautious ones */ }
    current[key] = value;

    await env.DB.prepare('UPDATE crm_projects SET guardrails = ?, updated_at = ? WHERE id = ? AND account_id = ?')
      .bind(JSON.stringify(current), nowIso(), id, accountId).run();

    return json({ success: true, guardrails: current, projects: await listProjects() });
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
