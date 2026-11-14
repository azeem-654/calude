import { quickShortsPrompt } from '../../worker/src/lib/video/quickShorts';

/*
 * No Gemini key lives in this browser — not in localStorage, not baked into
 * the build. Every AI call from a page goes through the Worker (/api/ai.php,
 * or /api/video.php `quick_analyze` for an uploaded video), which picks the
 * key from the install's pool (worker/src/lib/aiPool.ts) and the model from
 * the task (worker/src/lib/aiTasks.ts). A key here was how Quick Shorts sent
 * customers' files straight to Google with an empty key and got a 403, and
 * how a model id retired by Google broke five features at once.
 *
 * A key an earlier version saved in this browser is removed on load: nothing
 * reads it any more, and a secret left in localStorage is readable by any
 * script on the page.
 */
try { localStorage.removeItem('crm_gemini_key'); } catch { /* storage blocked — nothing to remove */ }

/**
 * Is AI available to this page?
 *
 * AI runs on the server with the operator's key, so a signed-in session is
 * enough — there is no key in the browser to have or to lack.
 */
export function aiAvailable(): string {
  try {
    const s = JSON.parse(localStorage.getItem('crm_session') || 'null') as { backend?: string; token?: string } | null;
    return s?.backend === 'php' && s.token ? 'server' : '';
  } catch { return ''; }
}

export function hasGeminiKey() {
  return !!aiAvailable();
}

/**
 * A Gemini generateContent call, made by the server.
 *
 * Takes the same request body the callers always built and returns something
 * shaped like the `fetch` Response they already handled — `ok`, `status`,
 * `json()`, `text()` — with Gemini's own response inside, so moving the call
 * off the page did not mean rewriting every parser.
 */
/**
 * `module` names the product module (worker/src/lib/aiTasks.ts MODULES): the
 * server picks the best models for its task and counts the call under it.
 */
/* ── Jobs: once started, a multi-call piece of work finishes ──
 *
 * The owner's rule: when something has started generating, let it finish and
 * then say the AI credits are used up (worker/src/lib/aiJobs.ts). `aiJob`
 * names the work; every AI call made while it runs carries the name, and the
 * server lets the later ones through past the month's allowance. What the
 * server said about the credits is handed back once the work is done, for the
 * screen to show then — not as a refusal in the middle of it. */
let currentJob: { id: string; creditsOut: string } | null = null;

export async function aiJob<T>(work: () => Promise<T>): Promise<{ value: T; creditsOut: string }> {
  const outer = currentJob;
  const mine = outer ?? { id: `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, creditsOut: '' };
  currentJob = mine;
  try {
    const value = await work();
    return { value, creditsOut: mine.creditsOut };
  } finally {
    currentJob = outer;
  }
}

/** The job id an AI call made now should carry, for callers that post to other AI routes (intake.php). */
export const currentAiJob = (): string => currentJob?.id ?? '';
/** Called by those callers when the server's answer said the credits ran out mid-job. */
export function noteCreditsOut(message: string): void { if (currentJob && message) currentJob.creditsOut = message; }

/**
 * A Gemini generateContent call, made by the server.
 *
 * Takes the same request body the callers always built and returns something
 * shaped like the `fetch` Response they already handled — `ok`, `status`,
 * `json()`, `text()` — with Gemini's own response inside, so moving the call
 * off the page did not mean rewriting every parser.
 *
 * Bounded at two minutes: the server walks its keys within about 100 s
 * (lib/aiPool.ts), so a wait past that is a connection that will not answer.
 * A chat waiting on a reply passes less (`timeoutMs`) and asks its own
 * fallback question instead (protron/intake.ts REPLY_WITHIN_MS).
 */
export async function aiFetch(init: RequestInit | string, module = 'general', timeoutMs = 120_000): Promise<Response> {
  const bodyText = typeof init === 'string' ? init : String(init.body ?? '{}');
  let request: unknown = {};
  try { request = JSON.parse(bodyText); } catch { request = {}; }
  let session: { token?: string } | null = null;
  try { session = JSON.parse(localStorage.getItem('crm_session') || 'null'); } catch { session = null; }
  const accountId = (() => { try { return localStorage.getItem('crm_active_account') || ''; } catch { return ''; } })();
  const base = (import.meta.env.DEV ? 'http://localhost:8787' : '');
  const job = currentJob;
  try {
    const r = await fetch(`${base}/api/ai.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate', token: session?.token, accountId, module, request, ...(job ? { job: job.id } : {}) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await r.json() as { success?: boolean; response?: unknown; error?: string; code?: string; creditsOut?: string };
    if (data.creditsOut && job) job.creditsOut = data.creditsOut;
    if (data.success) return new Response(JSON.stringify(data.response ?? {}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ error: { message: data.error ?? 'The AI could not answer.', code: data.code ?? '' } }), { status: r.status >= 400 ? r.status : 502 });
  } catch (e) {
    const slow = e instanceof Error && /timeout|abort/i.test(`${e.name} ${e.message}`);
    return new Response(JSON.stringify({ error: { message: slow ? 'The AI took too long to answer. Please try again.' : 'Could not reach the server.', code: slow ? 'ai_busy' : '' } }), { status: slow ? 504 : 503 });
  }
}

/** Transient errors worth retrying once: rate limit, or the server's AI being overloaded. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/**
 * The server's own sentence, which is already written for a customer
 * (worker/src/lib/ai.ts `friendly`, `AI_BUSY`): it never names a provider or
 * a key. This only unwraps it, and keeps one browser-side case.
 */
