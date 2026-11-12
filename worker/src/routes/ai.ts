/**
 * /api/ai.php — the browser's AI calls, made from here.
 *
 * ── Why ──
 *
 * Nine older tools (review replies, inbox drafts, Social Creator, SEO, blog
 * planning and writing, pipeline and strategy suggestions, marketing plans)
 * called Gemini straight from the page, with an API key kept in the
 * browser's localStorage — readable by any script on the page, shared by
 * every workspace opened in that browser, and sent to Google in the URL. The
 * rule in CLAUDE.md is that every third-party call is made from the Worker.
 *
 * So the page sends the request body it always built, and this adds the key
 * (the workspace's own, else the operator's — `loadAiKey`), chooses the
 * model (`modelsFor`), and answers with Gemini's own response shape, so the
 * callers' parsing did not have to change.
 *
 * ── Limits ──
 *
 * Anyone signed in can reach this, and it spends the operator's quota, so it
 * is bounded: a request size, the fields that may be passed through (no tools
 * — web search costs extra and is used only where the server decides), and a
 * budget per workspace per hour and per day.
 *
 * AI Shorts' video analysis is the one exception left in the browser: it
 * uploads the video itself to Google's file store, which is far larger than a
 * Worker request may be.
 */
import { findPhi, phiRefusal } from '../lib/phiGuard';
import { fail, json } from '../lib/http';
import { canAccess, userFromToken, type Env } from '../lib/db';
import { cleanJob, jobMayFinish, jobTouch } from '../lib/aiJobs';
import { AI_BUSY, aiBase, forGemma, isGemma, jsonOnly, loadAiKey, modelsFor, trialRefusal } from '../lib/ai';
import { capRefusal, recordAiUse } from '../lib/aiUsage';
import { moduleOf, taskOf } from '../lib/aiTasks';
import { withFailover } from '../lib/aiPool';
import { isOpenRouterKey, askOpenRouter, fromGeminiRequest, asGeminiResponse } from '../lib/openrouter';
import { check as allowance, record, refusalBody } from '../lib/allowanceStore';

interface AiReq {
  token?: string;
  accountId?: string;
  action?: string;
  /** The product module asking (lib/aiTasks.ts MODULES): picks the models, and is counted under. */
  module?: string;
  /** A multi-call job's id (lib/aiJobs.ts): once started, it finishes past the month's allowance. */
  job?: string;
  request?: {
    contents?: unknown;
    generationConfig?: Record<string, unknown>;
    systemInstruction?: unknown;
  };
}

const MAX_BYTES = 6_000_000;
const CONFIG_KEYS = new Set(['temperature', 'topP', 'topK', 'maxOutputTokens', 'responseMimeType', 'responseSchema', 'candidateCount', 'stopSequences']);

/* The page waits 120 s (src/lib/gemini.ts aiFetch). Stop starting model
   attempts in time to answer before that, and never let one attempt run past
   it — otherwise a slow chain ends in the page's own "took too long" with the
   server still working, and the answer is thrown away. */
const ANSWER_BY_MS = 105_000;

