/**
 * "You have a reply waiting" — an email to somebody who wrote to support,
 * got an answer from a person, and left before reading it.
 *
 * ── The rule ──
 *
 * A reply from a person (role 'agent', never an internal note, never the
 * assistant's own answers — those arrive while the visitor is still typing),
 * two hours old, that the visitor has not seen since: not with the chat open
 * in front of them (`visitor_seen_at`, written by the widget's poll), not by
 * writing again (`last_visitor_at`), not by opening the ticket
 * (`customer_seen_at`). One email per unread reply — `unread_nudged_at` is set
 * when it goes, so the next one waits for the next reply. Nothing older than
 * a week: a reminder about last month's chat reads as spam.
 *
 * Two hours because a visitor who stepped away for coffee is back long before
 * it, and an answer that waits a day has stopped being useful (owner,
 * 2026-11-25). The email carries a short preview, not the whole answer — the
 * point is to bring them back to the conversation, where they can reply.
 *
 * ── Whose ──
 *
 * On for the install owner's own support. For everybody else's workspace it
 * is their visitors and their mailbox, so it waits for them to switch it on
 * (Customer Support → Settings, `crm_engage_settings.nudge_unread`).
 * Sent from the workspace's own mailbox through `deliver`.
 */
import { metaGet, metaPut, nowIso, type Env } from './db';
import { canSend, deliver, fromAddressOf } from './deliver';
import { loadMailbox } from '../routes/mailbox';
import { esc, safeLink } from '../routes/customers';
import { houseWidgetAccount } from '../routes/engage';
import { mailHtml, origin } from './supportDesk';

export const NUDGE_AFTER_MS = 2 * 3_600_000;
const MAX_AGE_MS = 7 * 86_400_000;
const GATE_KEY = 'unread_nudge_at';
const GATE_MS = 10 * 60_000;
const MAX_PER_PASS = 30;

export interface NudgeReport { sent: number; failed: number; notes: string[] }

