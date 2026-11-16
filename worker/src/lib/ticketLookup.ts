/**
 * Somebody's own tickets, found by who they are rather than by a reference
 * and a key they had to keep (owner, 2026-11-15).
 *
 *  - **Signed in** on this install's own origin: the session's email, proved
 *    by the cookie (engage.php swaps the placeholder for the real token only
 *    there). Nothing to type.
 *  - **Not signed in**: their email, then a six-digit code mailed to it
 *    (migration 0100 says why an address alone is not enough).
 *
 * Either way only tickets of the widget's own workspace whose person has that
 * email are listed, internal notes never, the guest key never.
 */
import { nowIso, type Env } from './db';
import { rid } from './engagement';

const CODE_MINUTES = 15;
const MAX_TRIES = 5;
const MAX_TICKETS = 20;

async function sha(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const hashOf = (accountId: string, email: string, code: string) => sha(`${accountId}|${email.toLowerCase()}|${code}`);

/** A fresh code for this address at this workspace; older ones die with it. */
export async function issueLookupCode(env: Env, accountId: string, email: string): Promise<string> {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  const code = String(n).padStart(6, '0');
  const e = email.toLowerCase();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM crm_ticket_lookup_codes WHERE account_id = ? AND email = ?').bind(accountId, e),
    env.DB.prepare(
      `INSERT INTO crm_ticket_lookup_codes (id, account_id, email, code_hash, attempts, expires_at, created_at)
       VALUES (?,?,?,?,0,?,?)`,
    ).bind(rid('tlc'), accountId, e, await hashOf(accountId, e, code), Math.floor(Date.now() / 1000) + CODE_MINUTES * 60, nowIso()),
  ]);
  return code;
}

/**
 * Whether this code opens this address's tickets. A wrong guess counts
 * against the live code — not against a rate limit a new code would reset.
 * Good for the whole code's life rather than once: "Back" and opening a
 * second ticket must not mean another email.
 */
export async function checkLookupCode(env: Env, accountId: string, email: string, code: string): Promise<'ok' | 'wrong' | 'dead'> {
  const e = email.toLowerCase();
  const row = await env.DB.prepare(
    `SELECT id, code_hash AS hash, attempts, expires_at AS exp FROM crm_ticket_lookup_codes
     WHERE account_id = ? AND email = ? ORDER BY created_at DESC LIMIT 1`,
  ).bind(accountId, e).first<{ id: string; hash: string; attempts: number; exp: number }>();
  if (!row || row.exp < Date.now() / 1000 || row.attempts >= MAX_TRIES) return 'dead';
  if (/^\d{6}$/.test(code) && await hashOf(accountId, e, code) === row.hash) return 'ok';
  await env.DB.prepare('UPDATE crm_ticket_lookup_codes SET attempts = attempts + 1 WHERE id = ?').bind(row.id).run();
  return row.attempts + 1 >= MAX_TRIES ? 'dead' : 'wrong';
}

export interface OwnTicket {
  id: string; reference: string; subject: string; status: string; category: string;
  createdAt: string; updatedAt: string; resolution: string;
  messages: { role: string; body: string; createdAt: string }[];
}

/** That address's tickets at this workspace, open ones first, with their public replies. */
export async function ticketsFor(env: Env, accountId: string, email: string): Promise<OwnTicket[]> {
  const { results } = await env.DB.prepare(
    `SELECT t.id, t.reference, t.subject, t.status, t.category, t.resolution,
            t.created_at AS createdAt, t.updated_at AS updatedAt
     FROM crm_tickets t
     JOIN crm_engage_people p ON p.id = t.person_id AND p.account_id = t.account_id
     WHERE t.account_id = ? AND p.email = ?
     ORDER BY CASE WHEN t.status IN ('resolved', 'closed') THEN 1 ELSE 0 END, t.updated_at DESC
     LIMIT ?`,
  ).bind(accountId, email.toLowerCase(), MAX_TICKETS).all<Omit<OwnTicket, 'messages'>>();
  const list = results ?? [];
  if (!list.length) return [];
  const marks = list.map(() => '?').join(',');
  const { results: msgs } = await env.DB.prepare(
    `SELECT ticket_id AS ticketId, role, body, created_at AS createdAt FROM crm_ticket_messages
     WHERE account_id = ? AND internal = 0 AND ticket_id IN (${marks}) ORDER BY created_at ASC LIMIT 400`,
  ).bind(accountId, ...list.map(t => t.id)).all<{ ticketId: string; role: string; body: string; createdAt: string }>();
  return list.map(t => ({
    ...t,
    messages: (msgs ?? []).filter(m => m.ticketId === t.id).map(({ role, body, createdAt }) => ({ role, body, createdAt })),
  }));
}
