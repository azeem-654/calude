/**
 * Gemini, from the server.
 *
 * The app has a perfectly good Gemini client in src/lib/gemini.ts — and it is
 * unusable here, because the key it reads lives in the browser's localStorage.
 * That is the single reason AI replies could only happen with a tab open, and
 * why this exists rather than importing that.
 *
 * Deliberately small: one text call and a key check. Everything clever about
 * prompting stays where the prompt is written.
 *
 * The model chain matches the browser's. Google retires ids — 2.0 went while
 * this project was being built — so a 404 falls through to the next rather than
 * failing the request, which is the thing the client-side chain had to learn
 * the hard way.
 */
import { decryptSecret } from './crypto';
import { installSecret, type Env } from './db';

const BASE = 'https://generativelanguage.googleapis.com';
const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash'];

/** Google's wording when an id has been retired, in case the status is not 404. */
const MODEL_GONE = /no longer available|is not found|not supported for|deprecated/i;
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export interface AiResult {
  ok: boolean;
  text: string;
  error: string;
}

/** A workspace's AI key, decrypted. Null when none is set up. */
export async function loadAiKey(env: Env, accountId: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT api_key FROM crm_ai_config WHERE account_id = ?')
    .bind(accountId).first<{ api_key: string }>();
  if (!row?.api_key) return null;
  const key = await installSecret(env.DB, 'mailbox_key');
  const plain = await decryptSecret(key, row.api_key);
  return plain || null;
}

/**
 * One text completion, expecting JSON back.
 *
 * Returns a result rather than throwing. A reply that could not be drafted is
 * an ordinary outcome for this tick — the message stays unanswered and is tried
 * again — and an exception thrown from inside a loop over every workspace would
 * take the rest of them down with it.
 */
export async function askGemini(apiKey: string, prompt: string, temperature = 0.5): Promise<AiResult> {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature },
  };

  let lastError = '';
  for (const model of MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${BASE}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (e) {
        lastError = `Could not reach Google: ${e instanceof Error ? e.message : String(e)}`;
        break;
      }

      if (res.ok) {
        const data = await res.json<{ candidates?: { content?: { parts?: { text?: string }[] } }[] }>()
          .catch(() => ({}) as Record<string, never>);
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        /* Models sometimes wrap JSON in a fence despite being asked not to. */
        return { ok: true, text: text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim(), error: '' };
      }

      lastError = await res.text().catch(() => `HTTP ${res.status}`);
      if (res.status === 404 || MODEL_GONE.test(lastError)) break;   // this id is gone; next
      if (!RETRYABLE.has(res.status)) return { ok: false, text: '', error: friendly(res.status, lastError) };
      if (attempt < 2) await new Promise(r => setTimeout(r, 800));
    }
  }
  return { ok: false, text: '', error: friendly(0, lastError || 'every model failed') };
}

/** Turn Google's verbose error bodies into a sentence worth showing. */
function friendly(status: number, raw: string): string {
  let msg = raw;
  try { msg = (JSON.parse(raw) as { error?: { message?: string } })?.error?.message || raw; } catch { /* not JSON */ }
  if (status === 429) return 'The AI key has hit its rate limit or quota. Replies will resume when it resets.';
  if (/API[ _]KEY[ _]INVALID|API key not valid/i.test(raw)) {
    return 'The AI key was rejected. Check it in Settings → AI Engine.';
  }
  if (/SERVICE[ _]DISABLED|API[ _]KEY[ _]SERVICE[ _]BLOCKED/i.test(raw)) {
    return 'The Generative Language API is not enabled for this key\'s project.';
  }
  return msg.slice(0, 240) || 'The AI could not be reached.';
}

/**
 * Does this key work?
 *
 * ListModels rather than a generation, for the same reason the browser's check
 * uses it: it ties "is this key good?" to the key rather than to whether some
 * named model still exists, and it costs no quota.
 */
export async function verifyAiKey(apiKey: string): Promise<AiResult> {
  const k = (apiKey ?? '').trim();
  if (!k) return { ok: false, text: '', error: 'Enter an API key first.' };
  try {
    const r = await fetch(`${BASE}/v1beta/models?key=${encodeURIComponent(k)}&pageSize=1`);
    if (r.ok) return { ok: true, text: '', error: '' };
    return { ok: false, text: '', error: friendly(r.status, await r.text().catch(() => '')) };
  } catch (e) {
    return { ok: false, text: '', error: `Could not reach Google: ${e instanceof Error ? e.message : String(e)}` };
  }
}
