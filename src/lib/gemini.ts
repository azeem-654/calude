const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const BASE = 'https://generativelanguage.googleapis.com';

export function hasGeminiKey() {
  return !!API_KEY;
}

/** Transient errors worth retrying: rate limit, or Google's servers being overloaded. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/** Turn Gemini's verbose JSON error bodies into a short, human-readable message. */
function friendlyGeminiError(status: number, raw: string): string {
  let msg = raw;
  try { msg = (JSON.parse(raw) as { error?: { message?: string } })?.error?.message || raw; } catch { /* raw isn't JSON */ }
  if (status === 429) {
    return "Gemini quota/rate limit reached (429). This API key's free-tier quota is exhausted or not enabled for these models. Wait a minute and retry, enable billing on the key, or generate sample clips instead.";
  }
  if (status === 403) return 'Gemini rejected the API key (403). Check the key is valid and the Generative Language API is enabled for its project.';
  if (status === 400 && /Unsupported MIME type/i.test(msg)) {
    return "The AI model couldn't read this video source. For YouTube links this can happen on some models — try downloading the video and uploading the file directly.";
  }
  // Trim overly long messages so the UI stays readable.
  const short = msg.length > 300 ? msg.slice(0, 300) + '…' : msg;
  return `Gemini API error (${status}): ${short}`;
}

