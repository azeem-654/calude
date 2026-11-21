/**
 * The morning digest: what Autopilot did, and what is waiting for you.
 *
 * ── Why this is not optional ──
 *
 * The whole model is *supervised* autopilot: the first run of each channel is
 * held for a person to approve. That only works if the person knows there is
 * something to approve. Held actions sit in a queue on a screen, and a customer
 * who does not open the app that day does not know the queue exists — so the
 * review they agreed to never happens, and Autopilot looks like it stopped.
 *
 * ── The rule that keeps it read ──
 *
 * Nothing to say, nothing sent. A daily email that says "nothing happened" is
 * a daily email that gets filtered, and then the one that mattered goes with
 * it. So a quiet day is silent, and `last_digest_at` is only stamped when
 * something actually went.
 */
import { dataGet, dataPut, nowIso, type Env } from './lib/db';
import { loadMailbox } from './routes/mailbox';
import { canSend, deliver, fromAddressOf } from './lib/deliver';
import { installMailbox } from './routes/auth';
import { localHour } from './lib/localHour';

export interface DigestReport { sent: number; skipped: number; failed: number; notes: string[] }

/** Two digests in one morning is worse than none — the window below is three
 *  hours wide, which is thirty-six ticks. */
const MIN_GAP_MS = 20 * 60 * 60 * 1000;

/* The end of the customer's working day (owner, 2026-11-21: "by the end of
   each day … you have some pending messages"; it went out at 7–10 am until
   then). Late enough to report the day's work, early enough to be read. */
const FROM_HOUR = 17;
const TO_HOUR = 20;

/** When this workspace was last written to. Its own key, see runDigests. */
const DIGEST_KEY = 'crm_autopilot_digest_at';

interface Row {
  account_id: string;
  status: string;
}

interface ActionRow {
  kind: string;
  status: string;
  summary: string;
  because: string;
  detail: string | null;
  created_at: string;
  /** Which project it was for. Empty for history written before projects. */
  project: string;
}

const esc = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function list(title: string, rows: ActionRow[], note?: string): string {
  if (!rows.length) return '';
  const items = rows.slice(0, 12).map(r => {
    const why = r.detail?.trim() || r.because?.trim() || '';
    const who = r.project?.trim();
    return `<li style="margin:0 0 8px">`
      + (who ? `<span style="color:#8b95a5;font-size:12px">${esc(who)}</span><br>` : '')
      + `<strong>${esc(r.summary)}</strong>`
      + (why ? `<br><span style="color:#5b6472">${esc(why.slice(0, 220))}</span>` : '')
      + `</li>`;
  }).join('');
  const more = rows.length > 12 ? `<p style="color:#5b6472;margin:4px 0 0">…and ${rows.length - 12} more.</p>` : '';
  return `<h3 style="margin:22px 0 8px;font-size:15px">${esc(title)}</h3>`
    + (note ? `<p style="margin:0 0 8px;color:#5b6472">${esc(note)}</p>` : '')
    + `<ul style="margin:0;padding-left:18px">${items}</ul>${more}`;
}

