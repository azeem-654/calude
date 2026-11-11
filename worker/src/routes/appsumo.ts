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
 *   summary  install owner. Counts, and who redeemed how many — codes and
 *            licenses — and whether AppSumo Licensing is connected.
 *   reviewers       install owner. Makes 1–5 logins for AppSumo's reviewers
 *                   (`appsumo-review-N@<owner's domain>`), each its own
 *                   workspace on the top AppSumo tier given by hand, so a
 *                   review that outlasts a 7-day trial never meets a plan
 *                   screen. Passwords are answered once, stored only hashed.
 *   reviewer_reset  install owner. A new password for one of them, and its
 *                   sessions signed out.
 *   claim    session, as redeem. Ties an AppSumo license (Licensing v2,
 *            routes/appsumoLicense.ts) to this account, from the one-use link
 *            the OAuth return handed the buyer.
 *
 * Why hashes: an unused code is a bearer secret worth a lifetime plan. Kept in
 * plain text, anyone with a database export could redeem the lot.
 *
 * Why redeem is rate-limited per person and per address: the codes are 60 bits
 * of randomness, so guessing is hopeless, but a script trying would still fill
 * the logs and the limiter costs nothing.
 */
import { body, fail, json } from '../lib/http';
import { metaGet, metaPut, nowIso, userFromToken, type Env, type SessionUser } from '../lib/db';
import { hashPassword } from '../lib/crypto';
import { APPSUMO_MAX_CODES, appsumoPlanFor, effectivePlans, featureLines, limitsFor } from '../lib/allowances';
import { loadOverrides } from '../lib/allowanceStore';
import { rateLimit } from '../lib/rateLimit';
import { licensingReady } from './appsumoLicense';
import { recordAuthEvent } from '../lib/audit';

interface Req {
  token?: string;
  action?: string;
  code?: string;
  codes?: string;
  count?: number;
  batch?: string;
  note?: string;
  license?: string;
  email?: string;
}

const isOwner = (u: SessionUser) => u.accountId === null && u.role === 'agency';

/* Crockford-style: no 0/O, 1/I/L, so a code read aloud or copied by hand survives. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/* AppSumo's Redemption step takes a file of 1,000 to 10,000 codes. */
const MAX_BATCH = 10_000;

