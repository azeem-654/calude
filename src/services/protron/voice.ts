/**
 * Protron's voice out: reading a reply aloud.
 *
 * ── One voice ──
 *
 * warm: the server's speech model with the same prebuilt voice as live talk
 *   (Achird, routes/protron.ts VOICES), played exactly as it arrives — no
 *   filter. An analyser on the output drives the face's mouth.
 * natural: the browser's own speech engine, only when chosen in the menu.
 *
 * The robot "commander" voice and the pitched-down browser fallback were
 * removed on 2026-11-13: the owner heard the friendly voice turn into a heavy
 * robot one mid-conversation, with a buzz at the end, and asked for one bot.
 * So when the AI voice cannot speak (no Google key, an allowance, a busy
 * model, sound blocked), the reply is not read in another voice: it stays on
 * screen and `VOICE_PROBLEM_EVENT` tells the panel why.
 *
 * ── Turn by turn, with barge-in ──
 *
 * The customer speaks, the take is transcribed (Autopilot/voice/useVoiceInput),
 * Protron answers, the answer is spoken; in Talk mode the microphone reopens
 * and talking over Protron stops it (ProtronPanel's barge-in). A realtime
 * speech-to-speech session (OpenAI Realtime, Gemini Live) would cut the pause
 * between turns further; it needs a provider key and a server-minted
 * ephemeral token, and would plug in behind the `Speaker` seam below.
 */
import { fetchNarration, fetchSpeech, type SpeechResult } from './sync';
import { emitVoiceLevel as emit, onVoiceLevel } from './level';
import type { Voice } from './memory';

export { onVoiceLevel };

export interface Speaker {
  readonly name: string;
  supported(): boolean;
  /** Speaks the text; resolves when it finishes or is stopped. `onStart` fires at the first sound. */
  speak(text: string, onStart?: () => void): Promise<void>;
  stop(): void;
  speaking(): boolean;
}

/** Markdown and links read badly aloud: plain words only. */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+/g, 'the link')
    .replace(/[*_#`>]+/g, '')
    .replace(/→/g, ', then ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900);
}

function pickVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const lang = (navigator.language || 'en-US').toLowerCase();
  const voices = synth.getVoices();
  const same = voices.filter(v => v.lang.toLowerCase() === lang);
  const family = voices.filter(v => v.lang.toLowerCase().startsWith(lang.slice(0, 2)));
  /* The networked "Google"/"Natural" voices sound far less robotic where the browser has them. */
  const good = (list: SpeechSynthesisVoice[]) => list.find(v => /natural|google|neural|premium|enhanced/i.test(v.name)) ?? list[0];
  return good(same) ?? good(family) ?? null;
}

export const browserSpeaker: Speaker = {
  name: 'Browser voice',
  supported: () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined',
  speaking: () => typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking,
  stop: () => { try { window.speechSynthesis.cancel(); } catch { /* nothing playing */ } },
  speak(text: string, onStart?: () => void): Promise<void> {
    return new Promise(resolve => {
      if (!this.supported()) { resolve(); return; }
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(speakable(text));
      const v = pickVoice(synth);
      if (v) { u.voice = v; u.lang = v.lang; }
      u.rate = 1.03;
      u.pitch = 1;
      /* The browser gives no audio to measure, only word boundaries: each
         word opens the mouth and lets it fall — tied to real speech, not a timer. */
      u.onstart = () => onStart?.();
      u.onboundary = () => { emit(0.7); window.setTimeout(() => emit(0.15), 140); };
      u.onend = () => { emit(0); resolve(); };
      u.onerror = () => { emit(0); resolve(); };
      synth.speak(u);
    });
  },
};

/* ── The browser's deepest voice ── */

/* ── Protron's voice ── */

let audio: AudioContext | null = null;
let playing: { src: AudioBufferSourceNode; done: () => void } | null = null;
let fetching: AbortController | null = null;
let serverVoice: 'unknown' | 'yes' | 'no' = 'unknown';

/** Measures what is playing and hands the loudness to the face; returns the stopper. */
function meterLoop(meter: AnalyserNode, gain: number): () => void {
  const data = new Uint8Array(meter.fftSize);
  let raf = 0;
  const tick = () => {
    meter.getByteTimeDomainData(data);
    let sum = 0;
    for (const d of data) { const x = (d - 128) / 128; sum += x * x; }
    emit(Math.min(1, Math.sqrt(sum / data.length) * gain));
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

/** Plays the PCM as it is, gently compressed, for the warm voice. */
function playClean(ctx: AudioContext, buffer: AudioBuffer): Promise<void> {
  return new Promise(resolve => {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 2.5;
    const meter = ctx.createAnalyser(); meter.fftSize = 512;
    src.connect(comp); comp.connect(meter); meter.connect(ctx.destination);
    let finished = false;
    const stopMeter = meterLoop(meter, 3.6);
    const done = () => {
      if (finished) return;
      finished = true;
      stopMeter();
      window.clearTimeout(guard);
      emit(0);
      playing = null;
      resolve();
    };
    const guard = window.setTimeout(done, buffer.duration * 1000 + 1500);
    src.onended = done;
    playing = { src, done };
    src.start();
  });
}

/** Call from a click or key press: browsers only let sound start from one. */
export function unlockAudio(): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    audio ??= new AC();
    if (audio.state === 'suspended') void audio.resume();
  } catch { /* no Web Audio: the browser voice is used */ }
}

function pcmToBuffer(ctx: AudioContext, b64: string, rate: number): AudioBuffer {
  const bin = atob(b64);
  const n = Math.floor(bin.length / 2);
  const buf = ctx.createBuffer(1, Math.max(1, n), rate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    let v = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8);
    if (v >= 0x8000) v -= 0x10000;
    ch[i] = v / 0x8000;
  }
  return buf;
}

