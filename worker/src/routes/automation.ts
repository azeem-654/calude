/**
 * Campaigns that start on their own, and an honest account of whether they did.
 *
 * Two halves of one problem. A campaign can now be told to begin on a date —
 * the tick enrols the audience and turns the sequence on with nobody logged in
 * — and because that happens out of sight, the same endpoint reports what
 * every recent tick actually did.
 *
 * The reporting matters as much as the running. Before this, the schedule
 * wrote its account of itself to a Cloudflare log the customer cannot read, so
 * "my campaign never went out" had no answer available to the person asking.
 */
import { body, fail, json, ok } from '../lib/http';
import { canAccess, dataGet, nowIso, planFor, resellLimitFor, userFromToken, workspacesOwned, type Env } from '../lib/db';

const ACCOUNT_OK = /^[A-Za-z0-9_.\-:]{1,64}$/;

export interface Audience {
  /** Contact statuses to include. Empty means any. */
  status?: string[];
  /** Tags to include. A contact matching any one of them is in. */
  tags?: string[];
  /** A ceiling, so a first scheduled campaign cannot accidentally hit 20,000 people. */
  limit?: number;
}

interface ScheduleRow {
  id: string;
  account_id: string;
  kind: string;
  ref_id: string;
  label: string;
  start_at: string;
  audience: string;
  status: string;
  detail: string;
  created_at: string;
  ran_at: string | null;
}

const view = (r: ScheduleRow) => ({
  id: r.id,
  kind: r.kind,
  refId: r.ref_id,
  label: r.label,
  startAt: r.start_at,
  audience: JSON.parse(r.audience || '{}') as Audience,
  status: r.status,
  detail: r.detail,
  createdAt: r.created_at,
  ranAt: r.ran_at,
});

/** Only what the caller sent, and only in a shape the tick can act on. */
function cleanAudience(v: unknown): Audience {
  const a = (v ?? {}) as Record<string, unknown>;
  const strs = (x: unknown, cap: number) =>
    (Array.isArray(x) ? x : []).map(s => String(s).trim().slice(0, 60)).filter(Boolean).slice(0, cap);
  const limit = Number(a.limit);
  return {
    status: strs(a.status, 8),
    tags: strs(a.tags, 12),
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 20_000) : undefined,
  };
}

interface Req {
  token?: string;
  action?: string;
  accountId?: string;
  id?: string;
  kind?: string;
  refId?: string;
  label?: string;
  startAt?: string;
  audience?: unknown;
  /** The sub-account being closed, for `release`. */
  target?: string;
}

