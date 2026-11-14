/**
 * /api/aikeys.php — the owner's AI keys: the main one and the backups tried
 * after it (lib/aiPool.ts).
 *
 * Install owner only, like Platform services, whose card it is. Keys go in
 * and never come back out — not whole, not as a tail; the screen is told what
 * each key is (a label and where it lives), whether it last worked, and what
 * Google last said when it did not. A key is proved with Google before it is
 * kept, so the pool never holds one that was mistyped.
 */
import { body, fail, json } from '../lib/http';
import { installSecret, nowIso, userFromToken, type Env, type SessionUser } from '../lib/db';
import { decryptSecret, encryptSecret } from '../lib/crypto';
import { adoptAiBase, probeAiKey, verifyAiKey } from '../lib/ai';
import { describePool, fingerprint, forgetPool, installPool, poolKeyAt, recordTest } from '../lib/aiPool';
import { OPENAI_KEY, listOpenAiModels, noteOpenAiKey, pickTranscriber } from '../lib/openai';

interface Req { token?: string; action?: string; apiKey?: string; label?: string; id?: string; index?: number; dir?: string; keys?: string }

const isOwner = (u: SessionUser) => u.role === 'agency' && !u.accountId;
const MAX_BACKUPS = 10;
/* OpenAI keys come in bulk (the owner, 2026-11-14). Enough for that, and a
   cap so one paste cannot keep the Worker verifying for minutes. */
const MAX_OPENAI = 200;
const MAX_PER_PASTE = 50;

interface OpenAiRow { id: string; label: string; created_at: string; last_ok_at: string | null; last_failed_at: string | null; last_error: string; resting_until: string | null }
async function openAiState(env: Env) {
  const { results } = await env.DB.prepare(
    'SELECT id, label, created_at, last_ok_at, last_failed_at, last_error, resting_until FROM crm_openai_keys ORDER BY position, created_at',
  ).all<OpenAiRow>().catch(() => ({ results: [] as OpenAiRow[] }));
  const now = nowIso();
  return (results ?? []).map(r => ({
    id: r.id, label: r.label, addedAt: r.created_at, lastOkAt: r.last_ok_at, lastFailedAt: r.last_failed_at,
    lastError: r.last_error, restingUntil: r.resting_until && r.resting_until > now ? r.resting_until : null,
  }));
}

