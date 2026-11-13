/**
 * What the AI is used for, how much of the free tiers is left, and the caps
 * that stop one workspace using it all.
 *
 * ── Counted here, because the providers do not tell an API key ──
 *
 * Google shows a project's free-tier usage in AI Studio but offers no API that
 * a key can ask "how much of today is left". So every call the Worker makes —
 * server routes and the browser's through /api/ai.php — is counted here as it
 * happens: one row per day × provider × key × model × module × workspace,
 * with Google's/OpenRouter's own token counts from the response. The free
 * limits beside them are the providers' published figures (`FREE_DEFAULTS`),
 * which the owner can correct on the dashboard if their project shows other
 * numbers. Calls made from a customer's own key are counted for their caps
 * but kept out of the install's free-tier totals (key 'own').
 *
 * ── Staying inside the free tiers ──
 *
 * `pastFreeLimit` moves a model that has reached today's free requests to the
 * back of its chain (lib/ai.ts), so the next model — whose allowance is
 * separate on Google's free tier — is asked first instead of collecting 429s.
 *
 * ── Caps per workspace ──
 *
 * `capRefusal` replaces the fixed 120 an hour / 800 a day that aiBudget and
 * /api/ai.php each had: the owner sets the defaults and per-workspace
 * overrides (or blocks one) on the dashboard, plus an optional daily token
 * cap read from these rows.
 */
import { metaGet, metaPut, nowIso, type Env } from './db';
import { rateLimit } from './rateLimit';
import { poolKeyOf, fingerprint } from './aiPool';
import { tierOf, type GeminiTier } from './aiTasks';

/* ── Recording ───────────────────────────────────────────────────────────── */

let ENV: Env | null = null;
/** Set from the first env this isolate sees (lib/ai.ts adoptAiBase), as the key-only callers have none. */
export function adoptUsageEnv(env: Env): void { ENV = env; }
/** That env, for the other key-only recorder (lib/aiToolHealth.ts). */
export const usageEnv = (): Env | null => ENV;

const fpCache = new Map<string, string>();
async function keyFp(key: string): Promise<string> {
  const pk = poolKeyOf(key);
  if (pk) return pk.source === 'workspace' ? 'own' : pk.fp;
  const hit = fpCache.get(key);
  if (hit) return hit;
  const fp = await fingerprint(key);
  if (fpCache.size > 200) fpCache.clear();
  fpCache.set(key, fp);
  return fp;
}

export const today = () => new Date().toISOString().slice(0, 10);

export interface UseRecord {
  provider: 'gemini' | 'openrouter';
  key: string; model: string; module?: string; accountId?: string;
  ok: boolean; status?: number; tokensIn?: number; tokensOut?: number;
}

/** Counted for today, and in this isolate's free-limit view at once. Never throws. */
export async function recordAiUse(r: UseRecord): Promise<void> {
  const env = ENV;
  if (!env) return;
  try {
    const fp = await keyFp(r.key);
    const tin = Math.max(0, Math.round(r.tokensIn ?? 0)), tout = Math.max(0, Math.round(r.tokensOut ?? 0));
    const view = todayCounts.get(fp);
    if (view && view.day === today()) {
      const c = view.counts[r.model] ?? (view.counts[r.model] = { n: 0, ok: 0, l: 0 });
      c.n++; if (r.ok) c.ok++; if (r.status === 429) c.l++;
    }
    await env.DB.prepare(
      `INSERT INTO crm_ai_usage (day, provider, key_fp, model, module, account_id, requests, ok, limited, tokens_in, tokens_out, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
       ON CONFLICT(day, provider, key_fp, model, module, account_id) DO UPDATE SET
         requests = requests + 1, ok = ok + excluded.ok, limited = limited + excluded.limited,
         tokens_in = tokens_in + excluded.tokens_in, tokens_out = tokens_out + excluded.tokens_out, updated_at = excluded.updated_at`,
    ).bind(today(), r.provider, fp, r.model.slice(0, 120), (r.module || 'general').slice(0, 40), (r.accountId || '').slice(0, 80),
      r.ok ? 1 : 0, r.status === 429 ? 1 : 0, tin, tout, nowIso()).run();
    /* Kept ~100 days: enough for a quarter's view, small enough never to matter. */
    if (Math.random() < 0.002) await env.DB.prepare('DELETE FROM crm_ai_usage WHERE day < ?').bind(new Date(Date.now() - 100 * 86_400_000).toISOString().slice(0, 10)).run();
  } catch { /* counting must never cost the customer their answer */ }
}

