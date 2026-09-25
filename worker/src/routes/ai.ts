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
import { fail, json } from '../lib/http';
import { canAccess, userFromToken, type Env } from '../lib/db';
import { loadAiKey, modelsFor } from '../lib/ai';
import { rateLimit } from '../lib/rateLimit';

interface AiReq {
  token?: string;
  accountId?: string;
  action?: string;
  request?: {
    contents?: unknown;
    generationConfig?: Record<string, unknown>;
    systemInstruction?: unknown;
  };
}

const MAX_BYTES = 6_000_000;
const CONFIG_KEYS = new Set(['temperature', 'topP', 'topK', 'maxOutputTokens', 'responseMimeType', 'responseSchema', 'candidateCount', 'stopSequences']);

export async function handleAi(req: Request, env: Env): Promise<Response> {
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

  for (const [what, max, windowSeconds] of [['ai-hour', 120, 3600], ['ai-day', 800, 86_400]] as const) {
    const v = await rateLimit(env, { what, who: accountId, max, windowSeconds });
    if (!v.allowed) {
      return fail(`That is a lot of AI requests — try again in ${Math.max(1, Math.ceil(v.retryAfter / 60))} minutes.`, 429, { code: 'rate_limited' });
    }
  }

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

  let lastStatus = 0; let lastError = '';
  for (const model of await modelsFor(key)) {
    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, signal: AbortSignal.timeout(60_000),
      });
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      continue;
    }
    if (res.ok) return json({ success: true, response: await res.json() });
    lastStatus = res.status;
    lastError = await res.text().catch(() => '');
    /* The next model on a retired id or a busy one; anything else is the
       request's own fault and another model will say the same. */
    if (![404, 429, 500, 502, 503, 504].includes(res.status) && !/no longer available|not found|not supported/i.test(lastError)) break;
  }
  let msg = lastError;
  try { msg = (JSON.parse(lastError) as { error?: { message?: string } }).error?.message || lastError; } catch { /* not JSON */ }
  return fail(lastStatus === 429 ? 'The AI is busy right now. Try again in a minute.' : `The AI could not answer: ${msg.slice(0, 240) || 'no response'}`);
}
