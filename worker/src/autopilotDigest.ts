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
import { buildMime } from './lib/mime';
import { smtpSend } from './lib/smtp';

export interface DigestReport { sent: number; skipped: number; failed: number; notes: string[] }

/** Two digests in one morning is worse than none — the window below is three
 *  hours wide, which is thirty-six ticks. */
const MIN_GAP_MS = 20 * 60 * 60 * 1000;

/* Aimed at the start of the working day rather than at midnight: a list of
   things to approve is useful when somebody is about to work, and ignored when
   it arrives while they are asleep. */
const FROM_HOUR = 7;
const TO_HOUR = 10;

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

/**
 * The customer's own local hour.
 *
 * The timezone comes from their booking page, which is the one place in this
 * app a real IANA zone is already stored — taken from their browser when they
 * set their availability. No timezone means UTC, and the digest still goes;
 * arriving at the wrong hour is a much smaller failure than not arriving.
 */
function localHour(tz: string): number {
  try {
    const h = new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'UTC', hour: 'numeric', hour12: false })
      .format(new Date());
    const n = Number(h);
    return Number.isFinite(n) ? n : new Date().getUTCHours();
  } catch {
    /* An unknown zone throws rather than falling back, and a workspace whose
       stored zone is nonsense should still get its digest. */
    return new Date().getUTCHours();
  }
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
    const done = rows.filter(r => r.status === 'done' && r.created_at > since);
    const failed = rows.filter(r => r.status === 'failed' && r.created_at > since);

    /* Nothing to say. Say nothing, and leave the clock alone. */
    if (!awaiting.length && !done.length && !failed.length) { report.skipped++; continue; }

    const owner = await env.DB.prepare('SELECT owner_email FROM crm_workspaces WHERE account_id = ?')
      .bind(accountId).first<{ owner_email: string }>();
    if (!owner?.owner_email) { report.skipped++; continue; }

    const mb = await loadMailbox(env, accountId);
    if (!mb?.smtp.host) {
      /* Not a failure worth a note every five minutes: a workspace with no
         mailbox already has a louder problem, and Autopilot has already said
         so in the ledger. */
      report.skipped++;
      continue;
    }

    const profile = JSON.parse(await dataGet(env.DB, accountId, 'crm_onboarding') ?? '{}') as { companyName?: string };
    const company = profile.companyName || mb.from.name || 'your business';
    const appUrl = `${env.APP_ORIGIN ?? ''}/autopilot`;

    /* The subject carries the one number that decides whether this gets opened
       now or later. "Autopilot digest" tells them nothing. */
    const subject = awaiting.length
      ? `${awaiting.length} thing${awaiting.length === 1 ? '' : 's'} waiting for you — Autopilot`
      : failed.length
        ? `Autopilot ran into ${failed.length} problem${failed.length === 1 ? '' : 's'}`
        : `Autopilot did ${done.length} thing${done.length === 1 ? '' : 's'} for ${company}`;

    const html = [
      `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.6;color:#17191c;max-width:620px">`,
      `<p style="margin:0 0 4px">Here is what Autopilot has been doing for ${esc(company)}.</p>`,
      list('Waiting for you', awaiting,
        'These are held until you say yes — nothing has been sent or bought.'),
      list('Done', done),
      list('Did not work', failed,
        'Autopilot has not retried these on its own. The reason each gives is the provider\'s own.'),
      env.APP_ORIGIN
        ? `<p style="margin:24px 0 0"><a href="${esc(appUrl)}" style="color:#17191c">Open Autopilot</a></p>`
        : '',
      `<p style="margin:18px 0 0;color:#8b95a5;font-size:12px">You are getting this because Autopilot is switched on for this workspace. Turn it off, or pause it, on the Autopilot screen.</p>`,
      `</div>`,
    ].filter(Boolean).join('');

    const fromEmail = mb.from.email || mb.smtp.username;
    const mime = buildMime({
      fromName: mb.from.name || 'Autopilot', fromEmail,
      to: owner.owner_email, subject, html,
      replyTo: mb.from.replyTo || undefined,
    }, mb.smtp.host);

    const sent = await smtpSend(mb.smtp, { from: fromEmail, to: owner.owner_email, mime });
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
