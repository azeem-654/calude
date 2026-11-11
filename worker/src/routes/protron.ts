/**
 * /api/protron.php — what Protron keeps on the server, and its voice.
 *
 * ── load / save / clear: the conversation, on every device ──
 *
 * The conversation used to live only in one browser. Kept here, one row per
 * person per workspace (migration 0094), it follows somebody from the laptop
 * to the phone. The browser still keeps its own copy, so the panel opens
 * instantly and works offline; whichever copy is newer wins when it loads.
 *
 * The person is the session's, never the request's: a body cannot name
 * somebody else's email, and the workspace is checked with `canAccess` like
 * every other route that names one.
 *
 * ── audit: what Protron did, on the record ──
 *
 * Every action that ran, failed, was refused or was cancelled is a row in
 * `crm_audit_events` (kind `protron_action`) — the same trail sign-ins and
 * operator changes write to, so "who added that pipeline?" has an answer
 * that is not in somebody's browser. Only the action's name, its outcome and
 * a sentence; never the conversation.
 *
 * ── speak: the commander voice ──
 *
 * Text in, 24 kHz 16-bit PCM out, from a Gemini speech model chosen from the
 * key's own model list (nothing names a model id). The browser runs it
 * through its robot filter (services/protron/voice.ts). Each reply spoken is
 * one AI request against the plan and the owner's caps, like any other; an
 * OpenRouter-only install has no speech model, says so, and the browser falls
 * back to its own voice.
 */
import { fail, json, ok } from '../lib/http';
import { canAccess, userFromToken, type Env } from '../lib/db';
import { recordAuthEvent, origin } from '../lib/audit';
import { aiBase, geminiNames, loadAiKey, trialRefusal } from '../lib/ai';
import { capRefusal, recordAiUse } from '../lib/aiUsage';
import { withFailover } from '../lib/aiPool';
import { isOpenRouterKey } from '../lib/openrouter';
import { findPhi, phiRefusal } from '../lib/phiGuard';
import { check as allowance, record, refusalBody } from '../lib/allowanceStore';

const MAX_TURNS_BYTES = 200_000;
const MAX_PREFS_BYTES = 4_000;
const MAX_SPEAK = 900;
const STATUSES = new Set(['done', 'failed', 'cancelled', 'refused']);
/** Prefs that follow a person. The launcher's spot belongs to the screen it was dragged on. */
const PREF_KEYS = new Set(['proactive', 'speak', 'voice', 'idleSeconds', 'business']);

/**
 * The voice the model is asked for. A prebuilt voice's name, not a model id;
 * the direction is a style, not anybody's voice.
 */
const VOICE_NAME = 'Algenib';
const VOICE_DIRECTION = 'Read this aloud as a calm, noble robot commander: a deep, slow, resonant voice, warm and certain, every word clear. Read only the text after the colon:';

/** A speech model from the key's own list: Flash before Pro, the newest name first. */
export function pickSpeechModel(names: string[]): string | null {
  const tts = names.filter(n => /tts/i.test(n)).sort((a, b) => b.localeCompare(a));
  return tts.find(n => /flash/i.test(n)) ?? tts[0] ?? null;
}

