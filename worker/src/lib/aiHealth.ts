/**
 * The owner's AI health monitor: for every tool in lib/aiTools.ts, is its
 * key configured, is it failing, and how near today's free quota it is —
 * and a mail to the owner when one is not right.
 *
 * ── Where the answers come from (nothing is estimated) ──
 *
 * - Key configured: the install's own keys only (lib/aiPool.ts
 *   `readInstallKeys`, the Places key, the Workers AI binding). A customer's
 *   own key does not make a tool "configured" for everybody else.
 * - Failing: `crm_ai_tool_health` (lib/aiToolHealth.ts — three failures in
 *   a row with no success since), `crm_ai_usage` (five requests or more
 *   since yesterday and none answered), every pool key resting
 *   (`describePool`), or the Places key's own last verdict.
 * - Quota: today's requests on the install's keys against the free figures
 *   the usage dashboard already uses (`freeLimits`: Google's per-model day,
 *   OpenRouter's per-key day). Only models that answered today are counted,
 *   and a key that has served more than its free figure is paid and left out,
 *   the same rule `nearDailyLimit` uses. Tools with no published figure have
 *   no quota line rather than an invented one.
 *
 * ── Mail ──
 *
 * Only through lib/deliver.ts. From support@protectedcentral.com when that
 * mailbox is connected and validated in the owner's workspaces, otherwise
 * from the system mailbox (and the alert says so); to the owner, then a
 * second copy to the owner's other address — deliver has no Cc, and a
 * second send keeps every provider and SMTP path as it is. The same tool and
 * condition is mailed at most once a day (`crm_ai_alerts`). With no mailbox
 * at all, the attempt is written down and nothing is marked sent, so the
 * next hourly run tries again and the owner's screen says why.
 *
 * Runs from the 5-minute cron after housekeeping, gated to once an hour; it
 * reads a handful of rows and makes no AI call.
 */
import { metaGet, metaPut, nowIso, type Env } from './db';
import { AI_TOOLS, toolForModule, type AiTool } from './aiTools';
import { describePool, readInstallKeys, type PoolKey } from './aiPool';
import { isOpenRouterKey } from './openrouter';
import { aiCaps, freeLimits, today } from './aiUsage';
import { tierOf } from './aiTasks';
import { installPlacesKey } from './googlePlaces';
import { scrubSecrets } from './aiToolHealth';
import { canSend, deliver, fromAddressOf } from './deliver';

export const ALERT_TO = 'azeem@protectedcentral.com';
export const ALERT_COPY = 'azeem654@gmail.com';
export const ALERT_FROM = 'support@protectedcentral.com';

const GATE_KEY = 'ai_health_checked_at';
const MAIL_KEY = 'ai_health_mail';
const EVERY_MS = 60 * 60_000;
const QUIET_MS = 24 * 3_600_000;

export type ToolState = 'ok' | 'missing_key' | 'failing' | 'near_quota';
export type Condition = 'missing_key' | 'failing' | 'quota80' | 'quota95';

export interface ToolHealth {
  id: string; name: string; provider: string; powers: string; keyWhere: string; optional: boolean;
  state: ToolState;
  /** One sentence the owner acts on. */
  detail: string;
  key: { configured: boolean; detail: string };
  /** crm_ai_usage on the install's keys, today and yesterday. */
  recent: { requests: number; ok: number; limited: number };
  lastOkAt: string | null; lastErrorAt: string | null; lastError: string; failStreak: number;
  quota: { used: number; limit: number; pct: number; basis: string } | null;
  conditions: Condition[];
}

interface HealthRow { tool: string; last_ok_at: string | null; last_error_at: string | null; last_error: string; fail_streak: number }
interface UseRow { provider: string; key_fp: string; model: string; module: string; account_id: string; r: number; ok: number; l: number }

const rows = <T>(env: Env, sql: string, ...b: unknown[]) =>
  env.DB.prepare(sql).bind(...b).all<T>().then(x => x.results ?? []).catch(() => [] as T[]);
