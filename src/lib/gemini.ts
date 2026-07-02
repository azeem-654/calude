const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const BASE = 'https://generativelanguage.googleapis.com';

export function hasGeminiKey() {
  return !!API_KEY;
}

/** Transient errors worth retrying: rate limit, or Google's servers being overloaded. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

interface GeminiResponse {
  error?: { message?: string };
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/**
 * POSTs a generateContent body against each model in `models`, retrying transient
 * failures (429/500/502/503/504) with backoff before falling through to the next
 * model. Non-transient errors (bad request, permission, etc.) throw immediately.
 */
async function postGeminiWithFallback(models: string[], body: unknown): Promise<GeminiResponse> {
  let lastError = '';
  for (const model of models) {
    const attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const res = await fetch(
        `${BASE}/v1beta/models/${model}:generateContent?key=${API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      if (res.ok) return await res.json();

      lastError = await res.text().catch(() => `HTTP ${res.status}`);
      if (!RETRYABLE_STATUS.has(res.status)) {
        // Non-transient (e.g. 400 bad request) — retrying won't help, fail now.
        throw new Error(`Gemini API error (${res.status}): ${lastError}`);
      }
      if (attempt < attempts) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
    // Exhausted retries for this model — fall through to the next one.
  }
  throw new Error(`All Gemini models are temporarily unavailable after retries. ${lastError}`);
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

Rules:
- Clips must NOT overlap
- Each clip must be at most ${settings.maxClipDuration} seconds long
- Start and end times must be accurate to the actual video content
- Find between 6 and 12 clips
- viralityScore must be between 60 and 99
- "description" should be a short, engaging 2-3 sentence caption suitable for a social media post (not just a repeat of the transcript)

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
      "startTime": <number, seconds>,
      "endTime": <number, seconds>,
      "transcript": "verbatim quote of what is said in this segment, in the video's original language",
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

  const MODELS = [
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.5-flash',
  ];

  const data = await postGeminiWithFallback(MODELS, body);
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

