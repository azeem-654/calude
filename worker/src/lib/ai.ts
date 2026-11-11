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
import { fingerprint, installPool, remember, withFailover, type Attempt } from './aiPool';
import { isOpenRouterKey, askOpenRouter, verifyOpenRouterKey, adoptOpenRouterBase } from './openrouter';
import { TRIAL_ENDED_MESSAGE, trialForWorkspace } from './trial';
import { take as takeAllowance } from './allowanceStore';
import { cleanJob, jobMayFinish, jobTouch } from './aiJobs';
import { chainFor, guessTask, taskOf, type AiTask } from './aiTasks';
import { adoptUsageEnv, capRefusal, freeFirst, recordAiUse } from './aiUsage';

const GOOGLE = 'https://generativelanguage.googleapis.com';
/* `GEMINI_BASE` points every call at a stand-in, for tests only — set from
   the first `env` this isolate sees, since the callers below are handed a
   key and not an env (test/aikeys.e2e.mjs). */
let BASE = GOOGLE;
export function adoptAiBase(env: Env): void { BASE = (env.GEMINI_BASE ?? '').trim() || GOOGLE; adoptOpenRouterBase(env.OPENROUTER_BASE); adoptUsageEnv(env); }
export const aiBase = () => BASE;

/*
 * ── Which models, asked rather than assumed ──
 *
 * This used to be a fixed list — 3.5-flash-lite, 3.5-flash, 2.5-flash — and a
 * fixed list is a date. Google retires ids and adds new ones; by 2026-09-24
 * the first two did not exist on the operator's key and the third answered
 * "no longer available to new users", so every AI call in the product failed
 * at once, voice notes included, with an error telling the customer to update
 * their code.
 *
 * So the key is asked which models it can use (ListModels, once per Worker
 * instance per key, for six hours), and the newest Gemini Flash models are
 * chosen: the lite one first, because these calls are short and speed is what
 * a waiting person notices, then the full one, then the next newest. The fixed
 * list is only the fallback for when the listing itself cannot be read, and
 * ends in Google's own `-latest` aliases, which follow their releases.
 */
const FALLBACK_MODELS = ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-3.6-flash', 'gemini-2.5-flash'];

