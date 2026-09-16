/**
 * What this workspace can actually do right now.
 *
 * ── Three states, not two ──
 *
 * `ready`, `missing`, and `unknown`. The third is the one that matters: a check
 * that could not run is not the same as a thing that is not set up, and
 * reporting it as `missing` sends somebody to reconnect a mailbox that was
 * working all along. It is the same rule the rest of this codebase follows
 * about DNS lookups and provider status.
 *
 * ── Why it asks the server rather than localStorage ──
 *
 * Because localStorage is the copy that matters least. The AI Engine panel
 * learned this the hard way: it reported "connected" from the browser's own
 * key while the server held none, so Autopilot could not write a word and the
 * screen was confident about it. Every answer here comes from the endpoint that
 * would actually be used.
 */
import { fetchReplies } from './replies';
import { loadMailboxes } from './mailboxService';
import { API_BASE } from './apiBase';
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';
import type { Requirement } from './projectJobs';

export type ReadyState = 'ready' | 'missing' | 'unknown';

export type Readiness = Record<Requirement, ReadyState>;

const UNKNOWN: Readiness = { ai: 'unknown', mailbox: 'unknown', sms: 'unknown', payments: 'unknown' };

async function aiState(): Promise<ReadyState> {
  try {
    const r = await fetchReplies();
    if (!r.ai) return 'unknown';
    /* Verified and not refused since. A key on record that last failed is not
       a key that works, and saying so here saves somebody discovering it when
       their first campaign produces nothing. */
    return r.ai.hasKey && !r.ai.lastError ? 'ready' : 'missing';
  } catch { return 'unknown'; }
}

async function mailboxState(): Promise<ReadyState> {
  try {
    const boxes = await loadMailboxes();
    return boxes.some(m => (m.smtpHost ?? '').trim()) ? 'ready' : 'missing';
  } catch { return 'unknown'; }
}

async function post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken(), accountId: getActiveAccountId(), ...body }),
    });
    return await r.json() as Record<string, unknown>;
  } catch { return null; }
}

async function smsState(): Promise<ReadyState> {
  const d = await post('/api/sms-send.php', { action: 'get' });
  if (!d || d.success !== true) return 'unknown';
  const sms = d.sms as { hasCredentials?: boolean; fromNumber?: string } | null;
  return sms?.hasCredentials && sms.fromNumber ? 'ready' : 'missing';
}

async function paymentsState(): Promise<ReadyState> {
  /* `get`, not `status` — the action this endpoint actually has. Asking for one
     it does not would answer `unknown` forever, which reads as a shy check
     rather than a wrong one. */
  const d = await post('/api/storefront.php', { action: 'get' });
  if (!d || d.success !== true) return 'unknown';
  const sf = d.storefront as { connected?: boolean; lastError?: string } | null;
  if (!sf || typeof sf.connected !== 'boolean') return 'unknown';
  return sf.connected ? 'ready' : 'missing';
}

/**
 * Ask about everything at once.
 *
 * In parallel, because four sequential round trips is a wizard step that feels
 * broken — and because none of the four answers depends on another.
 */
export async function checkReadiness(): Promise<Readiness> {
  try {
    const [ai, mailbox, sms, payments] = await Promise.all([
      aiState(), mailboxState(), smsState(), paymentsState(),
    ]);
    return { ai, mailbox, sms, payments };
  } catch {
    return UNKNOWN;
  }
}