interface GeminiResponse {
  error?: { message?: string };
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/**
 * POSTs a generateContent body against each model in `models`, retrying transient
 * failures (429/500/502/503/504) with backoff before falling through to the next
 * model. Non-transient errors (bad request, permission, etc.) throw immediately.
 */
async function postGeminiWithFallback(
  models: string[],
  body: unknown,
  fallThroughOnBadRequest = false,
): Promise<GeminiResponse> {
  let lastError = '';
  let lastStatus = 0;
  for (const model of models) {
    const attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const res = await fetch(
        `${BASE}/v1beta/models/${model}:generateContent?key=${API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      if (res.ok) return await res.json();

      lastError = await res.text().catch(() => `HTTP ${res.status}`);
      lastStatus = res.status;
      if (!RETRYABLE_STATUS.has(res.status)) {
        // Non-transient (e.g. 400 bad request). Some models don't support a
        // given input (e.g. flash-lite can't ingest a YouTube URL and returns
        // a text/html MIME error) — when asked, fall through to the next model
        // instead of failing the whole request.
        if (fallThroughOnBadRequest) break;
        throw new Error(friendlyGeminiError(res.status, lastError));
      }
      if (attempt < attempts) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
    // Exhausted retries / unsupported input for this model — try the next one.
  }
  throw new Error(friendlyGeminiError(lastStatus, lastError || 'all models failed'));
}

/** Upload a video file to Gemini File API, returns the file URI. */
export async function uploadFileToGemini(file: File): Promise<string> {
  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify({ file: { display_name: file.name } })], { type: 'application/json' })
  );
  form.append('file', file, file.name);

  const res = await fetch(
    `${BASE}/upload/v1beta/files?uploadType=multipart&key=${API_KEY}`,
    { method: 'POST', body: form }
  );

  if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`);
  const data = await res.json();
  return data.file.uri as string;
}

/** Poll until the file reaches ACTIVE state (Gemini processes it async). */
export async function waitForFileActive(fileUri: string, maxWaitMs = 120_000): Promise<void> {
  const name = fileUri.split('/').pop();
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${BASE}/v1beta/files/${name}?key=${API_KEY}`);
    const data = await res.json();
    if (data.state === 'ACTIVE') return;
    if (data.state === 'FAILED') throw new Error('Gemini file processing failed');
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error('File processing timed out');
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
 * Ask Gemini to analyse the video and return clip suggestions.
 * Pass mimeType=null for YouTube URLs — Gemini's YouTube understanding feature
 * rejects the request if a mimeType is attached to a youtube.com file_uri.
 */
export async function analyzeVideoWithGemini(
  fileUri: string,
  mimeType: string | null,
  settings: { maxClipDuration: number; focus: string }
): Promise<GeminiAnalysis> {
  const focusHint = {
    emotional: 'Focus on emotionally resonant, personal, or inspiring moments.',
    educational: 'Focus on insightful, practical, or informative moments.',
    funny: 'Focus on humorous, entertaining, or surprising moments.',
    all: 'Find a diverse mix: emotional, educational, funny, and motivational moments.',
  }[settings.focus] ?? '';

  const prompt = `You are a viral short-form content expert. Analyze this video and identify the best ${settings.maxClipDuration}-second (or shorter) segments most likely to go viral on TikTok, YouTube Shorts, and Instagram Reels.

${focusHint}

Language handling:
- First detect the video's primary spoken language and report its full English name in "videoLanguage" (e.g. "English", "Turkish", "Arabic", "Spanish").
- Write each clip's "title", "description", and "transcript" in that SAME original spoken language of the video — do not translate them to English.
- If the detected language is NOT English, ALSO provide "titleTranslated" and "descriptionTranslated" fields with accurate English translations of the title and description. If the video IS English, omit "titleTranslated" and "descriptionTranslated" entirely (do not repeat the same text).

Videos with little or no speech (CCTV footage, montages, music videos, b-roll):
- Analyze the VISUAL content instead: what happens on screen, the setting, the key action, and why it grabs attention.
- "title" and "description" must describe the actual visual events and the video's purpose (e.g. a security-awareness caption for CCTV robbery footage) — never generic filler.
- Set "transcript" to a short, punchy present-tense narration of the on-screen action (e.g. "A man snatches a phone and sprints across the street as bystanders give chase"). NEVER return placeholders like "(No spoken content)", "(no dialogue)", or empty text — these get burned into the clip as captions.
- Set "videoLanguage" to "English" for speech-free videos.

Rules:
- Clips must NOT overlap
- Each clip should use most of the ${settings.maxClipDuration}-second budget (longer, complete clips beat short ones) but never exceed it
- Start and end times must be accurate to the actual video content
- Find between 6 and 12 clips
- viralityScore must be between 60 and 99
- "description" should be a short, engaging 2-3 sentence caption suitable for a social media post (not just a repeat of the transcript)

CRITICAL — build each clip as a coherent short that fully delivers on its title, with CLEAN cuts:
- Give each clip a "segments" array of 1 to 3 NON-OVERLAPPING ranges that, played in order, form ONE coherent short that completely delivers the promise in the title (hook → point → payoff).
- STRONGLY PREFER FEWER, LONGER, COMPLETE segments. Often the BEST clip is a SINGLE continuous passage where the speaker makes a full, self-contained point — use 1 segment when the point is delivered in one place. Only add a 2nd or 3rd segment when it genuinely completes the story (e.g. the setup is in one place and the payoff in another). Never chop a coherent passage into pieces.
- SENTENCE BOUNDARIES ARE MANDATORY: every segment MUST begin exactly at the START of a spoken sentence (right after a natural pause/breath) and MUST end exactly at the END of a completed sentence (at a natural pause). NEVER cut in the middle of a word or sentence — the viewer must hear complete sentences with no clipped words and no dangling half-thoughts.
- When there are multiple segments, the end of one must flow logically into the start of the next — no jarring non-sequitur.
- Aim to USE THE FULL LENGTH BUDGET: make the combined length close to (but not over) ${settings.maxClipDuration} seconds so the short has enough context to make sense — do not return tiny 8-second clips when the budget is larger.
- For EACH segment, include a "text" field: the EXACT complete sentence(s) spoken during that segment, verbatim, in the video's original language. The time range must tightly bracket exactly those sentences.
- Each segment at least 6 seconds (unless the whole clip is shorter); combined length between ${Math.max(15, settings.maxClipDuration - 20)} and ${settings.maxClipDuration} seconds. Every segment must be directly relevant to the title — no filler.
- "startTime"/"endTime" span the earliest segment start to the latest segment end.
- "transcript" = the concatenation of every segment's "text", in play order.

Return ONLY valid JSON with NO markdown fences:
{
  "videoSummary": "1-2 sentence summary of the video, in English",
  "totalDuration": <total video length in seconds as a number>,
  "videoLanguage": "full English name of the video's primary spoken language",
  "clips": [
    {
      "title": "engaging title under 70 chars, in the video's original language",
      "titleTranslated": "English translation of title — OMIT this field entirely if videoLanguage is English",
      "description": "engaging 2-3 sentence social caption, in the video's original language",
      "descriptionTranslated": "English translation of description — OMIT this field entirely if videoLanguage is English",
      "startTime": <number, seconds — earliest segment start>,
      "endTime": <number, seconds — latest segment end>,
      "segments": [{"start": <seconds>, "end": <seconds>, "text": "the exact COMPLETE sentence(s) spoken in this segment"}, {"start": <seconds>, "end": <seconds>, "text": "..."}],
      "transcript": "concatenation of every segment's text, in play order, in the video's original language",
      "viralityScore": <number 60-99>,
      "focus": "emotional|educational|funny|motivational",
      "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4"],
      "reason": "one sentence in English: why this will go viral"
    }
  ]
}`;

  const body: Record<string, unknown> = {
    contents: [{
      parts: [
        { fileData: mimeType ? { mimeType, fileUri } : { fileUri } },
        { text: prompt },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
    },
  };

  // YouTube URLs (mimeType === null) require native YouTube-video understanding,
  // which flash-lite lacks — it fetches the watch page and returns a text/html
  // MIME error. Use the models that support YouTube ingestion for that path.
  const isYouTube = mimeType === null;
  const MODELS = isYouTube
    ? ['gemini-2.5-flash', 'gemini-2.0-flash']
    : ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-flash'];

  const data = await postGeminiWithFallback(MODELS, body, isYouTube);
  if (data.error) throw new Error(data.error.message ?? 'Gemini error');
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const json = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(json) as GeminiAnalysis;
}

/** Shared helper: call Gemini text models with fallback chain. */
async function callGemini(prompt: string, temperature = 0.7): Promise<string> {
  const MODELS = ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-flash'];
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature },
  };
  const data = await postGeminiWithFallback(MODELS, body);
  if (data.error) throw new Error(data.error.message ?? 'Gemini error');
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
}

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
  const json = await callGemini(prompt, 0.9);
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
  const json = await callGemini(prompt, 0.3);
  const r = JSON.parse(json) as { title?: string; description?: string; captions?: string[] };
  if (!Array.isArray(r.captions) || r.captions.length === 0) throw new Error('Translation returned no captions.');
  return { title: r.title || clip.title, description: r.description || clip.description, captions: r.captions };
}

/** AI Image B-Roll: suggest visual cutaway keywords matched to the clip's content. */
export async function suggestBroll(transcript: string): Promise<{ keyword: string; title: string }[]> {
  const prompt = `Suggest 4 stock-image B-roll cutaways for this short video clip. Each needs a simple 1-2 word image search keyword (lowercase, generic objects/scenes like "city", "handshake", "money", "gym") and a short display title.

Clip content: "${transcript.slice(0, 500)}"

Return ONLY JSON: {"broll": [{"keyword": "city", "title": "City skyline"}, ...]}`;
  const json = await callGemini(prompt, 0.6);
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
  const json = await callGemini(prompt, 0.8);
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
  const json = await callGemini(prompt, 0.7);
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
  const json = await callGemini(prompt, 0.75);
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
  const json = await callGemini(prompt, 0.8);
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

  const json = await callGemini(prompt, 0.8);
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

  const json = await callGemini(prompt, 0.9);
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

  const json = await callGemini(prompt, 0.5);
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
  const json = await callGemini(prompt, 0.6);
  const r = JSON.parse(json) as { reply?: string };
  return r.reply || '';
}

