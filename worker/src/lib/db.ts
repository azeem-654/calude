/**
 * D1, and the session rules that sit on top of it.
 *
 * Replaces _db.php, which had to maintain two storage backends — MySQL when
 * the customer had configured one, and a set of exit-guarded PHP files under
 * api/data/ when they had not, because shared hosting offers nowhere safe to
 * put a database. Neither problem exists here, so there is one store.
 */

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Optional. Set with `wrangler secret put` when a customer wants Stripe. */
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}

export interface SessionUser {
  email: string;
  name: string;
  role: 'agency' | 'client';
  accountId: string | null;
}

export const nowIso = () => new Date().toISOString();

/* ── The generic per-account key/value store ─────────────────────────────── */

export async function dataGet(db: D1Database, accountId: string, key: string): Promise<string | null> {
  const row = await db.prepare('SELECT v FROM crm_data WHERE account_id = ? AND k = ?')
    .bind(accountId, key).first<{ v: string }>();
  return row?.v ?? null;
}

export async function dataPut(db: D1Database, accountId: string, key: string, value: string): Promise<void> {
  await db.prepare(
    `INSERT INTO crm_data (account_id, k, v, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(account_id, k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at`,
  ).bind(accountId, key, value, nowIso()).run();
}

export async function dataList(db: D1Database, accountId: string): Promise<Record<string, string>> {
  const { results } = await db.prepare('SELECT k, v FROM crm_data WHERE account_id = ?')
    .bind(accountId).all<{ k: string; v: string }>();
  const out: Record<string, string> = {};
  for (const r of results ?? []) out[r.k] = r.v;
  return out;
}

export async function dataDelete(db: D1Database, accountId: string, key: string): Promise<void> {
  await db.prepare('DELETE FROM crm_data WHERE account_id = ? AND k = ?').bind(accountId, key).run();
}

/* ── Singletons that used to be their own guarded files ──────────────────── */

export async function metaGet(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare('SELECT v FROM crm_meta WHERE k = ?').bind(key).first<{ v: string }>();
  return row?.v ?? null;
}

export async function metaPut(db: D1Database, key: string, value: string): Promise<void> {
  await db.prepare(
    `INSERT INTO crm_meta (k, v, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at`,
  ).bind(key, value, nowIso()).run();
}

/**
 * A secret this install generates once and keeps — the unsubscribe signing key.
 *
 * Generated lazily rather than required as configuration: an opt-out link that
 * cannot be signed is an opt-out that does not work, and making the customer
 * set an environment variable before their unsubscribe links function is a
 * trap. `INSERT OR IGNORE` makes the race between two simultaneous first
 * requests harmless — whichever lands first wins and both read the same value.
 */
export async function installSecret(db: D1Database, key: string): Promise<string> {
  const existing = await metaGet(db, key);
  if (existing) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const secret = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  await db.prepare('INSERT OR IGNORE INTO crm_meta (k, v, updated_at) VALUES (?, ?, ?)')
    .bind(key, secret, nowIso()).run();
  return (await metaGet(db, key)) ?? secret;
}

/* ── Users and sessions ──────────────────────────────────────────────────── */

export async function hasAnyUser(db: D1Database): Promise<boolean> {
  const row = await db.prepare('SELECT 1 AS n FROM crm_users LIMIT 1').first<{ n: number }>();
  return !!row;
}

export async function userFromToken(db: D1Database, token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const row = await db.prepare(
    `SELECT u.email, u.name, u.role, u.account_id AS accountId
       FROM crm_sessions s JOIN crm_users u ON u.email = s.email
      WHERE s.token = ? AND s.expires_at > ?`,
  ).bind(token, Math.floor(Date.now() / 1000)).first<SessionUser>();
  return row ?? null;
}

/** Agency can touch any account; a client only their own. */
export function canAccess(user: SessionUser | null, accountId: string): boolean {
  if (!user) return false;
  if (user.role === 'agency') return true;
  return user.accountId === accountId;
}

/**
 * The gate for anything that opens an outbound socket to a host the caller
 * names — sending mail, testing a connection, fetching an inbox, probing
 * routes.
 *
 * Unauthenticated, those are a scanner for whatever this network can reach, a
 * way to test stolen mail credentials from Cloudflare's IPs, and an open relay
 * that sends mail with the customer's domain on it.
 *
 * A install with no accounts yet has nothing to protect and nobody to
 * authenticate against, so the setup wizard still works; the moment an owner
 * exists a valid session is required.
 */
export async function requireSessionForSocket(
  db: D1Database,
  token: string | undefined,
): Promise<{ user: SessionUser | null } | { denied: Response }> {
  if (!(await hasAnyUser(db))) return { user: null };
  const user = await userFromToken(db, token);
  if (!user) {
    return {
      denied: new Response(
        JSON.stringify({
          success: false,
          error: 'Sign in again — this action needs a current session.',
          message: 'Sign in again — this action needs a current session.',
          code: 'unauthorised',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    };
  }
  return { user };
}

/** Drop expired rows. Cheap, and keeps the table from becoming a login log. */
export async function sweepSessions(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM crm_sessions WHERE expires_at <= ?')
    .bind(Math.floor(Date.now() / 1000)).run();
}
