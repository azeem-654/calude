/**
 * /api/moderation.php — the owner's queue, and what becomes of an account.
 *
 * ── Two audiences, one file ──
 *
 * The owner reads the queue and decides. Everybody else gets exactly one
 * action, `mine`, which tells a workspace whether it is under a warning or a
 * suspension — because a customer who cannot send and is not told why will file
 * a bug about the send button.
 *
 * ── Why suspension is not a locked door ──
 *
 * A suspended account signs in, reads everything, and exports. What it cannot
 * do is send or publish. Locking somebody out of their own customer list is
 * taking a hostage, not moderating content, and it is the wrong tool even when
 * the account turns out to deserve everything: a suspension that later proves
 * mistaken should cost them a few days of sending, not their business.
 *
 * ── What the owner is never shown ──
 *
 * Content refused as `illegal` is stored with an empty excerpt on purpose. The
 * queue lists that an attempt happened, which is what a decision about the
 * account rests on, and does not put the text on a screen for somebody to weigh
 * up. There is no version of that judgement to make.
 */
import { body, fail, json } from '../lib/http';
import { nowIso, userFromToken, type Env, type SessionUser } from '../lib/db';
import { standingFor } from '../lib/contentGate';
import { POLICY_VERSION } from './auth';

interface Req {
  token?: string;
  action?: string;
  id?: string;
  email?: string;
  state?: string;
  reason?: string;
  clause?: string;
  note?: string;
  status?: string;
}

const isOwner = (u: SessionUser) => u.accountId === null && u.role === 'agency';

export async function handleModeration(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });

  const act = String(d.action ?? '').trim();

  /* ── Anybody: am I in trouble, and is there a policy I have not read ── */
  if (act === 'mine') {
    const standing = await standingFor(env, user.email);

    /* Asked in the same round trip as standing, because they are drawn by the
       same bar and asking twice would put two requests behind one banner. */
    const accepted = await env.DB.prepare('SELECT version FROM crm_policy_acceptance WHERE email = ?')
      .bind(user.email.toLowerCase()).first<{ version: string }>();
    /* Stamped the first time they are told. A warning nobody ever saw is not a
       warning, and it is the difference between "they were told twice" and
       "we sent it to a screen they had no reason to open". */
    if (standing.state !== 'ok') {
      await env.DB.prepare('UPDATE crm_account_standing SET seen_at = COALESCE(seen_at, ?) WHERE email = ?')
        .bind(nowIso(), user.email.toLowerCase()).run();
    }
    return json({
      success: true,
      standing,
      policy: {
        version: POLICY_VERSION,
        /* False for an account made before any of this existed, which is the
           right answer: they have not agreed to it, and being asked once is
           cheaper than assuming. */
        accepted: accepted?.version === POLICY_VERSION,
      },
    });
  }

  if (!isOwner(user)) return fail('Only the installation owner can review content.', 403);

  /* ── The queue ── */
  if (act === 'queue') {
    const want = ['held', 'approved', 'rejected'].includes(String(d.status)) ? String(d.status) : 'held';
    const { results } = await env.DB.prepare(
      `SELECT r.id, r.account_id AS accountId, r.surface, r.excerpt, r.category, r.matched,
              r.score, r.ai_verdict AS aiVerdict, r.ai_reason AS aiReason, r.status,
              r.decided_by AS decidedBy, r.decided_at AS decidedAt, r.note, r.created_at AS createdAt,
              COALESCE(w.owner_email, '') AS ownerEmail,
              COALESCE(s.state, 'ok') AS ownerState
       FROM crm_content_reviews r
       LEFT JOIN crm_workspaces w ON w.account_id = r.account_id
       LEFT JOIN crm_account_standing s ON s.email = w.owner_email
       WHERE r.status = ?
       ORDER BY r.created_at DESC LIMIT 200`,
    ).bind(want).all();

    /* The counts the tab badge needs, in the same round trip — asking for them
       separately is two requests for one screen. */
    const counts = await env.DB.prepare(
      `SELECT SUM(status = 'held') AS held, SUM(status = 'approved') AS approved,
              SUM(status = 'rejected') AS rejected FROM crm_content_reviews`,
    ).first<{ held: number; approved: number; rejected: number }>();

    return json({
      success: true,
      items: results ?? [],
      counts: { held: counts?.held ?? 0, approved: counts?.approved ?? 0, rejected: counts?.rejected ?? 0 },
    });
  }

  /* ── Approve or refuse one piece of content ── */
  if (act === 'decide') {
    const id = String(d.id ?? '').trim();
    const status = d.status === 'approved' ? 'approved' : 'rejected';
    if (!id) return fail('Which item?');

    const row = await env.DB.prepare('SELECT category, status FROM crm_content_reviews WHERE id = ?')
      .bind(id).first<{ category: string; status: string }>();
    if (!row) return fail('That item is no longer in the queue.');

    /* The one decision the owner does not get to make. It was refused
       automatically, its text was never kept, and approving it would publish
       something nobody has read. */
    if (row.category === 'illegal') {
      return fail('This was refused automatically and cannot be approved.', 403);
    }

    await env.DB.prepare(
      'UPDATE crm_content_reviews SET status = ?, decided_by = ?, decided_at = ?, note = ? WHERE id = ?',
    ).bind(status, user.email, nowIso(), String(d.note ?? '').slice(0, 500), id).run();
    return json({ success: true });
  }

  /* ── Warn, suspend, or let them off ── */
  if (act === 'set_standing') {
    const email = String(d.email ?? '').trim().toLowerCase();
    if (!email) return fail('Which account?');
    /* The owner cannot suspend the owner. It is the one account that could not
       undo it afterwards, and this endpoint is the only way back. */
    if (email === user.email.toLowerCase()) return fail('You cannot suspend your own account.');

    const state = d.state === 'suspended' ? 'suspended' : d.state === 'warned' ? 'warned' : 'ok';

    if (state === 'ok') {
      await env.DB.prepare('DELETE FROM crm_account_standing WHERE email = ?').bind(email).run();
      return json({ success: true, standing: { state: 'ok', reason: '', clause: '' } });
    }

    const reason = String(d.reason ?? '').trim().slice(0, 600);
    /* A reason is required, and it is required because it is what the customer
       reads. "Your account is suspended" with nothing after it gives somebody
       no way to fix it and no way to argue. */
    if (!reason) return fail('Say why. This is the sentence the account holder will read.');

    const now = nowIso();
    await env.DB.prepare(
      `INSERT INTO crm_account_standing (email, state, reason, clause, set_by, seen_at, created_at, updated_at)
       VALUES (?,?,?,?,?,NULL,?,?)
       ON CONFLICT(email) DO UPDATE SET
         state = excluded.state, reason = excluded.reason, clause = excluded.clause,
         set_by = excluded.set_by,
         /* Cleared, so a new warning has to be read again. Carrying the old
            stamp across would mark an unseen warning as already delivered. */
         seen_at = NULL,
         updated_at = excluded.updated_at`,
    ).bind(email, state, reason, String(d.clause ?? '').slice(0, 80), user.email, now, now).run();

    return json({ success: true, standing: { state, reason, clause: String(d.clause ?? '') } });
  }

  /* ── Who is currently in trouble ── */
  if (act === 'standings') {
    const { results } = await env.DB.prepare(
      `SELECT email, state, reason, clause, set_by AS setBy, seen_at AS seenAt, updated_at AS updatedAt
       FROM crm_account_standing ORDER BY updated_at DESC LIMIT 200`,
    ).all();
    return json({ success: true, standings: results ?? [] });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}