export async function handleAutomation(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });

  const accountId = String(d.accountId ?? '').trim();
  if (!ACCOUNT_OK.test(accountId)) return fail('A valid workspace is required.');
  if (!(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours.', 403);

  const action = String(d.action ?? '');

  /* ── What is scheduled ── */
  if (action === 'list') {
    const { results } = await env.DB.prepare(
      'SELECT * FROM crm_schedules WHERE account_id = ? ORDER BY start_at DESC LIMIT 100',
    ).bind(accountId).all<ScheduleRow>();
    return json({ success: true, schedules: (results ?? []).map(view) });
  }

  /* ── Schedule a start ── */
  if (action === 'create') {
    const kind = String(d.kind ?? 'sequence_start');
    if (kind !== 'sequence_start') return fail(`"${kind}" is not something that can be scheduled.`);

    const refId = String(d.refId ?? '').trim().slice(0, 64);
    if (!refId) return fail('Which campaign should start?');

    const when = new Date(String(d.startAt ?? ''));
    if (Number.isNaN(when.getTime())) return fail('That is not a date this can start on.');
    /*
     * A start date in the past runs on the next tick rather than being
     * refused. Somebody picking "today, 9am" at 9:04 means "now", and an error
     * message about the past would be pedantry — but a date years back is a
     * mistake worth catching.
     */
    if (when.getTime() < Date.now() - 86_400_000) {
      return fail('That date has already passed. Pick today or later.');
    }

    /* The sequence has to exist before something is set to start it. The app
       syncs sequences up through data.php, so this can check rather than
       assume — and a schedule pointing at a deleted campaign is a failure
       nobody finds until the morning it does not send. */
    const raw = await dataGet(env.DB, accountId, 'crm_sequences');
    const seqs = raw ? JSON.parse(raw) as { id: string; name?: string; steps?: unknown[] }[] : [];
    const seq = Array.isArray(seqs) ? seqs.find(s => s.id === refId) : undefined;
    if (!seq) return fail('That campaign is not in this workspace yet. Open it once so it syncs, then schedule it.');
    if (!seq.steps?.length) return fail('That campaign has no steps to send.');

    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO crm_schedules (id, account_id, kind, ref_id, label, start_at, audience, status, detail, created_at)
       VALUES (?,?,?,?,?,?,?,'pending','',?)`,
    ).bind(
      id, accountId, kind, refId,
      String(d.label ?? seq.name ?? '').slice(0, 160),
      when.toISOString(),
      JSON.stringify(cleanAudience(d.audience)),
      nowIso(),
    ).run();

    const row = await env.DB.prepare('SELECT * FROM crm_schedules WHERE id = ?').bind(id).first<ScheduleRow>();
    return json({ success: true, schedule: row ? view(row) : null });
  }

  /* ── Call it off ── */
  if (action === 'cancel') {
    const id = String(d.id ?? '');
    /* Scoped to the workspace in the statement itself: an id is guessable and
       this must not become a way to cancel somebody else's campaign. */
    const r = await env.DB.prepare(
      "UPDATE crm_schedules SET status = 'cancelled', detail = 'Cancelled', ran_at = ? WHERE id = ? AND account_id = ? AND status = 'pending'",
    ).bind(nowIso(), id, accountId).run();
    if (!r.meta.changes) return fail('That schedule is not pending any more — it has already run or been cancelled.');
    return ok();
  }

  /* ── Did it run? ── */
  if (action === 'health') {
    const { results: ticks } = await env.DB.prepare(
      'SELECT * FROM crm_ticks ORDER BY at DESC LIMIT 60',
    ).all<{ id: string; at: string; ms: number; accounts: number; sent: number; failed: number; started: number; notes: string }>();

    /*
     * A tick is shared by every workspace on the install, so what comes back is
     * the tick's timing and this workspace's share of its work. Reporting
     * another customer's failures on this screen would be both confusing and a
     * leak.
     */
    const mine = (results: typeof ticks) => (results ?? []).map(t => {
      let notes: { accountId?: string; text?: string; kind?: string }[] = [];
      try { notes = JSON.parse(t.notes || '[]') as typeof notes; } catch { notes = []; }
      /* Ticks written before notes carried a severity have none; those were all
         problems, which is what the default says. */
      const ours = notes
        .filter(n => n.accountId === accountId)
        .map(n => ({ text: String(n.text ?? ''), kind: n.kind === 'info' ? 'info' : 'problem' }));
      return { at: t.at, ms: t.ms, sent: t.sent, failed: t.failed, started: t.started, notes: ours };
    });

    const rows = mine(ticks);
    const lastAt = rows[0]?.at ?? null;
    /* "Is the schedule alive?" is answered by when it last ran, not by whether
       it sent anything — a quiet week is not a broken cron. */
    const healthy = !!lastAt && Date.now() - new Date(lastAt).getTime() < 20 * 60_000;

    const { results: pending } = await env.DB.prepare(
      "SELECT * FROM crm_schedules WHERE account_id = ? AND status = 'pending' ORDER BY start_at LIMIT 20",
    ).bind(accountId).all<ScheduleRow>();

    const { results: recent } = await env.DB.prepare(
      "SELECT * FROM crm_schedules WHERE account_id = ? AND status != 'pending' ORDER BY ran_at DESC LIMIT 20",
    ).bind(accountId).all<ScheduleRow>();

    return json({
      success: true,
      healthy,
      lastTickAt: lastAt,
      /* Said plainly rather than left to a green dot: an install whose cron has
         stopped looks identical to one with nothing to do. */
      note: healthy
        ? 'The schedule is running.'
        : lastAt
          ? 'The schedule has not run in the last twenty minutes.'
          : 'The schedule has not run yet on this install.',
      ticks: rows.slice(0, 24),
      pending: (pending ?? []).map(view),
      recent: (recent ?? []).map(view),
    });
  }

  /* ── What the plan allows, from the server that enforces it ── */
  if (action === 'plan') {
    if (user.role !== 'agency') return fail('Only the agency account can see plan usage.', 403);
    const p = await planFor(env.DB, user.email);
    const used = await workspacesOwned(env.DB, user);
    const limit = await resellLimitFor(env.DB, user.email);
    return json({
      success: true,
      planId: p.planId,
      source: p.source,
      limit,
      used,
      remaining: limit < 0 ? -1 : Math.max(0, limit - used),
      /* The same sentence the refusal would use, so a screen can warn before
         somebody fills in a form they are not allowed to submit. */
      note: limit < 0
        ? 'Unlimited sub-accounts on this plan.'
        : `${used} of ${limit} sub-account${limit === 1 ? '' : 's'} in use.`,
    });
  }

  /* ── Give a workspace back ── */
  if (action === 'release') {
    if (user.role !== 'agency') return fail('Only the agency account can close a sub-account.', 403);

    const target = String(d.target ?? '').trim();
    if (!ACCOUNT_OK.test(target)) return fail('Which workspace should be closed?');
    if (target === user.accountId) return fail('That is your own workspace, not a sub-account.');

    /*
     * The reason this exists.
     *
     * The allowance is now counted from crm_workspaces, so a sub-account
     * deleted in the browser but never given back here would hold its slot for
     * ever — somebody on the two-account plan could close both and still be
     * told they were full. Deleting is what frees it, so deleting has to reach
     * the server.
     */
    const row = await env.DB.prepare('SELECT owner_email FROM crm_workspaces WHERE account_id = ?')
      .bind(target).first<{ owner_email: string }>();
    if (!row) return ok({ message: 'That workspace was not on the server. Nothing to close.' });
    if (row.owner_email !== user.email) return fail('That workspace is not yours.', 403);

    /* Everything belonging to it, not just the row that counts it. Leaving the
       data behind would keep a closed client's contacts and mail credentials on
       the server with no account able to reach them. */
    await env.DB.batch([
      env.DB.prepare('DELETE FROM crm_data WHERE account_id = ?').bind(target),
      env.DB.prepare('DELETE FROM crm_mailboxes WHERE account_id = ?').bind(target),
      env.DB.prepare('DELETE FROM crm_providers WHERE account_id = ?').bind(target),
      env.DB.prepare('DELETE FROM crm_provisioned WHERE account_id = ?').bind(target),
      env.DB.prepare('DELETE FROM crm_schedules WHERE account_id = ?').bind(target),
      env.DB.prepare('DELETE FROM crm_workspaces WHERE account_id = ?').bind(target),
    ]);

    const used = await workspacesOwned(env.DB, user);
    return ok({ message: 'Closed, and its slot is free again.', used });
  }

  return fail(`"${action}" is not something this endpoint does.`);
}
