/**
 * Turning engagement events into the things people expect to happen.
 *
 * ── Why this is on the cron and not in the request ──
 *
 * The request that creates the event belongs to a stranger on somebody else's
 * website. Sending an email inside it means a slow mail server makes a contact
 * form slow, and a refused mailbox makes it fail — so a lead is lost because a
 * notification could not be delivered. The capture and the telling-somebody are
 * two different jobs with two different failure modes, and only one of them is
 * allowed to lose data.
 *
 * So the event row is written synchronously and this picks it up within five
 * minutes. `dispatched_at` is stamped only after the work is done, which means
 * a failure is retried rather than silently dropped.
 */
import { nowIso, type Env } from './lib/db';
import { loadMailbox } from './routes/mailbox';
import { buildMime } from './lib/mime';
import { smtpSend } from './lib/smtp';

export interface DispatchReport { seen: number; notified: number; failed: number; notes: string[] }

/** Which events are worth an email, and what the subject should say. */
const NOTIFY: Record<string, { subject: (s: string) => string; setting: string }> = {
  'conversation.created': { subject: () => 'Somebody has started a chat', setting: 'notify_new_conversation' },
  'conversation.escalated': { subject: () => 'A chat needs a person', setting: 'notify_new_conversation' },
  'ticket.created': { subject: s => `New ticket — ${s}`, setting: 'notify_new_ticket' },
  'form.submitted': { subject: s => `Form: ${s}`, setting: 'notify_new_submission' },
};

export async function runEngageDispatch(env: Env): Promise<DispatchReport> {
  const report: DispatchReport = { seen: 0, notified: 0, failed: 0, notes: [] };

  const { results: events } = await env.DB.prepare(
    `SELECT id, account_id AS accountId, kind, summary, ref_id AS refId, person_id AS personId
     FROM crm_engage_events WHERE dispatched_at IS NULL ORDER BY created_at ASC LIMIT 60`,
  ).bind().all<{ id: string; accountId: string; kind: string; summary: string; refId: string; personId: string }>();

  for (const ev of events ?? []) {
    report.seen += 1;
    const rule = NOTIFY[ev.kind];

    /* An event nobody asked to be told about is still dispatched — it has done
       its job by existing, for the timeline and the counts. Leaving it
       undispatched would make this scan the same rows for ever. */
    if (!rule) {
      await mark(env, ev.id);
      continue;
    }

    const settings = await env.DB.prepare(
      `SELECT notify_emails AS emails, ${rule.setting} AS wanted, business_name AS business
       FROM crm_engage_settings WHERE account_id = ?`,
    ).bind(ev.accountId).first<{ emails: string; wanted: number; business: string }>();

    /* No settings row means nobody has opened the module. Telling them by email
       about a thing they have not configured is noise; the event is still in
       the inbox where they will see it. */
    if (!settings || Number(settings.wanted) !== 1) {
      await mark(env, ev.id);
      continue;
    }

    const to = settings.emails.split(',').map(e => e.trim()).filter(Boolean).slice(0, 5);
    if (!to.length) { await mark(env, ev.id); continue; }

    const box = await loadMailbox(env, ev.accountId).catch(() => null);
    if (!box) {
      /* Left undispatched on purpose: a workspace that connects a mailbox
         tomorrow should get today's notifications, not discover they were
         thrown away while it was being set up. */
      report.failed += 1;
      report.notes.push(`${ev.accountId}: no mailbox connected, notification held`);
      continue;
    }

    /* The workspace's own mailbox, exactly as the digest sends: the notification
       comes from the business, not from the platform, so a reply goes where the
       person replying expects it to. */
    const fromEmail = box.from.email;
    let sentAny = false;
    for (const address of to) {
      try {
        const mime = buildMime({
          fromEmail,
          fromName: settings.business || box.from.name || 'Customer Engagement',
          to: address,
          subject: rule.subject(ev.summary || '').slice(0, 180),
          html: `<p>${escapeHtml(ev.summary || ev.kind)}</p>`
            + '<p style="color:#64748b;font-size:13px">Open Customer Engagement to pick it up.</p>',
          replyTo: box.from.replyTo || undefined,
        }, box.smtp.host);
        const res = await smtpSend(box.smtp, { from: fromEmail, to: address, mime });
        if (res.ok) sentAny = true;
        else report.notes.push(`${address}: ${res.error.slice(0, 120)}`);
      } catch (e) {
        report.notes.push(`${address}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (sentAny) { report.notified += 1; await mark(env, ev.id); }
    else { report.failed += 1; }
  }

  return report;
}

const mark = (env: Env, id: string) =>
  env.DB.prepare('UPDATE crm_engage_events SET dispatched_at = ? WHERE id = ?')
    .bind(nowIso(), id).run().catch(() => undefined);

/* The summary contains whatever a stranger typed into a form. It is going into
   an HTML email read by the business owner, so it is escaped rather than
   trusted — the one place this module could be used to attack its own customer. */
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c
  ));