/** Newest first: "3.6" before "3.5" before "2.5"; lite before full within a version. */
export function pickModels(names: string[]): string[] {
  const parsed = names
    .map(n => n.replace(/^models\//, ''))
    /* A pinned build ("-001") is the same model as its plain name: taken too, so an
       upgrade Google ships under a numbered id is still found (plain name first). */
    .map(n => ({ n, m: /^gemini-(\d+(?:\.\d+)?)-flash(-lite)?(-\d{3})?(-preview(?:-[\w-]+)?)?$/.exec(n) }))
    .filter((x): x is { n: string; m: RegExpExecArray } => !!x.m)
    .map(x => ({ name: x.n, version: parseFloat(x.m[1]), lite: !!x.m[2], pinned: !!x.m[3], preview: !!x.m[4] }))
    .sort((a, b) => Number(a.pinned) - Number(b.pinned))
    .filter((x, i, all) => !x.pinned || !all.some((y, j) => j < i && !y.pinned && y.version === x.version && y.lite === x.lite && y.preview === x.preview));
  const stable = parsed.filter(p => !p.preview);
  const pool = stable.length ? stable : parsed;
  pool.sort((a, b) => (b.version - a.version) || (Number(b.lite) - Number(a.lite)));
  const out: string[] = [];
  const newest = pool[0]?.version;
  for (const p of pool.filter(x => x.version === newest)) out.push(p.name);
  const older = pool.find(p => p.version !== newest && !p.lite) ?? pool.find(p => p.version !== newest);
  if (older) out.push(older.name);
  return out.slice(0, 3);
}

/** The key's own model list (ListModels), once per isolate per key for six hours; null when it cannot be read. */
const namesCache = new Map<string, { at: number; names: string[] }>();
export async function geminiNames(apiKey: string): Promise<string[] | null> {
  const hit = namesCache.get(apiKey);
  if (hit && Date.now() - hit.at < 6 * 3_600_000) return hit.names;
  try {
    const res = await fetch(`${BASE}/v1beta/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json<{ models?: { name?: string; supportedGenerationMethods?: string[] }[] }>();
    const names = (data.models ?? [])
      .filter(m => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map(m => String(m.name ?? '').replace(/^models\//, ''));
    namesCache.set(apiKey, { at: Date.now(), names });
    return names;
  } catch { return null; }
}

/**
 * The models to ask, in order, for a task (lib/aiTasks.ts): the newest of
 * each tier the task wants, from the key's own list; a model already at
 * today's free limit on this key goes last (lib/aiUsage.ts). Without a task,
 * the old order — newest Flash Lite first — which is the "chat" task.
 */
export async function modelsFor(apiKey: string, task: AiTask = 'chat'): Promise<string[]> {
  const names = await geminiNames(apiKey);
  let models: string[] = FALLBACK_MODELS;
  if (names) {
    const chain = chainFor(names, task);
    const picked = pickModels(names);
    /* The task's chain first, then the general newest-Flash list, then Google's -latest aliases. */
    const all = [...chain, ...picked, ...FALLBACK_MODELS.filter(f => f.endsWith('-latest'))].filter((m, i, a) => a.indexOf(m) === i);
    if (chain.length || picked.length) models = all;
  }
  return freeFirst(apiKey, models);
}

/** Google's wording when an id has been retired, in case the status is not 404. */
const MODEL_GONE = /no longer available|is not found|not supported for|deprecated/i;
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export interface AiResult {
  ok: boolean;
  text: string;
  error: string;
  /** Pages a web-searching answer cited (OpenRouter's web plugin). */
  sources?: { title: string; uri: string }[];
}

/**
 * What a customer reads when every AI key failed for a reason that was the
 * key's — a spent quota, mostly. Never a provider's name or "add a key": the
 * keys are the operator's, and the customer was told AI is included
 * (lib/aiPool.ts `withFailover` `exhausted`). The owner is mailed the real
 * reason at the same moment.
 */
export const AI_BUSY = 'Our AI is at capacity for a few minutes. This is on our side, not yours — please try again shortly; scheduled work retries by itself.';

/** A workspace's AI key, decrypted. Null when none is set up. */
/**
 * The key this workspace writes with.
 *
 * ── Three places, in this order, and the order is the policy ──
 *
 * 1. The workspace's own key. A customer who brings one keeps their own quota,
 *    their own billing relationship and their own rate limits, and nothing the
 *    operator does can exhaust it.
 * 2. The operator's key, held once for the whole install. This is what makes
 *    "no AI key needed" a true statement rather than a marketing one: without
 *    it, every workspace that had not connected a key could plan and produce
 *    nothing, and the product would have been advertising a capability it did
 *    not have.
 * 3. `env.AI_API_KEY`, for a deployment that would rather keep the key in
 *    Cloudflare's secret store than in its own database.
 *
 * The fallback is deliberately *below* the workspace key rather than above it.
 * A customer who went to the trouble of connecting their own expects it to be
 * the one used, and silently spending the operator's instead would be both a
 * surprise and a bill nobody agreed to.
 */
export async function loadAiKey(env: Env, accountId: string): Promise<string | null> {
  adoptAiBase(env);
  const key = await installSecret(env.DB, 'mailbox_key');

  let own = '';
  const row = await env.DB.prepare('SELECT api_key FROM crm_ai_config WHERE account_id = ?')
    .bind(accountId).first<{ api_key: string }>();
  if (row?.api_key) {
    try { own = (await decryptSecret(key, row.api_key)) || ''; } catch { /* unreadable blob: fall through rather than fail the whole tick */ }
  }

  /* The operator's key is part of what the trial gives. Once it has ended and
     nothing is paid, it is not spent on this workspace — by a screen or by a
     cron run, both of which arrive here (lib/trial.ts). Their own key, if
     they brought one, still is, alone. */
  const ended = (await trialForWorkspace(env, accountId).catch(() => null))?.kind === 'ended';
  const pool = ended ? [] : await installPool(env);
  /* Their own key first; the operator's keys behind it, so a customer whose
     key runs out mid-sentence is answered rather than shown an error
     (lib/aiPool.ts). The returned key carries the rest through withFailover. */
  const keys = own ? [{ key: own, fp: await fingerprint(own), source: 'workspace' as const, label: 'Workspace key' }, ...pool.filter(k => k.key !== own)] : pool;
  return remember(env, keys);
}

/**
 * The operator's own key, shared by every workspace that has not brought one.
 *
 * ── Why it reads the owner's own settings screen ──
 *
 * Because that is where they already put it. Settings → AI Engine writes to
 * `crm_ai_config` for whichever workspace is active, and the install owner has
 * one like everybody else — so asking them to enter the same key a second time
 * into a second box, to make it install-wide, would be a chore invented by the
 * database layout rather than by anything real.
 *
 * `hasInstallOwner` defines the owner as the single `crm_users` row with no
 * account of its own, and `crm_workspaces.owner_email` says which workspaces
 * are theirs. So: the owner's workspaces, whichever of them holds a key that
 * has not most recently failed.
 *
 * ── What this costs, and why it is still right ──
 *
 * Every sub-account that has not brought a key now spends the owner's quota.
 * That is the deal being made deliberately — the product tells customers the
 * writing is included — but it is worth knowing that the bill scales with
 * customers, and that a customer who connects their own key is preferred over
 * this on purpose.
 *
 * `env.AI_API_KEY` is last and is the escape hatch for a deployment that would
 * rather keep the key in Cloudflare's secret store than in its own database.
 */
export async function installAiKey(env: Env): Promise<string | null> {
  adoptAiBase(env);
  /* The reading itself — the installation key, the owner's AI Engine key,
     the backups, AI_API_KEY — is lib/aiPool.ts, in that order. */
  return remember(env, await installPool(env));
}

/**
 * One text completion, expecting JSON back.
 *
 * Returns a result rather than throwing. A reply that could not be drafted is
 * an ordinary outcome for this tick — the message stays unanswered and is tried
 * again — and an exception thrown from inside a loop over every workspace would
 * take the rest of them down with it.
 */
export async function askGemini(apiKey: string, prompt: string, temperature = 0.5, opts: AskOpts = {}): Promise<AiResult> {
  return askGeminiParts(apiKey, [{ text: prompt }], temperature, opts);
}

/**
 * `module` names the product module (lib/aiTasks.ts MODULES) — it picks the
 * models and is what the usage dashboard counts under; `task` overrides the
 * module's task; `accountId` is the workspace, for its caps and its line on
 * the dashboard. A call naming neither is "general" (a picture: vision).
 */
export interface AskOpts { json?: boolean; fast?: boolean; timeoutMs?: number; task?: AiTask; module?: string; accountId?: string }

/**
 * One piece of what the model is shown: words, or a file carried inline.
 *
 * Inline rather than uploaded through Google's file API, because there is no
 * file store in this deployment to hold the upload's handle between the two
 * calls, and every file the wizard sends is small enough to ride in the request
 * — a photo, a PDF brochure, thirty seconds of somebody speaking.
 */
export type AiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

/**
 * The same call as `askGemini`, with images, PDFs or audio alongside the text.
 *
 * This is what lets the New Project wizard read the brochure somebody attached
 * and transcribe what they said into the microphone on the key the operator
 * already holds — rather than adding a speech service, a second bill and a
 * second place a customer's words are sent.
 *
 * `json: false` returns the text as written, for a transcript that should not
 * be squeezed through a JSON encoder somebody's model might get wrong.
 */
/**
 * `fast`: for work that needs no reasoning — transcribing a recording is
 * copying, not thinking. The Gemini 2.5+ models "think" before answering by
 * default, which on a ten-second voice note was most of the wait. It is
 * switched down per model family (a budget of 0 on 2.5, the lowest level on
 * newer ones); a model that refuses the setting is simply asked again without
 * it, so this can only ever make a call faster, never make it fail.
 *
 * `timeoutMs`: how long one model gets before the next is tried. Without it a
 * slow or stuck model held the whole request for as long as Google took.
 */
function thinkingFor(model: string): Record<string, unknown> {
  return /^gemini-2\./.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: 'low' };
}

export async function askGeminiParts(
  apiKey: string, parts: AiPart[], temperature = 0.5, opts: AskOpts = {},
): Promise<AiResult> {
  const o = { ...opts, task: opts.task ?? (opts.module ? taskOf(opts.module) : guessTask(parts)) };
  /* On each of the install's keys in turn, while the failure is the key's
     (lib/aiPool.ts). */
  return withFailover(apiKey, k => askGeminiOnce(k, parts, temperature, o), { exhausted: (): AiResult => ({ ok: false, text: '', error: AI_BUSY }) });
}

/** A file already uploaded to Google's Files API on the key being asked (askGeminiAboutFile only). */
type GeminiPart = AiPart | { fileData: { mimeType?: string; fileUri: string } };

async function askGeminiOnce(
  apiKey: string, parts: GeminiPart[], temperature: number, opts: AskOpts,
): Promise<Attempt<AiResult>> {
  /* An OpenRouter key in the pool is asked through its own adapter (lib/openrouter.ts). */
  if (isOpenRouterKey(apiKey)) return askOpenRouter(apiKey, { parts: parts.filter((x): x is AiPart => !('fileData' in x)), temperature, json: opts.json !== false, timeoutMs: opts.timeoutMs, task: opts.task, module: opts.module, accountId: opts.accountId });
  const use = (model: string, ok: boolean, status: number, meta?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }) =>
    recordAiUse({ provider: 'gemini', key: apiKey, model, module: opts.module, accountId: opts.accountId, ok, status, tokensIn: meta?.promptTokenCount, tokensOut: (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0) });
  const failed = (status: number, raw: string): Attempt<AiResult> =>
    ({ ok: false, status, error: raw, value: { ok: false, text: '', error: friendly(status, raw) } });
  const asJson = opts.json !== false;
  const base = asJson ? { responseMimeType: 'application/json', temperature } : { temperature };

  let lastError = '';
  let lastStatus = -1;   // -1: no model answered at all — none of this key's ids exist
  for (const model of await modelsFor(apiKey, opts.task)) {
    let thinking = !!opts.fast;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const body = {
        contents: [{ parts }],
        generationConfig: thinking ? { ...base, thinkingConfig: thinkingFor(model) } : base,
      };
      let res: Response;
      try {
        res = await fetch(`${BASE}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          /* A default, so no caller can wait on a model forever (the audit
             found a dozen with none); withFailover bounds the walk. */
          signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
        });
      } catch (e) {
        const timedOut = e instanceof Error && /abort|timeout/i.test(`${e.name} ${e.message}`);
        lastError = timedOut ? `${model} took too long` : `Could not reach Google: ${e instanceof Error ? e.message : String(e)}`;
        lastStatus = 0;
        break;
      }

      if (res.ok) {
        const data = await res.json<{ candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } }>()
          .catch(() => ({}) as Record<string, never>);
        await use(model, true, 200, data.usageMetadata);
        const text = (data.candidates?.[0]?.content?.parts ?? []).map(p => p.text ?? '').join('');
        /* Models sometimes wrap JSON in a fence despite being asked not to. */
        return {
          ok: true,
          value: {
            ok: true,
            text: asJson ? text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim() : text.trim(),
            error: '',
          },
        };
      }

      lastError = await res.text().catch(() => `HTTP ${res.status}`);
      if (res.status === 404 || MODEL_GONE.test(lastError)) break;   // this id is gone; next
      lastStatus = res.status;
      /* A refusal is counted too: the 429s are how the dashboard shows a free limit being hit. */
      if (res.status === 429) await use(model, false, 429);
      /* The thinking setting refused: the same model, without it. */
      if (thinking && res.status === 400 && /thinking/i.test(lastError)) { thinking = false; attempt--; continue; }
      if (!RETRYABLE.has(res.status)) return failed(res.status, lastError);
      if (attempt < 2) await new Promise(r => setTimeout(r, 800));
    }
  }
  return failed(lastStatus, lastError || 'every model failed');
}

