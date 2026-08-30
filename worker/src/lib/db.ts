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

/**
 * May this session touch this workspace?
 *
 * This used to be one line — `if (user.role === 'agency') return true` — and it
 * was correct for exactly as long as "agency" meant the single person who set
 * the install up. Public sign-up ends that: everyone who registers is an agency
 * running their own client sub-accounts, so under the old rule the first
 * stranger through the door could read every other customer's workspace by
 * naming its id.
 *
 * An agency now reaches a workspace it owns, and claims an unowned one the
 * first time it touches it. First-touch claiming is what lets an install that
 * predates `crm_workspaces` keep working — its rows were backfilled to the
 * original owner by the migration, and anything created after that is claimed
 * by whoever creates it — without a flag day where existing customers are
 * locked out of their own data.
 *
 * Reserved ids are already namespaced per agency by `storageWorkspace`, so by
 * the time one arrives here it carries its owner in the id and needs no lookup.
 */
export async function canAccess(
  db: D1Database,
  user: SessionUser | null,
  accountId: string,
): Promise<boolean> {
  if (!user) return false;
  if (user.role !== 'agency') return user.accountId === accountId;

  if (accountId.startsWith(RESERVED_PREFIX)) {
    /* The caller may name the reserved bucket and nothing else; storageWorkspace
       then binds that name to them, so what they get is their own. An id that
       arrives already suffixed is someone naming another agency's bucket
       directly, which is the one thing this has to refuse. */
    return accountId === RESERVED_AGENCY;
  }

  const row = await db.prepare('SELECT owner_email FROM crm_workspaces WHERE account_id = ?')
    .bind(accountId).first<{ owner_email: string }>();
  if (row) return row.owner_email === user.email;

  /* Unowned: claim it. `INSERT OR IGNORE` rather than a plain insert because
     two requests from the same agency can race here, and losing that race is
     not a reason to refuse the second one. */
  await db.prepare('INSERT OR IGNORE INTO crm_workspaces (account_id, owner_email, created_at) VALUES (?, ?, ?)')
    .bind(accountId, user.email, nowIso()).run();
  const now = await db.prepare('SELECT owner_email FROM crm_workspaces WHERE account_id = ?')
    .bind(accountId).first<{ owner_email: string }>();
  return now?.owner_email === user.email;
}

const RESERVED_PREFIX = '__';
export const RESERVED_AGENCY = '__agency__';

/**
 * The id a workspace's rows are actually stored under.
 *
 * `__agency__` is the bucket the app keeps things that belong to an agency
 * rather than to one of its clients — billing statuses, the suppression list.
 * One install, one agency, one bucket. With sign-up open it has to be one
 * bucket *each*, or every new tenant reads the last one's billing, so a
 * reserved id is suffixed with the agency that owns it. The client still sends
 * the plain name and never has to know.
 */
export function storageWorkspace(user: SessionUser, accountId: string): string {
  if (!accountId.startsWith(RESERVED_PREFIX)) return accountId;
  const owner = user.role === 'agency' ? user.email : (user.accountId ?? user.email);
  return `${accountId}:${owner}`;
}

/**
 * The agency bucket for a workspace, for callers with no session of their own.
 *
 * A Stripe webhook arrives from Stripe, not from a browser, so there is no user
 * to namespace against — but the workspace it names has an owner, and that is
 * the same answer.
 */
export async function agencyBucketFor(db: D1Database, accountId: string): Promise<string> {
  const row = await db.prepare('SELECT owner_email FROM crm_workspaces WHERE account_id = ?')
    .bind(accountId).first<{ owner_email: string }>();
  return row ? `${RESERVED_AGENCY}:${row.owner_email}` : RESERVED_AGENCY;
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
  /* The sign-up brake only ever asks about the last hour, so rows older than
     that are dead weight. Swept here rather than on its own schedule because
     this already runs on every sign-in and every registration. */
  await db.prepare('DELETE FROM crm_signup_attempts WHERE created_at <= ?')
    .bind(Math.floor(Date.now() / 1000) - 7200).run();
}