function friendlyGeminiError(status: number, raw: string): string {
  let msg = raw;
  try { msg = (JSON.parse(raw) as { error?: { message?: string } })?.error?.message || raw; } catch { /* raw isn't JSON */ }
  if (status === 400 && /Unsupported MIME type/i.test(msg)) {
    return "The AI couldn't read this video source. For YouTube links this can happen — try downloading the video and uploading the file directly.";
  }
  const short = msg.length > 300 ? msg.slice(0, 300) + '…' : msg;
  return short || 'The AI could not answer. Please try again.';
}

/** The sentence a failed aiFetch carries, for callers that read the Response themselves. */
export async function aiErrorOf(res: Response): Promise<string> {
  return friendlyGeminiError(res.status, await res.text().catch(() => ''));
}

interface GeminiResponse {
  error?: { message?: string };
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/**
 * POSTs a generateContent body through the server, retrying transient failures
 * (429/500/502/503/504) with backoff. The server chooses the models and walks
 * its own chain past a retired id (worker/src/lib/ai.ts modelsFor), so nothing
 * here names one. Non-transient errors throw at once.
 */
async function postGemini(body: unknown, module = 'general'): Promise<GeminiResponse> {
  /* Twice at most. The server already tries every key and model it has; three
     browser attempts on top of that were how a failing plan took three and a
     half minutes to fail. An answer of "every key is busy" is not retried. */
  let lastError = '';
  let lastStatus = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await aiFetch({ body: JSON.stringify(body) }, module);
    if (res.ok) return await res.json();
    lastError = await res.text().catch(() => `HTTP ${res.status}`);
    lastStatus = res.status;
    const busy = /"code":"ai_busy"/.test(lastError);
    if (busy || !RETRYABLE_STATUS.has(res.status)) throw new Error(friendlyGeminiError(res.status, lastError));
    if (attempt < 2) await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(friendlyGeminiError(lastStatus, lastError || 'the AI did not answer'));
}

export interface GeminiClip {
  title: string;
  /** English translation of `title`, present only when the video's language isn't English. */
  titleTranslated?: string;
  description: string;
  /** English translation of `description`, present only when the video's language isn't English. */
  descriptionTranslated?: string;
  startTime: number;
  endTime: number;
  /** Montage segments cut from different parts of the video that together tell
      a complete story matching the title. Each carries the exact sentences
      spoken in that segment (so cuts land on sentence boundaries). */
  segments?: { start: number; end: number; text?: string }[];
  transcript: string;
  viralityScore: number;
  focus: 'emotional' | 'educational' | 'funny' | 'motivational';
  hashtags: string[];
  reason: string;
}

export interface GeminiAnalysis {
  videoSummary: string;
  totalDuration: number;
  /** Full English name of the video's primary spoken language, e.g. "English", "Turkish", "Arabic". */
  videoLanguage: string;
  clips: GeminiClip[];
}

/**
 * Clip suggestions for a YouTube video, asked through the server.
 *
 * The link rides as a `fileData` part with no mimeType — Gemini's YouTube
 * understanding rejects the request if one is attached to a youtube.com uri.
 * An uploaded file never comes here: it goes through Video Studio's upload
 * and `quick_analyze` (src/services/quickShorts.ts), because a file needs a
 * Files API upload on the same key that then reads it, and only the Worker
 * holds keys.
 */
export async function analyzeYoutubeWithGemini(
  url: string,
  settings: { maxClipDuration: number; focus: string },
  /** Real source duration, when known — used to clamp AI timestamps. */
  knownDuration?: number,
): Promise<GeminiAnalysis> {
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ fileData: { fileUri: url } }, { text: quickShortsPrompt(settings) }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
  };
  const data = await postGemini(body, 'video-analysis');
  if (data.error) throw new Error(data.error.message ?? 'The AI could not answer.');
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return readAnalysis(text, settings.maxClipDuration, knownDuration);
}

/**
 * An analysis answer — the model's JSON text, or the object the server already
 * parsed — checked by `sanitizeAnalysis`. Throws a sentence when it is not an
 * analysis at all, rather than handing the page `undefined.clips`.
 */
export function readAnalysis(raw: unknown, maxClipDuration: number, knownDuration?: number): GeminiAnalysis {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()); } catch { parsed = null; }
  }
  const a = parsed as Partial<GeminiAnalysis> | null;
  if (!a || typeof a !== 'object' || !Array.isArray(a.clips)) throw new Error('The AI answered, but not with clips this page can read. Try again.');
  return sanitizeAnalysis({
    videoSummary: String(a.videoSummary ?? ''), totalDuration: Number(a.totalDuration) || 0,
    videoLanguage: String(a.videoLanguage ?? '') || 'English', clips: a.clips,
  }, maxClipDuration, knownDuration);
}