/**
 * A video the model watches, on the install's keys.
 *
 * ── Why the Files API, and why per key ──
 *
 * Quick Shorts sends whole recordings, far past what rides inline in a
 * request (AiPart's `inlineData`). Google's Files API takes them — but a file
 * uploaded with one key can be read only by that key's project, so the upload,
 * the wait for Google to process it and the question are one attempt, made
 * again from the start on the next key when this one is refused
 * (withFailover). Uploading once and asking on another key would 403.
 *
 * The browser used to make this upload itself with a key from localStorage —
 * empty for every customer, so Google answered 403 "unregistered callers".
 * Here the bytes are read from Video Studio's own storage (`open`, called once
 * per attempt, since a stream can be read only once) and the key never leaves
 * the Worker. The file is deleted from Google after the answer; Google would
 * drop it after 48 hours anyway, but there is no reason to leave a customer's
 * recording on somebody else's disk that long.
 */
export interface FileForAi { name: string; mimeType: string; size: number; open: () => Promise<ReadableStream | null> }

export async function askGeminiAboutFile(
  apiKey: string, file: FileForAi, prompt: string, temperature = 0.3, opts: AskOpts & { activeWaitMs?: number } = {},
): Promise<AiResult> {
  const o = { ...opts, task: opts.task ?? (opts.module ? taskOf(opts.module) : 'reason' as AiTask) };
  return withFailover(apiKey, k => askAboutFileOnce(k, file, prompt, temperature, o), { exhausted: (): AiResult => ({ ok: false, text: '', error: AI_BUSY }) });
}

