/**
 * The AI key, and the replies waiting for a person.
 *
 * Two things a browser needs to reach: the key Autopilot uses to write replies
 * (stored here, encrypted, because the cron cannot read localStorage), and the
 * queue of drafts a guardrail held back.
 *
 * Approving a draft sends it from here rather than queueing it for the tick —
 * the opposite of how an Autopilot action works, and for a reason. An action is
 * a decision that the tick then carries out; a reply is already written, the
 * person has just read the exact words, and asking them to wait five minutes to
 * find out whether their customer got an answer is a worse product.
 */
import { body, fail, json, ok } from '../lib/http';
import { canAccess, installSecret, nowIso, userFromToken, type Env } from '../lib/db';
import { encryptSecret } from '../lib/crypto';
import { loadAiKey, verifyAiKey } from '../lib/ai';
import { loadMailboxById } from './mailbox';
import { smtpSend } from '../lib/smtp';
import { buildMime } from '../lib/mime';

interface Body {
  token?: string;
  action?: string;
  accountId?: string;
  apiKey?: string;
  draftId?: string;
  /* An approver may fix the wording before it goes. Editing and sending are one
     action, not two — a person who rewrites a reply and then has to find a
     separate save button will send the old one. */
  subject?: string;
  body?: string;
  limit?: number;
}

interface DraftRow {
  id: string; mailbox_id: string; uid: string;
  to_email: string; to_name: string; in_subject: string; in_body: string;
  subject: string; body: string; confidence: number; needs_human: number;
  rule_name: string; because: string; status: string; detail: string;
  created_at: string; acted_at: string | null;
}

const shape = (r: DraftRow) => ({
  id: r.id,
  mailboxId: r.mailbox_id,
  to: { email: r.to_email, name: r.to_name },
  incoming: { subject: r.in_subject, body: r.in_body },
  subject: r.subject,
  body: r.body,
  confidence: r.confidence,
  needsHuman: !!r.needs_human,
  ruleName: r.rule_name,
  /* Why it is waiting rather than sent. The person deciding needs this more
     than they need the draft itself. */
  because: r.because,
  status: r.status,
  detail: r.detail,
  createdAt: r.created_at,
  actedAt: r.acted_at,
});