export async function runDigests(env: Env): Promise<DigestReport> {
  const report: DigestReport = { sent: 0, skipped: 0, failed: 0, notes: [] };

  /*
   * One digest per workspace, not per project.
   *
   * Projects are the unit of work, but the person reading this is the unit of
   * attention: an agency running six client projects wants one morning email,
   * not six. So the workspaces with anything running are gathered here and the
   * projects are grouped inside the message.
   */
  const { results } = await env.DB.prepare(
    `SELECT account_id, MIN(status) AS status
     FROM crm_projects WHERE status NOT IN ('off','paused')
     GROUP BY account_id LIMIT 400`,
  ).all<Row>();

  for (const run of results ?? []) {
    const accountId = run.account_id;

    /* The clock lives in the workspace's own key/value store rather than on a
       project row: it belongs to the reader, and picking one project to hold
       it would break the moment that project was deleted. */
    const lastDigestAt = (await dataGet(env.DB, accountId, DIGEST_KEY)) ?? '';
    if (lastDigestAt && Date.now() - new Date(lastDigestAt).getTime() < MIN_GAP_MS) continue;

    const sched = JSON.parse(await dataGet(env.DB, accountId, 'crm_schedule') ?? '{}') as { timezone?: string };
    const hour = localHour(sched.timezone ?? '');
    if (hour < FROM_HOUR || hour >= TO_HOUR) continue;

    /* Since the last digest, or the last day for a workspace that has never
       had one. Not "everything ever" — a first digest listing three weeks of
       history is a wall of text nobody reads to the end of. */
    const since = lastDigestAt
      && Date.now() - new Date(lastDigestAt).getTime() < 7 * 86_400_000
      ? lastDigestAt
      : new Date(Date.now() - 86_400_000).toISOString();

    /* The project's name comes along so the email can say which client each
       line was for — an agency reading "Write the first blog post" three times
       needs to know which three businesses. */
    const rows = (await env.DB.prepare(
      `SELECT a.kind, a.status, a.summary, a.because, a.detail, a.created_at,
              COALESCE(j.name, '') AS project
       FROM crm_autopilot_actions a
       LEFT JOIN crm_projects j ON j.id = a.project_id
       WHERE a.account_id = ? AND (a.created_at > ? OR a.status = 'awaiting')
       ORDER BY a.created_at DESC LIMIT 80`,
    ).bind(accountId, since).all<ActionRow>()).results ?? [];

    const awaiting = rows.filter(r => r.status === 'awaiting');
    /*
     * A notice is not a completed job.
     *
     * `observe` and `error` actions have nothing to carry out — noticing is the
     * whole action — so the tick writes them straight to `done`. Listed with
     * the rest, "Autopilot did 1 thing for your business" arrived in somebody's
     * inbox whose single event was "nothing can be sent, no mailbox is
     * connected". The subject line said the opposite of the news.
     */
    const isNotice = (r: ActionRow) => r.kind === 'observe' || r.kind === 'error';
    const done = rows.filter(r => r.status === 'done' && !isNotice(r) && r.created_at > since);
    const failed = rows.filter(r => r.status === 'failed' && r.created_at > since);
    const noticed = rows.filter(r => r.status === 'done' && isNotice(r) && r.created_at > since);

    /*
     * What it is *about* to do.
     *
     * The digest reported the past and stopped, which is half the question
     * somebody has about a system running their business unattended. "It wrote
     * three things last night" is reassuring; "and it is about to email 40
     * people at nine" is the sentence that makes them open the app before it
     * happens rather than after.
     *
     * Deliberately not time-boxed to the window: something queued four days ago
     * and still due is more worth saying than something queued this morning.
     */
    const planned = (await env.DB.prepare(
      `SELECT a.kind, a.status, a.summary, a.because, a.detail, a.created_at,
              COALESCE(j.name, '') AS project
       FROM crm_autopilot_actions a
       LEFT JOIN crm_projects j ON j.id = a.project_id
       WHERE a.account_id = ? AND a.status = 'pending'
       ORDER BY CASE WHEN a.due_at IS NULL THEN 0 ELSE 1 END, a.due_at ASC LIMIT 12`,
    ).bind(accountId).all<ActionRow>()).results ?? [];

    /* Nothing to say. Say nothing, and leave the clock alone. A digest whose
       only content is "here is what is queued" would arrive every morning of a
       quiet week saying the same thing. */
    /* Protron's unread messages in the live chat (lib/protronFeed.ts) — the
       reason to sign in that the owner wanted the email to carry. */
    const unread = (await env.DB.prepare(
      `SELECT m.kind, m.body, m.created_at, COALESCE(j.name, '') AS project FROM crm_protron_messages m
         LEFT JOIN crm_projects j ON j.id = m.project_id
        WHERE m.account_id = ? AND m.role = 'protron' AND m.read_at IS NULL ORDER BY m.created_at DESC LIMIT 6`,
    ).bind(accountId).all<{ kind: string; body: string; created_at: string; project: string }>().catch(() => ({ results: [] }))).results ?? [];
    const unreadCount = Number((await env.DB.prepare(`SELECT COUNT(*) AS n FROM crm_protron_messages WHERE account_id = ? AND role = 'protron' AND read_at IS NULL`)
      .bind(accountId).first<{ n: number }>().catch(() => null))?.n ?? 0);

    if (!awaiting.length && !done.length && !failed.length && !noticed.length && !unreadCount) { report.skipped++; continue; }

    const owner = await env.DB.prepare('SELECT owner_email FROM crm_workspaces WHERE account_id = ?')
      .bind(accountId).first<{ owner_email: string }>();
    if (!owner?.owner_email) { report.skipped++; continue; }

    /* From the platform's own mailbox (support@, routes/auth.ts
       installMailbox) — the owner's ask, and it reaches a customer who has not
       connected a mailbox yet, who is exactly the one who needs nudging. The
       customer's own mailbox only when the platform has none. */
    const own = await loadMailbox(env, accountId);
    const mb = (await installMailbox(env).catch(() => null)) ?? (canSend(own) ? own : null);
    if (!mb || !canSend(mb)) { report.skipped++; continue; }

    const profile = JSON.parse(await dataGet(env.DB, accountId, 'crm_onboarding') ?? '{}') as { companyName?: string };
    const company = profile.companyName || own?.from.name || 'your business';
    const appUrl = `${env.APP_ORIGIN ?? ''}/autopilot`;

    /* The subject carries the one number that decides whether this gets opened
       now or later. "Autopilot digest" tells them nothing. */
    const subject = awaiting.length
      ? `${awaiting.length} thing${awaiting.length === 1 ? '' : 's'} waiting for your yes — your AI Live Business Manager`
      : unreadCount && !done.length && !failed.length
        ? `${unreadCount} new message${unreadCount === 1 ? '' : 's'} about ${company} — your AI Live Business Manager`
      : failed.length
        ? `Autopilot ran into ${failed.length} problem${failed.length === 1 ? '' : 's'}`
        : done.length
          ? `Autopilot did ${done.length} thing${done.length === 1 ? '' : 's'} for ${company}`
          /* The case that used to lie. A workspace whose only event was a
             notice got "Autopilot did 1 thing", which is the opposite of what
             happened — the news is that it *could not* do something. */
          : `Autopilot needs something before it can work on ${company}`;

    const html = [
      `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.6;color:#17191c;max-width:620px">`,
      `<p style="margin:0 0 4px">Here is today's round-up for ${esc(company)} from your AI Live Business Manager.</p>`,
      unreadCount
        ? `<h3 style="margin:22px 0 8px;font-size:15px">${unreadCount} unread message${unreadCount === 1 ? '' : 's'} in your live chat</h3>`
          + `<ul style="margin:0;padding-left:18px">${unread.map(m => `<li style="margin:0 0 8px">${m.project ? `<span style="color:#8b95a5;font-size:12px">${esc(m.project)}</span><br>` : ''}${esc(m.body.split('\n')[0].slice(0, 240))}</li>`).join('')}</ul>`
          + (env.APP_ORIGIN ? `<p style="margin:10px 0 0"><a href="${esc(`${env.APP_ORIGIN}/autopilot?pc=updates`)}" style="display:inline-block;padding:10px 18px;background:#17191c;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">Read and reply</a></p>` : '')
        : '',
      list('Waiting for you', awaiting,
        'These are held until you say yes — nothing has been sent or bought.'),
      list('Done', done),
      list('Did not work', failed,
        'Autopilot has not retried these on its own. The reason each gives is the provider\'s own.'),
      /* Named rather than counted, because every one of these is a thing a
         person could switch on and stop reading about. */
      list('Worth knowing', noticed,
        'Nothing was carried out for these — they are conditions Autopilot noticed and could not act on.'),
      list('Planning to do next', planned,
        'Queued, and not yet done. Anything that sends still waits for you if you have asked it to.'),
      env.APP_ORIGIN
        ? `<p style="margin:24px 0 0"><a href="${esc(appUrl)}" style="color:#17191c">Open Autopilot</a></p>`
        : '',
      `<p style="margin:18px 0 0;color:#8b95a5;font-size:12px">You are getting this because Autopilot is switched on for this workspace. Turn it off, or pause it, on the Autopilot screen.</p>`,
      `</div>`,
    ].filter(Boolean).join('');

    const sent = await deliver(mb, {
      fromName: 'Your AI Live Business Manager', fromEmail: fromAddressOf(mb),
      to: owner.owner_email, subject, html,
      replyTo: mb.from.replyTo || undefined,
    });
    if (!sent.ok) {
      report.failed++;
      report.notes.push(`digest to ${owner.owner_email} failed — ${sent.error.slice(0, 120)}`);
      continue;
    }

    /* Stamped only now. Stamping before the send would lose a day's digest to
       a transient SMTP failure and never mention it again. */
    await dataPut(env.DB, accountId, DIGEST_KEY, nowIso());
    report.sent++;
  }

  return report;
}
