/**
 * /api/design-themes.php — the Design Studio's saved themes (2026-11).
 * list · save (new, or an existing one by id) · duplicate · delete. Every
 * row is read and written only inside the caller's workspace: an id from
 * another workspace is "not found", never changed. The design is cleaned by
 * thumbThemes.ts (the engine's own names and ranges) whatever the browser
 * sent.
 */
import { nowIso, userFromToken, workspaceAccess, type Env } from '../lib/db';
import { body, fail, json } from '../lib/http';
import { rateLimit } from '../lib/rateLimit';
import { cleanTheme, MAX_THEMES, type ThumbTheme } from '../lib/design/thumbThemes';

interface Req { token?: string; accountId?: string; action?: string; id?: string; theme?: unknown }
interface Row { id: string; name: string; description: string; config: string; source: string; created_at: string; updated_at: string }

const s = (v: unknown, n: number) => String(v ?? '').replace(/\p{Cc}/gu, ' ').trim().slice(0, n);

export function themeOf(r: Row): ThumbTheme {
  let c: Record<string, unknown> = {};
  try { c = JSON.parse(r.config) as Record<string, unknown>; } catch { /* an unreadable row reads as the defaults */ }
  const t = cleanTheme({ name: r.name, description: r.description, source: r.source, ...c })!;
  return { id: r.id, ...t, createdAt: r.created_at, updatedAt: r.updated_at };
}

/** One of this workspace's themes, or null. Used by the video route to make a thumbnail in it. */
export async function themeById(env: Env, accountId: string, id: string): Promise<ThumbTheme | null> {
  if (!id) return null;
  const r = await env.DB.prepare(`SELECT id, name, description, config, source, created_at, updated_at FROM crm_design_themes WHERE id = ? AND account_id = ? AND kind = 'thumbnail'`).bind(id.slice(0, 80), accountId).first<Row>();
  return r ? themeOf(r) : null;
}

export async function handleDesignThemes(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again to use your design themes.', 401, { code: 'unauthorised' });
  const accountId = String(d.accountId ?? '').trim();
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(accountId)) return fail('A valid workspace is required.', 400, { code: 'no_workspace' });
  const access = await workspaceAccess(env.DB, user, accountId);
  if (!access.ok) return fail(access.message ?? 'That workspace is not yours.', 403, { code: access.code });
  const act = s(d.action, 20);
  const list = async () => (await env.DB.prepare(`SELECT id, name, description, config, source, created_at, updated_at FROM crm_design_themes WHERE account_id = ? AND kind = 'thumbnail' ORDER BY updated_at DESC LIMIT ${MAX_THEMES}`).bind(accountId).all<Row>()).results.map(themeOf);

  if (act === 'list') return json({ success: true, themes: await list() });

  if (act === 'save') {
    const rl = await rateLimit(env, { what: 'design-themes', who: accountId, max: 300, windowSeconds: 3600 });
    if (!rl.allowed) return fail('That is a lot of saves in an hour — try again shortly.', 429);
    const t = cleanTheme(d.theme);
    if (!t) return fail('Give the theme a name.', 200, { field: 'theme.name' });
    const config = JSON.stringify({ design: t.design, logo: t.logo, words: t.words });
    const id = s(d.id, 80);
    const now = nowIso();
    if (id) {
      const r = await env.DB.prepare(`UPDATE crm_design_themes SET name = ?, description = ?, config = ?, updated_at = ? WHERE id = ? AND account_id = ? AND kind = 'thumbnail'`)
        .bind(t.name, t.description, config, now, id, accountId).run();
      if (!r.meta.changes) return fail('That theme is not in this workspace.', 404, { code: 'not_found' });
      return json({ success: true, theme: await themeById(env, accountId, id) });
    }
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM crm_design_themes WHERE account_id = ? AND kind = 'thumbnail'`).bind(accountId).first<{ n: number }>();
    if ((n?.n ?? 0) >= MAX_THEMES) return fail(`A workspace keeps up to ${MAX_THEMES} themes — delete one first.`, 200, { code: 'too_many' });
    const nid = `th-${crypto.randomUUID()}`;
    await env.DB.prepare(`INSERT INTO crm_design_themes (id, account_id, kind, name, description, config, source, created_by, created_at, updated_at) VALUES (?, ?, 'thumbnail', ?, ?, ?, ?, ?, ?, ?)`)
      .bind(nid, accountId, t.name, t.description, config, t.source, user.email, now, now).run();
    return json({ success: true, theme: await themeById(env, accountId, nid) });
  }

  if (act === 'duplicate') {
    const cur = await themeById(env, accountId, s(d.id, 80));
    if (!cur) return fail('That theme is not in this workspace.', 404, { code: 'not_found' });
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM crm_design_themes WHERE account_id = ? AND kind = 'thumbnail'`).bind(accountId).first<{ n: number }>();
    if ((n?.n ?? 0) >= MAX_THEMES) return fail(`A workspace keeps up to ${MAX_THEMES} themes — delete one first.`, 200, { code: 'too_many' });
    const nid = `th-${crypto.randomUUID()}`, now = nowIso();
    await env.DB.prepare(`INSERT INTO crm_design_themes (id, account_id, kind, name, description, config, source, created_by, created_at, updated_at) VALUES (?, ?, 'thumbnail', ?, ?, ?, 'library', ?, ?, ?)`)
      .bind(nid, accountId, `${cur.name} (copy)`.slice(0, 60), cur.description, JSON.stringify({ design: cur.design, logo: cur.logo, words: cur.words }), user.email, now, now).run();
    return json({ success: true, theme: await themeById(env, accountId, nid) });
  }

  if (act === 'delete') {
    const r = await env.DB.prepare(`DELETE FROM crm_design_themes WHERE id = ? AND account_id = ? AND kind = 'thumbnail'`).bind(s(d.id, 80), accountId).run();
    if (!r.meta.changes) return fail('That theme is not in this workspace.', 404, { code: 'not_found' });
    return json({ success: true });
  }

  return fail('Unknown action.', 400);
}