export async function handleAi(req: Request, env: Env): Promise<Response> {
  const started = Date.now();
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return fail('That request is too large for the AI.', 413);
  let d: AiReq;
  try { d = JSON.parse(raw) as AiReq; } catch { return fail('That was not a valid request.'); }

  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this needs a current session.', 401, { code: 'unauthorised' });
  const accountId = String(d.accountId ?? '').trim();
  if (!accountId || !(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours.', 403);
  if (d.action !== 'generate') return fail('Unknown action.');

  const contents = d.request?.contents;
  if (!Array.isArray(contents) || !contents.length) return fail('There was nothing for the AI to read.');

  /* Patient details are never sent to the AI: the AI provider is not covered
     by a business associate agreement (docs/HIPAA-LAUNCH-BLOCKERS.md). Only
     the text parts are read — a picture's base64 is not text and could
     match a pattern by chance. */
  const said = contents.flatMap(c => {
    const parts = (c as { parts?: unknown })?.parts;
    return Array.isArray(parts) ? parts.map(p => (p as { text?: unknown })?.text).filter((t): t is string => typeof t === 'string') : [];
  }).join('\n');
  const phi = phiRefusal(findPhi(said), 'the AI');
  if (phi) return fail(phi, 200, { code: 'phi' });

  /* The owner's caps for this workspace (lib/aiUsage.ts) — the same ones the server routes use. */
  const capped = await capRefusal(env, accountId);
  if (capped) return fail(capped.message, 429, { code: capped.code });
  const module = moduleOf(d.module);
  const task = taskOf(module);

  const ended = await trialRefusal(env, accountId);
  if (ended) return fail(ended, 402, { code: 'trial_ended' });

  /* The plan's monthly AI requests. Asked here, counted below only once the
     AI has answered — a request Google refused was not a request served. */
  const room = await allowance(env, accountId, 'ai_requests', 1, {});
  /* A job the screen started inside the allowance finishes past it
     (lib/aiJobs.ts) and is told afterwards, with `creditsOut`. */
  const job = cleanJob(d.job);
  let creditsOut = '';
  if (!room.ok) {
    if (!(await jobMayFinish(env, accountId, job))) return fail(room.message, 402, refusalBody(room));
    creditsOut = room.message;
  }
  await jobTouch(env, accountId, job);

  const key = await loadAiKey(env, accountId);
  if (!key) return fail('The AI is not available on this install right now.', 200, { code: 'no_ai' });

  const generationConfig = Object.fromEntries(
    Object.entries(d.request?.generationConfig ?? {}).filter(([k]) => CONFIG_KEYS.has(k)),
  );
  const payload = JSON.stringify({
    contents,
    ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
    ...(d.request?.systemInstruction ? { systemInstruction: d.request.systemInstruction } : {}),
  });

  /* On each of the install's keys in turn while the failure is the key's —
     a limit, a refusal, Google down for it (lib/aiPool.ts) — so a customer
     is answered by the next key rather than shown the first one's error. */
  return withFailover<Response>(key, async k => {
    /* An OpenRouter key: the same request through its adapter, answered in Gemini's shape. */
    if (isOpenRouterKey(k)) {
      const q = fromGeminiRequest(JSON.parse(payload));
      if (!q) return { ok: false, status: -2, error: 'nothing to send', value: fail('There was nothing to ask the AI.') };
      const left = ANSWER_BY_MS - (Date.now() - started);
      if (left < 8_000) return { ok: false, status: -2, error: 'out of time', value: fail(AI_BUSY, 200, { code: 'ai_busy' }) };
      const r = await askOpenRouter(k, { ...q, timeoutMs: Math.min(40_000, left), task, module, accountId });
      if (r.ok) {
        await record(env, accountId, 'ai_requests', `ai-${crypto.randomUUID()}`, 1, room.standing);
        return { ok: true, value: json({ success: true, response: asGeminiResponse(r.value.text), ...(creditsOut ? { creditsOut } : {}) }) };
      }
      return { ok: false, status: r.status, error: r.error, value: fail(r.value.error) };
    }
    let lastStatus = -1; let lastError = '';
    for (const model of await modelsFor(k, task)) {
      const left = ANSWER_BY_MS - (Date.now() - started);
      /* -2: not this key's fault — nothing is rested, and the next key stops here too. */
      if (left < 8_000) return { ok: false, status: -2, error: 'out of time', value: fail(AI_BUSY, 200, { code: 'ai_busy' }) };
      let res: Response;
      /* Gemma takes the request without JSON mode or a system instruction (lib/ai.ts forGemma). */
      const gemma = isGemma(model);
      try {
        res = await fetch(`${aiBase()}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(k)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: gemma ? JSON.stringify(forGemma(JSON.parse(payload))) : payload, signal: AbortSignal.timeout(Math.min(40_000, left)),
        });
      } catch (e) {
        lastStatus = 0;
        lastError = e instanceof Error ? e.message : String(e);
        continue;
      }
      if (res.ok) {
        const answer = await res.json() as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } };
        /* Asked for JSON without JSON mode: the JSON out of whatever Gemma wrapped it in. */
        const wantedJson = (d.request?.generationConfig as { responseMimeType?: string } | undefined)?.responseMimeType === 'application/json';
        if (gemma && wantedJson) {
          const parts = (answer as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates?.[0]?.content?.parts;
          if (parts?.length) { const joined = parts.map(p => p.text ?? '').join(''); parts.splice(0, parts.length, { text: jsonOnly(joined) }); }
        }
        await recordAiUse({ provider: 'gemini', key: k, model, module, accountId, ok: true, status: 200, tokensIn: answer?.usageMetadata?.promptTokenCount, tokensOut: (answer?.usageMetadata?.candidatesTokenCount ?? 0) + (answer?.usageMetadata?.thoughtsTokenCount ?? 0) });
        await record(env, accountId, 'ai_requests', `ai-${crypto.randomUUID()}`, 1, room.standing);
        return { ok: true, value: json({ success: true, response: answer, ...(creditsOut ? { creditsOut } : {}) }) };
      }
      const prevStatus = lastStatus;
      lastStatus = res.status;
      lastError = await res.text().catch(() => '');
      if (res.status === 429) await recordAiUse({ provider: 'gemini', key: k, model, module, accountId, ok: false, status: 429 });
      /* The next model on a retired id or a busy one; anything else is the
         request's own fault and another model will say the same. */
      if (gemma && res.status === 400) { lastStatus = prevStatus; continue; }   // Gemma's own limit (lib/ai.ts isGemma); the next model, the earlier status kept
      if (![404, 429, 500, 502, 503, 504].includes(res.status) && !/no longer available|not found|not supported/i.test(lastError)) break;
    }
    let msg = lastError;
    try { msg = (JSON.parse(lastError) as { error?: { message?: string } }).error?.message || lastError; } catch { /* not JSON */ }
    return {
      ok: false, status: lastStatus, error: lastError,
      value: fail(lastStatus === 429 ? AI_BUSY : `The AI could not answer: ${msg.slice(0, 240) || 'no response'}`),
    };
  }, { exhausted: () => fail(AI_BUSY, 200, { code: 'ai_busy' }) });
}
