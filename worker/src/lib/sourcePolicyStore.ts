/**
 * The owner's switch per prospect source — on for everybody, kept internal
 * (owner only) or off — stored install-wide in `crm_meta.source_policy`.
 *
 * A source whose terms or redistribution rights are unclear can be held back
 * here without a deploy: searching it by hand (routes/prospects.ts) and
 * connecting it to Autopilot (routes/sources.ts) both ask, and a connection
 * already running on a source switched off pauses and says why
 * (prospectFinderTick.ts). The rules for what each source may do at all are
 * in lib/prospectSources.ts (`SOURCE_POLICY`).
 */
import { nowIso, type Env } from './db';
import { policyFor, type PolicySetting } from './prospectSources';

export type PolicySettings = Partial<Record<'free' | 'register' | 'google', PolicySetting>>;

export async function loadPolicy(env: Env): Promise<PolicySettings> {
  const r = await env.DB.prepare("SELECT v FROM crm_meta WHERE k = 'source_policy'").first<{ v: string }>().catch(() => null);
  try { return (JSON.parse(r?.v ?? '{}') ?? {}) as PolicySettings; } catch { return {}; }
}

export async function savePolicy(env: Env, p: PolicySettings): Promise<PolicySettings> {
  const clean: PolicySettings = {};
  for (const k of ['free', 'register', 'google'] as const) {
    const v = p[k];
    if (v === 'on' || v === 'owner' || v === 'off') clean[k] = v;
  }
  await env.DB.prepare("INSERT INTO crm_meta (k, v, updated_at) VALUES ('source_policy', ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at")
    .bind(JSON.stringify(clean), nowIso()).run();
  return clean;
}

/** May this person use this source right now? `null` when yes, else the reason, by name. */
export async function sourceRefusal(env: Env, source: string, isOwner: boolean, settings?: PolicySettings): Promise<{ code: string; error: string } | null> {
  const s = policyFor(settings ?? (await loadPolicy(env)), source);
  if (s === 'off') return { code: 'source_off', error: 'The owner of this app has switched this source off.' };
  if (s === 'owner' && !isOwner) return { code: 'source_internal', error: 'This source is kept internal by the owner of this app for now.' };
  return null;
}
