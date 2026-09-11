/**
 * Answering leads while nobody is signed in.
 *
 * Everything here existed already and could not run. The drafting, the rules,
 * the per-mailbox company voice, auto-send versus draft — all of it lives in
 * Conversations.tsx and polls every sixty seconds *while that page is open*.
 * A customer who shuts their laptop stops answering leads, which is precisely
 * what they were sold the opposite of.
 *
 * ── The rule that shapes this file ──
 *
 * In the browser a person was watching. If the AI wrote something stupid they
 * saw it within seconds and could apologise. Here nobody is watching, so the
 * defaults are inverted: a reply is drafted and *held* unless the customer has
 * explicitly said this mailbox may send on its own — and even then, the first
 * few go to a person regardless, because the moment to discover the company
 * voice is wrong is before it has gone to fifty people.
 */
import { dataGet, nowIso, type Env } from './lib/db';
import { loadMailboxes, type Mailbox } from './routes/mailbox';
import { imapFetch } from './lib/imap';
import { smtpSend } from './lib/smtp';
import { buildMime } from './lib/mime';
import { askGemini, loadAiKey } from './lib/ai';
import {
  classify, matchRule, needsEscalation, replyPrompt, shouldRefuse,
  type AutoReplyRule, type InboundMessage,
} from './lib/replyRules';

/** Where the inbox screen keeps the bits of a mailbox that are not secrets. */
const EXTRAS_KEY = 'crm_mailbox_extras';
const CONTACTS_KEY = 'crm_contacts';

/** Messages read per mailbox per tick. Small: a backlog spreads over ticks
 *  rather than spending the whole Worker budget on one busy inbox. */
const FETCH_LIMIT = 15;

/**
 * How many replies a workspace must have had a person approve before any is
 * allowed to send unattended.
 *
 * Not a formality. The company profile, the tone and the knowledge base are all
 * free text a customer typed once, and the first time anybody finds out whether
 * the AI sounds like their business is when it answers a real person. Three
 * gives them a look at it against real mail before it speaks for them.
 */
const SUPERVISED_FIRST = 3;

export interface ReplyReport {
  read: number;
  replied: number;
  drafted: number;
  refused: number;
  failed: number;
  notes: string[];
}

interface Extras {
  color?: string;
  profile?: {
    companyName?: string; industry?: string; description?: string; products?: string;
    tone?: string; signature?: string; knowledge?: string; businessHours?: string; website?: string;
  };
  autoReplyRules?: AutoReplyRule[];
}

function parse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

const rid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Everything this workspace has already dealt with, for these mailboxes. */
async function seenUids(env: Env, accountId: string): Promise<Set<string>> {
  const rows = await env.DB.prepare(
    'SELECT mailbox_id, uid FROM crm_reply_seen WHERE account_id = ?',
  ).bind(accountId).all<{ mailbox_id: string; uid: number }>();
  return new Set((rows.results ?? []).map(r => `${r.mailbox_id}:${r.uid}`));
}

async function markSeen(env: Env, accountId: string, mailboxId: string, uid: string, outcome: string): Promise<void> {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO crm_reply_seen (account_id, mailbox_id, uid, outcome, at)
     VALUES (?,?,?,?,?)`,
  ).bind(accountId, mailboxId, uid, outcome, nowIso()).run();
}

/** How many replies this workspace has actually sent, ever. */
async function sentSoFar(env: Env, accountId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM crm_reply_seen WHERE account_id = ? AND outcome = 'replied'",
  ).bind(accountId).first<{ n: number }>();
  return row?.n ?? 0;
}

/** Record what happened as an Autopilot action, so it appears in one place. */
async function logAction(
  env: Env, accountId: string,
  kind: string, status: string, summary: string, because: string,
  link?: { kind: string; id: string; label: string; route: string },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO crm_autopilot_actions
     (id, account_id, kind, status, summary, because, counts, effect, detail,
      link_kind, link_id, link_label, link_route, created_at, acted_at)
     VALUES (?,?,?,?,?,?,'{}','{"type":"none"}','',?,?,?,?,?,?)`,
  ).bind(
    rid('ap'), accountId, kind, status, summary, because,
    link?.kind ?? null, link?.id ?? null, link?.label ?? null, link?.route ?? null,
    nowIso(), nowIso(),
  ).run();
}

