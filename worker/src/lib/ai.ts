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
const modelCache = new Map<string, { at: number; models: string[] }>();

/** Newest first: "3.6" before "3.5" before "2.5"; lite before full within a version. */
export function pickModels(names: string[]): string[] {
  const parsed = names
    .map(n => n.replace(/^models\//, ''))
    .map(n => ({ n, m: /^gemini-(\d+(?:\.\d+)?)-flash(-lite)?(-preview(?:-[\w-]+)?)?$/.exec(n) }))
    .filter((x): x is { n: string; m: RegExpExecArray } => !!x.m)
    .map(x => ({ name: x.n, version: parseFloat(x.m[1]), lite: !!x.m[2], preview: !!x.m[3] }));
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

export async function modelsFor(apiKey: string): Promise<string[]> {
  const hit = modelCache.get(apiKey);
  if (hit && Date.now() - hit.at < 6 * 3_600_000) return hit.models;
  try {
    const res = await fetch(`${BASE}/v1beta/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json<{ models?: { name?: string; supportedGenerationMethods?: string[] }[] }>();
      const names = (data.models ?? [])
        .filter(m => (m.supportedGenerationMethods ?? []).includes('generateContent'))
        .map(m => String(m.name ?? ''));
      const picked = pickModels(names);
      if (picked.length) {
        const models = [...picked, ...FALLBACK_MODELS.filter(f => f.endsWith('-latest'))];
        modelCache.set(apiKey, { at: Date.now(), models });
        return models;
      }
    }
  } catch { /* the fallback below */ }
  return FALLBACK_MODELS;
}

/** Google's wording when an id has been retired, in case the status is not 404. */
const MODEL_GONE = /no longer available|is not found|not supported for|deprecated/i;
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export interface AiResult {
  ok: boolean;
  text: string;
  error: string;
}

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
  const key = await installSecret(env.DB, 'mailbox_key');

  const row = await env.DB.prepare('SELECT api_key FROM crm_ai_config WHERE account_id = ?')
    .bind(accountId).first<{ api_key: string }>();
  if (row?.api_key) {
    try {
      const plain = await decryptSecret(key, row.api_key);
      if (plain) return plain;
    } catch { /* unreadable blob: fall through rather than fail the whole tick */ }
  }

  return installAiKey(env);
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
  const key = await installSecret(env.DB, 'mailbox_key');

  /* An explicit install-level key, if one was ever set. Checked first because
     somebody who went out of their way to set one meant it. */
  const explicit = await env.DB.prepare(
    "SELECT credentials FROM crm_install_providers WHERE kind = 'ai' AND credentials != ''",
  ).first<{ credentials: string }>();
  if (explicit?.credentials) {
    try {
      const parsed = JSON.parse(await decryptSecret(key, explicit.credentials)) as { apiKey?: string };
      if (parsed.apiKey) return parsed.apiKey;
    } catch { /* unreadable; keep looking */ }
  }

  /*
   * The owner's own AI Engine setting.
   *
   * Ordered so a key that last worked beats one that last failed — a row whose
   * `last_error` is set is a key that has already been refused once, and
   * handing it to every workspace on the install would multiply that failure
   * rather than surface it.
   */
  const owned = await env.DB.prepare(
    `SELECT c.api_key AS apiKey
     FROM crm_ai_config c
     JOIN crm_workspaces w ON w.account_id = c.account_id
     JOIN crm_users u ON u.email = w.owner_email
     WHERE u.account_id IS NULL AND u.role = 'agency' AND c.api_key != ''
     ORDER BY (c.last_error = '') DESC, (c.verified_at IS NOT NULL) DESC
     LIMIT 1`,
  ).first<{ apiKey: string }>();
  if (owned?.apiKey) {
    try {
      const plain = await decryptSecret(key, owned.apiKey);
      if (plain) return plain;
    } catch { /* unreadable; the env var below is the last chance */ }
  }

  return (env.AI_API_KEY ?? '').trim() || null;
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
  return askGeminiParts(apiKey, [{ text: prompt }], temperature);
}

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
  apiKey: string, parts: AiPart[], temperature = 0.5, opts: { json?: boolean; fast?: boolean; timeoutMs?: number } = {},
): Promise<AiResult> {
  const asJson = opts.json !== false;
  const base = asJson ? { responseMimeType: 'application/json', temperature } : { temperature };

  let lastError = '';
  for (const model of await modelsFor(apiKey)) {
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
          ...(opts.timeoutMs ? { signal: AbortSignal.timeout(opts.timeoutMs) } : {}),
        });
      } catch (e) {
        const timedOut = e instanceof Error && /abort|timeout/i.test(`${e.name} ${e.message}`);
        lastError = timedOut ? `${model} took too long` : `Could not reach Google: ${e instanceof Error ? e.message : String(e)}`;
        break;
      }

      if (res.ok) {
        const data = await res.json<{ candidates?: { content?: { parts?: { text?: string }[] } }[] }>()
          .catch(() => ({}) as Record<string, never>);
        const text = (data.candidates?.[0]?.content?.parts ?? []).map(p => p.text ?? '').join('');
        /* Models sometimes wrap JSON in a fence despite being asked not to. */
        return {
          ok: true,
          text: asJson ? text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim() : text.trim(),
          error: '',
        };
      }

      lastError = await res.text().catch(() => `HTTP ${res.status}`);
      if (res.status === 404 || MODEL_GONE.test(lastError)) break;   // this id is gone; next
      /* The thinking setting refused: the same model, without it. */
      if (thinking && res.status === 400 && /thinking/i.test(lastError)) { thinking = false; attempt--; continue; }
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
    /* Deliberately does not name a screen. On most installs the key is the
       operator's, and sending a customer to their own AI Engine tab to fix a
       key that is not there is a wild goose chase. */
    return 'Writing was refused by the AI provider. If you connected your own key, check it under Settings → AI Engine; otherwise this is on us.';
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
export async function researchWeb(apiKey: string, question: string, max = 5): Promise<WebResult> {
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
  for (const model of await modelsFor(apiKey)) {
    let res: Response;
    try {
      res = await fetch(`${BASE}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    } catch (e) {
      return { ok: false, findings: [], sources: [], error: `Could not reach Google: ${e instanceof Error ? e.message : String(e)}` };
    }

    if (res.ok) {
      const data = await res.json<{
        candidates?: {
          content?: { parts?: { text?: string }[] };
          groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
        }[];
      }>().catch(() => ({}) as Record<string, never>);
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
        return { ok: false, findings: [], sources: [], error: 'The search came back with no sources, so nothing was written from it.' };
      }
      const findings = (parsed?.findings ?? [])
        .map(f => ({
          title: String(f.title ?? '').trim().slice(0, 200),
          summary: String(f.summary ?? '').trim().slice(0, 800),
          link: String(f.link ?? '').trim().slice(0, 500),
        }))
        .filter(f => f.title && f.summary)
        .slice(0, max);
      return { ok: true, findings, sources, error: '' };
    }

    lastError = await res.text().catch(() => `HTTP ${res.status}`);
    if (res.status === 404 || MODEL_GONE.test(lastError)) continue;
    return { ok: false, findings: [], sources: [], error: friendly(res.status, lastError) };
  }
  return { ok: false, findings: [], sources: [], error: friendly(0, lastError || 'every model failed') };
}
