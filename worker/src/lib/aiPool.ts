/**
 * The AI keys, in the order they are tried, and the switch from one to the
 * next.
 *
 * ── Why more than one key ──
 *
 * Everything that writes — Autopilot, replies, the wizard, the microphone,
 * review drafts, the browser's own requests through /api/ai.php — ran on one
 * key. When Google rate-limited it, ran out its daily quota or refused it,
 * every customer saw an error at once, and kept seeing it until somebody
 * noticed. The owner can now keep backup keys (Settings → Platform services →
 * AI keys, routes/aikeys.ts); a call that fails for a reason that belongs to
 * the *key* is made again, straight away, on the next one. The customer sees
 * the answer, not the failure.
 *
 * ── What counts as the key's fault ──
 *
 * A limit (429), a refusal (401/403, an invalid or blocked key, the API not
 * enabled, billing), Google failing for it (5xx), no answer at all, or none of
 * its models existing. A request Google rejects for its own content (a plain
 * 400, a safety block) is not: every key would say the same, so it is
 * reported rather than repeated down the list.
 *
 * ── Resting a key that failed ──
 *
 * A key that just failed is moved to the back until its cooldown passes —
 * two minutes for a rate limit, an hour for a daily quota, half an hour for a
 * refusal — so it is not asked first, and made to fail first, on every call.
 * The cooldown is kept in this isolate's memory and in `crm_ai_key_health`,
 * so other isolates pick it up when they next read the pool (every 30 s).
 *
 * ── How callers reach it without changing ──
 *
 * Thirty-odd call sites take a key from `loadAiKey` and hand it to
 * `askGemini`. Rather than change each to carry a list, `remember` files the
 * ordered pool under the first key, and `withFailover` looks the pool up from
 * the key it is given. A key it has never seen is simply tried alone.
 */
import { decryptSecret } from './crypto';
import { installSecret, nowIso, type Env } from './db';

export interface PoolKey {
  key: string;
  fp: string;
  /** Where it came from — the owner sees this, never the key. */
  source: 'install' | 'engine' | 'backup' | 'env' | 'workspace';
  label: string;
  /** A backup's row id. */
  id?: string;
}