export async function handleReplies(req: Request, env: Env): Promise<Response> {
  const d = await body<Body>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });

  const accountId = String(d.accountId ?? '').trim();
  if (!/^[A-Za-z0-9_.\-]{1,64}$/.test(accountId)) return fail('A valid workspace is required.');
  if (!(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours.', 403);

  const act = d.action ?? 'get';

  const listDrafts = async (limit = 50) => {
    const rows = await env.DB.prepare(
      `SELECT * FROM crm_reply_drafts WHERE account_id = ? AND status = 'waiting'
       ORDER BY created_at DESC LIMIT ?`,
    ).bind(accountId, Math.min(Math.max(limit, 1), 200)).all<DraftRow>();
    return (rows.results ?? []).map(shape);
  };

  /* ── The key, and what is waiting ── */
  if (act === 'get') {
    const cfg = await env.DB.prepare('SELECT provider, api_key, verified_at, last_error FROM crm_ai_config WHERE account_id = ?')
      .bind(accountId).first<{ provider: string; api_key: string; verified_at: string | null; last_error: string }>();
    return json({
      success: true,
      ai: cfg ? {
        provider: cfg.provider,
        /* Never the key. Only whether there is one and what it last did. */
        hasKey: !!cfg.api_key,
        verifiedAt: cfg.verified_at,
        lastError: cfg.last_error,
      } : null,
      drafts: await listDrafts(Number(d.limit) || 50),
    });
  }

  if (act === 'save_key') {
    const raw = String(d.apiKey ?? '').trim();
    const key = await installSecret(env.DB, 'mailbox_key');
    const existing = await env.DB.prepare('SELECT api_key FROM crm_ai_config WHERE account_id = ?')
      .bind(accountId).first<{ api_key: string }>();
    /* Blank keeps the stored one, as everywhere else in this app. */
    const stored = raw === '' ? (existing?.api_key ?? '') : await encryptSecret(key, raw);
    if (!stored) return fail('Enter an API key.');
    await env.DB.prepare(
      `INSERT INTO crm_ai_config (account_id, provider, api_key, verified_at, last_error, updated_at)
       VALUES (?, 'gemini', ?, NULL, '', ?)
       ON CONFLICT(account_id) DO UPDATE SET
         api_key=excluded.api_key, verified_at=NULL, last_error='', updated_at=excluded.updated_at`,
    ).bind(accountId, stored, nowIso()).run();
    return ok();
  }

  if (act === 'test_key') {
    const explicit = String(d.apiKey ?? '').trim();
    const apiKey = explicit || await loadAiKey(env, accountId);
    if (!apiKey) return fail('Save an API key first, then test it.');
    const r = await verifyAiKey(apiKey);
    /* Only a test of the *saved* key updates the saved state — trying one in
       the box is not a statement about the one on the record. */
    if (!explicit) {
      await env.DB.prepare('UPDATE crm_ai_config SET verified_at = ?, last_error = ?, updated_at = ? WHERE account_id = ?')
        .bind(r.ok ? nowIso() : null, r.ok ? '' : r.error, nowIso(), accountId).run();
    }
    return r.ok
      ? json({ success: true, message: 'Google accepted the key. Autopilot can write replies with it.' })
      : fail(r.error);
  }

  /* ── Decide on a held reply ── */
  if (act === 'send_draft' || act === 'discard_draft') {
    const id = String(d.draftId ?? '').trim();
    if (!id) return fail('Which reply?');
    const row = await env.DB.prepare('SELECT * FROM crm_reply_drafts WHERE id = ? AND account_id = ?')
      .bind(id, accountId).first<DraftRow>();
    if (!row) return fail('That reply is not in this workspace.');
    if (row.status !== 'waiting') return fail(`That reply is already "${row.status}".`);

    if (act === 'discard_draft') {
      await env.DB.prepare("UPDATE crm_reply_drafts SET status = 'discarded', detail = ?, acted_at = ? WHERE id = ?")
        .bind('You decided not to send this.', nowIso(), id).run();
      return json({ success: true, drafts: await listDrafts(Number(d.limit) || 50) });
    }

    const mb = await loadMailboxById(env, accountId, row.mailbox_id);
    if (!mb?.smtp.host) return fail('The mailbox this reply belongs to is no longer connected.');

    /* What the approver saw, unless they edited it. Sending anything other than
       the words on their screen would make the approval meaningless. */
    const subject = String(d.subject ?? row.subject);
    const text = String(d.body ?? row.body);
    const fromEmail = mb.from.email || mb.smtp.username;

    const mime = buildMime({
      fromName: mb.from.name || 'Support',
      fromEmail,
      to: row.to_email,
      subject,
      html: text.replace(/\n/g, '<br>'),
      replyTo: mb.from.replyTo || undefined,
    }, mb.smtp.host);

    const sent = await smtpSend(mb.smtp, { from: fromEmail, to: row.to_email, mime });
    await env.DB.prepare(
      'UPDATE crm_reply_drafts SET status = ?, subject = ?, body = ?, detail = ?, acted_at = ? WHERE id = ?',
    ).bind(sent.ok ? 'sent' : 'failed', subject, text, sent.ok ? '' : sent.error, nowIso(), id).run();

    if (sent.ok) {
      /* Counted as a real reply, which is what lets the workspace graduate past
         its first supervised few. */
      await env.DB.prepare(
        `INSERT OR REPLACE INTO crm_reply_seen (account_id, mailbox_id, uid, outcome, at)
         VALUES (?,?,?, 'replied', ?)`,
      ).bind(accountId, row.mailbox_id, row.uid, nowIso()).run();
    }

    return sent.ok
      ? json({ success: true, message: `Sent to ${row.to_email}.`, drafts: await listDrafts(Number(d.limit) || 50) })
      : fail(sent.error);
  }

  return fail(`"${act}" is not something this endpoint does.`);
}
