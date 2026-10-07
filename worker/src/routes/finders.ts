/**
 * /api/finders.php — a project's prospects and its daily prospect finder.
 *
 * Every action names a workspace (`workspaceAccess`) and a project that must be
 * that workspace's; a finder or prospect id from another workspace is simply
 * not found. Ids are primary keys across tenants, so every lookup carries
 * `account_id` as well.
 *
 *   overview     — the project's finder, its rotation, 30 days of counts, recent prospects, the log
 *   save         — create or change the project's finder (and its workflow, and the audience if unset)
 *   set_status   — pause or resume (the workflow that shows it moves with it)
 *   run_step     — one step now ("Run now"), within the same allowances as the cron
 *   record       — prospects added to the project by hand from AI Prospecting
 *   expand_place — "Virginia" → its towns, for choosing where a finder works
 *   sync         — the finder's recent contacts, for a browser to put back any its copy lacks
 */
import { body, fail, json } from '../lib/http';
import { nowIso, userFromToken, workspaceAccess, type Env } from '../lib/db';
import { rateLimit } from '../lib/rateLimit';
import { citiesIn, installGeoKey } from '../lib/geoapify';
import { regionTowns } from '../lib/regions';
import { DAY_LIMITS, PER_DAY_MAX, rotationState } from '../lib/finderPlan';
import { contactOf, loadFinder, stateOf, stepFinder, type FinderRow } from '../prospectFinderTick';

interface Req {
  token?: string; accountId?: string; action?: string;
  projectId?: string; finderId?: string; status?: string;
  trades?: unknown; places?: unknown; perDay?: unknown; source?: string;
  listId?: string; listName?: string; append?: boolean; place?: string;
  prospects?: Record<string, unknown>[];
}

const LIST_ID = /^list-[A-Za-z0-9_-]{1,80}$/;
const s = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
const words = (v: unknown, max: number) => (Array.isArray(v) ? v : [])
  .map(x => s(x, 80)).filter(x => x.replace(/[^\p{L}\p{N}]/gu, '').length >= 2)
  .filter((x, i, all) => all.findIndex(y => y.toLowerCase() === x.toLowerCase()) === i).slice(0, max);
const parse = <T>(raw: string | null | undefined, fallback: T): T => { try { return (JSON.parse(raw ?? '') ?? fallback) as T; } catch { return fallback; } };
const rid = (p: string) => `${p}-${crypto.randomUUID()}`;

/** The workflow a finder shows as on the project's board: a daily schedule and one step. */
function finderNodes(trades: string[], places: string[], perDay: number) {
  return [
    { id: 'n0', type: 'trigger', label: 'Every day', config: { event: 'schedule', cadence: 'daily' }, nextId: 'n1' },
    {
      id: 'n1', type: 'ai', label: 'Find new prospects',
      config: { source: 'directory', produces: 'prospects', perDay: String(perDay), trades: trades.join(', '), places: places.join(', ') },
      nextId: null,
    },
  ];
}

