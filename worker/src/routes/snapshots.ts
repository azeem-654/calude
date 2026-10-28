/**
 * /api/snapshots.php — industry snapshots: the catalogue, a preview of what an
 * install would do, the install itself, its history, and the sign-up claim
 * that records which industry a new customer arrived from.
 *
 * The rules (what a snapshot holds, how an install merges) are
 * lib/snapshots.ts. This file is who may install where, and the record of it.
 *
 * ── Who may install where: the install owner, and nobody else ──
 *
 * The owner's decision of 2026-10-28: the platform owner chooses and installs
 * the snapshot that fits each customer's business. Customers do not browse
 * the marketplace or install from it, so every action here except `claim`
 * answers 403 `not_owner` to anybody but the install owner — the catalogue
 * included, because what is in it is the owner's service, not a shop window.
 * Hiding the menu entry is a courtesy; this check is the rule.
 *
 * The owner installs into any workspace that exists, without claiming it
 * (the same `knownWorkspace` rule as the growth-service ledger: calling
 * `workspaceAccess` for the owner on a customer's workspace would claim it).
 *
 * `claim` (after sign-up, from `?industry=`) used to install the matching
 * snapshot for the new customer. It now only records the industry they came
 * from, once, on their own new workspace — the owner sees it as "asked for"
 * in the workspace list and decides what to install.
 *
 * ── Why the server writes the documents ──
 *
 * The pipeline and fields live in `crm_data`, which the browser saves whole.
 * The install goes through `dataUpdate`, which re-reads and re-plans if the
 * document changed underneath it, so a save landing mid-install is merged
 * rather than lost. The screen pushes its own queued edits first and pulls
 * the result after (Agency/Snapshots.tsx).
 */
import { body, fail, json } from '../lib/http';
import { dataGet, dataUpdate, nowIso, userFromToken, type Env, type SessionUser } from '../lib/db';
import { SNAPSHOTS, planCounts, planInstall, snapshotById, snapshotForIndustry, validateSnapshot, type Snapshot } from '../lib/snapshots';