function preview(text: string, n = 180): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n).replace(/\s+\S*$/, '')}…` : t;
}

/** Is this workspace's reminder switched on? NULL means the default. */
async function enabledFor(env: Env, accountId: string, cache: Map<string, boolean>): Promise<boolean> {
  if (cache.has(accountId)) return cache.get(accountId)!;
  const row = await env.DB.prepare('SELECT nudge_unread AS on_ FROM crm_engage_settings WHERE account_id = ?')
    .bind(accountId).first<{ on_: number | null }>().catch(() => null);
  let on: boolean;
  if (row && row.on_ !== null && row.on_ !== undefined) on = !!row.on_;
  else {
    const own = await env.DB.prepare(
      "SELECT 1 AS x FROM crm_workspaces w JOIN crm_users u ON u.email = w.owner_email WHERE w.account_id = ? AND u.role = 'agency' AND u.account_id IS NULL",
    ).bind(accountId).first().catch(() => null);
    on = !!own;
  }
  cache.set(accountId, on);
  return on;
}

async function businessName(env: Env, accountId: string): Promise<string> {
  const r = await env.DB.prepare('SELECT business_name AS n FROM crm_engage_settings WHERE account_id = ?')
    .bind(accountId).first<{ n: string }>().catch(() => null);
  return (r?.n || '').trim();
}

interface Due {
  id: string; accountId: string; email: string; name: string; body: string; lastAgent: string;
  link: string; kind: 'chat' | 'ticket'; reference?: string; subject?: string;
}

export async function runUnreadNudges(env: Env, opts: { force?: boolean } = {}): Promise<NudgeReport> {
  const report: NudgeReport = { sent: 0, failed: 0, notes: [] };
  if (!opts.force) {
    const last = Number(await metaGet(env.DB, GATE_KEY).catch(() => '0')) || 0;
    if (Date.now() - last < GATE_MS) return report;
    await metaPut(env.DB, GATE_KEY, String(Date.now())).catch(() => null);
  }
  const cut = new Date(Date.now() - NUDGE_AFTER_MS).toISOString();
  const week = new Date(Date.now() - MAX_AGE_MS).toISOString();
  const app = origin(env);
  const house = await houseWidgetAccount(env).catch(() => '');
  const due: Due[] = [];

  try {
    const chats = (await env.DB.prepare(
      `SELECT * FROM (
         SELECT c.id, c.account_id AS accountId, c.page_url AS pageUrl, c.channel,
                c.visitor_seen_at AS seen, c.last_visitor_at AS lastVisitor, c.unread_nudged_at AS nudged,
                p.email, p.name,
                (SELECT max(m.created_at) FROM crm_conversation_messages m WHERE m.conversation_id = c.id AND m.role = 'agent' AND m.internal = 0) AS lastAgent,
                (SELECT m.body FROM crm_conversation_messages m WHERE m.conversation_id = c.id AND m.role = 'agent' AND m.internal = 0 ORDER BY m.created_at DESC LIMIT 1) AS body
         FROM crm_conversations c JOIN crm_engage_people p ON p.id = c.person_id
         WHERE c.updated_at > ?1 AND p.email != '')
       WHERE lastAgent IS NOT NULL AND lastAgent < ?2 AND lastAgent > ?1
         AND lastAgent > seen AND lastAgent > lastVisitor AND lastAgent > nudged
       LIMIT 100`,
    ).bind(week, cut).all<Record<string, string>>()).results ?? [];
    for (const c of chats) {
      /* Back to where the chat happened, with the widget told to open it;
         a direct message lives in the app. */
      const page = c.channel === 'direct' ? `${app}/` : safeLink(c.pageUrl);
      due.push({ id: c.id, accountId: c.accountId, email: c.email, name: c.name, body: c.body, lastAgent: c.lastAgent, kind: 'chat', link: page ? `${page.split('#')[0]}#pc-chat` : '' });
    }

    const tickets = (await env.DB.prepare(
      `SELECT * FROM (
         SELECT t.id, t.account_id AS accountId, t.reference, t.subject, t.conversation_id AS conversationId,
                t.customer_seen_at AS seen, t.unread_nudged_at AS nudged, t.created_at AS createdAt, p.email, p.name,
                (SELECT max(m.created_at) FROM crm_ticket_messages m WHERE m.ticket_id = t.id AND m.role = 'agent' AND m.internal = 0) AS lastAgent,
                (SELECT m.body FROM crm_ticket_messages m WHERE m.ticket_id = t.id AND m.role = 'agent' AND m.internal = 0 ORDER BY m.created_at DESC LIMIT 1) AS body,
                COALESCE((SELECT max(m.created_at) FROM crm_ticket_messages m WHERE m.ticket_id = t.id AND m.role = 'customer'), '') AS lastCustomer
         FROM crm_tickets t JOIN crm_engage_people p ON p.id = t.person_id
         WHERE t.updated_at > ?1 AND p.email != '')
       WHERE lastAgent IS NOT NULL AND lastAgent < ?2 AND lastAgent > ?1
         AND lastAgent > seen AND lastAgent > nudged AND lastAgent > lastCustomer
       LIMIT 100`,
    ).bind(week, cut).all<Record<string, string>>()).results ?? [];
    for (const t of tickets) {
      let link = '';
      if (t.accountId === house) link = `${app}/#pc-tickets`;
      else if (t.conversationId) {
        const conv = await env.DB.prepare('SELECT page_url AS u FROM crm_conversations WHERE id = ?').bind(t.conversationId).first<{ u: string }>().catch(() => null);
        const page = safeLink(conv?.u);
        if (page) link = `${page.split('#')[0]}#pc-tickets`;
      }
      due.push({ id: t.id, accountId: t.accountId, email: t.email, name: t.name, body: t.body, lastAgent: t.lastAgent, kind: 'ticket', reference: t.reference, subject: t.subject, link });
    }
  } catch (e) {
    report.notes.push(`unread reminders: ${String(e).slice(0, 160)}`);
    return report;
  }

  const enabled = new Map<string, boolean>();
  for (const n of due.slice(0, MAX_PER_PASS)) {
    if (!(await enabledFor(env, n.accountId, enabled))) continue;
    const mb = await loadMailbox(env, n.accountId).catch(() => null);
    if (!canSend(mb)) continue;
    /* Claimed before sending: two passes overlapping must not both email. */
    const table = n.kind === 'chat' ? 'crm_conversations' : 'crm_tickets';
    const claim = await env.DB.prepare(`UPDATE ${table} SET unread_nudged_at = ? WHERE id = ? AND unread_nudged_at < ?`)
      .bind(nowIso(), n.id, n.lastAgent).run();
    if (!claim.meta?.changes) continue;

    const biz = (await businessName(env, n.accountId)) || (n.accountId === house ? 'Protected Central' : (mb.from.name || 'Support'));
    const first = (n.name || '').trim().split(/\s+/)[0] || 'there';
    const subject = n.kind === 'ticket' ? `Reply to your ticket ${n.reference} — ${biz}` : `You have an unread reply from ${biz}`;
    const html = mailHtml({
      heading: n.kind === 'ticket' ? `Your ticket ${n.reference ?? ''} has a reply` : `${biz} replied to your chat`,
      paragraphs: [
        `Hi ${first}, you have a reply you have not read yet${n.kind === 'ticket' && n.subject ? ` about “${n.subject}”` : ''}:`,
        `“${preview(n.body)}”`,
        n.link ? '' : (n.kind === 'ticket' ? `To read all of it and answer, open the help button on our website and choose Check ticket status (reference ${n.reference}).` : 'To read all of it and answer, open the chat on our website again.'),
      ],
      button: n.link ? { href: n.link, label: n.kind === 'ticket' ? 'Read the full reply' : 'Read and reply' } : undefined,
      footer: `You are getting this because you wrote to ${esc(biz)} and a reply is waiting. We send one reminder per reply.`,
    });
    const r = await deliver(mb, { fromName: biz, fromEmail: fromAddressOf(mb), to: n.email, subject, html });
    if (r.ok) report.sent++;
    else { report.failed++; report.notes.push(`unread reminder to a visitor of ${n.accountId} failed: ${r.error.slice(0, 120)}`); }
  }
  return report;
}
