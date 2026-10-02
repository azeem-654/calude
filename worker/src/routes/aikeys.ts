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
import { encryptSecret } from '../lib/crypto';
import { adoptAiBase, probeAiKey, verifyAiKey } from '../lib/ai';
import { describePool, fingerprint, forgetPool, installPool, poolKeyAt, recordTest } from '../lib/aiPool';

interface Req { token?: string; action?: string; apiKey?: string; label?: string; id?: string; index?: number; dir?: string }

const isOwner = (u: SessionUser) => u.role === 'agency' && !u.accountId;
const MAX_BACKUPS = 10;

export async function handleAiKeys(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this needs a current session.', 401, { code: 'unauthorised' });
  if (!isOwner(user)) return fail('Only the owner of this installation manages its AI keys.', 403, { code: 'not_owner' });
  adoptAiBase(env);
  const act = String(d.action ?? 'status');
  const state = async () => ({ success: true, keys: await describePool(env) });

  if (act === 'status') return json(await state());

  if (act === 'add') {
    const apiKey = String(d.apiKey ?? '').trim();
    if (!apiKey) return fail('Paste the API key first.', 200, { field: 'aikeys.key' });
    if (!/^AIza[0-9A-Za-z_-]{30,}$/.test(apiKey)) {
      return fail('That does not look like a Google AI key — they start "AIza". Make one at aistudio.google.com → Get API key.', 200, { field: 'aikeys.key' });
    }
    const fp = await fingerprint(apiKey);
    const already = (await installPool(env)).some(k => k.fp === fp);
    if (already) return fail('That key is already in the list.', 200, { field: 'aikeys.key' });
    const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM crm_ai_keys').first<{ n: number }>() ?? { n: 0 };
    if (n >= MAX_BACKUPS) return fail(`Up to ${MAX_BACKUPS} backup keys. Remove one first.`);
    /* Proved before it is kept: a mistyped key in the pool is a failure
       waiting for the moment the main key needs it. */
    const v = await verifyAiKey(apiKey);
    if (!v.ok) return fail(`Google refused that key: ${v.error}`, 200, { field: 'aikeys.key' });
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