const isOwner = (u: SessionUser): boolean => u.role === 'agency' && !u.accountId;
const id = () => `snapi_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
const PIPES = 'crm_pipelines';
const FIELDS = 'crm_custom_fields';
/* A sign-up's industry is honoured only while the workspace is new: a week is
   long enough to finish a sign-up started on a phone and a code checked later,
   short enough that an old account cannot be reshaped by an old link. */
const CLAIM_DAYS = 7;

interface Ctx { user: SessionUser; accountId: string; role: 'owner' }

async function context(env: Env, user: SessionUser, raw: unknown): Promise<Ctx | Response> {
  const accountId = String(raw ?? '').trim();
  if (!accountId || !/^[\w.:@-]{1,120}$/.test(accountId)) return fail('Name the workspace.', 400);
  /* The agency bucket holds billing and suppression lists, not a pipeline. */
  if (accountId.startsWith('__')) return fail('Snapshots install into a workspace, not the agency’s own settings.', 400, { code: 'not_a_workspace' });
  const w = await env.DB.prepare('SELECT owner_email FROM crm_workspaces WHERE account_id = ?').bind(accountId).first<{ owner_email: string }>();
  const u = w ? null : await env.DB.prepare('SELECT email FROM crm_users WHERE account_id = ? LIMIT 1').bind(accountId).first<{ email: string }>();
  if (!w && !u) return fail('There is no such workspace.', 404, { code: 'not_found' });
  return { user, accountId, role: 'owner' };
}

const NOT_OWNER = 'Industry snapshots are chosen and installed by Protected Central for you. Ask us if your workspace should be set up for your industry.';

/** Every item key earlier installs of `snap` put into this workspace. */
async function priorKeys(env: Env, accountId: string, snap: Snapshot): Promise<Set<string>> {
  const { results } = await env.DB.prepare('SELECT added FROM crm_snapshot_installs WHERE account_id = ? AND snapshot_id = ?')
    .bind(accountId, snap.id).all<{ added: string }>();
  const out = new Set<string>();
  for (const r of results ?? []) { try { for (const k of JSON.parse(r.added) as string[]) out.add(k); } catch { /* a bad row adds nothing */ } }
  return out;
}

async function preview(env: Env, accountId: string, snap: Snapshot, restore: boolean) {
  const [pipes, fields, prior] = await Promise.all([dataGet(env.DB, accountId, PIPES), dataGet(env.DB, accountId, FIELDS), priorKeys(env, accountId, snap)]);
  return { plan: planInstall(snap, pipes, fields, prior, restore), prior };
}

/**
 * Install `snap`, merging into whatever the documents hold at the moment of
 * writing. Returns the plan that was applied (re-planned on a retry), or a
 * refusal. Two documents, two writes: a failure between them leaves the
 * pipeline in and the fields not, which the history row says and a second
 * install completes, because an install only adds what is missing.
 */
async function install(env: Env, c: Ctx, snap: Snapshot, restore: boolean) {
  const problems = validateSnapshot(snap);
  if (problems.length) return { error: `This snapshot does not pass its checks: ${problems[0]}` };
  const prior = await priorKeys(env, c.accountId, snap);
  const at = nowIso();
  let applied: ReturnType<typeof planInstall>;
  let unreadable = false;

  const okPipes = await dataUpdate(env.DB, c.accountId, PIPES, cur => {
    const p = planInstall(snap, cur, '[]', prior, restore, at);
    if (!p) { unreadable = true; return null; }
    return p.pipelines;
  });
  if (unreadable) return { error: 'This workspace’s pipelines could not be read as a list, so nothing was changed. Open Pipelines once and try again.' };
  const okFields = await dataUpdate(env.DB, c.accountId, FIELDS, cur => {
    const p = planInstall(snap, '[]', cur, prior, restore, at);
    if (!p) { unreadable = true; return null; }
    return p.fields;
  });
  if (unreadable) return { error: 'This workspace’s contact fields could not be read as a list, so the fields were not added.' };

  /* What is there now, whichever retry won: the honest account of the install. */
  applied = (await preview(env, c.accountId, snap, false)).plan;
  return { okPipes, okFields, at, applied };
}

export async function handleSnapshots(req: Request, env: Env): Promise<Response> {
  const d = await body<Record<string, unknown>>(req);
  const action = String(d.action ?? '');
  const user = await userFromToken(env.DB, d.token as string | undefined);
  if (!user) return fail('Sign in again.', 401, { code: 'signed_out' });

  /* After sign-up: the industry the customer arrived with, recorded once on a new workspace of their own. Nothing is installed. */
  if (action === 'claim') {
    const snap = snapshotForIndustry(d.industry);
    if (!snap) return json({ success: false, reason: 'unknown_industry' });
    if (user.role !== 'agency' || !user.accountId) return json({ success: false, reason: 'not_a_new_account' });
    const u = await env.DB.prepare('SELECT created_at FROM crm_users WHERE email = ?').bind(user.email).first<{ created_at: string }>();
    if (!u || Date.now() - Date.parse(u.created_at) > CLAIM_DAYS * 86_400_000) return json({ success: false, reason: 'not_a_new_account' });
    const claimed = await env.DB.prepare("UPDATE crm_workspaces SET industry = ? WHERE account_id = ? AND owner_email = ? AND industry = ''")
      .bind(snap.industry, user.accountId, user.email).run();
    if (!claimed.meta?.changes) return json({ success: false, reason: 'already_set' });
    return json({ success: true, recorded: snap.industry, installed: false });
  }

  if (!isOwner(user)) return fail(NOT_OWNER, 403, { code: 'not_owner' });

  if (action === 'catalogue') {
    return json({
      success: true,
      owner: isOwner(user),
      snapshots: SNAPSHOTS.map(s => ({ ...s, problems: validateSnapshot(s) })),
    });
  }

  /* The owner's view across customers: which workspace is set up for what. */
  if (action === 'workspaces') {
    const { results } = await env.DB.prepare(
      `SELECT w.account_id AS accountId, w.owner_email AS email, w.industry,
              (SELECT name FROM crm_users u WHERE u.account_id = w.account_id ORDER BY u.created_at LIMIT 1) AS name,
              (SELECT json_group_object(snapshot_id, v) FROM (SELECT snapshot_id, MAX(version) AS v FROM crm_snapshot_installs i WHERE i.account_id = w.account_id GROUP BY snapshot_id)) AS installed
       FROM crm_workspaces w ORDER BY w.created_at DESC LIMIT 500`,
    ).all();
    return json({ success: true, workspaces: results });
  }

  const ctx = await context(env, user, d.accountId);
  if (ctx instanceof Response) return ctx;
  const c = ctx;

  if (action === 'history') {
    const { results } = await env.DB.prepare('SELECT id, snapshot_id AS snapshotId, version, mode, added, present, skipped, by_email AS byEmail, by_role AS byRole, created_at AS at FROM crm_snapshot_installs WHERE account_id = ? ORDER BY created_at DESC LIMIT 100')
      .bind(c.accountId).all<{ added: string }>();
    const w = await env.DB.prepare('SELECT industry FROM crm_workspaces WHERE account_id = ?').bind(c.accountId).first<{ industry: string }>();
    return json({ success: true, industry: w?.industry ?? '', history: (results ?? []).map(r => ({ ...r, added: JSON.parse(r.added || '[]') as string[] })) });
  }

  const snap = snapshotById(d.snapshotId);
  if (!snap) return fail('Pick a snapshot from the catalogue.', 200, { field: 'snapshot.id' });
  const restore = d.restore === true;

  if (action === 'preview') {
    const { plan } = await preview(env, c.accountId, snap, restore);
    if (!plan) return fail('This workspace’s pipelines or contact fields could not be read as a list, so no install can be planned. Open Pipelines once and try again.', 200, { code: 'unreadable' });
    return json({ success: true, snapshot: { id: snap.id, version: snap.version }, items: plan.items, counts: planCounts(plan.items), changes: plan.changes });
  }

  if (action === 'install') {
    return json(await record(env, c, snap, restore, restore ? 'restore' : 'install'));
  }

  return fail(`"${action}" is not something this endpoint does.`);
}

/** Install and write the history row. */
async function record(env: Env, c: Ctx, snap: Snapshot, restore: boolean, modeIn: string) {
  const before = await preview(env, c.accountId, snap, restore);
  if (!before.plan) return { success: false, error: 'This workspace’s pipelines or contact fields could not be read as a list, so nothing was changed. Open Pipelines once and try again.', code: 'unreadable' };
  const r = await install(env, c, snap, restore);
  if ('error' in r) return { success: false, error: r.error };
  const after = r.applied;
  const nowPresent = new Set((after?.items ?? []).filter(i => i.status === 'present').map(i => i.key));
  /* Added = absent before (to be added or restored), present now. */
  const added = before.plan.items.filter(i => (i.status === 'add' || i.status === 'restore') && nowPresent.has(i.key)).map(i => i.key);
  const counts = planCounts(before.plan.items);
  const lastVersion = await env.DB.prepare('SELECT MAX(version) AS v FROM crm_snapshot_installs WHERE account_id = ? AND snapshot_id = ?').bind(c.accountId, snap.id).first<{ v: number | null }>();
  const mode = modeIn === 'install' && lastVersion?.v && lastVersion.v < snap.version ? 'upgrade' : modeIn;
  const complete = r.okPipes && r.okFields;
  /* Nothing to add and nothing added: no row. Pressing Install twice is the same as pressing it once. */
  if (added.length || (!lastVersion?.v)) {
    await env.DB.prepare('INSERT INTO crm_snapshot_installs (id, account_id, snapshot_id, version, mode, added, present, skipped, by_email, by_role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id(), c.accountId, snap.id, snap.version, mode, JSON.stringify(added), counts.present, counts.removed, c.user.email, c.role, r.at).run();
  }
  /* The first snapshot installed names the workspace's industry, if nothing has yet. */
  await env.DB.prepare("UPDATE crm_workspaces SET industry = ? WHERE account_id = ? AND industry = ''").bind(snap.industry, c.accountId).run();
  return {
    success: complete,
    ...(complete ? {} : { error: 'Part of the snapshot could not be saved because the workspace was being changed at the same moment. Install again — it adds only what is still missing.' }),
    mode, added: added.length, present: counts.present, skipped: counts.removed,
    snapshot: { id: snap.id, version: snap.version },
  };
}