/* ── Free-tier limits ────────────────────────────────────────────────────── */

export interface RateLimits { rpm: number; rpd: number; tpm: number }
export interface FreeLimits {
  gemini: Record<GeminiTier, RateLimits>;
  /** OpenRouter's free models: per key per day (50, or 1,000 once the account has bought $10 of credit). */
  openrouter: { rpd: number; rpdWithCredit: number; rpm: number };
  /** Where the figures came from, shown beside them. */
  source: string;
}

/**
 * Google's and OpenRouter's published free-tier figures. Google changes them
 * and they differ by project; the owner corrects them on the dashboard
 * (stored in crm_meta `ai_free_limits`) when AI Studio shows otherwise.
 */
export const FREE_DEFAULTS: FreeLimits = {
  /* Per model, not per project: each version has its own day (AI Studio's
     rate-limit table for the install's free project, 2026-11-11 — Flash 20,
     Flash-Lite 500, Pro none, Gemma 14,400 at 16k tokens a minute). 0 means
     "no free figure": such a model is ordered by what it answers, not by count. */
  gemini: {
    lite: { rpm: 15, rpd: 500, tpm: 250_000 },
    flash: { rpm: 5, rpd: 20, tpm: 250_000 },
    pro: { rpm: 0, rpd: 0, tpm: 0 },
    gemma: { rpm: 30, rpd: 14_400, tpm: 16_000 },
  },
  openrouter: { rpd: 50, rpdWithCredit: 1000, rpm: 20 },
  source: 'Published free-tier figures (Google AI Studio rate-limit table; OpenRouter free-model limits). Check AI Studio → Usage for your project and correct them here if they differ.',
};

let limitsCache: { at: number; v: FreeLimits } | null = null;
export async function freeLimits(env: Env): Promise<FreeLimits> {
  if (limitsCache && Date.now() - limitsCache.at < 60_000) return limitsCache.v;
  let v = FREE_DEFAULTS;
  try {
    const raw = JSON.parse((await metaGet(env.DB, 'ai_free_limits')) ?? 'null') as Partial<FreeLimits> | null;
    if (raw && typeof raw === 'object') v = mergeLimits(raw);
  } catch { /* defaults */ }
  limitsCache = { at: Date.now(), v };
  return v;
}

const n = (v: unknown, d: number, hi = 1e9) => { const x = Math.round(Number(v)); return Number.isFinite(x) && x >= 0 ? Math.min(hi, x) : d; };
function mergeLimits(raw: Partial<FreeLimits>): FreeLimits {
  const g = (raw.gemini ?? {}) as Partial<Record<GeminiTier, Partial<RateLimits>>>;
  const tier = (t: GeminiTier) => ({ rpm: n(g[t]?.rpm, FREE_DEFAULTS.gemini[t].rpm), rpd: n(g[t]?.rpd, FREE_DEFAULTS.gemini[t].rpd), tpm: n(g[t]?.tpm, FREE_DEFAULTS.gemini[t].tpm) });
  const o = (raw.openrouter ?? {}) as Partial<FreeLimits['openrouter']>;
  return {
    gemini: { lite: tier('lite'), flash: tier('flash'), pro: tier('pro'), gemma: tier('gemma') },
    openrouter: { rpd: n(o.rpd, FREE_DEFAULTS.openrouter.rpd), rpdWithCredit: n(o.rpdWithCredit, FREE_DEFAULTS.openrouter.rpdWithCredit), rpm: n(o.rpm, FREE_DEFAULTS.openrouter.rpm) },
    source: raw.source === FREE_DEFAULTS.source || !raw.source ? FREE_DEFAULTS.source : 'Set by the owner on this dashboard.',
  };
}

