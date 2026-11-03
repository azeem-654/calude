/**
 * The owner's "AI & cloud usage" dashboard (Platform services), read in one
 * call: today's and this month's AI use per key, model, module and workspace
 * against the free tiers; the model each module is routed to right now; the
 * OpenRouter keys' own figures; Cloudflare against Workers Paid; the
 * Openprovider balance; the caps. Owner only (routes/platform.ts). Never a
 * key: keys appear by their label and fingerprint.
 */
import type { Env } from './db';
import { readInstallKeys } from './aiPool';
import { geminiNames } from './ai';
import { freeModels, isOpenRouterKey, openRouterKeyInfo } from './openrouter';
import { MODULES, TASKS, chainFor, tierOf, type AiTask } from './aiTasks';
import { aiCaps, freeLimits, today } from './aiUsage';
import { cloudUsage } from './cloudUsage';
import { connectedProvider } from './registrars';
import { accountBalance } from './registrars/openprovider';

interface Row { provider: string; key_fp: string; model: string; module: string; account_id: string; r: number; ok: number; l: number; ti: number; to: number }

export async function usageReport(env: Env) {
  const day = today();
  const month = `${day.slice(0, 7)}-01`;
  const [limits, caps, keys] = await Promise.all([freeLimits(env), aiCaps(env), readInstallKeys(env)]);
  const q = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).all<Row>().then(x => x.results ?? []).catch(() => [] as Row[]);
  const [byModelToday, byModelMonth, byModule, byWorkspace] = await Promise.all([
    q(`SELECT provider, key_fp, model, SUM(requests) r, SUM(ok) ok, SUM(limited) l, SUM(tokens_in) ti, SUM(tokens_out) "to" FROM crm_ai_usage WHERE day = ? GROUP BY provider, key_fp, model ORDER BY r DESC`, day),
    q(`SELECT provider, model, SUM(requests) r, SUM(ok) ok, SUM(limited) l, SUM(tokens_in) ti, SUM(tokens_out) "to" FROM crm_ai_usage WHERE day >= ? AND key_fp != 'own' GROUP BY provider, model ORDER BY r DESC`, month),
    q(`SELECT module, SUM(CASE WHEN day = ? THEN requests ELSE 0 END) r, SUM(requests) ok, SUM(CASE WHEN day = ? THEN tokens_in + tokens_out ELSE 0 END) ti, SUM(tokens_in + tokens_out) "to" FROM crm_ai_usage WHERE day >= ? GROUP BY module ORDER BY ok DESC`, day, day, month),
    q(`SELECT u.account_id, SUM(u.requests) r, SUM(u.limited) l, SUM(u.tokens_in) ti, SUM(u.tokens_out) "to" FROM crm_ai_usage u WHERE u.day = ? AND u.account_id != '' GROUP BY u.account_id ORDER BY r DESC LIMIT 25`, day),
  ]);

  const owners = new Map<string, string>();
  if (byWorkspace.length) {
    const ids = byWorkspace.map(w => w.account_id);
    const { results } = await env.DB.prepare(`SELECT account_id, owner_email FROM crm_workspaces WHERE account_id IN (${ids.map(() => '?').join(',')})`)
      .bind(...ids).all<{ account_id: string; owner_email: string }>().catch(() => ({ results: [] as { account_id: string; owner_email: string }[] }));
    for (const r of results ?? []) owners.set(r.account_id, r.owner_email);
  }

  const label = new Map(keys.map(k => [k.fp, k.label]));
  const gemini = byModelToday.filter(r => r.provider === 'gemini').map(r => {
    const tier = tierOf(r.model);
    const free = r.key_fp === 'own' ? null : limits.gemini[tier].rpd;
    return { key: r.key_fp === 'own' ? 'A workspace\'s own key' : label.get(r.key_fp) ?? `Key ${r.key_fp.slice(0, 6)}`, own: r.key_fp === 'own', model: r.model, tier, requests: r.r, ok: r.ok, limited: r.l, tokensIn: r.ti, tokensOut: r.to, freePerDay: free, left: free === null ? null : Math.max(0, free - r.r) };
  });

  /* OpenRouter: OpenRouter's own word on each key, beside today's count of free-model requests. */
  const orKeys = keys.filter(k => isOpenRouterKey(k.key));
  const openrouter = await Promise.all(orKeys.map(async k => {
    const info = await openRouterKeyInfo(k.key);
    const used = byModelToday.filter(r => r.provider === 'openrouter' && r.key_fp === k.fp).reduce((a, r) => a + r.r, 0);
    const free = info.freeTier === false ? limits.openrouter.rpdWithCredit : limits.openrouter.rpd;
    return { key: k.label, requests: used, freePerDay: free, left: Math.max(0, free - used), freeTier: info.freeTier, spent: info.usage, limit: info.limit, remaining: info.remaining, error: info.error };
  }));

  /* Which model each module goes to now, from the first Google key's own list. */
  const gKey = keys.find(k => !isOpenRouterKey(k.key));
  const names = gKey ? await geminiNames(gKey.key) : null;
  const orFirst = new Map<AiTask, string[]>();
  if (orKeys.length) for (const t of Object.keys(TASKS) as AiTask[]) if (t !== 'research') orFirst.set(t, (await freeModels(t === 'vision', t)).slice(0, 2));
  const used = new Map(byModule.map(m => [m.module, m]));
  const routing = Object.entries(MODULES).map(([id, m]) => ({
    id, label: m.label, task: m.task, taskLabel: TASKS[m.task].label, why: TASKS[m.task].why,
    gemini: names ? chainFor(names, m.task).slice(0, 3) : [],
    openrouter: orFirst.get(m.task) ?? [],
    today: used.get(id)?.r ?? 0, month: used.get(id)?.ok ?? 0, tokensToday: used.get(id)?.ti ?? 0, tokensMonth: used.get(id)?.to ?? 0,
  }));

  const workspaces = byWorkspace.map(w => ({
    accountId: w.account_id, owner: owners.get(w.account_id) ?? '', requests: w.r, limited: w.l, tokens: w.ti + w.to,
    cap: { hour: caps.hour, day: caps.day, tokensDay: caps.tokensDay, ...(caps.overrides[w.account_id] ?? {}) }, overridden: !!caps.overrides[w.account_id],
  }));

  const [cloud, registrar] = await Promise.all([
    cloudUsage(env),
    (async () => {
      const c = await connectedProvider(env).catch(() => null);
      if (!c) return { connected: false as const };
      if (c.provider.id !== 'openprovider') return { connected: true as const, provider: c.provider.label, ok: false, error: 'Balance is read for Openprovider only.' };
      return { connected: true as const, provider: c.provider.label, ...(await accountBalance(c.creds)) };
    })(),
  ]);

  return {
    day, month: month.slice(0, 7), limits, caps, gemini, openrouter,
    monthTotals: byModelMonth.map(r => ({ provider: r.provider, model: r.model, requests: r.r, limited: r.l, tokensIn: r.ti, tokensOut: r.to })),
    routing, workspaces, cloud, registrar,
    modelsKnown: !!names, hasGoogleKey: !!gKey, hasOpenRouterKey: orKeys.length > 0,
  };
}