/** Said to the panel when the AI voice could not speak a reply (and why). */
export const VOICE_PROBLEM_EVENT = 'pc-protron-voice-problem';
const problem = (why: string) => { try { window.dispatchEvent(new CustomEvent(VOICE_PROBLEM_EVENT, { detail: why })); } catch { /* no window */ } };

/**
 * Protron's voice: the server speaks it, this browser plays it clean. When it
 * cannot, nothing else speaks instead — the panel is told why — and it stops
 * asking for the page's life when the answer was "there is no voice here".
 */
function aiSpeaker(): Speaker {
  return {
    name: 'Protron voice',
    supported: () => typeof window !== 'undefined' && 'AudioContext' in window,
    speaking: () => !!playing || !!fetching,
    stop: () => {
      fetching?.abort(); fetching = null;
      if (playing) { try { playing.src.stop(); } catch { /* ended */ } playing.done(); }
      emit(0);
    },
    async speak(text: string, onStart?: () => void): Promise<void> {
      this.stop();
      const words = speakable(text);
      if (!words) return;
      unlockAudio();
      if (serverVoice === 'no' || !audio) { problem('Protron’s voice is not available here, so replies are shown on screen.'); return; }
      const ctl = new AbortController();
      fetching = ctl;
      const r = await fetchSpeech(words, ctl.signal);
      if (fetching !== ctl) return; // stopped while it was being made
      fetching = null;
      if (r.ok) {
        serverVoice = 'yes';
        if (audio.state === 'suspended') await audio.resume().catch(() => undefined);
        if (audio.state === 'running') {
          onStart?.();
          await playClean(audio, pcmToBuffer(audio, r.pcm, r.rate));
          return;
        }
        problem('Your browser kept the sound off — press anywhere in the page, then ask again.');
        return;
      }
      if (['no_voice', 'no_ai', 'trial_ended'].includes(r.code)) serverVoice = 'no';
      problem('Protron’s voice could not answer just now, so this reply is shown on screen.');
    },
  };
}

export const warmSpeaker: Speaker = aiSpeaker();

/** Everything that can make a sound stops. */
export function stopAllVoices(): void { warmSpeaker.stop(); browserSpeaker.stop(); }

export const speakerFor = (voice: Voice): Speaker => (voice === 'natural' ? browserSpeaker : warmSpeaker);

/* ── The dashboard film's narrator ──
 *
 * The owner: the film's voice must be "exactly like the live bot's voice".
 * So it is Protron's warm AI voice (the same prebuilt voice the live session
 * uses), never the browser's own — when the AI voice is not available the
 * film stays silent with captions and says so, rather than reading in a
 * voice the owner called odd. Lines are fetched ahead (`prepare`) so one
 * follows the last without a gap, and kept for the page's life.
 */
const lines = new Map<string, Promise<SpeechResult | null>>();
let narrating: { src: AudioBufferSourceNode } | null = null;

export const narrator = {
  /** Starts fetching a line so it is ready when its scene comes. */
  prepare(text: string): Promise<SpeechResult | null> {
    let p = lines.get(text);
    if (!p) {
      p = fetchNarration(text).catch(() => null);
      lines.set(text, p);
      /* A refusal is not kept: the next play asks again. */
      void p.then(r => { if (!r?.ok) lines.delete(text); });
    }
    return p;
  },
  /** Speaks one line; resolves with '' once it has finished (or was stopped), else why it could not. */
  async say(text: string): Promise<string> {
    narrator.stop();
    unlockAudio();
    const r = await narrator.prepare(text);
    if (!r) return 'The narrator could not be reached.';
    if (!r.ok) return r.error;
    if (!audio) return 'This browser cannot play the narrator.';
    if (audio.state === 'suspended') await audio.resume().catch(() => undefined);
    if (audio.state !== 'running') return 'Press play again to hear the narrator.';
    const ctx = audio;
    const buf = pcmToBuffer(ctx, r.pcm, r.rate);
    await new Promise<void>(resolve => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      narrating = { src };
      src.onended = () => { if (narrating?.src === src) narrating = null; resolve(); };
      src.start();
    });
    return '';
  },
  stop(): void {
    if (narrating) { try { narrating.src.stop(); } catch { /* ended */ } narrating = null; }
  },
};