export async function fingerprint(key: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return [...new Uint8Array(d)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Every install-wide key, in order: the installation key, the owner's AI
 * Engine key(s) (one that last worked before one that last failed), the
 * backups by position, and the AI_API_KEY secret last. A key stored twice is
 * tried once.
 */
async function readInstallKeys(env: Env): Promise<PoolKey[]> {
  const secret = await installSecret(env.DB, 'mailbox_key');
  const out: PoolKey[] = [];
  const seen = new Set<string>();
  const add = async (key: string | undefined | null, source: PoolKey['source'], label: string, id?: string) => {
    const k = (key ?? '').trim();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push({ key: k, fp: await fingerprint(k), source, label, ...(id ? { id } : {}) });
  };
  const open = async (blob: string) => { try { return await decryptSecret(secret, blob); } catch { return ''; } };

  const explicit = await env.DB.prepare(
    "SELECT credentials FROM crm_install_providers WHERE kind = 'ai' AND credentials != ''",
  ).first<{ credentials: string }>().catch(() => null);
  if (explicit?.credentials) {
    try { await add((JSON.parse(await open(explicit.credentials)) as { apiKey?: string }).apiKey, 'install', 'Installation key'); } catch { /* unreadable */ }
  }

  const { results: owned } = await env.DB.prepare(
    `SELECT c.api_key AS apiKey
     FROM crm_ai_config c
     JOIN crm_workspaces w ON w.account_id = c.account_id
     JOIN crm_users u ON u.email = w.owner_email
     WHERE u.account_id IS NULL AND u.role = 'agency' AND c.api_key != ''
     ORDER BY (c.last_error = '') DESC, (c.verified_at IS NOT NULL) DESC`,
  ).all<{ apiKey: string }>().catch(() => ({ results: [] as { apiKey: string }[] }));
  for (const r of owned ?? []) await add(await open(r.apiKey), 'engine', 'Main key');

  const { results: backups } = await env.DB.prepare(
    'SELECT id, label, credentials FROM crm_ai_keys ORDER BY position, created_at',
  ).all<{ id: string; label: string; credentials: string }>().catch(() => ({ results: [] as { id: string; label: string; credentials: string }[] }));
  let n = 0;
  for (const r of backups ?? []) { n++; await add(await open(r.credentials), 'backup', r.label || `Backup key ${n}`, r.id); }

  await add(env.AI_API_KEY, 'env', 'AI_API_KEY (Cloudflare secret)');
  return out;
}

/* Per isolate. Read again every 30 s, and at once after the owner edits. */
const CACHE_MS = 30_000;
let cached: { at: number; keys: PoolKey[] } | null = null;
const cooling = new Map<string, number>();   // fp → resting until (ms)
const lastOkWrite = new Map<string, number>(); // fp → when "worked" was last written

export function forgetPool(): void { cached = null; }

/** Not resting first, in their own order; resting ones after, soonest back first. */
function order(keys: PoolKey[]): PoolKey[] {
  const now = Date.now();
  const live = keys.filter(k => !((cooling.get(k.fp) ?? 0) > now));
  const resting = keys.filter(k => (cooling.get(k.fp) ?? 0) > now)
    .sort((a, b) => (cooling.get(a.fp) ?? 0) - (cooling.get(b.fp) ?? 0));
  return [...live, ...resting];
}

export async function installPool(env: Env): Promise<PoolKey[]> {
  if (!cached || Date.now() - cached.at > CACHE_MS) {
    const keys = await readInstallKeys(env);
    const { results } = await env.DB.prepare(
      'SELECT fp, cooldown_until AS until FROM crm_ai_key_health WHERE cooldown_until > ?',
    ).bind(nowIso()).all<{ fp: string; until: string }>().catch(() => ({ results: [] as { fp: string; until: string }[] }));
    for (const r of results ?? []) {
      const t = Date.parse(r.until);
      if (t > (cooling.get(r.fp) ?? 0)) cooling.set(r.fp, t);
    }
    cached = { at: Date.now(), keys };
  }
  return order(cached.keys);
}

/* The key a caller holds → the keys to fall back to. Bounded: the oldest
   entries go first, and a stale entry only means a call is tried alone. */
const pools = new Map<string, { env: Env; keys: PoolKey[] }>();

/** Files an ordered pool under its first key and returns that key (or null for none). */
export function remember(env: Env, keys: PoolKey[]): string | null {
  if (!keys.length) return null;
  pools.delete(keys[0].key);
  pools.set(keys[0].key, { env, keys });
  if (pools.size > 400) pools.delete(pools.keys().next().value as string);
  return keys[0].key;
}

/** Whether a failure is the key's, and how long to rest it. */
export function classify(status: number, raw: string): { keyFault: boolean; restMs: number } {
  if (status === 0) return { keyFault: true, restMs: 20_000 };          // no answer at all
  if (status === -1) return { keyFault: true, restMs: 30 * 60_000 };    // none of its models exist
  if (status === 429) return { keyFault: true, restMs: /per ?day|PerDay|daily/i.test(raw) ? 60 * 60_000 : 2 * 60_000 };
  if (status === 401 || status === 403) return { keyFault: true, restMs: 30 * 60_000 };
  if (status >= 500) return { keyFault: true, restMs: 30_000 };
  if (status === 400 && /API[ _]KEY|SERVICE[ _]DISABLED|BILLING|billing|PERMISSION[ _]DENIED|expired|blocked|FAILED[ _]PRECONDITION|User location is not supported/i.test(raw)) {
    return { keyFault: true, restMs: 30 * 60_000 };
  }
  return { keyFault: false, restMs: 0 };
}

export type Attempt<T> =
  | { ok: true; value: T }
  | { ok: false; value: T; status: number; error: string };

/**
 * `run` once per key until one works or a failure is not the key's. Returns
 * the working answer, or the last failure's.
 */
export async function withFailover<T>(apiKey: string, run: (key: string) => Promise<Attempt<T>>): Promise<T> {
  const entry = pools.get(apiKey);
  const keys = entry ? [apiKey, ...entry.keys.map(k => k.key).filter(k => k !== apiKey)] : [apiKey];
  let last: Attempt<T> | null = null;
  for (const k of keys) {
    const r = await run(k);
    const meta = entry?.keys.find(p => p.key === k);
    if (r.ok) {
      if (entry && meta) await markOk(entry.env, meta);
      return r.value;
    }
    last = r;
    const c = classify(r.status, r.error);
    if (!c.keyFault) return r.value;
    if (entry && meta) await markFailed(entry.env, meta, c.restMs, r.status, r.error);
  }
  return (last as Attempt<T>).value;
}

async function markFailed(env: Env, k: PoolKey, restMs: number, status: number, raw: string): Promise<void> {
  const until = Date.now() + restMs;
  cooling.set(k.fp, until);
  /* A customer's own key is theirs to watch; only the install's keys are
     written down for the owner. */
  if (k.source === 'workspace') return;
  let msg = raw;
  try { msg = (JSON.parse(raw) as { error?: { message?: string } }).error?.message || raw; } catch { /* not JSON */ }
  const error = `${status > 0 ? `HTTP ${status}: ` : ''}${msg}`.slice(0, 300);
  await env.DB.prepare(
    `INSERT INTO crm_ai_key_health (fp, last_failed_at, last_error, cooldown_until, fail_count) VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(fp) DO UPDATE SET last_failed_at = excluded.last_failed_at, last_error = excluded.last_error,
       cooldown_until = excluded.cooldown_until, fail_count = crm_ai_key_health.fail_count + 1`,
  ).bind(k.fp, nowIso(), error, new Date(until).toISOString()).run().catch(() => undefined);
}

async function markOk(env: Env, k: PoolKey): Promise<void> {
  const wasResting = cooling.delete(k.fp);
  if (k.source === 'workspace') return;
  /* Written when it recovers, and otherwise at most every ten minutes — the
     owner's "last worked" does not need a database write per sentence. */
  if (!wasResting && Date.now() - (lastOkWrite.get(k.fp) ?? 0) < 10 * 60_000) return;
  lastOkWrite.set(k.fp, Date.now());
  await env.DB.prepare(
    `INSERT INTO crm_ai_key_health (fp, last_ok_at) VALUES (?, ?)
     ON CONFLICT(fp) DO UPDATE SET last_ok_at = excluded.last_ok_at, cooldown_until = NULL,
       last_error = CASE WHEN crm_ai_key_health.cooldown_until IS NOT NULL THEN '' ELSE crm_ai_key_health.last_error END`,
  ).bind(k.fp, nowIso()).run().catch(() => undefined);
}

export interface PoolEntry {
  label: string;
  source: PoolKey['source'];
  id: string | null;
  lastOkAt: string | null;
  lastFailedAt: string | null;
  lastError: string;
  restingUntil: string | null;
  failCount: number;
}

/**
 * The pool as the owner sees it, in the order it is tried when nothing is
 * resting — what each key is, and how it has been doing. Never the key, nor
 * any part of it.
 */
export async function describePool(env: Env): Promise<PoolEntry[]> {
  const keys = await readInstallKeys(env);
  const { results } = await env.DB.prepare(
    'SELECT fp, last_ok_at AS lastOkAt, last_failed_at AS lastFailedAt, last_error AS lastError, cooldown_until AS until, fail_count AS failCount FROM crm_ai_key_health',
  ).all<{ fp: string; lastOkAt: string | null; lastFailedAt: string | null; lastError: string; until: string | null; failCount: number }>()
    .catch(() => ({ results: [] as { fp: string; lastOkAt: string | null; lastFailedAt: string | null; lastError: string; until: string | null; failCount: number }[] }));
  const health = new Map((results ?? []).map(r => [r.fp, r]));
  const now = Date.now();
  return keys.map(k => {
    const h = health.get(k.fp);
    const until = Math.max(h?.until ? Date.parse(h.until) : 0, cooling.get(k.fp) ?? 0);
    return {
      label: k.label, source: k.source, id: k.id ?? null,
      lastOkAt: h?.lastOkAt ?? null, lastFailedAt: h?.lastFailedAt ?? null, lastError: h?.lastError ?? '',
      restingUntil: until > now ? new Date(until).toISOString() : null,
      failCount: h?.failCount ?? 0,
    };
  });
}

/** The key behind a pool entry, for the owner's "Test" — by backup id, or by position. */
export async function poolKeyAt(env: Env, index: number): Promise<PoolKey | null> {
  return (await readInstallKeys(env))[index] ?? null;
}

/** After a test from the owner's screen: the same record a real call would leave. */
export async function recordTest(env: Env, k: PoolKey, ok: boolean, status: number, raw: string): Promise<void> {
  if (ok) {
    cooling.delete(k.fp);
    lastOkWrite.set(k.fp, Date.now());
    await env.DB.prepare(
      `INSERT INTO crm_ai_key_health (fp, last_ok_at) VALUES (?, ?)
       ON CONFLICT(fp) DO UPDATE SET last_ok_at = excluded.last_ok_at, cooldown_until = NULL, last_error = ''`,
    ).bind(k.fp, nowIso()).run().catch(() => undefined);
    return;
  }
  await markFailed(env, k, classify(status, raw).restMs || 30 * 60_000, status, raw);
}