/** Text that means "the model had nothing to say" — never usable as a caption. */
const PLACEHOLDER_TRANSCRIPT = /^\s*[([]?\s*(no|none|n\/a|silence|no spoken|no dialogue|no audio|inaudible|music only|unknown)\b/i;

/**
 * Repair and filter a raw Gemini analysis so bad timings can't produce
 * mis-cut or irrelevant clips:
 *  - clamps every time to [0, videoDuration] and drops inverted/zero ranges
 *  - removes overlapping segments within a clip and caps total length
 *  - recomputes startTime/endTime/transcript from the surviving segments
 *  - drops clips that end up too short, empty, or placeholder-only
 *  - de-duplicates clips that cover essentially the same moment
 */
export function sanitizeAnalysis(analysis: GeminiAnalysis, maxClipDuration: number, videoDuration?: number): GeminiAnalysis {
  // For YouTube links the app only has a rough duration estimate, so clamp to
  // the MORE generous of (app estimate, model's reported length). That still
  // catches absurd hallucinated timestamps without truncating real content.
  const candidates = [videoDuration, analysis.totalDuration].filter((d): d is number => typeof d === 'number' && d > 0);
  const limit = candidates.length ? Math.max(...candidates) : Number.POSITIVE_INFINITY;
  const MIN_CLIP = 5;

  const cleaned: GeminiClip[] = [];
  for (const clip of analysis.clips ?? []) {
    // Build the segment list, falling back to the clip's own span.
    const rawSegs = (clip.segments?.length ? clip.segments : [{ start: clip.startTime, end: clip.endTime, text: clip.transcript }])
      .map(s => ({
        start: Math.max(0, Math.min(Number(s.start) || 0, limit)),
        end: Math.max(0, Math.min(Number(s.end) || 0, limit)),
        text: typeof s.text === 'string' ? s.text.trim() : '',
      }))
      .filter(s => s.end - s.start >= 1)          // drop inverted / hairline ranges
      .sort((a, b) => a.start - b.start);

    // Drop overlaps (keep the earlier segment) and respect the length budget.
    const segs: typeof rawSegs = [];
    let total = 0;
    for (const s of rawSegs) {
      const prev = segs[segs.length - 1];
      if (prev && s.start < prev.end) continue;
      const room = maxClipDuration - total;
      if (room <= 0.5) break;
      const seg = { ...s, end: Math.min(s.end, s.start + room) };
      if (seg.end - seg.start < 1) continue;
      segs.push(seg);
      total += seg.end - seg.start;
    }
    if (!segs.length || total < MIN_CLIP) continue;

    const transcript = segs.map(s => s.text).filter(Boolean).join(' ').trim();
    const title = (clip.title ?? '').trim();
    if (!title) continue;
    // A clip whose only transcript is a placeholder would burn "(no dialogue)"
    // into the captions — drop it rather than ship that.
    if (transcript && PLACEHOLDER_TRANSCRIPT.test(transcript) && transcript.length < 40) continue;

    cleaned.push({
      ...clip,
      title,
      segments: segs,
      startTime: segs[0].start,
      endTime: segs[segs.length - 1].end,
      transcript: transcript || clip.transcript || title,
      viralityScore: Math.max(60, Math.min(99, Math.round(Number(clip.viralityScore) || 75))),
      hashtags: Array.isArray(clip.hashtags) ? clip.hashtags.filter(h => typeof h === 'string').slice(0, 6) : [],
    });
  }

  // De-duplicate near-identical selections (same moment returned twice).
  const deduped: GeminiClip[] = [];
  for (const c of cleaned.sort((a, b) => a.startTime - b.startTime)) {
    const clash = deduped.some(d => {
      const overlap = Math.min(d.endTime, c.endTime) - Math.max(d.startTime, c.startTime);
      const shorter = Math.min(d.endTime - d.startTime, c.endTime - c.startTime);
      return shorter > 0 && overlap / shorter > 0.6;
    });
    if (!clash) deduped.push(c);
  }

  // Best-first so the strongest clips are what the user sees at the top.
  deduped.sort((a, b) => b.viralityScore - a.viralityScore);
  return { ...analysis, clips: deduped };
}

/** Shared helper: call Gemini text models with fallback chain. */
async function callGemini(prompt: string, temperature = 0.7, module = 'general'): Promise<string> {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature },
  };
  const data = await postGemini(body, module);
  if (data.error) throw new Error(data.error.message ?? 'The AI could not answer.');
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
}

/** A JSON-answering text call, for callers that build and check their own prompt (the template copywriter). */
export const askGeminiJson = (prompt: string, temperature = 0.7, module = 'graphics') => callGemini(prompt, temperature, module);

/**
 * AI Hook: generate scroll-stopping opening lines for a short clip.
 * Returns 5 hook lines in the clip's language.
 */
export async function generateHooks(clip: { title: string; transcript: string; language?: string }): Promise<string[]> {
  const lang = clip.language && clip.language.toLowerCase() !== 'english' ? clip.language : 'English';
  const prompt = `You are a short-form video expert. Write 5 scroll-stopping HOOK lines (max 8 words each) for the first 2 seconds of this clip. They must create curiosity or tension and match the clip's content. Write them in ${lang}.

Clip title: "${clip.title}"
Clip transcript/description: "${clip.transcript.slice(0, 500)}"

Return ONLY JSON: {"hooks": ["hook 1", "hook 2", "hook 3", "hook 4", "hook 5"]}`;
  const json = await callGemini(prompt, 0.9, 'video');
  const r = JSON.parse(json) as { hooks?: string[] };
  return (r.hooks ?? []).filter(h => typeof h === 'string' && h.trim()).slice(0, 5);
}

/**
 * Video Dubbing: translate a clip's title, description, and caption lines to
 * a target language, preserving order (timings are reused as-is).
 */