/** One mailbox's unread mail, dealt with. */
async function doMailbox(
  env: Env,
  accountId: string,
  mb: Mailbox,
  extras: Extras,
  apiKey: string,
  report: ReplyReport,
): Promise<void> {
  const rules = extras.autoReplyRules ?? [];
  /* No rule enabled means the customer has not asked for this mailbox to be
     answered. Fetching it anyway would be reading their mail for no reason. */
  if (!rules.some(r => r.enabled)) return;
  if (!mb.imap.host || !mb.imap.username) return;

  const fetched = await imapFetch({ ...mb.imap, folder: mb.imap.folder }, FETCH_LIMIT);
  if (!fetched.ok) {
    report.failed++;
    report.notes.push(`${mb.label || mb.imap.host}: could not read the mailbox — ${fetched.error.slice(0, 120)}`);
    return;
  }

  const seen = await seenUids(env, accountId);
  const contacts = parse<{ id: string; email?: string; name?: string }[]>(
    await dataGet(env.DB, accountId, CONTACTS_KEY), []);
  const knownSenders = new Set(contacts.map(c => (c.email ?? '').toLowerCase()).filter(Boolean));

  let approvedCount = await sentSoFar(env, accountId);

  for (const raw of fetched.messages ?? []) {
    const msg: InboundMessage = {
      uid: String(raw.uid),
      from: raw.from ?? '',
      fromName: raw.fromName ?? '',
      subject: raw.subject ?? '',
      body: raw.body ?? raw.snippet ?? '',
      date: raw.date ?? nowIso(),
    };
    if (seen.has(`${mb.id}:${msg.uid}`)) continue;
    report.read++;

    /* ── Things never to answer ── */
    const refusal = shouldRefuse(msg, {});
    if (refusal.refuse && refusal.outcome !== 'held') {
      await markSeen(env, accountId, mb.id, msg.uid, refusal.outcome);
      report.refused++;
      /* Only the deliberate ones are worth a line in the log. Recording every
         out-of-office would bury the decisions that matter under noise. */
      if (refusal.outcome === 'stopped') {
        await logAction(env, accountId, 'observe', 'done',
          `Did not reply to ${msg.from}`, refusal.because);
      }
      continue;
    }

    const { sentiment } = classify(`${msg.subject} ${msg.body}`);
    const isFirstContact = !knownSenders.has(msg.from.toLowerCase());
    const rule = matchRule(rules, msg, isFirstContact, sentiment);
    if (!rule) { await markSeen(env, accountId, mb.id, msg.uid, 'ignored'); continue; }

    /* ── Draft it ── */
    const p = extras.profile ?? {};
    const prompt = replyPrompt({
      companyName: p.companyName ?? '', industry: p.industry ?? '',
      description: p.description ?? '', products: p.products ?? '',
      businessHours: p.businessHours ?? '', website: p.website ?? '',
      knowledge: p.knowledge ?? '', tone: p.tone ?? 'professional',
      signature: p.signature ?? '',
    }, msg, rule.instruction);

    const ai = await askGemini(apiKey, prompt, 0.5);
    if (!ai.ok) {
      /* Not marked seen: a key that ran out of quota should answer this message
         on the next tick, not skip it for ever. */
      report.failed++;
      report.notes.push(`${mb.label || 'mailbox'}: ${ai.error.slice(0, 120)}`);
      return;
    }

    let drafted: { subject: string; body: string; confidence: number; needsHuman: boolean };
    try {
      const r = JSON.parse(ai.text) as Partial<typeof drafted>;
      drafted = {
        subject: r.subject || `Re: ${msg.subject}`,
        body: r.body || '',
        confidence: typeof r.confidence === 'number' ? Math.max(0, Math.min(100, r.confidence)) : 60,
        needsHuman: !!r.needsHuman,
      };
    } catch {
      report.failed++;
      report.notes.push(`${mb.label || 'mailbox'}: the AI's reply was not readable JSON.`);
      await markSeen(env, accountId, mb.id, msg.uid, 'ignored');
      continue;
    }
    if (!drafted.body.trim()) {
      await markSeen(env, accountId, mb.id, msg.uid, 'ignored');
      continue;
    }

    /*
     * ── Send it, or hold it ──
     *
     * Four separate reasons to hold, and each is worth saying out loud because
     * "why did this not send?" is otherwise unanswerable.
     */
    const holdReason =
      refusal.refuse ? refusal.because
      : rule.mode !== 'auto_send'
        ? `the rule "${rule.name || 'auto-reply'}" is set to draft rather than send`
      : approvedCount < SUPERVISED_FIRST
        ? `this is one of the first ${SUPERVISED_FIRST} replies from this workspace, and they always go to you first so you can hear how it sounds`
      : drafted.needsHuman
        ? 'the AI had to defer specifics it could not find in your company profile'
      : needsEscalation(msg)
        ? 'the message mentions a formal complaint'
      : drafted.confidence < 55
        ? `the AI was only ${drafted.confidence}% confident your knowledge base covered the question`
      : '';

    if (holdReason) {
      await env.DB.prepare(
        `INSERT INTO crm_reply_drafts
         (id, account_id, mailbox_id, uid, to_email, to_name, in_subject, in_body,
          subject, body, confidence, needs_human, rule_name, because, status, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'waiting', ?)`,
      ).bind(
        rid('rd'), accountId, mb.id, msg.uid, msg.from, msg.fromName,
        msg.subject, msg.body.slice(0, 4000),
        drafted.subject, drafted.body, drafted.confidence, drafted.needsHuman ? 1 : 0,
        rule.name || '', holdReason, nowIso(),
      ).run();
      await markSeen(env, accountId, mb.id, msg.uid, 'held');
      report.drafted++;
      await logAction(env, accountId, 'approval', 'awaiting',
        `A reply to ${msg.fromName || msg.from} is written and waiting for you`,
        holdReason,
        { kind: 'contact', id: msg.from, label: msg.subject.slice(0, 60), route: '/conversations' });
      continue;
    }

    /* ── Actually send ── */
    const fromEmail = mb.from.email || mb.smtp.username;
    const mime = buildMime({
      fromName: mb.from.name || p.companyName || 'Support',
      fromEmail,
      to: msg.from,
      subject: drafted.subject,
      html: drafted.body.replace(/\n/g, '<br>'),
      replyTo: mb.from.replyTo || undefined,
    }, mb.smtp.host);

    const sent = await smtpSend(mb.smtp, { from: fromEmail, to: msg.from, mime });
    if (sent.ok) {
      await markSeen(env, accountId, mb.id, msg.uid, 'replied');
      approvedCount++;
      report.replied++;
      await logAction(env, accountId, 'send', 'done',
        `Replied to ${msg.fromName || msg.from}`,
        `the rule "${rule.name || 'auto-reply'}" matched and is set to send on its own`,
        { kind: 'contact', id: msg.from, label: msg.subject.slice(0, 60), route: '/conversations' });
    } else {
      await markSeen(env, accountId, mb.id, msg.uid, 'ignored');
      report.failed++;
      report.notes.push(`reply to ${msg.from} failed — ${sent.error.slice(0, 120)}`);
      await logAction(env, accountId, 'error', 'failed',
        `Could not send a reply to ${msg.from}`, sent.error.slice(0, 200));
    }
  }
}