export async function handleAiKeys(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this needs a current session.', 401, { code: 'unauthorised' });
  if (!isOwner(user)) return fail('Only the owner of this installation manages its AI keys.', 403, { code: 'not_owner' });
  adoptAiBase(env);
  const act = String(d.action ?? 'status');
  const state = async () => ({ success: true, keys: await describePool(env) });

  if (act === 'status') return json(await state());

  /* ── OpenAI keys, many at a time (lib/openai.ts) ── */
  const openAi = async (extra: Record<string, unknown> = {}) => json({ success: true, openai: await openAiState(env), ...extra });
  if (act === 'openai_status') return openAi();

  if (act === 'openai_add_many') {
    const text = String(d.keys ?? '').slice(0, 60_000);
    /* Keys out of whatever was pasted — one per line, commas, a spreadsheet
       column, "name: key" lines. OpenRouter (sk-or-) and Anthropic (sk-ant-)
       keys are not OpenAI's and are left out. */
    const found = [...new Set((text.match(/sk-[A-Za-z0-9_-]{20,}/g) ?? []).filter(k => OPENAI_KEY.test(k)))];
    if (!found.length) return fail('No OpenAI keys found in that. They start "sk-" (sk-proj-…, sk-svcacct-…), from platform.openai.com/api-keys.', 200, { field: 'aikeys.openai' });
    if (found.length > MAX_PER_PASTE) return fail(`That is ${found.length} keys — paste up to ${MAX_PER_PASTE} at a time.`, 200, { field: 'aikeys.openai' });
    const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM crm_openai_keys').first<{ n: number }>() ?? { n: 0 };
    const stored = new Set(((await env.DB.prepare('SELECT fp FROM crm_openai_keys').all<{ fp: string }>()).results ?? []).map(r => r.fp));
    const secret = await installSecret(env.DB, 'mailbox_key');
    const prefix = String(d.label ?? '').trim().slice(0, 40) || 'OpenAI key';
    let { pos } = await env.DB.prepare('SELECT COALESCE(MAX(position), 0) AS pos FROM crm_openai_keys').first<{ pos: number }>() ?? { pos: 0 };
    let room = MAX_OPENAI - n;
    let num = n;
    /* Reported by its place in the paste (#1, #2 …) — never by the key. */
    const results: { n: number; outcome: 'added' | 'duplicate' | 'refused' | 'full'; error?: string; transcribes?: boolean }[] = [];
    const todo = await Promise.all(found.map(async (k, i) => ({ k, i: i + 1, fp: await fingerprint(k) })));
    for (let at = 0; at < todo.length; at += 5) {
      /* Proved five at a time: each is a GET to OpenAI before it is kept. */
      const batch = todo.slice(at, at + 5);
      const checks = await Promise.all(batch.map(x => (stored.has(x.fp) ? null : listOpenAiModels(env, x.k))));
      for (let j = 0; j < batch.length; j++) {
        const x = batch[j]; const c = checks[j];
        if (!c) { results.push({ n: x.i, outcome: 'duplicate' }); continue; }
        if (!c.ok) { results.push({ n: x.i, outcome: 'refused', error: c.error }); continue; }
        if (room <= 0) { results.push({ n: x.i, outcome: 'full' }); continue; }
        stored.add(x.fp); room--; num++; pos++;
        await env.DB.prepare('INSERT INTO crm_openai_keys (id, position, label, credentials, fp, created_at, last_ok_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(crypto.randomUUID(), pos, `${prefix} ${num}`, await encryptSecret(secret, x.k), x.fp, nowIso(), nowIso()).run();
        results.push({ n: x.i, outcome: 'added', transcribes: !!pickTranscriber(c.models) });
      }
    }
    return openAi({ results, added: results.filter(r => r.outcome === 'added').length });
  }

  if (act === 'openai_remove') {
    await env.DB.prepare('DELETE FROM crm_openai_keys WHERE id = ?').bind(String(d.id ?? '')).run();
    return openAi();
  }
  if (act === 'openai_clear') {
    await env.DB.prepare('DELETE FROM crm_openai_keys').run();
    return openAi();
  }
  if (act === 'openai_test') {
    const row = await env.DB.prepare('SELECT id, credentials FROM crm_openai_keys WHERE id = ?').bind(String(d.id ?? '')).first<{ id: string; credentials: string }>();
    if (!row) return fail('That key is no longer in the list.');
    let key = '';
    try { key = await decryptSecret(await installSecret(env.DB, 'mailbox_key'), row.credentials); } catch { /* unreadable */ }
    if (!key) return fail('That key could not be read — remove it and paste it again.');
    const m = await listOpenAiModels(env, key);
    await noteOpenAiKey(env, row.id, m.ok, m.ok ? 200 : m.status, m.ok ? '' : m.error);
    return openAi({ tested: m.ok ? { ok: true, error: '', model: pickTranscriber(m.models) } : { ok: false, error: m.error } });
  }

  if (act === 'add') {
    const apiKey = String(d.apiKey ?? '').trim();
    if (!apiKey) return fail('Paste the API key first.', 200, { field: 'aikeys.key' });
    /* A Google AI key, or an OpenRouter key (lib/openrouter.ts — tried through its free models). */
    if (!/^AIza[0-9A-Za-z_-]{30,}$/.test(apiKey) && !/^sk-or-[0-9A-Za-z_-]{20,}$/.test(apiKey)) {
      return fail('That does not look like a Google AI key (they start "AIza", from aistudio.google.com) or an OpenRouter key (they start "sk-or-", from openrouter.ai/keys).', 200, { field: 'aikeys.key' });
    }
    const fp = await fingerprint(apiKey);
    const already = (await installPool(env)).some(k => k.fp === fp);
    if (already) return fail('That key is already in the list.', 200, { field: 'aikeys.key' });
    const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM crm_ai_keys').first<{ n: number }>() ?? { n: 0 };
    if (n >= MAX_BACKUPS) return fail(`Up to ${MAX_BACKUPS} backup keys. Remove one first.`);
    /* Proved before it is kept: a mistyped key in the pool is a failure
       waiting for the moment the main key needs it. */
    const v = await verifyAiKey(apiKey);
    if (!v.ok) return fail(/^sk-or-/.test(apiKey) ? v.error : `Google refused that key: ${v.error}`, 200, { field: 'aikeys.key' });
    const label = String(d.label ?? '').trim().slice(0, 60);
    const { pos } = await env.DB.prepare('SELECT COALESCE(MAX(position), 0) AS pos FROM crm_ai_keys').first<{ pos: number }>() ?? { pos: 0 };
    await env.DB.prepare('INSERT INTO crm_ai_keys (id, position, label, credentials, fp, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), pos + 1, label, await encryptSecret(await installSecret(env.DB, 'mailbox_key'), apiKey), fp, nowIso()).run();
    forgetPool();
    return json(await state());
  }

  if (act === 'remove') {
    await env.DB.prepare('DELETE FROM crm_ai_keys WHERE id = ?').bind(String(d.id ?? '')).run();
    forgetPool();
    return json(await state());
  }

  /* Backups only: the main key is first because of where it lives. */
  if (act === 'move') {
    const { results } = await env.DB.prepare('SELECT id, position FROM crm_ai_keys ORDER BY position, created_at').all<{ id: string; position: number }>();
    const list = results ?? [];
    const i = list.findIndex(r => r.id === d.id);
    const j = d.dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= list.length) return json(await state());
    [list[i], list[j]] = [list[j], list[i]];
    await env.DB.batch(list.map((r, k) => env.DB.prepare('UPDATE crm_ai_keys SET position = ? WHERE id = ?').bind(k + 1, r.id)));
    forgetPool();
    return json(await state());
  }

  if (act === 'test') {
    const k = await poolKeyAt(env, Number(d.index ?? -1));
    if (!k) return fail('That key is no longer in the list.');
    const r = await probeAiKey(k.key);
    await recordTest(env, k, r.ok, r.ok ? 200 : r.status, r.ok ? '' : r.error);
    return json({ ...(await state()), tested: { ok: r.ok, error: r.ok ? '' : r.value.error } });
  }

  return fail(`"${act}" is not something this endpoint does.`);
}