export async function translateClip(
  clip: { title: string; description: string; captions: string[] },
  targetLanguage: string,
): Promise<{ title: string; description: string; captions: string[] }> {
  const prompt = `Translate this short-form video content to ${targetLanguage}. Keep each caption SHORT (same rough length as the original — they are on-screen captions). Keep emoji as-is. Return the SAME number of captions in the SAME order.

Title: ${clip.title}
Description: ${clip.description.slice(0, 400)}
Captions (JSON array): ${JSON.stringify(clip.captions.slice(0, 40))}

Return ONLY JSON: {"title": "...", "description": "...", "captions": ["...", ...]}`;
  const json = await callGemini(prompt, 0.3, 'video');
  const r = JSON.parse(json) as { title?: string; description?: string; captions?: string[] };
  if (!Array.isArray(r.captions) || r.captions.length === 0) throw new Error('Translation returned no captions.');
  return { title: r.title || clip.title, description: r.description || clip.description, captions: r.captions };
}

/** AI Image B-Roll: suggest visual cutaway keywords matched to the clip's content. */
export async function suggestBroll(transcript: string): Promise<{ keyword: string; title: string }[]> {
  const prompt = `Suggest 4 stock-image B-roll cutaways for this short video clip. Each needs a simple 1-2 word image search keyword (lowercase, generic objects/scenes like "city", "handshake", "money", "gym") and a short display title.

Clip content: "${transcript.slice(0, 500)}"

Return ONLY JSON: {"broll": [{"keyword": "city", "title": "City skyline"}, ...]}`;
  const json = await callGemini(prompt, 0.6, 'video');
  const r = JSON.parse(json) as { broll?: { keyword?: string; title?: string }[] };
  return (r.broll ?? [])
    .filter(b => b.keyword && /^[a-zA-Z0-9 ,-]{2,40}$/.test(b.keyword))
    .map(b => ({ keyword: b.keyword!.toLowerCase(), title: b.title || b.keyword! }))
    .slice(0, 4);
}

/** Script to Video: write (or structure) a short-form script as timed scenes. */
export async function generateScript(topic: string): Promise<{ title: string; scenes: { caption: string; keyword: string }[] }> {
  const prompt = `Write a punchy 20-30 second short-form video script about: "${topic}".

Rules:
- 6 to 8 scenes. Each scene is ONE short on-screen caption line (max 10 words).
- Scene 1 must be a scroll-stopping hook.
- The last scene is a call to action.
- Each scene gets a simple 1-2 word stock-image keyword describing its visual.

Return ONLY JSON: {"title": "video title under 60 chars", "scenes": [{"caption": "...", "keyword": "..."}, ...]}`;
  const json = await callGemini(prompt, 0.8, 'video');
  const r = JSON.parse(json) as { title?: string; scenes?: { caption?: string; keyword?: string }[] };
  const scenes = (r.scenes ?? [])
    .filter(s => s.caption)
    .map(s => ({ caption: s.caption!, keyword: (s.keyword && /^[a-zA-Z0-9 ,-]{2,40}$/.test(s.keyword) ? s.keyword.toLowerCase() : 'abstract') }))
    .slice(0, 8);
  if (!scenes.length) throw new Error('The AI returned no scenes.');
  return { title: r.title || topic.slice(0, 60), scenes };
}

/**
 * Onboarding: plan a full 12-month marketing calendar (themes + topics only —
 * lightweight; actual content generation happens month-by-month later).
 */
export async function generateMarketingPlan(profile: {
  company: string; industry: string; description: string; audience: string;
  voice: string; goals: string[]; channels: string[]; startMonthLabel: string;
}): Promise<{ theme: string; focus: string; holidays: string[]; ideas: string[] }[]> {
  const prompt = `You are a senior marketing strategist. Create a 12-month content marketing plan for this business, starting in ${profile.startMonthLabel}.

Business: ${profile.company} (${profile.industry})
What they do: ${profile.description.slice(0, 400)}
Audience: ${profile.audience.slice(0, 300)}
Brand voice: ${profile.voice}
Goals: ${profile.goals.join(', ')}
Channels: ${profile.channels.join(', ')}

For EACH of the 12 months provide:
- "theme": a punchy monthly campaign theme (max 6 words) tailored to the business
- "focus": 1-2 sentences on what marketing focuses on that month and why
- "holidays": 1-3 real holidays/observances in that calendar month worth leveraging (respect the actual month)
- "ideas": 4 specific content/campaign ideas for that month (each max 12 words)

Return ONLY JSON: {"months": [{"theme": "...", "focus": "...", "holidays": ["..."], "ideas": ["...", "...", "...", "..."]}, ... 12 items]}`;
  const json = await callGemini(prompt, 0.7, 'strategy');
  const r = JSON.parse(json) as { months?: { theme?: string; focus?: string; holidays?: string[]; ideas?: string[] }[] };
  const months = (r.months ?? []).slice(0, 12).map(m => ({
    theme: m.theme || 'Brand Momentum',
    focus: m.focus || 'Consistent multi-channel presence.',
    holidays: (m.holidays ?? []).slice(0, 3),
    ideas: (m.ideas ?? []).slice(0, 4),
  }));
  if (months.length < 12) throw new Error('Plan incomplete');
  return months;
}

/**
 * Onboarding: generate one month's email + SMS campaign content from the
 * business profile and that month's planned theme.
 */