const ms = (iso: string | null) => (iso ? Date.parse(iso.replace(' ', 'T')) : NaN);

function keyState(t: AiTool, keys: PoolKey[], places: boolean, workersAi: boolean): { configured: boolean; detail: string } {
  const google = keys.filter(k => !isOpenRouterKey(k.key));
  const or = keys.filter(k => isOpenRouterKey(k.key));
  /* Labels only — "Main key", "Backup key 2", the secret's name. Never a key or a tail. */
  const named = (ks: PoolKey[]) => ks.map(k => k.label).join(', ');
  switch (t.key) {
    case 'pool':
      return keys.length
        ? { configured: true, detail: `${keys.length} key${keys.length === 1 ? '' : 's'} in the pool: ${named(keys)}.` }
        : { configured: false, detail: 'No AI key at all on this install.' };
    case 'google':
      return google.length
        ? { configured: true, detail: `${google.length} Google AI key${google.length === 1 ? '' : 's'}: ${named(google)}.` }
        : { configured: false, detail: or.length ? 'Only OpenRouter keys are in the pool, and this needs a Google AI key.' : 'No Google AI key on this install.' };
    case 'search':
      if (google.length) return { configured: true, detail: `Google search grounding on ${named(google)}${or.length ? `; OpenRouter's web plugin behind it (${named(or)}), which needs credit` : ''}.` };
      return or.length
        ? { configured: true, detail: `Only OpenRouter (${named(or)}): its web search is billed per search and fails without credit.` }
        : { configured: false, detail: 'No Google AI key or OpenRouter key, so nothing can search the web.' };
    case 'places':
      return places ? { configured: true, detail: 'The install\'s Google Maps key is stored.' } : { configured: false, detail: 'No install Google Maps key is stored.' };
    case 'workers_ai':
      return workersAi ? { configured: true, detail: 'The Workers AI binding is present on this Worker.' } : { configured: false, detail: 'This Worker has no Workers AI binding ("ai" in wrangler.jsonc).' };
  }
}

/** The whole picture, read-only. No AI call, no network except what readInstallKeys does on the testing site. */
export async function checkAiTools(env: Env): Promise<ToolHealth[]> {
  const day = today();
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const [keys, pool, limits, caps, inst] = await Promise.all([
    readInstallKeys(env).catch(() => [] as PoolKey[]),
    describePool(env).catch(() => []),
    freeLimits(env),
    aiCaps(env),
    installPlacesKey(env).catch(() => null),
  ]);
  const [health, recentRows, todayRows, perWorkspace] = await Promise.all([
    rows<HealthRow>(env, 'SELECT tool, last_ok_at, last_error_at, last_error, fail_streak FROM crm_ai_tool_health'),
    rows<UseRow>(env, "SELECT module, SUM(requests) r, SUM(ok) ok, SUM(limited) l FROM crm_ai_usage WHERE day >= ? AND key_fp != 'own' GROUP BY module", yesterday),
    rows<UseRow>(env, "SELECT provider, key_fp, model, SUM(requests) r, SUM(ok) ok, SUM(limited) l FROM crm_ai_usage WHERE day = ? AND key_fp != 'own' GROUP BY provider, key_fp, model", day),
    rows<UseRow>(env, "SELECT account_id, SUM(requests) r FROM crm_ai_usage WHERE day = ? AND account_id != '' GROUP BY account_id", day),
  ]);
  const byTool = new Map(health.map(h => [h.tool, h]));
  const recent = new Map<string, { requests: number; ok: number; limited: number }>();
  for (const r of recentRows) {
    const id = toolForModule(r.module);
    const c = recent.get(id) ?? { requests: 0, ok: 0, limited: 0 };
    c.requests += Number(r.r) || 0; c.ok += Number(r.ok) || 0; c.limited += Number(r.l) || 0;
    recent.set(id, c);
  }

  /* Today's free quota on the install's keys (see the header for the rule). */
  const installFps = new Set(keys.map(k => k.fp));
  let used = 0, limit = 0;
  const orByKey = new Map<string, { n: number; ok: number }>();
  for (const r of todayRows) {
    if (!installFps.has(r.key_fp)) continue;
    const served = Math.max(0, (Number(r.r) || 0) - (Number(r.l) || 0));
    if (r.provider === 'gemini') {
      const rpd = limits.gemini[tierOf(r.model)]?.rpd ?? 0;
      if (rpd <= 0 || (Number(r.ok) || 0) > rpd) continue;
      used += Math.min(served, rpd); limit += rpd;
    } else if (r.provider === 'openrouter') {
      const c = orByKey.get(r.key_fp) ?? { n: 0, ok: 0 };
      c.n += served; c.ok += Number(r.ok) || 0; orByKey.set(r.key_fp, c);
    }
  }
  for (const c of orByKey.values()) {
    const rpd = c.ok > limits.openrouter.rpd ? limits.openrouter.rpdWithCredit : limits.openrouter.rpd;
    if (rpd <= 0 || c.ok > limits.openrouter.rpdWithCredit) continue;
    used += Math.min(c.n, rpd); limit += rpd;
  }
  const poolQuota = limit > 0
    ? { used, limit, pct: used / limit, basis: 'Free requests used today on the install\'s keys, on the models that answered today (Google\'s per-model day, OpenRouter\'s per-key day; paid keys left out).' }
    : null;

  /* The owner's per-workspace daily caps (lib/aiUsage.ts): information, not an alert — a customer at their cap is the cap working. */
  const nearCap = perWorkspace.filter(w => {
    const cap = { ...caps, ...(caps.overrides[w.account_id] ?? {}) };
    return cap.day > 0 && (Number(w.r) || 0) >= 0.8 * cap.day;
  }).length;

  const allResting = pool.length > 0 && pool.every(k => k.restingUntil);
  const now = Date.now();

  return AI_TOOLS.map(t => {
    const key = keyState(t, keys, !!inst, !!env.AI);
    const h = byTool.get(t.id);
    const rc = recent.get(t.id) ?? { requests: 0, ok: 0, limited: 0 };
    const quota = t.id === 'text' ? poolQuota : null;

    let failing = '';
    const errAt = ms(h?.last_error_at ?? null), okAt = ms(h?.last_ok_at ?? null);
    if (h && h.fail_streak >= 3 && now - errAt < QUIET_MS && !(okAt > errAt)) {
      failing = `Failed ${h.fail_streak} times in a row, last at ${h.last_error_at}, with no success since.`;
    } else if (rc.requests >= 5 && rc.ok === 0) {
      failing = `${rc.requests} requests since yesterday and none answered${rc.limited ? ` (${rc.limited} refused for quota)` : ''}.`;
    } else if (allResting && (t.key === 'pool' || t.key === 'search' || t.key === 'google')) {
      failing = `All ${pool.length} AI keys are resting after failing.`;
    } else if (t.key === 'places' && inst?.status === 'error') {
      failing = 'Google refused the Maps key the last time it was used.';
    }

    const conditions: Condition[] = [];
    if (!key.configured && !t.optional) conditions.push('missing_key');
    if (key.configured && failing) conditions.push('failing');
    if (quota && quota.pct >= 0.95) conditions.push('quota95');
    else if (quota && quota.pct >= 0.8) conditions.push('quota80');

    const state: ToolState = !key.configured ? 'missing_key' : failing ? 'failing' : quota && quota.pct >= 0.8 ? 'near_quota' : 'ok';
    const detail = state === 'missing_key'
      ? `${key.detail} ${t.optional ? 'Customers have a fallback, so this is optional.' : `Set it in ${t.keyWhere}.`}`
      : state === 'failing' ? failing
        : state === 'near_quota' && quota ? `${Math.round(quota.pct * 100)}% of today's free requests used (${quota.used} of ${quota.limit}).`
          : rc.requests ? `Working. ${rc.ok} of ${rc.requests} requests answered since yesterday.` : 'Configured. No requests since yesterday.';
    const extra = t.id === 'text' && nearCap ? ` ${nearCap} workspace${nearCap === 1 ? ' is' : 's are'} at 80% or more of the daily AI cap you set.` : '';

    return {
      id: t.id, name: t.name, provider: t.provider, powers: t.powers, keyWhere: t.keyWhere, optional: !!t.optional,
      state, detail: detail + extra, key, recent: rc,
      lastOkAt: h?.last_ok_at ?? (t.key === 'places' && inst?.status === 'ok' ? inst.updatedAt : null),
      lastErrorAt: h?.last_error_at ?? null,
      lastError: scrubSecrets(h?.last_error || (t.key === 'places' && inst?.status === 'error' ? inst.lastError : '') || ''),
      failStreak: h?.fail_streak ?? 0,
      quota, conditions,
    };
  });
}

const SAY: Record<Condition, string> = {
  missing_key: 'has no key',
  failing: 'keeps failing',
  quota80: 'has used 80% of today\'s free quota',
  quota95: 'has used 95% of today\'s free quota',
};

export interface AlertRow { tool: string; condition: string; sent_at: string | null; last_attempt_at: string | null; outcome: string; detail: string }
export const readAlerts = (env: Env) =>
  rows<AlertRow>(env, 'SELECT tool, condition, sent_at, last_attempt_at, outcome, detail FROM crm_ai_alerts ORDER BY last_attempt_at DESC LIMIT 50');

export interface MailState { at: string; ok: boolean; detail: string }
export async function lastMail(env: Env): Promise<MailState | null> {
  try { return JSON.parse((await metaGet(env.DB, MAIL_KEY)) ?? 'null') as MailState | null; } catch { return null; }
}

/** The mailbox owner-bound mail goes from: support@ when validated, else the system mailbox. Shared with routes/supportReport.ts. */
export async function alertMailbox(env: Env) {
  const { systemCandidates, installMailbox } = await import('../routes/auth');
  const { loadMailboxById } = await import('../routes/mailbox');
  const support = (await systemCandidates(env).catch(() => []))
    .find(c => c.canSend && c.verifiedAt && c.fromEmail.trim().toLowerCase() === ALERT_FROM);
  if (support) {
    const mb = await loadMailboxById(env, support.accountId, support.id).catch(() => null);
    if (canSend(mb)) return { mb, from: ALERT_FROM };
  }
  const mb = await installMailbox(env).catch(() => null);
  return mb ? { mb, from: fromAddressOf(mb) } : null;
}

const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export interface HealthRun { ran: boolean; due: number; sent: boolean; detail: string }

/**
 * Check, and mail what is newly wrong. `force` skips the hourly gate (the
 * owner's "Check now"); the once-a-day rule per tool and condition holds
 * either way.
 */
export async function runAiHealth(env: Env, opts: { force?: boolean } = {}): Promise<HealthRun> {
  if (!opts.force) {
    const then = ms(await metaGet(env.DB, GATE_KEY).catch(() => null));
    if (Number.isFinite(then) && Date.now() - then < EVERY_MS) return { ran: false, due: 0, sent: false, detail: '' };
  }
  await metaPut(env.DB, GATE_KEY, nowIso()).catch(() => undefined);

  const tools = await checkAiTools(env);
  const stamps = new Map((await rows<AlertRow>(env, 'SELECT tool, condition, sent_at FROM crm_ai_alerts')).map(a => [`${a.tool}:${a.condition}`, a]));
  const due = tools.flatMap(t => t.conditions.map(c => ({ t, c })))
    .filter(({ t, c }) => { const s = ms(stamps.get(`${t.id}:${c}`)?.sent_at ?? null); return !(Date.now() - s < QUIET_MS); });
  if (!due.length) return { ran: true, due: 0, sent: false, detail: 'Nothing new to mail.' };

  const at = nowIso();
  const stamp = (tool: string, condition: string, sent: boolean, outcome: string, detail: string) => env.DB.prepare(
    `INSERT INTO crm_ai_alerts (tool, condition, sent_at, last_attempt_at, outcome, detail) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(tool, condition) DO UPDATE SET sent_at = COALESCE(excluded.sent_at, crm_ai_alerts.sent_at),
       last_attempt_at = excluded.last_attempt_at, outcome = excluded.outcome, detail = excluded.detail`,
  ).bind(tool, condition, sent ? at : null, at, outcome.slice(0, 300), detail.slice(0, 500)).run().catch(() => undefined);

  const box = await alertMailbox(env);
  if (!box) {
    const why = `Not sent: no validated mailbox is connected in your workspaces. Connect ${ALERT_FROM} in Settings → Email & SMS and press Save & validate.`;
    for (const { t, c } of due) await stamp(t.id, c, false, 'not_sent', `${why} (${t.detail})`);
    await metaPut(env.DB, MAIL_KEY, JSON.stringify({ at, ok: false, detail: why } satisfies MailState)).catch(() => undefined);
    return { ran: true, due: due.length, sent: false, detail: why };
  }

  const origin = (env.APP_ORIGIN ?? '').replace(/\/$/, '');
  const names = [...new Set(due.map(d => d.t.name))];
  const subject = `AI health: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''} ${due.length === 1 ? SAY[due[0].c] : 'need attention'}`;
  const sentFrom = box.from.toLowerCase() === ALERT_FROM ? '' : `<p style="color:#64748b">Sent from ${esc(box.from)} because ${ALERT_FROM} is not a connected, validated mailbox in your workspaces.</p>`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#17191c;max-width:620px">
<p>The AI health check found ${due.length === 1 ? 'one problem' : `${due.length} problems`} on your installation:</p>
<ul>${due.map(({ t, c }) => `<li style="margin:0 0 10px"><b>${esc(t.name)}</b> ${esc(SAY[c])}. ${esc(t.detail)}${t.lastError && c === 'failing' ? `<br><span style="color:#64748b">Last reason: ${esc(t.lastError)}</span>` : ''}<br><span style="color:#64748b">Affects: ${esc(t.powers)}. Fix it in ${esc(t.keyWhere)}.</span></li>`).join('')}</ul>
${origin ? `<p><a href="${origin}/settings?tab=platform">Open Platform services → AI health</a></p>` : ''}
<p style="color:#64748b">You will not be mailed about the same tool and problem again for 24 hours. This went to ${ALERT_TO}, with a copy to ${ALERT_COPY}.</p>${sentFrom}</div>`;

  const msg = { fromName: 'Protected Central', fromEmail: box.from, subject, html, replyTo: ALERT_FROM };
  const first = await deliver(box.mb, { ...msg, to: ALERT_TO }).catch(e => ({ ok: false, error: String(e) }));
  const copy = await deliver(box.mb, { ...msg, to: ALERT_COPY }).catch(e => ({ ok: false, error: String(e) }));
  const sent = first.ok || copy.ok;
  const outcome = first.ok && copy.ok ? 'sent'
    : sent ? `partly sent: ${first.ok ? `the copy to ${ALERT_COPY}` : ALERT_TO} failed — ${scrubSecrets((first.ok ? copy : first).error)}`
      : `not_sent: ${scrubSecrets(first.error)}`;
  for (const { t, c } of due) await stamp(t.id, c, sent, outcome, t.detail);
  const detail = sent ? `Mailed ${due.length} alert${due.length === 1 ? '' : 's'} from ${box.from}${outcome === 'sent' ? '' : ` (${outcome})`}.` : `The mail was refused: ${scrubSecrets(first.error)}`;
  await metaPut(env.DB, MAIL_KEY, JSON.stringify({ at, ok: sent, detail } satisfies MailState)).catch(() => undefined);
  return { ran: true, due: due.length, sent, detail };
}