export async function saveFreeLimits(env: Env, raw: unknown): Promise<FreeLimits> {
  const v = { ...mergeLimits((raw ?? {}) as Partial<FreeLimits>), source: 'Set by the owner on this dashboard.' };
  await metaPut(env.DB, 'ai_free_limits', JSON.stringify(v));
  limitsCache = { at: Date.now(), v };
  return v;
}

/** Today's requests, answers and refusals per model on one install key, re-read every minute and counted up in between. */
type Count = { n: number; ok: number; l: number };
const todayCounts = new Map<string, { at: number; day: string; counts: Record<string, Count> }>();
async function countsFor(env: Env, fp: string): Promise<Record<string, Count>> {
  const hit = todayCounts.get(fp);
  if (hit && hit.day === today() && Date.now() - hit.at < 60_000) return hit.counts;
  const { results } = await env.DB.prepare("SELECT model, SUM(requests) AS n, SUM(ok) AS ok, SUM(limited) AS l FROM crm_ai_usage WHERE day = ? AND key_fp = ? GROUP BY model")
    .bind(today(), fp).all<{ model: string; n: number; ok: number; l: number }>().catch(() => ({ results: [] as { model: string; n: number; ok: number; l: number }[] }));
  const counts = Object.fromEntries((results ?? []).map(r => [r.model, { n: r.n, ok: r.ok, l: r.l }]));
  todayCounts.set(fp, { at: Date.now(), day: today(), counts });
  return counts;
}

/* What each model has done on one install key over the last week, re-read
   every ten minutes — the memory freeFirst orders by. */
const weekCounts = new Map<string, { at: number; counts: Record<string, Count> }>();
async function weekFor(env: Env, fp: string): Promise<Record<string, Count>> {
  const hit = weekCounts.get(fp);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.counts;
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare('SELECT model, SUM(requests) AS n, SUM(ok) AS ok, SUM(limited) AS l FROM crm_ai_usage WHERE day >= ? AND key_fp = ? GROUP BY model')
    .bind(since, fp).all<{ model: string; n: number; ok: number; l: number }>().catch(() => ({ results: [] as { model: string; n: number; ok: number; l: number }[] }));
  const counts = Object.fromEntries((results ?? []).map(r => [r.model, { n: r.n, ok: r.ok, l: r.l }]));
  weekCounts.set(fp, { at: Date.now(), counts });
  if (weekCounts.size > 50) weekCounts.delete(weekCounts.keys().next().value as string);
  return counts;
}

/**
 * The chain, ordered by what this key has actually done.
 *
 * ── Why (the AppSumo outage, 2026-11-11, read from the live counts) ──
 *
 * The install's one Google key answered on gemini-3.5-flash-lite every time
 * and was refused (429, "check your plan and billing") on 3.7-flash,
 * 3.8-flash and flash-latest every time — on the first call of the day, with
 * a dozen calls a week in all. Not a spent quota: those models are not open
 * to that free project at all. The chains for writing tasks start with the
 * newest Flash, so they met nothing but refusals, the key was rested for an
 * hour as "out of quota", and customers got OpenRouter's free models or an
 * error while a working model sat on the same key.
 *
 * So, for an install key:
 *  1. models that have answered on it this week, in the chain's own order;
 *  2. models it has never tried (a new release might work);
 *  3. a model that answered this week but is not in this task's chain — kept
 *     as a last resort, so a task never runs out of models the key can use;
 *  4. models only ever refused this week, and models at today's free limit.
 * A customer's own key is left as it is.
 */