export async function handleFinders(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });
  const accountId = s(d.accountId, 80);
  if (!accountId) return fail('A valid workspace is required.');
  const access = await workspaceAccess(env.DB, user, accountId);
  if (!access.ok) return fail(access.message ?? 'That workspace is not yours.', 403, { code: access.code });
  const act = s(d.action, 40);

  if (act === 'expand_place') {
    const place = s(d.place, 80);
    if (place.replace(/[^\p{L}\p{N}]/gu, '').length < 2) return fail('Say where — a state, a county or a town.', 200, { field: 'finder.places' });
    const v = await rateLimit(env, { what: 'finder-expand', who: accountId, max: 30, windowSeconds: 3600 });
    if (!v.allowed) return fail('That is a lot of places to look up — try again shortly.', 429);
    const geo = await installGeoKey(env);
    /* The states, nations and provinces in lib/regions.ts are answered without
       a key; anything else needs the directory's own list, and says so. */
    const known = regionTowns(place, 20);
    if (!geo) {
      return json(known
        ? { success: true, kind: 'state', places: known, note: '' }
        : { success: true, kind: '', places: [place], note: 'Add the towns you want, one at a time — this app can only list the towns of a state, nation or province until its business directory key is set.' });
    }
    const r = await citiesIn(env, geo.key, place);
    if (known && (r.error || r.places.length <= 1)) return json({ success: true, kind: 'state', places: known, note: '' });
    return json({ success: true, kind: r.kind, places: r.places, note: r.error });
  }

  /* Everything else is about one project of this workspace. */
  const projectId = s(d.projectId, 80);
  const project = projectId ? await env.DB.prepare('SELECT id, name, brief FROM crm_projects WHERE id = ? AND account_id = ?')
    .bind(projectId, accountId).first<{ id: string; name: string; brief: string }>() : null;

  if (act === 'removed') {
    /* The customer deleted these found prospects: they stay deleted — the repair pass and the browser sync skip them. */
    const ids = (Array.isArray((d as { contactIds?: unknown }).contactIds) ? (d as { contactIds: unknown[] }).contactIds : [])
      .map(x => s(x, 80)).filter(x => x.startsWith('pf-')).slice(0, 500);
    for (const id of ids) {
      await env.DB.prepare("UPDATE crm_project_prospects SET status = 'removed' WHERE account_id = ? AND contact_id = ?").bind(accountId, id).run();
    }
    return json({ success: true, removed: ids.length });
  }

  if (act === 'sync') {
    /* Contacts the finders added in the last week, as contact records — the browser adds any its copy lacks. */
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const rows = (await env.DB.prepare(
      `SELECT p.id, p.project_id, p.name, p.email, p.phone, p.website, p.address, p.category, p.person_name, p.person_role, p.company_number,
              p.email_status, p.query, p.found_at, p.source, p.contact_id, f.list_id
       FROM crm_project_prospects p LEFT JOIN crm_prospect_finders f ON f.id = p.finder_id
       WHERE p.account_id = ? AND p.status = 'added' AND p.contact_id LIKE 'pf-%' AND p.added_at > ? LIMIT 500`,
    ).bind(accountId, since).all<Record<string, string>>()).results ?? [];
    return json({
      success: true,
      contacts: rows.map(r => ({ contact: contactOf(r as never, r.project_id), listId: r.list_id ?? '' })),
    });
  }

  if (!project) return fail('That project is not in this workspace.', 404);

  if (act === 'overview') {
    const f = await env.DB.prepare('SELECT id FROM crm_prospect_finders WHERE account_id = ? AND project_id = ? AND length(search_id) = 0 ORDER BY created_at LIMIT 1')
      .bind(accountId, projectId).first<{ id: string }>();
    const finder = f ? await loadFinder(env, f.id, accountId) : null;
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const days = (await env.DB.prepare(
      `SELECT substr(added_at, 1, 10) AS day, COUNT(*) AS added FROM crm_project_prospects
       WHERE account_id = ? AND project_id = ? AND status = 'added' AND added_at > ? GROUP BY day ORDER BY day`,
    ).bind(accountId, projectId, since).all<{ day: string; added: number }>()).results ?? [];
    const found = (await env.DB.prepare(
      `SELECT substr(found_at, 1, 10) AS day, COUNT(*) AS found FROM crm_project_prospects
       WHERE account_id = ? AND project_id = ? AND found_at > ? GROUP BY day ORDER BY day`,
    ).bind(accountId, projectId, since).all<{ day: string; found: number }>()).results ?? [];
    const totals = (await env.DB.prepare('SELECT status, COUNT(*) AS n FROM crm_project_prospects WHERE account_id = ? AND project_id = ? GROUP BY status')
      .bind(accountId, projectId).all<{ status: string; n: number }>()).results ?? [];
    const recent = (await env.DB.prepare(
      `SELECT id, name, email, phone, website, category, person_name, person_role, email_status, query, source, status, found_at, added_at
       FROM crm_project_prospects WHERE account_id = ? AND project_id = ? AND status IN ('added', 'ready')
       ORDER BY CASE WHEN added_at = '' THEN found_at ELSE added_at END DESC LIMIT 60`,
    ).bind(accountId, projectId).all<Record<string, string>>()).results ?? [];
    const runs = (await env.DB.prepare('SELECT kind, detail, found, added, at FROM crm_finder_runs WHERE account_id = ? AND project_id = ? ORDER BY at DESC LIMIT 25')
      .bind(accountId, projectId).all<Record<string, string | number>>()).results ?? [];
    const st = finder ? stateOf(finder) : null;
    return json({
      success: true,
      finder: finder && st ? {
        id: finder.id, workflowId: finder.workflow_id, trades: st.trades, places: st.places, perDay: st.perDay, source: finder.source,
        listId: finder.list_id, status: finder.status, statusReason: finder.status_reason,
        today: { day: st.day, added: st.dayAdded, searches: st.daySearches, reads: st.dayReads },
        limits: DAY_LIMITS, nextRunAt: finder.next_run_at, lastRunAt: finder.last_run_at,
        rotation: rotationState(st),
      } : null,
      days, found, totals: Object.fromEntries(totals.map(t => [t.status, t.n])), recent, runs,
    });
  }

  if (act === 'save') {
    let trades = words(d.trades, 8);
    let places = words(d.places, 40);
    const source = d.source === 'register' ? 'register' : 'free';
    const perDay = Math.max(1, Math.min(PER_DAY_MAX, Math.round(Number(d.perDay) || 20)));
    const listId = s(d.listId, 100);
    if (listId && !LIST_ID.test(listId)) return fail('That list cannot be used.', 200, { field: 'finder.list' });
    const existing = await env.DB.prepare('SELECT id FROM crm_prospect_finders WHERE account_id = ? AND project_id = ? AND length(search_id) = 0 ORDER BY created_at LIMIT 1')
      .bind(accountId, projectId).first<{ id: string }>();
    const cur = existing ? await loadFinder(env, existing.id, accountId) : null;
    if (cur && d.append) {
      /* "Search this every day" from AI Prospecting: add to the rotation rather than replace it. */
      trades = words([...parse<string[]>(cur.trades, []), ...trades], 8);
      places = words([...parse<string[]>(cur.places, []), ...places], 40);
    }
    /* A whole state cannot be searched in one go on the free directory, and the
       rotation is meant to work a region town by town, largest first — so a
       region is saved as its towns, which the Prospects tab then lists. */
    /* "commercial properties in virginia" typed into the trade box is a trade
       and a place; searched whole it is a business type that exists nowhere. */
    const stated: string[] = [];
    trades = words(trades.map(t => {
      const m = /^(.+?)\s+(?:in|near|around|across|throughout)\s+(.{2,})$/i.exec(t);
      if (!m) return t;
      stated.push(m[2].trim());
      return m[1].trim();
    }), 8);
    if (!places.length) places = words(stated, 40);
    places = words(places.flatMap(p => regionTowns(p) ?? [p]), 40);
    if (!trades.length) return fail('Say what kind of business to find.', 200, { field: 'finder.trades' });
    if (!places.length) return fail('Say where to find them.', 200, { field: 'finder.places' });
    const list = listId || cur?.list_id || '';
    if (!list) return fail('Choose the list these prospects go on.', 200, { field: 'finder.list' });
    const now = nowIso();

    /* The workflow that shows it on the board; switching that off pauses the finder. */
    let workflowId = cur?.workflow_id ?? '';
    const nodes = JSON.stringify(finderNodes(trades, places, perDay));
    const wf = workflowId ? await env.DB.prepare('SELECT id FROM crm_project_workflows WHERE id = ? AND account_id = ?').bind(workflowId, accountId).first<{ id: string }>() : null;
    if (wf) {
      await env.DB.prepare('UPDATE crm_project_workflows SET nodes = ?, updated_at = ? WHERE id = ? AND account_id = ?').bind(nodes, now, workflowId, accountId).run();
    } else {
      workflowId = `pw-${crypto.randomUUID()}`;
      const pos = await env.DB.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM crm_project_workflows WHERE account_id = ? AND project_id = ?').bind(accountId, projectId).first<{ n: number }>();
      await env.DB.prepare(
        `INSERT INTO crm_project_workflows (id, account_id, project_id, name, description, status, nodes, position, created_at, updated_at)
         VALUES (?,?,?,?,?, 'active', ?, ?, ?, ?)`,
      ).bind(workflowId, accountId, projectId, 'Find new prospects daily',
        'Searches business directories every day, reads each website for the address it publishes, checks it, and adds the new ones to this project\'s audience. Sends nothing.',
        nodes, pos?.n ?? 0, now, now).run();
    }

    let id = cur?.id ?? '';
    if (cur) {
      /* A changed rotation starts at its beginning; what was already found stays found (one row per business). */
      const changed = cur.trades !== JSON.stringify(trades) || cur.places !== JSON.stringify(places);
      await env.DB.prepare(
        `UPDATE crm_prospect_finders SET trades = ?, places = ?, source = ?, per_day = ?, list_id = ?, workflow_id = ?,
           status = CASE WHEN status = 'exhausted' AND ? THEN 'active' ELSE status END,
           status_reason = CASE WHEN status = 'exhausted' AND ? THEN '' ELSE status_reason END,
           cursor = CASE WHEN ? THEN 0 ELSE cursor END, page_token = CASE WHEN ? THEN '' ELSE page_token END,
           next_run_at = '', updated_at = ? WHERE id = ? AND account_id = ?`,
      ).bind(JSON.stringify(trades), JSON.stringify(places), source, perDay, list, workflowId,
        changed ? 1 : 0, changed ? 1 : 0, changed ? 1 : 0, changed ? 1 : 0, now, id, accountId).run();
    } else {
      id = rid('pf');
      await env.DB.prepare(
        `INSERT INTO crm_prospect_finders (id, account_id, project_id, workflow_id, name, trades, places, source, per_day, list_id, status, next_run_at, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?, 'active', '', ?, ?)`,
      ).bind(id, accountId, projectId, workflowId, `${project.name} — daily prospects`, JSON.stringify(trades), JSON.stringify(places), source, perDay, list, now, now).run();
    }

    /* The project writes to this list unless it already writes to another. */
    const brief = parse<Record<string, unknown>>(project.brief, {});
    const aud = brief.audience as { listId?: string } | undefined;
    if (!aud?.listId) {
      brief.audience = { listId: list, listName: s(d.listName, 120) };
      await env.DB.prepare('UPDATE crm_projects SET brief = ?, updated_at = ? WHERE id = ? AND account_id = ?').bind(JSON.stringify(brief), now, projectId, accountId).run();
    }
    return json({ success: true, finderId: id, workflowId, trades, places, perDay, listId: list });
  }

  const finder = d.finderId ? await loadFinder(env, s(d.finderId, 80), accountId) : null;
  if (['set_status', 'run_step'].includes(act) && (!finder || finder.project_id !== projectId)) return fail('That finder is not part of this project.', 404);

  if (act === 'set_status') {
    const status = d.status === 'paused' ? 'paused' : 'active';
    await env.DB.prepare("UPDATE crm_prospect_finders SET status = ?, status_reason = '', next_run_at = '', updated_at = ? WHERE id = ? AND account_id = ?")
      .bind(status, nowIso(), finder!.id, accountId).run();
    if (finder!.workflow_id) {
      await env.DB.prepare('UPDATE crm_project_workflows SET status = ?, updated_at = ? WHERE id = ? AND account_id = ?')
        .bind(status, nowIso(), finder!.workflow_id, accountId).run();
    }
    return json({ success: true, status });
  }

  if (act === 'run_step') {
    const v = await rateLimit(env, { what: 'finder-run', who: accountId, max: 20, windowSeconds: 3600 });
    if (!v.allowed) return fail('That is a lot of runs by hand — the finder carries on by itself every few minutes.', 429);
    if (finder!.status !== 'active') return fail(finder!.status_reason || 'The finder is paused — resume it first.');
    const r = await stepFinder(env, finder! as FinderRow);
    return json({ success: true, ...r });
  }

  if (act === 'record') {
    /* Added by hand from AI Prospecting: already in Contacts (the browser put them there); recorded so the tab counts them. */
    const rows = (Array.isArray(d.prospects) ? d.prospects : []).slice(0, 200);
    let n = 0;
    const now = nowIso();
    for (const p of rows) {
      const name = s(p.name, 200);
      const ref = s(p.ref, 200);
      const contactId = s(p.contactId, 80);
      if (!name || !ref || !contactId) continue;
      const r = await env.DB.prepare(
        `INSERT INTO crm_project_prospects (id, account_id, project_id, finder_id, ref, name, email, phone, website, address, category,
           email_status, query, source, status, contact_id, found_at, added_at)
         VALUES (?,?,?, '', ?,?,?,?,?,?,?,?,?, 'manual', 'added', ?,?,?)
         ON CONFLICT(account_id, project_id, ref) DO NOTHING`,
      ).bind(rid('pp'), accountId, projectId, ref, name, s(p.email, 190).toLowerCase(), s(p.phone, 40), s(p.website, 300), s(p.address, 300),
        s(p.category, 80), s(p.emailStatus, 20), s(p.query, 200), contactId, s(p.foundAt, 40) || now, now).run();
      if (r.meta?.changes) n++;
    }
    return json({ success: true, recorded: n });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}