export async function handleProtron(req: Request, env: Env): Promise<Response> {
  let d: Record<string, unknown>;
  try { d = await req.json() as Record<string, unknown>; } catch { return fail('That was not a valid request.'); }
  const user = await userFromToken(env.DB, String(d.token ?? ''));
  if (!user) return fail('Sign in again — this needs a current session.', 401, { code: 'unauthorised' });
  const accountId = String(d.accountId ?? '').trim();
  if (!accountId || !(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours.', 403);
  const action = String(d.action ?? '');

  if (action === 'load') {
    const row = await env.DB.prepare('SELECT turns, prefs, updated_at FROM crm_protron_threads WHERE account_id = ? AND user_email = ?')
      .bind(accountId, user.email).first<{ turns: string; prefs: string; updated_at: number }>();
    let turns: unknown = [];
    let prefs: unknown = {};
    try { turns = JSON.parse(row?.turns ?? '[]'); } catch { turns = []; }
    try { prefs = JSON.parse(row?.prefs ?? '{}'); } catch { prefs = {}; }
    return json({ success: true, turns: Array.isArray(turns) ? turns : [], prefs, updatedAt: row?.updated_at ?? 0 });
  }

  if (action === 'save') {
    const turns = Array.isArray(d.turns) ? d.turns.slice(-60) : null;
    if (!turns) return fail('There was no conversation to keep.');
    const turnsText = JSON.stringify(turns);
    if (turnsText.length > MAX_TURNS_BYTES) return fail('That conversation is too long to keep. Clear it and start a new one.', 413);
    const rawPrefs = d.prefs && typeof d.prefs === 'object' && !Array.isArray(d.prefs) ? d.prefs as Record<string, unknown> : null;
    const prefs = rawPrefs ? Object.fromEntries(Object.entries(rawPrefs).filter(([k]) => PREF_KEYS.has(k))) : null;
    const prefsText = prefs ? JSON.stringify(prefs) : null;
    if (prefsText && prefsText.length > MAX_PREFS_BYTES) return fail('Those settings are too long to keep.', 413);
    const at = Date.now();
    await env.DB.prepare(
      `INSERT INTO crm_protron_threads (account_id, user_email, turns, prefs, updated_at) VALUES (?,?,?,?,?)
       ON CONFLICT (account_id, user_email) DO UPDATE SET turns = excluded.turns,
         prefs = CASE WHEN ? IS NULL THEN crm_protron_threads.prefs ELSE excluded.prefs END, updated_at = excluded.updated_at`,
    ).bind(accountId, user.email, turnsText, prefsText ?? '{}', at, prefsText).run();
    return ok({ updatedAt: at });
  }

  if (action === 'clear') {
    await env.DB.prepare('DELETE FROM crm_protron_threads WHERE account_id = ? AND user_email = ?').bind(accountId, user.email).run();
    return ok({ updatedAt: Date.now() });
  }

  if (action === 'audit') {
    const name = String(d.name ?? '');
    const status = String(d.status ?? '');
    if (!/^[a-z_]{2,40}$/.test(name)) return fail('That is not one of Protron\'s actions.');
    if (!STATUSES.has(status)) return fail('That is not an outcome.');
    const title = String(d.title ?? name).replace(/\p{Cc}/gu, ' ').slice(0, 60);
    const said = String(d.detail ?? '').replace(/\p{Cc}/gu, ' ').slice(0, 120);
    await recordAuthEvent(env, {
      email: user.email, kind: 'protron_action', accountId,
      detail: `${title} (${name}): ${status}${said ? ` — ${said}` : ''}`, ...origin(req),
    });
    return ok();
  }

  if (action === 'speak') {
    const text = String(d.text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_SPEAK);
    if (!text) return fail('There was nothing to say.');
    const phi = phiRefusal(findPhi(text), 'the voice');
    if (phi) return fail(phi, 200, { code: 'phi' });
    const capped = await capRefusal(env, accountId);
    if (capped) return fail(capped.message, 429, { code: capped.code });
    const ended = await trialRefusal(env, accountId);
    if (ended) return fail(ended, 402, { code: 'trial_ended' });
    const room = await allowance(env, accountId, 'ai_requests', 1, {});
    if (!room.ok) return fail(room.message, 402, refusalBody(room));
    const key = await loadAiKey(env, accountId);
    if (!key) return fail('The AI is not available on this install right now.', 200, { code: 'no_ai' });

    return withFailover<Response>(key, async k => {
      if (isOpenRouterKey(k)) return { ok: false, status: -2, error: 'no speech on OpenRouter', value: fail('No AI voice is connected — Protron uses the browser\'s voice.', 200, { code: 'no_voice' }) };
      const model = pickSpeechModel(await geminiNames(k) ?? []);
      if (!model) return { ok: false, status: -2, error: 'no speech model', value: fail('No AI voice is available on this key — Protron uses the browser\'s voice.', 200, { code: 'no_voice' }) };
      let res: Response;
      try {
        res = await fetch(`${aiBase()}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(k)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30_000),
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${VOICE_DIRECTION} ${text}` }] }],
            generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_NAME } } } },
          }),
        });
      } catch (e) {
        return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e), value: fail('The voice could not be reached.') };
      }
      if (!res.ok) {
        const err = await res.text().catch(() => '');
        if (res.status === 429) await recordAiUse({ provider: 'gemini', key: k, model, module: 'protron-voice', accountId, ok: false, status: 429 });
        return { ok: false, status: res.status, error: err, value: fail(res.status === 429 ? 'The voice is busy right now.' : 'The voice could not speak that.', 200, { code: 'voice_failed' }) };
      }
      const body = await res.json() as { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
      const part = (body.candidates?.[0]?.content?.parts ?? []).find(p => p.inlineData?.data);
      if (!part?.inlineData?.data) return { ok: false, status: -2, error: 'no audio', value: fail('The voice gave no audio.', 200, { code: 'voice_failed' }) };
      await recordAiUse({ provider: 'gemini', key: k, model, module: 'protron-voice', accountId, ok: true, status: 200, tokensIn: body.usageMetadata?.promptTokenCount, tokensOut: body.usageMetadata?.candidatesTokenCount });
      await record(env, accountId, 'ai_requests', `ai-${crypto.randomUUID()}`, 1, room.standing);
      const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType ?? '')?.[1] ?? 24000);
      return { ok: true, value: json({ success: true, audio: part.inlineData.data, rate }) };
    });
  }

  return fail('Unknown action.');
}