/** What a person typed, as the code it means: upper case, no spaces or dashes. */
export const normalise = (raw: unknown) => String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const s = [...bytes].map(b => ALPHABET[b % ALPHABET.length]).join('');
  return `PC-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const hashOf = (code: string) => sha256Hex(`appsumo:${normalise(code)}`);

/* ── Logins for AppSumo's reviewers ── */
const REVIEWERS_KEY = 'appsumo_reviewers';
const MAX_REVIEWERS = 5;
interface Reviewer { email: string; createdAt: string; resetAt?: string }

async function reviewersOf(env: Env): Promise<Reviewer[]> {
  try { return JSON.parse((await metaGet(env.DB, REVIEWERS_KEY)) ?? '[]') as Reviewer[]; } catch { return []; }
}

/** 16 characters from the code alphabet, in groups, with a digit guaranteed — readable aloud, typed once. */
function reviewerPassword(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  const s = [...b].map(x => ALPHABET[x % ALPHABET.length]).join('');
  const lower = s.slice(0, 8).toLowerCase() + s.slice(8);
  return `${lower.slice(0, 4)}-${lower.slice(4, 8)}-${lower.slice(8, 12)}-${lower.slice(12, 15)}${(b[15] % 8) + 2}`;
}

/**
 * Made by the owner rather than signed up: sign-up proves the address with a
 * code sent to it, and nobody reads these mailboxes — the owner vouches for
 * them instead. The plan is the deal's top tier, written as given by hand
 * ('manual'), which is what it is: Plan & billing says so, and a code the
 * reviewer redeems to test redemption still counts without replacing it.
 */
async function makeReviewers(env: Env, owner: SessionUser, n: number) {
  const domain = owner.email.split('@')[1] ?? 'example.com';
  const existing = await reviewersOf(env);
  const planId = appsumoPlanFor(APPSUMO_MAX_CODES)!;
  const sub = limitsFor('plan', planId, await loadOverrides(env)).sub_accounts;
  const made: { email: string; password: string }[] = [];
  for (let i = 1; made.length < n && i < 100; i++) {
    const email = `appsumo-review-${i}@${domain}`.toLowerCase();
    if (await env.DB.prepare('SELECT 1 AS x FROM crm_users WHERE email = ?').bind(email).first()) continue;
    const password = reviewerPassword();
    const accountId = crypto.randomUUID();
    const at = nowIso();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO crm_users (email, name, role, account_id, hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(email, `AppSumo Reviewer ${i}`, 'agency', accountId, await hashPassword(password), at),
      env.DB.prepare('INSERT OR IGNORE INTO crm_workspaces (account_id, owner_email, created_at) VALUES (?, ?, ?)').bind(accountId, email, at),
      env.DB.prepare(
        `INSERT INTO crm_plans (owner_email, plan_id, resell_limit, source, updated_at) VALUES (?, ?, ?, 'manual', ?)
         ON CONFLICT(owner_email) DO UPDATE SET plan_id = excluded.plan_id, resell_limit = excluded.resell_limit, source = 'manual', updated_at = excluded.updated_at`,
      ).bind(email, planId, sub, at),
    ]);
    made.push({ email, password });
    existing.push({ email, createdAt: at });
  }
  await metaPut(env.DB, REVIEWERS_KEY, JSON.stringify(existing));
  return made;
}

async function held(env: Env, email: string): Promise<number> {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM crm_appsumo_codes WHERE owner_email = ? AND status = 'redeemed'")
    .bind(email).first<{ n: number }>();
  return Number(r?.n ?? 0);
}

/** The tier of the AppSumo license this subscriber holds through Licensing v2, 0 for none. Add-ons never count. */
async function licenseTier(env: Env, email: string): Promise<number> {
  const r = await env.DB.prepare(
    "SELECT MAX(tier) AS t FROM crm_appsumo_licenses WHERE owner_email = ? AND status = 'active' AND parent_key IS NULL",
  ).bind(email).first<{ t: number | null }>();
  return Number(r?.t ?? 0);
}

/**
 * What the tier is worked out from: the codes held, or the license's tier,
 * whichever is higher. Not their sum — a listing sells one or the other, and a
 * buyer who somehow has both paid for the larger, not for both stacked.
 */
const appsumoUnits = async (env: Env, email: string) =>
  Math.max(await held(env, email).catch(() => 0), await licenseTier(env, email).catch(() => 0));

/**
 * Set the subscriber's plan from the codes they hold.
 *
 * Never over a plan somebody pays for or the owner gave by hand: those are
 * worth at least as much and are another party's to end. When such a plan
 * ends, billing.ts calls this again so the deal they bought is not lost with
 * it. With no codes left, only an AppSumo row is taken away.
 */
export async function applyAppsumoTier(env: Env, email: string): Promise<string | null> {
  const planId = appsumoPlanFor(await appsumoUnits(env, email));
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

/**
 * A buyer signs up a minute before redeeming, so the sign-up's "your 7-day
 * trial has started" card is waiting for them — and is no longer true. On the
 * first code it is marked read and a welcome that says what they have takes
 * its place.
 */
async function swapWelcome(env: Env, email: string): Promise<void> {
  /* Loaded here, as allowances.ts does: customers.ts brings the mail sender,
     which exists only on Workers. */
  const { loadSettings, safeLink } = await import('./customers');
  const s = await loadSettings(env);
  if (s.welcomeTitle.trim()) {
    await env.DB.prepare('UPDATE crm_notices SET read_at = ? WHERE to_email = ? AND title = ? AND read_at IS NULL')
      .bind(nowIso(), email, s.welcomeTitle.slice(0, 200)).run();
  }
  await env.DB.prepare(
    'INSERT INTO crm_notices (id, to_email, title, body, link, link_label, emailed, created_at) VALUES (?,?,?,?,?,?,?,?)',
  ).bind(
    crypto.randomUUID(), email, 'Welcome — your AppSumo deal is active',
    'Your lifetime plan is on, with nothing to pay here. Start with one business workspace on AI Autopilot: say what you want to happen and it shows you the plan before anything runs. Press the help button in the corner any time — chat, a call, or share your screen.',
    /* The card's button opens its link in a new tab: the owner's kickoff call,
       as on the trial's welcome, when one is set. */
    safeLink(s.kickoffUrl), s.kickoffUrl ? 'Book my kickoff call' : '', 'skipped', nowIso(),
  ).run();
}

async function standing(env: Env, email: string) {
  const codes = await held(env, email);
  const lic = await licenseTier(env, email).catch(() => 0);
  const planId = appsumoPlanFor(Math.max(codes, lic));
  const row = await env.DB.prepare('SELECT plan_id AS planId, source FROM crm_plans WHERE owner_email = ?')
    .bind(email).first<{ planId: string; source: string }>();
  const plans = effectivePlans(await loadOverrides(env));
  const tier = planId ? plans.find(p => p.id === planId) : undefined;
  return {
    codes,
    max: APPSUMO_MAX_CODES,
    /* Activated through AppSumo's own button: the tier is AppSumo's, so codes do not stack on it. */
    license: lic ? { tier: lic } : null,
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
  if (['generate', 'import', 'revoke', 'summary', 'reviewers', 'reviewer_reset'].includes(act)) {
    if (!isOwner(user)) return fail('Only the owner of this installation can do that.', 403, { code: 'not_owner' });

    if (act === 'reviewers') {
      const have = (await reviewersOf(env)).length;
      const n = Math.floor(Number(d.count ?? 2));
      if (!Number.isFinite(n) || n < 1 || have + n > MAX_REVIEWERS) {
        return fail(`At most ${MAX_REVIEWERS} reviewer logins in all${have ? ` — ${have} exist already` : ''}. Give one a new password instead.`, 200, { field: 'appsumo.reviewers' });
      }
      const logins = await makeReviewers(env, user, n);
      await recordAuthEvent(env, { email: user.email, kind: 'operator_reviewers_created', detail: `Made ${logins.length} AppSumo reviewer login(s)` });
      return json({ success: true, logins, reviewers: await reviewersOf(env) });
    }

    if (act === 'reviewer_reset') {
      const email = String(d.email ?? '').trim().toLowerCase();
      const list = await reviewersOf(env);
      const r = list.find(x => x.email === email);
      /* Only a login this tool made: never a way to reset a customer's password. */
      if (!r) return fail('That is not one of the reviewer logins made here.', 200, { field: 'appsumo.reviewers' });
      const password = reviewerPassword();
      await env.DB.batch([
        env.DB.prepare('UPDATE crm_users SET hash = ? WHERE email = ? AND account_id IS NOT NULL').bind(await hashPassword(password), email),
        env.DB.prepare('DELETE FROM crm_sessions WHERE email = ?').bind(email),
      ]);
      r.resetAt = nowIso();
      await metaPut(env.DB, REVIEWERS_KEY, JSON.stringify(list));
      return json({ success: true, logins: [{ email, password }], reviewers: list });
    }

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
      await recordAuthEvent(env, { email: user.email, kind: 'operator_codes_created', detail: `${act === 'generate' ? 'Generated' : 'Imported'} ${codes.length} AppSumo code(s) in batch ${batch}` });
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
      await recordAuthEvent(env, { email: user.email, kind: 'operator_code_revoked', detail: `Revoked an AppSumo code${row.email ? ` held by ${row.email}; their plan is now ${planId ?? 'none'}` : ''}` });
      return json({ success: true, wasRedeemed: row.status === 'redeemed', email: row.email, planId });
    }

    /* summary */
    const counts = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM crm_appsumo_codes GROUP BY status').all<{ status: string; n: number }>();
    const who = await env.DB.prepare(
      `SELECT owner_email AS email, COUNT(*) AS codes, MAX(redeemed_at) AS lastAt FROM crm_appsumo_codes
        WHERE status = 'redeemed' GROUP BY owner_email ORDER BY lastAt DESC LIMIT 500`,
    ).all<{ email: string; codes: number; lastAt: string }>();
    const by = Object.fromEntries((counts.results ?? []).map(r => [r.status, Number(r.n)]));
    const lc = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM crm_appsumo_licenses WHERE parent_key IS NULL GROUP BY status').all<{ status: string; n: number }>();
    const holders = await env.DB.prepare(
      `SELECT owner_email AS email, tier, updated_at AS lastAt FROM crm_appsumo_licenses
        WHERE status = 'active' AND parent_key IS NULL AND owner_email IS NOT NULL ORDER BY updated_at DESC LIMIT 500`,
    ).all<{ email: string; tier: number; lastAt: string }>();
    const last = await metaGet(env.DB, 'appsumo_last_webhook').catch(() => null);
    const rejected = await metaGet(env.DB, 'appsumo_last_rejected').catch(() => null);
    return json({
      success: true,
      counts: { unused: by.unused ?? 0, redeemed: by.redeemed ?? 0, revoked: by.revoked ?? 0 },
      redeemers: (who.results ?? []).map(r => ({ ...r, codes: Number(r.codes), planId: appsumoPlanFor(Number(r.codes)) })),
      licensing: {
        ...licensingReady(env),
        counts: Object.fromEntries((lc.results ?? []).map(r => [r.status, Number(r.n)])),
        holders: (holders.results ?? []).map(r => ({ ...r, tier: Number(r.tier) })),
        lastWebhook: last ? JSON.parse(last) as { event: string; at: string } : null,
        lastRejected: rejected ? JSON.parse(rejected) as { at: string; signed: boolean } : null,
      },
      reviewers: await reviewersOf(env),
    });
  }

  /* ── A customer's ── */
  if (act === 'status') {
    if (isOwner(user)) return json({ success: true, owner: true });
    if (user.role !== 'agency') return json({ success: true, client: true });
    return json({ success: true, ...(await standing(env, user.email)) });
  }

  if (act === 'claim') {
    if (isOwner(user)) return fail('The install owner already has everything. Sign in as a customer account to activate an AppSumo purchase.', 200, { code: 'owner' });
    if (user.role !== 'agency' || !user.accountId) return fail('An AppSumo purchase is activated on the account that owns the workspace, not a client login.', 200, { code: 'client' });
    const v = await rateLimit(env, { what: 'appsumo-claim', who: user.email, max: 20, windowSeconds: 3600 });
    if (!v.allowed) return fail('Too many tries in an hour — wait a little, then try again.', 429, { code: 'rate_limited' });
    const claim = String(d.license ?? '');
    const row = /^[0-9a-f]{48}$/.test(claim) ? await env.DB.prepare(
      'SELECT license_key AS k, status, owner_email AS email, claim_expires AS until FROM crm_appsumo_licenses WHERE claim_hash = ?',
    ).bind(await sha256Hex(`claim:${claim}`)).first<{ k: string; status: string; email: string | null; until: string | null }>() : null;
    const again = 'Activate it again from your AppSumo account (Products → Protected Central → Activate) and you will be brought straight back.';
    if (!row || !row.until || row.until < nowIso()) return fail(`That activation link has expired or was already used. ${again}`, 200, { code: 'claim_expired' });
    if (row.status !== 'active') return fail('That AppSumo purchase is no longer active — it was refunded or replaced on AppSumo.', 200, { code: 'claim_inactive' });
    if (row.email && row.email !== user.email) return fail('That AppSumo purchase is already active on another account. Sign in to that account instead.', 200, { code: 'claim_taken' });
    const first = (await appsumoUnits(env, user.email)) === 0;
    /* The owner check is in the UPDATE: two accounts claiming in two tabs cannot both win. */
    const took = await env.DB.prepare(
      "UPDATE crm_appsumo_licenses SET owner_email = ?, claim_hash = NULL, updated_at = ? WHERE license_key = ? AND (owner_email IS NULL OR owner_email = ?) AND status = 'active'",
    ).bind(user.email, nowIso(), row.k, user.email).run();
    if (!took.meta.changes) return fail('That AppSumo purchase is already active on another account.', 200, { code: 'claim_taken' });
    await applyAppsumoTier(env, user.email);
    if (first) await swapWelcome(env, user.email).catch(() => null);
    return json({ success: true, claimed: true, ...(await standing(env, user.email)) });
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
    if (await licenseTier(env, user.email).catch(() => 0)) {
      return fail('This account was activated from AppSumo directly, so its tier follows your AppSumo purchase — upgrade it on AppSumo rather than with a code.', 200, { field: 'appsumo.code', code: 'licensed' });
    }
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
    if (have === 0) await swapWelcome(env, user.email).catch(() => null);
    return json({ success: true, ...(await standing(env, user.email)) });
  }

  return fail(`Unknown action "${act}".`, 400);
}
