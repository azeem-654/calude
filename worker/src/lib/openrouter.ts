/**
 * OpenRouter as a key in the AI pool.
 *
 * ── Why it is a key, not a second system ──
 *
 * Every server call already goes through `withFailover` on a list of keys
 * (lib/aiPool.ts). An OpenRouter key (`sk-or-…`) sits in that same list — a
 * backup key in Settings → Platform services → AI keys, or the
 * OPENROUTER_API_KEY secret — and when a call reaches it, it is asked here
 * instead of Google: the Gemini-shaped request (contents/parts,
 * systemInstruction, generationConfig) is turned into a chat completion and
 * the answer back into Gemini's shape, so the thirty-odd callers and the
 * browser's /api/ai.php are unchanged.
 *
 * ── Which models, asked rather than assumed ──
 *
 * CLAUDE.md: never hard-code a model id. OpenRouter's free list changes
 * weekly (2026-11: Gemma 4, Nemotron 3.5, Inkling …), so its public model
 * list is read (six hours per isolate) and the free ones that write text are
 * ranked: the ones that read pictures when the request carries one, never a
 * safety classifier, a code-only or a music model; families that write well
 * (Gemma, Nemotron Super/Ultra, DeepSeek, Llama 70B+, Qwen) first, then the
 * bigger context. A model that refuses this key's calls ("only available on
 * agentic harnesses" — Inkling, 2026-11) is skipped and remembered for six
 * hours. `openrouter/free` (OpenRouter's own router over its free models) is
 * last.
 *
 * ── What it cannot do, said rather than guessed ──
 *
 * Audio in a request, and Google's search grounding (researchWeb), are not
 * offered by the free models: such a call answers status −2 ("not this
 * key's kind of work"), which moves the pool on to the next key without
 * resting this one. The free tier allows about 50 requests a day (1,000 once
 * $10 of credit is bought) — a 429 that says so rests the key for an hour,
 * like Google's daily quota.
 */
import type { Attempt } from './aiPool';
import type { AiPart, AiResult } from './ai';
import { orRank, taskOf, TASKS, type AiTask } from './aiTasks';
import { recordAiUse } from './aiUsage';

const DEFAULT_BASE = 'https://openrouter.ai/api/v1';
let BASE = DEFAULT_BASE;
/** Tests point every call at a stand-in (`OPENROUTER_BASE`). */
export function adoptOpenRouterBase(base?: string): void { BASE = (base ?? '').trim() || DEFAULT_BASE; }

export const isOpenRouterKey = (k: string) => /^sk-or-/.test(k.trim());

/** The status meaning "this key cannot do this request" — next key, no rest (aiPool.classify). */
export const CANNOT = -2;

interface OrModel { id: string; context_length?: number; architecture?: { input_modalities?: string[]; output_modalities?: string[] }; pricing?: { prompt?: string; completion?: string } }
let modelCache: { at: number; list: OrModel[] } | null = null;

/* Not models for writing: classifiers, code-only, music, embeddings. */
const NOT_FOR_WRITING = /safety|guard|moderat|code|coder|lyria|embed|rerank|tts|whisper|audio-only/i;

/** Models that refused this install's calls, until when (ms). */
const refused = new Map<string, number>();
/* Families that write well, best first; anything else after them, by context. Families, not ids — the ids change. */
const GOOD = [/gemma-4-31b|gemma-4/i, /nemotron-3(\.\d)?-(ultra|super)/i, /deepseek/i, /llama-[34](\.\d)?-(70|90|405)b|llama-4/i, /qwen3|qwen-3/i, /mistral-(medium|large|small)/i, /gemma/i];
const rank = (id: string) => { const i = GOOD.findIndex(r => r.test(id)); return i < 0 ? GOOD.length : i; };

/**
 * The free models that write text, best first for the task (lib/aiTasks.ts:
 * its families first, then the general ranking); `vision` keeps the ones that
 * read pictures. Code-specialised models are kept out unless the task is code.
 */