export async function generateMonthCampaigns(input: {
  company: string; industry: string; description: string; audience: string; voice: string;
  monthLabel: string; theme: string; focus: string; ideas: string[]; holidays: string[];
  wantSms: boolean;
}): Promise<{ emails: { day: number; subject: string; body: string }[]; sms: { day: number; message: string }[] }> {
  const prompt = `You are an expert email/SMS copywriter. Write a ${input.monthLabel} campaign for this business.

Business: ${input.company} (${input.industry})
What they do: ${input.description.slice(0, 350)}
Audience: ${input.audience.slice(0, 250)}
Brand voice: ${input.voice}
Monthly theme: ${input.theme} — ${input.focus.slice(0, 200)}
Planned ideas: ${input.ideas.join('; ')}
Key dates: ${input.holidays.join(', ') || 'none'}

Write:
- 5 marketing EMAILS spread across the month (days 1, 7, 13, 19, 26). Each: a subject line under 55 chars, and a 90-160 word plain-text body. Use {{firstName}} exactly once per body as the greeting merge tag. Vary angles: value/education, social proof, offer, holiday tie-in, last-chance. End each with a short call to action.
${input.wantSms ? '- 4 SMS messages (days 3, 10, 17, 24). Each under 160 characters, starts with the business name, includes {{firstName}} where natural, one clear CTA. No links other than "reply YES".' : ''}

Return ONLY JSON: {"emails": [{"day": 1, "subject": "...", "body": "..."}, ...5 items], "sms": [${input.wantSms ? '{"day": 3, "message": "..."}, ...4 items' : ''}]}`;
  const json = await callGemini(prompt, 0.75, 'email-marketing');
  const r = JSON.parse(json) as { emails?: { day?: number; subject?: string; body?: string }[]; sms?: { day?: number; message?: string }[] };
  const emails = (r.emails ?? [])
    .filter(e => e.subject && e.body)
    .map((e, i) => ({ day: typeof e.day === 'number' ? e.day : [1, 7, 13, 19, 26][i] ?? i * 6 + 1, subject: e.subject!, body: e.body! }))
    .slice(0, 5);
  const sms = (r.sms ?? [])
    .filter(s => s.message)
    .map((s, i) => ({ day: typeof s.day === 'number' ? s.day : [3, 10, 17, 24][i] ?? i * 7 + 3, message: s.message! }))
    .slice(0, 4);
  if (emails.length < 3) throw new Error('The AI returned too few emails.');
  return { emails, sms };
}

/**
 * The business-flow chain: one outcome, written across every channel at once.
 *
 * Asked for in a single call rather than six, because the point of the chain is
 * that the email, the text, the post and the blog are the *same* campaign — six
 * separate prompts produce six campaigns that happen to share a company name.
 *
 * Every field is optional in the caller's eyes: businessFlow.ts merges what
 * comes back over a version it already wrote from the portfolio, so a partial
 * answer improves the plan instead of failing it.
 */
