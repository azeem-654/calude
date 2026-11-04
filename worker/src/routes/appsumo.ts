/**
 * /api/appsumo.php — AppSumo lifetime-deal codes.
 *
 * A buyer pays AppSumo, AppSumo hands them a code we made, and they redeem it
 * here against their own account. Up to APPSUMO_MAX_CODES stack: one code is
 * tier 1, two tier 2, three tier 3 (lib/allowances.ts, kind `deal`). No money
 * moves through this app — AppSumo is paid and pays the operator — so none of
 * the three payment pots (docs/claude/money.md) is touched; the only effect is
 * the subscriber's `crm_plans` row, written with source 'appsumo'.
 *
 *   redeem   session, an agency login with a workspace of its own. Spends one
 *            code and sets the tier from every code the subscriber holds.
 *   status   session. How many codes this subscriber holds and the tier.
 *
 *   generate install owner. Makes `count` new codes; the plain codes are in
 *            this one answer only (the table keeps their hashes).
 *   import   install owner. Codes AppSumo generated, pasted one per line.
 *   revoke   install owner. A code AppSumo refunded: it stops counting and the
 *            subscriber's tier is worked out again (down to none).
 *   summary  install owner. Counts, and who redeemed how many.
 *
 * Why hashes: an unused code is a bearer secret worth a lifetime plan. Kept in
 * plain text, anyone with a database export could redeem the lot.
 *
 * Why redeem is rate-limited per person and per address: the codes are 60 bits
 * of randomness, so guessing is hopeless, but a script trying would still fill
 * the logs and the limiter costs nothing.
 */
import { body, fail, json } from '../lib/http';
import { nowIso, userFromToken, type Env, type SessionUser } from '../lib/db';
import { APPSUMO_MAX_CODES, appsumoPlanFor, effectivePlans, featureLines, limitsFor } from '../lib/allowances';
import { loadOverrides } from '../lib/allowanceStore';
import { rateLimit } from '../lib/rateLimit';

interface Req {
  token?: string;
  action?: string;
  code?: string;
  codes?: string;
  count?: number;
  batch?: string;
  note?: string;
}

const isOwner = (u: SessionUser) => u.accountId === null && u.role === 'agency';

