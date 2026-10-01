/**
 * The affiliate program — joining, a link, what it earned, and the owner's
 * payouts screen.
 *
 *   click      public: a visit through somebody's link (counted, rate-limited)
 *   status     an account's own program: link, referrals, commissions, totals
 *   join       join, accepting the terms (version recorded)
 *   payout     where the affiliate wants to be paid (free text — PayPal, bank)
 *   attribute  an account that signed up through a link names it, once
 *   admin / admin_mark   the install owner's view: every affiliate, every
 *              commission, and marking them paid or void
 *
 * Commissions are written only by the billing webhook (lib/affiliate.ts), from
 * money that arrived. Nothing here can create one, and nothing here moves
 * money: the owner pays affiliates and records it.
 */
import { body, fail, json } from '../lib/http';
import { nowIso, userFromToken, type Env, type SessionUser } from '../lib/db';
import { rateLimit } from '../lib/rateLimit';
import {
  AFFILIATE_RATE_PCT, AFFILIATE_TERMS_VERSION, ATTRIBUTION_DAYS, HOLD_DAYS, makeCode, maskEmail, validCode,
} from '../lib/affiliate';

interface Req { token?: string; action?: string; ref?: string; agree?: boolean; payoutNote?: string; id?: string; status?: string }

const isOwner = (u: SessionUser) => u.role === 'agency' && !u.accountId;
const clip = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

interface CommissionRow {
  id: string; code: string; referred_email: string; base_cents: number; rate_pct: number; amount_cents: number;
  currency: string; status: string; payable_at: string; paid_at: string | null; created_at: string;
}
/* 'pending' in the table becomes 'payable' once the hold has passed. */
const shownStatus = (c: CommissionRow) => c.status === 'pending' && Date.parse(c.payable_at) <= Date.now() ? 'payable' : c.status;

function totals(rows: CommissionRow[]) {
  const t: Record<string, { pending: number; payable: number; paid: number }> = {};
  for (const c of rows) {
    const s = shownStatus(c);
    if (s === 'void') continue;
    const k = c.currency || 'USD';
    t[k] ??= { pending: 0, payable: 0, paid: 0 };
    if (s === 'pending') t[k].pending += c.amount_cents;
    else if (s === 'payable') t[k].payable += c.amount_cents;
    else if (s === 'paid') t[k].paid += c.amount_cents;
  }
  return t;
}

async function program(env: Env, email: string) {
  const a = await env.DB.prepare('SELECT code, status, payout_note AS payoutNote, clicks, created_at AS createdAt FROM crm_affiliates WHERE email = ?')
    .bind(email).first<{ code: string; status: string; payoutNote: string; clicks: number; createdAt: string }>();
  const base = { rate: AFFILIATE_RATE_PCT, holdDays: HOLD_DAYS, termsVersion: AFFILIATE_TERMS_VERSION };
  if (!a) return { ...base, joined: false };
  const { results: refs } = await env.DB.prepare(
    `SELECT r.referred_email AS e, r.created_at AS at,
            EXISTS (SELECT 1 FROM crm_commissions c WHERE c.code = r.code AND c.referred_email = r.referred_email AND c.status != 'void') AS paying
     FROM crm_referrals r WHERE r.code = ? ORDER BY r.created_at DESC LIMIT 200`,
  ).bind(a.code).all<{ e: string; at: string; paying: number }>();
  const { results: com } = await env.DB.prepare(
    'SELECT * FROM crm_commissions WHERE code = ? ORDER BY created_at DESC LIMIT 200',
  ).bind(a.code).all<CommissionRow>();
  return {
    ...base,
    joined: true,
    code: a.code,
    status: a.status,
    payoutNote: a.payoutNote,
    stats: { clicks: a.clicks, signups: refs?.length ?? 0, paying: (refs ?? []).filter(r => r.paying).length },
    totals: totals(com ?? []),
    referrals: (refs ?? []).map(r => ({ customer: maskEmail(r.e), at: r.at, paying: !!r.paying })),
    commissions: (com ?? []).map(c => ({
      id: c.id, customer: maskEmail(c.referred_email), base: c.base_cents, amount: c.amount_cents, rate: c.rate_pct,
      currency: c.currency, status: shownStatus(c), createdAt: c.created_at, payableAt: c.payable_at, paidAt: c.paid_at,
    })),
  };
}

