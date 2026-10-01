/**
 * Reputation on the cron: reading Google on a schedule, and sending the review
 * requests Autopilot queued.
 *
 * ── Why the requests are here ──
 *
 * Autopilot's `review_request` action appended `{status: 'queued'}` rows to
 * crm_reputation_requests and reported "queued in Reviews" — and nothing ever
 * sent them. A customer who approved that action was told it was done. They go
 * out here, through the one door (lib/deliver.ts), and each row says what
 * became of it.
 *
 * ── Gates ──
 *
 * The pass runs at most every fifteen minutes for the whole install
 * (`crm_meta.reputation_tick_at`, null it to test), and each workspace is read
 * from Google at most every six hours. Google bills per request, and reviews
 * arrive over days, not minutes; "Check now" on the screen is there for the
 * moment somebody is waiting for one.
 */
import { dataGet, dataPut, metaGet, metaPut, nowIso, type Env } from './db';
import { addr } from './http';
import { canSend, cannotSendReason, deliver, fromAddressOf } from './deliver';
import { loadMailbox, type Mailbox } from '../routes/mailbox';
import { checkWorkspace, loadProfile, refreshCompetitors, type Profile } from './reputation';

const GATE_KEY = 'reputation_tick_at';
const EVERY_MS = 15 * 60_000;
const CHECK_EVERY_MS = 6 * 3_600_000;
const COMPETITORS_EVERY_MS = 24 * 3_600_000;
const MAX_CHECKS = 15;
const MAX_SENDS = 25;
const MAX_SENDS_PER_WORKSPACE = 10;
const MAX_ATTEMPTS = 3;
export const REQ_KEY = 'crm_reputation_requests';

export interface ReputationReport { ran: boolean; checked: number; added: number; failed: number; requestsSent: number; requestsFailed: number; notes: string[] }

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const PLATFORMS = ['google', 'facebook', 'yelp', 'trustpilot'] as const;

/** The link a request sends people to: the one asked for, else Google's, else any. */
export function reviewLinkFor(profile: Profile, platform?: string): { platform: string; link: string } | null {
  const links = profile.reviewLinks ?? {};
  const ok = (u: unknown) => typeof u === 'string' && /^https:\/\//i.test(u.trim());
  if (platform && ok(links[platform])) return { platform, link: links[platform].trim() };
  for (const p of PLATFORMS) if (ok(links[p])) return { platform: p, link: links[p].trim() };
  return null;
}

/** Has this address opted out of this workspace's mail? */
async function optedOut(env: Env, accountId: string, email: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT 1 AS n FROM crm_unsubscribes WHERE account_id = ? AND lower(email) = lower(?) LIMIT 1')
    .bind(accountId, email).first().catch(() => null);
  return !!row;
}

/** One review request, by email, from the workspace's own mailbox. */
export async function sendReviewRequest(
  env: Env, accountId: string, mb: Mailbox, profile: Profile,
  to: { name: string; email: string }, link: string,
): Promise<{ ok: boolean; error: string; permanent?: boolean }> {
  const email = addr(to.email);
  if (!email) return { ok: false, error: 'No usable email address for this contact.', permanent: true };
  if (await optedOut(env, accountId, email)) return { ok: false, error: `${email} has unsubscribed from this business's email.`, permanent: true };
  const business = profile.name || mb.from.name || 'us';
  const first = (to.name || '').trim().split(/\s+/)[0] || 'there';
  const html = `<p>Hi ${esc(first)},</p><p>Thanks for choosing ${esc(business)}! Would you take 30 seconds to share your experience? It really helps us.</p>`
    + `<p><a href="${esc(link)}" style="display:inline-block;padding:12px 24px;background:#17191c;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">Leave a review</a></p>`
    + (profile.signature ? `<p>${esc(profile.signature)}</p>` : '');
  const r = await deliver(mb, {
    fromName: mb.from.name || business, fromEmail: fromAddressOf(mb), to: email,
    subject: `How was your experience with ${business}?`, html,
    replyTo: mb.from.replyTo || undefined,
  });
  return { ok: r.ok, error: r.error };
}

interface QueuedRequest {
  id?: string; contactId?: string; contactName?: string; email?: string; platform?: string;
  status?: string; sentAt?: string; error?: string; attempts?: number; lastTriedAt?: string; createdAt?: string;
  [k: string]: unknown;
}

/**
 * Send what is queued for one workspace. A problem that is the workspace's to
 * fix (no mailbox, no review link) leaves the rows queued with the reason, so
 * they go the moment it is fixed; a problem with one contact fails that row.
 */
