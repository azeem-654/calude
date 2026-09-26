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
import { askGemini, loadAiKey } from './lib/ai';
import { loadMailbox } from './routes/mailbox';
import { buildMime } from './lib/mime';
import { smtpSend } from './lib/smtp';

export interface DispatchReport { seen: number; notified: number; failed: number; notes: string[] }

/** Which events are worth an email, and what the subject should say. */
const NOTIFY: Record<string, { subject: (s: string) => string; setting: string }> = {
  'conversation.created': { subject: () => 'Somebody has started a chat', setting: 'notify_new_conversation' },
  'conversation.escalated': { subject: () => 'A chat needs a person', setting: 'notify_new_conversation' },
  'ticket.created': { subject: s => `New ticket — ${s}`, setting: 'notify_new_ticket' },
  /* Under the conversation setting: somebody waiting to show their screen is a
     chat that needs a person, only more so. The email is the backstop — the
     app itself shows a waiting request within seconds. */
  'live.requested': { subject: () => 'Somebody is waiting to share their screen', setting: 'notify_new_conversation' },
  'form.submitted': { subject: s => `Form: ${s}`, setting: 'notify_new_submission' },
};

/**
 * Read a submission and say what it is.
 *
 * On the tick rather than in the request for the same reason the emails are: a
 * form on somebody else's website must not wait on a model, and a model having
 * a bad day must not lose the lead. The submission is already stored and
 * already visible before this runs — triage only ever adds to it.
 *
 * Deliberately three short fields. Anything longer and somebody reads the
 * summary instead of the submission, which is the point at which a judgement
 * made by a model starts standing in for what the customer actually wrote.
 */
async function triage(env: Env, report: DispatchReport): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT sub.id, sub.account_id AS accountId, sub.answers, f.name AS formName
     FROM crm_form_submissions sub
     JOIN crm_forms f ON f.id = sub.form_id AND f.account_id = sub.account_id
     WHERE sub.ai_summary = '' AND f.ai_triage = 1
     ORDER BY sub.created_at ASC LIMIT 15`,
  ).bind().all<{ id: string; accountId: string; answers: string; formName: string }>();

  for (const sub of results ?? []) {
    const key = await loadAiKey(env, sub.accountId);
    if (!key) {
      /* Left alone rather than stamped. A workspace whose key is fixed tomorrow
         should get today's submissions read, not find them permanently blank. */
      report.notes.push(`${sub.accountId}: no AI key, submission triage held`);
      continue;
    }

    const res = await askGemini(key, `A visitor filled in the form "${sub.formName}".

WHAT THEY SENT:
${sub.answers.slice(0, 3000)}

Read it and answer as JSON only. Judge only what is in front of you — do not
infer a budget, a timescale or an intention they did not state.
{
  "summary": "one sentence a busy person can act on",
  "intent": "sales | support | billing | complaint | spam | unclear",
  "quality": "hot | warm | cold | junk"
}`, 0.2);

    if (!res.ok || !res.text) { report.notes.push(`triage failed: ${res.error}`); continue; }
    try {
      const j = JSON.parse(res.text) as Record<string, unknown>;
      await env.DB.prepare(
        'UPDATE crm_form_submissions SET ai_summary = ?, ai_intent = ?, ai_quality = ? WHERE id = ?',
      ).bind(
        String(j.summary ?? '').slice(0, 400),
        String(j.intent ?? '').slice(0, 30),
        String(j.quality ?? '').slice(0, 20),
        sub.id,
      ).run();
    } catch {
      report.notes.push(`triage returned something unreadable for ${sub.id}`);
    }
  }
}

export async function runEngageDispatch(env: Env): Promise<DispatchReport> {
  const report: DispatchReport = { seen: 0, notified: 0, failed: 0, notes: [] };

  /* Before the notifications, so an email about a new submission can carry what
     the assistant made of it rather than arriving first and alone. */
  await triage(env, report).catch(() => report.notes.push('submission triage failed'));

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

    /* If triage has read it, the email says what it said. A notification that
       makes somebody open the app to find out whether it was worth opening the
       app is a notification that gets switched off. */
    let extra = '';
    if (ev.kind === 'form.submitted') {
      const t = await env.DB.prepare(
        'SELECT ai_summary AS summary, ai_quality AS quality FROM crm_form_submissions WHERE id = ? AND account_id = ?',
      ).bind(ev.refId, ev.accountId).first<{ summary: string; quality: string }>();
      if (t?.summary) extra = `${t.summary}${t.quality ? ` (${t.quality})` : ''}`;
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
            + (extra ? `<p style="color:#334155">${escapeHtml(extra)}</p>` : '')
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
