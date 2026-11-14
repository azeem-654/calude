/**
 * Spoken words made readable: fillers, stammers and false starts out, the
 * meaning kept.
 *
 * The owner, 2026-11-14, after recording a voice message: "remove the filler
 * words after processing the voice recording, like yeah, so yeah, or right …
 * write clean words, whatever customer said". The Gemini transcriber is told
 * the same, but OpenAI and Cloudflare's Whisper write every "uh" down, and
 * which one answered depends on whose quota is left — so the text is cleaned
 * here, after any of them, the same way. Pure, no imports: the Worker
 * (routes/intake.ts) and the browser (useVoiceInput, live captions in
 * protron/intake.ts) share it.
 *
 * Conservative on purpose: a word that can carry meaning ("like" in "I'd
 * like", "right" in "the right customers", "so" in "so that") is only
 * dropped where it cannot — between commas, or opening a sentence. Losing a
 * customer's real word costs more than leaving a filler in.
 */

/** Sounds that never carry meaning, anywhere. */
const FILLER = /\b(?:u+h+m*|u+m+|e+r+m+|e+r+h*|a+h+|h+m+|m+h*m+|uh-huh)\b[,.]?\s*/gi;
/** Phrases that are filler only when set off by a comma ("you know our prices" keeps its words). */
const PHRASE = /\b(?:you know what i mean|you know|i mean)\s*,\s*/gi;

/** Openers that are filler at the start of a sentence ("Yeah, so, I want…"). */
const OPENER = /(^|[.!?]\s+)(?:(?:yeah|yes|yep|okay|ok|so|well|right|oh|alright|all right|basically|actually|like|anyway)\b\s*[,.]?\s+)+(?=\S)/gi;

/** Trailing tags ("…a day, right?", "…for us, you see."). */
const TAG = /,\s*(?:right|you see|okay|yeah|so yeah|or whatever)\s*[.!?]*(?=\s+[A-Z]|\s*$)/g;

export function tidySpoken(t: string): string {
  /* A tag is not the question: "…a day, right? We…" ends at "day." First,
     while the next sentence still starts with its capital. */
  let s = ` ${String(t ?? '')} `.replace(TAG, '.');
  s = s.replace(FILLER, ' ').replace(PHRASE, ' ');
  s = s.replace(/\b(?:so yeah|yeah so|and yeah)\b,?\s*/gi, ' ');
  s = s.replace(/,\s*like,\s*/gi, ', ');
  s = s.replace(/\s+([,.!?])/g, '$1').replace(/([,.!?])(?:\s*[,.])+/g, '$1').replace(/\s{2,}/g, ' ').trim();
  s = s.replace(OPENER, '$1');
  /* Stammered repeats: "I I want", "the the". */
  s = s.replace(/\b(\w+)(?:\s+\1\b)+/gi, '$1');
  s = s.replace(/\s+([,.!?])/g, '$1').replace(/[,;:]\s*([.!?])/g, '$1').replace(/([,.!?])(?:\s*[,.])+/g, '$1').replace(/\s{2,}/g, ' ').replace(/^[\s,.;:—–-]+/, '').trim();
  s = s.replace(/[,;:]$/, '.');
  /* Each sentence starts with a capital, once the opener before it is gone. */
  s = s.replace(/(^|[.!?]\s+)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
  return s;
}
