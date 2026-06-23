const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const BASE = 'https://generativelanguage.googleapis.com';

export function hasGeminiKey() {
  return !!API_KEY;
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
  clips: GeminiClip[];
}

/** Ask Gemini to analyse the video and return clip suggestions. */
export async function analyzeVideoWithGemini(
  fileUri: string,
  mimeType: string,
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

Rules:
- Clips must NOT overlap
- Each clip must be at most ${settings.maxClipDuration} seconds long
- Start and end times must be accurate to the actual video content
- Find between 6 and 12 clips
- viralityScore must be between 60 and 99

Return ONLY valid JSON with NO markdown fences:
{
  "videoSummary": "1-2 sentence summary of the video",
  "totalDuration": <total video length in seconds as a number>,
  "clips": [
    {
      "title": "engaging title under 70 chars",
      "startTime": <number, seconds>,
      "endTime": <number, seconds>,
      "transcript": "verbatim quote of what is said in this segment",
      "viralityScore": <number 60-99>,
      "focus": "emotional|educational|funny|motivational",
      "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4"],
      "reason": "one sentence: why this will go viral"
    }
  ]
}`;

  const body: Record<string, unknown> = {
    contents: [{
      parts: [
        { fileData: { mimeType, fileUri } },
        { text: prompt },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
    },
  };

  const res = await fetch(
    `${BASE}/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );

  if (!res.ok) throw new Error(`Gemini API error: ${await res.text()}`);
  const data = await res.json();

  if (data.error) throw new Error(data.error.message ?? 'Gemini error');

  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const json = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(json) as GeminiAnalysis;
}
