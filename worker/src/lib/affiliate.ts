/**
 * The affiliate program's rules, in one place.
 *
 * 40% of every subscription payment a referred customer makes, for as long as
 * they keep paying — "lifetime" in the marketing, which the terms say plainly
 * means exactly that and no more. The rate is a constant here and recorded on
 * every commission row, so a change of rate later cannot silently rewrite what
 * somebody already earned.
 *
 * Only the billing webhook calls `recordCommission`: a commission is earned by
 * money that arrived, never by anything a browser says. One row per processor
 * event (the id is the event's), so a retried or replayed delivery cannot pay
 * twice. Nothing here moves money — the owner pays and marks rows paid.
 */
import { nowIso, type Env } from './db';

export const AFFILIATE_RATE_PCT = 40;
/** Held this long before it is payable, so a refund can be honoured first. */
export const HOLD_DAYS = 30;
/** How long after sign-up an account may still be attributed to a link. */
export const ATTRIBUTION_DAYS = 14;
export const AFFILIATE_TERMS_VERSION = '2026-10-01';

const CODE_OK = /^[a-z0-9][a-z0-9-]{2,40}$/;
export const validCode = (c: string) => CODE_OK.test(c);

/** A short, readable code: the person's first name and four random characters. */
export function makeCode(name: string, email: string): string {
  const base = (name.split(/\s+/)[0] || email.split('@')[0] || 'partner')
    .toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '').slice(0, 16) || 'partner';
  const tail = [...crypto.getRandomValues(new Uint8Array(4))].map(b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
  return `${base}-${tail}`;
}

/** Hide most of somebody else's address: what an affiliate sees of who they referred. */
export const maskEmail = (e: string) => {
  const [u, d] = e.split('@');
  if (!d) return '•••';
  return `${u.slice(0, 1)}${'•'.repeat(Math.max(2, Math.min(6, u.length - 1)))}@${d}`;
};

/**
 * One subscription payment from a workspace — credit its owner's affiliate, if
 * they were referred. Called by the billing webhook for subscription payments
 * only (first and every renewal), with the amount the processor reported.
 */
export async function recordCommission(env: Env, p: { accountId: string; amountCents: number; currency: string; eventKey: string }): Promise<boolean> {
  if (!p.accountId || !(p.amountCents > 0) || !p.eventKey) return false;
  try {
    const owner = await env.DB.prepare('SELECT owner_email AS e FROM crm_workspaces WHERE account_id = ?')
      .bind(p.accountId).first<{ e: string }>();
    if (!owner?.e) return false;
    const ref = await env.DB.prepare(
      `SELECT r.code AS code FROM crm_referrals r JOIN crm_affiliates a ON a.code = r.code
       WHERE r.referred_email = ? AND a.status = 'active' AND a.email != r.referred_email`,
    ).bind(owner.e.toLowerCase()).first<{ code: string }>();
    if (!ref?.code) return false;
    const amount = Math.round(p.amountCents * AFFILIATE_RATE_PCT / 100);
    const now = nowIso();
    const payable = new Date(Date.now() + HOLD_DAYS * 86_400_000).toISOString();
    const r = await env.DB.prepare(
      `INSERT OR IGNORE INTO crm_commissions
         (id, code, referred_email, account_id, base_cents, rate_pct, amount_cents, currency, status, payable_at, created_at)
       VALUES (?,?,?,?,?,?,?,?, 'pending', ?, ?)`,
    ).bind(p.eventKey.slice(0, 200), ref.code, owner.e.toLowerCase(), p.accountId, p.amountCents, AFFILIATE_RATE_PCT,
      amount, (p.currency || 'USD').toUpperCase(), payable, now).run();
    return !!r.meta.changes;
  } catch {
    /* A database before 0054, or a fault: the payment itself must still be
       recorded by the caller, so this never throws. */
    return false;
  }
}
