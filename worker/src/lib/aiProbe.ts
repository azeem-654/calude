/**
 * The 15-minute check on every AI key: each of the install's keys is asked
 * for one word, so a key that has died is found by this and not by a
 * customer.
 *
 * ── Why the pool's own bookkeeping was not enough ──
 *
 * `withFailover` (lib/aiPool.ts) learns a key is dead only when a customer's
 * request is sent to it. At three in the morning nobody's is, so a key that
 * was revoked, lost its billing or spent its day was found by the first
 * customer of the morning — who waited through it — and the owner heard
 * about it after that customer did. The AppSumo reviewer met exactly this.
 *
 * ── What it does with the answer ──
 *
 * Nothing new: a key that answered is marked working (`markOk`, which also
 * ends its rest, in every isolate within 30 s), one that failed is rested for
 * its reason (`markFailed`, `classify`), so customers' requests go to the
 * working keys first. None answering at all mails the owner the way a
 * customer's failed request does (`notePoolDown`, at most every six hours).
 * The run is kept (`ai_probe_last`) for Platform services → AI health and
 * for the hourly check's "only one key left" warning (lib/aiHealth.ts).
 *
 * ── What it costs ──
 *
 * One short request per key per run, on the fastest model, and only for a
 * key that has not answered a customer in the last 15 minutes — a key in
 * use is proved by its use. At most 96 requests a key a day, usually far
 * fewer. The testing site checks only its own keys; the live site's keys,
 * which it borrows, are the live site's to check.
 */
import { metaGet, metaPut, nowIso, type Env } from './db';
import { adoptAiBase, probeAiKey } from './ai';
import { classify, markFailed, markOk, notePoolDown, readInstallKeys } from './aiPool';
import { noteTool, scrubSecrets } from './aiToolHealth';

const GATE_KEY = 'ai_probe_at';
export const PROBE_KEY = 'ai_probe_last';
const EVERY_MS = 15 * 60_000;
/** A key that answered a real request this recently needs no check. */
const PROVEN_MS = 15 * 60_000;
/** The run stops starting checks after this, so a slow provider cannot hold the cron. */
const BUDGET_MS = 90_000;

export interface ProbeKey {
  label: string;
  source: string;
  ok: boolean;
  /** 'checked' — asked just now; 'in_use' — answered a customer within 15 minutes; 'skipped' — out of time this run. */
  how: 'checked' | 'in_use' | 'skipped';
  ms: number;
  /** The provider's reason, never a key. */
  error: string;
}

export interface ProbeRun {
  at: string;
  total: number;
  /** Keys that answered: checked now, or proved by a customer's request. */
  working: number;
  keys: ProbeKey[];
  /** Whether the Worker has the Workers AI binding that answers when no key does (lib/ai.ts askWorkersAi). */
  lastResort: boolean;
}

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso.replace(' ', 'T')) : NaN);

export async function lastProbe(env: Env): Promise<ProbeRun | null> {
  try { return JSON.parse((await metaGet(env.DB, PROBE_KEY)) ?? 'null') as ProbeRun | null; } catch { return null; }
}

/** `force`: the owner's "Check now" — every key is asked, in use or not. */
export async function runAiProbe(env: Env, opts: { force?: boolean } = {}): Promise<ProbeRun | null> {
  if (!opts.force) {
    const then = ms(await metaGet(env.DB, GATE_KEY).catch(() => null));
    if (Number.isFinite(then) && Date.now() - then < EVERY_MS) return null;
  }
  await metaPut(env.DB, GATE_KEY, nowIso()).catch(() => undefined);
  adoptAiBase(env);

  const keys = await readInstallKeys(env, { withLive: false }).catch(() => []);
  const { results } = await env.DB.prepare('SELECT fp, last_ok_at, cooldown_until FROM crm_ai_key_health')
    .all<{ fp: string; last_ok_at: string | null; cooldown_until: string | null }>()
    .catch(() => ({ results: [] as { fp: string; last_ok_at: string | null; cooldown_until: string | null }[] }));
  const health = new Map((results ?? []).map(r => [r.fp, r]));

  const started = Date.now();
  const out: ProbeKey[] = [];
  let firstFailure: { status: number; error: string } | null = null;
  for (const k of keys) {
    const h = health.get(k.fp);
    const resting = ms(h?.cooldown_until) > Date.now();
    if (!opts.force && !resting && Date.now() - ms(h?.last_ok_at) < PROVEN_MS) {
      out.push({ label: k.label, source: k.source, ok: true, how: 'in_use', ms: 0, error: '' });
      continue;
    }
    if (Date.now() - started > BUDGET_MS) {
      out.push({ label: k.label, source: k.source, ok: false, how: 'skipped', ms: 0, error: 'Not checked this time — the run ran out of time.' });
      continue;
    }
    const t0 = Date.now();
    const r = await probeAiKey(k.key).catch(e => ({ ok: false as const, status: 0, error: String(e), value: { ok: false, text: '', error: String(e) } }));
    if (r.ok) {
      await markOk(env, k);
      out.push({ label: k.label, source: k.source, ok: true, how: 'checked', ms: Date.now() - t0, error: '' });
    } else {
      /* Rested for the reason it gave; a reason that is not the key's (rare
         for "reply OK") still rests it briefly, since it did not answer. */
      const c = classify(r.status, r.error);
      await markFailed(env, k, c.restMs || 5 * 60_000, r.status, r.error);
      if (!firstFailure) firstFailure = { status: r.status, error: r.error };
      out.push({ label: k.label, source: k.source, ok: false, how: 'checked', ms: Date.now() - t0, error: scrubSecrets(r.value.error || r.error).slice(0, 300) });
    }
  }

  const run: ProbeRun = {
    at: nowIso(), total: keys.length, working: out.filter(k => k.ok).length, keys: out, lastResort: !!env.AI,
  };
  await metaPut(env.DB, PROBE_KEY, JSON.stringify(run)).catch(() => undefined);
  /* A key that wrote a word just now is writing working again: the streak of
     customers' failures behind "failing" ends here rather than at the next
     customer to try. */
  if (out.some(k => k.ok && k.how === 'checked')) await noteTool('text', true).catch(() => undefined);
  /* None answered: the same mail a customer's failed request sends. */
  if (run.total > 0 && run.working === 0 && firstFailure) {
    await notePoolDown(env, firstFailure.status, firstFailure.error).catch(() => undefined);
  }
  return run;
}