export async function freeModels(vision: boolean, task: AiTask = 'write'): Promise<string[]> {
  if (!modelCache || Date.now() - modelCache.at > 6 * 3_600_000) {
    try {
      const r = await fetch(`${BASE}/models`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) modelCache = { at: Date.now(), list: ((await r.json<{ data?: OrModel[] }>()).data ?? []) };
    } catch { /* the list below, if any */ }
  }
  const list = (modelCache?.list ?? []).filter(m => m.id.endsWith(':free')
    && !(TASKS[task].code ? /safety|guard|moderat|lyria|embed|rerank|tts|whisper|audio-only/i : NOT_FOR_WRITING).test(m.id)
    && (m.architecture?.output_modalities ?? ['text']).includes('text')
    && (!vision || (m.architecture?.input_modalities ?? []).includes('image'))
    && !((refused.get(m.id) ?? 0) > Date.now()));
  list.sort((a, b) => orRank(task, a.id) - orRank(task, b.id) || rank(a.id) - rank(b.id) || (b.context_length ?? 0) - (a.context_length ?? 0));
  return [...list.slice(0, 3).map(m => m.id), 'openrouter/free'];
}

type ChatPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } } | { type: 'file'; file: { filename: string; file_data: string } };

/** Gemini parts → chat content. Null when a part is something the free models cannot take (audio, video). */
function toChat(parts: AiPart[]): { content: ChatPart[]; vision: boolean } | null {
  const content: ChatPart[] = [];
  let vision = false;
  for (const p of parts) {
    if ('text' in p) { content.push({ type: 'text', text: p.text }); continue; }
    const { mimeType, data } = p.inlineData;
    const url = `data:${mimeType};base64,${data}`;
    if (/^image\//.test(mimeType)) { content.push({ type: 'image_url', image_url: { url } }); vision = true; }
    else if (mimeType === 'application/pdf') content.push({ type: 'file', file: { filename: 'document.pdf', file_data: url } });
    else return null;
  }
  return { content, vision };
}

export interface OrRequest {
  parts: AiPart[];
  system?: string;
  temperature?: number;
  json?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
  /** Which models to prefer (lib/aiTasks.ts), and who to count the call against (lib/aiUsage.ts). */
  task?: AiTask;
  module?: string;
  accountId?: string;
}

/** One call on an OpenRouter key: the free models in turn while one is busy or gone. */
export async function askOpenRouter(apiKey: string, q: OrRequest): Promise<Attempt<AiResult>> {
  const failed = (status: number, raw: string, sentence: string): Attempt<AiResult> =>
    ({ ok: false, status, error: raw, value: { ok: false, text: '', error: sentence } });
  const chat = toChat(q.parts);
  if (!chat) return failed(CANNOT, 'audio or video in the request', 'The backup AI (OpenRouter) cannot listen to recordings.');
  let lastStatus = -1, lastError = '';
  for (const model of await freeModels(chat.vision, q.task ?? (q.module ? taskOf(q.module) : chat.vision ? 'vision' : 'write'))) {
    let res: Response;
    try {
      res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'Protected Central' },
        body: JSON.stringify({
          model,
          messages: [...(q.system ? [{ role: 'system', content: q.system }] : []), { role: 'user', content: chat.content }],
          temperature: q.temperature ?? 0.5,
          ...(q.maxTokens ? { max_tokens: q.maxTokens } : {}),
          ...(q.json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: AbortSignal.timeout(q.timeoutMs ?? 60_000),
      });
    } catch (e) {
      lastStatus = 0; lastError = e instanceof Error ? e.message : String(e);
      continue;
    }
    const raw = await res.text();
    let data: { choices?: { message?: { content?: string | null } }[]; error?: { code?: number; message?: string }; usage?: { prompt_tokens?: number; completion_tokens?: number } } = {};
    try { data = JSON.parse(raw) as typeof data; } catch { /* not JSON */ }
    /* OpenRouter can answer 200 with an error inside (an upstream refused). */
    const text = data.choices?.[0]?.message?.content ?? '';
    const okAnswer = res.ok && !data.error && !!text;
    /* Every request counts against OpenRouter's free daily allowance, answered or not. */
    await recordAiUse({ provider: 'openrouter', key: apiKey, model, module: q.module, accountId: q.accountId, ok: okAnswer, status: okAnswer ? 200 : (res.ok ? (data.error?.code ?? 502) : res.status), tokensIn: data.usage?.prompt_tokens, tokensOut: data.usage?.completion_tokens });
    if (res.ok && !data.error && text) {
      const clean = q.json ? text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim() : text.trim();
      return { ok: true, value: { ok: true, text: clean, error: '' } };
    }
    lastStatus = res.ok ? (data.error?.code ?? 502) : res.status;
    lastError = data.error?.message || raw.slice(0, 400) || `HTTP ${res.status}`;
    /* The key's own fault (refused, out of its daily free requests, no credit): no other model will differ. */
    if (lastStatus === 401 || lastStatus === 402 || /per-day|per day|daily/i.test(lastError)) break;
    /* This model will not serve this key (403, "only available on …", gone): skip it for a while, try the next. */
    if (lastStatus === 403 || lastStatus === 404 || /only available|not available|no endpoints/i.test(lastError)) refused.set(model, Date.now() + 6 * 3_600_000);
  }
  const sentence = lastStatus === 429 ? 'The backup AI is busy or out of free requests for today.'
    : lastStatus === 401 || lastStatus === 403 ? 'The OpenRouter key was refused — check it in AI keys.'
      : `The backup AI could not answer: ${lastError.slice(0, 200)}`;
  return failed(lastStatus, lastError, sentence);
}

/** Gemini's request body (as the browser sends it through /api/ai.php) → an OpenRouter call. */
export function fromGeminiRequest(body: { contents?: unknown; generationConfig?: Record<string, unknown>; systemInstruction?: unknown }): OrRequest | null {
  const parts: AiPart[] = [];
  const contents = Array.isArray(body.contents) ? body.contents : [body.contents];
  for (const c of contents as { parts?: AiPart[] }[]) for (const p of c?.parts ?? []) {
    if (p && typeof p === 'object' && ('text' in p || 'inlineData' in p)) parts.push(p);
  }
  if (!parts.length) return null;
  const sys = body.systemInstruction as { parts?: { text?: string }[] } | string | undefined;
  const system = typeof sys === 'string' ? sys : (sys?.parts ?? []).map(p => p.text ?? '').join('\n');
  const g = body.generationConfig ?? {};
  return {
    parts, system: system || undefined,
    temperature: typeof g.temperature === 'number' ? g.temperature : undefined,
    maxTokens: typeof g.maxOutputTokens === 'number' ? g.maxOutputTokens : undefined,
    json: g.responseMimeType === 'application/json',
  };
}

/** An OpenRouter answer in Gemini's response shape, for a browser that reads `candidates[0].content.parts`. */
export const asGeminiResponse = (text: string) => ({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }] });

