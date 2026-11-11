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
export async function recordCommission(env: Env, p: { accountId: string; amountCents: number; currency: string; eventKey: string; paymentRef?: string; invoiceRef?: string }): Promise<boolean> {
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
         (id, code, referred_email, account_id, base_cents, rate_pct, amount_cents, currency, status, payable_at, created_at, payment_ref, invoice_ref)
       VALUES (?,?,?,?,?,?,?,?, 'pending', ?, ?, ?, ?)`,
    ).bind(p.eventKey.slice(0, 200), ref.code, owner.e.toLowerCase(), p.accountId, p.amountCents, AFFILIATE_RATE_PCT,
      amount, (p.currency || 'USD').toUpperCase(), payable, now, (p.paymentRef ?? '').slice(0, 200), (p.invoiceRef ?? '').slice(0, 200)).run();
    return !!r.meta.changes;
  } catch {
    /* A database before 0054, or a fault: the payment itself must still be
       recorded by the caller, so this never throws. */
    return false;
  }
}

/**
 * A payment was refunded or disputed: its commission is not earned (M-5).
 *
 * Matched on the payment intent (or the invoice) stored when the commission
 * was recorded — never on the customer, which would void every renewal for
 * one refund. A commission still held is voided, or for a partial refund cut
 * to its share of what was kept. One already paid out is left paid and marked,
 * so the owner can deduct it from the next payout as the terms allow; this
 * code moves no money either way.
 */
export async function reverseCommission(env: Env, p: { paymentRef: string; invoiceRef?: string; why: 'refund' | 'dispute'; reversedCents: number; ofCents: number }): Promise<number> {
  const pay = (p.paymentRef || '').slice(0, 200), inv = (p.invoiceRef || '').slice(0, 200);
  if (!pay && !inv) return 0;
  const match = `((payment_ref != '' AND payment_ref = ?1) OR (invoice_ref != '' AND invoice_ref = ?2))`;
  const full = p.why === 'dispute' || !(p.ofCents > 0) || p.reversedCents >= p.ofCents;
  const reason = p.why === 'dispute' ? 'The payment was disputed.' : full ? 'The payment was refunded.' : 'Part of the payment was refunded.';
  try {
    const held = full
      ? await env.DB.prepare(`UPDATE crm_commissions SET status = 'void', void_reason = ?3 WHERE status = 'pending' AND ${match}`)
        .bind(pay, inv, reason).run()
      : await env.DB.prepare(
        `UPDATE crm_commissions SET amount_cents = MAX(0, CAST(ROUND((base_cents - ?3) * rate_pct / 100.0) AS INTEGER)), void_reason = ?4
         WHERE status = 'pending' AND ${match}`,
      ).bind(pay, inv, Math.max(0, Math.round(p.reversedCents)), reason).run();
    const paid = await env.DB.prepare(`UPDATE crm_commissions SET void_reason = ?3 WHERE status = 'paid' AND ${match}`)
      .bind(pay, inv, `${reason} It was already paid out — deduct it from the next payout.`).run();
    return (held.meta?.changes ?? 0) + (paid.meta?.changes ?? 0);
  } catch {
    return 0;   // a database before 0092; the owner still sees the refund at the processor
  }
}