export async function generateBusinessFlow(input: {
  company: string; industry: string; description: string; audience: string; voice: string;
  outcome: string; arc: string; cta: string;
}): Promise<{
  name?: string;
  promise?: string;
  emails?: { day: number; subject: string; body: string }[];
  sms?: { day: number; body: string }[];
  social?: { day: number; platform: 'instagram' | 'facebook' | 'linkedin'; headline: string; caption: string; hashtags: string[] }[];
  blog?: { title: string; angle: string; outline: string[]; keywords: string[] };
  short?: { title: string; hook: string; script: string[] };
  landing?: { title: string; subhead: string; bullets: string[]; cta: string };
}> {
  const prompt = `You are a senior direct-response copywriter. Write ONE campaign for this business, carried across every channel. Every piece must belong to the same campaign — same promise, same offer, same call to action.

Business: ${input.company} (${input.industry})
What they do: ${input.description.slice(0, 400)}
Who they serve: ${input.audience.slice(0, 300)}
Brand voice: ${input.voice}

The outcome the owner wants: ${input.outcome}
The journey: ${input.arc}
The one action every piece asks for: ${input.cta}

Write:
- "name": what to call this campaign internally (max 8 words)
- "promise": the campaign's promise in one sentence
- "emails": 4 emails on days 0, 2, 5 and 9. Each has a subject under 55 characters and a 90-170 word plain-text body. Use {{firstName}} exactly once, as the greeting. Give each a distinct job: open, teach, prove, ask. No exclamation marks in subjects.
- "sms": 2 texts on days 1 and 6, each under 160 characters, starting with the business name, ending in a clear reply instruction.
- "social": 4 posts on days 0, 3, 6 and 10 across instagram, linkedin and facebook. Each has a headline under 60 characters, a caption of 2-3 sentences, and 2-3 hashtags.
- "blog": one post idea with a title, a one-sentence angle, a 5-point outline, and 3 search keywords real buyers would type.
- "short": a 30-second vertical video with a title, a scroll-stopping hook line, and 6 script lines of one sentence each.
- "landing": a landing page with a title, a subhead, 3 benefit bullets and a button label.

Write like a person who knows this industry. No filler, no "in today's fast-paced world", no em dashes.

Return ONLY JSON: {"name":"...","promise":"...","emails":[{"day":0,"subject":"...","body":"..."}],"sms":[{"day":1,"body":"..."}],"social":[{"day":0,"platform":"instagram","headline":"...","caption":"...","hashtags":["#..."]}],"blog":{"title":"...","angle":"...","outline":["..."],"keywords":["..."]},"short":{"title":"...","hook":"...","script":["..."]},"landing":{"title":"...","subhead":"...","bullets":["..."],"cta":"..."}}`;

  const json = await callGemini(prompt, 0.75, 'workflows');
  const r = JSON.parse(json) as Record<string, unknown>;

  /* Trusted for shape, not for content: a model that returns an email with no
     subject would otherwise put an empty string into a real campaign. Anything
     incomplete is dropped here so the caller keeps its own version of it. */
  const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const strs = (v: unknown, max: number, cap: number): string[] =>
    list(v).map(x => str(x, max)).filter(Boolean).slice(0, cap);

  const emails = list(r.emails)
    .map(e => e as Record<string, unknown>)
    .map((e, i) => ({
      day: typeof e.day === 'number' ? e.day : [0, 2, 5, 9][i] ?? i * 3,
      subject: str(e.subject, 120),
      body: str(e.body, 4000),
    }))
    .filter(e => e.subject && e.body.length > 40)
    .slice(0, 5);

  const sms = list(r.sms)
    .map(m => m as Record<string, unknown>)
    .map((m, i) => ({ day: typeof m.day === 'number' ? m.day : [1, 6][i] ?? i * 5 + 1, body: str(m.body, 480) }))
    .filter(m => m.body)
    .slice(0, 4);

  const PLATFORMS = new Set(['instagram', 'facebook', 'linkedin']);
  const social = list(r.social)
    .map(p => p as Record<string, unknown>)
    .map((p, i) => ({
      day: typeof p.day === 'number' ? p.day : [0, 3, 6, 10][i] ?? i * 3,
      platform: (PLATFORMS.has(String(p.platform)) ? String(p.platform) : 'instagram') as 'instagram' | 'facebook' | 'linkedin',
      headline: str(p.headline, 120),
      caption: str(p.caption, 900),
      hashtags: strs(p.hashtags, 40, 5).map(h => (h.startsWith('#') ? h : `#${h}`)),
    }))
    .filter(p => p.headline && p.caption)
    .slice(0, 6);

  const b = (r.blog ?? {}) as Record<string, unknown>;
  const blogTitle = str(b.title, 160);
  const blog = blogTitle
    ? { title: blogTitle, angle: str(b.angle, 400), outline: strs(b.outline, 160, 8), keywords: strs(b.keywords, 80, 6) }
    : undefined;

  const sh = (r.short ?? {}) as Record<string, unknown>;
  const shortScript = strs(sh.script, 220, 10);
  const short = shortScript.length >= 3
    ? { title: str(sh.title, 120) || 'Short', hook: str(sh.hook, 220) || shortScript[0], script: shortScript }
    : undefined;

  const l = (r.landing ?? {}) as Record<string, unknown>;
  const landingTitle = str(l.title, 120);
  const landing = landingTitle
    ? { title: landingTitle, subhead: str(l.subhead, 300), bullets: strs(l.bullets, 200, 5), cta: str(l.cta, 40) || 'Get started' }
    : undefined;

  return {
    name: str(r.name, 90),
    promise: str(r.promise, 300),
    emails, sms, social, blog, short, landing,
  };
}

/**
 * Onboarding: generate one month's 30-day social calendar + short-video scripts.
 */
export async function generateSocialCalendar(input: {
  company: string; industry: string; description: string; audience: string; voice: string;
  monthLabel: string; theme: string; ideas: string[]; holidays: string[];
  platforms: string[]; wantVideos: boolean;
}): Promise<{
  posts: { day: number; platform: string; headline: string; caption: string; hashtags: string[] }[];
  videos: { day: number; title: string; hook: string; script: string[] }[];
}> {
  const prompt = `You are a social media manager. Plan ${input.monthLabel} for this business.

Business: ${input.company} (${input.industry})
What they do: ${input.description.slice(0, 300)}
Audience: ${input.audience.slice(0, 200)}
Voice: ${input.voice}
Monthly theme: ${input.theme}
Ideas to work in: ${input.ideas.join('; ')}
Key dates: ${input.holidays.join(', ') || 'none'}
Platforms: ${input.platforms.join(', ')}

Create:
- 12 social POSTS spread across days 2-28 (roughly 3 per week), rotating between the platforms listed. Each: "headline" (max 8 words, goes on the image), "caption" (2-3 sentences ending with a call to action, no emojis at the start), "hashtags" (4-6, no # symbol).
${input.wantVideos ? '- 4 short-form VIDEOS (days 4, 11, 18, 25). Each: "title" (under 55 chars), "hook" (scroll-stopping opening line under 12 words), "script" (6 on-screen caption lines, max 10 words each, last one a call to action).' : ''}

Return ONLY JSON: {"posts": [{"day": 2, "platform": "instagram", "headline": "...", "caption": "...", "hashtags": ["..."]}, ...12], "videos": [${input.wantVideos ? '{"day": 4, "title": "...", "hook": "...", "script": ["..."]}, ...4' : ''}]}`;
  const json = await callGemini(prompt, 0.8, 'social');
  const r = JSON.parse(json) as {
    posts?: { day?: number; platform?: string; headline?: string; caption?: string; hashtags?: string[] }[];
    videos?: { day?: number; title?: string; hook?: string; script?: string[] }[];
  };
  const posts = (r.posts ?? [])
    .filter(p => p.headline && p.caption)
    .map((p, i) => ({
      day: typeof p.day === 'number' ? Math.min(Math.max(1, Math.round(p.day)), 28) : (i * 2 + 2),
      platform: p.platform || input.platforms[i % Math.max(input.platforms.length, 1)] || 'instagram',
      headline: p.headline!, caption: p.caption!, hashtags: (p.hashtags ?? []).slice(0, 6),
    }))
    .slice(0, 14);
  const videos = (r.videos ?? [])
    .filter(v => v.title && v.hook && (v.script?.length ?? 0) >= 3)
    .map((v, i) => ({
      day: typeof v.day === 'number' ? Math.min(Math.max(1, Math.round(v.day)), 28) : [4, 11, 18, 25][i] ?? i * 7 + 4,
      title: v.title!, hook: v.hook!, script: v.script!.slice(0, 8),
    }))
    .slice(0, 4);
  if (posts.length < 6) throw new Error('The AI returned too few posts.');
  return { posts, videos };
}

