/**
 * /api/sources.php — AI Prospecting searches as recurring lead sources for AI
 * Autopilot projects (lib/prospectSources.ts has the rules, the finder engine
 * in prospectFinderTick.ts does the work).
 *
 * A *search definition* is a search the customer built in AI Prospecting, kept
 * once with an id. A *connection* is one project's use of it: a finder row
 * that names the definition, plus the project workflow that shows it. Both
 * directions go through here — "Connect to AI Autopilot" on a search, and
 * "Connect Prospect Search" on a project.
 *
 * Every action names a workspace (`workspaceAccess`); a project, workflow,
 * list, pipeline or connection named in a request must be that workspace's,
 * and a foreign id is simply not found. Every change to a connection is written
 * to its log (`crm_finder_runs`, kind `config`) with who made it.
 *
 *   searches        — the workspace's definitions, each with its connections
 *   define          — get or create the definition for a search
 *   update_search   — change what a search finds (asks which connections follow)
 *   apply_search    — bring connections up to the search's latest version
 *   connect         — a project starts using a search
 *   project         — a project's connections, with today's progress
 *   live            — one connection's run as it happens (polled)
 *   update          — change a connection's schedule, target, checks or next steps
 *   set_status      — pause or resume
 *   run_now         — start today's run by hand and take one step
 *   disconnect      — stop; what it found stays found
 *   command         — a typed sentence ("change it to 25 a day")
 *   policy          — the owner's switch per source (owner only)
 */
import { body, fail, json } from '../lib/http';
import { dataGet, nowIso, userFromToken, workspaceAccess, type Env, type SessionUser } from '../lib/db';
import { rateLimit } from '../lib/rateLimit';
import { regionTowns } from '../lib/regions';
import {
  DEFAULT_FILTERS, DEFAULT_MIN_CONFIDENCE, DEFAULT_VERIFY, SOURCE_POLICY, TARGET_MAX, automatedSource, bestMatch, daysFor, describeSchedule,
  localParts, nextRunStart, parseSourceCommand, runLimits, searchKey, searchName, substantiallyDifferent,
  type Destination, type Filters, type Schedule, type Verify,
} from '../lib/prospectSources';
import { connectionOf, loadFinder, stepFinder, type FinderRow, type Live } from '../prospectFinderTick';
import { loadPolicy, savePolicy, sourceRefusal, type PolicySettings } from '../lib/sourcePolicyStore';

interface Req {
  token?: string; accountId?: string; action?: string;
  searchId?: string; projectId?: string; finderId?: string; finderIds?: string[]; mode?: string;
  trade?: string; place?: string; source?: string; query?: string; filters?: Partial<Filters>; exclusions?: unknown;
  name?: string; schedule?: string; runDays?: string; runHour?: number; weeklyDay?: number; tz?: string;
  target?: number; minConfidence?: number; verify?: Partial<Verify>; destination?: Partial<Destination>;
  status?: string; text?: string; settings?: PolicySettings;
}

interface DefRow {
  id: string; account_id: string; key: string; name: string; query: string; trade: string; place: string; source: string;
  filters: string; exclusions: string; version: number; created_at: string; updated_at: string;
}

const s = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
const parse = <T>(raw: string | null | undefined, fallback: T): T => { try { return (JSON.parse(raw ?? '') ?? fallback) as T; } catch { return fallback; } };
const rid = (p: string) => `${p}-${crypto.randomUUID()}`;
const isOwner = (u: SessionUser) => u.role === 'agency' && !u.accountId;
const LIST_ID = /^list-[A-Za-z0-9_-]{1,80}$/;
const SCHEDULES: Schedule[] = ['daily', 'weekdays', 'weekly', 'custom', 'manual'];

const filtersOf = (v: unknown): Filters => {
  const f = (v && typeof v === 'object' ? v : {}) as Partial<Filters>;
  /* An address is what makes a lead a lead: it is always required. */
  return { website: f.website === true, email: true, phone: f.phone === true };
};
const exclusionsOf = (v: unknown) => (Array.isArray(v) ? v : []).map(x => s(x, 40)).filter(x => x.length >= 2).slice(0, 12);
const validTz = (tz: string) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };

function defView(d: DefRow) {
  return {
    id: d.id, name: d.name, query: d.query, trade: d.trade, place: d.place, source: d.source,
    filters: { ...DEFAULT_FILTERS, ...parse<Partial<Filters>>(d.filters, {}) }, exclusions: parse<string[]>(d.exclusions, []),
    version: d.version, createdAt: d.created_at, updatedAt: d.updated_at,
  };
}