export async function sendQueued(env: Env, accountId: string, budget: number): Promise<{ sent: number; failed: number; note: string }> {
  const raw = await dataGet(env.DB, accountId, REQ_KEY);
  let reqs: QueuedRequest[];
  try { reqs = JSON.parse(raw ?? '[]') as QueuedRequest[]; } catch { reqs = []; }
  if (!Array.isArray(reqs)) return { sent: 0, failed: 0, note: '' };
  const queued = reqs.filter(r => r && r.status === 'queued');
  if (!queued.length) return { sent: 0, failed: 0, note: '' };

  const now = nowIso();
  const profile = await loadProfile(env, accountId);
  const mb = await loadMailbox(env, accountId);
  const target = reviewLinkFor(profile, 'google');
  const blocker = !canSend(mb) ? cannotSendReason(mb)
    : !target ? 'No review link is set. Add your Google review link in Reputation → Settings → Review sources.'
    : '';
  if (blocker) {
    for (const r of queued) { r.error = blocker; r.lastTriedAt = now; }
    await dataPut(env.DB, accountId, REQ_KEY, JSON.stringify(reqs));
    return { sent: 0, failed: 0, note: `${accountId}: ${queued.length} review request(s) waiting — ${blocker}` };
  }

  let contacts: { id?: string; name?: string; firstName?: string; lastName?: string; email?: string }[];
  try { contacts = JSON.parse(await dataGet(env.DB, accountId, 'crm_contacts') ?? '[]'); } catch { contacts = []; }
  const byId = new Map((Array.isArray(contacts) ? contacts : []).map(c => [String(c.id ?? ''), c]));

  let sent = 0, failed = 0;
  for (const r of queued.slice(0, budget)) {
    const c = r.contactId ? byId.get(String(r.contactId)) : undefined;
    const name = String(r.contactName ?? c?.name ?? [c?.firstName, c?.lastName].filter(Boolean).join(' ') ?? '').trim();
    const email = String(r.email ?? c?.email ?? '').trim();
    r.contactName = name; r.email = email; r.platform = target!.platform; r.lastTriedAt = now;
    if (!email) {
      r.status = 'failed'; r.error = c ? 'This contact has no email address.' : 'This contact no longer exists.'; failed++;
      continue;
    }
    const res = await sendReviewRequest(env, accountId, mb as Mailbox, profile, { name, email }, target!.link);
    r.attempts = (Number(r.attempts) || 0) + 1;
    if (res.ok) { r.status = 'sent'; r.sentAt = nowIso(); r.error = ''; sent++; continue; }
    r.error = res.error.slice(0, 300);
    /* Tried again on the next pass unless it can never work, or it has had its three chances. */
    if (res.permanent || r.attempts >= MAX_ATTEMPTS) { r.status = 'failed'; failed++; }
  }
  await dataPut(env.DB, accountId, REQ_KEY, JSON.stringify(reqs));
  return { sent, failed, note: '' };
}

/** The pass itself. Never throws; reports counts. */
export async function runReputation(env: Env): Promise<ReputationReport> {
  const report: ReputationReport = { ran: false, checked: 0, added: 0, failed: 0, requestsSent: 0, requestsFailed: 0, notes: [] };
  try {
    const last = await metaGet(env.DB, GATE_KEY);
    if (last && Date.now() - Date.parse(last) < EVERY_MS) return report;
    await metaPut(env.DB, GATE_KEY, nowIso());
    report.ran = true;

    const due = new Date(Date.now() - CHECK_EVERY_MS).toISOString();
    const { results } = await env.DB.prepare(
      `SELECT s.account_id AS accountId, s.competitors_at AS competitorsAt FROM crm_review_sources s
       WHERE s.auto_check = 1 AND (s.last_checked_at IS NULL OR s.last_checked_at < ?)
         AND (s.place_id != '' OR EXISTS (SELECT 1 FROM crm_gbp_connections g WHERE g.account_id = s.account_id AND g.status = 'connected' AND g.location_name != ''))
       ORDER BY s.last_checked_at IS NOT NULL, s.last_checked_at LIMIT ?`,
    ).bind(due, MAX_CHECKS).all<{ accountId: string; competitorsAt: string | null }>();

    for (const w of results ?? []) {
      try {
        const r = await checkWorkspace(env, w.accountId);
        report.checked++;
        report.added += r.added;
        if (!r.ok) { report.failed++; report.notes.push(`${w.accountId}: reviews not read — ${r.error.slice(0, 160)}`); }
        if (!w.competitorsAt || Date.now() - Date.parse(w.competitorsAt) > COMPETITORS_EVERY_MS) {
          await refreshCompetitors(env, w.accountId);
        }
      } catch (e) {
        report.failed++;
        report.notes.push(`${w.accountId}: reputation check failed — ${e instanceof Error ? e.message : String(e)}`.slice(0, 200));
      }
    }

    /* Workspaces with something queued. LIKE over the stored JSON is crude, but
       it is the only index there is into crm_data, and it reads only rows that
       hold requests at all. */
    const { results: queued } = await env.DB.prepare(
      `SELECT account_id AS accountId FROM crm_data WHERE k = ? AND v LIKE '%"status":"queued"%' LIMIT 20`,
    ).bind(REQ_KEY).all<{ accountId: string }>();
    let budget = MAX_SENDS;
    for (const q of queued ?? []) {
      if (budget <= 0) break;
      try {
        const r = await sendQueued(env, q.accountId, Math.min(budget, MAX_SENDS_PER_WORKSPACE));
        budget -= r.sent + r.failed;
        report.requestsSent += r.sent;
        report.requestsFailed += r.failed;
        if (r.note) report.notes.push(r.note.slice(0, 200));
      } catch (e) {
        report.notes.push(`${q.accountId}: review requests failed — ${e instanceof Error ? e.message : String(e)}`.slice(0, 200));
      }
    }
  } catch (e) {
    report.notes.push(`reputation pass failed — ${e instanceof Error ? e.message : String(e)}`.slice(0, 200));
  }
  return report;
}
