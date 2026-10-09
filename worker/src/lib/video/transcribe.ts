/**
 * Transcription — word timings, language and confidence, one audio piece
 * at a time.
 *
 * The provider is an adapter so it can be replaced; today there is one,
 * Workers AI's Whisper large-v3-turbo (`@cf/openai/whisper-large-v3-turbo`):
 * word-level timestamps, automatic language detection (English, Turkish and
 * Urdu among ~100), billed per audio minute on the Cloudflare account, and no
 * key to hold. It does not tell speakers apart — the studio says "speaker
 * labels need a provider" rather than inventing them.
 *
 * Confidence: Whisper gives a log-probability per segment, not per word; each
 * word carries its segment's, turned into 0–1. It is shown as a guide to
 * where to check, never as a promise of accuracy.
 *
 * The audio pieces come from the engine (about three minutes each, cut in a
 * pause), so a word is never split between two requests and a failure costs
 * one piece, not the whole recording.
 */
import type { Env } from '../db';
import type { Word } from './edit';

export const WHISPER = '@cf/openai/whisper-large-v3-turbo';

export type TranscriberMode = 'workers_ai' | 'none';
export const transcriberMode = (env: Env): TranscriberMode => ((env.WORKERS_AI_BASE ?? '').trim() || env.AI ? 'workers_ai' : 'none');

interface WhisperOut {
  text?: string;
  transcription_info?: { language?: string; language_probability?: number; duration?: number };
  segments?: { start?: number; end?: number; text?: string; avg_logprob?: number; words?: { word?: string; start?: number; end?: number }[] }[];
  words?: { word?: string; start?: number; end?: number }[];
}

async function runWhisper(env: Env, input: Record<string, unknown>): Promise<WhisperOut> {
  const base = (env.WORKERS_AI_BASE ?? '').trim();
  if (base) {
    const r = await fetch(`${base.replace(/\/$/, '')}/run/${WHISPER}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(90_000),
    });
    if (!r.ok) throw new Error(`transcriber answered ${r.status}`);
    const d = await r.json<{ result?: WhisperOut } & WhisperOut>();
    return d.result ?? d;
  }
  if (!env.AI) throw new Error('transcription is not configured');
  return (await env.AI.run(WHISPER, input)) as WhisperOut;
}

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export interface Piece { words: Omit<Word, 'i'>[]; language: string; text: string }

/**
 * One piece of audio. `offset` is where the piece starts in the recording;
 * the words come back on the recording's clock.
 */
export async function transcribePiece(env: Env, audio: ArrayBuffer, offset: number, language = ''): Promise<Piece> {
  const input: Record<string, unknown> = { audio: b64(audio), task: 'transcribe' };
  if (/^[a-z]{2}$/.test(language)) input.language = language;
  const out = await runWhisper(env, input);
  const words: Omit<Word, 'i'>[] = [];
  for (const seg of out.segments ?? []) {
    const c = typeof seg.avg_logprob === 'number' ? Math.round(Math.min(1, Math.max(0, Math.exp(seg.avg_logprob))) * 100) / 100 : undefined;
    for (const w of seg.words ?? []) {
      const text = String(w.word ?? '').trim();
      const s = Number(w.start), e = Number(w.end);
      if (!text || !Number.isFinite(s) || !Number.isFinite(e)) continue;
      words.push({ w: text, s: Math.round((offset + s) * 1000) / 1000, e: Math.round((offset + Math.max(e, s + 0.02)) * 1000) / 1000, ...(c !== undefined ? { c } : {}) });
    }
  }
  /* Some versions answer words at the top level only. */
  if (!words.length) {
    for (const w of out.words ?? []) {
      const text = String(w.word ?? '').trim();
      const s = Number(w.start), e = Number(w.end);
      if (text && Number.isFinite(s) && Number.isFinite(e)) words.push({ w: text, s: offset + s, e: offset + Math.max(e, s + 0.02) });
    }
  }
  return { words, language: String(out.transcription_info?.language ?? '').slice(0, 8), text: String(out.text ?? '') };
}
