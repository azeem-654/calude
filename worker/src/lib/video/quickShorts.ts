/**
 * What Quick Shorts asks the model to do with a whole video.
 *
 * Written once and read by both sides: the Worker sends it with an uploaded
 * file (`quick_analyze` on routes/video.ts, the file handed to Google on the
 * pool's key), and the browser sends it with a YouTube link through
 * /api/ai.php. It used to live in src/lib/gemini.ts, which is why moving the
 * upload onto the server did not mean keeping two copies of the same prompt
 * that would drift apart.
 *
 * The answer is checked by `sanitizeAnalysis` (src/lib/gemini.ts) wherever it
 * lands — the model's timestamps are never trusted as given.
 */
export interface QuickShortsSettings { maxClipDuration: number; focus: string }

export const QUICK_FOCUS = ['emotional', 'educational', 'funny', 'all'] as const;

/** Clip length and focus as a request may name them, clamped to what the page offers. */
export function cleanQuickSettings(raw: unknown): QuickShortsSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { maxClipDuration?: unknown; focus?: unknown };
  const n = Math.round(Number(r.maxClipDuration));
  const focus = String(r.focus ?? '');
  return {
    maxClipDuration: Number.isFinite(n) ? Math.min(180, Math.max(15, n)) : 60,
    focus: (QUICK_FOCUS as readonly string[]).includes(focus) ? focus : 'all',
  };
}

export function quickShortsPrompt(settings: QuickShortsSettings): string {
  const focusHint = {
    emotional: 'Focus on emotionally resonant, personal, or inspiring moments.',
    educational: 'Focus on insightful, practical, or informative moments.',
    funny: 'Focus on humorous, entertaining, or surprising moments.',
    all: 'Find a diverse mix: emotional, educational, funny, and motivational moments.',
  }[settings.focus] ?? '';

  return `You are a viral short-form content expert. WATCH this video end-to-end, then identify the best ${settings.maxClipDuration}-second (or shorter) segments most likely to go viral on TikTok, YouTube Shorts, and Instagram Reels.

${focusHint}

STEP 1 — UNDERSTAND THE VIDEO FIRST (do this before choosing any clip):
Identify what this specific video is actually about: its topic, who is speaking, the main arguments/moments, and how it is structured over time. Every clip you return must come from what you ACTUALLY observed in this video — never from generic assumptions about the genre.

STEP 2 — PICK ONLY GENUINELY STRONG MOMENTS (relevance is the top priority):
A moment qualifies ONLY if it passes ALL of these:
- SELF-CONTAINED: a stranger who has not seen the video understands it completely without any prior context. No unexplained "he/she/it/that/this" referring to something said earlier.
- ONE COMPLETE IDEA: it sets up and finishes a single point, story, insight, question→answer, or reveal. Never a fragment of a longer argument.
- SUBSTANCE: it contains a real claim, story, number, insight, emotion, or punchline that someone would stop scrolling for.
- THE TITLE IS LITERALLY TRUE: the title must describe exactly what is said/shown in those seconds — not the video's overall theme.

NEVER select (these are the usual cause of irrelevant clips):
- Intros, outros, greetings, "welcome back", "don't forget to subscribe", channel promos, sponsor/ad reads
- Filler, rambling, throat-clearing, repeated restatements, dead air, long pauses
- Setup that never reaches its payoff, or a payoff whose setup is missing
- Anything that only makes sense if you watched the earlier part of the video
Quality beats quantity: if the video only contains 4 genuinely strong moments, return only those 4. Do NOT pad the list with weak filler to reach a count.

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
- TIMESTAMP ACCURACY IS CRITICAL: start/end times must correspond to the REAL moment in this video where those exact words are spoken. Before returning, re-check each timestamp against the video — a clip cut at the wrong time is worse than no clip. Spread selections across the whole video, not all from one region.
- Return between 4 and 10 clips, ordered best-first (highest quality first). Prefer 5-6 excellent clips over 10 mediocre ones.
- viralityScore must be between 60 and 99 and must honestly reflect quality — reserve 90+ for genuinely exceptional moments
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
}