async function askAboutFileOnce(
  apiKey: string, file: FileForAi, prompt: string, temperature: number, opts: AskOpts & { activeWaitMs?: number },
): Promise<Attempt<AiResult>> {
  const failed = (status: number, raw: string, said?: string): Attempt<AiResult> =>
    ({ ok: false, status, error: raw, value: { ok: false, text: '', error: said ?? friendly(status, raw) } });
  /* No Files API behind an OpenRouter key: the next key, no rest (-2). */
  if (isOpenRouterKey(apiKey)) return failed(-2, 'not a Gemini key', 'Watching a video file is not available on this installation right now. This is on our side, not yours.');
  const k = encodeURIComponent(apiKey);
  let uploadUrl = '';
  try {
    const start = await fetch(`${BASE}/upload/v1beta/files?key=${k}`, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(file.size), 'X-Goog-Upload-Header-Content-Type': file.mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: file.name.slice(0, 120) || 'video' } }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!start.ok) return failed(start.status, await start.text().catch(() => `HTTP ${start.status}`));
    uploadUrl = start.headers.get('x-goog-upload-url') ?? '';
  } catch (e) {
    return failed(0, `Could not reach Google: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!uploadUrl) return failed(502, 'Google gave no upload address', 'Google did not accept the video for upload — try again shortly.');

  /* Not a key's fault (404 is not one): withFailover stops here rather than re-reading a missing file on every key. */
  const stream = await file.open();
  if (!stream) return failed(404, 'source gone', 'The uploaded video could not be read back from storage. Upload it again.');
  let meta: { name?: string; uri?: string; mimeType?: string; state?: string } = {};
  try {
    /* Exactly the declared length, streamed — a recording is never held in this isolate's memory. */
    const up = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
      body: stream.pipeThrough(new FixedLengthStream(file.size)),
    });
    if (!up.ok) return failed(up.status, await up.text().catch(() => `HTTP ${up.status}`));
    meta = (await up.json<{ file?: typeof meta }>().catch(() => ({} as { file?: typeof meta }))).file ?? {};
  } catch (e) {
    return failed(0, `The upload to Google stopped: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!meta.name || !meta.uri) return failed(502, 'no file in the upload answer', 'Google did not confirm the upload — try again shortly.');

  const forget = () => fetch(`${BASE}/v1beta/${meta.name}?key=${k}`, { method: 'DELETE' }).then(() => undefined, () => undefined);
  /* Google processes a video before it can be read; PROCESSING → ACTIVE (or FAILED). */
  let state = meta.state ?? 'PROCESSING';
  const deadline = Date.now() + (opts.activeWaitMs ?? 180_000);
  while (state === 'PROCESSING' && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2500));
    try {
      const r = await fetch(`${BASE}/v1beta/${meta.name}?key=${k}`, { signal: AbortSignal.timeout(15_000) });
      if (r.ok) state = (await r.json<{ state?: string }>().catch(() => ({} as { state?: string }))).state ?? state;
    } catch { /* asked again on the next turn */ }
  }
  /* The video's fault or Google's slowness, not the key's: 422/408 stop the failover. */
  if (state === 'FAILED') { await forget(); return failed(422, 'file processing failed', 'Google could not read this video file. Try exporting it again as MP4 (H.264).'); }
  if (state !== 'ACTIVE') { await forget(); return failed(408, 'file still processing', 'Google was still processing the video after three minutes. Try again in a moment, or try a shorter video.'); }

  const r = await askGeminiOnce(apiKey, [{ fileData: { mimeType: meta.mimeType || file.mimeType, fileUri: meta.uri } }, { text: prompt }], temperature, opts);
  await forget();
  return r;
}