/** "Test" on the owner's AI keys screen: OpenRouter says whether the key is real, at no cost. */
export async function verifyOpenRouterKey(apiKey: string): Promise<AiResult> {
  try {
    const r = await fetch(`${BASE}/key`, { headers: { Authorization: `Bearer ${apiKey.trim()}` }, signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const d = (await r.json<{ data?: { is_free_tier?: boolean; limit_remaining?: number | null } }>()).data ?? {};
      return { ok: true, text: d.is_free_tier ? 'OpenRouter key works (free tier — about 50 free-model requests a day).' : 'OpenRouter key works.', error: '' };
    }
    return { ok: false, text: '', error: r.status === 401 || r.status === 403 ? 'OpenRouter refused this key.' : `OpenRouter answered ${r.status}.` };
  } catch (e) {
    return { ok: false, text: '', error: `Could not reach OpenRouter: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** OpenRouter's own account of a key — what it has spent, its limit, whether it is on the free tier — for the usage dashboard. */
export async function openRouterKeyInfo(apiKey: string): Promise<{ ok: boolean; freeTier: boolean | null; usage: number | null; limit: number | null; remaining: number | null; error: string }> {
  try {
    const r = await fetch(`${BASE}/key`, { headers: { Authorization: `Bearer ${apiKey.trim()}` }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { ok: false, freeTier: null, usage: null, limit: null, remaining: null, error: `OpenRouter answered ${r.status}.` };
    const d = (await r.json<{ data?: { is_free_tier?: boolean; usage?: number; limit?: number | null; limit_remaining?: number | null } }>()).data ?? {};
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    return { ok: true, freeTier: typeof d.is_free_tier === 'boolean' ? d.is_free_tier : null, usage: num(d.usage), limit: num(d.limit), remaining: num(d.limit_remaining), error: '' };
  } catch (e) {
    return { ok: false, freeTier: null, usage: null, limit: null, remaining: null, error: `Could not reach OpenRouter: ${e instanceof Error ? e.message : String(e)}` };
  }
}