/**
 * Contact email: suggest subject lines for a specific person and intent.
 */
export async function generateSubjectLines(input: {
  contactName: string; company?: string; jobTitle?: string;
  intent: string; bodyPreview: string;
}): Promise<string[]> {
  const prompt = `You are an expert at short-form email subject lines that get opened by busy people.

Recipient: ${input.contactName}${input.company ? ` at ${input.company}` : ''}${input.jobTitle ? ` (${input.jobTitle})` : ''}
Purpose of the email: ${input.intent}
Body so far: "${input.bodyPreview.slice(0, 400)}"

Write 5 subject lines. Rules:
- Under 55 characters each
- Specific to this recipient and purpose — no generic filler
- No clickbait, no ALL CAPS, no exclamation marks
- Vary the angle: direct, curiosity, benefit, question, brief

Return ONLY JSON: {"subjects": ["...", "...", "...", "...", "..."]}`;
  const json = await callGemini(prompt, 0.85, 'email-marketing');
  const r = JSON.parse(json) as { subjects?: string[] };
  return (r.subjects ?? []).filter(x => typeof x === 'string' && x.trim()).map(x => x.trim().slice(0, 80)).slice(0, 5);
}

export interface AIDesignElement {
  type: 'text' | 'shape' | 'sticker';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  locked: boolean;
  visible: boolean;
  data: Record<string, unknown>;
}

export interface AIDesignResult {
  name: string;
  background: {
    type: 'color' | 'gradient';
    color: string;
    gradientStart: string;
    gradientEnd: string;
    gradientAngle: number;
  };
  elements: AIDesignElement[];
}

/**
 * Ask Gemini to generate a complete social media design from a text prompt.
 * Returns structured JSON describing background + canvas elements.
 */
export async function generateSocialPostDesign(
  userPrompt: string,
  platform: string,
  aspectRatio: string,
  canvasWidth: number,
  canvasHeight: number
): Promise<AIDesignResult> {
  const prompt = `You are an expert social media graphic designer. Create a stunning ${platform} post design (${aspectRatio}, ${canvasWidth}×${canvasHeight}px canvas) based on this description:

"${userPrompt}"

Design rules:
- Use bold, eye-catching colors that match the mood
- Place 3-6 elements: at least one headline text, optionally a subheading, decorative shapes, or emoji stickers
- All x/y/width/height values must be numbers in pixels within the canvas (0 to ${canvasWidth} wide, 0 to ${canvasHeight} tall)
- Text elements must not overflow the canvas; keep x+width ≤ ${canvasWidth} and y+height ≤ ${canvasHeight}
- fontWeight must be one of: "normal", "bold", "300", "500", "600", "700", "800", "900"
- fontFamily must be one of: "Inter", "Impact", "Georgia", "Arial", "Helvetica", "Verdana"
- shapeType must be one of: "rect", "rounded-rect", "circle", "triangle", "star", "diamond", "line"
- For sticker elements, emoji must be a single emoji character
- Colors must be valid hex codes like "#ff0000"
- Make it visually striking and professional

Return ONLY valid JSON, no markdown fences:
{
  "name": "Short descriptive design name",
  "background": {
    "type": "gradient",
    "color": "#hex",
    "gradientStart": "#hex",
    "gradientEnd": "#hex",
    "gradientAngle": 135
  },
  "elements": [
    {
      "type": "text",
      "x": 60,
      "y": 180,
      "width": ${canvasWidth - 120},
      "height": 80,
      "rotation": 0,
      "zIndex": 1,
      "locked": false,
      "visible": true,
      "data": {
        "kind": "text",
        "text": "YOUR HEADLINE",
        "fontSize": 48,
        "fontFamily": "Impact",
        "color": "#ffffff",
        "fontWeight": "900",
        "fontStyle": "normal",
        "textAlign": "center",
        "lineHeight": 1.2,
        "letterSpacing": 2,
        "textDecoration": "none",
        "uppercase": true
      }
    },
    {
      "type": "shape",
      "x": 40,
      "y": 40,
      "width": ${canvasWidth - 80},
      "height": ${canvasHeight - 80},
      "rotation": 0,
      "zIndex": 0,
      "locked": false,
      "visible": true,
      "data": {
        "kind": "shape",
        "shapeType": "rounded-rect",
        "fill": "transparent",
        "stroke": "rgba(255,255,255,0.3)",
        "strokeWidth": 2,
        "opacity": 1
      }
    }
  ]
}`;

  const json = await callGemini(prompt, 0.8, 'graphics');
  const result = JSON.parse(json) as AIDesignResult;

  // Ensure background has required fields with sensible defaults
  result.background = {
    type: result.background?.type ?? 'gradient',
    color: result.background?.color ?? '#6366f1',
    gradientStart: result.background?.gradientStart ?? '#6366f1',
    gradientEnd: result.background?.gradientEnd ?? '#a855f7',
    gradientAngle: result.background?.gradientAngle ?? 135,
  };

  return result;
}