/** Turn Google's verbose error bodies into a sentence worth showing. */
function friendly(status: number, raw: string): string {
  let msg = raw;
  try { msg = (JSON.parse(raw) as { error?: { message?: string } })?.error?.message || raw; } catch { /* not JSON */ }
  /* Every one of these is the operator's key, so none of them names it, a
     screen or a provider: the customer cannot fix any of it. */
  if (status === 429) return AI_BUSY;
  if (/API[ _]KEY[ _]INVALID|API key not valid|SERVICE[ _]DISABLED|API[ _]KEY[ _]SERVICE[ _]BLOCKED|BILLING|PERMISSION[ _]DENIED/i.test(raw)) {
    return 'Writing was refused by the AI provider. This is on us, not you — please try again shortly.';
  }
  if (status >= 500 || status === 0 || status === -1) return AI_BUSY;
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
  if (isOpenRouterKey(k)) return verifyOpenRouterKey(k);
  try {
    const r = await fetch(`${BASE}/v1beta/models?key=${encodeURIComponent(k)}&pageSize=1`);
    if (r.ok) return { ok: true, text: '', error: '' };
    return { ok: false, text: '', error: friendly(r.status, await r.text().catch(() => '')) };
  } catch (e) {
    return { ok: false, text: '', error: `Could not reach Google: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/* ── Asking the web ─────────────────────────────────────────────────────────── */

export interface WebFinding {
  title: string;
  summary: string;
  link: string;
}

export interface WebResult {
  ok: boolean;
  findings: WebFinding[];
  /** The pages Google says the answer was grounded in, whatever the model wrote. */
  sources: { title: string; uri: string }[];
  error: string;
  /** Every key failed for its own reason (capacity), not because the search found nothing. */
  busy?: boolean;
}

/**
 * Pull the JSON out of a reply that was not allowed to be JSON.
 *
 * Grounded search cannot be combined with Gemini's JSON mode — the API refuses
 * `responseMimeType: application/json` alongside the search tool — so the model
 * is *asked* for JSON in plain text and this finds it. Lenient on purpose: a
 * fence, some chatter before or after, or a stray trailing comma should not
 * lose a morning's research. Exported so the shapes it tolerates are pinned by
 * a test rather than discovered on a cron.
 */
export function extractJson<T>(text: string): T | null {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const body = cleaned.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(body) as T; } catch { return null; }
}

/**
 * Research a question on the web, with Google Search as the source.
 *
 * ── Why grounded, and not "ask the model" ──
 *
 * A model asked "what is new in UK heating grants this week" with no search
 * answers from its training, confidently and out of date — and a scheduled
 * agent would then write a daily post about last year's news. Grounding makes
 * Google run the search and the model answer from the results, and the API
 * returns the pages it used. Those pages are kept, so a post written from them
 * can be traced to where it came from.
 *
 * ── What it cannot promise ──
 *
 * That the model summarised the pages faithfully. The sources are returned so
 * a person reading the draft can check, and every draft stays a draft.
 */
export async function researchWeb(apiKey: string, question: string, max = 5, who: { module?: string; accountId?: string } = {}): Promise<WebResult> {
  return withFailover(apiKey, k => researchOnce(k, question, max, who), {
    exhausted: (): WebResult => ({ ok: false, findings: [], sources: [], error: AI_BUSY, busy: true }),
  });
}

async function researchOnce(apiKey: string, question: string, max: number, who: { module?: string; accountId?: string }): Promise<Attempt<WebResult>> {
  const failed = (status: number, raw: string): Attempt<WebResult> =>
    ({ ok: false, status, error: raw, value: { ok: false, findings: [], sources: [], error: friendly(status, raw) } });
  /* Searching the web is Google's grounding; an OpenRouter key passes it on to the next key. */
  /* OpenRouter searches with its web plugin (billed per search: a key with
     no credit answers 402 and is passed by). */
  if (isOpenRouterKey(apiKey)) return researchOnOpenRouter(apiKey, question, max, who);
  const prompt = `Search the web for the most recent, genuinely new information on this, and report it.

Question: ${question}

Rules:
- Only things you found in search results. If you found nothing recent, return an empty list rather than filling it.
- Each finding is one distinct item: a piece of news, a change, an announcement. Not the same story twice.
- Say when it happened if the source says.
- No opinion, no advice, no marketing language.

Reply with JSON only, in exactly this shape:
{"findings": [{"title": "", "summary": "two or three plain sentences", "link": "the source page"}]}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.2 },
  };

  let lastError = '';
  for (const model of await modelsFor(apiKey, 'research')) {
    let res: Response;
    try {
      res = await fetch(`${BASE}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        signal: AbortSignal.timeout(45_000),
      });
    } catch (e) {
      return failed(0, `Could not reach Google: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (res.ok) {
      const data = await res.json<{
        candidates?: {
          content?: { parts?: { text?: string }[] };
          groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
        }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      }>().catch(() => ({}) as Record<string, never>);
      await recordAiUse({ provider: 'gemini', key: apiKey, model, module: who.module ?? 'autopilot-research', accountId: who.accountId, ok: true, status: 200, tokensIn: data.usageMetadata?.promptTokenCount, tokensOut: data.usageMetadata?.candidatesTokenCount });
      const cand = data.candidates?.[0];
      const text = (cand?.content?.parts ?? []).map(p => p.text ?? '').join('');
      const parsed = extractJson<{ findings?: Partial<WebFinding>[] }>(text);
      const sources = (cand?.groundingMetadata?.groundingChunks ?? [])
        .map(ch => ({ title: String(ch.web?.title ?? ''), uri: String(ch.web?.uri ?? '') }))
        .filter(s => s.uri);

      /* No grounding at all means the model answered from memory, whatever it
         says. That is the failure this function exists to prevent, so it is
         reported as one rather than passed on as research. */
      if (!sources.length) {
        return { ok: true, value: { ok: false, findings: [], sources: [], error: 'The search came back with no sources, so nothing was written from it.' } };
      }
      const findings = (parsed?.findings ?? [])
        .map(f => ({
          title: String(f.title ?? '').trim().slice(0, 200),
          summary: String(f.summary ?? '').trim().slice(0, 800),
          link: String(f.link ?? '').trim().slice(0, 500),
        }))
        .filter(f => f.title && f.summary)
        .slice(0, max);
      return { ok: true, value: { ok: true, findings, sources, error: '' } };
    }

    lastError = await res.text().catch(() => `HTTP ${res.status}`);
    if (res.status === 404 || MODEL_GONE.test(lastError)) continue;
    return failed(res.status, lastError);
  }
  return failed(-1, lastError || 'every model failed');
}

async function researchOnOpenRouter(apiKey: string, question: string, max: number, who: { module?: string; accountId?: string }): Promise<Attempt<WebResult>> {
  const r = await askOpenRouter(apiKey, {
    parts: [{ text: `Search the web for the most recent, genuinely new information on this, and report it.

Question: ${question}

Only things you found in search results; an empty list rather than filling it. One distinct item each. No opinion or marketing language.

Reply with JSON only: {"findings": [{"title": "", "summary": "two or three plain sentences", "link": "the source page"}]}` }],
    temperature: 0.2, json: true, web: true, timeoutMs: 45_000, task: 'research', module: who.module ?? 'autopilot-research', accountId: who.accountId,
  });
  if (!r.ok) return { ok: false, status: r.status, error: r.error, value: { ok: false, findings: [], sources: [], error: r.value.error } };
  const sources = r.value.sources ?? [];
  /* As with Google's grounding: no cited page means it answered from memory. */
  if (!sources.length) return { ok: true, value: { ok: false, findings: [], sources: [], error: 'The search came back with no sources, so nothing was written from it.' } };
  const parsed = extractJson<{ findings?: Partial<WebFinding>[] }>(r.value.text);
  const findings = (parsed?.findings ?? [])
    .map(f => ({ title: String(f.title ?? '').trim().slice(0, 200), summary: String(f.summary ?? '').trim().slice(0, 800), link: String(f.link ?? '').trim().slice(0, 500) }))
    .filter(f => f.title && f.summary).slice(0, max);
  return { ok: true, value: { ok: true, findings, sources, error: '' } };
}

/**
 * Why the operator's AI is closed to this workspace, or null when it is not.
 *
 * Said by name, before loadAiKey would quietly answer "no key" — which reads
 * as the install being broken rather than the trial being over. A workspace
 * that brought its own key is not stopped: that costs the operator nothing.
 */
export async function trialRefusal(env: Env, accountId: string): Promise<string | null> {
  if ((await trialForWorkspace(env, accountId).catch(() => null))?.kind !== 'ended') return null;
  const own = await env.DB.prepare("SELECT 1 AS n FROM crm_ai_config WHERE account_id = ? AND api_key != ''")
    .bind(accountId).first().catch(() => null);
  return own ? null : TRIAL_ENDED_MESSAGE;
}

/**
 * One AI budget per workspace, shared by every route that spends the key.
 *
 * Only the New Project wizard had a limit; writing, product ideas, page
 * reading and workflow building had none, so any free sign-up could run the
 * operator's AI quota down in a loop. `null` means go ahead; otherwise the
 * sentence to show.
 */
export async function aiBudget(env: Env, accountId: string, opts: { job?: string } = {}): Promise<string | null> {
  const ended = await trialRefusal(env, accountId);
  if (ended) return ended;
  /* The owner's caps for this workspace (Platform services → AI & cloud usage; lib/aiUsage.ts). */
  const capped = await capRefusal(env, accountId);
  if (capped) return capped.message;
  /* The plan's monthly AI requests (lib/allowances.ts). Every server route
     that spends the AI key asks here first, so this is where one is counted:
     when it is asked for, because the caller makes the call straight after.
     A call that then fails gives it back (aiRefund). */
  const r = await takeAllowance(env, accountId, 'ai_requests', `ai-${crypto.randomUUID()}`);
  const job = cleanJob(opts.job);
  if (!r.ok) {
    /* A job that started inside the allowance finishes (lib/aiJobs.ts); the
       screen says the credits are used up once it is done. */
    if (await jobMayFinish(env, accountId, job)) { await jobTouch(env, accountId, job); return null; }
    return r.message;
  }
  await jobTouch(env, accountId, job);
  return null;
}

/**
 * Give back the AI request counted for a call that then failed.
 *
 * Counting happens before the call (aiBudget), so an outage used to spend a
 * customer's month: form triage and inbox replies retry every five minutes,
 * each retry another unit, and nothing was ever made. Units are alike, so the
 * newest one this workspace took in the last ten minutes is the one returned.
 */
export async function aiRefund(env: Env, accountId: string): Promise<void> {
  try {
    await env.DB.prepare(
      `DELETE FROM crm_usage WHERE rowid = (
         SELECT rowid FROM crm_usage WHERE meter = 'ai_requests' AND account_id = ? AND ref LIKE ? AND created_at > ?
         ORDER BY created_at DESC LIMIT 1)`,
    ).bind(accountId, `${accountId}:ai-%`, new Date(Date.now() - 10 * 60_000).toISOString()).run();
  } catch { /* the count is the customer's favour, never their failure */ }
}

/** A route's answer, with its AI request given back when it is a refusal (`success` not true). */
export async function refundIfFailed(env: Env, accountId: string, res: Response): Promise<Response> {
  const body = await res.clone().json<{ success?: boolean }>().catch(() => null);
  if (body?.success !== true) await aiRefund(env, accountId);
  return res;
}

/**
 * One real, tiny generation on exactly this key — no fallback to the next.
 * The owner's "Test" on the AI keys card: listing models (verifyAiKey) proves
 * the key exists, but a key whose quota is spent lists models happily and
 * then refuses every sentence.
 */
export async function probeAiKey(apiKey: string): Promise<Attempt<AiResult>> {
  const r = await askGeminiOnce(apiKey, [{ text: 'Reply with the single word OK.' }], 0, { json: false, fast: true, timeoutMs: 20_000 });
  if (r.ok) return r;
  /* The owner's screen: the provider's own reason, which the customer's
     sentence (AI_BUSY) deliberately leaves out. */
  let msg = r.error;
  try { msg = (JSON.parse(r.error) as { error?: { message?: string } })?.error?.message || r.error; } catch { /* not JSON */ }
  const why = r.status === 429 ? `The key has hit its rate limit or daily quota: ${msg}` : msg;
  return { ...r, value: { ...r.value, error: why.slice(0, 300) || r.value.error } };
}