/** The workflow a connection shows as: a schedule and the prospecting step, named for its search. */
function sourceNodes(def: DefRow, conn: { schedule: Schedule; runDays: string; runHour: number; target: number; minConfidence: number }) {
  return [
    {
      id: 'n0', type: 'trigger', label: describeSchedule({ schedule: conn.schedule, runDays: conn.runDays, runHour: conn.runHour }),
      config: { event: 'schedule', cadence: 'daily', days: conn.runDays },
      nextId: 'n1',
    },
    {
      id: 'n1', type: 'ai', label: `${def.name} search`,
      config: {
        source: 'directory', produces: 'prospects', perDay: String(conn.target), trades: def.trade, places: def.place,
        searchId: def.id, searchName: def.name, origin: 'ai_prospecting', minConfidence: String(conn.minConfidence),
      },
      nextId: null,
    },
  ];
}

export async function handleSources(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });
  const act = s(d.action, 40);
  const owner = isOwner(user);

  /* ── The owner's switch per source ── */
  if (act === 'policy') {
    if (!owner) return fail('Only the owner of this installation decides which sources may be used.', 403, { code: 'not_owner' });
    const settings = d.settings ? await savePolicy(env, d.settings) : await loadPolicy(env);
    return json({ success: true, settings, sources: SOURCE_POLICY });
  }

  const accountId = s(d.accountId, 80);
  if (!accountId) return fail('A valid workspace is required.');
  const access = await workspaceAccess(env.DB, user, accountId);
  if (!access.ok) return fail(access.message ?? 'That workspace is not yours.', 403, { code: access.code });
  const at = nowIso();

  const loadDef = (id: string) => env.DB.prepare('SELECT * FROM crm_search_definitions WHERE id = ? AND account_id = ?').bind(s(id, 80), accountId).first<DefRow>();
  const loadProject = (id: string) => env.DB.prepare('SELECT id, name, brief FROM crm_projects WHERE id = ? AND account_id = ?').bind(s(id, 80), accountId)
    .first<{ id: string; name: string; brief: string }>();
  const loadConn = async (id: string) => {
    const f = id ? await loadFinder(env, s(id, 80), accountId) : null;
    return f && f.search_id ? f : null;
  };
  const audit = (f: { id: string; project_id: string }, detail: string) =>
    env.DB.prepare('INSERT INTO crm_finder_runs (id, finder_id, account_id, project_id, kind, detail, found, added, at) VALUES (?,?,?,?,?,?,0,0,?)')
      .bind(rid('fr'), f.id, accountId, f.project_id, 'config', `${detail} — ${user.email}`.slice(0, 600), at).run().catch(() => undefined);

  /** A connection as the screens show it. */
  const connView = async (f: FinderRow, names?: { workflow: Map<string, string>; project: Map<string, string> }) => {
    const c = connectionOf(f);
    const def = await loadDef(c.searchId);
    const live = parse<Live>(f.live, { run: '', current: null, recent: [] });
    const runDate = localParts(new Date(), c.plan.tz).date;
    const today = f.day === runDate;
    const wfName = names?.workflow.get(f.workflow_id)
      ?? (await env.DB.prepare('SELECT name FROM crm_project_workflows WHERE id = ? AND account_id = ?').bind(f.workflow_id, accountId).first<{ name: string }>())?.name ?? '';
    const projectName = names?.project.get(f.project_id)
      ?? (await env.DB.prepare('SELECT name FROM crm_projects WHERE id = ? AND account_id = ?').bind(f.project_id, accountId).first<{ name: string }>())?.name ?? '';
    const next = f.status === 'active' ? (c.plan.schedule === 'manual' ? null : nextRunStart(c.plan, new Date())) : null;
    return {
      id: f.id, projectId: f.project_id, projectName, workflowId: f.workflow_id, workflowName: wfName,
      searchId: c.searchId, searchName: def?.name ?? c.searchName, trade: def?.trade ?? '', place: def?.place ?? '', source: f.source,
      searchVersion: Number(f.search_version) || 0, latestVersion: def?.version ?? 0,
      filters: c.filters, exclusions: c.exclusions,
      schedule: c.plan.schedule, runDays: c.plan.runDays, runHour: c.plan.runHour, tz: c.plan.tz, scheduleText: describeSchedule(c.plan),
      target: Number(f.per_day) || 0, minConfidence: c.minConfidence, verify: c.verify, destination: c.destination,
      status: f.status, statusReason: f.status_reason,
      today: {
        date: runDate, running: today && f.status === 'active',
        added: today ? Number(f.day_added) || 0 : 0, examined: today ? Number(f.day_examined) || 0 : 0,
        rejected: today ? parse<Record<string, number>>(f.day_rejected, {}) : {},
        searches: today ? Number(f.day_searches) || 0 : 0, reads: today ? Number(f.day_reads) || 0 : 0,
      },
      limits: runLimits(Number(f.per_day) || 1),
      lastRunAt: f.last_run_at, nextRunAt: next ? next.toISOString() : f.next_run_at, manualOnly: c.plan.schedule === 'manual',
      live: live.run === runDate ? live : { run: runDate, current: null, recent: [] },
    };
  };

  /* ── Definitions ── */

  if (act === 'searches') {
    const defs = (await env.DB.prepare('SELECT * FROM crm_search_definitions WHERE account_id = ? ORDER BY updated_at DESC LIMIT 200').bind(accountId).all<DefRow>()).results ?? [];
    const conns = (await env.DB.prepare(
      `SELECT f.id, f.search_id, f.project_id, f.workflow_id, f.status, f.per_day, f.schedule, f.run_days, f.run_hour, f.search_version,
              p.name AS project_name, w.name AS workflow_name
       FROM crm_prospect_finders f LEFT JOIN crm_projects p ON p.id = f.project_id AND p.account_id = f.account_id
       LEFT JOIN crm_project_workflows w ON w.id = f.workflow_id AND w.account_id = f.account_id
       WHERE f.account_id = ? AND f.search_id != ''`,
    ).bind(accountId).all<Record<string, string | number>>()).results ?? [];
    return json({
      success: true,
      searches: defs.map(def => ({
        ...defView(def),
        connections: conns.filter(c => c.search_id === def.id).map(c => ({
          id: c.id, projectId: c.project_id, projectName: c.project_name ?? '', workflowId: c.workflow_id, workflowName: c.workflow_name ?? '',
          status: c.status, target: Number(c.per_day) || 0,
          scheduleText: describeSchedule({ schedule: String(c.schedule) as Schedule, runDays: String(c.run_days), runHour: Number(c.run_hour) || 0 }),
          upToDate: Number(c.search_version) >= def.version,
        })),
      })),
    });
  }

  if (act === 'define') {
    const trade = s(d.trade, 80), place = s(d.place, 80);
    if (trade.replace(/[^\p{L}\p{N}]/gu, '').length < 2) return fail('Say what kind of business to look for.', 200, { field: 'prospects.trade' });
    if (place.replace(/[^\p{L}\p{N}]/gu, '').length < 2) return fail('Say where to look.', 200, { field: 'prospects.place' });
    const source = automatedSource(s(d.source, 20));
    const key = searchKey(source, trade, place);
    let def = await env.DB.prepare('SELECT * FROM crm_search_definitions WHERE account_id = ? AND key = ?').bind(accountId, key).first<DefRow>();
    if (!def) {
      const v = await rateLimit(env, { what: 'search-define', who: accountId, max: 120, windowSeconds: 3600 });
      if (!v.allowed) return fail('That is a lot of new searches in an hour — try again shortly.', 429);
      const id = rid('ps');
      await env.DB.prepare(
        `INSERT INTO crm_search_definitions (id, account_id, key, name, query, trade, place, source, filters, exclusions, version, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?) ON CONFLICT(account_id, key) DO NOTHING`,
      ).bind(id, accountId, key, s(d.name, 120) || searchName(trade, place), s(d.query, 200), trade, place, source,
        JSON.stringify(filtersOf(d.filters)), JSON.stringify(exclusionsOf(d.exclusions)), at, at).run();
      def = await env.DB.prepare('SELECT * FROM crm_search_definitions WHERE account_id = ? AND key = ?').bind(accountId, key).first<DefRow>();
    }
    const view = defView(def!);
    /* Asked with different filters from the ones it was saved with: say so,
       and let the screen ask before anything connected changes. */
    const asked = d.filters ? filtersOf(d.filters) : null;
    const differs = !!asked && substantiallyDifferent({ ...view, filters: view.filters }, { ...view, filters: asked });
    return json({ success: true, search: view, differs, googleNote: s(d.source, 20) === 'google' ? SOURCE_POLICY.google.why : '' });
  }

  if (act === 'update_search') {
    const def = await loadDef(s(d.searchId, 80));
    if (!def) return fail('That search is not in this workspace.', 404);
    const cur = defView(def);
    const next = {
      trade: d.trade !== undefined ? s(d.trade, 80) : cur.trade, place: d.place !== undefined ? s(d.place, 80) : cur.place,
      source: cur.source, filters: d.filters ? filtersOf({ ...cur.filters, ...d.filters }) : cur.filters,
      exclusions: d.exclusions !== undefined ? exclusionsOf(d.exclusions) : cur.exclusions,
    };
    if (next.trade.replace(/[^\p{L}\p{N}]/gu, '').length < 2) return fail('Say what kind of business to look for.', 200, { field: 'search.trade' });
    if (next.place.replace(/[^\p{L}\p{N}]/gu, '').length < 2) return fail('Say where to look.', 200, { field: 'search.place' });
    const changed = substantiallyDifferent(cur, next);
    const key = searchKey(next.source, next.trade, next.place);
    if (key !== def.key) {
      const clash = await env.DB.prepare('SELECT id FROM crm_search_definitions WHERE account_id = ? AND key = ? AND id != ?').bind(accountId, key, def.id).first<{ id: string }>();
      if (clash) return fail('You already have that search saved — connect that one instead.', 200, { field: 'search.trade', code: 'exists', searchId: clash.id });
    }
    const name = s(d.name, 120) || (key !== def.key ? searchName(next.trade, next.place) : def.name);
    await env.DB.prepare('UPDATE crm_search_definitions SET key = ?, name = ?, trade = ?, place = ?, filters = ?, exclusions = ?, version = version + ?, updated_at = ? WHERE id = ?')
      .bind(key, name, next.trade, next.place, JSON.stringify(next.filters), JSON.stringify(next.exclusions), changed ? 1 : 0, at, def.id).run();
    const conns = (await env.DB.prepare("SELECT id FROM crm_prospect_finders WHERE account_id = ? AND search_id = ?").bind(accountId, def.id).all<{ id: string }>()).results ?? [];
    const out = [];
    for (const c of conns) { const f = await loadFinder(env, c.id, accountId); if (f) out.push(await connView(f)); }
    return json({ success: true, search: defView((await loadDef(def.id))!), changed, connections: out });
  }

  if (act === 'apply_search') {
    const def = await loadDef(s(d.searchId, 80));
    if (!def) return fail('That search is not in this workspace.', 404);
    if (d.mode === 'keep') return json({ success: true, updated: 0 });
    const ids = Array.isArray(d.finderIds) ? d.finderIds.map(x => s(x, 80)) : null;
    const conns = (await env.DB.prepare('SELECT id FROM crm_prospect_finders WHERE account_id = ? AND search_id = ?').bind(accountId, def.id).all<{ id: string }>()).results ?? [];
    let updated = 0;
    for (const c of conns) {
      if (ids && !ids.includes(c.id)) continue;
      const f = await loadFinder(env, c.id, accountId);
      if (!f) continue;
      const v = defView(def);
      const places = regionTowns(v.place) ?? [v.place];
      const sameWhere = f.trades === JSON.stringify([v.trade]) && f.places === JSON.stringify(places);
      const crit = { name: v.name, filters: v.filters, exclusions: v.exclusions };
      await env.DB.prepare(
        `UPDATE crm_prospect_finders SET trades = ?, places = ?, criteria = ?, search_version = ?,
           cursor = CASE WHEN ? THEN cursor ELSE 0 END, page_token = CASE WHEN ? THEN page_token ELSE '' END,
           done_keys = CASE WHEN ? THEN done_keys ELSE '[]' END,
           status = CASE WHEN status = 'exhausted' THEN 'active' ELSE status END, next_run_at = '', updated_at = ? WHERE id = ? AND account_id = ?`,
      ).bind(JSON.stringify([v.trade]), JSON.stringify(places), JSON.stringify(crit), def.version, sameWhere ? 1 : 0, sameWhere ? 1 : 0, sameWhere ? 1 : 0, at, f.id, accountId).run();
      await rewriteNodes(env, accountId, def, (await loadFinder(env, f.id, accountId))!);
      await audit(f, `Now uses version ${def.version} of the search "${v.name}"`);
      updated++;
    }
    return json({ success: true, updated });
  }

  /* ── Connecting a search to a project ── */

  if (act === 'connect') {
    const def = await loadDef(s(d.searchId, 80));
    if (!def) return fail('Choose a search first.', 200, { field: 'source.search' });
    const project = await loadProject(s(d.projectId, 80));
    if (!project) return fail('Choose which project uses these prospects.', 200, { field: 'source.project' });
    const refused = await sourceRefusal(env, def.source, owner);
    if (refused) return fail(refused.error, 200, { code: refused.code });
    const v = await rateLimit(env, { what: 'source-connect', who: accountId, max: 40, windowSeconds: 3600 });
    if (!v.allowed) return fail('That is a lot of connections in an hour — try again shortly.', 429);

    const settings = await readSettings(env, accountId, project.id, d, null);
    if ('error' in settings) return fail(settings.error, 200, { field: settings.field });
    const name = s(d.name, 120) || `${def.name.replace(' — ', ' ')} Prospecting Automation`;
    const view = defView(def);
    const places = regionTowns(view.place) ?? [view.place];
    const workflowId = `pw-${crypto.randomUUID()}`;
    const finderId = rid('pf');
    const pos = await env.DB.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM crm_project_workflows WHERE account_id = ? AND project_id = ?').bind(accountId, project.id).first<{ n: number }>();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO crm_project_workflows (id, account_id, project_id, name, description, status, nodes, position, created_at, updated_at)
         VALUES (?,?,?,?,?, 'active', ?, ?, ?, ?)`,
      ).bind(workflowId, accountId, project.id, name,
        `Runs the AI Prospecting search "${view.name}" ${describeSchedule(settings).toLowerCase()}, verifies each candidate and adds up to ${settings.target} new verified leads a run. Sends nothing itself.`,
        JSON.stringify(sourceNodes(def, settings)), pos?.n ?? 0, at, at),
      env.DB.prepare(
        `INSERT INTO crm_prospect_finders (id, account_id, project_id, workflow_id, name, trades, places, source, per_day, list_id, status, next_run_at, created_at, updated_at,
           search_id, search_version, criteria, schedule, run_days, run_hour, tz, min_confidence, verify, destination)
         VALUES (?,?,?,?,?,?,?,?,?,?, 'active', '', ?, ?, ?,?,?,?,?,?,?,?,?,?)`,
      ).bind(finderId, accountId, project.id, workflowId, name, JSON.stringify([view.trade]), JSON.stringify(places), automatedSource(view.source),
        settings.target, settings.destination.listId, at, at,
        def.id, def.version, JSON.stringify({ name: view.name, filters: view.filters, exclusions: view.exclusions }),
        settings.schedule, settings.runDays, settings.runHour, settings.tz, settings.minConfidence,
        JSON.stringify(settings.verify), JSON.stringify({ ...settings.destination, listId: undefined })),
    ]);
    /* The project writes to this list unless it already writes to another. */
    const brief = parse<Record<string, unknown>>(project.brief, {});
    if (!(brief.audience as { listId?: string } | undefined)?.listId) {
      brief.audience = { listId: settings.destination.listId, listName: settings.listName };
      await env.DB.prepare('UPDATE crm_projects SET brief = ?, updated_at = ? WHERE id = ? AND account_id = ?').bind(JSON.stringify(brief), at, project.id, accountId).run();
    }
    const f = (await loadFinder(env, finderId, accountId))!;
    await audit(f, `Connected the search "${view.name}" to "${project.name}": ${describeSchedule(settings)}, ${settings.target} verified leads a run, ${settings.minConfidence}% confidence`);
    return json({ success: true, connection: await connView(f) });
  }

  if (act === 'project') {
    const project = await loadProject(s(d.projectId, 80));
    if (!project) return fail('That project is not in this workspace.', 404);
    const rows = (await env.DB.prepare("SELECT id FROM crm_prospect_finders WHERE account_id = ? AND project_id = ? AND search_id != '' ORDER BY created_at").bind(accountId, project.id).all<{ id: string }>()).results ?? [];
    const conns = [];
    for (const r of rows) { const f = await loadFinder(env, r.id, accountId); if (f) conns.push(await connView(f)); }
    const recent = rows.length ? (await env.DB.prepare(
      `SELECT id, finder_id, name, email, website, category, confidence, status, reject_reason, found_at, added_at FROM crm_project_prospects
       WHERE account_id = ? AND project_id = ? AND search_id != '' AND status = 'added' ORDER BY added_at DESC LIMIT 40`,
    ).bind(accountId, project.id).all<Record<string, string | number>>()).results ?? [] : [];
    const log = rows.length ? (await env.DB.prepare(
      `SELECT finder_id, kind, detail, found, added, at FROM crm_finder_runs WHERE account_id = ? AND project_id = ? AND finder_id IN (${rows.map(() => '?').join(',')}) ORDER BY at DESC LIMIT 40`,
    ).bind(accountId, project.id, ...rows.map(r => r.id)).all<Record<string, string | number>>()).results ?? [] : [];
    return json({ success: true, connections: conns, recent, log });
  }

  /* Everything below acts on one connection of this workspace. */
  const f = await loadConn(s(d.finderId, 80));
  if (['live', 'update', 'set_status', 'run_now', 'disconnect'].includes(act) && !f) return fail('That prospecting source is not in this workspace.', 404);

  if (act === 'live') return json({ success: true, connection: await connView(f!) });

  if (act === 'update') {
    const def = await loadDef(f!.search_id!);
    const settings = await readSettings(env, accountId, f!.project_id, d, f!);
    if ('error' in settings) return fail(settings.error, 200, { field: settings.field });
    const name = d.name !== undefined ? s(d.name, 120) || f!.name : f!.name;
    await env.DB.prepare(
      `UPDATE crm_prospect_finders SET name = ?, per_day = ?, list_id = ?, schedule = ?, run_days = ?, run_hour = ?, tz = ?, min_confidence = ?, verify = ?, destination = ?,
         next_run_at = '', updated_at = ? WHERE id = ? AND account_id = ?`,
    ).bind(name, settings.target, settings.destination.listId, settings.schedule, settings.runDays, settings.runHour, settings.tz, settings.minConfidence,
      JSON.stringify(settings.verify), JSON.stringify({ ...settings.destination, listId: undefined }), at, f!.id, accountId).run();
    if (name !== f!.name) await env.DB.prepare('UPDATE crm_project_workflows SET name = ?, updated_at = ? WHERE id = ? AND account_id = ?').bind(name, at, f!.workflow_id, accountId).run();
    const nf = (await loadFinder(env, f!.id, accountId))!;
    if (def) await rewriteNodes(env, accountId, def, nf);
    const before = connectionOf(f!);
    const changes: string[] = [];
    if (Number(f!.per_day) !== settings.target) changes.push(`target ${f!.per_day} → ${settings.target}`);
    if (before.plan.schedule !== settings.schedule || before.plan.runDays !== settings.runDays || before.plan.runHour !== settings.runHour) changes.push(`schedule → ${describeSchedule(settings)}`);
    if (before.minConfidence !== settings.minConfidence) changes.push(`confidence ${before.minConfidence}% → ${settings.minConfidence}%`);
    if (before.destination.nextWorkflowId !== settings.destination.nextWorkflowId) changes.push('next workflow changed');
    await audit(nf, `Changed: ${changes.join(', ') || 'settings saved'}`);
    return json({ success: true, connection: await connView(nf) });
  }

  if (act === 'set_status') {
    const status = d.status === 'paused' ? 'paused' : 'active';
    await env.DB.batch([
      env.DB.prepare("UPDATE crm_prospect_finders SET status = ?, status_reason = '', next_run_at = '', updated_at = ? WHERE id = ? AND account_id = ?").bind(status, at, f!.id, accountId),
      env.DB.prepare('UPDATE crm_project_workflows SET status = ?, updated_at = ? WHERE id = ? AND account_id = ?').bind(status, at, f!.workflow_id, accountId),
    ]);
    await audit(f!, status === 'paused' ? 'Paused' : 'Resumed');
    return json({ success: true, connection: await connView((await loadFinder(env, f!.id, accountId))!) });
  }

  if (act === 'run_now') {
    const v = await rateLimit(env, { what: 'source-run', who: accountId, max: 30, windowSeconds: 3600 });
    if (!v.allowed) return fail('That is a lot of runs by hand — it carries on by itself every few minutes while a run is on.', 429);
    const refused = await sourceRefusal(env, f!.source, owner);
    if (refused) return fail(refused.error, 200, { code: refused.code });
    const c = connectionOf(f!);
    const date = localParts(new Date(), c.plan.tz).date;
    await env.DB.batch([
      env.DB.prepare("UPDATE crm_prospect_finders SET manual_run = ?, status = 'active', status_reason = '', next_run_at = '' WHERE id = ? AND account_id = ?").bind(date, f!.id, accountId),
      env.DB.prepare("UPDATE crm_project_workflows SET status = 'active', updated_at = ? WHERE id = ? AND account_id = ?").bind(at, f!.workflow_id, accountId),
    ]);
    if (f!.manual_run !== date) await audit(f!, 'Started today\'s run by hand');
    const r = await stepFinder(env, (await loadFinder(env, f!.id, accountId))!);
    return json({ success: true, step: r, connection: await connView((await loadFinder(env, f!.id, accountId))!) });
  }

  if (act === 'disconnect') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM crm_prospect_finders WHERE id = ? AND account_id = ?').bind(f!.id, accountId),
      env.DB.prepare('DELETE FROM crm_project_workflows WHERE id = ? AND account_id = ?').bind(f!.workflow_id, accountId),
    ]);
    await audit(f!, 'Disconnected — what it found stays in Contacts and on the list');
    return json({ success: true });
  }

  /* ── A typed sentence ── */
  if (act === 'command') {
    const project = await loadProject(s(d.projectId, 80));
    if (!project) return fail('That project is not in this workspace.', 404);
    const text = s(d.text, 300);
    const cmd = parseSourceCommand(text);
    const conns = (await env.DB.prepare("SELECT id FROM crm_prospect_finders WHERE account_id = ? AND project_id = ? AND search_id != '' ORDER BY created_at").bind(accountId, project.id).all<{ id: string }>()).results ?? [];
    const pickedId = s(d.finderId, 80) || (conns.length === 1 ? conns[0].id : '');
    const target = pickedId ? await loadConn(pickedId) : null;
    const help = 'Try: "Find 40 new prospects every weekday", "Change it to 25 per day", "Pause this prospecting source", "Only accept leads above 90% confidence", "Start these leads in my outreach workflow" or "Connect my NYC Dentists search".';

    if (cmd.kind === 'unknown') return json({ success: true, understood: false, said: `That is not something I can change here. ${help}` });
    if (cmd.kind === 'connect') {
      const defs = (await env.DB.prepare('SELECT * FROM crm_search_definitions WHERE account_id = ?').bind(accountId).all<DefRow>()).results ?? [];
      const m = bestMatch(cmd.search, defs);
      return json({ success: true, understood: true, open: 'connect', searchId: m?.id ?? '', said: m ? `Connect "${m.name}" to this project — check the settings and press Activate.` : `No saved search matches "${cmd.search}". Run it in AI Prospecting first, then connect it.` });
    }
    if (!target) {
      return json({ success: true, understood: true, said: conns.length ? 'Which prospecting source? Choose one, then say it again.' : 'This project has no prospecting source yet — connect a search first.', needsSource: conns.length > 1 });
    }
    const c = connectionOf(target);
    const patch: Req = {};
    let said = '';
    if (cmd.kind === 'pause' || cmd.kind === 'resume') {
      const status = cmd.kind === 'pause' ? 'paused' : 'active';
      await env.DB.batch([
        env.DB.prepare("UPDATE crm_prospect_finders SET status = ?, status_reason = '', next_run_at = '', updated_at = ? WHERE id = ? AND account_id = ?").bind(status, at, target.id, accountId),
        env.DB.prepare('UPDATE crm_project_workflows SET status = ?, updated_at = ? WHERE id = ? AND account_id = ?').bind(status, at, target.workflow_id, accountId),
      ]);
      await audit(target, `${status === 'paused' ? 'Paused' : 'Resumed'} by a typed instruction`);
      return json({ success: true, understood: true, said: status === 'paused' ? `"${target.name}" is paused. Nothing more is searched until you resume it.` : `"${target.name}" is running again.`, connection: await connView((await loadFinder(env, target.id, accountId))!) });
    }
    if (cmd.kind === 'run_now') {
      return json({ success: true, understood: true, open: 'run_now', finderId: target.id, said: 'Starting today\'s run now.' });
    }
    if (cmd.kind === 'skip_contacted') {
      return json({ success: true, understood: true, said: 'That is already how it works: anybody already in your CRM, already in this project, on your suppression list or unsubscribed is turned away as a duplicate or suppressed, and never examined twice.' });
    }
    if (cmd.kind === 'target') {
      patch.target = cmd.target;
      if (cmd.schedule) patch.schedule = cmd.schedule;
      said = `Now ${cmd.target} verified leads a run${cmd.schedule ? `, ${describeSchedule({ schedule: cmd.schedule, runDays: daysFor(cmd.schedule, c.plan.runDays), runHour: c.plan.runHour }).toLowerCase()}` : ''}.`;
    } else if (cmd.kind === 'schedule') {
      patch.schedule = cmd.schedule; patch.weeklyDay = cmd.weeklyDay;
      said = `Now runs ${describeSchedule({ schedule: cmd.schedule, runDays: daysFor(cmd.schedule, c.plan.runDays, cmd.weeklyDay ?? 0), runHour: c.plan.runHour }).toLowerCase()}.`;
    } else if (cmd.kind === 'min_confidence') {
      patch.minConfidence = cmd.value;
      said = `Only leads at ${cmd.value}% confidence or more are added from now on.`;
    } else if (cmd.kind === 'next_workflow') {
      const flows = (await env.DB.prepare('SELECT id, name FROM crm_project_workflows WHERE account_id = ? AND project_id = ?').bind(accountId, project.id).all<{ id: string; name: string }>()).results ?? [];
      const sourceFlows = new Set(((await env.DB.prepare('SELECT workflow_id FROM crm_prospect_finders WHERE account_id = ?').bind(accountId).all<{ workflow_id: string }>()).results ?? []).map(x => x.workflow_id));
      const m = bestMatch(cmd.workflow, flows.filter(w => !sourceFlows.has(w.id)));
      if (!m) return json({ success: true, understood: true, said: `No workflow in this project is called anything like "${cmd.workflow}".` });
      patch.destination = { ...c.destination, nextWorkflowId: m.id };
      said = `New verified leads now start in "${m.name}".`;
    }
    const settings = await readSettings(env, accountId, target.project_id, patch, target);
    if ('error' in settings) return json({ success: true, understood: true, said: settings.error });
    await env.DB.prepare(
      `UPDATE crm_prospect_finders SET per_day = ?, schedule = ?, run_days = ?, min_confidence = ?, destination = ?, next_run_at = '', updated_at = ? WHERE id = ? AND account_id = ?`,
    ).bind(settings.target, settings.schedule, settings.runDays, settings.minConfidence, JSON.stringify({ ...settings.destination, listId: undefined }), at, target.id, accountId).run();
    const nf = (await loadFinder(env, target.id, accountId))!;
    const def = await loadDef(nf.search_id!);
    if (def) await rewriteNodes(env, accountId, def, nf);
    await audit(nf, `"${text}" — ${said}`);
    return json({ success: true, understood: true, said, connection: await connView(nf) });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}

/* ── Settings, checked ── */

interface Settings {
  schedule: Schedule; runDays: string; runHour: number; tz: string; target: number; minConfidence: number;
  verify: Verify; destination: Destination; listName: string;
}

/**
 * A connection's settings from a request, on top of what it already has —
 * every id it names checked against this workspace and this project.
 */
async function readSettings(env: Env, accountId: string, projectId: string, d: Req, cur: FinderRow | null): Promise<Settings | { error: string; field: string }> {
  const was = cur ? connectionOf(cur) : null;
  const schedule = (SCHEDULES.includes(d.schedule as Schedule) ? d.schedule : was?.plan.schedule ?? 'weekdays') as Schedule;
  const runDays = daysFor(schedule, s(d.runDays, 7) || was?.plan.runDays || '1111100', Math.max(0, Math.min(6, Math.round(Number(d.weeklyDay ?? (was ? was.plan.runDays.indexOf('1') : 0)) || 0))));
  const runHour = d.runHour !== undefined ? Math.max(0, Math.min(23, Math.round(Number(d.runHour) || 0))) : was?.plan.runHour ?? 9;
  const tz = s(d.tz, 60) || was?.plan.tz || 'UTC';
  if (!validTz(tz)) return { error: 'That time zone is not one this app knows.', field: 'source.schedule' };
  const target = d.target !== undefined ? Math.round(Number(d.target)) : Number(cur?.per_day) || 40;
  if (!Number.isFinite(target) || target < 1 || target > TARGET_MAX) return { error: `Choose between 1 and ${TARGET_MAX} verified leads a run.`, field: 'source.target' };
  const minConfidence = d.minConfidence !== undefined ? Math.round(Number(d.minConfidence)) : was?.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  if (!Number.isFinite(minConfidence) || minConfidence < 50 || minConfidence > 100) return { error: 'Choose a confidence between 50% and 100%.', field: 'source.confidence' };
  const verify: Verify = { ...DEFAULT_VERIFY, ...(was?.verify ?? {}), ...(d.verify ?? {}) };
  verify.level = verify.level === 'strict' ? 'strict' : 'recommended';
  verify.rejectRole = verify.rejectRole === true; verify.rejectFreeMail = verify.rejectFreeMail === true;

  const dIn = { ...(was?.destination ?? {}), ...(d.destination ?? {}) } as Partial<Destination>;
  const listId = s(dIn.listId, 100);
  if (!listId || !LIST_ID.test(listId)) return { error: 'Choose the list these leads go on.', field: 'source.list' };
  const lists = parse<{ id: string; name?: string; type?: string }[]>(await dataGet(env.DB, accountId, 'crm_contact_lists'), []);
  const list = lists.find(l => l.id === listId);
  if (!list || list.type !== 'static') return { error: 'That list is not one leads can be added to — choose another or make a new one.', field: 'source.list' };
  const tags = (Array.isArray(dIn.tags) ? dIn.tags : []).map(t => s(t, 40)).filter(Boolean).slice(0, 5);
  const ownerName = s(dIn.owner, 80);
  const pipelineId = s(dIn.pipelineId, 80), stageId = s(dIn.stageId, 80);
  if (pipelineId) {
    const pipes = parse<{ id: string; stages?: { id: string }[] }[]>(await dataGet(env.DB, accountId, 'crm_pipelines'), []);
    const p = pipes.find(x => x.id === pipelineId);
    if (!p) return { error: 'That pipeline is not in this workspace.', field: 'source.pipeline' };
    if (stageId && !p.stages?.some(x => x.id === stageId)) return { error: 'That stage is not in the pipeline.', field: 'source.pipeline' };
  }
  const nextWorkflowId = s(dIn.nextWorkflowId, 80);
  if (nextWorkflowId) {
    const wf = await env.DB.prepare('SELECT id FROM crm_project_workflows WHERE id = ? AND account_id = ? AND project_id = ?').bind(nextWorkflowId, accountId, projectId).first<{ id: string }>();
    const isSource = await env.DB.prepare('SELECT id FROM crm_prospect_finders WHERE account_id = ? AND workflow_id = ?').bind(accountId, nextWorkflowId).first<{ id: string }>();
    if (!wf || isSource) return { error: 'Choose a workflow of this project that works with contacts.', field: 'source.next' };
  }
  return {
    schedule, runDays, runHour, tz, target, minConfidence, verify, listName: list.name ?? '',
    destination: { listId, tags, owner: ownerName, pipelineId, stageId: pipelineId ? stageId : '', nextWorkflowId },
  };
}

async function rewriteNodes(env: Env, accountId: string, def: DefRow, f: FinderRow): Promise<void> {
  const c = connectionOf(f);
  const nodes = sourceNodes(def, { schedule: c.plan.schedule, runDays: c.plan.runDays, runHour: c.plan.runHour, target: Number(f.per_day) || 1, minConfidence: c.minConfidence });
  await env.DB.prepare('UPDATE crm_project_workflows SET nodes = ?, updated_at = ? WHERE id = ? AND account_id = ?').bind(JSON.stringify(nodes), nowIso(), f.workflow_id, accountId).run();
}
