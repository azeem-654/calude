/**
 * /api/protron-feed.php — Protron's messages in the help button's live chat
 * (lib/protronFeed.ts says what writes them and why).
 *
 *   list         the account's messages, oldest first, with each approve
 *                button's current state, and the unread count
 *   read         marks them read (the widget opened the thread)
 *   act          { messageId, choice: 'approve' | 'reject' } — the action is
 *                the one stored on that message in this account, never one the
 *                request names
 *   approve_all  every action waiting in this account, in one go
 *   summary      "where do things stand?" — written from the records, on demand
 *   reply        { text } — the customer's answer to Protron's question, kept
 *                on the business's profile so the AI writers read it
 *
 * Signed in only (the widget sends the HttpOnly cookie on the app's own
 * origin), and every account named is checked with canAccess.
 */
import { body, fail, json } from '../lib/http';
import { canAccess, dataGet, dataPut, nowIso, userFromToken, type Env } from '../lib/db';
import { decideAction, postFeed, projectStates, summaryText, type FeedAction } from '../lib/protronFeed';

interface Body { token?: string; accountId?: string; action?: string; messageId?: string; choice?: string; text?: string }

interface Row { id: string; project_id: string; role: string; kind: string; body: string; actions: string; created_at: string; read_at: string | null; project: string }