/**
 * One pass over every workspace that has replying switched on.
 *
 * Driven off crm_ai_config: no key means nothing here can run, and scanning
 * every workspace to discover that would grow the tick with the customer list.
 */
export async function runReplies(env: Env): Promise<ReplyReport> {
  const report: ReplyReport = { read: 0, replied: 0, drafted: 0, refused: 0, failed: 0, notes: [] };

  const { results } = await env.DB.prepare(
    /* DISTINCT because the join is now one row per running *project*, and a
       workspace with three of them would otherwise have its inbox polled three
       times a tick — three times the IMAP connections and, worse, three
       chances to answer the same message. */
    `SELECT DISTINCT a.account_id FROM crm_ai_config a
     JOIN crm_projects p ON p.account_id = a.account_id
     WHERE a.api_key != '' AND p.status = 'running' LIMIT 200`,
  ).all<{ account_id: string }>();

  for (const row of results ?? []) {
    const accountId = row.account_id;
    try {
      const apiKey = await loadAiKey(env, accountId);
      if (!apiKey) continue;
      const extrasAll = parse<Record<string, Extras>>(await dataGet(env.DB, accountId, EXTRAS_KEY), {});
      const mailboxes = await loadMailboxes(env, accountId);
      for (const mb of mailboxes) {
        await doMailbox(env, accountId, mb, extrasAll[mb.id] ?? {}, apiKey, report);
      }
    } catch (e) {
      report.failed++;
      report.notes.push(`${accountId}: replying failed — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return report;
}