/**
 * Ask Gemini to rewrite / improve a text element's content.
 */
export async function improveTextWithAI(
  currentText: string,
  instruction: string,
  platform: string
): Promise<string> {
  const prompt = `You are a social media copywriter. Rewrite the following text for ${platform} based on the instruction.

Current text: "${currentText}"
Instruction: "${instruction}"

Rules:
- Keep it concise (under 100 characters for headlines, under 200 for body)
- Make it punchy, engaging, and platform-appropriate
- Return ONLY a JSON object: {"text": "the rewritten text"}`;

  const json = await callGemini(prompt, 0.9, 'writing');
  const result = JSON.parse(json) as { text: string };
  return result.text ?? currentText;
}

/* ─── Email reply drafting for the Conversations inbox ─── */
export interface ReplyContext {
  companyName: string;
  industry: string;
  description: string;
  products: string;
  tone: string;
  signature: string;
  knowledge: string;
  businessHours: string;
  website: string;
}

export interface DraftedReply {
  subject: string;
  body: string;         // plain text with line breaks
  confidence: number;   // 0-100 — how well the knowledge base covered the question
  needsHuman: boolean;  // true if the AI is unsure / requires a human
}

/**
 * Draft a reply to an incoming customer email, grounded in the mailbox's
 * company profile + knowledge base. Only claims facts present in the profile;
 * flags needsHuman when it can't answer confidently.
 */
export async function draftEmailReply(
  ctx: ReplyContext,
  email: { from: string; fromName: string; subject: string; body: string },
  extraInstruction = '',
): Promise<DraftedReply> {
  const prompt = `You are a customer support agent replying on behalf of a company. Write a reply to the customer's email below.

=== COMPANY PROFILE (the only source of truth about the company) ===
Company: ${ctx.companyName || '(unspecified)'}
Industry: ${ctx.industry || '(unspecified)'}
What we do: ${ctx.description || '(unspecified)'}
Products / services: ${ctx.products || '(unspecified)'}
Business hours: ${ctx.businessHours || '(unspecified)'}
Website: ${ctx.website || '(unspecified)'}
Knowledge base / FAQ / policies:
${ctx.knowledge || '(none provided)'}

=== STYLE ===
Tone: ${ctx.tone}. Keep it concise, warm and helpful. Address the customer by their first name if known. Do NOT invent facts, prices, features, or policies that are not in the company profile above — if the answer isn't covered, acknowledge the request and say a team member will follow up with specifics.
${extraInstruction ? `Extra instruction for THIS reply: ${extraInstruction}` : ''}
End the message with this exact signature block:
${ctx.signature || ctx.companyName || ''}

=== CUSTOMER EMAIL ===
From: ${email.fromName} <${email.from}>
Subject: ${email.subject}
Body:
${email.body}

Return ONLY valid JSON, no markdown fences:
{
  "subject": "Re: <original subject>",
  "body": "the full reply as plain text with \\n line breaks, including the signature",
  "confidence": <0-100: how well the company knowledge covered the customer's question>,
  "needsHuman": <true if you had to defer specifics to a human, else false>
}`;

  const json = await callGemini(prompt, 0.5, 'inbox-replies');
  const r = JSON.parse(json) as Partial<DraftedReply>;
  return {
    subject: r.subject || `Re: ${email.subject}`,
    body: r.body || '',
    confidence: typeof r.confidence === 'number' ? Math.max(0, Math.min(100, r.confidence)) : 60,
    needsHuman: !!r.needsHuman,
  };
}

/* ─── Review reply drafting for the Reputation module ─── */
export async function draftReviewReply(
  business: { name: string; category: string; description: string; tone: string; signature: string; knowledge: string },
  review: { author: string; rating: number; content: string; platform: string },
  extraInstruction = '',
): Promise<string> {
  const prompt = `You are the owner/manager of a business replying publicly to a customer review on ${review.platform}. Write a short, sincere public reply.

=== BUSINESS ===
Name: ${business.name || '(unspecified)'}
Category: ${business.category || '(unspecified)'}
About: ${business.description || '(unspecified)'}
Facts/policies you may reference: ${business.knowledge || '(none)'}

=== STYLE ===
Tone: ${business.tone}. 2-4 sentences. Address the reviewer by first name. Sound human, not templated.
- 4-5 stars: thank them specifically, reference something from their review, invite them back.
- 3 stars: thank them, acknowledge the mixed experience, show you want to improve.
- 1-2 stars: apologize sincerely, do NOT be defensive, take it offline (invite them to contact you), promise to make it right. Never argue or blame the customer.
Do not invent specifics not supported by the business facts above.
${extraInstruction ? `Extra instruction: ${extraInstruction}` : ''}
${business.signature ? `End with: ${business.signature}` : ''}

=== REVIEW ===
${review.author} · ${review.rating}★
"${review.content}"

Return ONLY JSON: {"reply": "the public reply text"}`;
  const json = await callGemini(prompt, 0.6, 'reputation');
  const r = JSON.parse(json) as { reply?: string };
  return r.reply || '';
}