export async function handleProtronFeed(req: Request, env: Env): Promise<Response> {
  const d = await body<Body>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this needs a current session.', 401, { code: 'unauthorised' });
  const accountId = String(d.accountId ?? '').trim();
  if (!/^[A-Za-z0-9_.\-]{1,64}$/.test(accountId)) return fail('A valid workspace is required.');
  if (!(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours.', 403);
  const act = d.action ?? 'list';

  const listAll = async () => {
    const rows = ((await env.DB.prepare(
      `SELECT m.id, m.project_id, m.role, m.kind, m.body, m.actions, m.created_at, m.read_at, COALESCE(j.name, '') AS project
         FROM crm_protron_messages m LEFT JOIN crm_projects j ON j.id = m.project_id
        WHERE m.account_id = ? ORDER BY m.created_at DESC LIMIT 60`,
    ).bind(accountId).all<Row>()).results ?? []).reverse();
    const parse = (s: string): FeedAction[] => { try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch { return []; } };
    const ids = rows.flatMap(r => parse(r.actions)).filter(a => a.type === 'approve').map(a => (a as { actionId: string }).actionId);
    const status = new Map<string, string>();
    if (ids.length) {
      const got = (await env.DB.prepare(`SELECT id, status FROM crm_autopilot_actions WHERE account_id = ? AND id IN (${ids.map(() => '?').join(',')})`)
        .bind(accountId, ...ids).all<{ id: string; status: string }>()).results ?? [];
      for (const g of got) status.set(g.id, g.status);
    }
    const messages = rows.map(r => ({
      id: r.id, role: r.role, kind: r.kind, body: r.body, project: r.project, createdAt: r.created_at, read: !!r.read_at,
      actions: parse(r.actions).map(a => a.type === 'approve'
        ? { type: 'approve', state: status.get(a.actionId) ?? 'gone' }
        : { type: 'open', path: a.path.startsWith('/') ? a.path : '/', label: a.label }),
    }));
    const awaiting = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM crm_autopilot_actions WHERE account_id = ? AND status = 'awaiting'`)
      .bind(accountId).first<{ n: number }>())?.n ?? 0;
    return { success: true, messages, unread: messages.filter(m => !m.read && m.role === 'protron').length, awaiting: Number(awaiting) || 0 };
  };

  if (act === 'list') return json(await listAll());

  if (act === 'read') {
    await env.DB.prepare('UPDATE crm_protron_messages SET read_at = ? WHERE account_id = ? AND read_at IS NULL').bind(nowIso(), accountId).run();
    return json(await listAll());
  }

  if (act === 'act') {
    const msg = await env.DB.prepare('SELECT actions, project_id FROM crm_protron_messages WHERE id = ? AND account_id = ?')
      .bind(String(d.messageId ?? ''), accountId).first<{ actions: string; project_id: string }>();
    if (!msg) return fail('That message is not in this workspace.');
    let actions: FeedAction[] = [];
    try { actions = JSON.parse(msg.actions); } catch { /* none */ }
    const target = actions.find(a => a.type === 'approve') as { actionId: string } | undefined;
    if (!target) return fail('That message has nothing to approve.');
    const approve = d.choice === 'approve';
    if (!approve && d.choice !== 'reject') return fail('Approve or not now?');
    const r = await decideAction(env, accountId, target.actionId, approve);
    if (!r.ok) return fail(r.error);
    await postFeed(env, { accountId, projectId: msg.project_id, role: 'you', kind: 'reply', body: approve ? 'Approved.' : 'Not now.' });
    await postFeed(env, { accountId, projectId: msg.project_id, kind: 'note', body: approve
      ? 'Thanks — it goes ahead on my next run, within five minutes, and I will tell you here when it is done.'
      : 'Understood — I will leave that one, and I will not ask about it again.' });
    return json(await listAll());
  }

  if (act === 'approve_all') {
    const ids = ((await env.DB.prepare(`SELECT id FROM crm_autopilot_actions WHERE account_id = ? AND status = 'awaiting' LIMIT 50`)
      .bind(accountId).all<{ id: string }>()).results ?? []).map(r => r.id);
    if (!ids.length) return fail('Nothing is waiting for you right now.');
    let n = 0;
    for (const id of ids) if ((await decideAction(env, accountId, id, true)).ok) n++;
    await postFeed(env, { accountId, role: 'you', kind: 'reply', body: `Approve all ${n}.` });
    await postFeed(env, { accountId, kind: 'note', body: `Done — ${n} approved. They go ahead on my next run, within five minutes; anything that sends still goes from your own mailbox, and I will report back here.` });
    return json(await listAll());
  }

  if (act === 'summary') {
    await postFeed(env, { accountId, role: 'you', kind: 'reply', body: 'Where do things stand?' });
    await postFeed(env, { accountId, kind: 'summary', body: summaryText(await projectStates(env, accountId)) });
    await env.DB.prepare('UPDATE crm_protron_messages SET read_at = ? WHERE account_id = ? AND read_at IS NULL').bind(nowIso(), accountId).run();
    return json(await listAll());
  }

  if (act === 'reply') {
    const text = String(d.text ?? '').replace(/\s+/g, ' ').trim();
    if (text.length < 2) return fail('Write a few words first.', 200, { field: 'protron-reply' });
    if (text.length > 1000) return fail('Keep it under 1,000 characters.', 200, { field: 'protron-reply' });
    /* The business it is about: the one Protron last asked about, in the last two weeks. */
    const ask = await env.DB.prepare(
      `SELECT m.project_id, COALESCE(j.name, '') AS name, COALESCE(j.portfolio_id, '') AS portfolio
         FROM crm_protron_messages m LEFT JOIN crm_projects j ON j.id = m.project_id AND j.account_id = m.account_id
        WHERE m.account_id = ? AND m.kind = 'ask' AND m.created_at > ? ORDER BY m.created_at DESC LIMIT 1`,
    ).bind(accountId, new Date(Date.now() - 14 * 86_400_000).toISOString()).first<{ project_id: string; name: string; portfolio: string }>();
    await postFeed(env, { accountId, projectId: ask?.project_id ?? '', role: 'you', kind: 'reply', body: text });
    /* Kept where the writers look (brandFor in autopilotTick.ts and
       routes/autopilot.ts read `ownerNews`): the portfolio of that business,
       or the workspace's own profile. Newest first, a few hundred characters. */
    const merge = (old: unknown) => `${text}${typeof old === 'string' && old ? ` | ${old}` : ''}`.slice(0, 600);
    let kept = false;
    if (ask?.portfolio) {
      const row = await env.DB.prepare('SELECT profile FROM crm_portfolios WHERE id = ? AND account_id = ?').bind(ask.portfolio, accountId).first<{ profile: string }>();
      if (row) {
        let p: Record<string, unknown> = {};
        try { p = JSON.parse(row.profile || '{}'); } catch { /* start fresh */ }
        p.ownerNews = merge(p.ownerNews);
        await env.DB.prepare('UPDATE crm_portfolios SET profile = ? WHERE id = ? AND account_id = ?').bind(JSON.stringify(p), ask.portfolio, accountId).run();
        kept = true;
      }
    }
    if (!kept) {
      let ob: Record<string, unknown> = {};
      try { ob = JSON.parse((await dataGet(env.DB, accountId, 'crm_onboarding')) ?? '{}'); } catch { /* start fresh */ }
      ob.ownerNews = merge(ob.ownerNews);
      await dataPut(env.DB, accountId, 'crm_onboarding', JSON.stringify(ob));
    }
    await postFeed(env, { accountId, projectId: ask?.project_id ?? '', kind: 'note', body: `Thanks — noted${ask?.name ? ` for ${ask.name}` : ''}. I will use it the next time I plan the work, which I do every day.` });
    return json(await listAll());
  }

  return fail(`"${act}" is not something this endpoint does.`);
}