export async function freeFirst(key: string, models: string[]): Promise<string[]> {
  const env = ENV;
  if (!env || !models.length) return models;
  try {
    const fp = await keyFp(key);
    if (fp === 'own') return models;
    const [today, week, lim] = await Promise.all([countsFor(env, fp), weekFor(env, fp), freeLimits(env)]);
    const past = (m: string) => { const c = today[m]; const rpd = lim.gemini[tierOf(m)].rpd; return rpd > 0 && !!c && c.n - c.l >= rpd; };
    /* Refused and never answered: this week's record, or today's (the week is re-read every ten minutes). */
    const refused = (m: string) => { const w = week[m], t = today[m]; return (!!w && w.l >= 1 && w.ok === 0) || (!!t && t.l >= 1 && t.ok === 0 && !(w && w.ok > 0)); };
    const proven = (m: string) => (week[m]?.ok ?? 0) > 0 || (today[m]?.ok ?? 0) > 0;
    const bad = (m: string) => past(m) || refused(m);
    const extra = Object.entries(week).filter(([m, c]) => c.ok > 0 && !models.includes(m) && /^gemini-/.test(m) && !/tts|audio|image|embedding/i.test(m))
      .sort((a, b) => b[1].ok - a[1].ok).map(([m]) => m).filter(m => !bad(m));
    return [
      ...models.filter(m => proven(m) && !bad(m)),
      ...models.filter(m => !proven(m) && !bad(m)),
      ...extra,
      ...models.filter(bad),
    ];
  } catch { return models; }
}

/**
 * Is this install key close to the end of today's free allowance?
 *
 * The switch made before the limit, not after it (lib/aiPool.ts `order`):
 * at 90% of a free day the key goes behind the keys that still have room,
 * so OpenRouter takes over from a spent Google key — or Google from a spent
 * OpenRouter one — while the first still answers. A key that has answered
 * more than the free figure today is paid (or the figures are wrong) and is
 * never demoted for it; nor is a customer's own key. A key that has refused
 * five times today without one answer is demoted too: it is spent, whatever
 * the count says.
 */
export async function nearDailyLimit(env: Env, key: string, fp: string): Promise<boolean> {
  if (poolKeyOf(key)?.source === 'workspace') return false;
  const [counts, lim] = await Promise.all([countsFor(env, fp), freeLimits(env)]);
  let total = 0, ok = 0, refused = 0;
  for (const [model, c] of Object.entries(counts)) {
    /* The voice model has a quota of its own; it says nothing about writing. */
    if (/tts|audio/i.test(model)) continue;
    /* A refusal (429) is not a request served, and Google does not count it
       against the day — counting it here demoted keys that still had room. */
    total += c.n - c.l; ok += c.ok; refused += c.l;
  }
  if (!total && !refused) return false;
  if (refused >= 5 && ok === 0) return true;
  if (/^sk-or-/.test(key.trim())) {
    const day = ok > lim.openrouter.rpd ? lim.openrouter.rpdWithCredit : lim.openrouter.rpd;
    return total >= 0.9 * day;
  }
  /* Google: every model has its own free day and freeFirst steps from one to
     the next within the key (Flash 20, Flash-Lite 500, Gemma 14,400), so a
     key's total says little — only a key refusing everything is demoted. */
  return false;
}

/* ── Caps per workspace ──────────────────────────────────────────────────── */

export interface Cap { hour: number; day: number; tokensDay: number; blocked?: boolean }
export interface Caps extends Cap { overrides: Record<string, Partial<Cap>> }
export const CAP_DEFAULTS: Caps = { hour: 120, day: 800, tokensDay: 0, overrides: {} };