/* Crockford-style: no 0/O, 1/I/L, so a code read aloud or copied by hand survives. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MAX_BATCH = 5_000;

/** What a person typed, as the code it means: upper case, no spaces or dashes. */
export const normalise = (raw: unknown) => String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const s = [...bytes].map(b => ALPHABET[b % ALPHABET.length]).join('');
  return `PC-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

async function hashOf(code: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`appsumo:${normalise(code)}`));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function held(env: Env, email: string): Promise<number> {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM crm_appsumo_codes WHERE owner_email = ? AND status = 'redeemed'")
    .bind(email).first<{ n: number }>();
  return Number(r?.n ?? 0);
}

/**
 * Set the subscriber's plan from the codes they hold.
 *
 * Never over a plan somebody pays for or the owner gave by hand: those are
 * worth at least as much and are another party's to end. When such a plan
 * ends, billing.ts calls this again so the deal they bought is not lost with
 * it. With no codes left, only an AppSumo row is taken away.
 */
export async function applyAppsumoTier(env: Env, email: string): Promise<string | null> {
  const planId = appsumoPlanFor(await held(env, email).catch(() => 0));
  if (!planId) {
    await env.DB.prepare("DELETE FROM crm_plans WHERE owner_email = ? AND source = 'appsumo'").bind(email).run();
    return null;
  }
  const sub = limitsFor('plan', planId, await loadOverrides(env)).sub_accounts;
  await env.DB.prepare(
    `INSERT INTO crm_plans (owner_email, plan_id, resell_limit, source, updated_at) VALUES (?, ?, ?, 'appsumo', ?)
     ON CONFLICT(owner_email) DO UPDATE SET plan_id = excluded.plan_id, resell_limit = excluded.resell_limit,
       source = 'appsumo', updated_at = excluded.updated_at
     WHERE crm_plans.source IN ('appsumo', 'default')`,
  ).bind(email, planId, sub, nowIso()).run();
  return planId;
}

async function standing(env: Env, email: string) {
  const codes = await held(env, email);
  const planId = appsumoPlanFor(codes);
  const row = await env.DB.prepare('SELECT plan_id AS planId, source FROM crm_plans WHERE owner_email = ?')
    .bind(email).first<{ planId: string; source: string }>();
  const plans = effectivePlans(await loadOverrides(env));
  const tier = planId ? plans.find(p => p.id === planId) : undefined;
  return {
    codes,
    max: APPSUMO_MAX_CODES,
    tier: tier ? { id: tier.id, name: tier.name, lines: featureLines(tier), support: tier.support } : null,
    /* A paid or hand-given plan sits above the deal while it lasts. */
    activePlan: row ? { id: row.planId, source: row.source } : null,
  };
}

export async function handleAppsumo(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const act = String(d.action ?? '');

  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in first — a code is added to your own account.', 401, { code: 'unauthorised' });

  /* ── The install owner's ── */
  if (['generate', 'import', 'revoke', 'summary'].includes(act)) {
    if (!isOwner(user)) return fail('Only the owner of this installation can do that.', 403, { code: 'not_owner' });

    if (act === 'generate' || act === 'import') {
      const batch = String(d.batch ?? '').trim().slice(0, 60) || `batch-${nowIso().slice(0, 10)}`;
      let codes: string[];
      if (act === 'generate') {
        const n = Math.floor(Number(d.count));
        if (!Number.isFinite(n) || n < 1 || n > MAX_BATCH) return fail(`How many codes: 1 to ${MAX_BATCH.toLocaleString('en-US')}.`, 200, { field: 'appsumo.count' });
        codes = Array.from({ length: n }, newCode);
      } else {
        codes = [...new Set(String(d.codes ?? '').split(/[\s,;]+/).map(c => c.trim()).filter(Boolean))];
        if (!codes.length) return fail('Paste the codes, one per line.', 200, { field: 'appsumo.codes' });
        if (codes.length > MAX_BATCH) return fail(`At most ${MAX_BATCH.toLocaleString('en-US')} codes at a time.`, 200, { field: 'appsumo.codes' });
        const short = codes.find(c => normalise(c).length < 8);
        if (short) return fail(`"${short.slice(0, 40)}" is too short to be a code — at least 8 letters or digits.`, 200, { field: 'appsumo.codes' });
      }
      const at = nowIso();
      const rows = await Promise.all(codes.map(async c => ({ c, h: await hashOf(c) })));
      /* INSERT OR IGNORE: importing a list twice must not reset a code somebody already spent. */
      for (let i = 0; i < rows.length; i += 50) {
        await env.DB.batch(rows.slice(i, i + 50).map(r => env.DB.prepare(
          'INSERT OR IGNORE INTO crm_appsumo_codes (code_hash, batch, status, created_at) VALUES (?, ?, \'unused\', ?)',
        ).bind(r.h, batch, at)));
      }
      return json({ success: true, batch, count: codes.length, codes: act === 'generate' ? codes : undefined });
    }

    if (act === 'revoke') {
      const code = String(d.code ?? '');
      if (normalise(code).length < 8) return fail('The code AppSumo refunded.', 200, { field: 'appsumo.revoke' });
      const h = await hashOf(code);
      const row = await env.DB.prepare('SELECT status, owner_email AS email FROM crm_appsumo_codes WHERE code_hash = ?')
        .bind(h).first<{ status: string; email: string | null }>();
      if (!row) return fail('That code is not one of ours.', 200, { field: 'appsumo.revoke' });
      if (row.status === 'revoked') return json({ success: true, already: true });
      await env.DB.prepare("UPDATE crm_appsumo_codes SET status = 'revoked', revoked_at = ?, revoked_note = ? WHERE code_hash = ?")
        .bind(nowIso(), String(d.note ?? '').slice(0, 200), h).run();
      const planId = row.email ? await applyAppsumoTier(env, row.email) : null;
      return json({ success: true, wasRedeemed: row.status === 'redeemed', email: row.email, planId });
    }

    /* summary */
    const counts = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM crm_appsumo_codes GROUP BY status').all<{ status: string; n: number }>();
    const who = await env.DB.prepare(
      `SELECT owner_email AS email, COUNT(*) AS codes, MAX(redeemed_at) AS lastAt FROM crm_appsumo_codes
        WHERE status = 'redeemed' GROUP BY owner_email ORDER BY lastAt DESC LIMIT 500`,
    ).all<{ email: string; codes: number; lastAt: string }>();
    const by = Object.fromEntries((counts.results ?? []).map(r => [r.status, Number(r.n)]));
    return json({
      success: true,
      counts: { unused: by.unused ?? 0, redeemed: by.redeemed ?? 0, revoked: by.revoked ?? 0 },
      redeemers: (who.results ?? []).map(r => ({ ...r, codes: Number(r.codes), planId: appsumoPlanFor(Number(r.codes)) })),
    });
  }

  /* ── A customer's ── */
  if (act === 'status') {
    if (isOwner(user)) return json({ success: true, owner: true });
    if (user.role !== 'agency') return json({ success: true, client: true });
    return json({ success: true, ...(await standing(env, user.email)) });
  }

  if (act === 'redeem') {
    if (isOwner(user)) return fail('The install owner already has everything. Sign in as a customer account to redeem a code.', 200, { field: 'appsumo.code' });
    /* A client login uses an agency's workspace; the plan is the agency's to buy. */
    if (user.role !== 'agency' || !user.accountId) return fail('Codes are redeemed by the account that owns the workspace, not a client login.', 200, { field: 'appsumo.code' });

    const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
    for (const [what, who, max] of [['appsumo-redeem', user.email, 10], ['appsumo-redeem-ip', ip, 30]] as const) {
      const v = await rateLimit(env, { what, who, max, windowSeconds: 3600 });
      if (!v.allowed) return fail('Too many tries in an hour — wait a little, then try again. If your code keeps being refused, write to support.', 429, { code: 'rate_limited', field: 'appsumo.code' });
    }

    const code = String(d.code ?? '');
    if (normalise(code).length < 8) return fail('Enter the code from your AppSumo purchase.', 200, { field: 'appsumo.code' });
    const have = await held(env, user.email);
    if (have >= APPSUMO_MAX_CODES) {
      return fail(`You already hold ${APPSUMO_MAX_CODES} codes — the most that stack. Your account is on the top tier.`, 200, { field: 'appsumo.code', code: 'max_codes' });
    }

    const h = await hashOf(code);
    /* The status check is in the UPDATE itself: two tabs redeeming the same
       code at once cannot both win. */
    const spent = await env.DB.prepare(
      "UPDATE crm_appsumo_codes SET status = 'redeemed', owner_email = ?, redeemed_at = ? WHERE code_hash = ? AND status = 'unused'",
    ).bind(user.email, nowIso(), h).run();
    if (!spent.meta.changes) {
      const row = await env.DB.prepare('SELECT status, owner_email AS email FROM crm_appsumo_codes WHERE code_hash = ?')
        .bind(h).first<{ status: string; email: string | null }>();
      const why = !row ? 'That code was not recognised. Check it against your AppSumo purchase — letters and digits only, dashes optional.'
        : row.status === 'revoked' ? 'That code was refunded on AppSumo, so it no longer works.'
          : row.email === user.email ? 'You have already redeemed that code on this account.'
            : 'That code has already been redeemed on another account.';
      return fail(why, 200, { field: 'appsumo.code', code: 'not_redeemable' });
    }
    await applyAppsumoTier(env, user.email);
    return json({ success: true, ...(await standing(env, user.email)) });
  }

  return fail(`Unknown action "${act}".`, 400);
}