export async function handleAffiliate(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const action = String(d.action ?? '');

  /* ── A visit through a link: counted, and nothing else. No session. ── */
  if (action === 'click') {
    const ref = clip(d.ref, 48).toLowerCase();
    if (!validCode(ref)) return json({ success: true });
    const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
    const once = await rateLimit(env, { what: 'aff-click', who: `${ref}:${ip}`, max: 1, windowSeconds: 3600 });
    if (once.allowed) await env.DB.prepare("UPDATE crm_affiliates SET clicks = clicks + 1 WHERE code = ? AND status = 'active'").bind(ref).run().catch(() => {});
    return json({ success: true });
  }

  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });
  const me = user.email.toLowerCase();

  if (action === 'status') return json({ success: true, program: await program(env, me) });

  if (action === 'join') {
    if (user.role !== 'agency') return fail('The affiliate program is for account owners. Ask the owner of this workspace to join.', 403);
    if (!d.agree) return fail('Tick the box to accept the affiliate terms first.', 200, { field: 'affiliate.agree' });
    const existing = await env.DB.prepare('SELECT code FROM crm_affiliates WHERE email = ?').bind(me).first();
    if (!existing) {
      const name = (await env.DB.prepare('SELECT name FROM crm_users WHERE email = ?').bind(me).first<{ name: string }>())?.name ?? '';
      /* A code is public and permanent; a collision is retried, not overwritten. */
      for (let i = 0; i < 5; i++) {
        const code = makeCode(name, me);
        const r = await env.DB.prepare(
          'INSERT OR IGNORE INTO crm_affiliates (email, code, payout_note, terms_version, created_at) VALUES (?,?,?,?,?)',
        ).bind(me, code, clip(d.payoutNote, 300), AFFILIATE_TERMS_VERSION, nowIso()).run();
        if (r.meta.changes) break;
      }
    }
    return json({ success: true, program: await program(env, me) });
  }

  if (action === 'payout') {
    const r = await env.DB.prepare('UPDATE crm_affiliates SET payout_note = ? WHERE email = ?').bind(clip(d.payoutNote, 300), me).run();
    if (!r.meta.changes) return fail('Join the affiliate program first.');
    return json({ success: true, program: await program(env, me) });
  }

  /*
   * An account that arrived through a link says so, once.
   *
   * Asked by the browser after any kind of sign-up (password, code or
   * Google), because the referral code travels in the browser from the link to
   * the sign-up. The server decides whether it counts: a new account (within
   * ATTRIBUTION_DAYS of being created), an account owner, not already
   * referred, not the affiliate themselves, and a real, active code.
   */
  if (action === 'attribute') {
    const ref = clip(d.ref, 48).toLowerCase();
    const no = (why: string) => json({ success: false, attributed: false, reason: why });
    if (!validCode(ref)) return no('not a referral code');
    if (isOwner(user) || user.role !== 'agency') return no('this account is not one that subscribes');
    const u = await env.DB.prepare('SELECT created_at AS at FROM crm_users WHERE email = ?').bind(me).first<{ at: string }>();
    if (!u || Date.now() - Date.parse(u.at) > ATTRIBUTION_DAYS * 86_400_000) return no('the account is older than the referral window');
    const aff = await env.DB.prepare("SELECT email FROM crm_affiliates WHERE code = ? AND status = 'active'").bind(ref).first<{ email: string }>();
    if (!aff) return no('no such affiliate');
    if (aff.email === me) return no('an affiliate cannot refer themselves');
    const r = await env.DB.prepare('INSERT OR IGNORE INTO crm_referrals (referred_email, code, created_at) VALUES (?,?,?)')
      .bind(me, ref, nowIso()).run();
    return json({ success: true, attributed: !!r.meta.changes, reason: r.meta.changes ? '' : 'already referred' });
  }

  /* ── The install owner's view ── */
  if (!isOwner(user)) return fail('Only the install owner can manage the affiliate program.', 403);

  if (action === 'admin') {
    const { results: affs } = await env.DB.prepare(
      `SELECT a.email, a.code, a.status, a.clicks, a.payout_note AS payoutNote, a.created_at AS createdAt, u.name,
              (SELECT COUNT(*) FROM crm_referrals r WHERE r.code = a.code) AS signups
       FROM crm_affiliates a LEFT JOIN crm_users u ON u.email = a.email ORDER BY a.created_at DESC LIMIT 500`,
    ).all<{ email: string; code: string; status: string; clicks: number; payoutNote: string; createdAt: string; name: string | null; signups: number }>();
    const { results: com } = await env.DB.prepare('SELECT * FROM crm_commissions ORDER BY created_at DESC LIMIT 500').all<CommissionRow>();
    const byCode = new Map<string, CommissionRow[]>();
    for (const c of com ?? []) { const l = byCode.get(c.code) ?? []; l.push(c); byCode.set(c.code, l); }
    const emailOf = new Map((affs ?? []).map(a => [a.code, a.email]));
    return json({
      success: true,
      rate: AFFILIATE_RATE_PCT,
      affiliates: (affs ?? []).map(a => ({ ...a, name: a.name ?? '', totals: totals(byCode.get(a.code) ?? []) })),
      commissions: (com ?? []).map(c => ({
        id: c.id, affiliate: emailOf.get(c.code) ?? c.code, customer: c.referred_email, base: c.base_cents, amount: c.amount_cents,
        currency: c.currency, status: shownStatus(c), createdAt: c.created_at, payableAt: c.payable_at, paidAt: c.paid_at,
      })),
      totals: totals(com ?? []),
    });
  }

  if (action === 'admin_mark') {
    const id = clip(d.id, 200);
    const status = String(d.status ?? '');
    if (!['paid', 'void', 'pending'].includes(status)) return fail('Mark it paid, void, or back to pending.');
    const r = await env.DB.prepare('UPDATE crm_commissions SET status = ?, paid_at = ? WHERE id = ?')
      .bind(status, status === 'paid' ? nowIso() : null, id).run();
    if (!r.meta.changes) return fail('No such commission.');
    return json({ success: true });
  }

  return fail(`"${action}" is not something this endpoint does.`);
}