let capsCache: { at: number; v: Caps } | null = null;
export async function aiCaps(env: Env): Promise<Caps> {
  if (capsCache && Date.now() - capsCache.at < 60_000) return capsCache.v;
  let v = CAP_DEFAULTS;
  try { v = cleanCaps(JSON.parse((await metaGet(env.DB, 'ai_caps')) ?? 'null')); } catch { /* defaults */ }
  capsCache = { at: Date.now(), v };
  return v;
}

function cleanCaps(raw: unknown): Caps {
  const r = (raw ?? {}) as Partial<Caps>;
  const overrides: Record<string, Partial<Cap>> = {};
  for (const [id, o] of Object.entries(r.overrides ?? {}).slice(0, 500)) {
    if (!/^[\w-]{1,80}$/.test(id) || !o || typeof o !== 'object') continue;
    const c: Partial<Cap> = {};
    if (o.hour !== undefined && o.hour !== null) c.hour = n(o.hour, CAP_DEFAULTS.hour, 100_000);
    if (o.day !== undefined && o.day !== null) c.day = n(o.day, CAP_DEFAULTS.day, 1_000_000);
    if (o.tokensDay !== undefined && o.tokensDay !== null) c.tokensDay = n(o.tokensDay, 0, 1e10);
    if (o.blocked === true) c.blocked = true;
    if (Object.keys(c).length) overrides[id] = c;
  }
  return { hour: n(r.hour, CAP_DEFAULTS.hour, 100_000), day: n(r.day, CAP_DEFAULTS.day, 1_000_000), tokensDay: n(r.tokensDay, 0, 1e10), overrides };
}

export async function saveCaps(env: Env, raw: unknown): Promise<Caps> {
  const v = cleanCaps(raw);
  await metaPut(env.DB, 'ai_caps', JSON.stringify(v));
  capsCache = { at: Date.now(), v };
  return v;
}

export async function capFor(env: Env, accountId: string): Promise<Cap> {
  const c = await aiCaps(env);
  return { hour: c.hour, day: c.day, tokensDay: c.tokensDay, ...(c.overrides[accountId] ?? {}) };
}

const tokenCache = new Map<string, { at: number; n: number }>();
async function tokensToday(env: Env, accountId: string): Promise<number> {
  const k = `${today()}:${accountId}`;
  const hit = tokenCache.get(k);
  if (hit && Date.now() - hit.at < 60_000) return hit.n;
  const row = await env.DB.prepare('SELECT COALESCE(SUM(tokens_in + tokens_out), 0) AS n FROM crm_ai_usage WHERE account_id = ? AND day = ?')
    .bind(accountId, today()).first<{ n: number }>().catch(() => null);
  if (tokenCache.size > 2000) tokenCache.clear();
  tokenCache.set(k, { at: Date.now(), n: row?.n ?? 0 });
  return row?.n ?? 0;
}

/**
 * Why this workspace may not make another AI request now, or null. The
 * owner's caps (or the defaults); the hour and day are counted when asked,
 * as before, because the call follows straight after.
 */
export async function capRefusal(env: Env, accountId: string): Promise<{ message: string; code: string; retryAfter?: number } | null> {
  const cap = await capFor(env, accountId);
  if (cap.blocked) return { message: 'AI is switched off for this workspace by the platform owner.', code: 'ai_blocked' };
  if (cap.tokensDay > 0 && (await tokensToday(env, accountId)) >= cap.tokensDay) {
    return { message: 'This workspace has used its AI allowance for today — it resets at midnight UTC.', code: 'ai_tokens_day' };
  }
  for (const [what, max, windowSeconds] of [['ai-hour', cap.hour, 3600], ['ai-day', cap.day, 86_400]] as const) {
    const v = await rateLimit(env, { what, who: accountId, max: Math.max(1, max), windowSeconds });
    if (!v.allowed) return { message: `That is a lot of AI use for one workspace in a short time — try again in ${Math.max(1, Math.ceil(v.retryAfter / 60))} minutes.`, code: 'rate_limited', retryAfter: v.retryAfter };
  }
  return null;
}
